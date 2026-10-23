import { isDevLoginEnabled } from "@uni-scrims/core/config/dev";
import { listSeedUsers } from "@uni-scrims/core";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { devSignIn } from "./actions";
import { PageMain } from "@/components/page-main";

// Dev only (ARCHITECTURE §7): sign in as a seed user, e.g. one per browser window.
export default async function DevLoginPage() {
  if (!isDevLoginEnabled()) notFound();
  const users = await listSeedUsers();

  return (
    <PageMain className="gap-6">
      <h1 className="type-h1">Dev-Login</h1>
      <ul className="flex flex-col gap-2">
        {users.map((user) => (
          <li key={user.id}>
            <form action={devSignIn}>
              <input type="hidden" name="userId" value={user.id} />
              <Button type="submit" variant="outline" className="w-full justify-start">
                {user.name}
                {user.teamName ? (
                  <span className="text-muted-foreground">({user.teamName})</span>
                ) : null}
              </Button>
            </form>
          </li>
        ))}
      </ul>
    </PageMain>
  );
}
