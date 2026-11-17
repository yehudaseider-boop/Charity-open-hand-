import { redirect } from "next/navigation";

/** The home page preview became the home page (17/11/2026). The old address keeps working. */
export default function HomePreview() {
  redirect("/");
}
