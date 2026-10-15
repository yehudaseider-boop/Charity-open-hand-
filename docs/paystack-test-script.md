# Paystack test-mode script

For Yehuda. Nothing here moves real money: every step uses Paystack's test mode. Tick each box and write down what you saw. If something does not match, stop and tell Claude exactly what the screen or message said.

Why this exists: the Paystack connection was written from Paystack's published instructions and has never run against Paystack (the build environment cannot reach it). This script is how we find out.

## Before you start

- [ ] **Free Paystack account** at paystack.com, country South Africa. You only need test mode, not business verification. (Confirm that this is still true when you sign up.)
- [ ] **Switch the dashboard to Test mode** (the toggle at the top). Settings, API Keys & Webhooks, then copy the **Test Secret Key** (starts `sk_test_`). Never paste it into chat or commit it. It goes only in the website's settings (below).
- [ ] **A test copy of the website on the internet.** Paystack must reach us at a public address to send payment messages (webhooks). Claude cannot deploy for you, so this needs a hosting choice (see "Open items" in the go-live checklist: domain, registrar and hosting). A temporary test site is fine. Do NOT use the real live site or real database.
- [ ] **Fee payer is decided: the charity (`gatewayChargePaidBy` = `"charity"`).

## Settings on the test copy of the website

Claude will give you the exact place for each. The values:

| Setting | Value |
| --- | --- |
| `PAYMENT_GATEWAY` | `paystack` |
| `PAYSTACK_SECRET_KEY` | your `sk_test_...` key |
| `PAYSTACK_SPLITS` | `yes` (only on the test copy) |
| `SITE_URL` | the test site's public address, starting `https://` |
| `CRON_SECRET` | a long random string (for step 6) |

In Paystack, Settings, API Keys & Webhooks, set the **Test Webhook URL** to `<SITE_URL>/api/webhooks/paystack`.

## Paystack's test cards

Paystack publishes test card numbers (successful and declined) on its documentation site. Use the ones listed there for South Africa and ZAR. Any future expiry date and any 3 digit security code work. Where Paystack asks for a one time pin or an OTP in test mode, it prints the test value on screen.

- [ ] Write down the exact successful and declined test cards you used, so we can repeat them.

## The checks, in order

Stop at the first one that fails. Each later check depends on the one before.

### 1. A charity can be connected (payout account created)

- [ ] Sign in to the test site as a platform admin. Admin, open an approved charity, **Connect to payment gateway**.
- [ ] Expect: the page says "Connected to the payment gateway. Account ACCT_...". In Paystack's dashboard (Test mode), Subaccounts, the charity appears.
- [ ] If it fails, note the message. Likely causes: the bank name we hold does not match Paystack's list, or the account number format.

### 2. A once-off donation splits correctly

- [ ] On the connected charity's page, give R100 with a R5 contribution to Nadiv Lev. Pay with the successful test card.
- [ ] Expect: the thank-you page says paid, a confirmation email is logged, and the donation shows as paid under Admin, Payments.
- [ ] In Paystack, open the transaction. Expect: total R105, the charity's subaccount credited R100, Nadiv Lev's main account R5, the fee on the side we chose.
- [ ] Repeat with **no contribution (R0)**. Write down what Paystack does with the fee.

### 3. A declined card

- [ ] Give R100 again with a declining test card.
- [ ] Expect: "Payment didn't go through" and the donation shows as failed, nothing charged.

### 4. The webhook arrives

- [ ] After step 2, check Admin, Payments: nothing should be stuck pending or unprocessed.
- [ ] In Paystack, Settings, Webhooks (or the transaction's event log) the delivery shows as successful (HTTP 200).

### 5. A monthly donation starts

- [ ] On the charity's page, tick "Give R__ every month", tick the authorisation, pay with the successful test card.
- [ ] Expect: paid, the confirmation email says "we will collect ... on day N", and Account, Your monthly donations lists it with the card's last four digits.
- [ ] If Paystack does not return a reusable card, the page says so and no monthly donation starts. Write down the message.

### 6. The next month is collected

The job normally runs on the charge day. To test now, ask Claude to move that monthly donation's next collection date to the past on the test database, then:

- [ ] Call the job once: `GET <SITE_URL>/api/jobs/monthly-giving` with the header `Authorization: Bearer <CRON_SECRET>`.
- [ ] Expect: a second payment for the same charity, split the same way as step 2, and a second confirmation email saying "This was your monthly donation".
- [ ] Call the job a second time straight away. Expect: nothing charged again.

### 7. Monthly declines and cancel

- [ ] Repeat step 5 with a card that succeeds first and is declined on later charges, if Paystack offers one in test mode. Expect up to three attempts and "could not collect" emails.
- [ ] Cancel a monthly donation from Account. Move its date to the past and run the job. Expect: nothing charged.

### 8. A bank change disconnects the charity

- [ ] Admin, charity, **Change the bank details**. Expect: the charity shows "isn't taking online donations yet" until reconnected (step 1 again).

## What to send back to Claude

For each step: passed or failed, and for any failure the exact message, plus the Paystack dashboard's description of the transaction. Never send the secret key.

When everything passes, tick the Paystack items in `docs/go-live-checklist.md` and decide who pays the fee for real. Then switching to live is a separate step, done with live keys and real verification.
