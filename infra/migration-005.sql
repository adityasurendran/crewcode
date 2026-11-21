-- Migration 005: org project credits + stripe metering link
alter table projects add column if not exists credits_usd numeric default 0;
alter table projects add column if not exists stripe_customer_id text;
alter table projects add column if not exists stripe_subscription_id text;
create index if not exists projects_stripe_idx on projects(stripe_customer_id);
