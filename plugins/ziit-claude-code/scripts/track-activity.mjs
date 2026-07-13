import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { basename, extname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync, spawn } from "node:child_process";

const CONFIG_DIR = resolve(process.env.XDG_CONFIG_HOME || resolve(homedir(), ".config"), "ziit");
const CONFIG_FILE = resolve(CONFIG_DIR, "config.json");
const STATE_FILE = resolve(CONFIG_DIR, "claude_session_state.json");
const OFFLINE_FILE = resolve(CONFIG_DIR, "offline_heartbeats.json");
const LOG_FILE = resolve(CONFIG_DIR, "claude-code.log");
const LOCK_DIR = resolve(CONFIG_DIR, "claude-heartbeat.lock");
const HEARTBEAT_INTERVAL_MS = 60_000;
const FETCH_TIMEOUT_MS = 5_000;
const MAX_SESSIONS = 100;
const STALE_LOCK_MS = 30_000;

const LANGUAGE_BY_EXTENSION = new Map([
  [".ts", "typescript"], [".tsx", "typescript"], [".js", "javascript"],
  [".jsx", "javascript"], [".mjs", "javascript"], [".cjs", "javascript"],
  [".py", "python"], [".pyw", "python"], [".rs", "rust"], [".go", "go"],
  [".rb", "ruby"], [".java", "java"], [".kt", "kotlin"], [".kts", "kotlin"],
  [".swift", "swift"], [".c", "c"], [".cpp", "cpp"], [".cc", "cpp"],
  [".cxx", "cpp"], [".hpp", "cpp"], [".h", "c"], [".cs", "csharp"],
  [".php", "php"], [".sh", "shell"], [".bash", "shell"], [".zsh", "shell"],
  [".sql", "sql"], [".html", "html"], [".htm", "html"], [".css", "css"],
  [".scss", "css"], [".sass", "css"], [".less", "css"], [".json", "json"],
  [".yaml", "yaml"], [".yml", "yaml"], [".xml", "xml"], [".md", "markdown"],
  [".markdown", "markdown"], [".vue", "vue"], [".svelte", "svelte"],
  [".astro", "astro"], [".prisma", "prisma"], [".graphql", "graphql"],
  [".gql", "graphql"], [".toml", "toml"], [".ini", "ini"], [".cfg", "ini"],
]);

function sleep(milliseconds) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(path, value) {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function log(message) {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(LOG_FILE, `[${new Date().toISOString()}] ${message}\n`, { flag: "a" });
}

async function withLock(action) {
  await mkdir(CONFIG_DIR, { recursive: true });
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      await mkdir(LOCK_DIR);
      try {
        return await action();
      } finally {
        await rm(LOCK_DIR, { recursive: true, force: true });
      }
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      try {
        const lockStat = await stat(LOCK_DIR);
        if (Date.now() - lockStat.mtimeMs > STALE_LOCK_MS) {
          await rm(LOCK_DIR, { recursive: true, force: true });
          continue;
        }
      } catch (lockError) {
        if (lockError?.code !== "ENOENT") throw lockError;
      }
      await sleep(25);
    }
  }
  throw new Error("Timed out waiting for Claude heartbeat state lock");
}

function detectOs() {
  const current = platform();
  if (current === "darwin") return "macOS";
  if (current === "win32") return "Windows";
  if (current === "linux") return "Linux";
  return "Unknown";
}

