-- Givezy: an index on donor_messages(charity_id) (review 24/11/2026). The foreign key to charities has no index of its
-- own, so deleting a charity (on delete cascade) and reading one charity's in-app thank-yous would scan the table.
-- Safe to run more than once.

create index if not exists donor_messages_charity on public.donor_messages (charity_id);
