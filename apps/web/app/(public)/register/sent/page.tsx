import Link from "next/link";
import { PageMain } from "@/components/page-main";
import { registerMessages } from "@/i18n/public";
import { getMessages } from "@/lib/locale";

/** After the registration: the same for new and taken addresses (SPEC N-3). */
export default async function RegisterSentPage() {
  const t = await getMessages(registerMessages);
  return (
    <PageMain className="gap-4">
      <h1 className="type-h1">{t.sentTitle}</h1>
      <p className="text-pretty text-muted-foreground">{t.sentText}</p>
      <p className="text-[14px] text-pretty text-muted-foreground">
        {t.noMail((label) => (
          <Link
            href="/login"
            className="font-semibold text-foreground underline underline-offset-2"
          >
            {label}
          </Link>
        ))}
      </p>
    </PageMain>
  );
}
