import { CATALOG, RECESSION_ID, START } from './catalog.js';

const BASE = 'https://fred.stlouisfed.org/graph/fredgraph.csv';

async function getCsv(id) {
  const url = `${BASE}?id=${id}&cosd=${START}-01`;
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 20000);
      const res = await fetch(url, { signal: ctl.signal, headers: { 'user-agent': 'macro-pulse/1.0' } });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw new Error(`${id}: ${lastErr}`);
}

// Collapse daily/weekly/monthly observations to a monthly mean, starting at START.
function toMonthly(csv) {
  const sums = new Map();
  for (const line of csv.trim().split('\n').slice(1)) {
    const [date, raw] = line.split(',');
    const v = parseFloat(raw);
    if (!date || !Number.isFinite(v)) continue;
    const m = date.slice(0, 7);
    const s = sums.get(m) || { t: 0, n: 0 };
    s.t += v; s.n += 1;
    sums.set(m, s);
  }
  const keys = [...sums.keys()].sort();
  if (!keys.length) return null;
  const last = keys[keys.length - 1];
  const out = [];
  let [y, mo] = START.split('-').map(Number);
  for (;;) {
    const key = `${y}-${String(mo).padStart(2, '0')}`;
    const s = sums.get(key);
    out.push(s ? Math.round((s.t / s.n) * 1e4) / 1e4 : null);
    if (key >= last) break;
    mo++; if (mo > 12) { mo = 1; y++; }
  }
  return { start: START, v: out };
}

export async function fetchAll() {
  const ids = [...CATALOG.map((c) => c.id), RECESSION_ID];
  const results = await Promise.allSettled(ids.map(async (id) => [id, toMonthly(await getCsv(id))]));
  const series = {};
  const errors = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value[1]) series[r.value[0]] = r.value[1];
    else errors.push(String(r.reason ?? 'empty'));
  }
  if (Object.keys(series).length < ids.length / 2) throw new Error('FRED unavailable: ' + errors.join('; '));
  return { generatedAt: new Date().toISOString(), series, errors };
}
