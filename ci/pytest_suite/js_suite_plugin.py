"""Pytest options and reporting for the JavaScript suites.

pytest.ini loads this module as a plugin (-p js_suite_plugin) so that its command-line
options exist before pytest parses the command line.

`python -m pytest` from the repository root runs both suites. With --results-md PATH it
also writes a Markdown summary of the run to PATH, replacing any earlier file; CI commits
that summary to docs/test-reports/ci-latest-results.md after every push to main.
"""

from pathlib import Path

import pytest

import results_report
from js_suites import REPO_ROOT, SUITES, completed_runs

OUTCOMES = pytest.StashKey[dict]()


def pytest_addoption(parser):
    group = parser.getgroup("bookstore", "Online Bookstore JavaScript suites")
    group.addoption(
        "--suite",
        action="append",
        choices=[suite.key for suite in SUITES],
        help="Run only this suite; repeat for more. Default: every suite.",
    )
    group.addoption(
        "--js-output-dir",
        default=str(REPO_ROOT / "test-results"),
        help="Folder for the raw JSON reports and console logs. Default: test-results/.",
    )
    group.addoption(
        "--results-md",
        default=None,
        metavar="PATH",
        help="Write a Markdown summary of the run to PATH, overwriting it.",
    )


def pytest_configure(config):
    config.stash[OUTCOMES] = {}


@pytest.hookimpl(wrapper=True)
def pytest_runtest_makereport(item, call):
    report = yield
    callspec = getattr(item, "callspec", None)
    case = callspec.params.get("case") if callspec else None
    # Keep the call-phase outcome, unless setup or teardown did not pass.
    if case is not None and (report.when == "call" or report.outcome != "passed"):
        item.config.stash[OUTCOMES][item.nodeid] = (case, report.outcome)
    return report


def pytest_terminal_summary(terminalreporter, exitstatus, config):
    path = config.getoption("results_md")
    if not path:
        return
    path = Path(path)
    results_report.write(path, completed_runs(), list(config.stash[OUTCOMES].values()), int(exitstatus))
    terminalreporter.write_line(f"Results summary written to {path}")
