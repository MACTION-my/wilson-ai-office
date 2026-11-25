// Wilson AI Office in 3D. The page script keeps running the office (who walks where, who is working);
// this file draws that same office as a building in a small city, with an orbit camera.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const S = window.SIM;
const stage = document.querySelector('.stage'), cv = document.getElementById('cv');
const glOK = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } })();
if (S && stage && cv && glOK) document.fonts.ready.then(start, start);

function start() {
const { AG, ALL, TEAM, PETS, bot, WT, C, GX, GY } = S;
const F0 = 0.35;       // interior floor height
const HZ = 1.5;        // one height unit of the old drawing, in metres
const FH = 4.8;        // ground floor height
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- renderer, camera, controls ---------- */
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const gl = renderer.domElement; gl.className = 'gl3d'; gl.setAttribute('aria-hidden', 'true');
stage.insertBefore(gl, cv);
const css = document.createElement('style');
css.textContent = '.gl3d{position:absolute;inset:0;width:100%!important;height:100%!important;display:block}#cv{position:relative;z-index:1;background:transparent!important}';
document.head.appendChild(css);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.3, 1400);
const controls = new OrbitControls(camera, cv);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.minDistance = 6; controls.maxDistance = 140;
controls.maxPolarAngle = Math.PI * 0.48; controls.minPolarAngle = 0.12;
controls.zoomSpeed = 1.1; controls.rotateSpeed = 0.7; controls.autoRotateSpeed = 0.7;
controls.screenSpacePanning = false;
controls.target.set(GX / 2, 10, GY / 2 + 4);
camera.position.copy(controls.target).add(new THREE.Vector3().setFromSphericalCoords(100, 1.05, Math.PI / 4));
controls.update();

// fly-to animation used by buttons and by clicking the building
let fly = null;
function flyTo(target, dist, polar, azimuth) {
  const off = camera.position.clone().sub(controls.target), sph = new THREE.Spherical().setFromVector3(off);
  fly = { t: 0, from: { tg: controls.target.clone(), r: sph.radius, p: sph.phi, a: sph.theta },
          to: { tg: target.clone(), r: dist, p: polar ?? sph.phi, a: azimuth ?? sph.theta } };
  let d = fly.to.a - fly.from.a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; fly.to.a = fly.from.a + d;
}
controls.addEventListener('start', () => { fly = null; });
// let the page scroll once the camera is fully zoomed out
stage.addEventListener('wheel', e => {
  const d = camera.position.distanceTo(controls.target);
  if (e.deltaY > 0 && d >= controls.maxDistance - 0.5) e.stopPropagation();
}, { capture: true });

/* ---------- helpers ---------- */
const mats = new Map();
function mat(color, o = {}) {
  const k = color + JSON.stringify(o);
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, ...o }));
  return mats.get(k);
}
function mesh(geo, m, x, h, y, parent = scene, cast = true, recv = true) {
  const o = new THREE.Mesh(geo, m); o.position.set(x, h, y); o.castShadow = cast; o.receiveShadow = recv; parent.add(o); return o;
}
function box(parent, x0, y0, x1, y1, h0, h1, m, cast = true) {
  return mesh(new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(h1 - h0), Math.abs(y1 - y0)), m, (x0 + x1) / 2, (h0 + h1) / 2, (y0 + y1) / 2, parent, cast);
}
function rbox(parent, w, h, d, r, m, x, hy, y) {
  return mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2)), m, x, hy, y, parent);
}
const cyl = (rt, rb, h, seg = 16) => new THREE.CylinderGeometry(rt, rb, h, seg);
const sph = (r, w = 20, h = 14) => new THREE.SphereGeometry(r, w, h);
const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = arr => arr[Math.floor(rnd() * arr.length)];
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}
// a vertical wall plane whose texture repeats once per (cw x ch) metres
function facade(parent, ax, ay, bx, by, h0, h1, m, cw, ch, cast = true) {
  const len = Math.hypot(bx - ax, by - ay), g = new THREE.PlaneGeometry(len, h1 - h0);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / cw, uv.getY(i) * (h1 - h0) / ch);
  const o = mesh(g, m, (ax + bx) / 2, (h0 + h1) / 2, (ay + by) / 2, parent, cast, true);
  o.rotation.y = Math.atan2(by - ay, bx - ax) * -1 + Math.PI;   // outward normal: left of a→b when seen from above
  return o;
}
// four outward-facing walls around a rectangle
function facadeBox(parent, x0, y0, x1, y1, h0, h1, m, cw, ch) {
  facade(parent, x0, y0, x1, y0, h0, h1, m, cw, ch);
  facade(parent, x1, y0, x1, y1, h0, h1, m, cw, ch);
  facade(parent, x1, y1, x0, y1, h0, h1, m, cw, ch);
  facade(parent, x0, y1, x0, y0, h0, h1, m, cw, ch);
}

