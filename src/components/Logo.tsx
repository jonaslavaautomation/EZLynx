/** Northstar AMS mark: a geometric leaping cat in a red badge. Same artwork as public/favicon.svg. */
export const LOGO_PATH = 'M4 14 L8 13 L13 22 L22 20 L34 16 L45 14 L48 8 L51 12 L54 8 L56 14 L61 19 L58 24 L52 25 L55 30 L62 35 L60 38 L51 33 L44 34 L34 33 L24 36 L14 46 L5 52 L5 47 L12 41 L15 33 L11 27 L7 19 Z';

export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role="img" aria-label="Northstar AMS">
      <rect width="64" height="64" rx="14" fill="#dc2626" />
      <path fill="#fff" stroke="#fff" strokeWidth="1" strokeLinejoin="round" d={LOGO_PATH} />
    </svg>
  );
}
