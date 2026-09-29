'use strict';
/* =========================================================
   3D world: camera, lights, painted ground, world meshes
   Ragnarok-style: textured 3D terrain, rotatable camera,
   2D pixel sprites standing on it (see gfx-sprites.js).
   HD-2D lighting: sRGB + ACES, sun shadows following the
   camera, per-map sky/fog/lights (RLOOK), point-light pool,
   animated lava, lightTint() for sprites. Post: gfx-post.js.
   Round 3: cached static sun shadows (SHADOW), terrain heightmap for the post
   mist / volumetric light, flickering light pools, dust motes, batched glows,
   carved wall caps, bounty-board and Hel's-gate meshes, water / cloud sea,
   data hooks for new maps (m.decor, MAPDEFS.render / .props, manifest kits + LODs).
   ========================================================= */
const PXU = 36;                       // sprite pixels per world unit
const PCOL = { fire: '#ff7a2a', ice: '#9fd8ff', soul: '#c8a8ff', holy: '#fff0b0', arrow: '#d8c8a0', bolt: '#fff6a0', spear: '#e8e0ff', raven: '#b8c8ff', sphere: '#9fd0ff' };
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
function POST_VOL() { return !!(SHADOW.split && GFX.composer && GFX.composer.hdr && GFX.composer.depthOK); }
// Cached sun shadows: the static world is rendered into the sun's shadow map only when the view drifts or the
// world changes, and kept in SHADOW.rt; every frame the map is restored from it (colour + depth via gl_FragDepth)
// and only the dynamic casters (sprites) are drawn on top. Needs WebGL2 or EXT_frag_depth, else plain shadows.
const SHADOW = { ok: renderer.capabilities.isWebGL2 || !!renderer.extensions.get('EXT_frag_depth'), split: false, need: true, cx: 1e9, cz: 1e9, R: 0, renders: 0, margin: 6, tex: null, mat: sun.shadow.matrix, rt: null };
let curWorld = null;
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), _v3 = new THREE.Vector3();

/* ---------- Graphics quality (GFX) ----------
   GFX.quality: 'low' | 'medium' | 'high' | 'ultra' (localStorage 'aom-gfx').
   low = no post, no shadows (about the pre-HD-2D cost).
   World: grass = 3D grass tufts per open grass tile (0 = none); smallShadow = small props
   (barrels, rocks, bones...) cast sun shadows; detail = ground shader level (0 colour
   detail only, 1 + normal detail, 2 + macro variation); farProps = the wilderness props
   outside the playable map. The props on the map are always on.
   Post (gfx-post.js): msaa = scene MSAA samples; mist = depth-based ground mist / height fog;
   heat = lava heat shimmer; ao = half-res SSAO (aoN taps); vol = ray-marched volumetric sun/moon
   light through the cached static shadow map (volN steps); pools = flickering ground light pools.
   Shadows: the sun's static world shadows are cached (re-rendered only when the view drifts or the
   world changes, see SHADOW); a second zero-intensity light re-renders only the sprite casters. */
const GFX_PRESETS = {
  low:    { pr: 1.5, post: false, shadow: 0,    lights: 2, bloomMips: 0, dof: 0, msaa: 0, grass: 0, smallShadow: false, detail: 0, farProps: false, mist: false, heat: false, ao: false, vol: false, pools: false },
  medium: { pr: 1,   post: true,  shadow: 1024, lights: 4, bloomMips: 4, dof: 1, msaa: 2, grass: 1.5, smallShadow: false, detail: 1, farProps: true, mist: true, heat: true, ao: false, vol: false, pools: true },
  high:   { pr: 1.5, post: true,  shadow: 2048, lights: 6, bloomMips: 4, dof: 2, msaa: 2, grass: 3, smallShadow: true,  detail: 2, farProps: true, mist: true, heat: true, ao: true, aoN: 8, vol: true, volN: 10, pools: true },
  ultra:  { pr: 2,   post: true,  shadow: 4096, lights: 8, bloomMips: 6, dof: 3, msaa: 4, grass: 7, smallShadow: true,  detail: 2, farProps: true, mist: true, heat: true, ao: true, aoN: 12, vol: true, volN: 16, pools: true },
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
  const on = Q.shadow > 0, split = on && SHADOW.ok;
  renderer.shadowMap.enabled = on; sun.castShadow = on;
  if (on && sun.shadow.mapSize.x !== Q.shadow) { sun.shadow.mapSize.set(Q.shadow, Q.shadow); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  SHADOW.split = split; sun.shadow.autoUpdate = !split; SHADOW.need = true;
  while (PL.length > Q.lights) scene.remove(PL.pop());
  while (PL.length < Q.lights) { const l = new THREE.PointLight(0xffa050, 0, 7, 2); PL.push(l); scene.add(l); }
  renderer.toneMapping = Q.post ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
  GFX_EPOCH++; refreshMaterials(scene);
  if (typeof map !== 'undefined' && map && RL) applyLook();
  if (curWorld) worldQuality(curWorld);
}
function refreshMaterials(root) {
  root.traverse(o => { const m = o.material; if (!m) return; if (Array.isArray(m)) m.forEach(x => { x.needsUpdate = true; }); else m.needsUpdate = true; });
  root.userData.epoch = GFX_EPOCH;
}
sun.shadow.camera.near = 1; sun.shadow.camera.far = 160; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.035;
(() => {
  const VS = 'varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const FS = `uniform sampler2D tSrc; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tSrc, vUv); gl_FragColor = c;
      #ifdef WRITE_DEPTH
      gl_FragDepthEXT = dot(c, (255.0 / 256.0) / vec4(256.0 * 256.0 * 256.0, 256.0 * 256.0, 256.0, 1.0));
      #endif
    }`;
  const mk = d => new THREE.ShaderMaterial({ uniforms: { tSrc: { value: null } }, vertexShader: VS, fragmentShader: FS, defines: d ? { WRITE_DEPTH: 1 } : {}, extensions: { fragDepth: d }, depthTest: d, depthWrite: d, depthFunc: THREE.AlwaysDepth, fog: false, lights: false });
  const mCol = mk(false), mDep = mk(true), geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const quad = new THREE.Mesh(geo, mCol), qs = new THREE.Scene(), qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); quad.frustumCulled = false; qs.add(quad); qs.autoUpdate = false;
  const copy = (m, src, dst) => { m.uniforms.tSrc.value = src; quad.material = m; renderer.setRenderTarget(dst); renderer.render(qs, qc); };
  const sm = renderer.shadowMap, base = sm.render, noop = () => {};
  // Re-centring when the view drifts is spread over SLICES frames: a builder light with the new frustum renders a
  // slice of the static casters per frame into its own map; when complete it is copied into SHADOW.rt and the sun
  // switches to the new frustum (the old cache has enough margin meanwhile). Map entry / world changes are immediate.
  const BLD = SHADOW.bld = { light: new THREE.DirectionalLight(), list: null, i: 0, on: false, cx: 0, cz: 0, th: 0, R: 0 }, SLICES = 4;
  BLD.light.castShadow = true; Object.assign(BLD.light.shadow, { bias: sun.shadow.bias, normalBias: sun.shadow.normalBias }); BLD.light.shadow.camera.near = 1; BLD.light.shadow.camera.far = 160;
  const casters = root => { const out = []; root.traverseVisible(o => { if ((o.isMesh || o.isInstancedMesh) && o.castShadow) out.push(o); }); return out; };
  function buildSlice(self, c) {
    const L = BLD.light, prev = renderer.getRenderTarget();
    if (L.shadow.mapSize.x !== sun.shadow.mapSize.x) { L.shadow.mapSize.copy(sun.shadow.mapSize); if (L.shadow.map) { L.shadow.map.dispose(); L.shadow.map = null; } }
    const n = Math.ceil(BLD.list.length / SLICES), a = BLD.i, b = Math.min(BLD.list.length, a + n), clr = renderer.clear;
    for (let k = 0; k < BLD.list.length; k++) if (k < a || k >= b) BLD.list[k].visible = false;
    try { if (a > 0) renderer.clear = noop; L.shadow.needsUpdate = true; base.call(self, [L], curWorld, c); }
    finally { renderer.clear = clr; for (let k = 0; k < BLD.list.length; k++) BLD.list[k].visible = true; renderer.setRenderTarget(prev); }
    BLD.i = b;
    if (b >= BLD.list.length) {
      copy(mCol, L.shadow.map.texture, SHADOW.rt); BLD.on = false; SHADOW.renders++;
      aimShadow(sun, BLD.R, BLD.cx, BLD.th, BLD.cz); sun.updateMatrixWorld(); SHADOW.cx = BLD.cx; SHADOW.cz = BLD.cz; SHADOW.R = BLD.R;
    }
  }
  sm.render = function (lights, sc, c) {
    if (!SHADOW.split || sc !== scene || !curWorld || lights.length !== 1 || lights[0] !== sun) return base.call(this, lights, sc, c);
    const prev = renderer.getRenderTarget(), clr = renderer.clear, v = curWorld.visible;
    if (!SHADOW.need && SHADOW.rt && sun.shadow.map) {
      if (SHADOW.pending && !BLD.on) { const q = SHADOW.pending; SHADOW.pending = null; Object.assign(BLD, { on: true, i: 0, cx: q[0], th: q[1], cz: q[2], R: q[3], list: casters(curWorld) }); aimShadow(BLD.light, BLD.R, BLD.cx, BLD.th, BLD.cz); BLD.light.updateMatrixWorld(); }
      if (BLD.on) buildSlice(this, c);
    }
    if (SHADOW.need || !sun.shadow.map || !SHADOW.rt) {
      BLD.on = false; SHADOW.pending = null;
      sun.shadow.needsUpdate = true; base.call(this, lights, curWorld, c);
      const mp = sun.shadow.map;
      if (!SHADOW.rt || SHADOW.rt.width !== mp.width || SHADOW.rt.height !== mp.height) {
        if (SHADOW.rt) SHADOW.rt.dispose();
        SHADOW.rt = new THREE.WebGLRenderTarget(mp.width, mp.height, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false, generateMipmaps: false });
      }
      copy(mCol, mp.texture, SHADOW.rt); SHADOW.need = false; SHADOW.renders++;
    } else copy(mDep, SHADOW.rt.texture, sun.shadow.map);
    // dynamic casters on top of the static depth (no clear); the static world is hidden for this pass
    try { renderer.clear = noop; curWorld.visible = false; sun.shadow.needsUpdate = true; base.call(this, lights, sc, c); }
    finally { renderer.clear = clr; curWorld.visible = v; renderer.setRenderTarget(prev); }
    SHADOW.tex = SHADOW.rt.texture;
  };
})();
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
    lights: { brazier: [0xff9a48, 0.7, 6], way: [0xffa048, 1.1, 8], warp: [0x6aa8ff, 1.0, 5.5], heart: [0xffc060, 2, 10], lamp: [0xffc070, 0.55, 4.5] },
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
    mist: { col: 0xe0e2d6, k: 1, amb: 0.15, lit: 1.1, amt: 0.14, h: 0.35, max: 0.1, scale: 0.045, wind: [0.05, 0.016], scatter: 0.15 },
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
    mist: { col: 0xb8d0b0, k: 1, amb: 0.1, lit: 1.3, amt: 0.6, h: 0.7, max: 0.32, scale: 0.05, wind: [0.035, 0.012], scatter: 0.3 },
    vol: { col: 0xfff0c0, k: 0.45, dens: 0.075, ext: 1, top: 5, scale: 0.05, wind: [0.02, 0.008], noise: 0.8 },
    motes: { n: 700, col: 0xfff2c0, size: 0.06, box: 26, hmin: 0.3, hmax: 4.5, lit: true },
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
    mist: { col: 0x8c9cd0, k: 1, amb: 0.03, lit: 1.6, amt: 0.6, h: 0.55, max: 0.4, scale: 0.065, wind: [0.022, 0.01], scatter: 0.5 },
    vol: { col: 0xa8b8ff, k: 0.3, dens: 0.055, ext: 1, top: 3.4, scale: 0.07, wind: [0.015, 0.008], noise: 0.8 },
    motes: { n: 500, col: 0xc8d4ff, size: 0.05, box: 24, hmin: 0.2, hmax: 3, lit: true },
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
    heat: { amp: 0.0045, y: -0.25 },
    hfog: { col: 0xff5a1e, k: 0.3, amt: 0.22, h: 0.3, max: 0.3 },
    mist: { col: 0x7a4a3a, k: 1, amb: 0.04, lit: 1.2, amt: 0.3, h: 0.5, max: 0.22, scale: 0.05, wind: [0.01, -0.03], scatter: 0.5 },
  },
};
// Maps without an RLOOK entry: MAPDEFS[id].render (data hook for new maps), else derived from MAPDEFS.look.
// render = { sky:[top,horizon], fog:[color,near,far], exposure, sun:[color,intensity,dir], hemi:[sky,ground,int],
//   bloom:[threshold,strength], grade:{...}, mist, hfog, vol, heat, shafts, motes, lights, trees } (all optional)
const RLOOK_GEN = {};
function rlookFor(m) {
  if (RLOOK[m.id]) return RLOOK[m.id];
  if (RLOOK_GEN[m.id]) return RLOOK_GEN[m.id];
  const L = (m.d && m.d.look) || {}, base = RLOOK.ashen_fields, Rd = m.d && m.d.render, dark = m.d && m.d.gen === 'dungeon';
  let R;
  try {
    R = Object.assign({}, base, { haze: L.fog !== undefined ? L.fog : base.haze, sky: [L.fog !== undefined ? L.fog : base.sky[0], L.fog !== undefined ? L.fog : base.sky[1]],
      hemi: L.hemi ? [L.hemi[0], L.hemi[1], L.hemi[2] * 0.8] : base.hemi, sun: L.sun ? [L.sun[0], L.sun[1] * 3] : base.sun, torch: [0xffa860, L.torch || 0, 10], mist: null, hfog: null });
    if (dark) Object.assign(R, { exposure: 1.1, lights: RLOOK.gloamheim.lights, bloom: RLOOK.gloamheim.bloom, lt: RLOOK.gloamheim.lt });
    if (Rd) {
      const num = (v, d) => typeof v === 'number' && isFinite(v) ? v : d;
      if (Rd.sky) R.sky = [Rd.sky[0], Rd.sky[1] !== undefined ? Rd.sky[1] : Rd.sky[0]];
      if (Rd.fog) { R.haze = Rd.fog[0]; R.fog = [num(Rd.fog[1], base.fog[0]), num(Rd.fog[2], base.fog[1])]; if (!Rd.sky) R.sky = [Rd.fog[0], Rd.fog[0]]; }
      R.exposure = num(Rd.exposure, R.exposure);
      if (Rd.sun) { R.sun = [Rd.sun[0], num(Rd.sun[1], base.sun[1])]; if (Rd.sun[2] && Rd.sun[2].length === 3) R.sunDir = Rd.sun[2].slice(); }
      if (Rd.hemi) R.hemi = [Rd.hemi[0], Rd.hemi[1], num(Rd.hemi[2], base.hemi[2])];
      if (Rd.bloom) R.bloom = { threshold: num(Rd.bloom[0], base.bloom.threshold), knee: 0.4, strength: num(Rd.bloom[1], base.bloom.strength) };
      if (Rd.grade) R.grade = Object.assign({}, base.grade, Rd.grade);
      for (const k of ['mist', 'hfog', 'vol', 'heat', 'shafts', 'motes', 'lights', 'dof', 'vignette', 'grain', 'lt', 'spec', 'paint', 'ao', 'water', 'void', 'torch']) if (Rd[k] !== undefined) R[k] = Rd[k];
      // sprite light tint from the lights when not given: ambient ~ hemi sky, direct ~ sun
      if (!Rd.lt && (Rd.hemi || Rd.sun)) {
        const h = new THREE.Color(R.hemi[0]).convertSRGBToLinear(), su = new THREE.Color(R.sun[0]).convertSRGBToLinear(), hi = R.hemi[2] / 0.42, si = R.sun[1] / 0.8;
        R.lt = { amb: [h.r, h.g, h.b].map(v => clamp(0.3 + v * 0.45 * hi, 0.25, 0.9)), sun: [su.r, su.g, su.b].map(v => clamp(v * 0.5 * si, 0, 0.8)) };
      }
    }
    new THREE.Color(R.haze); new THREE.Color(R.sky[0]); new THREE.Color(R.sun[0]);   // throws on garbage colours
  } catch (e) { console.warn('[gfx] bad render look for', m.id, e); R = Object.assign({}, base); }
  return (RLOOK_GEN[m.id] = R);
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

/* ---------- Ground detail layers (HD-2D terrain) ----------
   Tileable DataTextures sampled in world space at high frequency and blended in the ground
   shader over the painted macro texture. RG = height slope (dh/dx, dh/dz in world units,
   stored 0.5 + s/4), B = luminance detail (mean 0.5), A = height (drives height-blended
   layer edges: cobbles break up along their stones, dirt creeps between grass clumps).
   kind -> [size px, span in tiles, relief in world units]. Built once, shared by all maps. */
const DETAIL = {};
const DETAIL_KINDS = { grass: [256, 2, 0.035], dirt: [512, 4, 0.05], cobble: [512, 4, 0.075], flag: [512, 4, 0.06], ash: [512, 4, 0.03], basalt: [512, 4, 0.07], snow: [256, 4, 0.045], mud: [512, 4, 0.05], cloud: [256, 4, 0.03] };
// look.floor -> ground detail texture (unknown floors fall back to the nearest existing one)
const FLOOR_DETAIL = { grass: 'grass', flag: 'flag', carved: 'flag', stone: 'flag', rock: 'basalt', basalt: 'basalt', snow: 'snow', ice: 'snow', mud: 'mud', swamp: 'mud', dirt: 'dirt', sand: 'dirt', cloud: 'cloud' };
function floorDetail(f) { return FLOOR_DETAIL[f] || 'grass'; }
const FLAG_ROWS = [[1, 2, 1], [2, 2], [1, 1, 2], [2, 1, 1], [1.5, 1.5, 1], [1, 1.5, 1.5], [1, 1, 1, 1]];
// Fast periodic value noise on cached hash lattices (P must be a power of two).
const LAT = {};
function lattice(P, seed) { const k = P + ':' + seed; let a = LAT[k]; if (!a) { a = new Float32Array(P * P); for (let j = 0; j < P; j++) for (let i = 0; i < P; i++) a[j * P + i] = hash2(i, j, seed); LAT[k] = a; } return a; }
function mkfbm(P, oct, seed) {
  const L = []; for (let o = 0; o < oct; o++) L.push(lattice(P << o, seed + o * 7));
  return (x, y) => {
    let s = 0, amp = 0.5, t = 0, p = P;
    for (let o = 0; o < oct; o++) {
      const a = L[o], M = p - 1, xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      const x0 = xi & M, x1 = (xi + 1) & M, y0 = (yi & M) * p, y1 = ((yi + 1) & M) * p, A = a[y0 + x0], B = a[y0 + x1], C = a[y1 + x0], D = a[y1 + x1];
      s += amp * (A + (B - A) * u + (C - A) * v + (A - B - C + D) * u * v); t += amp; x *= 2; y *= 2; p *= 2; amp *= 0.5;
    }
    return s / t;
  };
}
// Tileable cellular noise over a G x G cell grid: out = [F1, F2, cell id]
function mkvoro(G, jit, seed) {
  const jx = new Float32Array(G * G), jy = new Float32Array(G * G);
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { jx[j * G + i] = 0.5 + (hash2(i, j, seed) - 0.5) * jit; jy[j * G + i] = 0.5 + (hash2(i, j, seed + 1) - 0.5) * jit; }
  return (u, v, out) => {
    const iu = Math.floor(u), iv = Math.floor(v); let d1 = 9, d2 = 9, id = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = iu + i, cy = iv + j, wx = cx < 0 ? cx + G : cx >= G ? cx - G : cx, wy = cy < 0 ? cy + G : cy >= G ? cy - G : cy, k = wy * G + wx;
      const dx = cx + jx[k] - u, dy = cy + jy[k] - v, d = dx * dx + dy * dy;
      if (d < d1) { d2 = d1; d1 = d; id = k; } else if (d < d2) d2 = d;
    }
    out[0] = Math.sqrt(d1); out[1] = Math.sqrt(d2); out[2] = id; return out;
  };
}
function detailTex(kind) {
  if (DETAIL[kind]) return DETAIL[kind];
  const [N, span, relief] = DETAIL_KINDS[kind], Hh = new Float32Array(N * N), Ll = new Float32Array(N * N), vo = [0, 0, 0], sd = kind.length * 131 + kind.charCodeAt(0);
  const hs = (a, b, k) => hash2(a, b, sd + k);
  const f8 = mkfbm(8, kind === 'dirt' ? 4 : 5, sd), f32 = mkfbm(32, 2, sd + 40), f16 = mkfbm(16, 3, sd + 9), fc = mkfbm(8, 3, sd + 20);
  const V = kind === 'dirt' || kind === 'mud' ? mkvoro(64, 0.9, sd + 3) : kind === 'ash' ? mkvoro(12, 0.8, sd + 4) : kind === 'cobble' ? mkvoro(16, 0.62, sd) : kind === 'basalt' ? mkvoro(8, 0.55, sd) : null;
  const FR = [0, 1, 2, 3].map(r => FLAG_ROWS[(hs(r, 1, 0) * FLAG_ROWS.length) | 0]), FO = [0, 1, 2, 3].map(r => Math.floor(hs(r, 2, 0) * 8) * 0.5), SL = new Float32Array(128 * 5).map((_, i) => hs(i, 3, 0));
  const cellR = new Float32Array(V ? 64 * 64 * 3 : 0);   // per-cell randoms (cell ids < 64*64 for every grid used) for (let i = 0; i < cellR.length / 3; i++) { cellR[i * 3] = hs(i, 3, 0); cellR[i * 3 + 1] = hs(i, 9, 0); cellR[i * 3 + 2] = hs(i, 11, 0); }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, i = y * N + x, sp = NZ.b[(y & 255) * 256 + (x & 255)] - 0.5; let h = 0.5, l = 0.5;
    if (kind === 'grass') {
      const a = f8(u * 8, v * 8), b = f32(u * 32, v * 32);
      h = a * 0.5 + b * 0.5; l = 0.5 + (a - 0.5) * 0.8 + (b - 0.5) * 0.9 + sp * 0.12;
    } else if (kind === 'dirt') {
      const a = f8(u * 8, v * 8); V(u * 64, v * 64, vo); const c = vo[2] * 3;
      const r = cellR[c], rad = 0.16 + 0.22 * cellR[c + 1], bump = r < 0.42 ? Math.max(0, 1 - (vo[0] / rad) ** 2) : 0;
      h = a * 0.55 + Math.sqrt(bump) * 0.45; l = 0.5 + (a - 0.5) * 0.9 + (bump > 0 ? (cellR[c + 2] - 0.3) * 0.5 * Math.min(1, bump * 3) : 0) + sp * 0.14;
    } else if (kind === 'cobble') {
      V(u * 16, v * 16, vo); const e = vo[1] - vo[0], r = cellR[vo[2] * 3], n = f16(u * 16, v * 16);
      const top = smoothstep(0.03, 0.34, e); h = Math.pow(top, 0.6) * (0.74 + 0.26 * r) + (n - 0.5) * 0.14;
      l = e < 0.06 ? 0.16 + n * 0.12 : (0.32 + 0.36 * r + (n - 0.5) * 0.32) * (0.7 + 0.3 * top) + sp * 0.08;
    } else if (kind === 'flag') {
      const X = u * 4, Y = v * 4, r = Math.floor(Y), pat = FR[r], xx = (X + FO[r]) % 4; let s0 = 0, k = 0; while (k < pat.length - 1 && xx >= s0 + pat[k]) { s0 += pat[k]; k++; }
      let y0 = r, y1 = r + 1, sid = r * 8 + k;
      if (pat[k] <= 1 && SL[sid * 5] < 0.3) { if (Y - r < 0.5) y1 = r + 0.5; else { y0 = r + 0.5; sid += 64; } }
      const e = Math.min(xx - s0, s0 + pat[k] - xx, Y - y0, y1 - Y), q = sid * 5, n = f16(u * 16, v * 16), top = smoothstep(0.0, 0.06, e);
      const tilt = (SL[q + 1] - 0.5) * 0.2 * (xx - s0 - pat[k] / 2) + (SL[q + 2] - 0.5) * 0.3 * (Y - (y0 + y1) / 2);
      const crack = SL[q + 3] < 0.45 ? smoothstep(0.95, 0.99, 1 - Math.abs(2 * fc(u * 8, v * 8) - 1)) : 0;
      h = top * (0.8 + 0.15 * SL[q + 4]) + tilt + (n - 0.5) * 0.14 - crack * 0.35;
      l = (0.32 + 0.32 * SL[q + 4] + (n - 0.5) * 0.36) * (0.45 + 0.55 * top) - crack * 0.2 + sp * 0.07;
    } else if (kind === 'ash') {
      // burnt ground: charred crust plates split by dark cracks, powdery grey ash drifts, char and flake specks
      const a = f8(u * 8, v * 8), b = f32(u * 32, v * 32); V(u * 12, v * 12, vo); const e = vo[1] - vo[0], r = cellR[vo[2] * 3];
      const crack = 1 - smoothstep(0.02, 0.07, e), drift = smoothstep(0.45, 0.7, a);
      h = a * 0.5 + b * 0.2 + (1 - crack) * 0.3 * (0.7 + 0.3 * r) - drift * 0.1;
      l = 0.46 + (r - 0.5) * 0.18 + (b - 0.5) * 0.3 + drift * 0.22 - crack * 0.34 * (1 - drift) + (sp < -0.46 ? -0.28 : sp > 0.47 ? 0.3 : sp * 0.12);
    } else if (kind === 'snow') {
      const a = f8(u * 8, v * 8), b = f32(u * 32, v * 32), rip = Math.sin((u * 3 + a * 0.8) * 6.283 * 6) * 0.5 + 0.5;
      h = a * 0.75 + rip * 0.12 + b * 0.13; l = 0.5 + (a - 0.5) * 0.28 + (b - 0.5) * 0.12 + (sp > 0.485 ? 0.35 : 0) + rip * 0.04;
    } else if (kind === 'mud') {
      const a = f8(u * 8, v * 8), b = f32(u * 32, v * 32); V(u * 64, v * 64, vo); const c = vo[2] * 3;
      const r = cellR[c], rad = 0.14 + 0.18 * cellR[c + 1], bump = r < 0.25 ? Math.max(0, 1 - (vo[0] / rad) ** 2) : 0, wet = smoothstep(0.42, 0.3, a);
      h = a * 0.7 + b * 0.1 + Math.sqrt(bump) * 0.25 - wet * 0.1; l = 0.5 + (a - 0.5) * 0.5 + (b - 0.5) * 0.25 - wet * 0.22 + (bump > 0 ? (cellR[c + 2] - 0.4) * 0.4 : 0) + sp * 0.1;
    } else if (kind === 'cloud') {
      const a = f8(u * 8, v * 8), b = f32(u * 32, v * 32);
      h = a * 0.85 + b * 0.15; l = 0.5 + (a - 0.5) * 0.45 + (b - 0.5) * 0.1;
    } else if (kind === 'basalt') {
      V(u * 8, v * 8, vo); const e = vo[1] - vo[0], r = cellR[vo[2] * 3], n = f16(u * 16, v * 16), top = smoothstep(0.01, 0.16, e);
      h = top * (0.75 + 0.25 * r) + (n - 0.5) * 0.16; l = (0.36 + 0.3 * r + (n - 0.5) * 0.32) * (0.4 + 0.6 * top) + sp * 0.06;
    }
    Hh[i] = h; Ll[i] = l;
  }
  let mean = 0; for (let i = 0; i < N * N; i++) mean += Ll[i]; mean /= N * N;
  const D = new Uint8Array(N * N * 4), k = relief * N / (2 * span), M = N - 1;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x, sx = (Hh[y * N + ((x + 1) & M)] - Hh[y * N + ((x - 1) & M)]) * k, sz = (Hh[((y + 1) & M) * N + x] - Hh[((y - 1) & M) * N + x]) * k;
    D[i * 4] = clamp(128 + sx * 64, 0, 255); D[i * 4 + 1] = clamp(128 + sz * 64, 0, 255); D[i * 4 + 2] = clamp((Ll[i] - mean + 0.5) * 255, 0, 255); D[i * 4 + 3] = clamp(Hh[i] * 255, 0, 255);
  }
  const t = new THREE.DataTexture(D, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); t.needsUpdate = true;
  return (DETAIL[kind] = { tex: t, span });
}
const rgbLin = a => new THREE.Color(a[0] / 255, a[1] / 255, a[2] / 255).convertSRGBToLinear();

/* Ground shader (onBeforeCompile on the Phong ground/skirt material): painted macro colour x
   detail luminance, height-blended ash / path / cobble layers from the mask texture, baked
   shade (AO + light pools, x2 encoded), and a detail normal (medium+). Layer uniforms are
   only declared for layers the map uses (keeps sampler count low for WebGL1). */
const GD_PARS = `varying vec3 vGW;
uniform sampler2D uDB; uniform vec4 uDS; uniform float uNrm;
#if defined(GD_LAYERS) || defined(GD_SHADE)
uniform vec2 uMapInv;
#endif
#ifdef GD_LAYERS
uniform sampler2D uMask;
#endif
#ifdef GD_SHADE
uniform sampler2D uShade;
#endif
#ifdef GD_PATH
uniform sampler2D uDP; uniform vec3 uPathC;
#endif
#ifdef GD_COB
uniform sampler2D uDC; uniform vec3 uCobC;
#endif
#ifdef GD_ASH
uniform sampler2D uDA; uniform vec3 uAshC;
#endif`;
const GD_MAP = `vec2 gSl = vec2(0.0); float gH = 0.5;
#ifdef USE_MAP
{
  vec4 texelColor = mapTexelToLinear(texture2D(map, vUv));
  vec2 wp = vGW.xz;
  vec4 dB = texture2D(uDB, wp * uDS.x);
  vec3 col = texelColor.rgb * (0.5 + dB.b);
  gSl = (dB.rg - 0.5) * 4.0; gH = dB.a;
  #ifdef GD_MACRO
  float lowN = texture2D(uDB, wp * 0.029 + vec2(0.37, 0.11)).a;
  #else
  float lowN = 0.5;
  #endif
  #ifdef GD_LAYERS
  vec2 wn = texture2D(uDB, wp * 0.093 + vec2(0.21, 0.63)).ba - 0.5;   // low-frequency domain warp: no tile-shaped edges
  vec4 mk = texture2D(uMask, (wp + wn * 1.5) * uMapInv);
  #ifdef GD_ASH
  if (mk.b > 0.003) {
    vec4 d = texture2D(uDA, wp * uDS.w);
    float e = mk.b + (d.a - 0.5) * 0.5 + (lowN - 0.5) * 0.22, w = smoothstep(0.44, 0.56, e);
    float rim = smoothstep(0.1, 0.42, e) * (1.0 - w);
    col = mix(col, col * vec3(1.02, 0.8, 0.46) * 0.85, rim * 0.8);                 // singed, dry grass around the burn
    col *= 1.0 - smoothstep(0.32, 0.46, e) * (1.0 - w) * 0.4;                      // charred ring
    vec3 ash = uAshC * (0.2 + 1.6 * d.b) * (0.85 + 0.3 * lowN);
    ash = mix(ash * vec3(0.5, 0.46, 0.44), ash, smoothstep(0.5, 0.75, e));          // char at the edge, pale ash inside
    col = mix(col, ash, w); gSl = mix(gSl, (d.rg - 0.5) * 4.0, w); gH = mix(gH, d.a, w);
  }
  #endif
  #ifdef GD_PATH
  if (mk.r > 0.003) {
    vec4 d = texture2D(uDP, wp * uDS.y);
    float e = mk.r + (d.a - gH) * 0.45 + (lowN - 0.5) * 0.25, w = smoothstep(0.45, 0.56, e);
    col *= 1.0 - smoothstep(0.28, 0.46, e) * (1.0 - w) * 0.28;             // trampled, darker rim
    col = mix(col, uPathC * (0.28 + 1.44 * d.b) * (0.78 + 0.44 * lowN), w); gSl = mix(gSl, (d.rg - 0.5) * 4.0, w); gH = mix(gH, d.a, w);
  }
  #endif
  #ifdef GD_COB
  if (mk.g > 0.003) {
    vec4 d = texture2D(uDC, wp * uDS.z);
    float w = smoothstep(0.44, 0.56, mk.g + (d.a - 0.55) * 0.45);
    col = mix(col, uCobC * (0.25 + 1.5 * d.b) * (0.86 + 0.28 * lowN), w); gSl = mix(gSl, (d.rg - 0.5) * 4.0, w); gH = mix(gH, d.a, w);
  }
  #endif
  #endif
  #ifdef GD_SHADE
  col *= texture2D(uShade, wp * uMapInv).rgb * 2.0;
  #endif
  diffuseColor.rgb *= col;
}
#endif`;
const GD_NORMAL = `#ifdef GD_NORMAL
normal = normalize(normal - uNrm * (viewMatrix * vec4(gSl.x, 0.0, gSl.y, 0.0)).xyz);
#endif`;
function groundDetail(mat, o) {
  const one = new THREE.Vector4(1 / o.base.span, o.path ? 1 / o.path.span : 1, o.cob ? 1 / o.cob.span : 1, o.ash ? 1 / o.ash.span : 1);
  const U = { uDB: { value: o.base.tex }, uDS: { value: one }, uNrm: { value: o.nrm || 1 } };
  let defs = '';
  if (o.mask) { defs += '#define GD_LAYERS\n'; U.uMask = { value: o.mask }; U.uMapInv = { value: o.mapInv }; }
  if (o.shade) { defs += '#define GD_SHADE\n'; U.uShade = { value: o.shade }; U.uMapInv = { value: o.mapInv }; }
  if (o.path) { defs += '#define GD_PATH\n'; U.uDP = { value: o.path.tex }; U.uPathC = { value: o.pathC }; }
  if (o.cob) { defs += '#define GD_COB\n'; U.uDC = { value: o.cob.tex }; U.uCobC = { value: o.cobC }; }
  if (o.ash) { defs += '#define GD_ASH\n'; U.uDA = { value: o.ash.tex }; U.uAshC = { value: o.ashC }; }
  const prev = mat.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile ? mat.onBeforeCompile : null, key = defs.replace(/#define GD_|\n/g, '');
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    Object.assign(sh.uniforms, U);
    const q = GFX.preset.detail;
    const d = defs + (q >= 1 ? '#define GD_NORMAL\n' : '') + (q >= 2 ? '#define GD_MACRO\n' : '');
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW;').replace('#include <project_vertex>', '#include <project_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = d + sh.fragmentShader.replace('#include <common>', '#include <common>\n' + GD_PARS).replace('#include <map_fragment>', GD_MAP)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + GD_NORMAL).replace('#include <specularmap_fragment>', '#include <specularmap_fragment>\nspecularStrength *= 0.3 + 1.4 * gH;');
  };
  mat.customProgramCacheKey = () => 'gd' + key + GFX.preset.detail + (prev ? 'p' : '');
  return mat;
}

/* ---------- Ground layer mask: 4 texels per tile. R path/dirt, G cobble, B ash ----------
   Smooth fields; the shader cuts them with detail height + noise into crisp organic edges. */
function groundMask(m) {
  const L = m.d.look, w = m.w, h = m.h, R = 4, MW = w * R, MH = h * R, D = new Uint8Array(MW * MH * 4);
  const pf = new Float32Array(w * h), cf = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) { const d = m.deco[i]; if (d === 5 && L.cobble) cf[i] = 1; else if (d === 6 || d === 5) pf[i] = 1; }
  const pb = new Float32Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h) { const k = dx || dy ? 0.6 : 1.4; s += pf[yy * w + xx] * k; n += k; } } pb[y * w + x] = s / n; }
  const bil = (f, x, y) => { x -= 0.5; y -= 0.5; const xi = clamp(Math.floor(x), 0, w - 2), yi = clamp(Math.floor(y), 0, h - 2); const fx = clamp(x - xi, 0, 1), fy = clamp(y - yi, 0, 1); const i = yi * w + xi; return f[i] * (1 - fx) * (1 - fy) + f[i + 1] * fx * (1 - fy) + f[i + w] * (1 - fx) * fy + f[i + w + 1] * fx * fy; };
  const ashK = Math.min(1, (L.ashAmt || 0) * 2.4), sd = m.d.seed;
  let hasP = false, hasC = false, hasA = false;
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const tx = (x + 0.5) / R, ty = (y + 0.5) / R, o = (y * MW + x) * 4, p = bil(pb, tx, ty), c = bil(cf, tx, ty);
    let a = 0;
    if (ashK) { const an = vnoise(tx / 3.3, ty / 3.3, sd + 31) * 0.58 + vnoise(tx / 1.3, ty / 1.3, sd + 32) * 0.42; a = smoothstep(0.6, 0.76, an) * ashK * (1 - Math.min(1, p * 1.6)); }
    D[o] = p * 255; D[o + 1] = c * 255; D[o + 2] = a * 255; D[o + 3] = 255;
    hasP = hasP || p > 0.01; hasC = hasC || c > 0.01; hasA = hasA || a > 0.01;
  }
  const t = new THREE.DataTexture(D, MW, MH, THREE.RGBAFormat); t.magFilter = t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
  return { tex: t, D, MW, MH, R, hasP, hasC, hasA, at(x, z) { const i = (clamp(Math.floor(z * R), 0, MH - 1) * MW + clamp(Math.floor(x * R), 0, MW - 1)) * 4; return [D[i] / 255, D[i + 1] / 255, D[i + 2] / 255]; } };
}

