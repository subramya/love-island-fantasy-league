alter table contestants
add column if not exists contestant_type text default 'original_islander';

update contestants
set contestant_type = 'original_islander'
where contestant_type is null;
