// Admin panel: sign in, fill each portfolio cell with a video, manage logos.

import {
  db, upload, removeObject, signIn, signOut, currentSession, currentUser,
} from './sb.js';
import { CATEGORIES, VIDEO_BUCKET, IMAGE_BUCKET, SITE_FIELDS } from './config.js';
import { parseMedia, looksLikeVideoFile, brandKey, groupByBrand } from './media.js';

const VIDEO_MAX = 50 * 1024 * 1024;   // matches the bucket limit in schema.sql
const IMAGE_MAX = 10 * 1024 * 1024;

const state = { projects: [], logos: [], content: new Map(), isAdmin: false };

const $ = (sel, root = document) => root.querySelector(sel);

/* ------------------------------------------------------------- helpers --- */

function toast(message, isError = false) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const el = document.createElement('div');
  el.className = isError ? 'toast error' : 'toast';
  el.textContent = message;
  el.setAttribute('role', 'status');
  document.body.append(el);
  setTimeout(() => el.remove(), isError ? 6000 : 2600);
}

function safeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '').slice(-60);
}

function fileLabel(url) {
  if (!url) return '';
  try {
    return decodeURIComponent(new URL(url, location.origin).pathname.split('/').pop());
  } catch {
    return url;
  }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// A labelled file picker that looks like a button.
function filePicker(label, accept, onPick) {
  const wrap = el('span', 'btn ghost tiny file-btn', label);
  const input = el('input');
  input.type = 'file';
  input.accept = accept;
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.value = '';
    if (file) onPick(file);
  });
  wrap.append(input);
  return wrap;
}

async function guard(node, task) {
  node.classList.add('is-busy');
  try {
    return await task();
  } catch (err) {
    toast(err.message || 'Something went wrong.', true);
    throw err;
  } finally {
    node.classList.remove('is-busy');
  }
}

/* ---------------------------------------------------------------- login --- */

const loginScreen = $('#login-screen');
const app = $('#app');

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#login-msg');
  const btn = $('#login-submit');
  msg.hidden = true;
  btn.disabled = true;
  btn.textContent = 'Signing in…';
  try {
    await signIn($('#login-email').value.trim(), $('#login-password').value);
    await start();
  } catch (err) {
    msg.textContent = err.message || 'Could not sign in.';
    msg.className = 'msg error';
    msg.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign in';
  }
});

$('#sign-out').addEventListener('click', async () => {
  await signOut();
  location.reload();
});

/* ----------------------------------------------------------------- tabs --- */

const tabs = [
  { tab: $('#tab-videos'), panel: $('#panel-videos') },
  { tab: $('#tab-logos'), panel: $('#panel-logos') },
  { tab: $('#tab-content'), panel: $('#panel-content') },
];
tabs.forEach(({ tab }, i) => {
  tab.addEventListener('click', () => {
    tabs.forEach(({ tab: t, panel }, j) => {
      t.setAttribute('aria-selected', String(i === j));
      panel.hidden = i !== j;
    });
  });
});

/* ------------------------------------------------------------- projects --- */

function projectsIn(slug) {
  return state.projects
    .filter((p) => p.category === slug)
    .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
}

async function patchProject(project, fields) {
  const [updated] = await db.update('projects', `id=eq.${project.id}`, fields);
  Object.assign(project, updated);
  return project;
}

function buildThumb(project) {
  const thumb = el('div', 'thumb');
  const media = parseMedia(project.video_url);

  if (project.poster_url) {
    const img = el('img');
    img.src = project.poster_url;
    img.alt = '';
    thumb.append(img);
    thumb.classList.add('filled');
  } else if (media?.kind === 'file') {
    const video = el('video');
    video.src = `${media.src}#t=0.1`;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    thumb.append(video);
    thumb.classList.add('filled');
  } else if (media) {
    // An embed has no frame we can grab, so say what it is instead.
    thumb.append(el('span', null, `${media.provider} post`));
  } else {
    thumb.append(el('span', null, 'No video yet'));
  }
  return thumb;
}

