-- Migration 008: notification settings per org
create table if not exists org_notify_settings (
  org_id uuid primary key references orgs(id) on delete cascade,
  slack_webhook_url text default '',
  email_on_blocked boolean default true,
  email_on_merged boolean default true,
  updated_at timestamptz default now()
);
