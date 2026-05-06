# Ziit Time Tracker for OpenCode

Track your OpenCode coding activity with [Ziit](https://ziit.app), a self-hostable alternative to WakaTime.

## Installation

### Option 1: Install from npm (recommended once published)

After publishing the package, add the plugin via your `opencode.json` configuration:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "@arcat0v0/ziit-opencode"
  ]
}
```

### Option 2: Install from local build (for development)

1. Clone the repository and build the plugin:

```bash
git clone https://github.com/arcat0v0/ziit-extension-plugins.git
cd ziit-extension-plugins/plugins/ziit-opencode
npm install
npm run build
```

2. Add the plugin to your OpenCode configuration at `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "file:///absolute/path/to/ziit-extension-plugins/plugins/ziit-opencode"
  ]
}
```

To find the correct absolute path, run:

```bash
echo "file://$(pwd)"
```

### Configure your Ziit credentials

Create `~/.config/ziit/config.json`:

```json
{
  "apiKey": "your-ziit-api-key-uuid",
  "baseUrl": "https://ziit.app"
}
```

You can find your API key in your Ziit dashboard settings.

### Restart OpenCode

Restart OpenCode so the plugin configuration is loaded.

## How It Works

This plugin uses OpenCode's native plugin system to track coding activity:

- **message.part.updated**: Captures file edits from tool outputs and sends heartbeats
- **session.idle**: Syncs any queued offline heartbeats when you go idle
- **session.deleted**: Cleans up session state when a session ends

Each heartbeat includes:

- timestamp
- project name (from git remote or directory)
- programming language (detected from file extension)
- file path
- git branch
- editor (`OpenCode`)
- operating system

## Features

- **Automatic tracking** through OpenCode's native plugin system
- **Offline queue** when Ziit is unreachable (stored in `~/.config/ziit/offline_opencode_heartbeats.json`)
- **Git-aware project detection**
- **Language detection** for 30+ programming languages
- **Rate limiting** to avoid flooding duplicate heartbeats for the same file

## Files

```text
plugins/ziit-opencode/
├── src/
│   ├── index.ts          # Heartbeat logic and event handling
│   └── plugin.ts         # OpenCode plugin module entrypoint
├── dist/                 # Compiled output
├── package.json          # Plugin manifest
├── tsconfig.json         # TypeScript configuration
└── README.md
```

## Logs

Debug logs are written to `~/.config/ziit/opencode.log`.

Offline heartbeats are stored in `~/.config/ziit/offline_opencode_heartbeats.json`.

## Configuration

| Option | Description | Default |
|--------|-------------|---------|
| `apiKey` | Your Ziit API key (UUID format) | Required |
| `baseUrl` | Your Ziit instance URL | `https://ziit.app` |

## Requirements

- OpenCode with plugin support
- Node.js (for building from source)
- `git` (optional, for project name and branch detection)

## Uninstall

To remove the plugin:

1. Remove the plugin entry from your `~/.config/opencode/opencode.json`
2. Delete the plugin directory if you no longer need it
3. Restart OpenCode

## Limitations

- OpenCode's plugin system is still evolving
- This plugin detects files from `message.part.updated` payloads and tool output text rather than direct file system events
- Some events may not contain file path information depending on the tool being used

## License

MIT
