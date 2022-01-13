import { createWorld, addEntity, addComponent, pipe } from 'bitecs';
import { Input, Keybindings, Position } from './components';
import {
  TimeSystem,
  InputSystem,
  ControllerSystem,
} from './systems';
import * as Utils from './utils';

export default class Game {
  constructor() {
    this.world = createWorld();
    this.world.time = { delta: 0, elapsed: 0, then: performance.now() }
    this.timeSystem = TimeSystem;

    this.systems = pipe(
      InputSystem,
      ControllerSystem,
    );
    this.fixedSystems = pipe(
    );
    this.renderSystems = pipe(
    );

    this.fixedUpdate = Utils.createFixedTimestep(1/60, this.fixedUpdate.bind(this));
    requestAnimationFrame(this.update.bind(this));

    this.reset();
  }

  reset() {
  }

  update(now) {
    requestAnimationFrame(this.update.bind(this));
    this.timeSystem(this.world, now);

    if (this.world.time.delta > 1) { // 1 second
      // Tab is being throttled; current tab is not active
      return this.reset();
    }

    this.systems(this.world, this.world.delta);
    const alpha = this.fixedUpdate(this.world.time.delta, this.world.time.elapsed);
    this.render(this.world.time.delta, alpha);
  }

  fixedUpdate(fixedDelta) {
    this.fixedSystems(this.world, fixedDelta);
  }

  render(delta, alpha) {
    this.renderSystems(this.world, delta, alpha);
  }

  createPlayer() {
    this.playerId = addEntity(this.world);

    addComponent(this.world, Keybindings, this.playerId);
    addComponent(this.world, Input, this.playerId);
    addComponent(this.world, Position, this.playerId);
  }
}
