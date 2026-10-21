import "server-only";
import QRCode from "qrcode";
import { brandColors } from "@/lib/brand-colors";

/** The address a charity's QR code opens: its public page on Givezy. */
export function charityPageUrl(slug: string, site = process.env.SITE_URL ?? ""): string {
  return `${site.replace(/\/+$/, "")}/c/${encodeURIComponent(slug)}`;
}

/** What the QR code itself opens: the same page, tagged so gifts from the poster show as "QR poster". */
export function qrTarget(slug: string, site = process.env.SITE_URL ?? ""): string {
  return `${charityPageUrl(slug, site)}?src=qr`;
}

/** A QR code as SVG, in the brand's navy on white, with medium error correction (survives a smudge or a fold). */
export function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: brandColors.ink, light: brandColors.surface } });
}
