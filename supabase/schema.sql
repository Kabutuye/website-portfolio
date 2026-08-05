-- ---------------------------------------------------------------------------
-- Kabale Tuye portfolio — database schema
--
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste ->
-- Run. Then run seed.sql to load the twenty partnerships and the logos.
--
-- Security model
--   * The site reads with the publishable (anon) key. Anonymous visitors can
--     only SELECT rows where is_published = true. They cannot write anything.
--   * Writing requires a signed in user whose id is listed in public.admins.
--     Being merely authenticated is not enough, so leaving email signups on in
--     the Supabase dashboard does not hand anybody the keys to the site.
-- ---------------------------------------------------------------------------

-- ------------------------------------------------------------------ admins --

create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

-- security definer so the policies below can read this table without the
-- caller needing their own select permission on it.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- Anonymous visitors never evaluate is_admin() — their policies only test
-- is_published — so keep it off the anon grant. Supabase's default privileges
-- grant EXECUTE to anon explicitly, so revoking from PUBLIC alone is not
-- enough. The authenticated grant has to stay: row level security evaluates
-- policy expressions as the querying role, so admins could not write without it.
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

drop policy if exists "admins read own row" on public.admins;
create policy "admins read own row" on public.admins
  for select to authenticated
  using (user_id = auth.uid());

-- --------------------------------------------------------------- projects --
-- One row per cell in the six category grids.

create table if not exists public.projects (
  id           uuid primary key default gen_random_uuid(),
  category     text not null check (category in
                 ('style', 'beauty', 'taste', 'everyday', 'home', 'escape')),
  brand_name   text not null,
  caption      text,
  video_url    text,        -- public URL of the video, or any external URL
  video_path   text,        -- object path inside the "videos" bucket, if uploaded
  poster_url   text,        -- optional still frame shown before playback
  poster_path  text,        -- object path inside the "images" bucket, if uploaded
  external_url text,        -- optional link out to the original post
  sort_order   integer not null default 0,
  is_published boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists projects_category_order_idx
  on public.projects (category, sort_order, created_at);

-- ------------------------------------------------------------------- logos --
-- The "In collaboration with" strip.

create table if not exists public.logos (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  image_url       text not null,
  image_path      text,     -- object path inside the "images" bucket, if uploaded
  fit             text not null default 'cover' check (fit in ('cover', 'contain')),
  object_position text not null default '50% 45%',
  scale           numeric(4, 2) not null default 1.00,
  sort_order      integer not null default 0,
  is_published    boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists logos_order_idx on public.logos (sort_order, created_at);

-- ------------------------------------------------------------- updated_at --

-- search_path is pinned empty (and now() fully qualified) so the function
-- cannot be redirected by a caller's search_path.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists projects_touch_updated_at on public.projects;
create trigger projects_touch_updated_at
  before update on public.projects
  for each row execute function public.touch_updated_at();

drop trigger if exists logos_touch_updated_at on public.logos;
create trigger logos_touch_updated_at
  before update on public.logos
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- policies --

alter table public.projects enable row level security;
alter table public.logos    enable row level security;

drop policy if exists "published projects are public" on public.projects;
create policy "published projects are public" on public.projects
  for select to anon, authenticated
  using (is_published);

drop policy if exists "admins read all projects" on public.projects;
create policy "admins read all projects" on public.projects
  for select to authenticated
  using (public.is_admin());

drop policy if exists "admins write projects" on public.projects;
create policy "admins write projects" on public.projects
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "published logos are public" on public.logos;
create policy "published logos are public" on public.logos
  for select to anon, authenticated
  using (is_published);

drop policy if exists "admins read all logos" on public.logos;
create policy "admins read all logos" on public.logos
  for select to authenticated
  using (public.is_admin());

drop policy if exists "admins write logos" on public.logos;
create policy "admins write logos" on public.logos
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ----------------------------------------------------------------- storage --
-- Two public buckets. Public here means anyone with the URL can watch or view
-- the file, which is what a portfolio wants; uploading still requires an admin.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'videos', 'videos', true,
  52428800,  -- 50 MB, the default ceiling on the Supabase free plan
  array['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'images', 'images', true,
  10485760,  -- 10 MB is plenty for a logo or a poster frame
  array['image/png', 'image/jpeg', 'image/webp', 'image/avif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public can read site media" on storage.objects;
create policy "public can read site media" on storage.objects
  for select to anon, authenticated
  using (bucket_id in ('videos', 'images'));

drop policy if exists "admins upload site media" on storage.objects;
create policy "admins upload site media" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('videos', 'images') and public.is_admin());

drop policy if exists "admins update site media" on storage.objects;
create policy "admins update site media" on storage.objects
  for update to authenticated
  using (bucket_id in ('videos', 'images') and public.is_admin())
  with check (bucket_id in ('videos', 'images') and public.is_admin());

drop policy if exists "admins delete site media" on storage.objects;
create policy "admins delete site media" on storage.objects
  for delete to authenticated
  using (bucket_id in ('videos', 'images') and public.is_admin());
