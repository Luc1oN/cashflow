-- Undo for "Settle the day".
--
-- Settling is the only irreversible action in the app: it moves the balance,
-- writes ledger rows, rolls every recurring date forward, tops up savings pots,
-- ticks off planned expenses and stamps the profile — in one shot, with no way
-- back short of repairing four pages by hand.
--
-- The ledger records the money that moved, but NOT what settling overwrote: the
-- previous next_due_date on each bill, whether a stream was deactivated, which
-- planned expenses it ticked (as opposed to ones already ticked), or the prior
-- last_settled_date. None of that is recoverable afterwards, so apply_settlement
-- now captures it at the moment it applies, into settlements.undo_data.
--
-- Reversal VOIDS rather than deletes: the settlement and its transactions stay,
-- stamped with reversed_at. An audit trail that erases its mistakes isn't one.
--
-- Safe to re-run.

alter table settlements add column if not exists undo_data jsonb;
alter table settlements add column if not exists reversed_at timestamptz;

create index if not exists settlements_user_active_idx
  on settlements (user_id, created_at desc) where reversed_at is null;

-- ---------------------------------------------------------------------------
-- apply_settlement — as migration 07, plus the before-state capture.
-- ---------------------------------------------------------------------------
create or replace function apply_settlement(
  p_account_id uuid,
  p_net numeric,
  p_from_date date,
  p_to_date date,
  p_items jsonb,
  p_income_rolls jsonb,
  p_bill_rolls jsonb,
  p_goal_adds jsonb,
  p_planned_done uuid[]
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_settlement_id uuid;
  v_item jsonb;
  v_uid uuid := auth.uid();
  v_items_total numeric;
  v_undo jsonb;
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;

  select coalesce(sum((value ->> 'amount')::numeric), 0)
    into v_items_total
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb));

  if abs(coalesce(p_net, 0) - v_items_total) > 0.01 then
    raise exception
      'Settlement rejected: net % does not match the sum of its % items (%)',
      p_net, coalesce(jsonb_array_length(p_items), 0), v_items_total;
  end if;

  if p_to_date < p_from_date then
    raise exception 'Settlement rejected: to_date % is before from_date %', p_to_date, p_from_date;
  end if;

  -- Snapshot everything this settlement is about to overwrite. Captured BEFORE
  -- any of the updates below run, and only for rows that actually belong to the
  -- caller. `planned` records only the expenses this settlement actually flips
  -- from unpaid to paid — reversing must not un-tick one the user had already
  -- ticked themselves.
  select jsonb_build_object(
    'income', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'next_date', i.next_date, 'is_active', i.is_active))
      from income i
      where i.user_id = v_uid
        and i.id in (select (value ->> 'id')::uuid
                     from jsonb_array_elements(coalesce(p_income_rolls, '[]'::jsonb)))
    ), '[]'::jsonb),
    'bills', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'next_due_date', b.next_due_date, 'is_active', b.is_active))
      from bills b
      where b.user_id = v_uid
        and b.id in (select (value ->> 'id')::uuid
                     from jsonb_array_elements(coalesce(p_bill_rolls, '[]'::jsonb)))
    ), '[]'::jsonb),
    'goals', coalesce(p_goal_adds, '[]'::jsonb),
    'planned', coalesce((
      select jsonb_agg(pe.id)
      from planned_expenses pe
      where pe.user_id = v_uid
        and pe.id = any (coalesce(p_planned_done, '{}'::uuid[]))
        and pe.is_completed = false
    ), '[]'::jsonb),
    'last_settled_date', (select to_jsonb(pr.last_settled_date) from profiles pr where pr.id = v_uid),
    'net', p_net,
    'account_id', p_account_id
  ) into v_undo;

  insert into settlements (from_date, to_date, net, item_count, account_id, undo_data)
  values (p_from_date, p_to_date, p_net, coalesce(jsonb_array_length(p_items), 0), p_account_id, v_undo)
  returning id into v_settlement_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    insert into transactions (settlement_id, account_id, date, label, amount, kind)
    values (v_settlement_id, p_account_id, p_to_date,
            v_item ->> 'label', (v_item ->> 'amount')::numeric, v_item ->> 'kind');
  end loop;

  if p_account_id is not null and p_net <> 0 then
    update accounts set balance = balance + p_net
      where id = p_account_id and user_id = v_uid;
    if not found then
      raise exception 'Primary account not found';
    end if;
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_income_rolls, '[]'::jsonb)) loop
    if (v_item ->> 'deactivate')::boolean then
      update income set is_active = false where id = (v_item ->> 'id')::uuid and user_id = v_uid;
    else
      update income set next_date = (v_item ->> 'next_date')::date
        where id = (v_item ->> 'id')::uuid and user_id = v_uid;
    end if;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_bill_rolls, '[]'::jsonb)) loop
    if (v_item ->> 'deactivate')::boolean then
      update bills set is_active = false where id = (v_item ->> 'id')::uuid and user_id = v_uid;
    else
      update bills set next_due_date = (v_item ->> 'next_due_date')::date
        where id = (v_item ->> 'id')::uuid and user_id = v_uid;
    end if;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_goal_adds, '[]'::jsonb)) loop
    update savings_goals set current_saved = current_saved + (v_item ->> 'add')::numeric
      where id = (v_item ->> 'id')::uuid and user_id = v_uid;
  end loop;

  if p_planned_done is not null then
    update planned_expenses set is_completed = true
      where id = any (p_planned_done) and user_id = v_uid;
  end if;

  update profiles set last_settled_date = p_to_date where id = v_uid;

  return v_settlement_id;
