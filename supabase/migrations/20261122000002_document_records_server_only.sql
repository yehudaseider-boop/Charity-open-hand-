-- Givezy: document records are written by the server only (code review of 20/11/2026; Yehuda's yes, 22/11/2026).
-- Split from 20261122000001_bank_owner_documents.sql so it could be applied on its own: removing permissions asks for
-- a confirmation in the database tool. The website already writes document records with the server's key
-- (uploadDocument), so this only takes away a browser's direct write: a record pointing at no file, or a mandate
-- with any signing date. Removing a document while the application is open is unchanged.
drop policy if exists charity_documents_insert on public.charity_documents;
drop policy if exists charity_documents_update on public.charity_documents;
revoke insert, update on public.charity_documents from authenticated, anon;
