# CashFlow v2

A personal cashflow forecasting app — a full-stack recreation of the original Base44 CashFlow app, built with React + TypeScript on the frontend and Supabase (Postgres, Auth, Row-Level Security, Storage) as the backend.

**New in v2:** atomic settlement via a Postgres function, a permanent transaction ledger with a History page, scenario testing on the forecast, spending insights, receipt uploads, CSV import/export, dark mode, a mobile bottom tab bar, onboarding, per-user settings (currency €/£/$, default horizon), a TanStack Query data layer with toasts, accessible modals with confirm-to-delete, unit tests on the money math, CI, code splitting, and an optional bill-reminder email function.

## What it does

- **Dashboard** — a day-by-day cashflow forecast (30/90/180/365 days) built from your accounts, income, bills, savings deductions, and planned expenses. Shows your cash position, the lowest point ahead, when (if ever) you'd go negative, upcoming money events, budget progress, and a "Settle the day" button.
- **Settle the day** — applies everything that fell due since your last settle: income lands in your primary account, bills come out, post-tax savings move into their pots (topping up `current_saved`), planned expenses dated in the window are paid and ticked off, and recurring next-dates roll forward (one-offs deactivate). You see the full list and net change before confirming. Mark an account as **Primary** on the Accounts page to choose where settlements apply; otherwise the first current account is used.
- **Accounts** — current, savings, credit card, and other accounts. Cash accounts minus credit card balances anchor the forecast.
- **Income** — recurring salary and other income streams. Salary streams define your paydays.
- **Bills** — recurring outgoings (weekly to annual, plus one-offs) by category.
- **Savings goals** — per-payslip deductions. Post-tax goals are subtracted on each payday in the forecast; pre-tax goals are tracked but never touch net cash. Supports a "Disposable cash pot" flag, targets, and start/end windows.
- **Planned expenses** — one-off future spends the forecast subtracts until you tick them off as paid.
- **Spending** — day-to-day expense logging with categories and merchants, plus budget alerts: a monthly "safe to spend" cap and per-category limits with over/close warnings.
- **Loans** — amortisation forecast per loan (payoff date, total interest, total repaid) with one-off lump-sum payments to model overpayments.

- **History** — every settlement is recorded permanently as an immutable transaction ledger: what applied, when, and the net change. Your audit trail.
- **Scenario testing** — add hypothetical money events on the dashboard and see a dashed overlay on the forecast ("what if I buy a €600 sofa on the 20th?") before committing anything. One click saves a scenario item as a real planned expense.
- **Spending insights** — month-at-a-glance category breakdown and month-over-month comparison, plus receipt photos on any expense (stored privately, viewed via short-lived signed URLs).
- **Settings** — currency (GBP/EUR/USD), default forecast horizon, dark mode, CSV export of every table, and CSV import. Drop in a **Revolut statement** (Account → Statement → Excel/CSV) and it's detected automatically: spending and fees become categorised expenses, money-in rows become income, pending rows are skipped. Generic CSVs (`name/description`, `amount`, `date`) work too.

Currency defaults to GBP and is changeable per-user in **Settings** — pick EUR and every figure in the app follows.

## Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS (dark mode via CSS variables), React Router (lazy-loaded routes), TanStack Query, Recharts, date-fns, PapaParse
- **Backend:** Supabase — Postgres with Row-Level Security (every table scoped to the signed-in user), email/password auth, a private `receipts` storage bucket, and an `apply_settlement()` Postgres function so settling is a single all-or-nothing transaction
- **Quality:** Vitest unit tests on the forecast and settlement engines (`npm test`), GitHub Actions CI on every push, error boundary, code-split bundles
- **Schema:** eight SQL migrations in `supabase/migrations/` — run them **in order**

## Setup