/* ---------- Ground painting ----------
   macro: base colour at 32 px/tile (grass/flag/basalt tones, grass strokes, flowers, cracks);
   shade: 8 px/tile multiplier x2 (AO under solids and props, dungeon falloff, light pools),
   applied after the shader layers so paths and cobbles get it too;
   base: 4 samples/tile of the linear base colour (grass tuft tint). */
function paintGround(m, plan) {
  const L = m.d.look, TP = 32, Wp = m.w * TP, Hp = m.h * TP, w = m.w, h = m.h;
  const c = mkCanvas(Wp, Hp), g = c.getContext('2d'), img = g.createImageData(Wp, Hp), D = img.data;
  const PO = (RLOOK[m.id] && RLOOK[m.id].paint) || {};
  const g1 = PO.g1 || L.g1, g2 = PO.g2 || L.g2, grain = (L.grain || 20) * 0.8;
  for (let py = 0; py < Hp; py++) {
    for (let px = 0; px < Wp; px++) {
      const n1 = NZ.a[((py >> 3) & 255) * 256 + ((px >> 3) & 255)], n3 = NZ.a[((py >> 1) & 255) * 256 + ((px >> 1) & 255)], n2 = NZ.b[(py & 255) * 256 + (px & 255)];
      const n0 = NZ.a[((py >> 5) & 255) * 256 + ((px >> 5) & 255)];
      const t = n0 * 0.35 + n1 * 0.45 + n3 * 0.2, gr = (n2 - 0.5) * grain;
      const o = (py * Wp + px) * 4; D[o] = g1[0] + (g2[0] - g1[0]) * t + gr; D[o + 1] = g1[1] + (g2[1] - g1[1]) * t + gr; D[o + 2] = g1[2] + (g2[2] - g1[2]) * t + gr * 0.6; D[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // base colour samples for the grass tufts (linear)
  const BR = 4, base = new Float32Array(w * BR * h * BR * 3);
  for (let y = 0; y < h * BR; y++) for (let x = 0; x < w * BR; x++) { const o = ((y * 8 + 4) * Wp + x * 8 + 4) * 4, k = (y * w * BR + x) * 3; base[k] = (D[o] / 255) ** 2.2; base[k + 1] = (D[o + 1] / 255) ** 2.2; base[k + 2] = (D[o + 2] / 255) ** 2.2; }
  const rng = mulberry32(m.d.seed * 3 + 1), T_ = m.t;
  const tileOpen = (x, y) => x >= 0 && y >= 0 && x < w && y < h && T_[y * w + x] === 0;
  // Dungeon: rough dark bedrock under the solid mass, moss where the floor meets walls
  if (floorDetail(L.floor) === 'flag' && m.d.gen === 'dungeon') for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = x * TP, Y = y * TP;
    if (!tileOpen(x, y)) { if (T_[y * w + x] === T.WALL) { g.fillStyle = `rgba(0,0,0,${0.25 + rng() * 0.1})`; g.fillRect(X, Y, TP, TP); } continue; }
    if (!tileOpen(x, y - 1) || !tileOpen(x - 1, y)) for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(80,120,64,${0.18 + rng() * 0.3})`; g.fillRect(X + rng() * TP, Y + rng() * 8, 2 + rng() * 3, 2); }
  }
  // Volcanic cracks: dark grooves in the albedo + a glowing emissive map (bloom picks them up)
  if (L.floor === 'rock') {
    const ec = mkCanvas(w * 16, h * 16), eg = ec.getContext('2d'); eg.fillStyle = '#000'; eg.fillRect(0, 0, ec.width, ec.height); eg.lineCap = eg.lineJoin = 'round';
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!tileOpen(x, y) || rng() > 0.12) continue;
      const pts = [[(x + rng()) * TP, (y + rng()) * TP]]; let a = rng() * 6.28;
      for (let k = 0, n = 4 + (rng() * 6 | 0); k < n; k++) { a += (rng() - 0.5) * 2.4; const [px, py] = pts[pts.length - 1], l = 3 + rng() * 6; pts.push([px + Math.cos(a) * l, py + Math.sin(a) * l]); }
      const path = (cc, sc) => { cc.beginPath(); pts.forEach(([px, py], i) => i ? cc.lineTo(px * sc, py * sc) : cc.moveTo(px * sc, py * sc)); cc.stroke(); };
      g.strokeStyle = 'rgba(18,8,6,.75)'; g.lineWidth = 2.2; g.lineJoin = 'miter'; path(g, 1);
      const hot = rng(); eg.strokeStyle = `rgba(255,${110 + hot * 90 | 0},${30 + hot * 40 | 0},${0.5 + hot * 0.5})`; eg.lineWidth = 0.7 + hot * 0.6; eg.lineCap = 'butt'; eg.lineJoin = 'miter'; eg.shadowColor = '#ff6a1a'; eg.shadowBlur = 3; path(eg, 0.5);
    }
    eg.shadowBlur = 0; eg.globalCompositeOperation = 'lighter';
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (T_[y * w + x] === T.LAVA && (tileOpen(x + 1, y) || tileOpen(x - 1, y) || tileOpen(x, y + 1) || tileOpen(x, y - 1))) { const gr = eg.createRadialGradient((x + 0.5) * 16, (y + 0.5) * 16, 0, (x + 0.5) * 16, (y + 0.5) * 16, 18); gr.addColorStop(0, 'rgba(255,90,20,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); eg.fillStyle = gr; eg.fillRect(x * 16 - 18, y * 16 - 18, 52, 52); }
    m.emisCanvas = ec;
  }
  // Grass blades & flowers (the 3D tufts carry most of this on medium+)
  if (L.floor === 'grass') {
    for (let i = 0; i < w * h * 5; i++) { const x = rng() * w, y = rng() * h; if (!tileOpen(x | 0, y | 0) || m.deco[(y | 0) * w + (x | 0)] >= 5) continue; const X = x * TP, Y = y * TP; g.strokeStyle = rng() < 0.5 ? `rgba(40,70,20,.3)` : `rgba(200,230,140,.2)`; g.lineWidth = 1; g.beginPath(); g.moveTo(X, Y); g.lineTo(X + (rng() - 0.5) * 3, Y - 3 - rng() * 3); g.stroke(); }
    const FL = ['#ffffff', '#ffe46a', '#ff9ac8', '#c8a0ff', '#ff7a5a'];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!tileOpen(x, y) || m.deco[y * w + x] >= 5 || rng() > L.flowers * 0.6) continue; const col = FL[(rng() * FL.length) | 0], cx = x * TP + rng() * TP, cy = y * TP + rng() * TP;
      for (let k = 0; k < 2 + rng() * 4; k++) { const fx = cx + (rng() - 0.5) * 14, fy = cy + (rng() - 0.5) * 10; g.fillStyle = 'rgba(30,60,20,.45)'; g.fillRect(fx - 1, fy + 1, 3, 2); g.fillStyle = col; g.fillRect(fx - 1, fy - 1, 3, 3); }
    }
  }
  // Walkable surface variants (m.surf): ice, mud, planks, snow, gravel, black sand, gold. One tile-resolution layer per
  // kind, upscaled with bilinear smoothing (soft one-tile ramps) and broken up by the macro grain showing through.
  if (m.surf) {
    const SC = { 7: [214, 234, 248, 0.85], 8: [58, 50, 32, 0.78], 9: [138, 102, 62, 0.9], 10: [236, 240, 246, 0.8], 11: [104, 96, 88, 0.72], 12: [64, 60, 68, 0.85], 13: [228, 190, 92, 0.9] };
    const kinds = new Set(); for (let i = 0; i < w * h; i++) if (SC[m.surf[i]]) kinds.add(m.surf[i]);
    for (const k of kinds) {
      const c = SC[k], lc = mkCanvas(w, h), lg = lc.getContext('2d'), im = lg.createImageData(w, h);
      for (let i = 0; i < w * h; i++) { const o = i * 4, on = m.surf[i] === k; im.data[o] = c[0]; im.data[o + 1] = c[1]; im.data[o + 2] = c[2]; im.data[o + 3] = on ? c[3] * (0.85 + 0.15 * NZ.b[i & 65535]) * 255 : 0; }
      lg.putImageData(im, 0, 0); g.save(); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(lc, 0, 0, Wp, Hp); g.restore();
      if (k === 7) for (let i = 0; i < w * h; i++) if (m.surf[i] === 7 && rng() < 0.5) { const X = (i % w) * TP, Y = ((i / w) | 0) * TP; g.strokeStyle = 'rgba(255,255,255,.3)'; g.lineWidth = 1; g.beginPath(); g.moveTo(X + rng() * TP, Y + rng() * TP); g.lineTo(X + rng() * TP, Y + rng() * TP); g.stroke(); }
    }
  }
  // Scattered decorations (bones are 3D props now)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dc = m.deco[y * w + x]; if (!dc || !tileOpen(x, y)) continue; const X = x * TP + 8 + rng() * 16, Y = y * TP + 8 + rng() * 16;
    if (dc === 2 && !(plan && plan.ok)) { g.fillStyle = 'rgba(236,228,206,.8)'; g.fillRect(X - 6, Y, 10, 2); g.beginPath(); g.arc(X + 6, Y - 1, 3, 0, 7); g.fill(); }
    else if (dc === 3) { g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(X - 10, Y - 3); g.lineTo(X, Y + 2); g.lineTo(X + 9, Y - 4); g.stroke(); }
    else if (dc === 4) { g.fillStyle = L.floor === 'rock' ? 'rgba(255,120,40,.3)' : 'rgba(110,106,100,.45)'; g.beginPath(); g.ellipse(X, Y, 9, 5, 0, 0, 7); g.fill(); }
    else if (dc === 1 && L.floor === 'grass') { g.fillStyle = 'rgba(40,80,24,.4)'; g.beginPath(); g.ellipse(X, Y, 7, 4, 0, 0, 7); g.fill(); }
  }
  // ---- shade layer ----
  const SR = 8, sc = mkCanvas(w * SR, h * SR), sg = sc.getContext('2d');
  sg.fillStyle = 'rgb(128,128,128)'; sg.fillRect(0, 0, sc.width, sc.height);
  const spot = (cx, cy, R, a) => { const gr = sg.createRadialGradient(cx * SR, cy * SR, 0, cx * SR, cy * SR, R * SR); gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(0.55, `rgba(0,0,0,${a * 0.55})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); sg.fillStyle = gr; sg.fillRect((cx - R) * SR, (cy - R) * SR, R * 2 * SR, R * 2 * SR); };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = T_[y * w + x]; if (!t || t === T.LAVA || t === T.WATER || t === T.VOID) continue;
    if (t === T.WALL && m.vis && !m.vis[y * w + x]) continue;
    const [rad, a] = t === T.TREE ? [1.4, 0.28] : t === T.WALL ? [1.0, 0.4] : t === T.RUIN ? [1.1, 0.32] : [0.9, 0.3];
    spot(x + 0.55, y + 0.6, rad, a);
  }
  if (plan) for (const [x, y, r, a] of plan.ao) spot(x, y, r, a);
  // Dungeon: the solid mass between rooms falls off into darkness away from the lit floor
  if (m.d.gen === 'dungeon') {
    const df = new Float32Array(w * h).fill(99), q = [];
    for (let i = 0; i < w * h; i++) if (T_[i] !== T.WALL) { df[i] = 0; q.push(i); }
    for (let qi = 0; qi < q.length; qi++) { const i = q[qi], x = i % w, y = (i / w) | 0; for (let k = 0; k < 8; k++) { const nx = x + DX[k], ny = y + DY[k]; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const j = ny * w + nx; if (df[j] > df[i] + 1) { df[j] = df[i] + 1; q.push(j); } } }
    const dc = mkCanvas(w, h), dg = dc.getContext('2d'), di = dg.createImageData(w, h);
    for (let i = 0; i < w * h; i++) { const a = smoothstep(0.8, 4, df[i]) * 0.95; di.data[i * 4] = 3; di.data[i * 4 + 1] = 3; di.data[i * 4 + 2] = 7; di.data[i * 4 + 3] = a * 255; }
    dg.putImageData(di, 0, 0); sg.imageSmoothingEnabled = true; sg.drawImage(dc, 0, 0, sc.width, sc.height);
  }
  // Baked light pools (soft; real point lights add the rest on medium+)
  sg.globalCompositeOperation = 'lighter';
  const glow = (x, y, R, col) => { const gr = sg.createRadialGradient(x * SR, y * SR, 0, x * SR, y * SR, R * SR); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); sg.fillStyle = gr; sg.fillRect((x - R) * SR, (y - R) * SR, R * 2 * SR, R * 2 * SR); };
  for (const b of m.braziers) glow(b.x, b.y, 3.2, 'rgba(255,140,50,.24)');
  if (m.way) glow(m.way.x, m.way.y, 4, 'rgba(255,150,60,.18)');
  for (const wp of m.warps) glow(wp.x + 0.5, wp.y + 0.5, 2.4, 'rgba(90,150,255,.32)');
  if (plan) for (const l of plan.lights) glow(l.x, l.z, 2.2, 'rgba(255,190,110,.16)');
  if (L.lava) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (T_[y * w + x] === T.LAVA && (tileOpen(x + 1, y) || tileOpen(x - 1, y) || tileOpen(x, y + 1) || tileOpen(x, y - 1))) glow(x + 0.5, y + 0.5, 1.6, 'rgba(255,90,20,.26)');
  sg.globalCompositeOperation = 'source-over';
  return { macro: c, shade: sc, base, BR };
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
function groundH(x, y) { return map ? groundHm(map, x, y) : 0; }
function groundHm(m, x, y) {
  if (!m || !m.hgt) return 0; const W1 = m.w + 1;
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
    uniforms: SKYU, side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w * 0.99999; }',
    fragmentShader: `uniform vec3 uTop, uHor, uHaze; varying vec3 vDir;
      void main(){ float h = normalize(vDir).y; vec3 c = h > 0.0 ? mix(uHor, uTop, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(uHor, uHaze, smoothstep(0.0, 0.18, -h));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 12), mat); m.renderOrder = 1000; m.frustumCulled = false; scene.add(m); return m;
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
// All shafts of a map in one merged, additive mesh (crossed planes along the sun; per-shaft breathing phase).
const SHAFTU = { uT: { value: 0 } };
function buildShafts(m, R, grp) {
  const S = R.shafts, r = mulberry32(m.d.seed * 31 + 3), dir = new THREE.Vector3(R.sunDir[0], R.sunDir[1], R.sunDir[2]).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir), out = [], w = m.w, h = m.h, geos = [], M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  const ok = (x, y) => { if (m.t[y * w + x] !== 0) return false; let trees = 0, open = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const t = m.t[clamp(y + dy, 0, h - 1) * w + clamp(x + dx, 0, w - 1)]; if (t === 0) open++; else if (t === T.TREE) trees++; } return S.clearing ? trees >= 3 && trees <= 12 : open >= 20; };
  for (let tries = 0; out.length < S.n && tries < 800; tries++) {
    const x = 2 + (r() * (w - 4) | 0), y = 2 + (r() * (h - 4) | 0); if (!ok(x, y) || out.some(o => Math.hypot(o.x - x, o.y - y) < S.gap)) continue;
    const len = S.len * (0.8 + r() * 0.4), wd = S.width * (0.7 + r() * 0.6), ph = r() * 6.28, base = new THREE.Vector3(x + 0.5, groundHm(m, x + 0.5, y + 0.5) - 0.1, y + 0.5);
    for (let p = 0; p < 2; p++) {
      const g = new THREE.PlaneGeometry(wd, len).translate(0, len / 2, 0); g.rotateY(p * Math.PI / 2 + r());
      M.compose(base, Q.copy(q), one); g.applyMatrix4(M);
      const n = g.attributes.position.count; g.setAttribute('aPh', new THREE.BufferAttribute(new Float32Array(n).fill(ph), 1)); geos.push(ni(g));
    }
    out.push({ x, y, ph });
  }
  if (!geos.length) return out;
  let n = 0; for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), ph = new Float32Array(n); let o = 0;
  for (const g of geos) { const c = g.attributes.position.count; pos.set(g.attributes.position.array, o * 3); uv.set(g.attributes.uv.array, o * 2); ph.set(g.attributes.aPh.array, o); o += c; g.dispose(); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: Object.assign({ tMap: { value: TEX.shaft }, uCol: { value: linCol(S.color) }, uOp: { value: S.op } }, SHAFTU),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    vertexShader: 'attribute float aPh; uniform float uT, uOp; varying vec2 vUv; varying float vA; void main(){ vUv = uv; vA = uOp * (0.7 + 0.3 * sin(uT * 0.6 + aPh)); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tMap; uniform vec3 uCol; varying vec2 vUv; varying float vA;
      void main(){ vec4 t = texture2D(tMap, vUv); gl_FragColor = vec4(uCol, t.a * vA);
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; grp.add(mesh);
  return out;
}

/* ---------- Batched glows: every flame / halo of a map in one instanced billboard draw per texture ----------
   add() returns a sprite-like proxy (position, scale, material.opacity / .color, visible); update() uploads them. */
function glowBatch(tex, hdrCol) {
  const list = [];
  const B = {
    list, mesh: null,
    add(col, op, sx, sy) { const p = { position: new THREE.Vector3(), scale: new THREE.Vector3(sx, sy, 1), material: { opacity: op, color: col instanceof THREE.Color ? col.clone() : new THREE.Color(col) }, visible: true }; list.push(p); return p; },
    build(grp) {
      if (!list.length) return;
      const n = list.length, geo = new THREE.InstancedBufferGeometry(), quad = new THREE.PlaneGeometry(1, 1);
      geo.setIndex(quad.index); geo.setAttribute('position', quad.attributes.position); geo.setAttribute('uv', quad.attributes.uv); geo.instanceCount = n;
      B.aPos = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3); B.aSize = new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2); B.aCol = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
      for (const a of [B.aPos, B.aSize, B.aCol]) a.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aPos', B.aPos); geo.setAttribute('aSize', B.aSize); geo.setAttribute('aCol', B.aCol);
      const mat = new THREE.ShaderMaterial({
        uniforms: { tMap: { value: tex } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
        vertexShader: 'attribute vec3 aPos; attribute vec2 aSize; attribute vec4 aCol; varying vec2 vUv; varying vec4 vCol; void main(){ vUv = uv; vCol = aCol; vec4 mv = modelViewMatrix * vec4(aPos, 1.0); mv.xy += position.xy * aSize; gl_Position = projectionMatrix * mv; }',
        fragmentShader: `uniform sampler2D tMap; varying vec2 vUv; varying vec4 vCol;
          void main(){ vec4 t = texture2D(tMap, vUv); gl_FragColor = vec4(pow(t.rgb, vec3(2.2)) * vCol.rgb, t.a * vCol.a);
            #include <tonemapping_fragment>
            #include <encodings_fragment>
          }`,
      });
      B.mesh = new THREE.Mesh(geo, mat); B.mesh.frustumCulled = false; grp.add(B.mesh); B.update();
    },
    update() {
      if (!B.mesh) return;
      const P_ = B.aPos.array, S_ = B.aSize.array, C_ = B.aCol.array;
      for (let i = 0; i < list.length; i++) {
        const p = list[i], c = p.material.color, on = p.visible && p.material.opacity > 0.001;
        P_[i * 3] = p.position.x; P_[i * 3 + 1] = p.position.y; P_[i * 3 + 2] = p.position.z;
        S_[i * 2] = on ? p.scale.x : 0; S_[i * 2 + 1] = on ? p.scale.y : 0;
        C_[i * 4] = c.r; C_[i * 4 + 1] = c.g; C_[i * 4 + 2] = c.b; C_[i * 4 + 3] = p.material.opacity;
      }
      B.aPos.needsUpdate = B.aSize.needsUpdate = B.aCol.needsUpdate = true;
    },
  };
  return B;
}

/* ---------- 3D props (glTF: assets/models/*.glb, manifest assets/models/index.json) ----------
   Loaded lazily per map with THREE.GLTFLoader and cached as templates, one part per material
   (model space: 1 unit = 1 tile, +Y up, origin at base centre, front +Z). Materials become
   Phong (lit like the ground; baked COLOR_0 AO multiplied in), `leaves*` / `cloth_*` sway in the
   wind from the per-vertex _sway weight, `emissive_*` are boosted into the bloom range.
   planProps() places everything deterministically from the map; buildProps() instances each
   (model part, tint, near/far) once per map (one InstancedMesh each).
   If the models cannot load (no loader, file:// without access, 404) legacyProps() builds the
   old primitive placeholders instead. Collision is unchanged: blocked tiles get blocking
   props, walkable tiles only get low scatter or props off the walking lines. */
const PROP_LIGHT = { dng_brazier: [0, 1.05, 0], town_lamp_post: [0.46, 1.9, 0], waystone: [0, 3.2, 0] };   // index.json `light`
const PROP_EMIT = { emissive_coals: 2.6, emissive_rune: 2.8, emissive_lamp: 3.4, emissive_obsidian: 2.4, emissive_basalt: 2.2, emissive_ember: 2.8,
  emissive_bifrost: 1.4, emissive_crystal_ice: 2.0, emissive_bog: 1.8, emissive_shroom: 2.0, emissive_amethyst: 2.2, emissive_lava: 2.6, emissive_rune_gold: 2.6 };
const PROP_SWAY = { leaves: 1, cloth_banner: 1.8, cloth_awning: 0.5 };
const PROP_TINT = { town: new THREE.Color(1.6, 1.36, 1.05), keep: new THREE.Color(0.58, 0.58, 0.64) };
const PROP_ALL = ['dng_banner', 'dng_bones', 'dng_brazier', 'dng_chain', 'dng_grave_a', 'dng_grave_b', 'dng_pillar', 'dng_rubble_a', 'dng_rubble_b', 'dng_wall', 'rock_field_a', 'rock_field_b', 'rock_field_c', 'rock_field_d', 'ruin_column_fallen', 'ruin_wall_a', 'ruin_wall_b', 'ruin_wall_c', 'throne_basalt_rock', 'throne_obsidian_pillar', 'town_barrel', 'town_crates', 'town_fence', 'town_house_big', 'town_house_small', 'town_lamp_post', 'town_market_stall', 'town_well', 'tree_autumn_a', 'tree_autumn_b', 'tree_dead_a', 'tree_dead_b', 'tree_green_a', 'tree_green_b', 'tree_green_c', 'tree_oak_dark', 'tree_pine_a', 'tree_pine_b', 'waystone'];
const WIND = { t: { value: 0 } };
const PROPS = { url: 'assets/models/', tpl: {}, pend: {}, tex: {}, loader: null, prefetched: false };
// Wind sway (vertex): whole-card bend along the wind + small flutter, per-instance phase from the
// instance position, travelling gusts. Direction is taken into instance space (R^T * wind).
const WIND_VS = `
#ifdef USE_INSTANCING
vec3 wIP = instanceMatrix[3].xyz;
vec3 wDir = vec3(dot(instanceMatrix[0].xyz, vec3(0.94, 0.0, 0.34)), dot(instanceMatrix[1].xyz, vec3(0.94, 0.0, 0.34)), dot(instanceMatrix[2].xyz, vec3(0.94, 0.0, 0.34)));
#else
vec3 wIP = vec3(modelMatrix[3].x, 0.0, modelMatrix[3].z);
vec3 wDir = vec3(0.94, 0.0, 0.34);
#endif
{
  float ph = uWT * 1.25 + wIP.x * 0.37 + wIP.z * 0.23;
  float gust = 0.6 + 0.4 * sin(uWT * 0.63 - wIP.x * 0.11 - wIP.z * 0.05);
  float sw = _sway * uWA;
  transformed += wDir * (sin(ph) * 0.6 + sin(ph * 2.31 + position.y * 1.7) * 0.28) * sw * gust * 0.075;
  transformed += vec3(sin(uWT * 3.7 + position.y * 5.3 + position.x * 7.1), 0.5 * sin(uWT * 4.3 + position.x * 6.1), cos(uWT * 3.1 + position.z * 6.7)) * sw * 0.012;
}`;
function windify(mat, amp, occ) {
  const U = Object.assign({ uWT: WIND.t, uWA: { value: amp } }, occ ? OCC : {});
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float _sway;\nuniform float uWT, uWA;').replace('#include <begin_vertex>', '#include <begin_vertex>\n' + WIND_VS);
    foliageLight(sh);
    if (occ) occluder(sh);
  };
  mat.customProgramCacheKey = () => occ ? 'windocc' : 'wind';
  return mat;
}
// Canopies between the camera and the player dissolve (screen-door dither) inside a soft circle
// around the player, HD-2D style, so the hero never disappears under a tree.
const OCC = { uOccP: { value: new THREE.Vector2(9, 9) }, uOccZ: { value: 0 }, uOccR: { value: 0.16 }, uOccA: { value: 1.78 } };
function occluder(sh) {
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec4 vOccC; varying float vOccZ;').replace('#include <project_vertex>', '#include <project_vertex>\nvOccC = gl_Position; vOccZ = -mvPosition.z;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vOccC; varying float vOccZ; uniform vec2 uOccP; uniform float uOccZ, uOccR, uOccA;')
    .replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
    { vec2 od = (vOccC.xy / vOccC.w - uOccP) * vec2(uOccA, 1.0); float ok = (1.0 - smoothstep(uOccR * 0.55, uOccR, length(od))) * step(vOccZ, uOccZ - 0.9);
      if (ok > 0.0) { vec2 f = mod(floor(gl_FragCoord.xy), 4.0); float b = mod(f.x * 2.0 + f.y * 3.0 + floor(f.y * 0.5) * 1.0, 4.0) * 0.25 + mod(f.x + f.y * 2.0, 2.0) * 0.125; if (b < ok * 1.15 - 0.1) discard; } }`);
}
function updateOccluder() {
  if (!P) return;
  camera.updateMatrixWorld();
  _v3.set(P.x, groundH(P.x, P.y) + 0.7, P.y); const z = -_v3.clone().applyMatrix4(camera.matrixWorldInverse).z; _v3.project(camera);
  OCC.uOccP.value.set(_v3.x, _v3.y); OCC.uOccZ.value = z; OCC.uOccA.value = camera.aspect; OCC.uOccR.value = 0.16 * 40 / Math.max(15, cam.dist);
}
// Double-sided foliage/cloth: light both faces with the authored (outward) normals, so back-facing
// leaf cards don't go dark (three flips the normal on back faces).
function foliageLight(sh) {
  sh.fragmentShader = sh.fragmentShader.replace('( gl_FrontFacing ) ? vIndirectFront : vIndirectBack', 'vIndirectFront').replace('( gl_FrontFacing ) ? vLightFront : vLightBack', 'vLightFront');
}
// Share textures between models by glTF image name (every .glb embeds its own copies).
function propTexture(t, parser) {
  if (!t) return null;
  const as = parser.associations && parser.associations.get(t), json = parser.json; let key = null;
  if (as && as.index !== undefined && json.textures && json.textures[as.index]) { const im = json.images && json.images[json.textures[as.index].source]; key = im && im.name ? im.name + (t.format === THREE.RGBFormat ? '' : 'a') : null; }
  if (key && PROPS.tex[key]) { if (PROPS.tex[key] !== t) t.dispose(); return PROPS.tex[key]; }
  t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  if (key) PROPS.tex[key] = t;
  return t;
}
// Trees and rocks use Lambert (per-vertex lighting: cheap for the many alpha-tested leaf cards,
// and the painted spherical foliage normals read well); everything else is per-pixel Phong.
function propMaterial(src, parser, cheap) {
  const name = src.name || '', rough = src.roughness !== undefined ? src.roughness : 1, metal = src.metalness || 0;
  const col = src.color ? src.color.clone() : new THREE.Color(1, 1, 1); if (metal) col.multiplyScalar(1 - metal * 0.35);
  let sp = Math.pow(1 - rough, 2) * 0.5 + 0.015; if (name === 'water' || name === 'glass') sp = 0.45;
  const spec = new THREE.Color(sp, sp, sp); if (metal) spec.lerp(col, metal * 0.5);
  if (cheap) {
    const m = new THREE.MeshLambertMaterial({ name, color: col, map: propTexture(src.map, parser), vertexColors: !!src.vertexColors, side: src.side, alphaTest: src.alphaTest || 0,
      emissive: src.emissive ? src.emissive.clone() : new THREE.Color(0), emissiveMap: propTexture(src.emissiveMap, parser) });
    if (/^emissive_/.test(name)) m.emissiveIntensity = PROP_EMIT[name] || 2.4;
    return m;
  }
  const m = new THREE.MeshPhongMaterial({
    name, color: col, map: propTexture(src.map, parser), vertexColors: !!src.vertexColors, specular: spec,
    shininess: clamp(2 / Math.max(1e-3, rough ** 4) - 2, 2, 80), side: src.side, alphaTest: src.alphaTest || 0,
    emissive: src.emissive ? src.emissive.clone() : new THREE.Color(0), emissiveMap: propTexture(src.emissiveMap, parser),
  });
  if (/^emissive_/.test(name)) m.emissiveIntensity = PROP_EMIT[name] || 2.4;
  return m;
}
function makeTemplate(id, gltf) {
  const parts = [], parser = gltf.parser; let rad = 0.5, top = 0.2;
  gltf.scene.updateMatrixWorld(true);
  const meshes = []; gltf.scene.traverse(o => { if (o.isMesh) meshes.push(o); });
  for (const o of meshes) {
    const geo = o.geometry; if (!o.matrixWorld.equals(new THREE.Matrix4())) geo.applyMatrix4(o.matrixWorld);
    geo.computeBoundingBox(); const bb = geo.boundingBox;
    rad = Math.max(rad, Math.hypot(Math.max(-bb.min.x, bb.max.x), Math.max(-bb.min.z, bb.max.z))); top = Math.max(top, bb.max.y);
    const kind = PROPS.kind(id), mat = propMaterial(o.material, parser, kind === 'tree' || kind === 'rock'), nm = mat.name;
    let amp = nm.startsWith('leaves') ? PROP_SWAY.leaves : PROP_SWAY[nm] || (nm.startsWith('cloth_') ? 1 : 0);
    if (id === 'dng_chain') amp = 0.45;
    const sway = amp > 0 && !!geo.attributes._sway;
    if (sway) windify(mat, amp, kind === 'tree');
    if (id === 'dng_wall') capify(mat);
    let depth = null;
    if (mat.alphaTest > 0 || sway) { depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: mat.alphaTest > 0 ? mat.map : null, alphaTest: mat.alphaTest || 0 }); if (sway) windify(depth, amp); }
    parts.push({ geo, mat, depth, name: nm });
  }
  return { id, parts, rad, top, small: top < 1.2 };
}
// Manifest (assets/models/index.json): kind, LODs (lod1), texture-sharing kits (kit_<family>.glb holding
// several models as named root nodes at the origin). Everything degrades to per-file loading without it.
PROPS.man = null; PROPS.kits = {};
const KIT_FIRST = new Set(['town', 'rimeshore', 'mirewell', 'nidavellir', 'bifrost']);
PROPS.manifest = () => PROPS.manP || (PROPS.manP = new Promise(res => {
  const done = j => { try { const by = {}; for (const e of (j && j.models) || []) by[e.id] = e; PROPS.man = { by, kits: (j && j.kits) || {} }; } catch (e) { PROPS.man = null; } res(PROPS.man); };
  try { const l = new THREE.FileLoader(); l.setResponseType('json'); l.load(PROPS.url + 'index.json', done, undefined, () => res(null)); } catch (e) { res(null); }
}));
PROPS.info = id => (PROPS.man && PROPS.man.by[id]) || null;
PROPS.kind = id => { const e = PROPS.info(id); return (e && e.kind) || (/^tree_/.test(id) ? 'tree' : /^rock_/.test(id) ? 'rock' : ''); };
PROPS.lod = id => { const e = PROPS.info(id); return (e && e.lod1) || null; };
PROPS.gltf = url => new Promise((res, rej) => { if (!PROPS.loader) PROPS.loader = new THREE.GLTFLoader(); PROPS.loader.load(url, res, undefined, rej); });
PROPS.load = function (id) {
  if (PROPS.tpl[id]) return Promise.resolve(PROPS.tpl[id]);
  if (PROPS.pend[id]) return PROPS.pend[id];
  if (!THREE.GLTFLoader) return (PROPS.pend[id] = Promise.reject(new Error('THREE.GLTFLoader missing')));
  const single = () => PROPS.gltf(PROPS.url + id + '.glb').then(gl => (PROPS.tpl[id] = makeTemplate(id, gl)));
  if (!PROPS.man && PROP_ALL.includes(id)) return (PROPS.pend[id] = single());   // base set: no need to wait for the manifest
  return (PROPS.pend[id] = PROPS.manifest().then(() => {
    // a kit is used when a map needs most of it (KIT_FIRST) or it is already loading (prefetch); the shared
    // families (trees with LODs, field, dungeon) load per model on demand so the first map dresses quickly
    const e = PROPS.info(id), k = e && e.kit, K = k && PROPS.man.kits[k];
    if (!K || !K.file || !(PROPS.kits[k] || KIT_FIRST.has(k))) return single();
    if (!PROPS.kits[k]) PROPS.kits[k] = PROPS.gltf(PROPS.url + K.file);
    return PROPS.kits[k].then(gl => { const o = gl.scene.getObjectByName(id); return o ? (PROPS.tpl[id] = makeTemplate(id, { scene: o, parser: gl.parser })) : single(); }, single);
  }));
};
PROPS.ready = ids => ids.every(id => PROPS.tpl[id]);
PROPS.ensure = ids => Promise.all(ids.map(PROPS.load));
// After the first map is dressed, quietly fetch the rest (2.9 MB total) so later maps pop in dressed.
PROPS.prefetch = () => {
  if (PROPS.prefetched) return; PROPS.prefetched = true;
  // whole kits of the base families first (one request each), then anything still missing
  const kits = PROPS.man ? ['trees', 'field', 'dungeon', 'town'].filter(k => PROPS.man.kits[k] && PROPS.man.kits[k].file) : [];
  const all = [...PROP_ALL, 'town_bounty_board', ...PROP_ALL.map(PROPS.lod).filter(Boolean)]; let i = 0, j = 0;
  const next = () => {
    if (j < kits.length) { const k = kits[j++]; if (!PROPS.kits[k]) PROPS.kits[k] = PROPS.gltf(PROPS.url + PROPS.man.kits[k].file); PROPS.kits[k].then(next, next); return; }
    if (i >= all.length) return; PROPS.load(all[i++]).then(next, next);
  };
  setTimeout(next, 1200);
};
PROPS.boot = ['tree_green_a', 'tree_green_b', 'tree_green_c', 'tree_autumn_a', 'tree_autumn_b', 'dng_wall', 'town_house_big', 'town_house_small', 'waystone', 'dng_brazier', 'town_well', 'town_market_stall', 'town_crates', 'town_barrel', 'town_lamp_post', 'town_fence', 'rock_field_a', 'rock_field_b', 'rock_field_c', 'rock_field_d'];
try { PROPS.ensure(PROPS.boot).catch(() => {}); PROPS.manifest(); } catch (e) { /* no loader: placeholders */ }
PROPS.mat = (id, name) => { const t = PROPS.tpl[id]; if (!t) return null; const p = t.parts.find(q => q.name === name); return p ? p.mat : null; };
const TINTED = {};
function tintMat(mat, key) {
  const k = mat.uuid + key;
  if (!TINTED[k]) { const t = mat.clone(); t.color.multiply(PROP_TINT[key]); t.onBeforeCompile = mat.onBeforeCompile; t.customProgramCacheKey = mat.customProgramCacheKey; TINTED[k] = t; }
  return TINTED[k];
}
// Instance every (model, tint, chunk) group; one InstancedMesh per template part.
// Is there a model with this id? (the manifest when loaded, else the content team's MODEL_IDS list, else the base set)
function hasModel(id) { return !!id && (PROPS.man ? !!PROPS.info(id) : typeof MODEL_IDS !== 'undefined' ? MODEL_IDS.has(id) : PROP_ALL.includes(id)); }
// Trees use their LOD1 (fewer tris, half the leaf fill) outside the map and on low / medium.
const lodLow = () => GFX.quality === 'low' || GFX.quality === 'medium';
function propId(it, lq) { if ((it.far || lq) && PROPS.kind(it.id) === 'tree') { const l = PROPS.lod(it.id); if (l && PROPS.tpl[l]) return l; } return it.id; }
function propIds(items, lq) {
  const req = new Set(), opt = new Set();
  for (const it of items) { (it.opt ? opt : req).add(it.id); if ((it.far || lq) && PROPS.kind(it.id) === 'tree') { const l = PROPS.lod(it.id); if (l) opt.add(l); } }
  for (const id of req) opt.delete(id);
  return { req: [...req], opt: [...opt] };
}
// One InstancedMesh per (model part, tint, near/far) for the whole map + skirt: the old 32-tile chunks were
// nearly always all in view at this camera distance, so chunking only multiplied the draw calls.
function buildProps(grp, items, lq) {
  const CH = 128, by = new Map();
  for (const it0 of items) {
    const id = propId(it0, lq), it = it0, tpl = PROPS.tpl[id]; if (!tpl) continue;
    const k = id + '|' + (it.tint || '') + '|' + (it.far ? 'f' : '') + Math.floor((it.x + 32) / CH) + ',' + Math.floor((it.z + 32) / CH);
    let e = by.get(k); if (!e) by.set(k, e = { tpl, tint: it.tint, far: !!it.far, list: [] }); e.list.push(it);
  }
  const q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), M = new THREE.Matrix4(), Y = new THREE.Vector3(0, 1, 0);
  for (const { tpl, tint, far, list } of by.values()) {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9, sm = 0;
    for (const it of list) { x0 = Math.min(x0, it.x); x1 = Math.max(x1, it.x); y0 = Math.min(y0, it.y); y1 = Math.max(y1, it.y); z0 = Math.min(z0, it.z); z1 = Math.max(z1, it.z); sm = Math.max(sm, it.s * Math.max(1, it.sy || 1)); }
    const c = new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2 + tpl.top * sm / 2, (z0 + z1) / 2), rad = Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + Math.hypot(tpl.rad, tpl.top / 2) * sm + 0.2;
    for (const part of tpl.parts) {
      const geo = new THREE.BufferGeometry(); for (const a in part.geo.attributes) geo.setAttribute(a, part.geo.attributes[a]); geo.setIndex(part.geo.index);
      geo.boundingSphere = new THREE.Sphere(c.clone(), rad);
      const im = new THREE.InstancedMesh(geo, tint ? tintMat(part.mat, tint) : part.mat, list.length);
      list.forEach((it, i) => { q.setFromAxisAngle(Y, it.r); p.set(it.x, it.y, it.z); s.set(it.s, it.s * (it.sy || 1), it.s); M.compose(p, q, s); im.setMatrixAt(i, M); });
      im.instanceMatrix.needsUpdate = true;
      if (part.depth) im.customDepthMaterial = part.depth;
      im.castShadow = !far; im.receiveShadow = true; im.userData.small = far ? null : tpl.small; im.userData.far = far;
      im.matrixAutoUpdate = false; im.updateMatrix();
      grp.add(im);
    }
  }
}

