import type { ReactNode } from "react";
import { requireStaffMemberPage } from "@/lib/session";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Each page checks its area itself (§5.9); the 2FA setup needs only a role.
  await requireStaffMemberPage("/");
  return children;
}
