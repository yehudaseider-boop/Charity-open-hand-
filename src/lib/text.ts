/** "1 donor", "3 donors"; give the plural when it isn't just an added "s" ("1 is", "2 are" style words go outside). */
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