/* ---------- Prop placement ---------- */
const PROP_TREES = {
  emberhold: [['tree_green_a', 3], ['tree_green_b', 3], ['tree_green_c', 2], ['tree_autumn_a', 2], ['tree_autumn_b', 1]],
  ashen_fields: [['tree_green_a', 2], ['tree_green_b', 2], ['tree_green_c', 2], ['tree_autumn_a', 3], ['tree_autumn_b', 2], ['tree_dead_a', 1.5], ['tree_dead_b', 1.5]],
  withered_wood: [['tree_pine_a', 4], ['tree_pine_b', 3], ['tree_oak_dark', 3]],
};
const TREE_S = { tree_dead_a: 0.85, tree_dead_b: 1.0, tree_pine_b: 0.8 };
const PROP_ROCKS = [['rock_field_a', 3], ['rock_field_c', 2], ['rock_field_d', 2], ['rock_field_b', 1.5]];
const PROP_RUINS = [['ruin_wall_a', 2], ['ruin_wall_b', 2], ['ruin_wall_c', 1.5], ['ruin_column_fallen', 2]];
// Emberhold dressing: [id, x, z, rotY, scale] (walkable tiles off the roads / NPC spots)
const TOWN_DRESS = {
  emberhold: {
    props: [['town_well', 23.8, 24.4, 0.35, 1], ['town_market_stall', 22.3, 10.8, 0, 1], ['town_crates', 24.4, 10.3, 0.2, 0.85], ['town_barrel', 20.9, 10.1, 0, 0.95],
      ['town_barrel', 4.7, 9.6, 0, 1], ['town_barrel', 5.4, 9.95, 1, 0.9], ['town_crates', 9.2, 9.8, -0.2, 0.85],
      ['town_barrel', 26.7, 9.6, 0.5, 1], ['town_crates', 31.0, 9.8, 0.3, 0.85], ['town_barrel', 31.3, 26.3, 0.7, 1], ['town_barrel', 30.6, 25.95, 0, 0.9], ['town_crates', 26.9, 26.2, 2.9, 0.85],
      ['town_barrel', 4.8, 26.3, 0, 1], ['town_crates', 9.1, 26.2, 3.3, 0.85], ['town_barrel', 10.2, 11.3, 0, 1], ['town_barrel', 9.6, 11.8, 2, 0.9], ['town_crates', 10.2, 14.6, 1.57, 0.8], ['town_barrel', 26.3, 15.2, 0, 0.95]],
    lamps: [[15.6, 9.5, 0], [21.4, 9.5, Math.PI], [15.6, 27.0, 0], [21.4, 27.0, Math.PI], [9.5, 15.6, -Math.PI / 2], [9.5, 21.4, Math.PI / 2], [27.0, 21.4, Math.PI / 2], [24.0, 15.6, -Math.PI / 2]],
    fences: [[3, 10, 2.6, 'x'], [26, 33, 2.6, 'x'], [2, 8, 14.7, 'x'], [2, 8, 21.3, 'x'], [2, 8, 14.4, 'z'], [2, 8, 21.6, 'z'], [29, 34, 14.4, 'z'], [29, 34, 21.6, 'z']],
  },
};
function pickW(list, r) { let t = 0; for (const e of list) t += e[1]; let x = r * t; for (const e of list) { x -= e[1]; if (x <= 0) return e[0]; } return list[list.length - 1][0]; }
function treeSet(m) { if (PROP_TREES[m.id]) return PROP_TREES[m.id]; if (m.d.render && Array.isArray(m.d.render.trees) && m.d.render.trees.length) return m.d.render.trees; const k = (m.d.look.trees || []).join(); return k.includes('forest') ? PROP_TREES.withered_wood : k.includes('dead') ? PROP_TREES.ashen_fields : PROP_TREES.emberhold; }
function planProps(m) {
  const w = m.w, h = m.h, sd = m.d.seed * 17 + 5, gen = m.d.gen, items = [], ao = [], lights = [], avoid = [];
  const H = (x, z) => groundHm(m, x, z);
  const hs = (x, y, k) => hash2(x, y, sd + k);
  const add = (id, x, z, r, s, o) => { const it = { id, x, z, y: (o && o.y !== undefined ? o.y : H(x, z)) + (o && o.dy || 0), r, s, sy: o && o.sy, tint: o && o.tint, far: o && o.far }; items.push(it); return it; };
  const isT = (x, y, t) => x >= 0 && y >= 0 && x < w && y < h && m.t[y * w + x] === t;
  const open = (x, y) => isT(x, y, 0);
  const isW = (x, y) => x < 0 || y < 0 || x >= w || y >= h || m.t[y * w + x] === T.WALL;
  const inHouse = (x, y) => (m.houses || []).some(q => x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1);
  // per-map model lists (MAPDEFS[id].props = { tree, rock, ice, crystal, ruin, pillar, grave, wall }: [[model, weight, kit]]);
  // the kit model is drawn when the manifest has it, else the fallback model. Models outside the base set are optional.
  const PD = (m.d && m.d.props) || {}, pickM = e => (e[2] && e[2] !== e[0] && hasModel(e[2])) ? e[2] : e[0];
  const listFor = k => { const l = PD[k]; if (!Array.isArray(l)) return null; const o = l.filter(e => Array.isArray(e)).map(e => [pickM(e), +e[1] || 1]).filter(e => typeof e[0] === 'string' && e[0]); return o.length ? o : null; };
  const opt = it => { if (!PROP_ALL.includes(it.id)) it.opt = true; return it; };
  const trees = listFor('tree') || treeSet(m), dense = gen === 'field' && (m.d.trees || 0) > 0.1;
  // -- trees on tree tiles: greedy thinning so the big canopies don't stack 9 deep in forests
  const TT = []; for (let i = 0; i < w * h; i++) if (m.t[i] === T.TREE) TT.push(i);
  TT.sort((a, b) => hash2(a, 1, sd) - hash2(b, 1, sd));
  const acc = new Int32Array(w * h).fill(-1), pts = [], minD = dense ? 1.6 : 0.95, tS = dense ? 1.15 : 1;
  for (const i of TT) {
    const x = i % w, y = (i / w) | 0, cx = x + 0.5 + (hs(x, y, 2) - 0.5) * 0.5, cz = y + 0.5 + (hs(x, y, 3) - 0.5) * 0.5;
    let ok = true;
    for (let dy = -2; dy <= 2 && ok; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const j = acc[yy * w + xx]; if (j >= 0 && (pts[j][0] - cx) ** 2 + (pts[j][1] - cz) ** 2 < minD * minD) { ok = false; break; } }
    if (!ok) continue; acc[i] = pts.length; pts.push([cx, cz]);
    const id = pickW(trees, hs(x, y, 4));
    opt(add(id, cx, cz, hs(x, y, 6) * 6.283, (TREE_S[id] || 0.74) * tS * (0.86 + 0.3 * hs(x, y, 5)), { dy: -0.05 }));
  }
  // -- rocks (and the rock-like ice / crystal tiles)
  const rockL = listFor('rock') || PROP_ROCKS, TI = T.ICE, TC = T.CRYSTAL;
  const rockSets = [[T.ROCK, rockL], [TI, listFor('ice') || rockL], [TC, listFor('crystal') || rockL]];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = m.t[y * w + x], set = rockSets.find(e => e[0] !== undefined && e[0] === t); if (!set) continue;
    const id = pickW(set[1], hs(x, y, 7)), big = id === 'rock_field_b' || id === 'rock_field_d';
    opt(add(id, x + 0.5 + (hs(x, y, 8) - 0.5) * 0.2, y + 0.5 + (hs(x, y, 9) - 0.5) * 0.2, hs(x, y, 10) * 6.283, PROP_ALL.includes(id) ? (big ? 0.62 : 0.85) + hs(x, y, 11) * 0.3 : 0.9 + hs(x, y, 11) * 0.2, { dy: -0.04 }));
  }
  // -- field ruins (single blocked tiles): scaled-down ruin pieces
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!isT(x, y, T.RUIN) || inHouse(x, y)) continue; const id = pickW(listFor('ruin') || PROP_RUINS, hs(x, y, 12));
    opt(add(id, x + 0.5, y + 0.5, ((hs(x, y, 13) * 4) | 0) * Math.PI / 2 + (hs(x, y, 14) - 0.5) * 0.3, PROP_ALL.includes(id) ? 0.42 + hs(x, y, 15) * 0.12 : 0.9 + hs(x, y, 15) * 0.1, { dy: -0.05 }));
    ao.push([x + 0.5, y + 0.5, 1.2, 0.3]);
  }
  // -- walls: carved keep blocks (tinted warm and lower in town), random 90 deg turns hide the repeat
  const wallL = listFor('wall'), pillarL = listFor('pillar'), graveL = listFor('grave');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (m.t[i] !== T.WALL || !m.vis[i]) continue;
    const r = ((hs(x, y, 16) * 4) | 0) * Math.PI / 2;
    if (wallL) opt(add(pickW(wallL, hs(x, y, 29)), x + 0.5, y + 0.5, r, 1, { dy: -0.02 }));
    else if (gen === 'town') add('dng_wall', x + 0.5, y + 0.5, r, 1, { sy: 0.8, tint: 'town', dy: -0.12 });
    else add('dng_wall', x + 0.5, y + 0.5, r, 1, { dy: -0.02, tint: gen === 'dungeon' ? 'keep' : null });
  }
  // -- pillars, graves
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (isT(x, y, T.PILLAR)) { if (pillarL) opt(add(pickW(pillarL, hs(x, y, 28)), x + 0.5, y + 0.5, ((hs(x, y, 17) * 4) | 0) * Math.PI / 2, 1)); else if (gen === 'arena') add('throne_obsidian_pillar', x + 0.5, y + 0.5, hs(x, y, 17) * 6.283, 1, { dy: -0.1 }); else add('dng_pillar', x + 0.5, y + 0.5, ((hs(x, y, 17) * 4) | 0) * Math.PI / 2, 1); }
    else if (isT(x, y, T.GRAVE)) opt(add(graveL ? pickW(graveL, hs(x, y, 27)) : m.var[y * w + x] & 1 ? 'dng_grave_b' : 'dng_grave_a', x + 0.5, y + 0.5, (hs(x, y, 18) - 0.5) * 0.5, 0.95 + hs(x, y, 19) * 0.12));
  }
  // -- houses: the 6x5 and 4x3 plots, doors facing the plaza (south plots turn around)
  for (const q of (m.houses || [])) {
    const sx = q.x1 - q.x0 + 1, sz = q.y1 - q.y0 + 1, big = sx >= 5 && sz >= 4, fw = big ? 6 : 4, fd = big ? 5 : 3, cx = q.x0 + sx / 2, cz = q.y0 + sz / 2;
    let y0 = 1e9; for (let yy = q.y0; yy <= q.y1 + 1; yy++) for (let xx = q.x0; xx <= q.x1 + 1; xx++) y0 = Math.min(y0, m.hgt[yy * (w + 1) + xx]);
    add(big ? 'town_house_big' : 'town_house_small', cx, cz, cz > h / 2 ? Math.PI : 0, Math.min(sx / fw, sz / fd), { y: y0 - 0.04 });
  }
  // -- waystone, braziers
  if (m.way) { add('waystone', m.way.x, m.way.y, 0, 0.9); ao.push([m.way.x, m.way.y, 1.4, 0.35]); }
  for (const b of m.braziers) { add('dng_brazier', b.x, b.y, hash2(b.x * 10 | 0, b.y * 10 | 0, sd) * 6.283, 1); ao.push([b.x, b.y, 0.6, 0.3]); }
  const busy = [...m.npcs.map(n => [n.x, n.y]), ...m.objs.map(o => [o.x, o.y]), ...m.braziers.map(b => [b.x, b.y]), ...m.warps.map(wp => [wp.x + 0.5, wp.y + 0.5])];
  const free = (x, z, r) => open(x | 0, z | 0) && !busy.some(b => (b[0] - x) ** 2 + (b[1] - z) ** 2 < r * r);
  // -- town dressing
  const TD = TOWN_DRESS[m.id];
  if (TD) {
    const AO = { town_well: [1.4, 0.35], town_market_stall: [1.3, 0.3], town_barrel: [0.5, 0.35], town_crates: [0.85, 0.35] }, AV = { town_well: 1.2, town_market_stall: 1.1, town_barrel: 0.45, town_crates: 0.7 };
    for (const [id, x, z, r, s] of TD.props) { if (!free(x, z, 0.9)) continue; add(id, x, z, r, s); ao.push([x, z, AO[id][0], AO[id][1]]); avoid.push([x, z, AV[id]]); }
    for (const [x, z, r] of TD.lamps) {
      if (!free(x, z, 0.7)) continue; const it = add('town_lamp_post', x, z, r, 1), a = PROP_LIGHT.town_lamp_post;
      lights.push({ x: x + Math.cos(r) * a[0] + Math.sin(r) * a[2], z: z - Math.sin(r) * a[0] + Math.cos(r) * a[2], h: it.y + a[1], kind: 'lamp' });
      ao.push([x, z, 0.4, 0.3]); avoid.push([x, z, 0.3]);
    }
    for (const [a, b, c, ax] of TD.fences) for (let k = a; k < b; k++) {
      const x = ax === 'x' ? k + 0.5 : c, z = ax === 'x' ? c : k + 0.5; if (!free(x, z, 0.6)) continue;
      add('town_fence', x, z, (ax === 'x' ? 0 : Math.PI / 2) + (hs(k, c * 10 | 0, 20) - 0.5) * 0.08, 1, { dy: -0.02 }); ao.push([x, z, 0.55, 0.14]);
    }
  }
  // -- keep dressing: banners and chains on the camera-facing wall faces, fallen blocks, bone piles
  if (gen === 'dungeon') {
    const banners = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (m.t[i] !== T.WALL || !m.vis[i]) continue; const r = hs(x, y, 30);
      if (open(x, y + 1)) {
        if (r < 0.14 && isW(x - 1, y) && isW(x + 1, y) && open(x - 1, y + 1) && open(x + 1, y + 1) && !banners.some(b => Math.hypot(b[0] - x, b[1] - y) < 5)) { banners.push([x, y]); add('dng_banner', x + 0.5, y + 1.08, 0, 1); }
        else if (r > 0.8 && r < 0.9) add('dng_chain', x + 0.5, y + 1.5, 0, 0.95 + hs(x, y, 31) * 0.1);
        else if (r > 0.94) { add('dng_rubble_b', x + 0.5 + (hs(x, y, 32) - 0.5) * 0.3, y + 1.22, hs(x, y, 33) < 0.5 ? 0 : Math.PI, 0.75); ao.push([x + 0.5, y + 1.2, 0.8, 0.3]); }
      } else if (open(x + 1, y) && r > 0.9) add('dng_chain', x + 1.5, y + 0.5, Math.PI / 2, 0.95);
      else if (open(x - 1, y) && r > 0.9) add('dng_chain', x - 0.5, y + 0.5, -Math.PI / 2, 0.95);
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!open(x, y)) continue; const i = y * w + x;
      if (m.deco[i] === 2) { add('dng_bones', x + 0.3 + hs(x, y, 34) * 0.4, y + 0.3 + hs(x, y, 35) * 0.4, hs(x, y, 36) * 6.283, 0.8 + hs(x, y, 37) * 0.25); ao.push([x + 0.5, y + 0.5, 0.5, 0.2]); }
      else if ((isW(x, y - 1) || isW(x - 1, y)) && hs(x, y, 38) < 0.05 && free(x + 0.5, y + 0.5, 1)) { const px = x + 0.5 - (isW(x - 1, y) ? 0.22 : 0), pz = y + 0.5 - (isW(x, y - 1) ? 0.22 : 0); add('dng_rubble_a', px, pz, hs(x, y, 39) * 6.283, 0.55 + hs(x, y, 40) * 0.15); ao.push([px, pz, 0.7, 0.3]); }
    }
  }
  // -- throne: basalt outcrops rising from the lava around the platform (and far out in it)
  if (gen === 'arena') {
    const placed = [], dOpen = (x, y) => { let d = 9; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (open(x + dx, y + dy)) d = Math.min(d, Math.hypot(dx, dy)); return d; };
    const rock = (x, z, s) => { if (placed.some(p => Math.hypot(p[0] - x, p[1] - z) < 2.6 * s + 0.4)) return; placed.push([x, z]); add('throne_basalt_rock', x, z, hash2(x * 7 | 0, z * 7 | 0, sd) * 6.283, s, { y: -0.62 }); };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (!isT(x, y, T.LAVA)) continue; const d = dOpen(x, y); if (d >= 1.2 && d <= 3.2 && hs(x, y, 41) < 0.16) rock(x + 0.5, y + 0.5, 0.65 + hs(x, y, 42) * 0.55); }
    const r = mulberry32(sd); for (let k = 0; k < 40; k++) { const a = r() * 6.283, d = 17 + r() * 16, x = w / 2 + Math.cos(a) * d, z = h / 2 + Math.sin(a) * d; rock(x, z, 0.8 + r() * 0.9); }
  }
  // -- bounty boards (the mesh is built in buildWorld): contact AO, no grass tufts through it
  // (the art team's town_bounty_board model, scaled so the quest '!' drawn at 1.95 sits on its roof; primitive fallback)
  for (const o of m.objs) if (o.kind === 'board') {
    const it = add('town_bounty_board', o.x, o.y, (hash2(o.x * 10 | 0, o.y * 10 | 0, 3) - 0.5) * 0.3, BOARD_S); it.opt = true; it.board = o;
    ao.push([o.x, o.y + 0.05, 1.1, 0.36]); avoid.push([o.x, o.y, 0.9]);
  }
  // -- data decor on generated maps: m.decor = [{ model, x, y, rot, scale }] (glTF ids; a missing model is skipped)
  const dlights = [];
  if (Array.isArray(m.decor)) for (const d of m.decor) {
    if (!d || !isFinite(d.x) || !isFinite(d.y)) continue;
    const id = typeof d.kit === 'string' && hasModel(d.kit) ? d.kit : d.model;
    if (typeof id !== 'string' || !/^[\w-]+$/.test(id)) continue;
    const sc = +d.scale || 1, it = add(id, +d.x, +d.y, +d.rot || 0, sc, { dy: +d.dy || 0 }); it.opt = true;
    if (Array.isArray(d.light) && d.light.length >= 2) { const inf = PROPS.info(id), la = inf && inf.light; dlights.push({ x: +d.x, z: +d.y, h: it.y + (la ? la[1] * sc : 1.2), col: d.light[0], i: +d.light[1] || 1, d: +d.light[2] || 5 }); }
  }
  // -- wilderness outside the map: trees (and rocks / ruins) continue into the haze
  if (gen === 'field' || gen === 'town') {
    const r = mulberry32(m.d.seed * 13 + 7), E = 14, dens = gen === 'town' ? 0.13 : dense ? 0.17 : 0.13;
    for (let z = -E; z < h + E; z++) for (let x = -E; x < w + E; x++) {
      if (x >= -1 && x < w + 1 && z >= -1 && z < h + 1) continue;
      const d = Math.hypot(x + 0.5 - clamp(x + 0.5, 0, w), z + 0.5 - clamp(z + 0.5, 0, h));
      if (r() > dens * (0.6 + 0.4 * vnoise(x / 5, z / 5, m.d.seed + 17)) * (1 - d / (E + 4))) continue;
      const cx = x + 0.5 + (r() - 0.5) * 0.6, cz = z + 0.5 + (r() - 0.5) * 0.6, k = r(), gy = skirtH(m, cx, cz);
      const near = d < 2.5;   // the first rows still cast shadows onto the map edge
      if (k < 0.1) add(pickW(PROP_ROCKS, r()), cx, cz, r() * 6.283, 0.8 + r() * 0.6, { y: gy - 0.05, far: !near });
      else if (k < 0.13 && gen === 'field' && !dense) add(pickW(PROP_RUINS, r()), cx, cz, r() * 6.283, 0.6 + r() * 0.3, { y: gy - 0.08, far: !near });
      else { const id = pickW(trees, r()), it = add(id, cx, cz, r() * 6.283, (TREE_S[id] || 0.74) * (0.95 + r() * 0.35), { y: gy - 0.05, far: !near }); if (!PROP_ALL.includes(id)) it.opt = true; }
    }
  }
  return { items, ao, lights, dlights, avoid, ok: true };
}

