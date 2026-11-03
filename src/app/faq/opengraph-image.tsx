import { shareImage, shareImageSize, shareImageType } from "@/lib/seo/share-image";

export const alt = "Questions about Givezy";
export const size = shareImageSize;
export const contentType = shareImageType;

export default function Image() {
  return shareImage({
    headline: ["Questions about", { blue: "Givezy" }],
    subline: "What it costs, how charities are checked, s18A receipts and your privacy.",
    art: { person: "checklist" },
  });
}
