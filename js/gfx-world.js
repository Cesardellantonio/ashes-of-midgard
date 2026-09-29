'use strict';
/* =========================================================
   3D world: camera, lights, painted ground, world meshes
   Ragnarok-style: textured 3D terrain, rotatable camera,
   2D pixel sprites standing on it (see gfx-sprites.js).
   HD-2D lighting: sRGB + ACES, sun shadows following the
   camera, per-map sky/fog/lights (RLOOK), point-light pool,
   animated lava, lightTint() for sprites. Post: gfx-post.js.
   ========================================================= */
const PXU = 36;                       // sprite pixels per world unit
const PCOL = { fire: '#ff7a2a', ice: '#9fd8ff', soul: '#c8a8ff', holy: '#fff0b0', arrow: '#d8c8a0', bolt: '#fff6a0' };
const glc = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas: glc, antialias: true, powerPreference: 'high-performance' });
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(20, 1, 1, 600);
const cam = { yaw: 0, yawT: 0, pitch: 0.88, dist: 40, tx: 18, ty: 20, th: 0 };
let COSP = Math.cos(cam.pitch), PPU = 30;
const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 0.5); sun.position.set(-22, 40, 28); scene.add(sun); scene.add(sun.target);
const torch = new THREE.PointLight(0xffa860, 0, 13, 1.6); scene.add(torch);
let curWorld = null;
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), _v3 = new THREE.Vector3();

/* ---------- Graphics quality (GFX) ----------
   GFX.quality: 'low' | 'medium' | 'high' | 'ultra' (localStorage 'aom-gfx').
   low = no post, no shadows (about the pre-HD-2D cost). */
