import type { Metadata } from "next";
import { SettingsView } from "@/portal-demo/views/settings";

export const metadata: Metadata = { title: "Settings and team" };

export default function Page() {
  return <SettingsView />;
}
