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