// One media slot (video or poster) with upload, link and clear controls.
function buildMediaRow(project, kind, row) {
  const isVideo = kind === 'video';
  const urlKey = isVideo ? 'video_url' : 'poster_url';
  const pathKey = isVideo ? 'video_path' : 'poster_path';
  const bucket = isVideo ? VIDEO_BUCKET : IMAGE_BUCKET;
  const limit = isVideo ? VIDEO_MAX : IMAGE_MAX;

  const wrap = el('div', 'media-row');
  wrap.append(el('span', 'label', isVideo ? 'Video' : 'Poster'));

  const status = el('span', 'state');
  const paint = () => {
    const url = project[urlKey];
    status.classList.remove('set', 'warn');

    if (!url) {
      status.textContent = isVideo ? 'Empty cell' : 'Optional still frame';
      return;
    }
    const media = isVideo ? parseMedia(url) : null;
    if (media?.kind === 'embed') {
      status.textContent = `${media.provider} post — plays as an embed`;
      status.classList.add('set');
    } else if (isVideo && !project[pathKey] && !looksLikeVideoFile(url)) {
      // Neither an upload, a known provider, nor something ending in .mp4.
      status.textContent = `${fileLabel(url)} — this link is not a video file, so it will not play`;
      status.classList.add('warn');
    } else {
      status.textContent = fileLabel(url);
      status.classList.add('set');
    }
  };
  paint();
  wrap.append(status);

  const bar = el('div', 'bar');
  const fill = el('i');
  bar.append(fill);
  bar.hidden = true;

  const refresh = () => {
    paint();
    const fresh = buildRow(project);
    row.replaceWith(fresh);
  };

  const picker = filePicker(
    project[urlKey] ? 'Replace' : 'Upload',
    isVideo ? 'video/mp4,video/quicktime,video/webm' : 'image/png,image/jpeg,image/webp,image/avif',
    async (file) => {
      if (file.size > limit) {
        toast(
          `${file.name} is ${(file.size / 1048576).toFixed(1)} MB. The limit is ` +
            `${limit / 1048576} MB — compress it, or raise the limit in Supabase storage settings.`,
          true
        );
        return;
      }
      const oldPath = project[pathKey];
      bar.hidden = false;
      fill.style.width = '0%';
      status.textContent = `Uploading ${file.name}…`;
      status.classList.remove('set');

      await guard(wrap, async () => {
        const path = `projects/${project.id}/${Date.now()}-${safeName(file.name)}`;
        const { url } = await upload(bucket, path, file, (ratio) => {
          fill.style.width = `${Math.round(ratio * 100)}%`;
        });
        await patchProject(project, { [urlKey]: url, [pathKey]: path });
        if (oldPath && oldPath !== path) await removeObject(bucket, oldPath);
        toast(isVideo ? 'Video uploaded.' : 'Poster uploaded.');
      }).catch(() => {});

      bar.hidden = true;
      refresh();
    }
  );
  wrap.append(picker);

  const linkBtn = el('button', 'btn ghost tiny', 'Use a link');
  linkBtn.type = 'button';
  linkBtn.addEventListener('click', async () => {
    const value = prompt(
      isVideo
        ? 'Paste a link.\n\n' +
          '• An Instagram, TikTok, YouTube or Vimeo post plays as an embed.\n' +
          '• A direct video file (a URL ending in .mp4) plays inline, which ' +
          'looks better — uploading the file gives you that.'
        : 'Paste the URL of an image to use as the poster:',
      project[urlKey] || ''
    );
    if (value === null) return;
    const trimmed = value.trim();
    const oldPath = project[pathKey];
    await guard(wrap, async () => {
      await patchProject(project, { [urlKey]: trimmed || null, [pathKey]: null });
      if (oldPath) await removeObject(bucket, oldPath);
      toast('Saved.');
    }).catch(() => {});
    refresh();
  });
  wrap.append(linkBtn);

  if (project[urlKey]) {
    const clear = el('button', 'btn danger tiny', 'Remove');
    clear.type = 'button';
    clear.addEventListener('click', async () => {
      if (!confirm(`Remove the ${kind} from “${project.brand_name}”?`)) return;
      const oldPath = project[pathKey];
      await guard(wrap, async () => {
        await patchProject(project, { [urlKey]: null, [pathKey]: null });
        if (oldPath) await removeObject(bucket, oldPath);
        toast('Removed.');
      }).catch(() => {});
      refresh();
    });
    wrap.append(clear);
  }

  wrap.append(bar);
  return wrap;
}

