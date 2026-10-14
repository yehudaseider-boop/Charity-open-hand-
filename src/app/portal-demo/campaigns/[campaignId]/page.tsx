import type { Metadata } from "next";
import { CampaignDetailView } from "@/portal-demo/views/campaign-detail";

export const metadata: Metadata = { title: "Campaign" };

export default function Page() {
  return <CampaignDetailView />;
}
