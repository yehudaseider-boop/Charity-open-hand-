# Charity CRM build plan (from Yossi's notes, 09/11/2026)

Source: Yossi's "Givezy CRM — Feature Requirements (Charity Side)", 09/11/2026, checked against what is built.
Order: tax-time value first, then retention, then extras. Each step is one chunk: built, tested, pushed to the
test site, and checked by Yehuda before the next starts. Steps marked **Decision** or **Approval** wait for that.

## Phase 1: s18A receipts at tax time

1. **Preview, approve, decline or edit each certificate** (Yossi 2.3).
   On the yearly receipt list, each donor's certificate opens in a preview with Approve, Decline and Edit.
   Approve issues it and sends it to the donor (email, and in the app). Decline sends the donor a note to call
   the charity, with the charity's number. Edit lets the charity correct the donor's details (name, address,
   ID or tax number) and then approve. Amounts and gifts come only from recorded donations and can't be typed
   over, so the receipt always matches the SARS IT3(d) file. Every action goes in the audit log.
   Check: open the demo charity's receipts, approve one, decline one, edit one.
2. **"Asked for an s18A receipt" filter and reminder button** (2.1).
   Filter the donor list by asked / not asked / details missing. Button to remind selected donors to add
   their details (uses the existing reminder, at most once a week per donor).
3. **Charity's own logo and signatory on the certificate** (2.2). **Decision: Yosef** (already on his list).

## Phase 2: keeping donors

4. **Lapsed monthly donors, yearly view** (3). A count for the chosen period (tax year by default) that opens
   the list: name, last gift date, monthly amount, contact details, and Call / Email / Say thank you buttons.
5. **Thank-you wording the charity can edit** (5). The automatic thank-you after each gift keeps working; the
   charity can change the wording (with a preview and "back to Givezy's wording").
6. **Donor journeys** (1.1, 1.2, and the Thank donors tab folded in, 5). Built in three chunks:
   - 6a. One general journey: steps (email, wait X days), on/off, who is at which step.
   - 6b. Campaign journeys: donating to a campaign enrols the donor.
   - 6c. One limit across all journeys and thank-yous. Decided 09/11/2026: at most one message a week per donor.
   In-app messages come after push notifications (step 10).
7. **Win-back from the lapsed list** (3): add lapsed donors to a journey from step 4's list. Needs 6.

## Phase 3: donors and team

8. **Import template with phone and address** (4.1). ID and tax number stay optional. Decided 09/11/2026: optional.
9. **Roles: Admin, Finance, Fundraiser, Viewer** (6). The owner sets each person's role; sensitive actions
   (approve s18A, exports, IT3(d), bank, team) limited by role. Database rules updated so each role can only
   read what it may. Audit log shown readably ("Sarah approved the s18A receipt for ... on 03/03/2027").
10. **Push notifications in the app** (needed by 7.2 and in-app journey steps). Free with Expo; needs a new
    app build and the donor's permission on the phone. **Approval: Yehuda** before any push is sent to real
    people.
11. **App invites for imported donors** (4.2). **Decision: Yosef** on POPIA consent wording first, because
    these donors never signed up themselves. Then: invite email, donor checks their details and signs in.

## Phase 4: public profile

12. **Profile video** (7.1). Link a YouTube or Vimeo video first (no storage cost); uploads later if needed.
    Decided 09/11/2026: link first.
13. **Charity's own "focus right now"** (7.2). Charity picks a campaign, dates and a short message; shown on
    its profile and in the app. Push to its donors only after step 10, with a limit (suggest once a month).
    Givezy's own cause of the week stays as it is.
14. **Videos in updates and journeys** (1.3). After 12, same rules.

## Phase 5: SARS file history

15. **IT3(d) history** (9). Keep a record of each file compiled and downloaded (when, who, period, totals).
    Direct submission to SARS stays out: SARS takes bulk files only through its own channel with the
    charity's registration, so the charity uploads the file on eFiling.

## Parked

- **Netflorist gift cards** (8). Costs money, needs Netflorist's terms (API or manual vouchers), and a
  charity spending donations on donors needs its board's and Yosef's comfort. Revisit after the pilot.

## Open questions and who answers

| Question | Who | Our current answer |
|---|---|---|
| s18A fields; Givezy issuing on the charity's behalf | Yosef / accountant | Built per SARS; mandate draft with Yosef |
| One annual certificate or per donation | Decided | One per donor per tax year (built) |
| Can a third party submit IT3(d) | Accountant | No; the charity uploads (step 15) |
| ID and tax number optional on import | Decided 09/11/2026 | Optional |
| POPIA wording for invited donors | Yosef | Needed before step 11 |
| Most messages per donor per week | Decided 09/11/2026 | One |
| Netflorist | Yehuda | Parked |
| Video limits | Decided 09/11/2026 | Links first |
