import { isDevLoginEnabled } from "@uni-scrims/core/config/dev";
import { listSeedUsers } from "@uni-scrims/core";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { devSignIn } from "./actions";
import { PageMain } from "@/components/page-main";
import { devLoginMessages } from "@/i18n/public";
import { getMessages } from "@/lib/locale";

// Dev only (ARCHITECTURE §7): sign in as a seed user, e.g. one per browser window.
export default async function DevLoginPage() {
  if (!isDevLoginEnabled()) notFound();
  const users = await listSeedUsers();
  const t = await getMessages(devLoginMessages);

  return (
    <PageMain className="gap-6">
      <h1 className="type-h1">{t.title}</h1>
      <ul className="flex flex-col gap-2">
        {users.map((user) => (
          <li key={user.id}>
            <form action={devSignIn}>
              <input type="hidden" name="userId" value={user.id} />
              <Button type="submit" variant="outline" className="w-full justify-start">
                {user.name}
                {user.teamNames.length > 0 ? (
                  <span className="text-muted-foreground">({user.teamNames.join(", ")})</span>
                ) : null}
              </Button>
            </form>
          </li>
        ))}
      </ul>
    </PageMain>
  );
}
