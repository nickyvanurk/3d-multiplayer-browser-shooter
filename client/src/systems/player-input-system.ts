import {System, Entity} from 'ecsy';
import {InputState} from '../components/input-state';
import {PlayerController} from '../components/player-controller';
import {PlayerInputState} from '../components/player-input-state';
import {Weapons} from '../components/weapons';
import {Active} from '../components/active';

export class PlayerInputSystem extends System {
  static queries: any = {
    inputStates: {
      components: [InputState]
    },
    playerControllers: {
      components: [PlayerController],
      listen: {
        added: true
      }
    },
    playerInputStates: {
      components: [PlayerInputState]
    },
    playersWithWeapons: {
      components: [PlayerController, Weapons]
    }
  };

  execute(delta: number) {
    this.queries.playerControllers.added.forEach((entity: any) => {
      entity.addComponent(PlayerInputState);
    });

    const inputStateEntity = this.queries.inputStates.results[0];
    const playerControllerEntity = this.queries.playerControllers.results[0];
    const playerInputStateEntity = this.queries.playerInputStates.results[0];

    if (!inputStateEntity ||!playerControllerEntity || !playerInputStateEntity) {
      return;
    }

    const inputState = inputStateEntity.getMutableComponent(InputState);
    const playerController = playerControllerEntity.getMutableComponent(PlayerController);
    const playerInputState = playerInputStateEntity.getMutableComponent(PlayerInputState);

    playerInputState.roll = inputState.keysDown.includes(playerController.rollLeft) ? -1 :
                            inputState.keysDown.includes(playerController.rollRight) ? 1 : 0;

    playerInputState.movementX = inputState.keysDown.includes(playerController.strafeLeft) ? 1 :
                                 inputState.keysDown.includes(playerController.strafeRight) ? -1 : 0;

    playerInputState.movementY = inputState.keysDown.includes(playerController.strafeUp) ? 1 :
                                 inputState.keysDown.includes(playerController.strafeDown) ? -1 : 0;

    playerInputState.movementZ = inputState.keysDown.includes(playerController.forward) ? 1 :
                                 inputState.keysDown.includes(playerController.backward) ? -1 : 0;

    playerInputState.yaw = -inputState.mousePosition.x;
    playerInputState.pitch = -inputState.mousePosition.y;

    if (inputState.keysDown.includes(playerController.boost)) {
      playerInputState.movementX *= 2;
      playerInputState.movementY *= 2;
      playerInputState.movementZ *= 2;
    }

    const primaryWeaponActive = inputState.mouseButtonsDown.includes(playerController.weaponPrimary);

    this.queries.playersWithWeapons.results.forEach((playerEntity: Entity) => {
      if (primaryWeaponActive) {
        if (playerEntity.hasComponent(Weapons)) {
          const weapons = playerEntity.getComponent(Weapons).primary;

          weapons.forEach((weaponEntity: Entity) => {
            weaponEntity.addComponent(Active);
          });
        }
      } else if (playerEntity.hasComponent(Weapons)) {
        const weapons = playerEntity.getComponent(Weapons).primary;

        weapons.forEach((weaponEntity: Entity) => {
          if (weaponEntity.hasComponent(Active)) {
            weaponEntity.removeComponent(Active);
          }
        });
      }
    });
  }
}
