import calibration from '../../shared/calibration.json';
import { CATALOG, CATEGORIES, RECESSION_ID, START, WINDOW_START } from '../../shared/catalog.js';

export interface Spec {
  id: string; name: string; short: string; cat: string;
  transform: 'level' | 'yoy'; goodUp: boolean;
  scale?: number; suffix: string; decimals: number; blurb: string;
}
export interface RawSeries { start: string; v: (number | null)[] }
export interface Payload { generatedAt: string; series: Record<string, RawSeries>; errors?: string[] }

export const CAL = calibration;
export const WINDOW_LABEL = 'late 1996';

export const SPECS = CATALOG as Spec[];
export const CATS = CATEGORIES as string[];

export type Arr = (number | null)[];

export interface Ind {
  spec: Spec;
  x: Arr;            // transformed value (what you see)
  z: Arr;            // sign-adjusted standardized level: + is healthy
  mom: Arr;          // sign-adjusted standardized 3-month change: + is improving
  lastIdx: number;   // index of last observation
  last: number;
  chg3: number | null;   // change in x over 3 months (raw units)
  chg12: number | null;
  health: number | null; // percentile (0-100) of how healthy the latest level is vs history
  status: 'Improving' | 'Steady' | 'Worsening' | 'No data';
}

export interface Model {
  dates: string[];
  inds: Ind[];
  byId: Record<string, Ind>;
  recession: boolean[];
  asOf: string;
  generatedAt: string;
}

export const THRESH = 0.5;

export function monthKey(start: string, offset: number): string {
  let [y, m] = start.split('-').map(Number);
  const t = y * 12 + (m - 1) + offset;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}
function monthIndex(a: string, b: string): number {
  const [ya, ma] = a.split('-').map(Number); const [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}
function stats(a: Arr) {
  const v = a.filter((n): n is number => n != null);
  const mean = v.reduce((s, n) => s + n, 0) / (v.length || 1);
  const sd = Math.sqrt(v.reduce((s, n) => s + (n - mean) ** 2, 0) / (v.length || 1)) || 1;
  return { mean, sd };
}

/** MAD-based scale: one crisis month (2020) should not make every other month look "steady". */
function robustSd(a: Arr, fallback: number): number {
  const v = a.filter((n): n is number => n != null).sort((x, y) => x - y);
  if (!v.length) return fallback;
  const med = v[Math.floor(v.length / 2)];
  const dev = v.map((n) => Math.abs(n - med)).sort((x, y) => x - y);
  const mad = 1.4826 * dev[Math.floor(dev.length / 2)];
  return mad > 1e-9 ? mad : fallback;
}

export function buildModel(p: Payload): Model {
  let N = 0;
  for (const s of Object.values(p.series)) N = Math.max(N, monthIndex(START, s.start) + s.v.length);
  const dates = Array.from({ length: N }, (_, i) => monthKey(START, i));
  const align = (s?: RawSeries): Arr => {
    const out: Arr = Array(N).fill(null);
    if (!s) return out;
    const off = monthIndex(START, s.start);
    s.v.forEach((v, i) => { if (off + i < N) out[off + i] = v; });
    return out;
  };

  const inds: Ind[] = [];
  for (const spec of SPECS) {
    const raw = p.series[spec.id];
    if (!raw) continue;
    const base = align(raw);
    const scale = spec.scale ?? 1;
    const x: Arr = base.map((v, i) => {
      if (v == null) return null;
      if (spec.transform === 'level') return v * scale;
      const prev = i >= 12 ? base[i - 12] : null;
      return prev ? (v / prev - 1) * 100 : null;
    });
    // everything is standardized over the 30-year window only; the lead-in months exist just for YoY math
    const W = monthIndex(START, WINDOW_START);
    for (let i = 0; i < W && i < N; i++) x[i] = null;
    const sign = spec.goodUp ? 1 : -1;
    const { mean, sd } = stats(x);
    const d3: Arr = x.map((v, i) => (v != null && i >= 3 && x[i - 3] != null ? v - (x[i - 3] as number) : null));
    const sd3 = robustSd(d3, stats(d3).sd);
    const z: Arr = x.map((v) => (v == null ? null : (sign * (v - mean)) / sd));
    const mom: Arr = d3.map((v) => (v == null ? null : (sign * v) / sd3));

    let lastIdx = -1;
    for (let i = N - 1; i >= 0; i--) if (x[i] != null) { lastIdx = i; break; }
    if (lastIdx < 0) continue;
    const last = x[lastIdx] as number;
    const hist = x.filter((n): n is number => n != null);
    const below = hist.filter((n) => n <= last).length / hist.length * 100;
    const health = spec.goodUp ? below : 100 - below;
    const m = mom[lastIdx];
    inds.push({
      spec, x, z, mom, lastIdx, last,
      chg3: x[lastIdx - 3] != null ? last - (x[lastIdx - 3] as number) : null,
      chg12: x[lastIdx - 12] != null ? last - (x[lastIdx - 12] as number) : null,
      health,
      status: m == null ? 'No data' : m > THRESH ? 'Improving' : m < -THRESH ? 'Worsening' : 'Steady',
    });
  }

  const rec = align(p.series[RECESSION_ID]);
  return {
    dates, inds, byId: Object.fromEntries(inds.map((i) => [i.spec.id, i])),
    recession: rec.map((v) => v === 1), asOf: dates[N - 1], generatedAt: p.generatedAt,
  };
}

export type Weights = Record<string, number>;

/** z-scores with short publication lags carried forward, so a late release does not whipsaw the latest month. */
function filledZ(model: Model, ffill = 2): Arr[] {
  const N = model.dates.length;
  return model.inds.map((ind) => {
    const out: Arr = [];
    let gap = 0, prev: number | null = null;
    for (let t = 0; t < N; t++) {
      const v = ind.z[t];
      if (v != null) { prev = v; gap = 0; out.push(v); }
      else if (prev != null && ++gap <= ffill) out.push(prev);
      else out.push(null);
    }
    return out;
  });
}

/** Composite on a 0-100 scale: 50 = average conditions over the 30-year window, +/-25 per standard deviation. */
export function composite(model: Model, w: Weights, minCoverage = 0.6): Arr {
  const N = model.dates.length;
  const total = model.inds.reduce((s, i) => s + (w[i.spec.id] ?? 0), 0);
  if (total <= 0) return Array(N).fill(null);
  const zf = filledZ(model);
  return Array.from({ length: N }, (_, t) => {
    let sw = 0, sz = 0;
    model.inds.forEach((ind, k) => {
      const wi = w[ind.spec.id] ?? 0; const v = zf[k][t];
      if (wi > 0 && v != null) { sw += wi; sz += wi * v; }
    });
    return sw / total >= minCoverage ? clamp(50 + 25 * (sz / sw), 0, 100) : null;
  });
}

export interface Contribution { ind: Ind; points: number; z: number }
export function contributions(model: Model, w: Weights, t: number): Contribution[] {
  const zf = filledZ(model);
  const rows = model.inds.map((ind, k) => ({ ind, z: zf[k][t], wi: w[ind.spec.id] ?? 0 })).filter((r) => r.wi > 0 && r.z != null);
  const sw = rows.reduce((s, r) => s + r.wi, 0) || 1;
  return rows.map((r) => ({ ind: r.ind, z: r.z as number, points: (25 * r.wi * (r.z as number)) / sw })).sort((a, b) => b.points - a.points);
}

export function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }

