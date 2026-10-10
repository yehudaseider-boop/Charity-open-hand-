-- Charity profile: "How your donation is used", written by the charity and
-- shown on its public page and in the app. Public, like the description.
alter table public.charities
  add column funds_use_en text check (char_length(funds_use_en) <= 1500);
grant select (funds_use_en) on public.charities to anon, authenticated;
