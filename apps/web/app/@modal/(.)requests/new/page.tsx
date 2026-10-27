import { NewRequestDialog } from "@/app/requests/new/new-request-dialog";

export default async function NewRequestModal({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <NewRequestDialog intercepted params={await searchParams} />;
}
