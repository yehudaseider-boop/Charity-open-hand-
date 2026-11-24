/**
 * What the give screen offers under "About you" for remembering a donor's details (24/11/2026, Yehuda: "I don't want
 * to have to put it in every time I wanna give"). Details are kept on the phone per signed-in person only, never for
 * someone signed out (on a shared phone the next person would see them). So a signed-out donor is offered sign-in
 * (one emailed code), not a switch that would save nothing they could get back.
 */
export type RememberOffer = "switch" | "sign-in";

export function rememberOffer(status: "preview" | "loading" | "signed-out" | "agreeing" | "signed-in"): RememberOffer {
  return status === "signed-out" ? "sign-in" : "switch";
}

export const SIGN_IN_TO_REMEMBER = "Sign in so we remember you next time";
export const SIGN_IN_TO_REMEMBER_NOTE = "One emailed code. Your name and email then fill in here, kept on this phone only. What you've typed stays.";
