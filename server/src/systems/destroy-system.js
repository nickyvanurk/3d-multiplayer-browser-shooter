import { System } from 'ecsy';

import Messages from '../../../shared/messages';

import { Connection } from '../../../shared/components/connection';
import { Playing } from '../../../shared/components/playing';
import { Destroy } from '../components/destroy';
import { Respawn } from '../components/respawn';
import { SpaceshipController } from '../../../shared/components/spaceship-controller';
import { Transform } from '../components/transform';
import { Kind } from '../../../shared/components/kind';
import { Weapons } from '../components/weapons';

export class DestroySystem extends System {
  static queries = {
    entities: {
      components: [Destroy]
    }
  };

  init(worldServer) {
    this.worldServer = worldServer;
  }

  execute(_delta, _time) {
    this.queries.entities.results.forEach((entity) => {
      if (entity.hasComponent(Connection)) {
        if (entity.hasComponent(Playing)) {
          this.worldServer.broadcast(new Messages.Despawn(entity.id), entity.id);
        }
      } else {
          this.worldServer.broadcast(new Messages.Despawn(entity.id));
      }

      if (entity.hasComponent(Respawn)) {
        const timer = entity.getComponent(Respawn).timer;

        // Currently can only respawn spaceship players
        if (entity.hasComponent(SpaceshipController)) {
          const controller = entity.getComponent(SpaceshipController);

          if (controller.hasPlayerAttached()) {
            const connection = controller.player.getComponent(Connection).value;

            if (entity.hasComponent(Weapons)) {
              const weapons = entity.getComponent(Weapons).primary;
              weapons.forEach(entity => entity.remove());
            }

            setTimeout(() => {
                const spaceship = this.worldServer.addPlayer(connection.id);
                const { position, rotation, scale } = spaceship.getComponent(Transform);
                const kind = spaceship.getComponent(Kind).value;

                connection.pushMessage(new Messages.Welcome(
                  spaceship.id,
                  'todo: decouple playerObject from Welcome msg',
                  kind,
                  position,
                  rotation,
                  scale
                ));

                this.worldServer.broadcast(new Messages.Spawn(
                  spaceship.id,
                  kind,
                  position,
                  rotation,
                  scale
                ), connection.id);
            }, timer);
          }
        }
      }

      entity.remove();
    });
  }
}
