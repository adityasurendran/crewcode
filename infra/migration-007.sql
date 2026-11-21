



alter table projects enable row level security;
alter table tasks enable row level security;
alter table events enable row level security;
alter table artifacts enable row level security;
alter table api_connections enable row level security;
alter table audit_log enable row level security;
alter table project_api_keys enable row level security;

create or replace function current_org_id() returns uuid as $$
  select nullif(current_setting('app.current_org_id', true), '')::uuid
$$ language sql stable;

drop policy if exists projects_read on projects;
create policy projects_read on projects for select using (org_id = current_org_id());
drop policy if exists tasks_read on tasks;
create policy tasks_read on tasks for select using (
  project_id in (select id from projects where org_id = current_org_id())
);
drop policy if exists events_read on events;
create policy events_read on events for select using (
  task_id in (select t.id from tasks t join projects p on p.id=t.project_id where p.org_id = current_org_id())
);
drop policy if exists connections_read on api_connections;
create policy connections_read on api_connections for select using (
  project_id in (select id from projects where org_id = current_org_id())
);

create table if not exists templates (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  repo_url text not null,
  description text default '',
  active boolean default true
);
insert into templates (slug, name, repo_url, description) values
  ('next-supabase', 'Next.js + Supabase', 'templates/next-supabase', 'Blessed starter: Next 14, Supabase auth, Postgres'),
  ('next-stripe', 'Next.js + Stripe', 'templates/next-stripe', 'SaaS starter with Stripe checkout + webhooks'),
  ('node-express-api', 'Node Express API', 'templates/node-express-api', 'Backend API template with Postgres + auth'),
  ('vue-spa', 'Vue SPA', 'templates/vue-spa', 'Vue 3 + Vite + vue-router'),
  ('flask-api', 'Flask API', 'templates/flask-api', 'Python Flask + psycopg2 + gunicorn'),
  ('svelte-spa', 'Svelte SPA', 'templates/svelte-spa', 'Svelte 4 + Vite'),
  ('django-api', 'Django API', 'templates/django-api', 'Django + DRF + gunicorn')
on conflict (slug) do nothing;
