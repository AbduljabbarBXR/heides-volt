import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, existsSync, chmodSync } from 'node:fs';

/**
 * boot/index.js: daemon on boot, every platform.
 *
 * Pure content generators per platform plus an installer.
 * systemd user unit, macOS launchd plist, Termux boot script,
 * cron fallback. Install writes the file, enable stays manual
 * and printed, so nothing surprises the owner.
 */

export function detectPlatform() {
  if (process.env.TERMUX_VERSION) return 'termux';
  const p = platform();
  if (p === 'darwin') return 'macos';
  if (p === 'win32') return 'windows';
  return 'linux';
}

export function unitContent(execLine) {
  return `[Unit]
Description=heidesharness daemon
After=network-online.target

[Service]
ExecStart=${execLine}
Restart=on-failure
RestartSec=30

[Install]
WantedBy=default.target
`;
}

export function plistContent(execLine) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.heidesharness.daemon</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string><string>-c</string><string>${execLine}</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict>
</plist>
`;
}

export function termuxContent(execLine) {
  return `#!/data/data/com.termux/files/usr/bin/sh
# Termux:Boot entry. Place under ~/.termux/boot/ and allow autostart.
${execLine} >> "$HOME/.harness-boot.log" 2>&1 &
`;
}

export function cronLine(execLine) {
  return `@reboot ${execLine} >> "$HOME/.harness-boot.log" 2>&1`;
}

export function bootTarget(kind = detectPlatform(), home = homedir()) {
  if (kind === 'macos') return join(home, 'Library', 'LaunchAgents', 'com.heidesharness.daemon.plist');
  if (kind === 'termux') return join(home, '.termux', 'boot', 'heidesharness.sh');
  if (kind === 'linux') return join(home, '.config', 'systemd', 'user', 'heidesharness.service');
  return null;
}

export function installBoot({ kind = detectPlatform(), home = homedir(), bin = 'harness', root = null } = {}) {
  const execLine = `node ${root ? join(root, 'bin', 'harness') : bin} daemon 60 60`;
  const target = bootTarget(kind, home);
  if (!target) return { ok: false, note: 'no boot recipe for this platform, use cron line' };
  let content = unitContent(execLine);
  if (kind === 'macos') content = plistContent(execLine);
  if (kind === 'termux') content = termuxContent(execLine);
  const parts = target.split('/').slice(0, -1).join('/');
  mkdirSync(parts, { recursive: true });
  const existed = existsSync(target);
  writeFileSync(target, content, 'utf8');
  if (kind === 'termux') {
    try {
      chmodSync(target, 0o755);
    } catch { /* best effort */ }
  }
  let hint = 'enable with systemctl enable lingering plus service start';
  if (kind === 'macos') hint = 'load with launchctl load target path';
  if (kind === 'termux') hint = 'allow Termux autostart in system settings';
  return { ok: true, note: existed ? `boot file refreshed: ${target}` : `boot file written: ${target}`, hint, target };
}
