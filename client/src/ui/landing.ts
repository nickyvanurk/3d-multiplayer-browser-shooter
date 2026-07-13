import { generateName } from '../../../shared/names/generate-name.ts';

// The pre-flight landing console. Sits on top of the already-rendering starfield
// (the game paints the sector background from the first frame) and holds the
// player until they pick a callsign and launch. On Launch it fades itself out
// and hands the chosen name back to the caller, which drives the join handshake.
//
// Everything here is presentation + client-side validation; the server stays
// authoritative over the final name (it sanitizes and caps at 15 chars).

const MAX_LEN = 15;
const MIN_LEN = 2;

// A key/mouse glyph from the bundled Kenney input-prompt set (white art on
// transparent, so it reads on the dark void). name is the file stem, e.g. 'w'.
function keyImg(name: string, alt: string): string {
  const url = `${import.meta.env.BASE_URL}ui/${name}.png`;
  return `<img class="key" src="${url}" alt="${alt}" draggable="false">`;
}

// A top-down fighter schematic, nose up. Cyan hull with amber cockpit and a pair
// of glowing thrusters — the anchor the movement keys are arranged around.
const SHIP_SVG = `
<svg class="ship" viewBox="0 0 120 120" aria-hidden="true">
  <defs>
    <linearGradient id="vf-hull" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#cfebff"/>
      <stop offset="1" stop-color="#4d7ba3"/>
    </linearGradient>
    <filter id="vf-glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="2.5"/>
    </filter>
  </defs>
  <g class="thrust">
    <ellipse cx="53" cy="103" rx="3.4" ry="10" fill="#7fe0ff" filter="url(#vf-glow)"/>
    <ellipse cx="67" cy="103" rx="3.4" ry="10" fill="#7fe0ff" filter="url(#vf-glow)"/>
  </g>
  <path d="M62 50 L104 92 L62 82 Z" fill="url(#vf-hull)" stroke="#8fd0ff" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M58 50 L16 92 L58 82 Z" fill="url(#vf-hull)" stroke="#8fd0ff" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M60 8 L67 50 L65 98 L55 98 L53 50 Z" fill="url(#vf-hull)" stroke="#8fd0ff" stroke-width="1.5" stroke-linejoin="round"/>
  <rect x="51" y="95" width="6" height="10" rx="1.5" fill="#2b4258" stroke="#8fd0ff" stroke-width="1"/>
  <rect x="63" y="95" width="6" height="10" rx="1.5" fill="#2b4258" stroke="#8fd0ff" stroke-width="1"/>
  <ellipse cx="60" cy="36" rx="4.5" ry="8" fill="#e2b04a"/>
</svg>`;

export class Landing {
  private readonly root: HTMLDivElement;
  private readonly input: HTMLInputElement;
  private readonly hint: HTMLDivElement;
  private readonly launchBtn: HTMLButtonElement;
  private readonly onLaunch: (name: string) => void;
  private launched = false;