const GFX_PRESETS = {
  low:    { pr: 1.5, post: false, shadow: 0,    lights: 2, bloomMips: 0, dof: 0, msaa: 0 },
  medium: { pr: 1,   post: true,  shadow: 1024, lights: 4, bloomMips: 4, dof: 1, msaa: 2 },
  high:   { pr: 1.5, post: true,  shadow: 2048, lights: 6, bloomMips: 5, dof: 2, msaa: 4 },
  ultra:  { pr: 2,   post: true,  shadow: 4096, lights: 8, bloomMips: 6, dof: 3, msaa: 4 },
};
let GFX_EPOCH = 1;                    // bumped when material programs must recompile
const GFX = {
  quality: 'high', sun, composer: null, preset: null,
  hooks: [],                          // fn(q) called after a quality change (gfx-post registers one)
  setQuality(q) {
    if (!GFX_PRESETS[q]) return GFX.quality;
    GFX.quality = q; GFX.preset = GFX_PRESETS[q];
    try { localStorage.setItem('aom-gfx', q); } catch (e) { /* storage blocked */ }
    applyQuality();
    for (const f of GFX.hooks) try { f(q); } catch (e) { console.warn('[gfx] hook', e); }
    return q;
  },
  // Make a mesh with an alpha-tested map cast a correctly cut-out shadow (r128's
  // default depth material ignores alphaTest). The depth material follows mesh.material.map.
  makeCaster(mesh, alphaTest) {
    const dm = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaTest: alphaTest || 0.5 });
    Object.defineProperty(dm, 'map', { get: () => mesh.material && mesh.material.map || null, set() {} });
    mesh.customDepthMaterial = dm; mesh.castShadow = true; return mesh;
  },
};
try { const s = localStorage.getItem('aom-gfx'); if (GFX_PRESETS[s]) GFX.quality = s; } catch (e) { /* storage blocked */ }
GFX.preset = GFX_PRESETS[GFX.quality];
const PL = [];                        // point-light pool (fixed size per quality: no per-frame recompiles)
function applyQuality() {
  const Q = GFX.preset;
  renderer.setPixelRatio(Math.min(Q.pr, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = Q.shadow > 0; sun.castShadow = Q.shadow > 0;
  if (Q.shadow > 0 && sun.shadow.mapSize.x !== Q.shadow) { sun.shadow.mapSize.set(Q.shadow, Q.shadow); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  while (PL.length > Q.lights) scene.remove(PL.pop());
  while (PL.length < Q.lights) { const l = new THREE.PointLight(0xffa050, 0, 7, 2); PL.push(l); scene.add(l); }
  renderer.toneMapping = Q.post ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
  GFX_EPOCH++; refreshMaterials(scene);
  if (typeof map !== 'undefined' && map && RL) applyLook();
}
function refreshMaterials(root) {
  root.traverse(o => { const m = o.material; if (!m) return; if (Array.isArray(m)) m.forEach(x => { x.needsUpdate = true; }); else m.needsUpdate = true; });
  root.userData.epoch = GFX_EPOCH;
}
sun.shadow.camera.near = 1; sun.shadow.camera.far = 160; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.035;

/* ---------- Colour helpers (sRGB authoring -> linear lighting) ---------- */
function linCol(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }
// JS mirror of three's ACES fit, used to put fog colour into display space when post is off
// (r128 applies fog after tone mapping + encoding).
function acesDisplay(c, exp) {
  const k = exp / 0.6, r = c.r * k, g = c.g * k, b = c.b * k;
  const i = [0.59719 * r + 0.35458 * g + 0.04823 * b, 0.07600 * r + 0.90834 * g + 0.01566 * b, 0.02840 * r + 0.13383 * g + 0.83777 * b];
  const f = v => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.4329510) + 0.238081);
  const o = i.map(f), s = x => clamp(x, 0, 1);
  return new THREE.Color(s(1.60475 * o[0] - 0.53108 * o[1] - 0.07367 * o[2]), s(-0.10208 * o[0] + 1.10813 * o[1] - 0.00605 * o[2]), s(-0.00327 * o[0] - 0.07276 * o[1] + 1.07602 * o[2])).convertLinearToSRGB();
}

/* ---------- Per-map render look (HD-2D). Keyed by map id; MAPDEFS.look stays gameplay data. ----------
   Colours are authored sRGB hex; intensities are for three r128 legacy lights.
   fog: [near, far] at camera distance 40 (scaled with zoom).  sunDir points toward the sun.
   lt: lightTint() base for sprites: amb (always) + sun (where not shaded), linear multipliers. */
const RLOOK = {
  emberhold: {
    exposure: 0.84, sky: [0x4f88d8, 0xcfe2f2], haze: 0xbcd0e2, fog: [37, 160],
    sunDir: [-0.72, 0.95, 0.3], sun: [0xfff0d4, 0.8], hemi: [0xcfe0ff, 0x8c7a58, 0.42], torch: [0xffb070, 0, 10],
    lights: { brazier: [0xff9a48, 0.7, 6], way: [0xffa048, 1.1, 8], warp: [0x6aa8ff, 1.0, 5.5], heart: [0xffc060, 2, 10] },
    bloom: { threshold: 1.25, knee: 0.35, strength: 0.5 },
    grade: { lift: [0.01, 0.012, 0.03], gamma: [1, 1, 0.98], gain: [1.03, 1.01, 0.96], sat: 1.06, contrast: 1.06, shadowTint: [-0.006, 0.0, 0.02], highTint: [0.016, 0.008, -0.008] },
    vignette: 0.3, grain: 0.022, dof: { band: 0.1, ramp: 0.4, top: 0.85, bottom: 0.6 },
    lt: { amb: [0.56, 0.6, 0.7], sun: [0.46, 0.41, 0.31] },
  },
  ashen_fields: {
    exposure: 0.84, sky: [0x6a92cc, 0xdadcd0], haze: 0xc8ccc2, fog: [36, 155],
    sunDir: [-0.72, 0.95, 0.3], sun: [0xffeccc, 0.8], hemi: [0xdce6ff, 0x7a7a50, 0.42], torch: [0xffb070, 0, 10],
    lights: { brazier: [0xff9a48, 0.7, 6], way: [0xffa048, 1.1, 8], warp: [0x6aa8ff, 1.0, 5.5], heart: [0xffc060, 2, 10] },
    bloom: { threshold: 1.25, knee: 0.35, strength: 0.5 },
    grade: { lift: [0.014, 0.012, 0.024], gamma: [1, 1, 1], gain: [1.04, 1.01, 0.95], sat: 1.04, contrast: 1.06, shadowTint: [0.0, 0.0, 0.016], highTint: [0.02, 0.01, -0.01] },
    vignette: 0.3, grain: 0.024, dof: { band: 0.1, ramp: 0.4, top: 0.85, bottom: 0.6 },
    lt: { amb: [0.56, 0.59, 0.68], sun: [0.46, 0.41, 0.31] },
  },
  withered_wood: {
    exposure: 0.9, sky: [0x24402e, 0x5a7a50], haze: 0x4a6646, fog: [30, 115],
    sunDir: [-0.55, 1.1, 0.25], sun: [0xfff0c0, 0.86], hemi: [0x9cc8a0, 0x2a3a1c, 0.36], torch: [0xffb070, 0, 10],
    lights: { brazier: [0xff9a48, 1.2, 6.5], way: [0xffa048, 1.8, 9], warp: [0x7ab8ff, 1.4, 6], heart: [0xffc060, 3, 10] },
    bloom: { threshold: 1.2, knee: 0.4, strength: 0.6 },
    grade: { lift: [0.0, 0.016, 0.014], gamma: [1, 1.02, 1], gain: [1.03, 1.03, 0.93], sat: 1.06, contrast: 1.08, shadowTint: [-0.01, 0.006, 0.012], highTint: [0.022, 0.014, -0.01] },
    vignette: 0.4, grain: 0.026, dof: { band: 0.1, ramp: 0.38, top: 0.85, bottom: 0.65 },
    lt: { amb: [0.46, 0.56, 0.48], sun: [0.48, 0.44, 0.3] },
    shafts: { n: 16, clearing: true, gap: 7, len: 10, width: 2.4, color: 0xfff0b8, op: 0.13 },
  },
  gloamheim: {
    exposure: 1.1, sky: [0x07070f, 0x14132a], haze: 0x0c0b18, fog: [30, 82],
    sunDir: [-0.5, 1.2, 0.35], sun: [0x98a4e8, 0.4], hemi: [0x8088a8, 0x1c1418, 0.42], torch: [0xffa860, 1.3, 9],
    lights: { brazier: [0xff8a38, 2.6, 7.5], way: [0xffa048, 3.0, 10], warp: [0x7ab8ff, 2.2, 7], heart: [0xffc060, 3, 10] },
    bloom: { threshold: 1.15, knee: 0.4, strength: 0.75 },
    grade: { lift: [0.012, 0.012, 0.03], gamma: [1, 1, 1.02], gain: [1.05, 1.0, 0.95], sat: 1.04, contrast: 1.1, shadowTint: [-0.006, 0.0, 0.026], highTint: [0.03, 0.012, -0.012] },
    vignette: 0.5, grain: 0.03, dof: { band: 0.1, ramp: 0.4, top: 0.85, bottom: 0.6 },
    spec: [0x2a2a36, 26],
    shafts: { n: 9, clearing: false, gap: 9, len: 6, width: 2.6, color: 0x9fb0ff, op: 0.07 },
    lt: { amb: [0.46, 0.48, 0.68], sun: [0.06, 0.06, 0.1] },
  },
  throne: {
    exposure: 1.0, sky: [0x100404, 0x3c1408], haze: 0x1e0906, fog: [34, 125],
    sunDir: [-0.45, 1.2, 0.4], sun: [0xffc8a0, 0.62], hemi: [0x7a6a6a, 0xff6a20, 0.5], torch: [0xffa860, 0.8, 9],
    lights: { brazier: [0xff8a38, 1.8, 6.5], way: [0xffa048, 2.4, 9], warp: [0x7ab8ff, 2.0, 6.5], heart: [0xffc060, 4, 12] },
    bloom: { threshold: 1.1, knee: 0.4, strength: 0.55 },
    grade: { lift: [0.018, 0.008, 0.012], gamma: [0.98, 1, 1.02], gain: [1.03, 0.98, 0.94], sat: 1.02, contrast: 1.08, shadowTint: [0.006, -0.004, 0.006], highTint: [0.02, 0.006, -0.012] },
    vignette: 0.48, grain: 0.03, dof: { band: 0.1, ramp: 0.4, top: 0.85, bottom: 0.6 },
    lt: { amb: [0.78, 0.6, 0.5], sun: [0.2, 0.14, 0.1] },
    paint: { g1: [46, 38, 38], g2: [84, 70, 66] },      // dark basalt instead of red clay
  },
};
// Fallback for maps without an entry: derive from MAPDEFS.look.
function rlookFor(m) {
  if (RLOOK[m.id]) return RLOOK[m.id];
  const L = m.d.look, base = RLOOK.ashen_fields;
  return Object.assign({}, base, { haze: L.fog, sky: [L.fog, L.fog], hemi: [L.hemi[0], L.hemi[1], L.hemi[2] * 0.8], sun: [L.sun[0], L.sun[1] * 3], torch: [0xffa860, L.torch, 10] });
}
let RL = null;                        // current map's render look (read by gfx-post.js)
const SKY = { hazeLin: new THREE.Color(), fogOut: new THREE.Color(), top: new THREE.Color(), hor: new THREE.Color(), sunDir: new THREE.Vector3(0, 1, 0), exposure: 1 };

function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function canvasTex(c, o = {}) {
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;    // canvas art is authored in sRGB
  if (o.pixel) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; }
  if (o.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  if (o.aniso) t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
// Loaded images (sprite sheets) are sRGB art too: decode them correctly under sRGB output.
(() => {
  const load = THREE.TextureLoader.prototype.load;
  THREE.TextureLoader.prototype.load = function (url, onLoad, onProgress, onError) {
    const t = load.call(this, url, tex => { tex.encoding = THREE.sRGBEncoding; if (onLoad) onLoad(tex); }, onProgress, onError);
    t.encoding = THREE.sRGBEncoding; return t;
  };
})();
function smoothstep(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
function tnoise(x, y, Pp, s) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); const h = (i, j) => hash2(((i % Pp) + Pp) % Pp, ((j % Pp) + Pp) % Pp, s); const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
const NZ = (() => { const N = 256, a = new Float32Array(N * N), b = new Float32Array(N * N); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { a[y * N + x] = tnoise(x / 16, y / 16, 16, 5) * 0.65 + tnoise(x / 8, y / 8, 32, 6) * 0.35; b[y * N + x] = Math.random(); } return { a, b }; })();

/* ---------- Shared textures ---------- */
function radialTex(size, stops) { const c = mkCanvas(size, size), g = c.getContext('2d'); const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2); for (const [o, col] of stops) gr.addColorStop(o, col); g.fillStyle = gr; g.fillRect(0, 0, size, size); return canvasTex(c); }
const TEX = {};
TEX.shadow = radialTex(64, [[0, 'rgba(0,0,0,.6)'], [0.6, 'rgba(0,0,0,.35)'], [1, 'rgba(0,0,0,0)']]);
TEX.glow = radialTex(64, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,.45)'], [1, 'rgba(255,255,255,0)']]);
TEX.disc = radialTex(128, [[0, 'rgba(255,255,255,.75)'], [0.82, 'rgba(255,255,255,.6)'], [0.94, 'rgba(255,255,255,.9)'], [1, 'rgba(255,255,255,0)']]);
TEX.soft = radialTex(128, [[0, 'rgba(255,255,255,.9)'], [1, 'rgba(255,255,255,0)']]);
TEX.flame = (() => { const c = mkCanvas(64, 96), g = c.getContext('2d'); const gr = g.createRadialGradient(32, 64, 2, 32, 58, 34); gr.addColorStop(0, 'rgba(255,250,210,1)'); gr.addColorStop(0.35, 'rgba(255,190,80,.9)'); gr.addColorStop(0.7, 'rgba(255,90,20,.45)'); gr.addColorStop(1, 'rgba(255,40,0,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(32, 4); g.quadraticCurveTo(58, 50, 50, 74); g.quadraticCurveTo(32, 96, 14, 74); g.quadraticCurveTo(6, 50, 32, 4); g.fill(); return canvasTex(c); })();
function circleTex(kind) {
  const S = 256, c = mkCanvas(S, S), g = c.getContext('2d'); g.translate(S / 2, S / 2); g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineCap = 'round';
  const circ = (r, w) => { g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke(); };
  if (kind === 'ring') { g.shadowColor = '#fff'; g.shadowBlur = 10; circ(112, 10); }
  else if (kind === 'target') { circ(96, 6); for (let i = 0; i < 4; i++) { g.save(); g.rotate(i * Math.PI / 2); g.beginPath(); g.moveTo(0, -104); g.lineTo(-12, -124); g.lineTo(12, -124); g.closePath(); g.fill(); g.restore(); } }
  else {
    g.shadowColor = '#fff'; g.shadowBlur = 8; circ(120, 5); circ(98, 3); circ(62, 3);
    g.lineWidth = 3; for (let k = 0; k < 2; k++) { g.beginPath(); for (let i = 0; i <= 3; i++) { const a = k * Math.PI / 3 + i * 2 * Math.PI / 3 - Math.PI / 2; const x = Math.cos(a) * 96, y = Math.sin(a) * 96; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
    for (let i = 0; i < 16; i++) { g.save(); g.rotate(i * Math.PI / 8); g.lineWidth = 3; g.beginPath(); g.moveTo(-5, -104); g.lineTo(0, -114); g.lineTo(5, -104); if (i % 2) { g.moveTo(0, -104); g.lineTo(0, -116); } g.stroke(); g.restore(); }
  }
  return canvasTex(c);
}
TEX.ring = circleTex('ring'); TEX.target = circleTex('target'); TEX.magic = circleTex('magic');
TEX.beam = (() => { const c = mkCanvas(64, 128), g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,.75)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 128); for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(255,255,255,${0.15 + Math.random() * 0.4})`; g.fillRect(Math.random() * 64, Math.random() * 90, 2, 30 + Math.random() * 40); } const t = canvasTex(c, { repeat: true }); return t; })();
function patternTex(kind) {
  const c = mkCanvas(128, 256), g = c.getContext('2d'), r = mulberry32(kind.length * 97);
  if (kind === 'ghwall' || kind === 'townwall' || kind === 'stone') {
    const base = kind === 'ghwall' ? [88, 86, 104] : kind === 'townwall' ? [196, 180, 146] : [140, 136, 130];
    g.fillStyle = `rgb(${base.map(v => v * 0.55 | 0)})`; g.fillRect(0, 0, 128, 256);
    const bh = kind === 'stone' ? 32 : 24;
    for (let row = 0; row * bh < 256; row++) { const off = row % 2 ? 0 : 20; for (let x = -40 + off; x < 128; x += 40) { const j = (r() - 0.5) * 30; g.fillStyle = `rgb(${base.map(v => clamp(v + j, 0, 255) | 0)})`; g.fillRect(x + 2, row * bh + 2, 36, bh - 3); g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(x + 2, row * bh + 2, 36, 2); g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x + 2, row * bh + bh - 4, 36, 2); } }
    if (kind === 'ghwall') for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(70,110,60,${r() * 0.4})`; g.fillRect(r() * 128, 200 + r() * 56, 3 + r() * 6, 2 + r() * 4); }
  } else if (kind === 'plaster') {
    g.fillStyle = '#efe2c2'; g.fillRect(0, 0, 128, 256); for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(120,100,70,${r() * 0.08})`; g.fillRect(r() * 128, r() * 256, 3, 3); }
    g.fillStyle = '#6a4626'; g.fillRect(0, 0, 128, 10); g.fillRect(0, 246, 128, 10); g.fillRect(0, 0, 10, 256); g.fillRect(118, 0, 10, 256); g.fillRect(0, 120, 128, 8);
    g.save(); g.translate(64, 64); g.fillStyle = '#3a4a6a'; g.fillRect(-18, -22, 36, 40); g.fillStyle = '#ffe9a0'; g.fillRect(-15, -19, 13, 16); g.fillRect(2, -19, 13, 16); g.fillRect(-15, 0, 13, 15); g.fillRect(2, 0, 13, 15); g.restore();
  } else if (kind === 'roof') {
    g.fillStyle = '#9e3a22'; g.fillRect(0, 0, 128, 256); for (let row = 0; row < 16; row++) for (let x = 0; x < 128; x += 16) { const j = r() * 30 - 15; g.fillStyle = `rgb(${clamp(190 + j, 0, 255) | 0},${clamp(78 + j * 0.5, 0, 255) | 0},${clamp(48 + j * 0.3, 0, 255) | 0})`; g.beginPath(); g.arc(x + 8 + (row % 2) * 8, row * 16 + 10, 8, 0, Math.PI); g.fill(); }
  }
  return canvasTex(c);
}
// Seamless ground tile for the world skirt outside the playable map (8 tiles per repeat).
function skirtTex(m) {
  const L = m.d.look, S = 256, c = mkCanvas(S, S), g = c.getContext('2d'), img = g.createImageData(S, S), D = img.data;
  const dark = m.d.gen === 'dungeon', g1 = dark ? L.g1.map(v => v * 0.42) : L.g1, g2 = dark ? L.g2.map(v => v * 0.42) : L.g2, grain = L.grain || 20;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const t = NZ.a[y * 256 + x] * 0.55 + NZ.a[((y * 2) & 255) * 256 + ((x * 2) & 255)] * 0.45, gr = (NZ.b[y * 256 + x] - 0.5) * grain, o = (y * S + x) * 4;
    D[o] = g1[0] + (g2[0] - g1[0]) * t + gr; D[o + 1] = g1[1] + (g2[1] - g1[1]) * t + gr; D[o + 2] = g1[2] + (g2[2] - g1[2]) * t + gr * 0.6; D[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  if (L.floor === 'grass') { const r = mulberry32(m.d.seed + 5); for (let i = 0; i < 900; i++) { const X = r() * S, Y = r() * S; g.strokeStyle = r() < 0.5 ? 'rgba(40,70,20,.35)' : 'rgba(200,230,140,.22)'; g.lineWidth = 1; g.beginPath(); g.moveTo(X, Y); g.lineTo(X + (r() - 0.5) * 3, Y - 3 - r() * 3); g.stroke(); } }
  if (dark) { const r = mulberry32(m.d.seed + 9); g.strokeStyle = 'rgba(8,8,14,.5)'; g.lineWidth = 2; for (let y = 0; y < S; y += 32) for (let x = 0; x < S; x += 32) { g.strokeRect(x + 1 + ((y / 32) % 2) * 16, y + 1, 30, 30); if (r() < 0.3) { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x + r() * 24, y + r() * 24, 4 + r() * 6, 3 + r() * 4); } } }
  return canvasTex(c, { repeat: true, aniso: true });
}

/* ---------- Ground painting ---------- */
function paintGround(m) {
  const L = m.d.look, TP = 32, Wp = m.w * TP, Hp = m.h * TP, w = m.w, h = m.h;
  const c = mkCanvas(Wp, Hp), g = c.getContext('2d'), img = g.createImageData(Wp, Hp), D = img.data;
  const pf = new Float32Array(w * h); for (let i = 0; i < w * h; i++) pf[i] = (m.deco[i] === 6 || m.deco[i] === 5) ? 1 : 0;
  const pb = new Float32Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h) { s += pf[yy * w + xx] * (dx || dy ? 0.6 : 1.4); n += dx || dy ? 0.6 : 1.4; } } pb[y * w + x] = s / n; }
  const bil = (f, x, y) => { x -= 0.5; y -= 0.5; const xi = clamp(Math.floor(x), 0, w - 2), yi = clamp(Math.floor(y), 0, h - 2); const fx = clamp(x - xi, 0, 1), fy = clamp(y - yi, 0, 1); const i = yi * w + xi; return f[i] * (1 - fx) * (1 - fy) + f[i + 1] * fx * (1 - fy) + f[i + w] * (1 - fx) * fy + f[i + w + 1] * fx * fy; };
  const PO = (RLOOK[m.id] && RLOOK[m.id].paint) || {};
  const g1 = PO.g1 || L.g1, g2 = PO.g2 || L.g2, grain = L.grain || 20, P_ = L.path || [150, 130, 100], A_ = L.ash || [130, 128, 120];
  for (let py = 0; py < Hp; py++) {
    const ty = py / TP, tyi = Math.min(h - 1, py >> 5);
    for (let px = 0; px < Wp; px++) {
      const n1 = NZ.a[((py >> 3) & 255) * 256 + ((px >> 3) & 255)], n3 = NZ.a[((py >> 1) & 255) * 256 + ((px >> 1) & 255)], n2 = NZ.b[(py & 255) * 256 + (px & 255)];
      const t = n1 * 0.7 + n3 * 0.3, gr = (n2 - 0.5) * grain;
      let r = g1[0] + (g2[0] - g1[0]) * t + gr, gg = g1[1] + (g2[1] - g1[1]) * t + gr, b = g1[2] + (g2[2] - g1[2]) * t + gr * 0.6;
      if (L.ashAmt) { const an = NZ.a[((py >> 4) & 255) * 256 + ((px >> 4) & 255)]; const aw = smoothstep(0.66, 0.74, an + (n3 - 0.5) * 0.08) * Math.min(1, L.ashAmt * 2.4); if (aw > 0) { r += (A_[0] + gr - r) * aw; gg += (A_[1] + gr - gg) * aw; b += (A_[2] + gr - b) * aw; } }
      const txi = Math.min(w - 1, px >> 5), ti = tyi * w + txi;
      if (pb[ti] > 0.01) { const pw = bil(pb, px / TP, ty); const k = smoothstep(0.25, 0.55, pw + (n3 - 0.5) * 0.35); if (k > 0) { r += (P_[0] + gr * 1.2 - r) * k; gg += (P_[1] + gr * 1.2 - gg) * k; b += (P_[2] + gr - b) * k; } }
      const o = (py * Wp + px) * 4; D[o] = r; D[o + 1] = gg; D[o + 2] = b; D[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const rng = mulberry32(m.d.seed * 3 + 1), T_ = m.t;
  const tileOpen = (x, y) => x >= 0 && y >= 0 && x < w && y < h && T_[y * w + x] === 0;
  // Town cobblestones
  if (L.cobble) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (m.deco[y * w + x] !== 5) continue; const X = x * TP, Y = y * TP;
    g.fillStyle = 'rgba(96,86,70,.9)'; g.fillRect(X, Y, TP, TP);
    for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) { const j = rng() * 36 - 18; g.fillStyle = `rgb(${196 + j | 0},${184 + j | 0},${160 + j | 0})`; g.beginPath(); g.roundRect(X + sx * 16 + 1.5 + (sy ? 4 : 0) % 8, Y + sy * 16 + 1.5, 13, 13, 4); g.fill(); g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(X + sx * 16 + 4, Y + sy * 16 + 3, 7, 2); }
  }
  // Dungeon flagstones (open floor) and rough dark bedrock (solid mass between rooms)
  if (L.floor === 'flag') for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = x * TP, Y = y * TP;
    if (!tileOpen(x, y)) {
      if (T_[y * w + x] !== T.WALL) continue;
      g.fillStyle = `rgba(0,0,0,${0.25 + rng() * 0.1})`; g.fillRect(X, Y, TP, TP);
      g.strokeStyle = 'rgba(10,10,18,.6)'; g.lineWidth = 1.5; if ((x + y) % 2 === 0) g.strokeRect(X + 1, Y + 1, TP * 2 - 2, TP - 2);
      if (rng() < 0.35) { g.fillStyle = `rgba(${rng() < 0.5 ? '150,150,170' : '0,0,0'},${0.12 + rng() * 0.1})`; g.beginPath(); g.ellipse(X + rng() * TP, Y + rng() * TP, 2 + rng() * 4, 1.5 + rng() * 3, rng() * 3, 0, 7); g.fill(); }
      continue;
    }
    g.fillStyle = `rgba(${rng() < 0.5 ? '255,255,255' : '0,0,0'},${rng() * 0.07})`; g.fillRect(X, Y, TP, TP);
    g.strokeStyle = 'rgba(20,18,28,.55)'; g.lineWidth = 2; g.strokeRect(X + 1, Y + 1, TP - 2, TP - 2);
    if (rng() < 0.25) { g.strokeStyle = 'rgba(20,18,28,.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(X + rng() * TP, Y + rng() * TP); g.lineTo(X + rng() * TP, Y + rng() * TP); g.lineTo(X + rng() * TP, Y + rng() * TP); g.stroke(); }
    if (!tileOpen(x, y - 1) || !tileOpen(x - 1, y)) for (let i = 0; i < 5; i++) { g.fillStyle = `rgba(80,120,64,${0.2 + rng() * 0.3})`; g.fillRect(X + rng() * TP, Y + rng() * 8, 2 + rng() * 3, 2); }
  }
  // Volcanic cracks: dark grooves in the albedo + a glowing emissive map (bloom picks them up)
  if (L.floor === 'rock') {
    const ec = mkCanvas(w * 16, h * 16), eg = ec.getContext('2d'); eg.fillStyle = '#000'; eg.fillRect(0, 0, ec.width, ec.height); eg.lineCap = eg.lineJoin = 'round';
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!tileOpen(x, y) || rng() > 0.12) continue;
      const pts = [[(x + rng()) * TP, (y + rng()) * TP]]; let a = rng() * 6.28;
      for (let k = 0, n = 4 + (rng() * 6 | 0); k < n; k++) { a += (rng() - 0.5) * 2.4; const [px, py] = pts[pts.length - 1], l = 3 + rng() * 6; pts.push([px + Math.cos(a) * l, py + Math.sin(a) * l]); }
      const path = (c, sc) => { c.beginPath(); pts.forEach(([px, py], i) => i ? c.lineTo(px * sc, py * sc) : c.moveTo(px * sc, py * sc)); c.stroke(); };
      g.strokeStyle = 'rgba(18,8,6,.75)'; g.lineWidth = 2.2; g.lineJoin = 'miter'; path(g, 1);
      const hot = rng(); eg.strokeStyle = `rgba(255,${110 + hot * 90 | 0},${30 + hot * 40 | 0},${0.5 + hot * 0.5})`; eg.lineWidth = 0.7 + hot * 0.6; eg.lineCap = 'butt'; eg.lineJoin = 'miter'; eg.shadowColor = '#ff6a1a'; eg.shadowBlur = 3; path(eg, 0.5);
    }
    eg.shadowBlur = 0; eg.globalCompositeOperation = 'lighter';
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (T_[y * w + x] === T.LAVA && (tileOpen(x + 1, y) || tileOpen(x - 1, y) || tileOpen(x, y + 1) || tileOpen(x, y - 1))) { const gr = eg.createRadialGradient((x + 0.5) * 16, (y + 0.5) * 16, 0, (x + 0.5) * 16, (y + 0.5) * 16, 18); gr.addColorStop(0, 'rgba(255,90,20,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); eg.fillStyle = gr; eg.fillRect(x * 16 - 18, y * 16 - 18, 52, 52); }
    m.emisCanvas = ec;
  }
  // Grass blades & flowers
  if (L.floor === 'grass') {
    for (let i = 0; i < w * h * 6; i++) { const x = rng() * w, y = rng() * h; if (!tileOpen(x | 0, y | 0) || m.deco[(y | 0) * w + (x | 0)] >= 5) continue; const X = x * TP, Y = y * TP; g.strokeStyle = rng() < 0.5 ? `rgba(40,70,20,.35)` : `rgba(200,230,140,.25)`; g.lineWidth = 1; g.beginPath(); g.moveTo(X, Y); g.lineTo(X + (rng() - 0.5) * 3, Y - 3 - rng() * 3); g.stroke(); }
    const FL = ['#ffffff', '#ffe46a', '#ff9ac8', '#c8a0ff', '#ff7a5a'];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!tileOpen(x, y) || m.deco[y * w + x] >= 5 || rng() > L.flowers) continue; const col = FL[(rng() * FL.length) | 0], cx = x * TP + rng() * TP, cy = y * TP + rng() * TP;
      for (let k = 0; k < 3 + rng() * 5; k++) { const fx = cx + (rng() - 0.5) * 14, fy = cy + (rng() - 0.5) * 10; g.fillStyle = 'rgba(30,60,20,.5)'; g.fillRect(fx - 1, fy + 1, 3, 2); g.fillStyle = col; g.fillRect(fx - 1, fy - 1, 3, 3); g.fillStyle = '#ffe46a'; g.fillRect(fx, fy, 1, 1); }
    }
  }
  // Scattered decorations
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dc = m.deco[y * w + x]; if (!dc || !tileOpen(x, y)) continue; const X = x * TP + 8 + rng() * 16, Y = y * TP + 8 + rng() * 16;
    if (dc === 2) { g.fillStyle = 'rgba(236,228,206,.8)'; g.fillRect(X - 6, Y, 10, 2); g.beginPath(); g.arc(X + 6, Y - 1, 3, 0, 7); g.fill(); }
    else if (dc === 3) { g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(X - 10, Y - 3); g.lineTo(X, Y + 2); g.lineTo(X + 9, Y - 4); g.stroke(); }
    else if (dc === 4) { g.fillStyle = L.floor === 'rock' ? 'rgba(255,120,40,.3)' : 'rgba(110,106,100,.45)'; g.beginPath(); g.ellipse(X, Y, 9, 5, 0, 0, 7); g.fill(); }
    else if (dc === 1 && L.floor === 'grass') { g.fillStyle = 'rgba(40,80,24,.45)'; g.beginPath(); g.ellipse(X, Y, 7, 4, 0, 0, 7); g.fill(); }
  }
  // Baked ambient occlusion under solid things
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = T_[y * w + x]; if (!t || t === T.LAVA) continue;
    const [rad, a] = t === T.TREE ? [1.5, 0.3] : t === T.WALL ? [1.0, 0.42] : t === T.RUIN ? [1.1, 0.34] : [0.9, 0.3];
    if (t === T.WALL && m.vis && !m.vis[y * w + x]) continue;
    const cx = (x + 0.6) * TP, cy = (y + 0.65) * TP, R = rad * TP; const gr = g.createRadialGradient(cx, cy, 0, cx, cy, R); gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(cx - R, cy - R, R * 2, R * 2);
  }
  // Dungeon: the solid mass between rooms falls off into darkness away from the lit floor
  if (m.d.gen === 'dungeon') {
    const df = new Float32Array(w * h).fill(99), q = [];
    for (let i = 0; i < w * h; i++) if (T_[i] !== T.WALL) { df[i] = 0; q.push(i); }
    for (let qi = 0; qi < q.length; qi++) { const i = q[qi], x = i % w, y = (i / w) | 0; for (let k = 0; k < 8; k++) { const nx = x + DX[k], ny = y + DY[k]; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const j = ny * w + nx; if (df[j] > df[i] + 1) { df[j] = df[i] + 1; q.push(j); } } }
    const dc = mkCanvas(w, h), dg = dc.getContext('2d'), di = dg.createImageData(w, h);
    for (let i = 0; i < w * h; i++) { const a = smoothstep(1.2, 6, df[i]) * 0.86; di.data[i * 4] = 6; di.data[i * 4 + 1] = 6; di.data[i * 4 + 2] = 14; di.data[i * 4 + 3] = a * 255; }
    dg.putImageData(di, 0, 0); g.imageSmoothingEnabled = true; g.drawImage(dc, 0, 0, Wp, Hp);
  }
  // Baked light pools (soft; real point lights add the rest on medium+)
  g.globalCompositeOperation = 'lighter';
  const glow = (x, y, R, col) => { const gr = g.createRadialGradient(x * TP, y * TP, 0, x * TP, y * TP, R * TP); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect((x - R) * TP, (y - R) * TP, R * 2 * TP, R * 2 * TP); };
  for (const b of m.braziers) glow(b.x, b.y, 3.2, 'rgba(255,140,50,.2)');
  if (m.way) glow(m.way.x, m.way.y, 4, 'rgba(255,150,60,.18)');
  for (const wp of m.warps) glow(wp.x + 0.5, wp.y + 0.5, 2.4, 'rgba(90,150,255,.3)');
  if (L.lava) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (T_[y * w + x] === T.LAVA && (tileOpen(x + 1, y) || tileOpen(x - 1, y) || tileOpen(x, y + 1) || tileOpen(x, y - 1))) glow(x + 0.5, y + 0.5, 1.6, 'rgba(255,90,20,.22)');
  g.globalCompositeOperation = 'source-over';
  return c;
}

/* ---------- Geometry helpers ---------- */
function ni(g) { return g.index ? g.toNonIndexed() : g; }
function merge(geos) {
  let n = 0; for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2); let o = 0;
  for (const g of geos) { const c = g.attributes.position.count; pos.set(g.attributes.position.array, o * 3); if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3); if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2); o += c; g.dispose(); }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return out;
}
function boxAt(x, y, z, sx, sy, sz) { const g = ni(new THREE.BoxGeometry(sx, sy, sz)); g.translate(x, y + sy / 2, z); return g; }
function groundH(x, y) {
  const m = map; if (!m || !m.hgt) return 0; const W1 = m.w + 1;
  x = clamp(x, 0, m.w - 0.001); y = clamp(y, 0, m.h - 0.001);
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, i = yi * W1 + xi;
  const a = m.hgt[i], b = m.hgt[i + 1], c = m.hgt[i + W1], d = m.hgt[i + W1 + 1];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
function hgtAt(m, x, y) { const W1 = m.w + 1; return m.hgt[clamp(Math.round(y), 0, m.h) * W1 + clamp(Math.round(x), 0, m.w)]; }
function headH(e) { const hp = e === P || e.kind === 'player' ? 58 : e.d ? e.d.h : e.look ? 58 * (e.look.scale || 1) : 30; return hp / PXU / COSP; }
function chestH(e) { if (!e || e.x === undefined) return 1; if (e.kind === 'drop') return groundH(e.x, e.y) + 0.3; return groundH(e.x, e.y) + (e.z || 0) / PXU + headH(e) * 0.5; }
// Height of the decorative skirt around the map (continues the edge, gentle hills further out)
function skirtH(m, x, z) {
  const ex = clamp(x, 0, m.w), ez = clamp(z, 0, m.h), d = Math.hypot(x - ex, z - ez);
  return hgtAt(m, ex, ez) + (m.d.gen === 'field' || m.d.gen === 'town' ? (vnoise(x / 7, z / 7, m.d.seed + 3) - 0.35) * Math.min(1, d / 8) * 1.6 : 0);
}

/* ---------- Tree textures (painted, Ragnarok-field style) ---------- */
const TREETEX = {};
function treeTex(kind, seed) {
  const key = kind + seed; if (TREETEX[key]) return TREETEX[key];
  const c = mkCanvas(128, 160), g = c.getContext('2d'), r = mulberry32(seed);
  const trunk = kind === 'dead' ? '#6e6258' : '#6a4526';
  g.fillStyle = trunk; g.beginPath(); g.moveTo(54, 160); g.quadraticCurveTo(58, 110, 60, 70); g.lineTo(68, 70); g.quadraticCurveTo(70, 110, 76, 160); g.closePath(); g.fill();
  g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(66, 80, 6, 80); g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 1; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(60 + r() * 10, 90 + i * 11); g.lineTo(62 + r() * 10, 98 + i * 11); g.stroke(); }
  if (kind === 'dead') {
    g.strokeStyle = trunk; g.lineCap = 'round';
    const br = (x, y, len, a, wd, d) => { const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len; g.lineWidth = wd; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke(); if (d > 0) { br(x2, y2, len * 0.7, a - 0.5 + r() * 0.3, wd * 0.65, d - 1); br(x2, y2, len * 0.7, a + 0.5 - r() * 0.3, wd * 0.65, d - 1); } };
    br(64, 80, 24, -Math.PI / 2, 7, 3);
    for (let i = 0; i < 10; i++) { g.fillStyle = `rgba(${150 + r() * 40 | 0},${110 + r() * 30 | 0},60,.8)`; g.fillRect(30 + r() * 68, 20 + r() * 60, 3, 2); }
  } else {
    const P_ = kind === 'forest' ? ['#173d1c', '#245a26', '#3a7a30', '#5e9e40'] : kind === 'forest2' ? ['#1d3a26', '#2a5a38', '#3f7a48', '#62a060'] : kind === 'autumn' ? ['#6a2e10', '#a8501c', '#d88a2a', '#f4c050'] : ['#21571c', '#3a8a2a', '#5cb03a', '#96d45a'];
    const cl = []; const cx = 64, cy = kind.startsWith('forest') ? 58 : 62, rx = kind.startsWith('forest') ? 48 : 44, ry = kind.startsWith('forest') ? 52 : 42;
    for (let i = 0; i < 16; i++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()); cl.push([cx + Math.cos(a) * rx * d * 0.75, cy + Math.sin(a) * ry * d * 0.75, 12 + r() * 12]); }
    cl.sort((a, b) => a[1] - b[1]);
    for (const [x, y, rr] of cl) { g.fillStyle = P_[0]; g.beginPath(); g.arc(x + 2, y + 3, rr + 2, 0, 7); g.fill(); }
    for (const [x, y, rr] of cl) { g.fillStyle = P_[1]; g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill(); g.fillStyle = P_[2]; g.beginPath(); g.arc(x - rr * 0.25, y - rr * 0.3, rr * 0.62, 0, 7); g.fill(); }
    for (let i = 0; i < 40; i++) { g.fillStyle = r() < 0.6 ? P_[3] : P_[0]; const x = cx + (r() - 0.5) * rx * 1.6, y = cy + (r() - 0.6) * ry * 1.5; g.fillRect(x, y, 2 + r() * 2, 2 + r() * 2); }
  }
  return (TREETEX[key] = canvasTex(c));
}

/* ---------- Shaders: sky dome, lava ---------- */
const SKYU = { uTop: { value: SKY.top }, uHor: { value: SKY.hor }, uHaze: { value: SKY.hazeLin } };
const skyDome = (() => {
  const mat = new THREE.ShaderMaterial({
    uniforms: SKYU, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uTop, uHor, uHaze; varying vec3 vDir;
      void main(){ float h = normalize(vDir).y; vec3 c = h > 0.0 ? mix(uHor, uTop, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(uHor, uHaze, smoothstep(0.0, 0.18, -h));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 12), mat); m.renderOrder = -1000; m.frustumCulled = false; scene.add(m); return m;
})();
const LAVAU = { uTime: { value: 0 }, uFogCol: { value: SKY.hazeLin }, uFog: { value: new THREE.Vector2(30, 100) } };
function lavaMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: LAVAU, fog: false,
    vertexShader: 'varying vec3 vW; varying float vDepth; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vDepth = -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: `uniform float uTime; uniform vec3 uFogCol; uniform vec2 uFog; varying vec3 vW; varying float vDepth;
      float hsh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hsh(i), hsh(i + vec2(1.0, 0.0)), u.x), mix(hsh(i + vec2(0.0, 1.0)), hsh(i + vec2(1.0, 1.0)), u.x), u.y); }
      float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vn(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
      vec2 h2(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
      // cellular crust plates: returns (F2 - F1) edge distance and F1
      vec2 voro(vec2 x, float t){ vec2 n = floor(x), f = fract(x); float d1 = 8.0, d2 = 8.0;
        for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec2 g = vec2(float(i), float(j)); vec2 o = h2(n + g); o = 0.5 + 0.38 * sin(t * 0.25 + 6.2831 * o);
          vec2 r = g + o - f; float d = dot(r, r); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
        return vec2(sqrt(d2) - sqrt(d1), sqrt(d1)); }
      void main(){
        float t = uTime; vec2 p = vW.xz * 0.42;
        vec2 flow = vec2(fbm(p * 0.5 + vec2(0.0, t * 0.05)), fbm(p * 0.5 + vec2(4.1, 2.7) - t * 0.04)) - 0.5;
        vec2 v = voro(p + flow * 1.6, t);
        float seam = 1.0 - smoothstep(0.015, 0.1, v.x);
        float river = smoothstep(0.5, 0.66, fbm(p * 0.22 + flow * 0.6 + vec2(t * 0.015, 0.0)));
        float shimmer = fbm(p * 2.2 + vec2(t * 0.35, -t * 0.22));
        float heat = clamp(max(seam * (0.3 + 0.55 * shimmer), river * (0.7 + 0.35 * shimmer)), 0.0, 1.0);
        float pulse = 0.88 + 0.12 * sin(t * 1.4 + v.y * 6.0);
        vec3 crust = mix(vec3(0.018, 0.009, 0.008), vec3(0.06, 0.028, 0.02), smoothstep(0.1, 0.6, v.y)) * (0.7 + 0.6 * vn(p * 7.0));
        crust += vec3(0.22, 0.035, 0.0) * (1.0 - smoothstep(0.02, 0.25, v.x)) * 0.5;
        vec3 hot = mix(vec3(0.55, 0.06, 0.005), vec3(2.2, 0.75, 0.12), pow(heat, 1.6)) * pulse;
        vec3 c = mix(crust, hot, smoothstep(0.05, 0.6, heat));
        c = mix(c, uFogCol, smoothstep(uFog.x, uFog.y, vDepth));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }`,
  });
}
// Skirt material: lit like the ground, fading into the horizon haze away from the map.
function skirtMaterial(tex, spec) {
  const mat = new THREE.MeshPhongMaterial({ map: tex, specular: spec ? spec[0] : 0x000000, shininess: spec ? spec[1] : 1 });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uHaze = { value: SKY.fogOut };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float fade; varying float vFade;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = fade;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uHaze; varying float vFade;').replace('#include <fog_fragment>', 'gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, vFade);\n#include <fog_fragment>');
  };
  return mat;
}
function buildSkirt(m, tex, spec) {
  const E = 26, w = m.w, h = m.h, NX = w + 2 * E, NZ_ = h + 2 * E, V = (NX + 1) * (NZ_ + 1);
  const pos = new Float32Array(V * 3), uv = new Float32Array(V * 2), fade = new Float32Array(V), idx = [];
  for (let j = 0; j <= NZ_; j++) for (let i = 0; i <= NX; i++) {
    const k = j * (NX + 1) + i, x = i - E, z = j - E, ex = clamp(x, 0, w), ez = clamp(z, 0, h), d = Math.hypot(x - ex, z - ez);
    pos[k * 3] = x; pos[k * 3 + 1] = skirtH(m, x, z) - (d > 0 ? 0.01 : 0); pos[k * 3 + 2] = z; uv[k * 2] = x / 8; uv[k * 2 + 1] = -z / 8;
    fade[k] = smoothstep(2.5, 18, d) * (m.d.gen === 'dungeon' ? 1 : 0.92);
  }
  for (let j = 0; j < NZ_; j++) for (let i = 0; i < NX; i++) {
    if (i >= E && i < E + w && j >= E && j < E + h) continue;
    const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1; idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setAttribute('fade', new THREE.BufferAttribute(fade, 1));
  geo.setIndex(idx); geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, skirtMaterial(tex, spec)); mesh.receiveShadow = true; return mesh;
}

TEX.shaft = (() => {
  const c = mkCanvas(64, 256), g = c.getContext('2d'), img = g.createImageData(64, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 64; x++) {
    const v = y / 255, u = Math.abs(x / 63 - 0.5) * 2, n = 0.75 + 0.25 * tnoise(x / 9, y / 40, 8, 31);
    const a = Math.pow(1 - u * u, 1.5) * smoothstep(0, 0.35, v) * (1 - smoothstep(0.75, 1, v) * 0.7) * n, o = (y * 64 + x) * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = 255; img.data[o + 3] = a * 255;
  }
  g.putImageData(img, 0, 0); return canvasTex(c);
})();
function buildShafts(m, R, grp) {
  const S = R.shafts, r = mulberry32(m.d.seed * 31 + 3), dir = new THREE.Vector3(R.sunDir[0], R.sunDir[1], R.sunDir[2]).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir), out = [], w = m.w, h = m.h;
  const ok = (x, y) => { if (m.t[y * w + x] !== 0) return false; let trees = 0, open = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const t = m.t[clamp(y + dy, 0, h - 1) * w + clamp(x + dx, 0, w - 1)]; if (t === 0) open++; else if (t === T.TREE) trees++; } return S.clearing ? trees >= 3 && trees <= 12 : open >= 20; };
  for (let tries = 0; out.length < S.n && tries < 800; tries++) {
    const x = 2 + (r() * (w - 4) | 0), y = 2 + (r() * (h - 4) | 0); if (!ok(x, y) || out.some(o => Math.hypot(o.x - x, o.y - y) < S.gap)) continue;
    const len = S.len * (0.8 + r() * 0.4), wd = S.width * (0.7 + r() * 0.6), g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ map: TEX.shaft, color: linCol(S.color), transparent: true, opacity: S.op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (let p = 0; p < 2; p++) { const pl = new THREE.Mesh(new THREE.PlaneGeometry(wd, len).translate(0, len / 2, 0), mat); pl.rotation.y = p * Math.PI / 2 + r(); g.add(pl); }
    g.quaternion.copy(q); g.position.set(x + 0.5, groundH(x + 0.5, y + 0.5) - 0.1, y + 0.5); grp.add(g);
    out.push({ x, y, mat, ph: r() * 6.28, op: S.op });
  }
  return out;
}

/* ---------- World building ---------- */
function buildWorld(m) {
  if (m.world) return m.world;
  const L = m.d.look, R = rlookFor(m), grp = new THREE.Group(), w = m.w, h = m.h, W1 = w + 1;
  const A = { flames: [], warps: [], lava: null, heart: null, way: null };
  const spec = R.spec;
  const lam = (o) => new THREE.MeshPhongMaterial(Object.assign({ specular: spec ? spec[0] : 0x000000, shininess: spec ? spec[1] : 1 }, o));
  const solid = (geo, mat) => { const me = new THREE.Mesh(geo, mat); me.castShadow = true; me.receiveShadow = true; grp.add(me); return me; };
  // Ground
  const gg = new THREE.PlaneGeometry(w, h, w, h); gg.rotateX(-Math.PI / 2); gg.translate(w / 2, 0, h / 2);
  const pos = gg.attributes.position; for (let i = 0; i < pos.count; i++) pos.setY(i, m.hgt[Math.round(pos.getZ(i)) * W1 + Math.round(pos.getX(i))]);
  gg.computeVertexNormals();
  const gmat = lam({ map: canvasTex(paintGround(m), { aniso: true }) });
  if (m.emisCanvas) { gmat.emissiveMap = canvasTex(m.emisCanvas); gmat.emissive = new THREE.Color(1.5, 0.62, 0.25); A.groundEmis = gmat; m.emisCanvas = null; }
  const ground = new THREE.Mesh(gg, gmat); ground.receiveShadow = true; grp.add(ground); grp.userData.ground = ground;
  if (!L.lava) grp.add(buildSkirt(m, skirtTex(m), spec));
  const tint = new THREE.Color(L.tint[0], L.tint[1], L.tint[2]);
  const walls = [], ruins = [], rocks = [], pillars = [], graves = [], trees = [[], [], []];
  const inHouse = (x, y) => (m.houses || []).some(q => x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1);
  const addTree = (cx, cz, gh, v) => {
    const k = v % 3, s = (L.trees[k].startsWith('forest') ? 3.2 : 2.7) + ((v >> 2) & 7) * 0.12, ht = s * 1.25, ang = (v >> 5) * 0.4;
    // 3 crossed planes, each as two single-sided quads (so both faces get the same up-normal lighting)
    for (let p = 0; p < 6; p++) { const g = ni(new THREE.PlaneGeometry(s, ht)); if (p >= 3) g.scale(-1, 1, 1); g.translate(0, ht / 2, 0); g.rotateY(ang + (p % 3) * Math.PI / 3); g.translate(cx + ((v & 3) - 1.5) * 0.08, gh - 0.15, cz); trees[k].push(g); }
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, t = m.t[i], v = m.var[i], cx = x + 0.5, cz = y + 0.5, gh = groundH(cx, cz);
    if (t === T.WALL) { if (!m.vis[i]) continue; const wh = m.d.gen === 'town' ? 1.9 : 2.5; walls.push(boxAt(cx, gh - 0.3, cz, 1, wh + 0.3, 1)); if (m.d.gen === 'town' && (x + y) % 2 === 0) walls.push(boxAt(cx, gh + wh, cz, 0.5, 0.35, 0.5)); }
    else if (t === T.RUIN && !inHouse(x, y)) ruins.push(boxAt(cx, gh - 0.1, cz, 0.9, 0.35 + (v & 7) * 0.09, 0.9));
    else if (t === T.ROCK) { const g = ni(new THREE.DodecahedronGeometry(0.5, 0)); g.scale(0.85 + (v & 3) * 0.12, 0.55 + ((v >> 2) & 3) * 0.12, 0.85 + ((v >> 4) & 3) * 0.1); g.rotateY(v * 0.1); g.translate(cx, gh + 0.12, cz); rocks.push(g); }
    else if (t === T.PILLAR) { const g = ni(new THREE.CylinderGeometry(0.4, 0.48, 3.2, 10)); g.translate(cx, gh + 1.6, cz); pillars.push(g, boxAt(cx, gh, cz, 1, 0.35, 1), boxAt(cx, gh + 3.1, cz, 1.05, 0.3, 1.05)); }
    else if (t === T.GRAVE) { const g = boxAt(0, 0, 0, 0.55, 0.8, 0.16); g.rotateY((v & 15) * 0.05 - 0.4); g.translate(cx, gh, cz); graves.push(g); if (v & 1) { const c2 = boxAt(0, 0.45, 0, 0.5, 0.12, 0.17); c2.rotateY((v & 15) * 0.05 - 0.4); c2.translate(cx, gh, cz); graves.push(c2); } }
    else if (t === T.TREE) addTree(cx, cz, gh, v);
  }
  // Outer wilderness: trees continue past the map edge and fade into the haze
  if (m.d.gen === 'field' || m.d.gen === 'town') {
    const r = mulberry32(m.d.seed * 13 + 7), E = 16, dens = m.d.gen === 'town' ? 0.16 : m.d.trees > 0.1 ? 0.55 : 0.22;
    for (let z = -E; z < h + E; z++) for (let x = -E; x < w + E; x++) {
      if (x >= -1 && x < w + 1 && z >= -1 && z < h + 1) continue;
      const d = Math.hypot(x + 0.5 - clamp(x + 0.5, 0, w), z + 0.5 - clamp(z + 0.5, 0, h));
      if (r() > dens * (0.6 + 0.4 * vnoise(x / 5, z / 5, m.d.seed + 17)) * (1 - d / (E + 4))) continue;
      const cx = x + 0.5 + (r() - 0.5) * 0.6, cz = z + 0.5 + (r() - 0.5) * 0.6; addTree(cx, cz, skirtH(m, cx, cz), (r() * 256) | 0);
    }
  }
  if (walls.length) solid(merge(walls), lam({ map: patternTex(m.d.gen === 'town' ? 'townwall' : 'ghwall') }));
  if (ruins.length) solid(merge(ruins), lam({ map: patternTex('stone') }));
  if (rocks.length) solid(merge(rocks), lam({ color: linCol(L.rock) }));
  if (pillars.length) solid(merge(pillars), lam({ map: patternTex('stone'), color: m.id === 'throne' ? linCol(0xd8a090) : 0xffffff }));
  if (graves.length) solid(merge(graves), lam({ color: linCol(0x9a98a4) }));
  // Trees: lit like the ground (normals up), cast cut-out shadows, don't self-shadow
  for (let k = 0; k < 3; k++) if (trees[k].length) {
    const geo = merge(trees[k]), nr = geo.attributes.normal.array, uvs = geo.attributes.uv.array, vc = new Float32Array(nr.length);
    for (let i = 0, j = 0; i < nr.length; i += 3, j += 2) { nr[i] = 0; nr[i + 1] = 1; nr[i + 2] = 0; const v = 0.6 + 0.5 * uvs[j + 1]; vc[i] = v; vc[i + 1] = v; vc[i + 2] = v * 0.97; }
    geo.setAttribute('color', new THREE.BufferAttribute(vc, 3));
    const tm = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: treeTex(L.trees[k], m.d.seed * 7 + k), alphaTest: 0.5, color: tint, vertexColors: true }));
    GFX.makeCaster(tm); grp.add(tm);
  }
  // Houses
  if (m.houses) {
    const bodyM = lam({ map: patternTex('plaster') }), roofM = lam({ map: patternTex('roof') }), doorM = lam({ color: linCol(0x4a2c16) });
    for (const q of m.houses) {
      const sx = q.x1 - q.x0 + 1, sz = q.y1 - q.y0 + 1, cx = q.x0 + sx / 2, cz = q.y0 + sz / 2, base = groundH(cx, cz) - 0.3;
      const body = solid(new THREE.BoxGeometry(sx - 0.1, 2.6, sz - 0.1), bodyM); body.position.set(cx, base + 1.3, cz);
      const rg = new THREE.ConeGeometry(1, 2, 4, 1); rg.rotateY(Math.PI / 4); rg.scale((sx + 0.7) * Math.SQRT1_2, 1, (sz + 0.7) * Math.SQRT1_2);
      const roof = solid(rg, roofM); roof.position.set(cx, base + 2.6 + 1, cz);
      const door = solid(new THREE.BoxGeometry(0.8, 1.4, 0.1), doorM); door.position.set(cx, base + 1.0, q.y1 + 1 + 0.01);
    }
  }
  const glowSprite = (col, op, sx, sy) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: op })); s.scale.set(sx, sy, 1); return s; };
  const flameSprite = (r, g, b) => new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.flame, color: new THREE.Color(r, g, b), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  // Waystone
  if (m.way) {
    const g = new THREE.Group(), st = lam({ map: patternTex('stone') }), gh = groundH(m.way.x, m.way.y);
    const part = (geo, y, ry) => { const me = new THREE.Mesh(geo, st); me.position.y = y; if (ry) me.rotation.y = ry; me.castShadow = me.receiveShadow = true; g.add(me); return me; };
    part(new THREE.CylinderGeometry(0.95, 1.05, 0.25, 12), 0.12); part(new THREE.CylinderGeometry(0.16, 0.34, 2.3, 4), 1.4, Math.PI / 4); part(new THREE.ConeGeometry(0.2, 0.4, 4), 2.75, Math.PI / 4);
    const rune = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, 0.06), new THREE.MeshBasicMaterial({ color: 0xffa040 })); rune.position.set(0, 1.3, 0.3); g.add(rune);
    const fl = flameSprite(3.4, 1.7, 0.55); fl.position.y = 3.35; fl.scale.set(0.9, 1.35, 1); g.add(fl);
    const halo = glowSprite(linCol(0xff8a30), 0.35, 3, 3); halo.position.y = 3.1; g.add(halo);
    g.position.set(m.way.x, gh, m.way.y); grp.add(g);
    A.way = { fl, halo, rune }; A.flames.push({ s: fl, sx: 0.9, sy: 1.35 });
  }
  // Warp portals
  for (const wp of m.warps) {
    const gh = groundH(wp.x + 0.5, wp.y + 0.5);
    const ringM = new THREE.MeshBasicMaterial({ map: TEX.magic, color: 0x7ab8ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), ringM); ring.rotation.x = -Math.PI / 2; ring.position.set(wp.x + 0.5, gh + 0.05, wp.y + 0.5); grp.add(ring);
    const bt = TEX.beam.clone(); bt.needsUpdate = true;
    const beamM = new THREE.MeshBasicMaterial({ map: bt, color: 0x9fd0ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.8, 3.4, 20, 1, true), beamM); beam.position.set(wp.x + 0.5, gh + 1.7, wp.y + 0.5); grp.add(beam);
    A.warps.push({ ring, ringM, beam, beamM, bt, wp });
  }
  // Braziers
  const metal = lam({ color: linCol(0x3a3430), specular: 0x333333, shininess: 30 });
  for (const b of m.braziers) {
    const gh = groundH(b.x, b.y), g = new THREE.Group();
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.1, 0.75, 6), metal); leg.position.y = 0.37; g.add(leg);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.15, 0.22, 8), metal); bowl.position.y = 0.82; g.add(bowl);
    leg.castShadow = bowl.castShadow = true;
    const fl = flameSprite(3.2, 1.5, 0.5); fl.position.y = 1.2; fl.scale.set(0.5, 0.75, 1); g.add(fl);
    const halo = glowSprite(linCol(0xff7a20), 0.3, 1.8, 1.8); halo.position.y = 1.1; g.add(halo);
    g.position.set(b.x, gh, b.y); grp.add(g); A.flames.push({ s: fl, sx: 0.5, sy: 0.75 });
  }
  // Anvil
  for (const o of m.objs) if (o.kind === 'anvil') { const g = new THREE.Group(); const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.3), metal); b1.position.y = 0.2; const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.22, 0.36), lam({ color: linCol(0x5a5654), specular: 0x444444, shininess: 40 })); b2.position.y = 0.5; b1.castShadow = b2.castShadow = true; g.add(b1, b2); g.position.set(o.x, groundH(o.x, o.y), o.y); grp.add(g); }
  // Lava: animated emissive shader (HDR cracks bloom)
  if (L.lava) { const lava = new THREE.Mesh(new THREE.PlaneGeometry(w + 90, h + 90), lavaMaterial()); lava.rotation.x = -Math.PI / 2; lava.position.set(w / 2, -0.5, h / 2); grp.add(lava); A.lava = lava; }
  // Heart of Yggdrasil
  if (m.heart) {
    const hx = m.heart.x, hz = m.heart.y, gh = groundH(hx, hz), rootM = lam({ color: linCol(0x3a2618) });
    for (let i = 0; i < 7; i++) { const a = -Math.PI * 0.9 + i * Math.PI * 0.3; const pts = [new THREE.Vector3(hx, gh + 1.2, hz), new THREE.Vector3(hx + Math.cos(a) * 1.2, gh + 1.8, hz + Math.sin(a) * 0.8 - 0.4), new THREE.Vector3(hx + Math.cos(a) * 2.6, gh + 0.6, hz + Math.sin(a) * 1.6 - 0.6), new THREE.Vector3(hx + Math.cos(a) * 3.4, gh - 0.2, hz + Math.sin(a) * 2.2 - 0.8)]; solid(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, 0.22 - i * 0.01, 6), rootM); }
    const coreM = new THREE.MeshBasicMaterial({ color: 0x3a2014 }); const core = new THREE.Mesh(new THREE.SphereGeometry(0.75, 14, 10), coreM); core.position.set(hx, gh + 1.3, hz); grp.add(core);
    const glowS = glowSprite(linCol(0xffc060), 0, 5, 5); glowS.position.set(hx, gh + 1.3, hz); grp.add(glowS);
    A.heart = { coreM, glowS };
  }
  // Volumetric-looking light shafts (additive crossed planes along the sun direction)
  if (R.shafts) A.shafts = buildShafts(m, R, grp);
  m.world = grp; m.anim = A;
  return grp;
}

/* ---------- Per-map look: lights, sky, fog, exposure ---------- */
const LSRC = [];                      // static light sources of the current map (for the point-light pool)
function applyLook() {
  const R = RL, post = GFX.preset.post;
  SKY.exposure = R.exposure;
  renderer.toneMappingExposure = R.exposure;
  SKY.hazeLin.copy(linCol(R.haze)); SKY.top.copy(linCol(R.sky[0])); SKY.hor.copy(linCol(R.sky[1]));
  // r128 applies fog after tone mapping: give it the display-space colour when the renderer tone-maps
  SKY.fogOut.copy(post ? SKY.hazeLin : acesDisplay(SKY.hazeLin, R.exposure));
  if (!scene.fog) scene.fog = new THREE.Fog(0, 1, 2);
  scene.fog.color.copy(SKY.fogOut);
  scene.background = SKY.fogOut.clone();
  hemi.color.copy(linCol(R.hemi[0])); hemi.groundColor.copy(linCol(R.hemi[1])); hemi.intensity = R.hemi[2];
  sun.color.copy(linCol(R.sun[0])); sun.intensity = R.sun[1];
  SKY.sunDir.set(R.sunDir[0], R.sunDir[1], R.sunDir[2]).normalize();
  torch.color.copy(linCol(R.torch[0])); torch.intensity = R.torch[1]; torch.distance = R.torch[2]; torch.decay = 2;
}
function enterWorld() {
  RL = rlookFor(map);
  if (curWorld) scene.remove(curWorld);
  curWorld = buildWorld(map); scene.add(curWorld);
  if (curWorld.userData.epoch !== GFX_EPOCH) refreshMaterials(curWorld);
  applyLook();
  // static light sources for the point-light pool
  LSRC.length = 0; const Lc = RL.lights;
  for (const b of map.braziers) LSRC.push({ x: b.x, y: b.y, h: groundH(b.x, b.y) + 1.35, c: linCol(Lc.brazier[0]), i: Lc.brazier[1], d: Lc.brazier[2], fl: 1, ph: b.x * 3.1 + b.y });
  if (map.way) LSRC.push({ x: map.way.x, y: map.way.y, h: groundH(map.way.x, map.way.y) + 3.2, c: linCol(Lc.way[0]), i: Lc.way[1], d: Lc.way[2], fl: 1, ph: 0.7, way: true });
  for (const wp of map.warps) LSRC.push({ x: wp.x + 0.5, y: wp.y + 0.5, h: groundH(wp.x + 0.5, wp.y + 0.5) + 1.2, c: linCol(Lc.warp[0]), i: Lc.warp[1], d: Lc.warp[2], fl: 0.3, ph: 2, warp: wp });
  if (map.heart) LSRC.push({ x: map.heart.x, y: map.heart.y + 0.6, h: groundH(map.heart.x, map.heart.y) + 1.8, c: linCol(Lc.heart[0]), i: Lc.heart[1], d: Lc.heart[2], fl: 0.2, ph: 1, heart: true });
  clearVis();
  if (P) { cam.tx = P.x; cam.ty = P.y; cam.th = groundH(P.x, P.y); }
  LT.key = ''; buildLightGrid();
}
function snapCam() { cam.tx = P.x; cam.ty = P.y; cam.th = groundH(P.x, P.y); }

/* ---------- lightTint(x, y[, out]) — sprite light multiplier at tile position ----------
   Returns {r,g,b} (linear, multiply into the sprite material colour): ~1 in daylight,
   >1 near fires/magic, <1 in shade and dark corners. Baked per map at 2 samples/tile
   (ambient + sun with a ray-marched shade test + braziers/waystone/warps/lava/heart),
   plus the few dynamic spell lights of this frame. Pass `out` to avoid allocation. */
const LT = { g: null, gw: 0, gh: 0, key: '', dyn: [], nd: 0 };
const LT_RES = 2;
function casterSpan(t, m, x, y) {
  switch (t) {
    case T.TREE: return [0.9, 4.0, 0.72];
    case T.WALL: return [-1, m.d.gen === 'town' ? 1.9 : 2.5, 1];
    case T.RUIN: return (m.houses || []).some(q => x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1) ? [-1, 4.4, 1] : [-1, 0.7, 1];
    case T.ROCK: return [-1, 0.75, 0.9];
    case T.PILLAR: return [-1, 3.4, 1];
    case T.GRAVE: return [-1, 0.8, 0.6];
    case T.WAY: return [-1, 2.8, 0.45];
    case T.HEART: return [-1, 2.2, 0.8];
    default: return null;
  }
}
function buildLightGrid() {
  const m = map, R = RL, gw = m.w * LT_RES, gh = m.h * LT_RES, G = new Float32Array(gw * gh * 3);
  const amb = R.lt.amb, sn = R.lt.sun, sd = SKY.sunDir, hl = Math.hypot(sd.x, sd.z) || 1, dx = sd.x / hl, dz = sd.z / hl, tanE = sd.y / hl;
  const spans = []; for (let i = 0; i < m.w * m.h; i++) spans.push(casterSpan(m.t[i], m, i % m.w, (i / m.w) | 0));
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const px = (i + 0.5) / LT_RES, pz = (j + 0.5) / LT_RES, own = ((pz | 0) * m.w + (px | 0));
    let shade = 0;
    for (let t = 0.3; t < 8; t += 0.3) {
      const x = px + dx * t, z = pz + dz * t; if (x < 0 || z < 0 || x >= m.w || z >= m.h) break;
      const k = (z | 0) * m.w + (x | 0); if (k === own) continue; const s = spans[k]; if (!s) continue;
      const hy = t * tanE; if (hy >= s[0] && hy <= s[1]) { shade = s[2]; break; }
    }
    const o = (j * gw + i) * 3, lit = 1 - shade;
    G[o] = amb[0] + sn[0] * lit; G[o + 1] = amb[1] + sn[1] * lit; G[o + 2] = amb[2] + sn[2] * lit;
  }
  const splat = (x, y, rad, c, k) => {
    const x0 = Math.max(0, Math.floor((x - rad) * LT_RES)), x1 = Math.min(gw - 1, Math.ceil((x + rad) * LT_RES)), y0 = Math.max(0, Math.floor((y - rad) * LT_RES)), y1 = Math.min(gh - 1, Math.ceil((y + rad) * LT_RES));
    for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) { const d = Math.hypot((i + 0.5) / LT_RES - x, (j + 0.5) / LT_RES - y); if (d >= rad) continue; const f = 1 - d / rad, a = f * f * k, o = (j * gw + i) * 3; G[o] += c.r * a; G[o + 1] += c.g * a; G[o + 2] += c.b * a; }
  };
  const warm = new THREE.Color(1, 0.62, 0.3), blue = new THREE.Color(0.35, 0.6, 1), lava = new THREE.Color(1, 0.42, 0.14), gold = new THREE.Color(1, 0.8, 0.45);
  const dim = R.exposure > 1.05 ? 1.0 : 0.75;       // fires read stronger in dark maps
  for (const b of m.braziers) splat(b.x, b.y, 4.2, warm, 0.8 * dim);
  const wayLit = !!(P && P.kindled && P.kindled[m.id]), kingSlain = !!(P && P.flags && P.flags.kingSlain);
  if (m.way && wayLit) splat(m.way.x, m.way.y, 5.5, warm, 0.7 * dim);
  for (const wp of m.warps) splat(wp.x + 0.5, wp.y + 0.5, 2.8, blue, 0.5);
  if (m.heart && kingSlain) splat(m.heart.x, m.heart.y + 1, 7, gold, 0.7);
  if (m.d.look.lava) for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) { if (m.t[y * m.w + x] !== T.LAVA) continue; let open = false; for (let k = 0; k < 4 && !open; k++) { const nx = x + DX[k], ny = y + DY[k]; open = nx >= 0 && ny >= 0 && nx < m.w && ny < m.h && m.t[ny * m.w + nx] === 0; } if (open) splat(x + 0.5, y + 0.5, 2.2, lava, 0.18); }
  for (let i = 0; i < G.length; i++) G[i] = Math.min(G[i], 2.2);
  LT.g = G; LT.gw = gw; LT.gh = gh; LT.key = m.id + '|' + wayLit + '|' + kingSlain;
}
function lightTint(x, y, out) {
  out = out || { r: 1, g: 1, b: 1 };
  const G = LT.g; if (!G) { out.r = out.g = out.b = 1; return out; }
  const gw = LT.gw, gh = LT.gh;
  let fx = x * LT_RES - 0.5, fy = y * LT_RES - 0.5; fx = fx < 0 ? 0 : fx > gw - 1.001 ? gw - 1.001 : fx; fy = fy < 0 ? 0 : fy > gh - 1.001 ? gh - 1.001 : fy;
  const xi = fx | 0, yi = fy | 0, ax = fx - xi, ay = fy - yi, i0 = (yi * gw + xi) * 3, i1 = i0 + 3, i2 = i0 + gw * 3, i3 = i2 + 3;
  const w0 = (1 - ax) * (1 - ay), w1 = ax * (1 - ay), w2 = (1 - ax) * ay, w3 = ax * ay;
  let r = G[i0] * w0 + G[i1] * w1 + G[i2] * w2 + G[i3] * w3, g = G[i0 + 1] * w0 + G[i1 + 1] * w1 + G[i2 + 1] * w2 + G[i3 + 1] * w3, b = G[i0 + 2] * w0 + G[i1 + 2] * w1 + G[i2 + 2] * w2 + G[i3 + 2] * w3;
  for (let k = 0; k < LT.nd; k++) { const d = LT.dyn[k], ddx = x - d.x, ddy = y - d.y, q = ddx * ddx + ddy * ddy; if (q >= d.r2) continue; const f = 1 - Math.sqrt(q) / d.rad, a = f * f * d.k; r += d.c.r * a; g += d.c.g * a; b += d.c.b * a; }
  out.r = r > 2.4 ? 2.4 : r; out.g = g > 2.4 ? 2.4 : g; out.b = b > 2.4 ? 2.4 : b;
  return out;
}
GFX.lightTint = lightTint;

/* ---------- Per-frame: point-light pool, sun/shadow follow, fog ---------- */
const DYN = []; for (let i = 0; i < 24; i++) DYN.push({ x: 0, y: 0, h: 0, c: new THREE.Color(), i: 0, d: 0, dyn: true, s: 0, rad: 0, r2: 0, k: 0 });
const _cand = [], _col = new THREE.Color();
function spellLights() {
  let n = 0;
  const add = (x, y, h, hex, I, d) => { if (n >= DYN.length) return; const o = DYN[n++]; o.x = x; o.y = y; o.h = h; o.c.copy(linCol(hex)); o.i = I; o.d = d; o.rad = d * 0.7; o.r2 = o.rad * o.rad; o.k = Math.min(1.2, I * 0.35); };
  if (typeof projs !== 'undefined') for (const p of projs) if (p.kind !== 'arrow') add(p.x, p.y, p.zu, PCOL[p.kind] || '#ffffff', 2.6, 5.5);
  if (typeof fxs !== 'undefined') for (const f of fxs) {
    const k = 1 - f.t / f.dur;
    if (f.k === 'meteor') add(f.x, f.y, groundH(f.x, f.y) + 1, f.col || '#ff7a2a', 5 * k, 8);
    else if (f.k === 'strike') add(f.x, f.y, groundH(f.x, f.y) + 2, '#dfe8ff', 6 * k, 8);
    else if (f.k === 'pillar' && f.e) add(f.e.x, f.e.y, groundH(f.e.x, f.e.y) + 1.5, f.col || '#ffffff', 2.4 * Math.sin(Math.PI * (1 - k)), 6);
  }
  if (typeof teles !== 'undefined') for (const t of teles) add(t.x, t.y, groundH(t.x, t.y) + 0.8, '#ff4a1a', 0.8 + 1.4 * (t.t / t.dur), t.r + 2.5);
  if (P && P.casting && typeof SKILLS !== 'undefined' && SKILLS[P.casting.id]) add(P.x, P.y, groundH(P.x, P.y) + 0.6, ELCOL[SKILLS[P.casting.id].el] || '#ffffff', 1.6, 5);
  return n;
}
function updateLights() {
  const nd = spellLights(); LT.dyn = DYN; LT.nd = nd;
  if (!PL.length) return;
  _cand.length = 0; const tx = cam.tx, ty = cam.ty;
  const wayLit = !!(P && P.kindled && P.kindled[map.id]), slain = !!(P && P.flags && P.flags.kingSlain);
  for (const s of LSRC) {
    if (s.way && !wayLit) continue; if (s.heart && !slain) continue;
    s.s = (s.x - tx) ** 2 + (s.y - ty) ** 2; if (s.s > 26 * 26) continue; _cand.push(s);
  }
  for (let k = 0; k < nd; k++) { const o = DYN[k]; o.s = (o.x - tx) ** 2 + (o.y - ty) ** 2 - 400; _cand.push(o); }
  _cand.sort((a, b) => a.s - b.s);
  for (let k = 0; k < PL.length; k++) {
    const l = PL[k], s = _cand[k];
    if (!s) { l.intensity = 0; continue; }
    let I = s.i;
    if (s.fl && !s.dyn) I *= 1 - s.fl * (0.1 + 0.08 * Math.sin(time * 11 + s.ph) + 0.06 * Math.sin(time * 23.7 + s.ph * 2));
    if (s.warp) { const locked = s.warp.lock === 'gate' && !P.flags.gate; _col.setRGB(locked ? 1 : s.c.r, locked ? 0.25 : s.c.g, locked ? 0.12 : s.c.b); l.color.copy(_col); } else l.color.copy(s.c);
    l.intensity = I; l.distance = s.d; l.position.set(s.x, s.h, s.y);
  }
}
const _sr = new THREE.Vector3(), _su = new THREE.Vector3(), _sf = new THREE.Vector3(), _st = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
function updateSun() {
  const d = SKY.sunDir, R = clamp(cam.dist * 0.5, 9, 30), sc = sun.shadow.camera;
  if (sc.right !== R) { sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.updateProjectionMatrix(); }
  // snap the shadow camera to whole shadow texels so edges don't shimmer while walking
  _sf.copy(d).negate(); _sr.crossVectors(_sf, UP).normalize(); _su.crossVectors(_sr, _sf).normalize();
  _st.set(cam.tx, cam.th, cam.ty); const tex = 2 * R / (sun.shadow.mapSize.x || 1024);
  const a = Math.round(_st.dot(_sr) / tex) * tex, b = Math.round(_st.dot(_su) / tex) * tex, c = _st.dot(_sf);
  _st.copy(_sr).multiplyScalar(a).addScaledVector(_su, b).addScaledVector(_sf, c);
  sun.target.position.copy(_st); sun.position.copy(_st).addScaledVector(d, 70); sun.target.updateMatrixWorld();
}
function updateAtmosphere() {
  const k = cam.dist / 40; if (scene.fog && RL) { scene.fog.near = RL.fog[0] * k; scene.fog.far = RL.fog[1] * k; LAVAU.uFog.value.set(scene.fog.near, scene.fog.far); }
  skyDome.position.copy(camera.position);
}
function animateWorld(dt) {
  const A = map.anim; if (!A) return;
  for (const f of A.flames) { const k = 1 + Math.sin(time * 13 + f.sx * 40) * 0.08 + Math.sin(time * 7.3) * 0.05; f.s.scale.set(f.sx * (2 - k), f.sy * k, 1); }
  const lit = !!P.kindled[map.id];
  if (A.way) { A.way.fl.visible = lit; A.way.halo.visible = lit; if (lit) A.way.rune.material.color.setRGB(3.2, 1.3, 0.25); else A.way.rune.material.color.setRGB(0.1, 0.09, 0.08); if (lit && Math.random() < 0.3) parts.push({ x: map.way.x + rand(-0.2, 0.2), y: map.way.y + rand(-0.2, 0.2), z: 115, vx: rand(-0.2, 0.2), vy: rand(-0.2, 0.2), vz: rand(30, 70), life: rand(0.8, 1.6), max: 1.6, col: '#ffa050', size: 2 }); }
  for (const w of A.warps) {
    const locked = w.wp.lock === 'gate' && !P.flags.gate;
    w.ring.rotation.z += dt * 0.8; if (locked) { w.ringM.color.setRGB(1.5, 0.22, 0.1); w.beamM.color.setRGB(0.7, 0.12, 0.05); } else { w.ringM.color.setRGB(0.3, 0.7, 1.5); w.beamM.color.setRGB(0.16, 0.38, 0.8); }
    w.bt.offset.y -= dt * 0.6; w.beam.rotation.y += dt * 0.5;
    w.beamM.opacity = 0.75 + Math.sin(time * 3) * 0.2;
    if (Math.random() < 0.5) parts.push({ x: w.wp.x + 0.5 + rand(-0.5, 0.5), y: w.wp.y + 0.5 + rand(-0.5, 0.5), z: 0, vx: 0, vy: 0, vz: rand(50, 110), life: rand(0.8, 1.4), max: 1.4, col: locked ? '#ff8a6a' : '#bfe4ff', size: 2.5, float: true });
  }
  if (A.shafts) for (const sh of A.shafts) sh.mat.opacity = sh.op * (0.7 + 0.3 * Math.sin(time * 0.6 + sh.ph));
  if (A.lava) LAVAU.uTime.value = time;
  if (A.groundEmis) { const k = 0.85 + 0.15 * Math.sin(time * 1.3); A.groundEmis.emissive.setRGB(1.5 * k, 0.62 * k, 0.25 * k); }
  if (A.heart) { const alive = P.flags.kingSlain; const k = alive ? 0.6 + Math.sin(time * 2) * 0.3 : 0.05; if (alive) A.heart.coreM.color.setRGB(0.4 + k * 2.6, 0.2 + k * 1.6, 0.05 + k * 0.4); else A.heart.coreM.color.setRGB(0.04, 0.015, 0.008); A.heart.glowS.material.opacity = alive ? k * 0.7 : 0; }
  torch.position.set(P.x, groundH(P.x, P.y) + 2.2, P.y);
  const key = map.id + '|' + lit + '|' + !!(P.flags && P.flags.kingSlain); if (LT.key !== key) buildLightGrid();
  updateLights(); updateSun(); updateAtmosphere();
}
function updateCamera(dt) {
  if (P) {
    const k = started ? 1 - Math.pow(0.0005, dt) : 0.02;
    cam.tx += (P.x - cam.tx) * k; cam.ty += (P.y - cam.ty) * k; cam.th += (groundH(P.x, P.y) - cam.th) * k;
  }
  if (!started) cam.yawT += dt * 0.04;
  cam.yaw += (cam.yawT - cam.yaw) * (1 - Math.pow(0.002, dt));
  COSP = Math.cos(cam.pitch);
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch), ty = cam.th + 0.9;
  camera.position.set(cam.tx + Math.sin(cam.yaw) * cp * cam.dist, ty + sp * cam.dist, cam.ty + Math.cos(cam.yaw) * cp * cam.dist);
  if (typeof SHAKE !== 'undefined' && SHAKE > 0) { SHAKE = Math.max(0, SHAKE - dt); const k = SHAKE * 2.2; camera.position.x += rand(-k, k); camera.position.y += rand(-k, k); }
  camera.lookAt(cam.tx, ty, cam.ty);
  PPU = H / (2 * cam.dist * Math.tan(camera.fov * Math.PI / 360));
}
function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1); W = window.innerWidth; H = window.innerHeight;
  renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix();
  cv.width = Math.floor(W * DPR); cv.height = Math.floor(H * DPR);
  if (W < 700) cam.dist = 34;
}
function proj(x, y, z) { _v3.set(x, z, y).project(camera); return [(_v3.x * 0.5 + 0.5) * W, (-_v3.y * 0.5 + 0.5) * H, _v3.z]; }
function w2s(x, y) { const p = proj(x, y, groundH(x, y)); return [p[0], p[1]]; }
function s2w(sx, sy) {
  ndc.set(sx / W * 2 - 1, -(sy / H) * 2 + 1); ray.setFromCamera(ndc, camera);
  if (curWorld && curWorld.userData.ground) { const hit = ray.intersectObject(curWorld.userData.ground, false)[0]; if (hit) return [hit.point.x, hit.point.z]; }
  const o = ray.ray.origin, d = ray.ray.direction, t = (cam.th - o.y) / d.y; return [o.x + d.x * t, o.z + d.z * t];
}
const CURSORS = (() => {
  const svg = (s, hx, hy, fb) => `url("data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'>${s}</svg>`)}") ${hx} ${hy}, ${fb}`;
  return {
    def: svg("<path d='M3 2 L3 21 L8 16.5 L12 25 L15.5 23.4 L11.6 15 L18.5 15 Z' fill='#f7df8e' stroke='#422a0c' stroke-width='1.6' stroke-linejoin='round'/><path d='M5 5 L5 16' stroke='#fff6cc' stroke-width='1.4'/>", 3, 2, 'default'),
    atk: svg("<path d='M4 24 L9 19 M7 17 L11 21 M9 19 L23 5 L24.5 3.5 L25 7 L11 21' fill='#e8eef8' stroke='#303848' stroke-width='1.8' stroke-linejoin='round'/><path d='M3 25 L6 22' stroke='#8a5a2a' stroke-width='3'/>", 24, 4, 'crosshair'),
    talk: svg("<path d='M3 4 H24 V17 H12 L6 23 V17 H3 Z' fill='#fdfdf6' stroke='#384a70' stroke-width='1.6' stroke-linejoin='round'/><circle cx='9' cy='10.5' r='1.5' fill='#384a70'/><circle cx='13.5' cy='10.5' r='1.5' fill='#384a70'/><circle cx='18' cy='10.5' r='1.5' fill='#384a70'/>", 4, 4, 'pointer'),
    pick: svg("<path d='M8 13 V5 a2 2 0 0 1 4 0 V12 V3.5 a2 2 0 0 1 4 0 V12 V5 a2 2 0 0 1 4 0 V14 a8 8 0 0 1 -8 9 h-2 a7 7 0 0 1 -6 -4 L2 14 a2 2 0 0 1 3 -2.4 Z' fill='#f7df8e' stroke='#422a0c' stroke-width='1.5' stroke-linejoin='round'/>", 12, 3, 'pointer'),
  };
})();
let curCursor = '';
function setCursor(k) { if (k !== curCursor) { curCursor = k; cv.style.cursor = CURSORS[k]; } }
applyQuality();
