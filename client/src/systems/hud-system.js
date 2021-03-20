import { System } from 'ecsy';
import { TextureLoader, SpriteMaterial, Sprite, OrthographicCamera, Scene, Object3D } from 'three';

import { Transform } from '../components/transform';
import { Transform2D } from '../components/transform2d';
import { Kind } from '../../../shared/components/kind';
import { Player } from '../components/player';
import { WebGlRenderer } from '../components/webgl-renderer';
import { Camera } from '../components/camera';
import { Range } from '../../../shared/components/range';

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
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.cameraOrtho = new OrthographicCamera(-this.width/2, this.width/2, this.height/2, -this.height/2, 1, 10);
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

    this.dummy = new Object3D();

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
      let camera = this.tryGetCamera();

      if (!camera) {
        console.error('No camera found');
        return;
      }

      const range = camera.getComponent(Range);
      camera = camera.getComponent(Camera).value;

      const position = entity.getComponent(Transform).position;
      const screenPosition = entity.getComponent(Transform2D);

      this.dummy.quaternion.copy(camera.quaternion);
      this.dummy.position.copy(position);
      this.dummy.applyMatrix4(camera.matrixWorldInverse);
      const localPosition = this.dummy.position;

      const indicator = this.entityIndicators[entity.id];
      const angle = Math.atan2(localPosition.y, localPosition.x);

      const a = this.width/3;
      const b = this.height/3;

      const t = Math.sqrt(Math.pow(b*Math.cos(angle), 2)+Math.pow(a*Math.sin(angle), 2));
      const x = a*b*Math.cos(angle)/t;
      const y = a*b*Math.sin(angle)/t;

      const distanceToEllipse = Math.sqrt((x*x)+(y*y));
      const distanceToEnemy = Math.sqrt(Math.pow(screenPosition.x, 2)+Math.pow(screenPosition.y, 2));

      if (distanceToEnemy < distanceToEllipse && localPosition.z < 0 && !range.inRange.includes(entity)) {
        indicator.material = new SpriteMaterial({ map: this.textures.target });
        indicator.position.set(screenPosition.x, screenPosition.y, 1);
        indicator.visible = true;
      } else {
        indicator.material = new SpriteMaterial({ map: this.textures.spaceship });
        indicator.position.set(x, y, 1);
        indicator.visible = distanceToEnemy > distanceToEllipse || localPosition.z > 0
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
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this.cameraOrtho.left = -this.width/2;
    this.cameraOrtho.right = this.width/2;
    this.cameraOrtho.top = this.height/2;
    this.cameraOrtho.bottom = -this.height/2;
    this.cameraOrtho.updateProjectionMatrix();

    this.queries.renderers.results.forEach((entity) => {
      const renderer = entity.getComponent(WebGlRenderer).renderer;
      renderer.setSize(this.width, this.height);
    });
  }

  tryGetCamera() {
    const cameras = this.queries.cameras.results;
    return cameras.length ? cameras[0] : false;
  }
}
