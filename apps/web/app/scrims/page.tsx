import { requirePageUser } from "@/lib/session";
import { ScrimsView } from "./scrims-view";

export default async function ScrimsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePageUser("/scrims");
  return <ScrimsView userId={user.id} params={await searchParams} />;
}
