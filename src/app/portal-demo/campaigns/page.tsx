import type { Metadata } from "next";
import { CampaignsView } from "@/portal-demo/views/campaigns";

export const metadata: Metadata = { title: "Campaigns" };

export default function Page() {
  return <CampaignsView />;
}
