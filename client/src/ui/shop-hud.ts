import type { World } from '../../../shared/sim/world.ts';
import type { Ship } from '../../../shared/sim/entities/ship.ts';
import type { InputController } from '../input/input-controller.ts';
import type { Keybindings } from '../input/keybindings.ts';
import {
  ORE_SELL_PRICE,
  REPAIR_COST,
  MINING_LASER_PRICE,
  Items,
  Slots,
} from '../../../shared/sim/mining.ts';
import { SHIP_MAX_HEALTH } from '../../../shared/sim/trade.ts';
import { icon } from './shop-icons.ts';

export interface ShopNet {
  sendSell(): void;
  sendRepair(): void;
  sendBuy(itemId: number): void;
  sendEquip(slot: number, itemId: number): void;
}

const GOLD = '#d1a44c';
const CYAN = '#5ad1ff';
const TEXT = '#cfd8e6';
const MUTED = '#6b7a94';
const PANEL_BG = 'rgba(10,12,20,0.96)';
const BORDER = '#3a4a6a';

// A weapon the shop can show and equip. Slot-agnostic: any owned weapon can go in
// either slot (cannons are free on every ship; the laser is bought).
interface ShopItem {
  id: number;
  name: string;
  icon: 'cannons' | 'laser';
  owned: (ship: Ship) => boolean;
}

const WEAPONS: ShopItem[] = [
  {
    id: Items.CANNONS,
    name: 'Dual Cannons',
    icon: 'cannons',
    owned: () => true,
  },
  {
    id: Items.MINING_LASER,
    name: 'Mining Laser',
    icon: 'laser',
    owned: (s) => s.hasMiningLaser,
  },
];

const SLOT_LABELS: Record<number, string> = {
  [Slots.PRIMARY]: 'PRIMARY · LMB',
  [Slots.SECONDARY]: 'SECONDARY · RMB',
};

interface HoldCard {
  root: HTMLDivElement;
  note: HTMLSpanElement;
  primaryBtn: HTMLButtonElement;
  secondaryBtn: HTMLButtonElement;
}

interface SlotWidgets {
  box: HTMLDivElement;
  chip: HTMLDivElement;
  empty: HTMLSpanElement;
  button: HTMLButtonElement;
  // Item id last painted into `chip`, so render() only rebuilds its SVG on change.
  renderedItem: number;
}

interface Drag {
  item: ShopItem;
  origin: 'hold' | number; // 'hold', or the slot index it was dragged out of
  ghost: HTMLDivElement;
}

// The vendor shop: a full-screen modal opened with F while docked. Shows the
// player's hold and the vendor's wares, and routes sell/repair/buy/equip to the
// server (which validates range + funds). Any owned weapon can be placed in the
// primary or secondary slot by drag-and-drop or the per-slot buttons. All values
// read live off the owned Ship each frame (Stats/Loadout).
export class ShopHud {
  private readonly world: World;
  private readonly localShipId: () => number | null;
  private readonly inputController: InputController;
  private readonly isInRange: () => boolean;
  private readonly net: ShopNet;
  private readonly keybindings: Keybindings;
  private readonly crosshair: HTMLElement | null;

  private readonly backdrop: HTMLDivElement;
  private visible = false;

  // Assigned in buildTitleBar (called from the constructor), hence not readonly.
  private creditsEl!: HTMLSpanElement;
  private readonly cargoEl: HTMLSpanElement;
  private readonly sellBtn: HTMLButtonElement;
  private readonly repairBtn: HTMLButtonElement;
  private readonly buyLaserBtn: HTMLButtonElement;
  private readonly holdCards = new Map<number, HoldCard>();
  private readonly slots = new Map<number, SlotWidgets>();

  private drag: Drag | null = null;

