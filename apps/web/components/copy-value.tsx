"use client";

import { useEffect, useRef, useState } from "react";
import { CopyIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";

/**
 * A value with "Kopieren", which reads "Kopiert" for 2 s (design handoff): the invite link, the
 * profile ID (§5.16). Without clipboard access the value is selected to copy by hand.
 */
export function CopyValue({ value, display = value }: { value: string; display?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const text = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (state !== "copied") return;
    const timer = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(timer);
  }, [state]);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <div className="flex min-h-12 min-w-0 flex-1 items-center rounded-sm border border-border bg-input px-3.5 font-label text-[14px] select-all">
          <span ref={text} className="truncate">
            {display}
          </span>
        </div>
        <Button
          className="min-h-12 px-4 text-[14px]"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setState("copied");
            } catch {
              if (text.current) window.getSelection()?.selectAllChildren(text.current);
              setState("failed");
            }
          }}
        >
          <CopyIcon strokeWidth={2.2} />
          {state === "copied" ? "Kopiert" : "Kopieren"}
        </Button>
      </div>
      {state === "failed" ? (
        <p role="status" className="text-[13px] text-muted-foreground">
          Kopieren ging nicht. Der Text ist markiert, kopier ihn bitte selbst.
        </p>
      ) : null}
    </div>
  );
}
