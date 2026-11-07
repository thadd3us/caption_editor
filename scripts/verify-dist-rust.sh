#!/usr/bin/env bash
# Assert dist-rust/ has the native binaries electron-builder copies into the app.
#
# This runs inside `npm run package:*`, before electron-builder. Without it a
# missing dist-rust/ffmpeg produces an app that looks fine and then cannot
# transcribe anything, because transcribe-rs/embed-rs deliberately refuse to
# fall back to the user's PATH.
#
# It also checks the binaries are for the platform we are packaging for. Staging
# is easy to get half-right when switching between macOS and Linux in the same
# clone: dist-rust/ is not cleaned between builds, so a stale Mach-O binary from
# a previous macOS build will sit there and be packaged into a .deb, where it
# cannot run at all.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$ROOT/dist-rust"

case "$(uname -s)" in
  Darwin) want="Mach-O" ;;
  Linux)  want="ELF" ;;
  *)      want="" ;;  # unknown host: existence checks only
esac

for name in transcribe-rs embed-rs ffmpeg; do
  path="$DIST/$name"
  if [[ ! -f "$path" ]]; then
    echo "error: missing $path — run: npm run build:rust" >&2
    exit 1
  fi
  if [[ ! -x "$path" ]]; then
    echo "error: not executable: $path — run: npm run build:rust" >&2
    exit 1
  fi
  # `file` is not guaranteed present (slim CI images), so only assert when both
  # it and a known expectation are available.
  if [[ -n "$want" ]] && command -v file >/dev/null 2>&1; then
    kind="$(file -b "$path")"
    if [[ "$kind" != *"$want"* ]]; then
      echo "error: $path is not a $want binary for this host: $kind" >&2
      echo "       dist-rust/ is stale — remove it and re-run: npm run build:rust" >&2
      exit 1
    fi
  fi
done

echo "OK: dist-rust bundle (transcribe-rs, embed-rs, ffmpeg)"
