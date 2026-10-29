import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, DM_Sans, Heebo } from "next/font/google";
import { platformConfig } from "@/config/platform";
import { PageFooter } from "@/components/page-footer";
import { RouteMemory } from "@/components/route-memory";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

// The brand fonts: Bricolage Grotesque for headlines and amounts (from 25/10/2026), DM Sans for everything else, Heebo for Hebrew.
const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"], weight: ["500", "700", "800"] });
const heebo = Heebo({ variable: "--font-heebo", subsets: ["hebrew"], weight: ["400", "600"] });

export const metadata: Metadata = {
  title: { default: platformConfig.appName, template: `%s | ${platformConfig.appName}` },
  description: platformConfig.appTagline,
  // Full addresses for link previews (the Givezy logo when a page has no picture of its own).
  ...(process.env.SITE_URL ? { metadataBase: new URL(process.env.SITE_URL) } : {}),
  openGraph: { siteName: platformConfig.appName, locale: "en_ZA", type: "website", images: [{ url: "/logo.png" }] },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-ZA" className={`${dmSans.variable} ${bricolage.variable} ${heebo.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <RouteMemory />
        <SiteHeader />
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
        <PageFooter />
      </body>
    </html>
  );
}
