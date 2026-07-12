import {
  TextureLoader,
  SpriteMaterial,
  Sprite,
  OrthographicCamera,
  Scene,
  CanvasTexture,
  BufferGeometry,
  BufferAttribute,
  LineDashedMaterial,
  Line,
  LineSegments,
  LineBasicMaterial,
} from 'three';
import type { Texture } from 'three';

import type { World } from '../../../shared/sim/world.ts';
import type { Ship, Faction } from '../../../shared/sim/entities/ship.ts';
import type { SceneManager } from './scene-manager.ts';
import type { ProjectionService } from './projection.ts';

// Accent colour for the firing-lead marker (ring + guide line): a muted red that
// reads distinctly against the orange tracers and the enemy reticle.
const LEAD_COLOR = 0xb9524c;

// The on-screen reticle brackets the whole ship: its half-size is the ship's
// projected radius times this, plus a small constant so even a tiny, distant
// ship keeps a legible box with breathing room around it.
const RETICLE_SPACING = 1.12;
const RETICLE_PADDING_PX = 4;
// The reticle is drawn as four corner brackets from line segments (not a scaled
// sprite), so the strokes stay crisp and the arms a fixed length at any box size.
const RETICLE_ARM_PX = 14; // max length of each corner arm (big, near boxes)
// Corner arms are at most this fraction of the box half-size, so on small/distant
// boxes the legs shrink with the box instead of meeting into a full square.
const RETICLE_ARM_FRACTION = 0.35;
const RETICLE_MIN_HALF_PX = 10; // floor on the half-size so far ships still show
const RETICLE_FALLBACK_DIAMETER_PX = 44; // when a ship can't be distance-sized
// Reticle/marker colour by allegiance — the HUD reads a ship's faction, never
// its entity type, so friendly/enemy/NPC are all handled by the same code paths.
const RETICLE_COLOR_HOSTILE = 0xb9524c; // muted red, matching the lead marker
const RETICLE_COLOR_NEUTRAL = 0xd1a44c; // gold (the vendor / NPCs)
const RETICLE_COLOR_FRIENDLY = 0x5fd08a; // green (reserved for a team mode)

function factionColor(faction: Faction): number {
  if (faction === 'neutral') {
    return RETICLE_COLOR_NEUTRAL;
  }
  if (faction === 'friendly') {
    return RETICLE_COLOR_FRIENDLY;
  }
  return RETICLE_COLOR_HOSTILE;
}

const RETICLE_BASE_OPACITY = 0.9;
// Up close the brackets just clutter the ship, so the reticle fades out by
// distance (camera -> target, world units): full beyond START, gone within END.
const RETICLE_FADE_START_DIST = 500; // begin fading nearer than this
const RETICLE_FADE_END_DIST = 450; // fully gone nearer than this — a fast, snappy fade
// Fixed sizing (fraction of the sprite texture) for the off-screen edge arrow.
const ARROW_SCALE = 0.2;

// Enemy HP bar (below the reticle), shown only for the ship the crosshair is on.
// MAX_HEALTH mirrors Ship's spawn health.
const MAX_HEALTH = 100;
const HP_BAR_WIDTH = 42; // px
const HP_BAR_HEIGHT = 5; // px
const HP_BAR_GAP = 26; // px below the reticle — matches the label's LABEL_GAP
const HP_BAR_BG_COLOR = 0x101010;

// A ring sprite plus the thin line joining a ship's on-screen reticle to it.
interface LeadMarker {
  ring: Sprite;
  line: Line;
}

// A health bar: a dark background quad and a fillable foreground quad.
interface HpBar {
  bg: Sprite;
  fg: Sprite;
}

// Target label (aimed-at enemy's callsign + distance), sitting to the RIGHT of
// the reticle like Everspace 2. Drawn at 2x and scaled down for crisp text; it
// does NOT fade with the reticle.
const LABEL_SCALE = 0.5; // canvas px -> screen px
const LABEL_GAP = 26; // px between the reticle's right edge and the label
const LABEL_LEVEL_FONT = "700 20px ui-monospace, 'SF Mono', Menlo, monospace";
const LABEL_NAME_FONT = "600 34px system-ui, 'Segoe UI', sans-serif";
const LABEL_DIST_FONT = "500 24px system-ui, 'Segoe UI', sans-serif";
const LABEL_LEVEL_COLOR = '#ffcf5e'; // gold, matching the pilot level badge

