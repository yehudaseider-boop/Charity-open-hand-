/** "1 donor", "3 donors"; give the plural when it isn't just an added "s" ("1 is", "2 are" style words go outside). */
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * A name someone typed, set apart inside a sentence shown on a page: the Unicode isolates (FSI ... PDI) do in a plain
 * string what <bdi> does in JSX, so a right-to-left name (Hebrew, Arabic) can't reorder the words or the full stop
 * around it. For words on a page only: plain-text emails get the name as typed.
 */
export const isolate = (name: string): string => `⁨${name}⁩`;
