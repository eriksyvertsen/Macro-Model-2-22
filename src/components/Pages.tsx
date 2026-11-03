import { useMemo, useState } from 'react';
import { CAL, CATS, Contribution, Ind, Model, PRESETS, WINDOW_LABEL, Weights, composite, contributions, fmt, lastIndex, matchPreset, monthLabel, presetWeights, regime } from '../lib/calc';
import { LineChart, Meter, Spark, heat } from './Charts';

const RANGES = [{ k: '3Y', m: 36 }, { k: '5Y', m: 60 }, { k: '10Y', m: 120 }, { k: '30Y', m: 9999 }];

export const go = (h: string) => { location.hash = h; };

function Chips<T extends string | number>({ options, value, onChange, label }: { options: { k: T; label: string }[]; value: T; onChange: (k: T) => void; label: string }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((o) => <button key={String(o.k)} className={`chip ${o.k === value ? 'on' : ''}`} aria-pressed={o.k === value} onClick={() => onChange(o.k)}>{o.label}</button>)}
    </div>
  );
}

function Status({ s }: { s: Ind['status'] }) {
  const cls = s === 'Improving' ? 'good' : s === 'Worsening' ? 'bad' : 'flat';
  const g = s === 'Improving' ? '▲' : s === 'Worsening' ? '▼' : s === 'Steady' ? '●' : '';
  return <span className={`pill ${cls}`}><span aria-hidden="true">{g}</span> {s}</span>;
}

function ScoreBlock({ score, prev, big = false }: { score: number | null; prev: number | null; big?: boolean }) {
  const r = regime(score);
  const d = score != null && prev != null ? score - prev : null;
  return (
    <div className={`score ${big ? 'big' : ''}`}>
      <div className="score-n">{score == null ? '—' : Math.round(score)}</div>
      <div>
        <span className={`pill ${r.tone}`}>{r.label}</span>
        {d != null && <div className={`delta ${d > 1 ? 'up' : d < -1 ? 'dn' : ''}`}>{d > 1 ? '▲' : d < -1 ? '▼' : '●'} {Math.abs(d).toFixed(1)} pts vs 3 months ago</div>}
      </div>
    </div>
  );
}

