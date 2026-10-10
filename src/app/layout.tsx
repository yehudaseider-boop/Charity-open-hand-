import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import { platformConfig } from "@/config/platform";
import { SiteFooter } from "@/components/legal";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

// The same font as the phone app and the logo.
const latin = Archivo({ variable: "--font-latin", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: platformConfig.appName, template: `%s | ${platformConfig.appName}` },
  description: platformConfig.appTagline,
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-ZA" className={`${latin.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <SiteHeader />
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
