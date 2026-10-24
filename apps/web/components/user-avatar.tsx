import { cn } from "cn";
import { initials } from "@/lib/format";

/**
 * The copy of a user's Discord avatar (SPEC N-8), served by the site itself; without one the
 * initials of the design handoff. Size, text and colours come from the caller.
 */
export function UserAvatar({
  user,
  className,
}: {
  user: { id: string; name: string; avatarVersion: number | null };
  className?: string;
}) {
  const circle = cn(
    "flex shrink-0 items-center justify-center rounded-full bg-secondary font-label font-bold",
    className,
  );
  if (user.avatarVersion === null) return <span className={circle}>{initials(user.name)}</span>;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- small session-protected image, no optimisation
    <img
      // A new copy gets a new version and so a new URL.
      src={`/api/users/${encodeURIComponent(user.id)}/avatar?v=${user.avatarVersion}`}
      alt=""
      loading="lazy"
      decoding="async"
      className={cn(circle, "object-cover")}
    />
  );
}