/* ---------- textures ---------- */
function windowTex(glass, frame, lit) {
  // 8x8 windows; the emissive version lights a random set of them
  seed = lit ? 99 : 5;
  return canvasTex(256, 256, (g, w, h) => {
    const n = 8, s = w / n;
    g.fillStyle = lit ? '#000' : frame; g.fillRect(0, 0, w, h);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if (lit) { if (rnd() < 0.45) { g.fillStyle = pick(['#ffd28a', '#ffe7b8', '#ffc070', '#bfe6ff']); g.fillRect(i * s + 3, j * s + 3, s - 6, s - 9); } continue; }
      const gr = g.createLinearGradient(i * s, j * s, i * s + s, j * s + s);
      gr.addColorStop(0, glass[0]); gr.addColorStop(1, glass[1]);
      g.fillStyle = gr; g.fillRect(i * s + 3, j * s + 3, s - 6, s - 9);
      g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(i * s + 3, j * s + 3, (s - 6) * 0.35, s - 9);
    }
  }, true);
}
const towerMap = windowTex(['#8cc4f0', '#3f73b8'], '#e9edf5', false), towerLit = windowTex(null, null, true);
const cityMaps = [['#a9c9e8', '#5a7fa8'], ['#d6e4f0', '#8aa6c2'], ['#9fd6d2', '#4f8f9a'], ['#e4d3b8', '#9b8268']].map(g => windowTex(g, pick(['#f2efe8', '#d8d2c6', '#c9ccd6']), false));
const tileTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#efecf4'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#e6e2ee'; g.fillRect(0, 0, w / 2, h / 2); g.fillRect(w / 2, h / 2, w / 2, h / 2);
  g.strokeStyle = 'rgba(120,110,160,.18)'; g.lineWidth = 2; g.strokeRect(0, 0, w / 2, h / 2); g.strokeRect(w / 2, h / 2, w / 2, h / 2); g.strokeRect(w / 2, 0, w / 2, h / 2); g.strokeRect(0, h / 2, w / 2, h / 2);
}, true); tileTex.repeat.set(GX / 4, GY / 4);
const woodTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#a8764f'; g.fillRect(0, 0, w, h); seed = 3;
  for (let y = 0; y < h; y += 16) { g.fillStyle = `rgba(${90 + rnd() * 40},${50 + rnd() * 20},20,.25)`; g.fillRect(0, y, w, 15); g.fillStyle = 'rgba(40,20,10,.35)'; g.fillRect(0, y + 15, w, 1); g.fillRect(rnd() * w, y, 1, 16); }
}, true); woodTex.repeat.set(2, 2);
const paveTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#ddd6ca'; g.fillRect(0, 0, w, h); seed = 9;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillStyle = `rgb(${215 + rnd() * 20},${208 + rnd() * 18},${196 + rnd() * 16})`; g.fillRect(i * 64 + 1, j * 64 + 1, 62, 62); }
}, true); paveTex.repeat.set(20, 20);
const grassTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#79b85a'; g.fillRect(0, 0, w, h); seed = 4;
  for (let i = 0; i < 1400; i++) { g.fillStyle = pick(['#6aa94e', '#86c566', '#71b053', '#8fcf6c']); g.fillRect(rnd() * w, rnd() * h, 2, 3); }
}, true); grassTex.repeat.set(40, 40);
const roadTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#3b3f4a'; g.fillRect(0, 0, w, h); seed = 6;
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(255,255,255,${rnd() * 0.05})`; g.fillRect(rnd() * w, rnd() * h, 2, 2); }
}, true); roadTex.repeat.set(60, 60);

function signTex(aspect, lines) {
  const w = 2048, h = Math.round(2048 / aspect);
  return canvasTex(w, h, (g) => {
    const r = h * 0.12;
    const rr = (x, y, ww, hh, rad) => { g.beginPath(); g.moveTo(x + rad, y); g.arcTo(x + ww, y, x + ww, y + hh, rad); g.arcTo(x + ww, y + hh, x, y + hh, rad); g.arcTo(x, y + hh, x, y, rad); g.arcTo(x, y, x + ww, y, rad); g.closePath(); };
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#2b1d56'); bg.addColorStop(1, '#0f0a26');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.lineWidth = h * 0.05; g.strokeStyle = '#ffd166'; rr(h * 0.05, h * 0.05, w - h * 0.1, h - h * 0.1, r); g.stroke();
    g.lineWidth = h * 0.012; g.strokeStyle = 'rgba(255,209,102,.5)'; rr(h * 0.14, h * 0.14, w - h * 0.28, h - h * 0.28, r * 0.6); g.stroke();
    const step = h * 0.13;
    for (let x = h * 0.2; x < w - h * 0.15; x += step) [h * 0.095, h - h * 0.095].forEach((y, k) => {
      g.save(); g.shadowColor = '#ffd98a'; g.shadowBlur = 18; g.fillStyle = (Math.round(x / step) + k) % 2 ? '#fff3c4' : '#ffc966';
      g.beginPath(); g.arc(x, y, h * 0.026, 0, Math.PI * 2); g.fill(); g.restore();
    });
    const tg = g.createLinearGradient(w * 0.1, 0, w * 0.9, 0); tg.addColorStop(0, '#ffd166'); tg.addColorStop(0.5, '#fff7df'); tg.addColorStop(1, '#ff8fc7');
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const [big, small] = lines;
    let fs = h * (small ? 0.42 : 0.5);
    g.font = `800 ${fs}px 'Space Grotesk','Inter',sans-serif`;
    const mw = g.measureText(big).width; if (mw > w * 0.84) { fs *= w * 0.84 / mw; g.font = `800 ${fs}px 'Space Grotesk','Inter',sans-serif`; }
    g.save(); g.shadowColor = '#ffb86b'; g.shadowBlur = 40; g.fillStyle = tg; g.fillText(big, w / 2, small ? h * 0.42 : h * 0.53); g.restore();
    if (small) {
      g.font = `700 ${h * 0.15}px 'Space Grotesk','Inter',sans-serif`; g.fillStyle = '#7ef0ff';
      g.save(); g.shadowColor = '#3ee6ff'; g.shadowBlur = 24;
      const sp = small.split('').join(String.fromCharCode(8202, 8202)); g.fillText(sp, w / 2, h * 0.74); g.restore();
    }
  });
}
function glowTex() {
  return canvasTex(128, 128, (g, w) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); });
}
const GLOW = glowTex();
const glows = [];
function glow(x, h, y, color, size, parent = scene) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  sp.position.set(x, h, y); sp.scale.set(size, size, 1); parent.add(sp); glows.push(sp); return sp;
}

/* ---------- sky and light ---------- */
const skyU = { top: { value: new THREE.Color('#6fb6ff') }, bot: { value: new THREE.Color('#dff1ff') } };
const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
  vertexShader: 'varying vec3 vP; void main(){ vP = (modelMatrix*vec4(position,1.)).xyz; gl_Position = projectionMatrix*viewMatrix*vec4(vP,1.); }',
  fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying vec3 vP; void main(){ float h = clamp(normalize(vP - cameraPosition).y*1.6+0.08,0.,1.); gl_FragColor = vec4(mix(bot,top,h),1.); }'
}));
sky.position.set(GX / 2, 0, GY / 2); scene.add(sky);
scene.fog = new THREE.Fog('#dff1ff', 160, 520);
const hemi = new THREE.HemisphereLight('#ffffff', '#6b7a5a', 0.9); scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff4e0', 2.4);
sun.position.set(GX / 2 + 40, 70, GY / 2 + 25); sun.target.position.set(GX / 2, 0, GY / 2);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 10, far: 220 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const roomLights = [[7, 7], [19, 7], [7, 16], [19, 16]].map(([x, y]) => { const l = new THREE.PointLight('#ffd9a8', 0, 22, 1.6); l.position.set(x, F0 + 3.8, y); scene.add(l); return l; });

/* ---------- the city ---------- */
const PITCH = 60, BLOCK = 48, CXc = GX / 2, CYc = GY / 2;
const road = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.95 }));
road.rotation.x = -Math.PI / 2; road.position.set(CXc, -0.02, CYc); road.receiveShadow = true; scene.add(road);
const sidewalkM = mat('#c9c6c0', { roughness: 0.9 }), curbM = mat('#e9e6df');
const grassM = new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 });
const lane = new THREE.InstancedMesh(new THREE.BoxGeometry(3, 0.02, 0.25), mat('#f4f1e6', { roughness: 0.6 }), 2000); let laneN = 0;
const dummy = new THREE.Object3D();
function laneMark(x, y, rot) { dummy.position.set(x, 0.01, y); dummy.rotation.set(0, rot, 0); dummy.updateMatrix(); lane.setMatrixAt(laneN++, dummy.matrix); }
for (let k = -3; k <= 3; k++) {
  const rx = CXc + (k + 0.5) * PITCH, ry = CYc + (k + 0.5) * PITCH;
  for (let s = -200; s < 200; s += 7) { laneMark(rx, CYc + s, Math.PI / 2); laneMark(CXc + s, ry, 0); }
}
lane.count = laneN; lane.receiveShadow = true; scene.add(lane);

const cityGroup = new THREE.Group(); scene.add(cityGroup);
const cityMats = cityMaps.map((m, i) => new THREE.MeshStandardMaterial({ map: m, emissiveMap: towerLit, emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 0, roughness: 0.45, metalness: 0.15 }));
const roofM = mat('#8d8aa0', { roughness: 0.9 });
const trees = [];
seed = 21;
for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
  if (!i && !j) continue;
  const bx = CXc + i * PITCH, by = CYc + j * PITCH, far = Math.max(Math.abs(i), Math.abs(j));
  box(cityGroup, bx - BLOCK / 2 - 1, by - BLOCK / 2 - 1, bx + BLOCK / 2 + 1, by + BLOCK / 2 + 1, 0, 0.18, sidewalkM, false);
  if (rnd() < 0.18) {   // a park
    const p = box(cityGroup, bx - BLOCK / 2 + 1, by - BLOCK / 2 + 1, bx + BLOCK / 2 - 1, by + BLOCK / 2 - 1, 0.18, 0.26, grassM, false); p.receiveShadow = true;
    for (let k = 0; k < 14; k++) trees.push([bx + (rnd() - 0.5) * (BLOCK - 6), by + (rnd() - 0.5) * (BLOCK - 6), 0.26, 0.9 + rnd() * 0.6]);
    continue;
  }
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
    const lx = bx - BLOCK / 2 + 3 + a * (BLOCK / 2), ly = by - BLOCK / 2 + 3 + b * (BLOCK / 2), sw = BLOCK / 2 - 6 - rnd() * 6, sd = BLOCK / 2 - 6 - rnd() * 6;
    const hgt = (10 + rnd() * 26) * (far === 1 ? 1 : 1.4), m = cityMats[Math.floor(rnd() * cityMats.length)];
    facadeBox(cityGroup, lx, ly, lx + sw, ly + sd, 0.18, hgt, m, 3, 3.4);
    box(cityGroup, lx, ly, lx + sw, ly + sd, hgt, hgt + 0.4, roofM);
    if (rnd() < 0.5) box(cityGroup, lx + sw * 0.3, ly + sd * 0.3, lx + sw * 0.6, ly + sd * 0.55, hgt + 0.4, hgt + 2.2, mat('#b9b6c8'));
    if (rnd() < 0.6) trees.push([lx + sw + 1.6, ly + 1.5, 0.18, 0.8]);
  }
}

/* ---------- Wilson's block: lawn, plaza, parking ---------- */
const PB = { x0: CXc - BLOCK / 2, y0: CYc - BLOCK / 2, x1: CXc + BLOCK / 2, y1: CYc + BLOCK / 2 };
box(scene, PB.x0 - 1, PB.y0 - 1, PB.x1 + 1, PB.y1 + 1, 0, 0.18, sidewalkM, false).receiveShadow = true;
box(scene, PB.x0 + 1, PB.y0 + 1, PB.x1 - 1, PB.y1 - 1, 0.18, 0.26, grassM, false).receiveShadow = true;
const paveM = new THREE.MeshStandardMaterial({ map: paveTex, roughness: 0.85 });
const plaza = box(scene, -5, -5, GX + 5, GY + 5, 0.26, 0.32, paveM, false); plaza.receiveShadow = true;
box(scene, CXc - 3, GY + 5, CXc + 3, PB.y1 - 1, 0.26, 0.32, paveM, false).receiveShadow = true;   // front walkway
// parking lot at the front right
const lotM = mat('#4a4e5a', { roughness: 0.9 });
box(scene, 19.6, GY + 6, 34.4, PB.y1 - 1.5, 0.26, 0.31, lotM, false).receiveShadow = true;
for (let k = 0; k <= 3; k++) box(scene, 20 + k * 4.67 - 0.08, GY + 6.4, 20 + k * 4.67 + 0.08, GY + 11.2, 0.31, 0.32, mat('#f4f1e6'), false);
// fountain in front of the entrance
const fx = CXc, fy = GY + 9;
mesh(cyl(4, 4.2, 0.7, 40), mat('#e9e4da', { roughness: 0.6 }), fx, 0.6, fy);
const water = mesh(cyl(3.6, 3.6, 0.1, 40), new THREE.MeshStandardMaterial({ color: '#4fb8ff', roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.85 }), fx, 0.92, fy, scene, false);
mesh(cyl(0.6, 0.9, 1.6, 20), mat('#e9e4da'), fx, 1.6, fy);
mesh(cyl(1.6, 1.6, 0.25, 30), mat('#e9e4da'), fx, 2.4, fy);
const jetM = new THREE.MeshStandardMaterial({ color: '#bfe8ff', transparent: true, opacity: 0.6, roughness: 0.1, emissive: '#5fb8ff', emissiveIntensity: 0.2 });
const jets = [0, 1, 2, 3, 4, 5].map(k => { const j = mesh(new THREE.ConeGeometry(0.12, 1.6, 8), jetM, fx + Math.cos(k * Math.PI / 3) * 2.4, 1.6, fy + Math.sin(k * Math.PI / 3) * 2.4, scene, false); return j; });
const jetTop = mesh(new THREE.ConeGeometry(0.22, 2.4, 10), jetM, fx, 3.6, fy, scene, false);

// flower beds along the plaza edge
const flowerGeo = sph(0.22, 8, 6), flowerCols = ['#ff4f7b', '#ffd166', '#ff8fc7', '#b48cff', '#ffffff', '#ff7a3d'];
const flowers = new THREE.InstancedMesh(flowerGeo, new THREE.MeshStandardMaterial({ roughness: 0.6 }), 2600); let flN = 0;
const bushes = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.7, 1), mat('#3f8f46', { flatShading: true, roughness: 0.9 }), 400); let buN = 0;
bushes.castShadow = true; bushes.receiveShadow = true;
const soilM = mat('#6b4a33', { roughness: 1 });
function bed(x0, y0, x1, y1) {
  box(scene, x0, y0, x1, y1, 0.26, 0.55, mat('#d8d0c2'), false);
  box(scene, x0 + 0.15, y0 + 0.15, x1 - 0.15, y1 - 0.15, 0.55, 0.6, soilM, false);
  const n = Math.round(Math.abs((x1 - x0) * (y1 - y0)) * 3);
  for (let k = 0; k < n; k++) {
    dummy.position.set(lerp(x0 + 0.3, x1 - 0.3, rnd()), 0.72 + rnd() * 0.15, lerp(y0 + 0.3, y1 - 0.3, rnd()));
    dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(0.6 + rnd() * 0.6); dummy.updateMatrix();
    flowers.setMatrixAt(flN, dummy.matrix); flowers.setColorAt(flN, new THREE.Color(pick(flowerCols))); flN++;
  }
}
function bush(x, y, s = 1) { dummy.position.set(x, 0.3 + 0.5 * s, y); dummy.rotation.set(rnd(), rnd(), rnd()); dummy.scale.set(s, s * 0.8, s); dummy.updateMatrix(); bushes.setMatrixAt(buN++, dummy.matrix); }
seed = 33;
bed(-4, GY + 3, CXc - 4, GY + 4.4); bed(CXc + 4, GY + 3, GX - 5, GY + 4.4);
bed(-4, -4.4, GX + 4, -3); bed(-4.4, -3, -3, GY + 3); bed(GX + 3, -3, GX + 4.4, GY + 1);
for (let a = 0; a < Math.PI * 2; a += Math.PI / 9) { const r = 5.2; bed(fx + Math.cos(a) * r - 0.5, fy + Math.sin(a) * r - 0.5, fx + Math.cos(a) * r + 0.5, fy + Math.sin(a) * r + 0.5); }
for (let x = PB.x0 + 2; x < PB.x1 - 2; x += 1.6) { bush(x, PB.y0 + 2, 0.8); bush(x, PB.y1 - 2, 0.8); }
for (let y = PB.y0 + 3; y < PB.y1 - 2; y += 1.6) { bush(PB.x0 + 2, y, 0.8); bush(PB.x1 - 2, y, 0.8); }
flowers.count = flN; bushes.count = buN; flowers.instanceColor.needsUpdate = true; scene.add(flowers, bushes);

// trees: round leafy trees around the lawn, palms by the entrance
for (let x = PB.x0 + 5; x < PB.x1 - 3; x += 6) { trees.push([x, PB.y0 + 5, 0.26, 1.1]);  }
for (let y = PB.y0 + 11; y < PB.y1 - 8; y += 6) { trees.push([PB.x0 + 5, y, 0.26, 1.1]); trees.push([PB.x1 - 5, y, 0.26, 1.1]); }
const trunkM = mat('#7a5236', { roughness: 0.95 }), leafMs = ['#3f9a4a', '#4fae52', '#2f8a46', '#6cbf4f'].map(c => mat(c, { flatShading: true, roughness: 0.85 }));
function tree(x, y, h0, s) {
  const g = new THREE.Group(); g.position.set(x, h0, y); g.scale.setScalar(s); scene.add(g);
  mesh(cyl(0.18, 0.26, 2.4, 8), trunkM, 0, 1.2, 0, g);
  const lm = pick(leafMs);
  [[0, 3.2, 0, 1.6], [0.7, 2.7, 0.3, 1.1], [-0.6, 2.8, -0.4, 1.15], [0.1, 4.0, -0.1, 1.05]].forEach(([dx, dy, dz, r]) => mesh(new THREE.IcosahedronGeometry(r, 1), lm, dx, dy, dz, g));
}
function palm(x, y, s) {
  const g = new THREE.Group(); g.position.set(x, 0.3, y); g.scale.setScalar(s); scene.add(g);
  for (let k = 0; k < 7; k++) { const seg = mesh(cyl(0.2 - k * 0.012, 0.24 - k * 0.012, 0.9, 8), mat('#a57c52', { roughness: 1 }), Math.sin(k * 0.25) * 0.5, 0.45 + k * 0.85, 0, g); seg.rotation.z = -0.06 * k; }
  const fm = mat('#3c9b48', { side: THREE.DoubleSide, flatShading: true });
  for (let k = 0; k < 8; k++) {
    const f = mesh(new THREE.ConeGeometry(0.5, 3.4, 4, 1), fm, 1.1, 6.2, 0, g); f.scale.z = 0.25;
    f.rotation.set(0, k * Math.PI / 4, 0); f.position.set(1.1 + Math.cos(k * Math.PI / 4) * 1.3, 6.0, Math.sin(k * Math.PI / 4) * 1.3);
    f.rotation.z = Math.PI / 2 + 0.35; f.rotation.order = 'YZX'; f.rotation.y = -k * Math.PI / 4;
  }
}
trees.forEach(([x, y, h0, s]) => tree(x, y, h0, s));
[[CXc - 7, GY + 6], [CXc + 7, GY + 6], [CXc - 7, GY + 11.5], [CXc + 6.5, GY + 12.2], [-6.5, GY + 6], [-6.5, -6], [GX + 6.5, -6]].forEach(([x, y]) => palm(x, y, 1));

// street lamps
const lampM = mat('#2c2c38', { metalness: 0.6, roughness: 0.4 }), bulbM = new THREE.MeshStandardMaterial({ color: '#fff3d0', emissive: '#ffd58a', emissiveIntensity: 0.2 });
function lamp(x, y) {
  mesh(cyl(0.08, 0.12, 4.6, 8), lampM, x, 2.6, y);
  mesh(new THREE.BoxGeometry(0.9, 0.12, 0.3), lampM, x + 0.35, 4.9, y);
  mesh(sph(0.18, 10, 8), bulbM, x + 0.7, 4.78, y, scene, false);
  glow(x + 0.7, 4.7, y, '#ffcf80', 3.2);
}
[[-6, -6], [GX + 6, -6], [-6, GY + 6], [GX + 6, GY + 6], [CXc - 3.6, GY + 18], [CXc + 3.6, GY + 18], [-6, CYc], [GX + 6, CYc], [CXc, -6]].forEach(([x, y]) => lamp(x, y));

/* ---------- cars and the bike ---------- */
const tyreM = mat('#15151a', { roughness: 0.8 }), rimM = mat('#d9dce6', { metalness: 0.9, roughness: 0.25 }), glassCarM = mat('#1b2433', { metalness: 0.5, roughness: 0.1 });
const headM = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff6d8', emissiveIntensity: 0.4 }), tailM = new THREE.MeshStandardMaterial({ color: '#ff2a3d', emissive: '#ff2a3d', emissiveIntensity: 0.5 });
function wheel(g, x, z, r, w, caliper) {
  const t = mesh(cyl(r, r, w, 22), tyreM, x, r, z, g); t.rotation.x = Math.PI / 2;
  const rim = mesh(cyl(r * 0.66, r * 0.66, w + 0.02, 10), rimM, x, r, z, g); rim.rotation.x = Math.PI / 2;
  if (caliper) { const c = mesh(new THREE.BoxGeometry(r * 0.5, r * 0.35, w + 0.04), mat(caliper), x + r * 0.25, r * 1.15, z, g); }
}
function supercar(x, y, rot) {
  // a low red mid-engine sports car (generic design)
  const g = new THREE.Group(); g.position.set(x, 0.31, y); g.rotation.y = rot; scene.add(g);
  const red = mat('#d0101e', { metalness: 0.55, roughness: 0.22 });
  rbox(g, 4.5, 0.55, 2.0, 0.22, red, 0, 0.52, 0);
  const nose = rbox(g, 1.5, 0.3, 1.9, 0.14, red, 1.75, 0.72, 0); nose.rotation.z = -0.16;
  const cab = rbox(g, 2.0, 0.55, 1.6, 0.25, glassCarM, -0.25, 1.0, 0); cab.scale.y = 0.9;
  rbox(g, 1.9, 0.12, 1.5, 0.05, red, -0.3, 1.27, 0);
  const deck = rbox(g, 1.3, 0.28, 1.85, 0.12, red, -1.6, 0.86, 0); deck.rotation.z = 0.08;
  box(g, -2.35, -0.75, -2.15, 0.75, 1.02, 1.08, mat('#141418'));      // rear wing
  [-0.6, 0.6].forEach(z => box(g, -2.27, z - 0.04, -2.2, z + 0.04, 0.86, 1.02, mat('#141418')));
  [-0.92, 0.92].forEach(z => { const s = mesh(new THREE.BoxGeometry(0.9, 0.28, 0.06), mat('#141418'), -0.45, 0.58, z, g); });
  [[1.45, -0.98], [1.45, 0.98], [-1.45, -0.98], [-1.45, 0.98]].forEach(([wx, wz]) => wheel(g, wx, wz, 0.38, 0.3, '#ffd200'));
  [-0.6, 0.6].forEach(z => { mesh(new THREE.BoxGeometry(0.1, 0.1, 0.42), headM, 2.25, 0.68, z, g, false); mesh(new THREE.BoxGeometry(0.08, 0.1, 0.5), tailM, -2.27, 0.72, z, g, false); });
  return g;
}
function superbike(x, y, rot) {
  // a white, blue and red sports bike (generic design), leaning on its stand
  const g = new THREE.Group(); g.position.set(x, 0.31, y); g.rotation.y = rot; scene.add(g);
  const lean = new THREE.Group(); lean.rotation.x = 0.1; g.add(lean);
  const white = mat('#f4f5f8', { metalness: 0.3, roughness: 0.25 }), blue = mat('#1f5fd6', { metalness: 0.3, roughness: 0.25 }), redM = mat('#e0262e', { metalness: 0.3, roughness: 0.3 });
  [[0.72, 0], [-0.72, 0]].forEach(([wx]) => { const t = mesh(new THREE.TorusGeometry(0.3, 0.1, 10, 24), tyreM, wx, 0.4, 0, lean); const r = mesh(cyl(0.2, 0.2, 0.08, 10), mat('#1f5fd6', { metalness: 0.5 }), wx, 0.4, 0, lean); r.rotation.x = Math.PI / 2; });
  const fair = rbox(lean, 1.2, 0.5, 0.42, 0.18, white, 0.25, 0.82, 0); fair.rotation.z = -0.12;
  const nose = rbox(lean, 0.55, 0.36, 0.38, 0.15, white, 0.85, 0.98, 0); nose.rotation.z = -0.5;
  [0.215, -0.215].forEach(z => { const p = mesh(new THREE.BoxGeometry(0.75, 0.22, 0.02), blue, 0.3, 0.78, z, lean, false); p.rotation.z = -0.12; const q = mesh(new THREE.BoxGeometry(0.4, 0.06, 0.022), redM, 0.2, 0.92, z, lean, false); q.rotation.z = -0.12; });
  const tank = rbox(lean, 0.55, 0.28, 0.4, 0.13, blue, 0.05, 1.12, 0);
  const seat = rbox(lean, 0.55, 0.1, 0.3, 0.05, mat('#1a1a20'), -0.42, 1.12, 0); seat.rotation.z = 0.15;
  const tail = rbox(lean, 0.5, 0.18, 0.26, 0.08, white, -0.75, 1.14, 0); tail.rotation.z = 0.3;
  const screen = mesh(new THREE.BoxGeometry(0.3, 0.22, 0.32), glassCarM, 0.92, 1.24, 0, lean); screen.rotation.z = -0.9;
  mesh(new THREE.BoxGeometry(0.06, 0.05, 0.62), mat('#22222a'), 0.62, 1.28, 0, lean);
  const ex = mesh(cyl(0.07, 0.09, 0.55, 10), rimM, -0.55, 0.65, 0.18, lean); ex.rotation.z = Math.PI / 2 + 0.3;
  mesh(new THREE.BoxGeometry(0.06, 0.07, 0.16), headM, 1.06, 1.0, 0, lean, false);
  return g;
}
function sedan(color) {
  const g = new THREE.Group(), body = mat(color, { metalness: 0.45, roughness: 0.3 });
  rbox(g, 4.2, 0.7, 1.85, 0.25, body, 0, 0.62, 0);
  rbox(g, 2.3, 0.62, 1.65, 0.25, glassCarM, -0.2, 1.18, 0);
  rbox(g, 2.1, 0.08, 1.55, 0.04, body, -0.2, 1.5, 0);
  [[1.35, -0.9], [1.35, 0.9], [-1.35, -0.9], [-1.35, 0.9]].forEach(([wx, wz]) => wheel(g, wx, wz, 0.36, 0.26));
  [-0.6, 0.6].forEach(z => { mesh(new THREE.BoxGeometry(0.08, 0.12, 0.38), headM, 2.1, 0.72, z, g, false); mesh(new THREE.BoxGeometry(0.06, 0.12, 0.42), tailM, -2.1, 0.78, z, g, false); });
  scene.add(g); return g;
}
supercar(22.3, GY + 8.8, Math.PI / 2);
superbike(27, GY + 8.6, Math.PI / 2 - 0.2);
const suv = sedan('#20222c'); suv.position.set(31.6, 0.31, GY + 8.8); suv.rotation.y = Math.PI / 2;
// traffic around the block
const loop = { x0: PB.x0 - 6, y0: PB.y0 - 6, x1: PB.x1 + 6, y1: PB.y1 + 6 };
const loopLen = 2 * (loop.x1 - loop.x0 + loop.y1 - loop.y0);
const traffic = ['#f5f5f7', '#2b6cff', '#ffcf3a', '#1f9e6e', '#8a8f9e', '#ff7a3d', '#6a2cd6', '#f5f5f7'].map((c, i) => ({ g: sedan(c), u: i * loopLen / 8, v: 7 + (i % 3) * 1.6, lane: i % 2 }));
function loopPos(u, lane) {
  const w = loop.x1 - loop.x0, h = loop.y1 - loop.y0, off = lane ? 1.8 : -1.8;
  u = ((u % loopLen) + loopLen) % loopLen;
  if (u < w) return [loop.x0 + u, loop.y0 + off, 0];
  if ((u -= w) < h) return [loop.x1 - off, loop.y0 + u, Math.PI / 2];
  if ((u -= h) < w) return [loop.x1 - u, loop.y1 - off, Math.PI];
  u -= w; return [loop.x0 + off, loop.y1 - u, -Math.PI / 2];
}

/* ---------- the building ---------- */
const BX0 = -0.3, BY0 = -0.3, BX1 = GX + 0.3, BY1 = GY + 0.3;
const building = new THREE.Group(); scene.add(building);
box(building, BX0 - 0.4, BY0 - 0.4, BX1 + 0.4, BY1 + 0.4, 0.26, F0, mat('#d8d4de', { roughness: 0.6 }), false).receiveShadow = true;
// steps up to the doors
box(building, CXc - 2.6, BY1 + 0.4, CXc + 2.6, BY1 + 1.4, 0.26, 0.32, mat('#cfcad6'), false);
// interior floor
const floorM = new THREE.MeshStandardMaterial({ map: tileTex, roughness: 0.35, metalness: 0.05 });
const fl = mesh(new THREE.PlaneGeometry(GX, GY), floorM, GX / 2, F0 + 0.005, GY / 2, building, false, true); fl.rotation.x = -Math.PI / 2;
const wood = mesh(new THREE.PlaneGeometry(7, 6.5), new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.45 }), 3.5, F0 + 0.01, 3.25, building, false, true); wood.rotation.x = -Math.PI / 2;
function rug(x0, y0, x1, y1, color, o = 0.012, rough = 0.95) { const r = mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), mat(color, { roughness: rough }), (x0 + x1) / 2, F0 + o, (y0 + y1) / 2, building, false, true); r.rotation.x = -Math.PI / 2; return r; }
rug(1.3, 3.1, 5.5, 6.1, '#a8425f');
TEAM.forEach(id => { const [x0, y0, x1, y1] = AG[id].zone; const c = new THREE.Color(AG[id].color).lerp(new THREE.Color('#ffffff'), 0.55); rug(x0, y0, x1, y1, '#' + c.getHexString()); rug(x0, y0, x1, y0 + 0.12, AG[id].color, 0.016, 0.4); });
rug(9.2, 17.2, 16.8, 21.4, '#c8bde8');
const hqRing = mesh(new THREE.RingGeometry(2.6, 3.0, 64), new THREE.MeshStandardMaterial({ color: '#3ee6ff', emissive: '#3ee6ff', emissiveIntensity: 0.8, transparent: true, opacity: 0.8 }), C.x, F0 + 0.02, C.y, building, false, false);
hqRing.rotation.x = -Math.PI / 2;

// glass curtain wall of the ground floor (stays when the upper floors fade)
const glassM = new THREE.MeshStandardMaterial({ color: '#bfe4ff', transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.4, depthWrite: false, side: THREE.DoubleSide });
const frameM = mat('#d4d8e6', { metalness: 0.6, roughness: 0.3 });
function glassWall(ax, ay, bx, by, gapFrom, gapTo) {
  const len = Math.hypot(bx - ax, by - ay), dx = (bx - ax) / len, dy = (by - ay) / len;
  const seg = (u0, u1) => { if (u1 - u0 < 0.05) return; const g = facade(building, ax + dx * u0, ay + dy * u0, ax + dx * u1, ay + dy * u1, F0, F0 + FH, glassM, 1, 1, false); g.receiveShadow = false; g.renderOrder = 2; };
  if (gapFrom != null) { seg(0, gapFrom); seg(gapTo, len); } else seg(0, len);
  for (let u = 0; u <= len + 0.01; u += 2.6) { const px = ax + dx * Math.min(u, len), py = ay + dy * Math.min(u, len); box(building, px - 0.09, py - 0.09, px + 0.09, py + 0.09, F0, F0 + FH, frameM); }
  box(building, Math.min(ax, bx) - 0.1, Math.min(ay, by) - 0.1, Math.max(ax, bx) + 0.1, Math.max(ay, by) + 0.1, F0 + FH - 0.25, F0 + FH, frameM);
}
glassWall(0, 0, GX, 0); glassWall(GX, 0, GX, GY); glassWall(GX, GY, 0, GY, GX / 2 - 2, GX / 2 + 2); glassWall(0, GY, 0, 0);
// entrance canopy with the name on it
glow(CXc, F0 + 3.2, GY + 1.6, '#ffe3a8', 6, building);

/* ---------- inside ---------- */
const deskM = mat('#f6f4fa', { roughness: 0.4 }), deskLeg = mat('#9a97ad', { metalness: 0.6, roughness: 0.3 }), screenOff = mat('#141322', { roughness: 0.3, metalness: 0.4 });
const screens = [];
function screen(parent, x, h, y, w, hh, rotY, color) {
  const g = new THREE.Group(); g.position.set(x, h, y); g.rotation.y = rotY; parent.add(g);
  mesh(new THREE.BoxGeometry(w + 0.08, hh + 0.08, 0.06), screenOff, 0, 0, 0, g);
  const sm = new THREE.MeshStandardMaterial({ color: '#0b0b18', emissive: color, emissiveIntensity: 0.9, roughness: 0.4 });
  const face = mesh(new THREE.PlaneGeometry(w, hh), sm, 0, 0, 0.035, g, false, false);
  screens.push({ m: sm, base: color }); return g;
}
function chair(x, y, color, rotY) {
  const g = new THREE.Group(); g.position.set(x, F0, y); g.rotation.y = rotY; building.add(g);
  mesh(cyl(0.05, 0.05, 0.42, 8), deskLeg, 0, 0.23, 0, g);
  mesh(cyl(0.32, 0.32, 0.04, 5), deskLeg, 0, 0.04, 0, g);
  rbox(g, 0.62, 0.12, 0.6, 0.05, mat(color, { roughness: 0.6 }), 0, 0.5, 0);
  rbox(g, 0.6, 0.7, 0.1, 0.05, mat(color, { roughness: 0.6 }), 0, 0.92, 0.3);
  return g;
}
function plant(x, y, s = 1) {
  const g = new THREE.Group(); g.position.set(x, F0, y); g.scale.setScalar(s); building.add(g);
  mesh(cyl(0.28, 0.22, 0.55, 14), mat('#f1ece4', { roughness: 0.5 }), 0, 0.28, 0, g);
  const lm = mat('#3b9a52', { flatShading: true });
  [[0, 1.0, 0, 0.42], [0.2, 0.78, 0.12, 0.32], [-0.18, 0.82, -0.1, 0.3], [0.05, 1.32, 0, 0.3]].forEach(([dx, dy, dz, r]) => mesh(new THREE.IcosahedronGeometry(r, 0), lm, dx, dy, dz, g));
}
// team desks
TEAM.forEach(id => {
  const a = AG[id], [x0, y0] = a.zone, c = a.color;
  box(building, x0 + 1.1, y0 + 0.9, x0 + 4.3, y0 + 1.75, F0 + 0.72, F0 + 0.78, deskM);
  [[x0 + 1.2, y0 + 1.0], [x0 + 4.2, y0 + 1.0], [x0 + 1.2, y0 + 1.65], [x0 + 4.2, y0 + 1.65]].forEach(([lx, ly]) => box(building, lx - 0.03, ly - 0.03, lx + 0.03, ly + 0.03, F0, F0 + 0.72, deskLeg));
  box(building, x0 + 1.1, y0 + 1.72, x0 + 4.3, y0 + 1.76, F0 + 0.7, F0 + 0.78, mat(c, { emissive: c, emissiveIntensity: 0.4 }));
  screen(building, x0 + 2.2, F0 + 1.18, y0 + 1.1, 0.95, 0.55, 0, c);
  screen(building, x0 + 3.25, F0 + 1.18, y0 + 1.1, 0.95, 0.55, 0, c);
  box(building, x0 + 2.65, y0 + 1.03, x0 + 2.8, y0 + 1.12, F0 + 0.78, F0 + 0.95, deskLeg);
  box(building, x0 + 2.3, y0 + 1.35, x0 + 3.1, y0 + 1.55, F0 + 0.78, F0 + 0.8, mat('#d6d3e2'));
  mesh(cyl(0.06, 0.05, 0.12, 10), mat(c), x0 + 3.9, F0 + 0.84, y0 + 1.4, building);
  chair(a.seat.x, a.seat.y + 0.05, c, 0);
});
// Wilson's office: desk, leather chair, TV, bookshelf, aquarium, glass walls
box(building, 1.8, 3.6, 4.8, 4.5, F0, F0 + 0.8, mat('#7a5540', { roughness: 0.45 }));
box(building, 1.75, 3.55, 4.85, 4.55, F0 + 0.8, F0 + 0.86, mat('#a37656', { roughness: 0.35 }));
screen(building, 3.3, F0 + 1.25, 3.85, 0.9, 0.5, Math.PI, '#ffd166');
mesh(cyl(0.06, 0.05, 0.14, 10), mat('#ffffff'), 2.2, F0 + 0.93, 3.95, building);
(() => { const g = chair(3.3, 2.6, '#2a2440', Math.PI); g.scale.set(1.2, 1.25, 1.2); })();
screen(building, 2.75, F0 + 2.2, 0.15, 3.4, 1.9, 0, '#3ee6ff');
box(building, 0.1, 1.2, 0.65, 4.4, F0, F0 + 3.3, mat('#5a3c34', { roughness: 0.6 }));
seed = 41;
for (let z = 0; z < 3; z++) for (let y = 1.3; y < 4.25;) { const w = 0.1 + rnd() * 0.12, hh = 0.42 + rnd() * 0.2; box(building, 0.66, y, 0.72, y + w, F0 + 0.25 + z * 1.0, F0 + 0.25 + z * 1.0 + hh, mat(pick(['#b48cff', '#ff6fc8', '#3ee6ff', '#ffd166', '#e9e2d0', '#7a6cff', '#ff9a8b', '#3fdc8a']))); y += w + 0.03; }
box(building, 4.9, 0.35, 6.6, 0.95, F0, F0 + 0.9, mat('#4a342c'));
const tank = box(building, 4.95, 0.4, 6.55, 0.9, F0 + 0.9, F0 + 2.0, new THREE.MeshStandardMaterial({ color: '#5fc8ff', transparent: true, opacity: 0.45, emissive: '#1b78c0', emissiveIntensity: 0.5, roughness: 0.05 }), false);
const fish = ['#ff9466', '#ffd166', '#ff6fc8'].map((c, k) => mesh(new THREE.SphereGeometry(0.09, 10, 8), mat(c, { emissive: c, emissiveIntensity: 0.2 }), 5.7, F0 + 1.3 + k * 0.2, 0.65, building, false));
fish.forEach(f => f.scale.set(1.6, 1, 0.7));
const pGlass = new THREE.MeshStandardMaterial({ color: '#e8f4ff', transparent: true, opacity: 0.22, roughness: 0.1, depthWrite: false, side: THREE.DoubleSide });
[[0, 6.5, 7, 6.5], [7, 0, 7, 4.2], [7, 5.6, 7, 6.5]].forEach(([ax, ay, bx, by]) => { const g = facade(building, ax, ay, bx, by, F0, F0 + 3.6, pGlass, 1, 1, false); g.renderOrder = 2; box(building, Math.min(ax, bx) - 0.04, Math.min(ay, by) - 0.04, Math.max(ax, bx) + 0.04, Math.max(ay, by) + 0.04, F0 + 3.55, F0 + 3.65, mat('#b6bbe0')); });
[[7, 4.2], [7, 5.6], [7, 6.5], [0, 6.5]].forEach(([x, y]) => box(building, x - 0.06, y - 0.06, x + 0.06, y + 0.06, F0, F0 + 3.65, mat('#b6bbe0')));
// Sasa printer + cabinet, Nana's ads screen, Mimi ring light, Kiki headset wall, Lulu easel, Bobo studio, Wawa board
box(building, 8.7, 1.2, 9.35, 1.8, F0, F0 + 1.05, mat('#d9dbe8'));
box(building, 12.6, 1.2, 13.3, 1.9, F0, F0 + 1.6, mat('#c9c4dc'));
box(building, 14.75, 3.0, 14.95, 3.06, F0, F0 + 1.6, deskLeg);
screen(building, 14.9, F0 + 2.1, 3.75, 1.9, 1.1, Math.PI / 2, '#ff6fc8');
const ring = mesh(new THREE.TorusGeometry(0.42, 0.05, 10, 30), new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#fff4e0', emissiveIntensity: 1.2 }), 20.9, F0 + 1.9, 4.85, building, false); ring.rotation.y = Math.PI / 2;
box(building, 20.87, 4.82, 20.93, 4.88, F0, F0 + 1.5, deskLeg);
screen(building, 21.3, F0 + 1.7, 11.7, 1.8, 1.0, Math.PI / 2, '#3fdc8a');
box(building, 21.2, 11.3, 21.25, 12.1, F0, F0 + 1.2, deskLeg);
(() => { const g = new THREE.Group(); g.position.set(24.1, F0, 19.4); g.rotation.y = -Math.PI / 2; building.add(g);
  [[-0.35, 0.2], [0.35, 0.2], [0, -0.35]].forEach(([lx, lz]) => { const l = mesh(cyl(0.03, 0.03, 1.9, 6), mat('#8a6a40'), lx * 0.6, 0.9, lz * 0.6, g); l.rotation.x = lz > 0 ? 0.12 : -0.2; });
  mesh(new THREE.BoxGeometry(1.1, 0.8, 0.04), mat('#ffffff', { emissive: '#8aa2ff', emissiveIntensity: 0.15 }), 0, 1.45, 0.18, g);
  [['#8aa2ff', -0.2, 0.1], ['#ff6fc8', 0.2, -0.1], ['#ffd166', 0, 0.25]].forEach(([c, dx, dy]) => mesh(sph(0.13, 10, 8), mat(c), dx, 1.45 + dy, 0.22, g, false));
})();
box(building, 0.8, 20.9, 4.6, 21.1, F0, F0 + 3.0, mat('#20c060', { roughness: 0.8 }));
(() => { const g = new THREE.Group(); g.position.set(1.4, F0, 18.2); building.add(g);
  [[0, 0.25], [0.22, -0.13], [-0.22, -0.13]].forEach(([lx, lz]) => { const l = mesh(cyl(0.025, 0.025, 1.4, 6), deskLeg, lx, 0.68, lz, g); });
  rbox(g, 0.4, 0.28, 0.5, 0.06, mat('#1d1d25'), 0, 1.5, 0); const lens = mesh(cyl(0.11, 0.13, 0.25, 14), mat('#0f0f14', { metalness: 0.6 }), 0, 1.5, 0.33, g); lens.rotation.x = Math.PI / 2;
  mesh(sph(0.05, 8, 6), new THREE.MeshStandardMaterial({ color: '#f00', emissive: '#f33', emissiveIntensity: 1.5 }), 0.14, 1.67, 0.2, g, false);
})();
box(building, 0.4, 10.4, 0.5, 12.6, F0 + 0.6, F0 + 2.3, mat('#ffffff', { roughness: 0.3 }));
[['#ffd166', 10.8], ['#3ee6ff', 11.4], ['#ff6fc8', 12.0]].forEach(([c, y]) => box(building, 0.5, y - 0.2, 0.53, y + 0.2, F0 + 1.4, F0 + 1.75, mat(c)));
// HQ round table
mesh(cyl(1.4, 1.4, 0.08, 48), mat('#f8f7ff', { roughness: 0.25, metalness: 0.1 }), C.x, F0 + 0.78, C.y, building);
mesh(cyl(0.25, 0.4, 0.74, 16), deskLeg, C.x, F0 + 0.38, C.y, building);
const holo = mesh(new THREE.TorusGeometry(0.6, 0.03, 8, 48), new THREE.MeshStandardMaterial({ color: '#3ee6ff', emissive: '#3ee6ff', emissiveIntensity: 2 }), C.x, F0 + 1.6, C.y, building, false);
const holo2 = mesh(new THREE.TorusGeometry(0.4, 0.02, 8, 40), holo.material, C.x, F0 + 1.6, C.y, building, false);
const holoCore = mesh(new THREE.IcosahedronGeometry(0.22, 1), new THREE.MeshStandardMaterial({ color: '#b48cff', emissive: '#7a5cff', emissiveIntensity: 1.6, flatShading: true }), C.x, F0 + 1.6, C.y, building, false);
glow(C.x, F0 + 1.6, C.y, '#3ee6ff', 3.2, building);
// lounge: sofa, coffee table, foosball, coffee bar, lamp
const sofaM = mat('#6658ad', { roughness: 0.85 });
rbox(building, 2.6, 0.45, 1.0, 0.15, sofaM, 11, F0 + 0.35, 18.3);
rbox(building, 2.6, 0.8, 0.3, 0.12, sofaM, 11, F0 + 0.7, 17.85);
[9.75, 12.25].forEach(x => rbox(building, 0.3, 0.65, 1.0, 0.1, sofaM, x, F0 + 0.45, 18.3));
rbox(building, 0.55, 0.18, 0.4, 0.08, mat('#ff6fc8'), 10.4, F0 + 0.68, 18.0); rbox(building, 0.55, 0.18, 0.4, 0.08, mat('#3ee6ff'), 11.6, F0 + 0.68, 18.0);
box(building, 10.3, 19.6, 11.7, 20.2, F0, F0 + 0.45, mat('#9a7454', { roughness: 0.4 }));
box(building, 12.65, 19.05, 14.75, 19.85, F0 + 0.55, F0 + 0.95, mat('#2f7a4a'));
box(building, 12.6, 19.0, 14.8, 19.9, F0 + 0.9, F0 + 0.96, mat('#5a3c2a'));
[[12.7, 19.1], [14.7, 19.1], [12.7, 19.8], [14.7, 19.8]].forEach(([x, y]) => box(building, x - 0.05, y - 0.05, x + 0.05, y + 0.05, F0, F0 + 0.55, mat('#5a3c2a')));
for (let k = 0; k < 4; k++) { const r = mesh(cyl(0.02, 0.02, 1.3, 6), deskLeg, 12.9 + k * 0.6, F0 + 0.82, 19.45, building, false); r.rotation.x = Math.PI / 2; }
box(building, 15.6, 17.5, 16.4, 19.7, F0, F0 + 1.05, mat('#3a3560'));
box(building, 15.55, 17.45, 16.45, 19.75, F0 + 1.05, F0 + 1.1, mat('#9a7050'));
box(building, 15.7, 17.7, 16.25, 18.3, F0 + 1.1, F0 + 1.75, mat('#d9dbe8', { metalness: 0.4, roughness: 0.3 }));
mesh(sph(0.05), new THREE.MeshStandardMaterial({ color: '#f33', emissive: '#f33', emissiveIntensity: 1.5 }), 16.27, F0 + 1.6, 17.95, building, false);
mesh(cyl(0.04, 0.04, 2.6, 8), mat('#c9a14a', { metalness: 0.6 }), 9.4, F0 + 1.3, 21.0, building);
mesh(new THREE.ConeGeometry(0.35, 0.4, 16, 1, true), new THREE.MeshStandardMaterial({ color: '#ffe2b0', emissive: '#ffd08a', emissiveIntensity: 0.6, side: THREE.DoubleSide }), 9.4, F0 + 2.7, 21.0, building, false);
// pet corner
mesh(cyl(0.75, 0.8, 0.22, 24), mat('#c9668a'), 8.4, F0 + 0.11, 16.4, building);
mesh(cyl(0.58, 0.58, 0.06, 24), mat('#f6d9e4'), 8.4, F0 + 0.24, 16.4, building);
box(building, 17.95, 19.15, 18.85, 20.05, F0, F0 + 0.18, mat('#d9c2a0'));
mesh(cyl(0.12, 0.12, 2.0, 10), mat('#b8955f', { roughness: 1 }), 18.4, F0 + 1.0, 19.6, building);
box(building, 18.0, 19.2, 18.8, 20.0, F0 + 0.9, F0 + 1.0, mat('#d9c2a0'));
box(building, 17.95, 19.15, 18.85, 20.05, F0 + 1.88, F0 + 1.98, mat('#d9c2a0'));
mesh(cyl(0.36, 0.36, 0.08, 20), mat('#c9b6ea'), 18.4, F0 + 2.02, 19.6, building);
[[6.25, 5.9, 1.15], [7.75, 0.8, 1], [13.95, 0.75, 1.1], [20, 0.75, 1], [25.3, 7.6, 1.15], [25.3, 14.3, 1], [25.3, 21.4, 1.25], [0.85, 7.4, 1.1], [0.85, 13.8, 1], [8.2, 21.4, 1.05], [17.6, 21.4, 1], [19.6, 8, 0.9]].forEach(([x, y, s]) => plant(x, y, s * 1.1));

/* ---------- upper floors, roof and the big sign (fade out when you zoom in) ---------- */
const upper = new THREE.Group(); scene.add(upper);
const upperMats = [];
const umat = (o) => { const m = new THREE.MeshStandardMaterial(o); upperMats.push(m); return m; };
const slabM = umat({ color: '#f2f0f6', roughness: 0.5 });
const podGlass = umat({ map: towerMap, emissiveMap: towerLit, emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 0, roughness: 0.2, metalness: 0.35 });
const towGlass = umat({ map: towerMap, emissiveMap: towerLit, emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 0, roughness: 0.15, metalness: 0.45 });
const finM = umat({ color: '#e9ecf4', roughness: 0.4, metalness: 0.3 });
const roofTopM = umat({ color: '#b9b5c8', roughness: 0.9 });
const H1 = F0 + FH, POD = H1 + 0.5 + 2 * 3.6, TI = 3.6, TOW = POD + 5 * 3.4, CROWN = 6.5;
box(upper, BX0 - 0.3, BY0 - 0.3, BX1 + 0.3, BY1 + 0.3, H1, H1 + 0.5, slabM);
box(upper, CXc - 3.2, GY, CXc + 3.2, GY + 2.6, F0 + 3.3, F0 + 3.55, slabM);
facadeBox(upper, BX0, BY0, BX1, BY1, H1 + 0.5, POD, podGlass, 2.6, 3.6);
for (let f = 1; f <= 2; f++) box(upper, BX0 - 0.15, BY0 - 0.15, BX1 + 0.15, BY1 + 0.15, H1 + 0.5 + f * 3.6 - 0.3, H1 + 0.5 + f * 3.6, finM);
box(upper, BX0 + 0.3, BY0 + 0.3, BX1 - 0.3, BY1 - 0.3, POD - 0.05, POD + 0.05, roofTopM);
// podium roof garden + pool
const poolM = umat({ color: '#3fb7ff', roughness: 0.05, metalness: 0.2, emissive: '#1a90ff', emissiveIntensity: 0.25 });
box(upper, 1.5, GY - 5.5, 9.5, GY - 1.5, POD + 0.05, POD + 0.12, poolM, false);
const deckM = umat({ color: '#b48a62', roughness: 0.7 });
box(upper, 1, GY - 6, 10, GY - 1, POD + 0.04, POD + 0.08, deckM, false);
const lawnM = umat({ color: '#6ab04c', roughness: 1 });
box(upper, GX - 9, GY - 6, GX - 1, GY - 1, POD + 0.05, POD + 0.12, lawnM, false);
box(upper, 1, 1, 3, GY - 7, POD + 0.05, POD + 0.12, lawnM, false);
// tower
facadeBox(upper, TI, TI, GX - TI, GY - TI, POD, TOW, towGlass, 2.4, 3.4);
for (let f = 1; f <= 5; f++) box(upper, TI - 0.12, TI - 0.12, GX - TI + 0.12, GY - TI + 0.12, POD + f * 3.4 - 0.25, POD + f * 3.4, finM);
[[TI, TI], [GX - TI, TI], [GX - TI, GY - TI], [TI, GY - TI]].forEach(([x, y]) => box(upper, x - 0.3, y - 0.3, x + 0.3, y + 0.3, POD, TOW + CROWN + 0.4, finM));
// crown sign on all four sides
const crownBase = umat({ color: '#1a1336', roughness: 0.6 });
box(upper, TI - 0.2, TI - 0.2, GX - TI + 0.2, GY - TI + 0.2, TOW, TOW + CROWN, crownBase);
const signMats = [];
const longT = signTex((GX - 2 * TI) / CROWN, ['WILSON', 'AI OFFICE']), shortT = signTex((GY - 2 * TI) / CROWN, ['WILSON', 'AI OFFICE']);
function signFace(ax, ay, bx, by, tex) {
  const m = umat({ map: tex, emissiveMap: tex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.7, roughness: 0.5 }); signMats.push(m);
  facade(upper, ax, ay, bx, by, TOW + 0.15, TOW + CROWN - 0.15, m, Math.hypot(bx - ax, by - ay), CROWN - 0.3, false);
}
const e = 0.23;
signFace(TI - e, TI - e, GX - TI + e, TI - e, longT); signFace(GX - TI + e, TI - e, GX - TI + e, GY - TI + e, shortT);
signFace(GX - TI + e, GY - TI + e, TI - e, GY - TI + e, longT); signFace(TI - e, GY - TI + e, TI - e, TI - e, shortT);
box(upper, TI - 0.4, TI - 0.4, GX - TI + 0.4, GY - TI + 0.4, TOW + CROWN, TOW + CROWN + 0.4, finM);
// helipad + antenna
const padM = umat({ color: '#3a3d4a', roughness: 0.8 });
const pad = mesh(cyl(4, 4, 0.1, 40), padM, GX / 2, TOW + CROWN + 0.45, GY / 2, upper, false);
const hM = umat({ color: '#ffd166', emissive: '#ffd166', emissiveIntensity: 0.4 });
box(upper, GX / 2 - 1.2, GY / 2 - 0.2, GX / 2 + 1.2, GY / 2 + 0.2, TOW + CROWN + 0.5, TOW + CROWN + 0.52, hM, false);
box(upper, GX / 2 - 1.2, GY / 2 - 1.5, GX / 2 - 0.8, GY / 2 + 1.5, TOW + CROWN + 0.5, TOW + CROWN + 0.52, hM, false);
box(upper, GX / 2 + 0.8, GY / 2 - 1.5, GX / 2 + 1.2, GY / 2 + 1.5, TOW + CROWN + 0.5, TOW + CROWN + 0.52, hM, false);
const antM = umat({ color: '#d8dbe6', metalness: 0.7, roughness: 0.3 });
mesh(cyl(0.08, 0.2, 7, 8), antM, GX - TI - 1.2, TOW + CROWN + 4, TI + 1.2, upper);
const beaconM = umat({ color: '#ff2a3d', emissive: '#ff2a3d', emissiveIntensity: 2 });
const beacon = mesh(sph(0.22, 10, 8), beaconM, GX - TI - 1.2, TOW + CROWN + 7.6, TI + 1.2, upper, false);
const beaconGlow = glow(GX - TI - 1.2, TOW + CROWN + 7.6, TI + 1.2, '#ff3344', 4, upper);
// searchlights at night
const beams = [0, 1].map(k => {
  const g = new THREE.Mesh(new THREE.ConeGeometry(5, 90, 24, 1, true), new THREE.MeshBasicMaterial({ color: '#fff3d0', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
  g.geometry.translate(0, -45, 0); g.position.set(k ? GX - TI : TI, TOW + CROWN + 0.6, k ? GY - TI : TI); upper.add(g); return g;
});
// a monument sign by the road
const monT = signTex(4.2, ['WILSON AI OFFICE', '']);
const monM = new THREE.MeshStandardMaterial({ map: monT, emissiveMap: monT, emissive: '#ffffff', emissiveIntensity: 0.7, roughness: 0.5 });
signMats.push(monM);
const MX = -2, MY = PB.y1 - 3.2;
box(scene, MX - 8, MY - 0.5, MX + 8, MY + 0.5, 0.26, 1.0, mat('#3a3550', { roughness: 0.5 }));
box(scene, MX - 7.6, MY - 0.3, MX + 7.6, MY + 0.3, 1.0, 4.8, mat('#1a1336'));
facade(scene, MX + 7.4, MY + 0.32, MX - 7.4, MY + 0.32, 1.05, 4.75, monM, 14.8, 3.7, false);
facade(scene, MX - 7.4, MY - 0.32, MX + 7.4, MY - 0.32, 1.05, 4.75, monM, 14.8, 3.7, false);
[-1, 1].forEach(s => glow(MX + s * 6, 1.2, MY + 1.4, '#ffd98a', 5));

/* ---------- people ---------- */
const LOOK = {
  wilson: { sex: 'm', hair: 'slick', hairC: '#1b1820', top: '#1f2b52', pants: '#18203a', skin: '#f2cbab', suit: true, tie: '#ffd166', shoes: '#111' },
  sasa: { sex: 'f', hair: 'long', hairC: '#2a1c18', top: '#a98cff', skirt: '#3a2d66', skin: '#ffdcc6' },
  nana: { sex: 'f', hair: 'pony', hairC: '#6b3b26', top: '#ff6fc8', pants: '#2a2c48', skin: '#ffd9c2' },
  mimi: { sex: 'f', hair: 'bob', hairC: '#e2ae58', top: '#ff9466', skirt: '#f1ece2', skin: '#ffe2cf' },
  kiki: { sex: 'f', hair: 'bun', hairC: '#3a2420', top: '#3fdc8a', pants: '#21324a', skin: '#f4c7a6', headset: true },
  lulu: { sex: 'f', hair: 'long', hairC: '#7d48c8', top: '#8aa2ff', skirt: '#2a2f55', skin: '#ffdcc6', beret: '#ff6f91' },
  bobo: { sex: 'm', hair: 'cap', hairC: '#2a1d18', top: '#ffc94d', pants: '#30343f', skin: '#efc19d', capC: '#20202a' },
  wawa: { sex: 'm', hair: 'short', hairC: '#22202a', top: '#2fd0e6', pants: '#283048', skin: '#f4c7a6', glasses: true },
};
function human(L) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const skin = mat(L.skin, { roughness: 0.55 }), top = mat(L.top, { roughness: 0.6 }), lower = mat(L.pants || L.skirt, { roughness: 0.7 }), shoe = mat(L.shoes || '#2b2b36', { roughness: 0.35 });
  const legs = [-0.11, 0.11].map(x => {
    const p = new THREE.Group(); p.position.set(x, 0.78, 0); body.add(p);
    mesh(new THREE.CapsuleGeometry(0.085, 0.52, 4, 10), L.skirt ? skin : lower, 0, -0.36, 0, p);
    rbox(p, 0.17, 0.11, 0.3, 0.05, shoe, 0, -0.72, 0.05);
    return p;
  });
  const torso = mesh(new THREE.CapsuleGeometry(0.21, 0.34, 6, 14), top, 0, 1.08, 0, body); torso.scale.set(1.12, 1, 0.78);
  if (L.skirt) { mesh(new THREE.CylinderGeometry(0.2, 0.34, 0.4, 18), lower, 0, 0.72, 0, body); }
  else mesh(new THREE.CylinderGeometry(0.21, 0.2, 0.22, 14), lower, 0, 0.8, 0, body);
  if (L.suit) {
    mesh(new THREE.BoxGeometry(0.16, 0.34, 0.02), mat('#ffffff'), 0, 1.2, 0.165, body, false);
    const tie = mesh(new THREE.BoxGeometry(0.06, 0.3, 0.02), mat(L.tie, { metalness: 0.3, roughness: 0.4 }), 0, 1.17, 0.178, body, false);
  }
  mesh(cyl(0.07, 0.08, 0.14, 10), skin, 0, 1.42, 0, body);
  const arms = [-1, 1].map(s => {
    const p = new THREE.Group(); p.position.set(s * 0.29, 1.32, 0); body.add(p);
    mesh(new THREE.CapsuleGeometry(0.07, 0.36, 4, 10), top, 0, -0.24, 0, p);
    mesh(sph(0.075, 12, 10), skin, 0, -0.5, 0, p);
    return p;
  });
  const head = new THREE.Group(); head.position.set(0, 1.66, 0); body.add(head);
  mesh(sph(0.27, 28, 20), skin, 0, 0, 0, head);
  [-1, 1].forEach(s => mesh(sph(0.06, 10, 8), skin, s * 0.265, -0.02, 0, head));
  const eyeM = mat('#1c1626', { roughness: 0.2 }), hiM = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  [-1, 1].forEach(s => {
    const e = mesh(sph(0.045, 14, 10), eyeM, s * 0.095, 0.0, 0.235, head, false); e.scale.set(1, L.sex === 'f' ? 1.25 : 1.05, 0.6);
    mesh(sph(0.015, 8, 6), hiM, s * 0.095 + 0.014, 0.022, 0.262, head, false);
    const b = mesh(new THREE.BoxGeometry(0.09, 0.018, 0.02), mat(L.hairC), s * 0.098, 0.09, 0.245, head, false); b.rotation.z = -s * (L.sex === 'f' ? 0.12 : 0.04);
    if (L.sex === 'f') { const lash = mesh(new THREE.BoxGeometry(0.03, 0.012, 0.01), eyeM, s * 0.14, 0.04, 0.24, head, false); lash.rotation.z = s * 0.6; }
    const bl = mesh(new THREE.CircleGeometry(0.04, 14), new THREE.MeshBasicMaterial({ color: '#ff8fa8', transparent: true, opacity: L.sex === 'f' ? 0.55 : 0.25 }), s * 0.15, -0.075, 0.235, head, false, false); bl.rotation.y = s * 0.5;
  });
  mesh(sph(0.022, 8, 6), skin, 0, -0.05, 0.27, head, false);
  const mouth = mesh(new THREE.TorusGeometry(0.04, 0.011, 6, 14, Math.PI), mat(L.sex === 'f' ? '#e0506e' : '#a0503c'), 0, -0.1, 0.25, head, false); mouth.rotation.z = Math.PI;
  const hm = mat(L.hairC, { roughness: 0.5 });
  const cap = (r, th, rx) => { const c = mesh(new THREE.SphereGeometry(r, 28, 18, 0, Math.PI * 2, 0, th), hm, 0, 0.01, -0.01, head); c.rotation.x = rx; return c; };
  if (L.hair === 'cap') {
    const c = mesh(new THREE.SphereGeometry(0.29, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), mat(L.capC), 0, 0.04, 0, head); c.rotation.x = -0.12;
    const brim = mesh(cyl(0.2, 0.2, 0.025, 20, 1), mat(L.capC), 0, 0.06, 0.25, head); brim.scale.z = 0.8;
    cap(0.28, Math.PI * 0.62, -0.7);
  } else if (L.hair === 'bob') {
    const c = cap(0.31, Math.PI * 0.64, -0.38); c.scale.set(1.04, 1.06, 1.04);
    const f = mesh(new THREE.BoxGeometry(0.4, 0.08, 0.1), hm, 0, 0.17, 0.2, head); f.rotation.x = 0.4;
  } else {
    cap(0.292, Math.PI * 0.55, L.sex === 'f' ? -0.2 : -0.3);
    if (L.sex === 'f') { const f = mesh(new THREE.SphereGeometry(0.29, 20, 10, -0.9, 1.8, 0.2, 0.75), hm, 0, 0.02, 0.012, head); f.rotation.y = 0; }
  }
  if (L.hair === 'slick') { const q = rbox(head, 0.36, 0.1, 0.22, 0.05, hm, 0.02, 0.24, 0.1); q.rotation.set(0.35, 0, -0.08); }
  if (L.hair === 'short') { const q = rbox(head, 0.3, 0.08, 0.16, 0.04, hm, 0, 0.25, 0.1); q.rotation.x = 0.4; }
  if (L.hair === 'long') {
    rbox(head, 0.52, 0.66, 0.16, 0.08, hm, 0, -0.22, -0.16);
    [-1, 1].forEach(s => rbox(head, 0.1, 0.5, 0.14, 0.05, hm, s * 0.25, -0.16, 0.05));
  }
  if (L.hair === 'pony') { const t = mesh(new THREE.CapsuleGeometry(0.075, 0.38, 4, 10), hm, 0, -0.08, -0.34, head); t.rotation.x = 0.45; mesh(sph(0.05, 10, 8), mat('#ff6fc8'), 0, 0.12, -0.27, head); }
  if (L.hair === 'bun') { mesh(sph(0.12, 16, 12), hm, 0, 0.24, -0.16, head); }
  if (L.beret) { const b = mesh(sph(0.27, 20, 10), mat(L.beret), 0.04, 0.2, -0.02, head); b.scale.set(1.05, 0.35, 1.05); b.rotation.z = -0.25; }
  if (L.glasses) { const gm = mat('#1c1a24', { metalness: 0.5 }); [-1, 1].forEach(s => mesh(new THREE.TorusGeometry(0.065, 0.01, 6, 18), gm, s * 0.095, 0.005, 0.265, head, false)); mesh(new THREE.BoxGeometry(0.06, 0.012, 0.01), gm, 0, 0.01, 0.27, head, false); }
  if (L.headset) { const hs = mesh(new THREE.TorusGeometry(0.29, 0.018, 6, 24, Math.PI), mat('#22222a'), 0, 0.02, 0, head, false); hs.rotation.y = Math.PI / 2; [-1, 1].forEach(s => mesh(cyl(0.07, 0.07, 0.05, 12), mat('#22222a'), s * 0.29, 0, 0, head, false).rotation.z = Math.PI / 2); const mic = mesh(cyl(0.01, 0.01, 0.2, 6), mat('#22222a'), -0.24, -0.12, 0.14, head, false); mic.rotation.set(1.2, 0, 0.3); }
  const phone = mesh(new THREE.BoxGeometry(0.08, 0.15, 0.015), mat('#1d1d25', { emissive: '#3ee6ff', emissiveIntensity: 0.4 }), 0, -0.52, 0.08, arms[1], false);
  const cup = mesh(cyl(0.05, 0.04, 0.1, 10), mat('#ffffff'), 0, -0.55, 0.06, arms[0], false);
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { root, body, legs, arms, head, phone, cup };
}
const people = {};
ALL.forEach(id => { const h = human(LOOK[id]); h.root.scale.setScalar(id === 'wilson' ? 1.02 : 0.97); scene.add(h.root); people[id] = { ...h, yaw: 0, px: AG[id].pos.x, py: AG[id].pos.y, walk: 0 }; });

/* ---------- pets ---------- */
function bichon(acc) {
  const g = new THREE.Group(), w = mat('#fbfaf7', { roughness: 1 });
  const body = mesh(sph(0.3, 16, 12), w, 0, 0.42, 0, g); body.scale.set(0.95, 0.85, 1.25);
  [[0.15, 0.55, 0.1], [-0.15, 0.55, -0.1], [0, 0.6, -0.2], [0.12, 0.45, -0.25], [-0.12, 0.45, 0.2]].forEach(([x, y, z]) => mesh(sph(0.17, 10, 8), w, x, y, z, g));
  const head = new THREE.Group(); head.position.set(0, 0.72, 0.32); g.add(head);
  mesh(sph(0.27, 18, 14), w, 0, 0, 0, head);
  [[0.13, 0.14, 0.05], [-0.13, 0.14, 0.05], [0, 0.2, -0.05]].forEach(([x, y, z]) => mesh(sph(0.13, 10, 8), w, x, y, z, head));
  [-1, 1].forEach(s => { const ear = mesh(sph(0.11, 10, 8), w, s * 0.24, -0.05, -0.02, head); ear.scale.set(0.8, 1.5, 0.8); });
  const eyeM = mat('#141018', { roughness: 0.1 });
  [-1, 1].forEach(s => { mesh(sph(0.045, 10, 8), eyeM, s * 0.09, 0.02, 0.24, head, false); mesh(sph(0.014, 6, 4), new THREE.MeshBasicMaterial({ color: '#fff' }), s * 0.09 + 0.012, 0.035, 0.28, head, false); });
  mesh(sph(0.04, 10, 8), eyeM, 0, -0.06, 0.27, head, false);
  mesh(new THREE.TorusGeometry(0.03, 0.008, 6, 10, Math.PI), mat('#d0506a'), 0, -0.11, 0.25, head, false).rotation.z = Math.PI;
  if (acc === 'bow') { [-1, 1].forEach(s => { const b = mesh(new THREE.ConeGeometry(0.07, 0.12, 8), mat('#ff6fa8'), s * 0.07, 0.27, 0.02, head); b.rotation.z = s * Math.PI / 2; }); mesh(sph(0.03), mat('#ff6fa8'), 0, 0.27, 0.02, head); }
  else { const b = mesh(new THREE.TorusGeometry(0.2, 0.05, 8, 20), mat('#3f7bff'), 0, 0.58, 0.22, g); b.rotation.x = Math.PI / 2 - 0.4; }
  const legs = [[0.13, 0.2], [-0.13, 0.2], [0.13, -0.22], [-0.13, -0.22]].map(([x, z]) => mesh(cyl(0.07, 0.07, 0.26, 8), w, x, 0.13, z, g));
  mesh(sph(0.12, 10, 8), w, 0, 0.62, -0.38, g);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { g, head, legs };
}
function shorthair(bell) {
  const g = new THREE.Group(), f = mat('#8f9aac', { roughness: 0.9 }), lite = mat('#a9b3c3', { roughness: 0.9 });
  const body = mesh(sph(0.26, 16, 12), f, 0, 0.3, 0, g); body.scale.set(1, 0.85, 1.35);
  const head = new THREE.Group(); head.position.set(0, 0.52, 0.28); g.add(head);
  const hd = mesh(sph(0.22, 18, 14), f, 0, 0, 0, head); hd.scale.set(1.15, 1, 1);
  mesh(sph(0.1, 10, 8), lite, 0, -0.07, 0.16, head).scale.set(1.3, 0.8, 0.8);
  [-1, 1].forEach(s => { const e = mesh(new THREE.ConeGeometry(0.07, 0.12, 4), f, s * 0.14, 0.19, -0.02, head); e.rotation.z = -s * 0.3; });
  const am = mat('#ffb21e', { roughness: 0.2, emissive: '#7a4a00', emissiveIntensity: 0.2 });
  [-1, 1].forEach(s => { mesh(sph(0.055, 10, 8), am, s * 0.085, 0.03, 0.18, head, false); const p = mesh(sph(0.03, 8, 6), mat('#111'), s * 0.085, 0.03, 0.225, head, false); p.scale.set(0.5, 1.2, 0.5); });
  mesh(sph(0.022, 6, 4), mat('#e88a9a'), 0, -0.04, 0.215, head, false);
  const tail = mesh(new THREE.CapsuleGeometry(0.05, 0.38, 4, 8), f, 0, 0.42, -0.38, g); tail.rotation.x = -0.7;
  const legs = [[0.11, 0.16], [-0.11, 0.16], [0.11, -0.18], [-0.11, -0.18]].map(([x, z]) => mesh(cyl(0.06, 0.06, 0.18, 8), f, x, 0.09, z, g));
  const col = mesh(new THREE.TorusGeometry(0.14, 0.025, 6, 16), mat(bell ? '#ff4d6d' : '#3ee6ff'), 0, 0.42, 0.24, g); col.rotation.x = Math.PI / 2 - 0.3;
  mesh(sph(0.035, 8, 6), mat('#ffd166', { metalness: 0.8, roughness: 0.2 }), 0, 0.36, 0.36, g);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { g, head, legs, tail };
}
const pets = PETS.map((p, i) => { const m = p.kind === 'dog' ? bichon(i ? 'bandana' : 'bow') : shorthair(i === 2); scene.add(m.g); return { ...m, yaw: 0, px: p.pos.x, py: p.pos.y }; });
// robot vacuum
const vac = new THREE.Group(); scene.add(vac);
mesh(cyl(0.32, 0.34, 0.12, 24), mat('#24223a', { metalness: 0.4, roughness: 0.3 }), 0, 0.07, 0, vac);
const vacRing = mesh(new THREE.TorusGeometry(0.26, 0.02, 6, 30), new THREE.MeshStandardMaterial({ color: '#3ee6ff', emissive: '#3ee6ff', emissiveIntensity: 1.5 }), 0, 0.135, 0, vac, false); vacRing.rotation.x = Math.PI / 2;

/* ---------- per frame ---------- */
const v3 = new THREE.Vector3();
let W = 1, H = 1, lastT = 0;
function size() {
  const w = cv.clientWidth || stage.clientWidth, h = cv.clientHeight || stage.clientHeight;
  const pr = Math.min(2, devicePixelRatio || 1);
  if (w === W && h === H && pr === renderer.getPixelRatio()) return; W = w; H = h; renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
const cSky = { d: ['#5aa9ff', '#d9efff'], k: ['#3b2d7a', '#ff9e7a'], n: ['#05061a', '#1a1a48'] };
const tmpA = new THREE.Color(), tmpB = new THREE.Color(), tmpC = new THREE.Color();
function mix3(key) { const a = cSky.d[key], b = cSky.k[key], c = cSky.n[key]; tmpA.set(a).multiplyScalar(WT.d).add(tmpB.set(b).multiplyScalar(WT.k)).add(tmpC.set(c).multiplyScalar(WT.n)); return tmpA.clone(); }
let upperF = 1;
function setUpper(f) {
  if (Math.abs(f - upperF) < 0.002) return; upperF = f;
  upper.visible = f > 0.01;
  upperMats.forEach(m => { const tr = f < 0.999; if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; } m.opacity = f; m.depthWrite = !tr || f > 0.6; });
}
function yawTo(cur, target, k) { let d = target - cur; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return cur + d * k; }

function render(t) {
  size();
  const dt = Math.min(0.05, Math.max(0, t - (lastT || t))); lastT = t;
  // camera animation
  if (fly) {
    if (fly.t0 == null) fly.t0 = t; fly.t = Math.min(1, (t - fly.t0) / 1.4); const k = smooth(0, 1, fly.t), f = fly.from, to = fly.to;
    controls.target.lerpVectors(f.tg, to.tg, k);
    camera.position.copy(controls.target).add(v3.setFromSphericalCoords(lerp(f.r, to.r, k), lerp(f.p, to.p, k), lerp(f.a, to.a, k)));
    if (fly.t >= 1) fly = null;
  }
  controls.update();
  controls.target.x = Math.max(-60, Math.min(GX + 60, controls.target.x)); controls.target.z = Math.max(-60, Math.min(GY + 60, controls.target.z)); controls.target.y = Math.max(0, Math.min(30, controls.target.y));
  const dist = camera.position.distanceTo(controls.target);
  const f = smooth(34, 52, dist); setUpper(f); O3.inside = 1 - f;
  // time of day
  const N = Math.min(1, WT.n + WT.k * 0.6);
  skyU.top.value.copy(mix3(0)); skyU.bot.value.copy(mix3(1)); scene.fog.color.copy(skyU.bot.value);
  sun.intensity = 2.6 * WT.d + 1.3 * WT.k + 0.25 * WT.n;
  sun.color.set('#fff4e0').lerp(tmpB.set('#ff9a5c'), WT.k).lerp(tmpC.set('#8fa6ff'), WT.n);
  hemi.intensity = 0.95 * WT.d + 0.6 * WT.k + 0.45 * WT.n;
  hemi.color.set('#ffffff').lerp(tmpB.set('#ffc2a8'), WT.k).lerp(tmpC.set('#5a6cc8'), WT.n);
  renderer.toneMappingExposure = 1.0 + 0.25 * N;
  roomLights.forEach(l => { l.intensity = 30 * N; });
  [podGlass, towGlass, ...cityMats].forEach(m => { m.emissiveIntensity = 1.3 * N; });
  signMats.forEach(m => { m.emissiveIntensity = 0.55 + 1.1 * N; });
  bulbM.emissiveIntensity = 0.2 + 2.5 * N;
  glows.forEach(g => { g.material.opacity = 0.15 + 0.75 * N; });
  headM.emissiveIntensity = 0.3 + 2 * N; tailM.emissiveIntensity = 0.5 + 1.5 * N;
  beams.forEach((b, k) => { b.material.opacity = 0.12 * N * upperF; b.rotation.set(Math.PI + 0.35 * Math.sin(t * 0.35 + k * 2), 0, 0.4 * Math.cos(t * 0.27 + k)); });
  beaconM.emissiveIntensity = (Math.sin(t * 4) > 0.6 ? 3 : 0.3); beaconGlow.material.opacity = beaconM.emissiveIntensity > 1 ? 0.9 : 0.1;
  // fountain, hologram, fish, screens
  if (!RM) {
    jets.forEach((j, k) => { j.scale.y = 0.8 + 0.25 * Math.sin(t * 3 + k); });
    jetTop.scale.y = 0.9 + 0.15 * Math.sin(t * 2.2);
    holo.rotation.set(Math.PI / 2 + 0.3 * Math.sin(t), t * 0.8, 0); holo2.rotation.set(t * 1.2, 0.4, 0); holoCore.rotation.y = t * 1.5; holoCore.position.y = F0 + 1.6 + 0.06 * Math.sin(t * 2);
    fish.forEach((fi, k) => { const ph = t * (0.5 + k * 0.17) + k * 2; fi.position.x = 5.75 + Math.sin(ph) * 0.62; fi.rotation.y = Math.cos(ph) > 0 ? 0 : Math.PI; });
    screens.forEach((s, k) => { s.m.emissiveIntensity = 0.75 + 0.15 * Math.sin(t * 3 + k * 1.7); });
    traffic.forEach(c => { c.u += c.v * dt * (c.lane ? 1 : -1); const [x, y, r] = loopPos(c.lane ? c.u : -c.u, c.lane); c.g.position.set(x, 0, y); c.g.rotation.y = -r + (c.lane ? 0 : Math.PI); });
  }
  // people
  ALL.forEach(id => {
    const a = AG[id], p = people[id];
    const dx = a.pos.x - p.px, dy = a.pos.y - p.py, moved = Math.hypot(dx, dy); p.px = a.pos.x; p.py = a.pos.y;
    const walking = a.path.length > 0 || moved > 0.002, seated = !walking && S.atSeat(id);
    let face = null;
    if (walking && moved > 0.0005) face = Math.atan2(dx, dy);
    else if (seated) face = id === 'wilson' ? 0 : Math.PI;
    else if (a.facePl) face = Math.atan2(a.facePl[0], a.facePl[1]);
    if (face != null) p.yaw = yawTo(p.yaw, face, Math.min(1, dt * 10));
    p.root.position.set(a.pos.x, F0 + (a.z || 0) * HZ, a.pos.y);
    p.root.rotation.y = p.yaw;
    const ph = t * 9 + (a.phase || 0);
    p.walk = lerp(p.walk, walking ? 1 : 0, Math.min(1, dt * 8));
    const sw = Math.sin(ph) * 0.6 * p.walk;
    const cheer = a.state === 'done' || (a.jump || 0) > 0;
    p.body.position.y = seated ? -0.27 : Math.abs(Math.sin(ph)) * 0.05 * p.walk + (cheer ? Math.max(0, Math.sin(t * 8)) * 0.15 : 0);
    if (seated) {
      p.legs.forEach(l => { l.rotation.x = -1.45; });
      const typing = a.state === 'working' || a.state === 'routine' || a.state === 'thinking';
      p.arms.forEach((ar, k) => { ar.rotation.x = typing ? -1.15 + Math.sin(t * 14 + k * 2) * 0.06 : -0.4; ar.rotation.z = 0; });
      p.head.rotation.x = typing ? 0.1 + Math.sin(t * 1.3) * 0.03 : 0;
    } else {
      p.legs[0].rotation.x = sw; p.legs[1].rotation.x = -sw;
      if (cheer) p.arms.forEach((ar, k) => { ar.rotation.x = -2.8; ar.rotation.z = (k ? -1 : 1) * (0.3 + 0.2 * Math.sin(t * 10)); });
      else if (a.phone) { p.arms[1].rotation.x = -1.3; p.arms[0].rotation.x = -sw * 0.8; p.arms.forEach(ar => { ar.rotation.z = 0; }); }
      else p.arms.forEach((ar, k) => { ar.rotation.x = (k ? sw : -sw) * 0.8; ar.rotation.z = (k ? -1 : 1) * 0.06; });
      p.head.rotation.x = a.phone ? 0.3 : Math.sin(t * 1.1 + (a.phase || 0)) * 0.04;
    }
    p.head.rotation.y = !walking && !seated ? Math.sin(t * 0.6 + (a.phase || 0)) * 0.25 : 0;
    p.phone.visible = !!a.phone; p.cup.visible = !!a.cup;
  });
  // pets
  PETS.forEach((q, i) => {
    const m = pets[i], dx = q.pos.x - m.px, dy = q.pos.y - m.py, moved = Math.hypot(dx, dy); m.px = q.pos.x; m.py = q.pos.y;
    if (moved > 0.0005) m.yaw = yawTo(m.yaw, Math.atan2(dx, dy), Math.min(1, dt * 10));
    const hop = (q.jump || 0) > 0 ? Math.abs(Math.sin(q.jump * 9)) * 0.35 : 0;
    m.g.position.set(q.pos.x, F0 + (q.z || 0) * HZ + hop, q.pos.y); m.g.rotation.y = m.yaw;
    const walk = moved > 0.0005, ph = t * 14 + i;
    m.legs.forEach((l, k) => { l.rotation.x = walk ? Math.sin(ph + (k % 2 ? Math.PI : 0) + (k > 1 ? Math.PI / 2 : 0)) * 0.6 : 0; });
    m.g.scale.y = q.sleep ? 0.75 : 1;
    m.head.rotation.x = q.sleep ? 0.5 : Math.sin(t * 1.5 + i) * 0.08;
    if (m.tail) m.tail.rotation.z = Math.sin(t * 3 + i) * 0.4;
  });
  vac.position.set(bot.pos.x, F0, bot.pos.y); vac.rotation.y = -(bot.ang || 0);
  // labels: a metre at the camera target, in screen pixels
  const pxPerM = H / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist);
  S.setTW(pxPerM * 1.42);
  renderer.render(scene, camera);
}

const O3 = window.O3 = {
  look(x, y, dist, polar) { flyTo(new THREE.Vector3(x, 1, y), dist, polar); },
  inside: 0, render, camera, controls, get flying() { return fly; },
  turn(dir) { const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target)); flyTo(controls.target, sph.radius, sph.phi, sph.theta + dir * Math.PI / 2); },
  setOrbit(on) { controls.autoRotate = !!on; },
  zoom(dir) { const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target)); flyTo(controls.target, Math.max(controls.minDistance, Math.min(controls.maxDistance, sph.radius * (dir > 0 ? 0.62 : 1.6))), sph.phi, sph.theta); },
  enter() { flyTo(new THREE.Vector3(GX / 2, 1, GY / 2), 30, 0.85); },
  outside() { flyTo(new THREE.Vector3(GX / 2, 10, GY / 2 + 4), 100, 1.05); },
};
S.use3D((x, y, z = 0) => {
  v3.set(x, F0 + z * HZ, y).project(camera);
  if (v3.z > 1) return [-9999, -9999];
  return [(v3.x + 1) / 2 * W, (1 - v3.y) / 2 * H];
});
}
