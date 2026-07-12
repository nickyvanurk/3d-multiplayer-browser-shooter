// Hand-authored inline SVG icons for the shop, drawn on a 24×24 grid. `icon()`
// stamps one at a given pixel size; weapon/action icons use `currentColor` so
// they inherit the element's colour, while ore/credits carry their own gold and
// the mining laser its signature red beam.
const GOLD = '#e8b04b';
const RED = '#ff3b3b';

const PATHS: Record<string, (s: number) => string> = {
  // Twin cannon barrels on a mount.
  cannons: (s) => `
    <svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none"
         stroke="currentColor" stroke-width="1.7"
         stroke-linecap="round" stroke-linejoin="round">
      <rect x="6" y="3.5" width="3.6" height="12" rx="1.1"/>
      <rect x="14.4" y="3.5" width="3.6" height="12" rx="1.1"/>
      <path d="M4.5 15.5h15v3a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5z"/>
      <line x1="7.8" y1="3.5" x2="7.8" y2="6.5"/>
      <line x1="16.2" y1="3.5" x2="16.2" y2="6.5"/>
    </svg>`,

  // A beam emitter firing a red mining beam upward, with an impact spark.
  laser: (s) => `
    <svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none"
         stroke-linecap="round" stroke-linejoin="round">
      <rect x="6.5" y="13" width="11" height="7.5" rx="1.6"
            fill="none" stroke="currentColor" stroke-width="1.7"/>
      <circle cx="12" cy="16.75" r="1.5" fill="currentColor"/>
      <line x1="12" y1="13" x2="12" y2="3.5" stroke="${RED}" stroke-width="2.4"/>
      <path d="M9 6.5 L12 3 L15 6.5" fill="none" stroke="${RED}" stroke-width="1.8"/>
    </svg>`,

  // Wrench (repair).
  repair: (s) => `
    <svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none"
         stroke="currentColor" stroke-width="1.8"
         stroke-linecap="round" stroke-linejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
    </svg>`,

  // A faceted ore crystal (gold).
  ore: (s) => `
    <svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none"
         stroke="${GOLD}" stroke-width="1.5" stroke-linejoin="round">
      <path d="M8.5 3h7l4 6-7.5 12L4.5 9z" fill="rgba(232,176,75,0.16)"/>
      <path d="M4.5 9h15M8.5 3l3.5 18M15.5 3l-3.5 18"/>
    </svg>`,

  // A credits coin with an inset "C" glyph (gold).
  credits: (s) => `
    <svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none">
      <circle cx="12" cy="12" r="9" fill="rgba(232,176,75,0.12)"
              stroke="${GOLD}" stroke-width="1.7"/>
      <circle cx="12" cy="12" r="6" stroke="${GOLD}" stroke-width="1" opacity="0.5"/>
      <path d="M14.6 9.4a3.3 3.3 0 1 0 0 5.2" fill="none"
            stroke="${GOLD}" stroke-width="1.8" stroke-linecap="round"/>
    </svg>`,

  // Close (X).
  close: (s) => `
    <svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none"
         stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <line x1="6" y1="6" x2="18" y2="18"/>
      <line x1="18" y1="6" x2="6" y2="18"/>
    </svg>`,
};

export function icon(name: string, size = 24): string {
  const build = PATHS[name];
  return build ? build(size).trim() : '';
}
