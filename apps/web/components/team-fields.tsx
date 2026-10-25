import { TEAM_NAME_MAX, TEAM_TAG_MAX, TEAM_TAG_MIN } from "@uni-scrims/core";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/**
 * Name and tag inputs, shared by create and edit (server component). No rank since Phase 20: it is
 * computed from the players' own ranks (SPEC N-16).
 */
export function TeamFields({ defaults }: { defaults?: { name: string; tag: string } }) {
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
    </>
  );
}
