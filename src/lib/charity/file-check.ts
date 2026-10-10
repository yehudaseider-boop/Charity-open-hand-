/**
 * Checks a file's first bytes, not just the type the browser claims, so a
 * public image is really an image and a document really a PDF or image.
 */
async function head(file: File, n = 12): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, n).arrayBuffer());
}
const starts = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);

export async function isRealImage(file: File): Promise<boolean> {
  const b = await head(file);
  if (file.type === "image/jpeg") return starts(b, [0xff, 0xd8, 0xff]);
  if (file.type === "image/png") return starts(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (file.type === "image/webp") return starts(b, [0x52, 0x49, 0x46, 0x46]) && starts(b, [0x57, 0x45, 0x42, 0x50], 8);
  return false;
}

export async function isRealDocument(file: File): Promise<boolean> {
  if (file.type === "application/pdf") return starts(await head(file), [0x25, 0x50, 0x44, 0x46]); // %PDF
  return isRealImage(file);
}
