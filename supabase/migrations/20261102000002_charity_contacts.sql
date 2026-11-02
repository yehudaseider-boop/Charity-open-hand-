-- A charity's own donor list, brought in from a CSV file (02/11/2026). These people have not given through
-- Givezy, so they are the charity's contacts, not Givezy donors: they are never added to public.donors,
-- never seen by another charity, and Givezy never emails them (no appeals, no thank-yous, no Email donors).
-- If someone on the list later gives through Givezy, the gift-based donor and the contact both show on the
-- charity's donors list; they are not merged.
--
-- One import is one file, all or nothing, and can be removed as a whole (Undo for 30 minutes, then
-- "Remove" on the import page). Tags use the charity's own tags (charity_tags), so filtering by a tag
-- shows donors and contacts alike; tags an import made are removed with it when nothing else uses them.
--
-- Charity admins of that charity (with their second step) can read these rows; only the server writes them.

create table public.charity_contact_imports (
  id uuid primary key default gen_random_uuid(),
  charity_id uuid not null references public.charities (id) on delete cascade,
  file_name text not null constraint contact_import_file check (char_length(file_name) between 1 and 200),
  file_fingerprint text not null constraint contact_import_fingerprint check (file_fingerprint ~ '^[0-9a-f]{32}$'),
  contacts int not null constraint contact_import_contacts check (contacts between 1 and 1000),
  -- Tags this import made, removed again with it when no donor or contact uses them any more.
  created_tag_ids uuid[] not null default '{}',
  created_by uuid references auth.users (id) on delete set null,
  -- The person importing confirmed these people gave the charity their details.
  confirmed_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint charity_contact_imports_once unique (charity_id, file_fingerprint),
  constraint charity_contact_imports_id_charity unique (id, charity_id)
);
create index charity_contact_imports_charity on public.charity_contact_imports (charity_id, created_at desc);

create table public.charity_contacts (
  id uuid primary key default gen_random_uuid(),
  charity_id uuid not null references public.charities (id) on delete cascade,
  import_id uuid not null,
  first_name text constraint contact_first_name check (char_length(first_name) between 1 and 80),
  last_name text constraint contact_last_name check (char_length(last_name) between 1 and 80),
  organisation_name text constraint contact_organisation check (char_length(organisation_name) between 1 and 200),
  email text constraint contact_email check (email = lower(email) and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' and char_length(email) <= 254),
  phone text constraint contact_phone check (phone ~ '^(\+27|0)\d{9}$'),
  address_line1 text constraint contact_address1 check (char_length(address_line1) between 1 and 200),
  address_line2 text constraint contact_address2 check (char_length(address_line2) between 1 and 200),
  suburb text constraint contact_suburb check (char_length(suburb) between 1 and 80),
  city text constraint contact_city check (char_length(city) between 1 and 80),
  postal_code text constraint contact_postal_code check (postal_code ~ '^\d{4}$'),
  note text constraint contact_note check (char_length(note) between 1 and 2000),
  created_at timestamptz not null default now(),
  constraint contact_has_name check (coalesce(first_name, last_name, organisation_name) is not null),
  constraint charity_contacts_id_charity unique (id, charity_id),
  -- The import belongs to the same charity: a row can never cross two charities.
  constraint charity_contacts_import foreign key (import_id, charity_id) references public.charity_contact_imports (id, charity_id) on delete cascade
);
create index charity_contacts_charity on public.charity_contacts (charity_id, created_at desc);
create index charity_contacts_import on public.charity_contacts (import_id);
-- One contact per email per charity, so the same person isn't imported twice.
create unique index charity_contacts_email on public.charity_contacts (charity_id, email) where email is not null;

create table public.charity_contact_tags (
  tag_id uuid not null references public.charity_tags (id) on delete cascade,
  charity_id uuid not null,
  contact_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (tag_id, contact_id),
  constraint charity_contact_tags_contact foreign key (contact_id, charity_id) references public.charity_contacts (id, charity_id) on delete cascade
);
create index charity_contact_tags_contact on public.charity_contact_tags (charity_id, contact_id);

-- The tag must be the same charity's.
create or replace function public.contact_tag_same_charity() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.charity_tags t where t.id = new.tag_id and t.charity_id = new.charity_id) then
    raise exception 'That tag belongs to another charity';
  end if;
  return new;
end $$;
revoke all on function public.contact_tag_same_charity() from public, anon, authenticated;
create trigger contact_tag_same_charity before insert or update on public.charity_contact_tags
  for each row execute function public.contact_tag_same_charity();

