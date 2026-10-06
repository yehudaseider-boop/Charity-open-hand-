import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/badge";
import { BilingualName } from "@/components/bilingual-name";
import { requireViewer } from "@/lib/auth";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const viewer = await requireViewer();
  const { denied } = await searchParams;

  return (
    <div className="space-y-4">
      {denied ? (
        <p className="rounded-control bg-danger-soft p-3 text-sm text-danger">
          You don&apos;t have access to that page.
        </p>
      ) : null}
      <section className="rounded-card bg-surface border border-border p-5">
        <h1 className="text-xl font-semibold">Your account</h1>
        <p className="mt-1 break-all text-sm text-muted">{viewer.email}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge>Donor</Badge>
          {viewer.charities.length > 0 ? <Badge tone="brand">Charity admin</Badge> : null}
          {viewer.isPlatformAdmin ? <Badge tone="success">Platform admin</Badge> : null}
        </div>
      </section>

      {viewer.charities.length > 0 || viewer.isPlatformAdmin ? (
        <section className="rounded-card bg-surface border border-border p-5 space-y-3">
          <h2 className="font-semibold">Manage</h2>
          {viewer.charities.map((c) => (
            <Link key={c.id} href="/charity-admin" className="block rounded-control border border-border p-3">
              <BilingualName en={c.name_en} he={c.name_he} />
            </Link>
          ))}
          {viewer.isPlatformAdmin ? (
            <Link href="/admin" className="block rounded-control border border-border p-3">
              Platform admin
            </Link>
          ) : null}
        </section>
      ) : null}

      <form action="/auth/signout" method="post">
        <button className="text-sm text-muted underline">Sign out</button>
      </form>
    </div>
  );
}
