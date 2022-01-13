import { createWorld, addEntity, addComponent, pipe } from 'bitecs';
import { Input, Keybindings, Position } from './components';
import {
  InputSystem,
  ControllerSystem,
  TimeSystem,
} from './systems';

export default class Game {
  constructor() {
    this.world = createWorld();
    this.world.time = { delta: 0, elapsed: 0, then: performance.now() }

    const systems = pipe(
      InputSystem,
      ControllerSystem,
      TimeSystem,
    );

    setInterval(() => {
      systems(this.world);
    }, 1000/60);
  }

  createPlayer() {
    this.playerId = addEntity(this.world);

    addComponent(this.world, Keybindings, this.playerId);
    addComponent(this.world, Input, this.playerId);
    addComponent(this.world, Position, this.playerId);
  }
}
