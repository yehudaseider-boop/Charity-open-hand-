import { shareImage, shareImageSize, shareImageType } from "@/lib/seo/share-image";

export const alt = "Givezy for charities: let your supporters give to you in a few taps";
export const size = shareImageSize;
export const contentType = shareImageType;

export default function Image() {
  return shareImage({
    headline: ["Let your supporters give to you in", { blue: "a few taps" }],
    subline: "Listing is free. Donations go straight to your own bank account.",
    art: { person: "workingTogether" },
  });
}
