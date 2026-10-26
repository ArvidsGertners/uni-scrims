// Texts of the teams list (§5.21, SPEC N-20): /teams.
import { dictionary } from "@uni-scrims/core/config/locale";

export const teamsPageMessages = dictionary(
  {
    title: "Teams",
    teamCount: (count: number) => (count === 1 ? "1 Team" : `${count} Teams`),
    search: "Suche",
    searchPlaceholder: "Team, Kürzel oder Hochschule",
    teamRank: "Team-Rang",
    filter: "Filtern",
    reset: "Zurücksetzen",
    members: "Mitglieder",
    captain: "Captain",
    noTeams: "Noch keine Teams",
    noTeamsText: "Sobald Teams gegründet sind, stehen sie hier.",
    noMatches: "Keine passenden Teams",
    noMatchesText:
      "Für diese Suche oder diesen Rang gibt es keine Teams. Probier einen anderen Filter.",
  },
  {
    title: "Teams",
    teamCount: (count) => (count === 1 ? "1 team" : `${count} teams`),
    search: "Search",
    searchPlaceholder: "Team, tag or university",
    teamRank: "Team rank",
    filter: "Filter",
    reset: "Reset",
    members: "Members",
    captain: "Captain",
    noTeams: "No teams yet",
    noTeamsText: "Teams show up here as soon as they are created.",
    noMatches: "No matching teams",
    noMatchesText: "No teams match this search or rank. Try another filter.",
  },
);
