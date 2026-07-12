import type { World } from '../../../shared/sim/world.ts';
import type { Ship } from '../../../shared/sim/entities/ship.ts';
import { Items } from '../../../shared/sim/mining.ts';
import { icon } from './shop-icons.ts';

// The two mountable slots, drawn left-to-right in the corner. Each maps to a
// mouse button, mirroring how the ship actually fires (LMB/RMB) rather than the
// number keys an Everspace-style rack would use.
const SLOTS = [
  { key: 'primary' as const, mouse: 'mouse-left' },
  { key: 'secondary' as const, mouse: 'mouse-right' },
];

// Item id → the weapon glyph to stamp in the slot. -1 (empty) maps to nothing.
const ITEM_ICON: Record<number, string> = {
  [Items.CANNONS]: 'cannons',
  [Items.MINING_LASER]: 'laser',
};

interface SlotWidgets {
  card: HTMLDivElement;
  glyph: HTMLDivElement;
  // Item id last painted into `glyph`, so update() only re-parses the SVG on a
  // change, and the firing state we last reflected.
  renderedItem: number;
  lastFiring: boolean;
}

// Bottom-left weapon rack: the primary and secondary slots as Everspace-style
// cards, each showing the mounted weapon's glyph, a mouse-button badge for its
// bind, and an accent bar that lights while that button is held. Reads the owned
// Ship's loadout (primaryItem/secondaryItem) and live firing flags each frame, so
// it needs no dedicated feed. Hidden until a ship exists (pre-spawn / dead).
export class WeaponSlotsHud {
  private readonly world: World;
  private readonly localShipId: () => number | null;

  private readonly root: HTMLDivElement;
  private readonly slots: SlotWidgets[] = [];
  private lastVisible = false;

  constructor(world: World, localShipId: () => number | null) {
    this.world = world;
    this.localShipId = localShipId;

    WeaponSlotsHud.injectStyles();

    this.root = document.createElement('div');
    this.root.className = 'vf-wslots';
    this.root.style.display = 'none';

    for (const slot of SLOTS) {
      const cell = document.createElement('div');
      cell.className = 'vf-wslots__cell';
      cell.innerHTML = `
        <div class="vf-wslots__card">
          <div class="vf-wslots__glyph"></div>
          <div class="vf-wslots__bar"></div>
        </div>
        <div class="vf-wslots__bind">${icon(slot.mouse, 22)}</div>`;
      this.root.appendChild(cell);
      this.slots.push({
        card: cell.querySelector('.vf-wslots__card')!,
        glyph: cell.querySelector('.vf-wslots__glyph')!,
        renderedItem: -2,
        lastFiring: false,
      });
    }

    document.body.appendChild(this.root);
  }

  // Per frame: no ship (pre-spawn / dead) hides the rack; otherwise paint each
  // slot's mounted weapon and light the bar of whichever button is held.
  update(): void {
    const id = this.localShipId();
    const ship =
      id == null ? undefined : (this.world.get(id) as Ship | undefined);
    const visible = !!ship && ship.alive !== false;
    if (visible !== this.lastVisible) {
      this.lastVisible = visible;
      this.root.style.display = visible ? 'flex' : 'none';
    }
    if (!ship) {
      return;
    }

    this.paint(0, ship.primaryItem, ship.firingPrimary);
    this.paint(1, ship.secondaryItem, ship.firingSecondary);
  }

  private paint(index: number, itemId: number, firing: boolean): void {
    const w = this.slots[index];

    if (itemId !== w.renderedItem) {
      w.renderedItem = itemId;
      const name = ITEM_ICON[itemId];
      w.glyph.innerHTML = name ? icon(name, 34) : '';
      w.card.classList.toggle('vf-wslots__card--empty', !name);
    }

    if (firing !== w.lastFiring) {
      w.lastFiring = firing;
      w.card.classList.toggle('vf-wslots__card--firing', firing);
    }
  }

  private static injectStyles(): void {
    if (document.getElementById('vf-wslots-styles')) {
      return;
    }
    const style = document.createElement('style');
    style.id = 'vf-wslots-styles';
    style.textContent = `
.vf-wslots {
  --u: clamp(14px, 1.05vw, 20px);
  --cyan: #5ad1ff;
  position: fixed; left: calc(var(--u) * 1); bottom: calc(var(--u) * 1.1);
  z-index: 14000;
  display: flex; align-items: flex-start; gap: calc(var(--u) * 0.55);
  pointer-events: none; user-select: none;
  filter: drop-shadow(0 calc(var(--u) * 0.15) calc(var(--u) * 0.5) rgba(0,0,0,0.6));
}
.vf-wslots__cell {
  display: flex; flex-direction: column; align-items: center;
  gap: calc(var(--u) * 0.32);
}
.vf-wslots__card {
  position: relative; overflow: hidden;
  width: calc(var(--u) * 3); height: calc(var(--u) * 3);
  display: grid; place-items: center;
  color: var(--cyan);
  border-radius: calc(var(--u) * 0.2);
  background: linear-gradient(155deg, rgba(28,40,58,0.92), rgba(10,14,22,0.92));
  border: 1px solid #3a4a6a;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.06),
    inset 0 0 calc(var(--u) * 0.4) rgba(90,209,255,0.08);
  /* Everspace-style clipped top-left corner. */
  clip-path: polygon(calc(var(--u) * 0.42) 0, 100% 0, 100% 100%, 0 100%,
    0 calc(var(--u) * 0.42));
  transition: border-color 140ms, box-shadow 140ms, transform 140ms;
}
.vf-wslots__card--empty {
  color: #3a4a6a;
  border-style: dashed;
  border-color: #2c3a54;
  background: linear-gradient(155deg, rgba(18,24,36,0.8), rgba(8,11,18,0.8));
}
.vf-wslots__card--firing {
  border-color: var(--cyan);
  box-shadow: 0 0 calc(var(--u) * 0.7) rgba(90,209,255,0.55),
    inset 0 0 calc(var(--u) * 0.5) rgba(90,209,255,0.25);
  transform: translateY(calc(var(--u) * -0.08));
}
.vf-wslots__glyph { display: grid; place-items: center; line-height: 0; }
.vf-wslots__bar {
  position: absolute; left: 0; right: 0; bottom: 0;
  height: calc(var(--u) * 0.2);
  background: linear-gradient(90deg, #2f96d6, var(--cyan));
  box-shadow: 0 0 calc(var(--u) * 0.4) rgba(90,209,255,0.5);
  transition: opacity 140ms, box-shadow 140ms;
}
.vf-wslots__card--empty .vf-wslots__bar { opacity: 0; }
.vf-wslots__card--firing .vf-wslots__bar {
  box-shadow: 0 0 calc(var(--u) * 0.6) rgba(90,209,255,0.9);
}
.vf-wslots__bind {
  color: #8492ac; line-height: 0;
}
@media (prefers-reduced-motion: reduce) {
  .vf-wslots__card { transition: none; }
}`;
    document.head.appendChild(style);
  }
}
