-- CashFlow — security hardening.
--
-- Fixes three holes in the original policies:
--
--  1. Every `for update` policy had a USING clause but no WITH CHECK. USING only
--     decides which rows you may *touch*; WITH CHECK decides what the row may
--     look like *after* the write. Without it, a signed-in user could update one
--     of their own rows and set `user_id` to somebody else's id — handing a row
--     to another tenant (planting a bill/expense in their data, or moving their
--     own records out of reach). Adding WITH CHECK closes that.
--
--  2. `advisor_usage` — the AI daily cap — was directly writable by the client,
--     so the cap it enforces was advisory at best: any user could PATCH their
--     own counter back to 0 over the REST API and spend the project owner's
--     Anthropic credit without limit. The counter is now server-only: the client
--     may read it (to show "x of 50 used") but only a SECURITY DEFINER function
--     may write it.
--
--  3. That same function makes the increment atomic. The edge function used to
--     read the count and then write back `count + 1`, so N requests fired at
--     once all read the same value and all passed the cap.
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. WITH CHECK on every per-user update policy
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'accounts', 'bills', 'income', 'savings_goals', 'planned_expenses',
    'expenses', 'budget_alerts', 'loans', 'one_off_loan_payments'
  ] loop
    execute format('drop policy if exists "Own rows update" on %I', t);
    execute format(
      'create policy "Own rows update" on %I for update
         using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
  end loop;
end $$;

-- profiles keys on `id`, not `user_id`.
drop policy if exists "Own profile update" on profiles;
create policy "Own profile update" on profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- 2. advisor_usage: readable by its owner, writable only by the function below
-- ---------------------------------------------------------------------------
drop policy if exists "Own advisor usage insert" on advisor_usage;
drop policy if exists "Own advisor usage update" on advisor_usage;
-- (the select policy stays: the app may show the user their own usage)

-- ---------------------------------------------------------------------------
-- 3. Atomic, tamper-proof usage increment
--
-- SECURITY DEFINER so it can write the table the caller no longer can, but it
-- only ever touches auth.uid()'s own row — the caller cannot name a user.
-- `on conflict do update` makes read-and-increment a single statement, so
-- concurrent requests serialise on the row instead of all reading the same
-- count. Returns the count *after* this call; the caller compares it to the cap.
-- ---------------------------------------------------------------------------
create or replace function bump_advisor_usage(p_cap integer default 50)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  insert into advisor_usage (user_id, day, count)
  values (auth.uid(), current_date, 1)
  on conflict (user_id, day) do update
    -- Stop counting at the cap + 1 so a hammered endpoint can't overflow the
    -- column; anything at or over the cap is refused by the caller anyway.
    set count = least(advisor_usage.count + 1, p_cap + 1)
  returning count into v_count;

  return v_count;
end $$;

revoke all on function bump_advisor_usage(integer) from public;
grant execute on function bump_advisor_usage(integer) to authenticated;
