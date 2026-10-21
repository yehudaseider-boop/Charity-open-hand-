-- Gifts a charity records itself (21/10/2026, Yehuda): EFT, cash, a debit order or another programme
-- (the Angel Network's Heroes with Halos), typed in one at a time or imported from a CSV file. They
-- count in the charity's totals and donor history and go on the donor's yearly s18A receipt like any
-- other gift, so a donor gets one receipt per charity per year.
--
-- A recorded gift is a donation with gateway 'recorded': no payment provider, no fee, no
-- contribution, paid on the date the charity gives. Server-only writes, like every donation.
-- It can be removed (a typing mistake, a wrong file) only while it is on no receipt, issued or
-- withdrawn; after that it is part of the record.
--
-- Also: where each gift came from (`came_from`): the website, the app, a WhatsApp or other shared
-- link, the QR poster, or recorded by the charity. Filled in by the website and the app.

create table public.gift_imports (
  id uuid primary key default gen_random_uuid(),
  charity_id uuid not null references public.charities (id) on delete cascade,
  file_name text not null constraint gift_import_file check (char_length(file_name) between 1 and 200),
  gifts int not null constraint gift_import_gifts check (gifts > 0),
  total_cents bigint not null constraint gift_import_total check (total_cents > 0),
  created_by uuid references auth.users (id) on delete set null,
  -- The person importing confirmed the charity may share these donors' details with Givezy for their
  -- receipts, and that the charity does not issue its own s18A receipt for these gifts.
  confirmed_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index gift_imports_charity on public.gift_imports (charity_id, created_at desc);
alter table public.gift_imports enable row level security;
-- No policies: only the service role reaches it.
revoke all on public.gift_imports from anon, authenticated;
create policy no_password_sessions on public.gift_imports as restrictive for all to authenticated
  using (public.signed_in_without_password()) with check (public.signed_in_without_password());

alter table public.donations
  add column recorded_method text constraint donation_recorded_method check (recorded_method in ('eft', 'cash', 'debit_order', 'other_programme', 'other')),
  add column recorded_by uuid references auth.users (id) on delete set null,
  add column import_id uuid references public.gift_imports (id) on delete set null,
  add column external_ref text constraint donation_external_ref check (external_ref is null or char_length(external_ref) between 1 and 100),
  add column came_from text constraint donation_came_from check (came_from in ('website', 'app', 'whatsapp', 'share_link', 'qr', 'recorded')),
  add constraint recorded_gift_shape check (
    (gateway = 'recorded') = (recorded_method is not null)
    and (gateway <> 'recorded' or (
      status in ('paid', 'refunded') and platform_fee_cents = 0 and fee_vat_cents = 0 and processing_charge_cents = 0
      and contribution_cents = 0 and total_charged_cents = amount_cents and recurring_id is null and came_from = 'recorded'))
    and (gateway = 'recorded' or came_from is distinct from 'recorded')
  );
-- The charity's own reference (a bank statement line) once per charity: the same line twice is refused.
create unique index donations_recorded_ref on public.donations (charity_id, external_ref) where gateway = 'recorded' and external_ref is not null;
create index donations_import on public.donations (import_id) where import_id is not null;

-- A recorded gift on no receipt may be removed; every other processed donation still never is.
create or replace function public.guard_donation_status() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'pending' and not (
         old.gateway = 'recorded'
         and not exists (select 1 from public.s18a_receipt_donations l where l.donation_id = old.id)
       ) then
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
  if old.gateway is distinct from new.gateway or (old.gateway = 'recorded' and (old.recorded_method, old.import_id) is distinct from (new.recorded_method, new.import_id)) then
    raise exception 'How a donation came in cannot change';
  end if;
  return new;
end $$;

-- The charity's view of its gifts gains how each one came in.
create or replace view public.charity_donations with (security_barrier = true) as
  select
    d.id, d.charity_id, d.donor_id, d.status, d.amount_cents,
    d.paid_at, d.created_at, d.refunded_at, d.charged_back_at, d.tax_year,
    d.wants_18a, d.is_anonymous, d.message, d.campaign_id, d.recurring_id,
    c.donor_type, c.first_name, c.last_name, c.organisation_name, c.registration_number,
    c.contact_person, c.email, c.phone,
    c.address_line1, c.address_line2, c.suburb, c.city, c.postal_code,
    d.dedication_kind, d.dedication_name,
    d.recorded_method, d.external_ref, d.came_from, d.import_id
  from public.donations d
  left join public.donation_checkout_details c on c.donation_id = d.id
  where d.status in ('paid', 'refunded', 'charged_back')
    and (public.is_charity_admin(d.charity_id) or public.is_platform_admin());
