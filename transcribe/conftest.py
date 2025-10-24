"""
Pytest configuration for transcribe tests.
"""

from pathlib import Path
import pytest


@pytest.fixture
def repo_root() -> Path:
    """Return the root directory of the repository."""
    return Path(__file__).parent.parent
