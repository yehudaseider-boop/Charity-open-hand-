-- A donor's own pages show what each month really collects (18/11/2026): the gift, the contribution to Givezy and,
-- when they chose to cover it, the card charge. Whether they cover it was not readable by the donor (the column was
-- added after the column list of 13/10/2026). Reading it is still limited to the donor's own rows by recurring_read.
grant select (covers_card_charge) on public.recurring_donations to authenticated;
