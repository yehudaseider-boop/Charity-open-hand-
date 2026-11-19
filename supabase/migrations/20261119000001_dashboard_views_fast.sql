-- The charity dashboard at a real charity's size (19/11/2026). With 20 000 gifts, the dashboard's donations, overview,
-- donors, receipts and report pages took 9 to over 30 seconds: each of the three charity views asked "is this person on
-- this charity's team?" (is_charity_admin, is_platform_admin, charity_can) once for every row, so reading 1 000 gifts
-- took 2.5 seconds. The same rules are now worked out once per request, for the few charities the person may see, and
-- joined on: the Donations page's own query (newest 25 of 20 000, with the contact columns) reads in about 0.4 s.
--
-- Nothing about who sees what changes. A row shows when its charity is one the person is on the team of (with the
-- second step done), or for a Givezy admin (with the second step done): exactly is_charity_admin(charity) or
-- is_platform_admin(), as before. Contact details show exactly when charity_can(charity, 'contact') says so, as before.
-- Same columns, same order, same types; still security_barrier. A database test checks the views give the same rows
-- and the same blanks as before for an owner, a viewer, a Givezy admin and a stranger (charity-views-fast-db.test.ts).

-- The charities this person may see in the charity views, each with whether they may see donors' contact details.
-- Written as a subquery in each view (not a function), so the planner works it out once per query.

create or replace view public.charity_donations with (security_barrier = true) as
  select
    d.id, d.charity_id, d.donor_id, d.status, d.amount_cents,
    d.paid_at, d.created_at, d.refunded_at, d.charged_back_at, d.tax_year,
    d.wants_18a, d.is_anonymous, d.message, d.campaign_id, d.recurring_id,
    c.donor_type, c.first_name, c.last_name, c.organisation_name, c.registration_number,
    case when m.contact then c.contact_person end as contact_person,
    (case when m.contact or c.email::text ilike '%@erased.invalid' then c.email end)::public.citext as email,
    case when m.contact then c.phone end as phone,
    case when m.contact then c.address_line1 end as address_line1,
    case when m.contact then c.address_line2 end as address_line2,
    case when m.contact then c.suburb end as suburb,
    case when m.contact then c.city end as city,
    case when m.contact then c.postal_code end as postal_code,
    d.dedication_kind, d.dedication_name,
    d.recorded_method, d.external_ref, d.came_from, d.import_id
  from public.donations d
  join (
    select v.charity_id, public.charity_can(v.charity_id, 'contact') as contact
    from (
      select ca.charity_id from public.charity_admins ca
      where ca.user_id = (select auth.uid()) and (select public.has_second_step())
      union
      select ch.id from public.charities ch where (select public.is_platform_admin())
    ) v
    -- Keeps this subquery whole: without it the planner folds it into the outer query and copies charity_can into
    -- each of the eight contact columns, once per gift (code review 19/11/2026: Donations took 38 s at 20 000 gifts).
    offset 0
  ) m on m.charity_id = d.charity_id
  left join public.donation_checkout_details c on c.donation_id = d.id
  where d.status in ('paid', 'refunded', 'charged_back');

create or replace view public.charity_receipts with (security_barrier = true) as
  select
    r.id, r.charity_id, r.tax_year, r.amount_cents, r.issued_at, r.status, r.emailed_at,
    r.details ->> 'receipt_reference' as reference,
    (r.details -> 'donor') ->> 'name' as donor_name
  from public.s18a_receipts r
  where r.charity_id in (
    select ca.charity_id from public.charity_admins ca
    where ca.user_id = (select auth.uid()) and (select public.has_second_step())
    union
    select ch.id from public.charities ch where (select public.is_platform_admin())
  );

create or replace view public.charity_receipt_donations with (security_barrier = true) as
  select
    rd.donation_id, r.id as receipt_id, r.charity_id, r.status,
    r.details ->> 'receipt_reference' as reference
  from public.s18a_receipt_donations rd
  join public.s18a_receipts r on r.id = rd.receipt_id
  where r.charity_id in (
    select ca.charity_id from public.charity_admins ca
    where ca.user_id = (select auth.uid()) and (select public.has_second_step())
    union
    select ch.id from public.charities ch where (select public.is_platform_admin())
  );
