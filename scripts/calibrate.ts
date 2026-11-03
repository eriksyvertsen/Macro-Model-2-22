/**
 * Backfits composite weights against NBER recessions over the 30-year window.
 *
 *   target   : USREC (1 = NBER recession month), contemporaneous
 *   features : sign-adjusted z-scores of each indicator (higher = healthier), standardized over the window
 *   model    : logistic  P(recession) = sigmoid(b - sum(beta_i * z_i)),  beta_i >= 0,  L2-regularized, class-balanced
 *   validate : 3 contiguous folds, each holding out exactly one recession (2001, 2008-09, 2020);
 *              every month's score comes from a model that never saw that recession
 *   shrink   : final weights = alpha * (fitted, mean-normalized) + (1 - alpha) * equal; alpha and lambda chosen by CV
 *
 * Run: npm run calibrate   (rewrites shared/calibration.json)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { buildModel, Model, Arr } from '../src/lib/calc.ts';
import { START, WINDOW_START } from '../shared/catalog.js';

const payload = JSON.parse(readFileSync('public/data.json', 'utf8'));
const model: Model = buildModel(payload);
const ids = model.inds.map((i) => i.spec.id);
const p = ids.length;
const mi = (a: string, b: string) => { const [ya, ma] = a.split('-').map(Number); const [yb, mb] = b.split('-').map(Number); return (yb - ya) * 12 + (mb - ma); };
const W0 = mi(START, WINDOW_START);
const known = payload.series.USREC.v.length; // months where NBER status is published
const rows: number[] = [];
for (let t = W0; t < known; t++) rows.push(t);
const y = (t: number) => (model.recession[t] ? 1 : 0);
const Z = (t: number): Arr => model.inds.map((i) => i.z[t]);

// recession segments inside the window
const segs: [number, number][] = [];
for (let t = W0, s = -1; t <= known; t++) {
  const on = t < known && model.recession[t];
  if (on && s < 0) s = t;
  if (!on && s >= 0) { segs.push([s, t - 1]); s = -1; }
}
const folds: number[][] = segs.map(() => []);
const cuts = segs.slice(0, -1).map((s, k) => Math.round((s[1] + segs[k + 1][0]) / 2));
for (const t of rows) folds[cuts.findIndex((c) => t <= c) === -1 ? segs.length - 1 : cuts.findIndex((c) => t <= c)].push(t);

const sigmoid = (v: number) => 1 / (1 + Math.exp(-v));

function fit(train: number[], lambda: number): number[] {
  const n = train.length;
  const npos = train.filter((t) => y(t)).length;
  const wpos = n / (2 * npos), wneg = n / (2 * (n - npos));
  const X = train.map((t) => Z(t).map((v) => v ?? 0));
  const Y = train.map(y);
  const sw = Y.map((v) => (v ? wpos : wneg));
  let beta = Array(p).fill(0.1), b = Math.log(npos / (n - npos));
  const m1 = Array(p + 1).fill(0), m2 = Array(p + 1).fill(0);
  const lr = 0.03, b1 = 0.9, b2 = 0.999;
  for (let it = 1; it <= 3000; it++) {
    const g = Array(p + 1).fill(0);
    for (let r = 0; r < n; r++) {
      let s = 0; for (let i = 0; i < p; i++) s += beta[i] * X[r][i];
      const pr = sigmoid(b - s), e = sw[r] * (Y[r] - pr) / n;
      for (let i = 0; i < p; i++) g[i] += e * X[r][i];
      g[p] += -e;
    }
    for (let i = 0; i < p; i++) g[i] += 2 * lambda * beta[i];
    const params = [...beta, b];
    for (let k = 0; k <= p; k++) {
      m1[k] = b1 * m1[k] + (1 - b1) * g[k]; m2[k] = b2 * m2[k] + (1 - b2) * g[k] * g[k];
      params[k] -= (lr * (m1[k] / (1 - b1 ** it))) / (Math.sqrt(m2[k] / (1 - b2 ** it)) + 1e-8);
    }
    beta = params.slice(0, p).map((v) => Math.max(0, v)); b = params[p];
  }
  return beta;
}

const meanNorm = (v: number[]) => { const m = v.reduce((a, c) => a + c, 0) / v.length || 1; return v.map((x) => x / m); };
const blend = (beta: number[], alpha: number) => { const f = meanNorm(beta); return f.map((x) => alpha * x + (1 - alpha)); };
/** weighted mean z over available indicators (higher = healthier) */
function score(t: number, w: number[]): number | null {
  const z = Z(t); let sw = 0, sz = 0;
  z.forEach((v, i) => { if (v != null && w[i] > 0) { sw += w[i]; sz += w[i] * v; } });
  return sw > 0 ? sz / sw : null;
}
function auc(ts: number[], w: number[] | ((t: number) => number[])): number {
  const items = ts.map((t) => ({ r: -(score(t, typeof w === 'function' ? w(t) : w) ?? 0), pos: y(t) })).sort((a, b) => a.r - b.r);
  let rankSum = 0, npos = 0;
  for (let i = 0; i < items.length;) {
    let j = i; while (j < items.length && items[j].r === items[i].r) j++;
    const avg = (i + j + 1) / 2;
    for (let k = i; k < j; k++) if (items[k].pos) { rankSum += avg; npos++; }
    i = j;
  }
  const nneg = items.length - npos;
  return (rankSum - (npos * (npos + 1)) / 2) / (npos * nneg);
}

