---
date: 2026-05-06
topic: pi-platform
---

# Ziit Pi Platform Support

## Problem Frame

Ziit currently supports three AI coding assistant platforms: Claude Code, Codex CLI, and OpenCode. Pi (pi.dev) is a minimal terminal-based coding agent with a TypeScript extension system that closely mirrors OpenCode's plugin model. Adding pi support fills a gap in the platform lineup and benefits from pi's precise tool-event API (direct access to tool names and parameters, unlike OpenCode's text-parsing approach).

Adding pi also creates a natural opportunity to extract the shared heartbeat logic from `ziit-opencode` into a reusable internal core library (`@arcat/ziit-core`) that both `ziit-opencode` and the new `ziit-pi` can depend on, eliminating significant code duplication (heartbeat construction, config loading, rate limiting, logging, and offline queue) between the two TypeScript plugins.

---

## Actors

- A1. **Developer using pi**: Installs the extension, configures API key, gets automatic time tracking for coding activity within pi sessions.
- A2. **Plugin maintainer**: Publishes and maintains `@arcat/ziit-core` (internal) and `@arcat/ziit-pi` (public), and refactors `@arcat/ziit-opencode` to consume the shared core.

---

## Key Flows

- F1. **File edit tracked via pi extension**
  - **Trigger:** LLM calls `write` or `edit` tool in a pi session
  - **Actors:** A1
  - **Steps:**
    1. `tool_call` event fires → extension extracts `event.input.path` and stores it keyed by `toolCallId`
    2. `tool_result` event fires for the same `toolCallId` → if not an error, reads the stored path
    3. Extension applies rate limiting (≥45s between heartbeats for the same file)
    4. Extension constructs heartbeat payload (timestamp, project, language, file, branch, editor="Pi", os)
    5. Sends heartbeat to Ziit API; if offline, queues to `~/.config/ziit/offline_pi_heartbeats.json`
  - **Outcome:** Coding activity is recorded in Ziit with accurate file paths
  - **Covered by:** R1, R2, R3, R4

- F2. **File read tracked via pi extension**
  - **Trigger:** LLM calls `read` tool in a pi session
  - **Actors:** A1
  - **Steps:** Same as F1 but triggered by `read` tool call
  - **Outcome:** File reading activity is recorded (language context captured even without edits)
  - **Covered by:** R1, R2

- F3. **Offline queue sync on session start or end**
  - **Trigger:** pi session starts (`session_start`) or shuts down (`session_shutdown`)
  - **Actors:** A1
  - **Steps:**
    1. Extension loads queued heartbeats from `~/.config/ziit/offline_pi_heartbeats.json`
    2. Sends batch to Ziit API
    3. Clears queue file on success
  - **Outcome:** No heartbeats are lost during offline periods; queued heartbeats from a prior session are drained on startup
  - **Covered by:** R2

- F4. **Installation via npm**
  - **Trigger:** Developer wants to install the Ziit pi plugin
  - **Actors:** A1
  - **Steps:**
    1. `pi install npm:@arcat/ziit-pi` installs the package into pi's global extensions
    2. Developer creates `~/.config/ziit/config.json` with apiKey and baseUrl
    3. Developer reloads pi (`/reload`) or restarts
  - **Outcome:** Plugin is active and begins tracking on next session
  - **Covered by:** R7

---

## Requirements

**Shared core library (`packages/ziit-core`)**
- R1. Provide a TypeScript module with heartbeat construction logic: `createHeartbeat(filePath, cwd, editorName) → HeartbeatPayload`, including OS detection, language detection (30+ extensions), project name detection (git remote → directory fallback), and git branch detection.
- R2. Provide heartbeat sending with offline queue: `sendHeartbeat(config, payload)` and `syncOfflineQueue(config)` using the same offline file pattern (`~/.config/ziit/offline_<platform>_heartbeats.json`) with fallback queuing on network failure.
- R3. Provide config loading: `loadConfig() → ZiitConfig` reading from `~/.config/ziit/config.json` with `apiKey` and `baseUrl` (default `https://ziit.app`).
- R4. Provide rate-limiting utility: a per-file cooldown (default 45 seconds) to prevent duplicate heartbeats.
- R5. Provide a structured logger writing to `~/.config/ziit/<platform>.log`.

**pi platform plugin (`plugins/ziit-pi`)**
- R6. Export a default pi extension function `(pi: ExtensionAPI) => void` that subscribes to:
  - `resources_discover` → capture `event.cwd` for git project/branch detection; fall back to `process.cwd()` if `resources_discover` has not yet fired
  - `session_start` → call `syncOfflineQueue` via shared core (drain any queued heartbeats from prior session)
  - `tool_call` for `read`, `write`, `edit` → store file path from `event.input.path` keyed by `toolCallId`
  - `tool_result` for the same tools → when `!event.isError`, call `sendHeartbeat` via shared core
  - `session_shutdown` → call `syncOfflineQueue` via shared core
- R7. Package as `@arcat/ziit-pi` on npm with pi package metadata (`"pi"` field in `package.json` pointing to extension entry, compatible with `pi install`).
- R8. Set editor name to `"Pi"` in heartbeat payloads.

**OpenCode plugin refactor**
- R9. Refactor `plugins/ziit-opencode` to depend on `@arcat/ziit-core` instead of its own inline heartbeat/config/logic, keeping only the OpenCode-specific event adapter layer (`message.part.updated` → file path extraction → core heartbeat send).
- R10. Existing OpenCode heartbeat behavior must remain unchanged after the refactor (no regression).

---

## Success Criteria

- A pi user installs `@arcat/ziit-pi`, configures their API key, and sees coding activity appear in their Ziit dashboard without any further action.
- `ziit-opencode` continues to function identically after refactoring to the shared core.
- Heartbeats are sent with accurate file paths (no text-parsing heuristics for pi — paths come directly from tool parameters).
- Offline heartbeats are queued and synced on session restart or shutdown.
- Plugin degrades gracefully under failure conditions: missing or invalid config logs a clear message without crashing pi, network failures queue heartbeats offline, and malformed tool events are skipped with a warning rather than throwing.

---

## Scope Boundaries

- `ziit-claude-code` and `ziit-codex` are not refactored to use the shared core — they are shell/Python-based and would require a different abstraction layer.
- The shared core (`@arcat/ziit-core`) is internal to this monorepo and not published as a standalone npm package (no public API stability guarantees).
- No dashboard or UI changes to Ziit itself — this is purely a client-side plugin addition.
- No support for pi's `bash` tool tracking — bash commands are too ambiguous to reliably extract file paths without the same heuristics Claude Code/Codex use, which is best deferred.

---

## Key Decisions

- **Two-phase heartbeat (tool_call capture + tool_result send):** Chosen over single-phase approaches because pi exposes both events with precise `toolCallId` correlation. This avoids sending heartbeats for failed tool executions.
- **Shared core as internal monorepo package:** Chosen over independent duplication to reduce maintenance burden across two TypeScript plugins. The core is not published independently.
- **npm distribution for pi plugin:** Chosen over single-file copy because pi natively supports `pi install npm:...`, matching the OpenCode plugin's distribution model and enabling versioned releases.
- **Rate limit cooldown of 45 seconds:** Carried forward from existing plugins to maintain consistency and avoid API flooding.

---

## Dependencies / Assumptions

- Pi's `tool_call` event reliably provides `event.input.path` for `read`, `write`, and `edit` built-in tools (verified against pi extension docs — these tools expose `path` in their parameter schemas). Include a defensive guard in the extension: skip heartbeat if `event.input.path` is missing or not a string, logging a warning.
- `@opencode-ai/plugin` dependency is compatible with the shared core's TypeScript module format (both use ESM).
- `ziit-core` is resolved as a workspace dependency within the monorepo and bundled at build time for `ziit-opencode` and `ziit-pi` distribution.
- Pi installations via `pi install npm:...` work with scoped packages (`@arcat/ziit-pi`).

---

## Outstanding Questions

### Deferred to Planning

- [Technical] Whether to use a monorepo tool for `ziit-core` → plugin dependencies. **Recommendation: pnpm workspaces** — minimal overhead, no new CLI dependency beyond pnpm, supports `workspace:^` protocol for internal packages. Add a root `package.json` with `workspaces` config, then restructure existing plugin directories into the workspace as the first implementation task (before extracting `ziit-core`).
- [Needs research] Whether pi's `pi install npm:...` installs `dependencies` (production) or includes `devDependencies` — affects how `ziit-core` is bundled or declared.
- [Technical] Exact `package.json` `"pi"` field format for pi extension entry point to ensure auto-discovery works with `pi install`.
- [Technical] Build pipeline: whether `ziit-core` should be pre-compiled (TypeScript → JS) or consumed as source (pi uses jiti, but opencode may not).

---

## Next Steps

-> `/ce-plan` for structured implementation planning

---

## Deferred / Open Questions

### From 2026-05-06 review

- **Two-phase heartbeat has no orphan-handling** — Key Flows — F1, F2 (P1, adversarial, confidence 75)

  The two-phase heartbeat design captures file paths on `tool_call` and sends on `tool_result`. But there's no timeout, eviction, or cleanup for `toolCallId → path` mappings. If pi crashes between the two events, or if a tool result never arrives (LLM error, parallel execution race), orphaned entries accumulate in memory indefinitely. `session_shutdown` is the only cleanup trigger, but a crash fires no shutdown event.

  <!-- dedup-key: section="key flows f1 f2" title="two phase heartbeat has no orphanhandling" evidence="the two phase heartbeat design captures file paths on tool call and sends on tool result but theres no timeout eviction or cleanup for toolcallid path" -->

- **Shared-core extraction before dual-consumer validation** — Key Decisions (P2, adversarial, confidence 75)

  `ziit-core` is being designed simultaneously with its second consumer (`ziit-pi`) and while refactoring its first (`ziit-opencode`). The interface must bridge two fundamentally different event models: structured `tool_call`/`tool_result` for pi vs text-parsing `message.part.updated` for opencode. If the extracted interface turns out misaligned, the rework cost exceeds the temporary duplication cost of building pi first and extracting later. The planner should weigh extraction sequencing.

  <!-- dedup-key: section="key decisions" title="shared core extraction before dual consumer validation" evidence="ziit core is being designed simultaneously with its second consumer ziit pi and while refactoring its first ziit" -->
