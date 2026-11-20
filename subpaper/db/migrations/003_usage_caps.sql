-- Per-org daily counters (UTC day) for cost control: Claude extractions and reply emails.
create table usage_daily (
  org_id uuid not null references orgs on delete cascade,
  day date not null,
  extractions int not null default 0,
  replies int not null default 0,
  primary key (org_id, day)
);

alter table usage_daily enable row level security;
alter table usage_daily force row level security;
create policy tenant on usage_daily
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

-- Optional per-org override; null means use DAILY_EXTRACTION_CAP (default 100).
alter table orgs add column daily_extraction_cap int check (daily_extraction_cap is null or daily_extraction_cap >= 0);
