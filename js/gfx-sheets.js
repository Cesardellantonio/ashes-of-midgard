'use strict';
/* =========================================================
   Pre-rendered sprite sheets (paper-doll layers) for the player.
   Sheets live in assets/sprites/<id>.png + <id>.json, listed in
   assets/sprites/index.json. Layers draw body -> hair -> weapon,
   all sharing one frame size and feet anchor.

   Two JSON layouts are supported:
   - "dir-blocks" (json.layout === 'dir-blocks'): frame f of the
     action at row r, direction d -> x = (d*maxFrames + f)*frameW,
     y = r*frameH.
   - legacy (no layout field): one row per action x direction;
     direction d lives at row (row + d), x = f*frameW.
   Sheets hold 5 facings (S, SE, E, NE, N); SW, W, NW are the
   horizontal mirrors of SE, E, NE.
   ========================================================= */
const SHEET_BASE = (typeof window !== 'undefined' && window.AOM_SPRITE_BASE) || 'assets/sprites/';
const SHEET_IDS = ['novice_m.body', 'novice_f.body', 'hair_spiky_m', 'hair_spiky_f', 'hair_long_m', 'hair_long_f', 'weapon_knife_m', 'weapon_knife_f'];
const SHEETS = { byId: {}, pending: 0, done: false, failed: [], started: false };
const HAIR_GREY = 0.72;            // neutral grey the hair sheets are painted in
const LAYER_ORDER = ['body', 'hair', 'weapon'];

/* ---------- Loading ---------- */
function sheetXHR(url, ok, bad) {
  try {
    const x = new XMLHttpRequest();
    x.open('GET', url, true);
    x.onload = () => {
      // file:// (with --allow-file-access-from-files) reports status 0
      if ((x.status === 200 || x.status === 0) && x.responseText) { try { ok(JSON.parse(x.responseText)); } catch (e) { bad(e); } }
      else bad(new Error(url + ' -> HTTP ' + x.status));
    };
    x.onerror = () => bad(new Error(url + ' -> network error'));
    x.send();
  } catch (e) { bad(e); }
}
function loadSheet(id, done) {
  const rec = { id, json: null, tex: null, texW: 0, texH: 0, ok: false, err: null };
  SHEETS.byId[id] = rec;
  let left = 2;
  const fin = err => { if (err && !rec.err) rec.err = String(err && err.message || err); if (--left) return; rec.ok = !rec.err && !!rec.json && !!rec.tex; if (!rec.ok) SHEETS.failed.push(id); done(); };
  sheetXHR(SHEET_BASE + id + '.json', j => { rec.json = j; fin(); }, fin);
  try {
    new THREE.TextureLoader().load(SHEET_BASE + id + '.png', t => {
      t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
      rec.tex = t; rec.texW = t.image.width; rec.texH = t.image.height; fin();
    }, undefined, () => fin(new Error(id + '.png failed to load')));
  } catch (e) { fin(e); }
}
function preloadSheets(cb) {
  if (SHEETS.started) { if (cb) cb(); return; }
  SHEETS.started = true;
  const go = ids => {
    ids = ids.filter((v, i, a) => v && a.indexOf(v) === i);
    SHEETS.pending = ids.length;
    if (!ids.length) { SHEETS.done = true; if (cb) cb(); return; }
    for (const id of ids) loadSheet(id, () => { if (--SHEETS.pending === 0) { SHEETS.done = true; if (cb) cb(); } });
  };
  // index.json lists the sheets; fall back to the known set if it is missing.
  sheetXHR(SHEET_BASE + 'index.json', j => go((j && j.sheets || []).map(s => s.id).concat(SHEET_IDS)), () => go(SHEET_IDS.slice()));
}
function sheetReady(id) { const r = SHEETS.byId[id]; return !!(r && r.ok); }

