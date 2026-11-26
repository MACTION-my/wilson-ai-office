// Wilson AI Office in 3D. The page script keeps running the office (who walks where, who is working);
// this file draws that same office as a building in a small city, with an orbit camera.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

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
// glow: bright lights, screens and neon bloom softly
const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.5, 0.45, 0.9); composer.addPass(bloom); composer.addPass(new OutputPass());

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
const bandTex = canvasTex(1024, 128, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#5f7da6'); gr.addColorStop(1, '#1d2b44'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,.16)'; for (let x = 0; x < w; x += 102) g.fillRect(x + 8, 6, 30, h - 12);
  g.fillStyle = '#c9cfd9'; for (let x = 0; x <= w; x += 102) g.fillRect(x - 3, 0, 6, h); g.fillRect(0, 0, w, 6); g.fillRect(0, h - 6, w, 6);
});
const bandLit = canvasTex(1024, 128, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); seed = 17; for (let x = 0; x < w; x += 102) if (rnd() < 0.75) { g.fillStyle = pick(['#ffd28a', '#ffe7b8', '#bfe6ff']); g.fillRect(x + 4, 8, 94, h - 16); } });
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

const signImg = new Image(), signTexs = [];
signImg.onload = () => signTexs.forEach(st => { st.draw(st.tex.image.getContext('2d')); st.tex.needsUpdate = true; });
signImg.src = 'img/sign.jpg';
function signTex(aspect, lines) {
  const w = 2048, h = Math.round(2048 / aspect);
  const draw = (g) => {
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#ffffff'); bg.addColorStop(1, '#eef0f4');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c8101e'; g.fillRect(0, 0, w, h * 0.035); g.fillRect(0, h * 0.965, w, h * 0.035);
    const [big, small] = lines;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    let fs = h * (small ? 0.5 : 0.6);
    const font = (px) => `900 ${px}px 'Arial Black','Space Grotesk','Inter',sans-serif`;
    g.font = font(fs); const mw = g.measureText(big).width; if (mw > w * 0.86) { fs *= w * 0.86 / mw; g.font = font(fs); }
    const cy = small ? h * 0.42 : h * 0.52, d = Math.max(2, fs * 0.05);
    if (signImg.complete && signImg.naturalWidth) {
      const ih = (small ? h * 0.62 : h * 0.8), iw = Math.min(w * 0.94, ih * signImg.naturalWidth / signImg.naturalHeight), ih2 = iw * signImg.naturalHeight / signImg.naturalWidth;
      g.drawImage(signImg, (w - iw) / 2, cy - ih2 / 2, iw, ih2);
    } else {
    for (let k = d; k > 0; k -= 1) { g.fillStyle = '#5e0008'; g.fillText(big, w / 2 + k * 0.6, cy + k); }
    const tg = g.createLinearGradient(0, cy - fs / 2, 0, cy + fs / 2); tg.addColorStop(0, '#ff4a4a'); tg.addColorStop(0.45, '#e01020'); tg.addColorStop(1, '#a00012');
    g.fillStyle = tg; g.fillText(big, w / 2, cy);
    g.lineWidth = Math.max(1, fs * 0.012); g.strokeStyle = 'rgba(255,190,190,.7)'; g.strokeText(big, w / 2, cy);
    }
    if (small) { g.font = `900 ${h * 0.17}px 'Microsoft YaHei','PingFang SC','Noto Sans SC',sans-serif`; g.fillStyle = '#c0101c'; g.fillText(small, w / 2, h * 0.78); }
  };
  const tex = canvasTex(w, h, draw); signTexs.push({ tex, draw }); return tex;
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
/* ---------- sky life: sun, moon, stars, drifting skyClouds, flocks of birds ---------- */
const SKYC = new THREE.Vector3(GX / 2, 0, GY / 2);
const sunDir = new THREE.Vector3(40, 70, 25).normalize(), moonDir = new THREE.Vector3(-45, 55, -35).normalize();
const haloTex = glowTex();
const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(26, 24, 16), new THREE.MeshBasicMaterial({ color: '#fff3c4', fog: false, transparent: true }));
sunDisc.position.copy(SKYC).addScaledVector(sunDir, 620); scene.add(sunDisc);
const sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: '#ffe7a0', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
sunHalo.scale.setScalar(230); sunHalo.position.copy(sunDisc.position); scene.add(sunHalo);
const moonTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#eef0f6'; g.fillRect(0, 0, w, h); seed = 31;
  for (let k = 0; k < 26; k++) { const x = rnd() * w, y = rnd() * h, r = 6 + rnd() * 26; g.fillStyle = `rgba(150,158,180,${0.25 + rnd() * 0.35})`; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.arc(x - r * 0.25, y - r * 0.25, r * 0.55, 0, Math.PI * 2); g.fill(); }
});
const moon = new THREE.Mesh(new THREE.SphereGeometry(18, 32, 24), new THREE.MeshBasicMaterial({ map: moonTex, fog: false, transparent: true }));
moon.position.copy(SKYC).addScaledVector(moonDir, 600); scene.add(moon);
const moonHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: '#a9c4ff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
moonHalo.scale.setScalar(150); moonHalo.position.copy(moon.position); scene.add(moonHalo);
seed = 77;
const starPos = []; for (let i = 0; i < 1100; i++) { const a = rnd() * Math.PI * 2, e = 0.12 + rnd() * 1.4; starPos.push(SKYC.x + Math.cos(a) * Math.cos(e) * 820, Math.sin(e) * 820, SKYC.z + Math.sin(a) * Math.cos(e) * 820); }
const stars = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3)), new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
scene.add(stars);
// skyClouds: puffy clusters that drift across and wrap around
const cloudM = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.35, fog: false, transparent: true, opacity: 0.96 });
const cloudGeo = new THREE.SphereGeometry(1, 16, 12);
const skyClouds = Array.from({ length: 16 }, (_, i) => {
  const g = new THREE.Group(), n = 5 + Math.floor(rnd() * 4), s = 7 + rnd() * 9;
  for (let k = 0; k < n; k++) { const m = new THREE.Mesh(cloudGeo, cloudM); const u = k / (n - 1) - 0.5; m.position.set(u * s * 2.6, Math.cos(u * 3) * s * 0.35 + rnd() * s * 0.3, (rnd() - 0.5) * s * 0.9); m.scale.setScalar(s * (0.6 + 0.5 * Math.cos(u * 2.6)) * (0.8 + rnd() * 0.4)); m.scale.y *= 0.72; g.add(m); }
  const a = rnd() * Math.PI * 2, r = 90 + rnd() * 260;
  g.position.set(SKYC.x + Math.cos(a) * r, 75 + rnd() * 70, SKYC.z + Math.sin(a) * r); g.rotation.y = rnd() * 0.6;
  scene.add(g); return { g, v: 2.5 + rnd() * 3 };
});
// birds: small flocks gliding in wide circles, flapping now and then
const birdM = new THREE.MeshStandardMaterial({ color: '#2b2d3a', roughness: 0.8, side: THREE.DoubleSide });
const wingGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.25, 0, 0, 0.3, 1.0, 0.0, -0.1], 3)); wingGeo.computeVertexNormals();
function bird() {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.8, 6), birdM); b.rotation.x = Math.PI / 2; g.add(b);
  const wings = [-1, 1].map(s => { const w = new THREE.Mesh(wingGeo, birdM); w.scale.x = s; g.add(w); return w; });
  g.scale.setScalar(1.3); return { g, wings, ph: rnd() * 6 };
}
const flocks = [[55, 26, 0.16], [85, 34, -0.11], [120, 42, 0.08], [70, 30, -0.14]].map(([r, h, sp], fi) => {
  const fg = new THREE.Group(); scene.add(fg);
  const bs = Array.from({ length: 5 + fi % 2 * 2 }, (_, i) => { const o = bird(); const row = Math.ceil(i / 2), side = i % 2 ? 1 : -1; o.off = new THREE.Vector3(side * row * 1.6, (rnd() - 0.5) * 0.6, -row * 1.8); o.g.position.copy(o.off); fg.add(o.g); return o; });
  return { fg, bs, r, h, sp, a0: fi * 1.7 };
});
function animSky(t, dt, N) {
  const day = WT.d + WT.k * 0.85, dusk = WT.k;
  sunDisc.material.opacity = day; sunHalo.material.opacity = day * 0.9; sunDisc.visible = sunHalo.visible = day > 0.02;
  sunDisc.material.color.set('#fff3c4').lerp(tmpB.set('#ff8a3c'), dusk); sunHalo.material.color.set('#ffe7a0').lerp(tmpB.set('#ff7a3c'), dusk);
  moon.material.opacity = N; moonHalo.material.opacity = N * 0.6; moon.visible = moonHalo.visible = N > 0.02;
  stars.material.opacity = Math.max(0, N - 0.15) * (0.75 + 0.25 * Math.sin(t * 1.7));
  cloudM.color.set('#ffffff').lerp(tmpB.set('#ffc4b4'), dusk).lerp(tmpC.set('#4a5478'), WT.n);
  cloudM.emissive.copy(cloudM.color); cloudM.emissiveIntensity = 0.35 - 0.2 * WT.n;
  skyClouds.forEach(c => { c.g.position.x += c.v * dt; if (c.g.position.x > SKYC.x + 420) c.g.position.x = SKYC.x - 420; });
  const birdsOn = WT.n < 0.7;
  flocks.forEach(f => {
    f.fg.visible = birdsOn; if (!birdsOn) return;
    const a = f.a0 + t * f.sp, x = SKYC.x + Math.cos(a) * f.r, z = SKYC.z + Math.sin(a) * f.r, y = f.h + Math.sin(t * 0.5 + f.a0) * 3;
    f.fg.position.set(x, y, z);
    f.fg.lookAt(SKYC.x + Math.cos(a + Math.sign(f.sp) * 0.1) * f.r, y, SKYC.z + Math.sin(a + Math.sign(f.sp) * 0.1) * f.r);
    f.bs.forEach(b => { const flap = (Math.sin(t * 2 + b.ph) > -0.2) ? Math.sin(t * 11 + b.ph) * 0.6 : 0.05; b.wings[0].rotation.z = -flap; b.wings[1].rotation.z = flap; });
  });
}
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
function prof(pts) {
  const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) { const p = pts[i]; if (p.length === 4) s.quadraticCurveTo(p[0], p[1], p[2], p[3]); else s.lineTo(p[0], p[1]); }
  return s;
}
function extr(g, shape, width, m, z = 0, bevel = 0.08) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.01, width - 2 * bevel), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 18 });
  geo.translate(0, 0, -Math.max(0.01, width - 2 * bevel) / 2); geo.computeVertexNormals();
  return mesh(geo, m, 0, 0, z, g);
}
function archShape(wx, r, top, half) {
  const s = new THREE.Shape(); s.moveTo(wx - half, 0.22); s.lineTo(wx - r, 0.22);
  s.absarc(wx, 0.37, r, Math.PI, 0, true); s.lineTo(wx + half, 0.22); s.lineTo(wx + half * 0.9, top); s.quadraticCurveTo(wx, top + 0.1, wx - half * 0.95, top - 0.04); s.closePath(); return s;
}
const blackGloss = mat('#0b0b10', { metalness: 0.6, roughness: 0.12 }), carbon = mat('#17171c', { roughness: 0.5 });
function wheel2(g, x, z, rimC, calC) {
  const r = 0.37, side = Math.sign(z);
  const t = mesh(new THREE.TorusGeometry(r - 0.08, 0.09, 12, 28), tyreM, x, r, z, g); t.scale.z = 1.4;
  const rimMat = mat(rimC, { metalness: 0.85, roughness: 0.22 });
  const hub = mesh(cyl(0.07, 0.07, 0.06, 12), rimMat, x, r, z + side * 0.1, g); hub.rotation.x = Math.PI / 2;
  for (let k = 0; k < 5; k++) { const sp = mesh(new THREE.BoxGeometry(0.05, 0.27, 0.03), rimMat, x, r, z + side * 0.1, g); sp.geometry.translate(0, 0.13, 0); sp.rotation.z = k * Math.PI * 2 / 5; }
  const ring = mesh(new THREE.TorusGeometry(0.27, 0.025, 6, 28), rimMat, x, r, z + side * 0.1, g);
  const disc = mesh(cyl(0.22, 0.22, 0.02, 24), mat('#9ea2ad', { metalness: 0.8, roughness: 0.4 }), x, r, z + side * 0.06, g); disc.rotation.x = Math.PI / 2;
  const cal = mesh(new THREE.BoxGeometry(0.12, 0.16, 0.05), mat(calC), x + 0.15, r + 0.1, z + side * 0.08, g, false); cal.rotation.z = -0.6;
}
function supercar(x, y, rot) {
  // a curvy red hypercar with a black canopy (generic design, no badges)
  const g = new THREE.Group(); g.position.set(x, 0.31, y); g.rotation.y = rot; scene.add(g);
  const red = new THREE.MeshPhysicalMaterial({ color: '#c90a18', metalness: 0.35, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.06 });
  extr(g, prof([[-2.25, 0.3], [2.1, 0.24], [2.42, 0.26, 2.36, 0.44], [1.6, 0.62, 0.9, 0.76], [0.1, 1.08, -0.8, 1.0], [-1.7, 0.9, -2.3, 0.84], [-2.36, 0.45]]), 1.5, red);
  [[1.42, 0.78], [-1.42, 0.92]].forEach(([wx, top]) => [-1, 1].forEach(s => extr(g, archShape(wx, 0.46, top, 0.82), 0.3, red, s * 0.82, 0.07)));
  extr(g, prof([[0.95, 0.76], [-0.05, 1.24, -0.85, 1.08], [-1.55, 0.96], [-1.5, 0.82], [0.9, 0.7]]), 1.3, blackGloss, 0, 0.06);
  [-1, 1].forEach(s => {
    const hl = mesh(new THREE.BoxGeometry(0.5, 0.05, 0.12), headM, 1.75, 0.66, s * 0.66, g, false); hl.rotation.y = -s * 0.5; hl.rotation.z = -0.2;
    mesh(new THREE.BoxGeometry(0.12, 0.2, 0.55), carbon, 2.28, 0.34, s * 0.42, g, false);
    mesh(new THREE.BoxGeometry(0.7, 0.24, 0.06), blackGloss, -0.55, 0.62, s * 0.79, g, false);
    const mi = mesh(sph(0.09, 12, 8), red, 0.55, 0.98, s * 0.92, g); mi.scale.set(1.3, 0.8, 0.6);
    mesh(new THREE.BoxGeometry(0.03, 0.03, 0.2), blackGloss, 0.55, 0.94, s * 0.82, g, false);
    const tl = mesh(cyl(0.08, 0.08, 0.05, 16), tailM, -2.39, 0.72, s * 0.58, g, false); tl.rotation.z = Math.PI / 2;
  });
  mesh(new THREE.BoxGeometry(0.12, 0.05, 1.7), red, 2.34, 0.26, 0, g, false);
  mesh(new THREE.BoxGeometry(0.3, 0.2, 1.3), carbon, -2.3, 0.36, 0, g, false);
  mesh(new THREE.BoxGeometry(0.4, 0.04, 1.4), blackGloss, -2.05, 0.9, 0, g, false);
  [[1.42, -0.84], [1.42, 0.84], [-1.42, -0.84], [-1.42, 0.84]].forEach(([wx, wz]) => wheel2(g, wx, wz, '#d9dce6', '#ffd200'));
  return g;
}
function wedgeCar(x, y, rot) {
  // a sharp white wedge supercar with gold wheels (generic design, no badges)
  const g = new THREE.Group(); g.position.set(x, 0.31, y); g.rotation.y = rot; scene.add(g);
  const white = new THREE.MeshPhysicalMaterial({ color: '#f3f1ea', metalness: 0.2, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 });
  extr(g, prof([[-2.3, 0.28], [2.15, 0.22], [2.45, 0.3], [2.3, 0.5], [0.85, 0.82], [-0.35, 1.14], [-1.6, 1.02], [-2.35, 0.92], [-2.4, 0.4]]), 1.5, white, 0, 0.05);
  [[1.42, 0.8], [-1.45, 0.98]].forEach(([wx, top]) => [-1, 1].forEach(s => extr(g, archShape(wx, 0.46, top, 0.8), 0.32, white, s * 0.83, 0.04)));
  extr(g, prof([[0.95, 0.8], [-0.35, 1.22], [-1.4, 1.08], [-1.35, 0.9], [0.9, 0.74]]), 1.3, blackGloss, 0, 0.04);
  [-1, 1].forEach(s => {
    const hl = mesh(new THREE.BoxGeometry(0.55, 0.06, 0.18), headM, 1.8, 0.6, s * 0.65, g, false); hl.rotation.y = -s * 0.45; hl.rotation.z = -0.15;
    const ins = mesh(new THREE.BoxGeometry(0.5, 0.22, 0.5), blackGloss, 2.2, 0.36, s * 0.48, g, false); ins.rotation.y = s * 0.3;
    const side = mesh(new THREE.BoxGeometry(0.85, 0.42, 0.06), blackGloss, -0.6, 0.7, s * 0.8, g, false); side.rotation.z = 0.35;
    const mi = mesh(new THREE.BoxGeometry(0.22, 0.09, 0.05), white, 0.6, 1.0, s * 0.93, g); mi.rotation.y = s * 0.2;
    mesh(new THREE.BoxGeometry(0.03, 0.03, 0.2), blackGloss, 0.6, 0.96, s * 0.83, g, false);
    mesh(new THREE.BoxGeometry(0.05, 0.06, 0.55), tailM, -2.42, 0.78, s * 0.52, g, false);
    mesh(new THREE.BoxGeometry(0.06, 0.3, 0.06), carbon, -2.05, 1.18, s * 0.5, g, false);
  });
  mesh(new THREE.BoxGeometry(0.3, 0.04, 1.85), white, -2.2, 1.34, 0, g);
  mesh(new THREE.BoxGeometry(0.35, 0.06, 1.8), carbon, 2.3, 0.22, 0, g, false);
  mesh(new THREE.BoxGeometry(0.3, 0.22, 1.4), carbon, -2.35, 0.34, 0, g, false);
  [[1.42, -0.85], [1.42, 0.85], [-1.45, -0.85], [-1.45, 0.85]].forEach(([wx, wz]) => wheel2(g, wx, wz, '#e0a12c', '#1a1a1f'));
  return g;
}
function superbike(x, y, rot) {
  // a white sports bike with blue and red livery and gold forks (generic design, no badges)
  const g = new THREE.Group(); g.position.set(x, 0.31, y); g.rotation.y = rot; scene.add(g);
  const lean = new THREE.Group(); lean.rotation.x = 0.1; g.add(lean);
  const white = new THREE.MeshPhysicalMaterial({ color: '#f6f7fa', roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 });
  const blue = new THREE.MeshPhysicalMaterial({ color: '#1d4fc4', roughness: 0.25, clearcoat: 1 }), redM = new THREE.MeshPhysicalMaterial({ color: '#e0202c', roughness: 0.25, clearcoat: 1 });
  const blk = mat('#16161b', { roughness: 0.5 }), gold = mat('#d6a133', { metalness: 0.9, roughness: 0.2 });
  [0.72, -0.72].forEach((wx, k) => {
    mesh(new THREE.TorusGeometry(0.255, 0.075, 10, 28), tyreM, wx, 0.33, 0, lean).scale.z = k ? 1.6 : 1.2;
    for (let i = 0; i < 3; i++) { const sp = mesh(new THREE.BoxGeometry(0.035, 0.24, 0.04), blk, wx, 0.33, 0, lean); sp.geometry.translate(0, 0.11, 0); sp.rotation.z = i * Math.PI * 2 / 3; }
    if (!k) [-1, 1].forEach(s => { const d = mesh(cyl(0.16, 0.16, 0.012, 24), mat('#b8bcc6', { metalness: 0.9, roughness: 0.3 }), wx, 0.33, s * 0.07, lean); d.rotation.x = Math.PI / 2; });
  });
  [-1, 1].forEach(s => { const f = mesh(cyl(0.028, 0.028, 0.78, 8), gold, 0.63, 0.7, s * 0.07, lean); f.rotation.z = 0.42; });
  const sw = mesh(new THREE.BoxGeometry(0.75, 0.08, 0.16), blk, -0.36, 0.4, 0, lean); sw.rotation.z = 0.08;
  mesh(new THREE.BoxGeometry(0.55, 0.36, 0.26), blk, 0.08, 0.55, 0, lean);
  extr(lean, prof([[1.05, 1.06], [0.98, 0.7, 0.78, 0.52], [0.45, 0.34], [0.02, 0.36], [0.12, 0.6], [0.42, 0.78], [0.44, 1.0], [0.7, 1.18, 1.05, 1.06]]), 0.34, white, 0, 0.04);
  extr(lean, prof([[0.86, 0.95], [0.6, 0.82, 0.3, 0.74], [0.34, 0.64], [0.64, 0.7, 0.93, 0.82]]), 0.37, blue, 0, 0.005);
  extr(lean, prof([[0.93, 0.82], [0.64, 0.7, 0.34, 0.64], [0.36, 0.58], [0.66, 0.62, 0.96, 0.72]]), 0.37, redM, 0, 0.005);
  extr(lean, prof([[0.45, 1.0], [0.3, 1.24, -0.05, 1.18], [-0.2, 1.04], [0.3, 0.9]]), 0.4, white, 0, 0.05);
  extr(lean, prof([[0.36, 1.13], [0.2, 1.22, 0.0, 1.17], [0.05, 1.1], [0.3, 1.06]]), 0.42, blue, 0, 0.005);
  const seat = rbox(lean, 0.5, 0.08, 0.28, 0.04, mat('#2a2a30', { roughness: 0.8 }), -0.38, 1.1, 0); seat.rotation.z = 0.12;
  extr(lean, prof([[-0.2, 1.04], [-0.88, 1.3], [-0.98, 1.31, -0.95, 1.22], [-0.3, 0.92]]), 0.26, white, 0, 0.03);
  extr(lean, prof([[-0.7, 1.23], [-0.92, 1.315], [-0.93, 1.27], [-0.72, 1.18]]), 0.28, blue, 0, 0.005);
  extr(lean, prof([[-0.58, 1.18], [-0.7, 1.23], [-0.72, 1.18], [-0.6, 1.13]]), 0.28, redM, 0, 0.005);
  const scr = mesh(new THREE.BoxGeometry(0.34, 0.02, 0.3), new THREE.MeshPhysicalMaterial({ color: '#3a4250', transparent: true, opacity: 0.55, roughness: 0.05 }), 0.92, 1.2, 0, lean); scr.rotation.z = -0.75;
  mesh(new THREE.BoxGeometry(0.06, 0.04, 0.6), blk, 0.6, 1.2, 0, lean);
  [-1, 1].forEach(s => { mesh(new THREE.BoxGeometry(0.1, 0.06, 0.1), blk, 0.86, 1.18, s * 0.24, lean); mesh(new THREE.BoxGeometry(0.06, 0.04, 0.05), headM, 1.04, 0.92, s * 0.08, lean, false); });
  const ex = mesh(cyl(0.06, 0.07, 0.4, 12), mat('#4a4c55', { metalness: 0.8, roughness: 0.3 }), -0.25, 0.42, 0.17, lean); ex.rotation.z = Math.PI / 2 + 0.25;
  mesh(new THREE.BoxGeometry(0.05, 0.05, 0.12), tailM, -0.97, 1.2, 0, lean, false);
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
wedgeCar(31.8, GY + 8.8, Math.PI / 2);
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
const bossG = new THREE.Group(); scene.add(bossG);   // Wilson's room, shown on 3F
box(building, BX0 - 0.4, BY0 - 0.4, BX1 + 0.4, BY1 + 0.4, 0.26, F0, mat('#d8d4de', { roughness: 0.6 }), false).receiveShadow = true;
// steps up to the doors
box(building, CXc - 2.6, BY1 + 0.4, CXc + 2.6, BY1 + 1.4, 0.26, 0.32, mat('#cfcad6'), false);
// interior floor
const floorM = new THREE.MeshStandardMaterial({ map: tileTex, roughness: 0.35, metalness: 0.05 });
const fl = mesh(new THREE.PlaneGeometry(GX, GY), floorM, GX / 2, F0 + 0.005, GY / 2, building, false, true); fl.rotation.x = -Math.PI / 2;
const wood = mesh(new THREE.PlaneGeometry(7, 6.5), new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.45 }), 3.5, F0 + 0.01, 3.25, bossG, false, true); wood.rotation.x = -Math.PI / 2;
function rug(x0, y0, x1, y1, color, o = 0.012, rough = 0.95) { const r = mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), mat(color, { roughness: rough }), (x0 + x1) / 2, F0 + o, (y0 + y1) / 2, building, false, true); r.rotation.x = -Math.PI / 2; return r; }
{ const r = mesh(new THREE.PlaneGeometry(4.2, 3.0), mat('#a8425f', { roughness: 0.95 }), 3.4, F0 + 0.012, 4.6, bossG, false, true); r.rotation.x = -Math.PI / 2; }
TEAM.forEach(id => { const [x0, y0, x1, y1] = AG[id].zone; const c = new THREE.Color(AG[id].color).lerp(new THREE.Color('#ffffff'), 0.55); rug(x0, y0, x1, y1, '#' + c.getHexString()); rug(x0, y0, x1, y0 + 0.12, AG[id].color, 0.016, 0.4); });
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
function plant(x, y, s = 1, parent = building, h = F0) {
  const g = new THREE.Group(); g.position.set(x, h, y); g.scale.setScalar(s); parent.add(g);
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
box(bossG, 1.8, 3.6, 4.8, 4.5, F0, F0 + 0.8, mat('#7a5540', { roughness: 0.45 }));
box(bossG, 1.75, 3.55, 4.85, 4.55, F0 + 0.8, F0 + 0.86, mat('#a37656', { roughness: 0.35 }));
screen(bossG, 3.3, F0 + 1.25, 3.85, 0.9, 0.5, Math.PI, '#ffd166');
mesh(cyl(0.06, 0.05, 0.14, 10), mat('#ffffff'), 2.2, F0 + 0.93, 3.95, bossG);
(() => { const g = chair(3.3, 2.6, '#2a2440', Math.PI); bossG.add(g); g.scale.set(1.2 / 1.6, 1.25, 1.2 / 1.6); })();
screen(bossG, 2.75, F0 + 2.2, 0.15, 3.4, 1.9, 0, '#3ee6ff');
box(bossG, 0.1, 1.2, 0.65, 4.4, F0, F0 + 3.3, mat('#5a3c34', { roughness: 0.6 }));
seed = 41;
for (let z = 0; z < 3; z++) for (let y = 1.3; y < 4.25;) { const w = 0.1 + rnd() * 0.12, hh = 0.42 + rnd() * 0.2; box(bossG, 0.66, y, 0.72, y + w, F0 + 0.25 + z * 1.0, F0 + 0.25 + z * 1.0 + hh, mat(pick(['#b48cff', '#ff6fc8', '#3ee6ff', '#ffd166', '#e9e2d0', '#7a6cff', '#ff9a8b', '#3fdc8a']))); y += w + 0.03; }
box(bossG, 4.9, 0.35, 6.6, 0.95, F0, F0 + 0.9, mat('#4a342c'));
const tank = box(bossG, 4.95, 0.4, 6.55, 0.9, F0 + 0.9, F0 + 2.0, new THREE.MeshStandardMaterial({ color: '#5fc8ff', transparent: true, opacity: 0.45, emissive: '#1b78c0', emissiveIntensity: 0.5, roughness: 0.05 }), false);
const fish = ['#ff9466', '#ffd166', '#ff6fc8'].map((c, k) => mesh(new THREE.SphereGeometry(0.09, 10, 8), mat(c, { emissive: c, emissiveIntensity: 0.2 }), 5.7, F0 + 1.3 + k * 0.2, 0.65, bossG, false));
fish.forEach(f => f.scale.set(1.6, 1, 0.7));
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
// a big glowing planet with clouds, an atmosphere, a tilted ring and two moons, floating above the HQ table
const PH0 = F0 + 2.55, PR = 1.0;
seed = 42;
const waves = Array.from({ length: 9 }, () => [1 + Math.floor(rnd() * 4), 1 + rnd() * 3, rnd() * 6.28, rnd() * 6.28, 0.4 + rnd() * 0.6]);
const landF = (lon, lat) => waves.reduce((v, [a, b, p, q, w]) => v + w * Math.sin(a * lon + p) * Math.cos(b * lat + q), 0) / 3;
const planetTex = canvasTex(1024, 512, (g, w, h) => {
  const img = g.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const lon = x / w * Math.PI * 2, lat = (y / h - 0.5) * Math.PI, f = landF(lon, lat) + 0.08 * Math.sin(lon * 13 + lat * 7), pol = Math.abs(lat) / (Math.PI / 2);
    let c;
    if (pol > 0.86 + 0.04 * Math.sin(lon * 5)) c = [240, 248, 255];
    else if (f > 0.12) { const e = Math.min(1, (f - 0.12) * 3); c = pol > 0.6 ? [150 + 60 * e, 160, 120] : [70 + 120 * e * e, 160 - 30 * e, 70 - 20 * e]; }
    else if (f > 0.06) c = [235, 215, 160];
    else { const dp = Math.min(1, (0.06 - f) * 2.5); c = [20 + 30 * (1 - dp), 110 + 70 * (1 - dp), 200 + 40 * (1 - dp)]; }
    const i = (y * w + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
});
const cityLights = canvasTex(1024, 512, (g, w, h) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h); seed = 7;
  for (let k = 0; k < 2600; k++) { const x = rnd() * w, y = h * (0.15 + rnd() * 0.7), lon = x / w * Math.PI * 2, lat = (y / h - 0.5) * Math.PI; if (landF(lon, lat) > 0.16) { g.fillStyle = pick(['#ffd28a', '#ffe9b8', '#ffb347']); g.fillRect(x, y, 2, 2); } }
});
const cloudTex = canvasTex(1024, 512, (g, w, h) => {
  g.clearRect(0, 0, w, h); seed = 11;
  for (let k = 0; k < 260; k++) { const x = rnd() * w, y = h * (0.12 + rnd() * 0.76), r = 10 + rnd() * 38; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r * 2.2, r * 0.7, 0, 0, Math.PI * 2); g.fill(); }
});
const planetG = new THREE.Group(); planetG.position.set(C.x, PH0, C.y); planetG.rotation.z = 0.35; building.add(planetG);
const planetM = new THREE.MeshStandardMaterial({ map: planetTex, emissiveMap: cityLights, emissive: '#ffcf80', emissiveIntensity: 0.25, roughness: 0.7, metalness: 0.05 });
const planet = mesh(sph(PR, 64, 48), planetM, 0, 0, 0, planetG, false);
const clouds = mesh(sph(PR * 1.025, 64, 48), new THREE.MeshStandardMaterial({ map: cloudTex, transparent: true, depthWrite: false, roughness: 1 }), 0, 0, 0, planetG, false);
const atmo = mesh(sph(PR * 1.16, 48, 32), new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
  uniforms: { c: { value: new THREE.Color('#5ec8ff') } },
  vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
  fragmentShader: 'uniform vec3 c; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.2); gl_FragColor = vec4(c, f * 0.9); }',
}), 0, 0, 0, planetG, false);
const ringTex = canvasTex(512, 8, (g, w, h) => {
  g.clearRect(0, 0, w, h); seed = 21;
  for (let x = 0; x < w; x++) { const a = (0.55 + 0.45 * rnd()) * (x > w * 0.42 && x < w * 0.47 ? 0.1 : 1); const tone = 180 + rnd() * 60; g.fillStyle = `rgba(${tone + 20},${tone},${tone - 50},${a})`; g.fillRect(x, 0, 1, h); }
});
const ringGeo = new THREE.RingGeometry(PR * 1.35, PR * 2.0, 96, 1);
{ const uv = ringGeo.attributes.uv, p = ringGeo.attributes.position; for (let i = 0; i < uv.count; i++) { const r = Math.hypot(p.getX(i), p.getY(i)); uv.setXY(i, (r - PR * 1.35) / (PR * 0.65), 0.5); } }
const pRing = mesh(ringGeo, new THREE.MeshStandardMaterial({ map: ringTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 0.8, emissive: '#ffe2b0', emissiveIntensity: 0.15 }), 0, 0, 0, planetG, false);
pRing.rotation.x = -Math.PI / 2 + 0.45;
const moons = [[0.16, 2.5, 0.7, '#d9d4cc'], [0.1, 1.9, -1.1, '#ff9a6a']].map(([r, orb, sp, c]) => ({ m: mesh(sph(r, 24, 16), mat(c, { roughness: 0.9 }), 0, 0, 0, building, false), orb, sp }));
glow(C.x, PH0, C.y, '#7fd4ff', 4.5, building);
const sparks = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(Array.from({ length: 140 }, () => { const a = rnd() * 6.28, r = 1.3 + rnd() * 1.5; return [Math.cos(a) * r, (rnd() - 0.5) * 1.8, Math.sin(a) * r]; }).flat(), 3)), new THREE.PointsMaterial({ color: '#bfe9ff', size: 0.05, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
sparks.position.set(C.x, PH0, C.y); building.add(sparks);
function animPlanet(t) {
  planet.rotation.y = t * 0.25; clouds.rotation.y = t * 0.32; pRing.rotation.z = t * 0.05;
  planetG.position.y = PH0 + 0.08 * Math.sin(t * 0.8);
  moons.forEach((o, k) => { const a = t * o.sp + k * 2; o.m.position.set(C.x + Math.cos(a) * o.orb, PH0 + Math.sin(a * 0.7) * 0.4, C.y + Math.sin(a) * o.orb); });
  sparks.rotation.y = -t * 0.12;
}

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
// tower: stacked rounded pods (navy / silver), ribbon windows, orange accents, LED edges
const podDark = umat({ color: '#35497c', roughness: 0.45, metalness: 0.25 });
const podLight = umat({ color: '#d9dde5', roughness: 0.5, metalness: 0.15 });
const bandM = umat({ map: bandTex, emissiveMap: bandLit, emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 0, roughness: 0.12, metalness: 0.45 });
const orangeM = umat({ color: '#f29a1f', roughness: 0.5, emissive: '#f29a1f', emissiveIntensity: 0.12 });
const tileGlass = umat({ color: '#93a7c2', roughness: 0.08, metalness: 0.6, emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 0 });
const tileFrame = umat({ color: '#1d2740', roughness: 0.5 });
const ledM = umat({ color: '#9ff6ff', emissive: '#3ee6ff', emissiveIntensity: 1 });
const PW = GX - 2 * TI, PD = GY - 2 * TI, PH = 3.4, shiftX = [0, 1.6, -1.3, 1.4, -0.4];
for (let f = 0; f < 5; f++) {
  const cx = GX / 2 + shiftX[f], cz = GY / 2, y0 = POD + f * PH, dark = f % 2 === 0;
  const w = PW + (dark ? 1.8 : 0.2), d = PD + (dark ? 0.6 : -0.4);
  rbox(upper, w, PH - 0.1, d, 0.95, dark ? podDark : podLight, cx, y0 + PH / 2, cz);
  // ribbon window through both long faces, with an orange end panel
  const bw = w * 0.6, bx = cx - w * 0.1 * (f % 2 ? -1 : 1);
  box(upper, bx - bw / 2 - 0.12, cz - d / 2 - 0.03, bx + bw / 2 + 0.12, cz + d / 2 + 0.03, y0 + 0.75, y0 + 2.55, tileFrame, false);
  box(upper, bx - bw / 2, cz - d / 2 - 0.07, bx + bw / 2, cz + d / 2 + 0.07, y0 + 0.88, y0 + 2.42, bandM, false);
  const ox = f % 2 ? bx - bw / 2 - 1.1 : bx + bw / 2 + 0.25;
  box(upper, ox, cz - d / 2 - 0.05, ox + 0.85, cz + d / 2 + 0.05, y0 + 0.45, y0 + 2.85, orangeM, false);
  box(upper, ox + 0.25, cz - d / 2 - 0.09, ox + 0.6, cz + d / 2 + 0.09, y0 + 0.8, y0 + 2.3, bandM, false);
  // rounded window tiles on the two short ends
  [-1, 1].forEach(s => {
    for (let k = -1; k <= 1; k++) {
      const tz = cz + k * d / 3.3, tw = d / 3.3 - 0.5, sk = ((f + k + (s > 0 ? 1 : 0)) % 3 - 1) * 0.1;
      const fr = rbox(upper, 0.2, PH - 0.75, tw + 0.3, 0.3, tileFrame, cx + s * w / 2, y0 + PH / 2, tz); fr.rotation.x = sk;
      const gl = rbox(upper, 0.26, PH - 1.05, tw, 0.24, tileGlass, cx + s * w / 2, y0 + PH / 2, tz); gl.rotation.x = sk;
    }
  });
  // glowing tech edge along the top of each pod
  [-1, 1].forEach(s => box(upper, cx - w / 2 + 1, cz + s * (d / 2 + 0.03) - 0.03, cx + w / 2 - 1, cz + s * (d / 2 + 0.03) + 0.03, y0 + PH - 0.32, y0 + PH - 0.24, ledM, false));
}
// crown sign on all four sides
const crownBase = umat({ color: '#f4f5f8', roughness: 0.4 });
box(upper, TI - 0.2, TI - 0.2, GX - TI + 0.2, GY - TI + 0.2, TOW, TOW + CROWN, crownBase);
const signMats = [];
const SIGN = ['MACTION', '连锁  |  绩效  |  资本'];
const longT = signTex((GX - 2 * TI) / CROWN, SIGN), shortT = signTex((GY - 2 * TI) / CROWN, SIGN);
function signFace(ax, ay, bx, by, tex) {
  const m = umat({ map: tex, emissiveMap: tex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.12, roughness: 0.35 }); signMats.push(m);
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
const monT = signTex(4.2, ['MACTION', '连锁  |  绩效  |  资本']);
const monM = new THREE.MeshStandardMaterial({ map: monT, emissiveMap: monT, emissive: '#ffffff', emissiveIntensity: 0.7, roughness: 0.5 });
signMats.push(monM);
const MX = -2, MY = PB.y1 - 3.2;
box(scene, MX - 8, MY - 0.5, MX + 8, MY + 0.5, 0.26, 1.0, mat('#3a3550', { roughness: 0.5 }));
box(scene, MX - 7.6, MY - 0.3, MX + 7.6, MY + 0.3, 1.0, 4.8, mat('#f4f5f8'));
facade(scene, MX + 7.4, MY + 0.32, MX - 7.4, MY + 0.32, 1.05, 4.75, monM, 14.8, 3.7, false);
facade(scene, MX - 7.4, MY - 0.32, MX + 7.4, MY - 0.32, 1.05, 4.75, monM, 14.8, 3.7, false);
[-1, 1].forEach(s => glow(MX + s * 6, 1.2, MY + 1.4, '#ffd98a', 5));

/* ---------- floors: 1F office · 2F break floor (cinema, games, pantry) · 3F the boss's floor ---------- */
// The page's simulation still has one floor plan. Two of its rooms are shown on upper floors:
// Wilson's room (x<7, y<6.5) becomes the whole 3rd floor, the lounge (9.2–16.8 × 17.2–21.4) the 2nd floor.
const FY = [0, F0, H1 + 0.5, H1 + 0.5 + 3.6];           // floor level of 1F, 2F, 3F
const SB = 1.6, OXB = (GX - 7 * SB) / 2, OYB = (GY - 6.5 * SB) / 2 + 0.6;
const SL = 1.7, OXL = (GX - 7.6 * SL) / 2, OYL = 7.6;
const inBoss = (x, y) => x < 7 && y < 6.5, inLounge = (x, y) => x > 9.2 && x < 16.8 && y > 17.2 && y < 21.4;
function floorOf(x, y) { return inBoss(x, y) ? 3 : inLounge(x, y) ? 2 : 1; }
function floorPos(x, y, out) {
  const k = floorOf(x, y);
  if (k === 3) { out.x = OXB + x * SB; out.y = OYB + y * SB; }
  else if (k === 2) { out.x = OXL + (x - 9.2) * SL; out.y = OYL + (y - 17.2) * SL; }
  else { out.x = x; out.y = y; }
  out.f = k; out.h = FY[k]; return out;
}
bossG.position.set(OXB, FY[3] - F0, OYB); bossG.scale.set(SB, 1, SB);

const floor2 = new THREE.Group(), floor3 = new THREE.Group(); scene.add(floor2, floor3);
const neon = (c, k = 1.6) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: k });
const neonMats = [];
function neonStrip(parent, ax, ay, bx, by, h, c) { const m = neon(c); neonMats.push(m); return box(parent, Math.min(ax, bx) - 0.03, Math.min(ay, by) - 0.03, Math.max(ax, bx) + 0.03, Math.max(ay, by) + 0.03, h, h + 0.04, m, false); }
function floorSign(parent, x, h, y, text, sub, c, rotY = 0, w = 5) {
  const t = canvasTex(1024, 256, g => {
    g.clearRect(0, 0, 1024, 256); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = c; g.shadowBlur = 30; g.fillStyle = c; g.font = "800 120px 'Space Grotesk','Inter',sans-serif"; g.fillText(text, 512, 104);
    g.shadowBlur = 12; g.fillStyle = '#ffffff'; g.font = "700 54px 'Noto Sans SC','Microsoft YaHei',sans-serif"; g.fillText(sub, 512, 210);
  });
  const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const p = mesh(new THREE.PlaneGeometry(w, w / 4), m, x, h, y, parent, false, false); p.rotation.y = rotY; return p;
}
function slab(parent, k, matTop) {
  box(parent, BX0, BY0, BX1, BY1, FY[k] - 0.5, FY[k] - 0.02, mat('#2b2f45', { roughness: 0.6 }));
  const f = mesh(new THREE.PlaneGeometry(GX, GY), matTop, GX / 2, FY[k] - 0.01, GY / 2, parent, false, true); f.rotation.x = -Math.PI / 2;
  // glowing edge around the floor + low glass rail on all four sides
  [[BX0, BY0, BX1, BY0], [BX1, BY0, BX1, BY1], [BX1, BY1, BX0, BY1], [BX0, BY1, BX0, BY0]].forEach(([ax, ay, bx, by]) => {
    neonStrip(parent, ax, ay, bx, by, FY[k] - 0.06, '#3ee6ff');
    const g = facade(parent, ax, ay, bx, by, FY[k], FY[k] + 3.2, glassM, 1, 1, false); g.renderOrder = 2;
    box(parent, Math.min(ax, bx) - 0.08, Math.min(ay, by) - 0.08, Math.max(ax, bx) + 0.08, Math.max(ay, by) + 0.08, FY[k] + 3.1, FY[k] + 3.2, frameM);
  });
}
// elevators: a glass lift with glowing doors on every floor where people arrive
function lift(parent, x, y, h, rotY, label) {
  const g = new THREE.Group(); g.position.set(x, h, y); g.rotation.y = rotY; parent.add(g);
  rbox(g, 2.2, 3.0, 0.5, 0.08, mat('#20233a', { metalness: 0.6, roughness: 0.3 }), 0, 1.5, -0.25);
  [-0.48, 0.48].forEach(dx => rbox(g, 0.9, 2.4, 0.06, 0.03, mat('#c9d3ea', { metalness: 0.9, roughness: 0.18 }), dx, 1.25, 0.02));
  const lm = neon('#3ee6ff', 2.2); neonMats.push(lm);
  box(g, -1.05, -0.03, 1.05, 0.03, 2.55, 2.62, lm, false); box(g, -1.05, -0.03, -1.0, 0.03, 0, 2.6, lm, false); box(g, 1.0, -0.03, 1.05, 0.03, 0, 2.6, lm, false);
  floorSign(g, 0, 2.85, 0.04, label, '电梯 LIFT', '#3ee6ff', 0, 1.8);
  return g;
}

/* 1F: reception where Wilson's room was, lifts up to 2F and 3F */
{
  const rec = mat('#f4f4fa', { roughness: 0.3 }), gold = mat('#d8b25a', { metalness: 0.8, roughness: 0.25 });
  rbox(building, 3.4, 1.05, 1.0, 0.25, rec, 3.6, F0 + 0.53, 3.9); box(building, 1.9, 4.38, 5.3, 4.42, F0 + 0.3, F0 + 0.36, gold);
  box(building, 0.3, 0.3, 6.8, 0.5, F0, F0 + 3.6, mat('#1b1e33', { roughness: 0.5 }));
  floorSign(building, 3.5, F0 + 2.4, 0.52, 'MACTION', '欢迎光临 · 接待处', '#ff4a5a', 0, 5.5);
  lift(building, 7.4, 4.9, F0, -Math.PI / 2, '3F 老板');
  lift(building, 13, 16.9, F0, Math.PI, '2F 休闲');
  floorSign(building, 13, F0 + 0.03, 19.6, '2F ↑', '休闲区 · 电影 · 游戏 · 茶点', '#ff6fc8', 0, 4).rotation.x = -Math.PI / 2;
}

/* 2F: cinema, game zone, pantry, nap pods */
{
  const P = floor2, h = FY[2];
  const carpet = canvasTex(256, 256, (g, w) => { g.fillStyle = '#2a2350'; g.fillRect(0, 0, w, w); seed = 12; for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${120 + rnd() * 80},${90 + rnd() * 60},${200 + rnd() * 55},${rnd() * 0.25})`; g.fillRect(rnd() * w, rnd() * w, 2, 2); } }, true); carpet.repeat.set(8, 8);
  slab(P, 2, new THREE.MeshStandardMaterial({ map: carpet, roughness: 0.9 }));
  lift(P, 13, OYL - 0.7, h, Math.PI, '1F ↓');
  floorSign(P, 13, h + 3.0, OYL - 1.2, '2F · LOUNGE', '休息 · 电影 · 游戏 · 茶点', '#ff6fc8', 0, 6);
  // centre (where the lounge visits land): ping-pong between FOOS_L and FOOS_R, sofa at SOFA, coffee bar at COFFEE
  const tb = new THREE.Group(); tb.position.set(OXL + (13.7 - 9.2) * SL, h, OYL + (19.45 - 17.2) * SL); P.add(tb);
  rbox(tb, 2.74, 0.06, 1.52, 0.02, mat('#1f5fd6', { roughness: 0.4 }), 0, 0.76, 0); box(tb, -0.02, -0.76, 0.02, 0.76, 0.79, 0.95, mat('#ffffff'), false);
  box(tb, -1.37, -0.01, 1.37, 0.01, 0.79, 0.795, mat('#ffffff'), false);
  [[-1.1, -0.6], [1.1, -0.6], [-1.1, 0.6], [1.1, 0.6]].forEach(([x, z]) => box(tb, x - 0.04, z - 0.04, x + 0.04, z + 0.04, 0, 0.73, deskLeg));
  const sofaM2 = mat('#8a4fd8', { roughness: 0.85 });
  const sx = OXL + (11.0 - 9.2) * SL, sy = OYL + (19.1 - 17.2) * SL;
  rbox(P, 2.6, 0.45, 1.0, 0.15, sofaM2, sx, h + 0.35, sy + 0.8); rbox(P, 2.6, 0.8, 0.3, 0.12, sofaM2, sx, h + 0.7, sy + 1.25);
  const cx = OXL + (15.0 - 9.2) * SL + 0.9, cy = OYL + (18.5 - 17.2) * SL;
  rbox(P, 1.0, 1.05, 2.6, 0.08, mat('#1d1b2e'), cx, h + 0.53, cy); box(P, cx - 0.55, cy - 1.35, cx + 0.55, cy + 1.35, h + 1.05, h + 1.1, mat('#c9a06a'));
  neonStrip(P, cx - 0.52, cy - 1.3, cx - 0.52, cy + 1.3, h + 0.9, '#ff9466');
  box(P, cx - 0.2, cy - 0.8, cx + 0.2, cy - 0.3, h + 1.1, h + 1.6, mat('#d9dbe8', { metalness: 0.6, roughness: 0.3 }));
  [-0.1, 0.5, 1.0].forEach(dz => mesh(cyl(0.07, 0.06, 0.16, 12), mat(pick(['#ffffff', '#ffd166', '#ff9466'])), cx, h + 1.18, cy + dz, P));
  // cinema (front-left): big glowing screen + three rows of sofas
  const scr = new THREE.MeshStandardMaterial({ color: '#0b0b18', emissive: '#7a5cff', emissiveIntensity: 1.2 }); neonMats.push(scr);
  const cinTex = canvasTex(1024, 512, g => { const gr = g.createLinearGradient(0, 0, 1024, 512); gr.addColorStop(0, '#2b1d7a'); gr.addColorStop(1, '#ff4fa8'); g.fillStyle = gr; g.fillRect(0, 0, 1024, 512); g.fillStyle = 'rgba(255,255,255,.9)'; g.font = "800 90px 'Space Grotesk',sans-serif"; g.textAlign = 'center'; g.fillText('NOW SHOWING', 512, 220); g.font = "700 60px 'Noto Sans SC','Microsoft YaHei',sans-serif"; g.fillText('MACTION 电影之夜 🍿', 512, 330); });
  scr.emissiveMap = cinTex; scr.emissive.set('#ffffff'); scr.emissiveIntensity = 0.9;
  const sc = mesh(new THREE.PlaneGeometry(6.4, 3.0), scr, 0.25, h + 2.0, 18.3, P, false, false); sc.rotation.y = Math.PI / 2;
  box(P, 0.1, 15.0, 0.25, 21.6, h, h + 3.4, mat('#14122a'));
  for (let r = 0; r < 3; r++) { const x = 3.6 + r * 2.0; box(P, x - 0.9, 15.4, x + 0.9, 21.2, h, h + 0.12 * r, mat('#231d44'));
    [16.3, 18.3, 20.3].forEach(y => { rbox(P, 1.0, 0.45, 1.6, 0.15, mat(r === 0 ? '#c2304d' : '#a0283f', { roughness: 0.85 }), x, h + 0.12 * r + 0.3, y); rbox(P, 0.3, 0.8, 1.6, 0.12, mat('#8a2236', { roughness: 0.85 }), x + 0.45, h + 0.12 * r + 0.6, y); }); }
  neonStrip(P, 0.3, 15.0, 9.0, 15.0, h + 0.02, '#ff6fc8');
  floorSign(P, 5, h + 3.0, 15.0, 'CINEMA', '电影院', '#ff6fc8', 0, 4.5);
  mesh(cyl(0.35, 0.28, 0.6, 16), mat('#e83b3b'), 8.8, h + 0.3, 21.0, P); mesh(sph(0.36, 14, 10), mat('#fff3d0'), 8.8, h + 0.66, 21.0, P);
  // game zone (front-right): arcade cabinets, VR ring, console corner with bean bags
  const arcade = (x, y, c) => { const g = new THREE.Group(); g.position.set(x, h, y); g.rotation.y = -Math.PI / 2; P.add(g);
    rbox(g, 0.9, 1.9, 0.8, 0.08, mat('#15142a'), 0, 0.95, 0); const s = new THREE.MeshStandardMaterial({ color: '#000', emissive: c, emissiveIntensity: 1.6 }); neonMats.push(s);
    const f = mesh(new THREE.PlaneGeometry(0.7, 0.55), s, 0, 1.35, 0.41, g, false, false); f.rotation.x = -0.25;
    box(g, -0.45, 0.38, 0.45, 0.42, 1.88, 1.96, s, false); rbox(g, 0.85, 0.12, 0.35, 0.04, mat('#2a2848'), 0, 0.95, 0.45); };
  [[25.1, 15.8, '#3ee6ff'], [25.1, 17.0, '#ff6fc8'], [25.1, 18.2, '#ffd166'], [25.1, 19.4, '#3fdc8a']].forEach(([x, y, c]) => arcade(x, y, c));
  const vr = new THREE.MeshStandardMaterial({ color: '#3ee6ff', emissive: '#3ee6ff', emissiveIntensity: 2, transparent: true, opacity: 0.85 }); neonMats.push(vr);
  const vring = mesh(new THREE.RingGeometry(1.0, 1.15, 48), vr, 21.0, h + 0.03, 18.0, P, false, false); vring.rotation.x = -Math.PI / 2;
  floorSign(P, 21, h + 3.0, 15.0, 'GAME ZONE', '游戏区', '#3ee6ff', 0, 4.5);
  screen(P, 17.0, h + 1.5, 21.6, 2.6, 1.4, Math.PI, '#ff9466');
  [[16.2, 19.9, '#ffd166'], [17.8, 19.9, '#3ee6ff']].forEach(([x, y, c]) => { const b = mesh(sph(0.5, 16, 12), mat(c, { roughness: 0.9 }), x, h + 0.35, y, P); b.scale.set(1, 0.65, 1); });
  neonStrip(P, 14.5, 15.0, 25.8, 15.0, h + 0.02, '#3ee6ff');
  // pantry (back-left): counter, fridge, snack wall, round tables with stools
  floorSign(P, 4.2, h + 3.0, 0.4, 'PANTRY', '茶点 · 饮食区', '#ffd166', 0, 4.5);
  rbox(P, 6.0, 1.0, 0.8, 0.06, mat('#f4f4fa', { roughness: 0.3 }), 4.2, h + 0.5, 1.0); box(P, 1.2, 0.55, 7.2, 1.45, h + 1.0, h + 1.06, mat('#c9a06a'));
  rbox(P, 0.9, 2.1, 0.8, 0.06, mat('#d9dbe8', { metalness: 0.7, roughness: 0.25 }), 7.9, h + 1.05, 0.9);
  box(P, 0.2, 2.2, 0.35, 6.2, h + 0.8, h + 2.6, mat('#3a2c24'));
  seed = 61; for (let r = 0; r < 3; r++) for (let k = 0; k < 9; k++) box(P, 0.36, 2.4 + k * 0.42, 0.5, 2.7 + k * 0.42, h + 0.95 + r * 0.55, h + 1.25 + r * 0.55, mat(pick(['#ff6fc8', '#ffd166', '#3ee6ff', '#ff9466', '#3fdc8a', '#ffffff'])));
  [[3.0, 4.4], [6.0, 4.4], [3.0, 6.0]].forEach(([x, y]) => { mesh(cyl(0.55, 0.55, 0.05, 24), mat('#ffffff', { roughness: 0.3 }), x, h + 0.75, y, P); mesh(cyl(0.06, 0.2, 0.72, 10), deskLeg, x, h + 0.36, y, P);
    [0, 1, 2, 3].forEach(q => { const a = q * Math.PI / 2 + 0.4; mesh(cyl(0.2, 0.2, 0.06, 14), mat(pick(['#ffd166', '#ff6fc8', '#3ee6ff'])), x + Math.cos(a) * 0.85, h + 0.5, y + Math.sin(a) * 0.85, P); }); });
  // nap pods (back-right)
  floorSign(P, 22, h + 3.0, 0.4, 'NAP & MASSAGE', '休息舱 · 按摩椅', '#3fdc8a', 0, 4.5);
  [19.6, 22.0, 24.4].forEach(x => { const pod = mesh(new THREE.CapsuleGeometry(0.7, 1.3, 8, 18), mat('#f2f0f6', { roughness: 0.3 }), x, h + 0.75, 3.0, P); pod.rotation.x = Math.PI / 2;
    const w = mesh(sph(0.62, 18, 12), new THREE.MeshStandardMaterial({ color: '#1b2440', emissive: '#3fdc8a', emissiveIntensity: 0.6, transparent: true, opacity: 0.8 }), x, h + 0.95, 2.2, P, false); w.scale.set(0.9, 0.6, 0.6); });
  [[1.0, 13.0], [25.0, 8.0], [12.5, 14.6], [9.4, 1.0], [25.0, 13.0]].forEach(([x, y]) => plant(x, y, 1.2, P, h));
}

/* 3F: the boss's floor (Wilson's room scaled up) + meeting room, guest lounge, trophy wall */
{
  const P = floor3, h = FY[3];
  const wt = woodTex.clone(); wt.repeat.set(9, 8); wt.needsUpdate = true;
  slab(P, 3, new THREE.MeshStandardMaterial({ map: wt, roughness: 0.4 }));
  const mx = OXB + 6.2 * SB + 1.3, my = OYB + 4.9 * SB;
  lift(P, mx + 0.3, my, h, -Math.PI / 2, '1F ↓');
  floorSign(P, GX / 2, h + 3.0, 0.4, 'WILSON · CEO', '3F 老板办公室 · MACTION', '#ffd166', 0, 7);
  // meeting room (left)
  const mt = mat('#2a2238', { roughness: 0.35 });
  rbox(P, 2.0, 0.08, 6.0, 0.04, mat('#a37656', { roughness: 0.35 }), 3.6, h + 0.78, 11.0); box(P, 3.4, 9.0, 3.8, 13.0, h, h + 0.74, mt);
  [9.0, 10.3, 11.6, 13.0].forEach(y => [2.2, 5.0].forEach(x => { const c = chair(x, y, '#2a2440', x < 3.6 ? -Math.PI / 2 : Math.PI / 2); c.position.y = h; P.add(c); }));
  screen(P, 3.6, h + 1.8, 7.4, 2.8, 1.5, 0, '#3ee6ff');
  floorSign(P, 3.6, h + 3.0, 7.0, 'MEETING', '会议室', '#3ee6ff', 0, 3.5);
  // guest lounge (right): leather sofas round a glowing table
  const leather = mat('#5a3a2a', { roughness: 0.55 });
  [[22.8, 4.6, 0], [22.8, 9.2, Math.PI]].forEach(([x, y, r]) => { const g = new THREE.Group(); g.position.set(x, h, y); g.rotation.y = r; P.add(g); rbox(g, 3.0, 0.45, 1.0, 0.15, leather, 0, 0.35, 0); rbox(g, 3.0, 0.8, 0.3, 0.12, leather, 0, 0.7, -0.45); });
  mesh(cyl(0.9, 0.9, 0.08, 32), mat('#f4f4fa', { roughness: 0.2 }), 22.8, h + 0.45, 6.9, P); const gl3 = neon('#ffd166', 1.4); neonMats.push(gl3); mesh(cyl(0.92, 0.92, 0.02, 32), gl3, 22.8, h + 0.4, 6.9, P, false);
  // trophy & whisky wall (right side, back)
  box(P, 25.4, 11.0, 25.7, 19.0, h, h + 3.0, mat('#1b1e33'));
  for (let r = 0; r < 3; r++) { box(P, 25.0, 11.2, 25.4, 18.8, h + 0.9 + r * 0.8, h + 0.94 + r * 0.8, mat('#c9a06a'));
    for (let k = 0; k < 7; k++) mesh(r === 1 ? new THREE.ConeGeometry(0.13, 0.42, 12) : cyl(0.07, 0.08, 0.36, 10), r === 1 ? mat('#d8b25a', { metalness: 0.9, roughness: 0.2 }) : mat(pick(['#8a3a12', '#c27a2a', '#2a4a2a']), { roughness: 0.15 }), 25.2, h + 1.15 + r * 0.8, 11.8 + k * 1.0, P); }
  neonStrip(P, 25.0, 11.0, 25.0, 19.0, h + 3.0, '#ffd166');
  // gold carpet path from the lift to the desk
  const rp = mesh(new THREE.PlaneGeometry(3.2, 1.6), mat('#7a1f2e', { roughness: 0.9 }), mx - 1.8, h + 0.015, my, P, false, true); rp.rotation.x = -Math.PI / 2;
  [[1.0, 1.2], [25.0, 1.2], [1.0, 20.8], [25.0, 20.8], [17.0, 20.8], [9.0, 20.8]].forEach(([x, y]) => plant(x, y, 1.3, P, h));
}

/* ---------- people ---------- */
const LOOK = {
  wilson: { sex: 'm', hair: 'quiff', hairC: '#1d1714', skin: '#f6d2b6', iris: '#5a3a22', top: '#1f2b52', pants: '#1a2140', suit: true, tie: '#ffd166', shoes: '#111' },
  sasa: { sex: 'f', hair: 'long', hairC: '#7a5034', skin: '#fad9c4', iris: '#6b4226', top: '#2a9fb8', pants: '#3b5a86' },
  nana: { sex: 'f', hair: 'bob', hairC: '#5e3d27', skin: '#fbdcc8', iris: '#5c3820', top: '#ffffff', jacket: '#d8b48a', pants: '#3b5a86' },
  mimi: { sex: 'f', hair: 'wavy', hairC: '#8a5a38', skin: '#fcdfcb', iris: '#6e4628', top: '#f7941d', pants: '#3b5a86' },
  kiki: { sex: 'f', hair: 'wavy', hairC: '#3e2a22', skin: '#f7d2b8', iris: '#4e301c', top: '#f4c430', cardigan: true, pants: '#2c3550', headset: true },
  lulu: { sex: 'f', hair: 'pony', hairC: '#6a4630', skin: '#fad9c4', iris: '#6b4226', top: '#ff7aa8', skirt: '#2a2f55', beret: '#ff6f91' },
  bobo: { sex: 'f', hair: 'wavy', hairC: '#8a3f22', skin: '#fad9c4', iris: '#5c3820', top: '#ffffff', jacket: '#9a2b2b', pants: '#30343f' },
  wawa: { sex: 'f', hair: 'long', hairC: '#1e1a1c', skin: '#f7d2b8', iris: '#3a2416', top: '#ffffff', jacket: '#3f6fb5', pants: '#2b3550', glasses: true },
};
const FACE = { R: 0.3, t0: Math.PI * 0.3, tl: Math.PI * 0.58, pl: 1.9 };
function faceTex(L) {
  const { R, t0, tl, pl } = FACE, S = 512;
  const F = (x, y) => { const th = Math.acos(Math.max(-1, Math.min(1, y / R))), ring = R * Math.sin(th); return [S / 2 + Math.asin(Math.max(-1, Math.min(1, x / ring))) / pl * S, (th - t0) / tl * S]; };
  return canvasTex(S, S, (g) => {
    g.clearRect(0, 0, S, S); g.lineCap = 'round'; g.lineJoin = 'round';
    // blush
    [-1, 1].forEach(s => { const [bx, by] = F(s * 0.165, -0.07); const gr = g.createRadialGradient(bx, by, 0, bx, by, 46); gr.addColorStop(0, L.sex === 'f' ? 'rgba(255,120,130,.55)' : 'rgba(230,110,100,.28)'); gr.addColorStop(1, 'rgba(255,120,130,0)'); g.fillStyle = gr; g.fillRect(bx - 50, by - 50, 100, 100); });
    // beard
    if (L.beard) {
      g.fillStyle = L.hairC; g.globalAlpha = 0.92; g.beginPath();
      const pts = [[-0.25, 0.0], [-0.24, -0.12], [-0.17, -0.22], [0, -0.285], [0.17, -0.22], [0.24, -0.12], [0.25, 0.0], [0.2, -0.04], [0.12, -0.1], [0.05, -0.085], [0, -0.095], [-0.05, -0.085], [-0.12, -0.1], [-0.2, -0.04]];
      pts.forEach(([x, y], i) => { const [px, py] = F(x, y); i ? g.lineTo(px, py) : g.moveTo(px, py); }); g.closePath(); g.fill(); g.globalAlpha = 1;
    }
    // brows
    g.strokeStyle = L.hairC === '#1d1714' || L.hairC === '#1e1a1c' ? L.hairC : '#3a2418'; g.lineWidth = L.sex === 'f' ? 13 : 19;
    [-1, 1].forEach(s => { const a = F(s * 0.045, 0.115), b = F(s * 0.105, L.sex === 'f' ? 0.15 : 0.145), c = F(s * 0.17, 0.12); g.beginPath(); g.moveTo(...a); g.quadraticCurveTo(...b, ...c); g.stroke(); });
    // nose shadow
    g.strokeStyle = 'rgba(150,70,50,.35)'; g.lineWidth = 5; const n1 = F(-0.03, -0.065), n2 = F(0, -0.078), n3 = F(0.03, -0.065); g.beginPath(); g.moveTo(...n1); g.quadraticCurveTo(...n2, ...n3); g.stroke();
    // big open smile with teeth
    const L0 = F(-0.09, -0.112), R0 = F(0.09, -0.112), U = F(0, -0.122), D = F(0, -0.26);
    const path = () => { g.beginPath(); g.moveTo(...L0); g.quadraticCurveTo(...U, ...R0); g.quadraticCurveTo(...D, ...L0); g.closePath(); };
    path(); g.fillStyle = '#5a1420'; g.fill();
    g.save(); path(); g.clip();
    g.fillStyle = '#ffffff'; g.fillRect(0, U[1] - 30, S, 30 + 24);
    const T = F(0, -0.205); g.fillStyle = '#e86a7a'; g.beginPath(); g.ellipse(T[0], T[1] + 14, 46, 24, 0, 0, Math.PI * 2); g.fill();
    g.restore();
    path(); g.strokeStyle = L.sex === 'f' ? '#d4546a' : '#b0584e'; g.lineWidth = L.sex === 'f' ? 7 : 5; g.stroke();
    // smile creases
    g.strokeStyle = 'rgba(160,80,60,.35)'; g.lineWidth = 4;
    [-1, 1].forEach(s => { const a = F(s * 0.1, -0.095), b = F(s * 0.112, -0.12); g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); });
  });
}
const irisTexs = {};
function irisTex(c) {
  if (irisTexs[c]) return irisTexs[c];
  return irisTexs[c] = canvasTex(16, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#050307'); gr.addColorStop(0.36, '#050307'); gr.addColorStop(0.4, c); gr.addColorStop(0.75, c); gr.addColorStop(0.92, '#1a0f08'); gr.addColorStop(1, '#1a0f08');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}
// a tube that thins from r0 at the root to r1 at the tip (hair locks, strands)
function taperTube(pts, r0, r1, seg = 20, rad = 8) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2])));
  const g = new THREE.TubeGeometry(curve, seg, 1, rad, false);
  const pos = g.attributes.position, v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let k = 0; k <= seg; k++) {
    const tt = k / seg; curve.getPointAt(tt, c); const r = r0 + (r1 - r0) * Math.pow(tt, 1.3);
    for (let j = 0; j <= rad; j++) { const i = k * (rad + 1) + j; v.fromBufferAttribute(pos, i).sub(c).multiplyScalar(r).add(c); pos.setXYZ(i, v.x, v.y, v.z); }
  }
  g.computeVertexNormals(); return g;
}
function lathe(profile, seg = 28) { return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg); }
const ART_V = 3;
// where the eyes sit in each 512px portrait: [mid x, mid y, distance between the eyes]
const FACE_PTS = { wilson: [256, 183, 82], sasa: [262, 165, 67], nana: [259, 211, 74], mimi: [257, 194, 77], kiki: [261, 201, 79], lulu: [255, 195, 75], bobo: [257, 190, 79], wawa: [263, 193, 74] };
// paint the face from the AI portrait onto the front of the 3D head, matched at the eyes and faded out at the edges
function portraitFace(L, h) {
  const fp = FACE_PTS[L.id]; if (!fp) return;
  const im = new Image();
  im.onload = () => {
    const { R, t0, tl, pl } = FACE, S = 1024;
    const F = (x, y) => { const th = Math.acos(Math.max(-1, Math.min(1, y / R))), ring = R * Math.sin(th); return [S / 2 + Math.asin(Math.max(-1, Math.min(1, x / ring))) / pl * S, (th - t0) / tl * S]; };
    const [ex, ey, d] = fp, T = F(0, 0.02);
    const kx = (F(0.107, 0.02)[0] - F(-0.107, 0.02)[0]) / d, ky = (F(0, -0.08)[1] - T[1]) / 0.1 / (d / 0.214);
    const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
    g.drawImage(im, T[0] - ex * kx, T[1] - ey * ky, im.width * kx, im.height * ky);
    g.globalCompositeOperation = 'destination-in';
    const cx = T[0], cy = T[1] + 0.45 * d * ky, rx = 1.18 * d * kx, ry = 1.42 * d * ky;
    g.save(); g.translate(cx, cy); g.scale(1, ry / rx);
    const gr = g.createRadialGradient(0, 0, rx * 0.55, 0, 0, rx); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(-rx, -rx, 2 * rx, 2 * rx); g.restore();
    // skin colour: average the skin-like pixels on the cheeks and forehead, near where the face fades out
    const sc = document.createElement('canvas'); sc.width = sc.height = 512; const sg = sc.getContext('2d'); sg.drawImage(im, 0, 0, 512, 512);
    const all = sg.getImageData(0, 0, 512, 512).data; let r = 0, gg = 0, b = 0, n = 0;
    for (const [px0, py0] of [[0, -0.3], [-0.25, -0.3], [0.25, -0.3], [0, 0.12], [0, 0.95], [-0.2, 0.9], [0.2, 0.9], [-0.55, 0.75], [0.55, 0.75]]) for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const x = Math.round(ex + px0 * d + dx), y = Math.round(ey + py0 * d + dy); if (x < 0 || y < 0 || x > 511 || y > 511) continue; const i = (y * 512 + x) * 4, R0 = all[i], G0 = all[i + 1], B0 = all[i + 2]; if (R0 > 150 && R0 > G0 + 15 && G0 > B0 && R0 - B0 < 120) { r += R0; gg += G0; b += B0; n++; } }
    if (!n) { r = 240; gg = 200; b = 175; n = 1; }
    const col = new THREE.Color(`rgb(${Math.round(r / n)},${Math.round(gg / n)},${Math.round(b / n)})`);
    h.skin.color.copy(col); h.skin.emissive.copy(col);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    const m = h.decal.material; m.map = t; m.emissiveMap = t; m.emissive.set('#ffffff'); m.emissiveIntensity = 0.32; m.needsUpdate = true;
    h.faceParts.forEach(o => { o.visible = false; });
  };
  im.src = 'img/' + L.id + '.jpg?v=' + ART_V;
}
function human(L) {
  const faceParts = [];
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const F = L.sex === 'f', R = FACE.R;
  const skin = new THREE.MeshPhysicalMaterial({ color: L.skin, roughness: 0.55, sheen: 0.6, sheenColor: new THREE.Color('#ffb59a'), emissive: L.skin, emissiveIntensity: 0.32 }); skin.sheen = 0;
  const cloth = (c, o = {}) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.75, sheen: 0.8, sheenRoughness: 0.6, sheenColor: new THREE.Color('#ffffff').lerp(new THREE.Color(c), 0.5), ...o });
  const outer = cloth(L.jacket || L.top), inner = cloth(L.suit ? '#ffffff' : L.top), lower = cloth(L.pants || L.skirt, { roughness: 0.8 });
  const shoe = mat(L.shoes || '#f4f4f6', { roughness: 0.35 });
  const hm = new THREE.MeshPhysicalMaterial({ color: L.hairC, roughness: 0.38, sheen: 1, sheenRoughness: 0.35, sheenColor: new THREE.Color('#ffffff').lerp(new THREE.Color(L.hairC), 0.45), clearcoat: 0.3, clearcoatRoughness: 0.4 });
  // legs
  const legs = [-1, 1].map(s => {
    const p = new THREE.Group(); p.position.set(s * (F ? 0.085 : 0.1), 0.76, 0); body.add(p);
    mesh(new THREE.CapsuleGeometry(F ? 0.072 : 0.082, 0.46, 6, 14), L.skirt ? skin : lower, 0, -0.33, 0, p);
    rbox(p, F ? 0.14 : 0.16, 0.09, 0.28, 0.045, shoe, 0, -0.69, 0.05);
    mesh(new THREE.BoxGeometry(F ? 0.15 : 0.17, 0.022, 0.29), mat('#ffffff'), 0, -0.735, 0.05, p, false);
    return p;
  });
  // torso: shaped (shoulders, waist, hips)
  const prof = F ? [[0.001, 0.78], [0.17, 0.8], [0.19, 0.9], [0.15, 1.02], [0.17, 1.12], [0.19, 1.2], [0.205, 1.26], [0.16, 1.32], [0.07, 1.36], [0.001, 1.37]]
    : [[0.001, 0.78], [0.18, 0.8], [0.19, 0.9], [0.18, 1.0], [0.2, 1.1], [0.235, 1.22], [0.24, 1.27], [0.18, 1.33], [0.08, 1.37], [0.001, 1.38]];
  const torso = mesh(lathe(prof), outer, 0, 0, 0, body); torso.scale.z = 0.7;
  if (L.skirt) { const sk = mesh(new THREE.CylinderGeometry(0.17, 0.33, 0.34, 28, 1, true), lower, 0, 0.66, 0, body); sk.material.side = THREE.DoubleSide; }
  else { mesh(lathe([[0.001, 0.62], [0.17, 0.64], [0.19, 0.76], [0.18, 0.86], [0.001, 0.87]]), lower, 0, 0, 0, body).scale.z = 0.72; mesh(cyl(0.185, 0.185, 0.04, 24), mat('#3b2618'), 0, 0.85, 0, body, false).scale.z = 0.72; }
  if (L.jacket || L.suit || L.cardigan) {
    // open front showing the shirt, with lapels
    const v = mesh(new THREE.CircleGeometry(0.1, 3), inner, 0, 1.2, 0.152, body, false); v.rotation.z = -Math.PI / 2; v.scale.set(1.9, 0.9, 1);
    const shirt = mesh(new THREE.PlaneGeometry(0.11, 0.3), inner, 0, 1.03, 0.142, body, false);
    [-1, 1].forEach(s => { const lp = mesh(new THREE.BoxGeometry(0.045, 0.28, 0.02), cloth(L.suit ? '#16203e' : (L.jacket || L.top)), s * 0.07, 1.12, 0.155, body, false); lp.rotation.z = s * 0.32; lp.rotation.y = s * 0.25; });
    if (L.suit) { mesh(new THREE.BoxGeometry(0.045, 0.24, 0.015), mat(L.tie, { metalness: 0.35, roughness: 0.35 }), 0, 1.1, 0.16, body, false); mesh(new THREE.BoxGeometry(0.05, 0.04, 0.02), mat(L.tie, { metalness: 0.35 }), 0, 1.23, 0.16, body, false); }
    if (L.cardigan) for (let k = 0; k < 4; k++) mesh(sph(0.012, 8, 6), mat('#ffffff'), 0.03, 0.95 + k * 0.08, 0.16, body, false);
  } else { const col = mesh(new THREE.TorusGeometry(0.075, 0.018, 8, 24), outer, 0, 1.345, 0.01, body, false); col.rotation.x = Math.PI / 2; col.scale.y = 0.75; }
  mesh(cyl(0.058, 0.068, 0.14, 14), skin, 0, 1.4, 0, body);
  const arms = [-1, 1].map(s => {
    const p = new THREE.Group(); p.position.set(s * (F ? 0.215 : 0.255), 1.26, 0); body.add(p);
    mesh(sph(F ? 0.068 : 0.078, 14, 12), outer, 0, 0, 0, p);
    mesh(new THREE.CapsuleGeometry(F ? 0.052 : 0.06, 0.32, 6, 12), outer, 0, -0.2, 0, p);
    mesh(cyl(F ? 0.056 : 0.064, F ? 0.056 : 0.064, 0.035, 12), L.jacket || L.cardigan ? inner : outer, 0, -0.38, 0, p, false);
    const hand = mesh(sph(F ? 0.05 : 0.058, 14, 12), skin, 0, -0.43, 0.01, p); hand.scale.set(0.9, 1.15, 0.8);
    return p;
  });
  // head
  const head = new THREE.Group(); head.position.set(0, 1.68, 0); body.add(head);
  const skull = mesh(sph(R, 48, 32), skin, 0, 0, 0, head, true, false); skull.scale.set(F ? 0.97 : 1, 1.02, 0.97);
  const jaw = mesh(sph(R * 0.78, 32, 20), skin, 0, -0.1, 0.02, head, false, false); jaw.scale.set(F ? 0.98 : 1.06, 0.85, 1);
  const decal = mesh(new THREE.SphereGeometry(R * 1.006, 48, 32, Math.PI / 2 - FACE.pl / 2, FACE.pl, FACE.t0, FACE.tl), new THREE.MeshStandardMaterial({ map: faceTex(L), transparent: true, roughness: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), 0, 0, 0, head, false, false);
  decal.material.emissiveMap = decal.material.map; decal.material.emissive = new THREE.Color('#ffffff'); decal.material.emissiveIntensity = 0.3;
  decal.scale.copy(skull.scale);
  [-1, 1].forEach(s => { const e = mesh(sph(0.055, 12, 10), skin, s * 0.285, -0.02, 0, head); e.scale.set(0.5, 1, 0.8); });
  const nose = mesh(sph(0.032, 14, 10), skin, 0, -0.045, R * 0.965, head, false); nose.scale.set(1.15, 0.8, 0.85); faceParts.push(nose);
  const white = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.08, clearcoat: 1 }), lash = mat('#1a1014', { roughness: 0.5 });
  const shine = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const eyes = [-1, 1].map(s => {
    const eg = new THREE.Group(); eg.position.set(s * 0.107, 0.02, 0.25); eg.scale.set(1.05, 1.18, 0.62); head.add(eg);
    mesh(sph(0.072, 24, 18), white, 0, 0, 0, eg, false);
    const ir = mesh(new THREE.SphereGeometry(0.0725, 28, 14, 0, Math.PI * 2, 0, 0.8), new THREE.MeshPhysicalMaterial({ map: irisTex(L.iris), roughness: 0.05, clearcoat: 1 }), 0, 0, 0, eg, false); ir.rotation.x = Math.PI / 2;
    mesh(sph(0.018, 10, 8), shine, 0.022, 0.028, 0.072, eg, false);
    mesh(sph(0.009, 8, 6), shine, -0.02, -0.02, 0.072, eg, false);
    const lid = mesh(new THREE.SphereGeometry(0.076, 24, 10, 0, Math.PI * 2, 0, Math.PI * 0.24), skin, 0, 0, 0, eg, false); lid.rotation.x = 0.12;
    const ln = mesh(new THREE.TorusGeometry(0.074, F ? 0.013 : 0.009, 6, 24, Math.PI * 0.95), lash, 0, 0, 0.004, eg, false); ln.rotation.z = Math.PI * 0.025;
    if (F) [0, 1, 2].forEach(k => { const c = mesh(new THREE.ConeGeometry(0.008, 0.04, 5), lash, s * (0.064 + k * 0.005), 0.04 - k * 0.017, 0.01, eg, false); c.rotation.z = -s * (0.8 + k * 0.35); });
    faceParts.push(eg); return eg;
  });
  // hair
  const lock = (pts, r0, r1, m = hm) => mesh(taperTube(pts, r0, r1), m, 0, 0, 0, head);
  const scalp = (th, tilt, k = 1.07) => { const c = mesh(new THREE.SphereGeometry(R * k, 40, 24, 0, Math.PI * 2, 0, th), hm, 0, 0, -0.01, head); c.rotation.x = tilt; return c; };
  const around = (n, from, to, fn) => { for (let i = 0; i < n; i++) fn(from + (to - from) * i / (n - 1), i); };
  if (!F) {
    scalp(Math.PI * 0.52, -0.42);
    [-1, 1].forEach(s => { const sb = mesh(sph(0.075, 12, 10), hm, s * 0.27, 0.04, -0.03, head); sb.scale.set(0.5, 1.3, 1.3); });
    if (L.hair === 'quiff') around(11, -0.2, 0.2, (x, i) => lock([[x * 0.9, 0.2, 0.25], [x * 0.95 + 0.02, 0.3 + 0.012 * Math.cos(x * 12), 0.17], [x + 0.05, 0.315, 0.02], [x * 1.05 + 0.06, 0.29, -0.14], [x * 1.1 + 0.06, 0.2, -0.24]], 0.085, 0.035));
    if (L.hair === 'tousled') around(12, 0, Math.PI * 2, (a, i) => { const dx = Math.sin(a), dz = Math.cos(a) * 0.9; lock([[dx * 0.05, 0.31, dz * 0.05], [dx * 0.17, 0.33, dz * 0.17 + 0.03], [dx * 0.27, 0.26, dz * 0.26 + 0.04], [dx * 0.31, 0.19 + (i % 3) * 0.025, dz * 0.3 + 0.05]], 0.085, 0.03); });
    if (L.hair === 'spiky') around(11, 0, Math.PI * 2, (a, i) => { const dx = Math.sin(a), dz = Math.cos(a); lock([[dx * 0.1, 0.27, dz * 0.1], [dx * 0.18, 0.36, dz * 0.18 - 0.02], [dx * 0.24, 0.43 - (i % 2) * 0.04, dz * 0.22 - 0.06]], 0.07, 0.006); });
  } else {
    scalp(Math.PI * 0.5, -0.3);
    const back = mesh(sph(R * 1.08, 32, 24), hm, 0, 0.0, -0.13, head); back.scale.set(1.02, 1.05, 0.9);
    // side-swept fringe that stops above the brows
    around(6, 0, 1, (u, i) => lock([[0.07, 0.32, 0.05], [0.0 - u * 0.1, 0.33, 0.19], [-0.08 - u * 0.12, 0.29 - u * 0.03, 0.22], [-0.21 - u * 0.07, 0.22 - u * 0.05, 0.17]], 0.05, 0.016));
    around(3, 0, 1, (u) => lock([[0.08, 0.32, 0.05], [0.15 + u * 0.04, 0.3, 0.17], [0.24 + u * 0.03, 0.2, 0.15], [0.28, 0.06 - u * 0.05, 0.1]], 0.045, 0.016));
    const len = L.hair === 'bob' ? 0.28 : L.hair === 'pony' ? 0.12 : 0.62, wav = L.hair === 'wavy' ? 0.04 : 0.012;
    if (L.hair !== 'pony') around(L.hair === 'bob' ? 14 : 18, -Math.PI * 0.6, Math.PI * 0.6, (a, i) => {
      const sx = Math.sin(a), sz = -Math.cos(a), front = Math.abs(a) > Math.PI * 0.45 ? 0.05 : 0;
      const P = []; for (let k = 0; k <= 5; k++) { const u = k / 5, y = 0.2 - u * (len + 0.25), rr = 0.28 + 0.08 * Math.sin(Math.min(1, u * 1.6) * Math.PI * 0.6) + Math.sin(u * 9 + i) * wav * u, curl = L.hair === 'bob' && u > 0.8 ? -0.05 : 0;
        P.push([sx * (rr + curl), y, sz * (rr + curl) + front * u]); }
      lock(P, 0.085, L.hair === 'bob' ? 0.04 : 0.02);
    });
    if (L.hair === 'pony') {
      around(5, -0.6, 0.6, (o) => lock([[o * 0.06, 0.16, -0.3], [o * 0.08, 0.02, -0.42], [o * 0.06 + 0.02, -0.2, -0.42], [o * 0.04 + 0.05, -0.45, -0.34]], 0.06, 0.012));
      mesh(new THREE.TorusGeometry(0.055, 0.02, 8, 18), mat('#ff6fc8'), 0, 0.15, -0.3, head).rotation.x = 1.2;
      [-1, 1].forEach(s => lock([[s * 0.22, 0.12, 0.12], [s * 0.25, -0.02, 0.15], [s * 0.24, -0.15, 0.12]], 0.035, 0.012));
    }
  }
  if (L.beret) { const b = mesh(sph(0.3, 28, 14), mat(L.beret, { roughness: 0.9 }), 0.05, 0.24, -0.03, head); b.scale.set(1.05, 0.32, 1.05); b.rotation.z = -0.28; mesh(cyl(0.012, 0.012, 0.05, 6), mat(L.beret), 0.02, 0.35, -0.03, head, false); }
  if (L.glasses) { const gm = mat('#1c1a24', { metalness: 0.5 }); [-1, 1].forEach(s => faceParts.push(mesh(new THREE.TorusGeometry(0.078, 0.011, 8, 24), gm, s * 0.108, 0.02, 0.31, head, false))); faceParts.push(mesh(new THREE.BoxGeometry(0.06, 0.012, 0.01), gm, 0, 0.03, 0.315, head, false)); }
  if (L.headset) { const hs = mesh(new THREE.TorusGeometry(0.335, 0.018, 6, 24, Math.PI), mat('#22222a'), 0, 0.02, 0, head, false); hs.rotation.y = Math.PI / 2; [-1, 1].forEach(s => { mesh(cyl(0.07, 0.07, 0.05, 12), mat('#22222a'), s * 0.32, 0, 0, head, false).rotation.z = Math.PI / 2; }); const mic = mesh(cyl(0.01, 0.01, 0.22, 6), mat('#22222a'), -0.27, -0.13, 0.15, head, false); mic.rotation.set(1.2, 0, 0.3); }
  const phone = mesh(new THREE.BoxGeometry(0.08, 0.15, 0.015), mat('#1d1d25', { emissive: '#3ee6ff', emissiveIntensity: 0.4 }), 0, -0.46, 0.08, arms[1], false);
  const cup = mesh(cyl(0.05, 0.04, 0.1, 10), mat('#ffffff'), 0, -0.48, 0.06, arms[0], false);
  root.traverse(o => { if (o.isMesh && o !== decal) o.castShadow = true; });
  const h = { root, body, legs, arms, head, phone, cup, eyes, torso, skin, decal, faceParts, blink: 2 + Math.random() * 3 };
  portraitFace(L, h);
  return h;
}
const people = {};
ALL.forEach(id => { const h = human({ ...LOOK[id], id }); h.root.scale.setScalar(id === 'wilson' ? 1.0 : 0.95); scene.add(h.root); people[id] = { ...h, yaw: 0, px: AG[id].pos.x, py: AG[id].pos.y, walk: 0 }; });
/* ---------- AI-made 3D bodies (image → 3D), auto-rigged here so the same animation code drives them ---------- */
const MODEL_IDS = ['wilson', 'sasa', 'nana', 'mimi', 'kiki', 'lulu', 'bobo', 'wawa'], MODEL_V = 3, MODEL_H = 1.95;
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function rigModel(id, gltf, lm) {
  const src = []; gltf.scene.traverse(o => { if (o.isMesh) src.push(o); });
  const geo = src[0].geometry.clone(); const S = MODEL_H;
  const pos = geo.attributes.position, n = pos.count;
  const torsoAt = y => { const k = Math.max(0, Math.min(63, Math.round(y * 63))); return lm.torso[k]; };
  const hip = Math.max(torsoAt(lm.crotch + 0.03), 0.06), neck = Math.max(0.7, Math.min(0.84, lm.neck)), shoulderY = neck - 0.04;
  // bones: 0 spine, 1 leg L, 2 leg R, 3 arm L, 4 arm R, 5 head
  const idx = new Uint16Array(n * 4), wt = new Float32Array(n * 4);
  const hand = [[0, 0, 0, 0], [0, 0, 0, 0]];
  let shX = 0, shN = 0;
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), ax = Math.abs(x), side = x < 0 ? 0 : 1;
    const lim = y >= lm.crotch ? torsoAt(y) : hip * 1.05;
    let b = 0, w = 0;
    const armW = y > lm.crotch - 0.12 && y < shoulderY + 0.02 ? ss(lim + 0.004, lim + 0.03, ax) : 0;
    const legW = ss(lm.crotch + 0.05, lm.crotch - 0.03, y) * (1 - armW);
    const headW = ss(neck - 0.025, neck + 0.02, y);
    if (armW > 0.01) { b = 3 + side; w = armW; if (y < lm.crotch + 0.1) { hand[side][0] += x; hand[side][1] += y; hand[side][2] += pos.getZ(i); hand[side][3]++; } }
    else if (legW > 0.01) { b = 1 + side; w = legW; }
    else if (headW > 0.01) { b = 5; w = headW; }
    if (y > shoulderY - 0.03 && y < shoulderY + 0.03 && ax > torsoAt(shoulderY) * 0.7) { shX += ax; shN++; }
    idx[i * 4] = b; wt[i * 4] = w; idx[i * 4 + 1] = 0; wt[i * 4 + 1] = 1 - w;
    pos.setXYZ(i, x * S, y * S, pos.getZ(i) * S);
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wt, 4));
  // smooth normals: average face normals of vertices that share a position (the mesh is split at the UV seam)
  { const nn = new Float32Array(n * 3), key = new Map(), pa = new THREE.Vector3(), pb = new THREE.Vector3(), pc = new THREE.Vector3(), fn = new THREE.Vector3();
    const kOf = i => Math.round(pos.getX(i) * 2000) + ',' + Math.round(pos.getY(i) * 2000) + ',' + Math.round(pos.getZ(i) * 2000);
    const acc = new Map();
    for (let i = 0; i < n; i += 3) { pa.fromBufferAttribute(pos, i); pb.fromBufferAttribute(pos, i + 1); pc.fromBufferAttribute(pos, i + 2); fn.subVectors(pc, pb).cross(pa.clone().sub(pb));
      for (let k = 0; k < 3; k++) { const kk = kOf(i + k); const v = acc.get(kk) || [0, 0, 0]; v[0] += fn.x; v[1] += fn.y; v[2] += fn.z; acc.set(kk, v); } }
    for (let i = 0; i < n; i++) { const v = acc.get(kOf(i)); const l = Math.hypot(v[0], v[1], v[2]) || 1; nn[i * 3] = v[0] / l; nn[i * 3 + 1] = v[1] / l; nn[i * 3 + 2] = v[2] / l; }
    geo.setAttribute('normal', new THREE.BufferAttribute(nn, 3)); }
  geo.computeBoundingSphere();
  const shoulderX = (shN ? shX / shN : torsoAt(shoulderY)) * S;
  const bone = (x, y, z, parent) => { const b = new THREE.Bone(); b.position.set(x, y, z); if (parent) parent.add(b); return b; };
  const spine = bone(0, 0, 0);
  const legs = [-1, 1].map(s => bone(s * hip * 0.5 * S, lm.crotch * S, 0, spine));
  const arms = [-1, 1].map(s => bone(s * shoulderX * 0.85, shoulderY * S, 0, spine));
  const head = bone(0, neck * S, 0, spine);
  const m0 = src[0].material, map = m0.map;
  const mat = new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.22, roughness: 0.72, metalness: 0 });
  const sm = new THREE.SkinnedMesh(geo, mat); sm.castShadow = true; sm.receiveShadow = true; sm.frustumCulled = false;
  sm.add(spine); sm.bind(new THREE.Skeleton([spine, legs[0], legs[1], arms[0], arms[1], head]));
  const body = new THREE.Group(); body.add(sm);
  // phone and cup sit in the hands
  const handOf = k => hand[k][3] ? new THREE.Vector3(hand[k][0] / hand[k][3] * S, hand[k][1] / hand[k][3] * S, hand[k][2] / hand[k][3] * S).sub(arms[k].position) : new THREE.Vector3(0, -0.45, 0);
  const phone = mesh(new THREE.BoxGeometry(0.08, 0.15, 0.015), mat_('#1d1d25', { emissive: '#3ee6ff', emissiveIntensity: 0.4 }), 0, 0, 0, arms[1], false); phone.position.copy(handOf(1)).add(new THREE.Vector3(0, 0.02, 0.08));
  const cup = mesh(cyl(0.05, 0.04, 0.1, 10), mat_('#ffffff'), 0, 0, 0, arms[0], false); cup.position.copy(handOf(0)).add(new THREE.Vector3(0, 0.04, 0.06));
  return { body, legs, arms, head, torso: new THREE.Object3D(), eyes: [], phone, cup };
}
const mat_ = (c, o) => mat(c, o);
function loadModels() {
  import('three/addons/loaders/GLTFLoader.js').then(({ GLTFLoader }) => {
    const loader = new GLTFLoader();
    MODEL_IDS.forEach(id => {
      Promise.all([fetch('models/' + id + '.json?v=' + MODEL_V).then(r => r.json()), new Promise((ok, no) => loader.load('models/' + id + '.glb?v=' + MODEL_V, ok, undefined, no))])
        .then(([lm, gltf]) => {
          const p = people[id]; if (!p) return;
          const r = rigModel(id, gltf, lm);
          p.root.remove(p.body); p.root.add(r.body);
          Object.assign(p, r);
        }).catch(e => console.warn('model', id, e));
    });
  });
}
loadModels();

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
  renderer.setSize(w, h, false); composer.setPixelRatio(pr); composer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
}
const cSky = { d: ['#5aa9ff', '#d9efff'], k: ['#3b2d7a', '#ff9e7a'], n: ['#05061a', '#1a1a48'] };
const tmpA = new THREE.Color(), tmpB = new THREE.Color(), tmpC = new THREE.Color();
function mix3(key) { const a = cSky.d[key], b = cSky.k[key], c = cSky.n[key]; tmpA.set(a).multiplyScalar(WT.d).add(tmpB.set(b).multiplyScalar(WT.k)).add(tmpC.set(c).multiplyScalar(WT.n)); return tmpA.clone(); }
let upperF = 1, mode = 'out', upT = 1;
const fp = { x: 0, y: 0, f: 1, h: 0 };
function setMode(m) { mode = m; upT = m === 'out' ? 1 : 0; floor2.visible = m === 2; floor3.visible = bossG.visible = m === 3; document.dispatchEvent(new CustomEvent('o3floor', { detail: m })); }
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
  if (mode !== 'out' && dist > 85 && !fly) setMode('out');
  setUpper(upT ? Math.min(1, upperF + dt * 2.5) : Math.max(0, upperF - dt * 2.5));
  O3.inside = mode === 'out' ? 0 : 1;
  // time of day
  const N = Math.min(1, WT.n + WT.k * 0.6);
  skyU.top.value.copy(mix3(0)); skyU.bot.value.copy(mix3(1)); scene.fog.color.copy(skyU.bot.value);
  sun.intensity = 2.6 * WT.d + 1.3 * WT.k + 0.25 * WT.n;
  sun.color.set('#fff4e0').lerp(tmpB.set('#ff9a5c'), WT.k).lerp(tmpC.set('#8fa6ff'), WT.n);
  hemi.intensity = 0.95 * WT.d + 0.6 * WT.k + 0.45 * WT.n;
  hemi.color.set('#ffffff').lerp(tmpB.set('#ffc2a8'), WT.k).lerp(tmpC.set('#5a6cc8'), WT.n);
  renderer.toneMappingExposure = 1.0 + 0.25 * N;
  roomLights.forEach(l => { l.intensity = 30 * N; }); planetM.emissiveIntensity = 0.25 + 1.2 * N;
  [podGlass, towGlass, bandM, ...cityMats].forEach(m => { m.emissiveIntensity = 1.3 * N; }); tileGlass.emissiveIntensity = 0.5 * N; ledM.emissiveIntensity = 0.5 + 2.2 * N; orangeM.emissiveIntensity = 0.1 + 0.4 * N;
  signMats.forEach(m => { m.emissiveIntensity = 0.12 + 0.6 * N; });
  animSky(t, dt, N);
  bulbM.emissiveIntensity = 0.2 + 2.5 * N;
  glows.forEach(g => { g.material.opacity = 0.15 + 0.75 * N; });
  headM.emissiveIntensity = 0.3 + 2 * N; tailM.emissiveIntensity = 0.5 + 1.5 * N;
  beams.forEach((b, k) => { b.material.opacity = 0.12 * N * upperF; b.rotation.set(Math.PI + 0.35 * Math.sin(t * 0.35 + k * 2), 0, 0.4 * Math.cos(t * 0.27 + k)); });
  beaconM.emissiveIntensity = (Math.sin(t * 4) > 0.6 ? 3 : 0.3); beaconGlow.material.opacity = beaconM.emissiveIntensity > 1 ? 0.9 : 0.1;
  // fountain, hologram, fish, screens
  if (!RM) {
    jets.forEach((j, k) => { j.scale.y = 0.8 + 0.25 * Math.sin(t * 3 + k); });
    jetTop.scale.y = 0.9 + 0.15 * Math.sin(t * 2.2);
    animPlanet(t);
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
    floorPos(a.pos.x, a.pos.y, fp); p.root.position.set(fp.x, fp.h + (a.z || 0) * HZ, fp.y);
    p.root.visible = mode === 'out' ? fp.f === 1 : fp.f === mode;
    p.root.rotation.y = p.yaw;
    const ph = t * 9 + (a.phase || 0);
    p.walk = lerp(p.walk, walking ? 1 : 0, Math.min(1, dt * 8));
    const sw = Math.sin(ph) * 0.6 * p.walk;
    const cheer = a.state === 'done' || (a.jump || 0) > 0;
    p.torso.scale.set(1 + 0.012 * Math.sin(t * 2.2 + (a.phase || 0)), 1 + 0.018 * Math.sin(t * 2.2 + (a.phase || 0)), 0.7);
    p.body.rotation.z = Math.sin(ph) * 0.035 * p.walk; p.body.rotation.y = Math.sin(ph) * 0.08 * p.walk;
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
    p.blink -= dt; const bl = p.blink < 0.12 ? Math.abs(p.blink - 0.06) / 0.06 : 1; if (p.blink < 0) p.blink = 2 + Math.random() * 4;
    p.eyes.forEach(e => { e.scale.y = 1.12 * Math.max(0.08, bl); });
  });
  // pets
  PETS.forEach((q, i) => {
    const m = pets[i], dx = q.pos.x - m.px, dy = q.pos.y - m.py, moved = Math.hypot(dx, dy); m.px = q.pos.x; m.py = q.pos.y;
    if (moved > 0.0005) m.yaw = yawTo(m.yaw, Math.atan2(dx, dy), Math.min(1, dt * 10));
    const hop = (q.jump || 0) > 0 ? Math.abs(Math.sin(q.jump * 9)) * 0.35 : 0;
    floorPos(q.pos.x, q.pos.y, fp); m.g.position.set(fp.x, fp.h + (q.z || 0) * HZ + hop, fp.y); m.g.rotation.y = m.yaw; m.g.visible = mode === 'out' ? fp.f === 1 : fp.f === mode;
    const walk = moved > 0.0005, ph = t * 14 + i;
    m.legs.forEach((l, k) => { l.rotation.x = walk ? Math.sin(ph + (k % 2 ? Math.PI : 0) + (k > 1 ? Math.PI / 2 : 0)) * 0.6 : 0; });
    m.g.scale.y = q.sleep ? 0.75 : 1;
    m.head.rotation.x = q.sleep ? 0.5 : Math.sin(t * 1.5 + i) * 0.08;
    if (m.tail) m.tail.rotation.z = Math.sin(t * 3 + i) * 0.4;
  });
  vac.visible = mode === 'out' || mode === 1; vac.position.set(bot.pos.x, F0, bot.pos.y); vac.rotation.y = -(bot.ang || 0);
  // labels: a metre at the camera target, in screen pixels
  const pxPerM = H / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist);
  S.setTW(pxPerM * 1.42);
  composer.render();
}

const O3 = window.O3 = { people,
  look(x, y, dist, polar) { flyTo(new THREE.Vector3(x, 1, y), dist, polar); },
  inside: 0, render, camera, controls, get flying() { return fly; }, get floor() { return mode; },
  visXY(x, y) { return mode !== 'out' && floorOf(x, y) === mode; },
  turn(dir) { const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target)); flyTo(controls.target, sph.radius, sph.phi, sph.theta + dir * Math.PI / 2); },
  setOrbit(on) { controls.autoRotate = !!on; },
  zoom(dir) { const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target)); flyTo(controls.target, Math.max(controls.minDistance, Math.min(controls.maxDistance, sph.radius * (dir > 0 ? 0.62 : 1.6))), sph.phi, sph.theta); },
  enter(k = 1) { setMode(k); flyTo(new THREE.Vector3(GX / 2, FY[k] + 1, GY / 2 + 1), 33, 0.9); },
  outside() { setMode('out'); flyTo(new THREE.Vector3(GX / 2, 10, GY / 2 + 4), 100, 1.05); },
};
setMode('out');
S.use3D((x, y, z = 0) => {
  floorPos(x, y, fp); v3.set(fp.x, fp.h + z * HZ, fp.y).project(camera);
  if (v3.z > 1) return [-9999, -9999];
  return [(v3.x + 1) / 2 * W, (1 - v3.y) / 2 * H];
});
}
