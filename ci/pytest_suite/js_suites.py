"""Run the JavaScript test suites and read back their per-test results.

The server suite runs on Jest and the client suite on Vitest. Both are started with
`npm test -w <workspace>`, the same command developers run, plus a JSON reporter so that
every JavaScript test case can be reported to pytest as a test of its own.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

_ANSI = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")
_LOG_TAIL_LINES = 60


@dataclass(frozen=True)
class Suite:
    key: str
    title: str
    runner: str
    workspace: str

    def reporter_args(self, json_path: str) -> list[str]:
        if self.runner == "Jest":
            return ["--json", f"--outputFile={json_path}"]
        # Vitest: keep the usual console reporter and add a JSON report beside it.
        return ["--reporter=default", "--reporter=json", f"--outputFile.json={json_path}"]


SUITES = (
    Suite("server", "Server", "Jest", "server"),
    Suite("client", "Client", "Vitest", "client"),
)


@dataclass(frozen=True)
class Case:
    """One JavaScript test case, or a suite-level failure that no test case reports."""

    suite: Suite
    file: str  # repository-relative path, "" for a runner-level problem
    name: str  # describe blocks and test title joined with " > "
    status: str  # passed | failed | skipped
    duration_ms: float | None = None
    message: str = ""

    @property
    def test_id(self) -> str:
        return ":".join(part for part in (self.suite.key, self.file, self.name) if part)


@dataclass
class SuiteRun:
    suite: Suite
    exit_code: int | None
    seconds: float
    cases: list[Case] = field(default_factory=list)
    log_path: Path | None = None


_runs: dict[str, SuiteRun] = {}


def run_suite(suite: Suite, out_dir: Path) -> SuiteRun:
    """Run a suite once per pytest session and return its results."""
    if suite.key not in _runs:
        _runs[suite.key] = _run(suite, out_dir)
    return _runs[suite.key]


def completed_runs() -> list[SuiteRun]:
    return list(_runs.values())


def _run(suite: Suite, out_dir: Path) -> SuiteRun:
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / f"{suite.key}.json"
    log_path = out_dir / f"{suite.key}.log"
    json_path.unlink(missing_ok=True)

    npm = shutil.which("npm")
    if npm is None:
        return SuiteRun(suite, None, 0.0, [_runner_failure(suite, "npm was not found on PATH.")])

    # npm runs the test script inside the workspace folder. A path relative to that folder
    # avoids quoting problems with spaces in absolute paths when npm is a Windows .cmd file.
    workspace_dir = REPO_ROOT / suite.workspace
    report_arg = os.path.relpath(json_path, workspace_dir).replace(os.sep, "/")
    command = [npm, "test", "-w", suite.workspace, "--", *suite.reporter_args(report_arg)]
    env = {**os.environ, "FORCE_COLOR": "0"}

    started = time.monotonic()
    try:
        with log_path.open("w", encoding="utf-8", errors="replace") as log:
            exit_code = subprocess.run(
                command, cwd=REPO_ROOT, stdout=log, stderr=subprocess.STDOUT, env=env, check=False
            ).returncode
    except OSError as err:
        return SuiteRun(suite, None, 0.0, [_runner_failure(suite, f"Could not start npm: {err}")])
    seconds = time.monotonic() - started

    try:
        report = json.loads(json_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as err:
        message = f"{suite.runner} did not write a readable JSON report ({err}).\n\n{_tail(log_path)}"
        return SuiteRun(suite, exit_code, seconds, [_runner_failure(suite, message)], log_path)

    cases = _parse(suite, report)
    if exit_code != 0 and not any(case.status == "failed" for case in cases):
        message = (
            f"`npm test -w {suite.workspace}` exited with code {exit_code} although no test "
            f"case failed.\n\n{_tail(log_path)}"
        )
        cases.append(_runner_failure(suite, message))
    return SuiteRun(suite, exit_code, seconds, cases, log_path)


def _parse(suite: Suite, report: dict) -> list[Case]:
    """Read the Jest-style JSON report that both Jest and Vitest write."""
    cases = []
    for result in report.get("testResults", []):
        file = _relative(result.get("name", ""))
        assertions = result.get("assertionResults") or []
        for assertion in assertions:
            status = assertion.get("status")
            cases.append(
                Case(
                    suite=suite,
                    file=file,
                    name=" > ".join([*assertion.get("ancestorTitles", []), assertion.get("title", "")]),
                    status=status if status in ("passed", "failed") else "skipped",
                    duration_ms=assertion.get("duration"),
                    message=_clean("\n".join(assertion.get("failureMessages") or [])),
                )
            )
        # A file that fails to load, or fails in a hook, can fail without any failed test case.
        if result.get("status") == "failed" and not any(a.get("status") == "failed" for a in assertions):
            message = _clean(result.get("message") or "") or "The test file failed outside any test case."
            cases.append(Case(suite, file, "(test file)", "failed", None, message))
    return cases


def _runner_failure(suite: Suite, message: str) -> Case:
    return Case(suite, "", f"{suite.runner} run", "failed", None, message)


def _relative(path: str) -> str:
    if not path:
        return ""
    try:
        return os.path.relpath(path, REPO_ROOT).replace(os.sep, "/")
    except ValueError:  # a different drive on Windows
        return path


def _clean(text: str) -> str:
    return _ANSI.sub("", text).strip()


def _tail(log_path: Path) -> str:
    try:
        lines = log_path.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return ""
    return "Last lines of the output:\n" + _clean("\n".join(lines[-_LOG_TAIL_LINES:]))
