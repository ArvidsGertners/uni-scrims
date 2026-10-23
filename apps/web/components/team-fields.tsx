import { RANK_LABELS, RANKS, TEAM_NAME_MAX, TEAM_TAG_MAX, TEAM_TAG_MIN } from "@uni-scrims/core";
import type { Rank } from "@uni-scrims/db";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

/** Name, tag and rank inputs, shared by create and edit (server component, no client code). */
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
        <NativeSelect name="rank" required defaultValue={defaults?.rank ?? ""}>
          <option value="" disabled>
            Bitte wählen …
          </option>
          {RANKS.map((rank) => (
            <option key={rank} value={rank}>
              {RANK_LABELS[rank]}
            </option>
          ))}
        </NativeSelect>
      </Field>
    </>
  );
}
