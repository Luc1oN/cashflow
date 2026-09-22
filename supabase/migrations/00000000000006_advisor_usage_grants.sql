-- Follow-up to 00000000000005_security.sql.
--
-- That migration tried to lock `bump_advisor_usage` down with:
--     revoke all on function bump_advisor_usage(integer) from public;
--     grant execute on function bump_advisor_usage(integer) to authenticated;
--
-- which was not enough. Supabase ships ALTER DEFAULT PRIVILEGES granting
-- EXECUTE on new functions in `public` to `anon`, `authenticated` and
-- `service_role` individually. Revoking from PUBLIC drops only the implicit
-- PUBLIC grant and leaves those three role grants untouched — so the function
-- stayed callable unauthenticated at /rest/v1/rpc/bump_advisor_usage, which is
-- what the database linter flagged (lint 0028).
--
-- In practice the function's own `if auth.uid() is null then raise` guard
-- already refused anonymous callers, so this was defence in depth rather than a
-- live hole. Revoking the grant means the API never reaches the body at all.
--
-- `authenticated` keeps EXECUTE deliberately: the advisor Edge Function calls
-- this as the signed-in user. A user calling it directly can only push their
-- own counter up — the function has no path that lowers a count — so the worst
-- they can do is spend their own daily allowance.
--
-- Idempotent; safe to re-run.

revoke execute on function public.bump_advisor_usage(integer) from anon;
revoke execute on function public.bump_advisor_usage(integer) from public;

grant execute on function public.bump_advisor_usage(integer) to authenticated;
