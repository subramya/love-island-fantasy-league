create table if not exists round_bombshells (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references rounds(id),
  bombshell_contestant_id uuid references contestants(id),
  created_at timestamp default now()
);

alter table predictions
add column if not exists bombshell_contestant_id uuid references contestants(id);

alter table round_results
add column if not exists bombshell_contestant_id uuid references contestants(id);

insert into round_bombshells (round_id, bombshell_contestant_id)
select id, bombshell_contestant_id
from rounds
where prediction_type = 'bombshell_arrival_prediction'
  and bombshell_contestant_id is not null
  and not exists (
    select 1
    from round_bombshells
    where round_bombshells.round_id = rounds.id
      and round_bombshells.bombshell_contestant_id = rounds.bombshell_contestant_id
  );

update predictions
set bombshell_contestant_id = rounds.bombshell_contestant_id
from rounds
where predictions.round_id = rounds.id
  and rounds.prediction_type = 'bombshell_arrival_prediction'
  and predictions.prediction_role = 'target_pick'
  and predictions.bombshell_contestant_id is null;

update round_results
set bombshell_contestant_id = rounds.bombshell_contestant_id
from rounds
where round_results.round_id = rounds.id
  and rounds.prediction_type = 'bombshell_arrival_prediction'
  and round_results.result_type = 'target_pick'
  and round_results.bombshell_contestant_id is null;
