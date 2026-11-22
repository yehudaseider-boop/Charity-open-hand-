# Asking Apple and Google about giving inside the app (draft, 22/11/2026)

Draft for Yehuda to check and send. Not sent.

## To Apple (App Review, guideline question)

Subject: Donations to registered South African charities inside a third-party app (3.2.1(vi))

Hello,

We are building Givezy, a free iPhone app (bundle ID za.co.givezy.app) for donors in South Africa. It lists registered South African charities (non-profit organisations and public benefit organisations) that we check by hand before they can receive a gift: their registration documents, their bank details against a bank letter, and a conversation with a named person at the organisation.

Our first version will send donors to our website in Safari to give, in line with guideline 3.2.2(iv). We would like to know whether we may later let donors give inside the app, set up as follows:

- The donor chooses a charity and an amount in the app and pays on our payment provider's page (Stitch, a South African payment provider). The app never sees card details.
- The payment settles directly to the charity's own bank account. Givezy does not hold the money at any point.
- Givezy takes no share of the gift. Charities pay Givezy a separate flat fee.
- We would offer Apple Pay on the payment page.
- A donor may also add an optional contribution to Givezy on top of the gift, to help keep Givezy running. It is shown separately from the gift, clearly marked as going to Givezy, and is not part of the charity's s18A receipt.
- Each charity issues the donor a tax receipt (an s18A receipt, under section 18A of the South African Income Tax Act), and every charity page says how the charity uses the money.

Our questions:
1. Does this fall under 3.2.1(vi), and if so, does each charity need to be approved by Apple as a nonprofit, and how would a South African charity do that?
2. Givezy itself is a company, not a nonprofit. Does that change the answer?
3. May the optional contribution to Givezy be offered in the app, or should it be offered only on our website?
4. Is there anything else we should change for this to be accepted?

Thank you,
Yehuda Seider
Givezy

## To Google (Play Console support, payments policy question)

Subject: Donations to registered South African charities inside our app

Hello,

We are building Givezy, a free Android app (package za.co.givezy.app) for donors in South Africa. It lists registered South African charities that we check by hand before they can receive a gift.

We would like to let donors give inside the app, set up as follows:

- The donor pays on our payment provider's page (Stitch, a South African payment provider). The app never sees card details.
- The payment settles directly to the charity's own bank account; Givezy does not hold the money.
- Givezy takes no share of the gift. Charities pay Givezy a separate flat fee.
- Each charity issues the donor a tax receipt (an s18A receipt, under section 18A of the South African Income Tax Act).
- A donor may also add an optional contribution to Givezy on top of the gift, to help keep Givezy running. It is shown separately from the gift and clearly marked as going to Givezy.

Our questions:
1. Are these donations exempt from Google Play's billing requirement under the payments policy, as donations to charities?
2. The optional contribution goes to Givezy, not to a charity. Does it need Google Play's billing, or may it be paid on the same payment page?
3. Is there anything we need to declare in the Play Console, or show in the app, for this to be accepted?

Thank you,
Yehuda Seider
Givezy

## Before sending

1. **No share of the gift (confirmed by Yehuda, 22/11/2026).** Givezy charges charities a flat fee for now. When a fee per gift starts later, tell Apple and Google before switching it on: their answer may depend on it.
2. **The optional contribution to Givezy is mentioned in both letters** (Yehuda, 22/11/2026), with a question each. If either says no, keep the contribution on the website only and leave it out of the app's give screen.
3. **Where to send them (from memory, check on the day):** Apple: developer.apple.com, Contact Us, App Review, a question about the guidelines. Google: Play Console, Help, Contact support, Policy.
