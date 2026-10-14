-- Open Hand: donors see their receipts, and receipts get emailed.

-- When a receipt was emailed to the donor (so it is never emailed twice).
-- Not one of the columns the immutability trigger protects.
alter table public.s18a_receipts add column emailed_at timestamptz;

-- Link a signed-in person to the donor identities that used their email address.
-- Called by the server after someone signs in with the emailed link, which proves
-- they control that address. It only fills in donors that have no account yet:
-- it never takes a donor away from the account it already belongs to.
-- (Email is compared as lower-case text, so this does not depend on where the
-- citext extension is installed.)
create or replace function public.link_donors_to_user(p_user uuid, p_email text)
returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.donors
     set user_id = p_user,
         email_verified_at = coalesce(email_verified_at, now())
   where lower(email::text) = lower(p_email)
     and user_id is null;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.link_donors_to_user(uuid, text) from public, anon, authenticated;
grant execute on function public.link_donors_to_user(uuid, text) to service_role;
