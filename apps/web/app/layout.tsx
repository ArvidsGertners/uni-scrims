import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Geist_Mono, Space_Grotesk } from "next/font/google";
import { LocaleProvider } from "@/components/locale-provider";
import { SiteFooter } from "@/components/site-footer";
import { SiteFrame } from "@/components/site-frame";
import { SiteHeader } from "@/components/site-header";
import { ThemeProvider } from "@/components/theme-provider";
import { WhatsNewProvider } from "@/components/whats-new/whats-new-provider";
import { layoutMessages } from "@/i18n/chrome";
import { siteChrome, whatsNewDue } from "@/lib/header-user";
import { getLocale, getMessages } from "@/lib/locale";
import { themeAttribute, themeColor } from "@/lib/theme";
import { cn } from "@/lib/utils";

// Space Grotesk for display and body (public/brand/BRAND.md), as the variable font (300–700); Geist
// Mono for labels and codes as in direction A of the design handoff. next/font serves both from this
// site, so the browser makes no request to Google.
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});
const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-geist-mono",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages(layoutMessages);
  return {
    title: "Uni Scrims",
    description: t.description,
    icons: { icon: { url: "/brand/favicon.svg", type: "image/svg+xml" } },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const { user } = await siteChrome();
  return { width: "device-width", initialScale: 1, themeColor: themeColor(user?.theme) };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [{ user }, locale, due] = await Promise.all([siteChrome(), getLocale(), whatsNewDue()]);
  return (
    // Light or dark by the system setting (Phase 11), or as the account chose (Phase 17, §5.16),
    // through the tokens in globals.css. The language of the request (§5.21).
    <html
      lang={locale}
      data-theme={themeAttribute(user?.theme)}
      className={cn(spaceGrotesk.variable, geistMono.variable)}
    >
      <body className="flex min-h-dvh flex-col">
        <LocaleProvider locale={locale}>
          <ThemeProvider theme={user?.theme ?? "SYSTEM"}>
            {/* Around the header too: its menu below 1024 px opens the dialog again (SPEC N-29). */}
            <WhatsNewProvider due={due}>
              <SiteHeader />
              <SiteFrame>{children}</SiteFrame>
              <SiteFooter />
            </WhatsNewProvider>
          </ThemeProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
