-- Two indexes the daily checks and Admin, Payments need (24/11/2026, speed audit). Nothing else changes.
-- Both are "create index if not exists", so running this twice is harmless. Building each holds back writes to that
-- table for the few seconds it takes (audit entries and webhook receipts wait, then go through).
--
-- ON A LARGE LIVE TABLE (review 24/11/2026): a plain "create index" blocks writes to the table while it builds. On the
-- test project the tables are small and this is fine. On live, once audit_log is large, run each of the two statements
-- below on its own as "create index concurrently if not exists ..." (it can't run inside a transaction, so one
-- statement per call in the SQL editor), which builds without blocking writes.
--
-- 1. audit_log by action and time.
--    The existing audit_log_entity index starts with entity_id, so it cannot serve a search that has no entity_id:
--    these read the whole log (it only ever grows) and filter it:
--      src/lib/ops/daily.ts   .eq("action", "charity.profile_changed").gte("created_at", since).order("created_at")
--      src/lib/ops/daily.ts   .in("action", [...profile_updated, logo_changed, cover_changed]).gte("created_at", since)...
--      src/lib/ops/daily.ts   .eq("action", "donation.confirmation_email_failed" / "_resent").gte("created_at", since)  (twice each)
--      src/lib/ops/daily.ts   .in("action", Object.keys(heldLabel)).gte("created_at", last day).limit(500)
--      src/app/admin/payments/page.tsx:48  .in("action", HELD).gte("created_at", since).order("created_at", desc).limit(50)
--      src/lib/donations/giving-guard.ts   .eq("action", "giving.alarm").gte("created_at", weekAgo).order("created_at", desc)
--    All are "one or a few actions, newest first or since a time". Lookups by action AND one donation
--    (confirm.ts, monthly-store.ts) already use audit_log_entity (entity_id first), so they need nothing new.
create index if not exists audit_log_action_time on public.audit_log (action, created_at desc);

-- 2. gateway_events not yet handled.
--    The only table with no index besides its id and (gateway, event_id). Two reads look for events still waiting:
--      src/lib/ops/daily.ts   .select(count).is("processed_at", null).lt("received_at", an hour ago)
--      src/app/admin/payments/page.tsx:48  .is("processed_at", null).order("received_at").limit(200)
--    A partial index holds only the rows with processed_at empty, which is normally a handful (a handled event leaves the
--    index at once), so it stays tiny however many webhooks have been received, and serves both reads in order.
--    The webhook route's own lookups use (gateway, event_id) and are unchanged.
create index if not exists gateway_events_unprocessed on public.gateway_events (received_at) where processed_at is null;
