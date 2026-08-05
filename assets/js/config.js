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
