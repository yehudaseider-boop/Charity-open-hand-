-- Givezy is for everyone: instead of the fixed maaser / chomesh / tzedaka choice, a donor may give
-- each gift their own label ("Work giving", "Family", or "Maaser"). Optional. Still private to the
-- donor: same tables, same row-level security. Old choices become labels; the kind column stays
-- for history but new rows use label only.
alter table public.donation_giving_kinds alter column kind drop not null;
alter table public.donation_giving_kinds add column label text;
update public.donation_giving_kinds
  set label = case kind when 'maaser' then 'Maaser' when 'chomesh' then 'Chomesh' else 'Tzedaka' end
  where label is null;
alter table public.donation_giving_kinds
  add constraint donation_giving_label_shape check (label is null or (char_length(label) between 1 and 40 and label !~ '[[:cntrl:]]')),
  add constraint donation_giving_label_present check (label is not null or kind is not null);

alter table public.external_giving_entries alter column kind drop not null;
alter table public.external_giving_entries add column label text;
update public.external_giving_entries
  set label = case kind when 'maaser' then 'Maaser' when 'chomesh' then 'Chomesh' else 'Tzedaka' end
  where label is null and kind is not null;
alter table public.external_giving_entries
  add constraint external_giving_label_shape check (label is null or (char_length(label) between 1 and 40 and label !~ '[[:cntrl:]]'));
