"""Single Starlark constant for the Rust workspace's release version.

Kept in lockstep with `APP_VERSION` in //electron/constants.ts and the
`workspace.package.version` in //transcribe_rs/Cargo.toml; enforced at
test time by //tools/bazel:version_consistency_test.

Loaded by per-crate BUILD.bazel files to set `CARGO_PKG_VERSION` (so
`clap`'s `--version` flag and any other compile-time-version-aware code
match what Electron ships). The binaries are bundled into the packaged app
rather than downloaded — see the note in Cargo.toml.
"""

APP_VERSION = "1.9.5"