### 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com), create a project, and pick a strong database password.
2. In the dashboard open **SQL Editor** and run each file in `supabase/migrations/` **in order** (`...01_init.sql` through `...08_reverse_settlement.sql`). Or use the CLI: `supabase link --project-ref <ref>` then `supabase db push`. **`...05_security.sql` is not optional** — see [Security](#security) below.
3. In **Authentication → Providers**, make sure **Email** is enabled. Keep "Confirm email" on if others will sign up.
4. **Turn off public sign-ups** unless you actually want them: **Authentication → Sign In / Providers → Allow new users to sign up**. This is a personal app backed by *your* Supabase project and *your* Anthropic key — every account that can sign up can also spend advisor credit against that key. Leave sign-ups on only while you're inviting someone; RLS keeps their data separate, but it doesn't stop them costing you money.
5. The Supabase **Project URL** and **anon public** key come from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` at build time, falling back to the literals in `src/lib/supabase.ts`. The anon key is safe to be public — Row-Level Security protects your data, not key secrecy. (Never put the `service_role` key in the repo; it bypasses RLS.) To fork this for your own project, set those two as repository variables (or edit the fallbacks).

### 2. Run the app locally

```bash
npm install
npm run dev
```

Open the printed localhost URL, create an account, and start adding data. RLS means every user only ever sees their own rows — safe to share with family.

### 3. Push to GitHub

```bash
git remote add origin https://github.com/<your-username>/cashflow.git
git branch -M main
git push -u origin main
```

### 4. Deploy to GitHub Pages

This repo ships a GitHub Actions workflow (`.github/workflows/deploy.yml`) that runs the tests, builds, and publishes to GitHub Pages on every push to `main` — the same pattern many static apps use, no third-party host needed.

One-time setup:

1. Push to GitHub (step 3). The repo must be **public** unless you have GitHub Pro (Pages on private repos needs a paid plan).
2. In the repo: **Settings → Pages → Build and deployment → Source → GitHub Actions**.
3. The workflow runs automatically; your site goes live at `https://<your-username>.github.io/cashflow/`.
4. In Supabase: **Authentication → URL Configuration**, set the **Site URL** to your Pages URL and add it under **Redirect URLs**, so email confirmation/login links resolve correctly.

The app uses `HashRouter` (URLs look like `/#/bills`) and a Vite `base` of `/cashflow/`, both required for SPA routing on GitHub Pages. If you rename the repo, update `base` in `vite.config.ts` to `/<new-name>/`.

After deploying, add your production URL under **Authentication → URL Configuration** in Supabase.

## Migrating your data from Base44

The table and column names intentionally mirror the Base44 entities (snake_cased), so an export maps 1:1:

| Base44 entity | Supabase table |
| --- | --- |
| Account | `accounts` |
| Bill | `bills` |
| Income | `income` |
| SavingsGoal | `savings_goals` |
| PlannedExpense | `planned_expenses` |
| Expense | `expenses` |
| BudgetAlert | `budget_alerts` |
| Loan | `loans` |
| OneOffLoanPayment | `one_off_loan_payments` |
| User.last_settled_date | `profiles.last_settled_date` |

Export each entity from Base44 as CSV, drop the Base44 system columns (`id`, `created_by`, etc.), and import via **Table Editor → Insert → Import data from CSV** in Supabase while signed in — or re-enter records through the app. For `one_off_loan_payments`, re-link `loan_id` to the new loan UUIDs.

## Atomic settlement & the transaction ledger

Settling calls the `apply_settlement()` Postgres function via RPC. The balance change, ledger rows, recurring date rolls, savings top-ups, planned tick-offs, and the profile stamp all commit in **one database transaction** — a dropped connection can never leave your money half-applied. The function runs as *invoker*, so Row-Level Security still protects every row it touches. Each settlement and its line items land in the `settlements` and `transactions` tables, which power the History page.

**Undo.** Settling used to be the one action with no way back. `apply_settlement()` now snapshots everything it is about to overwrite — each bill's and income stream's previous date and active flag, which planned expenses it actually ticked (not ones you'd already ticked), the prior `last_settled_date` — into `settlements.undo_data`. **Activity → Undo** on the most recent settlement calls `reverse_settlement()`, which puts all of it back, takes the savings top-ups back out, moves the balance by the opposite of the net, and stamps `reversed_at`.

The settlement and its ledger rows are **voided, not deleted** — an audit trail that erases its own mistakes isn't one. Only the newest un-reversed settlement can be undone, since reversing an older one would restore dates that later settlements have already rolled past; where two settlements share a timestamp the check fails closed. Settlements made before this migration carry no snapshot and report that plainly rather than half-undoing.

## Security

What protects the data, and what you have to set up:

- **Settlement is verified and reversible.** `apply_settlement()` refuses a
  settlement whose net doesn't match the sum of its own ledger items, so the
  balance and the audit trail can never describe different events, and every
  settlement can be undone from Activity.
- **Row-Level Security on every table.** Each policy checks `auth.uid()` on both
  `USING` (which rows you may touch) *and* `WITH CHECK` (what the row may look
  like afterwards). The `WITH CHECK` half arrived in `...05_security.sql`;
  without it a signed-in user could reassign one of their own rows to another
  user's id. **Run that migration.**
- **The advisor's daily cap is server-enforced.** `advisor_usage` is readable but
  not writable by the client; only the `bump_advisor_usage()` SECURITY DEFINER
  function increments it, atomically. Before `...05_security.sql` the counter was
  client-writable, which made the cap — and so the ceiling on your Anthropic
  bill — advisory only.
- **The Anthropic API key never reaches the browser.** It lives in the `advisor`
  Edge Function, which verifies the caller's JWT and fetches their data under RLS.
- **`bill-reminders` requires `CRON_SECRET`.** It holds the service-role key and
  emails every user; it fails closed if the secret is unset.
- **Receipts** live in a private bucket partitioned by user id and are served
  through 10-minute signed URLs.
- **Account controls.** Password reset from the sign-in screen, and in
  **Settings → Security**, change password and sign out of every device at once
  (useful when the same account is signed in on desktop, iPad and phone).
- **Turn off public sign-ups** unless you're actively inviting someone (setup
  step 4).

## Tests & CI

```bash
npm test        # Vitest — 16 unit tests on the recurrence, forecast, and settlement maths
npm run build   # typecheck + production build
```

`.github/workflows/ci.yml` runs both on every push and pull request, so a broken forecast calculation can't quietly reach `main`.

## Bill reminder emails (optional)

`supabase/functions/bill-reminders/` is an Edge Function that emails each user a digest of bills due in the next 7 days via [Resend](https://resend.com). Deploy with `supabase functions deploy bill-reminders`, set `RESEND_API_KEY`, `REMINDER_FROM` **and `CRON_SECRET`** as secrets, and schedule it daily with a cron job that sends the secret in an `x-cron-secret` header — full instructions are in the file's header comment.

`CRON_SECRET` is required: the function runs with the service-role key and mails every user, so it refuses to run without one.

## How the forecast works

Starting balance = sum of cash accounts − credit card balances. Each day forward the engine applies: recurring income occurrences (rolled forward from `next_date` by frequency), recurring bill occurrences, unpaid planned expenses on their dates, and post-tax savings deductions on every salary payday within each goal's start/end window. The chart marks the lowest point and the zero line; the stat cards flag the first day the balance would go negative.

Loan forecasting amortises per payment period (`rate / periods-per-year`), applies lump sums on their dates, and reports payoff date, total interest, and total repaid.

Settling reuses the same recurrence engine over the window from the day after `last_settled_date` up to today (first-time settles cover today only), so the forecast and the settlement always agree on what was due.

## Project structure

```
supabase/migrations/   SQL schema + RLS policies + storage bucket
src/
  lib/                 Supabase client, types, forecast + settlement engines, formatting, CRUD hook
  contexts/            Auth session provider
  components/          UI kit + app layout
  pages/               Dashboard, Accounts, Income, Bills, Savings, Planned, Spending, Loans
```
