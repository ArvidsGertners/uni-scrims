// Idempotent dev seed: universities and two fully verified test teams (5 verified users each).
// With --universities-only (production) just the university list.
import { randomBytes } from "node:crypto";
import path from "node:path";
import { config } from "dotenv";
import { MemberRole, prisma, Rank } from "../src/index.ts";
import { universities } from "./seed-data/universities.ts";

// As in prisma.config.ts: `seed:universities` runs this file without the Prisma CLI, so the monorepo
// .env is loaded here too. Variables already set (Docker, `prisma db seed`) take precedence; the
// client is only created on first use, after this.
config({ path: path.resolve(import.meta.dirname, "../../../.env"), quiet: true });

type SeedTeam = {
  id: string;
  name: string;
  tag: string;
  /** The members' own ranks; the team rank is computed from them (Phase 20). */
  memberRanks: Rank[];
  universitySlug: string;
  discordIdPrefix: string;
};

const seedTeams: SeedTeam[] = [
  {
    id: "seed-team-alpha",
    name: "Seed Team Alpha",
    tag: "ALPH",
    // Average Gold.
    memberRanks: [Rank.GOLD, Rank.GOLD, Rank.SILVER, Rank.PLATINUM, Rank.GOLD],
    universitySlug: "dhbw-stuttgart",
    discordIdPrefix: "10000000000000000",
  },
  {
    id: "seed-team-beta",
    name: "Seed Team Beta",
    tag: "BETA",
    // Average Platinum.
    memberRanks: [Rank.PLATINUM, Rank.DIAMOND, Rank.PLATINUM, Rank.GOLD, Rank.PLATINUM],
    universitySlug: "kit-karlsruhe",
    discordIdPrefix: "20000000000000000",
  },
];

const MEMBERS_PER_TEAM = 5;

function inviteCode(): string {
  // 9 random bytes → 12 URL-safe base64 characters.
  return randomBytes(9).toString("base64url");
}

async function seedUniversities(): Promise<void> {
  for (const uni of universities) {
    await prisma.university.upsert({
      where: { slug: uni.slug },
      create: uni,
      update: { name: uni.name, city: uni.city },
    });
  }
}

async function seedTeam(team: SeedTeam, now: Date): Promise<void> {
  const university = await prisma.university.findUniqueOrThrow({
    where: { slug: team.universitySlug },
  });

  const userIds: string[] = [];
  for (let i = 1; i <= MEMBERS_PER_TEAM; i++) {
    const userId = `${team.id}-user-${i}`;
    // Invented Discord IDs; DMs to them are redirected via DEV_DM_REDIRECT_DISCORD_ID.
    const discordId = `${team.discordIdPrefix}${i}`;
    // Complete accounts (ARCHITECTURE §5.8), also for seed users created before Phase 7.
    const account = {
      firstName: "Seed",
      lastName: `${team.tag} ${i}`,
      email: `${userId}@seed.uniscrims.invalid`,
      emailVerified: true,
      rank: team.memberRanks[i - 1] ?? null,
    };
    await prisma.user.upsert({
      where: { id: userId },
      create: {
        id: userId,
        name: `${team.tag} Spieler ${i}`,
        ...account,
        universityId: university.id,
        verifiedAt: now,
      },
      update: account,
    });
    await prisma.account.upsert({
      where: { id: `${userId}-discord` },
      create: {
        id: `${userId}-discord`,
        userId,
        providerId: "discord",
        accountId: discordId,
      },
      update: {},
    });
    userIds.push(userId);
  }

  const captainId = userIds[0]!;
  await prisma.team.upsert({
    where: { id: team.id },
    create: {
      id: team.id,
      name: team.name,
      nameNormalized: team.name.trim().toLowerCase(),
      tag: team.tag,
      captainId,
      createdAt: now,
      inviteCode: inviteCode(),
    },
    update: {},
  });

  for (const userId of userIds) {
    await prisma.teamMember.upsert({
      where: { teamId_userId: { teamId: team.id, userId } },
      create: { teamId: team.id, userId, joinedAt: now },
      update: {},
    });
  }
}

async function main(): Promise<void> {
  const now = new Date();
  await seedUniversities();
  if (process.argv.includes("--universities-only")) {
    console.log(`Seed fertig: ${universities.length} Hochschulen.`);
    return;
  }
  for (const team of seedTeams) {
    await seedTeam(team, now);
  }
  // Phase 21 (§5.20): a member of two teams, as coach in the second, so Beta's badge stays (SPEC N-21).
  const twoTeams = { teamId: "seed-team-beta", userId: "seed-team-alpha-user-2" };
  await prisma.teamMember.upsert({
    where: { teamId_userId: twoTeams },
    create: { ...twoTeams, role: MemberRole.COACH, joinedAt: now },
    update: {},
  });
  console.log(
    `Seed fertig: ${universities.length} Hochschulen, ${seedTeams.length} Teams à ${MEMBERS_PER_TEAM} Spieler.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
