'use strict';
/* =========================================================
   Utilities
   ========================================================= */
const TW = 64, TH = 32, HW = 32, HH = 16;
const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const pick = a => a[Math.floor(Math.random() * a.length)];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const sq = x => x * x;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = n => Math.floor(n).toLocaleString('en-US');
const $ = id => document.getElementById(id);
function iso(x, y) { return [(x - y) * HW, (x + y) * HH]; }
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hash2(x, y, s) { let h = (x * 374761393 + y * 668265263 + (s | 0) * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function vnoise(x, y, s) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
function hex2rgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function shade(h, f) { const [r, g, b] = hex2rgb(h); const k = f < 0 ? 0 : 255, p = Math.abs(f); return `rgb(${Math.round(r + (k - r) * p)},${Math.round(g + (k - g) * p)},${Math.round(b + (k - b) * p)})`; }
function rgba(h, a) { const [r, g, b] = hex2rgb(h); return `rgba(${r},${g},${b},${a})`; }
function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }

/* Data (elements, classes, skills, monsters, items, maps, NPCs, quests) lives in js/data/*.js,
   loaded before this file. See docs/CONTENT.md. */

/* =========================================================
   State
   ========================================================= */
const cv = $('cv'), ctx = cv.getContext('2d');
const lc = document.createElement('canvas'), lctx = lc.getContext('2d');
let W = 0, H = 0, DPR = 1;
let map = null, mobs = [], drops = [], projs = [], teles = [], parts = [], fxs = [], floats = [], timers = [], screenParts = [];
let zones = []; // player ground effects and traps (zoneAdd / trapAdd); cleared on map change
let P = null, S = null, started = false, paused = false;
let zoom = 1, camX = 0, camY = 0, time = 0;
const mouse = { x: 0, y: 0, down: false, hold: false, holdT: 0, alt: false };
let hover = null, lastSave = 0, bossShown = null, bossLag = 1;
const mapCache = {};
let uidc = 1;

/* =========================================================
   Map generation
   ========================================================= */
function genMap(id) {
  if (mapCache[id]) return mapCache[id];
  const d = MAPDEFS[id], w = d.w, h = d.h, rng = mulberry32(d.seed);
  const m = { id, d, w, h, t: new Uint8Array(w * h), deco: new Uint8Array(w * h), var: new Uint8Array(w * h), warps: [], npcs: [], objs: [], lights: [], braziers: [], entry: null, bossPos: null, gcol: [] };
  const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < w && y < h) m.t[y * w + x] = v; };
  const clearC = (cx, cy, r) => { for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r + 0.5 && x > 0 && y > 0 && x < w - 1 && y < h - 1) m.t[y * w + x] = 0; };
  const clearR = (x0, y0, x1, y1) => { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) if (x > 0 && y > 0 && x < w - 1 && y < h - 1) m.t[y * w + x] = 0; };
  const carve = (x0, y0, x1, y1, r) => { let x = x0, y = y0, g = 0; while ((x !== x1 || y !== y1) && g++ < 6000) { clearC(x, y, r); if (r >= 2 && d.gen === 'field') m.deco[y * w + x] = 6; if (rng() < 0.72) { if (Math.abs(x1 - x) > Math.abs(y1 - y)) x += Math.sign(x1 - x); else y += Math.sign(y1 - y); } else { if (rng() < 0.5) x += rng() < 0.5 ? 1 : -1; else y += rng() < 0.5 ? 1 : -1; x = clamp(x, 2, w - 3); y = clamp(y, 2, h - 3); } } clearC(x1, y1, r); };
  for (let i = 0; i < w * h; i++) m.var[i] = (rng() * 256) | 0;

  // 1. Base terrain for the generator type (see js/data/maps.js)
  if (d.gen === 'town') {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x === 0 || y === 0 || x === w - 1 || y === h - 1) set(x, y, T.WALL);
  } else if (d.gen === 'field') {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (x < 2 || y < 2 || x >= w - 2 || y >= h - 2) { set(x, y, rng() < 0.7 ? T.TREE : T.ROCK); continue; }
      const n = vnoise(x / 7, y / 7, d.seed);
      const r = rng() * (0.6 + n * 0.8);
      if (r < d.trees) set(x, y, T.TREE); else if (r < d.trees + d.rocks) set(x, y, T.ROCK);
      else if (d.ruins && rng() < d.ruins) set(x, y, T.RUIN);
      if (m.t[y * w + x] === 0 && rng() < 0.13) m.deco[y * w + x] = 1 + ((rng() * 4) | 0);
    }
  } else if (d.gen === 'dungeon') m.t.fill(T.WALL);
  else if (d.gen === 'arena') m.t.fill(T.LAVA);
  // 2. The map's own layout: entry, waystone, warps, rooms, props
  if (d.layout) d.layout(m, { set, clearC, clearR, carve, rng, T, w, h, d });
  if (d.gen === 'field' && m.way) set(Math.floor(m.way.x), Math.floor(m.way.y), T.WAY);
  // 3. NPCs and bounty boards declared in data
  for (const k in NPCS) { const n = NPCS[k]; if (n.map === id) m.npcs.push({ id: k, name: n.name, title: n.title, x: n.x, y: n.y, dir: n.dir || 1, look: n.look }); }
  if (m.way) m.objs.push({ kind: 'way', x: m.way.x, y: m.way.y, name: 'Waystone' });
  for (const k in BOARDS) { const b = BOARDS[k]; if (b.map === id) m.objs.push({ kind: 'board', board: k, name: b.name, title: b.title, x: b.x, y: b.y }); }
  for (const wp of m.warps) set(wp.x, wp.y, 0);

  // Connectivity: seal pockets the player can never reach.
  const seen = new Uint8Array(w * h), q = [m.entry.y * w + m.entry.x]; seen[q[0]] = 1;
  while (q.length) { const c = q.pop(), cx = c % w, cy = (c / w) | 0; for (let k = 0; k < 4; k++) { const nx = cx + DX[k], ny = cy + DY[k]; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const ni = ny * w + nx; if (!seen[ni] && m.t[ni] === 0) { seen[ni] = 1; q.push(ni); } } }
  const filler = d.gen === 'dungeon' ? T.WALL : d.gen === 'arena' ? T.LAVA : T.TREE;
  for (let i = 0; i < w * h; i++) if (m.t[i] === 0 && !seen[i]) m.t[i] = filler;
  m.reach = seen;
  // Only walls that touch open ground get drawn; the rest stay black.
  m.vis = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (m.t[y * w + x] !== T.WALL) continue; for (let k = 0; k < 8; k++) { const nx = x + DX[k], ny = y + DY[k]; if (nx >= 0 && ny >= 0 && nx < w && ny < h && m.t[ny * w + nx] !== T.WALL) { m.vis[y * w + x] = 1; break; } } }

  // Terrain heights at tile corners (gentle hills in the wild, a raised platform over lava in the arena)
  const W1 = w + 1; m.hgt = new Float32Array(W1 * (h + 1));
  const lavaAt = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? true : m.t[y * w + x] === T.LAVA;
  for (let vz = 0; vz <= h; vz++) for (let vx = 0; vx <= w; vx++) {
    let hv = 0;
    if (d.gen === 'field') hv = (vnoise(vx / 9, vz / 9, d.seed + 11) - 0.5) * 1.8 + (vnoise(vx / 3.5, vz / 3.5, d.seed + 12) - 0.5) * 0.35;
    else if (d.gen === 'town') hv = (vnoise(vx / 6, vz / 6, d.seed) - 0.5) * 0.18;
    else if (d.gen === 'arena') { const c = lavaAt(vx - 1, vz - 1) + lavaAt(vx, vz - 1) + lavaAt(vx - 1, vz) + lavaAt(vx, vz); hv = c === 4 ? -1.0 : c > 0 ? -0.15 : 0.15; }
    m.hgt[vz * W1 + vx] = hv;
  }
  // Minimap bitmap
  const mc = document.createElement('canvas'); mc.width = w; mc.height = h; const g = mc.getContext('2d'); const img = g.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const t = m.t[i]; const L = d.look, base = L.g2; let c = t === 0 ? [base[0] + 40, base[1] + 40, base[2] + 40].map(v => Math.min(255, v)) : t === T.LAVA ? [210, 80, 30] : t === T.WAY ? [255, 150, 60] : t === T.TREE ? [40, 80, 40] : [60, 58, 64];
    if (t === 0 && (m.deco[i] === 5 || m.deco[i] === 6)) c = [214, 200, 170];
    img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0); m.mini = mc;
  mapCache[id] = m;
  return m;
}
function tileAt(x, y) { x = Math.floor(x); y = Math.floor(y); if (!map || x < 0 || y < 0 || x >= map.w || y >= map.h) return T.WALL; return map.t[y * map.w + x]; }
const blocked = (x, y) => tileAt(x, y) !== 0;
function nearestOpen(x, y, maxR = 6) {
  x = Math.floor(x); y = Math.floor(y);
  for (let r = 0; r <= maxR; r++) {
    let best = null, bd = 1e9;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const nx = x + dx, ny = y + dy;
      if (!blocked(nx, ny) && map.reach[ny * map.w + nx]) { const dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = { x: nx, y: ny }; } }
    }
    if (best) return best;
  }
  return null;
}
function findPath(sx, sy, tx, ty, maxN = 5000) {
  const w = map.w, h = map.h;
  sx = Math.floor(sx); sy = Math.floor(sy); tx = Math.floor(tx); ty = Math.floor(ty);
  if (tx < 0 || ty < 0 || tx >= w || ty >= h || map.t[ty * w + tx]) return null;
  if (sx === tx && sy === ty) return [];
  const N = w * h, g = new Float32Array(N).fill(1e9), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N), heap = [];
  const push = (f, i) => { heap.push([f, i]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; const tmp = heap[p]; heap[p] = heap[c]; heap[c] = tmp; c = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let s = i; if (l < heap.length && heap[l][0] < heap[s][0]) s = l; if (r < heap.length && heap[r][0] < heap[s][0]) s = r; if (s === i) break; const tmp = heap[s]; heap[s] = heap[i]; heap[i] = tmp; i = s; } } return top; };
  const Hh = (x, y) => { const dx = Math.abs(x - tx), dy = Math.abs(y - ty); return dx + dy - 0.586 * Math.min(dx, dy); };
  const s = sy * w + sx; g[s] = 0; push(Hh(sx, sy), s);
  let n = 0; const goal = ty * w + tx;
  while (heap.length && n++ < maxN) {
    const cur = pop()[1]; if (closed[cur]) continue; closed[cur] = 1;
    if (cur === goal) { const out = []; let c = cur; while (c !== s && c >= 0) { out.push({ x: c % w + 0.5, y: Math.floor(c / w) + 0.5 }); c = from[c]; } return out.reverse(); }
    const cx = cur % w, cy = (cur / w) | 0;
    for (let k = 0; k < 8; k++) {
      const dx = DX[k], dy = DY[k], nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx; if (map.t[ni] || closed[ni]) continue;
      if (dx && dy && (map.t[cy * w + nx] || map.t[ny * w + cx])) continue;
      const ng = g[cur] + (dx && dy ? 1.414 : 1);
      if (ng < g[ni]) { g[ni] = ng; from[ni] = cur; push(ng + Hh(nx, ny), ni); }
    }
  }
  return null;
}
function smooth(e, path) {
  // Skip waypoints while the straight line stays clear, so walking is not a zigzag.
  if (!path || path.length < 3) return path;
  const out = []; let ax = e.x, ay = e.y, i = 0;
  while (i < path.length) {
    let j = path.length - 1;
    for (; j > i; j--) if (clearLine(ax, ay, path[j].x, path[j].y)) break;
    out.push(path[j]); ax = path[j].x; ay = path[j].y; i = j + 1;
  }
  return out;
}
function clearLine(x0, y0, x1, y1) {
  const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d * 4);
  for (let i = 1; i < n; i++) { const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t; if (blocked(x, y) || blocked(x + 0.28, y) || blocked(x - 0.28, y) || blocked(x, y + 0.28) || blocked(x, y - 0.28)) return false; }
  return true;
}