/* ---------- Frame math ---------- */
// Pixel rect of frame f of `action` in sheet direction index d (index into json.dirs).
function sheetRect(json, action, d, f) {
  const a = json.actions[action]; if (!a) return null;
  const fw = json.frameW, fh = json.frameH, n = Math.max(1, a.frames | 0);
  f = Math.max(0, Math.min(n - 1, f | 0)); d = Math.max(0, Math.min(json.dirs.length - 1, d | 0));
  if (json.layout === 'dir-blocks') { const mf = json.maxFrames || n; return { x: (d * mf + f) * fw, y: a.row * fh, w: fw, h: fh }; }
  return { x: f * fw, y: (a.row + d) * fh, w: fw, h: fh };
}
// Same rect as texture UVs (flipY: v=1 is the top of the image).
function sheetUV(rect, texW, texH) { return { u0: rect.x / texW, u1: (rect.x + rect.w) / texW, v0: 1 - (rect.y + rect.h) / texH, v1: 1 - rect.y / texH }; }

// 8-way facing relative to the camera. Returns sector -4..4 (0 = S toward camera,
// +2 = E / screen right, +-4 = N). prev gives hysteresis so the facing does not flicker.
const SHEET_DIR8 = ['S', 'SE', 'E', 'NE', 'N'];
function facingSector(fx, fy, yaw, prev) {
  const rx = Math.cos(yaw), ry = -Math.sin(yaw), fwx = -Math.sin(yaw), fwy = -Math.cos(yaw);
  const sr = fx * rx + fy * ry, sf = fx * fwx + fy * fwy;
  if (Math.abs(sr) + Math.abs(sf) < 1e-6) return prev === undefined ? 0 : prev;
  const a = Math.atan2(sr, -sf), step = Math.PI / 4;
  if (prev !== undefined) { let da = a - prev * step; da = Math.atan2(Math.sin(da), Math.cos(da)); if (Math.abs(da) < step * 0.5 + 0.12) return prev; }
  let s = Math.round(a / step); if (s === -4) s = 4; return s;
}
function sectorToDir(json, s) {
  const name = SHEET_DIR8[Math.abs(s)], d = json.dirs.indexOf(name);
  return { d: d < 0 ? 0 : d, flip: s < 0 && s > -4, name: s < 0 && s > -4 ? ['', 'SW', 'W', 'NW'][-s] : name };
}

/* ---------- Which sheets the player wears ---------- */
function sheetGender() { return P && P.gender === 'f' ? 'f' : 'm'; }
function playerSheetIds() {
  if (!P) return null; const g = sheetGender();
  const body = `${P.cls}_${g}.body`; if (!sheetReady(body)) return null;
  const ids = [body];
  const hair = `hair_${P.hairStyle === 'long' ? 'long' : 'spiky'}_${g}`; if (sheetReady(hair)) ids.push(hair);
  if (typeof S !== 'undefined' && S.wtype === 'dagger' && sheetReady(`weapon_knife_${g}`)) ids.push(`weapon_knife_${g}`);
  return ids;
}
function usingSheetPlayer() { return !!(SHEETS.done && P && playerSheetIds()); }

