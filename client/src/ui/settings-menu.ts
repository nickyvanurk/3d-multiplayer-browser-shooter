import type { SceneManager } from '../render/scene-manager.ts';
import type { InputController } from '../input/input-controller.ts';
import {
  CAMERA_STIFFNESS_LIMITS,
  FOV_LIMITS,
  type SettingsStore,
} from '../settings.ts';
import {
  KEYBINDING_LAYOUT,
  type KeybindingAction,
  type KeybindingDescriptor,
} from '../input/keybindings.ts';

const ACCENT = '#8fd0ff';
const LABEL = '#9fb0c8';
const MUTED = '#6b7a94';
const BORDER = '#3a4a6a';

// Friendly names for the more cryptic KeyboardEvent.code values; anything not
// listed falls through the prefix rules in keyLabel().
const KEY_LABELS: Record<string, string> = {
  Space: 'Space',
  Escape: 'Esc',
  Enter: 'Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ShiftLeft: 'L-Shift',
  ShiftRight: 'R-Shift',
  ControlLeft: 'L-Ctrl',
  ControlRight: 'R-Ctrl',
  AltLeft: 'L-Alt',
  AltRight: 'R-Alt',
  Backquote: '`',
};

function keyLabel(code: string | null): string {
  if (code === null) {
    return 'Unbound';
  }
  if (code in KEY_LABELS) {
    return KEY_LABELS[code];
  }
  if (code.startsWith('Key')) {
    return code.slice(3);
  }
  if (code.startsWith('Digit')) {
    return code.slice(5);
  }
  if (code.startsWith('Numpad')) {
    return `Num ${code.slice(6)}`;
  }
  return code;
}

function buttonLabel(button: number | null): string {
  switch (button) {
    case null:
      return 'Unbound';
    case 0:
      return 'Left Mouse';
    case 1:
      return 'Middle Mouse';
    case 2:
      return 'Right Mouse';
    default:
      return `Mouse ${button}`;
  }
}

// A simple in-game settings overlay, toggled with Escape. Sliders apply live and
// persist to localStorage. While open it disables game input so slider tweaks
// don't steer or fire the ship. A "Controls" view swaps the panel contents to a
// keybinding editor.
export class SettingsMenu {
  private readonly settings: SettingsStore;
  private readonly sceneManager: SceneManager;
  private readonly inputController: InputController;
  private readonly backdrop: HTMLDivElement;
  private readonly mainView: HTMLDivElement;
  private readonly controlsView: HTMLDivElement;
  private readonly crosshair: HTMLElement | null;
  // Per-action "current binding" buttons, so a rebind (which may unbind another
  // action) can refresh every row's label at once.
  private readonly rowButtons = new Map<KeybindingAction, HTMLButtonElement>();
  private readonly warning: HTMLDivElement;
  private visible = false;
  // Teardown for an in-progress key/button capture (null when not capturing).
  private captureCleanup: (() => void) | null = null;

