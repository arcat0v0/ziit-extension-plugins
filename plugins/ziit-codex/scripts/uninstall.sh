#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
HOOKS_FILE="$CODEX_HOME/hooks.json"
BACKUP_SUFFIX=".ziit-backup-$(date +%Y%m%d%H%M%S)"

if [[ -f "$HOOKS_FILE" ]]; then
  cp "$HOOKS_FILE" "$HOOKS_FILE$BACKUP_SUFFIX"
  python3 - "$HOOKS_FILE" "$PLUGIN_ROOT" <<'PY'
from __future__ import annotations

import json
import sys
from pathlib import Path

hooks_path = Path(sys.argv[1])
plugin_root = sys.argv[2]
payload = json.loads(hooks_path.read_text(encoding="utf-8"))
hooks = payload.get("hooks", {})

for event_name, groups in list(hooks.items()):
    filtered_groups = []
    for group in groups:
        kept_hooks = []
        for hook in group.get("hooks", []):
            command = hook.get("command")
            if isinstance(command, str) and command.startswith(plugin_root):
                continue
            kept_hooks.append(hook)
        if kept_hooks:
            updated_group = dict(group)
            updated_group["hooks"] = kept_hooks
            filtered_groups.append(updated_group)
    if filtered_groups:
        hooks[event_name] = filtered_groups
    else:
        hooks.pop(event_name, None)

hooks_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY
fi

printf 'Removed ziit-codex hook commands from %s\n' "$HOOKS_FILE"
if [[ -f "$HOOKS_FILE$BACKUP_SUFFIX" ]]; then
  printf 'Backup saved to %s\n' "$HOOKS_FILE$BACKUP_SUFFIX"
fi
printf 'Note: codex_hooks remains enabled in ~/.codex/config.toml. Remove it manually if you no longer use any hooks.\n'
