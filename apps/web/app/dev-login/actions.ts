"use server";

import { isDevLoginEnabled } from "@uni-scrims/core/config/dev";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export async function devSignIn(formData: FormData): Promise<void> {
  if (!isDevLoginEnabled()) notFound();
  const userId = String(formData.get("userId") ?? "");
  await auth.api.devSignIn({ body: { userId }, headers: await headers() });
  redirect("/team");
}
