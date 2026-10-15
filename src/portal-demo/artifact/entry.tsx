/**
 * Entry for the shareable single-page build of the portal (see scripts/build-portal-artifact.mjs).
 * Same screens, data and interactions as /portal-demo, routed inside one page. Hosts that block
 * file downloads show each CSV export on screen to copy instead.
 */
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Modal } from "../ui/overlay";
import { Button } from "../ui/primitives";
import { PortalShell } from "../ui/shell";
import { AnalyticsView } from "../views/analytics";
import { CampaignDetailView } from "../views/campaign-detail";
import { NewCampaignView } from "../views/campaign-form";
import { CampaignsView } from "../views/campaigns";
import { DonationsView } from "../views/donations";
import { DonorsView } from "../views/donors";
import { FinancesView } from "../views/finances";
import { OverviewView } from "../views/overview";
import { ReceiptsView } from "../views/receipts";
import { RecurringView } from "../views/recurring";
import { SettingsView } from "../views/settings";
import { pathOf, useRoute } from "./router";

const ROUTES: [RegExp, () => React.ReactNode][] = [
  [/^\/portal-demo\/?$/, OverviewView],
  [/^\/portal-demo\/donations$/, DonationsView],
  [/^\/portal-demo\/donors$/, DonorsView],
  [/^\/portal-demo\/campaigns$/, CampaignsView],
  [/^\/portal-demo\/campaigns\/new$/, NewCampaignView],
  [/^\/portal-demo\/campaigns\/[^/]+$/, CampaignDetailView],
  [/^\/portal-demo\/recurring$/, RecurringView],
  [/^\/portal-demo\/receipts$/, ReceiptsView],
  [/^\/portal-demo\/analytics$/, AnalyticsView],
  [/^\/portal-demo\/finances$/, FinancesView],
  [/^\/portal-demo\/settings$/, SettingsView],
];

type Csv = { name: string; text: string } | null;

declare global {
  interface Window {
    __gzCsvPreview?: (name: string, text: string) => void;
  }
}

function CsvPreview() {
  const [csv, setCsv] = useState<Csv>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    window.__gzCsvPreview = (name, text) => {
      setCopied(false);
      setCsv({ name, text });
    };
    return () => {
      window.__gzCsvPreview = undefined;
    };
  }, []);
  if (!csv) return null;
  const rows = csv.text.trim().split("\r\n").length - 1;
  return (
    <Modal
      open
      size="lg"
      onClose={() => setCsv(null)}
      title={csv.name}
      description={`${rows} rows. This preview page cannot save files, so here is the CSV to copy. In the real portal it downloads.`}
      footer={
        <>
          <Button variant="ghost" onClick={() => setCsv(null)}>
            Close
          </Button>
          <Button
            icon="copy"
            onClick={() => {
              navigator.clipboard
                ?.writeText(csv.text.replace(/^﻿/, ""))
                .then(() => setCopied(true))
                .catch(() => {
                  const el = document.getElementById("gz-csv-text") as HTMLTextAreaElement | null;
                  el?.select();
                });
            }}
          >
            {copied ? "Copied" : "Copy CSV"}
          </Button>
        </>
      }
    >
      <textarea id="gz-csv-text" readOnly value={csv.text.replace(/^﻿/, "")} className="h-80 w-full rounded-2xl border border-gz-hairline bg-gz-cream p-3 font-mono text-xs text-gz-ink" />
    </Modal>
  );
}

function App() {
  const route = useRoute();
  const path = pathOf(route);
  const View = ROUTES.find(([re]) => re.test(path))?.[1] ?? OverviewView;
  return (
    <PortalShell>
      <View key={route} />
      <CsvPreview />
    </PortalShell>
  );
}

createRoot(document.getElementById("gz-root")!).render(<App />);