/* ---------- Grass tufts (instanced camera-facing cards, wind-animated) ---------- */
TEX.tuft = (() => {
  const c = mkCanvas(512, 128), g = c.getContext('2d'), r = mulberry32(99);
  const blades = (ox, n, hmin, hmax, spread) => {
    for (let i = 0; i < n; i++) {
      const bx = ox + 64 + (r() - 0.5) * spread, lean = (r() - 0.5) * 50, ht = hmin + r() * (hmax - hmin), wd = 6 + r() * 5, v0 = 140 + r() * 40 | 0, v1 = 220 + r() * 35 | 0;
      const gr = g.createLinearGradient(0, 128, 0, 128 - ht); gr.addColorStop(0, `rgb(${v0},${v0},${v0})`); gr.addColorStop(1, `rgb(${v1},${v1},${v1})`);
      g.fillStyle = gr; g.beginPath(); g.moveTo(bx - wd, 128); g.quadraticCurveTo(bx - wd * 0.2 + lean * 0.35, 128 - ht * 0.6, bx + lean, 128 - ht); g.quadraticCurveTo(bx + wd * 0.2 + lean * 0.35, 128 - ht * 0.6, bx + wd, 128); g.closePath(); g.fill();
    }
  };
  const flowers = (ox, cols, n) => { for (let i = 0; i < n; i++) { const x = ox + 64 + (r() - 0.5) * 56, y = 128 - 60 - r() * 50, rr = 6 + r() * 4, col = cols[(r() * cols.length) | 0]; g.fillStyle = 'rgb(120,120,120)'; g.fillRect(x - 1, y, 2, 128 - y); g.fillStyle = col; for (let k = 0; k < 5; k++) { const a = k * 1.2566 + r() * 0.3; g.beginPath(); g.arc(x + Math.cos(a) * rr * 0.75, y + Math.sin(a) * rr * 0.75, rr * 0.62, 0, 7); g.fill(); } g.fillStyle = '#ffd23a'; g.beginPath(); g.arc(x, y, rr * 0.38, 0, 7); g.fill(); } };
  blades(0, 14, 62, 118, 54);
  blades(128, 11, 80, 124, 44); g.fillStyle = 'rgb(230,228,215)'; for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(128 + 64 + (r() - 0.5) * 50, 128 - 100 - r() * 18, 5, 9, (r() - 0.5) * 0.6, 0, 7); g.fill(); }
  blades(256, 10, 44, 90, 56); flowers(256, ['#fffaf0', '#fff2a0', '#ffe46a'], 4);
  blades(384, 10, 44, 90, 56); flowers(384, ['#ff9ac8', '#c8a0ff', '#ff7a6a', '#9ab8ff'], 4);
  // downsample once (the browser filters alpha properly) and skip mipmaps: mip-averaged thin blades
  // would fall under the alpha test and leave only a dark dash at the base
  const d = mkCanvas(256, 64), dg = d.getContext('2d'); dg.imageSmoothingEnabled = true; dg.imageSmoothingQuality = 'high'; dg.drawImage(c, 0, 0, 256, 64);
  const t = canvasTex(d); t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; return t;
})();
const GRASS_VS = `vec3 gIP = instanceMatrix[3].xyz;
vec3 gR = normalize(vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]));
vec3 gB = normalize(vec3(viewMatrix[0][2], 0.0, viewMatrix[2][2]));
float gh2 = uv.y * uv.y;
float gph = uWT * 1.8 + gIP.x * 0.61 + gIP.z * 0.43;
float gGust = 0.55 + 0.45 * sin(uWT * 0.9 - gIP.x * 0.21 - gIP.z * 0.09);
vec3 transformed = gR * position.x + vec3(0.0, position.y, 0.0) - gB * position.y * 0.6;
transformed.x += (sin(gph) * 0.07 + 0.05) * gGust * gh2;
transformed.z += cos(gph * 0.83) * 0.035 * gGust * gh2;`;
const GRASS = { mat: null, geo: null };
function grassMat() {
  if (GRASS.mat) return GRASS.mat;
  const mat = new THREE.MeshLambertMaterial({ map: TEX.tuft, alphaTest: 0.36 });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uWT = WIND.t;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aVar; attribute vec3 aTint; uniform float uWT; varying vec3 vTint; varying float vGh;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvUv.x = (vUv.x + aVar) * 0.25; vTint = aTint; vGh = uv.y;')
      .replace('#include <begin_vertex>', GRASS_VS);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vTint; varying float vGh;')
      .replace('#include <map_fragment>', '#include <map_fragment>\n{ float mx = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)), mn = min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b)); float bl = 1.0 - smoothstep(0.06, 0.2, mx - mn); diffuseColor.rgb *= mix(vec3(1.0), vTint, bl) * mix(0.7, 1.1, smoothstep(0.0, 0.8, vGh)); }');
  };
  mat.customProgramCacheKey = () => 'grass';
  const geo = new THREE.PlaneGeometry(0.5, 0.5); geo.translate(0, 0.25, 0);
  const nr = geo.attributes.normal; for (let i = 0; i < nr.count; i++) nr.setXYZ(i, 0, 1, 0);
  GRASS.geo = geo;
  return (GRASS.mat = mat);
}
function buildGrass(m, dens) {
  const L = m.d.look, w = m.w, h = m.h, mk = m.gmask, gb = m.gbase, r = mulberry32(m.d.seed * 7 + 3), CH = 32, chunks = new Map(), mat = grassMat();
  const avoid = [...m.warps.map(wp => [wp.x + 0.5, wp.y + 0.5, 1.4]), ...(m.way ? [[m.way.x, m.way.y, 1.25]] : []), ...m.braziers.map(b => [b.x, b.y, 0.45]), ...(m.propAvoid || [])];
  const fc = Math.min(0.3, (L.flowers || 0) * 0.8), BR = gb.BR, BW = w * BR;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = m.t[y * w + x]; if (t !== 0 && t !== T.TREE) continue;
    const n = dens * (0.3 + 1.4 * vnoise(x / 4.5, y / 4.5, m.d.seed + 71)) * (t === T.TREE ? 0.5 : 1);
    for (let k = Math.floor(n + r()); k > 0; k--) {
      const px = x + r(), pz = y + r(), q = mk.at(px, pz);
      if (q[0] > 0.3 || q[1] > 0.22 || q[2] > 0.35 + r() * 0.3 || avoid.some(a => (a[0] - px) ** 2 + (a[1] - pz) ** 2 < a[2] * a[2])) continue;
      const ck = Math.floor(px / CH) + ',' + Math.floor(pz / CH); let L_ = chunks.get(ck); if (!L_) chunks.set(ck, L_ = []);
      const dry = smoothstep(0.02, 0.3, q[2]), v = dry > 0.3 ? (r() < 0.5 ? 1 : 0) : r() < fc ? 2 + (r() < 0.5 ? 1 : 0) : (r() < 0.3 ? 1 : 0), bi = (clamp(pz * BR | 0, 0, h * BR - 1) * BW + clamp(px * BR | 0, 0, BW - 1)) * 3, tk = 1.3 + r() * 0.3;
      const tr = gb.base[bi] * tk, tg = gb.base[bi + 1] * tk, tb = gb.base[bi + 2] * tk, lum = tr * 0.3 + tg * 0.6 + tb * 0.1;   // singed straw near the burns
      L_.push([px, groundHm(m, px, pz) - 0.02, pz, v, (0.6 + r() * 0.45) * (v === 1 ? 1.12 : 1) * (1 - dry * 0.3), tr + (lum * 1.25 - tr) * dry, tg + (lum * 0.95 - tg) * dry, tb + (lum * 0.45 - tb) * dry]);
    }
  }
  const grp = new THREE.Group(), M = new THREE.Matrix4();
  for (const list of chunks.values()) {
    const n = list.length, geo = new THREE.BufferGeometry(), av = new Float32Array(n), at = new Float32Array(n * 3);
    for (const a in GRASS.geo.attributes) geo.setAttribute(a, GRASS.geo.attributes[a]); geo.setIndex(GRASS.geo.index);
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
    const im = new THREE.InstancedMesh(geo, mat, n);
    list.forEach((e, i) => { M.makeScale(e[4], e[4], e[4]).setPosition(e[0], e[1], e[2]); im.setMatrixAt(i, M); av[i] = e[3]; at[i * 3] = e[5]; at[i * 3 + 1] = e[6]; at[i * 3 + 2] = e[7]; x0 = Math.min(x0, e[0]); x1 = Math.max(x1, e[0]); y0 = Math.min(y0, e[1]); y1 = Math.max(y1, e[1]); z0 = Math.min(z0, e[2]); z1 = Math.max(z1, e[2]); });
    geo.setAttribute('aVar', new THREE.InstancedBufferAttribute(av, 1)); geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(at, 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2 + 0.3, (z0 + z1) / 2), Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + 1);
    im.instanceMatrix.needsUpdate = true; im.receiveShadow = true; im.matrixAutoUpdate = false; im.updateMatrix();
    grp.add(im);
  }
  return grp;
}
function disposeGrass(grp) { for (const o of grp.children) { o.geometry.deleteAttribute('aVar'); o.geometry.deleteAttribute('aTint'); o.geometry.dispose(); o.dispose && o.dispose(); } }
// Apply the quality preset to a world: grass density, small-prop shadow casting.
function worldQuality(grp) {
  const Q = GFX.preset, m = grp.userData.map; if (!m) return;
  const A = m.anim || {}, R = rlookFor(m); SHADOW.need = true;
  if (A.pools) A.pools.visible = !!Q.pools;
  if (A.motes) A.motes.visible = !!Q.post;
  if (A.shaftGrp) A.shaftGrp.visible = !(Q.vol && Q.post && R.vol && POST_VOL());
  if (grp.userData.propLod !== undefined && grp.userData.propLod !== lodLow() && grp.userData.rebuildProps) grp.userData.rebuildProps(lodLow());
  const pr = grp.userData.props; if (pr) for (const o of pr.children) { if (o.userData.small === true || o.userData.small === false) o.castShadow = !o.userData.small || Q.smallShadow; if (o.userData.far) o.visible = Q.farProps; }
  const n = (m.d.look.floor || 'grass') === 'grass' ? Q.grass : 0;
  if (grp.userData.grassN !== n) {
    if (grp.userData.grass) { grp.remove(grp.userData.grass); disposeGrass(grp.userData.grass); grp.userData.grass = null; }
    if (n > 0) { grp.userData.grass = buildGrass(m, n); grp.add(grp.userData.grass); }
    grp.userData.grassN = n;
  }
}

