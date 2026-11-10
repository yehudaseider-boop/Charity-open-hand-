-- Givezy: a charity's donor journey (CRM build plan step 6a, Yossi 1.1; built 10/11/2026).
--
-- One general journey per charity: up to 5 emails the charity writes, each a number of days after the one before
-- (the first, 0 to 30 days after the donor joins; the others 7 to 180 days apart). Decided by Yehuda 10/11/2026:
--   * a donor joins on their first paid gift to the charity, counted from when the journey was switched on;
--   * the owner can also add the charity's existing donors, once they have seen how many (asked first);
--   * no typed links in the emails (the same rule as the thank-you note); Givezy adds the button to the charity's
--     own page and the stop link;
--   * one message a week per donor per charity across everything (decided 09/11/2026): each journey email claims the
--     donor's week in charity_donor_thanks, kind 'journey'. A step that meets a claimed week waits for the next week.
--
-- Server-only, like the personal thank-you and the IT3(d) history: the website reads and writes these tables with the
-- service role after checking the person manages the charity (and is its owner, for changes). No browser reads or
-- writes them, not even the charity's own admin. Everything goes with the charity; enrolments go with the donor.

-- 1. The week's claim can now be a journey email.
alter table public.charity_donor_thanks drop constraint donor_message_kind;
alter table public.charity_donor_thanks
  add constraint donor_message_kind check (kind in ('thank_you', 's18a_details_reminder', 'journey'));
comment on column public.charity_donor_thanks.kind is
  'Which message claimed the donor''s week: a personal thank-you, a reminder to add s18A details, or a donor journey email. One a week per donor per charity.';

-- 2. The journey: on or off, and since when (new donors join from that moment).
create table public.charity_journeys (
  charity_id uuid primary key references public.charities (id) on delete cascade,
  enabled boolean not null default false,
  -- When it was last switched on. Set whenever it is on; kept when it is switched off, so the page can say when.
  switched_on_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint charity_journey_on_since check (not enabled or switched_on_at is not null)
);

-- 3. Its emails, in order. Plain words only: the server checks there is no web address in them before saving.
create table public.charity_journey_steps (
  charity_id uuid not null references public.charity_journeys (charity_id) on delete cascade,
  position int not null constraint journey_step_position check (position between 1 and 5),
  subject text not null constraint journey_step_subject check (char_length(subject) between 3 and 120 and subject = btrim(subject) and subject !~ '[[:cntrl:]]'),
  body text not null constraint journey_step_body check (char_length(body) between 10 and 1500 and body = btrim(body)),
  -- Days after the donor joins (the first email) or after the email before (the others).
  wait_days int not null,
  updated_at timestamptz not null default now(),
  primary key (charity_id, position),
  constraint journey_step_wait check ((position = 1 and wait_days between 0 and 30) or (position > 1 and wait_days between 7 and 180))
);

-- 4. Who is on it, and which email they get next, when.
create table public.charity_journey_enrolments (
  id uuid primary key default gen_random_uuid(),
  charity_id uuid not null references public.charity_journeys (charity_id) on delete cascade,
  donor_id uuid not null references public.donors (id) on delete cascade,
  source text not null constraint journey_enrolment_source check (source in ('new_gift', 'existing')),
  enrolled_at timestamptz not null default now(),
  -- The email they get next (1 to 5), or 6 once they have had all five.
  next_step int not null default 1 constraint journey_enrolment_step check (next_step between 1 and 6),
  next_due_at timestamptz not null,
  status text not null default 'active' constraint journey_enrolment_status check (status in ('active', 'finished', 'stopped')),
  stopped_reason text constraint journey_enrolment_stopped_reason check (stopped_reason in ('erased', 'opted_out', 'no_email', 'no_gift')),
  updated_at timestamptz not null default now(),
  constraint journey_enrolment_reason check ((status = 'stopped') = (stopped_reason is not null)),
  -- A donor goes through a charity's journey once.
  constraint journey_enrolment_once unique (charity_id, donor_id)
);
create index charity_journey_enrolments_due on public.charity_journey_enrolments (next_due_at) where status = 'active';
create index charity_journey_enrolments_charity on public.charity_journey_enrolments (charity_id, status, next_step);

-- 5. Each email that went: once per donor per step.
create table public.charity_journey_sends (
  id uuid primary key default gen_random_uuid(),
  enrolment_id uuid not null references public.charity_journey_enrolments (id) on delete cascade,
  charity_id uuid not null references public.charity_journeys (charity_id) on delete cascade,
  position int not null constraint journey_send_position check (position between 1 and 5),
  sent_at timestamptz not null default now(),
  constraint journey_send_once unique (enrolment_id, position)
);
create index charity_journey_sends_charity on public.charity_journey_sends (charity_id, sent_at desc);

-- Server-only: row-level security on, no policies, nothing granted, and never a password session.
do $$
declare t text;
begin
  foreach t in array array['charity_journeys', 'charity_journey_steps', 'charity_journey_enrolments', 'charity_journey_sends'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('create policy no_password_sessions on public.%I as restrictive for all to authenticated using (public.signed_in_without_password()) with check (public.signed_in_without_password())', t);
  end loop;
end $$;
