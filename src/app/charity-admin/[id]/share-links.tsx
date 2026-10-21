import { withSource } from "@/lib/donations/source";
import { CopyLink } from "./copy-link";

/**
 * A page to share: copy the link, or open WhatsApp with a short message. Each carries its own tag, so
 * the Donations page can show which gifts came from a copied link and which from WhatsApp.
 */
export function ShareLinks({ url, message }: { url: string; message: string }) {
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`${message} ${withSource(url, "whatsapp")}`)}`;
  return (
    <div className="space-y-2">
      <CopyLink url={withSource(url, "link")} />
      <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="inline-block text-brand underline">Share on WhatsApp</a>
    </div>
  );
}
