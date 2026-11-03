import { useEffect, useMemo, useRef, useState } from 'react';
import { Arr } from '../lib/calc';

export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(320);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(120, Math.floor(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export function Spark({ values, w = 96, h = 28, color = 'var(--blue)' }: { values: Arr; w?: number; h?: number; color?: string }) {
  const pts = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] != null);
  if (pts.length < 2) return <svg width={w} height={h} />;
  const ys = pts.map((p) => p[1]); const lo = Math.min(...ys), hi = Math.max(...ys);
  const x = (i: number) => (i / (values.length - 1)) * (w - 4) + 2;
  const y = (v: number) => h - 3 - ((v - lo) / (hi - lo || 1)) * (h - 6);
  const d = pts.map((p, k) => `${k ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join('');
  const l = pts[pts.length - 1];
  return (
    <svg width={w} height={h} aria-hidden="true" className="spark">
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(l[0])} cy={y(l[1])} r="2.4" fill={color} />
    </svg>
  );
}

export interface Line { values: Arr; color: string; label: string; format: (v: number) => string; width?: number }

interface LCProps {
  dates: string[]; lines: Line[]; bands?: boolean[]; height?: number; ref0?: number; refLabel?: string;
  from: number; to: number; yDomain?: [number, number]; ticks?: number;
}
/** Dependency-free SVG line chart: recession bands, crosshair tooltip that works with touch. */
export function LineChart({ dates, lines, bands, height = 260, ref0, refLabel, from, to, yDomain, ticks = 4 }: LCProps) {
  const [box, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const padL = 40, padR = 12, padT = 10, padB = 22;
  const n = to - from + 1;
  const { lo, hi } = useMemo(() => {
    if (yDomain) return { lo: yDomain[0], hi: yDomain[1] };
    let lo = Infinity, hi = -Infinity;
    for (const l of lines) for (let i = from; i <= to; i++) { const v = l.values[i]; if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }
    if (ref0 != null) { lo = Math.min(lo, ref0); hi = Math.max(hi, ref0); }
    const pad = (hi - lo || 1) * 0.08;
    return { lo: lo - pad, hi: hi + pad };
  }, [lines, from, to, ref0, yDomain]);
  const X = (i: number) => padL + ((i - from) / Math.max(1, n - 1)) * (w - padL - padR);
  const Y = (v: number) => padT + (1 - (v - lo) / (hi - lo || 1)) * (height - padT - padB);
  const yt = Array.from({ length: ticks + 1 }, (_, k) => lo + ((hi - lo) * k) / ticks);
  const nice = (v: number) => (Math.abs(hi - lo) >= 20 ? Math.round(v).toString() : Math.abs(hi - lo) >= 4 ? v.toFixed(1) : v.toFixed(2));

  const xt: number[] = [];
  const stepY = n > 150 ? 3 : n > 70 ? 2 : 1;
  for (let i = from; i <= to; i++) if (dates[i].endsWith('-01') && Number(dates[i].slice(0, 4)) % stepY === 0) xt.push(i);

  const bandRects: [number, number][] = [];
  if (bands) { let s = -1; for (let i = from; i <= to + 1; i++) { const on = i <= to && bands[i]; if (on && s < 0) s = i; if (!on && s >= 0) { bandRects.push([s, i - 1]); s = -1; } } }

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(from + ((e.clientX - r.left - padL) / (w - padL - padR)) * (n - 1));
    setHover(Math.max(from, Math.min(to, i)));
  };
  const paths = lines.map((l) => {
    let d = '', pen = false;
    for (let i = from; i <= to; i++) { const v = l.values[i]; if (v == null) { pen = false; continue; } d += `${pen ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`; pen = true; }
    return d;
  });
  const hx = hover != null ? X(hover) : 0;
  const tipLeft = hover != null && hx > w * 0.6;

  return (
    <div ref={box} className="chart" style={{ height }}>
      <svg width={w} height={height} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} style={{ touchAction: 'pan-y' }} role="img" aria-label="Line chart">
        {bandRects.map(([a, b], k) => <rect key={k} x={X(a) - 0.5} y={padT} width={Math.max(2, X(b) - X(a) + 1)} height={height - padT - padB} className="band" />)}
        {yt.map((v, k) => (
          <g key={k}><line x1={padL} x2={w - padR} y1={Y(v)} y2={Y(v)} className="grid" /><text x={padL - 6} y={Y(v) + 3.5} textAnchor="end" className="tick">{nice(v)}</text></g>
        ))}
        {xt.map((i) => <text key={i} x={X(i)} y={height - 6} textAnchor="middle" className="tick">{dates[i].slice(0, 4)}</text>)}
        {ref0 != null && ref0 > lo && ref0 < hi && (<g><line x1={padL} x2={w - padR} y1={Y(ref0)} y2={Y(ref0)} className="ref" />{refLabel && <text x={w - padR - 2} y={Y(ref0) - 4} textAnchor="end" className="tick">{refLabel}</text>}</g>)}
        {paths.map((d, k) => <path key={k} d={d} fill="none" stroke={lines[k].color} strokeWidth={lines[k].width ?? 2} strokeLinejoin="round" strokeLinecap="round" />)}
        {hover != null && (<g>
          <line x1={hx} x2={hx} y1={padT} y2={height - padB} className="cross" />
          {lines.map((l, k) => l.values[hover] != null && <circle key={k} cx={hx} cy={Y(l.values[hover] as number)} r="3.8" fill={l.color} stroke="var(--bg)" strokeWidth="1.5" />)}
        </g>)}
      </svg>
      {hover != null && (
        <div className="tip" style={{ left: tipLeft ? undefined : hx + 10, right: tipLeft ? w - hx + 10 : undefined, top: 6 }}>
          <b>{new Date(+dates[hover].slice(0, 4), +dates[hover].slice(5) - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}{bands?.[hover] ? ' · recession' : ''}</b>
          {lines.map((l, k) => <div key={k}><i style={{ background: l.color }} />{l.label} <b>{l.values[hover] != null ? l.format(l.values[hover] as number) : '—'}</b></div>)}
        </div>
      )}
    </div>
  );
}

export function Meter({ score }: { score: number | null }) {
  const v = score ?? 50;
  return (
    <div className="meter" aria-hidden="true">
      <div className="meter-bar" /><div className="meter-pin" style={{ left: `${v}%` }} />
      <div className="meter-ends"><span>Weak</span><span>Average</span><span>Strong</span></div>
    </div>
  );
}

/** Diverging heat color for a standardized momentum value. Neutral band is visibly neutral. */
export function heat(m: number | null): string {
  if (m == null) return 'var(--na)';
  const a = Math.min(1, Math.abs(m) / 2.5);
  if (Math.abs(m) < 0.5) return 'var(--flat)';
  const t = 0.35 + 0.65 * a;
  return m > 0 ? `color-mix(in srgb, var(--good) ${t * 100}%, var(--cell-bg))` : `color-mix(in srgb, var(--bad) ${t * 100}%, var(--cell-bg))`;
}
