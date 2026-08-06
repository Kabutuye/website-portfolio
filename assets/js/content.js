// Applies editable copy from the site_content table.
//
// Every editable string is already written into index.html, so a missing row,
// an empty value, or an unreachable database all leave the page reading
// exactly as it does now. This only ever overwrites text that has a value.

// Contact details are also links, so the href has to follow the text.
const HREF = {
  'contact.email': (v) => `mailto:${v.trim()}`,
  'contact.phone': (v) => `tel:${v.replace(/[^\d+]/g, '')}`,
  'contact.instagram': (v) => `https://instagram.com/${v.trim().replace(/^@/, '')}`,
};

export function applyContent(rows) {
  if (!Array.isArray(rows)) return;

  for (const row of rows) {
    const value = (row.value ?? '').trim();
    if (!value) continue;

    const targets = document.querySelectorAll(`[data-content="${CSS.escape(row.key)}"]`);
    for (const el of targets) {
      el.textContent = value;
      const href = HREF[row.key];
      if (href && el.tagName === 'A') el.href = href(value);
    }
  }
}