/* ---------- Pose -> action/frame ---------- */
function sheetHas(json, a) { return !!(json.actions[a] && json.actions[a].frames > 0); }
function sheetPlayerPose(v, body) {
  const A = body.actions, n = a => (A[a] ? A[a].frames : 1), fps = a => (A[a] && A[a].fps) || 8;
  const held = a => { if (v.act !== a) { v.act = a; v.actT = time; } return Math.floor((time - v.actT) * fps(a)); };
  let act = 'idle', f = 0, tint;
  // heavy swing: remember the charge so the release plays the heavy strike, not a light one
  if (P.charge >= 0) v.heavyArm = true;
  else if (!(P.atkAnim >= 0) && v.heavyArm && !v.heavySwing) v.heavyArm = false;
  if (P.atkAnim >= 0 && v.heavyArm) { v.heavySwing = true; v.heavyArm = false; }
  if (!(P.atkAnim >= 0)) v.heavySwing = false;
  if (P.atkAnim >= 0 && v.lastAtk < 0 && !v.heavySwing) v.swings++;
  v.lastAtk = P.atkAnim >= 0 ? P.atkAnim : -1;
  if (P.atkAnim >= 0 || P.charge >= 0 || P.blocking) v.combatT = time;

  if (P.dead) { act = 'dead'; f = held('dead'); }
  else if (P.dodgeT > 0) { act = 'dodge'; f = Math.floor((1 - P.dodgeT / 0.34) * n('dodge')); tint = [0.85, 0.9, 1]; }
  else if (P.charge >= 0) { act = 'heavy'; f = Math.min(1, Math.floor(P.charge / 0.8 * 2)); if (P.charge >= 0.8 && Math.floor(time * 12) % 2) tint = [1.0, 0.85, 0.5]; }
  else if (v.heavySwing) { act = 'heavy'; const k = n('heavy'), s0 = Math.min(2, k - 1); f = s0 + Math.floor(P.atkAnim * (k - s0)); }
  else if (P.blocking) { act = 'block'; f = held('block'); }
  else if (P.casting) { act = 'cast'; f = Math.floor(time * fps('cast')) % n('cast'); }
  else if (P.atkAnim >= 0) { const c = P.combo > 0 ? P.combo : v.swings; act = c % 2 === 0 ? 'attack2' : 'attack1'; f = Math.floor(P.atkAnim * n(act)); }
  else if (P.hurtT > 0.12) { act = 'hurt'; f = held('hurt'); }
  else if (P.sitting) { act = 'sit'; f = 0; }
  else if (P.moving) { act = 'walk'; f = Math.floor(P.walk * 1.26 * n('walk') / 6) % n('walk'); }
  else if (sheetHas(body, 'stance') && time - (v.combatT || -99) < 2) { act = 'stance'; f = Math.floor(time * fps('stance')) % n('stance'); }
  else { act = 'idle'; f = Math.floor(time * fps('idle')) % n('idle'); }
  if (!sheetHas(body, act)) { act = 'idle'; f = Math.floor(time * fps('idle')) % n('idle'); }
  if (v.act !== act) { v.act = act; v.actT = time; }
  const a = A[act]; f = a.loop ? ((f % a.frames) + a.frames) % a.frames : Math.max(0, Math.min(a.frames - 1, f));
  return { act, f, tint };
}

