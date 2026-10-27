import { AccountDialog } from "@/app/account/account-dialog";

export default async function AccountModal({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <AccountDialog intercepted params={await searchParams} />;
}
