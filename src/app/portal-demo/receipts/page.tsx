import type { Metadata } from "next";
import { ReceiptsView } from "@/portal-demo/views/receipts";

export const metadata: Metadata = { title: "s18A receipts" };

export default function Page() {
  return <ReceiptsView />;
}
