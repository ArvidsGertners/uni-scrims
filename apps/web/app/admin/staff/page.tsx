import {
  ASSIGNABLE_STAFF_ROLES,
  MIN_STAFF_SEARCH_LENGTH,
  STAFF_ROLE_LABELS,
  findStaffCandidates,
  listStaff,
  userDisplayName,
} from "@uni-scrims/core";
import type { StaffRole } from "@uni-scrims/db";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { LIST_COLUMNS } from "@/components/list-group";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { adminHref } from "@/lib/admin-url";
import { requireAdminShellPage } from "@/lib/session";
import { AdminShell } from "../admin-shell";
import { resetStaffTwoFactorAction, setStaffRoleAction } from "./actions";
import { getLocale, getMessages } from "@/lib/locale";
import { adminSearchMessages, adminStaffMessages } from "@/i18n/admin";

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

async function PersonLine({ person }: { person: Person }) {
  const locale = await getLocale();
  const t = await getMessages(adminStaffMessages);
  return (
    <div className="flex flex-col gap-0.5">
      <p className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{userDisplayName(person.name, locale)}</span>
        {person.staffRole ? (
          <Badge variant="accent">{STAFF_ROLE_LABELS[locale][person.staffRole]}</Badge>
        ) : null}
        {person.staffRole ? (
          person.twoFactorEnabled ? (
            <Badge variant="success">{t.twoFactorEnabled}</Badge>
          ) : (
            <Badge variant="warning">{t.twoFactorMissing}</Badge>
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
async function RoleForm({ person }: { person: Person }) {
  const locale = await getLocale();
  const t = await getMessages(adminStaffMessages);
  const name = userDisplayName(person.name, locale);
  return (
    <ActionForm
      action={setStaffRoleAction}
      submitLabel={person.staffRole ? t.changeRole : t.giveRole}
      variant="outline"
      size="sm"
      className="flex flex-wrap items-start gap-2"
      confirmText={t.changeRoleConfirm(name)}
    >
      <input type="hidden" name="userId" value={person.id} />
      <Select
        name="role"
        defaultValue={person.staffRole ?? ASSIGNABLE_STAFF_ROLES[1]}
        aria-label={t.roleOf(name)}
        className="min-h-10 w-auto py-1.5"
        options={[
          ...ASSIGNABLE_STAFF_ROLES.map((role) => ({
            value: role,
            label: STAFF_ROLE_LABELS[locale][role],
          })),
          ...(person.staffRole ? [{ value: "none", label: t.noRole }] : []),
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
  const locale = await getLocale();
  const t = await getMessages(adminStaffMessages);
  const search = await getMessages(adminSearchMessages);

  return (
    <AdminShell overview={overview} current="/staff">
      <h1 className="type-h1">{t.title}</h1>
      <div className="flex max-w-3xl flex-col gap-1 text-[14px] text-pretty text-muted-foreground">
        <p>{t.rolesHint}</p>
        <p>{t.changesHint}</p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="type-h2">{t.staffTitle}</h2>
        <ul className={`${LIST_COLUMNS} gap-3`}>
          {staff.map((person) => (
            <li key={person.id} className={cardClass}>
              <PersonLine person={person} />
              {person.staffRole === "OPERATOR" ? null : (
                <div className="flex flex-wrap items-start gap-2">
                  <RoleForm person={person} />
                  {person.twoFactorEnabled ? (
                    <ActionForm
                      action={resetStaffTwoFactorAction}
                      submitLabel={t.resetTwoFactor}
                      variant="ghost"
                      size="sm"
                      confirmText={t.resetTwoFactorConfirm(userDisplayName(person.name, locale))}
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
        <h2 className="type-h2">{t.addTitle}</h2>
        <form key={query} method="get" className="flex max-w-3xl flex-wrap items-end gap-3">
          <div className="flex min-w-60 flex-1 flex-col gap-1.5">
            <Label htmlFor="q">{t.searchLabel}</Label>
            <Input id="q" name="q" defaultValue={query} />
          </div>
          <Button type="submit" variant="outline">
            {search.search}
          </Button>
          <Link href={adminHref("/staff")} className="text-[14px] underline underline-offset-2">
            {search.reset}
          </Link>
        </form>
        {query.length > 0 && !searched ? (
          <p className="text-[14px]">{search.tooShort(MIN_STAFF_SEARCH_LENGTH)}</p>
        ) : null}
        {searched && candidates.length === 0 ? (
          <p className="text-[14px]">{t.noCandidates}</p>
        ) : null}
        <ul className={`${LIST_COLUMNS} gap-3`}>
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
