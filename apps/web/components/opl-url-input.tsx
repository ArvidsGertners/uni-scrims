import type * as React from "react";
import { OplLogo } from "@/components/opl-logo";
import { Input } from "@/components/ui/input";

/** A field for a link to OPL, marked with OPL's icon in front (SPEC N-35). */
export function OplUrlInput(props: Omit<React.ComponentProps<typeof Input>, "type">) {
  return (
    <div className="relative">
      <OplLogo
        alt=""
        className="pointer-events-none absolute top-1/2 left-3.5 h-4 -translate-y-1/2"
      />
      <Input
        type="text"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        maxLength={300}
        placeholder="https://www.opleague.pro/…"
        {...props}
        className="pl-10"
      />
    </div>
  );
}
