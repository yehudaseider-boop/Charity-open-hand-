import type { Metadata } from "next";
import { Fredoka } from "next/font/google";
import { notFound } from "next/navigation";
import { PortalShell } from "@/portal-demo/ui/shell";

/** Givezy's display face (the phone app uses it too): rounded and friendly like the wordmark. */
const fredoka = Fredoka({ variable: "--font-fredoka", subsets: ["latin"], weight: ["500", "600"] });

export const metadata: Metadata = {
  title: { default: "Charity portal (demo)", template: "%s | Givezy charity portal (demo)" },
  robots: { index: false, follow: false },
};

/**
 * Givezy charity portal: DESIGN PROTOTYPE. Fictional data only, no database, no gateway,
 * no email. Runs under `npm run dev`; on a built site only when PORTAL_DEMO=yes.
 */
export default function PortalDemoLayout({ children }: LayoutProps<"/portal-demo">) {
  if (process.env.NODE_ENV === "production" && process.env.PORTAL_DEMO !== "yes") notFound();
  return (
    <div className={fredoka.variable}>
      <PortalShell>{children}</PortalShell>
    </div>
  );
}
