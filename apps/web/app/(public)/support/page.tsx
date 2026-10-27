import { ScrimsView } from "@/app/scrims/scrims-view";
import { siteChrome } from "@/lib/header-user";
import { LandingView } from "../landing-view";
import { SupportDialog } from "./support-dialog";

/** Loaded directly: the board or the landing page with the dialog open over it (§5.33). */
export default async function SupportPage() {
  const { user, active } = await siteChrome();
  return (
    <>
      {user && active ? <ScrimsView userId={user.id} params={{}} /> : <LandingView params={{}} />}
      <SupportDialog intercepted={false} />
    </>
  );
}
