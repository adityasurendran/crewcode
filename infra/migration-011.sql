
create table if not exists shares (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  pin_hash text not null,
  tunnel_url text not null default '',
  expires_at timestamptz not null,
  revoked boolean default false,
  created_by text not null default 'host',
  created_at timestamptz default now()
);
create index if not exists shares_pin_idx on shares(pin_hash) where revoked = false;
create index if not exists shares_project_idx on shares(project_id, created_at);
