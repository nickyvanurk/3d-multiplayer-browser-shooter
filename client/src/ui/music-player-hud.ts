import type { MusicPlayer } from '../audio/music-player.ts';
import type { Keybindings } from '../input/keybindings.ts';

// A compact "now playing" widget pinned bottom-left, styled to match the
// settings menu / debug overlay. Keyboard-first (arrow keys drive the player;
// the glyph buttons are a mouse fallback):
//   ← / →  previous / next track
//   ↑ / ↓  volume up / down
//   P      play / pause
//   M      show / hide this widget
export class MusicPlayerHud {
  private readonly player: MusicPlayer;
  private readonly keybindings: Keybindings;
  private readonly panel: HTMLDivElement;
  private readonly titleEl: HTMLDivElement;
  private readonly playBtn: HTMLButtonElement;
  private readonly volFill: HTMLDivElement;
  private readonly volText: HTMLSpanElement;
  private visible = true;

  constructor(player: MusicPlayer, keybindings: Keybindings) {
    this.player = player;
    this.keybindings = keybindings;

    this.panel = document.createElement('div');
    Object.assign(this.panel.style, {
      position: 'fixed',
      right: '16px',
      bottom: '16px',
      zIndex: '15000',
      width: '230px',
      font: '12px monospace',
      color: '#cfd8e6',
      background: 'rgba(10,12,20,0.9)',
      border: '1px solid #3a4a6a',
      borderRadius: '8px',
      padding: '12px 14px',
      boxShadow: '0 6px 30px rgba(0,0,0,0.5)',
      userSelect: 'none',
    });

    const label = document.createElement('div');
    label.textContent = '♪ NOW PLAYING';
    Object.assign(label.style, {
      fontSize: '10px',
      letterSpacing: '2px',
      color: '#8fd0ff',
      marginBottom: '6px',
    });
    this.panel.appendChild(label);

    this.titleEl = document.createElement('div');
    Object.assign(this.titleEl.style, {
      fontSize: '13px',
      fontWeight: 'bold',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      marginBottom: '10px',
    });
    this.panel.appendChild(this.titleEl);

    const controls = document.createElement('div');
    Object.assign(controls.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      marginBottom: '10px',
    });
    controls.appendChild(this.button('⏮', () => this.player.prev()));
    this.playBtn = this.button('⏯', () => this.player.toggle());
    controls.appendChild(this.playBtn);
    controls.appendChild(this.button('⏭', () => this.player.next()));

    this.volText = document.createElement('span');
    Object.assign(this.volText.style, {
      marginLeft: 'auto',
      fontSize: '10px',
      color: '#9fb0c8',
    });
    controls.appendChild(this.volText);
    this.panel.appendChild(controls);

    const volBar = document.createElement('div');
    Object.assign(volBar.style, {
      height: '4px',
      borderRadius: '2px',
      background: '#26324a',
      overflow: 'hidden',
      marginBottom: '10px',
    });
    this.volFill = document.createElement('div');
    Object.assign(this.volFill.style, {
      height: '100%',
      background: '#8fd0ff',
    });
    volBar.appendChild(this.volFill);
    this.panel.appendChild(volBar);

    const hint = document.createElement('div');
    hint.textContent = '← → track · ↑ ↓ vol · P play · M hide';
    Object.assign(hint.style, {
      fontSize: '10px',
      color: '#6b7a94',
    });
    this.panel.appendChild(hint);

    document.body.appendChild(this.panel);

    this.player.onChange = () => this.refresh();
    this.refresh();
    this.bindKeys();
  }

  private button(glyph: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = glyph;
    Object.assign(btn.style, {
      font: '14px monospace',
      color: '#cfd8e6',
      background: 'transparent',
      border: '1px solid #3a4a6a',
      borderRadius: '4px',
      padding: '2px 8px',
      cursor: 'pointer',
    });
    btn.addEventListener('click', onClick);
    return btn;
  }

  private bindKeys(): void {
    window.addEventListener('keydown', (e) => {
      // Don't hijack keys while a form control is focused (e.g. settings sliders,
      // which respond to arrow keys themselves).
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT')
      ) {
        return;
      }
      const kb = this.keybindings;
      switch (e.code) {
        case kb.musicPrev:
          e.preventDefault();
          this.player.prev();
          break;
        case kb.musicNext:
          e.preventDefault();
          this.player.next();
          break;
        case kb.musicVolUp:
          e.preventDefault();
          this.player.changeVolume(0.05);
          break;
        case kb.musicVolDown:
          e.preventDefault();
          this.player.changeVolume(-0.05);
          break;
        case kb.musicPlayPause:
          e.preventDefault();
          this.player.toggle();
          break;
        case kb.musicPanelToggle:
          e.preventDefault();
          this.toggleVisible();
          break;
      }
    });
  }

  private toggleVisible(): void {
    this.visible = !this.visible;
    this.panel.style.display = this.visible ? 'block' : 'none';
  }

  private refresh(): void {
    this.titleEl.textContent = this.player.current.title;
    this.playBtn.textContent = this.player.playing ? '⏸' : '▶';
    const pct = Math.round(this.player.volume * 100);
    this.volFill.style.width = `${pct}%`;
    this.volText.textContent = `VOL ${pct}%`;
  }
}
