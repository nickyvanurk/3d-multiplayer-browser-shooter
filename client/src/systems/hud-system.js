import { System, Not } from 'ecsy';
import { TextureLoader, SpriteMaterial, Sprite, OrthographicCamera, Scene } from 'three';

import Types from '../../../shared/types';
import { Transform } from '../components/transform';
import { Kind } from '../../../shared/components/kind';
import { Player } from '../components/player';
import { WebGlRenderer } from '../components/webgl-renderer';

export class HudSystem extends System {
  static queries = {
    otherEntities: {
      components: [Transform, Kind, Not(Player)]
    },
    renderers: {
      components: [WebGlRenderer],
      listen: { added: true }
    }
  };

  init() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.cameraOrtho = new OrthographicCamera(-width/2, width/2, height/2, -height/2, 1, 10);
    this.cameraOrtho.position.z = 10;
    this.sceneOrtho = new Scene();

    new TextureLoader().load('textures/spaceship.png', this.handleLoad.bind(this));
    this.entityIndicators = {};

    window.onresize = this.onWindowResize.bind(this);

    this.stop();
  }

  handleLoad(texture) {
    this.texture = texture;
    this.play();
  }

  execute(_delta, _time) {
    //this.scene = this.queries.renderers.added.forEach((entity) => {
      //const scene = entity.getComponent(WebGlRenderer).scene;
    //});

    this.queries.otherEntities.results.forEach((entity) => {
      const kind = entity.getComponent(Kind).value;

      if (kind === Types.Entities.SPACESHIP) {
        const { position } = entity.getComponent(Transform);
        this.entityIndicators[entity.id] = this.createHudSprite(0, 0);
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
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.cameraOrtho.left = -width / 2;
    this.cameraOrtho.right = width / 2;
    this.cameraOrtho.top = height / 2;
    this.cameraOrtho.bottom = -height / 2;
    this.cameraOrtho.updateProjectionMatrix();

    //updateHUDSprites();

    this.queries.renderers.results.forEach((entity) => {
      const renderer = entity.getComponent(WebGlRenderer).renderer;
      renderer.setSize(width, height);
    });
  }
}
