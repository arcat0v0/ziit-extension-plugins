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

- **PostToolUse (Edit/Write/MultiEdit)**: Captures file edits and sends heartbeats
- **Stop**: Finalizes session tracking

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

- `jq` - JSON processor (usually pre-installed on most systems)
- `curl` - HTTP client (usually pre-installed)
- `git` - For project/branch detection (optional)

## License

MIT
