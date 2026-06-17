create table if not exists round_prediction_modules (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id),
  prediction_type text not null,
  title text,
  sort_order int default 0,
  created_at timestamp default now()
);

alter table round_bombshells
add column if not exists module_id uuid references round_prediction_modules(id);

alter table round_questions
add column if not exists module_id uuid references round_prediction_modules(id);

alter table predictions
add column if not exists module_id uuid references round_prediction_modules(id);

alter table actual_couples
add column if not exists module_id uuid references round_prediction_modules(id);

alter table round_results
add column if not exists module_id uuid references round_prediction_modules(id);

insert into round_prediction_modules (round_id, prediction_type, title, sort_order)
select rounds.id, rounds.prediction_type, null, 1
from rounds
where not exists (
  select 1 from round_prediction_modules where round_prediction_modules.round_id = rounds.id
);

update predictions
set module_id = round_prediction_modules.id
from round_prediction_modules
where predictions.round_id = round_prediction_modules.round_id
  and predictions.module_id is null;

update actual_couples
set module_id = round_prediction_modules.id
from round_prediction_modules
where actual_couples.round_id = round_prediction_modules.round_id
  and actual_couples.module_id is null;

update round_results
set module_id = round_prediction_modules.id
from round_prediction_modules
where round_results.round_id = round_prediction_modules.round_id
  and round_results.module_id is null;

update round_bombshells
set module_id = round_prediction_modules.id
from round_prediction_modules
where round_bombshells.round_id = round_prediction_modules.round_id
  and round_bombshells.module_id is null;

update round_questions
set module_id = round_prediction_modules.id
from round_prediction_modules
where round_questions.round_id = round_prediction_modules.round_id
  and round_questions.module_id is null;
