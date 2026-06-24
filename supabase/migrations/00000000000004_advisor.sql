-- AI Advisor: chat persistence + per-user daily usage cap.
-- Additive only; mirrors the per-user RLS conventions of the core schema.

create table if not exists advisor_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists advisor_messages_user_idx on advisor_messages (user_id, created_at);

create table if not exists advisor_usage (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null default current_date,
  count integer not null default 0,
  primary key (user_id, day)
);

alter table advisor_messages enable row level security;
create policy "Own advisor msgs select" on advisor_messages for select using (auth.uid() = user_id);
create policy "Own advisor msgs insert" on advisor_messages for insert with check (auth.uid() = user_id);
create policy "Own advisor msgs delete" on advisor_messages for delete using (auth.uid() = user_id);

alter table advisor_usage enable row level security;
create policy "Own advisor usage select" on advisor_usage for select using (auth.uid() = user_id);
create policy "Own advisor usage insert" on advisor_usage for insert with check (auth.uid() = user_id);
create policy "Own advisor usage update" on advisor_usage for update using (auth.uid() = user_id);
