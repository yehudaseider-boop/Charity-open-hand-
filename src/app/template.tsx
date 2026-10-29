/** Every page arrives with a short fade and rise (see .page-enter in globals.css; still for reduced motion). */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