/* =========================================================
   Player and stats
   ========================================================= */
function newPlayer(name, hair, gender, hairStyle) {
  return {
    name, hair, gender: gender === 'f' ? 'f' : 'm', hairStyle: hairStyle === 'long' ? 'long' : 'spiky', cls: 'novice', lvl: 1, exp: 0, jlvl: 1, jexp: 0, statPts: 25, skillPts: 0,
    st: { str: 1, agi: 1, vit: 1, int: 1, dex: 1, luk: 1 }, skills: { basic: 0, first_aid: 1 },
    hp: 1, sp: 1, zeny: 150, inv: [], equip: { weapon: null, shield: null, head: null, body: null, boots: null, acc: null },
    hot: [{ k: 'skill', id: 'first_aid' }, null, null, null, null, null, { k: 'item', id: 'fly_wing' }, { k: 'item', id: 'butterfly_wing' }, { k: 'item', id: 'red_potion' }],
    map: 'emberhold', x: 18.5, y: 22.5, lastWay: { map: 'emberhold', x: 18.5, y: 20.5 }, kindled: { emberhold: true },
    flags: { shards: {}, bosses: {}, lore: { ash: true }, tips: {}, talked: {} }, lostZeny: null, uid: 1, playTime: 0, quests: questNewState(),
  };
}
function resetRuntime() {
  Object.assign(P, { stamina: 100, stamT: 0, iframes: 0, dodgeT: 0, blocking: false, blockStart: 0, combo: 0, comboT: 0, swingT: 0, queued: null, charge: -1, fx: 1, fy: 0.35, path: null, target: null, goal: null, atkCD: 0, castT: 0, castMax: 0, casting: null, pending: null, cd: {}, buffs: {}, spheres: 0, reviveCD: 0, dash: null, procCD: 0, dir: 1, walk: 0, moving: false, atkAnim: -1, dead: false, sitting: false, hurtT: 0, hpT: 0, spT: 0, potCD: 0, deadT: 0, kind: 'player' });
}
function refineAtk(t) { return t.lvl < 10 ? 2 : t.lvl < 20 ? 3 : 5; }
function calcStats() {
  const b = { str: 0, agi: 0, vit: 0, int: 0, dex: 0, luk: 0, atk: 0, matk: 0, def: 0, mdef: 0, hit: 0, flee: 0, crit: 0, aspd: 0, leech: 0, maxhp: 0, maxsp: 0, maxhpPct: 0, dmgRed: 0, move: 0 };
  const add = o => { if (o) for (const k in o) b[k] = (b[k] || 0) + o[k]; };
  let watk = 0, wmatk = 0, wtype = 'fist', def = 0, mdef = 0;
  for (const s of SLOTS) {
    const it = P.equip[s]; if (!it) continue; const t = ITEMS[it.id];
    add(t.bonus); for (const a of it.affixes || []) b[a.s] = (b[a.s] || 0) + a.v; for (const c of it.cards || []) add(ITEMS[c].bonus);
    if (s === 'weapon') { wtype = t.wtype; watk = t.atk + (it.refine || 0) * refineAtk(t); wmatk = (t.matk || 0) + (MAGICWEAPON.includes(t.wtype) ? (it.refine || 0) * 3 : 0); }
    else { def += (t.def || 0) + (it.refine || 0); mdef += t.mdef || 0; }
  }
  let welem = 'neutral', endowAmp = 0, castCut = 0, cdCut = 0;
  for (const k in P.buffs) {
    const bf = P.buffs[k]; if (bf.wtype && bf.wtype !== wtype) continue; // e.g. Two-Hand Quicken needs a two-hand sword
    add(bf.bonus); if (bf.endow) { welem = bf.endow; endowAmp = bf.amp || 0; } castCut += bf.castCut || 0; cdCut += bf.cdCut || 0;
  }
  const sk = P.skills;
  b.dex += sk.owls_eye || 0; b.hit += sk.vultures_eye || 0;
  if (wtype === 'dagger' || wtype === 'sword' || wtype === 'twohand') b.atk += (sk.sword_mastery || 0) * 4;
  if (wtype === 'spear') b.atk += (sk.spear_mastery || 0) * 4;
  if (wtype === 'knuckle' || wtype === 'fist') b.atk += (sk.iron_fists || 0) * 3;
  if (wtype === 'lute' || wtype === 'whip') { b.atk += (sk.music_lessons || 0) * 3; b.aspd += sk.music_lessons || 0; }
  b.maxhpPct += (sk.faith || 0) * 2; b.mdef += sk.faith || 0;
  const st = P.st;
  const str = st.str + b.str, agi = st.agi + b.agi, vit = st.vit + b.vit, int = st.int + b.int, dex = st.dex + b.dex, luk = st.luk + b.luk;
  const lv = P.lvl, C = CLASSES[P.cls];
  const atkStatus = DEXWEAPON.includes(wtype) ? dex + sq(Math.floor(dex / 10)) + Math.floor(str / 5) + Math.floor(luk / 5) : str + sq(Math.floor(str / 10)) + Math.floor(dex / 5) + Math.floor(luk / 5);
  const maxhp = Math.floor((35 + lv * C.hp[0] + lv * lv * C.hp[1]) * (1 + vit / 100) * (1 + b.maxhpPct / 100)) + b.maxhp;
  const maxsp = Math.floor((10 + lv * C.sp) * (1 + int / 100)) + b.maxsp;
  S = {
    str, agi, vit, int, dex, luk, b, wtype, welem, endowAmp, castCut: Math.min(60, castCut), cdCut: Math.min(40, cdCut), atkStatus, watk, atkBonus: b.atk,
    matkMin: Math.floor((int + sq(Math.floor(int / 7)) + wmatk + b.matk) * (1 + (sk.rune_attunement || 0) * 0.02)), matkMax: Math.floor((int + sq(Math.floor(int / 5)) + wmatk + b.matk) * (1 + (sk.rune_attunement || 0) * 0.02)),
    def: def + b.def, softDef: Math.floor(vit / 2 + Math.max(vit * 0.3, vit * vit / 150 - 1)), mdef: mdef + b.mdef + Math.floor(int / 5),
    hit: lv + dex + b.hit, flee: lv + agi + b.flee, crit: 1 + luk * 0.3 + b.crit,
    aspd: Math.min(4, (WSPEED[wtype] || 1) * (1 + agi * 0.012 + dex * 0.003) * (1 + b.aspd / 100)),
    leech: b.leech, dmgRed: b.dmgRed, maxhp, maxsp,
    range: wtype === 'bow' ? 5 + (sk.vultures_eye || 0) * 0.5 : (WRANGE[wtype] || 1.6),
    move: 4.6 * (1 + b.move / 100),
  };
  P.hp = Math.min(P.hp, maxhp); P.sp = Math.min(P.sp, maxsp);
  UI.dirty = true;
}
const statCost = v => Math.floor((v - 1) / 10) + 2;

/* =========================================================
   Items: creation, names, inventory
   ========================================================= */
