# Charity portal: feature-to-backend map

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
| **Campaigns** list, progress, compare | `campaignStats()` | `campaigns` + `donations.campaign_id` | Yes (tables, no screens) | Create, edit and status server actions; RLS insert/update policy for charity admins |
| Create and edit form | local store | server action with zod validation | No | Slug uniqueness per charity; optional Givezy review step (decision) |
| Share link | `givezy.example` | public campaign page | No | Public campaign route and live domain |
| **Monthly giving** summary, trends, table | `recurringSummary()`, `recurringSeries()` | `recurring_donations` + monthly donations | Yes | Add "failed" state to the design; charity sees, never changes |
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
