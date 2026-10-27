import { requirePageUser } from "@/lib/session";
import { TeamView } from "./team-view";

export default async function TeamPage() {
  const user = await requirePageUser("/team");
  return <TeamView userId={user.id} />;
}
