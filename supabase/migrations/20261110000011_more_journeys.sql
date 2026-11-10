-- Givezy: campaign journeys and the win-back journey (CRM build plan steps 6b and 7; built 10/11/2026).
--
-- Until now a charity had one donor journey (20261110000007). Decided by Yehuda 10/11/2026 ("do this"):
--   * campaign journeys: giving to one of the charity's campaigns puts the donor on that campaign's own emails
--     (from when that journey is switched on; donors who gave to the campaign before then are not added);
--   * win-back: the charity's owner can add donors from the stopped monthly donors list and the keeping-donors lists
--     ("gave last year, not since", "gave in an earlier year, not since") to a win-back journey, asked first. A donor
--     who gives again while on it leaves it ('gave_again').
-- The rules of 6a stay: up to five emails, no typed links, one message a week per donor per charity across every
-- journey and every other message (the week's claim in charity_donor_thanks, kind 'journey').
--
-- So each journey gets its own id and a kind: 'general' (one per charity, the existing journey), 'campaign' (one per
-- campaign, only the charity's own) and 'winback' (one per charity). Steps and enrolments belong to a journey; a donor
-- is on each journey at most once (and may be on several). Existing journeys, steps, enrolments and the send log are
-- kept: each existing row becomes the charity's general journey.
--
-- Still server-only, as before: row-level security on, no policies, nothing granted, never a password session.

-- 1. Journeys: an id, a kind, and for a campaign journey the campaign (the charity's own).
alter table public.charity_journeys add column id uuid not null default gen_random_uuid();
alter table public.charity_journeys add column kind text not null default 'general'
  constraint charity_journey_kind check (kind in ('general', 'campaign', 'winback'));
alter table public.charity_journeys add column campaign_id uuid;
alter table public.charity_journeys add constraint charity_journey_campaign check ((kind = 'campaign') = (campaign_id is not null));
-- Only one of the charity's own campaigns. A campaign with a journey can't be deleted (its emails, who was on it and
-- what was sent are kept): the website ends a campaign instead, and removes an empty journey itself before removing a
-- campaign nobody gave to. "No action" (checked at the end of the statement) so that removing a whole charity, which
-- removes its campaigns and its journeys together, still works.
alter table public.charity_journeys add constraint charity_journey_own_campaign
  foreign key (campaign_id, charity_id) references public.campaigns (id, charity_id) on delete no action;

-- The other tables pointed at the journey by charity; from now they point at the charity itself and at the journey.
alter table public.charity_journey_steps drop constraint charity_journey_steps_charity_id_fkey;
alter table public.charity_journey_enrolments drop constraint charity_journey_enrolments_charity_id_fkey;
alter table public.charity_journey_sends drop constraint charity_journey_sends_charity_id_fkey;
alter table public.charity_journeys drop constraint charity_journeys_pkey;
alter table public.charity_journeys add constraint charity_journeys_pkey primary key (id);
create unique index charity_journeys_one_general on public.charity_journeys (charity_id) where kind = 'general';
create unique index charity_journeys_one_winback on public.charity_journeys (charity_id) where kind = 'winback';
create unique index charity_journeys_one_per_campaign on public.charity_journeys (campaign_id) where kind = 'campaign';
alter table public.charity_journey_steps add constraint charity_journey_steps_charity_id_fkey
  foreign key (charity_id) references public.charities (id) on delete cascade;
alter table public.charity_journey_enrolments add constraint charity_journey_enrolments_charity_id_fkey
  foreign key (charity_id) references public.charities (id) on delete cascade;
alter table public.charity_journey_sends add constraint charity_journey_sends_charity_id_fkey
  foreign key (charity_id) references public.charities (id) on delete cascade;

-- 2. Steps belong to a journey: the existing ones to the charity's general journey.
alter table public.charity_journey_steps add column journey_id uuid;
update public.charity_journey_steps s set journey_id = j.id from public.charity_journeys j where j.charity_id = s.charity_id and j.kind = 'general';
alter table public.charity_journey_steps alter column journey_id set not null;
alter table public.charity_journey_steps add constraint charity_journey_steps_journey_id_fkey
  foreign key (journey_id) references public.charity_journeys (id) on delete cascade;
alter table public.charity_journey_steps drop constraint charity_journey_steps_pkey;
alter table public.charity_journey_steps add constraint charity_journey_steps_pkey primary key (journey_id, position);

-- 3. Enrolments belong to a journey; a donor is on each journey once. A win-back donor who gives again leaves it.
alter table public.charity_journey_enrolments add column journey_id uuid;
update public.charity_journey_enrolments e set journey_id = j.id from public.charity_journeys j where j.charity_id = e.charity_id and j.kind = 'general';
alter table public.charity_journey_enrolments alter column journey_id set not null;
alter table public.charity_journey_enrolments add constraint charity_journey_enrolments_journey_id_fkey
  foreign key (journey_id) references public.charity_journeys (id) on delete cascade;
alter table public.charity_journey_enrolments drop constraint journey_enrolment_once;
alter table public.charity_journey_enrolments add constraint journey_enrolment_once unique (journey_id, donor_id);
alter table public.charity_journey_enrolments drop constraint journey_enrolment_source;
alter table public.charity_journey_enrolments add constraint journey_enrolment_source check (source in ('new_gift', 'existing', 'winback'));
alter table public.charity_journey_enrolments drop constraint journey_enrolment_stopped_reason;
alter table public.charity_journey_enrolments add constraint journey_enrolment_stopped_reason
  check (stopped_reason in ('erased', 'opted_out', 'no_email', 'no_gift', 'not_delivered', 'gave_again'));
create index charity_journey_enrolments_journey on public.charity_journey_enrolments (journey_id, status, next_step);

-- A row written the old way (by charity only, as the website did before this change) belongs to the charity's general
-- journey, so nothing written during the switch-over is lost.
create function public.journey_row_default() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.journey_id is null then
    select j.id into new.journey_id from public.charity_journeys j where j.charity_id = new.charity_id and j.kind = 'general';
  end if;
  return new;
end $$;
revoke all on function public.journey_row_default() from public, anon, authenticated;
create trigger charity_journey_steps_default before insert on public.charity_journey_steps
  for each row execute function public.journey_row_default();
create trigger charity_journey_enrolments_default before insert on public.charity_journey_enrolments
  for each row execute function public.journey_row_default();

-- A step and an enrolment belong to a journey of their own charity.
create function public.journey_row_same_charity() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.charity_journeys j where j.id = new.journey_id and j.charity_id = new.charity_id) then
    raise exception 'journey_other_charity: a journey belongs to one charity';
  end if;
  return new;
end $$;
revoke all on function public.journey_row_same_charity() from public, anon, authenticated;
create trigger charity_journey_steps_same_charity before insert or update on public.charity_journey_steps
  for each row execute function public.journey_row_same_charity();
create trigger charity_journey_enrolments_same_charity before insert or update on public.charity_journey_enrolments
  for each row execute function public.journey_row_same_charity();

-- 4. Saving the general journey keeps working as before (one transaction, never half a save).
create or replace function public.save_charity_journey(p_charity_id uuid, p_enabled boolean, p_switched_on_at timestamptz, p_steps jsonb, p_user uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare n int := coalesce(jsonb_array_length(p_steps), 0); v_id uuid;
begin
  if n > 5 then raise exception 'journey_too_many_steps'; end if;
  insert into public.charity_journeys (charity_id, kind, enabled, switched_on_at, updated_at, updated_by)
  values (p_charity_id, 'general', p_enabled and n > 0, p_switched_on_at, now(), p_user)
  on conflict (charity_id) where kind = 'general' do update
    set enabled = excluded.enabled, switched_on_at = excluded.switched_on_at, updated_at = excluded.updated_at, updated_by = excluded.updated_by
  returning id into v_id;
  delete from public.charity_journey_steps where journey_id = v_id;
  insert into public.charity_journey_steps (journey_id, charity_id, position, subject, body, wait_days)
  select v_id, p_charity_id, s.ord::int, s.value->>'subject', s.value->>'body', (s.value->>'waitDays')::int
  from jsonb_array_elements(p_steps) with ordinality as s(value, ord);
end $$;
revoke all on function public.save_charity_journey(uuid, boolean, timestamptz, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.save_charity_journey(uuid, boolean, timestamptz, jsonb, uuid) to service_role;

-- 5. Saving any journey (general, a campaign's or win-back) in one transaction. Returns its id.
create function public.save_journey(p_charity_id uuid, p_kind text, p_campaign_id uuid, p_enabled boolean, p_switched_on_at timestamptz, p_steps jsonb, p_user uuid)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare n int := coalesce(jsonb_array_length(p_steps), 0); v_id uuid;
begin
  if n > 5 then raise exception 'journey_too_many_steps'; end if;
  if p_kind not in ('general', 'campaign', 'winback') then raise exception 'journey_kind'; end if;
  select j.id into v_id from public.charity_journeys j
    where j.charity_id = p_charity_id and j.kind = p_kind and (p_kind <> 'campaign' or j.campaign_id = p_campaign_id)
    for update;
  if v_id is null then
    insert into public.charity_journeys (charity_id, kind, campaign_id, enabled, switched_on_at, updated_at, updated_by)
    values (p_charity_id, p_kind, case when p_kind = 'campaign' then p_campaign_id end, p_enabled and n > 0, p_switched_on_at, now(), p_user)
    returning id into v_id;
  else
    update public.charity_journeys set enabled = p_enabled and n > 0, switched_on_at = p_switched_on_at, updated_at = now(), updated_by = p_user where id = v_id;
  end if;
  delete from public.charity_journey_steps where journey_id = v_id;
  insert into public.charity_journey_steps (journey_id, charity_id, position, subject, body, wait_days)
  select v_id, p_charity_id, s.ord::int, s.value->>'subject', s.value->>'body', (s.value->>'waitDays')::int
  from jsonb_array_elements(p_steps) with ordinality as s(value, ord);
  return v_id;
end $$;
revoke all on function public.save_journey(uuid, text, uuid, boolean, timestamptz, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.save_journey(uuid, text, uuid, boolean, timestamptz, jsonb, uuid) to service_role;
