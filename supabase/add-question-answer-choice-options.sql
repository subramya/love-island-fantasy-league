create table if not exists round_question_answer_choices (
  id uuid primary key default gen_random_uuid(),
  round_question_id uuid not null references round_questions(id) on delete cascade,
  contestant_id uuid not null references contestants(id),
  contestant_2_id uuid references contestants(id),
  created_at timestamp default now()
);
