"""
Pytest configuration for transcribe tests.
"""

import os
from pathlib import Path
import pytest
from syrupy import SnapshotAssertion

from repo_root import REPO_ROOT


def pytest_collection_modifyitems(config, items):
    """Skip expensive tests when SKIP_EXPENSIVE_TESTS=true."""
    if os.environ.get("SKIP_EXPENSIVE_TESTS") == "true":
        skip_expensive = pytest.mark.skip(reason="Skipping expensive test (SKIP_EXPENSIVE_TESTS=true)")
        for item in items:
            if "expensive" in item.keywords:
                item.add_marker(skip_expensive)


@pytest.fixture
def repo_root() -> Path:
    """Return the root directory of the repository."""
    return REPO_ROOT


@pytest.fixture
def snapshot(snapshot: SnapshotAssertion) -> SnapshotAssertion:
    """Configure syrupy to use separate snapshot files per test.

    This creates individual .ambr files for each test function rather than
    grouping all tests from a test file into one snapshot file.
    """
    return snapshot.use_extension(extension_class=None)
