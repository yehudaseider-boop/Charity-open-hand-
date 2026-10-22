# PSFA dashboard demo

An interactive copy of the charity dashboard, for showing to a charity (first built for PSFA, 22/10/2026).
It is plain HTML, CSS and JavaScript with no server: drag the built folder onto Netlify Drop.

Everything in it is made up. The donors, gifts and amounts are generated in `src/js/00-core.js` (relative to
today, the same every time), and everything a visitor does is kept in their own browser (localStorage), with a
"Reset the demo" button. Nothing is emailed or paid. Money is whole cents; amounts show as `R1 250`; dates as
`dd/mm/yyyy`; the tax year runs 1 March to the end of February.

What works: record and import gifts (with duplicate and bad-row checks), search and filter donations, download
CSV, thank-yous and email appeals (with a sent log), donor notes, tags, follow-ups and saved lists, campaigns,
the public profile, photo updates, the s18A and annual report pages, the team, and a donor's view (give from
the public page, pause or cancel a monthly donation). The charts are interactive: hover, press, range, hide a
series, keyboard arrows.

## Build and test

```
python3 demo/psfa-dashboard/build.py demo/psfa-dashboard/dist
python3 -m http.server 8099 --directory demo/psfa-dashboard/dist &
node demo/psfa-dashboard/tests/e2e.mjs      # record, import, donations, monthly, account
node demo/psfa-dashboard/tests/e2e2.mjs     # donors, thank-yous, email, campaigns, profile, updates, give flow
node demo/psfa-dashboard/tests/e2e3.mjs     # phone, tablet and desktop widths; empty and silly data
```

The tests use Playwright from the repo's `node_modules` and the Chromium that comes with the cloud session.
`BASE=http://localhost:8099/index.html` changes the address they visit.

## The public website pages

The version sent to PSFA also had the Givezy website pages (home, charities, for charities, privacy, terms) as
static captures of the real site, with links into this app. Those captures are not kept in the repository: make
them again from the running website if they are wanted.
