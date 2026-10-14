-- A charity that is still a draft (or was rejected) may correct its bank details.
-- Until now the "bank verified" stamp stayed on after such an edit, so a changed
-- account could be submitted looking verified. Any bank change by the charity
-- itself now clears the stamp; only the platform sets it again.
create or replace function public.guard_charity_bank_fields() returns trigger
language plpgsql as $$
declare
  st public.charity_status;
  bank_changed boolean;
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') or public.is_platform_admin() then
    return new;
  end if;
  select status into st from public.charities where id = new.charity_id;
  bank_changed := new.bank_name is distinct from old.bank_name
       or new.bank_account_holder is distinct from old.bank_account_holder
       or new.bank_account_number_encrypted is distinct from old.bank_account_number_encrypted
       or new.bank_account_last4 is distinct from old.bank_account_last4
       or new.bank_branch_code is distinct from old.bank_branch_code;
  if st in ('approved', 'suspended', 'pending_review') and (bank_changed or new.bank_verified_at is distinct from old.bank_verified_at) then
    raise exception 'Bank details can only be changed by a platform admin once an application is submitted';
  end if;
  if new.bank_verified_at is distinct from old.bank_verified_at then
    raise exception 'Only the platform can mark bank details verified';
  end if;
  if bank_changed then
    new.bank_verified_at := null;
  end if;
  return new;
end $$;
