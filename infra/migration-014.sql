
create table if not exists vault_secrets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  provider text not null,
  enc text not null,
  created_at timestamptz default now()
);
create index if not exists vault_secrets_project_idx on vault_secrets(project_id);
