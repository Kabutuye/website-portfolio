// Fills the six category grids and the logo strip from Supabase.
//
// The markup in index.html already contains every brand name and logo, so the
// page is complete before this script runs. If Supabase is unreachable the
// visitor still sees the full portfolio, just without the videos.

import { db } from './sb.js';
import { CATEGORIES } from './config.js';
import { parseMedia, brandKey, groupByBrand } from './media.js';

const PLAY_BADGE =
  '<span class="play-badge"><svg viewBox="0 0 10 10" aria-hidden="true">' +
  '<polygon points="1,0 10,5 1,10" fill="#2a1b12"/></svg></span>';

// brandKey -> logo row, so a card can wear its brand's logo.
let logoByBrand = new Map();

/* ------------------------------------------------------------ rendering --- */

function buildBadge(brandName) {
  const logo = logoByBrand.get(brandKey(brandName));
  if (!logo) return null;

  const badge = document.createElement('span');
  badge.className = logo.fit === 'contain' ? 'brand-badge contain' : 'brand-badge';
  badge.title = brandName;

  const img = document.createElement('img');
  img.src = logo.image_url;
  img.alt = brandName;
  img.loading = 'lazy';
  if (logo.fit !== 'contain') {
    img.style.objectPosition = logo.object_position || '50% 45%';
    const scale = Number(logo.scale);
    if (scale && scale !== 1) img.style.transform = `scale(${scale})`;
  }

  badge.append(img);
  return badge;
}

function buildCard(project) {
  const card = document.createElement('div');
  card.className = 'brand-card';

  const media = parseMedia(project.video_url);
  const wrap = document.createElement('div');
  wrap.className = 'slot-wrap';

  const slot = document.createElement(media ? 'button' : 'div');
  slot.className = 'slot';

  if (media) {
    slot.type = 'button';
    slot.classList.add('has-video');
    slot.setAttribute('aria-label', `Play video — ${project.brand_name}`);

    if (project.poster_url) {
      const img = document.createElement('img');
      img.className = 'slot-media';
      img.src = project.poster_url;
      img.alt = '';
      img.loading = 'lazy';
      slot.append(img);
    } else if (media.kind === 'file') {
      // No poster uploaded: let the browser paint the first frame instead.
      const preview = document.createElement('video');
      preview.className = 'slot-media';
      preview.src = `${media.src}#t=0.1`;
      preview.muted = true;
      preview.playsInline = true;
      preview.preload = 'metadata';
      preview.tabIndex = -1;
      slot.append(preview);
    } else {
      // An embed cannot give us a frame, so show a tinted card instead.
      slot.classList.add('is-embed');
      const label = document.createElement('span');
      label.className = 'slot-provider';
      label.textContent = media.provider;
      slot.append(label);
    }

    slot.insertAdjacentHTML('beforeend', PLAY_BADGE);

    if (project.caption) {
      const caption = document.createElement('span');
      caption.className = 'slot-caption';
      caption.textContent = project.caption;
      slot.append(caption);
    }

    slot.addEventListener('click', () => openLightbox(project, media, slot));
  } else {
    slot.insertAdjacentHTML('beforeend', PLAY_BADGE);
    const label = document.createElement('span');
    label.className = 'slot-label';
    label.textContent = `Video — ${project.brand_name}`;
    slot.append(label);
  }

  wrap.append(slot);

  // The brand's logo sits on the bottom edge of the frame. Without a matching
  // logo, fall back to the brand name underneath, as the page used to do.
  const badge = buildBadge(project.brand_name);
  if (badge) {
    wrap.append(badge);
    card.classList.add('has-badge');
  }
  card.append(wrap);

  if (!badge) {
    const name = document.createElement('span');
    name.className = 'brand-name';
    name.textContent = project.brand_name;
    card.append(name);
  }

  return card;
}

function renderProjects(projects) {
  const byCategory = new Map(CATEGORIES.map((c) => [c.slug, []]));
  for (const project of projects) {
    if (byCategory.has(project.category)) byCategory.get(project.category).push(project);
  }

  for (const { slug } of CATEGORIES) {
    const grid = document.querySelector(`[data-grid="${slug}"]`);
    const rows = byCategory.get(slug);
    // An empty category would wipe a section that still has static content in
    // it, so leave the markup alone unless the database actually has rows.
    if (!grid || !rows.length) continue;

    const frag = document.createDocumentFragment();
    // Grouped so every video for one brand sits next to its siblings.
    for (const group of groupByBrand(rows)) {
      for (const project of group.items) frag.append(buildCard(project));
    }
    grid.replaceChildren(frag);

    const count = document.querySelector(`[data-count="${slug}"]`);
    if (count) count.textContent = String(rows.length).padStart(2, '0');
  }
}

