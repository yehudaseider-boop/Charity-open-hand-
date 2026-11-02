-- Two follow-ups from the CRM check of 02/11/2026.
--
-- 1. Profile emails caught up. The trigger in 20261102000001 keeps a profile's email in step with the sign-in email
--    from now on; anyone who changed their sign-in email before that still has the old one on their profile, so they
--    can't be added to a charity's team. Copy today's sign-in email onto every profile that differs.
-- 2. Which confirmation an import was made under. The person importing a donor list ticks a box saying these people
--    gave the charity their details. The wording of that box may change; each import now records the version it was
--    ticked under (`confirmation_version`, dated like 'contacts-2026-11-02'), so we can always say what was agreed.

-- 1 ---------------------------------------------------------------------------------------------------------
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id and u.email is not null and p.email is distinct from u.email;

-- 2 ---------------------------------------------------------------------------------------------------------
-- Imports made before this change were all under the first wording, so they take its version.
alter table public.charity_contact_imports
  add column confirmation_version text not null default 'contacts-2026-11-02'
  constraint contact_import_confirmation check (char_length(confirmation_version) between 1 and 40);
alter table public.charity_contact_imports alter column confirmation_version drop default;

-- Same as 20261102000002, plus the confirmation version from p_import.
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
  insert into public.charity_contact_imports (charity_id, file_name, file_fingerprint, contacts, created_by, confirmed_at, confirmation_version)
  values (p_charity_id, p_import->>'file_name', p_import->>'file_fingerprint', jsonb_array_length(p_contacts), p_user_id, (p_import->>'confirmed_at')::timestamptz, p_import->>'confirmation_version')
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
