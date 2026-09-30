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
/* ---------- Starting quality (perf round 3) ----------
   1. window.AOM_GFX_QUALITY (harness / embedder override), 2. the player's stored choice (localStorage 'aom-gfx', written
   by GFX.setQuality), 3. a quick GPU probe: the unmasked renderer string of a throwaway context (software GL -> low,
   phones / integrated laptop GPUs -> low / medium, discrete or Apple M -> high), device memory / cores. The adaptive
   controller (GFX.auto, below) then refines it from real frame times. Headless / automated browsers skip the probe
   and keep 'high' (deterministic screenshots and benchmarks). */
const GFX_ENV = (() => {
  const ua = navigator.userAgent || '', env = { headless: /HeadlessChrome/.test(ua) || navigator.webdriver === true, gpu: '', tier: null, source: 'default', quality: 'high' };
  let stored = null; try { stored = localStorage.getItem('aom-gfx'); } catch (e) { /* storage blocked */ }
  const valid = q => q === 'low' || q === 'medium' || q === 'high' || q === 'ultra';
  if (valid(window.AOM_GFX_QUALITY)) { env.quality = window.AOM_GFX_QUALITY; env.source = 'override'; return env; }
  if (valid(stored)) { env.quality = stored; env.source = 'stored'; return env; }
  if (env.headless) return env;
  try {
    const c = document.createElement('canvas'), o = { failIfMajorPerformanceCaveat: true, antialias: false, depth: false, stencil: false };
    let gl = c.getContext('webgl2', o) || c.getContext('webgl', o), caveat = false;
    if (!gl) { caveat = true; gl = c.getContext('webgl2') || c.getContext('webgl'); }
    if (gl) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      env.noHdr = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext ? !gl.getExtension('EXT_color_buffer_float') : !(gl.getExtension('OES_texture_half_float') && gl.getExtension('EXT_color_buffer_half_float'));
      env.gpu = String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
      const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
    }
    const g = env.gpu, mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua) && !/Apple M\d/.test(g));
    const mem = navigator.deviceMemory || 8, cores = navigator.hardwareConcurrency || 8;
    let t;
    if (caveat || /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(g)) t = 'low';
    else if (mobile) t = /Adreno \(TM\) [6-9]\d\d|Apple GPU|Apple A1[5-9]|Immortalis|Xclipse/i.test(g) ? 'medium' : 'low';
    else if (/Intel/i.test(g)) t = /Arc/i.test(g) ? 'high' : 'medium';
    else if (/Radeon\(TM\) (Graphics|Vega)|Radeon Vega|Vega \d\b|Radeon \d{3}M\b/i.test(g)) t = 'medium';
    else if (/MX\s?\d{3}|GeForce (9|7)\d\d[M ]|Quadro [KP]\d{3,4}M?\b/i.test(g)) t = 'medium';
    else t = 'high';
    if ((mem <= 2 || cores <= 2) && t !== 'low') t = 'low'; else if (mem <= 4 && t === 'high') t = 'medium';
    env.tier = t; env.quality = t; env.source = 'probe';
  } catch (e) { /* probe failed: keep the default */ }
  return env;
})();
// Canvas MSAA only when the starting preset draws straight to the canvas (low); with post-processing the scene is
// multisampled in its own target and the canvas only receives the final full-screen pass (identical pixels, and no
// 4x colour+depth canvas buffers: ~66 MB at 1080p).
const renderer = new THREE.WebGLRenderer({ canvas: glc, antialias: GFX_ENV.quality === 'low' || !!GFX_ENV.noHdr, powerPreference: 'high-performance' });
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
   GFX.quality: 'low' | 'medium' | 'high' | 'ultra' (the base preset: GFX_ENV above picks the start; GFX.setQuality(q)
   stores the player's choice in localStorage 'aom-gfx').
   low = genuinely cheap (phones, software GL): no post, no shadows / SSAO / volumetrics, LOD trees, no grass or far
   props, 2 point lights, pixel ratio 1, canvas MSAA. medium = laptop default: post (bloom, 1-level DOF, mist), 1024
   shadows, no SSAO / volumetrics, LOD trees, light grass. high / ultra = the full HD-2D look.
   World: grass = 3D grass tufts per open grass tile (0 = none); smallShadow = small props
   (barrels, rocks, bones...) cast sun shadows; detail = ground shader level (0 colour
   detail only, 1 + normal detail, 2 + macro variation); farProps = the wilderness props
   outside the playable map. The props on the map are always on.
   Post (gfx-post.js): msaa = scene MSAA samples; mist = depth-based ground mist / height fog;
   heat = lava heat shimmer; ao = half-res SSAO (aoN taps); vol = ray-marched volumetric sun/moon
   light through the cached static shadow map (volN steps); pools = flickering ground light pools.
   wx = weather / ambient-life particle count multiplier (round 5, see WXS; drawRange only, no rebuild).
   Shadows: the sun's static world shadows are cached (re-rendered only when the view drifts or the
   world changes, see SHADOW); a second zero-intensity light re-renders only the sprite casters.
   Adaptive quality (GFX.auto, default on in a real browser): GFX_STEPS are levels below the base preset (render scale
   first, then SSAO, volumetrics, shadow size, grass...); the controller (AUTO) moves between them from real frame
   times with hysteresis. GFX.preset is the effective preset (base + level); GFX.level / GFX.scale expose the state. */
const GFX_PRESETS = {
  low:    { pr: 1,   post: false, shadow: 0,    lights: 2, bloomMips: 0, dof: 0, msaa: 0, grass: 0, smallShadow: false, detail: 0, farProps: false, mist: false, heat: false, ao: false, vol: false, pools: false, wx: 0.35 },
  medium: { pr: 1,   post: true,  shadow: 1024, lights: 4, bloomMips: 4, dof: 1, msaa: 2, grass: 1.5, smallShadow: false, detail: 1, farProps: true, mist: true, heat: true, ao: false, vol: false, pools: true, wx: 0.6 },
  high:   { pr: 1.5, post: true,  shadow: 2048, lights: 6, bloomMips: 4, dof: 2, msaa: 2, grass: 3, smallShadow: true,  detail: 2, farProps: true, mist: true, heat: true, ao: true, aoN: 8, vol: true, volN: 10, pools: true, wx: 1 },
  ultra:  { pr: 2,   post: true,  shadow: 4096, lights: 8, bloomMips: 6, dof: 3, msaa: 4, grass: 7, smallShadow: true,  detail: 2, farProps: true, mist: true, heat: true, ao: true, aoN: 12, vol: true, volN: 16, pools: true, wx: 1.4 },
};
// Adaptive levels below the base preset. None of them changes a material program (no recompiles): scale / msaa / DOF /
// bloom only resize post targets, ao / vol pick another post variant (precompiled at map entry), shadow size reallocates
// the sun's map, grass rebuilds the tufts. Levels that change nothing for a preset are skipped (see gfxLadder).
const GFX_STEPS = [
  {},
  { scale: 0.85 },
  { scale: 0.75 },
  { scale: 0.75, ao: false },
  { scale: 0.75, ao: false, vol: false },
  { scale: 0.7, ao: false, vol: false, shadowMax: 1024, grassK: 0.5, wxK: 0.7 },
  { scale: 0.6, ao: false, vol: false, shadowMax: 1024, grassK: 0, smallShadow: false, msaa: 0, wxK: 0.5 },
  { scale: 0.5, ao: false, vol: false, shadowMax: 1024, grassK: 0, smallShadow: false, msaa: 0, dofMax: 1, bloomMax: 3, wxK: 0.4 },
];
function gfxEffective(q, st) {
  const o = Object.assign({}, GFX_PRESETS[q], (typeof GFX !== 'undefined' && GFX.override) || null);
  st = st || {}; o.scale = Math.min(st.scale || 1, o.scale || 1);   // (an override may force a scale: A/B shots)
  if (st.ao === false) o.ao = false;
  if (st.vol === false) o.vol = false;
  if (st.shadowMax && o.shadow > st.shadowMax) o.shadow = st.shadowMax;
  if (st.grassK !== undefined) o.grass *= st.grassK;
  if (st.wxK !== undefined) o.wx *= st.wxK;
  if (st.smallShadow === false) o.smallShadow = false;
  if (st.msaa === 0) o.msaa = 0;
  if (st.dofMax !== undefined) o.dof = Math.min(o.dof, st.dofMax);
  if (st.bloomMax !== undefined) o.bloomMips = Math.min(o.bloomMips, st.bloomMax);
  return o;
}
function gfxLadder(q) {
  const out = []; let prev = '';
  for (const st of GFX_STEPS) { const k = JSON.stringify(gfxEffective(q, st)); if (k !== prev) { out.push(st); prev = k; } }
  return out;
}
let GFX_EPOCH = 1;                    // bumped when material programs must recompile
const GFX = {
  quality: GFX_ENV.quality, env: GFX_ENV, sun, composer: null, preset: null, override: null,
  auto: window.AOM_GFX_AUTO === true || (window.AOM_GFX_AUTO !== false && !GFX_ENV.headless),
  level: 0, scale: 1, ladder: null, fps: 0, frameMs: 0,
  hooks: [],                          // fn(q) called after a quality change (gfx-post registers one)
  worldHooks: [],                     // fn(freedMapId, residentMapIds) after a world left the LRU (e.g. release its sprite sheets)
  prefetchHooks: [],                  // fn(neighbourMapId, map) in idle time after a map is entered (e.g. prefetch its sprite sheets)
  // q: preset name; transient = chosen by the adaptive controller (not stored as the player's choice)
  setQuality(q, transient) {
    if (!GFX_PRESETS[q]) return GFX.quality;
    GFX.quality = q; GFX.ladder = gfxLadder(q); GFX.level = 0; GFX.preset = gfxEffective(q, GFX.ladder[0]); GFX.scale = 1;
    if (!transient) { GFX.env.source = 'player'; try { localStorage.setItem('aom-gfx', q); } catch (e) { /* storage blocked */ } }
    applyQuality();
    for (const f of GFX.hooks) try { f(q); } catch (e) { console.warn('[gfx] hook', e); }
    AUTO.reset(1000);
    return q;
  },
  // adaptive level (0 = the full preset); called by the controller, usable from the console
  setLevel(lv) { gfxSetLevel(lv); return GFX.level; },
  autoInfo() { return { auto: GFX.auto, quality: GFX.quality, level: GFX.level, levels: GFX.ladder.length, scale: GFX.scale, fps: GFX.fps, frameMs: GFX.frameMs, upAfterS: AUTO.upAfter, source: GFX.env.source, gpu: GFX.env.gpu }; },
  // Make a mesh with an alpha-tested map cast a correctly cut-out shadow (r128's
  // default depth material ignores alphaTest). The depth material follows mesh.material.map.
  makeCaster(mesh, alphaTest) {
    const dm = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaTest: alphaTest || 0.5 });
    Object.defineProperty(dm, 'map', { get: () => mesh.material && mesh.material.map || null, set() {} });
    mesh.customDepthMaterial = dm; mesh.castShadow = true; return mesh;
  },
};
GFX.ladder = gfxLadder(GFX.quality); GFX.preset = gfxEffective(GFX.quality, GFX.ladder[0]);
const PL = [];                        // point-light pool (fixed size per quality: no per-frame recompiles)
function gfxPixelRatio(Q) { return Math.min(Q.pr, window.devicePixelRatio || 1) * (Q.post ? 1 : Q.scale || 1); }
function applyQuality() {
  const Q = GFX.preset;
  renderer.setPixelRatio(gfxPixelRatio(Q)); gfxCanvasFilter();
  const on = Q.shadow > 0, split = on && SHADOW.ok;
  renderer.shadowMap.enabled = on; sun.castShadow = on;
  if (!on) {   // shadows off (low): free the sun's map, the static cache and the builder's map (32-80 MB at high / ultra)
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    if (SHADOW.rt) { SHADOW.rt.dispose(); SHADOW.rt = null; SHADOW.tex = null; }
    const B = SHADOW.bld; if (B && B.light.shadow.map) { B.light.shadow.map.dispose(); B.light.shadow.map = null; B.on = false; }
  }
  if (on && sun.shadow.mapSize.x !== Q.shadow) { sun.shadow.mapSize.set(Q.shadow, Q.shadow); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  SHADOW.split = split; sun.shadow.autoUpdate = !split; SHADOW.need = true;
  while (PL.length > Q.lights) scene.remove(PL.pop());
  while (PL.length < Q.lights) { const l = new THREE.PointLight(0xffa050, 0, 7, 2); PL.push(l); scene.add(l); }
  renderer.toneMapping = Q.post ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
  GFX_EPOCH++; refreshMaterials(scene);
  if (typeof map !== 'undefined' && map && RL) applyLook();
  if (curWorld) worldQuality(curWorld);
}
// Without post the canvas itself is scaled (browser upscale): nearest at 2x so pixels stay whole, else bilinear.
function gfxCanvasFilter() { const Q = GFX.preset; glc.style.imageRendering = !Q.post && Q.scale <= 0.51 ? 'pixelated' : ''; }
function gfxSetLevel(lv) {
  lv = clamp(lv | 0, 0, GFX.ladder.length - 1); if (lv === GFX.level) return;
  const old = GFX.preset, Q = gfxEffective(GFX.quality, GFX.ladder[lv]);
  GFX.level = lv; GFX.preset = Q; GFX.scale = Q.scale;
  if (gfxPixelRatio(Q) !== gfxPixelRatio(old)) renderer.setPixelRatio(gfxPixelRatio(Q));
  gfxCanvasFilter();
  if (Q.shadow > 0 && sun.shadow.mapSize.x !== Q.shadow) { sun.shadow.mapSize.set(Q.shadow, Q.shadow); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } SHADOW.need = true; }
  if (GFX.composer) GFX.composer.configure();
  if (curWorld && (Q.grass !== old.grass || Q.smallShadow !== old.smallShadow || Q.vol !== old.vol)) worldQuality(curWorld);
  for (const f of GFX.hooks) try { f(GFX.quality, lv); } catch (e) { console.warn('[gfx] hook', e); }
}
/* Adaptive quality controller. Samples the interval between presented frames from the game's own
   requestAnimationFrame timestamps (frames drawn outside rAF, e.g. by the perf / screenshot harnesses, are ignored).
   Every ~0.75 s window: median > 18.3 ms (< ~55 fps) twice in a row -> one level down (two when > 28 ms); median
   < 17.3 ms with p90 < 20 ms for `upAfter` seconds -> one level up. An up-step that fails within 8 s doubles upAfter
   (5 s -> 64 s max), so a machine at the edge settles instead of oscillating. Samples are ignored for 1 s after a
   change and 2 s after a map entry (loading hitches). At the bottom of the ladder, still slow for 2 more windows while
   the base preset came from the probe: the base preset drops one step (not stored as the player's choice). */
const AUTO = { last: 0, hold: 0, samples: [], slow: 0, good: 0, upAfter: 5, lastUp: -1e9, inRaf: false, rafT: 0, bottom: 0,
  reset(ms) { AUTO.samples.length = 0; AUTO.slow = 0; AUTO.good = 0; AUTO.bottom = 0; AUTO.hold = Math.max(AUTO.hold, Math.max(performance.now(), AUTO.rafT) + (ms || 0)); } };
