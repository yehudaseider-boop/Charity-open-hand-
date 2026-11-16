/**
 * Reading a CSV file a charity chose to import (review 12/11/2026). Excel on Windows often saves "CSV (comma
 * delimited)" in Windows-1252, not UTF-8, so a name like André or Zoë arrives as bytes that aren't valid UTF-8 and
 * would show as "Andr�". The file is read as bytes and decoded here: UTF-8 when the bytes are valid UTF-8 (a real
 * UTF-8 file, with any language's letters, stays exactly as it is), Windows-1252 otherwise. A byte-order mark at the
 * start ("CSV UTF-8" from Excel) is dropped. Pure and dependency-free (TextDecoder is in every browser and in Node).
 */

export type CsvEncoding = "utf-8" | "windows-1252";

/** Which encoding the file's bytes are in: UTF-8 when they are valid UTF-8, Windows-1252 when they aren't. */
export function csvEncoding(bytes: Uint8Array): CsvEncoding {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return "utf-8";
  } catch {
    return "windows-1252";
  }
}

/** The file's text, decoded as above, without a byte-order mark. */
export function decodeCsvBytes(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const text = new TextDecoder(csvEncoding(bytes)).decode(bytes);
  return text.replace(/^﻿/, "");
}
