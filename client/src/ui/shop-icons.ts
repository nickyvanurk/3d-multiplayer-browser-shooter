// Hand-authored inline SVG icons for the shop, drawn on a 24×24 grid. `icon()`
// stamps one at a given pixel size; weapon/action icons use `currentColor` so
// they inherit the element's colour, while ore/credits carry their own gold and
// the mining laser its signature red beam.
const GOLD = '#e8b04b';
const RED = '#ff3b3b';
const CYAN = '#5ad1ff';

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

  // Mouse with the left button lit (LMB — primary slot). Adapted from Kenney's
  // CC0 input-prompts pack; the body inherits currentColor, the active button
  // takes the self-cyan so it reads as "your bind".
  'mouse-left': (s) => `
    <svg viewBox="0 0 64 64" width="${s}" height="${s}">
      <path stroke="none" fill="currentColor" d="M34 10 L44 10 Q45.75 10 46.9 10.6 49 11.75 49 15 L49 25 38 25 38 19 Q38 16.5 36.25 14.75 35.25 13.75 34 13.35 L34 10 M29.9 16.9 Q30.75 16 32 16 33.25 16 34.15 16.9 35 17.75 35 19 L35 27 34.85 28 34.15 29.15 Q33.25 30 32 30 30.75 30 29.9 29.15 29.4 28.65 29.2 28 L29 27 29 19 Q29 17.75 29.9 16.9 M15 28 L26.1 28 Q26.35 29.85 27.75 31.25 29.5 33 32 33 34.5 33 36.25 31.25 37.65 29.85 37.95 28 L49 28 49 37.5 Q48.8 44.25 44 49 39.25 53.8 32.5 54 L31.5 54 Q24.75 53.8 19.95 49 15.2 44.25 15 37.5 L15 28"/>
      <path stroke="none" fill="${CYAN}" d="M20 10 L30 10 30 13.35 Q28.75 13.75 27.75 14.75 26 16.5 26 19 L26 25 15 25 15 15 Q15 11.75 17.15 10.6 18.25 10 20 10"/>
    </svg>`,

  // Mouse with the right button lit (RMB — secondary slot).
  'mouse-right': (s) => `
    <svg viewBox="0 0 64 64" width="${s}" height="${s}">
      <path stroke="none" fill="${CYAN}" d="M34 10 L44 10 Q45.75 10 46.9 10.6 49 11.75 49 15 L49 25 38 25 38 19 Q38 16.5 36.25 14.75 35.25 13.75 34 13.35 L34 10"/>
      <path stroke="none" fill="currentColor" d="M29.9 16.9 Q30.75 16 32 16 33.25 16 34.15 16.9 35 17.75 35 19 L35 27 34.85 28 34.15 29.15 Q33.25 30 32 30 30.75 30 29.9 29.15 29.4 28.65 29.2 28 L29 27 29 19 Q29 17.75 29.9 16.9 M15 28 L26.1 28 Q26.35 29.85 27.75 31.25 29.5 33 32 33 34.5 33 36.25 31.25 37.65 29.85 37.95 28 L49 28 49 37.5 Q48.8 44.25 44 49 39.25 53.8 32.5 54 L31.5 54 Q24.75 53.8 19.95 49 15.2 44.25 15 37.5 L15 28 M20 10 L30 10 30 13.35 Q28.75 13.75 27.75 14.75 26 16.5 26 19 L26 25 15 25 15 15 Q15 11.75 17.15 10.6 18.25 10 20 10"/>
    </svg>`,
};

export function icon(name: string, size = 24): string {
  const build = PATHS[name];
  return build ? build(size).trim() : '';
}
