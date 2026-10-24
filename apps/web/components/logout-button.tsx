"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

/** `redirectTo` leaves the host afterwards, e.g. from the admin area to the main host (§5.13). */
export function LogoutButton({
  className,
  redirectTo,
}: {
  className?: string;
  redirectTo?: string;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        const { error } = await authClient.signOut();
        if (error) {
          window.alert("Abmelden hat nicht geklappt. Bitte versuch es erneut.");
          return;
        }
        if (redirectTo) {
          window.location.assign(redirectTo);
          return;
        }
        router.push("/");
        router.refresh();
      }}
    >
      Abmelden
    </button>
  );
}
