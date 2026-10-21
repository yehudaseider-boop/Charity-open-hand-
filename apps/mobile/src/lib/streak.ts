/** Months in a row, ending this month, with at least one gift. Pure, so the website's tests can check it. */
export function monthsInARow(dates: Date[], today: Date): number {
  const has = new Set(dates.map((d) => d.getFullYear() * 12 + d.getMonth()));
  let m = today.getFullYear() * 12 + today.getMonth();
  let n = 0;
  while (has.has(m)) {
    n++;
    m--;
  }
  return n;
}
