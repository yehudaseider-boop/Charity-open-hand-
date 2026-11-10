-- CRM step 2 (Yossi 2.1, built 10/11/2026): "Remind to add their details" on the Donors list's "Details missing" filter.
--
-- Decided 09/11/2026 (Yehuda): at most one message a week per donor from a charity, across all messages. The personal
-- thank-you already claims the donor's week in charity_donor_thanks (unique per charity, donor and week). The s18A
-- details reminder claims the same week in the same table, so a thank-you and a reminder can't both go to a donor in
-- one week, and two presses at once can't both send. `kind` says which message took the week.
--
-- Server-only, unchanged: no client reads or writes this table (row-level security on, no policies, revoked).

alter table public.charity_donor_thanks
  add column kind text not null default 'thank_you'
  constraint donor_message_kind check (kind in ('thank_you', 's18a_details_reminder'));

comment on column public.charity_donor_thanks.kind is
  'Which message claimed the donor''s week: a personal thank-you or a reminder to add s18A details. One a week per donor per charity.';
