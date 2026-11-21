-- Migration 003: users, memberships, project api keys
create table if not exists users (
  id text primary key,
  email text unique not null,
  created_at timestamptz default now()
);
create table if not exists memberships (
  org_id uuid references orgs(id) on delete cascade,
  user_id text references users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member','viewer')),
  primary key (org_id, user_id)
);
create table if not exists project_api_keys (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  prefix text not null,
  hash text not null,
  created_by text not null,
  created_at timestamptz default now()
);
create index if not exists project_api_keys_prefix_idx on project_api_keys(prefix);
