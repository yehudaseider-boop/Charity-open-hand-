import { ChromeMark } from "@/components/chrome-mark";

/** The public dashboard demo is a closed room: its own header and footer, with no way off to the rest of Givezy. */
export default function DemoLayout({ children }: LayoutProps<"/demo">) {
  return (
    <>
      <ChromeMark kind="demo" />
      {children}
    </>
  );
}
