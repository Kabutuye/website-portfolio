// Works out how a given URL can actually be played.
//
// A <video> tag can only play a real video file. An Instagram, TikTok or
// YouTube link is a web *page*, so pointing a <video> at one shows nothing —
// that is what the "link does not play" problem was. Those platforms don't
// allow hotlinking the underlying file either (their CDN URLs are signed and
// expire), so the only reliable way to show them is the provider's own embed.

const PROVIDERS = [
  {
    name: 'Instagram',
    test: /instagram\.com\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i,
    embed: (m) => {
      const kind = m[1].toLowerCase() === 'reels' ? 'reel' : m[1].toLowerCase();
      return `https://www.instagram.com/${kind}/${m[2]}/embed`;
    },
  },
  {
    name: 'YouTube',
    test: /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i,
    embed: (m) => `https://www.youtube.com/embed/${m[1]}`,
  },
  {
    name: 'TikTok',
    test: /tiktok\.com\/(?:@[^/]+\/video\/|v\/|embed\/v2\/)(\d+)/i,
    embed: (m) => `https://www.tiktok.com/embed/v2/${m[1]}`,
  },
  {
    name: 'Vimeo',
    test: /vimeo\.com\/(?:video\/)?(\d+)/i,
    embed: (m) => `https://player.vimeo.com/video/${m[1]}`,
  },
];

const VIDEO_FILE = /\.(mp4|m4v|mov|webm|ogv)(\?|#|$)/i;

/**
 * @returns {null | {kind: 'embed'|'file', provider: string|null, src: string, page: string|null}}
 *   kind 'file'  -> plays in a <video> element
 *   kind 'embed' -> has to go in an <iframe>, `page` links back to the post
 */
export function parseMedia(url) {
  if (!url) return null;
  const clean = String(url).trim();
  if (!clean) return null;

  for (const provider of PROVIDERS) {
    const match = clean.match(provider.test);
    if (match) {
      return {
        kind: 'embed',
        provider: provider.name,
        src: provider.embed(match),
        page: clean,
      };
    }
  }

  return { kind: 'file', provider: null, src: clean, page: null };
}

// True when a URL looks like a direct video file, so the admin can warn about
// links that are neither a known provider nor a playable file.
export function looksLikeVideoFile(url) {
  return VIDEO_FILE.test(String(url || ''));
}

// Brands are grouped on this key so "Joto Ramen" and " joto  ramen " land
// together. Used by the site and the admin panel alike.
export function brandKey(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function byOrder(a, b) {
  return a.sort_order - b.sort_order || String(a.created_at).localeCompare(String(b.created_at));
}

/**
 * Groups rows by brand and returns the groups in display order: a brand sits
 * where its earliest cell sits, so every video for that brand is adjacent.
 * @returns {Array<{key: string, name: string, items: Array}>}
 */
export function groupByBrand(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = brandKey(row.brand_name);
    if (!groups.has(key)) groups.set(key, { key, name: row.brand_name, items: [] });
    groups.get(key).items.push(row);
  }
  const list = [...groups.values()];
  list.forEach((g) => g.items.sort(byOrder));
  list.sort((a, b) => byOrder(a.items[0], b.items[0]));
  return list;
}
