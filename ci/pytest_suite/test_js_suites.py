"""Every server (Jest) and client (Vitest) test case, reported as a pytest test.

The suites run once, during collection, and each of their test cases becomes one
parametrised case of `test_javascript_case`. Use --suite server or --suite client to run
only one of them.
"""

from pathlib import Path

import pytest

from js_suites import SUITES, run_suite


def pytest_generate_tests(metafunc):
    if "case" not in metafunc.fixturenames:
        return
    selected = metafunc.config.getoption("suite") or [suite.key for suite in SUITES]
    out_dir = Path(metafunc.config.getoption("js_output_dir"))
    cases = [
        case
        for suite in SUITES
        if suite.key in selected
        for case in run_suite(suite, out_dir).cases
    ]
    metafunc.parametrize("case", cases, ids=[case.test_id for case in cases])


def test_javascript_case(case):
    if case.status == "skipped":
        pytest.skip(f"skipped in {case.suite.runner}")
    if case.status == "failed":
        pytest.fail(case.message or f"failed in {case.suite.runner}", pytrace=False)
