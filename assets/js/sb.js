// Minimal Supabase client (auth + REST + storage) built on fetch.
//
// Deliberately dependency-free: the site is plain static files on Vercel, so
// there is no build step and nothing to install. Only the handful of endpoints
// this project actually uses are implemented.

import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const SESSION_STORE = 'kt_supabase_session';

let session = readStoredSession();

function readStoredSession() {
  try {
    const raw = localStorage.getItem(SESSION_STORE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSession(next) {
  session = next;
  try {
    if (next) localStorage.setItem(SESSION_STORE, JSON.stringify(next));
    else localStorage.removeItem(SESSION_STORE);
  } catch {
    /* private browsing — session just won't survive a reload */
  }
}

function shapeSession(payload) {
  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    // Refresh a minute early so an in-flight upload doesn't die mid-request.
    expires_at: Date.now() + (payload.expires_in || 3600) * 1000 - 60_000,
    user: payload.user || null,
  };
}

async function parseError(res) {
  let detail = '';
  try {
    const body = await res.json();
    detail = body.message || body.error_description || body.msg || body.error || body.hint || '';
  } catch {
    detail = await res.text().catch(() => '');
  }
  const err = new Error(detail || `Request failed (${res.status})`);
  err.status = res.status;
  return err;
}

/* ---------------------------------------------------------------- auth --- */

export function currentSession() {
  return session;
}

export function currentUser() {
  return session?.user || null;
}

export async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw await parseError(res);
  writeSession(shapeSession(await res.json()));
  return session;
}

async function refreshSession() {
  if (!session?.refresh_token) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  if (!res.ok) {
    writeSession(null);
    return null;
  }
  writeSession(shapeSession(await res.json()));
  return session;
}

export async function signOut() {
  const token = session?.access_token;
  writeSession(null);
  if (!token) return;
  await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
  }).catch(() => {});
}

// Returns a usable access token, refreshing first if it is about to expire.
async function accessToken() {
  if (!session) return null;
  if (Date.now() >= session.expires_at) await refreshSession();
  return session?.access_token || null;
}

/* ---------------------------------------------------------------- rest --- */

async function request(path, { method = 'GET', body, prefer, signal } = {}) {
  const send = async (token) => {
    const headers = {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${token || SUPABASE_KEY}`,
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (prefer) headers.Prefer = prefer;
    return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  };

  let token = await accessToken();
  let res = await send(token);

  // An expired token that slipped past the clock check: refresh once, retry.
  if (res.status === 401 && session) {
    token = (await refreshSession())?.access_token;
    if (token) res = await send(token);
  }

  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export const db = {
  select: (table, query = '') => request(`${table}${query ? `?${query}` : ''}`),
  insert: (table, rows) =>
    request(table, { method: 'POST', body: rows, prefer: 'return=representation' }),
  update: (table, query, patch) =>
    request(`${table}?${query}`, { method: 'PATCH', body: patch, prefer: 'return=representation' }),
  remove: (table, query) => request(`${table}?${query}`, { method: 'DELETE' }),
};

/* ------------------------------------------------------------- storage --- */

export function publicUrl(bucket, path) {
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}

// Upload with progress. XHR rather than fetch, because fetch still cannot
// report upload progress and video files are large enough to need a bar.
export async function upload(bucket, path, file, onProgress) {
  const token = await accessToken();
  if (!token) throw new Error('You are signed out. Sign in again to upload.');

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${SUPABASE_URL}/storage/v1/object/${bucket}/${encodeURI(path)}`);
    xhr.setRequestHeader('apikey', SUPABASE_KEY);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('x-upsert', 'true');
    if (file.type) xhr.setRequestHeader('Content-Type', file.type);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ path, url: publicUrl(bucket, path) });
        return;
      }
      let message = `Upload failed (${xhr.status})`;
      try {
        const body = JSON.parse(xhr.responseText);
        message = body.message || body.error || message;
      } catch {
        /* keep the status-code message */
      }
      if (xhr.status === 413) {
        message = 'File is larger than the storage upload limit for this project.';
      }
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error('Network error during upload.'));
    xhr.send(file);
  });
}

export async function removeObject(bucket, path) {
  if (!path) return;
  const token = await accessToken();
  await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${encodeURI(path)}`, {
    method: 'DELETE',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token || SUPABASE_KEY}` },
  }).catch(() => {});
}
