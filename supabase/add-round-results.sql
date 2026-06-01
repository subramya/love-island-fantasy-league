create table if not exists round_results (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references rounds(id),
  result_type text not null,
  contestant_id uuid references contestants(id),
  created_at timestamp default now()
);
