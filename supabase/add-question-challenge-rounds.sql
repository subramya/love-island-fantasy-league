create table if not exists round_questions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references rounds(id),
  question_text text not null,
  question_order int default 0,
  created_at timestamp default now()
);

alter table predictions
add column if not exists round_question_id uuid references round_questions(id);

alter table round_results
add column if not exists round_question_id uuid references round_questions(id);
