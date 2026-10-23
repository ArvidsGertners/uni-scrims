import { isDevLoginEnabled } from "@uni-scrims/core/config/dev";
import Link from "next/link";

/** The dev login below the login (ARCHITECTURE §7); the hub server note is on the Discord step. */
export function LoginNote() {
  return isDevLoginEnabled() ? (
    <Link href="/dev-login" className="text-[13px] underline underline-offset-2">
      Dev-Login als Seed-Nutzer
    </Link>
  ) : null;
}
