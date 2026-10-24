"use client";

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { cn } from "cn";
import type { ComponentProps, ReactNode } from "react";

// Same surface as the select and date picker popups.
const POPUP_CLASS =
  "min-w-(--anchor-width) origin-(--transform-origin) rounded-sm border border-border-strong bg-popover p-1 text-popover-foreground shadow-(--shadow-popup) outline-none transition-[opacity,scale] duration-100 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0";
const ITEM_CLASS =
  "flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-[6px] px-3 py-2 text-left text-[15px] leading-snug text-foreground outline-none select-none data-highlighted:bg-secondary";

const MenuRoot = MenuPrimitive.Root;
const MenuTrigger = MenuPrimitive.Trigger;

/** The opened menu in a portal, next to its trigger (the account menu opens upwards, §5.16). */
function MenuPopup({
  side = "bottom",
  align = "start",
  className,
  children,
}: {
  side?: "top" | "bottom";
  align?: "start" | "end";
  className?: string;
  children: ReactNode;
}) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        side={side}
        align={align}
        sideOffset={6}
        collisionPadding={16}
        className="z-50 outline-none"
      >
        <MenuPrimitive.Popup className={cn(POPUP_CLASS, className)}>{children}</MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

/** A link; `render` takes Next's Link for pages of the site. Closes the menu when clicked. */
function MenuLinkItem({ className, ...props }: ComponentProps<typeof MenuPrimitive.LinkItem>) {
  return <MenuPrimitive.LinkItem closeOnClick className={cn(ITEM_CLASS, className)} {...props} />;
}

function MenuItem({ className, ...props }: ComponentProps<typeof MenuPrimitive.Item>) {
  return <MenuPrimitive.Item className={cn(ITEM_CLASS, className)} {...props} />;
}

function MenuSeparator() {
  return <MenuPrimitive.Separator className="my-1 h-px bg-border" />;
}

export { MenuItem, MenuLinkItem, MenuPopup, MenuRoot, MenuSeparator, MenuTrigger };
