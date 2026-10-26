# Givezy charity dashboard: sales demo

A clickable copy of the charity dashboard to walk a charity through in a sales meeting (built 26/10/2026).
Everything in it is sample data: the charity is "Sample Charity" and every donor's surname is a placeholder word
(Example, Sample, Demo, Placeholder, Specimen, Mock, Testcase). No server, no Supabase, no keys, no emails, no
payments. What the presenter does is kept only in their own browser, and "Reset demo" puts it all back.

Screens: Overview, Donations (filters and CSV), Donors and one donor (first, latest and largest gift, notes and
follow-ups), s18A receipts (drafts, issued, a preview marked SAMPLE), Deposits (under Donations, as in the real dashboard:
one deposit a day, each opening to the gifts in it) and Campaigns (goal ring). The Overview chart is the real
one's "Donations by month": monthly and once-off stacked, months labelled by number (10 = October). No fee or rate is shown anywhere: "Fee: to be confirmed". No gateway is named.

The five-minute walkthrough (the panel under the menu, or at the bottom on a phone):
1. Overview: "Show a new gift". It shows "Saving…" then "Saved", and appears on Overview and Donations.
2. s18A receipts: "Issue" on the new gift. It moves to Issued, with Undo.
3. Naledi's donor page: write a note, optionally a reminder, "Save note". With Undo.
4. Deposits: the gift is matched to the next deposit.
5. "Reset demo" (asks first) puts everything back to the start.
Also: a declined monthly donation on Donations ("Nothing was charged", one next step), and "a brand-new charity"
for the empty dashboard.

## Build and test

```
python3 demo/charity-dashboard/build.py            # dist/: one self-contained page, the hosted copy, and a zip
NODE_PATH=$(npm root -g) node demo/charity-dashboard/tests/walkthrough.mjs
```

`src/data.js` makes the sample (relative to today, the same every time), `src/screens.js` the screens and
`src/app.js` the frame, the walkthrough and the buttons. Fonts and pictures are put inside the page, so it works
offline. The test clicks the whole walkthrough at 390 and 1280 wide, plus CSV, filters, empty states, offline,
the declined donation and reset. `SHOTS=<folder>` saves screenshots.
