import type { ReactNode } from "react";
import { cn } from "cn";

/** Content column of every screen (design handoff): 768 px, 20/32 px side padding. */
export function PageMain({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <main
      className={cn("mx-auto flex w-full max-w-3xl flex-col px-5 pt-7 pb-16 sm:px-8", className)}
    >
      {children}
    </main>
  );
}
