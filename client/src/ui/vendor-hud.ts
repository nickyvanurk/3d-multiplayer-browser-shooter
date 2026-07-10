import type { World } from '../../../shared/sim/world.ts';
import type { Entity } from '../../../shared/sim/entity.ts';
import Types from '../../../shared/types.ts';
import {
  VENDOR_TRADE_RADIUS,
  ORE_SELL_PRICE,
  REPAIR_COST,
} from '../../../shared/sim/mining.ts';

interface TradeNet {
  sendSell(): void;
  sendRepair(): void;
}

// The vendor's docking prompt: shown bottom-centre only when the player flies
// within trade range, offering Sell/Repair. Sell/repair are one-shot key events
// (F/R) routed straight to the server, which validates range and funds; the
// player's own cargo/credits are shown by PlayerHud (bottom-centre), not here.
export class VendorHud {
  private readonly world: World;
  private readonly localShipId: () => number | null;
  private readonly net: TradeNet;

  private readonly promptEl: HTMLDivElement;

  private credits = 0;
  private vendorId: number | null = null;
  private inRange = false;

  constructor(world: World, localShipId: () => number | null, net: TradeNet) {
    this.world = world;
    this.localShipId = localShipId;
    this.net = net;

    this.promptEl = document.createElement('div');
    Object.assign(this.promptEl.style, {
      position: 'fixed',
      left: '50%',
      bottom: '84px', // clears the player status panel below it
      transform: 'translateX(-50%)',
      zIndex: '14000',
      font: '13px monospace',
      color: '#d1a44c', // vendor gold, matching the HUD reticle
      textShadow: '0 1px 3px rgba(0,0,0,0.9)',
      textAlign: 'center',
      pointerEvents: 'none',
      userSelect: 'none',
      visibility: 'hidden',
    });
    document.body.appendChild(this.promptEl);
    this.bindKeys();
  }

  // Owner-only credits from a Stats message — kept only to gate the repair prompt.
  setStats(_cargo: number, _cargoCapacity: number, credits: number): void {
    this.credits = credits;
  }

  // Per frame: recompute docking proximity and show/hide the trade prompt.
  update(): void {
    this.inRange = this.computeInRange();
    this.promptEl.style.visibility = this.inRange ? 'visible' : 'hidden';
    if (this.inRange) {
      const canRepair = this.credits >= REPAIR_COST;
      this.promptEl.innerHTML =
        `[F] Sell (${ORE_SELL_PRICE}/ore) &nbsp;·&nbsp; ` +
        `[R] Repair (${REPAIR_COST} cr)${canRepair ? '' : ' — not enough'}`;
    }
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

  private bindKeys(): void {
    window.addEventListener('keydown', (e) => {
      if (e.repeat || !this.inRange) {
        return;
      }
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT')
      ) {
        return;
      }
      if (e.code === 'KeyF') {
        e.preventDefault();
        this.net.sendSell();
      } else if (e.code === 'KeyR') {
        e.preventDefault();
        this.net.sendRepair();
      }
    });
  }
}
