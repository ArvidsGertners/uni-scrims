"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "cn";

// Dialog over the page for the route dialogs (§5.33), in the look of ui/alert-dialog.tsx.

const Dialog = DialogPrimitive.Root;
const DialogClose = DialogPrimitive.Close;

const SIZES = {
  narrow: "sm:max-w-3xl",
  wide: "sm:max-w-6xl",
};

/** Full screen below 640 px, from there centred with a margin; scrolls inside. */
function DialogContent({
  size = "narrow",
  className,
  ...props
}: DialogPrimitive.Popup.Props & { size?: keyof typeof SIZES }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-(--backdrop) transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0" />
      <DialogPrimitive.Popup
        className={cn(
          "fixed inset-0 z-50 flex flex-col overflow-y-auto overscroll-contain bg-card transition-[opacity,scale] duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0",
          "sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-h-[calc(100dvh-48px)] sm:w-[calc(100%-48px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:border sm:border-border sm:shadow-(--shadow-overlay) sm:data-ending-style:scale-[0.98] sm:data-starting-style:scale-[0.98]",
          SIZES[size],
          className,
        )}
        {...props}
      />
    </DialogPrimitive.Portal>
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      className={cn("type-h1 break-words hyphens-auto max-sm:text-[26px]", className)}
      {...props}
    />
  );
}

export { Dialog, DialogClose, DialogContent, DialogTitle };
