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
import { RangeService } from './render/range.ts';
import { InputController } from './input/input-controller.ts';
import { DEFAULT_KEYBINDINGS } from './input/keybindings.ts';
import { NetworkClient } from './net/network-client.ts';
import { SoundService } from './audio/sound-service.ts';
import { DebugPanel } from './debug/debug-panel.ts';

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
  hud: HudService;
  aimAssist: AimAssistService;
  range: RangeService;
  networkClient: NetworkClient;
  sound: SoundService;
  debug: DebugPanel;
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

    this.sceneManager = new SceneManager();
    this.viewRegistry = new ViewRegistry(this.sceneManager);
    this.viewRegistry.attachTo(this.world);

    this.inputController = new InputController(
      this.sceneManager.camera,
      DEFAULT_KEYBINDINGS,
    );

    this.projection = new ProjectionService(this.world, this.sceneManager);
    this.particles = new ParticleService(this.sceneManager);
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

    this.viewRegistry.onShipDestroyed = (position) =>
      this.particles.spawnExplosion(position);

    this.networkClient = new NetworkClient(
      this.connection,
      this.world,
      this.sceneManager.camera,
    );

    this.connection.onConnection(() => console.log('Connected to server'));
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
    this.networkClient.onLocalShip = (ship) =>
      this.clientSim.setOwnedShip(ship);

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

    this.particles.update();
    this.range.update();

    this.viewRegistry.update(alpha);
    this.sceneManager.render(alpha);
    this.projection.render();
    this.hud.render();
  }
}
