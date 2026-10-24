// The rights of the team roles (SPEC N-15): display only, an excerpt of the permission table in
// ARCHITECTURE §7 and §5.17. Whoever changes those changes this too.

const ROLES = ["Captain", "Spieler", "Ersatz", "Coach"] as const;

type Cell = true | false | string;

const ROWS: { right: string; cells: [Cell, Cell, Cell, Cell] }[] = [
  {
    right: "Zählt zur Spielbereitschaft, wenn verifiziert",
    cells: ["je nach Rolle", true, true, false],
  },
  { right: "Scrims, Anfragen und Bewerbungen des Teams sehen", cells: [true, true, true, true] },
  {
    right: "Benachrichtigungen zu Scrims (Buchung, Absage, Erinnerung, Feedback)",
    cells: ["an", "wählbar", "wählbar", "wählbar"],
  },
  { right: "Benachrichtigungen zu Anfragen und Bewerbungen", cells: [true, false, false, false] },
  {
    right: "Anfragen erstellen, bewerben, bestätigen, absagen, Feedback geben",
    cells: ["✓¹", false, false, false],
  },
  { right: "Team, Logos und Links bearbeiten, Einladungslink", cells: [true, false, false, false] },
  {
    right: "Rollen setzen, Mitglieder entfernen, Captain übertragen",
    cells: [true, false, false, false],
  },
  { right: "Team-Channel verknüpfen (/setup)", cells: [true, false, false, false] },
  { right: "Team verlassen", cells: ["✓²", true, true, true] },
];

function CellValue({ value }: { value: Cell }) {
  if (value === true) {
    return (
      <>
        <span aria-hidden>✓</span>
        <span className="sr-only">ja</span>
      </>
    );
  }
  if (value === false) {
    return (
      <>
        <span aria-hidden className="text-faint">
          –
        </span>
        <span className="sr-only">nein</span>
      </>
    );
  }
  return <>{value}</>;
}

export function RolesTable() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="type-h2">Rollen und Rechte</h2>
      <p className="max-w-3xl text-[14px] text-pretty text-muted-foreground">
        Jedes Mitglied ist Spieler, Ersatz oder Coach; der Captain hat zusätzlich eine dieser
        Rollen. Coaches brauchen keine Verifizierung.
      </p>
      {/* Below 640 px each right is a block with the four roles side by side, so nothing has to
          scroll sideways. */}
      <div className="rounded-lg border border-border bg-card">
        <table className="w-full text-[13px] max-sm:block sm:text-[14px]">
          <thead className="max-sm:hidden">
            <tr className="border-b border-border">
              <th scope="col" className="p-3 text-left font-medium text-muted-foreground">
                Recht
              </th>
              {ROLES.map((role) => (
                <th key={role} scope="col" className="p-3 text-center font-semibold">
                  {role}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="max-sm:block">
            {ROWS.map((row) => (
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
                    key={ROLES[index]}
                    className="p-3 text-center max-sm:flex max-sm:flex-col max-sm:items-center max-sm:gap-0.5 max-sm:p-0"
                  >
                    <span aria-hidden className="text-[11px] text-faint sm:hidden">
                      {ROLES[index]}
                    </span>
                    <CellValue value={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-1 text-[13px] text-pretty text-muted-foreground">
        <p>¹ Nur, wenn der Captain selbst verifiziert ist.</p>
        <p>
          ² Erst nach Übertragung der Captain-Rolle; als einziges Mitglied löst der Captain das Team
          damit auf.
        </p>
      </div>
    </section>
  );
}
