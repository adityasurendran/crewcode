


create extension if not exists "pgcrypto";

create table if not exists orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references orgs(id) on delete cascade,
  name text not null,
  repo_url text not null,
  default_branch text not null default 'main',
  created_at timestamptz default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  owner_id text not null,
  objective text not null,
  status text not null default 'queued'
    check (status in ('queued','running','testing','blocked','done','merged')),
  branch text not null,
  sandbox_id text,
  allowlist jsonb not null default '[]',
  budget_tokens int not null default 200000,
  tokens_used int not null default 0,
  created_at timestamptz default now()
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade,
  type text not null,
  
  payload jsonb not null default '{}',
  created_at timestamptz default now()
);
create index if not exists events_task_idx on events(task_id, created_at);

create table if not exists artifacts (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade,
  kind text not null, 
  uri text not null,
  meta jsonb not null default '{}',
  created_at timestamptz default now()
);

create table if not exists api_connections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  provider text not null, 
  vault_ref text not null, 
  scopes jsonb not null default '{}',
  created_at timestamptz default now()
);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  actor text not null,
  action text not null,
  meta jsonb not null default '{}',
  created_at timestamptz default now()
);
