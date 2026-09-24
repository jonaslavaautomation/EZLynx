import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';

/**
 * Tiny hand-built SVG/CSS chart kit (no chart library).
 * - Categorical colors are assigned in fixed order (never cycled); >8 categories fold into "Other".
 * - Thin marks, 4px rounded data-ends, hairline recessive grid, tabular axis numbers.
 * - Every chart has a hover/focus tooltip, an aria-label, and (for 2+ series) a legend.
 */

import { CHART_ACCENT, colorAt, fmtCompact, foldOther, niceTicks, type ValueFormat } from './chart-utils';

const GRID = '#efeaea';
const AXIS = '#cbd7da';
const MUTED = '#8f8484';
const plain: ValueFormat = (n) => n.toLocaleString('en-US');

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

// ── Tooltip ──

type Tip = { x: number; y: number; title: string; rows: { color: string; label: string; value: string }[] } | null;

function Tooltip({ tip, width }: { tip: Tip; width: number }) {
  if (!tip) return null;
  const left = Math.min(Math.max(tip.x, 70), Math.max(70, width - 70));
  return (
    <div
      className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded border border-ink-100 bg-white px-2.5 py-1.5 shadow-pop text-xs whitespace-nowrap"
      style={{ left, top: tip.y - 8 }}
      role="status"
    >
      <div className="text-[11px] text-ink-400 mb-0.5">{tip.title}</div>
      {tip.rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          <span className="inline-block w-3 h-0.5 rounded" style={{ background: r.color }} />
          <span className="font-semibold text-ink-900 tabular-nums">{r.value}</span>
          <span className="text-ink-500">{r.label}</span>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items, className }: { items: { label: string; color: string; value?: string; line?: boolean }[]; className?: string }) {
  return (
    <ul className={'flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-600 ' + (className ?? '')} aria-label="Legend">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5">
          <span className={it.line ? 'inline-block w-3 h-0.5 rounded' : 'inline-block w-2.5 h-2.5 rounded-sm'} style={{ background: it.color }} />
          <span>{it.label}</span>
          {it.value && <span className="font-semibold text-ink-900 tabular-nums">{it.value}</span>}
        </li>
      ))}
    </ul>
  );
}

function Empty({ height, children = 'No data for the selected filters' }: { height: number; children?: ReactNode }) {
  return <div className="grid place-items-center text-[13px] text-ink-400 border border-dashed border-ink-100 rounded" style={{ height }}>{children}</div>;
}

