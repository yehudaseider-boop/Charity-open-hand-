# Nadiv Lev go-live checklist

Started 12/10/2026. Nothing here has been done on the real (live) systems yet. Tick items off as they are done and note the date. Items marked "decision" need Yehuda or Yosef before anyone builds or switches anything on.

## A. Decisions still open (nothing goes live until these are settled)

- [ ] **Gateway rates.** Left empty on purpose until Yehuda supplies them (`src/config/platform.ts`). Never guessed.
- [ ] **Who pays the gateway charge** (donor, Nadiv Lev or the charity). Decision.
- [ ] **Pending-payment sweep.** Today a payment still pending after the gateway stops retrying needs a person to check unprocessed rows in `gateway_events`. Decide whether to add an automatic sweep. Decision.
- [ ] **Pooled-fund model** (money collected centrally, then sent on): s18A per donor or in total, who uploads the s18A certificates, whether holding funds is lawful (Yosef), and the Terms wording that a donor's charity choice is a suggestion of where the money should go.
- [ ] **s18A loss rule**, **refunds and chargebacks**, and **what happens when a charity changes its name.** Decisions.
- [ ] **Legal wording approved** by Yosef: Privacy Policy and Terms are drafts. Also the entity line, the fee sentence and the trademark question from the brand kit.
- [ ] **Domain, registrar and hosting** chosen.
- [ ] **App calendar choices:** Shabbos and Yom Tov end at sunset plus 72 minutes (confirm), whether "today" follows the phone's time zone or Johannesburg, and whether Elul shows "Shana tova" instead of "Good Shabbos".

## B. Before the switch (technical)

- [ ] Run the database changes on the real database **first**, in order, up to and including `20261011000001_confirmation_credentials.sql`. Then deploy the website code. Doing it the other way round makes new donations fail.
- [ ] Back up the real database before running them. Write down how to undo (restore the backup).
- [ ] Live settings in place and checked: site address, encryption key, database keys, email sending, gateway keys. None of the test values.
- [ ] **Test gateway is off:** `ALLOW_TEST_GATEWAY` is not set on the live site and the payment gateway setting is the real one.
- [ ] The gateway's webhook points at the live address, with signature checking on.
- [ ] Re-run the dependency audit (`npm audit` in the main folder and in `apps/mobile`). Known and unfixable today: `braces`, `node-forge`, `decode-uri-component`. Check whether patched versions now exist.
- [ ] A normal website build with the real font access passes, plus typecheck, lint and all tests.
- [ ] Phone app: build and submit through the app stores. The app never takes payments, and "Give on our website" opens the browser.

## C. First live day

- [ ] One small real donation with Yehuda's own card. Check: the thank-you page, the confirmation email, the donation shows as paid, the charity sees it without the donor's private choice, and the s18A flow behaves as agreed.
- [ ] Refund that donation and check what the system does (see the refund decision in A).
- [ ] Send the webhook twice (or replay it from the gateway) and check nothing is counted twice.
- [ ] Check the confirmation link from a different device and from a signed-in account.
- [ ] Look at unprocessed rows in `gateway_events` at the end of the day. There should be none.
- [ ] Watch the first week: any payment stuck as pending, any error emails.

## D. Later ideas (not for go-live)

HTML version of the confirmation email, yahrzeit giving, a tax pack, dedications, real charity photos from the charities.
