---
title: feat: Add pi.dev platform support with shared ziit-core library
type: feat
status: active
date: 2026-05-06
origin: docs/brainstorms/2026-05-06-pi-platform-requirements.md
---

# feat: Add pi.dev platform support with shared ziit-core library

## Overview

Add Ziit time-tracking support for pi (pi.dev), a minimal terminal-based coding agent with a TypeScript extension system. As a prerequisite, extract the heartbeat construction, config loading, rate-limiting, logging, and offline-queue logic from `ziit-opencode` into a new shared internal library (`packages/ziit-core`). Refactor `ziit-opencode` to consume the shared core, then build the pi plugin on the validated API surface. Establishes pnpm workspaces as the monorepo tool.

---

## Problem Frame

Ziit currently supports three platforms: Claude Code, Codex CLI, and OpenCode. Pi.dev is a growing coding agent with a TypeScript extension system that provides precise tool-event data (direct `event.input.path` from `read`/`write`/`edit` calls), making it an ideal target for accurate time tracking. Adding pi also creates a natural opportunity to eliminate significant code duplication between the TypeScript plugins by extracting shared logic into `ziit-core`.

---

## Requirements Trace

- R1. Heartbeat construction (OS, language, project, branch detection)
- R2. Heartbeat sending with offline queue (`sendHeartbeat`, `syncOfflineQueue`)
- R3. Config loading from `~/.config/ziit/config.json`
- R4. Per-file rate-limiting (45s cooldown)
- R5. Structured logger to `~/.config/ziit/<platform>.log`
- R6. Pi extension subscribing to `resources_discover`, `session_start`, `tool_call`, `tool_result`, `session_shutdown`
- R7. npm package `@arcat/ziit-pi` with pi package metadata
- R8. Editor name `"Pi"` in heartbeat payloads
- R9. Refactor `ziit-opencode` to depend on `ziit-core`
- R10. No regression in OpenCode heartbeat behavior

**Origin actors:** A1 (Developer using pi), A2 (Plugin maintainer)
**Origin flows:** F1 (File edit tracked via pi extension), F2 (File read tracked), F3 (Offline queue sync on session start/end), F4 (Installation via npm)

---

## Scope Boundaries

- `ziit-claude-code` and `ziit-codex` are not refactored — they are shell/Python-based
- `ziit-core` is internal to this monorepo, not published as a standalone npm package
- No Ziit dashboard or UI changes
- No pi `bash` tool tracking (bash commands are too ambiguous for reliable path extraction)

### Deferred to Follow-Up Work

- `docs/solutions/` documentation of the extracted architecture — separate PR
- Automated CI for cross-plugin testing — future iteration
- `opencode-mem` and `opencode-notifier` refactored into the workspace — separate PRs

---

## Context & Research

### Relevant Code and Patterns

- `plugins/ziit-opencode/src/index.ts` — heartbeat construction, config loading, rate-limiting, offline queue, OpenCode text-parsing heuristics (source for extraction into `ziit-core`)
- `plugins/ziit-opencode/src/plugin.ts` — OpenCode `PluginModule` entry pattern to follow for pi
- `plugins/ziit-opencode/package.json` — npm package structure with `"opencode"` manifest key (pi equivalent: `"pi"` key)
- `plugins/ziit-claude-code/scripts/track-activity.sh` — reference for cross-platform heartbeat consistency
- `opencode-notifier/src/` — reference OpenCode plugin with co-located tests (`*.test.ts`)

Pi extension API reference (from pi.dev docs):
- Extension entry: `export default function (pi: ExtensionAPI) { ... }`
- Events: `tool_call` (has `event.toolName`, `event.toolCallId`, `event.input.path`), `tool_result` (has `event.isError`), `session_start`, `session_shutdown`, `resources_discover` (has `event.cwd`)
- Extension placement: `~/.pi/agent/extensions/` (global) or `.pi/extensions/` (project-local)
- Pi package metadata: `{ "pi": { "extensions": ["./src/index.ts"] } }` in `package.json`
- Loading: jiti (TypeScript works without compilation for pi, but `tsc` compilation needed for npm publication)
- Pi install: `pi install npm:@arcat/ziit-pi` (uses `npm install --omit=dev`, so `ziit-core` must be bundled or listed as a production dependency)

