"use client";

import { useRouter } from "next/navigation";
import { useMessages } from "@/components/locale-provider";
import { logoutMessages } from "@/i18n/client";
import { authClient } from "@/lib/auth-client";

/**
 * Signs out and leaves the page; `redirectTo` leaves the host afterwards, e.g. from the admin area to
 * the main host (§5.13). For the button and the item of the account menu (§5.16).
 */
export function useLogout(redirectTo?: string) {
  const router = useRouter();
  const t = useMessages(logoutMessages);
  return async () => {
    const { error } = await authClient.signOut();
    if (error) {
      window.alert(t.failed);
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
  const t = useMessages(logoutMessages);
  return (
    <button type="button" className={className} onClick={logout}>
      {t.signOut}
    </button>
  );
}
