-- Givezy signs people in with an emailed code only (24/11/2026, Yehuda: password sign-up can't be switched off on
-- its own in Supabase; turning off the Email provider would also stop the codes).
--
-- Until now a password session was refused in two places: our code (getViewer, the app's bearer check) and the
-- database (the restrictive no_password_sessions policy on every table, and signed_in_without_password in
-- has_second_step and the definer functions). Supabase itself still handed out the session, so someone who signed up
-- with a password before the real owner ever signed in could keep a session on that account and use Supabase's own
-- account endpoints with it.
--
-- This is a Custom Access Token hook (on the Pro plan; the password-verification hook needs the Team plan). Supabase
-- calls it before every access token it issues, including each refresh. A token for a password sign-in, or for a
-- session that began with one (its amr still says so on refresh), is refused, so no password session ever gets a
-- token. Every other sign-in (the emailed code, magic link, invite, email change, a refresh of those) is returned
-- unchanged. Nothing is added to or taken from the token.
--
-- After this runs, Supabase must be told to use it: Authentication, Hooks, Customize Access Token, Postgres function
-- public.refuse_password_sessions. Until then it does nothing. Test project first: sign in with a code (works) and,
-- with a throwaway address, sign up with a password (refused).

create or replace function public.refuse_password_sessions(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  if event ->> 'authentication_method' = 'password'
     or exists (
       select 1 from jsonb_array_elements(coalesce(event -> 'claims' -> 'amr', '[]'::jsonb)) a
       where a ->> 'method' = 'password'
     ) then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Givezy signs you in with a code we email you. Please use "Email me a code" instead of a password.'
      )
    );
  end if;
  return event;
end;
$$;

-- Only Supabase's sign-in service may run it.
revoke execute on function public.refuse_password_sessions(jsonb) from public, anon, authenticated;
grant execute on function public.refuse_password_sessions(jsonb) to supabase_auth_admin;
