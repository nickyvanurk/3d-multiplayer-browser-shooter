import type { World } from '../../../shared/sim/world.ts';
import type { Ship } from '../../../shared/sim/entities/ship.ts';
import { SHIP_MAX_HEALTH } from '../../../shared/sim/trade.ts';

// Below this fraction of hull the bar turns red and pulses — the pilot's "get
// out" cue.
const HULL_CRITICAL_FRAC = 0.25;

// The self-accent: cyan, distinct from the enemy red / vendor gold used by the
// in-world reticles, so the player's own instruments read as unmistakably "you".
const SELF_CYAN = '#5ad1ff';

// Bottom-centre pilot status: a hull gauge (hero) with cargo and credits folded
// in as slim readouts. Everything it shows lives on the owned Ship — health replicates
// every frame, cargo/credits are mirrored from the owner-only Stats stream — so
// this reads straight off the entity and needs no separate feed.
export class PlayerHud {
  private readonly world: World;
  private readonly localShipId: () => number | null;

  private readonly root: HTMLDivElement;
  private readonly emblem: HTMLDivElement;
  private readonly hullFill: HTMLDivElement;
  private readonly hullVal: HTMLDivElement;
  private readonly cargoFill: HTMLDivElement;
  private readonly cargoVal: HTMLDivElement;
  private readonly cargoFullTag: HTMLSpanElement;
  private readonly creditsVal: HTMLDivElement;

  // Only touch the DOM when a value actually changes — the render loop calls
  // update() every frame and most frames move nothing.
  private lastHull = -1;
  private lastCritical = false;
  private lastCargo = -1;
  private lastCargoCap = -1;
  private lastCredits = -1;

  constructor(world: World, localShipId: () => number | null) {
    this.world = world;
    this.localShipId = localShipId;

    PlayerHud.injectStyles();

    this.root = document.createElement('div');
    this.root.className = 'vf-phud';
    this.root.innerHTML = `
      <div class="vf-phud__grp">
        <div class="vf-phud__emblem"><span></span></div>
        <span class="vf-phud__label">Hull</span>
        <div class="vf-phud__bar vf-phud__bar--hull">
          <div class="vf-phud__fill vf-phud__fill--hull"></div>
          <div class="vf-phud__notches vf-phud__notches--10"></div>
        </div>
        <span class="vf-phud__val vf-phud__val--hull">100</span>
      </div>
      <div class="vf-phud__div"></div>
      <div class="vf-phud__grp">
        <span class="vf-phud__label">Cargo</span>
        <div class="vf-phud__bar vf-phud__bar--cargo">
          <div class="vf-phud__fill vf-phud__fill--cargo"></div>
          <div class="vf-phud__notches vf-phud__notches--20"></div>
        </div>
        <span class="vf-phud__val vf-phud__val--cargo">0/0<span class="vf-phud__full">Full</span></span>
      </div>
      <div class="vf-phud__div"></div>
      <div class="vf-phud__grp vf-phud__grp--credits">
        <span class="vf-phud__coin">&#x2b16;</span>
        <span class="vf-phud__val vf-phud__val--credits">0</span>
        <span class="vf-phud__unit">cr</span>
      </div>`;
    document.body.appendChild(this.root);

    this.emblem = this.root.querySelector('.vf-phud__emblem')!;
    this.hullFill = this.root.querySelector('.vf-phud__fill--hull')!;
    this.hullVal = this.root.querySelector('.vf-phud__val--hull')!;
    this.cargoFill = this.root.querySelector('.vf-phud__fill--cargo')!;
    this.cargoVal = this.root.querySelector('.vf-phud__val--cargo')!;
    this.cargoFullTag = this.root.querySelector('.vf-phud__full')!;
    this.creditsVal = this.root.querySelector('.vf-phud__val--credits')!;
  }

