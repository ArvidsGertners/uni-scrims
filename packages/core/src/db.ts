import type { Prisma, PrismaClient } from "@uni-scrims/db";

// Either the shared client or the client of an interactive transaction.
export type Db = PrismaClient | Prisma.TransactionClient;
