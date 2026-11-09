import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, DM_Sans } from "next/font/google";
import { platformConfig } from "@/config/platform";
import { PageFooter } from "@/components/page-footer";
import { RouteMemory } from "@/components/route-memory";
import { SiteHeader } from "@/components/site-header";
import { siteIndexable } from "@/lib/seo/indexing";
import "./globals.css";

// The brand fonts: Bricolage Grotesque for headlines and amounts (from 25/10/2026), DM Sans for everything else.
const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"], weight: ["500", "700", "800"] });

export const metadata: Metadata = {
  title: { default: platformConfig.appName, template: `%s | ${platformConfig.appName}` },
  description: platformConfig.appTagline,
  // Full addresses for link previews (the Givezy logo when a page has no picture of its own).
  ...(process.env.SITE_URL ? { metadataBase: new URL(process.env.SITE_URL) } : {}),
  // The picture comes from each page's opengraph-image (the Givezy share picture), so none is set here.
  openGraph: { siteName: platformConfig.appName, locale: "en_ZA", type: "website" },
  twitter: { card: "summary_large_image" },
  // Hidden from search engines everywhere except the live site (SITE_INDEXING=yes), so Google never lists the test site.
  ...(siteIndexable() ? {} : { robots: { index: false, follow: false } }),
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-scroll-behavior: smooth scrolling is for in-page links (#how) only. Without it, Next.js 16 lets a new page
    // open part way down and drift up to the top (found 09/11/2026), and going back drifts too.
    <html lang="en-ZA" data-scroll-behavior="smooth" className={`${dmSans.variable} ${bricolage.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <RouteMemory />
        <SiteHeader />
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
        <PageFooter />
      </body>
    </html>
  );
}