// Render the aimed-at target's label, left-aligned, dark-outlined for legibility:
// an optional gold "LVL n" tag on top (enemies only), the callsign, then the
// distance. Returns the texture, its canvas pixel size, and the vertical centre of
// the name line — the caller anchors THAT on the target so the callsign sits on the
// square with the level tag just above it, rather than centring the whole block.
function makeLabelTexture(
  level: number | undefined,
  name: string,
  distance: string,
): {
  texture: CanvasTexture;
  width: number;
  height: number;
  nameCenterY: number;
} {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  const levelText = level !== undefined ? `LVL ${level}` : '';
  ctx.font = LABEL_LEVEL_FONT;
  const levelW = levelText ? ctx.measureText(levelText).width : 0;
  ctx.font = LABEL_NAME_FONT;
  const nameW = ctx.measureText(name).width;
  ctx.font = LABEL_DIST_FONT;
  const distW = ctx.measureText(distance).width;

  const padX = 6;
  const padY = 6;
  const lineGap = 4;
  const levelH = levelText ? 22 : 0;
  const levelGap = levelText ? 3 : 0;
  const nameH = 40;
  const distH = 30;
  const width = Math.ceil(Math.max(levelW, nameW, distW)) + padX * 2;
  const height = levelH + levelGap + nameH + lineGap + distH + padY * 2;
  canvas.width = width;
  canvas.height = height;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';

  let y = padY;
  if (levelText) {
    ctx.font = LABEL_LEVEL_FONT;
    ctx.strokeText(levelText, padX, y);
    ctx.fillStyle = LABEL_LEVEL_COLOR;
    ctx.fillText(levelText, padX, y);
    y += levelH + levelGap;
  }

  const nameY = y;
  ctx.font = LABEL_NAME_FONT;
  ctx.strokeText(name, padX, y);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(name, padX, y);
  y += nameH + lineGap;

  ctx.font = LABEL_DIST_FONT;
  ctx.strokeText(distance, padX, y);
  ctx.fillStyle = '#c9d2e3'; // slightly dimmer than the name
  ctx.fillText(distance, padX, y);

  return {
    texture: new CanvasTexture(canvas),
    width,
    height,
    nameCenterY: nameY + nameH / 2,
  };
}