-- Row-level security: the charity's own admins read; nobody writes from a browser.
do $$
declare t text;
begin
  foreach t in array array['charity_contact_imports', 'charity_contacts', 'charity_contact_tags'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy charity_admins_read on public.%I for select to authenticated using (public.is_charity_admin(charity_id))', t);
    execute format('create policy no_password_sessions on public.%I as restrictive for all to authenticated using (public.signed_in_without_password()) with check (public.signed_in_without_password())', t);
  end loop;
end $$;

-- Import one file in one transaction: the import, its contacts and their tags, or nothing at all.
-- p_contacts: [{first_name, last_name, organisation_name, email, phone, address_line1, address_line2, suburb,
-- city, postal_code, note, tags: [name, ...]}], already checked by the website.
create or replace function public.import_charity_contacts(p_charity_id uuid, p_user_id uuid, p_import jsonb, p_contacts jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c jsonb;
  v_import uuid;
  v_contact uuid;
  v_tag uuid;
  v_name text;
  v_created uuid[] := '{}';
  v_count int := 0;
begin
  if not exists (select 1 from public.charities where id = p_charity_id and status = 'approved') then
    raise exception 'Only an approved charity can import donors';
  end if;
  if jsonb_typeof(p_contacts) <> 'array' or jsonb_array_length(p_contacts) = 0 then
    raise exception 'No contacts to import';
  end if;
  insert into public.charity_contact_imports (charity_id, file_name, file_fingerprint, contacts, created_by, confirmed_at)
  values (p_charity_id, p_import->>'file_name', p_import->>'file_fingerprint', jsonb_array_length(p_contacts), p_user_id, (p_import->>'confirmed_at')::timestamptz)
  returning id into v_import;

  for c in select * from jsonb_array_elements(p_contacts) loop
    insert into public.charity_contacts (charity_id, import_id, first_name, last_name, organisation_name, email, phone,
                                         address_line1, address_line2, suburb, city, postal_code, note)
    values (p_charity_id, v_import, nullif(c->>'first_name', ''), nullif(c->>'last_name', ''), nullif(c->>'organisation_name', ''),
            nullif(lower(c->>'email'), ''), nullif(c->>'phone', ''), nullif(c->>'address_line1', ''), nullif(c->>'address_line2', ''),
            nullif(c->>'suburb', ''), nullif(c->>'city', ''), nullif(c->>'postal_code', ''), nullif(c->>'note', ''))
    returning id into v_contact;
    v_count := v_count + 1;

    for v_name in select distinct on (lower(x)) x from jsonb_array_elements_text(coalesce(c->'tags', '[]'::jsonb)) x loop
      select id into v_tag from public.charity_tags where charity_id = p_charity_id and lower(name) = lower(v_name);
      if v_tag is null then
        if (select count(*) from public.charity_tags where charity_id = p_charity_id) >= 100 then
          raise exception 'A charity can have up to 100 tags';
        end if;
        insert into public.charity_tags (charity_id, name) values (p_charity_id, v_name) returning id into v_tag;
        v_created := v_created || v_tag;
      end if;
      insert into public.charity_contact_tags (tag_id, charity_id, contact_id) values (v_tag, p_charity_id, v_contact) on conflict do nothing;
      v_tag := null;
    end loop;
  end loop;

  update public.charity_contact_imports set created_tag_ids = v_created where id = v_import;
  return jsonb_build_object('import_id', v_import, 'contacts', v_count);
end $$;
revoke execute on function public.import_charity_contacts(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.import_charity_contacts(uuid, uuid, jsonb, jsonb) to service_role;

-- Remove a whole import: its contacts, their tags, and the tags it made that nothing else uses now.
-- Returns how many contacts were removed (0 when it was already gone).
create or replace function public.remove_charity_contact_import(p_charity_id uuid, p_import_id uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_tags uuid[];
  v_count int;
begin
  select created_tag_ids into v_tags from public.charity_contact_imports where id = p_import_id and charity_id = p_charity_id for update;
  if not found then return 0; end if;
  select count(*) into v_count from public.charity_contacts where import_id = p_import_id and charity_id = p_charity_id;
  delete from public.charity_contact_imports where id = p_import_id and charity_id = p_charity_id;
  delete from public.charity_tags t
  where t.charity_id = p_charity_id and t.id = any (v_tags)
    and not exists (select 1 from public.charity_donor_tags dt where dt.tag_id = t.id)
    and not exists (select 1 from public.charity_contact_tags ct where ct.tag_id = t.id);
  return v_count;
end $$;
revoke execute on function public.remove_charity_contact_import(uuid, uuid) from public, anon, authenticated;
grant execute on function public.remove_charity_contact_import(uuid, uuid) to service_role;
