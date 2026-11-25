# Test it yourself: about ten minutes on your phone

Written 25/11/2026. This covers what the robot checks can't do: a real emailed code, a real card payment, a declined card, and deleting an account. Everything runs on the **test** site and the **test** app (the preview build). No real money moves: the card numbers are Paystack's own test cards.

**Before you start**
- Open Paystack's test-cards page on your phone and keep it in another tab: search "Paystack test cards". Use the **successful** card and the **declined** card it lists for South Africa and ZAR (any future expiry date and any 3-digit security code work). I couldn't read that page from my side, so I haven't written the numbers here: copy them from Paystack, and note them in `docs/paystack-test-script.md` the first time, so we can repeat them.
- Use two email addresses you can open on your phone: your own, and a throwaway (a second Gmail is fine). The throwaway is the one you delete in step 4.
- Wi-Fi or data on, and the Givezy test app updated (close it fully and open it twice, so it picks up today's update).

## 1. A real sign-in code (2 minutes)
1. Open the app. If you see the welcome screen, tap **I already have an account**. You should see the blue header **Welcome back.**
2. Type your own email and tap **Send me a sign-in code**. You should see a box for the code.
3. Open the email, copy the 8-digit code, and paste it into the app.
4. You should land signed in: the Account tab shows your email, and Progress and Home load without an error.
5. Check: close the app fully and open it again. You should still be signed in.

Tell me if: no email arrives within a minute, the code is refused, or you see the wrong greeting.

## 2. A real gift with the test card (3 minutes)
1. In the app, open **Demo charity (test only)** and tap **Give**.
2. Type **R30** (the minimum). You should see the amount shown as R30, and the button showing your exact total.
3. Fill in your details and tick the agreement. Press and hold the Give button.
4. The payment page opens in a sheet. Pay with Paystack's **successful** test card.
5. You should come back to a confirmation that the gift is paid. Then open **Progress**: the R30 shows there.

Tell me if: the payment page doesn't open, you are charged but see no confirmation (that is the one that matters most), or any wording looks wrong.

## 3. A declined card (2 minutes)
1. Give R30 to the same charity again.
2. This time pay with Paystack's **declined** test card.
3. You should see a plain message saying the payment didn't go through and **nothing was charged**. What you typed should still be on screen, with one clear way to try again and a way to reach a person.
4. Now turn Wi-Fi and data off, and press and hold Give. You should see a plain "you're offline, nothing was charged" message, still with your details kept. Turn the connection back on and try again.

Tell me if: the gift shows as paid anywhere (Progress, receipts) after a decline, or you see an error with no explanation.

## 4. Delete a throwaway account (3 minutes)
Do this within 10 minutes of signing in: the app asks you to have signed in recently before it deletes anything.
1. Account tab, **Sign out**. Sign in with the throwaway email (step 1 again, with the throwaway address).
2. Account tab, **Delete my account**. You should see a screen listing what is deleted and what is kept.
3. Type **DELETE** (the button stays off until you do), then follow the screens: you will be asked for an emailed code.
4. The last screen should read **We've emailed you a confirmation** (a normal apostrophe, not `&apos;`), and you should be signed out.
5. Sign in again with the same throwaway email. You should get a fresh, empty account: no gifts, no goal.

Tell me if: it refuses with a reason you don't understand, the confirmation email never arrives, or the old account's data is still there.

## Bonus, 1 minute each
- **Website give form:** on your phone open the test site, go to Demo charity, Give, and press Give on the empty form. You should see every missing field named at once, in Givezy's words (not the browser's pop-up).
- **Charity demo:** open `/demo/dashboard/receipts`, tap **Preview** on a donor, then **Approve all**, then **Undo**. Nothing is sent.

## What to send me
For each step: "worked", or what you saw (a screenshot is best). I fix what broke and tell you when to run that step again.
