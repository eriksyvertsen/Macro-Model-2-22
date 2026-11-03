// Writes public/data.json at build time. If FRED is unreachable, keeps the previous snapshot.
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fetchAll } from '../shared/fred.js';

mkdirSync('public', { recursive: true });
try {
  const data = await fetchAll();
  writeFileSync('public/data.json', JSON.stringify(data));
  console.log(`snapshot: ${Object.keys(data.series).length} series`, data.errors.length ? `(errors: ${data.errors})` : '');
} catch (e) {
  if (existsSync('public/data.json')) console.warn('snapshot failed, keeping existing file:', String(e));
  else { console.error('snapshot failed and no fallback exists:', String(e)); process.exit(1); }
}
