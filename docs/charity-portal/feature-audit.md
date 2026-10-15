# Charity portal: feature audit

15/10/2026. Every feature of the prototype, checked three ways:

1. **Does it make sense for the real platform?** Each feature compared with the real database (`supabase/migrations`), the checkout and the decisions in `docs/decisions.md`.
2. **Does it connect and work?** Every screen, link and action clicked through in a browser for all three demo charities, with the same figures compared across screens.
3. **Do the numbers add up?** Automated tests on the data behind every screen.

## Result

- **Data tests:** 80 pass (`tests/portal-demo-data.test.ts`).
- **On-screen cross-checks:** 36 pass, the same figure read off different screens for all three charities. For example, the Overview total equals the Donations page total and the donations CSV, the Overview net equals Finances, each campaign card equals its own page, and the receipts CSV equals the receipts total.
- **Links:** all 24 internal links open a real page.
- **Actions:** 18 interaction checks pass: deep links, the campaign lifecycle, follow-ups, deposit matching, fee switch, team, charity switch and reset.
- **Phone:** no sideways scrolling on 12 pages at 375 px.
- **Console:** no errors.

The prototype now behaves the way the real platform would. What it cannot prove is the real data behind it: the features marked **Needs building** or **Needs a decision** below must be built or decided first.

## Fixed in this pass (the prototype did not match the real platform)

