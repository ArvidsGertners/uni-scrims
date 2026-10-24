"use client";

import { useState } from "react";
import { cn } from "cn";
import { initials } from "@/lib/format";

/**
 * The copy of a user's Discord avatar (SPEC N-8), served by the site itself; without one, or if it
 * cannot be loaded (removed since the page was rendered), the initials of the design handoff.
 * Size, text and colours come from the caller.
 */
export function UserAvatar({
  user,
  className,
}: {
  user: { id: string; name: string; avatarVersion: number | null };
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const circle = cn(
    "flex shrink-0 items-center justify-center rounded-full bg-secondary font-label font-bold",
    className,
  );
  if (user.avatarVersion === null || failed) {
    return <span className={circle}>{initials(user.name)}</span>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- small session-protected image, no optimisation
    <img
      // A new copy gets a new version and so a new URL.
      src={`/api/users/${encodeURIComponent(user.id)}/avatar?v=${user.avatarVersion}`}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      // An error before hydration fires no React event: a finished image without size failed.
      ref={(image) => {
        if (image?.complete && image.naturalWidth === 0) setFailed(true);
      }}
      className={cn(circle, "object-cover")}
    />
  );
}
