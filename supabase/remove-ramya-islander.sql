with ramya_islander as (
  select id
  from contestants
  where name = 'Ramya Subramanian'
)
update rounds
set bombshell_contestant_id = null
where bombshell_contestant_id in (select id from ramya_islander);

delete from predictions
where bombshell_contestant_id in (
  select id from contestants where name = 'Ramya Subramanian'
)
or contestant_1_id in (
  select id from contestants where name = 'Ramya Subramanian'
)
or contestant_2_id in (
  select id from contestants where name = 'Ramya Subramanian'
);

delete from round_bombshells
where bombshell_contestant_id in (
  select id from contestants where name = 'Ramya Subramanian'
);

delete from actual_couples
where contestant_1_id in (
  select id from contestants where name = 'Ramya Subramanian'
)
or contestant_2_id in (
  select id from contestants where name = 'Ramya Subramanian'
);

delete from round_results
where bombshell_contestant_id in (
  select id from contestants where name = 'Ramya Subramanian'
)
or contestant_id in (
  select id from contestants where name = 'Ramya Subramanian'
);

delete from contestants
where name = 'Ramya Subramanian';
