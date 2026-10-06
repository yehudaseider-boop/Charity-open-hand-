-- Open Hand: core schema (milestone 1)
--
-- Conventions
--   * Money is always integer cents in ZAR (bigint). Never numeric/float.
--   * Percentages are integer parts-per-million (ppm): 3% = 30000 ppm.
--   * tax_year is the SARS year of assessment, named by the year it ENDS
--     (tax_year 2027 = 01/03/2026 to 28/02/2027). It is calculated in the app
--     from config, never in the database, so the start month lives in one place.
--   * Encrypted columns (suffix _encrypted) hold ciphertext produced by the app.
--     The database never sees the plaintext.
--   * Launch model is direct-pay only. Donations carry funding_source = 'card'.
--     A future wallet adds 'wallet' plus separate wallets / ledger_entries tables
--     (double-entry); nothing here needs to change for that.

create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.platform_role as enum ('user', 'platform_admin');
create type public.donor_type as enum ('individual', 'company', 'trust');
create type public.charity_status as enum ('draft', 'pending_review', 'approved', 'rejected', 'suspended');
create type public.charity_admin_role as enum ('owner', 'admin');
create type public.charity_document_type as enum ('pbo_approval', 's18a_approval', 'bank_confirmation', 'npo_certificate', 'receipting_mandate', 'other');
create type public.campaign_status as enum ('draft', 'active', 'ended');
create type public.donation_status as enum ('pending', 'paid', 'failed', 'refunded', 'charged_back');
create type public.funding_source as enum ('card');
create type public.recurring_status as enum ('active', 'paused', 'cancelled', 'failed');
create type public.receipt_status as enum ('issued', 'void');

-- ---------------------------------------------------------------------------
-- Shared trigger: updated_at
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user). Charity admin is a membership, not a role.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email citext not null,
  full_name text,
  role public.platform_role not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_en text not null,
  name_he text,
  sort_order int not null default 0
);

-- ---------------------------------------------------------------------------
-- Charities. Public profile + legal identifiers (these appear on receipts).
-- Private details (bank, contact) live in charity_private.
-- ---------------------------------------------------------------------------
create table public.charities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  quickgive_code text not null unique,
  name_en text not null,
  name_he text,
  legal_name_en text not null,
  legal_name_he text,
  description_en text,
  description_he text,
  website text,
  logo_path text,
  cover_path text,
  npo_number text,
  pbo_number text,
  s18a_reference text,
  address_line1 text,
  address_line2 text,
  suburb text,
  city text,
  postal_code text,
  -- Platform-admin controlled fields (guarded by trigger below)
  status public.charity_status not null default 'draft',
  rejection_reason text,
  is_verified boolean not null default false,
  verified_at timestamptz,
  is_s18a boolean not null default false,      -- s18A approval confirmed by us
  s18a_confirmed_at timestamptz,
  mandate_signed_at timestamptz,                -- receipting mandate
  mandate_document_path text,
  gateway text,
  gateway_subaccount_ref text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint s18a_needs_reference check (not is_s18a or s18a_reference is not null)
);
create trigger charities_updated_at before update on public.charities
  for each row execute function public.set_updated_at();

-- Badge logic in one place: "s18A" badge = approval confirmed AND mandate signed.
create or replace function public.charity_can_issue_18a(c public.charities) returns boolean
language sql stable as $$
  select c.is_s18a and c.mandate_signed_at is not null
$$;

create table public.charity_private (
  charity_id uuid primary key references public.charities (id) on delete cascade,
  contact_name text,
  contact_email citext,
  contact_phone text,
  bank_name text,
  bank_account_holder text,
  bank_account_number_encrypted text,
  bank_account_last4 text,
  bank_branch_code text,
  bank_verified_at timestamptz,
  updated_at timestamptz not null default now()
);
create trigger charity_private_updated_at before update on public.charity_private
  for each row execute function public.set_updated_at();

