#!/usr/bin/env python3
"""Assert package.json and pnpm-lock.yaml agree on every direct dependency.

This repo carries two JS lockfiles. `package-lock.json` drives `npm install`, which is
what the inner loop and the Playwright e2e job use. `pnpm-lock.yaml` drives
`npm_translate_lock` in MODULE.bazel, which is what every hermetic Bazel target resolves
against. They are kept in step by hand: MODULE.bazel tells you to re-run `pnpm import`
after bumping a dep, and nothing enforced it.

Drift is silent and nasty — the `bazel` job and the `e2e` job quietly test different
dependency graphs, and the two CI cache keys hash different files so neither notices.
It is not hypothetical: the two had already diverged before this check existed.

What this does NOT do is re-run `pnpm import` and diff, which would need the network and
a pnpm binary on Bazel's fixed PATH (it has neither). Instead it compares the thing that
actually matters and is cheap to read: the exact version each file pins for each direct
dependency. `.npmrc` sets `save-exact=true`, so every specifier in package.json is an
exact version, and pnpm records it verbatim under `importers: .:`.

Transitive packages are out of scope. If the direct pins agree, the two resolvers were
run against the same inputs, and a transitive difference is a resolver artifact rather
than the forgot-to-sync mistake this guards against.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


def read_package_json(path: Path) -> dict[str, str]:
    data = json.loads(path.read_text())
    pins: dict[str, str] = {}
    for section in ("dependencies", "devDependencies"):
        pins.update(data.get(section, {}))
    return pins


def read_pnpm_importer_specifiers(path: Path) -> dict[str, str]:
    """Parse `importers: -> .: -> {dependencies,devDependencies}` into name -> specifier.

    Hand-rolled rather than via PyYAML: the hermetic Python toolchain has no yaml module,
    and this subsection has a rigid shape. Anything unexpected raises instead of being
    silently skipped, so a lockfile format change fails loudly rather than turning this
    into a test that always passes.
    """
    lines = path.read_text().splitlines()

    try:
        start = next(i for i, line in enumerate(lines) if line.rstrip() == "importers:")
    except StopIteration:
        raise SystemExit(f"{path}: no 'importers:' section — lockfile format changed?")

    # The root importer is the two-space-indented `.:` key under `importers:`.
    try:
        root = next(
            i for i in range(start + 1, len(lines)) if lines[i].rstrip() == "  .:"
        )
    except StopIteration:
        raise SystemExit(f"{path}: no root importer ('  .:') under 'importers:'")

    pins: dict[str, str] = {}
    section: str | None = None
    name: str | None = None

    for line in lines[root + 1 :]:
        if line.strip() == "":
            continue
        indent = len(line) - len(line.lstrip())
        # Dedent back to another importer, or out of `importers:` entirely.
        if indent <= 2:
            break
        stripped = line.strip()

        if indent == 4 and stripped.endswith(":"):
            section = stripped[:-1]
            name = None
        elif indent == 6 and stripped.endswith(":"):
            name = stripped[:-1].strip("'\"")
        elif indent == 8 and stripped.startswith("specifier:"):
            if section in ("dependencies", "devDependencies") and name:
                pins[name] = stripped.split(":", 1)[1].strip().strip("'\"")

    if not pins:
        raise SystemExit(f"{path}: parsed zero direct dependencies — format changed?")
    return pins


def main() -> int:
    # Accepts either the repo root or the path to package.json, so it is equally usable
    # as `python3 tools/bazel/check_lockfile_sync.py .` by hand and from Bazel, which
    # passes `$(location //:package.json)` out of the runfiles tree.
    arg = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.cwd()
    root = arg.parent if arg.name == "package.json" else arg

    npm = read_package_json(root / "package.json")
    pnpm = read_pnpm_importer_specifiers(root / "pnpm-lock.yaml")

    problems: list[str] = []
    for name, want in sorted(npm.items()):
        got = pnpm.get(name)
        if got is None:
            problems.append(f"  {name}: package.json pins {want}, pnpm-lock.yaml has no entry")
        elif got != want:
            problems.append(f"  {name}: package.json pins {want}, pnpm-lock.yaml pins {got}")

    for name in sorted(set(pnpm) - set(npm)):
        problems.append(f"  {name}: in pnpm-lock.yaml but not in package.json")

    if problems:
        print("package.json and pnpm-lock.yaml disagree:\n", file=sys.stderr)
        print("\n".join(problems), file=sys.stderr)
        print(
            "\nRegenerate the pnpm lockfile from the npm one and commit both:\n"
            "    pnpm import\n"
            "(or `bazel run -- @pnpm import` on a machine without pnpm installed)",
            file=sys.stderr,
        )
        return 1

    print(f"OK: {len(npm)} direct dependencies agree across package.json and pnpm-lock.yaml.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