function makeItem(id, o = {}) {
  const t = ITEMS[id]; const it = { uid: uidc++, id };
  if (t.type === 'equip') { it.rarity = t.unique ? 'unique' : (o.rarity || 'common'); it.affixes = o.affixes || []; it.refine = 0; it.slotsN = o.slotsN !== undefined ? o.slotsN : (t.slots || 0); it.cards = []; if (o.name) it.name = o.name; }
  else it.qty = o.qty || 1;
  return it;
}
function rollEquip(ilvl) {
  const pool = Object.values(ITEMS).filter(t => t.type === 'equip' && !t.unique && t.lvl <= ilvl + 3);
  const weights = pool.map(t => 1 / (1 + Math.abs(ilvl - t.lvl) * 0.25));
  let r = Math.random() * weights.reduce((a, b) => a + b, 0), t = pool[0];
  for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) { t = pool[i]; break; } }
  const rr = Math.random(); const rarity = rr < 0.09 ? 'rare' : rr < 0.4 ? 'magic' : 'common';
  const n = rarity === 'rare' ? randi(2, 3) : rarity === 'magic' ? randi(1, 2) : 0;
  const cands = AFFIXES.filter(a => a.slots.includes(t.slot)); const affixes = [];
  for (let i = 0; i < n && cands.length; i++) { const a = cands.splice(randi(0, cands.length - 1), 1)[0]; const [lo, hi] = a.r(ilvl); affixes.push({ s: a.s, v: randi(lo, Math.max(lo, hi)) }); }
  const sr = Math.random(); let slotsN = t.slots || 0; if (sr < 0.05) slotsN = Math.min(slotsN + 1, 2); else if (sr < 0.25 && slotsN === 0) slotsN = 1;
  let name; if (rarity === 'rare') name = pick(RARE_A) + ' ' + pick(RARE_B[t.slot]);
  return makeItem(t.id, { rarity, affixes, slotsN, name });
}
function itemName(it) {
  const t = ITEMS[it.id]; if (t.type !== 'equip') return t.name;
  let n = it.name || t.name;
  if (it.rarity === 'magic' && it.affixes.length) { const a1 = AFFIXES.find(a => a.s === it.affixes[0].s); const a2 = it.affixes[1] && AFFIXES.find(a => a.s === it.affixes[1].s); n = (a1 ? a1.pre + ' ' : '') + t.name + (a2 ? ' ' + a2.suf : ''); }
  if (it.cards && it.cards.length) n = n + ' ✦';
  if (it.refine) n = `+${it.refine} ${n}`;
  if (it.slotsN) n += ` [${it.slotsN}]`;
  return n;
}
const rarityOf = it => { const t = ITEMS[it.id]; return t.type === 'equip' ? it.rarity : t.type === 'card' ? 'card' : t.type === 'key' ? 'key' : 'common'; };
const stackable = id => ITEMS[id].type !== 'equip';
function countItem(id) { let n = 0; for (const it of P.inv) if (it.id === id) n += it.qty || 1; return n; }
function addItem(it, quiet) {
  if (stackable(it.id)) { const ex = P.inv.find(x => x.id === it.id); if (ex) { ex.qty += it.qty; UI.dirty = true; return true; } }
  if (P.inv.length >= 48) { if (!quiet) log('Your bag is full.', 'warn'); return false; }
  P.inv.push(it); UI.dirty = true; return true;
}
function takeItem(id, n = 1) { const ex = P.inv.find(x => x.id === id); if (!ex) return false; ex.qty -= n; if (ex.qty <= 0) P.inv.splice(P.inv.indexOf(ex), 1); UI.dirty = true; return true; }
function findItem(uid) { for (const it of P.inv) if (it.uid === uid) return it; for (const s of SLOTS) if (P.equip[s] && P.equip[s].uid === uid) return P.equip[s]; return null; }
function canEquip(it) {
  const t = ITEMS[it.id]; if (t.type !== 'equip') return 'That cannot be equipped.';
  if (!jobOk(t, P.cls)) return `A ${CLASSES[P.cls].name} cannot use this.`;
  if (P.lvl < t.lvl) return `Requires base level ${t.lvl}.`;
  if (t.slot === 'shield' && P.equip.weapon && TWOHANDED.includes(ITEMS[P.equip.weapon.id].wtype)) return `A ${WNAME[ITEMS[P.equip.weapon.id].wtype].toLowerCase()} needs both hands.`;
  return null;
}
function equip(it) {
  const why = canEquip(it); if (why) { log(why, 'warn'); return; }
  const t = ITEMS[it.id]; const idx = P.inv.indexOf(it); if (idx >= 0) P.inv.splice(idx, 1);
  const old = P.equip[t.slot]; P.equip[t.slot] = it; if (old) P.inv.push(old);
  if (TWOHANDED.includes(t.wtype) && P.equip.shield) { P.inv.push(P.equip.shield); P.equip.shield = null; log(`You sling your shield to use the ${WNAME[t.wtype].toLowerCase()}.`, 'sys'); }
  Sfx.equip(); calcStats();
}
function unequip(slot) { const it = P.equip[slot]; if (!it) return; if (P.inv.length >= 48) { log('Your bag is full.', 'warn'); return; } P.equip[slot] = null; P.inv.push(it); Sfx.equip(); calcStats(); }
function useItem(it) {
  const t = ITEMS[it.id];
  if (t.type === 'equip') { equip(it); return; }
  if (t.type === 'card') { UI.socketCard = it.uid; openWin('inv'); UI.dirty = true; return; }
  if (t.type !== 'use' || P.dead) return;
  if (P.potCD > 0) return; P.potCD = 0.25;
  if (t.heal) { if (P.hp >= S.maxhp) { log('You are already at full health.', 'sys'); return; } healP(randi(t.heal[0], t.heal[1])); burst(P.x, P.y, 26, '#ff6a6a', 8, 1.2); }
  else if (t.sp) { if (P.sp >= S.maxsp) { log('Your SP is already full.', 'sys'); return; } const a = randi(t.sp[0], t.sp[1]); P.sp = Math.min(S.maxsp, P.sp + a); floatText(P, '+' + a, 'sp'); burst(P.x, P.y, 26, '#6a9aff', 8, 1.2); }
  else if (t.effect === 'full') { P.hp = S.maxhp; P.sp = S.maxsp; pillar(P, '#ffc070'); }
  else if (t.effect === 'fly') { if (map.d.safe) { log('The Waystone’s pull is too strong here.', 'sys'); return; } const s = randomSpot(4); if (!s) return; P.x = s.x; P.y = s.y; stopAll(); snapCam(); Sfx.warp(); burst(P.x, P.y, 20, '#e8e0c8', 16, 2); }
  else if (t.effect === 'return') { takeItem(it.id); Sfx.warp(); gotoMap(P.lastWay.map, P.lastWay.x, P.lastWay.y); return; }
  Sfx.drink(); takeItem(it.id);
}

/* =========================================================
   Entities
   ========================================================= */
function makeMob(type, x, y, o = {}) {
  const d = MOBS[type];
  return { kind: 'mob', type, d, x, y, hx: x, hy: y, hp: d.hp, maxhp: d.hp, state: 'idle', t: rand(0.5, 4), path: null, atkCD: 0, dir: 1, fx: Math.random() < 0.5 ? 1 : -1, fy: 0.3, walk: rand(0, 6), moving: false, anim: rand(0, 10), hitFlash: 0, frozen: 0, summoned: !!o.summoned, abil: {}, dead: false, deathT: 0, repath: 0, atkAnim: -1, id: uidc++ };
}
function randomSpot(minFromEntry = 8) {
  for (let i = 0; i < 400; i++) {
    const x = randi(2, map.w - 3), y = randi(2, map.h - 3);
    if (blocked(x, y) || !map.reach[y * map.w + x]) continue;
    if (Math.hypot(x - map.entry.x, y - map.entry.y) < minFromEntry) continue;
    if (map.way && Math.hypot(x - map.way.x, y - map.way.y) < 7) continue;
    if (map.bossPos && Math.hypot(x - map.bossPos.x, y - map.bossPos.y) < 8) continue;
    return { x: x + 0.5, y: y + 0.5 };
  }
  return null;
}
function spawnMobRandom(type) { const s = randomSpot(); if (s) mobs.push(makeMob(type, s.x, s.y)); }
function spawnAll() {
  mobs = [];
  for (const [type, n] of map.d.spawns) for (let i = 0; i < n; i++) spawnMobRandom(type);
  if (map.d.boss && !P.flags.bosses[map.d.boss] && map.bossPos) mobs.push(makeMob(map.d.boss, map.bossPos.x, map.bossPos.y));
}
const mobsNear = (x, y, r) => mobs.filter(m => !m.dead && Math.hypot(m.x - x, m.y - y) <= r);
const mobElem = m => m.frozen > 0 ? 'water' : m.d.elem;
const isUndeadish = m => m.d.elem === 'undead' || m.d.race === 'undead' || m.d.race === 'demon';
function after(t, fn) { timers.push({ t, fn }); }

/* =========================================================
   Combat
   ========================================================= */
