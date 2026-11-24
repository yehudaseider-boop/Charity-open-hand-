-- Givezy: Givy prepares a thank-you, a person sends it, and donors see it in the app too (24/11/2026, Yehuda).
--
-- Two tables. The code works before and after this runs: before, Givy's button opens Email donors with only the
-- audience chosen (the words are in Givy's answer to copy), and the email is sent with no in-app copy. Nothing fails.
--
-- 1. assistant_drafts: the subject and words Givy prepared, kept for a few hours so the Email donors page can fill
--    them in without putting long text in a web address (which ends up in logs and the browser's history). Scoped to
--    the charity and the person who asked: the page reads it only for that person on that charity's dashboard, and
--    only before it expires. Server-only (service role); no browser can read or write it.
--
-- 2. donor_messages: a charity's thank-you inside the Givezy app, one per email and app account. Written only by the
--    server, after the email to that donor went, and only for a donor record linked to an app account
--    (donors.user_id), so the same opt-outs and limits cover both. A donor reads only their own (row-level security)
--    and may mark one read (the read_at column only). Erasure deletes them and the data download includes them.
--
-- No security-definer function is added.

create table public.assistant_drafts (
  id uuid primary key default gen_random_uuid(),
  charity_id uuid not null references public.charities (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  audience text not null constraint assistant_draft_audience check (char_length(audience) between 3 and 60),
  subject text not null constraint assistant_draft_subject check (char_length(subject) between 3 and 120),
  body text not null constraint assistant_draft_body check (char_length(body) between 10 and 5000),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '6 hours'
);

create index assistant_drafts_owner on public.assistant_drafts (charity_id, user_id, created_at desc);

alter table public.assistant_drafts enable row level security;
-- No policies: only the service role reaches it.
revoke all on public.assistant_drafts from anon, authenticated;
create policy no_password_sessions on public.assistant_drafts as restrictive for all to authenticated
  using (public.signed_in_without_password()) with check (public.signed_in_without_password());

create table public.donor_messages (
  id uuid primary key default gen_random_uuid(),
  charity_id uuid not null references public.charities (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  donor_id uuid references public.donors (id) on delete set null,
  appeal_id uuid references public.charity_appeals (id) on delete set null,
  subject text not null constraint donor_message_subject check (char_length(subject) between 1 and 120),
  body text not null constraint donor_message_body check (char_length(body) between 1 and 5000),
  sent_at timestamptz not null default now(),
  read_at timestamptz,
  constraint donor_message_once unique (appeal_id, user_id)
);

create index donor_messages_mine on public.donor_messages (user_id, sent_at desc);
create index donor_messages_donor on public.donor_messages (donor_id);

alter table public.donor_messages enable row level security;
revoke all on public.donor_messages from anon, authenticated;
-- A donor reads their own messages, and may mark one read. Nothing else: no insert, no delete, no other column.
grant select on public.donor_messages to authenticated;
grant update (read_at) on public.donor_messages to authenticated;
create policy donor_messages_read_own on public.donor_messages for select to authenticated
  using (user_id = (select auth.uid()));
create policy donor_messages_mark_read_own on public.donor_messages for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy no_password_sessions on public.donor_messages as restrictive for all to authenticated
  using (public.signed_in_without_password()) with check (public.signed_in_without_password());
