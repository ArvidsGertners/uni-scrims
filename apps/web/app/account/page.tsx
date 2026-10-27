import { LandingView } from "@/app/(public)/landing-view";
import { ScrimsView } from "@/app/scrims/scrims-view";
import { siteChrome } from "@/lib/header-user";
import { requirePageAccountUser } from "@/lib/session";
import { AccountDialog } from "./account-dialog";

/**
 * Loaded directly: the board behind the dialog, or the landing page for banned and incomplete
 * accounts, which /account lets in (SPEC N-31, §5.33).
 */
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePageAccountUser("/account");
  const { active } = await siteChrome();
  return (
    <>
      {active ? <ScrimsView userId={user.id} params={{}} /> : <LandingView params={{}} />}
      <AccountDialog intercepted={false} params={await searchParams} />
    </>
  );
}
