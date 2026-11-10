-- Givezy: a charity's IT3(d) history (CRM build plan step 15, Yossi 9: "Submission status and history are kept
-- in the CRM"; built 10/11/2026).
--
-- Givezy does not submit to SARS: the charity uploads the data file through SARS's own channel, or types the
-- capture sheet into eFiling. So the history is two things:
--   1. what Givezy knows: each time the SARS data file or the eFiling capture sheet was produced for download,
--      with who, when, the tax year and period, and the counts and total only;
--   2. what the charity tells us: the owner may mark an entry "Uploaded to SARS on <date>" with an optional
--      short reference of their own (their eFiling reference). Givezy never checks this with SARS.
--
-- Never in this table: a donor's name, ID, tax or registration number, an address, the file itself, its name
-- (it carries the charity's tax reference number) or the Source Identifier. Counts and a total only.
--
-- Server-only: the website reads and writes it with the service role after checking the person is the charity's
-- owner (authoriseIt3d for the downloads, loadCharityForManager and isOwner for the page and the mark). No
-- browser can read or write it, not even the charity's own admin. Rows go with the charity.

create table public.charity_it3d_history (
  id uuid primary key default gen_random_uuid(),
  charity_id uuid not null references public.charities (id) on delete cascade,
  -- The tax year by the year it ends, as on s18a_receipts.tax_year (SARS field 203: at least 2022).
  tax_year int not null constraint it3d_history_year check (tax_year between 2022 and 2100),
  period text not null constraint it3d_history_period check (period in ('first_half', 'full_year')),
  -- 'file' is the SARS data file (.psv); 'sheet' is the eFiling capture sheet (.xlsx).
  kind text not null constraint it3d_history_kind check (kind in ('file', 'sheet')),
  -- A data file made for SARS's test environment. Always false for a capture sheet.
  test_data boolean not null default false,
  receipts int not null constraint it3d_history_receipts check (receipts >= 0),
  donors int not null constraint it3d_history_donors check (donors >= 0),
  donations int not null constraint it3d_history_donations check (donations >= 0),
  total_cents bigint not null constraint it3d_history_total check (total_cents >= 0),
  -- Receipts not in the file because the donor was erased before the SARS details were kept.
  receipts_left_out int not null default 0 constraint it3d_history_left_out check (receipts_left_out >= 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  -- The charity's own record that it uploaded this to SARS. Not checked with SARS.
  uploaded_on date,
  upload_reference text,
  marked_by uuid references auth.users (id) on delete set null,
  marked_at timestamptz,
  constraint it3d_history_sheet_is_live check (kind = 'file' or not test_data),
  -- Marked means a date and when it was marked; a reference only on a marked entry.
  constraint it3d_history_mark check ((uploaded_on is null) = (marked_at is null) and (uploaded_on is not null or (upload_reference is null and marked_by is null))),
  -- One line of plain text, at most 40 characters, no control characters.
  constraint it3d_history_reference check (upload_reference is null or (char_length(upload_reference) between 1 and 40 and upload_reference !~ '[[:cntrl:]]')),
  -- Not before the day it was produced and not after the day it was marked (both Johannesburg days).
  constraint it3d_history_uploaded_on check (uploaded_on is null or (uploaded_on >= (created_at at time zone 'Africa/Johannesburg')::date and uploaded_on <= (marked_at at time zone 'Africa/Johannesburg')::date))
);
create index charity_it3d_history_charity on public.charity_it3d_history (charity_id, created_at desc);

alter table public.charity_it3d_history enable row level security;
-- No policies: only the service role reaches it.
revoke all on public.charity_it3d_history from anon, authenticated;
create policy no_password_sessions on public.charity_it3d_history as restrictive for all to authenticated
  using (public.signed_in_without_password()) with check (public.signed_in_without_password());

-- What was produced never changes afterwards: only the charity's own mark does. Enforced for every role, so a
-- slip in the website can never rewrite the counts.
create or replace function public.it3d_history_keeps_its_facts() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.id, new.charity_id, new.tax_year, new.period, new.kind, new.test_data, new.receipts, new.donors, new.donations,
      new.total_cents, new.receipts_left_out, new.created_at)
     is distinct from
     (old.id, old.charity_id, old.tax_year, old.period, old.kind, old.test_data, old.receipts, old.donors, old.donations,
      old.total_cents, old.receipts_left_out, old.created_at) then
    raise exception 'it3d_history_fixed: only the uploaded mark can change';
  end if;
  return new;
end $$;
revoke all on function public.it3d_history_keeps_its_facts() from public, anon, authenticated;
create trigger it3d_history_keeps_its_facts before update on public.charity_it3d_history
  for each row execute function public.it3d_history_keeps_its_facts();