function renderLogos(logos) {
  const list = document.querySelector('[data-logos]');
  if (!list || !logos.length) return;

  const frag = document.createDocumentFragment();
  for (const logo of logos) {
    const li = document.createElement('li');
    li.className = logo.fit === 'contain' ? 'has-logo logo-clean' : 'has-logo';

    const img = document.createElement('img');
    img.src = logo.image_url;
    img.alt = logo.name;
    img.loading = 'lazy';
    if (logo.fit !== 'contain') {
      img.style.objectPosition = logo.object_position || '50% 45%';
      const scale = Number(logo.scale);
      if (scale && scale !== 1) img.style.transform = `scale(${scale})`;
    }

    li.append(img);
    frag.append(li);
  }
  list.replaceChildren(frag);
}

/* ------------------------------------------------------------ lightbox --- */

const lightbox = document.getElementById('lightbox');
const player = lightbox.querySelector('video');
const embed = lightbox.querySelector('iframe');
const brandLabel = lightbox.querySelector('.lightbox-brand');
const captionLabel = lightbox.querySelector('.lightbox-caption');
const linkOut = lightbox.querySelector('.lightbox-link');
let lastFocused = null;

function openLightbox(project, media, trigger) {
  lastFocused = trigger || null;

  const isEmbed = media.kind === 'embed';
  player.hidden = isEmbed;
  embed.hidden = !isEmbed;
  if (isEmbed) {
    embed.src = media.src;
    embed.title = `${media.provider} video — ${project.brand_name}`;
  } else {
    player.src = media.src;
  }

  brandLabel.textContent = project.brand_name;
  captionLabel.textContent = project.caption || '';
  captionLabel.hidden = !project.caption;

  // For an embed the video URL is itself the post, so it doubles as the link.
  const href = project.external_url || media.page;
  if (href) {
    linkOut.href = href;
    linkOut.hidden = false;
  } else {
    linkOut.hidden = true;
  }

  lightbox.hidden = false;
  document.body.classList.add('no-scroll');
  requestAnimationFrame(() => {
    lightbox.classList.add('is-open');
    if (!isEmbed) {
      player.play().catch(() => {
        /* autoplay blocked — the controls are right there */
      });
    }
  });
  lightbox.querySelector('.lightbox-close').focus();
}

function closeLightbox() {
  if (lightbox.hidden) return;
  player.pause();
  lightbox.classList.remove('is-open');
  document.body.classList.remove('no-scroll');

  const finish = () => {
    lightbox.hidden = true;
    player.removeAttribute('src');
    player.load();
    // Clearing the iframe stops an embedded video that is still playing.
    embed.removeAttribute('src');
  };
  // Wait for the fade, but never hang if the transition never fires.
  const timer = setTimeout(finish, 300);
  lightbox.addEventListener(
    'transitionend',
    () => {
      clearTimeout(timer);
      finish();
    },
    { once: true }
  );

  if (lastFocused && document.contains(lastFocused)) lastFocused.focus();
}

lightbox.addEventListener('click', (e) => {
  if (e.target === lightbox || e.target.closest('.lightbox-close')) closeLightbox();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeLightbox();
});

/* ----------------------------------------------------------------- load --- */

async function load() {
  const [projects, logos] = await Promise.allSettled([
    db.select('projects', 'select=*&is_published=eq.true&order=category,sort_order,created_at'),
    db.select('logos', 'select=*&is_published=eq.true&order=sort_order,created_at'),
  ]);

  // Logos first: the cards need the lookup to draw their badges.
  if (logos.status === 'fulfilled' && logos.value) {
    logoByBrand = new Map(logos.value.map((l) => [brandKey(l.name), l]));
    renderLogos(logos.value);
  } else {
    console.warn('Logos could not be loaded:', logos.reason);
  }

  if (projects.status === 'fulfilled' && projects.value) renderProjects(projects.value);
  else console.warn('Portfolio videos could not be loaded:', projects.reason);
}

load();