function buildRow(project) {
  const row = el('div', 'row');
  row.dataset.id = project.id;
  row.style.setProperty('--accent', `var(--c-${project.category})`);
  row.classList.toggle('is-unpublished', !project.is_published);

  row.append(buildThumb(project));

  const body = el('div', 'row-body');

  // Title line: brand name plus reordering.
  const title = el('div', 'row-title');
  const brand = el('input');
  brand.type = 'text';
  brand.className = 'f-brand';
  brand.value = project.brand_name;
  brand.setAttribute('aria-label', 'Brand name');
  title.append(brand);

  // Reordering here moves a video within its brand. Moving the brand itself
  // is done from the group header, which keeps the brand's videos together.
  const group = groupsIn(project.category).find(
    (g) => g.key === brandKey(project.brand_name)
  );
  const index = group ? group.items.findIndex((p) => p.id === project.id) : 0;
  const size = group ? group.items.length : 1;
  [['↑', -1], ['↓', 1]].forEach(([glyph, delta]) => {
    const btn = el('button', 'btn ghost tiny', glyph);
    btn.type = 'button';
    btn.title = delta < 0 ? 'Move earlier in this brand' : 'Move later in this brand';
    btn.disabled = index + delta < 0 || index + delta >= size;
    btn.addEventListener('click', () => moveRow(project, delta));
    title.append(btn);
  });
  body.append(title);

  // Caption + external link.
  const pair = el('div', 'field-pair');
  const captionField = el('label', 'field');
  captionField.append(el('span', null, 'Caption (optional)'));
  const caption = el('input');
  caption.type = 'text';
  caption.className = 'f-caption';
  caption.value = project.caption || '';
  captionField.append(caption);

  const linkField = el('label', 'field');
  linkField.append(el('span', null, 'Link to the post (optional)'));
  const external = el('input');
  external.type = 'url';
  external.className = 'f-external';
  external.placeholder = 'https://instagram.com/…';
  external.value = project.external_url || '';
  linkField.append(external);

  pair.append(captionField, linkField);
  body.append(pair);

  body.append(buildMediaRow(project, 'video', row));
  body.append(buildMediaRow(project, 'poster', row));

  // Actions.
  const actions = el('div', 'row-actions');
  const toggle = el('label', 'toggle');
  const published = el('input');
  published.type = 'checkbox';
  published.checked = project.is_published;
  published.addEventListener('change', async () => {
    await guard(row, () => patchProject(project, { is_published: published.checked }));
    row.classList.toggle('is-unpublished', !project.is_published);
    toast(project.is_published ? 'Showing on the site.' : 'Hidden from the site.');
  });
  toggle.append(published, document.createTextNode('Show on site'));
  actions.append(toggle, el('span', 'spacer'));

  const save = el('button', 'btn tiny', 'Save');
  save.type = 'button';
  save.addEventListener('click', async () => {
    const name = brand.value.trim();
    if (!name) {
      toast('A cell needs a brand name.', true);
      brand.focus();
      return;
    }
    await guard(row, () =>
      patchProject(project, {
        brand_name: name,
        caption: caption.value.trim() || null,
        external_url: external.value.trim() || null,
      })
    ).catch(() => {});
    toast('Saved.');
  });

  const del = el('button', 'btn danger tiny', 'Delete');
  del.type = 'button';
  del.addEventListener('click', async () => {
    if (!confirm(`Delete the “${project.brand_name}” cell? This cannot be undone.`)) return;
    await guard(row, async () => {
      await db.remove('projects', `id=eq.${project.id}`);
      if (project.video_path) await removeObject(VIDEO_BUCKET, project.video_path);
      if (project.poster_path) await removeObject(IMAGE_BUCKET, project.poster_path);
      state.projects = state.projects.filter((p) => p.id !== project.id);
      renderProjects();
      toast('Cell deleted.');
    }).catch(() => {});
  });

  actions.append(save, del);
  body.append(actions);

  row.append(body);
  return row;
}

