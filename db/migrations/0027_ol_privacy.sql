-- 0027 (DRAFT) Privacy: consent records and privacy requests (DPDP Act 2023, DPDP Rules 2025).
-- DRAFT — the number is a placeholder; the OS repo ledger (Repo-1-) assigns the real one. NOT APPLIED
-- to any database. Needs the founder's approval. Independent of 0025/0026 (it can go before or after).
--
-- Why: the Act puts the burden of proving notice and consent on us (s.6(10)), makes withdrawal as easy
-- as giving (s.6(4)), and gives people rights to access, correct, erase, nominate and complain
-- (s.11–14) that must be answered within a published period (Rule 14: at most 90 days).
--   1. ol_consents: one row per consent choice, append-only. The current state of a purpose is its
--      newest row. Rows are never changed, so the history is evidence.
--   2. ol_privacy_requests: every export, erasure, correction, nomination and grievance, with a
--      reference number the customer sees, a status and the date we must answer by.
--   3. ol_consent_current: the newest choice per person and purpose, for the Master and for checks
--      before any marketing send.
-- All additive: two new tables, one view, one trigger function. Nothing existing is changed.
--
-- Until this is applied the server keeps working (frontend/server/privacy.ts, privacyTablesReady):
-- consents stay on the phone and are sent again later, requests are answered but only logged
-- (without personal data), and erasure still anonymises the customer's ol_* rows.
--
-- user_id has no foreign key to auth.users on purpose: consent evidence and the record that an
-- erasure was done must outlive the login itself (deleting a login would otherwise rewrite or remove
-- them). The retention schedule in docs/DPDP.md says when these rows are purged.

begin;

-- ---------------------------------------------------------------------------------------------
-- 1. Consent records (append-only)
-- ---------------------------------------------------------------------------------------------
create table if not exists public.ol_consents (
  id              bigint generated always as identity primary key,
  user_id         uuid not null,
  purpose         text not null check (purpose in ('marketing','personalisation','location_suggestions','notice_acknowledged','age_18_plus')),
  granted         boolean not null,
  notice_version  text not null check (char_length(notice_version) between 1 and 40),
  source          text not null check (source in ('sign_in','privacy_screen','consent_manager','support')),
  given_at        timestamptz,
  created_at      timestamptz not null default now()
);
comment on table  public.ol_consents is 'Consent choices, one row per change, never updated. The newest row per (user_id, purpose) is the current choice. Evidence under DPDP Act s.6(10).';
comment on column public.ol_consents.user_id        is 'The person (auth.users id). No foreign key: the evidence outlives the login.';
comment on column public.ol_consents.purpose        is 'What the choice is about: marketing, personalisation, location_suggestions (optional purposes); notice_acknowledged, age_18_plus (declarations at sign-in).';
comment on column public.ol_consents.granted        is 'true = given, false = withdrawn.';
comment on column public.ol_consents.notice_version is 'Version of the privacy notice shown when the choice was made (constants/privacy.ts noticeVersion).';
comment on column public.ol_consents.source         is 'Where the choice was made: sign_in, privacy_screen, consent_manager (a registered Consent Manager, later), support (recorded by our team on the person''s request).';
comment on column public.ol_consents.given_at       is 'When the phone recorded the choice, if earlier than created_at (a choice made while signed out is sent after sign-in). Reported by the phone; created_at is the server''s own time.';
comment on column public.ol_consents.created_at     is 'When the server received the choice.';
create index if not exists ol_consents_user on public.ol_consents (user_id, purpose, created_at desc);

-- Rows are evidence: no updates, and deletes only from the retention purge job, which sets
-- `set local ol.privacy_purge = 'on'` in its own transaction.
create or replace function public.ol_consents_append_only() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' and current_setting('ol.privacy_purge', true) = 'on' then
    return old;
  end if;
  raise exception 'OL_BAD_REQUEST: consent records cannot be changed or deleted';
end $$;
drop trigger if exists ol_consents_append_only on public.ol_consents;
create trigger ol_consents_append_only before update or delete on public.ol_consents
  for each row execute function public.ol_consents_append_only();

create or replace view public.ol_consent_current with (security_invoker = true) as
  select distinct on (user_id, purpose) user_id, purpose, granted, notice_version, source, coalesce(given_at, created_at) as decided_at
  from public.ol_consents
  order by user_id, purpose, created_at desc, id desc;
comment on view public.ol_consent_current is 'Current consent per person and purpose (newest ol_consents row). Check this before any marketing send or personalisation.';

-- ---------------------------------------------------------------------------------------------
-- 2. Privacy requests
-- ---------------------------------------------------------------------------------------------
create table if not exists public.ol_privacy_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid,
  kind         text not null check (kind in ('export','erasure','correction','nominee','grievance')),
  status       text not null default 'received' check (status in ('received','in_progress','completed','partially_completed','rejected','withdrawn')),
  reference    text not null unique check (reference ~ '^[A-Z]{2}-[0-9]{6}-[A-Z0-9]{6}$'),
  details      jsonb not null default '{}'::jsonb,
  due_at       timestamptz,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table  public.ol_privacy_requests is 'Requests under the DPDP Act: data download (export), erasure, correction, nomination and grievances. Each has a reference the customer sees.';
comment on column public.ol_privacy_requests.user_id     is 'Who asked (auth.users id). No foreign key: the record that we acted must outlive the login.';
comment on column public.ol_privacy_requests.kind        is 'export (s.11), erasure (s.12), correction (s.12), nominee (s.14), grievance (s.13).';
comment on column public.ol_privacy_requests.status      is 'received → in_progress → completed / partially_completed (something is kept by law or waits for review) / rejected / withdrawn.';
comment on column public.ol_privacy_requests.reference   is 'Reference shown to the customer, e.g. GR-260927-7KQ2MX (kind, date, random).';
comment on column public.ol_privacy_requests.details     is 'What was asked and what was done: message, nominee, counts of rows erased, what was kept and why. Erased on request except what proves the request was handled.';
comment on column public.ol_privacy_requests.due_at      is 'When we must answer by (published response period; Rule 14: at most 90 days).';
comment on column public.ol_privacy_requests.resolved_at is 'When it was answered or completed.';
comment on column public.ol_privacy_requests.created_at  is 'When it was received.';
comment on column public.ol_privacy_requests.updated_at  is 'When it last changed (set automatically).';
create index if not exists ol_privacy_requests_user on public.ol_privacy_requests (user_id, created_at desc);
create index if not exists ol_privacy_requests_open on public.ol_privacy_requests (due_at) where status in ('received','in_progress');
drop trigger if exists ol_privacy_requests_updated_at on public.ol_privacy_requests;
create trigger ol_privacy_requests_updated_at before update on public.ol_privacy_requests
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- Server only, like every other ol_ table: RLS on, no policies, no grants to anon/authenticated.
-- ---------------------------------------------------------------------------------------------
alter table public.ol_consents enable row level security;
alter table public.ol_privacy_requests enable row level security;
revoke all on table public.ol_consents, public.ol_privacy_requests, public.ol_consent_current from anon, authenticated;
grant select, insert, delete on table public.ol_consents to service_role;  -- delete only passes the purge guard above
grant select on table public.ol_consent_current to service_role;
grant select, insert, update, delete on table public.ol_privacy_requests to service_role;
revoke all on function public.ol_consents_append_only() from public, anon, authenticated;

commit;