  constructor(opts: { initialName: string; onLaunch: (name: string) => void }) {
    this.onLaunch = opts.onLaunch;

    this.root = document.createElement('div');
    this.root.id = 'landing';
    this.root.innerHTML = `
      <div class="landing-console">
        <header class="landing-head">
          <div class="landing-eyebrow">Multiplayer&nbsp;·&nbsp;Live Sector</div>
          <h1 class="landing-title">VOIDFALL</h1>
          <p class="landing-tag">Name your ship and drop into the void.</p>
        </header>

        <div class="landing-field">
          <label for="vf-callsign">Callsign</label>
          <div class="callsign-row">
            <input id="vf-callsign" type="text" maxlength="${MAX_LEN}"
              autocomplete="off" autocapitalize="off" autocorrect="off"
              spellcheck="false" aria-describedby="vf-hint">
            <button type="button" class="reroll" title="Roll a new callsign"
              aria-label="Roll a new callsign">
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path fill="none" stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round"
                  d="M20 11a8 8 0 1 0-1.9 6.3M20 20v-5h-5"/>
              </svg>
            </button>
          </div>
          <div id="vf-hint" class="callsign-hint" role="status"></div>
        </div>

        <section class="landing-controls">
          <div class="controls-label">Flight Controls</div>
          <div class="control-map">
            <div class="dcell up">
              <span class="dir">&#9650;</span>${keyImg('keyboard_w', 'W')}<span class="cap">Thrust</span>
            </div>
            <div class="dcell left">
              <span class="dir">&#9664;</span>${keyImg('keyboard_a', 'A')}<span class="cap">Strafe</span>
            </div>
            <div class="dcell ship">${SHIP_SVG}</div>
            <div class="dcell right">
              ${keyImg('keyboard_d', 'D')}<span class="dir">&#9654;</span><span class="cap">Strafe</span>
            </div>
            <div class="dcell down">
              ${keyImg('keyboard_s', 'S')}<span class="dir">&#9660;</span><span class="cap">Reverse</span>
            </div>
          </div>
          <ul class="control-chips">
            <li>${keyImg('keyboard_q', 'Q')}${keyImg('keyboard_e', 'E')}<span>Roll</span></li>
            <li>${keyImg('keyboard_space', 'Space')}${keyImg('keyboard_c', 'C')}<span>Up / Down</span></li>
            <li>${keyImg('keyboard_shift', 'Shift')}<span>Boost</span></li>
            <li>${keyImg('mouse_left', 'Left click')}<span>Primary</span></li>
            <li>${keyImg('mouse_right', 'Right click')}<span>Secondary</span></li>
          </ul>
        </section>

        <button type="button" class="launch-btn">
          Launch <span class="launch-glyph">&#9654;</span>
        </button>
      </div>`;

    this.input = this.root.querySelector('#vf-callsign') as HTMLInputElement;
    this.hint = this.root.querySelector('#vf-hint') as HTMLDivElement;
    this.launchBtn = this.root.querySelector(
      '.launch-btn',
    ) as HTMLButtonElement;
    const reroll = this.root.querySelector('.reroll') as HTMLButtonElement;

    this.input.value = opts.initialName;
    this.input.addEventListener('input', () => this.refresh());
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.submit();
      }
    });
    reroll.addEventListener('click', () => {
      this.input.value = generateName();
      this.refresh();
      this.input.focus();
    });
    this.launchBtn.addEventListener('click', () => this.submit());

    document.body.appendChild(this.root);
    this.refresh();
    // Select the prefilled name so the player can retype over it immediately.
    this.input.focus();
    this.input.select();
  }

  // Trim, then accept 2–15 chars. The server sanitizes HTML and truncates, so
  // this stays permissive (names may contain spaces, digits, punctuation) and
  // only rejects the empty/too-short cases the server would silently rename.
  private validate(): { ok: boolean; value: string; message: string } {
    const value = this.input.value.trim();
    if (value.length === 0) {
      return { ok: false, value, message: 'Enter a callsign, or roll one.' };
    }
    if (value.length < MIN_LEN) {
      return { ok: false, value, message: `At least ${MIN_LEN} characters.` };
    }
    return { ok: true, value, message: '' };
  }

  // Reflect the current validity in the hint text and the Launch button.
  private refresh(): void {
    const { ok, message } = this.validate();
    this.launchBtn.disabled = !ok;
    this.hint.textContent = message;
    this.hint.classList.toggle('error', !ok && this.input.value.length > 0);
  }

  private submit(): void {
    const { ok, value } = this.validate();
    if (!ok || this.launched) {
      if (!ok) {
        this.input.focus();
      }
      return;
    }
    this.launched = true;
    this.onLaunch(value);
    this.hide();
  }

  private hide(): void {
    this.root.classList.add('hidden');
    // Drop it from the DOM after the fade so it never intercepts clicks.
    // transitionend covers the normal case; the timeout backstops
    // prefers-reduced-motion, where the transition is off and no event fires.
    // remove() on an already-detached node is a harmless no-op.
    const remove = () => this.root.remove();
    this.root.addEventListener('transitionend', remove, { once: true });
    setTimeout(remove, 600);
  }
}
