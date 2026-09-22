-- Data integrity on settlement and loan payments.
--
-- 1. apply_settlement took `p_net` from the client and trusted it. The ledger
--    rows came from `p_items`, but the account balance moved by `p_net`, and
--    nothing checked the two agreed. A bug in the client (or a hand-crafted
--    RPC call) could move the balance by one figure while the "immutable audit
--    trail" recorded a different one — the one thing a ledger must never do.
--    Now the sum of the items must match p_net or the whole call aborts.
--
-- 2. The inner UPDATEs targeted rows by id alone and leaned entirely on RLS to
--    scope them. RLS does hold (the function is SECURITY INVOKER), but an
--    explicit user_id predicate means the function is still correct if a policy
--    is ever dropped or the function is later changed to SECURITY DEFINER.
--
-- 3. one_off_loan_payments checked that user_id was yours but never that
--    loan_id was. You could attach a payment to another user's loan.
--
-- Safe to re-run.

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
  v_uid uuid := auth.uid();
  v_items_total numeric;
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;

  -- The balance move and the ledger must describe the same event. A cent of
  -- tolerance absorbs float round-tripping through JSON; anything larger is a
  -- real disagreement and the settlement is refused rather than half-applied.
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
    update accounts set balance = balance + p_net
      where id = p_account_id and user_id = v_uid;
    if not found then
      raise exception 'Primary account not found';
    end if;
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_income_rolls, '[]'::jsonb)) loop
    if (v_item ->> 'deactivate')::boolean then
      update income set is_active = false
        where id = (v_item ->> 'id')::uuid and user_id = v_uid;
    else
      update income set next_date = (v_item ->> 'next_date')::date
        where id = (v_item ->> 'id')::uuid and user_id = v_uid;
    end if;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_bill_rolls, '[]'::jsonb)) loop
    if (v_item ->> 'deactivate')::boolean then
      update bills set is_active = false
        where id = (v_item ->> 'id')::uuid and user_id = v_uid;
    else
      update bills set next_due_date = (v_item ->> 'next_due_date')::date
        where id = (v_item ->> 'id')::uuid and user_id = v_uid;
    end if;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_goal_adds, '[]'::jsonb)) loop
    update savings_goals
      set current_saved = current_saved + (v_item ->> 'add')::numeric
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
-- A loan payment must hang off one of your own loans, not just carry your id.
-- ---------------------------------------------------------------------------
drop policy if exists "Own rows insert" on one_off_loan_payments;
create policy "Own rows insert" on one_off_loan_payments
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from loans l where l.id = loan_id and l.user_id = auth.uid())
  );

drop policy if exists "Own rows update" on one_off_loan_payments;
create policy "Own rows update" on one_off_loan_payments
  for update using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (select 1 from loans l where l.id = loan_id and l.user_id = auth.uid())
  );
