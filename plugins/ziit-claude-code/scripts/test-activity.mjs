import { planHeartbeats } from "./track-activity.mjs";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cwd = process.cwd();
const file = `${cwd}/plugins/ziit-claude-code/scripts/track-activity.mjs`;
const base = Date.UTC(2026, 6, 13, 10, 0, 0);
let state = { sessions: {} };

let result = planHeartbeats(
  { hook_event_name: "UserPromptSubmit", session_id: "s1", cwd },
  state,
  base,
);
state = result.state;
if (result.payloads.length !== 1) throw new Error("Prompt missed project heartbeat");
if (result.payloads[0].file !== cwd) throw new Error("Prompt fallback did not use project directory");

result = planHeartbeats(
  {
    hook_event_name: "PreToolUse",
    session_id: "s1",
    cwd,
    tool_name: "Read",
    tool_input: { file_path: file },
  },
  state,
  base + 10_000,
);
state = result.state;
if (result.payloads.length !== 0) throw new Error("First file switch duplicated prompt time");

result = planHeartbeats(
  {
    hook_event_name: "PostToolUse",
    session_id: "s1",
    cwd,
    tool_name: "Read",
    tool_input: { file_path: file },
  },
  state,
  base + 12 * 60_000 + 10_000,
);
state = result.state;
if (result.payloads.length !== 12) throw new Error(`Expected twelve minute fills, got ${result.payloads.length}`);
if (result.payloads.some((payload) => payload.file !== file)) throw new Error("File heartbeats did not switch to the real file");

result = planHeartbeats(
  { hook_event_name: "Stop", session_id: "s1", cwd },
  state,
  base + 12 * 60_000 + 40_000,
);
state = result.state;
if (result.payloads.length !== 1) throw new Error("Stop missed the final boundary");

result = planHeartbeats(
  { hook_event_name: "PostToolUse", session_id: "s1", cwd },
  state,
  base + 13 * 60_000,
);
if (result.payloads.length !== 0) throw new Error("Late tool event reopened a stopped turn");

result = planHeartbeats(
  { hook_event_name: "UserPromptSubmit", session_id: "s1", cwd },
  result.state,
  base + 33 * 60_000,
);
if (result.payloads.length !== 1) throw new Error("New turn did not start with current file");
if (Date.parse(result.payloads[0].timestamp) !== base + 33 * 60_000) throw new Error("Idle time was backfilled");

process.stdout.write("Claude cadence and idle boundaries passed\n");

const shimDir = mkdtempSync(join(tmpdir(), "ziit-claude-git-shim-"));
writeFileSync(join(shimDir, "git"), "#!/bin/sh\nsleep 5\n");
chmodSync(join(shimDir, "git"), 0o755);
const originalPath = process.env.PATH;
process.env.PATH = `${shimDir}:${originalPath}`;
const gitStart = Date.now();
planHeartbeats(
  { hook_event_name: "UserPromptSubmit", session_id: "git-timeout", cwd },
  { sessions: {} },
  base + 40 * 60_000,
);
const gitElapsed = Date.now() - gitStart;
process.env.PATH = originalPath;
rmSync(shimDir, { recursive: true, force: true });
if (gitElapsed >= 5000) throw new Error(`runGit blocked for ${gitElapsed}ms`);

const configHome = mkdtempSync(join(tmpdir(), "ziit-claude-config-"));
process.env.XDG_CONFIG_HOME = configHome;
const queueModule = await import("./track-activity.mjs?queue-tests");
const offlineFile = join(configHome, "ziit", "offline_heartbeats.json");
const readQueue = () => {
  try {
    return JSON.parse(readFileSync(offlineFile, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
};
const heartbeat = (file) => ({
  timestamp: new Date().toISOString(),
  project: "demo",
  language: "python",
  editor: "Claude Code",
  os: "Linux",
  file,
});

await queueModule.enqueue([heartbeat(`/tmp/${"a".repeat(300)}.py`)]);
if (readQueue().length !== 0) throw new Error("Oversized file heartbeat was not dropped");
await queueModule.enqueue([heartbeat("/tmp/example.py")]);
await queueModule.enqueue([{ ...heartbeat("/tmp/legacy.py"), branch: null }]);
if (readQueue().length !== 1) throw new Error("Null-branch heartbeat was not dropped");
if (readQueue().length !== 1) throw new Error("Valid heartbeat was not queued");

mkdirSync(join(configHome, "ziit"), { recursive: true });
writeFileSync(
  offlineFile,
  JSON.stringify(Array.from({ length: 4999 }, (_, index) => heartbeat(`/tmp/old-${index}.py`))),
);
await queueModule.enqueue([heartbeat("/tmp/new-1.py"), heartbeat("/tmp/new-2.py")]);
const capped = readQueue();
if (capped.length !== 5000) throw new Error(`Queue was not capped, size ${capped.length}`);
if (capped.at(-1).file !== "/tmp/new-2.py") throw new Error("Queue cap did not keep newest entries");
if (capped[0].file !== "/tmp/old-1.py") throw new Error("Queue cap did not drop oldest entries");

const batchSizes = [];
const server = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    batchSizes.push(JSON.parse(body).length);
    res.writeHead(200).end("{}");
  });
});
await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
writeFileSync(
  offlineFile,
  JSON.stringify(Array.from({ length: 1200 }, (_, index) => heartbeat(`/tmp/sync-${index}.py`))),
);
await queueModule.flush({ apiKey: "k", baseUrl: `http://127.0.0.1:${server.address().port}` });
server.close();
if (JSON.stringify(batchSizes) !== JSON.stringify([500, 500, 200])) {
  throw new Error(`Unexpected chunk sizes ${JSON.stringify(batchSizes)}`);
}
if (readQueue().length !== 0) throw new Error("Queue was not cleared after sync");

rmSync(configHome, { recursive: true, force: true });

process.stdout.write("Claude queue and git resilience passed\n");