/* ---------- Legacy primitive props (fallback when the glTF models can't load) ---------- */
function legacyProps(m, grp, lam, A) {
  const L = Object.assign({ trees: ['green', 'green', 'autumn'], tint: [1, 1, 1], rock: 0x9a958a }, m.d.look), w = m.w, h = m.h;
  const solid = (geo, mat) => { const me = new THREE.Mesh(geo, mat); me.castShadow = true; me.receiveShadow = true; grp.add(me); return me; };
  const tint = new THREE.Color(L.tint[0], L.tint[1], L.tint[2]);
  const walls = [], ruins = [], rocks = [], pillars = [], graves = [], trees = new Map();
  const inHouse = (x, y) => (m.houses || []).some(q => x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1);
  const addTree = (cx, cz, gh, v) => {
    const k = v % 3, s = (L.trees[k].startsWith('forest') ? 3.2 : 2.7) + ((v >> 2) & 7) * 0.12, ht = s * 1.25, ang = (v >> 5) * 0.4;
    for (let p = 0; p < 6; p++) { const g = ni(new THREE.PlaneGeometry(s, ht)); if (p >= 3) g.scale(-1, 1, 1); g.translate(0, ht / 2, 0); g.rotateY(ang + (p % 3) * Math.PI / 3); g.translate(cx + ((v & 3) - 1.5) * 0.08, gh - 0.15, cz); const key = k + '|' + Math.floor(cx / 16) + '|' + Math.floor(cz / 16); if (!trees.has(key)) trees.set(key, []); trees.get(key).push(g); }
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, t = m.t[i], v = m.var[i], cx = x + 0.5, cz = y + 0.5, gh = groundHm(m, cx, cz);
    if (t === T.WALL) { if (!m.vis[i]) continue; const wh = m.d.gen === 'town' ? 1.9 : 2.5; walls.push(boxAt(cx, gh - 0.3, cz, 1, wh + 0.3, 1)); if (m.d.gen === 'town' && (x + y) % 2 === 0) walls.push(boxAt(cx, gh + wh, cz, 0.5, 0.35, 0.5)); }
    else if (t === T.RUIN && !inHouse(x, y)) ruins.push(boxAt(cx, gh - 0.1, cz, 0.9, 0.35 + (v & 7) * 0.09, 0.9));
    else if (t === T.ROCK) { const g = ni(new THREE.DodecahedronGeometry(0.5, 0)); g.scale(0.85 + (v & 3) * 0.12, 0.55 + ((v >> 2) & 3) * 0.12, 0.85 + ((v >> 4) & 3) * 0.1); g.rotateY(v * 0.1); g.translate(cx, gh + 0.12, cz); rocks.push(g); }
    else if (t === T.PILLAR) { const g = ni(new THREE.CylinderGeometry(0.4, 0.48, 3.2, 10)); g.translate(cx, gh + 1.6, cz); pillars.push(g, boxAt(cx, gh, cz, 1, 0.35, 1), boxAt(cx, gh + 3.1, cz, 1.05, 0.3, 1.05)); }
    else if (t === T.GRAVE) { const g = boxAt(0, 0, 0, 0.55, 0.8, 0.16); g.rotateY((v & 15) * 0.05 - 0.4); g.translate(cx, gh, cz); graves.push(g); if (v & 1) { const c2 = boxAt(0, 0.45, 0, 0.5, 0.12, 0.17); c2.rotateY((v & 15) * 0.05 - 0.4); c2.translate(cx, gh, cz); graves.push(c2); } }
    else if (t === T.TREE) addTree(cx, cz, gh, v);
  }
  if (m.d.gen === 'field' || m.d.gen === 'town') {
    const r = mulberry32(m.d.seed * 13 + 7), E = 16, dens = m.d.gen === 'town' ? 0.16 : m.d.trees > 0.1 ? 0.4 : 0.2;
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
  const treeMats = !trees.size ? [] : [0, 1, 2].map(k => { const tx = treeTex(L.trees[k], m.d.seed * 7 + k); return [new THREE.MeshLambertMaterial({ map: tx, alphaTest: 0.5, color: tint, vertexColors: true }), new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tx, alphaTest: 0.5 })]; });
  for (const [key, list] of trees) {
    const k = +key[0], geo = merge(list), nr = geo.attributes.normal.array, uvs = geo.attributes.uv.array, vc = new Float32Array(nr.length);
    for (let i = 0, j = 0; i < nr.length; i += 3, j += 2) { nr[i] = 0; nr[i + 1] = 1; nr[i + 2] = 0; const v = 0.6 + 0.5 * uvs[j + 1]; vc[i] = v; vc[i + 1] = v; vc[i + 2] = v * 0.97; }
    geo.setAttribute('color', new THREE.BufferAttribute(vc, 3));
    const tm = new THREE.Mesh(geo, treeMats[k][0]); tm.customDepthMaterial = treeMats[k][1]; tm.castShadow = true; grp.add(tm);
  }
  if (m.houses) {
    const bodyM = lam({ map: patternTex('plaster') }), roofM = lam({ map: patternTex('roof') }), doorM = lam({ color: linCol(0x4a2c16) });
    for (const q of m.houses) {
      const sx = q.x1 - q.x0 + 1, sz = q.y1 - q.y0 + 1, cx = q.x0 + sx / 2, cz = q.y0 + sz / 2, base = groundHm(m, cx, cz) - 0.3;
      const body = solid(new THREE.BoxGeometry(sx - 0.1, 2.6, sz - 0.1), bodyM); body.position.set(cx, base + 1.3, cz);
      const rg = new THREE.ConeGeometry(1, 2, 4, 1); rg.rotateY(Math.PI / 4); rg.scale((sx + 0.7) * Math.SQRT1_2, 1, (sz + 0.7) * Math.SQRT1_2);
      const roof = solid(rg, roofM); roof.position.set(cx, base + 2.6 + 1, cz);
      const door = solid(new THREE.BoxGeometry(0.8, 1.4, 0.1), doorM); door.position.set(cx, base + 1.0, q.y1 + 1 + 0.01);
    }
  }
  if (m.way) {
    const g = new THREE.Group(), st = lam({ map: patternTex('stone') });
    const part = (geo, y, ry) => { const me = new THREE.Mesh(geo, st); me.position.y = y; if (ry) me.rotation.y = ry; me.castShadow = me.receiveShadow = true; g.add(me); return me; };
    part(new THREE.CylinderGeometry(0.95, 1.05, 0.25, 12), 0.12); part(new THREE.CylinderGeometry(0.16, 0.34, 2.3, 4), 1.4, Math.PI / 4); part(new THREE.ConeGeometry(0.2, 0.4, 4), 2.75, Math.PI / 4);
    const rune = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, 0.06), new THREE.MeshBasicMaterial({ color: 0xffa040 })); rune.position.set(0, 1.3, 0.3); g.add(rune);
    g.position.set(m.way.x, groundHm(m, m.way.x, m.way.y), m.way.y); grp.add(g);
    if (A.way) A.way.rune = rune;
  }
  const metal = lam({ color: linCol(0x3a3430), specular: 0x333333, shininess: 30 });
  for (const b of m.braziers) {
    const g = new THREE.Group();
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.1, 0.75, 6), metal); leg.position.y = 0.37; g.add(leg);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.15, 0.22, 8), metal); bowl.position.y = 0.82; g.add(bowl);
    leg.castShadow = bowl.castShadow = true; g.position.set(b.x, groundHm(m, b.x, b.y), b.y); grp.add(g);
  }
  refreshMaterials(grp);
}

