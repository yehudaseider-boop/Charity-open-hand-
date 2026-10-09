-- Real photos and short updates from charities (09/10/2026).
--
-- A charity's own admins add photos (with a short caption) and post updates
-- such as "This month we delivered 140 parcels". Both are public once the
-- charity is approved, and show on its page on the website and in the app.
-- Who posted an update is kept for NEDIV lev, never shown to the public.
-- Files live in the public bucket under <charity_id>/photos/ and
-- <charity_id>/updates/, which only that charity's admins can write to.

create table public.charity_photos (
  id uuid primary key default gen_random_uuid(),
  charity_id uuid not null references public.charities (id) on delete cascade,
  storage_path text not null
    check (storage_path like charity_id::text || '/photos/%' and storage_path not like '%..%'),
  caption_en text check (char_length(caption_en) <= 120),
  created_at timestamptz not null default now()
);
create index charity_photos_charity on public.charity_photos (charity_id, created_at);

create table public.charity_updates (
  id uuid primary key default gen_random_uuid(),
  charity_id uuid not null references public.charities (id) on delete cascade,
  body_en text not null check (char_length(btrim(body_en)) between 1 and 500),
  photo_path text
    check (photo_path is null or (photo_path like charity_id::text || '/updates/%' and photo_path not like '%..%')),
  posted_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index charity_updates_charity on public.charity_updates (charity_id, created_at desc);

alter table public.charity_photos enable row level security;
alter table public.charity_updates enable row level security;

-- Columns: the public never sees who posted. Nothing is edited in place:
-- a charity removes a photo or update and adds a new one.
revoke all on public.charity_photos, public.charity_updates from anon, authenticated;
grant select on public.charity_photos to anon, authenticated;
grant insert (charity_id, storage_path, caption_en), delete on public.charity_photos to authenticated;
grant select (id, charity_id, body_en, photo_path, created_at) on public.charity_updates to anon, authenticated;
grant insert (charity_id, body_en, photo_path), delete on public.charity_updates to authenticated;

create policy charity_photos_read on public.charity_photos for select to anon, authenticated
  using (exists (select 1 from public.charities c where c.id = charity_id and c.status = 'approved')
         or public.is_charity_admin(charity_id) or public.is_platform_admin());
create policy charity_photos_add on public.charity_photos for insert to authenticated
  with check (public.is_charity_admin(charity_id) or public.is_platform_admin());
create policy charity_photos_remove on public.charity_photos for delete to authenticated
  using (public.is_charity_admin(charity_id) or public.is_platform_admin());

create policy charity_updates_read on public.charity_updates for select to anon, authenticated
  using (exists (select 1 from public.charities c where c.id = charity_id and c.status = 'approved')
         or public.is_charity_admin(charity_id) or public.is_platform_admin());
create policy charity_updates_add on public.charity_updates for insert to authenticated
  with check ((public.is_charity_admin(charity_id) or public.is_platform_admin()) and posted_by = auth.uid());
create policy charity_updates_remove on public.charity_updates for delete to authenticated
  using (public.is_charity_admin(charity_id) or public.is_platform_admin());

-- At most 12 photos per charity, so a page stays quick to load.
create function public.limit_charity_photos() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('charity_photos:' || new.charity_id::text));
  if (select count(*) from public.charity_photos where charity_id = new.charity_id) >= 12 then
    raise exception 'A charity can have up to 12 photos' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke execute on function public.limit_charity_photos() from public, anon, authenticated;
create trigger charity_photos_limit before insert on public.charity_photos
  for each row execute function public.limit_charity_photos();
