alter table league_users
add column if not exists email text;

create unique index if not exists league_users_email_key
on league_users (email);
