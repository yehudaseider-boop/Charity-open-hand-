-- The dashboard's Activity page (24/11/2026, dashboard speed). The audit log had no index besides its id, so every
-- read of one charity's activity ("entity_type = 'charity' and entity_id = <charity> order by created_at desc limit
-- 100") read the whole log, every charity's and every donation's entries, and sorted it. The log only grows (it is
-- append-only), so that read got slower every day for every charity. The same index serves the payment checks that
-- look up one donation's notes (action and entity_id) and the Admin charity page.
--
-- Measured on a local copy with 500 000 made-up entries: 71 ms (a full scan) before, 0.2 ms (an index scan) after.
-- Building it holds back new audit entries for the few seconds it takes; nothing else changes.
create index if not exists audit_log_entity on public.audit_log (entity_id, entity_type, created_at desc);
