-- Open Hand: platform admins need the second login step too.
--
-- A platform admin can see every charity, every donation and reveal bank
-- account numbers, so their powers apply only to a session that completed the
-- authenticator-app step (aal2). With the emailed link alone they are treated
-- as an ordinary signed-in person. Every policy and guard that calls
-- is_platform_admin() picks this up.

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_second_factor() and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'platform_admin'
  )
$$;
