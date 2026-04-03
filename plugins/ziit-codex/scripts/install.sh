#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
HOOKS_TEMPLATE="$PLUGIN_ROOT/hooks/hooks.template.json"
HOOKS_FILE="$CODEX_HOME/hooks.json"
CONFIG_FILE="$CODEX_HOME/config.toml"
BACKUP_SUFFIX=".ziit-backup-$(date +%Y%m%d%H%M%S)"

mkdir -p "$CODEX_HOME"

if [[ -f "$HOOKS_FILE" ]]; then
  cp "$HOOKS_FILE" "$HOOKS_FILE$BACKUP_SUFFIX"
fi

python3 - "$HOOKS_TEMPLATE" "$HOOKS_FILE" "$PLUGIN_ROOT" <<'PY'
from __future__ import annotations

import json
import sys
from pathlib import Path

template_path = Path(sys.argv[1])
hooks_path = Path(sys.argv[2])
plugin_root = sys.argv[3]

payload = json.loads(template_path.read_text(encoding="utf-8"))

for groups in payload.get("hooks", {}).values():
    for group in groups:
        for hook in group.get("hooks", []):
            command = hook.get("command")
            if isinstance(command, str):
                hook["command"] = command.replace("__ZIIT_CODEX_PLUGIN_ROOT__", plugin_root)

if hooks_path.exists():
    existing = json.loads(hooks_path.read_text(encoding="utf-8"))
    merged = existing if isinstance(existing, dict) else {}
else:
    merged = {}

merged_hooks = merged.setdefault("hooks", {})
template_hooks = payload.get("hooks", {})
for event_name, groups in template_hooks.items():
    existing_groups = merged_hooks.setdefault(event_name, [])
    commands = {
        hook.get("command")
        for group in existing_groups
        if isinstance(group, dict)
        for hook in group.get("hooks", [])
        if isinstance(hook, dict)
    }
    for group in groups:
        group_commands = {
            hook.get("command")
            for hook in group.get("hooks", [])
            if isinstance(hook, dict)
        }
        if commands.isdisjoint(group_commands):
            existing_groups.append(group)

hooks_path.write_text(json.dumps(merged, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY

if [[ -f "$CONFIG_FILE" ]]; then
  cp "$CONFIG_FILE" "$CONFIG_FILE$BACKUP_SUFFIX"
fi

python3 - "$CONFIG_FILE" <<'PY'
from __future__ import annotations

import re
import sys
from pathlib import Path

config_path = Path(sys.argv[1])
content = config_path.read_text(encoding="utf-8") if config_path.exists() else ""

section_pattern = re.compile(r"(?ms)^\[features\]\s*$.*?(?=^\[|\Z)")
match = section_pattern.search(content)

if match:
    section = match.group(0)
    if re.search(r"(?m)^codex_hooks\s*=\s*(true|false)\s*$", section):
        section = re.sub(
            r"(?m)^codex_hooks\s*=\s*(true|false)\s*$",
            "codex_hooks = true",
            section,
            count=1,
        )
    else:
        section = section.rstrip() + "\ncodex_hooks = true\n"
    updated = content[: match.start()] + section + content[match.end() :]
else:
    updated = content.rstrip()
    if updated:
        updated += "\n\n"
    updated += "[features]\ncodex_hooks = true\n"

config_path.write_text(updated if updated.endswith("\n") else updated + "\n", encoding="utf-8")
PY

chmod +x "$PLUGIN_ROOT/scripts/track-activity.py"

printf 'Installed ziit-codex hooks to %s\n' "$HOOKS_FILE"
printf 'Enabled Codex hooks in %s\n' "$CONFIG_FILE"
printf 'Next: create ~/.config/ziit/config.json with your apiKey and baseUrl, then restart Codex CLI.\n'
