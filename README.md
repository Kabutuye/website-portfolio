# Kabale Tuye — portfolio

Static portfolio site with a small admin panel. Videos and client logos live in
Supabase; everything else is plain HTML, CSS and JavaScript with no build step.

```
index.html              the portfolio
admin.html              the admin panel  (also reachable at /admin)
assets/css/             site.css, admin.css
assets/js/              config.js, sb.js (tiny Supabase client), site.js, admin.js
assets/img/             photos and the twenty one original logos
supabase/schema.sql     tables, row level security, storage buckets
supabase/seed.sql       the twenty partnerships and the original logos
supabase/site-content.sql  editable wording, and its table
supabase/photos.sql     lets a cell hold a photo instead of a video
vercel.json             static hosting config
```

The page renders completely from the HTML on its own. Supabase only *adds* the
videos and any logos you upload later, so if the database is ever unreachable
the portfolio still loads and reads correctly.

## One time setup

### 1. Create the tables

Supabase dashboard → **SQL Editor** → **New query**. Paste all of
`supabase/schema.sql`, run it. Then the same with `supabase/seed.sql`,
`supabase/site-content.sql` and `supabase/photos.sql`.

Both files are safe to run more than once — the seed skips rows that already
exist, so it will never duplicate anything you have edited in the admin panel.

### 2. Create your login

Dashboard → **Authentication** → **Users** → **Add user** → *Create new user*.
Use your email, pick a strong password, and tick **Auto Confirm User**.

### 3. Make that user an admin

Signing in is not enough to change anything — a user also has to be listed in
the `admins` table. In the SQL Editor, with your own email:

```sql
insert into public.admins (user_id, email)
select id, email from auth.users where email = 'kabutuye883@gmail.com';
```

(If you skip this, the admin panel will still open and show you the exact
command to run, filled in with your address.)

### 4. Deploy

Vercel is already connected to this repository. There is no build step: the
framework preset is **Other**, build command empty, output directory empty.
Push, and Vercel serves the files as they are.

### 5. Sign in

Open `https://your-domain/admin` and sign in with the account from step 2.

## Using the admin panel

**Videos.** Every cell on the site is one row, grouped under the same six
sections as the page and, inside each section, by brand. For each cell you can:

- **Upload** an `.mp4` (or `.mov` / `.webm`) straight from your phone or laptop —
  the progress bar shows how far along it is,
- or **Use a link** — see [What a link can be](#what-a-link-can-be) below,
- add an optional **poster** image (the still shown before playback). Without
  one, the browser uses the first frame of the video,
- add a **caption** and a **link to the post** — both appear when a visitor
  opens the video,
- **Show on site** hides a cell without deleting it, which is handy while you
  are still editing something,
- **↑ / ↓** on a row reorder that brand's videos, **↑ / ↓** on a brand header
  move the whole brand, **Add another video** adds a second (or third) video to
  a brand you have already worked with, and **Add a brand** starts a new one.

**Videos or photos.** Not every campaign is film. The *This cell holds* dropdown
on each row switches between **A video** and **A photo**; the upload control
below it follows, taking an `.mp4` or an image accordingly. A photo appears on
the site in a polaroid frame, tilted, with its caption written underneath in the
white border and the brand's logo tucked into the corner like a sticker.
Clicking one opens the full picture.

**Empty cells never appear.** A cell with no video or photo in it is left off
the page entirely, so an unfinished row is invisible to visitors rather than
showing as a placeholder. Add cells whenever you need them and fill them in your
own time. If every cell in a section is empty, that whole section and its line in
the contents list are hidden too, rather than leaving a heading over blank space.

**Working with a brand more than once.** Add each video to the same brand with
**Add another video** and they stay side by side on the page — a brand sits
wherever its first video sits, and all of its videos follow immediately after.
Brands are matched on name, so "Joto Ramen" and "joto ramen" count as the same
brand, but "Joto" would be a different one.

**The logo on each frame.** Each card wears its brand's logo in a circle on the
bottom edge of the video frame, taken from the *Client logos* tab and matched by
name. If no logo has that exact name the card falls back to showing the brand
name underneath, and the admin panel flags it on the brand header so you know
which logo is missing.

**How videos play.** An uploaded video plays in its own card, in place. Starting
one stops whatever else was playing, so only ever one video runs at a time. The
play and pause chrome stays hidden until you hover over the card — on a phone,
where there is no hover, it appears once playback starts so there is still a way
to pause. Posts embedded from Instagram or TikTok open in an overlay instead,
because the provider's own player has to run in a frame.

### What a link can be

- An **Instagram, TikTok, YouTube or Vimeo post** plays as an embed inside the
  lightbox. Instagram does not allow the underlying video file to be played
  directly from another site, so an embed is the only way to show a post that
  lives there, and the post has to be public.
- A **direct video file** — a URL ending in `.mp4`, `.mov`, `.webm` — plays
  inline, with your own poster frame and no platform branding.
- **Anything else**, including an ordinary Instagram profile link, cannot play.
  The admin panel says so on the row rather than leaving you with a dead card.

Uploading the file gives the best result: it plays inline, starts instantly, and
carries no third-party UI. Use links when the file is too large to upload or you
would rather point at the original post.

### Uploading a folder of videos at once

`scripts/Upload-Videos.ps1` uploads a whole folder in one go instead of adding
each video by hand. Name each file after the brand — `Joto Ramen.mp4`,
`joto-ramen-2.mp4`, `Safaricom.mp4` — and run it from the repository root in
PowerShell:

```powershell
.\scripts\Upload-Videos.ps1 -Folder "$env:USERPROFILE\Videos\Brands" -Email you@example.com
```

It prints what it is about to do and waits for you to confirm before uploading
anything. Add `-WhatIf` to see the plan and stop there.

Matching ignores case, dashes and underscores, and a trailing number, so
`joto-ramen-2.mp4` belongs to "Joto Ramen". Several files for one brand fill
that brand's empty cells first, and the script creates extra cells when a brand
has more videos than cells. Files it cannot match to a brand, and files over the
size limit, are listed as skipped rather than silently dropped.

You are prompted for your admin password each run; it is never stored.

**Client logos.** Upload a logo, give it a name, and it joins the "In
collaboration with" strip. *Fit* chooses between filling the circle and sitting
inside it, and *Zoom* / *Position* nudge the crop when a logo sits off centre.

Deleting a cell or a logo also deletes the file it uploaded, so storage does not
fill up with orphans.

## Limits and notes

- **Video size** is capped at **50 MB** per file, the ceiling on the Supabase
  free plan. Instagram-length clips are usually well under it. To raise it,
  upgrade the plan, then change the limit in Dashboard → Storage → `videos`
  bucket → Settings, and the matching number in `supabase/schema.sql`.
- **Images** are capped at 10 MB. Square images look best for logos — they are
  cropped into a circle.
- **The key in `assets/js/config.js` is the publishable (anon) key**, which is
  meant to be public. Row level security is what actually protects the data: an
  anonymous visitor can only read published rows, and writing requires a signed
  in admin. Never put a `service_role` or secret key in this repository — it
  would let anyone with the page source edit or wipe the site.
- Both storage buckets are **public read**, which is what makes videos playable
  by visitors. Do not upload anything you would not want shared.
- `/admin` is marked `noindex` and listed in `robots.txt`, so it stays out of
  search results. It is not a secret URL though — the password is what protects
  it.

## Local development

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>. It talks to the same Supabase project, so
changes you save locally are live changes.
