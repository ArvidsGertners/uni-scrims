"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

/**
 * Signs out and leaves the page; `redirectTo` leaves the host afterwards, e.g. from the admin area to
 * the main host (§5.13). For the button and the item of the account menu (§5.16).
 */
export function useLogout(redirectTo?: string) {
  const router = useRouter();
  return async () => {
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
  };
}

export function LogoutButton({
  className,
  redirectTo,
}: {
  className?: string;
  redirectTo?: string;
}) {
  const logout = useLogout(redirectTo);
  return (
    <button type="button" className={className} onClick={logout}>
      Abmelden
    </button>
  );
}
