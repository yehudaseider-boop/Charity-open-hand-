-- Givezy: the database keeps a charity's profile within the website's own rules (security review, 12/11/2026).
--
-- A charity's team may update its own profile and application fields (policy charities_admin_update in
-- 20261110000009_team_roles.sql, column grants in 20261015000004_privacy_security_review.sql and later). That is
-- needed for the website's forms, but it also lets a signed-in team member write to those columns straight through
-- the database API, past the website's checks: a website that is not a web address at all (for example a
-- "javascript:" link, which the public charity page shows as a link), or texts far longer than the forms allow.
--
-- These checks hold the same rules as the website (src/lib/charity/validation.ts, 12/11/2026), so nothing the
-- website accepts is refused here:
--   website        a web address starting http:// or https:// (the form adds https:// when none is typed), no spaces,
--                  at most 2 000 characters (the form sets no length; this is only a ceiling)
--   name_en        1 to 120 characters          legal_name_en   at most 200
--   description_en at most 3 000                funds_use_en    at most 1 500
--   npo_number, pbo_number, s18a_reference      at most 40 each
--   address_line1, address_line2 at most 200    suburb, city    at most 80
--   postal_code    4 digits
-- (thank_you_en, impact_en and the suggested amounts already have their checks.) Empty values stay allowed where
-- the forms allow them: an application fills these in step by step.
--
-- Added NOT VALID, so existing rows are not checked while the constraint is added; then each one is validated only
-- if no existing row breaks it. If one does, it stays NOT VALID (new writes are still checked) and a notice names
-- it: fix that row, then run "alter table public.charities validate constraint <name>". Row-level security and
-- grants are unchanged.
--
-- NOTE: the website form accepts http:// as well as https:// (validation.ts); this check matches it. Requiring
-- https:// only would need the form changed first (go-live list).

alter table public.charities
  add constraint charity_website_shape check (
    website is null or (website ~* '^https?://[^[:space:]]+$' and char_length(website) <= 2000)) not valid,
  add constraint charity_name_length check (char_length(name_en) between 1 and 120) not valid,
  add constraint charity_legal_name_length check (legal_name_en is null or char_length(legal_name_en) <= 200) not valid,
  add constraint charity_description_length check (description_en is null or char_length(description_en) <= 3000) not valid,
  add constraint charity_funds_use_length check (funds_use_en is null or char_length(funds_use_en) <= 1500) not valid,
  add constraint charity_numbers_length check (
    (npo_number is null or char_length(npo_number) <= 40)
    and (pbo_number is null or char_length(pbo_number) <= 40)
    and (s18a_reference is null or char_length(s18a_reference) <= 40)) not valid,
  add constraint charity_address_length check (
    (address_line1 is null or char_length(address_line1) <= 200)
    and (address_line2 is null or char_length(address_line2) <= 200)
    and (suburb is null or char_length(suburb) <= 80)
    and (city is null or char_length(city) <= 80)) not valid,
  add constraint charity_postal_code_shape check (postal_code is null or postal_code ~ '^[0-9]{4}$') not valid;

-- Validate each one only when every existing row already meets it.
do $$
declare
  c record;
  bad boolean;
begin
  for c in
    select conname, regexp_replace(pg_get_constraintdef(oid), '^CHECK \((.*)\)( NOT VALID)?$', '\1') as cond
    from pg_constraint
    where conrelid = 'public.charities'::regclass and not convalidated
      and conname in ('charity_website_shape', 'charity_name_length', 'charity_legal_name_length', 'charity_description_length',
                      'charity_funds_use_length', 'charity_numbers_length', 'charity_address_length', 'charity_postal_code_shape')
  loop
    -- The same condition, tested on the rows already there (null counts as met, as in a check).
    execute format('select exists (select 1 from public.charities where not coalesce((%s), true))', c.cond) into bad;
    if bad then
      raise notice 'Left NOT VALID: % (an existing charity breaks it; fix that row, then validate it)', c.conname;
    else
      execute format('alter table public.charities validate constraint %I', c.conname);
    end if;
  end loop;
end $$;