  constructor(
    world: World,
    localShipId: () => number | null,
    inputController: InputController,
    isInRange: () => boolean,
    net: ShopNet,
    keybindings: Keybindings,
  ) {
    this.world = world;
    this.localShipId = localShipId;
    this.inputController = inputController;
    this.isInRange = isInRange;
    this.net = net;
    this.keybindings = keybindings;
    this.crosshair = document.querySelector<HTMLElement>('.crosshair');

    this.backdrop = document.createElement('div');
    Object.assign(this.backdrop.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '20000',
      display: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(4,6,12,0.6)',
      backdropFilter: 'blur(2px)',
      font: '13px monospace',
      color: TEXT,
    });
    this.backdrop.addEventListener('click', (e) => {
      if (e.target === this.backdrop) {
        this.close();
      }
    });

    const panel = document.createElement('div');
    Object.assign(panel.style, {
      position: 'relative',
      background: PANEL_BG,
      border: `1px solid ${BORDER}`,
      borderRadius: '8px',
      padding: '20px 24px',
      width: '720px',
      maxWidth: '94vw',
      boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
      userSelect: 'none',
    });
    this.backdrop.appendChild(panel);

    panel.appendChild(this.buildCloseButton());
    panel.appendChild(this.buildTitleBar());

    // Two columns: your hold (left) and the vendor's wares (right).
    const columns = document.createElement('div');
    Object.assign(columns.style, { display: 'flex', gap: '20px' });
    panel.appendChild(columns);

    // --- Left column: your hold ---
    const hold = this.column('YOUR HOLD');
    columns.appendChild(hold.wrap);