// Path for a column rounded (r) at the top only, square at baseline.
function topRoundedRect(x: number, y: number, w: number, h: number, r: number) {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

// ── Vertical bar / column chart (single or stacked series) ──

export type BarSeries = { name: string; data: number[]; color?: string };

export function BarChart({
  labels, series, height = 240, format = plain, axisFormat, ariaLabel, onBarClick,
}: {
  labels: string[];
  series: BarSeries[];
  height?: number;
  format?: ValueFormat;
  axisFormat?: ValueFormat;
  ariaLabel: string;
  onBarClick?: (index: number) => void;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip>(null);
  const [hover, setHover] = useState<number | null>(null);
  const colors = series.map((s, i) => s.color ?? (series.length === 1 ? CHART_ACCENT : colorAt(i)));
  const totals = labels.map((_, i) => series.reduce((s, x) => s + Math.max(0, x.data[i] ?? 0), 0));
  const ticks = niceTicks(Math.max(...totals, 0));
  const top = ticks[ticks.length - 1] || 1;
  const af = axisFormat ?? fmtCompact;
  const padL = 44, padR = 8, padT = 10, padB = 26;
  const w = Math.max(width, 200);
  const plotW = w - padL - padR, plotH = height - padT - padB;
  const band = labels.length ? plotW / labels.length : plotW;
  const barW = Math.min(24, Math.max(4, band * 0.62));
  const y = (v: number) => padT + plotH - (v / top) * plotH;
  const labelEvery = Math.max(1, Math.ceil(labels.length / Math.max(1, Math.floor(plotW / 44))));

  const showTip = (i: number) => {
    setHover(i);
    setTip({
      x: padL + band * i + band / 2,
      y: y(totals[i]),
      title: labels[i],
      rows: series.length === 1
        ? [{ color: colors[0], label: series[0].name, value: format(series[0].data[i] ?? 0) }]
        : [...series.map((s, k) => ({ color: colors[k], label: s.name, value: format(s.data[i] ?? 0) })), { color: 'transparent', label: 'Total', value: format(totals[i]) }],
    });
  };
  const hide = () => { setHover(null); setTip(null); };

  const allZero = totals.every((t) => t === 0);
  return (
    <div className="min-w-0">
      {series.length > 1 && <Legend className="mb-2" items={series.map((s, i) => ({ label: s.name, color: colors[i] }))} />}
      <div ref={ref} className="relative w-full" onMouseLeave={hide}>
        {!labels.length || allZero ? <Empty height={height} /> : width > 0 && (
          <svg width={w} height={height} role="img" aria-label={ariaLabel} className="block overflow-visible">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} stroke={t === 0 ? AXIS : GRID} strokeWidth={1} />
                <text x={padL - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill={MUTED} style={{ fontVariantNumeric: 'tabular-nums' }}>{af(t)}</text>
              </g>
            ))}
            {labels.map((lab, i) => {
              const cx = padL + band * i + band / 2;
              let acc = 0;
              const segs = series.map((s, k) => {
                const v = Math.max(0, s.data[i] ?? 0);
                const y0 = y(acc), y1 = y(acc + v);
                acc += v;
                return { k, v, y0, y1 };
              }).filter((sg) => sg.v > 0);
              return (
                <g key={i} opacity={hover === null || hover === i ? 1 : 0.55}>
                  {segs.map((sg, idx) => {
                    const isTop = idx === segs.length - 1;
                    const gap = idx > 0 ? 2 : 0; // 2px surface gap between stacked segments
                    const h = Math.max(0, sg.y0 - sg.y1 - gap);
                    return isTop
                      ? <path key={sg.k} d={topRoundedRect(cx - barW / 2, sg.y1, barW, h, 4)} fill={colors[sg.k]} />
                      : <rect key={sg.k} x={cx - barW / 2} y={sg.y1} width={barW} height={h} fill={colors[sg.k]} />;
                  })}
                  {i % labelEvery === 0 && <text x={cx} y={height - 8} textAnchor="middle" fontSize={10} fill={MUTED}>{lab}</text>}
                  <rect
                    x={padL + band * i} y={padT} width={band} height={plotH} fill="transparent"
                    tabIndex={0} role="button" aria-label={`${lab}: ${format(totals[i])}`}
                    className={onBarClick ? 'cursor-pointer outline-none' : 'outline-none'}
                    onMouseMove={() => showTip(i)} onFocus={() => showTip(i)} onBlur={hide}
                    onClick={onBarClick ? () => onBarClick(i) : undefined}
                  />
                </g>
              );
            })}
          </svg>
        )}
        <Tooltip tip={tip} width={w} />
      </div>
    </div>
  );
}

// ── Horizontal bar chart (CSS; responsive, labels never clipped) ──

export type HBarDatum = { label: string; value: number; hint?: string; color?: string };

