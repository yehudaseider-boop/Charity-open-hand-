-- Givezy: invite a charity (16/10/2026, Yehuda). A platform admin types the charity's name and a
-- contact email; the charity gets a link that starts its application with the name filled in.
-- Only the SHA-256 hash of the link's secret is stored. Server-only: no browser can read or write it.

create table public.charity_invites (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  charity_name text not null check (char_length(btrim(charity_name)) between 2 and 120),
  contact_email text not null check (char_length(contact_email) <= 254 and contact_email like '%@%'),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  used_at timestamptz,
  used_by uuid references auth.users (id) on delete set null,
  charity_id uuid references public.charities (id) on delete set null
);
create index charity_invites_created on public.charity_invites (created_at desc);

alter table public.charity_invites enable row level security;
revoke all on public.charity_invites from anon, authenticated;
-- Platform admins can see the list (who was invited, and whether they started); nobody writes from a browser.
grant select on public.charity_invites to authenticated;
create policy charity_invites_admin_read on public.charity_invites for select to authenticated
  using (public.is_platform_admin());
