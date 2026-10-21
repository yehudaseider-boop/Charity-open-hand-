-- Givezy: all database setup steps in order, for a NEW EMPTY test project only. Generated from supabase/migrations (20/10/2026).
-- An existing project runs only the sections it does not have yet, in order.

-- ===== 20261006000001_core_schema.sql =====
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

-- ===== 20261006000002_row_level_security.sql =====
-- Open Hand: row-level security (milestone 1)
--
-- Principles
--   * Every table has RLS on. No policy = no access (except the service role,
--     which is server-only and bypasses RLS).
--   * Donors see only their own data. Charity admins see only their charity.
--     Platform admins see everything.
--   * Money-moving and receipt writes happen on the server with the service
--     role, never directly from a browser.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- Donor identities that belong to the signed-in user.
create or replace function public.my_donor_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select d.id from public.donors d where d.user_id = (select auth.uid())
$$;

-- Charity admins can see a donor who has given to their charity.
create or replace function public.donor_gave_to_my_charity(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.donations dn
    join public.charity_admins ca on ca.charity_id = dn.charity_id
    where dn.donor_id = target and ca.user_id = (select auth.uid())
  )
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.charities enable row level security;
alter table public.charity_private enable row level security;
alter table public.charity_categories enable row level security;
alter table public.charity_admins enable row level security;
alter table public.charity_documents enable row level security;
alter table public.campaigns enable row level security;
alter table public.donors enable row level security;
alter table public.fee_settings enable row level security;
alter table public.recurring_donations enable row level security;
alter table public.donations enable row level security;
alter table public.donation_private_notes enable row level security;
alter table public.gateway_events enable row level security;
alter table public.receipt_counters enable row level security;
alter table public.s18a_receipts enable row level security;
alter table public.s18a_receipt_donations enable row level security;
alter table public.favourites enable row level security;
alter table public.maaser_settings enable row level security;
alter table public.maaser_income_entries enable row level security;
alter table public.external_giving_entries enable row level security;
alter table public.audit_log enable row level security;

-- Table privileges (RLS still decides which rows)
-- Supabase grants anon everything by default; RLS would still block it, but
-- we take the privileges away too so a missing policy can never leak data.
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on functions from anon;
grant usage on schema public to anon, authenticated;
grant select on public.categories, public.charities, public.charity_categories, public.campaigns to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update, delete on public.donations, public.s18a_receipts, public.s18a_receipt_donations,
  public.gateway_events, public.receipt_counters, public.audit_log, public.fee_settings
  from authenticated;
-- Platform admins change fees via the server (audited), not directly.

-- ---------------------------------------------------------------------------
-- Profiles: own row; platform admin sees all. Role changes are server-only.
-- ---------------------------------------------------------------------------
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_platform_admin());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Categories: public read; platform admin manages.
-- ---------------------------------------------------------------------------
create policy categories_read on public.categories for select to anon, authenticated using (true);
create policy categories_admin on public.categories for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Charities: approved ones are public; admins see their own in any status.
-- ---------------------------------------------------------------------------
create policy charities_public_read on public.charities for select to anon, authenticated
  using (status = 'approved');
create policy charities_admin_read on public.charities for select to authenticated
  using (public.is_charity_admin(id) or public.is_platform_admin());
create policy charities_admin_update on public.charities for update to authenticated
  using (public.is_charity_admin(id) or public.is_platform_admin())
  with check (public.is_charity_admin(id) or public.is_platform_admin());
create policy charities_platform_all on public.charities for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
-- New applications are created on the server (it also creates the
-- charity_admins row), so there is no browser insert policy.

create policy charity_private_rw on public.charity_private for all to authenticated
  using (public.is_charity_admin(charity_id) or public.is_platform_admin())
  with check (public.is_charity_admin(charity_id) or public.is_platform_admin());

create policy charity_categories_read on public.charity_categories for select to anon, authenticated
  using (exists (select 1 from public.charities c where c.id = charity_id and c.status = 'approved')
         or public.is_charity_admin(charity_id) or public.is_platform_admin());
create policy charity_categories_write on public.charity_categories for all to authenticated
  using (public.is_charity_admin(charity_id) or public.is_platform_admin())
  with check (public.is_charity_admin(charity_id) or public.is_platform_admin());

-- Membership list: visible to fellow admins of that charity; managed by platform admin.
create policy charity_admins_read on public.charity_admins for select to authenticated
  using (user_id = (select auth.uid()) or public.is_charity_admin(charity_id) or public.is_platform_admin());
