with base_islanders(name, image_url) as (
  values
    ('Aniya Harvey', '/islanders/aniya-harvey.webp'),
    ('Beatriz Hatz', '/islanders/beatriz-hatz.webp'),
    ('Bryce Alakai Dettloff', '/islanders/bryce-dettloff.webp'),
    ('Gabriel Vasconcelos', '/islanders/gabriel-vasconcelos.webp'),
    ('KC Chandler', '/islanders/kc-chandler.webp'),
    ('Mackenzie "Kenzie" Annis', '/islanders/kenzie-annis.webp'),
    ('Melanie Moreno', '/islanders/melanie-moreno.webp'),
    ('Sincere Rhea', '/islanders/sincere-rhea.webp'),
    ('Sean Reifel', '/islanders/sean-reifel.webp'),
    ('Trinity Tatum', '/islanders/trinity-tatum.webp'),
    ('Zach Georgiou', '/islanders/zach-georgiou.webp')
),
updated as (
  update contestants
  set
    status = 'active',
    image_url = base_islanders.image_url
  from base_islanders
  where contestants.name = base_islanders.name
  returning contestants.name
)
insert into contestants (name, status, image_url)
select
  base_islanders.name,
  'active',
  base_islanders.image_url
from base_islanders
where not exists (
  select 1
  from contestants
  where contestants.name = base_islanders.name
);
