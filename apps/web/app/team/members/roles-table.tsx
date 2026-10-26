// The rights of the team roles (SPEC N-15): display only, an excerpt of the permission table in
// ARCHITECTURE §7 and §5.17. Whoever changes those changes this too.
import { rolesTableMessages } from "@/i18n/team";
import { getMessages } from "@/lib/locale";

type Cell = true | false | string;

type Text = (typeof rolesTableMessages)["de"];

/** The rows in the order of the table; the cells per role in the order of the head. */
function rightRows(t: Text): { right: string; cells: [Cell, Cell, Cell, Cell] }[] {
  return [
    { right: t.rights.badge, cells: [t.byRole, true, true, false] },
    { right: t.rights.ownRank, cells: [t.byRole, true, true, false] },
    { right: t.rights.seeRanks, cells: [true, true, true, true] },
    { right: t.rights.seeActivity, cells: [true, true, true, true] },
    {
      right: t.rights.scrimNotifications,
      cells: [t.defaultOn, t.optional, t.optional, t.optional],
    },
    { right: t.rights.requestNotifications, cells: [true, false, false, false] },
    // Every member, without verification (SPEC N-28).
    { right: t.rights.messages, cells: [true, true, true, true] },
    {
      right: t.rights.messageNotifications,
      cells: [t.defaultOn, t.optional, t.optional, t.optional],
    },
    { right: t.rights.requests, cells: ["✓¹", false, false, false] },
    { right: t.rights.directRequests, cells: ["✓¹", false, false, false] },
    { right: t.rights.readyToday, cells: ["✓¹", false, false, false] },
    { right: t.rights.editTeam, cells: [true, false, false, false] },
    { right: t.rights.listTeam, cells: [true, false, false, false] },
    { right: t.rights.verifiedApplicants, cells: [true, false, false, false] },
    { right: t.rights.manageMembers, cells: [true, false, false, false] },
    { right: t.rights.linkChannel, cells: [true, false, false, false] },
    { right: t.rights.leave, cells: ["✓²", true, true, true] },
    // Per person, not per team role (SPEC N-17).
    { right: t.rights.moreTeams, cells: [true, true, true, true] },
  ];
}

function CellValue({ value, t }: { value: Cell; t: Text }) {
  if (value === true) {
    return (
      <>
        <span aria-hidden>{"✓"}</span>
        <span className="sr-only">{t.yes}</span>
      </>
    );
  }
  if (value === false) {
    return (
      <>
        <span aria-hidden className="text-faint">
          –
        </span>
        <span className="sr-only">{t.no}</span>
      </>
    );
  }
  return <>{value}</>;
}

export async function RolesTable() {
  const t = await getMessages(rolesTableMessages);
  const roles = [t.roles.captain, t.roles.player, t.roles.substitute, t.roles.coach];
  return (
    <section className="flex flex-col gap-3">
      <h2 className="type-h2">{t.heading}</h2>
      <p className="max-w-3xl text-[14px] text-pretty text-muted-foreground">{t.intro}</p>
      {/* Below 640 px each right is a block with the four roles side by side, so nothing has to
          scroll sideways. */}
      <div className="rounded-lg border border-border bg-card">
        <table className="w-full text-[13px] max-sm:block sm:text-[14px]">
          <thead className="max-sm:hidden">
            <tr className="border-b border-border">
              <th scope="col" className="p-3 text-left font-medium text-muted-foreground">
                {t.right}
              </th>
              {roles.map((role) => (
                <th key={role} scope="col" className="p-3 text-center font-semibold">
                  {role}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="max-sm:block">
            {rightRows(t).map((row) => (
              <tr
                key={row.right}
                className="border-b border-border last:border-b-0 max-sm:grid max-sm:grid-cols-4 max-sm:gap-x-1 max-sm:gap-y-2 max-sm:p-3"
              >
                <th
                  scope="row"
                  className="p-3 text-left font-normal text-pretty text-muted-foreground max-sm:col-span-4 max-sm:p-0"
                >
                  {row.right}
                </th>
                {row.cells.map((cell, index) => (
                  <td
                    key={roles[index]}
                    className="p-3 text-center max-sm:flex max-sm:flex-col max-sm:items-center max-sm:gap-0.5 max-sm:p-0"
                  >
                    {/* The head is hidden below 640 px, so each value says its role there. */}
                    <span className="text-[11px] text-faint sm:hidden">{roles[index]}</span>
                    <CellValue value={cell} t={t} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-1 text-[13px] text-pretty text-muted-foreground">
        <p>{t.footnoteVerified}</p>
        <p>{t.footnoteLeave}</p>
      </div>
    </section>
  );
}
