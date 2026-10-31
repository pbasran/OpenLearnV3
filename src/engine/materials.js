// Physically based material library + small procedural textures (no external image files needed).
import * as THREE from 'three';

function canvasTex(w, h, draw, {repeat = [1, 1], srgb = true} = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat);
  t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const rnd = (a) => (Math.sin(a * 127.1) * 43758.5453) % 1;

export const tex = {
  vinylFloor: () => canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#b9bdb6'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${90 + (i * 7) % 60},${95 + (i * 5) % 60},${90 + (i * 3) % 60},0.10)`; g.fillRect((i * 37.7) % w, (i * 91.3) % h, 2, 2); }
    g.strokeStyle = 'rgba(70,75,70,0.45)'; g.lineWidth = 3; g.strokeRect(1, 1, w - 2, h - 2);
  }, {repeat: [8, 8]}),
  carbon: () => canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#17181a'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) for (let x = 0; x < w; x += 8) {
      const a = ((x + y) / 8) % 2 === 0;
      g.fillStyle = a ? '#26282b' : '#101113'; g.fillRect(x, y, 8, 4);
      g.fillStyle = a ? '#101113' : '#26282b'; g.fillRect(x, y + 4, 8, 4);
    }
  }, {repeat: [14, 14]}),
  wall: () => canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#e9ece8'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(120,125,120,${0.03 + (i % 5) * 0.005})`; g.fillRect((i * 53.1) % w, (i * 17.9) % h, 2, 2); }
  }, {repeat: [6, 3]}),
  ceiling: () => canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#f2f3f1'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#c8cbc7'; g.lineWidth = 4; g.strokeRect(0, 0, w, h);
    for (let i = 0; i < 1200; i++) { g.fillStyle = 'rgba(150,150,150,0.12)'; g.fillRect((i * 31.3) % w, (i * 77.7) % h, 2, 2); }
  }, {repeat: [7, 7]}),
  hatch: () => canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#f5c518'; g.fillRect(0, 0, w, h); g.fillStyle = '#1b1b1b';
    g.save(); g.rotate(-Math.PI / 4); for (let x = -80; x < 120; x += 22) g.fillRect(x, -40, 11, 200); g.restore();
  }, {repeat: [1, 1]}),
};

const P = (o) => new THREE.MeshPhysicalMaterial(o);
export const M = {
  paintWhite: () => P({color: 0xeef0ee, roughness: 0.32, metalness: 0.0, clearcoat: 0.7, clearcoatRoughness: 0.18}),
  paintGrey: () => P({color: 0x9aa1a6, roughness: 0.38, metalness: 0.05, clearcoat: 0.5, clearcoatRoughness: 0.25}),
  paintTeal: () => P({color: 0x1f6f78, roughness: 0.35, metalness: 0.0, clearcoat: 0.8, clearcoatRoughness: 0.15}),
  plasticDark: () => P({color: 0x1d2023, roughness: 0.5, metalness: 0.0, clearcoat: 0.2}),
  plasticMed: () => P({color: 0x4d5459, roughness: 0.45, metalness: 0.05}),
  steel: () => P({color: 0xc4c9cd, roughness: 0.3, metalness: 1.0}),
  steelBrushed: () => P({color: 0xb0b6ba, roughness: 0.45, metalness: 1.0}),
  steelDark: () => P({color: 0x6b7278, roughness: 0.4, metalness: 1.0}),
  copper: () => P({color: 0xc9743c, roughness: 0.28, metalness: 1.0}),
  brass: () => P({color: 0xc9a24a, roughness: 0.3, metalness: 1.0}),
  tungsten: () => P({color: 0x5a5f69, roughness: 0.35, metalness: 1.0}),
  lead: () => P({color: 0x4f545b, roughness: 0.6, metalness: 0.9}),
  rubber: () => P({color: 0x15171a, roughness: 0.85, metalness: 0}),
  glass: () => P({color: 0xcfe6ee, roughness: 0.05, metalness: 0, transmission: 0.9, thickness: 0.02, ior: 1.45, transparent: true, opacity: 0.35}),
  screen: (c = 0x0a1a24) => new THREE.MeshStandardMaterial({color: 0x050608, emissive: c, emissiveIntensity: 1.2, roughness: 0.2}),
  floor: () => P({map: tex.vinylFloor(), roughness: 0.42, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.35}),
  wall: () => P({map: tex.wall(), roughness: 0.8}),
  ceiling: () => P({map: tex.ceiling(), roughness: 0.9}),
  couchTop: () => P({map: tex.carbon(), color: 0xffffff, roughness: 0.35, metalness: 0.2, clearcoat: 0.9, clearcoatRoughness: 0.12}),
  water: () => P({color: 0x6fb8d8, roughness: 0.02, metalness: 0, transmission: 0.55, thickness: 0.3, ior: 1.33, transparent: true, opacity: 0.38, depthWrite: false}),
  acrylic: () => P({color: 0xdfeff5, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.28, ior: 1.49, depthWrite: false}),
  tissue: () => P({color: 0xd9a58f, roughness: 0.55, metalness: 0, sheen: 0.5, sheenColor: new THREE.Color(0xffcdb8)}),
  bone: () => P({color: 0xe8dfc9, roughness: 0.5}),
  led: (c) => new THREE.MeshStandardMaterial({color: c, emissive: c, emissiveIntensity: 2.5}),
};

/** Replace every mesh material beneath `obj` with `mat` (shared) and enable shadows. */
export function skin(obj, mat, {cast = true, receive = true} = {}) {
  obj.traverse((o) => { if (o.isMesh) { o.material = mat; o.castShadow = cast; o.receiveShadow = receive; } });
  return obj;
}
