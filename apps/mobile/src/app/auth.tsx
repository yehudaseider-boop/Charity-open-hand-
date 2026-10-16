import { Redirect } from "expo-router";

/** Where Google and Apple sign-in hand back to the app; the account layer finishes it, so just go to Account. */
export default function AuthReturn() {
  return <Redirect href="/account" />;
}
