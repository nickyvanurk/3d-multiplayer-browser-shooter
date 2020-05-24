import {System, Not} from 'ecsy';
import * as THREE from 'three';
import {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer';
import {RenderPass} from 'three/examples/jsm/postprocessing/RenderPass';
import {UnrealBloomPass} from 'three/examples/jsm/postprocessing/UnrealBloomPass';

import {Object3d} from '../components/object3d';
import {Transform} from '../components/transform';
import {Camera} from '../components/camera';
import {InputState} from '../components/input-state';
import {Physics} from '../components/physics';

import {PlayerController} from '../components/player-controller';

export class Render extends System {
  static queries: any = {
    object3d: {
      components: [Object3d, Transform],
      listen: {
        added: true
      }
    },
    camera: {
      components: [Camera, Object3d],
      listen: {
        added: true
      }
    },
    inputStates: {
      components: [InputState]
    },
    player: {
      components: [PlayerController]
    },
    others: {
      components: [Object3d, Physics, Not(PlayerController)]
    }
  };

  public queries: any;
  private raycaster: THREE.Raycaster;
  private gunLine1: any;
  private gunLine2: any;
  private scene: THREE.Scene;
  private camera: any;
  private renderer: THREE.WebGLRenderer;
  private composer: any;

  init() {
    const canvas = document.querySelector('canvas');
    this.renderer = new THREE.WebGLRenderer({canvas});
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(new THREE.Color('#020207'));
    document.body.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x020207, 0.04);

    this.camera = this.world.createEntity()
                            .addComponent(Camera, {
                              fov: 70,
                              aspect: window.innerWidth / window.innerHeight,
                              near: 0.1,
                              far: 10000,
                              handleResize: true
                            })
                            .addComponent(Transform);

    this.renderStars();

    var light: any = new THREE.DirectionalLight( 0xffffff );
    light.position.set(1, 1, 1);
    this.scene.add(light);

    var light: any = new THREE.DirectionalLight( 0x002288 );
    light.position.set(-1, -1, -1);
    this.scene.add(light);

    var light: any = new THREE.AmbientLight( 0x222222 );
    this.scene.add(light);

    this.composer = new EffectComposer(this.renderer);

    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 200;

    this.gunLine1 = new THREE.ArrowHelper(
      this.raycaster.ray.direction,
      this.raycaster.ray.origin, 200, 0xff0000
    );

    this.gunLine2 = new THREE.ArrowHelper(
      this.raycaster.ray.direction,
      this.raycaster.ray.origin, 200, 0xff0000
    );

    this.scene.add(this.gunLine1);
    this.scene.add(this.gunLine2);

    window.addEventListener('resize', () => {
      this.composer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  execute(delta: number) {
    this.queries.camera.added.forEach((camera: any) => {
      const camera3d = camera.getMutableComponent(Object3d).value;

      camera3d.position.z = -4;
      camera3d.position.y = 1;
      camera3d.rotation.y = Math.PI;

      this.composer.addPass(new RenderPass(this.scene, camera3d));
      this.composer.addPass(new UnrealBloomPass(undefined, 1.6, 1, 0));
    });

    this.queries.object3d.added.forEach((entity: any) => {
      this.scene.add(entity.getComponent(Object3d).value);
    });

    this.queries.object3d.results.forEach((entity: any) => {
      const mesh = entity.getMutableComponent(Object3d).value;

      if (entity.hasComponent(Transform)) {
        const transform = entity.getComponent(Transform);

        mesh.position.x = transform.renderPosition.x;
        mesh.position.y = transform.renderPosition.y;
        mesh.position.z = transform.renderPosition.z;

        mesh.quaternion.copy(transform.renderRotation);
      }
    });

    this.queries.camera.results.forEach((entity: any) => {
      const transform = entity.getComponent(Transform);
      const camera3d = entity.getComponent(Object3d).value;

      camera3d.position.copy(transform.renderPosition);
      camera3d.quaternion.copy(transform.renderRotation);

      const inputStateEntity = this.queries.inputStates.results[0];
      const inputState = inputStateEntity.getMutableComponent(InputState);
      this.raycaster.setFromCamera(inputState.mousePosition, camera3d);
    });

    this.queries.player.results.forEach((entity: any) => {
      const transform = entity.getComponent(Transform);

      const targetPosition = new THREE.Vector3();
      this.raycaster.ray.at(200, targetPosition);

      const targetDirection = new THREE.Vector3();
      targetDirection.subVectors(targetPosition, transform.position).normalize();


      const gunLine1Position = new THREE.Vector3(-0.6, 0, 0);
      gunLine1Position.applyQuaternion(transform.renderRotation);
      gunLine1Position.add(transform.renderPosition);

      this.gunLine1.position.copy(gunLine1Position);
      this.gunLine1.setDirection(targetDirection);
      this.gunLine1.setLength(200);

      const gunLine2Position = new THREE.Vector3(0.6, 0, 0);
      gunLine2Position.applyQuaternion(transform.renderRotation);
      gunLine2Position.add(transform.renderPosition);

      this.gunLine2.position.copy(gunLine2Position);
      this.gunLine2.setDirection(targetDirection);
      this.gunLine2.setLength(200);
    });

    this.queries.others.results.forEach((entity: any) => {
      const model = entity.getMutableComponent(Object3d).value;

      const meshes: any = [];
      model.traverse((child: any) => {
        if (child.isMesh) {
          meshes.push(child);
        }
      });

      const intersects = this.raycaster.intersectObjects(meshes, false);
      if (intersects.length) {
        let closestMesh = intersects[0];

        for (let i = 1; i < intersects.length; ++i) {
          if (intersects[i].distance < closestMesh.distance) {
            closestMesh = intersects[i];
          }
        }

        const targetPosition = new THREE.Vector3();
        this.raycaster.ray.at(closestMesh.distance, targetPosition);

        const targetDirectionGun1 = new THREE.Vector3();
        targetDirectionGun1.subVectors(targetPosition, this.gunLine1.position).normalize();

        this.gunLine1.setDirection(targetDirectionGun1);
        this.gunLine1.setLength(this.gunLine1.position.distanceTo(targetPosition));

        const targetDirectionGun2 = new THREE.Vector3();
        targetDirectionGun2.subVectors(targetPosition, this.gunLine2.position).normalize();

        this.gunLine2.setDirection(targetDirectionGun2);
        this.gunLine2.setLength(this.gunLine2.position.distanceTo(targetPosition));
      }
    });

    this.composer.render();
  }

  renderStars(amount: number = 2000) {
    const positions = []
    for (let i = 0; i < amount; i++) {
      const r = 4000
      const theta = 2 * Math.PI * Math.random()
      const phi = Math.acos(2 * Math.random() - 1)
      const x = r * Math.cos(theta) * Math.sin(phi) + (-2000 + Math.random() * 4000)
      const y = r * Math.sin(theta) * Math.sin(phi) + (-2000 + Math.random() * 4000)
      const z = r * Math.cos(phi) + (-1000 + Math.random() * 2000)
      positions.push(x)
      positions.push(y)
      positions.push(z)
    }

    var geometry = new THREE.BufferGeometry();
    var vertices = new Float32Array(positions);
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    var material = new THREE.PointsMaterial({color: 0xffffff, size: 12.5, fog: false});
    var mesh = new THREE.Points(geometry, material);
    this.scene.add(mesh);
  }
}
