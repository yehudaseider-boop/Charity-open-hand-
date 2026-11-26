# Stitch docs review (26/11/2026)

What Stitch's own documentation says, set against our Stitch connection. Nothing in the code was changed by the review itself.

**Since then (26/11/2026, same day):** items 1 to 3 under "What our connection gets wrong" are fixed, each with a test, and every payment request now has an expiry (item 4). Later the same day the rest was built: the donor id (5), the "completed by hand" state (7), refund and dispute events looked up at Stitch (8, 9), the split check (10), saved cards and monthly charges behind `STITCH_SAVED_CARDS=yes` (11), and consent events (12). Item 6 is not needed while refunds are made in Stitch's dashboard. The webhook subscription (13) is a set-up step on the go-live list. None of it has run against Stitch yet. See `docs/decisions.md`.

## What was read, and how

- **Stitch's docs.** Every page Stitch lists in its sitemap (1 037 pages), plus one sidebar page the sitemap misses (`/payment-products/payins/card/secure-fields`), fetched on 26/11/2026. 156 of these are guide pages (everything in the sidebar: payments, wallets, cards, splits, refunds, subscriptions, webhooks, disputes, sign-in, test mode, payouts and so on). These were read in full, partly by three helper reviewers working from the same downloaded copies. The exceptions: the in-person (card machine) pages, about 15, were skimmed by heading because they don't apply to online giving, and the open-source licence list was only checked to be just that. The other 882 are the generated API reference (one page per type or field). These were not read one by one. They were used to check every query, mutation, input and field our code uses.
- **Our connection.** `src/lib/gateway/stitch.ts`, with `types.ts`, `settings.ts`, `checkout-origins.ts` and `index.ts`, on the `milestone-1-foundation` branch (newest commit 26/11/2026). This branch (`claude/modest-franklin-11rwqz`, from `main`) has no Stitch code. The adapter was first committed on 18/11/2026 and changed on 23/11/2026, not 20/11/2026. Also `docs/decisions.md` and `docs/go-live-checklist.md` from the same branch.
- **Not checked live.** Stitch's API (`api.stitch.money`) is blocked from this sandbox, so nothing was run against Stitch. The schema was checked against the API reference pages only.
- **Docs change.** Stitch updates these pages often (several say "contact Stitch to enable"). Anything here could change after 26/11/2026.

## The short version

1. **One certain bug would stop every Stitch gift being marked paid.** The payment lookup asks for the amount as `amount { quantity currency }`. Stitch's API reference says `Money` is a scalar ("query it as a leaf field, do not select sub-fields on it"). GraphQL turns that query down before it runs. So `verifyTransaction` would fail on every gift, and since we only mark a gift paid after that lookup, no Stitch gift would ever be paid in our records. The money would still reach the charity. Our tests pass because they use a pretend Stitch that accepts the query. Fix: ask for `amount` on its own and read `{ quantity, currency }` from the answer. (See "What our connection gets wrong", item 1.)
2. **Stitch documents more than our notes say.** Refunds have a full API (`refundTransactionInitiate`), and dispute events and an evidence API are documented, although disputes are still a "Technical Preview". Splits work on saved-card charges and on the hosted page's Apple Pay and Google Pay. Our notes say "the Stitch API details are not known" for refunds and disputes. They are known now.
3. **Monthly giving can keep the split.** A saved card (Stitch calls it a "consent") is charged later by our server with `initiateTransaction`. That call takes the same `splitSettlements`. Stitch's own Subscriptions product does not mention splits anywhere, so our plan (our own monthly job charging a saved card) still fits best.
4. **The docs give no prices.** The only number is a made-up worked example (1% plus R0.25). The rates must still come from Stitch in writing. One documented cost rule matters to us: **Givezy pays a share of Stitch's fixed fee on every split gift, even when Givezy's own share is R0.** Refunds carry a fresh fee, and the original fee is not returned.
5. **Several things only Stitch can switch on**: card payments, split settlements, each charity's merchant id, the return address allowlist, per-gift 3DS control, cancel-on-close, disputes, extra sign-in scopes. Our go-live list already names most of these. The full list is under "Questions for Stitch".

