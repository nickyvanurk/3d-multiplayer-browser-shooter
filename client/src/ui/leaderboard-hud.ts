import type { LeaderboardData } from '../net/network-client.ts';

// The self-accent cyan, matched to PlayerHud so "you" reads the same across the
// instruments; gold echoes the level badge.
const SELF_CYAN = '#5ad1ff';

// Top-right standings, styled as a mirror of the top-left PlayerHud: the same
// clamp sizing unit, muted blue-grey palette, monospace numerals, gold level
// numbers, cyan self-accent, and the signature skewed gauge-style track behind
// each row — floating on a drop-shadow rather than a boxed card. Shows the
// top-ranked pilots plus your own row when you fall outside the visible top N.
// Server-ranked (level desc, xp desc) from the throttled Leaderboard message;
// rebuilds the DOM only when the ranking actually changes. Bots and players share
// the board — both reset on death.
export class LeaderboardHud {
  private readonly root: HTMLDivElement;
  private readonly list: HTMLDivElement;
  // Signature of the last render, so an unchanged push touches no DOM.
  private lastSig = '';

  constructor() {
    LeaderboardHud.injectStyles();

    this.root = document.createElement('div');
    this.root.className = 'vf-lb';
    this.root.innerHTML = '<div class="vf-lb__list"></div>';
    document.body.appendChild(this.root);
    this.list = this.root.querySelector('.vf-lb__list')!;
  }

  update(data: LeaderboardData): void {
    const sig = `${data.selfRank}:${data.selfLevel}:${data.entries
      .map((e) => `${e.name}#${e.level}`)
      .join('|')}`;
    if (sig === this.lastSig) {
      return;
    }
    this.lastSig = sig;

    this.list.replaceChildren();

    const shownRanks = data.entries.length;
    data.entries.forEach((entry, i) => {
      const rank = i + 1;
      this.list.appendChild(
        this.makeRow(rank, entry.name, entry.level, rank === data.selfRank),
      );
    });

    // Outside the visible top N (and actually ranked, i.e. alive): show your own
    // standing under a divider so you always know your number.
    if (data.selfRank > shownRanks && data.selfRank > 0) {
      const gap = document.createElement('div');
      gap.className = 'vf-lb__gap';
      this.list.appendChild(gap);
      this.list.appendChild(
        this.makeRow(data.selfRank, 'You', data.selfLevel, true),
      );
    }
  }

  private makeRow(
    rank: number,
    name: string,
    level: number,
    self: boolean,
  ): HTMLDivElement {
    const row = document.createElement('div');
    row.className = self ? 'vf-lb__row vf-lb__row--self' : 'vf-lb__row';

    const rankEl = document.createElement('span');
    rankEl.className = 'vf-lb__rank';
    rankEl.textContent = `${rank}`;

    const nameEl = document.createElement('span');
    nameEl.className = 'vf-lb__name';
    // textContent, never innerHTML: names are user callsigns.
    nameEl.textContent = name;

    const lvlEl = document.createElement('span');
    lvlEl.className = 'vf-lb__lvl';
    lvlEl.textContent = `${level}`;

    row.append(rankEl, nameEl, lvlEl);
    return row;
  }

  private static injectStyles(): void {
    if (document.getElementById('vf-lb-styles')) {
      return;
    }
    const style = document.createElement('style');
    style.id = 'vf-lb-styles';
    // Shares PlayerHud's --u/--skew, palette and fonts so both corners read as one
    // instrument set.
    style.textContent = `
.vf-lb {
  --u: clamp(14px, 1.05vw, 20px);
  --skew: -15deg;
  position: fixed; right: calc(var(--u) * 1); top: calc(var(--u) * 0.95);
  z-index: 14000; width: calc(var(--u) * 11.5);
  font-family: system-ui, 'Segoe UI', sans-serif;
  color: #cfd8e6; pointer-events: none; user-select: none;
  filter: drop-shadow(0 calc(var(--u) * 0.15) calc(var(--u) * 0.5) rgba(0,0,0,0.6));
}
.vf-lb__list { display: flex; flex-direction: column; gap: calc(var(--u) * 0.22); }
.vf-lb__row {
  position: relative;
  display: grid;
  grid-template-columns: calc(var(--u) * 1.5) 1fr max-content;
  align-items: center; gap: calc(var(--u) * 0.5);
  padding: calc(var(--u) * 0.2) calc(var(--u) * 0.62);
}
/* Skewed translucent track behind each row — the gauge-bar motif from PlayerHud.
   Absolute so it stays out of the grid; the row's text paints upright over it. */
.vf-lb__row::before {
  content: ''; position: absolute; inset: 0;
  transform: skewX(var(--skew));
  background: rgba(255,255,255,0.06);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06),
    inset 0 1px 0 rgba(255,255,255,0.05);
}
.vf-lb__row--self::before {
  background: linear-gradient(90deg, rgba(90,209,255,0.22), rgba(90,209,255,0.08));
  box-shadow: inset 0 0 0 1px rgba(90,209,255,0.4),
    0 0 calc(var(--u) * 0.45) rgba(90,209,255,0.3);
}
.vf-lb__rank {
  font-family: ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, monospace;
  font-size: calc(var(--u) * 0.6); font-weight: 600;
  font-variant-numeric: tabular-nums; color: #8492ac; text-align: right;
}
.vf-lb__row--self .vf-lb__rank { color: ${SELF_CYAN}; }
.vf-lb__name {
  font-size: calc(var(--u) * 0.66); font-weight: 600; color: #e6edf6;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.vf-lb__row--self .vf-lb__name { color: #eaffff; }
.vf-lb__lvl {
  font-family: ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, monospace;
  font-size: calc(var(--u) * 0.66); font-weight: 700;
  font-variant-numeric: tabular-nums; line-height: 1;
  min-width: calc(var(--u) * 1.1); text-align: right;
  color: #ffe9b8; text-shadow: 0 0 calc(var(--u) * 0.3) rgba(255,207,94,0.55);
}
.vf-lb__gap {
  height: 1px; margin: calc(var(--u) * 0.3) calc(var(--u) * 0.62);
  background: repeating-linear-gradient(to right,
    rgba(255,255,255,0.2) 0 calc(var(--u) * 0.3),
    transparent calc(var(--u) * 0.3) calc(var(--u) * 0.62));
}`;
    document.head.appendChild(style);
  }
}
