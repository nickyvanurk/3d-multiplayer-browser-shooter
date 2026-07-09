interface Selector {
  count: number;
  hasRandom: boolean;
  getActive: () => number;
  onSelect: (index: number) => void;
  refresh: () => void;
}

interface Slider {
  decKey: string;
  incKey: string;
  step: (dir: number) => void;
}

// A lightweight in-game debug overlay, toggled with F3. Hosts labelled option
// selectors (e.g. which packed blaster sound is active) so settings can be
// auditioned live. Options are clickable and also bound to the number keys
// (1-9, 0=10) while the panel is open, which works even under pointer lock.
export class DebugPanel {
  private readonly el: HTMLDivElement;
  private readonly selectors: Selector[] = [];
  private readonly sliders: Slider[] = [];
  private visible = false;

  constructor() {
    this.el = document.createElement('div');
    Object.assign(this.el.style, {
      position: 'fixed',
      top: '12px',
      left: '12px',
      zIndex: '10000',
      display: 'none',
      font: '12px monospace',
      color: '#cfd8e6',
      background: 'rgba(10,12,20,0.88)',
      border: '1px solid #3a4a6a',
      borderRadius: '6px',
      padding: '10px 12px',
      maxHeight: '80vh',
      overflowY: 'auto',
      minWidth: '190px',
      userSelect: 'none',
    });
    const header = document.createElement('div');
    header.textContent = 'DEBUG · F3';
    Object.assign(header.style, {
      fontWeight: 'bold',
      color: '#8fd0ff',
      marginBottom: '8px',
      letterSpacing: '1px',
    });
    this.el.appendChild(header);
    document.body.appendChild(this.el);

    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  private onKey(e: KeyboardEvent): void {
    if (e.code === 'F3') {
      e.preventDefault();
      this.visible = !this.visible;
      this.el.style.display = this.visible ? 'block' : 'none';
      return;
    }
    if (!this.visible) {
      return;
    }
    // Slider keys adjust their value.
    for (const s of this.sliders) {
      if (e.code === s.decKey) {
        e.preventDefault();
        s.step(-1);
        return;
      }
      if (e.code === s.incKey) {
        e.preventDefault();
        s.step(1);
        return;
      }
    }
    if (this.selectors.length === 0) {
      return;
    }
    // Number keys pick a specific option; R picks Random. Both drive the
    // most-recently-added selector.
    const sel = this.selectors[this.selectors.length - 1];
    if (e.code === 'KeyR' && sel.hasRandom) {
      e.preventDefault();
      sel.onSelect(-1);
      sel.refresh();
    } else if (e.code.startsWith('Digit')) {
      const digit = Number(e.code.slice(5));
      const index = digit === 0 ? 9 : digit - 1;
      if (index < sel.count) {
        e.preventDefault();
        sel.onSelect(index);
        sel.refresh();
      }
    }
  }

  addSelector(
    title: string,
    count: number,
    getActive: () => number,
    onSelect: (index: number) => void,
    includeRandom = false,
  ): void {
    const section = document.createElement('div');
    const heading = document.createElement('div');
    heading.textContent = title;
    Object.assign(heading.style, { marginBottom: '6px', color: '#9fb0c8' });
    section.appendChild(heading);

    const buttons: { value: number; el: HTMLButtonElement }[] = [];
    const refresh = () => {
      const a = getActive();
      for (const { value, el } of buttons) {
        el.style.background = value === a ? '#2b6cb0' : 'transparent';
        el.style.color = value === a ? '#ffffff' : '#cfd8e6';
      }
    };

    const addButton = (label: string, value: number, width: string) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      Object.assign(btn.style, {
        width,
        margin: '2px',
        padding: '4px 0',
        cursor: 'pointer',
        font: '12px monospace',
        border: '1px solid #3a4a6a',
        borderRadius: '4px',
        background: 'transparent',
        color: '#cfd8e6',
      });
      btn.addEventListener('click', () => {
        onSelect(value);
        refresh();
      });
      buttons.push({ value, el: btn });
      section.appendChild(btn);
    };

    if (includeRandom) {
      addButton('⚄ R', -1, '44px');
    }
    for (let i = 0; i < count; i++) {
      addButton(String(i + 1), i, '30px');
    }

    refresh();
    this.el.appendChild(section);
    this.selectors.push({
      count,
      hasRandom: includeRandom,
      getActive,
      onSelect,
      refresh,
    });
  }

  // A keyboard-driven slider: decKey/incKey step the value in [min,max]; the label
  // shows the current value and a bar. onChange fires after each step.
  addSlider(
    label: string,
    opts: {
      min: number;
      max: number;
      step: number;
      decKey: string;
      incKey: string;
      keyHint: string;
      get: () => number;
      set: (v: number) => void;
      onChange?: () => void;
    },
  ): void {
    const row = document.createElement('div');
    Object.assign(row.style, { margin: '6px 0', whiteSpace: 'pre' });
    this.el.appendChild(row);

    const render = () => {
      const v = opts.get();
      const frac = (v - opts.min) / (opts.max - opts.min);
      const filled = Math.round(frac * 12);
      const bar = '█'.repeat(filled) + '░'.repeat(12 - filled);
      row.textContent = `${label} ${opts.keyHint}\n  ${bar} ${v.toFixed(2)}`;
    };

    const step = (dir: number) => {
      const v = Math.min(
        opts.max,
        Math.max(opts.min, opts.get() + dir * opts.step),
      );
      opts.set(Number(v.toFixed(4)));
      render();
      opts.onChange?.();
    };

    render();
    this.sliders.push({ decKey: opts.decKey, incKey: opts.incKey, step });
  }
}
