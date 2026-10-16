-- A charity's own impact line ("R180 feeds a family for a week"), shown with its photo card and on
-- its page in the app. Only ever written by the charity: Givezy never makes one up.
alter table public.charities
  add column impact_en text check (char_length(impact_en) <= 140);
grant select (impact_en) on public.charities to anon, authenticated;
grant update (impact_en) on public.charities to authenticated;
