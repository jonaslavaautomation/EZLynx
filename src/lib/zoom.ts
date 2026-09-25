/** Current app zoom factor (see --zoom in index.css). Screen coordinates ÷ zoom = CSS pixels. */
export function appZoom(): number {
  const z = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--zoom'));
  return Number.isFinite(z) && z > 0 ? z : 1;
}
