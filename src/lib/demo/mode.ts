/**
 * Demo mode: a separate copy of Givezy, on its own database, that people can play with. Everything
 * in it is made up. It is off unless DEMO_MODE=yes, and even then it stays off unless the rest of the
 * setup is safe: the test payment gateway, no real gateway key and no real email. A real site has a
 * real gateway, so switching DEMO_MODE on there by mistake turns nothing on.
 *
 * Kept free of server-only imports so the proxy, the layout and the tests can all read it.
 */

type Env = Record<string, string | undefined>;

/** True when someone asked for demo mode, whether or not the rest of the setup allows it. */
export function demoModeRequested(env: Env = process.env): boolean {
  return env.DEMO_MODE === "yes";
}

/** What stops demo mode from switching on, in plain words. Empty when it is safe. */
export function demoModeProblems(env: Env = process.env): string[] {
  const problems: string[] = [];
  if ((env.PAYMENT_GATEWAY ?? "test") !== "test") problems.push("PAYMENT_GATEWAY must be test");
  if (env.PAYSTACK_SECRET_KEY) problems.push("a real payment gateway key is set");
  if ((env.EMAIL_TRANSPORT ?? "console") !== "console") problems.push("EMAIL_TRANSPORT must be console (or unset)");
  if (env.RESEND_API_KEY) problems.push("a real email key is set");
  return problems;
}

/** Demo mode is on: asked for, and safe. */
export function demoModeOn(env: Env = process.env): boolean {
  return demoModeRequested(env) && demoModeProblems(env).length === 0;
}

export type DemoPersonKey = "owner" | "admin" | "givezy" | "donor";

export type DemoPerson = {
  key: DemoPersonKey;
  email: string;
  name: string;
  /** The button. */
  label: string;
  /** One line under the button. */
  about: string;
  /** Where they land after signing in. */
  next: string;
  /** Charity and Givezy admins pass the authenticator-app second step, done for them in the demo. */
  secondStep: boolean;
};

/** The made-up people. Addresses end in .test, which can never receive email. */
export const DEMO_PEOPLE: readonly DemoPerson[] = [
  {
    key: "owner",
    email: "thandi.owner@givezy-demo.test",
    name: "Thandi Mokoena",
    label: "Charity owner",
    about: "Runs Northcliff Meals Fund: donors, campaigns, s18A receipts and the team.",
    next: "/charity-admin",
    secondStep: true,
  },
  {
    key: "admin",
    email: "sipho.admin@givezy-demo.test",
    name: "Sipho Ndlovu",
    label: "Charity admin",
    about: "Helps run Northcliff Meals Fund, without the owner's say over the team.",
    next: "/charity-admin",
    secondStep: true,
  },
  {
    key: "givezy",
    email: "lerato.givezy@givezy-demo.test",
    name: "Lerato Dube",
    label: "Givezy admin",
    about: "Approves charities, signs off s18A receipts and picks the cause of the week.",
    next: "/admin",
    secondStep: true,
  },
  {
    key: "donor",
    email: "david.donor@givezy-demo.test",
    name: "David Levin",
    label: "Donor",
    about: "Gives once-off and every month, with s18A receipts and a tax pack.",
    next: "/account",
    secondStep: false,
  },
];

export function demoPerson(key: unknown): DemoPerson | null {
  return DEMO_PEOPLE.find((p) => p.key === key) ?? null;
}

/** The demo's own paths: these answer "not found" whenever demo mode is off. */
export function isDemoPath(pathname: string): boolean {
  return pathname === "/demo" || pathname.startsWith("/demo/") || pathname.startsWith("/api/jobs/demo-reset");
}
