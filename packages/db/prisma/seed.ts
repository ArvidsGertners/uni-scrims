// Idempotent dev seed: universities and two ready-to-play test teams (5 verified users each).
// With --universities-only (production) just the university list.
import { randomBytes } from "node:crypto";
import { prisma, Rank } from "../src/index.ts";
import { universities } from "./seed-data/universities.ts";

type SeedTeam = {
  id: string;
  name: string;
  tag: string;
  rank: Rank;
  universitySlug: string;
  discordIdPrefix: string;
};

const seedTeams: SeedTeam[] = [
  {
    id: "seed-team-alpha",
    name: "Seed Team Alpha",
    tag: "ALPH",
    rank: Rank.GOLD,
    universitySlug: "dhbw-stuttgart",
    discordIdPrefix: "10000000000000000",
  },
  {
    id: "seed-team-beta",
    name: "Seed Team Beta",
    tag: "BETA",
    rank: Rank.PLATINUM,
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
    await prisma.user.upsert({
      where: { id: userId },
      create: {
        id: userId,
        name: `${team.tag} Spieler ${i}`,
        email: `${discordId}@users.uniscrims.invalid`,
        universityId: university.id,
        verifiedAt: now,
      },
      update: {},
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
      rank: team.rank,
      captainId,
      createdAt: now,
      inviteCode: inviteCode(),
    },
    update: {},
  });

  for (const userId of userIds) {
    await prisma.teamMember.upsert({
      where: { userId },
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
