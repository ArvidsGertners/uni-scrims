import { getPublicBoard } from "@uni-scrims/core";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BoardFilterForm,
  BoardRequestList,
  ReadyWindowList,
  isBoardFiltered,
  readBoardRanks,
  readLeagues,
} from "@/components/board";
import { EmptyState } from "@/components/empty-state";
import { readCheckboxFilters } from "@/components/filter-checkbox";
import { CalendarIcon } from "@/components/icons";
import { PageMain } from "@/components/page-main";
import { buttonVariants } from "@/components/ui/button";
import { getMessages } from "@/lib/locale";
import { single, toQueryString } from "@/lib/search-params";
import { getSignedInUser, loginUrl } from "@/lib/session";
import { publicBoardMessages, scrimsPageMessages } from "@/i18n/scrims";

// Open to everyone, but not for search engines (SPEC N-24).
export const metadata: Metadata = { robots: { index: false } };

/** Both ways in lead to the board with the own team afterwards. */
const AFTER_SIGN_IN = "/scrims";

/**
 * The board without login, read only (SPEC N-24, §5.26): the same cards and filters; a card leads
 * to the login and then to the request.
 */
export default async function PublicBoardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  // Signed in, the board is a tab of /scrims; old links, also in Discord messages, keep their filters.
  if (await getSignedInUser()) redirect(`/scrims${toQueryString(params)}`);
  const t = await getMessages(publicBoardMessages);
  const page = await getMessages(scrimsPageMessages);
  const board = await getPublicBoard({
    date: single(params.datum) ?? null,
    ranks: readBoardRanks(params.rang),
    leagues: readLeagues(params.liga),
    ...readCheckboxFilters(params),
    now: new Date(),
  });
  const filtered = isBoardFiltered(board.filter);
  const createAccount = (
    <Link
      href={`/register?callbackURL=${encodeURIComponent(AFTER_SIGN_IN)}`}
      className={buttonVariants({ className: "max-sm:w-full" })}
    >
      {t.createAccount}
    </Link>
  );

  return (
    <PageMain className="gap-6">
      <div className="flex flex-col gap-2.5">
        <h1 className="type-h1">{t.title}</h1>
        <p className="text-pretty text-muted-foreground">{t.lead}</p>
        <div className="mt-1.5 flex flex-wrap gap-3">
          {createAccount}
          <Link
            href={loginUrl(AFTER_SIGN_IN)}
            className={buttonVariants({ variant: "outline", className: "max-sm:w-full" })}
          >
            {t.signIn}
          </Link>
        </div>
      </div>

      <BoardFilterForm filter={board.filter} leagueOptions={board.leagueOptions} action="/board" />

      {/* Teams ready to play today (SPEC N-27); signed out, the cards lead to the login. */}
      <ReadyWindowList
        windows={board.readyWindows}
        actingTeamId={null}
        signedIn={false}
        columns="grid grid-cols-1"
      />

      {board.requests.length === 0 ? (
        <EmptyState
          icon={<CalendarIcon size={26} strokeWidth={1.8} />}
          title={filtered ? page.noMatchingRequests : page.noOpenRequests}
          action={createAccount}
        >
          {/* Not "be the first" right below teams that are ready today (SPEC N-27). */}
          {filtered
            ? t.noRequestsForFilter
            : board.readyWindows.length > 0
              ? page.noRequestsBesideReady
              : t.beFirstTeam}
        </EmptyState>
      ) : (
        // One card per row: the column of signed-out pages is too narrow for two (§5.26).
        <BoardRequestList requests={board.requests} columns="grid grid-cols-1" />
      )}
    </PageMain>
  );
}
