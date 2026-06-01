alter table rounds
add column if not exists bombshell_contestant_id uuid references contestants(id);
