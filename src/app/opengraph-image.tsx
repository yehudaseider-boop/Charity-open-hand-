import { shareImage, shareImageSize, shareImageType } from "@/lib/seo/share-image";

export const alt = "Givezy: give to South African charities, simply";
export const size = shareImageSize;
export const contentType = shareImageType;

export default function Image() {
  return shareImage({
    headline: ["Give to", { blue: "South African" }, "charities, simply."],
    subline: "Checked charities, no Givezy fee, and every s18A receipt in one place.",
    art: { person: "dreamGift" },
  });
}
