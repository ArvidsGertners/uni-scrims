import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-3xl flex-wrap justify-between gap-x-6 gap-y-3 px-5 pt-6 pb-8 text-[13px] text-faint sm:px-8">
        <div className="flex gap-5">
          <Link href="/impressum" className="text-muted-foreground hover:text-foreground">
            Impressum
          </Link>
          <Link href="/datenschutz" className="text-muted-foreground hover:text-foreground">
            Datenschutz
          </Link>
        </div>
        <span>Kein offizielles Produkt von Riot Games.</span>
      </div>
    </footer>
  );
}
