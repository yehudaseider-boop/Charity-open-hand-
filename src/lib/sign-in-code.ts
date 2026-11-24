/**
 * The sign-in code from the email, one rule for the website and the phone app (shared, dependency-free). Supabase sends
 * 6 to 10 digits depending on the project's "Email OTP length" (the test project sends 8). The app once accepted only
 * 6 and nobody could sign in (18/11/2026); one shared rule, checked by the end-to-end robot with a real code, keeps the
 * two from drifting apart again.
 */
export const SIGN_IN_CODE = /^\d{6,10}$/;

/**
 * The code as typed, or null when it isn't one. Spaces and dashes are fine ("1234 5678", "1234-5678"), and so are the
 * invisible marks a copy from a mail or messaging app can carry, and full-width digits from some phone keyboards
 * (24/11/2026: the website took out spaces only, so a code pasted as "1234-5678" was refused there but not in the app).
 */
/**
 * When a typed code couldn't be checked, rather than being wrong (24/11/2026): Supabase was busy (429) or down (5xx).
 * Both used to read "That code didn't work", so a person typed the right code again and again. The same words on the
 * website and in the app.
 */
export const CODE_CHECK_BUSY = "Too many codes have been checked in the last few minutes, so we couldn't check yours. Please wait a few minutes, then try the newest code again.";
export const CODE_CHECK_DOWN = "We couldn't check your code just now. Nothing is wrong with it. Please try again in a minute: it works for a short while.";

export function cleanSignInCode(v: string): string | null {
  const c = v.normalize("NFKC").replace(/[\s\-‐-―−]|\p{Cf}/gu, "");
  return SIGN_IN_CODE.test(c) ? c : null;
}
