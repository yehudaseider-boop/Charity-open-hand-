// Sections 7 to 10 and the appendices.
export function part4(ctx, H) {
  const { TAG, w, wt, h1, h2, qlist, table, c, AUD } = H;
  const { questions, pages, psv, worked, it3dResult, tests, esc } = ctx;
  let out = "";

  // ===================================================================== 7
  out += `<section class="sec">${h1("s7", "7. Terms, charity agreement and platform conduct")}
  <p>Written mainly for the attorney. The Terms and Privacy Policy exist as draft pages on the test site. Both show a "draft for legal review" notice until a setting is switched, and every blank shows "[to be confirmed]". Nothing has been approved.</p>
  ${w("src/app/terms/page.tsx", "src/app/privacy/page.tsx", "src/config/legal.ts (reviewedByLegal: false)")}
  ${h2("s7_1", "7.1 What the draft pages say now (key clauses, word for word)")}
  ${table(["Page and section", "Clause as the reader sees it", "Note"], [
    ["Terms, About these terms", "\"These terms apply to the Givezy website and app, run by [to be confirmed]. By donating, signing in or listing a charity you agree to them and to our Privacy Policy. South African law applies.\"", "No operator named yet."],
    ["Terms, Donating", "\"Your donation goes to the charity you choose. Givezy does not charge a fee on donations.\"", "Matches platform.ts."],
    ["Terms, Donating", "\"You may add a separate contribution to Givezy (minimum R10). It is optional, is not a donation to the charity, and does not appear on any s18A receipt.\"", "{{Q:4:contribution}}"],
    ["Terms, Donating", "\"Payments are taken by our payment provider on our website, never inside the app.\"", "True today; false once in-app giving is switched on. Must be reworded first."],
    ["Terms, Donating", "\"Refunds: [to be confirmed] (policy to be confirmed).\"", "No refund policy. {{Q:3:cpa}}"],
    ["Terms, Donating", "\"You must be 18 or older, and the details you give must be true. If you give for an organisation, you confirm you are allowed to.\"", ""],
    ["Terms, s18A receipts", "\"If a charity is approved under section 18A and has signed a receipting mandate with us, we issue one receipt per tax year on its behalf for donations where you asked for one. A receipt covers your donations only, never a contribution to Givezy. Whether a donation is tax-deductible is between you and SARS.\"", "{{Q:4:platform}} to {{Q:4:annual}}"],
    ["Terms, Charities", "\"A charity listed on Givezy confirms that: the person applying is authorised to act for it, and its information and documents are true; it will use donations for the purposes it describes, and tell us at once if its registration, PBO or s18A status changes; it will use donors' information only to record donations and thank donors, keep it secure under POPIA, and not sell or share it; it is responsible for any donor information it downloads from its dashboard. We may suspend or remove a charity that breaks these terms. [to be confirmed] (full charity agreement to be confirmed).\"", "Does not yet mention SARS files or emailing donors. {{Q:7:agreement}}"],
    ["Terms, Our responsibility", "\"Givezy is a platform that connects donors with registered charities. The charity, not Givezy, is responsible for how donations are used. [to be confirmed] (limits of liability to be confirmed).\"", "{{Q:7:liability}}"],
    ["Privacy, Who we are", "\"Givezy is run by [to be confirmed], registration number [to be confirmed], [to be confirmed]. We are the responsible party for your personal information under the Protection of Personal Information Act (POPIA).\"", "{{Q:6:roles}}"],
    ["Privacy, Why we use it", "\"We do not sell your information, and we do not send you marketing.\"", "Conflicts with charities' news and appeals. {{Q:6:marketing}}"],
    ["Privacy, Who we share it with", "\"Our payment provider: what it needs to take your payment. [to be confirmed] (to be named once chosen).\" and \"Some of these providers may store information outside South Africa. [to be confirmed] (where, and the safeguards in place, to be confirmed).\"", "{{Q:6:crossborder}}. The provider can now be named."],
    ["Privacy, Who we share it with", "\"It does not see your ID or tax number on Givezy, your private labels, or any contribution to Givezy. The one exception is the law: a charity that issues s18A receipts must report each receipt to SARS (its IT3(d) return), with the donor's name, ID or registration number and address. The charity's owner can download that report from Givezy for that purpose only.\"", "Added 03/11/2026, draft. {{Q:6:ids}}"],
    ["Privacy, How long we keep it", "\"Donation and receipt records are kept for as long as tax law requires. [to be confirmed] (period to be confirmed).\"", "{{Q:4:retention}} and {{Q:6:erasure}}"],
    ["Privacy, How we protect it", "\"ID numbers, tax numbers and bank account numbers are encrypted. Access is limited to the people who need it, and admins must use an authenticator app. Every charity sees only its own donors.\"", "Checked in section 9."],
    ["Privacy, Special personal information", "A section saying a donor's private label may reveal sensitive facts, is kept only because the donor gives it, and only the donor can see it.", "{{Q:6:special}}"],
  ])}
  ${h2("s7_2", "7.2 How a charity is checked before it is listed")}
  <ol>
    <li><b>Invitation or application.</b> A platform administrator can invite a charity by email (a link that works once, for 30 days), or the charity applies on the website. Sign-in is by emailed code, then the Terms agreement and a second step with an authenticator app.</li>
    <li><b>The application</b> asks for: the organisation's names, an NPO or PBO number (at least one), its registered address, a contact person, and a bank account in the organisation's name (the account number is encrypted). <b>Documents:</b> a bank confirmation letter always; a PBO approval letter if it has a PBO number; and, to issue s18A receipts, the SARS s18A approval and the signed receipting mandate.</li>
    <li><b>Four declarations</b> are ticked on submitting: the person is authorised, the information is true, the terms are accepted, and donor information will be handled under POPIA. They are stored with the person and the charity.</li>
    <li><b>Review by hand</b> by a platform administrator (second step), promised within 2 working days: the registration, the bank confirmation letter and, for s18A, the approval and mandate. Approval marks the bank details verified. What will go public is shown on the review page.</li>
    <li><b>Bank check with the provider</b> (information only; it never approves anything). ${TAG.proof} It has not been confirmed that it works for a business account without a company registration number.</li>
    <li><b>Connecting to the provider.</b> An administrator creates the charity's payout account; only then can it take donations. A change to the bank details disconnects the charity and clears "verified".</li>
    <li><b>After approval</b> an administrator can suspend or reinstate a charity (the contact is emailed and the page is hidden; no donations; monthly gifts not collected; history kept), remove a person's access, and reset a lost second step after calling a number already on file (logged, and the person is emailed). A rename, or a new logo or cover, is allowed but logged and emailed to the team.</li>
    <li>${TAG.no} <b>Not built:</b> sanctions screening, automatic register lookups (NPO, PBO, company), and a second reviewer. Approval is one administrator.</li>
  </ol>
  ${w("src/lib/charity/checklist.ts", "src/app/apply/", "src/app/admin/charities/[id]/actions.ts", "src/lib/charity/emails.ts", "docs/decisions.md (Charity sign-up; Platform admin controls after approval)", "supabase/migrations/20261012000001_bank_edit_clears_verified.sql")}
  ${h2("s7_3", "7.3 What the charity agreement must cover")}
  <p>Today a charity ticks four declarations and accepts the Terms. We think a charity agreement must cover:</p>
  <ul>
    <li><b>Fee:</b> none on donations today; whether anything is charged for receipting gifts a charity records itself is undecided.</li>
    <li><b>Settlement:</b> gifts settle straight to the charity's own account; the provider's charge is borne by the charity; timing is the provider's; a bank change reconnects the charity only after checking.</li>
    <li><b>Suspension and removal</b>, and what happens to donors, monthly gifts and data when it happens.</li>
    <li><b>Refunds and chargebacks:</b> who bears them, and the charity's help in answering a dispute before the provider's deadline.</li>
    <li><b>False statements and misuse of funds:</b> what we may do, and any indemnity.</li>
    <li><b>The s18A mandate:</b> authority to issue, void and re-issue; that the statement on the receipt is the charity's; records; term and ending.</li>
    <li><b>SARS files:</b> the charity's duty to keep the files it downloads (which hold donors' full ID numbers) safe and use them only for SARS.</li>
    <li><b>Donor information:</b> the charity as responsible party for its own lists, notes and emails; the rules for emailing donors; no use of imported contacts by Givezy.</li>
    <li><b>Public content:</b> photos and updates it may share, consent for people shown, and Givezy's right to remove.</li>
    <li><b>Changes:</b> telling us at once if its registration, PBO or s18A status changes.</li>
  </ul>
  ${h2("s7_4", "7.4 Moderation of public text")}
  <ul>
    <li>Charity photos (up to 12), updates (up to 500 characters) and campaigns are published as soon as they are posted. Givezy administrators can remove any. Nothing is edited in place. Who posted is kept for us and never shown publicly. The dashboard asks charities to post only photos they may share and never to show a family who receives help without consent. ${TAG.built}</li>
    <li>A charity's thank-you email goes out as plain text under Givezy's sender; control and direction characters are stripped; links are allowed. Whether a body with a link should wait for platform approval is undecided (phishing risk if a charity account is taken over). ${TAG.no}</li>
    <li>Donors' own text (message, dedication name, label) is private to the donor and the charity (3.6) and is length-limited and cleaned of control characters; there is no word filter.</li>
  </ul>
  ${w("docs/decisions.md (Real photos and updates)", "src/lib/charity/appeals-rules.ts (clean)", "src/lib/donations/dedication.ts", "tests/charity-stories-db.test.ts")}
  ${h2("s7_5", "7.5 Draft wording that needs approval")}
  ${table(["Wording", "Where it lives", "Who decides"], [
    ["Terms and Privacy Policy, including the entity line, the fee sentence, refund policy, limits of liability and retention", "src/app/terms, src/app/privacy", "Yosef"],
    ["The s18A statement on the receipt, and the particulars it prints", "src/config/receipts.ts, src/lib/receipts/html.ts", "Yosef"],
    ["The receipting mandate", "Not written", "Yosef"],
    ["The monthly authorisation tick, the monthly emails (\"could not collect\", \"has stopped\") and card-on-file rules", "src/app/c/[slug]/donate/donate-flow.tsx, src/lib/donations/monthly-email.ts", "Yosef (emails also Yehuda)"],
    ["Direct marketing: the checkout line, the stop-link wording, a Privacy line that charities may send news and appeals, and whether recorded or imported donors may be emailed", "donate-flow.tsx, src/lib/charity/appeals-rules.ts", "Yosef"],
    ["The monthly thank-you emails: covered by the notice, or opt-in?", "src/lib/charity/thank-you.ts", "Yosef"],
    ["The privacy wording about SARS files (Privacy Policy and the home page card \"Your ID stays off the dashboard\") and a charity-terms line", "src/app/privacy/page.tsx, src/app/page.tsx", "Yosef"],
    ["What an erasure keeps, and for how long", "src/lib/privacy/erase.ts (ERASE_KEPT_TEXT)", "Yosef"],
    ["The app's single \"18 or older and agree\" tick; the Terms sentence on payments inside the app; the saved-card consent line (\"Save my card for next time\")", "apps/mobile/src, src/app/terms/page.tsx", "Yosef"],
    ["A line for \"kind of giver\" (an optional answer kept on the account)", "src/app/privacy/page.tsx", "Yosef"],
    ["Retention of unused charity invitations (suggested: delete 90 days after they expire)", "Not written", "Yosef"],
  ])}
  <h2>7.6 Questions on terms, the charity agreement and conduct</h2>
  ${qlist(7)}
</section>`;

  // ===================================================================== 8
  out += `<section class="sec">${h1("s8", "8. Givezy's own tax and corporate position")}
  <p>For the accountant and the attorney together.</p>
  ${h2("s8_1", "8.1 The company that does not exist yet")}
  <ul>
    <li>No company is registered. The legal settings that feed the Terms, Privacy Policy and footer are all empty: company name, registration number, address, Information Officer (name and email), privacy email and support email. Nothing is guessed; each shows "[to be confirmed]".</li>
    <li>The intended order is: a first proof of concept in the founder's personal name (3.5), then company registration, then the company's own email and bank account. The domain givezy.co.za is registered at GoDaddy (16/10/2026). The app's developer accounts are set up under the founder's individual Apple account, with a move to a company account planned.</li>
  </ul>
  ${w("src/config/legal.ts", "docs/go-live-checklist.md (Givezy's registered details; App identity)")}
  ${h2("s8_2", "8.2 What Givezy will earn")}
  ${table(["Source", "Position in the code and decisions"], [
    ["<b>Donor contributions</b>", "Optional; unticked by default; any amount from R10 (a flat amount per payment, kept separate from the gift; stored as <code>contribution_cents</code>). Not a donation to the charity; never on a receipt; hidden from the charity. Monthly donors can include a contribution in the monthly total."],
    ["<b>A fee on donations</b>", "None. <b>The settings define no platform fee, percentage or flat, and no processing fee</b> (decision of 08/10/2026). The only fee-like value is the provider's charge, which the charity bears, and for which the rates are empty."],
    ["<b>A charge for receipting gifts a charity records itself</b> (EFT, cash, imports)", "None today; undecided."],
    ["<b>Anything else</b>", "Nothing decided. Cause of the week and similar features carry no payment."],
  ])}
  ${w("src/config/platform.ts", "src/lib/fees.ts", "docs/decisions.md (Donation model and app hand-off)", "docs/go-live-checklist.md (Recorded gifts and fees)")}
  ${h2("s8_3", "8.3 VAT")}
  <ul>
    <li>The VAT setting is <code>enabled: false</code> with <code>ratePercent: "15"</code>, with the comment "Off until the company is VAT-registered". We state no registration threshold.</li>
    <li>Every donation row carries a VAT-on-fee amount (<code>fee_vat_cents</code>) and a platform fee (<code>platform_fee_cents</code>). The code writes R0 to both for every donation. Contributions have no VAT line today.</li>
    <li>Open decision: once VAT-registered, whether the contribution is shown inclusive or exclusive of VAT (decisions file, open item 2, phrased for the fee).</li>
    <li>If the provider's rates are later entered as <i>excluding</i> VAT, the "cover the card charge" calculation adds 15% on top of them (from the VAT setting); if they include VAT, it adds nothing. The rates are empty, so this is not in use.</li>
  </ul>
  ${w("src/config/platform.ts (vat)", "src/lib/donations/card-charge.ts", "supabase/migrations/20261006000001_core_schema.sql (donations)")}
  ${h2("s8_4", "8.4 Income tax, the provider's fees, and the expense side")}
  <p>How Givezy's income is taxed, in the founder's hands now and in a company later, is for you (${"{{Q:8:income}}"}); the code has nothing on it. The provider's charge is carried by the charity under the current setting; if the setting is changed so that Givezy bears it, the code supports that, but no rate exists to show what it would cost.</p>
  <p>Costs named in our documents, with no figure being fixed (to be re-checked on the day, and each paid plan needs the founder's approval):</p>
  ${table(["Cost", "What our documents say"], [
    ["Website hosting (Vercel)", "Free plan is for non-commercial use only. Pro is \"about $20 a month\" and is needed before the first real donation."],
    ["Database (Supabase)", "Free plan pauses after a week without visitors and has no daily backups. Pro is \"from about $25 a month\" and is needed before going live."],
    ["Payment provider", "Rates empty until supplied. A bank-account check costs R3 per successful request, per the provider's documents."],
    ["Email (Resend)", "Free allowance; price to be checked in Rand before signing up."],
    ["Apple and Google developer fees", "Apple annual, Google one-off; the current price is to be checked on the day. No figure in the repository."],
    ["Domain", "givezy.co.za at GoDaddy; no figure in the repository."],
  ])}
  ${w("docs/go-live-checklist.md (Hosting: Vercel; Supabase Pro; Email sending; App identity)", "docs/launch-plan.md")}
  <h2>8.5 Questions on Givezy's own position</h2>
  ${qlist(8)}
</section>`;

  // ===================================================================== 9
  const t = tests;
  out += `<section class="sec">${h1("s9", "9. Controls and evidence")}
  ${h2("s9_1", "9.1 What we promise, how it is enforced, how to verify")}
  ${table(["We promise", "How it is enforced", "How to verify"], [
    ["Nothing is marked paid without the provider's own confirmation of the exact amount", "The server asks the provider for the payment; only success, in ZAR, for exactly the total expected marks a gift paid. A different amount is held and logged.", "src/lib/donations/confirm.ts; tests/payment-persistence.test.ts, tests/donation-confirmation.test.ts"],
    ["A payment message is processed once", "Each message is stored under a unique (provider, event id) key; a repeat is acknowledged and ignored unless the first never finished. A gift moves pending to paid only once (conditional update), and a database rule limits status changes.", "src/app/api/webhooks/[gateway]/route.ts; supabase/migrations/20261009000016_review_fixes.sql (guard_donation_status); tests/webhook-route.test.ts, tests/webhook-retry.test.ts"],
    ["The provider's messages are genuine", "The signature on each message is checked (HMAC-SHA512 of the body). Marked in the code as to be verified against the provider.", "src/lib/gateway/paystack.ts (parseWebhook); tests/paystack-gateway.test.ts"],
    ["Amounts are whole cents", "Money columns are integers (bigint); percentages are whole parts per million; no floating point in money code.", "src/lib/money.ts, src/lib/fees.ts; tests/money.test.ts, tests/fees.test.ts"],
    ["Amounts of a processed gift cannot change", "A database rule refuses changes to amounts, charity and donor after the gift leaves pending.", "supabase/migrations/20261009000016_review_fixes.sql"],
    ["A charity sees only its own donors", "Row-level security: a charity's team can read donors who gave to that charity, in limited columns, and nothing of other charities. Fees, contributions, provider data and any ID digits are outside that lane.", "supabase/migrations/20261009000009_privacy_lanes.sql; tests/privacy-db.test.ts, tests/rls.test.ts"],
    ["Owner-only gates: SARS files, imported lists, thank-you emails", "The server checks the person is the charity's owner (and has done the second step) before it serves or accepts these; ten downloads in ten minutes at most. A platform administrator counts as owner (open decision).", "src/lib/receipts/it3d-request.ts; src/lib/charity/team.ts; tests/thank-donors-owner.test.ts, tests/charity-contacts-actions.test.ts"],
    ["Second step for charity and platform admins", "Admin pages require an authenticator-app code; the database policies for admins check it. A live check that an emailed code alone cannot add a second authenticator is still to do.", "src/lib/mfa.ts; supabase/migrations/20261006000002_row_level_security.sql; docs/go-live-checklist.md"],
    ["ID, tax and bank numbers are encrypted", "AES-256-GCM, key in an environment variable and not in the database; only masked digits are displayed.", "src/lib/crypto.ts; tests/crypto.test.ts"],
    ["Receipts cannot be edited, only voided with a reason", "A database trigger refuses any change except attaching the PDF and withdrawing with a reason; deletes are refused.", "supabase/migrations/20261006000001_core_schema.sql, 20261009000016_review_fixes.sql; tests/receipts-db.test.ts"],
    ["One receipt per donor identity, per charity, per year", "A unique index in the database.", "supabase/migrations/20261009000008_receipt_identity.sql"],
    ["The audit log is append-only and holds no ID numbers", "A trigger refuses update and delete; the code writes references, counts and reasons.", "supabase/migrations/20261006000001_core_schema.sql; src/lib/audit.ts"],
    ["Erasure clears what identifies a person", "One database function in a single step, then the charity-side notes, personal thank-yous and the sign-in account.", "src/lib/privacy/erase.ts; supabase/migrations/20261020000001_review_fixes.sql; tests/erase-donor-db.test.ts"],
    ["Rate limits slow guessing and card testing", "Counts per email and per address: checkout 5 per email and 30 per address in 10 minutes; sign-in links 5 an hour per email; ten code tries an hour; data download 5 an hour; charity downloads 10 in 10 minutes; appeals 5 sends a day.", "src/lib/rate-limit.ts; src/lib/donations/checkout.ts; src/app/login/actions.ts"],
    ["The test payment gateway never runs on the live site", "The code refuses it wherever the hosting environment says production.", "src/lib/gateway/index.ts; tests/test-gateway.test.ts"],
    ["Card details never reach us", "The donor types them on the provider's page; the app has no card fields.", "src/lib/gateway/paystack.ts (createCheckout)"],
  ])}
  ${h2("s9_2", "9.2 Things the controls do not cover")}
  <ul>
    <li>The provider's real behaviour: nothing but one test donation has run against it. Field names for refunds, disputes and settlements are unconfirmed.</li>
    <li>Supabase's own sign-in limits and email life must be set in the live project; the website's limits do not cover direct calls from the app.</li>
    <li>No key-rotation procedure for the encryption key; no written breach plan; no backup and restore rehearsal.</li>
  </ul>
  ${w("docs/go-live-checklist.md (Supabase's own sign-in limits; Block password sign-ups; Back up the real database)")}
  ${h2("s9_3", "9.3 Testing evidence")}
  <div class="box ${t && t.fullRun ? "" : "warn"}">
    <p><b>Run on 04/11/2026</b> with <code>npm run test:no-db</code> (every test that does not need the database): <b>${t ? t.files : "n/a"} test files, ${t ? t.filesPassed : "n/a"} passed; ${t ? t.passed : "n/a"} tests passed, ${t ? t.skipped : "n/a"} skipped.</b> The one failing file (${t ? t.failedFile : ""}) fails only because it needs the database.</p>
    <p><b>The full run (<code>npm test</code>) could not be done here.</b> It needs the local test database, which is not available in the environment where this briefing was written: it stops with "connect ECONNREFUSED 127.0.0.1:54322 ... Nothing was tested". The repository holds ${t ? t.totalFiles : "n/a"} test files, of which ${t ? t.dbFiles : "n/a"} need the database (row-level security, receipts, erasure, privacy, monthly giving and others); a count of test declarations in those files gives roughly ${t ? t.dbCases : "n/a"} cases. They were not re-run for this briefing, so the real full-suite number today is not available to us. An earlier project document records 908 tests on 22/10/2026; that figure is older and is not re-verified.</p>
  </div>
  ${table(["Area", "Test files"], [
    ["Money and payments", "fees, money, card-charge, payment-persistence, donation-confirmation, webhook-route, webhook-retry, paystack-gateway, donations-db, monthly-job, monthly-schedule, monthly-giving-db, donation-reverse, deposits, payouts-db, admin-payments-page"],
    ["s18A receipts", "receipts, receipts-db, receipt-runs, receipt-runs-db, receipt-words, receipt-route, year-list, tax-pack"],
    ["IT3(d) and SARS numbers", "it3d (45 cases), it3d-store, it3d-db, sars-numbers (16 cases), sa-id"],
    ["Privacy and security", "privacy-db, rls, erase-donor-db, erase-donor-flow, email-erased, return-privacy, crypto, one-click-stop, appeals, appeals-db"],
  ])}
  ${w("tests/ (all files named above)", "package.json (scripts: test, test:no-db)", "docs/legal-briefing/samples/test-run.json")}
</section>`;

  // ===================================================================== 10
  const list = (items) => `<ul class="small">${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
  out += `<section class="sec">${h1("s10", "10. Open items we already know")}
  <p>Everything not built or not decided, from the project's go-live checklist and decisions file, grouped by who must act. One line each. The questions in the earlier sections are in Appendix A and are not all repeated here.</p>
  <div class="two">
  <div>
  <h3>Attorney (Yosef)</h3>
  ${list([
    "Approve Terms and Privacy Policy; entity line, fee sentence, trademark question.",
    "Approve the s18A statement and particulars; full ID printing; who signs; donor contact and charity logo.",
    "Write the receipting mandate.",
    "Monthly authorisation, card-on-file rules and monthly emails.",
    "The app's single tick; the Terms sentence on in-app payments; saved-card consent line.",
    "Direct marketing wording; recorded and imported donors; monthly thank-yous.",
    "What an erasure keeps, and for how long; imported contacts; notes in an access request; shared emails in a download.",
    "SARS files wording; charity terms line on keeping them safe.",
    "Refund policy; chargeback and s18A loss rule; charity name changes.",
    "Information Officer and Regulator registration; breach plan.",
    "Cross-border safeguards; operator agreement with charities.",
    "Donors with no SA ID (non-residents).",
    "Whether a platform administrator should count as owner of every charity.",
    "Retention of unused charity invitations.",
  ])}
  <h3>Accountant</h3>
  ${list([
    "Nature of Person and identification numbers for charities as SARS entities.",
    "Interim and nil IT3(d) declarations; the 31 October and 31 May dates.",
    "Enrolment for third-party data; SARS test environment.",
    "Old tax-number-only receipts; listed companies and close corporations; goods (IN SPECIE).",
    "Corrections and deletions; two files for one year.",
    "How a part-refunded gift counts on a receipt.",
    "Reconciling deposits to receipts; bookkeeping for gift, contribution and fee.",
    "Givezy's VAT and income tax; entity form.",
    "Each charity's first live IT3(d) submission checked by its own accountant.",
  ])}
  </div>
  <div>
  <h3>Yehuda</h3>
  ${list([
    "Register the company; fill in the legal settings (name, number, address, Information Officer, privacy and support emails).",
    "Supply the provider's rates (percent, fixed, VAT included or not); decide payment options beyond cards.",
    "Approve the R3 per bank check cost; finish the provider's test steps (declined card, monthly, refund, dispute, deposits).",
    "Set up email sending (account, domain records, test sends); set the admin alert email.",
    "Paid plans for hosting and database before the first real donation; backups.",
    "Remove test settings, set live keys and the webhook, run every database change on the live database in order after a backup.",
    "Make sure someone reviews new applications within 2 working days.",
    "Decide: sign-in lockout rule; link policy in thank-yous; monthly amount when rates change; a monthly donation paused for a dispute; a dispute the charity wins; partial refunds; payment method stored on the gift; saved cards; clean-up of undo files.",
    "Fix the receipt run for the hosting time limit.",
    "Decide what the phone keeps after the app is deleted.",
    "Update the go-live documents to the sole-proprietor proof of concept.",
  ])}
  <h3>SARS</h3>
  ${list(["Confirm IT3(d) due dates and the nil-declaration route.", "Confirm field order, body order, line ending, file name and hash by test file.", "A test Source Identifier."])}
  <h3>The payment provider</h3>
  ${list(["Rate sheet; the lifetime cap and what it counts.", "Settlement schedule and the settlement and refund field names.", "Whether a bank check works for a business account.", "Declined card, monthly and refund behaviour in test mode.", "Which payment channels are offered."])}
  <h3>Apple and Google</h3>
  ${list(["Written confirmation that donations inside the app are allowed (and card-on-file); then app privacy answers.", "Sign-in with Apple and Google set up before social sign-in is switched on."])}
  </div></div>
  ${w("docs/go-live-checklist.md", "docs/decisions.md", "docs/launch-plan.md")}
</section>`;

  // ===================================================================== Appendix A
  const group = (title, aud, note) => {
    const qs = questions.filter((q) => aud.includes(q.audience));
    return `<h2>${title}</h2><p class="small muted">${note}</p>${qs
      .map((q) => `<div class="qa"><div class="qt"><span class="qid">${q.id}</span><span>${q.text}</span></div><div class="why">Why we ask: ${q.why}</div><div class="ans">Answer:</div></div>`)
      .join("")}`;
  };
  out += `<section class="sec pb">${h1("appA", "Appendix A. All questions, with room for answers")}
  <p>${questions.length} questions. They are grouped by who answers. Questions marked Both appear in the last group only; please answer them together.</p>
  ${group("A.1 For the attorney", ["A"], "Questions marked Attorney.")}
  ${group("A.2 For the accountant", ["T"], "Questions marked Accountant.")}
  ${group("A.3 For both of you", ["B"], "Questions marked Both.")}
</section>`;

  // ===================================================================== Appendix B
  out += `<section class="sec pb">${h1("appB", "Appendix B. Sample section 18A receipt")}
  <p>Made by calling the real receipt builder (<code>src/lib/receipts/html.ts</code>) with fictional data: a donor called "Sample Donor", a fictional charity, a made-up ID number that passes the check digit (only its last 4 digits print), and a fake PBO number. The receipt number, dates and amounts are invented. It is shown here as it would print, without the DRAFT mark that real receipts carry until the wording is confirmed. Generated by <code>docs/legal-briefing/make-samples.ts</code>.</p>
  <div class="samples">${pages.map((p, i) => `<div class="sample"><img src="${p}" alt="Sample receipt page ${i + 1}"><div class="cap">SAMPLE: not a real receipt (page ${i + 1} of ${pages.length})</div></div>`).join("")}</div>
</section>`;

  // ===================================================================== Appendix C
  out += `<section class="sec pb">${h1("appC", "Appendix C. Sample IT3(d) file")}
  <p>Made by the real builder (<code>buildIt3d</code> in <code>src/lib/receipts/it3d.ts</code>) from fictional data: one fictional charity, two donors, three donations, tax year 2026, marked as a test file. Fields are separated by the pipe character. Long lines wrap here; in the real file each record is one line ending in a carriage return and line feed. The 144-character Source Identifier is a placeholder ("SAMPLE-SOURCE-IDENTIFIER" followed by X). The two ID numbers are made up. The charity's tax reference 0001339050 is the example SARS itself uses for its check-digit rule. The builder reported <b>no problems</b>: ${it3dResult.totals.receipts} receipts, ${it3dResult.totals.donors} donors, ${it3dResult.totals.donations} donations, total R2 034.57.</p>
  <p class="small"><b>File name:</b> <code>${esc(it3dResult.fileName)}</code></p>
  <pre class="mono">${esc(psv.replace(/\r\n/g, "\n").replace(/\n$/, ""))}</pre>
  ${table(["Record (first two fields)", "What it holds in this sample", "Fields"], [
    ["H|GH", "Header: creation time 2026-05-10T09:30:00 (Johannesburg), layout version 1, a random file id, test indicator T, data type I3D, channel HTTPS, the Source Identifier, source system Givezy, the charity's contact person, telephone and email.", "18"],
    ["H|SE", "Submitting entity: the charity itself: tax year 2026, period 2025-03-01 to 2026-02-28, legal form OTHER_CO, names, identification type 004 with the CIPC number, the SARS reference, postal address, contact.", "25"],
    ["B|RE", "Reporting entity: the same charity as the s18A organisation, with its PBO number, address and contact; the last field N means this is not a nil declaration.", "29"],
    ["B|DE (x2)", "Donor entities: surname, initials and names, identification type 001 (SA ID) and the ID number, date of birth taken from the ID, nature INDIVIDUAL, postal address, phone and email. The second donor has no phone or email, so the standard placeholders 999999999999999 and NO@EMAIL.COM are used.", "32"],
    ["B|DR (x3)", "Donation records: each points to its donor entity, carries the s18A receipt number, nature CASH, the date paid and the Rand value (500.00, 1234.57 and 300.00).", "10"],
    ["T", "Trailer: 6 body records, an empty hash field, and the sum of the Rand values (2034.57).", "4"],
  ])}
  ${w("docs/legal-briefing/make-samples.ts", "docs/legal-briefing/samples/sample-it3d.psv", "docs/sars/it3d-spec.md")}
</section>`;

  // ===================================================================== Appendix D
  out += `<section class="sec">${h1("appD", "Appendix D. Glossary")}
  ${table(["Term", "Meaning"], [
    ["s18A", "Section 18A of the Income Tax Act, 1962: a donor's tax deduction for gifts to an approved public benefit organisation, claimed with a receipt."],
    ["PBO", "Public benefit organisation: a charity approved by SARS for tax purposes."],
    ["NPO / NPC", "Non-profit organisation / non-profit company: forms in which many South African charities are registered."],
    ["Association not for gain", "A kind of organisation SARS lists as its own category of entity."],
    ["IT3(d)", "The return a section 18A organisation sends SARS listing the receipts it issued, donor by donor."],
    ["BRS", "SARS's Business Requirement Specification: the technical document that defines the IT3(d) file. We followed version 4.0.0D-10 of 07/10/2022."],
    ["eFiling", "SARS's online filing service. Up to 50 IT3(d) certificates can be typed into a form there; larger submissions use a data file."],
    ["Modulus 10", "A check-digit rule SARS uses to test tax reference numbers."],
    ["Submitting entity / reporting entity", "The party that sends the file to SARS / the s18A organisation the file is about. In our files both are the charity."],
    ["Source Identifier", "A 144-character code SARS issues to an enrolled submitter for data-file submission."],
    ["Nil declaration", "A declaration that no s18A receipts were issued in a period."],
    ["Mandate", "The signed document in which a charity authorises Givezy to issue s18A receipts in its name."],
    ["POPIA", "The Protection of Personal Information Act, 2013."],
    ["Responsible party / operator", "Under POPIA, the party that decides why and how personal information is used / a party that processes it for the responsible party."],
    ["Information Officer", "The person in an organisation who is answerable under POPIA and must be registered with the Information Regulator."],
    ["FICA", "The Financial Intelligence Centre Act, 2001: duties on accountable institutions to know their customers and report suspicious transactions."],
    ["Split payment", "A single card payment that the payment provider divides between two accounts when it settles."],
    ["Subaccount", "The provider's name for a charity's own payout account within Givezy's merchant account."],
    ["Settlement / deposit", "A payout from the payment provider into a bank account."],
    ["Chargeback", "A donor disputes a card payment with their bank and the money is taken back, pending the provider's and the merchant's answer."],
    ["Row-level security", "A database feature that stops a user reading rows they should not, enforced by the database whatever the website code does."],
    ["Second step", "A one-time code from an authenticator app, required on top of the emailed sign-in code for charity and platform administrators."],
    ["Webhook", "A message the payment provider sends to our server to say a payment succeeded, failed, was refunded or was disputed."],
    ["Tax year", "1 March to the end of February, named here by the year it ends (2026/27 is 01/03/2026 to 28/02/2027; stored as 2027)."],
  ])}
</section>`;

  // ===================================================================== Appendix E
  out += `<section class="sec">${h1("appE", "Appendix E. References")}
  <h3>SARS and legal documents</h3>
  <ul class="small">
    <li>SARS External BRS "IT3 Data Submission", version 4.0.0D-10, 07/10/2022, 272 pages. Copy of its IT3(d) rules: <code>docs/sars/it3d-spec.md</code>.</li>
    <li>SARS eFiling guide GEN-ENR-01-G03, Revision 6, effective 07/04/2026, 41 pages. Cited in the same file as "Guide p.".</li>
    <li>SARS notice GN 3631 (section 18A receipt particulars, effective 1 March 2023) and section 18A(2) of the Income Tax Act, 1962. We could not open these from the build environment; the list we used is the one in <code>docs/go-live-checklist.md</code>.</li>
    <li>Provider documents quoted in the checklist: the payment provider's API specification (09/06/2026) and its pages on split payments and account validation. Not checked again for this briefing.</li>
    <li>Older draft: <code>docs/legal-questions-for-yosef.pdf</code> (08/10/2026), used only to see which topics Yosef already knows about.</li>
  </ul>
  <h3>Files in the repository</h3>
  ${table(["Topic", "Files"], [
    ["Settings", "src/config/platform.ts, src/config/receipts.ts, src/config/legal.ts"],
    ["Money", "src/lib/fees.ts, src/lib/money.ts, src/lib/donations/ (checkout.ts, confirm.ts, reverse.ts, card-charge.ts, monthly-job.ts, schedule.ts, recurring.ts), src/lib/gateway/paystack.ts, src/app/api/webhooks/[gateway]/route.ts"],
    ["Receipts", "src/lib/receipts/ (html.ts, details.ts, plan.ts, issue.ts, runs.ts, store.ts, pdf.ts, words.ts), supabase/migrations/20261006000001, 20261009000003, 20261009000008, 20261009000016, 20261015000005"],
    ["IT3(d)", "src/lib/receipts/it3d.ts, it3d-store.ts, it3d-sheet.ts, it3d-request.ts, src/lib/sars-numbers.ts, src/lib/sa-id.ts, docs/sars/, src/app/charity-admin/[id]/receipts/sars/"],
    ["Privacy", "src/lib/crypto.ts, src/lib/privacy/erase.ts, src/lib/charity/appeals.ts, src/lib/email/, supabase/migrations/20261009000009, 20261020000001, src/app/account/data/"],
    ["Charities", "src/lib/charity/checklist.ts, src/app/apply/, src/app/admin/charities/[id]/actions.ts"],
    ["Wording", "src/app/terms/page.tsx, src/app/privacy/page.tsx, donate-flow.tsx"],
    ["Decisions and open items", "docs/decisions.md, docs/go-live-checklist.md, docs/launch-plan.md, docs/paystack-test-script.md"],
    ["This briefing", "docs/legal-briefing/ (README.md, build and render scripts, samples/)"],
  ])}
</section>`;
  return out;
}