const hitChance = (hit, flee, max) => clamp(80 + hit - flee, 5, max);
const mobFlee = m => Math.floor((m.d.lvl * 1.4 + 5 + (m.d.flee || 0)) * (m.slow > 0 ? 1 - 0.1 * (m.slowLv || 1) : 1));
const mobDef = m => m.d.def * (m.dispel > 0 ? 0.5 : 1), mobMdef = m => m.d.mdef * (m.dispel > 0 ? 0.5 : 1);
const mobHitStat = m => m.d.lvl * 2 + 12;
function aggro(m) {
  if (m.dead) return;
  if (m.state !== 'chase') { m.state = 'chase'; m.repath = 0; }
  if (m.d.boss && !m.announced) announceBoss(m);
}
function physHit(m, mul, o = {}) {
  if (!m || m.dead) return;
  aggro(m);
  const crit = !o.sure && Math.random() * 100 < S.crit;
  if (!crit && !o.sure && !(m.mark > 0) && Math.random() * 100 >= hitChance(S.hit + (o.hit || 0), mobFlee(m), 100)) { floatText(m, 'Miss', 'miss'); Sfx.miss(); return; }
  let atk = S.atkStatus + S.watk * rand(0.8, 1) + S.atkBonus;
  if (isUndeadish(m)) atk += (P.skills.demon_bane || 0) * 3;
  if (m.d.race === 'brute' || m.d.race === 'insect') atk += (P.skills.beast_bane || 0) * 4;
  let dmg = atk * mul * elemMod(o.elem || S.welem, mobElem(m));
  if (crit) dmg *= 1.4; else if (!o.ignoreDef) dmg = dmg * (100 - mobDef(m)) / 100 - Math.floor(m.d.lvl / 2);
  m.lastMagic = false;
  finishHit(m, dmg, crit, o);
}
function magicHit(m, mul, el, o = {}) {
  if (!m || m.dead) return;
  aggro(m);
  let dmg = rand(S.matkMin, S.matkMax) * mul * elemMod(el, mobElem(m));
  if (o.undeadBonus && isUndeadish(m)) dmg *= 1 + o.undeadBonus;
  if (S.endowAmp && el === S.welem) dmg *= 1 + S.endowAmp / 100; // Sage endows boost spells of the same element
  dmg = dmg * (100 - mobMdef(m)) / 100;
  m.lastMagic = true;
  finishHit(m, dmg, false, o);
}
// Flat damage that ignores DEF/MDEF but not elements (traps, the raven, Sanctuary, Oath of Tyr).
function trueHit(m, dmg, el, o = {}) {
  if (!m || m.dead) return;
  aggro(m); m.lastMagic = false;
  finishHit(m, dmg * elemMod(el || 'neutral', mobElem(m)), false, o);
}
function finishHit(m, dmg, crit, o) {
  if (m.mark > 0 && dmg > 0) dmg *= 1 + (m.markAmp || 0) / 100;
  if (m.lex && dmg > 0) { dmg *= 2; m.lex = false; floatText(m, 'Lex!', 'info'); }
  dmg = dmg <= 0 ? 0 : Math.max(1, Math.round(dmg));
  m.hp -= dmg; m.hitFlash = 0.22; fxs.push({ k: 'spark', x: m.x, y: m.y, h: chestH(m), t: 0, dur: 0.2, crit });
  floatText(m, dmg, crit ? 'crit' : 'dmg');
  if (S.leech && dmg > 0) healP(dmg * S.leech / 100, true);
  if (o.knock && !m.d.boss) knock(m, o.from || P, o.knock);
  if (m.frozen > 0 && dmg > 0 && Math.random() < 0.3) m.frozen = 0;
  crit ? Sfx.crit() : Sfx.hit();
  if (m.hp <= 0) killMob(m);
}
function knock(m, from, n) {
  const dx = m.x - from.x, dy = m.y - from.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
  for (let i = 0; i < n * 4; i++) { const nx = m.x + ux * 0.25, ny = m.y + uy * 0.25; if (blocked(nx, ny)) break; m.x = nx; m.y = ny; }
  m.path = null;
}
function mobStrike(m, mul = 1, o = {}) {
  if (P.dead) return;
  if (P.iframes > 0) { floatText(P, 'Dodge', 'miss'); return; }
  let guard = 1;
  if (P.blocking && !P.dodgeT) {
    const dx = m.x - P.x, dy = m.y - P.y, d = Math.hypot(dx, dy) || 1;
    if ((dx * P.fx + dy * P.fy) / d > -0.2) {
      if (time - P.blockStart < 0.2) { floatText(P, 'Parry!', 'crit'); Sfx.crit(); m.stun = m.d.boss ? 0.7 : 1.4; m.atkAnim = -1; fxs.push({ k: 'spark', x: P.x, y: P.y, h: chestH(P), t: 0, dur: 0.3, crit: true }); P.stamina = Math.min(100, P.stamina + 15); return; }
      P.stamina -= 12 * mul; if (P.stamina > 0) { guard = o.magic ? 0.5 : 0.25; floatText(P, 'Block', 'info'); Sfx.equip(); } else { P.stamina = 0; P.blocking = false; floatText(P, 'Guard Break', 'miss'); }
    }
  }
  const ag = P.buffs.autoguard;
  if (ag && P.equip.shield && !o.magic && Math.random() * 100 < ag.guard) { floatText(P, 'Auto Guard', 'info'); Sfx.equip(); fxs.push({ k: 'spark', x: P.x, y: P.y, h: chestH(P), t: 0, dur: 0.25, crit: true }); return; }
  if (!o.sure && Math.random() * 100 >= hitChance(mobHitStat(m), S.flee, 95)) { floatText(P, 'Miss', 'miss'); return; }
  let raw = rand(m.d.atk[0], m.d.atk[1]) * mul;
  if (o.magic) raw *= (100 - Math.min(S.mdef, 80)) / 100; else raw = raw * (100 - Math.min(S.def, 85)) / 100 - S.softDef;
  if (isUndeadish(m)) raw -= (P.skills.divine_protection || 0) * 3;
  raw *= (1 - Math.min(S.dmgRed, 60) / 100) * guard;
  let d = Math.max(1, Math.round(raw));
  const mr = P.buffs.mrod;
  if (mr && o.magic) { const g = Math.round(d * mr.absorb / 100); P.sp = Math.min(S.maxsp, P.sp + g); floatText(P, 'Absorbed +' + g, 'sp'); ring(P.x, P.y, 1.2, '#c8a8ff'); Sfx.cast(); return; }
  d = shieldHit(d, m);
  if (d > 0) hurtP(d);
}
// Kyrie Eleison and Oath of Tyr soak part of a blow before it reaches HP. Returns what is left.
function shieldHit(d, m) {
  const k = P.buffs.kyrie;
  if (k) {
    const a = Math.min(d, k.shield); k.shield -= a; k.hits--; d -= a; floatText(P, d > 0 ? 'Kyrie breaks' : 'Kyrie', 'info');
    if (k.shield <= 0 || k.hits <= 0) { delete P.buffs.kyrie; renderBuffs(); log('Kyrie Eleison shatters.', 'sys'); burst(P.x, P.y, 30, '#fff2b8', 16, 2.5); }
  }
  const oa = P.buffs.oath;
  if (oa && d > 0) {
    const share = Math.round(d * oa.share / 100); d -= share; P.sp = Math.max(0, P.sp - share / 2);
    if (m && !m.dead && share > 0) { trueHit(m, share, 'holy'); fxs.push({ k: 'spark', x: m.x, y: m.y, h: chestH(m), t: 0, dur: 0.25, crit: true }); }
  }
  return d;
}
function hurtP(d) {
  if (P.dead) return;
  P.hp -= d; P.hurtT = 0.3; P.sitting = false; fxs.push({ k: 'spark', x: P.x, y: P.y, h: chestH(P), t: 0, dur: 0.18, hurt: true });
  floatText(P, d, 'hurt'); Sfx.hurt();
  if (P.hp <= 0) { if (tryRevive()) return; P.hp = 0; die(); }
}
// Valkyrie Priest: Resurrection (passive) catches a killing blow once per cooldown.
function tryRevive() {
  const lv = P.skills.resurrection || 0; if (!lv || P.reviveCD > 0) return false;
  P.hp = Math.max(1, Math.round(S.maxhp * [0.1, 0.3, 0.5, 0.8][lv - 1])); P.reviveCD = 240 - 30 * lv; P.iframes = 1.5;
  pillar(P, '#fff2b8', true); burst(P.x, P.y, 40, '#ffffff', 30, 3); banner('Resurrection', 'The Valkyrie will not carry you yet', 'band gold');
  floatText(P, 'Resurrection!', 'lvl'); log('A Valkyrie refuses to carry you. You rise.', 'lvl'); Sfx.level();
  addBuff('rescd', 'Resurrection recharging', 'resurrection', P.reviveCD, {});
  return true;
}
function healP(a, quiet) {
  a = Math.round(a); if (a <= 0) return;
  const before = P.hp; P.hp = Math.min(S.maxhp, P.hp + a);
  if (!quiet || P.hp - before > 0) floatText(P, '+' + (quiet ? Math.round(P.hp - before) : a), 'heal', quiet);
}
function playerAttack(t) {
  P.atkAnim = 0;
  if (S.wtype === 'bow') { shot(P, t, 'arrow', () => { physHit(t, 1); attackProcs(t); }); Sfx.bow(); }
  else { after(0.13, () => { if (!t.dead) { physHit(t, 1); attackProcs(t); } }); Sfx.swing(); }
}
// Passive procs on a normal attack (both control modes): Blitz Beat's raven and Triple Attack.
function attackProcs(t) {
  if (!t || t.dead || P.dead) return;
  const bb = P.skills.blitz_beat || 0;
  if (bb && P.procCD <= 0 && Math.random() * 100 < 1 + S.luk / 3) { P.procCD = 0.6; raven(t, Math.min(bb, Math.max(1, Math.ceil(P.jlvl / 10)))); }
  const ta = P.skills.triple_attack || 0;
  if (ta && S.wtype !== 'bow' && P.procCD <= 0 && Math.random() * 100 < 30 - ta) {
    P.procCD = 0.4; floatText(P, 'Triple Attack!', 'skill');
    for (let i = 0; i < 3; i++) after(0.12 + i * 0.1, () => { if (!t.dead) { physHit(t, (1 + 0.2 * ta) / 3); burst(t.x, t.y, 26, '#ffe0b0', 5, 2); } });
  }
}
// Huginn dives at a target n times (Blitz Beat). Ignores DEF.
function raven(t, n) {
  const dmg = blitzDmg(P.skills.blitz_beat || 1);
  shot({ x: P.x - P.fy * 0.6, y: P.y + P.fx * 0.6 }, t, 'raven', () => {
    for (let i = 0; i < n; i++) after(i * 0.1, () => { if (!t.dead) { trueHit(t, dmg, 'neutral'); burst(t.x, t.y, 34, '#c8d8ff', 6, 2.5); } });
  }, { spd: 15, zu: chestH(P) + 2 });
  floatText(P, 'Huginn!', 'info'); Sfx.bow();
}
function bolts(t, n, el, mul, o) {
  const kind = { fire: 'fire', water: 'ice', ghost: 'soul', holy: 'holy' }[el];
  for (let i = 0; i < n; i++) after(i * 0.13, () => {
    if (t.dead) return;
    if (el === 'wind') { strike(t.x, t.y); magicHit(t, mul, el, o); }
    else if (el === 'fire' || el === 'water') { const sx = t.x + rand(-0.8, 0.8), sy = t.y + rand(-0.8, 0.8); shot({ x: sx, y: sy }, t, kind, () => magicHit(t, mul, el, o), { zu: groundH(sx, sy) + 7, spd: 16 }); }
    else shot(P, t, kind, () => magicHit(t, mul, el, o));
  });
  Sfx.cast();
}
function shot(from, to, kind, onHit, o = {}) { projs.push({ x: from.x, y: from.y, zu: o.zu !== undefined ? o.zu : chestH(from), to, kind, onHit, spd: o.spd || (kind === 'arrow' ? 17 : 12), t: 0, vx: 0, vy: 0, vz: 0 }); }
function killMob(m) {
  m.dead = true; m.deathT = 0; m.hp = 0; m.path = null;
  const d = m.d;
  let b = mobExp(d), j = Math.round(b * 0.75);
  if (P.lvl - d.lvl > 10) { b = Math.ceil(b * 0.25); j = Math.ceil(j * 0.25); }
  if (m.summoned) { b = Math.ceil(b * 0.3); j = Math.ceil(j * 0.3); }
  gainExp(b, j);
  for (const [id, ch] of d.drops || []) if (Math.random() < ch) dropItem(makeItem(id), m);
  if (Math.random() < (d.boss ? 1 : 0.5)) dropZeny(d.lvl * randi(2, 6) + randi(1, 6) + (d.boss ? d.lvl * 60 : 0), m);
  if (Math.random() < (d.boss ? 0.25 : 0.012)) dropItem(makeItem('c_' + m.type), m);
  if (Math.random() < (d.boss ? 1 : 0.07)) dropItem(rollEquip(d.lvl), m);
  for (const qi of questDropsFor(m)) dropItem(makeItem(qi), m);
  burst(m.x, m.y, d.h * 0.5, d.col || (d.look && d.look.body) || '#888', 14, 2.2);
  if (d.boss) bossDefeated(m);
  else if (!m.summoned) { const type = m.type, mid = map.id; after(rand(10, 18), () => { if (map.id === mid) spawnMobRandom(type); }); }
  questEvent('kill', m);
  if (P.target === m) P.target = null;
  Sfx.kill();
}
function gainExp(b, j) {
  if (P.lvl < MAXLV) {
    P.exp += b; let up = false;
    while (P.lvl < MAXLV && P.exp >= expNeed(P.lvl)) { P.exp -= expNeed(P.lvl); P.lvl++; P.statPts += Math.floor(P.lvl / 5) + 3; up = true; }
    if (P.lvl >= MAXLV) P.exp = 0;
    if (up) { calcStats(); P.hp = S.maxhp; P.sp = S.maxsp; pillar(P, '#ffd76a', true); floatText(P, 'Level Up!', 'lvl'); log(`Base level ${P.lvl}. You feel the Ash give way.`, 'lvl'); Sfx.level(); }
  }
  const cap = CLASSES[P.cls].maxJob;
  if (P.jlvl < cap) {
    P.jexp += j; let up = false;
    while (P.jlvl < cap && P.jexp >= jexpNeed(P.jlvl)) { P.jexp -= jexpNeed(P.jlvl); P.jlvl++; P.skillPts++; up = true; }
    if (P.jlvl >= cap) P.jexp = 0;
    if (up) { pillar(P, '#7fe0d4', true); after(0.35, () => floatText(P, 'Job Level Up!', 'job')); log(`Job level ${P.jlvl}. You have a skill point to spend.`, 'lvl'); Sfx.level(); }
  }
  UI.dirty = true;
}
function dropItem(it, at) { drops.push({ kind: 'drop', item: it, x: at.x + rand(-0.7, 0.7), y: at.y + rand(-0.7, 0.7), t: 0, id: uidc++ }); if (rarityOf(it) === 'unique' || rarityOf(it) === 'card') Sfx.rare(); }
function dropZeny(n, at) { drops.push({ kind: 'drop', zeny: n, x: at.x + rand(-0.6, 0.6), y: at.y + rand(-0.6, 0.6), t: 0, id: uidc++ }); }
function pickup(d) {
  if (d.lost) { P.pickupAt = time; P.zeny += d.zeny; log(`You recover your lost ${fmt(d.zeny)} zeny.`, 'loot'); P.lostZeny = null; Sfx.coin(); drops.splice(drops.indexOf(d), 1); burst(d.x, d.y, 10, '#f0c060', 16, 2); UI.dirty = true; return; }
  if (d.zeny) { P.zeny += d.zeny; log(`+${fmt(d.zeny)} zeny`, 'loot'); Sfx.coin(); drops.splice(drops.indexOf(d), 1); UI.dirty = true; return; }
  if (!addItem(d.item)) return;
  P.pickupAt = time; // sprite sheets play the "pickup" action
  const r = rarityOf(d.item);
  log(`You got ${itemName(d.item)}${d.item.qty > 1 ? ' ×' + d.item.qty : ''}.`, r === 'common' ? 'loot' : r);
  Sfx.pickup(); drops.splice(drops.indexOf(d), 1);
  questEvent('pickup', d.item.id);
}
// extra: special buff fields read by the engine, e.g. { endow, guard, share, shield, hits, absorb, regen, song,
// castCut, cdCut, wtype, aura: { r, col, bubble }, every, onTick, count }. Buffs are runtime only (not saved).
function addBuff(id, name, icon, t, bonus, extra) { P.buffs[id] = Object.assign({ name, icon, t, max: t, bonus: bonus || {} }, extra || {}); calcStats(); renderBuffs(); }
function songStart(id, name, icon, t, bonus, extra) {
  for (const k in P.buffs) if (P.buffs[k].song && k !== id) delete P.buffs[k];
  addBuff(id, name, icon, t, bonus, extra); ring(P.x, P.y, 2.2, (extra.aura && extra.aura.col) || '#fff');
  for (let i = 0; i < 6; i++) parts.push({ x: P.x + rand(-0.6, 0.6), y: P.y + rand(-0.6, 0.6), z: rand(30, 60), vx: 0, vy: 0, vz: 30, life: 1, max: 1, col: (extra.aura && extra.aura.col) || '#fff', size: 3, float: true });
  floatText(P, '♪ ' + name, 'skill'); Sfx.heal();
}
// Monk spirit spheres: a runtime count shown as a buff with a counter; each adds 3 ATK.
function setSpheres(n) {
  P.spheres = clamp(n | 0, 0, 5);
  if (P.spheres > 0) P.buffs.spheres = { name: 'Spirit Spheres', icon: 'summon_sphere', t: 1e9, max: 1e9, bonus: { atk: 3 * P.spheres }, count: P.spheres };
  else delete P.buffs.spheres;
  calcStats(); renderBuffs();
}

