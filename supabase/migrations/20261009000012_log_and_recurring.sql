-- Giving made elsewhere, and pausing or cancelling a monthly donation, from the app.

-- ---------------------------------------------------------------------------
-- 1. "Given elsewhere" entries (cash, shul appeals, other charities) carry the
--    donor's own maaser / chomesh / tzedaka choice, like every other donation.
-- ---------------------------------------------------------------------------
alter table public.external_giving_entries add column kind text not null default 'tzedaka';
alter table public.external_giving_entries alter column kind drop default;
alter table public.external_giving_entries
  add constraint external_giving_kind check (kind in ('maaser', 'chomesh', 'tzedaka')),
  add constraint external_giving_recipient_length check (char_length(recipient_text) between 1 and 120),
  add constraint external_giving_date check (entry_date >= date '2000-01-01');

-- ---------------------------------------------------------------------------
-- 2. Monthly donations: the donor pauses, resumes or cancels their own.
--
--    The change is saved at once, and `needs_gateway_sync` stays true until the
--    server has told the payment provider (the provider, not us, takes monthly
--    payments, so saving it here alone does not stop them). The app shows the
--    request as "waiting" until then.
-- ---------------------------------------------------------------------------
alter table public.recurring_donations add column needs_gateway_sync boolean not null default false;

create or replace function public.set_my_recurring_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  cur public.recurring_status;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if p_status not in ('active', 'paused', 'cancelled') then raise exception 'Unknown status'; end if;

  select r.status into cur
  from public.recurring_donations r
  join public.donors d on d.id = r.donor_id
  where r.id = p_id and d.user_id = uid
  for update of r;
  if not found then raise exception 'Monthly donation not found'; end if;

  if cur::text = p_status then return; end if;
  if not (
       (cur = 'active' and p_status in ('paused', 'cancelled'))
    or (cur = 'paused' and p_status in ('active', 'cancelled'))
  ) then
    raise exception 'A % monthly donation cannot be set to %', cur, p_status;
  end if;

  update public.recurring_donations
     set status = p_status::public.recurring_status,
         paused_at = case p_status when 'paused' then now() when 'active' then null else paused_at end,
         cancelled_at = case p_status when 'cancelled' then now() else cancelled_at end,
         needs_gateway_sync = true
   where id = p_id;
end $$;
revoke execute on function public.set_my_recurring_status(uuid, text) from public, anon;
grant execute on function public.set_my_recurring_status(uuid, text) to authenticated;
