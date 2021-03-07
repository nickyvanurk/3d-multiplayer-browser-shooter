import { System } from 'ecsy';
import { Object3D } from 'three';

import Types from '../../../shared/types';
import Messages from '../../../shared/messages';
import { Connection } from '../../../shared/components/connection';
import { Transform } from '../components/transform';
import { Camera } from '../components/camera';
import { Player } from '../components/player';

import { ParticleEffect, ParticleEffectType } from '../components/particle-effect.js';

export class NetworkEventSystem extends System {
  static queries = {
    connections: {
      components: [Connection]
    },
    camera: {
      components: [Camera, Transform]
    },
    mainPlayer: {
      components: [Player]
    }
  };

  init(game) {
    this.game = game;
  }

  execute(delta) {
    this.queries.connections.results.forEach((entity) => {
      const connection = entity.getComponent(Connection).value;

      while (connection.hasIncomingMessage()) {
        const message = connection.popMessage();

        switch (message.type) {
          case Types.Messages.GO:
            connection.pushMessage(new Messages.Hello('Nicky'));
            break;
          case Types.Messages.WELCOME: {
            const { id, kind, position, rotation, scale } = message.data;
            console.log(`my id: ${id}`);
            this.game.addPlayer(id, kind, position, rotation, scale);

            break;
          }
          case Types.Messages.SPAWN: {
            const { id, kind, position, rotation, scale } = message.data;
            console.log(`spawn id ${id}`);
            this.game.addEntity(id, kind, position, rotation, scale);
            break;
          }
          case Types.Messages.DESPAWN: {
            const { id } = message.data;
            console.log(`despawn id ${id}`);
            this.game.removeEntity(id);
            break;
          }
          case Types.Messages.WORLD: {
            const entities = message.data;

            for (let i = 0; i < entities.length; ++i) {
              const entity = this.game.entities[entities[i].id];

              if (!entity) {
                console.error(`Entity${i} doesn't exist on client`);
                continue;
              }

              const transform = entity.getMutableComponent(Transform);
              transform.position.copy(entities[i].position);
              transform.rotation.copy(entities[i].rotation);

              const mainPlayerEntity = this.queries.mainPlayer.results[0];

              if (entity == mainPlayerEntity) {
                // TODO: Use CameraSystem when client-side prediction
                const cameraEntity = this.queries.camera.results[0];
                const mainPlayerTransform = mainPlayerEntity.getComponent(Transform);
                const cameraTransform = cameraEntity.getMutableComponent(Transform);

                const obj = new Object3D();
                obj.position.copy(mainPlayerTransform.position);
                obj.quaternion.copy(mainPlayerTransform.rotation);
                obj.translateY(1);
                obj.translateZ(4);

                cameraTransform.position.lerp(obj.position, 1 - Math.exp(-10 * (delta/1000)));
                cameraTransform.rotation.slerp(obj.quaternion, 1 - Math.exp(-10 * (delta/1000)));
              }
            }
            break;
          }
        }
      }
    });
  }
}
