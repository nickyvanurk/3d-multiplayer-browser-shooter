class Game {
  constructor() {
    // Initial three.js setup
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 0, 5);
    this.renderer = new THREE.WebGLRenderer({antialias:true});
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('container').appendChild(this.renderer.domElement);
  }

  processEvents(event) {

  }

  update() {

  }

  render(nextFrameAmount) {
    this.renderer.render(this.scene, this.camera);
  }
}