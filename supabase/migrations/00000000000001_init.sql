-- CashFlow — initial schema
-- Recreates the Base44 CashFlow data model on Supabase Postgres with
-- per-user Row-Level Security. Run via `supabase db push` or paste into
-- the Supabase SQL editor.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type account_type as enum ('current', 'savings', 'credit_card', 'other');
create type bill_frequency as enum ('weekly', 'fortnightly', 'monthly', 'quarterly', 'annual', 'one_off');
create type bill_category as enum ('housing', 'utilities', 'insurance', 'transport', 'subscriptions', 'food', 'health', 'education', 'other');
create type income_frequency as enum ('weekly', 'fortnightly', 'monthly', 'one_off');
create type income_type as enum ('salary', 'other');
create type deduction_type as enum ('post_tax', 'pre_tax');
create type planned_expense_category as enum ('holiday', 'shopping', 'gift', 'car', 'home', 'event', 'other');
create type expense_category as enum ('food_drink', 'transport', 'shopping', 'entertainment', 'health', 'travel', 'bills', 'subscriptions', 'home', 'other');
create type budget_alert_type as enum ('safe_to_spend', 'category');
create type loan_frequency as enum ('weekly', 'fortnightly', 'monthly');

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Profiles (replaces Base44 built-in User entity)
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  last_settled_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------------
create table accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  balance numeric(12, 2) not null default 0,
  type account_type not null default 'current',
  credit_limit numeric(12, 2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  amount numeric(12, 2) not null,
  next_due_date date not null,
  frequency bill_frequency not null default 'monthly',
  category bill_category not null default 'other',
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table income (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  amount numeric(12, 2) not null,
  frequency income_frequency not null default 'monthly',
  income_type income_type not null default 'salary',
  next_date date not null,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  amount_per_payslip numeric(12, 2) not null,
  current_saved numeric(12, 2) not null default 0,
  target_amount numeric(12, 2),
  start_date date,
  end_date date,
  deduction_type deduction_type not null default 'post_tax',
  is_active boolean not null default true,
  is_disposable_pot boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table planned_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  amount numeric(12, 2) not null,
  date date not null,
  category planned_expense_category not null default 'other',
  is_completed boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  amount numeric(12, 2) not null,
  date date not null,
  category expense_category not null default 'other',
  merchant text,
  receipt_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table budget_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type budget_alert_type not null,
  label text not null,
  monthly_limit numeric(12, 2) not null,
  category text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table loans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  starting_balance numeric(12, 2) not null,
  interest_rate numeric(6, 3) not null default 0,
  payment_amount numeric(12, 2) not null,
  payment_frequency loan_frequency not null default 'monthly',
  start_date date not null,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table one_off_loan_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  loan_id uuid not null references loans (id) on delete cascade,
  amount numeric(12, 2) not null,
  payment_date date not null,
  label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index accounts_user_idx on accounts (user_id);
create index bills_user_idx on bills (user_id);
create index income_user_idx on income (user_id);
create index savings_goals_user_idx on savings_goals (user_id);
create index planned_expenses_user_idx on planned_expenses (user_id);
create index expenses_user_idx on expenses (user_id);
create index expenses_user_date_idx on expenses (user_id, date desc);
create index budget_alerts_user_idx on budget_alerts (user_id);
create index loans_user_idx on loans (user_id);
create index one_off_loan_payments_loan_idx on one_off_loan_payments (loan_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'accounts', 'bills', 'income', 'savings_goals',
    'planned_expenses', 'expenses', 'budget_alerts', 'loans', 'one_off_loan_payments'
  ] loop
    execute format('create trigger %I_updated_at before update on %I for each row execute function set_updated_at()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Row-Level Security: every user sees only their own rows
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;
create policy "Own profile read" on profiles for select using (auth.uid() = id);
create policy "Own profile update" on profiles for update using (auth.uid() = id);

do $$
declare t text;
begin
  foreach t in array array[
    'accounts', 'bills', 'income', 'savings_goals', 'planned_expenses',
    'expenses', 'budget_alerts', 'loans', 'one_off_loan_payments'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "Own rows select" on %I for select using (auth.uid() = user_id)', t);
    execute format('create policy "Own rows insert" on %I for insert with check (auth.uid() = user_id)', t);
    execute format('create policy "Own rows update" on %I for update using (auth.uid() = user_id)', t);
    execute format('create policy "Own rows delete" on %I for delete using (auth.uid() = user_id)', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Storage bucket for expense receipts
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy "Own receipts read" on storage.objects
  for select using (bucket_id = 'receipts' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "Own receipts insert" on storage.objects
  for insert with check (bucket_id = 'receipts' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "Own receipts delete" on storage.objects
  for delete using (bucket_id = 'receipts' and auth.uid()::text = (storage.foldername(name))[1]);
