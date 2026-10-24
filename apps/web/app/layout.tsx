import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteFooter } from "@/components/site-footer";
import { SiteFrame } from "@/components/site-frame";
import { SiteHeader } from "@/components/site-header";
import { ThemeProvider } from "@/components/theme-provider";
import { siteChrome } from "@/lib/header-user";
import { themeAttribute, themeColor } from "@/lib/theme";
import { cn } from "@/lib/utils";

// Direction A of the design handoff: Geist for display and body, Geist Mono for labels. The same
// static weights as the prototype loads, so in-between weights (display 650) render like there.
const geist = Geist({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-geist",
});
const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "Uni Scrims",
  description: "Scrims für Valorant-Teams deutscher Hochschulen",
};

export async function generateViewport(): Promise<Viewport> {
  const { user } = await siteChrome();
  return { width: "device-width", initialScale: 1, themeColor: themeColor(user?.theme) };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { user } = await siteChrome();
  return (
    // Light or dark by the system setting (Phase 11), or as the account chose (Phase 17, §5.16),
    // through the tokens in globals.css.
    <html
      lang="de"
      data-theme={themeAttribute(user?.theme)}
      className={cn(geist.variable, geistMono.variable)}
    >
      <body className="flex min-h-dvh flex-col">
        <ThemeProvider theme={user?.theme ?? "SYSTEM"}>
          <SiteHeader />
          <SiteFrame>{children}</SiteFrame>
          <SiteFooter />
        </ThemeProvider>
      </body>
    </html>
  );
}
