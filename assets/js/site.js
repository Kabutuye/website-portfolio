// Fills the six category grids and the logo strip from Supabase.
//
// The markup in index.html already contains every brand name and logo, so the
// page is complete before this script runs. If Supabase is unreachable the
// visitor still sees the full portfolio, just without the videos.

import { db } from './sb.js';
import { CATEGORIES } from './config.js';
import { parseMedia, brandKey, groupByBrand } from './media.js';
import { applyContent } from './content.js';
import { initMotion, refreshMotion, initNavHighlight } from './motion.js';

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

// Phones and tablets never fire mouseenter, so on those the controls have to
// appear as soon as playback starts — otherwise there is no way to pause.
const CAN_HOVER = window.matchMedia('(hover: hover)').matches;

// A video that plays in the card itself: no chrome until you hover, and the
// big play badge covering it whenever it is paused.
function buildInlinePlayer(slot, project, media) {
  const video = document.createElement('video');
  video.className = 'slot-media';
  // Without a poster, #t=0.1 nudges the browser into painting a first frame.
  video.src = project.poster_url ? media.src : `${media.src}#t=0.1`;
  if (project.poster_url) video.poster = project.poster_url;
  video.playsInline = true;
  video.preload = 'metadata';
  video.setAttribute('aria-label', `Video — ${project.brand_name}`);

  // The cover carries the play badge and caption while paused, and is what a
  // visitor clicks — or tabs to — in order to start playback.
  const cover = document.createElement('button');
  cover.type = 'button';
  cover.className = 'play-overlay';
  cover.setAttribute('aria-label', `Play video — ${project.brand_name}`);
  cover.insertAdjacentHTML('beforeend', PLAY_BADGE);

  if (project.caption) {
    const caption = document.createElement('span');
    caption.className = 'slot-caption';
    caption.textContent = project.caption;
    cover.append(caption);
  }

  const start = () => video.play().catch(() => {});
  cover.addEventListener('click', start);
  video.addEventListener('click', () => (video.paused ? start() : video.pause()));

  video.addEventListener('play', () => {
    slot.classList.add('is-playing');
    if (!CAN_HOVER || slot.matches(':hover')) video.controls = true;
  });
  ['pause', 'ended'].forEach((event) =>
    video.addEventListener(event, () => {
      slot.classList.remove('is-playing');
      video.controls = false;
    })
  );

  if (CAN_HOVER) {
    const show = () => {
      if (!video.paused) video.controls = true;
    };
    const hide = () => {
      video.controls = false;
    };
    slot.addEventListener('mouseenter', show);
    slot.addEventListener('mouseleave', hide);
    slot.addEventListener('focusin', show);
    slot.addEventListener('focusout', hide);
  }

  slot.append(video, cover);

  if (project.external_url) {
    const link = document.createElement('a');
    link.className = 'slot-link';
    link.href = project.external_url;
    link.target = '_blank';
    link.rel = 'noopener';
    const target = parseMedia(project.external_url);
    link.textContent = target?.provider ? `View on ${target.provider}` : 'View post';
    slot.append(link);
  }
}

// Only one video plays at a time, anywhere on the page. `play` does not
// bubble, so this has to listen in the capture phase.
document.addEventListener(
  'play',
  (e) => {
    for (const other of document.querySelectorAll('video')) {
      if (other !== e.target && !other.paused) other.pause();
    }
  },
  true
);

function buildPolaroid(project) {
  const frame = document.createElement('div');
  frame.className = 'photo-card';

  const shot = document.createElement('button');
  shot.type = 'button';
  shot.className = 'photo-shot';
  shot.setAttribute('aria-label', `View photo — ${project.brand_name}`);

  const img = document.createElement('img');
  img.src = project.image_url;
  img.alt = project.caption || project.brand_name;
  img.loading = 'lazy';
  shot.append(img);
  shot.addEventListener('click', () => openPhoto(project, shot));

  frame.append(shot);

  // The handwritten line under a polaroid: the caption, or the brand name.
  const caption = document.createElement('p');
  caption.className = 'photo-card-caption';
  caption.textContent = project.caption || project.brand_name;
  frame.append(caption);

  return frame;
}

