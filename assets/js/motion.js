// Scroll and entrance animation.
//
// Everything animates transform and opacity only, so nothing here triggers
// layout. Elements are revealed by adding a class; the CSS owns the easing and
// the distances, and honours prefers-reduced-motion, so a visitor who has asked
// for less motion sees the finished state immediately.

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Children that stagger in behind their parent, in the order they appear.
const STAGGER_GROUPS = [
  ['.toc-list', '.toc-item'],
  ['.credits-list', 'li'],
  ['.grid', '.brand-card'],
];

function stagger(root = document) {
  for (const [containerSel, childSel] of STAGGER_GROUPS) {
    for (const container of root.querySelectorAll(containerSel)) {
      const children = container.querySelectorAll(childSel);
      children.forEach((child, i) => {
        child.classList.add('reveal-item');
        // Cap the delay so a long grid does not trail far behind the heading.
        child.style.setProperty('--stagger', `${Math.min(i, 9) * 55}ms`);
      });
    }
  }
}

let observer = null;

function watch(elements) {
  if (!observer) return;
  for (const el of elements) observer.observe(el);
}

export function initMotion() {
  // The hero is above the fold, so it plays on load rather than on scroll.
  document.body.classList.add('motion-ready');

  if (REDUCED) {
    document.body.classList.add('motion-off');
    return;
  }

  stagger();

  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    },
    // A little bottom margin so things finish arriving before they are read.
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );

  watch(document.querySelectorAll('.section, .contents, .credits, .connect, .reveal-item'));
}

// Cards are replaced once Supabase responds, so the new ones need observing.
export function refreshMotion(container) {
  if (REDUCED || !observer || !container) return;
  stagger(container.parentElement || container);
  watch(container.querySelectorAll('.reveal-item'));
}

// Highlights the nav link for the section currently in view.
export function initNavHighlight() {
  const links = new Map();
  for (const a of document.querySelectorAll('.nav-links a[href^="#"]')) {
    links.set(a.getAttribute('href').slice(1), a);
  }
  const sections = [...links.keys()]
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  if (!sections.length) return;

  const seen = new Set();
  const spy = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) seen.add(entry.target.id);
        else seen.delete(entry.target.id);
      }
      // The topmost visible section wins, so scrolling up feels right too.
      const current = sections.find((s) => seen.has(s.id));
      for (const [id, link] of links) {
        link.classList.toggle('is-current', Boolean(current) && id === current.id);
      }
    },
    { rootMargin: '-45% 0px -45% 0px' }
  );
  for (const section of sections) spy.observe(section);
}
