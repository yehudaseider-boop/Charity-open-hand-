import { shareImage, shareImageSize, shareImageType } from "@/lib/seo/share-image";

export const alt = "Givezy: good starts here. Give to South African charities";
export const size = shareImageSize;
export const contentType = shareImageType;

export default function Image() {
  return shareImage({
    headline: [{ blue: "Good" }, "starts here."],
    subline: "Give to registered South African charities, once or every month, with every s18A receipt in one place.",
    art: { person: "dreamGift" },
  });
}
