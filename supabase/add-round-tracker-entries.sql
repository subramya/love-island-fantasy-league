create table if not exists round_tracker_entries (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references rounds(id),
  contestant_id uuid references contestants(id),
  tracker_state text not null,
  partner_contestant_id uuid references contestants(id),
  created_at timestamp default now()
);
