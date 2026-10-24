import {
  ASSIGNABLE_STAFF_ROLES,
  MIN_STAFF_SEARCH_LENGTH,
  STAFF_ROLE_LABELS,
  findStaffCandidates,
  listStaff,
} from "@uni-scrims/core";
import type { StaffRole } from "@uni-scrims/db";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { adminHref } from "@/lib/admin-url";
import { requireAdminShellPage } from "@/lib/session";
import { AdminShell } from "../admin-shell";
import { resetStaffTwoFactorAction, setStaffRoleAction } from "./actions";

const cardClass = "flex flex-col gap-3 rounded-lg border border-border bg-card p-4 text-[14px]";

type Person = {
  id: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  staffRole: StaffRole | null;
  twoFactorEnabled: boolean;
};

function PersonLine({ person }: { person: Person }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{person.name}</span>
        {person.staffRole ? (
          <Badge variant="accent">{STAFF_ROLE_LABELS[person.staffRole]}</Badge>
        ) : null}
        {person.staffRole ? (
          person.twoFactorEnabled ? (
            <Badge variant="success">2FA eingerichtet</Badge>
          ) : (
            <Badge variant="warning">2FA fehlt</Badge>
          )
        ) : null}
      </p>
      <p className="text-muted-foreground">
        {person.firstName} {person.lastName} · {person.email}
      </p>
    </div>
  );
}

/** Role select with the roles the operator gives; "none" removes it. */
function RoleForm({ person }: { person: Person }) {
  return (
    <ActionForm
      action={setStaffRoleAction}
      submitLabel={person.staffRole ? "Rolle ändern" : "Rolle geben"}
      variant="outline"
      size="sm"
      className="flex flex-wrap items-start gap-2"
      confirmText={`Rolle von ${person.name} ändern? Die Person wird dabei überall abgemeldet.`}
    >
      <input type="hidden" name="userId" value={person.id} />
      <Select
        name="role"
        defaultValue={person.staffRole ?? ASSIGNABLE_STAFF_ROLES[1]}
        aria-label={`Rolle von ${person.name}`}
        className="min-h-10 w-auto py-1.5"
        options={[
          ...ASSIGNABLE_STAFF_ROLES.map((role) => ({
            value: role,
            label: STAFF_ROLE_LABELS[role],
          })),
          ...(person.staffRole ? [{ value: "none", label: "Keine Rolle" }] : []),
        ]}
      />
    </ActionForm>
  );
}

/** Roles of the admin area, for the operator only (SPEC N-4, §5.9). */
export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { staff: operator, overview } = await requireAdminShellPage("/staff", "staff");
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  const [staff, candidates] = await Promise.all([
    listStaff(operator.id),
    findStaffCandidates({ operatorId: operator.id, query }),
  ]);
  const searched = query.length >= MIN_STAFF_SEARCH_LENGTH;

  return (
    <AdminShell overview={overview} current="/staff">
      <h1 className="type-h1">Rollen</h1>
      <div className="flex max-w-3xl flex-col gap-1 text-[14px] text-pretty text-muted-foreground">
        <p>
          Prüfer sehen nur die Prüf-Queue. Admins sehen den ganzen Admin-Bereich außer dieser Seite.
          Beide richten beim ersten Besuch eine Zwei-Faktor-Anmeldung ein und melden sich danach nur
          mit Passwort und Code an.
        </p>
        <p>
          Jede Änderung meldet die Person überall ab. Wer die Rolle verliert, verliert auch die 2FA.
          Den Betreiber änderst du hier nicht (README).
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="type-h2">Admins und Prüfer</h2>
        <ul className="grid gap-3 xl:grid-cols-2 xl:items-start">
          {staff.map((person) => (
            <li key={person.id} className={cardClass}>
              <PersonLine person={person} />
              {person.staffRole === "OPERATOR" ? null : (
                <div className="flex flex-wrap items-start gap-2">
                  <RoleForm person={person} />
                  {person.twoFactorEnabled ? (
                    <ActionForm
                      action={resetStaffTwoFactorAction}
                      submitLabel="2FA zurücksetzen"
                      variant="ghost"
                      size="sm"
                      confirmText={`2FA von ${person.name} zurücksetzen? Die Person richtet sie beim nächsten Besuch neu ein.`}
                    >
                      <input type="hidden" name="userId" value={person.id} />
                    </ActionForm>
                  ) : null}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="type-h2">Konto hinzufügen</h2>
        <form key={query} method="get" className="flex max-w-3xl flex-wrap items-end gap-3">
          <div className="flex min-w-60 flex-1 flex-col gap-1.5">
            <Label htmlFor="q">E-Mail-Adresse (genau) oder Discord-Name</Label>
            <Input id="q" name="q" defaultValue={query} />
          </div>
          <Button type="submit" variant="outline">
            Suchen
          </Button>
          <Link href={adminHref("/staff")} className="text-[14px] underline underline-offset-2">
            Zurücksetzen
          </Link>
        </form>
        {query.length > 0 && !searched ? (
          <p className="text-[14px]">
            Bitte mindestens {MIN_STAFF_SEARCH_LENGTH} Zeichen eingeben.
          </p>
        ) : null}
        {searched && candidates.length === 0 ? (
          <p className="text-[14px]">
            Keine Treffer. Gefunden werden nur vollständige, nicht gesperrte Konten mit Passwort.
          </p>
        ) : null}
        <ul className="grid gap-3 xl:grid-cols-2 xl:items-start">
          {candidates
            .filter((person) => person.staffRole !== "OPERATOR")
            .map((person) => (
              <li key={person.id} className={cardClass}>
                <PersonLine person={person} />
                <RoleForm person={person} />
              </li>
            ))}
        </ul>
      </section>
    </AdminShell>
  );
}