  // Per frame: pull the owned ship's live stats onto the gauges. No ship (dead /
  // pre-spawn) → leave the last reading in place rather than flicker to zero.
  update(): void {
    const id = this.localShipId();
    const ship =
      id == null ? undefined : (this.world.get(id) as Ship | undefined);
    if (!ship) {
      return;
    }

    const health = Math.max(0, Math.min(SHIP_MAX_HEALTH, ship.health));
    if (health !== this.lastHull) {
      this.lastHull = health;
      const frac = health / SHIP_MAX_HEALTH;
      this.hullFill.style.width = `${frac * 100}%`;
      this.hullVal.textContent = String(Math.round(health));
      const critical = frac <= HULL_CRITICAL_FRAC;
      if (critical !== this.lastCritical) {
        this.lastCritical = critical;
        this.hullFill.classList.toggle('vf-phud__fill--critical', critical);
        this.emblem.classList.toggle('vf-phud__emblem--critical', critical);
      }
    }

    const cargo = ship.cargo;
    const cap = ship.cargoCapacity;
    if (cargo !== this.lastCargo || cap !== this.lastCargoCap) {
      this.lastCargo = cargo;
      this.lastCargoCap = cap;
      const frac = cap > 0 ? Math.max(0, Math.min(1, cargo / cap)) : 0;
      this.cargoFill.style.width = `${frac * 100}%`;
      this.cargoVal.firstChild!.textContent = `${cargo}/${cap}`;
      const full = cap > 0 && cargo >= cap;
      this.cargoFill.classList.toggle('vf-phud__fill--full', full);
      this.cargoFullTag.style.display = full ? 'inline' : 'none';
    }

    if (ship.credits !== this.lastCredits) {
      this.lastCredits = ship.credits;
      this.creditsVal.textContent = ship.credits.toLocaleString('en-US');
    }
  }

