-- Deleting a person's sign-in account must not be blocked by records that only mention them.
-- Found 13/10/2026: every real donor has an audit row and an "account" agreement, and both
-- stopped the account from being deleted, so an erasure never finished.
--
-- The audit log is append-only, so it cannot be updated when a person goes. It keeps the
-- bare id (no name or email) as the record of who did what, so the link is dropped instead.
alter table public.audit_log drop constraint audit_log_actor_user_id_fkey;

-- An agreement record must name a person (or a donation or charity), so it cannot be left
-- pointing at nobody when the account goes. The erasure code removes the person's own
-- agreement records first (src/lib/privacy/erase.ts); the donation agreements stay with the donation.

-- Staff-only columns: forget who, keep the record.
alter table public.charity_documents drop constraint charity_documents_uploaded_by_fkey;
alter table public.charity_documents add constraint charity_documents_uploaded_by_fkey
  foreign key (uploaded_by) references auth.users (id) on delete set null;
alter table public.fee_settings drop constraint fee_settings_created_by_fkey;
alter table public.fee_settings add constraint fee_settings_created_by_fkey
  foreign key (created_by) references auth.users (id) on delete set null;
alter table public.data_requests drop constraint data_requests_closed_by_fkey;
alter table public.data_requests add constraint data_requests_closed_by_fkey
  foreign key (closed_by) references auth.users (id) on delete set null;
