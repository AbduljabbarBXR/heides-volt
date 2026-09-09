import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { uiTexts } from '../src/main.js';
import { loadBanner } from '../src/banner.js';

const FORBIDDEN = ['-', '—', '–'];
const here = dirname(fileURLToPath(import.meta.url));

test('banner content check', () => {
  const banner = loadBanner();
  for (const ch of FORBIDDEN) assert(!banner.includes(ch), `banner holds forbidden char ${JSON.stringify(ch)}`);
});

test('authored UI strings content check', () => {
  for (const line of uiTexts()) {
    for (const ch of FORBIDDEN) assert(!line.includes(ch), `UI line holds forbidden char: ${line}`);
  }
});

test('banner file exists under assets', () => {
  const p = join(here, '..', 'assets', 'banner.txt');
  const text = readFileSync(p, 'utf8');
  assert(text.includes('H A R N E S S'));
});
