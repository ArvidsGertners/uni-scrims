import { deliverableEmail, getNotificationPreferences } from "@uni-scrims/core";
import { DiscordDmWarning } from "@/components/discord-dm-warning";
import { PageMain } from "@/components/page-main";
import { requirePageUser } from "@/lib/session";
import { AccountTabs } from "../account-tabs";
import { NotificationForm, type NotificationFormCategory } from "./notification-form";

const HINTS = {
  SELF: null,
  CAPTAIN: "Nur als Captain",
  TEAM: "Für Captains standardmäßig an",
} as const;

/** Discord and mail per notification (SPEC N-14, ARCHITECTURE §5.17). */
export default async function NotificationsPage() {
  const user = await requirePageUser("/account/notifications");
  const settings = await getNotificationPreferences(user.id);
  const email = deliverableEmail(user);
  const categories: NotificationFormCategory[] = settings.categories.map((category) => ({
    key: category.key,
    title: category.title,
    types: category.types.map((item) => ({
      type: item.type,
      label: item.label,
      hint: HINTS[item.audience],
      discord: item.discord,
      email: item.email,
    })),
  }));

  return (
    <PageMain width="wide" className="gap-7">
      <div className="flex min-h-11 items-center">
        <h1 className="type-h1">Einstellungen</h1>
      </div>
      <AccountTabs current="/account/notifications" unverified={!user.verifiedAt} />
      <div className="flex max-w-3xl flex-col gap-3">
        <p className="text-pretty text-muted-foreground">
          Wähle für jede Benachrichtigung, ob sie per Discord-DM, per Mail oder auf beiden Wegen
          kommt. DMs gehen an <span className="font-semibold text-foreground">{user.name}</span>
          {email ? (
            <>
              , Mails an <span className="font-semibold break-all text-foreground">{email}</span>
            </>
          ) : null}
          . Scrim-Benachrichtigungen bekommt ohne eigene Wahl nur der Captain; als Mitglied kannst
          du sie hier für dich einschalten.
          {/* Captain in one team, member in another: no single default (§5.20). */}
          {settings.mixedRoles
            ? " Du bist in einem Team Captain und in einem anderen nicht: Ohne eigene Wahl bekommst du Scrim-Benachrichtigungen nur für deine Teams als Captain. Was du hier änderst, gilt für alle deine Teams."
            : null}
        </p>
        {user.hubJoinFailedAt || user.dmFailedAt ? (
          <DiscordDmWarning hubJoinFailed={user.hubJoinFailedAt !== null} />
        ) : null}
      </div>
      <NotificationForm categories={categories} isCaptain={settings.isCaptain} />
      <p className="max-w-3xl text-[14px] text-pretty text-muted-foreground">
        Nicht abschaltbar sind die Mails zu deinem Konto (Bestätigung, Passwort, neue Adresse) und
        die Posts im Team-Channel; die gehören zum ganzen Team.
      </p>
    </PageMain>
  );
}
