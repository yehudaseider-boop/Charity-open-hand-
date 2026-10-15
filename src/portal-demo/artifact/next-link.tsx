/** Stand-in for next/link in the single-page build: navigates inside the page. */
import { forwardRef, type AnchorHTMLAttributes, type ReactNode } from "react";
import { navigate } from "./router";

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string | { pathname?: string }; children?: ReactNode; prefetch?: boolean };

const Link = forwardRef<HTMLAnchorElement, Props>(function Link({ href, onClick, prefetch: _prefetch, ...rest }, ref) {
  const target = typeof href === "string" ? href : (href.pathname ?? "/portal-demo");
  return (
    <a
      ref={ref}
      href="#"
      {...rest}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented) return;
        e.preventDefault();
        navigate(target);
      }}
    />
  );
});

export default Link;
