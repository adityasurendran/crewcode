-- Chat-first model: per-teammate threads, messages, and a shared live notes doc.
-- Tasks remain internal execution units (hidden from users); thread_id links them.

create table if not exists threads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  owner_id text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (project_id, owner_id)
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null,
  role text not null,
  content text not null default '',
  meta jsonb default '{}',
  created_at timestamptz default now()
);
create index if not exists messages_thread_idx on messages (thread_id, created_at);

create table if not exists notes (
  project_id uuid primary key,
  content text not null default '',
  updated_by text,
  updated_at timestamptz default now()
);

alter table tasks add column if not exists thread_id uuid;
