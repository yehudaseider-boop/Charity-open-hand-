/**
 * SARS tax year: 1 March to the end of February, named by the year it ends
 * (tax year 2027 = 01/03/2026 to 28/02/2027). Same rule as the website's
 * src/lib/dates.ts. Uses the date's own calendar fields.
 */
export function taxYearFor(d: Date): number {
  return d.getMonth() >= 2 ? d.getFullYear() + 1 : d.getFullYear();
}

export function taxYearRangeLabel(year: number): string {
  const leap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return `01/03/${year - 1} to ${leap(year) ? 29 : 28}/02/${year}`;
}
