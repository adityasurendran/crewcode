-- Migration 006: org memberships + rollback diff artifacts
create index if not exists memberships_org_idx on memberships(org_id, user_id);
alter table artifacts add column if not exists diff_uri text;
