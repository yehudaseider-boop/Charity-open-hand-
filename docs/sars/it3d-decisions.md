# IT3(d) export: decisions and open questions (03/11/2026)

What Givezy builds for a charity's IT3(d) submission, and every choice made where the SARS BRS (v4.0.0D-10, copied in `it3d-spec.md`) is silent or unclear. "p." is the BRS page; "Guide p." is GEN-ENR-01-G03 Rev 6.

Code: `src/lib/receipts/it3d.ts` (pure builder), `src/lib/receipts/it3d-store.ts` (loader), `src/lib/receipts/it3d-sheet.ts` (capture sheet), `src/lib/receipts/it3d-request.ts` (owner check), `src/lib/sars-numbers.ts` (Appendices I, J, K), page and routes under `src/app/charity-admin/[id]/receipts/sars/`. Migration `20261103000001_it3d_charity_details.sql`.

## Decided by Yehuda (02-03/11/2026)

1. **Each charity submits its own IT3(d).** The charity is the Submitting Entity (SE) and the one Reporting Entity (RE) in its file. Givezy is not a submitting entity.
2. **Donors asking for an s18A receipt give their SA ID number** (required); the income tax number is optional, checked with Modulus 10 if given. A company gives its CIPC number (Appendix K); a trust a non-empty trust number. Applied to the donate form, the app's shared rules (`validation.ts`) and gifts a charity records itself (`recorded-gifts.ts`). Old receipts with only a tax number are listed as blocking problems: SARS's file has no way to report them (field 412 is mandatory, field 411 may not be 009, p.225).
3. **The charity's SARS details**: income tax reference number, legal form (SARS Nature of Person) and registration number, in `charity_private` (never public; the charity's admins can read them; only the server writes them, after checking the person is the owner). Edited on the SARS page itself (the "Public profile" page is for public details). Legal form offers exactly: Other company (OTHER_CO), Trust (any type) (INTERVIVOS_TRUST), Association not for gain (ASSOC_NOT_FOR_GAIN), Other entity (UNINCORPORATED_BODY_OF_PERSONS), Government entity (GOVERNMENT_ENTITY), the five field 306 allows (p.216), because the BRS does not say which one a non-profit company uses (open question 9).

## What Givezy offers (spec section 5)

- **eFiling capture sheet (.xlsx)** for up to 50 receipts (Guide p.14): the charity's block once at the top, then one row per donation in the IT3-01 form's order, then totals. Downloads even with problems; each problem row says "Fix before submitting" or "Check". Dates in the sheet are dd/mm/yyyy (house style; the form is typed by a person), the data file uses CCYY-MM-DD.
- **SARS data file (.psv)** for HTTPS (Guide p.4). Refused while any blocking problem remains.

## Choices for the BRS's open questions

