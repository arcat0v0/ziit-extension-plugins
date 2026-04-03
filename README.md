# Ziit Extension Plugins

Ziit time tracking plugins for AI coding assistants. Track your coding time with [Ziit](https://ziit.app) - a self-hostable, open-source alternative to WakaTime.

## Available Plugins

| Plugin | Platform | Status |
|--------|----------|--------|
| `ziit-claude-code` | Claude Code | ✅ Ready |
| `ziit-opencode` | OpenCode | 🚧 Coming soon |
| `ziit-codex` | Codex CLI | ✅ Ready |

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

### Codex CLI

Codex CLI currently uses file-based hook installation rather than a marketplace command.

1. One-command install:

```bash
curl -fsSL https://raw.githubusercontent.com/arcat0v0/ziit-extension-plugins/main/plugins/ziit-codex/install.sh | bash
```

2. Configure your API key:

```bash
mkdir -p ~/.config/ziit
echo '{"apiKey": "your-ziit-api-key", "baseUrl": "https://ziit.app"}' > ~/.config/ziit/config.json
```

3. Restart Codex CLI so the new hooks are loaded.

If you prefer a manual install flow, use a repository checkout:

```bash
git clone https://github.com/arcat0v0/ziit-extension-plugins.git
cd ziit-extension-plugins
./plugins/ziit-codex/scripts/install.sh
```

The installer will:

- merge this plugin into `~/.codex/hooks.json`
- enable `codex_hooks = true` in `~/.codex/config.toml`
- create timestamped backups before changing existing Codex config files

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

Codex CLI uses file-based hook installation instead of a marketplace command. Manage it with:

```bash
curl -fsSL https://raw.githubusercontent.com/arcat0v0/ziit-extension-plugins/main/plugins/ziit-codex/install.sh | bash

# or, if you already checked out the repository:
./plugins/ziit-codex/scripts/install.sh
./plugins/ziit-codex/scripts/uninstall.sh
```

## How It Works

These plugins use each platform's native extension surface to send Ziit heartbeats:

- **Claude Code**: `PostToolUse` for `Edit|Write|MultiEdit` plus `Stop`
- **Codex CLI**: official Codex hooks with `PostToolUse` for `Bash` plus `Stop`

Each heartbeat includes:
- Timestamp
- Project name (from git remote or directory)
- Programming language (30+ languages supported)
- File path
- Git branch
- Editor name (for example `Claude Code` or `Codex CLI`)
- Operating system

## Features

- ✅ Automatic tracking - no manual intervention
- ✅ Offline support - heartbeats queued and synced later
- ✅ Git integration - detects project name and branch
- ✅ Language detection - 30+ programming languages
- ✅ Batch sync - efficient API usage

## Logs

Debug logs:

- Claude Code: `~/.config/ziit/claude-code.log`
- Codex CLI: `~/.config/ziit/codex.log`

## Requirements

- `bash`
- `python3` for the Codex CLI plugin
- `jq` and `curl` for the Claude Code plugin
- `git` - For project/branch detection (optional)

## License

MIT
