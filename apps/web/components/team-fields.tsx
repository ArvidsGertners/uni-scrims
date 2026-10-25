import { TEAM_NAME_MAX, TEAM_TAG_MAX, TEAM_TAG_MIN } from "@uni-scrims/core";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { teamFieldsMessages } from "@/i18n/team";
import { getMessages } from "@/lib/locale";

/**
 * Name and tag inputs, shared by create and edit (server component). No rank since Phase 20: it is
 * computed from the players' own ranks (SPEC N-16).
 */
export async function TeamFields({ defaults }: { defaults?: { name: string; tag: string } }) {
  const t = await getMessages(teamFieldsMessages);
  return (
    <>
      <Field label={t.name}>
        <Input
          name="name"
          required
          maxLength={TEAM_NAME_MAX}
          placeholder={t.namePlaceholder}
          defaultValue={defaults?.name}
        />
      </Field>
      <Field label={t.tag} hint={t.tagHint(TEAM_TAG_MIN, TEAM_TAG_MAX)}>
        <Input
          name="tag"
          required
          minLength={TEAM_TAG_MIN}
          maxLength={TEAM_TAG_MAX}
          placeholder={t.tagPlaceholder}
          defaultValue={defaults?.tag}
          className="font-label uppercase"
        />
      </Field>
    </>
  );
}
