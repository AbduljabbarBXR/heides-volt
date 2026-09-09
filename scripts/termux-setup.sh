#!/bin/bash
# Termux setup for heides-volt. Installs node, api hooks for
# battery awareness, boot autostart, then registers the daemon.
set -eu

pkg update -y
pkg install -y nodejs termux-api termux-boot

REPO_DIR="${1:-$HOME/heides-volt}"
if [ ! -d "$REPO_DIR" ]; then
  echo "cloning harness into $REPO_DIR"
  pkg install -y git
  git clone https://github.com/AbduljabbarBXR/heides-volt.git "$REPO_DIR"
fi

cd "$REPO_DIR"
node ./bin/harness doctor

mkdir -p "$HOME/.termux/boot"
node ./bin/harness boot install

echo "next: allow Termux autostart in system settings, then reboot or run:"
echo "  node $REPO_DIR/bin/harness daemon 60 60"
