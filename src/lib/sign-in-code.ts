/**
 * The sign-in code from the email, one rule for the website and the phone app (shared, dependency-free). Supabase sends
 * 6 to 10 digits depending on the project's "Email OTP length" (the test project sends 8). The app once accepted only
 * 6 and nobody could sign in (18/11/2026); one shared rule, checked by the end-to-end robot with a real code, keeps the
 * two from drifting apart again.
 */
export const SIGN_IN_CODE = /^\d{6,10}$/;

/** The code as typed (spaces and dashes are fine), or null when it isn't one. */
export function cleanSignInCode(v: string): string | null {
  const c = v.replace(/[\s-]/g, "");
  return SIGN_IN_CODE.test(c) ? c : null;
}
