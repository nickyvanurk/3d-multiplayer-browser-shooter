import { System } from 'ecsy';
import { Raycaster } from 'three';

import { Input } from '../../../shared/components/input';
import { Keybindings } from '../components/keybindings';
import { Camera } from '../components/camera';
import { Object3d } from '../components/object3d';
import { MeshRenderer } from '../components/mesh-renderer';
import { WebGlRenderer } from '../components/webgl-renderer';
import { RaycasterReceiver } from '../components/raycaster-receiver';

export class InputSystem extends System {
  static queries = {
    client: {
      components: [Input, Keybindings],
      listen: { added: true }
    },
    camera: {
      components: [Camera]
    },
    renderers: {
      components: [WebGlRenderer]
    },
    raycastReceivers: {
      components: [RaycasterReceiver, MeshRenderer]
    }
  };

  init() {
    this.raycaster = new Raycaster();
  }

  execute() {
    this.queries.client.added.forEach((entity) => {
      const input = entity.getMutableComponent(Input);
      const keybindings = entity.getComponent(Keybindings);

      document.addEventListener('keydown', ({ code }) => {
        switch (code) {
          case keybindings.forward:     input.forward = true; break;
          case keybindings.backward:    input.backward = true; break;
          case keybindings.rollLeft:    input.rollLeft = true; break;
          case keybindings.rollRight:   input.rollRight = true; break;
          case keybindings.strafeLeft:  input.strafeLeft = true; break;
          case keybindings.strafeRight: input.strafeRight = true; break;
          case keybindings.strafeUp:    input.strafeUp = true; break;
          case keybindings.strafeDown:  input.strafeDown = true; break;
          case keybindings.boost:       input.boost = true; break;
        }
      });

      document.addEventListener('keyup', ({ code }) => {
        switch (code) {
          case keybindings.forward:     input.forward = false; break;
          case keybindings.backward:    input.backward = false; break;
          case keybindings.rollLeft:    input.rollLeft = false; break;
          case keybindings.rollRight:   input.rollRight = false; break;
          case keybindings.strafeLeft:  input.strafeLeft = false; break;
          case keybindings.strafeRight: input.strafeRight = false; break;
          case keybindings.strafeUp:    input.strafeUp = false; break;
          case keybindings.strafeDown:  input.strafeDown = false; break;
          case keybindings.boost:       input.boost = false; break;
        }
      });

      document.addEventListener('mousedown', ({ button }) => {
        switch (button) {
          case keybindings.weaponPrimary: input.weaponPrimary = true; break;
        }
      });

      document.addEventListener('mouseup', ({ button }) => {
        switch (button) {
          case keybindings.weaponPrimary: input.weaponPrimary = false; break;
        }
      });

      document.addEventListener('mousemove', (event) => {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const size = height < width ? height : width;

        const mouse = {
          x: ((event.clientX/size)*2 - width/size).toFixed(3),
          y: (-(event.clientY/size)*2 + height/size).toFixed(3)
        };

        mouse.x = mouse.x < -1 ? -1 : mouse.x > 1 ? 1 : mouse.x;
        mouse.y = mouse.y < -1 ? -1 : mouse.y > 1 ? 1 : mouse.y;

        input.aim.mouse = mouse;
      });

      document.addEventListener('contextmenu', (event) => {
        event.preventDefault();
      });
    });

    const renderers = this.queries.renderers.results;
    const raycastReceivers = this.queries.raycastReceivers.results;

    this.queries.client.results.forEach((entity) => {
      const input = entity.getMutableComponent(Input);

      const cameraEntity = this.queries.camera.results[0];
      const camera = cameraEntity.getComponent(Camera).value;

      this.raycaster.setFromCamera(input.aim.mouse, camera);
      const { origin, direction } = this.raycaster.ray;

      input.aim.origin = origin;
      input.aim.direction = direction;

      // create raycaster system
      if (renderers.length > 0 && raycastReceivers.length > 0) {
        const receivers = raycastReceivers.filter(entity => entity.getComponent(MeshRenderer).scene);
        const objects = receivers.map(entity => entity.getComponent(MeshRenderer).scene);

        this.raycaster.far = 100;
        const intersects = this.raycaster.intersectObjects(objects, true);

        if (intersects.length > 0) {
          const intersection = intersects[0].object.parent ? intersects[0] : intersects[1];
          input.aim.distance = intersection.distance;
        } else {
          input.aim.distance = 100;
        }
      }
    });
  }
}
