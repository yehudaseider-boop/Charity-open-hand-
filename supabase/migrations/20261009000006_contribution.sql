-- NEDIV lev: no platform or processing fee. The donor may add an optional
-- contribution to NEDIV lev, recorded as its own line item next to the
-- charity's donation, whether or not the gateway splits the payment.
--
--   total_charged = donation (amount_cents) + contribution (contribution_cents)
--
-- The old fee columns stay (always 0 for new donations) so history still adds up.
-- Charities never see the contribution: it is not in charity_donations.

alter table public.donations
  add column contribution_cents bigint not null default 0 check (contribution_cents >= 0);

alter table public.donations drop constraint split_adds_up;
alter table public.donations add constraint split_adds_up check (
  total_charged_cents = amount_cents + platform_fee_cents + fee_vat_cents + processing_charge_cents + contribution_cents
);

create or replace function public.guard_donation_status() returns trigger
language plpgsql as $$
begin
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
  return new;
end $$;
