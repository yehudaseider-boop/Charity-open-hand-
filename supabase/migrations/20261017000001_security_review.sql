-- Givezy: fixes from the full security review of 17/10/2026.

-- ---------------------------------------------------------------------------
-- 1. The "a session started with a password sees nothing" rule (16/10) was a policy on tables
--    only. The charity dashboard reads through security definer functions and owner-run views
--    (charity_donor_list, charity_monthly_list, charity_insights, charity_donations and so on),
--    which check is_charity_admin / is_platform_admin, and those checked the second step only.
--    Putting the rule inside has_second_step() closes it for every function, view and policy
--    that builds on it, now and later.
-- ---------------------------------------------------------------------------
grant execute on function public.signed_in_without_password() to anon, authenticated;

create or replace function public.has_second_step() returns boolean
language sql stable set search_path = '' as $$
  select coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'
     and public.signed_in_without_password()
$$;

-- The one remaining write open to a password session: recording "agreed" for the real owner.
create or replace function public.agree_to_policy(p_version text) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if not public.signed_in_without_password() then raise exception 'Please sign in with the emailed code'; end if;
  if p_version is null or p_version !~ '^[0-9a-z.-]{1,40}$' then raise exception 'Unknown policy version'; end if;
  insert into public.consents (kind, policy_version, user_id) values ('account', p_version, uid);
end $$;

-- ---------------------------------------------------------------------------
-- 2. Donors could still write the encrypted ID columns from the browser. The server reads the
--    ID from the checkout details, never from here (15/10), so nothing should write them but the
--    server either: a value pasted in could otherwise be decrypted by a future code path.
-- ---------------------------------------------------------------------------
revoke update (id_number_encrypted, id_number_last4, tax_reference_encrypted, tax_reference_last4) on public.donors from authenticated;

-- ---------------------------------------------------------------------------
-- 3. Privileges that only policies were holding back: take them away too, so a future policy
--    can never open them by accident. (Campaigns are created by charity admins from the browser
--    on purpose and keep theirs.)
-- ---------------------------------------------------------------------------
revoke insert, delete on public.charities, public.charity_admins, public.categories from authenticated;

-- ---------------------------------------------------------------------------
-- 4. Suggested amounts: a null element slipped past the check (0 < null is null, and a null
--    check passes), and there was no ceiling. Same ceiling as the largest gift (R1 000 000).
-- ---------------------------------------------------------------------------
alter table public.charities drop constraint charities_suggested_amounts_check;
alter table public.charities add constraint charities_suggested_amounts_check check (
  cardinality(suggested_amounts_cents) <= 3
  and array_position(suggested_amounts_cents, null) is null
  and 0 < all (suggested_amounts_cents)
  and 100000000 >= all (suggested_amounts_cents)
);
grant select (suggested_amounts_cents) on public.charities to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Same value, evaluated once per statement instead of once per row.
-- ---------------------------------------------------------------------------
alter policy charity_updates_add on public.charity_updates
  with check ((public.is_charity_admin(charity_id) or public.is_platform_admin()) and posted_by = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 6. Two immutability rules that bound only browser roles now bind the server too, like the
--    rest: a processed donation is never deleted, and no link is added to a receipt after it
--    was issued (its amount would no longer equal its gifts).
-- ---------------------------------------------------------------------------
create or replace function public.guard_donation_status() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'pending' then
      raise exception 'A processed donation cannot be deleted';
    end if;
    return old;
  end if;
  if new.status is distinct from old.status and not (
       (old.status = 'pending' and new.status in ('paid', 'failed'))
       or (old.status = 'failed' and new.status = 'paid')
       or (old.status = 'paid' and new.status in ('refunded', 'charged_back'))
     ) then
    raise exception 'Donation cannot move from % to %', old.status, new.status;
  end if;
  if old.status <> 'pending' and (
       new.amount_cents, new.platform_fee_cents, new.fee_vat_cents, new.processing_charge_cents,
       new.contribution_cents, new.total_charged_cents, new.charity_id, new.donor_id)
     is distinct from (
       old.amount_cents, old.platform_fee_cents, old.fee_vat_cents, old.processing_charge_cents,
       old.contribution_cents, old.total_charged_cents, old.charity_id, old.donor_id) then
    raise exception 'Amounts of a processed donation cannot change';
  end if;
  if old.status in ('paid', 'refunded', 'charged_back') and (
       new.paid_at, new.tax_year, new.wants_18a) is distinct from (old.paid_at, old.tax_year, old.wants_18a) then
    raise exception 'The date, tax year and receipt choice of a paid donation cannot change';
  end if;
  return new;
end $$;
create trigger donations_delete_guard before delete on public.donations
  for each row execute function public.guard_donation_status();

create or replace function public.guard_receipt_links() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    -- issue_s18a_receipt adds the links in the same transaction as the receipt.
    if exists (select 1 from public.s18a_receipts r where r.id = new.receipt_id and r.issued_at < now() - interval '1 minute') then
      raise exception 'Links cannot be added to an issued receipt';
    end if;
    return new;
  end if;
  raise exception 'Receipt donation links are immutable';
end $$;
create trigger s18a_receipt_donations_no_late_links before insert on public.s18a_receipt_donations
  for each row execute function public.guard_receipt_links();
