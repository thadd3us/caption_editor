#!/usr/bin/env bash
# Inspect the built .deb and assert the things the Linux packaging story claims.
#
# Why this exists: the reason we ship a .deb rather than an AppImage is that the
# deb target installs an AppArmor profile granting `userns`, which is what keeps
# Chromium's sandbox working on Ubuntu 24.04+ (where
# `kernel.apparmor_restrict_unprivileged_userns=1` is the default). An AppImage
# silently appends `--no-sandbox` instead — see CLAUDE.md, "Linux packaging".
#
# That claim rests entirely on files electron-builder generates from its own
# templates, so it can regress silently on an electron-builder upgrade. These
# assertions are how we would find out.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEB="${1:-}"

if [[ -z "$DEB" ]]; then
  shopt -s nullglob
  candidates=("$ROOT"/release/*.deb)
  shopt -u nullglob
  if (( ${#candidates[@]} == 0 )); then
    echo "error: no .deb in $ROOT/release — run: npm run package:linux" >&2
    exit 1
  fi
  if (( ${#candidates[@]} > 1 )); then
    echo "error: more than one .deb in $ROOT/release; pass one explicitly" >&2
    printf '  %s\n' "${candidates[@]}" >&2
    exit 1
  fi
  DEB="${candidates[0]}"
fi

echo "Inspecting $DEB"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

dpkg-deb -c "$DEB" > "$work/contents.txt"
dpkg-deb -e "$DEB" "$work/control"

fail=0
note() { echo "  FAIL: $*" >&2; fail=1; }

# --- payload ----------------------------------------------------------------
# Paths are matched loosely because productName ("Caption Editor") contains a
# space and electron-builder's install prefix has changed shape before.
need_path() {
  if grep -qE "$1" "$work/contents.txt"; then
    echo "  ok: $2"
  else
    note "$2 (no match for /$1/ in package contents)"
  fi
}

need_path 'chrome-sandbox'                       'ships chrome-sandbox (the SUID sandbox helper)'
need_path 'resources/apparmor-profile'           'ships an AppArmor profile'
need_path 'resources/bin/transcribe-rs'          'ships transcribe-rs'
need_path 'resources/bin/embed-rs'               'ships embed-rs'
need_path 'resources/bin/ffmpeg'                 'ships the staged ffmpeg'
need_path 'resources/wespeaker-onnx/model\.onnx' 'ships the wespeaker model'
need_path 'applications/.*\.desktop'             'ships a .desktop entry'

# --- the AppArmor profile must actually grant userns ------------------------
profile_path="$(awk '/resources\/apparmor-profile/ {print $NF; exit}' "$work/contents.txt" || true)"
if [[ -n "$profile_path" ]]; then
  dpkg-deb --fsys-tarfile "$DEB" > "$work/fsys.tar"
  tar -xOf "$work/fsys.tar" ".${profile_path#.}" > "$work/apparmor" 2>/dev/null || true
  if [[ -s "$work/apparmor" ]]; then
    echo "  --- apparmor profile ---"
    sed 's/^/      /' "$work/apparmor"
    if grep -qE '^[[:space:]]*userns[[:space:]]*,' "$work/apparmor"; then
      echo "  ok: profile grants userns"
    else
      note "profile does not grant userns — the Chromium sandbox will not start on Ubuntu 24.04+"
    fi
  else
    note "could not extract the AppArmor profile from the package"
  fi
fi

# --- postinst must install and load it --------------------------------------
if [[ -f "$work/control/postinst" ]]; then
  grep -q 'apparmor_parser' "$work/control/postinst" \
    && echo "  ok: postinst loads the AppArmor profile" \
    || note 'postinst does not run apparmor_parser'
  grep -q '/etc/apparmor.d/' "$work/control/postinst" \
    && echo "  ok: postinst installs into /etc/apparmor.d/" \
    || note 'postinst does not install into /etc/apparmor.d/'
  grep -q 'chmod 4755' "$work/control/postinst" \
    && echo "  ok: postinst handles the SUID chrome-sandbox fallback" \
    || note 'postinst does not set up chrome-sandbox SUID fallback'
else
  note 'package has no postinst'
fi

# --- control metadata -------------------------------------------------------
# Both are hard requirements of electron-builder's fpm target: without them it
# refuses to build at all. Asserting them here turns "the build broke" into a
# named cause.
for field in Maintainer Homepage; do
  if grep -q "^$field:" "$work/control/control"; then
    echo "  ok: control has $field"
  else
    note "control is missing $field"
  fi
done

echo "  --- control ---"
sed 's/^/      /' "$work/control/control"

if (( fail )); then
  echo "FAILED: the .deb does not match what CLAUDE.md claims about Linux packaging" >&2
  exit 1
fi
echo "OK: .deb contents match the documented Linux packaging behaviour"
