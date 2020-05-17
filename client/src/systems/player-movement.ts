import {System} from 'ecsy';
import {PlayerInputState} from '../components/player-input-state';
import {Position} from '../components/position';

export class PlayerMovement extends System {
  static queries: any = {
    players: {
      components: [PlayerInputState, Position]
    }
  };

  init() {

  }

  execute(delta: number) {
    this.queries.players.results.forEach((entity: any) => {
      const input = entity.getMutableComponent(PlayerInputState);
      const position = entity.getMutableComponent(Position);

      position.x += input.movementX;
      position.y += input.movementY;
      position.z += input.movementZ;
    });
  }
}
