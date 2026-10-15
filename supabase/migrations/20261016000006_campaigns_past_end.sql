-- A campaign past its last day counts as ended: it no longer takes one of the 3 places, so the
-- charity can start a new one without ending the old one by hand.
create or replace function public.limit_active_campaigns() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'active' or (tg_op = 'UPDATE' and old.status = 'active') then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('campaigns:' || new.charity_id::text));
  if (select count(*) from public.campaigns
      where charity_id = new.charity_id and status = 'active' and id <> new.id
        and (ends_at is null or ends_at >= now())) >= 3 then
    raise exception 'A charity can run up to 3 campaigns at a time' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke execute on function public.limit_active_campaigns() from public, anon, authenticated;
