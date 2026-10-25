import { switchTeamAction } from "@/app/team/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { switchTeamMessages } from "@/i18n/chrome";
import { getMessages } from "@/lib/locale";

/**
 * A scrim or request of another own team (SPEC N-17): says so and switches to that team, staying on
 * the page (§5.20).
 */
export async function SwitchTeamHint({
  team,
  returnTo,
  children,
}: {
  team: { id: string; name: string };
  returnTo: string;
  children: React.ReactNode;
}) {
  const t = await getMessages(switchTeamMessages);
  return (
    <Alert>
      <div className="flex flex-col gap-3">
        <span>{children}</span>
        <form action={switchTeamAction.bind(null, team.id, returnTo)}>
          {/* Long team names wrap instead of leaving the box on phones. */}
          <Button
            type="submit"
            variant="outline"
            size="sm"
            className="h-auto max-w-full py-2 text-left whitespace-normal"
          >
            {t.switchTo(team.name)}
          </Button>
        </form>
      </div>
    </Alert>
  );
}
