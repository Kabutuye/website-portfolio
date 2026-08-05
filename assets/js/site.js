// Fills the six category grids and the logo strip from Supabase.
//
// The markup in index.html already contains every brand name and logo, so the
// page is complete before this script runs. If Supabase is unreachable the
// visitor still sees the full portfolio, just without the videos.

import { db } from './sb.js';
import { CATEGORIES } from './config.js';

const PLAY_BADGE =
  '<span class="play-badge"><svg viewBox="0 0 10 10" aria-hidden="true">' +
  '<polygon points="1,0 10,5 1,10" fill="#2a1b12"/></svg></span>';

/* ------------------------------------------------------------ rendering --- */

function buildCard(project) {
  const card = document.createElement('div');
  card.className = 'brand-card';

  const hasVideo = Boolean(project.video_url);
  const slot = document.createElement(hasVideo ? 'button' : 'div');
  slot.className = 'slot';

  if (hasVideo) {
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
    } else {
      // No poster uploaded: let the browser paint the first frame instead.
      const preview = document.createElement('video');
      preview.className = 'slot-media';
      preview.src = `${project.video_url}#t=0.1`;
      preview.muted = true;
      preview.playsInline = true;
      preview.preload = 'metadata';
      preview.tabIndex = -1;
      slot.append(preview);
    }

    slot.insertAdjacentHTML('beforeend', PLAY_BADGE);

    if (project.caption) {
      const caption = document.createElement('span');
      caption.className = 'slot-caption';
      caption.textContent = project.caption;
      slot.append(caption);
    }

    slot.addEventListener('click', () => openLightbox(project, slot));
  } else {
    slot.insertAdjacentHTML('beforeend', PLAY_BADGE);
    const label = document.createElement('span');
    label.className = 'slot-label';
    label.textContent = `Video — ${project.brand_name}`;
    slot.append(label);
  }

  const name = document.createElement('span');
  name.className = 'brand-name';
  name.textContent = project.brand_name;

  card.append(slot, name);
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
    rows.forEach((project) => frag.append(buildCard(project)));
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
const brandLabel = lightbox.querySelector('.lightbox-brand');
const captionLabel = lightbox.querySelector('.lightbox-caption');
const linkOut = lightbox.querySelector('.lightbox-link');
let lastFocused = null;

function openLightbox(project, trigger) {
  lastFocused = trigger || null;

  player.src = project.video_url;
  brandLabel.textContent = project.brand_name;
  captionLabel.textContent = project.caption || '';
  captionLabel.hidden = !project.caption;

  if (project.external_url) {
    linkOut.href = project.external_url;
    linkOut.hidden = false;
  } else {
    linkOut.hidden = true;
  }

  lightbox.hidden = false;
  document.body.classList.add('no-scroll');
  requestAnimationFrame(() => {
    lightbox.classList.add('is-open');
    player.play().catch(() => {
      /* autoplay blocked — the controls are right there */
    });
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

  if (projects.status === 'fulfilled' && projects.value) renderProjects(projects.value);
  else console.warn('Portfolio videos could not be loaded:', projects.reason);

  if (logos.status === 'fulfilled' && logos.value) renderLogos(logos.value);
  else console.warn('Logos could not be loaded:', logos.reason);
}

load();
