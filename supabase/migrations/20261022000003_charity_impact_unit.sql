-- What one gift pays for, in the charity's own figure ("R12 pays for one school breakfast"). The charity sets
-- the cost of one thing and what it is called; donors then see "Your R360 pays for 30 school breakfasts".
-- Only ever written by the charity: Givezy never makes one up. All three are set together, or none.
alter table public.charities
  add column impact_unit_cents bigint check (impact_unit_cents between 100 and 10000000),
  add column impact_unit_one text check (char_length(impact_unit_one) between 1 and 60),
  add column impact_unit_many text check (char_length(impact_unit_many) between 1 and 60),
  add constraint impact_unit_all_or_none check (
    (impact_unit_cents is null) = (impact_unit_one is null) and (impact_unit_one is null) = (impact_unit_many is null)
  );
grant select (impact_unit_cents, impact_unit_one, impact_unit_many) on public.charities to anon, authenticated;
grant update (impact_unit_cents, impact_unit_one, impact_unit_many) on public.charities to authenticated;