/* ---------- Visual ---------- */
const HAIRTINT = {};
function hairTint(hex) { hex = hex || '#b9b3a8'; if (HAIRTINT[hex]) return HAIRTINT[hex]; const c = new THREE.Color(hex); return (HAIRTINT[hex] = [c.r / HAIR_GREY, c.g / HAIR_GREY, c.b / HAIR_GREY]); }
function sheetPlane(json) {
  const fw = json.frameW / PXU, fh = json.frameH / PXU, ax = json.anchor[0] / PXU, ay = json.anchor[1] / PXU;
  // anchor (feet) at the origin: mirroring with scale.x = -1 flips around the feet
  return new THREE.PlaneGeometry(fw, fh).translate(fw / 2 - ax, ay - fh / 2, 0);
}
function makeSheetVis(ids) {
  const v = { sheet: true, key: ids.join('|'), layers: [], meshes: [], swings: 0, lastAtk: -1, act: null, actT: 0, sector: undefined };
  // body/hair/weapon share one transform; creation order = draw order (same depth, LessEqual)
  for (const id of ids) {
    const rec = SHEETS.byId[id], geo = sheetPlane(rec.json);
    const mat = spriteMat(rec.tex); const mesh = new THREE.Mesh(geo, mat); scene.add(mesh);
    const xm = spriteMat(rec.tex, { color: 0x4a70d0, opacity: 0.5, depthWrite: false, depthFunc: THREE.GreaterDepth,
      // stencil: each covered pixel is tinted once even where layers overlap
      stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc, stencilZPass: THREE.ReplaceStencilOp });
    const xray = new THREE.Mesh(geo, xm); xray.renderOrder = 5; scene.add(xray);
    const uv0 = geo.attributes.uv.array.slice();
    v.layers.push({ id, rec, layer: rec.json.layer || 'body', geo, uv0, mat, mesh, xray, rk: '' });
    v.meshes.push(mesh, xray);
  }
  v.layers.sort((a, b) => LAYER_ORDER.indexOf(a.layer) - LAYER_ORDER.indexOf(b.layer));
  v.shadow = new THREE.Mesh(FLATPLANE, SHADOWMAT); v.shadow.renderOrder = -1; scene.add(v.shadow); v.meshes.push(v.shadow);
  v.dispose = () => { for (const m of v.meshes) { scene.remove(m); if (m.material !== SHADOWMAT) m.material.dispose(); } for (const L of v.layers) L.geo.dispose(); };
  return v;
}
function setLayerFrame(L, act, d, f) {
  const j = L.rec.json;
  // a layer without this action (e.g. an older sheet without "stance") falls back to idle
  if (!sheetHas(j, act)) { if (!sheetHas(j, 'idle')) { L.mesh.visible = false; return null; } act = 'idle'; f = Math.floor(time * (j.actions.idle.fps || 6)) % j.actions.idle.frames; }
  const r = sheetRect(j, act, d, Math.min(f, j.actions[act].frames - 1)), k = r.x + ',' + r.y;
  L.mesh.visible = true;
  if (L.rk !== k) {
    L.rk = k; const uv = sheetUV(r, L.rec.texW, L.rec.texH), a = L.geo.attributes.uv, s = a.array, o = L.uv0;
    for (let i = 0; i < s.length; i += 2) { s[i] = uv.u0 + o[i] * (uv.u1 - uv.u0); s[i + 1] = uv.v0 + o[i + 1] * (uv.v1 - uv.v0); }
    a.needsUpdate = true;
  }
  return r;
}
// Called from syncEntities. Returns false when the procedural sprite should be used.
function syncSheetPlayer() {
  if (!SHEETS.done) return false;
  const ids = playerSheetIds(); if (!ids) return false;
  const key = ids.join('|');
  let v = VIS.get(P); if (!v || v.key !== key) { if (v) disposeVis(v); v = makeSheetVis(ids); VIS.set(P, v); }
  v.seen = frameNo;
  const body = v.layers[0].rec.json;
  v.sector = facingSector(P.fx === undefined ? 1 : P.fx, P.fy || 0, cam.yaw, v.sector);
  const dir = sectorToDir(body, v.sector), pose = sheetPlayerPose(v, body);
  const gh = groundH(P.x, P.y), z = (P.z || 0) / PXU, sx = dir.flip ? -1 : 1;
  const tn = pose.tint || map.d.look.tint, ht = hairTint(P.hair);
  let rect = null;
  for (const L of v.layers) {
    const r = setLayerFrame(L, pose.act, dir.d, pose.f); if (L.layer === 'body') rect = r;
    L.mesh.scale.set(sx, 1 / COSP, 1); L.mesh.position.set(P.x, gh + z, P.y); L.mesh.rotation.y = cam.yaw;
    if (L.layer === 'hair') L.mat.color.setRGB(tn[0] * ht[0], tn[1] * ht[1], tn[2] * ht[2]); else L.mat.color.setRGB(tn[0], tn[1], tn[2]);
    L.xray.scale.copy(L.mesh.scale); L.xray.position.copy(L.mesh.position); L.xray.rotation.y = cam.yaw; L.xray.visible = L.mesh.visible && !P.dead;
  }
  v.shadow.position.set(P.x, gh + 0.03, P.y); v.shadow.scale.setScalar(0.45 * (1 - Math.min(0.5, z * 0.3))); v.shadow.visible = true;
  v.diag = { act: pose.act, f: pose.f, dir: dir.name, d: dir.d, flip: dir.flip, sector: v.sector, rect, ids };
  return true;
}
preloadSheets();
