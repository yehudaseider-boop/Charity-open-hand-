// Sections 5 and 6: the IT3(d) report to SARS, and personal information.
export function part3(ctx, H) {
  const { TAG, w, wt, h1, h2, qlist, table, c } = H;
  const esc = ctx.esc;
  let out = "";

  // ===================================================================== 5
  out += `<section class="sec pb">${h1("s5", "5. IT3(d) report to SARS")}
  <p>Written mainly for the accountant. A charity that issues section 18A receipts must report each receipt to SARS on a return called IT3(d). Givezy does not submit anything to SARS. It prepares the data for each charity, and each charity (or its accountant) submits it.</p>
  ${h2("s5_1", "5.1 What SARS requires")}
  <ul>
    <li><b>Documents we followed:</b> SARS External BRS "IT3 Data Submission", version 4.0.0D-10 of 07/10/2022 (272 pages), and the eFiling guide GEN-ENR-01-G03 Revision 6 (41 pages, effective 07/04/2026). Our reading of both, page by page, is in two files in the repository. The BRS PDF has tracked changes: struck-through rules still print as live text, so every IT3(d) page was checked visually and deleted rules were not implemented.</li>
    <li><b>Who reports:</b> entities that received donations and issued receipts report those receipts. Where a charity received no donations a "nil reporting declaration" is required (Guide p.4).</li>
    <li><b>How:</b> the guide describes a cycle of "bi-annual and annual" submissions (Guide p.3), but <i>neither document states IT3(d) due dates</i>. Up to 50 IT3(d) certificates can be typed into the IT3-01 form on eFiling (Guide p.14; the guide also says 20 in one place, p.4). Larger submissions use a data file sent by HTTPS or Connect Direct, which needs the organisation to be enrolled and activated for third-party data on eFiling, and a 144-character Source Identifier from SARS. The declaration (IT3-02) is made at the submitting entity's level.</li>
    <li><b>Test environment:</b> the BRS has a test indicator and says SARS publishes a test Source Identifier on its website; the guide does not describe the test environment.</li>
  </ul>
  ${w("docs/sars/it3d-spec.md", "docs/sars/it3d-decisions.md")}
  ${h2("s5_2", "5.2 What Givezy builds for each charity")}
  ${table(["What", "Status", "Where to check"], [
    ["A <b>problems check</b> for the chosen tax year and period: every receipt is checked against the BRS rules. A blocking problem (for example a missing address, a donor ID that fails the check digit, a character SARS cannot hold) stops the data file; a warning does not. Each problem says where to fix it.", TAG.built, "src/lib/receipts/it3d.ts; tests/it3d.test.ts, tests/sars-numbers.test.ts"],
    ["An <b>eFiling capture sheet</b> (.xlsx) for up to 50 receipts: the charity's block once, then one row per donation in the IT3-01 form's order, then totals. It still downloads when there are problems; each affected row says \"Fix before submitting\" or \"Check\".", TAG.proof, "src/lib/receipts/it3d-sheet.ts; not yet typed into eFiling by an accountant"],
    ["The <b>SARS data file</b> (.psv, pipe-separated, Latin-1) for submission by HTTPS. Refused while any blocking problem remains.", TAG.proof, "src/lib/receipts/it3d.ts (buildIt3d, it3dBytes); never sent to SARS or its test environment"],
    ["Only the charity's <b>owner</b> can download; second step required; ten downloads in ten minutes at most; every download audit-logged (counts and which fields changed, never an ID number or the Source Identifier). A platform administrator counts as owner of every charity.", TAG.built, "src/lib/receipts/it3d-request.ts; src/lib/charity/team.ts (memberRole)"],
    ["The charity's own SARS details (income tax reference, legal form as SARS's Nature of Person, registration number) are kept in a private table, written only by the server after checking the person is the owner.", TAG.built, "supabase/migrations/20261103000001_it3d_charity_details.sql"],
  ])}
  <p><b>Record types and field counts</b> (from the BRS; the sample in Appendix C has the same counts):</p>
  ${table(["Record", "What it holds", "Fields", "How many in a file"], [
    ["GH", "File header: date, version, test or live, channel (HTTPS), the Source Identifier, Givezy as the source system, contact person", "18", "1"],
    ["SE", "Submitting entity: the charity, its SARS reference and identification number, address, contact", "25", "1"],
    ["RE", "Reporting entity: the charity as the s18A organisation, with its PBO number and a null-declaration flag", "29", "1"],
    ["DE", "Donor entity: one per donor identity (name, ID or registration number, date of birth, address, contact)", "32", "one per donor"],
    ["DR", "Donation record: our receipt number, nature (CASH or IN SPECIE), date paid, Rand value", "10", "one per donation"],
    ["T", "Trailer: number of body records, an empty hash, the sum of all Rand values", "4", "1"],
  ])}
  ${w("docs/sars/it3d-spec.md (sections 3.1 to 3.6)", "docs/legal-briefing/samples/sample-it3d-result.json")}

  ${h2("s5_3", "5.3 Who submits, and the twice-a-year cycle")}
  <ul>
    <li><b>Each charity submits its own file.</b> It is the submitting entity and the only reporting entity in its file (decision of 02/11/2026). Givezy is not a submitting entity, and no charity has yet been enrolled for third-party data.</li>
    <li><b>Due dates: what we know and do not know.</b> Our understanding is an interim IT3(d) for receipts issued 1 March to 31 August, due 31 October, and an annual one for the full tax year, due 31 May, plus a nil declaration when nothing was issued. This comes from accounting-firm and PBO-support sources. SARS's own page could not be reached from where we work, and the BRS and the guide do not state it. <b>Please confirm the 2026/27 dates.</b></li>
    <li><b>The consequence for us.</b> Givezy issues receipts once a year, after the tax year ends. So the interim file (first six months) is empty and, if SARS expects a nil declaration, it is made on eFiling, not with a file; the page says so. The alternative is receipting twice a year, which would need a mid-year receipt run. That is undecided (${"{{Q:5:interim}}"}).</li>
    <li><b>Nil declarations.</b> With no donations no file can be built (the trailer's total must be at least R0.01), so a nil declaration is made on eFiling.</li>
  </ul>
  ${w("src/app/charity-admin/[id]/receipts/sars/page.tsx", "docs/go-live-checklist.md (IT3(d) twice a year)")}

  ${h2("s5_4", "5.4 Donor identification, old receipts and privacy")}
  <ul>
    <li><b>An SA ID number is now required for s18A</b> (decision of 03/11/2026). A tax number alone is not accepted by SARS: the donor identification field is mandatory and the "internal number" type is not allowed (BRS p.225). An individual gives an SA ID number (income tax number optional); a company its CIPC number; a trust its trust number.</li>
    <li><b>Old receipts with only a tax number</b> cannot go in the file and show as blocking problems. Whether to report them by hand on eFiling or leave them out is undecided (${"{{Q:5:oldreceipts}}"}).</li>
    <li><b>Monthly donors</b> who set up an s18A monthly gift before 03/11/2026 with only a tax number: each new monthly gift copies those details, so their receipts would keep showing as a problem. We chose not to remove s18A from their gifts; instead a notice and an SA ID field appear in that monthly donation's card on their account page, with an "ask first" confirmation. An email nudge is not built because email sending is not set up.</li>
    <li><b>Privacy consequence.</b> The charity's owner downloads full ID numbers for SARS and for that purpose only; the page shows only the last 4 digits. Draft wording added to the Privacy Policy on 03/11/2026 says so, and a home page card says "Your ID stays off the dashboard"; both await Yosef, and the charity terms need a line that the charity keeps those files safe and uses them only for SARS.</li>
    <li>A donor who asked for erasure cannot be put in a file; their receipt shows as a blocking problem to report from the charity's own records.</li>
  </ul>
  ${w("src/lib/receipts/it3d.ts", "src/lib/donations/monthly-id-nudge.ts", "src/app/privacy/page.tsx", "docs/go-live-checklist.md (Privacy wording; Monthly donors who set up)")}

  ${h2("s5_5", "5.5 Every assumption where the SARS document is silent or unclear")}
  <p>Taken from <code>docs/sars/it3d-decisions.md</code>, with the BRS page ("p.") or guide page. "Spec Q" is the numbered question list in <code>docs/sars/it3d-spec.md</code>. All of these were written without ever sending a file to SARS.</p>
  ${table(["Topic", "What we chose", "Ref", "A SARS test or the accountant must confirm"], [
    ["Field order in a record", "BRS table order (ascending field number; GH has a gap from 10 to 14)", "p.203", "SARS accepts this order (open 1, Spec Q1)"],
    ["Body order", "All RE, then all DE, then all DR", "p.16 d, p.18", "SARS accepts grouped, not nested, order (open 1, Spec Q2)"],
    ["Line ending", "CR LF after every record, the trailer too", "p.17", "CR LF counts as \"a carriage return\" (open 2, Spec Q3)"],
    ["Encoding", "Latin-1 bytes. A character outside Latin-1, or a control character, is a blocking problem and is never changed silently", "p.16 h", "No doubt recorded"],
    ["Pipe, leading space, too long", "Blocking problem to fix; nothing is ever shortened. Trailing spaces are trimmed", "p.16 f, p.19 n", "No doubt recorded"],
    ["File Hash Total (603)", "Left empty: SARS accepts it with a warning. The MD5 input (line endings, encoding, case) is not defined", "p.234 to 235", "What to hash, and the date the field becomes mandatory (open 4 and 10, Spec Q4, Q21)"],
    ["File name", "<code>I3D_1_[field 216]_[Unique File ID]_[CCYYMMDDThhmmss].psv</code>", "p.20", "Field 216 is meant where the BRS says \"field 28\" (open 3, Spec Q5)"],
    ["Unique File ID (5)", "A random UUID (letters, digits, dashes, no underscores)", "p.205 to 206", "No doubt recorded (Spec Q22)"],
    ["Submission Tax Year (203)", "The year the tax year ends: 01/03/2026 to 28/02/2027 is 2027", "p.210", "That this is what SARS means (Spec Q14)"],
    ["Periods", "\"First six months\" (1 March to 31 August) and \"Full tax year\"; only gifts whose Johannesburg paid date is inside the period", "Guide p.3, p.27", "Whether SARS expects a bi-annual file from annual receipts, and the due dates (open 8, Spec Q15)"],
    ["Unique Numbers", "RE = RE-[charity id]-[tax year]; DE = DE-[charity id]-[year]-[donor key]; DR = DR-[donation id]. Stable across files so a re-send is recognised. One DE per donor identity in a file", "p.215, 222, 232", "A second file for the same year may be answered as a duplicate (code 500) (open 12)"],
    ["Record Status", "Always N (new). Corrections (C) and deletions (D) are not built; corrections are made on eFiling", "p.214", "How a filed record is corrected (open 9)"],
    ["Row Number", "1 to n across all body records", "p.215 to 216", "No doubt recorded"],
    ["Header (GH)", "Test indicator chosen at download (default Live); I3D; HTTPS; version 1; create time in Johannesburg time; Source System \"Givezy\"; contact = the charity's contact person", "p.205 to 209", "No doubt recorded"],
    ["Source Identifier (10)", "Typed by the person downloading, exactly 144 characters, sent by POST, used for that file only, never stored or logged", "p.208", "SARS supplies it; a test one is published on SARS's site"],
    ["Phones", "Digits only, national numbers start 0, international 00. A number starting 06, 07 or 08 goes in the cell field, anything else in the telephone field with 999999999999999 as the cell, as SARS instructs", "p.213, 221, 231", "No doubt recorded"],
    ["Email", "The email, or NO@EMAIL.COM when there is none or it breaks the 80-character rule (with a note)", "p.214, 231", "No doubt recorded"],
    ["Charity and donor address", "Postal fields only (line 1, line 2, suburb as line 3, city as line 4, postal code); physical fields empty (BRS needs at least one of the two)", "p.219 to 221, 229 to 231", "No doubt recorded"],
    ["Submitting entity identification", "OTHER_CO: type 004 with the CIPC number. INTERVIVOS_TRUST: type 007 with the trust number. Any other legal form: a blocking problem (\"Ask your accountant which number to use\"); the capture sheet still downloads", "p.211 to 212", "Which number an association, other entity or government body uses (open 5)"],
    ["Charity's Nature of Person", "A charity chooses among the five values field 306 allows: Other company, Trust (any type), Association not for gain, Other entity, Government entity. The BRS does not say which a non-profit company uses", "p.216, 246", "Which one an NPC uses (open 4, Spec Q9)"],
    ["Individual donor", "INDIVIDUAL, type 001, ID number. Initials = first letter of each given name; Names = given names one space apart; Surname = last name", "p.224 to 227", "No doubt recorded"],
    ["Date of birth (415)", "Taken from the ID number: 1900s when YY is greater than this year's two digits, otherwise 2000s", "p.226", "The BRS has no rule for an unknown date (Spec Q11)"],
    ["Donor tax number (414)", "Sent when it passes Modulus 10 and starts with 0, 1, 2, 3 or 9; otherwise left empty (allowed for now) with an amber note", "p.226", "The date the field becomes mandatory (open 10)"],
    ["Company donor", "<b>Assumption:</b> reported as PRIVATE_CO (unlisted company) with type 004 and the CIPC number, because we do not ask whether a company is listed or a close corporation. Amber note on the page", "p.246", "Listed companies and close corporations (open 6)"],
    ["Trust donor", "INTERVIVOS_TRUST, type 007, the trust number", "p.246, 263", "No doubt recorded"],
    ["Donor with no ID", "Blocking problem: the identification field is mandatory and the internal-number type is forbidden", "p.225", "Old tax-number-only receipts: by hand on eFiling or left out (open 7)"],
    ["Nature of Donation (508)", "CASH for every gift (card, EFT, cash, debit order and another programme are all money). A recorded gift of method \"Other\" could be goods: sent as CASH with an amber note to report IN SPECIE if it was goods", "p.233", "That CASH is right for \"Other\" ({{Q:5:donors}})"],
    ["Date Paid (509)", "The gift's paid date in Johannesburg time", "p.234", "No doubt recorded"],
    ["Rand Value (510)", "Two decimals, no separators, \"0.50\" under a Rand", "p.234", "No doubt recorded"],
    ["Which donations", "Gifts on the charity's <i>issued</i> receipts for the tax year (withdrawn receipts left out), still paid (refunded and charged-back left out), paid inside the period. Gifts the charity recorded count too", "none", "That this matches what SARS expects to see"],
    ["Names and address source", "The gift's own checkout details (newest gift on the receipt), because the receipt snapshot joins name and address into lines and SARS wants them apart. The receipt number comes from the snapshot", "none", "No doubt recorded"],
    ["Trailer", "602 = number of body lines; 603 empty; 604 = sum of all Rand values", "p.234 to 235", "See File Hash Total"],
    ["No donations", "No file is built (604 must be at least 0.01). The page says a nil declaration is done on eFiling", "p.235", "How a nil IT3(d) is sent (open 8, Spec Q13)"],
  ])}
  <p><b>Validators.</b> The Modulus 10 rule (Appendix I of the BRS), the SA ID rule (Appendix J) and the company number rule (Appendix K, <code>CCYY/NNNNNN/NN</code>) are implemented as written. SARS's own examples pass (0001339050 for Modulus 10; 800101 5009 087 for the ID). The ID check used where people type their number is stricter than Appendix J; a test runs 4 000 numbers to show that every number the stricter check accepts also passes Appendix J.</p>
  ${w("docs/sars/it3d-decisions.md", "src/lib/sars-numbers.ts", "src/lib/sa-id.ts", "tests/sars-numbers.test.ts")}
  <h2>5.6 Questions on the IT3(d) report</h2>
  ${qlist(5)}
</section>`;

  // ===================================================================== 6
  out += `<section class="sec">${h1("s6", "6. Personal information (POPIA)")}
  <p>Written mainly for the attorney. Protection claims below are taken from the code and database migrations; the database-backed tests that cover them (<code>tests/privacy-db.test.ts</code>, <code>tests/rls.test.ts</code>, <code>tests/erase-donor-db.test.ts</code>) could not be run again for this briefing (see 9.3). "Row-level security" means the database itself refuses to show a row to the wrong person, whatever the website code does.</p>
  ${h2("s6_1", "6.1 Every category of personal information we hold")}
  ${table(["Category", "Why", "Who can see it", "How it is protected", "Retention and erasure"], [
    ["<b>Donor identity and contact:</b> name or organisation, email, optional phone", "Take the gift, send the confirmation, tell the charity who gave", "The donor; the charity they gave to (name, contact, amount, message); Givezy administrators (second step)", "Row-level security; writes only by the server", "Kept for the account and records. On erasure the name, email (replaced by a placeholder), phone are cleared; the gift's amount, date, charity and tax year stay"],
    ["<b>Address</b> (only when an s18A receipt is asked for)", "Required on the receipt and in the SARS file", "The donor; the charity (as typed at checkout); on the receipt and in the IT3(d) file", "As above", "Cleared on erasure, but the issued receipt keeps the address printed on it"],
    ["<b>SA ID number, income tax number, registration number</b>", "s18A receipt and the SARS file", "Donor (own download). The charity's dashboards show none of it (the owner sees the last 4 digits on the SARS page) and the owner gets full numbers only inside the SARS files. Administrators see only the encrypted value", "AES-256-GCM, key held outside the database; the last 4 digits kept separately; a keyed fingerprint (not the number) tells people apart. No key-rotation procedure exists yet (the stored value only carries a version tag)", "Cleared on erasure. The receipt keeps the last 4 digits and any company or trust registration number"],
    ["<b>Amounts and giving history</b>, optional contribution, dates", "Records, receipts, totals", "Donor; charity (gift only); administrators", "Row-level security; amounts cannot change once processed (database rule)", "Kept as tax law requires; the period is not decided"],
    ["<b>The donor's own label</b>", "The donor's private records", "Only the donor", "Separate table the charity cannot read", "Deleted on erasure"],
    ["<b>Dedication and message</b>", "Passed to the charity", "Donor, charity", "Row-level security", "Wiped on erasure; never on the receipt"],
    ["<b>Notes, follow-ups and tags a charity keeps about donors</b>", "The charity's relationship with its donors", "That charity's team; administrators", "Row-level security; a tag can be used only within its own charity", "Deleted on donor erasure. Not in \"Download my information\" (open point)"],
    ["<b>Contact lists a charity imports</b> (name, phone, address, note)", "The charity's own donor list and receipting", "That charity's team", "Import is owner-only; never emailed by Givezy", "<b>Not cleared by donor erasure</b> (open point: charity is the responsible party)"],
    ["<b>Charity contact people and bank details</b>", "Vetting, paying the charity, contact", "The charity's team; administrators. Bank account numbers are encrypted and only the last 4 digits show", "Encryption as above; private table", "While the charity is listed; unused invitations: retention undecided"],
    ["<b>Sign-in email and profile</b> (and \"kind of giver\", an optional answer)", "Sign-in by emailed code", "The person; administrators", "Sign-in by code only; password sessions are refused; admins also need an authenticator code", "The account is deleted on erasure unless it belongs to someone who runs a charity or the platform"],
    ["<b>Saved card authorisation</b> (monthly or saved card)", "Collect monthly gifts", "Nobody (server only)", "Encrypted token; we hold no card number, only the last 4 digits, brand and expiry", "Destroyed on erasure"],
    ["<b>Payment provider messages</b> (webhooks)", "Idempotency and audit", "Server only", "No client may read the table", "Reduced to the reference and event on erasure"],
    ["<b>Agreements ticked</b> (policy version, time, which donation)", "Evidence of consent", "Server and the donor's download", "Server-only", "Account agreements deleted with the account; charity declarations stay with the charity"],
    ["<b>Audit log</b>", "Who did what", "Administrators (second step)", "Append-only: update and delete are refused by the database. It records counts and references; no full ID numbers", "Kept; no deletion period set"],
    ["<b>Technical:</b> IP address and email in rate-limit records; sign-in cookie", "Slow down fraud and guessing", "Server only", "Cleared by the same code that writes them", "About a day. No advertising or tracking cookies and no analytics"],
    ["<b>On the phone</b> (the app)", "Giving goals, an income log, saved charities, cause choices, the sign-in session", "The person on that phone", "iOS Keychain / Android Keystore; each signed-in person has their own copy; the income log and goals never go to our server", "Deleted with the app only in part: Keychain items normally survive deleting an app (open decision)"],
  ])}
  ${w("src/lib/crypto.ts", "supabase/migrations/20261009000009_privacy_lanes.sql", "supabase/migrations/20261020000001_review_fixes.sql (erase_donor_data)", "src/lib/privacy/erase.ts", "src/lib/rate-limit.ts", "apps/mobile/src/lib/secure-storage.ts", "docs/decisions.md (Privacy lanes)")}
  ${wt("Audit log rule: ", "supabase/migrations/20261006000001_core_schema.sql (audit_log_append_only)", "src/lib/audit.ts")}
  <p>The one thing erasure cannot clear is what has been printed on an issued s18A receipt, because issued receipts are immutable. The receipt keeps the donor's name, address, the last 4 digits of the ID and the registration number of a company or trust, and its PDF is kept in private storage.</p>

  ${h2("s6_2", "6.2 Responsible party and operator")}
  <p>Our proposal: <b>Givezy is the responsible party</b> for donor accounts, taking and recording the donation, and issuing receipts. <b>Each charity is the responsible party</b> for what it adds or does with its donors (its notes, tags, imported lists, the SARS files it downloads and any emails it sends), and Givezy is its <b>operator</b> for those. The draft Privacy Policy does not say this: it says Givezy is "the responsible party for your personal information" without exception. The charity terms say a charity "will use donors' information only to record donations and thank donors, keep it secure under POPIA, and not sell or share it" and "is responsible for any donor information it downloads". An operator agreement does not exist. See ${"{{Q:6:roles}}"}.</p>
  ${w("src/app/privacy/page.tsx", "src/app/terms/page.tsx", "docs/go-live-checklist.md (POPIA: erasure and imported contacts)")}
  ${h2("s6_3", "6.3 Consent and notices at checkout")}
  <p>Before paying, the donor sees these ticks (the first two are required; the stored record is the policy version, the time and the donation):</p>
  <div class="quote">"I am 18 or older[, and allowed to give on behalf of this organisation]."<br>"I agree to [the Terms and Privacy Policy], and that my details are shared with [charity] so they can record my donation. Givezy keeps any label I give it privately, for my own records."<br>"Give anonymously. Your name won't appear on public pages, campaign lists or live totals. [Charity] still sees your details, because it needs them to record your donation and issue your s18A receipt."<br>"Don't send me news or appeals from [charity]. You'll still get your confirmation and s18A receipt."</div>
  <p>Anyone who signs in must also tick, once for each version of the Terms, "I agree to the Terms and Privacy Policy" and "I am 18 or older". The app plans to merge the two into one tick (undecided).</p>
  ${w("src/app/c/[slug]/donate/donate-flow.tsx", "src/app/agree/", "src/lib/donations/checkout.ts (consents)")}
  ${h2("s6_4", "6.4 Direct marketing and thank-you emails")}
  <ul>
    <li><b>Charity news and appeals.</b> A charity's owner can email its donors through Givezy. Each email carries a one-click unsubscribe (the standard stop headers and a stop link). A donor who ticked "Don't send me news" at checkout, or pressed stop, is left out. At most 4 emails from one charity to one donor in 30 days (the database enforces it) and 5 sends a day per charity. The stop record is a hash of the address.</li>
    <li><b>Never emailed:</b> donors whose gifts were all recorded by the charity (EFT, cash, imports) because they never saw the tick, and contacts a charity imported from a list. The import confirmation says the details are for recording gifts and receipts only.</li>
    <li><b>Monthly thank-you.</b> A charity owner can have Givezy email that month's donors a thank-you (first name only, once a month, a stop link in each). It is owner-only since 02/11/2026.</li>
    <li>${TAG.no} Email sending is not switched on. The Privacy Policy still says "we do not send you marketing", which does not match charities' news and appeals; the line to add is in the checklist.</li>
  </ul>
  ${w("src/lib/charity/appeals.ts", "src/lib/charity/appeals-rules.ts (APPEALS_PER_MONTH = 4)", "src/lib/email/one-click-stop.ts", "tests/one-click-stop.test.ts, tests/appeals.test.ts")}
  ${h2("s6_5", "6.5 Cross-border transfers: provider by provider")}
  ${table(["Provider", "Role", "Personal information that goes to it", "Where"], [
    ["Supabase", "Database, sign-in, file storage", "Everything in 6.1 (ID and bank numbers encrypted before they reach it)", "Frankfurt (eu-central-1). No South African region exists"],
    ["Vercel", "Hosting and the daily job", "All traffic passes through; server logs", "Frankfurt (fra1)"],
    ["Email provider (Resend planned)", "Receipts, confirmations, sign-in codes, charity emails", "Recipient email, message text, receipt PDFs (name, address, last 4 digits)", "Region to be confirmed. Not set up"],
    ["Paystack", "Payment provider", "Donor email, amount, reference, a description; for a charity: its bank details. Card details are typed on its page and never reach us", "Region to be confirmed"],
    ["Apple and Google", "App distribution", "Developer accounts only; the app sends them no donor data", "Not applicable"],
    ["Expo", "App build and update service", "No donor information that we know of", "Region to be confirmed"],
    ["GoDaddy", "Domain registration", "The founder's registration details", "Not applicable"],
  ])}
  ${w("docs/go-live-checklist.md (Hosting: Vercel; Supabase)", "docs/decisions.md (Open, item 5)", "vercel.json", "src/lib/gateway/paystack.ts (createCheckout body)")}
  ${h2("s6_6", "6.6 Breach response, data subject requests, information officer, anonymity")}
  <ul>
    <li><b>Breach response.</b> ${TAG.no} No written plan or notification templates exist. What exists: the append-only audit log; a daily email to Givezy listing anything that needs a person (stuck payments, held items, failed emails, the monthly job not running); an immediate email on a chargeback; rate limits on sign-in, checkout and downloads. ${"{{Q:6:breach}}"}</li>
    <li><b>"Download my information".</b> ${TAG.built} A signed-in donor can download everything we hold about them (limited to five downloads an hour). Because everyone who gives with one email shares a donor record, the download includes details typed at each checkout with that email, even if someone else typed them; it does not include the notes a charity keeps.</li>
    <li><b>Correct, delete, stop using.</b> ${TAG.built} The donor sends a request from their account; it appears under Admin, Privacy requests; a platform administrator carries out the erasure (donor records and their charity-side notes and personal thank-yous; monthly donations stopped; sign-in account deleted unless they run a charity). A confirmation email is sent to the address read beforehand. Someone with no account can be erased by an administrator by email address.</li>
    <li><b>Information officer.</b> ${TAG.no} No one is named: the Privacy Policy shows "[to be confirmed]". Registration with the Information Regulator is on the go-live list.</li>
    <li><b>Anonymity.</b> "Give anonymously" applies to public pages only (see 3.6). The charity always sees the donor's details.</li>
  </ul>
  ${w("src/app/account/data/export/route.ts", "src/app/account/data/actions.ts", "src/app/admin/requests/", "src/lib/privacy/erase.ts", "src/lib/ops/daily.ts, src/lib/ops/alert.ts", "tests/erase-donor-db.test.ts, tests/erase-donor-flow.test.ts")}
  <h2>6.7 Questions on personal information</h2>
  ${qlist(6)}
</section>`;
  return out;
}
