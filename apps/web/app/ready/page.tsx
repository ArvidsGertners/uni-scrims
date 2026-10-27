import { ScrimsView } from "@/app/scrims/scrims-view";
import { requirePageUser } from "@/lib/session";
import { ReadyDialog } from "./ready-dialog";

/** Loaded directly: the board with the dialog open over it (SPEC N-31, §5.33). */
export default async function ReadyPage() {
  const user = await requirePageUser("/ready");
  return (
    <>
      <ScrimsView userId={user.id} params={{}} />
      <ReadyDialog intercepted={false} />
    </>
  );
}