## What Stitch offers that matters to Givezy

### Once-off card payments

- **How.** Three ways: Stitch's hosted page, "Secure Fields" (card boxes in our own page, encrypted), or a raw card API for PCI-certified merchants. Only the hosted page keeps us away from card details, which is our rule. That is what we built. (`/payment-products/payins/card/introduction`, `/card/once-off`)
- **The call.** `clientPaymentInitiationRequestCreate`, scope `client_paymentrequest`, at `https://api.stitch.money/graphql` (one address for test and live). It needs `amount`, `payerReference` (12 characters at most) and `beneficiaryReference` (20 at most). Optional fields: `externalReference` (our id), `expireAt`, `payerInformation`, `metadata`, `paymentMethods`, `splitSettlements`, and `merchantId` or `externalMerchantId`. Cards must be switched on for our account by Stitch. If `paymentMethods` is left out, only Pay by Bank is offered. (`/card/once-off/hosted-ui`; API reference `ClientPaymentInitiationRequestCreateInput`)
- **Expiry.** Stitch "highly recommends" an `expireAt` on every payment request. At that time an unpaid request becomes `PaymentInitiationRequestExpired`.
- **Payer details.** "At a minimum, the `payerId` should always be specified", meaning any id of ours that always means the same person. It is used for Stitch's fraud checks.
- **Return.** We add `redirect_uri` (and, if we want, `failure_redirect_uri`) to the page address. The domain must be on Stitch's allowlist, which only Stitch can change, and must be `https` in live. The donor comes back with `id`, `status` (`complete`, `closed`, `failed`), `payment_method` and `externalReference`. Stitch says never to trust `status`: "treat webhooks as your source of truth". Our code already looks the payment up instead.
- **States.** `Pending`, then exactly one of `Completed`, `Cancelled` or `Expired`. There is also `PaymentInitiationRequestManuallyCompleted`, which means "no payment exists". **A donor who clicks the X leaves the request `Pending`**, not cancelled. It becomes `Cancelled` only if we call `clientPaymentInitiationRequestCancel`, or if Stitch switches on "automatic cancellation" for our account. The docs list no "declined" state for a payment request. A declined card leaves it open for another try.
- **3DS.** By default every card's first payment asks for 3DS. Stitch can set rules for later payments: always, once-off only, first payment only, every Nth payment, or above an amount. Per-request control (`paymentMethods.card.requireSecure3d`) must be switched on by Stitch. Cards from banks without 3DS can be allowed or refused (an account setting). Stitch can also block countries. (`/card/configuration`)
- **Settlement.** "Stitch receives card funds on your behalf" and settles "daily" to the bank account on file. (`/card/configuration`)
- **Payer details on the lookup.** A completed request names the payer: `PaymentInitiationCardPayer` (`network`, `last4`, `bin`, `cardHolderName`, expiry, `fundingType`, `issuer`) or `PaymentInitiationWalletPayer` (`walletType`, `network`, `last4`) for Apple Pay and Google Pay.
- **Lookup by our reference.** `client.paymentInitiationRequests(filter: { externalReference: { eq: ... } })` exists in the reference. The guide's own example looks up by Stitch's id with `node(id: ...)`.

### Monthly (recurring) payments

Stitch offers three routes. Only the first keeps both of our rules (no card details on our side, and the gift split to the charity).

