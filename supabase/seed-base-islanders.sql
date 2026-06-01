with base_islanders(name, image_url, contestant_type) as (
  values
    ('Aniya Harvey', '/islanders/aniya-harvey.webp', 'original_islander'),
    ('Beatriz Hatz', '/islanders/beatriz-hatz.webp', 'original_islander'),
    ('Bryce Alakai Dettloff', '/islanders/bryce-dettloff.webp', 'original_islander'),
    ('Gabriel Vasconcelos', '/islanders/gabriel-vasconcelos.webp', 'original_islander'),
    ('KC Chandler', '/islanders/kc-chandler.webp', 'original_islander'),
    ('Mackenzie "Kenzie" Annis', '/islanders/kenzie-annis.webp', 'original_islander'),
    ('Melanie Moreno', '/islanders/melanie-moreno.webp', 'original_islander'),
    ('Sincere Rhea', '/islanders/sincere-rhea.webp', 'original_islander'),
    ('Sean Reifel', '/islanders/sean-reifel.webp', 'original_islander'),
    ('Trinity Tatum', '/islanders/trinity-tatum.webp', 'original_islander'),
    ('Zach Georgiou', '/islanders/zach-georgiou.webp', 'original_islander')
),
updated as (
  update contestants
  set
    status = 'active',
    contestant_type = base_islanders.contestant_type,
    image_url = base_islanders.image_url
  from base_islanders
  where contestants.name = base_islanders.name
  returning contestants.name
)
insert into contestants (name, status, contestant_type, image_url)
select
  base_islanders.name,
  'active',
  base_islanders.contestant_type,
  base_islanders.image_url
from base_islanders
where not exists (
  select 1
  from contestants
  where contestants.name = base_islanders.name
);
