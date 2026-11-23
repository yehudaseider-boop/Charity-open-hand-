-- Refuse every password sign-in (23/11/2026; go-live checklist, "Stop strangers creating Givezy accounts with a password").
--
-- Givezy signs everyone in with an emailed code. Supabase's own sign-up service still accepts an email and a password,
-- so a stranger can pre-register someone else's email with a password. Supabase's "Before User Created" hook can't tell
-- that sign-up apart from an emailed-code sign-up: an emailed-code sign-up is made by the same sign-up code with a random
-- password, and the hook's payload never includes the password (see docs/decisions.md, 23/11/2026). So we refuse the
-- password at the only other place it can be used: Supabase's "Password verification attempt" hook, which runs on every
-- password sign-in, before the "email not confirmed" check. Nobody at Givezy signs in with a password, so the answer is
-- always no. With "Confirm email" on, a pre-registered account then never gives the stranger a session, so they can't
-- enrol an authenticator app on it and lock the real owner out of the second step.
--
-- Nothing changes until the hook is switched on in the Supabase dashboard (Authentication, Hooks, "Password verification
-- attempt", Postgres function public.hook_refuse_password_sign_in): test project first, then live.
--
-- should_logout_user stays false on purpose: Supabase calls this hook for a wrong password too, so logging the account
-- out would let anyone sign a real person out of every phone and browser by typing their email and any password.

create or replace function public.hook_refuse_password_sign_in(event jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'decision', 'reject',
    'message', 'Givezy doesn''t use passwords. Sign in with the code we email you.',
    'should_logout_user', false
  );
$$;

comment on function public.hook_refuse_password_sign_in(jsonb) is
  'Supabase Auth "Password verification attempt" hook: refuses every password sign-in (Givezy signs in with emailed codes only). Run only by supabase_auth_admin.';

revoke all on function public.hook_refuse_password_sign_in(jsonb) from public, anon, authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant execute on function public.hook_refuse_password_sign_in(jsonb) to supabase_auth_admin;
  end if;
end
$$;
