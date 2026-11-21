-- Migration 013: central provider credentials + mandated model (entered once)
create table if not exists app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);
