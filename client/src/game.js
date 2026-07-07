import * as workerInterval from './worker-interval.js';

import { World } from '../../shared/sim/world.js';
import Connection from './connection.js';

import { SceneManager } from './render/scene-manager.js';
import { ViewRegistry } from './render/view-registry.js';
import { ProjectionService } from './render/projection.js';
import { HudService } from './render/hud.js';
import { AimAssistService } from './render/aim-assist.js';
import { ParticleService } from './render/particles.js';
import { RangeService } from './render/range.js';
import { InputController } from './input/input-controller.js';
import { DEFAULT_KEYBINDINGS } from './input/keybindings.js';
import { NetworkClient } from './net/network-client.js';

// Plain OOP game. Owns the sim mirror World, the presentation layer,
// and the NetworkClient. The client does NOT simulate: entities only hold the
// latest server transform, and rendering interpolates between the last two.
export default class Game {
  constructor() {
    this.updatesPerSecond = 60;
    this.lastTime = performance.now();
    this.lastUpdate = performance.now();

    this.world = new World();
    this.connection = new Connection();

    this.sceneManager = new SceneManager();
    this.viewRegistry = new ViewRegistry(this.sceneManager);
    this.viewRegistry.attachTo(this.world);

    this.inputController = new InputController(this.sceneManager.camera, DEFAULT_KEYBINDINGS);

    this.projection = new ProjectionService(this.world, this.sceneManager);
    this.particles = new ParticleService(this.sceneManager);
    this.hud = new HudService(this.world, this.sceneManager, this.projection);
    this.aimAssist = new AimAssistService(this.world, this.sceneManager, this.inputController, this.projection);
    this.range = new RangeService(this.world, this.sceneManager);

    this.viewRegistry.onShipDestroyed = (position) => this.particles.spawnExplosion(position);

    this.networkClient = new NetworkClient(this.connection, this.world, this.sceneManager.camera);

    this.connection.onConnection(() => console.log('Connected to server'));
    this.connection.onDisconnect(() => console.log('Disconnected from server'));
    this.connection.onError((error) => console.log(error));
  }

  async init() {
    await this.viewRegistry.load();

    this.lastTime = performance.now();
    this.lastUpdate = performance.now();

    workerInterval.setInterval(this.update.bind(this), 1000 / this.updatesPerSecond);
    requestAnimationFrame(this.render.bind(this));
  }

  update() {
    const time = performance.now();
    let delta = time - this.lastTime;

    if (delta > 250) {
      delta = 250;
    }

    this.networkClient.processMessages(delta);
    const input = this.inputController.sample();
    this.aimAssist.update();
    this.particles.update();
    this.range.update();
    this.networkClient.sendInput(input);

    this.lastUpdate = performance.now();
    this.lastTime = time;
  }

  render() {
    requestAnimationFrame(this.render.bind(this));

    if (document.hidden) {
      return;
    }

    const alpha = (performance.now() - this.lastUpdate) / (1000 / this.updatesPerSecond);

    this.viewRegistry.update(alpha);
    this.sceneManager.render(alpha);
    this.projection.render();
    this.hud.render();
  }
}
