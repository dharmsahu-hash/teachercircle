create table feature_flags (
  key         text primary key,
  enabled     boolean not null default false,
  updated_at  timestamptz default now()
);
insert into feature_flags (key, enabled) values ('payments_enabled', false);

create table plan_limits (
  role                        text primary key,
  free_connections_per_month  int not null default 3,
  yearly_price_amount         numeric(10,2) not null,
  yearly_price_currency       text not null default 'INR'
);
insert into plan_limits values
  ('student', 3, 499.00, 'INR'),
  ('parent',  3, 999.00, 'INR'),
  ('teacher', 0, 799.00, 'INR');

create table subscription (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references users(id) not null,
  billing_cycle text not null default 'yearly' check (billing_cycle = 'yearly'),
  status        text not null default 'none' check (status in ('none','pending','active','expired','cancelled')),
  started_at    timestamptz,
  expires_at    timestamptz,
  created_at    timestamptz default now()
);
create index idx_subscription_user on subscription (user_id);

create table payment_transaction (
  id              uuid primary key default gen_random_uuid(),
  subscription_id uuid references subscription(id) not null,
  provider        text not null check (provider in ('manual_upi','razorpay')),
  amount          numeric(10,2) not null,
  currency        text not null default 'INR',
  provider_ref    text,
  status          text not null default 'created' check (status in ('created','submitted','approved','rejected')),
  raw_payload     jsonb,
  verified_by     uuid references users(id),
  verified_at     timestamptz,
  created_at      timestamptz default now()
);
create index idx_payment_txn_status on payment_transaction (status) where status = 'submitted';

create or replace function is_payments_enabled() returns boolean
language sql stable as $$
  select enabled from feature_flags where key = 'payments_enabled';
$$;

create or replace function has_active_subscription(u uuid) returns boolean
language sql stable as $$
  select exists (
    select 1 from subscription
    where user_id = u and status = 'active' and expires_at > now()
  );
$$;

create or replace function monthly_connection_count(u uuid) returns int
language sql stable as $$
  select count(*)::int from contact_request
  where requester_id = u and created_at >= date_trunc('month', now());
$$;

create or replace function free_connections_limit_for(u uuid) returns int
language sql stable as $$
  select pl.free_connections_per_month from plan_limits pl
  join users usr on usr.role = pl.role
  where usr.id = u;
$$;

create or replace function approve_payment(txn_id uuid) returns void
language plpgsql security definer as $$
declare sub_id uuid;
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;

  update payment_transaction
  set status = 'approved', verified_by = auth.uid(), verified_at = now()
  where id = txn_id and status = 'submitted'
  returning subscription_id into sub_id;

  if not found then raise exception 'transaction not pending'; end if;

  update subscription
  set status = 'active', started_at = now(), expires_at = now() + interval '1 year'
  where id = sub_id;
end; $$;
