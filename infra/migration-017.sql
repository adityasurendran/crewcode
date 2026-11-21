-- Youth-safe default: AI changes require a human to approve the merge.
alter table projects add column if not exists require_approval boolean not null default true;
