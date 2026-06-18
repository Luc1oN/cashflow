-- CashFlow v2: transaction ledger, user settings, atomic settlement.

-- ---------------------------------------------------------------------------
-- Profile settings
-- ---------------------------------------------------------------------------
alter table profiles add column currency text not null default 'GBP' check (currency in ('GBP', 'EUR', 'USD'));
alter table profiles add column default_horizon int not null default 90 check (default_horizon between 7 and 730);
alter table profiles add column onboarding_dismissed boolean not null default false;

-- ---------------------------------------------------------------------------
-- Settlement history + immutable transaction ledger
-- ---------------------------------------------------------------------------
create table settlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  from_date date not null,
  to_date date not null,
  net numeric(12, 2) not null,
  item_count int not null,
  account_id uuid references accounts (id) on delete set null,
  created_at timestamptz not null default now()
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  settlement_id uuid references settlements (id) on delete cascade,
  account_id uuid references accounts (id) on delete set null,
  date date not null,
  label text not null,
  amount numeric(12, 2) not null,
  kind text not null check (kind in ('income', 'bill', 'savings', 'planned', 'adjustment')),
  created_at timestamptz not null default now()
);

create index settlements_user_idx on settlements (user_id, created_at desc);
create index transactions_user_date_idx on transactions (user_id, date desc);
create index transactions_settlement_idx on transactions (settlement_id);

alter table settlements enable row level security;
alter table transactions enable row level security;

create policy "Own rows select" on settlements for select using (auth.uid() = user_id);
create policy "Own rows insert" on settlements for insert with check (auth.uid() = user_id);
create policy "Own rows select" on transactions for select using (auth.uid() = user_id);
create policy "Own rows insert" on transactions for insert with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Atomic settlement: one call, one transaction. Either everything applies
-- (balance, ledger, date rolls, goal top-ups, planned tick-offs, profile
-- stamp) or nothing does. Runs as invoker so RLS still protects every row.
-- ---------------------------------------------------------------------------
create or replace function apply_settlement(
  p_account_id uuid,
  p_net numeric,
  p_from_date date,
  p_to_date date,
  p_items jsonb,          -- [{label, amount, kind}]
  p_income_rolls jsonb,   -- [{id, next_date, deactivate}]
  p_bill_rolls jsonb,     -- [{id, next_due_date, deactivate}]
  p_goal_adds jsonb,      -- [{id, add}]
  p_planned_done uuid[]
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_settlement_id uuid;
  v_item jsonb;
begin
  insert into settlements (from_date, to_date, net, item_count, account_id)
  values (p_from_date, p_to_date, p_net, coalesce(jsonb_array_length(p_items), 0), p_account_id)
  returning id into v_settlement_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    insert into transactions (settlement_id, account_id, date, label, amount, kind)
    values (
      v_settlement_id,
      p_account_id,
      p_to_date,
      v_item ->> 'label',
      (v_item ->> 'amount')::numeric,
      v_item ->> 'kind'
    );
  end loop;

  if p_account_id is not null and p_net <> 0 then
    update accounts set balance = balance + p_net where id = p_account_id;
    if not found then
      raise exception 'Primary account not found';
    end if;
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_income_rolls, '[]'::jsonb)) loop
    if (v_item ->> 'deactivate')::boolean then
      update income set is_active = false where id = (v_item ->> 'id')::uuid;
    else
      update income set next_date = (v_item ->> 'next_date')::date where id = (v_item ->> 'id')::uuid;
    end if;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_bill_rolls, '[]'::jsonb)) loop
    if (v_item ->> 'deactivate')::boolean then
      update bills set is_active = false where id = (v_item ->> 'id')::uuid;
    else
      update bills set next_due_date = (v_item ->> 'next_due_date')::date where id = (v_item ->> 'id')::uuid;
    end if;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_goal_adds, '[]'::jsonb)) loop
    update savings_goals
      set current_saved = current_saved + (v_item ->> 'add')::numeric
      where id = (v_item ->> 'id')::uuid;
  end loop;

  if p_planned_done is not null then
    update planned_expenses set is_completed = true where id = any (p_planned_done);
  end if;

  update profiles set last_settled_date = p_to_date where id = auth.uid();

  return v_settlement_id;
end $$;
