-- Seed the tables with the twenty partnerships and twenty one logos that
-- were hard coded in the original single file portfolio.
--
-- Safe to re-run: it only inserts rows that are not already there, so it
-- will never duplicate work you have done in the admin panel.

insert into public.projects (category, brand_name, sort_order)
select v.category, v.brand_name, v.sort_order
from (values
  ('style', 'Artfit', 10),
  ('style', 'Binne & Buite', 20),
  ('beauty', 'Coral Studio KE', 10),
  ('beauty', 'Lilly Hair & Beauty Parlour', 20),
  ('beauty', 'Rushmea Haircare', 30),
  ('beauty', 'Mikalla', 40),
  ('beauty', 'Bella Zuri', 50),
  ('taste', 'Lavilla.ke', 10),
  ('taste', 'Chiq Japanese', 20),
  ('taste', 'Joto Ramen', 30),
  ('taste', 'The Supreme Smash Burger', 40),
  ('taste', 'Coficaf', 50),
  ('taste', 'Cafenbo', 60),
  ('taste', 'Ayeyo', 70),
  ('everyday', 'Safaricom', 10),
  ('everyday', 'iPhone House KE', 20),
  ('home', 'Amaya Life', 10),
  ('home', 'Floral Culture Kenya', 20),
  ('home', 'Solene Glow', 30),
  ('escape', 'Exploring Nomad', 10)
) as v(category, brand_name, sort_order)
where not exists (
  select 1 from public.projects p
  where p.category = v.category and p.brand_name = v.brand_name
);

insert into public.logos (name, image_url, fit, object_position, scale, sort_order)
select v.name, v.image_url, v.fit, v.object_position, v.scale, v.sort_order
from (values
  ('Artfit', '/assets/img/logos/artfit.jpg', 'cover', '50% 44.7%', 1.82, 10),
  ('Binne & Buite', '/assets/img/logos/binne-and-buite.jpg', 'cover', '50% 46.0%', 1.80, 20),
  ('Coral Studio KE', '/assets/img/logos/coral-studio-ke.jpg', 'cover', '50% 44.8%', 1.80, 30),
  ('Lilly Hair & Beauty Parlour', '/assets/img/logos/lilly-hair-and-beauty-parlour.jpg', 'cover', '50% 40.6%', 1.84, 40),
  ('Rushmea Haircare', '/assets/img/logos/rushmea-haircare.jpg', 'cover', '50% 46.3%', 1.84, 50),
  ('Mikalla', '/assets/img/logos/mikalla.jpg', 'cover', '50% 37.4%', 1.84, 60),
  ('Bella Zuri', '/assets/img/logos/bella-zuri.jpg', 'cover', '50% 39.5%', 1.84, 70),
  ('Lavilla.ke', '/assets/img/logos/lavilla-ke.jpg', 'cover', '50% 45.3%', 1.84, 80),
  ('Chiq Japanese', '/assets/img/logos/chiq-japanese.jpg', 'cover', '50% 46.5%', 1.85, 90),
  ('Joto Ramen', '/assets/img/logos/joto-ramen.jpg', 'cover', '50% 41.2%', 1.82, 100),
  ('The Supreme Smash Burger', '/assets/img/logos/the-supreme-smash-burger.jpg', 'cover', '50% 44.7%', 1.81, 110),
  ('Coficaf', '/assets/img/logos/coficaf.jpg', 'cover', '50% 43.8%', 1.82, 120),
  ('Cafenbo', '/assets/img/logos/cafenbo.jpg', 'cover', '50% 44.7%', 1.82, 130),
  ('Ayeyo', '/assets/img/logos/ayeyo.jpg', 'cover', '50% 44.7%', 1.82, 140),
  ('Safaricom', '/assets/img/logos/safaricom.jpg', 'cover', '50% 45.0%', 1.81, 150),
  ('iPhone House KE', '/assets/img/logos/iphone-house-ke.jpg', 'cover', '50% 45.6%', 1.80, 160),
  ('Amaya Life', '/assets/img/logos/amaya-life.jpg', 'cover', '50% 48.0%', 1.81, 170),
  ('Floral Culture Kenya', '/assets/img/logos/floral-culture-kenya.jpg', 'cover', '50% 48.2%', 1.81, 180),
  ('Solene Glow', '/assets/img/logos/solene-glow.jpg', 'cover', '50% 44.7%', 1.82, 190),
  ('Exploring Nomad', '/assets/img/logos/exploring-nomad.jpg', 'cover', '50% 52.1%', 1.82, 200),
  ('Vivo', '/assets/img/logos/vivo.png', 'contain', '50% 50%', 1.00, 210)
) as v(name, image_url, fit, object_position, scale, sort_order)
where not exists (select 1 from public.logos l where l.name = v.name);
