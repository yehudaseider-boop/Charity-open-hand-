-- A short thank-you note a charity writes for its donors, shown in the app
-- when a donation to it arrives. Public, like the rest of the profile.
alter table public.charities
  add column thank_you_en text check (char_length(thank_you_en) <= 300);
grant select (thank_you_en) on public.charities to anon, authenticated;
