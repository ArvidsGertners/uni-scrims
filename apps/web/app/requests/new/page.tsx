import { ScrimsView } from "@/app/scrims/scrims-view";
import { TeamsView } from "@/app/teams/teams-view";
import { single, toQueryString } from "@/lib/search-params";
import { requirePageUser } from "@/lib/session";
import { NewRequestDialog } from "./new-request-dialog";

/**
 * Loaded directly: the board with the dialog open over it; a direct request (?team=) over the
 * teams list (SPEC N-31, §5.33).
 */
export default async function NewRequestPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const user = await requirePageUser(`/requests/new${toQueryString(params)}`);
  return (
    <>
      {single(params.team) ? (
        <TeamsView userId={user.id} params={{}} />
      ) : (
        <ScrimsView userId={user.id} params={{}} />
      )}
      <NewRequestDialog intercepted={false} params={params} />
    </>
  );
}
