class Game {
  constructor() {
    this.resourcesLoaded = false;

    // Initial three.js setup
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 0, 100);
    this.renderer = new THREE.WebGLRenderer({antialias:true});
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('container').appendChild(this.renderer.domElement);

    // Light up the scene to view our models
    let directionalLight = new THREE.DirectionalLight(0xffeedd);
    directionalLight.position.set(0, 0, 2);
    this.scene.add(directionalLight);
    this.scene.add(new THREE.HemisphereLight());

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
    
  }

  processEvents(event) {

  }

  update() {
    
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