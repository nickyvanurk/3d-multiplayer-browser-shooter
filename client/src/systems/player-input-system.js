import { System } from 'ecsy';

import { Connection } from '../../../shared/components/connection';
import { InputState } from '../components/input-state';
import { PlayerController } from '../components/player-controller';
import { PlayerInputState } from '../../../shared/components/player-input-state';

export class PlayerInputSystem extends System {
  static queries = {
    connections: {
      components: [Connection]
    },
    inputState: {
      components: [InputState]
    },
    mainPlayer: {
      components: [PlayerController],
      listen: { added: true }
    }
  };

  execute() {
    this.queries.mainPlayer.added.forEach((entity) => {
      entity.addComponent(PlayerInputState);
    });

    const inputStateEntity = this.queries.inputState.results[0];
    const mainPlayerEntity = this.queries.mainPlayer.results[0];

    if (!inputStateEntity || !mainPlayerEntity) {
      return;
    }

    const {
      keysDown,
      mousePosition,
      mouseButtonsDown
    } = inputStateEntity.getComponent(InputState);
    const {
      strafeLeft,
      strafeRight,
      strafeUp,
      strafeDown,
      forward,
      backward,
      rollLeft,
      rollRight,
      boost,
      weaponPrimary
    } = mainPlayerEntity.getComponent(PlayerController);
    const playerInputState = mainPlayerEntity.getMutableComponent(PlayerInputState);

    playerInputState.movementX = keysDown.includes(strafeLeft) ? -1 : keysDown.includes(strafeRight) ? 1 : 0;
    playerInputState.movementY = keysDown.includes(strafeUp) ? 1 : keysDown.includes(strafeDown) ? -1 : 0;
    playerInputState.movementZ = keysDown.includes(forward) ? -1 : keysDown.includes(backward) ? 1 : 0;
    playerInputState.roll = keysDown.includes(rollLeft) ? -1 : keysDown.includes(rollRight) ? 1 : 0;
    playerInputState.yaw = parseFloat(mousePosition.x);
    playerInputState.pitch = parseFloat(mousePosition.y);
    playerInputState.boost = keysDown.includes(boost);
    playerInputState.weaponPrimary = mouseButtonsDown.includes(weaponPrimary);
  }
}
