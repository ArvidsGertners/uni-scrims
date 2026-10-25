"use client";

import { LANGUAGE_NAMES, LOCALES } from "@uni-scrims/core/config/locale";
import { cn } from "cn";
import { useTransition } from "react";
import { setLocaleAction } from "@/app/actions";
import { LocaleFlag } from "@/components/flags";
import { CheckIcon, ChevronDownIcon } from "@/components/icons";
import { useLocale, useMessages } from "@/components/locale-provider";
import {
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRadioItemIndicator,
  MenuRoot,
  MenuTrigger,
} from "@/components/ui/menu";
import { localeSwitcherMessages } from "@/i18n/client";

/**
 * The language menu at the top right (§5.21): flag, code and arrow; the menu names both languages
 * in their own language. A choice re-renders the page in the same response. `compact` shows only the
 * flag below 640 px (admin header).
 */
export function LocaleSwitcher({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const locale = useLocale();
  const t = useMessages(localeSwitcherMessages);
  const [pending, startTransition] = useTransition();
  return (
    <MenuRoot>
      <MenuTrigger
        // Contains the visible code, as the name of the button.
        aria-label={`${t.language}: ${LANGUAGE_NAMES[locale]}`}
        aria-busy={pending || undefined}
        className={cn(
          "group flex shrink-0 cursor-pointer items-center gap-1.5 rounded-sm border border-border bg-card px-2.5 text-foreground hover:border-border-strong",
          compact && "max-sm:px-2",
          className,
        )}
      >
        <LocaleFlag locale={locale} />
        <span
          className={cn("font-label text-[13px] font-medium", compact && "max-sm:hidden")}
          aria-hidden
        >
          {locale.toUpperCase()}
        </span>
        <ChevronDownIcon
          size={16}
          className={cn(
            "text-muted-foreground transition-transform group-data-popup-open:rotate-180",
            compact && "max-sm:hidden",
          )}
        />
      </MenuTrigger>
      <MenuPopup align="end" className="min-w-40">
        <MenuRadioGroup
          value={locale}
          onValueChange={(value: string) => {
            if (value !== locale) startTransition(() => setLocaleAction(value));
          }}
        >
          {LOCALES.map((option) => (
            <MenuRadioItem key={option} value={option} label={LANGUAGE_NAMES[option]} lang={option}>
              <LocaleFlag locale={option} />
              <span className="flex-1">{LANGUAGE_NAMES[option]}</span>
              <MenuRadioItemIndicator className="text-accent-text">
                <CheckIcon size={16} strokeWidth={2.5} />
              </MenuRadioItemIndicator>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuPopup>
    </MenuRoot>
  );
}
