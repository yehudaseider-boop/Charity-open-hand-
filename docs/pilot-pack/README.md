# Charity pilot pack (draft 09/11/2026)

A short PDF for the first pilot charities: what Givezy does, what it costs, how to apply, the dashboard, s18A receipts, privacy, the pilot and a go-live checklist. Draft for Yehuda to review; words in square brackets are still to be filled in.

Rebuild from the repo root (needs Node 22 or later and the Playwright Chromium that is already installed):

1. `node docs/pilot-pack/build.mjs` writes `pilot-pack.html`. The words are in `content.mjs`, the look in `template.html`. The minimum gift, the maximum online gift, the minimum contribution, the review time and the date for adding late s18A details are read from `src/config/platform.ts`, so they stay in step with the site. The build stops if the card fee rates are filled in or `gatewayChargePaidBy` changes (section 2 must then be rewritten), or if an em dash or exclamation mark slips into the words.
2. `node docs/pilot-pack/render.mjs` makes `Givezy-charity-pilot-pack.pdf` (A4).

To change the date on the cover and footer: `PACK_DATE=dd/mm/yyyy` before both commands.