export function regime(score: number | null): { label: string; tone: 'good' | 'ok' | 'flat' | 'warn' | 'bad' } {
  if (score == null) return { label: 'n/a', tone: 'flat' };
  if (score >= 65) return { label: 'Strong', tone: 'good' };
  if (score >= 55) return { label: 'Firm', tone: 'ok' };
  if (score >= 45) return { label: 'Neutral', tone: 'flat' };
  if (score >= 35) return { label: 'Soft', tone: 'warn' };
  return { label: 'Weak', tone: 'bad' };
}

export function lastIndex(a: Arr): number { for (let i = a.length - 1; i >= 0; i--) if (a[i] != null) return i; return -1; }

export function fmt(spec: Spec, v: number | null | undefined, signed = false): string {
  if (v == null) return '—';
  const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: spec.decimals, maximumFractionDigits: spec.decimals });
  const sign = v < 0 ? '−' : signed && v > 0 ? '+' : '';
  return `${sign}${s}${spec.suffix}`;
}

export function monthLabel(d: string, long = false): string {
  const [y, m] = d.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', long ? { month: 'long', year: 'numeric' } : { month: 'short', year: '2-digit' });
}

export const PRESETS: { id: string; label: string; mult: Record<string, number> }[] = [
  { id: 'calibrated', label: 'Calibrated (30y)', mult: {} },
  { id: 'equal', label: 'Equal', mult: {} },
  { id: 'real', label: 'Real economy', mult: { Labor: 1.5, Growth: 1.5, Consumer: 1, Markets: 0.4, Housing: 0.8, Prices: 0.8 } },
  { id: 'hawk', label: 'Inflation hawk', mult: { Prices: 3, Labor: 1, Markets: 0.7 } },
  { id: 'markets', label: 'Markets watcher', mult: { Markets: 2.5, Labor: 0.6, Growth: 0.6 } },
];
export function presetWeights(model: Model, id: string): Weights {
  if (id === 'calibrated') return Object.fromEntries(model.inds.map((i) => [i.spec.id, (CAL.weights as Record<string, number>)[i.spec.id] ?? 1]));
  const mult = PRESETS.find((p) => p.id === id)?.mult ?? {};
  return Object.fromEntries(model.inds.map((i) => [i.spec.id, +(mult[i.spec.cat] ?? 1).toFixed(2)]));
}
export function matchPreset(model: Model, w: Weights): string {
  for (const p of PRESETS) {
    const pw = presetWeights(model, p.id);
    if (model.inds.every((i) => Math.abs((w[i.spec.id] ?? 0) - pw[i.spec.id]) < 0.001)) return p.id;
  }
  return 'custom';
}
