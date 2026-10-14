/**
 * Sunset in Johannesburg, worked out from the date (no table of times to go
 * stale). The Jewish day begins at sunset, so the app needs it to know when
 * "today" turns over, when Shabbos or Yom Tov starts, and when it ends.
 *
 * The standard sunrise/sunset method (Almanac for Computers, 1990), good to
 * about two minutes: checked against the Hebcal library's sunset in tests.
 * Johannesburg is used for everyone; other South African cities differ by up
 * to about half an hour, which is why the app only says "tonight", never a time.
 */
export const JOHANNESBURG = { lat: -26.2041, lon: 28.0473 };

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const norm = (x: number, max: number) => ((x % max) + max) % max;

/** The moment the sun sets (centre of the sun 0.833° below the horizon) on a civil date, as an instant. */
export function sunset(date: Date, place = JOHANNESBURG): Date {
  const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
  const N = Math.floor((275 * m) / 9) - Math.floor((m + 9) / 12) * (1 + Math.floor((y - 4 * Math.floor(y / 4) + 2) / 3)) + d - 30;
  const lngHour = place.lon / 15;
  const t = N + (18 - lngHour) / 24;
  const M = 0.9856 * t - 3.289;
  const L = norm(M + 1.916 * Math.sin(rad(M)) + 0.02 * Math.sin(rad(2 * M)) + 282.634, 360);
  let RA = norm(deg(Math.atan(0.91764 * Math.tan(rad(L)))), 360);
  RA += Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90;
  RA /= 15;
  const sinDec = 0.39782 * Math.sin(rad(L));
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosH = (Math.cos(rad(90.833)) - sinDec * Math.sin(rad(place.lat))) / (cosDec * Math.cos(rad(place.lat)));
  const H = deg(Math.acos(Math.max(-1, Math.min(1, cosH)))) / 15;
  const T = H + RA - 0.06571 * t - 6.622;
  const UT = norm(T - lngHour, 24);
  return new Date(Date.UTC(y, m - 1, d) + UT * 3_600_000);
}
