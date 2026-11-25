# App review notes (DRAFT, 25/11/2026)

Ready-to-paste text for the "Notes for reviewers" box in App Store Connect (App Review Information) and the Play Console (App access, and the notes field). Draft only: Yehuda reads it, fills in the two placeholders on the day he pastes it, and Yosef checks anything legal.

**Never commit the real reviewer email or code.** They are set on the live server as `REVIEW_SIGN_IN_EMAIL` and `REVIEW_SIGN_IN_CODE` (code at least 8 characters, see `src/lib/review-sign-in.ts`). Switch both off after approval. Test the whole flow on a store-like build before submitting.

---

## Paste this (App Store Connect and Play Console)

Givezy is a South African giving app. Donors find charities that Givezy has checked and approved, give to them, keep a record of their giving and get s18A tax receipts. There is no password.

**How to sign in (please follow exactly)**
1. Open the app and tap Account (bottom right).
2. Type this email address: `<REVIEWER_EMAIL>`
3. Tap "Send me a sign-in code".
4. Type this code, and ignore any code that is emailed: `<REVIEWER_CODE>`
5. Tap "Sign in", and agree to the Terms if asked.

The account is a new, empty donor account made for review. It has no gifts, no receipts and no saved card, on purpose: it is a real account on our live service, and we do not put anyone's real giving history, or made-up payments, in it. You will see empty states (for example "No messages yet"). A real donor's account fills as they give.

**Giving.** Giving opens in the phone's browser on our website by design, where the card is entered on our payment provider's own page. The app never handles card details and has no card fields. Giving inside the app is switched off in this version. Please do not complete a real payment. If you want to see the payment page, you can open it and leave without paying: nothing is charged.

**Charities.** Every charity is checked and approved by Givezy before it is listed (registration, bank account and a person spoken to). Charities manage their pages on our website, not in the app.

**Delete my account.** Account, then "Delete my account" (under Your information). It is inside the app, shows what is deleted and what is kept (records tax law requires us to keep), and asks you to type DELETE. If you signed in more than 10 minutes ago it first emails a code. The reviewer sign-in above cannot be deleted (so the app can be checked again), and will say so; please create a different account with your own email if you want to see a deletion complete. The same instructions are public at https://givezy.co.za/delete-account (Play Console: use as the data deletion link once the live site is open).

**Support.** hello@givezy.co.za, or WhatsApp 078 616 0489 (South African number). Privacy policy: https://givezy.co.za/privacy

**Donations and the optional contribution.** In this version, donations are made in the browser only. Donors may add an optional contribution to Givezy's running costs on top of their gift; it is clearly separate and can be set to zero.

---

## Checklist for Yehuda before submitting

Nothing here is done for you. Tick each one.

- [ ] **Reviewer sign-in works.** `REVIEW_SIGN_IN_EMAIL` and `REVIEW_SIGN_IN_CODE` set on the live server; tried on a store-like build with a phone that has never signed in; the account shows empty. Placeholders above replaced by the real values only in the store consoles.
- [ ] **Live site reachable.** The app's `EXPO_PUBLIC_SITE_URL` points at an address that is not in coming-soon mode (the app's calls are refused there). `/privacy` and `/delete-account` open on the public domain.
- [ ] **Delete my account tried on a real phone** with a throwaway account (code arrives, confirmation email arrives, old sign-in no longer works). Yosef has approved the deletion wording (`src/lib/delete-account.ts`).
- [ ] **Google Play account type.** Personal or organisation (Play Console, Settings, Account details). If it is a personal account created after 13/11/2023, Google requires a closed test with at least 12 testers for 14 days before production access (check Google's current page, it changes). Start early.
- [ ] **Written questions to Apple and Google about donations** (see the go-live list, item "App Store and Google Play: rejection risks", point 3): may a for-profit platform collect donations for individually approved charities; is the provider's page in an in-app browser acceptable; what counts as an approved nonprofit; is Givezy's optional contribution allowed. Keep their answers in writing. Until answered: browser-only giving, in-app giving switches off (`EXPO_PUBLIC_IN_APP_GIVING`, `APP_GIVING`).
- [ ] **Privacy forms.** Apple privacy label and Google Data safety answers reviewed by Yosef; privacy policy URL and support URL set in both consoles; read any privacy-manifest warnings from the EAS build.
- [ ] **Age rating and content rating.** Answers: no public user content, no gambling, financial transactions happen in the browser, giving needs an adult (18+); same in Play's content rating questionnaire.
- [ ] **Store listing screenshots** show no "Placeholder photo" labels and no sample data.
- [ ] **After approval:** switch the reviewer sign-in off (remove both settings).
