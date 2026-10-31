// Shared 3D stage: renderer, camera, image-based lighting, shadows, GLB loading, picking, optional WebXR AR.
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';

/** A small hospital-vault environment: emissive ceiling panels so glossy paint picks up believable reflections. */
function buildEnvironmentScene() {
  const s = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(14, 5, 14), new THREE.MeshBasicMaterial({color: 0x9aa3a8, side: THREE.BackSide}));
  room.position.y = 2.5; s.add(room);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshBasicMaterial({color: 0x6f777b}));
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.01; s.add(floor);
  const panel = new THREE.MeshBasicMaterial({color: new THREE.Color(1, 1, 1).multiplyScalar(14)});
  for (const [x, z] of [[-2.8, -2.4], [2.8, -2.4], [-2.8, 2.4], [2.8, 2.4], [0, 0]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), panel);
    m.rotation.x = Math.PI / 2; m.position.set(x, 4.95, z); s.add(m);
  }
  const strip = new THREE.MeshBasicMaterial({color: new THREE.Color(0.85, 0.95, 1).multiplyScalar(5)});
  for (const sgn of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(10, 0.5), strip);
    m.position.set(0, 2.4, sgn * 6.95); m.rotation.y = sgn > 0 ? Math.PI : 0; s.add(m);
  }
  return s;
}

export function createStage(host, {shadowSize = 2048} = {}) {
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  const renderer = new THREE.WebGLRenderer({antialias: !mobile, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: new URLSearchParams(location.search).has('snap')});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.75 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.xr.enabled = true;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xdfe5e8);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(buildEnvironmentScene(), 0.03).texture;
  scene.environmentIntensity = 0.9;

  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 60);
  camera.position.set(-3.2, 2.0, 3.6);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.minDistance = 0.4; controls.maxDistance = 9;

  const key = new THREE.DirectionalLight(0xfff4e6, 1.5);
  key.position.set(3.5, 6, 3); key.castShadow = true;
  key.shadow.mapSize.set(mobile ? 1024 : shadowSize, mobile ? 1024 : shadowSize);
  const sc = key.shadow.camera; sc.left = -4; sc.right = 4; sc.top = 4; sc.bottom = -4; sc.near = 1; sc.far = 16;
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = 4;
  scene.add(key); scene.add(key.target);
  scene.add(new THREE.HemisphereLight(0xdde8f2, 0x6b6258, 0.35));

  const updaters = [];
  const clock = new THREE.Clock();
  function resize() {
    const w = host.clientWidth || window.innerWidth, h = host.clientHeight || window.innerHeight;
    renderer.setSize(w, h); camera.aspect = w / h;
    // keep the model clear of the side panel (desktop) / bottom sheet (phone) by shifting the view window
    if (w > 820) camera.setViewOffset(w, h, Math.round(w * 0.11), 0, w, h);
    else camera.setViewOffset(w, h, 0, Math.round(h * 0.12), w, h);
    camera.fov = w / h < 1 ? 58 : 42; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize); resize();

  renderer.setAnimationLoop((t, frame) => {
    const dt = Math.min(clock.getDelta(), 0.05);
    for (const u of updaters) u(dt, frame);
    if (!renderer.xr.isPresenting) controls.update();
    renderer.render(scene, camera);
  });

  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const cache = new Map();
  const loadGLB = (url) => {
    if (!cache.has(url)) cache.set(url, new Promise((res, rej) => loader.load(url, (g) => res(g.scene), undefined, rej)));
    return cache.get(url).then((o) => o.clone(true));
  };

  const raycaster = new THREE.Raycaster();
  /** Returns the first hit among `objects` for a pointer event, or null. */
  function pick(ev, objects) {
    const r = renderer.domElement.getBoundingClientRect();
    const p = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(p, camera);
    const hits = raycaster.intersectObjects(objects, true);
    return hits.length ? hits[0] : null;
  }

  return {
    THREE, renderer, scene, camera, controls, key, mobile, loadGLB, pick, resize,
    onFrame: (fn) => updaters.push(fn),
    /** Re-aim the shadow camera and orbit target at the area of interest. */
    frame(center, radius, camPos) {
      controls.target.copy(center);
      if (camPos) camera.position.copy(camPos);
      key.target.position.copy(center);
      sc.left = -radius; sc.right = radius; sc.top = radius; sc.bottom = -radius; sc.updateProjectionMatrix();
      key.position.copy(center).add(new THREE.Vector3(radius * 0.8, radius * 1.6, radius * 0.7));
      controls.update();
    },
    snapshot: () => { renderer.render(scene, camera); return renderer.domElement.toDataURL('image/png'); },
  };
}
