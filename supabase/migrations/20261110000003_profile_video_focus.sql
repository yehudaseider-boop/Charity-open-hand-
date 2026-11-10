-- Givezy: a charity's profile video and its own focus (CRM build plan steps 12 and 13, 10/11/2026).
--
-- 1. Profile video (decided by Yehuda 09/11/2026: a link first, no uploads). The charity pastes a YouTube or
--    Vimeo link; the server reads it and keeps only which site it is on and the video's id. No link, no HTML.
--    The checks below mean nothing else can ever be stored, whoever writes the row.
alter table public.charities
  add column video_provider text constraint charity_video_provider check (video_provider in ('youtube', 'vimeo')),
  add column video_id text,
  add constraint charity_video_all_or_none check ((video_provider is null) = (video_id is null)),
  add constraint charity_video_id_shape check (
    video_id is null
    or (video_provider = 'youtube' and video_id ~ '^[A-Za-z0-9_-]{11}$')
    or (video_provider = 'vimeo' and video_id ~ '^[1-9][0-9]{0,11}$')
  );
-- Public like the rest of the profile (row-level security still only shows approved charities), and edited by
-- the charity's own admins like the rest of the profile (charities_admin_update).
grant select (video_provider, video_id) on public.charities to anon, authenticated;
grant update (video_provider, video_id) on public.charities to authenticated;

-- 2. The charity's own focus ("What we're focused on right now"): one at a time, a short title and message,
--    shown between two Johannesburg dates, optionally pointing at one of its own campaigns. Outside the dates it
--    simply doesn't show. Nothing here sends a notification, and Givezy's own "cause of the week"
--    (featured_charities) is separate and unchanged.
create table public.charity_focus (
  -- One per charity.
  charity_id uuid primary key references public.charities (id) on delete cascade,
  campaign_id uuid,
  title text not null constraint charity_focus_title check (char_length(btrim(title)) between 3 and 80 and title = btrim(title)),
  message text not null constraint charity_focus_message check (char_length(btrim(message)) between 1 and 200 and char_length(message) <= 200),
  -- First and last day it shows, on the Johannesburg calendar, both included.
  starts_on date not null,
  ends_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint charity_focus_end_after_start check (ends_on > starts_on),
  -- At most 62 days, counting the first and the last.
  constraint charity_focus_length check (ends_on - starts_on <= 61),
  -- Only the same charity's campaign. If that campaign is removed, the focus stays, without it.
  constraint charity_focus_campaign foreign key (campaign_id, charity_id)
    references public.campaigns (id, charity_id) on delete set null (campaign_id)
);

alter table public.charity_focus enable row level security;
-- Reading only. Writes come from the server (service role), after it has checked the signed-in person manages
-- this charity, so there are no insert, update or delete policies or grants.
revoke all on public.charity_focus from anon, authenticated;
-- Not updated_by or the timestamps: who at Givezy or the charity last edited it is not public.
grant select (charity_id, campaign_id, title, message, starts_on, ends_on) on public.charity_focus to anon, authenticated;

-- The public sees a focus only while it is showing, and only for an approved charity.
create policy charity_focus_public_read on public.charity_focus for select to anon, authenticated
  using (
    (now() at time zone 'Africa/Johannesburg')::date between starts_on and ends_on
    and exists (select 1 from public.charities c where c.id = charity_id and c.status = 'approved')
  );
-- The charity's own admins (and Givezy) also see one that is scheduled or over.
create policy charity_focus_admin_read on public.charity_focus for select to authenticated
  using (public.is_charity_admin(charity_id) or public.is_platform_admin());
