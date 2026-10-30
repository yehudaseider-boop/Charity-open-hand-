/**
 * An amount in words for the s18A receipt, the way a cheque or a tax certificate writes it out:
 * 530000 cents is "Five thousand three hundred rand", 3457 cents is "Thirty-four rand and fifty-seven cents".
 * Sentence case (the Givezy style has no capitals for emphasis). Whole cents only; no floating point.
 */
const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const SCALES: [bigint, string][] = [
  [1_000_000_000n, "billion"],
  [1_000_000n, "million"],
  [1_000n, "thousand"],
];

function underThousand(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} hundred`);
    n %= 100;
    if (n) parts.push("and");
  }
  if (n >= 20) parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : ""));
  else if (n > 0) parts.push(ONES[n]);
  return parts.join(" ");
}

export function numberInWords(value: bigint): string {
  if (value === 0n) return "zero";
  const parts: string[] = [];
  let rest = value;
  for (const [size, name] of SCALES) {
    if (rest >= size) {
      parts.push(`${numberInWords(rest / size)} ${name}`);
      rest %= size;
    }
  }
  if (rest > 0n) {
    // "One thousand and five": British and SA usage puts "and" before a last part under a hundred.
    if (parts.length && rest < 100n) parts.push("and");
    parts.push(underThousand(Number(rest)));
  }
  return parts.join(" ");
}

export function randInWords(cents: number | bigint): string {
  const value = BigInt(cents);
  if (value < 0n) throw new Error("A receipt amount cannot be negative");
  const rand = value / 100n;
  const c = value % 100n;
  const words =
    rand > 0n && c > 0n
      ? `${numberInWords(rand)} rand and ${numberInWords(c)} ${c === 1n ? "cent" : "cents"}`
      : c > 0n
        ? `${numberInWords(c)} ${c === 1n ? "cent" : "cents"}`
        : `${numberInWords(rand)} rand`;
  return words.charAt(0).toUpperCase() + words.slice(1);
}