function groupsIn(slug) {
  return groupByBrand(projectsIn(slug));
}

// Writes a whole category's order back as 10, 20, 30 …, touching only the rows
// whose value actually changed. Renumbering rather than swapping keeps brands
// contiguous no matter how the rows got there.
async function applyOrder(slug, rows) {
  const writes = rows
    .map((project, i) => [project, (i + 1) * 10])
    .filter(([project, target]) => project.sort_order !== target)
    .map(([project, target]) => patchProject(project, { sort_order: target }));

  if (writes.length) {
    try {
      await Promise.all(writes);
    } catch (err) {
      toast(err.message, true);
    }
  }
  renderProjects();
}

async function moveRow(project, delta) {
  const groups = groupsIn(project.category);
  const gi = groups.findIndex((g) => g.key === brandKey(project.brand_name));
  if (gi < 0) return;

  const items = [...groups[gi].items];
  const i = items.findIndex((p) => p.id === project.id);
  if (i + delta < 0 || i + delta >= items.length) return;
  [items[i], items[i + delta]] = [items[i + delta], items[i]];

  await applyOrder(
    project.category,
    groups.flatMap((g, k) => (k === gi ? items : g.items))
  );
}

async function moveGroup(slug, key, delta) {
  const groups = groupsIn(slug);
  const gi = groups.findIndex((g) => g.key === key);
  if (gi < 0 || gi + delta < 0 || gi + delta >= groups.length) return;
  [groups[gi], groups[gi + delta]] = [groups[gi + delta], groups[gi]];
  await applyOrder(slug, groups.flatMap((g) => g.items));
}

// presetBrand adds another video to an existing brand; without it, asks for a
// new brand name.
async function addProject(slug, presetBrand) {
  let name = presetBrand;
  if (!name) {
    name = prompt('Brand name for the new cell:');
    if (!name || !name.trim()) return;
  }
  name = name.trim();

  // Land it directly after the brand's existing videos so it joins that group.
  const group = groupsIn(slug).find((g) => g.key === brandKey(name));
  const sort = group
    ? group.items[group.items.length - 1].sort_order + 1
    : (projectsIn(slug).at(-1)?.sort_order ?? 0) + 10;

  try {
    const [created] = await db.insert('projects', {
      category: slug,
      brand_name: name,
      sort_order: sort,
    });
    state.projects.push(created);
    renderProjects();
    toast(presetBrand ? `Added another video for “${name}”.` : `Added “${name}”.`);
  } catch (err) {
    toast(err.message, true);
  }
}

// One brand and all of its videos, which sit together on the site.
function buildGroup(slug, group, index, total) {
  const box = el('div', 'brand-group');

  const head = el('div', 'brand-group-head');

  const logo = state.logos.find((l) => brandKey(l.name) === group.key);
  const mark = el('span', `group-logo${logo?.fit === 'contain' ? ' contain' : ''}`);
  if (logo) {
    const img = el('img');
    img.src = logo.image_url;
    img.alt = group.name;
    if (logo.fit !== 'contain') {
      img.style.objectPosition = logo.object_position || '50% 45%';
      const scale = Number(logo.scale);
      if (scale && scale !== 1) img.style.transform = `scale(${scale})`;
    }
    mark.append(img);
  } else {
    mark.classList.add('missing');
    mark.textContent = group.name.slice(0, 1).toUpperCase();
  }
  head.append(mark);

  const names = el('div', 'group-names');
  names.append(el('span', 'group-name', group.name));
  names.append(
    el(
      'span',
      'group-meta',
      logo
        ? `${group.items.length} ${group.items.length === 1 ? 'video' : 'videos'}`
        : `${group.items.length} ${group.items.length === 1 ? 'video' : 'videos'} · ` +
            'no logo with this name, so the cards show the brand name instead'
    )
  );
  if (!logo) names.querySelector('.group-meta').classList.add('warn');
  head.append(names);

  const actions = el('div', 'row-actions');
  [['↑', -1], ['↓', 1]].forEach(([glyph, delta]) => {
    const btn = el('button', 'btn ghost tiny', glyph);
    btn.type = 'button';
    btn.title = delta < 0 ? 'Move this brand up' : 'Move this brand down';
    btn.disabled = index + delta < 0 || index + delta >= total;
    btn.addEventListener('click', () => moveGroup(slug, group.key, delta));
    actions.append(btn);
  });
  const add = el('button', 'btn ghost tiny', 'Add another video');
  add.type = 'button';
  add.addEventListener('click', () => addProject(slug, group.name));
  actions.append(add);
  head.append(actions);

  box.append(head);

  const list = el('div', 'rows');
  group.items.forEach((p) => list.append(buildRow(p)));
  box.append(list);

  return box;
}

