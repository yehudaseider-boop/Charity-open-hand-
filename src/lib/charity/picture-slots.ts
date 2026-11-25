import type { PictureSlot } from "./picture-sizes";

/**
 * Where each charity picture sits on the website, measured from each page's own layout (25/11/2026), widest screens
 * first. Phones: the width in CSS pixels (the phone's own density, three on an iPhone, does the rest). From 640 px up
 * (`laptop`): twice the width, so a laptop at normal density gets two pixels per one. The page column is 1 200 px
 * with 24 px sides from 640 px (16 px on a phone). A box wider than the picture's own shape asks for more
 * (picture-sizes.ts, pictureSizes). Checked for every placement in tests/picture-copies.test.ts.
 */
export const SLOTS = {
  /** Charity page: the cover across the top (16:9 on a phone, 3:1 from 640 px). */
  pageCover: [
    { media: "(min-width: 1200px)", width: "1152px", aspect: 3, laptop: true },
    { media: "(min-width: 640px)", width: "calc(100vw - 48px)", aspect: 3, laptop: true },
    { width: "calc(100vw - 32px)", aspect: 16 / 9 },
  ],
  /** Charity page: the logo over the cover's edge (96 px, 128 px from 640 px). */
  pageLogo: [
    { media: "(min-width: 640px)", width: "128px", aspect: 1, laptop: true },
    { width: "96px", aspect: 1 },
  ],
  /** Charity page: an update's photo (4:3) inside its card (the timeline and the card's padding take 68 px). */
  pageUpdate: [
    { media: "(min-width: 1024px)", width: "668px", aspect: 4 / 3, laptop: true },
    { media: "(min-width: 640px)", width: "calc(100vw - 116px)", aspect: 4 / 3, laptop: true },
    { width: "calc(100vw - 96px)", aspect: 4 / 3 },
  ],
  /** Charity page: the photos grid (square; two across on a phone, three from 640 px). */
  pageGallery: [
    { media: "(min-width: 1024px)", width: "238px", aspect: 1, laptop: true },
    { media: "(min-width: 640px)", width: "calc((100vw - 72px) / 3)", aspect: 1, laptop: true },
    { width: "50vw", aspect: 1 },
  ],
  /** Find a charity: a card's cover (16:9; one across on a phone, two from 640 px, three from 1 024 px). */
  cardCover: [
    { media: "(min-width: 1024px)", width: "371px", aspect: 16 / 9, laptop: true },
    { media: "(min-width: 640px)", width: "calc((100vw - 68px) / 2)", aspect: 16 / 9, laptop: true },
    { width: "calc(100vw - 32px)", aspect: 16 / 9 },
  ],
  /** Find a charity: a card's logo tile (64 px). */
  cardLogo: [
    { media: "(min-width: 640px)", width: "64px", aspect: 1, laptop: true },
    { width: "64px", aspect: 1 },
  ],
  /** Find a charity: the cause of the week's photo (4:3; beside the words from 768 px). */
  weekCover: [
    { media: "(min-width: 768px)", width: "470px", aspect: 4 / 3, laptop: true },
    { media: "(min-width: 640px)", width: "calc(100vw - 128px)", aspect: 4 / 3, laptop: true },
    { width: "calc(100vw - 80px)", aspect: 4 / 3 },
  ],
  /** Dashboard, Your page: the logo (80 px). */
  adminLogo: [
    { media: "(min-width: 640px)", width: "80px", aspect: 1, laptop: true },
    { width: "80px", aspect: 1 },
  ],
  /** Dashboard, Your page: the cover (3:1, the card's width). */
  adminCover: [
    { media: "(min-width: 640px)", width: "900px", aspect: 3, laptop: true },
    { width: "calc(100vw - 64px)", aspect: 3 },
  ],
  /** Dashboard, Updates: an update's photo (4:3, at most 384 px). */
  adminUpdate: [
    { media: "(min-width: 640px)", width: "384px", aspect: 4 / 3, laptop: true },
    { width: "calc(100vw - 64px)", aspect: 4 / 3 },
  ],
  /** Dashboard, Updates: the photos grid (square; two across, three from 640 px). */
  adminGallery: [
    { media: "(min-width: 640px)", width: "300px", aspect: 1, laptop: true },
    { width: "50vw", aspect: 1 },
  ],
} satisfies Record<string, PictureSlot[]>;