- **Save the card on Stitch's page, then charge it from our server.** (`/card/tokenization/tokenization/hosted-ui`, `/card/tokenization/transactions`)
  - **Saving.** `paymentConsentRequestCreate`, scope `client_recurringpaymentconsentrequest`, with a unique `nonce`, optional `externalReference`, `expireAt`, and an optional `initialCharge` (the first gift, taken while the donor is there). The answer has an `id` (the consent, which is what we charge later) and a `url` for Stitch's page. Return and allowlist rules are as for the once-off page. The `payment-consent-request` webhook reports `GRANTED`, `FAILED`, `CANCELLED`, `EXPIRED`, `REVOKED`, `PAUSED`. Stitch handles 3DS on this step.
  - **Split on the first gift.** `splitSettlements` on the consent request applies to the first charge only ("not to subsequent recurring charges"), and needs an `initialCharge.amount`. It cannot be combined with `initialCharge.merchantId`.
  - **Each month.** `initiateTransaction`, scope `transaction_initiate`, with `nonce`, `amount`, `externalReference`, `token` (the consent id), `payerInformation.payerId`, and `paymentMethods.card.recurringPayment`: `source: "payer"` for the first charge the donor makes, `source: "merchant"` for each charge we start, and the same `agreement.reference` for the whole series (`agreement` also takes `variability`, `scenario` such as `Subscription` or `Unscheduled`, and `expireAt`). The consent must be `PaymentConsentGranted`. **`splitSettlements` can be sent on each of these charges** ("Individual Transactions (whether once-off, or tokenized)"). The charity is not remembered with the card, so it must be sent every month.
  - **3DS on monthly charges.** Our account's 3DS rules decide, unless Stitch switches on per-request control (`requireSecure3d: false`, as in Stitch's own merchant-charge example). The "First Payment" rule would skip 3DS after the first charge. Stitch's fraud checks can still demand 3DS (`recommendedByShield`). If 3DS is needed the charge comes back `TransactionPending` with an `interactionUrl`, which a monthly job with no donor present cannot complete. **The docs never say plainly that monthly charges are exempt.** Get it in writing from Stitch.
  - **Removing a saved card.** `paymentConsentRequestRevoke`.
  - **Declines and retries.** Each failed charge carries `retryAdvice { retryable, retryAfter, reason }` (also on the `transaction` webhook). `retryable: false` means ask the donor for another card. `retryable: true` with `retryAfter` means wait until then. `null` means unknown. Stitch "does not schedule a retry", and gives no list of retryable codes or a retry count. One decline reason (`invalidCardError`) can mean the bank has blocked further attempts for a while (the example says two days). (`/card/retry-advice`)
- **Card boxes in our own page ("Secure Fields")** with `storeOnFile` and `recurringPayment`. It gives a `card.id` and lets us list and delete a donor's saved cards (`/v2/cards`, scope `client_card`). It puts card fields in our app and site, which our rules rule out.
- **Stitch's own Subscriptions product.** Plans (`billingModel` `fixed`, `usage` or `onceOff`; `frequency` `monthly` and others) and per-donor "subscription collections" on a Stitch page, with `collectionDay` 1 to 30 or 99 (last day). Stitch then collects by itself and reports on `transaction` webhooks. **These pages never mention splits**, so a monthly gift would land with Givezy. Not suitable.
- **Batch collections** (`clientCollectionBatchCreate`, up to 2 000 per call) charge many saved cards at once, take a split per collection, and report on the `collection` webhook. Stitch retries inside a collection (`EXCEEDS_RETRIES`), but the number of retries is not documented. One charge at a time is simpler at our size.
- **Other recurring methods** (bank debits, not cards): DebiCheck mandates, debit orders, Capitec Pay recurring consents. None mentions splits.

### Wallets: Apple Pay, Google Pay (and Samsung Pay)

