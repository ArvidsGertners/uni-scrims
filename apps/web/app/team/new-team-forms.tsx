import { ActionForm } from "@/components/action-form";
import { TeamFields } from "@/components/team-fields";
import { createTeamAction } from "./actions";
import { JoinLinkForm } from "./join-link-form";

const cardClass = "flex flex-col rounded-lg border border-border bg-card p-5";

/** Found a team or paste an invite link: /team without a team and /team/new (SPEC N-17). */
export function NewTeamForms() {
  const baseUrl = process.env.BETTER_AUTH_URL ?? "";
  return (
    // From 1024 px both ways side by side (SPEC N-12); below in this order.
    <div className="contents lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
      <section className={`${cardClass} gap-[18px]`}>
        <h2 className="type-h2">Team gründen</h2>
        <ActionForm
          action={createTeamAction}
          submitLabel="Team gründen"
          size="lg"
          submitClassName="w-full"
          className="flex flex-col gap-[18px]"
        >
          <TeamFields />
        </ActionForm>
      </section>
      <div className="flex items-center gap-3 text-[13px] text-faint lg:hidden">
        <span className="h-px flex-1 bg-border" />
        oder
        <span className="h-px flex-1 bg-border" />
      </div>
      <section className={`${cardClass} gap-3.5`}>
        <h2 className="type-h2">Team beitreten</h2>
        <p className="text-[14px] text-pretty text-muted-foreground">
          Frag deinen Captain nach dem Einladungslink und öffne ihn. Oder füge ihn hier ein:
        </p>
        <JoinLinkForm placeholder={`${baseUrl.replace(/^https?:\/\//, "")}/join/…`} />
      </section>
    </div>
  );
}
