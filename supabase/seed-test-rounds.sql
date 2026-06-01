insert into rounds (title, prediction_type, status)
select *
from (
  values
    ('Episode 1: Initial Coupling', 'initial_coupling_prediction', 'open'),
    ('Test Round: Recoupling', 'recoupling_prediction', 'open'),
    ('Test Round: Elimination', 'elimination_prediction', 'open'),
    ('Test Round: Bombshell Arrival', 'bombshell_arrival_prediction', 'open'),
    ('Test Round: No-score Episode', 'no_score_episode', 'open')
) as test_rounds(title, prediction_type, status)
where not exists (
  select 1
  from rounds
  where rounds.title = test_rounds.title
);
