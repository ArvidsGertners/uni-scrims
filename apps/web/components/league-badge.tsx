import type { League } from "@uni-scrims/core";
import { OplLogo } from "@/components/opl-logo";
import { EXTERNAL_LINK_PROPS } from "@/components/team-links";
import { Badge } from "@/components/ui/badge";
import { getMessages } from "@/lib/locale";
import { leagueMessages } from "@/i18n/format";

/**
 * The Uniliga league of a linked team (SPEC N-36), with the OPL mark, in the small form of the
 * "Vollständig verifiziert" badge; teams without one get nothing. With `link` the badge leads to
 * the team on OPL (teams list, where the OPL link is shown anyway, SPEC N-35).
 */
export async function LeagueBadge({
  league,
  link,
}: {
  league: League | null;
  link?: { href: string; label: string };
}) {
  if (!league) return null;
  const t = await getMessages(leagueMessages);
  const label = t.league(league.division, league.group);
  const content = (
    <>
      <OplLogo alt="" className="h-3" />
      <span>
        <span className="sr-only">{`${t.prefix} `}</span>
        {label}
      </span>
    </>
  );
  const className = "h-[22px] px-2 text-[12px]";
  if (link) {
    return (
      <Badge
        render={<a href={link.href} {...EXTERNAL_LINK_PROPS} />}
        variant="neutral"
        className={`${className} hover:text-foreground`}
        title={`${t.badgeTitle(label)} · ${link.label}`}
        aria-label={`${t.prefix} ${label} · ${link.label}`}
      >
        {content}
      </Badge>
    );
  }
  return (
    <Badge variant="neutral" className={className} title={t.badgeTitle(label)}>
      {content}
    </Badge>
  );
}
