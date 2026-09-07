import { Sidebar } from "@/components/nav/Sidebar";
import { requireAuth } from "@/lib/auth";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const usuario = await requireAuth();

  return (
    <div className="flex min-h-svh flex-col lg:flex-row">
      <Sidebar usuario={{ email: usuario.email ?? "" }} />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
