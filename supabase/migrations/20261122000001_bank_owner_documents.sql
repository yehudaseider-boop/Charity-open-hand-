-- Givezy: the last fixes from the code review of 20/11/2026 (Yehuda's yes, 22/11/2026).
--
-- 1. A bank check answer belongs to one exact account. It was matched on the account's last four digits only, so two
--    accounts ending in the same four digits shared an answer. account_key is a keyed fingerprint of the bank and the
--    whole account number (made on the server, never the number itself). Old answers have none and show as
--    "not checked yet" until they are asked again.
-- 2. Givezy changing a charity's bank details is one step: the new account, "checked", and taking the charity off the
--    payment provider (the old account is still registered there) all happen together or not at all.
-- 3. A charity is never left without an owner: remove_charity_member refuses to remove the last owner, with the team
--    held so two removals at once can't both pass. make_charity_owner hands ownership to someone already on the team
--    (the old owner stays on as an admin), so Givezy can replace an owner who left.
-- 4. (In 20261122000002_document_records_server_only.sql, applied separately.) A browser can no longer add or change a document record: the server writes it, after checking the file is real
--    and the mandate's signing date. (A record pointing at no file, or a backdated mandate, could be written
--    directly before.) Removing a document while the application is open is unchanged.
-- All three functions are for the server only (service role).

-- 1 --------------------------------------------------------------------------------------------------------------
alter table public.charity_bank_checks
  add column if not exists account_key text
    constraint bank_check_account_key check (account_key is null or char_length(account_key) between 20 and 100);

-- 2 --------------------------------------------------------------------------------------------------------------
create or replace function public.change_charity_bank(
  p_charity_id uuid,
  p_bank_name text,
  p_account_holder text,
  p_account_number_encrypted text,
  p_account_last4 text,
  p_branch_code text
) returns table (was_connected boolean, before_bank_name text, before_last4 text, contact_email text)
language plpgsql security definer set search_path = '' as $$
declare
  c public.charities;
  p public.charity_private;
begin
  -- Hold the charity, so connecting it to the payment provider at the same moment waits for this.
  select * into c from public.charities where id = p_charity_id for update;
  if not found then raise exception 'Charity not found'; end if;
  select * into p from public.charity_private where charity_id = p_charity_id for update;
  if not found then raise exception 'Charity details not found'; end if;

  update public.charity_private set
    bank_name = p_bank_name,
    bank_account_holder = p_account_holder,
    bank_account_number_encrypted = p_account_number_encrypted,
    bank_account_last4 = p_account_last4,
    bank_branch_code = p_branch_code,
    -- Givezy checked the bank confirmation letter for this account before saving it.
    bank_verified_at = now()
  where charity_id = p_charity_id;

  -- The old account is still registered with the payment provider: no payments until it is connected again.
  if c.gateway_subaccount_ref is not null then
    update public.charities set gateway = null, gateway_subaccount_ref = null where id = p_charity_id;
  end if;

  return query select c.gateway_subaccount_ref is not null, p.bank_name, p.bank_account_last4, p.contact_email::text;
end $$;
revoke execute on function public.change_charity_bank(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.change_charity_bank(uuid, text, text, text, text, text) to service_role;

-- 3 --------------------------------------------------------------------------------------------------------------
create or replace function public.remove_charity_member(p_charity_id uuid, p_user_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  r public.charity_admin_role;
begin
  -- Hold the whole team, so two removals at once can't each see "another owner is left".
  perform 1 from public.charity_admins where charity_id = p_charity_id order by user_id for update;
  select role into r from public.charity_admins where charity_id = p_charity_id and user_id = p_user_id;
  if not found then return 'gone'; end if;
  if r = 'owner' and not exists (
    select 1 from public.charity_admins where charity_id = p_charity_id and role = 'owner' and user_id <> p_user_id
  ) then
    return 'last_owner';
  end if;
  delete from public.charity_admins where charity_id = p_charity_id and user_id = p_user_id;
  return 'done';
end $$;
revoke execute on function public.remove_charity_member(uuid, uuid) from public, anon, authenticated;
grant execute on function public.remove_charity_member(uuid, uuid) to service_role;

create or replace function public.make_charity_owner(p_charity_id uuid, p_user_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  r public.charity_admin_role;
begin
  perform 1 from public.charity_admins where charity_id = p_charity_id order by user_id for update;
  select role into r from public.charity_admins where charity_id = p_charity_id and user_id = p_user_id;
  if not found then return 'gone'; end if;
  if r = 'owner' then return 'already'; end if;
  -- One owner: whoever held it stays on the team as an admin.
  update public.charity_admins set role = 'admin' where charity_id = p_charity_id and role = 'owner';
  update public.charity_admins set role = 'owner' where charity_id = p_charity_id and user_id = p_user_id;
  return 'done';
end $$;
revoke execute on function public.make_charity_owner(uuid, uuid) from public, anon, authenticated;
grant execute on function public.make_charity_owner(uuid, uuid) to service_role;
