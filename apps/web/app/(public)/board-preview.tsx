import { berlinToUtc, formatDayHeading, type TeamCardData } from "@uni-scrims/core";
import { ListGroup } from "@/components/list-group";
import { RequestCard } from "@/components/request-card";
import { TabNav } from "@/components/tab-nav";
import { landingMessages } from "@/i18n/public";
import { scrimsPageMessages } from "@/i18n/scrims";
import { getLocale, getMessages } from "@/lib/locale";

// A Wednesday, as in the design; the cards are made up and never read from the database.
const DAY = "2026-10-21";

/** The made-up teams, also in the feature cards of the landing page. */
export const PREVIEW_TEAMS = {
  volt: { id: "preview-volt", name: "VOLT Gaming", tag: "VOLT" },
  mavs: { id: "preview-mavs", name: "Mavericks", tag: "MAVS" },
  krnl: { id: "preview-krnl", name: "Kernel", tag: "KRNL" },
};

function team(
  { id, name, tag }: { id: string; name: string; tag: string },
  rank: TeamCardData["rank"],
  universities: TeamCardData["universities"],
  reliability: Omit<TeamCardData["reliability"], "avgRating">,
  fullyVerified: boolean,
): TeamCardData {
  return {
    id,
    name,
    tag,
    rank,
    logo: null,
    universities,
    reliability: { ...reliability, avgRating: null },
    fullyVerified,
  };
}

/**
 * The Scrims page in miniature below the hero (design handoff, hero B): the tabs, one day of the
 * board and three request cards, faded out at the bottom. Decorative and not clickable.
 */
export async function BoardPreview() {
  const locale = await getLocale();
  const t = await getMessages(landingMessages);
  const scrims = await getMessages(scrimsPageMessages);
  const unis = t.preview;
  const requests = [
    {
      startsAt: berlinToUtc(DAY, "20:00"),
      format: "BO3",
      rankMin: "GOLD",
      rankMax: "DIAMOND",
      maps: ["Ascent", "Bind", "Haven"],
      applicationCount: 2,
      ownApplicationStatus: "PENDING",
      verifiedApplicantsOnly: false,
      team: team(
        PREVIEW_TEAMS.volt,
        "PLATINUM",
        { shown: [unis.south, unis.west], more: 0 },
        { played: 12, noShows: 0, lateCancels: 1 },
        true,
      ),
    },
    {
      startsAt: berlinToUtc(DAY, "21:30"),
      format: "TWO_MAPS",
      rankMin: "PLATINUM",
      rankMax: "ASCENDANT",
      maps: ["Lotus", "Split"],
      applicationCount: 0,
      ownApplicationStatus: null,
      verifiedApplicantsOnly: false,
      team: team(
        PREVIEW_TEAMS.mavs,
        "DIAMOND",
        { shown: [unis.east], more: 0 },
        { played: 5, noShows: 0, lateCancels: 0 },
        true,
      ),
    },
    {
      startsAt: berlinToUtc(DAY, "22:00"),
      format: "ONE_MAP",
      rankMin: "SILVER",
      rankMax: "GOLD",
      maps: [],
      applicationCount: 1,
      ownApplicationStatus: null,
      verifiedApplicantsOnly: false,
      team: team(
        PREVIEW_TEAMS.krnl,
        "GOLD",
        { shown: [unis.central], more: 1 },
        { played: 3, noShows: 1, lateCancels: 0 },
        false,
      ),
    },
  ] as const;
  const tabs = [
    { href: "board", label: scrims.tabs.board, count: 3 },
    { href: "anstehend", label: scrims.tabs.upcoming, count: 1 },
    { href: "anfragen", label: scrims.tabs.requests, count: 0 },
    { href: "bewerbungen", label: scrims.tabs.applications, count: 1 },
  ];

  return (
    <div
      aria-hidden
      className="relative mt-14 rounded-t-lg border border-b-0 border-border bg-background p-5 pb-0 shadow-(--shadow-preview)"
    >
      <TabNav
        preview
        label={scrims.title}
        items={tabs.map((tab) => ({
          href: tab.href,
          label: tab.label,
          active: tab.href === "board",
          trailing: <span className="font-label text-[11px] text-faint">{tab.count}</span>,
        }))}
      />
      <div className="mt-6">
        <ListGroup
          title={formatDayHeading(requests[0].startsAt, locale)}
          count={scrims.requestCount(requests.length)}
          className="grid max-h-[420px] grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))] overflow-hidden"
        >
          {requests.map((request) => (
            <RequestCard
              key={request.team.id}
              preview
              request={{ ...request, maps: [...request.maps] }}
            />
          ))}
        </ListGroup>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[120px] bg-linear-to-b from-transparent to-background" />
    </div>
  );
}
