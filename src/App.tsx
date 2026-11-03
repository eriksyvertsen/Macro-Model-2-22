import { useEffect, useMemo, useState } from 'react';
import { useData } from './lib/useData';
import { useRoute } from './lib/route';
import { Weights, monthLabel, presetWeights } from './lib/calc';
import { Composite, Detail, Indicators, Method, Momentum, Overview } from './components/Pages';

const NAV = [
  { page: 'overview', href: '#/', label: 'Overview', icon: 'M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10' },
  { page: 'momentum', href: '#/momentum', label: 'Momentum', icon: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z' },
  { page: 'composite', href: '#/composite', label: 'Composite', icon: 'M3 17l5-6 4 4 8-10' },
  { page: 'indicators', href: '#/indicators', label: 'Indicators', icon: 'M4 6h16M4 12h16M4 18h16' },
] as const;

function loadWeights(): Weights | null {
  try { return JSON.parse(localStorage.getItem('mp.weights.v2') || 'null'); } catch { return null; }
}
function weightsFromQuery(q: string | null): Weights | null {
  if (!q) return null;
  const out: Weights = {};
  for (const part of q.split(',')) { const [k, v] = part.split(':'); const n = parseFloat(v); if (k && Number.isFinite(n)) out[k] = Math.max(0, Math.min(3, n)); }
  return Object.keys(out).length ? out : null;
}

export default function App() {
  const route = useRoute();
  const { model, live, failed } = useData();
  const [stored, setStored] = useState<Weights | null>(() => weightsFromQuery(new URLSearchParams(location.hash.split('?')[1] ?? '').get('w')) ?? loadWeights());
  const w = useMemo<Weights>(() => (model ? { ...presetWeights(model, 'calibrated'), ...(stored ?? {}) } : {}), [model, stored]);
  const setW = (n: Weights) => { setStored(n); try { localStorage.setItem('mp.weights.v2', JSON.stringify(n)); } catch { /* private mode */ } };
  useEffect(() => { document.title = route.page === 'overview' ? 'Macro Pulse — U.S. economy at a glance' : `Macro Pulse · ${route.page === 'indicator' ? route.id : route.page}`; }, [route]);
  const active = route.page === 'indicator' ? 'indicators' : route.page;

  return (
    <>
      <header className="top">
        <div className="wrap top-in">
          <a href="#/" className="brand"><svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><rect width="32" height="32" rx="7" fill="#1E3A8A" /><path d="M4 18h6l3-8 5 14 3-9 2 3h5" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>Macro Pulse</a>
          {model && <span className="asof">{live ? <i className="dot" /> : null}Data through {monthLabel(model.dates[model.dates.length - 1], true)}</span>}
          <nav className="dnav" aria-label="Primary">{NAV.map((n) => <a key={n.page} href={n.href} className={active === n.page ? 'on' : ''}>{n.label}</a>)}<a href="#/method" className={active === 'method' ? 'on' : ''}>Method</a></nav>
        </div>
      </header>
      <main className="wrap main">
        {!model && !failed && <div className="skeleton"><div className="sk big" /><div className="sk" /><div className="sk" /></div>}
        {failed && !model && <div className="card"><b>Couldn't load data.</b><p className="muted">FRED may be unreachable right now. Please refresh in a minute.</p></div>}
        {model && route.page === 'overview' && <Overview model={model} w={w} />}
        {model && route.page === 'momentum' && <Momentum model={model} />}
        {model && route.page === 'composite' && <Composite model={model} w={w} setW={setW} />}
        {model && route.page === 'indicators' && <Indicators model={model} query={route.query} key={route.query.toString()} />}
        {model && route.page === 'indicator' && <Detail model={model} id={route.id!} w={w} />}
        {route.page === 'method' && <Method />}
        <footer className="foot">Data: <a href="https://fred.stlouisfed.org" target="_blank" rel="noopener noreferrer">FRED</a>, Federal Reserve Bank of St. Louis. Descriptive only, not investment advice. <a href="#/method">Methodology</a></footer>
      </main>
      <nav className="tabbar" aria-label="Primary">
        {NAV.map((n) => <a key={n.page} href={n.href} className={active === n.page ? 'on' : ''}><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d={n.icon} /></svg><span>{n.label}</span></a>)}
      </nav>
    </>
  );
}