export function HBarChart({ data, format = plain, ariaLabel, max: maxRows = 12, onRowClick }: { data: HBarDatum[]; format?: ValueFormat; ariaLabel: string; max?: number; onRowClick?: (d: HBarDatum) => void }) {
  const [hover, setHover] = useState<string | null>(null);
  const rows = data.slice(0, maxRows);
  const max = Math.max(...rows.map((d) => d.value), 0);
  if (!rows.length || max <= 0) return <Empty height={120} />;
  return (
    <ul role="list" aria-label={ariaLabel} className="space-y-1.5">
      {rows.map((d) => {
        const pct = Math.max(0.5, (Math.max(0, d.value) / max) * 100);
        const tipText = `${d.label}: ${format(d.value)}${d.hint ? ` · ${d.hint}` : ''}`;
        return (
          <li
            key={d.label}
            tabIndex={0}
            title={tipText}
            aria-label={tipText}
            onMouseEnter={() => setHover(d.label)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(d.label)} onBlur={() => setHover(null)}
            onClick={onRowClick ? () => onRowClick(d) : undefined}
            className={'grid grid-cols-[minmax(80px,32%)_1fr_auto] items-center gap-2 rounded px-1 py-0.5 outline-none focus:bg-brand-50 ' + (onRowClick ? 'cursor-pointer hover:bg-ink-50' : '')}
          >
            <span className="text-xs text-ink-700 truncate" title={d.label}>{d.label}</span>
            <span className="block min-w-0">
              <span className="block h-3.5 rounded-r-[4px] transition-opacity" style={{ width: `${pct}%`, background: d.color ?? CHART_ACCENT, opacity: hover === null || hover === d.label ? 1 : 0.55 }} />
            </span>
            <span className="text-xs font-semibold text-ink-900 tabular-nums whitespace-nowrap text-right min-w-[56px]">
              {format(d.value)}
              {hover === d.label && d.hint && <span className="block text-[10px] font-normal text-ink-400">{d.hint}</span>}
            </span>
          </li>
        );
      })}
      {data.length > maxRows && <li className="text-[11px] text-ink-400 px-1">+ {data.length - maxRows} more in the table below</li>}
    </ul>
  );
}

// ── Donut chart ──

