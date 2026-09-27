import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm, writeFile, chmod } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  detectProject,
  enqueueOffline,
  loadOfflineQueue,
  syncOfflineQueue,
} from "../dist/index.js";

const PLATFORM = "coretest";
const noopLogger = () => {};

function heartbeat(file) {
  return {
    timestamp: new Date().toISOString(),
    project: "demo",
    language: "typescript",
    editor: "Test",
    os: "Linux",
    file,
  };
}

async function seedQueue(entries) {
  const dir = join(process.env.HOME, ".config", "ziit");
  await writeFile(
    join(dir, `offline_${PLATFORM}_heartbeats.json`),
    JSON.stringify(entries),
    "utf-8",
  );
}

async function startServer(handler) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server;
}

test("detectProject falls back quickly when git hangs", async () => {
  const bin = await mkdtemp(join(tmpdir(), "ziit-git-shim-"));
  await writeFile(join(bin, "git"), "#!/bin/sh\nsleep 5\n", "utf-8");
  await chmod(join(bin, "git"), 0o755);
  const originalPath = process.env.PATH;
  process.env.PATH = `${bin}:${originalPath}`;
  try {
    const started = Date.now();
    const project = detectProject("/tmp");
    const elapsed = Date.now() - started;
    assert.equal(project, "tmp");
    assert.ok(elapsed < 3000, `took ${elapsed}ms`);
  } finally {
    process.env.PATH = originalPath;
    await rm(bin, { recursive: true, force: true });
  }
});

test("enqueueOffline drops heartbeats with oversized file field", async () => {
  await seedQueue([]);
  const valid = heartbeat("/tmp/example.ts");
  await enqueueOffline(valid, PLATFORM, noopLogger);
  await enqueueOffline(heartbeat(`/tmp/${"a".repeat(300)}.ts`), PLATFORM, noopLogger);
  const queue = await loadOfflineQueue(PLATFORM);
  assert.deepEqual(queue, [valid]);
});

test("enqueueOffline caps the queue and keeps newest entries", async () => {
  const existing = Array.from({ length: 4999 }, (_, index) =>
    heartbeat(`/tmp/old-${index}.ts`),
  );
  await seedQueue(existing);
  await enqueueOffline(heartbeat("/tmp/new-1.ts"), PLATFORM, noopLogger);
  await enqueueOffline(heartbeat("/tmp/new-2.ts"), PLATFORM, noopLogger);
  const queue = await loadOfflineQueue(PLATFORM);
  assert.equal(queue.length, 5000);
  assert.equal(queue.at(-1).file, "/tmp/new-2.ts");
  assert.equal(queue.at(-2).file, "/tmp/new-1.ts");
  assert.equal(queue[0].file, "/tmp/old-1.ts");
});

test("syncOfflineQueue uploads in chunks and clears the queue", async () => {
  const batchSizes = [];
  const server = await startServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      batchSizes.push(JSON.parse(body).length);
      res.writeHead(200).end("{}");
    });
  });
  try {
    const entries = Array.from({ length: 1200 }, (_, index) =>
      heartbeat(`/tmp/sync-${index}.ts`),
    );
    await seedQueue(entries);
    await syncOfflineQueue(
      { apiKey: "k", baseUrl: `http://127.0.0.1:${server.address().port}` },
      PLATFORM,
      noopLogger,
    );
    assert.deepEqual(batchSizes, [500, 500, 200]);
    assert.deepEqual(await loadOfflineQueue(PLATFORM), []);
  } finally {
    server.close();
  }
});

test("syncOfflineQueue keeps unsent entries after a failed chunk", async () => {
  let calls = 0;
  const server = await startServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      calls += 1;
      res.writeHead(calls <= 1 ? 200 : 500).end("{}");
    });
  });
  try {
    const entries = Array.from({ length: 1200 }, (_, index) =>
      heartbeat(`/tmp/sync-${index}.ts`),
    );
    await seedQueue(entries);
    await syncOfflineQueue(
      { apiKey: "k", baseUrl: `http://127.0.0.1:${server.address().port}` },
      PLATFORM,
      noopLogger,
    );
    const queue = await loadOfflineQueue(PLATFORM);
    assert.equal(queue.length, 700);
    assert.equal(queue[0].file, "/tmp/sync-500.ts");
  } finally {
    server.close();
  }
});

test.after(async () => {
  await rm(
    join(process.env.HOME, ".config", "ziit", `offline_${PLATFORM}_heartbeats.json`),
    { force: true },
  );
});
