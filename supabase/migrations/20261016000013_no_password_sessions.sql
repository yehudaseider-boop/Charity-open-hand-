-- Givezy: a session started with a password sees and changes nothing (16/10/2026, full review).
--
-- Givezy signs people in with an emailed code (or Google/Apple) only. Someone could register another
-- person's email with a password before that person ever signs in; when the real owner later signs in
-- with a code, the same account is confirmed and their donor records are linked to it. Until now only
-- donations, receipts and monthly donations (through my_donor_ids) refused password sessions; the
-- donor's own profile row, notes, favourites, goal records, consents and requests checked the user id
-- only. One restrictive policy per table now refuses password sessions everywhere, on top of the
-- existing policies (a restrictive policy can only narrow what they allow).

do $$
declare t record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'p') loop
    execute format('drop policy if exists no_password_sessions on public.%I', t.relname);
    execute format(
      'create policy no_password_sessions on public.%I as restrictive for all to authenticated
         using (public.signed_in_without_password()) with check (public.signed_in_without_password())',
      t.relname);
  end loop;
end $$;

-- Pausing, restarting or cancelling a monthly donation: the same rule.
CREATE OR REPLACE FUNCTION public.set_my_recurring_status(p_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid := (select auth.uid());
  cur public.recurring_status;
  r_day int;
  r_paid text;
  has_card boolean;
  this_month timestamp := date_trunc('month', now() at time zone 'Africa/Johannesburg');
  this_charge timestamptz;
  new_next timestamptz;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if not public.signed_in_without_password() then raise exception 'Please sign in with the emailed code'; end if;
  if p_status not in ('active', 'paused', 'cancelled') then raise exception 'Unknown status'; end if;

  select r.status, r.charge_day, r.last_paid_period, r.authorization_encrypted is not null into cur, r_day, r_paid, has_card
  from public.recurring_donations r
  join public.donors d on d.id = r.donor_id
  where r.id = p_id and d.user_id = uid
  for update of r;
  if not found then raise exception 'Monthly donation not found'; end if;

  if cur::text = p_status then return; end if;
  if not (
       (cur = 'active' and p_status in ('paused', 'cancelled'))
    or (cur = 'failed' and p_status = 'cancelled')
    or (cur = 'paused' and p_status in ('active', 'cancelled'))
    or (cur = 'pending' and p_status = 'cancelled')
  ) then
    raise exception 'A % monthly donation cannot be set to %', cur, p_status;
  end if;
  if p_status = 'active' and not has_card then
    raise exception 'This monthly donation has no card to charge. Start a new monthly donation instead.';
  end if;

  if p_status = 'active' then
    this_charge := public.monthly_charge_time(this_month, r_day);
    new_next := case
      when r_paid is distinct from to_char(this_month, 'YYYY-MM') and this_charge > now() then this_charge
      else public.monthly_charge_time(this_month + interval '1 month', r_day)
    end;
  end if;

  update public.recurring_donations
     set status = p_status::public.recurring_status,
         paused_at = case p_status when 'paused' then now() when 'active' then null else paused_at end,
         cancelled_at = case p_status when 'cancelled' then now() else cancelled_at end,
         authorization_encrypted = case p_status when 'cancelled' then null else authorization_encrypted end,
         -- Removing a stopped one keeps the real reason ("the card was declined ...") for the record.
         ended_reason = case when p_status = 'cancelled' and cur <> 'failed' then 'cancelled by the donor' else ended_reason end,
         next_charge_at = case when p_status = 'active' then new_next else next_charge_at end,
         -- A resumed donation gets the full number of tries again.
         attempt_period = case when p_status = 'active' then null else attempt_period end,
         failed_attempts = case when p_status = 'active' then 0 else failed_attempts end,
         needs_gateway_sync = false
   where id = p_id;
end $function$
;

revoke execute on function public.set_my_recurring_status(uuid, text) from public, anon;
grant execute on function public.set_my_recurring_status(uuid, text) to authenticated;

-- Functions made later are not callable by signed-in users unless granted (Supabase grants them by default).
alter default privileges for role postgres in schema public revoke execute on functions from authenticated;

-- s18A approval and the receipting mandate are set only by the server (approval, or setting up receipts
-- later, with their checks and audit log). The browser grant from 20261015000004 no longer includes them.
revoke update (is_s18a, s18a_confirmed_at, mandate_signed_at, mandate_document_path) on public.charities from authenticated;
