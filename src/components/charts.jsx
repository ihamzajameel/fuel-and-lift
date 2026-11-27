// Lightweight SVG charts (no chart library: keeps the app small and fully offline).
// Single-series line + column charts: 2px lines, ≥8px end dot with surface ring,
// hairline solid grid, crosshair + tooltip on touch/hover, end-value direct label.
import { useLayoutEffect, useRef, useState } from 'react';
import { fmtShortDate, parseYmd } from '../lib/time';

function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(320);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function niceTicks(min, max, count = 4) {
  if (min === max) {
    const pad = Math.abs(min) * 0.05 || 1;
    min -= pad;
    max += pad;
  }
  const span = max - min;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) || 10 * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return ticks;
}

const fmtTick = (v) => (Math.abs(v) >= 10000 ? `${Math.round(v / 1000)}K` : Number.isInteger(v) ? v.toLocaleString() : v.toFixed(1));

/**
 * points: [{ date: 'YYYY-MM-DD', value: number, note?: string }]
 */
export function LineChart({ points, unit = '', tone = 'var(--accent)', height = 180, goal, goalLabel, ariaLabel, format = (v) => v }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const pad = { l: 40, r: 56, t: 14, b: 26 };
  const iw = width - pad.l - pad.r;
  const ih = height - pad.t - pad.b;

  if (!points.length) return <div ref={ref} />;

  const t0 = parseYmd(points[0].date).getTime();
  const t1 = parseYmd(points[points.length - 1].date).getTime();
  const vals = points.map((p) => p.value).concat(goal != null ? [goal] : []);
  const ticks = niceTicks(Math.min(...vals), Math.max(...vals));
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const x = (d) => pad.l + (t1 === t0 ? iw / 2 : ((parseYmd(d).getTime() - t0) / (t1 - t0)) * iw);
  const y = (v) => pad.t + ih - ((v - yMin) / (yMax - yMin || 1)) * ih;

  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${path} L${x(points[points.length - 1].date).toFixed(1)},${pad.t + ih} L${x(points[0].date).toFixed(1)},${pad.t + ih} Z`;
  const last = points[points.length - 1];

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = 0;
    let bd = Infinity;
    points.forEach((p, i) => {
      const dd = Math.abs(x(p.date) - px);
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    });
    setHover(best);
  };

  const h = hover != null ? points[hover] : null;

  return (
    <div ref={ref} className="relative select-none">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={ariaLabel}
        className="block touch-pan-y"
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={pad.l + iw} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" />
            <text x={pad.l - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill="var(--faint)" className="tnum">
              {fmtTick(t)}
            </text>
          </g>
        ))}
        {goal != null && (
          <g>
            <line x1={pad.l} x2={pad.l + iw} y1={y(goal)} y2={y(goal)} stroke="var(--muted)" strokeWidth="1" opacity="0.7" />
            <text x={pad.l + 4} y={y(goal) - 5} fontSize="11" fill="var(--muted)">
              {goalLabel || `Goal ${goal}`}
            </text>
          </g>
        )}
        <path d={area} fill={tone} opacity="0.1" />
        <path d={path} fill="none" stroke={tone} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {points.length <= 40 &&
          points.slice(0, -1).map((p) => <circle key={p.date} cx={x(p.date)} cy={y(p.value)} r="2.5" fill={tone} />)}
        <circle cx={x(last.date)} cy={y(last.value)} r="5" fill={tone} stroke="var(--surface)" strokeWidth="2" />
        <text x={x(last.date) + 9} y={y(last.value)} dy="0.32em" fontSize="12" fontWeight="600" fill="var(--fg)" className="tnum">
          {format(last.value)}
          {unit && <tspan fill="var(--muted)" fontWeight="400"> {unit}</tspan>}
        </text>
        <text x={pad.l} y={height - 6} fontSize="11" fill="var(--faint)">
          {fmtShortDate(points[0].date)}
        </text>
        {points.length > 1 && (
          <text x={pad.l + iw} y={height - 6} fontSize="11" fill="var(--faint)" textAnchor="end">
            {fmtShortDate(last.date)}
          </text>
        )}
        {h && (
          <g pointerEvents="none">
            <line x1={x(h.date)} x2={x(h.date)} y1={pad.t} y2={pad.t + ih} stroke="var(--muted)" strokeWidth="1" />
            <circle cx={x(h.date)} cy={y(h.value)} r="5" fill={tone} stroke="var(--surface)" strokeWidth="2" />
          </g>
        )}
      </svg>
      {h && (
        <div
          className="pointer-events-none absolute top-0 z-10 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: Math.min(Math.max(x(h.date) - 60, 0), width - 130), minWidth: 120 }}
        >
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-3 rounded" style={{ background: tone }} />
            <span className="tnum text-sm font-semibold text-fg">
              {format(h.value)} {unit}
            </span>
          </div>
          <div className="text-muted">{fmtShortDate(h.date)}</div>
          {h.note && <div className="text-muted">{h.note}</div>}
        </div>
      )}
    </div>
  );
}

/**
 * bars: [{ key, label, value, sub? }]; target draws a reference line.
 */
export function ColumnChart({ bars, tone = 'var(--accent)', height = 150, target, targetLabel, unit = '', ariaLabel }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const pad = { l: 40, r: 8, t: 14, b: 24 };
  const iw = width - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const max = Math.max(1, ...bars.map((b) => b.value), target || 0);
  const ticks = niceTicks(0, max, 3);
  const yMax = ticks[ticks.length - 1];
  const y = (v) => pad.t + ih - (v / yMax) * ih;
  const band = iw / Math.max(1, bars.length);
  const bw = Math.min(24, band - 4);

  const h = hover != null ? bars[hover] : null;

  return (
    <div ref={ref} className="relative select-none" onPointerLeave={() => setHover(null)}>
      <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={pad.l + iw} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" />
            <text x={pad.l - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill="var(--faint)" className="tnum">
              {fmtTick(t)}
            </text>
          </g>
        ))}
        {bars.map((b, i) => {
          const cx = pad.l + band * i + band / 2;
          const top = y(b.value);
          const hgt = pad.t + ih - top;
          const r = Math.min(4, hgt);
          return (
            <g key={b.key} onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)}>
              <rect x={pad.l + band * i} y={pad.t} width={band} height={ih} fill="transparent" />
              {b.value > 0 && (
                <path
                  d={`M${cx - bw / 2},${pad.t + ih} V${top + r} Q${cx - bw / 2},${top} ${cx - bw / 2 + r},${top} H${cx + bw / 2 - r} Q${cx + bw / 2},${top} ${cx + bw / 2},${top + r} V${pad.t + ih} Z`}
                  fill={tone}
                  opacity={hover == null || hover === i ? 1 : 0.55}
                />
              )}
              <text x={cx} y={height - 6} fontSize="10.5" fill="var(--faint)" textAnchor="middle">
                {b.label}
              </text>
            </g>
          );
        })}
        {target != null && (
          <g pointerEvents="none">
            <line x1={pad.l} x2={pad.l + iw} y1={y(target)} y2={y(target)} stroke="var(--fg)" strokeWidth="1" opacity="0.55" />
            <text x={pad.l + iw} y={y(target) - 5} fontSize="11" fill="var(--muted)" textAnchor="end">
              {targetLabel || `Target ${target}`}
            </text>
          </g>
        )}
      </svg>
      {h && (
        <div
          className="pointer-events-none absolute top-0 z-10 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: Math.min(Math.max(pad.l + band * hover + band / 2 - 55, 0), width - 120), minWidth: 110 }}
        >
          <div className="tnum text-sm font-semibold text-fg">
            {Math.round(h.value).toLocaleString()} {unit}
          </div>
          <div className="text-muted">{h.sub || h.label}</div>
        </div>
      )}
    </div>
  );
}
