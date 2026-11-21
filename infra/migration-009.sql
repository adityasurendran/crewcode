-- Migration 009: task priority
alter table tasks add column if not exists priority int default 3; -- 1=highest
create index if not exists tasks_priority_idx on tasks(priority, created_at);
