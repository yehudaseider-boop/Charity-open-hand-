-- Givezy: campaigns go live (16/10/2026, Yehuda: "virtual envelopes" with a goal, as in Givelify).
--
-- The campaigns table has been in the schema since the start, with no screens. A charity now runs a
-- campaign ("Pesach food parcels") with a goal in Rand; donors give to it from the app and everyone
-- sees how close it is. The money goes to the charity like any other donation: the campaign is a
-- label on the donation plus a public running total.

-- 1. Sensible limits on what a charity writes.
alter table public.campaigns
  add constraint campaign_title_length check (char_length(btrim(title)) between 3 and 80),
  add constraint campaign_description_length check (description is null or char_length(description) <= 500),
  add constraint campaign_slug_shape check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  add constraint campaign_target_limit check (target_cents is null or target_cents <= 100000000000),
  -- So a donation can point at (campaign, charity) together.
  add constraint campaigns_id_charity unique (id, charity_id);

-- 2. A gift can only be for the same charity's campaign.
alter table public.donations
  add constraint donations_campaign_same_charity foreign key (campaign_id, charity_id)
  references public.campaigns (id, charity_id);
create index if not exists donations_campaign on public.donations (campaign_id) where campaign_id is not null;

-- 3. At most 3 active campaigns per charity, so donors aren't spread thin.
create function public.limit_active_campaigns() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'active' or (tg_op = 'UPDATE' and old.status = 'active') then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('campaigns:' || new.charity_id::text));
  if (select count(*) from public.campaigns where charity_id = new.charity_id and status = 'active' and id <> new.id) >= 3 then
    raise exception 'A charity can run up to 3 campaigns at a time' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke execute on function public.limit_active_campaigns() from public, anon, authenticated;
create trigger campaigns_active_limit before insert or update of status on public.campaigns
  for each row execute function public.limit_active_campaigns();

-- 4. The public running total: paid gifts to the campaign (the gift only, never the contribution to
-- Givezy) and how many. Refunded or charged-back gifts drop out. Only for campaigns the caller may see.
create function public.campaign_progress(p_campaign_ids uuid[])
returns table (campaign_id uuid, raised_cents bigint, gift_count bigint)
language sql stable security definer set search_path = '' as $$
  select c.id,
         coalesce(sum(d.amount_cents) filter (where d.status = 'paid'), 0)::bigint,
         count(d.id) filter (where d.status = 'paid')
    from public.campaigns c
    join public.charities ch on ch.id = c.charity_id
    left join public.donations d on d.campaign_id = c.id
   where c.id = any (p_campaign_ids)
     and ((c.status <> 'draft' and ch.status = 'approved') or public.is_charity_admin(c.charity_id) or public.is_platform_admin())
   group by c.id
$$;
revoke execute on function public.campaign_progress(uuid[]) from public;
grant execute on function public.campaign_progress(uuid[]) to anon, authenticated;
