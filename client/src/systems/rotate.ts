import {System} from 'ecsy';
import {Rotation} from '../components/rotation';

export class Rotate extends System {
  static queries: any = {
    rotating: {
      components: [Rotation]
    }
  };

  public queries: any;

  execute(delta: number, time: number) {
    this.queries.rotating.results.forEach((entity: any) => {
      const rotation = entity.getMutableComponent(Rotation);

      rotation.x += 0.001*delta;
      rotation.y += 0.001*delta;
    });
  }
}
