import { RANK_LABELS, RANKS, TEAM_NAME_MAX, TEAM_TAG_MAX, TEAM_TAG_MIN } from "@uni-scrims/core";
import type { Rank } from "@uni-scrims/db";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Name, tag and rank inputs, shared by create and edit (server component, no client code). */
export function TeamFields({ defaults }: { defaults?: { name: string; tag: string; rank: Rank } }) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Teamname</Label>
        <Input
          id="name"
          name="name"
          required
          maxLength={TEAM_NAME_MAX}
          defaultValue={defaults?.name}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tag">
          Kürzel ({TEAM_TAG_MIN}–{TEAM_TAG_MAX} Zeichen)
        </Label>
        <Input
          id="tag"
          name="tag"
          required
          minLength={TEAM_TAG_MIN}
          maxLength={TEAM_TAG_MAX}
          defaultValue={defaults?.tag}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rank">Team-Rang</Label>
        <select
          id="rank"
          name="rank"
          required
          defaultValue={defaults?.rank ?? ""}
          className={selectClass}
        >
          <option value="" disabled>
            Bitte wählen …
          </option>
          {RANKS.map((rank) => (
            <option key={rank} value={rank}>
              {RANK_LABELS[rank]}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