/* Ground effects. zoneAdd({ x, y, r, dur, every, first, tick(z), end(z), col, rune, ward, follow })
   ticks every `every` seconds (first tick at `first`, default 0). Drawn by drawSkillOverlay (js/ui.js). */
function zoneAdd(o) { const z = Object.assign({ t: 0, every: 0, col: '#ffffff' }, o); z.next = o.first || 0; zones.push(z); return z; }
// Traps: triggered by the first enemy that steps within r. At most 4 at a time (the oldest goes).
function trapAdd(pos, rune, col, onTrigger) {
  let x = pos.x, y = pos.y; if (blocked(x, y) || dist(P, pos) > 4) { x = P.x + (P.fx || 0) * 0.8; y = P.y + (P.fy || 0) * 0.8; if (blocked(x, y)) { x = P.x; y = P.y; } }
  const traps = zones.filter(z => z.trap); if (traps.length >= 4) zones.splice(zones.indexOf(traps[0]), 1);
  zoneAdd({ trap: true, x, y, r: 0.85, dur: 60, col, rune, onTrigger, arm: 0.4 });
  burst(x, y, 4, col, 8, 1.2); Sfx.equip();
}
const wardAt = (x, y) => zones.some(z => z.ward && Math.hypot(z.x - x, z.y - y) <= z.r);
function updateZones(dt) {
  for (let i = zones.length - 1; i >= 0; i--) {
    const z = zones[i]; z.t += dt;
    if (z.follow) { z.x = P.x; z.y = P.y; }
    if (z.trap) {
      if (z.t > z.dur) { zones.splice(i, 1); continue; }
      if (z.t < z.arm) continue;
      const m = mobs.find(e => !e.dead && Math.hypot(e.x - z.x, e.y - z.y) <= z.r + 0.25);
      if (m) { zones.splice(i, 1); floatText(m, 'Trap!', 'info'); z.onTrigger(m, z); }
      continue;
    }
    if (z.every > 0) while (z.t >= z.next && z.next < z.dur) { z.next += z.every; try { z.tick(z); } catch (e) { console.error(e); } }
    if (z.t >= z.dur) { zones.splice(i, 1); if (z.end) z.end(z); }
  }
}
function mobsInCone(x, y, fx, fy, r, cone) {
  return mobs.filter(m => { if (m.dead) return false; const dx = m.x - x, dy = m.y - y, d = Math.hypot(dx, dy), rr = r + (m.d.size || (m.d.look && m.d.look.scale) || 1) * 0.35; if (d > rr) return false; return d < 0.4 || (dx * fx + dy * fy) / d >= cone; });
}
function freezeMob(m, secs) {
  if (m.dead || m.d.boss || m.d.elem === 'undead') { if (!m.dead) floatText(m, 'Resist', 'miss'); return false; }
  m.frozen = secs; m.path = null; floatText(m, 'Frozen', 'info'); return true;
}
function snareMob(m, secs) { if (m.dead) return; m.snare = Math.max(m.snare || 0, secs); m.path = null; floatText(m, 'Snared', 'info'); aggro(m); }
function markMob(m, secs, amp) { if (m.dead) return; m.mark = secs; m.markAmp = amp; floatText(m, 'Marked', 'info'); }
// Dash the player toward (x, y): at most maxD cells, stopping `stop` cells short. Invulnerable while moving.
function dashTo(x, y, maxD, stop, blink, onEnd) {
  const dx = x - P.x, dy = y - P.y, d = Math.hypot(dx, dy); if (d < 0.05) { if (onEnd) onEnd(); return; }
  const len = clamp(d - (stop || 0), 0, maxD), ux = dx / d, uy = dy / d;
  P.fx = ux; P.fy = uy; P.path = null; P.target = P.target && P.target.dead ? null : P.target;
  P.dash = { ux, uy, left: len, spd: blink ? 40 : 22, onEnd }; P.iframes = Math.max(P.iframes || 0, len / (blink ? 40 : 22) + 0.15);
}
function updateDash(dt) {
  const D = P.dash; let step = Math.min(D.left, D.spd * dt), stuck = false;
  while (step > 0.001) { const s = Math.min(step, 0.2), nx = P.x + D.ux * s, ny = P.y + D.uy * s; if (blocked(nx, ny) || blocked(nx + 0.25, ny) || blocked(nx - 0.25, ny) || blocked(nx, ny + 0.25) || blocked(nx, ny - 0.25)) { stuck = true; break; } P.x = nx; P.y = ny; D.left -= s; step -= s; }
  parts.push({ x: P.x + rand(-0.2, 0.2), y: P.y + rand(-0.2, 0.2), z: rand(4, 30), vx: -D.ux, vy: -D.uy, vz: 10, life: 0.35, max: 0.35, col: '#d8e8ff', size: 3 });
  P.moving = true; P.walk += dt * 10;
  if (stuck || D.left <= 0.001) { P.dash = null; P.moving = false; if (D.onEnd) D.onEnd(); }
}
// Job change: keeps every learned skill, resets the job level (new skill points come with it).
function jobChange(cls) {
  const C = CLASSES[cls]; if (!C) return;
  P.cls = cls; P.jlvl = 1; P.jexp = 0;
  for (const s of C.skills) P.skills[s] = P.skills[s] || 0;
  const gifts = [].concat(C.starter || [], C.gifts || []), got = [];
  for (const id of gifts) {
    const it = makeItem(id); if (!addItem(it)) { dropItem(it, P); continue; } got.push(ITEMS[id].name);
    if (canEquip(it) === null) equip(it);
  }
  calcStats(); P.hp = S.maxhp; P.sp = S.maxsp;
  pillar(P, '#f0d070', true); burst(P.x, P.y, 40, '#ffe8a0', 40, 3); banner(C.name, C.tier >= 2 ? 'A second path' : 'A path chosen', 'band gold'); Sfx.victory();
  log(`You are now ${/^[AEIOU]/.test(C.name) ? 'an' : 'a'} ${C.name}.${got.length ? ` Vidar gave you: ${got.join(', ')}.` : ''} New skills are in the Skills window (${typeof winKey === 'function' ? winKey('skills') : 'S'}).`, 'lvl');
  UI.dirty = true; renderHotbar(); saveGame();
}