create table public.charity_categories (
  charity_id uuid not null references public.charities (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  primary key (charity_id, category_id)
);

create table public.charity_admins (
  charity_id uuid not null references public.charities (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.charity_admin_role not null default 'admin',
  created_at timestamptz not null default now(),
  primary key (charity_id, user_id)
);

create table public.charity_documents (
  id uuid primary key default gen_random_uuid(),
  charity_id uuid not null references public.charities (id) on delete cascade,
  document_type public.charity_document_type not null,
  storage_path text not null,
  file_name text not null,
  uploaded_by uuid references auth.users (id),
  uploaded_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Role helpers (security definer so policies can call them without recursion)
-- ---------------------------------------------------------------------------
create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'platform_admin'
  )
$$;

create or replace function public.is_charity_admin(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.charity_admins ca
    where ca.charity_id = target and ca.user_id = (select auth.uid())
  )
$$;

-- Charity admins may edit their profile, but not the fields that only a
-- platform admin may set (status, badges, mandate, gateway link).
create or replace function public.guard_charity_admin_fields() returns trigger
language plpgsql as $$
begin
  -- Server-side code (service role) and migrations/seeds (postgres) are trusted.
  if current_user in ('service_role', 'postgres', 'supabase_admin') or public.is_platform_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'pending_review') or new.is_verified or new.is_s18a
       or new.mandate_signed_at is not null or new.gateway_subaccount_ref is not null then
      raise exception 'Only a platform admin can set approval, badge or gateway fields';
    end if;
    return new;
  end if;
  if new.is_verified is distinct from old.is_verified
     or new.verified_at is distinct from old.verified_at
     or new.is_s18a is distinct from old.is_s18a
     or new.s18a_confirmed_at is distinct from old.s18a_confirmed_at
     or new.mandate_signed_at is distinct from old.mandate_signed_at
     or new.mandate_document_path is distinct from old.mandate_document_path
     or new.gateway is distinct from old.gateway
     or new.gateway_subaccount_ref is distinct from old.gateway_subaccount_ref
     or new.approved_at is distinct from old.approved_at
     or new.rejection_reason is distinct from old.rejection_reason then
    raise exception 'Only a platform admin can change approval, badge or gateway fields';
  end if;
  -- A charity admin may only move draft/rejected -> pending_review (submit).
  if new.status is distinct from old.status
     and not (old.status in ('draft', 'rejected') and new.status = 'pending_review') then
    raise exception 'Only a platform admin can change charity status';
  end if;
  return new;
end $$;
create trigger charities_guard before insert or update on public.charities
  for each row execute function public.guard_charity_admin_fields();

-- ---------------------------------------------------------------------------
-- Campaigns
-- ---------------------------------------------------------------------------
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  charity_id uuid not null references public.charities (id) on delete cascade,
  slug text not null,
  title text not null,
  description text,
  target_cents bigint check (target_cents is null or target_cents > 0),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  custom_question text,
  status public.campaign_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (charity_id, slug)
);
create trigger campaigns_updated_at before update on public.campaigns
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Donors. A donor is a giving identity; guests have user_id null.
-- One email can hold an individual identity and one or more company identities.
-- ---------------------------------------------------------------------------
create table public.donors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  email citext not null,
  email_verified_at timestamptz,
  donor_type public.donor_type not null default 'individual',
  first_name text,
  last_name text,
  phone text,
  -- Company / trust
  organisation_name text,
  registration_number text,
  contact_person text,
  -- s18A fields (encrypted where sensitive; last4 kept for masked display)
  id_number_encrypted text,
  id_number_last4 text,
  tax_reference_encrypted text,
  tax_reference_last4 text,
  address_line1 text,
  address_line2 text,
  suburb text,
  city text,
  postal_code text,
  -- Age and consent
  age_confirmed_18_at timestamptz,
  date_of_birth date,
  popia_consent_at timestamptz,
  referred_by_charity_id uuid references public.charities (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint org_fields check (donor_type = 'individual' or organisation_name is not null)
);
create unique index donors_identity_uniq
  on public.donors (email, donor_type, coalesce(registration_number, ''));