- **On Stitch's hosted page.** Apple Pay and Google Pay can be offered on the hosted page (`paymentMethods.applePay` / `googlePay`, each `{ enabled }`), and splits work with them there. Samsung Pay on the hosted page is not supported with splits: "Use the direct API integration for Samsung Pay". (`/wallets/split-settlements`)
- **Which device shows which wallet.** Apple Pay: Safari on iPhone and Mac, and Chrome or Firefox on a computer through a QR code. Google Pay: Chrome on Android only. Samsung Pay: Samsung phones, or QR or email on a computer. (`/wallets/introduction`)
- **Apple Pay set-up.** For web-only, low-risk clients, Stitch runs the Apple merchant set-up. We would host a domain file Stitch gives us at `/.well-known/apple-developer-merchantid-domain-association` on every domain that shows the button. **A native Apple Pay button in the phone app needs our own Apple Developer merchant id and certificates** made from Stitch's signing requests. They expire every 25 months, and Stitch asks to be contacted at least 6 weeks before. (`/wallets/configuration`) The docs do not say which of these applies when Apple Pay is shown on Stitch's own hosted page, or in our app's in-app browser sheet. That is a question for Stitch.
- **Google Pay set-up.** Stitch issues a `gatewayMerchantId`. We register in Google's Pay and Wallet Console for a Google merchant id and, for live only, send Google screenshots of the flow. Test clients can take Google Pay without that step.
- **Limits.** Visa and Mastercard only. No billing address collection for wallets.
- **Our own wallet buttons** (outside the hosted page) mean Stitch's wallet SDKs, a call from our server to `initiateTransaction` (scope `transaction_initiate`), and Apple's merchant check through our server (`validateApplePayMerchant`). Stitch's packages come from a private registry, given at onboarding. There is a React Native package (`@stitch-money/react-native`, React Native 0.73 or later) for native Apple Pay and Google Pay buttons. **Expo is not mentioned anywhere**; the package uses native code, so it would at least need a custom build, not Expo Go (an inference, not something the docs say). The amount on the wallet sheet must equal the amount sent to Stitch, or the charge fails. None of this is needed while wallets stay on Stitch's hosted page.

### Splitting a payment to the charity's own account

- **What it is.** "Split settlement": the main merchant (Givezy) tells Stitch to pay part of a payment straight to a "destination merchant" (the charity). Each side is paid "net of its own fee". (`/card/split-settlements`)
- **Where it works.** Single card payments (once-off or saved card), the hosted page (cards, Apple Pay, Google Pay), the first charge of a card consent, batch collections, and wallet payments made through the API. Not on preauthorised wallet payments.
- **Rules.** One destination merchant per payment. ZAR only. A fixed rand amount, to the cent, more than zero and no more than the payment. Shape: `splitSettlements: [{ merchantId, amount: { quantity, currency } }]`. The `merchantId` is Stitch's opaque id, given to us by Stitch. **A top-level `merchantId` or `externalMerchantId` cannot be combined with a split**: error `merchant_id_with_split_settlements`.
- **Set-up.** "Split settlements require enablement by Stitch", and each charity must be registered by Stitch first. For wallets, each charity also needs "the corresponding wallet settlement beneficiaries"; otherwise `invalid_merchant`. The docs show no API for us to register a charity (the only merchant API, "Weave", is for in-person card machines).
- **Fees (how, not how much).** Each side pays a percentage of its own amount plus an equal share of one fixed fee. Any rounding goes to Givezy, and "the primary always bears a fixed-fee share even when its own portion is zero". So on a gift with no Givezy contribution, Givezy still pays part of the fixed fee. The charity receives its line minus its own fee, not the full line.
- **Reading where the money went.** Fee and net amounts are filled in once the payment is done. Per side: `splitSettlements[]` (`merchantId`, `amount`, `feeAmount`, `netAmount`) and `primarySettlement`, plus totals. They are on the card or wallet transaction, on the `payment` webhook, and `splitSettlements` is mirrored on the payment request itself. Stitch says these "describe the settlement allocations; they do not confirm that funds have been paid out". `null` means "not known yet", never zero.
- **Errors.** `invalid_split_amount`, `split_settlement_not_enabled`, `unsupported_payment_method`, `invalid_merchant`, `duplicate_merchant`, `splits_limit_exceeded`, `merchant_id_with_split_settlements`, all in `extensions.code` of a `UserInputError`.

### Refunds

