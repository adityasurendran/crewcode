
create index if not exists tasks_project_idx on tasks(project_id, created_at);
create index if not exists audit_project_idx on audit_log(project_id, created_at);
alter table tasks add column if not exists model text default 'default';
