-- Givezy: a video on a charity update (CRM build plan step 14, 10/11/2026).
--
-- Decided by Yehuda 10/11/2026: links only, YouTube or Vimeo, no uploads. The same rules as the profile video
-- (20261110000003): the server reads the pasted link and keeps only which site it is on and the video's id, never
-- the link and never any HTML. The checks below mean nothing else can ever be stored, whoever writes the row.
alter table public.charity_updates
  add column video_provider text constraint charity_update_video_provider check (video_provider in ('youtube', 'vimeo')),
  add column video_id text,
  add constraint charity_update_video_all_or_none check ((video_provider is null) = (video_id is null)),
  add constraint charity_update_video_id_shape check (
    video_id is null
    or (video_provider = 'youtube' and video_id ~ '^[A-Za-z0-9_-]{11}$')
    or (video_provider = 'vimeo' and video_id ~ '^[1-9][0-9]{0,11}$')
  );

-- Read like the rest of an update (row-level security still shows updates of approved charities to the public,
-- and to the charity's own team), and added with the update by the page roles (charity_updates_add, team roles).
-- Updates are never edited in place: the charity removes one and posts a new one.
grant select (video_provider, video_id) on public.charity_updates to anon, authenticated;
grant insert (video_provider, video_id) on public.charity_updates to authenticated;
