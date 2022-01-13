import { createWorld, addEntity, addComponent, pipe } from 'bitecs';
import { Input, Keybindings } from './components';
import { InputSystem } from './systems';

export default class Game {
  constructor() {
    this.world = createWorld();

    const systems = pipe(
      InputSystem,
    );

    setInterval(() => {
      systems(this.world);
    }, 1000/60);
  }

  createPlayer() {
    this.playerId = addEntity(this.world);

    addComponent(this.world, Keybindings, this.playerId);
    addComponent(this.world, Input, this.playerId);
  }
}
