-- Givezy: the server's link of guest gifts to an account checks the account itself (security review, 23/11/2026).
--
-- link_donors_to_user (service role only, migration 20261009000004) linked every donor record with the email it was
-- given to the account it was given, with no check of its own. The website now calls it only for a session started
-- with an emailed link or code and a confirmed email (linkDonorsForSession, src/lib/donors/link.ts), as the app's
-- link_my_donations already required. The function itself now also refuses (links nothing) unless the email is the
-- account's own and that account's email is confirmed, so a mistake in a caller can never hand one person's gifts
-- to another account. The sign-in method can't be checked here (the server calls it with the service role).

create or replace function public.link_donors_to_user(p_user uuid, p_email text)
returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if p_user is null or p_email is null or not exists (
    select 1 from auth.users u
     where u.id = p_user and u.email_confirmed_at is not null and lower(btrim(u.email::text)) = lower(btrim(p_email))
  ) then
    return 0;
  end if;
  update public.donors
     set user_id = p_user,
         email_verified_at = coalesce(email_verified_at, now())
   where lower(email::text) = lower(btrim(p_email))
     and user_id is null;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.link_donors_to_user(uuid, text) from public, anon, authenticated;
grant execute on function public.link_donors_to_user(uuid, text) to service_role;
