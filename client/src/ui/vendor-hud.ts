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

// Bottom-centre economy readout: cargo (with a FULL nudge), credits, and — when
// the player flies within docking range of the vendor — a Sell/Repair prompt.
// Sell/repair are one-shot key events (F/R) routed straight to the server, which
// validates range and funds; the resulting cargo/credits come back via Stats.
export class VendorHud {
  private readonly world: World;
  private readonly localShipId: () => number | null;
  private readonly net: TradeNet;

  private readonly panel: HTMLDivElement;
  private readonly cargoEl: HTMLDivElement;
  private readonly creditsEl: HTMLDivElement;
  private readonly promptEl: HTMLDivElement;

  private cargo = 0;
  private cargoCapacity = 0;
  private credits = 0;
  private vendorId: number | null = null;
  private inRange = false;

  constructor(world: World, localShipId: () => number | null, net: TradeNet) {
    this.world = world;
    this.localShipId = localShipId;
    this.net = net;

    this.panel = document.createElement('div');
    Object.assign(this.panel.style, {
      position: 'fixed',
      left: '50%',
      bottom: '18px',
      transform: 'translateX(-50%)',
      zIndex: '14000',
      font: '13px monospace',
      color: '#cfd8e6',
      textAlign: 'center',
      textShadow: '0 1px 3px rgba(0,0,0,0.9)',
      pointerEvents: 'none',
      userSelect: 'none',
    });

    const stats = document.createElement('div');
    Object.assign(stats.style, {
      display: 'flex',
      gap: '18px',
      justifyContent: 'center',
    });
    this.cargoEl = document.createElement('div');
    this.creditsEl = document.createElement('div');
    stats.appendChild(this.cargoEl);
    stats.appendChild(this.creditsEl);
    this.panel.appendChild(stats);

    this.promptEl = document.createElement('div');
    Object.assign(this.promptEl.style, {
      marginTop: '6px',
      color: '#d1a44c', // vendor gold, matching the HUD reticle
      fontSize: '12px',
      visibility: 'hidden',
    });
    this.panel.appendChild(this.promptEl);

    document.body.appendChild(this.panel);
    this.refreshStats();
    this.bindKeys();
  }

  // Owner-only cargo/credits from a Stats message.
  setStats(cargo: number, cargoCapacity: number, credits: number): void {
    this.cargo = cargo;
    this.cargoCapacity = cargoCapacity;
    this.credits = credits;
    this.refreshStats();
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

  private refreshStats(): void {
    const full = this.cargoCapacity > 0 && this.cargo >= this.cargoCapacity;
    this.cargoEl.textContent = `CARGO ${this.cargo}/${this.cargoCapacity}${
      full ? '  FULL' : ''
    }`;
    this.cargoEl.style.color = full ? '#e8b04b' : '#cfd8e6';
    this.creditsEl.textContent = `CREDITS ${this.credits}`;
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