| Topic | Choice | Spec ref |
|---|---|---|
| Field order in a record | BRS table order (ascending field number, with GH's gap 10 to 14) | p.203, open question 1 |
| Body order | All RE, then all DE, then all DR | p.16 rule d, p.18 check 5, open question 2 |
| Line ending | CR LF after every record, the trailer too | p.17, open question 3 |
| Encoding | Latin-1 bytes. A character outside Latin-1 (or a control character) is a blocking problem, never changed silently | p.16 rule h |
| Pipe, leading space, too long | Blocking problem to fix; nothing is ever shortened. Trailing spaces are trimmed | p.16 f, p.19 n |
| File Hash Total (603, MW) | Left empty: accepted with a warning; the MD5 input (line endings, encoding, case) is not defined | p.234-235, open question 4 |
| File name | `I3D_1_<field 216>_<Unique File ID>_<CCYYMMDDThhmmss>.psv` | p.20, open question 5 |
| Unique File ID (5) | A random UUID (letters, digits, dashes; no underscores) | p.205-206, open question 22 |
| Submission Tax Year (203) | The year the year of assessment ends (1 March 2026 to 28 February 2027 = 2027). Matches the project's own convention: `taxYearFor`/`taxYearRange` in `src/lib/dates.ts` and `s18a_receipts.tax_year` already name a tax year by the year it ends | p.210, open question 14 |
| Periods | "First six months" (1 March to 31 August) and "Full tax year" (1 March to end of February), in 204/205. Only gifts whose Johannesburg paid date is inside the period go in | Guide p.3, p.27; open question 15 |
| Unique Numbers | RE = `RE-<charity id>-<tax year>`; DE = `DE-<charity id>-<key>`, key = the receipt's donor identity fingerprint in hex (first 40 characters), or the donor record id for a receipt without one; DR = `DR-<donation id>`. Stable across files so a re-send is recognised. One DE per donor identity in a file, even across two receipts | p.215, p.222, p.232 |
| Record Status | Always N. Corrections (C) and deletions (D) are not built yet: a correction today is made on eFiling (Guide p.36-39) | p.214 |
| Row Number | 1..n across all B records | p.215-216 |
| Header (GH) | Test Data Indicator chosen at download (default Live); I3D; HTTPS; version 1; create date now, Johannesburg time; Source System "Givezy", version from package.json; contact person = the charity's contact (first names / last word as surname) | p.205-209 |
| Source Identifier (10) | Typed at download, exactly 144 characters, sent by POST, used for that file only, never stored or logged | p.208 |
| Phones | Digits only, national starting 0, international 00. A number starting 06/07/08 (or an international one) goes in the cell field, anything else in the telephone field with 999999999999999 as the cell, as SARS instructs | p.213, p.221, p.231 |
| Email | The email, or NO@EMAIL.COM when there is none (or it breaks SARS's 80-character rule, with a note) | p.214, p.231 |
| Charity and donor address | Postal fields only (line 1, line 2, suburb as line 3, city as line 4, postal code); physical fields empty (BRS: at least one of the two) | p.219-221, p.229-231 |
| SE identification | OTHER_CO: type 004 with the CIPC number (Appendix K). INTERVIVOS_TRUST: type 007 with the trust number. Any other legal form: blocking problem "SARS needs an identification number for the submitting entity. Ask your accountant which number to use." (the capture sheet still downloads) | p.211-212 |
| Individual donor | INDIVIDUAL, type 001, ID number (Appendix J). Initials = first letter of each given name; Names = given names one space apart; Surname = last name | p.224-227 |
| Date of birth (415) | From the ID number: 1900s when YY is greater than this year's two digits, else 2000s | p.226, open question 11 |
| Donor tax number (414) | Given and passing Modulus 10 with a first digit of 0, 1, 2, 3 or 9: sent. Otherwise left empty (CW allows it for now) with an amber note | p.226 |
| Company donor | **Assumption:** reported as PRIVATE_CO (unlisted company) with type 004 and the CIPC number, because we don't ask whether a company is listed or a close corporation. Amber note on the page and on each company row | p.246 |
| Trust donor | INTERVIVOS_TRUST, type 007, the trust number | p.246, p.263 |
| Nature of Donation (508) | CASH for every gift: card, EFT, cash, debit order and another giving programme are all money (`RECORDED_METHODS`). A recorded gift of method "Other" could be goods: it is sent as CASH with an amber note to report it as IN SPECIE on eFiling if it was goods | p.233 |
| Date Paid (509) | The donation's paid date in Johannesburg time | p.234 |
| Rand Value (510) | `centsToRandDecimal` in `money.ts`: two decimals, no separators, "0.50" under a Rand | p.234 |
| Which donations | Donations on the charity's ISSUED receipts for the tax year (withdrawn ones left out), still paid (refunded and charged-back left out), paid inside the period. Recorded gifts count too | - |
| Names and address source | The gift's own checkout details (the record the receipt snapshot was printed from), newest gift on the receipt. The snapshot joins name and address into lines, which SARS wants apart. The receipt number comes from the snapshot | - |
| Trailer | 602 = number of B lines; 603 empty; 604 = sum of 510 | p.234-235 |
| No donations | No file (604 must be at least 0.01). Page says: "No s18A receipts in this period. If SARS asks for a nil declaration, it is done on eFiling, not with this file." | p.235, open question 13 |

## Validators compared with the spec

- **Appendix I (Modulus 10)**: implemented as written; SARS's example 0001339050 passes. First digit 0/1/2/3/7/9 for the charity (216, 312), 0/1/2/3/9 for donors (414).
- **Appendix J (SA ID)**: implemented as written; SARS's example 800101 5009 087 passes. `src/lib/sa-id.ts` (used where people type the number) computes the same check digit with the Luhn formula from the right, and is stricter (the date must exist, the citizenship digit must be 0 or 1). A test checks 4 000 numbers: every number `sa-id.ts` accepts passes Appendix J, and none with a real date and citizenship 0/1 differs. The file uses Appendix J only.
- **Appendix K (company number)**: `CCYY/NNNNNN/NN`, year 1800 to this year, suffix 06, 07, 08, 09, 10, 11, 20 to 26, 30, 31. Numbers typed with spaces, dashes or no separators are written with slashes.

## Who can do what

Owner only (as for thank-donors and contact imports), with the second step, rate-limited like other exports (10 in 10 minutes), audit-logged (`charity.it3d_file_downloaded`, `charity.it3d_capture_sheet_downloaded`, `charity.sars_details_saved`: counts and which fields changed, never an ID number or the Source Identifier). Full ID numbers appear only in the downloaded files; the page shows the last 4 digits.

## Open, to confirm with SARS's test environment or an accountant

1. Field order and body order (grouped RE/DE/DR) are accepted by SARS: send a test file.
2. CR LF accepted as "a carriage return".
3. File name with field 216 in place of "field 28".
4. Which Nature of Person a non-profit company is registered under (OTHER_CO is our default suggestion only through the accountant).
5. How an association, other entity or government body identifies itself as submitting entity.
6. Company donors: listed or unlisted, close corporations.
7. Whether old tax-number-only receipts should be reported on eFiling by hand, or left out.
8. The first-six-months file: Givezy issues s18A receipts once a year after the tax year ends, so a first-six-months file for the current year is empty. Ask whether SARS expects a bi-annual IT3(d) for annual receipts.
9. Record Status C and D (corrections and deletions) in the file.
10. The date MW and CW fields (603, 414) become mandatory.
11. The privacy wording: the home page and Privacy Policy say charities never see a donor's ID or tax number. The owner now downloads them for SARS. Yosef to approve new wording before charities use this.
12. Two files for one year: downloading the "First six months" file and later the "Full tax year" file for the same year re-sends the first-half DE and DR records with the same Unique Numbers (field 404 is `DE-<charity>-<tax year>-<donor key>`, field 504 `DR-<donation id>`) and Record Status N. SARS may answer with duplicate response code 500 (file response 004 or 006, p.17). Corrections (status C) are not built yet. Confirm in SARS's test environment before a charity sends two files for one year.
