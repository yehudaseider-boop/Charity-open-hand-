import type { Metadata } from "next";
import { FinancesView } from "@/portal-demo/views/finances";

export const metadata: Metadata = { title: "Finances and payouts" };

export default function Page() {
  return <FinancesView />;
}
