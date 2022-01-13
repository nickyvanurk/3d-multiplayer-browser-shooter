import { createWorld, addEntity, addComponent, pipe } from 'bitecs';
import { Input, Keybindings } from './components/components';
import { KeybindSystem, InputSystem } from './systems/systems';

export default class Game {
  constructor() {
    this.world = createWorld();

    const systems = pipe(
      KeybindSystem,
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