  constructor(
    settings: SettingsStore,
    sceneManager: SceneManager,
    inputController: InputController,
  ) {
    this.settings = settings;
    this.sceneManager = sceneManager;
    this.inputController = inputController;
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
    });
    // Clicking the dimmed backdrop (outside the panel) closes the menu.
    this.backdrop.addEventListener('click', (e) => {
      if (e.target === this.backdrop) {
        this.close();
      }
    });

    const panel = document.createElement('div');
    Object.assign(panel.style, {
      font: '13px monospace',
      color: '#cfd8e6',
      background: 'rgba(10,12,20,0.96)',
      border: `1px solid ${BORDER}`,
      borderRadius: '8px',
      padding: '20px 24px',
      minWidth: '340px',
      boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
      userSelect: 'none',
    });
    this.backdrop.appendChild(panel);

    this.warning = document.createElement('div');
    Object.assign(this.warning.style, {
      minHeight: '16px',
      marginTop: '12px',
      fontSize: '11px',
      color: '#e2b04a',
    });

    this.mainView = this.buildMainView();
    this.controlsView = this.buildControlsView();
    panel.appendChild(this.mainView);
    panel.appendChild(this.controlsView);

    document.body.appendChild(this.backdrop);

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  private buildMainView(): HTMLDivElement {
    const view = document.createElement('div');

    const title = document.createElement('div');
    title.textContent = 'SETTINGS';
    Object.assign(title.style, {
      fontWeight: 'bold',
      fontSize: '15px',
      color: ACCENT,
      letterSpacing: '2px',
      marginBottom: '18px',
    });
    view.appendChild(title);

    view.appendChild(
      this.buildSliderRow({
        label: 'Field of view (horizontal)',
        min: FOV_LIMITS.min,
        max: FOV_LIMITS.max,
        step: 1,
        format: (v) => `${v}°`,
        get: () => this.settings.horizontalFov,
        set: (v) => {
          this.sceneManager.setHorizontalFov(v);
          this.settings.horizontalFov = v;
        },
      }),
    );
    view.appendChild(
      this.buildSliderRow({
        label: 'Camera stiffness',
        min: CAMERA_STIFFNESS_LIMITS.min,
        max: CAMERA_STIFFNESS_LIMITS.max,
        step: 1,
        format: (v) => (v / 10).toFixed(1),
        get: () => this.settings.cameraStiffness,
        // Read live by the chase camera each frame; just persist it.
        set: (v) => {
          this.settings.cameraStiffness = v;
        },
      }),
    );

    const controlsBtn = this.buildButton('Controls…', () =>
      this.showControls(),
    );
    controlsBtn.style.width = '100%';
    controlsBtn.style.marginTop = '6px';
    view.appendChild(controlsBtn);

    const hint = document.createElement('div');
    hint.textContent = 'Esc to close';
    Object.assign(hint.style, {
      marginTop: '18px',
      textAlign: 'right',
      fontSize: '11px',
      color: MUTED,
    });
    view.appendChild(hint);

    return view;
  }

  private buildControlsView(): HTMLDivElement {
    const view = document.createElement('div');
    view.style.display = 'none';

    const title = document.createElement('div');
    title.textContent = 'CONTROLS';
    Object.assign(title.style, {
      fontWeight: 'bold',
      fontSize: '15px',
      color: ACCENT,
      letterSpacing: '2px',
      marginBottom: '16px',
    });
    view.appendChild(title);

    const list = document.createElement('div');
    Object.assign(list.style, {
      maxHeight: '58vh',
      overflowY: 'auto',
      paddingRight: '6px',
    });

    let currentGroup = '';
    for (const desc of KEYBINDING_LAYOUT) {
      if (desc.group !== currentGroup) {
        currentGroup = desc.group;
        list.appendChild(this.buildGroupHeader(desc.group));
      }
      list.appendChild(this.buildRebindRow(desc));
    }
    // Escape stays fixed as the menu / cancel key, shown but not editable.
    list.appendChild(this.buildGroupHeader('System'));
    list.appendChild(this.buildFixedRow('Menu / Cancel', 'Esc'));

    view.appendChild(list);
    view.appendChild(this.warning);

    const buttonRow = document.createElement('div');
    Object.assign(buttonRow.style, {
      display: 'flex',
      gap: '8px',
      marginTop: '4px',
    });
    const resetBtn = this.buildButton('Reset to defaults', () => {
      this.cancelCapture();
      this.settings.resetKeybindings();
      this.refreshRows();
      this.setWarning('Restored default controls.');
    });
    const backBtn = this.buildButton('Back', () => this.showMain());
    resetBtn.style.flex = '1';
    backBtn.style.flex = '1';
    buttonRow.appendChild(resetBtn);
    buttonRow.appendChild(backBtn);
    view.appendChild(buttonRow);

    return view;
  }

  private buildGroupHeader(text: string): HTMLDivElement {
    const header = document.createElement('div');
    header.textContent = text.toUpperCase();
    Object.assign(header.style, {
      fontSize: '10px',
      letterSpacing: '2px',
      color: MUTED,
      margin: '12px 0 6px',
    });
    return header;
  }

  private buildRebindRow(desc: KeybindingDescriptor): HTMLDivElement {
    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '6px',
    });

    const label = document.createElement('span');
    label.textContent = desc.label;
    label.style.color = LABEL;

    const btn = this.buildButton('', () => this.beginCapture(desc));
    btn.style.minWidth = '110px';
    this.rowButtons.set(desc.action, btn);
    this.setRowLabel(desc);

    row.appendChild(label);
    row.appendChild(btn);
    return row;
  }

  private buildFixedRow(label: string, value: string): HTMLDivElement {
    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '6px',
      opacity: '0.6',
    });
    const name = document.createElement('span');
    name.textContent = label;
    name.style.color = LABEL;
    const val = document.createElement('span');
    val.textContent = value;
    val.style.color = MUTED;
    row.appendChild(name);
    row.appendChild(val);
    return row;
  }

  private setRowLabel(desc: KeybindingDescriptor): void {
    const btn = this.rowButtons.get(desc.action);
    if (!btn) {
      return;
    }
    const value = this.settings.keybindings[desc.action];
    btn.textContent =
      desc.kind === 'mouse'
        ? buttonLabel(value as number | null)
        : keyLabel(value as string | null);
  }

  private refreshRows(): void {
    for (const desc of KEYBINDING_LAYOUT) {
      this.setRowLabel(desc);
    }
  }

  // Enter capture mode for one action: swallow the next key (or mouse button for
  // fire actions) and write it as the new binding. A capture-phase document
  // listener + stopImmediatePropagation stops the captured input from also
  // triggering the ship / shop / music hotkeys. Escape cancels.
  private beginCapture(desc: KeybindingDescriptor): void {
    this.cancelCapture();
    this.setWarning('');

    const btn = this.rowButtons.get(desc.action);
    if (btn) {
      btn.textContent =
        desc.kind === 'mouse' ? 'click a button…' : 'press a key…';
      btn.style.color = ACCENT;
      btn.style.borderColor = ACCENT;
    }

    const commit = (value: string | number): void => {
      const unbound = this.settings.rebind(desc.action, value);
      this.cancelCapture();
      this.refreshRows();
      if (unbound.length > 0) {
        const names = unbound.map((a) => labelFor(a)).join(', ');
        this.setWarning(`Unbound from: ${names}`);
      }
    };

    const onKeyDown = (e: KeyboardEvent): void => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.code === 'Escape') {
        this.cancelCapture();
        return;
      }
      if (desc.kind === 'key') {
        commit(e.code);
      }
      // Mouse rows ignore (but still swallow) non-Escape keys.
    };
    const onMouseDown = (e: MouseEvent): void => {
      e.preventDefault();
      e.stopImmediatePropagation();
      // A left-click also emits a `click`; swallow that one so it can't hit the
      // backdrop and close the menu.
      if (e.button === 0) {
        document.addEventListener('click', swallowClick, true);
      }
      commit(e.button);
    };
    const swallowClick = (e: MouseEvent): void => {
      e.preventDefault();
      e.stopImmediatePropagation();
      document.removeEventListener('click', swallowClick, true);
    };

    document.addEventListener('keydown', onKeyDown, true);
    if (desc.kind === 'mouse') {
      document.addEventListener('mousedown', onMouseDown, true);
    }

    this.captureCleanup = () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('mousedown', onMouseDown, true);
      if (btn) {
        btn.style.color = '';
        btn.style.borderColor = BORDER;
      }
      this.setRowLabel(desc);
    };
  }

  private cancelCapture(): void {
    if (this.captureCleanup) {
      const cleanup = this.captureCleanup;
      this.captureCleanup = null;
      cleanup();
    }
  }

  private setWarning(text: string): void {
    this.warning.textContent = text;
  }

  private buildButton(text: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = text;
    Object.assign(btn.style, {
      font: '12px monospace',
      color: '#cfd8e6',
      background: 'transparent',
      border: `1px solid ${BORDER}`,
      borderRadius: '4px',
      padding: '5px 10px',
      cursor: 'pointer',
    });
    btn.addEventListener('click', onClick);
    return btn;
  }

  private buildSliderRow(opts: {
    label: string;
    min: number;
    max: number;
    step: number;
    format: (v: number) => string;
    get: () => number;
    set: (v: number) => void;
  }): HTMLDivElement {
    const row = document.createElement('div');
    row.style.marginBottom = '14px';

    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex',
      justifyContent: 'space-between',
      marginBottom: '8px',
    });

    const label = document.createElement('span');
    label.textContent = opts.label;
    label.style.color = LABEL;

    const value = document.createElement('span');
    value.style.color = ACCENT;
    const setValueText = (v: number) => {
      value.textContent = opts.format(v);
    };

    header.appendChild(label);
    header.appendChild(value);
    row.appendChild(header);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(opts.min);
    slider.max = String(opts.max);
    slider.step = String(opts.step);
    slider.value = String(opts.get());
    Object.assign(slider.style, { width: '100%', cursor: 'pointer' });
    setValueText(opts.get());

    slider.addEventListener('input', () => {
      const v = Number(slider.value);
      setValueText(v);
      opts.set(v);
    });

    row.appendChild(slider);
    return row;
  }

  private showControls(): void {
    this.refreshRows();
    this.setWarning('');
    this.mainView.style.display = 'none';
    this.controlsView.style.display = 'block';
  }

  private showMain(): void {
    this.cancelCapture();
    this.controlsView.style.display = 'none';
    this.mainView.style.display = 'block';
  }

  private toggle(): void {
    if (this.visible) {
      this.close();
    } else {
      this.open();
    }
  }

  private open(): void {
    this.visible = true;
    this.showMain();
    this.backdrop.style.display = 'flex';
    this.inputController.setEnabled(false);
    // The gameplay cursor is the crosshair SVG; body sets `cursor: none`.
    // Reveal the real OS cursor (and hide the crosshair) so the menu is usable.
    document.body.style.cursor = 'auto';
    if (this.crosshair) {
      this.crosshair.style.display = 'none';
    }
  }

  private close(): void {
    this.cancelCapture();
    this.visible = false;
    this.backdrop.style.display = 'none';
    this.inputController.setEnabled(true);
    // Clearing the inline value falls back to the stylesheet's `cursor: none`.
    document.body.style.cursor = '';
    if (this.crosshair) {
      this.crosshair.style.display = '';
    }
  }
}

// Human label for an action, reused in the "unbound from" warning. Falls back to
// the raw action key if it isn't in the layout (shouldn't happen).
function labelFor(action: KeybindingAction): string {
  const desc = KEYBINDING_LAYOUT.find((d) => d.action === action);
  return desc ? desc.label : action;
}
