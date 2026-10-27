import { ScrimsView } from "@/app/scrims/scrims-view";
import { requirePageUser } from "@/lib/session";
import { NotificationsDialog } from "./notifications-dialog";

/** Loaded directly: the board with the dialog open over it (SPEC N-31, §5.33). */
export default async function NotificationsPage() {
  const user = await requirePageUser("/account/notifications");
  return (
    <>
      <ScrimsView userId={user.id} params={{}} />
      <NotificationsDialog intercepted={false} />
    </>
  );
}
