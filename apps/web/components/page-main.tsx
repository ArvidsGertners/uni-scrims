import type { ReactNode } from "react";
import { cn } from "cn";
import { FlashToast } from "@/components/flash-toast";
import { sharedCookieDomain } from "@/lib/admin-url";
import { readFlash } from "@/lib/flash";

/** Content column of every screen (design handoff): 768 px, 20/32 px side padding, toast above. */
export async function PageMain({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const flash = await readFlash();
  return (
    <>
      {flash ? (
        <FlashToast key={flash.id} message={flash.message} domain={sharedCookieDomain()} />
      ) : null}
      <main
        className={cn("mx-auto flex w-full max-w-3xl flex-col px-5 pt-7 pb-16 sm:px-8", className)}
      >
        {children}
      </main>
    </>
  );
}
