
create table if not exists agent_instances (
  owner_id text primary key,
  port int not null,
  pid int,
  started_at timestamptz default now(),
  last_used timestamptz default now()
);
create table if not exists agent_sessions (
  owner_id text not null,
  task_id uuid not null,
  session_id text not null,
  updated_at timestamptz default now(),
  primary key (owner_id, task_id)
);
