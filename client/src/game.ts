import Utils from '../../shared/utils.ts';
import Types from '../../shared/types.ts';
import { World } from '../../shared/sim/world.ts';
import { InputCommand } from '../../shared/sim/input.ts';
import { RapierPhysicsWorld } from '../../shared/sim/physics/rapier-physics-world.ts';
import Connection from './connection.ts';

import { BrowserMeshProvider } from './physics/browser-mesh-provider.ts';
import { ClientSim } from './client-sim.ts';

import { SceneManager } from './render/scene-manager.ts';
import { ViewRegistry } from './render/view-registry.ts';
import { ProjectionService } from './render/projection.ts';
import { HudService } from './render/hud.ts';
import { AimAssistService } from './render/aim-assist.ts';
import { ParticleService } from './render/particles.ts';
import { OrePickupService } from './render/ore-pickups.ts';
import { RangeService } from './render/range.ts';
import { InputController } from './input/input-controller.ts';
import { DEFAULT_KEYBINDINGS } from './input/keybindings.ts';
import { NetworkClient } from './net/network-client.ts';
import { SoundService } from './audio/sound-service.ts';
import { DebugPanel } from './debug/debug-panel.ts';
import { SettingsStore } from './settings.ts';
import { consumeFirstVisit } from './first-visit.ts';
import { getPlayerName } from './player-name.ts';
import { SettingsMenu } from './ui/settings-menu.ts';
import { MusicPlayer, defaultPlaylist } from './audio/music-player.ts';
import { MusicPlayerHud } from './ui/music-player-hud.ts';
import { VendorHud } from './ui/vendor-hud.ts';
import { ShopHud } from './ui/shop-hud.ts';
import { PlayerHud } from './ui/player-hud.ts';
import { LeaderboardHud } from './ui/leaderboard-hud.ts';
import { HitMarker } from './ui/hit-marker.ts';
import { StatsHud } from './ui/stats-hud.ts';

// Plain OOP game. Owns the mirror World, the presentation layer, the client
// physics world, the NetworkClient, and the client-authoritative ClientSim.
//
// A single requestAnimationFrame loop drives everything: it advances the sim in
// fixed-dt sub-steps (a shared accumulator, matching the server) and renders,
// interpolating between the last two sim states by the leftover accumulator
// fraction. There is no separate worker interval; a backgrounded tab (rAF
// paused) simply pauses the sim.
export default class Game {
  updatesPerSecond: number;
  lastTime: number;
  world: World;
  connection: Connection;
  physics!: RapierPhysicsWorld;
  clientSim!: ClientSim;
  sceneManager: SceneManager;
  viewRegistry: ViewRegistry;
  inputController: InputController;
  projection: ProjectionService;
  particles: ParticleService;
  orePickups: OrePickupService;
  hud: HudService;
  aimAssist: AimAssistService;
  range: RangeService;
  networkClient: NetworkClient;
  sound: SoundService;
  debug: DebugPanel;
  settings: SettingsStore;
  settingsMenu: SettingsMenu;
  music: MusicPlayer;
  musicHud: MusicPlayerHud;
  vendorHud: VendorHud;
  shopHud: ShopHud;
  playerHud: PlayerHud;
  leaderboardHud: LeaderboardHud;
  hitMarker: HitMarker;
  statsHud: StatsHud;
  // Smoothed frames-per-second for the stats overlay (EMA of 1000/frameDelta).
  fps = 0;
  // Hitmarker cue level/pitch, tunable live from the F3 panel.
  hitVolume = 0.45;
  hitPitch = 2;
  // Ship-destruction explosion cue level/pitch, tunable live from the F3 panel.
  explosionVolume = 1.8;
  explosionPitch = 0.8;
  // Local-ship engine loops: a low idle-thrust rumble while translating and a
  // louder roar while boosting. Volume/pitch tunable live from the F3 panel.
  engineMoveVolume = 0.08;
  engineMovePitch = 0.75;
  engineBoostVolume = 0.32;
  engineBoostPitch = 1.2;
  fixedStep = 1000 / 60;
  fixedUpdate!: (delta: number) => number;
  // Flips true once models + physics + the client sim are ready. Until then the
  // render loop only paints the background + starfield; the sim/network stay
  // idle so an empty, un-simulated world never steps.
  simReady = false;
  currentInput: InputCommand = InputCommand.empty();
  // Accumulator remainder / fixedStep — the render interpolation fraction [0,1).
  leftoverFrac = 0;

