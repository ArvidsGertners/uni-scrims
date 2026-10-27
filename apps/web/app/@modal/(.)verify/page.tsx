import { VerifyDialog } from "@/app/verify/verify-dialog";

export default async function VerifyModal({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <VerifyDialog intercepted params={await searchParams} />;
}
