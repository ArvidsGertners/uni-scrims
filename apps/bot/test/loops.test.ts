import type { Deliver, OutboxMessage } from "@uni-scrims/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HEARTBEAT_INTERVAL_MS,
  type OutboxDeps,
  createHeartbeat,
  outboxTick,
} from "../src/outbox/loop.ts";
import {
  PURGE_INTERVAL_MS,
  type SweeperDeps,
  createPurgeSchedule,
  sweeperTick,
} from "../src/sweeper/loop.ts";

const START = new Date("2026-10-21T12:00:00Z");
const SECOND = 1000;

/** A clock that the test moves forward. */
function testClock() {
  let now = START.getTime();
  return {
    clock: () => new Date(now),
    advance: (ms: number) => {
      now += ms;
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("outbox loop (§6.3)", () => {
  function outboxDeps(clock: () => Date, beats: Date[]): OutboxDeps {
    return {
      clock,
      recordHeartbeat: async (loop, at) => {
        expect(loop).toBe("outbox");
        beats.push(at);
      },
      deliverDueNotifications: async () => ({ SENT: 0, CANCELLED: 0, FAILED: 0, RETRY: 0 }),
    };
  }

  it("writes the heartbeat at most once a minute and retries a failed write", async () => {
    const { clock, advance } = testClock();
    const beats: Date[] = [];
    let failNext = false;
    const deps = outboxDeps(clock, beats);
    const heartbeat = createHeartbeat({
      ...deps,
      recordHeartbeat: async (loop, at) => {
        if (failNext) throw new Error("db down");
        await deps.recordHeartbeat(loop, at);
      },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    await heartbeat();
    advance(HEARTBEAT_INTERVAL_MS - SECOND);
    await heartbeat();
    advance(SECOND);
    failNext = true;
    await heartbeat();
    failNext = false;
    advance(SECOND);
    await heartbeat();

    expect(beats).toEqual([START, new Date(START.getTime() + HEARTBEAT_INTERVAL_MS + SECOND)]);
  });

  it("writes the heartbeat after each message of a long run and after the run", async () => {
    const { clock, advance } = testClock();
    const beats: Date[] = [];
    const deps = outboxDeps(clock, beats);
    // Three messages, each slowed down by rate limits for 70 s.
    deps.deliverDueNotifications = async (_now, deliver) => {
      for (let i = 0; i < 3; i++) {
        advance(70 * SECOND);
        await deliver({ id: `n${i}` } as OutboxMessage);
      }
      return { SENT: 3, CANCELLED: 0, FAILED: 0, RETRY: 0 };
    };
    const deliver: Deliver = async () => ({ ok: true });
    vi.spyOn(console, "log").mockImplementation(() => {});

    await outboxTick(deliver, createHeartbeat(deps), deps);

    // After each message (more than a minute apart); the one after the run is throttled.
    expect(beats).toEqual([70, 140, 210].map((s) => new Date(START.getTime() + s * SECOND)));
  });

  it("writes the heartbeat even when the run fails", async () => {
    const { clock } = testClock();
    const beats: Date[] = [];
    const deps = outboxDeps(clock, beats);
    deps.deliverDueNotifications = async () => {
      throw new Error("db down");
    };
    vi.spyOn(console, "error").mockImplementation(() => {});

    await outboxTick(async () => ({ ok: true }), createHeartbeat(deps), deps);

    expect(beats).toEqual([START]);
  });
});

describe("sweeper loop (§6.3)", () => {
  type Result = Awaited<ReturnType<SweeperDeps["runSweeper"]>>;
  const result = (purgedNotifications: number | null): Result => ({
    expiredRequests: 0,
    openedFeedback: 0,
    resolvedScrims: 0,
    finishedDeletions: 0,
    purgedSessions: 0,
    clearedTokens: 0,
    purgedNotifications,
  });

  function sweeperDeps(clock: () => Date, advance: (ms: number) => void) {
    const runs: { now: Date; purge: boolean }[] = [];
    const beats: Date[] = [];
    let purgeFails = false;
    const deps: SweeperDeps = {
      clock,
      runSweeper: async (now, { purge }) => {
        runs.push({ now, purge });
        advance(20 * SECOND);
        return result(purge ? (purgeFails ? null : 0) : null);
      },
      recordHeartbeat: async (loop, at) => {
        expect(loop).toBe("sweeper");
        beats.push(at);
      },
    };
    return {
      deps,
      runs,
      beats,
      failPurge: (fails: boolean) => {
        purgeFails = fails;
      },
    };
  }

  it("writes the heartbeat with the time after the steps, also when they fail", async () => {
    const { clock, advance } = testClock();
    const { deps, beats } = sweeperDeps(clock, advance);
    const schedule = createPurgeSchedule();

    await sweeperTick(schedule, deps);
    vi.spyOn(console, "error").mockImplementation(() => {});
    await sweeperTick(schedule, {
      ...deps,
      runSweeper: async () => {
        advance(5 * SECOND);
        throw new Error("unexpected");
      },
    });

    expect(beats).toEqual([20, 25].map((s) => new Date(START.getTime() + s * SECOND)));
  });

  it("purges at the start, then hourly, and tries a failed purge again in the next run", async () => {
    const { clock, advance } = testClock();
    const { deps, runs, failPurge } = sweeperDeps(clock, advance);
    const schedule = createPurgeSchedule();

    await sweeperTick(schedule, deps); // start: purge
    advance(60 * SECOND);
    await sweeperTick(schedule, deps); // within the hour: no purge
    advance(PURGE_INTERVAL_MS);
    failPurge(true);
    await sweeperTick(schedule, deps); // due, but fails
    failPurge(false);
    advance(60 * SECOND);
    await sweeperTick(schedule, deps); // tried again
    advance(60 * SECOND);
    await sweeperTick(schedule, deps); // done for the next hour

    expect(runs.map((run) => run.purge)).toEqual([true, false, true, true, false]);
  });
});