  constructor() {
    this.updatesPerSecond = 60;
    this.lastTime = performance.now();

    this.world = new World();
    this.connection = new Connection();

    this.settings = new SettingsStore();
    this.sceneManager = new SceneManager(this.settings.horizontalFov);
    this.viewRegistry = new ViewRegistry(this.sceneManager);
    this.viewRegistry.attachTo(this.world);

    this.inputController = new InputController(
      this.sceneManager.camera,
      DEFAULT_KEYBINDINGS,
    );

    this.projection = new ProjectionService(
      this.world,
      this.sceneManager,
      this.viewRegistry,
    );
    this.particles = new ParticleService(this.sceneManager);
    this.orePickups = new OrePickupService(this.sceneManager);
    // Each chunk throws a small, subtle dust puff where it breaks off — enough to
    // sell the impact, not enough to flag a sneaky miner from across the field.
    this.orePickups.onSpawn = (position) =>
      this.particles.spawnDust(position, 40);
    this.hud = new HudService(this.world, this.sceneManager, this.projection);
    this.aimAssist = new AimAssistService(
      this.world,
      this.sceneManager,
      this.inputController,
      this.projection,
    );
    this.range = new RangeService(this.world, this.sceneManager);
    this.sound = new SoundService(
      this.sceneManager.camera,
      this.sceneManager.scene,
    );
    this.debug = new DebugPanel();
    this.settingsMenu = new SettingsMenu(
      this.settings,
      this.sceneManager,
      this.inputController,
    );

    this.music = new MusicPlayer(defaultPlaylist(), consumeFirstVisit());
    this.musicHud = new MusicPlayerHud(this.music);
    this.hitMarker = new HitMarker();
    this.statsHud = new StatsHud();

    this.viewRegistry.onShipDestroyed = (position) => {
      this.particles.spawnExplosion(position);
      // refDistance well above the blaster/hit cues so the blast reads big and
      // carries, but low enough that it tapers with distance before the 1km
      // cutoff (playAt's default) rather than hard-cutting at full volume.
      this.sound.playAt(
        'explosion',
        position,
        this.explosionVolume,
        this.explosionPitch,
        300,
      );
    };

    this.networkClient = new NetworkClient(
      this.connection,
      this.world,
      this.sceneManager.camera,
      this.settings,
      getPlayerName(),
    );

    // Vendor docking prompt (proximity only). The owner-only Stats/Loadout streams
    // are mirrored straight onto the owned ship by NetworkClient, so the shop and
    // player HUD read economy state live off the entity — no dedicated feed here.
    this.vendorHud = new VendorHud(
      this.world,
      () => this.networkClient.localPlayerId,
    );

    // The shop modal (F to open while docked): sell/repair/buy/equip, all routed
    // to the server. Gated on the vendor docking range the VendorHud computes.
    this.shopHud = new ShopHud(
      this.world,
      () => this.networkClient.localPlayerId,
      this.inputController,
      () => this.vendorHud.isInRange(),
      this.networkClient,
    );

    // Bottom-centre pilot status (hull hero + cargo/credits). Reads the owned
    // ship directly each frame, so it needs no dedicated feed.
    this.playerHud = new PlayerHud(
      this.world,
      () => this.networkClient.localPlayerId,
    );

    // Top-right standings, fed by the throttled Leaderboard message.
    this.leaderboardHud = new LeaderboardHud();

    // Progression: the owner's level/xp drive the HUD badge + XP bar. xpForNext is
    // the cost of the current level, so the bar fraction is xp / xpForNext.
    this.networkClient.onProgress = (p) => {
      this.playerHud.setLevel(p.level);
      this.playerHud.setXp(p.xpForNext > 0 ? p.xp / p.xpForNext : 0);
    };
    this.networkClient.onLeaderboard = (lb) => this.leaderboardHud.update(lb);

    this.connection.onConnection(() => {
      console.log('Connected to server');
      this.networkClient.resetSync();
    });
    this.connection.onDisconnect(() => console.log('Disconnected from server'));
    this.connection.onError((error) => console.log(error));
  }

