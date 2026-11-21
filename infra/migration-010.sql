
create table if not exists cost_mapping (
  project_id uuid references projects(id) on delete cascade,
  kind text not null,
  tier text not null,
  primary key (project_id, kind)
);
create index if not exists events_type_idx on events(type, created_at);
