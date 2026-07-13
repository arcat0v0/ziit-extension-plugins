# Ziit Time Tracker for Codex CLI

Track your Codex CLI coding activity with [Ziit](https://ziit.app), a self-hostable alternative to WakaTime.

## Installation

### Native plugin

```bash
codex plugin marketplace add arcat0v0/ziit-extension-plugins
```

Install `ziit-codex` from the Codex plugin browser, then review and trust the bundled hooks with `/hooks`. Restart the session after installation or upgrades.

For Codex releases without plugin support, the legacy installer remains available:

```bash
curl -fsSL https://raw.githubusercontent.com/arcat0v0/ziit-extension-plugins/main/plugins/ziit-codex/install.sh | bash
```

### 2. Configure your Ziit credentials

Create `~/.config/ziit/config.json`:

```json
{
  "apiKey": "your-ziit-api-key-uuid",
  "baseUrl": "https://ziit.app"
}
```

The legacy installer merges hooks into `~/.codex/hooks.json`, enables `[features].hooks`, and preserves timestamped backups. Native plugin installs keep lifecycle hooks inside the plugin bundle.

## How It Works

Codex exposes both shell and direct edit events:

- **PostToolUse (`apply_patch`)**: extracts paths directly from the patch command
- **PostToolUse (`Bash`)**: extracts command paths and falls back to recently modified files
- **Stop**: flushes recent session files and queued offline heartbeats

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
├── .codex-plugin/plugin.json
├── hooks/hooks.json
├── scripts/track-activity.py
└── README.md
```

## Logs

Debug logs are written to `~/.config/ziit/codex.log`.

Offline heartbeats are stored in `~/.config/ziit/offline_codex_heartbeats.json`.

## Requirements

- `python3`
- `bash`
- `git` (optional, for project name and branch detection)

## Legacy uninstall

```bash
./scripts/uninstall.sh
```

Native installs are removed from the Codex plugin browser. Legacy installs remove their entries from `~/.codex/hooks.json`.

## License

MIT
