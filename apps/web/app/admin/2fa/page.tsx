import { redirect } from "next/navigation";
import { PageMain } from "@/components/page-main";
import { adminTwoFactorMessages } from "@/i18n/admin";
import { adminHref } from "@/lib/admin-url";
import { getMessages } from "@/lib/locale";
import { requireStaffMemberPage } from "@/lib/session";
import { TwoFactorSetup } from "./two-factor-setup";

/** Staff set up their 2FA before anything else in the admin area (SPEC N-4, §5.9). */
export default async function TwoFactorSetupPage() {
  const staff = await requireStaffMemberPage("/2fa");
  if (staff.twoFactorEnabled) redirect(adminHref("/"));
  const t = await getMessages(adminTwoFactorMessages);
  return (
    <PageMain className="gap-7">
      <div className="flex flex-col gap-2.5">
        <h1 className="type-h1">{t.title}</h1>
        <p className="text-pretty text-muted-foreground">{t.intro}</p>
      </div>
      <TwoFactorSetup />
    </PageMain>
  );
}