(() => {
  const raf = window.requestAnimationFrame; if (typeof raf !== 'function') return;
  window.requestAnimationFrame = function (cb) { return raf.call(window, t => { AUTO.inRaf = true; AUTO.rafT = t; try { cb(t); } finally { AUTO.inRaf = false; } }); };
})();
const _autoS = [];
function autoFrame() {
  if (!AUTO.inRaf) return;
  const t = AUTO.rafT; let d = t - AUTO.last; AUTO.last = t;
  if (d <= 0 || d > 1000) { AUTO.samples.length = 0; return; }   // first frame, hidden tab, loading stall: restart the window
  if (d > 250) d = 250;                                          // (a single long frame is an outlier for the median)
  GFX.frameMs = GFX.frameMs ? GFX.frameMs + (d - GFX.frameMs) * 0.05 : d; GFX.fps = Math.round(1000 / GFX.frameMs);
  if (!GFX.auto || t < AUTO.hold || GLOAD.pending) { AUTO.samples.length = 0; return; }
  const S = AUTO.samples; S.push(d); if (S.length < 45) return;
  let span = 0; _autoS.length = 0; for (const v of S) { span += v; _autoS.push(v); } _autoS.sort((a, b) => a - b);
  const med = _autoS[_autoS.length >> 1], p90 = _autoS[Math.floor(_autoS.length * 0.9)]; S.length = 0;
  if (med > 18.3) {
    AUTO.good = 0; AUTO.slow++;
    if (AUTO.slow >= 2 || med > 28) {
      AUTO.slow = 0;
      if (t - AUTO.lastUp < 8000) AUTO.upAfter = Math.min(64, AUTO.upAfter * 2);   // the last up-step did not hold
      if (GFX.level < GFX.ladder.length - 1) { gfxSetLevel(GFX.level + (med > 28 ? 2 : 1)); AUTO.reset(1000); }
      else if (++AUTO.bottom >= 2 && GFX.env.source !== 'player' && GFX.env.source !== 'override' && GFX.quality !== 'low') {
        const q = { ultra: 'high', high: 'medium', medium: 'low' }[GFX.quality]; GFX.env.source = 'auto';
        GFX.setQuality(q, true); gfxSetLevel(GFX.ladder.length - 1); AUTO.reset(1500);
      }
    }
  } else if (med < 17.3 && p90 < 20) {
    AUTO.slow = 0; AUTO.bottom = 0; AUTO.good += span;
    if (GFX.level > 0 && AUTO.good >= AUTO.upAfter * 1000) { gfxSetLevel(GFX.level - 1); AUTO.lastUp = t; AUTO.reset(1000); }
  } else AUTO.slow = 0;
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
  const smRender = function (lights, sc, c) {
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
  // cycle 9: sectored prop groups of big maps draw every instance in the shadow passes (see sectorUpdate)
  sm.render = function (lights, sc, c) { const sw = sectorShadow(true); try { return smRender.call(this, lights, sc, c); } finally { if (sw) sectorShadow(false); } };
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
// Base looks for map families whose data may arrive before (or without) render data: every map id matching the key
// (helheim, helheim_deep_<n>) starts from this look instead of one derived from MAPDEFS.look; render data refines it.
// Helheim (design/helheim.md): ash-grey haze under a black sun, cold pale light, soul-green fires and lanterns, the
// frozen river Gjoll (water.frozen), falling ash and drifting soul wisps (WX_MAPS), eternal twilight (tod: false).
const RLOOK_BASE = {
  helheim: {
    exposure: 1.0, sky: [0x0b0c0e, 0x3e4242], haze: 0x4e5351, fog: [32, 120],
    sunDir: [-0.4, 1.15, 0.32], sun: [0xc4d4cc, 0.5], hemi: [0x8a9894, 0x16181a, 0.44], torch: [0x9affc8, 0.45, 8],
    lights: { brazier: [0x7affb8, 1.5, 7], way: [0xffa048, 1.6, 9], warp: [0x7ab8ff, 1.4, 6], heart: [0xffc060, 3, 10], lamp: [0x8affc0, 0.9, 5] },
    flame: [1.1, 3.0, 1.7], flameHalo: 0x5aff9a,
    bloom: { threshold: 1.1, knee: 0.4, strength: 0.62 },
    grade: { lift: [0.012, 0.016, 0.018], gamma: [1, 1.01, 1], gain: [0.98, 1.02, 1.0], sat: 0.72, contrast: 1.1, shadowTint: [-0.006, 0.01, 0.008], highTint: [0.0, 0.012, 0.006] },
    vignette: 0.46, grain: 0.03, dof: { band: 0.1, ramp: 0.4, top: 0.85, bottom: 0.6 },
    lt: { amb: [0.5, 0.56, 0.55], sun: [0.2, 0.23, 0.21] },
    mist: { col: 0x9aa8a2, k: 1, amb: 0.14, lit: 1.4, amt: 0.5, h: 0.6, max: 0.3, scale: 0.05, wind: [0.02, 0.008], scatter: 0.45 },
    hfog: { col: 0x5e6664, k: 0.6, amt: 0.14, h: 1.2, max: 0.3 },
    vol: { col: 0xc8ffe0, k: 0.22, dens: 0.05, ext: 1, top: 4, scale: 0.05, wind: [0.015, 0.006], noise: 0.8 },
    water: { color: 0x243234, deep: 0x0a1214, foam: 0xdce8e4, ice: 0x8a9ea0, level: -0.45, frozen: 0.8, blackSun: true },
    tod: false,
  },
};
const rlookBase = id => { for (const k in RLOOK_BASE) if (id === k || id.startsWith(k + '_')) return RLOOK_BASE[k]; return null; };
/* ---------- Cycle 9 (world expansion, design/world-expansion.md): interiors and caves ----------
   m.kind (core.js, from render.kind): 'interior' | 'cave' | null. The look of a kind map starts from RLOOK_KIND (tuned
   below from render.interior / render.cave), then MAPDEFS.render refines it like any other map. Both kinds are
   time-locked (tod false) with no sky, sun (a faint fill only) or weather; caves have their own ambient particles.
   render.interior = { floor: 'plank'|'stone'|'flag'|'straw', wall: 'timber'|'stone'|'dwarf'|'hall', trim: '#hex' | 0xhex,
     ceilingFade: true, windows: [[x, y], ...] (wall tiles with a window: pane + light shaft), beams: false (ceiling beams across the room) }
   render.cave = { rock: 'basalt'|'ice'|'mud'|'crystal'|'mine', wet: 0..1, glow: 'mushroom'|'crystal'|null,
     torch: 1 (hero torch radius / intensity scale), drips: 0..1, dust: 0..1, walls: true (procedural rock walls; false
     = content draws T.WALL itself with props.wall models) } */
function mapKind(m) {
  if (!m) return '';
  const k = m.kind !== undefined && m.kind !== null ? m.kind : (m.d && m.d.render && m.d.render.kind) || (m.d && (m.d.gen === 'cave' || m.d.gen === 'interior') ? m.d.gen : null);
  return k === 'cave' || k === 'interior' ? k : '';
}
// Maps above the old 64 x 64: sector culling, capped ground canvas, weighted world LRU (a 64 x 64 map is untouched).
const isBig = m => !!m && (m.w > 64 || m.h > 64);
const INT_FLOOR = {
  plank: { detail: 'plank', g1: [104, 70, 42], g2: [150, 108, 66], nrm: 1.1 },
  stone: { detail: 'flag', g1: [98, 94, 90], g2: [140, 134, 126], nrm: 1.25 },
  flag: { detail: 'flag', g1: [112, 100, 84], g2: [156, 142, 120], nrm: 1.25 },
  straw: { detail: 'straw', g1: [138, 112, 60], g2: [190, 160, 94], nrm: 0.9 },
};
// wall: height, stub height when cut away (camera side), texture kind, default trim colour
// (2.5 = the art kit's interior_wall_* / cave_wall* blocks, so procedural walls and kit pieces line up)
const INT_WALL = { timber: { h: 2.5, stub: 0.5, trim: 0x4a2c16 }, stone: { h: 2.5, stub: 0.5, trim: 0x5a544c }, dwarf: { h: 2.5, stub: 0.5, trim: 0xc89a3a }, hall: { h: 2.5, stub: 0.5, trim: 0x3a2412 } };
function interiorCfg(m) {
  const I = (m.d && m.d.render && m.d.render.interior) || {};
  let trim = null; try { if (I.trim !== undefined && I.trim !== null) trim = new THREE.Color(I.trim).getHex(); } catch (e) { trim = null; }
  const wall = INT_WALL[I.wall] ? I.wall : 'timber';
  return { floor: INT_FLOOR[I.floor] ? I.floor : 'plank', wall, trim: trim === null ? INT_WALL[wall].trim : trim, ceilingFade: I.ceilingFade !== false,
    windows: Array.isArray(I.windows) ? I.windows.filter(p => Array.isArray(p) && p.length >= 2 && isFinite(p[0]) && isFinite(p[1])) : [], beams: !!I.beams };
}
// cave rock palettes: ground (sRGB 0-255), rock mass colours (low / high), detail layer, fog / mist / glow tints
const CAVE_ROCK = {
  basalt: { g1: [58, 56, 60], g2: [98, 94, 92], a: 0x34323a, b: 0x6a6660, detail: 'rock', floor: 'rock', haze: 0x06080c, mist: 0x6c7890, glow: 0x9a7aff, h: 2.8 },
  ice: { g1: [96, 120, 140], g2: [150, 180, 202], a: 0x3c5a74, b: 0xa8c8e0, detail: 'rock', floor: 'snow', haze: 0x0a1420, mist: 0x8ab0d0, glow: 0x8ad8ff, h: 2.5, spec: 0.8 },
  mud: { g1: [56, 44, 30], g2: [94, 76, 52], a: 0x3a2c1e, b: 0x6e5a40, detail: 'mud', floor: 'mud', haze: 0x0a0806, mist: 0x7a7060, glow: 0xa8f070, h: 2.1 },
  crystal: { g1: [50, 42, 66], g2: [86, 74, 110], a: 0x2e2840, b: 0x5e5280, detail: 'rock', floor: 'rock', haze: 0x0a0612, mist: 0x8a78b8, glow: 0xc08aff, h: 2.7, veins: 1 },
  mine: { g1: [72, 60, 46], g2: [108, 92, 72], a: 0x463a2e, b: 0x7a6a56, detail: 'rock', floor: 'dirt', haze: 0x0a0806, mist: 0x8a7a66, glow: 0xffb060, h: 2.4 },
};
function caveCfg(m) {
  const C = (m.d && m.d.render && m.d.render.cave) || {}, n = (v, d, a, b) => clamp(isFinite(v) && v !== null && v !== '' ? +v : d, a, b);
  return { rock: CAVE_ROCK[C.rock] ? C.rock : 'basalt', wet: n(C.wet, 0.5, 0, 1), glow: C.glow === 'mushroom' || C.glow === 'crystal' ? C.glow : null,
    torch: n(C.torch, 1, 0.4, 2), drips: n(C.drips, 0.75, 0, 2), dust: n(C.dust, 0.6, 0, 2), walls: C.walls !== false };
}
// Base looks (RLOOK units). Interiors: warm bounce from the fires, a faint window fill (the shadow-casting "sun"), soft
// SSAO, a warm grade with a stronger vignette. Caves: near-black cool ambient, the hero's torch, echo mist, drips.
const RLOOK_KIND = {
  interior: {
    exposure: 1.0, sky: [0x0c0907, 0x16100b], haze: 0x0e0a07, fog: [36, 96],
    sunDir: [-0.42, 1.25, 0.6], sun: [0xffe8c8, 0.3], hemi: [0xffd6a4, 0x3c2818, 0.5], torch: [0xffb070, 0, 9],
    lights: { brazier: [0xff9a48, 1.5, 7], way: [0xffa048, 1.6, 9], warp: [0xffd8a0, 0.9, 5], heart: [0xffc060, 2, 10], lamp: [0xffc070, 1.0, 5.5] },
    bloom: { threshold: 1.02, knee: 0.45, strength: 0.72 },
    grade: { lift: [0.022, 0.014, 0.006], gamma: [1, 1, 0.98], gain: [1.06, 1.0, 0.9], sat: 1.08, contrast: 1.08, shadowTint: [0.014, 0.004, -0.004], highTint: [0.03, 0.014, -0.012] },
    vignette: 0.56, grain: 0.028, dof: { band: 0.12, ramp: 0.42, top: 0.7, bottom: 0.5 },
    lt: { amb: [0.66, 0.56, 0.46], sun: [0.16, 0.14, 0.1] },
    motes: { n: 320, col: 0xffdcaa, size: 0.04, box: 16, hmin: 0.25, hmax: 2.8, lit: false, k: 0.55 },
    ao: 1.25, aoR: 1.15, spec: [0x1c1612, 18], tod: false, weather: { amb: [], wind: [0.03, 0.01] },
  },
  cave: {
    exposure: 1.18, sky: [0x020304, 0x05070a], haze: 0x05070a, fog: [38, 92],
    sunDir: [-0.25, 1.35, 0.35], sun: [0x8aa0c8, 0.07], hemi: [0x7c8cac, 0x1e1c1a, 0.68], torch: [0xffae68, 2.6, 12.5],
    lights: { brazier: [0xff8a38, 2.4, 8], way: [0xffa048, 2.6, 10], warp: [0x9ac8ff, 1.6, 6.5], heart: [0xffc060, 3, 10], lamp: [0xffb060, 1.6, 6.5] },
    bloom: { threshold: 0.92, knee: 0.45, strength: 0.85 },
    grade: { lift: [0.006, 0.01, 0.022], gamma: [1, 1, 1.02], gain: [1.04, 1.0, 0.96], sat: 1.02, contrast: 1.1, shadowTint: [-0.008, 0.002, 0.03], highTint: [0.03, 0.012, -0.012] },
    vignette: 0.62, grain: 0.032, dof: { band: 0.12, ramp: 0.42, top: 0.75, bottom: 0.55 },
    lt: { amb: [0.4, 0.43, 0.52], sun: [0.02, 0.02, 0.03] },
    mist: { col: 0x6c7890, k: 1, amb: 0.08, lit: 1.9, amt: 0.42, h: 0.55, max: 0.34, scale: 0.06, wind: [0.012, 0.006], scatter: 0.65 },
    hfog: { col: 0x0a0e14, k: 1, amt: 0.1, h: 1.6, max: 0.25 },
    water: { color: 0x22404e, deep: 0x0c1c26, foam: 0x5a7a88, level: -0.45, still: 1 },
    ao: 1.0, spec: [0x202428, 30], tod: false, weather: { amb: [], wind: [0.02, 0.01] },
  },
};
// The kind look of one map (colours from its render.interior / render.cave), before MAPDEFS.render refines it.
function kindLook(m, kind) {
  const R = Object.assign({}, RLOOK_KIND[kind]);
  if (kind === 'interior') {
    const I = interiorCfg(m), F = INT_FLOOR[I.floor];
    R.paint = { g1: F.g1, g2: F.g2 }; R.floorD = F.detail; R.floorN = F.nrm;
    if (I.wall === 'dwarf') Object.assign(R, { hemi: [0xffc890, 0x2a1c14, 0.44], lt: { amb: [0.6, 0.5, 0.42], sun: [0.14, 0.12, 0.09] } });
    else if (I.wall === 'stone') Object.assign(R, { hemi: [0xf0d8b8, 0x30281e, 0.48] });
  } else {
    const C = caveCfg(m), K = CAVE_ROCK[C.rock];
    R.paint = { g1: K.g1, g2: K.g2 }; R.floorD = K.floor; R.floorN = 0.8; R.haze = K.haze; R.sky = [K.haze, K.haze];
    R.mist = Object.assign({}, R.mist, { col: K.mist }); R.torch = [R.torch[0], R.torch[1] * C.torch, R.torch[2] * Math.sqrt(C.torch)];
    if (C.rock === 'ice') Object.assign(R, { hemi: [0x8ab0d8, 0x141c24, 0.4], lt: { amb: [0.38, 0.44, 0.56], sun: [0.02, 0.03, 0.04] }, spec: [0x445460, 60] });
  }
  return R;
}
// Maps without an RLOOK entry: MAPDEFS[id].render (data hook for new maps), else derived from MAPDEFS.look.
// render = { sky:[top,horizon], fog:[color,near,far], exposure, sun:[color,intensity,dir], hemi:[sky,ground,int],
//   bloom:[threshold,strength], grade:{...}, mist, hfog, vol, heat, shafts, motes, lights, trees, flame, flameHalo,
//   weather, tod, night, dusk } (all optional; weather / tod / night / dusk: see WXS)
const RLOOK_GEN = {};
function rlookFor(m) {
  if (RLOOK[m.id]) return RLOOK[m.id];
  if (RLOOK_GEN[m.id]) return RLOOK_GEN[m.id];
  const L = (m.d && m.d.look) || {}, kind = mapKind(m), fam = kind ? kindLook(m, kind) : rlookBase(m.id), base = fam || RLOOK.ashen_fields, Rd = m.d && m.d.render, dark = m.d && m.d.gen === 'dungeon';
  let R;
  try {
    if (fam) R = Object.assign({}, fam);
    else R = Object.assign({}, base, { haze: L.fog !== undefined ? L.fog : base.haze, sky: [L.fog !== undefined ? L.fog : base.sky[0], L.fog !== undefined ? L.fog : base.sky[1]],
      hemi: L.hemi ? [L.hemi[0], L.hemi[1], L.hemi[2] * 0.8] : base.hemi, sun: L.sun ? [L.sun[0], L.sun[1] * 3] : base.sun, torch: [0xffa860, L.torch || 0, 10], mist: null, hfog: null });
    if (dark && fam && !kind) Object.assign(R, { exposure: (fam.exposure || 1) * 1.08, fog: [30, 92], torch: [fam.torch[0], Math.max(1, fam.torch[1]), 9], lt: { amb: fam.lt.amb.map(v => v * 0.8), sun: fam.lt.sun.map(v => v * 0.4) } });
    else if (dark && !kind) Object.assign(R, { exposure: 1.1, lights: RLOOK.gloamheim.lights, bloom: RLOOK.gloamheim.bloom, lt: RLOOK.gloamheim.lt });
    if (Rd) {
      const num = (v, d) => typeof v === 'number' && isFinite(v) ? v : d;
      if (Rd.sky) R.sky = [Rd.sky[0], Rd.sky[1] !== undefined ? Rd.sky[1] : Rd.sky[0]];
      if (Rd.fog) { R.haze = Rd.fog[0]; R.fog = [num(Rd.fog[1], base.fog[0]), num(Rd.fog[2], base.fog[1])]; if (!Rd.sky) R.sky = [Rd.fog[0], Rd.fog[0]]; }
      R.exposure = num(Rd.exposure, R.exposure);
      if (Rd.sun) { R.sun = [Rd.sun[0], num(Rd.sun[1], base.sun[1])]; if (Rd.sun[2] && Rd.sun[2].length === 3) R.sunDir = Rd.sun[2].slice(); }
      if (Rd.hemi) R.hemi = [Rd.hemi[0], Rd.hemi[1], num(Rd.hemi[2], base.hemi[2])];
      if (Rd.bloom) R.bloom = { threshold: num(Rd.bloom[0], base.bloom.threshold), knee: 0.4, strength: num(Rd.bloom[1], base.bloom.strength) };
      if (Rd.grade) R.grade = Object.assign({}, base.grade, Rd.grade);
      for (const k of ['mist', 'hfog', 'vol', 'heat', 'shafts', 'motes', 'lights', 'dof', 'vignette', 'grain', 'lt', 'spec', 'paint', 'ao', 'water', 'void', 'torch', 'flame', 'flameHalo', 'weather', 'tod', 'night', 'dusk']) if (Rd[k] !== undefined) R[k] = Rd[k];
      // cycle 9, caves: the hero's torch is the player's view: content's render.torch can make it bigger, never weaker than
      // the graphics default (scaled by render.cave.torch)
      if (kind === 'cave' && Rd.torch && fam.torch) R.torch = [R.torch[0], Math.max(num(R.torch[1], 0), fam.torch[1]), Math.max(num(R.torch[2], 0), fam.torch[2])];
      // (and its darkness comes from the light, not the fog: the fog starts beyond the camera, else it greys the hero's own circle)
      if (kind && R.fog) R.fog = [Math.max(R.fog[0], 36), Math.max(R.fog[1], Math.max(R.fog[0], 36) + 40)];
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
/* Squad mode: the hero the player controls. core's withHero(h, fn) swaps P to a companion while that companion acts;
   rendering runs outside it, but the camera, the controlled-hero ring, the prop occluder and the focus band read
   leadHero() when core defines it, falling back to P. */
function ctrlHero() { if (typeof leadHero === 'function') { const h = leadHero(); if (h) return h; } return P; }
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
const DETAIL_KINDS = { grass: [256, 2, 0.035], dirt: [512, 4, 0.05], cobble: [512, 4, 0.075], flag: [512, 4, 0.06], ash: [512, 4, 0.03], basalt: [512, 4, 0.07], snow: [256, 4, 0.045], mud: [512, 4, 0.05], cloud: [256, 4, 0.03],
  plank: [512, 4, 0.05], straw: [256, 2, 0.04], rock: [512, 4, 0.06] };   // cycle 9: interior floors, cave rock
// look.floor -> ground detail texture (unknown floors fall back to the nearest existing one)
const FLOOR_DETAIL = { grass: 'grass', flag: 'flag', carved: 'flag', stone: 'flag', rock: 'basalt', basalt: 'basalt', snow: 'snow', ice: 'snow', mud: 'mud', swamp: 'mud', dirt: 'dirt', sand: 'dirt', cloud: 'cloud', ash: 'ash', bone: 'dirt' };
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
  const V = kind === 'dirt' || kind === 'mud' ? mkvoro(64, 0.9, sd + 3) : kind === 'ash' || kind === 'rock' ? mkvoro(12, 0.8, sd + 4) : kind === 'cobble' ? mkvoro(16, 0.62, sd) : kind === 'basalt' ? mkvoro(8, 0.55, sd) : null;
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
    } else if (kind === 'plank') {
      // cycle 9 interiors: floorboards 1/4 tile wide running along x, 1 tile long with staggered joints, grain streaks,
      // knots and nail heads; seams between the boards are the dark low lines
      const X = u * 16, Y = v * 16, row = Math.floor(Y), ry = Y - row, xs = (X + Math.floor(SL[row * 5] * 16)) % 16, seg = Math.floor(xs / 4), sx = xs / 4 - seg;
      const id = row * 4 + seg, q = SL[(id * 5 + 2) % 640], e = Math.min(ry, 1 - ry), ej = Math.min(sx, 1 - sx) * 4, top = smoothstep(0.0, 0.08, Math.min(e, ej));
      const grain = Math.sin((Y * 5 + f8(u * 8, v * 8) * 2.4 + SL[(id * 5 + 3) % 640] * 6) * 6.283) * 0.5 + 0.5;
      const knot = SL[(id * 5 + 4) % 640] < 0.22 ? Math.exp(-(((sx - 0.3 - SL[(id * 5 + 1) % 640] * 0.4) * 4) ** 2 + ((ry - 0.5) * 2.2) ** 2) * 3) : 0;
      const nx = Math.min(sx, 1 - sx) * 4, nail = nx > 0.07 && nx < 0.15 && Math.abs(ry - 0.5) > 0.2 && Math.abs(ry - 0.5) < 0.29 ? 1 : 0;
      h = top * (0.72 + 0.1 * q) + (grain - 0.5) * 0.06 - knot * 0.15 - nail * 0.1;
      l = (0.32 + 0.3 * q + (grain - 0.5) * 0.22 + (f32(u * 32, v * 32) - 0.5) * 0.12) * (0.4 + 0.6 * top) - knot * 0.2 - nail * 0.22 + sp * 0.05;
    } else if (kind === 'rock') {
      // cycle 9 caves: weathered stone, low fbm relief with faint hairline cracks (floors and the rock mass)
      const a = f8(u * 8, v * 8), b = f32(u * 32, v * 32); V(u * 12, v * 12, vo); const e = vo[1] - vo[0], r = cellR[vo[2] * 3], crack = 1 - smoothstep(0.012, 0.045, e);
      h = a * 0.62 + b * 0.24 + r * 0.1 - crack * 0.08; l = 0.5 + (a - 0.5) * 0.6 + (b - 0.5) * 0.35 + (r - 0.5) * 0.12 - crack * 0.1 + sp * 0.08;
    } else if (kind === 'straw') {
      // strewn straw: two crossing sets of warped fibres, dark gaps between them
      const a = f8(u * 8, v * 8), b = f32(u * 32, v * 32);
      const s1 = Math.sin((u * 48 + v * 12 + a * 2.2) * 6.283), s2 = Math.sin((v * 40 - u * 16 + b * 1.6) * 6.283), f = Math.max(s1, s2 * 0.9);
      h = 0.4 + a * 0.3 + Math.max(0, f) * 0.3; l = 0.5 + (a - 0.5) * 0.4 + f * 0.16 + (b - 0.5) * 0.2 + (sp > 0.44 ? -0.3 : sp * 0.2);
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
uniform sampler2D uDB; uniform vec4 uDS; uniform float uNrm; uniform vec3 uWet, uWetSky, uWetSun, uWetSunC;
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
const GD_MAP = `vec2 gSl = vec2(0.0); float gH = 0.5, gWet = 0.0, gPud = 0.0;
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
  if (uWet.x > 0.001) {   // rain (WXS): darker soaked ground, puddles in the low spots of the detail relief
    gPud = smoothstep(0.46, 0.68, (1.0 - gH) * 0.5 + (1.0 - lowN) * 0.45 + (texture2D(uDB, wp * 0.047 + vec2(0.61, 0.29)).a - 0.5) * 0.7) * uWet.y;
    gWet = uWet.x; col *= 1.0 - gWet * (0.24 + 0.22 * (1.0 - gH)) - gPud * 0.3;
  }
  diffuseColor.rgb *= col;
}
#endif`;
// wet sheen: a little of the sky in soaked ground, more in the puddles, and a sun (moon) glint on them
const GD_WET = `if (gWet > 0.0) {
  vec3 wV = normalize(cameraPosition - vGW), wRf = reflect(-wV, vec3(0.0, 1.0, 0.0));
  float wg = pow(max(dot(wRf, uWetSun), 0.0), 80.0) * (0.25 + 2.2 * gPud) * gWet;
  outgoingLight = mix(outgoingLight, uWetSky, gWet * 0.05 + gPud * 0.42) + uWetSunC * wg;
}`;
const WETU = { uWet: { value: new THREE.Vector3() }, uWetSky: { value: new THREE.Color() }, uWetSun: { value: SKY.sunDir }, uWetSunC: { value: new THREE.Color() } };
const GD_NORMAL = `#ifdef GD_NORMAL
normal = normalize(normal - uNrm * (viewMatrix * vec4(gSl.x, 0.0, gSl.y, 0.0)).xyz);
#endif`;
function groundDetail(mat, o) {
  const one = new THREE.Vector4(1 / o.base.span, o.path ? 1 / o.path.span : 1, o.cob ? 1 / o.cob.span : 1, o.ash ? 1 / o.ash.span : 1);
  const U = Object.assign({ uDB: { value: o.base.tex }, uDS: { value: one }, uNrm: { value: o.nrm || 1 } }, WETU);
  let defs = '';
  if (o.mask) { defs += '#define GD_LAYERS\n'; U.uMask = { value: o.mask }; U.uMapInv = { value: o.mapInv }; }
  if (o.shade) { defs += '#define GD_SHADE\n'; U.uShade = { value: o.shade }; U.uMapInv = { value: o.mapInv }; }
  if (o.path) { defs += '#define GD_PATH\n'; U.uDP = { value: o.path.tex }; U.uPathC = { value: o.pathC }; }
  if (o.cob) { defs += '#define GD_COB\n'; U.uDC = { value: o.cob.tex }; U.uCobC = { value: o.cobC }; }
  if (o.ash) { defs += '#define GD_ASH\n'; U.uDA = { value: o.ash.tex }; U.uAshC = { value: o.ashC }; }
  if (o.cave) defs += '#define GD_CAVEWET\n';   // cycle 9: wet cave floor, puddles catch the torch
  mat.userData.texU = U;   // uniform textures (per-map mask / shade) for the world LRU and GFX.memory()
  const prev = mat.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile ? mat.onBeforeCompile : null, key = defs.replace(/#define GD_|\n/g, '');
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    Object.assign(sh.uniforms, U);
    const q = GFX.preset.detail;
    const d = defs + (q >= 1 ? '#define GD_NORMAL\n' : '') + (q >= 2 ? '#define GD_MACRO\n' : '');
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW;').replace('#include <project_vertex>', '#include <project_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = d + sh.fragmentShader.replace('#include <common>', '#include <common>\n' + GD_PARS).replace('#include <map_fragment>', GD_MAP)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + GD_NORMAL).replace('#include <specularmap_fragment>', '#include <specularmap_fragment>\nspecularStrength *= 0.3 + 1.4 * gH;\n#ifdef GD_CAVEWET\nspecularStrength *= 1.0 + gPud * 3.0 + gWet * 0.4;\n#endif')
      .replace('#include <envmap_fragment>', '#include <envmap_fragment>\n' + GD_WET);
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
  // cycle 9: maps above 64 x 64 keep the macro canvas at <= 2048 px (fewer px per tile; ps scales the painted details),
  // so a 96 x 96 field costs the GPU memory and paint time of a 64 x 64 one; 64 x 64 and smaller are unchanged
  const big = isBig(m), TP = big ? Math.max(16, Math.floor(2048 / Math.max(m.w, m.h))) : 32, ps = TP / 32, Wp = m.w * TP, Hp = m.h * TP, w = m.w, h = m.h;
  const kind = mapKind(m), L = kind ? Object.assign({}, m.d.look, { floor: '' }) : m.d.look;   // kind maps: no grass / flowers / lava cracks
  const c = mkCanvas(Wp, Hp), g = c.getContext('2d'), img = g.createImageData(Wp, Hp), D = img.data;
  const PO = (RLOOK[m.id] && RLOOK[m.id].paint) || (kind && rlookFor(m).paint) || {};
  const g1 = PO.g1 || L.g1, g2 = PO.g2 || L.g2, grain = (L.grain || 20) * 0.8;
  if (!big) for (let py = 0; py < Hp; py++) {
    for (let px = 0; px < Wp; px++) {
      const n1 = NZ.a[((py >> 3) & 255) * 256 + ((px >> 3) & 255)], n3 = NZ.a[((py >> 1) & 255) * 256 + ((px >> 1) & 255)], n2 = NZ.b[(py & 255) * 256 + (px & 255)];
      const n0 = NZ.a[((py >> 5) & 255) * 256 + ((px >> 5) & 255)];
      const t = n0 * 0.35 + n1 * 0.45 + n3 * 0.2, gr = (n2 - 0.5) * grain;
      const o = (py * Wp + px) * 4; D[o] = g1[0] + (g2[0] - g1[0]) * t + gr; D[o + 1] = g1[1] + (g2[1] - g1[1]) * t + gr; D[o + 2] = g1[2] + (g2[2] - g1[2]) * t + gr * 0.6; D[o + 3] = 255;
    }
  } else {   // same noise in world units (32 px per tile space), sampled at TP px per tile
    const qx = new Int32Array(Wp); for (let px = 0; px < Wp; px++) qx[px] = (px / ps) | 0;
    for (let py = 0; py < Hp; py++) {
      const qy = (py / ps) | 0, r0 = ((qy >> 5) & 255) * 256, r1 = ((qy >> 3) & 255) * 256, r3 = ((qy >> 1) & 255) * 256, r2 = (py & 255) * 256;
      for (let px = 0; px < Wp; px++) {
        const q = qx[px], t = NZ.a[r0 + ((q >> 5) & 255)] * 0.35 + NZ.a[r1 + ((q >> 3) & 255)] * 0.45 + NZ.a[r3 + ((q >> 1) & 255)] * 0.2, gr = (NZ.b[r2 + (px & 255)] - 0.5) * grain;
        const o = (py * Wp + px) * 4; D[o] = g1[0] + (g2[0] - g1[0]) * t + gr; D[o + 1] = g1[1] + (g2[1] - g1[1]) * t + gr; D[o + 2] = g1[2] + (g2[2] - g1[2]) * t + gr * 0.6; D[o + 3] = 255;
      }
    }
  }
  g.putImageData(img, 0, 0);
  // base colour samples for the grass tufts (linear)
  const BR = 4, base = new Float32Array(w * BR * h * BR * 3), st = TP / BR;
  for (let y = 0; y < h * BR; y++) for (let x = 0; x < w * BR; x++) { const o = (Math.floor((y + 0.5) * st) * Wp + Math.floor((x + 0.5) * st)) * 4, k = (y * w * BR + x) * 3; base[k] = (D[o] / 255) ** 2.2; base[k + 1] = (D[o + 1] / 255) ** 2.2; base[k + 2] = (D[o + 2] / 255) ** 2.2; }
  const rng = mulberry32(m.d.seed * 3 + 1), T_ = m.t;
  const tileOpen = (x, y) => x >= 0 && y >= 0 && x < w && y < h && T_[y * w + x] === 0;
  // Dungeon: rough dark bedrock under the solid mass, moss where the floor meets walls
  if (floorDetail(L.floor) === 'flag' && m.d.gen === 'dungeon') for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = x * TP, Y = y * TP;
    if (!tileOpen(x, y)) { if (T_[y * w + x] === T.WALL) { g.fillStyle = `rgba(0,0,0,${0.25 + rng() * 0.1})`; g.fillRect(X, Y, TP, TP); } continue; }
    if (!tileOpen(x, y - 1) || !tileOpen(x - 1, y)) for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(80,120,64,${0.18 + rng() * 0.3})`; g.fillRect(X + rng() * TP, Y + rng() * 8 * ps, (2 + rng() * 3) * ps, 2 * ps); }
  }
  // Volcanic cracks: dark grooves in the albedo + a glowing emissive map (bloom picks them up)
  if (L.floor === 'rock') {
    const ec = mkCanvas(w * 16, h * 16), eg = ec.getContext('2d'); eg.fillStyle = '#000'; eg.fillRect(0, 0, ec.width, ec.height); eg.lineCap = eg.lineJoin = 'round';
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!tileOpen(x, y) || rng() > 0.12) continue;
      const pts = [[(x + rng()) * TP, (y + rng()) * TP]]; let a = rng() * 6.28;
      for (let k = 0, n = 4 + (rng() * 6 | 0); k < n; k++) { a += (rng() - 0.5) * 2.4; const [px, py] = pts[pts.length - 1], l = (3 + rng() * 6) * ps; pts.push([px + Math.cos(a) * l, py + Math.sin(a) * l]); }
      const path = (cc, sc) => { cc.beginPath(); pts.forEach(([px, py], i) => i ? cc.lineTo(px * sc, py * sc) : cc.moveTo(px * sc, py * sc)); cc.stroke(); };
      g.strokeStyle = 'rgba(18,8,6,.75)'; g.lineWidth = 2.2 * ps; g.lineJoin = 'miter'; path(g, 1);
      const hot = rng(); eg.strokeStyle = `rgba(255,${110 + hot * 90 | 0},${30 + hot * 40 | 0},${0.5 + hot * 0.5})`; eg.lineWidth = 0.7 + hot * 0.6; eg.lineCap = 'butt'; eg.lineJoin = 'miter'; eg.shadowColor = '#ff6a1a'; eg.shadowBlur = 3; path(eg, 16 / TP);
    }
    eg.shadowBlur = 0; eg.globalCompositeOperation = 'lighter';
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (T_[y * w + x] === T.LAVA && (tileOpen(x + 1, y) || tileOpen(x - 1, y) || tileOpen(x, y + 1) || tileOpen(x, y - 1))) { const gr = eg.createRadialGradient((x + 0.5) * 16, (y + 0.5) * 16, 0, (x + 0.5) * 16, (y + 0.5) * 16, 18); gr.addColorStop(0, 'rgba(255,90,20,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); eg.fillStyle = gr; eg.fillRect(x * 16 - 18, y * 16 - 18, 52, 52); }
    m.emisCanvas = ec;
  }
  // Grass blades & flowers (the 3D tufts carry most of this on medium+)
  if (L.floor === 'grass') {
    for (let i = 0; i < w * h * 5; i++) { const x = rng() * w, y = rng() * h; if (!tileOpen(x | 0, y | 0) || m.deco[(y | 0) * w + (x | 0)] >= 5) continue; const X = x * TP, Y = y * TP; g.strokeStyle = rng() < 0.5 ? `rgba(40,70,20,.3)` : `rgba(200,230,140,.2)`; g.lineWidth = 1; g.beginPath(); g.moveTo(X, Y); g.lineTo(X + (rng() - 0.5) * 3 * ps, Y - 3 * ps - rng() * 3 * ps); g.stroke(); }
    const FL = ['#ffffff', '#ffe46a', '#ff9ac8', '#c8a0ff', '#ff7a5a'];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!tileOpen(x, y) || m.deco[y * w + x] >= 5 || rng() > L.flowers * 0.6) continue; const col = FL[(rng() * FL.length) | 0], cx = x * TP + rng() * TP, cy = y * TP + rng() * TP;
      for (let k = 0; k < 2 + rng() * 4; k++) { const fx = cx + (rng() - 0.5) * 14 * ps, fy = cy + (rng() - 0.5) * 10 * ps; g.fillStyle = 'rgba(30,60,20,.45)'; g.fillRect(fx - ps, fy + ps, 3 * ps, 2 * ps); g.fillStyle = col; g.fillRect(fx - ps, fy - ps, 3 * ps, 3 * ps); }
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
    const dc = m.deco[y * w + x]; if (!dc || !tileOpen(x, y)) continue; const X = x * TP + 8 * ps + rng() * 16 * ps, Y = y * TP + 8 * ps + rng() * 16 * ps;
    if (dc === 2 && !(plan && plan.ok)) { g.fillStyle = 'rgba(236,228,206,.8)'; g.fillRect(X - 6 * ps, Y, 10 * ps, 2 * ps); g.beginPath(); g.arc(X + 6 * ps, Y - ps, 3 * ps, 0, 7); g.fill(); }
    else if (dc === 3) { g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(X - 10 * ps, Y - 3 * ps); g.lineTo(X, Y + 2 * ps); g.lineTo(X + 9 * ps, Y - 4 * ps); g.stroke(); }
    else if (dc === 4) { g.fillStyle = L.floor === 'rock' ? 'rgba(255,120,40,.3)' : 'rgba(110,106,100,.45)'; g.beginPath(); g.ellipse(X, Y, 9 * ps, 5 * ps, 0, 0, 7); g.fill(); }
    else if (dc === 1 && L.floor === 'grass') { g.fillStyle = 'rgba(40,80,24,.4)'; g.beginPath(); g.ellipse(X, Y, 7 * ps, 4 * ps, 0, 0, 7); g.fill(); }
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
  // Dungeon: the solid mass between rooms falls off into darkness away from the lit floor (cycle 9: caves, interiors too)
  if (m.d.gen === 'dungeon' || kind) {
    const df = new Float32Array(w * h).fill(99), q = [];
    for (let i = 0; i < w * h; i++) if (T_[i] !== T.WALL) { df[i] = 0; q.push(i); }
    for (let qi = 0; qi < q.length; qi++) { const i = q[qi], x = i % w, y = (i / w) | 0; for (let k = 0; k < 8; k++) { const nx = x + DX[k], ny = y + DY[k]; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const j = ny * w + nx; if (df[j] > df[i] + 1) { df[j] = df[i] + 1; q.push(j); } } }
    const dc = mkCanvas(w, h), dg = dc.getContext('2d'), di = dg.createImageData(w, h);
    const f0 = kind === 'interior' ? 0.15 : 0.8, f1 = kind === 'interior' ? 1.1 : kind === 'cave' ? 2.5 : 4;   // (interiors: black right behind the walls)
    for (let i = 0; i < w * h; i++) { const a = smoothstep(f0, f1, df[i]) * (kind === 'interior' ? 0.98 : 0.95); di.data[i * 4] = 3; di.data[i * 4 + 1] = 3; di.data[i * 4 + 2] = 7; di.data[i * 4 + 3] = a * 255; }
    dg.putImageData(di, 0, 0); sg.imageSmoothingEnabled = true; sg.drawImage(dc, 0, 0, sc.width, sc.height);
  }
  // Baked light pools (soft; real point lights add the rest on medium+)
  sg.globalCompositeOperation = 'lighter';
  const glow = (x, y, R, col) => { const gr = sg.createRadialGradient(x * SR, y * SR, 0, x * SR, y * SR, R * SR); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); sg.fillStyle = gr; sg.fillRect((x - R) * SR, (y - R) * SR, R * 2 * SR, R * 2 * SR); };
  for (const b of m.braziers) glow(b.x, b.y, 3.2, 'rgba(255,140,50,.24)');
  if (m.way) glow(m.way.x, m.way.y, 4, 'rgba(255,150,60,.18)');
  for (const wp of m.warps) { const dk = doorKind(wp, m); if (!dk) glow(wp.x + 0.5, wp.y + 0.5, 2.4, 'rgba(90,150,255,.32)'); else if (dk === 'mouth') { sg.globalCompositeOperation = 'source-over'; spot(wp.x + 0.5, wp.y + 0.5, 1.8, 0.5); sg.globalCompositeOperation = 'lighter'; } else glow(wp.x + 0.5, wp.y + 0.5, dk === 'exit' ? 2.6 : 2.0, dk === 'exit' ? 'rgba(170,200,255,.3)' : 'rgba(255,180,100,.26)'); }
  if (plan) for (const l of plan.lights) glow(l.x, l.z, 2.2, 'rgba(255,190,110,.16)');
  for (const l of mapLights(m)) glow(l.x, l.y, Math.min(4.5, l.r * 0.6), cssRGBA(l.c, clamp(0.22 * l.i, 0.06, 0.4)));   // cycle 9: m.lights
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
function headH(e) { const hp = e === P || e.kind === 'player' || (typeof HSET !== 'undefined' && HSET.has(e)) ? 58 : e.d ? e.d.h : e.look ? 58 * (e.look.scale || 1) : 30; return hp / PXU / COSP; }
function chestH(e) { if (!e || e.x === undefined) return 1; if (e.kind === 'drop') return groundH(e.x, e.y) + 0.3; return groundH(e.x, e.y) + (e.z || 0) / PXU + headH(e) * 0.5; }
// Height of the decorative skirt around the map (continues the edge, gentle hills further out)
// (the sea / a lake running off the map edge continues outward: no hills rising out of it along the border, which drew a
// straight artificial shore with foam exactly on the map edge)
function skirtH(m, x, z) {
  const ex = clamp(x, 0, m.w), ez = clamp(z, 0, m.h), d = Math.hypot(x - ex, z - ez), e = hgtAt(m, ex, ez);
  if (e < -0.7) return e;
  return e + (m.d.gen === 'field' || m.d.gen === 'town' ? (vnoise(x / 7, z / 7, m.d.seed + 3) - 0.35) * Math.min(1, d / 8) * 1.6 : 0);
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
const SHAFTU = { uT: { value: 0 }, uFade: { value: 1 } };   // uFade: overcast / night (WXS)
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
    vertexShader: 'attribute float aPh; uniform float uT, uOp, uFade; varying vec2 vUv; varying float vA; void main(){ vUv = uv; vA = uOp * uFade * (0.7 + 0.3 * sin(uT * 0.6 + aPh)); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
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
const PROP_LIGHT = { dng_brazier: [0, 1.05, 0], helheim_brazier: [0, 1.05, 0], town_lamp_post: [0.46, 1.9, 0], waystone: [0, 3.2, 0] };   // index.json `light`
// m.braziers: Helheim maps (helheim, helheim_*) use the Helheim kit's soul brazier (same 1x1 footprint and light anchor, green coals)
const brazierId = m => (m && (m.id === 'helheim' || /^helheim_/.test(m.id || ''))) ? 'helheim_brazier' : 'dng_brazier';
const PROP_EMIT = { emissive_coals: 2.6, emissive_rune: 2.8, emissive_lamp: 3.4, emissive_obsidian: 2.4, emissive_basalt: 2.2, emissive_ember: 2.8,
  emissive_bifrost: 1.4, emissive_crystal_ice: 2.0, emissive_bog: 1.8, emissive_shroom: 2.0, emissive_amethyst: 2.2, emissive_lava: 2.6, emissive_rune_gold: 2.6,
  emissive_soul: 2.2, emissive_soul_dim: 1.5, emissive_blacksun: 2.0, emissive_gjoll: 1.2, emissive_daylight: 1.0 };   // (cycle 9: window panes of the interior kit)
const PROP_SWAY = { leaves: 1, cloth_banner: 1.8, cloth_awning: 0.5, cloth_tatters: 1.8 };
// Prop kinds whose parts dissolve around the player when they stand between the camera and the hero (canopy dither):
// trees (wind shader) and the big set pieces / buildings (bridge portal roofs, Hel's hall, the World-Tree root, houses).
const PROP_OCC = new Set(['tree', 'setpiece', 'building']);
// Helheim's river ice: the souls drifting under it (emissive map scrolled slowly, see gjollify)
const GJU = { uGj: { value: 0 } };
function gjollify(mat) {
  const em = mat.emissiveMap; if (!em) return mat;
  em.wrapS = em.wrapT = THREE.RepeatWrapping; em.needsUpdate = true;
  const prev = mat.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile ? mat.onBeforeCompile : null;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    Object.assign(sh.uniforms, GJU);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uGj;').replace('#include <emissivemap_fragment>',
      '#ifdef USE_EMISSIVEMAP\n{ vec4 gE = emissiveMapTexelToLinear(texture2D(emissiveMap, vUv + vec2(uGj, uGj * 0.37))) * 0.6 + emissiveMapTexelToLinear(texture2D(emissiveMap, vUv * 1.37 - vec2(uGj * 0.61, -uGj * 0.21))) * 0.55; totalEmissiveRadiance *= gE.rgb; }\n#endif');
  };
  const pk = mat.customProgramCacheKey && mat.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey ? mat.customProgramCacheKey() : '';
  mat.customProgramCacheKey = () => pk + 'gjoll';
  return mat;
}
// Occluder dither on a non-swaying material (set pieces, buildings).
function occify(mat) {
  if (mat.userData.occ) return mat; mat.userData.occ = true;
  const prev = mat.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile ? mat.onBeforeCompile : null;
  mat.onBeforeCompile = (sh, r) => { if (prev) prev(sh, r); Object.assign(sh.uniforms, OCC); occluder(sh); };
  const pk = mat.customProgramCacheKey && mat.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey ? mat.customProgramCacheKey() : '';
  mat.customProgramCacheKey = () => pk + 'occ';
  return mat;
}
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
  const P = ctrlHero(); if (!P) return;
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
    if (sway) windify(mat, amp, PROP_OCC.has(kind));
    if (id === 'dng_wall') capify(mat);
    if (nm === 'emissive_gjoll') gjollify(mat);
    if (!sway && PROP_OCC.has(kind) && kind !== 'tree') occify(mat);
    if (kind === 'wall' && !sway) cutify(mat, /^cave_wall/.test(id));   // cycle 9: kit wall blocks (room side +Z) cut away like the procedural walls
    let depth = null;
    if (mat.alphaTest > 0 || sway) { depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: mat.alphaTest > 0 ? mat.map : null, alphaTest: mat.alphaTest || 0 }); if (sway) windify(depth, amp); }
    parts.push({ geo, mat, depth, name: nm });
  }
  return { id, parts, rad, top, small: top < 1.2 };
}
// Manifest (assets/models/index.json): kind, LODs (lod1), texture-sharing kits (kit_<family>.glb holding
// several models as named root nodes at the origin). Everything degrades to per-file loading without it.
PROPS.man = null; PROPS.kits = {};
const KIT_FIRST = new Set(['town', 'rimeshore', 'mirewell', 'nidavellir', 'bifrost', 'skaldhaven', 'helheim', 'interior', 'cave']);   // (cycle 9: kit_interior / kit_cave)
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
// Neighbour prefetch (perf round 3; replaces fetching every model 1.2 s after boot): once a map is dressed, in idle
// time, plan each map its warps lead to (genMap + planProps, cached on the map as m.plan and reused by buildWorld) and
// load the models it needs one at a time, so the next warp dresses at once without a network wait. Only the current
// map's neighbours are fetched; the player moving on cancels the rest of the queue.
PROPS.nb = { map: null, ids: [] };
PROPS.prefetch = () => {
  const cur = typeof map !== 'undefined' ? map : null; if (!cur || PROPS.nb.map === cur.id || !THREE.GLTFLoader) return;
  PROPS.nb.map = cur.id; PROPS.nb.done = false;   // done: every neighbour planned and its models loaded (perf.py waits on it)
  const ids = [...new Set(cur.warps.map(w => w.to))].filter(id => typeof MAPDEFS !== 'undefined' && MAPDEFS[id]);
  const idle = f => (typeof requestIdleCallback === 'function' ? requestIdleCallback(f, { timeout: 4000 }) : setTimeout(f, 250));
  const q = []; let k = 0;
  const live = () => PROPS.nb.map === cur.id;
  const step = () => {
    if (!live()) return;
    while (q.length && (PROPS.tpl[q[0]] || PROPS.pend[q[0]])) q.shift();
    if (q.length) { const id = q.shift(); PROPS.nb.ids.push(id); PROPS.load(id).then(() => idle(step), () => idle(step)); return; }
    if (k >= ids.length) { PROPS.nb.done = true; return; }
    const id = ids[k++];
    PROPS.manifest().then(() => idle(() => {
      if (!live()) return;
      try {
        const m = genMap(id); if (!m.world) { if (!m.plan) m.plan = planProps(m); const { req, opt } = propIds(m.plan.items, lodLow()); for (const x of [...req, ...opt]) if (!PROPS.tpl[x] && !q.includes(x)) q.push(x); }
        for (const f of GFX.prefetchHooks) try { f(id, m); } catch (e) { console.warn('[gfx] prefetch hook', e); }
      } catch (e) { console.warn('[props] prefetch', id, e); }
      idle(step);
    }));
  };
  setTimeout(() => idle(step), 1500);
};
// Only the manifest starts at load; each map requests exactly the models its plan needs (buildWorld).
try { PROPS.manifest(); } catch (e) { /* no loader: placeholders */ }
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
function buildProps(grp, items, lq, sec) {
  const CH = 128, by = new Map();
  for (const it0 of items) {
    const id = propId(it0, lq), it = it0, tpl = PROPS.tpl[id]; if (!tpl) continue;
    const k = id + '|' + (it.tint || '') + '|' + (it.far ? 'f' : '') + (sec ? '' : Math.floor((it.x + 32) / CH) + ',' + Math.floor((it.z + 32) / CH));   // (big maps: one group, sector-culled)
    let e = by.get(k); if (!e) by.set(k, e = { tpl, tint: it.tint, far: !!it.far, list: [] }); e.list.push(it);
  }
  const q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), M = new THREE.Matrix4(), Y = new THREE.Vector3(0, 1, 0);
  for (const e of by.values()) {
    const { tpl, tint, far } = e; let list = e.list, starts = null;
    if (sec) {   // big maps: instances sorted by sector (stable), sector bounds grown by each instance's extent
      const G = sec.G, ns = G.nx * G.nz, si = list.map(it => secIndex(G, it.x, it.z)), ord = list.map((it, i) => i).sort((a, b) => si[a] - si[b] || a - b);
      list = ord.map(i => list[i]); starts = new Int32Array(ns + 1); for (const i of ord) starts[si[i] + 1]++; for (let s2 = 0; s2 < ns; s2++) starts[s2 + 1] += starts[s2];
      for (let i = 0; i < ord.length; i++) { const it = list[i], b = sec.box[si[ord[i]]], r = tpl.rad * it.s * Math.max(it.sx || 1, it.sz || 1) + 0.3; b.expandByPoint(_v3.set(it.x - r, it.y - 0.3, it.z - r)); b.expandByPoint(_v3.set(it.x + r, it.y + tpl.top * it.s * (it.sy || 1) + 0.3, it.z + r)); }
    }
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9, sm = 0;
    for (const it of list) { x0 = Math.min(x0, it.x); x1 = Math.max(x1, it.x); y0 = Math.min(y0, it.y); y1 = Math.max(y1, it.y); z0 = Math.min(z0, it.z); z1 = Math.max(z1, it.z); sm = Math.max(sm, it.s * Math.max(1, it.sy || 1, it.sx || 1, it.sz || 1)); }
    const c = new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2 + tpl.top * sm / 2, (z0 + z1) / 2), rad = Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + Math.hypot(tpl.rad, tpl.top / 2) * sm + 0.2;
    for (const part of tpl.parts) {
      const geo = new THREE.BufferGeometry(); for (const a in part.geo.attributes) geo.setAttribute(a, part.geo.attributes[a]); geo.setIndex(part.geo.index);
      geo.boundingSphere = new THREE.Sphere(c.clone(), rad);
      const im = new THREE.InstancedMesh(geo, tint ? tintMat(part.mat, tint) : part.mat, list.length);
      list.forEach((it, i) => { q.setFromAxisAngle(Y, it.r); p.set(it.x, it.y, it.z); s.set(it.s * (it.sx || 1), it.s * (it.sy || 1), it.s * (it.sz || 1)); M.compose(p, q, s); im.setMatrixAt(i, M); });
      im.instanceMatrix.needsUpdate = true;
      if (sec) { im.userData.sec = { full: im.instanceMatrix.array.slice(), starts, n: list.length, nView: list.length }; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); sec.meshes.push(im); }
      if (part.depth) im.customDepthMaterial = part.depth;
      im.castShadow = !far; im.receiveShadow = true; im.userData.small = far ? null : tpl.small; im.userData.far = far; im.userData.wall = PROPS.kind(tpl.id) === 'wall';
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
/* Render-side decor upgrades (graphics round 5). New art for a map whose layout predates it: `drop` removes the layout's
   stand-ins, `add` places the new pieces (same fields as m.decor). Applied only when every added model is in the manifest
   and the layout does not already place it (content adopting the model in js/data/maps.js turns this off by itself).
   Skaldhaven: the beached wrecks (rimeshore_longship, stand-ins over open water) become the Sea-Snake moored along the
   three piers (skaldhaven_longship_moored: its own plank pier laid over the boardwalk, deck flush with the walking
   height), and the Salt Hall gets its tavern sign. */
const DECOR_UPGRADE = {
  skaldhaven: [
    { need: 'skaldhaven_longship_moored', drop: ['rimeshore_longship'], add: [
      { model: 'skaldhaven_longship_moored', x: 36.5, y: 11.475, rot: Math.PI / 2, scale: 1, y0: -0.12 },
      { model: 'skaldhaven_longship_moored', x: 38.5, y: 21.475, rot: Math.PI / 2, scale: 1, y0: -0.12 },
      { model: 'skaldhaven_longship_moored', x: 36.0, y: 28.525, rot: -Math.PI / 2, scale: 0.94, y0: -0.12 }] },
    { need: 'skaldhaven_tavern_sign', add: [{ model: 'skaldhaven_tavern_sign', x: 9.75, y: 8.45, rot: 0, scale: 0.9 }] },
  ],
};
function decorUpgrade(m) {
  const base = Array.isArray(m.decor) ? m.decor : [], U = DECOR_UPGRADE[m.id]; if (!U || !PROPS.man) return base;
  let out = base;
  for (const u of U) {
    if (!hasModel(u.need) || base.some(d => d && (d.model === u.need || d.kit === u.need))) continue;
    if (u.drop) out = out.filter(d => !(d && (u.drop.includes(d.model) || u.drop.includes(d.kit))));
    out = out.concat(u.add.map(a => Object.assign({ kit: a.model, g5: true }, a)));
  }
  return out;
}
// Cycle 9: T.WALL drawn by the renderer itself (no wall props): interior walls, cave rock, cave annexes in field maps.
// Content keeps control with props.wall (models per wall tile, as before) and render.cave.walls = false.
function wallsDrawn(m) {
  if (m.d && m.d.props && Array.isArray(m.d.props.wall) && m.d.props.wall.length) return '';
  const k = mapKind(m); if (k === 'interior') return 'interior'; if (k === 'cave') return caveCfg(m).walls ? 'rock' : '';
  return m.d && m.d.gen === 'field' ? 'rock' : '';
}
function planProps(m) {
  const w = m.w, h = m.h, sd = m.d.seed * 17 + 5, gen = m.d.gen, items = [], ao = [], lights = [], avoid = [], mk = mapKind(m), ownWalls = wallsDrawn(m);
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
    const i = y * w + x; if (m.t[i] !== T.WALL || !m.vis[i] || ownWalls) continue;
    const r = ((hs(x, y, 16) * 4) | 0) * Math.PI / 2;
    if (wallL) { const id = pickW(wallL, hs(x, y, 29)); if (PROPS.kind(id) === 'wall') { const [pid, pr] = wallPiece(m, x, y, id); opt(add(pid, x + 0.5, y + 0.5, pr, 1, { dy: -0.02 })); } else opt(add(id, x + 0.5, y + 0.5, r, 1, { dy: -0.02 })); }
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
  for (const b of m.braziers) { add(brazierId(m), b.x, b.y, hash2(b.x * 10 | 0, b.y * 10 | 0, sd) * 6.283, 1); ao.push([b.x, b.y, 0.6, 0.3]); }
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
  if (gen === 'dungeon' && !mk) {
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
  // -- data decor on generated maps: m.decor = [{ model, kit, x, y, rot, scale, sy?, dy?, fp?, light?, on? }] (glTF ids; a
  // missing model is skipped). Set pieces (fp = the T.PROP tiles they cover) get contact shade over the footprint and keep
  // grass out of it; `on: 'water'` floats the piece on the water plane (y = water level + dy) instead of the sea bed;
  // `light` sits at the model's light anchor (index.json `light`, rotated and scaled with the piece); lanterns / lamps /
  // braziers (kind 'light' or the id says so) also get the lamp glows and come alive at night (WXS).
  // render-side upgrades of a map's decor with art that landed after its layout (only while the layout does not use
  // the new model itself): the list is m.decor with the swaps applied (see DECOR_UPGRADE)
  const decorList = decorUpgrade(m);
  const dlights = [], WL = (() => { try { const w = rlookFor(m).water; return w && isFinite(w.level) ? +w.level : -0.45; } catch (e) { return -0.45; } })();
  for (const d of decorList) {
    if (!d || !isFinite(d.x) || !isFinite(d.y)) continue;
    let id = typeof d.kit === 'string' && hasModel(d.kit) ? d.kit : d.model;
    // cycle 9: an interior / cave piece (or any piece on an interior / cave map) with no model yet: a neutral block over
    // its footprint when it blocks tiles or gives light, else skipped (no request for a file that does not exist)
    let ph = null;
    if ((mk || /^(interior|cave)_/.test(String(d.kit || d.model || ''))) && !(typeof id === 'string' && hasModel(id))) {
      const fpOk = Array.isArray(d.fp) && d.fp.length === 4 && d.fp.every(isFinite), lit = Array.isArray(d.light) && d.light.length >= 2;
      if ((!fpOk && !lit) || /cave_mouth/.test(String(d.kit || d.model || ''))) continue;   // (the cave mouth has its procedural stand-in, see buildDoors)
      placeholderTpl(); id = '__ph'; ph = fpOk ? { sx: Math.max(0.5, d.fp[2] - d.fp[0] + 1) * 0.92, sz: Math.max(0.5, d.fp[3] - d.fp[1] + 1) * 0.92, sy: 0.8 } : { sx: 0.4, sz: 0.4, sy: 0.45 };
    }
    if (typeof id !== 'string' || !/^[\w-]+$/.test(id)) continue;
    const sc = ph ? 1 : +d.scale || 1, rot = +d.rot || 0, onW = d.on === 'water';
    const it = add(id, +d.x, +d.y, rot, sc, onW ? { y: WL + (+d.dy || 0) } : isFinite(d.y0) ? { y: +d.y0 } : { dy: +d.dy || 0, sy: isFinite(d.sy) && +d.sy > 0 ? +d.sy : undefined }); it.opt = true;
    if (ph) { it.sx = ph.sx; it.sz = ph.sz; it.sy = ph.sy; it.ph = true; }
    if (Array.isArray(d.fp) && d.fp.length === 4 && d.fp.every(isFinite)) {
      const [x0, y0, x1, y1] = d.fp.map(Number), cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2, rx = (x1 - x0 + 1) / 2, ry = (y1 - y0 + 1) / 2;
      if (!onW) ao.push([cx, cy, Math.min(4, Math.max(rx, ry) + 0.4), 0.3]);
      avoid.push([cx, cy, Math.hypot(rx, ry)]);
    }
    // lights: the entry's `light` at the model's anchor; models with several anchors (index.json `lights`: Hel's hall
    // door + braziers, the Gjallarbru lanterns, the World-Tree root) light every one (lightColor unless `light` says
    // otherwise; `light: false` turns them off)
    const inf = PROPS.info(id), multi = inf && Array.isArray(inf.lights) && inf.lights.length ? inf.lights.filter(a => Array.isArray(a) && a.length === 3) : null;
    if ((Array.isArray(d.light) && d.light.length >= 2) || (multi && multi.length && d.light !== false)) {
      const la = inf && Array.isArray(inf.light) ? inf.light : null, own = Array.isArray(d.light) && d.light.length >= 2;
      const col = own ? d.light[0] : inf.lightColor || '#ffc070', I = own ? +d.light[1] || 1 : 0.9, D = own ? +d.light[2] || 5 : 4.5;
      const lamp = !!((inf && inf.kind === 'light') || /lamp|lantern|brazier|torch/.test(id) || multi || (mk && /crystal|shroom|mushroom|candle|hearth|chandelier|forge|fire/.test(String(d.kit || d.model || id))));
      for (const a of (multi && multi.length ? multi : [la])) {
        const ax = a ? (+a[0] || 0) * sc : 0, az = a ? (+a[2] || 0) * sc : 0;
        const lx = +d.x + Math.cos(rot) * ax + Math.sin(rot) * az, lz = +d.y - Math.sin(rot) * ax + Math.cos(rot) * az;
        dlights.push({ x: lx, z: lz, h: it.y + (a ? (+a[1] || 0) * sc * (it.sy || 1) : 1.2), col, i: multi && multi.length > 1 ? I * 0.7 : I, d: D, lamp });
      }
    }
  }
  // -- cycle 9: door:'cave' on an overworld map: the cave_mouth set piece, unless content placed one near the warp (without
  // the model in the manifest buildDoors draws a procedural mouth)
  const mouths = new Set();
  for (const wp of m.warps) {
    if (doorKind(wp, m) !== 'mouth') continue;
    const cx = wp.x + 0.5, cz = wp.y + 0.5;
    if (decorList.some(d => d && /cave_mouth/.test(String(d.kit || d.model || '')) && hasModel(typeof d.kit === 'string' && hasModel(d.kit) ? d.kit : d.model) && Math.hypot(+d.x - cx, +d.y - cz) < 3.2)) { mouths.add(wp); continue; }
    const fl = (m.d.look && m.d.look.floor) || '', v = fl === 'snow' || fl === 'ice' ? 'cave_mouth_ice' : fl === 'mud' || fl === 'swamp' ? 'cave_mouth_mud' : 'cave_mouth', mid = hasModel(v) ? v : 'cave_mouth';
    if (!hasModel(mid)) continue;
    // (the kit's 3 x 3 arch opens toward +Z; the warp is its front-centre tile, so the piece stands one tile behind it)
    const D = doorDir(wp, m), it = add(mid, cx - D.nx, cz - D.nz, Math.atan2(D.nx, D.nz), 1, { dy: -0.05 }); it.opt = true; mouths.add(wp);
    avoid.push([cx, cz, 1.6]);
  }
  // -- wilderness outside the map: trees (and rocks / ruins) continue into the haze
  if (gen === 'field' || gen === 'town') {
    const r = mulberry32(m.d.seed * 13 + 7), E = 14, dens = gen === 'town' ? 0.13 : dense ? 0.17 : 0.13;
    for (let z = -E; z < h + E; z++) for (let x = -E; x < w + E; x++) {
      if (x >= -1 && x < w + 1 && z >= -1 && z < h + 1) continue;
      const d = Math.hypot(x + 0.5 - clamp(x + 0.5, 0, w), z + 0.5 - clamp(z + 0.5, 0, h));
      if (r() > dens * (0.6 + 0.4 * vnoise(x / 5, z / 5, m.d.seed + 17)) * (1 - d / (E + 4))) continue;
      const cx = x + 0.5 + (r() - 0.5) * 0.6, cz = z + 0.5 + (r() - 0.5) * 0.6, k = r(), gy = skirtH(m, cx, cz);
      if (gy < -0.6) { r(); r(); r(); continue; }   // the sea off the map edge: no trees in the water (same random stream)
      const near = d < 2.5;   // the first rows still cast shadows onto the map edge
      if (k < 0.1) add(pickW(PROP_ROCKS, r()), cx, cz, r() * 6.283, 0.8 + r() * 0.6, { y: gy - 0.05, far: !near });
      else if (k < 0.13 && gen === 'field' && !dense) add(pickW(PROP_RUINS, r()), cx, cz, r() * 6.283, 0.6 + r() * 0.3, { y: gy - 0.08, far: !near });
      else { const id = pickW(trees, r()), it = add(id, cx, cz, r() * 6.283, (TREE_S[id] || 0.74) * (0.95 + r() * 0.35), { y: gy - 0.05, far: !near }); if (!PROP_ALL.includes(id)) it.opt = true; }
    }
  }
  return { items, ao, lights, dlights, avoid, ok: true, mouths };
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
  const pr = grp.userData.props, mk = mapKind(m); if (pr) for (const o of pr.children) { if (o.userData.small === true || o.userData.small === false) o.castShadow = !o.userData.small || Q.smallShadow; if (o.userData.far) o.visible = Q.farProps; if (mk && o.userData.wall) o.castShadow = false; }
  const n = !mapKind(m) && (m.d.look.floor || 'grass') === 'grass' ? Q.grass : 0;
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

/* ---------- Rendered terrain heights: piers over open water ----------
   Piers and boardwalks over water (SURF.BRIDGE floor tiles with water on >= 3 of their 8 neighbours) keep their
   gameplay height (the deck is at walking height), but the rendered terrain under them sinks to the sea bed, so the
   boardwalk models stand on their posts in open water instead of on an earth ridge with a foam line along it. */
function renderHgt(m) {
  if (m.rhgt !== undefined) return m.rhgt || m.hgt;
  m.rhgt = null;
  const TW = T.WATER, SB = typeof SURF !== 'undefined' && SURF.BRIDGE !== undefined ? SURF.BRIDGE : 9;
  if (TW === undefined || !m.surf || !m.t.some(t => t === TW)) return m.hgt;
  const w = m.w, h = m.h, W1 = w + 1, over = new Uint8Array(w * h); let any = false;
  const isW = (x, y) => x >= 0 && y >= 0 && x < w && y < h && m.t[y * w + x] === TW;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (m.t[i] !== 0 || m.surf[i] !== SB) continue;
    let n = 0; for (let k = 0; k < 8; k++) if (isW(x + DX[k], y + DY[k])) n++;
    if (n >= 3) { over[i] = 1; any = true; }
  }
  if (!any) return m.hgt;
  const hg = m.hgt.slice(), wet = (x, y) => x < 0 || y < 0 || x >= w || y >= h || m.t[y * w + x] === TW || over[y * w + x] === 1;
  const ov = (x, y) => x >= 0 && y >= 0 && x < w && y < h && over[y * w + x] === 1;
  for (let vz = 0; vz <= h; vz++) for (let vx = 0; vx <= w; vx++) {
    if (!(ov(vx - 1, vz - 1) || ov(vx, vz - 1) || ov(vx - 1, vz) || ov(vx, vz))) continue;
    if (!(wet(vx - 1, vz - 1) && wet(vx, vz - 1) && wet(vx - 1, vz) && wet(vx, vz))) continue;
    hg[vz * W1 + vx] = Math.min(hg[vz * W1 + vx], -1.15 - vnoise(vx / 4, vz / 4, m.d.seed + 13) * 0.2);
  }
  m.rhgt = hg; return hg;
}

/* ---------- Terrain heightmap texture (post: mist / height fog hug the ground) ---------- */
function heightTex(m) {
  const W1 = m.w + 1, H1 = m.h + 1, n = W1 * H1, HG = renderHgt(m); let mn = 1e9, mx = -1e9;
  for (let i = 0; i < n; i++) { const v = HG[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
  const rg = Math.max(0.01, mx - mn), D = new Uint8Array(n * 4);
  // G = air mask: 0 over the hidden solid mass of a dungeon (no lit dust / mist in the void), else 1
  const TW = T.WATER, isW = (x, y) => { x = clamp(x, 0, m.w - 1); y = clamp(y, 0, m.h - 1); return m.t[y * m.w + x] === TW; };
  const dng = m.d.gen === 'dungeon' || !!mapKind(m), solid = (x, y) => { if (x < 0 || y < 0 || x >= m.w || y >= m.h) return true; const i = y * m.w + x; return m.t[i] === T.WALL && !(m.vis && m.vis[i]); };
  for (let y = 0; y < H1; y++) for (let x = 0; x < W1; x++) {
    const i = y * W1 + x, air = !dng || !(solid(x - 1, y - 1) && solid(x, y - 1) && solid(x - 1, y) && solid(x, y));
    D[i * 4] = clamp((HG[i] - mn) / rg * 255, 0, 255); D[i * 4 + 1] = air ? 255 : 0; D[i * 4 + 3] = 255;
    // B = water mask: corners that touch a water tile (or a pier sunk over it); the water planes cover only these, so a
    // low dip in the hills far from any water no longer shows a pond of water / ice
    D[i * 4 + 2] = TW !== undefined && (isW(x - 1, y - 1) || isW(x, y - 1) || isW(x - 1, y) || isW(x, y) || HG[i] !== m.hgt[i]) ? 255 : 0;
  }
  const t = new THREE.DataTexture(D, W1, H1, THREE.RGBAFormat); t.magFilter = t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
  return { tex: t, w1: W1, h1: H1, min: mn, range: rg };
}

/* ---------- Water (T.WATER, render.water) and the cloud sea under the Bifrost (T.VOID, render.void) ----------
   One plane each over the map + skirt; the terrain dips below them, so the depth test cuts the shores.
   Water: depth from the terrain heightmap -> shallow/deep colour, soft shore foam, scrolling normals with a
   sky reflection (fresnel) and a sun glint; `murky` damps both and adds scum; `ice` freezes the shallows; `frozen`
   (0..1) extends the ice over deeper water (Helheim's river Gjoll: cracked grey ice, dark water in the leads);
   `blackSun` reflects a black disc with a pale corona instead of the glint. Rain (WXS) roughens the surface, rings it
   with ripples and damps the glint (uRain, uGlint are shared by every water plane).
   Clouds: two layers of drifting fbm (opaque floor + a translucent upper layer), faint rainbow sheen. */
const WATERU = { uT: { value: 0 }, uRain: { value: 0 }, uGlint: { value: 1 } };
const TORCHU = { uTorchP: { value: new THREE.Vector3() }, uTorchC: { value: new THREE.Color() }, uTorchC2: { value: new THREE.Vector2(11, 0) } };   // cycle 9: the hero's torch in still cave pools
const _hexOr = (v, d) => { try { return linCol(v === undefined || v === null ? d : v); } catch (e) { return linCol(d); } };
function waterNoise() { return (GFX.composer && GFX.composer.noise) || TEX.soft; }
function buildWater(m, W, R, hg) {
  const lvl = isFinite(W.level) ? +W.level : -0.45, E = 26, still = W.still !== undefined ? +W.still > 0 : mapKind(m) === 'cave';   // cycle 9: still underground pools
  const U = Object.assign({
    tHgt: { value: hg.tex }, uHgt: { value: new THREE.Vector4(1 / hg.w1, 1 / hg.h1, hg.min, hg.range) }, tNoise: { value: waterNoise() }, uLevel: { value: lvl },
    uCol: { value: _hexOr(W.color, 0x1d3c56) }, uDeep: { value: _hexOr(W.deep, 0x0b1a2a) }, uFoam: { value: _hexOr(W.foam, 0xeaf4ff) }, uIce: { value: _hexOr(W.ice, 0xcfe6f6) },
    uFlags: { value: new THREE.Vector4(W.murky ? 1 : 0, W.ice || W.frozen ? 1 : 0, clamp(+W.frozen || 0, 0, 1), W.blackSun ? 1 : 0) }, uSky: { value: SKY.top }, uHor: { value: SKY.hor }, uSunDir: { value: SKY.sunDir }, uSunC: { value: sun.color },
    uFogCol: LAVAU.uFogCol, uFog: LAVAU.uFog,
  }, WATERU, still ? TORCHU : {});
  const mat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, fog: false, defines: still ? { WATER_STILL: 1 } : {},
    vertexShader: 'varying vec3 vW; varying float vDepth; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vDepth = -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: `uniform sampler2D tHgt, tNoise; uniform vec4 uHgt, uFlags; uniform float uLevel, uT, uRain, uGlint; uniform vec3 uCol, uDeep, uFoam, uIce, uSky, uHor, uSunDir, uSunC, uFogCol; uniform vec2 uFog;
      #ifdef WATER_STILL
      uniform vec3 uTorchP, uTorchC; uniform vec2 uTorchC2;
      #endif
      varying vec3 vW; varying float vDepth;
      void main(){
        vec4 hs = texture2D(tHgt, (vW.xz + 0.5) * uHgt.xy);
        if (hs.b < 0.04) discard;   // not near any water tile: a dip in the land, not a lake
        #ifdef WATER_STILL
        float mEdge = smoothstep(0.04, 0.6, hs.b);   // (cave pools: a soft rim where the corner mask ends, no blocky tile edges)
        #endif
        float gh = uHgt.z + uHgt.w * hs.r, dep = max(uLevel - gh, 0.0);
        vec2 p = vW.xz;
        vec2 n1 = texture2D(tNoise, p * 0.085 + vec2(uT * 0.018, uT * 0.011)).rg - 0.5, n2 = texture2D(tNoise, p * 0.23 - vec2(uT * 0.027, -uT * 0.019)).rg - 0.5;
        vec2 slope = (n1 + n2 * 0.7) * (0.55 + 0.5 * uRain);
        #ifdef WATER_STILL
        slope *= 0.16;
        #endif
        float rip = 0.0;
        if (uRain > 0.01) {   // rain rings: one drop per cell, random phase and centre
          vec2 g = p * 1.7, id = floor(g), f = fract(g) - 0.5;
          float h = fract(sin(dot(id, vec2(12.9898, 78.233))) * 43758.5453), ph = fract(uT * 1.1 + h);
          vec2 d = f - (vec2(fract(h * 7.13), fract(h * 3.71)) - 0.5) * 0.45; float r = length(d);
          rip = smoothstep(0.06, 0.0, abs(r - ph * 0.42)) * (1.0 - ph) * step(h, uRain);
          slope += d / max(r, 0.02) * rip * 0.9;
        }
        vec3 N = normalize(vec3(slope.x, 1.0, slope.y));
        vec3 V = normalize(cameraPosition - vW), Rf = reflect(-V, N);
        float fres = 0.03 + 0.97 * pow(1.0 - max(dot(N, V), 0.0), 5.0), murk = uFlags.x;
        vec3 sky = mix(uHor, uSky, clamp(Rf.y, 0.0, 1.0));
        float sd = max(dot(Rf, normalize(uSunDir)), 0.0);
        float glint = (pow(sd, 220.0) * 5.0 + pow(sd, 24.0) * 0.12) * uGlint * (1.0 - 0.75 * uRain);
        if (uFlags.w > 0.5) { glint = 0.0; float disk = smoothstep(0.9975, 0.9985, sd); sky = mix(sky, sky * 0.06, disk) + vec3(0.55, 0.75, 0.62) * smoothstep(0.990, 0.9972, sd) * (1.0 - disk) * 0.8; }
        vec3 body = mix(uCol, uDeep, smoothstep(0.04, 0.75, dep));
        float scum = murk * smoothstep(0.55, 0.8, texture2D(tNoise, p * 0.06 + vec2(uT * 0.004, 0.0)).g);
        body = mix(body, uFoam * 0.5, scum * 0.6);
        vec3 c = mix(body, sky, fres * (0.8 - murk * 0.55)) + uSunC * glint * (1.0 - murk * 0.85) * (1.0 - scum);
        float fn = texture2D(tNoise, p * 0.5 + vec2(uT * 0.04, -uT * 0.03)).r, wave = 0.12 + 0.07 * sin(uT * 1.4 - (p.x + p.y) * 0.9);
        float foam = (1.0 - smoothstep(0.0, wave, dep)) * smoothstep(0.3, 0.6, fn) * (1.0 - murk * 0.6);
        #ifdef WATER_STILL
        foam *= 0.25;
        { vec3 tl = uTorchP - vW; float td = max(length(tl), 1e-3), tg = pow(max(dot(Rf, tl / td), 0.0), 90.0) * 3.0 + pow(max(dot(Rf, tl / td), 0.0), 12.0) * 0.08;
          c += uTorchC * tg * pow(max(0.0, 1.0 - td / uTorchC2.x), 2.0) + uTorchC * 0.05 * pow(max(0.0, 1.0 - td / uTorchC2.x), 3.0); }
        #endif
        c = mix(c, uFoam, foam * 0.8);
        c += (sky * 0.5 + 0.08) * rip * 0.35;
        if (uFlags.y > 0.5) {
          float fz = uFlags.z, en = texture2D(tNoise, p * 0.11).g - 0.5;
          float fr = smoothstep(0.34, 0.2, dep - fz * 2.4 + en * (0.35 + fz * 0.9));
          vec3 ice = uIce * (0.85 + 0.3 * texture2D(tNoise, p * 0.7).r) + sky * 0.15;
          if (fz > 0.0) {   // frozen river: cracks (cell edges) and darker clear ice over deep water
            vec2 q = p * 0.9 + (texture2D(tNoise, p * 0.05).rg - 0.5) * 1.4, cf = abs(fract(q) - 0.5);
            float crack = smoothstep(0.47, 0.495, max(cf.x, cf.y)) * smoothstep(0.35, 0.6, texture2D(tNoise, q * 0.21).r);
            ice = mix(ice, mix(ice * 0.55, uDeep * 1.6, 0.5), smoothstep(0.4, 1.6, dep) * 0.6) * (1.0 - crack * 0.55) + sky * fres * 0.4;
          }
          c = mix(c, ice, fr * 0.9);
        }
        float a = mix(0.55, 0.96, smoothstep(0.0, 0.5, dep));
        #ifdef WATER_STILL
        a *= mEdge * smoothstep(0.02, 0.3, dep - 0.1 + texture2D(tNoise, p * 0.31).r * 0.36);   // an organic shoreline
        #endif
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
const POOLU = { uT: { value: 0 }, uWay: { value: 0 }, uLamp: { value: 1 } };   // uLamp: night boost (WXS)
function buildPools(m, plan, R) {
  const Lc = R.lights || RLOOK.ashen_fields.lights, E = [], dark = R.exposure > 1.05;
  const col = (hex, k) => linCol(hex).multiplyScalar(k);
  for (const b of m.braziers) E.push([b.x, b.y, dark ? 3.2 : 2.6, col(Lc.brazier[0], dark ? 0.5 : 0.3), b.x * 3.1 + b.y, 1, 0]);
  if (m.way) E.push([m.way.x, m.way.y, 3.4, col(Lc.way[0], dark ? 0.4 : 0.22), 0.7, 1, 1]);
  const lamp = Lc.lamp || [0xffc070];
  for (const l of plan.lights) E.push([l.x, l.z, 1.9, col(lamp[0], dark ? 0.3 : 0.14), l.x * 1.7 + l.z, 0.25, 0]);
  for (const wp of m.warps) {
    const dk = doorKind(wp, m);
    if (!dk) E.push([wp.x + 0.5, wp.y + 0.5, 1.9, col(Lc.warp[0], 0.22), 2, 0.3, 0]);
    else if (dk !== 'mouth') { const D = doorDir(wp, m), ex = dk === 'exit'; E.push([wp.x + 0.5 + D.nx * 0.5, wp.y + 0.5 + D.nz * 0.5, ex ? 2.2 : 1.7, col(ex ? 0xd8e6ff : 0xffb870, ex ? 0.3 : 0.26), wp.x + wp.y, ex ? 0.03 : 0.2, 0]); }
  }
  for (const l of mapLights(m)) E.push([l.x, l.y, clamp(0.45 * l.r, 1, 3.2), l.lin.clone().multiplyScalar((dark ? 0.3 : 0.2) * Math.min(1.5, l.i)), l.x * 2.1 + l.y, l.fl, 0]);   // cycle 9
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
    vertexShader: `attribute vec4 aC, aCol; uniform float uT, uWay, uLamp; varying vec2 vD; varying vec3 vCol;
      void main(){ vD = (position.xz - aC.xy) / aC.z; float fl = mod(aCol.w, 10.0), ph = aC.w;
        float f = 1.0 - fl * (0.12 + 0.1 * sin(uT * 11.0 + ph) + 0.07 * sin(uT * 23.7 + ph * 2.0) + 0.05 * sin(uT * 5.3 + ph * 0.7));
        vCol = aCol.rgb * f * f * (aCol.w >= 10.0 ? uWay : 1.0) * uLamp;
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
const MOTEU = { uT: { value: 0 }, uC: { value: new THREE.Vector3() }, uScale: { value: 400 }, tShadow: { value: null }, uShadowM: { value: new THREE.Matrix4() }, uLitOn: { value: 0 }, uK: { value: 1 } };   // uK: night / overcast (WXS)
function buildMotes(S) {
  const n = S.n || 500, seed = new Float32Array(n * 4), r = mulberry32(4242);
  for (let i = 0; i < n * 4; i++) seed[i] = r();
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const vtx = renderer.capabilities.maxVertexTextures > 0 && S.lit;
  const mat = new THREE.ShaderMaterial({
    uniforms: Object.assign({ uCol: { value: linCol(S.col || 0xfff0c0).multiplyScalar(S.k || 1) }, uBox: { value: S.box || 24 }, uH: { value: new THREE.Vector2(S.hmin || 0.3, S.hmax || 4) }, uSize: { value: S.size || 0.05 } }, MOTEU),
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
    fragmentShader: `uniform vec3 uCol; uniform float uK; varying float vB;
      void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.05, d); gl_FragColor = vec4(uCol * vB * a * 1.6 * uK, 1.0);
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }`,
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 5; return pts;
}

/* ---------- Weather, ambient life and time of day (graphics round 5) ----------
   WXS keeps one world clock (time of day, WXS.dayLen seconds per cycle) and a weather state per map.
   Time of day: day (p 0..0.47) = the map's own look, unchanged; dusk, moonlit night and dawn are blended toward on
   outdoor maps (field / town / sky gens). Locked: dungeons and arenas, RLOOK / render `tod: false` (or a fixed phase
   number), GFX.lockTime(p) for story scenes. What moves: sky / haze / fog colours, sun (moon) and hemisphere light,
   exposure, bloom, the post grade and vignette, mist / volumetric colour, the sprites' light tint, and the lamps:
   lamp posts, braziers, house windows, lantern emissives, their light pools and point lights come alive at night.
   Weather: `precip` (snow / rain) cycles through weighted states with eased intensity; `amb` = ambient life that is
   always there (falling leaves, pollen, fireflies at dusk, ash, crystal motes, soul wisps, embers, spores). Rain also
   wets the ground (darker, puddle sky reflections), draws splash rings (ripples on the water) and roughens the water;
   heavy snow thickens the ground mist and pulls the fog in; both dim the sun (overcast) and fade god rays.
   Particles: one GPU-animated mesh per kind (camera-facing quads; positions from per-particle seeds + time in the
   vertex shader, wrapped in a box that follows the camera and leans toward it with height, so every particle is in
   view). Counts scale with GFX.preset.wx (low 0.35 .. ultra 1.4) and the adaptive levels (drawRange only: no rebuild).
   Data: MAPDEFS[id].render.weather = { amb: [[kind, intensity], ...], precip: [[kind|null, intensity, minutes], ...],
   wind: [x, z] } (else WX_MAPS below, else derived from render.particles); render.tod: false | phase;
   render.night / render.dusk: partial overrides of WX_NIGHT / WX_DUSK. API: GFX.setTime(p|null), GFX.lockTime(p|null),
   GFX.setWeather(kind|null, intensity), GFX.wx.info(). */
// Particle kinds. n: particles at intensity 1 on high (the mesh holds n * 1.4 for ultra); box: side of the wrap box
// in units of cam.dist; h: height range above the view's ground; fall: units / s (rise for the floating kinds);
// sway: wobble amplitude; size: quad half-size [w, h] (world units, never under ~1.3 px); col / col2: sRGB;
// a: opacity; hdr: brightness of the glowing kinds (bloom); move: 0 fall, 1 drift, 2 wander, 3 rise, 5 ground ring;
// shape: 0 flake, 1 rain streak, 2 ring, 3 ash flake, 4 leaf, 5 speck, 6 glow, 7 sparkle; add: additive blending.
const WX_KINDS = {
  snow:      { n: 2600, box: 0.85, h: [-1.5, 10], fall: 1.1, sway: 0.4, size: [0.05, 0.05], col: 0xffffff, a: 0.95, move: 0, shape: 0 },
  rain:      { n: 2200, box: 0.8, h: [-1.5, 11], fall: 14, sway: 0, size: [0.016, 0.5], col: 0xdce6f2, a: 0.75, move: 0, shape: 1 },
  splash:    { n: 800, box: 0.7, h: [0, 0], life: 0.38, size: [0.14, 0.14], col: 0xe8f0f8, a: 0.9, move: 5, shape: 2 },
  ash:       { n: 1300, box: 0.85, h: [-1, 9], fall: 0.55, sway: 0.6, size: [0.045, 0.045], col: 0x8a8480, col2: 0xff7a30, a: 0.85, move: 0, shape: 3 },
  leaves:    { n: 240, box: 0.85, h: [-0.5, 8], fall: 0.75, sway: 1.0, size: [0.075, 0.055], col: 0xd07a2c, col2: 0x9aa232, a: 1, move: 0, shape: 4, spin: 1 },
  pollen:    { n: 420, box: 0.8, h: [0.2, 3.5], fall: 0, sway: 0, size: [0.02, 0.02], col: 0xfff2b0, a: 0.7, hdr: 1.4, move: 1, shape: 5, add: 1 },
  spores:    { n: 380, box: 0.8, h: [0.2, 3.0], fall: 0, sway: 0, size: [0.026, 0.026], col: 0xa8f070, a: 0.6, hdr: 1.3, move: 1, shape: 5, add: 1 },
  fireflies: { n: 110, box: 0.75, h: [0.35, 2.4], fall: 0, sway: 0, size: [0.075, 0.075], col: 0xd4ff6a, a: 1, hdr: 3.2, move: 2, shape: 6, add: 1, blink: 1 },
  motes:     { n: 620, box: 0.85, h: [-2.5, 6], fall: 0.25, sway: 0.5, size: [0.05, 0.05], col: 0xd8c8ff, a: 1, hdr: 2.2, move: 3, shape: 7, add: 1, blink: 1, rainbow: 1 },
  souls:     { n: 110, box: 0.8, h: [0.2, 4.5], fall: 0.22, sway: 0.7, size: [0.13, 0.13], col: 0x9affc8, a: 0.75, hdr: 1.8, move: 3, shape: 6, add: 1 },
  embers:    { n: 300, box: 0.75, h: [-0.5, 6], fall: 0.9, sway: 0.5, size: [0.028, 0.028], col: 0xff8a30, a: 1, hdr: 3.0, move: 3, shape: 6, add: 1, blink: 1 },
  // cycle 9, caves (torch: brightest in the hero's torch light, tf = how much shows beyond it): water dripping from the
  // ceiling with rings where it lands, dust hanging in the torch light
  drip:      { n: 70, box: 0.45, h: [-0.3, 6.5], fall: 6.0, sway: 0, size: [0.01, 0.1], col: 0xbcd4ff, a: 0.6, hdr: 1.25, move: 0, shape: 1, add: 1, torch: 1, tf: 0.04 },
  dripring:  { n: 50, box: 0.45, h: [0, 0], life: 0.7, size: [0.1, 0.1], col: 0xd4e4ff, a: 0.7, hdr: 1.2, move: 5, shape: 2, add: 1, torch: 1, tf: 0.04 },
  cavedust:  { n: 380, box: 0.55, h: [0.2, 3.6], fall: 0, sway: 0, size: [0.02, 0.02], col: 0xffe2b8, a: 0.55, hdr: 1.5, move: 1, shape: 5, add: 1, torch: 1, tf: 0 },
};
// Per-map weather (MAPDEFS[id].render.weather overrides): amb = [[kind, intensity(, dayK)]] ambient life (fireflies:
// dayK = how much of it shows by day, the rest comes with dusk / night); precip = [[kind | null, intensity, minutes,
// weight]] states picked at random (weighted) for ~minutes each, eased in / out; wind = [x, z] units / s.
const WX_MAPS = {
  emberhold: { amb: [['leaves', 0.3], ['fireflies', 0.6, 0]], precip: [[null, 0, 7, 4], ['rain', 0.45, 1.5, 1]], wind: [0.5, 0.2] },
  ashen_fields: { amb: [['leaves', 0.8], ['pollen', 0.25]], precip: [[null, 0, 6, 4], ['rain', 0.7, 1.5, 1], ['rain', 0.3, 1.5, 1]], wind: [0.7, 0.25] },
  withered_wood: { amb: [['pollen', 0.8], ['fireflies', 1, 0.08], ['leaves', 0.3]], precip: [[null, 0, 8, 5], ['rain', 0.4, 1.5, 1]], wind: [0.25, 0.1] },
  throne: { amb: [['ash', 1]], wind: [0.25, -0.35], tod: false },
  rimeshore: { precip: [['snow', 0.5, 3, 3], ['snow', 1, 1.5, 1.5], ['snow', 0.22, 2, 1.5]], wind: [0.9, 0.3] },
  skaldhaven: { precip: [['snow', 0.35, 3, 3], ['snow', 0.8, 1.2, 1], [null, 0, 2, 1.5]], wind: [0.8, 0.25] },
  mirewell: { amb: [['fireflies', 1, 0.35], ['spores', 0.6]], precip: [['rain', 0.35, 2, 2], ['rain', 1, 1.2, 1.5], [null, 0, 2.5, 2]], wind: [0.35, 0.15] },
  nidavellir: { amb: [['embers', 0.7]], wind: [0.1, 0.05] },
  bifrost: { amb: [['motes', 1]], wind: [0.3, 0.1], tod: false },
  helheim: { amb: [['ash', 0.55], ['souls', 0.6]], wind: [0.3, 0.12], tod: false },
};
// render.particles (content data) -> weather, for maps without a WX_MAPS entry or render.weather
const WX_FROM_PART = { snow: { precip: [['snow', 0.5, 3, 2], ['snow', 0.9, 1.5, 1], ['snow', 0.2, 2, 1]] }, spores: { amb: [['spores', 0.6], ['fireflies', 0.8, 0.3]] },
  embers: { amb: [['embers', 0.7]] }, motes: { amb: [['motes', 1]] }, ash: { amb: [['ash', 0.8]] }, leaves: { amb: [['leaves', 0.7]] }, rain: { precip: [['rain', 0.5, 3, 1], [null, 0, 3, 1]] } };
// Time-of-day targets (colours sRGB; intensities are multipliers of the map's own day values). Night keeps a hint of
// the map's hue (sky / haze = mix(day * dim, night colour, mix)).
const WX_NIGHT = {
  sky: [0x0a1226, 0x1c2a4a], haze: 0x1e2c48, mix: 0.78, dim: 0.16, sun: 0xa8bcff, sunK: 0.34, hemi: [0x5a6ea0, 0x10141c], hemiK: 0.58,
  exp: 1.16, bloomThr: 0.95, bloomK: 1.35, vig: 0.12, sat: 0.8, con: 1.04,
  grade: { lift: [0.004, 0.01, 0.03], gamma: [1, 1, 1.03], gain: [0.94, 0.98, 1.08], shadowTint: [-0.01, 0.0, 0.03], highTint: [0.0, 0.006, 0.02] },
  lt: { amb: [0.27, 0.31, 0.47], sun: [0.1, 0.12, 0.18] }, mist: 0x566890, mistAmb: 0.5, vol: 0x9fb8ff, volK: 0.55, torch: 1.1,
};
const WX_DUSK = {
  sky: [0x3e4a8a, 0xf0a070], haze: 0xd49a7c, mix: 0.62, dim: 0.6, sun: 0xffa458, sunK: 0.82, hemi: [0xd0a8b4, 0x4a3a30], hemiK: 0.82,
  exp: 1.02, bloomThr: 1.0, bloomK: 1.1, vig: 0.05, sat: 1.06, con: 1.02,
  grade: { lift: [0.018, 0.008, 0.02], gamma: [1, 1, 1], gain: [1.04, 0.98, 0.93], shadowTint: [0.0, -0.004, 0.022], highTint: [0.022, 0.01, -0.008] },
  lt: { ambK: [0.95, 0.82, 0.86], sunK: [1.1, 0.72, 0.46] }, mist: 0xe0a888, mistAmb: 0.9, vol: 0xffb070, volK: 1.1, torch: 0.3,
};
const WX_DAWN = Object.assign({}, WX_DUSK, { sky: [0x5a68b0, 0xf4b8a4], haze: 0xdcb0a8, sun: 0xffc0a0, mist: 0xe8c0c0, vol: 0xffc8a8,
  grade: { lift: [0.016, 0.01, 0.024], gamma: [1, 1, 1], gain: [1.04, 0.99, 0.96], shadowTint: [0.0, 0.0, 0.024], highTint: [0.024, 0.012, 0.0] } });
const WX_VS = `attribute vec4 aSeed; attribute vec2 aCorner;
  uniform float uT, uN, uCot, uBox, uFall, uSway, uLife, uPx, uHdr;
  uniform vec3 uC, uCol, uCol2, uLit; uniform vec2 uCamD, uH, uSize, uWind, uTorchR; uniform float uTF;
  #ifdef WX_GROUND
  uniform sampler2D tHgt; uniform vec4 uHgt; uniform float uLevel;
  #endif
  varying vec2 vUv; varying float vA; varying vec3 vTint;
  float wh(float n){ return fract(sin(n * 91.345 + 0.123) * 47453.5453); }
  void main(){
    vUv = aCorner; vTint = vec3(0.0); vA = 0.0;
    float t = uT, a = clamp((uN - aSeed.w) * 25.0, 0.0, 1.0), H = max(uH.y - uH.x, 0.01), y = 0.0, ph = 0.0;
    vec2 xz0 = aSeed.xy * uBox, off = vec2(0.0);
    #if WX_MOVE == 0
      float spd = uFall * (0.8 + 0.4 * fract(aSeed.z * 7.13));
      ph = fract(aSeed.z + t * spd / H); y = uH.y - ph * H;
      off = uWind * t + vec2(sin(t * 0.9 + aSeed.x * 40.0), cos(t * 0.73 + aSeed.y * 40.0)) * uSway;
      a *= smoothstep(0.0, 0.06, ph) * (1.0 - smoothstep(0.94, 1.0, ph));
    #elif WX_MOVE == 1
      y = mix(uH.x, uH.y, 0.5 + 0.5 * sin(t * 0.13 * (0.5 + aSeed.w) + aSeed.z * 6.2832));
      off = uWind * t * 0.35 + vec2(sin(t * 0.21 + aSeed.z * 6.2832), cos(t * 0.17 + aSeed.x * 6.2832)) * 1.2;
    #elif WX_MOVE == 2
      float sp = 0.6 + aSeed.w;
      off = vec2(sin(t * 0.37 * sp + aSeed.z * 6.2832) + 0.5 * sin(t * 0.91 + aSeed.x * 20.0), cos(t * 0.29 * sp + aSeed.y * 6.2832) + 0.5 * cos(t * 0.83 + aSeed.z * 20.0)) * 1.1;
      y = mix(uH.x, uH.y, 0.5 + 0.5 * sin(t * 0.5 * sp + aSeed.z * 30.0));
    #elif WX_MOVE == 3
      ph = fract(aSeed.z + t * uFall / H * (0.6 + 0.6 * fract(aSeed.w * 5.3)));
      y = uH.x + ph * H;
      off = uWind * t + vec2(sin(t * 0.4 + aSeed.x * 30.0), cos(t * 0.33 + aSeed.y * 30.0)) * uSway;
      a *= smoothstep(0.0, 0.15, ph) * (1.0 - smoothstep(0.65, 1.0, ph));
    #else
      float cyc = floor(aSeed.z + t / uLife); ph = fract(aSeed.z + t / uLife);
      xz0 = vec2(wh(cyc * 3.1 + aSeed.x * 91.0), wh(cyc * 5.7 + aSeed.y * 37.0)) * uBox;
      a *= 1.0 - ph;
    #endif
    // a box that follows the view, leaning toward the camera with height (so high particles are still on screen)
    vec2 ctr = uC.xz + uCamD * max(y, 0.0) * uCot;
    vec2 o = ctr - 0.5 * uBox, xz = o + mod(xz0 + off - o, uBox);
    a *= 1.0 - smoothstep(0.36, 0.5, max(abs(xz.x - ctr.x), abs(xz.y - ctr.y)) / uBox);
    vec3 p = vec3(xz.x, uC.y + y, xz.y);
    #ifdef WX_TORCH
      a *= mix(uTF, 1.0, 1.0 - smoothstep(uTorchR.x * 0.15, uTorchR.x * 0.6, length(xz - uC.xz)));
    #endif
    #ifdef WX_GROUND
      float gy = uHgt.w > 0.0 ? uHgt.z + uHgt.w * texture2D(tHgt, (xz + 0.5) * uHgt.xy).r : uC.y;
      p.y = max(gy, uLevel) + 0.03;
    #elif WX_MOVE == 5
      p.y = uC.y + 0.03;
    #endif
    if (a <= 0.002) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
    float mn = uPx * length(cameraPosition - p) * 1.3;   // world size of ~1.3 px here: never thinner (no sub-pixel shimmer)
    vec2 sz = uSize * (0.7 + 0.6 * fract(aSeed.w * 13.7));
    #if WX_SHAPE == 1
      float sw = max(sz.x, mn); a *= sz.x / sw;
      vec3 v = normalize(vec3(uWind.x, -uFall, uWind.y)), sd = normalize(cross(v, normalize(cameraPosition - p)));
      p += v * aCorner.y * sz.y + sd * aCorner.x * sw;
    #elif WX_SHAPE == 2
      float r = max(sz.x * (0.25 + 0.75 * ph), mn);
      p += vec3(aCorner.x * r, 0.0, aCorner.y * r);
    #else
      vec2 c = aCorner, s2 = max(sz, vec2(mn)); a *= (sz.x * sz.y) / (s2.x * s2.y);
      #ifdef WX_SPIN
        float an = aSeed.x * 6.2832 + t * (1.2 + 2.0 * aSeed.w) * (aSeed.y > 0.5 ? 1.0 : -1.0), fl = cos(t * (2.5 + 3.0 * aSeed.z) + aSeed.y * 20.0);
        c = mat2(cos(an), sin(an), -sin(an), cos(an)) * vec2(c.x * (0.25 + 0.75 * abs(fl)), c.y);
      #endif
      vec3 cR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), cU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
      p += cR * c.x * s2.x + cU * c.y * s2.y;
    #endif
    #ifdef WX_BLINK
      a *= 0.2 + 0.8 * smoothstep(-0.2, 0.9, sin(t * (1.1 + 1.6 * aSeed.w) + aSeed.z * 40.0));
    #endif
    vec3 col = uCol;
    #ifdef WX_LEAF
      col = mix(uCol, uCol2, step(0.62, fract(aSeed.x * 31.7))) * (0.7 + 0.55 * fract(aSeed.y * 17.3)) * (0.75 + 0.25 * fl);
    #endif
    #ifdef WX_RAINBOW
      vec3 hue = clamp(abs(fract(fract(aSeed.x * 7.7) + vec3(0.0, 0.667, 0.333)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
      col = mix(col, hue, 0.45);
    #endif
    #ifdef WX_ADD
      col *= uHdr;
    #else
      col *= uLit;
    #endif
    #ifdef WX_EMBERS
      float em = step(fract(aSeed.y * 23.1), 0.05);   // a few glowing embers among the ash
      col = mix(col * (0.65 + 0.6 * fract(aSeed.x * 11.3)), uCol2 * (2.5 + 1.5 * sin(t * 6.0 + aSeed.z * 30.0)), em);
    #endif
    vTint = col; vA = a;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }`;
const WX_FS = `uniform float uA; varying vec2 vUv; varying float vA; varying vec3 vTint;
  void main(){
    vec2 q = vUv; float r = length(q), m; vec3 c = vTint;
    #if WX_SHAPE == 0
      m = smoothstep(1.0, 0.3, r);
    #elif WX_SHAPE == 1
      m = (1.0 - abs(q.x)) * smoothstep(-1.0, 0.7, q.y);
    #elif WX_SHAPE == 2
      m = smoothstep(0.35, 0.7, r) * (1.0 - smoothstep(0.78, 1.0, r)) * 1.4;
    #elif WX_SHAPE == 3
      vec2 aq = abs(q); m = 1.0 - smoothstep(0.6, 1.0, max(aq.x + aq.y * 0.35, aq.y + aq.x * 0.2));
    #elif WX_SHAPE == 4
      m = 1.0 - smoothstep(0.75, 1.0, abs(q.x) / max(0.05, 1.0 - q.y * q.y)); c *= 1.0 - 0.3 * (1.0 - smoothstep(0.0, 0.14, abs(q.x)));
    #elif WX_SHAPE == 5
      m = smoothstep(1.0, 0.0, r);
    #elif WX_SHAPE == 6
      m = exp(-r * r * 4.5) * 1.1;
    #else
      m = exp(-r * r * 7.0) + (max(0.0, 1.0 - abs(q.x) * 7.0) * (1.0 - abs(q.y)) + max(0.0, 1.0 - abs(q.y) * 7.0) * (1.0 - abs(q.x))) * 0.5;
    #endif
    #ifdef WX_ADD
      gl_FragColor = vec4(c * m * vA * uA, 1.0);
    #else
      float al = m * vA * uA; if (al < 0.01) discard;
      gl_FragColor = vec4(c, al);
    #endif
    #include <tonemapping_fragment>
    #include <encodings_fragment>
  }`;
// uniforms shared by every weather layer (set once per frame)
const WXU = { uT: { value: 0 }, uC: { value: new THREE.Vector3() }, uCamD: { value: new THREE.Vector2(0, 1) }, uCot: { value: 0.83 }, uWind: { value: new THREE.Vector2() }, uPx: { value: 0.001 }, uTorchR: { value: new THREE.Vector2(11, 0) },
  uLit: { value: new THREE.Color(1, 1, 1) }, tHgt: { value: null }, uHgt: { value: new THREE.Vector4() }, uLevel: { value: -99 } };
const WXS = {
  on: false, layers: {}, maps: {}, cfg: null, used: null, t: 0, clock: 0.08, dayLen: 1440, phase: 0.08, lock: null, force: null, forceW: null,
  n: 0, d: 0, dawnF: false, rain: 0, snow: 0, wet: 0, caveWet: 0, torchI: 0, lamp: 1, look: null, day: null, night: null, dusk: null, dawn: null, dirty: true,
  _n: -1, _d: -1, _r: -1, _s: -1, _lampE: -1, emis: null, emisN: -1, screenParts: true,
};
const WX_DAYP = 0.2;
function wxLayer(kind) {
  if (WXS.layers[kind]) return WXS.layers[kind];
  const K = WX_KINDS[kind]; if (!K) return null;
  const N = Math.ceil(K.n * 1.4), r = mulberry32(7919 + kind.length * 131 + kind.charCodeAt(0) * 17);
  const seed = new Float32Array(N * 16), cor = new Float32Array(N * 8), idx = new (N * 4 > 65535 ? Uint32Array : Uint16Array)(N * 6), C = [-1, -1, 1, -1, 1, 1, -1, 1];
  for (let i = 0; i < N; i++) {
    const s0 = r(), s1 = r(), s2 = r(), s3 = (i + r()) / N;   // w ascends with the index: drawRange = the first uN * N
    for (let v = 0; v < 4; v++) { const o = (i * 4 + v) * 4; seed[o] = s0; seed[o + 1] = s1; seed[o + 2] = s2; seed[o + 3] = s3; cor[(i * 4 + v) * 2] = C[v * 2]; cor[(i * 4 + v) * 2 + 1] = C[v * 2 + 1]; }
    const b = i * 4, j = i * 6; idx[j] = b; idx[j + 1] = b + 1; idx[j + 2] = b + 2; idx[j + 3] = b; idx[j + 4] = b + 2; idx[j + 5] = b + 3;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 12), 3)); geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4)); geo.setAttribute('aCorner', new THREE.BufferAttribute(cor, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1)); geo.setDrawRange(0, 0); geo.userData.shared = true;
  const defs = { WX_MOVE: K.move, WX_SHAPE: K.shape };
  if (K.add) defs.WX_ADD = 1; if (K.spin) defs.WX_SPIN = 1; if (K.blink) defs.WX_BLINK = 1; if (K.rainbow) defs.WX_RAINBOW = 1;
  if (K.move === 5 && renderer.capabilities.maxVertexTextures > 0) defs.WX_GROUND = 1; if (kind === 'ash') defs.WX_EMBERS = 1; if (kind === 'leaves') defs.WX_LEAF = 1; if (K.torch) defs.WX_TORCH = 1;
  const U = Object.assign({ uN: { value: 0 }, uBox: { value: 30 }, uH: { value: new THREE.Vector2(K.h[0], K.h[1]) }, uFall: { value: K.fall || 0 }, uSway: { value: K.sway || 0 }, uLife: { value: K.life || 1 },
    uSize: { value: new THREE.Vector2(K.size[0], K.size[1]) }, uCol: { value: linCol(K.col) }, uCol2: { value: linCol(K.col2 !== undefined ? K.col2 : K.col) }, uA: { value: K.a }, uHdr: { value: K.hdr || 1 }, uTF: { value: K.tf || 0 } }, WXU);
  const mat = new THREE.ShaderMaterial({ uniforms: U, defines: defs, vertexShader: WX_VS, fragmentShader: WX_FS, transparent: true, depthWrite: false, blending: K.add ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 6; mesh.visible = false; mesh.matrixAutoUpdate = false; mesh.name = 'wx_' + kind; scene.add(mesh);
  return (WXS.layers[kind] = { kind, K, N, mesh, U, want: 0 });
}
// Time-of-day target with the map's overrides, colours converted to linear once.
function wxTarget(T, o) {
  const X = Object.assign({}, T, o && typeof o === 'object' ? o : {});
  X.grade = Object.assign({}, T.grade, (o && o.grade) || {}); X.lt = Object.assign({}, T.lt, (o && o.lt) || {});
  X.skyL = [_hexOr(X.sky[0], T.sky[0]), _hexOr(X.sky[1], T.sky[1])]; X.hazeL = _hexOr(X.haze, T.haze); X.sunL = _hexOr(X.sun, T.sun);
  X.hemiL = [_hexOr(X.hemi[0], T.hemi[0]), _hexOr(X.hemi[1], T.hemi[1])]; X.mistL = _hexOr(X.mist, T.mist); X.volL = _hexOr(X.vol, T.vol);
  return X;
}
function wxEnter(m) {
  const R = RL, Rd = (m.d && m.d.render) || {};
  const famKey = Object.keys(RLOOK_BASE).find(k => m.id === k || m.id.startsWith(k + '_'));
  let W = (Rd.weather && typeof Rd.weather === 'object' ? Rd.weather : null) || (R.weather && typeof R.weather === 'object' ? R.weather : null) || WX_MAPS[m.id] || (famKey && WX_MAPS[famKey]) || WX_FROM_PART[Rd.particles] || {};
  // cycle 9: caves get drips and torch-lit dust unless render.weather lists its own (render.cave.drips / dust scale them)
  const kd = mapKind(m);
  if (kd === 'cave' && !(Array.isArray(W.amb) && W.amb.length) && !(Array.isArray(W.precip) && W.precip.length)) { const C = caveCfg(m); W = Object.assign({}, W, { amb: [['drip', C.drips], ['cavedust', C.dust]].filter(e => e[1] > 0) }); }
  WXS.caveWet = kd === 'cave' ? caveCfg(m).wet * 0.75 : 0;
  const tod = Rd.tod !== undefined ? Rd.tod : R.tod !== undefined ? R.tod : W.tod !== undefined ? W.tod : (m.d.gen === 'field' || m.d.gen === 'town');
  const amb = (Array.isArray(W.amb) ? W.amb : []).filter(e => Array.isArray(e) && WX_KINDS[e[0]]);
  const precip = (Array.isArray(W.precip) ? W.precip : []).filter(e => Array.isArray(e) && (e[0] === null || e[0] === 'rain' || e[0] === 'snow'));
  WXS.cfg = { tod: tod === true ? true : typeof tod === 'number' && isFinite(tod) ? ((tod % 1) + 1) % 1 : false, amb, precip, wind: Array.isArray(W.wind) && W.wind.length === 2 ? W.wind.map(Number) : [0.5, 0.2] };
  const kinds = new Set(amb.map(e => e[0])); for (const e of precip) if (e[0]) { kinds.add(e[0]); if (e[0] === 'rain') kinds.add('splash'); }
  if (kinds.has('drip')) kinds.add('dripring');
  if (WXS.forceW && WXS.forceW.kind) { kinds.add(WXS.forceW.kind); if (WXS.forceW.kind === 'rain') kinds.add('splash'); }
  WXS.used = kinds; for (const k of kinds) wxLayer(k);
  let st = WXS.maps[m.id];
  if (!st) {   // first visit: the first precip state (the map's usual weather), later ones picked at random
    st = WXS.maps[m.id] = { rng: mulberry32((m.d.seed || 1) * 7919 + 17), kind: null, i: 0, tgt: 0, until: 0 };
    const e = precip[0]; st.kind = e && e[0] ? e[0] : ((precip.find(q => q[0]) || [null])[0]); st.tgt = st.i = e && e[0] ? clamp(+e[1] || 0, 0, 1.5) : 0;
    st.until = WXS.t + (e ? Math.max(0.3, +e[2] || 3) : 5) * 60;
  }
  WXS.wet = Math.max(st.kind === 'rain' ? Math.min(1, st.i) : 0, WXS.caveWet);
  WXS.look = wxLook(R); GFX.look = WXS.look; WXS.day = wxDay(R);
  WXS.night = wxTarget(WX_NIGHT, R.night || Rd.night); WXS.dusk = wxTarget(WX_DUSK, R.dusk || Rd.dusk); WXS.dawn = wxTarget(WX_DAWN, R.dusk || Rd.dusk);
  WXS.on = true; WXS.dirty = true; WXS._lampE = -1;
  wxUpdate(0);
}
function wxLook(R) {
  const X = Object.assign({}, R), G = R.grade || RLOOK.ashen_fields.grade, a3 = (v, d) => (Array.isArray(v) && v.length === 3 ? v : d).slice();
  X.grade = { lift: a3(G.lift, [0, 0, 0]), gamma: a3(G.gamma, [1, 1, 1]), gain: a3(G.gain, [1, 1, 1]), shadowTint: a3(G.shadowTint, [0, 0, 0]), highTint: a3(G.highTint, [0, 0, 0]), sat: G.sat === undefined ? 1 : G.sat, contrast: G.contrast === undefined ? 1 : G.contrast };
  X.bloom = Object.assign({}, R.bloom); X.fog = R.fog.slice(); X.lt = { amb: R.lt.amb.slice(), sun: R.lt.sun.slice() };
  if (R.mist) X.mist = Object.assign({}, R.mist, { lin: new THREE.Color() });
  if (R.hfog) X.hfog = Object.assign({}, R.hfog, { lin: new THREE.Color() });
  if (R.vol) X.vol = Object.assign({}, R.vol, { lin: new THREE.Color() });
  return X;
}
function wxDay(R) {
  return { top: linCol(R.sky[0]), hor: linCol(R.sky[1]), haze: linCol(R.haze), sunC: linCol(R.sun[0]), sunI: R.sun[1], hemiS: linCol(R.hemi[0]), hemiG: linCol(R.hemi[1]), hemiI: R.hemi[2],
    exp: R.exposure, torchI: R.torch[1], torchD: R.torch[2], mist: R.mist ? _hexOr(R.mist.col, R.haze) : null, hfog: R.hfog ? _hexOr(R.hfog.col, R.haze) : null, vol: R.vol ? _hexOr(R.vol.col, 0xfff0c0) : null };
}
// Pick the next precipitation state (weighted, seeded per map).
function wxPick(st) {
  const L = WXS.cfg.precip; if (!L.length) { st.tgt = 0; st.until = WXS.t + 600; return; }
  let tot = 0; for (const e of L) tot += +e[3] || 1;
  let x = st.rng() * tot, e = L[L.length - 1]; for (const q of L) { x -= +q[3] || 1; if (x <= 0) { e = q; break; } }
  if (e[0]) st.kind = e[0];
  st.tgt = e[0] ? clamp(+e[1] || 0, 0, 1.5) : 0;
  st.until = WXS.t + Math.max(0.3, +e[2] || 3) * 60 * (0.7 + 0.6 * st.rng());
}
const _wc = new THREE.Color(), _wl = new THREE.Color();
const wxLerp = (a, b, t) => a + (b - a) * t;
function wxUpdate(dt) {
  if (!WXS.on || !WXS.cfg || !map) return;
  WXS.t += dt; if (WXS.lock === null) WXS.clock = (WXS.clock + dt / WXS.dayLen) % 1;
  const cfg = WXS.cfg, st = WXS.maps[map.id];
  const p = cfg.tod === false ? WX_DAYP : typeof cfg.tod === 'number' ? cfg.tod : WXS.force !== null ? WXS.force : WXS.lock !== null ? WXS.lock : WXS.clock;
  WXS.phase = p;
  WXS.d = smoothstep(0.47, 0.55, p) * (1 - smoothstep(0.58, 0.645, p)) + smoothstep(0.865, 0.92, p) * (1 - smoothstep(0.95, 1.0, p));
  WXS.n = smoothstep(0.58, 0.645, p) * (1 - smoothstep(0.865, 0.92, p)); WXS.dawnF = p > 0.8;
  let rain = 0, snow = 0;
  if (WXS.forceW) { const k = WXS.forceW.kind; if (k === 'rain') rain = WXS.forceW.i; else if (k === 'snow') snow = WXS.forceW.i; }
  else if (st) {
    if (WXS.t >= st.until) wxPick(st);
    st.i += (st.tgt - st.i) * Math.min(1, dt / 9); if (Math.abs(st.tgt - st.i) < 0.002) st.i = st.tgt;
    if (st.kind === 'rain') rain = st.i; else if (st.kind === 'snow') snow = st.i;
  }
  WXS.rain = rain; WXS.snow = snow;
  // the ground soaks in ~6 s and dries over ~40 s
  const wt = Math.max(Math.min(1, rain), WXS.caveWet); WXS.wet += (wt - WXS.wet) * Math.min(1, dt / (wt > WXS.wet ? 6 : 40)); if (Math.abs(wt - WXS.wet) < 0.002) WXS.wet = wt;
  if (WXS.forceW) WXS.wet = Math.min(1, rain);
  wxApply();
  wxParticles();
}
// Blend the live look (WXS.look, read by gfx-post) and the scene lights from the day values toward dusk / dawn / night,
// then overcast. At day with clear weather every value is the map's own (identical frames).
function wxApply() {
  const R = RL, X = WXS.look, D = WXS.day; if (!R || !X || !D) return;
  const n = WXS.n, d = WXS.d, rain = WXS.rain, snow = WXS.snow, wet = WXS.wet;
  if (!WXS.dirty && n === WXS._n && d === WXS._d && rain === WXS._r && snow === WXS._s && wet === WXS._w) return;
  WXS._n = n; WXS._d = d; WXS._r = rain; WXS._s = snow; WXS._w = wet; WXS.dirty = false;
  const Tk = WXS.dawnF ? WXS.dawn : WXS.dusk, N = WXS.night, g = Math.max(rain, snow * 0.6), post = GFX.preset.post;
  const sky3 = (out, day, tc, nc) => {
    out.copy(day);
    if (d > 0) out.lerp(_wc.copy(day).multiplyScalar(Tk.dim).lerp(tc, Tk.mix), d);
    if (n > 0) out.lerp(_wc.copy(day).multiplyScalar(N.dim).lerp(nc, N.mix), n);
    if (g > 0) { const l = out.r * 0.2126 + out.g * 0.7152 + out.b * 0.0722; out.lerp(_wc.setRGB(l, l, l * 1.05), 0.45 * g).multiplyScalar(1 - 0.12 * g); }
    return out;
  };
  sky3(SKY.top, D.top, Tk.skyL[0], N.skyL[0]); sky3(SKY.hor, D.hor, Tk.skyL[1], N.skyL[1]); sky3(SKY.hazeLin, D.haze, Tk.hazeL, N.hazeL);
  const exp = D.exp * (1 + (Tk.exp - 1) * d) * (1 + (N.exp - 1) * n);
  X.exposure = exp; SKY.exposure = exp; renderer.toneMappingExposure = exp;
  SKY.fogOut.copy(post ? SKY.hazeLin : acesDisplay(SKY.hazeLin, exp));
  if (scene.fog) scene.fog.color.copy(SKY.fogOut);
  if (scene.background && scene.background.isColor) scene.background.copy(SKY.fogOut);
  sun.color.copy(D.sunC).lerp(Tk.sunL, d).lerp(N.sunL, n);
  sun.intensity = D.sunI * (1 + (Tk.sunK - 1) * d) * (1 + (N.sunK - 1) * n) * (1 - 0.55 * rain - 0.3 * snow);
  hemi.color.copy(D.hemiS).lerp(Tk.hemiL[0], d * 0.6).lerp(N.hemiL[0], n * 0.8);
  hemi.groundColor.copy(D.hemiG).lerp(Tk.hemiL[1], d * 0.5).lerp(N.hemiL[1], n * 0.8);
  hemi.intensity = D.hemiI * (1 + (Tk.hemiK - 1) * d) * (1 + (N.hemiK - 1) * n) * (1 - 0.1 * g);
  X.bloom.threshold = wxLerp(wxLerp(R.bloom.threshold, Tk.bloomThr, d), N.bloomThr, n);
  X.bloom.strength = R.bloom.strength * (1 + (Tk.bloomK - 1) * d) * (1 + (N.bloomK - 1) * n);
  const G0 = R.grade || RLOOK.ashen_fields.grade;
  for (const k of ['lift', 'gamma', 'gain', 'shadowTint', 'highTint']) { const a = X.grade[k], b0 = Array.isArray(G0[k]) ? G0[k] : a; for (let i = 0; i < 3; i++) a[i] = wxLerp(wxLerp(b0[i], Tk.grade[k][i], d), N.grade[k][i], n); }
  X.grade.sat = (G0.sat === undefined ? 1 : G0.sat) * (1 + (Tk.sat - 1) * d) * (1 + (N.sat - 1) * n) * (1 - 0.15 * g);
  X.grade.contrast = (G0.contrast === undefined ? 1 : G0.contrast) * (1 + (Tk.con - 1) * d) * (1 + (N.con - 1) * n) * (1 - 0.05 * g);
  X.vignette = R.vignette + Tk.vig * d + N.vig * n + 0.04 * g;
  X.fog[0] = R.fog[0] * (1 - 0.3 * rain - 0.4 * snow); X.fog[1] = R.fog[1] * (1 - 0.25 * rain - 0.35 * snow);
  if (X.mist) {
    X.mist.lin.copy(D.mist).lerp(Tk.mistL, d * 0.7).lerp(N.mistL, n * 0.8);
    const M = R.mist; X.mist.amb = (M.amb === undefined ? 1 : M.amb) * (1 + (Tk.mistAmb - 1) * d) * (1 + (N.mistAmb - 1) * n);
    X.mist.amt = (M.amt || 0) * (1 + 0.3 * rain + 1.0 * snow); X.mist.max = (M.max || 0.5) * (1 + 0.2 * rain + 0.6 * snow);
  }
  if (X.hfog) { X.hfog.lin.copy(D.hfog).lerp(Tk.hazeL, d * 0.4).lerp(N.hazeL, n * 0.7); X.hfog.amt = (R.hfog.amt || 0) * (1 + 0.6 * g); }
  if (X.vol) { X.vol.lin.copy(D.vol).lerp(Tk.volL, d).lerp(N.volL, n); X.vol.k = (R.vol.k || 1) * (1 + (Tk.volK - 1) * d) * (1 + (N.volK - 1) * n); X.vol.dens = R.vol.dens * (1 - 0.8 * g); }
  // sprites: ambient + sun (moon) light, fires grow brighter at night
  const la = R.lt.amb, ls = R.lt.sun, sk = 1 - 0.5 * rain - 0.25 * snow;
  for (let i = 0; i < 3; i++) {
    X.lt.amb[i] = wxLerp(la[i] * (1 + (Tk.lt.ambK[i] - 1) * d), N.lt.amb[i], n) * (1 - 0.08 * g);
    X.lt.sun[i] = wxLerp(ls[i] * (1 + (Tk.lt.sunK[i] - 1) * d), N.lt.sun[i], n) * sk;
  }
  WXS.lamp = 1 + 1.3 * n + 0.45 * d + 0.15 * g;
  LT.amb = X.lt.amb; LT.sun = X.lt.sun; LT.lamp = WXS.lamp;
  torch.intensity = Math.max(D.torchI, N.torch * n + Tk.torch * d); torch.distance = n > 0.05 || d > 0.3 ? Math.max(D.torchD, 9) : D.torchD; WXS.torchI = torch.intensity;
  // rain / overcast / night on the other shaders
  WETU.uWet.value.set(wet, Math.min(1, wet * 1.3), 0); WETU.uWetSky.value.copy(SKY.hor).lerp(SKY.top, 0.5); WETU.uWetSunC.value.copy(sun.color).multiplyScalar(sun.intensity * 1.2);
  WATERU.uRain.value = rain; WATERU.uGlint.value = clamp(sun.intensity / Math.max(D.sunI, 0.01), 0, 1.3);
  SHAFTU.uFade.value = (1 - 0.85 * g) * (1 - n) * (1 - 0.4 * d);
  MOTEU.uK.value = (1 - 0.75 * n) * (1 - 0.6 * g);
  POOLU.uLamp.value = 1 + (WXS.lamp - 1) * 0.45;
  wxEmissive();
}
// Lantern glass, coals and house windows come alive at night (the prop templates' materials, shared by every map).
const WX_EMIS = { emissive_lamp: 1, emissive_coals: 0.6, emissive_bog: 0.8, emissive_rune_gold: 0.5, emissive_shroom: 0.6, emissive_crystal_ice: 0.4, emissive_soul: 0.5, emissive_soul_dim: 0.5 };
function wxEmissive() {
  const nT = Object.keys(PROPS.tpl).length;
  if (!WXS.emis || WXS.emisN !== nT) {
    const seen = new Set(WXS.emis ? WXS.emis.map(e => e.m) : []), L = WXS.emis || [];
    for (const id in PROPS.tpl) for (const pt of PROPS.tpl[id].parts) {
      const m = pt.mat; if (!m || seen.has(m) || !m.emissive) continue;
      if (WX_EMIS[m.name] !== undefined) { L.push({ m, k: WX_EMIS[m.name], base: m.emissiveIntensity }); seen.add(m); }
      else if (m.name === 'glass') { L.push({ m, glass: true, base: m.emissive.clone() }); seen.add(m); }
    }
    WXS.emis = L; WXS.emisN = nT; WXS._lampE = -1;
  }
  if (WXS._lampE === WXS.lamp) return; WXS._lampE = WXS.lamp;
  const k = WXS.lamp - 1, win = 0.95 * WXS.n + 0.3 * WXS.d;
  for (const e of WXS.emis) {
    if (e.glass) e.m.emissive.copy(e.base).add(_wl.setRGB(1.0, 0.56, 0.24).multiplyScalar(win * 1.6));
    else e.m.emissiveIntensity = e.base * (1 + k * e.k * 0.6);
  }
}
const _wdb = new THREE.Vector2();
function wxParticles() {
  const cfg = WXS.cfg, q = GFX.preset.wx === undefined ? 1 : GFX.preset.wx;
  for (const k in WXS.layers) WXS.layers[k].want = 0;
  for (const e of cfg.amb) {
    const L = WXS.layers[e[0]]; if (!L) continue; let i = +e[1] || 0; const k = e[0];
    if (k === 'fireflies') { const dk = e[2] !== undefined ? +e[2] : 0; i *= (dk + (1 - dk) * Math.max(WXS.n, WXS.d * 0.6)) * (1 - WXS.rain); }
    else if (k === 'pollen' || k === 'spores') i *= (1 - 0.7 * WXS.n) * (1 - 0.8 * WXS.rain);
    else if (k === 'leaves') i *= 1 - 0.4 * WXS.rain;
    L.want += i;
  }
  if (WXS.layers.rain) WXS.layers.rain.want += WXS.rain; if (WXS.layers.splash) WXS.layers.splash.want += WXS.rain; if (WXS.layers.snow) WXS.layers.snow.want += WXS.snow;
  if (WXS.layers.dripring && WXS.layers.drip) WXS.layers.dripring.want += WXS.layers.drip.want;
  const fk = WXS.forceW && WXS.forceW.kind; if (fk && fk !== 'rain' && fk !== 'snow' && WXS.layers[fk]) WXS.layers[fk].want = Math.max(WXS.layers[fk].want, WXS.forceW.i);
  let any = false;
  for (const k in WXS.layers) {
    const L = WXS.layers[k], u = WXS.used.has(k) || k === fk ? clamp(L.want * q / 1.4, 0, 1) : 0, cnt = u > 0.0005 ? Math.min(L.N, Math.ceil(u * L.N) + 2) : 0;
    L.U.uN.value = u; L.mesh.visible = cnt > 0; L.mesh.geometry.setDrawRange(0, cnt * 6); L.U.uBox.value = Math.max(12, cam.dist * L.K.box);
    if (cnt > 0 && k !== 'fireflies') any = true;
  }
  WXS.screenParts = !any;   // (a hint for the 2D screen particles in gfx-render.js: 3D weather replaces them)
  const U = WXU, hg = GFX.world && GFX.world.hgt;
  U.uT.value = typeof time === 'number' ? time : WXS.t; U.uC.value.set(cam.tx, cam.th, cam.ty); U.uCamD.value.set(Math.sin(cam.yaw), Math.cos(cam.yaw)); U.uCot.value = 1 / Math.tan(cam.pitch);
  U.uWind.value.set(cfg.wind[0], cfg.wind[1]); U.uTorchR.value.set(RL && RL.torch ? RL.torch[2] || 11 : 11, 0);
  U.uPx.value = 2 * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, renderer.getDrawingBufferSize(_wdb).y * (GFX.composer && GFX.composer.on ? GFX.composer.scale : 1));
  const D = WXS.day; if (D) { const den = D.hemiI + D.sunI * 0.55 || 1; U.uLit.value.copy(hemi.color).multiplyScalar(hemi.intensity / den).add(_wc.copy(sun.color).multiplyScalar(sun.intensity * 0.55 / den)); }
  if (hg) { U.tHgt.value = hg.tex; U.uHgt.value.set(1 / hg.w1, 1 / hg.h1, hg.min, hg.range); } else { U.tHgt.value = null; U.uHgt.value.set(0, 0, 0, 0); }
  const W = RL && RL.water; U.uLevel.value = map && map.anim && map.anim.water ? (W && isFinite(W.level) ? +W.level : -0.45) : -99;
}
GFX.wx = WXS;
GFX.wx.info = () => ({ phase: +WXS.phase.toFixed(3), night: +WXS.n.toFixed(3), dusk: +WXS.d.toFixed(3), rain: +WXS.rain.toFixed(3), snow: +WXS.snow.toFixed(3), wet: +WXS.wet.toFixed(3), lamp: +WXS.lamp.toFixed(3),
  tod: WXS.cfg ? WXS.cfg.tod : null, layers: Object.fromEntries(Object.entries(WXS.layers).filter(e => e[1].mesh.visible).map(([k, L]) => [k, Math.round(L.U.uN.value * L.N)])) });
// p: 0..1 day phase (0.2 day, 0.55 dusk, 0.75 night, 0.93 dawn); null = the running clock
GFX.setTime = p => { WXS.force = p === null || p === undefined || !isFinite(p) ? null : ((+p % 1) + 1) % 1; WXS.dirty = true; return WXS.force; };
// story scenes: hold the clock at phase p (null releases it); maps with tod: false stay locked at day anyway
GFX.lockTime = p => { WXS.lock = p === null || p === undefined || !isFinite(p) ? null : ((+p % 1) + 1) % 1; WXS.dirty = true; return WXS.lock; };
// force a weather ('rain' | 'snow' | an ambient kind, intensity) on every map; null = back to the natural cycle
GFX.setWeather = (kind, i) => {
  WXS.forceW = kind && WX_KINDS[kind] ? { kind, i: i === undefined ? 1 : +i || 0 } : null; WXS.dirty = true;
  if (WXS.forceW) { wxLayer(kind); if (kind === 'rain') wxLayer('splash'); }
  return WXS.forceW;
};

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

/* =========================================================
   Cycle 9 (world expansion): m.lights, doors, interior walls, cave rock, cave mouths, placeholders, big-map sectors
   ========================================================= */
const cssRGBA = (c, a) => `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
// m.lights (core.js, every map): [{ x, y, col, r, i }] plus optional render fields: h (height above the ground), kind
// ('hearth' | 'fire' | 'forge' | 'candle' | 'torch' | 'lantern' | 'lamp' | 'chandelier' | 'crystal' | 'mushroom' | ...),
// flame (true / false: draw a flame sprite; default for fire kinds), fl (flicker 0..1; default 0.55 fires, 0.12 others).
function mapLights(m) {
  const src = m && Array.isArray(m.lights) ? m.lights : [];
  if (m._gl && m._glSrc === src && m._glN === src.length) return m._gl;
  const out = [];
  for (const l of src) {
    if (!l || !isFinite(l.x) || !isFinite(l.y)) continue;
    let c; try { c = new THREE.Color(l.col !== undefined && l.col !== null ? l.col : 0xffb060); } catch (e) { c = new THREE.Color(0xffb060); }
    const kind = typeof l.kind === 'string' ? l.kind : '', fire = /fire|hearth|candle|torch|brazier|forge|lamp|lantern|chandelier/.test(kind);
    out.push({ x: +l.x, y: +l.y, c, lin: c.clone().convertSRGBToLinear(), i: clamp(isFinite(l.i) ? +l.i : 1, 0, 8), r: clamp(isFinite(l.r) ? +l.r : 5, 0.5, 24), kind, fire,
      flame: l.flame !== undefined ? !!l.flame : fire && !/lamp|lantern|chandelier/.test(kind),
      h: isFinite(l.h) ? +l.h : kind === 'hearth' || kind === 'forge' || kind === 'fire' ? 0.55 : kind === 'candle' ? 1.0 : kind === 'torch' ? 1.9 : kind === 'chandelier' ? 2.4 : 1.3,
      fl: isFinite(l.fl) ? clamp(+l.fl, 0, 1) : fire ? 0.55 : 0.12 });
  }
  m._gl = out; m._glSrc = src; m._glN = src.length; return out;
}
// Warp visuals: '' = the generic portal; 'door' = into a building / a deeper room (warm light); 'exit' = the way out of an
// interior or a cave (daylight); 'mouth' = door:'cave' on an overworld map (the cave_mouth set piece, a dark opening).
function doorKind(wp, m) {
  if (!wp || !wp.door) return '';
  const k = mapKind(m), to = typeof MAPDEFS !== 'undefined' && wp.to && MAPDEFS[wp.to], tk = to ? (to.render && to.render.kind) || (to.gen === 'cave' || to.gen === 'interior' ? to.gen : '') : '';
  if (wp.door === 'cave') return k === 'cave' ? 'exit' : k === 'interior' ? 'door' : 'mouth';
  return k && tk !== 'cave' && tk !== 'interior' ? 'exit' : 'door';
}
// A door tile's orientation: (nx, nz) = unit direction toward the walkable side; inWall = both sides along the wall line
// are T.WALL (a doorway in a wall: it gets a frame).
function doorDir(wp, m) {
  const w = m.w, h = m.h, t = (x, y) => x < 0 || y < 0 || x >= w || y >= h ? T.WALL : m.t[y * w + x], open = (x, y) => t(x, y) === 0;
  const x = wp.x, y = wp.y; let nx = 0, nz = 0;
  const bx = !open(x - 1, y) && !open(x + 1, y), bz = !open(x, y - 1) && !open(x, y + 1);
  if (bx && !bz) nz = open(x, y + 1) ? 1 : -1;
  else if (bz && !bx) nx = open(x + 1, y) ? 1 : -1;
  else { for (let k = 0; k < 8; k++) if (open(x + DX[k], y + DY[k])) { nx += DX[k]; nz += DY[k]; } if (!nx && !nz) nz = 1; }
  const l = Math.hypot(nx, nz); nx /= l; nz /= l;
  const ax = Math.round(nz), az = -Math.round(nx);   // along the wall line
  return { nx, nz, inWall: (ax || az) ? t(x + ax, y + az) === T.WALL && t(x - ax, y - az) === T.WALL : false };
}
// warm glow painted in a doorway (bright at the threshold, fading up and to the jambs)
TEX.door = (() => {
  const W = 64, H = 128, c = mkCanvas(W, H), g = c.getContext('2d'), img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = Math.abs((x + 0.5) / W * 2 - 1), v = 1 - (y + 0.5) / H, top = v > 0.82 ? Math.hypot(u, (v - 0.82) / 0.18) : u;
    const a = (1 - smoothstep(0.5, 1, top)) * (0.35 + 0.65 * (1 - smoothstep(0.0, 0.95, v))), o = (y * W + x) * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = 255; img.data[o + 3] = a * 255;
  }
  g.putImageData(img, 0, 0); return canvasTex(c);
})();
// the dark inside of a procedural cave mouth: an arch of black, soft at the rim
TEX.mouth = (() => {
  const S = 128, c = mkCanvas(S, S), g = c.getContext('2d'), img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x + 0.5) / S * 2 - 1, v = 1 - (y + 0.5) / S, d = v < 0.45 ? Math.abs(u) : Math.hypot(u, (v - 0.45) / 0.55);
    const a = 1 - smoothstep(0.62, 0.98, d), o = (y * S + x) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = 0; img.data[o + 3] = a * 255;
  }
  g.putImageData(img, 0, 0); return canvasTex(c);
})();
// window pane: a bright sky with a cross mullion and a lead grid
TEX.pane = (() => {
  const W = 64, H = 80, c = mkCanvas(W, H), g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#fff6dc'); gr.addColorStop(1, '#d8e4f0'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(40,28,18,.55)'; g.lineWidth = 1; for (let x = 8; x < W; x += 12) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); } for (let y = 8; y < H; y += 12) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  g.fillStyle = '#3a2616'; g.fillRect(W / 2 - 3, 0, 6, H); g.fillRect(0, H / 2 - 3, W, 6); g.lineWidth = 6; g.strokeStyle = '#3a2616'; g.strokeRect(0, 0, W, H);
  return canvasTex(c);
})();
// window light (left half: a soft vertical shaft; right half: a round floor patch)
TEX.winLight = (() => {
  const W = 128, H = 128, c = mkCanvas(W, H), g = c.getContext('2d'), img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let a; const v = 1 - (y + 0.5) / H;
    if (x < 64) { const u = Math.abs((x + 0.5) / 64 * 2 - 1); a = Math.pow(1 - u * u, 1.4) * smoothstep(0, 0.3, v) * (1 - smoothstep(0.7, 1, v) * 0.6) * (0.8 + 0.2 * tnoise(x / 9, y / 40, 8, 17)); }
    else { const u = (x - 64 + 0.5) / 64 * 2 - 1, w = v * 2 - 1; a = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u), 2.2) - Math.pow(Math.abs(w), 2.2)), 1.3); }
    const o = (y * W + x) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = 255; img.data[o + 3] = a * 255;
  }
  g.putImageData(img, 0, 0); return canvasTex(c);
})();

/* ---------- Interior walls (render.kind 'interior'): T.WALL tiles as proper room walls ----------
   One merged mesh: every drawn wall tile (m.vis) is a block of the wall kind's height with trim (top beam, baseboard) in
   the wall texture; its four sides and a cap. Each vertex carries aW = (inward x, inward z, flag, base y): the walls whose
   room lies beyond them from the camera (dot(inward, camera direction) < 0) are cut down to a low stub in the vertex
   shader as the camera turns (HD-2D diorama), the cut caps go dark, and every wall between the camera and the hero
   dissolves in the occluder dither (same as tree canopies). Flags: 0 bottom, 1 top (cut), 2 cap (cut), 3 static
   (ceiling beams: they only dither). Walls do not cast sun shadows (the faint window fill would shade the room from walls
   that are cut away). */
const IWTEX = {};
function interiorWallTex(kind, trim) {
  const key = kind + '|' + trim; if (IWTEX[key]) return IWTEX[key];
  const S = 256, c = mkCanvas(S, S), g = c.getContext('2d'), r = mulberry32(kind.length * 977 + (trim & 0xffff));
  const tc = new THREE.Color(trim), tr = (k, a) => `rgba(${clamp(tc.r * 255 * k, 0, 255) | 0},${clamp(tc.g * 255 * k, 0, 255) | 0},${clamp(tc.b * 255 * k, 0, 255) | 0},${a === undefined ? 1 : a})`;
  const speck = (n, a, c0, c1) => { for (let i = 0; i < n; i++) { g.fillStyle = r() < 0.5 ? c0 : c1; g.globalAlpha = a * r(); g.fillRect(r() * S, r() * S, 1 + r() * 3, 1 + r() * 3); } g.globalAlpha = 1; };
  const grainV = (x, y, w, h) => { for (let i = 0; i < w / 2; i++) { g.strokeStyle = `rgba(20,10,4,${0.1 + r() * 0.15})`; g.lineWidth = 1; g.beginPath(); const gx = x + r() * w; g.moveTo(gx, y); g.lineTo(gx + (r() - 0.5) * 3, y + h); g.stroke(); } };
  const grainH = (x, y, w, h) => { for (let i = 0; i < h / 2; i++) { g.strokeStyle = `rgba(20,10,4,${0.1 + r() * 0.15})`; g.lineWidth = 1; g.beginPath(); const gy = y + r() * h; g.moveTo(x, gy); g.lineTo(x + w, gy + (r() - 0.5) * 3); g.stroke(); } };
  const BB = 22, TB = 20;   // baseboard / top beam (px of 256 = the wall's height; x: 256 px = 2 tiles)
  if (kind === 'timber') {        // Tudor plaster panels in a dark timber frame
    g.fillStyle = '#e6d5b0'; g.fillRect(0, 0, S, S); speck(900, 0.2, '#b89c70', '#fff4dc');
    const st = g.createLinearGradient(0, S * 0.55, 0, S); st.addColorStop(0, 'rgba(90,60,30,0)'); st.addColorStop(1, 'rgba(90,60,30,.35)'); g.fillStyle = st; g.fillRect(0, S * 0.55, S, S * 0.45);
    g.save(); g.lineWidth = 11; g.strokeStyle = tr(0.95); g.beginPath(); g.moveTo(10, S - BB); g.lineTo(118, 128); g.moveTo(246, 118); g.lineTo(138, TB); g.stroke(); g.restore();
    g.fillStyle = tr(1); for (const x of [0, 128, 256]) g.fillRect(x - 8, 0, 16, S); g.fillRect(0, 116, S, 12);
    grainV(0, 0, 8, S); grainV(120, 0, 16, S); grainV(248, 0, 8, S); grainH(0, 116, S, 12);
  } else if (kind === 'stone') {  // ashlar courses
    g.fillStyle = '#4a4640'; g.fillRect(0, 0, S, S);
    for (let y = TB, row = 0; y < S - BB; y += 30, row++) { let x = row % 2 ? -30 : 0; while (x < S) { const bw = 44 + (r() * 40 | 0), v = 118 + r() * 40 | 0; g.fillStyle = `rgb(${v},${v - 6},${v - 14})`; g.fillRect(x + 2, y + 2, bw - 3, 27); g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(x + 2, y + 2, bw - 3, 3); g.fillStyle = 'rgba(0,0,0,.15)'; g.fillRect(x + 2, y + 25, bw - 3, 4); x += bw; } }
    speck(700, 0.22, '#3a3632', '#d8d0c4');
  } else if (kind === 'dwarf') {  // dark dwarf-cut blocks with a gold rune band
    g.fillStyle = '#1c1a1e'; g.fillRect(0, 0, S, S);
    for (let y = TB, row = 0; y < S - BB; y += 46, row++) { let x = row % 2 ? -48 : 0; while (x < S) { const v = 56 + r() * 22 | 0; g.fillStyle = `rgb(${v},${v - 2},${v + 5})`; g.fillRect(x + 2, y + 2, 92, 42); g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 2; g.strokeRect(x + 6, y + 6, 84, 34); x += 96; } }
    g.fillStyle = tr(0.45); g.fillRect(0, 150, S, 24); g.strokeStyle = tr(1.25); g.lineWidth = 2;
    for (let x = 6; x < S; x += 16) { g.beginPath(); const k = r() * 4 | 0; if (k === 0) { g.moveTo(x, 156); g.lineTo(x + 8, 168); g.moveTo(x + 8, 156); g.lineTo(x, 168); } else if (k === 1) { g.moveTo(x, 156); g.lineTo(x, 168); g.moveTo(x, 160); g.lineTo(x + 8, 156); } else if (k === 2) { g.moveTo(x, 156); g.lineTo(x + 4, 168); g.lineTo(x + 8, 156); } else { g.moveTo(x + 4, 156); g.lineTo(x + 4, 168); g.moveTo(x, 162); g.lineTo(x + 8, 162); } g.stroke(); }
    g.fillStyle = tr(1.1); g.fillRect(0, 147, S, 3); g.fillRect(0, 174, S, 3);
  } else {                        // hall: vertical planks under a painted band
    for (let x = 0; x < S;) { const pw = 18 + (r() * 10 | 0), v = 84 + r() * 30 | 0; g.fillStyle = `rgb(${v},${v * 0.66 | 0},${v * 0.42 | 0})`; g.fillRect(x, 0, pw, S); grainV(x, 0, pw, S); g.fillStyle = 'rgba(20,10,4,.6)'; g.fillRect(x, 0, 2, S); x += pw; }
    g.fillStyle = '#6a2a1a'; g.fillRect(0, 42, S, 20); g.fillStyle = '#c89a4a'; for (let x = 0; x < S; x += 16) { g.beginPath(); g.moveTo(x, 62); g.lineTo(x + 8, 45); g.lineTo(x + 16, 62); g.closePath(); g.fill(); }
  }
  g.fillStyle = tr(1); g.fillRect(0, 0, S, TB); g.fillRect(0, S - BB, S, BB);
  g.fillStyle = tr(1.4, 0.9); g.fillRect(0, TB - 3, S, 2); g.fillRect(0, S - BB, S, 2);
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, TB, S, 3); g.fillRect(0, S - 3, S, 3);
  if (kind === 'timber' || kind === 'hall') { grainH(0, 0, S, TB); grainH(0, S - BB, S, BB); }
  const t = canvasTex(c, { repeat: true }); t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return (IWTEX[key] = t);
}
const WALLU = { uCamD: { value: new THREE.Vector2(0, 1) }, uHero: { value: new THREE.Vector2(-999, -999) }, uCutOn: { value: 0 } };   // horizontal direction from the view target to the camera; the controlled hero
function wallMaterial(tex, H, stub) {
  const mat = new THREE.MeshPhongMaterial({ map: tex, specular: 0x141210, shininess: 10 });
  const U = Object.assign({ uWallH: { value: H }, uStubH: { value: stub } }, WALLU, OCC);
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aW; attribute vec2 aC; uniform vec2 uCamD, uHero; uniform float uWallH, uStubH; varying float vCap;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      { float cutK = max(smoothstep(0.12, 0.5, -dot(aW.xy, uCamD)), smoothstep(0.35, 1.1, dot(aC - uHero, uCamD))); vCap = step(1.5, aW.z) * step(aW.z, 2.5) * cutK;
        if (aW.z > 0.5 && aW.z < 2.5) transformed.y = aW.w + mix(uWallH, uStubH, cutK);
        #ifdef USE_UV
        if (aW.z < 1.5) vUv.y = (transformed.y - aW.w) / uWallH;
        #endif
      }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vCap;').replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= 1.0 - 0.62 * vCap;');
    occluder(sh);
  };
  mat.customProgramCacheKey = () => 'iwall';
  return mat;
}
// Kit wall blocks (manifest kind 'wall': interior_wall_*, cave_wall*; room side +Z): the same cutaway on interior / cave
// maps, per instance (inward = the instance's +Z, the tile = its position): the block is squashed to a 0.5 stub (its
// top face stays closed), plus the occluder dither. uCutOn is 0 on other maps.
function cutify(mat, tint) {
  if (mat.userData.cut) return mat; mat.userData.cut = true;
  const prev = mat.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile ? mat.onBeforeCompile : null;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    Object.assign(sh.uniforms, WALLU, OCC);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform vec2 uCamD, uHero; uniform float uCutOn; varying vec3 vCW;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
      { vec2 cIn = normalize((instanceMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xz + 1e-5), cC = instanceMatrix[3].xz;
        float cutK = uCutOn * max(smoothstep(0.12, 0.5, -dot(cIn, uCamD)), smoothstep(0.35, 1.1, dot(cC - uHero, uCamD)));
        vCW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        transformed.y *= mix(1.0, 0.2, cutK); }   // squashed to a 0.5 stub (the block keeps its top face)
      #endif`);
    if (tint) {   // cave walls: a world-space value-noise tint hides the per-tile seams of the repeated blocks
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 vCW;
        float cwH(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float cwN(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(cwH(i), cwH(i + vec3(1, 0, 0)), f.x), mix(cwH(i + vec3(0, 1, 0)), cwH(i + vec3(1, 1, 0)), f.x), f.y),
                     mix(mix(cwH(i + vec3(0, 0, 1)), cwH(i + vec3(1, 0, 1)), f.x), mix(cwH(i + vec3(0, 1, 1)), cwH(i + vec3(1, 1, 1)), f.x), f.y), f.z); }`)
        .replace('#include <map_fragment>', '#include <map_fragment>\n{ float cn = cwN(vCW * 1.7) * 0.55 + cwN(vCW * 0.45 + 7.1) * 0.45; diffuseColor.rgb *= 0.74 + 0.5 * cn; }');
    }
    if (!/vOccC/.test(sh.vertexShader)) occluder(sh);
  };
  const pk = mat.customProgramCacheKey && mat.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey ? mat.customProgramCacheKey() : '';
  mat.customProgramCacheKey = () => pk + (tint ? 'cutt' : 'cut');
  return mat;
}
// A kit wall block for tile (x, y) (art kit conventions, rotation about +Y): straight pieces face their room side +Z
// (N 0, W +pi/2, E -pi/2, S pi); `<base>_corner` (a spur: open on +Z and +X) where two adjacent sides are open;
// `<base>_inner` (open only toward the +X+Z diagonal) where only a diagonal is open. Returns [id, rotation].
const ROT4 = [0, Math.PI / 2, Math.PI, -Math.PI / 2];   // +Z -> +Z, +X, -Z, -X
function wallPiece(m, x, y, id) {
  const w = m.w, h = m.h, open = (xx, yy) => xx >= 0 && yy >= 0 && xx < w && yy < h && m.t[yy * w + xx] !== T.WALL;
  const S = [open(x, y + 1), open(x + 1, y), open(x, y - 1), open(x - 1, y)];   // +Z, +X, -Z, -X (same order as ROT4)
  const n = S[0] + S[1] + S[2] + S[3], base = id.replace(/_b$/, '');
  if (n === 2) for (let k = 0; k < 4; k++) if (S[k] && S[(k + 1) % 4] && hasModel(base + '_corner')) return [base + '_corner', ROT4[k]];
  if (n === 0) { const D = [open(x + 1, y + 1), open(x + 1, y - 1), open(x - 1, y - 1), open(x - 1, y + 1)]; for (let k = 0; k < 4; k++) if (D[k] && hasModel(base + '_inner')) return [base + '_inner', ROT4[k]]; }
  let nx = 0, nz = 0;
  for (let k = 0; k < 8; k++) { if (!open(x + DX[k], y + DY[k])) continue; const wk = DX[k] && DY[k] ? 0.5 : 1; nx += DX[k] * wk; nz += DY[k] * wk; }
  return [id, Math.abs(nx) > Math.abs(nz) ? (nx > 0 ? Math.PI / 2 : -Math.PI / 2) : nz < 0 ? Math.PI : 0];
}
function buildInteriorWalls(m, R, grp, A, plan) {
  const I = interiorCfg(m), WD = INT_WALL[I.wall], H = WD.h, w = m.w, h = m.h, Tt = m.t, W1 = w + 1;
  const wallAt = (x, y) => x < 0 || y < 0 || x >= w || y >= h || Tt[y * w + x] === T.WALL;
  const pos = [], nor = [], uv = [], aw = [], idx = []; let nv = 0;
  const ac = [], quad = (v, n, uvs, f, o) => { for (let k = 0; k < 4; k++) { pos.push(v[k][0], v[k][1], v[k][2]); nor.push(n[0], n[1], n[2]); uv.push(uvs[k][0], uvs[k][1]); aw.push(o[0], o[1], f[k], o[2]); ac.push(o[3] === undefined ? -999 : o[3], o[4] === undefined ? -999 : o[4]); } idx.push(nv, nv + 1, nv + 2, nv, nv + 2, nv + 3); nv += 4; };
  const SIDE = [0, 0, 1, 1], CAP = [2, 2, 2, 2], FIX = [3, 3, 3, 3], inward = new Float32Array(w * h * 2), base = new Float32Array(w * h);
  const kitWall = new Set(); for (const it of (plan && plan.items) || []) if (PROPS.kind(it.id) === 'wall') kitWall.add(Math.floor(it.z) * w + Math.floor(it.x));   // tiles a kit wall block draws
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (Tt[i] !== T.WALL || !m.vis[i]) continue;
    let nx = 0, nz = 0; for (let k = 0; k < 8; k++) { const xx = x + DX[k], yy = y + DY[k]; if (wallAt(xx, yy)) continue; const wk = DX[k] && DY[k] ? 0.5 : 1; nx += DX[k] * wk; nz += DY[k] * wk; }
    const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l; inward[i * 2] = nx; inward[i * 2 + 1] = nz;
    const gb = Math.min(m.hgt[y * W1 + x], m.hgt[y * W1 + x + 1], m.hgt[(y + 1) * W1 + x], m.hgt[(y + 1) * W1 + x + 1]) - 0.04, tp = gb + H, o = [nx, nz, gb, x + 0.5, y + 0.5];
    base[i] = gb; if (kitWall.has(i)) continue; const x0 = x, x1 = x + 1, z0 = y, z1 = y + 1;
    quad([[x1, gb, z0], [x0, gb, z0], [x0, tp, z0], [x1, tp, z0]], [0, 0, -1], [[x1 / 2, 0], [x0 / 2, 0], [x0 / 2, 1], [x1 / 2, 1]], SIDE, o);
    quad([[x0, gb, z1], [x1, gb, z1], [x1, tp, z1], [x0, tp, z1]], [0, 0, 1], [[x0 / 2, 0], [x1 / 2, 0], [x1 / 2, 1], [x0 / 2, 1]], SIDE, o);
    quad([[x0, gb, z0], [x0, gb, z1], [x0, tp, z1], [x0, tp, z0]], [-1, 0, 0], [[z0 / 2, 0], [z1 / 2, 0], [z1 / 2, 1], [z0 / 2, 1]], SIDE, o);
    quad([[x1, gb, z1], [x1, gb, z0], [x1, tp, z0], [x1, tp, z1]], [1, 0, 0], [[z1 / 2, 0], [z0 / 2, 0], [z0 / 2, 1], [z1 / 2, 1]], SIDE, o);
    quad([[x0, tp, z1], [x1, tp, z1], [x1, tp, z0], [x0, tp, z0]], [0, 1, 0], [[x0 / 2, 0.955], [x1 / 2, 0.955], [x1 / 2, 0.97], [x0 / 2, 0.97]], CAP, o);
  }
  // ceiling beams across the room every third row (timber / hall walls): the room reads as a room without a roof
  if (I.beams) for (let y = 2; y < h - 2; y += 3) {
    let x = 0;
    while (x < w) {
      if (wallAt(x, y)) { x++; continue; }
      let x2 = x; while (x2 < w && !wallAt(x2, y)) x2++;
      if (x > 0 && x2 < w && x2 - x >= 3 && x2 - x <= 20) {
        const gb = Math.min(base[y * w + x - 1] || 0, base[y * w + x2] || 0), yt = gb + H - 0.1, yb = yt - 0.24, z0 = y + 0.4, z1 = y + 0.6, a = x - 0.35, b = x2 + 0.35, o = [0, 0, gb];
        quad([[a, yb, z1], [b, yb, z1], [b, yt, z1], [a, yt, z1]], [0, 0, 1], [[a / 2, 0.93], [b / 2, 0.93], [b / 2, 0.99], [a / 2, 0.99]], FIX, o);
        quad([[b, yb, z0], [a, yb, z0], [a, yt, z0], [b, yt, z0]], [0, 0, -1], [[b / 2, 0.93], [a / 2, 0.93], [a / 2, 0.99], [b / 2, 0.99]], FIX, o);
        quad([[a, yt, z1], [b, yt, z1], [b, yt, z0], [a, yt, z0]], [0, 1, 0], [[a / 2, 0.96], [b / 2, 0.96], [b / 2, 0.98], [a / 2, 0.98]], FIX, o);
        quad([[a, yb, z0], [b, yb, z0], [b, yb, z1], [a, yb, z1]], [0, -1, 0], [[a / 2, 0.96], [b / 2, 0.96], [b / 2, 0.98], [a / 2, 0.98]], FIX, o);
      }
      x = x2;
    }
  }
  m.wallIn = inward; m.wallBase = base;
  if (!nv) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setAttribute('aW', new THREE.Float32BufferAttribute(aw, 4)); geo.setAttribute('aC', new THREE.Float32BufferAttribute(ac, 2));
  geo.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1)); geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, wallMaterial(interiorWallTex(I.wall, I.trim), H, WD.stub)); mesh.receiveShadow = true; mesh.castShadow = false; mesh.name = 'interior_walls';
  grp.add(mesh); A.cutVis = A.cutVis || [];
  // windows: panes on the wall's inner face + a slanted shaft of daylight + a patch on the floor (render.interior.windows
  // tiles and decor pieces whose id says window)
  const wins = I.windows.map(p => [Math.floor(p[0]), Math.floor(p[1])]);
  for (const d of (Array.isArray(m.decor) ? m.decor : [])) if (d && /window/.test(String(d.kit || d.model || '')) && isFinite(d.x) && isFinite(d.y)) wins.push([Math.floor(d.x), Math.floor(d.y), d]);
  const seen = new Set(); A.windows = [];
  for (const [wx, wy, dd] of wins) {
    let tx = wx, ty = wy;
    if (!(wallAt(tx, ty) && m.vis[ty * w + tx])) {   // a decor window standing in front of its wall: the wall tile behind it
      let best = null; for (let k = 0; k < 4; k++) { const xx = wx + DX[k], yy = wy + DY[k]; if (xx >= 0 && yy >= 0 && xx < w && yy < h && Tt[yy * w + xx] === T.WALL && m.vis[yy * w + xx]) { best = [xx, yy]; break; } }
      if (!best) continue; tx = best[0]; ty = best[1];
    }
    const k = ty * w + tx; if (seen.has(k)) continue; seen.add(k);
    let nx = inward[k * 2], nz = inward[k * 2 + 1]; if (Math.abs(nx) >= Math.abs(nz)) { nx = Math.sign(nx) || 1; nz = 0; } else { nz = Math.sign(nz) || 1; nx = 0; }
    const gb = base[k], py = gb + H * 0.6, cx = tx + 0.5 + nx * 0.52, cz = ty + 0.5 + nz * 0.52, rot = Math.atan2(nx, nz);
    const g = new THREE.Group(); g.position.set(cx, 0, cz); g.rotation.y = rot;
    if (!dd) { const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.8), new THREE.MeshBasicMaterial({ map: TEX.pane, color: new THREE.Color(1.9, 1.8, 1.6), fog: false })); pane.position.set(0, py, 0.01); g.add(pane); }
    // light: two crossed slanted sheets from the pane down to the floor (local +z = into the room) and a floor patch
    const drop = py - gb, reach = drop * 0.8, lg = [], cols = [], L = (x0, y0, z0, x1, y1, z1, x2, y2, z2, x3, y3, z3, u0, u1) => { lg.push(x0, y0, z0, x1, y1, z1, x2, y2, z2, x0, y0, z0, x2, y2, z2, x3, y3, z3); for (const [u, v] of [[u0, 0], [u1, 0], [u1, 1], [u0, 0], [u1, 1], [u0, 1]]) cols.push(u, v); };
    L(-0.45, gb + 0.02, reach, 0.45, gb + 0.02, reach, 0.31, py + 0.4, 0, -0.31, py + 0.4, 0, 0, 0.5);
    L(0, gb + 0.02, reach + 0.35, 0, gb + 0.02, reach - 0.35, 0, py + 0.4, 0.02, 0, py + 0.4, 0.02, 0, 0.5);
    L(-0.55, gb + 0.03, reach + 0.6, 0.55, gb + 0.03, reach + 0.6, 0.55, gb + 0.03, reach - 0.6, -0.55, gb + 0.03, reach - 0.6, 0.5, 1);
    const lgeo = new THREE.BufferGeometry(); lgeo.setAttribute('position', new THREE.Float32BufferAttribute(lg, 3)); lgeo.setAttribute('uv', new THREE.Float32BufferAttribute(cols, 2));
    const lm = new THREE.Mesh(lgeo, new THREE.MeshBasicMaterial({ map: TEX.winLight, color: linCol(0xfff0d0).multiplyScalar(0.42), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    lm.renderOrder = 3; g.add(lm); grp.add(g);
    A.cutVis.push({ o: g, nx, nz, x: tx + 0.5, z: ty + 0.5 }); A.windows.push({ x: tx + 0.5 + nx * (0.5 + reach), z: ty + 0.5 + nz * (0.5 + reach), h: gb + 1.4 });
  }
  return mesh;
}

/* ---------- Cave rock (render.kind 'cave', and cave annexes: T.WALL in field maps) ----------
   T.WALL becomes a rock mass: a heightfield over the wall tiles at 3 (2 on big caves) vertices per tile, rising from the
   floor at the wall's edge to ~2-3.5 units with noise, jittered for an organic outline. Triplanar rock shader: the
   floor detail layer of the rock kind, strata, dusty tops, wet (darker, glossy) toward the floor with specular highlights
   from the hero's torch, faint glowing veins in crystal rock. Dithers between the camera and the hero like trees. */
function caveRockMaterial(K, C) {
  const U = { uRD: { value: detailTex(K.detail).tex }, uRA: { value: linCol(K.a) }, uRB: { value: linCol(K.b) }, uRG: { value: linCol(K.glow).multiplyScalar(1.8) },
    uRK: { value: new THREE.Vector4(C.wet, K.veins ? 1 : 0, K.spec || 0, 0.21) } };
  const mat = new THREE.MeshPhongMaterial({ color: 0xffffff, specular: new THREE.Color(0.5, 0.53, 0.58), shininess: K.spec ? 70 : 42 });
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U, OCC);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aRH; varying vec3 vRW, vRN; varying float vRH;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvRW = (modelMatrix * vec4(transformed, 1.0)).xyz; vRN = normalize(mat3(modelMatrix) * objectNormal); vRH = aRH;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uRD; uniform vec3 uRA, uRB, uRG; uniform vec4 uRK; varying vec3 vRW, vRN; varying float vRH; float rkWet; vec3 rkSl;')
      .replace('#include <map_fragment>', `{
        vec3 an = abs(normalize(vRN)); an = an * an * an; an /= (an.x + an.y + an.z);
        vec4 tx = texture2D(uRD, vRW.zy * uRK.w), ty = texture2D(uRD, vRW.xz * uRK.w), tz = texture2D(uRD, vRW.xy * uRK.w);
        vec4 d = tx * an.x + ty * an.y + tz * an.z;
        float lowN = texture2D(uRD, vRW.xz * 0.043 + vec2(vRW.y * 0.031, 0.17)).a;
        vec3 col = mix(uRA, uRB, smoothstep(0.2, 0.8, lowN * 0.65 + d.a * 0.35)) * (0.45 + 1.1 * d.b);
        col *= 0.84 + 0.16 * sin(vRW.y * 6.3 + lowN * 7.0);
        float up = smoothstep(0.55, 0.95, vRN.y);
        col = mix(col, col * 1.2 + 0.012, up * 0.5);
        rkWet = uRK.x * (0.3 + 0.7 * (1.0 - smoothstep(0.05, 1.5, vRH))) * (0.55 + 0.45 * d.a) * (1.0 - up * 0.5);
        col *= 1.0 - rkWet * 0.4;
        diffuseColor.rgb *= col;
        rkSl = vec3((ty.r - 0.5) * an.y + (tz.r - 0.5) * an.z, (tz.g - 0.5) * an.z + (tx.g - 0.5) * an.x, (ty.g - 0.5) * an.y + (tx.r - 0.5) * an.x) * 4.0;
        if (uRK.y > 0.0) totalEmissiveRadiance += uRG * smoothstep(0.8, 0.94, d.a) * smoothstep(0.35, 0.7, lowN) * uRK.y;
      }`)
      .replace('#include <specularmap_fragment>', 'float specularStrength = 0.06 + rkWet * 1.5 + uRK.z * 0.5;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(normal - 0.6 * (viewMatrix * vec4(rkSl, 0.0)).xyz);');
    occluder(sh);
  };
  mat.customProgramCacheKey = () => 'caverock';
  return mat;
}
function buildCaveRock(m, K, C) {
  const w = m.w, h = m.h, Tt = m.t, S = w * h > 4200 ? 2 : 3, NX = w * S, NZ = h * S, V1 = NX + 1, NV = V1 * (NZ + 1), sd = (m.d.seed | 0) + 7;
  const td = new Uint8Array(w * h).fill(99), q = [];
  for (let i = 0; i < w * h; i++) if (Tt[i] !== T.WALL) { td[i] = 0; q.push(i); }
  if (!q.length || q.length === w * h) return null;
  for (let qi = 0; qi < q.length; qi++) { const i = q[qi], x = i % w, y = (i / w) | 0; if (td[i] >= 6) continue; for (let k = 0; k < 8; k++) { const nx = x + DX[k], ny = y + DY[k]; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const j = ny * w + nx; if (td[j] > td[i] + 1) { td[j] = td[i] + 1; q.push(j); } } }
  const pos = new Float32Array(NV * 3), rh = new Float32Array(NV), jit = 0.36 / S;
  for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
    const k = j * V1 + i; let px = i / S, pz = j / S; const fx = Math.floor(px), fz = Math.floor(pz);
    let near = 99; for (let oz = -1; oz <= 0; oz++) for (let ox = -1; ox <= 0; ox++) { const tx = fx + ox, tz = fz + oz; if (tx >= 0 && tz >= 0 && tx < w && tz < h) near = Math.min(near, td[tz * w + tx]); }
    let d;
    if (near === 0) d = 0;
    else if (near >= 4) d = near - 0.5;
    else { let best = 1e9; for (let tz = fz - near - 1; tz <= fz + near; tz++) for (let tx = fx - near - 1; tx <= fx + near; tx++) { if (tx < 0 || tz < 0 || tx >= w || tz >= h || Tt[tz * w + tx] === T.WALL) continue; const dx = Math.max(tx - px, 0, px - tx - 1), dz = Math.max(tz - pz, 0, pz - tz - 1), d2 = dx * dx + dz * dz; if (d2 < best) best = d2; } d = best < 1e9 ? Math.sqrt(best) : near; }
    const g = groundHm(m, px, pz), n3 = vnoise(px / 5.5, pz / 5.5, sd + 43), n1 = vnoise(px / 1.9, pz / 1.9, sd + 41), n2 = vnoise(px / 0.7, pz / 0.7, sd + 42);
    const topH = K.h * (0.62 + 0.7 * n3) + (n1 - 0.5) * 1.1, y = g - 0.05 + topH * Math.pow(smoothstep(0, 2.0, d), 0.5) + (n2 - 0.5) * 0.3 * smoothstep(0, 0.5, d);
    // (the foot wanders up to ~0.12 over the tile edge: no ruler-straight outlines)
    { const jk = 0.24 + smoothstep(0.2, 0.7, d) * (2.6 * jit - 0.24); px += (vnoise(px * 1.7 + 3.1, pz * 1.7, sd + 44) - 0.5) * jk; pz += (vnoise(px * 1.7, pz * 1.7 + 5.3, sd + 45) - 0.5) * jk; }
    pos[k * 3] = px; pos[k * 3 + 1] = y; pos[k * 3 + 2] = pz; rh[k] = y - g;
  }
  const idx = [];
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    if (Tt[Math.floor(j / S) * w + Math.floor(i / S)] !== T.WALL) continue;
    const a = j * V1 + i, b = a + 1, c = a + V1, dd = c + 1;
    if ((i + j) & 1) idx.push(a, c, b, b, c, dd); else idx.push(a, c, dd, a, dd, b);
  }
  if (!idx.length) return null;
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aRH', new THREE.BufferAttribute(rh, 1));
  geo.setIndex(NV > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1)); geo.computeVertexNormals(); geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, caveRockMaterial(K, C)); mesh.receiveShadow = true; mesh.castShadow = false; mesh.name = 'cave_rock';
  return mesh;
}
// the rock palette of a field map's cave annexes (T.WALL in a field): its own rock colour
function annexRock(m) { const L = m.d.look || {}, b = new THREE.Color(L.rock !== undefined ? L.rock : 0x8a867e); return Object.assign({}, CAVE_ROCK.basalt, { a: b.clone().multiplyScalar(0.55).getHex(), b: b.getHex(), h: 2.4 }); }

/* ---------- Doors (warps with door: true | 'cave') ----------
   Doors replace the generic portal: a warm glow painted in the doorway and a light at its threshold (daylight for the way
   out of an interior or cave), a timber frame when the doorway is a gap in a wall line (the building's model has its own
   door otherwise); door:'cave' on an overworld map is the cave mouth: the art set piece `cave_mouth` (placed by
   planProps when content did not) or, until it is in the manifest, a procedural rock arch with a black opening.
   Interior doors on a cut-away wall hide with the wall. Locked doors glow red. */
function rockBlob(r, seed, sx, sy, sz) {
  const g = new THREE.IcosahedronGeometry(r, 1), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), n = 0.76 + 0.46 * vnoise(x * 2.1 / r + seed, y * 2.1 / r + z * 1.3 / r, seed + 7); p.setXYZ(i, x * n * sx, y * n * sy, z * n * sz); }
  g.computeVertexNormals(); return g;
}
function buildCaveMouth(wp, m, D) {
  const cx = wp.x + 0.5, cz = wp.y + 0.5, gh = groundHm(m, cx, cz), parts = [], cols = [];
  const add = (geo, x, y, z, ao) => { geo.translate(x, y, z); const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const k = clamp(0.5 + p.getY(i) * 0.16 + (p.getZ(i) + 1.2) * 0.14, 0.3, 1.05) * ao; cols.push(k, k, k * 0.96); } parts.push(geo); };
  add(rockBlob(1, 3, 2.7, 1.9, 1.5), 0, 0.3, -1.8, 0.85);
  for (let k = 0; k <= 8; k++) { const a = Math.PI * k / 8, r = 0.46 + 0.1 * Math.sin(k * 2.3); add(rockBlob(r, k + 11, 1, 1.1, 0.95), -Math.cos(a) * 1.3, Math.sin(a) * 1.5 + 0.05, -0.32, 1); }
  add(rockBlob(0.72, 21, 1.2, 0.9, 1), 1.8, 0.32, -0.15, 0.95); add(rockBlob(0.66, 27, 1.1, 0.85, 1), -1.85, 0.28, -0.1, 0.95);
  add(rockBlob(0.34, 31, 1, 0.7, 1), 1.2, 0.1, 0.42, 1); add(rockBlob(0.3, 37, 1, 0.7, 1), -1.25, 0.08, 0.5, 1);
  const geo = merge(parts); geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const L = m.d.look || {}, rock = new THREE.MeshPhongMaterial({ color: linCol(L.rock !== undefined ? L.rock : 0x8a867e), vertexColors: true, specular: 0x0c0c0c, shininess: 6 });
  const mesh = new THREE.Mesh(geo, rock); mesh.castShadow = mesh.receiveShadow = true;
  const op = new THREE.Mesh(new THREE.PlaneGeometry(2.25, 2.4).translate(0, 1.08, -0.5), new THREE.MeshBasicMaterial({ map: TEX.mouth, color: 0x000000, transparent: true, depthWrite: false }));
  op.renderOrder = 1;
  const g = new THREE.Group(); g.add(mesh, op); g.position.set(cx - D.nx * 0.12, gh - 0.08, cz - D.nz * 0.12); g.rotation.y = Math.atan2(D.nx, D.nz); g.name = 'cave_mouth_proc';
  return g;
}
function buildDoors(m, R, grp, A, GB, lam, plan) {
  const kind = mapKind(m), I = kind === 'interior' ? interiorCfg(m) : null, fr = [], gl = [], glC = [], glUV = [], M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), P0 = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1);
  A.doors = []; A.cutVis = A.cutVis || [];
  const frameMat = () => lam({ color: linCol(I ? I.trim : m.d.gen === 'dungeon' ? 0x6a6470 : 0x5a3a20), specular: 0x111111, shininess: 12 });
  for (const wp of m.warps) {
    const dk = doorKind(wp, m); if (!dk) continue;
    const D = doorDir(wp, m), cx = wp.x + 0.5, cz = wp.y + 0.5, gh = groundHm(m, cx, cz), rot = Math.atan2(D.nx, D.nz), rec = { wp, dk, D, halo: null };
    A.doors.push(rec);
    if (dk === 'mouth') { if (!(plan && plan.mouths && plan.mouths.has(wp))) grp.add(buildCaveMouth(wp, m, D)); continue; }
    const exit = dk === 'exit', col = exit ? (kind === 'cave' ? new THREE.Color(0.75, 0.84, 0.98) : new THREE.Color(1.3, 1.42, 1.62)) : new THREE.Color(2.0, 1.15, 0.5);
    // (a doorway in a wall line: the plane stands in the gap; a building's door tile: on the facade, the tile's open edge)
    const off = D.inWall || kind ? 0.44 : -0.53, dx = cx - D.nx * off, dz = cz - D.nz * off, ht = I ? Math.min(2.25, INT_WALL[I.wall].h - 0.3) : 2.2;
    const cut = kind === 'interior';
    let fg = null;
    if (kind === 'interior' || (D.inWall && kind !== 'cave')) {   // a frame in the wall gap: posts, lintel, threshold
      const parts = [boxAt(-0.6, 0, 0, 0.17, ht, 0.24), boxAt(0.6, 0, 0, 0.17, ht, 0.24), boxAt(0, ht, 0, 1.38, 0.2, 0.28), boxAt(0, -0.03, 0.06, 1.08, 0.07, 0.36)];
      if (cut) { fg = new THREE.Group(); const fm = new THREE.Mesh(merge(parts), frameMat()); fm.castShadow = false; fm.receiveShadow = true; fg.add(fm); fg.position.set(dx, gh, dz); fg.rotation.y = rot; grp.add(fg); }
      else { M.compose(P0.set(dx, gh, dz), Q.setFromAxisAngle(Y, rot), ONE); for (const p of parts) { p.applyMatrix4(M); fr.push(p); } }
    }
    // the doorway glow (local plane facing the walkable side)
    const pg = new THREE.PlaneGeometry(1.0, ht * 0.95).translate(0, ht * 0.475, -0.03);
    if (cut) {
      const gm = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ map: TEX.door, color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
      gm.renderOrder = 2; if (!fg) { fg = new THREE.Group(); fg.position.set(dx, gh, dz); fg.rotation.y = rot; grp.add(fg); } fg.add(gm);
      A.cutVis.push({ o: fg, nx: D.nx, nz: D.nz, x: cx, z: cz });
    } else {
      M.compose(P0.set(dx, gh, dz), Q.setFromAxisAngle(Y, rot), ONE); pg.applyMatrix4(M);
      gl.push(ni(pg)); for (let i = 0; i < 6; i++) glC.push(col.r, col.g, col.b);
    }
    // a soft halo at the threshold (batched glows), and in a cave a shaft of daylight falling in at the way out
    const hop = exit ? (kind === 'cave' ? 0.14 : 0.26) : 0.3, halo = GB.add(exit ? linCol(0xdce8ff) : linCol(0xffb870), hop, 2.4, 2.8); halo.position.set(cx - D.nx * 0.2, gh + 1.1, cz - D.nz * 0.2);
    rec.halo = halo; rec.col = halo.material.color.clone(); A.halos.push({ s: halo, op: hop, ph: wp.x * 1.3 + wp.y, fl: exit ? 0.02 : 0.15 });
    if (exit && kind === 'cave') {
      const sg = new THREE.PlaneGeometry(1.4, 4.6).translate(0, 2.3, 0); sg.rotateX(-0.38); const sm = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ map: TEX.shaft, color: linCol(0xe8f0ff).multiplyScalar(0.26), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
      sm.position.set(cx - D.nx * 0.6, gh, cz - D.nz * 0.6); sm.rotation.y = rot; sm.renderOrder = 3; grp.add(sm);
    }
  }
  if (fr.length) { const fm = new THREE.Mesh(merge(fr), frameMat()); fm.castShadow = fm.receiveShadow = true; grp.add(fm); }
  if (gl.length) {
    const geo = merge(gl); geo.setAttribute('color', new THREE.Float32BufferAttribute(glC, 3));
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: TEX.door, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    mesh.renderOrder = 2; grp.add(mesh);
  }
}

/* ---------- Placeholders: decor ids without a model (the interior_* / cave_* kits may land mid-round) ----------
   A neutral stone block of the entry's footprint (entries with fp) or a small one (entries with a light); other unknown
   ids are skipped without a request. When the kit lands in assets/models/index.json the real model is drawn. */
function placeholderTpl() {
  if (PROPS.tpl.__ph) return PROPS.tpl.__ph;
  const geo = new THREE.BoxGeometry(0.9, 1, 0.9); geo.translate(0, 0.5, 0);
  const mat = new THREE.MeshPhongMaterial({ name: 'placeholder', color: linCol(0x8e8a82), specular: 0x0c0c0c, shininess: 6 });
  return (PROPS.tpl.__ph = { id: '__ph', parts: [{ geo, mat, depth: null, name: 'placeholder' }], rad: 0.64, top: 1, small: true });
}

/* ---------- Big maps (> 64 x 64): sectors ----------
   Terrain: one mesh per 32 x 32-tile sector (frustum culled). Props: every instanced group keeps its instances sorted by
   sector; each frame the sectors whose bounds meet the view frustum are found and, when that set changes, their
   instances are copied to the front of the instance buffer: the main pass draws only those (count), the sun's static
   shadow cache (re-rendered only when the view drifts) draws all. No extra draw calls; grass is already in 32-tile chunks. */
const SECT = { frustum: new THREE.Frustum(), pm: new THREE.Matrix4(), on: true };
function sectorGrid(m) { let S = 32; while (Math.ceil(m.w / S) * Math.ceil(m.h / S) > 30) S += 8; return { S, nx: Math.ceil(m.w / S), nz: Math.ceil(m.h / S) }; }
function secIndex(G, x, z) { return clamp(Math.floor(z / G.S), 0, G.nz - 1) * G.nx + clamp(Math.floor(x / G.S), 0, G.nx - 1); }
function groundSectors(m, HG, mat) {
  const G = sectorGrid(m), w = m.w, h = m.h, W1 = w + 1, out = [], Hn = (x, z) => HG[clamp(z, 0, h) * W1 + clamp(x, 0, w)];
  for (let sz = 0; sz < G.nz; sz++) for (let sx = 0; sx < G.nx; sx++) {
    const x0 = sx * G.S, x1 = Math.min(w, x0 + G.S), z0 = sz * G.S, z1 = Math.min(h, z0 + G.S), cw = x1 - x0, ch = z1 - z0, n = (cw + 1) * (ch + 1);
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = new (n > 65535 ? Uint32Array : Uint16Array)(cw * ch * 6);
    for (let j = 0; j <= ch; j++) for (let i = 0; i <= cw; i++) {
      const x = x0 + i, z = z0 + j, k = j * (cw + 1) + i, gx = (Hn(x + 1, z) - Hn(x - 1, z)) * 0.5, gz = (Hn(x, z + 1) - Hn(x, z - 1)) * 0.5, l = Math.hypot(gx, 1, gz);
      pos[k * 3] = x; pos[k * 3 + 1] = Hn(x, z); pos[k * 3 + 2] = z; nor[k * 3] = -gx / l; nor[k * 3 + 1] = 1 / l; nor[k * 3 + 2] = -gz / l; uv[k * 2] = x / w; uv[k * 2 + 1] = 1 - z / h;
    }
    let o = 0; for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) { const a = j * (cw + 1) + i, b = a + cw + 1, c = b + 1, d = a + 1; idx[o++] = a; idx[o++] = b; idx[o++] = d; idx[o++] = b; idx[o++] = c; idx[o++] = d; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere(); const me = new THREE.Mesh(geo, mat); me.receiveShadow = true; me.name = 'ground_' + sx + '_' + sz; out.push(me);
  }
  return out;
}
// Per frame: the view's sector set; rewrite the instance buffers when it changes.
function sectorUpdate() {
  const S = curWorld && curWorld.userData.sec; if (!S || !S.meshes.length) return;
  let vis = 0;
  if (SECT.on) { camera.updateMatrixWorld(); SECT.pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); SECT.frustum.setFromProjectionMatrix(SECT.pm); for (let s = 0; s < S.box.length; s++) if (!S.box[s].isEmpty() && SECT.frustum.intersectsBox(S.box[s])) vis |= 1 << s; }
  else vis = (1 << S.box.length) - 1;
  if (vis === S.view) return; S.view = vis; S.changes++;
  for (const im of S.meshes) {
    const u = im.userData.sec, dst = im.instanceMatrix.array, src = u.full, st = u.starts; let n = 0;
    for (let s = 0; s < st.length - 1; s++) if (vis & (1 << s) && st[s + 1] > st[s]) { dst.set(src.subarray(st[s] * 16, st[s + 1] * 16), n * 16); n += st[s + 1] - st[s]; }
    u.nView = n;
    for (let s = 0; s < st.length - 1; s++) if (!(vis & (1 << s)) && st[s + 1] > st[s]) { dst.set(src.subarray(st[s] * 16, st[s + 1] * 16), n * 16); n += st[s + 1] - st[s]; }
    im.count = u.nView; im.instanceMatrix.needsUpdate = true;
  }
}
// the sun's shadow passes draw every instance of a sectored group (the cached static shadow covers more than the view)
function sectorShadow(all) {
  const S = curWorld && curWorld.userData.sec; if (!S || !S.meshes.length) return false;
  for (const im of S.meshes) { const u = im.userData.sec; im.count = all ? u.n : u.nView; }
  return true;
}

/* ---------- World building ---------- */
function buildWorld(m) {
  if (m.world) return m.world;
  const L = m.d.look, R = rlookFor(m), grp = new THREE.Group(), w = m.w, h = m.h, W1 = w + 1, kind = mapKind(m), big = isBig(m);
  const A = { flames: [], warps: [], lava: null, heart: null, way: null };
  const spec = R.spec;
  const lam = (o) => new THREE.MeshPhongMaterial(Object.assign({ specular: spec ? spec[0] : 0x000000, shininess: spec ? spec[1] : 1 }, o));
  const solid = (geo, mat) => { const me = new THREE.Mesh(geo, mat); me.castShadow = true; me.receiveShadow = true; grp.add(me); return me; };
  const plan = (PROPS.man && m.plan) || planProps(m); if (PROPS.man) m.plan = plan; m.propLights = plan.lights; m.propDLights = plan.dlights; m.propAvoid = plan.avoid; m.propItems = plan.items;
  m.hgtInfo = heightTex(m); A.halos = [];
  // Ground: painted macro + detail layers (see groundDetail)
  const HG = renderHgt(m); let gg = null;
  if (!big) { gg = new THREE.PlaneGeometry(w, h, w, h); gg.rotateX(-Math.PI / 2); gg.translate(w / 2, 0, h / 2); const pos = gg.attributes.position; for (let i = 0; i < pos.count; i++) pos.setY(i, HG[Math.round(pos.getZ(i)) * W1 + Math.round(pos.getX(i))]); gg.computeVertexNormals(); }
  const pg = paintGround(m, plan), mk = groundMask(m); m.gbase = pg; m.gmask = mk;
  const shadeT = new THREE.CanvasTexture(pg.shade); shadeT.flipY = false; shadeT.generateMipmaps = false; shadeT.minFilter = THREE.LinearFilter; pg.shade = null;
  // low: the painted macro layer at half resolution (1024 instead of 2048 px on a 64-tile map: 5 MB instead of 21 MB
  // with mips); medium and up keep the full 32 px per tile
  let macro = pg.macro; if (GFX.quality === 'low' && macro.width >= 512) { const hc = mkCanvas(macro.width >> 1, macro.height >> 1), hg = hc.getContext('2d'); hg.imageSmoothingQuality = 'high'; hg.drawImage(macro, 0, 0, hc.width, hc.height); macro = hc; }
  const gmat = lam({ map: canvasTex(macro, { aniso: GFX.quality !== 'low' }) }); pg.macro = null;
  const baseK = kind ? R.floorD || 'flag' : floorDetail(L.floor);
  groundDetail(gmat, {
    base: detailTex(baseK), mask: mk.tex, shade: shadeT, mapInv: new THREE.Vector2(1 / w, 1 / h), nrm: kind ? R.floorN || 1 : baseK === 'flag' ? 1.25 : 1, cave: kind === 'cave',
    path: mk.hasP ? detailTex('dirt') : null, pathC: rgbLin(L.path || [150, 130, 100]),
    cob: mk.hasC ? detailTex('cobble') : null, cobC: rgbLin(L.path || [176, 164, 140]).multiplyScalar(1.12),
    ash: mk.hasA ? detailTex('ash') : null, ashC: rgbLin(L.ash || [130, 128, 120]),
  });
  if (m.emisCanvas) { gmat.emissiveMap = canvasTex(m.emisCanvas); gmat.emissive = new THREE.Color(1.5, 0.62, 0.25); A.groundEmis = gmat; m.emisCanvas = null; }
  if (!big) { const ground = new THREE.Mesh(gg, gmat); ground.receiveShadow = true; grp.add(ground); grp.userData.ground = ground; grp.userData.grounds = [ground]; }
  else { const gs = groundSectors(m, HG, gmat); for (const g of gs) grp.add(g); grp.userData.ground = gs[0]; grp.userData.grounds = gs; }   // cycle 9: sector meshes
  if (!L.lava && !kind) { const sk = buildSkirt(m, skirtTex(m), spec); groundDetail(sk.material, { base: detailTex(baseK) }); grp.add(sk); }   // (interiors / caves: darkness beyond the walls)
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
  // Warp portals (cycle 9: doors and cave mouths instead for warps with `door`, see buildDoors)
  for (const wp of m.warps) {
    if (doorKind(wp, m)) continue;
    const gh = groundHm(m, wp.x + 0.5, wp.y + 0.5);
    const ringM = new THREE.MeshBasicMaterial({ map: TEX.magic, color: 0x7ab8ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), ringM); ring.rotation.x = -Math.PI / 2; ring.position.set(wp.x + 0.5, gh + 0.05, wp.y + 0.5); grp.add(ring);
    const bt = TEX.beam.clone(); bt.needsUpdate = true;
    const beamM = new THREE.MeshBasicMaterial({ map: bt, color: 0x9fd0ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.8, 3.4, 20, 1, true), beamM); beam.position.set(wp.x + 0.5, gh + 1.7, wp.y + 0.5); grp.add(beam);
    A.warps.push({ ring, ringM, beam, beamM, bt, wp });
  }
  // Brazier flames at the model's light anchor
  // (R.flame / R.flameHalo recolour the fires: Helheim's soul fires burn pale green)
  const fc = Array.isArray(R.flame) && R.flame.length === 3 ? R.flame : [3.2, 1.5, 0.5], fh = R.flameHalo !== undefined ? _hexOr(R.flameHalo, 0xff7a20) : linCol(0xff7a20);
  for (const b of m.braziers) {
    const gh = groundHm(m, b.x, b.y), ay = PROP_LIGHT[brazierId(m)][1];
    const fl = flameSprite(fc[0], fc[1], fc[2]); fl.position.set(b.x, gh + ay + 0.28, b.y); fl.scale.set(0.5, 0.75, 1);
    const halo = glowSprite(fh, 0.3, 1.8, 1.8); halo.position.set(b.x, gh + ay + 0.2, b.y); A.halos.push({ s: halo, op: 0.3, ph: b.x * 3.1 + b.y, fl: 1, lamp: true });
    A.flames.push({ s: fl, sx: 0.5, sy: 0.75 });
  }
  // Lamp-post lanterns: a soft glow (the emissive glass blooms; the light pool adds the rest)
  // (a wide faint outer halo reads as night glow in the lantern's own haze; both swell at night, see WXS)
  for (const l of plan.lights) {
    const s = glowSprite(linCol(0xffc070), 0.4, 1.1, 1.1); s.position.set(l.x, l.h, l.z); A.halos.push({ s, op: 0.4, ph: l.x * 1.7 + l.z, fl: 0.25, lamp: true });
    const o = glowSprite(linCol(0xffb060), 0.1, 3.2, 3.2); o.position.set(l.x, l.h - 0.15, l.z); A.halos.push({ s: o, op: R.exposure > 1.05 ? 0.2 : 0.1, ph: l.x * 1.7 + l.z, fl: 0.3, lamp: true, night: 0.12 });
  }
  // Decor lanterns (lamp posts, soul lanterns, lantern posts placed as m.decor): the same two glows in the light's colour
  for (const l of (plan.dlights || [])) {
    if (!l.lamp) continue; let c; try { c = linCol(l.col); } catch (e) { continue; }
    const s = glowSprite(c, 0.32, 1.0, 1.0); s.position.set(l.x, l.h, l.z); A.halos.push({ s, op: 0.32, ph: l.x * 1.7 + l.z, fl: 0.25, lamp: true });
    const oz = kind ? Math.min(3.0, Math.max(0.8, (l.h - groundHm(m, l.x, l.z)) * 2.2)) : 3.0, o = glowSprite(c, 0.08, oz, oz); o.position.set(l.x, kind ? Math.max(l.h - 0.15, groundHm(m, l.x, l.z) + oz * 0.45) : l.h - 0.15, l.z); A.halos.push({ s: o, op: R.exposure > 1.05 ? 0.16 : 0.08, ph: l.x * 1.7 + l.z, fl: 0.3, lamp: true, night: 0.1 });
  }
  // Cycle 9: m.lights (hearths, candles, lanterns, crystals...): a soft glow in the light's colour, a flame for fires
  for (const l of mapLights(m)) {
    const gh = groundHm(m, l.x, l.y), y = gh + l.h, k = clamp(l.r / 5, 0.45, 1.6), hk = kind ? 1 : 0.8;
    const s = glowSprite(l.lin, 0.3 * hk * Math.min(1.4, 0.5 + l.i * 0.5), 1.0 * k, 1.0 * k); s.position.set(l.x, y + 0.05, l.y); A.halos.push({ s, op: 0.3 * hk * Math.min(1.4, 0.5 + l.i * 0.5), ph: l.x * 1.9 + l.y, fl: l.fl * 0.6, lamp: true });
    const oz = Math.min(3.2 * k, Math.max(0.8, l.h * 2.4)), o = glowSprite(l.lin, 0.07 * hk, oz, oz); o.position.set(l.x, gh + Math.max(l.h - 0.1, oz * 0.45), l.y); A.halos.push({ s: o, op: 0.07 * hk, ph: l.x * 1.9 + l.y, fl: l.fl * 0.5, lamp: true });
    if (l.flame) {
      const fs = l.kind === 'candle' ? [0.16, 0.26] : l.kind === 'hearth' || l.kind === 'forge' || l.kind === 'fire' ? [0.62, 0.9] : l.kind === 'torch' ? [0.34, 0.52] : [0.4, 0.6];
      const warm = l.c.r >= l.c.b, fl = flameSprite(warm ? fc[0] : 1.2 + l.lin.r, warm ? fc[1] : 1.2 + l.lin.g * 1.6, warm ? fc[2] : 0.8 + l.lin.b * 2); fl.position.set(l.x, y + fs[1] * 0.38, l.y); fl.scale.set(fs[0], fs[1], 1); A.flames.push({ s: fl, sx: fs[0], sy: fs[1] });
    }
  }
  // Doors and cave mouths (warps with `door`)
  buildDoors(m, R, grp, A, GB, lam, plan);
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
  // Cycle 9: interior walls / cave rock (T.WALL drawn by the renderer, see wallsDrawn)
  const own = wallsDrawn(m);
  try {
    if (own === 'interior') buildInteriorWalls(m, R, grp, A, plan);
    else if (own === 'rock' && m.t.some(t => t === T.WALL)) { const C = kind === 'cave' ? caveCfg(m) : { wet: 0.12 }, rk = buildCaveRock(m, kind === 'cave' ? CAVE_ROCK[C.rock] : annexRock(m), C); if (rk) { grp.add(rk); A.rock = rk; } }
  } catch (e) { console.warn('[gfx] walls / rock', e); }
  // Volumetric-looking light shafts (additive crossed planes along the sun direction; big maps: more of them)
  if (R.shafts) { const sg = new THREE.Group(); grp.add(sg); A.shafts = buildShafts(m, big ? Object.assign({}, R, { shafts: Object.assign({}, R.shafts, { n: Math.round(R.shafts.n * w * h / 4096) }) }) : R, sg); A.shaftGrp = sg; }
  GB.build(grp); FB.build(grp);
  // 3D props: instanced from the glTF templates once loaded (cached => immediate on revisits)
  const props = new THREE.Group(); grp.add(props); grp.userData.props = props; grp.userData.map = m;
  const sec = grp.userData.sec = big ? (() => { const G = sectorGrid(m), box = []; for (let i = 0; i < G.nx * G.nz; i++) box.push(new THREE.Box3()); return { G, box, meshes: [], view: -1, changes: 0 }; })() : null;
  // Required models must all load (else the legacy primitives). The world dresses as soon as they are in; optional
  // ones (decor, LODs, the board model, kit variants) follow and trigger one rebuild; missing ones are skipped.
  // (the instanced geometries share the templates' attribute buffers: only their own VAO / instance buffers are freed)
  const clearProps = () => { const keep = tplAttrs(); for (const o of [...props.children]) { props.remove(o); if (o.isInstancedMesh) { disposeGeo(o.geometry, keep); o.dispose(); } } if (sec) { sec.meshes.length = 0; for (const b of sec.box) b.makeEmpty(); sec.view = -1; } };
  let have = null;
  const dress = (lq, final) => { if (grp.userData.dead) return; clearProps(); buildProps(props, plan.items, lq, sec); grp.userData.propLod = lq; have = new Set(Object.keys(PROPS.tpl)); if (final) boardFallback(); worldQuality(grp); PROPS.prefetch(); SHADOW.need = true; };
  const optional = lq => PROPS.manifest().then(() => { const { opt } = propIds(plan.items, lq); return Promise.all(opt.map(id => PROPS.load(id).catch(() => null))).then(() => opt); });
  const finish = lq => optional(lq).then(opt => { if (grp.userData.propLod !== lq || grp.userData.dead) return; if (opt.some(id => PROPS.tpl[id] && !have.has(id))) dress(lq, true); else boardFallback(); });
  const lq0 = lodLow(), ids0 = propIds(plan.items, lq0);
  if (PROPS.man && PROPS.ready(ids0.req) && PROPS.ready(ids0.opt)) dress(lq0, true);
  else PROPS.ensure(ids0.req).then(() => { dress(lq0, false); finish(lq0); }, e => {
    console.warn('[props] models unavailable, using placeholders:', e && e.message || e); legacyProps(m, props, lam, A); grp.userData.legacy = true;
    optional(lq0).then(() => { if (grp.userData.dead) return; buildProps(props, plan.items.filter(it => it.opt), lq0, sec); boardFallback(); SHADOW.need = true; });
  });
  grp.userData.rebuildProps = lq => { if (grp.userData.legacy) return; grp.userData.propLod = lq; optional(lq).then(() => { if (grp.userData.propLod === lq) dress(lq, true); }); };
  m.world = grp; m.anim = A;
  return grp;
}

/* ---------- Map entry: world LRU, shader precompile, loading gate (perf round 3) ----------
   World LRU: every visited map used to keep its world (ground canvases, masks, grass, prop instances, water...) on the
   GPU forever (~60-150 MB per map with its sprite sheets). The current map + the WORLD_KEEP-1 most recent stay resident
   (a revisit is instant); older worlds free their textures and geometry (materials and shader programs stay cached, so
   a later rebuild does not recompile). Shared resources (templates, detail textures, grass blade, anything a resident
   world still uses) are kept; a texture freed by mistake would only be re-uploaded on next use.
   Precompile: on entry every material of the scene is compiled with renderer.compile() plus the post variants of this
   map. With KHR_parallel_shader_compile the programs link on driver threads (three's blocking link check is skipped
   for them and done once they are complete), so the main thread does not stall.
   Gate: in a real browser, a fresh world (or new programs) is held behind a short dark fade (#gfxfade, under the HUD and
   the map-name banner): the first frame uploads the world's textures, then frames are skipped until the programs are
   linked (<= GLOAD.maxMs), then the world fades in. No gate under the harnesses unless AOM_GFX_GATE (deterministic
   frames); precompile always runs. */
const WORLD_LRU = [];
const WORLD_KEEP = () => ({ low: 2, medium: 3, high: 4, ultra: 5 }[GFX.quality] || 3);
function tplAttrs() {
  const k = new Set();
  const add = g => { if (!g) return; if (g.index) k.add(g.index); for (const n in g.attributes) k.add(g.attributes[n]); };
  for (const id in PROPS.tpl) for (const pt of PROPS.tpl[id].parts) add(pt.geo);
  add(GRASS.geo); add(BOARD.geo); add(BOARD.faceGeo);
  return k;
}
// Dispose a geometry but keep the GPU buffers of attributes in `keep` (shared with live geometry): they are detached first.
function disposeGeo(g, keep) {
  if (!g || g.userData.shared) return;
  if (keep) { if (g.index && keep.has(g.index)) g.index = null; for (const n of Object.keys(g.attributes)) if (keep.has(g.attributes[n])) delete g.attributes[n]; }
  g.dispose();
}
// Textures / geometries / attributes referenced by a world (materials: standard maps, ShaderMaterial uniforms and the
// uniform textures groundDetail() keeps in userData.texU).
function worldRefs(root, R) {
  R = R || { tex: new Set(), geo: new Set(), attr: new Set(), mats: new Set() };
  const texOf = v => { if (v && v.isTexture) R.tex.add(v); };
  const mat = m => {
    if (!m || R.mats.has(m)) return; R.mats.add(m);
    for (const k in m) texOf(m[k]);
    if (m.uniforms) for (const k in m.uniforms) texOf(m.uniforms[k] && m.uniforms[k].value);
    if (m.userData && m.userData.texU) for (const k in m.userData.texU) texOf(m.userData.texU[k].value);
  };
  root.traverse(o => {
    if (o.material) { if (Array.isArray(o.material)) o.material.forEach(mat); else mat(o.material); }
    if (o.customDepthMaterial) mat(o.customDepthMaterial);
    const g = o.geometry; if (g && !R.geo.has(g)) { R.geo.add(g); if (g.index) R.attr.add(g.index); for (const n in g.attributes) R.attr.add(g.attributes[n]); }
  });
  return R;
}
// Cycle 9: resident worlds are counted by weight: a map above 64 x 64 weighs its area / 4096 (a 96 x 96 field = 2.25), a
// small interior or cave a quarter (entering a tavern keeps the town resident); every other map weighs 1 (as before).
function worldWeight(m) { const a = m.w * m.h / 4096; return a > 1 ? a : mapKind(m) ? Math.max(0.25, a) : 1; }
function worldLRU(m) {
  const i = WORLD_LRU.indexOf(m); if (i >= 0) WORLD_LRU.splice(i, 1);
  // a regenerated map (a new Deep run, a floor rebuilt after its cache was dropped) is a new object with an old id: the
  // stale object's world can never be shown again, so it is freed now instead of holding a slot (and GPU memory)
  for (let j = WORLD_LRU.length - 1; j >= 0; j--) { const o = WORLD_LRU[j]; if (o.id === m.id || (typeof mapCache !== 'undefined' && mapCache[o.id] !== o)) { WORLD_LRU.splice(j, 1); freeWorld(o); } }
  WORLD_LRU.push(m);
  const keep = WORLD_KEEP(); let sum = 0; for (const o of WORLD_LRU) sum += worldWeight(o);
  while (WORLD_LRU.length > 1 && sum > keep + 1e-6) { const o = WORLD_LRU.shift(); sum -= worldWeight(o); freeWorld(o); }
}
function freeWorld(m) {
  const grp = m && m.world; if (!grp || grp === curWorld) return;
  grp.userData.dead = true;
  const live = { tex: new Set(), geo: new Set(), attr: new Set(), mats: new Set() };
  for (const o of WORLD_LRU) if (o.world && o !== m) worldRefs(o.world, live);
  worldRefs(scene, live);
  for (const k in TEX) live.tex.add(TEX[k]); for (const k in DETAIL) live.tex.add(DETAIL[k].tex); for (const k in TREETEX) live.tex.add(TREETEX[k]);
  const dead = worldRefs(grp);
  let nt = 0, ng = 0;
  for (const t of dead.tex) if (!live.tex.has(t)) { t.dispose(); nt++; }
  if (m.hgtInfo && m.hgtInfo.tex && !live.tex.has(m.hgtInfo.tex)) { m.hgtInfo.tex.dispose(); nt++; }
  // attributes shared with resident geometry (prop templates, grass blade) keep their buffers; template attributes no
  // resident world uses any more are freed with the last geometry that referenced them (re-uploaded if used again)
  for (const g of dead.geo) { if (live.geo.has(g)) continue; disposeGeo(g, live.attr); ng++; }
  grp.traverse(o => { if (o.isInstancedMesh) o.dispose(); });
  m.world = null; m.anim = null; m.hgtInfo = null; m.gbase = null; m.gmask = null;
  GLOAD.stats.freed.push({ map: m.id, textures: nt, geometries: ng });
  for (const f of GFX.worldHooks) try { f(m.id, WORLD_LRU.map(o => o.id)); } catch (e) { console.warn('[gfx] world hook', e); }
}
const GLOAD = {
  pending: false, defer: false, t0: 0, frames: 0, progs: null, uploaded: false, check: false, el: null, maxMs: 2000,
  ext: renderer.extensions.get('KHR_parallel_shader_compile'),
  gate: window.AOM_GFX_GATE !== undefined ? !!window.AOM_GFX_GATE : !GFX_ENV.headless,
  stats: { last: null, freed: [] },
};
if (GLOAD.ext && typeof GLOAD.ext.maxShaderCompilerThreadsKHR === 'function') try { GLOAD.ext.maxShaderCompilerThreadsKHR(0xFFFFFFFF); } catch (e) { /* optional */ }
function gloadFade(on) {
  let el = GLOAD.el;
  if (!el) {
    if (!on) return;
    el = GLOAD.el = document.createElement('div'); el.id = 'gfxfade';
    el.style.cssText = 'position:absolute;inset:0;background:#07080c;pointer-events:none;opacity:0';
    const cv = document.getElementById('cv'); if (cv && cv.parentNode) cv.parentNode.insertBefore(el, cv.nextSibling); else document.body.appendChild(el);
  }
  if (on) { el.style.transition = 'none'; el.style.opacity = '1'; }
  else { el.style.transition = 'opacity .35s ease-out'; el.style.opacity = '0'; }
}
function mapEntryLoad(fresh) {
  GLOAD.pending = false; GLOAD.defer = false;
  const t0 = performance.now(), known = new Set(renderer.info.programs || []), chk = renderer.debug.checkShaderErrors;
  if (GLOAD.ext) renderer.debug.checkShaderErrors = false;
  try {
    camera.updateMatrixWorld(); scene.updateMatrixWorld();
    renderer.compile(scene, camera);
    if (GFX.composer && GFX.composer.precompile) GFX.composer.precompile();
  } catch (e) { console.warn('[gfx] precompile', e); }
  finally { renderer.debug.checkShaderErrors = chk; }
  const progs = (renderer.info.programs || []).filter(p => !known.has(p));
  GLOAD.progs = GLOAD.ext ? progs : null; GLOAD.check = !!GLOAD.ext && progs.length > 0;
  GLOAD.stats.last = { map: map.id, fresh, programs: progs.length, compileMs: +(performance.now() - t0).toFixed(1), parallel: !!GLOAD.ext, gated: false, waitMs: 0, frames: 0 };
  AUTO.reset(2000);
  if (GLOAD.gate && (fresh || progs.length)) { GLOAD.pending = true; GLOAD.t0 = performance.now(); GLOAD.frames = 0; GLOAD.uploaded = false; GLOAD.stats.last.gated = true; gloadFade(true); }
}
// Upload the current world's textures now (under the fade) instead of inside the first visible frame.
function gloadUpload() {
  const R = worldRefs(curWorld);
  for (const t of R.tex) if (t.image || t.isDataTexture) try { renderer.initTexture(t); } catch (e) { /* not uploadable yet (image loading) */ }
}
// Programs compiled without three's blocking link check: check them once the driver reports them complete.
function gloadCheck() {
  GLOAD.check = false; const gl = renderer.getContext();
  for (const p of GLOAD.progs || []) if (!gl.getProgramParameter(p.program, gl.LINK_STATUS)) console.error('THREE.WebGLProgram: shader error (' + p.name + '):', gl.getProgramInfoLog(p.program));
}
// Called by gfxPresent before drawing: false = keep the world hidden this frame (still loading).
function gloadReady() {
  if (!GLOAD.pending) { if (GLOAD.check) gloadCheck(); return true; }
  if (GLOAD.defer) { if (GLOAD.frames++ === 0) return false; GLOAD.defer = false; enterWorldNow(true); return !GLOAD.pending; }   // build frame; uploads next frame
  if (!GLOAD.uploaded) { GLOAD.uploaded = true; gloadUpload(); return false; }
  GLOAD.frames++;
  const gl = renderer.getContext(), ext = GLOAD.ext, el = performance.now() - GLOAD.t0;
  let done = true;
  if (ext && GLOAD.progs) for (const p of GLOAD.progs) if (!gl.getProgramParameter(p.program, ext.COMPLETION_STATUS_KHR)) { done = false; break; }
  if (!done && el < GLOAD.maxMs && GLOAD.frames < 240) return false;
  GLOAD.pending = false; GLOAD.stats.last.waitMs = Math.round(el); GLOAD.stats.last.frames = GLOAD.frames; GLOAD.stats.last.timedOut = !done;
  if (GLOAD.check) gloadCheck();
  gloadFade(false); AUTO.reset(1000);
  return true;
}
GFX.load = GLOAD;
// GPU memory estimate (MB) of what the renderer holds for the world and the pipeline: render targets (post + shadow maps
// + canvas), textures and geometry of the resident worlds, templates and the scene. perf.py's map_entry scenario
// measures the real allocations (WebGL calls); this is the in-game view (console: GFX.memory()).
GFX.memory = () => {
  const MB = b => +(b / 1048576).toFixed(1), texB = t => {
    const im = t.image, w = im && (im.width || im.videoWidth) || 0, h = im && (im.height || im.videoHeight) || 0; if (!w || !h) return 0;
    const bpp = t.type === THREE.HalfFloatType ? 8 : t.type === THREE.FloatType ? 16 : 4, mips = t.generateMipmaps && t.minFilter !== THREE.LinearFilter && t.minFilter !== THREE.NearestFilter ? 4 / 3 : 1;
    return w * h * bpp * mips * (t.isCubeTexture ? 6 : 1);
  };
  const R = { tex: new Set(), geo: new Set(), attr: new Set(), mats: new Set() };
  worldRefs(scene, R); for (const m of WORLD_LRU) if (m.world) worldRefs(m.world, R);
  for (const id in PROPS.tpl) for (const pt of PROPS.tpl[id].parts) { if (pt.geo.index) R.attr.add(pt.geo.index); for (const n in pt.geo.attributes) R.attr.add(pt.geo.attributes[n]); }
  let tex = 0, geo = 0; for (const t of R.tex) tex += texB(t); for (const a of R.attr) geo += a.array ? a.array.byteLength : 0;
  const post = GFX.composer && GFX.composer.memory ? GFX.composer.memory() : 0;
  const sm = sun.shadow.mapSize.x, shadow = sun.castShadow ? sm * sm * 8 + (SHADOW.rt ? sm * sm * 4 : 0) + (SHADOW.bld && SHADOW.bld.light.shadow.map ? sm * sm * 8 : 0) : 0;
  const gl = renderer.getContext(), a = gl.getContextAttributes() || {}, px = gl.drawingBufferWidth * gl.drawingBufferHeight, canvas = px * (8 + (a.depth ? 4 : 0)) + (a.antialias ? px * 32 : 0);
  return { quality: GFX.quality, level: GFX.level, scale: GFX.scale, worlds: WORLD_LRU.map(m => m.id), postMB: MB(post), shadowMB: MB(shadow), canvasMB: MB(canvas), texturesMB: MB(tex), textures: R.tex.size, geometryMB: MB(geo), totalMB: MB(post + shadow + canvas + tex + geo) };
};

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
  WXS.dirty = true;   // time of day / weather re-applied on top (next wxUpdate)
}
// With the loading gate, a world that must be built is built one frame later, behind the already painted fade
// (gloadReady): the warp shows black at once instead of freezing on the old map while the new one is built.
function enterWorld() {
  if (GLOAD.gate && !map.world) {
    if (curWorld) { scene.remove(curWorld); curWorld = null; }
    Object.assign(GLOAD, { pending: true, defer: true, t0: performance.now(), frames: 0, uploaded: false });
    gloadFade(true); AUTO.reset(2000); clearVis();
    return;
  }
  enterWorldNow();
}
function enterWorldNow(deferred) {
  RL = rlookFor(map);
  if (curWorld) scene.remove(curWorld);
  const fresh = !map.world;
  curWorld = buildWorld(map); scene.add(curWorld);
  if (curWorld.userData.epoch !== GFX_EPOCH) refreshMaterials(curWorld);
  worldQuality(curWorld);
  applyLook();
  worldLRU(map);
  GFX.world = { hgt: map.hgtInfo || null, shadow: SHADOW };
  if (map.anim && map.anim.boards && typeof QUEST_UI !== 'undefined') QUEST_UI.boards = false;   // the 3D board mesh replaces the overlay placeholder
  if (map.anim && map.anim.gate && typeof QUEST_UI !== 'undefined') QUEST_UI.helgate = false;   // Hel's gate is a mesh now
  SHADOW.need = true;
  // static light sources for the point-light pool
  LSRC.length = 0; const Lc = RL.lights;
  for (const b of map.braziers) LSRC.push({ x: b.x, y: b.y, h: groundH(b.x, b.y) + 1.35, c: linCol(Lc.brazier[0]), i: Lc.brazier[1], d: Lc.brazier[2], fl: 1, ph: b.x * 3.1 + b.y, lamp: true });
  if (map.way) LSRC.push({ x: map.way.x, y: map.way.y, h: groundH(map.way.x, map.way.y) + 3.2, c: linCol(Lc.way[0]), i: Lc.way[1], d: Lc.way[2], fl: 1, ph: 0.7, way: true });
  for (const wp of map.warps) {
    const dk = doorKind(wp, map);
    if (!dk) LSRC.push({ x: wp.x + 0.5, y: wp.y + 0.5, h: groundH(wp.x + 0.5, wp.y + 0.5) + 1.2, c: linCol(Lc.warp[0]), i: Lc.warp[1], d: Lc.warp[2], fl: 0.3, ph: 2, warp: wp });
    else if (dk !== 'mouth') { const D = doorDir(wp, map), ex = dk === 'exit', x = wp.x + 0.5 + D.nx * 0.6, y = wp.y + 0.5 + D.nz * 0.6; LSRC.push({ x, y, h: groundH(x, y) + 1.3, c: linCol(ex ? 0xd8e6ff : 0xffb870), i: ex ? 1.2 : 0.9, d: ex ? 6 : 4.5, fl: ex ? 0.02 : 0.15, ph: wp.x + wp.y, door: wp }); }
  }
  for (const l of mapLights(map)) LSRC.push({ x: l.x, y: l.y, h: groundH(l.x, l.y) + l.h + 0.15, c: l.lin, i: l.i, d: l.r, fl: l.fl, ph: l.x * 2.1 + l.y, lamp: true });   // cycle 9
  for (const wv of (map.anim && map.anim.windows) || []) LSRC.push({ x: wv.x, y: wv.z, h: wv.h, c: linCol(0xffe8c8), i: 0.7, d: 4.5, fl: 0, ph: 0 });
  const Ll = Lc.lamp || [0xffc070, 0.5, 4.5];
  for (const l of (map.propLights || [])) LSRC.push({ x: l.x, y: l.z, h: l.h, c: linCol(Ll[0]), i: Ll[1], d: Ll[2], fl: 0.12, ph: l.x * 1.7 + l.z, lamp: true });
  for (const o of map.objs) if (o.kind === 'helgate') LSRC.push({ x: o.x, y: o.y + 0.7, h: groundH(o.x, o.y) + 1.8, c: new THREE.Color(), i: 0, d: 7, fl: 0.1, ph: 3, gate: true });
  for (const l of (map.propDLights || [])) { let c; try { c = linCol(l.col); } catch (e) { c = linCol(0xffc070); } LSRC.push({ x: l.x, y: l.z, h: l.h, c, i: l.i, d: l.d, fl: 0.1, ph: l.x * 2.3 + l.z, lamp: true }); }
  if (map.heart) LSRC.push({ x: map.heart.x, y: map.heart.y + 0.6, h: groundH(map.heart.x, map.heart.y) + 1.8, c: linCol(Lc.heart[0]), i: Lc.heart[1], d: Lc.heart[2], fl: 0.2, ph: 1, heart: true });
  if (!deferred) clearVis();   // (deferred: cleared when the warp started; sprites made since belong to this map)
  if (P) { cam.tx = P.x; cam.ty = P.y; cam.th = groundH(P.x, P.y); }
  try { wxEnter(map); } catch (e) { console.warn('[gfx] weather', e); WXS.on = false; GFX.look = null; }
  LT.key = ''; buildLightGrid();
  mapEntryLoad(fresh);
  PROPS.prefetch();
}
function snapCam() { cam.tx = P.x; cam.ty = P.y; cam.th = groundH(P.x, P.y); }

/* ---------- lightTint(x, y[, out]) — sprite light multiplier at tile position ----------
   Returns {r,g,b} (linear, multiply into the sprite material colour): ~1 in daylight,
   >1 near fires/magic, <1 in shade and dark corners. Baked per map at 2 samples/tile
   (ambient + sun with a ray-marched shade test + braziers/waystone/warps/lava/heart),
   plus the few dynamic spell lights of this frame. Pass `out` to avoid allocation. */
// (round 5: baked as two layers so time of day / overcast can re-light sprites every frame without a rebake:
//  LT.lit = sun visibility 0..1, LT.g = the static fires' light (rgb). lightTint = amb + sun * lit + fires * lamp, with
//  amb / sun / lamp from WXS (the map's lt at day: identical to the old single bake).)
const LT = { g: null, lit: null, gw: 0, gh: 0, key: '', dyn: [], nd: 0, amb: [1, 1, 1], sun: [0, 0, 0], lamp: 1 };
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
  const m = map, R = RL, gw = m.w * LT_RES, gh = m.h * LT_RES, G = new Float32Array(gw * gh * 3), LI = new Float32Array(gw * gh);
  const sd = SKY.sunDir, hl = Math.hypot(sd.x, sd.z) || 1, dx = sd.x / hl, dz = sd.z / hl, tanE = sd.y / hl;
  const spans = []; for (let i = 0; i < m.w * m.h; i++) spans.push(casterSpan(m.t[i], m, i % m.w, (i / m.w) | 0));
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const px = (i + 0.5) / LT_RES, pz = (j + 0.5) / LT_RES, own = ((pz | 0) * m.w + (px | 0));
    let shade = 0;
    for (let t = 0.3; t < 8; t += 0.3) {
      const x = px + dx * t, z = pz + dz * t; if (x < 0 || z < 0 || x >= m.w || z >= m.h) break;
      const k = (z | 0) * m.w + (x | 0); if (k === own) continue; const s = spans[k]; if (!s) continue;
      const hy = t * tanE; if (hy >= s[0] && hy <= s[1]) { shade = s[2]; break; }
    }
    LI[j * gw + i] = 1 - shade;
  }
  const splat = (x, y, rad, c, k) => {
    const x0 = Math.max(0, Math.floor((x - rad) * LT_RES)), x1 = Math.min(gw - 1, Math.ceil((x + rad) * LT_RES)), y0 = Math.max(0, Math.floor((y - rad) * LT_RES)), y1 = Math.min(gh - 1, Math.ceil((y + rad) * LT_RES));
    for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) { const d = Math.hypot((i + 0.5) / LT_RES - x, (j + 0.5) / LT_RES - y); if (d >= rad) continue; const f = 1 - d / rad, a = f * f * k, o = (j * gw + i) * 3; G[o] += c.r * a; G[o + 1] += c.g * a; G[o + 2] += c.b * a; }
  };
  const warm = new THREE.Color(1, 0.62, 0.3), blue = new THREE.Color(0.35, 0.6, 1), lava = new THREE.Color(1, 0.42, 0.14), gold = new THREE.Color(1, 0.8, 0.45);
  const fire = Array.isArray(R.flame) && R.flame.length === 3 ? new THREE.Color(R.flame[0], R.flame[1], R.flame[2]).multiplyScalar(1 / Math.max(R.flame[0], R.flame[1], R.flame[2], 1e-3)) : warm;
  const dim = R.exposure > 1.05 ? 1.0 : 0.75;       // fires read stronger in dark maps
  for (const b of m.braziers) splat(b.x, b.y, 4.2, fire, 0.8 * dim);
  const wayLit = !!(P && P.kindled && P.kindled[m.id]), kingSlain = !!(P && P.flags && P.flags.kingSlain);
  if (m.way && wayLit) splat(m.way.x, m.way.y, 5.5, warm, 0.7 * dim);
  for (const wp of m.warps) { const dk = doorKind(wp, m); if (!dk) splat(wp.x + 0.5, wp.y + 0.5, 2.8, blue, 0.5); else if (dk === 'door') splat(wp.x + 0.5, wp.y + 0.5, 2.4, warm, 0.45); else if (dk === 'exit') splat(wp.x + 0.5, wp.y + 0.5, 3, _dayC, 0.5); }
  for (const l of mapLights(m)) { const c = l.lin, mx = Math.max(c.r, c.g, c.b, 1e-3); _col.setRGB(c.r / mx, c.g / mx, c.b / mx); splat(l.x, l.y, l.r * 0.8, _col, Math.min(1.1, 0.45 * l.i) * dim); }   // cycle 9
  for (const wv of (m.anim && m.anim.windows) || []) splat(wv.x, wv.z, 3, _dayC, 0.35);
  for (const l of (m.propLights || [])) splat(l.x, l.z, 2.6, warm, 0.25 * dim);
  if (m.heart && kingSlain) splat(m.heart.x, m.heart.y + 1, 7, gold, 0.7);
  if (m.d.look.lava) for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) { if (m.t[y * m.w + x] !== T.LAVA) continue; let open = false; for (let k = 0; k < 4 && !open; k++) { const nx = x + DX[k], ny = y + DY[k]; open = nx >= 0 && ny >= 0 && nx < m.w && ny < m.h && m.t[ny * m.w + nx] === 0; } if (open) splat(x + 0.5, y + 0.5, 2.2, lava, 0.18); }
  for (let i = 0; i < G.length; i++) G[i] = Math.min(G[i], 2.2);
  LT.g = G; LT.lit = LI; LT.gw = gw; LT.gh = gh; LT.key = m.id + '|' + wayLit + '|' + kingSlain;
  if (!WXS.on) { LT.amb = R.lt.amb; LT.sun = R.lt.sun; LT.lamp = 1; }
}
function lightTint(x, y, out) {
  out = out || { r: 1, g: 1, b: 1 };
  const G = LT.g; if (!G) { out.r = out.g = out.b = 1; return out; }
  const gw = LT.gw, gh = LT.gh;
  let fx = x * LT_RES - 0.5, fy = y * LT_RES - 0.5; fx = fx < 0 ? 0 : fx > gw - 1.001 ? gw - 1.001 : fx; fy = fy < 0 ? 0 : fy > gh - 1.001 ? gh - 1.001 : fy;
  const xi = fx | 0, yi = fy | 0, ax = fx - xi, ay = fy - yi, j0 = yi * gw + xi, i0 = j0 * 3, i1 = i0 + 3, i2 = i0 + gw * 3, i3 = i2 + 3;
  const w0 = (1 - ax) * (1 - ay), w1 = ax * (1 - ay), w2 = (1 - ax) * ay, w3 = ax * ay, LI = LT.lit, A = LT.amb, S = LT.sun, k = LT.lamp;
  const lit = LI[j0] * w0 + LI[j0 + 1] * w1 + LI[j0 + gw] * w2 + LI[j0 + gw + 1] * w3;
  let r = A[0] + S[0] * lit + (G[i0] * w0 + G[i1] * w1 + G[i2] * w2 + G[i3] * w3) * k, g = A[1] + S[1] * lit + (G[i0 + 1] * w0 + G[i1 + 1] * w1 + G[i2 + 1] * w2 + G[i3 + 1] * w3) * k, b = A[2] + S[2] * lit + (G[i0 + 2] * w0 + G[i1 + 2] * w1 + G[i2 + 2] * w2 + G[i3 + 2] * w3) * k;
  r = r > 2.2 ? 2.2 : r; g = g > 2.2 ? 2.2 : g; b = b > 2.2 ? 2.2 : b;
  for (let k = 0; k < LT.nd; k++) { const d = LT.dyn[k], ddx = x - d.x, ddy = y - d.y, q = ddx * ddx + ddy * ddy; if (q >= d.r2) continue; const f = 1 - Math.sqrt(q) / d.rad, a = f * f * d.k; r += d.c.r * a; g += d.c.g * a; b += d.c.b * a; }
  out.r = r > 2.4 ? 2.4 : r; out.g = g > 2.4 ? 2.4 : g; out.b = b > 2.4 ? 2.4 : b;
  return out;
}
GFX.lightTint = lightTint;

/* ---------- Per-frame: point-light pool, sun/shadow follow, fog ---------- */
const DYN = []; for (let i = 0; i < 24; i++) DYN.push({ x: 0, y: 0, h: 0, c: new THREE.Color(), i: 0, d: 0, dyn: true, s: 0, rad: 0, r2: 0, k: 0, noPL: false });
const _dayC = new THREE.Color(0.85, 0.92, 1.0), _lockC = new THREE.Color(1.6, 0.3, 0.15), _torchC = linCol(0xffae68), _allyC = linCol(0xffb878);
const _cand = [], _col = new THREE.Color();
function spellLights() {
  let n = 0;
  const add = (x, y, h, hex, I, d) => { if (n >= DYN.length) return; const o = DYN[n++]; o.x = x; o.y = y; o.h = h; o.c.copy(linCol(hex)); o.i = I; o.d = d; o.rad = d * 0.7; o.r2 = o.rad * o.rad; o.k = Math.min(1.2, I * 0.35); o.noPL = false; };
  // cycle 9, caves: the controlled hero's torch lights the sprites around it (the torch PointLight lights the world), every
  // other hero of the party carries a smaller glow (a real light from the pool + the sprite tint)
  if (map && P && mapKind(map) === 'cave' && WXS.torchI > 0) {
    const L = ctrlHero(), R = RL && RL.torch;
    if (L && n < DYN.length) { const o = DYN[n++]; o.x = L.x; o.y = L.y; o.h = groundH(L.x, L.y) + 1.8; o.c.copy(_torchC); o.i = WXS.torchI; o.d = R ? R[2] : 11; o.rad = o.d * 0.72; o.r2 = o.rad * o.rad; o.k = Math.min(0.9, WXS.torchI * 0.38); o.noPL = true; }
    if (typeof gfxHeroes === 'function') { const Hs = gfxHeroes(); for (let i = 0; i < Hs.length && n < DYN.length; i++) { const hh = Hs[i]; if (!hh || hh === L || hh.dead) continue; const o = DYN[n++]; o.x = hh.x; o.y = hh.y; o.h = groundH(hh.x, hh.y) + 1.6; o.c.copy(_allyC); o.i = 1.15; o.d = 6.5; o.rad = 4.6; o.r2 = o.rad * o.rad; o.k = 0.42; o.noPL = false; } }
  }
  if (typeof projs !== 'undefined') for (const p of projs) if (p.kind !== 'arrow') add(p.x, p.y, p.zu, PCOL[p.kind] || '#ffffff', 2.6, 5.5);
  if (typeof fxs !== 'undefined') for (const f of fxs) {
    const k = 1 - f.t / f.dur;
    if (f.k === 'meteor') add(f.x, f.y, groundH(f.x, f.y) + 1, f.col || '#ff7a2a', 5 * k, 8);
    else if (f.k === 'strike') add(f.x, f.y, groundH(f.x, f.y) + 2, '#dfe8ff', 6 * k, 8);
    else if (f.k === 'pillar' && f.e) add(f.e.x, f.e.y, groundH(f.e.x, f.e.y) + 1.5, f.col || '#ffffff', 2.4 * Math.sin(Math.PI * (1 - k)), 6);
  }
  if (typeof teles !== 'undefined') for (const t of teles) add(t.x, t.y, groundH(t.x, t.y) + 0.8, '#ff4a1a', 0.8 + 1.4 * (t.t / t.dur), t.r + 2.5);
  if (P && P.casting && typeof SKILLS !== 'undefined' && SKILLS[P.casting.id]) add(P.x, P.y, groundH(P.x, P.y) + 0.6, ELCOL[SKILLS[P.casting.id].el] || '#ffffff', 1.6, 5);
  if (P && typeof gfxHeroes === 'function' && typeof SKILLS !== 'undefined') { const H = gfxHeroes(); for (let i = 0; i < H.length; i++) { const h = H[i]; if (h !== P && h.casting && !h.dead && SKILLS[h.casting.id]) add(h.x, h.y, groundH(h.x, h.y) + 0.6, ELCOL[SKILLS[h.casting.id].el] || '#ffffff', 1.6, 5); } }   // squad mode: allies' casts
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
  for (let k = 0; k < nd; k++) { const o = DYN[k]; if (o.noPL) continue; o.s = (o.x - tx) ** 2 + (o.y - ty) ** 2 - 400; _cand.push(o); }
  _cand.sort((a, b) => a.s - b.s);
  for (let k = 0; k < PL.length; k++) {
    const l = PL[k], s = _cand[k];
    if (!s) { l.intensity = 0; continue; }
    let I = s.i;
    let jx = 0, jz = 0;
    if (s.fl && !s.dyn) { I *= flick(s.fl, s.ph); if (s.fl >= 1) { jx = Math.sin(time * 7.1 + s.ph) * 0.05; jz = Math.cos(time * 8.3 + s.ph) * 0.05; } }
    if (s.lamp) I *= WXS.lamp;
    if (s.gate) { const G = map.anim && map.anim.gate, k = G ? G.k : 0; I = 0.25 + 2.2 * k; l.color.copy(GATEU.uCol.value); l.intensity = I * flick(0.1, s.ph); l.distance = s.d; l.position.set(s.x, s.h, s.y); continue; }
    if (s.warp) { const locked = warpIsLocked(s.warp); _col.setRGB(locked ? 1 : s.c.r, locked ? 0.25 : s.c.g, locked ? 0.12 : s.c.b); l.color.copy(_col); } else if (s.door && warpIsLocked(s.door)) l.color.setRGB(1, 0.25, 0.12); else l.color.copy(s.c);
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
  const k = cam.dist / 40, F = (WXS.on && WXS.look ? WXS.look : RL); if (scene.fog && F) { scene.fog.near = F.fog[0] * k; scene.fog.far = F.fog[1] * k; LAVAU.uFog.value.set(scene.fog.near, scene.fog.far); }
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
  wxUpdate(dt);
  const lk = 1 + (WXS.lamp - 1) * 0.35;
  if (A.halos) for (const h of A.halos) h.s.material.opacity = (h.night ? h.op + h.night * WXS.n : h.op) * flick(h.fl, h.ph) * (h.lamp ? lk : 1);
  POOLU.uT.value = time; POOLU.uWay.value = lit ? 1 : 0;
  if (A.motes) {
    MOTEU.uT.value = time; MOTEU.uC.value.set(cam.tx, cam.th, cam.ty); MOTEU.uScale.value = renderer.getDrawingBufferSize(_dbs).y * (GFX.composer && GFX.composer.on ? GFX.composer.scale : 1) * 0.5 * camera.projectionMatrix.elements[5];
    MOTEU.tShadow.value = SHADOW.tex; MOTEU.uShadowM.value.copy(sun.shadow.matrix); MOTEU.uLitOn.value = SHADOW.split && SHADOW.tex ? 1 : 0;
  }
  if (A.lava) LAVAU.uTime.value = time;
  WATERU.uT.value = time; GJU.uGj.value = (time * 0.012) % 64;
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
  const TH = ctrlHero() || P, cave = mapKind(map) === 'cave'; torch.position.set(TH.x, groundH(TH.x, TH.y) + (cave ? 1.8 : 2.2), TH.y);
  const key = map.id + '|' + lit + '|' + !!(P.flags && P.flags.kingSlain); if (LT.key !== key) buildLightGrid();
  updateLights(); updateSun(); updateAtmosphere();
  kindFrame(A, cave);
}
// Cycle 9 per frame: interior cutaway direction + the pieces that hide with a cut wall (doors, windows), locked-door tint,
// the cave torch's flicker, big-map sector culling.
function kindFrame(A, cave) {
  const cx = Math.sin(cam.yaw), cz = Math.cos(cam.yaw), H = ctrlHero(); WALLU.uCamD.value.set(cx, cz); if (H) WALLU.uHero.value.set(H.x, H.y); WALLU.uCutOn.value = mapKind(map) ? 1 : 0;
  if (A.cutVis) for (const c of A.cutVis) c.o.visible = c.nx * cx + c.nz * cz > -0.3 && !(H && (c.x - H.x) * cx + (c.z - H.y) * cz > 0.75);
  if (A.doors) for (const d of A.doors) if (d.halo) d.halo.material.color.copy(warpIsLocked(d.wp) ? _lockC : d.col);
  if (cave && WXS.torchI > 0) { torch.intensity = WXS.torchI * flick(0.16, 1.7); TORCHU.uTorchP.value.copy(torch.position); TORCHU.uTorchC.value.copy(torch.color).multiplyScalar(torch.intensity * 0.5); TORCHU.uTorchC2.value.set(torch.distance, 0); }
  sectorUpdate();
}
/* Squad mode: when the player swaps heroes (P changes to another member of the same PARTY, same map), the camera eases
   from where it is to the new hero over CAMSW.dur s (smoothstep, tracking the hero while it moves) instead of the
   follow's snap-ish catch-up, then the usual exponential follow takes over. A party of one never swaps. */
const CAMSW = { p: null, map: null, t: -1, dur: 0.3, x0: 0, y0: 0, h0: 0 };
function updateCamera(dt) {
  const P = ctrlHero();
  if (P) {
    if (CAMSW.p !== P) {
      const prev = CAMSW.p, party = typeof PARTY !== 'undefined' && PARTY && PARTY.members;
      if (prev && started && CAMSW.map === map && party && party.length > 1 && party.indexOf(prev) >= 0 && party.indexOf(P) >= 0) { CAMSW.t = 0; CAMSW.x0 = cam.tx; CAMSW.y0 = cam.ty; CAMSW.h0 = cam.th; }
      else CAMSW.t = -1;
      CAMSW.p = P;
    }
    CAMSW.map = map;
    if (CAMSW.t >= 0) {
      CAMSW.t += dt; const k = smoothstep(0, CAMSW.dur, CAMSW.t);
      cam.tx = CAMSW.x0 + (P.x - CAMSW.x0) * k; cam.ty = CAMSW.y0 + (P.y - CAMSW.y0) * k; cam.th = CAMSW.h0 + (groundH(P.x, P.y) - CAMSW.h0) * k;
      if (CAMSW.t >= CAMSW.dur) CAMSW.t = -1;
    } else {
      const k = started ? 1 - Math.pow(0.0005, dt) : 0.02;
      cam.tx += (P.x - cam.tx) * k; cam.ty += (P.y - cam.ty) * k; cam.th += (groundH(P.x, P.y) - cam.th) * k;
    }
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
  if (curWorld && curWorld.userData.ground) { const gs = curWorld.userData.grounds, hit = (gs && gs.length > 1 ? ray.intersectObjects(gs, false) : ray.intersectObject(curWorld.userData.ground, false))[0]; if (hit) return [hit.point.x, hit.point.z]; }
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
// (the models manifest starts loading at once; each map's models load with its world, neighbours in idle time)
