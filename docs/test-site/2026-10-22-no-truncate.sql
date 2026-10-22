-- Givezy test project, 22/10/2026: the last part of 20261022000002_review_fixes.sql.
-- Stops anyone (the server included) emptying the receipts, donations, receipt counters and audit tables.
-- Paste all of this into Supabase, SQL Editor, New query, and press Run. Safe to run twice.
revoke truncate on public.audit_log, public.s18a_receipts, public.s18a_receipt_donations, public.donations, public.receipt_counters from service_role;
create or replace function public.refuse_truncate() returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'This table cannot be emptied: its records are kept by law';
end $$;
drop trigger if exists audit_log_no_truncate on public.audit_log;
create trigger audit_log_no_truncate before truncate on public.audit_log for each statement execute function public.refuse_truncate();
drop trigger if exists s18a_receipts_no_truncate on public.s18a_receipts;
create trigger s18a_receipts_no_truncate before truncate on public.s18a_receipts for each statement execute function public.refuse_truncate();
drop trigger if exists s18a_receipt_donations_no_truncate on public.s18a_receipt_donations;
create trigger s18a_receipt_donations_no_truncate before truncate on public.s18a_receipt_donations for each statement execute function public.refuse_truncate();
drop trigger if exists donations_no_truncate on public.donations;
create trigger donations_no_truncate before truncate on public.donations for each statement execute function public.refuse_truncate();
drop trigger if exists receipt_counters_no_truncate on public.receipt_counters;
create trigger receipt_counters_no_truncate before truncate on public.receipt_counters for each statement execute function public.refuse_truncate();
-- Check: this should show 5.
select count(*) as protected_tables from pg_trigger where tgname like '%_no_truncate';
