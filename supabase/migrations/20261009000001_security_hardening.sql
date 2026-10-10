-- Open Hand: security hardening

-- Bank details: the guard trigger only covers updates, so a charity admin
-- could delete the private row and insert a new one with another bank
-- account (and even mark it verified). The row is created by the server when
-- an application starts and is never removed from the browser, so charity
-- admins may only update it.
revoke insert, delete on public.charity_private from authenticated;

-- Uploads: the type and size checks in the website's forms can be skipped by
-- uploading straight to storage, so the buckets enforce them too.
-- 5 MB matches MAX_UPLOAD_BYTES in src/lib/charity/validation.ts.
update storage.buckets
  set file_size_limit = 5242880, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
  where id = 'charity-public';
update storage.buckets
  set file_size_limit = 5242880, allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png']
  where id = 'charity-documents';
