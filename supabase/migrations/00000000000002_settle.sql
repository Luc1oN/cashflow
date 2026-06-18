-- Settle-the-day support: mark one account as the primary account that
-- settlement transactions are applied to.
alter table accounts add column is_primary boolean not null default false;

-- Keep at most one primary account per user.
create unique index accounts_one_primary_per_user
  on accounts (user_id) where is_primary;
