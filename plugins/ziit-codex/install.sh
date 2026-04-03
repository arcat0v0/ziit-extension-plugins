#!/usr/bin/env bash

set -euo pipefail

if ! command -v python3 >/dev/null 2>&1; then
  printf 'python3 is required to install ziit-codex.\n' >&2
  exit 1
fi

if command -v curl >/dev/null 2>&1; then
  FETCHER=(curl -fsSL)
elif command -v wget >/dev/null 2>&1; then
  FETCHER=(wget -qO-)
else
  printf 'curl or wget is required to download ziit-codex.\n' >&2
  exit 1
fi

PLUGIN_ROOT="${ZIIT_CODEX_PLUGIN_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/ziit/plugins/ziit-codex}"
RAW_BASE_DEFAULT="https://raw.githubusercontent.com/arcat0v0/ziit-extension-plugins/${ZIIT_CODEX_INSTALL_REF:-main}/plugins/ziit-codex"
RAW_BASE="${ZIIT_CODEX_PLUGIN_RAW_BASE:-$RAW_BASE_DEFAULT}"

mkdir -p "$PLUGIN_ROOT/hooks" "$PLUGIN_ROOT/scripts"

download() {
  local source_path="$1"
  local destination="$2"

  if [[ "$RAW_BASE" == file://* ]]; then
    local file_source="${RAW_BASE#file://}/$source_path"
    cp "$file_source" "$destination"
    return
  fi

  "${FETCHER[@]}" "$RAW_BASE/$source_path" > "$destination"
}

download "hooks/hooks.template.json" "$PLUGIN_ROOT/hooks/hooks.template.json"
download "install.sh" "$PLUGIN_ROOT/install.sh"
download "scripts/install.sh" "$PLUGIN_ROOT/scripts/install.sh"
download "scripts/uninstall.sh" "$PLUGIN_ROOT/scripts/uninstall.sh"
download "scripts/track-activity.py" "$PLUGIN_ROOT/scripts/track-activity.py"
download "README.md" "$PLUGIN_ROOT/README.md"

chmod +x \
  "$PLUGIN_ROOT/install.sh" \
  "$PLUGIN_ROOT/scripts/install.sh" \
  "$PLUGIN_ROOT/scripts/uninstall.sh" \
  "$PLUGIN_ROOT/scripts/track-activity.py"

printf 'Downloaded ziit-codex to %s\n' "$PLUGIN_ROOT"
exec "$PLUGIN_ROOT/scripts/install.sh"
