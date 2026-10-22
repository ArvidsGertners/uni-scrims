import { getAccount } from "@uni-scrims/core";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { requirePageAccountUser } from "@/lib/session";
import { deleteAccountAction } from "./actions";

export default async function AccountPage() {
  const user = await requirePageAccountUser("/account");
  const account = await getAccount(user.id);
  const team = account.team;

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Konto</h1>
        <p>
          Angemeldet als <span className="font-medium">{account.name}</span> (Discord)
        </p>
        {account.banned ? (
          <p className="text-sm text-destructive">
            Dein Konto ist gesperrt. Löschen kannst du es trotzdem.
          </p>
        ) : null}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Konto löschen</h2>
        <ul className="list-disc pl-5 text-sm">
          <li>
            Gelöscht werden dein Name und Avatar, deine Verifizierung samt Prüfungen und Dateien,
            Nachrichten an dich und deine Anmeldungen.
          </li>
          {account.banned ? (
            <li>
              Deine Discord-ID bleibt mit der Sperre gespeichert, damit sie bei einer neuen
              Anmeldung weiter gilt.
            </li>
          ) : (
            <li>Die Verknüpfung mit deinem Discord-Konto wird gelöscht.</li>
          )}
          {team ? (
            <li>
              {team.isCaptain
                ? `Dein Team ${team.name} wird aufgelöst.`
                : `Du verlässt dein Team ${team.name}.`}
            </li>
          ) : null}
          <li>Vergangene Scrims bleiben anonymisiert für die Team-Statistik.</li>
          <li>
            Vom Uni-Scrims-Discord-Server wirst du nicht entfernt. Den kannst du selbst verlassen.
          </li>
        </ul>
        {account.deletionProblem ? (
          <p className="text-sm">
            {account.deletionProblem}{" "}
            <Link href="/team" className="underline">
              Zum Team
            </Link>
          </p>
        ) : (
          <ActionForm
            action={deleteAccountAction}
            submitLabel="Konto endgültig löschen"
            variant="destructive"
          >
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="confirm"
                required
                className="mt-0.5 size-4 accent-primary"
              />
              Ich will mein Konto löschen. Das lässt sich nicht rückgängig machen.
            </label>
          </ActionForm>
        )}
      </section>
    </main>
  );
}
