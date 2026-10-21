import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { Prisma, Rank, prisma } from "../src/index.ts";

afterAll(async () => {
  await prisma.$disconnect();
});

describe("prisma client", () => {
  it("runs against the test database", async () => {
    const [row] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
    expect(row?.db).toBe(new URL(process.env.DATABASE_URL_TEST!).pathname.slice(1));
  });

  it("enforces the case-insensitive team name via nameNormalized", async () => {
    // Unique per run: the test DB is only reset once per `vitest` process (watch mode re-runs).
    const suffix = randomUUID();
    const captain = await prisma.user.create({
      data: { id: suffix, name: "Captain", email: `${suffix}@users.uniscrims.invalid` },
    });
    const createdAt = new Date("2026-01-01T12:00:00Z");
    const team = { tag: "TST", rank: Rank.GOLD, captainId: captain.id, createdAt };
    const nameNormalized = `test-${suffix}`;
    await prisma.team.create({ data: { ...team, name: `Test-${suffix}`, nameNormalized } });

    await expect(
      prisma.team.create({ data: { ...team, name: `TEST-${suffix}`, nameNormalized } }),
    ).rejects.toSatisfy(
      (error) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002",
    );
  });
});
