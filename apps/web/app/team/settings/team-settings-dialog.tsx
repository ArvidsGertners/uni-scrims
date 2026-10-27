import {
  FULLY_VERIFIED_PLAYER_COUNT,
  LOGO_BACKGROUNDS,
  LOGO_BACKGROUND_LABELS,
  TEAM_LINK_MAX,
  TEAM_LINK_PLATFORMS,
  TEAM_LINK_TEXTS,
  getTeamDashboard,
} from "@uni-scrims/core";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { DialogShell } from "@/components/dialog-shell";
import { TeamLogoPreview } from "@/components/team-avatar";
import { TeamFields } from "@/components/team-fields";
import { TeamLinkIcon } from "@/components/team-links";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { teamPageMessages } from "@/i18n/team";
import { getLocale, getMessages } from "@/lib/locale";
import { requirePageUser } from "@/lib/session";
import {
  removeTeamLogoAction,
  setTeamListedAction,
  setVerifiedApplicantsOnlyAction,
  updateTeamAction,
  updateTeamLinksAction,
} from "../actions";
import { TeamLogoForm } from "../team-logo-form";

const cardClass = "flex flex-col rounded-lg border border-border bg-card p-5";

/**
 * Team-Einstellungen (SPEC N-31): name and tag, teams list, applicants, logos and external links of
 * the active team, as a dialog over /team. Only the captain of a team that is not banned edits.
 */
export async function TeamSettingsDialog({ intercepted }: { intercepted: boolean }) {
  const user = await requirePageUser("/team/settings");
  const team = await getTeamDashboard({ userId: user.id, now: new Date() });
  if (!team) redirect("/team");
  const platforms = await getMessages(TEAM_LINK_TEXTS);
  const locale = await getLocale();
  const t = await getMessages(teamPageMessages);
  const manage = team.isCaptain && !team.banned;

  return (
    <DialogShell title={t.settings} size="wide" fallback="/team" intercepted={intercepted}>
      {!manage ? (
        <Alert>
          <span>{team.banned ? t.settingsBanned : t.settingsCaptainOnly}</span>
        </Alert>
      ) : (
        // The team and its logos left, the links right from 768 px; on phones in this order.
        <div className="flex flex-col gap-6 md:grid md:grid-cols-[minmax(0,1fr)_300px] md:items-start lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-6">
            <section className={`${cardClass} gap-[18px]`}>
              <h2 className="type-h2 break-words">{t.teamHeading(team.name)}</h2>
              <ActionForm
                action={updateTeamAction}
                submitLabel={t.save}
                className="flex flex-col gap-[18px]"
              >
                <input type="hidden" name="teamId" value={team.id} />
                <TeamFields defaults={{ name: team.name, tag: team.tag }} />
              </ActionForm>
              <div className="flex flex-col gap-2 border-t border-border pt-4">
                <span className="text-[14px] font-medium">
                  {t.teamsList}:{" "}
                  <span className="font-normal text-muted-foreground">
                    {team.listed ? t.listed : t.unlisted}
                  </span>
                </span>
                <p className="text-[13px] text-pretty text-muted-foreground">{t.teamsListHint}</p>
                {/* Nothing to edit, only a server-set value: never unsaved (§5.33). */}
                <ActionForm
                  action={setTeamListedAction}
                  guard={false}
                  submitLabel={team.listed ? t.hideFromList : t.showInList}
                  variant="outline"
                  size="sm"
                  className="flex flex-col items-start"
                >
                  <input type="hidden" name="teamId" value={team.id} />
                  <input type="hidden" name="listed" value={team.listed ? "false" : "true"} />
                </ActionForm>
              </div>
              <div className="flex flex-col gap-2 border-t border-border pt-4">
                <span className="text-[14px] font-medium">
                  {t.applicants}:{" "}
                  <span className="font-normal text-muted-foreground">
                    {team.verifiedApplicantsOnly ? t.applicantsVerifiedOnly : t.applicantsAll}
                  </span>
                </span>
                <p className="text-[13px] text-pretty text-muted-foreground">
                  {t.applicantsHint(FULLY_VERIFIED_PLAYER_COUNT)}
                </p>
                <ActionForm
                  action={setVerifiedApplicantsOnlyAction}
                  guard={false}
                  submitLabel={team.verifiedApplicantsOnly ? t.admitAll : t.admitVerifiedOnly}
                  variant="outline"
                  size="sm"
                  className="flex flex-col items-start"
                >
                  <input type="hidden" name="teamId" value={team.id} />
                  <input
                    type="hidden"
                    name="verifiedApplicantsOnly"
                    value={team.verifiedApplicantsOnly ? "false" : "true"}
                  />
                </ActionForm>
              </div>
            </section>

            <section className={`${cardClass} gap-4`}>
              <div className="flex flex-col gap-1">
                <h2 className="type-h2">{t.logos}</h2>
                <p className="text-[13px] text-pretty text-muted-foreground">{t.logosHint}</p>
              </div>
              {LOGO_BACKGROUNDS.map((background) => {
                const hasLogo = team.logo?.backgrounds.includes(background) ?? false;
                return (
                  <div key={background} className="flex items-start gap-4">
                    <TeamLogoPreview team={team} background={background} emptyLabel={t.noLogo} />
                    <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                      <span className="text-[14px] font-medium">
                        {LOGO_BACKGROUND_LABELS[locale][background]}
                      </span>
                      <TeamLogoForm teamId={team.id} background={background} hasLogo={hasLogo} />
                      {hasLogo ? (
                        <ActionForm
                          action={removeTeamLogoAction}
                          submitLabel={t.removeLogo}
                          variant="ghost"
                          size="sm"
                          className="flex flex-col"
                          submitClassName="-ml-4"
                          confirmText={t.removeLogoConfirm[background]}
                          confirmDestructive
                        >
                          <input type="hidden" name="teamId" value={team.id} />
                          <input type="hidden" name="background" value={background} />
                        </ActionForm>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </section>
          </div>

          <section className={`${cardClass} min-w-0 gap-4`}>
            <div className="flex flex-col gap-1">
              <h2 className="type-h2">{t.externalLinks}</h2>
              <p className="text-[13px] text-pretty text-muted-foreground">
                {t.externalLinksHint.captain}
              </p>
            </div>
            <ActionForm
              // Mounted anew once the stored links change, so the fields show the saved
              // (normalized) addresses rather than what was typed.
              key={team.links.map((link) => link.url).join(" ")}
              action={updateTeamLinksAction}
              submitLabel={t.saveLinks}
              className="flex flex-col gap-4"
            >
              <input type="hidden" name="teamId" value={team.id} />
              {TEAM_LINK_PLATFORMS.map((platform) => (
                <Field
                  key={platform.key}
                  label={
                    <span className="flex items-center gap-2">
                      <TeamLinkIcon platform={platform.key} />
                      {platforms[platform.key].label}
                    </span>
                  }
                >
                  <Input
                    name={platform.key}
                    defaultValue={
                      team.links.find((link) => link.platform === platform.key)?.url ?? ""
                    }
                    placeholder={platforms[platform.key].placeholder}
                    maxLength={TEAM_LINK_MAX}
                    inputMode="url"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </Field>
              ))}
            </ActionForm>
          </section>
        </div>
      )}
    </DialogShell>
  );
}
