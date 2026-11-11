import { shareImage, shareImageSize, shareImageType } from "@/lib/seo/share-image";

export const alt = "Givezy for donors: give in a few taps and keep every receipt";
export const size = shareImageSize;
export const contentType = shareImageType;

export default function Image() {
  return shareImage({
    headline: ["Give in a few taps.", { blue: "Keep every receipt." }],
    subline: "Checked South African charities, once or every month, with your s18A receipts in one place.",
    art: { person: "loveIt" },
  });
}
