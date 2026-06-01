insert into rounds (title, prediction_type, status)
select 'Episode 1: Initial Coupling', 'initial_coupling_prediction', 'open'
where not exists (
  select 1
  from rounds
  where title = 'Episode 1: Initial Coupling'
);
