-- ---------------------------------------------------------------------------
-- Editable site copy.
--
-- Run this once in the Supabase SQL Editor, the same way as schema.sql. It is
-- safe to re-run: the seed only inserts keys that are not already there, so
-- anything you have edited in the admin panel is left alone.
--
-- Every key here corresponds to a `data-content` attribute in index.html. A
-- key that has no row simply leaves the text that is already in the HTML, so
-- the page never depends on this table being populated.
-- ---------------------------------------------------------------------------

create table if not exists public.site_content (
  key        text primary key,
  value      text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.site_content enable row level security;

drop trigger if exists site_content_touch_updated_at on public.site_content;
create trigger site_content_touch_updated_at
  before update on public.site_content
  for each row execute function public.touch_updated_at();

drop policy if exists "site copy is public" on public.site_content;
create policy "site copy is public" on public.site_content
  for select to anon, authenticated
  using (true);

drop policy if exists "admins write site copy" on public.site_content;
create policy "admins write site copy" on public.site_content
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ------------------------------------------------------------------ seed ---

insert into public.site_content (key, value)
select v.key, v.value
from (values
  ('hero.eyebrow', 'Nairobi — Content Creator'),
  ('hero.intro', 'I''m Kabale, a Nairobi based content creator who turns everyday moments, a new dish, a fresh haircut, an outfit that just works, into content brands actually want their audience to see. Twenty partnerships and counting, because I know exactly what makes people stop scrolling.'),
  ('hero.note', 'Twenty brand partnerships across six categories. This page is a running record of that work.'),
  ('hero.photo_caption', 'a girl who makes content and means it'),
  ('hero.photo_tag', 'Content Creator'),

  ('about.heading', 'oh hey!'),
  ('about.body1', 'I''m Kabale, a Nairobi based content creator working across style, beauty, food, and everyday life. My portfolio spans twenty brand partnerships, from fashion labels and beauty studios to restaurants, retail, and travel. I move easily between categories because I approach every piece the same way: find what''s genuinely worth showing about a brand, then show it the way a real person would actually experience it.'),
  ('about.body2', 'I create content that feels lived in, not staged, the kind brands can drop straight into their own channels. I shoot and edit every piece myself, from first frame to final export, so quality stays consistent from concept through delivery, and most projects turn around within a few days of the shoot. Every partnership gets the same standard: show up prepared, deliver on time, and make the brand look good.'),
  ('about.caption', 'a girl who turns everyday moments into content'),

  ('contents.eyebrow', 'In this issue'),

  ('section.style.eyebrow', 'I — Style'),
  ('section.style.title', 'Fashion'),
  ('section.style.desc', 'Lookbooks, styling edits, and campaign content for fashion labels.'),
  ('section.beauty.eyebrow', 'II — Beauty'),
  ('section.beauty.title', 'Beauty & Hair'),
  ('section.beauty.desc', 'Product features, salon visits, and hair care content.'),
  ('section.taste.eyebrow', 'III — Taste'),
  ('section.taste.title', 'Food & Drink'),
  ('section.taste.desc', 'The largest body of work. Restaurant visits, tastings, and reviews.'),
  ('section.everyday.eyebrow', 'IV — Everyday'),
  ('section.everyday.title', 'Tech & Retail'),
  ('section.everyday.desc', 'Product content for tech and retail partners.'),
  ('section.home.eyebrow', 'V — Home'),
  ('section.home.title', 'Home & Lifestyle'),
  ('section.home.desc', 'Homeware, florals, and everyday lifestyle features.'),
  ('section.escape.eyebrow', 'VI — Escape'),
  ('section.escape.title', 'Travel'),
  ('section.escape.desc', 'The newest category. Room to grow.'),

  ('credits.eyebrow', 'In collaboration with'),

  ('connect.heading1', 'Lets'),
  ('connect.heading2', 'Connect'),
  ('connect.label', 'Post card'),
  ('connect.note', 'looking forward to hearing from you!'),
  ('contact.email', 'kabutuye883@gmail.com'),
  ('contact.instagram', '@kabaletuye_'),
  ('contact.phone', '+254 796 860 949'),

  ('footer.text', 'Kabale Tuye')
) as v(key, value)
where not exists (select 1 from public.site_content c where c.key = v.key);
