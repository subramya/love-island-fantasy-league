alter table round_questions
add column if not exists answer_type text default 'islander';

alter table round_results
add column if not exists contestant_2_id uuid references contestants(id);
