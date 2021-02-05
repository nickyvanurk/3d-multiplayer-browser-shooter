import { System } from 'ecsy';
import { Vector3, Matrix4 } from 'three';

import { Connection } from '../../../shared/components/connection';
import { InputState } from '../components/input-state';
import { PlayerController } from '../components/player-controller';
import { PlayerInputState } from '../../../shared/components/player-input-state';
import { Camera } from '../components/camera';
import { Object3d } from '../components/object3d';
import { Transform } from '../components/transform';

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
    },
    camera: {
      components: [Camera]
    },
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

    const camera = this.queries.camera.results[0];
    const transform = camera.getComponent(Transform);
    const object3d = camera.getComponent(Object3d).value;

    const position = transform.position;
    const rotation = transform.rotation;

    const direction = new Vector3(mousePosition.x, mousePosition.y, 0.5)
      .applyMatrix4(object3d.projectionMatrixInverse)
      .applyMatrix4(new Matrix4().compose(position, rotation, new Vector3(1, 1, 1)))
      .sub(position).normalize();

    playerInputState.aim = { position, direction };
  }
}
