// Supabase project configuration.
//
// The key below is the *publishable* (anon) key. It is designed to be shipped
// in client-side code — it grants only what the row level security policies in
// supabase/schema.sql allow: reading published rows, and nothing else until a
// user signs in as an admin. Never put a secret/service_role key in this file.
export const SUPABASE_URL = 'https://izlqqwcgzchxrxfeznyp.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_kuwHfwTQUA2QJ4_lENoAUg_mJiEfHr3';

// Storage buckets created by supabase/schema.sql
export const VIDEO_BUCKET = 'videos';
export const IMAGE_BUCKET = 'images';

// Section slugs, in page order. Used by both the site and the admin panel.
export const CATEGORIES = [
  { slug: 'style',    numeral: 'I',   name: 'Style',    title: 'Fashion' },
  { slug: 'beauty',   numeral: 'II',  name: 'Beauty',   title: 'Beauty & Hair' },
  { slug: 'taste',    numeral: 'III', name: 'Taste',    title: 'Food & Drink' },
  { slug: 'everyday', numeral: 'IV',  name: 'Everyday', title: 'Tech & Retail' },
  { slug: 'home',     numeral: 'V',   name: 'Home',     title: 'Home & Lifestyle' },
  { slug: 'escape',   numeral: 'VI',  name: 'Escape',   title: 'Travel' },
];

// Editable copy, grouped as it appears in the admin panel. Every key matches a
// data-content attribute in index.html and a row in the site_content table.
// `long: true` renders a textarea instead of a single line input.
export const SITE_FIELDS = [
  { group: 'Header', fields: [
    { key: 'hero.eyebrow', label: 'Eyebrow above the name' },
    { key: 'hero.intro', label: 'Introduction', long: true },
    { key: 'hero.note', label: 'Note under the introduction', long: true },
    { key: 'hero.photo_caption', label: 'Caption under the photo' },
    { key: 'hero.photo_tag', label: 'Pink tag on the photo' },
  ]},
  { group: 'About', fields: [
    { key: 'about.heading', label: 'Handwritten heading' },
    { key: 'about.body1', label: 'First paragraph', long: true },
    { key: 'about.body2', label: 'Second paragraph', long: true },
    { key: 'about.caption', label: 'Caption under the photo' },
  ]},
  { group: 'Contents', fields: [
    { key: 'contents.eyebrow', label: 'Heading above the list' },
  ]},
  ...['style', 'beauty', 'taste', 'everyday', 'home', 'escape'].map((slug) => ({
    group: `Section: ${slug[0].toUpperCase()}${slug.slice(1)}`,
    fields: [
      { key: `section.${slug}.eyebrow`, label: 'Eyebrow' },
      { key: `section.${slug}.title`, label: 'Title' },
      { key: `section.${slug}.desc`, label: 'Description', long: true },
    ],
  })),
  { group: 'Logos', fields: [
    { key: 'credits.eyebrow', label: 'Heading above the logo strip' },
  ]},
  { group: 'Get in touch', fields: [
    { key: 'connect.heading1', label: 'Heading, first line' },
    { key: 'connect.heading2', label: 'Heading, second line' },
    { key: 'connect.label', label: 'Postcard label' },
    { key: 'contact.email', label: 'Email address' },
    { key: 'contact.instagram', label: 'Instagram handle' },
    { key: 'contact.phone', label: 'Phone number' },
    { key: 'connect.note', label: 'Handwritten note' },
  ]},
  { group: 'Footer', fields: [
    { key: 'footer.text', label: 'Footer line' },
  ]},
];
