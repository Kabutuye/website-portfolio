-- ---------------------------------------------------------------------------
-- Let a cell hold a photo instead of a video.
--
-- Run this once in the Supabase SQL Editor, after schema.sql. Safe to re-run.
--
-- Existing cells keep working untouched: media_type defaults to 'video', which
-- is what every row already is.
-- ---------------------------------------------------------------------------

alter table public.projects
  add column if not exists media_type text not null default 'video',
  add column if not exists image_url  text,
  add column if not exists image_path text;

-- Added separately so re-running does not fail on an existing constraint.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'projects_media_type_check'
  ) then
    alter table public.projects
      add constraint projects_media_type_check
      check (media_type in ('video', 'photo'));
  end if;
end $$;
