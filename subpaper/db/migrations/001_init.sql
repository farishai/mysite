create extension if not exists pgcrypto;

create table orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs on delete cascade,
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table sessions (
  token_hash text primary key,
  user_id uuid not null references users on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index on sessions (expires_at);

create table requirements (
  org_id uuid primary key references orgs on delete cascade,
  config jsonb not null,
  updated_at timestamptz not null default now()
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs on delete cascade,
  filename text not null,
  extraction jsonb not null,
  issues jsonb not null,
  status text not null check (status in ('compliant','warning','non_compliant')),
  expires_on date,
  uploaded_at timestamptz not null default now()
);
create index on documents (org_id, uploaded_at desc);
create index on documents (org_id, expires_on);

-- Tenant isolation: every query on these tables must run inside withOrg()
-- (sets app.org_id). FORCE applies the policy to the table owner too.
alter table requirements enable row level security;
alter table requirements force row level security;
create policy tenant on requirements
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

alter table documents enable row level security;
alter table documents force row level security;
create policy tenant on documents
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
