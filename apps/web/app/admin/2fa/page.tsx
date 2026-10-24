import { redirect } from "next/navigation";
import { PageMain } from "@/components/page-main";
import { adminHref } from "@/lib/admin-url";
import { requireStaffMemberPage } from "@/lib/session";
import { TwoFactorSetup } from "./two-factor-setup";

/** Staff set up their 2FA before anything else in the admin area (SPEC N-4, §5.9). */
export default async function TwoFactorSetupPage() {
  const staff = await requireStaffMemberPage("/2fa");
  if (staff.twoFactorEnabled) redirect(adminHref("/"));
  return (
    <PageMain className="gap-7">
      <div className="flex flex-col gap-2.5">
        <h1 className="type-h1">Zwei-Faktor-Anmeldung einrichten</h1>
        <p className="text-pretty text-muted-foreground">
          Für den Admin-Bereich brauchst du zusätzlich zum Passwort einen Code aus einer
          Authenticator-App. Danach meldest du dich einmal neu an, ab dann immer mit Passwort und
          Code. Solange du eine Rolle hast, geht die Anmeldung mit Discord nicht.
        </p>
      </div>
      <TwoFactorSetup />
    </PageMain>
  );
}
