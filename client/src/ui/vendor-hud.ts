import type { World } from '../../../shared/sim/world.ts';
import type { Entity } from '../../../shared/sim/entity.ts';
import Types from '../../../shared/types.ts';
import { VENDOR_TRADE_RADIUS } from '../../../shared/sim/mining.ts';

// The vendor's docking prompt: a large, unmissable call-to-action shown near
// screen centre only when the player flies within trade range — a Kenney [F] key
// cap over "OPEN SHOP". Proximity is computed here and exposed via isInRange() so
// the ShopHud (which owns the F key and the modal) can gate opening and auto-close
// when the player leaves range.
export class VendorHud {
  private readonly world: World;
  private readonly localShipId: () => number | null;

  private readonly promptEl: HTMLDivElement;

  private vendorId: number | null = null;
  private inRange = false;

  constructor(world: World, localShipId: () => number | null) {
    this.world = world;
    this.localShipId = localShipId;

    this.injectStyles();

    this.promptEl = document.createElement('div');
    this.promptEl.className = 'vf-dock-prompt';
    const keyUrl = `${import.meta.env.BASE_URL}ui/keyboard_f.png`;
    this.promptEl.innerHTML = `
      <img class="vf-dock-key" src="${keyUrl}" alt="F" draggable="false" />
      <div class="vf-dock-label">OPEN SHOP</div>
    `;
    document.body.appendChild(this.promptEl);
  }

  // Per frame: recompute docking proximity and show/hide the trade prompt.
  update(): void {
    this.inRange = this.computeInRange();
    this.promptEl.style.display = this.inRange ? 'flex' : 'none';
  }

  isInRange(): boolean {
    return this.inRange;
  }

  private injectStyles(): void {
    if (document.getElementById('vf-dock-styles')) {
      return;
    }
    const style = document.createElement('style');
    style.id = 'vf-dock-styles';
    style.textContent = `
      .vf-dock-prompt {
        position: fixed;
        left: 50%;
        top: 30%;
        transform: translateX(-50%);
        z-index: 14000;
        display: none;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        padding: 18px 26px;
        border-radius: 12px;
        background: rgba(8,10,18,0.42);
        border: 1px solid rgba(209,164,76,0.35);
        box-shadow: 0 6px 30px rgba(0,0,0,0.5);
        pointer-events: none;
        user-select: none;
      }
      .vf-dock-key {
        width: 68px;
        height: 68px;
        image-rendering: auto;
        filter: drop-shadow(0 3px 6px rgba(0,0,0,0.7));
        animation: vf-dock-pulse 1.5s ease-in-out infinite;
      }
      .vf-dock-label {
        font: 700 20px/1 monospace;
        letter-spacing: 4px;
        color: #e8b04b;
        text-shadow: 0 2px 6px rgba(0,0,0,0.9);
      }
      @keyframes vf-dock-pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.09); }
      }
    `;
    document.head.appendChild(style);
  }

  private computeInRange(): boolean {
    const shipId = this.localShipId();
    if (shipId == null) {
      return false;
    }
    const ship = this.world.get(shipId);
    const vendor = this.findVendor();
    if (!ship || !vendor) {
      return false;
    }
    const d = ship.transform.position.distanceTo(vendor.transform.position);
    return d <= VENDOR_TRADE_RADIUS;
  }

  private findVendor(): Entity | undefined {
    if (this.vendorId != null) {
      const cached = this.world.get(this.vendorId);
      if (cached) {
        return cached;
      }
      this.vendorId = null;
    }
    for (const entity of this.world.entities.values()) {
      if (entity.type === Types.Entities.VENDOR) {
        this.vendorId = entity.id!;
        return entity;
      }
    }
    return undefined;
  }
}
