
alter table tasks add column if not exists priority int default 3; 
create index if not exists tasks_priority_idx on tasks(priority, created_at);
