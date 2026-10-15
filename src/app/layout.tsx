import type { Metadata, Viewport } from "next";
import { Fredoka, Heebo, Inter } from "next/font/google";
import { platformConfig } from "@/config/platform";
import { SiteFooter } from "@/components/legal";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

// The brand fonts, the same as the phone app: Fredoka for page titles, Inter for everything else, Heebo for Hebrew.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const fredoka = Fredoka({ variable: "--font-fredoka", subsets: ["latin"], weight: ["600", "700"] });
const heebo = Heebo({ variable: "--font-heebo", subsets: ["hebrew"], weight: ["400", "600"] });

export const metadata: Metadata = {
  title: { default: platformConfig.appName, template: `%s | ${platformConfig.appName}` },
  description: platformConfig.appTagline,
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-ZA" className={`${inter.variable} ${fredoka.variable} ${heebo.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <SiteHeader />
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
