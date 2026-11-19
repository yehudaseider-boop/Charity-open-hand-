import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { platformConfig } from "@/config/platform";
import { PageFooter } from "@/components/page-footer";
import { SmoothSectionLinks } from "@/components/smooth-section-links";
import { RouteMemory } from "@/components/route-memory";
import { SiteHeader } from "@/components/site-header";
import { siteIndexable } from "@/lib/seo/indexing";
import "./globals.css";

// The brand fonts: Bricolage Grotesque for headlines and amounts (from 25/10/2026), DM Sans for everything else.
// Kept as our own files in src/fonts (both are open-licence fonts, licences beside them) instead of downloaded from
// Google while the site is built (17/11/2026): a failed download had stopped three builds in a row. Latin letters
// only, the same as before. The weights are exactly those the site uses.
const dmSans = localFont({
  variable: "--font-dm-sans",
  display: "swap",
  src: [
    { path: "../fonts/dm-sans-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/dm-sans-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../fonts/dm-sans-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../fonts/dm-sans-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
});
const bricolage = localFont({
  variable: "--font-bricolage",
  display: "swap",
  src: [
    { path: "../fonts/bricolage-grotesque-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../fonts/bricolage-grotesque-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "../fonts/bricolage-grotesque-latin-800-normal.woff2", weight: "800", style: "normal" },
  ],
});

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
    // Scrolling is instant everywhere (a new page opens at the top, Back returns to the same place) and only links to a
    // section of the same page glide, through SmoothSectionLinks (10/11/2026). data-scroll-behavior stays as a guard in
    // case smooth scrolling is ever set in CSS again.
    <html lang="en-ZA" data-scroll-behavior="smooth" className={`${dmSans.variable} ${bricolage.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <a href="#main" className="skip-link">Skip to main content</a>
        <RouteMemory />
        <SmoothSectionLinks />
        <SiteHeader />
        {/* tabIndex -1: the skip link moves keyboard focus here, so the next Tab lands on the first thing in the page. */}
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 outline-none">{children}</main>
        <PageFooter />
      </body>
    </html>
  );
}