    this.cargoEl = document.createElement('span');
    const cargoRow = document.createElement('div');
    Object.assign(cargoRow.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      marginBottom: '10px',
      color: TEXT,
    });
    cargoRow.innerHTML = icon('ore', 18);
    cargoRow.appendChild(this.cargoEl);
    hold.body.appendChild(cargoRow);

    this.sellBtn = this.button(
      'Sell all ore',
      () => this.net.sendSell(),
      'ore',
    );
    this.sellBtn.style.marginBottom = '14px';
    hold.body.appendChild(this.sellBtn);

    for (const item of WEAPONS) {
      const card = this.buildHoldCard(item);
      hold.body.appendChild(card.root);
      this.holdCards.set(item.id, card);
    }

    // --- Right column: wares ---
    const wares = this.column('WARES');
    columns.appendChild(wares.wrap);

    this.repairBtn = this.button(
      `Repair hull — ${REPAIR_COST} cr`,
      () => this.net.sendRepair(),
      'repair',
    );
    this.repairBtn.style.marginBottom = '12px';
    wares.body.appendChild(this.repairBtn);

    this.buyLaserBtn = this.button(
      `Buy Mining Laser — ${MINING_LASER_PRICE} cr`,
      () => this.net.sendBuy(Items.MINING_LASER),
      'laser',
    );
    wares.body.appendChild(this.buyLaserBtn);

    // --- Loadout bar: two slots, each a drop target for any owned weapon ---
    const loadout = document.createElement('div');
    Object.assign(loadout.style, {
      display: 'flex',
      gap: '14px',
      marginTop: '18px',
      paddingTop: '16px',
      borderTop: `1px solid ${BORDER}`,
    });
    panel.appendChild(loadout);
    loadout.appendChild(this.buildSlot(Slots.PRIMARY));
    loadout.appendChild(this.buildSlot(Slots.SECONDARY));

    const hint = document.createElement('div');
    hint.textContent =
      'Drag any weapon onto either slot to equip · [F] or [✕] to close';
    Object.assign(hint.style, {
      marginTop: '16px',
      textAlign: 'right',
      fontSize: '11px',
      color: MUTED,
    });
    panel.appendChild(hint);

    document.body.appendChild(this.backdrop);
    this.bindKeys();
  }

  update(): void {
    if (!this.visible) {
      return;
    }
    const ship = this.ship();
    if (!ship || ship.alive === false || !this.isInRange()) {
      this.close();
      return;
    }
    this.render(ship);
  }

  isOpen(): boolean {
    return this.visible;
  }

  toggle(): void {
    if (this.visible) {
      this.close();
    } else if (this.isInRange()) {
      this.open();
    }
  }

  private ship(): Ship | undefined {
    const id = this.localShipId();
    if (id == null) {
      return undefined;
    }
    return this.world.get(id) as Ship | undefined;
  }

  private slotItem(ship: Ship, slot: number): number {
    return slot === Slots.PRIMARY ? ship.primaryItem : ship.secondaryItem;
  }

  private render(ship: Ship): void {
    this.creditsEl.textContent = `${ship.credits} cr`;
    this.cargoEl.textContent = `Ore: ${ship.cargo} / ${ship.cargoCapacity}`;

    const saleValue = ship.cargo * ORE_SELL_PRICE;
    this.setLabel(
      this.sellBtn,
      ship.cargo > 0
        ? `Sell all ore (${ship.cargo} × ${ORE_SELL_PRICE} = ${saleValue} cr)`
        : 'Sell all ore',
    );
    this.setEnabled(this.sellBtn, ship.cargo > 0);

    this.setEnabled(
      this.repairBtn,
      ship.health < SHIP_MAX_HEALTH && ship.credits >= REPAIR_COST,
    );

    if (ship.hasMiningLaser) {
      this.setLabel(this.buyLaserBtn, 'Mining Laser — Owned');
      this.setEnabled(this.buyLaserBtn, false);
    } else {
      this.setLabel(
        this.buyLaserBtn,
        `Buy Mining Laser — ${MINING_LASER_PRICE} cr`,
      );
      this.setEnabled(this.buyLaserBtn, ship.credits >= MINING_LASER_PRICE);
    }

    for (const item of WEAPONS) {
      this.renderHoldCard(item, ship);
    }
    this.renderSlot(Slots.PRIMARY, ship);
    this.renderSlot(Slots.SECONDARY, ship);
  }

  private itemById(id: number): ShopItem | undefined {
    return WEAPONS.find((w) => w.id === id);
  }

  private whereEquipped(item: ShopItem, ship: Ship): number | null {
    if (ship.primaryItem === item.id) {
      return Slots.PRIMARY;
    }
    if (ship.secondaryItem === item.id) {
      return Slots.SECONDARY;
    }
    return null;
  }

  private renderHoldCard(item: ShopItem, ship: Ship): void {
    const card = this.holdCards.get(item.id)!;
    const owned = item.owned(ship);
    card.root.style.display = owned ? 'flex' : 'none';
    if (!owned) {
      return;
    }
    const at = this.whereEquipped(item, ship);
    card.note.textContent =
      at === null ? 'in hold — drag to a slot' : `in ${SLOT_LABELS[at]}`;
    card.root.style.cursor = 'grab';
    // Per-slot equip buttons: disabled for the slot the weapon already sits in.
    this.setEnabled(card.primaryBtn, at !== Slots.PRIMARY);
    this.setEnabled(card.secondaryBtn, at !== Slots.SECONDARY);
  }

  private renderSlot(slot: number, ship: Ship): void {
    const w = this.slots.get(slot)!;
    const itemId = this.slotItem(ship, slot);
    const item = this.itemById(itemId);

    // The chip's SVG is expensive to re-parse; rebuild it only when the slot's
    // item actually changes, not every frame.
    if (itemId !== w.renderedItem) {
      w.renderedItem = itemId;
      if (item) {
        w.chip.innerHTML = `${icon(item.icon, 22)}<span>${item.name}</span>`;
      }
    }

    if (item) {
      w.box.style.borderColor = CYAN;
      w.chip.style.display = 'inline-flex';
      w.empty.style.display = 'none';
      w.button.style.display = 'inline-block';
      this.setLabel(w.button, 'Unequip');
      this.setEnabled(w.button, true);
    } else {
      w.box.style.borderColor = BORDER;
      w.chip.style.display = 'none';
      w.empty.style.display = 'inline';
      w.button.style.display = 'none';
    }
  }

  // --- Drag-and-drop equip/unequip ---

  private startDrag(
    e: PointerEvent,
    item: ShopItem,
    origin: 'hold' | number,
  ): void {
    const ship = this.ship();
    if (!ship || !item.owned(ship)) {
      return;
    }
    e.preventDefault();

    const ghost = this.chip(item);
    Object.assign(ghost.style, {
      position: 'fixed',
      zIndex: '20001',
      pointerEvents: 'none',
      opacity: '0.92',
      background: PANEL_BG,
    });
    document.body.appendChild(ghost);
    this.drag = { item, origin, ghost };
    this.moveGhost(e.clientX, e.clientY);

    window.addEventListener('pointermove', this.onDragMove);
    window.addEventListener('pointerup', this.onDragEnd);
  }

  private readonly onDragMove = (e: PointerEvent): void => {
    this.moveGhost(e.clientX, e.clientY);
  };

  private readonly onDragEnd = (e: PointerEvent): void => {
    const drag = this.drag;
    if (!drag) {
      return;
    }
    drag.ghost.remove();
    window.removeEventListener('pointermove', this.onDragMove);
    window.removeEventListener('pointerup', this.onDragEnd);
    this.drag = null;

    const dropSlot = this.slotAtPoint(e.clientX, e.clientY);
    if (dropSlot !== null) {
      // Dropped on a slot → equip there (the server moves it out of any other
      // slot). A drop on the slot it already occupies is a harmless no-op.
      this.net.sendEquip(dropSlot, drag.item.id);
    } else if (drag.origin !== 'hold') {
      // Dragged out of a slot onto empty space → unequip.
      this.net.sendEquip(drag.origin, -1);
    }
  };

  private slotAtPoint(x: number, y: number): number | null {
    for (const [slot, w] of this.slots) {
      if (this.pointInRect(x, y, w.box.getBoundingClientRect())) {
        return slot;
      }
    }
    return null;
  }

  private moveGhost(x: number, y: number): void {
    if (!this.drag) {
      return;
    }
    this.drag.ghost.style.left = `${x + 12}px`;
    this.drag.ghost.style.top = `${y + 12}px`;
  }

  private pointInRect(x: number, y: number, r: DOMRect): boolean {
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  // --- open/close (mirrors the settings-menu recipe) ---

  private open(): void {
    this.visible = true;
    this.backdrop.style.display = 'flex';
    this.inputController.setEnabled(false);
    document.body.style.cursor = 'auto';
    if (this.crosshair) {
      this.crosshair.style.display = 'none';
    }
    const ship = this.ship();
    if (ship) {
      this.render(ship);
    }
  }

  private close(): void {
    this.visible = false;
    this.backdrop.style.display = 'none';
    this.inputController.setEnabled(true);
    document.body.style.cursor = '';
    if (this.crosshair) {
      this.crosshair.style.display = '';
    }
    if (this.drag) {
      this.drag.ghost.remove();
      window.removeEventListener('pointermove', this.onDragMove);
      window.removeEventListener('pointerup', this.onDragEnd);
      this.drag = null;
    }
  }

  private bindKeys(): void {
    window.addEventListener('keydown', (e) => {
      if (e.repeat || e.code !== this.keybindings.shopToggle) {
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
      if (this.visible || this.isInRange()) {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  // --- DOM builders ---

  private buildCloseButton(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.setAttribute('aria-label', 'Close');
    btn.innerHTML = icon('close', 16);
    Object.assign(btn.style, {
      position: 'absolute',
      top: '12px',
      right: '12px',
      width: '28px',
      height: '28px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: MUTED,
      background: 'transparent',
      border: `1px solid ${BORDER}`,
      borderRadius: '6px',
      cursor: 'pointer',
      padding: '0',
    });
    btn.addEventListener('mouseenter', () => {
      btn.style.color = TEXT;
      btn.style.borderColor = CYAN;
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.color = MUTED;
      btn.style.borderColor = BORDER;
    });
    btn.addEventListener('click', () => this.close());
    return btn;
  }

  private buildTitleBar(): HTMLDivElement {
    const bar = document.createElement('div');
    Object.assign(bar.style, {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderBottom: `1px solid ${BORDER}`,
      paddingBottom: '12px',
      marginBottom: '16px',
      paddingRight: '34px',
    });
    const title = document.createElement('div');
    title.textContent = 'VENDOR · FLYING DUTCHMAN';
    Object.assign(title.style, {
      fontWeight: 'bold',
      fontSize: '15px',
      color: GOLD,
      letterSpacing: '2px',
    });
    const credits = document.createElement('div');
    Object.assign(credits.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      color: CYAN,
      fontSize: '14px',
    });
    credits.innerHTML = icon('credits', 18);
    this.creditsEl = document.createElement('span');
    credits.appendChild(this.creditsEl);
    bar.appendChild(title);
    bar.appendChild(credits);
    return bar;
  }

  private column(heading: string): {
    wrap: HTMLDivElement;
    body: HTMLDivElement;
  } {
    const wrap = document.createElement('div');
    Object.assign(wrap.style, { flex: '1', minWidth: '0' });
    const head = document.createElement('div');
    head.textContent = heading;
    Object.assign(head.style, {
      color: MUTED,
      letterSpacing: '1px',
      fontSize: '11px',
      marginBottom: '10px',
    });
    const body = document.createElement('div');
    wrap.appendChild(head);
    wrap.appendChild(body);
    return { wrap, body };
  }

  private buildHoldCard(item: ShopItem): HoldCard {
    const root = document.createElement('div');
    Object.assign(root.style, {
      display: 'none',
      alignItems: 'center',
      gap: '10px',
      border: `1px solid ${BORDER}`,
      borderRadius: '6px',
      padding: '10px 12px',
      marginBottom: '8px',
      cursor: 'grab',
      background: 'rgba(90,209,255,0.05)',
    });
    root.addEventListener('pointerdown', (e) => {
      // Ignore drags that start on the equip buttons.
      if ((e.target as HTMLElement).closest('button')) {
        return;
      }
      this.startDrag(e, item, 'hold');
    });

    const iconEl = document.createElement('span');
    iconEl.innerHTML = icon(item.icon, 28);
    Object.assign(iconEl.style, { color: CYAN, flex: '0 0 auto' });

    const textWrap = document.createElement('div');
    Object.assign(textWrap.style, { flex: '1', minWidth: '0' });
    const name = document.createElement('div');
    name.textContent = item.name;
    name.style.color = CYAN;
    const note = document.createElement('span');
    Object.assign(note.style, {
      fontSize: '11px',
      color: MUTED,
    });
    textWrap.appendChild(name);
    textWrap.appendChild(note);

    const btns = document.createElement('div');
    Object.assign(btns.style, {
      display: 'flex',
      gap: '6px',
      flex: '0 0 auto',
    });
    const primaryBtn = this.miniButton('Primary', () =>
      this.net.sendEquip(Slots.PRIMARY, item.id),
    );
    const secondaryBtn = this.miniButton('Secondary', () =>
      this.net.sendEquip(Slots.SECONDARY, item.id),
    );
    btns.appendChild(primaryBtn);
    btns.appendChild(secondaryBtn);

    root.appendChild(iconEl);
    root.appendChild(textWrap);
    root.appendChild(btns);
    return { root, note, primaryBtn, secondaryBtn };
  }

  private buildSlot(slot: number): HTMLDivElement {
    const wrap = document.createElement('div');
    Object.assign(wrap.style, { flex: '1' });
    const head = document.createElement('div');
    head.textContent = SLOT_LABELS[slot];
    Object.assign(head.style, {
      color: MUTED,
      letterSpacing: '1px',
      fontSize: '11px',
      marginBottom: '8px',
    });
    const box = document.createElement('div');
    Object.assign(box.style, {
      border: `1px dashed ${BORDER}`,
      borderRadius: '6px',
      padding: '12px',
      minHeight: '78px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '10px',
    });

    const chip = document.createElement('div');
    Object.assign(chip.style, {
      display: 'none',
      alignItems: 'center',
      gap: '8px',
      border: `1px solid ${BORDER}`,
      borderRadius: '4px',
      padding: '6px 12px',
      color: CYAN,
      background: 'rgba(90,209,255,0.06)',
      cursor: 'grab',
    });
    chip.addEventListener('pointerdown', (e) => {
      const ship = this.ship();
      if (!ship) {
        return;
      }
      const item = this.itemById(this.slotItem(ship, slot));
      if (item) {
        this.startDrag(e, item, slot);
      }
    });

    const empty = document.createElement('span');
    empty.textContent = 'empty';
    empty.style.color = MUTED;

    const button = this.button('Unequip', () => this.net.sendEquip(slot, -1));
    button.style.width = 'auto';

    box.appendChild(chip);
    box.appendChild(empty);
    box.appendChild(button);
    wrap.appendChild(head);
    wrap.appendChild(box);

    this.slots.set(slot, { box, chip, empty, button, renderedItem: -1 });
    return wrap;
  }

  // A compact weapon chip (icon + name), used as the drag ghost.
  private chip(item: ShopItem): HTMLDivElement {
    const chip = document.createElement('div');
    Object.assign(chip.style, {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      border: `1px solid ${BORDER}`,
      borderRadius: '4px',
      padding: '6px 12px',
      color: CYAN,
    });
    chip.innerHTML = `${icon(item.icon, 22)}<span>${item.name}</span>`;
    return chip;
  }

  private button(
    label: string,
    onClick: () => void,
    iconName?: string,
  ): HTMLButtonElement {
    const btn = document.createElement('button');
    Object.assign(btn.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      width: '100%',
      font: '13px monospace',
      color: TEXT,
      background: 'transparent',
      border: `1px solid ${BORDER}`,
      borderRadius: '4px',
      padding: '8px 10px',
      cursor: 'pointer',
    });
    if (iconName) {
      const ic = document.createElement('span');
      ic.innerHTML = icon(iconName, 18);
      Object.assign(ic.style, {
        display: 'flex',
        flex: '0 0 auto',
        color: MUTED,
      });
      btn.appendChild(ic);
    }
    const text = document.createElement('span');
    text.setAttribute('data-label', '');
    text.textContent = label;
    btn.appendChild(text);
    this.hoverable(btn);
    btn.addEventListener('click', onClick);
    return btn;
  }

  private miniButton(label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    Object.assign(btn.style, {
      font: '11px monospace',
      color: TEXT,
      background: 'transparent',
      border: `1px solid ${BORDER}`,
      borderRadius: '4px',
      padding: '5px 8px',
      cursor: 'pointer',
      whiteSpace: 'nowrap',
    });
    this.hoverable(btn);
    btn.addEventListener('click', onClick);
    return btn;
  }

  private hoverable(btn: HTMLButtonElement): void {
    btn.addEventListener('mouseenter', () => {
      if (!btn.disabled) {
        btn.style.borderColor = CYAN;
      }
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.borderColor = BORDER;
    });
  }

  private setLabel(btn: HTMLButtonElement, label: string): void {
    const el = btn.querySelector('[data-label]') ?? btn;
    el.textContent = label;
  }

  private setEnabled(btn: HTMLButtonElement, enabled: boolean): void {
    btn.disabled = !enabled;
    btn.style.opacity = enabled ? '1' : '0.4';
    btn.style.cursor = enabled ? 'pointer' : 'not-allowed';
  }
}
