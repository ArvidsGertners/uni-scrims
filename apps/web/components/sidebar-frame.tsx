import { cn } from "cn";
import type { ComponentProps, ReactNode } from "react";

/**
 * The sticky sidebar from 1024 px (§5.14, §5.15): a column at the left edge of the screen, the top
 * part below the sticky header, the bottom part at the bottom of the screen. Both stick on their
 * own, so whatever sits above the frame (the Discord banner) never pushes the bottom part out of
 * view.
 */
export function SidebarFrame({
  top,
  bottom,
  className,
  ...props
}: { top: ReactNode; bottom: ReactNode } & Omit<ComponentProps<"aside">, "children">) {
  return (
    <aside
      className={cn(
        "hidden w-64 shrink-0 flex-col border-r border-border px-5 py-7 lg:flex",
        className,
      )}
      {...props}
    >
      <div className="sticky top-[5.75rem] flex flex-col gap-6">{top}</div>
      <div className="sticky bottom-7 mt-auto flex flex-col gap-3 border-t border-border bg-background pt-4">
        {bottom}
      </div>
    </aside>
  );
}
