// docker/backup.sh against stubs (ARCHITECTURE §8 Backups): docker prints a fake dump or fails, gpg
// copies its input, and the external storage is a local directory (rsync copies locally then).
// Backups are named by their UTC time, so the tests create names relative to the real clock.
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT = path.resolve(import.meta.dirname, "../backup.sh");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

let dir: string;
let local: string;
let remote: string;
let stubs: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "uni-scrims-backup-"));
  local = path.join(dir, "local");
  remote = path.join(dir, "remote");
  stubs = path.join(dir, "bin");
  await mkdir(local);
  await mkdir(remote);
  await mkdir(stubs);
  await stub("docker", '[ -n "$DUMP_FAILS" ] && exit 1\necho "fake dump"');
  // gpg ... --output <file>: copies stdin to the file.
  await stub(
    "gpg",
    'while [ "$#" -gt 0 ]; do [ "$1" = "--output" ] && out="$2"; shift; done\ncat > "$out"',
  );
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function stub(name: string, body: string) {
  const file = path.join(stubs, name);
  await writeFile(file, `#!/usr/bin/env bash\n${body}\n`);
  await chmod(file, 0o755);
}

/** The backup name for a time `ageMs` before now. */
function backupName(ageMs: number): string {
  const stamp = new Date(Date.now() - ageMs).toISOString().replace(/[-:]/g, "").slice(0, 15);
  return `uniscrims-${stamp}Z.dump.gpg`;
}

async function place(where: string, ...ages: number[]): Promise<string[]> {
  const names = ages.map(backupName);
  for (const name of names) await writeFile(path.join(where, name), "old backup");
  return names;
}

async function list(where: string): Promise<string[]> {
  return (await readdir(where)).sort();
}

function run(options: { dumpFails?: boolean; remote?: string } = {}) {
  const result = spawnSync("bash", [SCRIPT], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${stubs}:${process.env.PATH}`,
      BACKUP_GPG_RECIPIENT: "test",
      BACKUP_REMOTE: options.remote ?? remote,
      BACKUP_DIR: local,
      DUMP_FAILS: options.dumpFails ? "1" : "",
    },
  });
  return { status: result.status, stderr: result.stderr };
}

/** The backup the run itself created (the only name newer than an hour). */
async function created(where: string): Promise<string[]> {
  const recent = backupName(HOUR);
  return (await list(where)).filter((name) => name > recent);
}

describe("backup.sh", () => {
  it("keeps 14 days here and outside: the backup of 14 nights ago goes tonight", async () => {
    // 14 nights ago, but a few minutes less than 14 × 24 h (tonight's run started earlier).
    const ages = [15 * DAY, 14 * DAY - 10 * 60 * 1000, 13 * DAY, DAY];
    const [, , thirteen, one] = await place(local, ...ages);
    await place(remote, ...ages);

    expect(run().status).toBe(0);

    const [made] = await created(local);
    expect(made).toBeDefined();
    expect(await list(local)).toEqual([thirteen, one, made].sort());
    expect(await list(remote)).toEqual([thirteen, one, made].sort());
  });

  it("removes old backups here and outside when the dump fails, and exits with an error", async () => {
    const ages = [15 * DAY, 14 * DAY - 10 * 60 * 1000, 2 * DAY, DAY];
    const [, , two, one] = await place(local, ...ages);
    await place(remote, ...ages);

    const { status, stderr } = run({ dumpFails: true });

    expect(status).toBe(1);
    expect(stderr).toContain(`the newest one (${one}) is kept`);
    expect(await list(local)).toEqual([two, one]);
    expect(await list(remote)).toEqual([two, one]);
  });

  it("keeps the newest backup when the dump keeps failing", async () => {
    const ages = [20 * DAY, 18 * DAY];
    const [, newest] = await place(local, ...ages);
    await place(remote, ...ages);

    expect(run({ dumpFails: true }).status).toBe(1);

    expect(await list(local)).toEqual([newest]);
    expect(await list(remote)).toEqual([newest]);

    // The next successful dump replaces it.
    expect(run().status).toBe(0);
    const [made] = await created(local);
    expect(await list(local)).toEqual([made]);
    expect(await list(remote)).toEqual([made]);
  });

  it("does not empty the external copy from a rebuilt server, but removes expired backups there", async () => {
    const [, three, one] = await place(remote, 20 * DAY, 3 * DAY, DAY);

    const { status, stderr } = run();

    expect(status).toBe(1);
    expect(stderr).toContain("2 external backups are missing here");
    expect(await list(remote)).toEqual([three, one]);
    // After copying them back, as the README says, the next run mirrors again.
    for (const name of [three!, one!]) await writeFile(path.join(local, name), "copied back");
    expect(run().status).toBe(0);
    expect(await list(remote)).toEqual(await list(local));
    expect(await list(remote)).toEqual(expect.arrayContaining([three, one]));
  });

  it("keeps the only, old external backup when nothing newer exists here", async () => {
    const [old] = await place(remote, 20 * DAY);

    expect(run({ dumpFails: true }).status).toBe(1);

    expect(await list(remote)).toEqual([old]);
    expect(await list(local)).toEqual([]);
  });

  it("replaces the only, old external backup once a newer one exists here", async () => {
    await place(remote, 20 * DAY);

    expect(run().status).toBe(0);

    const [made] = await created(local);
    expect(await list(remote)).toEqual([made]);
  });

  it("stops when the external storage cannot be listed", async () => {
    const [, one] = await place(local, 20 * DAY, DAY);

    const { status } = run({ remote: path.join(dir, "missing") });

    expect(status).not.toBe(0);
    // Pruned here before; the dump is kept.
    const [made] = await created(local);
    expect(await list(local)).toEqual([one, made].sort());
  });
});
