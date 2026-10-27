-- A gift can come from the "Give with Givezy" button on a charity's own website (?src=button).
alter table public.donations drop constraint donation_came_from;
alter table public.donations add constraint donation_came_from
  check (came_from in ('website', 'app', 'whatsapp', 'share_link', 'qr', 'website_button', 'recorded'));
