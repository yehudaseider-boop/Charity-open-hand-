-- Givezy: agreement to the Terms is recorded only by our server (24/11/2026).
--
-- agree_to_policy() let anyone signed in record agreement to any version text, including one that doesn't exist yet,
-- for themselves. It stayed open (20261123000009) only because the phone app called it with the donor's own sign-in.
-- The app now asks our server (/api/app/agree), which records only the current version. The website already recorded
-- agreement on the server (src/app/agree/actions.ts). So the function is closed to browsers and the app.
--
-- Apply only after the app update that uses /api/app/agree is out: an older app build then gets a plain "We couldn't
-- save that" when agreeing, until it updates.

revoke execute on function public.agree_to_policy(text) from public, anon, authenticated;
grant execute on function public.agree_to_policy(text) to service_role;
