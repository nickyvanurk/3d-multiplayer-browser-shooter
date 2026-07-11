import Utils from '../../shared/utils.ts';
import Types from '../../shared/types.ts';
import { World } from '../../shared/sim/world.ts';
import { InputCommand } from '../../shared/sim/input.ts';
import { RapierPhysicsWorld } from '../../shared/sim/physics/rapier-physics-world.ts';
import Connection from './connection.ts';

import { BrowserMeshProvider } from './physics/browser-mesh-provider.ts';
import { ClientSim, CLIENT_ID_BASE } from './client-sim.ts';

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
import { SettingsMenu } from './ui/settings-menu.ts';
import { MusicPlayer, defaultPlaylist } from './audio/music-player.ts';
import { MusicPlayerHud } from './ui/music-player-hud.ts';
import { VendorHud } from './ui/vendor-hud.ts';
import { PlayerHud } from './ui/player-hud.ts';
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
  playerHud: PlayerHud;
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
    this.music.start();

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
    );

    // Economy HUD + vendor trade input, fed by the owner-only Stats stream.
    this.vendorHud = new VendorHud(
      this.world,
      () => this.networkClient.localPlayerId,
      this.networkClient,
    );
    this.networkClient.onStats = (stats) =>
      this.vendorHud.setStats(stats.cargo, stats.cargoCapacity, stats.credits);

    // Bottom-centre pilot status (hull hero + cargo/credits). Reads the owned
    // ship directly each frame, so it needs no dedicated feed.
    this.playerHud = new PlayerHud(
      this.world,
      () => this.networkClient.localPlayerId,
    );

    this.connection.onConnection(() => {
      console.log('Connected to server');
      this.networkClient.resetSync();
    });
    this.connection.onDisconnect(() => console.log('Disconnected from server'));
    this.connection.onError((error) => console.log(error));
  }

  async init(): Promise<void> {
    await this.viewRegistry.load();

    // The blaster pack holds many sounds separated by silence; load splits them
    // into segments. Expose a selector (F3, number keys / clicks) to audition and
    // pick the active one live.
    await this.sound.load(
      'blaster',
      'sfx/freesound_community-blaster-multiple-14893.mp3',
    );
    // Hitmarker cue: a single short clip played on a predicted enemy hit.
    await this.sound.load('hit', 'sfx/hit.mp3');
    // Ship-destruction cue: a single clip played positionally at the wreck.
    await this.sound.load('explosion', 'sfx/Explosion_Small.wav');
    // Engine loops: continuous 2D voices driven by the local ship's throttle.
    await this.sound.load(
      'engineMove',
      'sfx/Sci-Fi Spaceship Heavy Engine Loop 1.wav',
    );
    await this.sound.load(
      'engineBoost',
      'sfx/Sci-Fi Spaceship Engine Loop 3.wav',
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
    this.networkClient.onLocalShip = (ship) =>
      this.clientSim.setOwnedShip(ship);
    // Ore field mirrors the server: render each chunk where it broke off, and
    // drop it the moment the server confirms someone scooped it.
    this.networkClient.onOreDrop = (id, position) =>
      this.orePickups.spawn(id, position, performance.now());
    this.networkClient.onCollect = (id) => this.orePickups.collect(id);

    // Compose the client physics/ownership hooks on top of ViewRegistry's
    // (attached in the constructor): every spawn/despawn drives both.
    const viewSpawn = this.world.onSpawn;
    const viewDespawn = this.world.onDespawn;
    this.world.onSpawn = (entity) => {
      viewSpawn?.(entity);
      this.clientSim.onSpawn(entity);
      // Blaster on every bullet spawn. The local player's own shots (client-range
      // ids) play 2D so they stay consistent — the listener rides the lerping
      // camera, so a positional own-shot would wander. Remote players' shots play
      // positionally at their muzzle, so you hear them from where they are.
      if (entity.type === Types.Entities.BULLET) {
        if (entity.id! >= CLIENT_ID_BASE) {
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

    this.lastTime = performance.now();
    requestAnimationFrame(this.frame.bind(this));

    // ~1 Hz clock-sync probe; TimeSyncManager tracks drift from the rolling window.
    setInterval(() => this.networkClient.sendPing(), 1000);
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
    this.networkClient.updateCamera(delta, alpha);

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
