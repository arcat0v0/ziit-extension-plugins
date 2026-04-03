#!/usr/bin/env python3

from __future__ import annotations

import json
import os
import platform
import re
import shlex
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib import error, request


CONFIG_DIR = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "ziit"
CONFIG_FILE = CONFIG_DIR / "config.json"
LOG_FILE = CONFIG_DIR / "codex.log"
OFFLINE_FILE = CONFIG_DIR / "offline_codex_heartbeats.json"
STATE_FILE = CONFIG_DIR / "codex_session_state.json"
EDITOR_NAME = "Codex CLI"
MIN_SEND_INTERVAL_SECONDS = 45
RECENT_FILE_WINDOW_SECONDS = 180
MAX_FILES_PER_EVENT = 20
IGNORED_DIRS = {
    ".git",
    ".hg",
    ".svn",
    "node_modules",
    ".next",
    ".turbo",
    ".idea",
    ".vscode",
    "dist",
    "build",
    "coverage",
    "target",
    "out",
    "tmp",
    "temp",
    ".cache",
}
LANGUAGE_BY_EXTENSION = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".py": "python",
    ".pyw": "python",
    ".rs": "rust",
    ".go": "go",
    ".rb": "ruby",
    ".java": "java",
    ".kt": "kotlin",
    ".kts": "kotlin",
    ".swift": "swift",
    ".c": "c",
    ".cpp": "cpp",
    ".cc": "cpp",
    ".cxx": "cpp",
    ".hpp": "cpp",
    ".h": "c",
    ".cs": "csharp",
    ".php": "php",
    ".sh": "shell",
    ".bash": "shell",
    ".zsh": "shell",
    ".sql": "sql",
    ".html": "html",
    ".htm": "html",
    ".css": "css",
    ".scss": "css",
    ".sass": "css",
    ".less": "css",
    ".json": "json",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".xml": "xml",
    ".md": "markdown",
    ".markdown": "markdown",
    ".vue": "vue",
    ".svelte": "svelte",
    ".astro": "astro",
    ".prisma": "prisma",
    ".graphql": "graphql",
    ".gql": "graphql",
    ".toml": "toml",
    ".ini": "ini",
    ".cfg": "ini",
}


@dataclass
class ZiitConfig:
    api_key: str
    base_url: str


def ensure_dirs() -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)


def log(message: str) -> None:
    ensure_dirs()
    with LOG_FILE.open("a", encoding="utf-8") as handle:
        handle.write(f"[{time.strftime('%Y-%m-%dT%H:%M:%S%z')}] {message}\n")


def load_json_file(path: Path, fallback: Any) -> Any:
    if not path.exists():
        return fallback
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        log(f"Failed to read {path}: {exc}")
        return fallback


def write_json_file(path: Path, payload: Any) -> None:
    ensure_dirs()
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def load_config() -> ZiitConfig | None:
    raw = load_json_file(CONFIG_FILE, {})
    if not isinstance(raw, dict):
        log(f"Invalid config format in {CONFIG_FILE}")
        return None

    api_key = str(raw.get("apiKey", "")).strip()
    if not api_key:
        log(f"Missing apiKey in {CONFIG_FILE}")
        return None

    base_url = str(raw.get("baseUrl", "https://ziit.app")).rstrip("/")
    return ZiitConfig(api_key=api_key, base_url=base_url)


def detect_os() -> str:
    system = platform.system()
    if system == "Darwin":
        return "macOS"
    if system == "Windows":
        return "Windows"
    if system == "Linux":
        return "Linux"
    return system or "Unknown"


def detect_project(cwd: Path) -> str:
    remote_url = run_git(cwd, ["remote", "get-url", "origin"])
    if remote_url:
        name = Path(remote_url.rstrip("/")).name
        if name.endswith(".git"):
            name = name[:-4]
        if name:
            return name
    return cwd.name or str(cwd)


def detect_branch(cwd: Path) -> str:
    return run_git(cwd, ["branch", "--show-current"])


def run_git(cwd: Path, args: list[str]) -> str:
    try:
        result = subprocess.run(
            ["git", "-C", str(cwd), *args],
            capture_output=True,
            text=True,
            check=False,
        )
    except OSError:
        return ""
    if result.returncode != 0:
        return ""
    return result.stdout.strip()


def parse_event() -> dict[str, Any] | None:
    raw = sys.stdin.read().strip()
    if not raw:
        log("Hook received empty stdin")
        return None
    try:
        event = json.loads(raw)
    except json.JSONDecodeError as exc:
        log(f"Failed to parse hook payload: {exc}")
        return None
    log(f"Received {event.get('hook_event_name', 'unknown')} event")
    return event


def detect_language(file_path: Path) -> str:
    lower_name = file_path.name.lower()
    if lower_name == "dockerfile":
        return "dockerfile"
    return LANGUAGE_BY_EXTENSION.get(file_path.suffix.lower(), "unknown")