| What was wrong | Rule or fact | Fix |
|---|---|---|
| Failed and pending payments showed on Donations, Overview and Finances | Decided 08/10/2026: charities see only paid, refunded and charged-back donations (`charity_donations` view) | Hidden everywhere. The Donations filter offers Paid, Refunded, Charged back, Refunded or charged back |
| Chargebacks were missing | The platform has a `charged_back` status | Added: a badge, a side-panel note, a Chargebacks line in the reconciliation, a chargeback line in the deposit that carried it, and no s18A receipt |
| "Last payment failed" and "Failed collections" counted failed attempts | Failed attempts are failed donations (hidden). The platform stops a monthly donation after three declines (`recurring_donations.status = 'failed'`) | Monthly giving now shows "Stopped: payment failed" with its date. Needs attention says "N monthly donations stopped after failed payments" |
| "55 donors need to complete s18A details" | The checkout refuses an s18A request without an ID or tax number (or a company's registration number) | The "needs details" state, card, filter, request draft and attention row are removed |
| "Given in the app or on the website" and "Card ending 1234" | The platform records neither | Removed |
| Donor messages were not shown | `charity_donations` includes the donor's message | Shown in the donation side panel and the CSV |
| Fees shown as deducted by default | Decided 09/10/2026: charities never see fees; the split model pays the charity the full donation | The demo now starts with "Not paid by the charity". The switch still shows the other design while the fee payer is open |
| "Still giving" used each plan's status today | It should be the status at the end of the chosen period | Fixed and tested |
| Two "main content" areas on one page | One per page, for screen readers | Fixed |

## Feature by feature

**Status key**
- **Ready:** the real data and permissions exist; the screen needs wiring up.
- **Needs building:** a missing piece must be built first.
- **Needs a decision:** blocked on a choice by Yehuda or Yosef.

### Overview

| Feature | How it works for real | Connects to | Status |
|---|---|---|---|
| Totals, this month, donors, monthly donations | Paid donations by date (`charity_donations`, `charity_overview`). Monthly count from `recurring_donations` | Donations, Donors, Monthly giving (same figures, checked on screen) | Ready, except the monthly count (see Monthly giving) |
| Needs attention | Each row is a query: stopped monthly donations, large donations and new donors to thank, donors giving less, campaigns behind or ending | Each row opens the screen that deals with it (checked) | Large and new donors: Ready. The rest depend on Monthly giving, Giving groups and Campaigns below |
| Money check | Gross, refunds, chargebacks, fees, net | Finances (same figures, checked) | Needs a decision: whether charities see fees (see Finances) |
| Latest donations and chart | `charity_donations` | Donation side panel | Ready |

### Donations

| Feature | How it works for real | Connects to | Status |
|---|---|---|---|
| List, search, filters, sort, pages | `charity_donations` (paid, refunded, charged back only), paged on the server | Overview, Donors (View donor), Campaigns (filter) | Ready |
| Side panel: money, message, s18A, anonymous | Same view | Donor profile | Ready |
| Side panel: settled and paid-out dates | The payment provider's settlement records | Bank deposits | Needs building (see Bank deposits) |
| CSV export | The existing export route (audit-logged, rate-limited) | Same rows as the screen | Ready: add the message, status and payout columns |

### Donors

| Feature | How it works for real | Connects to | Status |
|---|---|---|---|
| Directory, profile, giving history | `charity_donor_list` and `charity_donations` | Donations, Monthly giving, Receipts | Ready |
| Giving groups (Consistent, Occasional, New, Decreasing, Inactive) | Counted from each donor's paid donations in 30-day windows (rules shown on screen) | Follow up, Needs attention | Ready: needs one database function |
| Anonymous | `is_anonymous`: hidden on public pages only, as the checkout says | Campaign top donors | Ready |
| Follow up: welcome and large-donation thank-yous | Drafts the charity sends from its own email | Needs attention | Ready (a "done" marker needs a small table) |
| Follow up: check in and win back | The same, but these ask for money, so only donors who agreed to hear about appeals | Needs attention | Needs building and a decision: the checkout records no marketing consent today (the `consents` table has no such kind). Yosef to confirm the line between thank-you and appeal |

### Campaigns

| Feature | How it works for real | Connects to | Status |
|---|---|---|---|
| List, create, edit, goal, dates | `campaigns` table. Charity admins may already create and edit (`campaigns_admin_rw`) | Overview, Donations filter, Analytics | Ready |
| Donations to a campaign | `donations.campaign_id` | Campaign totals, pace, top donors | Needs building: the donation form does not let a donor choose a campaign, and there is no public campaign page |
| Status: draft, active, ended | `campaign_status` | Campaign page and list | Ready |
| Status: paused | Not in the database (draft, active, ended only) | | Needs a decision: keep pausing (a database change) or drop it |
| Share link | Public campaign page on the live domain | | Needs building (page) and a decision (domain) |
| Pace (ahead, on track, behind) | Raised against an even pace to the end date | Needs attention | Ready once campaigns take donations |

### Monthly giving

| Feature | How it works for real | Connects to | Status |
|---|---|---|---|
| Expected each month, collected, active, paused, cancelled, stopped | `recurring_donations` (statuses active, paused, cancelled, failed) and its paid donations | Overview, Needs attention, Donor profile | Needs building: charities cannot read monthly donations today (select was revoked on 13/10/2026). Needs a `charity_*` function showing amount, day, status and dates, never the card authorisation |
| Charity can see, not change | Donors pause and cancel themselves (built) | | Ready, matches the design |

### s18A receipts

| Feature | How it works for real | Connects to | Status |
|---|---|---|---|
| One receipt per donor per tax year, after the year closes | `s18a_receipts` and the receipts job (built, switched off) | Donor profile | Ready to show. Real receipts wait for the attorney's wording (`RECEIPT_WORDING_CONFIRMED`) |
| Receipt download | The existing `/receipts/[id]` route (signed link, logged) | | Ready |
| Not-approved charity | `charity_can_issue_18a` | Settings, Verification | Ready |

### Analytics

| Feature | How it works for real | Connects to | Status |
|---|---|---|---|
| Growth, donors, first-time against returning, campaigns, amounts, monthly trend | Database functions over paid donations | Same figures as Overview | Ready (campaign charts once campaigns take donations) |

### Finances and payouts

| Feature | How it works for real | Connects to | Status |
|---|---|---|---|
| Gross, refunds, chargebacks, net | `charity_donations` | Overview, Donations | Ready |
| Processing fees | `processing_charge_cents` exists on each donation | | Needs a decision: who pays the gateway charge, and whether charities see fees (decided 09/10/2026: they do not) |
| Bank deposits, settlement dates, next payout, matching | The payment provider pays each charity's subaccount directly. Givezy would need the provider's settlement records per subaccount | Donations side panel, CSV exports | Needs building, and checking in the provider's test mode that settlement records per charity are available |
| Refunds | Recorded, not acted on | | Needs a decision: the refund policy (open) |
| CSV exports | Same rows as the screens | | Ready for donations. Deposits wait for settlement data |

### Settings and team

| Feature | How it works for real | Connects to | Status |
|---|---|---|---|
| Charity profile | Existing profile page and actions | Top bar | Ready |
| Branding and logo | Existing charity photos and checks | | Ready |
| Notifications | Emails to the charity | | Needs building (email milestone) |
| Team members and invites | `charity_admins` (owner, admin) | | Needs a decision: decided 09/10/2026 that the Givezy team adds admins |
| Role permissions (finance, viewer) | Not in the database (owner, admin only) | | Needs a decision |
| Verification | Existing application statuses and badges | Receipts | Ready |
| Payout account | `charity_private`, last 4 only, locked after approval | | Ready |
| Two-step sign-in | Built and required | | Ready |
| Session timeout, owner-only exports | Not built | | Needs building |
| Recent activity | `audit_log` | | Ready |

### Across the portal

| Feature | How it works for real | Status |
|---|---|---|
| Charity switcher | Charities the signed-in person administers (`charity_admins`) | Ready |
| Date ranges | Every query takes from and to dates (Johannesburg days) | Ready |
| What a charity never sees | Fees (per decision), the donor's maaser, chomesh or tzedaka choice, private notes, full ID or tax numbers, pending and failed payments | Ready: enforced by the database views; the portal shows none of them |

## Decisions this audit needs

1. **Fees:** who pays the gateway charge, and whether charities ever see fees. This decides the Money check, the Finances fee line and what a bank deposit adds up to.
2. **Campaigns:** build campaign giving (a campaign choice in the donation form and a public campaign page) before the Campaigns screens go live? And keep or drop "paused"?
3. **Monthly giving for charities:** approve a charity read of monthly donations (amount, day, status, dates; never card data).
4. **Marketing consent (Yosef):** ask at checkout so check-ins and win-backs can be offered, or keep the portal to thank-yous only.
5. **Bank deposits:** confirm in the payment provider's test mode that per-charity settlement records are available. If they are not, Finances shows donations and refunds only, and deposits stay with the provider's own emails.
6. **Team, roles, refunds and notifications:** as listed in the README's open decisions.
