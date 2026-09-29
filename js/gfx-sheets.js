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
const SHEET_INDEX_FILES = ['index.json', 'index_creatures.json', 'index_humanoids.json', 'index_npcs.json'];
const SHEETS = {
  byId: {},          // id -> load record (created on first request)
  entries: {},       // id -> { id, layer, body, variant } from the index files
  byKey: {},         // "body|layer|variant" -> id
  indexLeft: SHEET_INDEX_FILES.length, indexReady: false, indexFiles: [],
  loaded: [], failed: [], requests: 0,
};
const HAIR_GREY = 0.72;            // neutral grey the hair sheets are painted in (tinted by the palette ramp: hairRamp() in gfx-render.js)
const LAYER_ORDER = ['body', 'mob', 'npc', 'hair', 'shield', 'weapon'];
const WTYPE_VARIANT = { dagger: 'dagger', sword: 'sword', rod: 'rod', bow: 'bow', mace: 'mace' };  // fist -> none

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
function registerIndex(file, j) {
  SHEETS.indexFiles.push(file);
  for (const s of (j && Array.isArray(j.sheets) ? j.sheets : [])) {
    const e = sheetEntry(s); if (!e || !e.body) continue;
    SHEETS.entries[e.id] = e; SHEETS.byKey[sheetKey(e.body, e.layer, e.variant)] = e.id;
  }
}
function loadIndexes() {
  const fin = () => { if (--SHEETS.indexLeft > 0) return; SHEETS.indexReady = true; prefetchSheets(); };
  for (const f of SHEET_INDEX_FILES) sheetXHR(SHEET_BASE + f, j => { registerIndex(f, j); fin(); }, fin);
}
// Top of the opaque pixels in the idle S frame -> visible height above the feet (px).
function measureSheet(rec) {
  const j = rec.json, fallback = j.visibleH || Math.round(j.anchor[1] * 0.8);
  rec.visH = fallback;
  if (j.visibleH) return;
  try {
    const r = sheetRect(j, sheetHas(j, 'idle') ? 'idle' : Object.keys(j.actions)[0], 0, 0); if (!r) return;
    const c = document.createElement('canvas'); c.width = r.w; c.height = r.h;
    const g = c.getContext('2d'); g.drawImage(rec.tex.image, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
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
  if (P.equip && P.equip.shield) w.push([body, 'shield', 'guard']);
  const wv = typeof S !== 'undefined' && S ? WTYPE_VARIANT[S.wtype] : null; if (wv) w.push([body, 'weapon', wv]);
  return w;
}
function prefetchSheets() {
  if (!SHEETS.indexReady) return;
  try {
    const pw = playerLayerWants(); if (pw && sheetId(pw[0][0], 'body', null)) for (const w of pw) sheetRec(w[0], w[1], w[2]);
    if (typeof map === 'undefined' || !map) return;
    const types = new Set();
    for (const s of map.d.spawns || []) types.add(s[0]);
    if (map.d.boss) types.add(map.d.boss);
    for (const t of [...types]) for (const a of (MOBS[t] && MOBS[t].abil) || []) if (a.mob) types.add(a.mob);
    for (const m of mobs || []) types.add(m.type);
    for (const t of types) sheetRec(t, 'mob', null);
    for (const n of map.npcs || []) sheetRec(n.id, 'npc', null);
  } catch (e) { /* prefetch is best-effort */ }
}

/* ---------- Frame math ---------- */
function sheetHas(json, a) { return !!(json.actions && json.actions[a] && json.actions[a].frames > 0 && !(json._bad && json._bad[a])); }
// Pixel rect of frame f of `action` in sheet direction index d (index into json.dirs).
function sheetRect(json, action, d, f) {
  const a = json.actions[action]; if (!a) return null;
  const fw = json.frameW, fh = json.frameH, n = Math.max(1, a.frames | 0), nd = json.dirs.length;
  f = Math.max(0, Math.min(n - 1, f | 0)); d = Math.max(0, Math.min(nd - 1, d | 0));
  if (json.layout === 'blocks' || json.layout === 'dir-blocks') {
    const bpr = json.layout === 'blocks' ? Math.max(1, json.blocksPerRow | 0 || nd) : nd, mf = json.maxFrames || n;
    const block = a.row * nd + d, bx = block % bpr, by = Math.floor(block / bpr);
    return { x: (bx * mf + f) * fw, y: by * fh, w: fw, h: fh };
  }
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
// Clamp/loop a frame index for an action; missing action -> idle.
function sheetFrame(json, act, f, phase) {
  if (!sheetHas(json, act)) { act = 'idle'; if (!sheetHas(json, 'idle')) return null; f = Math.floor(time * (json.actions.idle.fps || 6) + (phase || 0)); }
  const a = json.actions[act], n = a.frames | 0;
  f = a.loop ? ((f % n) + n) % n : Math.max(0, Math.min(n - 1, f | 0));
  return { act, f };
}

/* ---------- Player pose -> action/frame ---------- */
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
  const pk = time - (P.pickupAt === undefined ? -99 : P.pickupAt);

  if (P.dead) { act = 'dead'; f = held('dead'); }
  else if (P.dodgeT > 0) { act = 'dodge'; f = Math.floor((1 - P.dodgeT / 0.34) * n('dodge')); tint = [0.85, 0.9, 1]; }
  else if (P.charge >= 0) { act = 'heavy'; f = Math.min(1, Math.floor(P.charge / 0.8 * 2)); if (P.charge >= 0.8 && Math.floor(time * 12) % 2) tint = [1.0, 0.85, 0.5]; }
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
  const r = sheetFrame(body, act, f) || { act: 'idle', f: 0 };
  if (v.act !== r.act) { v.act = r.act; v.actT = time; }
  return { act: r.act, f: r.f, tint };
}

/* ---------- Mob pose ---------- */
function activeTele(m) { if (typeof teles === 'undefined') return null; for (const t of teles) if (t.m === m) return t; return null; }
function sheetMobPose(m, v, J) {
  const A = J.actions, n = a => (A[a] ? A[a].frames : 1), fps = a => (A[a] && A[a].fps) || 8, ph = (m.id % 7) * 0.37;
  const held = a => { if (v.act !== a) { v.act = a; v.actT = time; } return Math.floor((time - v.actT) * fps(a)); };
  let act, f, tint, opacity;
  if (m.dead) { act = 'dead'; f = Math.floor((m.deathT || 0) * fps('dead')); }   // death: pixel dissolve (sprFrame), not a fade
  else if (m.frozen > 0) { act = 'hurt'; f = 0; tint = [0.55, 0.8, 1]; }
  else if (m.hitFlash > 0 || m.stun > 0) { act = 'hurt'; f = held('hurt'); }   // hit: white flash + squash (sprFrame)
  else if (m.atkAnim >= 0) { act = 'attack'; f = Math.floor(m.atkAnim * n('attack')); }
  else if (m.leap) { act = 'walk'; f = Math.floor(time * fps('walk') * 1.5); }
  else if (m.d.boss && activeTele(m)) { const t = activeTele(m); act = sheetHas(J, 'skill') ? 'skill' : 'attack'; f = Math.floor(clamp(t.t / t.dur, 0, 0.999) * n(act)); }
  else if (m.moving) { act = 'walk'; f = Math.floor(m.walk * 1.26 * n('walk') / 6); }
  else { act = 'idle'; f = Math.floor(time * fps('idle') + ph); }
  const r = sheetFrame(J, act, f, ph); if (!r) return null;
  if (v.act !== r.act) { v.act = r.act; v.actT = time; }
  return { act: r.act, f: r.f, tint, opacity };
}

/* ---------- Visual ---------- */
function sheetPlane(json) {
  const fw = json.frameW / PXU, fh = json.frameH / PXU, ax = json.anchor[0] / PXU, ay = json.anchor[1] / PXU;
  // anchor (feet) at the origin: mirroring with scale.x = -1 flips around the feet
  return new THREE.PlaneGeometry(fw, fh).translate(fw / 2 - ax, ay - fh / 2, 0);
}
// recs: ready load records (draw order sorted by layer). o.xray: player x-ray silhouette. o.glow: glow colour.
// o.noCast: no sun shadow (ghosts). Each layer gets a sun-facing shadow caster sharing its geometry (and so its frame UVs).
function makeSheetVis(recs, o = {}) {
  const v = { sheet: true, key: recs.map(r => r.id).join('|'), layers: [], meshes: [], swings: 0, lastAtk: -1, act: null, actT: 0, sector: undefined };
  recs = recs.slice().sort((a, b) => LAYER_ORDER.indexOf(a.json.layer || (a.entry && a.entry.layer) || 'body') - LAYER_ORDER.indexOf(b.json.layer || (b.entry && b.entry.layer) || 'body'));
  // layers share one transform; creation order = draw order (same depth, LessEqual)
  for (const rec of recs) {
    const geo = sheetPlane(rec.json), layer = (rec.entry && rec.entry.layer) || rec.json.layer || 'body';
    const mat = fxSpriteMat(rec.tex, layer === 'hair'); const mesh = new THREE.Mesh(geo, mat); scene.add(mesh);
    const L = { id: rec.id, rec, layer, geo, uv0: geo.attributes.uv.array.slice(), mat, mesh, xray: null, rk: '', caster: null };
    if (!o.noCast) { L.caster = makeCaster(geo, rec.tex); v.meshes.push(L.caster); }
    if (o.xray) {
      const xm = spriteMat(rec.tex, { color: 0x4a70d0, opacity: 0.5, depthWrite: false, depthFunc: THREE.GreaterDepth,
        // stencil: each covered pixel is tinted once even where layers overlap
        stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc, stencilZPass: THREE.ReplaceStencilOp });
      L.xray = new THREE.Mesh(geo, xm); L.xray.renderOrder = 5; scene.add(L.xray); v.meshes.push(L.xray);
    }
    v.layers.push(L); v.meshes.push(mesh);
  }
  v.shadow = new THREE.Mesh(FLATPLANE, SHADOWMAT); v.shadow.renderOrder = -1; scene.add(v.shadow); v.meshes.push(v.shadow);
  if (o.glow) { v.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, color: new THREE.Color(o.glow), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 })); scene.add(v.glow); v.meshes.push(v.glow); }
  v.dispose = () => { for (const m of v.meshes) disposeMesh(m); for (const L of v.layers) L.geo.dispose(); };
  return v;
}
function setLayerFrame(L, act, d, f) {
  const j = L.rec.json, r0 = sheetFrame(j, act, f);
  if (!r0) { L.mesh.visible = false; return null; }
  const r = sheetRect(j, r0.act, d, r0.f), k = r.x + ',' + r.y;
  L.mesh.visible = true;
  if (L.rk !== k) {
    L.rk = k; const uv = sheetUV(r, L.rec.texW, L.rec.texH), a = L.geo.attributes.uv, s = a.array, o = L.uv0;
    for (let i = 0; i < s.length; i += 2) { s[i] = uv.u0 + o[i] * (uv.u1 - uv.u0); s[i + 1] = uv.v0 + o[i + 1] * (uv.v1 - uv.v0); }
    a.needsUpdate = true;
    const u = L.mat.userData.u; if (u) u.uFrameV.value.set(uv.v0, uv.v1);
  }
  return r;
}
// Place all layers of a sheet vis at entity e with look st (see sprFrame). Returns the first layer's rect.
function placeSheetVis(v, e, act, d, f, flip, st, hairHex) {
  const gh = groundH(e.x, e.y), z = (e.z || 0) / PXU + st.zoff, sx = flip ? -1 : 1;
  let rect = null;
  for (const L of v.layers) {
    const r = setLayerFrame(L, act, d, f); if (!rect) rect = r;
    L.mesh.scale.set(sx * st.sx, st.sy / COSP, 1); L.mesh.position.set(e.x, gh + z, e.y); L.mesh.rotation.y = cam.yaw;
    if (L.layer === 'hair') applyHairRamp(L.mat, hairHex);
    sprApply(L.mat, st, flip);
    if (L.caster) { L.caster.visible = L.mesh.visible && st.cast && st.a > 0.3; if (L.caster.visible) { L.caster.scale.set(sx, CAST_H, 1); L.caster.position.set(e.x, gh + z, e.y); L.caster.rotation.y = SPRF.cyaw; } }
    if (L.xray) { L.xray.scale.copy(L.mesh.scale); L.xray.position.copy(L.mesh.position); L.xray.rotation.y = cam.yaw; L.xray.visible = L.mesh.visible && !P.dead; }
  }
  return { rect, gh, z };
}
function setVis(e, recs, o) {
  const key = recs.map(r => r.id).join('|');
  let v = VIS.get(e); if (!v || v.key !== key) { if (v) disposeVis(v); v = makeSheetVis(recs, o); VIS.set(e, v); }
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
// Called from syncEntities. Returns false when the procedural sprite should be used.
function syncSheetPlayer() {
  const recs = playerSheetRecs(); if (!recs) { P.sheetH = 0; return false; }
  const v = setVis(P, recs, { xray: true }); v.pRecs = recs;
  const body = v.layers[0].rec.json;
  v.sector = facingSector(P.fx === undefined ? 1 : P.fx, P.fy || 0, cam.yaw, v.sector);
  const dir = sectorToDir(body, v.sector), pose = sheetPlayerPose(v, body);
  const st = sprFrame(v, P, { tint: pose.tint });
  const pl = placeSheetVis(v, P, pose.act, dir.d, pose.f, dir.flip, st, P.hair);
  placeBlob(v, P.x, pl.gh, P.y, 0.45, pl.z, true);
  P.sheetH = v.layers[0].rec.visH;
  sprMotion(v, P, st, P.sheetH / PXU);
  v.diag = { act: pose.act, f: pose.f, dir: dir.name, d: dir.d, flip: dir.flip, sector: v.sector, rect: pl.rect, ids: v.layers.map(L => L.id), layers: v.layers.map(L => L.layer) };
  return true;
}

/* ---------- Mobs ---------- */
function syncSheetMob(m) {
  if (!SHEETS.indexReady) return false;
  const rec = sheetRec(m.type, 'mob', null); if (!recReady(rec)) { m.sheetH = 0; return false; }
  const d = m.d, ghost = isGhost(m), v = setVis(m, [rec], { glow: d.glow, noCast: ghost }), J = rec.json;
  const pose = sheetMobPose(m, v, J); if (!pose) { m.sheetH = 0; disposeVis(v); VIS.delete(m); return false; }
  v.sector = facingSector(m.fx === undefined ? (m.dir || 1) : m.fx, m.fy || 0, cam.yaw, v.sector);
  const dir = sectorToDir(J, v.sector), st = sprFrame(v, m, { tint: pose.tint, opacity: pose.opacity, ghost });
  const pl = placeSheetVis(v, m, pose.act, dir.d, pose.f, dir.flip, st);
  const human = d.spr === 'human', s = human ? ((d.look && d.look.scale) || 1) : (d.size || 1);
  const shR = (human ? 0.45 : 0.5) * Math.max(1, s * (human ? 0.8 : 0.85)) * (ghost ? 0.8 : 1);
  placeBlob(v, m.x, pl.gh, m.y, shR, pl.z, st.a > 0.3 && st.dis < 0.6);
  m.sheetH = rec.visH;
  const hu = rec.visH / PXU;
  if (v.glow) { v.glow.position.set(m.x, pl.gh + pl.z + hu / COSP * 0.5, m.y); const gs = hu * (ghost ? 1.6 : 2.2); v.glow.scale.set(gs, gs, 1); v.glow.material.opacity = ghost ? 0.14 : 0.55; v.glow.visible = !m.dead; }
  sprMotion(v, m, st, hu);
  v.diag = { act: pose.act, f: pose.f, dir: dir.name, flip: dir.flip, rect: pl.rect, id: rec.id };
  return true;
}

/* ---------- NPCs ---------- */
function npcTalking(n) { return typeof talkNPC !== 'undefined' && talkNPC === n && typeof $ === 'function' && $('dialog') && !$('dialog').hidden; }
function syncSheetNPC(n) {
  if (!SHEETS.indexReady) return false;
  const rec = sheetRec(n.id, 'npc', null); if (!recReady(rec)) { n.sheetH = 0; return false; }
  const v = setVis(n, [rec], {}), J = rec.json, talk = npcTalking(n);
  let fx = n.fx === undefined ? n.dir : n.fx, fy = n.fy === undefined ? 0.4 : n.fy;
  if (talk && P) { const dx = P.x - n.x, dy = P.y - n.y, dd = Math.hypot(dx, dy); if (dd > 0.05) { fx = dx / dd; fy = dy / dd; } }
  v.sector = facingSector(fx, fy, cam.yaw, v.sector);
  const want = talk && sheetHas(J, 'talk') ? 'talk' : 'idle', A = J.actions[want] || {};
  const r = sheetFrame(J, want, Math.floor(time * (A.fps || 6) + n.x)); if (!r) { n.sheetH = 0; disposeVis(v); VIS.delete(n); return false; }
  const dir = sectorToDir(J, v.sector);
  const st = sprFrame(v, n, {});
  const pl = placeSheetVis(v, n, r.act, dir.d, r.f, dir.flip, st);
  placeBlob(v, n.x, pl.gh, n.y, 0.45 * Math.max(1, ((n.look && n.look.scale) || 1) * 0.8), pl.z, true);
  n.sheetH = rec.visH;
  v.diag = { act: r.act, f: r.f, dir: dir.name, id: rec.id };
  return true;
}

/* ---------- headH: use the sheet's visible height while a sheet is shown ---------- */
if (typeof headH === 'function') {
  const baseHeadH = headH;
  // eslint-disable-next-line no-global-assign
  headH = function (e) { return e && e.sheetH > 0 ? e.sheetH / PXU / COSP : baseHeadH(e); };
}
loadIndexes();
