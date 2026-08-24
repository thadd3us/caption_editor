# Agent notes

Human-oriented workflow and architecture: [CLAUDE.md](CLAUDE.md).

## Testing — use Bazel for Rust

**Do not use `cargo test` for Rust in this repo.** Bazel is the canonical, cached path (same as CI and `bazelisk test //...`).

```bash
# All default tests (TS tooling, Python, Rust, consistency checks)
bazelisk test //...

# Rust unit tests (e.g. caption-core ffmpeg resolution)
bazelisk test //transcribe_rs/caption-core:caption_core_test

# Rust ↔ Python post-processing parity (insta snapshots)
bazelisk test //transcribe_rs/caption-core:post_processing_pipeline

# One crate’s tests under transcribe_rs/
bazelisk test //transcribe_rs/caption-core/...
```

Inner-loop without Bazel is fine for **TypeScript** (`npm run test:unit`) and **Python** (`cd transcribe && uv run pytest tests/ -v`). For **transcribe_rs/** changes, prefer the Bazel targets above so crate-universe deps and runfiles match production builds.

If `bazelisk` is not on PATH, install it (`brew install bazelisk`) rather than
falling back to a bare `bazel` — see below.

### Bazel version

`.bazelversion` pins the Bazel release (currently `9.2.0`). **Use `bazelisk`, which
reads it** — a bare Homebrew `bazel` ignores the pin, and a different major can
rewrite `MODULE.bazel.lock` into another `lockFileVersion`, producing a large diff
that has nothing to do with your change.

To upgrade: edit `.bazelversion`, run `bazelisk mod deps --lockfile_mode=update`,
and commit `.bazelversion` and `MODULE.bazel.lock` **together** — they are a pair.

## E2E (Playwright + Electron)

Prefer Bazel targets over env vars (`SKIP_EXPENSIVE_TESTS`, `RUN_E2E_ASR`, etc. are removed).

```bash
# Default suite in `bazel test //...` — UI/platform tests only
bazelisk test //:e2e_playwright

# ASR / embedding / full-pipeline (@expensive in spec titles) — manual
bazelisk test //:e2e_playwright_expensive

# Interactive (headed: HEADLESS=false bazel run //:e2e_playwright_bin)
bazelisk run //:e2e_playwright_bin
bazelisk run //:e2e_playwright_expensive_bin
```

Requires `npm install` once (source-tree `node_modules`). The wrapper runs `build:all`, `build:rust`, and `verify:dist-rust` (includes bundled `ffmpeg`) before Playwright. `build:ffmpeg` uses `python3 scripts/stage-ffmpeg.py` (ffmpeg on PATH or imageio-ffmpeg if installed in that Python).

npm equivalents: `npm run test:e2e` (default), `npm run test:e2e:expensive`.
