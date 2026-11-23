/**
 * Which colour the phone's clock and battery take. Light (white) only while a blue colour block or a photo is
 * under them; dark (deep ink) on white pages and once white has scrolled up under them.
 * Dependency-free, so it can be tested on its own.
 */
export type BarStyle = "light" | "dark";

/**
 * `onDark`: the screen starts with blue or a photo. `offsetY`: how far it has scrolled (negative while pulling
 * down to refresh). `lightUntil`: the furthest scroll at which blue or the photo is still under the clock.
 */
export function statusBarStyle(onDark: boolean, offsetY: number, lightUntil: number): BarStyle {
  return onDark && offsetY <= lightUntil ? "light" : "dark";
}

/**
 * The charity page: its 320-high cover photo (or blue block) is under the clock until the white bar slides in
 * behind the round buttons, which fades in between 220 and 300; the clock turns dark halfway, at 260.
 */
export const CHARITY_LIGHT_UNTIL = 260;

/**
 * A photo header that scrolls away with the page (the thank-you after a gift): light until its bottom edge
 * reaches the foot of the status bar. Unknown height (not laid out yet): light, as the screen opens at the top.
 */
export function photoLightUntil(heroHeight: number | null, statusBarHeight: number): number {
  return heroHeight === null ? Number.POSITIVE_INFINITY : Math.max(0, heroHeight - statusBarHeight);
}
