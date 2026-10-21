import { isDevLoginEnabled } from "@uni-scrims/core/config/dev";
import { listSeedUsers } from "@uni-scrims/core";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { devSignIn } from "./actions";

// Dev only (ARCHITECTURE §7): sign in as a seed user, e.g. one per browser window.
export default async function DevLoginPage() {
  if (!isDevLoginEnabled()) notFound();
  const users = await listSeedUsers();

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-12">
      <h1 className="text-2xl font-bold">Dev-Login</h1>
      <ul className="flex flex-col gap-2">
        {users.map((user) => (
          <li key={user.id}>
            <form action={devSignIn}>
              <input type="hidden" name="userId" value={user.id} />
              <Button type="submit" variant="outline" className="w-full justify-start">
                {user.name}
                {user.teamName ? <span className="opacity-60">({user.teamName})</span> : null}
              </Button>
            </form>
          </li>
        ))}
      </ul>
    </main>
  );
}