- **The call.** `refundTransactionInitiate(input: { originalPaymentId, refundInput: { amount, reason, nonce, externalReference } })`, scope `client_refund`. Full or several partial refunds, up to the original amount. (`/card/refunds`, `/wallets/refunds`)
- **Which id.** For cards, `originalPaymentId` takes the card transaction id **or the hosted payment request id**. For Apple Pay and Google Pay it takes the **wallet transaction id** only.
- **Result.** Usually final at once (`TransactionSuccess` or `TransactionFailure` with a reason such as `exceedsOriginalAmount`, `invalidCardError`, `blockedByFraudChecks`). Now and then `TransactionPending`, then a webhook.
- **Dashboard refunds.** Refunds can also be made by a person in Stitch's dashboard. They send the same webhooks.
- **Split refunds.** The refund follows the original split pro rata (no split is given on the refund). The last refund settles whatever is left, so there is no rounding drift. **Stitch charges a fresh fee on a refund and never returns the original fee**. The fee falls on each side (Givezy and the charity), and the donor always gets the full refund. On a refund, `netAmount` is the amount plus the fee (money taken out), the reverse of a charge.
- **Events.** Card and wallet refunds arrive on the **`transaction`** webhook, with `data.type` `CARD_REFUND` (wallet refunds use their own type) and `status` `SUCCESS` or `FAILURE`. The event-type page also lists a separate `refund` event "for any Refunds product, including Card", but its example is a Pay by Bank refund. The two pages disagree. Check in the test system which one card refunds send.
- **Test amounts.** Card refunds of R401, R402 and R403 fail (`paymentRefundFailed`, `downstreamProviderError`, `invalidCardError`). R405 is pending, then succeeds after about 20 seconds. Any other amount succeeds.

### Disputes (chargebacks)

