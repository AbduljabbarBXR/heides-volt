import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
export const BANNER_PATH = join(here, '..', 'assets', 'banner.txt');

export function loadBanner() {
  return readFileSync(BANNER_PATH, 'utf8');
}

export function printBanner(out = process.stdout) {
  out.write(loadBanner() + '\n');
}
