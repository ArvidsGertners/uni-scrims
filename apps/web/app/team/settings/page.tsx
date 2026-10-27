import { requirePageUser } from "@/lib/session";
import { TeamView } from "../team-view";
import { TeamSettingsDialog } from "./team-settings-dialog";

/** Loaded directly: the team page with the settings dialog open over it (SPEC N-31, §5.33). */
export default async function TeamSettingsPage() {
  const user = await requirePageUser("/team/settings");
  return (
    <>
      <TeamView userId={user.id} />
      <TeamSettingsDialog intercepted={false} />
    </>
  );
}
