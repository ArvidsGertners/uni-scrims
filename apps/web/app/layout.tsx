import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Geist } from "next/font/google";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Uni Scrims",
  description: "Scrims für Valorant-Teams deutscher Hochschulen",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de" className={cn("font-sans", geist.variable)}>
      <body className="flex min-h-dvh flex-col antialiased">
        <SiteHeader />
        <div className="flex-1">{children}</div>
        <footer className="mx-auto flex w-full max-w-3xl gap-4 px-4 py-6 text-sm opacity-70">
          <Link href="/impressum">Impressum</Link>
          <Link href="/datenschutz">Datenschutz</Link>
        </footer>
      </body>
    </html>
  );
}