function buildCard(project) {
  const card = document.createElement('div');
  card.className = 'brand-card';

  const isPhoto = project.media_type === 'photo';
  const media = isPhoto ? null : parseMedia(project.video_url);

  const wrap = document.createElement('div');
  wrap.className = 'slot-wrap';

  if (isPhoto && project.image_url) {
    card.classList.add('is-photo');
    wrap.append(buildPolaroid(project));
    const badge = buildBadge(project.brand_name);
    if (badge) {
      wrap.append(badge);
      card.classList.add('has-badge');
    }
    card.append(wrap);
    return card;
  }

  // An uploaded file plays in the card itself. An embed cannot, so those keep
  // opening the lightbox where the provider's iframe can live.
  const playsInline = media?.kind === 'file';
  const slot = document.createElement(media && !playsInline ? 'button' : 'div');
  slot.className = 'slot';

  if (playsInline) {
    slot.classList.add('has-video');
    buildInlinePlayer(slot, project, media);
  } else if (media) {
    slot.type = 'button';
    slot.classList.add('has-video', 'is-embed');
    slot.setAttribute('aria-label', `Play video — ${project.brand_name}`);

    if (project.poster_url) {
      const img = document.createElement('img');
      img.className = 'slot-media';
      img.src = project.poster_url;
      img.alt = '';
      img.loading = 'lazy';
      slot.append(img);
    } else {
      // An embed cannot give us a frame, so show a tinted card instead.
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
    label.textContent = `${isPhoto ? 'Photo' : 'Video'} — ${project.brand_name}`;
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
    refreshMotion(grid);

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
  refreshMotion(list);
}

/* ------------------------------------------------------------ lightbox --- */

const lightbox = document.getElementById('lightbox');
const player = lightbox.querySelector('video');
const embed = lightbox.querySelector('iframe');
const photo = lightbox.querySelector('.lightbox-photo');
const brandLabel = lightbox.querySelector('.lightbox-brand');
const captionLabel = lightbox.querySelector('.lightbox-caption');
const linkOut = lightbox.querySelector('.lightbox-link');
let lastFocused = null;

function fillLightboxMeta(project, href) {
  brandLabel.textContent = project.brand_name;
  captionLabel.textContent = project.caption || '';
  captionLabel.hidden = !project.caption;

  if (href) {
    linkOut.href = href;
    const target = parseMedia(href);
    linkOut.textContent = target?.provider ? `View on ${target.provider}` : 'View post';
    linkOut.hidden = false;
  } else {
    linkOut.hidden = true;
  }
}

function revealLightbox(trigger) {
  for (const inline of document.querySelectorAll('video.slot-media')) inline.pause();
  lastFocused = trigger || null;
  lightbox.hidden = false;
  document.body.classList.add('no-scroll');
  requestAnimationFrame(() => lightbox.classList.add('is-open'));
  lightbox.querySelector('.lightbox-close').focus();
}

// A photo cell opens the full image rather than a player.
function openPhoto(project, trigger) {
  player.hidden = true;
  embed.hidden = true;
  photo.hidden = false;
  photo.src = project.image_url;
  photo.alt = project.caption || project.brand_name;

  fillLightboxMeta(project, project.external_url || null);
  revealLightbox(trigger);
}

function openLightbox(project, media, trigger) {
  const isEmbed = media.kind === 'embed';
  photo.hidden = true;
  player.hidden = isEmbed;
  embed.hidden = !isEmbed;
  if (isEmbed) {
    embed.src = media.src;
    embed.title = `${media.provider} video — ${project.brand_name}`;
  } else {
    player.src = media.src;
  }

  // For an embed the video URL is itself the post, so it doubles as the link.
  fillLightboxMeta(project, project.external_url || media.page);
  revealLightbox(trigger);

  if (!isEmbed) {
    requestAnimationFrame(() => {
      player.play().catch(() => {
        /* autoplay blocked — the controls are right there */
      });
    });
  }
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
    photo.removeAttribute('src');
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
  const [projects, logos, content] = await Promise.allSettled([
    db.select('projects', 'select=*&is_published=eq.true&order=category,sort_order,created_at'),
    db.select('logos', 'select=*&is_published=eq.true&order=sort_order,created_at'),
    db.select('site_content', 'select=key,value'),
  ]);

  // Copy first: it only ever replaces text that is already on the page.
  if (content.status === 'fulfilled' && content.value) applyContent(content.value);
  else console.warn('Site copy could not be loaded:', content.reason);

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

initMotion();
initNavHighlight();
load();
