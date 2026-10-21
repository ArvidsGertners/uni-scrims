import { isAdmin } from "@uni-scrims/core";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { requirePageUser } from "@/lib/session";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requirePageUser("/admin");
  if (!(await isAdmin(user.id))) notFound();
  return children;
}