  private static injectStyles(): void {
    if (document.getElementById('vf-phud-styles')) {
      return;
    }
    const style = document.createElement('style');
    style.id = 'vf-phud-styles';
    style.textContent = `
.vf-phud {
  --u: clamp(15px, 1.2vw, 23px);
  --cut: calc(var(--u) * 0.6);
  position: fixed; left: 50%; bottom: calc(var(--u) * 0.9); transform: translateX(-50%);
  z-index: 14000;
  display: flex; align-items: center; gap: calc(var(--u) * 0.85);
  padding: calc(var(--u) * 0.5) calc(var(--u) * 1.05) calc(var(--u) * 0.6);
  font-family: system-ui, 'Segoe UI', sans-serif;
  color: #cfd8e6; pointer-events: none; user-select: none;
  background: linear-gradient(180deg, rgba(12,18,30,0.66), rgba(8,12,20,0.54));
  backdrop-filter: blur(8px) saturate(1.1);
  border: 1px solid rgba(90,209,255,0.24);
  box-shadow: 0 calc(var(--u) * 0.3) calc(var(--u) * 1.1) rgba(0,0,0,0.55),
    inset 0 0 0 1px rgba(255,255,255,0.03);
  clip-path: polygon(var(--cut) 0, calc(100% - var(--cut)) 0, 100% var(--cut),
    100% 100%, 0 100%, 0 var(--cut));
}
.vf-phud::before {
  content: ''; position: absolute; left: var(--cut); right: var(--cut); top: 0;
  height: 2px; background: linear-gradient(90deg, transparent, ${SELF_CYAN}, transparent);
  box-shadow: 0 0 calc(var(--u) * 0.4) rgba(90,209,255,0.5);
}
.vf-phud__grp { display: flex; align-items: center; gap: calc(var(--u) * 0.55); }
.vf-phud__grp--credits { gap: calc(var(--u) * 0.3); }
.vf-phud__div {
  flex: none; width: 1px; height: calc(var(--u) * 1.75);
  background: linear-gradient(180deg, transparent, rgba(255,255,255,0.16), transparent);
}
.vf-phud__emblem {
  width: calc(var(--u) * 1.7); height: calc(var(--u) * 1.7);
  display: grid; place-items: center; flex: none;
  margin-right: calc(var(--u) * -0.1);
}
.vf-phud__emblem > span {
  width: calc(var(--u) * 1); height: calc(var(--u) * 1);
  border: 2px solid ${SELF_CYAN}; border-radius: calc(var(--u) * 0.14);
  transform: rotate(45deg); position: relative;
  box-shadow: 0 0 calc(var(--u) * 0.5) rgba(90,209,255,0.5),
    inset 0 0 calc(var(--u) * 0.28) rgba(90,209,255,0.28);
  transition: border-color 180ms, box-shadow 180ms;
}
.vf-phud__emblem > span::after {
  content: ''; position: absolute; inset: calc(var(--u) * 0.26); border-radius: 1px;
  background: ${SELF_CYAN}; box-shadow: 0 0 calc(var(--u) * 0.34) rgba(90,209,255,0.7);
  transition: background 180ms;
}
.vf-phud__emblem--critical > span {
  border-color: #ef5a50; box-shadow: 0 0 calc(var(--u) * 0.55) rgba(239,90,80,0.6);
}
.vf-phud__emblem--critical > span::after { background: #ef5a50; }
.vf-phud__label {
  font-size: calc(var(--u) * 0.5); font-weight: 600;
  letter-spacing: calc(var(--u) * 0.085); text-transform: uppercase; color: #8492ac;
}
.vf-phud__bar {
  position: relative; flex: none; border-radius: calc(var(--u) * 0.11); overflow: hidden;
  background: rgba(255,255,255,0.06); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.05);
}
.vf-phud__bar--hull { width: calc(var(--u) * 11); height: calc(var(--u) * 0.5); }
.vf-phud__bar--cargo { width: calc(var(--u) * 6.5); height: calc(var(--u) * 0.4); }
.vf-phud__fill {
  width: 0; height: 100%; border-radius: inherit;
  transition: width 180ms ease-out, background 220ms;
}
.vf-phud__fill--hull {
  background: linear-gradient(90deg, #2f96d6, ${SELF_CYAN});
  box-shadow: 0 0 calc(var(--u) * 0.4) rgba(90,209,255,0.55);
}
.vf-phud__fill--hull.vf-phud__fill--critical {
  background: linear-gradient(90deg, #b5322b, #ef5a50);
  box-shadow: 0 0 calc(var(--u) * 0.55) rgba(239,90,80,0.7);
  animation: vf-phud-pulse 1s ease-in-out infinite;
}
.vf-phud__fill--cargo { background: linear-gradient(90deg, #8a6b28, #d1a44c); }
.vf-phud__fill--cargo.vf-phud__fill--full {
  background: linear-gradient(90deg, #c9962f, #ffcf5e);
  box-shadow: 0 0 calc(var(--u) * 0.4) rgba(232,176,75,0.6);
}
.vf-phud__notches { position: absolute; inset: 0; pointer-events: none; }
.vf-phud__notches--10 {
  background: repeating-linear-gradient(to right,
    transparent 0 calc(10% - 1.5px), rgba(3,7,12,0.8) calc(10% - 1.5px) 10%);
}
.vf-phud__notches--20 {
  background: repeating-linear-gradient(to right,
    transparent 0 calc(20% - 1.5px), rgba(3,7,12,0.75) calc(20% - 1.5px) 20%);
}
.vf-phud__val {
  font-family: ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, monospace;
  font-size: calc(var(--u) * 0.66); font-weight: 600; font-variant-numeric: tabular-nums;
  color: #e6edf6; text-align: right; white-space: nowrap;
}
.vf-phud__val--hull { min-width: calc(var(--u) * 1.7); }
.vf-phud__full {
  display: none; margin-left: calc(var(--u) * 0.28);
  padding: calc(var(--u) * 0.04) calc(var(--u) * 0.24); border-radius: calc(var(--u) * 0.1);
  font-family: system-ui, sans-serif; font-size: calc(var(--u) * 0.42); font-weight: 700;
  letter-spacing: 0.8px; color: #1a1204; background: #ffcf5e; vertical-align: 12%;
}
.vf-phud__coin {
  color: #e8b04b; font-size: calc(var(--u) * 0.74);
  text-shadow: 0 0 calc(var(--u) * 0.34) rgba(232,176,75,0.5);
}
.vf-phud__val--credits { color: #e6edf6; }
.vf-phud__unit {
  font-size: calc(var(--u) * 0.46); font-weight: 600; letter-spacing: 1px;
  color: #6f7c93; text-transform: uppercase;
}
@keyframes vf-phud-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
@media (prefers-reduced-motion: reduce) {
  .vf-phud__fill { transition: none; }
  .vf-phud__fill--hull.vf-phud__fill--critical { animation: none; }
}`;
    document.head.appendChild(style);
  }
}
