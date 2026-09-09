import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, renameSync } from 'node:fs';
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
    this.backup = `${this.file}.bak`;
    this.data = blankData();
    this.recovered = null;
    this.load();
  }

  load() {
    try {
      if (existsSync(this.file)) {
        const raw = JSON.parse(readFileSync(this.file, 'utf8'));
        this.data = { ...blankData(), ...raw };
        return;
      }
    } catch {
      /* fall through to backup */
    }
    try {
      if (existsSync(this.backup)) {
        const raw = JSON.parse(readFileSync(this.backup, 'utf8'));
        this.data = { ...blankData(), ...raw };
        this.recovered = 'backup';
        return;
      }
    } catch {
      /* fall through to blank */
    }
    if (existsSync(this.file)) this.recovered = 'blank';
  }

  save() {
    mkdirSync(this.dir, { recursive: true });
    const text = JSON.stringify(this.data);
    if (text.length > 50 * 1024 * 1024) return;
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, text, 'utf8');
    try {
      if (existsSync(this.file)) copyFileSync(this.file, this.backup);
    } catch {
      /* backup best effort */
    }
    renameSync(tmp, this.file);
  }
}
