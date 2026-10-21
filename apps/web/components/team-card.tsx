import { RANK_LABELS } from "@uni-scrims/core";
import type { Rank } from "@uni-scrims/db";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUniversities } from "@/lib/scrim-format";

type Props = {
  name: string;
  tag: string;
  rank: Rank;
  universities: { shown: string[]; more: number };
  /** Omitted where readiness is not shown (invite preview). */
  ready?: boolean;
  memberCount: number;
};

export function TeamCard({ name, tag, rank, universities, ready, memberCount }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {name} <span className="opacity-60">[{tag}]</span>
          {ready === undefined ? null : ready ? (
            <Badge>Spielbereit</Badge>
          ) : (
            <Badge variant="outline">Noch nicht spielbereit</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 text-sm">
        <p>Rang: {RANK_LABELS[rank]}</p>
        <p>Hochschulen: {formatUniversities(universities)}</p>
        <p>Mitglieder: {memberCount}</p>
      </CardContent>
    </Card>
  );
}
