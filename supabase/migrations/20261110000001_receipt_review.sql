-- Givezy: the charity checks each s18A receipt before the yearly run (CRM build plan step 1, Yossi 2.3,
-- built 09/11/2026). After the tax year closes the charity opens a preview of each planned certificate and
-- approves it, declines it, or corrects the donor's name and address and approves it. The two approvals stay:
-- nothing reaches a donor until the charity approves its list AND Givezy signs it off.
--
-- 1. receipt_plan_decisions: one row per planned certificate the charity has decided on (charity, tax year,
--    donor record, s18A identity: the same key as one receipt). No row means "to check". Server-only: the
--    website reads and writes it with the service role after checking the person manages the charity
--    (loadCharityForManager). No browser can read or write it, not even the charity's own admin.
--    `certificate_fingerprint` is what the charity looked at (its gifts and total, hashed): an approval of a
--    certificate that has changed since (a refund, a late gift) no longer counts, and it shows as "to check".
-- 2. correct_receipt_donor_details(): the one way the charity's correction reaches a gift. It changes only the
--    donor's name and street address on the gifts of one planned certificate, never an amount, a date, an ID
--    or tax number, a registration number, the email or the s18A identity, and only while none of those gifts
--    is on an issued receipt. Both the issued receipt and the IT3(d) file read these rows, so they can never
--    disagree. Service role only.

-- 1 -----------------------------------------------------------------------------------------------------------
create table public.receipt_plan_decisions (
  id uuid primary key default gen_random_uuid(),
  charity_id uuid not null references public.charities (id) on delete cascade,
  tax_year int not null constraint receipt_decision_year check (tax_year between 2020 and 2100),
  donor_id uuid not null references public.donors (id) on delete cascade,
  -- The s18A identity fingerprint typed with the gifts ('' when none), as on s18a_receipts.donor_identity.
  donor_identity text not null default '' constraint receipt_decision_identity check (char_length(donor_identity) <= 200),
  decision text not null constraint receipt_decision_kind check (decision in ('approved', 'edited', 'declined')),
  certificate_fingerprint text not null constraint receipt_decision_fingerprint check (certificate_fingerprint ~ '^[0-9a-f]{64}$'),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz not null default now(),
  -- A short note the charity keeps for itself (never sent to the donor).
  note text constraint receipt_decision_note check (note is null or char_length(note) <= 300),
  -- Declined: when the email asking the donor to contact the charity went. Null until it really left.
  decline_emailed_at timestamptz,
  constraint receipt_decision_emailed check (decline_emailed_at is null or decision = 'declined'),
  unique (charity_id, tax_year, donor_id, donor_identity)
);
create index receipt_plan_decisions_year on public.receipt_plan_decisions (charity_id, tax_year);

alter table public.receipt_plan_decisions enable row level security;
-- No policies: only the service role reaches it.
revoke all on public.receipt_plan_decisions from anon, authenticated;
create policy no_password_sessions on public.receipt_plan_decisions as restrictive for all to authenticated
  using (public.signed_in_without_password()) with check (public.signed_in_without_password());

-- 2 -----------------------------------------------------------------------------------------------------------
-- p_rows: [{"donation_id": "...", "expect": {column: value, ...} | null, "set": {column: value, ...}}, ...]
-- `expect` (optional) is what the columns must still hold: the server read them just before, or an Undo puts
-- back what the correction replaced only if nobody has changed it again since. Raises:
--   receipt_details_not_found  a listed gift is not this charity's paid s18A gift of that tax year, or was erased
--   receipt_details_issued     a listed gift is already on an issued s18A receipt
--   receipt_details_changed    a column no longer holds what `expect` says
--   receipt_details_column     a column other than the name and street address was named
create or replace function public.correct_receipt_donor_details(p_charity_id uuid, p_tax_year int, p_rows jsonb)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  allowed constant text[] := array['first_name', 'last_name', 'organisation_name', 'address_line1', 'address_line2', 'suburb', 'city', 'postal_code'];
  ids uuid[];
  r jsonb;
  k text;
  cur jsonb;
  n int := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'receipt_details_not_found';
  end if;
  select array_agg((x->>'donation_id')::uuid order by (x->>'donation_id')::uuid) into ids from jsonb_array_elements(p_rows) x;
  if array_length(ids, 1) <> (select count(distinct u) from unnest(ids) u) then
    raise exception 'receipt_details_not_found';
  end if;

  -- Hold the gifts (in id order, like issue_s18a_receipt) so a receipt can't be issued between the checks and the change.
  perform 1 from public.donations where id = any (ids) order by id for update;

  if (select count(*) from public.donations d
        join public.donation_checkout_details c on c.donation_id = d.id
       where d.id = any (ids) and d.charity_id = p_charity_id and d.tax_year = p_tax_year
         and d.status = 'paid' and d.wants_18a and c.erased_at is null) <> array_length(ids, 1) then
    raise exception 'receipt_details_not_found';
  end if;
  if exists (select 1 from public.s18a_receipt_donations l join public.s18a_receipts s on s.id = l.receipt_id
              where l.donation_id = any (ids) and s.status = 'issued') then
    raise exception 'receipt_details_issued';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    for k in select jsonb_object_keys(coalesce(r->'set', '{}'::jsonb)) union select jsonb_object_keys(coalesce(nullif(r->'expect', 'null'::jsonb), '{}'::jsonb)) loop
      if not k = any (allowed) then raise exception 'receipt_details_column'; end if;
    end loop;
    select to_jsonb(c) into cur from public.donation_checkout_details c where c.donation_id = (r->>'donation_id')::uuid;
    if r ? 'expect' and jsonb_typeof(r->'expect') = 'object' then
      for k in select jsonb_object_keys(r->'expect') loop
        if nullif(cur->>k, '') is distinct from nullif(r->'expect'->>k, '') then raise exception 'receipt_details_changed'; end if;
      end loop;
    end if;
    update public.donation_checkout_details c set
      first_name = case when r->'set' ? 'first_name' then nullif(r->'set'->>'first_name', '') else c.first_name end,
      last_name = case when r->'set' ? 'last_name' then nullif(r->'set'->>'last_name', '') else c.last_name end,
      organisation_name = case when r->'set' ? 'organisation_name' then nullif(r->'set'->>'organisation_name', '') else c.organisation_name end,
      address_line1 = case when r->'set' ? 'address_line1' then nullif(r->'set'->>'address_line1', '') else c.address_line1 end,
      address_line2 = case when r->'set' ? 'address_line2' then nullif(r->'set'->>'address_line2', '') else c.address_line2 end,
      suburb = case when r->'set' ? 'suburb' then nullif(r->'set'->>'suburb', '') else c.suburb end,
      city = case when r->'set' ? 'city' then nullif(r->'set'->>'city', '') else c.city end,
      postal_code = case when r->'set' ? 'postal_code' then nullif(r->'set'->>'postal_code', '') else c.postal_code end
    where c.donation_id = (r->>'donation_id')::uuid;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.correct_receipt_donor_details(uuid, int, jsonb) from public, anon, authenticated;
grant execute on function public.correct_receipt_donor_details(uuid, int, jsonb) to service_role;