- **Status.** "Technical Preview": may change without notice, switched on per client, "do not use … in production without first consulting a support engineer". Card disputes only. (`/disputes/overview`)
- **Events** (Svix, separate event types): `dispute.created` (always has `evidenceDueAt`), `dispute.evidence_received`, `dispute.evidence_submission_failed`, and exactly one closing event: `dispute.won`, `dispute.lost`, `dispute.auto_accepted` or `dispute.partially_accepted`. The body is `{ type, createdAt, data }` with no id of its own, so repeats are spotted by the `svix-id` header. Delivery is at least once, in any order. Subscribing only to `dispute.created` leaves cases open for ever.
- **Ids.** `disputeId` (`dsp_…`) and the bank's `caseReference` (for example `STDB100`). `data.transactions[]` carries the original payment's `externalReference`. Amounts (`disputedAmount`, `chargebackAmount`, `fees`) are `{ currency, amount }` with `amount` a JSON number; Stitch says to read it as a decimal.
- **Responding.** Upload files (`POST /v2/files`, 50 MiB each), then one final submission per case (`POST /v2/disputes/{id}/evidence`). A late submission still gets "201", then a `DEADLINE_EXPIRED` failure event. Read cases with `GET /v2/disputes`. Scopes `client_dispute`, `client_file_management`, `client_evidence_submission`.
- **Not said.** Who bears a chargeback on a split payment (Givezy or the charity's merchant), and how it comes out of settlements. Ask Stitch.

### Webhooks

- **Delivery.** Through Svix (EU region). Subscribe with `clientWebhookAdd` (`url`, `filterTypes`; scope `client_webhook_manage`; the response gives the signing secret) or in the Svix portal (link from `webhookLogin`, scope `client_webhooks_dashboard`). (`/webhooks/using_webhooks`)
- **Signature.** HMAC-SHA256 of `svix-id.svix-timestamp.raw body`, keyed with the base64-decoded part of the `whsec_…` secret. Compare with each `v1,…` entry in `svix-signature` (several entries while a secret is rotated). Stitch recommends Svix's library. No time window is stated on Stitch's pages (Svix's library uses 5 minutes).
- **Answer and retries.** Answer 200. Anything else is retried with exponential backoff on Svix's schedule. Messages are kept 90 days and can be replayed from the portal.
- **Event types that matter:** `payment` (hosted page: Completed, Cancelled, Expired), `transaction` (single card and wallet payments and refunds: `SUCCESS`, `FAILURE`, `CANCELLED`, `PENDING` for preauthorisation), `payment-consent-request` (saved cards: `GRANTED`, `FAILED`, `CANCELLED`, `EXPIRED`, `REVOKED`, `PAUSED`, `PROCESSING`), `collection` (batch collections), `refund`, and the `dispute.*` events. There is **no settlement or payout event**.
- **Shapes differ.** `transaction`, `payment-consent-request` and `collection` bodies have a top-level `type` and an `id` that names the status change (for example `transaction:status:success:…`). The `payment` and `refund` examples are shaped like GraphQL answers (`data.client.paymentInitiationRequests.node`) and **show no top-level `type` or `id`**. See "What our connection gets wrong", item 2.
- **Legacy webhooks** (signed with `X-Stitch-Signature`) are deprecated. Svix is current.

### Test mode

- **Same addresses for test and live.** Test or live is decided by the client id (test ids start with `test-`). Test clients have `https://localhost:3000`, `:8080` and `:9000` allowlisted as return addresses. Anything else must be added by Stitch.
- **Test cards.** Any valid number such as `4032035421088592` succeeds. `4004462059871392` fails 3DS. `4032033425469975` fails authorisation. `4005519200000004` is insufficient funds. `5284989416854933` is over the withdrawal limit. `4787692003020026` is a provider error. `4000056655665556` is unknown at first, then succeeds. Any future expiry and any CVC. (`/card/testing`)
- **Test amounts** (when the card number is not a failure card): R1.01 insufficient funds, R2.02 over limit, R3.03 provider error, R4.04 authorisation failed, R5.05 pending then success after about 10 seconds. Exact amounts only (R10.01 succeeds).
- **Refund test amounts** as above (R401 to R405).
- **Google Pay** works on test clients without Google's console approval. Apple Pay's server check returns mock data with `initiativeContext: test.stitch.money`, which cannot open a real Apple Pay sheet.
- Bank account check and payout test values exist (account number endings, amounts 400 to 404).

### Fees

- **No price appears anywhere in the docs.** Not for cards, wallets, splits, refunds or disputes.
- **Documented fee rules:** each side of a split pays its own fee (a percentage of its share plus a share of one fixed fee, and Givezy always pays a fixed-fee share). A refund has a fresh fee and the original fee is not returned. Fee amounts are reported per payment (`feeAmount`, `netAmount`). Instant payouts and instant Pay by Bank refunds "may incur an additional cost".
- **Example only.** The split pages use "1% plus a fixed R0.25" as an illustration. It is not a rate.
- The 2.95% figure in `docs/decisions.md` (17/11/2026) came from Stitch Express's public page, not these docs. Rates for the API still need to come from Stitch in writing before `src/config/platform.ts` is changed.

### Other things worth knowing

- **Sign-in.** `POST https://secure.stitch.money/connect/token`, `client_credentials`, `client_secret`, `scope`, `audience=https://secure.stitch.money/connect/token`. Tokens last an hour. Stitch asks that they be kept and reused. **The client secret expires after 2 years**; Stitch must be asked for a new one before then. (`/authentication/client-secrets`)
- **Idempotency.** Optional `Idempotency-Key` header, kept 24 hours. Separately, resources with a `nonce` (refunds, transactions) refuse a repeated nonce.
- **Errors.** GraphQL errors usually come with HTTP 200 and a code in `errors[].extensions.code`: `UNAUTHENTICATED`, `FORBIDDEN` (with `missingScopes`), `BAD_USER_INPUT`, `RESULT_PENDING`, `RESOURCE_UNAVAILABLE`, `INTERNAL_SERVER_ERROR` and others.
- **Network.** Nothing needed for Vercel (static IP and mTLS are optional).
- **Bank account check.** `verifyBankAccountDetails` (scope `client_bankaccountverification`) checks a South African account: open, open more than three months, takes credits, and holder match (business accounts by registration number and name). That matches our `checkBankAccount` interface.
- **Payouts and settlement reports.** Stitch's "Settlements" query is deprecated and needs a Stitch intermediary account. Payouts ("disbursements") need a float account and are a different product. **Nothing documents a report of what was paid out to each split merchant**, so `listPayouts` returning nothing is consistent with the docs.
- **Other ways to pay** (not built, for later): Pay by Bank (Capitec Pay, Absa Pay, PayShap), Capitec Pay recurring consents, DebiCheck mandates and debit orders (the debit order file format has a `CHARITY` entry class), Manual EFT, cash at ATMs, crypto, buy-now-pay-later, Discovery Miles. **None of these pages says splits work with them**, except that Pay by Bank can route a whole payment to a pre-registered merchant (`merchantId`).

## What our connection gets wrong or misses

Ordered by how much they matter. "Certain" means the docs say so plainly. "Likely" means the docs point that way but disagree with themselves or are silent; it needs the test system.

### Wrong

1. **The payment lookup query is refused (certain).** `FIND_PAYMENT` selects `amount { quantity currency }` on `PaymentInitiationRequestCompleted`. `amount` is `Money!`, a scalar (`scalar Money`), and the split guide says "query it as a leaf field (do not select sub-fields on it)". Selecting sub-fields of a scalar is a GraphQL validation error. Our `graphql()` treats that as our own mistake (not a refusal), so `verifyTransaction` throws on every call, and the webhook, return page and daily check can never mark a Stitch gift paid. Fix: `amount` alone, then read `quantity` and `currency` from the JSON object (the existing `quantityToCents` already accepts a string or a number). Add a test whose pretend Stitch refuses sub-selections on `Money`.
2. **The `payment` webhook may never be recognised (likely).** `parseWebhook` only handles a body whose top-level `type` is `"payment"` or `"transaction"`. Stitch's own examples for the `payment` event have no top-level `type`, only `data.client.paymentInitiationRequests.node`. If real deliveries look like the examples, every hosted-page webhook is read as "other" and ignored. Gifts would then be marked paid only by the return page or the daily check (once item 1 is fixed). Safer: also recognise the body by its shape (`data.client.paymentInitiationRequests.node`), and check in the test system.
3. **A refund could be read as a successful payment (likely).** The `transaction` branch counts any `status: "SUCCESS"` with an `externalReference` as `payment_succeeded`. Card and wallet refunds come on the same `transaction` webhook with `status: "SUCCESS"` and `data.type: "CARD_REFUND"`. If a refund carries our reference (we would likely set it, and a dashboard refund might too), it is read as a payment, never as a refund. The harm is limited, because the payment is looked up before anything is marked paid, but the refund itself is lost. Fix: act only on `data.type` of `CARD`, `APPLE_PAY` or `GOOGLE_PAY` as payments, and map `CARD_REFUND` and wallet refunds to `refund_processed`.
4. **The code comments say a closed page leaves the request "cancelled" (certain, wrong assumption).** The docs say clicking X leaves it `Pending`, unless Stitch switches on automatic cancellation. The code does treat `Pending` as pending, so nothing is paid wrongly, but such a gift is never marked "abandoned" and waits for the daily check. Fix: send `expireAt` (Stitch "highly recommends" it), so unpaid requests become `Expired`, and/or ask Stitch for cancel-on-close.
5. **`payerId` is not sent (certain, minor).** The hosted-page guide says `payerInformation.payerId` "should always be specified" for fraud checks. We send only `email`. Use a stable id per donor (for a guest, a random id per gift is the safe choice, since the docs ask for one that "always uniquely identifies users").
6. **Wallet refunds would need a different id (certain, for when refunds are built).** `gatewayTransactionId` stores the payment request id. That works for card refunds (`originalPaymentId` accepts a hosted payment request id), but Apple Pay and Google Pay refunds need the wallet transaction id. The lookup should also fetch the underlying transaction id, or the refund must look it up first.
7. **`PaymentInitiationRequestManuallyCompleted` is handled correctly but silently (note).** It means "no payment exists". Our code treats it as pending, which is right; it may be worth an Admin note if it ever appears.

### Missing (known, now documented)

8. **Refunds** (`refundTransactionInitiate`, `client_refund`, the `transaction` webhook with `CARD_REFUND`). Our notes say the API details are not known; they are now. The go-live checklist already lists this as blocking the switch.
9. **Disputes** (`dispute.*` events, `GET /v2/disputes`). Technical Preview, so ask Stitch before relying on it. `parseWebhook` currently reads every `dispute.*` event as "other".
10. **Checking the split landed (`reportsSplit`).** Stitch reports `splitSettlements[].merchantId` on the payment request and the `payment` webhook, so the adapter could fill `settledTo` and switch on `reportsSplit`, as Paystack does. Until it does, a Stitch gift is never checked against the charity's account (the 26/11/2026 safeguard does not apply to Stitch).
11. **Saved cards and monthly charges** (`supportsSavedCards: false`, `chargeAuthorization` throws). See "Monthly" above for what the docs now answer. Two of the open points in our notes are now answered: where the split goes on a consent (only the first charge, through `paymentConsentRequestCreate`'s `splitSettlements`), and how later charges carry a split (`splitSettlements` on `initiateTransaction`).
12. **Consent and collection webhooks** (`payment-consent-request`, `collection`) are not read. Needed once saved cards are built.
13. **The webhook subscription itself** is not set up anywhere (no `clientWebhookAdd` call or note naming the event types to subscribe to: `payment`, `transaction`, `payment-consent-request`, and the `dispute.*` types).

### Checked and right

- Sign-in: address, fields, `audience`, caching for the token's life, and clearing kept tokens on a 401. Scope `client_paymentrequest` for both the payment request and the lookup.
- The payment request input: field names and types match `ClientPaymentInitiationRequestCreateInput`, `MoneyInput` (`quantity: Decimal!`), `SplitSettlementInput` and `PaymentMethodsInput` (`card`, `applePay`, `googlePay`, `eft` each take `enabled`). `eft: { enabled: false }` is exactly what the docs say to send to switch off Pay by Bank. No top-level `merchantId` beside the split, as required.
- Reference lengths: `payerReference` "Givezy" (6 of 12), `beneficiaryReference` "Gift xxxxxxxx" (13 of 20).
- Amounts written from whole cents as a decimal string, never through a float.
- The lookup filter `paymentInitiationRequests(filter: { externalReference: { eq } })` exists in the reference.
- The return address: `redirect_uri` and `failure_redirect_uri` on the page address, both on an allowlist. Our page address host `https://secure.stitch.money` matches the docs' example.
- Webhook signature: same recipe as Stitch's manual example, including several `v1,` entries and a constant-time compare. Keying repeats by the Svix message id matches Stitch's advice for dispute events.
- "Each side pays its own fee" is the only fee arrangement Stitch's split supports, as our code assumes.
- Charities set up by Stitch, not by us: the docs show no API for it, as our code says.
- No payout report per charity: the docs have none, as our code says.

## Questions for Stitch

1. Our account: switch on cards, split settlements, Apple Pay and Google Pay on the hosted page, and (later) card consents. Give us test client credentials.
2. Return addresses to allowlist: test and live Givezy domains.
3. Each charity: how long does registering a destination merchant take, and what do they need from the charity? Do wallets need a separate "settlement beneficiary" per charity?
4. Rates in writing: card, Apple Pay, Google Pay, the fixed fee per split payment, refund fees, chargeback fees.
5. Does the `payment` webhook body carry a top-level `type`? Do card refunds come as `transaction` (`CARD_REFUND`) or `refund` events, or both?
6. Switch on automatic cancellation when the donor closes the page?
7. Monthly: switch off 3DS on charges we start for a saved card (the "First Payment" rule, or per-request `requireSecure3d`)? Switch on card consents and the `client_recurringpaymentconsentrequest` and `transaction_initiate` scopes. Confirm a split may be sent on every monthly `initiateTransaction` charge against a consent.
8. Apple Pay on the hosted page, and inside our app's in-app browser sheet: does Stitch's own Apple Pay set-up cover it, or do we need our own Apple merchant id?
9. Disputes: may we use the Technical Preview at launch? On a split payment, who carries a chargeback, Givezy or the charity's merchant, and how is it recovered?
10. Is there any report of what each destination merchant (charity) was paid out, and when?
11. When does our client secret expire (two years from issue)?

## Next steps (not done here)

- Fix items 1 to 3 above before any test payment. They are small, and item 1 alone would make every test payment look unpaid.
- Add the go-live points from "Questions for Stitch" to `docs/go-live-checklist.md`, and update the "refund and dispute details are not known" note in `docs/decisions.md`. Left unchanged, as asked.
