import { System } from 'ecsy';

import Utils from '../../../shared/utils';

import { Transform } from '../components/transform';
import { RandomSpawn } from '../components/random-spawn';

export class SpawnSystem extends System {
  static queries = {
    randomSpawns: {
      components: [Transform, RandomSpawn],
      listen: { added: true }
    }
  };

  init() {
    this.spawnArea = 10;
  }

  execute(_delta, _time) {
    this.queries.randomSpawns.added.forEach((entity) => {
      const transform = entity.getMutableComponent(Transform);
      transform.position = Utils.getRandomPosition(this.spawnArea);
    });
  }
}
