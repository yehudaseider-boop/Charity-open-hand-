-- Givezy: group challenges (16/10/2026, Yehuda: "giving with friends").
--
-- A signed-in donor starts a challenge for an approved charity ("Our office feeds 50 families",
-- goal R10 000, optional last day) and shares the link. Anyone can give to it. The money goes to the
-- charity like any other donation: the challenge is a label on the donation plus a public total.
-- Givezy and the person who started it never hold money. A challenge goes live at once; the charity
-- is emailed and can stop it with one button. The public sees the total, the goal, how many gifts and
-- how many people gave: never who gave or how much each person gave.

create table public.group_challenges (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    constraint challenge_slug_shape check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 90),
  charity_id uuid not null references public.charities (id) on delete cascade,
  -- Who started it (their account). Cleared if the account is deleted.
  started_by uuid references auth.users (id) on delete set null,
  -- The first name they chose to show, for "Started by Sarah".
  starter_name text not null constraint challenge_starter_name check (char_length(btrim(starter_name)) between 1 and 40),
  title text not null constraint challenge_title_length check (char_length(btrim(title)) between 3 and 80),
  reason text constraint challenge_reason_length check (reason is null or char_length(reason) <= 500),
  target_cents bigint not null constraint challenge_target check (target_cents > 0 and target_cents <= 100000000000),
  ends_at timestamptz,
  status text not null default 'active' constraint challenge_status check (status in ('active', 'stopped')),
  stopped_at timestamptz,
  created_at timestamptz not null default now(),
  constraint group_challenges_id_charity unique (id, charity_id)
);
create index group_challenges_charity on public.group_challenges (charity_id, status);
create index group_challenges_started_by on public.group_challenges (started_by) where started_by is not null;

-- A gift is for at most one campaign or challenge, and only one of the same charity.
alter table public.donations add column challenge_id uuid;
alter table public.donations
  add constraint donations_challenge_same_charity foreign key (challenge_id, charity_id)
    references public.group_challenges (id, charity_id),
  add constraint donations_one_target check (campaign_id is null or challenge_id is null);
create index donations_challenge on public.donations (challenge_id) where challenge_id is not null;

-- Row-level security: the charity's own admins (and platform admins) read their challenges, and the
-- person who started one reads their own. Everyone else goes through challenge_public below, which
-- leaves out who started it. Only the server writes.
alter table public.group_challenges enable row level security;
revoke all on public.group_challenges from anon, authenticated;
grant select on public.group_challenges to authenticated;
create policy challenges_charity_read on public.group_challenges for select to authenticated
  using (public.is_charity_admin(charity_id) or public.is_platform_admin());
create policy challenges_own_read on public.group_challenges for select to authenticated
  using (started_by = (select auth.uid()));
create policy no_password_sessions on public.group_challenges as restrictive for all to authenticated
  using (public.signed_in_without_password()) with check (public.signed_in_without_password());

-- At most 5 running challenges per person, so one account can't flood a charity.
create function public.limit_running_challenges() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if new.started_by is null or new.status <> 'active' then return new; end if;
  perform pg_advisory_xact_lock(hashtext('challenges:' || new.started_by::text));
  if (select count(*) from public.group_challenges
       where started_by = new.started_by and status = 'active' and id <> new.id
         and (ends_at is null or ends_at > now())) >= 5 then
    raise exception 'You can run up to 5 challenges at a time' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke execute on function public.limit_running_challenges() from public, anon, authenticated;
create trigger challenges_running_limit before insert on public.group_challenges
  for each row execute function public.limit_running_challenges();

-- What anyone may see of challenges: by slug (one challenge) or by charity (its running ones). Approved
-- charities only. Totals count paid gifts only (the gift, never the contribution to Givezy); refunded and
-- charged-back gifts drop out. "people" counts different donors, never their names or amounts.
create function public.challenge_public(p_slug text default null, p_charity_id uuid default null)
returns table (
  id uuid, slug text, charity_id uuid, charity_slug text, charity_name text, starter_name text, title text,
  reason text, target_cents bigint, ends_at timestamptz, status text, created_at timestamptz,
  raised_cents bigint, gift_count bigint, people bigint
)
language sql stable security definer set search_path = '' as $$
  select g.id, g.slug, g.charity_id, ch.slug, ch.name_en, g.starter_name, g.title, g.reason, g.target_cents,
         g.ends_at, g.status, g.created_at,
         coalesce(sum(d.amount_cents) filter (where d.status = 'paid'), 0)::bigint,
         count(d.id) filter (where d.status = 'paid'),
         count(distinct d.donor_id) filter (where d.status = 'paid')
    from public.group_challenges g
    join public.charities ch on ch.id = g.charity_id and ch.status = 'approved'
    left join public.donations d on d.challenge_id = g.id
   where (p_slug is not null and g.slug = p_slug)
      or (p_slug is null and p_charity_id is not null and g.charity_id = p_charity_id and g.status = 'active'
          and (g.ends_at is null or g.ends_at > now()))
   group by g.id, ch.slug, ch.name_en
   order by g.created_at desc
   limit 50
$$;
revoke execute on function public.challenge_public(text, uuid) from public;
grant execute on function public.challenge_public(text, uuid) to anon, authenticated;

-- For the charity's dashboard: every challenge for the charity (running, ended or stopped) with totals.
create function public.charity_challenges(p_charity_id uuid)
returns table (
  id uuid, slug text, starter_name text, title text, target_cents bigint, ends_at timestamptz, status text,
  created_at timestamptz, raised_cents bigint, gift_count bigint, people bigint
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_charity_admin(p_charity_id) or public.is_platform_admin()) then
    raise exception 'Not allowed';
  end if;
  return query
    select g.id, g.slug, g.starter_name, g.title, g.target_cents, g.ends_at, g.status, g.created_at,
           coalesce(sum(d.amount_cents) filter (where d.status = 'paid'), 0)::bigint,
           count(d.id) filter (where d.status = 'paid'),
           count(distinct d.donor_id) filter (where d.status = 'paid')
      from public.group_challenges g
      left join public.donations d on d.challenge_id = g.id
     where g.charity_id = p_charity_id
     group by g.id
     order by g.created_at desc
     limit 200;
end $$;
revoke execute on function public.charity_challenges(uuid) from public, anon;
grant execute on function public.charity_challenges(uuid) to authenticated;
