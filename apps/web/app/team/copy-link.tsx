"use client";

import { useEffect, useState } from "react";
import { CopyIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";

/** The invite link with "Kopieren", which reads "Kopiert" for 2 s (design handoff). */
export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div className="flex gap-2">
      <div className="flex min-h-12 min-w-0 flex-1 items-center rounded-sm border border-border bg-input px-3.5 font-label text-[14px] select-all">
        <span className="truncate">{url.replace(/^https?:\/\//, "")}</span>
      </div>
      <Button
        className="min-h-12 px-4 text-[14px]"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
        }}
      >
        <CopyIcon strokeWidth={2.2} />
        {copied ? "Kopiert" : "Kopieren"}
      </Button>
    </div>
  );
}