function runGit(cwd, args) {
  try {
    return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function detectProject(cwd) {
  const remote = runGit(cwd, ["remote", "get-url", "origin"]);
  if (remote) return basename(remote.replace(/\.git$/, "").replace(/\/$/, ""));
  return basename(cwd) || cwd;
}

function detectLanguage(file) {
  if (basename(file).toLowerCase() === "dockerfile") return "dockerfile";
  return LANGUAGE_BY_EXTENSION.get(extname(file).toLowerCase()) || "unknown";
}

function eventFile(event, currentFile) {
  const input = event.tool_input;
  if (!input || typeof input !== "object") return currentFile;
  const candidate = input.file_path ?? input.filePath ?? input.notebook_path;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : currentFile;
}

function heartbeatFactory(file, cwd) {
  const branch = runGit(cwd, ["branch", "--show-current"]);
  const metadata = {
    project: detectProject(cwd),
    language: detectLanguage(file),
    editor: "Claude Code",
    os: detectOs(),
    file,
    ...(branch ? { branch } : {}),
  };
  return (timestamp) => ({
    timestamp: new Date(timestamp).toISOString(),
    ...metadata,
  });
}

function heartbeatTimes(start, lastHeartbeat, now, includeBoundary) {
  const times = [];
  let cursor = lastHeartbeat ?? start;
  if (lastHeartbeat === null) times.push(start);
  while (cursor + HEARTBEAT_INTERVAL_MS <= now) {
    cursor += HEARTBEAT_INTERVAL_MS;
    times.push(cursor);
  }
  if (includeBoundary && times.at(-1) !== now) times.push(now);
  return times;
}

export function planHeartbeats(event, state, now = Date.now()) {
  const sessionId = String(event.session_id || "default");
  const cwd = String(event.cwd || process.cwd());
  const current = state.sessions?.[sessionId] ?? {
    active: false,
    cwd,
    file: null,
    activeSince: null,
    lastHeartbeatAt: null,
    updatedAt: now,
  };
  current.cwd = cwd;
  current.file = eventFile(event, current.file);
  const eventName = String(event.hook_event_name || "");
  const makeHeartbeat = heartbeatFactory(current.file || cwd, cwd);
  const payloads = [];

  if (eventName === "SessionStart") {
    current.active = false;
    current.activeSince = null;
    current.lastHeartbeatAt = null;
  } else if (eventName === "UserPromptSubmit") {
    current.active = true;
    current.activeSince = now;
    current.lastHeartbeatAt = null;
    payloads.push(makeHeartbeat(now));
    current.lastHeartbeatAt = now;
  } else if (eventName === "PreToolUse") {
    if (!current.active) {
      current.active = true;
      current.activeSince = now;
      current.lastHeartbeatAt = null;
    }
    if (current.lastHeartbeatAt === null) {
      payloads.push(makeHeartbeat(now));
      current.activeSince = now;
      current.lastHeartbeatAt = now;
    } else {
      const times = heartbeatTimes(
        current.activeSince,
        current.lastHeartbeatAt,
        now,
        false,
      );
      payloads.push(...times.map(makeHeartbeat));
      if (times.length > 0) current.lastHeartbeatAt = times.at(-1);
    }
  } else if (
    current.active &&
    [
      "PostToolUse",
      "PostToolUseFailure",
      "PreCompact",
      "SubagentStop",
      "Stop",
      "SessionEnd",
    ].includes(eventName)
  ) {
    const closesTurn = eventName === "Stop" || eventName === "SessionEnd";
    const times = heartbeatTimes(
      current.activeSince,
      current.lastHeartbeatAt,
      now,
      closesTurn,
    );
    payloads.push(...times.map(makeHeartbeat));
    if (times.length > 0) current.lastHeartbeatAt = times.at(-1);
    if (eventName === "Stop" || eventName === "SessionEnd") {
      current.active = false;
      current.activeSince = null;
      current.lastHeartbeatAt = null;
    }
  }

  current.updatedAt = now;
  const sessions = { ...(state.sessions || {}), [sessionId]: current };
  const pruned = Object.fromEntries(
    Object.entries(sessions)
      .sort(([, left], [, right]) => right.updatedAt - left.updatedAt)
      .slice(0, MAX_SESSIONS),
  );
  return { state: { sessions: pruned }, payloads };
}

async function postJson(url, apiKey, payload) {
  if (process.env.ZIIT_TEST_MODE === "1") return true;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function enqueue(payloads) {
  if (payloads.length === 0) return;
  await withLock(async () => {
    const offline = await readJson(OFFLINE_FILE, []);
    await writeJson(OFFLINE_FILE, [...offline, ...payloads]);
  });
}

async function flush(config) {
  const pending = await withLock(async () => {
    const offline = await readJson(OFFLINE_FILE, []);
    if (offline.length > 0) await writeJson(OFFLINE_FILE, []);
    return offline;
  });
  if (pending.length === 0) return;
  const sent = await postJson(
    `${config.baseUrl}/api/external/batch`,
    config.apiKey,
    pending,
  );
  if (!sent) await enqueue(pending);
}

async function loadConfig() {
  const config = await readJson(CONFIG_FILE, null);
  if (!config?.apiKey) return null;
  config.baseUrl = String(config.baseUrl || "https://ziit.app").replace(/\/+$/, "");
  return config;
}

async function main() {
  const config = await loadConfig();
  if (!config) return;
  if (process.argv.includes("--flush")) {
    await flush(config);
    return;
  }
  const input = await new Promise((resolveInput) => {
    let raw = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { raw += chunk; });
    process.stdin.on("end", () => resolveInput(raw));
  });
  const event = JSON.parse(input || "{}");
  let payloads = [];
  await withLock(async () => {
    const state = await readJson(STATE_FILE, { sessions: {} });
    const planned = planHeartbeats(event, state);
    payloads = planned.payloads;
    const offline = await readJson(OFFLINE_FILE, []);
    await writeJson(STATE_FILE, planned.state);
    if (payloads.length > 0) await writeJson(OFFLINE_FILE, [...offline, ...payloads]);
  });
  if (process.env.ZIIT_TEST_MODE === "1") {
    process.stdout.write(`${JSON.stringify(payloads)}\n`);
    return;
  }
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "--flush"], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => log(error instanceof Error ? error.stack || error.message : String(error)));
}
