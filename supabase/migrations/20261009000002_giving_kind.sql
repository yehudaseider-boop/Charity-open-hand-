-- Open Hand: what each gift is counted as for the donor's own records:
-- maaser, chomesh or general tzedaka. The donor chooses at checkout (no
-- default). Older rows stay empty. Only the donor's own maaser tracking uses it.
alter table public.donations
  add column giving_kind text check (giving_kind in ('maaser', 'chomesh', 'tzedaka'));
