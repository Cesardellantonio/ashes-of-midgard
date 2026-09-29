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
   ========================================================= */
const UNITPLANE = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
const FLATPLANE = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
const SHADOWMAT = new THREE.MeshBasicMaterial({ map: TEX.shadow, transparent: true, depthWrite: false, opacity: 0.6 });
// Shadow casters draw nothing in the colour pass; only their customDepthMaterial matters.
// DoubleSide: the shadow pass renders shadowSide[side], and a FrontSide caster would be culled when it faces the sun.
const CASTMAT = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true, side: THREE.DoubleSide });
const VIS = new Map(), DV = new Map();
let frameNo = 0;
function clearVis() { for (const v of VIS.values()) disposeVis(v); VIS.clear(); for (const v of DV.values()) for (const m of v.meshes) { scene.remove(m); m.material.dispose(); } DV.clear(); if (typeof PFX !== 'undefined') PFX.clear(); }
function disposeMesh(m) { scene.remove(m); if (m.material !== SHADOWMAT && m.material !== CASTMAT) m.material.dispose(); if (m.customDepthMaterial) m.customDepthMaterial.dispose(); }
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

/* ---------- Sprite shader patch ---------- */
const SPR_HEAD = `
uniform vec4 uFlash; uniform vec3 uRim; uniform vec2 uRimDir; uniform vec2 uFrameV; uniform float uDissolve; uniform float uFade; uniform vec2 uTexSize;
#ifdef SPR_HAIR
uniform vec4 uHK; uniform vec3 uH0; uniform vec3 uH1; uniform vec3 uH2; uniform vec3 uH3;
#endif
float sprHash(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
`;
const SPR_MAP = `
vec4 texelColor = texture2D( map, vUv );
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
float sprV = clamp((vUv.y - uFrameV.x) / max(1e-5, uFrameV.y - uFrameV.x), 0.0, 1.0);
float sprEdge = 0.0;
if ( uDissolve > 0.0 ) {
  float n = sprHash(floor(vUv * uTexSize * 0.5)) * 0.68 + (1.0 - sprV) * 0.32;   // 2x2-texel blocks
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
  float a1 = texture2D( map, vUv + uRimDir ).a, a3 = texture2D( map, vUv + 3.0 * uRimDir ).a;
  outgoingLight += uRim * (step(0.5, a1) * (1.0 - step(0.5, a3)));
  outgoingLight = mix(outgoingLight, uFlash.rgb, uFlash.a);
  outgoingLight = mix(outgoingLight, vec3(2.4, 0.9, 0.22), sprEdge);
  float sprFade = 1.0 - uFade * (1.0 - smoothstep(0.0, 0.5, sprV));
  gl_FragColor = vec4( outgoingLight, diffuseColor.a * sprFade );
}
`;
// Shared function object: the program cache key is its source, so all sprites share one program.
function SPR_OBC(sh) {
  Object.assign(sh.uniforms, this.userData.u);
  sh.fragmentShader = SPR_HEAD + sh.fragmentShader
    .replace('#include <map_fragment>', SPR_MAP)
    .replace('#include <alphatest_fragment>', SPR_TEST)
    .replace('gl_FragColor = vec4( outgoingLight, diffuseColor.a );', SPR_OUT);
}
function sprUniforms() {
  return { uFlash: { value: new THREE.Vector4(1, 1, 1, 0) }, uRim: { value: new THREE.Vector3() }, uRimDir: { value: new THREE.Vector2() },
    uFrameV: { value: new THREE.Vector2(0, 1) }, uDissolve: { value: 0 }, uFade: { value: 0 }, uTexSize: { value: new THREE.Vector2(64, 64) } };
}
function spriteMat(tex, o = {}) { return new THREE.MeshBasicMaterial(Object.assign({ map: tex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }, o)); }
// Lit, rim-lit, flashable, dissolvable sprite material. hair: true adds the palette ramp.
function fxSpriteMat(tex, hair) {
  const m = spriteMat(null); m.userData.u = sprUniforms(); m.onBeforeCompile = SPR_OBC;
  if (hair) { m.defines = { SPR_HAIR: '' }; Object.assign(m.userData.u, { uHK: { value: new THREE.Vector4() }, uH0: { value: new THREE.Color() }, uH1: { value: new THREE.Color() }, uH2: { value: new THREE.Color() }, uH3: { value: new THREE.Color() } }); }
  sprMapSet(m, tex); return m;
}

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
function makeCaster(geo, tex) {
  const c = new THREE.Mesh(geo, CASTMAT); c.castShadow = true; c.renderOrder = -2;
  c.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5, side: THREE.DoubleSide });
  scene.add(c); return c;
}
// Casters face the sun (widest silhouette), choosing the side whose +x matches camera right
// so a sword held on screen-right casts on the same side.
const SPRF = { shadows: false, cyaw: 0, t: 0, dt: 0, rx: 1, ry: 0, lights: null, lightsMap: null };
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
  for (const w of map.warps || []) L.push({ x: w.x + 0.5, y: w.y + 0.5, r: 3.2, c: [0.55, 0.78, 1.0], i: 0.45, h: 0.1 });
  SPRF.lights = L; SPRF.lightsMap = map; return L;
}
function sprLight(v, x, y) {
  let r = 1, g = 1, b = 1;
  if (typeof lightTint === 'function') { try { const c = lightTint(x, y); if (c) { r = c.r; g = c.g; b = c.b; } } catch (e) { /* keep 1 */ } }
  if (!v.lt) v.lt = { r, g, b };
  else { const k = 1 - Math.exp(-SPRF.dt * 7); v.lt.r += (r - v.lt.r) * k; v.lt.g += (g - v.lt.g) * k; v.lt.b += (b - v.lt.b) * k; }
  return v.lt;
}
// Rim light: strongest nearby fire (screen-side direction), plus a faint sun rim from above.
function sprRim(e, st) {
  st.rim[0] = st.rim[1] = st.rim[2] = 0; st.rdx = 0; st.rdy = 0;
  const q = gfxQ(); if (q === 'low') return;
  let bx = 0, by = 0, bw = 0;
  for (const L of sprLights()) {
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
function newSprState() { return { col: [1, 1, 1], a: 1, sx: 1, sy: 1, zoff: 0, rim: [0, 0, 0], rdx: 0, rdy: 0, flash: [1, 1, 1, 0], dis: 0, fade: 0, cast: true, ghost: false }; }
// Compute the look of entity e this frame. o: { tint, opacity, ghost }
function sprFrame(v, e, o) {
  const st = v.st || (v.st = newSprState());
  const lt = sprLight(v, e.x, e.y), useLT = typeof lightTint === 'function';
  const base = o.tint || (useLT ? null : map.d.look.tint) || [1, 1, 1];
  st.col[0] = Math.min(1.8, base[0] * lt.r); st.col[1] = Math.min(1.8, base[1] * lt.g); st.col[2] = Math.min(1.8, base[2] * lt.b);
  st.a = o.opacity === undefined ? 1 : o.opacity; st.ghost = !!o.ghost; st.fade = 0; st.zoff = 0; st.dis = 0; st.cast = SPRF.shadows && !o.ghost;
  sprRim(e, st);
  // hit flash + squash (mobs: hitFlash; player: hurtT)
  let fl = 0, fc = [1, 0.97, 0.9];
  const hf = e === P ? (P.hurtT || 0) / 0.3 * 0.22 : (e.hitFlash || 0);
  if (!e.dead && hf > (v.lastHF || 0) + 0.04) v.sqT = time;
  v.lastHF = e.dead ? 0 : hf;
  if (e === P) { if (P.hurtT > 0.15) { fl = 0.55 * (P.hurtT - 0.15) / 0.15; fc = [1, 0.32, 0.26]; } }
  else if (!e.dead && hf > 0) fl = hf > 0.17 ? 0.72 : 0.6 * hf / 0.17;
  if (e.dead && e.deathT !== undefined && e.deathT < 0.12) fl = 0.9 * (1 - e.deathT / 0.12);
  st.flash[0] = toLin(fc[0]); st.flash[1] = toLin(fc[1]); st.flash[2] = toLin(fc[2]); st.flash[3] = fl;
  const tq = time - (v.sqT === undefined ? -9 : v.sqT);
  if (tq >= 0 && tq < 0.4) { const a = 0.16 * Math.exp(-tq * 11) * Math.cos(tq * 30); st.sx = 1 + a; st.sy = 1 - a * 0.85; } else { st.sx = 1; st.sy = 1; }
  // death: pixel dissolve into embers/ash (mobs are removed at deathT 0.8)
  if (e.dead && e !== P && e.deathT !== undefined) { st.dis = clamp((e.deathT - 0.26) / 0.5, 0, 1); if (st.dis > 0.02) st.cast = false; st.a = 1; const ch = 1 - 0.6 * smoothstep(0, 0.5, st.dis); st.col[0] *= ch; st.col[1] *= ch * 0.92; st.col[2] *= ch * 0.88; }
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
// Contact blob under a sprite: smaller and fainter when real shadows are on.
function placeBlob(v, x, gh, y, r, z, on) { v.shadow.position.set(x, gh + 0.03, y); v.shadow.scale.setScalar(r * (SPRF.shadows ? 0.62 : 0.85) * (1 - Math.min(0.5, z * 0.3))); v.shadow.visible = on; }
// Per-entity motion FX: footstep dust, death embers, ghost wisps.
function sprMotion(v, e, st, hu) {
  if (typeof PFX === 'undefined') return;
  const gh = groundH(e.x, e.y);
  if (e.moving && !st.ghost && !(e.z > 0)) {
    const step = Math.floor((e.walk || 0) / 2.3);
    if (v.step !== undefined && step !== v.step) PFX.dust(e.x, gh, e.y, e === P ? 3 : 2, (e.d && e.d.size) || 1);
    v.step = step;
  }
  if (e === P) {
    if (P.dodgeT > 0 && !(v.dodging)) PFX.dust(e.x, gh, e.y, 7, 1.3);
    if (P.dodgeT > 0 && Math.random() < 0.6) PFX.dust(e.x, gh, e.y, 1, 0.8);
    v.dodging = P.dodgeT > 0;
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
  const shadow = new THREE.Mesh(FLATPLANE, SHADOWMAT); shadow.renderOrder = -1; scene.add(shadow);
  const caster = makeCaster(UNITPLANE, tex);
  const v = { F, mat, mesh, shadow, caster, meshes: [mesh, shadow, caster], flip: e.fx < 0 ? -1 : 1 };
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
  if (v.xray) { v.xray.material.map = tex; v.xray.scale.copy(v.mesh.scale); v.xray.position.copy(v.mesh.position); v.xray.rotation.y = cam.yaw; v.xray.visible = !P.dead; }
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
function playerPose() {
  if (P.dead) return { anim: 'dead', i: 0 };
  if (P.dodgeT > 0) return { anim: 'dodge', i: Math.min(3, Math.floor((1 - P.dodgeT / 0.34) * 4)), tint: [0.85, 0.9, 1] };
  if (P.charge >= 0) { const full = P.charge >= 0.8 && Math.floor(time * 12) % 2; return { anim: 'attack', i: 0, tint: full ? [1.0, 0.85, 0.5] : undefined }; }
  if (P.blocking) return { anim: 'block', i: 0 };
  if (P.sitting) return { anim: 'sit', i: 0 };
  if (P.casting) return { anim: 'cast', i: Math.floor(time * 4) % 2 };
  if (P.atkAnim >= 0) return { anim: 'attack', i: Math.min(3, Math.floor(P.atkAnim * 4)) };
  if (P.hurtT > 0.12) return { anim: 'hurt', i: 0 };
  if (P.moving) return { anim: 'walk', i: Math.floor(P.walk * 1.26) % 6 };
  return { anim: 'idle', i: Math.floor(time * 2.5) % 4 };
}
const DROPTEX = {};
function dropTex(d) {
  if (d.zeny) { const k = d.lost ? 'lost' : 'zeny'; if (DROPTEX[k]) return DROPTEX[k]; const c = mkCanvas(32, 32), g = c.getContext('2d'); if (d.lost) { g.fillStyle = '#8a1018'; g.beginPath(); g.ellipse(16, 24, 13, 6, 0, 0, 7); g.fill(); g.fillStyle = '#e8c050'; g.beginPath(); g.ellipse(16, 20, 5, 3, 0, 0, 7); g.fill(); } else { for (let i = 0; i < 4; i++) { g.fillStyle = '#b08420'; g.beginPath(); g.ellipse(9 + i * 5, 25 - i * 3, 6, 3.5, 0, 0, 7); g.fill(); g.fillStyle = '#f4d060'; g.beginPath(); g.ellipse(9 + i * 5, 24 - i * 3, 6, 3.2, 0, 0, 7); g.fill(); } } pixelize(c, [40, 26, 10]); return (DROPTEX[k] = canvasTex(c, { pixel: true })); }
  const t = ITEMS[d.item.id], k = t.icon + '|' + (t.color || ''); if (DROPTEX[k]) return DROPTEX[k];
  const src = iconCanvas(t), c = mkCanvas(32, 32), g = c.getContext('2d'); g.drawImage(src, 2, 2, 28, 28); pixelize(c, [30, 20, 16]);
  return (DROPTEX[k] = canvasTex(c, { pixel: true }));
}
const RCOL = { common: 0xffffff, magic: 0x7fa0ff, rare: 0xffd84a, unique: 0xff9a30, card: 0xd0a8ff, key: 0xffa870 };
function syncDrop(d) {
  let v = VIS.get(d);
  if (!v) {
    const mat = spriteMat(sprTexEnc(dropTex(d))); const mesh = new THREE.Mesh(UNITPLANE, mat); scene.add(mesh); v = { mat, mesh, meshes: [mesh], F: null };
    const r = d.lost ? 'lostz' : d.zeny ? null : rarityOf(d.item);
    if (r && r !== 'common') { const gm = new THREE.MeshBasicMaterial({ map: TEX.soft, color: r === 'lostz' ? 0xff2020 : RCOL[r], transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }); const gl = new THREE.Mesh(FLATPLANE, gm); gl.renderOrder = -1; scene.add(gl); v.glowM = gl; v.meshes.push(gl); }
    VIS.set(d, v);
  }
  v.seen = frameNo;
  const gh = groundH(d.x, d.y), bounce = Math.max(0, 1 - d.t * 2.5) * Math.abs(Math.sin(d.t * 9)) * 0.6, s = d.lost ? 0.9 : 0.62;
  v.mesh.scale.set(s, s / COSP, 1); v.mesh.position.set(d.x, gh + bounce, d.y); v.mesh.rotation.y = cam.yaw;
  if (v.glowM) { v.glowM.position.set(d.x, gh + 0.04, d.y); v.glowM.scale.setScalar(0.6 + Math.sin(time * 4) * 0.08); }
}
function syncEntities() {
  frameNo++;
  SPRF.dt = clamp(time - SPRF.t, 0, 0.25); SPRF.t = time;
  SPRF.shadows = shadowsOn(); SPRF.cyaw = casterYaw(); SPRF.rx = Math.cos(cam.yaw); SPRF.ry = -Math.sin(cam.yaw);
  SHADOWMAT.opacity = SPRF.shadows ? 0.42 : 0.6;
  const sh = typeof syncSheetMob === 'function';
  for (const m of mobs) if (!(sh && syncSheetMob(m))) syncSprite(m, framesForMob(m), mobPose(m));
  for (const n of map.npcs) { if (n.fx === undefined) { n.fx = n.dir; n.fy = 0.4; } if (!(sh && syncSheetNPC(n))) syncSprite(n, framesForNPC(n), { anim: 'idle', i: Math.floor(time * 2 + n.x) % 4 }); }
  for (const d of drops) syncDrop(d);
  if (started && !(typeof syncSheetPlayer === 'function' && syncSheetPlayer())) syncSprite(P, framesForPlayer(), playerPose());
  for (const [e, v] of VIS) if (v.seen !== frameNo) { disposeVis(v); VIS.delete(e); }
  const king = mobs.find(m => m.type === 'ashen_king' && !m.dead); if (king && Math.random() < 0.6) parts.push({ x: king.x + rand(-0.6, 0.6), y: king.y + rand(-0.6, 0.6), z: rand(10, 120), vx: 0, vy: 0, vz: rand(40, 90), life: rand(0.4, 0.9), max: 0.9, col: pick(['#ff7a2a', '#ffb04a', '#ff4a1a']), size: 2.5, float: true });
  syncSwing();
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
    return { geo, mat, pts, pos, col, size, list: [], N };
  }
  const A = sys(true, THREE.NormalBlending, 400), B = sys(false, THREE.AdditiveBlending, 500), C = sys(false, THREE.NormalBlending, 300);
  const cap = () => { const q = gfxQ(); return q === 'low' ? 0.35 : q === 'medium' ? 0.7 : 1; };
  const add = (S, p) => { if (S.list.length < S.N * cap()) S.list.push(p); };
  const DUST = { grass: [0.84, 0.8, 0.64], flag: [0.66, 0.66, 0.72], rock: [0.46, 0.4, 0.38] };
  function dust(x, y, z, n, s) {
    const L = map.d.look, c = L.cobble && map.deco ? [0.86, 0.8, 0.68] : (DUST[L.floor] || DUST.grass);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, sp = rand(0.25, 0.9) * s;
      add(A, { x: x + Math.cos(a) * 0.12, y: y + 0.06, z: z + Math.sin(a) * 0.12, vx: Math.cos(a) * sp, vy: rand(0.2, 0.7), vz: Math.sin(a) * sp, g: -0.4, drag: 3.5, life: 0, max: rand(0.45, 0.8), c, a0: rand(0.5, 0.68), s0: 0.2 * s, s1: rand(0.55, 0.85) * s });
    }
  }
  function ember(x, y, z, cold) {
    if (Math.random() < 0.72) add(B, { x, y, z, vx: rand(-0.4, 0.4), vy: rand(0.8, 2.2), vz: rand(-0.4, 0.4), g: 0.6, drag: 1.2, life: 0, max: rand(0.5, 1.1), c: cold ? [0.7, 0.9, 1.4] : [1.6, rand(0.7, 1.0), 0.25], c2: cold ? [0.2, 0.3, 0.6] : [0.7, 0.1, 0.02], a0: 1, s0: rand(0.07, 0.12), s1: 0.03, wob: rand(2, 5) });
    else add(C, { x, y, z, vx: rand(-0.3, 0.3), vy: rand(0.3, 1.0), vz: rand(-0.3, 0.3), g: 0.1, drag: 1.5, life: 0, max: rand(0.7, 1.3), c: cold ? [0.75, 0.8, 0.9] : [0.2, 0.18, 0.18], a0: 0.9, s0: rand(0.06, 0.1), s1: 0.05, wob: rand(1, 3) });
  }
  function wisp(x, y, z) { add(B, { x, y, z, vx: rand(-0.15, 0.15), vy: rand(0.2, 0.5), vz: rand(-0.15, 0.15), g: 0, drag: 0.5, life: 0, max: rand(0.9, 1.6), c: [0.45, 0.7, 1], c2: [0.15, 0.25, 0.55], a0: 0.7, s0: 0.07, s1: 0.02, wob: rand(1, 2) }); }
  function step(S, dt) {
    const L = S.list, lin = sprLinear(); let n = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i]; p.life += dt; if (p.life >= p.max) continue;
      const k = p.life / p.max, dr = Math.exp(-p.drag * dt);
      p.vx *= dr; p.vz *= dr; p.vy = p.vy * dr + p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.wob) { p.x += Math.sin(time * p.wob + i) * 0.25 * dt; }
      L[n++] = p;
      const j = n - 1, c = p.c2 ? [p.c[0] + (p.c2[0] - p.c[0]) * k, p.c[1] + (p.c2[1] - p.c[1]) * k, p.c[2] + (p.c2[2] - p.c[2]) * k] : p.c;
      S.pos[j * 3] = p.x; S.pos[j * 3 + 1] = p.y; S.pos[j * 3 + 2] = p.z;
      S.col[j * 4] = lin ? Math.pow(c[0], 2.2) : c[0]; S.col[j * 4 + 1] = lin ? Math.pow(c[1], 2.2) : c[1]; S.col[j * 4 + 2] = lin ? Math.pow(c[2], 2.2) : c[2];
      S.col[j * 4 + 3] = p.a0 * (p.c2 ? (1 - k * k) : (1 - k) * Math.min(1, k * 8 + 0.3));
      S.size[j] = p.s0 + (p.s1 - p.s0) * (1 - (1 - k) * (1 - k));
    }
    L.length = n; S.geo.setDrawRange(0, n);
    if (n) { for (const a of ['position', 'pcol', 'psize']) S.geo.attributes[a].needsUpdate = true; }
    S.mat.uniforms.uScale.value = H * renderer.getPixelRatio() * 0.5 * camera.projectionMatrix.elements[5];
  }
  return {
    dust, ember, wisp,
    update(dt) { step(A, dt); step(B, dt); step(C, dt); },
    clear() { A.list.length = B.list.length = C.list.length = 0; for (const S of [A, B, C]) S.geo.setDrawRange(0, 0); },
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
const SWINGCOL = { sword: ['#8fb8ff', '#ffffff'], dagger: ['#b8e0ff', '#ffffff'], mace: ['#ffb060', '#fff2d0'], rod: ['#c49aff', '#fff0ff'], fist: ['#ffe0b0', '#ffffff'], heavy: ['#ff8a2a', '#fff4c0'] };
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
const _tc = new THREE.Color(), _tc2 = new THREE.Color();
function syncDecals() {
  for (const t of teles) syncDecal(t, () => {
    const base = decalMesh(FXT.disc, 0x000000, 0.3, false, STENCIL_ONCE(2)); base.renderOrder = -3;
    const grow = decalMesh(FXT.fill, 0x000000, 0.8, true, STENCIL_ONCE(4)); grow.renderOrder = -2;
    const rune = decalMesh(FXT.rune, 0x000000, 1, true);
    return [base, grow, rune];
  }, ([base, grow, rune]) => {
    const gh = groundH(t.x, t.y) + 0.05, k = clamp(t.t / t.dur, 0, 1), late = smoothstep(0.7, 1, k);
    for (const m of [base, grow, rune]) m.position.set(t.x, gh, t.y);
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
  if (P && P.casting) { const col = new THREE.Color(ELCOL[SKILLS[P.casting.id].el] || '#ffffff'); syncDecal('cast', () => [decalMesh(TEX.magic, col, 0.95, true)], ([a]) => { a.material.color.copy(col); a.position.set(P.x, groundH(P.x, P.y) + 0.07, P.y); a.rotation.y = time * 1.4; a.scale.setScalar(1.3 + Math.sin(time * 6) * 0.05); }); }
  syncTargetRing();
  for (const [k, v] of DV) if (v.seen !== frameNo) { for (const m of v.meshes) { scene.remove(m); m.material.dispose(); } DV.delete(k); }
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
    for (const m of [glow, ring, lock]) m.position.set(tg.x, gh, tg.y);
    wcol(col, glow.material.color); glow.scale.setScalar(s * 1.1); glow.material.opacity = mode === 'hover' ? 0.18 : 0.32 + 0.08 * Math.sin(time * 5);
    ring.material.map = mode === 'hover' ? FXT.hover : FXT.target; wcol(col, ring.material.color);
    ring.material.opacity = mode === 'hover' ? 0.7 : 0.95; ring.rotation.y = time * (mode === 'hover' ? 0.4 : 0.9); ring.scale.setScalar(s * pop * (1 + 0.03 * Math.sin(time * 6)));
    lock.visible = mode === 'lock'; if (lock.visible) { wcol('#ffb0c0', lock.material.color); lock.rotation.y = -time * 1.6; lock.scale.setScalar(s * 0.92 * pop); lock.material.opacity = 0.85; }
  });
}
/* ---------- Picking ---------- */
function pickAt(sx, sy) {
  let best = null, bd = 1e9;
  const test = (e, hw, rw) => { const gh = groundH(e.x, e.y) + (e.z || 0) / PXU; const p = proj(e.x, e.y, gh + hw * 0.5); if (p[2] > 1) return; const d = Math.hypot(sx - p[0], sy - p[1]), r = Math.max(16, rw * PPU); if (d < r && d < bd) { bd = d; best = e; } };
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
function label(txt, x, y, col, size, box) {
  ctx.font = `700 ${size}px ${UIFONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  if (box) { const w = ctx.measureText(txt).width + 12; ctx.fillStyle = 'rgba(12,10,16,.72)'; rrect(ctx, x - w / 2, y - size - 1, w, size + 7, 4); ctx.fill(); ctx.strokeStyle = 'rgba(255,236,200,.22)'; ctx.lineWidth = 1; ctx.stroke(); }
  ctx.lineWidth = 3.2; ctx.strokeStyle = 'rgba(8,6,10,.92)'; ctx.lineJoin = 'round'; ctx.strokeText(txt, x, y); ctx.fillStyle = col; ctx.fillText(txt, x, y);
}
function star(x, y, r1, r2, n, col, rot) { ctx.fillStyle = col; ctx.beginPath(); for (let i = 0; i < n * 2; i++) { const a = i * Math.PI / n - Math.PI / 2 + (rot || 0), r = i % 2 ? r2 : r1; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.closePath(); ctx.fill(); }
// Framed gauge: dark rounded frame with a thin light rim, gradient fill, optional lag chip.
function gauge(x, y, w, h, k, c0, c1, lag) {
  k = clamp(k, 0, 1);
  ctx.fillStyle = 'rgba(8,8,14,.82)'; rrect(ctx, x - 1.5, y - 1.5, w + 3, h + 3, 2.5); ctx.fill();
  ctx.strokeStyle = 'rgba(255,238,205,.32)'; ctx.lineWidth = 1; ctx.stroke();
  if (lag !== undefined && lag > k) { ctx.fillStyle = 'rgba(255,226,150,.85)'; ctx.fillRect(x + w * k, y, w * (lag - k), h); }
  if (k > 0) { const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, c0); g.addColorStop(1, c1); ctx.fillStyle = g; ctx.fillRect(x, y, w * k, h); ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fillRect(x, y, w * k, Math.max(1, h * 0.34)); }
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
function drawOverlay() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, W, H);
  const sc = clamp(PPU / 34, 0.75, 1.5);
  // Particles and spell effects (additive)
  ctx.globalCompositeOperation = 'lighter';
  for (const p of parts) { const q = proj(p.x, p.y, groundH(p.x, p.y) + p.z / PXU); if (q[2] > 1) continue; ctx.globalAlpha = Math.min(1, p.life / p.max * 1.4); ctx.fillStyle = p.col; const s = p.size * sc * 1.1; ctx.fillRect(q[0] - s / 2, q[1] - s / 2, s, s); }
  ctx.globalAlpha = 1;
  for (const p of projs) {
    const a = proj(p.x, p.y, p.zu), b = proj(p.x - p.vx * 0.6, p.y - p.vy * 0.6, p.zu - p.vz * 0.6); if (a[2] > 1) continue;
    if (p.kind === 'arrow') { ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 2.5 * sc; ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(a[0], a[1]); ctx.stroke(); ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 1.2 * sc; ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(b[0] + (a[0] - b[0]) * 0.25, b[1] + (a[1] - b[1]) * 0.25); ctx.stroke(); ctx.globalCompositeOperation = 'lighter'; continue; }
    const col = PCOL[p.kind] || '#fff', r = 13 * sc;
    const tg = ctx.createLinearGradient(b[0], b[1], a[0], a[1]); tg.addColorStop(0, rgba(col, 0)); tg.addColorStop(1, rgba(col, 0.8)); ctx.strokeStyle = tg; ctx.lineWidth = r * 0.9; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(a[0], a[1]); ctx.stroke();
    const g = ctx.createRadialGradient(a[0], a[1], 0, a[0], a[1], r); g.addColorStop(0, '#fff'); g.addColorStop(0.35, col); g.addColorStop(1, rgba(col, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(a[0], a[1], r, 0, 7); ctx.fill();
    if (Math.random() < 0.6) parts.push({ x: p.x, y: p.y, z: (p.zu - groundH(p.x, p.y)) * PXU, vx: rand(-0.3, 0.3), vy: rand(-0.3, 0.3), vz: rand(-10, 30), life: 0.35, max: 0.35, col, size: 2.5 });
  }
  for (const f of fxs) {
    const k = f.t / f.dur;
    if (f.k === 'pillar') { const e = f.e, gh = groundH(e.x, e.y), b = proj(e.x, e.y, gh), t = proj(e.x, e.y, gh + 6); const a = Math.sin(k * Math.PI), wd = (f.big ? 1.2 : 0.8) * PPU; const g = ctx.createLinearGradient(0, t[1], 0, b[1]); g.addColorStop(0, rgba(f.col, 0)); g.addColorStop(1, rgba(f.col, 0.6 * a)); ctx.fillStyle = g; ctx.fillRect(b[0] - wd / 2, t[1], wd, b[1] - t[1]); for (let i = 0; i < 8; i++) { ctx.fillStyle = rgba(f.col, a); const yy = b[1] - ((k * 1.4 + i / 8) % 1) * (b[1] - t[1]); ctx.fillRect(b[0] + Math.sin(i * 2.3 + time * 4) * wd * 0.55, yy, 2.5 * sc, 7 * sc); } }
    else if (f.k === 'strike') { const gh = groundH(f.x, f.y), b = proj(f.x, f.y, gh), t = proj(f.x, f.y, gh + 9); const r = mulberry32(f.seed | 0); ctx.strokeStyle = `rgba(255,252,210,${1 - k})`; ctx.lineWidth = 3.5 * sc; ctx.shadowColor = '#bfe0ff'; ctx.shadowBlur = 14; ctx.beginPath(); ctx.moveTo(t[0], t[1]); const n = 7; for (let i = 1; i <= n; i++) ctx.lineTo(t[0] + (b[0] - t[0]) * i / n + (i < n ? (r() - 0.5) * 26 * sc : 0), t[1] + (b[1] - t[1]) * i / n); ctx.stroke(); ctx.shadowBlur = 0; }
    else if (f.k === 'rain') { const gh = groundH(f.x, f.y); ctx.strokeStyle = `rgba(240,230,200,${1 - k})`; ctx.lineWidth = 1.6 * sc; for (let i = 0; i < 18; i++) { const ox = Math.sin(i * 12.9) * 1.8, oy = Math.cos(i * 7.3) * 1.8, z = (1 - k) * 5 + (i % 5) * 0.3; const a = proj(f.x + ox, f.y + oy, gh + z), b = proj(f.x + ox, f.y + oy, gh + z + 0.8); ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(a[0], a[1]); ctx.stroke(); } }
    else if (f.k === 'meteor') { const a = proj(f.x, f.y, groundH(f.x, f.y)), r = 2 * PPU; const g = ctx.createRadialGradient(a[0], a[1], 0, a[0], a[1], r); g.addColorStop(0, rgba('#fff0c0', 1 - k)); g.addColorStop(0.4, rgba(f.col, 0.7 * (1 - k))); g.addColorStop(1, rgba(f.col, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(a[0], a[1], r, r * 0.6, 0, 0, 7); ctx.fill(); }
    else if (f.k === 'spark') {
      const a = proj(f.x, f.y, f.h), r = (f.crit ? 28 : 19) * sc * (0.45 + k * 0.9), al = 1 - k;
      const g = ctx.createRadialGradient(a[0], a[1], 0, a[0], a[1], r * 0.8); g.addColorStop(0, f.hurt ? `rgba(255,140,120,${0.8 * al})` : `rgba(255,250,220,${0.85 * al})`); g.addColorStop(1, 'rgba(255,200,120,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(a[0], a[1], r * 0.8, 0, 7); ctx.fill();
      ctx.strokeStyle = f.hurt ? `rgba(255,120,100,${al})` : `rgba(255,250,210,${al})`; ctx.lineWidth = (f.crit ? 3 : 2.2) * sc * (1 - k * 0.5); ctx.beginPath();
      for (let i = 0; i < 8; i++) { const an = i * Math.PI / 4 + 0.3, rr = i % 2 ? r * 0.75 : r; ctx.moveTo(a[0] + Math.cos(an) * rr * 0.35, a[1] + Math.sin(an) * rr * 0.35); ctx.lineTo(a[0] + Math.cos(an) * rr, a[1] + Math.sin(an) * rr); } ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = 'source-over'; ctx.lineCap = 'butt';
  // Names
  for (const n of map.npcs) { const a = proj(n.x, n.y, groundH(n.x, n.y)); if (a[2] < 1) label(n.name, a[0], a[1] + 17 * sc, '#cfe6ff', 11.5); }
  for (const o of map.objs) if ((o.kind === 'way' || o.kind === 'heart') && hover === o) { const a = proj(o.x, o.y, groundH(o.x, o.y)); label(o.name, a[0], a[1] + 18 * sc, '#ffd8a8', 11.5); }
  for (const d of drops) {
    if (!(mouse.alt || hover === d || d.lost || (d.item && ['unique', 'card', 'key', 'rare'].includes(rarityOf(d.item))))) continue;
    const a = proj(d.x, d.y, groundH(d.x, d.y) + 0.9); if (a[2] > 1) continue;
    const txt = d.lost ? `Your lost zeny (${fmt(d.zeny)})` : d.zeny ? `${fmt(d.zeny)} zeny` : itemName(d.item) + (d.item.qty > 1 ? ` ×${d.item.qty}` : '');
    const col = d.lost ? '#ff9a9a' : d.zeny ? '#ffe070' : { common: '#ffffff', magic: '#9ab8ff', rare: '#ffe070', unique: '#ffb050', card: '#e0c4ff', key: '#ffc090' }[rarityOf(d.item)];
    label(txt, a[0], a[1], col, 11, true);
  }
  for (const m of mobs) {
    if (m.dead) continue; const gh = groundH(m.x, m.y); const a = proj(m.x, m.y, gh); if (a[2] > 1) continue;
    const sel = hover === m || P.target === m || (typeof CTRL !== 'undefined' && CTRL.lock === m);
    const k = m.hp / m.maxhp, lag = lagOf(m, k);
    if ((k < 1 || sel) && !m.d.boss) { const wd = Math.round(40 * sc), y = Math.round(a[1] + 9 * sc); gauge(Math.round(a[0] - wd / 2), y, wd, 4, k, k < 0.3 ? '#ff7a4a' : '#ff5a4a', k < 0.3 ? '#c02810' : '#b81c1c', lag); }
    if (sel) { const lv = m.d.lvl - (P.lvl || 1), lc = lv >= 5 ? '#ff8a7a' : lv >= 0 ? '#ffe0b0' : '#c8f0c0'; label(`${m.d.name}  Lv ${m.d.lvl}`, a[0], a[1] + 28 * sc, m.d.aggro ? lc : '#ffffff', 12); }
  }
  if (P && started && !P.dead) {
    const gh = groundH(P.x, P.y), a = proj(P.x, P.y, gh), wd = Math.round(46 * sc), x = Math.round(a[0] - wd / 2), y = Math.round(a[1] + 9 * sc), hk = P.hp / S.maxhp;
    gauge(x, y, wd, 4, hk, hk < 0.25 ? '#ff6a5a' : '#8cf07a', hk < 0.25 ? '#c81c1c' : '#26a832', lagOf(P, hk));
    gauge(x, y + 6.5, wd, 2.5, P.sp / S.maxsp, '#8ac4ff', '#2a6ae0');
    if (P.stamina < 100) gauge(x, y + 11.5, wd, 2, P.stamina / 100, P.stamina < 22 ? '#ffb070' : '#fff080', P.stamina < 22 ? '#e0501a' : '#d8b020');
    if (P.casting) { const t = proj(P.x, P.y, gh + headH(P) + 0.35), k = 1 - P.castT / P.castMax; gauge(Math.round(t[0] - 30), Math.round(t[1] - 3), 60, 5, k, '#b8ff9a', '#3cb83c'); }
  }
  // RO-style damage numbers: pop, arc to the side, bounce; crits get a burst.
  for (const f of floats) {
    const a = proj(f.x, f.y, f.hw); if (a[2] > 1) continue; const k = f.t; let x = a[0], y = a[1], life = 0.95, s = 1;
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
    const px = Math.round(st.size * sc), gl = numGlyph(f.txt, f.kind, px), w = gl.cw * s, h = gl.ch * s;
    if (f.kind === 'crit') { ctx.globalAlpha = al * 0.9; star(x, y, px * 1.25 * s, px * 0.6 * s, 10, 'rgba(210,30,20,.9)', k * 2); star(x, y, px * 0.95 * s, px * 0.45 * s, 10, 'rgba(255,140,40,.9)', -k * 3); ctx.globalAlpha = al; }
    if (f.kind === 'skill') { ctx.fillStyle = 'rgba(10,8,6,.55)'; rrect(ctx, x - w / 2 + 4, y - h * 0.32, w - 8, h * 0.64, h * 0.3); ctx.fill(); }
    ctx.drawImage(gl, x - w / 2, y - h / 2, w, h);
  }
  ctx.globalAlpha = 1;
  drawScreenParts();
}
function setScreenParts() {
  screenParts = []; const n = map.d.part === 'dust' ? 40 : 60;
  for (let i = 0; i < n; i++) screenParts.push({ x: Math.random() * W, y: Math.random() * H, v: rand(0.3, 1), s: rand(1, 2.6), ph: Math.random() * 6 });
}
function drawScreenParts() {
  const kind = map.d.part;
  for (const p of screenParts) {
    if (kind === 'ember') { p.y -= p.v * 0.9; p.x += Math.sin(time + p.ph) * 0.4; if (p.y < -5) { p.y = H + 5; p.x = Math.random() * W; } ctx.fillStyle = `rgba(255,${120 + p.v * 80 | 0},40,${0.55 * p.v})`; }
    else if (kind === 'dust') { p.y += Math.sin(time * 0.5 + p.ph) * 0.15; p.x += 0.1 * p.v; if (p.x > W) p.x = 0; ctx.fillStyle = `rgba(180,190,230,${0.2 * p.v})`; }
    else if (kind === 'leaf') { p.y += p.v * 0.6; p.x += Math.sin(time * 1.3 + p.ph) * 0.7; if (p.y > H + 5) { p.y = -5; p.x = Math.random() * W; } ctx.fillStyle = `rgba(120,150,60,${0.45 * p.v})`; }
    else if (kind === 'petal') { p.y += p.v * 0.45; p.x += 0.3 + Math.sin(time + p.ph) * 0.4; if (p.y > H + 5) { p.y = -5; p.x = Math.random() * W; } if (p.x > W + 5) p.x = -5; ctx.fillStyle = `rgba(255,200,220,${0.5 * p.v})`; }
    else { p.y += p.v * 0.5; p.x += 0.25 + Math.sin(time + p.ph) * 0.3; if (p.y > H + 5) { p.y = -5; p.x = Math.random() * W; } if (p.x > W + 5) p.x = -5; ctx.fillStyle = `rgba(215,212,205,${0.35 * p.v})`; }
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
  const px = ox + P.x * s, py = oy + P.y * s, a = Math.atan2(P.fy || 0, P.fx || 1);
  g.save(); g.translate(px, py); g.rotate(a); g.fillStyle = '#ffffff'; g.strokeStyle = '#000'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(8, 0); g.lineTo(-5, -5); g.lineTo(-2, 0); g.lineTo(-5, 5); g.closePath(); g.fill(); g.stroke(); g.restore();
}
function render(dt) {
  updateCamera(dt || 0.016);
  animateWorld(dt || 0.016);
  syncEntities();
  syncDecals();
  renderer.render(scene, camera);   // gfx-post.js routes this through its composer
  drawOverlay();
}
