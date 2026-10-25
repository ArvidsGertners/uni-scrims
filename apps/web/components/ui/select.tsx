"use client";

import { Select as SelectPrimitive } from "@base-ui/react/select";
import { cn } from "cn";
import { Fragment, type ReactNode } from "react";
import { CheckIcon, ChevronDownIcon } from "@/components/icons";
import { controlClass } from "@/components/ui/input";

export type SelectOption = {
  value: string;
  label: string;
  /** Muted text on the right of the option, e.g. "euer Rang"; not shown in the trigger. */
  hint?: string;
  /** Before the label, in the list and in the trigger, e.g. a rank icon. */
  icon?: ReactNode;
};

type SelectProps<Multiple extends boolean | undefined> = Omit<
  SelectPrimitive.Root.Props<string, Multiple>,
  "items" | "children"
> & {
  options: readonly SelectOption[];
  /** Shown while nothing is selected. */
  placeholder?: string;
  /** Classes of the trigger. */
  className?: string;
  "aria-label"?: string;
};

/**
 * Select in the look of the inputs instead of the OS menu, with a hidden input per value for
 * forms. Several values with `multiple`; the trigger then lists their labels in option order.
 */
function Select<Multiple extends boolean | undefined = false>({
  options,
  placeholder,
  className,
  "aria-label": ariaLabel,
  ...props
}: SelectProps<Multiple>) {
  // Relative, so the browser's "required" hint points at the trigger and not at the page edge.
  return (
    <div className="relative min-w-0">
      <SelectPrimitive.Root<string, Multiple> {...props}>
        <SelectPrimitive.Trigger
          aria-label={ariaLabel}
          className={cn(
            controlClass,
            "flex min-h-12 cursor-pointer items-center justify-between gap-2 px-3 text-left data-popup-open:border-ring data-popup-open:shadow-[0_0_0_3px_var(--accent-soft)]",
            className,
          )}
        >
          <SelectPrimitive.Value className="min-w-0 flex-1 truncate data-placeholder:text-muted-foreground">
            {(value: string | string[] | null) => {
              const values = Array.isArray(value) ? value : value === null ? [] : [value];
              const chosen = options.filter((option) => values.includes(option.value));
              return chosen.length > 0
                ? chosen.map((option, index) => (
                    <Fragment key={option.value}>
                      {index > 0 ? ", " : null}
                      {option.icon ? <span className="mr-[0.4em]">{option.icon}</span> : null}
                      {option.label}
                    </Fragment>
                  ))
                : placeholder;
            }}
          </SelectPrimitive.Value>
          <SelectPrimitive.Icon className="text-muted-foreground transition-transform data-popup-open:rotate-180">
            <ChevronDownIcon size={18} />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Positioner
            alignItemWithTrigger={false}
            sideOffset={6}
            className="z-50 outline-none"
          >
            <SelectPrimitive.Popup className="max-h-[min(var(--available-height),26rem)] max-w-[min(var(--available-width),max(var(--anchor-width),16rem))] min-w-(--anchor-width) origin-(--transform-origin) overflow-y-auto overscroll-contain rounded-sm border border-border-strong bg-popover p-1 text-popover-foreground shadow-(--shadow-popup) outline-none transition-[opacity,scale] duration-100 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
              {options.map((option) => (
                <SelectPrimitive.Item
                  key={option.value}
                  value={option.value}
                  className="flex min-h-11 scroll-my-1 cursor-pointer items-center gap-3 rounded-[6px] px-3 py-2 text-[16px] leading-snug outline-none select-none data-highlighted:bg-secondary data-selected:font-medium"
                >
                  {/* The text stays plain, so typing a name still finds the option. */}
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    {option.icon}
                    <SelectPrimitive.ItemText className="min-w-0 flex-1">
                      {option.label}
                    </SelectPrimitive.ItemText>
                  </span>
                  {option.hint ? (
                    <span className="text-[13px] font-normal text-faint">{option.hint}</span>
                  ) : null}
                  <span className="flex w-4 justify-end">
                    <SelectPrimitive.ItemIndicator className="text-accent-text">
                      <CheckIcon size={16} strokeWidth={2.5} />
                    </SelectPrimitive.ItemIndicator>
                  </span>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Popup>
          </SelectPrimitive.Positioner>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </div>
  );
}

export { Select };
