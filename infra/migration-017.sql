
alter table projects add column if not exists require_approval boolean not null default true;
