import { switchTeamAction } from "@/app/team/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * A scrim or request of another own team (SPEC N-17): says so and switches to that team, staying on
 * the page (§5.20).
 */
export function SwitchTeamHint({
  team,
  returnTo,
  children,
}: {
  team: { id: string; name: string };
  returnTo: string;
  children: React.ReactNode;
}) {
  return (
    <Alert>
      <div className="flex flex-col gap-3">
        <span>{children}</span>
        <form action={switchTeamAction.bind(null, team.id, returnTo)}>
          <Button type="submit" variant="outline" size="sm">
            Zu {team.name} wechseln
          </Button>
        </form>
      </div>
    </Alert>
  );
}
