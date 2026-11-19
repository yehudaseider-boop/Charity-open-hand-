-- The four charity list functions that blank contact details for roles without 'contact' (team roles, 10/11/2026)
-- asked "may this person see contact details?" once per row, twice (email and phone): with 3 000 donors the keeping-
-- donors list took 2.5 seconds for the wrapper alone, against 0.13 seconds for the list itself (19/11/2026, the
-- dashboard at a real charity's size). The answer is now worked out once per call and joined on.
--
-- Nothing about who sees what changes: email shows when charity_can(charity, 'contact') or it is an erased
-- placeholder (exactly charity_contact_or_null), phone shows only with 'contact', as before. Same names, arguments,
-- columns and grants. The team-roles database test (team-roles-db.test.ts) checks each role's blanks on these lists.

create or replace function public.charity_donor_list(p_charity_id uuid)
returns table (
  donor_id uuid, donor_type public.donor_type, display_name text, email text, phone text,
  donation_count bigint, total_cents bigint, first_paid_at timestamptz, last_paid_at timestamptz,
  wants_18a boolean, is_anonymous boolean
)
language sql stable security definer set search_path = '' as $$
  select f.donor_id, f.donor_type, f.display_name,
         case when f.email is null then null when k.contact or f.email ilike '%@erased.invalid' then f.email end,
         case when k.contact then f.phone end,
         f.donation_count, f.total_cents, f.first_paid_at, f.last_paid_at, f.wants_18a, f.is_anonymous
  from (select public.charity_can(p_charity_id, 'contact') as contact offset 0) k
  cross join public.charity_donor_list_full(p_charity_id) f
$$;

create or replace function public.charity_monthly_list(p_charity_id uuid)
returns table (
  recurring_id uuid, status text, retrying boolean, amount_cents bigint, charge_day int,
  next_charge_at timestamptz, started_at timestamptz, last_paid_at timestamptz,
  paid_count bigint, paid_cents bigint, wants_18a boolean, is_anonymous boolean,
  dedication_kind text, dedication_name text,
  donor_type text, display_name text, email text, phone text,
  paused_at timestamptz, ended_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select f.recurring_id, f.status, f.retrying, f.amount_cents, f.charge_day, f.next_charge_at, f.started_at, f.last_paid_at,
         f.paid_count, f.paid_cents, f.wants_18a, f.is_anonymous, f.dedication_kind, f.dedication_name,
         f.donor_type, f.display_name,
         case when f.email is null then null when k.contact or f.email ilike '%@erased.invalid' then f.email end,
         case when k.contact then f.phone end,
         f.paused_at, f.ended_at
  from (select public.charity_can(p_charity_id, 'contact') as contact offset 0) k
  cross join public.charity_monthly_list_full(p_charity_id) f
$$;

create or replace function public.charity_lapsed_monthly(p_charity_id uuid, p_from timestamptz, p_to timestamptz)
returns table (
  recurring_id uuid, donor_id uuid, amount_cents bigint, ended_at timestamptz, last_paid_at timestamptz,
  reason text, donor_type text, display_name text, email text, phone text
)
language sql stable security definer set search_path = '' as $$
  select f.recurring_id, f.donor_id, f.amount_cents, f.ended_at, f.last_paid_at, f.reason, f.donor_type, f.display_name,
         case when f.email is null then null when k.contact or f.email ilike '%@erased.invalid' then f.email end,
         case when k.contact then f.phone end
  from (select public.charity_can(p_charity_id, 'contact') as contact offset 0) k
  cross join public.charity_lapsed_monthly_full(p_charity_id, p_from, p_to) f
$$;

create or replace function public.charity_keeping_donors(p_charity_id uuid, p_last_from timestamptz, p_this_from timestamptz, p_this_to timestamptz, p_now timestamptz)
returns table (
  donor_id uuid, this_cents bigint, last_cents bigint, earlier_cents bigint, after_cents bigint, last_paid_at timestamptz,
  recorded_only boolean, erased boolean, donor_type text, display_name text, email text, phone text
)
language sql stable security definer set search_path = '' as $$
  select f.donor_id, f.this_cents, f.last_cents, f.earlier_cents, f.after_cents, f.last_paid_at, f.recorded_only, f.erased,
         f.donor_type, f.display_name,
         case when f.email is null then null when k.contact or f.email ilike '%@erased.invalid' then f.email end,
         case when k.contact then f.phone end
  from (select public.charity_can(p_charity_id, 'contact') as contact offset 0) k
  cross join public.charity_keeping_donors_full(p_charity_id, p_last_from, p_this_from, p_this_to, p_now) f
$$;
