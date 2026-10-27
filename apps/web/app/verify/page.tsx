import { ScrimsView } from "@/app/scrims/scrims-view";
import { requirePageUser } from "@/lib/session";
import { VerifyDialog } from "./verify-dialog";

/** Loaded directly: the board with the dialog open over it (SPEC N-31, §5.33). */
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePageUser("/verify");
  return (
    <>
      <ScrimsView userId={user.id} params={{}} />
      <VerifyDialog intercepted={false} params={await searchParams} />
    </>
  );
}
