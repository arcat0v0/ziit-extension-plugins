#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import io
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest import mock


sys.dont_write_bytecode = True


SCRIPT = Path(__file__).with_name("track-activity.py")


def load_tracker(config_home: Path):
    os.environ["XDG_CONFIG_HOME"] = str(config_home)
    spec = importlib.util.spec_from_file_location("ziit_codex_tracker", SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load {SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class CodexTrackerTests(unittest.TestCase):
    def test_unresponsive_server_does_not_block_hook_process(self) -> None:
        request_started = threading.Event()
        release_request = threading.Event()

        class SlowHandler(BaseHTTPRequestHandler):
            def do_POST(self) -> None:
                request_started.set()
                release_request.wait(timeout=5)
                self.send_response(503)
                self.end_headers()

            def log_message(self, *_args) -> None:
                pass

        server = ThreadingHTTPServer(("127.0.0.1", 0), SlowHandler)
        server_thread = threading.Thread(target=server.serve_forever, daemon=True)
        server_thread.start()
        try:
            with tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                config_home = root / "config"
                ziit_dir = config_home / "ziit"
                ziit_dir.mkdir(parents=True)
                (ziit_dir / "config.json").write_text(
                    json.dumps(
                        {
                            "apiKey": "test-key",
                            "baseUrl": f"http://127.0.0.1:{server.server_port}",
                        }
                    ),
                    encoding="utf-8",
                )
                source_file = root / "example.py"
                source_file.write_text("print('hello')\n", encoding="utf-8")
                event = {
                    "hook_event_name": "PostToolUse",
                    "session_id": "session-1",
                    "cwd": str(root),
                    "tool_name": "apply_patch",
                    "tool_input": {
                        "command": f"*** Update File: {source_file.name}",
                    },
                }
                env = {**os.environ, "XDG_CONFIG_HOME": str(config_home)}

                started_at = time.monotonic()
                result = subprocess.run(
                    [sys.executable, str(SCRIPT)],
                    input=json.dumps(event),
                    text=True,
                    capture_output=True,
                    env=env,
                    timeout=2,
                    check=False,
                )
                elapsed = time.monotonic() - started_at

                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertLess(elapsed, 2)
                self.assertTrue(request_started.wait(timeout=2))
                release_request.set()

                offline_file = ziit_dir / "offline_codex_heartbeats.json"
                deadline = time.monotonic() + 2
                while time.monotonic() < deadline:
                    queued = json.loads(offline_file.read_text(encoding="utf-8"))
                    if queued:
                        break
                    time.sleep(0.01)
                self.assertEqual(len(queued), 1)
        finally:
            release_request.set()
            server.shutdown()
            server.server_close()
            server_thread.join(timeout=2)

    def test_hook_queues_before_starting_background_upload(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            config_home = root / "config"
            ziit_dir = config_home / "ziit"
            ziit_dir.mkdir(parents=True)
            (ziit_dir / "config.json").write_text(
                json.dumps(
                    {
                        "apiKey": "test-key",
                        "baseUrl": "http://127.0.0.1:1",
                    }
                ),
                encoding="utf-8",
            )
            source_file = root / "example.py"
            source_file.write_text("print('hello')\n", encoding="utf-8")
            tracker = load_tracker(config_home)
            event = {
                "hook_event_name": "PostToolUse",
                "session_id": "session-1",
                "cwd": str(root),
                "tool_name": "apply_patch",
                "tool_input": {
                    "command": f"*** Update File: {source_file.name}",
                },
            }

            with (
                mock.patch.object(tracker, "start_flush_worker") as start_worker,
                mock.patch.object(
                    tracker,
                    "send_request",
                    side_effect=AssertionError("hook must not upload synchronously"),
                ),
                mock.patch.object(sys, "stdin", io.StringIO(json.dumps(event))),
            ):
                self.assertEqual(tracker.main(), 0)

            start_worker.assert_called_once_with()
            queued = json.loads(tracker.OFFLINE_FILE.read_text(encoding="utf-8"))
            self.assertEqual(len(queued), 1)
            self.assertEqual(queued[0]["file"], str(source_file))

    def test_failed_background_sync_restores_claimed_queue(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            tracker = load_tracker(Path(temp) / "config")
            payload = {"file": "/tmp/example.py"}
            tracker.enqueue_heartbeats([payload])
            config = tracker.ZiitConfig("test-key", "http://127.0.0.1:1")

            with mock.patch.object(tracker, "send_request", return_value=False):
                tracker.sync_offline_queue(config)

            self.assertEqual(tracker.load_offline_queue(), [payload])
            self.assertFalse(tracker.OFFLINE_INFLIGHT_FILE.exists())

    def test_inflight_batch_prevents_duplicate_uploaders_and_recovers(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            tracker = load_tracker(Path(temp) / "config")
            payload = {"file": "/tmp/example.py"}
            tracker.enqueue_heartbeats([payload])

            self.assertEqual(tracker.claim_offline_queue(), [payload])
            self.assertEqual(tracker.claim_offline_queue(), [])

            stale_time = time.time() - tracker.STALE_QUEUE_LOCK_SECONDS - 1
            os.utime(
                tracker.OFFLINE_INFLIGHT_FILE,
                (stale_time, stale_time),
            )
            self.assertEqual(tracker.claim_offline_queue(), [payload])


if __name__ == "__main__":
    unittest.main()
