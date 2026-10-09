import { AdminNav } from "@/components/admin-nav";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div>
      <AdminNav />
      {children}
    </div>
  );
}