function renderProjects() {
  const host = $('#categories');
  const frag = document.createDocumentFragment();

  for (const category of CATEGORIES) {
    const rows = projectsIn(category.slug);

    const block = el('div', 'cat-block');
    block.style.setProperty('--accent', `var(--c-${category.slug})`);

    const head = el('div', 'cat-head');
    const left = el('div');
    left.append(
      el('span', 'eyebrow', `${category.numeral} — ${category.name}`),
      el('h2', null, category.title)
    );
    const right = el('div', 'row-actions');
    const withVideo = rows.filter((p) => p.video_url).length;
    right.append(el('span', 'count', `${withVideo} of ${rows.length} filled`));
    const add = el('button', 'btn ghost tiny', 'Add a brand');
    add.type = 'button';
    add.addEventListener('click', () => addProject(category.slug));
    right.append(add);
    head.append(left, right);
    block.append(head);

    if (!rows.length) {
      block.append(el('div', 'empty', 'No cells in this section yet.'));
    } else {
      const groups = groupsIn(category.slug);
      groups.forEach((group, gi) => {
        block.append(buildGroup(category.slug, group, gi, groups.length));
      });
    }

    frag.append(block);
  }

  host.replaceChildren(frag);
}

/* ---------------------------------------------------------------- logos --- */

function sortedLogos() {
  return [...state.logos].sort(
    (a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)
  );
}

async function patchLogo(logo, fields) {
  const [updated] = await db.update('logos', `id=eq.${logo.id}`, fields);
  Object.assign(logo, updated);
  return logo;
}

