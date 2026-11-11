import { shareImage, shareImageSize, shareImageType } from "@/lib/seo/share-image";

export const alt = "Givezy for charities: get found, get given to, keep your donors";
export const size = shareImageSize;
export const contentType = shareImageType;

export default function Image() {
  // No fee or "free" claims until the fees are settled (Yehuda, 11/11/2026).
  return shareImage({
    headline: ["Get found, get given to,", { blue: "keep your donors" }],
    subline: "Donations go straight to your own bank account. s18A receipts are made for you.",
    art: { person: "workingTogether" },
  });
}
