# Give flow friction (measured 04/11/2026)

How much it takes to reach the payment provider's page, counted by reading the code and by clicking through on the
local stack (dev server, local database, test payment provider) with Playwright at 375px and 1280px. The charity is
"Northcliff Meals Fund" (s18A, suggested amounts R100, R250 and R500), the gift R250, a person giving as themselves.

"Presses" are button presses (an amount button, Continue, Pay or Give). "Ticks" are boxes or switches the donor must
tick. "Typed" are boxes the donor types into. Optional boxes are those on screen that the donor may leave empty.

## Before (code as of the morning of 04/11/2026)

### Website, `/c/<slug>/donate`

| | (a) Once-off, no s18A receipt | (b) Once-off, with an s18A receipt |
|---|---|---|
| Screens before the provider's page | 1 page in 2 steps (Amount, then Your details below it) | 1 page in 2 steps |
| Presses | 3 (R250, Continue, Pay R250) | 3 |
| Required ticks | 2 (18 or older; Terms, Privacy and sharing with the charity) | 3 (also "I want an s18A receipt") |
| Typed boxes | 3 (first name, surname, email) | 7 (also SA ID number, street address, city, postal code) |
| Required boxes on screen | 4 (amount, first name, surname, email) | 5 marked required, plus 3 the server requires but the page marks "(optional)": street address, city, postal code |
| Optional boxes on screen | 1 (phone) | 4 (phone, income tax number, unit, suburb) |
| Optional ticks on screen | 5 (contribution to Givezy, s18A, monthly, anonymous, no news) | 4 |
| Folded optional extras | label, dedication, message | same |
| Pay button | "Pay R250" ("Pay R250 now, then monthly" when monthly) | same |
| Blocks | Changing the amount, the contribution or the card charge box after Continue disables Pay: "You changed the amount. Press Continue above to confirm it before paying." Pay stays disabled until Continue is pressed again (confirmed in the browser). | same, and any missing s18A detail stops the payment |

Monthly adds 1 tick ("Give R250 every month") and 1 required tick (the monthly authorisation).

### Phone app, give screen (`apps/mobile/src/app/give/[slug].tsx`)

**In-app giving off** (the default, `EXPO_PUBLIC_IN_APP_GIVING` not "yes"): 1 screen ("Give on our website"), 1
press ("Give on our website"), then the phone's browser opens the website's donate page with nothing chosen: the
website counts above follow in full (3 presses, 2 or 3 ticks, 3 or 7 typed). The app passed the label and campaign,
never an amount. Counted from the code; this branch needs a live website address, so it was not clicked.

**In-app giving on** (clicked in the web export of the app, demo data, 390px):

| | (a) Once-off, no s18A receipt | (b) Once-off, with an s18A receipt |
|---|---|---|
| Screens | 1 | 1 |
| Presses | 2 (an amount, Give R…) | 2 |
| Required ticks | 1 (one combined tick: 18 or older, Terms, Privacy, sharing) | 2 (also the s18A switch) |
| Typed boxes | 3 (first name, surname, email) | 7 (also SA ID number, street, city, postal code) |
| Optional boxes on screen | phone, message (folded under More), contribution when switched on | also suburb |
| Give button | "Give R360" (the live total; "every month" added for monthly) | same |
| Blocks | none: the total updates as you type | any missing s18A detail stops the payment |

## After (04/11/2026, same checks)

### Website

| | Before (a) | After (a) | Before (b) | After (b), details after paying (the default) | After (b), details now |
|---|---|---|---|---|---|
| Screens before the provider's page | 1 page, 2 steps | 1 page, 1 step | 1 page, 2 steps | 1 page, 1 step | 1 page, 1 step |
| Presses | 3 | 1 (Give R250; R250 starts selected) | 3 | 1 | 2 (also "Add them now") |
| Required ticks | 2 | 2 (1 once the single tick is switched on) | 3 | 3 (2 with the single tick) | 3 (2) |
| Typed boxes | 3 | 3 | 7 | 3 | 7 |
| Required boxes on screen | 4 | 4 | 5, plus 3 marked "(optional)" that were required | 4 | 8, all marked required |
| Optional boxes on screen | 1 (phone) | 0 | 4 | 0 | 3 (income tax number, unit, suburb) |
| Pay button | "Pay R250" | "Give R250", "Give R250 every month" | same | same | same |
| Blocks | "You changed the amount. Press Continue above" | none: the total updates as you type | same, plus missing details | none | missing details (as before) |

Measured at 375px and 1280px: no sideways scrolling on the give form, the thank-you page, the account page or
the QR poster page. Checked in the browser: the total and the button change as the amount and the contribution
change (R1 234.50, then R1 244.50 with R10 to Givezy); R5 says "The minimum donation is R30."; "1,250" says to use a
space; Give with a bad amount sends nothing and puts the cursor in the amount box; offline at Give says nothing was
charged and keeps what was typed; `?amount=250&monthly=1` starts at R250 with monthly on ("Give R250 every month");
`?amount=-5`, `abc`, `5` and `99999999` are ignored quietly (R250, the charity's middle amount, starts selected); a
declined card's "Try again" comes back with the amount, the name and "Add my details after paying" still chosen;
"Add my details after paying" goes through the test payment page to the thank-you form, a wrong ID number is
refused with the address kept, and saving writes the encrypted ID, last four, receipt identity and address; a
monthly gift left incomplete shows under "s18A details still needed" on the account page and saves from there; a
closed tax year's gift with missing details shows on the charity's s18A receipts page as "Details missing".

### Phone app

**In-app giving off:** unchanged (1 screen, 1 press to the website). The website link now carries the amount and
monthly choice when one was made in the app (`amount=250`, `monthly=1`), though the "Give on our website" screen
shows before the form, so in practice the website still starts at the charity's middle amount.

**In-app giving on** (390px, demo build):

| | Before (a) | After (a) | Before (b) | After (b), details after paying (default) | After (b), details now |
|---|---|---|---|---|---|
| Presses | 2 | 2 | 2 | 2 | 3 |
| Required ticks | 1 | 1 | 2 | 2 | 2 |
| Typed boxes | 3 | 3 | 7 | 3 | 7 |
| Optional boxes | phone, message (folded) | message (folded) | also suburb | message | also suburb |

## What changed

1. **Take the gift first, s18A details after.** "I'd like an s18A receipt" then "Add my details after paying"
   (default) or "Add them now" (as before, still checked). After paying, the thank-you page shows a short form (SA ID
   or registration number, address). It stays available from the account page ("s18A details still needed") for
   this tax year and the one just closed. Only the donor: the thank-you page's credential, or their signed-in
   account. A monthly donation's first gift and its other gifts still missing details are completed together, so
   every future monthly gift is copied with them. The receipt run never receipts such a gift: it is held back as
   "details missing" and listed for the charity and Givezy.
2. **One screen.** Amount, contribution, details, ticks and Give on one form; phone no longer asked (the column
   stays; nothing needs it); the charity's middle amount preselected; the live total from the same pricing function
   the server uses, which still re-quotes at Give and refuses a different total with the new figure shown. One
   combined agreement tick is built behind `checkout.singleAgreementTick` (off until Yosef approves the wording).
3. **Closer to the finish.** `?amount=250&monthly=1` links; a link and QR builder on the QR poster page; the app
   passes its chosen amount to the website.
