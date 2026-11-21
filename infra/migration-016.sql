-- Crew roles/experience per project, and agent interaction mode per turn.
create table if not exists crew_members (
  project_id uuid not null,
  owner_id text not null,
  role text not null default 'developer',
  experience text not null default 'beginner',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (project_id, owner_id)
);

alter table tasks add column if not exists mode text;
alter table messages add column if not exists mode text;
