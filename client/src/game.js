import { createWorld, addEntity, addComponent } from 'bitecs';
import { Input, Keybindings } from './components/components';

export default class Game {
  constructor() {
    this.world = createWorld();
  }

  createPlayer() {
    this.playerId = addEntity(this.world);

    addComponent(this.world, Input, this.playerId);
    addComponent(this.world, Keybindings, this.playerId);
  }
}
