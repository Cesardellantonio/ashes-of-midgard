'use strict';
/* =========================================================
   Pre-rendered sprite sheets (contract v2, art/CONTRACT.md).
   Sheets live in assets/sprites/<id>.png + <id>.json and are
   listed in the index files below (any of them may be missing).
   Sheets are resolved by (body, layer, variant) from the index
   and loaded lazily on first need; until a sheet is ready the
   procedural sprite is drawn, then the sheet swaps in.

   Users:
   - player: <cls>_<g> body -> hair -> shield -> weapon layers
   - mobs:   mob_<type> (layer "mob", body = MOBS key)
   - NPCs:   npc_<id>   (layer "npc", body = npc id)

   JSON layouts:
   - "blocks": block = r*dirs.length + d; bx = block % blocksPerRow;
     by = floor(block / blocksPerRow); x = (bx*maxFrames + f)*frameW;
     y = by*frameH.
   - "dir-blocks": same with blocksPerRow = dirs.length.
   - legacy (no layout): direction d of action row r at row (r + d),
     x = f*frameW.
   Sheets hold 5 facings (S, SE, E, NE, N); SW, W, NW are the
   horizontal mirrors of SE, E, NE.
   ========================================================= */
const SHEET_BASE = (typeof window !== 'undefined' && window.AOM_SPRITE_BASE) || 'assets/sprites/';
// Missing index files are harmless. The same sheet id may appear in several files (index.json also lists the
// index_classes2b.json sheets): the first file in this list that names an id wins, whatever order the XHRs finish in.
const SHEET_INDEX_FILES = ['index.json', 'index_creatures.json', 'index_humanoids.json', 'index_npcs.json', 'index_classes2b.json', 'index_world2a.json', 'index_world2b.json', 'index_npcs2.json'];
const SHEETS = {
  byId: {},          // id -> load record (created on first request)
  entries: {},       // id -> { id, layer, body, variant } from the index files
  byKey: {},         // "body|layer|variant" -> id
  indexLeft: SHEET_INDEX_FILES.length, indexReady: false, indexFiles: [],
  loaded: [], failed: [], requests: 0,
};
const HAIR_GREY = 0.72;            // neutral grey the hair sheets are painted in (tinted by the palette ramp: hairRamp() in gfx-render.js)
const LAYER_ORDER = ['body', 'mob', 'npc', 'hair', 'shield', 'weapon'];
const WTYPE_VARIANT = { dagger: 'dagger', sword: 'sword', rod: 'rod', bow: 'bow', mace: 'mace',
  spear: 'spear', twohand: 'twohand', staff: 'staff', book: 'book', lute: 'lute', whip: 'whip', knuckle: 'knuckle' };  // fist -> none

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
// Fill in body/variant for index entries that predate contract v2 (the Novice sheets).
function sheetEntry(s) {
  if (!s || typeof s.id !== 'string') return null;
  const id = s.id; let layer = s.layer, body = s.body, variant = s.variant;
  if (!layer) {
    if (/^mob_/.test(id)) layer = 'mob'; else if (/^npc_/.test(id)) layer = 'npc';
    else { const m = /(?:^|\.)(body|hair|weapon|shield)(?:_|$)/.exec(id); layer = m ? m[1] : 'body'; }
  }
  if (!body) {
    if (layer === 'mob') body = id.replace(/^mob_/, ''); else if (layer === 'npc') body = id.replace(/^npc_/, '');
    else if (id.indexOf('.') > 0) body = id.slice(0, id.indexOf('.'));
  }
  if (variant === undefined || variant === '') {
    variant = null;
    if (layer === 'hair') { const m = /hair_([a-z]+)/.exec(id); if (m) variant = m[1]; }
    else if (layer === 'weapon') { const m = /weapon_([a-z]+)/.exec(id); if (m) variant = m[1] === 'knife' ? 'dagger' : m[1]; }
    else if (layer === 'shield') { const m = /shield_([a-z]+)/.exec(id); variant = m ? m[1] : 'guard'; }
  }
  return { id, layer, body, variant: variant || null };
}
const sheetKey = (body, layer, variant) => body + '|' + layer + '|' + (variant || '');
// First registration of an id (and of a body|layer|variant key) wins: duplicates are ignored, never loaded twice.
function registerIndex(file, j) {
  SHEETS.indexFiles.push(file);
  for (const s of (j && Array.isArray(j.sheets) ? j.sheets : [])) {
    const e = sheetEntry(s); if (!e || !e.body || SHEETS.entries[e.id]) continue;
    SHEETS.entries[e.id] = e; const k = sheetKey(e.body, e.layer, e.variant); if (!SHEETS.byKey[k]) SHEETS.byKey[k] = e.id;
  }
}
function loadIndexes() {
  const got = new Array(SHEET_INDEX_FILES.length).fill(null);
  // register in list order once every file has answered (or failed), so the winner of a duplicate id is deterministic
  const fin = () => { if (--SHEETS.indexLeft > 0) return; SHEET_INDEX_FILES.forEach((f, i) => { if (got[i]) registerIndex(f, got[i]); }); SHEETS.indexReady = true; prefetchSheets(); };
  SHEET_INDEX_FILES.forEach((f, i) => sheetXHR(SHEET_BASE + f, j => { got[i] = j; fin(); }, fin));
}
// Top of the opaque pixels in the idle S frame -> visible height above the feet (px).
let MEASURE_CV = null;
function measureSheet(rec) {
  const j = rec.json, fallback = j.visibleH || Math.round(j.anchor[1] * 0.8);
  rec.visH = fallback;
  if (j.visibleH) return;
  try {
    const r = sheetRect(j, sheetHas(j, 'idle') ? 'idle' : Object.keys(j.actions)[0], 0, 0); if (!r) return;
    // willReadFrequently keeps this canvas in CPU memory: only the frame is copied and read back (no GPU upload of
    // the whole sheet + GPU readback, which made this 29% of boot CPU). The art pipeline should ship visibleH.
    const c = MEASURE_CV || (MEASURE_CV = document.createElement('canvas')); c.width = r.w; c.height = r.h;
    const g = c.getContext('2d', { willReadFrequently: true }); g.clearRect(0, 0, r.w, r.h); g.drawImage(rec.tex.image, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    const px = g.getImageData(0, 0, r.w, r.h).data;
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) if (px[(y * r.w + x) * 4 + 3] > 127) { rec.visH = Math.max(8, j.anchor[1] - y); return; }
  } catch (e) { /* tainted canvas etc.: keep the fallback */ }
}
// Drop actions whose frames fall outside the PNG (bad sheet): they fall back to idle.
function validateSheet(rec) {
  const j = rec.json; j._bad = {};
  if (!j.actions || !j.dirs || !j.dirs.length || !j.frameW || !j.frameH || !j.anchor) { rec.err = rec.id + ': JSON missing frameW/frameH/anchor/dirs/actions'; return false; }
  for (const a in j.actions) {
    const A = j.actions[a], r = sheetRect(j, a, j.dirs.length - 1, (A.frames | 0) - 1);
    if (!r || r.x + r.w > rec.texW || r.y + r.h > rec.texH) j._bad[a] = true;
  }
  const bad = Object.keys(j._bad); if (bad.length && typeof console !== 'undefined') console.warn('[sheets] ' + rec.id + ': actions outside the PNG, ignored: ' + bad.join(', '));
  return true;
}
function loadSheet(id) {
  const rec = { id, entry: SHEETS.entries[id] || null, json: null, tex: null, texW: 0, texH: 0, ok: false, done: false, err: null, visH: 0 };
  SHEETS.byId[id] = rec; SHEETS.requests++;
  let left = 2;
  const fin = err => {
    if (err && !rec.err) rec.err = String(err && err.message || err);
    if (--left) return;
    rec.ok = !rec.err && !!rec.json && !!rec.tex && validateSheet(rec);
    if (rec.ok) { measureSheet(rec); SHEETS.loaded.push(id); } else { SHEETS.failed.push(id); if (rec.tex) { rec.tex.dispose(); rec.tex = null; } }
    rec.done = true;
  };
  sheetXHR(SHEET_BASE + id + '.json', j => { rec.json = j; fin(); }, fin);
  try {
    new THREE.TextureLoader().load(SHEET_BASE + id + '.png', t => {
      t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; if (typeof sprTexEnc === 'function') sprTexEnc(t);
      rec.tex = t; rec.texW = t.image.width; rec.texH = t.image.height; fin();
    }, undefined, () => fin(new Error(id + '.png failed to load')));
  } catch (e) { fin(e); }
  return rec;
}
function sheetId(body, layer, variant) { return SHEETS.byKey[sheetKey(body, layer, variant)] || null; }
// Load record for (body, layer, variant): starts the load on first call.
// Returns null when the index has no such sheet.
function sheetRec(body, layer, variant) {
  const id = sheetId(body, layer, variant); if (!id) return null;
  return SHEETS.byId[id] || loadSheet(id);
}
const recReady = r => !!(r && r.ok);
const recPending = r => !!(r && !r.done);

