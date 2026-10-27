"use client";

import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { cn } from "cn";
import { useMemo, useState } from "react";
import { CheckIcon, ChevronDownIcon } from "@/components/icons";
import { controlClass } from "@/components/ui/input";

export type ComboboxOption = { value: string; label: string };

const optionLabel = (option: ComboboxOption) => option.label;

/**
 * Select with a search field in the look of ui/select (§5.32): typing filters the options by their
 * label, ignoring case and accents. `pinned` comes last and stays visible for every query, e.g.
 * "Andere Hochschule …". The form gets the chosen option's value under `name`.
 */
function Combobox({
  options,
  pinned,
  name,
  id,
  required,
  value,
  defaultValue,
  onValueChange,
  placeholder,
  emptyText,
  "aria-label": ariaLabel,
}: {
  options: readonly ComboboxOption[];
  pinned?: ComboboxOption;
  name: string;
  /** Of the text field, for an outside label. */
  id?: string;
  required?: boolean;
  value?: string | null;
  defaultValue?: string | null;
  onValueChange?: (value: string | null) => void;
  placeholder?: string;
  /** Shown above `pinned` (or alone) while no other option matches. */
  emptyText: string;
  "aria-label"?: string;
}) {
  const items = useMemo(() => (pinned ? [...options, pinned] : [...options]), [options, pinned]);
  const find = (wanted: string | null | undefined) =>
    items.find((item) => item.value === wanted) ?? null;
  const [uncontrolled, setUncontrolled] = useState(() => find(defaultValue));
  const selected = value === undefined ? uncontrolled : find(value);
  const [query, setQuery] = useState("");
  // Keeps every option visible while the field shows the chosen label.
  const filter = ComboboxPrimitive.useFilter({ sensitivity: "base", value: selected });
  const matches = (option: ComboboxOption, text: string) =>
    filter.contains(option, text, optionLabel);
  const noMatch = query !== "" && !options.some((option) => matches(option, query));

  return (
    <div className="relative min-w-0">
      <ComboboxPrimitive.Root<ComboboxOption>
        items={items}
        name={name}
        required={required}
        value={selected}
        onValueChange={(next) => {
          if (value === undefined) setUncontrolled(next);
          onValueChange?.(next?.value ?? null);
        }}
        onInputValueChange={setQuery}
        itemToStringLabel={optionLabel}
        itemToStringValue={(option) => option.value}
        isItemEqualToValue={(a, b) => a.value === b.value}
        filter={(option, text) => option === pinned || matches(option, text)}
      >
        <ComboboxPrimitive.InputGroup
          className={cn(
            controlClass,
            "flex min-h-12 items-center gap-2 pr-3 focus-within:border-ring focus-within:shadow-[0_0_0_3px_var(--accent-soft)]",
          )}
        >
          <ComboboxPrimitive.Input
            id={id}
            aria-label={ariaLabel}
            placeholder={placeholder}
            className="h-12 min-w-0 flex-1 bg-transparent pl-3.5 outline-none placeholder:text-placeholder"
          />
          <ComboboxPrimitive.Trigger
            tabIndex={-1}
            className="flex size-8 shrink-0 cursor-pointer items-center justify-center text-muted-foreground transition-transform data-popup-open:rotate-180"
          >
            <ChevronDownIcon size={18} />
          </ComboboxPrimitive.Trigger>
        </ComboboxPrimitive.InputGroup>
        <ComboboxPrimitive.Portal>
          <ComboboxPrimitive.Positioner sideOffset={6} className="z-50 outline-none">
            <ComboboxPrimitive.Popup className="max-h-[min(var(--available-height),26rem)] w-(--anchor-width) max-w-(--available-width) origin-(--transform-origin) overflow-y-auto overscroll-contain rounded-sm border border-border-strong bg-popover p-1 text-popover-foreground shadow-(--shadow-popup) outline-none transition-[opacity,scale] duration-100 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
              {/* Not Combobox.Empty: with `pinned` the list is never empty. */}
              {noMatch ? (
                <p className="px-3 py-2.5 text-[14px] text-muted-foreground">{emptyText}</p>
              ) : null}
              <ComboboxPrimitive.List className="outline-none">
                {(option: ComboboxOption) => (
                  <ComboboxPrimitive.Item
                    key={option.value}
                    value={option}
                    className="flex min-h-11 scroll-my-1 cursor-pointer items-center gap-3 rounded-[6px] px-3 py-2 text-[16px] leading-snug outline-none select-none data-highlighted:bg-secondary data-selected:font-medium"
                  >
                    <span className="min-w-0 flex-1">{option.label}</span>
                    <span className="flex w-4 justify-end">
                      <ComboboxPrimitive.ItemIndicator className="text-accent-text">
                        <CheckIcon size={16} strokeWidth={2.5} />
                      </ComboboxPrimitive.ItemIndicator>
                    </span>
                  </ComboboxPrimitive.Item>
                )}
              </ComboboxPrimitive.List>
            </ComboboxPrimitive.Popup>
          </ComboboxPrimitive.Positioner>
        </ComboboxPrimitive.Portal>
      </ComboboxPrimitive.Root>
    </div>
  );
}

export { Combobox };
