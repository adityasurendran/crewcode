
alter table tasks add column if not exists preview_url text;
alter table artifacts add column if not exists created_by text default 'system';
create index if not exists artifacts_kind_idx on artifacts(kind, created_at);
