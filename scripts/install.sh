#!/bin/bash
# Installer for heides-volt on Linux and macOS.
# Zero dependencies beyond node 18. Installs nowhere global
# unless asked: default runs from the clone dir.
set -eu

REPO_URL="https://github.com/AbduljabbarBXR/heides-volt.git"
DEST="${1:-$HOME/heides-volt}"

if ! command -v node >/dev/null 2>&1; then
  echo "need node 18 or newer first, see https://nodejs.org"
  exit 1
fi

if [ ! -d "$DEST" ]; then
  git clone "$REPO_URL" "$DEST"
fi

cd "$DEST"
node ./bin/harness doctor

if [ "${2:-}" = "--link" ]; then
  mkdir -p "$HOME/.local/bin"
  ln -sf "$DEST/bin/harness" "$HOME/.local/bin/harness"
  echo "linked: $HOME/.local/bin/harness"
fi

if [ "${2:-}" = "--boot" ] || [ "${3:-}" = "--boot" ]; then
  node ./bin/harness boot install
fi

echo "done. try: node $DEST/bin/harness demo"
