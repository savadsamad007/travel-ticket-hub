-- Daily report email settings on agency_profile
alter table public.agency_profile
  add column if not exists report_email text,
  add column if not exists daily_report_enabled boolean not null default false,
  add column if not exists daily_report_time text not null default '23:59';
