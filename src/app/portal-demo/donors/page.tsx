import type { Metadata } from "next";
import { DonorsView } from "@/portal-demo/views/donors";

export const metadata: Metadata = { title: "Donors" };

export default function Page() {
  return <DonorsView />;
}