/* ───────────── Overview ───────────── */
export function Overview({ model, w }: { model: Model; w: Weights }) {
  const comp = useMemo(() => composite(model, w), [model, w]);
  const li = lastIndex(comp);
  const from = Math.max(0, comp.length - 60);
  const movers = useMemo(() => {
    const withMom = model.inds.filter((i) => i.mom[i.lastIdx] != null);
    const sorted = [...withMom].sort((a, b) => (b.mom[b.lastIdx] as number) - (a.mom[a.lastIdx] as number));
    return { up: sorted.filter((i) => (i.mom[i.lastIdx] as number) > 0.5).slice(0, 4), dn: sorted.filter((i) => (i.mom[i.lastIdx] as number) < -0.5).reverse().slice(0, 4) };
  }, [model]);
  const catScores = CATS.map((c) => {
    const inds = model.inds.filter((i) => i.spec.cat === c);
    // each indicator is read at its own latest month, so slow-to-publish series don't blank the card
    const at = (back: number) => { const v = inds.map((i) => i.z[i.lastIdx - back]).filter((x): x is number => x != null); return v.length ? 50 + 25 * (v.reduce((a, b) => a + b, 0) / v.length) : null; };
    return { c, score: at(0), prev: at(3), n: inds.length, inds };
  });

  return (
    <>
      <section className="hero card">
        <div className="hero-top">
          <div>
            <p className="eyebrow">U.S. economic conditions · {monthLabel(model.dates[li], true)}</p>
            <ScoreBlock score={comp[li]} prev={comp[li - 3] ?? null} big />
          </div>
          <a className="btn ghost" href="#/composite">Tune the weights →</a>
        </div>
        <Meter score={comp[li]} />
        <p className="lede">A single 0–100 score blending {model.inds.length} indicators. <b>50 is the average month since {WINDOW_LABEL}</b>; each 25 points is one standard deviation. Weights are <a href="#/composite">calibrated against three recessions</a>. Shaded bands are recessions.</p>
        <LineChart dates={model.dates} bands={model.recession} from={from} to={comp.length - 1} height={220} ref0={50} refLabel="average" yDomain={[0, 100]}
          lines={[{ values: comp, color: 'var(--blue)', label: 'Conditions', format: (v) => v.toFixed(1), width: 2.4 }]} />
      </section>

      <h2 className="sec">By category</h2>
      <div className="grid cats">
        {catScores.map((c) => {
          const r = regime(c.score); const d = c.score != null && c.prev != null ? c.score - c.prev : null;
          return (
            <a key={c.c} href={`#/indicators?cat=${c.c}`} className="card cat">
              <div className="cat-h"><b>{c.c}</b><span className={`pill ${r.tone}`}>{r.label}</span></div>
              <div className="cat-n">{c.score == null ? '—' : Math.round(c.score)}<small className={d != null && d > 1 ? 'up' : d != null && d < -1 ? 'dn' : ''}>{d == null ? '' : `${d > 1 ? '▲' : d < -1 ? '▼' : '●'} ${Math.abs(d).toFixed(0)}`}</small></div>
              <div className="bar"><i style={{ width: `${c.score ?? 0}%` }} className={r.tone} /></div>
              <div className="cat-s">{c.n} indicators</div>
            </a>
          );
        })}
      </div>

      <h2 className="sec">What changed lately</h2>
      <p className="sub">Three-month momentum, adjusted so that ▲ always means healthier.</p>
      <div className="grid two top">
        {[{ t: 'Improving', list: movers.up, cls: 'good' }, { t: 'Worsening', list: movers.dn, cls: 'bad' }].map((col) => (
          <div key={col.t} className="card">
            <h3 className={`mh ${col.cls}`}>{col.t}</h3>
            {col.list.length === 0 && <p className="muted">Nothing is moving decisively.</p>}
            {col.list.map((i) => (
              <a key={i.spec.id} href={`#/i/${i.spec.id}`} className="mover">
                <div><b>{i.spec.short}</b><span className="muted">{i.spec.cat}</span></div>
                <Spark values={i.x.slice(-36)} color={`var(--${col.cls})`} />
                <div className="mv"><b>{fmt(i.spec, i.last)}</b><span className="muted">{fmt(i.spec, i.chg3, true)} / 3mo</span></div>
              </a>
            ))}
          </div>
        ))}
      </div>
      <div className="cta"><a className="btn" href="#/momentum">See the full momentum map</a><a className="btn ghost" href="#/indicators">Browse all indicators</a></div>
    </>
  );
}

/* ───────────── Momentum heatmap ───────────── */
export function Momentum({ model }: { model: Model }) {
  const [months, setMonths] = useState(12);
  const N = model.dates.length;
  // anchor on the newest month where at least half the indicators have published
  let last = model.dates.length - 1;
  while (last > 0 && model.inds.filter((i) => i.mom[last] != null).length < model.inds.length / 2) last--;
  const idx = Array.from({ length: months }, (_, k) => last - months + 1 + k);
  return (
    <>
      <h1 className="h1">Momentum map</h1>
      <p className="sub">Each cell is one month's three-month change, scaled to that indicator's own history. <b>Green = getting healthier, red = getting worse</b> for the economy, so a rising unemployment rate shows red. Tap a row for the full story.</p>
      <div className="toolbar">
        <Chips label="Time window" value={months} onChange={setMonths} options={[{ k: 12, label: '12 months' }, { k: 24, label: '2 years' }, { k: 60, label: '5 years' }]} />
        <div className="legend" aria-hidden="true"><span>Worse</span><i style={{ background: heat(-2) }} /><i style={{ background: heat(-1) }} /><i style={{ background: heat(0) }} /><i style={{ background: heat(1) }} /><i style={{ background: heat(2) }} /><span>Better</span></div>
      </div>
      {CATS.map((c) => {
        const rows = model.inds.filter((i) => i.spec.cat === c);
        if (!rows.length) return null;
        return (
          <section key={c} className="card hm">
            <div className="hm-cat">{c}</div>
            <div className="hm-axis"><span /><div className="hm-months">{idx.map((t, k) => <span key={t}>{months <= 24 ? (k % (months > 12 ? 3 : 2) === 0 ? monthLabel(model.dates[t]).replace(' ', " '") : '') : (model.dates[t].endsWith('-01') ? model.dates[t].slice(0, 4) : '')}</span>)}</div></div>
            {rows.map((i) => (
              <a key={i.spec.id} href={`#/i/${i.spec.id}`} className="hm-row">
                <div className="hm-info">
                  <b>{i.spec.short}</b>
                  <span className="hm-val">{fmt(i.spec, i.last)}</span>
                  <Status s={i.status} />
                </div>
                <div className="hm-strip" style={{ gridTemplateColumns: `repeat(${months}, 1fr)` }}>
                  {idx.map((t, k) => {
                    const m = t >= 0 && t < N ? i.mom[t] : null;
                    return <i key={t} className={k === months - 1 ? 'now' : ''} style={{ background: heat(m) }} title={`${monthLabel(model.dates[t], true)}: ${m == null ? 'no data' : m > 0.5 ? 'improving' : m < -0.5 ? 'worsening' : 'steady'}`} />;
                  })}
                </div>
              </a>
            ))}
          </section>
        );
      })}
      <p className="note">Gray cells: the statistic has not been published for that month yet. How it's calculated: <a href="#/method">methodology</a>.</p>
    </>
  );
}

