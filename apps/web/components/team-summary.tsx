import { RANK_LABELS, type TeamCardData } from "@uni-scrims/core";
import { formatReliability, formatUniversities } from "@/lib/scrim-format";

/** Team, rank, universities and reliability as shown on the board and for applications. */
export function TeamSummary({ team }: { team: TeamCardData }) {
  return (
    <div className="flex flex-col gap-0.5 text-sm">
      <p className="font-medium">
        {team.name} <span className="opacity-60">[{team.tag}]</span>
      </p>
      <p>
        Rang: {RANK_LABELS[team.rank]} · Hochschulen: {formatUniversities(team.universities)}
      </p>
      <p className="opacity-70">Zuverlässigkeit: {formatReliability(team.reliability)}</p>
    </div>
  );
}