  async init(): Promise<void> {
    // Paint immediately: start the render loop before any asset finishes so the
    // dark starfield shows on the first frame instead of after the whole load.
    // frame() only renders the background until `simReady`.
    this.lastTime = performance.now();
    requestAnimationFrame(this.frame.bind(this));

    // Essential meshes only (ship + asteroid field); projectile and the far-away
    // vendor stream in afterwards and fill in their view/body on arrival (see
    // ViewRegistry). Audio + music are started AFTER simReady below so they never
    // compete for bandwidth with the assets that gate getting in-game.
    await this.viewRegistry.load();

    // The client runs its own Rapier world (all ships + the static asteroid
    // field). Meshes come from the GLTF scenes the renderer already loaded.
    // reconcileShips is off: the client manages ship bodies itself.
    this.physics = new RapierPhysicsWorld(
      new BrowserMeshProvider(this.viewRegistry.models),
    );
    this.physics.reconcileShips = false;
    // The owned ship self-controls (roll etc. accumulate in its velocity fields);
    // the client never broadcasts, so don't overwrite them from the solver.
    this.physics.writeBackVelocity = false;
    await this.physics.init();
    this.world.physics = this.physics;

    this.clientSim = new ClientSim(this.world, this.physics);
    this.clientSim.onFire = (bullet) => this.networkClient.sendFire(bullet);
    // Predicted enemy hit: project the world impact point to the screen, flash
    // the hitmarker there and play the hit cue right away (server still owns the
    // authoritative damage).
    this.clientSim.onHitEnemy = (impact) => {
      const camera = this.sceneManager.camera;
      const ndc = impact.clone().project(camera);
      const x = (ndc.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-ndc.y * 0.5 + 0.5) * window.innerHeight;
      this.hitMarker.trigger(x, y);
      this.sound.play('hit', this.hitVolume, this.hitPitch);
    };
    // Every shot that strikes a rock kicks up a small dust puff at the impact.
    this.clientSim.onHitAsteroid = (impact) =>
      this.particles.spawnDust(impact, 22);
    // Client-side hit detection: forward our predicted hit to the server, which
    // validates + applies the authoritative damage.
    this.clientSim.onHit = (targetId, damage, miningFactor, impact) =>
      this.networkClient.sendHit(targetId, damage, miningFactor, impact);
    this.networkClient.onLocalShip = (ship) => {
      this.clientSim.setOwnedShip(ship);
      // The player is in the sector — drop the boot message.
      this.hideBootOverlay();
    };
    // A Loadout change (buy/equip) rebuilds the owned ship's weapons so the mining
    // laser is mounted/removed in the secondary slot.
    this.networkClient.onLoadout = () => this.clientSim.rebuildLoadout();
    // Ore field mirrors the server: render each chunk where it broke off, and
    // drop it the moment the server confirms someone scooped it.
    this.networkClient.onOreDrop = (id, position) =>
      this.orePickups.spawn(id, position, performance.now());
    this.networkClient.onCollect = (id) => this.orePickups.collect(id);
    // A remote player fired: spawn a cosmetic tracer that flies + self-raycasts
    // locally (stops on geometry, does no damage).
    this.networkClient.onShot = (position, rotation, speed, shooterId) =>
      this.clientSim.spawnRemoteTracer(position, rotation, speed, shooterId);

    // The vendor mesh is deprioritized, so a VENDOR may spawn before its model
    // (and thus its convex hull) exists. Add its physics body only once the mesh
    // has streamed in; ViewRegistry fires onModelReady when that happens.
    this.viewRegistry.onModelReady = (kind) => {
      if (kind !== Types.Entities.VENDOR) {
        return;
      }
      for (const entity of this.world.entities.values()) {
        if (entity.type === Types.Entities.VENDOR && !entity.body) {
          this.clientSim.onSpawn(entity);
        }
      }
    };

    // Compose the client physics/ownership hooks on top of ViewRegistry's
    // (attached in the constructor): every spawn/despawn drives both.
    const viewSpawn = this.world.onSpawn;
    const viewDespawn = this.world.onDespawn;
    this.world.onSpawn = (entity) => {
      viewSpawn?.(entity);
      // Defer the vendor's physics body until its (deprioritized) mesh loads —
      // the view is already queued; onModelReady adds the body. Everything else
      // gets its body now.
      if (
        entity.type !== Types.Entities.VENDOR ||
        this.viewRegistry.hasModel(Types.Entities.VENDOR)
      ) {
        this.clientSim.onSpawn(entity);
      }
      // Blaster on every bullet spawn. Our own shots (owner is the local ship) play
      // 2D so they stay consistent — the listener rides the lerping camera, so a
      // positional own-shot would wander. Everyone else's (remote tracers + bot
      // bullets) play positionally at their muzzle, so you hear them from there.
      if (entity.type === Types.Entities.BULLET) {
        const owner = (entity as { owner?: unknown }).owner;
        if (owner === this.clientSim.ownedShip) {
          this.sound.play('blaster', 0.4);
        } else {
          this.sound.playAt('blaster', entity.transform.position, 0.7);
        }
      }
    };
    this.world.onDespawn = (entity) => {
      viewDespawn?.(entity);
      this.clientSim.onDespawn(entity);
    };

    // Fixed-timestep accumulator (same pattern as the server): steps the sim by
    // a constant dt as many times as real elapsed time allows — even motion, and
    // it catches up after a hitch instead of taking one giant variable step.
    // State is reported once per sim step (not per rendered frame).
    this.fixedStep = 1000 / this.updatesPerSecond;
    this.fixedUpdate = Utils.createFixedTimestep(this.fixedStep, (dt, time) => {
      this.clientSim.update(dt, time, this.currentInput);
      const ship = this.clientSim.ownedShip;
      if (ship) {
        this.networkClient.sendState(ship);
      }
    });

    // Everything the sim/network needs is live: let frame() run the full loop and
    // the player spawn on the next frame.
    this.simReady = true;

    // Only now kick off the non-critical streams — SFX (4.6 MB) and the music
    // stream — so they never fight the spawn-gating models/physics for bandwidth.
    // Weapons/engine stay silent until each clip lands (SoundService no-ops on a
    // missing buffer); music is pure ambiance.
    void this.initAudio();
    this.music.start();

    // ~1 Hz clock-sync probe; TimeSyncManager tracks drift from the rolling window.
    setInterval(() => this.networkClient.sendPing(), 1000);
  }

