import { requirePageUser } from "@/lib/session";
import { TeamsView } from "./teams-view";

export default async function TeamsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePageUser("/teams");
  return <TeamsView userId={user.id} params={await searchParams} />;
}
