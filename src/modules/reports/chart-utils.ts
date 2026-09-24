/** Chart constants and helpers shared by the SVG chart kit. */

/** Validated categorical palette (light surface), fixed order. */
export const CHART_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
/** Single-series accent (brand teal). */
export const CHART_ACCENT = '#dc2626';
const OTHER_COLOR = '#beb3b3';

export type ValueFormat = (n: number) => string;

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
export const fmtCompact: ValueFormat = (n) => compact.format(n);
export const fmtCompactMoney: ValueFormat = (n) => (n < 0 ? '-$' : '$') + compact.format(Math.abs(n));

/** Round tick values covering [0, max]. */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0, 1];
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const top = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = 0; v <= top + step / 1000; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

/** Keep the first `max - 1` items and fold the rest into "Other" so hues never cycle. */
export function foldOther<T extends { label: string; value: number }>(items: T[], max = 8): { label: string; value: number }[] {
  const sorted = [...items].sort((a, b) => b.value - a.value);
  if (sorted.length <= max) return sorted;
  const head = sorted.slice(0, max - 1);
  const rest = sorted.slice(max - 1).reduce((s, x) => s + x.value, 0);
  return [...head, { label: 'Other', value: rest }];
}

export const colorAt = (i: number, label?: string) => (label === 'Other' ? OTHER_COLOR : CHART_COLORS[i % CHART_COLORS.length]);