def is_candidate_path(token: str) -> bool:
    if not token or token.startswith("-"):
        return False
    if token in {".", "..", "/dev/null"}:
        return False
    if token.startswith(("http://", "https://")):
        return False
    if "=" in token and "/" not in token and not token.startswith("."):
        return False
    return any(
        [
            "/" in token,
            token.startswith("."),
            bool(Path(token).suffix),
            token.endswith(("Dockerfile", "Makefile")),
        ]
    )


def normalize_path(candidate: str, cwd: Path) -> Path | None:
    path = Path(candidate)
    resolved = (cwd / path).resolve() if not path.is_absolute() else path.resolve()
    try:
        relative = resolved.relative_to(cwd.resolve())
    except ValueError:
        return None

    if any(part in IGNORED_DIRS for part in relative.parts[:-1]):
        return None

    if resolved.exists() and resolved.is_file():
        return resolved

    parent = resolved.parent
    if parent.exists() and parent.is_dir() and is_probable_file(candidate):
        return resolved

    return None


def is_probable_file(candidate: str) -> bool:
    path = Path(candidate)
    if path.name.lower() in {"dockerfile", "makefile"}:
        return True
    return bool(path.suffix)


def extract_files_from_patch(command: str, cwd: Path) -> list[Path]:
    matches = re.findall(
        r"^\*\*\* (?:Add|Update|Delete) File: (.+)$", command, flags=re.MULTILINE
    )
    results: list[Path] = []
    for match in matches:
        normalized = normalize_path(match.strip(), cwd)
        if normalized is not None:
            results.append(normalized)
    return results


def extract_files_from_command(command: str, cwd: Path) -> list[Path]:
    candidates = extract_files_from_patch(command, cwd)
    try:
        tokens = shlex.split(command, posix=True)
    except ValueError:
        tokens = command.split()

    redirect_tokens = {">", ">>", "<", "1>", "2>", "2>>"}

    for index, token in enumerate(tokens):
        candidate_tokens = [token]
        if token in redirect_tokens and index + 1 < len(tokens):
            candidate_tokens = [tokens[index + 1]]
        for item in candidate_tokens:
            if not is_candidate_path(item):
                continue
            normalized = normalize_path(item, cwd)
            if normalized is not None:
                candidates.append(normalized)

    return unique_paths(candidates)


def unique_paths(paths: list[Path]) -> list[Path]:
    seen: set[str] = set()
    results: list[Path] = []
    for path in paths:
        key = str(path)
        if key in seen:
            continue
        seen.add(key)
        results.append(path)
    return results


def load_state() -> dict[str, Any]:
    state = load_json_file(STATE_FILE, {})
    if isinstance(state, dict):
        return state
    return {}


def save_state(state: dict[str, Any]) -> None:
    write_json_file(STATE_FILE, state)


def update_session_state(
    state: dict[str, Any], session_id: str, files: list[Path], now: float
) -> None:
    session = state.setdefault(
        session_id, {"files": {}, "lastSent": {}, "updatedAt": 0}
    )
    file_map = session.setdefault("files", {})
    for file_path in files:
        file_map[str(file_path)] = now
    session["updatedAt"] = now


def get_recent_session_files(state: dict[str, Any], session_id: str) -> list[Path]:
    session = state.get(session_id)
    if not isinstance(session, dict):
        return []
    file_map = session.get("files", {})
    if not isinstance(file_map, dict):
        return []
    sorted_files = sorted(
        (
            (float(last_seen), Path(file_path))
            for file_path, last_seen in file_map.items()
            if isinstance(last_seen, (float, int))
        ),
        key=lambda item: item[0],
        reverse=True,
    )
    return [file_path for _, file_path in sorted_files]


def prune_state(state: dict[str, Any], now: float) -> dict[str, Any]:
    max_session_age_seconds = 60 * 60 * 24
    pruned: dict[str, Any] = {}
    for session_id, session in state.items():
        if not isinstance(session, dict):
            continue
        updated_at = session.get("updatedAt")
        if (
            isinstance(updated_at, (float, int))
            and now - float(updated_at) > max_session_age_seconds
        ):
            continue
        pruned[session_id] = session
    return pruned


def should_send(
    state: dict[str, Any], session_id: str, file_path: Path, now: float
) -> bool:
    session = state.setdefault(
        session_id, {"files": {}, "lastSent": {}, "updatedAt": 0}
    )
    sent_map = session.setdefault("lastSent", {})
    previous = sent_map.get(str(file_path))
    if (
        isinstance(previous, (float, int))
        and now - float(previous) < MIN_SEND_INTERVAL_SECONDS
    ):
        return False
    sent_map[str(file_path)] = now
    session["updatedAt"] = now
    return True


def recent_changed_files(cwd: Path, window_seconds: int) -> list[Path]:
    now = time.time()
    git_candidates = recent_git_files(cwd, now, window_seconds)
    if git_candidates:
        return git_candidates[:MAX_FILES_PER_EVENT]

    candidates: list[tuple[float, Path]] = []
    for root, dirs, files in os.walk(cwd):
        dirs[:] = [directory for directory in dirs if directory not in IGNORED_DIRS]
        for name in files:
            path = Path(root) / name
            try:
                modified_at = path.stat().st_mtime
            except OSError:
                continue
            if now - modified_at <= window_seconds:
                candidates.append((modified_at, path.resolve()))

    candidates.sort(key=lambda item: item[0], reverse=True)
    return [path for _, path in candidates[:MAX_FILES_PER_EVENT]]