function buildLogoCard(logo) {
  const card = el('div', 'logo-card');

  const preview = el('div', `logo-preview${logo.fit === 'contain' ? ' contain' : ''}`);
  const img = el('img');
  img.src = logo.image_url;
  img.alt = logo.name;
  if (logo.fit !== 'contain') {
    img.style.objectPosition = logo.object_position || '50% 45%';
    const scale = Number(logo.scale);
    if (scale && scale !== 1) img.style.transform = `scale(${scale})`;
  }
  preview.append(img);
  card.append(preview);

  const nameField = el('label', 'field');
  nameField.append(el('span', null, 'Name'));
  const name = el('input');
  name.type = 'text';
  name.value = logo.name;
  nameField.append(name);
  card.append(nameField);

  const mini = el('div', 'mini');

  const fitField = el('label', 'field');
  fitField.append(el('span', null, 'Fit'));
  const fit = el('select');
  [['cover', 'Fill circle'], ['contain', 'Fit inside']].forEach(([value, label]) => {
    const option = el('option', null, label);
    option.value = value;
    fit.append(option);
  });
  fit.value = logo.fit;
  fitField.append(fit);

  const scaleField = el('label', 'field');
  scaleField.append(el('span', null, 'Zoom'));
  const scale = el('input');
  scale.type = 'number';
  scale.step = '0.01';
  scale.min = '0.5';
  scale.max = '4';
  scale.value = Number(logo.scale).toFixed(2);
  scaleField.append(scale);

  mini.append(fitField, scaleField);
  card.append(mini);

  const posField = el('label', 'field');
  posField.append(el('span', null, 'Position'));
  const position = el('input');
  position.type = 'text';
  position.value = logo.object_position || '50% 45%';
  position.placeholder = '50% 45%';
  posField.append(position);
  card.append(posField);

  const actions = el('div', 'actions');

  const list = sortedLogos();
  const index = list.findIndex((l) => l.id === logo.id);
  [['↑', -1], ['↓', 1]].forEach(([glyph, delta]) => {
    const btn = el('button', 'btn ghost tiny', glyph);
    btn.type = 'button';
    btn.disabled = index + delta < 0 || index + delta >= list.length;
    btn.addEventListener('click', async () => {
      const other = list[index + delta];
      const mine = logo.sort_order;
      const theirs = other.sort_order;
      const [a, b] = mine === theirs ? [index * 10, (index + delta) * 10] : [theirs, mine];
      await guard(card, () =>
        Promise.all([patchLogo(logo, { sort_order: a }), patchLogo(other, { sort_order: b })])
      ).catch(() => {});
      renderLogos();
    });
    actions.append(btn);
  });

  const save = el('button', 'btn tiny', 'Save');
  save.type = 'button';
  save.addEventListener('click', async () => {
    if (!name.value.trim()) {
      toast('A logo needs a name.', true);
      return;
    }
    await guard(card, () =>
      patchLogo(logo, {
        name: name.value.trim(),
        fit: fit.value,
        scale: Number(scale.value) || 1,
        object_position: position.value.trim() || '50% 45%',
      })
    ).catch(() => {});
    renderLogos();
    toast('Saved.');
  });
  actions.append(save);

  actions.append(
    filePicker('Replace', 'image/png,image/jpeg,image/webp,image/avif', async (file) => {
      if (file.size > IMAGE_MAX) {
        toast(`Images must be under ${IMAGE_MAX / 1048576} MB.`, true);
        return;
      }
      const oldPath = logo.image_path;
      await guard(card, async () => {
        const path = `logos/${Date.now()}-${safeName(file.name)}`;
        const { url } = await upload(IMAGE_BUCKET, path, file);
        await patchLogo(logo, { image_url: url, image_path: path });
        if (oldPath && oldPath !== path) await removeObject(IMAGE_BUCKET, oldPath);
        toast('Logo replaced.');
      }).catch(() => {});
      renderLogos();
    })
  );

  const del = el('button', 'btn danger tiny', 'Delete');
  del.type = 'button';
  del.addEventListener('click', async () => {
    if (!confirm(`Delete the “${logo.name}” logo?`)) return;
    await guard(card, async () => {
      await db.remove('logos', `id=eq.${logo.id}`);
      if (logo.image_path) await removeObject(IMAGE_BUCKET, logo.image_path);
      state.logos = state.logos.filter((l) => l.id !== logo.id);
      toast('Logo deleted.');
    }).catch(() => {});
    renderLogos();
  });
  actions.append(del);

  card.append(actions);
  return card;
}

function renderLogos() {
  const grid = $('#logo-grid');
  const list = sortedLogos();
  if (!list.length) {
    grid.replaceChildren(el('div', 'empty', 'No logos yet. Add one above.'));
    return;
  }
  const frag = document.createDocumentFragment();
  list.forEach((logo) => frag.append(buildLogoCard(logo)));
  grid.replaceChildren(frag);
}

$('#add-logo').addEventListener('change', async (e) => {
  const input = e.target;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;

  if (file.size > IMAGE_MAX) {
    toast(`Images must be under ${IMAGE_MAX / 1048576} MB.`, true);
    return;
  }

  const fallback = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
  const name = prompt('Brand name for this logo:', fallback);
  if (name === null) return;

  const status = $('#add-logo-state');
  status.textContent = `Uploading ${file.name}…`;
  try {
    const path = `logos/${Date.now()}-${safeName(file.name)}`;
    const { url } = await upload(IMAGE_BUCKET, path, file);
    const sort = state.logos.length
      ? Math.max(...state.logos.map((l) => l.sort_order)) + 10
      : 10;
    const [created] = await db.insert('logos', {
      name: name.trim() || fallback,
      image_url: url,
      image_path: path,
      sort_order: sort,
    });
    state.logos.push(created);
    renderLogos();
    toast(`Added “${created.name}”.`);
  } catch (err) {
    toast(err.message, true);
  } finally {
    status.textContent = '';
  }
});