/* Boss handling */
function announceBoss(m) {
  m.announced = true; bossShown = m; bossLag = m.hp / m.maxhp;
  $('bossbar').hidden = false; $('bossn').textContent = m.d.name; $('bosst').textContent = m.d.title || '';
  banner(m.d.name, m.d.title, 'band'); Sfx.boss();
  if (m.d.intro) log(m.d.intro, 'boss');
}
function bossDefeated(m) {
  const f = P.flags; f.bosses[m.type] = true;
  $('bossbar').hidden = true; bossShown = null;
  for (const s of mobs) if (s.summoned && !s.dead) { s.dead = true; s.deathT = 0; burst(s.x, s.y, 10, '#555', 8, 1.5); }
  const from = t => t.unique && (t.boss === m.type || (t.bosses && t.bosses.includes(m.type)));
  const usable = Object.values(ITEMS).filter(t => from(t) && jobOk(t, P.cls));
  const any = Object.values(ITEMS).filter(t => from(t) && t.boss === m.type);
  const u = (usable.length ? pick(usable) : pick(any)); if (u) dropItem(makeItem(u.id), m);
  dropItem(rollEquip(m.d.lvl + 4), m); dropItem(makeItem('ygg_ember'), m);
  if (m.d.shard) { const sh = makeItem(m.d.shard); addItem(sh, true); f.shards[m.d.shard] = true; log(`You take the ${ITEMS[m.d.shard].name}.`, 'unique'); }
  f.lore[m.type] = true;
  if (m.type === 'ashen_king') { f.kingSlain = true; banner('MVP', 'The Ashen King is dead · The Heart of Yggdrasil stirs', 'mvp'); log('Behind the throne, something that was dead begins, very faintly, to glow.', 'boss'); }
  else banner('MVP', 'Shardbearer felled · ' + ITEMS[m.d.shard].name, 'mvp');
  Sfx.victory(); UI.dirty = true; saveGame();
}
function doAbility(m, a) {
  const say = (txt) => floatText(m, txt, 'shout');
  switch (a.id) {
    case 'slam': say('!'); telegraph(m.x, m.y, a.r, a.delay, () => { if (!m.dead) { ring(m.x, m.y, a.r, '#ff6a3a'); burst(m.x, m.y, 4, '#c8a080', 26, 3.5); Sfx.slam(); } }, m, a); break;
    case 'nova': say('!!'); telegraph(m.x, m.y, a.r, a.delay, () => { if (!m.dead) { ring(m.x, m.y, a.r, m.d.glow || '#ff8a3a'); burst(m.x, m.y, 10, m.d.glow || '#ff8a3a', 40, 5); Sfx.slam(); } }, m, a); break;
    case 'rain': for (let i = 0; i < a.n; i++) { const x = P.x + (i ? rand(-2.6, 2.6) : 0), y = P.y + (i ? rand(-2.6, 2.6) : 0); telegraph(x, y, a.r, a.delay + i * 0.12, () => { burst(x, y, 30, m.d.glow || '#ff7a2a', 14, 3); fxs.push({ k: 'meteor', x, y, t: 0, dur: 0.35, col: m.d.glow || '#ff7a2a' }); Sfx.fire(); }, m, a); } break;
    case 'leap': { const t = nearestOpen(P.x, P.y, 2); if (!t) break; const tx = t.x + 0.5, ty = t.y + 0.5; say('!'); m.leap = { sx: m.x, sy: m.y, tx, ty, t: 0, dur: a.delay }; telegraph(tx, ty, a.r, a.delay, () => { ring(tx, ty, a.r, '#bfe0ff'); burst(tx, ty, 6, '#cfe0ff', 20, 3); Sfx.slam(); }, m, a); break; }
    case 'summon': { const n = mobs.filter(s => s.summoned && !s.dead).length; if (n >= a.max) break; say('Rise!'); for (let i = 0; i < a.n; i++) { const s = nearestOpen(m.x + rand(-3, 3), m.y + rand(-3, 3), 3); if (s) { const c = makeMob(a.mob, s.x + 0.5, s.y + 0.5, { summoned: true }); c.state = 'chase'; mobs.push(c); burst(c.x, c.y, 10, '#6a5a5a', 12, 2); } } break; }
  }
}
function telegraph(x, y, r, dur, boom, m, a) { teles.push({ x, y, r, t: 0, dur, boom, m, a }); }

/* =========================================================
   Effects
   ========================================================= */
function burst(x, y, z, col, n, spd) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, s = rand(0.3, 1) * spd; parts.push({ x, y, z, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: rand(20, 90), life: rand(0.4, 0.9), max: 0.9, col, size: rand(1.5, 3.5) }); } }
function ring(x, y, r, col) { fxs.push({ k: 'ring', x, y, r, col, t: 0, dur: 0.45 }); }
function pillar(e, col, big) { fxs.push({ k: 'pillar', e, col, t: 0, dur: big ? 1.4 : 0.9, big }); }
function strike(x, y) { fxs.push({ k: 'strike', x, y, t: 0, dur: 0.22, seed: Math.random() * 1000 }); burst(x, y, 4, '#fff6a0', 10, 3); Sfx.zap(); }
function floatText(e, txt, kind, small) {
  floats.push({ x: e.x, y: e.y, hw: groundH(e.x, e.y) + headH(e) + 0.15, txt: String(txt), kind, t: 0, side: Math.random() < 0.5 ? -1 : 1, small });
}
function banner(a, b, cls = '') {
  const el = $('banner'); el.innerHTML = `<div class="bnr ${cls}"><div class="a">${esc(a)}</div>${b ? `<div class="b">${esc(b)}</div>` : ''}</div>`;
}
function log(msg, cls = 'sys') {
  const c = $('chat'); const d = document.createElement('div'); d.className = cls; d.textContent = msg; c.appendChild(d);
  while (c.children.length > 40) c.removeChild(c.firstChild);
}

/* =========================================================
   Sound (tiny synth, starts on first click)
   ========================================================= */
const Sfx = {
  ac: null, on: store('aom-sound') !== 'off', master: null,
  unlock() { if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; } try { this.ac = new (window.AudioContext || window.webkitAudioContext)(); this.master = this.ac.createGain(); this.master.gain.value = 0.5; this.master.connect(this.ac.destination); } catch (e) { this.ac = null; } },
  tone(f, dur, type = 'sine', vol = 0.1, slide = 0, delay = 0) {
    if (!this.ac || !this.on) return; const t = this.ac.currentTime + delay; const o = this.ac.createOscillator(), g = this.ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, vol = 0.1, freq = 1000, delay = 0) {
    if (!this.ac || !this.on) return; const t = this.ac.currentTime + delay; const n = Math.floor(this.ac.sampleRate * dur); const buf = this.ac.createBuffer(1, n, this.ac.sampleRate); const dd = buf.getChannelData(0);
    for (let i = 0; i < n; i++) dd[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = this.ac.createBufferSource(); s.buffer = buf; const f = this.ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq; const g = this.ac.createGain(); g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t);
  },
  hit() { this.noise(0.07, 0.22, 900); this.tone(140, 0.08, 'triangle', 0.08, -60); },
  crit() { this.noise(0.1, 0.3, 1800); this.tone(220, 0.12, 'square', 0.05, -120); },
  miss() { this.noise(0.05, 0.05, 3000); },
  swing() { this.noise(0.06, 0.06, 2600); },
  bow() { this.tone(520, 0.08, 'triangle', 0.05, -300); },
  hurt() { this.tone(110, 0.16, 'sawtooth', 0.06, -50); },
  kill() { this.tone(180, 0.18, 'triangle', 0.06, -120); },
  cast() { this.tone(660, 0.2, 'sine', 0.04, 440); },
  fire() { this.noise(0.25, 0.18, 700); },
  zap() { this.noise(0.12, 0.16, 5000); this.tone(1200, 0.08, 'square', 0.03, -900); },
  heal() { [660, 880, 990].forEach((f, i) => this.tone(f, 0.25, 'sine', 0.04, 0, i * 0.06)); },
  drink() { this.tone(420, 0.1, 'sine', 0.05, 300); },
  pickup() { this.tone(880, 0.06, 'triangle', 0.05); },
  coin() { this.tone(1320, 0.06, 'square', 0.03); this.tone(1760, 0.08, 'square', 0.03, 0, 0.05); },
  rare() { [523, 784, 1046].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.05, 0, i * 0.08)); },
  equip() { this.noise(0.05, 0.12, 1500); },
  level() { [392, 494, 587, 784].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.06, 0, i * 0.09)); },
  warp() { this.tone(300, 0.5, 'sine', 0.06, 900); },
  slam() { this.noise(0.3, 0.35, 400); this.tone(60, 0.35, 'sine', 0.15, -20); },
  boss() { this.tone(73, 1.6, 'sawtooth', 0.05, 0); this.tone(110, 1.6, 'sawtooth', 0.03, 0); },
  victory() { [262, 330, 392, 523, 659].forEach((f, i) => this.tone(f, 0.8, 'triangle', 0.05, 0, i * 0.12)); },
  death() { this.tone(98, 2.2, 'sawtooth', 0.07, -40); this.tone(73, 2.4, 'sine', 0.1, -20); },
  click() { this.tone(700, 0.03, 'square', 0.015); },
};

/* =========================================================
   Update
   ========================================================= */
