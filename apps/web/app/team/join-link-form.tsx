"use client";

import { useRouter } from "next/navigation";
import { useMessages } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { joinLinkFormMessages } from "@/i18n/team-client";

/** The code from a pasted invite link (…/join/<code>) or the bare code. */
function inviteCode(text: string): string | null {
  const trimmed = text.trim();
  const fromLink = /\/join\/([^/?#\s]+)/.exec(trimmed)?.[1];
  if (fromLink) return fromLink;
  return /^[\w-]+$/.test(trimmed) ? trimmed : null;
}

/** Paste an invite link and open its join page, where joining is confirmed. */
export function JoinLinkForm({ placeholder }: { placeholder: string }) {
  const router = useRouter();
  const t = useMessages(joinLinkFormMessages);
  return (
    <form
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const code = inviteCode(String(new FormData(event.currentTarget).get("link") ?? ""));
        if (code) router.push(`/join/${encodeURIComponent(code)}`);
      }}
    >
      <Input
        name="link"
        required
        aria-label={t.inviteLink}
        placeholder={placeholder}
        className="flex-1"
      />
      <Button type="submit" variant="outline" className="px-[18px] text-[14px]">
        {t.join}
      </Button>
    </form>
  );
}
