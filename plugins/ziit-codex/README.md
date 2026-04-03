# Ziit Time Tracker for Codex CLI

Track your Codex CLI coding activity with [Ziit](https://ziit.app), a self-hostable alternative to WakaTime.

## Installation

Codex CLI does not currently have a marketplace-style plugin installer, so this plugin ships with an install script that wires up Codex hooks for you.

### 1. Configure your Ziit credentials

Create `~/.config/ziit/config.json`:

```json
{
  "apiKey": "your-ziit-api-key-uuid",
  "baseUrl": "https://ziit.app"
}
```

### 2. Install the Codex hooks

From this plugin directory, run:

```bash
./scripts/install.sh
```

That script:

- merges this plugin into `~/.codex/hooks.json`
- enables `codex_hooks = true` in `~/.codex/config.toml`
- keeps timestamped backups before it changes existing files

### 3. Restart Codex CLI

Restart Codex CLI so the updated hooks and config are loaded.

## How It Works

Codex CLI exposes official hooks, but today `PostToolUse` only emits `Bash`. This plugin therefore uses two signals:

- **PostToolUse (Bash)**: extracts file paths from the Bash command and, if needed, falls back to recently modified files
- **Stop**: reuses session state to flush the last touched files and sync any queued offline heartbeats

Each heartbeat includes:

- timestamp
- project name
- programming language
- file path
- git branch
- editor (`Codex CLI`)
- operating system

## Features

- **Automatic tracking** through official Codex hooks
- **Offline queue** when Ziit is unreachable
- **Git-aware project detection**
- **Language detection** for common source files
- **Rate limiting** to avoid flooding duplicate heartbeats for the same file

## Files

```text
plugins/ziit-codex/
├── hooks/
│   └── hooks.template.json
├── scripts/
│   ├── install.sh
│   ├── track-activity.py
│   └── uninstall.sh
└── README.md
```

## Logs

Debug logs are written to `~/.config/ziit/codex.log`.

Offline heartbeats are stored in `~/.config/ziit/offline_codex_heartbeats.json`.

## Requirements

- `python3`
- `bash`
- `git` (optional, for project name and branch detection)

## Uninstall

```bash
./scripts/uninstall.sh
```

This removes the hook commands from `~/.codex/hooks.json`. If you no longer use any Codex hooks, remove `codex_hooks = true` from `~/.codex/config.toml` manually.

## Limitations

- Codex hooks are currently experimental
- `PostToolUse` only emits `Bash`, not direct edit/write tool events
- When a Bash command does not contain an obvious file path, the plugin falls back to recently changed files in the working tree

## License

MIT
