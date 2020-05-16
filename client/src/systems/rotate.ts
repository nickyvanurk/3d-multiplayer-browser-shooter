import {System} from 'ecsy';
import {Rotation} from '../components/rotation';
import {NextFrameNormal} from '../components/next-frame-normal';

import createFixedTimestep from 'shared/src/utils/create-fixed-timestep';

export class Rotate extends System {
  static queries: any = {
    rotating: {
      components: [Rotation]
    },
    nextFrameNormal: {
      components: [NextFrameNormal]
    }
  };

  public queries: any;
  private fixedUpdate: Function;

  init() {
    this.fixedUpdate = createFixedTimestep(1000/60, this.handleFixedUpdate.bind(this));
  }

  execute(delta: number) {
    const nextFrameNormal = this.fixedUpdate(delta);

    this.queries.nextFrameNormal.results.forEach((entity: any) => {
      const _nextFrameNormal = entity.getMutableComponent(NextFrameNormal);
      _nextFrameNormal.value += nextFrameNormal;
    });
  }

  handleFixedUpdate(delta: number) {
    this.queries.rotating.results.forEach((entity: any) => {
      const rotation = entity.getMutableComponent(Rotation);

      rotation.x += 0.001*delta;
      rotation.y += 0.001*delta;
    });
  }
}
