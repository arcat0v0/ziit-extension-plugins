# Ziit Extension Plugins

Ziit time tracking plugins for AI coding assistants. Track your coding time with [Ziit](https://ziit.app) - a self-hostable, open-source alternative to WakaTime.

## Available Plugins

| Plugin | Platform | Status |
|--------|----------|--------|
| `ziit-claude-code` | Claude Code | ✅ Ready |
| `ziit-opencode` | OpenCode | 🚧 Coming soon |
| `ziit-codex` | Codex CLI | 🚧 Coming soon |

## Installation

### Claude Code

```bash
# Add the ziit marketplace
claude plugin marketplace add arcat0v0/ziit-extension-plugins

# Install the plugin
claude plugin install ziit-claude-code

# Configure your API key
mkdir -p ~/.config/ziit
echo '{"apiKey": "your-ziit-api-key", "baseUrl": "https://ziit.app"}' > ~/.config/ziit/config.json
```

Get your API key from your [Ziit dashboard settings](https://ziit.app/settings).

## Plugin Management

```bash
# List installed plugins
claude plugin list

# Update plugin
claude plugin update ziit-claude-code

# Disable plugin
claude plugin disable ziit-claude-code

# Enable plugin
claude plugin enable ziit-claude-code

# Uninstall plugin
claude plugin uninstall ziit-claude-code
```

## How It Works

The plugin uses Claude Code's hooks system to track coding activity:

- **PostToolUse** (Edit/Write/MultiEdit): Captures file edits
- **Stop**: Session completion tracking

Each heartbeat includes:
- Timestamp
- Project name (from git remote or directory)
- Programming language (30+ languages supported)
- File path
- Git branch
- Editor name ("Claude Code")
- Operating system

## Features

- ✅ Automatic tracking - no manual intervention
- ✅ Offline support - heartbeats queued and synced later
- ✅ Git integration - detects project name and branch
- ✅ Language detection - 30+ programming languages
- ✅ Batch sync - efficient API usage

## Logs

Debug logs: `~/.config/ziit/claude-code.log`

## Requirements

- `jq` - JSON processor
- `curl` - HTTP client
- `git` - For project/branch detection (optional)

## License

MIT
