'use strict';
/* =========================================================
   Per-frame rendering: sprite sync, ground decals, 2D overlay
   (names, bars, RO-style bouncing damage numbers, particles).

   HD-2D sprite pass (round 1):
   - sprite materials are patched (onBeforeCompile) for light tint,
     a 2-texel rim light toward nearby fires / the sun, hit flash,
     a pixel dissolve with an ember edge, ghost tail fade and a
     hair palette ramp (see SPR_OBC);
   - every sprite owns an invisible shadow caster that faces the sun
     (castShadow + an alpha-tested depth material with the same map
     and UVs), so the terrain receives the sprite's silhouette;
   - a small 3D point-particle system (dust, embers, ash, wisps) and
     a billboard swing trail;
   - designed target / lock rings and ember-rune boss telegraphs.
   The render lead's GFX / lightTint / shadow map are optional:
   everything here probes for them each frame.

   Perf round 2: single-layer mob/NPC sheets, contact blobs and ground
   drops are instanced (see "Instanced batches"): one draw + one shadow
   draw per sheet instead of ~4 draws per entity. The overlay uses
   projTo() into reused arrays, cached gradients/glow sprites/strings,
   and PFX particles are pooled.

   Round 5 (mounts & companions): the mounted player (mount_* sheets, gfx-sheets.js) uses the same layered path
   (x-ray, casters, hat); COMPANIONS pets and the Blitz Beat raven are instances of their sheets' sprite batches
   (syncRavenShots / syncCompanions, called from syncEntities before the batches flush).

   Cycle 8 (squad mode): every hero of PARTY is drawn with the full player composite (syncHeroes). The controlled hero
   (leadHero() / P) keeps its layered meshes exactly as before; allies are instances of the hero batches (see "Hero
   batches": one colour + one shadow + one x-ray draw for the whole party). Per-hero trails (SWINGB, one instanced
   draw), auras / spheres / cast circles / dodge puffs / status marks per hero (VFX), a gold ring under the controlled
   hero and role pips under allies, allies' bars + names (drawHeroPlate), heroScreenPos() for the UI's speech bubbles.
   A party of one (PARTY null or one member) renders pixel-identically to before.
   ========================================================= */
const UNITPLANE = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
const FLATPLANE = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
const SHADOWMAT = new THREE.MeshBasicMaterial({ map: TEX.shadow, transparent: true, depthWrite: false, opacity: 0.6 });
// Shadow casters draw nothing in the colour pass; only their customDepthMaterial matters.
// DoubleSide: the shadow pass renders shadowSide[side], and a FrontSide caster would be culled when it faces the sun.
const CASTMAT = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true, side: THREE.DoubleSide });
const VIS = new Map(), DV = new Map();
let frameNo = 0;
// mapfix F2: a map change (clearVis) disposed every sprite material at once, and three frees a shader program as soon as
// no material uses it, so the next map's first frames recompiled the very same sprite programs (6-8 links per warp, a
// 50-200 ms hitch on slow drivers). Their disposal now waits MAT_LATER.ms: the new map's sprites take the programs over.
const MAT_LATER = { q: [], ms: 4000, on: false };
function matDispose(mat) { if (!mat) return; if (MAT_LATER.on) MAT_LATER.q.push(mat, performance.now()); else mat.dispose(); }
function matLaterTick() { const q = MAT_LATER.q; if (!q.length) return; const t = performance.now(); while (q.length && t - q[1] > MAT_LATER.ms) { q.shift().dispose(); q.shift(); } }
function clearVis() {
  MAT_LATER.on = true;
  try { for (const v of VIS.values()) disposeVis(v); VIS.clear(); for (const v of DV.values()) for (const m of v.meshes) { scene.remove(m); matDispose(m.material); } DV.clear(); }
  finally { MAT_LATER.on = false; }
  if (typeof PFX !== 'undefined') PFX.clear(); if (typeof VFX !== 'undefined') VFX.clear();
}
function disposeMesh(m) { scene.remove(m); if (m.material !== SHADOWMAT && m.material !== CASTMAT) matDispose(m.material); if (m.customDepthMaterial) matDispose(m.customDepthMaterial); }
function disposeVis(v) { if (v.dispose) return v.dispose(); for (const m of v.meshes) disposeMesh(m); }

/* ---------- Pipeline probes (the render lead's GFX may or may not exist yet) ---------- */
function gfxQ() { return (typeof GFX !== 'undefined' && GFX && GFX.quality) || 'high'; }
function sprLinear() { return renderer.outputEncoding === THREE.sRGBEncoding || (typeof GFX !== 'undefined' && !!GFX && GFX.linear === true); }
function sunLight() { if (typeof GFX !== 'undefined' && GFX && GFX.sun) return GFX.sun; return typeof sun !== 'undefined' ? sun : null; }
function shadowsOn() { const s = sunLight(); return !!(renderer.shadowMap && renderer.shadowMap.enabled && s && s.castShadow && gfxQ() !== 'low'); }
const toLin = c => sprLinear() ? Math.pow(c, 2.2) : c;
// A colour for a material uniform, converted to the working space.
function wcol(hex, out) { const c = (out || new THREE.Color()).set(hex); if (sprLinear()) c.convertSRGBToLinear(); return c; }
// Sprite textures follow the output encoding (sRGB sheets decode to linear when the pipeline is linear).
function sprTexEnc(t) { if (!t) return t; const e = sprLinear() ? THREE.sRGBEncoding : THREE.LinearEncoding; if (t.encoding !== e) { t.encoding = e; t.needsUpdate = true; } return t; }
function sprMapSet(mat, tex) {
  sprTexEnc(tex);
  if (mat.map !== tex) mat.map = tex;
  if (mat.userData.enc !== tex.encoding) { mat.userData.enc = tex.encoding; mat.needsUpdate = true; }
  const u = mat.userData.u; if (u && tex.image) u.uTexSize.value.set(tex.image.width || 64, tex.image.height || 64);
}
/* ---------- Indexed sprite sheets (perf round 4) ----------
   Sheets decoded by gfx-sheets.js into an R8 index texture (one page = a band of block rows) + a 256x1 RGBA palette
   (every sheet has <= 49 colours, binary alpha) cost 1 byte per texel instead of 4. The shader fetches the index and
   looks the colour up, emulating the RGBA texture's sampler exactly: NEAREST when magnified, LINEAR (4 palette taps,
   clamp to edge) when minified, chosen like the GPU does (rho^2 = max |d(uv*size)/dx|^2, |.../dy|^2 > 1 -> min).
   The fetched colour then goes through the same mapTexelToLinear as before. WebGL2 only (texelFetch / textureSize);
   materials opt in with the SPR_PAL define + a uPal uniform (sprPalMat). SPR_TEX(uv) replaces texture2D(map, uv).
   uTexOff: offset of the page inside the whole sheet in texels (the dissolve hash keeps its sheet-texel pattern). */
const SPR_PAL_HEAD = `
#ifdef SPR_PAL
uniform sampler2D uPal;
bool sprMinF; ivec2 sprMx;
void sprSetup(vec2 uv) {
  ivec2 ts = textureSize(map, 0); vec2 p = uv * vec2(ts), dx = dFdx(p), dy = dFdy(p);
  sprMinF = max(dot(dx, dx), dot(dy, dy)) > 1.0; sprMx = ts - 1;
}
vec4 sprPal(ivec2 t) { return texelFetch(uPal, ivec2(int(texelFetch(map, clamp(t, ivec2(0), sprMx), 0).r * 255.0 + 0.5), 0), 0); }
vec4 sprTex(vec2 uv) {
  vec2 p = uv * vec2(sprMx + 1);
  if (!sprMinF) return sprPal(ivec2(floor(p)));
  p -= 0.5; vec2 f = fract(p); ivec2 i = ivec2(floor(p));
  return mix(mix(sprPal(i), sprPal(i + ivec2(1, 0)), f.x), mix(sprPal(i + ivec2(0, 1)), sprPal(i + ivec2(1, 1)), f.x), f.y);
}
#define SPR_TEX(uv) sprTex(uv)
#define SPR_SETUP(uv) sprSetup(uv)
#else
#define SPR_TEX(uv) texture2D(map, uv)
#define SPR_SETUP(uv)
#endif
`;
const PAL_MAP = `
#ifdef USE_MAP
SPR_SETUP( vUv );
vec4 texelColor = SPR_TEX( vUv );
texelColor = mapTexelToLinear( texelColor );
diffuseColor *= texelColor;
#endif
`;
// Palette lookup in a fragment shader template (before three resolves its #includes): the helpers go after the map
// sampler declaration.
// full: also map_fragment -> PAL_MAP (plain / depth materials; the colour sprite OBCs use SPR_MAP instead).
function palInject(sh, mat, full) {
  if (mat.userData.pal) sh.uniforms.uPal = mat.userData.pal;
  let f = sh.fragmentShader.replace('#include <map_pars_fragment>', '#include <map_pars_fragment>\n' + SPR_PAL_HEAD);
  if (full) f = f.replace('#include <map_fragment>', PAL_MAP);
  sh.fragmentShader = f;
}
// Plain materials sampling a sheet (x-ray, sun casters): palette lookup only.
function PAL_OBC(sh) { palInject(sh, this, true); }
// Opt a material into the palette path of sheet record rec (no-op for RGBA sheets). Keeps an existing onBeforeCompile
// (every sprite OBC calls palInject); plain materials get PAL_OBC.
function sprPalMat(mat, rec) {
  if (!rec || !rec.pal) return mat;
  mat.defines = Object.assign({}, mat.defines, { SPR_PAL: '' }); mat.userData.pal = { value: rec.pal.tex };
  if (!mat.userData.obc) mat.onBeforeCompile = PAL_OBC;
  mat.needsUpdate = true; return mat;
}

/* ---------- Sprite shader patch ---------- */
const SPR_HEAD = `
uniform vec4 uFlash; uniform vec3 uRim; uniform vec2 uRimDir; uniform vec2 uFrameV; uniform float uDissolve; uniform float uFade; uniform vec2 uTexSize; uniform vec2 uTexOff;
#ifdef SPR_HAIR
uniform vec4 uHK; uniform vec3 uH0; uniform vec3 uH1; uniform vec3 uH2; uniform vec3 uH3; uniform vec3 uClip;
#endif
float sprHash(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
`;
const SPR_MAP = `
SPR_SETUP( vUv );
vec4 texelColor = SPR_TEX( vUv );
float sprA = texelColor.a;
texelColor = mapTexelToLinear( texelColor );
#ifdef SPR_HAIR
{ float k = texelColor.g;
  vec3 hc = k < uHK.y ? mix(uH0, uH1, clamp((k - uHK.x) / (uHK.y - uHK.x), 0.0, 1.0))
          : k < uHK.z ? mix(uH1, uH2, (k - uHK.y) / (uHK.z - uHK.y))
          : mix(uH2, uH3, clamp((k - uHK.z) / (uHK.w - uHK.z), 0.0, 1.0));
  texelColor.rgb = hc; }
#endif
diffuseColor *= texelColor;
`;
const SPR_TEST = `
if ( sprA < 0.5 ) discard;
#ifdef SPR_HAIR
if ( dot(vec3(vUv, 1.0), uClip) < 0.0 ) discard;   // headgear hideHair 'top' (gfx-sheets.js hatHair)
#endif
float sprV = clamp((vUv.y - uFrameV.x) / max(1e-5, uFrameV.y - uFrameV.x), 0.0, 1.0);
float sprEdge = 0.0;
if ( uDissolve > 0.0 ) {
  float n = sprHash(floor((vUv * uTexSize + uTexOff) * 0.5)) * 0.68 + (1.0 - sprV) * 0.32;   // 2x2-texel blocks
  float th = uDissolve * 1.25 - 0.12;
  if ( n < th ) discard;
  sprEdge = 1.0 - smoothstep(0.0, 0.16, n - th);
}
`;
const SPR_OUT = `
{
  // hue-preserving soft knee: lit sprites stay crisp pixels instead of blooming into haze near fires
  float sprMx = max(max(outgoingLight.r, outgoingLight.g), outgoingLight.b);
  if ( sprMx > 0.82 ) outgoingLight *= (0.82 + 0.2 * (1.0 - exp(-(sprMx - 0.82) * 4.0))) / sprMx;
  float a1 = SPR_TEX( vUv + uRimDir ).a, a3 = SPR_TEX( vUv + 3.0 * uRimDir ).a;
  outgoingLight += uRim * (step(0.5, a1) * (1.0 - step(0.5, a3)));
  outgoingLight = mix(outgoingLight, uFlash.rgb, uFlash.a);
  outgoingLight = mix(outgoingLight, vec3(2.4, 0.9, 0.22), sprEdge);
  float sprFade = 1.0 - uFade * (1.0 - smoothstep(0.0, 0.5, sprV));
  gl_FragColor = vec4( outgoingLight, diffuseColor.a * sprFade );
}
`;
// Shared function object: the program cache key is its source, so all sprites share one program.
function SPR_OBC(sh) {
  Object.assign(sh.uniforms, this.userData.u); palInject(sh, this);
  sh.fragmentShader = SPR_HEAD + sh.fragmentShader
    .replace('#include <map_fragment>', SPR_MAP)
    .replace('#include <alphatest_fragment>', SPR_TEST)
    .replace('gl_FragColor = vec4( outgoingLight, diffuseColor.a );', SPR_OUT);
}
function sprUniforms() {
  return { uFlash: { value: new THREE.Vector4(1, 1, 1, 0) }, uRim: { value: new THREE.Vector3() }, uRimDir: { value: new THREE.Vector2() },
    uFrameV: { value: new THREE.Vector2(0, 1) }, uDissolve: { value: 0 }, uFade: { value: 0 }, uTexSize: { value: new THREE.Vector2(64, 64) }, uTexOff: { value: new THREE.Vector2(0, 0) } };
}
function spriteMat(tex, o = {}) { return new THREE.MeshBasicMaterial(Object.assign({ map: tex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }, o)); }
// Lit, rim-lit, flashable, dissolvable sprite material. hair: true adds the palette ramp. rec: sheet record (indexed
// sheets: palette lookup).
function fxSpriteMat(tex, hair, rec) {
  const m = spriteMat(null); m.userData.u = sprUniforms(); m.onBeforeCompile = SPR_OBC; m.userData.obc = true;
  if (hair) { m.defines = { SPR_HAIR: '' }; Object.assign(m.userData.u, { uHK: { value: new THREE.Vector4() }, uH0: { value: new THREE.Color() }, uH1: { value: new THREE.Color() }, uH2: { value: new THREE.Color() }, uH3: { value: new THREE.Color() }, uClip: { value: new THREE.Vector3(0, 0, 1) } }); }
  sprPalMat(m, rec); sprMapSet(m, tex); return m;
}
// The same hair clip on a plain sprite / depth material (hair x-ray and sun caster): discard where dot(uv, clip) < 0.
function HAIRCLIP_OBC(sh) {
  sh.uniforms.uClip = this.userData.clipU; palInject(sh, this, true);
  sh.fragmentShader = 'uniform vec3 uClip;\n' + sh.fragmentShader.replace('#include <alphatest_fragment>', '#include <alphatest_fragment>\nif ( dot(vec3(vUv, 1.0), uClip) < 0.0 ) discard;');
}
function hairClipPatch(mat, clipU) { mat.userData.clipU = clipU; mat.userData.obc = true; mat.onBeforeCompile = HAIRCLIP_OBC; mat.needsUpdate = true; return mat; }

/* ---------- Hair palette ramp ----------
   Hair sheets are painted in neutral grey (outline 64, shade 126, lit 184 = 0.72, highlight 228).
   Instead of a flat multiply by swatch/0.72 (which leaves the shade/outline tones grey), each key
   tone is mapped to a colour derived from the swatch: hue-shifted cool shadows, a warm highlight,
   a tinted outline. Works in the sRGB or the linear pipeline (keys and colours follow sprLinear()). */
const HAIRRAMP = {};
function hairRamp(hex) {
  hex = hex || '#b9b3a8'; const lin = sprLinear(), key = hex + (lin ? 'L' : 'G'); if (HAIRRAMP[key]) return HAIRRAMP[key];
  const c = new THREE.Color(hex), mix = (k, t, u) => new THREE.Color(c.r * k + (t[0] - c.r * k) * u, c.g * k + (t[1] - c.g * k) * u, c.b * k + (t[2] - c.b * k) * u);
  const cols = [
    mix(0.3, [0.1, 0.08, 0.17], 0.45),     // outline: dark, violet-tinted
    mix(0.66, [0.28, 0.28, 0.46], 0.28),   // shade: darker, cooler
    c.clone(),                              // lit: the swatch itself
    mix(1, [1, 0.97, 0.88], 0.45),          // highlight: lighter, warm
  ];
  const keys = [64, 126, 184, 228].map(v => lin ? Math.pow(v / 255, 2.2) : v / 255);
  if (lin) for (const q of cols) q.convertSRGBToLinear();
  return (HAIRRAMP[key] = { keys, cols });
}
function applyHairRamp(mat, hex) {
  const u = mat.userData.u; if (!u || !u.uHK) return; const r = hairRamp(hex);
  if (u._hk === r) return; u._hk = r;
  u.uHK.value.set(r.keys[0], r.keys[1], r.keys[2], r.keys[3]); u.uH0.value.copy(r.cols[0]); u.uH1.value.copy(r.cols[1]); u.uH2.value.copy(r.cols[2]); u.uH3.value.copy(r.cols[3]);
}

/* ---------- Shadow casters ---------- */
function makeCaster(geo, tex, rec) {
  const c = new THREE.Mesh(geo, CASTMAT); c.castShadow = true; c.renderOrder = -2;
  c.customDepthMaterial = sprPalMat(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5, side: THREE.DoubleSide }), rec);
  scene.add(c); return c;
}
// Casters face the sun (widest silhouette), choosing the side whose +x matches camera right
// so a sword held on screen-right casts on the same side.
const SPRF = { shadows: false, cyaw: 0, t: 0, dt: 0, rx: 1, ry: 0, cy: 1, sy: 0, lights: null, lightsMap: null };
function casterYaw() {
  const s = sunLight(); if (!s) return cam.yaw;
  const dx = s.position.x - s.target.position.x, dz = s.position.z - s.target.position.z;
  let a = Math.atan2(dx, dz); if (Math.cos(a - cam.yaw) < 0) a += Math.PI; return a;
}
const CAST_H = 1.0;   // caster height vs the true sprite height (visible meshes are stretched by 1/COSP for the camera pitch)

/* ---------- Per-frame sprite look: light, rim, flash, squash, dissolve ---------- */
function sprLights() {
  if (SPRF.lightsMap === map && SPRF.lights) return SPRF.lights;
  const L = [];
  for (const b of map.braziers || []) L.push({ x: b.x, y: b.y, r: 4.6, c: [1.0, 0.58, 0.22], i: 0.62, h: 0.2 });
  if (map.way) L.push({ x: map.way.x, y: map.way.y, r: 5.5, c: [1.0, 0.62, 0.25], i: 0.7, h: 0.9, way: true });
  for (const w of map.warps || []) { const dk = typeof doorKind === 'function' ? doorKind(w, map) : ''; if (dk === 'mouth') continue; const hd = dk === 'door' && typeof houseDoorOf === 'function' && !mapKind(map) ? houseDoorOf(w, map) : null; L.push({ x: hd ? hd.x + Math.sin(hd.rot) * 0.4 : w.x + 0.5, y: hd ? hd.z + Math.cos(hd.rot) * 0.4 : w.y + 0.5, r: 3.2, c: dk === 'door' ? [1.0, 0.66, 0.34] : dk === 'exit' ? [0.82, 0.9, 1.0] : [0.55, 0.78, 1.0], i: 0.45, h: 0.1 }); }   // (cycle 9: doors)
  if (typeof mapLights === 'function') for (const l of mapLights(map)) L.push({ x: l.x, y: l.y, r: Math.min(6, l.r * 0.8), c: [l.c.r, l.c.g, l.c.b], i: Math.min(0.8, 0.4 * l.i), h: 0.2 });
  SPRF.lights = L; SPRF.lightsMap = map; SPRF.lgrid = null; return L;
}
/* Rim lights near a point (perf round 4): sprRim looped over every brazier / waystone / warp of the map for every
   entity every frame (12% self time in the Gloamheim horde). Lights are bucketed into 4x4-tile cells by their radius'
   bounding box, keeping the map's light order in each cell, so the per-entity sum is bit-identical. */
const LGRID_C = 4;
function sprLightsNear(x, y) {
  const L = sprLights(); let G = SPRF.lgrid;
  if (!G) {
    const gw = Math.ceil((map.w || 1) / LGRID_C) + 1, gh = Math.ceil((map.h || 1) / LGRID_C) + 1, cells = new Array(gw * gh);
    for (let i = 0; i < cells.length; i++) cells[i] = [];
    for (const l of L) {
      const cx0 = Math.max(0, Math.floor((l.x - l.r) / LGRID_C)), cx1 = Math.min(gw - 1, Math.floor((l.x + l.r) / LGRID_C));
      const cy0 = Math.max(0, Math.floor((l.y - l.r) / LGRID_C)), cy1 = Math.min(gh - 1, Math.floor((l.y + l.r) / LGRID_C));
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) cells[cy * gw + cx].push(l);
    }
    G = SPRF.lgrid = { gw, gh, cells };
  }
  const cx = Math.floor(x / LGRID_C), cy = Math.floor(y / LGRID_C);
  return cx >= 0 && cy >= 0 && cx < G.gw && cy < G.gh ? G.cells[cy * G.gw + cx] : L;
}
const _LT = { r: 1, g: 1, b: 1 };
function sprLight(v, x, y) {
  let r = 1, g = 1, b = 1;
  if (typeof lightTint === 'function') { try { const c = lightTint(x, y, _LT); if (c) { r = c.r; g = c.g; b = c.b; } } catch (e) { /* keep 1 */ } }
  if (!v.lt) v.lt = { r, g, b };
  else { const k = 1 - Math.exp(-SPRF.dt * 7); v.lt.r += (r - v.lt.r) * k; v.lt.g += (g - v.lt.g) * k; v.lt.b += (b - v.lt.b) * k; }
  return v.lt;
}
// Rim light: strongest nearby fire (screen-side direction), plus a faint sun rim from above.
function sprRim(e, st) {
  st.rim[0] = st.rim[1] = st.rim[2] = 0; st.rdx = 0; st.rdy = 0;
  const q = gfxQ(); if (q === 'low') return;
  let bx = 0, by = 0, bw = 0;
  const LS = sprLightsNear(e.x, e.y);
  for (let i = 0; i < LS.length; i++) {
    const L = LS[i];
    if (L.way && !(P && P.kindled && P.kindled[map.id])) continue;
    const dx = L.x - e.x, dy = L.y - e.y, d = Math.hypot(dx, dy); if (d > L.r || d < 0.05) continue;
    const w = (1 - d / L.r) * (1 - d / L.r) * L.i, sr = (dx * SPRF.rx + dy * SPRF.ry) / d;
    st.rim[0] += L.c[0] * w; st.rim[1] += L.c[1] * w; st.rim[2] += L.c[2] * w; bx += sr * w; by += L.h * w; bw += w;
  }
  const s = sunLight();
  if (s && s.intensity > 0.05) {
    const dx = s.position.x - s.target.position.x, dz = s.position.z - s.target.position.z, d = Math.hypot(dx, dz) || 1;
    const w = Math.min(0.2, s.intensity * 0.26), sr = (dx * SPRF.rx + dz * SPRF.ry) / d;
    st.rim[0] += s.color.r * w; st.rim[1] += s.color.g * w; st.rim[2] += s.color.b * w; bx += sr * w * 0.8; by += w; bw += w;
  }
  if (bw <= 0) return;
  const ax = bx / bw, ay = by / bw;
  // quantise to 8 texel directions: crisp pixel rims, no half-texel sampling
  st.rdx = Math.abs(ax) > 0.33 ? Math.sign(ax) : 0; st.rdy = ay > 0.25 ? 1 : 0; if (!st.rdx && !st.rdy) st.rdy = 1;
  // rim values are linear light amounts added to the lit texel (not colours: no sRGB conversion)
  const k = Math.min(1, bw) / bw * 0.85; st.rim[0] = Math.min(0.8, st.rim[0] * k); st.rim[1] = Math.min(0.8, st.rim[1] * k); st.rim[2] = Math.min(0.8, st.rim[2] * k);
}
const FLASH_WHITE = [1, 0.97, 0.9], FLASH_HURT = [1, 0.32, 0.26];
/* Squad mode: the heroes drawn this frame (every PARTY member + P; rebuilt in syncEntities, no allocation). A hero gets
   the player's hurt flash and never dissolves (a fallen companion lies there until revived). */
const HSET = new Set();
const isHeroE = e => e === P || (!!e && e.kind !== 'mob' && HSET.has(e));
function newSprState() { return { col: [1, 1, 1], a: 1, sx: 1, sy: 1, scl: 1, zoff: 0, rim: [0, 0, 0], rdx: 0, rdy: 0, flash: [1, 1, 1, 0], dis: 0, fade: 0, cast: true, ghost: false }; }
// Compute the look of entity e this frame. o: { tint, opacity, ghost, scl (uniform size multiplier: named monsters) }
function sprFrame(v, e, o) {
  const st = v.st || (v.st = newSprState());
  const lt = sprLight(v, e.x, e.y), useLT = typeof lightTint === 'function';
  const base = o.tint || (useLT ? null : map.d.look.tint) || [1, 1, 1];
  st.col[0] = Math.min(1.8, base[0] * lt.r); st.col[1] = Math.min(1.8, base[1] * lt.g); st.col[2] = Math.min(1.8, base[2] * lt.b);
  st.a = o.opacity === undefined ? 1 : o.opacity; st.ghost = !!o.ghost; st.scl = o.scl || 1; st.fade = 0; st.zoff = 0; st.dis = 0; st.cast = SPRF.shadows && !o.ghost;
  sprRim(e, st);
  // hit flash + squash (mobs: hitFlash; player: hurtT)
  let fl = 0, fc = FLASH_WHITE;
  const hero = isHeroE(e), hf = hero ? (e.hurtT || 0) / 0.3 * 0.22 : (e.hitFlash || 0);
  if (!e.dead && hf > (v.lastHF || 0) + 0.04) v.sqT = time;
  v.lastHF = e.dead ? 0 : hf;
  if (hero) { if (e.hurtT > 0.15) { fl = 0.55 * (e.hurtT - 0.15) / 0.15; fc = FLASH_HURT; } }
  else if (!e.dead && hf > 0) fl = hf > 0.17 ? (ANIME.on() ? 0.24 : 0.72) : (ANIME.on() ? 0.2 : 0.6) * hf / 0.17;   // (linear-space mix: 0.24 already reads as a strong white wash)
  if (e.dead && e.deathT !== undefined && e.deathT < 0.12) fl = 0.9 * (1 - e.deathT / 0.12);
  st.flash[0] = toLin(fc[0]); st.flash[1] = toLin(fc[1]); st.flash[2] = toLin(fc[2]); st.flash[3] = fl;
  const tq = time - (v.sqT === undefined ? -9 : v.sqT);
  if (tq >= 0 && tq < 0.4) { const a = 0.16 * Math.exp(-tq * 11) * Math.cos(tq * 30); st.sx = 1 + a; st.sy = 1 - a * 0.85; } else { st.sx = 1; st.sy = 1; }
  // death: pixel dissolve into embers/ash (mobs are removed at deathT 0.8)
  if (e.dead && !hero && e.deathT !== undefined) { st.dis = clamp((e.deathT - 0.26) / 0.5, 0, 1); if (st.dis > 0.02) st.cast = false; st.a = 1; const ch = 1 - 0.6 * smoothstep(0, 0.5, st.dis); st.col[0] *= ch; st.col[1] *= ch * 0.92; st.col[2] *= ch * 0.88; }
  if (o.ghost) { st.a *= 0.66 + 0.1 * Math.sin(time * 2.3 + (e.id || 0)); st.fade = 0.85; st.zoff = 0.1 + Math.sin(time * 1.9 + (e.id || 0) * 0.7) * 0.07; st.col[0] *= 0.66; st.col[1] *= 0.84; st.col[2] *= 1.0; st.rim[0] *= 0.4; st.rim[1] *= 0.6; st.rim[2] *= 0.9; }
  return st;
}
function sprApply(mat, st, flip) {
  const u = mat.userData.u; mat.color.setRGB(st.col[0], st.col[1], st.col[2]); mat.opacity = st.a;
  if (!u) return;
  u.uRim.value.set(st.rim[0], st.rim[1], st.rim[2]);
  const ts = u.uTexSize.value; u.uRimDir.value.set(st.rdx * (flip ? -1 : 1) / ts.x, st.rdy / ts.y);
  u.uFlash.value.set(st.flash[0], st.flash[1], st.flash[2], st.flash[3]);
  u.uDissolve.value = st.dis; u.uFade.value = st.fade;
}
/* ---------- Instanced batches (perf round 2) ----------
   Entities that share a texture share one InstancedMesh: single-layer mob/NPC sheets (one batch per sheet: colour
   pass + sun-shadow caster in the same mesh), contact blobs (one batch for everything) and ground drops (an icon
   atlas + a rarity-glow batch). Instance data is rebuilt every frame between ibReset() and ibFlush() in
   syncEntities; only the used range is uploaded. Batches have frustumCulled = false (instances are culled by the
   GPU) and a fixed renderOrder, so they do not depend on the per-object depth sort:
     -1.5 contact blobs (before the -1 decals/rings/drop glows, as a blob under an entity always sorted before them)
     -1   drop glows (as before)
     -0.5 sprite + drop batches: binary-alpha, alpha-tested, depth-writing, so they are drawn before every
          renderOrder-0 transparent (glows, ghosts, the layered player sprite, world transparents), which then
          depth-test against them exactly as the back-to-front sort did.
   Ghost mobs (semi-transparent) and the multi-layer player keep their own meshes. window.AOM_SPR_BATCH = false
   turns sprite batching off (A/B comparisons). */
const IB = [];
function sprBatchOn() { return typeof window === 'undefined' || window.AOM_SPR_BATCH !== false; }
// o: { geo() -> BufferGeometry, mat, attrs: { name: itemSize }, color: bool (instanceColor), depth: customDepthMaterial, order }
function ibNew(o) { const B = Object.assign({ n: 0, cap: 0, mesh: null, m: null, A: {}, c: null, warm: 0, keys: Object.keys(o.attrs || {}) }, o); IB.push(B); ibAlloc(B, o.cap || 16); return B; }
function ibAlloc(B, cap) {
  const old = B.mesh, geo = B.geo();
  for (const k of B.keys) {
    const sz = B.attrs[k], a = new THREE.InstancedBufferAttribute(new Float32Array(cap * sz), sz).setUsage(THREE.DynamicDrawUsage);
    if (old) a.array.set(old.geometry.attributes[k].array); geo.setAttribute(k, a); B.A[k] = a.array;
  }
  const mesh = new THREE.InstancedMesh(geo, B.mat, cap); mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  if (B.color) mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
  if (old) { mesh.instanceMatrix.array.set(old.instanceMatrix.array); if (B.color) mesh.instanceColor.array.set(old.instanceColor.array); scene.remove(old); old.dispose(); old.geometry.dispose(); }
  mesh.frustumCulled = false; mesh.renderOrder = B.order || 0; mesh.count = 0; mesh.visible = false;
  if (B.depth) { mesh.castShadow = true; mesh.customDepthMaterial = B.depth; }
  scene.add(mesh); B.mesh = mesh; B.cap = cap; B.m = mesh.instanceMatrix.array; B.c = B.color ? mesh.instanceColor.array : null;
}
// Remove a batch for good (its sheet was released): mesh, geometry, materials. sprBatch(rec) makes a new one on reuse.
function ibDrop(B) {
  const i = IB.indexOf(B); if (i >= 0) IB.splice(i, 1);
  if (B.mesh) { scene.remove(B.mesh); B.mesh.dispose(); B.mesh.geometry.dispose(); B.mesh = null; }
  if (B.mat) B.mat.dispose(); if (B.depth) B.depth.dispose(); if (B.rec && B.rec.batches && B.rec.batches[B.pg] === B) B.rec.batches[B.pg] = null;
}
function ibPush(B) { if (B.n >= B.cap) ibAlloc(B, Math.max(16, B.cap * 2)); return B.n++; }
function ibFlag(a, n) { a.updateRange.offset = 0; a.updateRange.count = n * a.itemSize; a.needsUpdate = true; }
function ibReset() { for (let i = 0; i < IB.length; i++) IB[i].n = 0; }
// Back-to-front instance order (B.sort): the same far-to-near order three's transparent sort gave the separate
// meshes, so overlapping coplanar sprites (mobs on the same tile, loot piles) resolve exactly as before.
let _sk = new Float64Array(64), _si = new Int32Array(64), _stmp = new Float32Array(64 * 16);
const _sortCmp = (a, b) => (_sk[b] - _sk[a]) || (a - b);
function ibSort(B) {
  const n = B.n; if (n < 2) return;
  if (_sk.length < n) { _sk = new Float64Array(B.cap); _si = new Int32Array(B.cap); }
  const e = camera.matrixWorld.elements, fx = -e[8], fy = -e[9], fz = -e[10], cx = e[12], cy = e[13], cz = e[14], m = B.m;
  let sorted = true;
  for (let i = 0; i < n; i++) { const o = i * 16; _sk[i] = (m[o + 12] - cx) * fx + (m[o + 13] - cy) * fy + (m[o + 14] - cz) * fz; _si[i] = i; if (i && _sk[i] > _sk[i - 1]) sorted = false; }
  if (sorted) return;
  const idx = _si.subarray(0, n); idx.sort(_sortCmp);
  const perm = (arr, sz) => {
    if (_stmp.length < n * sz) _stmp = new Float32Array(Math.max(n * sz, _stmp.length * 2));
    _stmp.set(arr.subarray(0, n * sz));
    for (let i = 0; i < n; i++) { const src = idx[i] * sz, dst = i * sz; for (let k = 0; k < sz; k++) arr[dst + k] = _stmp[src + k]; }
  };
  perm(m, 16); if (B.c) perm(B.c, 3); for (let k = 0; k < B.keys.length; k++) perm(B.A[B.keys[k]], B.attrs[B.keys[k]]);
}
function ibFlush() {
  camera.updateMatrixWorld();
  for (let b = 0; b < IB.length; b++) {
    const B = IB[b], m = B.mesh; if (!m) continue;
    if (m.parent !== scene) scene.add(m);
    // An empty batch stays visible (count 0: three binds its program but issues no draw) for its first frames, so
    // its shader compiles during boot / map warm-up instead of hitching the frame where the first drop or mob appears.
    m.count = B.n; m.visible = B.n > 0 || B.warm < 3; B.warm++; if (!B.n) continue;
    if (B.sort) ibSort(B);
    ibFlag(m.instanceMatrix, B.n); if (m.instanceColor) ibFlag(m.instanceColor, B.n);
    const at = m.geometry.attributes; for (let k = 0; k < B.keys.length; k++) ibFlag(at[B.keys[k]], B.n);
    if (B.depth) m.castShadow = SPRF.shadows;
    if (B.rec) { const t = sheetPageTex(B.rec, B.pg); sprMapSet(B.mat, t); if (B.depth.map !== t) B.depth.map = t; } else if (B.tex) sprMapSet(B.mat, B.tex);
  }
}
// Instance i's matrix = T(x,y,z) * RotY(c = cos yaw, s = sin yaw) * S(sx,sy,sz), column-major (Object3D.matrix layout).
function ibMat(B, i, x, y, z, c, s, sx, sy, sz) {
  const e = B.m, o = i * 16;
  e[o] = c * sx; e[o + 1] = 0; e[o + 2] = -s * sx; e[o + 3] = 0;
  e[o + 4] = 0; e[o + 5] = sy; e[o + 6] = 0; e[o + 7] = 0;
  e[o + 8] = s * sz; e[o + 9] = 0; e[o + 10] = c * sz; e[o + 11] = 0;
  e[o + 12] = x; e[o + 13] = y; e[o + 14] = z; e[o + 15] = 1;
}
function ibGeo(src) { return () => { const g = new THREE.BufferGeometry(); for (const k of ['position', 'normal', 'uv']) g.setAttribute(k, src.attributes[k].clone()); g.setIndex(src.index.clone()); return g; }; }

// Instanced sprite shader: the SPR_* chunks read per-instance varyings in place of the per-material uniforms.
const SPR_VI = `attribute vec4 iUV; attribute vec4 iCol; attribute vec4 iFlash; attribute vec4 iRim; attribute vec4 iMisc;
varying vec4 vICol; varying vec4 vIFlash; varying vec4 vIRim; varying vec4 vIMisc; varying vec2 vIFrameV;
`;
const SPR_HEAD_I = `
uniform vec2 uTexSize; uniform vec2 uTexOff;
varying vec4 vICol; varying vec4 vIFlash; varying vec4 vIRim; varying vec4 vIMisc; varying vec2 vIFrameV;
#define uFlash vIFlash
#define uRim vIRim.xyz
#define uDissolve vIRim.w
#define uRimDir vIMisc.xy
#define uFade vIMisc.z
#define uFrameV vIFrameV
float sprHash(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
`;
const IUV_VERTEX = 'vUv = ( uvTransform * vec3( mix( iUV.xy, iUV.zw, uv ), 1 ) ).xy;';   // iUV = (u0, v0, u1, v1)
function SPR_OBC_I(sh) {
  Object.assign(sh.uniforms, this.userData.u); palInject(sh, this);
  sh.vertexShader = SPR_VI + sh.vertexShader.replace('#include <uv_vertex>', IUV_VERTEX + ' vICol = iCol; vIFlash = iFlash; vIRim = iRim; vIMisc = iMisc; vIFrameV = iUV.yw;');
  sh.fragmentShader = SPR_HEAD_I + sh.fragmentShader
    .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse, opacity ) * vICol;')
    .replace('#include <map_fragment>', SPR_MAP)
    .replace('#include <alphatest_fragment>', SPR_TEST)
    .replace('gl_FragColor = vec4( outgoingLight, diffuseColor.a );', SPR_OUT);
}
// Sun-shadow caster pass of a sprite batch: same UV rect, but its own transform (faces the sun, unstretched):
// iCast = (x, y, z, mirror sign x size; 0 = no shadow -> degenerate quad). uCastCS = cos/sin of the caster yaw.
const CASTU = { uCastCS: { value: new THREE.Vector2(1, 0) }, uCastH: { value: CAST_H } };
function CAST_OBC_I(sh) {
  Object.assign(sh.uniforms, CASTU); palInject(sh, this, true);
  sh.vertexShader = 'attribute vec4 iUV; attribute vec4 iCast; uniform vec2 uCastCS; uniform float uCastH;\n' + sh.vertexShader
    .replace('#include <uv_vertex>', IUV_VERTEX)
    .replace('#include <project_vertex>', `vec4 mvPosition = vec4( iCast.w * transformed.x * uCastCS.x + transformed.z * uCastCS.y + iCast.x, transformed.y * uCastH * abs(iCast.w) + iCast.y,
      -iCast.w * transformed.x * uCastCS.y + transformed.z * uCastCS.x + iCast.z, 1.0 );
    mvPosition = modelViewMatrix * mvPosition; gl_Position = projectionMatrix * mvPosition;`);
}
const SPRB_ATTR = { iUV: 4, iCol: 4, iFlash: 4, iRim: 4, iMisc: 4, iCast: 4 };
// One batch per sheet page (gfx-sheets.js sheetPages: large indexed sheets are split into bands of block rows;
// every other sheet has a single page, i.e. one batch per sheet as before).
function sprBatch(rec, pg) {
  const bs = rec.batches || (rec.batches = []), b = bs[pg]; if (b) return b;
  const tex = sheetPageTex(rec, pg), p = sheetPages(rec)[pg];
  const mat = spriteMat(null); mat.userData.u = { uTexSize: { value: new THREE.Vector2(64, 64) }, uTexOff: { value: new THREE.Vector2(0, rec.texH - p.y0 - p.h) } };
  mat.onBeforeCompile = SPR_OBC_I; mat.userData.obc = true; sprPalMat(mat, rec); sprMapSet(mat, tex);
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5, side: THREE.DoubleSide }); depth.onBeforeCompile = CAST_OBC_I; depth.userData.obc = true; sprPalMat(depth, rec);
  return (bs[pg] = ibNew({ geo: ibGeo(sheetPlane(rec.json)), mat, depth, attrs: SPRB_ATTR, order: -0.5, rec, pg, sort: true }));
}
// One instance of layer L (see placeSheetVis): same transform, UVs and look as the per-entity mesh path.
function sprInstance(L, x, y, z, sx, st, flip) {
  const B = sprBatch(L.rec, L.pg), i = ibPush(B), o = i * 4, A = B.A, uv = L.uv, ts = B.mat.userData.u.uTexSize.value;
  const k = st.scl;
  ibMat(B, i, x, y, z, SPRF.cy, SPRF.sy, sx * st.sx * k, st.sy * k / COSP, 1);
  let a = A.iUV; a[o] = uv[0]; a[o + 1] = uv[1]; a[o + 2] = uv[2]; a[o + 3] = uv[3];
  a = A.iCol; a[o] = st.col[0]; a[o + 1] = st.col[1]; a[o + 2] = st.col[2]; a[o + 3] = st.a;
  a = A.iFlash; a[o] = st.flash[0]; a[o + 1] = st.flash[1]; a[o + 2] = st.flash[2]; a[o + 3] = st.flash[3];
  a = A.iRim; a[o] = st.rim[0]; a[o + 1] = st.rim[1]; a[o + 2] = st.rim[2]; a[o + 3] = st.dis;
  a = A.iMisc; a[o] = st.rdx * (flip ? -1 : 1) / ts.x; a[o + 1] = st.rdy / ts.y; a[o + 2] = st.fade; a[o + 3] = 0;
  a = A.iCast; if (st.cast && st.a > 0.3) { a[o] = x; a[o + 1] = y; a[o + 2] = z; a[o + 3] = sx * k; } else a[o] = a[o + 1] = a[o + 2] = a[o + 3] = 0;
}
// Contact blob under a sprite (one shared batch): smaller and fainter when real shadows are on.
const BLOBS = ibNew({ geo: () => FLATPLANE.clone(), mat: SHADOWMAT, attrs: {}, order: -1.5, cap: 64 });
function placeBlob(v, x, gh, y, r, z, on) {
  if (!on) return;
  const s = r * (SPRF.shadows ? 0.62 : 0.85) * (1 - Math.min(0.5, z * 0.3));
  ibMat(BLOBS, ibPush(BLOBS), x, gh + 0.03, y, 1, 0, s, s, s);
}
/* ---------- Hero batches (squad mode, cycle 8) ----------
   Allies are drawn with the full player composite (body, hair + ramp tint, shield, weapon, hat on the head anchor with
   the hide-hair clip, mount sheets) but, unlike the controlled hero's per-layer meshes (colour + sun caster + x-ray per
   layer: ~3 draws a layer), every ally layer is one instance of a *hero batch*: one mesh whose shader reads up to
   HB_K sheet textures (texture slots; R8 index textures of the indexed sheets) and a palette atlas (one 256-texel row
   per slot). One batch = 1 colour draw + 1 sun-shadow draw + 1 x-ray draw (the x-ray only while an ally stands behind
   something tall), whatever the number of allies, classes and layers; a second batch is made only when the party's
   distinct layer textures do not fit in HB_K slots. Heroes of the same class share their sheets (one slot).
   Per instance: position + mirror/scale (iPos), the layer's plane as a 2D affine of a unit quad (iAff/iAffT: sheet
   frame + anchor, or the hat on the head anchor with its roll, + squash), frame UVs, the sprFrame look (light tint,
   hurt flash, rim light + direction), the hair swatch (the same ramp as hairRamp, computed in the shader) and the
   hat's hair clip plane; iMisc.w packs the slot (0..15) + 16 hair + 32 x-ray + 64 sun shadow. Slots are sticky (a
   texture keeps its slot while any hero uses it), so the palette atlas is rewritten only when the party's looks change.
   Needs indexed (palette) single-page sheets and WebGL2; otherwise an ally uses the layered meshes like P.
   window.AOM_HERO_BATCH = false forces the layered path (A/B). */
const HB_K = 12, HBS = [], HBQ = [];
let _hbK = new Float64Array(8);
function hbOn() { return sprBatchOn() && (typeof window === 'undefined' || window.AOM_HERO_BATCH !== false) && !!(renderer.capabilities && renderer.capabilities.isWebGL2); }
const HB_VDECL = `attribute vec4 iPos; attribute vec4 iAff; attribute vec4 iAffT; attribute vec4 iUV; attribute vec4 iCol; attribute vec4 iFlash; attribute vec4 iRim; attribute vec4 iMisc; attribute vec4 iHair; attribute vec4 iClip;
uniform vec4 uHBCam; uniform vec2 uCastCS; uniform float uCastH;
varying vec4 vICol; varying vec4 vIFlash; varying vec4 vIRim; varying vec4 vIMisc; varying vec4 vIHair; varying vec4 vIClip;
`;
const HB_UV = 'vUv = mix(iUV.xy, iUV.zw, uv); vICol = iCol; vIFlash = iFlash; vIRim = iRim; vIMisc = iMisc; vIHair = iHair; vIClip = iClip;';
// colour / x-ray: T(x, y, z) * RotY(camera yaw) * S(mirror k sqx, k sqy / COSP) * affine(unit quad)   (= sprInstance's matrix)
const HB_BEGIN = `vec2 hbL = vec2(dot(iAff.xy, position.xy), dot(iAff.zw, position.xy)) + iAffT.xy;
float hbX = iPos.w * iAffT.z * hbL.x, hbY = abs(iPos.w) * iAffT.w * hbL.y * uHBCam.z;
vec3 transformed = vec3(iPos.x + uHBCam.x * hbX, iPos.y + hbY, iPos.z - uHBCam.y * hbX);`;
// sun caster: faces the sun, unstretched (= CAST_OBC_I); no shadow -> degenerate quad
const HB_BEGIN_CAST = `vec2 hbL = vec2(dot(iAff.xy, position.xy), dot(iAff.zw, position.xy)) + iAffT.xy;
float hbX = iPos.w * hbL.x, hbY = hbL.y * uCastH * abs(iPos.w);
vec3 transformed = (int(iMisc.w + 0.5) & 64) != 0 ? vec3(hbX * uCastCS.x + iPos.x, hbY + iPos.y, -hbX * uCastCS.y + iPos.z) : vec3(0.0);`;
const HB_FHEAD = (() => {
  let d = '', sz = '', fe = '';
  for (let i = 0; i < HB_K; i++) { d += `uniform sampler2D uS${i}; `; sz += `  if (s == ${i}) return textureSize(uS${i}, 0);\n`; fe += `  if (hbS == ${i}) return texelFetch(uS${i}, t, 0).r;\n`; }
  return `${d}uniform sampler2D uPalA; uniform vec4 uHK; uniform float uHLin;
varying vec4 vICol; varying vec4 vIFlash; varying vec4 vIRim; varying vec4 vIMisc; varying vec4 vIHair; varying vec4 vIClip;
int hbS; int hbC; ivec2 hbMx; bool hbMin;
ivec2 hbSz(int s) {
${sz}  return ivec2(1);
}
float hbI(ivec2 t) {
  t = clamp(t, ivec2(0), hbMx);
${fe}  return 0.0;
}
vec4 hbPal(ivec2 t) { return texelFetch(uPalA, ivec2(int(hbI(t) * 255.0 + 0.5), hbS), 0); }
vec4 hbTex(vec2 uv) {   // = sprTex: NEAREST when magnified, 4-tap LINEAR emulation when minified
  vec2 p = uv * vec2(hbMx + 1);
  if (!hbMin) return hbPal(ivec2(floor(p)));
  p -= 0.5; vec2 f = fract(p); ivec2 i = ivec2(floor(p));
  return mix(mix(hbPal(i), hbPal(i + ivec2(1, 0)), f.x), mix(hbPal(i + ivec2(0, 1)), hbPal(i + ivec2(1, 1)), f.x), f.y);
}
void hbSetup(vec2 uv) {
  hbC = int(vIMisc.w + 0.5); hbS = hbC & 15;
  ivec2 ts = hbSz(hbS); hbMx = ts - 1; vec2 p = uv * vec2(ts), dx = dFdx(p), dy = dFdy(p);
  hbMin = max(dot(dx, dx), dot(dy, dy)) > 1.0;
}
vec3 hbLin(vec3 c) { return uHLin > 0.5 ? mix(c * 0.0773993808, pow(c * 0.9478672986 + 0.0521327014, vec3(2.4)), step(vec3(0.04045), c)) : c; }
`;
})();
const HB_MAP = `hbSetup(vUv);
vec4 texelColor = hbTex(vUv);
float sprA = texelColor.a;
texelColor = mapTexelToLinear(texelColor);
if ((hbC & 16) != 0) {   // hair: the hairRamp() palette ramp from the hero's swatch
  vec3 c = vIHair.rgb, h0 = hbLin(c * 0.3 + (vec3(0.1, 0.08, 0.17) - c * 0.3) * 0.45), h1 = hbLin(c * 0.66 + (vec3(0.28, 0.28, 0.46) - c * 0.66) * 0.28), h2 = hbLin(c), h3 = hbLin(c + (vec3(1.0, 0.97, 0.88) - c) * 0.45);
  float k = texelColor.g;
  texelColor.rgb = k < uHK.y ? mix(h0, h1, clamp((k - uHK.x) / (uHK.y - uHK.x), 0.0, 1.0)) : k < uHK.z ? mix(h1, h2, (k - uHK.y) / (uHK.z - uHK.y)) : mix(h2, h3, clamp((k - uHK.z) / (uHK.w - uHK.z), 0.0, 1.0));
}
diffuseColor *= texelColor;`;
const HB_CLIP = 'if ((hbC & 16) != 0 && dot(vec3(vUv, 1.0), vIClip.xyz) < 0.0) discard;';
const HB_OUT = `{
  float sprMx = max(max(outgoingLight.r, outgoingLight.g), outgoingLight.b);
  if ( sprMx > 0.82 ) outgoingLight *= (0.82 + 0.2 * (1.0 - exp(-(sprMx - 0.82) * 4.0))) / sprMx;
  float a1 = hbTex( vUv + vIMisc.xy ).a, a3 = hbTex( vUv + 3.0 * vIMisc.xy ).a;
  outgoingLight += vIRim.rgb * (step(0.5, a1) * (1.0 - step(0.5, a3)));
  outgoingLight = mix(outgoingLight, vIFlash.rgb, vIFlash.a);
  gl_FragColor = vec4( outgoingLight, diffuseColor.a );
}`;
function hbVert(sh, cast) {
  sh.vertexShader = HB_VDECL + sh.vertexShader.replace('#include <uv_vertex>', HB_UV).replace('#include <begin_vertex>', cast ? HB_BEGIN_CAST : HB_BEGIN);
}
function hbFrag(sh, body) { sh.fragmentShader = sh.fragmentShader.replace('#include <map_pars_fragment>', '#include <map_pars_fragment>\n' + HB_FHEAD) .replace('#include <map_fragment>', body); }
function HB_OBC_C(sh) {   // colour
  Object.assign(sh.uniforms, this.userData.U); hbVert(sh, false); hbFrag(sh, HB_MAP);
  sh.fragmentShader = sh.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse, opacity ) * vICol;')
    .replace('#include <alphatest_fragment>', 'if ( sprA < 0.5 ) discard;\n' + HB_CLIP)
    .replace('gl_FragColor = vec4( outgoingLight, diffuseColor.a );', HB_OUT);
}
function HB_OBC_X(sh) {   // x-ray silhouette (flag 32)
  Object.assign(sh.uniforms, this.userData.U); hbVert(sh, false);
  hbFrag(sh, 'hbSetup(vUv); vec4 texelColor = hbTex(vUv); float sprA = texelColor.a; texelColor = mapTexelToLinear(texelColor); diffuseColor *= texelColor;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <alphatest_fragment>', 'if ( sprA < 0.5 || (hbC & 32) == 0 ) discard;\n' + HB_CLIP);
}
function HB_OBC_D(sh) {   // sun-shadow depth (flag 64 in the vertex shader)
  Object.assign(sh.uniforms, this.userData.U); hbVert(sh, true);
  hbFrag(sh, 'hbSetup(vUv); vec4 texelColor = hbTex(vUv); diffuseColor *= mapTexelToLinear(texelColor);');
  sh.fragmentShader = sh.fragmentShader.replace('#include <alphatest_fragment>', '#include <alphatest_fragment>\n' + HB_CLIP);
}
const HB_ATTR = ['iPos', 'iAff', 'iAffT', 'iUV', 'iCol', 'iFlash', 'iRim', 'iMisc', 'iHair', 'iClip'];
function hbGeo(B, cap) {
  const src = UNITPLANE0, g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', src.attributes.position); g.setAttribute('uv', src.attributes.uv); g.setIndex(src.index);
  for (const k of HB_ATTR) { const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage); g.setAttribute(k, a); B.A[k] = a.array; }
  g.instanceCount = 0;
  if (B.geo) B.geo.dispose();
  B.geo = g; B.cap = cap; if (B.mesh) { B.mesh.geometry = g; B.xmesh.geometry = g; }
}
const UNITPLANE0 = new THREE.PlaneGeometry(1, 1);   // centred unit quad (u, v in -0.5..0.5): the hero batch's instances
function hbNew(tex) {
  const U = { uPalA: { value: null }, uHK: { value: new THREE.Vector4() }, uHLin: { value: 0 }, uHBCam: { value: new THREE.Vector4(1, 0, 1, 0) }, uCastCS: CASTU.uCastCS, uCastH: CASTU.uCastH };
  for (let i = 0; i < HB_K; i++) U['uS' + i] = { value: null };
  const palD = new Uint8Array(256 * 4 * HB_K), pal = new THREE.DataTexture(palD, 256, HB_K, THREE.RGBAFormat, THREE.UnsignedByteType);
  pal.magFilter = pal.minFilter = THREE.NearestFilter; pal.generateMipmaps = false; pal.needsUpdate = true; U.uPalA.value = pal;
  const B = { n: 0, cap: 0, geo: null, mesh: null, xmesh: null, A: {}, U, pal, palD, tex: new Array(HB_K).fill(null), seen: new Int32Array(HB_K).fill(-1), warm: 0, xr: false };
  hbGeo(B, 16);
  const mat = spriteMat(null); mat.userData.U = U; mat.onBeforeCompile = HB_OBC_C; sprMapSet(mat, tex);
  const xm = spriteMat(null, { color: 0x4a70d0, opacity: 0.5, depthWrite: false, depthFunc: THREE.GreaterDepth, stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc, stencilZPass: THREE.ReplaceStencilOp });
  xm.userData.U = U; xm.onBeforeCompile = HB_OBC_X; sprMapSet(xm, tex);
  const dm = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaTest: 0.5, side: THREE.DoubleSide }); dm.userData.U = U; dm.onBeforeCompile = HB_OBC_D; sprMapSet(dm, tex);
  B.mat = mat; B.xmat = xm; B.depth = dm;
  const m = new THREE.Mesh(B.geo, mat); m.frustumCulled = false; m.renderOrder = -0.45; m.customDepthMaterial = dm; m.visible = false; scene.add(m); B.mesh = m;
  const x = new THREE.Mesh(B.geo, xm); x.frustumCulled = false; x.renderOrder = 5; x.visible = false; scene.add(x); B.xmesh = x;
  HBS.push(B); return B;
}
// Frame start (syncEntities): no hero queued, every slot unclaimed.
function hbBegin() { HBQ.length = 0; }
function hbQueue(v) { HBQ.push(v); }
// Slot of texture t in batch B (-1 when absent).
function hbSlotOf(B, t) { const T = B.tex; for (let s = 0; s < HB_K; s++) if (T[s] === t) return s; return -1; }
// Put a layer's texture in batch B: its slot if resident (claimed for this frame), else a slot no hero claimed this
// frame (its palette row rewritten). Returns the slot or -1 (batch full).
function hbClaim(B, L, fr) {
  const t = sheetPageTex(L.rec, L.pg); let s = hbSlotOf(B, t);
  if (s < 0) {
    for (let i = 0; i < HB_K; i++) if (B.seen[i] !== fr && !B.tex[i]) { s = i; break; }
    if (s < 0) for (let i = 0; i < HB_K; i++) if (B.seen[i] !== fr) { s = i; break; }
    if (s < 0) return -1;
    B.tex[s] = t; B.U['uS' + s].value = t;
    const pb = L.rec.pal.tex.image.data; B.palD.set(pb.length >= 1024 ? pb.subarray(0, 1024) : pb, s * 1024); B.pal.needsUpdate = true;
  }
  B.seen[s] = fr; L.hbS = s; return s;
}
// Textures of vis v missing from batch B (not resident), and B's free slots this frame.
function hbMissing(B, v) { let n = 0; for (let i = 0; i < v.layers.length; i++) { const L = v.layers[i]; if (L.on && hbSlotOf(B, sheetPageTex(L.rec, L.pg)) < 0) n++; } return n; }
function hbFree(B, fr) { let n = 0; for (let i = 0; i < HB_K; i++) if (B.seen[i] !== fr) n++; return n; }
function hbFits(B, v, fr) {
  let miss = 0, free = hbFree(B, fr);
  for (let i = 0; i < v.layers.length; i++) { const L = v.layers[i]; if (!L.on) continue; const s = hbSlotOf(B, sheetPageTex(L.rec, L.pg)); if (s < 0) miss++; }
  return miss <= free;
}
function hbAssign(B, v, fr) { for (let i = 0; i < v.layers.length; i++) { const L = v.layers[i]; if (L.on) hbClaim(B, L, fr); } v.hbB = B; }
const _hbRGB = new Map();
function hbHairRGB(hex) { hex = hex || '#b9b3a8'; let c = _hbRGB.get(hex); if (!c) { const t = new THREE.Color(hex); c = [t.r, t.g, t.b]; _hbRGB.set(hex, c); } return c; }
// One layer instance (see the header).
function hbInst(B, v, L, st) {
  if (B.n >= B.cap) hbGeo(B, B.cap * 2);
  const i = B.n++, o = i * 4, A = B.A, rec = L.rec, j = rec.json, flip = v.hbFlip, k = st.scl || 1, sgn = flip ? -1 : 1;
  let a = A.iPos; a[o] = v.hbX; a[o + 1] = v.hbY; a[o + 2] = v.hbZ; a[o + 3] = sgn * k;
  a = A.iAff; const a2 = A.iAffT;
  if (L.layer === 'headgear' && L.aff) { const F = L.aff; a[o] = F[0]; a[o + 1] = F[1]; a[o + 2] = F[2]; a[o + 3] = F[3]; a2[o] = F[4]; a2[o + 1] = F[5]; }
  else { const fw = j.frameW / PXU, fh = j.frameH / PXU; a[o] = fw; a[o + 1] = 0; a[o + 2] = 0; a[o + 3] = fh; a2[o] = fw / 2 - j.anchor[0] / PXU; a2[o + 1] = j.anchor[1] / PXU - fh / 2; }
  a2[o + 2] = st.sx; a2[o + 3] = st.sy;
  const uv = L.uv; a = A.iUV; a[o] = uv[0]; a[o + 1] = uv[1]; a[o + 2] = uv[2]; a[o + 3] = uv[3];
  a = A.iCol; a[o] = st.col[0]; a[o + 1] = st.col[1]; a[o + 2] = st.col[2]; a[o + 3] = st.a;
  a = A.iFlash; a[o] = st.flash[0]; a[o + 1] = st.flash[1]; a[o + 2] = st.flash[2]; a[o + 3] = st.flash[3];
  a = A.iRim; a[o] = st.rim[0]; a[o + 1] = st.rim[1]; a[o + 2] = st.rim[2]; a[o + 3] = 0;
  const hair = L.layer === 'hair', xr = v.xrayOn && !v.hbDead, cast = st.cast && st.a > 0.3;
  const pg = sheetPages(rec)[L.pg];
  a = A.iMisc; a[o] = st.rdx * sgn / rec.texW; a[o + 1] = st.rdy / pg.h; a[o + 2] = 0; a[o + 3] = L.hbS + (hair ? 16 : 0) + (xr ? 32 : 0) + (cast ? 64 : 0);
  if (hair) {
    const c = hbHairRGB(v.hbHair); a = A.iHair; a[o] = c[0]; a[o + 1] = c[1]; a[o + 2] = c[2]; a[o + 3] = 0;
    a = A.iClip; if (v.clipM === 1) { a[o] = v.clip[0]; a[o + 1] = v.clip[1]; a[o + 2] = v.clip[2]; } else { a[o] = 0; a[o + 1] = 0; a[o + 2] = 1; } a[o + 3] = 0;
  }
  if (xr) B.xr = true;
}
// After every hero of the frame was queued (heroHBFrame): back-to-front order, slots (sticky per batch: a hero keeps
// its batch while its textures fit), instances, uploads.
function hbFlushHeroes() {
  const Q = HBQ, n = Q.length, fr = frameNo;
  if (n) {
    // far -> near along the view direction (<= a handful of heroes: insertion sort, no allocation)
    if (_hbK.length < n) _hbK = new Float64Array(n * 2);
    const e = camera.matrixWorld.elements, fx = -e[8], fy = -e[9], fz = -e[10], cx = e[12], cy = e[13], cz = e[14];
    for (let i = 0; i < n; i++) { const v = Q[i]; _hbK[i] = (v.hbX - cx) * fx + (v.hbY - cy) * fy + (v.hbZ - cz) * fz; }
    for (let i = 1; i < n; i++) { const v = Q[i], kk = _hbK[i]; let j = i - 1; while (j >= 0 && _hbK[j] < kk) { Q[j + 1] = Q[j]; _hbK[j + 1] = _hbK[j]; j--; } Q[j + 1] = v; _hbK[j + 1] = kk; }
    // claim what is already resident in each hero's last batch, then place the others
    for (let i = 0; i < n; i++) { const v = Q[i], B = v.hbB; v.hbOK = false; if (!B || HBS.indexOf(B) < 0) { v.hbB = null; continue; }
      let all = true; for (let l = 0; l < v.layers.length; l++) { const L = v.layers[l]; if (!L.on) continue; const s = hbSlotOf(B, sheetPageTex(L.rec, L.pg)); if (s < 0) all = false; else { B.seen[s] = fr; L.hbS = s; } }
      v.hbOK = all; }
    for (let i = 0; i < n; i++) {
      const v = Q[i]; if (v.hbOK) continue;
      let B = v.hbB && hbFits(v.hbB, v, fr) ? v.hbB : null;
      if (!B) { let best = -1; for (let b = 0; b < HBS.length; b++) { const C = HBS[b]; if (!hbFits(C, v, fr)) continue; const m = hbMissing(C, v); if (best < 0 || m < best) { best = m; B = C; } } }
      if (!B) { let t0 = null; for (let l = 0; l < v.layers.length && !t0; l++) if (v.layers[l].on) t0 = sheetPageTex(v.layers[l].rec, v.layers[l].pg); B = hbNew(t0); }
      hbAssign(B, v, fr);
    }
    for (let i = 0; i < n; i++) { const v = Q[i], B = v.hbB, st = v.st; for (let l = 0; l < v.layers.length; l++) { const L = v.layers[l]; if (L.on) hbInst(B, v, L, st); } }
  }
  if (!HBS.length) return;
  const hr = hairRamp('#b9b3a8').keys, lin = sprLinear() ? 1 : 0, ic = 1 / COSP;
  for (let b = 0; b < HBS.length; b++) {
    const B = HBS[b], U = B.U, m = B.mesh;
    m.visible = B.n > 0 || B.warm < 3; B.warm++;
    B.geo.instanceCount = B.n; m.castShadow = SPRF.shadows && B.n > 0; B.xmesh.visible = (B.xr && B.n > 0) || B.warm < 4; B.xr = false;
    if (!B.n) continue;
    for (const k of HB_ATTR) { const a = B.geo.attributes[k]; a.updateRange.offset = 0; a.updateRange.count = B.n * 4; a.needsUpdate = true; }
    U.uHBCam.value.set(SPRF.cy, SPRF.sy, ic, 0); U.uHK.value.set(hr[0], hr[1], hr[2], hr[3]); U.uHLin.value = lin;
    let t0 = null; for (let s = 0; s < HB_K && !t0; s++) if (B.seen[s] === frameNo) t0 = B.tex[s];
    if (t0) { sprMapSet(B.mat, t0); sprMapSet(B.xmat, t0); sprMapSet(B.depth, t0); }
    B.n = 0;
  }
}
function hbStats() { let slots = 0; for (const B of HBS) for (let s = 0; s < HB_K; s++) if (B.seen[s] === frameNo) slots++; return { batches: HBS.length, queued: HBQ.length, slots, draws: HBS.filter(B => B.geo.instanceCount > 0).length }; }

// Per-entity motion FX: footstep dust, death embers, ghost wisps.
// gh: ground height at the entity when the caller already has it (placeSheetVis), else sampled here.
function sprMotion(v, e, st, hu, gh) {
  if (typeof PFX === 'undefined') return;
  if (gh === undefined) gh = groundH(e.x, e.y);
  if (e.moving && !st.ghost && !(e.z > 0)) {
    const step = Math.floor((e.walk || 0) / 2.3);
    const hero = isHeroE(e);
    if (v.step !== undefined && step !== v.step) { PFX.dust(e.x, gh, e.y, hero ? (v.mounted ? 5 : 3) : 2, v.mounted ? 1.6 : (e.d && e.d.size) || 1); if (hero && VFX.step) VFX.step(e, gh, !!v.mounted); }   // mounted: the warg's gallop kicks up more; powder on snow (VFX)
    v.step = step;
  }
  if (isHeroE(e)) {
    if (e.dodgeT > 0 && !(v.dodging)) PFX.dust(e.x, gh, e.y, v.mounted ? 12 : 7, v.mounted ? 1.8 : 1.3);
    if (e.dodgeT > 0 && Math.random() < 0.6) PFX.dust(e.x, gh, e.y, 1, 0.8);
    v.dodging = e.dodgeT > 0;
  }
  if (st.dis > 0 && st.dis < 1) {
    const n = Math.min(12, Math.round(SPRF.dt * 170 * Math.max(0.6, hu * 0.7)) + (Math.random() < 0.5 ? 1 : 0));
    for (let i = 0; i < n; i++) PFX.ember(e.x + rand(-0.3, 0.3) * Math.max(0.6, hu * 0.4), gh + rand(0.1, 1) * hu * (1 - st.dis * 0.5), e.y + rand(-0.15, 0.15), st.ghost);
  }
  if (st.ghost && !e.dead && Math.random() < SPRF.dt * 5) PFX.wisp(e.x + rand(-0.35, 0.35), gh + rand(0.3, 1.1) * hu, e.y);
}

/* ---------- Procedural (fallback) sprites ---------- */
function makeSpriteVis(e, F) {
  const tex = F.idle[0].f, mat = fxSpriteMat(tex); const mesh = new THREE.Mesh(UNITPLANE, mat); scene.add(mesh);
  const caster = makeCaster(UNITPLANE, tex);
  const v = { F, mat, mesh, caster, meshes: [mesh, caster], flip: e.fx < 0 ? -1 : 1 };
  if (e === P) { const xm = spriteMat(tex, { color: 0x4a70d0, opacity: 0.5, depthWrite: false, depthFunc: THREE.GreaterDepth }); v.xray = new THREE.Mesh(UNITPLANE, xm); v.xray.renderOrder = 5; scene.add(v.xray); v.meshes.push(v.xray); }
  const glow = e.d && e.d.glow; if (glow) { v.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, color: new THREE.Color(glow), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 })); scene.add(v.glow); v.meshes.push(v.glow); }
  return v;
}
function isGhost(e) { return !!(e && e.d && (e.d.spr === 'ghost')); }
function syncSprite(e, F, pose) {
  let v = VIS.get(e); if (!v || v.F !== F) { if (v) disposeVis(v); v = makeSpriteVis(e, F); VIS.set(e, v); }
  v.seen = frameNo;
  const rx = Math.cos(cam.yaw), ry = -Math.sin(cam.yaw), fwx = -Math.sin(cam.yaw), fwy = -Math.cos(cam.yaw);
  const fx = e.fx === undefined ? (e.dir || 1) : e.fx, fy = e.fy || 0;
  const dr = fx * rx + fy * ry; if (Math.abs(dr) > 0.15) v.flip = dr < 0 ? -1 : 1;
  const set = F[pose.anim] || F.idle, fr = set[Math.min(set.length - 1, pose.i | 0)];
  const back = fr.b && (fx * fwx + fy * fwy) > 0.4, tex = back ? fr.b : fr.f;
  sprMapSet(v.mat, tex); if (v.caster.customDepthMaterial.map !== tex) v.caster.customDepthMaterial.map = tex;
  const ghost = isGhost(e), st = sprFrame(v, e, { tint: pose.tint, opacity: pose.opacity, ghost });
  const gh = groundH(e.x, e.y), z = (e.z || 0) / PXU + st.zoff;
  v.mesh.scale.set(F.wu * v.flip * st.sx, F.hu / COSP * st.sy, 1); v.mesh.position.set(e.x, gh + z - F.feetU / COSP, e.y); v.mesh.rotation.y = cam.yaw;
  sprApply(v.mat, st, v.flip < 0);
  v.caster.visible = st.cast && st.a > 0.3; if (v.caster.visible) { v.caster.scale.set(F.wu * v.flip, F.hu * CAST_H, 1); v.caster.position.set(e.x, gh + z - F.feetU, e.y); v.caster.rotation.y = SPRF.cyaw; }
  placeBlob(v, e.x, gh, e.y, F.shadowR * (ghost ? 0.8 : 1), z, st.a > 0.3 && st.dis < 0.6);
  if (v.xray) { v.xray.material.map = tex; v.xray.scale.copy(v.mesh.scale); v.xray.position.copy(v.mesh.position); v.xray.rotation.y = cam.yaw; v.xray.visible = !e.dead; }
  if (v.glow) { v.glow.position.set(e.x, gh + z + F.headU / COSP * 0.5, e.y); const s = F.headU * (ghost ? 1.7 : 2.2); v.glow.scale.set(s, s, 1); v.glow.material.opacity = ghost ? 0.16 : 0.55; v.glow.visible = !e.dead; }
  sprMotion(v, e, st, F.headU);
}
function mobPose(m) {
  if (m.dead) return { anim: 'dead', i: 0 };
  if (m.frozen > 0) return { anim: 'hurt', i: 0, tint: [0.55, 0.8, 1] };
  if (m.hitFlash > 0) return { anim: 'hurt', i: 0 };
  if (m.atkAnim >= 0) return { anim: 'attack', i: Math.min(3, Math.floor(m.atkAnim * 4)) };
  if (m.moving || m.leap) return { anim: 'walk', i: Math.floor(m.walk * 1.26) % 6 };
  return { anim: 'idle', i: Math.floor(time * 3 + (m.id % 7)) % 4 };
}
function heroPose(h) {
  if (h.dead) return { anim: 'dead', i: 0 };
  if (h.dodgeT > 0) return { anim: 'dodge', i: Math.min(3, Math.floor((1 - h.dodgeT / 0.34) * 4)), tint: [0.85, 0.9, 1] };
  if (h.charge >= 0) { const full = h.charge >= 0.8 && Math.floor(time * 12) % 2; return { anim: 'attack', i: 0, tint: full ? [1.0, 0.85, 0.5] : undefined }; }
  if (h.blocking) return { anim: 'block', i: 0 };
  if (h.sitting) return { anim: 'sit', i: 0 };
  if (h.casting) return { anim: 'cast', i: Math.floor(time * 4) % 2 };
  if (h.atkAnim >= 0) return { anim: 'attack', i: Math.min(3, Math.floor(h.atkAnim * 4)) };
  if (h.hurtT > 0.12) return { anim: 'hurt', i: 0 };
  if (h.moving) return { anim: 'walk', i: Math.floor(h.walk * 1.26) % 6 };
  return { anim: 'idle', i: Math.floor(time * 2.5) % 4 };
}
function playerPose() { return heroPose(P); }
// Drop icons are painted on CPU-backed canvases (willReadFrequently): pixelize() reads them back and the atlas copy /
// texture upload read them again; with GPU canvases the first drop of a new icon cost 280-420 ms on SwiftShader.
const DROPCV = {}, DROPTEX = {}, cpuCtx = c => c.getContext('2d', { willReadFrequently: true });
function dropTex(d) { const k = dropKey(d); return DROPTEX[k] || (DROPTEX[k] = canvasTex(dropCanvas(d), { pixel: true })); }
function dropCanvas(d) {
  if (d.zeny) { const k = d.lost ? 'lost' : 'zeny'; if (DROPCV[k]) return DROPCV[k]; const c = mkCanvas(32, 32), g = cpuCtx(c); if (d.lost) { g.fillStyle = '#8a1018'; g.beginPath(); g.ellipse(16, 24, 13, 6, 0, 0, 7); g.fill(); g.fillStyle = '#e8c050'; g.beginPath(); g.ellipse(16, 20, 5, 3, 0, 0, 7); g.fill(); } else { for (let i = 0; i < 4; i++) { g.fillStyle = '#b08420'; g.beginPath(); g.ellipse(9 + i * 5, 25 - i * 3, 6, 3.5, 0, 0, 7); g.fill(); g.fillStyle = '#f4d060'; g.beginPath(); g.ellipse(9 + i * 5, 24 - i * 3, 6, 3.2, 0, 0, 7); g.fill(); } } pixelize(c, [40, 26, 10]); return (DROPCV[k] = c); }
  const t = ITEMS[d.item.id], k = t.icon + '|' + (t.color || ''); if (DROPCV[k]) return DROPCV[k];
  const src = iconCanvas(t), c = mkCanvas(32, 32), g = cpuCtx(c); g.drawImage(src, 2, 2, 28, 28); pixelize(c, [30, 20, 16]);
  return (DROPCV[k] = c);
}
const RCOL = { common: 0xffffff, magic: 0x7fa0ff, rare: 0xffd84a, unique: 0xff9a30, card: 0xd0a8ff, key: 0xffa870 };
/* Ground drops: one instanced icon mesh (the 32x32 icons packed into a 512x512 atlas, 34-px slots with a 1-px
   edge copy so bilinear minification samples exactly what the single-texture clamp-to-edge version sampled) and one
   instanced rarity-glow mesh. If the atlas fills up, further icons fall back to one mesh per drop. */
const DROPAT = (() => {
  const S = 34, N = 15, c = mkCanvas(512, 512), g = cpuCtx(c); g.imageSmoothingEnabled = false;
  return { S, N, c, g, tex: canvasTex(c, { pixel: true }), slot: {}, n: 0 };
})();
function dropKey(d) { if (d.zeny) return d.lost ? 'lost' : 'zeny'; const t = ITEMS[d.item.id]; return t.icon + '|' + (t.color || ''); }
/* Painted item icons (vfx round 7; ui.js itemIconURL(id): assets/ui/icons/<id>.png, 64x64): loaded lazily once per item id,
   downscaled to a 32x32 CPU canvas and packed into the same drop atlas (key 'p|<id>'), so drops stay one instanced
   draw. Until the file has loaded, when it fails, when the atlas would run short (the last DROP_KEEP slots stay for
   canvas icons) or when the image would taint the canvas (file:// without file access), the canvas icon is used. */
const DROPPAINT = new Map(), DROP_KEEP = 24;
function dropPaint(id) {
  let e = DROPPAINT.get(id); if (e) return e;
  e = { img: null, cv: null, bad: false }; DROPPAINT.set(id, e);
  let url = ''; try { url = typeof itemIconURL === 'function' ? itemIconURL(id) : ''; } catch (err) { url = ''; }
  if (!url || /^data:/.test(url)) { e.bad = true; return e; }   // no painted file: itemIconURL fell back to the canvas icon
  const im = new Image(); im.decoding = 'async'; e.img = im;
  im.onload = () => {
    try { const c = mkCanvas(32, 32), g = cpuCtx(c); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, 0, 32, 32); g.getImageData(0, 0, 1, 1); e.cv = c; }   // getImageData throws on a tainted canvas
    catch (err) { e.bad = true; }
  };
  im.onerror = () => { e.bad = true; };
  im.src = url; return e;
}
// Painted icon slot of an item drop: uv, null (never: use the canvas icon), or undefined (still loading).
function dropPaintSlot(d) {
  if (d.zeny || !d.item || typeof itemIconURL !== 'function') return null;
  const A = DROPAT, k = 'p|' + d.item.id; let uv = A.slot[k]; if (uv !== undefined) return uv;
  const e = dropPaint(d.item.id); if (e.bad) return (A.slot[k] = null); if (!e.cv) return undefined;
  if (A.n >= A.N * A.N - DROP_KEEP) return (A.slot[k] = null);
  return (A.slot[k] = dropAtlasPut(e.cv));
}
// UV rect (u0, v0, u1, v1) of the drop's icon in the atlas, or null when the atlas is full.
function dropSlot(d) {
  const P0 = dropPaintSlot(d); if (P0) return P0;
  const A = DROPAT, k = dropKey(d); let uv = A.slot[k]; if (uv !== undefined) return uv;
  if (A.n >= A.N * A.N) return (A.slot[k] = null);
  return (A.slot[k] = dropAtlasPut(dropCanvas(d)));
}
function dropAtlasPut(src) {
  const A = DROPAT, i = A.n++, px = (i % A.N) * A.S + 1, py = Math.floor(i / A.N) * A.S + 1, g = A.g; let uv;
  g.drawImage(src, px, py);
  g.drawImage(src, 0, 0, 32, 1, px, py - 1, 32, 1); g.drawImage(src, 0, 31, 32, 1, px, py + 32, 32, 1);     // edge copies (= clamp)
  g.drawImage(src, 0, 0, 1, 32, px - 1, py, 1, 32); g.drawImage(src, 31, 0, 1, 32, px + 32, py, 1, 32);
  g.drawImage(src, 0, 0, 1, 1, px - 1, py - 1, 1, 1); g.drawImage(src, 31, 0, 1, 1, px + 32, py - 1, 1, 1);
  g.drawImage(src, 0, 31, 1, 1, px - 1, py + 32, 1, 1); g.drawImage(src, 31, 31, 1, 1, px + 32, py + 32, 1, 1);
  A.tex.needsUpdate = true;
  uv = [px / 512, 1 - (py + 32) / 512, (px + 32) / 512, 1 - py / 512];
  return uv;
}
function DROP_OBC(sh) { sh.vertexShader = 'attribute vec4 iUV;\n' + sh.vertexShader.replace('#include <uv_vertex>', IUV_VERTEX); }
let DROPB = null, DROPG = null;
function dropBatches() {   // created at load (see below), so their shaders compile with the first frames
  if (DROPB) return;
  const mat = spriteMat(sprTexEnc(DROPAT.tex)); mat.onBeforeCompile = DROP_OBC;
  DROPB = ibNew({ geo: ibGeo(UNITPLANE), mat, attrs: { iUV: 4 }, order: -0.5, sort: true, tex: DROPAT.tex });
  const gm = new THREE.MeshBasicMaterial({ map: TEX.soft, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
  DROPG = ibNew({ geo: () => FLATPLANE.clone(), mat: gm, attrs: {}, color: true, order: -1 });
}
dropBatches();
function makeDropVis(d) {
  const v = { meshes: [], F: null, uv: sprBatchOn() ? dropSlot(d) : null, glowC: null, gm: null, gx: NaN, gy: NaN, gh: 0, paint: false };
  if (v.uv && !d.zeny && d.item && typeof itemIconURL === 'function' && DROPAT.slot['p|' + d.item.id] === undefined) v.paint = true;   // painted icon still loading: swap it in later (syncDrop)
  const r = d.lost ? 'lostz' : d.zeny ? null : rarityOf(d.item);
  if (v.uv) {
    dropBatches(); if (r && r !== 'common') v.glowC = new THREE.Color(r === 'lostz' ? 0xff2020 : RCOL[r]);
    return v;
  }
  const mat = spriteMat(sprTexEnc(dropTex(d))); const mesh = new THREE.Mesh(UNITPLANE, mat); scene.add(mesh); v.mat = mat; v.mesh = mesh; v.meshes.push(mesh);
  if (r && r !== 'common') { const gm = new THREE.MeshBasicMaterial({ map: TEX.soft, color: r === 'lostz' ? 0xff2020 : RCOL[r], transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }); const gl = new THREE.Mesh(FLATPLANE, gm); gl.renderOrder = -1; scene.add(gl); v.glowM = gl; v.meshes.push(gl); }
  return v;
}
function syncDrop(d) {
  let v = VIS.get(d);
  if (!v) { v = makeDropVis(d); VIS.set(d, v); }
  v.seen = frameNo;
  if (v.gx !== d.x || v.gy !== d.y || v.gm !== map) { v.gx = d.x; v.gy = d.y; v.gm = map; v.gh = groundH(d.x, d.y); }   // drops do not move: ground height once
  const gh = v.gh, bounce = Math.max(0, 1 - d.t * 2.5) * Math.abs(Math.sin(d.t * 9)) * 0.6, s = d.lost ? 0.9 : 0.62;
  if (v.paint && (frameNo & 7) === 0) { const pu = dropPaintSlot(d); if (pu !== undefined) { v.paint = false; if (pu) v.uv = pu; } }
  if (v.uv) {
    const B = DROPB, i = ibPush(B), a = B.A.iUV, o = i * 4, uv = v.uv;
    ibMat(B, i, d.x, gh + bounce, d.y, SPRF.cy, SPRF.sy, s, s / COSP, 1);
    a[o] = uv[0]; a[o + 1] = uv[1]; a[o + 2] = uv[2]; a[o + 3] = uv[3];
    if (v.glowC) { const G = DROPG, j = ibPush(G), gs = 0.6 + Math.sin(time * 4) * 0.08, c = G.c, q = j * 3; ibMat(G, j, d.x, gh + 0.04, d.y, 1, 0, gs, gs, gs); c[q] = v.glowC.r; c[q + 1] = v.glowC.g; c[q + 2] = v.glowC.b; }
    return;
  }
  v.mesh.scale.set(s, s / COSP, 1); v.mesh.position.set(d.x, gh + bounce, d.y); v.mesh.rotation.y = cam.yaw;
  if (v.glowM) { v.glowM.position.set(d.x, gh + 0.04, d.y); v.glowM.scale.setScalar(0.6 + Math.sin(time * 4) * 0.08); }
}
function visSweep(v, e) { if (v.seen !== frameNo) { disposeVis(v); VIS.delete(e); } }
/* Every hero of the party (squad mode): P exactly as before (syncSheetPlayer: its own layered meshes), then the allies
   (syncSheetHero: hero batches, see HB), then the hero batches' instances. HSET = this frame's heroes. */
const _HL = [];
function syncHeroes() {
  const H = typeof gfxHeroes === 'function' ? gfxHeroes() : null;
  let same = _HL.length === (H ? H.length : 0) + 1 && _HL[0] === P;
  if (same && H) for (let i = 0; i < H.length; i++) if (_HL[i + 1] !== H[i]) { same = false; break; }
  if (!same) { _HL.length = 0; _HL.push(P); HSET.clear(); if (P) HSET.add(P); if (H) for (let i = 0; i < H.length; i++) { _HL.push(H[i]); if (H[i]) HSET.add(H[i]); } }
  hbBegin();
  const C = ctrlHero();   // (= P outside core's withHero)
  if (C === P) { if (P && !(typeof syncSheetPlayer === 'function' && syncSheetPlayer())) syncSprite(P, framesForPlayer(), playerPose()); }
  else if (C && !(typeof syncSheetHero === 'function' && syncSheetHero(C))) syncSprite(C, framesForHero(C), heroPose(C));
  if (H) for (let i = 0; i < H.length; i++) {
    const h = H[i]; if (!h || h === C) continue;
    if (!(typeof syncSheetHero === 'function' && syncSheetHero(h))) syncSprite(h, framesForHero(h), heroPose(h));
  }
  hbFlushHeroes();
}
function syncEntities() {
  frameNo++;
  SPRF.dt = clamp(time - SPRF.t, 0, 0.25); SPRF.t = time;
  SPRF.shadows = shadowsOn(); SPRF.cyaw = casterYaw(); SPRF.rx = Math.cos(cam.yaw); SPRF.ry = -Math.sin(cam.yaw);
  SPRF.cy = Math.cos(cam.yaw); SPRF.sy = Math.sin(cam.yaw); SPRF.yaw = cam.yaw; CASTU.uCastCS.value.set(Math.cos(SPRF.cyaw), Math.sin(SPRF.cyaw));
  SHADOWMAT.opacity = SPRF.shadows ? 0.42 : 0.6;
  ibReset();
  const sh = typeof syncSheetMob === 'function';
  for (const m of mobs) if (!(sh && syncSheetMob(m))) syncSprite(m, framesForMob(m), mobPose(m));
  for (const n of map.npcs) { if (n.fx === undefined) { n.fx = n.dir; n.fy = 0.4; } if (!(sh && syncSheetNPC(n))) syncSprite(n, framesForNPC(n), n.moving ? { anim: 'walk', i: Math.floor((n.walk || time * 6) * 1.26) % 6 } : { anim: 'idle', i: Math.floor(time * 2 + n.x) % 4 }); }
  for (const d of drops) syncDrop(d);
  if (started) syncHeroes();
  // after the heroes (a perched pet follows the owner's facing / squash of this frame), before the batches flush
  if (typeof syncRavenShots === 'function') { syncRavenShots(); syncCompanions(); }
  VIS.forEach(visSweep);
  ANIME.flush();   // after-image instances (before the batches upload)
  ibFlush();
  if (frameNo % 120 === 0 && typeof sheetPagesSweep === 'function') sheetPagesSweep();
  let king = null; for (const m of mobs) if (m.type === 'ashen_king' && !m.dead) { king = m; break; }
  if (king && Math.random() < 0.6) parts.push({ x: king.x + rand(-0.6, 0.6), y: king.y + rand(-0.6, 0.6), z: rand(10, 120), vx: 0, vy: 0, vz: rand(40, 90), life: rand(0.4, 0.9), max: 0.9, col: pick(['#ff7a2a', '#ffb04a', '#ff4a1a']), size: 2.5, float: true });
  syncSwing(); syncHeroSwings(); ANIME.sync();
  PFX.update(SPRF.dt);
}

/* ---------- 3D point particles: dust (soft, normal blend) and embers/wisps (square, additive) ---------- */
const PFX = (() => {
  const VS = `
    attribute vec4 pcol; attribute float psize; uniform float uScale; varying vec4 vC;
    void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = max(1.0, psize * uScale / -mv.z); vC = pcol; }`;
  const FS = `
    varying vec4 vC;
    void main() {
      vec2 p = gl_PointCoord * 2.0 - 1.0;
    #ifdef PFX_SOFT
      float r = dot(p, p); if (r > 1.0) discard; float a = vC.a * (1.0 - r) * (1.0 - r);
    #else
      float a = vC.a;
    #endif
      gl_FragColor = vec4(vC.rgb, a);
      #include <tonemapping_fragment>
      #include <encodings_fragment>
    }`;
  function sys(soft, blending, N) {
    const geo = new THREE.BufferGeometry(), pos = new Float32Array(N * 3), col = new Float32Array(N * 4), size = new Float32Array(N);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('pcol', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('psize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({ uniforms: { uScale: { value: 400 } }, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, blending, defines: soft ? { PFX_SOFT: '' } : {} });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 2; scene.add(pts);
    return { geo, mat, pts, pos, col, size, list: [], free: [], N };
  }
  const A = sys(true, THREE.NormalBlending, 400), B = sys(false, THREE.AdditiveBlending, 500), C = sys(false, THREE.NormalBlending, 300), D = sys(true, THREE.AdditiveBlending, 600);
  const cap = () => { const q = gfxQ(); return q === 'low' ? 0.35 : q === 'medium' ? 0.7 : 1; };
  // Particles are pooled per system (no per-spawn / per-frame objects); colours are plain numbers: c0..c2 and, when
  // lerp is set, the end colour d0..d2. The random draws happen in the same order as before, full or not.
  function add(S, x, y, z, vx, vy, vz, g, drag, max, c0, c1, c2, lerp, d0, d1, d2, a0, s0, s1, wob) {
    if (!(S.list.length < S.N * cap())) return;
    const p = S.free.pop() || {};
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.g = g; p.drag = drag; p.life = 0; p.max = max;
    p.c0 = c0; p.c1 = c1; p.c2 = c2; p.lerp = lerp; p.d0 = d0; p.d1 = d1; p.d2 = d2; p.a0 = a0; p.s0 = s0; p.s1 = s1; p.wob = wob;
    S.list.push(p);
  }
  const DUST = { grass: [0.84, 0.8, 0.64], flag: [0.66, 0.66, 0.72], rock: [0.46, 0.4, 0.38] }, COBBLE = [0.86, 0.8, 0.68];
  function dust(x, y, z, n, s) {
    const L = map.d.look, c = L.cobble && map.deco ? COBBLE : (DUST[L.floor] || DUST.grass);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, sp = rand(0.25, 0.9) * s, vy = rand(0.2, 0.7), max = rand(0.45, 0.8), a0 = rand(0.5, 0.68), s1 = rand(0.55, 0.85) * s;
      add(A, x + Math.cos(a) * 0.12, y + 0.06, z + Math.sin(a) * 0.12, Math.cos(a) * sp, vy, Math.sin(a) * sp, -0.4, 3.5, max, c[0], c[1], c[2], false, 0, 0, 0, a0, 0.2 * s, s1, 0);
    }
  }
  function ember(x, y, z, cold) {
    if (Math.random() < 0.72) {
      const vx = rand(-0.4, 0.4), vy = rand(0.8, 2.2), vz = rand(-0.4, 0.4), max = rand(0.5, 1.1), g1 = cold ? 0.9 : rand(0.7, 1.0), s0 = rand(0.07, 0.12), wob = rand(2, 5);
      if (cold) add(B, x, y, z, vx, vy, vz, 0.6, 1.2, max, 0.7, g1, 1.4, true, 0.2, 0.3, 0.6, 1, s0, 0.03, wob);
      else add(B, x, y, z, vx, vy, vz, 0.6, 1.2, max, 1.6, g1, 0.25, true, 0.7, 0.1, 0.02, 1, s0, 0.03, wob);
    } else {
      const vx = rand(-0.3, 0.3), vy = rand(0.3, 1.0), vz = rand(-0.3, 0.3), max = rand(0.7, 1.3), s0 = rand(0.06, 0.1), wob = rand(1, 3);
      if (cold) add(C, x, y, z, vx, vy, vz, 0.1, 1.5, max, 0.75, 0.8, 0.9, false, 0, 0, 0, 0.9, s0, 0.05, wob);
      else add(C, x, y, z, vx, vy, vz, 0.1, 1.5, max, 0.2, 0.18, 0.18, false, 0, 0, 0, 0.9, s0, 0.05, wob);
    }
  }
  function wisp(x, y, z) { const vx = rand(-0.15, 0.15), vy = rand(0.2, 0.5), vz = rand(-0.15, 0.15), max = rand(0.9, 1.6), wob = rand(1, 2); add(B, x, y, z, vx, vy, vz, 0, 0.5, max, 0.45, 0.7, 1, true, 0.15, 0.25, 0.55, 0.7, 0.07, 0.02, wob); }
  function step(S, dt) {
    const L = S.list, lin = sprLinear(), pos = S.pos, col = S.col, size = S.size; let n = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i]; p.life += dt; if (p.life >= p.max) { S.free.push(p); continue; }
      const k = p.life / p.max, dr = Math.exp(-p.drag * dt);
      p.vx *= dr; p.vz *= dr; p.vy = p.vy * dr + p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.wob) { p.x += Math.sin(time * p.wob + i) * 0.25 * dt; }
      L[n++] = p;
      const j = n - 1;
      let r = p.c0, g = p.c1, b = p.c2;
      if (p.lerp) { r = p.c0 + (p.d0 - p.c0) * k; g = p.c1 + (p.d1 - p.c1) * k; b = p.c2 + (p.d2 - p.c2) * k; }
      pos[j * 3] = p.x; pos[j * 3 + 1] = p.y; pos[j * 3 + 2] = p.z;
      col[j * 4] = lin ? Math.pow(r, 2.2) : r; col[j * 4 + 1] = lin ? Math.pow(g, 2.2) : g; col[j * 4 + 2] = lin ? Math.pow(b, 2.2) : b;
      col[j * 4 + 3] = p.a0 * (p.lerp ? (1 - k * k) : (1 - k) * Math.min(1, k * 8 + 0.3));
      size[j] = p.s0 + (p.s1 - p.s0) * (1 - (1 - k) * (1 - k));
    }
    L.length = n; S.geo.setDrawRange(0, n);
    if (n) { const at = S.geo.attributes; at.position.needsUpdate = true; at.pcol.needsUpdate = true; at.psize.needsUpdate = true; }
    S.mat.uniforms.uScale.value = H * renderer.getPixelRatio() * 0.5 * camera.projectionMatrix.elements[5];
  }
  return {
    dust, ember, wisp,
    // VFX particles (colours in sRGB 0..1, may exceed 1 for hot cores): soft = round additive glow, else square
    // additive pixels; emitDark = square normal-blend (mud, dark wisps, feathers).
    emit(soft, x, y, z, vx, vy, vz, g, drag, max, c0, c1, c2, a0, s0, s1, wob) { add(soft ? D : B, x, y, z, vx, vy, vz, g, drag, max, c0, c1, c2, false, 0, 0, 0, a0, s0, s1, wob); },
    emitDark(x, y, z, vx, vy, vz, g, drag, max, c0, c1, c2, a0, s0, s1, wob) { add(C, x, y, z, vx, vy, vz, g, drag, max, c0, c1, c2, false, 0, 0, 0, a0, s0, s1, wob); },
    update(dt) { step(A, dt); step(B, dt); step(C, dt); step(D, dt); },
    clear() { for (const S of [A, B, C, D]) { for (const p of S.list) S.free.push(p); S.list.length = 0; S.geo.setDrawRange(0, 0); } },
  };
})();

/* ---------- Melee swing trail: a camera-facing additive arc ---------- */
const SWING = (() => {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uHead: { value: 0 }, uLen: { value: 0.5 }, uAlpha: { value: 0 }, uCol: { value: new THREE.Color() }, uCore: { value: new THREE.Color() }, uDir: { value: 1 }, uW: { value: 0.24 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform float uHead, uLen, uAlpha, uDir, uW; uniform vec3 uCol, uCore; varying vec2 vUv;
      void main() {
        vec2 p = vUv * 2.0 - 1.0; float r = length(p), a = atan(p.y, p.x), A = 1.45;
        float s = (A - a * uDir) / (2.0 * A), d = uHead - s;
        if (s < 0.0 || s > 1.0 || d < 0.0 || d > uLen) discard;
        float tail = 1.0 - d / uLen, r1 = 0.94, w = mix(0.03, uW, pow(tail, 0.7)), r0 = r1 - w;
        float band = smoothstep(r0 - 0.02, r0 + 0.04, r) * (1.0 - smoothstep(r1 - 0.015, r1 + 0.01, r));
        float core = 1.0 - smoothstep(0.0, 0.05, abs(r - (r1 - 0.03)));
        vec3 c = mix(uCol, uCore, core * tail) * (1.2 + 1.6 * core * tail);
        gl_FragColor = vec4(c, band * pow(tail, 1.1) * uAlpha);
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); mesh.visible = false; mesh.renderOrder = 4; mesh.frustumCulled = false; scene.add(mesh);
  return { mesh, mat, n: 0, last: -1 };
})();
const SWINGCOL = { sword: ['#8fb8ff', '#ffffff'], dagger: ['#b8e0ff', '#ffffff'], mace: ['#ffb060', '#fff2d0'], rod: ['#c49aff', '#fff0ff'], fist: ['#ffe0b0', '#ffffff'], heavy: ['#ff8a2a', '#fff4c0'],
  spear: ['#d8d0ff', '#ffffff'], twohand: ['#a8c0ff', '#ffffff'], staff: ['#c49aff', '#fff0ff'], book: ['#ffe0a0', '#ffffff'], lute: ['#ffd070', '#fff6d0'], whip: ['#e0a0ff', '#fff0ff'], knuckle: ['#9fd0ff', '#ffffff'] };
const _sv = new THREE.Vector3(), _sv2 = new THREE.Vector3();
function syncSwing() {
  const SW = SWING, m = SW.mesh, wt = (typeof S !== 'undefined' && S && S.wtype) || 'fist';
  const on = started && P && !P.dead && wt !== 'bow' && P.atkAnim >= 0 && !P.casting;
  if (P && P.atkAnim >= 0 && SW.last < 0) SW.n++;
  SW.last = P && P.atkAnim >= 0 ? P.atkAnim : -1;
  if (!on) { m.visible = false; return; }
  const k = P.atkAnim, v = VIS.get(P), heavy = !!(v && v.heavySwing);
  const head = smoothstep(0.04, 0.5, k), alpha = (1 - smoothstep(0.5, 0.9, k)) * Math.min(1, k * 10);
  if (alpha <= 0.01) { m.visible = false; return; }
  const cc = SWINGCOL[heavy ? 'heavy' : wt] || SWINGCOL.sword, small = wt === 'dagger' || wt === 'fist';
  const U = SW.mat.uniforms; U.uHead.value = head * 1.25; U.uLen.value = heavy ? 0.75 : 0.55; U.uAlpha.value = alpha;
  wcol(cc[0], U.uCol.value); wcol(cc[1], U.uCore.value); U.uDir.value = (SW.n % 2) ? 1 : -1; U.uW.value = heavy ? 0.34 : small ? 0.16 : 0.24;
  const gh = groundH(P.x, P.y), hh = headH(P), size = (heavy ? 2.5 : small ? 1.5 : 1.95) * Math.min(1.25, hh / 1.6 * 0.9 + 0.1);
  const fx = P.fx === undefined ? 1 : P.fx, fy = P.fy || 0, sr = fx * SPRF.rx + fy * SPRF.ry, sf = fx * -Math.sin(cam.yaw) + fy * -Math.cos(cam.yaw);
  _sv.set(P.x + fx * 0.22, gh + hh * 0.4, P.y + fy * 0.22); _sv2.copy(camera.position).sub(_sv).normalize();
  m.position.copy(_sv).addScaledVector(_sv2, 0.9);
  m.quaternion.copy(camera.quaternion); m.rotateZ(Math.atan2(sf, sr)); m.scale.set(size, size, 1); m.visible = true;
}

/* Allies' swing trails (squad mode): the same arc as SWING, one instance per attacking ally in a single instanced
   mesh (one draw for the whole party). Per instance: aA = (head, len, alpha, dir), aC = (colour, width), aK = core. */
const SWINGB = (() => {
  const mat = new THREE.ShaderMaterial({
    vertexShader: `attribute vec4 aA; attribute vec4 aC; attribute vec4 aK; varying vec2 vUv; varying vec4 vA; varying vec4 vC; varying vec3 vK;
      void main() { vUv = uv; vA = aA; vC = aC; vK = aK.rgb; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying vec2 vUv; varying vec4 vA; varying vec4 vC; varying vec3 vK;
      void main() {
        float uHead = vA.x, uLen = vA.y, uAlpha = vA.z, uDir = vA.w, uW = vC.w; vec3 uCol = vC.rgb, uCore = vK;
        vec2 p = vUv * 2.0 - 1.0; float r = length(p), a = atan(p.y, p.x), A = 1.45;
        float s = (A - a * uDir) / (2.0 * A), d = uHead - s;
        if (s < 0.0 || s > 1.0 || d < 0.0 || d > uLen) discard;
        float tail = 1.0 - d / uLen, r1 = 0.94, w = mix(0.03, uW, pow(tail, 0.7)), r0 = r1 - w;
        float band = smoothstep(r0 - 0.02, r0 + 0.04, r) * (1.0 - smoothstep(r1 - 0.015, r1 + 0.01, r));
        float core = 1.0 - smoothstep(0.0, 0.05, abs(r - (r1 - 0.03)));
        vec3 c = mix(uCol, uCore, core * tail) * (1.2 + 1.6 * core * tail);
        gl_FragColor = vec4(c, band * pow(tail, 1.1) * uAlpha);
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const B = { mat, mesh: null, cap: 0, A: null, C: null, K: null, M: new THREE.Matrix4(), q: new THREE.Quaternion(), qz: new THREE.Quaternion(), s: new THREE.Vector3(), z: new THREE.Vector3(0, 0, 1), c: new THREE.Color() };
  B.alloc = cap => {
    const g = new THREE.PlaneGeometry(1, 1);
    for (const [k, f] of [['aA', 'A'], ['aC', 'C'], ['aK', 'K']]) { const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage); g.setAttribute(k, a); B[f] = a.array; }
    if (B.mesh) { scene.remove(B.mesh); B.mesh.geometry.dispose(); B.mesh.dispose(); }
    const m = new THREE.InstancedMesh(g, mat, cap); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.renderOrder = 4; m.count = 0; m.visible = false; scene.add(m); B.mesh = m; B.cap = cap;
  };
  B.alloc(4);
  return B;
})();
function syncHeroSwings() {
  const B = SWINGB, H = typeof gfxHeroes === 'function' && started ? gfxHeroes() : null; let n = 0;
  if (H) for (let i = 0; i < H.length; i++) {
    const h = H[i]; if (!h || h === P || typeof heroState !== 'function') continue;
    const hs = heroState(h), wt = heroWtype(h) || 'fist';
    if (h.atkAnim >= 0 && hs.swLast < 0) hs.swN++;
    hs.swLast = h.atkAnim >= 0 ? h.atkAnim : -1;
    if (h.dead || wt === 'bow' || !(h.atkAnim >= 0) || h.casting) continue;
    const k = h.atkAnim, v = VIS.get(h), heavy = !!(v && v.heavySwing);
    const head = smoothstep(0.04, 0.5, k), alpha = (1 - smoothstep(0.5, 0.9, k)) * Math.min(1, k * 10);
    if (alpha <= 0.01) continue;
    if (n >= B.cap) B.alloc(B.cap * 2);
    const cc = SWINGCOL[heavy ? 'heavy' : wt] || SWINGCOL.sword, small = wt === 'dagger' || wt === 'fist', o = n * 4;
    B.A[o] = head * 1.25; B.A[o + 1] = heavy ? 0.75 : 0.55; B.A[o + 2] = alpha; B.A[o + 3] = (hs.swN % 2) ? 1 : -1;
    wcol(cc[0], B.c); B.C[o] = B.c.r; B.C[o + 1] = B.c.g; B.C[o + 2] = B.c.b; B.C[o + 3] = heavy ? 0.34 : small ? 0.16 : 0.24;
    wcol(cc[1], B.c); B.K[o] = B.c.r; B.K[o + 1] = B.c.g; B.K[o + 2] = B.c.b; B.K[o + 3] = 0;
    const gh = groundH(h.x, h.y), hh = headH(h), size = (heavy ? 2.5 : small ? 1.5 : 1.95) * Math.min(1.25, hh / 1.6 * 0.9 + 0.1);
    const fx = h.fx === undefined ? 1 : h.fx, fy = h.fy || 0, sr = fx * SPRF.rx + fy * SPRF.ry, sf = fx * -Math.sin(cam.yaw) + fy * -Math.cos(cam.yaw);
    _sv.set(h.x + fx * 0.22, gh + hh * 0.4, h.y + fy * 0.22); _sv2.copy(camera.position).sub(_sv).normalize(); _sv.addScaledVector(_sv2, 0.9);
    B.q.copy(camera.quaternion).multiply(B.qz.setFromAxisAngle(B.z, Math.atan2(sf, sr))); B.s.set(size, size, 1);
    B.M.compose(_sv, B.q, B.s).toArray(B.mesh.instanceMatrix.array, n * 16); n++;
  }
  const m = B.mesh; m.count = n; m.visible = n > 0;
  if (n) { ibFlag(m.instanceMatrix, n); const g = m.geometry.attributes; ibFlag(g.aA, n); ibFlag(g.aC, n); ibFlag(g.aK, n); }
}

/* ---------- FX textures (own copies, independent of the world's TEX) ---------- */
const FXT = (() => {
  const T = {};
  const mk = (S, draw) => { const c = mkCanvas(S, S), g = c.getContext('2d'); g.translate(S / 2, S / 2); g.strokeStyle = g.fillStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round'; draw(g, S / 2); const t = canvasTex(c); return t; };
  const glowPass = (g, blur, fn) => { g.save(); g.shadowColor = '#fff'; g.shadowBlur = blur; fn(); g.restore(); fn(); };
  // Target ring: thin ring, four bracket arcs, four inward notches (RO-like, cleaner).
  T.target = mk(256, (g, R) => glowPass(g, 12, () => {
    g.globalAlpha = 0.75; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 92, 0, 7); g.stroke(); g.globalAlpha = 1;
    g.lineWidth = 8; for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; g.beginPath(); g.arc(0, 0, 112, a - 0.36, a + 0.36); g.stroke(); }
    for (let i = 0; i < 4; i++) { g.save(); g.rotate(i * Math.PI / 2); g.beginPath(); g.moveTo(0, -78); g.lineTo(-10, -98); g.lineTo(10, -98); g.closePath(); g.fill(); g.restore(); }
  }));
  // Lock: heavier corner brackets + a dashed inner ring.
  T.lock = mk(256, (g) => glowPass(g, 14, () => {
    g.lineWidth = 5; g.setLineDash([10, 9]); g.beginPath(); g.arc(0, 0, 70, 0, 7); g.stroke(); g.setLineDash([]);
    g.lineWidth = 9; for (let i = 0; i < 4; i++) { g.save(); g.rotate(i * Math.PI / 2 + Math.PI / 4); g.beginPath(); g.moveTo(-26, -104); g.lineTo(0, -120); g.lineTo(26, -104); g.stroke(); g.restore(); }
  }));
  // Hover: a single fine ring with ticks.
  T.hover = mk(256, (g) => glowPass(g, 8, () => {
    g.lineWidth = 3.5; g.beginPath(); g.arc(0, 0, 100, 0, 7); g.stroke();
    g.lineWidth = 4; for (let i = 0; i < 8; i++) { g.save(); g.rotate(i * Math.PI / 4); g.beginPath(); g.moveTo(0, -106); g.lineTo(0, -116); g.stroke(); g.restore(); }
  }));
  // Rune band for telegraphs: double ring with procedural staves between.
  T.rune = mk(512, (g, R) => {
    const rng = mulberry32(777);
    glowPass(g, 16, () => {
      g.lineWidth = 7; g.beginPath(); g.arc(0, 0, 244, 0, 7); g.stroke();
      g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 196, 0, 7); g.stroke();
      const N = 22;
      for (let i = 0; i < N; i++) {
        g.save(); g.rotate(i / N * Math.PI * 2);
        const r0 = 204, r1 = 234, h = r1 - r0; g.lineWidth = 3.5; g.beginPath(); g.moveTo(0, -r0); g.lineTo(0, -r1);
        const kind = (rng() * 6) | 0, s = rng() < 0.5 ? 1 : -1;
        if (kind === 0) { g.moveTo(0, -r1); g.lineTo(9 * s, -r1 + 9); g.moveTo(0, -r1 + 12); g.lineTo(9 * s, -r1 + 21); }
        else if (kind === 1) { g.moveTo(0, -r1); g.lineTo(10 * s, -r0 + h * 0.4); g.lineTo(0, -r0 + h * 0.2); }
        else if (kind === 2) { g.moveTo(-8, -r1 + 6); g.lineTo(8, -r0 + 6); g.moveTo(8, -r1 + 6); g.lineTo(-8, -r0 + 6); }
        else if (kind === 3) { g.moveTo(0, -r0 - h * 0.55); g.lineTo(10 * s, -r1); g.moveTo(0, -r0 - h * 0.55); g.lineTo(-10 * s, -r1); }
        else if (kind === 4) { g.moveTo(0, -r1 + 4); g.lineTo(10 * s, -r1 + 12); g.lineTo(0, -r1 + 20); }
        else { g.moveTo(-9, -r1); g.lineTo(0, -r1 + 10); g.lineTo(9, -r1); }
        g.stroke();
        g.lineWidth = 2.5; g.beginPath(); g.moveTo(0, -238); g.lineTo(0, -250); g.stroke();
        g.restore();
      }
    });
  });
  // Growing inner fill: faint body, hot rim at the edge.
  T.fill = (() => { const c = mkCanvas(256, 256), g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, 'rgba(255,255,255,.1)'); gr.addColorStop(0.72, 'rgba(255,255,255,.2)'); gr.addColorStop(0.9, 'rgba(255,255,255,.6)'); gr.addColorStop(0.965, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256); return canvasTex(c); })();
  // Flat disc with a soft edge (telegraph base).
  T.disc = (() => { const c = mkCanvas(256, 256), g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(0.85, 'rgba(255,255,255,.8)'); gr.addColorStop(0.97, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256); return canvasTex(c); })();
  T.soft = (() => { const c = mkCanvas(128, 128), g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return canvasTex(c); })();
  return T;
})();

/* ---------- Ground decals ---------- */
function decalMesh(tex, col, op, add, extra) { const m = new THREE.Mesh(FLATPLANE, new THREE.MeshBasicMaterial(Object.assign({ map: tex, color: col, transparent: true, opacity: op, depthWrite: false, depthTest: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending }, extra || {}))); m.renderOrder = -1; scene.add(m); return m; }
function syncDecal(key, build, place) { let v = DV.get(key); if (!v) { v = { meshes: build() }; DV.set(key, v); } v.seen = frameNo; place(v.meshes); }
// Stencil bits: each overlapping telegraph fills a pixel once (bit 2 = base, bit 4 = grow); bit 1 stays the player's x-ray.
const STENCIL_ONCE = bit => ({ stencilWrite: true, stencilRef: bit, stencilFuncMask: bit, stencilWriteMask: bit, stencilFunc: THREE.NotEqualStencilFunc, stencilZPass: THREE.ReplaceStencilOp });
const _tc = new THREE.Color(), _tc2 = new THREE.Color(), _castCol = new THREE.Color();
function dvSweep(v, k) { if (v.seen !== frameNo) { for (const m of v.meshes) { scene.remove(m); m.material.dispose(); } DV.delete(k); } }
function syncDecals() {
  for (const t of teles) if (!(t.shape && (t.shape.kind === 'cone' || t.shape.kind === 'lines') && VFX.enabled)) syncDecal(t, () => {   // cones / lines: exact shapes in VFX
    const base = decalMesh(FXT.disc, 0x000000, 0.3, false, STENCIL_ONCE(2)); base.renderOrder = -3;
    const grow = decalMesh(FXT.fill, 0x000000, 0.8, true, STENCIL_ONCE(4)); grow.renderOrder = -2;
    const rune = decalMesh(FXT.rune, 0x000000, 1, true);
    return [base, grow, rune];
  }, ([base, grow, rune]) => {
    const gh = groundH(t.x, t.y) + 0.05, k = clamp(t.t / t.dur, 0, 1), late = smoothstep(0.7, 1, k);
    base.position.set(t.x, gh, t.y); grow.position.set(t.x, gh, t.y); rune.position.set(t.x, gh, t.y);
    base.scale.setScalar(t.r); rune.scale.setScalar(t.r * 1.04); grow.scale.setScalar(Math.max(0.01, t.r * (0.08 + 0.92 * k)));
    // heat: deep crimson -> ember orange -> white-hot at the end
    wcol('#6a0c06', base.material.color); base.material.opacity = 0.42 + 0.2 * late;
    wcol('#ff5a14', _tc); wcol('#ffd080', _tc2); grow.material.color.copy(_tc).lerp(_tc2, late * 0.6); grow.material.opacity = 0.45 + 0.45 * k;
    const pulse = 0.5 + 0.5 * Math.cos(time * (6 + 18 * late) * Math.PI);
    wcol('#ff3a10', _tc); wcol('#ffc060', _tc2); rune.material.color.copy(_tc).lerp(_tc2, late * pulse); rune.material.opacity = 0.55 + 0.35 * pulse * (0.4 + 0.6 * k);
    rune.rotation.y = time * 0.35 + t.x;
  });
  for (const f of fxs) {
    if (f.k === 'ring') syncDecal(f, () => [decalMesh(TEX.ring, new THREE.Color(f.col), 1, true)], ([a]) => { const k = f.t / f.dur; a.position.set(f.x, groundH(f.x, f.y) + 0.06, f.y); a.scale.setScalar(Math.max(0.01, f.r * (0.3 + 0.7 * k))); a.material.opacity = 1 - k; });
    else if (f.k === 'mark') syncDecal(f, () => [decalMesh(TEX.target, 0xffe070, 1, true)], ([a]) => { const k = f.t / f.dur; a.position.set(f.x, groundH(f.x, f.y) + 0.06, f.y); a.scale.setScalar(0.5 - k * 0.2); a.material.opacity = 1 - k; a.rotation.y = k * 2; });
  }
  if (P && P.casting && !(VFX.enabled && VFX.fbReady('rune_circle'))) { const col = _castCol.set(ELCOL[SKILLS[P.casting.id].el] || '#ffffff'); syncDecal('cast', () => [decalMesh(TEX.magic, col, 0.95, true)], ([a]) => { a.material.color.copy(col); a.position.set(P.x, groundH(P.x, P.y) + 0.07, P.y); a.rotation.y = time * 1.4; a.scale.setScalar(1.3 + Math.sin(time * 6) * 0.05); }); }
  // allies casting while the rune_circle flipbook is not in yet (fallback decal, keyed by the hero's render state)
  if (P && typeof gfxHeroes === 'function' && !(VFX.enabled && VFX.fbReady('rune_circle'))) { const H = gfxHeroes(); for (let i = 0; i < H.length; i++) { const h = H[i]; if (h === P || !h.casting || h.dead || !SKILLS[h.casting.id]) continue;
    const hs = heroState(h), cc = hs.castCol || (hs.castCol = new THREE.Color()); cc.set(ELCOL[SKILLS[h.casting.id].el] || '#ffffff');
    syncDecal(hs, () => [decalMesh(TEX.magic, cc, 0.95, true)], ([a]) => { a.material.color.copy(cc); a.position.set(h.x, groundH(h.x, h.y) + 0.07, h.y); a.rotation.y = time * 1.4; a.scale.setScalar(1.3 + Math.sin(time * 6) * 0.05); }); } }
  syncTargetRing();
  DV.forEach(dvSweep);
}
const TRING = { t0: 0, tg: null, mode: '' };
// Target / lock / hover rings: a soft underglow, the main ring, and (lock) a counter-rotating bracket set.
function syncTargetRing() {
  if (!started || !P) return;
  const lk = typeof CTRL !== 'undefined' && CTRL.lock && !CTRL.lock.dead ? CTRL.lock : null;
  const tg = lk || (P.target && !P.target.dead ? P.target : (hover && hover.kind === 'mob' && !hover.dead ? hover : null));
  if (!tg) return;
  const mode = tg === lk ? 'lock' : tg === P.target ? 'target' : 'hover';
  syncDecal('target', () => [decalMesh(FXT.soft, 0x000000, 0.5, true), decalMesh(FXT.target, 0x000000, 1, true), decalMesh(FXT.lock, 0x000000, 1, true)], ([glow, ring, lock]) => {
    const gh = groundH(tg.x, tg.y) + 0.06, s = 0.62 * Math.max(1, (tg.d.size || (tg.d.look && tg.d.look.scale) || 1) * 0.8);
    const col = mode === 'lock' ? '#ff3a5a' : mode === 'target' ? '#ff6a3a' : '#ffd070';
    const R = TRING; if (R.tg !== tg || R.mode !== mode) { R.t0 = time; R.tg = tg; R.mode = mode; }
    const age = time - R.t0, pop = 1 + 0.35 * Math.exp(-age * 14);
    glow.position.set(tg.x, gh, tg.y); ring.position.set(tg.x, gh, tg.y); lock.position.set(tg.x, gh, tg.y);
    wcol(col, glow.material.color); glow.scale.setScalar(s * 1.1); glow.material.opacity = mode === 'hover' ? 0.18 : 0.32 + 0.08 * Math.sin(time * 5);
    ring.material.map = mode === 'hover' ? FXT.hover : FXT.target; wcol(col, ring.material.color);
    ring.material.opacity = mode === 'hover' ? 0.7 : 0.95; ring.rotation.y = time * (mode === 'hover' ? 0.4 : 0.9); ring.scale.setScalar(s * pop * (1 + 0.03 * Math.sin(time * 6)));
    lock.visible = mode === 'lock'; if (lock.visible) { wcol('#ffb0c0', lock.material.color); lock.rotation.y = -time * 1.6; lock.scale.setScalar(s * 0.92 * pop); lock.material.opacity = 0.85; }
  });
}
/* =========================================================
   Skill, status and quest VFX in 3D (graphics round 4)

   Reads the runtime state every frame, so content never calls it:
     zones[]            ground zones (storm, vermilion, quagmire, sanctuary, magnus, ward), traps, enemy hexes
     teles[].shape      exact cone / lines telegraphs for breath and wave (the circles of those groups are skipped
                        by syncDecals)
     P.buffs[*].aura    songs, Oath of Tyr, Magic Rod, the Kyrie bubble
     P.spheres          monk spirit spheres
     projs[]            magic bolts, Huginn's trail (the bird is the pet_huginn sheet; a pixel raven until it loads),
                        the thrown spear, flicked spheres (arrows stay 2D)
     fxs[]              'strike' (3D lightning) and 'pillar' (3D light column); ring/mark stay decals
     mobs[]             snare / slow / frozen / stun / mark / dispel / lex, named-variant and MVP auras
     questSpots()       quest beacons (light pillar + '?' rune, destination and defence rings)
   Everything is drawn by 5 dynamic quad batches (ground additive, ground normal, billboard additive, billboard
   normal, pixel sprites) + the pooled PFX particles + at most a few fresnel spheres (Kyrie, Norn ward): a frame with
   no active effect issues no draw at all. Textures: one 2048² atlas painted once on first use (64 cells of 256 px:
   shapes + procedural Elder Futhark runes, no font needed) and a small nearest-filtered pixel atlas.
   API for one-off effects (content may call them, nothing requires it):
     VFX.zone({ x, y, r, col, kind, rune, dur })  a transient ground zone look (same kinds as zones[])
     VFX.cone({ x, y, ang, half, len, col, dur }) VFX.lines({ x, y, ang, n, spread, len, w, col, dur })
     VFX.bolt(x0, y0, h0, x1, y1, h1, col)        VFX.beam(x, y, col, big)
     VFX.enabled = false turns the 3D layer off (A/B); QUEST_UI.skills / QUEST_UI.spots are set false so the 2D
     placeholders in js/ui.js can stand down.
   ========================================================= */
const VFX = (() => {
  const V = { enabled: true, ready: false, t: 0, extra: [], hide: 0 };   // hide: debug bitmask of batches (GN, GA, PB, BA, BN)
  /* ---------- colour helpers (cached, no per-frame strings) ---------- */
  const COLC = new Map();
  function lc(hex) {   // hex -> [r, g, b] in the working space (linear when the pipeline is)
    let c = COLC.get(hex); const lin = sprLinear();
    if (!c || c.lin !== lin) { const t = new THREE.Color(hex); if (lin) t.convertSRGBToLinear(); c = [t.r, t.g, t.b]; c.lin = lin; COLC.set(hex, c); }
    return c;
  }
  const RGBC = new Map();
  function srgb(hex) { let c = RGBC.get(hex); if (!c) { const h = hex2rgb(hex); c = [h[0] / 255, h[1] / 255, h[2] / 255]; RGBC.set(hex, c); } return c; }   // for PFX (it linearises itself)

  /* ---------- atlas ---------- */
  const AS = 2048, CS = 256, CN = 8, CELL = {};
  let atlas = null, pix = null, cellN = 0;
  const UVC = [];
  function cellUV(i) { let u = UVC[i]; if (!u) { const cx = i % CN, cy = Math.floor(i / CN), p = 3; u = UVC[i] = [(cx * CS + p) / AS, 1 - ((cy + 1) * CS - p) / AS, ((cx + 1) * CS - p) / AS, 1 - (cy * CS + p) / AS]; } return u; }
  // Elder Futhark (and a few Younger) runes as strokes in a 0..1 box (x right, y down): crisp at any size, no font.
  const RUNES = {
    'ᚠ': [[.35, 0, .35, 1], [.35, .3, .75, .05], [.35, .55, .75, .3]], 'ᚢ': [[.3, 1, .3, 0, .7, .35, .7, 1]], 'ᚦ': [[.35, 0, .35, 1], [.35, .25, .72, .5, .35, .75]],
    'ᚨ': [[.35, 0, .35, 1], [.35, .08, .72, .33], [.35, .35, .72, .6]], 'ᚱ': [[.3, 1, .3, 0, .7, .25, .3, .5, .72, 1]], 'ᚲ': [[.68, .12, .3, .5, .68, .88]],
    'ᚴ': [[.4, 0, .4, 1], [.4, .35, .75, .05]], 'ᚷ': [[.2, .1, .8, .9], [.8, .1, .2, .9]], 'ᚹ': [[.35, 1, .35, 0, .7, .22, .35, .45]],
    'ᚺ': [[.28, 0, .28, 1], [.72, 0, .72, 1], [.28, .35, .72, .62]], 'ᚾ': [[.5, 0, .5, 1], [.28, .35, .72, .62]], 'ᛁ': [[.5, 0, .5, 1]],
    'ᛃ': [[.46, .08, .2, .34, .46, .6], [.54, .4, .8, .66, .54, .92]], 'ᛇ': [[.5, 0, .5, 1], [.5, 0, .76, .2], [.5, 1, .24, .8]],
    'ᛉ': [[.5, .1, .5, 1], [.5, .45, .2, .1], [.5, .45, .8, .1]], 'ᛊ': [[.7, .05, .3, .38, .7, .62, .3, .95]], 'ᛋ': [[.72, .05, .3, .4, .7, .6, .28, .95]],
    'ᛏ': [[.5, 0, .5, 1], [.2, .3, .5, 0, .8, .3]], 'ᛒ': [[.3, 0, .3, 1], [.3, 0, .7, .25, .3, .5, .7, .75, .3, 1]], 'ᛖ': [[.24, 1, .24, 0, .5, .3, .76, 0, .76, 1]],
    'ᛗ': [[.24, 0, .24, 1], [.76, 0, .76, 1], [.24, 0, .76, .4], [.76, 0, .24, .4]], 'ᛚ': [[.35, 1, .35, 0, .7, .3]], 'ᛜ': [[.5, .08, .82, .5, .5, .92, .18, .5, .5, .08]],
    'ᛞ': [[.2, 0, .2, 1, .8, 0, .8, 1, .2, 0]], 'ᛟ': [[.2, .95, .8, .3, .5, 0, .2, .3, .8, .95]], 'ᛣ': [[.5, 0, .5, .95], [.5, .55, .2, .95], [.5, .55, .8, .95]],
    'ᛈ': [[.3, 0, .3, 1], [.3, 0, .7, .2, .7, .35], [.3, 1, .7, .8, .7, .65]], 'ᛝ': [[.5, 0, .85, .5, .5, 1, .15, .5, .5, 0]],
  };
  const RUNE_KEYS = Object.keys(RUNES);
  function strokeGlow(g, w, draw) { g.save(); g.lineWidth = w * 3.2; g.globalAlpha = 0.1; draw(); g.lineWidth = w * 2; g.globalAlpha = 0.22; draw(); g.restore(); g.lineWidth = w; draw(); }
  function runePath(g, rn, s) { const S = RUNES[rn]; g.beginPath(); for (const L of S) { for (let i = 0; i < L.length; i += 2) { const x = (L[i] - 0.5) * s * 0.62, y = (L[i + 1] - 0.5) * s; if (i) g.lineTo(x, y); else g.moveTo(x, y); } } }
  function paintAtlas() {
    const c = mkCanvas(AS, AS), g = c.getContext('2d'), R = 118;
    const cell = (name, fn) => { const i = cellN++; CELL[name] = i; g.save(); g.translate((i % CN) * CS + CS / 2, Math.floor(i / CN) * CS + CS / 2); g.beginPath(); g.rect(-CS / 2 + 2, -CS / 2 + 2, CS - 4, CS - 4); g.clip(); g.strokeStyle = g.fillStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round'; fn(g); g.restore(); };
    const circ = (g, r) => { g.beginPath(); g.arc(0, 0, r, 0, 6.2832); };
    const radial = (g, stops, r) => { const gr = g.createRadialGradient(0, 0, 0, 0, 0, r || R); for (const [k, a] of stops) gr.addColorStop(k, `rgba(255,255,255,${a})`); g.fillStyle = gr; g.fillRect(-CS / 2, -CS / 2, CS, CS); };
    const rng = mulberry32(4242);
    cell('glow', g => radial(g, [[0, 1], [0.25, 0.55], [0.55, 0.18], [1, 0]]));
    cell('core', g => radial(g, [[0, 1], [0.2, 0.95], [0.45, 0.35], [0.7, 0]]));
    cell('ring', g => strokeGlow(g, 7, () => { circ(g, R * 0.86); g.stroke(); }));
    cell('ringDash', g => { g.setLineDash([22, 16]); strokeGlow(g, 6, () => { circ(g, R * 0.86); g.stroke(); }); g.setLineDash([]); for (let i = 0; i < 12; i++) { const a = i / 12 * 6.2832; g.lineWidth = 4; g.beginPath(); g.moveTo(Math.cos(a) * R * 0.7, Math.sin(a) * R * 0.7); g.lineTo(Math.cos(a) * R * 0.76, Math.sin(a) * R * 0.76); g.stroke(); } });
    cell('disc', g => radial(g, [[0, 0.5], [0.8, 0.75], [0.95, 1], [1, 0]]));
    cell('fill', g => radial(g, [[0, 0.08], [0.72, 0.18], [0.9, 0.55], [0.965, 1], [1, 0]]));
    // magic circles
    const band = (g, r0, r1, n, seed) => { const rr = mulberry32(seed); for (let i = 0; i < n; i++) { g.save(); g.rotate(i / n * 6.2832); g.translate(0, -(r0 + r1) / 2); const rn = RUNE_KEYS[(rr() * RUNE_KEYS.length) | 0]; g.lineWidth = 3; runePath(g, rn, (r1 - r0) * 0.9); g.stroke(); g.restore(); } };
    cell('runeCircle', g => { strokeGlow(g, 5, () => { circ(g, R * 0.97); g.stroke(); circ(g, R * 0.78); g.stroke(); }); band(g, R * 0.8, R * 0.95, 20, 11);
      g.globalAlpha = 0.85; strokeGlow(g, 3, () => { g.beginPath(); for (let k = 0; k < 2; k++) for (let i = 0; i <= 3; i++) { const a = (i / 3 + k / 6) * 6.2832 - 1.5708, x = Math.cos(a) * R * 0.74, y = Math.sin(a) * R * 0.74; if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); circ(g, R * 0.36); g.stroke(); }); g.globalAlpha = 1; });
    cell('frostCircle', g => { strokeGlow(g, 4, () => { circ(g, R * 0.96); g.stroke(); circ(g, R * 0.84); g.stroke(); });
      strokeGlow(g, 4, () => { g.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * 6.2832, ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux; g.moveTo(ux * R * 0.12, uy * R * 0.12); g.lineTo(ux * R * 0.8, uy * R * 0.8);
        for (const k of [0.38, 0.58]) { const px = ux * R * k, py = uy * R * k, L = R * 0.16; g.moveTo(px, py); g.lineTo(px + (ux + vx) * L * 0.7, py + (uy + vy) * L * 0.7); g.moveTo(px, py); g.lineTo(px + (ux - vx) * L * 0.7, py + (uy - vy) * L * 0.7); } } g.stroke(); });
      g.lineWidth = 3; g.beginPath(); for (let i = 0; i <= 6; i++) { const a = i / 6 * 6.2832 + 0.5236; if (i) g.lineTo(Math.cos(a) * R * 0.3, Math.sin(a) * R * 0.3); else g.moveTo(Math.cos(a) * R * 0.3, Math.sin(a) * R * 0.3); } g.stroke(); });
    cell('boltCircle', g => { strokeGlow(g, 5, () => { circ(g, R * 0.95); g.stroke(); }); band(g, R * 0.78, R * 0.92, 16, 23);
      strokeGlow(g, 3.5, () => { g.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * 6.2832, ux = Math.cos(a), uy = Math.sin(a); g.moveTo(ux * R * 0.18, uy * R * 0.18); for (let k = 1; k <= 4; k++) { const r = R * (0.18 + k * 0.14), o = (k % 2 ? 1 : -1) * R * 0.06; g.lineTo(ux * r - uy * o, uy * r + ux * o); } } g.stroke(); circ(g, R * 0.16); g.stroke(); }); });
    cell('holyCircle', g => { strokeGlow(g, 4, () => { circ(g, R * 0.96); g.stroke(); circ(g, R * 0.9); g.stroke(); });
      g.globalAlpha = 0.8; strokeGlow(g, 3, () => { for (let i = 0; i < 8; i++) { const a = i / 8 * 6.2832; g.beginPath(); g.arc(Math.cos(a) * R * 0.42, Math.sin(a) * R * 0.42, R * 0.42, 0, 6.2832); g.stroke(); } }); g.globalAlpha = 1; strokeGlow(g, 4, () => { circ(g, R * 0.2); g.stroke(); }); });
    cell('cross', g => { const w = R * 0.15, L = R * 0.9; g.shadowColor = '#fff'; g.shadowBlur = 16; g.fillRect(-w / 2, -L, w, 2 * L); g.fillRect(-L, -w / 2, 2 * L, w); g.shadowBlur = 0; g.globalCompositeOperation = 'destination-out'; g.fillRect(-w * 0.18, -L * 0.94, w * 0.36, 2 * L * 0.94); g.fillRect(-L * 0.94, -w * 0.18, 2 * L * 0.94, w * 0.36); g.globalCompositeOperation = 'source-over';
      strokeGlow(g, 4, () => { circ(g, R * 0.97); g.stroke(); circ(g, R * 0.5); g.stroke(); }); });
    cell('mud', g => { g.globalAlpha = 1; for (let i = 0; i < 90; i++) { const a = rng() * 6.2832, d = Math.sqrt(rng()) * R * 0.78, r = R * (0.1 + rng() * 0.18), v = 110 + (rng() * 90 | 0); g.fillStyle = `rgba(${v},${v},${v},${0.55 + rng() * 0.4})`; g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, r, 0, 6.2832); g.fill(); }
      for (let i = 0; i < 26; i++) { const a = rng() * 6.2832, d = Math.sqrt(rng()) * R * 0.75, r = R * (0.03 + rng() * 0.05); g.fillStyle = 'rgba(40,40,40,.8)'; g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, r, 0, 6.2832); g.fill(); g.strokeStyle = 'rgba(235,235,235,.7)'; g.lineWidth = 2; g.beginPath(); g.arc(Math.cos(a) * d - r * 0.3, Math.sin(a) * d - r * 0.3, r * 0.6, 3.6, 5.2); g.stroke(); }
      g.globalCompositeOperation = 'destination-in'; radial(g, [[0, 1], [0.72, 1], [0.95, 0]], R); g.globalCompositeOperation = 'source-over'; });
    cell('hex', g => { strokeGlow(g, 5, () => { circ(g, R * 0.9); g.stroke(); });
      g.beginPath(); for (let i = 0; i < 18; i++) { const a = i / 18 * 6.2832, b = a + 0.17; g.moveTo(Math.cos(a - 0.08) * R * 0.9, Math.sin(a - 0.08) * R * 0.9); g.lineTo(Math.cos(b) * R * 0.66, Math.sin(b) * R * 0.66); g.lineTo(Math.cos(a + 0.12) * R * 0.9, Math.sin(a + 0.12) * R * 0.9); } g.fill();
      strokeGlow(g, 3, () => { g.beginPath(); for (let i = 0; i <= 5; i++) { const a = i * 2 / 5 * 6.2832 - 1.5708; if (i) g.lineTo(Math.cos(a) * R * 0.55, Math.sin(a) * R * 0.55); else g.moveTo(Math.cos(a) * R * 0.55, Math.sin(a) * R * 0.55); } g.stroke(); }); });
    cell('wardRing', g => { strokeGlow(g, 4, () => { circ(g, R * 0.95); g.stroke(); circ(g, R * 0.88); g.stroke(); }); band(g, R * 0.6, R * 0.84, 12, 57);
      strokeGlow(g, 3, () => { for (let k = 0; k < 3; k++) { g.save(); g.rotate(k * 2.0944); g.beginPath(); for (let i = 0; i <= 3; i++) { const a = i / 3 * 6.2832 - 1.5708; const x = Math.cos(a) * R * 0.3, y = Math.sin(a) * R * 0.3 - R * 0.12; if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); g.restore(); } }); });
    cell('trap', g => { strokeGlow(g, 5, () => { g.beginPath(); g.moveTo(0, -R * 0.9); g.lineTo(R * 0.9, 0); g.lineTo(0, R * 0.9); g.lineTo(-R * 0.9, 0); g.closePath(); g.stroke(); });
      g.lineWidth = 3; g.strokeRect(-R * 0.45, -R * 0.45, R * 0.9, R * 0.9); for (let i = 0; i < 4; i++) { g.save(); g.rotate(i * 1.5708); g.beginPath(); g.moveTo(-R * 0.12, -R * 0.66); g.lineTo(0, -R * 0.5); g.lineTo(R * 0.12, -R * 0.66); g.stroke(); g.restore(); } });
    cell('snare', g => strokeGlow(g, 5, () => { for (let s = 0; s < 2; s++) { g.beginPath(); for (let i = 0; i <= 96; i++) { const a = i / 96 * 6.2832, r = R * (0.72 + 0.07 * Math.sin(a * 9 + s * 3.14)); if (i) g.lineTo(Math.cos(a) * r, Math.sin(a) * r); else g.moveTo(Math.cos(a) * r, Math.sin(a) * r); } g.stroke(); } for (let i = 0; i < 5; i++) { const a = i / 5 * 6.2832 + 0.3; g.beginPath(); g.moveTo(Math.cos(a) * R * 0.72, Math.sin(a) * R * 0.72); g.quadraticCurveTo(Math.cos(a + 0.3) * R * 0.45, Math.sin(a + 0.3) * R * 0.45, Math.cos(a + 0.5) * R * 0.3, Math.sin(a + 0.5) * R * 0.3); g.stroke(); } }));
    cell('star', g => { radial(g, [[0, 0.9], [0.12, 0.45], [0.3, 0]], R); g.beginPath(); for (let i = 0; i < 4; i++) { const a = i * 1.5708; g.moveTo(0, 0); g.lineTo(Math.cos(a - 0.06) * R * 0.12, Math.sin(a - 0.06) * R * 0.12); g.lineTo(Math.cos(a) * R, Math.sin(a) * R); g.lineTo(Math.cos(a + 0.06) * R * 0.12, Math.sin(a + 0.06) * R * 0.12); } g.fill(); });
    cell('note', g => { g.save(); g.rotate(-0.25); g.beginPath(); g.ellipse(-R * 0.22, R * 0.45, R * 0.28, R * 0.2, -0.4, 0, 6.2832); g.fill(); g.fillRect(R * 0.02, -R * 0.75, R * 0.1, R * 1.2); g.beginPath(); g.moveTo(R * 0.12, -R * 0.75); g.quadraticCurveTo(R * 0.55, -R * 0.45, R * 0.4, -R * 0.05); g.quadraticCurveTo(R * 0.4, -R * 0.4, R * 0.12, -R * 0.45); g.fill(); g.restore(); });
    cell('ribbon', g => { const gr = g.createLinearGradient(-CS / 2, 0, CS / 2, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.3, 'rgba(255,255,255,.35)'); gr.addColorStop(0.45, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,1)'); gr.addColorStop(0.7, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(-CS / 2, -CS / 2, CS, CS); });
    cell('beam', g => { for (let y = -CS / 2; y < CS / 2; y += 2) { const k = (y + CS / 2) / CS, a = Math.pow(k, 1.6);   // top (y=-) transparent -> bottom bright
      const gr = g.createLinearGradient(-CS / 2, 0, CS / 2, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(255,255,255,${a})`); gr.addColorStop(0.36, `rgba(255,255,255,${a * 0.45})`); gr.addColorStop(0.64, `rgba(255,255,255,${a * 0.45})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(-CS / 2, y, CS, 2); } });
    cell('swirl', g => strokeGlow(g, 5, () => { for (let k = 0; k < 3; k++) { g.beginPath(); for (let i = 0; i <= 40; i++) { const t = i / 40, a = k * 2.0944 + t * 3.2, r = R * (0.15 + 0.78 * t); if (i) g.lineTo(Math.cos(a) * r, Math.sin(a) * r); else g.moveTo(Math.cos(a) * r, Math.sin(a) * r); } g.stroke(); } }));
    cell('shard', g => { g.beginPath(); g.moveTo(0, -R * 0.95); g.lineTo(R * 0.28, 0); g.lineTo(0, R * 0.95); g.lineTo(-R * 0.28, 0); g.closePath(); g.globalAlpha = 0.55; g.fill(); g.globalAlpha = 1; g.lineWidth = 4; g.stroke(); g.beginPath(); g.moveTo(0, -R * 0.95); g.lineTo(0, R * 0.95); g.stroke(); });
    // telegraph fills sampled as (u, v): cone (u = angle 0..1, v = radius 0..1), lane (u = across, v = along), bar
    const strip = (g, fn) => { const i = cellN - 1, im = g.createImageData(CS, CS), d = im.data;   // putImageData ignores the cell transform
      for (let y = 0; y < CS; y++) for (let x = 0; x < CS; x++) { const o = (y * CS + x) * 4; d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = clamp(fn((x + 0.5) / CS, 1 - (y + 0.5) / CS), 0, 1) * 255; }
      g.putImageData(im, (i % CN) * CS, Math.floor(i / CN) * CS); };
    cell('coneBase', g => strip(g, (u, v) => 0.55 + 0.45 * Math.max(Math.exp(-u * 30), Math.exp(-(1 - u) * 30), Math.exp(-(1 - v) * 30))));
    cell('coneEdge', g => strip(g, (u, v) => Math.max(Math.exp(-u * 30), Math.exp(-(1 - u) * 30), Math.exp(-(1 - v) * 26)) * (0.35 + 0.65 * v)));
    cell('coneFill', g => strip(g, (u, v) => 0.03 + 0.07 * v + Math.exp(-(1 - v) * 14) * 0.95));
    cell('laneEdge', g => strip(g, (u, v) => Math.max(Math.exp(-u * 24), Math.exp(-(1 - u) * 24))));
    cell('chev', g => strip(g, (u, v) => { const d = Math.abs(v - 0.35 - (0.5 - Math.abs(u - 0.5)) * 0.9); return Math.exp(-d * d * 160) * (1 - Math.pow(Math.abs(u - 0.5) * 2, 4)); }));
    cell('bar', g => strip(g, (u, v) => Math.exp(-Math.pow((v - 0.5) * 5, 2)) * (1 - Math.pow(Math.abs(u - 0.5) * 2, 6))));
    // '?' quest rune: white fill, dark outline (tinted by the vertex colour in the normal-blend batch)
    cell('qmark', g => { g.font = `900 ${R * 1.6}px Georgia, 'Times New Roman', serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.lineWidth = 22; g.strokeStyle = 'rgba(26,16,8,1)'; g.strokeText('?', 0, R * 0.08); g.fillStyle = '#fff'; g.fillText('?', 0, R * 0.08); });
    // round 7: Bear-Skin Rage claw marks, the Foresight eye, a weakened / armour-broken shield, the Seidr hex bind-rune
    cell('claw', g => { for (let i = -1; i <= 1; i++) { const ox = i * R * 0.34; g.beginPath(); g.moveTo(ox - R * 0.42, -R * 0.82); g.quadraticCurveTo(ox + R * 0.12, -R * 0.1, ox + R * 0.36, R * 0.84); g.quadraticCurveTo(ox - R * 0.02, -R * 0.02, ox - R * 0.42, -R * 0.82); g.closePath();
      g.save(); g.shadowColor = '#fff'; g.shadowBlur = 14; g.lineWidth = 9; g.stroke(); g.restore(); g.fill(); } });
    cell('eye', g => { strokeGlow(g, 7, () => { g.beginPath(); g.moveTo(-R * 0.9, 0); g.quadraticCurveTo(0, -R * 0.78, R * 0.9, 0); g.quadraticCurveTo(0, R * 0.78, -R * 0.9, 0); g.stroke(); circ(g, R * 0.33); g.stroke(); });
      g.beginPath(); g.arc(0, 0, R * 0.16, 0, 6.2832); g.fill(); for (let i = 0; i < 5; i++) { const a = -2.4 + i * 0.4; g.lineWidth = 5; g.beginPath(); g.moveTo(Math.cos(a) * R * 0.62, Math.sin(a) * R * 0.5 - R * 0.08); g.lineTo(Math.cos(a) * R * 0.9, Math.sin(a) * R * 0.75 - R * 0.1); g.stroke(); } });
    cell('brokenShield', g => {
      const sh = () => { g.beginPath(); g.moveTo(-R * 0.66, -R * 0.74); g.lineTo(R * 0.66, -R * 0.74); g.lineTo(R * 0.66, -R * 0.12); g.quadraticCurveTo(R * 0.6, R * 0.55, 0, R * 0.92); g.quadraticCurveTo(-R * 0.6, R * 0.55, -R * 0.66, -R * 0.12); g.closePath(); };
      g.globalAlpha = 0.35; sh(); g.fill(); g.globalAlpha = 1; strokeGlow(g, 8, () => { sh(); g.stroke(); });
      g.globalCompositeOperation = 'destination-out'; g.lineWidth = 16; g.beginPath(); g.moveTo(R * 0.1, -R * 0.95); g.lineTo(-R * 0.14, -R * 0.36); g.lineTo(R * 0.16, -R * 0.02); g.lineTo(-R * 0.12, R * 0.42); g.lineTo(R * 0.06, R * 1.05); g.stroke();
      g.globalCompositeOperation = 'source-over'; });
    cell('seidr', g => { strokeGlow(g, 5, () => { circ(g, R * 0.93); g.stroke(); });
      strokeGlow(g, 8, () => { g.beginPath(); g.moveTo(0, -R * 0.74); g.lineTo(0, R * 0.74); g.moveTo(0, -R * 0.2); g.lineTo(-R * 0.44, -R * 0.62); g.moveTo(0, -R * 0.2); g.lineTo(R * 0.44, -R * 0.62);
        g.moveTo(0, R * 0.2); g.lineTo(-R * 0.44, R * 0.62); g.moveTo(0, R * 0.2); g.lineTo(R * 0.44, R * 0.62); g.moveTo(-R * 0.36, -R * 0.08); g.lineTo(R * 0.36, R * 0.08); g.stroke(); });
      for (const sx of [-1, 1]) { g.beginPath(); g.arc(sx * R * 0.55, R * 0.02, R * 0.075, 0, 6.2832); g.fill(); } });
    for (const rn of RUNE_KEYS) cell('rune:' + rn, g => strokeGlow(g, 11, () => { runePath(g, rn, R * 1.5); g.stroke(); }));
    if (cellN > CN * CN && typeof console !== 'undefined') console.warn('[vfx] atlas overflow: ' + cellN + ' cells');
    const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.LinearEncoding; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    return tex;
  }
  // pixel atlas: Huginn (4 wing frames, 32 px), the thrown spear (96 x 16), nearest filtering
  const PX = { raven: [], spear: null };
  function paintPixels() {
    const c = mkCanvas(128, 64), g = c.getContext('2d');
    for (let f = 0; f < 4; f++) {
      g.save(); g.translate(f * 32 + 16, 17);
      const up = [-9, -3, 4, -2][f];
      g.fillStyle = '#1c1d2c'; g.beginPath(); g.moveTo(-3, -1); g.lineTo(-13, up); g.lineTo(-10, up + 4); g.lineTo(-2, 3); g.fill();           // far wing
      g.fillStyle = '#23243a'; g.beginPath(); g.ellipse(0, 1, 8, 4.5, -0.15, 0, 6.2832); g.fill();                                            // body
      g.beginPath(); g.moveTo(-7, 1); g.lineTo(-13, -1); g.lineTo(-13, 5); g.fill();                                                           // tail
      g.fillStyle = '#2c2e4a'; g.beginPath(); g.arc(7, -2, 3.6, 0, 6.2832); g.fill();                                                        // head
      g.fillStyle = '#3a3a3a'; g.beginPath(); g.moveTo(10, -3); g.lineTo(15, -1); g.lineTo(10, 0); g.fill();                                   // beak
      g.fillStyle = '#34375a'; g.beginPath(); g.moveTo(-1, -1); g.lineTo(-8, up - 4); g.lineTo(-4, up - 1); g.lineTo(3, 0); g.fill();       // near wing
      g.fillStyle = '#5a6aa8'; g.fillRect(-6, up - 3, 3, 1);
      g.fillStyle = '#e8f0ff'; g.fillRect(8, -3, 1, 1);
      g.restore(); PX.raven.push([f * 32 / 128, 1 - 32 / 64, (f + 1) * 32 / 128, 1]);
    }
    g.save(); g.translate(0, 40);
    g.fillStyle = '#6a4424'; g.fillRect(2, 3, 70, 3); g.fillStyle = '#8a5a30'; g.fillRect(2, 3, 70, 1);
    g.fillStyle = '#d8b050'; g.fillRect(70, 2, 3, 5);
    g.fillStyle = '#c8ccd8'; g.beginPath(); g.moveTo(73, 1); g.lineTo(92, 4.5); g.lineTo(73, 8); g.fill(); g.fillStyle = '#ffffff'; g.fillRect(74, 4, 14, 1);
    g.restore(); PX.spear = [0, 1 - 52 / 64, 96 / 128, 1 - 36 / 64];
    if (typeof pixelize === 'function') pixelize(c, [16, 12, 20]);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.LinearEncoding; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; return t;
  }

  /* ---------- quad batches ---------- */
  const QVS = `attribute vec4 vcol; varying vec2 vUv; varying vec4 vC;
    void main() { vUv = uv; vC = vcol; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const QFS = `uniform sampler2D map; uniform float uLin; varying vec2 vUv; varying vec4 vC;
    void main() {
      vec4 t = texture2D(map, vUv);
    #ifdef VFX_PIXEL
      if (t.a < 0.5) discard; t.a = 1.0; if (uLin > 0.5) t.rgb = pow(t.rgb, vec3(2.2));
    #endif
      gl_FragColor = vec4(t.rgb * vC.rgb, t.a * vC.a);
      #include <tonemapping_fragment>
      #include <encodings_fragment>
    }`;
  const QB = [];
  function qbatch(o) {
    const mat = new THREE.ShaderMaterial({ uniforms: { map: { value: null }, uLin: { value: 0 } }, vertexShader: QVS, fragmentShader: QFS, transparent: true, depthWrite: !!o.pixel, depthTest: o.depth !== false,
      blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending, side: THREE.DoubleSide, defines: o.pixel ? { VFX_PIXEL: '' } : {} });
    // ground decals follow the terrain (per-vertex groundH) and depth-test against walls, props and canopies; the
    // polygon offset keeps them on top of the terrain they were sampled from
    if (o.ground) { mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -6; }
    const B = { n: 0, cap: 0, mesh: null, pos: null, uv: null, col: null, mat, order: o.order, pixel: !!o.pixel, warm: 0 };
    qalloc(B, o.cap || 128); QB.push(B); return B;
  }
  function qalloc(B, cap) {
    const geo = new THREE.BufferGeometry(), pos = new Float32Array(cap * 12), uv = new Float32Array(cap * 8), col = new Float32Array(cap * 16);
    if (B.pos) { pos.set(B.pos); uv.set(B.uv); col.set(B.col); }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('vcol', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
    const idx = new (cap * 4 > 65535 ? Uint32Array : Uint16Array)(cap * 6);
    for (let q = 0; q < cap; q++) { const o = q * 6, v = q * 4; idx[o] = v; idx[o + 1] = v + 2; idx[o + 2] = v + 1; idx[o + 3] = v + 2; idx[o + 4] = v + 3; idx[o + 5] = v + 1; }
    geo.setIndex(new THREE.BufferAttribute(idx, 1)); geo.setDrawRange(0, 0);
    if (B.mesh) { B.mesh.geometry.dispose(); B.mesh.geometry = geo; }
    else { B.mesh = new THREE.Mesh(geo, B.mat); B.mesh.frustumCulled = false; B.mesh.renderOrder = B.order; B.mesh.visible = false; scene.add(B.mesh); }
    B.cap = cap; B.pos = pos; B.uv = uv; B.col = col;
  }
  let GA, GN, BA, BN, PB;
  // one vertex: k = vertex index in the batch
  function vx(B, k, x, y, z, u, v, c, a) { const p = B.pos, t = B.uv, q = B.col, i3 = k * 3, i2 = k * 2, i4 = k * 4; p[i3] = x; p[i3 + 1] = y; p[i3 + 2] = z; t[i2] = u; t[i2 + 1] = v; q[i4] = c[0]; q[i4 + 1] = c[1]; q[i4 + 2] = c[2]; q[i4 + 3] = a; }
  function qpush(B) { if (B.n >= B.cap) qalloc(B, B.cap * 2); return (B.n++) * 4; }
  // Generic quad: corners TL, TR, BL, BR (world x, height, world y), uv rect uv = [u0, v0, u1, v1] with sub-range (su0..su1, sv0..sv1)
  function quad(B, uv, x0, y0, z0, x1, y1, z1, x2, y2, z2, x3, y3, z3, c, a, a2, su0, su1, sv0, sv1) {
    const k = qpush(B), du = uv[2] - uv[0], dv = uv[3] - uv[1];
    const U0 = uv[0] + du * (su0 === undefined ? 0 : su0), U1 = uv[0] + du * (su1 === undefined ? 1 : su1), V0 = uv[1] + dv * (sv0 === undefined ? 0 : sv0), V1 = uv[1] + dv * (sv1 === undefined ? 1 : sv1);
    const b = a2 === undefined ? a : a2;
    vx(B, k, x0, y0, z0, U0, V1, c, a); vx(B, k + 1, x1, y1, z1, U1, V1, c, a); vx(B, k + 2, x2, y2, z2, U0, V0, c, b); vx(B, k + 3, x3, y3, z3, U1, V0, c, b);
  }
  /* Terrain-conforming ground quad: corners (x, y) TL, TR, BL, BR (bilinear), subdivided nu x nv, each vertex at
     groundH + lift; uv sub-rect (su0..su1, sv0..sv1) of the cell. a = alpha at the TL/TR edge, a2 at BL/BR. */
  function gquad(B, uv, x0, y0, x1, y1, x2, y2, x3, y3, lift, c, a, a2, su0, su1, sv0, sv1, nu, nv) {
    const du = uv[2] - uv[0], dv = uv[3] - uv[1];
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const k = qpush(B);
      for (let q = 0; q < 4; q++) {
        const fu = (i + (q & 1)) / nu, fv = (j + (q >> 1)) / nv;                 // fv: 0 at the TL/TR edge
        const tx = x0 + (x1 - x0) * fu, ty = y0 + (y1 - y0) * fu, bx = x2 + (x3 - x2) * fu, by = y2 + (y3 - y2) * fu, px = tx + (bx - tx) * fv, py = ty + (by - ty) * fv;
        const U = uv[0] + du * (su0 + (su1 - su0) * fu), Vv = uv[1] + dv * (sv1 + (sv0 - sv1) * fv);
        vx(B, k + q, px, groundH(px, py) + lift, py, U, Vv, c, a + (a2 - a) * fv);
      }
    }
  }
  const segs = r => r < 0.9 ? 1 : Math.min(6, Math.ceil(r * 1.4));
  // Ground quad centred at (x, y), half size r, texture 'up' along angle ang; h: height at the centre (its offset above
  // the terrain there is kept as the lift over the whole quad)
  function ground(B, cell, x, y, h, r, ang, c, a, ry) {
    if (a <= 0.003 || r <= 0) return; const uv = cellUV(CELL[cell]), rx = Math.cos(ang), rz = Math.sin(ang), ux = Math.sin(ang), uz = -Math.cos(ang), r2 = ry || r, n = segs(Math.max(r, r2));
    gquad(B, uv, x - rx * r + ux * r2, y - rz * r + uz * r2, x + rx * r + ux * r2, y + rz * r + uz * r2, x - rx * r - ux * r2, y - rz * r - uz * r2, x + rx * r - ux * r2, y + rz * r - uz * r2,
      Math.max(0.02, h - groundH(x, y)), c, a, a, 0, 1, 0, 1, n, n);
  }
  const CR = new THREE.Vector3(), CU = new THREE.Vector3(), CP = new THREE.Vector3(), HR = new THREE.Vector3();
  function bill(B, cell, x, y, h, w, hh, rot, c, a) {
    if (a <= 0.003) return; const uv = typeof cell === 'number' ? cellUV(cell) : cellUV(CELL[cell]);
    const cs = Math.cos(rot || 0), sn = Math.sin(rot || 0);
    const rx = (CR.x * cs + CU.x * sn) * w, ry = (CR.y * cs + CU.y * sn) * w, rz = (CR.z * cs + CU.z * sn) * w;
    const ux = (-CR.x * sn + CU.x * cs) * hh, uy = (-CR.y * sn + CU.y * cs) * hh, uz = (-CR.z * sn + CU.z * cs) * hh;
    quad(B, uv, x - rx + ux, h - ry + uy, y - rz + uz, x + rx + ux, h + ry + uy, y + rz + uz, x - rx - ux, h - ry - uy, y - rz - uz, x + rx - ux, h + ry - uy, y + rz - uz, c, a);
  }
  // Cylindrical billboard (faces the camera around the vertical): light pillars. a0 at the base, a1 at the top.
  function pillarQ(B, cell, x, y, h, w, hgt, c, a0, a1) {
    if (a0 <= 0.003 && a1 <= 0.003) return; const uv = cellUV(CELL[cell]), rx = HR.x * w / 2, rz = HR.z * w / 2;
    quad(B, uv, x - rx, h + hgt, y - rz, x + rx, h + hgt, y + rz, x - rx, h, y - rz, x + rx, h, y + rz, c, a1, a0);
  }
  // Camera-facing ribbon through n points P[3i..] (x, height, y) with widths W[i] and alphas A[i]; texture 'ribbon'.
  const RP = new Float32Array(96), RW = new Float32Array(32), RA = new Float32Array(32), RS = new Float32Array(96);
  function ribbon(B, n, c, cell) {
    if (n < 2) return; const uv = cellUV(CELL[cell || 'ribbon']);
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      const tx = RP[b * 3] - RP[a * 3], ty = RP[b * 3 + 1] - RP[a * 3 + 1], tz = RP[b * 3 + 2] - RP[a * 3 + 2];
      const vx_ = CP.x - RP[i * 3], vy_ = CP.y - RP[i * 3 + 1], vz_ = CP.z - RP[i * 3 + 2];
      let sx = ty * vz_ - tz * vy_, sy = tz * vx_ - tx * vz_, sz = tx * vy_ - ty * vx_; const L = Math.hypot(sx, sy, sz) || 1, k = RW[i] / 2 / L;
      RS[i * 3] = sx * k; RS[i * 3 + 1] = sy * k; RS[i * 3 + 2] = sz * k;
    }
    for (let i = 0; i < n - 1; i++) {
      const j = i + 1, p = RP, s = RS, i3 = i * 3, j3 = j * 3;
      quad(B, uv, p[i3] + s[i3], p[i3 + 1] + s[i3 + 1], p[i3 + 2] + s[i3 + 2], p[i3] - s[i3], p[i3 + 1] - s[i3 + 1], p[i3 + 2] - s[i3 + 2],
        p[j3] + s[j3], p[j3 + 1] + s[j3 + 1], p[j3 + 2] + s[j3 + 2], p[j3] - s[j3], p[j3 + 1] - s[j3 + 1], p[j3 + 2] - s[j3 + 2], c, RA[i], RA[j], 0, 1, 0.45, 0.55);
    }
  }
  function flush() {
    for (const B of QB) {
      const g = B.mesh.geometry, n = B.n;
      g.setDrawRange(0, n * 6); B.mesh.visible = (n > 0 || B.warm < 3) && !(V.hide & (1 << QB.indexOf(B))); B.warm++;
      if (!n) continue;
      for (const k of ['position', 'uv', 'vcol']) { const at = g.attributes[k]; at.updateRange.offset = 0; at.updateRange.count = n * 4 * at.itemSize; at.needsUpdate = true; }
      B.mat.uniforms.uLin.value = sprLinear() ? 1 : 0;
    }
  }

  /* ---------- fresnel spheres (Kyrie bubble, Norn ward dome) ---------- */
  const SPH_GEO = new THREE.SphereGeometry(1, 28, 18);
  const SPH = [];
  function sphereMat() {
    return new THREE.ShaderMaterial({ uniforms: { uCol: { value: new THREE.Color() }, uA: { value: 0.5 }, uT: { value: 0 }, uBand: { value: 6 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec3 vN; varying vec3 vV; varying float vY; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vY = position.y; gl_Position = projectionMatrix * mv; }',
      fragmentShader: `uniform vec3 uCol; uniform float uA, uT, uBand; varying vec3 vN; varying vec3 vV; varying float vY;
        void main() { float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.4);
          float b = smoothstep(0.82, 1.0, 0.5 + 0.5 * sin(vY * uBand * 6.2832 - uT * 2.2));
          gl_FragColor = vec4(uCol * (0.35 + 1.4 * f), uA * (0.05 + 0.85 * f + 0.35 * b * (0.3 + f)));
          #include <tonemapping_fragment>
          #include <encodings_fragment>
        }` });
  }
  let sphN = 0;
  function sphere(x, h, y, r, ry, hex, a, band) {
    let m = SPH[sphN]; if (!m) { m = new THREE.Mesh(SPH_GEO, sphereMat()); m.renderOrder = 3; m.frustumCulled = false; scene.add(m); SPH.push(m); }
    sphN++; m.visible = true; m.position.set(x, h, y); m.scale.set(r, ry, r); const u = m.material.uniforms; const c = lc(hex); u.uCol.value.setRGB(c[0], c[1], c[2]); u.uA.value = a; u.uT.value = time; u.uBand.value = band || 5;
  }

  /* ---------- helpers ---------- */
  let dt = 0.016, yawA = 0, q = 1;
  const rate = n => { const x = n * dt * q; return Math.floor(x) + (Math.random() < x - Math.floor(x) ? 1 : 0); };   // particles this frame for n per second
  const hsh = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
  const WHITE = [1, 1, 1];
  function motes(x, y, h, r, n, hex, up, size, soft) {
    const k = rate(n); if (!k) return; const c = srgb(hex);
    for (let i = 0; i < k; i++) { const a = Math.random() * 6.2832, d = Math.sqrt(Math.random()) * r; PFX.emit(soft !== false, x + Math.cos(a) * d, h + 0.05 + Math.random() * 0.2, y + Math.sin(a) * d, 0, up * (0.6 + Math.random() * 0.8), 0, 0.1, 0.4, 0.9 + Math.random() * 0.9, c[0], c[1], c[2], 0.85, size, size * 0.3, 1.5); }
  }
  function runeGround(rn, x, y, h, s, c, a) { if (rn && CELL['rune:' + rn] !== undefined) ground(GA, 'rune:' + rn, x, y, h, s, yawA, c, a); }
  function runeBill(rn, x, y, h, s, c, a) { const i = CELL['rune:' + rn]; if (i !== undefined) bill(BA, i, x, y, h, s * 0.62, s, 0, c, a); }

  /* ---------- zones ---------- */
  function zoneLife(z) { return z.trap ? 1 : clamp(Math.min(z.t / 0.25, (z.dur - z.t) / 0.4), 0, 1); }
  function drawZone(z) {
    const life = zoneLife(z), gh = groundH(z.x, z.y) + 0.05, c = lc(z.col || '#ffffff'), pulse = 0.5 + 0.5 * Math.sin(time * 4 + z.x * 1.3), r = z.r, t = time, pop = 1 + 0.25 * Math.exp(-z.t * 10);
    if (z.trap) {
      const armed = z.t >= (z.arm || 0), a = armed ? 0.75 + 0.25 * pulse : 0.35;
      ground(GN, 'disc', z.x, z.y, gh - 0.01, 0.62, 0, lc('#000000'), 0.28);
      ground(GA, 'trap', z.x, z.y, gh, 0.58 * pop, t * 0.25 + z.x, c, a);
      ground(GA, 'glow', z.x, z.y, gh, 0.8, 0, c, 0.18 + 0.12 * pulse);
      runeGround(z.rune, z.x, z.y, gh + 0.01, 0.3, c, armed ? 0.95 : 0.5);
      if (armed && Math.random() < dt * 1.5) motes(z.x, z.y, gh, 0.3, 60, z.col, 0.8, 0.06, false);
      return;
    }
    if (z.hostile) {   // enemy hex: boiling violet pool, spiked rim, dark wisps
      ground(GN, 'mud', z.x, z.y, gh - 0.01, r * 1.05, t * 0.15, lc('#1a0822'), 0.62 * life);
      ground(GA, 'hex', z.x, z.y, gh, r * (0.98 + 0.03 * pulse) * pop, -t * 0.4, c, (0.75 + 0.2 * pulse) * life);
      ground(GA, 'glow', z.x, z.y, gh, r * 1.15, 0, c, 0.22 * life);
      runeGround(z.rune, z.x, z.y, gh + 0.01, r * 0.42, lc('#e8c8ff'), 0.8 * life);
      if (q > 0.4) { const k = rate(14 * r); const cc = srgb('#2a0a34'); for (let i = 0; i < k; i++) { const a = Math.random() * 6.2832, d = Math.sqrt(Math.random()) * r * 0.9; PFX.emitDark(z.x + Math.cos(a) * d, gh + 0.1, z.y + Math.sin(a) * d, 0, 0.5 + Math.random() * 0.6, 0, 0.12, 0.6, 1 + Math.random() * 0.6, cc[0], cc[1], cc[2], 0.75, 0.16, 0.3, 1.2); } }
      motes(z.x, z.y, gh, r * 0.9, 10 * r, z.col, 1.1, 0.08, false);
      if (!FB_SEEN.has(z)) { if (fbSpawn('shadow_smoke', z.x, z.y, gh, fbo(r / 1.4))) FB_SEEN.add(z); }
      else if (Math.random() < dt * 0.9 * life) { const a = Math.random() * 6.2832, d = Math.random() * r * 0.6; fbSpawn('shadow_smoke', z.x + Math.cos(a) * d, z.y + Math.sin(a) * d, gh, fbo(0.45 + Math.random() * 0.25, null, 0.85)); }
      return;
    }
    switch (z.kind) {
      case 'storm': {
        ground(GN, 'disc', z.x, z.y, gh - 0.02, r, 0, lc('#dcecff'), 0.07 * life);
        ground(GA, 'frostCircle', z.x, z.y, gh, r * 1.04 * pop, t * 0.3, c, 0.75 * life);
        ground(GA, 'swirl', z.x, z.y, gh + 0.01, r * 0.95, -t * 2.6, c, 0.4 * life);
        ground(GA, 'swirl', z.x, z.y, gh + 0.02, r * 0.6, -t * 3.4 + 1, c, 0.3 * life);
        // blizzard: snow whipped around the centre, a few ice shards
        const k = rate(240 * r / 3 * life), cc = srgb('#f2faff');
        for (let i = 0; i < k; i++) { const a = Math.random() * 6.2832, d = 0.3 + Math.random() * r, hh = gh + 0.2 + Math.random() * 3, sp = 3 + Math.random() * 3;
          PFX.emit(true, z.x + Math.cos(a) * d, hh, z.y + Math.sin(a) * d, -Math.sin(a) * sp - Math.cos(a) * 0.8, -0.4 - Math.random() * 0.8, Math.cos(a) * sp - Math.sin(a) * 0.8, 0, 0.8, 0.5 + Math.random() * 0.5, cc[0], cc[1], cc[2], 1, 0.1 + Math.random() * 0.08, 0.05, 0); }
        // gust sheets: pale wind bands sweeping round the storm's eye
        for (let i = 0; i < 3; i++) { const a0 = -t * 2.4 + i * 2.094; for (let k2 = 0; k2 < 7; k2++) { const a = a0 - k2 * 0.16, rr = r * (0.55 + 0.12 * i); RP[k2 * 3] = z.x + Math.cos(a) * rr; RP[k2 * 3 + 1] = gh + 0.5 + i * 0.6 + Math.sin(t * 3 + i) * 0.15; RP[k2 * 3 + 2] = z.y + Math.sin(a) * rr; RW[k2] = 0.35 * (1 - k2 / 7); RA[k2] = 0.4 * life * (1 - k2 / 7); } ribbon(BA, 7, c); }
        const k2 = rate(16 * life), ci = srgb('#9fd8ff');
        for (let i = 0; i < k2; i++) { const a = Math.random() * 6.2832, d = Math.random() * r * 0.9; PFX.emit(false, z.x + Math.cos(a) * d, gh + 0.1, z.y + Math.sin(a) * d, 0, 2 + Math.random() * 2, 0, -5, 0.5, 0.5, ci[0], ci[1], ci[2], 1, 0.1, 0.04, 0); }
        break;
      }
      case 'vermilion': {
        ground(GN, 'disc', z.x, z.y, gh - 0.02, r * 1.1, 0, lc('#000000'), 0.3 * life);   // the storm cloud's shadow
        ground(GA, 'boltCircle', z.x, z.y, gh, r * 1.02 * pop, t * 0.2, c, (0.55 + 0.4 * pulse) * life);
        ground(GA, 'glow', z.x, z.y, gh, r * 1.2, 0, c, 0.18 * life);
        runeGround(z.rune, z.x, z.y, gh + 0.01, r * 0.3, c, 0.7 * life);
        // the storm cloud: a dark churn with lightning glow inside, above the zone
        const flash = Math.max(0, Math.sin(t * 23 + z.x) * Math.sin(t * 7.1)) ;
        bill(BA, 'glow', z.x, z.y, gh + 7, r * 1.6, r * 0.7, 0, c, (0.12 + 0.5 * flash) * life);
        if (Math.random() < dt * 6 * life) { const a = Math.random() * 6.2832, d = Math.random() * r; bolt(z.x + Math.cos(a) * d, z.y + Math.sin(a) * d, 7, z.x + Math.cos(a) * d + rand(-0.6, 0.6), z.y + Math.sin(a) * d + rand(-0.6, 0.6), 0.2, '#fff6a0', 0.12, 0.5); }
        break;
      }
      case 'quagmire': {
        const mc = lc('#4a3418');
        ground(GN, 'mud', z.x, z.y, gh - 0.01, r * 1.02, t * 0.05 + z.x, mc, 0.9 * life);
        ground(GN, 'mud', z.x, z.y, gh, r * 0.8, -t * 0.07 + z.y, lc('#6a4c24'), 0.55 * life);
        ground(GA, 'runeCircle', z.x, z.y, gh + 0.01, r * 1.04, t * 0.12, c, 0.3 * life);
        runeGround(z.rune, z.x, z.y, gh + 0.02, r * 0.3, c, 0.35 * life);
        // bubbles: rings that grow and pop at hashed spots
        for (let i = 0; i < 7; i++) { const ph = (t * 0.7 + i / 7) % 1, cyc = Math.floor(t * 0.7 + i / 7), a = hsh(i, cyc) * 6.2832, d = Math.sqrt(hsh(cyc, i + 3)) * r * 0.8;
          ground(GN, 'ring', z.x + Math.cos(a) * d, z.y + Math.sin(a) * d, gh + 0.02, 0.08 + ph * 0.22, 0, lc('#c8a870'), (1 - ph) * 0.8 * life); }
        if (q > 0.4) { const k = rate(6 * r * life), cc = srgb('#3a2a14'); for (let i = 0; i < k; i++) { const a = Math.random() * 6.2832, d = Math.random() * r * 0.8; PFX.emitDark(z.x + Math.cos(a) * d, gh + 0.05, z.y + Math.sin(a) * d, rand(-0.4, 0.4), 1.2 + Math.random(), rand(-0.4, 0.4), -6, 0.3, 0.45, cc[0], cc[1], cc[2], 1, 0.07, 0.05, 0); } }
        break;
      }
      case 'sanctuary': {
        ground(GA, 'glow', z.x, z.y, gh, r * 1.3, 0, c, 0.3 * life);
        ground(GA, 'holyCircle', z.x, z.y, gh + 0.01, r * pop, t * 0.18, c, (0.65 + 0.3 * pulse) * life);
        runeGround(z.rune, z.x, z.y, gh + 0.02, r * 0.28, lc('#ffffff'), 0.75 * life);
        pillarQ(BA, 'beam', z.x, z.y, gh, r * 1.7, 4.2, c, 0.3 * life, 0);
        motes(z.x, z.y, gh, r * 0.95, 26 * r * life, '#e8ffd8', 1.1, 0.1);
        // healing light: sparkle loops over the ground (flipbook heal_sparkles), three phases
        if (!z.ward && fbLoop('heal_sparkles', z.x, z.y, gh, r / 2.2, WHITE, 0.85 * life, 0, z.x * 7)) for (let i = 0; i < 2; i++) { const a = z.y + i * 3.1416; fbLoop('heal_sparkles', z.x + Math.cos(a) * r * 0.55, z.y + Math.sin(a) * r * 0.55, gh, r / 3.2, WHITE, 0.7 * life, 0, 5 + i * 4); }
        break;
      }
      case 'thurisaz': {   // Rune Jarl: the thorn-rune carved in the ground, charging for 0.75 s, then Thor's lightning
        const k = clamp(z.t / Math.max(0.1, z.dur), 0, 1), hot = smoothstep(0.45, 1, k), fl = 0.6 + 0.4 * Math.sin(t * (20 + 40 * hot) + z.x), cw = lc('#fff6c8');
        if (!fbLoop('rune_circle', z.x, z.y, gh, r * 2 / 5.333 * 1.02 * pop, c, (0.55 + 0.45 * hot) * life, t * (0.8 + 2 * hot), z.x * 3)) ground(GA, 'boltCircle', z.x, z.y, gh, r * 1.02 * pop, t * 0.5, c, (0.55 + 0.4 * hot) * life);
        ground(GA, 'glow', z.x, z.y, gh, r * 1.25, 0, c, (0.14 + 0.36 * hot) * life);
        runeGround(z.rune || 'ᚦ', z.x, z.y, gh + 0.02, r * (0.46 + 0.1 * hot), cw, (0.45 + 0.55 * hot * fl) * life);
        runeBill(z.rune || 'ᚦ', z.x, z.y, gh + 1 + hot * 0.7, 0.75 + 0.55 * hot, c, (0.3 + 0.7 * hot) * fl * life);
        if (Math.random() < dt * (6 + 34 * hot)) { const a = Math.random() * 6.2832, a2 = a + rand(0.35, 1), rr = r * rand(0.55, 0.98); bolt(z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr, gh + 0.12, z.x + Math.cos(a2) * rr, z.y + Math.sin(a2) * rr, gh + 0.12, '#fff6a0', 0.09, 0.28); }
        motes(z.x, z.y, gh, r * 0.9, 12 * r * life * (0.3 + hot), z.col || '#ffe070', 1.8, 0.07, false);
        break;
      }
      case 'void': {       // Galdr Master: Ginnungagap, the yawning gap drinking the ground and everything on it inward
        const dk = lc('#07020e'), vl = lc('#e2d0ff');
        ground(GN, 'disc', z.x, z.y, gh - 0.015, r * 1.06 * pop, 0, dk, 0.72 * life);
        ground(GN, 'swirl', z.x, z.y, gh - 0.01, r * 0.98, t * 1.7, dk, 0.85 * life);
        ground(GA, 'swirl', z.x, z.y, gh, r * 1.02 * pop, t * 2.7, c, 0.6 * life);
        ground(GA, 'swirl', z.x, z.y, gh + 0.01, r * 0.62, t * 4 + 1.3, vl, 0.42 * life);
        ground(GA, 'ring', z.x, z.y, gh + 0.01, r * (1.03 - 0.05 * pulse), 0, c, 0.7 * life);
        ground(GA, 'glow', z.x, z.y, gh, r * 1.3, 0, c, 0.12 * life);
        runeGround(z.rune || 'ᛜ', z.x, z.y, gh + 0.02, r * 0.2, vl, 0.55 * life * (0.6 + 0.4 * pulse));
        bill(BN, 'core', z.x, z.y, gh + 0.35, r * 0.34, r * 0.22, 0, dk, 0.55 * life);
        if (q > 0.3) { const n = rate(38 * r * life), cc = srgb('#c0a0ff');   // matter spiralling in from the rim
          for (let i = 0; i < n; i++) { const a = Math.random() * 6.2832, d = r * (0.85 + Math.random() * 0.3), sp = 2.4 + Math.random() * 1.2, ux = -Math.cos(a), uy = -Math.sin(a);
            PFX.emit(false, z.x - ux * d, gh + 0.08 + Math.random() * 0.45, z.y - uy * d, (ux - uy * 0.9) * sp, 0.15, (uy + ux * 0.9) * sp, 0, 0.3, d / sp * 0.75, cc[0], cc[1], cc[2], 0.95, 0.08, 0.02, 0); } }
        if (Math.random() < dt * 2.4 * life) { const a = Math.random() * 6.2832, d = Math.random() * r * 0.7; fbSpawn('shadow_smoke', z.x + Math.cos(a) * d, z.y + Math.sin(a) * d, gh, fbo(0.45 + Math.random() * 0.3, null, 0.9)); }
        break;
      }
      case 'verse': {      // Voice of Bragi: a verse ringing out around the skald (follows the hero)
        ground(GA, 'ringDash', z.x, z.y, gh, r * pop, t * 0.5, c, 0.5 * life);
        ground(GA, 'ringDash', z.x, z.y, gh + 0.005, r * 0.7, -t * 0.75, c, 0.32 * life);
        ground(GA, 'glow', z.x, z.y, gh, r * 1.1, 0, c, 0.08 * life);
        for (let i = 0; i < 3; i++) { const ph = (t * 1.1 + i / 3) % 1; ground(GA, 'ring', z.x, z.y, gh + 0.01, r * (0.22 + 0.82 * ph), 0, c, 0.6 * (1 - ph) * (1 - ph) * life); }   // sound waves
        for (let i = 0; i < 6; i++) { const a = t * 0.8 + i / 6 * 6.2832, nx = z.x + Math.cos(a) * r * 0.86, ny = z.y + Math.sin(a) * r * 0.86, nh = gh + 0.5 + 0.16 * Math.sin(t * 4 + i);   // notes riding the rim
          bill(BA, 'glow', nx, ny, nh, 0.32, 0.32, 0, c, 0.3 * life); bill(BA, 'note', nx, ny, nh, 0.26, 0.26, Math.sin(t * 3 + i) * 0.3, c, 0.95 * life); bill(BA, 'note', nx, ny, nh, 0.19, 0.19, Math.sin(t * 3 + i) * 0.3, WHITE, 0.45 * life); }
        break;
      }
      case 'magnus': {
        ground(GA, 'runeCircle', z.x, z.y, gh, r * 1.02 * pop, t * 0.25, c, 0.55 * life);
        ground(GA, 'cross', z.x, z.y, gh + 0.01, r * 0.98, yawA, c, (0.4 + 0.25 * pulse) * life);
        ground(GA, 'glow', z.x, z.y, gh, r * 1.25, 0, c, 0.1 * life);
        for (const [dx, dy] of MAG) pillarQ(BA, 'beam', z.x + dx * r * 0.47, z.y + dy * r * 0.47, gh, 0.6, 3.2, c, 0.12 * life * (0.6 + 0.4 * pulse), 0);
        motes(z.x, z.y, gh, r * 0.9, 14 * r * life, '#fff6c8', 1.4, 0.09);
        break;
      }
      case 'ward': {
        ground(GA, 'wardRing', z.x, z.y, gh, r * pop, t * 0.1, c, 0.6 * life);
        ground(GA, 'glow', z.x, z.y, gh, r * 1.1, 0, c, 0.12 * life);
        runeGround(z.rune, z.x, z.y, gh + 0.01, r * 0.25, c, 0.6 * life);
        sphere(z.x, gh - 0.05, z.y, r, r * 0.7, z.col || '#9fe0c0', 0.32 * life, 4);
        motes(z.x, z.y, gh, r * 0.95, 5 * r * life, z.col || '#9fe0c0', 0.8, 0.07);
        break;
      }
      default: {
        if (!fbLoop('rune_circle', z.x, z.y, gh, r * 2 / 5.333 * pop, c, 0.8 * life, t * 0.3, z.x * 3)) ground(GA, 'runeCircle', z.x, z.y, gh, r * pop, t * 0.3, c, 0.7 * life);
        ground(GA, 'glow', z.x, z.y, gh, r * 1.2, 0, c, 0.2 * life);
        runeGround(z.rune, z.x, z.y, gh + 0.01, r * 0.3, c, 0.7 * life);
        motes(z.x, z.y, gh, r, 6 * r * life, z.col || '#ffffff', 1, 0.08);
      }
    }
  }
  const MAG = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];

  /* ---------- cone / lines telegraphs (teles[].shape of a group) ---------- */
  const GRP = new Map();
  function drawShapes() {
    GRP.clear();
    for (const t of teles) { const s = t.shape; if (!s || (s.kind !== 'cone' && s.kind !== 'lines') || !t.grp || (t.m && t.m.dead)) continue;
      let g = GRP.get(t.grp); if (!g) { g = { s, t: 0, dmin: 1e9, a: t.a, m: t.m }; GRP.set(t.grp, g); } if (t.t > g.t) g.t = t.t; if (t.dur < g.dmin) g.dmin = t.dur; }
    GRP.forEach(drawShape);
    for (const X of V.extra) if (X.shape) drawShape({ s: X.shape, t: X.t, dmin: X.dur, a: { delay: X.dur, speed: 1e9, col: X.col } });
  }
  const _hot = [0, 0, 0];
  function drawShape(g) {
    const s = g.s, a = g.a || {}, col = a.col || (g.m && g.m.d && g.m.d.glow) || (s.kind === 'cone' ? '#ff7a2a' : '#9fd8ff');
    const gh = groundH(s.x, s.y) + 0.06, delay = a.delay || g.dmin || 1, k = clamp(g.t / delay, 0, 1), late = smoothstep(0.65, 1, k), fl = 0.5 + 0.5 * Math.sin(time * (8 + 22 * late));
    const c = lc(col), dark = lc(s.kind === 'cone' ? '#2a0400' : '#021824');
    _hot[0] = c[0] + (1 - c[0]) * late * 0.6; _hot[1] = c[1] + (1 - c[1]) * late * 0.6; _hot[2] = c[2] + (1 - c[2]) * late * 0.6;
    if (s.kind === 'cone') {
      // dark scorched base, the heat front growing out to the full length, hot edges, heat ripples running outward
      fan(GN, 'coneBase', s, 0.03, 0.3, s.len, dark, 0.6 + 0.2 * late);
      fan(GA, 'coneFill', s, 0.05, 0.3, Math.max(0.4, s.len * (0.06 + 0.94 * k)), _hot, 0.45 + 0.45 * k);
      fan(GA, 'coneEdge', s, 0.06, 0.3, s.len, c, 0.6 + 0.35 * fl * (0.4 + 0.6 * k));
      for (let i = 0; i < 3; i++) { const ph = (time * 0.9 + i / 3) % 1, r = 0.4 + ph * (s.len - 0.4); fan(GA, 'bar', s, 0.07, Math.max(0.3, r - 0.35), r + 0.35, _hot, 0.5 * Math.sin(ph * Math.PI) * (0.3 + 0.7 * k)); }
      if (k > 0.2 && q > 0.4) { const n = rate(30 * k), cc = srgb(col); for (let i = 0; i < n; i++) { const an = s.ang + (Math.random() * 2 - 1) * s.half, d = Math.random() * s.len * k; PFX.emit(false, s.x + Math.cos(an) * d, gh + 0.1, s.y + Math.sin(an) * d, 0, 0.8 + Math.random(), 0, 0.3, 0.6, 0.5, cc[0], cc[1], cc[2], 1, 0.08, 0.03, 2); } }
    } else {
      // each line: dark lane, bright rails, chevrons flowing outward; the wave front sweeps out once it breaks
      const spd = a.speed || 7, front = g.t > delay ? 1.2 + (g.t - delay) * spd : 0;
      for (let j = 0; j < s.n; j++) {
        const an = s.ang + (s.n > 1 ? (j - (s.n - 1) / 2) * s.spread : 0);
        lane(GN, 'coneBase', s.x, s.y, an, 0.8, s.len, s.w, 0.03, dark, 0.62, 0.3);
        lane(GA, 'laneEdge', s.x, s.y, an, 0.8, s.len, s.w, 0.05, c, (0.55 + 0.35 * fl) * (0.5 + 0.5 * k), 0.25);
        for (let i = 0; i < 4; i++) { const ph = (time * 0.8 + i / 4) % 1, d = 1 + ph * (s.len - 1.6); lane(GA, 'chev', s.x, s.y, an, d, d + 0.6, s.w * 0.8, 0.06, c, 0.8 * Math.sin(ph * Math.PI) * (0.4 + 0.6 * k)); }
        if (front > 0 && front < s.len + 0.5) lane(GA, 'bar', s.x, s.y, an, Math.max(0.8, front - 0.6), Math.min(s.len, front + 0.6), s.w * 1.1, 0.07, _hot, 0.95);
        else if (!front) lane(GA, 'bar', s.x, s.y, an, 0.6, 1.8, s.w * 1.05 * (0.6 + 0.4 * k), 0.07, _hot, 0.35 + 0.5 * k);
      }
    }
  }
  // Annular fan of a cone shape between radii r0 and r1 (u = angle 0..1 across the cone, v = 0 at r0 .. 1 at r1).
  function fan(B, cell, s, lift, r0, r1, c, a, a1) {
    const uv = cellUV(CELL[cell]), N = 10, nv = Math.max(1, Math.ceil((r1 - r0) / 1.5)), A1 = a1 === undefined ? a : a1;
    for (let i = 0; i < N; i++) {
      const b0 = s.ang - s.half + 2 * s.half * i / N, b1 = s.ang - s.half + 2 * s.half * (i + 1) / N, c0 = Math.cos(b0), s0 = Math.sin(b0), c1 = Math.cos(b1), s1 = Math.sin(b1);
      gquad(B, uv, s.x + c0 * r1, s.y + s0 * r1, s.x + c1 * r1, s.y + s1 * r1, s.x + c0 * r0, s.y + s0 * r0, s.x + c1 * r0, s.y + s1 * r0, lift, c, A1, a, i / N, (i + 1) / N, 0, 1, 1, nv);
    }
  }
  // A strip along angle an from s0 to s1 cells, w wide (u across, v along: 0 at s0 .. 1 at s1).
  function lane(B, cell, x, y, an, s0, s1, w, lift, c, a, a1) {
    const uv = cellUV(CELL[cell]), ux = Math.cos(an), uy = Math.sin(an), px = -uy * w / 2, py = ux * w / 2;
    const xa = x + ux * s0, ya = y + uy * s0, xb = x + ux * s1, yb = y + uy * s1;
    gquad(B, uv, xb + px, yb + py, xb - px, yb - py, xa + px, ya + py, xa - px, ya - py, lift, c, a1 === undefined ? a : a1, a, 0, 1, 0, 1, 1, Math.max(1, Math.ceil((s1 - s0) / 1.5)));
  }

  /* ---------- lightning + light pillars (fxs 'strike' / 'pillar', and VFX.bolt / VFX.beam) ---------- */
  const BOLTS = [];
  function bolt(x0, y0, h0, x1, y1, h1, col, life, w) { BOLTS.push({ x0, y0, h0, x1, y1, h1, col, t: 0, dur: life || 0.22, w: w || 1, seed: Math.random() * 1000 }); }
  function drawBolt(b, k, gh1) {
    const r = mulberry32(b.seed | 0), n = 8, al = 1 - k, c = lc(b.col || '#fff6d0');
    for (let i = 0; i <= n; i++) { const f = i / n, j = i && i < n ? 1 : 0; RP[i * 3] = b.x0 + (b.x1 - b.x0) * f + (r() - 0.5) * 0.9 * j; RP[i * 3 + 1] = b.h0 + (b.h1 - b.h0) * f; RP[i * 3 + 2] = b.y0 + (b.y1 - b.y0) * f + (r() - 0.5) * 0.9 * j; RA[i] = al; }
    for (let i = 0; i <= n; i++) RW[i] = 1.1 * b.w; ribbon(BA, n + 1, c);
    for (let i = 0; i <= n; i++) RW[i] = 0.22 * b.w; ribbon(BA, n + 1, WHITE);
    // a side branch
    const bi = 2 + ((r() * 4) | 0); RP[0] = RP[bi * 3]; RP[1] = RP[bi * 3 + 1]; RP[2] = RP[bi * 3 + 2];
    for (let i = 1; i < 4; i++) { RP[i * 3] = RP[(i - 1) * 3] + (r() - 0.5) * 1.1; RP[i * 3 + 1] = RP[(i - 1) * 3 + 1] - 0.7; RP[i * 3 + 2] = RP[(i - 1) * 3 + 2] + (r() - 0.5) * 1.1; }
    for (let i = 0; i < 4; i++) { RW[i] = 0.35 * b.w * (1 - i / 4); RA[i] = al * 0.8; } ribbon(BA, 4, c);
    if (gh1 !== undefined) { ground(GA, 'glow', b.x1, b.y1, gh1 + 0.05, 1.6 * b.w, 0, c, 0.7 * al); bill(BA, 'star', b.x1, b.y1, gh1 + 0.3, 1.4 * b.w, 1.4 * b.w, k * 2, c, al); }
  }
  function drawFx() {
    for (const f of fxs) {
      const k = f.t / f.dur;
      if (f._fb) continue;   // a flipbook plays it (fbFx)
      if (f.k === 'strike') { const gh = groundH(f.x, f.y); if (!f._b) f._b = { x0: f.x + (hsh(f.seed, 1) - 0.5) * 1.2, y0: f.y + (hsh(f.seed, 2) - 0.5) * 1.2, h0: gh + 9, x1: f.x, y1: f.y, h1: gh, col: '#cfe6ff', seed: f.seed, w: 1 }; drawBolt(f._b, k, gh); }
      else if (f.k === 'pillar') {
        const e = f.e, gh = groundH(e.x, e.y), al = Math.sin(clamp(k, 0, 1) * Math.PI), w = f.big ? 1.3 : 0.9, c = lc(f.col || '#ffffff');
        pillarQ(BA, 'beam', e.x, e.y, gh, w * 1.7, 7, c, 0.55 * al, 0);
        pillarQ(BA, 'beam', e.x, e.y, gh, w * 0.55, 7.5, WHITE, 0.7 * al, 0);
        ground(GA, 'glow', e.x, e.y, gh + 0.05, w * 1.4, 0, c, 0.7 * al);
        ground(GA, 'ring', e.x, e.y, gh + 0.06, w * (0.6 + k * 0.9), 0, c, al);
        if (Math.random() < dt * 30 * al) { const cc = srgb(f.col || '#ffffff'), a = Math.random() * 6.2832; PFX.emit(false, e.x + Math.cos(a) * w * 0.35, gh + 0.2, e.y + Math.sin(a) * w * 0.35, 0, 2 + Math.random() * 3, 0, 0, 0.3, 0.8, cc[0], cc[1], cc[2], 1, 0.09, 0.03, 2); }
      }
    }
    for (let i = BOLTS.length - 1; i >= 0; i--) { const b = BOLTS[i]; b.t += dt; if (b.t >= b.dur) { BOLTS[i] = BOLTS[BOLTS.length - 1]; BOLTS.pop(); continue; } drawBolt(b, b.t / b.dur); }
  }

  /* ---------- auras, spheres ---------- */
  let AH = null;   // the hero whose auras / spheres are being drawn (squad mode: every hero in turn)
  function drawAuras1() {
    if (!AH || AH.dead || !AH.buffs) return;
    const gh = groundH(AH.x, AH.y) + 0.05;
    for (const id in AH.buffs) {
      const b = AH.buffs[id], au = b.aura; if (!au) continue;
      const c = lc(au.col || '#ffffff'), fade = b.perm ? 1 : Math.min(1, (b.max - b.t) / 0.3 + 0.2, b.t / 0.5 + 0.3), r = au.r || 1;   // perm (Reborn): never elapses, full strength
      if (au.bubble) {   // Kyrie: a shimmering prayer shell around the body
        const hh = typeof headH === 'function' ? headH(AH) : 1.6, hits = b.hits || 5;
        sphere(AH.x, gh + hh * 0.48, AH.y, Math.max(0.75, r), hh * 0.62, au.col, 0.55 * fade * (0.8 + 0.2 * Math.sin(time * 5)), 7);
        ground(GA, 'glow', AH.x, AH.y, gh, r * 1.3, 0, c, 0.25 * fade);
        for (let i = 0; i < Math.min(8, hits); i++) { const a = time * 1.2 + i / Math.min(8, hits) * 6.2832; bill(BA, 'star', AH.x + Math.cos(a) * r * 0.95, AH.y + Math.sin(a) * r * 0.95, gh + hh * 0.5 + Math.sin(time * 3 + i) * 0.15, 0.22, 0.22, time, c, 0.8 * fade); }
        continue;
      }
      if (b.song) {       // songs: a dashed staff ring, notes drifting up around the singer
        ground(GA, 'ringDash', AH.x, AH.y, gh, r, time * 0.35, c, 0.55 * fade);
        ground(GA, 'glow', AH.x, AH.y, gh, r * 1.1, 0, c, 0.12 * fade);
        for (let i = 0; i < 7; i++) { const ph = (time * 0.45 + i / 7) % 1, a = i * 2.4 + Math.floor(time * 0.45 + i / 7) * 1.7, d = r * (0.35 + 0.55 * hsh(i, Math.floor(time * 0.45 + i / 7)));
          const nx = AH.x + Math.cos(a) * d, ny = AH.y + Math.sin(a) * d, nh = gh + 0.2 + ph * 2.2, na = Math.sin(ph * Math.PI) * fade;
          bill(BA, 'glow', nx, ny, nh, 0.34, 0.34, 0, c, 0.35 * na); bill(BA, 'note', nx, ny, nh, 0.26, 0.26, Math.sin(time * 3 + i) * 0.3, c, na); bill(BA, 'note', nx, ny, nh, 0.2, 0.2, Math.sin(time * 3 + i) * 0.3, WHITE, 0.5 * na); }
        continue;
      }
      if (id === 'mrod') {  // Magic Rod: a violet vortex drinking inward
        ground(GA, 'swirl', AH.x, AH.y, gh, r * 1.3, time * 6, c, 0.75 * fade);
        ground(GA, 'ring', AH.x, AH.y, gh, r * (1.2 - (time * 2 % 1) * 0.5), 0, c, 0.6 * fade);
        const hh = typeof headH === 'function' ? headH(AH) : 1.6;
        for (let i = 0; i < 8; i++) { const ph = (time * 1.6 + i / 8) % 1, a = i / 8 * 6.2832 + time * 2, d = r * 1.4 * (1 - ph); bill(BA, 'core', AH.x + Math.cos(a) * d, AH.y + Math.sin(a) * d, gh + hh * 0.5, 0.12, 0.12, 0, c, ph * fade); }
        continue;
      }
      if (id === 'oath') {  // Oath of Tyr: a golden oath-circle with Tiwaz, a faint shield-light
        ground(GA, 'runeCircle', AH.x, AH.y, gh, r * 1.1, -time * 0.3, c, 0.6 * fade);
        runeGround('ᛏ', AH.x, AH.y, gh + 0.01, r * 0.35, c, 0.55 * fade);
        pillarQ(BA, 'beam', AH.x, AH.y, gh, r * 1.4, 2.6, c, 0.16 * fade, 0);
        continue;
      }
      const A3 = AURA3[id]; if (A3) { A3(b, c, fade, gh, r, typeof headH === 'function' ? headH(AH) : 1.6); continue; }
      ground(GA, 'ring', AH.x, AH.y, gh, r, 0, c, 0.6 * fade); ground(GA, 'glow', AH.x, AH.y, gh, r * 1.1, 0, c, 0.15 * fade);
    }
  }
  /* Round-6 auras (vfx round 7): the Reborn shimmer and a look of its own for every tier-3 buff that used to fall back
     to the plain ring. f(buff, colour, fade, ground height, radius, head height); all atlas / flipbook quads + PFX. */
  const orbit = (n, rad, h, spd, cell, size, c, a, glow) => { for (let i = 0; i < n; i++) { const an = time * spd + i / n * 6.2832, x = AH.x + Math.cos(an) * rad, y = AH.y + Math.sin(an) * rad, hh = h + Math.sin(time * 3 + i * 2) * 0.06; if (glow) bill(BA, 'glow', x, y, hh, size * 2.2, size * 2.2, 0, c, a * glow); bill(BA, cell, x, y, hh, size, size, time * 2 + i, c, a); } };
  const under = (rad, a) => ground(GN, 'glow', AH.x, AH.y, groundH(AH.x, AH.y) + 0.03, rad, 0, lc('#140c04'), a);   // contrast for glows on bright ground
  const AURA3 = {
    reborn(b, c, fade, gh, r, hh) {   // golden shimmer: a soft light column, glints spiralling up around the hero and twinkling, drifting motes
      const t = time, tw = 0.5 + 0.5 * Math.sin(t * 2.1);
      under(r * 1.2, 0.2 * fade);
      ground(GA, 'glow', AH.x, AH.y, gh, r * 1.4, 0, c, (0.22 + 0.1 * tw) * fade);
      ground(GA, 'ringDash', AH.x, AH.y, gh + 0.005, r * 1.05, t * 0.25, c, 0.55 * fade);
      ground(GA, 'ring', AH.x, AH.y, gh + 0.008, r * (0.72 + 0.06 * tw), 0, c, 0.35 * fade);
      pillarQ(BA, 'beam', AH.x, AH.y, gh, r * 1.9, hh * 1.25, c, (0.2 + 0.07 * tw) * fade, 0);
      for (let i = 0; i < 9; i++) {
        const ph = (t * 0.22 + i / 9) % 1, an = i * 2.39 + t * 0.9, rr = r * (1.05 + 0.15 * Math.sin(i * 1.7 + t * 0.7)), tws = Math.max(0, Math.sin(t * 4.6 + i * 1.9)), sz = 0.2 + 0.2 * tws, x = AH.x + Math.cos(an) * rr, y = AH.y + Math.sin(an) * rr, h = gh + 0.15 + ph * hh * 1.1, al = Math.sin(ph * Math.PI) * fade;
        bill(BA, 'glow', x, y, h, sz * 1.6, sz * 1.6, 0, c, 0.35 * al); bill(BA, 'star', x, y, h, sz, sz, t * 1.3 + i, c, al * (0.5 + 0.5 * tws));
      }
      motes(AH.x, AH.y, gh, r * 1.0, 9 * fade, '#ffe8a0', 1.0, 0.07);
    },
    fury(b, c, fade, gh, r, hh) {     // Einherjar's Fury: a spiked blood ring, flames licking up, heat throbbing
      const pul = 0.6 + 0.4 * Math.sin(time * 9);
      under(r * 1.2, 0.2 * fade); ground(GA, 'glow', AH.x, AH.y, gh, r * 1.35, 0, c, 0.28 * fade * pul);
      ground(GA, 'hex', AH.x, AH.y, gh + 0.005, r * (0.95 + 0.05 * pul), time * 1.6, c, 0.6 * fade);
      ground(GA, 'swirl', AH.x, AH.y, gh + 0.01, r * 0.75, -time * 4, lc('#ffb080'), 0.35 * fade);
      bill(BA, 'glow', AH.x, AH.y, gh + hh * 0.5, 1.1, hh * 0.8, 0, c, 0.16 * fade * pul);
      motes(AH.x, AH.y, gh, r * 0.55, 28 * fade, '#ff5a2a', 2.3, 0.1, false);
    },
    bearrage(b, c, fade, gh, r, hh) { // Bear-Skin Rage: claw marks torn into the ground, a hot orange pulse, embers
      const pul = 0.5 + 0.5 * Math.sin(time * 5);
      under(r * 1.2, 0.25 * fade); ground(GN, 'claw', AH.x, AH.y, gh + 0.004, r * 1.1, yawA + 0.4, lc('#1a0802'), 0.5 * fade);
      ground(GA, 'claw', AH.x, AH.y, gh + 0.008, r * 1.05, yawA + 0.4, c, (0.75 + 0.25 * pul) * fade);
      ground(GA, 'glow', AH.x, AH.y, gh, r * 1.4, 0, c, 0.2 * fade * (0.6 + 0.4 * pul));
      ground(GA, 'ring', AH.x, AH.y, gh + 0.01, r * (0.7 + 0.45 * ((time * 1.4) % 1)), 0, c, 0.45 * (1 - (time * 1.4) % 1) * fade);
      motes(AH.x, AH.y, gh, r * 0.6, 16 * fade, '#ff8a3a', 1.6, 0.08, false);
    },
    gloria(b, c, fade, gh, r, hh) {   // Gloria: a golden halo over the head, a holy circle, sparkles
      under(r * 1.1, 0.15 * fade); ground(GA, 'holyCircle', AH.x, AH.y, gh, r, time * 0.25, c, 0.6 * fade);
      ground(GA, 'glow', AH.x, AH.y, gh, r * 1.1, 0, c, 0.12 * fade);
      const hy = gh + hh * 0.92 + 0.12 + 0.03 * Math.sin(time * 2.5); ground(GA, 'ring', AH.x, AH.y, hy, 0.3, 0, c, fade);
      ground(GA, 'glow', AH.x, AH.y, hy - 0.02, 0.5, 0, c, 0.4 * fade);
      motes(AH.x, AH.y, gh, r * 0.7, 6 * fade, '#fff0a0', 1.2, 0.07);
    },
    martyr(b, c, fade, gh, r, hh) {   // Tyr's Sacrifice: Tiwaz in blood on the ground, one red orb per strike left
      under(r * 1.1, 0.22 * fade);
      runeGround('ᛏ', AH.x, AH.y, gh + 0.01, r * 0.6, c, 0.85 * fade);
      ground(GA, 'ring', AH.x, AH.y, gh, r, 0, c, 0.6 * fade);
      orbit(Math.max(0, Math.min(5, b.count | 0)), 0.95, gh + hh * 0.45, 1.7, 'core', 0.2, c, fade, 0.6);
    },
    amplify(b, c, fade, gh, r, hh) {  // Galdr Amplify: the galdr circle turning under the caster, three runes circling
      under(r * 1.1, 0.15 * fade);
      if (!fbLoop('rune_circle', AH.x, AH.y, gh + 0.01, r * 2 / 5.333, c, 0.9 * fade, time * 0.6, 0)) ground(GA, 'runeCircle', AH.x, AH.y, gh, r, time * 0.6, c, 0.6 * fade);
      for (let i = 0; i < 3; i++) { const an = time * 1.3 + i * 2.094, rn = ['ᚨ', 'ᚷ', 'ᛟ'][i]; const rx = AH.x + Math.cos(an) * 0.95, ry = AH.y + Math.sin(an) * 0.95, rh = gh + hh * 0.5 + Math.sin(time * 2 + i) * 0.1; bill(BA, 'glow', rx, ry, rh, 0.5, 0.5, 0, c, 0.4 * fade); runeBill(rn, rx, ry, rh, 0.34, c, fade); }
    },
    foresight(b, c, fade, gh, r, hh) { // Foresight: the seer's eye above the head, one blue orb per quickened spell
      const bl = 0.75 + 0.25 * Math.sin(time * 3);
      const eh = gh + hh * 0.9 + 0.15; under(r * 1.1, 0.2 * fade);
      bill(BN, 'glow', AH.x, AH.y, eh, 0.6, 0.45, 0, lc('#06101c'), 0.45 * fade); bill(BA, 'glow', AH.x, AH.y, eh, 0.75, 0.55, 0, c, 0.45 * fade); bill(BA, 'eye', AH.x, AH.y, eh, 0.46, 0.46 * bl, 0, c, fade);
      ground(GA, 'ringDash', AH.x, AH.y, gh, r, -time * 0.4, c, 0.6 * fade);
      orbit(Math.max(0, Math.min(6, b.count | 0)), 0.9, gh + hh * 0.5, 1.2, 'core', 0.16, c, fade, 0.6);
    },
    sight(b, c, fade, gh, r, hh) {    // Völva's Sight: the three known bolts' sparks circling, waiting to be loosed
      under(r * 1.1, 0.2 * fade);
      ground(GA, 'boltCircle', AH.x, AH.y, gh, r, time * 0.2, c, 0.7 * fade);
      runeGround('ᛞ', AH.x, AH.y, gh + 0.01, r * 0.35, c, 0.7 * fade);
      const cs = SIGHTC; for (let i = 0; i < 3; i++) { const an = time * 1.5 + i * 2.094, x = AH.x + Math.cos(an) * 0.95, y = AH.y + Math.sin(an) * 0.95, h = gh + hh * 0.45 + Math.sin(time * 3 + i) * 0.08, cc = lc(cs[i]);
        bill(BA, 'glow', x, y, h, 0.45, 0.45, 0, cc, 0.8 * fade); bill(BA, 'core', x, y, h, 0.16, 0.16, 0, WHITE, fade); }
    },
    harmonize(b, c, fade, gh, r, hh) { // Harmonize: two staves weaving, a note of each colour chasing the other
      under(r * 1.2, 0.2 * fade);
      ground(GA, 'ringDash', AH.x, AH.y, gh, r * 1.15, time * 0.5, c, 0.75 * fade);
      ground(GA, 'ringDash', AH.x, AH.y, gh + 0.005, r * 0.9, -time * 0.5, lc('#9fd8ff'), 0.7 * fade);
      for (let i = 0; i < 2; i++) { const an = time * 1.6 + i * 3.1416, x = AH.x + Math.cos(an) * r * 1.15, y = AH.y + Math.sin(an) * r * 1.15, h = gh + 0.6 + Math.sin(time * 4 + i * 3) * 0.2, cc = i ? lc('#9fd8ff') : c;
        bill(BA, 'glow', x, y, h, 0.34, 0.34, 0, cc, 0.35 * fade); bill(BA, 'note', x, y, h, 0.26, 0.26, Math.sin(time * 3 + i) * 0.3, cc, fade); }
    },
    assumptio(b, c, fade, gh, r, hh) { // Assumptio: a Valkyrie's mantle, a pale rose shell and feathers of light drifting down
      sphere(AH.x, gh + hh * 0.48, AH.y, Math.max(0.8, r * 0.85), hh * 0.62, '#ffd8f0', 0.28 * fade * (0.85 + 0.15 * Math.sin(time * 2)), 3);
      ground(GA, 'wardRing', AH.x, AH.y, gh, r, time * 0.15, c, 0.4 * fade);
      for (let i = 0; i < 4; i++) { const ph = (time * 0.35 + i / 4) % 1, an = i * 1.9 + Math.floor(time * 0.35 + i / 4) * 2.3, x = AH.x + Math.cos(an) * 0.6, y = AH.y + Math.sin(an) * 0.6;
        bill(BA, 'shard', x + Math.sin(ph * 9 + i) * 0.12, y, gh + hh * 1.15 * (1 - ph), 0.07, 0.2, Math.sin(ph * 7 + i) * 0.6, c, Math.sin(ph * Math.PI) * 0.8 * fade); }
    },
    einherjar(b, c, fade, gh, r, hh) { // Einherjar's Call: the called dead circling you as soul fire, a golden war-ring
      ground(GA, 'runeCircle', AH.x, AH.y, gh, r, -time * 0.2, c, 0.35 * fade);
      ground(GA, 'glow', AH.x, AH.y, gh, r * 1.1, 0, c, 0.1 * fade);
      if (!fbLoop('soul_wisps', AH.x, AH.y, gh, 0.9, WHITE, 0.8 * fade, 0, 0)) orbit(3, 0.8, gh + hh * 0.5, 1.4, 'core', 0.16, lc('#7affb4'), 0.9 * fade, 0.5);
    },
    bladestop(b, c, fade, gh, r, hh) { // Blade Stop: open hands, crossed blades of light before the chest, a tight pulsing ring
      const pul = 0.5 + 0.5 * Math.sin(time * 14);
      bill(BA, 'glow', AH.x, AH.y, gh + hh * 0.55, 0.9, 0.9, 0, c, 0.3 * fade);
      bill(BA, 'cross', AH.x, AH.y, gh + hh * 0.55, 0.55 + 0.05 * pul, 0.55 + 0.05 * pul, 0.785, c, (0.65 + 0.35 * pul) * fade);
      ground(GA, 'ring', AH.x, AH.y, gh, r * (0.9 + 0.1 * pul), 0, c, 0.65 * fade);
    },
  };
  const SIGHTC = ['#ff7a2a', '#9fd8ff', '#fff6a0'];
  const SPHC = '#9fd0ff';
  function drawSpheres1() {
    if (!AH || AH.dead || !(AH.spheres > 0)) return;
    const gh = groundH(AH.x, AH.y), hh = typeof headH === 'function' ? headH(AH) * 0.8 : 1.3, n = AH.spheres, c = lc(SPHC), R = 0.78;
    for (let i = 0; i < n; i++) {
      const w = 2.2, a = time * w + i / n * 6.2832, x = AH.x + Math.cos(a) * R, y = AH.y + Math.sin(a) * R, h = gh + hh + Math.sin(time * 3 + i) * 0.08;
      bill(BA, 'glow', x, y, h, 0.55, 0.55, 0, c, 0.9); bill(BA, 'core', x, y, h, 0.22, 0.22, 0, WHITE, 1);
      for (let k = 0; k < 6; k++) { const ak = a - k * 0.13; RP[k * 3] = AH.x + Math.cos(ak) * R; RP[k * 3 + 1] = gh + hh + Math.sin((time - k * 0.13 / w) * 3 + i) * 0.08; RP[k * 3 + 2] = AH.y + Math.sin(ak) * R; RW[k] = 0.2 * (1 - k / 6); RA[k] = 0.75 * (1 - k / 6); }
      ribbon(BA, 6, c);
    }
  }

  // Every hero of the party (P first, as before), then the squad markers and hero status marks.
  function drawAuras() { const H = heroList(); for (let i = 0; i < H.length; i++) { AH = H[i]; drawAuras1(); } AH = null; }
  function drawSpheres() { const H = heroList(); for (let i = 0; i < H.length; i++) { AH = H[i]; drawSpheres1(); } AH = null; }
  const _HLV = [];
  function heroList() {   // the controlled hero, then the others (no allocation)
    const H = typeof gfxHeroes === 'function' ? gfxHeroes() : null, C = ctrlHero(); _HLV.length = 0; if (C) _HLV.push(C);
    if (H) for (let i = 0; i < H.length; i++) if (H[i] && H[i] !== C) _HLV.push(H[i]);
    return _HLV;
  }
  /* Squad markers (only with 2+ heroes, so a party of one looks exactly as before): a subtle gold ring at the controlled
     hero's feet (a slow dashed ring + faint glow), a small role pip under each ally (tank blue, healer green, melee red,
     ranged yellow: hero.ai.role). Allies' status marks: Seidr hex (buffs.hexed) and weakened (buffs.weak /
     hero.weak), the same looks as on monsters (the controlled hero has its buff bar). All quads of the existing batches: no extra draw. */
  const ROLEC = { tank: '#5aa8ff', healer: '#6ae08a', melee: '#ff6a5a', ranged: '#ffd84a' };
  function drawSquad() {
    const H = heroList(); if (H.length < 2) { drawHeroMarks(H); return; }
    for (let i = 0; i < H.length; i++) {
      const h = H[i], gh = groundH(h.x, h.y) + 0.02, mt = VISMOUNT(h) ? 1.45 : 1;
      if (i === 0) {   // heroList()[0] = the controlled hero
        if (h.dead) continue;
        const c = lc('#ffd070'), pul = 0.85 + 0.15 * Math.sin(time * 2.4);
        ground(GA, 'glow', h.x, h.y, gh, 0.62 * mt, 0, c, 0.13 * pul);
        ground(GA, 'ringDash', h.x, h.y, gh + 0.004, 0.5 * mt, time * 0.5, c, 0.42 * pul);
      } else {
        const role = h.ai && h.ai.role, col = ROLEC[role] || '#d8d0c0', c = lc(col), a = h.dead ? 0.35 : 1, r = 0.14 * (VISMOUNT(h) ? 1.3 : 1);
        const oy = 0.34 * mt, px = h.x + Math.sin(cam.yaw) * oy, py = h.y + Math.cos(cam.yaw) * oy;   // just in front of the feet (toward the camera)
        ground(GN, 'glow', px, py, gh, r * 1.9, 0, lc('#0c0a08'), 0.35 * a);
        ground(GA, 'glow', px, py, gh + 0.003, r * 2.2, 0, c, 0.3 * a);
        ground(GA, 'core', px, py, gh + 0.006, r, 0, c, 0.95 * a);
      }
    }
    drawHeroMarks(H);
  }
  const VISMOUNT = h => { const v = VIS.get(h); return !!(v && v.mounted); };
  function drawHeroMarks(H) {
    for (let i = 1; i < H.length; i++) {   // allies only (H[0] = the controlled hero: its buff bar shows it; a party of one looks as before)
      const h = H[i]; if (h.dead || !h.buffs) continue;
      const hexed = h.buffs.hexed, weak = h.buffs.weak || h.weak > 0; if (!hexed && !weak) continue;
      const gh = groundH(h.x, h.y) + 0.05, hh = typeof headH === 'function' ? headH(h) : 1.6, top = gh + hh + 0.5, pul = 0.75 + 0.25 * Math.sin(time * 5 + i);
      if (weak) { const c = lc(COL_WEAK), x = h.x, y = h.y, hy = top + (hexed ? 0.45 : 0) + 0.05 * Math.sin(time * 2.2 + i);
        bill(BN, 'glow', x, y, hy, 0.4, 0.4, 0, lc('#1a0604'), 0.45 * pul); bill(BA, 'glow', x, y, hy, 0.34, 0.34, 0, c, 0.3 * pul); bill(BA, 'brokenShield', x, y, hy, 0.3, 0.3, 0.12 * Math.sin(time * 1.7 + i), c, pul); }
      if (hexed) { const c = lc(COL_HEX), ha = Math.min(1, (hexed.t || 1) * 1.5), br = 0.8 + 0.2 * Math.sin(time * 3.3 + i);
        bill(BN, 'glow', h.x, h.y, top, 0.72, 0.72, 0, lc('#12041c'), 0.6 * ha); bill(BA, 'glow', h.x, h.y, top, 0.6, 0.6, 0, c, 0.45 * ha * br);
        bill(BA, 'seidr', h.x, h.y, top, 0.48, 0.48, Math.sin(time * 0.9 + i) * 0.35, c, 0.95 * ha * br);
        ground(GA, 'hex', h.x, h.y, gh + 0.01, 0.5, -time * 0.8 + i, c, 0.55 * ha); }
    }
  }
  /* ---------- projectiles ---------- */
  const TRAIL = new WeakMap(), PK3 = { fire: 1, ice: 1, soul: 1, holy: 1, bolt: 1, sphere: 1, raven: 1, spear: 1 };
  V.handles = kind => V.enabled && V.ready && !!PK3[kind];
  function drawProjs() {
    for (const p of projs) {
      if (!PK3[p.kind]) continue;
      let tr = TRAIL.get(p); if (!tr) { tr = { a: new Float32Array(30), n: 0 }; TRAIL.set(p, tr); }
      const a = tr.a; if (tr.n === 0 || Math.hypot(a[0] - p.x, a[2] - p.y) > 0.05 || tr.n < 10) { a.copyWithin(3, 0, 27); a[0] = p.x; a[1] = p.zu; a[2] = p.y; tr.n = Math.min(10, tr.n + 1); }
      const col = (typeof PCOL !== 'undefined' && PCOL[p.kind]) || '#ffffff', c = lc(col), n = tr.n;
      if (p.kind === 'raven') { drawRaven(p, tr, c); continue; }
      if (p.kind === 'spear') { drawSpear(p, tr, c); continue; }
      if (p.kind === 'fire' && fbTierOk('fireball_trail')) {   // the fireball sheet, turned along its flight on screen (authored flying to screen-right)
        const r = fbRec('fireball_trail');
        if (r) { const sx = p.vx * CR.x + p.vz * CR.y + p.vy * CR.z, sy = p.vx * CU.x + p.vz * CU.y + p.vy * CU.z, f = Math.floor(time * r.d.fps + p.x * 3) % r.n;
          fbQuad(r, f < 0 ? f + r.n : f, p.x, p.y, p.zu, 0.8, WHITE, 1, Math.atan2(sy, sx), false);
          if (Math.random() < dt * 40) { const cc = srgb(col); PFX.emit(true, p.x, p.zu, p.y, rand(-0.3, 0.3), rand(-0.2, 0.4), rand(-0.3, 0.3), 0, 1, 0.35, cc[0], cc[1], cc[2], 0.9, 0.12, 0.03, 0); }
          continue; }
      }
      const big = p.kind === 'bolt' ? 1.25 : p.kind === 'sphere' ? 0.8 : 1;
      for (let i = 0; i < n; i++) { RP[i * 3] = a[i * 3]; RP[i * 3 + 1] = a[i * 3 + 1]; RP[i * 3 + 2] = a[i * 3 + 2]; RW[i] = 0.42 * big * (1 - i / n); RA[i] = 0.9 * (1 - i / n); }
      ribbon(BA, n, c);
      bill(BA, 'glow', p.x, p.y, p.zu, 0.62 * big, 0.62 * big, 0, c, 0.9);
      bill(BA, 'core', p.x, p.y, p.zu, 0.26 * big, 0.26 * big, 0, WHITE, 1);
      if (p.kind === 'bolt' && Math.random() < 0.7) bolt(p.x, p.y, p.zu, p.x + rand(-0.7, 0.7), p.y + rand(-0.7, 0.7), p.zu + rand(-0.6, 0.6), '#fff6a0', 0.06, 0.35);
      if (p.kind === 'holy') bill(BA, 'star', p.x, p.y, p.zu, 0.7, 0.7, time * 3, c, 0.8);
      if (Math.random() < dt * 40) { const cc = srgb(col); PFX.emit(true, p.x, p.zu, p.y, rand(-0.3, 0.3), rand(-0.2, 0.4), rand(-0.3, 0.3), 0, 1, 0.35, cc[0], cc[1], cc[2], 0.9, 0.12 * big, 0.03, 0); }
    }
  }
  const _pv = new THREE.Vector3(), _pw = new THREE.Vector3();
  function screenDir(p) {   // +1 when the projectile moves to screen-right
    _pv.set(p.x, p.zu, p.y).project(camera); _pw.set(p.x + p.vx, p.zu + p.vz, p.y + p.vy).project(camera); return _pw.x >= _pv.x ? 1 : -1;
  }
  // Huginn: drawn from its pet sheet (pet_huginn, one instance of its sprite batch: syncRavenShots in gfx-sheets.js)
  // once that sheet is loaded; this pixel raven is only the fallback. The feather trail stays either way.
  const huginnSheet = () => typeof huginnRec === 'function' && recReady(huginnRec());
  function drawRaven(p, tr, c) {
    if (huginnSheet()) {
      const a = tr.a, n = tr.n; for (let i = 0; i < n; i++) { RP[i * 3] = a[i * 3]; RP[i * 3 + 1] = a[i * 3 + 1]; RP[i * 3 + 2] = a[i * 3 + 2]; RW[i] = 0.42 * (1 - i / n); RA[i] = 0.32 * (1 - i / n); }
      ribbon(BA, n, c);
      if (Math.random() < dt * 10) { const cc = srgb('#1a1a28'); PFX.emitDark(p.x, p.zu, p.y, rand(-0.3, 0.3), -0.3, rand(-0.3, 0.3), -0.6, 1.2, 1.1, cc[0], cc[1], cc[2], 0.95, 0.09, 0.07, 3); }
      return;
    }
    const f = Math.floor(time * 16) % 4, uv = PX.raven[f], s = 0.95, sd = screenDir(p), lit = lc('#c8d0ff');
    const rx = CR.x * s / 2 * sd, ry = CR.y * s / 2 * sd, rz = CR.z * s / 2 * sd, ux = CU.x * s / 2, uy = CU.y * s / 2, uz = CU.z * s / 2;
    quad(PB, uv, p.x - rx + ux, p.zu - ry + uy, p.y - rz + uz, p.x + rx + ux, p.zu + ry + uy, p.y + rz + uz, p.x - rx - ux, p.zu - ry - uy, p.y - rz - uz, p.x + rx - ux, p.zu + ry - uy, p.y + rz - uz, lit, 1);
    const a = tr.a, n = tr.n; for (let i = 0; i < n; i++) { RP[i * 3] = a[i * 3]; RP[i * 3 + 1] = a[i * 3 + 1]; RP[i * 3 + 2] = a[i * 3 + 2]; RW[i] = 0.5 * (1 - i / n); RA[i] = 0.45 * (1 - i / n); }
    ribbon(BA, n, c);
    if (Math.random() < dt * 8) { const cc = srgb('#1a1a28'); PFX.emitDark(p.x, p.zu, p.y, rand(-0.3, 0.3), -0.3, rand(-0.3, 0.3), -0.6, 1.2, 1.1, cc[0], cc[1], cc[2], 0.95, 0.09, 0.07, 3); }
  }
  function drawSpear(p, tr, c) {
    // oriented along the flight direction on screen: a quad from tail to tip facing the camera
    const L = 1.7, W = 0.28, dx = p.vx, dy = p.vz, dz = p.vy, dl = Math.hypot(dx, dy, dz) || 1, fx = dx / dl, fy = dy / dl, fz = dz / dl;
    const vx_ = CP.x - p.x, vy_ = CP.y - p.zu, vz_ = CP.z - p.y; let sx = fy * vz_ - fz * vy_, sy = fz * vx_ - fx * vz_, sz = fx * vy_ - fy * vx_; const sl = Math.hypot(sx, sy, sz) || 1; sx *= W / 2 / sl; sy *= W / 2 / sl; sz *= W / 2 / sl;
    const tx = p.x + fx * L * 0.5, ty = p.zu + fy * L * 0.5, tz = p.y + fz * L * 0.5, bx = p.x - fx * L * 0.5, by = p.zu - fy * L * 0.5, bz = p.y - fz * L * 0.5;
    // uv: u along the spear (tail 0 -> tip 1), v across
    const uv = PX.spear, lit = lc('#ffffff'), k = qpush(PB);
    vx(PB, k, bx + sx, by + sy, bz + sz, uv[0], uv[3], lit, 1); vx(PB, k + 1, tx + sx, ty + sy, tz + sz, uv[2], uv[3], lit, 1);
    vx(PB, k + 2, bx - sx, by - sy, bz - sz, uv[0], uv[1], lit, 1); vx(PB, k + 3, tx - sx, ty - sy, tz - sz, uv[2], uv[1], lit, 1);
    const a = tr.a, n = tr.n; for (let i = 0; i < n; i++) { RP[i * 3] = a[i * 3]; RP[i * 3 + 1] = a[i * 3 + 1]; RP[i * 3 + 2] = a[i * 3 + 2]; RW[i] = 0.34 * (1 - i / n); RA[i] = 0.7 * (1 - i / n); }
    ribbon(BA, n, c); bill(BA, 'glow', tx, ty, tz, 0.5, 0.5, 0, c, 0.7);
  }

  /* ---------- monsters: statuses, named / MVP auras ---------- */
  const COL_SNARE = '#d8b070', COL_MARK = '#cfe07a', COL_DISPEL = '#c8a8ff', COL_LEX = '#fff2b8', COL_STUN = '#ffe070', COL_FROST = '#bfe6ff';
  const COL_WEAK = '#ff8a5a', COL_HEX = '#b070ff';
  function drawMobs() {
    for (const m of mobs) {
      const d = m.d;
      if (m.dead) { if (d.boss && !FB_SEEN.has(m) && m.deathT !== undefined && m.deathT < 1) { FB_SEEN.add(m); fbSpawn('mvp_burst', m.x, m.y, groundH(m.x, m.y), fbo(Math.max(1, Math.min(1.6, (d.size || 1) * 0.6)))); } continue; }   // an MVP falls
      if (m.summoned && !FB_SEEN.has(m)) { FB_SEEN.add(m); fbSpawn('summon_smoke', m.x, m.y, groundH(m.x, m.y), fbo(0.8 * Math.max(1, (d.size || 1) * 0.7))); }   // an add called in
      if (!(d.variant || d.boss || m.snare > 0 || m.slow > 0 || m.frozen > 0 || m.stun > 0 || m.mark > 0 || m.dispel > 0 || m.lex || m.weak > 0 || m.hexT > 0)) continue;   // nothing to draw: no per-mob cost
      if (d.boss && FB.defs && fbTierOk('mvp_burst')) fbRec('mvp_burst');   // an MVP on the map: have its burst ready
      if (m.frozen > 0) FB_FROZE.add(m);
      if (m.hexT > 0) { const ph = FB_HEX.get(m) || 0; if (m.hexT > ph + 0.5) fbSpawn('shadow_smoke', m.x, m.y, groundH(m.x, m.y), fbo(0.6)); FB_HEX.set(m, m.hexT); }
      const gh = groundH(m.x, m.y) + 0.05, sz = Math.max(0.6, (d.size || (d.look && d.look.scale) || 1)), hh = typeof headH === 'function' ? headH(m) : 1.4;
      const nl = d.variant || d.boss ? (typeof namedLook === 'function' ? namedLook(d) : null) : null;
      if (d.variant || d.boss) {   // named rares and MVPs: a slow rune circle + glow in their colour, rising motes
        const col = (nl && nl.col) || d.glow || '#ffb060', c = lc(col), r = 0.75 * sz * (nl ? Math.sqrt(nl.scl) : 1) + 0.25;
        ground(GA, 'runeCircle', m.x, m.y, gh, r, time * 0.22 + m.id, c, d.boss ? 0.32 : 0.5);
        ground(GA, 'glow', m.x, m.y, gh, r * 1.35, 0, c, d.boss ? 0.14 : 0.24);
        motes(m.x, m.y, gh, r * 0.8, d.boss ? 5 : 7, col, 1.2, 0.08);
      }
      if (m.snare > 0) { ground(GA, 'snare', m.x, m.y, gh + 0.01, 0.55 * Math.max(1, sz * 0.8), time * 0.2, lc(COL_SNARE), 0.9); }
      if (m.slow > 0) ground(GN, 'mud', m.x, m.y, gh + 0.01, 0.55 * Math.max(1, sz * 0.8), m.id, lc('#3a2810'), 0.55);
      if (m.frozen > 0) { const c = lc(COL_FROST); ground(GA, 'frostCircle', m.x, m.y, gh + 0.01, 0.6 * Math.max(1, sz * 0.8), 0, c, 0.6); for (let i = 0; i < 3; i++) { const a = m.id + i * 2.1; bill(BA, 'shard', m.x + Math.cos(a) * 0.35, m.y + Math.sin(a) * 0.35, gh + 0.25 + i * 0.12, 0.12, 0.34, 0.4 * Math.sin(a), c, 0.8); } }
      if (m.stun > 0) { const c = lc(COL_STUN); for (let i = 0; i < 3; i++) { const a = time * 4 + i * 2.094; bill(BA, 'star', m.x + Math.cos(a) * 0.35, m.y + Math.sin(a) * 0.35, gh + hh + 0.15, 0.22, 0.22, time * 2, c, 0.9); } }
      let tags = 0; const top = gh + hh + 0.5;
      if (m.mark > 0) tags++; if (m.dispel > 0) tags++; if (m.lex) tags++; if (m.weak > 0) tags++;
      if (tags) { let i = 0; const x0 = -(tags - 1) * 0.2, pul = 0.75 + 0.25 * Math.sin(time * 5 + m.id);
        const put = (rn, col) => { const o = x0 + i * 0.4; runeBill(rn, m.x + CR.x * o, m.y + CR.z * o, top + CR.y * o, 0.34, lc(col), pul); bill(BA, 'glow', m.x + CR.x * o, m.y + CR.z * o, top + CR.y * o, 0.3, 0.3, 0, lc(col), 0.35 * pul); i++; };
        if (m.mark > 0) put('ᛞ', COL_MARK); if (m.dispel > 0) put('ᚾ', COL_DISPEL); if (m.lex) put('ᛚ', COL_LEX);
        if (m.weak > 0) {   // weakened / armour broken: a cracked shield sagging over the head, a dull ember glow (fades out its last second)
          const o = x0 + i * 0.4, wa = Math.min(1, m.weak) * (0.8 + 0.2 * pul), sag = 0.05 * Math.sin(time * 2.2 + m.id), c = lc(COL_WEAK), x = m.x + CR.x * o, y = m.y + CR.z * o, h = top + CR.y * o + sag;
          bill(BN, 'glow', x, y, h, 0.4, 0.4, 0, lc('#1a0604'), 0.45 * wa); bill(BA, 'glow', x, y, h, 0.34, 0.34, 0, c, 0.3 * wa); bill(BA, 'brokenShield', x, y, h, 0.3, 0.3, 0.12 * Math.sin(time * 1.7 + m.id), c, wa); i++; } }
      if (m.hexT > 0) {    // Seidr Hex: the völva's bind-rune turning over the head, a spiked hex ring at the feet, dark drops falling
        const c = lc(COL_HEX), ha = Math.min(1, m.hexT * 1.5), hx = top + (tags ? 0.45 : 0.05), br = 0.8 + 0.2 * Math.sin(time * 3.3 + m.id);
        bill(BN, 'glow', m.x, m.y, hx, 0.72, 0.72, 0, lc('#12041c'), 0.6 * ha); bill(BA, 'glow', m.x, m.y, hx, 0.6, 0.6, 0, c, 0.45 * ha * br);
        bill(BA, 'seidr', m.x, m.y, hx, 0.48, 0.48, Math.sin(time * 0.9 + m.id) * 0.35, c, 0.95 * ha * br);
        ground(GA, 'hex', m.x, m.y, gh + 0.01, 0.5 * Math.max(1, sz * 0.8), -time * 0.8 + m.id, c, 0.55 * ha);
        if (q > 0.4 && Math.random() < dt * 5) { const cc = srgb('#2a0a3a'); PFX.emitDark(m.x + rand(-0.25, 0.25), gh + hh * rand(0.5, 0.9), m.y + rand(-0.15, 0.15), 0, -0.4, 0, -1.5, 0.8, 0.7, cc[0], cc[1], cc[2], 0.9, 0.06, 0.04, 0); }
      }
    }
  }

  /* ---------- quest beacons ---------- */
  let spots = [], spotsT = -1, spotsMap = null;
  const QCOL = { inspect: '#ffe08a', reach: '#9ae0ff', escort: '#9ae0ff', scene: '#9ae0ff', waves: '#ffa060', survive: '#ffa060', hunt: '#ff7a6a' };
  function drawSpots() {
    if (typeof questSpots !== 'function' || !P) return;
    if (time - spotsT > 0.25 || time < spotsT || spotsMap !== map) { try { spots = questSpots(); } catch (e) { spots = []; } spotsT = time; spotsMap = map; }
    const cine = typeof CINE !== 'undefined' && CINE.active ? 0.3 : 1;
    for (const s of spots) {
      const col = QCOL[s.kind] || '#ffe08a', c = lc(col), gh = groundH(s.x, s.y) + 0.05, pulse = 0.5 + 0.5 * Math.sin(time * 3 + s.x);
      if (s.kind === 'inspect') {
        const bob = Math.sin(time * 2.6 + s.y) * 0.1;
        pillarQ(BA, 'beam', s.x, s.y, gh, 0.9, 3.4, c, 0.42 * cine * (0.8 + 0.2 * pulse), 0);
        pillarQ(BA, 'beam', s.x, s.y, gh, 0.3, 3.6, WHITE, 0.3 * cine, 0);
        ground(GA, 'ring', s.x, s.y, gh, 0.62 + 0.04 * pulse, 0, c, 0.55 * cine);
        ground(GA, 'glow', s.x, s.y, gh, 0.9, 0, c, 0.3 * cine);
        if (cine === 1) { bill(BA, 'glow', s.x, s.y, gh + 1.45 + bob, 0.65, 0.65, 0, c, 0.5); bill(BN, 'qmark', s.x, s.y, gh + 1.45 + bob, 0.4, 0.4, 0, c, 1); }
        motes(s.x, s.y, gh, 0.4, 5 * cine, col, 1, 0.07);
      } else if (s.kind === 'waves' || s.kind === 'survive') {
        ground(GA, 'runeCircle', s.x, s.y, gh, 2.3, time * 0.15, c, (0.35 + 0.15 * pulse) * cine);
        ground(GA, 'glow', s.x, s.y, gh, 2.6, 0, c, 0.1 * cine);
        pillarQ(BA, 'beam', s.x, s.y, gh, 1.6, 3, c, 0.15 * cine, 0);
      } else if (s.kind === 'hunt') {
        ground(GA, 'ringDash', s.x, s.y, gh, 1.6, -time * 0.3, c, 0.45 * cine);
      } else {
        ground(GA, 'ringDash', s.x, s.y, gh, 1.25 + 0.08 * pulse, time * 0.4, c, 0.6 * cine);
        ground(GA, 'glow', s.x, s.y, gh, 1.5, 0, c, 0.15 * cine);
        pillarQ(BA, 'beam', s.x, s.y, gh, 1.3, 2.6, c, 0.2 * cine, 0);
      }
    }
  }


  /* ---------- Flipbooks (vfx round 7): the art team's hand-authored sheets, assets/vfx/index.json ----------
     { id, file, frameW, frameH, frames, cols, fps, loop, blend, anchor, plane, ppu, tint? }: frame i at column i % cols,
     row floor(i / cols); anchor = the pixel on the effect's world point; ppu px per world unit. blend 'add' = straight
     alpha with a = max(r, g, b), drawn additively (rgb * a); 'alpha' = normal blending.
     Textures load lazily on the first request (every sheet <= 128 colours: gfx-sheets.js palDecodeURL indexes it into an
     R8 index texture + a 256x1 RGBA palette, 1 byte per texel like the sprite sheets; RGBA TextureLoader fallback), and
     a sheet no frame used for FB_IDLE seconds gives its GPU memory back (the CPU copy stays; three re-uploads on use).
     Each sheet is one dynamic quad batch (created once when its texture lands, shared by every instance: one draw per
     sheet in use, no per-effect material or geometry); billboards face the camera and are pulled toward it in depth
     only (uPull) so their ground rings do not sink into the terrain; ground decals follow the terrain like GA/GN.
     Quality: FB_TIER gates each sheet by the adaptive level (fbLevel: low 0 .. ultra 3, minus 1-2 at deep auto levels),
     FB_CAP caps live instances, low plays 25% faster. Until a sheet is ready (or when it is gated off) every caller
     draws the procedural look it had before. */
  const FB_BASE = (typeof window !== 'undefined' && window.AOM_VFX_BASE) || 'assets/';
  const FB = { defs: null, loading: false, recs: {}, inst: [], free: [], pend: [], spawned: 0, dropped: 0, fails: 0, released: 0, sweep: 0 };
  const FB_TIER = { levelup: 0, job_levelup: 0, mvp_burst: 0, crit_star: 0, fire_burst: 0, lightning_strike: 0, holy_column: 0, ice_shatter: 0, shadow_smoke: 0, poison_cloud: 0,
    hit_spark: 1, lightning_impact: 1, impact_dust: 1, dodge_puff: 1, summon_smoke: 1, heal_sparkles: 1, soul_wisps: 1, rune_circle: 1, water_splash: 1, snow_puff: 1, fireball_trail: 1,
    warp_portal: 2, waystone_embers: 2, rain_ripple: 2 };
  const FB_CAP = [14, 28, 48, 64], FB_IDLE = 25, FB_PRE = ['hit_spark', 'crit_star', 'levelup', 'job_levelup'];
  let fbL = 2;
  function fbLevel() {
    const qq = gfxQ(), b = qq === 'low' ? 0 : qq === 'medium' ? 1 : qq === 'ultra' ? 3 : 2, lv = typeof GFX !== 'undefined' && GFX ? GFX.level | 0 : 0;
    return Math.max(0, b - (lv >= 6 ? 2 : lv >= 3 ? 1 : 0));
  }
  const fbTierOk = id => (FB_TIER[id] || 0) <= fbL;
  function fbDefs() {
    if (FB.defs || FB.loading) return FB.defs;
    FB.loading = true;
    const ok = j => { const D = {}; for (const e of (j && j.effects) || []) if (e && e.id && e.file && e.frameW > 0 && e.frameH > 0 && e.frames > 0 && e.cols > 0 && e.anchor) D[e.id] = e; FB.defs = D; };
    if (typeof sheetXHR === 'function') sheetXHR(FB_BASE + 'vfx/index.json', ok, () => { FB.defs = {}; }); else FB.defs = {};
    return null;
  }
  // Ready record of a sheet (textures + batch), else null; the first call starts its load.
  function fbRec(id) {
    const r = FB.recs[id];
    if (r) { if (r.ok) { r.used = time; return r; } return null; }
    const d = FB.defs && FB.defs[id]; if (!d) return null;
    FB.recs[id] = { id, d, ok: false, err: false, tex: null, pal: null, B: null, W: 0, H: 0, uv: null, uvf: null, used: time, gpu: false };
    fbLoad(FB.recs[id]); return null;
  }
  const fbReady = id => fbTierOk(id) && !!fbRec(id);
  function fbLoad(r) {
    const url = FB_BASE + r.d.file;
    const rgba = () => { try { new THREE.TextureLoader().load(url, t => { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.encoding = THREE.LinearEncoding; fbDone(r, t, null, t.image.width, t.image.height); }, undefined, () => { r.err = true; FB.fails++; }); } catch (e) { r.err = true; FB.fails++; } };
    if (typeof palDecodeURL !== 'function') return rgba();
    palDecodeURL(url, true, (x, why) => {
      if (!x) { if (why !== 'off') { FB.fails++; if (typeof console !== 'undefined') console.warn('[vfx] ' + r.id + ': indexed decode failed (' + why + '), loading RGBA'); } return rgba(); }
      const t = new THREE.DataTexture(x.idx, x.w, x.h, THREE.RedFormat, THREE.UnsignedByteType);
      t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.unpackAlignment = 1; t.flipY = false; t.needsUpdate = true;
      const p = new THREE.DataTexture(new Uint8Array(x.pal.buffer, 0, 1024), 256, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
      p.magFilter = p.minFilter = THREE.NearestFilter; p.generateMipmaps = false; p.needsUpdate = true;
      fbDone(r, t, p, x.w, x.h);
    });
  }
  function fbDone(r, tex, pal, W, H) {
    const d = r.d; r.tex = tex; r.pal = pal; r.W = W; r.H = H; tex.onUpdate = () => { r.gpu = true; };
    const n = Math.min(d.frames, d.cols * Math.floor(H / d.frameH)); if (n < 1) { r.err = true; FB.fails++; tex.dispose(); if (pal) pal.dispose(); return; }
    r.n = n; r.uv = []; r.uvf = [];
    for (let i = 0; i < n; i++) {   // frame rects (rows top-down in the PNG; v = 1 at the top), a quarter texel in so NEAREST never takes a neighbour
      const cx = i % d.cols, cy = Math.floor(i / d.cols), u0 = (cx * d.frameW + 0.25) / W, u1 = ((cx + 1) * d.frameW - 0.25) / W, v1 = 1 - (cy * d.frameH + 0.25) / H, v0 = 1 - ((cy + 1) * d.frameH - 0.25) / H;
      r.uv.push([u0, v0, u1, v1]); r.uvf.push([u1, v0, u0, v1]);
    }
    r.B = fbBatch(r, tex, pal); r.ok = true; r.used = time;
  }
  const FVS = `attribute vec4 vcol; uniform float uPull; varying vec2 vUv; varying vec4 vC;
    void main() { vUv = uv; vC = vcol; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
      if (uPull > 0.0) { vec4 q = projectionMatrix * (mv + vec4(0.0, 0.0, uPull, 0.0)); gl_Position.z = q.z / q.w * gl_Position.w; } }`;
  const FFS = `uniform sampler2D map; uniform float uLin; varying vec2 vUv; varying vec4 vC;
    #ifdef FB_PAL
    uniform sampler2D uPal; ivec2 fbMx;
    vec4 fbPal(ivec2 t) { return texelFetch(uPal, ivec2(int(texelFetch(map, clamp(t, ivec2(0), fbMx), 0).r * 255.0 + 0.5), 0), 0); }
    #endif
    void main() {
    #ifdef FB_PAL
      ivec2 ts = textureSize(map, 0); fbMx = ts - 1; vec2 p = vUv * vec2(ts), dx = dFdx(p), dy = dFdy(p); vec4 t;
      if (max(dot(dx, dx), dot(dy, dy)) <= 1.0) t = fbPal(ivec2(floor(p)));
      else { p -= 0.5; vec2 f = fract(p); ivec2 i = ivec2(floor(p)); vec4 a = fbPal(i), b = fbPal(i + ivec2(1, 0)), c = fbPal(i + ivec2(0, 1)), d = fbPal(i + ivec2(1, 1));
        a.rgb *= a.a; b.rgb *= b.a; c.rgb *= c.a; d.rgb *= d.a; t = mix(mix(a, b, f.x), mix(c, d, f.x), f.y); t.rgb /= max(t.a, 0.0001); }
    #else
      vec4 t = texture2D(map, vUv);
    #endif
      if (t.a < 0.004) discard;
    #ifdef FB_ADD
      vec3 c = t.rgb * t.a; float a = 1.0;
    #else
      vec3 c = t.rgb; float a = t.a;
    #endif
      if (uLin > 0.5) c = pow(c, vec3(2.2));
      gl_FragColor = vec4(c * vC.rgb, a * vC.a);
      #include <tonemapping_fragment>
      #include <encodings_fragment>
    }`;
  // A quad batch of one sheet (same buffers / flush as the atlas batches). add / ground pick blending and draw order:
  // smoke under glows, ground decals with the ground batches.
  function fbBatch(r, tex, pal, add, grd) {
    if (r) { add = r.d.blend === 'add'; grd = r.d.plane === 'ground'; }
    const defs = {}; if (pal) defs.FB_PAL = ''; if (add) defs.FB_ADD = '';
    const mat = new THREE.ShaderMaterial({ uniforms: { map: { value: tex }, uPal: { value: pal }, uLin: { value: 0 }, uPull: { value: grd ? 0 : 1.6 } }, vertexShader: FVS, fragmentShader: FFS,
      transparent: true, depthWrite: false, depthTest: true, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, side: THREE.DoubleSide, defines: defs });
    if (grd) { mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -6; }
    const B = { n: 0, cap: 0, mesh: null, pos: null, uv: null, col: null, mat, order: grd ? (add ? -0.92 : -1.1) : (add ? 3.2 : 2.9), pixel: false, warm: 0, fb: r };
    qalloc(B, r ? 24 : 1); QB.push(B); return B;
  }
  // The four flipbook programs (index / RGBA x add / alpha) compile with the first frames, not on the first effect.
  function fbWarm() {
    const pal = typeof palOn === 'function' && palOn();
    const t = pal ? new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RedFormat, THREE.UnsignedByteType) : new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
    if (pal) t.unpackAlignment = 1; t.needsUpdate = true;
    const p = pal ? new THREE.DataTexture(new Uint8Array(1024), 256, 1, THREE.RGBAFormat, THREE.UnsignedByteType) : null; if (p) p.needsUpdate = true;
    for (const add of [true, false]) { fbBatch(null, t, p, add, false); fbBatch(null, t, p, add, true); }
  }
  // One frame of a sheet: a camera-facing quad with the anchor on (x, h, y) (rot turns it in the screen plane, flip
  // mirrors it), or for ground sheets a terrain-following decal centred there (rot = heading). sc = size multiplier.
  function fbQuad(r, f, x, y, h, sc, c, a, rot, flip) {
    if (a <= 0.003 || f < 0 || f >= r.n) return;
    const d = r.d, B = r.B, s = sc / (d.ppu || 48); r.used = time;
    if (d.plane === 'ground') {
      const hw = d.frameW * 0.5 * s, hh = d.frameH * 0.5 * s, rx = Math.cos(rot || 0), rz = Math.sin(rot || 0), ux = rz, uz = -rx, n = segs(Math.max(hw, hh));
      gquad(B, r.uv[f], x - rx * hw + ux * hh, y - rz * hw + uz * hh, x + rx * hw + ux * hh, y + rz * hw + uz * hh, x - rx * hw - ux * hh, y - rz * hw - uz * hh, x + rx * hw - ux * hh, y + rz * hw - uz * hh,
        Math.max(0.02, h - groundH(x, y)), c, a, a, 0, 1, 0, 1, n, n);
      return;
    }
    let l = -d.anchor[0] * s, rr = (d.frameW - d.anchor[0]) * s; const t = d.anchor[1] * s, b = -(d.frameH - d.anchor[1]) * s;
    if (flip) { const k = l; l = -rr; rr = -k; }
    const cs = Math.cos(rot || 0), sn = Math.sin(rot || 0);
    const ax = CR.x * cs + CU.x * sn, ay = CR.y * cs + CU.y * sn, az = CR.z * cs + CU.z * sn, bx = CU.x * cs - CR.x * sn, by = CU.y * cs - CR.y * sn, bz = CU.z * cs - CR.z * sn;
    quad(B, flip ? r.uvf[f] : r.uv[f], x + ax * l + bx * t, h + ay * l + by * t, y + az * l + bz * t, x + ax * rr + bx * t, h + ay * rr + by * t, y + az * rr + bz * t,
      x + ax * l + bx * b, h + ay * l + by * b, y + az * l + bz * b, x + ax * rr + bx * b, h + ay * rr + by * b, y + az * rr + bz * b, c, a);
  }
  // A looping sheet drawn this frame (zones, auras, portals): true when drawn, false = draw the procedural look.
  function fbLoop(id, x, y, h, sc, c, a, rot, ph, flip) {
    if (!fbTierOk(id)) return false; const r = fbRec(id); if (!r) return false;
    const f = Math.floor(time * r.d.fps * (fbL === 0 ? 1.25 : 1) + (ph || 0)) % r.n;
    fbQuad(r, f < 0 ? f + r.n : f, x, y, h, sc, c, a, rot || 0, flip); return true;
  }
  /* Instances: one-shot sheets, or a looping sheet for dur seconds (fading in / out). Pooled objects.
     o: sc (size), c (colour, a cached lc() array), a (alpha), rot, flip, dur (loops), spd (playback), follow (entity:
     x / y / h become offsets from it, h above its ground). Returns the instance, or null (sheet gated / not loaded yet:
     the caller keeps its procedural look). */
  const FBO = { sc: 1, c: null, a: 1, rot: 0, flip: false, dur: 0, spd: 1, follow: null };
  const fbo = (sc, c, a, rot, flip, dur, follow) => { FBO.sc = sc === undefined ? 1 : sc; FBO.c = c || null; FBO.a = a === undefined ? 1 : a; FBO.rot = rot || 0; FBO.flip = !!flip; FBO.dur = dur || 0; FBO.spd = 1; FBO.follow = follow || null; return FBO; };
  function fbSpawn(id, x, y, h, o) {
    if (!fbTierOk(id)) return null; const r = fbRec(id);
    if (!r) {   // first use while the sheet loads: keep the request up to FB_WAIT s, then play it caught up (fbPending)
      const lr = FB.recs[id]; o = o || fbo();
      if (lr && !lr.err && FB.pend.length < 24) FB.pend.push({ id, x, y, h, sc: o.sc, c: o.c, a: o.a, rot: o.rot, flip: o.flip, dur: o.dur, fo: o.follow, t: time });
      return null;
    }
    const I = FB.inst, cap = FB_CAP[fbL];
    if (I.length >= cap) {   // full: a key effect (tier 0) replaces the oldest lesser one, anything else is dropped
      let k = -1; if (!(FB_TIER[id] || 0)) for (let i = 0; i < I.length; i++) if ((FB_TIER[I[i].r.id] || 0) > 0) { k = i; break; }
      if (k < 0) { FB.dropped++; return null; }
      FB.free.push(I[k]); I.splice(k, 1);
    }
    const e = FB.free.pop() || {};
    o = o || fbo();
    e.r = r; e.x = x; e.y = y; e.h = h; e.t = 0; e.sc = o.sc; e.c = o.c || WHITE; e.a = o.a; e.rot = o.rot; e.flip = o.flip; e.dur = o.dur; e.spd = (o.spd || 1) * (fbL === 0 ? 1.25 : 1); e.fo = o.follow;
    I.push(e); FB.spawned++; return e;
  }
  const FB_WAIT = 0.6;
  function fbPending() {
    const Q = FB.pend; let n = 0;
    for (let i = 0; i < Q.length; i++) {
      const p = Q[i], r = FB.recs[p.id], age = time - p.t;
      if (r && r.ok && age >= 0 && age < FB_WAIT) { const e = fbSpawn(p.id, p.x, p.y, p.h, fbo(p.sc, p.c, p.a, p.rot, p.flip, p.dur, p.fo)); if (e) e.t = age; continue; }
      if (!r || r.err || age < 0 || age >= FB_WAIT) continue;
      Q[n++] = p;
    }
    Q.length = n;
  }
  function fbDrawInst() {
    const I = FB.inst, fdt = SPRF.dt; let n = 0;   // game time (stops with the game, like the sprites)
    for (let i = 0; i < I.length; i++) {
      const e = I[i], r = e.r, d = r.d; e.t += fdt * e.spd;
      const f = Math.floor(e.t * d.fps), loop = d.loop && e.dur > 0;
      if (!r.ok || (loop ? e.t >= e.dur : f >= r.n) || (e.fo && e.fo.dead && !isHeroE(e.fo))) { e.r = null; e.fo = null; FB.free.push(e); continue; }
      I[n++] = e;
      let a = e.a; if (loop) a *= Math.min(1, e.t / 0.15, (e.dur - e.t) / 0.3);
      let x = e.x, y = e.y, h = e.h; if (e.fo) { x += e.fo.x; y += e.fo.y; h += groundH(x, y) + (e.fo.z || 0) / PXU; }
      fbQuad(r, loop ? f % r.n : f, x, y, h, e.sc, e.c, a, e.rot, e.flip);
    }
    I.length = n;
  }
  // GPU memory back from sheets nothing drew for FB_IDLE s (every ~2 s)
  function fbSweep() {
    for (const id in FB.recs) { const r = FB.recs[id]; if (!r.ok || !r.gpu || Math.abs(time - r.used) < FB_IDLE) continue; r.tex.dispose(); if (r.pal) r.pal.dispose(); r.gpu = false; FB.released++; }
  }
  function fbMem() { let b = 0, n = 0; for (const id in FB.recs) { const r = FB.recs[id]; if (r.ok && r.gpu) { b += r.pal ? r.W * r.H + 1024 : r.W * r.H * 4; n++; } } return { MB: +(b / 1048576).toFixed(2), sheets: n }; }

  /* ---------- game events -> flipbooks (read from the runtime state, like everything here) ----------
     fxs 'spark' -> hit_spark / crit_star (a red hit_spark when the hero is hurt); 'meteor' -> by colour: fire_burst,
     poison_cloud (rot green), shadow_smoke (violet), ice_shatter (blue), holy_column (gold / white); 'strike' ->
     lightning_strike + lightning_impact; 'pillar' -> levelup (base level, #ffd76a), job_levelup (job level #7fe0d4,
     class change #f0d070), holy_column (gold / white pillars), else a tinted rune_circle flash under the procedural
     column; 'rain' (Arrow Shower) -> impact_dust. Projectiles that reach their target: fire -> fire_burst, ice ->
     ice_shatter, bolt -> lightning_impact, holy -> holy_column, soul -> shadow_smoke, spear -> impact_dust; fire bolts fly
     as fireball_trail. Telegraph booms without their own effect -> impact_dust (water_splash on water, snow_puff on
     snow); boss circle telegraphs get a heat-tinted rune_circle under the decal. Floats: a heal -> heal_sparkles once;
     an SP drink (Soul Drain / Spell Breaker '+n' sp) -> soul_wisps once. Monsters: an MVP falls -> mvp_burst; a summoned
     add appears -> summon_smoke; a freeze ends -> ice_shatter; Seidr Hex lands -> shadow_smoke. The hero: dodge ->
     dodge_puff (snow_puff on snow, mirrored to the motion), footfalls on snow -> snow_puff. Ambient: warp portals ->
     warp_portal, a kindled waystone -> waystone_embers, rain -> rain_ripple (splash rings on water tiles and puddles). */
  const FB_SEEN = new WeakSet(), FB_HEX = new WeakMap(), FB_FROZE = new Set(), FB_PP = [], FB_PT = [], FB_PZ = [], FB_MET = [];
  let fbMap = null, fbDodge = false, fbHealT = -9, fbSoulT = -9, fbStepT = -9;
  const HUEC = new Map();
  function hueClass(hex) {
    let k = HUEC.get(hex); if (k) return k;
    const hsl = { h: 0, s: 0, l: 0 }; new THREE.Color(hex || '#ffffff').getHSL(hsl); const hh = hsl.h * 360;
    k = hsl.s < 0.22 || hsl.l > 0.86 ? 'holy' : hh < 38 || hh >= 330 ? 'fire' : hh < 70 ? 'holy' : hh < 170 ? 'rot' : hh < 250 ? 'ice' : 'shadow';
    HUEC.set(hex, k); return k;
  }
  const FB_BY_CLASS = { fire: 'fire_burst', rot: 'poison_cloud', shadow: 'shadow_smoke', ice: 'ice_shatter', holy: 'holy_column' };
  const onWater = (x, y) => typeof tileAt === 'function' && typeof T !== 'undefined' && T && tileAt(x, y) === T.WATER;
  const onSnow = () => !!(map && map.d && map.d.look && map.d.look.floor === 'snow');
  function fbImpact(x, y, sc) {   // generic ground impact: dust, a splash on water, a puff on snow
    const gh = groundH(x, y);
    if (onWater(x, y)) return fbSpawn('water_splash', x, y, gh, fbo(sc));
    return fbSpawn(onSnow() ? 'snow_puff' : 'impact_dust', x, y, gh, fbo(sc));
  }
  function fbFx(f) {
    const k = f.k;
    if (k === 'spark') {
      const rot = (Math.random() - 0.5) * 0.9, fl = Math.random() < 0.5;
      if (f.hurt) { if (fbSpawn('hit_spark', f.x, f.y, f.h, fbo(0.5, lc('#ff6a50'), 1, rot, fl))) f._fb = 1; return; }
      const hk = ANIME.on() ? 0.78 : 1;   // anime effects on: smaller puffs, the slash cut carries the hit and the target stays readable
      if (f.crit) { const e = fbSpawn('crit_star', f.x, f.y, f.h, fbo(0.72 * hk, null, 1, rot * 0.5)); fbSpawn('hit_spark', f.x, f.y, f.h, fbo(0.62 * hk, null, 1, rot, fl)); if (e) f._fb = 1; return; }
      if (fbSpawn('hit_spark', f.x, f.y, f.h, fbo(0.62 * hk, null, 1, rot, fl))) f._fb = 1;
    } else if (k === 'meteor') {
      const cls = hueClass(f.col || '#ff7a2a'), gh = groundH(f.x, f.y);
      if (fbSpawn(FB_BY_CLASS[cls], f.x, f.y, gh, fbo(cls === 'holy' ? 0.8 : cls === 'rot' ? 0.75 : 1))) f._fb = 1;
      if (onWater(f.x, f.y)) fbSpawn('water_splash', f.x, f.y, gh, fbo(1.1));
      FB_MET.push(f.x, f.y);
    } else if (k === 'strike') {
      const gh = groundH(f.x, f.y);
      if (fbSpawn('lightning_strike', f.x, f.y, gh, fbo(1, lc('#e4f0ff')))) { f._fb = 1; fbSpawn('lightning_impact', f.x, f.y, gh, fbo(0.75, lc('#e4f0ff'))); }
      FB_MET.push(f.x, f.y);
    } else if (k === 'pillar') {
      const e = f.e; if (!e || e.x === undefined) return;
      const fo = isHeroE(e) ? e : null, col = String(f.col || '#ffffff').toLowerCase(), x = fo ? 0 : e.x, y = fo ? 0 : e.y, h = fo ? 0 : groundH(e.x, e.y);
      if (col === '#ffd76a') { if (fbSpawn('levelup', x, y, h, fbo(1, null, 1, 0, false, 0, fo))) f._fb = 1; return; }
      if (col === '#7fe0d4') { if (fbSpawn('job_levelup', x, y, h, fbo(1, null, 1, 0, false, 0, fo))) f._fb = 1; return; }
      if (col === '#f0d070') { if (fbSpawn('job_levelup', x, y, h, fbo(1.1, lc('#ffe8a0'), 1, 0, false, 0, fo))) { fbSpawn('holy_column', x, y, h, fbo(1.1, null, 1, 0, false, 0, fo)); f._fb = 1; } return; }
      if (hueClass(col) === 'holy') { if (fbSpawn('holy_column', x, y, h, fbo(f.big ? 1 : 0.78, null, 1, 0, false, 0, fo))) f._fb = 1; return; }
      fbSpawn('rune_circle', x, y, h + 0.04, fbo((f.big ? 1.3 : 1) * 0.5, lc(col), 0.9, time, false, f.dur || 0.9, fo));
    } else if (k === 'rain') fbImpact(f.x, f.y, 1.25);
  }
  function fbProjEnd(p) {
    const t = p.to; if (!t || t.x === undefined || Math.hypot(t.x - p.x, t.y - p.y) > 1.3) return;
    const gh = groundH(t.x, t.y);
    switch (p.kind) {
      case 'fire': fbSpawn('fire_burst', t.x, t.y, gh, fbo(0.72)); break;
      case 'ice': fbSpawn('ice_shatter', t.x, t.y, gh, fbo(0.7)); break;
      case 'bolt': fbSpawn('lightning_impact', t.x, t.y, gh, fbo(0.85, lc('#fff6c8'))); break;
      case 'holy': fbSpawn('holy_column', t.x, t.y, gh, fbo(0.6)); break;
      case 'soul': fbSpawn('shadow_smoke', t.x, t.y, gh, fbo(0.55)); break;
      case 'spear': fbImpact(t.x, t.y, 0.7); break;
    }
  }
  const FB_PK = { fire: 1, ice: 1, bolt: 1, holy: 1, soul: 1, spear: 1 };
  function fbBoom(t) {
    if (t.shape && t.shape.kind === 'cone') return;   // breath cones: every circle of the ray booms with its own meteor
    for (let i = 0; i < FB_MET.length; i += 2) if (Math.abs(FB_MET[i] - t.x) < 0.7 && Math.abs(FB_MET[i + 1] - t.y) < 0.7) return;
    fbImpact(t.x, t.y, clamp((t.r || 1) / 1.1, 0.6, 2));
  }
  function fbEvents() {
    if (fbMap !== map) { fbMap = map; FB_PP.length = 0; FB_PT.length = 0; FB_PZ.length = 0; FB_FROZE.clear(); fbDodge = false; }
    FB_MET.length = 0;
    for (let i = 0; i < fxs.length; i++) { const f = fxs[i]; if (f._fs) continue; f._fs = 1; fbFx(f); }
    for (let i = 0; i < floats.length; i++) {
      const f = floats[i]; if (f._fs) continue; f._fs = 1;
      if (f.kind === 'heal' && !f.small && time - fbHealT > 0.35) { fbHealT = time; const me = heroAt(f.x, f.y, 0.6); fbSpawn('heal_sparkles', me ? 0 : f.x, me ? 0 : f.y, me ? 0 : groundH(f.x, f.y), fbo(0.9, null, 1, 0, false, 1, me)); }
      else if (f.kind === 'sp' && f.txt && f.txt[0] === '+' && time - fbSoulT > 0.5) { fbSoulT = time; fbSpawn('soul_wisps', 0, 0, 0.15, fbo(0.85, null, 1, 0, false, 1.1, P)); }
    }
    // projectiles that left projs[] this frame at their target; telegraphs that went off (not cancelled)
    for (let i = 0; i < FB_PP.length; i++) if (projs.indexOf(FB_PP[i]) < 0) fbProjEnd(FB_PP[i]);
    FB_PP.length = 0; for (let i = 0; i < projs.length; i++) if (FB_PK[projs[i].kind]) FB_PP.push(projs[i]);
    for (let i = 0; i < FB_PT.length; i++) { const t = FB_PT[i]; if (teles.indexOf(t) < 0 && t.t >= t.dur - 0.08 && !(t.m && t.m.dead)) fbBoom(t); }
    FB_PT.length = 0; for (let i = 0; i < teles.length; i++) FB_PT.push(teles[i]);
    // zones that ended: Thurisaz bursts
    for (let i = 0; i < FB_PZ.length; i++) { const z = FB_PZ[i]; if (zones.indexOf(z) < 0 && z.t >= z.dur - 0.1) { const gh = groundH(z.x, z.y); fbSpawn('lightning_impact', z.x, z.y, gh, fbo(1.15, lc('#ffe070'), 0.85)); fbImpact(z.x, z.y, 1.3); } }
    FB_PZ.length = 0; for (let i = 0; i < zones.length; i++) if (zones[i].kind === 'thurisaz') FB_PZ.push(zones[i]);
    // freezes that ended
    FB_FROZE.forEach(m => { if (m.dead || !(m.frozen > 0)) { FB_FROZE.delete(m); fbSpawn('ice_shatter', m.x, m.y, groundH(m.x, m.y), fbo(0.62)); } });
    // the heroes' dodges (footfalls on snow: V.step)
    if (P && started) {
      const H = heroList();
      for (let i = 0; i < H.length; i++) {
        const h = H[i], hs = h === P ? null : typeof heroState === 'function' ? heroState(h) : null, was = hs ? hs.dodge : fbDodge, dg = h.dodgeT > 0;
        if (dg && !was) { const sr = (h.fx || 0) * SPRF.rx + (h.fy || 0) * SPRF.ry; fbSpawn(onSnow() ? 'snow_puff' : 'dodge_puff', h.x, h.y, groundH(h.x, h.y), fbo(0.95, null, 0.9, 0, sr < 0)); }
        if (hs) hs.dodge = dg; else fbDodge = dg;
      }
    }
  }
  // The hero standing on (x, y) within r (heal sparkles follow it), or null. P first.
  function heroAt(x, y, r) { const H = heroList(); for (let i = 0; i < H.length; i++) if (Math.hypot(x - H[i].x, y - H[i].y) < r) return H[i]; return null; }
  V.step = (e, gh, mounted) => {   // sprMotion footfall hook: powder kicked up on snow maps
    if (!isHeroE(e) || !onSnow() || time - fbStepT < 0.18) return; fbStepT = time;
    fbSpawn('snow_puff', e.x - (e.fx || 0) * 0.15, e.y - (e.fy || 0) * 0.15, gh, fbo(mounted ? 0.55 : 0.38, null, 0.85));
  };
  function fbAmbient() {
    // warp portals near the view (locked ones keep the red procedural ring), the kindled waystone's embers
    for (const wp of map.warps || []) {
      const x = wp.x + 0.5, y = wp.y + 0.5; if (Math.abs(x - cam.tx) > 26 || Math.abs(y - cam.ty) > 26) continue;
      if ((typeof warpIsLocked === 'function' && warpIsLocked(wp)) || wp.door) continue;   // (cycle 9: doors / cave mouths are drawn by gfx-world)
      fbLoop('warp_portal', x, y, groundH(x, y), 0.95, WHITE, 0.85, 0, wp.x * 3 + wp.y);
    }
    if (map.way && P && P.kindled && P.kindled[map.id] && Math.abs(map.way.x - cam.tx) < 26 && Math.abs(map.way.y - cam.ty) < 26) fbLoop('waystone_embers', map.way.x, map.way.y, groundH(map.way.x, map.way.y), 1.1, WHITE, 1, 0, 3);
    // rain: splash rings around the hero (more of them on water)
    const rain = typeof GFX !== 'undefined' && GFX.wx ? GFX.wx.rain || 0 : 0;
    if (rain > 0.25 && P && fbTierOk('rain_ripple')) {
      const n = rate(22 * rain);
      for (let i = 0; i < n; i++) { const x = P.x + rand(-7, 7), y = P.y + rand(-5, 6), tl = typeof tileAt === 'function' ? tileAt(x, y) : 0; if (typeof T !== 'undefined' && T && (tl === T.WALL || tl === T.TREE || tl === T.VOID || tl === T.LAVA)) continue;
        fbSpawn('rain_ripple', x, y, groundH(x, y) + 0.03, fbo(tl === T.WATER ? rand(0.45, 0.7) : rand(0.25, 0.4), null, tl === T.WATER ? 0.8 : 0.5, Math.random() * 6.28)); }
    }
  }
  // Boss circle telegraphs: a rune circle turning inside the ember decal, heating up to the blast.
  const _heat = [0, 0, 0];
  function fbTeles() {
    for (const t of teles) {
      if (t.shape || !(t.m && t.m.d && t.m.d.boss) || t.m.dead) continue;
      const k = clamp(t.t / t.dur, 0, 1), late = smoothstep(0.6, 1, k), c0 = lc('#ff5a14'), c1 = lc('#fff0c0');
      _heat[0] = c0[0] + (c1[0] - c0[0]) * late; _heat[1] = c0[1] + (c1[1] - c0[1]) * late; _heat[2] = c0[2] + (c1[2] - c0[2]) * late;
      fbLoop('rune_circle', t.x, t.y, groundH(t.x, t.y) + 0.06, t.r * 2 / 5.333 * 0.84, _heat, 0.3 + 0.55 * k, -time * 0.6 - t.x, t.x * 5);
    }
  }
  // The hero's cast circle (replaces the flat decal of syncDecals once the sheet is in)
  function fbCast() {   // every hero casting (squad mode)
    const H = heroList();
    for (let i = 0; i < H.length; i++) {
      const h = H[i]; if (!h.casting || h.dead || typeof SKILLS === 'undefined' || !SKILLS[h.casting.id]) continue;
      const col = (typeof ELCOL !== 'undefined' && ELCOL[SKILLS[h.casting.id].el]) || '#ffffff';
      fbLoop('rune_circle', h.x, h.y, groundH(h.x, h.y) + 0.07, 0.5 * (1 + 0.04 * Math.sin(time * 6)), lc(col), 0.95, time * 1.4, i);
    }
  }

  /* ---------- per frame ---------- */
  function init() {
    atlas = paintAtlas(); pix = paintPixels();
    GN = qbatch({ add: false, ground: true, order: -1.2, cap: 128 });
    GA = qbatch({ add: true, ground: true, order: -0.9, cap: 512 });
    PB = qbatch({ pixel: true, add: false, order: -0.4, cap: 16 });
    BA = qbatch({ add: true, order: 3, cap: 256 });
    BN = qbatch({ add: false, order: 3.5, cap: 16 });
    for (const B of QB) B.mat.uniforms.map.value = B === PB ? pix : atlas;
    fbWarm(); fbDefs();
    V.ready = true;
    if (typeof QUEST_UI !== 'undefined') { QUEST_UI.skills = false; QUEST_UI.spots = false; }   // js/ui.js placeholders stand down
  }
  V.sync = function (frameDt) {
    if (!V.enabled || typeof started === 'undefined' || !started || !map) { if (V.ready) { for (const B of QB) { B.n = 0; } flush(); for (const m of SPH) m.visible = false; } return; }
    if (!V.ready) init();
    if (typeof QUEST_UI !== 'undefined' && QUEST_UI.skills !== false) { QUEST_UI.skills = false; QUEST_UI.spots = false; }
    dt = clamp(frameDt || SPRF.dt || 0.016, 0, 0.1); q = gfxQ() === 'low' ? 0.4 : gfxQ() === 'medium' ? 0.7 : 1;
    camera.updateMatrixWorld(); const e = camera.matrixWorld.elements;
    CR.set(e[0], e[1], e[2]).normalize(); CU.set(e[4], e[5], e[6]).normalize(); CP.set(e[12], e[13], e[14]);
    HR.set(CR.x, 0, CR.z).normalize(); yawA = -cam.yaw;
    for (const B of QB) B.n = 0; sphN = 0;
    fbL = fbLevel();
    if (FB.defs && !FB.pre) { FB.pre = true; for (const id of FB_PRE) if (fbTierOk(id)) fbRec(id); }
    fbEvents();
    for (const z of zones) drawZone(z);
    for (let i = V.extra.length - 1; i >= 0; i--) { const X = V.extra[i]; X.t += dt; if (X.t >= X.dur) { V.extra.splice(i, 1); continue; } if (X.zone) { X.zone.t = X.t; drawZone(X.zone); } }
    drawShapes(); drawAuras(); drawSpheres(); drawSquad(); drawProjs(); drawFx(); drawMobs(); drawSpots();
    fbTeles(); fbCast(); fbAmbient(); fbPending(); fbDrawInst();
    if (++FB.sweep % 120 === 0) fbSweep();
    for (let i = sphN; i < SPH.length; i++) SPH[i].visible = false;
    flush();
  };
  /* one-off API (optional; content does not need it) */
  V.zone = o => { V.extra.push({ t: 0, dur: o.dur || 2, zone: Object.assign({ t: 0, dur: o.dur || 2, r: 2, col: '#ffffff' }, o) }); };
  V.cone = o => { V.extra.push({ t: 0, dur: o.dur || 1, col: o.col, shape: { kind: 'cone', x: o.x, y: o.y, ang: o.ang, half: o.half || 0.45, len: o.len || 6 } }); };
  V.lines = o => { V.extra.push({ t: 0, dur: o.dur || 1, col: o.col, shape: { kind: 'lines', x: o.x, y: o.y, ang: o.ang, n: o.n || 1, spread: o.spread || 0.4, len: o.len || 9, w: o.w || 1.9 } }); };
  V.bolt = (x0, y0, h0, x1, y1, h1, col) => bolt(x0, y0, h0, x1, y1, h1, col, 0.25, 1);
  V.beam = (x, y, col, big) => fxs.push({ k: 'pillar', e: { x, y }, col, t: 0, dur: big ? 1.4 : 0.9, big });
  V.clear = () => { BOLTS.length = 0; V.extra.length = 0; for (const e of FB.inst) { e.r = null; e.fo = null; FB.free.push(e); } FB.inst.length = 0; FB.pend.length = 0; };
  // Flipbooks (round 7): VFX.flip(id, x, y, h, { sc, c: '#hex', a, rot, flip, dur, follow }) plays a sheet once (loops for
  // dur s); returns false while the sheet is loading / gated. VFX.fbReady(id) starts / checks a load. VFX.fbMem(): GPU MB.
  V.flip = (id, x, y, h, o) => { o = o || {}; const e = fbSpawn(id, x, y, h === undefined ? groundH(x, y) : h, fbo(o.sc, o.c ? lc(o.c) : null, o.a, o.rot, o.flip, o.dur, o.follow)); if (e && o.t0) e.t = o.t0; return !!e; };
  V.fbReady = id => V.ready && fbReady(id);
  V.fbMem = fbMem;
  V.fbInfo = () => ({ defs: FB.defs ? Object.keys(FB.defs).length : 0, loaded: Object.keys(FB.recs).filter(k => FB.recs[k].ok), pal: Object.keys(FB.recs).filter(k => FB.recs[k].pal).length, inst: FB.inst.length, spawned: FB.spawned, dropped: FB.dropped, fails: FB.fails, released: FB.released, level: fbL, mem: fbMem() });
  V.debugAtlas = () => atlas && atlas.image;   // for tools (tools/shoot.js can dump it)
  V.stats = () => ({ quads: QB.map(B => B.n), spheres: sphN, bolts: BOLTS.length, flipbooks: FB.inst.length });
  return V;
})();

/* ---------- Screen projection into reusable arrays ----------
   Same math as gfx-world.js proj() (Vector3.project), but writes into a caller-owned array: no garbage per call. */
const _pv = new THREE.Vector3(), PA = [0, 0, 0], PB = [0, 0, 0];
function projTo(o, x, y, z) { _pv.set(x, z, y).project(camera); o[0] = (_pv.x * 0.5 + 0.5) * W; o[1] = (-_pv.y * 0.5 + 0.5) * H; o[2] = _pv.z; return o; }
/* ---------- Picking ---------- */
function pickAt(sx, sy) {
  let best = null, bd = 1e9;
  const test = (e, hw, rw) => { const gh = groundH(e.x, e.y) + (e.z || 0) / PXU; const p = projTo(PA, e.x, e.y, gh + hw * 0.5); if (p[2] > 1) return; const d = Math.hypot(sx - p[0], sy - p[1]), r = Math.max(16, rw * PPU); if (d < r && d < bd) { bd = d; best = e; } };
  for (const m of mobs) if (!m.dead) { const hw = headH(m); test(m, hw, Math.max(0.45, hw * 0.4)); }
  for (const n of map.npcs) test(n, headH(n), 0.55);
  for (const o of map.objs) if (o.kind !== 'anvil') test(o, o.kind === 'heart' ? 2.5 : 2.6, 0.8);
  for (const d of drops) test(d, 0.4, 0.35);
  return best;
}
/* ---------- Overlay ---------- */
const UIFONT = `'Nanum Gothic', 'Trebuchet MS', Tahoma, sans-serif`;
const NUMFONT = `'Arial Black', 'Arial Bold', Gadget, 'Nanum Gothic', sans-serif`;
function rrect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
const LFONT = new Map(), LWIDTH = new Map();
function labelFont(size) { let f = LFONT.get(size); if (!f) { f = `700 ${size}px ${UIFONT}`; LFONT.set(size, f); } return f; }
// measureText once per (size, text); ctx.font must already be labelFont(size)
function labelWidth(txt, size) {
  let m = LWIDTH.get(size); if (!m) { m = new Map(); LWIDTH.set(size, m); }
  let w = m.get(txt); if (w === undefined) { if (m.size > 400) m.clear(); w = ctx.measureText(txt).width; m.set(txt, w); } return w;
}
function label(txt, x, y, col, size, box) {
  ctx.font = labelFont(size); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  if (box) { const w = labelWidth(txt, size) + 12; ctx.fillStyle = 'rgba(12,10,16,.72)'; rrect(ctx, x - w / 2, y - size - 1, w, size + 7, 4); ctx.fill(); ctx.strokeStyle = 'rgba(255,236,200,.22)'; ctx.lineWidth = 1; ctx.stroke(); }
  ctx.lineWidth = 3.2; ctx.strokeStyle = 'rgba(8,6,10,.92)'; ctx.lineJoin = 'round'; ctx.strokeText(txt, x, y); ctx.fillStyle = col; ctx.fillText(txt, x, y);
}
function star(x, y, r1, r2, n, col, rot) { ctx.fillStyle = col; ctx.beginPath(); for (let i = 0; i < n * 2; i++) { const a = i * Math.PI / n - Math.PI / 2 + (rot || 0), r = i % 2 ? r2 : r1; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.closePath(); ctx.fill(); }
// Vertical gauge gradients, cached per (c0, c1, h) in a local 0..h space (drawn under a y translation).
const GGRAD = new Map();
function gaugeGrad(c0, c1, h) {
  let a = GGRAD.get(c0); if (!a) { a = new Map(); GGRAD.set(c0, a); }
  let b = a.get(c1); if (!b) { b = new Map(); a.set(c1, b); }
  let g = b.get(h); if (!g) { g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, c0); g.addColorStop(1, c1); b.set(h, g); }
  return g;
}
// Framed gauge: dark rounded frame with a thin light rim, gradient fill, optional lag chip.
function gauge(x, y, w, h, k, c0, c1, lag) {
  k = clamp(k, 0, 1);
  ctx.fillStyle = 'rgba(8,8,14,.82)'; rrect(ctx, x - 1.5, y - 1.5, w + 3, h + 3, 2.5); ctx.fill();
  ctx.strokeStyle = 'rgba(255,238,205,.32)'; ctx.lineWidth = 1; ctx.stroke();
  if (lag !== undefined && lag > k) { ctx.fillStyle = 'rgba(255,226,150,.85)'; ctx.fillRect(x + w * k, y, w * (lag - k), h); }
  if (k > 0) { ctx.fillStyle = gaugeGrad(c0, c1, h); ctx.translate(0, y); ctx.fillRect(x, 0, w * k, h); ctx.translate(0, -y); ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fillRect(x, y, w * k, Math.max(1, h * 0.34)); }
}
const HPLAG = new WeakMap();
function lagOf(e, k) { let l = HPLAG.get(e); if (l === undefined || k > l) l = k; else l = Math.max(k, l - SPRF.dt * 0.9); HPLAG.set(e, l); return l; }
// Damage-number glyph cache: outlined, gradient-filled strings rendered once per (text, style).
const NUMSTYLE = {
  dmg: { top: '#ffffff', bot: '#ffe2b8', edge: '#5a3418', size: 24 },
  crit: { top: '#fff8b0', bot: '#ff9a14', edge: '#8a1a00', size: 32 },
  hurt: { top: '#ffc0b0', bot: '#ff3424', edge: '#4a0606', size: 24 },
  heal: { top: '#e0ffd0', bot: '#38e048', edge: '#0a3a12', size: 20 },
  sp: { top: '#e0f0ff', bot: '#4a9aff', edge: '#0a2450', size: 20 },
  miss: { top: '#ffffff', bot: '#c8c0b0', edge: '#302a24', size: 16, italic: true, font: UIFONT, w: 800 },
  skill: { top: '#fffbe8', bot: '#ffd060', edge: '#4a2a00', size: 16, font: `Georgia, 'Times New Roman', serif`, w: 700, italic: true },
  lvl: { top: '#fff8c0', bot: '#f0a020', edge: '#6a3a00', size: 30 },
  job: { top: '#e0fff8', bot: '#3ad8c8', edge: '#063a34', size: 24 },
  shout: { top: '#ffe0c8', bot: '#ff6a3a', edge: '#4a1204', size: 22 },
  info: { top: '#f0f8ff', bot: '#9ad0ff', edge: '#0e2a44', size: 15, font: UIFONT, w: 800 },
};
const NUMC = new Map();
function numGlyph(txt, kind, px) {
  const key = kind + '|' + px + '|' + txt; let c = NUMC.get(key); if (c) return c;
  if (NUMC.size > 240) NUMC.clear();
  const st = NUMSTYLE[kind] || NUMSTYLE.info, q = Math.max(1, DPR), font = `${st.italic ? 'italic ' : ''}${st.w || 900} ${px * q}px ${st.font || NUMFONT}`;
  const g0 = mkCanvas(4, 4).getContext('2d'); g0.font = font; const tw = g0.measureText(txt).width;
  const pad = px * 0.4 * q; c = mkCanvas(Math.ceil(tw + pad * 2), Math.ceil(px * q * 1.5 + pad)); const g = c.getContext('2d');
  const cx = c.width / 2, cy = c.height / 2 + px * q * 0.05; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.fillStyle = 'rgba(0,0,0,.45)'; g.fillText(txt, cx + px * q * 0.06, cy + px * q * 0.1);                      // drop shadow
  g.strokeStyle = '#0a0608'; g.lineWidth = px * q * 0.26; g.strokeText(txt, cx, cy);                              // outer outline
  g.strokeStyle = st.edge; g.lineWidth = px * q * 0.12; g.strokeText(txt, cx, cy);                                // coloured inner edge
  const gr = g.createLinearGradient(0, cy - px * q * 0.45, 0, cy + px * q * 0.45); gr.addColorStop(0, st.top); gr.addColorStop(0.55, st.top); gr.addColorStop(1, st.bot);
  g.fillStyle = gr; g.fillText(txt, cx, cy);
  c.cw = c.width / q; c.ch = c.height / q; NUMC.set(key, c); return c;
}
/* Overlay caches: pre-rendered radial glows (drawn with drawImage + globalAlpha: every gradient below has all its
   stop alphas proportional to the per-frame fade, so this is the same image), rgba() strings per colour, label
   strings per mob type / drop, glyph lookups per float. */
const GLOWC = new Map();
function glowCanvas(key, w, h, paint) { let c = GLOWC.get(key); if (!c) { c = mkCanvas(w, h); paint(c.getContext('2d'), w, h); GLOWC.set(key, c); } return c; }
// projectile head: '#fff' -> col (0.35) -> transparent, radius 32 px
const projHead = col => glowCanvas('ph' + col, 64, 64, g => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, '#fff'); gr.addColorStop(0.35, col); gr.addColorStop(1, rgba(col, 0)); g.fillStyle = gr; g.beginPath(); g.arc(32, 32, 32, 0, 7); g.fill(); });
// hit spark glow at full alpha (drawn with globalAlpha = fade), radius 64 px
const sparkGlow = hurt => glowCanvas(hurt ? 'sgh' : 'sg', 128, 128, g => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, hurt ? 'rgba(255,140,120,0.8)' : 'rgba(255,250,220,0.85)'); gr.addColorStop(1, 'rgba(255,200,120,0)'); g.fillStyle = gr; g.beginPath(); g.arc(64, 64, 64, 0, 7); g.fill(); });
// meteor scorch: circular gradient radius 160 clipped to a 160 x 96 ellipse, full alpha
const meteorGlow = col => glowCanvas('mg' + col, 320, 192, g => { const gr = g.createRadialGradient(160, 96, 0, 160, 96, 160); gr.addColorStop(0, rgba('#fff0c0', 1)); gr.addColorStop(0.4, rgba(col, 0.7)); gr.addColorStop(1, rgba(col, 0)); g.fillStyle = gr; g.beginPath(); g.ellipse(160, 96, 160, 96, 0, 0, 7); g.fill(); });
const PILLARG = new Map();
function pillarGrad(col) { let g = PILLARG.get(col); if (!g) { g = ctx.createLinearGradient(0, 0, 0, 1); g.addColorStop(0, rgba(col, 0)); g.addColorStop(1, rgba(col, 0.6)); PILLARG.set(col, g); } return g; }
const RGBAC = new Map();
function rgbaC(col) { let c = RGBAC.get(col); if (!c) { c = { a0: rgba(col, 0), a8: rgba(col, 0.8) }; RGBAC.set(col, c); } return c; }
const MLBL = new Map();
function mobLabel(d) { let L = MLBL.get(d); if (!L || L.n !== d.name || L.l !== d.lvl) { L = { n: d.name, l: d.lvl, txt: `${d.name}  Lv ${d.lvl}` }; MLBL.set(d, L); } return L.txt; }
const DROPCOL = { common: '#ffffff', magic: '#9ab8ff', rare: '#ffe070', unique: '#ffb050', card: '#e0c4ff', key: '#ffc090' };
const DLBL = new WeakMap();
function dropLabel(d) {
  let L = DLBL.get(d); const q = d.item ? d.item.qty : 0;
  if (!L || L.q !== q || L.z !== d.zeny) {
    const rar = d.item ? rarityOf(d.item) : null;
    L = { q, z: d.zeny, show: !!(d.lost || (d.item && (rar === 'unique' || rar === 'card' || rar === 'key' || rar === 'rare'))),
      txt: d.lost ? `Your lost zeny (${fmt(d.zeny)})` : d.zeny ? `${fmt(d.zeny)} zeny` : itemName(d.item) + (d.item.qty > 1 ? ` ×${d.item.qty}` : ''),
      col: d.lost ? '#ff9a9a' : d.zeny ? '#ffe070' : DROPCOL[rar] };
    DLBL.set(d, L);
  }
  return L;
}
function drawOverlay() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, W, H);
  const sc = clamp(PPU / 34, 0.75, 1.5), a = PA, b = PB;
  // Particles and spell effects (additive)
  ctx.globalCompositeOperation = 'lighter';
  for (const p of parts) { const q = projTo(a, p.x, p.y, groundH(p.x, p.y) + p.z / PXU); if (q[2] > 1) continue; ctx.globalAlpha = Math.min(1, p.life / p.max * 1.4); ctx.fillStyle = p.col; const s = p.size * sc * 1.1; ctx.fillRect(q[0] - s / 2, q[1] - s / 2, s, s); }
  ctx.globalAlpha = 1;
  for (const p of projs) {
    if (VFX.handles(p.kind)) continue;   // 3D bolts, raven, spear, spheres (VFX)
    projTo(a, p.x, p.y, p.zu); projTo(b, p.x - p.vx * 0.6, p.y - p.vy * 0.6, p.zu - p.vz * 0.6); if (a[2] > 1) continue;
    if (p.kind === 'arrow') { ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 2.5 * sc; ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(a[0], a[1]); ctx.stroke(); ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 1.2 * sc; ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(b[0] + (a[0] - b[0]) * 0.25, b[1] + (a[1] - b[1]) * 0.25); ctx.stroke(); ctx.globalCompositeOperation = 'lighter'; continue; }
    const col = PCOL[p.kind] || '#fff', r = 13 * sc, rc = rgbaC(col);
    const tg = ctx.createLinearGradient(b[0], b[1], a[0], a[1]); tg.addColorStop(0, rc.a0); tg.addColorStop(1, rc.a8); ctx.strokeStyle = tg; ctx.lineWidth = r * 0.9; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(a[0], a[1]); ctx.stroke();
    ctx.drawImage(projHead(col), a[0] - r, a[1] - r, r * 2, r * 2);
    if (Math.random() < 0.6) parts.push({ x: p.x, y: p.y, z: (p.zu - groundH(p.x, p.y)) * PXU, vx: rand(-0.3, 0.3), vy: rand(-0.3, 0.3), vz: rand(-10, 30), life: 0.35, max: 0.35, col, size: 2.5 });
  }
  for (const f of fxs) {
    const k = f.t / f.dur;
    if ((f.k === 'pillar' || f.k === 'strike') && VFX.ready && VFX.enabled) continue;   // 3D light columns / lightning (VFX)
    if (f._fb && VFX.enabled) continue;   // played by a flipbook (hit_spark / crit_star / fire_burst ...)
    if (f.k === 'pillar') {
      const e = f.e, gh = groundH(e.x, e.y); projTo(b, e.x, e.y, gh); projTo(a, e.x, e.y, gh + 6); const t = a; const al = Math.sin(k * Math.PI), wd = (f.big ? 1.2 : 0.8) * PPU;
      ctx.save(); ctx.globalAlpha = al; ctx.fillStyle = pillarGrad(f.col); ctx.translate(b[0] - wd / 2, t[1]); ctx.scale(wd, b[1] - t[1]); ctx.fillRect(0, 0, 1, 1); ctx.restore();
      ctx.fillStyle = rgba(f.col, al);
      for (let i = 0; i < 8; i++) { const yy = b[1] - ((k * 1.4 + i / 8) % 1) * (b[1] - t[1]); ctx.fillRect(b[0] + Math.sin(i * 2.3 + time * 4) * wd * 0.55, yy, 2.5 * sc, 7 * sc); }
    }
    else if (f.k === 'strike') { const gh = groundH(f.x, f.y); projTo(b, f.x, f.y, gh); projTo(a, f.x, f.y, gh + 9); const t = a; const r = mulberry32(f.seed | 0); ctx.strokeStyle = `rgba(255,252,210,${1 - k})`; ctx.lineWidth = 3.5 * sc; ctx.shadowColor = '#bfe0ff'; ctx.shadowBlur = 14; ctx.beginPath(); ctx.moveTo(t[0], t[1]); const n = 7; for (let i = 1; i <= n; i++) ctx.lineTo(t[0] + (b[0] - t[0]) * i / n + (i < n ? (r() - 0.5) * 26 * sc : 0), t[1] + (b[1] - t[1]) * i / n); ctx.stroke(); ctx.shadowBlur = 0; }
    else if (f.k === 'rain') { const gh = groundH(f.x, f.y); ctx.strokeStyle = `rgba(240,230,200,${1 - k})`; ctx.lineWidth = 1.6 * sc; for (let i = 0; i < 18; i++) { const ox = Math.sin(i * 12.9) * 1.8, oy = Math.cos(i * 7.3) * 1.8, z = (1 - k) * 5 + (i % 5) * 0.3; projTo(a, f.x + ox, f.y + oy, gh + z); projTo(b, f.x + ox, f.y + oy, gh + z + 0.8); ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(a[0], a[1]); ctx.stroke(); } }
    else if (f.k === 'meteor') { projTo(a, f.x, f.y, groundH(f.x, f.y)); const r = 2 * PPU; ctx.globalAlpha = 1 - k; ctx.drawImage(meteorGlow(f.col), a[0] - r, a[1] - r * 0.6, r * 2, r * 1.2); ctx.globalAlpha = 1; }
    else if (f.k === 'spark') {
      projTo(a, f.x, f.y, f.h); const r = (f.crit ? 28 : 19) * sc * (0.45 + k * 0.9), al = 1 - k, rg = r * 0.8;
      ctx.globalAlpha = al; ctx.drawImage(sparkGlow(!!f.hurt), a[0] - rg, a[1] - rg, rg * 2, rg * 2);
      ctx.strokeStyle = f.hurt ? 'rgb(255,120,100)' : 'rgb(255,250,210)'; ctx.lineWidth = (f.crit ? 3 : 2.2) * sc * (1 - k * 0.5); ctx.beginPath();
      for (let i = 0; i < 8; i++) { const an = i * Math.PI / 4 + 0.3, rr = i % 2 ? r * 0.75 : r; ctx.moveTo(a[0] + Math.cos(an) * rr * 0.35, a[1] + Math.sin(an) * rr * 0.35); ctx.lineTo(a[0] + Math.cos(an) * rr, a[1] + Math.sin(an) * rr); } ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  ctx.globalCompositeOperation = 'source-over'; ctx.lineCap = 'butt';
  ANIME.overlay();   // speed lines, dash streaks, flash fallback (under plates and damage numbers)
  // Cinematics (CINE.active): no nameplates, labels or bars; damage numbers stay.
  if (!(typeof CINE !== 'undefined' && CINE.active)) drawPlates(sc, a, b);
  drawFloats(sc, a);
  drawScreenParts();
}
function drawPlates(sc, a, b) {
  // Names
  for (const n of map.npcs) { projTo(a, n.x, n.y, groundH(n.x, n.y)); if (a[2] < 1) label(n.name, a[0], a[1] + 17 * sc, '#cfe6ff', 11.5); }
  for (const o of map.objs) if ((o.kind === 'way' || o.kind === 'heart') && hover === o) { projTo(a, o.x, o.y, groundH(o.x, o.y)); label(o.name, a[0], a[1] + 18 * sc, '#ffd8a8', 11.5); }
  for (const d of drops) {
    const L = dropLabel(d); if (!(mouse.alt || hover === d || L.show)) continue;
    projTo(a, d.x, d.y, groundH(d.x, d.y) + 0.9); if (a[2] > 1) continue;
    label(L.txt, a[0], a[1], L.col, 11, true);
  }
  const lock = typeof CTRL !== 'undefined' ? CTRL.lock : null;
  for (const m of mobs) {
    if (m.dead) continue;
    // bar / name only for hurt or selected mobs: the others skip the ground sample + projection (hordes: most mobs)
    const sel = hover === m || P.target === m || lock === m;
    const k = m.hp / m.maxhp, lag = lagOf(m, k), bar = (k < 1 || sel) && !m.d.boss;
    if (!bar && !sel) continue;
    const gh = groundH(m.x, m.y); projTo(a, m.x, m.y, gh); if (a[2] > 1) continue;
    if (bar) { const wd = Math.round(40 * sc), y = Math.round(a[1] + 9 * sc); gauge(Math.round(a[0] - wd / 2), y, wd, 4, k, k < 0.3 ? '#ff7a4a' : '#ff5a4a', k < 0.3 ? '#c02810' : '#b81c1c', lag); }
    if (sel) { const lv = m.d.lvl - (P.lvl || 1), lc = lv >= 5 ? '#ff8a7a' : lv >= 0 ? '#ffe0b0' : '#c8f0c0'; label(mobLabel(m.d), a[0], a[1] + 28 * sc, m.d.aggro ? lc : '#ffffff', 12); }
  }
  if (P && started && !P.dead) {
    const gh = groundH(P.x, P.y); projTo(a, P.x, P.y, gh); const wd = Math.round(46 * sc), x = Math.round(a[0] - wd / 2), y = Math.round(a[1] + 9 * sc), hk = P.hp / S.maxhp;
    gauge(x, y, wd, 4, hk, hk < 0.25 ? '#ff6a5a' : '#8cf07a', hk < 0.25 ? '#c81c1c' : '#26a832', lagOf(P, hk));
    gauge(x, y + 6.5, wd, 2.5, P.sp / S.maxsp, '#8ac4ff', '#2a6ae0');
    if (P.stamina < 100) gauge(x, y + 11.5, wd, 2, P.stamina / 100, P.stamina < 22 ? '#ffb070' : '#fff080', P.stamina < 22 ? '#e0501a' : '#d8b020');
    if (P.casting) { const t = projTo(b, P.x, P.y, gh + headH(P) + 0.35), k = 1 - P.castT / P.castMax; gauge(Math.round(t[0] - 30), Math.round(t[1] - 3), 60, 5, k, '#b8ff9a', '#3cb83c'); }
  }
  // squad mode: every other hero's HP / SP bars (under the feet, like yours), its name under them, its cast bar
  if (P && started && typeof gfxHeroes === 'function') { const Hs = gfxHeroes(); if (Hs.length > 1) for (let i = 0; i < Hs.length; i++) if (Hs[i] && Hs[i] !== P) drawHeroPlate(Hs[i], sc, a, b); }
}
// Max HP / SP of a hero from its stat block (heroStatsOf: core's heroStats, a lookup), else hero.maxhp / maxsp, else
// its current value (a full bar).
function heroMax(h, k) {
  const st = heroStatsOf(h);
  return (st && st[k]) || h[k] || Math.max(1, k === 'maxhp' ? h.hp || 1 : h.sp || 1);
}
function drawHeroPlate(h, sc, a, b) {
  const gh = groundH(h.x, h.y); projTo(a, h.x, h.y, gh); if (a[2] > 1 || a[0] < -60 || a[0] > W + 60 || a[1] < -60 || a[1] > H + 80) return;
  const wd = Math.round(40 * sc), x = Math.round(a[0] - wd / 2), y = Math.round(a[1] + 9 * sc);
  if (!h.dead) {
    const hk = clamp(h.hp / heroMax(h, 'maxhp'), 0, 1);
    gauge(x, y, wd, 3.5, hk, hk < 0.25 ? '#ff6a5a' : '#8cf07a', hk < 0.25 ? '#c81c1c' : '#26a832', lagOf(h, hk));
    gauge(x, y + 5.5, wd, 2.5, clamp(h.sp / heroMax(h, 'maxsp'), 0, 1), '#8ac4ff', '#2a6ae0');
    if (h.casting && h.castMax > 0) { const t = projTo(b, h.x, h.y, gh + headH(h) + 0.35), k = 1 - h.castT / h.castMax; gauge(Math.round(t[0] - 26), Math.round(t[1] - 3), 52, 4, k, '#b8ff9a', '#3cb83c'); }
  }
  if (h.name) label(h.name, a[0], y + (h.dead ? 6 : 17) * sc, h.dead ? '#a09890' : '#d8f0c8', 11);
}
/* Speech-bubble anchor for the UI team (squad chat): heroScreenPos(hero, out) fills out = [x, y, ndcZ] in the same CSS
   pixel space as proj() / projTo(), at a point above the hero's head (hair, hat and mount included: headH uses the
   sheet's visible height), which is above the name and HP bars (those are drawn under the feet). Returns out, or null
   when the hero cannot be seen (game not started, behind the camera, or more than 40 px off screen). No allocation
   when out is given. */
function heroScreenPos(hero, out) {
  if (!hero || typeof started === 'undefined' || !started || typeof map === 'undefined' || !map) return null;
  out = out || [0, 0, 0];
  const gh = groundH(hero.x, hero.y), hh = typeof headH === 'function' ? headH(hero) : 1.6;
  projTo(out, hero.x, hero.y, gh + (hero.z || 0) / PXU + hh + 0.45);
  if (!(out[2] <= 1) || out[0] < -40 || out[0] > W + 40 || out[1] < -40 || out[1] > H + 40) return null;
  return out;
}
function drawFloats(sc, a) {
  // RO-style damage numbers: pop, arc to the side, bounce; crits get a burst.
  for (const f of floats) {
    projTo(a, f.x, f.y, f.hw); if (a[2] > 1) continue; const k = f.t; let x = a[0], y = a[1], life = 0.95, s = 1;
    const st = NUMSTYLE[f.kind] || NUMSTYLE.info;
    if (f.kind === 'dmg' || f.kind === 'crit' || f.kind === 'hurt') {
      x += f.side * 46 * k * sc; y += (-230 * k + 270 * k * k) * sc;
      const land = Math.max(0, k - 0.62); if (land > 0) y -= Math.abs(Math.sin(land * 16)) * 10 * Math.exp(-land * 9) * sc;
      s = 1 + 0.75 * Math.exp(-k * 26) - 0.18 * k;
      if (f.kind === 'crit') { x += Math.sin(k * 90) * 2.5 * Math.exp(-k * 10); s *= 1.05; }
    }
    else if (f.kind === 'heal' || f.kind === 'sp') { y -= 44 * k * sc; s = (f.small ? 0.72 : 1) * (1 + 0.4 * Math.exp(-k * 20)); }
    else if (f.kind === 'miss') { y -= 34 * k * sc; x += f.side * 8 * k; }
    else if (f.kind === 'skill') { y -= 12 * k; life = 1.3; s = 1 + 0.25 * Math.exp(-k * 16); }
    else if (f.kind === 'lvl' || f.kind === 'job') { y -= 40 * k; life = 1.3; s = 1 + 0.5 * Math.exp(-k * 12); }
    else if (f.kind === 'shout') { y -= 12 * k; s = 1 + 0.5 * Math.exp(-k * 18); }
    else if (f.kind === 'info') { y -= 26 * k; }
    const al = clamp((life - k) * 4, 0, 1); ctx.globalAlpha = al;
    const px = Math.round(st.size * sc);
    if (f._gpx !== px || f._gt !== f.txt || f._gk !== f.kind) { f._g = numGlyph(f.txt, f.kind, px); f._gpx = px; f._gt = f.txt; f._gk = f.kind; }   // glyph lookup once per float (not a key string per frame)
    const gl = f._g, w = gl.cw * s, h = gl.ch * s;
    if (f.kind === 'crit') { ctx.globalAlpha = al * 0.9; star(x, y, px * 1.25 * s, px * 0.6 * s, 10, 'rgba(210,30,20,.9)', k * 2); star(x, y, px * 0.95 * s, px * 0.45 * s, 10, 'rgba(255,140,40,.9)', -k * 3); ctx.globalAlpha = al; }
    if (f.kind === 'skill') { ctx.fillStyle = 'rgba(10,8,6,.55)'; rrect(ctx, x - w / 2 + 4, y - h * 0.32, w - 8, h * 0.64, h * 0.3); ctx.fill(); }
    ctx.drawImage(gl, x - w / 2, y - h / 2, w, h);
  }
  ctx.globalAlpha = 1;
}
function setScreenParts() {
  screenParts = []; const n = map.d.part === 'dust' ? 40 : 60;
  for (let i = 0; i < n; i++) screenParts.push({ x: Math.random() * W, y: Math.random() * H, v: rand(0.3, 1), s: rand(1, 2.6), ph: Math.random() * 6, k: '', col: '' });
}
// A screen particle's colour depends only on its speed v and the map's particle kind: built once, not per frame.
function spCol(p, kind) {
  if (p.k === kind) return p.col; p.k = kind;
  return (p.col = kind === 'ember' ? `rgba(255,${120 + p.v * 80 | 0},40,${0.55 * p.v})` : kind === 'dust' ? `rgba(180,190,230,${0.2 * p.v})` : kind === 'leaf' ? `rgba(120,150,60,${0.45 * p.v})`
    : kind === 'petal' ? `rgba(255,200,220,${0.5 * p.v})` : `rgba(215,212,205,${0.35 * p.v})`);
}
function drawScreenParts() {
  if (typeof GFX !== 'undefined' && GFX.wx && GFX.wx.screenParts === false) return;   // graphics round 5: 3D GPU weather replaces the 2D screen particles
  const kind = map.d.part;
  for (const p of screenParts) {
    if (kind === 'ember') { p.y -= p.v * 0.9; p.x += Math.sin(time + p.ph) * 0.4; if (p.y < -5) { p.y = H + 5; p.x = Math.random() * W; } }
    else if (kind === 'dust') { p.y += Math.sin(time * 0.5 + p.ph) * 0.15; p.x += 0.1 * p.v; if (p.x > W) p.x = 0; }
    else if (kind === 'leaf') { p.y += p.v * 0.6; p.x += Math.sin(time * 1.3 + p.ph) * 0.7; if (p.y > H + 5) { p.y = -5; p.x = Math.random() * W; } }
    else if (kind === 'petal') { p.y += p.v * 0.45; p.x += 0.3 + Math.sin(time + p.ph) * 0.4; if (p.y > H + 5) { p.y = -5; p.x = Math.random() * W; } if (p.x > W + 5) p.x = -5; }
    else { p.y += p.v * 0.5; p.x += 0.25 + Math.sin(time + p.ph) * 0.3; if (p.y > H + 5) { p.y = -5; p.x = Math.random() * W; } if (p.x > W + 5) p.x = -5; }
    ctx.fillStyle = spCol(p, kind);
    ctx.fillRect(p.x, p.y, p.s, p.s);
  }
}
function drawMinimap() {
  const mc = $('mini'), g = mc.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#10131c'; g.fillRect(0, 0, mc.width, mc.height);
  const s = Math.min(mc.width / map.w, mc.height / map.h), ox = (mc.width - map.w * s) / 2, oy = (mc.height - map.h * s) / 2;
  g.imageSmoothingEnabled = false; g.drawImage(map.mini, ox, oy, map.w * s, map.h * s);
  const dot = (x, y, c, r) => { g.fillStyle = c; g.beginPath(); g.arc(ox + x * s, oy + y * s, r, 0, 7); g.fill(); g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 1; g.stroke(); };
  for (const m of mobs) if (!m.dead) dot(m.x, m.y, m.d.boss ? '#ff7a2a' : '#e04848', m.d.boss ? 5 : 2.4);
  for (const n of map.npcs) dot(n.x, n.y, '#6aa8ff', 3.5);
  for (const wp of map.warps) dot(wp.x + 0.5, wp.y + 0.5, wp.lock === 'gate' && !P.flags.gate ? '#b03020' : '#4ad0ff', 4);
  for (const d of drops) if (d.lost) dot(d.x, d.y, '#ff2a2a', 4);
  if (typeof gfxHeroes === 'function') { const Hs = gfxHeroes(); if (Hs.length > 1) for (let i = 0; i < Hs.length; i++) { const h = Hs[i]; if (h && h !== P) dot(h.x, h.y, h.dead ? '#8a8078' : '#7ae07a', 3.2); } }   // squad mode: allies
  const px = ox + P.x * s, py = oy + P.y * s, a = Math.atan2(P.fy || 0, P.fx || 1);
  g.save(); g.translate(px, py); g.rotate(a); g.fillStyle = '#ffffff'; g.strokeStyle = '#000'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(8, 0); g.lineTo(-5, -5); g.lineTo(-2, 0); g.lineTo(-5, 5); g.closePath(); g.fill(); g.stroke(); g.restore();
}
function render(dt) {
  matLaterTick();
  updateCamera(dt || 0.016);
  ANIME.camera();   // camera punch + impact-frame uniforms
  animateWorld(dt || 0.016);
  ANIME.frame();    // new hits -> cuts, lines, flash, punch
  syncEntities();
  syncDecals();
  VFX.sync(dt);
  renderer.render(scene, camera);   // gfx-post.js routes this through its composer
  drawOverlay();
}

/* =========================================================
   Anime combat effects (design/anime-anim-contract.md, A2): the "Solo Leveling" layer on top of the pixel sprites.
   Everyone gets them, on by default; GFX.animeFx = false (stored as aom-animefx = '0') turns them all off.
   - After-images: pooled snapshots of a sprite's layers (frame UVs + transform), drawn as instances of one ghost batch
     per sheet page (the IB machinery above: one draw per sheet whatever the number of ghosts), tinted and fading.
     Spawned on dodges, skill dashes, monster leaps, the sheets' `smear` frames, heavy releases and combo finishers.
   - Slash cuts: a thin tapered crescent flashed across the target on every landed hit (one instanced draw), along the
     attack direction; crossed on crits, wide on heavies.
   - Speed lines (2D overlay): radial bursts around the target on heavy / critical / finisher hits and around the
     hero when a skill fires; dash streaks behind a dodging / dashing hero.
   - Impact frame: a short white (or, with post-processing, partly inverted) flash on crits, heavies and boss blows,
     at most one per 0.5 s (under the 3-per-second photosensitivity limit), capped in strength, none with
     prefers-reduced-motion.
   - Camera punch along the hit direction (none with reduced motion), and a sharper hit-stop curve (hitstopScale in
     action.js, used by ui.js frame()).
   Colours: the cold blue / violet "system" glow for skills and dashes, the weapon element (else the weapon's trail
   colour) for blows. Low quality: fewer and shorter ghosts, fewer lines, no inversion, a softer punch.
   Timers of what the hit-stop must not freeze (cuts, lines, flash, punch) run on a real clock (AOM_ANIME_CLOCK can
   replace it for deterministic captures); after-images use game time, so they hold during the hit-stop. Nothing here
   allocates per frame: fixed pools, reused vectors, constant colour strings.
   ========================================================= */
if (typeof GFX !== 'undefined' && GFX.animeFx === undefined) GFX.animeFx = (typeof store === 'function' ? store('aom-animefx') : null) !== '0';
const ANIME = (() => {
  const A = { imp: new THREE.Vector4(), stats: { ghosts: 0, cuts: 0, lines: 0, flashes: 0, punches: 0 }, reduced: false };
  try { const mq = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)'); if (mq) { A.reduced = !!mq.matches; if (mq.addEventListener) mq.addEventListener('change', e => { A.reduced = !!e.matches; }); } } catch (e) { /* no matchMedia */ }
  const on = () => typeof GFX === 'undefined' || GFX.animeFx !== false;
  // headless captures (tools/shoot.py, perf.py) step frames by hand: count rendered frames there so shots stay deterministic
  const HEADLESS = typeof navigator !== 'undefined' && /HeadlessChrome/.test(navigator.userAgent || '');
  const clk = () => (typeof window !== 'undefined' && typeof window.AOM_ANIME_CLOCK === 'function') ? window.AOM_ANIME_CLOCK() : HEADLESS ? frameNo / 60 : performance.now() / 1000;
  const qk = () => { const q = gfxQ(); return q === 'low' ? 0.45 : q === 'medium' ? 0.75 : 1; };
  const SYS = '#6f9bff', SYS2 = '#b98aff';   // the system glow: cold blue, violet
  const ELC = { fire: '#ff8a3a', water: '#7cc8ff', wind: '#b8ffa8', earth: '#e0b878', holy: '#fff0b0', shadow: '#b48aff', ghost: '#c8b4ff', poison: '#a8e868', undead: '#b0b0d0' };
  const COLS = new Map();   // hex -> [r, g, b] in the working space (filled once per colour)
  function lc(hex) { let c = COLS.get(hex); if (!c) { const k = wcol(hex, new THREE.Color()); c = [k.r, k.g, k.b]; COLS.set(hex, c); } return c; }

  /* ---------- after-images: ONE instanced draw for every ghost of every sheet ----------
     The ghost shader reads up to GHK sheet page textures (R8 index pages of the indexed sheets, texture slots as in the
     hero batches) and a palette atlas (one 256-texel row per slot); each instance carries its slot, frame UVs, tint and
     a matrix that folds in the sheet's frame size and anchor (a unit quad). Slots are sticky: a palette row is copied
     only when a slot changes sheet. RGBA-fallback sheets and WebGL1 get no after-images. Hidden (0 draws) when idle. */
  const GHK = 8, GN = 96;
  const GH = (() => {
    if (!(renderer.capabilities && renderer.capabilities.isWebGL2)) return null;
    let dS = '', fe = '', sz = '';
    for (let i = 0; i < GHK; i++) { dS += `uniform sampler2D uG${i}; `; fe += `  if (s == ${i}) return texelFetch(uG${i}, t, 0).r;\n`; sz += `  if (s == ${i}) return textureSize(uG${i}, 0);\n`; }
    const dummy = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat); dummy.needsUpdate = true;
    const palD = new Uint8Array(256 * GHK * 4), pal = new THREE.DataTexture(palD, 256, GHK, THREE.RGBAFormat, THREE.UnsignedByteType);
    pal.magFilter = pal.minFilter = THREE.NearestFilter; pal.generateMipmaps = false; pal.needsUpdate = true;
    const uniforms = { uPalA: { value: pal } }; for (let i = 0; i < GHK; i++) uniforms['uG' + i] = { value: dummy };
    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: `attribute vec4 iUV; attribute vec4 iCol; attribute float iSlot; varying vec2 vUv; varying vec4 vC; varying float vS;
        void main() { vUv = mix(iUV.xy, iUV.zw, uv); vC = iCol; vS = iSlot; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform sampler2D uPalA; ${dS}
        varying vec2 vUv; varying vec4 vC; varying float vS;
        ivec2 gSz(int s) {\n${sz}  return ivec2(1); }
        float gI(int s, ivec2 t) {\n${fe}  return 0.0; }
        void main() {
          int s = int(vS + 0.5); ivec2 ts = gSz(s), t = clamp(ivec2(floor(vUv * vec2(ts))), ivec2(0), ts - 1);
          vec4 p = texelFetch(uPalA, ivec2(int(gI(s, t) * 255.0 + 0.5), s), 0);
          if (p.a < 0.5) discard;
          gl_FragColor = vec4(vC.rgb * (0.45 + 1.1 * dot(p.rgb, vec3(0.3, 0.59, 0.11))), vC.a);
          #include <tonemapping_fragment>
          #include <encodings_fragment>
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    const g = new THREE.PlaneGeometry(1, 1).translate(0.5, 0.5, 0), aUV = new Float32Array(GN * 4), aC = new Float32Array(GN * 4), aS = new Float32Array(GN);
    g.setAttribute('iUV', new THREE.InstancedBufferAttribute(aUV, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('iCol', new THREE.InstancedBufferAttribute(aC, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('iSlot', new THREE.InstancedBufferAttribute(aS, 1).setUsage(THREE.DynamicDrawUsage));
    const mesh = new THREE.InstancedMesh(g, mat, GN); mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.renderOrder = 0.5; mesh.count = 0; mesh.visible = false; scene.add(mesh);
    return { mesh, mat, uniforms, pal, palD, dummy, aUV, aC, aS, tex: new Array(GHK).fill(null), rec: new Array(GHK).fill(null), mark: new Int32Array(GHK).fill(-1) };
  })();
  // Slot of page texture tex (sheet rec) for this frame, or -1 when every slot is taken by another texture this frame.
  function ghostSlot(rec, tex) {
    const H = GH; let free = -1;
    for (let i = 0; i < GHK; i++) { if (H.tex[i] === tex) { H.mark[i] = frameNo; return i; } if (free < 0 && H.mark[i] !== frameNo) free = i; }
    if (free < 0) return -1;
    H.tex[free] = tex; H.mark[free] = frameNo; H.uniforms['uG' + free].value = tex;
    if (H.rec[free] !== rec) { H.rec[free] = rec; H.palD.set(rec.pal.tex.image.data.subarray(0, 1024), free * 1024); H.pal.needsUpdate = true; }
    return free;
  }
  const G = [];
  for (let i = 0; i < GN; i++) G.push({ on: false, rec: null, pg: 0, u0: 0, v0: 0, u1: 0, v1: 0, x: 0, y: 0, z: 0, sx: 1, sy: 1, fw: 1, fh: 1, ax: 0, ay: 0, t0: 0, life: 0, r: 1, g: 1, b: 1, a: 0 });
  let gHead = 0;
  // Snapshot every drawn layer of sheet vis v (hats excepted: their quad is an affine of the head anchor).
  function ghostSnap(v, e, y, flip, st, hex, a, life, back) {
    if (!GH) return;
    const c = lc(hex), k = st.scl || 1, sx = (flip ? -1 : 1) * st.sx * k, sy = st.sy * k / COSP;
    const bx = -(e.fx === undefined ? 1 : e.fx) * back, by = -(e.fy || 0) * back;
    for (let i = 0; i < v.layers.length; i++) {
      const L = v.layers[i], r = L.rec; if (!L.on || L.layer === 'headgear' || !r || !r.ok || !r.pal) continue;
      const g = G[gHead], j = r.json; gHead = (gHead + 1) % GN;
      g.on = true; g.rec = r; g.pg = L.pg | 0; g.u0 = L.uv[0]; g.v0 = L.uv[1]; g.u1 = L.uv[2]; g.v1 = L.uv[3];
      g.fw = j.frameW / PXU; g.fh = j.frameH / PXU; g.ax = j.anchor[0] / PXU; g.ay = j.anchor[1] / PXU;
      g.x = e.x + bx; g.y = y; g.z = e.y + by; g.sx = sx; g.sy = sy; g.t0 = time; g.life = life; g.r = c[0]; g.g = c[1]; g.b = c[2]; g.a = a;
    }
  }
  function ghostsFlush() {
    if (!GH) return;
    const H = GH, M = H.mesh.instanceMatrix.array, cy = SPRF.cy, sy_ = SPRF.sy; let n = 0;
    for (let i = 0; i < GN; i++) {
      const g = G[i]; if (!g.on) continue;
      const age = time - g.t0;
      if (age >= g.life || age < -0.05 || !g.rec.ok || SHEETS.byId[g.rec.id] !== g.rec) { g.on = false; g.rec = null; continue; }
      const s = ghostSlot(g.rec, sheetPageTex(g.rec, g.pg)); if (s < 0) continue;
      const f = 1 - age / g.life, o = n * 16, q = n * 4;
      // T(x, y, z) * RotY(yaw) * S(sx, sy) * [unit quad -> frame plane: (u * fw - ax, v * fh + ay - fh)]
      const X = g.sx * g.fw, Y = g.sy * g.fh, tx = -g.sx * g.ax, ty = g.sy * (g.ay - g.fh);
      M[o] = cy * X; M[o + 1] = 0; M[o + 2] = -sy_ * X; M[o + 3] = 0;
      M[o + 4] = 0; M[o + 5] = Y; M[o + 6] = 0; M[o + 7] = 0;
      M[o + 8] = sy_; M[o + 9] = 0; M[o + 10] = cy; M[o + 11] = 0;
      M[o + 12] = g.x + cy * tx; M[o + 13] = g.y + ty; M[o + 14] = g.z - sy_ * tx; M[o + 15] = 1;
      H.aUV[q] = g.u0; H.aUV[q + 1] = g.v0; H.aUV[q + 2] = g.u1; H.aUV[q + 3] = g.v1;
      H.aC[q] = g.r; H.aC[q + 1] = g.g; H.aC[q + 2] = g.b; H.aC[q + 3] = g.a * f * f; H.aS[n] = s;
      n++;
    }
    const m = H.mesh; m.count = n; m.visible = n > 0; A.stats.ghosts = n;
    if (n) { ibFlag(m.instanceMatrix, n); const at = m.geometry.attributes; ibFlag(at.iUV, n); ibFlag(at.iCol, n); ibFlag(at.iSlot, n); }
  }

  /* ---------- slash cuts (one instanced draw) ---------- */
  const CUT = (() => {
    const mat = new THREE.ShaderMaterial({
      vertexShader: `attribute vec4 aA; attribute vec4 aC; varying vec2 vUv; varying vec4 vA; varying vec4 vC;
        void main() { vUv = uv; vA = aA; vC = aC; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        varying vec2 vUv; varying vec4 vA; varying vec4 vC;
        void main() {
          float head = vA.x, tail = vA.y, alpha = vA.z, wd = vA.w, bend = vC.w;
          vec2 p = vUv * 2.0 - 1.0;
          float s = (p.x - tail) / max(1e-3, head - tail);
          if (s < 0.0 || s > 1.0) discard;
          float yc = bend * (1.0 - p.x * p.x) * 0.35, w = wd * pow(sin(3.14159 * s), 0.8) * (0.35 + 0.65 * s);
          float d = abs(p.y - yc); if (w < 1e-3 || d > w) discard;
          float core = 1.0 - smoothstep(0.0, w * 0.3, d), edge = 1.0 - smoothstep(w * 0.4, w, d);
          vec3 c = min(mix(vC.rgb * 1.2, vec3(1.25), core), vec3(1.25));
          gl_FragColor = vec4(c, clamp(alpha * max(core, edge * 0.8), 0.0, 1.0));
          #include <tonemapping_fragment>
          #include <encodings_fragment>
        }`,
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const N = 16, g = new THREE.PlaneGeometry(1, 1), aA = new Float32Array(N * 4), aC = new Float32Array(N * 4);
    g.setAttribute('aA', new THREE.InstancedBufferAttribute(aA, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aC', new THREE.InstancedBufferAttribute(aC, 4).setUsage(THREE.DynamicDrawUsage));
    const mesh = new THREE.InstancedMesh(g, mat, N); mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.renderOrder = 6; mesh.count = 0; mesh.visible = false; scene.add(mesh);
    const L = []; for (let i = 0; i < N; i++) L.push({ on: false, t0: 0, x: 0, y: 0, z: 0, ang: 0, size: 1, w: 0.1, bend: 0.4, r: 1, g: 1, b: 1, life: 0.17 });
    return { mesh, aA, aC, L, N, head: 0, M: new THREE.Matrix4(), q: new THREE.Quaternion(), qz: new THREE.Quaternion(), s: new THREE.Vector3(), z: new THREE.Vector3(0, 0, 1), v: new THREE.Vector3(), v2: new THREE.Vector3() };
  })();
  function cut(x, y, z, ang, size, w, bend, hex, life) {
    const c = CUT.L[CUT.head]; CUT.head = (CUT.head + 1) % CUT.N; const k = lc(hex);
    c.on = true; c.t0 = clk(); c.x = x; c.y = y; c.z = z; c.ang = ang; c.size = size; c.w = w; c.bend = bend; c.r = k[0]; c.g = k[1]; c.b = k[2]; c.life = life;
    A.stats.cuts++;
  }
  function cutsSync() {
    const C = CUT, now = clk(); let n = 0;
    for (let i = 0; i < C.N; i++) {
      const c = C.L[i]; if (!c.on) continue;
      const t = now - c.t0; if (t > c.life || t < -0.05) { c.on = false; continue; }
      const k = t / c.life, o = n * 4;
      C.aA[o] = -1 + 2 * smoothstep(0, 0.28, k); C.aA[o + 1] = -1 + 2 * smoothstep(0.22, 0.85, k); C.aA[o + 2] = 1 - smoothstep(0.6, 1, k); C.aA[o + 3] = c.w;
      C.aC[o] = c.r; C.aC[o + 1] = c.g; C.aC[o + 2] = c.b; C.aC[o + 3] = c.bend;
      C.v.set(c.x, c.y, c.z); C.v2.copy(camera.position).sub(C.v).normalize(); C.v.addScaledVector(C.v2, 1.2);
      C.q.copy(camera.quaternion).multiply(C.qz.setFromAxisAngle(C.z, c.ang)); C.s.set(c.size, c.size, 1);
      C.M.compose(C.v, C.q, C.s).toArray(C.mesh.instanceMatrix.array, n * 16); n++;
    }
    const m = C.mesh; m.count = n; m.visible = n > 0;
    if (n) { ibFlag(m.instanceMatrix, n); ibFlag(m.geometry.attributes.aA, n); ibFlag(m.geometry.attributes.aC, n); }
  }

  /* ---------- speed lines, dash streaks, impact flash, camera punch ---------- */
  const SPD = { t0: -9, dur: 0, wx: 0, wy: 0, wz: 0, inner: 0.24, n: 0, seed: 1, col: '#ffffff', a: 0 };
  const FL = { t0: -9, dur: 0, a: 0, inv: 0, col: '#ffffff', last: -9 };
  const CP = { t0: -9, dx: 0, dz: 0, amp: 0 };
  const rnd = (s, i) => { const x = Math.sin(s * 12.9898 + i * 78.233) * 43758.5453; return x - Math.floor(x); };
  function speed(wx, wy, wz, hex, dur, n, a) {
    if (A.reduced) return;
    const now = clk(); if (now - SPD.t0 < SPD.dur * 0.6 && a <= SPD.a) return;
    SPD.t0 = now; SPD.dur = dur; SPD.wx = wx; SPD.wy = wy; SPD.wz = wz; SPD.n = Math.round(n * (qk() < 0.5 ? 0.5 : 1)); SPD.seed = (SPD.seed * 1.618 + 0.37) % 97; SPD.col = hex; SPD.a = a;
    A.stats.lines++;
  }
  function flash(a, inv, hex, dur) {
    if (A.reduced) return;
    const now = clk();
    if (now - FL.last < 0.5) {   // <= 2 flashes per second; a stronger cue in the same beat upgrades the current flash
      if (now - FL.t0 < 0.05 && (inv > FL.inv || a > FL.a)) { FL.a = Math.max(FL.a, Math.min(0.3, a)); FL.inv = Math.max(FL.inv, qk() < 0.5 ? 0 : Math.min(0.85, inv)); FL.dur = Math.max(FL.dur, Math.min(0.09, dur)); }
      return;
    }
    FL.last = FL.t0 = now; FL.a = Math.min(0.3, a); FL.inv = qk() < 0.5 ? 0 : Math.min(0.85, inv); FL.col = hex; FL.dur = Math.min(0.09, dur);
    A.stats.flashes++;
  }
  function punch(dx, dz, amp) {
    if (A.reduced || amp <= 0) return;
    const now = clk(), n = Math.hypot(dx, dz) || 1, cur = CP.amp * Math.max(0, 1 - (now - CP.t0) / 0.2);
    if (amp * qk() < cur) return;
    CP.t0 = now; CP.dx = dx / n; CP.dz = dz / n; CP.amp = amp * (qk() < 0.5 ? 0.6 : 1); A.stats.punches++;
  }
  // After updateCamera (gfx-world.js): it rebuilds camera.position every frame, so the offset never accumulates.
  A.camera = function () {
    A.imp.set(0, 0, 0, 0);
    if (!on()) return;
    const now = clk();
    const t = now - CP.t0;
    if (t >= 0 && t < 0.3 && CP.amp > 0) {
      const k = t < 0.03 ? t / 0.03 : Math.exp(-(t - 0.03) * 20) * Math.cos((t - 0.03) * 40);
      camera.position.x += CP.dx * CP.amp * k; camera.position.z += CP.dz * CP.amp * k; camera.position.y -= CP.amp * 0.35 * Math.abs(k);
    }
    const f = now - FL.t0;
    if (f >= 0 && f < FL.dur && typeof POST !== 'undefined' && POST.on) {
      // an inverted impact frame (about two frames) first when asked for, then the white flash decays
      const inv = FL.inv > 0 && f < FL.dur * 0.45, k = inv ? 0 : 1 - f / FL.dur, c = lc(FL.col);
      A.imp.set(inv ? FL.inv : 0, c[0] * FL.a * k, c[1] * FL.a * k, c[2] * FL.a * k);
    }
  };
  const _q = [0, 0, 0], _r = [0, 0, 0];
  // Drawn into the 2D overlay (gfx-render drawOverlay), under plates and damage numbers.
  A.overlay = function () {
    if (!on() || !started) return;
    const now = clk(), c2 = ctx;
    // flash fallback without post-processing (white only)
    const f = now - FL.t0;
    if (f >= 0 && f < FL.dur && !(typeof POST !== 'undefined' && POST.on)) { c2.globalCompositeOperation = 'lighter'; c2.globalAlpha = FL.a * 0.8 * (1 - f / FL.dur); c2.fillStyle = FL.col; c2.fillRect(0, 0, W, H); }
    // speed lines: thin wedges converging on the impact
    const t = now - SPD.t0;
    if (t >= 0 && t < SPD.dur && SPD.n > 0) {
      projTo(_q, SPD.wx, SPD.wz, SPD.wy);
      if (_q[2] < 1) {
        const k = t / SPD.dur, diag = Math.hypot(W, H), r0 = Math.max(70, H * SPD.inner);
        c2.globalCompositeOperation = 'source-over'; c2.fillStyle = SPD.col; c2.globalAlpha = SPD.a * (k < 0.35 ? 1 : 1 - (k - 0.35) / 0.65);
        c2.beginPath();
        for (let i = 0; i < SPD.n; i++) {
          const an = rnd(SPD.seed, i) * 6.2832, ri = r0 * (1 + 1.1 * rnd(SPD.seed, i + 50)) * (1 + 0.3 * k), wd = (1.5 + 6 * rnd(SPD.seed, i + 99) * rnd(SPD.seed, i + 7)) * (1 - 0.5 * k) * Math.max(1, H / 720);
          const ca = Math.cos(an), sa = Math.sin(an), px = -sa, py = ca;
          c2.moveTo(_q[0] + ca * ri, _q[1] + sa * ri);
          c2.lineTo(_q[0] + ca * diag + px * wd * 3, _q[1] + sa * diag + py * wd * 3);
          c2.lineTo(_q[0] + ca * diag - px * wd * 3, _q[1] + sa * diag - py * wd * 3);
          c2.closePath();
        }
        c2.fill();
      }
    }
    // dash streaks behind dodging / dashing heroes
    const Hs = typeof gfxHeroes === 'function' ? gfxHeroes() : null;
    if (Hs) for (let i = 0; i < Hs.length; i++) {
      const h = Hs[i]; if (!h || h.dead || !(h.dodgeT > 0 || h.dash)) continue;
      const gh = groundH(h.x, h.y), hu = headH(h), fx = h.dash ? h.dash.ux : (h.fx === undefined ? 1 : h.fx), fy = h.dash ? h.dash.uy : (h.fy || 0);
      projTo(_q, h.x, h.y, gh + hu * 0.45); projTo(_r, h.x - fx, h.y - fy, gh + hu * 0.45); if (_q[2] > 1) continue;
      let dx = _q[0] - _r[0], dy = _q[1] - _r[1]; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
      const p = h.dash ? 1 : clamp(h.dodgeT / 0.34, 0, 1), sc = PPU / 34, n = qk() < 0.5 ? 3 : 6;
      c2.globalCompositeOperation = 'lighter'; c2.strokeStyle = SYS; c2.lineCap = 'round';
      for (let j = 0; j < n; j++) {
        const o = (rnd(7.1, j) - 0.5) * 44 * sc, len = (40 + 90 * rnd(3.3, j + (frameNo >> 2))) * sc * (0.4 + p), s0 = (8 + 14 * rnd(5.7, j)) * sc;
        const ax = _q[0] - dx * s0 - dy * o, ay = _q[1] - dy * s0 + dx * o - hu * 0.0;
        c2.globalAlpha = 0.55 * p * (0.5 + 0.5 * rnd(9.9, j)); c2.lineWidth = (1 + 2 * rnd(2.2, j)) * sc;
        c2.beginPath(); c2.moveTo(ax, ay); c2.lineTo(ax - dx * len, ay - dy * len); c2.stroke();
      }
      c2.lineCap = 'butt';
    }
    c2.globalAlpha = 1; c2.globalCompositeOperation = 'source-over';
  };

  /* ---------- game events ---------- */
  const SEEN = new WeakSet();
  function heroCol(h) {
    const st = typeof heroStatsOf === 'function' ? heroStatsOf(h) : (h === P ? S : null), el = st && st.welem;
    if (el && ELC[el]) return ELC[el];
    const wt = (typeof heroWtype === 'function' ? heroWtype(h) : st && st.wtype) || 'fist', sw = SWINGCOL[wt] || SWINGCOL.sword;
    return sw[0];
  }
  const nearHero = (x, y, r) => { const Hs = typeof gfxHeroes === 'function' ? gfxHeroes() : null; let b = null, bd = r; if (Hs) for (let i = 0; i < Hs.length; i++) { const h = Hs[i]; if (!h || h.dead) continue; const d = Math.hypot(h.x - x, h.y - y); if (d < bd) { bd = d; b = h; } } return b; };
  const nearMob = (x, y, r) => { let b = null, bd = r; for (let i = 0; i < mobs.length; i++) { const m = mobs[i]; const d = Math.hypot(m.x - x, m.y - y); if (d < bd) { bd = d; b = m; } } return b; };
  const lead = () => typeof ctrlHero === 'function' ? ctrlHero() : P;
  let cutsThisFrame = 0;
  function onSpark(f) {
    const q = qk();
    if (f.hurt) {   // a monster's blow on a hero
      const h = nearHero(f.x, f.y, 0.6) || P, m = nearMob(h.x, h.y, 4.5); if (!m) return;
      const dx = h.x - m.x, dy = h.y - m.y, boss = !!(m.d && m.d.boss);
      if (cutsThisFrame++ < 3) cut(h.x, f.h, h.y, Math.atan2(-(dx * -SPRF.sy + dy * -SPRF.cy), dx * SPRF.rx + dy * SPRF.ry) + 1.2, boss ? 2.3 : 1.5, boss ? 0.16 : 0.1, 0.5, boss ? '#ff5a3a' : '#ff8a6a', 0.15);
      if (h === lead()) { punch(dx, dy, (boss ? 0.2 : 0.06) * q); if (boss) flash(0.18, 0, '#ffd0c0', 0.07); }
      return;
    }
    const m = nearMob(f.x, f.y, 0.5), h = nearHero(f.x, f.y, 9) || P; if (!h) return;
    let dx = f.x - h.x, dy = f.y - h.y; if (Math.hypot(dx, dy) < 0.05) { dx = h.fx === undefined ? 1 : h.fx; dy = h.fy || 0; }
    const v = VIS.get(h), heavy = !!(v && v.heavySwing && h.atkAnim >= 0) || HITSTOP >= 0.085, fin = h.combo === 3 && h.atkAnim >= 0;
    const skill = !!(v && v.skillT !== undefined && time - v.skillT < 0.8), boss = !!(m && m.d && m.d.boss), crit = !!f.crit;
    const hex = skill ? (A.stats.cuts & 1 ? SYS : SYS2) : heroCol(h);
    const sr = dx * SPRF.rx + dy * SPRF.ry, sf = dx * -SPRF.sy + dy * -SPRF.cy, ang = Math.atan2(sf, sr), j = rnd(f.x + f.y, frameNo) - 0.5;
    const mh = m ? headH(m) : 1, size = clamp(mh * 0.95, 0.9, 2.4) * (heavy ? 1.2 : fin ? 1.1 : 1);
    if (cutsThisFrame++ < 4) {
      cut(f.x, f.h, f.y, ang + 1.25 + j * 0.5, size, heavy ? 0.15 : 0.1, 0.45 + j * 0.3, hex, heavy ? 0.2 : 0.16);
      if (crit || heavy) cut(f.x, f.h, f.y, ang - 0.95 + j * 0.4, size * 0.85, heavy ? 0.12 : 0.08, -0.4, crit ? '#fff4d8' : hex, 0.18);
    }
    if (h === lead()) punch(dx, dy, (heavy ? 0.18 : crit ? 0.12 : fin ? 0.1 : 0.045) * (boss ? 1.25 : 1) * q);
    if (heavy || crit || fin) speed(f.x, f.h, f.y, crit ? '#fff8ec' : '#f4f6ff', heavy ? 0.12 : 0.09, heavy ? 44 : 32, heavy ? 0.8 : 0.62);
    if (crit && heavy) flash(0.22, 0.85, '#ffffff', 0.08);
    else if (heavy || (crit && boss)) flash(0.22, boss ? 0.85 : 0, '#ffffff', boss ? 0.08 : 0.06);
    else if (crit) flash(0.16, 0, '#fff4e0', 0.05);
    else if (boss && fin) flash(0.14, 0, '#ffffff', 0.05);
  }
  A.frame = function () {
    cutsThisFrame = 0;
    if (!on() || !started) { for (let i = 0; i < fxs.length; i++) SEEN.add(fxs[i]); return; }
    for (let i = 0; i < fxs.length; i++) { const f = fxs[i]; if (f.k !== 'spark' || SEEN.has(f)) continue; SEEN.add(f); if (f.t < 0.1) onSpark(f); }
  };
  A.flush = function () { if (on()) ghostsFlush(); else { for (let i = 0; i < GN; i++) G[i].on = false; A.stats.ghosts = 0; if (GH) { GH.mesh.visible = false; GH.mesh.count = 0; } } };
  A.sync = function () { if (on()) cutsSync(); else { CUT.mesh.visible = false; CUT.mesh.count = 0; } };
  // Per sheet vis, after it is placed (gfx-sheets.js syncSheetHero / syncSheetMob). J: body sheet json; y: feet height.
  A.sprite = function (v, e, J, act, f, st, flip, y, hero) {
    if (!on() || e.dead) { v.aAct = null; return; }
    const a = J.actions && J.actions[act], q = qk(), nf = v.aAct !== act || v.aF !== f;
    if (nf) {
      v.aAct = act; v.aF = f;
      if (a && a.fx && a.fx[f] && (hero ? e === lead() : !!P && Math.hypot(e.x - P.x, e.y - P.y) < 8)) {
        const cue = a.fx[f], gh = groundH(e.x, e.y), hc = hero ? heroCol(e) : '#ff8a5a';
        if (cue === 'speed') speed(e.x, gh + headH(e) * 0.5, e.y, '#f4f6ff', 0.1, 34, 0.6);
        else if (cue === 'flash') flash(0.18, 0, '#ffffff', 0.06);
        else if (cue === 'impact') { punch(e.fx === undefined ? 1 : e.fx, e.fy || 0, 0.08 * q); speed(e.x + (e.fx || 0) * 0.8, gh + headH(e) * 0.5, e.y + (e.fy || 0) * 0.8, '#fff4ec', 0.08, 26, 0.55); }
      }
      if (a && Array.isArray(a.smear) && a.smear.indexOf(f) >= 0) ghostSnap(v, e, y, flip, st, hero ? heroCol(e) : '#ff9a6a', 0.6, 0.22 * (0.6 + 0.4 * q), 0.22);
    }
    // dodge / dash / leap trails (game time, so they hold during a hit-stop)
    const dash = hero ? (e.dodgeT > 0 || !!e.dash) : !!e.leap;
    const big = hero && e.atkAnim >= 0 && e.atkAnim < 0.45 && (v.heavySwing || e.combo === 3);
    if (dash || big) {
      const gap = (dash ? 0.04 : 0.05) / (q < 0.5 ? 0.5 : 1);
      if (!(time - (v.aGT || -9) < gap)) {
        v.aGT = time;
        ghostSnap(v, e, y, flip, st, dash ? ((frameNo >> 1) & 1 ? SYS : SYS2) : heroCol(e), dash ? 0.5 : 0.42, (dash ? 0.24 : 0.16) * (0.6 + 0.4 * q), dash ? 0 : 0.1);
      }
    }
  };
  // A skill fired (gfx-sheets.js animSkillFired): system glow around the caster.
  A.skill = function (h) {
    if (!on() || !h) return;
    const v = VIS.get(h), gh = groundH(h.x, h.y);
    if (h === lead()) speed(h.x, gh + headH(h) * 0.5, h.y, '#9fb8ff', 0.14, 30, 0.5);
    if (v && v.sheet && v.layers && v.st) ghostSnap(v, h, gh + (h.z || 0) / PXU, v.diag ? !!v.diag.flip : false, v.st, SYS2, 0.5, 0.26, 0.15);
  };
  A.on = on;
  return A;
})();
function animeSprite(v, e, J, act, f, st, flip, y, hero) { ANIME.sprite(v, e, J, act, f, st, flip, y, hero); }
function animeSkillFx(h, pd) { ANIME.skill(h, pd); }