  private hideBootOverlay(): void {
    document.getElementById('boot-overlay')?.classList.add('hidden');
    // Reveal the HUD (crosshair, hull/cargo, music, stats) now that the ship is
    // in the sector; it was hidden by `body.booting` during the load.
    document.body.classList.remove('booting');
  }

  private async initAudio(): Promise<void> {
    // The blaster pack holds many sounds separated by silence; load splits them
    // into segments. Expose a selector (F3, number keys / clicks) to audition and
    // pick the active one live.
    await this.sound.load(
      'blaster',
      'sfx/freesound_community-blaster-multiple-14893.ogg',
    );
    // Hitmarker cue: a single short clip played on a predicted enemy hit.
    await this.sound.load('hit', 'sfx/hit.ogg');
    // Ship-destruction cue: a single clip played positionally at the wreck.
    await this.sound.load('explosion', 'sfx/Explosion_Small.ogg');
    // Engine loops: continuous 2D voices driven by the local ship's throttle.
    await this.sound.load(
      'engineMove',
      'sfx/Sci-Fi Spaceship Heavy Engine Loop 1.ogg',
    );
    await this.sound.load(
      'engineBoost',
      'sfx/Sci-Fi Spaceship Engine Loop 3.ogg',
    );
    this.sound.setupLoop('engineMove', this.engineMovePitch);
    this.sound.setupLoop('engineBoost', this.engineBoostPitch);
    const blasterCount = this.sound.getSegments('blaster').length;
    // Chosen defaults (tunable live via the F3 panel): sound 1, pitch 2, vol 0.7.
    this.sound.setActive('blaster', 0);
    this.sound.pitch = 2;
    this.sound.volume = 0.7;
    this.debug.addSelector(
      `Blaster sound (⚄=R, 1-${blasterCount})`,
      blasterCount,
      () => this.sound.getActive('blaster'),
      (i) => {
        this.sound.setActive('blaster', i);
        // Audition: a specific pick previews itself; Random previews any one.
        this.sound.preview('blaster', i < 0 ? 0 : i, 0.6);
      },
      true,
    );
    const previewBlaster = () => {
      const a = this.sound.getActive('blaster');
      this.sound.preview('blaster', a < 0 ? 0 : a, 0.6);
    };
    this.debug.addSlider('Pitch', {
      min: 0.5,
      max: 2,
      step: 0.05,
      decKey: 'BracketLeft',
      incKey: 'BracketRight',
      keyHint: '[ ]',
      get: () => this.sound.pitch,
      set: (v) => {
        this.sound.pitch = v;
      },
      onChange: previewBlaster,
    });
    this.debug.addSlider('Volume', {
      min: 0,
      max: 1.5,
      step: 0.05,
      decKey: 'Minus',
      incKey: 'Equal',
      keyHint: '- =',
      get: () => this.sound.volume,
      set: (v) => {
        this.sound.volume = v;
      },
      onChange: previewBlaster,
    });

    // Hit cue: its own volume + pitch, independent of the blaster. Previews the
    // clip on change so you can dial it in by ear.
    const previewHit = () =>
      this.sound.play('hit', this.hitVolume, this.hitPitch);
    this.debug.addSlider('Hit volume', {
      min: 0,
      max: 2,
      step: 0.05,
      decKey: 'Semicolon',
      incKey: 'Quote',
      keyHint: "; '",
      get: () => this.hitVolume,
      set: (v) => {
        this.hitVolume = v;
      },
      onChange: previewHit,
    });
    this.debug.addSlider('Hit pitch', {
      min: 0.5,
      max: 2,
      step: 0.05,
      decKey: 'Comma',
      incKey: 'Period',
      keyHint: ', .',
      get: () => this.hitPitch,
      set: (v) => {
        this.hitPitch = v;
      },
      onChange: previewHit,
    });

    // Explosion cue: its own volume + pitch, auditioned 2D on change.
    const previewExplosion = () =>
      this.sound.play('explosion', this.explosionVolume, this.explosionPitch);
    this.debug.addSlider('Explosion volume', {
      min: 0,
      max: 2,
      step: 0.05,
      decKey: 'KeyG',
      incKey: 'KeyH',
      keyHint: 'G H',
      get: () => this.explosionVolume,
      set: (v) => {
        this.explosionVolume = v;
      },
      onChange: previewExplosion,
    });
    this.debug.addSlider('Explosion pitch', {
      min: 0.5,
      max: 2,
      step: 0.05,
      decKey: 'KeyJ',
      incKey: 'KeyK',
      keyHint: 'J K',
      get: () => this.explosionPitch,
      set: (v) => {
        this.explosionPitch = v;
      },
      onChange: previewExplosion,
    });

    // Engine loops: their own volume + pitch. No preview — you hear them live as
    // you fly; the sliders just retune the running loops.
    this.debug.addSlider('Engine move volume', {
      min: 0,
      max: 1,
      step: 0.02,
      decKey: 'KeyZ',
      incKey: 'KeyX',
      keyHint: 'Z X',
      get: () => this.engineMoveVolume,
      set: (v) => {
        this.engineMoveVolume = v;
      },
    });
    this.debug.addSlider('Engine move pitch', {
      min: 0.5,
      max: 2,
      step: 0.05,
      decKey: 'KeyV',
      incKey: 'KeyB',
      keyHint: 'V B',
      get: () => this.engineMovePitch,
      set: (v) => {
        this.engineMovePitch = v;
        this.sound.setLoopPitch('engineMove', v);
      },
    });
    this.debug.addSlider('Engine boost volume', {
      min: 0,
      max: 1.5,
      step: 0.02,
      decKey: 'KeyN',
      incKey: 'KeyM',
      keyHint: 'N M',
      get: () => this.engineBoostVolume,
      set: (v) => {
        this.engineBoostVolume = v;
      },
    });
    this.debug.addSlider('Engine boost pitch', {
      min: 0.5,
      max: 2,
      step: 0.05,
      decKey: 'KeyO',
      incKey: 'KeyP',
      keyHint: 'O P',
      get: () => this.engineBoostPitch,
      set: (v) => {
        this.engineBoostPitch = v;
        this.sound.setLoopPitch('engineBoost', v);
      },
    });
  }

