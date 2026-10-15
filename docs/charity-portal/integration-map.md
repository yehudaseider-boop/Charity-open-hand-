# Charity portal: feature-to-backend map

Status per feature, and the decisions each one waits on: [`feature-audit.md`](feature-audit.md).

What each part of the prototype needs before it can run on real data. "Exists" means the table or code is already in the repository. All reads run as the signed-in charity admin (row-level security); writes to money and receipts stay server-only.

| Screen and feature | Demo source | Real source | Exists? | Work needed |
|---|---|---|---|---|
| **All screens**: charity switcher | `DEMO_CHARITIES` | `charity_admins` for the signed-in user (`getViewer`) | Yes | Switch only between charities the person administers; second-step sign-in already required |
| Date range filter | store | query parameters to every read | Partly | Server functions take `from` and `to` (Johannesburg days) |
| **Overview** totals, this month, donors, new and returning | `summarise()` | `donations` (paid), first-gift per donor | Yes (tables) | A SQL function returning the `PeriodSummary` shape; hide `giving_kind` (see dashboard brief) |
| Monthly chart | `monthlySeries()` | same | Yes | Group by month in Johannesburg time |
| Money check | `financeSummary()` | `donations` fee columns + settlement data | Partly | Settlement and payout data from the gateway adapter |
| Recent donations | first 7 donations | `donations` + `donation_checkout_details` | Yes | Last 4 digits only for ID and tax numbers |
| **Donations** search, filters, sort, pages | in browser | server-side query with paging | Yes (tables) | Paged query; search on name, email, reference, amount |
| Donation drawer: settled and paid-out dates | generated | gateway settlement records | No | New `settlements`/`payouts` tables filled from the gateway adapter (webhook or daily job) |
| CSV export | browser Blob | existing `/charity-admin/[id]/export/*` routes | Yes | Add fee, net, settlement and payout columns; already audit-logged |
| **Donors** directory, segments, retention | `donorStats()` | `donors` + `donations` | Yes | SQL view per charity; segments computed in SQL |
| Anonymous handling | `anonymous` flag | `donations.is_anonymous` | Yes | Wording already agreed: hidden on public pages only |
| "Say thank you" | toast | email adapter (Resend) | Partly | Template, rate limit, audit log; decision needed |
| **Campaigns** list, progress, compare | `campaignStats()` | `campaigns` + `donations.campaign_id` | Yes (tables, no screens) | Create, edit and status server actions (`campaigns_admin_rw` already lets charity admins write). The donation form has no campaign choice yet, so no real donation carries a campaign. "Paused" is not a database status |
| Create and edit form | local store | server action with zod validation | No | Slug uniqueness per charity; optional Givezy review step (decision) |
| Share link | `givezy.example` | public campaign page | No | Public campaign route and live domain |
| **Monthly giving** summary, trends, table | `recurringSummary()`, `recurringSeries()` | `recurring_donations` + monthly donations | Partly | Charities cannot read `recurring_donations` (select revoked 13/10/2026): needs a `charity_*` function (amount, day, status, dates; never the card authorisation). "Failed" is in the design (15/10/2026); charity sees, never changes |
| **Analytics** charts | selectors | SQL functions per chart | Partly | Same shapes as the selectors; cache per charity and day |
| **Finances** gross, fees, refunds, net | `financeSummary()` | `donations` fee columns | Partly | Real gateway rates (`src/config/platform.ts`) and the fee-payer decision |
| Payout history, next payout, reconciliation | generated weekly payouts | gateway settlements and transfers | No | New tables, filled only through `src/lib/gateway`; reconciliation check job |
| Refunds | generated | admin refund flow | No | Refund decision (who, fee) and admin screen |
| Financial report export | browser CSV | export route | Partly | New export, audit-logged and rate-limited |
| **Settings** profile | local store | `charities`, `charity_private` | Yes | Existing profile actions; registration details stay locked after approval |
| Branding and logo | data URL in browser | Supabase storage (charity images) | Yes | Reuse the existing upload checks (5 MB, type) |
| Notifications | local store | new `charity_notification_prefs` | No | Table, RLS, email jobs |
| Team members and invites | local store | `charity_admins`, auth invites | Partly | Decision first (today the Givezy team adds admins) |
| Role permissions | static table | role column on `charity_admins` | No | Decision first; RLS per role |
| Verification | static per charity | application status, badges | Yes | Map existing statuses to the steps |
| Payment and payouts | static | `charity_private` (last 4 only), gateway connection | Yes | Bank change stays a Givezy admin action |
| Security | local store | `mfa.ts`, session settings, `audit_log` | Partly | Session timeout setting; activity list from `audit_log` |
| **s18A receipts** list, summary, preview | `s18aReceipts()`, `s18aSummary()` | `s18a_receipts` and links (job built, off) | Yes | Read as the charity admin (already allowed by `receipts_read`); a function returning the summary; "details incomplete" from the donor's checkout details (last 4 only) |
| Receipt PDF download | toast | signed 60-second link | Yes | Reuse the existing receipt download route; already logged |
| Missing-details request | local draft | email adapter or the charity's own email | Partly | Draft-only now; decide whether Givezy ever sends |
| **Needs attention** items | `attentionItems()` | SQL views per item (failed monthly, missing details, campaign pace, large and new donors) | Partly | One function returning the same item shapes; cache per charity |
| **Follow up** lists and drafts | `followUps()`, `buildDraft()` | donor and donation reads; marketing consent flag | No | Add marketing consent to the checkout and store it; hide donors without it from win-back; per-charity templates; "done" markers in a new table (`charity_follow_ups`) with RLS |
| Campaign pace | `campaignPace()` | computed from campaign and donations | Yes | Same maths in SQL or the API; thresholds in config |
| **Giving groups** (Donors) | `givingWindows()`, `groupFor()` | paid donations per donor | Yes | A SQL view computing the windows per donor; thresholds in config |
| Check-in and win-back lists | `followUps()` | groups + marketing consent | No | Consent capture at checkout (decision first) |
| **Bank deposits** list and matching | `ds.payouts`, `reconciled` in the browser | the payment provider's settlement and transfer records | No | `payouts` and `payout_lines` tables filled through `src/lib/gateway`; a `reconciled_at`/`reconciled_by` column, audit-logged |
| Deposit detail and by-campaign split | `depositLines()`, `depositByFund()` | the same tables | No | A SQL function returning the same lines; a check job that alerts when lines do not add up to the deposit |
| Deposit CSV exports | browser CSV | export routes | Partly | Same columns; audit-logged and rate-limited like the existing exports |
