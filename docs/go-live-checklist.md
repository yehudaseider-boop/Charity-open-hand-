# Nadiv Lev go-live checklist

Started 12/10/2026. Nothing here has been done on the real (live) systems yet. Tick items off as they are done and note the date. Items marked "decision" need Yehuda or Yosef before anyone builds or switches anything on.

## A. Decisions still open (nothing goes live until these are settled)

- [ ] **Gateway rates.** Left empty on purpose until Yehuda supplies them (`src/config/platform.ts`). Never guessed.
- [ ] **Split payments verified in Paystack's test mode** (needs the Paystack test keys; this sandbox cannot reach Paystack). Check, in order: (1) subaccount creation for a South African bank account works with the bank name we hold; (2) a test donation with a charity subaccount settles the donation amount to the subaccount and the contribution to the main account, in ZAR; (3) the fee lands on the side the bearer setting says; (4) what happens when the contribution is R0 and Nadiv Lev bears the fee; (5) the `charge.success` webhook and verify call report the full amount. Then set `PAYSTACK_SPLITS=yes`. Until then Paystack takes no donations.
- [ ] **Monthly giving, in Paystack's test mode:** (1) a card payment with `channels: ["card"]` returns a reusable authorisation in the verify answer; (2) `charge_authorization` with the subaccount, flat `transaction_charge` and bearer settles like a first payment; (3) a declined card shows as failed in the verify answer; (4) the `charge.success` webhook for a charged authorisation carries our reference. Then run the job against test keys for a full month.
- [ ] **Schedule the monthly job:** a scheduler calls `/api/jobs/monthly-giving` about hourly with `Authorization: Bearer <CRON_SECRET>`; set `CRON_SECRET` on the server (long random string). Check the answer each day for `errors` and `waiting`. Hosting is not chosen yet, so the scheduler is not either.
- [ ] **Yosef:** terms and wording for monthly donations (authorisation tick-box, emails), and card-on-file rules for recurring payments.
- [ ] **Yosef:** what an erasure keeps (donation amounts, dates and issued s18A receipts) and for how long (the Privacy page still says "to be confirmed"). Then try an erasure on test data and read the email it sends.
- [ ] **Look at Admin, Payments each day** in the first weeks: anything stuck, held, or a monthly donation more than 24 hours late.
- [ ] **Connect every approved charity** (Admin, charity page, "Connect to gateway") before opening. A charity that is not connected shows "isn't taking online donations yet".
- [ ] **Who pays the gateway charge** (donor, Nadiv Lev or the charity). Decision.
- [ ] **Pending-payment sweep.** Today a payment still pending after the gateway stops retrying needs a person to check unprocessed rows in `gateway_events`. Decide whether to add an automatic sweep. Decision.
- [x] **Money model decided 13/10/2026: straight to the chosen charity** (Paystack split payments), not pooled. Nadiv Lev never holds a charity's donation, so the "holding funds" question and the "choice is only a suggestion" wording fall away. Still for Yosef: s18A in this model (the charity issues the certificate or Nadiv Lev issues on its behalf under the mandate, as built), and how Nadiv Lev's own contribution is treated.
- [ ] **s18A loss rule**, **refunds and chargebacks**, and **what happens when a charity changes its name.** Decisions.
- [ ] **Legal wording approved** by Yosef: Privacy Policy and Terms are drafts. Also the entity line, the fee sentence and the trademark question from the brand kit.
- [ ] **Domain, registrar and hosting** chosen.
- [ ] **App calendar choices:** Shabbos and Yom Tov end at sunset plus 72 minutes (confirm), whether "today" follows the phone's time zone or Johannesburg, and whether Elul shows "Shana tova" instead of "Good Shabbos".

## B. Before the switch (technical)

- [ ] Run the database changes on the real database **first**, in order, up to and including `20261014000002_resume_waits_for_charge_day.sql` (the last six are `20261011000001_confirmation_credentials.sql`, `20261012000001_bank_edit_clears_verified.sql`, `20261013000001_monthly_giving.sql`, `20261013000002_erase_donor.sql`, `20261014000001_account_deletion_unblocked.sql` and this one). Then deploy the website code. Doing it the other way round makes new donations fail.
- [ ] Back up the real database before running them. Write down how to undo (restore the backup).
- [ ] Live settings in place and checked: site address, encryption key, database keys, email sending, gateway keys. None of the test values.
- [ ] **Test gateway is off:** `ALLOW_TEST_GATEWAY` is not set on the live site and the payment gateway setting is the real one.
- [ ] The gateway's webhook points at the live address, with signature checking on.
- [ ] Re-run the dependency audit (`npm audit` in the main folder and in `apps/mobile`). Known and unfixable today: `braces`, `node-forge`, `decode-uri-component`. Check whether patched versions now exist.
- [ ] A normal website build with the real font access passes, plus typecheck, lint and all tests.
- [ ] Phone app: build and submit through the app stores. In-app giving is a switch (`EXPO_PUBLIC_IN_APP_GIVING`, off unless set to `yes` in the EAS environment). Leave it off for the first store submission. Before turning it on, check the current App Store and Google Play rules for donations inside apps (as I understand them: charity approval, offering Apple Pay on iPhone, disclosure of how funds are used, and Google's payments and fundraising policy), and update the app privacy and data-safety answers (payment details are handled by the payment provider, not the app). Decision.
- [ ] In-app giving test on real phones (iPhone and Android) with the test gateway: open the sheet, pay, return to the app, thank-you appears. Then one small real payment after go-live.
- [ ] A new native build is needed for the store apps because `expo-web-browser` was added (Expo Go already has it).

## C. First live day

- [ ] One small real donation with Yehuda's own card. Check: the thank-you page, the confirmation email, the donation shows as paid, the charity sees it without the donor's private choice, and the s18A flow behaves as agreed.
- [ ] Refund that donation and check what the system does (see the refund decision in A).
- [ ] Send the webhook twice (or replay it from the gateway) and check nothing is counted twice.
- [ ] Check the confirmation link from a different device and from a signed-in account.
- [ ] Look at unprocessed rows in `gateway_events` at the end of the day. There should be none.
- [ ] Watch the first week: any payment stuck as pending, any error emails.

## D. Later ideas (not for go-live)

HTML version of the confirmation email, yahrzeit giving, a tax pack, dedications, real charity photos from the charities.
