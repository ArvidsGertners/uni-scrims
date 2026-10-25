import { isDevLoginEnabled } from "@uni-scrims/core/config/dev";
import Link from "next/link";
import { devLoginMessages } from "@/i18n/public";
import { getMessages } from "@/lib/locale";

/** The dev login below the login (ARCHITECTURE §7); the hub server note is on the Discord step. */
export async function LoginNote() {
  if (!isDevLoginEnabled()) return null;
  const t = await getMessages(devLoginMessages);
  return (
    <Link href="/dev-login" className="text-[13px] underline underline-offset-2">
      {t.note}
    </Link>
  );
}
