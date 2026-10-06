-- Open Hand: guest checkout (milestone 3)

-- Whether the gateway's quoted rates already include VAT. Null until the
-- rate sheet is supplied; donations are refused while it is null.
alter table public.fee_settings add column gateway_rates_include_vat boolean;

-- Consent and age confirmation captured with each gift.
alter table public.donations
  add column popia_consent_at timestamptz,
  add column age_confirmed_at timestamptz;

-- The donor details typed at checkout, kept with the gift exactly as given.
-- Receipts use these, so a later edit (or someone typing another person's
-- email address) can never change what a past gift was recorded against.
create table public.donation_checkout_details (
  donation_id uuid primary key references public.donations (id) on delete cascade,
  donor_type public.donor_type not null,
  email citext not null,
  first_name text,
  last_name text,
  organisation_name text,
  registration_number text,
  contact_person text,
  phone text,
  id_number_encrypted text,
  id_number_last4 text,
  tax_reference_encrypted text,
  tax_reference_last4 text,
  address_line1 text,
  address_line2 text,
  suburb text,
  city text,
  postal_code text,
  created_at timestamptz not null default now()
);
alter table public.donation_checkout_details enable row level security;
revoke all on public.donation_checkout_details from anon;
revoke insert, update, delete on public.donation_checkout_details from authenticated;
create policy checkout_details_read on public.donation_checkout_details for select to authenticated
  using (exists (select 1 from public.donations d where d.id = donation_id));

-- Simple rate limiting for checkout (card-testing protection).
create table public.rate_limit_events (
  id bigint generated always as identity primary key,
  bucket text not null,
  key text not null,
  created_at timestamptz not null default now()
);
create index rate_limit_lookup on public.rate_limit_events (bucket, key, created_at desc);
alter table public.rate_limit_events enable row level security;
revoke all on public.rate_limit_events from anon, authenticated;

-- Paid/failed transitions only ever move forward from pending.
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
       new.total_charged_cents, new.charity_id, new.donor_id)
     is distinct from (
       old.amount_cents, old.platform_fee_cents, old.fee_vat_cents, old.processing_charge_cents,
       old.total_charged_cents, old.charity_id, old.donor_id) then
    raise exception 'Amounts of a processed donation cannot change';
  end if;
  return new;
end $$;
create trigger donations_status_guard before update on public.donations
  for each row execute function public.guard_donation_status();
