-- Supabase security advisor (16/10/2026): pin the search path on every trigger and helper function
-- that did not set one. All of them already name their tables as public.<table>, so an empty search
-- path changes nothing they do; it only stops a caller's own search_path from being able to swap in a
-- look-alike table or function. The SECURITY DEFINER functions already had this.

alter function public.guard_receipt_links() set search_path = '';
alter function public.set_updated_at() set search_path = '';
alter function public.guard_audit_append_only() set search_path = '';
alter function public.guard_charity_admin_fields() set search_path = '';
alter function public.lock_charity_under_review() set search_path = '';
alter function public.charity_can_issue_18a(public.charities) set search_path = '';
alter function public.guard_receipt_immutable() set search_path = '';
alter function public.guard_donation_status() set search_path = '';
alter function public.guard_charity_documents() set search_path = '';
alter function public.guard_charity_bank_fields() set search_path = '';

-- The advisor also lists the SECURITY DEFINER functions that signed-in users (and, for three of them,
-- visitors) may call. Each is meant to be callable and checks for itself who is asking:
--   is_charity_admin / is_platform_admin: used inside row-level policies, so every role that reads a
--     table with such a policy needs EXECUTE. Called directly they only say true or false about the caller.
--   campaign_progress: public campaign totals for the website and the app; drafts and unapproved charities
--     are left out unless the caller is that charity's admin.
--   charity_*: refuse unless is_charity_admin(p_charity_id) or is_platform_admin().
--   agree_to_policy, link_my_donations, my_donor_ids, set_my_recurring_status: act only on auth.uid().
