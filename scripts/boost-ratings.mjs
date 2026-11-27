// One-off: move the existing player files onto the 65-100 scale (safe to run twice).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rescale } from './ratings-scale.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const f of [path.join(ROOT, 'server', 'players.json'), path.join(ROOT, 'client', 'public', 'data', 'players.json')]) {
  const list = JSON.parse(await fs.readFile(f, 'utf8'));
  if (Math.min(...list.map((p) => p.rating)) >= 65) { console.log(f, 'already on the new scale'); continue; }
  rescale(list);
  await fs.writeFile(f, JSON.stringify(list));
  console.log(f, 'rescaled', list.length);
}
