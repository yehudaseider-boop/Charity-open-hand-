import { Redirect } from "expo-router";

/** The middle tab is the big Give button, which opens a sheet instead of a page. A link straight here lands on Home. */
export default function GiveNow() {
  return <Redirect href="/home" />;
}
