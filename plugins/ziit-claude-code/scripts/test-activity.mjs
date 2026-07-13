import { planHeartbeats } from "./track-activity.mjs";

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