end $$;

-- ---------------------------------------------------------------------------
-- reverse_settlement — put everything back, then void the settlement.
--
-- SECURITY DEFINER because `settlements` deliberately has no UPDATE policy: the
-- ledger must not be client-writable, but stamping reversed_at is a legitimate
-- privileged write. The trade is that RLS no longer guards the body, so every
-- statement below filters on user_id = v_uid explicitly.
--
-- Only the newest un-reversed settlement can be undone. Reversing an older one
-- would restore dates that later settlements have already rolled past.
-- ---------------------------------------------------------------------------
create or replace function reverse_settlement(p_settlement_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row settlements%rowtype;
  v_undo jsonb;
  v_item jsonb;
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;

  select * into v_row from settlements
    where id = p_settlement_id and user_id = v_uid;
  if not found then
    raise exception 'Settlement not found';
  end if;

  if v_row.reversed_at is not null then
    raise exception 'That settlement has already been undone';
  end if;

  -- "Is anything newer still standing?" rather than "pick the newest and
  -- compare". created_at is now(), i.e. transaction-start time, so two
  -- settlements can share a timestamp and `order by created_at desc limit 1`
  -- then picks arbitrarily — which let the OLDER of a tied pair be reversed.
  -- >= treats a tie as "something else is at least as new" and refuses: on a
  -- money operation, ambiguity should fail closed.
  if exists (
    select 1 from settlements s
    where s.user_id = v_uid
      and s.reversed_at is null
      and s.id <> p_settlement_id
      and s.created_at >= v_row.created_at
  ) then
    raise exception 'Only your most recent settlement can be undone';
  end if;

  v_undo := v_row.undo_data;
  if v_undo is null then
    raise exception 'This settlement was made before undo was available, so it cannot be undone automatically';
  end if;

  -- Money back.
  if v_row.account_id is not null and v_row.net <> 0 then
    update accounts set balance = balance - v_row.net
      where id = v_row.account_id and user_id = v_uid;
  end if;

  -- Recurring dates and active flags back to exactly what they were.
  for v_item in select * from jsonb_array_elements(coalesce(v_undo -> 'income', '[]'::jsonb)) loop
    update income
      set next_date = (v_item ->> 'next_date')::date,
          is_active = (v_item ->> 'is_active')::boolean
      where id = (v_item ->> 'id')::uuid and user_id = v_uid;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(v_undo -> 'bills', '[]'::jsonb)) loop
    update bills
      set next_due_date = (v_item ->> 'next_due_date')::date,
          is_active = (v_item ->> 'is_active')::boolean
      where id = (v_item ->> 'id')::uuid and user_id = v_uid;
  end loop;

  -- Savings top-ups come back out.
  for v_item in select * from jsonb_array_elements(coalesce(v_undo -> 'goals', '[]'::jsonb)) loop
    update savings_goals set current_saved = current_saved - (v_item ->> 'add')::numeric
      where id = (v_item ->> 'id')::uuid and user_id = v_uid;
  end loop;

  -- Only the expenses this settlement ticked.
  update planned_expenses set is_completed = false
    where user_id = v_uid
      and id in (select (value #>> '{}')::uuid
                 from jsonb_array_elements(coalesce(v_undo -> 'planned', '[]'::jsonb)));

  update profiles
    set last_settled_date = nullif(v_undo ->> 'last_settled_date', '')::date
    where id = v_uid;

  update settlements set reversed_at = now()
    where id = p_settlement_id and user_id = v_uid;

  return p_settlement_id;
end $$;

revoke all on function reverse_settlement(uuid) from public;
revoke all on function reverse_settlement(uuid) from anon;
grant execute on function reverse_settlement(uuid) to authenticated;
