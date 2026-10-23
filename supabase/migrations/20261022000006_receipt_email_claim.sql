-- A receipt is marked emailed only after its email has gone (22/10/2026 review).
--
-- Before, the receipt was marked emailed first, as a lock so two runs at once never both send it. A run cut
-- off during the send (the sign-off runs inside a web request) left a receipt marked emailed that never went,
-- and nothing picked it up. Now a separate claim time is the lock; emailed_at is set after a real send. A
-- claim older than 15 minutes is treated as abandoned and the receipt is tried again.
-- (Not part of the fields guard_receipt_immutable protects, so it can change after issue.)

alter table public.s18a_receipts add column email_claimed_at timestamptz;
