-- Givezy: email fingerprints get a secret key (Yehuda, 24/11/2026).
--
-- Opt-outs, stop links and "already thanked" claims keep a fingerprint of an address, never the address. Until now it
-- was the plain sha256 of the address (trimmed, lower case), so anyone who could read the database could test a list
-- of known addresses against it. From now on it is keyed: HMAC-SHA256(key, plain sha256), with a key the server
-- derives from ENCRYPTION_KEY, which the database never sees (src/lib/email-fingerprint.ts).
--
-- 1. email_hash_v on every table that keeps a fingerprint: 1 = the plain hash (every row there today), 2 = keyed.
--    The default is 1, so a row written by the code that runs before the new code is deployed is marked correctly
--    and converted later. The new code always writes 2 itself. Once the new code runs everywhere, a later migration
--    drops the default (go-live checklist), so a write that forgot the version fails instead of being misread.
-- 2. convert_email_fingerprints(): the database half of the converter. The server reads rows still at version 1,
--    keys their values (it needs the key, so it can't be done in SQL) and hands old and new values here. Safe to run
--    twice: only rows still at version 1 change. Where the keyed row is already there (the same person opted out
--    again after the change), the two are merged and the stronger choice is kept.
-- 2b. claim_thank_you_recipient(): claims an address for a monthly thank-you only when neither its keyed nor its
--    plain value is claimed already, so a claim made before the change still stops a second email.
-- 3. my_news_opt_outs() hashed addresses inside the database, which can't be done with a key. It is replaced by
--    user_email_addresses(), for the server only: the server keys the addresses and looks the opt-outs up itself
--    (the phone app asks our server, /api/app/news-opt-outs). An older app that still calls my_news_opt_outs() gets
--    an error and shows no news (its rule: if it can't tell, no news), never news someone said no to.

-- 1 ---------------------------------------------------------------------------------------------------------------
alter table public.thank_you_opt_outs add column email_hash_v smallint not null default 1
  constraint thank_you_opt_out_hash_v check (email_hash_v in (1, 2));
alter table public.email_stop_tokens add column email_hash_v smallint not null default 1
  constraint email_stop_token_hash_v check (email_hash_v in (1, 2));
alter table public.charity_email_opt_outs add column email_hash_v smallint not null default 1
  constraint charity_email_opt_out_hash_v check (email_hash_v in (1, 2));
alter table public.charity_email_stop_tokens add column email_hash_v smallint not null default 1
  constraint charity_email_stop_token_hash_v check (email_hash_v in (1, 2));
alter table public.charity_thank_you_recipients add column email_hash_v smallint not null default 1
  constraint thank_you_recipient_hash_v check (email_hash_v in (1, 2));

-- The converter reads what is left at version 1, in order of the value.
create index thank_you_opt_outs_v1 on public.thank_you_opt_outs (email_hash) where email_hash_v = 1;
create index email_stop_tokens_v1 on public.email_stop_tokens (email_hash) where email_hash_v = 1;
create index charity_email_opt_outs_v1 on public.charity_email_opt_outs (email_hash) where email_hash_v = 1;
create index charity_email_stop_tokens_v1 on public.charity_email_stop_tokens (email_hash) where email_hash_v = 1;
create index charity_thank_you_recipients_v1 on public.charity_thank_you_recipients (email_hash) where email_hash_v = 1;

-- 2 ---------------------------------------------------------------------------------------------------------------
-- p_old[i] (a version 1 value) becomes p_new[i] (the same address keyed) in one table. Returns the rows changed or
-- merged. Server only (service role).
create or replace function public.convert_email_fingerprints(p_table text, p_old text[], p_new text[])
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  i int;
  n int := 0;
  c int;
  o text;
  k text;
begin
  if p_table not in ('thank_you_opt_outs', 'email_stop_tokens', 'charity_email_opt_outs', 'charity_email_stop_tokens', 'charity_thank_you_recipients') then
    raise exception 'Not a table with email fingerprints: %', p_table;
  end if;
  if coalesce(array_length(p_old, 1), 0) <> coalesce(array_length(p_new, 1), 0) then
    raise exception 'Old and new fingerprints must come in pairs';
  end if;
  for i in 1 .. coalesce(array_length(p_old, 1), 0) loop
    o := p_old[i];
    k := p_new[i];
    if o is null or k is null or o !~ '^[0-9a-f]{64}$' or k !~ '^[0-9a-f]{64}$' or o = k then
      raise exception 'Not a fingerprint pair';
    end if;

    if p_table = 'thank_you_opt_outs' then
      -- Keyed already there: keep it, with the earlier date, and drop the plain one.
      update public.thank_you_opt_outs t set created_at = least(t.created_at, x.created_at)
        from public.thank_you_opt_outs x
       where t.email_hash = k and x.email_hash = o and x.email_hash_v = 1;
      delete from public.thank_you_opt_outs x
       where x.email_hash = o and x.email_hash_v = 1
         and exists (select 1 from public.thank_you_opt_outs t where t.email_hash = k);
      get diagnostics c = row_count;
      n := n + c;
      update public.thank_you_opt_outs set email_hash = k, email_hash_v = 2 where email_hash = o and email_hash_v = 1;
      get diagnostics c = row_count;
      n := n + c;

    elsif p_table = 'charity_email_opt_outs' then
      -- Keyed already there for the same charity: keep the stronger choice (a stop link or the charity's note also
      -- stops thank-yous; the checkout tick only news and appeals) and the earlier date, then drop the plain one.
      update public.charity_email_opt_outs t
         set source = case when t.source = 'checkout' then x.source else t.source end,
             created_at = least(t.created_at, x.created_at)
        from public.charity_email_opt_outs x
       where t.email_hash = k and x.email_hash = o and x.email_hash_v = 1 and x.charity_id = t.charity_id;
      delete from public.charity_email_opt_outs x
       where x.email_hash = o and x.email_hash_v = 1
         and exists (select 1 from public.charity_email_opt_outs t where t.email_hash = k and t.charity_id = x.charity_id);
      get diagnostics c = row_count;
      n := n + c;
      update public.charity_email_opt_outs set email_hash = k, email_hash_v = 2 where email_hash = o and email_hash_v = 1;
      get diagnostics c = row_count;
      n := n + c;

    elsif p_table = 'charity_thank_you_recipients' then
      -- Keyed already there for the same thank-you: keep the outcome that may have reached them ('sent', then
      -- 'sending', then 'failed'), so nobody is emailed twice, with the date of the row whose outcome is kept (a
      -- 'sent' this week keeps this week's date, so the one-a-week rule still sees it); the earlier date only when
      -- both have the same outcome. Then drop the plain one.
      update public.charity_thank_you_recipients t
         set status = case when (case x.status when 'sent' then 2 when 'sending' then 1 else 0 end)
                              > (case t.status when 'sent' then 2 when 'sending' then 1 else 0 end) then x.status else t.status end,
             claimed_at = case when (case x.status when 'sent' then 2 when 'sending' then 1 else 0 end)
                                  > (case t.status when 'sent' then 2 when 'sending' then 1 else 0 end) then x.claimed_at
                               when x.status = t.status then least(t.claimed_at, x.claimed_at)
                               else t.claimed_at end
        from public.charity_thank_you_recipients x
       where t.email_hash = k and x.email_hash = o and x.email_hash_v = 1 and x.thank_you_id = t.thank_you_id;
      delete from public.charity_thank_you_recipients x
       where x.email_hash = o and x.email_hash_v = 1
         and exists (select 1 from public.charity_thank_you_recipients t where t.email_hash = k and t.thank_you_id = x.thank_you_id);
      get diagnostics c = row_count;
      n := n + c;
      update public.charity_thank_you_recipients set email_hash = k, email_hash_v = 2 where email_hash = o and email_hash_v = 1;
      get diagnostics c = row_count;
      n := n + c;

    elsif p_table = 'email_stop_tokens' then
      -- Keyed by the token, so no two rows can clash.
      update public.email_stop_tokens set email_hash = k, email_hash_v = 2 where email_hash = o and email_hash_v = 1;
      get diagnostics c = row_count;
      n := n + c;

    else
      update public.charity_email_stop_tokens set email_hash = k, email_hash_v = 2 where email_hash = o and email_hash_v = 1;
      get diagnostics c = row_count;
      n := n + c;
    end if;
  end loop;
  return n;
end $$;
revoke all on function public.convert_email_fingerprints(text, text[], text[]) from public, anon, authenticated;
grant execute on function public.convert_email_fingerprints(text, text[], text[]) to service_role;

-- 2b --------------------------------------------------------------------------------------------------------------
-- Claiming one address for a monthly thank-you (review 24/11/2026). The address is claimed keyed, but a claim made
-- before the change (or by code from before it, while both run during a deploy) is at the plain hash, a different
-- value, so the primary key alone would let both through and the same person would be thanked twice. This claims
-- only when neither value is there for this thank-you. True when this call claimed it. Server only (service role).
create or replace function public.claim_thank_you_recipient(p_thank_you_id uuid, p_keyed text, p_plain text)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  c int;
begin
  if p_thank_you_id is null or p_keyed is null or p_plain is null
     or p_keyed !~ '^[0-9a-f]{64}$' or p_plain !~ '^[0-9a-f]{64}$' or p_keyed = p_plain then
    raise exception 'Not a fingerprint pair';
  end if;
  insert into public.charity_thank_you_recipients (thank_you_id, email_hash, email_hash_v)
  select p_thank_you_id, p_keyed, 2
   where not exists (
     select 1 from public.charity_thank_you_recipients r
      where r.thank_you_id = p_thank_you_id and r.email_hash = p_plain)
  on conflict (thank_you_id, email_hash) do nothing;
  get diagnostics c = row_count;
  return c > 0;
end $$;
revoke all on function public.claim_thank_you_recipient(uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_thank_you_recipient(uuid, text, text) to service_role;

-- 3 ---------------------------------------------------------------------------------------------------------------
-- Every address a signed-in person has used with us, trimmed and in lower case: their sign-in address, the address on
-- their donor records, and every address typed at their checkouts (the same three as my_news_opt_outs() used).
-- Server only: the server checks who is asking first (a signed-in session, never a password session, as
-- my_donor_ids() requires) and keys the addresses itself. Erased details are left out.
create or replace function public.user_email_addresses(p_user_id uuid) returns setof text
language sql stable security definer set search_path = '' as $$
  select lower(btrim(u.email::text)) from auth.users u where u.id = p_user_id and u.email is not null
  union
  select lower(btrim(d.email::text)) from public.donors d
   where d.user_id = p_user_id and d.email is not null and d.erased_at is null
  union
  select lower(btrim(c.email::text)) from public.donation_checkout_details c
    join public.donations g on g.id = c.donation_id
    join public.donors d on d.id = g.donor_id
   where d.user_id = p_user_id and c.email is not null and c.erased_at is null
$$;
revoke all on function public.user_email_addresses(uuid) from public, anon, authenticated;
grant execute on function public.user_email_addresses(uuid) to service_role;

-- It hashed addresses in the database without a key. Gone: its replacement is the server's /api/app/news-opt-outs.
drop function if exists public.my_news_opt_outs();
