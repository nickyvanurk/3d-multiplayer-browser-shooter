import {System, Entity} from 'ecsy';
import {InputState} from '../components/input-state';
import {PlayerController} from '../components/player-controller';
import {PlayerInputState} from '../components/player-input-state';
import {Weapon} from '../components/weapon';
import {Active} from '../components/active';

export class PlayerInput extends System {
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
      components: [PlayerController, Weapon]
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

    const activeWeapon = inputState.mouseButtonsDown.includes(playerController.weapon);

    this.queries.playersWithWeapons.results.forEach((playerEntity: Entity) => {
      const weapon = playerEntity.getMutableComponent(Weapon).value;

      if (activeWeapon) {
        if (!weapon.hasComponent(Active)) {
          weapon.addComponent(Active);
        }
      } else if (weapon.hasComponent(Active)) {
        weapon.removeComponent(Active);
      }
    });
  }
}