/* ---------- Prefetch (current map + player gear) ---------- */
function playerLayerWants() {
  if (!P) return null;
  const body = `${P.cls}_${P.gender === 'f' ? 'f' : 'm'}`;
  const w = [[body, 'body', null], [body, 'hair', P.hairStyle === 'long' ? 'long' : 'spiky']];
  if (P.equip && P.equip.shield) w.push([body, 'shield', (typeof shieldVariant === 'function' && shieldVariant(body)) || 'guard']);   // shieldVariant: action.js (Oathkeeper -> 'tower')
  const wv = typeof S !== 'undefined' && S ? WTYPE_VARIANT[S.wtype] : null; if (wv) w.push([body, 'weapon', wv]);
  return w;
}
function prefetchSheets() {
  if (!SHEETS.indexReady) return;
  try {
    const pw = playerLayerWants(); if (pw && sheetId(pw[0][0], 'body', null)) for (const w of pw) sheetRec(w[0], w[1], w[2]);
    if (typeof map === 'undefined' || !map) return;
    // Generic over map data (no map list): every MOBS key the map definition names — spawns ([type, n] rows in any
    // array field), boss / bosses, plain type strings — plus live mobs, closed over summons (abil.mob, transitively).
    const types = new Set(), isMob = t => typeof t === 'string' && typeof MOBS !== 'undefined' && !!MOBS[t];
    for (const k in map.d) {
      const v = map.d[k];
      if (isMob(v)) types.add(v);
      else if (Array.isArray(v)) for (const r of v) { if (isMob(r)) types.add(r); else if (Array.isArray(r) && isMob(r[0])) types.add(r[0]); else if (r && isMob(r.type)) types.add(r.type); }
    }
    for (const m of mobs || []) types.add(m.type);
    for (const t of types) for (const a of (MOBS[t] && MOBS[t].abil) || []) if (a.mob) types.add(a.mob);   // Set iteration visits added summons too
    for (const t of types) sheetRec(t, 'mob', null);
    for (const n of map.npcs || []) sheetRec(n.id, 'npc', null);
  } catch (e) { /* prefetch is best-effort */ }
}

