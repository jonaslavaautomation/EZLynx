/** LAVA brand mark (robot) — public/lava-mark.png. */
export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  return <img src="/lava-mark.png" width={size} height={size} alt="LAVA" className={className} style={{ width: size, height: size }} />;
}

/** LAVA wordmark (white) — public/lava-wordmark.png; for dark backgrounds. */
export function Wordmark({ height = 18, className }: { height?: number; className?: string }) {
  return <img src="/lava-wordmark.png" alt="LAVA" className={className} style={{ height, width: 'auto' }} />;
}
