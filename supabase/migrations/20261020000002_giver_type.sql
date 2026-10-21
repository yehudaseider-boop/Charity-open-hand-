-- How a donor describes their giving, chosen on first open in the app ("What kind of giver are you?").
-- Optional: empty if they skip. Kept on the donor's own account row; charities never see it.
alter table public.profiles
  add column giver_type text
  constraint profiles_giver_type check (giver_type in ('regular', 'occasional', 'cause_focused'));

comment on column public.profiles.giver_type is
  'Chosen by the donor on first open (regular, occasional, cause_focused). Optional. Personal data: in "Download my information", removed with the account.';

-- A signed-in donor may set their own answer. The existing row-level rules (own row only, no password
-- sessions) apply to it like every other column; nothing else becomes editable.
grant update (giver_type) on public.profiles to authenticated;
