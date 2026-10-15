-- Givezy: tell a charity when a donation comes in (16/10/2026). On by default; the charity's admins
-- can turn it off on their profile page. The email names the amount only, never the donor.
alter table public.charity_private add column notify_donations boolean not null default true;