const equal = Array(p).fill(1);
const lambdas = [0.003, 0.01, 0.03, 0.1, 0.3, 1];
const alphas = [0, 0.25, 0.5, 0.75, 1];

// fold models per lambda (alpha only changes the blend, not the fit)
const foldBeta: Record<number, number[][]> = {};
for (const l of lambdas) foldBeta[l] = folds.map((_, k) => fit(rows.filter((t) => !folds[k].includes(t)), l));
const grid: { lambda: number; alpha: number; oos: number; perFold: number[] }[] = [];
for (const l of lambdas) for (const a of alphas) {
  const wByFold = foldBeta[l].map((b) => blend(b, a));
  const perFold = folds.map((f, k) => auc(f, wByFold[k]));
  const foldOf = (t: number) => folds.findIndex((f) => f.includes(t));
  grid.push({ lambda: l, alpha: a, oos: auc(rows, (t) => wByFold[foldOf(t)]), perFold });
}
const eq = grid.find((g) => g.alpha === 0)!;
const fitted = grid.filter((g) => g.alpha > 0);
const best = Math.max(...fitted.map((g) => g.oos));
// parsimony: within 0.01 AUC of the best fitted config, prefer the most shrinkage, then the strongest regularization
const pick = fitted.filter((g) => g.oos >= best - 0.01).sort((a, b) => a.alpha - b.alpha || b.lambda - a.lambda)[0];

console.log(`window ${WINDOW_START}..${model.dates[known - 1]}  months=${rows.length}  recession months=${rows.filter(y).length}  segments=${segs.map(([s, e]) => model.dates[s] + '→' + model.dates[e]).join(', ')}`);
console.log('equal-weights AUC', eq.oos.toFixed(4), 'per fold', eq.perFold.map((v) => v.toFixed(3)).join(' '));
console.log('λ \\ α   ' + alphas.map((a) => String(a).padStart(6)).join(' '));
for (const l of lambdas) console.log(String(l).padEnd(8) + alphas.map((a) => grid.find((g) => g.lambda === l && g.alpha === a)!.oos.toFixed(4).padStart(6)).join(' '));
console.log('picked', pick.lambda, pick.alpha, pick.oos.toFixed(4), 'per fold', pick.perFold.map((v) => v.toFixed(3)).join(' '));

const beta = fit(rows, pick.lambda);
const finalW = blend(beta, pick.alpha).map((v) => Math.min(3, Math.round(v * 20) / 20));
const weights: Record<string, number> = Object.fromEntries(ids.map((id, i) => [id, finalW[i]]));
console.log('\nweights'); ids.forEach((id, i) => console.log(id.padEnd(13), 'raw', (meanNorm(beta)[i]).toFixed(2).padStart(5), '→ final', finalW[i].toFixed(2)));

const score100 = (t: number, w: number[]) => { const s = score(t, w); return s == null ? null : Math.max(0, Math.min(100, 50 + 25 * s)); };
const stat = (w: number[]) => {
  const rec = rows.filter(y), exp = rows.filter((t) => !y(t));
  const avg = (ts: number[]) => ts.reduce((a, t) => a + (score100(t, w) ?? 50), 0) / ts.length;
  return {
    avgInRecession: +avg(rec).toFixed(1), avgInExpansion: +avg(exp).toFixed(1),
    expansionMonthsBelow40: exp.filter((t) => (score100(t, w) ?? 50) < 40).length,
    perRecession: segs.map(([s, e]) => {
      let mn = 101, at = s;
      for (let t = s; t <= e; t++) { const v = score100(t, w) ?? 50; if (v < mn) { mn = v; at = t; } }
      return { start: model.dates[s], end: model.dates[e], scoreAtStart: +(score100(s, w) ?? 50).toFixed(1), scoreSixMonthsBefore: +(score100(s - 6, w) ?? 50).toFixed(1), minScore: +mn.toFixed(1), minMonth: model.dates[at] };
    }),
  };
};
const out = {
  generatedAt: new Date().toISOString(),
  window: { start: WINDOW_START, end: model.dates[known - 1], months: rows.length, recessionMonths: rows.filter(y).length },
  method: { target: 'NBER recession months (USREC), contemporaneous', model: 'non-negative L2 logistic, class-balanced', validation: 'leave-one-recession-out, 3 contiguous folds', lambda: pick.lambda, alpha: pick.alpha },
  auc: { calibratedOutOfSample: +pick.oos.toFixed(3), calibratedInSample: +auc(rows, finalW).toFixed(3), equalWeights: +eq.oos.toFixed(3), perFoldCalibrated: pick.perFold.map((v) => +v.toFixed(3)), perFoldEqual: eq.perFold.map((v) => +v.toFixed(3)), folds: segs.map(([s, e]) => `${model.dates[s]} to ${model.dates[e]}`) },
  calibrated: stat(finalW), equal: stat(equal),
  weights,
};
writeFileSync('shared/calibration.json', JSON.stringify(out, null, 2));
console.log('\nin-sample AUC calibrated', out.auc.calibratedInSample, ' OOS', out.auc.calibratedOutOfSample, ' equal', out.auc.equalWeights);
console.log('calibrated', JSON.stringify(out.calibrated), '\nequal     ', JSON.stringify(out.equal));