// Draw the hollow "shoot here" ring once into a canvas-backed texture, so the
// lead markers need no external asset file.
function createRingTexture(): CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const center = size / 2;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(center, center, size / 2 - 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(center, center, 3, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  return new CanvasTexture(canvas);
}

// Ports hud-system.js: draws an off-screen indicator sprite for every non-player
// ship, clamped to an ellipse at the screen edge, swapping to a target reticle
// when the ship is on screen. Reads the 2D indicators produced by ProjectionService.
export class HudService {
  world: World;
  sceneManager: SceneManager;
  projection: ProjectionService;
  halfWidth: number;
  halfHeight: number;
  cameraOrtho: OrthographicCamera;
  sceneOrtho: Scene;
  // Off-screen edge markers only; the on-screen reticle is drawn from lines.
  textures?: { spaceship: Texture; vendor: Texture };
  entityIndicators: Record<string, Sprite>;
  ringTexture: CanvasTexture;
  leadMarkers: Map<number, LeadMarker>;
  // Corner-bracket reticle per entity, shown while the ship is on-screen.
  reticles: Map<number, LineSegments>;
  // Enemy HP bars, shown below the reticle only while the ship is aimed at.
  hpBars: Map<number, HpBar>;
  // Single reusable name plate for the aimed-at enemy (only one at a time). Does
  // NOT fade with the reticle. `namePlateText` caches the drawn text.
  namePlate: Sprite | null;
  namePlateText: string;

  constructor(
    world: World,
    sceneManager: SceneManager,
    projection: ProjectionService,
  ) {
    this.world = world;
    this.sceneManager = sceneManager;
    this.projection = projection;

    this.halfWidth = window.innerWidth / 2;
    this.halfHeight = window.innerHeight / 2;
    this.cameraOrtho = new OrthographicCamera(
      -this.halfWidth,
      this.halfWidth,
      this.halfHeight,
      -this.halfHeight,
      1,
      10,
    );
    this.cameraOrtho.position.z = 10;
    // Inert in the original JS: OrthographicCamera ignores fov. Cast preserves it verbatim.
    (this.cameraOrtho as OrthographicCamera & { fov: number }).fov = 70;
    this.sceneOrtho = new Scene();

    const loader = new TextureLoader();
    // The 2nd arg to Promise.all is dead code in the original JS (Promise.all takes one
    // arg); the cast keeps the exact call — including the ignored callback — unchanged.
    const texture = (
      Promise.all as (
        values: Texture[],
        executor: (resolve: (value: unknown) => void, reject: unknown) => void,
      ) => Promise<Texture[]>
    )(
      [
        loader.load('textures/spaceship.png'),
        loader.load('textures/vendor.png'),
      ],
      (resolve, _) => {
        resolve(texture);
      },
    ).then((result) => {
      this.textures = {
        spaceship: result[0],
        vendor: result[1],
      };
    });

    this.entityIndicators = {};
    this.ringTexture = createRingTexture();
    this.leadMarkers = new Map();
    this.reticles = new Map();
    this.hpBars = new Map();
    this.namePlate = null;
    this.namePlateText = '';

    window.addEventListener('resize', this.onWindowResize.bind(this));
  }

  render(aimedShipId: number | null = null): void {
    if (!this.textures) {
      return;
    }

    const indicators = this.projection.indicators;

    for (const id of Object.keys(this.entityIndicators)) {
      if (!indicators.has(Number(id))) {
        this.sceneOrtho.remove(this.entityIndicators[id]);
        delete this.entityIndicators[id];
      }
    }

    for (const id of this.leadMarkers.keys()) {
      if (!indicators.has(id)) {
        this.removeLead(id);
      }
    }

    for (const id of this.reticles.keys()) {
      if (!indicators.has(id)) {
        this.removeReticle(id);
      }
    }

    for (const id of this.hpBars.keys()) {
      if (!indicators.has(id)) {
        this.removeHpBar(id);
      }
    }

    // Only one enemy is aimed at at a time, so a single name plate serves; track
    // whether it was placed this frame and hide it if not.
    let nameShown = false;

    for (const [id, transform2d] of indicators) {
      if (!this.entityIndicators[id]) {
        this.entityIndicators[id] = this.createHudSprite(0, 0);
      }

      const angle = transform2d.rotation;

      const a = this.halfWidth / 1.5;
      const b = this.halfHeight / 1.5;

      const t = Math.sqrt(
        (b * Math.cos(angle)) ** 2 + (a * Math.sin(angle)) ** 2,
      );
      const x = (a * b * Math.cos(angle)) / t;
      const y = (a * b * Math.sin(angle)) / t;

      const indicator = this.entityIndicators[id];

      // All ships are handled uniformly; only their faction (colour/icon) and
      // whether they carry damageable health differ, both read as data.
      const ship = this.world.get(Number(id)) as Ship | undefined;
      const faction: Faction = ship?.faction ?? 'hostile';
      const aimed = aimedShipId === Number(id);

      if (transform2d.onscreen) {
        // On-screen: draw the line-bracket reticle (sized to the ship, grows as
        // it nears) and hide the sprite edge marker. The ship's on-screen radius
        // comes from the projection; fall back to a fixed box if unknown.
        indicator.visible = false;
        const diameter =
          transform2d.screenRadius > 0
            ? 2 *
              (transform2d.screenRadius * RETICLE_SPACING + RETICLE_PADDING_PX)
            : RETICLE_FALLBACK_DIAMETER_PX;
        this.updateReticle(
          Number(id),
          transform2d.position,
          diameter,
          factionColor(faction),
        );

        // The lead ring only makes sense while its ship is drawn as a reticle
        // (you are looking at it). Anchor the guide line at the reticle.
        const lead = this.projection.leads.get(Number(id));
        if (lead) {
          this.updateLead(Number(id), transform2d.position, lead);
        } else {
          this.removeLead(Number(id));
        }

        // HP bar below the reticle for the aimed-at ship. Invulnerable ships
        // (the vendor) carry no meaningful health, so they get none — decided
        // inside updateHealthBar, no faction check here.
        this.updateHealthBar(
          Number(id),
          ship,
          transform2d.position,
          diameter,
          aimed,
        );

        // Target label (name + distance) to the RIGHT of the reticle for the
        // aimed-at ship of ANY faction. Unlike the reticle it does NOT fade with
        // distance; same visibility as the HP bar.
        const shipName = aimed ? ship?.name : undefined;
        if (shipName && ship) {
          const meters = ship.transform.position.distanceTo(
            this.sceneManager.camera.position,
          );
          const distanceLabel = `${(meters / 1000).toFixed(1)}km`;
          const rightX = transform2d.position.x + diameter / 2 + LABEL_GAP;
          // Enemies (hostile) show their level above the name; the neutral vendor
          // does not.
          const level = faction === 'hostile' ? ship.level : undefined;
          this.updateNamePlate(
            level,
            shipName,
            distanceLabel,
            rightX,
            transform2d.position.y,
          );
          nameShown = true;
        }
      } else {
        // Off-screen: the clamped edge marker sprite; hide the reticle. Neutral
        // ships use the vendor icon, everyone else the generic ship arrow.
        indicator.visible = true;
        indicator.material = new SpriteMaterial({
          map:
            faction === 'neutral'
              ? this.textures.vendor
              : this.textures.spaceship,
        });
        indicator.position.set(x, y, 1);
        this.resetToArrowScale(indicator);
        this.hideReticle(Number(id));
        this.removeLead(Number(id));
        this.hideHpBar(Number(id));
      }
    }

    if (!nameShown) {
      this.hideNamePlate();
    }

    const renderer = this.sceneManager.renderer;
    renderer.clearDepth();
    renderer.render(this.sceneOrtho, this.cameraOrtho);
  }

  createHudSprite(x: number, y: number): Sprite {
    const material = new SpriteMaterial({ map: this.textures!.spaceship });
    const enemyIndicator = new Sprite(material);
    enemyIndicator.center.set(0.5, 0.5);
    enemyIndicator.position.set(x, y, 1); // top left
    const scale = 0.2;
    enemyIndicator.scale.set(
      material.map!.image.width * scale,
      material.map!.image.height * scale,
      1,
    );
    this.sceneOrtho.add(enemyIndicator);
    return enemyIndicator;
  }

  // Reset an indicator sprite to its fixed texture-relative size — the off-screen
  // edge arrow, and the fallback when a reticle can't be distance-sized.
  resetToArrowScale(indicator: Sprite): void {
    const image = (indicator.material as SpriteMaterial).map?.image as
      | { width: number; height: number }
      | undefined;
    if (image) {
      indicator.scale.set(
        image.width * ARROW_SCALE,
        image.height * ARROW_SCALE,
        1,
      );
    }
  }

  // Draw/refresh the corner-bracket reticle centered at `center`, sized so its
  // box spans `diameter` px around the ship, in the ship's faction `color`. Built
  // from line segments (not a scaled texture), so the strokes stay 1px-crisp and
  // the arms fixed-length at any size.
  updateReticle(
    id: number,
    center: { x: number; y: number },
    diameter: number,
    color: number,
  ): void {
    let reticle = this.reticles.get(id);
    if (!reticle) {
      reticle = this.createReticle();
      this.reticles.set(id, reticle);
    }

    // Fade out as the target gets close (distance from camera). Fully faded →
    // skip drawing entirely.
    const entity = this.world.get(id);
    const distance = entity
      ? entity.transform.position.distanceTo(this.sceneManager.camera.position)
      : Number.POSITIVE_INFINITY;
    const fade = Math.max(
      0,
      Math.min(
        1,
        (distance - RETICLE_FADE_END_DIST) /
          (RETICLE_FADE_START_DIST - RETICLE_FADE_END_DIST),
      ),
    );
    if (fade <= 0) {
      reticle.visible = false;
      return;
    }

    reticle.visible = true;
    const material = reticle.material as LineBasicMaterial;
    material.opacity = RETICLE_BASE_OPACITY * fade;
    material.color.setHex(color);

    const half = Math.max(diameter / 2, RETICLE_MIN_HALF_PX);
    const arm = Math.min(RETICLE_ARM_PX, half * RETICLE_ARM_FRACTION);
    const positions = reticle.geometry.getAttribute(
      'position',
    ) as BufferAttribute;

    // Four corners; each contributes two arms (an L) pointing inward. The
    // geometry is centered on the origin — `reticle.position` places it.
    const corners = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    let i = 0;
    for (const [sx, sy] of corners) {
      const cx = sx * half;
      const cy = sy * half;
      positions.setXYZ(i++, cx, cy, 0);
      positions.setXYZ(i++, cx - sx * arm, cy, 0);
      positions.setXYZ(i++, cx, cy, 0);
      positions.setXYZ(i++, cx, cy - sy * arm, 0);
    }
    positions.needsUpdate = true;
    reticle.position.set(center.x, center.y, 1);
  }

  createReticle(): LineSegments {
    const geometry = new BufferGeometry();
    // 4 corners × 2 arms × 2 endpoints = 16 vertices.
    geometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array(16 * 3), 3),
    );
    const reticle = new LineSegments(
      geometry,
      new LineBasicMaterial({
        transparent: true,
        opacity: RETICLE_BASE_OPACITY,
        depthTest: false,
      }),
    );
    reticle.frustumCulled = false;
    this.sceneOrtho.add(reticle);
    return reticle;
  }

  hideReticle(id: number): void {
    const reticle = this.reticles.get(id);
    if (reticle) {
      reticle.visible = false;
    }
  }

  removeReticle(id: number): void {
    const reticle = this.reticles.get(id);
    if (!reticle) {
      return;
    }
    this.sceneOrtho.remove(reticle);
    reticle.geometry.dispose();
    (reticle.material as LineBasicMaterial).dispose();
    this.reticles.delete(id);
  }

  // Show the aimed-at ship's HP bar below its reticle, else hide it. Invulnerable
  // ships (the vendor) carry no meaningful health and never get one. Health is
  // replicated from the server (network-client).
  updateHealthBar(
    id: number,
    ship: Ship | undefined,
    center: { x: number; y: number },
    reticleDiameter: number,
    aimed: boolean,
  ): void {
    const health = ship && !ship.invulnerable ? ship.health : undefined;
    if (!aimed || typeof health !== 'number') {
      this.hideHpBar(id);
      return;
    }

    const frac = Math.max(0, Math.min(1, health / MAX_HEALTH));
    const left = center.x - HP_BAR_WIDTH / 2;
    const y = center.y - reticleDiameter / 2 - HP_BAR_GAP;

    let bar = this.hpBars.get(id);
    if (!bar) {
      bar = this.createHpBar();
      this.hpBars.set(id, bar);
    }
    bar.bg.visible = true;
    bar.fg.visible = true;
    bar.bg.position.set(left, y, 1);
    bar.fg.position.set(left, y, 2); // in front of the background
    bar.bg.scale.set(HP_BAR_WIDTH, HP_BAR_HEIGHT, 1);
    bar.fg.scale.set(HP_BAR_WIDTH * frac, HP_BAR_HEIGHT, 1);
    // Fill hue runs red (low) -> green (full).
    (bar.fg.material as SpriteMaterial).color.setHSL(0.33 * frac, 0.85, 0.5);
  }

  // Left-anchored quads (center x = 0) so the fill grows rightward from `left`.
  createHpBar(): HpBar {
    const bg = new Sprite(
      new SpriteMaterial({
        color: HP_BAR_BG_COLOR,
        transparent: true,
        opacity: 0.6,
        depthTest: false,
      }),
    );
    bg.center.set(0, 0.5);
    const fg = new Sprite(
      new SpriteMaterial({ transparent: true, depthTest: false }),
    );
    fg.center.set(0, 0.5);
    this.sceneOrtho.add(bg);
    this.sceneOrtho.add(fg);
    return { bg, fg };
  }

  hideHpBar(id: number): void {
    const bar = this.hpBars.get(id);
    if (bar) {
      bar.bg.visible = false;
      bar.fg.visible = false;
    }
  }

  removeHpBar(id: number): void {
    const bar = this.hpBars.get(id);
    if (!bar) {
      return;
    }
    this.sceneOrtho.remove(bar.bg);
    this.sceneOrtho.remove(bar.fg);
    bar.bg.material.dispose();
    bar.fg.material.dispose();
    this.hpBars.delete(id);
  }

  // Show the target label (creating on first use) left-anchored at `leftX`, with
  // the NAME line centered on `centerY` (the target square). The vertical anchor is
  // set from the name line's position so the level tag overhangs above and the
  // distance below without shifting the callsign off the square. The texture is
  // regenerated only when the displayed text (level + name + distance) changes.
  updateNamePlate(
    level: number | undefined,
    name: string,
    distance: string,
    leftX: number,
    centerY: number,
  ): void {
    if (!this.namePlate) {
      this.namePlate = new Sprite(
        new SpriteMaterial({ transparent: true, depthTest: false }),
      );
      this.sceneOrtho.add(this.namePlate);
    }

    const text = `${level ?? ''}|${name}|${distance}`;
    if (text !== this.namePlateText) {
      this.namePlateText = text;
      const { texture, width, height, nameCenterY } = makeLabelTexture(
        level,
        name,
        distance,
      );
      const material = this.namePlate.material as SpriteMaterial;
      material.map?.dispose();
      material.map = texture;
      material.needsUpdate = true;
      this.namePlate.scale.set(width * LABEL_SCALE, height * LABEL_SCALE, 1);
      // Anchor left edge (x=0), name-line center vertically. Sprite center y is
      // bottom-up while the canvas is top-down, hence 1 - fraction.
      this.namePlate.center.set(0, 1 - nameCenterY / height);
    }

    this.namePlate.visible = true;
    this.namePlate.position.set(leftX, centerY, 3); // above hp bar (2), reticle (1)
  }

  hideNamePlate(): void {
    if (this.namePlate) {
      this.namePlate.visible = false;
    }
  }

  // Place (creating on first use) the lead ring at `lead` and stretch its guide
  // line from the ship's reticle at `anchor` to the ring. Both live at z=4 in the
  // ortho HUD scene — above the reticle (1), HP bar (2), and name plate (3).
  updateLead(
    id: number,
    anchor: { x: number; y: number },
    lead: { x: number; y: number },
  ): void {
    let marker = this.leadMarkers.get(id);
    if (!marker) {
      marker = this.createLead();
      this.leadMarkers.set(id, marker);
    }

    marker.ring.position.set(lead.x, lead.y, 4);

    const positions = marker.line.geometry.getAttribute(
      'position',
    ) as BufferAttribute;
    positions.setXYZ(0, anchor.x, anchor.y, 4);
    positions.setXYZ(1, lead.x, lead.y, 4);
    positions.needsUpdate = true;
    // Dash spacing is driven by per-vertex line distances; recompute them each
    // time the endpoints move or the dashes stretch/smear as the gap changes.
    marker.line.computeLineDistances();
  }

  createLead(): LeadMarker {
    const ring = new Sprite(
      new SpriteMaterial({
        map: this.ringTexture,
        color: LEAD_COLOR,
        transparent: true,
        depthTest: false,
      }),
    );
    ring.center.set(0.5, 0.5);
    ring.scale.set(30, 30, 1);

    const geometry = new BufferGeometry();
    geometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array(6), 3),
    );
    const line = new Line(
      geometry,
      new LineDashedMaterial({
        color: LEAD_COLOR,
        transparent: true,
        opacity: 0.7,
        depthTest: false,
        dashSize: 8,
        gapSize: 6,
      }),
    );
    // The endpoints are rewritten every frame; skip culling on a stale bounds.
    line.frustumCulled = false;

    this.sceneOrtho.add(line);
    this.sceneOrtho.add(ring);
    return { ring, line };
  }

  removeLead(id: number): void {
    const marker = this.leadMarkers.get(id);
    if (!marker) {
      return;
    }
    this.sceneOrtho.remove(marker.ring);
    this.sceneOrtho.remove(marker.line);
    marker.ring.material.dispose();
    marker.line.geometry.dispose();
    (marker.line.material as LineDashedMaterial).dispose();
    this.leadMarkers.delete(id);
  }

  onWindowResize(): void {
    this.halfWidth = window.innerWidth / 2;
    this.halfHeight = window.innerHeight / 2;

    this.cameraOrtho.left = -this.halfWidth;
    this.cameraOrtho.right = this.halfWidth;
    this.cameraOrtho.top = this.halfHeight;
    this.cameraOrtho.bottom = -this.halfHeight;
    this.cameraOrtho.updateProjectionMatrix();

    this.sceneManager.renderer.setSize(this.halfWidth * 2, this.halfHeight * 2);
  }
}