export function DonutChart({ data, format = plain, ariaLabel, size = 180, centerLabel = 'Total' }: { data: { label: string; value: number }[]; format?: ValueFormat; ariaLabel: string; size?: number; centerLabel?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const items = useMemo(() => foldOther(data.filter((d) => d.value > 0)), [data]);
  const total = items.reduce((s, d) => s + d.value, 0);
  if (!total) return <Empty height={size} />;
  const r = size / 2, stroke = Math.max(14, size * 0.14), rad = r - stroke / 2;
  const circ = 2 * Math.PI * rad;
  const gap = items.length > 1 ? 2 : 0; // 2px surface gap between segments
  let acc = 0;
  const h = hover !== null ? items[hover] : null;
  return (
    <div className="flex flex-col sm:flex-row items-center gap-4 min-w-0">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} role="img" aria-label={ariaLabel} className="-rotate-90 overflow-visible">
          {items.map((d, i) => {
            const len = (d.value / total) * circ;
            const seg = (
              <circle
                key={d.label} cx={r} cy={r} r={rad} fill="none" stroke={colorAt(i, d.label)} strokeWidth={hover === i ? stroke + 4 : stroke}
                strokeDasharray={`${Math.max(0.5, len - gap)} ${circ}`} strokeDashoffset={-acc}
                tabIndex={0} aria-label={`${d.label}: ${format(d.value)} (${((d.value / total) * 100).toFixed(1)}%)`}
                className="outline-none cursor-default transition-[stroke-width]"
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
              />
            );
            acc += len;
            return seg;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center px-6">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-ink-400 truncate max-w-[110px]">{h ? h.label : centerLabel}</div>
            <div className="text-base font-semibold text-ink-900">{format(h ? h.value : total)}</div>
            {h && <div className="text-[11px] text-ink-500">{((h.value / total) * 100).toFixed(1)}%</div>}
          </div>
        </div>
      </div>
      <ul className="w-full min-w-0 space-y-1" aria-label="Legend">
        {items.map((d, i) => (
          <li key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} className={'flex items-center gap-2 text-xs rounded px-1 py-0.5 ' + (hover === i ? 'bg-ink-50' : '')}>
            <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: colorAt(i, d.label) }} />
            <span className="text-ink-700 truncate flex-1">{d.label}</span>
            <span className="font-semibold text-ink-900 tabular-nums">{format(d.value)}</span>
            <span className="text-ink-400 tabular-nums w-11 text-right">{((d.value / total) * 100).toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Line chart (crosshair tooltip) ──

export type LineSeries = { name: string; data: number[]; color?: string };

export function LineChart({ labels, series, height = 220, format = plain, axisFormat, ariaLabel, yMax }: { labels: string[]; series: LineSeries[]; height?: number; format?: ValueFormat; axisFormat?: ValueFormat; ariaLabel: string; yMax?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [idx, setIdx] = useState<number | null>(null);
  const colors = series.map((s, i) => s.color ?? (series.length === 1 ? CHART_ACCENT : colorAt(i)));
  const ticks = niceTicks(yMax ?? Math.max(...series.flatMap((s) => s.data), 0));
  const top = ticks[ticks.length - 1] || 1;
  const af = axisFormat ?? fmtCompact;
  const padL = 44, padR = 12, padT = 10, padB = 26;
  const w = Math.max(width, 200);
  const plotW = w - padL - padR, plotH = height - padT - padB;
  const n = labels.length;
  const x = (i: number) => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => padT + plotH - (Math.max(0, v) / top) * plotH;
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / 48))));

  const onMove = (e: MouseEvent<SVGRectElement>) => {
    const rect = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    setIdx(Math.max(0, Math.min(n - 1, Math.round((px / plotW) * (n - 1)))));
  };
  const tip: Tip = idx === null ? null : {
    x: x(idx), y: Math.min(...series.map((s) => y(s.data[idx] ?? 0))), title: labels[idx],
    rows: series.map((s, k) => ({ color: colors[k], label: s.name, value: format(s.data[idx] ?? 0) })),
  };

  if (!n) return <Empty height={height} />;
  return (
    <div className="min-w-0">
      {series.length > 1 && <Legend className="mb-2" items={series.map((s, i) => ({ label: s.name, color: colors[i], line: true }))} />}
      <div ref={ref} className="relative w-full">
        {width > 0 && (
          <svg width={w} height={height} role="img" aria-label={ariaLabel} className="block overflow-visible">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} stroke={t === 0 ? AXIS : GRID} />
                <text x={padL - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill={MUTED} style={{ fontVariantNumeric: 'tabular-nums' }}>{af(t)}</text>
              </g>
            ))}
            {labels.map((l, i) => i % labelEvery === 0 && <text key={i} x={x(i)} y={height - 8} textAnchor="middle" fontSize={10} fill={MUTED}>{l}</text>)}
            {series.length === 1 && n > 1 && (
              <path d={`M${x(0)},${y(0)} ${series[0].data.map((v, i) => `L${x(i)},${y(v)}`).join(' ')} L${x(n - 1)},${y(0)}Z`} fill={colors[0]} opacity={0.1} />
            )}
            {series.map((s, k) => (
              <polyline key={s.name} points={s.data.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke={colors[k]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {series.map((s, k) => n > 0 && (
              <circle key={s.name + 'end'} cx={x(n - 1)} cy={y(s.data[n - 1] ?? 0)} r={4} fill={colors[k]} stroke="#fff" strokeWidth={2} />
            ))}
            {idx !== null && (
              <g>
                <line x1={x(idx)} x2={x(idx)} y1={padT} y2={padT + plotH} stroke={AXIS} />
                {series.map((s, k) => <circle key={s.name} cx={x(idx)} cy={y(s.data[idx] ?? 0)} r={4} fill={colors[k]} stroke="#fff" strokeWidth={2} />)}
              </g>
            )}
            <rect
              x={padL} y={padT} width={plotW} height={plotH} fill="transparent" tabIndex={0} className="outline-none"
              aria-label={`${ariaLabel}. Use arrow keys to read values.`}
              onMouseMove={onMove} onMouseLeave={() => setIdx(null)} onFocus={() => setIdx(n - 1)} onBlur={() => setIdx(null)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') setIdx((i) => Math.max(0, (i ?? n - 1) - 1));
                if (e.key === 'ArrowRight') setIdx((i) => Math.min(n - 1, (i ?? 0) + 1));
              }}
            />
          </svg>
        )}
        <Tooltip tip={tip} width={w} />
      </div>
    </div>
  );
}

/** Inline trend line for stat tiles. */
export function Sparkline({ data, width = 96, height = 28, color = CHART_ACCENT, ariaLabel = 'Trend' }: { data: number[]; width?: number; height?: number; color?: string; ariaLabel?: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data), min = Math.min(...data, 0);
  const span = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * (width - 4) + 2, height - 2 - ((v - min) / span) * (height - 4)] as const);
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block">
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="#beb3b3" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r={3} fill={color} stroke="#fff" strokeWidth={1.5} />
    </svg>
  );
}
