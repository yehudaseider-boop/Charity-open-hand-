-- Emails from a charity to its donors (21/10/2026, Yehuda, chunk 5): news and appeals, written on the
-- dashboard by the charity's owner and sent by Givezy. The charity never handles addresses.
--
-- Who may be emailed (POPIA direct marketing to the charity's own donors): anyone with a paid gift to the
-- charity, unless they said no at checkout or used the stop link in an earlier email. Each email carries
-- the stop link. At most 4 a month (30 days) to the same donor from the same charity.
--
-- Sending is resumable: each email's recipients are listed first ('waiting'), then each is claimed
-- ('sending') before the email goes, so a second press or a stopped page never emails anyone twice.
-- Server-only tables, like the rest of donor care.

create table public.charity_appeals (
  id uuid primary key default gen_random_uuid(),
  charity_id uuid not null references public.charities (id) on delete cascade,
  subject text not null constraint charity_appeal_subject check (char_length(subject) between 3 and 120),
  body text not null constraint charity_appeal_body check (char_length(body) between 10 and 5000),
  -- Who it was for, as chosen: {all|group|tag|segment|campaign, ...}. Shown back on the page.
  audience jsonb not null,
  audience_label text not null constraint charity_appeal_audience check (char_length(audience_label) between 1 and 200),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index charity_appeals_charity on public.charity_appeals (charity_id, created_at desc);

create table public.charity_appeal_recipients (
  appeal_id uuid not null references public.charity_appeals (id) on delete cascade,
  charity_id uuid not null references public.charities (id) on delete cascade,
  donor_id uuid not null references public.donors (id) on delete cascade,
  status text not null default 'waiting' constraint appeal_recipient_status check (status in ('waiting', 'sending', 'sent', 'failed', 'skipped')),
  claimed_at timestamptz,
  sent_at timestamptz,
  primary key (appeal_id, donor_id)
);
-- The monthly limit counts what was sent (or may have been) to a donor by a charity.
create index charity_appeal_recipients_donor on public.charity_appeal_recipients (charity_id, donor_id, claimed_at);
create index charity_appeal_recipients_waiting on public.charity_appeal_recipients (appeal_id) where status = 'waiting';

-- "No news or appeals from this charity": from the box at checkout or the stop link. A hash of the
-- address only, like thank-you opt-outs.
create table public.charity_email_opt_outs (
  charity_id uuid not null references public.charities (id) on delete cascade,
  email_hash text not null constraint charity_email_opt_out_hash check (email_hash ~ '^[0-9a-f]{64}$'),
  source text not null constraint charity_email_opt_out_source check (source in ('checkout', 'stop_link', 'charity')),
  created_at timestamptz not null default now(),
  primary key (charity_id, email_hash)
);

-- The stop link in each email: a random token (stored hashed) for one address at one charity.
create table public.charity_email_stop_tokens (
  token_hash text primary key constraint charity_email_stop_token check (token_hash ~ '^[0-9a-f]{64}$'),
  charity_id uuid not null references public.charities (id) on delete cascade,
  email_hash text not null constraint charity_email_stop_email check (email_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['charity_appeals', 'charity_appeal_recipients', 'charity_email_opt_outs', 'charity_email_stop_tokens'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('create policy no_password_sessions on public.%I as restrictive for all to authenticated using (public.signed_in_without_password()) with check (public.signed_in_without_password())', t);
  end loop;
end $$;

-- Claim the next few waiting recipients of one email, leaving out anyone who has had 4 from this charity
-- in the last 30 days (counted at the moment of claiming, so two emails sent at once can't both get
-- through). Those are marked 'skipped'. Server only.
create function public.claim_appeal_recipients(p_appeal_id uuid, p_limit int)
returns table (donor_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  v_charity uuid;
  r record;
  n int := 0;
begin
  select charity_id into v_charity from public.charity_appeals where id = p_appeal_id;
  if v_charity is null then return; end if;
  for r in
    select x.donor_id from public.charity_appeal_recipients x
     where x.appeal_id = p_appeal_id and x.status = 'waiting'
     order by x.donor_id
     for update skip locked
  loop
    exit when n >= p_limit;
    -- One donor at a time per charity, so the count below is never read twice at once.
    perform pg_advisory_xact_lock(hashtextextended(v_charity::text || r.donor_id::text, 0));
    if (select count(*) from public.charity_appeal_recipients y
         where y.charity_id = v_charity and y.donor_id = r.donor_id
           and y.status in ('sending', 'sent') and y.claimed_at > now() - interval '30 days') >= 4 then
      update public.charity_appeal_recipients set status = 'skipped' where appeal_id = p_appeal_id and charity_appeal_recipients.donor_id = r.donor_id;
    else
      update public.charity_appeal_recipients set status = 'sending', claimed_at = now() where appeal_id = p_appeal_id and charity_appeal_recipients.donor_id = r.donor_id;
      donor_id := r.donor_id;
      n := n + 1;
      return next;
    end if;
  end loop;
end $$;
revoke execute on function public.claim_appeal_recipients(uuid, int) from public, anon, authenticated;
