-- Givezy: admin, application and sign-in fixes (review of 23/11/2026).
--
-- 1. Connecting a charity to the payment provider. The website read the bank account, asked the provider to register
--    it, and then wrote the provider's reference with only the charity's id: if Givezy changed the bank details in
--    between, the old account's reference was stored against the new account. set_charity_gateway_ref holds the
--    charity and its private row, and saves the reference only if the bank account is still the one that was sent
--    (same encrypted account number and same "checked" time). Otherwise it saves nothing and answers false.
-- 2. Starting an application was three separate writes (the charity, its owner, its private row), so a failure
--    in the second or third left a charity with no owner. start_charity_application does all three or none.
-- 3. agree_to_policy let any signed-in person record any version text. The server records agreement itself
--    (src/app/agree/actions.ts, with the current version from code), so a browser may no longer call it.
--    Account agreements are also unique per person and version (a double press can't record twice).
-- All the new functions are for the server only (service role).

-- 1 --------------------------------------------------------------------------------------------------------------
create or replace function public.set_charity_gateway_ref(
  p_charity_id uuid,
  p_gateway text,
  p_account_ref text,
  p_account_number_encrypted text,
  p_bank_verified_at timestamptz
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  p public.charity_private;
begin
  -- Same order as change_charity_bank: the charity first, then its private row.
  perform 1 from public.charities where id = p_charity_id and status = 'approved' for update;
  if not found then return false; end if;
  select * into p from public.charity_private where charity_id = p_charity_id for update;
  if not found
     or p.bank_account_number_encrypted is distinct from p_account_number_encrypted
     or p.bank_verified_at is distinct from p_bank_verified_at then
    return false;
  end if;
  update public.charities set gateway = p_gateway, gateway_subaccount_ref = p_account_ref where id = p_charity_id;
  return true;
end $$;
revoke execute on function public.set_charity_gateway_ref(uuid, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.set_charity_gateway_ref(uuid, text, text, text, timestamptz) to service_role;

-- 2 --------------------------------------------------------------------------------------------------------------
-- A clash on the web address or QuickGive code raises unique_violation (23505), as the plain insert did, and the
-- website tries again with another one.
create or replace function public.start_charity_application(
  p_slug text,
  p_quickgive_code text,
  p_name text,
  p_user_id uuid,
  p_email text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  insert into public.charities (slug, quickgive_code, name_en, legal_name_en, status)
    values (p_slug, p_quickgive_code, p_name, p_name, 'draft')
    returning id into v_id;
  insert into public.charity_admins (charity_id, user_id, role) values (v_id, p_user_id, 'owner');
  insert into public.charity_private (charity_id, contact_email) values (v_id, p_email);
  return v_id;
end $$;
revoke execute on function public.start_charity_application(text, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.start_charity_application(text, text, text, uuid, text) to service_role;

-- 3 --------------------------------------------------------------------------------------------------------------
-- Duplicates first: keep each person's earliest agreement to a version, delete the later copies.
delete from public.consents c
 using public.consents d
 where c.kind = 'account' and d.kind = 'account'
   and c.user_id = d.user_id and c.policy_version = d.policy_version
   and (d.accepted_at, d.id) < (c.accepted_at, c.id);

-- Account agreements only: a charity's declarations legitimately repeat for one person (one per charity).
create unique index if not exists consents_account_once
  on public.consents (user_id, kind, policy_version) where kind = 'account';

revoke execute on function public.agree_to_policy(text) from public, anon, authenticated;
grant execute on function public.agree_to_policy(text) to service_role;