/* ------------------------------------------------------------ site text --- */

function buildContentGroup(group) {
  const box = el('div', 'content-group');
  box.append(el('h2', null, group.group));
  box.append(el('p', 'group-hint', `${group.fields.length} ` +
    (group.fields.length === 1 ? 'piece of text' : 'pieces of text')));

  const fields = el('div', 'fields');
  const inputs = new Map();

  for (const field of group.fields) {
    const label = el('label', 'field');
    const caption = el('span', null, field.label);
    caption.append(el('span', 'key', `  ${field.key}`));
    label.append(caption);

    const input = el(field.long ? 'textarea' : 'input');
    if (!field.long) input.type = 'text';
    input.value = state.content.get(field.key) ?? '';
    input.placeholder = 'Using the wording built into the page';
    label.append(input);

    fields.append(label);
    inputs.set(field.key, input);
  }
  box.append(fields);

  const actions = el('div', 'actions');
  const dirty = el('span', 'content-dirty', '');
  const markDirty = () => { dirty.textContent = 'Unsaved changes'; };
  for (const input of inputs.values()) input.addEventListener('input', markDirty);

  const save = el('button', 'btn tiny', 'Save this section');
  save.type = 'button';
  save.addEventListener('click', async () => {
    // Upsert every field in the group in one request.
    const rows = [...inputs.entries()].map(([key, input]) => ({
      key,
      value: input.value.trim(),
    }));
    await guard(box, async () => {
      await db.upsert('site_content', rows);
      for (const row of rows) state.content.set(row.key, row.value);
      dirty.textContent = '';
      toast(`Saved ${group.group}.`);
    }).catch(() => {});
  });

  const revert = el('button', 'btn ghost tiny', 'Undo changes');
  revert.type = 'button';
  revert.addEventListener('click', () => {
    for (const [key, input] of inputs) input.value = state.content.get(key) ?? '';
    dirty.textContent = '';
  });

  actions.append(dirty, el('span', 'spacer'), revert, save);
  box.append(actions);
  return box;
}

function renderContent() {
  const host = $('#content-groups');
  const frag = document.createDocumentFragment();
  for (const group of SITE_FIELDS) frag.append(buildContentGroup(group));
  host.replaceChildren(frag);
}

/* ----------------------------------------------------------------- boot --- */

function showSetupNote(html) {
  const note = $('#setup-note');
  note.innerHTML = html;
  note.hidden = false;
}

async function start() {
  loginScreen.hidden = true;
  app.hidden = false;

  const user = currentUser();
  $('#who').textContent = user?.email || '';

  // Read access is public; write access needs a row in public.admins.
  try {
    const rows = await db.select('admins', 'select=user_id&limit=1');
    state.isAdmin = Array.isArray(rows) && rows.length > 0;
  } catch {
    state.isAdmin = false;
  }

  if (!state.isAdmin) {
    showSetupNote(
      'This account is signed in but is not an admin yet, so saving will fail. ' +
        'In the Supabase SQL editor run:<br><br><code>insert into public.admins (user_id, email) ' +
        "select id, email from auth.users where email = '" +
        (user?.email || 'you@example.com').replace(/</g, '&lt;') +
        "';</code><br><br>Then reload this page."
    );
  }

  try {
    const [projects, logos, content] = await Promise.all([
      db.select('projects', 'select=*&order=category,sort_order,created_at'),
      db.select('logos', 'select=*&order=sort_order,created_at'),
      db.select('site_content', 'select=key,value'),
    ]);
    state.projects = projects || [];
    state.logos = logos || [];
    state.content = new Map((content || []).map((row) => [row.key, row.value]));
  } catch (err) {
    toast(`Could not load content: ${err.message}`, true);
  }

  renderProjects();
  renderLogos();
  renderContent();
}

if (currentSession()) {
  start();
} else {
  loginScreen.hidden = false;
}
