import type { ReactNode } from "react";
import { requireAdminPage } from "@/lib/session";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdminPage("/admin");
  return children;
}
