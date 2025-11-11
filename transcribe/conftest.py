"""
Pytest configuration for transcribe tests.
"""

from pathlib import Path
import pytest
from syrupy import SnapshotAssertion


@pytest.fixture
def repo_root() -> Path:
    """Return the root directory of the repository."""
    return Path(__file__).parent.parent


@pytest.fixture
def snapshot(snapshot: SnapshotAssertion) -> SnapshotAssertion:
    """Configure syrupy to use separate snapshot files per test.

    This creates individual .ambr files for each test function rather than
    grouping all tests from a test file into one snapshot file.
    """
    return snapshot.use_extension(extension_class=None)
