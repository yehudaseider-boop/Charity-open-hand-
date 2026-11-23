-- Givezy: a picture in a donor journey email (23/11/2026, step 5 of the Donor journeys plan, Yehuda: "Yes, one per
-- email").
--
-- 1. charity_journey_steps gains image_path and image_alt, both empty unless the email has a picture. The picture is a
--    file the website uploaded to the charity's own public folder (charity-public/<charity id>/journey-<uuid>.<ext>,
--    re-encoded without hidden details and made smaller first); image_alt says in a few words what it shows, for people
--    who can't see it. Both or neither; the file name must be one the website made, in this charity's folder.
-- 2. save_charity_journey and save_journey (latest: 20261110000011_more_journeys.sql) save the two with each email.
--    Copied exactly otherwise; an email saved without picture keys (older code) gets none.
--
-- Safe before or after the website code that uses it: the older code never sends picture keys, and the newer code
-- reads emails without the columns until this has run.

alter table public.charity_journey_steps
  add column if not exists image_path text,
  add column if not exists image_alt text;

alter table public.charity_journey_steps drop constraint if exists journey_step_picture;
alter table public.charity_journey_steps
  add constraint journey_step_picture check (
    (image_path is null and image_alt is null)
    or (
      image_path ~ ('^' || charity_id::text || '/journey-[0-9a-f-]{36}\.(jpg|png|webp)$')
      and image_alt = btrim(image_alt)
      and char_length(image_alt) between 3 and 150
      and image_alt !~ '[[:cntrl:]]'
    )
  );

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
  insert into public.charity_journey_steps (journey_id, charity_id, position, subject, body, wait_days, image_path, image_alt)
  select v_id, p_charity_id, s.ord::int, s.value->>'subject', s.value->>'body', (s.value->>'waitDays')::int,
         nullif(s.value->>'imagePath', ''), case when nullif(s.value->>'imagePath', '') is not null then s.value->>'imageAlt' end
  from jsonb_array_elements(p_steps) with ordinality as s(value, ord);
end $$;
revoke all on function public.save_charity_journey(uuid, boolean, timestamptz, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.save_charity_journey(uuid, boolean, timestamptz, jsonb, uuid) to service_role;

create or replace function public.save_journey(p_charity_id uuid, p_kind text, p_campaign_id uuid, p_enabled boolean, p_switched_on_at timestamptz, p_steps jsonb, p_user uuid)
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
  insert into public.charity_journey_steps (journey_id, charity_id, position, subject, body, wait_days, image_path, image_alt)
  select v_id, p_charity_id, s.ord::int, s.value->>'subject', s.value->>'body', (s.value->>'waitDays')::int,
         nullif(s.value->>'imagePath', ''), case when nullif(s.value->>'imagePath', '') is not null then s.value->>'imageAlt' end
  from jsonb_array_elements(p_steps) with ordinality as s(value, ord);
  return v_id;
end $$;
revoke all on function public.save_journey(uuid, text, uuid, boolean, timestamptz, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.save_journey(uuid, text, uuid, boolean, timestamptz, jsonb, uuid) to service_role;
