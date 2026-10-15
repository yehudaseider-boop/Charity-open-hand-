# Givezy charity portal: design prototype

_Updated 14/10/2026: added s18A receipts, a Needs attention panel on the overview, thank-you and win-back drafts under Donors, and a pace line on campaigns (nine sections now)._

_Updated 15/10/2026, using Givelify as the functional reference: donor giving groups (Consistent, Occasional, New, Decreasing, Inactive) and a Bank deposits reconciliation view with plain CSV exports. See "Givelify reference" below._

Built 14/10/2026 for review. A clickable prototype of the portal charity administrators would use. **Demo data only**: no database, no payment provider, no email. Approve the design here before any backend work starts.

## How to run it

```bash
npm install
npm run dev
```

Open <http://localhost:3000/portal-demo>. Chrome, Safari or Edge, any width from 375 px up.

- The site needs `.env.local` to start (the website's own pages talk to Supabase). For the portal alone, two placeholder lines are enough:
  `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=placeholder`.
- On a built site (`npm run build && npm start`) the portal answers "not found" unless `PORTAL_DEMO=yes` is set. That keeps it off a live deploy by accident.
- Changes made in the demo (campaigns, team, settings) are kept in the browser's local storage. "Reset demo" in the dark banner clears them.

## Shareable preview page

The same portal can be built as one self-contained page (scripts, styles and logos inlined), so people can click through it without running the website:

```bash
node scripts/build-portal-artifact.mjs ./givezy-charity-portal.html
```

The page routes inside itself (`src/portal-demo/artifact`) instead of using Next.js routing. Where the host blocks downloads, each CSV export opens on screen to copy instead. Changes made in the page stay in that viewer's browser.

## Where it lives

The portal is a separate area of the website. It does not touch the donor app (`apps/mobile`), the existing `/charity-admin` screens, the database or the payment code.

| Path | What |
|---|---|
| `src/app/portal-demo/` | Routes (thin pages; each renders a view) |
| `src/portal-demo/data/` | Demo data model, generator, selectors (every number), mock API |
| `src/portal-demo/ui/` | Shared components: shell, sidebar, top bar, charts, table, filters, forms, dialogs, drawers, badges, toasts |
| `src/portal-demo/views/` | The nine sections |
| `src/portal-demo/store.tsx` | Demo state: charity switcher, date range, local changes |
| `public/givezy/` | Givezy logo files, copied from `apps/mobile/assets` (not redrawn) |
| `src/app/globals.css` | Givezy colour tokens, scoped to `.gz-portal` |
| `tests/portal-demo-data.test.ts` | Proves every screen's figures come from one dataset and add up |

## Routes

| Route | Section |
|---|---|
| `/portal-demo` | Overview |
| `/portal-demo/donations` | Donations (`?status=failed` pre-filters) |
| `/portal-demo/donors` | Donors: Directory and Follow up (`?donor=<id>` opens a profile; `?view=follow-up&tab=new`, `large` or `winback`) |
| `/portal-demo/campaigns` | Campaigns |
| `/portal-demo/campaigns/new` | Create campaign |
| `/portal-demo/campaigns/[id]` | Campaign detail, edit, status, share |
| `/portal-demo/recurring` | Monthly giving (`?status=failing` pre-filters) |
| `/portal-demo/receipts` | s18A receipts |
| `/portal-demo/analytics` | Analytics |
| `/portal-demo/finances` | Finances and payouts |
| `/portal-demo/settings` | Settings and team (`?tab=team` and so on) |

Screenshots of the key screens are in [`screens/`](screens/).

## How to look around

1. Start on **Overview**. The date button (top right of each page) changes the period for every screen.
2. Use the **charity switcher** under the logo to move between the three demo charities: Sunrise Table (small community kitchen), Bright Futures (medium education trust), Ezra Medical (larger medical fund). Every screen changes with it.
3. Open any donation row for its **drawer**: gross, fee, net, and the three dates (donated, settled, paid out) kept apart.
4. On **Campaigns**, create one, then edit its goal, pause it and end it. It shows up in the overview, filters and comparisons.
5. On **Finances**, flip the processing-fee switch to see both fee designs.
6. On **Settings, Team members**, invite someone. Nothing is sent.
7. On the **Overview**, read **Needs attention**, then follow a row. "First-time donors to welcome" opens **Donors, Follow up**, where each person has a draft message you can edit, copy, open in your own email and mark as done. Done people drop off the Overview list.
8. Open **s18A receipts**: switch tax year, open a receipt for a preview with the draft wording, and use "Draft a request" for donors whose details are incomplete. Switch to Sunrise Table to see the page for a charity without s18A approval.

## Design specification

**Brand.** Givezy kit, the same tokens as the phone app (`apps/mobile/src/theme/tokens.ts`): cream pages `#FEFDF7`, navy text `#102848`, blue `#1848A8` for headlines, buttons, links and the active menu item, lilac `#CCB3FB` / `#F1EAFE` for soft highlight cards, sage `#2E9D6B` for progress and success, one orange `#F88038` accent per screen (graphics only: the logo splash on Overview, the DEMO MODE tag, failed collections in one chart). Fredoka for headlines and big numbers, Inter for everything else, tabular figures for money. Pill buttons, 22 to 28 px corners, soft blue-tinted shadows. Sentence case, no exclamation marks.

**Layout.** Fixed sidebar (264 px) on laptops and desktops; below 1024 px it becomes a slide-out menu behind a menu button. Content max 1 320 px. Metric cards in a row of four (two on tablets, one on phones). Charts and summary cards in a 2:1 grid.

**Components.** One set, used everywhere: `MetricCard` (value, change against the previous period, sparkline), `Card`, `PageHeader`, `Button` (primary, secondary, soft, ghost, danger), `Badge` (always icon or word with colour, never colour alone), `Progress`, `DataTable` (sort, pages, phone card layout), `SearchInput`, `FilterSelect`, `DateRangePicker`, `Segmented`, form fields with inline errors, `Modal`, `ConfirmDialog`, `Drawer` (full screen on phones), `Toasts`, `EmptyState`, skeleton loading.

**Charts.** Plain SVG, no chart library. Every chart has a hover or tap tooltip, a legend when it has two series, and a **Table** switch showing the same numbers. Series colours in fixed order: blue, deep lilac `#9B7BE8`, sage, orange (checked for colour-blind separation). One y-axis per chart.

**Money and dates.** Integer cents throughout; Rand shown as `R1 250` or `R34.57`; dates dd/mm/yyyy in Johannesburg time; the tax year option runs from 01/03.

**Definitions used on every screen.** Raised = paid donations. Gross = paid plus refunded. Net = gross minus refunds minus processing fees minus platform fee (R0). Totals use the donation date; payouts use the payout date and say so.

**Accessibility.** Visible labels on every control, 40 px or larger tap targets, focus rings, Escape closes dialogs and drawers, focus is kept inside an open dialog, status never shown by colour alone, no sideways scrolling at 375 px.

## The demo data

`src/portal-demo/data/generate.ts` builds each charity from a fixed seed, so it is the same every time: 18 months of history to 14/10/2026 (the screens default to the last 12; the earlier six give returning donors), once-off and monthly donations, first-time and returning donors, failed, pending and refunded payments, weekly payouts, campaigns with goals. Names are made-up combinations, emails use `example.org`, registration numbers carry a `DEMO` marker.

| Demo charity | Size | Donations | Donors | Raised (18 months) |
|---|---|---|---|---|
| Sunrise Table Community Kitchen | small | about 990 | about 330 | about R217 000 |
| Bright Futures Learning Trust | medium | about 4 400 | about 1 140 | about R2.6m |
| Ezra Medical Assistance Fund | larger | about 12 900 | about 2 900 | about R17m |

Placeholders, clearly labelled on screen and in `demo-config.ts`: a 3% processing fee (not a real rate), a weekly payout schedule, and the `givezy.example` link address.

## What works, what is simulated

**Works in the browser:** navigation, charity switcher, date ranges (presets and custom, with errors for bad dates), search, filters, sorting, pages, chart tooltips and table views, donation, donor, monthly-donation and payout drawers, campaign create, edit, publish, pause, resume, end, reopen, copy link, team invite, role change, remove, settings forms with validation, logo upload and preview, CSV exports (real files, made in the browser), the processing-fee switch, reset.

**Added 14/10/2026:**
- **s18A receipts:** one receipt per donor per SARS tax year (tax year 2026 is closed, so its receipts show as issued with numbers; tax year 2027 shows "after year end"). Amounts are the donation only. A receipt cannot be issued while the donor's details are incomplete. Refunded, failed and pending donations never count. The receipt preview uses the repository's draft wording and shows only the last 4 digits of ID or tax numbers (hidden in the demo). Not approved charities (Sunrise Table) see an explanation instead.
- **Needs attention:** failed monthly payments, donors missing s18A details, campaigns behind pace or ending soon, large donations and first-time donors waiting for a thank-you. Every row opens the screen that fixes it. Each figure is computed from the same dataset (tested).
- **Follow up (Donors):** welcome new donors, thank large donors, check in with donors giving less often, win back inactive donors (the last two from 15/10/2026). Drafts are written in the charity's voice, editable, and open in the charity's own email app. Givezy sends nothing. "Done" is remembered in the browser. Win-back lists only donors who agreed to hear about appeals (a demo trait, see open decisions).
- **Campaign pace:** an Ahead, On track or Behind badge and the amount needed each day, on the campaign page.
- The "large donation" amount follows the setting under Settings, Notifications (R5 000 until changed).

**Added 15/10/2026:** giving groups on Donors (cards, filter chips, a column, the reason on each profile and in the CSV), Check-in and Win-back lists in Follow up, a "giving less often" Needs attention row, and Bank deposits on Finances with matching, the deposit drawer and three new CSV exports.

**Simulated, says so on screen:** invitations (no email), "Say thank you" (no email), notification settings (nothing sent), public page and sign-out (toast only), bank account change (a request toast), campaign publish (local only), refunds (shown, not actionable), verification steps (static per charity), recent activity (sample entries).

## Givelify reference (15/10/2026)

Givelify's Analytics Studio is the functional reference for this portal, as the original brief said. It is a reference for what charities need, not a template: no layout, names or assets are copied. There is no Givelify login on our side and their site was not reachable from the build machine, so what follows comes from search summaries of Givelify's own help and blog pages and third-party reviews. Treat it as their description of their product.

| What Givelify describes | What the portal now does |
|---|---|
| Five donor groups: Consistent (weekly, fortnightly or monthly pattern), Occasional (more than once, no pattern), New (first four weeks), Decreasing (was consistent, has drifted), Inactive. Givelify says AI sorts donors. | The same five groups as **plain rules a charity can read** (shown on screen): New is a first donation in the last 28 days; Consistent gave in at least 5 of the last 6 thirty-day windows; Decreasing did that in the 6 windows before but less often since; Inactive gave nothing in the last 6 windows; everyone else is Occasional. Each donor's profile says why ("1 of the last 6 · 5 of the 6 before"). |
| Bank deposits report, grouped by date, to match the bank statement; per-deposit view of each donation with fees, net and campaign. | **Bank deposits** on Finances: one row per deposit with the statement reference, a tick box to mark it matched on the bank statement (remembered), a progress bar, and a drawer with every donation and refund line and a by-campaign split, all adding up to the deposit to the cent (tested). |
| Import-ready exports: donations with fees by campaign, bank deposits, CSV or Excel. | Plain CSV, as agreed: **Bank deposits**, **Deposit detail** (every donation and refund line), **Deposits by campaign** (journal-ready), plus the existing financial report and donations with fees. Each file adds up to the deposits it covers. |
| Donor engagement around those groups. | **Check in: giving less** (Decreasing donors) and **Win back inactive donors** in Follow up, and a "giving less often" row in Needs attention. |

## Feature-to-backend map

Summary below; the table per screen is in [`integration-map.md`](integration-map.md).

- Replace `mockPortalApi` in `src/portal-demo/data/service.ts` with calls made as the signed-in charity admin (row-level security decides). The screens only use the `PortalApi` interface and the selectors.
- Heavy totals (overview, analytics, finances) should move into SQL views or database functions returning the same shapes as `selectors.ts`, filtered by date range, rather than loading every donation into the browser.
- Payouts and settlement dates need the payment provider's settlement data, through the gateway adapter only.

## Open decisions

These need Yehuda (and some Yosef) before the real build. They are also in `docs/go-live-checklist.md`.

1. **Processing fee:** the real rate, and who pays it. The demo shows both designs behind a switch.
2. **Team invites and roles:** decided 09/10/2026 that the Givezy team adds charity admins and owners and admins see the same things. The prototype shows self-service invites and four roles (owner, admin, finance, viewer) as a proposal. Keep, change or drop?
3. **Payout schedule and settlement data:** what the payment provider actually reports and how often it pays out.
4. **Refunds:** who can refund (charity or Givezy only), and whether the fee comes back.
5. **Campaign review:** does a new campaign go live straight away or after a Givezy check?
6. **Failed monthly donations:** the real flow has a "failed" end state after three declines; the demo shows only active, paused and cancelled. Add the fourth state to the design?
7. **Portal and existing `/charity-admin`:** replace the current charity screens with this design, or run both for a while?
8. **Name:** the portal uses the Givezy brand; the website, emails and receipts still say Nadiv Lev until their rename pass.
9. **Dark mode:** not designed. Wanted?
10. **Live address** for campaign links (the demo uses `givezy.example`).
11. **Marketing consent (POPIA), for Yosef:** the demo treats thank-yous as service messages any donor can get, and win-back appeals as marketing that needs consent (65% of demo donors "agreed", a made-up trait). Is that the right line, and where does the checkout ask for the consent?
12. **Follow-up and pace settings are placeholders, not decisions** (in `demo-config.ts`): "new donor" welcome list for 14 days, "large donation" within 30 days, "ahead" at 110% of an even pace and "behind" under 90%, a campaign "ending soon" within 14 days. Confirm or change.
13. **Receipt numbers:** the demo numbers receipts in donor order within the year (`BF-2026-0001`). The real job numbers in issue order, per the existing sample format. Same format, different order.
14. **Who writes to donors:** the portal drafts and the charity sends from its own email. Should Givezy ever send for them (needs consent, unsubscribe handling and sender authentication), or stay draft-only?
15. **Giving-group rules: decided 15/10/2026, keep for now.** New for 28 days, 30-day windows, 6 each side, Consistent at 5 of 6. Revisit once real donations show the patterns. Change them in `demo-config.ts`.
16. **Statement reference: decided 15/10/2026, placeholder.** The demo keeps `GIVEZY PO-yyyymmdd`; the real wording is checked in the payment provider's test mode (on the go-live checklist).
17. **"Mark all as matched": decided 15/10/2026, keep it**, behind a confirmation that shows how many deposits, their total and their dates, and asks "Have you checked them?".
