-- Target Postgres schema (not yet wired into the app; MVP uses src/lib/store.ts).
create table orgs (id uuid primary key default gen_random_uuid(), name text not null, created_at timestamptz default now());
create table users (id uuid primary key default gen_random_uuid(), org_id uuid not null references orgs, email text unique not null);
create table requirements (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references orgs,
  gc_name text not null, config jsonb not null
);
create table documents (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references orgs,
  requirement_id uuid references requirements, filename text not null, storage_key text not null,
  doc_type text, extraction jsonb, issues jsonb, status text,
  expires_on date, uploaded_at timestamptz default now()
);
create index on documents (org_id, expires_on);
alter table documents enable row level security;
create policy tenant on documents using (org_id = current_setting('app.org_id')::uuid);
