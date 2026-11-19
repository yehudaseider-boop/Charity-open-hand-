-- Security review of 18/11/2026 (the database part). Run AFTER the website code that uploads files from the server
-- (commit "Uploads are made by the server"): with this change a browser can no longer write to storage, so the old
-- code (which uploaded with the signed-in person's own permission) would fail.

-- 1 ---------------------------------------------------------------------------------------------------------
-- No browser writes to storage. Every upload now goes through the website's server, after it has checked who the person
-- is, their role, that the file really is an image or document, re-encoded images (no GPS), the photo limit and the
-- open application. Before, a signed-in team member could upload straight to storage with the database's own API and
-- skip all of that. Reads stay: charity-public is a public bucket (no policy needed); charity-documents is read below.
drop policy if exists charity_public_write on storage.objects;
drop policy if exists charity_documents_insert on storage.objects;
-- A Givezy admin's own read of documents is in charity_documents_read; their uploads and removals are made by the server.
drop policy if exists charity_documents_platform on storage.objects;

-- 2 ---------------------------------------------------------------------------------------------------------
-- A bank letter is private because of what it IS (its record says bank_confirmation), not only what it is named.
-- Security definer on purpose: a role without bank access can't see that record, so a plain lookup would find nothing
-- and let the file through. It answers one yes or no for a path.
create or replace function public.document_is_bank_letter(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_path ~ '^[^/]+/bank_confirmation-'
      or exists (select 1 from public.charity_documents d where d.storage_path = p_path and d.document_type = 'bank_confirmation')
$$;
revoke all on function public.document_is_bank_letter(text) from public, anon;
grant execute on function public.document_is_bank_letter(text) to authenticated;

drop policy if exists charity_documents_read on storage.objects;
create policy charity_documents_read on storage.objects for select to authenticated
  using (bucket_id = 'charity-documents'
         and name !~ '\.\.' and name !~ '^/' and strpos(name, chr(92)) = 0
         and (public.is_platform_admin()
              or (public.is_charity_admin(((storage.foldername(name))[1])::uuid)
                  and (not public.document_is_bank_letter(name)
                       or public.charity_can(((storage.foldername(name))[1])::uuid, 'bank_view')))));

-- 3 ---------------------------------------------------------------------------------------------------------
-- The files donors were imported from, and the tags on those donors, are contact details like the contacts themselves:
-- the 'contact' permission (not a viewer). (Contacts were moved on 10/11/2026; these two were left.)
drop policy if exists charity_admins_read on public.charity_contact_imports;
create policy charity_admins_read on public.charity_contact_imports for select to authenticated
  using (public.charity_can(charity_id, 'contact'));
drop policy if exists charity_admins_read on public.charity_contact_tags;
create policy charity_admins_read on public.charity_contact_tags for select to authenticated
  using (public.charity_can(charity_id, 'contact'));

-- 4 ---------------------------------------------------------------------------------------------------------
-- New tables, functions and sequences are closed to signed-in people until a migration opens them on purpose
-- (before, Supabase's own defaults opened each one to every signed-in person, and every migration had to remember to
-- revoke). From now on a table or function a browser needs says so with an explicit grant.
alter default privileges for role postgres in schema public revoke all on tables from authenticated;
alter default privileges for role postgres in schema public revoke all on functions from authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
