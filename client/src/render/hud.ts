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
  Box3,
  Sphere,
} from 'three';
import type { Texture } from 'three';

import Types from '../../../shared/types.ts';
import type { EntityKind } from '../../../shared/types.ts';
import type { World } from '../../../shared/sim/world.ts';
import type { Entity } from '../../../shared/sim/entity.ts';
import type { SceneManager } from './scene-manager.ts';
import type { ViewRegistry } from './view-registry.ts';
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
const RETICLE_COLOR_ENEMY = 0xb9524c; // muted red, matching the lead marker
const RETICLE_COLOR_VENDOR = 0xd1a44c; // gold, for the neutral vendor
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
const HP_BAR_GAP = 9; // px between the reticle's bottom and the bar
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
  viewRegistry: ViewRegistry;
  // World-space bounding radius of each ship model at scale 1, computed once per
  // kind from its loaded model and multiplied by the entity's scale on use.
  modelRadii: Map<EntityKind, number>;
  private readonly scratchBox: Box3;
  private readonly scratchSphere: Sphere;

  constructor(
    world: World,
    sceneManager: SceneManager,
    projection: ProjectionService,
    viewRegistry: ViewRegistry,
  ) {
    this.world = world;
    this.sceneManager = sceneManager;
    this.projection = projection;
    this.viewRegistry = viewRegistry;
    this.modelRadii = new Map();
    this.scratchBox = new Box3();
    this.scratchSphere = new Sphere();

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

      // Same behaviour as ships (edge marker off-screen, reticle once on-screen),
      // but the vendor gets its own edge sprite and its own reticle colour so it
      // never reads as an enemy.
      const entity = this.world.get(Number(id));
      const isVendor = entity?.type === Types.Entities.VENDOR;

      if (transform2d.onscreen) {
        // On-screen: draw the line-bracket reticle (sized to the ship, grows as
        // it nears) and hide the sprite edge marker.
        indicator.visible = false;
        const diameter =
          this.reticleDiameter(Number(id)) ?? RETICLE_FALLBACK_DIAMETER_PX;
        this.updateReticle(
          Number(id),
          transform2d.position,
          diameter,
          isVendor,
        );

        // The lead ring only makes sense while its ship is drawn as a reticle
        // (you are looking at it). Anchor the guide line at the reticle.
        const lead = this.projection.leads.get(Number(id));
        if (lead) {
          this.updateLead(Number(id), transform2d.position, lead);
        } else {
          this.removeLead(Number(id));
        }

        // Enemy HP bar below the reticle, only for the aimed-at ship. Vendor is
        // undamageable, so it never gets one.
        this.updateHealthBar(
          Number(id),
          entity,
          isVendor,
          transform2d.position,
          diameter,
          aimedShipId === Number(id),
        );
      } else {
        // Off-screen: the clamped edge marker sprite; hide the reticle.
        indicator.visible = true;
        indicator.material = new SpriteMaterial({
          map: isVendor ? this.textures.vendor : this.textures.spaceship,
        });
        indicator.position.set(x, y, 1);
        this.resetToArrowScale(indicator);
        this.hideReticle(Number(id));
        this.removeLead(Number(id));
        this.hideHpBar(Number(id));
      }
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

  // Screen diameter (px) the reticle should span to bracket this ship: its
  // projected size plus spacing. Returns null when it can't be sized (unknown
  // model, or at/behind the camera), so the caller falls back to fixed sizing.
  reticleDiameter(id: number): number | null {
    const entity = this.world.get(id);
    if (!entity) {
      return null;
    }
    const worldRadius = this.shipWorldRadius(entity);
    if (worldRadius <= 0) {
      return null;
    }

    const camera = this.sceneManager.camera;
    const distance = entity.transform.position.distanceTo(camera.position);
    if (distance <= 1e-3) {
      return null;
    }

    // Perspective: the visible world half-height at `distance` maps to half the
    // viewport in pixels, so pixels-per-world-unit = (h/2) / (d·tan(vFov/2)).
    const halfFov = (camera.fov * Math.PI) / 180 / 2;
    const pxPerWorld = window.innerHeight / 2 / (distance * Math.tan(halfFov));
    const radiusPx = worldRadius * pxPerWorld;
    return 2 * (radiusPx * RETICLE_SPACING + RETICLE_PADDING_PX);
  }

  // World-space bounding radius of a ship, from its model's bounding sphere (at
  // scale 1, computed once per kind) times the entity's own scale.
  shipWorldRadius(entity: Entity): number {
    let base = this.modelRadii.get(entity.type);
    if (base === undefined) {
      const model = this.viewRegistry.models.get(entity.type);
      base = model
        ? this.scratchBox
            .setFromObject(model)
            .getBoundingSphere(this.scratchSphere).radius
        : 0;
      this.modelRadii.set(entity.type, base);
    }
    return base * entity.transform.scale;
  }

  // Draw/refresh the corner-bracket reticle centered at `center`, sized so its
  // box spans `diameter` px around the ship. Built from line segments (not a
  // scaled texture), so the strokes stay 1px-crisp and the arms fixed-length at
  // any size. Vendor gets its own colour so it never reads as an enemy.
  updateReticle(
    id: number,
    center: { x: number; y: number },
    diameter: number,
    isVendor: boolean,
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
    material.color.setHex(
      isVendor ? RETICLE_COLOR_VENDOR : RETICLE_COLOR_ENEMY,
    );

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

  // Track this ship's health to spot hits, then show its HP bar below the
  // reticle when it is aimed at or was recently damaged, else hide it. Health is
  // replicated from the server (network-client); the vendor has none.
  updateHealthBar(
    id: number,
    entity: Entity | undefined,
    isVendor: boolean,
    center: { x: number; y: number },
    reticleDiameter: number,
    aimed: boolean,
  ): void {
    const health =
      !isVendor && entity ? (entity as { health?: number }).health : undefined;
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