  frame(): void {
    requestAnimationFrame(this.frame.bind(this));

    const time = performance.now();
    if (document.hidden) {
      // rAF is throttled while hidden; don't accumulate the gap into one huge
      // catch-up burst when the tab comes back.
      this.lastTime = time;
      return;
    }

    let delta = time - this.lastTime;
    if (delta > 250) {
      delta = 250;
    }
    this.lastTime = time;

    // Until models + physics + the client sim are ready, just paint the
    // background + starfield. Nothing to simulate, project, or drive yet.
    if (!this.simReady) {
      this.sceneManager.render(0);
      return;
    }

    this.networkClient.processMessages();

    this.inputController.sample();
    this.aimAssist.update();
    this.currentInput = new InputCommand(this.inputController.input);

    // Advance the sim in fixed sub-steps; leftoverFrac is the interpolation
    // fraction into the next step, always in [0,1).
    this.leftoverFrac = this.fixedUpdate(delta);

    const alpha = Math.min(1, this.leftoverFrac);

    // Camera follows the ship's interpolated pose (same alpha as the mesh) so
    // the ship holds a constant screen offset instead of surging.
    this.networkClient.updateCamera(delta, alpha, this.inputController.orbit);

    // Engine loops off the local throttle: boost roars over everything, otherwise
    // a low rumble while translating (roll alone isn't thrust). updateLoops fades
    // the running voices toward these targets.
    const eng = this.inputController.input;
    const translating =
      eng.forward ||
      eng.backward ||
      eng.strafeLeft ||
      eng.strafeRight ||
      eng.strafeUp ||
      eng.strafeDown;
    this.sound.setLoopTarget(
      'engineBoost',
      eng.boost ? this.engineBoostVolume : 0,
    );
    this.sound.setLoopTarget(
      'engineMove',
      !eng.boost && translating ? this.engineMoveVolume : 0,
    );
    this.sound.updateLoops(delta);

    this.particles.update(delta);
    this.orePickups.update(time);
    this.vendorHud.update();
    this.shopHud.update();
    this.playerHud.update();
    this.range.update();

    // Smooth FPS off the frame delta and refresh the corner readout.
    if (delta > 0) {
      const instant = 1000 / delta;
      this.fps = this.fps === 0 ? instant : this.fps * 0.9 + instant * 0.1;
    }
    this.statsHud.update(
      this.fps,
      this.networkClient.getPing(),
      this.networkClient.isSynced(),
    );

    this.viewRegistry.update(alpha, delta);
    this.sceneManager.render(alpha);
    this.projection.render();
    this.hud.render(this.aimAssist.aimedShipId);
  }
}