function stopAll() { P.path = null; P.target = null; P.goal = null; P.pending = null; }
function cancelCast() { if (P.casting) { P.casting = null; P.castT = 0; log('Cast interrupted.', 'sys'); } }
function moveTo(wx, wy) {
  const t = blocked(wx, wy) ? nearestOpen(wx, wy, 4) : { x: Math.floor(wx), y: Math.floor(wy) };
  if (!t) return false;
  const p = findPath(P.x, P.y, t.x, t.y);
  if (!p) return false;
  const ex = t.x === Math.floor(wx) && t.y === Math.floor(wy) && !blocked(wx, wy);
  if (ex && p.length) { p[p.length - 1] = { x: wx, y: wy }; }
  P.path = smooth(P, p); return true;
}
function followPath(e, dt, spd) {
  if (!e.path || !e.path.length) { e.moving = false; return true; }
  let step = spd * dt;
  while (step > 0 && e.path.length) {
    const p = e.path[0], dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy);
    if (d > 0.01) { e.fx = dx / d; e.fy = dy / d; }
    if (d <= step) { e.x = p.x; e.y = p.y; e.path.shift(); step -= d; }
    else { e.x += dx / d * step; e.y += dy / d * step; step = 0; }
  }
  e.moving = true; e.walk += dt * spd * 3.4;
  return !e.path.length;
}
function face(e, t) { const dx = t.x - e.x, dy = t.y - e.y, d = Math.hypot(dx, dy); if (d > 0.01) { e.fx = dx / d; e.fy = dy / d; } }
function goNear(e, tx, ty) {
  let t = blocked(tx, ty) ? nearestOpen(tx, ty, 3) : { x: Math.floor(tx), y: Math.floor(ty) };
  if (!t) return;
  const p = findPath(e.x, e.y, t.x, t.y, 3000); e.path = p ? smooth(e, p) : null;
}
// Range in cells: 'weapon' (melee / bow reach), a number, or a function of the skill level.
function skillRange(sk, lv) { const r = typeof sk.range === 'function' ? sk.range(lv || P.skills[sk.id] || 1) : sk.range; return r === 'weapon' ? S.range : (r || 9); }
function skillBlocked(sk, lv) { return sk.need ? sk.need(lv) : null; }
function useSkill(id) {
  const lv = P.skills[id] | 0, sk = SKILLS[id];
  if (!lv || !sk || sk.passive || P.dead || !started) return;
  if (P.casting || P.dash) return;
  if ((P.cd[id] || 0) > 0) return;
  const why = skillBlocked(sk, lv); if (why) { log(why + '.', 'warn'); floatText(P, why, 'miss'); return; }
  const spc = sk.sp(lv); if (P.sp < spc) { log('Not enough SP.', 'warn'); floatText(P, 'No SP', 'miss'); return; }
  let target = null, pos = null;
  const act = typeof isAction === 'function' && isAction(), rng = skillRange(sk, lv);
  const hm = act ? actionTarget(sk, lv) : (hover && hover.kind === 'mob' ? hover : null);
  if (sk.tgt === 'enemy') { target = hm || (P.target && !P.target.dead ? P.target : null) || nearestMob(act ? rng + 0.5 : 9); if (!target) { log('No target in sight.', 'sys'); floatText(P, 'No target', 'miss'); return; } }
  else if (sk.tgt === 'heal') { if (hm && isUndeadish(hm)) target = hm; }
  else if (sk.tgt === 'ground' || sk.tgt === 'dir') {
    // Keyboard: in front of you, or on the soft target. Mouse: at the cursor, or on the monster under it.
    const ahead = sk.tgt === 'dir' ? rng : Math.min(3, rng);
    if (act) pos = { x: P.x + P.fx * ahead, y: P.y + P.fy * ahead }; else { const w = s2w(mouse.x, mouse.y); pos = { x: w[0], y: w[1] }; }
    // Aimed ('dir') skills only snap to an enemy that is in front of you, so they can also be used to escape.
    const front = hm && (!act || ((hm.x - P.x) * P.fx + (hm.y - P.y) * P.fy) / (dist(P, hm) || 1) > 0.5);
    if (hm && (sk.tgt === 'ground' || (front && dist(P, hm) <= rng + 1))) pos = { x: hm.x, y: hm.y };
  }
  // Keyboard: a target a few steps out of reach is closed in on (the pending skill walks there); farther is refused.
  if (act && target && dist(P, target) > rng + 0.4 && dist(P, target) > rng + 3) { floatText(P, 'Too far', 'miss'); return; }
  P.sitting = false; P.goal = null;
  P.pending = { id, lv, target, pos };
}
function nearestMob(r) { let best = null, bd = r; for (const m of mobs) { if (m.dead) continue; const d = dist(m, P); if (d < bd) { bd = d; best = m; } } return best; }
const castTime = (sk, lv) => sk.cast ? sk.cast(lv) * Math.max(0.2, 1 - S.dex / 150) * (1 - (S.castCut || 0) / 100) : 0;
function beginCast(pd) {
  const sk = SKILLS[pd.id]; const ct = castTime(sk, pd.lv);
  P.path = null;
  if (pd.target) face(P, pd.target); else if (pd.pos) face(P, pd.pos);
  if (ct > 0.05) { P.casting = pd; P.castT = ct; P.castMax = ct; Sfx.cast(); }
  else execSkill(pd);
}
function execSkill(pd) {
  const sk = SKILLS[pd.id];
  if (pd.target && pd.target.kind === 'mob' && pd.target.dead) return;
  const why = skillBlocked(sk, pd.lv); if (why) { log(why + '.', 'warn'); floatText(P, why, 'miss'); return; }
  const spc = sk.sp(pd.lv); if (P.sp < spc) { log('Not enough SP.', 'warn'); return; }
  P.sp -= spc; P.cd[pd.id] = (sk.cd || 0.3) * (1 - (S.cdCut || 0) / 100);
  floatText(P, sk.name + '!!', 'skill');
  sk.use(pd.lv, pd.target, pd.pos);
  if (pd.target && pd.target.kind === 'mob' && sk.range === 'weapon') P.target = pd.target;
}
function updatePlayer(dt) {
  if (P.dead) { P.deadT += dt; if (P.deadT > 1.3 && !P.deathShown) { P.deathShown = true; showDeath(); } return; }
  P.playTime += dt;
  for (const k in P.cd) if (P.cd[k] > 0) P.cd[k] -= dt;
  if (P.potCD > 0) P.potCD -= dt;
  if (P.iframes > 0) P.iframes -= dt;
  if (P.procCD > 0) P.procCD -= dt;
  if (P.reviveCD > 0) P.reviveCD -= dt;
  if (P.hurtT > 0) P.hurtT -= dt;
  if (P.atkAnim >= 0) { P.atkAnim += dt * 3.2; if (P.atkAnim > 1) P.atkAnim = -1; }
  let buffChanged = false;
  for (const k in P.buffs) {
    const bf = P.buffs[k]; bf.t -= dt;
    if (bf.t <= 0) { log(`${bf.name} wears off.`, 'sys'); delete P.buffs[k]; buffChanged = true; continue; }
    if (bf.every && bf.onTick) { bf.tk = (bf.tk || 0) + dt; if (bf.tk >= bf.every) { bf.tk -= bf.every; bf.onTick(bf); } }
    if (bf.needShield && !P.equip.shield) { delete P.buffs[k]; buffChanged = true; }
  }
  if (buffChanged) { calcStats(); renderBuffs(); }

  // Regeneration (Magnificat doubles the tick rate)
  const sitMul = P.sitting ? 2 : 1, rg = P.buffs.magnificat ? P.buffs.magnificat.regen : 1;
  if (P.dash) { updateDash(dt); postMove(); return; }
  P.hpT += dt * rg; if (P.hpT >= 4) { P.hpT = 0; if (P.hp < S.maxhp) { const hr = P.skills.hp_recovery || 0; P.hp = Math.min(S.maxhp, P.hp + (Math.max(1, Math.floor(S.maxhp / 200) + Math.floor(S.vit / 5)) + hr * 5 + Math.floor(S.maxhp * hr * 0.002)) * sitMul); } }
  P.spT += dt * rg; if (P.spT >= 5) { P.spT = 0; if (P.sp < S.maxsp) P.sp = Math.min(S.maxsp, P.sp + (1 + Math.floor(S.maxsp / 100) + Math.floor(S.int / 6) + (P.skills.sp_recovery || 0) * 3) * sitMul); }

  // Keyboard action controls take over while they are in use
  if (typeof actionUpdate === 'function' && actionUpdate(dt)) { postMove(); return; }

  // Casting
  if (P.casting) { P.castT -= dt; if (P.castT <= 0) { const c = P.casting; P.casting = null; execSkill(c); } return; }

  // Pending skill: close in, then cast
  if (P.pending) {
    const pd = P.pending, sk = SKILLS[pd.id];
    if (pd.target && pd.target.kind === 'mob' && pd.target.dead) { P.pending = null; }
    else {
      const tp = pd.target || pd.pos; const r = skillRange(sk, pd.lv);
      if (!tp || sk.tgt === 'dir' || dist(P, tp) <= r + 0.3) { P.pending = null; beginCast(pd); return; }
      P.repath = (P.repath || 0) - dt; if (!P.path || P.repath <= 0) { P.repath = 0.35; goNear(P, tp.x, tp.y); if (!P.path) P.pending = null; }
      followPath(P, dt, S.move); return;
    }
  }

  // Attack target
  if (P.target) {
    const t = P.target;
    if (t.dead) P.target = null;
    else {
      const d = dist(P, t);
      if (d <= S.range + 0.2) {
        P.path = null; P.moving = false; face(P, t);
        P.atkCD -= dt;
        if (P.atkCD <= 0) { P.atkCD = 1 / S.aspd; playerAttack(t); }
      } else {
        P.atkCD = Math.min(P.atkCD, 0.15);
        P.repath = (P.repath || 0) - dt;
        if (!P.path || P.repath <= 0) { P.repath = 0.3; goNear(P, t.x, t.y); if (!P.path) P.target = null; }
        followPath(P, dt, S.move);
      }
      return;
    }
  }
  P.atkCD = Math.max(0, P.atkCD - dt);

  // Goals: NPC, object, drop
  if (P.goal) {
    const g = P.goal.ref, reach = P.goal.kind === 'drop' ? 0.75 : 1.9;
    if (P.goal.kind === 'drop' && !drops.includes(g)) P.goal = null;
    else if (dist(P, g) <= reach) {
      P.path = null; P.moving = false; const goal = P.goal; P.goal = null; face(P, g);
      if (goal.kind === 'drop') pickup(g); else if (goal.kind === 'npc') talkTo(g); else if (goal.kind === 'obj') useObj(g);
      return;
    } else if (!P.path) { goNear(P, g.x, g.y); if (!P.path) P.goal = null; }
  }

  // Hold-to-walk
  if (mouse.hold && mouse.down) { mouse.holdT -= dt; if (mouse.holdT <= 0) { mouse.holdT = 0.2; const w = s2w(mouse.x, mouse.y); moveTo(w[0], w[1]); } }

  const was = P.moving;
  followPath(P, dt, S.move);
  if (was && !P.moving) P.walk = 0;
  postMove();
}
function postMove() {
  // Auto-pick zeny & lost zeny when walking over it
  for (const d of drops) if ((d.zeny) && dist(P, d) < 0.7) { pickup(d); break; }
  // Warps
  for (const wp of map.warps) {
    if (Math.floor(P.x) === wp.x && Math.floor(P.y) === wp.y) {
      if (wp.lock === 'gate' && !P.flags.gate) {
        if (!P.warpMsgT || time - P.warpMsgT > 3) { P.warpMsgT = time; log('The Cinder Gate is sealed. Bring the three Rune-Shards to Sigrun.', 'warn'); }
        const back = findPath(P.x, P.y, wp.x, wp.y + 2); P.path = back; P.y += 0.05;
      } else { Sfx.warp(); gotoMap(wp.to, wp.tx, wp.ty); }
      break;
    }
  }
}
function updateMob(m, dt) {
  if (m.dead) { m.deathT += dt; return; }
  m.anim += dt; if (m.hitFlash > 0) m.hitFlash -= dt;
  if (m.atkAnim >= 0) { m.atkAnim += dt * 3; if (m.atkAnim > 1) m.atkAnim = -1; }
  if (m.snare > 0) m.snare -= dt; if (m.slow > 0) m.slow -= dt; if (m.dispel > 0) m.dispel -= dt; if (m.mark > 0) m.mark -= dt;
  if (m.frozen > 0) { m.frozen -= dt; m.moving = false; return; }
  if (m.stun > 0) { m.stun -= dt; m.moving = false; m.atkCD = Math.max(m.atkCD, 0.3); return; }
  if (m.leap) {
    const L = m.leap; L.t += dt; const k = Math.min(1, L.t / L.dur);
    m.x = L.sx + (L.tx - L.sx) * k; m.y = L.sy + (L.ty - L.sy) * k; m.z = Math.sin(k * Math.PI) * 60;
    if (k >= 1) { m.leap = null; m.z = 0; m.path = null; }
    return;
  }
  const d = m.d, dp = dist(m, P), spd = m.snare > 0 ? 0 : d.speed * (m.slow > 0 ? 0.5 : 1);
  if (!P.dead && m.state === 'idle' && d.aggro && dp < (d.sight || 7)) aggro(m);
  if (P.dead && m.state === 'chase') { m.state = 'return'; m.path = null; }
  m.atkCD -= dt;
  if (m.state === 'idle') {
    m.t -= dt;
    if (m.t <= 0) { m.t = rand(2.5, 6); if (Math.random() < 0.65) { const tx = m.hx + rand(-4, 4), ty = m.hy + rand(-4, 4); if (!blocked(tx, ty)) { const p = findPath(m.x, m.y, tx, ty, 400); m.path = p; } } }
    followPath(m, dt, spd * 0.45); if (!spd) m.moving = false;
  } else if (m.state === 'chase') {
    const leash = d.boss ? 24 : 16;
    if (Math.hypot(m.x - m.hx, m.y - m.hy) > leash && !m.summoned) { m.state = 'return'; m.path = null; return; }
    if (dp <= d.range + 0.2) {
      m.path = null; m.moving = false; face(m, P);
      if (m.atkCD <= 0) {
        m.atkCD = d.aspd * (m.slow > 0 ? 1 + 0.1 * (m.slowLv || 1) : 1); m.atkAnim = 0;
        if (d.ranged) shot(m, P, 'arrow', () => { if (!m.dead) mobStrike(m); }, { spd: 13 });
        else after(0.32, () => { if (!m.dead && !P.dead && !(m.stun > 0) && dist(m, P) <= d.range + 0.9) mobStrike(m); });
      }
    } else {
      m.repath -= dt;
      if (m.repath <= 0 || !m.path) {
        m.repath = rand(0.4, 0.7);
        if (dp < 2.5 && clearLine(m.x, m.y, P.x, P.y)) m.path = [{ x: P.x, y: P.y }];
        else { const p = findPath(m.x, m.y, P.x, P.y, 2200); m.path = p ? smooth(m, p) : null; if (!p && !m.summoned) { m.state = 'return'; } }
      }
      followPath(m, dt, spd); if (!spd) m.moving = false;
    }
    if (d.boss && d.abil) {
      if (d.phase2 && !m.p2 && m.hp < m.maxhp * 0.5) { m.p2 = true; banner(d.name, 'The fire answers him directly now', 'band'); log(d.phase2, 'boss'); Sfx.boss(); }
      for (const a of d.abil) { if (m.abil[a.id] === undefined) m.abil[a.id] = a.cd * 0.5; m.abil[a.id] -= dt * (m.p2 ? 1.5 : 1); if (m.abil[a.id] <= 0) { m.abil[a.id] = a.cd; doAbility(m, a); break; } }
    }
  } else if (m.state === 'return') {
    if (!m.path) { const p = findPath(m.x, m.y, m.hx, m.hy, 3000); m.path = p ? smooth(m, p) : []; }
    const done = followPath(m, dt, d.speed * 1.3);
    m.hp = Math.min(m.maxhp, m.hp + m.maxhp * 0.2 * dt);
    if (done) { m.state = 'idle'; m.hp = m.maxhp; m.path = null; m.announced = false; m.abil = {}; m.p2 = false; if (bossShown === m) { $('bossbar').hidden = true; bossShown = null; } }
  }
}
function update(dt) {
  time += dt;
  for (let i = timers.length - 1; i >= 0; i--) { const t = timers[i]; t.t -= dt; if (t.t <= 0) { timers.splice(i, 1); t.fn(); } }
  if (started) { updatePlayer(dt); updateZones(dt); questTick(dt); }
  for (const m of mobs) updateMob(m, dt);
  for (let i = mobs.length - 1; i >= 0; i--) if (mobs[i].dead && mobs[i].deathT > 0.8) mobs.splice(i, 1);
  for (let i = projs.length - 1; i >= 0; i--) {
    const p = projs[i]; p.t += dt;
    const tgt = p.to; if ((tgt.dead && tgt !== P) || (tgt === P && P.dead) || p.t > 3) { projs.splice(i, 1); continue; }
    const dx = tgt.x - p.x, dy = tgt.y - p.y, dz = chestH(tgt) - p.zu, d = Math.hypot(dx, dy, dz), st = p.spd * dt;
    if (d <= st + 0.25) { projs.splice(i, 1); p.onHit(); if (p.kind !== 'arrow') burst(tgt.x, tgt.y, 30, PCOL[p.kind], 12, 2.2); }
    else { p.vx = dx / d; p.vy = dy / d; p.vz = dz / d; p.x += p.vx * st; p.y += p.vy * st; p.zu += p.vz * st; }
  }
  for (let i = teles.length - 1; i >= 0; i--) {
    const t = teles[i]; t.t += dt;
    if (t.t >= t.dur) {
      teles.splice(i, 1); if (t.m.dead) continue; t.boom();
      if (!P.dead && Math.hypot(P.x - t.x, P.y - t.y) <= t.r) { if (wardAt(t.x, t.y)) { floatText(P, 'Warded', 'info'); ring(t.x, t.y, t.r, '#9fe0c0'); } else mobStrike(t.m, t.a.mul, { sure: true, magic: true }); }
    }
  }
  for (let i = drops.length - 1; i >= 0; i--) { const d = drops[i]; d.t += dt; if (d.t > 180 && !d.lost && !(d.item && rarityOf(d.item) === 'unique') && !(d.item && ITEMS[d.item.id].type === 'key')) drops.splice(i, 1); }
  for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue; } p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; if (!p.float) p.vz -= 160 * dt; if (p.z < 0) { p.z = 0; p.vz *= -0.3; p.vx *= 0.6; p.vy *= 0.6; } }
  for (let i = fxs.length - 1; i >= 0; i--) { const f = fxs[i]; f.t += dt; if (f.t >= f.dur) fxs.splice(i, 1); }
  for (let i = floats.length - 1; i >= 0; i--) { const f = floats[i]; f.t += dt; if (f.t > (f.kind === 'skill' || f.kind === 'lvl' || f.kind === 'job' ? 1.3 : 0.95)) { floats.splice(i, 1); continue; } }
  if (started && time - lastSave > 30) { lastSave = time; saveGame(); }
}