create index donors_user_id_idx on public.donors (user_id);
create trigger donors_updated_at before update on public.donors
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Fee settings. Global row has charity_id null; per-charity overrides later.
-- The row in force is the latest effective_from <= now().
-- Gateway percent/fixed are null until the rate sheet is supplied.
-- ---------------------------------------------------------------------------
create table public.fee_settings (
  id uuid primary key default gen_random_uuid(),
  charity_id uuid references public.charities (id) on delete cascade,
  platform_fee_ppm int not null check (platform_fee_ppm >= 0 and platform_fee_ppm < 1000000),
  gateway_percent_ppm int check (gateway_percent_ppm >= 0 and gateway_percent_ppm < 1000000),
  gateway_fixed_cents int check (gateway_fixed_cents >= 0),
  min_donation_cents bigint not null check (min_donation_cents > 0),
  vat_enabled boolean not null default false,
  vat_rate_ppm int not null check (vat_rate_ppm >= 0),
  effective_from timestamptz not null default now(),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Recurring donations (monthly). Account holders only.
-- ---------------------------------------------------------------------------
create table public.recurring_donations (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid not null references public.donors (id),
  charity_id uuid not null references public.charities (id),
  campaign_id uuid references public.campaigns (id),
  amount_cents bigint not null check (amount_cents > 0),
  status public.recurring_status not null default 'active',
  wants_18a boolean not null default false,
  is_anonymous boolean not null default false,
  message text,
  gateway text,
  gateway_subscription_ref text,
  gateway_customer_ref text,
  next_charge_at timestamptz,
  paused_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger recurring_updated_at before update on public.recurring_donations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Donations
-- total_charged = gift + platform fee + VAT on platform fee + gateway charge.
-- The constraint guarantees the split always adds up to the cent.
-- ---------------------------------------------------------------------------
create table public.donations (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid not null references public.donors (id),
  charity_id uuid not null references public.charities (id),
  campaign_id uuid references public.campaigns (id),
  recurring_id uuid references public.recurring_donations (id),
  amount_cents bigint not null check (amount_cents > 0),
  platform_fee_cents bigint not null check (platform_fee_cents >= 0),
  fee_vat_cents bigint not null default 0 check (fee_vat_cents >= 0),
  processing_charge_cents bigint not null check (processing_charge_cents >= 0),
  total_charged_cents bigint not null,
  fee_settings_id uuid references public.fee_settings (id),
  currency text not null default 'ZAR' check (currency = 'ZAR'),
  funding_source public.funding_source not null default 'card',
  status public.donation_status not null default 'pending',
  gateway text not null,
  gateway_ref text,
  wants_18a boolean not null default false,
  is_anonymous boolean not null default false,
  message text,
  campaign_answer text,
  tax_year int,
  paid_at timestamptz,
  failed_at timestamptz,
  refunded_at timestamptz,
  charged_back_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint split_adds_up check (
    total_charged_cents = amount_cents + platform_fee_cents + fee_vat_cents + processing_charge_cents
  ),
  constraint paid_has_tax_year check (status <> 'paid' or (paid_at is not null and tax_year is not null))
);
create unique index donations_gateway_ref_uniq on public.donations (gateway, gateway_ref) where gateway_ref is not null;
create index donations_charity_idx on public.donations (charity_id, paid_at desc);
create index donations_donor_idx on public.donations (donor_id, paid_at desc);
create trigger donations_updated_at before update on public.donations
  for each row execute function public.set_updated_at();

-- Private note to self: separate table so charities can never read it.
create table public.donation_private_notes (
  donation_id uuid primary key references public.donations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  note text not null,
  created_at timestamptz not null default now()
);

-- Raw gateway webhooks, for idempotency and audit.
create table public.gateway_events (
  id uuid primary key default gen_random_uuid(),
  gateway text not null,
  event_id text not null,
  event_type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (gateway, event_id)
);

-- ---------------------------------------------------------------------------
-- s18A receipts (annual). Immutable once issued; void keeps the row.
-- Receipt numbers run sequentially per charity.
-- ---------------------------------------------------------------------------
create table public.receipt_counters (
  charity_id uuid primary key references public.charities (id) on delete cascade,
  last_number int not null default 0
);

create or replace function public.next_receipt_number(target uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into public.receipt_counters (charity_id, last_number) values (target, 1)
  on conflict (charity_id) do update set last_number = public.receipt_counters.last_number + 1
  returning last_number into n;
  return n;
end $$;
revoke execute on function public.next_receipt_number(uuid) from public, anon, authenticated;

create table public.s18a_receipts (
  id uuid primary key default gen_random_uuid(),
  charity_id uuid not null references public.charities (id),
  receipt_number int not null,
  donor_id uuid not null references public.donors (id),
  tax_year int not null,
  amount_cents bigint not null check (amount_cents > 0),
  details jsonb not null,            -- snapshot of every field printed on the receipt
  pdf_path text,
  status public.receipt_status not null default 'issued',
  issued_at timestamptz not null default now(),
  voided_at timestamptz,
  void_reason text,
  replaced_by_id uuid references public.s18a_receipts (id),
  unique (charity_id, receipt_number),
  constraint void_has_reason check (status <> 'void' or (voided_at is not null and void_reason is not null))
);
create unique index receipts_one_issued_per_donor_year
  on public.s18a_receipts (charity_id, donor_id, tax_year) where status = 'issued';

create table public.s18a_receipt_donations (
  receipt_id uuid not null references public.s18a_receipts (id),
  donation_id uuid not null references public.donations (id),
  primary key (receipt_id, donation_id)
);

create or replace function public.guard_receipt_immutable() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 's18A receipts are never deleted; void them instead';
  end if;
  if old.status = 'void' then
    raise exception 'A void receipt cannot be changed';
  end if;
  -- Only allowed changes: setting pdf_path once, or voiding.
  if (new.charity_id, new.receipt_number, new.donor_id, new.tax_year, new.amount_cents, new.details, new.issued_at)
     is distinct from
     (old.charity_id, old.receipt_number, old.donor_id, old.tax_year, old.amount_cents, old.details, old.issued_at)
     or (old.pdf_path is not null and new.pdf_path is distinct from old.pdf_path) then
    raise exception 'Issued receipts are immutable; void and reissue instead';
  end if;
  return new;
end $$;
create trigger s18a_receipts_immutable before update or delete on public.s18a_receipts
  for each row execute function public.guard_receipt_immutable();

create or replace function public.guard_receipt_links() returns trigger
language plpgsql as $$
begin
  raise exception 'Receipt donation links are immutable';
end $$;
create trigger s18a_receipt_donations_immutable before update or delete on public.s18a_receipt_donations
  for each row execute function public.guard_receipt_links();

-- ---------------------------------------------------------------------------
-- Donor extras (account holders): favourites, maaser
-- ---------------------------------------------------------------------------
create table public.favourites (
  user_id uuid not null references auth.users (id) on delete cascade,
  charity_id uuid not null references public.charities (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, charity_id)
);

create table public.maaser_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  target_percent_ppm int not null check (target_percent_ppm > 0 and target_percent_ppm <= 1000000),
  updated_at timestamptz not null default now()
);

create table public.maaser_income_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount_encrypted text not null,     -- income is encrypted at rest
  entry_date date not null,
  note_encrypted text,
  created_at timestamptz not null default now()
);

create table public.external_giving_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount_cents bigint not null check (amount_cents > 0),
  entry_date date not null,
  recipient_text text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Audit log (append-only)
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users (id),
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create or replace function public.guard_audit_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'The audit log is append-only';
end $$;
create trigger audit_log_append_only before update or delete on public.audit_log
  for each row execute function public.guard_audit_append_only();
