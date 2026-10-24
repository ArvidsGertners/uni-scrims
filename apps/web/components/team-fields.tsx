import { RANK_LABELS, RANKS, TEAM_NAME_MAX, TEAM_TAG_MAX, TEAM_TAG_MIN } from "@uni-scrims/core";
import type { Rank } from "@uni-scrims/db";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

/** Name, tag and rank inputs, shared by create and edit (server component). */
export function TeamFields({ defaults }: { defaults?: { name: string; tag: string; rank: Rank } }) {
  return (
    <>
      <Field label="Teamname">
        <Input
          name="name"
          required
          maxLength={TEAM_NAME_MAX}
          placeholder="z. B. Mannheim Mavericks"
          defaultValue={defaults?.name}
        />
      </Field>
      <Field label="Kürzel" hint={`${TEAM_TAG_MIN}–${TEAM_TAG_MAX} Zeichen`}>
        <Input
          name="tag"
          required
          minLength={TEAM_TAG_MIN}
          maxLength={TEAM_TAG_MAX}
          placeholder="MAV"
          defaultValue={defaults?.tag}
          className="font-label uppercase"
        />
      </Field>
      <Field label="Team-Rang">
        <Select
          name="rank"
          required
          defaultValue={defaults?.rank ?? null}
          placeholder="Bitte wählen …"
          options={RANKS.map((rank) => ({ value: rank, label: RANK_LABELS[rank] }))}
        />
      </Field>
    </>
  );
}