/* =========================================================
   Death, maps, waystones
   ========================================================= */
function die() {
  P.dead = true; P.deadT = 0; P.casting = null; P.pending = null; P.target = null; P.path = null; P.goal = null; P.dash = null; P.spheres = 0;
  if (P.zeny > 0) {
    if (P.lostZeny) log(`The zeny you lost before is gone for good.`, 'bad');
    P.lostZeny = { map: map.id, x: P.x, y: P.y, zeny: P.zeny };
    drops.push({ kind: 'drop', zeny: P.zeny, lost: true, x: P.x, y: P.y, t: 0, id: uidc++ });
    log(`You drop ${fmt(P.zeny)} zeny where you fell. Return and touch it to take it back.`, 'bad');
    P.zeny = 0;
  }
  Sfx.death(); P.deathShown = false;
  $('bossbar').hidden = true; bossShown = null;
  UI.dirty = true;
}
function respawn() {
  $('death').hidden = true; P.dead = false; calcStats(); P.hp = S.maxhp; P.sp = S.maxsp; P.buffs = {}; calcStats(); renderBuffs();
  gotoMap(P.lastWay.map, P.lastWay.x, P.lastWay.y, true);
  log('The Waystone pulls you back from the dark.', 'sys');
}
function gotoMap(id, x, y, quiet) {
  const first = !map || map.id !== id;
  map = genMap(id);
  if (blocked(x, y)) { const o = nearestOpen(x, y, 5) || map.entry; x = o.x + 0.5; y = o.y + 0.5; }
  P.map = id; P.x = x; P.y = y;
  stopAll(); P.casting = null; P.dash = null; timers = []; projs = []; teles = []; parts = []; fxs = []; floats = []; drops = []; zones = [];
  spawnAll();
  if (typeof prefetchSheets === 'function') prefetchSheets(); // lazy-load this map's sprite sheets
  if (P.lostZeny && P.lostZeny.map === id) drops.push({ kind: 'drop', zeny: P.lostZeny.zeny, lost: true, x: P.lostZeny.x, y: P.lostZeny.y, t: 0, id: uidc++ });
  $('bossbar').hidden = true; bossShown = null;
  enterWorld();
  if (first || !quiet) banner(map.d.name, map.d.sub);
  setScreenParts();
  if (id === 'throne' && !P.flags.kingIntro && !P.flags.kingSlain) { P.flags.kingIntro = true; after(1.2, () => say('The Ashen King', [MOBS.ashen_king.intro, '“You came for the Heart. It is behind me. So am I, in a sense. Come and take it.”'])); }
  UI.dirty = true; saveGame();
}
function useObj(o) {
  if (o.kind === 'way') {
    if (!P.kindled[map.id]) { P.kindled[map.id] = true; banner('Waystone Kindled', map.d.name, 'band gold'); Sfx.level(); }
    openWin('way');
  } else if (o.kind === 'board') questBoard(o);
  else if (OBJ_TALK[o.kind]) OBJ_TALK[o.kind](o);
  else if (o.kind === 'anvil') log('The anvil is still warm. Brokkr never lets it go cold.', 'sys');
}
function rest() {
  P.hp = S.maxhp; P.sp = S.maxsp; P.lastWay = { map: map.id, x: map.way.x, y: map.way.y + 1.2 };
  if (blocked(P.lastWay.x, P.lastWay.y)) { const o = nearestOpen(map.way.x, map.way.y + 1, 3); if (o) P.lastWay = { map: map.id, x: o.x + 0.5, y: o.y + 0.5 }; }
  const lost = drops.filter(d => d.lost);
  mobs = []; spawnAll(); drops = drops.filter(d => d.lost || d.item);
  pillar(P, '#ffb060', true); Sfx.heal();
  log('You rest at the Waystone. Your wounds close. Somewhere out in the Ash, the dead get up again.', 'sys');
  $('bossbar').hidden = true; bossShown = null;
  saveGame(); closeWin('way');
}

