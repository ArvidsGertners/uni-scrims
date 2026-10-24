import type { ReactNode } from "react";
import { cn } from "cn";
import { FlashToast } from "@/components/flash-toast";
import { sharedCookieDomain } from "@/lib/admin-url";
import { readFlash } from "@/lib/flash";

// Narrow: the 768 px column of the design handoff, centred (forms, signed-out pages). Wide: the
// whole content column next to the sidebar (§5.15).
const WIDTH = {
  narrow: "mx-auto max-w-3xl px-5 sm:px-8",
  wide: "px-5 sm:px-8 xl:px-10",
};

/** Content column of every screen: 20/32 px side padding, toast above. */
export async function PageMain({
  width = "narrow",
  className,
  children,
}: {
  width?: keyof typeof WIDTH;
  className?: string;
  children: ReactNode;
}) {
  const flash = await readFlash();
  return (
    <>
      {flash ? (
        <FlashToast
          key={flash.id}
          message={flash.message}
          domain={sharedCookieDomain()}
          className={width === "wide" ? "max-w-none xl:px-10" : undefined}
        />
      ) : null}
      <main className={cn("flex w-full flex-col pt-7 pb-16", WIDTH[width], className)}>
        {children}
      </main>
    </>
  );
}
