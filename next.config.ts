import type { NextConfig } from "next";
import { checkoutOrigins } from "./src/lib/gateway/checkout-origins";
import { VIDEO_FRAME_ORIGINS } from "./src/lib/charity/video";
import { buildCsp } from "./src/lib/csp";

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
 * Content security policy for statically built (public) pages: scripts allow 'unsafe-inline', as a page built ahead of
 * time has no request to take a nonce from. Pages that handle sign-in, money or personal data get the nonce policy
 * from src/proxy.ts instead (security hardening 23/11/2026; both are built in src/lib/csp.ts, with the route list).
 */
const csp = buildCsp({
  dev: isDev,
  supabaseOrigin,
  formActionOrigins: checkoutOrigins(process.env.PAYMENT_GATEWAY),
  videoFrameOrigins: VIDEO_FRAME_ORIGINS,
});

const previewCsp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https:",
  "font-src 'self' data:",
  "frame-src 'self'",
  // The preview is built with no database or website address (scripts/build-app-preview.sh), so it fetches nothing
  // from elsewhere: its own files only (security review 23/11/2026; was any https address).
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  // No other window keeps a handle on ours (security review 18/11/2026). The payment page is a full page change, not a pop-up.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const receiptFiles = [
  "./node_modules/@sparticuz/chromium/bin/**",
  // playwright-core reads its own files (browsers.json and more) at run time; the build doesn't see them (19/11/2026:
  // "Cannot find module .../playwright-core/browsers.json" on the hosted site).
  "./node_modules/playwright-core/**",
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
    // "Email me every email" attaches a sample s18A receipt PDF.
    "/admin/settings": receiptFiles,
    "/charity-admin/\\[id\\]/receipts": receiptFiles,
    // The charity's preview of a receipt loads the receipt's fonts from here (09/11/2026).
    "/receipt-fonts/\\[file\\]": ["./src/lib/receipts/fonts/BricolageGrotesque-Bold.ttf", "./node_modules/@fontsource/dm-sans/files/dm-sans-latin-{400,500,600}-normal.woff2"],
  },
  images: {
    // Charity pictures from our public storage go through the image service on the live site (src/components/
    // charity-image.tsx, 24/11/2026): only that one folder, only over https. 90 keeps them sharp (75 is the default).
    remotePatterns: (() => {
      // Off unless CHARITY_IMAGE_SERVICE=yes: with no allowed address, Vercel's image endpoint refuses every request
      // (and bills nothing), whatever a visitor asks for (review 24/11/2026).
      if (process.env.CHARITY_IMAGE_SERVICE !== "yes") return [];
      try {
        const u = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
        if (u.protocol !== "https:") return [];
        return [{ protocol: "https" as const, hostname: u.hostname, port: u.port, pathname: "/storage/v1/object/public/charity-public/**" }];
      } catch {
        return [];
      }
    })(),
    qualities: [75, 90],
  },
  experimental: {
    // Server actions accept 1 MB by default, but charity photos and documents may be up to 4 MB
    // (MAX_UPLOAD_BYTES in src/lib/charity/validation.ts). Leave room for the rest of the form.
    serverActions: { bodySizeLimit: "4.5mb" },
  },
  async headers() {
    return [
      // Everything except the app's browser preview (below): /app-preview itself and what is inside that folder only.
      // (Until 23/11/2026 any address starting with "app-preview", such as /app-previewz, got no headers at all.)
      { source: "/((?!app-preview/|app-preview$).*)", headers: securityHeaders },
      // The app's browser preview (19/11/2026, public/app-preview): the app's own pages, shown in a frame on the same
      // address, with its made-up charity photos from the web. Never listed by search engines.
      {
        source: "/app-preview/:path*",
        headers: [
          { key: "Content-Security-Policy", value: previewCsp },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          ...securityHeaders.filter((h) => !["Content-Security-Policy", "X-Frame-Options"].includes(h.key)),
        ],
      },
    ];
  },
  async rewrites() {
    // The preview app is a single page: any address inside it opens its index.
    return [
      { source: "/app-preview", destination: "/app-preview/index.html" },
      { source: "/app-preview/app/:path*", destination: "/app-preview/app/index.html" },
    ];
  },
};

export default nextConfig;
