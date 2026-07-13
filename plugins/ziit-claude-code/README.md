# Ziit Time Tracker for Claude Code

Track your Claude Code coding activity with [Ziit](https://ziit.app) - a self-hostable, open-source alternative to WakaTime.

## Installation

### 1. Copy the plugin to your Claude Code plugins directory

```bash
# Global installation (recommended)
cp -r claude-code-plugin ~/.claude/plugins/ziit-time-tracker

# Or project-specific installation
cp -r claude-code-plugin .claude/plugins/ziit-time-tracker
```

### 2. Configure your Ziit credentials

Create a config file at `~/.config/ziit/config.json`:

```json
{
  "apiKey": "your-ziit-api-key-uuid",
  "baseUrl": "https://ziit.app"
}
```

You can find your API key in your Ziit dashboard settings.

### 3. Reload Claude Code plugins

Run `/reload-plugins` in Claude Code or restart the session.

## How It Works

The plugin uses Claude Code's hooks system to track coding activity:

- **SessionStart**: initializes per-session activity state
- **UserPromptSubmit**: starts an active coding turn
- **PostToolUse / PostToolUseFailure**: records all successful and failed tool activity
- **Stop / SessionEnd**: closes the active interval and flushes queued heartbeats

While a turn is active, the plugin fills long gaps with one-minute heartbeats. The event coverage and cadence follow WakaTime's Claude Code plugin, while the interval fill adapts that model to Ziit’s heartbeat API without counting idle time between completed turns.

Each heartbeat includes:
- Timestamp
- Project name (from git remote or directory)
- Programming language (detected from file extension)
- File path
- Git branch
- Editor ("Claude Code")
- Operating system

## Features

- **Automatic tracking**: No manual intervention needed
- **Offline support**: Heartbeats are queued when offline and synced later
- **Git integration**: Automatically detects project name and branch
- **Language detection**: Supports 30+ programming languages

## Configuration

| Option | Description | Default |
|--------|-------------|---------|
| `apiKey` | Your Ziit API key (UUID format) | Required |
| `baseUrl` | Your Ziit instance URL | `https://ziit.app` |

## Logs

Logs are written to `~/.config/ziit/claude-code.log` for debugging.

## Requirements

- Node.js 20 or newer
- `git` for project and branch detection (optional)

## License

MIT