/* ───────────── Composite ───────────── */
export function Composite({ model, w, setW }: { model: Model; w: Weights; setW: (w: Weights) => void }) {
  const [range, setRange] = useState(9999);
  const comp = useMemo(() => composite(model, w), [model, w]);
  const li = lastIndex(comp);
  const [t, setT] = useState<number | null>(null);
  const at = Math.min(t ?? li, li);
  const contrib = useMemo(() => contributions(model, w, at), [model, w, at]);
  const from = Math.max(0, comp.length - range);
  const [copied, setCopied] = useState(false);
  const shareUrl = () => `${location.origin}/#/composite?w=${model.inds.map((i) => `${i.spec.id}:${w[i.spec.id] ?? 0}`).join(',')}`;
  const share = async () => {
    try { await navigator.clipboard.writeText(shareUrl()); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { prompt('Copy this link', shareUrl()); }
  };
  const maxAbs = Math.max(2, ...contrib.map((c) => Math.abs(c.points)));
  const first = Math.max(0, comp.findIndex((v) => v != null));

  return (
    <>
      <h1 className="h1">Composite index</h1>
      <p className="sub">Every indicator is standardized against its own 30-year history (since late 1996) and flipped so that higher always means healthier, then blended with weights calibrated to the 2001, 2008–09 and 2020 recessions (or your own). The result is one score: 50 = average, 75 = a standard deviation better than usual.</p>
      <section className="card">
        <div className="hero-top"><ScoreBlock score={comp[at]} prev={comp[at - 3] ?? null} /><Chips label="Chart range" value={range} onChange={setRange} options={RANGES.map((r) => ({ k: r.m, label: r.k }))} /></div>
        <LineChart dates={model.dates} bands={model.recession} from={Math.max(from, first)} to={comp.length - 1} height={280} ref0={50} refLabel="average" yDomain={[0, 100]}
          lines={[{ values: comp, color: 'var(--blue)', label: 'Conditions', format: (v) => v.toFixed(1), width: 2.4 }]} />
      </section>

      <h2 className="sec">What's driving it · {monthLabel(model.dates[at], true)}</h2>
      <section className="card">
        <label className="scrub">Drag to inspect another month
          <input type="range" min={first} max={li} value={at} onChange={(e) => setT(+e.target.value)} aria-label="Month" />
        </label>
        <div className="contrib">
          {contrib.map((c: Contribution) => (
            <a key={c.ind.spec.id} href={`#/i/${c.ind.spec.id}`} className="crow">
              <span className="cn">{c.ind.spec.short}</span>
              <span className="cbar"><i className={c.points >= 0 ? 'good' : 'bad'} style={{ width: `${(Math.abs(c.points) / maxAbs) * 50}%`, [c.points >= 0 ? 'left' : 'right']: '50%' }} /></span>
              <span className={`cv ${c.points >= 0 ? 'up' : 'dn'}`}>{c.points >= 0 ? '+' : '−'}{Math.abs(c.points).toFixed(1)}</span>
            </a>
          ))}
        </div>
        <p className="note">Points above or below the 50 baseline contributed by each indicator. They add up to the score minus 50.</p>
      </section>

      <h2 className="sec">Your weights</h2>
      <section className="card">
        <div className="toolbar">
          <Chips label="Presets" value={matchPreset(model, w)} onChange={(k) => setW(presetWeights(model, String(k)))} options={PRESETS.map((p) => ({ k: p.id as string, label: p.label }))} />
          <button className="btn ghost sm" onClick={share}>{copied ? 'Link copied ✓' : 'Copy share link'}</button>
        </div>
        {CATS.map((c) => (
          <div key={c} className="wgroup">
            <div className="wcat">{c}</div>
            {model.inds.filter((i) => i.spec.cat === c).map((i) => (
              <label key={i.spec.id} className="wrow">
                <span>{i.spec.short}</span>
                <input type="range" min="0" max="3" step="0.05" value={w[i.spec.id] ?? 0} onChange={(e) => setW({ ...w, [i.spec.id]: +e.target.value })} aria-label={`${i.spec.name} weight`} />
                <output>{(w[i.spec.id] ?? 0).toFixed(2)}×</output>
              </label>
            ))}
          </div>
        ))}
        <p className="note">Saved in your browser. Set a weight to 0× to drop an indicator. Everything recomputes instantly.</p>
      </section>

      <h2 className="sec">How the weights were calibrated</h2>
      <section className="card prose">
        <p>Weights were backfit over <b>{CAL.window.months} months ({monthLabel(CAL.window.start, true)} to {monthLabel(CAL.window.end, true)})</b>, a window containing {CAL.auc.folds.length} NBER recessions and {CAL.window.recessionMonths} recession months. The fit is a non-negative, regularized logistic regression of "is this month an NBER recession?" on the sign-adjusted indicators, then shrunk toward equal weights by the amount cross-validation supported.</p>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Ability to separate recession months (AUC)</th><th>Score</th></tr></thead>
          <tbody>
            <tr><td>Calibrated weights, <b>out of sample</b></td><td><b>{CAL.auc.calibratedOutOfSample.toFixed(3)}</b></td></tr>
            <tr><td>Equal weights</td><td>{CAL.auc.equalWeights.toFixed(3)}</td></tr>
            <tr><td className="muted">Calibrated, in sample (optimistic)</td><td className="muted">{CAL.auc.calibratedInSample.toFixed(3)}</td></tr>
          </tbody>
        </table></div>
        <p><b>Out of sample</b> means each recession was held out in turn: the weights scoring 2008 never saw 2008. 0.5 is a coin flip, 1.0 is perfect.</p>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Recession</th><th>Score 6 mo before</th><th>At start</th><th>Trough</th></tr></thead>
          <tbody>{CAL.calibrated.perRecession.map((r) => (
            <tr key={r.start}><td>{monthLabel(r.start, true)} to {monthLabel(r.end, true)}</td><td>{r.scoreSixMonthsBefore.toFixed(0)}</td><td>{r.scoreAtStart.toFixed(0)}</td><td>{r.minScore.toFixed(0)} ({monthLabel(r.minMonth, true)})</td></tr>
          ))}</tbody>
        </table></div>
        <p><b>Read this with care.</b> Three recessions is a small sample. The calibrated weights beat equal weights by only about {(CAL.auc.calibratedOutOfSample - CAL.auc.equalWeights).toFixed(3)} AUC out of sample, which is within noise: the chosen indicators already separate recessions well, and looser fits did <i>worse</i> on held-out recessions. The fit's real effect is a tilt toward fast, coincident gauges (financial conditions, credit spreads, Nasdaq, VIX, industrial output, retail sales) and away from the slower or earlier-moving ones (unemployment, core inflation, the yield curve). The score is about 50 six months before each recession began, so it confirms trouble rather than forecasting it.</p>
        <p className="muted sm">Method details are in <a href="#/method">Methodology</a>. Re-run with <code>npm run calibrate</code>.</p>
      </section>
    </>
  );
}

/* ───────────── Indicator browser ───────────── */
export function Indicators({ model, query }: { model: Model; query: URLSearchParams }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState(query.get('cat') ?? 'All');
  const list = model.inds.filter((i) => (cat === 'All' || i.spec.cat === cat) && (i.spec.name + i.spec.short + i.spec.id).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <h1 className="h1">Indicators</h1>
      <div className="toolbar">
        <input className="search" type="search" placeholder="Search indicators…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search indicators" />
      </div>
      <Chips label="Category" value={cat} onChange={setCat} options={['All', ...CATS].map((c) => ({ k: c, label: c }))} />
      <div className="grid cards">
        {list.map((i) => (
          <a key={i.spec.id} href={`#/i/${i.spec.id}`} className="card ind">
            <div className="ind-h"><span className="muted">{i.spec.cat}</span><Status s={i.status} /></div>
            <b className="ind-n">{i.spec.name}</b>
            <div className="ind-v"><span className="big-n">{fmt(i.spec, i.last)}</span><Spark values={i.x.slice(-60)} w={110} h={34} color={i.status === 'Worsening' ? 'var(--bad)' : i.status === 'Improving' ? 'var(--good)' : 'var(--blue)'} /></div>
            <div className="muted sm">{monthLabel(model.dates[i.lastIdx], true)} · {fmt(i.spec, i.chg12, true)} vs 1 year ago</div>
          </a>
        ))}
        {list.length === 0 && <p className="muted">No indicators match.</p>}
      </div>
    </>
  );
}

/* ───────────── Indicator detail ───────────── */
export function Detail({ model, id, w }: { model: Model; id: string; w: Weights }) {
  const [range, setRange] = useState(9999);
  const ind = model.byId[id];
  if (!ind) return <><a href="#/indicators" className="back">← Indicators</a><p>Unknown indicator.</p></>;
  const s = ind.spec;
  const from = Math.max(0, ind.x.findIndex((v) => v != null), model.dates.length - range);
  const k = model.inds.findIndex((i) => i.spec.id === id);
  const prev = model.inds[(k + model.inds.length - 1) % model.inds.length], next = model.inds[(k + 1) % model.inds.length];
  const m = ind.mom[ind.lastIdx];
  const stripFrom = ind.lastIdx - 23;
  return (
    <>
      <a href="#/indicators" className="back">← Indicators</a>
      <p className="eyebrow">{s.cat} · FRED {s.id}</p>
      <h1 className="h1">{s.name}</h1>
      <div className="detail-top"><span className="big-n xl">{fmt(s, ind.last)}</span><Status s={ind.status} /><span className="muted">{monthLabel(model.dates[ind.lastIdx], true)}</span></div>
      <section className="card">
        <div className="hero-top"><span className="muted">{s.goodUp ? 'Higher is healthier' : 'Lower is healthier'}</span><Chips label="Chart range" value={range} onChange={setRange} options={RANGES.map((r) => ({ k: r.m, label: r.k }))} /></div>
        <LineChart dates={model.dates} bands={model.recession} from={from} to={ind.lastIdx} height={300} ref0={s.transform === 'yoy' || s.id === 'T10Y2Y' || s.id === 'NFCI' ? 0 : undefined}
          lines={[{ values: ind.x, color: 'var(--blue)', label: s.short, format: (v) => fmt(s, v), width: 2.2 }]} />
      </section>
      <div className="grid stats">
        <div className="card stat"><span className="muted">3-month change</span><b>{fmt(s, ind.chg3, true)}</b></div>
        <div className="card stat"><span className="muted">12-month change</span><b>{fmt(s, ind.chg12, true)}</b></div>
        <div className="card stat"><span className="muted">Healthier than</span><b>{ind.health == null ? '—' : `${Math.round(ind.health)}%`}</b><span className="muted sm">of months since late 1996</span></div>
        <div className="card stat"><span className="muted">Momentum</span><b>{m == null ? '—' : Math.abs(m) < 0.05 ? '0.0σ' : `${m > 0 ? '+' : '−'}${Math.abs(m).toFixed(1)}σ`}</b><span className="muted sm">3-mo change vs. typical</span></div>
      </div>
      <h2 className="sec">Last 24 months</h2>
      <div className="card"><div className="hm-strip big" style={{ gridTemplateColumns: 'repeat(24, 1fr)' }}>
        {Array.from({ length: 24 }, (_, j) => stripFrom + j).map((t) => <i key={t} style={{ background: heat(t >= 0 ? ind.mom[t] : null) }} title={monthLabel(model.dates[t], true)} />)}
      </div><div className="hm-ends"><span>{monthLabel(model.dates[stripFrom])}</span><span>{monthLabel(model.dates[ind.lastIdx])}</span></div></div>
      <h2 className="sec">About</h2>
      <div className="card"><p>{s.blurb}</p><p className="muted sm">Weight in your composite: <b>{(w[s.id] ?? 0).toFixed(1)}×</b> · <a href="#/composite">adjust</a> · <a href={`https://fred.stlouisfed.org/series/${s.id}`} target="_blank" rel="noopener noreferrer">Source on FRED ↗</a></p></div>
      <div className="pager"><a href={`#/i/${prev.spec.id}`}>← {prev.spec.short}</a><a href={`#/i/${next.spec.id}`}>{next.spec.short} →</a></div>
    </>
  );
}

/* ───────────── Methodology ───────────── */
export function Method() {
  return (
    <div className="prose">
      <h1 className="h1">Methodology</h1>
      <h3>Data</h3>
      <p>All series come from the Federal Reserve Bank of St. Louis (FRED) and are refreshed from FRED at most every six hours. Daily and weekly series are averaged to months. Recession shading is the NBER indicator (USREC). No API key or database is involved.</p>
      <h3>What you see</h3>
      <p>Rate-like series (unemployment, yields, spreads) are used as published. Index-like series (payrolls, CPI, retail sales, S&amp;P 500, industrial production) are converted to year-over-year % change, which removes trend and makes them comparable over time.</p>
      <h3>Health direction</h3>
      <p>Each indicator is tagged as "higher is healthier" or "lower is healthier" (for example unemployment, inflation, credit spreads and mortgage rates are lower-is-better). All scores are sign-adjusted so that positive always means a healthier economy. Inflation is a simplification: very low inflation is not actually ideal.</p>
      <h3>Momentum map</h3>
      <p>For each month, the three-month change in the displayed value is divided by that indicator's typical three-month change over the 30-year window (using a robust, outlier-resistant scale). Cells beyond ±0.5 standard deviations are colored; the rest are called steady. Using each indicator's own scale makes a payroll slowdown and a spread blowout directly comparable, which raw percentage changes did not allow.</p>
      <h3>Composite index</h3>
      <p>Each indicator's level is standardized (z-score vs. the 30-year window starting late 1996), sign-adjusted, then averaged using your weights and mapped to <code>50 + 25 × z</code>, clipped to 0–100. Short publication lags are carried forward for up to two months so a late release does not whipsaw the latest reading. The score needs at least 60% of the weight in available data.</p>
      <h3>Caveats</h3>
      <h3>Calibrating the weights</h3>
      <p>Default weights come from <code>scripts/calibrate.ts</code>: a non-negative, L2-regularized, class-balanced logistic regression of NBER recession months on the indicators' standardized, sign-adjusted levels over November 1996 to today. Validation holds out one recession at a time (2001, 2008–09, 2020), and the amount of regularization and shrinkage toward equal weights are chosen by that cross-validation, preferring the simplest setting within 0.01 AUC of the best. The result is a modest tilt, not a dramatic reweighting; see the numbers on the Composite page.</p>
      <h3>Series substitutions</h3>
      <p>FRED now carries only about 10 years of the S&amp;P 500 and about 3 years of the ICE high-yield spread, so a 30-year calibration uses the Nasdaq Composite and the Baa-minus-10-year Treasury spread instead. Job openings (JOLTS) begin in December 2000; before that the composite re-weights across the remaining indicators.</p>
      <h3>Caveats</h3>
      <p>The window holds just three recessions (the 1990–91 recession falls just outside 30 years) and the target is contemporaneous, so the fit favors coincident indicators over leading ones such as the yield curve. "Average" means the average of this 30-year period. This is a descriptive dashboard, not a forecast or investment advice.</p>
    </div>
  );
}
