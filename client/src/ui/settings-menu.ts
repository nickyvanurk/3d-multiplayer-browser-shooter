import type { SceneManager } from '../render/scene-manager.ts';
import type { InputController } from '../input/input-controller.ts';
import {
  CAMERA_STIFFNESS_LIMITS,
  FOV_LIMITS,
  type SettingsStore,
} from '../settings.ts';

// A simple in-game settings overlay, toggled with Escape. Sliders apply live and
// persist to localStorage. While open it disables game input so slider tweaks
// don't steer or fire the ship.
export class SettingsMenu {
  private readonly settings: SettingsStore;
  private readonly sceneManager: SceneManager;
  private readonly inputController: InputController;
  private readonly backdrop: HTMLDivElement;
  private readonly crosshair: HTMLElement | null;
  private visible = false;

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
      border: '1px solid #3a4a6a',
      borderRadius: '8px',
      padding: '20px 24px',
      minWidth: '320px',
      boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
      userSelect: 'none',
    });
    this.backdrop.appendChild(panel);

    const title = document.createElement('div');
    title.textContent = 'SETTINGS';
    Object.assign(title.style, {
      fontWeight: 'bold',
      fontSize: '15px',
      color: '#8fd0ff',
      letterSpacing: '2px',
      marginBottom: '18px',
    });
    panel.appendChild(title);

    panel.appendChild(
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
    panel.appendChild(
      this.buildSliderRow({
        label: 'Camera stiffness',
        min: CAMERA_STIFFNESS_LIMITS.min,
        max: CAMERA_STIFFNESS_LIMITS.max,
        step: 1,
        format: (v) => String(v),
        get: () => this.settings.cameraStiffness,
        // Read live by the chase camera each frame; just persist it.
        set: (v) => {
          this.settings.cameraStiffness = v;
        },
      }),
    );

    const hint = document.createElement('div');
    hint.textContent = 'Esc to close';
    Object.assign(hint.style, {
      marginTop: '18px',
      textAlign: 'right',
      fontSize: '11px',
      color: '#6b7a94',
    });
    panel.appendChild(hint);

    document.body.appendChild(this.backdrop);

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        this.toggle();
      }
    });
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
    label.style.color = '#9fb0c8';

    const value = document.createElement('span');
    value.style.color = '#8fd0ff';
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

  private toggle(): void {
    if (this.visible) {
      this.close();
    } else {
      this.open();
    }
  }

  private open(): void {
    this.visible = true;
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
