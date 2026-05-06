# Ziit Time Tracker for pi

Track your pi coding activity with [Ziit](https://ziit.app), a self-hostable alternative to WakaTime.

## Installation

### 1. Install via npm

```bash
pi install npm:@arcat/ziit-pi
```

### 2. Configure your Ziit credentials

Create `~/.config/ziit/config.json`:

```json
{
  "apiKey": "your-ziit-api-key-uuid",
  "baseUrl": "https://ziit.app"
}
```

Get your API key from your [Ziit dashboard settings](https://ziit.app/settings).

### 3. Restart pi

Restart pi or run `/reload` for the extension to take effect.

## How It Works

This plugin uses pi's native extension system to track coding activity:

- **`tool_call`** (`read`, `write`, `edit`): captures the file path from pi's tool event parameters
- **`tool_result`**: sends a heartbeat on successful tool execution (skipped on `isError`)
- **`session_start`**: syncs any queued offline heartbeats from previous sessions
- **`session_shutdown`**: drains remaining offline heartbeats
- **`resources_discover`**: captures the working directory for git project/branch detection

Each heartbeat includes:

- timestamp
- project name (from git remote or directory)
- programming language (detected from file extension)
- file path
- git branch
- editor (`Pi`)
- operating system

## Features

- **Direct path access** — pi's tool events expose `event.input.path` directly; no text-parsing heuristics needed
- **Error-aware** — heartbeats are only sent for successful tool executions (`!event.isError`)
- **Offline queue** — heartbeats are queued to `~/.config/ziit/offline_pi_heartbeats.json` when Ziit is unreachable
- **Rate limiting** — 45-second cooldown per file to avoid API flooding
- **TTL cleanup** — orphaned tool-call entries expire after 5 minutes to prevent memory leaks

## Logs

Debug logs are written to `~/.config/ziit/pi.log`.

Offline heartbeats are stored in `~/.config/ziit/offline_pi_heartbeats.json`.

## Requirements

- pi (pi.dev) with extension support
- `git` (optional, for project name and branch detection)

## Uninstall

```bash
# Remove the extension
rm -rf ~/.pi/agent/extensions/node_modules/@arcat/ziit-pi

# Restart pi
```

## License

MIT
