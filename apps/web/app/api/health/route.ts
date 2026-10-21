import { prisma } from "@uni-scrims/db";

// Liveness for the Docker healthcheck (ARCHITECTURE §8); also proves the Prisma client works in standalone.
export async function GET(): Promise<Response> {
  try {
    await prisma.university.count();
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Health check failed", error);
    return Response.json({ ok: false }, { status: 503 });
  }
}
