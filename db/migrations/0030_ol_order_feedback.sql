-- 0030 Order feedback: a star rating after delivery, and reports of a problem with a specific item.
--
-- DRAFT: applied nowhere. Rehearse on the local database; production needs the founder's approval.
-- Requires 0021 (ol_orders) and 0024 (ol_order_items).
--
-- What these hold, and what they do not:
--   * ol_order_ratings: one row per delivered order (unique on order_id): overall stars, optional delivery stars, an optional comment.
--   * ol_order_issues: one row per reported problem with one item of a delivered order: missing / wrong / damaged / quality, how
--     many pieces, an optional note. A report only opens a case ('open'). It never moves money by itself: a person on the
--     operations side approves it, and the refund then goes through the existing refund queue (ol_refunds, server/refunds.ts),
--     keyed on the order, so the cumulative refund cap and the double-refund guards still apply.
--   * Both are read and written only by the server (service role), after it has checked the order belongs to the caller.
--
-- Personal data: `comment` and `note` are free text written by a customer. The privacy erasure (DPDP, ol_privacy_requests) must
-- clear them for the subject: customer_hash / user_id identify the owner. Add these two tables to the erasure before applying.

create table if not exists public.ol_order_ratings (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.ol_orders(id) on delete cascade,
  customer_hash   text not null,
  user_id         uuid references auth.users(id) on delete set null,
  rating          smallint not null check (rating between 1 and 5),
  delivery_rating smallint check (delivery_rating between 1 and 5),
  comment         text check (comment is null or char_length(comment) <= 500),
  created_at      timestamptz not null default now(),
  constraint ol_order_ratings_one_per_order unique (order_id)
);

create table if not exists public.ol_order_issues (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.ol_orders(id) on delete cascade,
  order_item_id  uuid not null references public.ol_order_items(id) on delete cascade,
  kind           text not null check (kind in ('missing', 'wrong', 'damaged', 'quality')),
  qty            integer not null default 1 check (qty between 1 and 50),
  note           text check (note is null or char_length(note) <= 500),
  status         text not null default 'open' check (status in ('open', 'approved', 'rejected', 'refunded')),
  customer_hash  text not null,
  user_id        uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  resolved_by    uuid references auth.users(id) on delete set null,
  resolved_at    timestamptz
);
-- One open report per item and kind: pressing the button twice does not open two cases.
create unique index if not exists ol_order_issues_one_open on public.ol_order_issues (order_item_id, kind) where status = 'open';
create index if not exists ol_order_issues_order on public.ol_order_issues (order_id);
create index if not exists ol_order_issues_queue on public.ol_order_issues (status, created_at);

alter table public.ol_order_ratings enable row level security;
alter table public.ol_order_issues  enable row level security;
revoke all on table public.ol_order_ratings, public.ol_order_issues from anon, authenticated;
grant select, insert on table public.ol_order_ratings to service_role;
grant select, insert, update on table public.ol_order_issues to service_role;
