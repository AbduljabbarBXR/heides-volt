import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

export function configDir() {
  const home = homedir();
  if (platform() === 'win32') {
    const base = process.env.APPDATA || join(home, 'AppData', 'Roaming');
    return join(base, 'heidesharness');
  }
  if (platform() === 'darwin') {
    return join(home, 'Library', 'Application Support', 'heidesharness');
  }
  return join(home, '.config', 'heidesharness');
}

export function blankData() {
  return { facts: [], routes: {}, macros: {}, recent: [], peers: [], traces: [], stats: { turns: 0, recalls: 0, fastHits: 0 } };
}

export class Store {
  constructor(dir = null) {
    this.dir = dir || configDir();
    this.file = join(this.dir, 'muscle.json');
    this.data = blankData();
    this.load();
  }

  load() {
    try {
      if (existsSync(this.file)) {
        const raw = JSON.parse(readFileSync(this.file, 'utf8'));
        this.data = { ...blankData(), ...raw };
      }
    } catch {
      this.data = blankData();
    }
  }

  save() {
    mkdirSync(this.dir, { recursive: true });
    const text = JSON.stringify(this.data);
    if (text.length > 50 * 1024 * 1024) return;
    writeFileSync(this.file, text, 'utf8');
  }
}
