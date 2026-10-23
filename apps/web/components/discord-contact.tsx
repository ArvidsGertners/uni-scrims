import { ExternalLinkIcon } from "@/components/icons";
import { buttonVariants } from "@/components/ui/button";

/** The opponent captain after booking (SPEC P0-6), with a link to the Discord profile. */
export function DiscordContact({
  captainName,
  captainDiscordId,
  teamName,
}: {
  captainName: string;
  captainDiscordId: string | null;
  teamName: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-sm bg-secondary p-3.5">
      <div className="flex flex-col gap-0.5">
        <span className="text-[14px] font-semibold">Lobby auf Discord klären</span>
        <span className="text-[13px] text-muted-foreground">
          Ansprechpartner: <span className="font-label text-foreground">{captainName}</span> ·
          Captain von {teamName}
        </span>
      </div>
      {captainDiscordId ? (
        <a
          href={`https://discord.com/users/${captainDiscordId}`}
          target="_blank"
          rel="noreferrer"
          className={buttonVariants({
            variant: "outline",
            size: "sm",
            className: "not-disabled:hover:bg-background",
          })}
        >
          Auf Discord schreiben
          <ExternalLinkIcon size={15} />
        </a>
      ) : null}
    </div>
  );
}