def recent_git_files(cwd: Path, now: float, window_seconds: int) -> list[Path]:
    output = run_git(cwd, ["status", "--porcelain", "--untracked-files=all"])
    if not output:
        return []
    candidates: list[tuple[float, Path]] = []
    for line in output.splitlines():
        if len(line) < 4:
            continue
        path_text = line[3:].split(" -> ")[-1]
        normalized = normalize_path(path_text, cwd)
        if normalized is None or not normalized.exists():
            continue
        try:
            modified_at = normalized.stat().st_mtime
        except OSError:
            continue
        if now - modified_at <= window_seconds:
            candidates.append((modified_at, normalized))
    candidates.sort(key=lambda item: item[0], reverse=True)
    return unique_paths([path for _, path in candidates])


def heartbeat_payload(file_path: Path, cwd: Path) -> dict[str, Any]:
    return {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
        "project": detect_project(cwd),
        "language": detect_language(file_path),
        "editor": EDITOR_NAME,
        "os": detect_os(),
        "file": str(file_path),
        "branch": detect_branch(cwd) or None,
    }


def load_offline_queue() -> list[dict[str, Any]]:
    payload = load_json_file(OFFLINE_FILE, [])
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    return []


def save_offline_queue(queue: list[dict[str, Any]]) -> None:
    write_json_file(OFFLINE_FILE, queue)


def send_request(url: str, api_key: str, payload: Any) -> bool:
    if os.environ.get("ZIIT_TEST_MODE") == "1":
        print(json.dumps(payload, ensure_ascii=False))
        return True

    data = json.dumps(payload).encode("utf-8")
    req = request.Request(
        url,
        data=data,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=15) as response:
            return 200 <= response.status < 300
    except error.HTTPError as exc:
        log(f"HTTP error {exc.code} for {url}")
        return False
    except error.URLError as exc:
        log(f"Network error for {url}: {exc.reason}")
        return False


def sync_offline_queue(config: ZiitConfig) -> None:
    queue = load_offline_queue()
    if not queue:
        return
    if send_request(f"{config.base_url}/api/external/batch", config.api_key, queue):
        log(f"Synced {len(queue)} offline heartbeats")
        save_offline_queue([])


def send_heartbeats(config: ZiitConfig, payloads: list[dict[str, Any]]) -> None:
    sync_offline_queue(config)
    if not payloads:
        return
    queue = load_offline_queue()
    for payload in payloads:
        sent = send_request(
            f"{config.base_url}/api/external/heartbeat", config.api_key, payload
        )
        if sent:
            log(f"Heartbeat sent for {payload['file']}")
        else:
            queue.append(payload)
            log(f"Queued offline heartbeat for {payload['file']}")
    save_offline_queue(queue)


def collect_files(
    event: dict[str, Any], cwd: Path, state: dict[str, Any]
) -> list[Path]:
    hook_name = str(event.get("hook_event_name", ""))
    session_id = str(event.get("session_id", "default"))
    tool_name = str(event.get("tool_name", ""))
    command = ""
    tool_input = event.get("tool_input")
    if isinstance(tool_input, dict):
        command = str(tool_input.get("command", ""))

    files: list[Path] = []
    if hook_name == "PostToolUse" and tool_name == "Bash" and command:
        files = extract_files_from_command(command, cwd)
        if not files:
            files = recent_changed_files(cwd, RECENT_FILE_WINDOW_SECONDS)
    elif hook_name == "Stop":
        files = get_recent_session_files(state, session_id)
        if not files:
            files = recent_changed_files(cwd, RECENT_FILE_WINDOW_SECONDS)

    return unique_paths(files)[:MAX_FILES_PER_EVENT]


def main() -> int:
    ensure_dirs()
    event = parse_event()
    if event is None:
        return 0

    config = load_config()
    if config is None:
        log("Skipping Codex heartbeat because Ziit config is missing")
        return 0

    cwd_text = str(event.get("cwd") or os.getcwd())
    cwd = Path(cwd_text).resolve()
    state = load_state()
    session_id = str(event.get("session_id", "default"))
    now = time.time()
    state = prune_state(state, now)

    files = collect_files(event, cwd, state)
    if not files:
        log("No candidate files detected for this event")
        save_state(state)
        return 0

    update_session_state(state, session_id, files, now)
    payloads: list[dict[str, Any]] = []
    for file_path in files:
        if should_send(state, session_id, file_path, now):
            payloads.append(heartbeat_payload(file_path, cwd))

    save_state(state)
    if not payloads:
        if str(event.get("hook_event_name", "")) == "Stop":
            sync_offline_queue(config)
        log("All candidate files were rate-limited")
        return 0

    send_heartbeats(config, payloads)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
