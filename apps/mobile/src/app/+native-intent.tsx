import { isSheetReturn } from "@/lib/give-flow";

/**
 * Links that open the app. The payment sheet's own return link is ignored while the sheet is open, so the
 * give screen stays put and can tell the donor what happened (see isSheetReturn). Everything else passes through.
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string | null {
  try {
    return isSheetReturn(path, initial) ? null : path;
  } catch {
    return path;
  }
}