/* ---------- Terrain heightmap texture (post: mist / height fog hug the ground) ---------- */
function heightTex(m) {
  const W1 = m.w + 1, H1 = m.h + 1, n = W1 * H1; let mn = 1e9, mx = -1e9;
  for (let i = 0; i < n; i++) { const v = m.hgt[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
  const rg = Math.max(0.01, mx - mn), D = new Uint8Array(n * 4);
  // G = air mask: 0 over the hidden solid mass of a dungeon (no lit dust / mist in the void), else 1
  const dng = m.d.gen === 'dungeon', solid = (x, y) => { if (x < 0 || y < 0 || x >= m.w || y >= m.h) return true; const i = y * m.w + x; return m.t[i] === T.WALL && !(m.vis && m.vis[i]); };
  for (let y = 0; y < H1; y++) for (let x = 0; x < W1; x++) {
    const i = y * W1 + x, air = !dng || !(solid(x - 1, y - 1) && solid(x, y - 1) && solid(x - 1, y) && solid(x, y));
    D[i * 4] = clamp((m.hgt[i] - mn) / rg * 255, 0, 255); D[i * 4 + 1] = air ? 255 : 0; D[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(D, W1, H1, THREE.RGBAFormat); t.magFilter = t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
  return { tex: t, w1: W1, h1: H1, min: mn, range: rg };
}

/* ---------- Water (T.WATER, render.water) and the cloud sea under the Bifrost (T.VOID, render.void) ----------
   One plane each over the map + skirt; the terrain dips below them, so the depth test cuts the shores.
   Water: depth from the terrain heightmap -> shallow/deep colour, soft shore foam, scrolling normals with a
   sky reflection (fresnel) and a sun glint; `murky` damps both and adds scum; `ice` freezes the shallows.
   Clouds: two layers of drifting fbm (opaque floor + a translucent upper layer), faint rainbow sheen. */
const WATERU = { uT: { value: 0 } };
const _hexOr = (v, d) => { try { return linCol(v === undefined || v === null ? d : v); } catch (e) { return linCol(d); } };
function waterNoise() { return (GFX.composer && GFX.composer.noise) || TEX.soft; }
function buildWater(m, W, R, hg) {
  const lvl = isFinite(W.level) ? +W.level : -0.45, E = 26;
  const U = Object.assign({
    tHgt: { value: hg.tex }, uHgt: { value: new THREE.Vector4(1 / hg.w1, 1 / hg.h1, hg.min, hg.range) }, tNoise: { value: waterNoise() }, uLevel: { value: lvl },
    uCol: { value: _hexOr(W.color, 0x1d3c56) }, uDeep: { value: _hexOr(W.deep, 0x0b1a2a) }, uFoam: { value: _hexOr(W.foam, 0xeaf4ff) }, uIce: { value: _hexOr(W.ice, 0xcfe6f6) },
    uFlags: { value: new THREE.Vector2(W.murky ? 1 : 0, W.ice ? 1 : 0) }, uSky: { value: SKY.top }, uHor: { value: SKY.hor }, uSunDir: { value: SKY.sunDir }, uSunC: { value: sun.color },
    uFogCol: LAVAU.uFogCol, uFog: LAVAU.uFog,
  }, WATERU);
  const mat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vW; varying float vDepth; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vDepth = -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: `uniform sampler2D tHgt, tNoise; uniform vec4 uHgt; uniform float uLevel, uT; uniform vec3 uCol, uDeep, uFoam, uIce, uSky, uHor, uSunDir, uSunC, uFogCol; uniform vec2 uFlags, uFog;
      varying vec3 vW; varying float vDepth;
      void main(){
        float gh = uHgt.z + uHgt.w * texture2D(tHgt, (vW.xz + 0.5) * uHgt.xy).r, dep = max(uLevel - gh, 0.0);
        vec2 p = vW.xz;
        vec2 n1 = texture2D(tNoise, p * 0.085 + vec2(uT * 0.018, uT * 0.011)).rg - 0.5, n2 = texture2D(tNoise, p * 0.23 - vec2(uT * 0.027, -uT * 0.019)).rg - 0.5;
        vec3 N = normalize(vec3((n1.x + n2.x * 0.7) * 0.55, 1.0, (n1.y + n2.y * 0.7) * 0.55));
        vec3 V = normalize(cameraPosition - vW), Rf = reflect(-V, N);
        float fres = 0.03 + 0.97 * pow(1.0 - max(dot(N, V), 0.0), 5.0), murk = uFlags.x;
        vec3 sky = mix(uHor, uSky, clamp(Rf.y, 0.0, 1.0));
        float glint = pow(max(dot(Rf, normalize(uSunDir)), 0.0), 220.0) * 5.0 + pow(max(dot(Rf, normalize(uSunDir)), 0.0), 24.0) * 0.12;
        vec3 body = mix(uCol, uDeep, smoothstep(0.04, 0.75, dep));
        float scum = murk * smoothstep(0.55, 0.8, texture2D(tNoise, p * 0.06 + vec2(uT * 0.004, 0.0)).g);
        body = mix(body, uFoam * 0.5, scum * 0.6);
        vec3 c = mix(body, sky, fres * (0.8 - murk * 0.55)) + uSunC * glint * (1.0 - murk * 0.85) * (1.0 - scum);
        float fn = texture2D(tNoise, p * 0.5 + vec2(uT * 0.04, -uT * 0.03)).r, wave = 0.12 + 0.07 * sin(uT * 1.4 - (p.x + p.y) * 0.9);
        float foam = (1.0 - smoothstep(0.0, wave, dep)) * smoothstep(0.3, 0.6, fn) * (1.0 - murk * 0.6);
        c = mix(c, uFoam, foam * 0.8);
        if (uFlags.y > 0.5) { float fr = smoothstep(0.34, 0.2, dep + (texture2D(tNoise, p * 0.11).g - 0.5) * 0.35); c = mix(c, uIce * (0.85 + 0.3 * texture2D(tNoise, p * 0.7).r) + sky * 0.15, fr * 0.9); }
        float a = mix(0.55, 0.96, smoothstep(0.0, 0.5, dep));
        c = mix(c, uFogCol, smoothstep(uFog.x, uFog.y, vDepth));
        gl_FragColor = vec4(c, a);
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(m.w + 2 * E, m.h + 2 * E).rotateX(-Math.PI / 2), mat);
  mesh.position.set(m.w / 2, lvl, m.h / 2); mesh.renderOrder = 2; mesh.frustumCulled = false; return mesh;
}
function buildVoid(m, V, R) {
  const y0 = Math.max(isFinite(V.depth) ? +V.depth : -4.5, -4.1), grp = new THREE.Group();
  const mk = (y, a, sc, sp) => {
    const mat = new THREE.ShaderMaterial({
      uniforms: Object.assign({ tNoise: { value: waterNoise() }, uCol: { value: _hexOr(V.color, 0xe8e0f4) }, uCl: { value: _hexOr(V.clouds, 0xfaf4ff) }, uA: { value: a }, uSc: { value: sc }, uSp: { value: sp }, uRb: { value: V.rainbow ? 1 : 0 }, uFogCol: LAVAU.uFogCol, uFog: LAVAU.uFog }, WATERU),
      transparent: a < 1, depthWrite: a >= 1, fog: false,
      vertexShader: 'varying vec3 vW; varying float vDepth; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vDepth = -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: `uniform sampler2D tNoise; uniform vec3 uCol, uCl, uFogCol; uniform float uA, uSc, uSp, uRb, uT; uniform vec2 uFog; varying vec3 vW; varying float vDepth;
        void main(){
          vec2 p = vW.xz * uSc + vec2(uT * uSp, uT * uSp * 0.45);
          float n = texture2D(tNoise, p).r * 0.55 + texture2D(tNoise, p * 2.1 + vec2(0.3, 0.1) - uT * uSp * 0.6).g * 0.3 + texture2D(tNoise, p * 4.7 + 0.5).r * 0.15;
          float cl = smoothstep(0.34, 0.72, n), lit = smoothstep(0.3, 0.9, texture2D(tNoise, p + vec2(0.012, 0.02)).r * 0.55 + n * 0.45);
          vec3 c = mix(uCol * 0.82, uCl * (0.92 + 0.22 * lit), cl);
          if (uRb > 0.5) { float hue = fract((vW.x + vW.z) * 0.012 + uT * 0.01); vec3 rb = clamp(abs(fract(hue + vec3(0.0, 0.667, 0.333)) * 6.0 - 3.0) - 1.0, 0.0, 1.0); c = mix(c, c * (0.75 + 0.5 * rb), 0.12 * (1.0 - cl)); }
          c = mix(c, uFogCol, smoothstep(uFog.x, uFog.y * 1.4, vDepth) * 0.8);
          gl_FragColor = vec4(c, uA < 1.0 ? uA * cl : 1.0);
          #include <tonemapping_fragment>
          #include <encodings_fragment>
        }`,
    });
    const me = new THREE.Mesh(new THREE.PlaneGeometry(m.w + 160, m.h + 160).rotateX(-Math.PI / 2), mat); me.position.set(m.w / 2, y, m.h / 2); me.frustumCulled = false; return me;
  };
  grp.add(mk(y0, 1, 0.03, 0.006)); const up = mk(y0 + 1.1, 0.75, 0.045, 0.011); up.renderOrder = 3; grp.add(up);
  return grp;
}

/* ---------- Bounty boards: small roofed notice board (primitives + a painted face) ---------- */
// (painted lazily: only the primitive fallback board needs them)
function boardTextures() {
  if (TEX.board) return;
  TEX.wood = (() => {
  const c = mkCanvas(64, 64), g = c.getContext('2d'), r = mulberry32(71);
  g.fillStyle = '#7a5434'; g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 60; i++) { g.strokeStyle = `rgba(${r() < 0.5 ? '40,24,12' : '160,120,80'},${0.12 + r() * 0.2})`; g.lineWidth = 1; g.beginPath(); const y = r() * 64; g.moveTo(0, y); g.bezierCurveTo(20, y + (r() - 0.5) * 6, 44, y + (r() - 0.5) * 6, 64, y + (r() - 0.5) * 4); g.stroke(); }
  return canvasTex(c);
})();
TEX.board = (() => {
  const W = 256, H = 168, c = mkCanvas(W, H), g = c.getContext('2d'), r = mulberry32(1234);
  for (let i = 0; i < 6; i++) {   // vertical planks with grain and dark gaps
    const x = i * W / 6, v = 110 + r() * 26; g.fillStyle = `rgb(${v | 0},${v * 0.7 | 0},${v * 0.44 | 0})`; g.fillRect(x, 0, W / 6, H);
    for (let k = 0; k < 9; k++) { g.strokeStyle = `rgba(50,30,14,${0.12 + r() * 0.18})`; g.beginPath(); const gx = x + 3 + r() * (W / 6 - 6); g.moveTo(gx, 0); g.bezierCurveTo(gx + (r() - 0.5) * 8, H * 0.3, gx + (r() - 0.5) * 8, H * 0.7, gx + (r() - 0.5) * 6, H); g.stroke(); }
    g.fillStyle = 'rgba(30,16,6,.8)'; g.fillRect(x, 0, 2, H);
    if (r() < 0.6) { g.fillStyle = 'rgba(40,22,10,.6)'; g.beginPath(); g.ellipse(x + 10 + r() * 20, 20 + r() * 120, 3, 5, 0, 0, 7); g.fill(); }
  }
  const note = (x, y, w, h, a, col, kind) => {
    g.save(); g.translate(x, y); g.rotate(a);
    g.fillStyle = 'rgba(20,10,4,.35)'; g.fillRect(-w / 2 + 3, -h / 2 + 4, w, h);
    g.fillStyle = col; g.fillRect(-w / 2, -h / 2, w, h);
    g.fillStyle = 'rgba(120,90,50,.25)'; g.fillRect(-w / 2, h / 2 - 5, w, 5); g.fillRect(w / 2 - 4, -h / 2, 4, h);
    if (kind === 'wanted') {
      g.fillStyle = '#6a1a12'; g.fillRect(-w / 2 + 8, -h / 2 + 8, w - 16, 6);
      g.fillStyle = '#2a1a10'; g.beginPath(); g.arc(0, -2, 11, 0, 7); g.fill(); g.fillRect(-7, 6, 14, 7);
      g.fillStyle = col; g.fillRect(-6, -5, 4, 4); g.fillRect(2, -5, 4, 4);
      g.fillStyle = '#6a1a12'; g.fillRect(-w / 2 + 8, h / 2 - 16, w - 16, 3);
    } else {
      g.strokeStyle = 'rgba(40,30,24,.75)'; g.lineWidth = 1.4;
      for (let k = 0; k < 5; k++) { const yy = -h / 2 + 12 + k * (h - 22) / 5; g.beginPath(); g.moveTo(-w / 2 + 6, yy); let xx = -w / 2 + 6; while (xx < w / 2 - 8 - (k === 4 ? w * 0.3 : 0)) { xx += 3 + r() * 5; g.lineTo(xx, yy + (r() - 0.5) * 2); } g.stroke(); }
    }
    g.fillStyle = '#b82a1a'; g.beginPath(); g.arc(0, -h / 2 + 5, 3.2, 0, 7); g.fill(); g.fillStyle = '#ff9a80'; g.fillRect(-1, -h / 2 + 3, 1.5, 1.5);
    g.restore();
  };
  note(52, 58, 64, 78, -0.08, '#efe4c6', 'wanted'); note(126, 50, 56, 60, 0.05, '#f2ead6'); note(196, 64, 58, 72, -0.04, '#e8dcbc');
  note(96, 124, 60, 48, 0.07, '#f4ecd8'); note(170, 128, 50, 44, -0.1, '#e4d4b0');
  g.strokeStyle = '#3a2210'; g.lineWidth = 6; g.strokeRect(3, 3, W - 6, H - 6);
  const t = canvasTex(c); t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy()); return t;
  })();
}
const BOARD = { wood: null, face: null, geo: null, faceGeo: null }, BOARD_S = 0.72;
function boardMesh(lam) {
  if (!BOARD.geo) {
    // the notice face leans back a little so the camera (about 50 deg above the horizon) reads it
    const parts = [], LEAN = -0.26, box = (x, y, z, sx, sy, sz, rx, lean) => { const g = ni(new THREE.BoxGeometry(sx, sy, sz)); if (rx) g.rotateX(rx); if (lean) { g.translate(0, y - 1.02, z); g.rotateX(LEAN); g.translate(x, 1.02, 0); } else g.translate(x, y, z); parts.push(g); };
    box(-0.6, 0.9, 0, 0.11, 1.84, 0.11); box(0.6, 0.9, 0, 0.11, 1.84, 0.11);               // posts
    box(0, 1.02, -0.02, 1.3, 0.86, 0.06, 0, true);                                          // backing boards
    box(0, 1.46, 0.02, 1.42, 0.07, 0.1, 0, true); box(0, 0.58, 0.02, 1.42, 0.07, 0.1, 0, true); // top / bottom rails
    box(0, 1.76, 0.1, 1.6, 0.045, 0.28, -0.55); box(0, 1.76, -0.1, 1.6, 0.045, 0.28, 0.55);  // little gable roof
    box(0, 1.86, 0, 1.64, 0.06, 0.07);                                                     // ridge
    box(-0.6, 0.02, 0, 0.2, 0.1, 0.2); box(0.6, 0.02, 0, 0.2, 0.1, 0.2);                   // footings
    BOARD.geo = merge(parts);
    BOARD.faceGeo = new THREE.PlaneGeometry(1.24, 0.8).translate(0, 0.015, 0.016).rotateX(LEAN).translate(0, 1.02, 0);
  }
  boardTextures();
  if (!BOARD.wood) { BOARD.wood = lam({ map: TEX.wood, color: linCol(0xc8a888) }); BOARD.face = lam({ map: TEX.board }); }
  const g = new THREE.Group(), a = new THREE.Mesh(BOARD.geo, BOARD.wood), b = new THREE.Mesh(BOARD.faceGeo, BOARD.face);
  a.castShadow = a.receiveShadow = b.receiveShadow = true; g.add(a, b); return g;
}

/* ---------- Helgrind, Hel's gate (map.objs kind 'helgate'): a bone-and-iron arch with a breathing crack of light ----------
   State (read each frame): closed (before act 2) = cold violet hairline; open (act2, not shut) = wide green breath;
   shut (gateShut) = thin green thread with Moðguðr's lantern burning in front. */
const GATEU = { uT: { value: 0 }, uOpen: { value: 0 }, uCol: { value: new THREE.Color() } };
function buildHelgate(o, m, lam, A, GB, FB) {
  const bone = [], iron = [], R = 1.25, H = 3.1;
  const cyl = (arr, x, y, z, r0, r1, h, seg) => { const g = ni(new THREE.CylinderGeometry(r1, r0, h, seg || 8)); g.translate(x, y + h / 2, z); arr.push(g); };
  // two pillars of stacked vertebrae bound with iron bands
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 7; k++) { cyl(bone, sx * R, k * 0.36, 0, 0.21 - k * 0.006, 0.17 - k * 0.006, 0.26, 9); cyl(iron, sx * R, k * 0.36 + 0.25, 0, 0.18, 0.18, 0.1, 8); }
    const sk = ni(new THREE.SphereGeometry(0.2, 10, 8)); sk.scale(1, 0.9, 1.05); sk.translate(sx * R, 2.66, 0.02); bone.push(sk);
    const sp = ni(new THREE.ConeGeometry(0.06, 0.5, 6)); sp.translate(sx * R, 2.98, 0); bone.push(sp);
  }
  // pointed arch of rib bones with thorn spikes
  const pts = [];
  for (let i = 0; i <= 24; i++) { const t = i / 24, a = t * Math.PI, x = -Math.cos(a) * R, y = 2.55 + Math.sin(a) * 0.95 + (1 - Math.abs(t - 0.5) * 2) ** 3 * 0.35; pts.push(new THREE.Vector3(x, y, 0)); }
  bone.push(ni(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.11, 7)));
  for (let i = 2; i <= 22; i += 3) { const p = pts[i], q = pts[i + 1] || p, d = new THREE.Vector3().subVectors(q, p).normalize(), nrm = new THREE.Vector3(-d.y, d.x, 0); const c = ni(new THREE.ConeGeometry(0.045, 0.34, 5)); c.translate(0, 0.17, 0); c.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), nrm))); c.translate(p.x, p.y, 0.06); bone.push(c); }
  // skull keystone
  const sk = ni(new THREE.SphereGeometry(0.3, 12, 10)); sk.scale(1, 0.92, 1); sk.translate(0, 3.62, 0.08); bone.push(sk);
  const jaw = boxAt(0, 3.3, 0.14, 0.34, 0.14, 0.22); bone.push(jaw);
  // iron bars in the opening, a threshold slab
  for (let i = -2; i <= 2; i++) { const x = i * 0.42, top = 2.55 + Math.sqrt(Math.max(0, 1 - (x / R) ** 2)) * 0.95; iron.push(boxAt(x, 0, 0.12, 0.06, top, 0.06)); }
  iron.push(boxAt(0, 1.4, 0.12, 2.3, 0.07, 0.06)); iron.push(boxAt(0, 0, 0, 2.9, 0.12, 0.7));
  const g = new THREE.Group();
  const bm = new THREE.Mesh(merge(bone), lam({ color: linCol(0xcfc4a8), specular: 0x221e18, shininess: 12 })), im = new THREE.Mesh(merge(iron), lam({ color: linCol(0x2e2b33), specular: 0x3a3a44, shininess: 36 }));
  bm.castShadow = im.castShadow = bm.receiveShadow = im.receiveShadow = true; g.add(bm, im);
  // the crack: a tall plane behind the bars, a breathing fissure of light (width / colour from GATEU)
  const crack = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 3.4).translate(0, 1.7, -0.08), new THREE.ShaderMaterial({
    uniforms: Object.assign({ tNoise: { value: (GFX.composer && GFX.composer.noise) || TEX.soft } }, GATEU), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tNoise; uniform float uT, uOpen; uniform vec3 uCol; varying vec2 vUv;
      void main(){
        float y = vUv.y, wob = (texture2D(tNoise, vec2(0.3, y * 0.7 + uT * 0.02)).r - 0.5) * 0.18 + (texture2D(tNoise, vec2(y * 2.3, uT * 0.05)).g - 0.5) * 0.05;
        float breathe = 0.75 + 0.25 * sin(uT * 1.3) + 0.08 * sin(uT * 4.1), wdt = mix(0.006, 0.09, uOpen) * breathe;
        float d = abs(vUv.x - 0.5 - wob * (0.4 + uOpen)), core = exp(-d * d / (wdt * wdt)), halo = exp(-d / (wdt * 6.0 + 0.02)) * 0.35;
        float fade = smoothstep(0.0, 0.08, y) * smoothstep(1.0, 0.72, y);
        gl_FragColor = vec4(uCol * (core * 2.2 + halo) * fade, 1.0);
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }`,
  }));
  g.add(crack);
  const gh = groundHm(m, o.x, o.y); g.position.set(o.x, gh, o.y);
  const halo = GB.add(new THREE.Color(0.5, 1.4, 0.7), 0, 2.6, 3.6); halo.position.set(o.x, gh + 1.6, o.y + 0.1);
  // Moðguðr's lantern (lit once the gate is shut): a post in front, a small flame
  const lp = new THREE.Mesh(merge([boxAt(0.9, 0, 0.75, 0.06, 1.3, 0.06), boxAt(0.9, 1.3, 0.75, 0.2, 0.22, 0.2)]), lam({ color: linCol(0x2e2b33), specular: 0x333333, shininess: 30 }));
  lp.position.copy(g.position); lp.castShadow = true; lp.visible = false;
  const fl = FB.add(new THREE.Color(1.8, 2.6, 1.2), 1, 0.28, 0.42); fl.position.set(o.x + 0.9, gh + 1.42, o.y + 0.75); fl.visible = false;
  A.gate = { o, halo, fl, lp, k: 0 };
  return [g, lp];
}

/* ---------- Light pools: soft flickering ground glow under fires / lamps (1 draw call per map) ---------- */
const POOLU = { uT: { value: 0 }, uWay: { value: 0 } };
function buildPools(m, plan, R) {
  const Lc = R.lights || RLOOK.ashen_fields.lights, E = [], dark = R.exposure > 1.05;
  const col = (hex, k) => linCol(hex).multiplyScalar(k);
  for (const b of m.braziers) E.push([b.x, b.y, dark ? 3.2 : 2.6, col(Lc.brazier[0], dark ? 0.5 : 0.3), b.x * 3.1 + b.y, 1, 0]);
  if (m.way) E.push([m.way.x, m.way.y, 3.4, col(Lc.way[0], dark ? 0.4 : 0.22), 0.7, 1, 1]);
  const lamp = Lc.lamp || [0xffc070];
  for (const l of plan.lights) E.push([l.x, l.z, 1.9, col(lamp[0], dark ? 0.3 : 0.14), l.x * 1.7 + l.z, 0.25, 0]);
  for (const wp of m.warps) E.push([wp.x + 0.5, wp.y + 0.5, 1.9, col(Lc.warp[0], 0.22), 2, 0.3, 0]);
  const openAt = (x, z) => { const i = clamp(Math.floor(z), 0, m.h - 1) * m.w + clamp(Math.floor(x), 0, m.w - 1); return m.t[i] === 0 || m.t[i] === T.PROP; };
  for (const l of (plan.dlights || [])) { if (!openAt(l.x, l.z)) continue; let c; try { c = col(l.col, dark ? 0.16 : 0.1); } catch (e) { continue; } E.push([l.x, l.z, Math.min(2.2, 0.35 * l.d), c, l.x * 2.3 + l.z, 0.15, 0]); }
  if (!E.length) return null;
  const G = 6, per = (G + 1) * (G + 1), n = E.length, pos = new Float32Array(n * per * 3), ctr = new Float32Array(n * per * 4), cl = new Float32Array(n * per * 4), idx = [];
  E.forEach(([x, z, r, c, ph, fl, way], e) => {
    for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++) {
      const k = e * per + j * (G + 1) + i, px = x - r + 2 * r * i / G, pz = z - r + 2 * r * j / G;
      pos[k * 3] = px; pos[k * 3 + 1] = groundHm(m, px, pz) + 0.035; pos[k * 3 + 2] = pz;
      ctr[k * 4] = x; ctr[k * 4 + 1] = z; ctr[k * 4 + 2] = r; ctr[k * 4 + 3] = ph;
      cl[k * 4] = c.r; cl[k * 4 + 1] = c.g; cl[k * 4 + 2] = c.b; cl[k * 4 + 3] = fl + way * 10;
    }
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { const a = e * per + j * (G + 1) + i, b = a + 1, c2 = a + G + 1, d = c2 + 1; idx.push(a, c2, b, b, c2, d); }
  });
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aC', new THREE.BufferAttribute(ctr, 4)); geo.setAttribute('aCol', new THREE.BufferAttribute(cl, 4)); geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    uniforms: POOLU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    vertexShader: `attribute vec4 aC, aCol; uniform float uT, uWay; varying vec2 vD; varying vec3 vCol;
      void main(){ vD = (position.xz - aC.xy) / aC.z; float fl = mod(aCol.w, 10.0), ph = aC.w;
        float f = 1.0 - fl * (0.12 + 0.1 * sin(uT * 11.0 + ph) + 0.07 * sin(uT * 23.7 + ph * 2.0) + 0.05 * sin(uT * 5.3 + ph * 0.7));
        vCol = aCol.rgb * f * f * (aCol.w >= 10.0 ? uWay : 1.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec2 vD; varying vec3 vCol;
      void main(){ float q = clamp(1.0 - dot(vD, vD), 0.0, 1.0); gl_FragColor = vec4(vCol * q * q * (0.35 + 0.65 * q), 1.0);
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = -1; mesh.frustumCulled = false; return mesh;
}

/* ---------- Dust motes drifting in the light (Points; lit only where the static shadow map sees the sun) ---------- */
const MOTEU = { uT: { value: 0 }, uC: { value: new THREE.Vector3() }, uScale: { value: 400 }, tShadow: { value: null }, uShadowM: { value: new THREE.Matrix4() }, uLitOn: { value: 0 } };
function buildMotes(S) {
  const n = S.n || 500, seed = new Float32Array(n * 4), r = mulberry32(4242);
  for (let i = 0; i < n * 4; i++) seed[i] = r();
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const vtx = renderer.capabilities.maxVertexTextures > 0 && S.lit;
  const mat = new THREE.ShaderMaterial({
    uniforms: Object.assign({ uCol: { value: linCol(S.col || 0xfff0c0) }, uBox: { value: S.box || 24 }, uH: { value: new THREE.Vector2(S.hmin || 0.3, S.hmax || 4) }, uSize: { value: S.size || 0.05 } }, MOTEU),
    defines: vtx ? { MOTE_LIT: 1 } : {}, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `attribute vec4 aSeed; uniform float uT, uBox, uScale, uSize, uLitOn; uniform vec3 uC; uniform vec2 uH; varying float vB;
      #ifdef MOTE_LIT
      uniform sampler2D tShadow; uniform mat4 uShadowM;
      float unpackD(const in vec4 v){ return dot(v, (255.0 / 256.0) / vec4(256.0 * 256.0 * 256.0, 256.0 * 256.0, 256.0, 1.0)); }
      #endif
      void main(){
        vec2 drift = vec2(sin(uT * 0.31 + aSeed.z * 6.28), cos(uT * 0.23 + aSeed.w * 6.28)) * 0.7 + vec2(0.11, 0.05) * uT;
        vec2 o = uC.xz - uBox * 0.5, xz = o + mod(aSeed.xy * uBox + drift - o, uBox);
        float y = uC.y + mix(uH.x, uH.y, fract(aSeed.z + uT * 0.012 * (0.4 + aSeed.w))) + sin(uT * 0.9 + aSeed.x * 20.0) * 0.12;
        vec3 p = vec3(xz.x, y, xz.y);
        float tw = 0.55 + 0.45 * sin(uT * (1.3 + aSeed.w * 2.2) + aSeed.y * 40.0);
        float edge = 1.0 - smoothstep(0.3, 0.5, max(abs(xz.x - uC.x), abs(xz.y - uC.z)) / uBox);
        float lit = 1.0;
        #ifdef MOTE_LIT
        if (uLitOn > 0.5) { vec4 sc = uShadowM * vec4(p, 1.0); if (sc.x > 0.0 && sc.x < 1.0 && sc.y > 0.0 && sc.y < 1.0) lit = mix(0.1, 1.0, step(sc.z, unpackD(texture2D(tShadow, sc.xy)) + 0.002)); }
        #endif
        vB = tw * edge * lit;
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * (0.6 + 0.8 * aSeed.w) * uScale / -mv.z;
      }`,
    fragmentShader: `uniform vec3 uCol; varying float vB;
      void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.05, d); gl_FragColor = vec4(uCol * vB * a * 1.6, 1.0);
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }`,
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 5; return pts;
}

/* ---------- Carved stone caps on the keep wall blocks (the model's top faces) ----------
   World-up faces of dng_wall get their own albedo: tile-aligned slabs with a carved groove and
   bevel, flagstone joints and grain from the floor detail texture, grime and moss; tinted by the
   instance tint (keep blue-grey / town warm). Other faces keep the model texture. */
const CAPU = { uCapD: { value: null } };
function capify(mat) {
  mat.onBeforeCompile = sh => {
    if (!CAPU.uCapD.value) CAPU.uCapD.value = detailTex('flag').tex;
    Object.assign(sh.uniforms, CAPU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCapW, vCapN;')
      .replace('#include <project_vertex>', `#include <project_vertex>
      { vec4 cw = vec4(transformed, 1.0); vec3 cn = objectNormal;
        #ifdef USE_INSTANCING
        cw = instanceMatrix * cw; cn = mat3(instanceMatrix) * cn;
        #endif
        vCapW = (modelMatrix * cw).xyz; vCapN = normalize(mat3(modelMatrix) * cn); }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vCapW, vCapN; uniform sampler2D uCapD; float capUp; vec2 capSl;')
      .replace('#include <map_fragment>', `#include <map_fragment>
      capUp = smoothstep(0.6, 0.9, vCapN.y); capSl = vec2(0.0);
      if (capUp > 0.0) {
        vec2 wp = vCapW.xz, f = fract(wp) - 0.5, af = abs(f);
        vec4 dd = texture2D(uCapD, wp * 0.31 + vec2(0.13, 0.57));
        float e = max(af.x, af.y), groove = smoothstep(0.425, 0.465, e) * (1.0 - smoothstep(0.485, 0.5, e) * 0.5);
        float bevel = smoothstep(0.33, 0.43, e) * (1.0 - groove);
        float grime = texture2D(uCapD, wp * 0.071 + vec2(0.4, 0.2)).b, moss = smoothstep(0.58, 0.72, texture2D(uCapD, wp * 0.113 + vec2(0.71, 0.33)).a + (grime - 0.5) * 0.4);
        vec3 tint = diffuse / max(max(diffuse.r, diffuse.g), max(diffuse.b, 0.01));
        vec3 st = vec3(0.6, 0.57, 0.53) * mix(vec3(1.0), tint, 0.6) * (0.42 + 1.05 * dd.b) * (0.8 + 0.4 * grime);
        st *= (1.0 - groove * 0.62) * (1.0 + bevel * 0.22);
        st = mix(st, vec3(0.16, 0.24, 0.1) * (0.6 + 0.8 * dd.b), moss * 0.55 * (1.0 - groove));
        diffuseColor.rgb = mix(diffuseColor.rgb, st, capUp);
        capSl = (dd.rg - 0.5) * 3.0 - sign(f) * step(af.yx, af.xy) * vec2(1.0, 1.0) * (smoothstep(0.34, 0.44, e) - smoothstep(0.44, 0.49, e)) * 2.2;
      }`)
      .replace('#include <specularmap_fragment>', '#include <specularmap_fragment>\nspecularStrength *= 1.0 - capUp * 0.85;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      if (capUp > 0.0) normal = normalize(normal - capUp * 0.9 * (viewMatrix * vec4(capSl.x, 0.0, capSl.y, 0.0)).xyz);`);
  };
  mat.customProgramCacheKey = () => 'cap';
  return mat;
}

/* ---------- World building ---------- */
function buildWorld(m) {
  if (m.world) return m.world;
  const L = m.d.look, R = rlookFor(m), grp = new THREE.Group(), w = m.w, h = m.h, W1 = w + 1;
  const A = { flames: [], warps: [], lava: null, heart: null, way: null };
  const spec = R.spec;
  const lam = (o) => new THREE.MeshPhongMaterial(Object.assign({ specular: spec ? spec[0] : 0x000000, shininess: spec ? spec[1] : 1 }, o));
  const solid = (geo, mat) => { const me = new THREE.Mesh(geo, mat); me.castShadow = true; me.receiveShadow = true; grp.add(me); return me; };
  const plan = planProps(m); m.propLights = plan.lights; m.propDLights = plan.dlights; m.propAvoid = plan.avoid; m.propItems = plan.items;
  m.hgtInfo = heightTex(m); A.halos = [];
  // Ground: painted macro + detail layers (see groundDetail)
  const gg = new THREE.PlaneGeometry(w, h, w, h); gg.rotateX(-Math.PI / 2); gg.translate(w / 2, 0, h / 2);
  const pos = gg.attributes.position; for (let i = 0; i < pos.count; i++) pos.setY(i, m.hgt[Math.round(pos.getZ(i)) * W1 + Math.round(pos.getX(i))]);
  gg.computeVertexNormals();
  const pg = paintGround(m, plan), mk = groundMask(m); m.gbase = pg; m.gmask = mk;
  const shadeT = new THREE.CanvasTexture(pg.shade); shadeT.flipY = false; shadeT.generateMipmaps = false; shadeT.minFilter = THREE.LinearFilter; pg.shade = null;
  const gmat = lam({ map: canvasTex(pg.macro, { aniso: true }) }); pg.macro = null;
  const baseK = floorDetail(L.floor);
  groundDetail(gmat, {
    base: detailTex(baseK), mask: mk.tex, shade: shadeT, mapInv: new THREE.Vector2(1 / w, 1 / h), nrm: baseK === 'flag' ? 1.25 : 1,
    path: mk.hasP ? detailTex('dirt') : null, pathC: rgbLin(L.path || [150, 130, 100]),
    cob: mk.hasC ? detailTex('cobble') : null, cobC: rgbLin(L.path || [176, 164, 140]).multiplyScalar(1.12),
    ash: mk.hasA ? detailTex('ash') : null, ashC: rgbLin(L.ash || [130, 128, 120]),
  });
  if (m.emisCanvas) { gmat.emissiveMap = canvasTex(m.emisCanvas); gmat.emissive = new THREE.Color(1.5, 0.62, 0.25); A.groundEmis = gmat; m.emisCanvas = null; }
  const ground = new THREE.Mesh(gg, gmat); ground.receiveShadow = true; grp.add(ground); grp.userData.ground = ground;
  if (!L.lava) { const sk = buildSkirt(m, skirtTex(m), spec); groundDetail(sk.material, { base: detailTex(baseK) }); grp.add(sk); }
  const GB = glowBatch(TEX.glow), FB = glowBatch(TEX.flame); A.glowB = GB; A.flameB = FB;
  const glowSprite = (col, op, sx, sy) => GB.add(col, op, sx, sy);
  const flameSprite = (r, g, b) => FB.add(new THREE.Color(r, g, b), 1, 1, 1);
  
  // Waystone flame at the model's light anchor (the stone itself is a prop)
  if (m.way) {
    const gh = groundHm(m, m.way.x, m.way.y), ay = PROP_LIGHT.waystone[1] * 0.9;
    const fl = flameSprite(3.4, 1.7, 0.55); fl.position.set(m.way.x, gh + ay + 0.5, m.way.y); fl.scale.set(0.9, 1.35, 1);
    const halo = glowSprite(linCol(0xff8a30), 0.35, 3, 3); halo.position.set(m.way.x, gh + ay + 0.3, m.way.y); A.halos.push({ s: halo, op: 0.35, ph: 0.7, fl: 1 });
    A.way = { fl, halo, rune: null }; A.flames.push({ s: fl, sx: 0.9, sy: 1.35 });
  }
  // Warp portals
  for (const wp of m.warps) {
    const gh = groundHm(m, wp.x + 0.5, wp.y + 0.5);
    const ringM = new THREE.MeshBasicMaterial({ map: TEX.magic, color: 0x7ab8ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), ringM); ring.rotation.x = -Math.PI / 2; ring.position.set(wp.x + 0.5, gh + 0.05, wp.y + 0.5); grp.add(ring);
    const bt = TEX.beam.clone(); bt.needsUpdate = true;
    const beamM = new THREE.MeshBasicMaterial({ map: bt, color: 0x9fd0ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.8, 3.4, 20, 1, true), beamM); beam.position.set(wp.x + 0.5, gh + 1.7, wp.y + 0.5); grp.add(beam);
    A.warps.push({ ring, ringM, beam, beamM, bt, wp });
  }
  // Brazier flames at the model's light anchor
  for (const b of m.braziers) {
    const gh = groundHm(m, b.x, b.y), ay = PROP_LIGHT.dng_brazier[1];
    const fl = flameSprite(3.2, 1.5, 0.5); fl.position.set(b.x, gh + ay + 0.28, b.y); fl.scale.set(0.5, 0.75, 1);
    const halo = glowSprite(linCol(0xff7a20), 0.3, 1.8, 1.8); halo.position.set(b.x, gh + ay + 0.2, b.y); A.halos.push({ s: halo, op: 0.3, ph: b.x * 3.1 + b.y, fl: 1 });
    A.flames.push({ s: fl, sx: 0.5, sy: 0.75 });
  }
  // Lamp-post lanterns: a soft glow (the emissive glass blooms; the light pool adds the rest)
  // (a wide faint outer halo reads as night glow in the lantern's own haze)
  for (const l of plan.lights) {
    const s = glowSprite(linCol(0xffc070), 0.4, 1.1, 1.1); s.position.set(l.x, l.h, l.z); A.halos.push({ s, op: 0.4, ph: l.x * 1.7 + l.z, fl: 0.25 });
    const o = glowSprite(linCol(0xffb060), 0.1, 3.2, 3.2); o.position.set(l.x, l.h - 0.15, l.z); A.halos.push({ s: o, op: R.exposure > 1.05 ? 0.2 : 0.1, ph: l.x * 1.7 + l.z, fl: 0.3 });
  }
  // Bounty boards (quest objects): a 3D notice board replaces the 2D overlay placeholder (model via props,
  // primitive mesh when the model can't load, see dress())
  const boards = plan.items.filter(it => it.board); A.boards = boards.length;
  const boardFallback = () => { if (PROPS.tpl.town_bounty_board || A.boardMesh) return; A.boardMesh = true; for (const it of boards) { const b = boardMesh(lam); b.position.set(it.x, it.y, it.z); b.rotation.y = it.r; grp.add(b); } };
  // Flickering ground light pools and drifting dust motes
  A.pools = buildPools(m, plan, R); if (A.pools) grp.add(A.pools);
  if (R.motes) { A.motes = buildMotes(R.motes); grp.add(A.motes); }
  // Anvil
  const metal = lam({ color: linCol(0x3a3430), specular: 0x333333, shininess: 30 });
  for (const o of m.objs) if (o.kind === 'anvil') { const g = new THREE.Group(); const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.3), metal); b1.position.y = 0.2; const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.22, 0.36), lam({ color: linCol(0x5a5654), specular: 0x444444, shininess: 40 })); b2.position.y = 0.5; b1.castShadow = b2.castShadow = true; g.add(b1, b2); g.position.set(o.x, groundHm(m, o.x, o.y), o.y); grp.add(g); }
  // Hel's gate
  for (const o of m.objs) if (o.kind === 'helgate') { try { for (const x of buildHelgate(o, m, lam, A, GB, FB)) grp.add(x); } catch (e) { console.warn('[gfx] helgate', e); } }
  // Lava: animated emissive shader (HDR cracks bloom)
  if (L.lava) { const lava = new THREE.Mesh(new THREE.PlaneGeometry(w + 90, h + 90), lavaMaterial()); lava.rotation.x = -Math.PI / 2; lava.position.set(w / 2, -0.5, h / 2); grp.add(lava); A.lava = lava; }
  // Water and the cloud sea (new tile types; any map may use them)
  try {
    const hasT = t => t !== undefined && m.t.some(v => v === t);
    if (hasT(T.WATER)) { A.water = buildWater(m, R.water || {}, R, m.hgtInfo); grp.add(A.water); }
    if (hasT(T.VOID)) { A.void = buildVoid(m, R.void || {}, R); grp.add(A.void); }
  } catch (e) { console.warn('[gfx] water / void', e); }
  // Heart of Yggdrasil
  if (m.heart) {
    const hx = m.heart.x, hz = m.heart.y, gh = groundHm(m, hx, hz), rootM = lam({ color: linCol(0x3a2618) });
    for (let i = 0; i < 7; i++) { const a = -Math.PI * 0.9 + i * Math.PI * 0.3; const pts = [new THREE.Vector3(hx, gh + 1.2, hz), new THREE.Vector3(hx + Math.cos(a) * 1.2, gh + 1.8, hz + Math.sin(a) * 0.8 - 0.4), new THREE.Vector3(hx + Math.cos(a) * 2.6, gh + 0.6, hz + Math.sin(a) * 1.6 - 0.6), new THREE.Vector3(hx + Math.cos(a) * 3.4, gh - 0.2, hz + Math.sin(a) * 2.2 - 0.8)]; solid(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, 0.22 - i * 0.01, 6), rootM); }
    const coreM = new THREE.MeshBasicMaterial({ color: 0x3a2014 }); const core = new THREE.Mesh(new THREE.SphereGeometry(0.75, 14, 10), coreM); core.position.set(hx, gh + 1.3, hz); grp.add(core);
    const glowS = glowSprite(linCol(0xffc060), 0, 5, 5); glowS.position.set(hx, gh + 1.3, hz);
    A.heart = { coreM, glowS };
  }
  // Volumetric-looking light shafts (additive crossed planes along the sun direction)
  if (R.shafts) { const sg = new THREE.Group(); grp.add(sg); A.shafts = buildShafts(m, R, sg); A.shaftGrp = sg; }
  GB.build(grp); FB.build(grp);
  // 3D props: instanced from the glTF templates once loaded (cached => immediate on revisits)
  const props = new THREE.Group(); grp.add(props); grp.userData.props = props; grp.userData.map = m;
  // Required models must all load (else the legacy primitives). The world dresses as soon as they are in; optional
  // ones (decor, LODs, the board model, kit variants) follow and trigger one rebuild; missing ones are skipped.
  const clearProps = () => { for (const o of [...props.children]) { props.remove(o); if (o.isInstancedMesh) o.geometry.dispose(); } };
  let have = null;
  const dress = (lq, final) => { clearProps(); buildProps(props, plan.items, lq); grp.userData.propLod = lq; have = new Set(Object.keys(PROPS.tpl)); if (final) boardFallback(); worldQuality(grp); PROPS.prefetch(); SHADOW.need = true; };
  const optional = lq => PROPS.manifest().then(() => { const { opt } = propIds(plan.items, lq); return Promise.all(opt.map(id => PROPS.load(id).catch(() => null))).then(() => opt); });
  const finish = lq => optional(lq).then(opt => { if (grp.userData.propLod !== lq) return; if (opt.some(id => PROPS.tpl[id] && !have.has(id))) dress(lq, true); else boardFallback(); });
  const lq0 = lodLow(), ids0 = propIds(plan.items, lq0);
  if (PROPS.man && PROPS.ready(ids0.req) && PROPS.ready(ids0.opt)) dress(lq0, true);
  else PROPS.ensure(ids0.req).then(() => { dress(lq0, false); finish(lq0); }, e => {
    console.warn('[props] models unavailable, using placeholders:', e && e.message || e); legacyProps(m, props, lam, A); grp.userData.legacy = true;
    optional(lq0).then(() => { buildProps(props, plan.items.filter(it => it.opt), lq0); boardFallback(); SHADOW.need = true; });
  });
  grp.userData.rebuildProps = lq => { if (grp.userData.legacy) return; grp.userData.propLod = lq; optional(lq).then(() => { if (grp.userData.propLod === lq) dress(lq, true); }); };
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
  worldQuality(curWorld);
  applyLook();
  GFX.world = { hgt: map.hgtInfo || null, shadow: SHADOW };
  if (map.anim && map.anim.boards && typeof QUEST_UI !== 'undefined') QUEST_UI.boards = false;   // the 3D board mesh replaces the overlay placeholder
  if (map.anim && map.anim.gate && typeof QUEST_UI !== 'undefined') QUEST_UI.helgate = false;   // Hel's gate is a mesh now
  SHADOW.need = true;
  // static light sources for the point-light pool
  LSRC.length = 0; const Lc = RL.lights;
  for (const b of map.braziers) LSRC.push({ x: b.x, y: b.y, h: groundH(b.x, b.y) + 1.35, c: linCol(Lc.brazier[0]), i: Lc.brazier[1], d: Lc.brazier[2], fl: 1, ph: b.x * 3.1 + b.y });
  if (map.way) LSRC.push({ x: map.way.x, y: map.way.y, h: groundH(map.way.x, map.way.y) + 3.2, c: linCol(Lc.way[0]), i: Lc.way[1], d: Lc.way[2], fl: 1, ph: 0.7, way: true });
  for (const wp of map.warps) LSRC.push({ x: wp.x + 0.5, y: wp.y + 0.5, h: groundH(wp.x + 0.5, wp.y + 0.5) + 1.2, c: linCol(Lc.warp[0]), i: Lc.warp[1], d: Lc.warp[2], fl: 0.3, ph: 2, warp: wp });
  const Ll = Lc.lamp || [0xffc070, 0.5, 4.5];
  for (const l of (map.propLights || [])) LSRC.push({ x: l.x, y: l.z, h: l.h, c: linCol(Ll[0]), i: Ll[1], d: Ll[2], fl: 0.12, ph: l.x * 1.7 + l.z });
  for (const o of map.objs) if (o.kind === 'helgate') LSRC.push({ x: o.x, y: o.y + 0.7, h: groundH(o.x, o.y) + 1.8, c: new THREE.Color(), i: 0, d: 7, fl: 0.1, ph: 3, gate: true });
  for (const l of (map.propDLights || [])) { let c; try { c = linCol(l.col); } catch (e) { c = linCol(0xffc070); } LSRC.push({ x: l.x, y: l.z, h: l.h, c, i: l.i, d: l.d, fl: 0.1, ph: l.x * 2.3 + l.z }); }
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
    case T.ICE: return T.ICE !== undefined ? [-1, 0.9, 0.9] : null;
    case T.CRYSTAL: return T.CRYSTAL !== undefined ? [-1, 1.4, 0.8] : null;
    case T.PROP: return T.PROP !== undefined ? [-1, 1.8, 0.8] : null;
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
  for (const l of (m.propLights || [])) splat(l.x, l.z, 2.6, warm, 0.25 * dim);
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
    let jx = 0, jz = 0;
    if (s.fl && !s.dyn) { I *= flick(s.fl, s.ph); if (s.fl >= 1) { jx = Math.sin(time * 7.1 + s.ph) * 0.05; jz = Math.cos(time * 8.3 + s.ph) * 0.05; } }
    if (s.gate) { const G = map.anim && map.anim.gate, k = G ? G.k : 0; I = 0.25 + 2.2 * k; l.color.copy(GATEU.uCol.value); l.intensity = I * flick(0.1, s.ph); l.distance = s.d; l.position.set(s.x, s.h, s.y); continue; }
    if (s.warp) { const locked = warpIsLocked(s.warp); _col.setRGB(locked ? 1 : s.c.r, locked ? 0.25 : s.c.g, locked ? 0.12 : s.c.b); l.color.copy(_col); } else l.color.copy(s.c);
    l.intensity = I; l.distance = s.d; l.position.set(s.x + jx, s.h, s.y + jz);
  }
}
const _sr = new THREE.Vector3(), _su = new THREE.Vector3(), _sf = new THREE.Vector3(), _st = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
// Aim a directional shadow at (x, y, z) with half-extent R, snapped to whole shadow texels so edges
// don't shimmer while the frustum follows the camera.
function aimShadow(l, R, x, y, z) {
  const d = SKY.sunDir, sc = l.shadow.camera;
  if (sc.right !== R) { sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.updateProjectionMatrix(); }
  _sf.copy(d).negate(); _sr.crossVectors(_sf, UP).normalize(); _su.crossVectors(_sr, _sf).normalize();
  _st.set(x, y, z); const tex = 2 * R / (l.shadow.mapSize.x || 1024);
  const a = Math.round(_st.dot(_sr) / tex) * tex, b = Math.round(_st.dot(_su) / tex) * tex, c = _st.dot(_sf);
  _st.copy(_sr).multiplyScalar(a).addScaledVector(_su, b).addScaledVector(_sf, c);
  l.target.position.copy(_st); l.position.copy(_st).addScaledVector(d, 70); l.target.updateMatrixWorld();
}
function updateSun() {
  const R = clamp(cam.dist * 0.5, 9, 30);
  if (!SHADOW.split) { aimShadow(sun, R, cam.tx, cam.th, cam.ty); return; }
  // static map: a margin wider than the view, re-centred (and re-rendered) only when the view drifts
  const Rs = R + SHADOW.margin, drift = Math.max(Math.abs(cam.tx - SHADOW.cx), Math.abs(cam.ty - SHADOW.cz)), bld = SHADOW.bld;
  if (SHADOW.R !== Rs || SHADOW.need || drift > SHADOW.margin * 0.95) { aimShadow(sun, Rs, cam.tx, cam.th, cam.ty); SHADOW.cx = cam.tx; SHADOW.cz = cam.ty; SHADOW.R = Rs; SHADOW.need = true; }
  else if (drift > SHADOW.margin * 0.5 && !(bld && bld.on)) {
    // spread over frames up to 2048 maps; bigger maps (ultra) re-render at once rather than hold a third 4096 target
    if (sun.shadow.mapSize.x <= 2048) SHADOW.pending = [cam.tx, cam.th, cam.ty, Rs];
    else if (drift > SHADOW.margin * 0.6) { aimShadow(sun, Rs, cam.tx, cam.th, cam.ty); SHADOW.cx = cam.tx; SHADOW.cz = cam.ty; SHADOW.need = true; }
  }
}
function updateAtmosphere() {
  const k = cam.dist / 40; if (scene.fog && RL) { scene.fog.near = RL.fog[0] * k; scene.fog.far = RL.fog[1] * k; LAVAU.uFog.value.set(scene.fog.near, scene.fog.far); }
  skyDome.position.copy(camera.position);
}
const _dbs = new THREE.Vector2();
// Sealed portal? (content's warpLocked(wp) returns the reason string or null; older builds only had the gate lock)
function warpIsLocked(wp) { try { if (typeof warpLocked === 'function') return !!warpLocked(wp); } catch (e) { /* content error: treat as open */ } return wp.lock === 'gate' && !(P && P.flags && P.flags.gate); }
// Fire flicker (shared by point lights, halos and ground pools): a few incommensurate sines
function flick(fl, ph) { return 1 - fl * (0.12 + 0.1 * Math.sin(time * 11 + ph) + 0.07 * Math.sin(time * 23.7 + ph * 2) + 0.05 * Math.sin(time * 5.3 + ph * 0.7)); }
function animateWorld(dt) {
  const A = map.anim; if (!A) return;
  for (const f of A.flames) { const k = 1 + Math.sin(time * 13 + f.sx * 40) * 0.08 + Math.sin(time * 7.3) * 0.05; f.s.scale.set(f.sx * (2 - k), f.sy * k, 1); }
  const lit = !!P.kindled[map.id];
  WIND.t.value = time; updateOccluder();
  if (A.way) {
    A.way.fl.visible = lit; A.way.halo.visible = lit;
    const rm = PROPS.mat('waystone', 'emissive_rune'); if (rm) rm.emissiveIntensity = lit ? PROP_EMIT.emissive_rune * (0.88 + 0.12 * Math.sin(time * 2.2)) : 0.05;
    if (A.way.rune) { if (lit) A.way.rune.material.color.setRGB(3.2, 1.3, 0.25); else A.way.rune.material.color.setRGB(0.1, 0.09, 0.08); } if (lit && Math.random() < 0.3) parts.push({ x: map.way.x + rand(-0.2, 0.2), y: map.way.y + rand(-0.2, 0.2), z: 115, vx: rand(-0.2, 0.2), vy: rand(-0.2, 0.2), vz: rand(30, 70), life: rand(0.8, 1.6), max: 1.6, col: '#ffa050', size: 2 }); }
  for (const w of A.warps) {
    const locked = warpIsLocked(w.wp);
    w.ring.rotation.z += dt * 0.8; if (locked) { w.ringM.color.setRGB(1.5, 0.22, 0.1); w.beamM.color.setRGB(0.7, 0.12, 0.05); } else { w.ringM.color.setRGB(0.3, 0.7, 1.5); w.beamM.color.setRGB(0.16, 0.38, 0.8); }
    w.bt.offset.y -= dt * 0.6; w.beam.rotation.y += dt * 0.5;
    w.beamM.opacity = 0.75 + Math.sin(time * 3) * 0.2;
    if (Math.random() < 0.5) parts.push({ x: w.wp.x + 0.5 + rand(-0.5, 0.5), y: w.wp.y + 0.5 + rand(-0.5, 0.5), z: 0, vx: 0, vy: 0, vz: rand(50, 110), life: rand(0.8, 1.4), max: 1.4, col: locked ? '#ff8a6a' : '#bfe4ff', size: 2.5, float: true });
  }
  SHAFTU.uT.value = time;
  if (A.halos) for (const h of A.halos) h.s.material.opacity = h.op * flick(h.fl, h.ph);
  POOLU.uT.value = time; POOLU.uWay.value = lit ? 1 : 0;
  if (A.motes) {
    MOTEU.uT.value = time; MOTEU.uC.value.set(cam.tx, cam.th, cam.ty); MOTEU.uScale.value = renderer.getDrawingBufferSize(_dbs).y * 0.5 * camera.projectionMatrix.elements[5];
    MOTEU.tShadow.value = SHADOW.tex; MOTEU.uShadowM.value.copy(sun.shadow.matrix); MOTEU.uLitOn.value = SHADOW.split && SHADOW.tex ? 1 : 0;
  }
  if (A.lava) LAVAU.uTime.value = time;
  WATERU.uT.value = time;
  if (A.groundEmis) { const k = 0.85 + 0.15 * Math.sin(time * 1.3); A.groundEmis.emissive.setRGB(1.5 * k, 0.62 * k, 0.25 * k); }
  if (A.heart) { const alive = P.flags.kingSlain; const k = alive ? 0.6 + Math.sin(time * 2) * 0.3 : 0.05; if (alive) A.heart.coreM.color.setRGB(0.4 + k * 2.6, 0.2 + k * 1.6, 0.05 + k * 0.4); else A.heart.coreM.color.setRGB(0.04, 0.015, 0.008); A.heart.glowS.material.opacity = alive ? k * 0.7 : 0; }
  if (A.gate) {
    const f = P.flags || {}, shut = !!f.gateShut, open = !!f.act2 && !shut, G = A.gate, tgt = open ? 1 : shut ? 0.28 : 0.05;
    G.k += (tgt - G.k) * Math.min(1, dt * 1.5); GATEU.uT.value = time; GATEU.uOpen.value = G.k;
    if (open || shut) GATEU.uCol.value.setRGB(0.45, 1.5, 0.65); else GATEU.uCol.value.setRGB(0.42, 0.36, 0.58);
    G.halo.material.opacity = (0.08 + 0.3 * G.k) * (0.85 + 0.15 * Math.sin(time * 1.3)); G.halo.material.color.copy(GATEU.uCol.value);
    G.fl.visible = G.lp.visible = shut; if (shut) { const k = 1 + Math.sin(time * 11) * 0.08; G.fl.scale.set(0.28 * (2 - k), 0.42 * k, 1); }
  }
  if (A.glowB) A.glowB.update(); if (A.flameB) A.flameB.update();
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
// proj(x, y, z[, out]): world tile coords + height -> [screenX, screenY, ndcZ]; pass `out` to avoid allocating
function proj(x, y, z, out) { _v3.set(x, z, y).project(camera); out = out || [0, 0, 0]; out[0] = (_v3.x * 0.5 + 0.5) * W; out[1] = (-_v3.y * 0.5 + 0.5) * H; out[2] = _v3.z; return out; }
const _w2s = [0, 0, 0];
function w2s(x, y) { const p = proj(x, y, groundH(x, y), _w2s); return [p[0], p[1]]; }
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
// (the boot models and the manifest start loading as soon as the loader exists, see PROPS.boot)
