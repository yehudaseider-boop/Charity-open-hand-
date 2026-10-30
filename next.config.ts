import type { NextConfig } from "next";
import { checkoutOrigins } from "./src/lib/gateway/checkout-origins";

const isDev = process.env.NODE_ENV === "development";

/** Charity logos and covers are served from Supabase storage. */
const supabaseOrigin = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin : "";
  } catch {
    return "";
  }
})();

/**
 * Content security policy without nonces (see the Next.js CSP guide).
 * frame-ancestors 'none' stops other sites showing our pages in a frame
 * (clickjacking on checkout). form-action: our forms only post to us, and may land on the payment
 * provider's page. Once the page has loaded, that page is reached by a script, but a tap before then is a
 * plain form post, and the browser refuses to follow our redirect unless its address is named here.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' blob: data:${supabaseOrigin ? ` ${supabaseOrigin}` : ""}`,
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  ["form-action 'self'", ...checkoutOrigins(process.env.PAYMENT_GATEWAY)].join(" "),
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const receiptFiles = [
  "./node_modules/@sparticuz/chromium/bin/**",
  "./src/lib/receipts/fonts/BricolageGrotesque-Bold.ttf",
  "./node_modules/@fontsource/dm-sans/files/dm-sans-latin-{400,500,600}-normal.woff2",
  "./public/logo.png",
];

const nextConfig: NextConfig = {
  // Receipt PDFs are printed with Chrome through playwright-core: loaded from node_modules at run time, not bundled.
  // On the hosted site the Chrome is @sparticuz/chromium (a compressed Chromium for serverless hosts).
  serverExternalPackages: ["playwright-core", "@sparticuz/chromium"],
  // Files the receipt pages read from disk at run time (fonts and logo embedded in each PDF, and the packed
  // Chromium), which the build cannot see from the code: ship them with those pages only.
  outputFileTracingIncludes: {
    "/admin/receipts": receiptFiles,
    "/charity-admin/\\[id\\]/receipts": receiptFiles,
  },
  experimental: {
    // Server actions accept 1 MB by default, but charity photos and documents may be up to 4 MB
    // (MAX_UPLOAD_BYTES in src/lib/charity/validation.ts). Leave room for the rest of the form.
    serverActions: { bodySizeLimit: "4.5mb" },
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
