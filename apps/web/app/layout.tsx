import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Geist_Mono, Space_Grotesk } from "next/font/google";
import { SiteFooter } from "@/components/site-footer";
import { SiteFrame } from "@/components/site-frame";
import { SiteHeader } from "@/components/site-header";
import { ThemeProvider } from "@/components/theme-provider";
import { siteChrome } from "@/lib/header-user";
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

export const metadata: Metadata = {
  title: "Uni Scrims",
  description: "Scrims für Valorant-Teams deutscher Hochschulen",
  icons: { icon: { url: "/brand/favicon.svg", type: "image/svg+xml" } },
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
      className={cn(spaceGrotesk.variable, geistMono.variable)}
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
