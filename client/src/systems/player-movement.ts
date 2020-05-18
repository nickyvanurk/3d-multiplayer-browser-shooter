import {System} from 'ecsy';
import {PlayerInputState} from '../components/player-input-state';
import {Transform} from '../components/transform';

export class PlayerMovement extends System {
  static queries: any = {
    players: {
      components: [PlayerInputState, Transform]
    }
  };

  init() {

  }

  execute(delta: number) {
    this.queries.players.results.forEach((entity: any) => {
      const input = entity.getMutableComponent(PlayerInputState);
      const position = entity.getMutableComponent(Transform).position;

      position.x += input.movementX;
      position.y += input.movementY;
      position.z += input.movementZ;
    });
  }
}
