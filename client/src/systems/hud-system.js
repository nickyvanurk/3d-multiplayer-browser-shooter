import { System } from 'ecsy';
import { TextureLoader, SpriteMaterial, Sprite, OrthographicCamera, Scene } from 'three';
import { Vector3, Object3D } from 'three';

import Types from '../../../shared/types';
import { Transform } from '../components/transform';
import { Kind } from '../../../shared/components/kind';
import { Player } from '../components/player';
import { WebGlRenderer } from '../components/webgl-renderer';
import { Object3d } from '../components/object3d';

export class HudSystem extends System {
  static queries = {
    player: {
      components: [Transform, Kind, Player]
    },
    entities: {
      components: [Transform, Kind],
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

    new TextureLoader().load('textures/spaceship.png', this.handleLoad.bind(this));
    this.entityIndicators = {};

    window.addEventListener('resize', this.onWindowResize.bind(this));

    this.stop();
  }

  handleLoad(texture) {
    this.texture = texture;
    this.play();
  }

  execute(_delta, _time) {
    this.queries.entities.added.forEach((entity) => {
      if (entity.hasComponent(Player) || !entity.hasComponent(Kind)) return;

      const kind = entity.getComponent(Kind).value;
      if (kind === Types.Entities.SPACESHIP) {
        this.entityIndicators[entity.id] = this.createHudSprite(0, 0);
      }
    });

    this.queries.entities.removed.forEach((entity) => {
      if (entity.hasComponent(Player) || !entity.hasRemovedComponent(Kind)) return;

      const kind = entity.getRemovedComponent(Kind).value;
      if (kind === Types.Entities.SPACESHIP) {
        this.sceneOrtho.remove(this.entityIndicators[entity.id]);
        delete this.entityIndicators[entity.id];
      }
    });

    this.queries.entities.results.forEach((entity) => {
      if (entity.hasComponent(Player)) return;

      const kind = entity.getComponent(Kind).value;
      if (kind === Types.Entities.SPACESHIP) {
        const player = this.queries.player.results[0];
        if (!player) return;

        const renderer = this.queries.renderers.results[0];
        const camera = renderer.getComponent(WebGlRenderer).camera;
        const {
          position: cameraPosition,
          quaternion: cameraRotation,
        } = camera.getComponent(Object3d).value;
        const cameraObj = camera.getComponent(Object3d).value;

        const { position } = entity.getComponent(Transform);

        let relativePosition = new Vector3();
        relativePosition.subVectors(cameraPosition, position);

        const dummy = new Object3D();
        dummy.quaternion.copy(cameraRotation);
        dummy.updateMatrixWorld();
        const localPosition = dummy.worldToLocal(relativePosition);

        const indicator = this.entityIndicators[entity.id];
        const angle = Math.atan2(localPosition.y, localPosition.x);

        const a = this.width/3;
        const b = this.height/3;

        const t = Math.sqrt(Math.pow(b*Math.cos(angle), 2)+Math.pow(a*Math.sin(angle), 2));
        const x = a*b*Math.cos(angle)/t;
        const y = a*b*Math.sin(angle)/t;

        const projectedPosition = position.clone().project(cameraObj);
        const screenPosition = {
          x: projectedPosition.x*this.width/2,
          y: projectedPosition.y*this.height/2
        };

        const distanceToEllipse = Math.sqrt((x*x)+(y*y));
        const distanceToEnemy = Math.sqrt(Math.pow(screenPosition.x, 2)+Math.pow(screenPosition.y, 2));

        indicator.position.set(-x, -y, 1);
        indicator.visible = distanceToEnemy > distanceToEllipse || localPosition.z < 0;
      }
    });
  }

  render() {
    this.queries.renderers.results.forEach((entity) => {
      const renderer = entity.getComponent(WebGlRenderer).renderer;
      renderer.clearDepth();
      renderer.render(this.sceneOrtho, this.cameraOrtho);
    });
  }

  createHudSprite(x, y) {
    const material = new SpriteMaterial({ map: this.texture });
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
}
