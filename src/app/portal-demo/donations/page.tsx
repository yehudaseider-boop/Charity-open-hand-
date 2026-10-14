import type { Metadata } from "next";
import { DonationsView } from "@/portal-demo/views/donations";

export const metadata: Metadata = { title: "Donations" };

export default function Page() {
  return <DonationsView />;
}
