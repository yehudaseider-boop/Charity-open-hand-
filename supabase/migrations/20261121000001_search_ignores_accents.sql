-- Charity search ignores accents both ways (21/11/2026, go-live checklist "Charity search and accents", Yehuda's yes
-- for TEST given 21/11/2026): "Cafe" finds "Café" and "café" finds "Cafe".
--
-- How the website searches today: Find a charity (src/app/charities/view.tsx) is a plain query on public.charities,
-- read as an anonymous visitor (row-level security returns approved charities only, and column grants limit what a
-- visitor may read). It matches the typed words, with anything between them ("save a life" finds "Save-a-Life"),
-- case-insensitively against name_en, legal_name_en, description_en, suburb and city. The phone app searches the list
-- it has already loaded, on the phone, so it needs nothing from this migration.
--
-- What this adds:
-- 1. The unaccent extension, in the extensions schema (where Supabase keeps extensions).
-- 2. public.plain_search_text(text): lower case without accents ("Café" -> "cafe", "Straße" -> "strasse"). Immutable,
--    security invoker, empty search path; anyone may run it (it reads nothing). The website and the app fold what is
--    typed the same way (src/lib/charity/search-text.ts).
-- 3. public.charities.search_text: a stored generated column, plain_search_text of those same five columns joined by
--    spaces, kept up to date by the database on every insert and update. The website matches the folded words against
--    it with LIKE instead of the five ILIKEs. Visitors and signed-in people may read it, like the five columns it is
--    made from (they were already readable). Nothing else changes: the same row-level security, the same approved-only
--    rule, the same order and permissions.
--
-- Why a column and not a search function: the list embeds each charity's causes and reads only the columns a visitor
-- is granted, which a function returning charity rows cannot do without reading every column (or running as its
-- owner, which would bypass the column grants). A function returning ids would need a second request and a long
-- address for a broad search. The one difference: the words are now found across the five columns together
-- ("cafe soweto" finds Café Kids in Soweto, and "girls boys" finds "Boys & Girls Club" through its name and then its
-- legal name), which only ever finds more, never less.
--
-- No index: the search is a "contains" match (LIKE '%word%'), which an ordinary index cannot help with; that needs
-- pg_trgm, which this project does not use. The list is small, and the column saves working out unaccent per row.
--
-- Deploy order: this migration on TEST first, then the website code that reads search_text (the website requires
-- it: without the column a search shows the error page). Live gets the migration, with its own yes, before the
-- website goes live with this code.

create extension if not exists unaccent with schema extensions;

create or replace function public.plain_search_text(p_text text)
returns text
language sql
immutable
strict
parallel safe
security invoker
set search_path = ''
as $$ select extensions.unaccent('extensions.unaccent'::regdictionary, lower(p_text)) $$;

comment on function public.plain_search_text(text) is
  'Lower case without accents, for charity search. The website and app fold typed words the same way (src/lib/charity/search-text.ts).';

revoke all on function public.plain_search_text(text) from public;
grant execute on function public.plain_search_text(text) to anon, authenticated, service_role;

alter table public.charities
  add column search_text text generated always as (
    -- coalesce and || rather than concat_ws, which Postgres does not count as immutable.
    public.plain_search_text(coalesce(name_en, '') || ' ' || coalesce(legal_name_en, '') || ' ' || coalesce(description_en, '')
      || ' ' || coalesce(suburb, '') || ' ' || coalesce(city, ''))
  ) stored;

comment on column public.charities.search_text is
  'Name, legal name, description, suburb and city, lower case without accents, for the charities search. Kept by the database.';

grant select (search_text) on public.charities to anon, authenticated;
