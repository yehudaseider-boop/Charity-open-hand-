-- A charity thanks one donor personally (18/10/2026, Yehuda): one short email, sent by Givezy in the
-- charity's name, replies going to the charity's contact email. At most once a week per donor, so
-- nobody is flooded: the week (Monday, Johannesburg) is part of the key, and the row is claimed
-- before the email goes.
-- Server-only: the website writes and reads these with the service role after checking the person
-- manages the charity. No client can read or write them.

create table public.charity_donor_thanks (
  id uuid primary key default gen_random_uuid(),
  charity_id uuid not null references public.charities (id) on delete cascade,
  donor_id uuid not null references public.donors (id) on delete cascade,
  week_start date not null,
  body text not null constraint donor_thanks_body check (char_length(body) between 10 and 1000),
  sent_by uuid references auth.users (id) on delete set null,
  sent_at timestamptz not null default now(),
  constraint donor_thanks_once_a_week unique (charity_id, donor_id, week_start)
);

create index charity_donor_thanks_charity on public.charity_donor_thanks (charity_id, sent_at desc);

alter table public.charity_donor_thanks enable row level security;
-- No policies: only the service role reaches it.
revoke all on public.charity_donor_thanks from anon, authenticated;
create policy no_password_sessions on public.charity_donor_thanks as restrictive for all to authenticated
  using (public.signed_in_without_password()) with check (public.signed_in_without_password());
