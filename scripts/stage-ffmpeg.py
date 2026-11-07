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

The same hazard exists on Linux with a distro or `/usr/local` ffmpeg, which
pulls in libavcodec/libx264/etc. from paths the user's machine may not have.

So on both platforms the rule is the same: the binary may reference only
libraries that live in system locations. macOS checks `otool -L` against
`/usr/lib` and `/System/Library`; Linux checks `ldd` against `/lib`, `/lib64`,
`/usr/lib` and `/usr/lib64`, and accepts a fully static binary outright.
`imageio-ffmpeg` qualifies on both (its macOS build is osxexperts'; its Linux
build references only the glibc core); Homebrew's and a distro ffmpeg do not.

Search order:
  1. `imageio_ffmpeg.get_ffmpeg_exe()` from the active Python.
  2. `imageio_ffmpeg.get_ffmpeg_exe()` from `transcribe/.venv` (the repo's
     uv env). Lets you run this script under any /usr/bin/python3 without
     adding a global pip install step.
  3. `ffmpeg` on PATH — only if it passes the self-contained check.
"""

from __future__ import annotations

import os
import re
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


# macOS: every machine has /usr/lib and /System/Library. A reference anywhere
# else (/opt/homebrew, /usr/local, a build tree) is to something the user may
# not have, which is the failure mode this check exists to prevent.
_MACOS_SYSTEM_LIB_PREFIXES = ("/usr/lib/", "/System/")

# Linux needs a *name* allowlist, not a path one, and this is worth explaining
# because the obvious implementation is wrong.
#
# On macOS the dangerous dependency lives somewhere conspicuous: Homebrew's
# ffmpeg references /opt/homebrew/Cellar/..., so "is it under /usr/lib?"
# separates safe from unsafe perfectly.
#
# On Linux it does not. Ubuntu's own ffmpeg links libavcodec, libavfilter and
# friends from /usr/lib/<triple>/ — the same directory as libc. A path-prefix
# rule accepts it, and we would happily bundle an ffmpeg that dies on any
# machine without the `ffmpeg` apt package installed. (A real regression: an
# earlier version of this function did exactly that, and the container test
# caught it.)
#
# What is actually guaranteed on a target machine is the glibc/gcc runtime and
# nothing else, so that is the list. Everything else — libav*, libx264, even
# libz — must be statically linked into the binary we ship. imageio-ffmpeg's
# Linux build satisfies this; a distro or /usr/local ffmpeg does not.
_LINUX_ALLOWED_LIBS = re.compile(
    r"""^(
          linux-vdso\.so(\.\d+)?       # virtual DSO, no backing file
        | ld(-linux)?[^/]*\.so(\.\d+)? # the loader itself
        | libc\.so\.6
        | libm\.so\.6
        | libdl\.so\.2                 # stubs in glibc >= 2.34, still referenced
        | librt\.so\.1
        | libpthread\.so\.0
        | libgcc_s\.so\.1              # gcc runtime
        | libstdc\+\+\.so\.6          # ditto; Electron itself depends on it
        )$""",
    re.VERBOSE,
)


def _is_self_contained_macos(binary: str) -> bool:
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
        if path.startswith(_MACOS_SYSTEM_LIB_PREFIXES):
            continue
        # Self-reference (binary's own install_name) doesn't count.
        if os.path.basename(path) == os.path.basename(binary):
            continue
        print(f"  rejected: {binary} depends on non-system dylib: {path}", file=sys.stderr)
        return False
    return True


def _is_self_contained_linux(binary: str) -> bool:
    """True if `ldd` shows only system libraries, or the binary is static.

    `ldd` exits non-zero and prints "not a dynamic executable" for a fully
    static binary, which is the strongest possible pass, so the exception path
    has to inspect the output rather than just give up.
    """
    try:
        out = subprocess.check_output(["ldd", binary], stderr=subprocess.STDOUT, text=True)
    except subprocess.CalledProcessError as exc:
        out = exc.output or ""
        if "not a dynamic executable" in out:
            return True
        # ldd refused for some other reason — allow, as on macOS.
        return True
    except FileNotFoundError:
        return True

    if "not a dynamic executable" in out:
        return True

    for raw in out.splitlines():
        line = raw.strip()
        if not line:
            continue
        if "=>" in line:
            _, right = line.split("=>", 1)
            right = right.strip()
            if right.startswith("not found"):
                print(
                    f"  rejected: {binary} has an unresolved dependency: {line}",
                    file=sys.stderr,
                )
                return False
            # "=>  (0x...)" — a virtual DSO with no backing file.
            if right.startswith("("):
                continue
            target = right.split(" (", 1)[0].strip()
        else:
            # "linux-vdso.so.1 (0x...)" or "/lib/ld-linux-x86-64.so.2 (0x...)"
            target = line.split(" (", 1)[0].strip()
            if not target.startswith("/"):
                continue

        if _LINUX_ALLOWED_LIBS.match(os.path.basename(target)):
            continue
        print(
            f"  rejected: {binary} depends on {os.path.basename(target)} ({target}),"
            " which is not part of the base system runtime",
            file=sys.stderr,
        )
        return False
    return True


def _is_self_contained(binary: str) -> bool:
    """True if `binary` only references libraries present on a stock system.

    Returns True on platforms we have no check for, so the script does not
    false-fail in unrelated dev environments.
    """
    if sys.platform == "darwin":
        return _is_self_contained_macos(binary)
    if sys.platform.startswith("linux"):
        return _is_self_contained_linux(binary)
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

    if sys.platform == "darwin":
        why = (
            "Bundling Homebrew's ffmpeg crashes on other machines (it dyld-references\n"
            "/opt/homebrew/Cellar paths that don't exist there).\n"
        )
        install_hint = "  - System Python:    pip3 install --user imageio-ffmpeg\n"
    else:
        why = (
            "Bundling a distro or /usr/local ffmpeg crashes on other machines (it\n"
            "references libavcodec/libx264/etc. from paths that may not exist there).\n"
        )
        install_hint = (
            "  - System Python:    pip3 install --break-system-packages imageio-ffmpeg\n"
        )

    print(
        "\nCould not locate a self-contained ffmpeg for bundling.\n"
        + why
        + "\nOptions:\n"
        + install_hint
        + "  - Repo venv:        cd transcribe && uv sync\n"
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
