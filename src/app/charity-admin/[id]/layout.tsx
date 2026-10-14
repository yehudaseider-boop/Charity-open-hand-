import { CharityNav } from "@/components/charity-nav";

export default async function CharityLayout({ children, params }: LayoutProps<"/charity-admin/[id]">) {
  const { id } = await params;
  return (
    <div>
      <CharityNav id={id} />
      {children}
    </div>
  );
}
