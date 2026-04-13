"""Helpers for syrupy snapshot tests in ``transcribe/``.

Syrupy compares serialized Amber (``.ambr``) text. Use ``matcher`` to normalize
non-deterministic values (e.g. float jitter) so the on-disk snapshot stays
human-readable and stable. Use ``exclude`` (``syrupy.filters.paths`` /
``props``) only when you want fields omitted entirely from the snapshot.
"""

from __future__ import annotations

from syrupy.matchers import path_type


def rounded_floats_matcher(*, ndigits: int = 5):
    """Matcher that rounds every ``float`` during serialization.

    Applied at assertion time: both the recalled snapshot and the new data are
    serialized through the same matcher, so tiny FP differences do not fail
    tests while numeric values still appear in ``.ambr`` files (rounded).
    """
    return path_type(
        types=(float,),
        replacer=lambda data, _: round(data, ndigits),
    )
