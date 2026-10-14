import type { Metadata } from "next";
import { AnalyticsView } from "@/portal-demo/views/analytics";

export const metadata: Metadata = { title: "Analytics" };

export default function Page() {
  return <AnalyticsView />;
}
