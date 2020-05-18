import {System} from 'ecsy';
import {PlayerInputState} from '../components/player-input-state';
import {Transform} from '../components/transform';
import {Physics} from '../components/physics';
import {NextFrameNormal} from '../components/next-frame-normal';

import createFixedTimestep from 'shared/src/utils/create-fixed-timestep';

export class PlayerMovement extends System {
  static queries: any = {
    players: {
      components: [PlayerInputState, Transform, Physics]
    },
    nextFrameNormal: {
      components: [NextFrameNormal]
    }
  };

  private fixedUpdate: Function;

  init() {
    const timestep = 1000/60;
    this.fixedUpdate = createFixedTimestep(timestep, this.handleFixedUpdate.bind(this));
  }

  execute(delta: number) {
    const nextFrameNormal = this.fixedUpdate(delta);

    this.queries.nextFrameNormal.results.forEach((entity: any) => {
      const _nextFrameNormal = entity.getMutableComponent(NextFrameNormal);
      _nextFrameNormal.value = nextFrameNormal;
    });
  }

  handleFixedUpdate(delta: number) {
    this.queries.players.results.forEach((entity: any) => {
      const input = entity.getMutableComponent(PlayerInputState);
      const transform = entity.getMutableComponent(Transform);
      const physics = entity.getMutableComponent(Physics);

      physics.velocity.x += physics.acceleration*delta * input.movementX;
      physics.velocity.y += physics.acceleration*delta * input.movementY;
      physics.velocity.z += physics.acceleration*delta * input.movementZ;

      transform.position.x += physics.velocity.x*delta;
      transform.position.y += physics.velocity.y*delta;
      transform.position.z += physics.velocity.z*delta;

      physics.velocity.x *= Math.pow(physics.damping, delta/1000);
      physics.velocity.y *= Math.pow(physics.damping, delta/1000);
      physics.velocity.z *= Math.pow(physics.damping, delta/1000);
    });
  }
}
