# Agent notes

Human-oriented workflow and architecture: [CLAUDE.md](CLAUDE.md).

## Testing — use Bazel for Rust

**Do not use `cargo test` for Rust in this repo.** Bazel is the canonical, cached path, and it is what CI runs (see [Continuous integration](#continuous-integration)).

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

### Continuous integration

`.github/workflows/test.yml` runs on every PR and every push to `main`, on
`macos-latest` (the repo is macOS-first: `transcribe-rs` enables parakeet-rs's
`coreml` feature and `.bazelrc` hard-codes `/opt/homebrew/bin`). Two jobs:

| job | command | covers |
| --- | --- | --- |
| `bazel` | `bazelisk test //... --test_tag_filters=-requires-torch,-requires-network` | vue-tsc, vitest, eslint, Rust crates, Python suite, version/hash guards |
| `e2e` | `bazelisk test //:e2e_playwright` | Playwright + Electron, minus `@expensive` |

Targets are selected **by tag, not by a list**, so a new test target is picked up
with no CI edit. What CI does *not* run: `requires-torch` (the five heavy
`transcribe` tests), `requires-network` outside the e2e job, and anything
`manual` (`//:e2e_playwright_expensive`, `//transcribe:transcribe_rs_parity_test`).

`bazelisk test //...` locally is a **superset** of the `bazel` job — it also runs
the heavy torch tests. Green locally therefore implies green in CI, not the
reverse.

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
