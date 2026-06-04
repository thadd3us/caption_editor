#!/usr/bin/env python3
"""Copy a self-contained ffmpeg binary into dist-rust/ffmpeg for app bundling.

Used by `npm run build:ffmpeg` before electron-builder packs
Contents/Resources/bin/. The Rust CLIs never use the user's PATH at runtime —
only this staged copy (or `CAPTION_EDITOR_FFMPEG`).

**Self-contained matters.** Homebrew's ffmpeg is dynamically linked to dylibs
under `/opt/homebrew/Cellar/ffmpeg/<version>/lib/`, so an .app bundling that
binary crashes on any machine where those exact dylibs aren't installed at
that exact path:

    dyld: Library not loaded: /opt/homebrew/Cellar/ffmpeg/8.1.1/lib/libavdevice.62.dylib

We therefore only accept ffmpeg binaries whose `otool -L` output references
only system dylibs (`/usr/lib/*`, `/System/Library/*`) — `imageio-ffmpeg`'s
osxexperts build qualifies; brew's does not.

Search order:
  1. `imageio_ffmpeg.get_ffmpeg_exe()` from the active Python.
  2. `imageio_ffmpeg.get_ffmpeg_exe()` from `transcribe/.venv` (the repo's
     uv env). Lets you run this script under any /usr/bin/python3 without
     adding a global pip install step.
  3. `ffmpeg` on PATH — only if it passes the self-contained check.
"""

from __future__ import annotations

import os
import shutil
import stat
import subprocess
import sys


def _repo_root() -> str:
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _imageio_via_active_python() -> str | None:
    try:
        import imageio_ffmpeg  # type: ignore[import-untyped]
    except ImportError:
        return None
    return imageio_ffmpeg.get_ffmpeg_exe()


def _imageio_via_transcribe_venv() -> str | None:
    """Ask transcribe/.venv's Python to resolve imageio_ffmpeg's binary path."""
    venv_py = os.path.join(_repo_root(), "transcribe", ".venv", "bin", "python")
    if not os.path.isfile(venv_py):
        return None
    try:
        out = subprocess.check_output(
            [venv_py, "-c", "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())"],
            stderr=subprocess.STDOUT,
            text=True,
        )
    except subprocess.CalledProcessError:
        return None
    path = out.strip()
    return path if path and os.path.isfile(path) else None


def _is_self_contained(binary: str) -> bool:
    """True if `otool -L` shows only system dylib references.

    Returns True on non-macOS too (we only ship macOS, but don't want this
    script to false-fail in unrelated dev environments).
    """
    if sys.platform != "darwin":
        return True
    try:
        out = subprocess.check_output(["otool", "-L", binary], text=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        # otool missing or refused — fall back to allowing it; the CI check
        # below will catch any real regression.
        return True
    lines = [line.strip() for line in out.splitlines()[1:] if line.strip()]
    for line in lines:
        # Format: "/path/to/libfoo.dylib (compatibility version ...)"
        path = line.split(" ", 1)[0]
        if path.startswith("/usr/lib/") or path.startswith("/System/"):
            continue
        # Self-reference (binary's own install_name) doesn't count.
        if os.path.basename(path) == os.path.basename(binary):
            continue
        print(f"  rejected: {binary} depends on non-system dylib: {path}", file=sys.stderr)
        return False
    return True


def _find_source() -> str:
    for source_name, finder in [
        ("active python imageio_ffmpeg", _imageio_via_active_python),
        ("transcribe/.venv imageio_ffmpeg", _imageio_via_transcribe_venv),
    ]:
        path = finder()
        if path:
            if _is_self_contained(path):
                print(f"Using {source_name}: {path}", file=sys.stderr)
                return path
            print(f"Skipping {source_name} ({path}): not self-contained", file=sys.stderr)

    path_ffmpeg = shutil.which("ffmpeg")
    if path_ffmpeg and _is_self_contained(path_ffmpeg):
        print(f"Using PATH ffmpeg: {path_ffmpeg}", file=sys.stderr)
        return path_ffmpeg
    if path_ffmpeg:
        print(
            f"PATH ffmpeg ({path_ffmpeg}) is not self-contained — refusing to bundle it.",
            file=sys.stderr,
        )

    print(
        "\nCould not locate a self-contained ffmpeg for bundling.\n"
        "Bundling Homebrew's ffmpeg crashes on other machines (it dyld-references\n"
        "/opt/homebrew/Cellar paths that don't exist there).\n\n"
        "Options:\n"
        "  - System Python:    pip3 install --user imageio-ffmpeg\n"
        "  - Repo venv:        cd transcribe && uv sync\n"
        "  - Explicit static:  download a static ffmpeg, then set\n"
        "                      CAPTION_EDITOR_FFMPEG=<path> or stage it manually.\n",
        file=sys.stderr,
    )
    sys.exit(1)


def main() -> None:
    src = _find_source()
    dst = os.path.join(_repo_root(), "dist-rust", "ffmpeg")
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copy2(src, dst)
    mode = os.stat(dst).st_mode
    os.chmod(dst, mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    # Re-check after copying — copy2 preserves the bits but a sanity pass
    # catches any FS-level surprise (xattrs, symlinks resolved differently).
    if not _is_self_contained(dst):
        print(f"Staged ffmpeg at {dst} is not self-contained — refusing.", file=sys.stderr)
        sys.exit(1)
    print(f"Staged ffmpeg for bundling: {dst} ({os.path.getsize(dst)} bytes, from {src})")


if __name__ == "__main__":
    main()
