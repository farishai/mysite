-- Each org gets an unguessable inbound address: <inbound_token>@<INBOUND_DOMAIN>
alter table orgs add column inbound_token text not null
  default lower(encode(gen_random_bytes(9), 'hex')) unique;

-- One row per received email; (org_id, message_id) makes webhook retries idempotent.
create table inbound_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs on delete cascade,
  message_id text not null,
  sender text not null,
  subject text not null default '',
  attachment_count int not null default 0,
  processed_count int not null default 0,
  status text not null default 'processing' check (status in ('processing','done','partial','failed','empty')),
  error text,
  received_at timestamptz not null default now(),
  unique (org_id, message_id)
);

alter table inbound_messages enable row level security;
alter table inbound_messages force row level security;
create policy tenant on inbound_messages
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

alter table documents add column source text not null default 'upload' check (source in ('upload','email'));
alter table documents add column sender text;
alter table documents add column inbound_message_id uuid references inbound_messages on delete set null;
