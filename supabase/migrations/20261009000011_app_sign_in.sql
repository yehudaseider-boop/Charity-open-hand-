-- Sign-in from the phone app (email code, no website callback), so the app
-- can do the two things the website's sign-in callback does on the server.

-- 1. Join the donations given with this email to the signed-in account. Only
--    for a confirmed email address (the person typed the code sent to it), and
--    only donor records that no account has claimed yet.
create or replace function public.link_my_donations() returns int
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  addr text;
  n int;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  select u.email into addr from auth.users u where u.id = uid and u.email_confirmed_at is not null;
  if addr is null then return 0; end if;
  update public.donors
     set user_id = uid,
         email_verified_at = coalesce(email_verified_at, now())
   where lower(email::text) = lower(addr)
     and user_id is null;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.link_my_donations() from public, anon;
grant execute on function public.link_my_donations() to authenticated;

-- 2. Record that the signed-in person agreed to the Terms and Privacy Policy
--    (the app's version of the website's /agree page).
create or replace function public.agree_to_policy(p_version text) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if p_version is null or p_version !~ '^[0-9a-z.-]{1,40}$' then raise exception 'Unknown policy version'; end if;
  insert into public.consents (kind, policy_version, user_id) values ('account', p_version, uid);
end $$;
revoke execute on function public.agree_to_policy(text) from public, anon;
grant execute on function public.agree_to_policy(text) to authenticated;
