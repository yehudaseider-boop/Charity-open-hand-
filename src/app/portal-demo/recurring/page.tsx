import type { Metadata } from "next";
import { RecurringView } from "@/portal-demo/views/recurring";

export const metadata: Metadata = { title: "Monthly giving" };

export default function Page() {
  return <RecurringView />;
}