### Institutional Learnings

- **Orphan handling:** The two-phase `tool_call` → `tool_result` design needs a TTL map (5-min eviction) to prevent memory leaks from orphaned `toolCallId` entries (captured in origin doc's Deferred / Open Questions)
- **Extraction sequencing:** Validating `ziit-core` against OpenCode first reduces the risk of a misaligned API surface — the core must bridge structured tool events (pi) and text-parsing heuristics (OpenCode)
- **Core should be thin and platform-agnostic:** Expose clean `filePath: string` in the heartbeat API; keep platform-specific extraction in adapters
- **Preserve existing file conventions:** `~/.config/ziit/config.json`, `offline_<platform>_heartbeats.json`, `<platform>.log` — changing these breaks existing installs

---

## Key Technical Decisions

- **pnpm workspaces as monorepo tool:** Minimal overhead, no new CLI dependency, `workspace:^` protocol for internal packages. Chosen over Turborepo (adds build orchestration we don't need yet) and raw relative paths (fragile for npm publication)
- **Validate `ziit-core` against OpenCode before building pi:** Reduces the misaligned-interface risk identified in review. The core's API must serve two different event models — validating against the existing consumer before the new one catches design errors early
- **`ziit-core` bundled at build time for pi distribution:** Since `pi install` uses `npm install --omit=dev`, `ziit-core` must be a production dependency of `ziit-pi`. Using `workspace:^` during development and `file:../ziit-core` for publication ensures both development and install-time resolution
- **Two-phase heartbeat with TTL eviction:** Capture paths on `tool_call`, send on `tool_result` (only when `!event.isError`), with a 5-minute TTL on the `toolCallId → path` map to handle orphaned entries from crashes or lost tool results
- **45-second rate limit cooldown:** Carried forward from existing plugins for API consistency

---

## Open Questions

### Resolved During Planning

- Monorepo tool: pnpm workspaces (decision above)
- Pi `package.json` `"pi"` field format: `{ "pi": { "extensions": ["./src/index.ts"] } }` (confirmed via pi docs)
- `tool_result` success detection: use `event.isError` from pi's tool_result event (confirmed via pi docs)
- `cwd` source: capture from `resources_discover` event at startup, fall back to `process.cwd()` (pi's tools resolve relative to `process.cwd()`)

### Deferred to Implementation

- Exact method/function names in `ziit-core` exports — settle during extraction from opencode source
- Whether `ziit-core` needs a test suite in v1 — depends on extraction complexity; at minimum the existing OpenCode behavior acts as an integration smoke test
- Session-state Map concurrency behavior in pi's parallel tool execution mode — pi's tool events may interleave; TTL-based design handles this without explicit locking

---

## Output Structure

```
packages/ziit-core/              # New shared library
├── src/
│   ├── index.ts                 # Public API exports
│   ├── config.ts                # loadConfig()
│   ├── heartbeat.ts             # createHeartbeat(), sendHeartbeat()
│   ├── rate-limit.ts            # Rate limiting utility
│   ├── queue.ts                 # Offline queue: syncOfflineQueue()
│   ├── logger.ts                # Structured logger
│   ├── git.ts                   # Project/branch detection
│   └── language.ts              # Language detection (30+ extensions)
├── package.json
└── tsconfig.json

plugins/ziit-pi/                 # New pi plugin
├── src/
│   ├── index.ts                 # Pi extension entry (tool_call/tool_result handlers)
│   └── plugin.ts                # Re-exports for npm module resolution
├── package.json
└── tsconfig.json

plugins/ziit-opencode/           # Refactored (existing, modified)
├── src/
│   ├── index.ts                 # Simplified: event adapter → ziit-core calls
│   └── plugin.ts                # Unchanged wrapper
├── package.json                 # Updated: depend on ziit-core
└── tsconfig.json                # Updated: reference ziit-core types
```

---

## Implementation Units

- [ ] U1. **Establish pnpm workspace**

**Goal:** Add root-level monorepo tooling so internal packages can reference each other with `workspace:^`

**Requirements:** Prerequisite for R9 (opencode refactor) and R7 (pi package)

**Dependencies:** None

**Files:**
- Create: `package.json` (root)
- Create: `pnpm-workspace.yaml`
- Modify: `.gitignore`

**Approach:**
- Add root `package.json` with `"private": true` and a `"workspaces"` array listing `["packages/*", "plugins/*"]`
- Add `pnpm-workspace.yaml` with the same workspace globs
- Update `.gitignore` to stop ignoring `Ziit/`, `opencode-mem/`, `opencode-notifier/` (these are excluded for workspace membership but remain in `.gitignore` if desired — evaluate whether they should enter the workspace). The two helper packages and Ziit are separate concerns; keep workspace scoped to `packages/` and `plugins/` only
- Run `pnpm install` at root to link existing plugin directories. Existing `ziit-opencode/node_modules/` and its lockfile should be removed — pnpm manages hoisting

**Patterns to follow:**
- Standard pnpm workspace layout: root `package.json` with `"workspaces"`, `pnpm-workspace.yaml` with package globs, hoisted `node_modules/` at root

**Test scenarios:**
- `pnpm install` at root resolves all workspace packages without errors
- `ziit-opencode` can still build (`pnpm --filter @arcat/ziit-opencode build`)

**Verification:**
- `pnpm list --depth=0` shows all plugins as workspace members
- `ziit-opencode` builds and its tests (if added) pass

---

- [ ] U2. **Create `packages/ziit-core` shared library**

**Goal:** Extract shared heartbeat, config, rate-limiting, logging, and offline-queue logic into a reusable TypeScript library

**Requirements:** R1, R2, R3, R4, R5

**Dependencies:** U1 (workspace must exist)

**Files:**
- Create: `packages/ziit-core/package.json`
- Create: `packages/ziit-core/tsconfig.json`
- Create: `packages/ziit-core/src/index.ts`
- Create: `packages/ziit-core/src/config.ts`
- Create: `packages/ziit-core/src/heartbeat.ts`
- Create: `packages/ziit-core/src/rate-limit.ts`
- Create: `packages/ziit-core/src/queue.ts`
- Create: `packages/ziit-core/src/logger.ts`
- Create: `packages/ziit-core/src/git.ts`
- Create: `packages/ziit-core/src/language.ts`

**Approach:**
- Extract from `plugins/ziit-opencode/src/index.ts` into separate modules:
  - `config.ts`: `loadConfig()` — read `~/.config/ziit/config.json`, return `{ apiKey, baseUrl }` with `baseUrl` defaulting to `https://ziit.app` and trailing-slash stripped
  - `heartbeat.ts`: `createHeartbeat(filePath, cwd, editorName)` — construct `HeartbeatPayload` with OS/language/project/branch; `sendHeartbeat(config, payload, platform)` — POST to Ziit, fall back to offline queue
  - `rate-limit.ts`: `createRateLimiter(cooldownMs)` — factory returning `(filePath: string) => boolean`
  - `queue.ts`: `syncOfflineQueue(config, platform)` — batch-send queued heartbeats from `offline_<platform>_heartbeats.json`
  - `logger.ts`: `createLogger(platform)` — factory returning `(message: string) => void`, writes to `~/.config/ziit/<platform>.log`
  - `git.ts`: `detectProject(cwd)`, `detectBranch(cwd)` — git subprocess calls with directory fallback
  - `language.ts`: `detectLanguage(filePath)` — static extension-to-language map with Dockerfile/Makefile special cases
- Package name: `@arcat/ziit-core` (private, `"private": true` in `package.json`)
- Export all public functions from `src/index.ts`
- Use ESM (`"type": "module"`)
- Compile with `tsc` to `dist/` (same pattern as `ziit-opencode`)

**Patterns to follow:**
- Existing `ziit-opencode/src/index.ts` — exact logic to extract, preserving the same behavior and file paths
- Constants pattern: `CONFIG_DIR`, `CONFIG_FILE`, etc. (carry forward naming convention)

**Test scenarios:**
- `loadConfig()` returns parsed config with default `baseUrl` when only `apiKey` is present
- `loadConfig()` returns `null` when config file is missing (graceful, no throw)
- `createHeartbeat("/path/to/file.ts", "/cwd", "TestEditor")` produces payload with correct OS, language="typescript", valid timestamp
- `createRateLimiter(45000)` rejects same file within 45s, allows after cooldown
- `syncOfflineQueue` drains queue file on successful batch POST, retains on failure

**Verification:**
- All core functions are importable and work in isolation (no platform-specific dependencies)
- Package builds to `dist/` without errors

---

- [ ] U3. **Refactor `ziit-opencode` to use `ziit-core`**

**Goal:** Replace inline heartbeat/config/logic in `ziit-opencode` with calls to `ziit-core`, preserving identical behavior

**Requirements:** R9, R10 (no regression)

**Dependencies:** U2 (`ziit-core` must exist), U1 (workspace)

**Files:**
- Modify: `plugins/ziit-opencode/src/index.ts`
- Modify: `plugins/ziit-opencode/package.json`
- Modify: `plugins/ziit-opencode/tsconfig.json`
- No change: `plugins/ziit-opencode/src/plugin.ts`

**Approach:**
- Add `@arcat/ziit-core` as a dependency in `package.json` using `"workspace:^"` protocol
- In `src/index.ts`:
  - Import `loadConfig`, `createHeartbeat`, `sendHeartbeat`, `syncOfflineQueue`, `createRateLimiter`, `createLogger` from `@arcat/ziit-core`
  - Replace inline config loading with `loadConfig()`
  - Replace inline heartbeat construction with `createHeartbeat(filePath, cwd, "OpenCode")`
  - Replace inline rate-limiting (`MIN_SEND_INTERVAL_SECONDS`, `shouldSendForFile`) with `createRateLimiter(45000)`
  - Replace offline queue logic with `syncOfflineQueue(config, "opencode")`
  - Replace inline logging with `createLogger("opencode")`
  - **Keep** OpenCode-specific code: path extraction heuristics (`parsePatchPaths`, `parseInlinePaths`, `collectPathCandidates`, `collectEventFiles`), session state management, event-type routing (`handlePartUpdated`, `handleIdleOrDeleted`), and the `Plugin` export wrapper
- Update `tsconfig.json` to include `ziit-core` in `references` or `paths` for type resolution
- Remove now-dead code: inline language detection, OS detection, git detection, heartbeat payload construction, and API fetch/post helpers that came from `ziit-core`
- **Do not** change the offline queue filename (`offline_opencode_heartbeats.json`) or log filename (`opencode.log`) — these are conventions `ziit-core` receives as the `platform` parameter

**Patterns to follow:**
- The existing `ziit-opencode/src/index.ts` structure — keep the same file, only replace implementation bodies
- OpenCode `PluginInput.directory` for cwd → pass to `createHeartbeat` via `process.cwd()` fallback

**Test scenarios:**
- After refactor, sending a heartbeat for a known file produces identical HTTP request to Ziit API as before (same payload shape, same endpoint, same auth header)
- Rate limiting behaves identically: same file within 45s → only one heartbeat sent
- Offline queue: network failure → heartbeat queued; session idle → queue synced
- Session deleted → state cleaned up (no memory leak from old session-state pattern — verify `pruneSessions` still runs)

**Verification:**
- `ziit-opencode` builds without errors
- Manual smoke test: configure with a test API key, trigger file operations in OpenCode, verify heartbeats appear in Ziit dashboard
- Compare heartbeat payload before/after refactor for same file → identical

---

- [ ] U4. **Create `plugins/ziit-pi` pi.dev plugin**

**Goal:** Build a pi extension that tracks coding activity via pi's tool events and sends heartbeats to Ziit

**Requirements:** R6, R7, R8

**Dependencies:** U2 (`ziit-core`), U1 (workspace)

**Files:**
- Create: `plugins/ziit-pi/package.json`
- Create: `plugins/ziit-pi/tsconfig.json`
- Create: `plugins/ziit-pi/src/index.ts`
- Create: `plugins/ziit-pi/src/plugin.ts`

**Approach:**
- `package.json`:
  - Name: `@arcat/ziit-pi`
  - `"pi"` field: `{ "extensions": ["./src/index.ts"] }`
  - Dependencies: `@arcat/ziit-core` (`workspace:^`), `@mariozechner/pi-coding-agent` (peer, for type imports only)
  - `"type": "module"`, compiled to `dist/` with `tsc`
  - `"files"`: `["dist", "package.json"]`
  - `"publishConfig"`: `{ "access": "public" }`
- `src/plugin.ts`: Re-export from `./index.ts` as default; this is the npm-resolved entry
- `src/index.ts`: Default export function `(pi: ExtensionAPI) => void`:
  - Initialize `ziit-core` imports: `loadConfig`, `createHeartbeat`, `sendHeartbeat`, `syncOfflineQueue`, `createRateLimiter`, `createLogger`
  - In-memory state:
    - `cwd: string` — captured from `resources_discover` or `process.cwd()`
    - `toolCallPaths: Map<string, string>` — `toolCallId → filePath`, with 5-min TTL per entry (using `setTimeout` or a timestamp-check on access)
    - `rateLimiter` — from `createRateLimiter(45000)`
    - `logger` — from `createLogger("pi")`
    - `config` — loaded on first event (lazy, avoids blocking pi startup if config is missing)
  - Subscribe to events:
    - `resources_discover` → capture `event.cwd`
    - `session_start` → `syncOfflineQueue(config, "pi")`
    - `tool_call` for `read`, `write`, `edit`:
      - Guard: if `!event.input.path || typeof event.input.path !== "string"` → `logger("Skipping heartbeat: missing path for tool_call")`; return
      - Store: `toolCallPaths.set(event.toolCallId, event.input.path)`
      - Schedule TTL eviction: `setTimeout(() => toolCallPaths.delete(event.toolCallId), 300_000)`
    - `tool_result` for `read`, `write`, `edit`:
      - Guard: if `event.isError` → `toolCallPaths.delete(event.toolCallId)`; return
      - Retrieve: `const filePath = toolCallPaths.get(event.toolCallId)`; if missing → `logger(...)`; return
      - Rate-limit: `if (!rateLimiter(filePath))` → return
      - Construct and send: `const payload = createHeartbeat(filePath, cwd, "Pi")`; `await sendHeartbeat(config, payload, "pi")`
    - `session_shutdown` → `syncOfflineQueue(config, "pi")`
  - Graceful degradation: if `loadConfig()` returns `null`, log a warning and skip all heartbeat operations (never crash pi)

**Patterns to follow:**
- Pi extension API pattern from docs: `export default function (pi: ExtensionAPI) { pi.on(...); }`
- `ziit-opencode/src/plugin.ts` for the npm module re-export pattern
- `ziit-opencode/src/index.ts` for the `Plugin` function structure (adapted to pi's `ExtensionAPI`)
- Existing plugin naming: `EDITOR_NAME = "Pi"`, `offline_pi_heartbeats.json`, `pi.log`

**Test scenarios:**

*Happy path:*
- LLM calls `write` on `src/app.ts` → `tool_call` captures path → `tool_result` with `isError: false` → heartbeat sent with `language: "typescript"`, `editor: "Pi"`
- LLM calls `read` on `config.yaml` → heartbeat sent with `language: "yaml"`
- LLM calls `edit` on `Dockerfile` → heartbeat sent with `language: "dockerfile"`

*Edge cases:*
- Same file edited twice within 45 seconds → only first heartbeat sent
- `tool_call` fires but `tool_result` never arrives → path evicted after 5-min TTL, no heartbeat, no memory leak
- `tool_result` with `isError: true` → no heartbeat, path entry cleaned up
- Missing `event.input.path` → logged warning, skipped gracefully

*Error paths:*
- Config file missing → logger warning on first event, all heartbeats skipped, pi continues normally
- Ziit API unreachable → heartbeat queued to `offline_pi_heartbeats.json`
- Malformed `event.input` (not an object, no `path` key) → defensive guard catches, logger warning, skip

*Integration:*
- Pi session starts → `syncOfflineQueue` drains previously queued heartbeats
- Pi session shuts down → `syncOfflineQueue` drains any remaining queued heartbeats
- `pi --extension` or `pi install npm:@arcat/ziit-pi` loads the extension and begins tracking

**Verification:**
- Extension loads in pi without errors (`pi -e dist/plugin.js` or via `pi install`)
- Heartbeats appear in Ziit dashboard with `editor: "Pi"` and correct language/project/branch
- Offline queued heartbeats sync on next session start
- Missing config does not crash pi

---

- [ ] U5. **Integration verification and cleanup**

**Goal:** End-to-end verification that the workspace, shared core, refactored opencode, and new pi plugin all work together

**Requirements:** R10 (opencode no-regression), all success criteria from origin doc

**Dependencies:** U3 (opencode refactor), U4 (pi plugin)

**Files:**
- No new files — verification only

**Approach:**
- Rebuild all packages: `pnpm --filter "./packages/*" --filter "./plugins/*" build`
- Verify `ziit-opencode` passes the no-regression smoke test (see U3 verification)
- Verify `ziit-pi` loads cleanly in pi and sends heartbeats
- Update root `README.md` to add pi to the platform table
- Confirm `.gitignore` is correct: `node_modules/` ignored at root and per-package, `dist/` ignored per-package, `config.json` ignored
- Review `package.json` files for correct publish config, dependency declarations, and workspace references

**Test scenarios:**
- `pnpm install` at root succeeds with all workspace packages linked
- `pnpm build` (or per-package build scripts) completes without errors across all packages
- Pi extension loads and begins tracking when installed via `pi install`
- OpenCode plugin produces identical heartbeats before and after refactor

**Verification:**
- All 5 success criteria from the origin document are demonstrably met
- No regressions in existing `ziit-opencode` behavior
- Pi plugin is publishable: `npm publish --dry-run` in `plugins/ziit-pi/` shows correct package contents

---

## System-Wide Impact

- **Interaction graph:** `ziit-core` → consumed by `ziit-opencode` and `ziit-pi`. `ziit-pi` → called by pi's extension runtime. `ziit-opencode` → called by OpenCode's plugin runtime. No cross-plugin interactions.
- **Error propagation:** All plugins follow the same pattern: errors are logged, not thrown. Missing config → graceful skip. Network failure → offline queue. The host agent (pi or OpenCode) is never crashed by plugin errors.
- **State lifecycle risks:** The `toolCallId → path` TTL map in `ziit-pi` has a 5-minute eviction. In pi's parallel tool execution mode, tool events may interleave, but the Map keyed by unique `toolCallId` handles this without conflicts. Sessions are bounded by pi process lifetime.
- **API surface parity:** The Ziit REST API (`/api/external/heartbeat`, `/api/external/batch`) remains unchanged — no server-side changes needed.
- **Integration coverage:** The OpenCode refactor's no-regression test is the primary cross-layer integration safety net. If OpenCode continues working identically, the shared core's API surface is validated.
- **Unchanged invariants:** `~/.config/ziit/config.json` format is unchanged. Offline queue filename pattern (`offline_<platform>_heartbeats.json`) is unchanged. Log file naming (`<platform>.log`) is unchanged. Existing OpenCode users are not affected — their config files and queued heartbeats continue to work.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| `ziit-core` API misaligned between OpenCode and pi event models | U2 → U3 ordering validates core against OpenCode before pi is built; U5 integration smoke test catches discrepancies |
| `pi install` dependency resolution doesn't resolve `workspace:^` references in published npm packages | `ziit-core` is bundled at build time into `ziit-pi`'s `dist/`; `ziit-core` is listed as a production dependency in `ziit-pi/package.json` so `pi install` fetches it from the npm registry |
| Monorepo setup breaks existing `ziit-opencode` build | U1 is scoped to workspace config only — existing `ziit-opencode` build is validated before proceeding to U2 |
| Pi's parallel tool execution causes race conditions in `toolCallPaths` Map | Each `toolCallId` is unique per tool invocation; the Map is keyed by call ID, not file path. No two tool results share an ID. A 5-min TTL per entry prevents orphan accumulation |
| `@mariozechner/pi-coding-agent` not available as a regular npm dependency (may be bundled with pi) | Declare as `peerDependencies` with `"optional": true` — type imports only; the extension runs inside pi's runtime which provides the types at execution time |

---

## Sources & References

- **Origin document:** [docs/brainstorms/2026-05-06-pi-platform-requirements.md](docs/brainstorms/2026-05-06-pi-platform-requirements.md)
- Related code: `plugins/ziit-opencode/src/index.ts` (heartbeat extraction source)
- Related code: `plugins/ziit-opencode/src/plugin.ts` (plugin entry pattern)
- Related code: `plugins/ziit-claude-code/scripts/track-activity.sh` (cross-platform heartbeat consistency reference)
- External docs: [pi.dev Extensions](https://pi.dev/docs/latest/extensions)
- External docs: [pi.dev SDK](https://pt-act-pi-mono.mintlify.app/api/coding-agent/sdk)
