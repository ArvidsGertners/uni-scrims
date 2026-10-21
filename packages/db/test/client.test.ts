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
    const captain = await prisma.user.create({
      data: { id: "test-captain", name: "Captain", email: "1@users.uniscrims.invalid" },
    });
    const team = { tag: "TST", rank: Rank.GOLD, captainId: captain.id };
    await prisma.team.create({ data: { ...team, name: "Test", nameNormalized: "test" } });

    await expect(
      prisma.team.create({ data: { ...team, name: "TEST", nameNormalized: "test" } }),
    ).rejects.toSatisfy(
      (error) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002",
    );
  });
});
