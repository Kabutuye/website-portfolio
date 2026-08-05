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
vercel.json             static hosting config
```

The page renders completely from the HTML on its own. Supabase only *adds* the
videos and any logos you upload later, so if the database is ever unreachable
the portfolio still loads and reads correctly.

## One time setup

### 1. Create the tables

Supabase dashboard → **SQL Editor** → **New query**. Paste all of
`supabase/schema.sql`, run it. Then do the same with `supabase/seed.sql`.

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
sections as the page. For each cell you can:

- **Upload** an `.mp4` (or `.mov` / `.webm`) straight from your phone or laptop —
  the progress bar shows how far along it is,
- or **Use a link** if the file is already hosted somewhere,
- add an optional **poster** image (the still shown before playback). Without
  one, the browser uses the first frame of the video,
- add a **caption** and a **link to the post** — both appear when a visitor
  opens the video,
- **Show on site** hides a cell without deleting it, which is handy while you
  are still editing something,
- **↑ / ↓** reorder cells inside a section, and **Add a cell** creates a new one.

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
