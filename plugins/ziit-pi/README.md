# Ziit Time Tracker for Pi and Oh My Pi

Track Pi or Oh My Pi coding activity with [Ziit](https://ziit.app), a self-hostable alternative to WakaTime.

## Installation

```bash
pi install npm:@arcat/ziit-pi
omp plugin install @arcat/ziit-pi
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

### 3. Reload the extension

Restart the host or run `/reload`.

## How It Works

The package exposes native manifests and typed entry points for both hosts:

- **`tool_call`** (`read`, `write`, `edit`) captures the file path
- **`tool_result`** sends a heartbeat only after success
- **`session_start`** captures `ctx.cwd` and syncs queued heartbeats
- **`session_shutdown`** clears pending timers and syncs the queue

Each heartbeat includes:

- timestamp
- project name (from git remote or directory)
- programming language (detected from file extension)
- file path
- git branch
- editor (`Pi` or `Oh My Pi`)
- operating system

## Features

- **Direct path access**: tool events expose `event.input.path`
- **Error-aware**: failed tool executions do not send heartbeats
- **Offline queue**: host-specific queues persist under `~/.config/ziit`
- **Rate limiting**: two-minute per-file cooldown with write bypass
- **TTL cleanup**: orphaned tool-call entries expire after five minutes

## Logs

Pi writes `~/.config/ziit/pi.log`; Oh My Pi writes `~/.config/ziit/omp.log`.

## Requirements

- Pi `0.80.6` or newer, or Oh My Pi `16.4.8` or newer
- `git` is optional for project and branch detection

## Uninstall

```bash
pi uninstall @arcat/ziit-pi
omp plugin uninstall @arcat/ziit-pi
```

## License

MIT