create policy charity_admins_platform on public.charity_admins for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy charity_documents_rw on public.charity_documents for all to authenticated
  using (public.is_charity_admin(charity_id) or public.is_platform_admin())
  with check (public.is_charity_admin(charity_id) or public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Campaigns: public when active and the charity is approved.
-- ---------------------------------------------------------------------------
create policy campaigns_public_read on public.campaigns for select to anon, authenticated
  using (status <> 'draft'
         and exists (select 1 from public.charities c where c.id = charity_id and c.status = 'approved'));
create policy campaigns_admin_rw on public.campaigns for all to authenticated
  using (public.is_charity_admin(charity_id) or public.is_platform_admin())
  with check (public.is_charity_admin(charity_id) or public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Donors: own identities; charity admins see donors who gave to them.
-- Created on the server at checkout (guests have no session).
-- ---------------------------------------------------------------------------
create policy donors_own on public.donors for select to authenticated
  using (user_id = (select auth.uid())
         or public.donor_gave_to_my_charity(id)
         or public.is_platform_admin());
create policy donors_update_own on public.donors for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke insert, delete on public.donors from authenticated;
-- Linking a donor to an account (user_id) and verifying email are server-only.
revoke update on public.donors from authenticated;
grant update (first_name, last_name, phone, organisation_name, registration_number, contact_person,
  id_number_encrypted, id_number_last4, tax_reference_encrypted, tax_reference_last4,
  address_line1, address_line2, suburb, city, postal_code) on public.donors to authenticated;

-- ---------------------------------------------------------------------------
-- Fees: platform admin read only from the browser.
-- ---------------------------------------------------------------------------
create policy fee_settings_admin_read on public.fee_settings for select to authenticated
  using (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Donations and recurring: donor own; charity own; platform all. Writes server-only.
-- ---------------------------------------------------------------------------
create policy donations_read on public.donations for select to authenticated
  using (donor_id in (select public.my_donor_ids())
         or public.is_charity_admin(charity_id)
         or public.is_platform_admin());

create policy recurring_read on public.recurring_donations for select to authenticated
  using (donor_id in (select public.my_donor_ids())
         or public.is_charity_admin(charity_id)
         or public.is_platform_admin());
revoke insert, update, delete on public.recurring_donations from authenticated;

-- Private notes: the donor only. Not even platform admins read them in the UI.
create policy private_notes_own on public.donation_private_notes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Receipts: donor own; charity own; platform all. Writes server-only.
-- ---------------------------------------------------------------------------
create policy receipts_read on public.s18a_receipts for select to authenticated
  using (donor_id in (select public.my_donor_ids())
         or public.is_charity_admin(charity_id)
         or public.is_platform_admin());
create policy receipt_links_read on public.s18a_receipt_donations for select to authenticated
  using (exists (select 1 from public.s18a_receipts r where r.id = receipt_id));

-- ---------------------------------------------------------------------------
-- Account-holder features: strictly own rows. Income is never visible to
-- charities or platform admins.
-- ---------------------------------------------------------------------------
create policy favourites_own on public.favourites for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy maaser_settings_own on public.maaser_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy maaser_income_own on public.maaser_income_entries for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy external_giving_own on public.external_giving_entries for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Audit log: platform admin read; writes server-only.
-- ---------------------------------------------------------------------------
create policy audit_admin_read on public.audit_log for select to authenticated
  using (public.is_platform_admin());

-- gateway_events and receipt_counters: no policies (server-only).

-- ---------------------------------------------------------------------------
-- Storage buckets
--   charity-public    logos and cover images (public read)
--   charity-documents onboarding documents and mandates (private)
--   receipts          generated s18A receipt PDFs (private, kept 5+ years)
-- Object paths start with the charity id: <charity_id>/<file>
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('charity-public', 'charity-public', true),
  ('charity-documents', 'charity-documents', false),
  ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy charity_public_write on storage.objects for all to authenticated
  using (bucket_id = 'charity-public'
         and (public.is_platform_admin() or public.is_charity_admin(((storage.foldername(name))[1])::uuid)))
  with check (bucket_id = 'charity-public'
         and (public.is_platform_admin() or public.is_charity_admin(((storage.foldername(name))[1])::uuid)));

create policy charity_documents_rw on storage.objects for all to authenticated
  using (bucket_id = 'charity-documents'
         and (public.is_platform_admin() or public.is_charity_admin(((storage.foldername(name))[1])::uuid)))
  with check (bucket_id = 'charity-documents'
         and (public.is_platform_admin() or public.is_charity_admin(((storage.foldername(name))[1])::uuid)));

-- Receipts bucket: read through short-lived signed URLs issued by the server.

-- Policies visible to anonymous visitors call these helpers; they simply
-- return false for someone who is not signed in.
grant execute on function public.is_platform_admin() to anon;
grant execute on function public.is_charity_admin(uuid) to anon;

-- ===== 20261007000001_charity_onboarding.sql =====
-- Open Hand: charity onboarding (milestone 2)

-- Date the charity says it signed a document (used for the receipting mandate).
alter table public.charity_documents add column signed_on date;

-- Once a charity has been approved, its own admins may no longer change the
-- legal identifiers that appear on receipts. Corrections go through a
-- platform admin.
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
     or new.rejection_reason is distinct from old.rejection_reason
     or new.slug is distinct from old.slug
     or new.quickgive_code is distinct from old.quickgive_code then
    raise exception 'Only a platform admin can change approval, badge or gateway fields';
  end if;
  if old.status in ('approved', 'suspended') and (
       new.legal_name_en is distinct from old.legal_name_en
       or new.legal_name_he is distinct from old.legal_name_he
       or new.npo_number is distinct from old.npo_number
       or new.pbo_number is distinct from old.pbo_number
       or new.s18a_reference is distinct from old.s18a_reference) then
    raise exception 'Legal details of an approved charity can only be changed by a platform admin';
  end if;
  -- A charity admin may only move draft/rejected -> pending_review (submit).
  if new.status is distinct from old.status
     and not (old.status in ('draft', 'rejected') and new.status = 'pending_review') then
    raise exception 'Only a platform admin can change charity status';
  end if;
  return new;
end $$;

-- Bank details decide where donations settle. After approval only a platform
-- admin may change them (and the change must be re-verified).
create or replace function public.guard_charity_bank_fields() returns trigger
language plpgsql as $$
declare st public.charity_status;
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') or public.is_platform_admin() then
    return new;
  end if;
  select status into st from public.charities where id = new.charity_id;
  if st in ('approved', 'suspended', 'pending_review') and (
       new.bank_name is distinct from old.bank_name
       or new.bank_account_holder is distinct from old.bank_account_holder
       or new.bank_account_number_encrypted is distinct from old.bank_account_number_encrypted
       or new.bank_account_last4 is distinct from old.bank_account_last4
       or new.bank_branch_code is distinct from old.bank_branch_code
       or new.bank_verified_at is distinct from old.bank_verified_at) then
    raise exception 'Bank details can only be changed by a platform admin once an application is submitted';
  end if;
  if new.bank_verified_at is distinct from old.bank_verified_at then
    raise exception 'Only the platform can mark bank details verified';
  end if;
  return new;
end $$;
create trigger charity_private_bank_guard before update on public.charity_private
  for each row execute function public.guard_charity_bank_fields();

-- Documents are locked once submitted (kept as the record of what was vetted).
create or replace function public.guard_charity_documents() returns trigger
language plpgsql as $$
declare st public.charity_status;
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') or public.is_platform_admin() then
    return coalesce(new, old);
  end if;
  select status into st from public.charities where id = coalesce(new.charity_id, old.charity_id);
  if tg_op in ('UPDATE', 'DELETE') and st not in ('draft', 'rejected') then
    raise exception 'Submitted documents cannot be changed or removed';
  end if;
  return coalesce(new, old);
end $$;
create trigger charity_documents_guard before insert or update or delete on public.charity_documents
  for each row execute function public.guard_charity_documents();

-- Directory search helpers
create index charities_status_name_idx on public.charities (status, name_en);

-- Storage: charity admins may upload and read their documents but not
-- overwrite or delete them (removal during draft goes through the server).
drop policy charity_documents_rw on storage.objects;
create policy charity_documents_read on storage.objects for select to authenticated
  using (bucket_id = 'charity-documents'
         and (public.is_platform_admin() or public.is_charity_admin(((storage.foldername(name))[1])::uuid)));
create policy charity_documents_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'charity-documents'
         and (public.is_platform_admin() or public.is_charity_admin(((storage.foldername(name))[1])::uuid)));
create policy charity_documents_platform on storage.objects for all to authenticated
  using (bucket_id = 'charity-documents' and public.is_platform_admin())
  with check (bucket_id = 'charity-documents' and public.is_platform_admin());

-- ===== 20261008000001_checkout.sql =====
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

-- ===== 20261009000001_security_hardening.sql =====
-- Open Hand: security hardening

-- Bank details: the guard trigger only covers updates, so a charity admin
-- could delete the private row and insert a new one with another bank
-- account (and even mark it verified). The row is created by the server when
-- an application starts and is never removed from the browser, so charity
-- admins may only update it.
revoke insert, delete on public.charity_private from authenticated;

-- Uploads: the type and size checks in the website's forms can be skipped by
-- uploading straight to storage, so the buckets enforce them too.
-- 5 MB matches MAX_UPLOAD_BYTES in src/lib/charity/validation.ts.
update storage.buckets
  set file_size_limit = 5242880, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
  where id = 'charity-public';
update storage.buckets
  set file_size_limit = 5242880, allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png']
  where id = 'charity-documents';

-- ===== 20261009000002_giving_kind.sql =====
-- Open Hand: what each gift is counted as for the donor's own records:
-- maaser, chomesh or general tzedaka. The donor chooses at checkout (no
-- default). Older rows stay empty. Only the donor's own maaser tracking uses it.
alter table public.donations
  add column giving_kind text check (giving_kind in ('maaser', 'chomesh', 'tzedaka'));

-- ===== 20261009000003_issue_receipts.sql =====
-- Open Hand: issuing s18A receipts.
--
-- One call issues one annual receipt for one donor, for one charity, for one
-- tax year, in a single transaction: the receipt number is taken, the receipt
-- is written and every donation it covers is linked. If anything is wrong the
-- whole call is refused and no number is used up.
--
-- The rules are enforced here, not just in the job that calls it:
--   * every donation must be paid, belong to this charity and donor, fall in
--     this tax year, have asked for an 18A receipt, and not already be on a
--     receipt (an issued one);
--   * the charity must be able to issue 18A (approved s18A and a signed mandate)
--     and the mandate must have been signed before the donation was paid;
--   * the receipt amount is the sum of the donations' gift amounts (never the
--     processing fee), worked out here, never passed in;
--   * only the server (service role) can call it.

create or replace function public.issue_s18a_receipt(
  p_charity_id uuid,
  p_donor_id uuid,
  p_tax_year int,
  p_donation_ids uuid[],
  p_number_prefix text,
  p_details jsonb
) returns table (receipt_id uuid, receipt_number int, receipt_reference text, amount_cents bigint)
language plpgsql security definer set search_path = '' as $$
declare
  c public.charities;
  found_count int;
  good_count int;
  total bigint;
  n int;
  new_id uuid := gen_random_uuid();
  ref text;
begin
  if p_donation_ids is null or array_length(p_donation_ids, 1) is null then
    raise exception 'A receipt needs at least one donation';
  end if;
  if array_length(p_donation_ids, 1) <> (select count(distinct x) from unnest(p_donation_ids) x) then
    raise exception 'The same donation was listed twice';
  end if;

  select * into c from public.charities where id = p_charity_id for update;
  if not found then raise exception 'Charity not found'; end if;
  if not public.charity_can_issue_18a(c) then
    raise exception 'This charity cannot issue s18A receipts (approval or mandate missing)';
  end if;

  select count(*) into found_count from public.donations where id = any (p_donation_ids);
  if found_count <> array_length(p_donation_ids, 1) then
    raise exception 'A listed donation does not exist';
  end if;

  select count(*), coalesce(sum(d.amount_cents), 0) into good_count, total
  from public.donations d
  where d.id = any (p_donation_ids)
    and d.status = 'paid'
    and d.charity_id = p_charity_id
    and d.donor_id = p_donor_id
    and d.tax_year = p_tax_year
    and d.wants_18a
    and c.mandate_signed_at <= d.paid_at
    and not exists (
      select 1 from public.s18a_receipt_donations l
      join public.s18a_receipts r on r.id = l.receipt_id
      where l.donation_id = d.id and r.status = 'issued'
    );
  if good_count <> array_length(p_donation_ids, 1) then
    raise exception 'A listed donation is not eligible for this receipt';
  end if;

  n := public.next_receipt_number(p_charity_id);
  ref := p_number_prefix || '-' || p_tax_year::text || '-' || lpad(n::text, 4, '0');

  insert into public.s18a_receipts (id, charity_id, receipt_number, donor_id, tax_year, amount_cents, details)
  values (new_id, p_charity_id, n, p_donor_id, p_tax_year, total,
          p_details || jsonb_build_object('receipt_reference', ref, 'amount_cents', total));
  insert into public.s18a_receipt_donations (receipt_id, donation_id)
  select new_id, x from unnest(p_donation_ids) x;

  return query select new_id, n, ref, total;
end $$;

revoke execute on function public.issue_s18a_receipt(uuid, uuid, int, uuid[], text, jsonb) from public, anon, authenticated;
grant execute on function public.issue_s18a_receipt(uuid, uuid, int, uuid[], text, jsonb) to service_role;

-- Receipt PDFs are small and only PDFs.
update storage.buckets set file_size_limit = 2097152, allowed_mime_types = array['application/pdf'] where id = 'receipts';

-- ===== 20261009000004_receipts_delivery.sql =====
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

-- ===== 20261009000005_charity_dashboard_access.sql =====
-- Open Hand: what a charity can see about its donations (the charity dashboard).
--
-- Until now a charity admin could read the WHOLE donation row through the API:
-- our platform fee and processing charge, the gateway reference, and the
-- donor's private choice of maaser, chomesh or general tzedaka. They could also
-- read whole donor rows. A charity should see what it needs to run its books
-- and issue receipts, and nothing more. So:
--
--   * the donor's private giving kind moves to its own donor-only table;
--   * charity admins can no longer read the donations, donors or checkout
--     details tables directly (donors and platform admins still can);
--   * charities read through purpose-built views and functions that leave out
--     fees, gateway data and the giving kind, and that only ever return rows
--     for charities the signed-in person manages.

-- ---------------------------------------------------------------------------
-- 1. The donor's private giving kind
-- ---------------------------------------------------------------------------
create table public.donation_giving_kinds (
  donation_id uuid primary key references public.donations (id) on delete cascade,
  kind text not null check (kind in ('maaser', 'chomesh', 'tzedaka'))
);
insert into public.donation_giving_kinds (donation_id, kind)
  select id, giving_kind from public.donations where giving_kind is not null;
alter table public.donations drop column giving_kind;

alter table public.donation_giving_kinds enable row level security;
revoke all on public.donation_giving_kinds from anon;
revoke insert, update, delete on public.donation_giving_kinds from authenticated;
create policy giving_kinds_donor_read on public.donation_giving_kinds for select to authenticated
  using (exists (
    select 1 from public.donations d
    where d.id = donation_id and d.donor_id in (select public.my_donor_ids())
  ));

-- ---------------------------------------------------------------------------
-- 2. Charity admins no longer read the base tables directly
-- ---------------------------------------------------------------------------
drop policy donations_read on public.donations;
create policy donations_read on public.donations for select to authenticated
  using (donor_id in (select public.my_donor_ids()) or public.is_platform_admin());

drop policy donors_own on public.donors;
create policy donors_own on public.donors for select to authenticated
  using (user_id = (select auth.uid()) or public.is_platform_admin());

-- (donation_checkout_details is readable only for donations the person can read,
--  so it follows the donations policy above.)

-- ---------------------------------------------------------------------------
-- 3. What a charity sees
-- ---------------------------------------------------------------------------
-- One row per donation to a charity the person manages (or any, for a platform
-- admin), with the donor details as typed at checkout. No fees, no gateway
-- data, no giving kind, no full ID or tax numbers (last 4 only).
create view public.charity_donations with (security_barrier = true) as
  select
    d.id, d.charity_id, d.donor_id, d.status, d.amount_cents,
    d.paid_at, d.created_at, d.refunded_at, d.charged_back_at, d.tax_year,
    d.wants_18a, d.is_anonymous, d.message, d.campaign_id, d.recurring_id,
    c.donor_type, c.first_name, c.last_name, c.organisation_name, c.registration_number,
    c.contact_person, c.email, c.phone,
    c.address_line1, c.address_line2, c.suburb, c.city, c.postal_code,
    c.id_number_last4, c.tax_reference_last4
  from public.donations d
  left join public.donation_checkout_details c on c.donation_id = d.id
  where public.is_charity_admin(d.charity_id) or public.is_platform_admin();

revoke all on public.charity_donations from anon, authenticated;
grant select on public.charity_donations to authenticated;

-- Totals for a period (by the day the donation was paid, or started if it never
-- was). Paid donations only count towards money; refunded and charged back are
-- counted separately.
create or replace function public.charity_overview(p_charity_id uuid, p_from timestamptz, p_to timestamptz)
returns table (
  paid_count bigint, paid_cents bigint, donor_count bigint,
  receipt_requested_cents bigint,
  refunded_count bigint, refunded_cents bigint, charged_back_count bigint,
  pending_count bigint, failed_count bigint
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_charity_admin(p_charity_id) or public.is_platform_admin()) then
    raise exception 'Not allowed';
  end if;
  return query
    select
      count(*) filter (where d.status = 'paid'),
      coalesce(sum(d.amount_cents) filter (where d.status = 'paid'), 0)::bigint,
      count(distinct d.donor_id) filter (where d.status = 'paid'),
      coalesce(sum(d.amount_cents) filter (where d.status = 'paid' and d.wants_18a), 0)::bigint,
      count(*) filter (where d.status = 'refunded'),
      coalesce(sum(d.amount_cents) filter (where d.status = 'refunded'), 0)::bigint,
      count(*) filter (where d.status = 'charged_back'),
      count(*) filter (where d.status = 'pending'),
      count(*) filter (where d.status = 'failed')
    from public.donations d
    where d.charity_id = p_charity_id
      and coalesce(d.paid_at, d.created_at) >= p_from and coalesce(d.paid_at, d.created_at) < p_to;
end $$;

-- Paid donations by calendar month in Johannesburg time, newest first.
create or replace function public.charity_monthly_totals(p_charity_id uuid, p_months int default 24)
returns table (month date, donation_count bigint, amount_cents bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_charity_admin(p_charity_id) or public.is_platform_admin()) then
    raise exception 'Not allowed';
  end if;
  return query
    select (date_trunc('month', d.paid_at at time zone 'Africa/Johannesburg'))::date as month,
           count(*), coalesce(sum(d.amount_cents), 0)::bigint
    from public.donations d
    where d.charity_id = p_charity_id and d.status = 'paid' and d.paid_at is not null
    group by 1
    order by 1 desc
    limit greatest(1, least(coalesce(p_months, 24), 120));
end $$;

-- One row per donor who has given (paid) to the charity, using the details they
-- typed with their most recent donation.
create or replace function public.charity_donor_list(p_charity_id uuid)
returns table (
  donor_id uuid, donor_type public.donor_type, display_name text, email text, phone text,
  donation_count bigint, total_cents bigint, first_paid_at timestamptz, last_paid_at timestamptz,
  wants_18a boolean, is_anonymous boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_charity_admin(p_charity_id) or public.is_platform_admin()) then
    raise exception 'Not allowed';
  end if;
  return query
    with paid as (
      select d.*, c.donor_type as dt, c.first_name, c.last_name, c.organisation_name, c.email as em, c.phone as ph
      from public.donations d
      join public.donation_checkout_details c on c.donation_id = d.id
      where d.charity_id = p_charity_id and d.status = 'paid'
    ), latest as (
      select distinct on (p.donor_id) p.donor_id as did, p.dt, p.first_name, p.last_name, p.organisation_name, p.em, p.ph
      from paid p order by p.donor_id, p.paid_at desc
    ), totals as (
      select p.donor_id as did, count(*) as n, sum(p.amount_cents)::bigint as total,
             min(p.paid_at) as first_at, max(p.paid_at) as last_at,
             bool_or(p.wants_18a) as w18, bool_or(p.is_anonymous) as anon
      from paid p group by p.donor_id
    )
    select l.did, l.dt,
           case when l.dt = 'individual' then trim(coalesce(l.first_name, '') || ' ' || coalesce(l.last_name, ''))
                else coalesce(l.organisation_name, '') end,
           l.em::text, l.ph, t.n, t.total, t.first_at, t.last_at, t.w18, t.anon
    from latest l join totals t on t.did = l.did
    order by t.total desc, t.last_at desc;
end $$;

revoke execute on function public.charity_overview(uuid, timestamptz, timestamptz) from public, anon;
revoke execute on function public.charity_monthly_totals(uuid, int) from public, anon;
revoke execute on function public.charity_donor_list(uuid) from public, anon;
grant execute on function public.charity_overview(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.charity_monthly_totals(uuid, int) to authenticated;
grant execute on function public.charity_donor_list(uuid) to authenticated;

-- ===== 20261009000006_contribution.sql =====
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

-- ===== 20261009000007_review_fixes.sql =====
-- Fixes from the code review (08/10/2026).

-- ---------------------------------------------------------------------------
-- 1. Admin rights need the second step (authenticator code) in the database
--    too, not only in the website. A session that only used the emailed link
--    (aal1) is treated as an ordinary signed-in person, even through the API.
-- ---------------------------------------------------------------------------
create or replace function public.has_second_step() returns boolean
language sql stable set search_path = '' as $$
  select coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'
$$;

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_second_step() and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'platform_admin'
  )
$$;

create or replace function public.is_charity_admin(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_second_step() and exists (
    select 1 from public.charity_admins ca
    where ca.charity_id = target and ca.user_id = (select auth.uid())
  )
$$;

grant execute on function public.has_second_step() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Charities only see donors who actually gave: not abandoned or failed
--    checkouts (POPIA: no reason to hold those people's details).
-- ---------------------------------------------------------------------------
create or replace view public.charity_donations with (security_barrier = true) as
  select
    d.id, d.charity_id, d.donor_id, d.status, d.amount_cents,
    d.paid_at, d.created_at, d.refunded_at, d.charged_back_at, d.tax_year,
    d.wants_18a, d.is_anonymous, d.message, d.campaign_id, d.recurring_id,
    c.donor_type, c.first_name, c.last_name, c.organisation_name, c.registration_number,
    c.contact_person, c.email, c.phone,
    c.address_line1, c.address_line2, c.suburb, c.city, c.postal_code,
    c.id_number_last4, c.tax_reference_last4
  from public.donations d
  left join public.donation_checkout_details c on c.donation_id = d.id
  where d.status in ('paid', 'refunded', 'charged_back')
    and (public.is_charity_admin(d.charity_id) or public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 3. Legal details are locked while an application is being reviewed, so
--    what was vetted is what gets approved.
-- ---------------------------------------------------------------------------
create or replace function public.lock_charity_under_review() returns trigger
language plpgsql as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') or public.is_platform_admin() then
    return new;
  end if;
  if old.status = 'pending_review' and (
       new.legal_name_en is distinct from old.legal_name_en
       or new.legal_name_he is distinct from old.legal_name_he
       or new.npo_number is distinct from old.npo_number
       or new.pbo_number is distinct from old.pbo_number
       or new.s18a_reference is distinct from old.s18a_reference) then
    raise exception 'Legal details cannot change while the application is being reviewed';
  end if;
  return new;
end $$;
create trigger charities_lock_under_review before update on public.charities
  for each row execute function public.lock_charity_under_review();

-- ---------------------------------------------------------------------------
-- 4. Indexes: payment lookups by reference (webhook, return page) and the
--    charity dashboard's newest-first lists.
-- ---------------------------------------------------------------------------
create index if not exists donations_gateway_ref_idx on public.donations (gateway_ref);
create index if not exists donations_charity_created_idx on public.donations (charity_id, created_at desc);

-- ===== 20261009000008_receipt_identity.sql =====
-- One s18A receipt per PERSON, not per email address.
--
-- Donations are joined to a donor record by email, so two people who use the
-- same email (spouses, or someone typing another person's address) would have
-- shared one receipt carrying one name and ID. Each donation now records a
-- keyed hash of the s18A identity typed with it (ID, tax or registration
-- number; never the number itself), and a receipt only ever covers donations
-- with the same identity.

alter table public.donation_checkout_details add column receipt_identity text;
alter table public.s18a_receipts add column donor_identity text not null default '';

drop index public.receipts_one_issued_per_donor_year;
create unique index receipts_one_issued_per_donor_year
  on public.s18a_receipts (charity_id, donor_id, donor_identity, tax_year) where status = 'issued';

drop function public.issue_s18a_receipt(uuid, uuid, int, uuid[], text, jsonb);

create or replace function public.issue_s18a_receipt(
  p_charity_id uuid,
  p_donor_id uuid,
  p_tax_year int,
  p_donation_ids uuid[],
  p_number_prefix text,
  p_details jsonb,
  p_donor_identity text default ''
) returns table (receipt_id uuid, receipt_number int, receipt_reference text, amount_cents bigint)
language plpgsql security definer set search_path = '' as $$
declare
  c public.charities;
  found_count int;
  good_count int;
  total bigint;
  n int;
  new_id uuid := gen_random_uuid();
  ref text;
begin
  if p_donation_ids is null or array_length(p_donation_ids, 1) is null then
    raise exception 'A receipt needs at least one donation';
  end if;
  if array_length(p_donation_ids, 1) <> (select count(distinct x) from unnest(p_donation_ids) x) then
    raise exception 'The same donation was listed twice';
  end if;

  select * into c from public.charities where id = p_charity_id for update;
  if not found then raise exception 'Charity not found'; end if;
  if not public.charity_can_issue_18a(c) then
    raise exception 'This charity cannot issue s18A receipts (approval or mandate missing)';
  end if;

  select count(*) into found_count from public.donations where id = any (p_donation_ids);
  if found_count <> array_length(p_donation_ids, 1) then
    raise exception 'A listed donation does not exist';
  end if;

  select count(*), coalesce(sum(d.amount_cents), 0) into good_count, total
  from public.donations d
  where d.id = any (p_donation_ids)
    and d.status = 'paid'
    and d.charity_id = p_charity_id
    and d.donor_id = p_donor_id
    and d.tax_year = p_tax_year
    and d.wants_18a
    and c.mandate_signed_at <= d.paid_at
    -- every donation was given under the same s18A identity (ID, tax or registration number)
    and coalesce((select x.receipt_identity from public.donation_checkout_details x where x.donation_id = d.id), '') = coalesce(p_donor_identity, '')
    and not exists (
      select 1 from public.s18a_receipt_donations l
      join public.s18a_receipts r on r.id = l.receipt_id
      where l.donation_id = d.id and r.status = 'issued'
    );
  if good_count <> array_length(p_donation_ids, 1) then
    raise exception 'A listed donation is not eligible for this receipt';
  end if;

  n := public.next_receipt_number(p_charity_id);
  ref := p_number_prefix || '-' || p_tax_year::text || '-' || lpad(n::text, 4, '0');

  insert into public.s18a_receipts (id, charity_id, receipt_number, donor_id, donor_identity, tax_year, amount_cents, details)
  values (new_id, p_charity_id, n, p_donor_id, coalesce(p_donor_identity, ''), p_tax_year, total,
          p_details || jsonb_build_object('receipt_reference', ref, 'amount_cents', total));
  insert into public.s18a_receipt_donations (receipt_id, donation_id)
  select new_id, x from unnest(p_donation_ids) x;

  return query select new_id, n, ref, total;
end $$;

revoke execute on function public.issue_s18a_receipt(uuid, uuid, int, uuid[], text, jsonb, text) from public, anon, authenticated;
grant execute on function public.issue_s18a_receipt(uuid, uuid, int, uuid[], text, jsonb, text) to service_role;

-- ===== 20261009000009_privacy_lanes.sql =====
-- Privacy audit (08/10/2026): everyone's information stays in its own lane.
--
--   Donors       their own donations, receipts and maaser records only.
--   Charities    their own charity, and donors who actually gave to them,
--                without fees, contributions, gateway data, the donor's
--                maaser/chomesh choice or any part of ID and tax numbers.
--   The public   approved charities' public profile only.
--   NEDIV lev    platform admins, with the authenticator second step.
--   The server   payments, receipts and gateway records (service role).

-- ---------------------------------------------------------------------------
-- 1. Nobody but the server may TRUNCATE (which ignores row-level security),
--    add triggers or reference tables; also for tables created later.
-- ---------------------------------------------------------------------------
do $$
declare t record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'p') loop
    execute format('revoke truncate, references, trigger on public.%I from anon, authenticated', t.relname);
  end loop;
end $$;
alter default privileges in schema public revoke truncate, references, trigger on tables from anon, authenticated;

-- Server-only tables: no client may even try to read them.
revoke all on public.gateway_events, public.receipt_counters, public.rate_limit_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Charities: the public sees the public profile, never gateway account
--    references, the mandate file's location or a rejection reason. Those
--    are read by the server after it has checked who is asking.
-- ---------------------------------------------------------------------------
revoke select on public.charities from anon, authenticated;
grant select (
  id, slug, quickgive_code, name_en, name_he, legal_name_en, legal_name_he, description_en, description_he,
  website, logo_path, cover_path, npo_number, pbo_number, s18a_reference,
  address_line1, address_line2, suburb, city, postal_code, status, is_verified, verified_at,
  is_s18a, s18a_confirmed_at, mandate_signed_at, approved_at, created_at, updated_at
) on public.charities to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. What a donor typed at checkout (ID and tax numbers, encrypted, and their
--    fingerprints) is read by the server only. Donors see their donations;
--    charities see the charity view. Two people sharing an email can no
--    longer read each other's typed details.
-- ---------------------------------------------------------------------------
drop policy checkout_details_read on public.donation_checkout_details;
create policy checkout_details_platform_read on public.donation_checkout_details for select to authenticated
  using (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 4. Monthly donations: charities no longer read the raw rows (they hold the
--    gateway's subscription and customer references), the same as donations.
-- ---------------------------------------------------------------------------
drop policy recurring_read on public.recurring_donations;
create policy recurring_read on public.recurring_donations for select to authenticated
  using (donor_id in (select public.my_donor_ids()) or public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 5. The charity view no longer carries any part of ID or tax numbers:
--    NEDIV lev issues the receipts, so charities don't need them.
-- ---------------------------------------------------------------------------
drop view public.charity_donations;
create view public.charity_donations with (security_barrier = true) as
  select
    d.id, d.charity_id, d.donor_id, d.status, d.amount_cents,
    d.paid_at, d.created_at, d.refunded_at, d.charged_back_at, d.tax_year,
    d.wants_18a, d.is_anonymous, d.message, d.campaign_id, d.recurring_id,
    c.donor_type, c.first_name, c.last_name, c.organisation_name, c.registration_number,
    c.contact_person, c.email, c.phone,
    c.address_line1, c.address_line2, c.suburb, c.city, c.postal_code
  from public.donations d
  left join public.donation_checkout_details c on c.donation_id = d.id
  where d.status in ('paid', 'refunded', 'charged_back')
    and (public.is_charity_admin(d.charity_id) or public.is_platform_admin());
revoke all on public.charity_donations from anon, authenticated;
grant select on public.charity_donations to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Leftovers: a helper from before the charity view existed, and trigger
--    functions that no client should call.
-- ---------------------------------------------------------------------------
drop function if exists public.donor_gave_to_my_charity(uuid);
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. A charity's document records may only point at files in that charity's
--    own folder, so removing a draft document can never touch another
--    charity's file.
-- ---------------------------------------------------------------------------
alter table public.charity_documents add constraint charity_documents_own_folder
  check (storage_path like charity_id::text || '/%' and storage_path not like '%..%');

-- ===== 20261009000010_consents_and_requests.sql =====
-- POPIA: a record of what each person agreed to, and their requests about
-- their own information.

-- ---------------------------------------------------------------------------
-- 1. Agreements. One row each time someone agrees, with the version of the
--    Terms and Privacy Policy they saw. Written by the server only.
-- ---------------------------------------------------------------------------
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in (
    'account',              -- signed-in person agreed to the Terms and Privacy Policy
    'donation',             -- donor agreed to the Terms, Privacy Policy and sharing with the charity
    'charity_declarations'  -- charity applicant's declarations on submitting
  )),
  policy_version text not null,
  user_id uuid references auth.users (id) on delete set null,
  donation_id uuid references public.donations (id) on delete cascade,
  charity_id uuid references public.charities (id) on delete cascade,
  accepted_at timestamptz not null default now(),
  constraint consent_has_subject check (
    (kind = 'account' and user_id is not null)
    or (kind = 'donation' and donation_id is not null)
    or (kind = 'charity_declarations' and charity_id is not null and user_id is not null)
  )
);
create index consents_user_idx on public.consents (user_id, kind, accepted_at desc);
create index consents_donation_idx on public.consents (donation_id);

alter table public.consents enable row level security;
revoke all on public.consents from anon, authenticated;
grant select on public.consents to authenticated;
create policy consents_own_read on public.consents for select to authenticated
  using (user_id = (select auth.uid()) or public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 2. Requests about one's own information (POPIA sections 23 and 24):
--    correct it, delete it, or object. Handled by the Information Officer.
-- ---------------------------------------------------------------------------
create table public.data_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('delete', 'correct', 'object')),
  details text check (char_length(details) <= 2000),
  status text not null default 'open' check (status in ('open', 'done', 'declined')),
  response text check (char_length(response) <= 2000),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid references auth.users (id)
);
create index data_requests_open_idx on public.data_requests (status, created_at);

alter table public.data_requests enable row level security;
revoke all on public.data_requests from anon, authenticated;
grant select on public.data_requests to authenticated;
create policy data_requests_read on public.data_requests for select to authenticated
  using (user_id = (select auth.uid()) or public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 3. Rate-limit rows (IP addresses, emails) are cleared after about a day.
-- ---------------------------------------------------------------------------
create index if not exists rate_limit_created_idx on public.rate_limit_events (created_at);

-- ===== 20261009000011_app_sign_in.sql =====
-- Sign-in from the phone app (email code, no website callback), so the app
-- can do the two things the website's sign-in callback does on the server.

-- 1. Join the donations given with this email to the signed-in account. Only
--    for a confirmed email address (the person typed the code sent to it), and
--    only donor records that no account has claimed yet.
create or replace function public.link_my_donations() returns int
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  addr text;
  n int;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  select u.email into addr from auth.users u where u.id = uid and u.email_confirmed_at is not null;
  if addr is null then return 0; end if;
  update public.donors
     set user_id = uid,
         email_verified_at = coalesce(email_verified_at, now())
   where lower(email::text) = lower(addr)
     and user_id is null;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.link_my_donations() from public, anon;
grant execute on function public.link_my_donations() to authenticated;

-- 2. Record that the signed-in person agreed to the Terms and Privacy Policy
--    (the app's version of the website's /agree page).
create or replace function public.agree_to_policy(p_version text) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if p_version is null or p_version !~ '^[0-9a-z.-]{1,40}$' then raise exception 'Unknown policy version'; end if;
  insert into public.consents (kind, policy_version, user_id) values ('account', p_version, uid);
end $$;
revoke execute on function public.agree_to_policy(text) from public, anon;
grant execute on function public.agree_to_policy(text) to authenticated;

-- ===== 20261009000012_log_and_recurring.sql =====
-- Giving made elsewhere, and pausing or cancelling a monthly donation, from the app.

-- ---------------------------------------------------------------------------
-- 1. "Given elsewhere" entries (cash, shul appeals, other charities) carry the
--    donor's own maaser / chomesh / tzedaka choice, like every other donation.
-- ---------------------------------------------------------------------------
alter table public.external_giving_entries add column kind text not null default 'tzedaka';
alter table public.external_giving_entries alter column kind drop default;
alter table public.external_giving_entries
  add constraint external_giving_kind check (kind in ('maaser', 'chomesh', 'tzedaka')),
  add constraint external_giving_recipient_length check (char_length(recipient_text) between 1 and 120),
  add constraint external_giving_date check (entry_date >= date '2000-01-01');

-- ---------------------------------------------------------------------------
-- 2. Monthly donations: the donor pauses, resumes or cancels their own.
--
--    The change is saved at once, and `needs_gateway_sync` stays true until the
--    server has told the payment provider (the provider, not us, takes monthly
--    payments, so saving it here alone does not stop them). The app shows the
--    request as "waiting" until then.
-- ---------------------------------------------------------------------------
alter table public.recurring_donations add column needs_gateway_sync boolean not null default false;

create or replace function public.set_my_recurring_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  cur public.recurring_status;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if p_status not in ('active', 'paused', 'cancelled') then raise exception 'Unknown status'; end if;

  select r.status into cur
  from public.recurring_donations r
  join public.donors d on d.id = r.donor_id
  where r.id = p_id and d.user_id = uid
  for update of r;
  if not found then raise exception 'Monthly donation not found'; end if;

  if cur::text = p_status then return; end if;
  if not (
       (cur = 'active' and p_status in ('paused', 'cancelled'))
    or (cur = 'paused' and p_status in ('active', 'cancelled'))
  ) then
    raise exception 'A % monthly donation cannot be set to %', cur, p_status;
  end if;

  update public.recurring_donations
     set status = p_status::public.recurring_status,
         paused_at = case p_status when 'paused' then now() when 'active' then null else paused_at end,
         cancelled_at = case p_status when 'cancelled' then now() else cancelled_at end,
         needs_gateway_sync = true
   where id = p_id;
end $$;
revoke execute on function public.set_my_recurring_status(uuid, text) from public, anon;
grant execute on function public.set_my_recurring_status(uuid, text) to authenticated;

-- ===== 20261009000013_funds_use.sql =====
-- Charity profile: "How your donation is used", written by the charity and
-- shown on its public page and in the app. Public, like the description.
alter table public.charities
  add column funds_use_en text check (char_length(funds_use_en) <= 1500);
grant select (funds_use_en) on public.charities to anon, authenticated;

-- ===== 20261009000014_thank_you_note.sql =====
-- A short thank-you note a charity writes for its donors, shown in the app
-- when a donation to it arrives. Public, like the rest of the profile.
alter table public.charities
  add column thank_you_en text check (char_length(thank_you_en) <= 300);
grant select (thank_you_en) on public.charities to anon, authenticated;

-- ===== 20261009000015_photos_and_updates.sql =====
-- Real photos and short updates from charities (09/10/2026).
--
-- A charity's own admins add photos (with a short caption) and post updates
-- such as "This month we delivered 140 parcels". Both are public once the
-- charity is approved, and show on its page on the website and in the app.
-- Who posted an update is kept for NEDIV lev, never shown to the public.
-- Files live in the public bucket under <charity_id>/photos/ and
-- <charity_id>/updates/, which only that charity's admins can write to.

create table public.charity_photos (
  id uuid primary key default gen_random_uuid(),
  charity_id uuid not null references public.charities (id) on delete cascade,
  storage_path text not null
    check (storage_path like charity_id::text || '/photos/%' and storage_path not like '%..%'),
  caption_en text check (char_length(caption_en) <= 120),
  created_at timestamptz not null default now()
);
create index charity_photos_charity on public.charity_photos (charity_id, created_at);

create table public.charity_updates (
  id uuid primary key default gen_random_uuid(),
  charity_id uuid not null references public.charities (id) on delete cascade,
  body_en text not null check (char_length(btrim(body_en)) between 1 and 500),
  photo_path text
    check (photo_path is null or (photo_path like charity_id::text || '/updates/%' and photo_path not like '%..%')),
  posted_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index charity_updates_charity on public.charity_updates (charity_id, created_at desc);

alter table public.charity_photos enable row level security;
alter table public.charity_updates enable row level security;

-- Columns: the public never sees who posted. Nothing is edited in place:
-- a charity removes a photo or update and adds a new one.
revoke all on public.charity_photos, public.charity_updates from anon, authenticated;
grant select on public.charity_photos to anon, authenticated;
grant insert (charity_id, storage_path, caption_en), delete on public.charity_photos to authenticated;
grant select (id, charity_id, body_en, photo_path, created_at) on public.charity_updates to anon, authenticated;
grant insert (charity_id, body_en, photo_path), delete on public.charity_updates to authenticated;

create policy charity_photos_read on public.charity_photos for select to anon, authenticated
  using (exists (select 1 from public.charities c where c.id = charity_id and c.status = 'approved')
         or public.is_charity_admin(charity_id) or public.is_platform_admin());
create policy charity_photos_add on public.charity_photos for insert to authenticated
  with check (public.is_charity_admin(charity_id) or public.is_platform_admin());
create policy charity_photos_remove on public.charity_photos for delete to authenticated
  using (public.is_charity_admin(charity_id) or public.is_platform_admin());

create policy charity_updates_read on public.charity_updates for select to anon, authenticated
  using (exists (select 1 from public.charities c where c.id = charity_id and c.status = 'approved')
         or public.is_charity_admin(charity_id) or public.is_platform_admin());
create policy charity_updates_add on public.charity_updates for insert to authenticated
  with check ((public.is_charity_admin(charity_id) or public.is_platform_admin()) and posted_by = auth.uid());
create policy charity_updates_remove on public.charity_updates for delete to authenticated
  using (public.is_charity_admin(charity_id) or public.is_platform_admin());

-- At most 12 photos per charity, so a page stays quick to load.
create function public.limit_charity_photos() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('charity_photos:' || new.charity_id::text));
  if (select count(*) from public.charity_photos where charity_id = new.charity_id) >= 12 then
    raise exception 'A charity can have up to 12 photos' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke execute on function public.limit_charity_photos() from public, anon, authenticated;
create trigger charity_photos_limit before insert on public.charity_photos
  for each row execute function public.limit_charity_photos();

-- ===== 20261009000016_review_fixes.sql =====
-- Full review (09/10/2026): database fixes.

-- ---------------------------------------------------------------------------
-- 1. Joining past donations to an account needs proof the person reads that
--    inbox: a sign-in by emailed code or link in this session. A password
--    sign-up for someone else's address must never claim their history.
-- ---------------------------------------------------------------------------
create or replace function public.link_my_donations() returns int
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  addr text;
  n int;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if not exists (
    select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) a
    where a ->> 'method' in ('otp', 'magiclink', 'email/signup')
  ) then
    return 0;
  end if;
  select u.email into addr from auth.users u where u.id = uid and u.email_confirmed_at is not null;
  if addr is null then return 0; end if;
  update public.donors
     set user_id = uid,
         email_verified_at = coalesce(email_verified_at, now())
   where lower(email::text) = lower(addr)
     and user_id is null;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.link_my_donations() from public, anon;
grant execute on function public.link_my_donations() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. A private note can only be written on the person's own donation, and
--    one person's note can't block another's.
-- ---------------------------------------------------------------------------
alter table public.donation_private_notes drop constraint donation_private_notes_pkey;
alter table public.donation_private_notes add primary key (donation_id, user_id);
drop policy private_notes_own on public.donation_private_notes;
create policy private_notes_own on public.donation_private_notes for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
              and donation_id in (select d.id from public.donations d where d.donor_id in (select public.my_donor_ids())));

-- ---------------------------------------------------------------------------
-- 3. Functions are not callable by everyone by default: only where granted.
-- ---------------------------------------------------------------------------
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           join pg_roles r on r.oid = p.proowner
           where n.nspname = 'public' and r.rolname = 'postgres' loop
    execute format('revoke execute on function %s from public', f.sig);
  end loop;
end $$;
alter default privileges in schema public revoke execute on functions from public;
-- Used inside row-level security policies, so the signed-in roles need them.
grant execute on function public.has_second_step(), public.is_platform_admin(), public.is_charity_admin(uuid) to anon, authenticated;
grant execute on function public.charity_can_issue_18a(public.charities) to anon, authenticated;
grant execute on function public.my_donor_ids() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Issued receipts: every field is fixed, including who they are for.
--    Voiding sets the void fields once; nothing else ever changes.
-- ---------------------------------------------------------------------------
create or replace function public.guard_receipt_immutable() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 's18A receipts are never deleted; void them instead';
  end if;
  if old.status = 'void' then
    raise exception 'A void receipt cannot be changed';
  end if;
  if (new.charity_id, new.receipt_number, new.donor_id, new.donor_identity, new.tax_year, new.amount_cents, new.details, new.issued_at)
     is distinct from
     (old.charity_id, old.receipt_number, old.donor_id, old.donor_identity, old.tax_year, old.amount_cents, old.details, old.issued_at)
     or (old.pdf_path is not null and new.pdf_path is distinct from old.pdf_path)
     or (new.status = 'issued' and (new.voided_at, new.void_reason, new.replaced_by_id) is distinct from (old.voided_at, old.void_reason, old.replaced_by_id)) then
    raise exception 'Issued receipts are immutable; void and reissue instead';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Once a donation is processed, what decides its receipt is fixed too.
-- ---------------------------------------------------------------------------
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
  if old.status in ('paid', 'refunded', 'charged_back') and (
       new.paid_at, new.tax_year, new.wants_18a) is distinct from (old.paid_at, old.tax_year, old.wants_18a) then
    raise exception 'The date, tax year and receipt choice of a paid donation cannot change';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Narrower table rights (row-level security already blocked these).
-- ---------------------------------------------------------------------------
revoke insert, delete on public.profiles from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Charity documents: none added after submission, and the uploader is
--    whoever is signed in.
-- ---------------------------------------------------------------------------
create or replace function public.guard_charity_documents() returns trigger
language plpgsql as $$
declare st public.charity_status;
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') or public.is_platform_admin() then
    return coalesce(new, old);
  end if;
  select status into st from public.charities where id = coalesce(new.charity_id, old.charity_id);
  if st not in ('draft', 'rejected') then
    raise exception 'Documents cannot be added, changed or removed once the application is submitted';
  end if;
  if tg_op = 'INSERT' and new.uploaded_by is distinct from (select auth.uid()) then
    raise exception 'Documents are recorded as uploaded by the person signed in';
  end if;
  return coalesce(new, old);
end $$;

-- ---------------------------------------------------------------------------
-- 8. A charity's created date is a record, not something it edits.
-- ---------------------------------------------------------------------------
revoke update on public.charities from authenticated;
grant update (name_en, name_he, legal_name_en, legal_name_he, description_en, description_he, funds_use_en, thank_you_en,
  website, logo_path, cover_path, npo_number, pbo_number, s18a_reference, address_line1, address_line2, suburb, city,
  postal_code, status, rejection_reason, is_verified, verified_at, is_s18a, s18a_confirmed_at, mandate_signed_at,
  mandate_document_path, approved_at, updated_at) on public.charities to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Indexes for the columns row-level security and receipts look up.
-- ---------------------------------------------------------------------------
create index if not exists s18a_receipts_donor on public.s18a_receipts (donor_id);
create index if not exists recurring_donations_donor on public.recurring_donations (donor_id);
create index if not exists s18a_receipt_donations_donation on public.s18a_receipt_donations (donation_id);
create index if not exists donation_private_notes_user on public.donation_private_notes (user_id);
create index if not exists maaser_income_entries_user on public.maaser_income_entries (user_id);
create index if not exists external_giving_entries_user on public.external_giving_entries (user_id);
create index if not exists data_requests_user on public.data_requests (user_id);
create index if not exists charity_documents_charity on public.charity_documents (charity_id);

-- ===== 20261011000001_confirmation_credentials.sql =====
-- Donation confirmation credentials (11/10/2026).
--
-- The confirmation page used to trust the donation id in its address. Charity
-- admins can see that id (dashboard and CSV export), so it could open the
-- donor's private giving choice and contribution. The page now needs either
-- the signed-in donor or a long random credential that is sent only to the
-- donor (in the gateway return address). Only its hash is stored, in a table
-- no client can read.
create table public.donation_confirmations (
  donation_id uuid primary key references public.donations (id) on delete cascade,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

alter table public.donation_confirmations enable row level security;
-- No policies: server only (service role).
revoke all on public.donation_confirmations from anon, authenticated;

-- ===== 20261012000001_bank_edit_clears_verified.sql =====
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

-- ===== 20261013000001_monthly_giving.sql =====
-- Monthly giving (13/10/2026).
--
-- A donor's first monthly payment is an ordinary card payment. The gateway then returns a
-- reusable card authorisation, which we keep (encrypted, server-only) and use to collect the
-- same amount once a month, from our own scheduled job. The donor can pause or cancel at any
-- time; cancelling destroys the stored authorisation.

alter type public.recurring_status add value if not exists 'pending';  -- waiting for the first payment

alter table public.recurring_donations
  add column contribution_cents bigint not null default 0 check (contribution_cents >= 0),
  add column first_donation_id uuid references public.donations (id),
  -- Day of the month to collect on (Johannesburg). 29-31 collect on the last day of shorter months.
  add column charge_day integer check (charge_day between 1 and 31),
  -- The reusable card authorisation, encrypted with the server key. Never readable by any client.
  add column authorization_encrypted text,
  add column card_brand text,
  add column card_last4 text check (card_last4 is null or card_last4 ~ '^[0-9]{4}$'),
  add column card_exp text,
  -- The month ("yyyy-mm", Johannesburg) last collected, and the month now being attempted.
  add column last_paid_period text check (last_paid_period is null or last_paid_period ~ '^[0-9]{4}-[0-9]{2}$'),
  add column attempt_period text check (attempt_period is null or attempt_period ~ '^[0-9]{4}-[0-9]{2}$'),
  add column failed_attempts integer not null default 0 check (failed_attempts >= 0),
  add column last_attempt_at timestamptz,
  add column ended_reason text;

create index recurring_due_idx on public.recurring_donations (next_charge_at) where status = 'active';
create index recurring_first_donation_idx on public.recurring_donations (first_donation_id);

-- The authorisation is a token that can charge a card: no client may read it, not even its owner.
revoke select on public.recurring_donations from authenticated;
grant select (
  id, donor_id, charity_id, campaign_id, amount_cents, contribution_cents, status, wants_18a, is_anonymous,
  message, gateway, gateway_subscription_ref, gateway_customer_ref, next_charge_at, paused_at, cancelled_at,
  created_at, updated_at, needs_gateway_sync, first_donation_id, charge_day, card_brand, card_last4, card_exp,
  last_paid_period, failed_attempts, ended_reason
) on public.recurring_donations to authenticated;

-- The donor's authorisation to collect monthly is recorded with the first donation.
alter table public.consents drop constraint consents_kind_check;
alter table public.consents add constraint consents_kind_check check (kind in (
  'account', 'donation', 'charity_declarations',
  'monthly_authorisation'  -- donor authorised collecting the same amount every month until they cancel
));
alter table public.consents drop constraint consent_has_subject;
alter table public.consents add constraint consent_has_subject check (
  (kind = 'account' and user_id is not null)
  or (kind in ('donation', 'monthly_authorisation') and donation_id is not null)
  or (kind = 'charity_declarations' and charity_id is not null and user_id is not null)
);

-- The collection job is the one that takes the monthly payments, so there is nothing to
-- "tell the payment provider" when a donor pauses or cancels: it takes effect at once.
-- Cancelling also destroys the stored card authorisation.
create or replace function public.set_my_recurring_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  cur public.recurring_status;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if p_status not in ('active', 'paused', 'cancelled') then raise exception 'Unknown status'; end if;

  select r.status into cur
  from public.recurring_donations r
  join public.donors d on d.id = r.donor_id
  where r.id = p_id and d.user_id = uid
  for update of r;
  if not found then raise exception 'Monthly donation not found'; end if;

  if cur::text = p_status then return; end if;
  if not (
       (cur in ('active', 'failed') and p_status in ('paused', 'cancelled'))
    or (cur = 'paused' and p_status in ('active', 'cancelled'))
    or (cur = 'pending' and p_status = 'cancelled')
  ) then
    raise exception 'A % monthly donation cannot be set to %', cur, p_status;
  end if;

  update public.recurring_donations
     set status = p_status::public.recurring_status,
         paused_at = case p_status when 'paused' then now() when 'active' then null else paused_at end,
         cancelled_at = case p_status when 'cancelled' then now() else cancelled_at end,
         authorization_encrypted = case p_status when 'cancelled' then null else authorization_encrypted end,
         ended_reason = case p_status when 'cancelled' then 'cancelled by the donor' else ended_reason end,
         needs_gateway_sync = false
   where id = p_id;
end $$;
revoke execute on function public.set_my_recurring_status(uuid, text) from public, anon;
grant execute on function public.set_my_recurring_status(uuid, text) to authenticated;

-- ===== 20261013000002_erase_donor.sql =====
-- Erasing a donor's personal information (POPIA), 13/10/2026.
--
-- Run by a platform admin from the privacy requests page (service role only). It removes what
-- identifies the person and keeps what tax law requires: each donation's amount, date, charity
-- and tax year, and every issued s18A receipt. The donor and checkout-detail rows stay as
-- anonymised shells (the donations point to them).
alter table public.donors add column if not exists erased_at timestamptz;
alter table public.donation_checkout_details add column if not exists erased_at timestamptz;

create or replace function public.erase_donor_data(p_donor_ids uuid[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  emails text[];
  refs text[];
  n_donors int; n_details int; n_monthly int; n_events int; n_kinds int; n_messages int;
begin
  if p_donor_ids is null or cardinality(p_donor_ids) = 0 then
    return jsonb_build_object('donors', 0);
  end if;

  select coalesce(array_agg(distinct lower(email::text)), '{}') into emails
    from (select email from public.donors where id = any (p_donor_ids)
          union select c.email from public.donation_checkout_details c
                join public.donations d on d.id = c.donation_id where d.donor_id = any (p_donor_ids)) e;
  select coalesce(array_agg(gateway_ref), '{}') into refs
    from public.donations where donor_id = any (p_donor_ids) and gateway_ref is not null;

  -- Monthly donations stop, and the stored card is destroyed.
  update public.recurring_donations
     set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now()), authorization_encrypted = null,
         ended_reason = coalesce(ended_reason, 'the donor''s information was erased'), message = null,
         card_last4 = null, card_brand = null, card_exp = null, needs_gateway_sync = false
   where donor_id = any (p_donor_ids);
  get diagnostics n_monthly = row_count;

  -- Free text the donor wrote.
  update public.donations set message = null where donor_id = any (p_donor_ids) and message is not null;
  get diagnostics n_messages = row_count;

  -- The private maaser / chomesh / tzedaka choice and the confirmation links.
  delete from public.donation_giving_kinds where donation_id in (select id from public.donations where donor_id = any (p_donor_ids));
  get diagnostics n_kinds = row_count;
  delete from public.donation_confirmations where donation_id in (select id from public.donations where donor_id = any (p_donor_ids));

  -- Who they are, as typed at each checkout. Amounts and dates stay on the donations.
  update public.donation_checkout_details c
     set email = 'erased+' || c.donation_id::text || '@erased.invalid',
         first_name = null, last_name = null, organisation_name = null, registration_number = null,
         contact_person = null, phone = null, id_number_encrypted = null, id_number_last4 = null,
         tax_reference_encrypted = null, tax_reference_last4 = null, address_line1 = null, address_line2 = null,
         suburb = null, city = null, postal_code = null, receipt_identity = null, erased_at = now()
   where c.donation_id in (select id from public.donations where donor_id = any (p_donor_ids));
  get diagnostics n_details = row_count;

  -- The donor record itself.
  update public.donors
     set email = 'erased+' || id::text || '@erased.invalid', email_verified_at = null,
         first_name = null, last_name = null, phone = null, registration_number = null,
         organisation_name = case when donor_type = 'individual' then null else 'Erased' end,
         contact_person = null, id_number_encrypted = null, id_number_last4 = null,
         tax_reference_encrypted = null, tax_reference_last4 = null, address_line1 = null, address_line2 = null,
         suburb = null, city = null, postal_code = null, date_of_birth = null, user_id = null, erased_at = now()
   where id = any (p_donor_ids);
  get diagnostics n_donors = row_count;

  -- The gateway's raw records of their payments keep the reference and event, not the customer.
  update public.gateway_events
     set payload = jsonb_build_object(
           'event', payload->>'event',
           'reference', coalesce(payload->'data'->>'reference', payload->>'reference'),
           'redacted', true)
   where coalesce(payload->'data'->>'reference', payload->>'reference') = any (refs)
     and coalesce(payload->>'redacted', 'false') <> 'true';
  get diagnostics n_events = row_count;

  -- Their address in the rate limiter's short-lived records.
  delete from public.rate_limit_events where key = any (select 'email:' || e from unnest(emails) e);

  return jsonb_build_object('donors', n_donors, 'checkout_details', n_details, 'monthly_stopped', n_monthly,
                            'giving_choices', n_kinds, 'messages', n_messages, 'gateway_records', n_events);
end $$;
revoke execute on function public.erase_donor_data(uuid[]) from public, anon, authenticated;
grant execute on function public.erase_donor_data(uuid[]) to service_role;

-- ===== 20261014000001_account_deletion_unblocked.sql =====
-- Deleting a person's sign-in account must not be blocked by records that only mention them.
-- Found 13/10/2026: every real donor has an audit row and an "account" agreement, and both
-- stopped the account from being deleted, so an erasure never finished.
--
-- The audit log is append-only, so it cannot be updated when a person goes. It keeps the
-- bare id (no name or email) as the record of who did what, so the link is dropped instead.
alter table public.audit_log drop constraint audit_log_actor_user_id_fkey;

-- An agreement record must name a person (or a donation or charity), so it cannot be left
-- pointing at nobody when the account goes. The erasure code removes the person's own
-- agreement records first (src/lib/privacy/erase.ts); the donation agreements stay with the donation.

-- Staff-only columns: forget who, keep the record.
alter table public.charity_documents drop constraint charity_documents_uploaded_by_fkey;
alter table public.charity_documents add constraint charity_documents_uploaded_by_fkey
  foreign key (uploaded_by) references auth.users (id) on delete set null;
alter table public.fee_settings drop constraint fee_settings_created_by_fkey;
alter table public.fee_settings add constraint fee_settings_created_by_fkey
  foreign key (created_by) references auth.users (id) on delete set null;
alter table public.data_requests drop constraint data_requests_closed_by_fkey;
alter table public.data_requests add constraint data_requests_closed_by_fkey
  foreign key (closed_by) references auth.users (id) on delete set null;

-- ===== 20261014000002_resume_waits_for_charge_day.sql =====
-- A monthly donation that is resumed waits for its charge day, 13/10/2026.
--
-- Before: pausing left the old collection time in place, so resuming on the 20th a donation
-- with charge day 15 was collected within the hour. Now a resumed donation is collected on its
-- charge day: this month's if that is still ahead and the month is not already collected,
-- otherwise next month's. (08:00 Johannesburg time = 06:00 UTC, as in src/lib/donations/schedule.ts.)
create or replace function public.monthly_charge_time(p_month_start timestamp, p_day int) returns timestamptz
language sql immutable set search_path = '' as $$
  select (p_month_start
          + (least(p_day, extract(day from (p_month_start + interval '1 month' - interval '1 day'))::int) - 1) * interval '1 day'
          + time '06:00') at time zone 'UTC'
$$;

create or replace function public.set_my_recurring_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  cur public.recurring_status;
  r_day int;
  r_paid text;
  this_month timestamp := date_trunc('month', now() at time zone 'Africa/Johannesburg');
  this_charge timestamptz;
  new_next timestamptz;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if p_status not in ('active', 'paused', 'cancelled') then raise exception 'Unknown status'; end if;

  select r.status, r.charge_day, r.last_paid_period into cur, r_day, r_paid
  from public.recurring_donations r
  join public.donors d on d.id = r.donor_id
  where r.id = p_id and d.user_id = uid
  for update of r;
  if not found then raise exception 'Monthly donation not found'; end if;

  if cur::text = p_status then return; end if;
  if not (
       (cur in ('active', 'failed') and p_status in ('paused', 'cancelled'))
    or (cur = 'paused' and p_status in ('active', 'cancelled'))
    or (cur = 'pending' and p_status = 'cancelled')
  ) then
    raise exception 'A % monthly donation cannot be set to %', cur, p_status;
  end if;

  if p_status = 'active' then
    this_charge := public.monthly_charge_time(this_month, r_day);
    new_next := case
      when r_paid is distinct from to_char(this_month, 'YYYY-MM') and this_charge > now() then this_charge
      else public.monthly_charge_time(this_month + interval '1 month', r_day)
    end;
  end if;

  update public.recurring_donations
     set status = p_status::public.recurring_status,
         paused_at = case p_status when 'paused' then now() when 'active' then null else paused_at end,
         cancelled_at = case p_status when 'cancelled' then now() else cancelled_at end,
         authorization_encrypted = case p_status when 'cancelled' then null else authorization_encrypted end,
         ended_reason = case p_status when 'cancelled' then 'cancelled by the donor' else ended_reason end,
         next_charge_at = case when p_status = 'active' then new_next else next_charge_at end,
         needs_gateway_sync = false
   where id = p_id;
end $$;
revoke execute on function public.set_my_recurring_status(uuid, text) from public, anon;
grant execute on function public.set_my_recurring_status(uuid, text) to authenticated;
revoke execute on function public.monthly_charge_time(timestamp, int) from public, anon, authenticated;

-- ===== 20261014000003_review_fixes.sql =====
-- Review fixes, 14/10/2026.
--
-- 1. Erasing a donor always marks their monthly donations as ended by the erasure. Before, a
--    monthly donation already closed as "the first payment failed" kept that reason, and a late
--    successful first payment could then start it again for an erased donor.
create or replace function public.erase_donor_data(p_donor_ids uuid[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  emails text[];
  refs text[];
  n_donors int; n_details int; n_monthly int; n_events int; n_kinds int; n_messages int;
begin
  if p_donor_ids is null or cardinality(p_donor_ids) = 0 then
    return jsonb_build_object('donors', 0);
  end if;

  select coalesce(array_agg(distinct lower(email::text)), '{}') into emails
    from (select email from public.donors where id = any (p_donor_ids)
          union select c.email from public.donation_checkout_details c
                join public.donations d on d.id = c.donation_id where d.donor_id = any (p_donor_ids)) e;
  select coalesce(array_agg(gateway_ref), '{}') into refs
    from public.donations where donor_id = any (p_donor_ids) and gateway_ref is not null;

  -- Monthly donations stop, and the stored card is destroyed.
  update public.recurring_donations
     set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now()), authorization_encrypted = null,
         ended_reason = 'the donor''s information was erased', message = null,
         card_last4 = null, card_brand = null, card_exp = null, needs_gateway_sync = false
   where donor_id = any (p_donor_ids);
  get diagnostics n_monthly = row_count;

  -- Free text the donor wrote.
  update public.donations set message = null where donor_id = any (p_donor_ids) and message is not null;
  get diagnostics n_messages = row_count;

  -- The private maaser / chomesh / tzedaka choice and the confirmation links.
  delete from public.donation_giving_kinds where donation_id in (select id from public.donations where donor_id = any (p_donor_ids));
  get diagnostics n_kinds = row_count;
  delete from public.donation_confirmations where donation_id in (select id from public.donations where donor_id = any (p_donor_ids));

  -- Who they are, as typed at each checkout. Amounts and dates stay on the donations.
  update public.donation_checkout_details c
     set email = 'erased+' || c.donation_id::text || '@erased.invalid',
         first_name = null, last_name = null, organisation_name = null, registration_number = null,
         contact_person = null, phone = null, id_number_encrypted = null, id_number_last4 = null,
         tax_reference_encrypted = null, tax_reference_last4 = null, address_line1 = null, address_line2 = null,
         suburb = null, city = null, postal_code = null, receipt_identity = null, erased_at = now()
   where c.donation_id in (select id from public.donations where donor_id = any (p_donor_ids));
  get diagnostics n_details = row_count;

  -- The donor record itself.
  update public.donors
     set email = 'erased+' || id::text || '@erased.invalid', email_verified_at = null,
         first_name = null, last_name = null, phone = null, registration_number = null,
         organisation_name = case when donor_type = 'individual' then null else 'Erased' end,
         contact_person = null, id_number_encrypted = null, id_number_last4 = null,
         tax_reference_encrypted = null, tax_reference_last4 = null, address_line1 = null, address_line2 = null,
         suburb = null, city = null, postal_code = null, date_of_birth = null, user_id = null, erased_at = now()
   where id = any (p_donor_ids);
  get diagnostics n_donors = row_count;

  -- The gateway's raw records of their payments keep the reference and event, not the customer.
  update public.gateway_events
     set payload = jsonb_build_object(
           'event', payload->>'event',
           'reference', coalesce(payload->'data'->>'reference', payload->>'reference'),
           'redacted', true)
   where coalesce(payload->'data'->>'reference', payload->>'reference') = any (refs)
     and coalesce(payload->>'redacted', 'false') <> 'true';
  get diagnostics n_events = row_count;

  -- Their address in the rate limiter's short-lived records.
  delete from public.rate_limit_events where key = any (select 'email:' || e from unnest(emails) e);

  return jsonb_build_object('donors', n_donors, 'checkout_details', n_details, 'monthly_stopped', n_monthly,
                            'giving_choices', n_kinds, 'messages', n_messages, 'gateway_records', n_events);
end $$;
revoke execute on function public.erase_donor_data(uuid[]) from public, anon, authenticated;
grant execute on function public.erase_donor_data(uuid[]) to service_role;

-- 2. A charity's signed declarations stay with the charity when the person who signed them
--    deletes their account: the record keeps the charity and loses the person.
alter table public.consents drop constraint consent_has_subject;
alter table public.consents add constraint consent_has_subject check (
  (kind = 'account' and user_id is not null)
  or (kind in ('donation', 'monthly_authorisation') and donation_id is not null)
  or (kind = 'charity_declarations' and charity_id is not null)
);

-- 3. Removing a monthly donation that already stopped (card declined) keeps the real reason.
create or replace function public.set_my_recurring_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  cur public.recurring_status;
  r_day int;
  r_paid text;
  this_month timestamp := date_trunc('month', now() at time zone 'Africa/Johannesburg');
  this_charge timestamptz;
  new_next timestamptz;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if p_status not in ('active', 'paused', 'cancelled') then raise exception 'Unknown status'; end if;

  select r.status, r.charge_day, r.last_paid_period into cur, r_day, r_paid
  from public.recurring_donations r
  join public.donors d on d.id = r.donor_id
  where r.id = p_id and d.user_id = uid
  for update of r;
  if not found then raise exception 'Monthly donation not found'; end if;

  if cur::text = p_status then return; end if;
  if not (
       (cur in ('active', 'failed') and p_status in ('paused', 'cancelled'))
    or (cur = 'paused' and p_status in ('active', 'cancelled'))
    or (cur = 'pending' and p_status = 'cancelled')
  ) then
    raise exception 'A % monthly donation cannot be set to %', cur, p_status;
  end if;

  if p_status = 'active' then
    this_charge := public.monthly_charge_time(this_month, r_day);
    new_next := case
      when r_paid is distinct from to_char(this_month, 'YYYY-MM') and this_charge > now() then this_charge
      else public.monthly_charge_time(this_month + interval '1 month', r_day)
    end;
  end if;

  update public.recurring_donations
     set status = p_status::public.recurring_status,
         paused_at = case p_status when 'paused' then now() when 'active' then null else paused_at end,
         cancelled_at = case p_status when 'cancelled' then now() else cancelled_at end,
         authorization_encrypted = case p_status when 'cancelled' then null else authorization_encrypted end,
         -- Removing a stopped one keeps the real reason ("the card was declined ...") for the record.
         ended_reason = case when p_status = 'cancelled' and cur <> 'failed' then 'cancelled by the donor' else ended_reason end,
         next_charge_at = case when p_status = 'active' then new_next else next_charge_at end,
         needs_gateway_sync = false
   where id = p_id;
end $$;
revoke execute on function public.set_my_recurring_status(uuid, text) from public, anon;
grant execute on function public.set_my_recurring_status(uuid, text) to authenticated;

-- ===== 20261015000001_dedications.sql =====
-- Givezy: dedications (15/10/2026, approved by Yehuda).
-- A donor may give "in honour of" or "in memory of" someone. Only the kind and the name are stored
-- (the optional note to the charity is the donation's existing message). The donor and the charity
-- see it; it is never on an s18A receipt; erasing the donor's information wipes it.

-- 1. The dedication on a donation, and on a monthly donation (copied to each month's donation).
alter table public.donations
  add column dedication_kind text,
  add column dedication_name text,
  add constraint dedication_kind_known check (dedication_kind in ('honour', 'memory')),
  add constraint dedication_name_length check (dedication_name is null or char_length(dedication_name) between 1 and 80),
  add constraint dedication_complete check ((dedication_kind is null) = (dedication_name is null));

alter table public.recurring_donations
  add column dedication_kind text,
  add column dedication_name text,
  add constraint dedication_kind_known check (dedication_kind in ('honour', 'memory')),
  add constraint dedication_name_length check (dedication_name is null or char_length(dedication_name) between 1 and 80),
  add constraint dedication_complete check ((dedication_kind is null) = (dedication_name is null));

-- Donors read their own monthly donations through a column-by-column grant, so the new columns need one too.
grant select (dedication_kind, dedication_name) on public.recurring_donations to authenticated;

-- 2. Charities see the dedication on their donations (new columns go at the end of the view).
create or replace view public.charity_donations with (security_barrier = true) as
  select
    d.id, d.charity_id, d.donor_id, d.status, d.amount_cents,
    d.paid_at, d.created_at, d.refunded_at, d.charged_back_at, d.tax_year,
    d.wants_18a, d.is_anonymous, d.message, d.campaign_id, d.recurring_id,
    c.donor_type, c.first_name, c.last_name, c.organisation_name, c.registration_number,
    c.contact_person, c.email, c.phone,
    c.address_line1, c.address_line2, c.suburb, c.city, c.postal_code,
    d.dedication_kind, d.dedication_name
  from public.donations d
  left join public.donation_checkout_details c on c.donation_id = d.id
  where d.status in ('paid', 'refunded', 'charged_back')
    and (public.is_charity_admin(d.charity_id) or public.is_platform_admin());
revoke all on public.charity_donations from anon, authenticated;
grant select on public.charity_donations to authenticated;

-- 3. Erasing a donor's information also wipes their dedications (same function, two more columns).
create or replace function public.erase_donor_data(p_donor_ids uuid[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  emails text[];
  refs text[];
  n_donors int; n_details int; n_monthly int; n_events int; n_kinds int; n_messages int;
begin
  if p_donor_ids is null or cardinality(p_donor_ids) = 0 then
    return jsonb_build_object('donors', 0);
  end if;

  -- Every email they used, on the donor record and at each checkout (repeats are harmless below).
  emails := array(select lower(email::text) from public.donors where id = any (p_donor_ids))
         || array(select lower(c.email::text) from public.donation_checkout_details c
                    join public.donations d on d.id = c.donation_id where d.donor_id = any (p_donor_ids));
  select coalesce(array_agg(gateway_ref), '{}') into refs
    from public.donations where donor_id = any (p_donor_ids) and gateway_ref is not null;

  -- Monthly donations stop, and the stored card is destroyed.
  update public.recurring_donations
     set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now()), authorization_encrypted = null,
         ended_reason = 'the donor''s information was erased', message = null, dedication_kind = null, dedication_name = null,
         card_last4 = null, card_brand = null, card_exp = null, needs_gateway_sync = false
   where donor_id = any (p_donor_ids);
  get diagnostics n_monthly = row_count;

  -- Free text the donor wrote, and any dedication (the name of someone they honoured or remembered).
  update public.donations set message = null, dedication_kind = null, dedication_name = null
   where donor_id = any (p_donor_ids) and (message is not null or dedication_name is not null);
  get diagnostics n_messages = row_count;

  -- The private maaser / chomesh / tzedaka choice and the confirmation links.
  delete from public.donation_giving_kinds where donation_id in (select id from public.donations where donor_id = any (p_donor_ids));
  get diagnostics n_kinds = row_count;
  delete from public.donation_confirmations where donation_id in (select id from public.donations where donor_id = any (p_donor_ids));

  -- Who they are, as typed at each checkout. Amounts and dates stay on the donations.
  update public.donation_checkout_details c
     set email = 'erased+' || c.donation_id::text || '@erased.invalid',
         first_name = null, last_name = null, organisation_name = null, registration_number = null,
         contact_person = null, phone = null, id_number_encrypted = null, id_number_last4 = null,
         tax_reference_encrypted = null, tax_reference_last4 = null, address_line1 = null, address_line2 = null,
         suburb = null, city = null, postal_code = null, receipt_identity = null, erased_at = now()
   where c.donation_id in (select id from public.donations where donor_id = any (p_donor_ids));
  get diagnostics n_details = row_count;

  -- The donor record itself.
  update public.donors
     set email = 'erased+' || id::text || '@erased.invalid', email_verified_at = null,
         first_name = null, last_name = null, phone = null, registration_number = null,
         organisation_name = case when donor_type = 'individual' then null else 'Erased' end,
         contact_person = null, id_number_encrypted = null, id_number_last4 = null,
         tax_reference_encrypted = null, tax_reference_last4 = null, address_line1 = null, address_line2 = null,
         suburb = null, city = null, postal_code = null, date_of_birth = null, user_id = null, erased_at = now()
   where id = any (p_donor_ids);
  get diagnostics n_donors = row_count;

  -- The gateway's raw records of their payments keep the reference and event, not the customer.
  update public.gateway_events
     set payload = jsonb_build_object(
           'event', payload->>'event',
           'reference', coalesce(payload->'data'->>'reference', payload->>'reference'),
           'redacted', true)
   where coalesce(payload->'data'->>'reference', payload->>'reference') = any (refs)
     and coalesce(payload->>'redacted', 'false') <> 'true';
  get diagnostics n_events = row_count;

  -- Their address in the rate limiter's short-lived records.
  delete from public.rate_limit_events where key = any (select 'email:' || e from unnest(emails) e);

  return jsonb_build_object('donors', n_donors, 'checkout_details', n_details, 'monthly_stopped', n_monthly,
                            'giving_choices', n_kinds, 'messages', n_messages, 'gateway_records', n_events);
end $$;
revoke execute on function public.erase_donor_data(uuid[]) from public, anon, authenticated;
grant execute on function public.erase_donor_data(uuid[]) to service_role;

-- ===== 20261015000002_monthly_resume_needs_card.sql =====
-- Givezy: code review fixes, monthly giving (15/10/2026).
-- A stopped monthly donation (status 'failed': the card was declined every time) has no card left, so it
-- can only be removed, never paused and resumed into an "active" donation that can never be collected.
-- Resuming a paused one needs a stored card, and starts the month's attempts afresh.

create or replace function public.set_my_recurring_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  cur public.recurring_status;
  r_day int;
  r_paid text;
  has_card boolean;
  this_month timestamp := date_trunc('month', now() at time zone 'Africa/Johannesburg');
  this_charge timestamptz;
  new_next timestamptz;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if p_status not in ('active', 'paused', 'cancelled') then raise exception 'Unknown status'; end if;

  select r.status, r.charge_day, r.last_paid_period, r.authorization_encrypted is not null into cur, r_day, r_paid, has_card
  from public.recurring_donations r
  join public.donors d on d.id = r.donor_id
  where r.id = p_id and d.user_id = uid
  for update of r;
  if not found then raise exception 'Monthly donation not found'; end if;

  if cur::text = p_status then return; end if;
  if not (
       (cur = 'active' and p_status in ('paused', 'cancelled'))
    or (cur = 'failed' and p_status = 'cancelled')
    or (cur = 'paused' and p_status in ('active', 'cancelled'))
    or (cur = 'pending' and p_status = 'cancelled')
  ) then
    raise exception 'A % monthly donation cannot be set to %', cur, p_status;
  end if;
  if p_status = 'active' and not has_card then
    raise exception 'This monthly donation has no card to charge. Start a new monthly donation instead.';
  end if;

  if p_status = 'active' then
    this_charge := public.monthly_charge_time(this_month, r_day);
    new_next := case
      when r_paid is distinct from to_char(this_month, 'YYYY-MM') and this_charge > now() then this_charge
      else public.monthly_charge_time(this_month + interval '1 month', r_day)
    end;
  end if;

  update public.recurring_donations
     set status = p_status::public.recurring_status,
         paused_at = case p_status when 'paused' then now() when 'active' then null else paused_at end,
         cancelled_at = case p_status when 'cancelled' then now() else cancelled_at end,
         authorization_encrypted = case p_status when 'cancelled' then null else authorization_encrypted end,
         -- Removing a stopped one keeps the real reason ("the card was declined ...") for the record.
         ended_reason = case when p_status = 'cancelled' and cur <> 'failed' then 'cancelled by the donor' else ended_reason end,
         next_charge_at = case when p_status = 'active' then new_next else next_charge_at end,
         -- A resumed donation gets the full number of tries again.
         attempt_period = case when p_status = 'active' then null else attempt_period end,
         failed_attempts = case when p_status = 'active' then 0 else failed_attempts end,
         needs_gateway_sync = false
   where id = p_id;
end $$;
revoke execute on function public.set_my_recurring_status(uuid, text) from public, anon;
grant execute on function public.set_my_recurring_status(uuid, text) to authenticated;

-- ===== 20261015000003_charity_receipts_without_id.sql =====
-- Givezy: code review fixes, privacy (15/10/2026, decided by Yehuda).
-- Charities no longer see any part of a donor's ID or income tax number. Until now a charity admin
-- could read a receipt's full stored details (including the last 4 digits of ID and tax numbers, and
-- the identity fingerprint) and download the PDF, which prints them. Yosef is to confirm what a
-- charity must hold; until then charities see their receipts through two narrow views only.

-- 1. Receipts: the donor (their own), platform admins. Not charity admins.
drop policy receipts_read on public.s18a_receipts;
create policy receipts_read on public.s18a_receipts for select to authenticated
  using (donor_id in (select public.my_donor_ids()) or public.is_platform_admin());
-- (receipt_links_read follows: a link is readable only when its receipt is.)

-- 2. A charity's receipts: reference, donor name, amount and status. No ID or tax digits, no fingerprint.
create view public.charity_receipts with (security_barrier = true) as
  select
    r.id, r.charity_id, r.tax_year, r.amount_cents, r.issued_at, r.status, r.emailed_at,
    r.details->>'receipt_reference' as reference,
    r.details->'donor'->>'name' as donor_name
  from public.s18a_receipts r
  where public.is_charity_admin(r.charity_id) or public.is_platform_admin();
revoke all on public.charity_receipts from anon, authenticated;
grant select on public.charity_receipts to authenticated;

-- 3. Which receipt a charity's donation is on.
create view public.charity_receipt_donations with (security_barrier = true) as
  select rd.donation_id, r.id as receipt_id, r.charity_id, r.status, r.details->>'receipt_reference' as reference
  from public.s18a_receipt_donations rd
  join public.s18a_receipts r on r.id = rd.receipt_id
  where public.is_charity_admin(r.charity_id) or public.is_platform_admin();
revoke all on public.charity_receipt_donations from anon, authenticated;
grant select on public.charity_receipt_donations to authenticated;

-- ===== 20261015000004_privacy_security_review.sql =====
-- Givezy: code review fixes, privacy and security (15/10/2026).

-- 1. A donor record can be shared by everyone who gives with one email address, so it no longer holds full
--    ID or income tax numbers (each donation's checkout details keep them, for its receipt). Clear the old copies.
update public.donors set id_number_encrypted = null, tax_reference_encrypted = null
 where id_number_encrypted is not null or tax_reference_encrypted is not null;

-- 2. The income log lives on the phone; this table is not written by the website or app. Closing it to
--    signed-in users means nothing in it can be a value someone pasted in to have it decrypted.
revoke insert, update, delete on public.maaser_income_entries from authenticated;

-- 3. A charity's status and approval fields change only on the server (submitting an application with its
--    four declarations, or a platform admin's decision), never directly from a browser.
revoke update on public.charities from authenticated;
grant update (name_en, name_he, legal_name_en, legal_name_he, description_en, description_he, funds_use_en, thank_you_en,
  website, logo_path, cover_path, npo_number, pbo_number, s18a_reference, address_line1, address_line2, suburb, city,
  postal_code, is_s18a, s18a_confirmed_at, mandate_signed_at, mandate_document_path, updated_at) on public.charities to authenticated;

-- 4. New functions are not callable by everyone unless granted. (The earlier per-schema statement could not
--    remove Postgres's global default; this one does, for functions created by this role from now on.)
alter default privileges revoke execute on functions from public;

-- 5. Erasure also clears the gateway's customer and subscription references on monthly donations.
create or replace function public.erase_donor_data(p_donor_ids uuid[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  emails text[];
  refs text[];
  n_donors int; n_details int; n_monthly int; n_events int; n_kinds int; n_messages int;
begin
  if p_donor_ids is null or cardinality(p_donor_ids) = 0 then
    return jsonb_build_object('donors', 0);
  end if;

  -- Every email they used, on the donor record and at each checkout (repeats are harmless below).
  emails := array(select lower(email::text) from public.donors where id = any (p_donor_ids))
         || array(select lower(c.email::text) from public.donation_checkout_details c
                    join public.donations d on d.id = c.donation_id where d.donor_id = any (p_donor_ids));
  select coalesce(array_agg(gateway_ref), '{}') into refs
    from public.donations where donor_id = any (p_donor_ids) and gateway_ref is not null;

  -- Monthly donations stop, and the stored card is destroyed.
  update public.recurring_donations
     set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now()), authorization_encrypted = null,
         ended_reason = 'the donor''s information was erased', message = null, dedication_kind = null, dedication_name = null,
         card_last4 = null, card_brand = null, card_exp = null, needs_gateway_sync = false,
         gateway_customer_ref = null, gateway_subscription_ref = null
   where donor_id = any (p_donor_ids);
  get diagnostics n_monthly = row_count;

  -- Free text the donor wrote, and any dedication (the name of someone they honoured or remembered).
  update public.donations set message = null, dedication_kind = null, dedication_name = null
   where donor_id = any (p_donor_ids) and (message is not null or dedication_name is not null);
  get diagnostics n_messages = row_count;

  -- The private maaser / chomesh / tzedaka choice and the confirmation links.
  delete from public.donation_giving_kinds where donation_id in (select id from public.donations where donor_id = any (p_donor_ids));
  get diagnostics n_kinds = row_count;
  delete from public.donation_confirmations where donation_id in (select id from public.donations where donor_id = any (p_donor_ids));

  -- Who they are, as typed at each checkout. Amounts and dates stay on the donations.
  update public.donation_checkout_details c
     set email = 'erased+' || c.donation_id::text || '@erased.invalid',
         first_name = null, last_name = null, organisation_name = null, registration_number = null,
         contact_person = null, phone = null, id_number_encrypted = null, id_number_last4 = null,
         tax_reference_encrypted = null, tax_reference_last4 = null, address_line1 = null, address_line2 = null,
         suburb = null, city = null, postal_code = null, receipt_identity = null, erased_at = now()
   where c.donation_id in (select id from public.donations where donor_id = any (p_donor_ids));
  get diagnostics n_details = row_count;

  -- The donor record itself.
  update public.donors
     set email = 'erased+' || id::text || '@erased.invalid', email_verified_at = null,
         first_name = null, last_name = null, phone = null, registration_number = null,
         organisation_name = case when donor_type = 'individual' then null else 'Erased' end,
         contact_person = null, id_number_encrypted = null, id_number_last4 = null,
         tax_reference_encrypted = null, tax_reference_last4 = null, address_line1 = null, address_line2 = null,
         suburb = null, city = null, postal_code = null, date_of_birth = null, user_id = null, erased_at = now()
   where id = any (p_donor_ids);
  get diagnostics n_donors = row_count;

  -- The gateway's raw records of their payments keep the reference and event, not the customer.
  update public.gateway_events
     set payload = jsonb_build_object(
           'event', payload->>'event',
           'reference', coalesce(payload->'data'->>'reference', payload->>'reference'),
           'redacted', true)
   where coalesce(payload->'data'->>'reference', payload->>'reference') = any (refs)
     and coalesce(payload->>'redacted', 'false') <> 'true';
  get diagnostics n_events = row_count;

  -- Their address in the rate limiter's short-lived records.
  delete from public.rate_limit_events where key = any (select 'email:' || e from unnest(emails) e);

  return jsonb_build_object('donors', n_donors, 'checkout_details', n_details, 'monthly_stopped', n_monthly,
                            'giving_choices', n_kinds, 'messages', n_messages, 'gateway_records', n_events);
end $$;
revoke execute on function public.erase_donor_data(uuid[]) from public, anon, authenticated;
grant execute on function public.erase_donor_data(uuid[]) to service_role;

-- 6. Givezy signs people in with an emailed code only. A session started with a password (for example
--    someone who registered another person's email with a password before that person ever signed in)
--    sees no donor records. The website refuses such sessions too (src/lib/auth.ts).
create or replace function public.signed_in_without_password() returns boolean
language sql stable set search_path = '' as $$
  select not coalesce((select auth.jwt()) -> 'amr' @> '[{"method": "password"}]'::jsonb, false)
$$;
grant execute on function public.signed_in_without_password() to authenticated;

create or replace function public.my_donor_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select d.id from public.donors d where d.user_id = (select auth.uid()) and public.signed_in_without_password()
$$;
revoke execute on function public.my_donor_ids() from public, anon;
grant execute on function public.my_donor_ids() to authenticated;

-- ===== 20261015000005_receipt_numbers_past_9999.sql =====
-- Givezy: code review fixes, receipts (15/10/2026).
-- Receipt references printed only 4 digits: Postgres's lpad cuts longer text, so a charity's 10 000th
-- receipt printed as "-1000", the same as its 1 000th. The number itself was always unique (charity,
-- receipt_number); only the printed reference repeated. Numbers now print in full: 0001 ... 9999, 10000.
-- Same function as 20261009000008_receipt_identity.sql with that one line changed.

create or replace function public.issue_s18a_receipt(
  p_charity_id uuid,
  p_donor_id uuid,
  p_tax_year int,
  p_donation_ids uuid[],
  p_number_prefix text,
  p_details jsonb,
  p_donor_identity text default ''
) returns table (receipt_id uuid, receipt_number int, receipt_reference text, amount_cents bigint)
language plpgsql security definer set search_path = '' as $$
declare
  c public.charities;
  found_count int;
  good_count int;
  total bigint;
  n int;
  new_id uuid := gen_random_uuid();
  ref text;
begin
  if p_donation_ids is null or array_length(p_donation_ids, 1) is null then
    raise exception 'A receipt needs at least one donation';
  end if;
  if array_length(p_donation_ids, 1) <> (select count(distinct x) from unnest(p_donation_ids) x) then
    raise exception 'The same donation was listed twice';
  end if;

  select * into c from public.charities where id = p_charity_id for update;
  if not found then raise exception 'Charity not found'; end if;
  if not public.charity_can_issue_18a(c) then
    raise exception 'This charity cannot issue s18A receipts (approval or mandate missing)';
  end if;

  select count(*) into found_count from public.donations where id = any (p_donation_ids);
  if found_count <> array_length(p_donation_ids, 1) then
    raise exception 'A listed donation does not exist';
  end if;

  select count(*), coalesce(sum(d.amount_cents), 0) into good_count, total
  from public.donations d
  where d.id = any (p_donation_ids)
    and d.status = 'paid'
    and d.charity_id = p_charity_id
    and d.donor_id = p_donor_id
    and d.tax_year = p_tax_year
    and d.wants_18a
    and c.mandate_signed_at <= d.paid_at
    -- every donation was given under the same s18A identity (ID, tax or registration number)
    and coalesce((select x.receipt_identity from public.donation_checkout_details x where x.donation_id = d.id), '') = coalesce(p_donor_identity, '')
    and not exists (
      select 1 from public.s18a_receipt_donations l
      join public.s18a_receipts r on r.id = l.receipt_id
      where l.donation_id = d.id and r.status = 'issued'
    );
  if good_count <> array_length(p_donation_ids, 1) then
    raise exception 'A listed donation is not eligible for this receipt';
  end if;

  n := public.next_receipt_number(p_charity_id);
  ref := p_number_prefix || '-' || p_tax_year::text || '-' || lpad(n::text, greatest(4, length(n::text)), '0');

  insert into public.s18a_receipts (id, charity_id, receipt_number, donor_id, donor_identity, tax_year, amount_cents, details)
  values (new_id, p_charity_id, n, p_donor_id, coalesce(p_donor_identity, ''), p_tax_year, total,
          p_details || jsonb_build_object('receipt_reference', ref, 'amount_cents', total));
  insert into public.s18a_receipt_donations (receipt_id, donation_id)
  select new_id, x from unnest(p_donation_ids) x;

  return query select new_id, n, ref, total;
end $$;

revoke execute on function public.issue_s18a_receipt(uuid, uuid, int, uuid[], text, jsonb, text) from public, anon, authenticated;
grant execute on function public.issue_s18a_receipt(uuid, uuid, int, uuid[], text, jsonb, text) to service_role;

-- ===== 20261016000001_charity_monthly_donations.sql =====
-- Givezy: monthly donations for charities (16/10/2026).
-- A charity sees its monthly donors: who, how much, which day, how many months collected, and
-- whether it is running, paused, stopped (the card was declined every time) or cancelled.
-- Read through this function only: the raw rows hold the gateway references and the card details,
-- and the donor's contribution to Givezy and their maaser/chomesh/tzedaka choice stay private.
-- Like donations, a monthly donation appears only once a payment from it has gone through, and
-- the donor's details are those typed at their latest such payment.

create or replace function public.charity_monthly_list(p_charity_id uuid)
returns table (
  recurring_id uuid, status text, retrying boolean, amount_cents bigint, charge_day int,
  next_charge_at timestamptz, started_at timestamptz, last_paid_at timestamptz,
  paid_count bigint, paid_cents bigint, wants_18a boolean, is_anonymous boolean,
  dedication_kind text, dedication_name text,
  donor_type text, display_name text, email text, phone text,
  paused_at timestamptz, ended_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_charity_admin(p_charity_id) or public.is_platform_admin()) then
    raise exception 'Not allowed';
  end if;
  return query
    with seen as (
      select d.recurring_id as rid, d.id as did, d.status as dst, d.amount_cents as amt, d.paid_at
      from public.donations d
      where d.charity_id = p_charity_id and d.recurring_id is not null
        and d.status in ('paid', 'refunded', 'charged_back')
    ), totals as (
      select s.rid, min(s.paid_at) as first_at, max(s.paid_at) filter (where s.dst = 'paid') as last_at,
             count(*) filter (where s.dst = 'paid') as n, coalesce(sum(s.amt) filter (where s.dst = 'paid'), 0)::bigint as total
      from seen s group by s.rid
    ), latest as (
      select distinct on (s.rid) s.rid, c.donor_type::text as dt, c.first_name, c.last_name, c.organisation_name, c.email::text as em, c.phone as ph
      from seen s left join public.donation_checkout_details c on c.donation_id = s.did
      order by s.rid, s.paid_at desc nulls last
    )
    select r.id, r.status::text, (r.status = 'active' and r.failed_attempts > 0), r.amount_cents, r.charge_day,
           case when r.status = 'active' then r.next_charge_at end,
           t.first_at, t.last_at, t.n, t.total, r.wants_18a, r.is_anonymous,
           r.dedication_kind, r.dedication_name,
           l.dt,
           case when coalesce(l.dt, 'individual') = 'individual'
                then nullif(trim(coalesce(l.first_name, '') || ' ' || coalesce(l.last_name, '')), '')
                else nullif(trim(coalesce(l.organisation_name, '')), '') end,
           l.em, l.ph,
           case when r.status = 'paused' then r.paused_at end,
           case when r.status in ('cancelled', 'failed') then coalesce(r.cancelled_at, r.updated_at) end
    from public.recurring_donations r
    join totals t on t.rid = r.id
    left join latest l on l.rid = r.id
    where r.charity_id = p_charity_id
      and r.status in ('active', 'paused', 'failed', 'cancelled')
    order by case r.status when 'active' then 0 when 'paused' then 1 when 'failed' then 2 else 3 end,
             r.amount_cents desc, t.first_at;
end $$;
revoke execute on function public.charity_monthly_list(uuid) from public, anon;
grant execute on function public.charity_monthly_list(uuid) to authenticated;

-- ===== 20261020000001_review_fixes.sql =====
-- Givezy: code review fixes, database (20/10/2026).

-- 1. Donor records no longer hold ID or income tax numbers (20261015000004), so signed-in users may not write
--    those columns either: nothing pasted in can ever be a value the server decrypts.
revoke update (id_number_encrypted, id_number_last4, tax_reference_encrypted, tax_reference_last4) on public.donors from authenticated;

-- 2. Approval fields change only on the server. The guard trigger already refuses a charity admin changing
--    them; the column grant now says the same, so there is one less thing to rely on.
revoke update (is_s18a, s18a_confirmed_at, mandate_signed_at, mandate_document_path) on public.charities from authenticated;

-- 3. A charity's logo and cover picture come from its own folder in the public bucket, like its photos.
alter table public.charities
  add constraint charities_logo_own_folder check (logo_path is null or (logo_path like id::text || '/%' and logo_path not like '%..%')),
  add constraint charities_cover_own_folder check (cover_path is null or (cover_path like id::text || '/%' and cover_path not like '%..%'));

-- 4. An active monthly donation always has a charge day (resuming one without would schedule nothing).
alter table public.recurring_donations
  add constraint recurring_active_has_charge_day check (status <> 'active' or charge_day is not null);

-- 5. Money is bigint everywhere, this legacy column included.
alter table public.fee_settings alter column gateway_fixed_cents type bigint;

-- 6. Indexes for the lookups the website and jobs make.
create index if not exists donations_recurring_idx on public.donations (recurring_id) where recurring_id is not null;
create index if not exists donations_campaign_idx on public.donations (campaign_id) where campaign_id is not null;
create index if not exists recurring_charity_idx on public.recurring_donations (charity_id);
create index if not exists charity_admins_user_idx on public.charity_admins (user_id);
create index if not exists s18a_receipts_year_status_idx on public.s18a_receipts (tax_year, status);
create index if not exists consents_charity_idx on public.consents (charity_id) where charity_id is not null;

-- 7. Erasure also clears a campaign answer (free text the donor typed), should campaigns ever be switched on.
create or replace function public.erase_donor_data(p_donor_ids uuid[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  emails text[];
  refs text[];
  n_donors int; n_details int; n_monthly int; n_events int; n_kinds int; n_messages int;
begin
  if p_donor_ids is null or cardinality(p_donor_ids) = 0 then
    return jsonb_build_object('donors', 0);
  end if;

  -- Every email they used, on the donor record and at each checkout (repeats are harmless below).
  emails := array(select lower(email::text) from public.donors where id = any (p_donor_ids))
         || array(select lower(c.email::text) from public.donation_checkout_details c
                    join public.donations d on d.id = c.donation_id where d.donor_id = any (p_donor_ids));
  select coalesce(array_agg(gateway_ref), '{}') into refs
    from public.donations where donor_id = any (p_donor_ids) and gateway_ref is not null;

  -- Monthly donations stop, and the stored card is destroyed.
  update public.recurring_donations
     set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now()), authorization_encrypted = null,
         ended_reason = 'the donor''s information was erased', message = null, dedication_kind = null, dedication_name = null,
         card_last4 = null, card_brand = null, card_exp = null, needs_gateway_sync = false,
         gateway_customer_ref = null, gateway_subscription_ref = null
   where donor_id = any (p_donor_ids);
  get diagnostics n_monthly = row_count;

  -- Free text the donor wrote (a message, a campaign answer), and any dedication (the name of someone they honoured or remembered).
  update public.donations set message = null, dedication_kind = null, dedication_name = null, campaign_answer = null
   where donor_id = any (p_donor_ids) and (message is not null or dedication_name is not null or campaign_answer is not null);
  get diagnostics n_messages = row_count;

  -- The private maaser / chomesh / tzedaka choice and the confirmation links.
  delete from public.donation_giving_kinds where donation_id in (select id from public.donations where donor_id = any (p_donor_ids));
  get diagnostics n_kinds = row_count;
  delete from public.donation_confirmations where donation_id in (select id from public.donations where donor_id = any (p_donor_ids));

  -- Who they are, as typed at each checkout. Amounts and dates stay on the donations.
  update public.donation_checkout_details c
     set email = 'erased+' || c.donation_id::text || '@erased.invalid',
         first_name = null, last_name = null, organisation_name = null, registration_number = null,
         contact_person = null, phone = null, id_number_encrypted = null, id_number_last4 = null,
         tax_reference_encrypted = null, tax_reference_last4 = null, address_line1 = null, address_line2 = null,
         suburb = null, city = null, postal_code = null, receipt_identity = null, erased_at = now()
   where c.donation_id in (select id from public.donations where donor_id = any (p_donor_ids));
  get diagnostics n_details = row_count;

  -- The donor record itself.
  update public.donors
     set email = 'erased+' || id::text || '@erased.invalid', email_verified_at = null,
         first_name = null, last_name = null, phone = null, registration_number = null,
         organisation_name = case when donor_type = 'individual' then null else 'Erased' end,
         contact_person = null, id_number_encrypted = null, id_number_last4 = null,
         tax_reference_encrypted = null, tax_reference_last4 = null, address_line1 = null, address_line2 = null,
         suburb = null, city = null, postal_code = null, date_of_birth = null, user_id = null, erased_at = now()
   where id = any (p_donor_ids);
  get diagnostics n_donors = row_count;

  -- The gateway's raw records of their payments keep the reference and event, not the customer.
  update public.gateway_events
     set payload = jsonb_build_object(
           'event', payload->>'event',
           'reference', coalesce(payload->'data'->>'reference', payload->>'reference'),
           'redacted', true)
   where coalesce(payload->'data'->>'reference', payload->>'reference') = any (refs)
     and coalesce(payload->>'redacted', 'false') <> 'true';
  get diagnostics n_events = row_count;

  -- Their address in the rate limiter's short-lived records.
  delete from public.rate_limit_events where key = any (select 'email:' || e from unnest(emails) e);

  return jsonb_build_object('donors', n_donors, 'checkout_details', n_details, 'monthly_stopped', n_monthly,
                            'giving_choices', n_kinds, 'messages', n_messages, 'gateway_records', n_events);
end $$;
revoke execute on function public.erase_donor_data(uuid[]) from public, anon, authenticated;
grant execute on function public.erase_donor_data(uuid[]) to service_role;

