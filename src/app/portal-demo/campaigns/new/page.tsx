import type { Metadata } from "next";
import { NewCampaignView } from "@/portal-demo/views/campaign-form";

export const metadata: Metadata = { title: "New campaign" };

export default function Page() {
  return <NewCampaignView />;
}
