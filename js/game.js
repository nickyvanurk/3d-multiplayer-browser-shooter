class Player {
  constructor(id, mesh, scene) {
    this.id = id;
    this.mesh = mesh;
    this.velocity = new THREE.Vector3();
    this.acceleration = new THREE.Vector3();
    this.mesh.rotation.set(-Math.PI / 2, 0, -Math.PI / 2);
  }
}

class Game {
  constructor() {
    this.resourcesLoaded = false;
    this.clock = new THREE.Clock();

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1e7);
    this.camera.position.set(0, 10, 100);
    this.renderer = new THREE.WebGLRenderer({antialias:true});
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('container').appendChild(this.renderer.domElement);

    let directionalLight = new THREE.DirectionalLight(0xffeedd);
    directionalLight.position.set(0, 0, 2);
    this.scene.add(directionalLight);
    this.scene.add(new THREE.HemisphereLight());

    this.controls = new THREE.FlyControls(this.camera);
    this.controls.movementSpeed = 1000;
    this.controls.domElement = document.getElementById('container');
    this.controls.rollSpeed = Math.PI / 12;
    this.controls.autoForward = false;
    this.controls.dragToLook = false;

    this.models = {
      spaceship: {
        ds: 'models/fighter1.3ds',
        texture: 'models/crono782.jpg',
        mesh: null
      }
    };

    this.loadingManager = new THREE.LoadingManager();
    this.loadingManager.onLoad = function () {
      this.resourcesLoaded = true;
      this.init();
    }.bind(this);

    this.loadModels(this.models, this.loadingManager);
  }

  init() {
    this.player = new Player(0, this.models.spaceship.mesh.clone());
    this.player.mesh.position.set(0, -15, -100);
    this.camera.add(this.player.mesh);
    this.scene.add(this.camera);
  }

  processEvents(event) {

  }

  update() {
    this.controls.update(this.clock.getDelta());
  }

  render(nextFrameAmount) {
    this.renderer.render(this.scene, this.camera);
  }

  loadModels(models, loadingManager) {
    for (var _key in models) {
      (function (key) {
        var loader = new THREE.TDSLoader(loadingManager);
        loader.load(models[key].ds, function (mesh) {
          mesh.traverse(function (node) {
            if (node instanceof THREE.Mesh) {
              if (node.name === "ship") {
                const imageSrc = node.material.map.image.baseURI + models.spaceship.texture;
                node.material.map.image.src = imageSrc;
              }

              node.castShadow = 'castShadow' in models[key] ? models[key].castShadow : true;
              node.castShadow = 'receiveShadow' in models[key] ? models[key].receiveShadow : true;
            }
          });
          models[key].mesh = mesh;
        });
      })(_key);
    }
  }
}