/* ---------- Frame math ---------- */
function sheetHas(json, a) { return !!(json.actions && json.actions[a] && json.actions[a].frames > 0 && !(json._bad && json._bad[a])); }
// Pixel rect of frame f of `action` in sheet direction index d (index into json.dirs). out: optional rect to fill.
function sheetRect(json, action, d, f, out) {
  const a = json.actions[action]; if (!a) return null;
  const fw = json.frameW, fh = json.frameH, n = Math.max(1, a.frames | 0), nd = json.dirs.length;
  f = Math.max(0, Math.min(n - 1, f | 0)); d = Math.max(0, Math.min(nd - 1, d | 0));
  const r = out || { x: 0, y: 0, w: 0, h: 0 }; r.w = fw; r.h = fh;
  if (json.layout === 'blocks' || json.layout === 'dir-blocks') {
    const bpr = json.layout === 'blocks' ? Math.max(1, json.blocksPerRow | 0 || nd) : nd, mf = json.maxFrames || n;
    const block = a.row * nd + d, bx = block % bpr, by = Math.floor(block / bpr);
    r.x = (bx * mf + f) * fw; r.y = by * fh; return r;
  }
  r.x = f * fw; r.y = (a.row + d) * fh; return r;
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
// Returns a shared scratch object (read it before the next call).
const SHEET_MIRROR = ['', 'SW', 'W', 'NW'], _DIR = { d: 0, flip: false, name: 'S' };
function sectorToDir(json, s) {
  const name = SHEET_DIR8[Math.abs(s)], d = json.dirs.indexOf(name);
  _DIR.d = d < 0 ? 0 : d; _DIR.flip = s < 0 && s > -4; _DIR.name = s < 0 && s > -4 ? SHEET_MIRROR[-s] : name; return _DIR;
}
// Clamp/loop a frame index for an action; missing action -> idle. Returns a shared scratch object (read it at once).
const _SF = { act: 'idle', f: 0 };
function sheetFrame(json, act, f, phase) {
  if (!sheetHas(json, act)) { act = 'idle'; if (!sheetHas(json, 'idle')) return null; f = Math.floor(time * (json.actions.idle.fps || 6) + (phase || 0)); }
  const a = json.actions[act], n = a.frames | 0;
  _SF.f = a.loop ? ((f % n) + n) % n : Math.max(0, Math.min(n - 1, f | 0)); _SF.act = act;
  return _SF;
}
// Pose helpers (no per-call closures): frame count / fps of an action, frames since an action started.
const actN = (A, a) => (A[a] ? A[a].frames : 1), actFps = (A, a) => (A[a] && A[a].fps) || 8;
function actHeld(v, A, a) { if (v.act !== a) { v.act = a; v.actT = time; } return Math.floor((time - v.actT) * actFps(A, a)); }
const TINT_DODGE = [0.85, 0.9, 1], TINT_CHARGE = [1.0, 0.85, 0.5], TINT_FROZEN = [0.55, 0.8, 1];

/* ---------- Player pose -> action/frame ---------- */
function sheetPlayerPose(v, body) {
  const A = body.actions, n = a => actN(A, a), fps = a => actFps(A, a), held = a => actHeld(v, A, a);
  let act = 'idle', f = 0, tint;
  // heavy swing: remember the charge so the release plays the heavy strike, not a light one
  if (P.charge >= 0) v.heavyArm = true;
  else if (!(P.atkAnim >= 0) && v.heavyArm && !v.heavySwing) v.heavyArm = false;
  if (P.atkAnim >= 0 && v.heavyArm) { v.heavySwing = true; v.heavyArm = false; }
  if (!(P.atkAnim >= 0)) v.heavySwing = false;
  if (P.atkAnim >= 0 && v.lastAtk < 0 && !v.heavySwing) v.swings++;
  v.lastAtk = P.atkAnim >= 0 ? P.atkAnim : -1;
  if (P.atkAnim >= 0 || P.charge >= 0 || P.blocking) v.combatT = time;
  const pk = time - (P.pickupAt === undefined ? -99 : P.pickupAt);

  if (P.dead) { act = 'dead'; f = held('dead'); }
  else if (P.dodgeT > 0) { act = 'dodge'; f = Math.floor((1 - P.dodgeT / 0.34) * n('dodge')); tint = TINT_DODGE; }
  else if (P.charge >= 0) { act = 'heavy'; f = Math.min(1, Math.floor(P.charge / 0.8 * 2)); if (P.charge >= 0.8 && Math.floor(time * 12) % 2) tint = TINT_CHARGE; }
  else if (v.heavySwing) { act = 'heavy'; const k = n('heavy'), s0 = Math.min(2, k - 1); f = s0 + Math.floor(P.atkAnim * (k - s0)); }
  else if (P.blocking) { act = 'block'; f = held('block'); }
  else if (P.casting) { act = 'cast'; f = Math.floor(time * fps('cast')) % n('cast'); }
  else if (P.atkAnim >= 0) { const c = P.combo > 0 ? P.combo : v.swings; act = c % 2 === 0 ? 'attack2' : 'attack1'; f = Math.floor(P.atkAnim * n(act)); }
  else if (P.hurtT > 0.12) { act = 'hurt'; f = held('hurt'); }
  else if (pk >= 0 && pk < 0.3 && sheetHas(body, 'pickup')) { act = 'pickup'; f = Math.floor(pk / 0.3 * n('pickup')); }
  else if (P.sitting) { act = 'sit'; f = 0; }
  else if (P.moving) { act = 'walk'; f = Math.floor(P.walk * 1.26 * n('walk') / 6) % n('walk'); }
  else if (sheetHas(body, 'stance') && time - (v.combatT || -99) < 2) { act = 'stance'; f = Math.floor(time * fps('stance')) % n('stance'); }
  else { act = 'idle'; f = Math.floor(time * fps('idle')) % n('idle'); }
  const r = sheetFrame(body, act, f), ra = r ? r.act : 'idle', rf = r ? r.f : 0;
  if (v.act !== ra) { v.act = ra; v.actT = time; }
  const o = v.pose || (v.pose = { act: 'idle', f: 0, tint: undefined, opacity: undefined }); o.act = ra; o.f = rf; o.tint = tint; return o;
}

/* ---------- Mob pose ---------- */
function activeTele(m) { if (typeof teles === 'undefined') return null; for (const t of teles) if (t.m === m) return t; return null; }
// Returns v.pose (reused per entity).
function sheetMobPose(m, v, J) {
  const A = J.actions, ph = (m.id % 7) * 0.37;
  let act, f, tint, opacity, t;
  if (m.dead) { act = 'dead'; f = Math.floor((m.deathT || 0) * actFps(A, 'dead')); }   // death: pixel dissolve (sprFrame), not a fade
  else if (m.frozen > 0) { act = 'hurt'; f = 0; tint = TINT_FROZEN; }
  else if (m.hitFlash > 0 || m.stun > 0) { act = 'hurt'; f = actHeld(v, A, 'hurt'); }   // hit: white flash + squash (sprFrame)
  else if (m.atkAnim >= 0) { act = 'attack'; f = Math.floor(m.atkAnim * actN(A, 'attack')); }
  else if (m.leap) { act = 'walk'; f = Math.floor(time * actFps(A, 'walk') * 1.5); }
  else if (m.d.boss && (t = activeTele(m))) { act = sheetHas(J, 'skill') ? 'skill' : 'attack'; f = Math.floor(clamp(t.t / t.dur, 0, 0.999) * actN(A, act)); }
  else if (m.moving) { act = 'walk'; f = Math.floor(m.walk * 1.26 * actN(A, 'walk') / 6); }
  else { act = 'idle'; f = Math.floor(time * actFps(A, 'idle') + ph); }
  const r = sheetFrame(J, act, f, ph); if (!r) return null;
  if (v.act !== r.act) { v.act = r.act; v.actT = time; }
  const o = v.pose || (v.pose = { act: 'idle', f: 0, tint: undefined, opacity: undefined }); o.act = r.act; o.f = r.f; o.tint = tint; o.opacity = opacity; return o;
}

/* ---------- Visual ---------- */
function sheetPlane(json) {
  const fw = json.frameW / PXU, fh = json.frameH / PXU, ax = json.anchor[0] / PXU, ay = json.anchor[1] / PXU;
  // anchor (feet) at the origin: mirroring with scale.x = -1 flips around the feet
  return new THREE.PlaneGeometry(fw, fh).translate(fw / 2 - ax, ay - fh / 2, 0);
}
const layerOf = r => (r.entry && r.entry.layer) || r.json.layer || 'body';
// recs: ready load records (draw order sorted by layer). o.xray: player x-ray silhouette. o.glow: glow colour.
// o.noCast: no sun shadow (ghosts).
// o.batch (single-layer mob/NPC sheets): the layer is one instance of the sheet's shared InstancedMesh
//   (sprBatch in gfx-render.js: one draw + one shadow draw per sheet, whatever the number of entities);
//   frame UVs, tint, flash, rim, dissolve and the sun-facing caster are per-instance data. No meshes of its own.
// Otherwise each layer gets its own mesh + a sun-facing shadow caster sharing its geometry (and so its frame UVs).
// Contact blobs are instances of one shared mesh for every entity (placeBlob).
function makeSheetVis(recs, o = {}) {
  const v = { sheet: true, recs: recs.slice(), batched: !!o.batch, layers: [], meshes: [], swings: 0, lastAtk: -1, act: null, actT: 0, sector: undefined };
  const sorted = recs.slice().sort((a, b) => LAYER_ORDER.indexOf(a.json.layer || (a.entry && a.entry.layer) || 'body') - LAYER_ORDER.indexOf(b.json.layer || (b.entry && b.entry.layer) || 'body'));
  // layers share one transform; creation order = draw order (same depth, LessEqual)
  for (const rec of sorted) {
    const layer = layerOf(rec), base = { id: rec.id, rec, layer, rk: -1, ry: -1, r: { x: 0, y: 0, w: 0, h: 0 }, uv: [0, 0, 1, 1], on: false, geo: null, mat: null, mesh: null, xray: null, caster: null };
    if (o.batch) { v.layers.push(base); continue; }
    const geo = sheetPlane(rec.json);
    const mat = fxSpriteMat(rec.tex, layer === 'hair'); const mesh = new THREE.Mesh(geo, mat); scene.add(mesh);
    const L = Object.assign(base, { geo, uv0: geo.attributes.uv.array.slice(), mat, mesh });
    if (!o.noCast) { L.caster = makeCaster(geo, rec.tex); v.meshes.push(L.caster); }
    if (o.xray) {
      const xm = spriteMat(rec.tex, { color: 0x4a70d0, opacity: 0.5, depthWrite: false, depthFunc: THREE.GreaterDepth,
        // stencil: each covered pixel is tinted once even where layers overlap
        stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc, stencilZPass: THREE.ReplaceStencilOp });
      L.xray = new THREE.Mesh(geo, xm); L.xray.renderOrder = 5; scene.add(L.xray); v.meshes.push(L.xray);
    }
    v.layers.push(L); v.meshes.push(mesh);
  }
  if (o.glow) { v.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, color: new THREE.Color(o.glow), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 })); scene.add(v.glow); v.meshes.push(v.glow); }
  v.dispose = () => { for (const m of v.meshes) disposeMesh(m); for (const L of v.layers) if (L.geo) L.geo.dispose(); };
  return v;
}
// Select frame f of `act` (direction d) on a layer. The UV rect is recomputed only when the frame changes.
function setLayerFrame(L, act, d, f) {
  const j = L.rec.json, r0 = sheetFrame(j, act, f);
  if (!r0) { L.on = false; if (L.mesh) L.mesh.visible = false; return null; }
  const r = sheetRect(j, r0.act, d, r0.f, L.r);
  L.on = true; if (L.mesh) L.mesh.visible = true;
  if (L.rk !== r.x || L.ry !== r.y) {
    L.rk = r.x; L.ry = r.y;
    const tw = L.rec.texW, th = L.rec.texH, u0 = r.x / tw, u1 = (r.x + r.w) / tw, v0 = 1 - (r.y + r.h) / th, v1 = 1 - r.y / th;
    L.uv[0] = u0; L.uv[1] = v0; L.uv[2] = u1; L.uv[3] = v1;
    if (L.geo) {
      const a = L.geo.attributes.uv, s = a.array, o = L.uv0;
      for (let i = 0; i < s.length; i += 2) { s[i] = u0 + o[i] * (u1 - u0); s[i + 1] = v0 + o[i + 1] * (v1 - v0); }
      a.needsUpdate = true;
      const u = L.mat.userData.u; if (u) u.uFrameV.value.set(v0, v1);
    }
  }
  return r;
}
// Place all layers of a sheet vis at entity e with look st (see sprFrame).
// Returns a shared scratch { rect (first layer's rect), gh, z }: read it before the next call.
const _PL = { rect: null, gh: 0, z: 0 };
function placeSheetVis(v, e, act, d, f, flip, st, hairHex) {
  const gh = groundH(e.x, e.y), z = (e.z || 0) / PXU + st.zoff, sx = flip ? -1 : 1;
  let rect = null;
  for (const L of v.layers) {
    const r = setLayerFrame(L, act, d, f); if (!rect) rect = r;
    if (v.batched) { if (r) sprInstance(L, e.x, gh + z, e.y, sx, st, flip); continue; }
    L.mesh.scale.set(sx * st.sx, st.sy / COSP, 1); L.mesh.position.set(e.x, gh + z, e.y); L.mesh.rotation.y = cam.yaw;
    if (L.layer === 'hair') applyHairRamp(L.mat, hairHex);
    sprApply(L.mat, st, flip);
    if (L.caster) { L.caster.visible = L.mesh.visible && st.cast && st.a > 0.3; if (L.caster.visible) { L.caster.scale.set(sx, CAST_H, 1); L.caster.position.set(e.x, gh + z, e.y); L.caster.rotation.y = SPRF.cyaw; } }
    if (L.xray) { L.xray.scale.copy(L.mesh.scale); L.xray.position.copy(L.mesh.position); L.xray.rotation.y = cam.yaw; L.xray.visible = L.mesh.visible && !P.dead; }
  }
  _PL.rect = rect; _PL.gh = gh; _PL.z = z; return _PL;
}
function sameRecs(a, b) { if (!a || a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }
function setVis(e, recs, o) {
  let v = VIS.get(e); if (!v || !v.sheet || !sameRecs(v.recs, recs)) { if (v) disposeVis(v); v = makeSheetVis(recs, o); VIS.set(e, v); }
  v.seen = frameNo; return v;
}
// Single-sheet variant for mobs/NPCs: no per-frame array or options allocation.
const _REC1 = [null];
// Bosses keep their own meshes: one entity gains nothing from batching, and they stay in the per-object
// transparent sort (big hazes / heat volumes around boss arenas composite exactly as before).
function setVis1(e, rec, glow, noCast) {
  let v = VIS.get(e);
  if (!v || !v.sheet || v.recs.length !== 1 || v.recs[0] !== rec) {
    if (v) disposeVis(v); _REC1[0] = rec;
    v = makeSheetVis(_REC1, { glow, noCast, batch: !noCast && !(e.d && e.d.boss) && sprBatchOn() }); VIS.set(e, v);
  }
  v.seen = frameNo; return v;
}

/* ---------- Player ---------- */
// Ready layer records for the player, or null (procedural). While a wanted layer is still
// loading, keep the current sheet vis (or the procedural sprite) so nothing pops in half-dressed.
function playerSheetRecs() {
  const W = playerLayerWants(); if (!W || !SHEETS.indexReady) return null;
  const recs = W.map(w => sheetRec(w[0], w[1], w[2]));
  const keep = () => { const v = VIS.get(P); return v && v.sheet && v.pRecs ? v.pRecs : null; };
  if (!recReady(recs[0])) return recPending(recs[0]) ? keep() : null;
  if (recs.some(recPending)) return keep();
  return recs.filter(recReady);
}
function usingSheetPlayer() { return !!(P && playerSheetRecs()); }
const PLAYER_VIS_OPT = { xray: true };
// Called from syncEntities. Returns false when the procedural sprite should be used.
function syncSheetPlayer() {
  const recs = playerSheetRecs(); if (!recs) { P.sheetH = 0; return false; }
  const v = setVis(P, recs, PLAYER_VIS_OPT); v.pRecs = recs;
  const body = v.layers[0].rec.json;
  v.sector = facingSector(P.fx === undefined ? 1 : P.fx, P.fy || 0, cam.yaw, v.sector);
  const dir = sectorToDir(body, v.sector), dd = dir.d, dflip = dir.flip, dname = dir.name, pose = sheetPlayerPose(v, body);
  const st = sprFrame(v, P, { tint: pose.tint });
  const pl = placeSheetVis(v, P, pose.act, dd, pose.f, dflip, st, P.hair);
  placeBlob(v, P.x, pl.gh, P.y, 0.45, pl.z, true);
  P.sheetH = v.layers[0].rec.visH;
  const dg = v.diag || (v.diag = { ids: v.layers.map(L => L.id), layers: v.layers.map(L => L.layer) });
  dg.act = pose.act; dg.f = pose.f; dg.dir = dname; dg.d = dd; dg.flip = dflip; dg.sector = v.sector; dg.rect = pl.rect;
  sprMotion(v, P, st, P.sheetH / PXU);
  return true;
}

/* ---------- Mobs ---------- */
const _MOBO = { tint: undefined, opacity: undefined, ghost: false };
function syncSheetMob(m) {
  if (!SHEETS.indexReady) return false;
  const rec = sheetRec(m.type, 'mob', null); if (!recReady(rec)) { m.sheetH = 0; return false; }
  const d = m.d, ghost = isGhost(m), v = setVis1(m, rec, d.glow, ghost), J = rec.json;
  const pose = sheetMobPose(m, v, J); if (!pose) { m.sheetH = 0; disposeVis(v); VIS.delete(m); return false; }
  v.sector = facingSector(m.fx === undefined ? (m.dir || 1) : m.fx, m.fy || 0, cam.yaw, v.sector);
  const dir = sectorToDir(J, v.sector), dd = dir.d, dflip = dir.flip, dname = dir.name;
  _MOBO.tint = pose.tint; _MOBO.opacity = pose.opacity; _MOBO.ghost = ghost;
  const st = sprFrame(v, m, _MOBO);
  const pl = placeSheetVis(v, m, pose.act, dd, pose.f, dflip, st), gh = pl.gh, pz = pl.z, rect = pl.rect;
  const human = d.spr === 'human', s = human ? ((d.look && d.look.scale) || 1) : (d.size || 1);
  const shR = (human ? 0.45 : 0.5) * Math.max(1, s * (human ? 0.8 : 0.85)) * (ghost ? 0.8 : 1);
  placeBlob(v, m.x, gh, m.y, shR, pz, st.a > 0.3 && st.dis < 0.6);
  m.sheetH = rec.visH;
  const hu = rec.visH / PXU;
  if (v.glow) { v.glow.position.set(m.x, gh + pz + hu / COSP * 0.5, m.y); const gs = hu * (ghost ? 1.6 : 2.2); v.glow.scale.set(gs, gs, 1); v.glow.material.opacity = ghost ? 0.14 : 0.55; v.glow.visible = !m.dead; }
  sprMotion(v, m, st, hu);
  const dg = v.diag || (v.diag = { id: rec.id }); dg.act = pose.act; dg.f = pose.f; dg.dir = dname; dg.flip = dflip; dg.rect = rect;
  return true;
}

/* ---------- NPCs ---------- */
const _NPCO = {};
function npcTalking(n) { return typeof talkNPC !== 'undefined' && talkNPC === n && typeof $ === 'function' && $('dialog') && !$('dialog').hidden; }
function syncSheetNPC(n) {
  if (!SHEETS.indexReady) return false;
  const rec = sheetRec(n.id, 'npc', null); if (!recReady(rec)) { n.sheetH = 0; return false; }
  const v = setVis1(n, rec, undefined, false), J = rec.json, talk = npcTalking(n);
  let fx = n.fx === undefined ? n.dir : n.fx, fy = n.fy === undefined ? 0.4 : n.fy;
  if (talk && P) { const dx = P.x - n.x, dy = P.y - n.y, dd = Math.hypot(dx, dy); if (dd > 0.05) { fx = dx / dd; fy = dy / dd; } }
  v.sector = facingSector(fx, fy, cam.yaw, v.sector);
  const want = talk && sheetHas(J, 'talk') ? 'talk' : 'idle', A = J.actions[want] || {};
  const r = sheetFrame(J, want, Math.floor(time * (A.fps || 6) + n.x)); if (!r) { n.sheetH = 0; disposeVis(v); VIS.delete(n); return false; }
  const ract = r.act, rf = r.f;
  const dir = sectorToDir(J, v.sector), dd = dir.d, dflip = dir.flip, dname = dir.name;
  const st = sprFrame(v, n, _NPCO);
  const pl = placeSheetVis(v, n, ract, dd, rf, dflip, st);
  placeBlob(v, n.x, pl.gh, n.y, 0.45 * Math.max(1, ((n.look && n.look.scale) || 1) * 0.8), pl.z, true);
  n.sheetH = rec.visH;
  const dg = v.diag || (v.diag = { id: rec.id }); dg.act = ract; dg.f = rf; dg.dir = dname;
  return true;
}

/* ---------- headH: use the sheet's visible height while a sheet is shown ---------- */
if (typeof headH === 'function') {
  const baseHeadH = headH;
  // eslint-disable-next-line no-global-assign
  headH = function (e) { return e && e.sheetH > 0 ? e.sheetH / PXU / COSP : baseHeadH(e); };
}
loadIndexes();
