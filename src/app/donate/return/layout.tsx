import { ChromeMark } from "@/components/chrome-mark";
import { currentFocus } from "@/lib/focus-server";

/** The thank-you page after paying: still only that charity when the gift started from its own link (lib/focus.ts). */
export default async function ReturnLayout({ children }: LayoutProps<"/donate/return">) {
  return (
    <>
      {(await currentFocus()) ? <ChromeMark kind="focus" /> : null}
      {children}
    </>
  );
}
