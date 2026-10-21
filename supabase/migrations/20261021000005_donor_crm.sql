-- Donor care for charities (21/10/2026, Yehuda, for the Angel Network): notes about a donor, follow-up
-- reminders, the charity's own tags, saved donor lists (segments), and how long without a gift makes a
-- donor "lapsed" for this charity. Each belongs to one charity and is about a donor who gave to it.
-- Server-only: the website reads and writes these with the service role after checking the person
-- manages the charity. Donors never see them; an erased donor's rows are removed (src/lib/privacy/erase.ts).

create table public.charity_donor_notes (
  id uuid primary key default gen_random_uuid(),
  charity_id uuid not null references public.charities (id) on delete cascade,
  donor_id uuid not null references public.donors (id) on delete cascade,
  body text not null constraint donor_note_body check (char_length(body) between 1 and 2000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index charity_donor_notes_donor on public.charity_donor_notes (charity_id, donor_id, created_at desc);

create table public.charity_donor_reminders (
  id uuid primary key default gen_random_uuid(),
  charity_id uuid not null references public.charities (id) on delete cascade,
  donor_id uuid not null references public.donors (id) on delete cascade,
  due_on date not null,
  what text not null constraint donor_reminder_what check (char_length(what) between 1 and 300),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  done_at timestamptz,
  done_by uuid references auth.users (id) on delete set null
);
create index charity_donor_reminders_due on public.charity_donor_reminders (charity_id, due_on) where done_at is null;
create index charity_donor_reminders_donor on public.charity_donor_reminders (charity_id, donor_id);

create table public.charity_tags (
  id uuid primary key default gen_random_uuid(),
  charity_id uuid not null references public.charities (id) on delete cascade,
  name text not null constraint charity_tag_name check (char_length(name) between 1 and 40),
  created_at timestamptz not null default now()
);
create unique index charity_tags_name on public.charity_tags (charity_id, lower(name));

create table public.charity_donor_tags (
  tag_id uuid not null references public.charity_tags (id) on delete cascade,
  charity_id uuid not null references public.charities (id) on delete cascade,
  donor_id uuid not null references public.donors (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (tag_id, donor_id)
);
create index charity_donor_tags_donor on public.charity_donor_tags (charity_id, donor_id);

create table public.charity_segments (
  id uuid primary key default gen_random_uuid(),
  charity_id uuid not null references public.charities (id) on delete cascade,
  name text not null constraint charity_segment_name check (char_length(name) between 1 and 60),
  -- What the list shows: {group?, tag?, q?}. Checked by the website before it is kept.
  filters jsonb not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index charity_segments_name on public.charity_segments (charity_id, lower(name));

create table public.charity_donor_settings (
  charity_id uuid primary key references public.charities (id) on delete cascade,
  -- No gift for this many days makes a donor "lapsed". Givezy's default is 180.
  lapsed_after_days int not null constraint donor_settings_lapsed check (lapsed_after_days between 30 and 730),
  updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['charity_donor_notes', 'charity_donor_reminders', 'charity_tags', 'charity_donor_tags', 'charity_segments', 'charity_donor_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('create policy no_password_sessions on public.%I as restrictive for all to authenticated using (public.signed_in_without_password()) with check (public.signed_in_without_password())', t);
  end loop;
end $$;
