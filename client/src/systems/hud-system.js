import { System } from 'ecsy';
import { TextureLoader, SpriteMaterial, Sprite, OrthographicCamera, Scene } from 'three';

import { Transform } from '../components/transform';
import { Transform2D } from '../components/transform2d';
import { Kind } from '../../../shared/components/kind';
import { Player } from '../components/player';
import { WebGlRenderer } from '../components/webgl-renderer';
import { Camera } from '../components/camera';
import { Range } from '../../../shared/components/range';
import { Onscreen } from '../components/onscreen';

export class HudSystem extends System {
  static queries = {
    cameras: {
      components: [Camera, Transform, Range]
    },
    player: {
      components: [Transform, Kind, Player]
    },
    hudEntities: {
      components: [Transform, Transform2D],
      listen: {
        added: true,
        removed: true
      }
    },
    renderers: {
      components: [WebGlRenderer],
      listen: { added: true }
    }
  };

  init() {
    this.halfWidth = window.innerWidth / 2;
    this.halfHeight = window.innerHeight / 2;
    this.cameraOrtho = new OrthographicCamera(-this.halfWidth, this.halfWidth, this.halfHeight, -this.halfHeight, 1, 10);
    this.cameraOrtho.position.z = 10;
    this.cameraOrtho.fov = 70;
    this.sceneOrtho = new Scene();

    const loader = new TextureLoader()
    const texture = Promise.all([
      loader.load('textures/spaceship.png'),
      loader.load('textures/target.png')
    ], (resolve, _) => {
      resolve(texture);
    }).then(result => {
      this.textures = {
        spaceship: result[0],
        target: result[1]
      };
      this.play();
    });

    this.entityIndicators = {};

    window.addEventListener('resize', this.onWindowResize.bind(this));

    this.stop();
  }

  execute(_delta, _time) {
    this.queries.hudEntities.added.forEach((entity) => {
      this.entityIndicators[entity.id] = this.createHudSprite(0, 0);
    });

    this.queries.hudEntities.removed.forEach((entity) => {
      this.sceneOrtho.remove(this.entityIndicators[entity.id]);
      delete this.entityIndicators[entity.id];
    });
  }

  render() {
    this.queries.hudEntities.results.forEach((entity) => {
      const transform2d = entity.getComponent(Transform2D);
      const angle = transform2d.rotation;

      const a = this.halfWidth/1.5;
      const b = this.halfHeight/1.5;

      const t = Math.sqrt(Math.pow(b*Math.cos(angle), 2)+Math.pow(a*Math.sin(angle), 2));
      const x = a*b*Math.cos(angle)/t;
      const y = a*b*Math.sin(angle)/t;

      const indicator = this.entityIndicators[entity.id];

      const position = transform2d.position;

      if (entity.hasComponent(Onscreen) && (position.x*position.x + position.y*position.y <= x*x + y*y)) {
          indicator.material = new SpriteMaterial({ map: this.textures.target });
          indicator.position.set(transform2d.position.x, transform2d.position.y, 1);
      } else {
        indicator.material = new SpriteMaterial({ map: this.textures.spaceship });
        indicator.position.set(x, y, 1);
      }
    });

    this.queries.renderers.results.forEach((entity) => {
      const renderer = entity.getComponent(WebGlRenderer).renderer;
      renderer.clearDepth();
      renderer.render(this.sceneOrtho, this.cameraOrtho);
    });
  }

  createHudSprite(x, y) {
    const material = new SpriteMaterial({ map: this.textures.spaceship });
    const enemyIndicator = new Sprite(material);
    enemyIndicator.center.set(0.5, 0.5);
    enemyIndicator.position.set(x, y, 1); // top left
    const scale = 0.2;
    enemyIndicator.scale.set(material.map.image.width*scale, material.map.image.height*scale, 1);
    this.sceneOrtho.add(enemyIndicator);
    return enemyIndicator;
  }

  onWindowResize() {
    this.halfWidth = window.innerWidth / 2;
    this.halfHeight = window.innerHeight / 2;

    this.cameraOrtho.left = -this.halfWidth;
    this.cameraOrtho.right = this.halfWidth;
    this.cameraOrtho.top = this.halfHeight;
    this.cameraOrtho.bottom = -this.halfHeight;
    this.cameraOrtho.updateProjectionMatrix();

    this.queries.renderers.results.forEach((entity) => {
      const renderer = entity.getComponent(WebGlRenderer).renderer;
      renderer.setSize(this.halfWidth*2, this.halfHeight*2);
    });
  }
}
