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
const dist = (a, b) => hyp(a.x - b.x, a.y - b.y);
const sq = x => x * x;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = n => Math.floor(n).toLocaleString('en-US');
const $ = id => document.getElementById(id);
// Perf round 5: Math.hypot allocates (V8 copies its arguments into a fresh FixedDoubleArray on every call) and is not
// inlined. hyp / hyp3 compute exactly what V8's Math.hypot computes (scale by the largest magnitude, Kahan-summed
// squares, sqrt, rescale; Infinity beats NaN; 0 when all are 0), bit for bit (checked on 25 M random pairs / triples
// incl. 0, -0, NaN, Infinity, subnormals and huge values in Node's V8 and in Chrome: perf.py pathcheck), with no
// allocation and ~3x faster. Used by the game logic (core.js, action.js); the result is the same number.
function hyp(x, y) {
  const ax = Math.abs(x), ay = Math.abs(y), m = ax > ay ? ax : ay;
  if (!(m > 0 && m < 1.7976931348623157e308)) return hypRare(2, ax, ay, 0);   // 0, NaN, Infinity, huge: the rare cases
  const a = ax / m, b = ay / m;
  return Math.sqrt(a * a + b * b) * m;
}
function hyp3(x, y, z) {
  const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z); let m = ax > ay ? ax : ay; if (az > m) m = az;
  if (!(m > 0 && m < 1.7976931348623157e308)) return hypRare(3, ax, ay, az);
  let sum = 0, comp = 0, n = ax / m, s = n * n - comp, p = sum + s; comp = (p - sum) - s; sum = p;   // (V8's Kahan loop, unrolled)
  n = ay / m; s = n * n - comp; p = sum + s; comp = (p - sum) - s; sum = p;
  n = az / m; s = n * n - comp; p = sum + s; sum = p;
  return Math.sqrt(sum) * m;
}
function hypRare(k, ax, ay, az) {   // k = 2 or 3 arguments (absolute values)
  if (ax === Infinity || ay === Infinity || (k === 3 && az === Infinity)) return Infinity;
  if (ax !== ax || ay !== ay || (k === 3 && az !== az)) return NaN;
  let m = ax > ay ? ax : ay; if (k === 3 && az > m) m = az; if (m === 0) return 0;
  let sum = 0, comp = 0, n = ax / m, s = n * n - comp, p = sum + s; comp = (p - sum) - s; sum = p;
  n = ay / m; s = n * n - comp; p = sum + s; comp = (p - sum) - s; sum = p;
  if (k === 3) { n = az / m; s = n * n - comp; p = sum + s; sum = p; }
  return Math.sqrt(sum) * m;
}
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

/* Cycle 8 (squad mode): the party. design/squad-contract.md.
   PARTY = { members: [hero, ...], lead, owner } holds 1-4 heroes, or is null (solo play, exactly as before). Every hero
   has the shape of P; P is always the member the player controls (squadSwap in js/squad.js moves it). The player's own
   hero is PARTY.owner: the companions' party-wide fields (bag, zeny, quests, flags, storage, ...) are accessors onto
   the owner's (js/squad.js SQUAD_SHARED), so every member sees the same bag and the same quest log.
   Hero context: withHero(h, fn) runs fn with P = h and S = h's stat block (h._S) and puts both back afterwards, so all
   the P-centric combat code (skills, hits, buffs, regen, death) works for a companion unchanged. Timers, projectiles
   and zones remember the hero that made them (t.h / p.h / z.h) and fire in that hero's context. With a party of one
   none of this changes anything: withHero(P, fn) is a plain call and every multi-hero branch is gated on partyN() > 1. */
var PARTY = null;
const SOLO_ = [null];
function heroes() { if (PARTY) return PARTY.members; SOLO_[0] = P; return P ? SOLO_ : []; }
function allies() { return heroes().filter(h => h !== P); }
const partyN = () => PARTY ? PARTY.members.length : 1;
// The hero the player controls, also while another hero's context is active.
const leadHero = () => PARTY ? PARTY.members[PARTY.lead] || P : P;
const inParty = h => !!PARTY && PARTY.members.indexOf(h) >= 0;
// Whole party down (solo: the hero is dead): the old death flow and every "you fell" check.
function partyWiped() { if (!PARTY || PARTY.members.length < 2) return !!(P && P.dead); for (const h of PARTY.members) if (!h.dead) return false; return true; }
const HCTX = { depth: 0, quiet: 0, rb: null };
const NOOP_ = () => {};
function withHero(h, fn, a, b, c) {
  if (!h || h === P) return fn(a, b, c);
  const p0 = P, s0 = S, quiet = h !== leadHero();
  if (p0) p0._S = s0;
  P = h; S = h._S || null; HCTX.depth++;
  // A companion's buff changes must not repaint the player's buff bar (js/ui.js renderBuffs reads P).
  if (quiet && HCTX.quiet++ === 0 && typeof renderBuffs === 'function') { HCTX.rb = renderBuffs; renderBuffs = NOOP_; }
  try { if (!S) calcStats(); return fn(a, b, c); }
  finally {
    h._S = S; P = p0; S = p0 ? p0._S || s0 : s0; HCTX.depth--;
    if (quiet && --HCTX.quiet === 0 && HCTX.rb) { renderBuffs = HCTX.rb; HCTX.rb = null; }
  }
}
// A hero's stat block (the S of that hero). The UI and the renderer read companions' Max HP / SP through this.
function heroStats(h) { if (!h || h === P) return S; if (!h._S) withHero(h, NOOP_); return h._S; }
// Deferred work (timers, projectiles, zones) made by hero h runs in h's context again (a party of one: a plain call).
function asOwner(h, fn, a) { if (PARTY && h && h !== P && PARTY.members.indexOf(h) >= 0) return withHero(h, fn, a); return fn(a); }
// Hero-centric chatter ("Blessing wears off.", "Not enough SP.") is only for the hero the player controls.
function hlog(msg, cls) { if (!HCTX.quiet) log(msg, cls); }

/* =========================================================
   Map generation
   genMap(id) builds a map in steps (see the header of js/data/maps.js):
     mapBase    1. base terrain for `gen`, 2. the map's layout, the Waystone tile
     mapGrow    cycle 9, a grown map (`d.grow`): the original d.grow.w0 x d.grow.h0 region is generated exactly as
                before (the map's own rng stream, pockets sealed as before) and copied into the grown d.w x d.h grid; the
                new area east and south gets its own seeded stream (d.grow.seed) for its terrain and d.grow.layout
     mapFinish  3. NPCs and boards, 4. connectivity, heights, minimap
   Generator types (`gen`): town, field, dungeon, arena, sky, and from cycle 9
     cave      natural caves (caveCA: cellular automata, every pocket joined), rock walls (T.WALL), an uneven floor,
               underground pools where the def sets `water` (0..1, the share of low ground that floods)
     interior  solid walls, rooms carved by the layout (like dungeon), tagged for the renderer (render.kind 'interior')
   m.kind = render.kind ('cave' | 'interior' | null), passed through for the renderer.
   ========================================================= */
const SOLID_GEN = { dungeon: 1, interior: 1, cave: 1 };
const mapFiller = gen => SOLID_GEN[gen] ? T.WALL : gen === 'arena' ? T.LAVA : gen === 'sky' ? T.VOID : T.TREE;
// Terrain brushes bound to one map, one rng stream and the map's current size (the layout kit K).
function mapKit(m, rng, gen) {
  const w = m.w, h = m.h;
  const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < w && y < h) m.t[y * w + x] = v; };
  const clearC = (cx, cy, r) => { for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r + 0.5 && x > 0 && y > 0 && x < w - 1 && y < h - 1) m.t[y * w + x] = 0; };
  const clearR = (x0, y0, x1, y1) => { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) if (x > 0 && y > 0 && x < w - 1 && y < h - 1) m.t[y * w + x] = 0; };
  const carve = (x0, y0, x1, y1, r) => { let x = x0, y = y0, g = 0; while ((x !== x1 || y !== y1) && g++ < 6000) { clearC(x, y, r); if (r >= 2 && gen === 'field') m.deco[y * w + x] = 6; if (rng() < 0.72) { if (Math.abs(x1 - x) > Math.abs(y1 - y)) x += Math.sign(x1 - x); else y += Math.sign(y1 - y); } else { if (rng() < 0.5) x += rng() < 0.5 ? 1 : -1; else y += rng() < 0.5 ? 1 : -1; x = clamp(x, 2, w - 3); y = clamp(y, 2, h - 3); } } clearC(x1, y1, r); };
  const K = { set, clearC, clearR, carve, rng, T, w, h };
  K.caveCA = (x0, y0, x1, y1, o) => caveCA(m, K, x0, y0, x1, y1, o);
  return K;
}
// Base terrain for a generator type on the tiles where inR(x, y) holds (the whole map, or a grown map's new area).
function mapTerrain(m, d, gen, rng, inR, K) {
  const w = m.w, h = m.h, set = K.set;
  if (gen === 'town') {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inR(x, y) && (x === 0 || y === 0 || x === w - 1 || y === h - 1)) set(x, y, T.WALL);
  } else if (gen === 'field') {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!inR(x, y)) continue;
      if (x < 2 || y < 2 || x >= w - 2 || y >= h - 2) { set(x, y, rng() < 0.7 ? T.TREE : T.ROCK); continue; }
      const n = vnoise(x / 7, y / 7, d.seed);
      const r = rng() * (0.6 + n * 0.8);
      if (r < d.trees) set(x, y, T.TREE); else if (r < d.trees + d.rocks) set(x, y, T.ROCK);
      else if (d.ruins && rng() < d.ruins) set(x, y, T.RUIN);
      if (m.t[y * w + x] === 0 && rng() < 0.13) m.deco[y * w + x] = 1 + ((rng() * 4) | 0);
    }
  } else if (gen === 'dungeon' || gen === 'interior') { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inR(x, y)) m.t[y * w + x] = T.WALL; }
  else if (gen === 'cave') {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inR(x, y)) m.t[y * w + x] = T.WALL;
    if (inR(0, 0)) { caveCA(m, K, 2, 2, w - 3, h - 3, d.cave); if (d.water) cavePools(m, d, rng, d.water); }
  }
  else if (gen === 'arena') { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inR(x, y)) m.t[y * w + x] = T.LAVA; }
  else if (gen === 'sky') { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inR(x, y)) m.t[y * w + x] = T.VOID; }
}
/* Cycle 9: natural caves. A cellular automaton (the 4-5 rule, `steps` rounds from `fill` random rock) inside the box
   [x0, y0]..[x1, y1] (inclusive; the box's rim stays rock), then every open pocket of `min`+ tiles is joined to the
   largest one by a winding tunnel (K.carve, radius 1) and smaller pockets are filled in. Only K.rng is used, so a cave
   is the same on every visit. Returns the open tiles' count. Layouts may call it for part of a map (K.caveCA). */
function caveCA(m, K, x0, y0, x1, y1, o) {
  o = o || {};
  const w = m.w, rng = K.rng, fill = o.fill !== undefined ? o.fill : 0.45, steps = o.steps !== undefined ? o.steps : 5, min = o.min || 10;
  const gw = x1 - x0 + 1, gh = y1 - y0 + 1; if (gw < 5 || gh < 5) return 0;
  let g = new Uint8Array(gw * gh), g2 = new Uint8Array(gw * gh);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) g[y * gw + x] = (x === 0 || y === 0 || x === gw - 1 || y === gh - 1 || rng() < fill) ? 1 : 0;
  for (let s = 0; s < steps; s++) {
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      if (x === 0 || y === 0 || x === gw - 1 || y === gh - 1) { g2[y * gw + x] = 1; continue; }
      let n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) n += g[(y + dy) * gw + x + dx];
      let n2 = n; if (s < 2) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { if (Math.abs(dx) < 2 && Math.abs(dy) < 2) continue; const xx = x + dx, yy = y + dy; n2 += (xx < 0 || yy < 0 || xx >= gw || yy >= gh) ? 1 : g[yy * gw + xx]; }
      g2[y * gw + x] = n >= 5 || (s < 2 && n2 <= 2) ? 1 : 0;
    }
    const t = g; g = g2; g2 = t;
  }
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) m.t[(y0 + y) * w + x0 + x] = g[y * gw + x] ? T.WALL : 0;
  // pockets (4-connected), largest first
  const lab = new Int32Array(gw * gh).fill(-1), comps = [];
  for (let i = 0; i < gw * gh; i++) {
    if (g[i] || lab[i] >= 0) continue;
    const c = [], q = [i]; lab[i] = comps.length;
    while (q.length) { const k = q.pop(); c.push(k); const x = k % gw, y = (k / gw) | 0; for (let d = 0; d < 4; d++) { const nx = x + DX[d], ny = y + DY[d]; if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue; const j = ny * gw + nx; if (!g[j] && lab[j] < 0) { lab[j] = comps.length; q.push(j); } } }
    comps.push(c);
  }
  if (!comps.length) return 0;
  const order = comps.map((c, i) => i).sort((a, b) => comps[b].length - comps[a].length || a - b);
  const main = comps[order[0]].slice();
  for (let oi = 1; oi < order.length; oi++) {
    const c = comps[order[oi]];
    if (c.length < min) { for (const k of c) m.t[(y0 + ((k / gw) | 0)) * w + x0 + k % gw] = T.WALL; continue; }
    // the closest pair (every 3rd tile of the pocket against every 2nd of the joined area: plenty for a tunnel)
    let bd = 1e9, ba = c[0], bb = main[0];
    for (let a = 0; a < c.length; a += 3) { const ax = c[a] % gw, ay = (c[a] / gw) | 0; for (let b = 0; b < main.length; b += 2) { const d = Math.abs(ax - main[b] % gw) + Math.abs(ay - ((main[b] / gw) | 0)); if (d < bd) { bd = d; ba = c[a]; bb = main[b]; } } }
    K.carve(x0 + ba % gw, y0 + ((ba / gw) | 0), x0 + bb % gw, y0 + ((bb / gw) | 0), 1);
    for (const k of c) main.push(k);
  }
  let open = 0; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (m.t[y * w + x] === 0) open++;
  return open;
}
// Underground pools: the lowest `amt` share of a cave's floor (by a smooth noise) floods with still water (T.WATER).
// Layouts carve their chambers and tunnels afterwards, which leaves fords where a tunnel crosses a pool.
function cavePools(m, d, rng, amt) {
  const w = m.w, h = m.h, thr = 1 - clamp(amt, 0, 0.6);
  for (let y = 3; y < h - 3; y++) for (let x = 3; x < w - 3; x++) {
    if (m.t[y * w + x] !== 0) continue;
    const n = vnoise(x / 6, y / 6, d.seed + 21) * 0.8 + vnoise(x / 2.5, y / 2.5, d.seed + 22) * 0.2;
    if (n > thr) m.t[y * w + x] = T.WATER;
  }
}
function mapNew(id, d, w, h) {
  return { id, d, w, h, t: new Uint8Array(w * h), deco: new Uint8Array(w * h), surf: new Uint8Array(w * h), var: new Uint8Array(w * h), warps: [], npcs: [], objs: [], lights: [], braziers: [], decor: [], entry: null, bossPos: null, gcol: [] };
}
// Steps 1 and 2 at the map's original size, from its own rng stream (identical to the pre-cycle-9 generator).
function mapBase(id, d, w, h, rng) {
  const m = mapNew(id, d, w, h), K = mapKit(m, rng, d.gen);
  for (let i = 0; i < w * h; i++) m.var[i] = (rng() * 256) | 0;
  // 1. Base terrain for the generator type (see js/data/maps.js)
  mapTerrain(m, d, d.gen, rng, () => true, K);
  // 2. The map's own layout: entry, waystone, warps, rooms, props
  if (d.layout) d.layout(m, Object.assign(K, { d }));
  if (m.way) K.set(Math.floor(m.way.x), Math.floor(m.way.y), T.WAY);
  return m;
}
// Flood from the entry; open tiles it cannot reach become `filler`. Returns the reach mask.
function mapSeal(m, filler) {
  const w = m.w, h = m.h, seen = new Uint8Array(w * h), q = [m.entry.y * w + m.entry.x]; seen[q[0]] = 1;
  while (q.length) { const c = q.pop(), cx = c % w, cy = (c / w) | 0; for (let k = 0; k < 4; k++) { const nx = cx + DX[k], ny = cy + DY[k]; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const ni = ny * w + nx; if (!seen[ni] && m.t[ni] === 0) { seen[ni] = 1; q.push(ni); } } }
  for (let i = 0; i < w * h; i++) if (m.t[i] === 0 && !seen[i]) m.t[i] = filler;
  return seen;
}
// Cycle 9: grow a map east and south. The original region keeps every tile, path, tree, warp and decor entry.
function mapGrow(m0, d, g) {
  for (const wp of m0.warps) if (wp.x >= 0 && wp.y >= 0 && wp.x < m0.w && wp.y < m0.h) m0.t[wp.y * m0.w + wp.x] = 0;
  mapSeal(m0, mapFiller(d.gen));   // the original's pockets stay sealed exactly as before
  const W = d.w, H = d.h, w0 = m0.w, h0 = m0.h, m = m0;
  for (const k of ['t', 'deco', 'surf', 'var']) { const a = new Uint8Array(W * H), o = m0[k]; for (let y = 0; y < h0; y++) a.set(o.subarray(y * w0, (y + 1) * w0), y * W); m[k] = a; }
  m.w = W; m.h = H;
  const rng = mulberry32(g.seed || ((d.seed * 7919 + 104729) >>> 0) || 1), inR = (x, y) => x >= w0 || y >= h0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inR(x, y)) m.var[y * W + x] = (rng() * 256) | 0;
  const K = Object.assign(mapKit(m, rng, d.gen), { d, w0, h0 });
  mapTerrain(m, g.terrain ? Object.assign({}, d, g.terrain) : d, g.gen || d.gen, rng, inR, K);   // terrain: { trees, rocks, ruins } for the new area
  if (g.layout) g.layout(m, K);
  m.grown = { w0, h0 };
  return m;
}
function genMap(id) {
  if (mapCache[id]) return mapCache[id];
  if (!MAPDEFS[id]) deepEnsure(id);   // round 7: helheim_deep_<n> floors are generated on demand (js/data/maps.js deepDef)
  const d = MAPDEFS[id], rng = mulberry32(d.seed), g = d.grow;
  if (SOLID_GEN[d.gen] && d.gen !== 'dungeon') {   // cycle 9: caves and interiors are time-locked and tagged for the renderer
    d.render = d.render || {}; if (!d.render.kind) d.render.kind = d.gen; if (d.render.tod === undefined) d.render.tod = false;
    if (!d.render.weather) d.render.weather = { amb: [] };
  }
  let m = mapBase(id, d, g ? g.w0 : d.w, g ? g.h0 : d.h, rng);
  if (g) m = mapGrow(m, d, g);
  const w = m.w, h = m.h, set = (x, y, v) => { if (x >= 0 && y >= 0 && x < w && y < h) m.t[y * w + x] = v; };
  m.kind = (d.render && d.render.kind) || null;
  // 3. NPCs and bounty boards declared in data
  for (const k in NPCS) { const n = NPCS[k]; if (n.map === id && !n.show && !n.at) { const e = { id: k, name: n.name, title: n.title, x: n.x, y: n.y, dir: n.dir || 1, look: n.look }; if (n.route) { e.route = n.route; e.home = [n.x, n.y]; } m.npcs.push(e); } } // `show` / `at` NPCs: npcSync(); cycle 9: `route` walkers (ambientTick)
  if (m.way) m.objs.push({ kind: 'way', x: m.way.x, y: m.way.y, name: 'Waystone' });
  for (const k in BOARDS) { const b = BOARDS[k]; if (b.map === id) m.objs.push({ kind: 'board', board: k, name: b.name, title: b.title, x: b.x, y: b.y }); }
  for (const wp of m.warps) set(wp.x, wp.y, 0);

  // Connectivity: seal pockets the player can never reach.
  const seen = mapSeal(m, mapFiller(d.gen));
  m.reach = seen;
  // Scatter decor that must stand on open ground loses its place when its tile was sealed.
  m.decor = m.decor.filter(e => e.on !== 'open' || m.t[clamp(Math.floor(e.y), 0, h - 1) * w + clamp(Math.floor(e.x), 0, w - 1)] === 0);
  // Only walls that touch open ground get drawn; the rest stay black.
  m.vis = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (m.t[y * w + x] !== T.WALL) continue; for (let k = 0; k < 8; k++) { const nx = x + DX[k], ny = y + DY[k]; if (nx >= 0 && ny >= 0 && nx < w && ny < h && m.t[ny * w + nx] !== T.WALL) { m.vis[y * w + x] = 1; break; } } }

  // Terrain heights at tile corners: gentle hills in the wild, a raised platform over lava in the arena,
  // the ground dipping under water and lava, and a deep drop under the Bifrost's open sky (T.VOID).
  const W1 = w + 1; m.hgt = new Float32Array(W1 * (h + 1));
  const tAt = (x, y) => m.t[clamp(y, 0, h - 1) * w + clamp(x, 0, w - 1)];
  const lavaAt = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? true : m.t[y * w + x] === T.LAVA;
  const sinks = t => t === T.WATER || t === T.VOID || t === T.LAVA;
  // Field maps flatten toward their shores: distance in tiles to the nearest water (capped).
  let dW = null;
  if (d.gen === 'field' && m.t.some(t => t === T.WATER)) {
    dW = new Float32Array(w * h).fill(9); const q = [];
    for (let i = 0; i < w * h; i++) if (m.t[i] === T.WATER) { dW[i] = 0; q.push(i); }
    for (let qi = 0; qi < q.length; qi++) { const i = q[qi], x = i % w, y = (i / w) | 0; if (dW[i] >= 8) continue; for (let k = 0; k < 8; k++) { const nx = x + DX[k], ny = y + DY[k]; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const j = ny * w + nx; if (dW[j] > dW[i] + 1) { dW[j] = dW[i] + 1; q.push(j); } } }
  }
  for (let vz = 0; vz <= h; vz++) for (let vx = 0; vx <= w; vx++) {
    let hv = 0;
    if (d.gen === 'field') hv = (vnoise(vx / 9, vz / 9, d.seed + 11) - 0.5) * 1.8 + (vnoise(vx / 3.5, vz / 3.5, d.seed + 12) - 0.5) * 0.35;
    else if (d.gen === 'town') hv = (vnoise(vx / 6, vz / 6, d.seed) - 0.5) * 0.18;
    else if (d.gen === 'sky') hv = (vnoise(vx / 5, vz / 5, d.seed + 11) - 0.5) * 0.3;
    else if (d.gen === 'cave') hv = (vnoise(vx / 5, vz / 5, d.seed + 11) - 0.5) * 0.9 + (vnoise(vx / 2, vz / 2, d.seed + 12) - 0.5) * 0.2;   // cycle 9: an uneven cave floor
    if (d.gen === 'arena') { const c = lavaAt(vx - 1, vz - 1) + lavaAt(vx, vz - 1) + lavaAt(vx - 1, vz) + lavaAt(vx, vz); hv = c === 4 ? -1.0 : c > 0 ? -0.15 : 0.15; }
    else {
      const q4 = [tAt(vx - 1, vz - 1), tAt(vx, vz - 1), tAt(vx - 1, vz), tAt(vx, vz)];
      const nV = q4.filter(t => t === T.VOID).length, nW = q4.filter(t => t === T.WATER).length, nL = q4.filter(t => t === T.LAVA).length;
      if (nV === 4) hv = -4.2 - vnoise(vx / 4, vz / 4, d.seed + 13) * 1.6;
      else if (nW === 4) hv = -1.15 - vnoise(vx / 4, vz / 4, d.seed + 13) * 0.2;
      else if (nL === 4) hv = d.gen === 'dungeon' ? -0.05 : -1.0;   // dungeon lava channels are flush kerb tiles (nidavellir_lava_edge)
      else if (q4.some(sinks)) hv = Math.min(hv, 0) * 0.3 - 0.06;
      else if (dW) { let dm = 9; for (const [tx, ty] of [[vx - 1, vz - 1], [vx, vz - 1], [vx - 1, vz], [vx, vz]]) dm = Math.min(dm, dW[clamp(ty, 0, h - 1) * w + clamp(tx, 0, w - 1)]); hv *= clamp((dm - 0.5) / 5, 0, 1); }
    }
    m.hgt[vz * W1 + vx] = hv;
  }
  // Round 7: a map may reshape its heights (m.hgt: gameplay) and give the renderer its own ground (m.rhgt), e.g.
  // Helheim's flat river and Gjallarbrú's arched deck (js/data/maps.js).
  if (d.heights) d.heights(m, { w, h, W1, rng });
  // Minimap bitmap
  const MINI_T = { [T.LAVA]: [210, 80, 30], [T.WAY]: [255, 150, 60], [T.TREE]: [40, 80, 40], [T.WATER]: [30, 54, 88], [T.ICE]: [168, 206, 232], [T.VOID]: [22, 20, 36], [T.CRYSTAL]: [170, 110, 222], [T.PROP]: [116, 94, 72], [T.GRAVE]: [96, 92, 104] };
  const MINI_S = { 5: [214, 200, 170], 6: [214, 200, 170], [SURF.ICE]: [204, 230, 248], [SURF.MUD]: [96, 84, 54], [SURF.BRIDGE]: [176, 140, 92], [SURF.RAIL]: [132, 120, 108], [SURF.SAND]: [88, 84, 92], [SURF.GOLD]: [232, 192, 84] };
  const mc = document.createElement('canvas'); mc.width = w; mc.height = h; const gc = mc.getContext('2d'); const img = gc.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const t = m.t[i]; const L = d.look, base = L.g2; let c = t === 0 ? [base[0] + 40, base[1] + 40, base[2] + 40].map(v => Math.min(255, v)) : MINI_T[t] || [60, 58, 64];
    if (t === 0 && MINI_S[m.surf[i] || m.deco[i]]) c = MINI_S[m.surf[i] || m.deco[i]];
    img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = 255;
  }
  gc.putImageData(img, 0, 0); m.mini = mc;
  mapCache[id] = m;
  return m;
}
function tileAt(x, y) { x = Math.floor(x); y = Math.floor(y); if (!map || x < 0 || y < 0 || x >= map.w || y >= map.h) return T.WALL; return map.t[y * map.w + x]; }
const blocked = (x, y) => tileAt(x, y) !== 0;
// Movement multiplier of the walkable surface under an entity (SURF_SPEED in js/data/maps.js: mud, ice, snow).
function surfMul(e) { if (!map) return 1; const x = Math.floor(e.x), y = Math.floor(e.y); if (x < 0 || y < 0 || x >= map.w || y >= map.h) return 1; return SURF_SPEED[map.surf[y * map.w + x]] || 1; }
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
/* Perf round 5: A* with reused scratch memory. The old version allocated g (Float32), from (Int32) and closed (Uint8)
   of w*h plus one [f, i] array per heap push on every call (~6 MB/s of garbage in a 150-mob horde). These arrays now
   live in PF, grow to the largest map seen and are never cleared: a generation stamp (seen / closed === gen) replaces
   fill(). g stays Float32 (same rounding), f is a double (like the old heap nodes), the heap is the same algorithm
   (sift-up stops on <=, sift-down takes the strictly smaller child, lazy deletion), the same octile heuristic and the
   same neighbour order, so the returned paths are identical (perf.py pathcheck: old vs new on every map). */
const PF = { n: 0, g: null, from: null, seen: null, closed: null, gen: 0, hf: new Float64Array(4096), hi: new Int32Array(4096), hn: 0 };
function pfPush(f, i) {
  if (PF.hn === PF.hf.length) { const f2 = new Float64Array(PF.hn * 2), i2 = new Int32Array(PF.hn * 2); f2.set(PF.hf); i2.set(PF.hi); PF.hf = f2; PF.hi = i2; }
  const hf = PF.hf, hi = PF.hi; let c = PF.hn++; hf[c] = f; hi[c] = i;
  while (c > 0) { const p = (c - 1) >> 1; if (hf[p] <= hf[c]) break; const tf = hf[p]; hf[p] = hf[c]; hf[c] = tf; const ti = hi[p]; hi[p] = hi[c]; hi[c] = ti; c = p; }
}
function pfPop() {   // the cell index of the top entry
  const hf = PF.hf, hi = PF.hi, top = hi[0], n = --PF.hn;
  if (n > 0) {
    hf[0] = hf[n]; hi[0] = hi[n]; let i = 0;
    for (;;) { const l = 2 * i + 1, r = l + 1; let s = i; if (l < n && hf[l] < hf[s]) s = l; if (r < n && hf[r] < hf[s]) s = r; if (s === i) break;
      const tf = hf[s]; hf[s] = hf[i]; hf[i] = tf; const ti = hi[s]; hi[s] = hi[i]; hi[i] = ti; i = s; }
  }
  return top;
}
function findPath(sx, sy, tx, ty, maxN = 5000) {
  const w = map.w, h = map.h, T = map.t;
  sx = Math.floor(sx); sy = Math.floor(sy); tx = Math.floor(tx); ty = Math.floor(ty);
  if (tx < 0 || ty < 0 || tx >= w || ty >= h || T[ty * w + tx]) return null;
  if (sx === tx && sy === ty) return [];
  const N = w * h;
  if (PF.n < N) { PF.n = N; PF.g = new Float32Array(N); PF.from = new Int32Array(N); PF.seen = new Uint32Array(N); PF.closed = new Uint32Array(N); PF.gen = 0; }
  if (++PF.gen === 0xffffffff) { PF.seen.fill(0); PF.closed.fill(0); PF.gen = 1; }
  const gen = PF.gen, g = PF.g, from = PF.from, seen = PF.seen, closed = PF.closed;
  const s = sy * w + sx; g[s] = 0; from[s] = -1; seen[s] = gen; PF.hn = 0;
  { const dx = Math.abs(sx - tx), dy = Math.abs(sy - ty); pfPush(dx + dy - 0.586 * Math.min(dx, dy), s); }
  let n = 0; const goal = ty * w + tx;
  while (PF.hn && n++ < maxN) {
    const cur = pfPop(); if (closed[cur] === gen) continue; closed[cur] = gen;
    if (cur === goal) { const out = []; let c = cur; while (c !== s && c >= 0) { out.push({ x: c % w + 0.5, y: Math.floor(c / w) + 0.5 }); c = from[c]; } return out.reverse(); }
    const cx = cur % w, cy = (cur / w) | 0, gc = g[cur];
    for (let k = 0; k < 8; k++) {
      const dx = DX[k], dy = DY[k], nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx; if (T[ni] || closed[ni] === gen) continue;
      if (dx && dy && (T[cy * w + nx] || T[ny * w + cx])) continue;
      const ng = gc + (dx && dy ? 1.414 : 1);
      if (seen[ni] !== gen || ng < g[ni]) {   // (the old g was filled with 1e9: an unseen cell always improves)
        seen[ni] = gen; g[ni] = ng; from[ni] = cur;
        const hx = Math.abs(nx - tx), hy = Math.abs(ny - ty); pfPush(ng + (hx + hy - 0.586 * Math.min(hx, hy)), ni);
      }
    }
  }
  return null;
}
/* Perf round 5: chase re-path budget. A horde re-paths every 0.4-0.7 s per mob, and after an aggro wave those A* runs
   bunch into the same ticks. At most PATHB.max A* runs per tick go to chasing mobs that already have a path; a mob over
   the budget keeps walking its current path and asks again next tick (a mob without a path, or next to the hero, is
   never held back; idle wander and return paths are not budgeted). This changes the timing of some re-paths, so the
   game is no longer tick-for-tick identical when it binds (hordes only). window.AOM_PATH_BUDGET = 0 turns it off. */
const PATHB = { t: -1, n: 0, max: typeof window !== 'undefined' && window.AOM_PATH_BUDGET !== undefined ? Math.max(0, +window.AOM_PATH_BUDGET || 0) : 8, deferred: 0, hits: 0 };
function pathBudget() {
  if (!(PATHB.max > 0)) return true;
  if (PATHB.t !== time) { PATHB.t = time; PATHB.n = 0; }
  if (PATHB.n < PATHB.max) { PATHB.n++; return true; }
  PATHB.deferred++; return false;
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
  const d = hyp(x1 - x0, y1 - y0), n = Math.ceil(d * 4), M = map;
  if (!M) { for (let i = 1; i < n; i++) { const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t; if (blocked(x, y) || blocked(x + 0.28, y) || blocked(x - 0.28, y) || blocked(x, y + 0.28) || blocked(x, y - 0.28)) return false; } return true; }
  // perf round 5: the same five probes per step as blocked() (floor, bounds -> wall, tile !== 0), read straight from the map
  const w = M.w, h = M.h, tt = M.t;
  for (let i = 1; i < n; i++) { const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t; if (blk(tt, w, h, x, y) || blk(tt, w, h, x + 0.28, y) || blk(tt, w, h, x - 0.28, y) || blk(tt, w, h, x, y + 0.28) || blk(tt, w, h, x, y - 0.28)) return false; }
  return true;
}
function blk(tt, w, h, x, y) { x = Math.floor(x); y = Math.floor(y); return x < 0 || y < 0 || x >= w || y >= h || tt[y * w + x] !== 0; }

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
    flags: { shards: {}, bosses: {}, lore: { ash: true }, tips: {}, talked: {}, seen: { emberhold: true }, kills: {}, cards: {}, rep: {}, deaths: 0 }, lostZeny: null, uid: 1, playTime: 0, quests: questNewState(),
    titles: [], title: null, ach: {},   // round 4: earned titles (TITLES ids), the one shown under your name, achievements { id: day }
    storage: [], mail: [],              // round 5: shared storage (any storage keeper), mailbox (rewards that did not fit in the bag)
    pet: null, mounted: false,          // round 6: the pet that is out ({ type, name, hunger, intim, t }) and riding a warg
  };
}
/* Dynamic NPCs (round 4). An NPCS entry with `show()` and/or `at()` -> [x, y] | null is placed and moved here
   instead of by genMap: quest givers who appear with the story, escorts' home spots, Odin's new name. */
function npcSync() {
  if (!map || !P) return;
  for (const k in NPCS) {
    const D = NPCS[k]; if (!D.show && !D.at) continue;
    let want = null; try { want = D.map === map.id && (!D.show || D.show()) ? (D.at ? D.at() : [D.x, D.y]) : null; } catch (e) { want = null; }
    const n = map.npcs.find(e => e.id === k && !e.escort && !e.actor);
    if (want && !n) map.npcs.push({ id: k, name: npcName(k), title: D.title, x: want[0], y: want[1], dir: D.dir || 1, look: D.look });
    else if (!want && n) map.npcs.splice(map.npcs.indexOf(n), 1);
    else if (want && n && (n.x !== want[0] || n.y !== want[1])) { n.x = want[0]; n.y = want[1]; n.path = null; }
  }
  for (const n of map.npcs) { const D = NPCS[n.id]; if (D && D.nameFn) { n.name = npcName(n.id); n.title = D.titleFn ? D.titleFn() : n.title; } }
}
function npcName(k) { const D = NPCS[k]; return D ? (D.nameFn ? D.nameFn() : D.name) : k; }
function resetRuntime() {
  Object.assign(P, { stamina: 100, stamT: 0, iframes: 0, dodgeT: 0, blocking: false, blockStart: 0, combo: 0, comboT: 0, swingT: 0, queued: null, charge: -1, fx: 1, fy: 0.35, path: null, target: null, goal: null, atkCD: 0, castT: 0, castMax: 0, casting: null, pending: null, cd: {}, buffs: {}, spheres: 0, reviveCD: 0, dash: null, procCD: 0, dir: 1, walk: 0, moving: false, atkAnim: -1, dead: false, sitting: false, hurtT: 0, hpT: 0, spT: 0, potCD: 0, deadT: 0, kind: 'player' });
}
function refineAtk(t) { return t.lvl < 10 ? 2 : t.lvl < 20 ? 3 : 5; }
// Base numbers of a piece of gear with its crafted quality (it.q, QUALITY in js/data/recipes.js) and refine level.
function itemBase(it) {
  const t = ITEMS[it.id], qm = it.q && QUALITY[it.q] ? QUALITY[it.q].mul : 1, r = it.refine || 0;
  if (t.slot === 'weapon') return { atk: Math.round(t.atk * qm) + r * refineAtk(t), matk: Math.round((t.matk || 0) * qm) + (MAGICWEAPON.includes(t.wtype) ? r * 3 : 0), def: 0, mdef: 0 };
  return { atk: 0, matk: 0, def: Math.round((t.def || 0) * qm) + r, mdef: Math.round((t.mdef || 0) * qm) };
}
function calcStats() {
  const b = { str: 0, agi: 0, vit: 0, int: 0, dex: 0, luk: 0, atk: 0, matk: 0, def: 0, mdef: 0, hit: 0, flee: 0, crit: 0, aspd: 0, leech: 0, maxhp: 0, maxsp: 0, maxhpPct: 0, dmgRed: 0, move: 0 };
  const add = o => { if (o) for (const k in o) b[k] = (b[k] || 0) + o[k]; };
  let watk = 0, wmatk = 0, wtype = 'fist', def = 0, mdef = 0;
  for (const s of SLOTS) {
    const it = P.equip[s]; if (!it) continue; const t = ITEMS[it.id];
    add(t.bonus); for (const a of it.affixes || []) b[a.s] = (b[a.s] || 0) + a.v; for (const c of it.cards || []) add(ITEMS[c].bonus);
    const ib = itemBase(it);
    if (s === 'weapon') { wtype = t.wtype; watk = ib.atk; wmatk = ib.matk; }
    else { def += ib.def; mdef += ib.mdef; }
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
  // Round 6: warg riding (Ash Knight / Rune Jarl), Rune Jarl's Warg Riding, Fenris Stalker's Wolf's Instinct, the pet's bonus.
  if (P.mounted && !MOUNT_CLASSES.includes(P.cls)) P.mounted = false;
  if (P.mounted) { b.move += MOUNT_SPEED; const wm = sk.warg_mastery || 0; b.atk += wm * 3; b.aspd += wm * 2; b.hit += wm * 2; if (wtype === 'spear') b.atk += sk.spear_mastery || 0; }
  if (wtype === 'bow') { b.atk += (sk.wolf_instinct || 0) * 3; b.crit += (sk.wolf_instinct || 0) * 0.5; } else if (wtype === 'dagger') b.aspd += (sk.wolf_instinct || 0) * 2;
  if (P.pet && PETS[P.pet.type] && P.pet.intim >= PET_BONUS_AT) add(PETS[P.pet.type].bonus);
  const st = P.st;
  const str = st.str + b.str, agi = st.agi + b.agi, vit = st.vit + b.vit, int = st.int + b.int, dex = st.dex + b.dex, luk = st.luk + b.luk;
  const lv = P.lvl, C = CLASSES[P.cls];
  const atkStatus = DEXWEAPON.includes(wtype) ? dex + sq(Math.floor(dex / 10)) + Math.floor(str / 5) + Math.floor(luk / 5) : str + sq(Math.floor(str / 10)) + Math.floor(dex / 5) + Math.floor(luk / 5);
  const maxhp = Math.floor((35 + lv * C.hp[0] + lv * lv * C.hp[1]) * (1 + vit / 100) * (1 + b.maxhpPct / 100)) + b.maxhp;
  const maxsp = Math.floor((10 + lv * C.sp) * (1 + int / 100) * (1 + (sk.soul_drain || 0) * 0.02)) + b.maxsp;
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
  else if (!t.nostack) it.qty = o.qty || 1;   // round 6: pet eggs are single items that carry their pet (it.pet)
  return it;
}
let EQUIP_TOP = 0;   // round 7: the highest level of ordinary gear; deeper monsters roll gear at that level
function rollEquip(ilvl) {
  if (!EQUIP_TOP) for (const t of Object.values(ITEMS)) if (t.type === 'equip' && !t.unique && !t.crafted) EQUIP_TOP = Math.max(EQUIP_TOP, t.lvl);
  ilvl = Math.min(ilvl, EQUIP_TOP);
  const pool = Object.values(ITEMS).filter(t => t.type === 'equip' && !t.unique && !t.crafted && t.lvl <= ilvl + 3);
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
  if (it.q > 1 && QUALITY[it.q]) n = QUALITY[it.q].name + ' ' + n;
  if (it.cards && it.cards.length) n = n + ' ✦';
  if (it.refine) n = `+${it.refine} ${n}`;
  if (it.slotsN) n += ` [${it.slotsN}]`;
  return n;
}
const rarityOf = it => { const t = ITEMS[it.id]; return t.type === 'equip' ? it.rarity : t.type === 'card' ? 'card' : t.type === 'key' ? 'key' : 'common'; };
const stackable = id => ITEMS[id].type !== 'equip' && !ITEMS[id].nostack;
function countItem(id) { let n = 0; for (const it of P.inv) if (it.id === id) n += it.qty || 1; return n; }
// Stackables fill their existing stacks up to STACK_MAX (999), then open new ones. When the bag runs out of slots,
// what did fit stays in the bag, `it.qty` keeps the rest and false is returned (callers drop or mail `it`).
function addItem(it, quiet) {
  if (stackable(it.id)) {
    let left = it.qty || 1;
    for (const ex of P.inv) { if (left <= 0) break; if (ex.id === it.id && ex.qty < STACK_MAX) { const k = Math.min(left, STACK_MAX - ex.qty); ex.qty += k; left -= k; } }
    while (left > 0) {
      if (P.inv.length >= BAG_SLOTS) { it.qty = left; UI.dirty = true; if (!quiet) log('Your bag is full.', 'warn'); return false; }
      const n = Math.min(left, STACK_MAX); left -= n;
      if (!left) { it.qty = n; P.inv.push(it); } else P.inv.push({ uid: uidc++, id: it.id, qty: n });
    }
    UI.dirty = true; return true;
  }
  if (P.inv.length >= BAG_SLOTS) { if (!quiet) log('Your bag is full.', 'warn'); return false; }
  P.inv.push(it); UI.dirty = true; return true;
}
// Can n of this item go into the bag right now (existing stacks first)?
function bagRoom(id, n = 1) {
  if (!stackable(id)) return P.inv.length + n <= BAG_SLOTS;
  let free = 0; for (const ex of P.inv) if (ex.id === id) free += STACK_MAX - ex.qty;
  return n <= free + (BAG_SLOTS - P.inv.length) * STACK_MAX;
}
// Takes n across every stack of the item (the last stacks first). False when there is none.
function takeItem(id, n = 1) {
  if (!P.inv.some(x => x.id === id)) return false;
  let left = n;
  for (let i = P.inv.length - 1; i >= 0 && left > 0; i--) { const ex = P.inv[i]; if (ex.id !== id) continue; const k = Math.min(left, ex.qty || 1); ex.qty = (ex.qty || 1) - k; left -= k; if (ex.qty <= 0) P.inv.splice(i, 1); }
  UI.dirty = true; return true;
}
// Removes n of an item: stacks, loose equipment in the bag, then equipped pieces (quest turn-ins, choices).
function removeItems(id, n = 1) {
  if (stackable(id)) { const c = Math.min(n, countItem(id)); if (c) takeItem(id, c); return c; }
  let left = n;
  for (let i = P.inv.length - 1; i >= 0 && left > 0; i--) if (P.inv[i].id === id) { P.inv.splice(i, 1); left--; }
  for (const s of SLOTS) if (left > 0 && P.equip[s] && P.equip[s].id === id) { P.equip[s] = null; left--; calcStats(); }
  UI.dirty = true; return n - left;
}
const hasItem = id => countItem(id) > 0 || SLOTS.some(s => P.equip[s] && P.equip[s].id === id);
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
function unequip(slot) { const it = P.equip[slot]; if (!it) return; if (P.inv.length >= BAG_SLOTS) { log('Your bag is full.', 'warn'); return; } P.equip[slot] = null; P.inv.push(it); Sfx.equip(); calcStats(); }
function useItem(it) {
  const t = ITEMS[it.id];
  if (t.type === 'equip') { equip(it); return; }
  if (t.type === 'card') { UI.socketCard = it.uid; openWin('inv'); UI.dirty = true; return; }
  if (t.type !== 'use' || P.dead) return;
  if (P.potCD > 0) return; P.potCD = 0.25;
  if (t.effect === 'tame') { tameUse(it); return; } if (t.effect === 'egg') { hatchEgg(it); return; } if (t.effect === 'petfood') { petFeed(); return; }   // round 6
  if (t.effect === 'revive') { if (typeof squadLeaf === 'function') squadLeaf(it); else log('Nobody here needs it.', 'sys'); return; }   // cycle 8: Leaf of Yggdrasil
  if (t.buff) { const B = t.buff; addBuff(B.id, B.name, B.icon || 'food', B.secs, B.bonus); if (t.heal) healP(randi(t.heal[0], t.heal[1])); floatText(P, B.name, 'info'); burst(P.x, P.y, 26, t.color || '#ffd070', 10, 1.4); log(`${t.name}: ${Object.entries(B.bonus).map(([k, v]) => bonusLine(k, v)).join(', ')} for ${Math.round(B.secs / 60)} min.`, 'sys'); }
  else if (t.heal) { if (P.hp >= S.maxhp) { log('You are already at full health.', 'sys'); return; } healP(randi(t.heal[0], t.heal[1])); burst(P.x, P.y, 26, '#ff6a6a', 8, 1.2); }
  else if (t.sp) { if (P.sp >= S.maxsp) { log('Your SP is already full.', 'sys'); return; } const a = randi(t.sp[0], t.sp[1]); P.sp = Math.min(S.maxsp, P.sp + a); floatText(P, '+' + a, 'sp'); burst(P.x, P.y, 26, '#6a9aff', 8, 1.2); }
  else if (t.effect === 'full') { P.hp = S.maxhp; P.sp = S.maxsp; pillar(P, '#ffc070'); }
  else if (t.effect === 'fly') { if (map.d.safe) { log('The Waystone’s pull is too strong here.', 'sys'); return; } const s = randomSpot(4); if (!s) return; P.x = s.x; P.y = s.y; stopAll(); snapCam(); Sfx.warp(); burst(P.x, P.y, 20, '#e8e0c8', 16, 2); if (partyN() > 1 && typeof squadArrive === 'function') squadArrive(); }   // cycle 8: the party flies with you
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
// A named variant (MOBS[key].variant): keeps the base type for its sprite sheet and card, uses the variant's data.
function makeVariant(key, x, y) { const V = MOBS[key]; const m = makeMob(V.base, x, y); m.d = V; m.hp = m.maxhp = V.hp; m.variant = key; return m; }
function randomSpot(minFromEntry = 8, rgn) {
  const sz = map.d.safeZone;
  for (let i = 0; i < 400; i++) {
    const x = rgn ? randi(rgn[0], rgn[2]) : randi(2, map.w - 3), y = rgn ? randi(rgn[1], rgn[3]) : randi(2, map.h - 3);
    if (sz && hyp(x + 0.5 - sz.x, y + 0.5 - sz.y) < sz.r + 1) continue;   // round 7: nothing spawns in a safe camp
    if (blocked(x, y) || !map.reach[y * map.w + x]) continue;
    if (hyp(x - map.entry.x, y - map.entry.y) < minFromEntry) continue;
    if (map.way && hyp(x - map.way.x, y - map.way.y) < 7) continue;
    if (map.bossPos && hyp(x - map.bossPos.x, y - map.bossPos.y) < 8) continue;
    return { x: x + 0.5, y: y + 0.5 };
  }
  return null;
}
// Round 7: spawnRgn[type]; cycle 9: a spawns entry may carry its own region ([type, n, [x0, y0, x1, y1]]), kept on the
// monster (m.rgn) so it respawns there (grown maps: the old monsters stay in the old region, new ones in the new).
function spawnMobRandom(type, rgn) { if (!rgn) rgn = map.d.spawnRgn && map.d.spawnRgn[type]; const s = randomSpot(8, rgn || undefined); if (s) { const m = makeMob(type, s.x, s.y); if (rgn) m.rgn = rgn; mobs.push(m); } }
function spawnAll() {
  mobs = [];
  for (const e of map.d.spawns) for (let i = 0; i < e[1]; i++) spawnMobRandom(e[0], e[2]);
  if (map.d.boss && map.bossPos && bossAlive(map.d.boss)) mobs.push(makeMob(map.d.boss, map.bossPos.x, map.bossPos.y));
  if (map.d.elites) for (const e of map.d.elites) if (eliteAlive(e)) { const m = makeVariant(e.key, e.x, e.y); m.caveElite = e.key; mobs.push(m); }   // cycle 9: cave mini-bosses
  if (map.d.deep) deepPopulate();   // round 7: the Deep's floors are filled by their runtime
}
// Cycle 9: a map's elite (a cave's mini-boss, MAPDEFS[id].elites = [{ key, x, y, respawn }]) comes back `respawn` seconds
// of play after it fell (P.flags.elites[key] = playTime of the kill); without `respawn` it stays dead.
function eliteAlive(e) { const t = P.flags.elites && P.flags.elites[e.key]; return t === undefined || (!!e.respawn && P.playTime - t >= e.respawn); }
// Round 7: a slain MVP stays dead, unless it has `respawn` (seconds of play since it fell: P.flags.bossAt).
function bossAlive(k) { if (!P.flags.bosses[k]) return true; const r = MOBS[k] && MOBS[k].respawn, at = P.flags.bossAt && P.flags.bossAt[k]; return !!r && (at === undefined || P.playTime - at >= r); }
/* Perf round 5: spatial grid for mob queries (mobsNear, mobsInCone, nearestMob, traps; softTarget / meleeArc in
   js/action.js). Mobs are bucketed into 4x4-tile cells by a counting sort that keeps index order inside every cell, and
   a query visits the candidate cells' mobs in ascending mobs[] index, i.e. in the original order: the results, and the
   Math.random order of whatever the caller does with them (damage rolls), are identical to the old linear scans. The
   grid is reused while mobs[] is the same array with the same length and every mob is still exactly where it was when
   the grid was built (checked on each query: two compares per mob, much cheaper than the scan's hypot), otherwise it is
   rebuilt, so any code (knockback, pulls, tests, quests) may move a mob. Below MG_MIN mobs the plain scans run.
   window.AOM_MG_CHECK = true runs both and counts mismatches (MG.mismatch; perf.py --mg-check). */
const MG = { C: 4, L: null, n: -1, map: null, gw: 1, gh: 1, start: null, fill: null, list: null, cell: null, px: null, py: null, reach: 0, cand: [], builds: 0, queries: 0, mismatch: 0,
  check: typeof window !== 'undefined' && window.AOM_MG_CHECK === true };
const MG_MIN = typeof window !== 'undefined' && window.AOM_MG_MIN > 0 ? +window.AOM_MG_MIN : 32;   // (window.AOM_MG_MIN = 1e9: plain scans everywhere)
const mgCmp = (a, b) => a - b;
function mgCell(v, n) { v /= 4; return v >= 1 ? (v < n ? v | 0 : n - 1) : 0; }   // monotone, NaN -> 0
function mobGrid() {
  const L = mobs, n = L.length;
  if (MG.L === L && MG.n === n && MG.map === map) {
    const px = MG.px, py = MG.py; let i = 0;
    for (; i < n; i++) { const m = L[i]; if (m.x !== px[i] || m.y !== py[i]) break; }
    if (i === n) return MG;
  }
  MG.builds++; MG.L = L; MG.n = n; MG.map = map;
  const gw = Math.max(1, Math.ceil((map ? map.w : 64) / 4)), gh = Math.max(1, Math.ceil((map ? map.h : 64) / 4)), nc = gw * gh; MG.gw = gw; MG.gh = gh;
  if (!MG.start || MG.start.length < nc + 1) { MG.start = new Int32Array(nc + 1); MG.fill = new Int32Array(nc); }
  if (!MG.list || MG.list.length < n) { const cap = Math.max(64, n * 2); MG.list = new Int32Array(cap); MG.cell = new Int32Array(cap); MG.px = new Float64Array(cap); MG.py = new Float64Array(cap); }
  const st = MG.start, fl = MG.fill, cell = MG.cell, px = MG.px, py = MG.py, list = MG.list; st.fill(0, 0, nc + 1);
  let reach = 0;
  for (let i = 0; i < n; i++) {
    const m = L[i], x = m.x, y = m.y; px[i] = x; py[i] = y; const c = mgCell(y, gh) * gw + mgCell(x, gw); cell[i] = c; st[c + 1]++;
    const d = m.d, rb = d ? (d.size || (d.look && d.look.scale) || 1) * 0.35 : 0; if (rb > reach) reach = rb;   // the size bonus of mobsInCone / meleeArc
  }
  MG.reach = reach;
  for (let c = 0; c < nc; c++) { st[c + 1] += st[c]; fl[c] = st[c]; }
  for (let i = 0; i < n; i++) list[fl[cell[i]]++] = i;
  return MG;
}
// Indices (into mobs) of every mob whose cell overlaps the square of half-size r around (x, y), ascending. The returned
// array is shared: consume it before calling anything that could query again (or copy it).
function mobsNearIdx(x, y, r, sized) {   // sized: widen by the largest mob's size bonus (built with the grid)
  const G = mobGrid(), out = G.cand, gw = G.gw, st = G.start, list = G.list; out.length = 0; G.queries++; if (sized) r += G.reach;
  const x0 = mgCell(x - r, gw), x1 = mgCell(x + r, gw), y0 = mgCell(y - r, G.gh), y1 = mgCell(y + r, G.gh);
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) { const c = cy * gw + cx; for (let k = st[c], e = st[c + 1]; k < e; k++) out.push(list[k]); }
  if (out.length > 1) out.sort(mgCmp);
  return out;
}
function mgMismatch(a, b) { if (a === b) return; if (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i])) return; MG.mismatch++; }
function mobsNearScan(x, y, r) { return mobs.filter(m => !m.dead && hyp(m.x - x, m.y - y) <= r); }
function mobsNearGrid(x, y, r) {
  const idx = mobsNearIdx(x, y, r), L = mobs, out = [];
  for (let k = 0; k < idx.length; k++) { const m = L[idx[k]]; if (!m.dead && hyp(m.x - x, m.y - y) <= r) out.push(m); }
  return out;
}
const mobsNear = (x, y, r) => {
  if (mobs.length < MG_MIN) return mobsNearScan(x, y, r);
  if (MG.check) { const a = mobsNearScan(x, y, r); mgMismatch(a, mobsNearGrid(x, y, r)); return a; }
  return mobsNearGrid(x, y, r);
};
const mobElem = m => m.frozen > 0 ? 'water' : m.d.elem;
const isUndeadish = m => m.d.elem === 'undead' || m.d.race === 'undead' || m.d.race === 'demon';
function after(t, fn) { timers.push({ t, fn, h: P }); }   // cycle 8: h = the hero whose context it fires in

/* =========================================================
   Combat
   ========================================================= */
const hitChance = (hit, flee, max) => clamp(80 + hit - flee, 5, max);
const mobFlee = m => Math.floor((m.d.lvl * 1.4 + 5 + (m.d.flee || 0)) * (m.slow > 0 ? 1 - 0.1 * (m.slowLv || 1) : 1));
const mobDef = m => m.d.def * (m.dispel > 0 ? 0.5 : 1), mobMdef = m => m.d.mdef * (m.dispel > 0 ? 0.5 : 1);
const mobHitStat = m => m.d.lvl * 2 + 12;
function aggro(m) {
  if (m.dead || m.d.inert) return;
  if (m.state !== 'chase') { m.state = 'chase'; m.repath = 0; }
  if (PARTY && PARTY.members.length > 1 && (!m.target || m.target.dead || !inParty(m.target))) m.target = P;   // cycle 8: whoever woke it
  if ((m.d.boss || m.d.elite) && !m.announced) announceBoss(m);
}
/* Cycle 8: monster targeting in a party. m.target is the hero a monster hunts (solo: always P). Damage builds threat
   per hero (m.thr, tanks x1.6); every 0.5 s a monster takes the living hero with the most threat (10 % stickiness),
   the nearest one when nobody has hurt it yet, or its taunter while a taunt lasts (m.taunt = { h, t }). */
function threatAdd(m, h, v) {
  const thr = m.thr || (m.thr = {}), k = h.id || 'hero';
  thr[k] = (thr[k] || 0) + v * (h.ai && h.ai.role === 'tank' ? 1.6 : 1);
  if (h.kind === 'player') { h.lastHitM = m; h.lastHitT = time; }
}
function mobTarget(m) {
  const L = PARTY.members, tn = m.taunt;
  if (tn && tn.t > time && !tn.h.dead && L.indexOf(tn.h) >= 0) return (m.target = tn.h);
  let t = m.target;
  if (t && !t.dead && L.indexOf(t) >= 0 && (m.tgtT || 0) > time) return t;
  m.tgtT = time + 0.5;
  let best = null, bv = -1, near = null, nd = 1e9;
  for (const h of L) {
    if (h.dead) continue;
    const d = hyp(h.x - m.x, h.y - m.y); if (d < nd) { nd = d; near = h; }
    const v = m.thr ? (m.thr[h.id || 'hero'] || 0) * (h === t ? 1.1 : 1) : 0; if (v > bv) { bv = v; best = h; }
  }
  if (!near) return (m.target = t && L.indexOf(t) >= 0 ? t : P);   // everyone is down: the monster goes home
  if (m.state !== 'chase' || !(bv > 0)) return (m.target = near);
  return (m.target = best);
}
// Where a monster aims its abilities (rain, leaps, cones, lunges, curses): its target, else the controlled hero.
const mobAim = m => PARTY && PARTY.members.length > 1 && m.target && !m.target.dead && PARTY.members.indexOf(m.target) >= 0 ? m.target : P;
// Perf round 5: the hit functions only read their options; callers that pass none share one frozen empty object
// instead of allocating {} per blow.
const NOOPT = Object.freeze({});
function physHit(m, mul, o = NOOPT) {
  if (!m || m.dead || m.d.inert) return;
  if (m.gnaw) { aggro(m); floatText(m, 'Immune', 'miss'); return; }   // round 7: Níðhöggr feeding on the root
  aggro(m);
  const crit = !o.sure && Math.random() * 100 < S.crit + (o.crit || 0);
  if (!crit && !o.sure && !(m.mark > 0) && Math.random() * 100 >= hitChance(S.hit + (o.hit || 0), mobFlee(m), 100)) { floatText(m, 'Miss', 'miss'); Sfx.miss(); return; }
  let atk = S.atkStatus + S.watk * rand(0.8, 1) + S.atkBonus;
  if (isUndeadish(m)) atk += (P.skills.demon_bane || 0) * 3;
  if (m.d.race === 'brute' || m.d.race === 'insect') atk += (P.skills.beast_bane || 0) * 4;
  let dmg = atk * mul * elemMod(o.elem || S.welem, mobElem(m));
  if (crit) dmg *= 1.4; else if (!o.ignoreDef) dmg = dmg * (100 - mobDef(m)) / 100 - Math.floor(m.d.lvl / 2);
  m.lastMagic = false;
  finishHit(m, dmg, crit, o);
}
function magicHit(m, mul, el, o = NOOPT) {
  if (!m || m.dead || m.d.inert) return;
  if (m.gnaw) { aggro(m); floatText(m, 'Immune', 'miss'); return; }   // round 7: Níðhöggr feeding on the root
  aggro(m);
  let dmg = rand(S.matkMin, S.matkMax) * mul * elemMod(el, mobElem(m));
  if (o.undeadBonus && isUndeadish(m)) dmg *= 1 + o.undeadBonus;
  if (S.endowAmp && el === S.welem) dmg *= 1 + S.endowAmp / 100; // Sage endows boost spells of the same element
  dmg = dmg * (100 - mobMdef(m)) / 100;
  m.lastMagic = true;
  finishHit(m, dmg, false, o);
}
// Flat damage that ignores DEF/MDEF but not elements (traps, the raven, Sanctuary, Oath of Tyr).
function trueHit(m, dmg, el, o = NOOPT) {
  if (!m || m.dead || m.d.inert) return;
  if (m.gnaw) { aggro(m); floatText(m, 'Immune', 'miss'); return; }   // round 7: Níðhöggr feeding on the root
  aggro(m); m.lastMagic = false;
  finishHit(m, dmg * elemMod(el || 'neutral', mobElem(m)), false, o);
}
function finishHit(m, dmg, crit, o) {
  if (m.mark > 0 && dmg > 0) dmg *= 1 + (m.markAmp || 0) / 100;
  if (m.lex && dmg > 0) { dmg *= 2; m.lex = false; floatText(m, 'Lex!', 'info'); }
  dmg = dmg <= 0 ? 0 : Math.max(1, Math.round(dmg));
  m.hp -= dmg; m.hitFlash = 0.22; fxs.push({ k: 'spark', x: m.x, y: m.y, h: chestH(m), t: 0, dur: 0.2, crit });
  if (PARTY && PARTY.members.length > 1 && P) threatAdd(m, P, dmg);   // cycle 8: the hero in context dealt it
  floatText(m, dmg, crit ? 'crit' : 'dmg');
  if (S.leech && dmg > 0) healP(dmg * S.leech / 100, true);
  if (o.knock && !m.d.boss) knock(m, o.from || P, o.knock);
  if (m.frozen > 0 && dmg > 0 && Math.random() < 0.3) m.frozen = 0;
  crit ? Sfx.crit() : Sfx.hit();
  if (m.hp <= 0) killMob(m);
}
function knock(m, from, n) {
  const dx = m.x - from.x, dy = m.y - from.y, d = hyp(dx, dy) || 1, ux = dx / d, uy = dy / d;
  for (let i = 0; i < n * 4; i++) { const nx = m.x + ux * 0.25, ny = m.y + uy * 0.25; if (blocked(nx, ny)) break; m.x = nx; m.y = ny; }
  m.path = null;
}
// h (cycle 8): the hero struck (default: the hero in context, i.e. P). It runs in that hero's context.
function mobStrike(m, mul = 1, o = NOOPT, h) {
  if (h && h !== P) return withHero(h, mobStrike, m, mul, o);
  if (P.dead) return;
  if (P.iframes > 0) { floatText(P, 'Dodge', 'miss'); return; }
  let guard = 1;
  if (P.blocking && !P.dodgeT && !o.unblockable) {   // round 7: unblockable blasts ignore the guard (dodge them)
    const dx = m.x - P.x, dy = m.y - P.y, d = hyp(dx, dy) || 1;
    if ((dx * P.fx + dy * P.fy) / d > -0.2) {
      if (time - P.blockStart < 0.2) { floatText(P, 'Parry!', 'crit'); Sfx.crit(); m.stun = o.parry ? Math.max(m.stun || 0, o.parry) : m.d.boss ? 0.7 : 1.4; if (o.parry) parryStagger(m, o.parry); m.atkAnim = -1; fxs.push({ k: 'spark', x: P.x, y: P.y, h: chestH(P), t: 0, dur: 0.3, crit: true }); P.stamina = Math.min(100, P.stamina + 15); return; }
      P.stamina -= 12 * mul; if (P.stamina > 0) { guard = o.magic ? 0.5 : 0.25; floatText(P, 'Block', 'info'); Sfx.equip(); } else { P.stamina = 0; P.blocking = false; floatText(P, 'Guard Break', 'miss'); }
    }
  }
  const bs = P.buffs.bladestop;   // round 6: Berserkr's Blade Stop catches one melee blow
  if (bs && !o.magic && !m.d.ranged) { delete P.buffs.bladestop; renderBuffs(); m.stun = Math.max(m.stun || 0, m.d.boss ? 0.8 : 2 + 0.5 * bs.bladestop); m.atkAnim = -1; floatText(P, 'Blade Stop!', 'crit'); ring(P.x, P.y, 1.1, '#9fd0ff'); fxs.push({ k: 'spark', x: P.x, y: P.y, h: chestH(P), t: 0, dur: 0.3, crit: true }); setSpheres((P.spheres || 0) + 1); Sfx.crit(); return; }
  const ag = P.buffs.autoguard;
  if (ag && P.equip.shield && !o.magic && Math.random() * 100 < ag.guard) { floatText(P, 'Auto Guard', 'info'); Sfx.equip(); fxs.push({ k: 'spark', x: P.x, y: P.y, h: chestH(P), t: 0, dur: 0.25, crit: true }); return; }
  if (!o.sure && Math.random() * 100 >= hitChance(mobHitStat(m), S.flee, 95)) { floatText(P, 'Miss', 'miss'); return; }
  let raw = rand(m.d.atk[0], m.d.atk[1]) * mul * (m.weak > 0 ? 1 - (m.weakAmt || 0) / 100 : 1);   // round 6: weakened (Seiðr Hex, Muspel's Vulcan, the Wolf card)
  if (o.magic) raw *= (100 - Math.min(S.mdef, 80)) / 100; else raw = raw * (100 - Math.min(S.def, 85)) / 100 - S.softDef;
  if (isUndeadish(m)) raw -= (P.skills.divine_protection || 0) * 3;
  raw *= (1 - Math.min(S.dmgRed, 60) / 100) * guard;
  let d = Math.max(1, Math.round(raw));
  const mr = P.buffs.mrod;
  if (mr && o.magic) { const g = Math.round(d * mr.absorb / 100); P.sp = Math.min(S.maxsp, P.sp + g); floatText(P, 'Absorbed +' + g, 'sp'); ring(P.x, P.y, 1.2, '#c8a8ff'); Sfx.cast(); return; }
  d = shieldHit(d, m);
  if (d > 0) { hurtP(d); if (m.d.hitFx && !P.dead) hitFx(m.d.hitFx, m); }   // round 7: chill / hex / rot / stagger
}
// Kyrie Eleison and Oath of Tyr soak part of a blow before it reaches HP. Returns what is left.
function shieldHit(d, m) {
  const k = P.buffs.kyrie;
  if (k) {
    const a = Math.min(d, k.shield); k.shield -= a; k.hits--; d -= a; floatText(P, d > 0 ? 'Kyrie breaks' : 'Kyrie', 'info');
    if (k.shield <= 0 || k.hits <= 0) { delete P.buffs.kyrie; renderBuffs(); hlog('Kyrie Eleison shatters.', 'sys'); burst(P.x, P.y, 30, '#fff2b8', 16, 2.5); }
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
  const ec = P.buffs.einherjar;   // round 6: Einherjar's Call carries you back once, whatever Resurrection's cooldown
  if (ec && ec.revive) { delete P.buffs.einherjar; calcStats(); renderBuffs(); P.hp = Math.max(1, Math.round(S.maxhp * ec.revive)); P.iframes = 1.5; pillar(P, '#ffe8a0', true); burst(P.x, P.y, 40, '#fff6d8', 30, 3); if (!HCTX.quiet) banner('Einherjar’s Call', 'The fallen lift you back to your feet', 'band gold'); floatText(P, 'Einherjar!', 'lvl'); log(HCTX.quiet ? `The einherjar lift ${P.name} back to their feet.` : 'The einherjar you called lift you back to your feet.', 'lvl'); Sfx.level(); return true; }
  const lv = P.skills.resurrection || 0; if (!lv || P.reviveCD > 0) return false;
  P.hp = Math.max(1, Math.round(S.maxhp * [0.1, 0.3, 0.5, 0.8][lv - 1])); P.reviveCD = 240 - 30 * lv; P.iframes = 1.5;
  pillar(P, '#fff2b8', true); burst(P.x, P.y, 40, '#ffffff', 30, 3); if (!HCTX.quiet) banner('Resurrection', 'The Valkyrie will not carry you yet', 'band gold');
  floatText(P, 'Resurrection!', 'lvl'); log(HCTX.quiet ? `A Valkyrie refuses to carry ${P.name}. They rise.` : 'A Valkyrie refuses to carry you. You rise.', 'lvl'); Sfx.level();
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
  const mr = P.buffs.martyr;   // round 6: Tyr's Sacrifice
  if (mr && mr.count > 0) { const cost = S.maxhp * 0.09; if (P.hp > cost + 1) { P.hp -= cost; floatText(P, Math.round(cost), 'hurt'); trueHit(t, S.maxhp * (0.09 + 0.03 * mr.martyr), 'holy'); pillar(t, '#ffb0a0'); } if (--mr.count <= 0) { delete P.buffs.martyr; renderBuffs(); } }
  const vs = P.buffs.sight;   // round 6: Völva's Sight casts a known bolt for free
  if (vs && !t.dead && Math.random() * 100 < 6 + 3 * vs.sight) { const known = ['fire_bolt', 'cold_bolt', 'lightning_bolt'].filter(k => P.skills[k]); if (known.length) { const k = pick(known), el = SKILLS[k].el; floatText(P, SKILLS[k].name + '!', 'skill'); bolts(t, Math.min(P.skills[k], 2 * vs.sight), el, 1); } }
  const ta = P.skills.triple_attack || 0;
  if (ta && S.wtype !== 'bow' && P.procCD <= 0 && Math.random() * 100 < 30 - ta) {
    P.procCD = 0.4; floatText(P, 'Triple Attack!', 'skill');
    for (let i = 0; i < 3; i++) after(0.12 + i * 0.1, () => { if (!t.dead) { physHit(t, (1 + 0.2 * ta) / 3); burst(t.x, t.y, 26, '#ffe0b0', 5, 2); } });
  }
}
// Huginn dives at a target n times (Blitz Beat). Ignores DEF.
function raven(t, n) {
  if (HUG.c && hugHome()) { huginnDive(t, n, blitzDmg(P.skills.blitz_beat || 1)); floatText(P, 'Huginn!', 'info'); Sfx.bow(); return; }   // round 6: the companion raven dives itself
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
function shot(from, to, kind, onHit, o = {}) { projs.push({ x: from.x, y: from.y, zu: o.zu !== undefined ? o.zu : chestH(from), to, kind, onHit, spd: o.spd || (kind === 'arrow' ? 17 : 12), t: 0, vx: 0, vy: 0, vz: 0, h: P }); }   // cycle 8: h = the hero whose context onHit runs in
function killMob(m) {
  m.dead = true; m.deathT = 0; m.hp = 0; m.path = null;
  const d = m.d;
  let b = mobExp(d), j = Math.round(b * 0.75);
  const share = PARTY && PARTY.members.length > 1 && typeof squadExp === 'function';   // cycle 8: shared EXP (per-hero level penalty there)
  if (!share && P.lvl - d.lvl > 10) { b = Math.ceil(b * 0.25); j = Math.ceil(j * 0.25); }
  if (m.summoned) { b = Math.ceil(b * 0.3); j = Math.ceil(j * 0.3); }
  if (map && map.d.deep && deepHas('soul_rich')) { b = Math.round(b * 1.5); j = Math.round(j * 1.5); }   // round 7: a Soul-Rich floor
  if (share) squadExp(m, b, j); else gainExp(b, j);
  if (m.lastMagic && P.skills.soul_drain) { const g = Math.round(d.lvl * (1 + 0.4 * P.skills.soul_drain)); P.sp = Math.min(S.maxsp, P.sp + g); floatText(P, '+' + g, 'sp'); }   // round 6: Soul Drain
  for (const [id, ch] of d.drops || []) if (Math.random() < ch) dropItem(makeItem(id), m);
  // Round 5 economy pass: zeny grows a little faster than linearly with level (see docs/CONTENT.md, economy table).
  if (Math.random() < (d.boss ? 1 : 0.6)) dropZeny(Math.round(((10 + d.lvl * 4 + d.lvl * d.lvl * 0.04) * rand(0.6, 1.4) + (d.boss ? d.lvl * 60 : 0)) * (map && map.d.deep && deepHas('gilded') ? 2 : 1)), m);
  if (ITEMS['c_' + m.type] && Math.random() < (m.rush ? 0.02 : m.deep && d.boss ? 0.06 : d.boss ? 0.25 : d.elite ? 0.1 : 0.012)) dropItem(makeItem('c_' + m.type), m);   // round 7: scaled copies drop their card rarely
  if (!m.rush && Math.random() < (d.boss ? 1 : 0.07)) dropItem(rollEquip(Math.min(99, d.lvl)), m);
  for (const qi of questDropsFor(m)) dropItem(makeItem(qi), m);
  burst(m.x, m.y, d.h * 0.5, d.col || (d.look && d.look.body) || '#888', 14, 2.2);
  const K = P.flags.kills = P.flags.kills || {}; K[m.type] = (K[m.type] || 0) + 1; if (m.variant && m.variant !== m.type) K[m.variant] = (K[m.variant] || 0) + 1;
  if (m.caveElite) (P.flags.elites = P.flags.elites || {})[m.caveElite] = P.playTime;   // cycle 9
  if (d.boss) bossDefeated(m);
  else if (d.elite) { if (bossShown === m) { $('bossbar').hidden = true; bossShown = null; } banner(d.name, 'has fallen', 'band'); Sfx.victory(); }
  else if (!m.summoned && !m.variant && !m.deep && !m.rush) { const type = m.type, mid = map.id, rg = m.rgn; after(rand(10, 18), () => { if (map.id === mid) spawnMobRandom(type, rg); }); }
  if (m.deep) deepKilled(m);   // round 7: floor progress, the warden, the way down
  questEvent('kill', m);
  if (P.target === m) P.target = null;
  Sfx.kill();
}
function gainExp(b, j) {
  const cap = maxLv();   // round 7: 60, or 99 once reborn
  if (P.lvl < cap) {
    P.exp += b; let up = false;
    while (P.lvl < cap && P.exp >= expNeed(P.lvl)) { P.exp -= expNeed(P.lvl); P.lvl++; P.statPts += Math.floor(P.lvl / 5) + 3; up = true; }
    if (P.lvl >= cap) P.exp = 0;
    if (up) { calcStats(); P.hp = S.maxhp; P.sp = S.maxsp; pillar(P, '#ffd76a', true); floatText(P, 'Level Up!', 'lvl'); log(HCTX.quiet ? `${P.name} reaches base level ${P.lvl}.` : `Base level ${P.lvl}. You feel the Ash give way.`, 'lvl'); Sfx.level(); squadEmit('level_up', { hero: P }); }
  }
  const jcap = CLASSES[P.cls].maxJob;
  if (P.jlvl < jcap) {
    P.jexp += j; let up = false;
    while (P.jlvl < jcap && P.jexp >= jexpNeed(P.jlvl)) { P.jexp -= jexpNeed(P.jlvl); P.jlvl++; P.skillPts++; up = true; }
    if (P.jlvl >= jcap) P.jexp = 0;
    if (up) { const h = P; pillar(P, '#7fe0d4', true); after(0.35, () => floatText(h, 'Job Level Up!', 'job')); hlog(`Job level ${P.jlvl}. You have a skill point to spend.`, 'lvl'); Sfx.level(); }
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
  if (r === 'card' && ITEMS[d.item.id].mob) { P.flags.cards = P.flags.cards || {}; P.flags.cards[ITEMS[d.item.id].mob] = true; }
  log(`You got ${itemName(d.item)}${d.item.qty > 1 ? ' ×' + d.item.qty : ''}.`, r === 'common' ? 'loot' : r);
  Sfx.pickup(); drops.splice(drops.indexOf(d), 1);
  if (r === 'unique' || r === 'card') squadEmit('loot_rare', { item: d.item });
  questEvent('pickup', d.item.id);
}
// Cycle 8: events for the squad chat and UI (js/squad.js squadDispatch rate-limits them and calls squadEvent /
// SQUAD_CHAT.event). Only a party with companions has anyone to talk: solo play emits nothing.
function squadEmit(type, data) { if (PARTY && PARTY.members.length > 1 && typeof squadDispatch === 'function') squadDispatch(type, data); }
// Heal another hero (in that hero's context: its Max HP, its float text).
function healHero(h, a, quiet) { if (h && !h.dead) withHero(h, healP, a, quiet); }
// extra: special buff fields read by the engine, e.g. { endow, guard, share, shield, hits, absorb, regen, song,
// castCut, cdCut, wtype, aura: { r, col, bubble }, every, onTick, count }. Buffs are runtime only (not saved).
function addBuff(id, name, icon, t, bonus, extra) { P.buffs[id] = Object.assign({ name, icon, t, max: t, bonus: bonus || {} }, extra || {}); calcStats(); renderBuffs(); }
function songStart(id, name, icon, t, bonus, extra) {
  // Round 6: Harmonize lets two songs play at once (the oldest other song ends).
  const others = Object.keys(P.buffs).filter(k => P.buffs[k].song && k !== id), keep = P.buffs.harmonize ? 1 : 0;
  others.sort((a, b) => P.buffs[b].t - P.buffs[a].t); for (const k of others.slice(keep)) delete P.buffs[k];
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
function zoneAdd(o) { const z = Object.assign({ t: 0, every: 0, col: '#ffffff', h: P }, o); z.next = o.first || 0; zones.push(z); return z; }   // cycle 8: z.h = the hero who made it
// Traps: triggered by the first enemy that steps within r. At most 4 at a time (the oldest goes).
function trapAdd(pos, rune, col, onTrigger) {
  let x = pos.x, y = pos.y; if (blocked(x, y) || dist(P, pos) > 4) { x = P.x + (P.fx || 0) * 0.8; y = P.y + (P.fy || 0) * 0.8; if (blocked(x, y)) { x = P.x; y = P.y; } }
  const traps = zones.filter(z => z.trap); if (traps.length >= 4) zones.splice(zones.indexOf(traps[0]), 1);
  zoneAdd({ trap: true, x, y, r: 0.85, dur: 60, col, rune, onTrigger, arm: 0.4 });
  burst(x, y, 4, col, 8, 1.2); Sfx.equip();
}
const wardAt = (x, y) => zones.some(z => z.ward && hyp(z.x - x, z.y - y) <= z.r);
function updateZones(dt) {
  for (let i = zones.length - 1; i >= 0; i--) {
    const z = zones[i]; z.t += dt;
    const own = PARTY && z.h && !z.hostile ? z.h : P;   // cycle 8: a hero's zone follows / ticks for that hero
    if (z.follow) { z.x = own.x; z.y = own.y; }
    if (z.trap) {
      if (z.t > z.dur) { rmAt(zones, i); continue; }
      if (z.t < z.arm) continue;
      const m = trapVictim(z);
      if (m) { rmAt(zones, i); floatText(m, 'Trap!', 'info'); if (own !== P) asOwner(own, () => z.onTrigger(m, z)); else z.onTrigger(m, z); }
      continue;
    }
    if (z.every > 0) while (z.t >= z.next && z.next < z.dur) { z.next += z.every; try { if (own !== P) asOwner(own, z.tick, z); else z.tick(z); } catch (e) { console.error(e); } }
    if (z.t >= z.dur) { rmAt(zones, i); if (z.end) { if (own !== P) asOwner(own, z.end, z); else z.end(z); } }
  }
}
// The first mob (in mobs[] order) inside a trap's trigger radius (perf round 5: grid candidates, same answer).
function trapVictim(z) {
  const R = z.r + 0.25, hit = e => !e.dead && hyp(e.x - z.x, e.y - z.y) <= R;
  if (mobs.length < MG_MIN) return mobs.find(hit);
  const scan = MG.check ? mobs.find(hit) : null;
  const idx = mobsNearIdx(z.x, z.y, R), L = mobs; let m;
  for (let k = 0; k < idx.length; k++) if (hit(L[idx[k]])) { m = L[idx[k]]; break; }
  if (MG.check) { mgMismatch(scan, m); return scan; }
  return m;
}
function mobsInCone(x, y, fx, fy, r, cone) {
  const hit = m => { if (m.dead) return false; const dx = m.x - x, dy = m.y - y, d = hyp(dx, dy), rr = r + (m.d.size || (m.d.look && m.d.look.scale) || 1) * 0.35; if (d > rr) return false; return d < 0.4 || (dx * fx + dy * fy) / d >= cone; };
  if (mobs.length < MG_MIN) return mobs.filter(hit);   // perf round 5: grid candidates in mobs[] order (see mobsNearIdx)
  const scan = MG.check ? mobs.filter(hit) : null;
  const idx = mobsNearIdx(x, y, r, true), L = mobs, out = [];
  for (let k = 0; k < idx.length; k++) { const m = L[idx[k]]; if (hit(m)) out.push(m); }
  if (scan) { mgMismatch(scan, out); return scan; }
  return out;
}
function freezeMob(m, secs) {
  if (m.dead || m.d.boss || m.d.elem === 'undead') { if (!m.dead) floatText(m, 'Resist', 'miss'); return false; }
  m.frozen = secs; m.path = null; floatText(m, 'Frozen', 'info'); return true;
}
function snareMob(m, secs) { if (m.dead) return; m.snare = Math.max(m.snare || 0, secs); m.path = null; floatText(m, 'Snared', 'info'); aggro(m); }
function markMob(m, secs, amp) { if (m.dead) return; m.mark = secs; m.markAmp = amp; floatText(m, 'Marked', 'info'); }
// Dash the player toward (x, y): at most maxD cells, stopping `stop` cells short. Invulnerable while moving.
function dashTo(x, y, maxD, stop, blink, onEnd) {
  const dx = x - P.x, dy = y - P.y, d = hyp(dx, dy); if (d < 0.05) { if (onEnd) onEnd(); return; }
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
  // Round 6: a reborn class wakes the remembered skills (P.flags.reborn.skills) and every skill of its chain.
  if (C.tier === 3) { const mem = (P.flags.reborn && P.flags.reborn.skills) || {}; for (const k in mem) if (SKILLS[k]) P.skills[k] = Math.max(P.skills[k] || 0, mem[k]); for (const c of classChain(cls)) for (const s of CLASSES[c].skills) P.skills[s] = P.skills[s] || 0; }
  if (P.mounted && !MOUNT_CLASSES.includes(cls)) P.mounted = false;
  const gifts = [].concat(C.starter || [], C.gifts || []), got = [];
  for (const id of gifts) {
    const it = makeItem(id); if (!addItem(it, true)) { mailItem(it, 'Vidar'); continue; } got.push(ITEMS[id].name);
    // Equip the gift unless you already hold something better that the new class can still use.
    const t = ITEMS[id], cur = P.equip[t.slot], ct = cur && ITEMS[cur.id];
    const power = (tt, r) => tt.slot === 'weapon' ? tt.atk + (tt.matk || 0) + (r || 0) * refineAtk(tt) : (tt.def || 0) + (tt.mdef || 0) + (r || 0);
    if (canEquip(it) === null && (!cur || !jobOk(ct, cls) || power(t, 0) >= power(ct, cur.refine))) equip(it);
  }
  calcStats(); P.hp = S.maxhp; P.sp = S.maxsp;
  pillar(P, '#f0d070', true); burst(P.x, P.y, 40, '#ffe8a0', 40, 3); banner(C.name, C.tier === 3 ? 'The path remembers you' : C.tier >= 2 ? 'A second path' : 'A path chosen', 'band gold'); Sfx.victory();
  log(`You are now ${/^[AEIOU]/.test(C.name) ? 'an' : 'a'} ${C.name}.${got.length ? ` Vidar gave you: ${got.join(', ')}.` : ''} New skills are in the Skills window (${typeof winKey === 'function' ? winKey('skills') : 'S'}).`, 'lvl');
  compSync(); UI.dirty = true; renderHotbar(); saveGame();
}

/* Boss handling */
function announceBoss(m) {
  m.announced = true; bossShown = m; bossLag = m.hp / m.maxhp;
  $('bossbar').hidden = false; $('bossn').textContent = m.d.name; $('bosst').textContent = m.d.title || '';
  banner(m.d.name, m.d.title, 'band'); Sfx.boss();
  if (m.d.intro) log(m.d.intro, 'boss');
  squadEmit('boss_seen', { mob: m });
}
function bossDefeated(m) {
  const f = P.flags, real = !m.variant && !m.deep && !m.rush;   // round 7: scaled copies in the Deep / the Gauntlet
  if (real) { f.bosses[m.type] = true; (f.bossAt = f.bossAt || {})[m.type] = P.playTime; }
  $('bossbar').hidden = true; bossShown = null;
  for (const s of mobs) if (s.summoned && !s.dead) { s.dead = true; s.deathT = 0; burst(s.x, s.y, 10, '#555', 8, 1.5); }
  const uk = m.d.uniqueFrom !== undefined ? m.d.uniqueFrom : m.type;   // round 7: the Act II Garmr keeps his own pool (none)
  const from = t => t.unique && (t.boss === uk || (t.bosses && t.bosses.includes(uk)));
  const usable = Object.values(ITEMS).filter(t => from(t) && jobOk(t, P.cls));
  const any = Object.values(ITEMS).filter(t => from(t) && t.boss === m.type);
  const u = m.rush ? null : (usable.length ? pick(usable) : pick(any)); if (u && !(m.deep && Math.random() > 0.35)) dropItem(makeItem(u.id), m);   // round 7: a Deep boss drops one 35 % of the time
  if (!m.rush) { dropItem(rollEquip(m.d.lvl + 4), m); dropItem(makeItem('ygg_ember'), m); }
  if (m.rush) rushDown(m);   // round 7: the Gauntlet's next MVP (the Deep's boss is counted by killMob -> deepKilled)
  if (m.d.shard && real) { const sh = makeItem(m.d.shard); giveItem(sh, 'the Shardbearer'); f.shards[m.d.shard] = true; log(`You take the ${ITEMS[m.d.shard].name}.`, 'unique'); }
  if (real) f.lore[m.type] = true; if (m.d.lore && real) f.lore[m.d.lore] = true;
  if (m.variant) { f.variants = f.variants || {}; f.variants[m.variant] = (f.variants[m.variant] || 0) + 1; }
  zones = zones.filter(z => !z.hostile);
  if (m.type === 'ashen_king' && real) { f.kingSlain = true; banner('MVP', 'The Ashen King is dead · The Heart of Yggdrasil stirs', 'mvp'); log('Behind the throne, something that was dead begins, very faintly, to glow.', 'boss'); log('Past the Heart, the broken Bifrost flickers awake.', 'boss'); }
  else if (m.d.shard) banner('MVP', 'Shardbearer felled · ' + ITEMS[m.d.shard].name, 'mvp');
  else banner('MVP', `${m.d.name} felled`, 'mvp');
  if (m.d.outro) log(m.d.outro, 'boss');
  squadEmit('kill_mvp', { mob: m });
  Sfx.victory(); UI.dirty = true; saveGame();
}
function doAbility(m, a) {
  const say = (txt) => floatText(m, txt, 'shout'), A = mobAim(m);   // cycle 8: A = the hero it aims at (solo: P)
  switch (a.id) {
    case 'slam': say('!'); telegraph(m.x, m.y, a.r, a.delay, () => { if (!m.dead) { ring(m.x, m.y, a.r, '#ff6a3a'); burst(m.x, m.y, 4, '#c8a080', 26, 3.5); Sfx.slam(); } }, m, a); break;
    case 'nova': say(a.shout || '!!'); telegraph(m.x, m.y, a.r, a.delay, () => { if (!m.dead) { const c = a.col || m.d.glow || '#ff8a3a'; ring(m.x, m.y, a.r, c); burst(m.x, m.y, 10, c, 40, 5); Sfx.slam(); } }, m, a); break;   // round 7: a.col, a.shout
    case 'rain': for (let i = 0; i < a.n; i++) { const x = A.x + (i ? rand(-2.6, 2.6) : 0), y = A.y + (i ? rand(-2.6, 2.6) : 0); telegraph(x, y, a.r, a.delay + i * 0.12, () => { burst(x, y, 30, m.d.glow || '#ff7a2a', 14, 3); fxs.push({ k: 'meteor', x, y, t: 0, dur: 0.35, col: m.d.glow || '#ff7a2a' }); Sfx.fire(); }, m, a); } break;
    case 'leap': { const t = nearestOpen(A.x, A.y, 2); if (!t) break; const tx = t.x + 0.5, ty = t.y + 0.5; say('!'); m.leap = { sx: m.x, sy: m.y, tx, ty, t: 0, dur: a.delay }; telegraph(tx, ty, a.r, a.delay, () => { ring(tx, ty, a.r, '#bfe0ff'); burst(tx, ty, 6, '#cfe0ff', 20, 3); Sfx.slam(); }, m, a); break; }
    case 'summon': { const n = mobs.filter(s => s.summoned && !s.dead).length; if (n >= a.max) break; say(a.shout || 'Rise!'); for (let i = 0; i < a.n; i++) { const s = nearestOpen(m.x + rand(-3, 3), m.y + rand(-3, 3), 3); if (s) { const c = makeMob(a.mob, s.x + 0.5, s.y + 0.5, { summoned: true }); if (m.scaleL) { scaleMobTo(c, m.scaleL - 6); c.rush = m.rush; } c.state = 'chase'; mobs.push(c); burst(c.x, c.y, 10, '#6a5a5a', 12, 2); } } break; }
    case 'lunge': { // round 7: a telegraphed charge along a line; parry it (block as it lands) to stagger the beast
      say(a.shout || '!'); face(m, A); m.atkCD = Math.max(m.atkCD, a.delay + 0.5);
      const ang = Math.atan2(A.y - m.y, A.x - m.x), len = a.len || 7, w = a.w || 1.2, col = a.col || m.d.glow || '#ff6a4a';
      const grp = { hit: false, snd: false, shape: { kind: 'lines', x: m.x, y: m.y, ang, n: 1, spread: 0, len, w: w * 2 } };
      let ex = m.x, ey = m.y;
      for (let s = 1.0; s <= len + 0.01; s += 0.9) {
        const x = m.x + Math.cos(ang) * s, y = m.y + Math.sin(ang) * s; if (blocked(x, y)) break; ex = x; ey = y;
        telegraph(x, y, w, a.delay + s * 0.02, () => { burst(x, y, 10, col, 5, 2); if (m.trail) trailZone(m, x, y, col); if (!grp.snd) { grp.snd = true; Sfx.slam(); } }, m, a, grp);
      }
      const cl = m.d.chain && !m.unchained ? m.d.chain : 99;
      const dx = ex - m.hx, dy = ey - m.hy, dd = hyp(dx, dy); if (dd > cl) { ex = m.hx + dx / dd * cl; ey = m.hy + dy / dd * cl; }
      after(a.delay * 0.8, () => { if (!m.dead && !(m.stun > 0)) m.leap = { sx: m.x, sy: m.y, tx: ex, ty: ey, t: 0, dur: Math.max(0.15, a.delay * 0.25), flat: true }; });
      break;
    }
    // Round 3 kinds. Cones and lines are built from overlapping circle telegraphs sharing one group (one hit per
    // cast); each telegraph also carries `shape` so a renderer can draw the exact cone / lines instead.
    case 'breath': { // a cone toward the player (dragon fire, dark flame): step out of it sideways
      say(a.shout || '!!'); face(m, A); m.atkCD = Math.max(m.atkCD, a.delay + 0.3);
      const ang = Math.atan2(A.y - m.y, A.x - m.x) + (a.back ? Math.PI : 0), half = a.arc || 0.45, len = a.len || 6, rays = a.rays || 3, col = a.col || m.d.glow || '#ff7a2a';   // round 7: a.back = a tail sweep
      const grp = { hit: false, snd: false, shape: { kind: 'cone', x: m.x, y: m.y, ang, half, len } };
      if (a.zone) for (let i = 0; i < (a.zone.n || 3); i++) { const aa = ang + (Math.random() - 0.5) * half * 1.6, s = len * (0.35 + Math.random() * 0.6), zx = m.x + Math.cos(aa) * s, zy = m.y + Math.sin(aa) * s; if (!blocked(zx, zy)) after(a.delay + 0.2, () => { if (!m.dead) hexZone(m, Object.assign({ r: 1.3, dur: 6, tick: 0.3, slow: 30, rune: 'ᚾ' }, a.zone), zx, zy, a.zone.col || col); }); }   // round 7: rot left behind
      for (let i = 0; i < rays; i++) {
        const aa = ang + (rays > 1 ? -half + 2 * half * i / (rays - 1) : 0);
        for (let s = 1.4; s <= len + 0.01; s += 1.25) {
          const x = m.x + Math.cos(aa) * s, y = m.y + Math.sin(aa) * s; if (tileAt(x, y) === T.WALL) break;
          telegraph(x, y, 0.55 + s * half * 0.62, a.delay + s * 0.05, () => { burst(x, y, 20, col, 8, 2.6); fxs.push({ k: 'meteor', x, y, t: 0, dur: 0.3, col }); if (!grp.snd) { grp.snd = true; Sfx.fire(); } }, m, a, grp);
        }
      }
      break;
    }
    case 'wave': { // lines rolling outward from the boss (the tide, chain lashes): side-step between them
      say(a.shout || '!'); face(m, A);
      const ang = Math.atan2(A.y - m.y, A.x - m.x), n = a.n || 1, spread = a.spread || 0.4, len = a.len || 9, r = a.r || 0.95, spd = a.speed || 7, col = a.col || m.d.glow || '#9fd8ff';
      const grp = { hit: false, snd: false, shape: { kind: 'lines', x: m.x, y: m.y, ang, n, spread, len, w: r * 2 } };
      for (let k = 0; k < n; k++) {
        const aa = ang + (n > 1 ? (k - (n - 1) / 2) * spread : 0);
        for (let s = 1.2; s <= len; s += 1.1) {
          const x = m.x + Math.cos(aa) * s, y = m.y + Math.sin(aa) * s; if (tileAt(x, y) === T.WALL) break;
          telegraph(x, y, r, a.delay + s / spd, () => { ring(x, y, r, col); burst(x, y, 6, col, 6, 2); if (!grp.snd) { grp.snd = true; Sfx.slam(); } }, m, a, grp);
        }
      }
      break;
    }
    case 'curse': { // hex circles on and around the player; each leaves a zone that burns and slows while you stand in it
      say(a.shout || 'Hex!');
      const col = a.col || '#a066e0';
      for (let i = 0; i < (a.n || 2); i++) {
        const x = A.x + (i ? rand(-3, 3) : 0), y = A.y + (i ? rand(-3, 3) : 0); if (i && blocked(x, y)) continue;
        telegraph(x, y, a.r, a.delay + i * 0.25, () => { if (m.dead) return; ring(x, y, a.r, col); burst(x, y, 10, col, 14, 2); Sfx.cast(); hexZone(m, a, x, y, col); }, m, a, { hit: false, shape: { kind: 'circle' } });
      }
      break;
    }
  }
}
// A lingering hostile ground zone (curse): ticks while the player stands in it. Drawn by drawSkillOverlay (js/ui.js).
function hexZone(m, a, x, y, col) {
  zoneAdd({ hostile: true, x, y, r: a.r, dur: a.dur || 6, every: 0.5, first: 0.5, col, rune: a.rune || 'ᚺ', src: m,
    tick(z) {
      if (PARTY && PARTY.members.length > 1) {   // cycle 8: it burns every hero standing in it
        if (m.dead) return;
        for (const h of PARTY.members) if (!h.dead && hyp(h.x - z.x, h.y - z.y) <= z.r) withHero(h, hexTick, m, a);
        return;
      }
      if (P.dead || m.dead || hyp(P.x - z.x, P.y - z.y) > z.r) return; mobStrike(m, a.tick || 0.3, { sure: true, magic: true }); hexed(a.slow || 30); } });
}
function hexTick(m, a) { mobStrike(m, a.tick || 0.3, { sure: true, magic: true }); if (!P.dead) hexed(a.slow || 30); }
function hexed(pct) { if (P.buffs.hexed) { P.buffs.hexed.t = Math.max(P.buffs.hexed.t, 2); return; } addBuff('hexed', 'Hexed', 'hex', 2, { move: -pct }); hlog('A hex clings to you. You move slower.', 'warn'); }
// Cycle 8: a telegraph landing on a party. Each hero under it is struck once per blast group (grp.hits).
function teleParty(t) {
  let g = null; if (t.grp) g = t.grp.hits || (t.grp.hits = []);
  for (const h of PARTY.members) {
    if (h.dead || hyp(h.x - t.x, h.y - t.y) > t.r || (g && g.indexOf(h) >= 0)) continue;
    if (g) { g.push(h); t.grp.hit = true; }
    if (wardAt(t.x, t.y)) { floatText(h, 'Warded', 'info'); ring(t.x, t.y, t.r, '#9fe0c0'); } else mobStrike(t.m, t.mul || t.a.mul, Object.assign({ sure: true, magic: true }, t.a.hit || {}, t.a.parry ? { parry: t.a.parry } : {}), h);
  }
}
function telegraph(x, y, r, dur, boom, m, a, grp) { const t = { x, y, r, t: 0, dur, boom, m, a }; if (grp) { t.grp = grp; t.shape = grp.shape; } teles.push(t); return t; }

/* =========================================================
   Effects
   ========================================================= */
// Particles are pooled: update() swap-removes dead ones into PARTS_FREE and burst() reuses them (perf round 2).
const PARTS_FREE = [];
function burst(x, y, z, col, n, spd) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283, s = rand(0.3, 1) * spd, p = PARTS_FREE.pop() || {};
    p.x = x; p.y = y; p.z = z; p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s; p.vz = rand(20, 90); p.life = rand(0.4, 0.9); p.max = 0.9; p.col = col; p.size = rand(1.5, 3.5); p.float = false;
    parts.push(p);
  }
}
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
function cancelCast() { if (P.casting) { P.casting = null; P.castT = 0; hlog('Cast interrupted.', 'sys'); } }
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
    const p = e.path[0], dx = p.x - e.x, dy = p.y - e.y, d = hyp(dx, dy);
    if (d > 0.01) { e.fx = dx / d; e.fy = dy / d; }
    if (d <= step) { e.x = p.x; e.y = p.y; e.path.shift(); step -= d; }
    else { e.x += dx / d * step; e.y += dy / d * step; step = 0; }
  }
  e.moving = true; e.walk += dt * spd * 3.4;
  return !e.path.length;
}
function face(e, t) { const dx = t.x - e.x, dy = t.y - e.y, d = hyp(dx, dy); if (d > 0.01) { e.fx = dx / d; e.fy = dy / d; } }
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
  else if (sk.tgt === 'heal') {
    if (hm && isUndeadish(hm)) target = hm;
    else if (PARTY && PARTY.members.length > 1) target = !act && hover && hover.kind === 'player' && hover !== P && inParty(hover) ? hover : partyHealTarget(rng);   // cycle 8: an ally
  }
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
// Cycle 8: who a heal cast by the player goes to in a party: a fallen ally (with Resurrection learned), else the most
// hurt ally in reach when worse off than you (under 90 %), else yourself (null).
function partyHealTarget(r) {
  let best = null, bp = P.hp / S.maxhp;
  for (const h of PARTY.members) {
    if (h === P || hyp(h.x - P.x, h.y - P.y) > r + 3) continue;
    if (h.dead) { if (P.skills.resurrection) return h; continue; }
    const p = h.hp / heroStats(h).maxhp; if (p < 0.9 && p < bp) { bp = p; best = h; }
  }
  return best;
}
function nearestMobScan(r) { let best = null, bd = r; for (const m of mobs) { if (m.dead) continue; const d = dist(m, P); if (d < bd) { bd = d; best = m; } } return best; }
function nearestMob(r) {   // perf round 5: grid candidates in mobs[] order, so ties still go to the first mob
  if (mobs.length < MG_MIN || !(r < 1e6)) return nearestMobScan(r);
  const scan = MG.check ? nearestMobScan(r) : undefined;
  const idx = mobsNearIdx(P.x, P.y, r), L = mobs; let best = null, bd = r;
  for (let k = 0; k < idx.length; k++) { const m = L[idx[k]]; if (m.dead) continue; const d = dist(m, P); if (d < bd) { bd = d; best = m; } }
  if (scan !== undefined) { mgMismatch(scan, best); return scan; }
  return best;
}
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
  const why = skillBlocked(sk, pd.lv); if (why) { hlog(why + '.', 'warn'); floatText(P, why, 'miss'); return; }
  const spc = sk.sp(pd.lv); if (P.sp < spc) { hlog('Not enough SP.', 'warn'); return; }
  P.sp -= spc; P.cd[pd.id] = (sk.cd || 0.3) * (1 - (S.cdCut || 0) / 100);
  floatText(P, sk.name + '!!', 'skill');
  sk.use(pd.lv, pd.target, pd.pos);
  const fs = P.buffs.foresight; if (fs && sk.cast && pd.id !== 'foresight' && --fs.count <= 0) { delete P.buffs.foresight; calcStats(); renderBuffs(); }   // round 6: Foresight
  if (pd.target && pd.target.kind === 'mob' && sk.range === 'weapon') P.target = pd.target;
}
/* Cycle 8: the per-hero parts of updatePlayer, shared with the companions' update (js/squad.js squadAllyTick, which
   runs them in the companion's context). The controlled hero runs exactly the old sequence. */
function heroTimers(dt) {
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
    if (bf.t <= 0) { hlog(`${bf.name} wears off.`, 'sys'); delete P.buffs[k]; buffChanged = true; continue; }
    if (bf.every && bf.onTick) { bf.tk = (bf.tk || 0) + dt; if (bf.tk >= bf.every) { bf.tk -= bf.every; bf.onTick(bf); } }
    if (bf.needShield && !P.equip.shield) { delete P.buffs[k]; buffChanged = true; }
  }
  if (buffChanged) { calcStats(); renderBuffs(); }
}
// Regeneration (Magnificat doubles the tick rate)
function heroRegen(dt) {
  const sitMul = P.sitting ? 2 : 1, rg = P.buffs.magnificat ? P.buffs.magnificat.regen : 1;
  P.hpT += dt * rg; if (P.hpT >= 4) { P.hpT = 0; if (P.hp < S.maxhp) { const hr = P.skills.hp_recovery || 0; P.hp = Math.min(S.maxhp, P.hp + (Math.max(1, Math.floor(S.maxhp / 200) + Math.floor(S.vit / 5)) + hr * 5 + Math.floor(S.maxhp * hr * 0.002)) * sitMul); } }
  P.spT += dt * rg; if (P.spT >= 5) { P.spT = 0; if (P.sp < S.maxsp && !noSpRegen()) P.sp = Math.min(S.maxsp, P.sp + (1 + Math.floor(S.maxsp / 100) + Math.floor(S.int / 6) + (P.skills.sp_recovery || 0) * 3) * sitMul); }
}
// Casting, a pending skill, the attack target. True when that used up the tick (the caller returns).
function heroAct(dt) {
  // Casting
  if (P.casting) { P.castT -= dt; if (P.castT <= 0) { const c = P.casting; P.casting = null; execSkill(c); } return true; }

  // Pending skill: close in, then cast
  if (P.pending) {
    const pd = P.pending, sk = SKILLS[pd.id];
    if (pd.target && pd.target.kind === 'mob' && pd.target.dead) { P.pending = null; }
    else {
      const tp = pd.target || pd.pos; const r = skillRange(sk, pd.lv);
      if (!tp || sk.tgt === 'dir' || dist(P, tp) <= r + 0.3) { P.pending = null; beginCast(pd); return true; }
      P.repath = (P.repath || 0) - dt; if (!P.path || P.repath <= 0) { P.repath = 0.35; goNear(P, tp.x, tp.y); if (!P.path) P.pending = null; }
      followPath(P, dt, S.move * surfMul(P)); return true;
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
        followPath(P, dt, S.move * surfMul(P));
      }
      return true;
    }
  }
  P.atkCD = Math.max(0, P.atkCD - dt);
  return false;
}
function updatePlayer(dt) {
  if (P.dead) {
    if (PARTY && PARTY.members.length > 1 && typeof squadAutoSwap === 'function' && squadAutoSwap()) return;   // cycle 8: a companion takes over
    P.deadT += dt; if (P.deadT > 1.3 && !P.deathShown) { P.deathShown = true; showDeath(); } return;
  }
  P.playTime += dt;
  heroTimers(dt);
  petTick(dt); rebornAura();   // round 6

  if (P.dash) { updateDash(dt); postMove(); return; }
  heroRegen(dt);

  // Keyboard action controls take over while they are in use
  if (typeof actionUpdate === 'function' && actionUpdate(dt)) { postMove(); return; }

  if (heroAct(dt)) return;

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
  followPath(P, dt, S.move * surfMul(P));
  if (was && !P.moving) P.walk = 0;
  postMove();
}
function postMove() {
  // Auto-pick zeny & lost zeny when walking over it
  for (const d of drops) if ((d.zeny) && dist(P, d) < 0.7) { pickup(d); break; }
  // Warps
  for (const wp of map.warps) {
    if (Math.floor(P.x) === wp.x && Math.floor(P.y) === wp.y) {
      const why = warpLocked(wp);
      if (why) {
        if (!P.warpMsgT || time - P.warpMsgT > 3) { P.warpMsgT = time; log(why, 'warn'); }
        // step back off the warp, away from its centre
        const dx = P.x - wp.x - 0.5, dy = P.y - wp.y - 0.5, d = hyp(dx, dy) || 1;
        let bx = wp.x + 0.5 + dx / d * 1.1, by = wp.y + 0.5 + dy / d * 1.1;
        if (blocked(bx, by)) { const o = nearestOpen(wp.x + 0.5, wp.y + 1.5, 2); if (o && !(o.x === wp.x && o.y === wp.y)) { bx = o.x + 0.5; by = o.y + 0.5; } }
        if (!blocked(bx, by)) { P.x = bx; P.y = by; } P.path = null; P.dash = null;
      } else if (wp.tx === null || wp.tx === undefined) { Sfx.warp(); const dm = genMap(wp.to); gotoMap(wp.to, dm.entry.x + 0.5, dm.entry.y + 0.5); }   // round 7: the Deep's next floor
      else { Sfx.warp(); gotoMap(wp.to, wp.tx, wp.ty); }
      break;
    }
  }
}
/* Warp locks: wp.lock names an entry here. The renderer may call warpLocked(wp) to colour a sealed portal. */
const WARP_LOCKS = {
  gate: { open: () => !!P.flags.gate, msg: 'The Cinder Gate is sealed. Bring the three Rune-Shards to Sigrun.' },
  king: { open: () => !!P.flags.kingSlain, msg: 'The broken Bifrost will not bear your weight while the Ashen King still burns on his throne.' },
  // Round 7 (Helheim). Hel's law: whoever crosses Gjallarbrú alive stays in Hel, unless the Norns have spun them twice.
  hel: { open: () => helRoadOpen(), get msg() { return !(P.quests.done.act2_12) ? 'Helgrind is shut. Móðguðr’s lantern burns in front of the crack, and nothing comes through.' : !P.flags.reborn ? 'Móðguðr bars the way: “The living who cross into Hel stay in Hel. Only one the Norns have spun twice can walk back out.” (Be born again at the Heart of Yggdrasil.)' : `Móðguðr bars the way: “Not yet. The dead below would eat you alive.” (Base Lv 70; you are ${P.lvl}.)`; } },
  hall: { open: () => !!P.flags.bosses.garmr, msg: 'Garmr is chained across Eljudnir’s door. Nobody enters Hel’s hall while the hound still stands.' },
  root: { open: () => !!(P.quests.done.act3_4 || P.flags.bosses.nidhogg), msg: 'The Root Road is choked with the dead. Ganglati says the way to Hvergelmir must be found from below first (the Deep Roots, floor 5).' },
  deep: { open: () => deepCleared(), get msg() { return deepLockMsg(); } },
};
function warpLocked(wp) { const L = wp && wp.lock && WARP_LOCKS[wp.lock]; return L && !L.open() ? L.msg : null; }
function updateMob(m, dt) {
  if (m.dead) { m.deathT += dt; return; }
  m.anim += dt; if (m.hitFlash > 0) m.hitFlash -= dt;
  if (m.d.inert) { m.moving = false; return; }
  if (m.atkAnim >= 0) { m.atkAnim += dt * 3; if (m.atkAnim > 1) m.atkAnim = -1; }
  if (m.weak > 0) m.weak -= dt; if (m.hexT > 0) m.hexT -= dt;   // round 6
  if (m.snare > 0) m.snare -= dt; if (m.slow > 0) m.slow -= dt; if (m.dispel > 0) m.dispel -= dt; if (m.mark > 0) m.mark -= dt;
  if (m.frozen > 0) { m.frozen -= dt; m.moving = false; return; }
  if (m.stun > 0) { m.stun -= dt; m.moving = false; m.atkCD = Math.max(m.atkCD, 0.3); return; }
  if (m.gnaw) { gnawTick(m, dt); return; }   // round 7: Níðhöggr feeding on the root (immune until its brood falls)
  if (m.leap) {
    const L = m.leap; L.t += dt; const k = Math.min(1, L.t / L.dur);
    m.x = L.sx + (L.tx - L.sx) * k; m.y = L.sy + (L.ty - L.sy) * k; m.z = L.flat ? 0 : Math.sin(k * Math.PI) * 60; m.moving = !!L.flat;
    if (k >= 1) { m.leap = null; m.z = 0; m.path = null; }
    return;
  }
  // cycle 8: tg = the hero this monster hunts (solo: P). In a party: its target by threat / taunt, else the nearest.
  const tg = PARTY && PARTY.members.length > 1 ? mobTarget(m) : P;
  const d = m.d, dp = dist(m, tg), spd = m.snare > 0 ? 0 : d.speed * (m.slow > 0 ? 0.5 : 1) * (m.spdMul || 1);
  // round 7: a safe camp (map.d.safeZone): nothing hunts you inside it, and nothing follows you in
  const sz = map.d.safeZone, pSafe = !!sz && !m.rush && hyp(tg.x - sz.x, tg.y - sz.y) < sz.r;
  if (!tg.dead && !pSafe && m.state === 'idle' && d.aggro && dp < (d.sight || 7) - (map.d.deep && deepHas('ashen') ? 3 : 0)) aggro(m);
  if ((tg.dead || pSafe || (sz && !m.rush && hyp(m.x - sz.x, m.y - sz.y) < sz.r)) && m.state === 'chase') { m.state = 'return'; m.path = null; }
  m.atkCD -= dt;
  if (m.state === 'idle') {
    m.t -= dt;
    if (m.t <= 0) { m.t = rand(2.5, 6); if (Math.random() < 0.65) { const tx = m.hx + rand(-4, 4), ty = m.hy + rand(-4, 4); if (!blocked(tx, ty)) { const p = findPath(m.x, m.y, tx, ty, 400); m.path = p; } } }
    followPath(m, dt, spd * 0.45); if (!spd) m.moving = false;
  } else if (m.state === 'chase') {
    const leash = d.boss ? 24 : 16;
    if (hyp(m.x - m.hx, m.y - m.hy) > leash && !m.summoned) { m.state = 'return'; m.path = null; return; }
    if (dp <= d.range + 0.2) {
      m.path = null; m.moving = false; face(m, tg);
      if (m.atkCD <= 0) {
        m.atkCD = d.aspd * (m.slow > 0 ? 1 + 0.1 * (m.slowLv || 1) : 1); m.atkAnim = 0;
        if (d.ranged) shot(m, tg, d.shot || 'arrow', () => { if (!m.dead) mobStrike(m, 1, d.magic ? { magic: true } : {}, tg); }, { spd: d.shot && d.shot !== 'arrow' ? 11 : 13 });
        else if (d.magic) after(0.32, () => { if (!m.dead && !tg.dead && !(m.stun > 0) && dist(m, tg) <= d.range + 0.9) mobStrike(m, 1, { magic: true }, tg); });
        else after(0.32, () => { if (!m.dead && !tg.dead && !(m.stun > 0) && dist(m, tg) <= d.range + 0.9) mobStrike(m, 1, NOOPT, tg); });
      }
    } else {
      m.repath -= dt;
      if ((m.repath <= 0 || !m.path) && (!m.path || dp < 2.5 || pathBudget())) {   // perf round 5: re-path budget (PATHB)
        m.repath = rand(0.4, 0.7);
        if (dp < 2.5 && clearLine(m.x, m.y, tg.x, tg.y)) m.path = [{ x: tg.x, y: tg.y }];
        else { const p = findPath(m.x, m.y, tg.x, tg.y, 2200); m.path = p ? smooth(m, p) : null; if (!p && !m.summoned) { m.state = 'return'; } }
      }
      followPath(m, dt, spd); if (!spd) m.moving = false;
    }
    if (d.chain && !m.unchained) { const cx = m.x - m.hx, cy = m.y - m.hy, cd = hyp(cx, cy); if (cd > d.chain) { m.x = m.hx + cx / cd * d.chain; m.y = m.hy + cy / cd * d.chain; m.path = null; m.moving = false; } }   // round 7: chained (Garmr)
    if ((d.boss || d.useAbil) && d.abil) {
      if (d.phase2 && !m.p2 && m.hp < m.maxhp * 0.5) { m.p2 = true; banner(d.name, d.phase2Sub || 'The fire answers him directly now', 'band'); log(d.phase2, 'boss'); Sfx.boss(); }
      if (d.phases) mobPhases(m); if (m.gnaw) return;   // round 7: phase changes (a phase may send the boss to feed)
      for (const a of d.abil) { if (a.phase && (m.phase || 0) < a.phase) continue; const k = a.key || a.id; if (m.abil[k] === undefined) m.abil[k] = a.cd * 0.5; m.abil[k] -= dt * (m.p2 ? 1.5 : 1) / (m.cdMul || 1); if (m.abil[k] <= 0) { m.abil[k] = a.cd; doAbility(m, a); break; } }
    }
  } else if (m.state === 'return') {
    if (!m.path) { const p = findPath(m.x, m.y, m.hx, m.hy, 3000); m.path = p ? smooth(m, p) : []; }
    const done = followPath(m, dt, d.speed * 1.3);
    m.hp = Math.min(m.maxhp, m.hp + m.maxhp * 0.2 * dt);
    if (done) { m.state = 'idle'; m.hp = m.maxhp; m.path = null; m.announced = false; m.abil = {}; m.p2 = false; m.phase = 0; m.cdMul = 1; m.spdMul = 1; m.unchained = false; m.trail = false; if (bossShown === m) { $('bossbar').hidden = true; bossShown = null; } }
  }
}
/* Perf round 5: AI level of detail. Idle monsters more than 22 cells from the hero (off-screen at every zoom; their
   sight is at most 12, so they cannot notice you from there) only wander: they are updated at 5 Hz with the time they
   missed. Bosses, and anything chasing, returning or dying, update every tick. A monster that comes within range gets
   its missed time on its next update. Wander timers then fire in 0.2 s steps, so the Math.random order differs from the
   per-tick update: gameplay is the same in kind, not tick for tick. window.AOM_AI_LOD = false turns it off. */
const AILOD = { on: !(typeof window !== 'undefined' && window.AOM_AI_LOD === false), r2: 22 * 22, step: 0.2, skipped: 0, ran: 0 };
// Perf round 5: remove a[i] keeping the order, like a.splice(i, 1) but without allocating the removed-items array
// (update() did that for every expired timer, float, effect and projectile).
function rmAt(a, i) { const n = a.length - 1; for (let k = i; k < n; k++) a[k] = a[k + 1]; a.length = n; }
function update(dt) {
  time += dt;
  if (PARTY && PARTY.members.indexOf(P) < 0) PARTY = null;   // cycle 8: a new game (or a test) replaced the hero
  for (let i = timers.length - 1; i >= 0; i--) { const t = timers[i]; t.t -= dt; if (t.t <= 0) { rmAt(timers, i); if (PARTY && t.h !== P) asOwner(t.h, t.fn); else t.fn(); } }
  if (started) { ambientTick(dt); updatePlayer(dt); if (PARTY && PARTY.members.length > 1 && typeof squadUpdate === 'function') squadUpdate(dt); updateZones(dt); questTick(dt); compUpdate(dt); if (RUSH && RUSH.on) rushTick(dt); }
  if (typeof CINE !== 'undefined' && CINE.active) { if (P) P.iframes = Math.max(P.iframes || 0, 0.3); } // scenes freeze the monsters and shield you
  else if (!AILOD.on || !P) for (const m of mobs) updateMob(m, dt);
  else {   // perf round 5: AI level of detail (AILOD)
    const px = P.x, py = P.y, r2 = AILOD.r2, L = PARTY && PARTY.members.length > 1 ? PARTY.members : null;   // cycle 8: far from every hero
    for (const m of mobs) {
      let far = m.state === 'idle' && !m.dead && !m.d.boss && (m.x - px) * (m.x - px) + (m.y - py) * (m.y - py) > r2;
      if (far && L) for (const h of L) if ((m.x - h.x) * (m.x - h.x) + (m.y - h.y) * (m.y - h.y) <= r2) { far = false; break; }
      if (!far) { AILOD.ran++; if (m.lodT) { const acc = m.lodT; m.lodT = 0; updateMob(m, dt + acc); } else updateMob(m, dt); continue; }
      m.lodT = (m.lodT || 0) + dt;
      if (m.lodT >= AILOD.step) { AILOD.ran++; const acc = m.lodT; m.lodT = 0; updateMob(m, acc); } else AILOD.skipped++;
    }
  }
  for (let i = mobs.length - 1; i >= 0; i--) if (mobs[i].dead && mobs[i].deathT > 0.8) rmAt(mobs, i);
  for (let i = projs.length - 1; i >= 0; i--) {
    const p = projs[i]; p.t += dt;
    const tgt = p.to; if ((tgt.dead && tgt !== P) || (tgt === P && P.dead) || p.t > 3) { rmAt(projs, i); continue; }
    const dx = tgt.x - p.x, dy = tgt.y - p.y, dz = chestH(tgt) - p.zu, d = hyp3(dx, dy, dz), st = p.spd * dt;
    if (d <= st + 0.25) { rmAt(projs, i); if (PARTY && p.h !== P) asOwner(p.h, p.onHit); else p.onHit(); if (p.kind !== 'arrow') burst(tgt.x, tgt.y, 30, PCOL[p.kind], 12, 2.2); }
    else { p.vx = dx / d; p.vy = dy / d; p.vz = dz / d; p.x += p.vx * st; p.y += p.vy * st; p.zu += p.vz * st; }
  }
  for (let i = teles.length - 1; i >= 0; i--) {
    const t = teles[i]; t.t += dt;
    if (t.t >= t.dur) {
      rmAt(teles, i); if (t.m.dead) continue; t.boom();
      // Blasts of one cone / wave share a group: the player is hit at most once per group.
      if (PARTY && PARTY.members.length > 1) { teleParty(t); continue; }   // cycle 8: every hero under it (once per group each)
      if (!P.dead && hyp(P.x - t.x, P.y - t.y) <= t.r && !(t.grp && t.grp.hit)) {
        if (t.grp) t.grp.hit = true;
        if (wardAt(t.x, t.y)) { floatText(P, 'Warded', 'info'); ring(t.x, t.y, t.r, '#9fe0c0'); } else mobStrike(t.m, t.mul || t.a.mul, Object.assign({ sure: true, magic: true }, t.a.hit || {}, t.a.parry ? { parry: t.a.parry } : {}));   // round 7: a.hit / a.parry
      }
    }
  }
  for (let i = drops.length - 1; i >= 0; i--) { const d = drops[i]; d.t += dt; if (d.t > 180 && !d.lost && !(d.item && rarityOf(d.item) === 'unique') && !(d.item && ITEMS[d.item.id].type === 'key')) rmAt(drops, i); }
  for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life -= dt; if (p.life <= 0) { parts[i] = parts[parts.length - 1]; parts.pop(); if (PARTS_FREE.length < 600) PARTS_FREE.push(p); continue; } p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; if (!p.float) p.vz -= 160 * dt; if (p.z < 0) { p.z = 0; p.vz *= -0.3; p.vx *= 0.6; p.vy *= 0.6; } }
  for (let i = fxs.length - 1; i >= 0; i--) { const f = fxs[i]; f.t += dt; if (f.t >= f.dur) rmAt(fxs, i); }
  for (let i = floats.length - 1; i >= 0; i--) { const f = floats[i]; f.t += dt; if (f.t > (f.kind === 'skill' || f.kind === 'lvl' || f.kind === 'job' ? 1.3 : 0.95)) { rmAt(floats, i); continue; } }
  if (started && time - lastSave > 30) { lastSave = time; saveGame(); }
}

/* =========================================================
   Death, maps, waystones
   ========================================================= */
function die() {
  if (PARTY && PARTY.members.length > 1 && typeof squadDown === 'function' && squadDown(P)) return;   // cycle 8: a hero falls, the party fights on
  P.flags.deaths = (P.flags.deaths || 0) + 1;
  if (P.mounted) { P.mounted = false; log('You are thrown from your warg. It waits for you at the Waystone.', 'bad'); calcStats(); }   // round 6
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
  if (PARTY && PARTY.members.length > 1 && typeof squadReviveAll === 'function') squadReviveAll(1, true);   // cycle 8: the Waystone wakes the whole party
  gotoMap(P.lastWay.map, P.lastWay.x, P.lastWay.y, true);
  log('The Waystone pulls you back from the dark.', 'sys');
}
function gotoMap(id, x, y, quiet) {
  const first = !map || map.id !== id;
  if (map && map.id !== id) { if (typeof RUSH !== 'undefined' && RUSH && RUSH.on && map.id === 'helheim_arena') rushAbort('You left Eljudnir. The Gauntlet is over.'); deepLeave(); }   // round 7
  map = genMap(id);
  if (blocked(x, y)) { const o = nearestOpen(x, y, 5) || map.entry; x = o.x + 0.5; y = o.y + 0.5; }
  P.map = id; P.x = x; P.y = y;
  stopAll(); P.casting = null; P.dash = null; timers = []; projs = []; teles = []; parts = []; fxs = []; floats = []; drops = []; zones = [];
  if (PARTY && PARTY.members.length > 1 && typeof squadArrive === 'function') squadArrive();   // cycle 8: the companions warp with you
  spawnAll();
  if (typeof prefetchSheets === 'function') prefetchSheets(); // lazy-load this map's sprite sheets
  if (P.lostZeny && P.lostZeny.map === id) drops.push({ kind: 'drop', zeny: P.lostZeny.zeny, lost: true, x: P.lostZeny.x, y: P.lostZeny.y, t: 0, id: uidc++ });
  $('bossbar').hidden = true; bossShown = null;
  const firstVisit = !P.flags.seen[id]; P.flags.seen[id] = true;
  if (first) squadEmit('map_enter', { map: id });
  npcSync(); compSync(true);   // round 6: the pet and Huginn arrive with you
  ambientEnter();              // cycle 9: townsfolk walk their rounds, critters, chests' state
  enterWorld();
  if (first || !quiet) banner(map.d.name, map.d.sub);
  if (firstVisit && map.d.intro) log(map.d.intro, 'sys');
  if (first && map.d.lv && P.lvl < map.d.lv[0] - 4) log(`The Ash is thick here. Its creatures are far stronger than you (Base Lv ${map.d.lv[0]}–${map.d.lv[1]}).`, 'warn');
  setScreenParts();
  if (map.d.deep) deepArrive(first);   // round 7: best depth, floor affixes, the floor's banner
  if (id === 'throne' && !P.flags.kingIntro && !P.flags.kingSlain) { P.flags.kingIntro = true; after(1.2, () => say('The Ashen King', [MOBS.ashen_king.intro, '“You came for the Heart. It is behind me. So am I, in a sense. Come and take it.”'])); }
  UI.dirty = true; saveGame();
}
function useObj(o) {
  if (o.kind === 'way') {
    if (!P.kindled[map.id]) { P.kindled[map.id] = true; banner('Waystone Kindled', map.d.name, 'band gold'); Sfx.level(); }
    openWin('way');
  } else if (o.kind === 'board') questBoard(o);
  else if (OBJ_TALK[o.kind]) OBJ_TALK[o.kind](o);
  else if (o.kind === 'anvil') log(o.text || 'The anvil is still warm. Brokkr never lets it go cold.', 'sys');
}
/* =========================================================
   Cycle 9: ambient life, chests
   - Townsfolk: an NPCS entry with `route: [[x, y], ...]` walks its round (goNear + followPath at `pace`, default 1.5
     cells/s), pausing 2-6 s at each point; it stops while you talk to it or a scene plays. map.npcs entries keep
     `route` and `home`; n.moving / n.fx / n.fy / n.walk drive the walk frames like an escort's.
   - Critters: MAPDEFS[id].critters = [[kind, n, [x0, y0, x1, y1]?], ...] (kinds in CRITTERS). Each is a
     window.COMPANIONS entry { critter: kind, manual: true, owner: itself, kind: 'critter', bird?, sheet, scale, x, y,
     z, fx, fy, state: 'idle' | 'walk' | 'fly', walk } driven here: they wander, and scatter (run, or take wing) when a
     hero comes close. They cannot be targeted and never fight. Placement and wandering use their own seeded stream
     (AMB.r), never Math.random, so monster rolls are untouched. The sheet is the first of CRITTERS[kind].sheets the
     sprite index has (art hook: critter_* sheets); with none, the critter is not drawn.
   - Chests: map.objs { kind: 'chest', id, x, y, loot, name, need?, needText? } (OBJ_TALK.chest -> chestOpen). Loot
     tables are CHEST_LOOT (js/data/npcs.js). Opened once per save (P.flags.chests[id]); o.open mirrors it for the
     renderer (a lid).
   ========================================================= */
const CRITTERS = {
  crow: { sheets: ['critter_crow', 'pet_huginn'], kind: 'critter', bird: true, scale: 0.5, fly: true, shy: 4.5 },
  raven: { sheets: ['critter_raven', 'pet_huginn'], kind: 'critter', bird: true, scale: 0.62, fly: true, shy: 5 },
  hare: { sheets: ['critter_hare', 'mob_hollow_hare'], kind: 'critter', scale: 0.42, speed: 1.2, flee: 5.5, shy: 3.5, hop: true },
  deer: { sheets: ['critter_deer'], kind: 'critter', scale: 0.9, speed: 1, flee: 6, shy: 6 },
  rat: { sheets: ['critter_rat'], kind: 'critter', scale: 0.4, speed: 1.6, flee: 5, shy: 2.5 },
  toad: { sheets: ['critter_toad', 'mob_bog_toad'], kind: 'critter', scale: 0.3, speed: 0.7, flee: 2.5, shy: 2, hop: true },
  bat: { sheets: ['critter_bat', 'mob_cave_bat'], kind: 'critter', scale: 0.38, bat: true },
  gull: { sheets: ['critter_gull', 'pet_huginn'], kind: 'critter', bird: true, scale: 0.5, fly: true, shy: 4, tint: [1.6, 1.6, 1.7] },
};
const AMB = { crit: [], r: mulberry32(1), map: null };
function ambientEnter() {
  const L = window.COMPANIONS;
  for (let i = L.length - 1; i >= 0; i--) if (L[i].critter) L.splice(i, 1);
  AMB.crit = []; AMB.map = map;
  let hs = 0; for (const ch of map.id) hs = (Math.imul(hs, 31) + ch.charCodeAt(0)) | 0;
  AMB.r = mulberry32((hs ^ Math.imul(((P && P.playTime) | 0) + 1, 0x9e3779b1)) | 0 || 1);
  for (const o of map.objs) if (o.kind === 'chest') o.open = !!(P.flags.chests && P.flags.chests[o.id]);
  for (const n of map.npcs) if (n.route) { n.ri = n.ri || 0; n.wT = 1 + AMB.r() * 3; n.path = null; n.moving = false; }
  const list = map.d.critters; if (!list) return;
  for (const [k, n, rg] of list) {
    const C = CRITTERS[k]; if (!C) continue;
    for (let i = 0; i < n; i++) {
      const s = critterSpot(rg); if (!s) continue;
      const c = { critter: k, kind: C.kind, sheet: C.sheets[C.sheets.length - 1], manual: true, scale: C.scale, x: s.x, y: s.y, z: C.bat ? 70 + AMB.r() * 40 : 0, fx: AMB.r() < 0.5 ? 1 : -1, fy: 0.3,
        state: C.bat ? 'fly' : 'idle', walk: 0, t: AMB.r() * 4, hx: s.x, hy: s.y, rg, tint: C.tint };
      c.owner = c; AMB.crit.push(c); L.push(c);
    }
  }
}
function critterSpot(rg, near) {
  const r = AMB.r, w = map.w, h = map.h;
  for (let k = 0; k < 60; k++) {
    const x = near ? Math.floor(near.x + (r() - 0.5) * 2 * near.d) : rg ? rg[0] + Math.floor(r() * (rg[2] - rg[0] + 1)) : 2 + Math.floor(r() * (w - 4)), y = near ? Math.floor(near.y + (r() - 0.5) * 2 * near.d) : rg ? rg[1] + Math.floor(r() * (rg[3] - rg[1] + 1)) : 2 + Math.floor(r() * (h - 4));
    if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1 || map.t[y * w + x] !== 0 || !map.reach[y * w + x]) continue;
    if (map.d.safeZone && hyp(x - map.d.safeZone.x, y - map.d.safeZone.y) < 3) continue;
    return { x: x + 0.3 + r() * 0.4, y: y + 0.3 + r() * 0.4 };
  }
  return null;
}
function ambientTick(dt) {
  if (!map || !P) return;
  if (AMB.map !== map) return;
  const cine = typeof CINE !== 'undefined' && CINE.active, talking = typeof talkNPC !== 'undefined' ? talkNPC : null;
  for (const n of map.npcs) {
    if (!n.route) continue;
    if (cine || talking === n || n.escort) { n.moving = false; n.path = null; if (talking === n) face(n, P); continue; }
    if (n.path && n.path.length) { if (followPath(n, dt, NPCS[n.id] && NPCS[n.id].pace || 1.5)) { n.moving = false; n.wT = 2 + AMB.r() * 4; n.ri = (n.ri + 1) % n.route.length; } continue; }
    n.moving = false; n.wT = (n.wT || 0) - dt;
    if (n.wT <= 0) { const [tx, ty] = n.route[n.ri % n.route.length]; goNear(n, tx, ty); if (!n.path || !n.path.length) { n.wT = 3; n.ri = (n.ri + 1) % n.route.length; } }
  }
  if (!AMB.crit.length) return;
  const H = heroes(), sheetsOk = typeof SHEETS !== 'undefined' && SHEETS.indexReady;
  for (const c of AMB.crit) {
    const C = CRITTERS[c.critter];
    if (sheetsOk && !c.sheetOk) { c.sheetOk = true; const s = C.sheets.find(id => SHEETS.entries[id]); if (s) c.sheet = s; else c.hidden = true; }
    let near = null, nd = 1e9; for (const h of H) { if (h.dead) continue; const d = hyp(h.x - c.x, h.y - c.y); if (d < nd) { nd = d; near = h; } }
    if (nd > 40) continue;   // far away: frozen (cheap)
    c.t -= dt;
    if (C.bat) {   // bats: loop over their roost, higher and faster when disturbed
      const a = (time * (0.8 + (c.hx % 1)) + c.hy) % 6.283, R = 1.6 + (c.hy % 1) * 1.4, tx = c.hx + Math.cos(a) * R, ty = c.hy + Math.sin(a) * R;
      c.fx = tx - c.x; c.fy = ty - c.y; c.x = tx; c.y = ty; c.z = 70 + Math.sin(time * 2.3 + c.hx) * 18 + (nd < 3 ? 30 : 0); c.state = 'fly'; continue;
    }
    if (C.fly) {
      if (c.state === 'fly') {   // flying off: climb, glide to the landing spot, drop down
        const dx = c.tx - c.x, dy = c.ty - c.y, d = hyp(dx, dy), sp = 6 * dt;
        if (d > sp) { c.x += dx / d * sp; c.y += dy / d * sp; c.fx = dx / d; c.fy = dy / d; c.z = Math.min(110, c.z + 90 * dt) * (d < 2 ? d / 2 : 1); }
        else { c.x = c.tx; c.y = c.ty; c.z = 0; c.state = 'idle'; c.t = 2 + AMB.r() * 5; }
        continue;
      }
      if (nd < C.shy || c.t < -30) {   // startled (or restless): take wing to a spot away from the hero
        const ax = near ? c.x - near.x : AMB.r() - 0.5, ay = near ? c.y - near.y : AMB.r() - 0.5, al = hyp(ax, ay) || 1;
        const s = critterSpot(null, { x: c.x + ax / al * 11, y: c.y + ay / al * 11, d: 4 }) || critterSpot(c.rg);
        if (s) { c.tx = s.x; c.ty = s.y; c.state = 'fly'; c.z = 4; } else c.t = 2;
        continue;
      }
      if (c.t < 0) { c.fx = -c.fx; c.t = 1.5 + AMB.r() * 4; }   // pecking about: turns now and then
      c.state = 'idle'; continue;
    }
    // ground critters: wander about their spot, bolt from heroes
    const flee = nd < C.shy && near;
    if (flee && !c.fleeT) { const ax = c.x - near.x, ay = c.y - near.y, al = hyp(ax, ay) || 1; c.tx = c.x + ax / al * 5; c.ty = c.y + ay / al * 5; c.fleeT = 1.6; }
    if (c.fleeT) c.fleeT = Math.max(0, c.fleeT - dt);
    if (c.tx === undefined && c.t < 0) { const s = critterSpot(null, { x: c.hx, y: c.hy, d: 4 }); if (s) { c.tx = s.x; c.ty = s.y; } c.t = 2 + AMB.r() * 5; }
    if (c.tx !== undefined) {
      const dx = c.tx - c.x, dy = c.ty - c.y, d = hyp(dx, dy), sp = (c.fleeT ? C.flee : C.speed) * dt;
      if (d < 0.1) { c.tx = undefined; c.state = 'idle'; c.moving = false; if (c.fleeT === 0) { c.hx = c.x; c.hy = c.y; } }
      else { const nx = c.x + dx / d * Math.min(sp, d), ny = c.y + dy / d * Math.min(sp, d); if (blocked(nx, ny)) { c.tx = undefined; c.state = 'idle'; } else { c.x = nx; c.y = ny; c.fx = dx / d; c.fy = dy / d; c.walk += Math.min(sp, d) * 3.4; c.state = 'walk'; c.moving = true; } }
    }
    c.z = C.hop && c.state === 'walk' ? Math.abs(Math.sin(c.walk * 0.9)) * 7 : 0;
  }
}
// A chest (OBJ_TALK.chest in js/data/npcs.js): loot once per save. Returns what it gave, or null.
function chestOpen(o) {
  const f = P.flags.chests = P.flags.chests || {};
  if (f[o.id]) { log(`The ${o.name || 'chest'} is empty. You already took what was in it.`, 'sys'); return null; }
  if (o.need && !o.need()) { log(o.needText || 'It will not open.', 'warn'); return null; }
  const L = (typeof CHEST_LOOT !== 'undefined' && CHEST_LOOT[o.loot]) || { zeny: [50, 150] }, got = [];
  f[o.id] = questDay(); o.open = true;
  if (L.zeny) { const z = Math.round(L.zeny[0] + Math.random() * (L.zeny[1] - L.zeny[0])); P.zeny += z; got.push(fmt(z) + 'z'); }
  for (const [id, n, ch] of L.items || []) if (ITEMS[id] && (ch === undefined || Math.random() < ch)) { const it = makeItem(id, stackable(id) ? { qty: n || 1 } : {}); giveItem(it, 'a chest'); got.push(itemLabel(it)); }
  if (L.equip) { const it = rollEquip(L.equip); if (it) { giveItem(it, 'a chest'); got.push(itemName(it)); } }
  if (L.pick) { const id = L.pick[Math.floor(Math.random() * L.pick.length)]; if (ITEMS[id]) { const it = makeItem(id); giveItem(it, 'a chest'); got.push(itemName(it)); } }
  if (L.lore) P.flags.lore[L.lore] = true;
  burst(o.x, o.y, 12, '#ffd070', 16, 2); Sfx.rare();
  log(`You open the ${o.name || 'chest'}: ${got.join(', ') || 'dust and cobwebs'}.`, 'item');
  UI.dirty = true; saveGame();
  return got;
}
function rest() {
  P.hp = S.maxhp; P.sp = S.maxsp; P.lastWay = { map: map.id, x: map.way.x, y: map.way.y + 1.2 };
  if (PARTY && PARTY.members.length > 1 && typeof squadReviveAll === 'function') squadReviveAll(1, true);   // cycle 8: fallen companions rise, everyone is healed
  if (blocked(P.lastWay.x, P.lastWay.y)) { const o = nearestOpen(map.way.x, map.way.y + 1, 3); if (o) P.lastWay = { map: map.id, x: o.x + 0.5, y: o.y + 0.5 }; }
  const lost = drops.filter(d => d.lost);
  mobs = []; spawnAll(); drops = drops.filter(d => d.lost || d.item);
  pillar(P, '#ffb060', true); Sfx.heal();
  log('You rest at the Waystone. Your wounds close. Somewhere out in the Ash, the dead get up again.', 'sys');
  $('bossbar').hidden = true; bossShown = null;
  saveGame(); closeWin('way');
}

/* =========================================================
   Content round 5: mail, storage, crafting, enchanting, card removal, vendors, junk, sorting, travel by sea.
   Data: js/data/recipes.js (RECIPES, VENDORS, ENCHANT_TIERS, CARD_REMOVAL, STORAGE_SLOTS, STACK_MAX ...).
   Windows: js/ui.js (storage, craft, enchant, cardsage and the vendor tabs of the shop window).
   Every function that rolls takes an optional rng (tests pass a fixed one).
   ========================================================= */
const RNG = () => Math.random();
const zenyOk = n => { if (P.zeny >= n) return true; log(`You need ${fmt(n)} zeny.`, 'warn'); return false; };
const itemLabel = it => itemName(it) + (it.qty > 1 ? ' ×' + it.qty : '');

/* ---------- Mail: rewards that do not fit in the bag wait here (P.mail, saved) ---------- */
function mailItem(it, from, quiet) {
  P.mail = P.mail || [];
  P.mail.push({ item: it, from: from || 'Midgard', day: questDay() });
  if (!quiet) { log(`Your bag is full. ${itemLabel(it)} was sent to your mailbox: claim it from a storage keeper or at any Waystone.`, 'warn'); if (typeof questToast === 'function') questToast('Mail · ' + itemLabel(it), 'obj'); }
  UI.dirty = true;
}
// Into the bag, else the mailbox. Returns true when it went into the bag.
function giveItem(it, from, quiet) { if (addItem(it, true)) return true; mailItem(it, from, quiet); return false; }
function mailClaim(i) {
  const m = (P.mail || [])[i]; if (!m) return false;
  const id = m.item.id, full = addItem(m.item, true);
  if (!full) { log('Your bag is full.', 'warn'); UI.dirty = true; return false; }   // a partial claim leaves the rest in the mail
  P.mail.splice(i, 1); log(`You take ${itemLabel(m.item)} from your mail.`, 'loot'); Sfx.pickup();
  if (ITEMS[id].type === 'card' && ITEMS[id].mob) P.flags.cards[ITEMS[id].mob] = true;
  questEvent('pickup', id); UI.dirty = true; return true;
}
function mailClaimAll() { let n = 0; while (P.mail && P.mail.length && mailClaim(0)) n++; return n; }

/* ---------- Storage: 120 slots shared by every storage keeper (P.storage, saved) ---------- */
const storageFind = uid => (P.storage || []).find(x => x.uid === uid) || null;
function storageRoom(id, n = 1) {
  if (!stackable(id)) return P.storage.length + 1 <= STORAGE_SLOTS;
  let free = 0; for (const ex of P.storage) if (ex.id === id) free += STACK_MAX - ex.qty;
  return n <= free + (STORAGE_SLOTS - P.storage.length) * STACK_MAX;
}
function storagePut(it) {   // no checks: callers check storageRoom first
  if (!stackable(it.id)) { P.storage.push(it); return; }
  let left = it.qty || 1;
  for (const ex of P.storage) { if (left <= 0) break; if (ex.id === it.id && ex.qty < STACK_MAX) { const k = Math.min(left, STACK_MAX - ex.qty); ex.qty += k; left -= k; } }
  while (left > 0) { const n = Math.min(left, STACK_MAX); left -= n; P.storage.push(left ? { uid: uidc++, id: it.id, qty: n } : Object.assign(it, { qty: n })); }
}
// Deposit n of a bag item (all of the stack when n is omitted). Costs storageFee() per deposit.
function storageDeposit(uid, n, quiet) {
  const it = P.inv.find(x => x.uid === uid); if (!it) return false;
  const t = ITEMS[it.id]; if (t.type === 'key') { if (!quiet) log('Quest items stay with you.', 'warn'); return false; }
  const q = stackable(it.id) ? clamp(n || it.qty, 1, it.qty) : 1;
  if (!storageRoom(it.id, q)) { if (!quiet) log(`Your storage is full (${STORAGE_SLOTS} slots).`, 'warn'); return false; }
  const fee = storageFee(); if (!zenyOk(fee)) return false;
  P.zeny -= fee;
  let moved = it;
  if (stackable(it.id) && q < it.qty) { it.qty -= q; moved = { uid: uidc++, id: it.id, qty: q }; } else P.inv.splice(P.inv.indexOf(it), 1);
  storagePut(moved);
  for (let i = 0; i < 9; i++) { const h = P.hot[i]; if (h && h.k === 'item' && h.id === it.id && countItem(it.id) === 0) P.hot[i] = null; }
  if (!quiet) log(`Stored ${itemName(moved)}${q > 1 ? ' ×' + q : ''} (${fmt(fee)}z).`, 'sys');
  UI.dirty = true; return true;
}
function storageWithdraw(uid, n, quiet) {
  const it = storageFind(uid); if (!it) return false;
  const q = stackable(it.id) ? clamp(n || it.qty, 1, it.qty) : 1;
  if (!bagRoom(it.id, q)) { if (!quiet) log('Your bag is full.', 'warn'); return false; }
  const fee = storageFee(); if (!zenyOk(fee)) return false;
  P.zeny -= fee;
  let moved = it;
  if (stackable(it.id) && q < it.qty) { it.qty -= q; moved = { uid: uidc++, id: it.id, qty: q }; } else P.storage.splice(P.storage.indexOf(it), 1);
  addItem(moved, true); questEvent('pickup', it.id);
  if (!quiet) log(`Took ${itemName(moved)}${q > 1 ? ' ×' + q : ''} from storage (${fmt(fee)}z).`, 'sys');
  UI.dirty = true; return true;
}
// Deposit every material (one fee per stack), skipping what an active quest still needs.
function storageDepositMats() { let n = 0; for (const it of P.inv.slice()) if (ITEMS[it.id].type === 'etc' && !questNeeds(it.id) && !it.lock) { if (!storageDeposit(it.uid, it.qty, true)) break; n++; } if (n) log(`Stored ${n} stack${n > 1 ? 's' : ''} of materials (${fmt(n * storageFee())}z).`, 'sys'); return n; }
const storageTabOf = it => { const t = ITEMS[it.id]; return t.type === 'equip' ? 'equip' : t.type === 'use' ? 'use' : t.type === 'card' ? 'card' : 'etc'; };

/* ---------- Crafting (Brokkr and Sindri; RECIPES in js/data/recipes.js) ---------- */
const craftLv = () => (P && P.skills && P.skills.craftsmanship) || 0;
const craftStation = () => UI.craftBy || 'brokkr';
function craftChance(r) { return clamp(Math.round(r.base + (craftLv() - r.lvl) * 4 + S.dex * 0.2 + S.luk * 0.1), 5, 99); }
// [Standard, Fine, Masterwork] % for crafted gear.
function craftQualityOdds() { const L = craftLv(), mw = clamp(Math.round(3 + L * 1.5 + S.luk * 0.1), 0, 30), fine = clamp(Math.round(15 + L * 3 + S.dex * 0.15), 0, 60); return [100 - mw - fine, fine, mw]; }
const craftHave = id => countItem(id);
function craftMissing(r) { return r.mats.filter(([id, n]) => craftHave(id) < n).map(([id, n]) => [id, n, craftHave(id)]); }
// Why this recipe cannot be made here and now (null = it can).
function craftWhy(r, by) {
  if (!r) return 'Unknown recipe.';
  if (!craftLv()) return 'You have not learned Craftsmanship. Brokkr can teach you (The Smith’s Apprentice).';
  if (by && !r.at.includes(by)) return `Only ${r.at.map(k => NPCS[k] ? NPCS[k].name : k).join(' or ')} can make this.`;
  if (craftLv() < r.lvl) return `Needs Craftsmanship Lv ${r.lvl}.`;
  const miss = craftMissing(r); if (miss.length) return 'Missing ' + miss.map(([id, n, h]) => `${ITEMS[id].name} ${h}/${n}`).join(', ') + '.';
  if (P.zeny < r.fee) return `Needs ${fmt(r.fee)} zeny.`;
  if (!bagRoom(r.out[0], r.out[1])) return 'Your bag is full.';
  return null;
}
function craftXpGain(r) {
  const L = craftLv(); if (L >= CRAFT_MAX) return;
  P.flags.craftXp = (P.flags.craftXp || 0) + 1 + r.lvl * 2;
  if (P.flags.craftXp >= CRAFT_XP(L)) { P.flags.craftXp -= CRAFT_XP(L); P.skills.craftsmanship = L + 1; floatText(P, 'Craftsmanship Up!', 'lvl'); log(`Your hands remember more. Craftsmanship Lv ${L + 1}.`, 'lvl'); Sfx.level(); }
}
// One attempt. Returns { ok, success, item, q } (ok = the attempt happened).
function craft(id, by, rng = RNG) {
  const r = RECIPES[id], why = craftWhy(r, by || craftStation());
  if (why) { log(why, 'warn'); return { ok: false, why }; }
  P.zeny -= r.fee; for (const [mid, n] of r.mats) takeItem(mid, n);
  P.flags.crafted = (P.flags.crafted || 0) + 1;
  const an = (map && map.objs.find(o => o.kind === 'anvil')) || P, t = ITEMS[r.out[0]];
  if (rng() * 100 >= craftChance(r)) {
    log(`The work cracks in the quench. ${r.name || t.name} is ruined, and the materials with it.`, 'bad'); Sfx.slam(); burst(an.x, an.y, 20, '#888', 18, 2.5);
    UI.dirty = true; return { ok: true, success: false };
  }
  let it, q = 0;
  if (t.type === 'equip') {
    const o = craftQualityOdds(), roll = rng() * 100; q = roll < o[2] ? 3 : roll < o[2] + o[1] ? 2 : 1;
    it = makeItem(t.id); it.q = q; it.maker = P.name; if (QUALITY[q].slot) it.slotsN = Math.min(2, it.slotsN + QUALITY[q].slot);
  } else it = makeItem(t.id, { qty: r.out[1] });
  P.flags.craftedOk = (P.flags.craftedOk || 0) + 1; if (q === 3) P.flags.masterworks = (P.flags.masterworks || 0) + 1;
  giveItem(it, NPCS[by || craftStation()] ? NPCS[by || craftStation()].name : 'the forge');
  log(`You made ${itemLabel(it)}.`, q === 3 ? 'unique' : q === 2 ? 'rare' : 'loot'); Sfx.level(); burst(an.x, an.y, 20, q === 3 ? '#ffb040' : '#ffd27a', 20, 2.5);
  craftXpGain(r); questEvent('pickup', t.id);
  UI.dirty = true; return { ok: true, success: true, item: it, q };
}
const recipesAt = by => Object.values(RECIPES).filter(r => r.at.includes(by));

/* ---------- Enchanting (Thordis): reroll the random affixes of non-unique gear ---------- */
function enchantWhy(it, useRare) {
  if (!it) return 'Choose a piece of gear.';
  const t = ITEMS[it.id]; if (t.type !== 'equip') return 'Only gear can be enchanted.';
  if (t.unique) return 'Unique gear already has its own will. It will not take a new one.';
  const T = enchantTier(it);
  if (P.zeny < T.zeny) return `Needs ${fmt(T.zeny)} zeny.`;
  const miss = T.mats.filter(([id, n]) => countItem(id) < n); if (miss.length) return 'Missing ' + miss.map(([id, n]) => `${ITEMS[id].name} ${countItem(id)}/${n}`).join(', ') + '.';
  if (useRare && (!T.rare || countItem(T.rare[0]) < T.rare[1])) return T.rare ? `Missing ${ITEMS[T.rare[0]].name}.` : 'This tier takes no rare material.';
  return null;
}
function enchantRoll(it, useRare, rng = RNG) {
  const t = ITEMS[it.id], L = t.lvl, cands = AFFIXES.filter(a => a.slots.includes(t.slot)).slice();
  const n = it.rarity === 'rare' ? 2 + (rng() < 0.5 ? 1 : 0) : it.rarity === 'magic' ? 1 + (rng() < 0.5 ? 1 : 0) : 1, out = [];
  for (let i = 0; i < n && cands.length; i++) {
    const a = cands.splice(Math.floor(rng() * cands.length), 1)[0]; let [lo, hi] = a.r(L); hi = Math.max(lo, hi);
    if (useRare) lo = Math.ceil((lo + hi) / 2);
    out.push({ s: a.s, v: lo + Math.floor(rng() * (hi - lo + 1)) });
  }
  return out;
}
function enchant(uid, useRare, rng = RNG) {
  const it = findItem(uid), why = enchantWhy(it, useRare); if (why) { log(why, 'warn'); return null; }
  const T = enchantTier(it); P.zeny -= T.zeny; for (const [id, n] of T.mats) takeItem(id, n); if (useRare) takeItem(T.rare[0], T.rare[1]);
  const before = itemName(it);
  it.affixes = enchantRoll(it, useRare, rng); if (it.rarity === 'common') it.rarity = 'magic';
  P.flags.enchants = (P.flags.enchants || 0) + 1;
  log(`Thordis sings over ${before}. It answers as ${itemName(it)}: ${it.affixes.map(a => bonusLine(a.s, a.v)).join(', ')}.`, 'magic'); Sfx.rare();
  burst(P.x, P.y, 30, '#9a8aff', 18, 2); calcStats(); UI.dirty = true; return it.affixes;
}

/* ---------- Card removal (Old Grímr): RO odds, CARD_REMOVAL in js/data/recipes.js ---------- */
function cardRemoveWhy(it, idx) {
  if (!it || !it.cards || !it.cards[idx]) return 'There is no card there.';
  const fee = cardRemovalFee(it, it.cards[idx]); if (P.zeny < fee) return `Needs ${fmt(fee)} zeny.`;
  if (!bagRoom(it.cards[idx], 1) || P.inv.length >= BAG_SLOTS - 1) return 'Make room in your bag first (two free slots).';
  return null;
}
// Returns 'success' | 'card' (the card broke) | 'item' (the item broke; its cards come back) | 'both' | null.
function cardRemove(uid, idx, rng = RNG) {
  const it = findItem(uid), why = cardRemoveWhy(it, idx); if (why) { log(why, 'warn'); return null; }
  const cid = it.cards[idx], fee = cardRemovalFee(it, cid), C = CARD_REMOVAL; P.zeny -= fee;
  const r = rng() * 100, out = r < C.success ? 'success' : r < C.success + C.cardBreaks ? 'card' : r < C.success + C.cardBreaks + C.itemBreaks ? 'item' : 'both';
  it.cards.splice(idx, 1);
  const name = itemName(it), cname = ITEMS[cid].name;
  if (out === 'item' || out === 'both') {
    for (const s of SLOTS) if (P.equip[s] === it) P.equip[s] = null;
    const i = P.inv.indexOf(it); if (i >= 0) P.inv.splice(i, 1);
    for (const c of it.cards) giveItem(makeItem(c), 'Old Grímr');
  }
  if (out === 'success' || out === 'item') giveItem(makeItem(cid), 'Old Grímr');
  P.flags.cardsPulled = (P.flags.cardsPulled || 0) + 1;
  const msg = { success: `Grímr teases ${cname} out of ${name} with a bone needle. Both are whole.`, card: `${cname} tears in half as it comes free. ${name} is unharmed.`, item: `${name} cracks down the middle, but ${cname} comes out whole.`, both: `Something snaps. ${cname} and ${name} are both ruined.` }[out];
  log(msg, out === 'success' ? 'card' : 'bad'); out === 'success' ? Sfx.rare() : Sfx.slam();
  calcStats(); UI.dirty = true; return out;
}

/* ---------- Vendors: unlimited supplies plus specials that restock every RESTOCK_SECS of play ---------- */
function vendorStock(v) {
  const all = P.flags.stock = P.flags.stock || {}, per = Math.floor(P.playTime / RESTOCK_SECS);
  let st = all[v]; if (!st || st.per !== per) st = all[v] = { per, sold: {} };
  return st;
}
const vendorSpecial = (v, id) => ((VENDORS[v] && VENDORS[v].specials) || []).find(s => s[0] === id) || null;
function vendorLeft(v, id) { const sp = vendorSpecial(v, id); return sp ? Math.max(0, sp[1] - (vendorStock(v).sold[id] || 0)) : Infinity; }
function vendorPrice(v, id) { const sp = vendorSpecial(v, id); return (sp && sp[2]) || ITEMS[id].price; }
const vendorRestockIn = () => RESTOCK_SECS - (P.playTime % RESTOCK_SECS);
function vendorSupplies(v) {
  const V = VENDORS[v]; if (V && V.supplies) return V.supplies.filter(id => ITEMS[id] && P.lvl >= (SUPPLY_MIN_LV[id] || 0));
  const sc = Object.keys(P.flags.shards).length;
  return SMITH_SUPPLIES.concat(sc >= 1 ? ['yellow_potion'] : [], sc >= 2 ? ['white_potion'] : [], P.flags.gate && P.lvl >= 40 ? ['honey_mead'] : []);
}
function vendorBuy(v, id, n = 1) {
  const t = ITEMS[id]; if (!t) return false; n = Math.max(1, n | 0);
  const left = vendorLeft(v, id); if (left <= 0) { log('Sold out. New stock comes in ' + Math.ceil(vendorRestockIn() / 60) + ' min.', 'warn'); return false; }
  n = Math.min(n, left); const cost = vendorPrice(v, id) * n;
  if (P.zeny < cost) return false;
  if (!bagRoom(id, t.type === 'equip' ? 1 : n)) { log('Your bag is full.', 'warn'); return false; }
  if (t.type === 'equip') addItem(makeItem(id)); else addItem(makeItem(id, { qty: n }));
  P.zeny -= cost; if (vendorSpecial(v, id)) { const st = vendorStock(v); st.sold[id] = (st.sold[id] || 0) + n; }
  log(`Bought ${t.name}${n > 1 ? ' ×' + n : ''}.`, 'loot'); Sfx.coin(); questEvent('pickup', id); UI.dirty = true; return true;
}

/* ---------- Selling: prices, junk, sorting ---------- */
// What a merchant pays. Equipment: half its price, more for magic/rare, refine and quality; materials: half price.
function sellPrice(i) {
  const t = ITEMS[i.id];
  if (t.type === 'equip') return Math.floor((t.price || 1500) / 2 * (i.rarity === 'rare' ? 2 : i.rarity === 'magic' ? 1.4 : 1) * (i.q ? [1, 1, 1.25, 1.6][i.q] : 1) + (i.refine || 0) * (100 + t.lvl * 10));
  if (t.type === 'card') return Math.floor((t.price || 40) / 2);
  return Math.floor((t.price || 0) / 2);
}
const questNeeds = id => Object.keys(P.quests.active).some(q => QUESTS[q].obj.some(o => (o.type === 'collect' || o.type === 'deliver') && o.item === id));
const usedInRecipes = id => Object.values(RECIPES).some(r => r.mats.some(m => m[0] === id));
// A rough power score for comparing two pieces for the same slot.
function itemScore(it) {
  if (!it) return 0; const t = ITEMS[it.id], b = itemBase(it); let s = b.atk + b.matk + (b.def + b.mdef) * 4;
  const add = o => { for (const k in o || {}) s += o[k] * (['str', 'agi', 'vit', 'int', 'dex', 'luk'].includes(k) ? 3 : k === 'maxhp' || k === 'maxsp' ? 0.05 : 1); };
  add(t.bonus); for (const a of it.affixes || []) add({ [a.s]: a.v }); for (const c of it.cards || []) add(ITEMS[c].bonus);
  return s;
}
const JUNK_DEFAULT = { mats: true, gear: true, magic: false, keepCraft: false };
// Junk: never locked items, keys, cards, consumables, stones, rare and refined materials, uniques, crafted, rare, refined or
// carded gear, nor gear that would be an upgrade you can wear.
function isJunk(it, o = JUNK_DEFAULT) {
  if (it.lock) return false; const t = ITEMS[it.id];
  if (t.type === 'etc') return !!o.mats && !t.stone && !t.rareMat && !t.refinedMat && !t.obol && !questNeeds(it.id) && !(o.keepCraft && usedInRecipes(it.id));
  if (t.type !== 'equip') return false;
  if (t.unique || t.crafted || it.rarity === 'rare' || it.refine || (it.cards || []).length) return false;
  if (it.rarity === 'magic' && !o.magic) return false; if (it.rarity === 'common' && !o.gear) return false;
  const cur = P.equip[t.slot]; if (jobOk(t, P.cls) && P.lvl >= t.lvl && itemScore(it) > itemScore(cur)) return false;
  return true;
}
function junkList(o) { return P.inv.filter(i => isJunk(i, o)); }
function sellJunk(o) {
  const js = junkList(o); let z = 0;
  for (const it of js) { z += sellPrice(it) * (it.qty || 1); P.inv.splice(P.inv.indexOf(it), 1); }
  P.zeny += z; if (js.length) { log(`Sold ${js.length} piece${js.length > 1 ? 's' : ''} of junk for ${fmt(z)} zeny.`, 'loot'); Sfx.coin(); }
  UI.dirty = true; return { n: js.length, zeny: z };
}
// Sort the bag: consumables, materials, cards, gear (by slot, then level), quest items; partial stacks merged.
function sortBag() {
  const rank = { use: 0, etc: 1, card: 2, equip: 3, key: 4 }, rr = { unique: 0, rare: 1, magic: 2, common: 3 };
  const merged = [], byId = {};
  for (const it of P.inv) {
    if (!stackable(it.id)) { merged.push(it); continue; }
    let ex = byId[it.id]; let left = it.qty;
    if (ex && ex.qty < STACK_MAX) { const k = Math.min(left, STACK_MAX - ex.qty); ex.qty += k; left -= k; }
    if (left > 0) { it.qty = left; merged.push(it); byId[it.id] = it; }
  }
  merged.sort((a, b) => { const A = ITEMS[a.id], B = ITEMS[b.id]; return (rank[A.type] - rank[B.type]) || (A.type === 'equip' ? (SLOTS.indexOf(A.slot) - SLOTS.indexOf(B.slot)) || (B.lvl - A.lvl) || (rr[a.rarity] - rr[b.rarity]) : 0) || A.name.localeCompare(B.name) || ((b.qty || 1) - (a.qty || 1)); });
  P.inv = merged; UI.dirty = true;
}

/* ---------- By sea: Captain Ormr (Skaldhaven) and Bolli (Mirewell, once he has his boat) ---------- */
function sail(dest, by) {
  const R = SHIP_ROUTES[dest]; if (!R) return false;
  if (!zenyOk(R.fare)) return false;
  P.zeny -= R.fare; Sfx.warp(); log(`${by || 'The captain'} takes your ${fmt(R.fare)} zeny and casts off. The ice creaks along the hull.`, 'sys');
  closeWin('way'); gotoMap(dest, R.x, R.y); return true;
}
// Hallgerð's rooms: full heal and a Well Rested buff (a small zeny sink).
function innRest() {
  const fee = INN_FEE(P.lvl); if (!zenyOk(fee)) return false;
  P.zeny -= fee; P.hp = S.maxhp; P.sp = S.maxsp; addBuff('rested', 'Well Rested', 'rested', 600, { maxhpPct: 5, maxsp: 40, luk: 2 }); P.hp = S.maxhp; P.sp = S.maxsp;
  if (PARTY && PARTY.members.length > 1 && typeof squadReviveAll === 'function') squadReviveAll(1, true);
  pillar(P, '#ffd8a0'); Sfx.heal(); log(`A warm bed above the Salt Hall (${fmt(fee)}z). You wake Well Rested.`, 'sys'); return true;
}

/* =========================================================
   Content round 6: rebirth, warg mounts, pets and Huginn.
   Data: CLASSES / REBORN_OF / MOUNT_CLASSES (js/data/classes.js), tier-3 skills (js/data/skills.js), PETS and the
   eggs (js/data/items.js), Ylva and the Heart (js/data/npcs.js), reborn_1..3 (js/data/quests.js).
   Rendering hooks (js/gfx-sheets.js, sprite team): P.mounted swaps the player to <cls>_<g>.mount_* sheets;
   window.COMPANIONS holds the pet and Huginn ({ kind, sheet, x, y, z, fx, fy, state, scale, owner, atkAnim, walk,
   tint, opacity, hidden }), all with manual: true: the logic below drives them from update(dt).
   ========================================================= */
const MOUNT_SPEED = 35;        // % move speed on a warg
const WARG_FEE = 20000;        // Ylva's rental (once; the warg stays yours)
const REBORN_STAT_SHARE = 0.2; // share of the status points you had invested that the reborn body keeps (50–150)
const noSpRegen = () => { for (const k in P.buffs) if (P.buffs[k].noSpRegen) return true; return false; };

/* ---------- Rebirth ---------- */
function rebornReady() { return !!P && CLASSES[P.cls].tier === 2 && P.lvl >= MAXLV && P.jlvl >= CLASSES[P.cls].maxJob && !P.flags.reborn; }
// Status points you have put into stats (what each point cost) plus the unspent ones.
function statInvested() { let n = P.statPts || 0; for (const k in P.st) for (let v = 1; v < P.st[k]; v++) n += statCost(v); return n; }
const rebornStatBonus = () => clamp(Math.round(statInvested() * REBORN_STAT_SHARE), 50, 150);
// The Heart of Yggdrasil spins the hero again: High Novice, Base 1, bonus status points; items, zeny, storage, quests,
// achievements and titles stay. Skills sleep in P.flags.reborn.skills until the reborn class wakes them (jobChange).
function rebirth() {
  if (!rebornReady()) return false;
  const from = P.cls, bonus = rebornStatBonus(), mem = {}, craftSk = P.skills.craftsmanship;
  for (const k in P.skills) if (P.skills[k] > 0 && !['basic', 'first_aid', 'craftsmanship'].includes(k)) mem[k] = P.skills[k];
  P.flags.reborn = { from, day: questDay(), lvl: P.lvl, jlvl: P.jlvl, skills: mem, stats: Object.assign({}, P.st), bonus };
  P.mounted = false;
  // Gear goes to the bag (the mailbox when it is full): a Base 1 body cannot carry it yet.
  for (const sl of SLOTS) { const it = P.equip[sl]; if (!it) continue; P.equip[sl] = null; giveItem(it, 'the Heart of Yggdrasil', true); }
  P.equip.weapon = makeItem('knife'); P.equip.body = makeItem('cotton_shirt');
  removeItems('urd_water', 1);
  Object.assign(P, { cls: 'high_novice', lvl: 1, exp: 0, jlvl: 1, jexp: 0, skillPts: 0, statPts: 25 + bonus, st: { str: 1, agi: 1, vit: 1, int: 1, dex: 1, luk: 1 }, skills: { basic: 0, first_aid: 1 } });
  if (craftSk !== undefined) P.skills.craftsmanship = craftSk;
  P.buffs = {}; P.spheres = 0; P.casting = null; P.pending = null; P.target = null;
  calcStats(); P.hp = S.maxhp; P.sp = S.maxsp;
  pillar(P, '#fff2c0', true); burst(P.x, P.y, 40, '#fff6d8', 60, 4); ring(P.x, P.y, 3, '#ffe8a0'); SHAKE_(0.3);
  banner('Reborn', 'The Norns spin your thread again', 'band gold'); Sfx.victory();
  log(`You are born again as a High Novice. You keep ${bonus} status points of your old strength (${25 + bonus} to spend). At Job Lv 10, Vidar will set you on the path of the ${CLASSES[REBORN_OF[from]].name}.`, 'lvl');
  questRefresh(); if ((P.titles || []).includes('reborn')) P.title = 'reborn';
  compSync(); renderHotbar(); renderBuffs(); UI.dirty = true; saveGame();
  return true;
}
// The reborn glow: a permanent aura buff (P.buffs.reborn, re-added after death), drawn by the VFX auras.
function rebornAura() { if (P.flags.reborn && !P.buffs.reborn) { P.buffs.reborn = { name: 'Reborn', icon: 'reborn', t: 1e9, max: 1e9, bonus: {}, count: '', perm: true, aura: { r: 0.75, col: '#ffe8a0' } }; renderBuffs(); } }

/* ---------- Warg mounts (Ash Knight, Rune Jarl) ---------- */
function canRide() {
  if (!P.flags.warg) return 'Rent a warg from Ylva in Skaldhaven first';
  if (!MOUNT_CLASSES.includes(P.cls)) return 'Only Ash Knights and Rune Jarls can ride a warg';
  if (P.dead) return 'You cannot ride now';
  return null;
}
// Toggle (or set with `on`) riding. Returns whether you are mounted afterwards.
function toggleMount(on) {
  const want = on === undefined ? !P.mounted : !!on;
  if (want === !!P.mounted) return !!P.mounted;
  if (want) { const why = canRide(); if (why) { log(why + '.', 'warn'); floatText(P, why, 'miss'); return false; } }
  if (P.casting) cancelCast(); P.charge = -1; P.blocking = false; P.sitting = false; P.dodgeT = 0;
  P.mounted = want; if (want) P.flags.rode = true;
  burst(P.x, P.y, 6, '#b8b0a0', 18, 2.4); Sfx.equip(); floatText(P, want ? 'Mounted' : 'Dismounted', 'info');
  log(want ? 'You swing up onto Grár’s back. (+35% speed; spear skills hit harder.)' : 'You slide down from your warg.', 'sys');
  calcStats(); if (typeof prefetchSheets === 'function') prefetchSheets(); UI.dirty = true;
  return P.mounted;
}
function rentWarg() {
  if (P.flags.warg) return true;
  if (!MOUNT_CLASSES.includes(P.cls)) { log('Only Ash Knights and Rune Jarls can ride a warg.', 'warn'); return false; }
  if (!zenyOk(WARG_FEE)) return false;
  P.zeny -= WARG_FEE; P.flags.warg = true; Sfx.coin(); log(`You rent a warg from Ylva (${fmt(WARG_FEE)}z). Press R, or use the Equipment window, to ride or dismount.`, 'lvl');
  toggleMount(true); saveGame(); return true;
}

/* ---------- Pets ---------- */
const PET_HUNGER_WORDS = [[10, 'Very Hungry'], [25, 'Hungry'], [75, 'Neutral'], [90, 'Satisfied'], [100, 'Stuffed']];
const PET_INTIM_WORDS = [[99, 'Awkward'], [249, 'Shy'], [749, 'Neutral'], [909, 'Cordial'], [1000, 'Loyal']];
const petWord = (L, v) => (L.find(e => v <= e[0]) || L[L.length - 1])[1];
const tameable = (m, type) => !!m && m.kind === 'mob' && !m.dead && m.type === type && !m.variant && !m.summoned && !m.d.boss;
// The monster a taming item is used on: the one under the cursor / locked / targeted, else the nearest of its kind.
function tameTarget(type) {
  const act = typeof isAction === 'function' && isAction();
  for (const m of [act && typeof CTRL !== 'undefined' ? CTRL.lock : hover, P.target]) if (tameable(m, type) && dist(P, m) <= 6) return m;
  let best = null, bd = 6; for (const m of mobs) if (tameable(m, type)) { const d = dist(m, P); if (d < bd) { bd = d; best = m; } } return best;
}
// Capture odds (%): the pet's base rate, +40 at no HP left, +0.3 per level above it, +0.15 per LUK; 1–95.
function tameChance(m) { const T = PETS[m.type]; return clamp(Math.round(T.rate + (1 - m.hp / m.maxhp) * 40 + (P.lvl - m.d.lvl) * 0.3 + S.luk * 0.15), 1, 95); }
function tameUse(it, rng = RNG) {
  const t = ITEMS[it.id], type = t.tames, m = tameTarget(type);
  if (!m) { log(`No ${MOBS[type].name} close enough to tame (within 6 cells).`, 'warn'); floatText(P, 'No target', 'miss'); return false; }
  takeItem(it.id, 1); face(P, m); burst(m.x, m.y, 30, t.color || '#f08aa8', 10, 1.6);
  const ch = tameChance(m);
  if (rng() * 100 >= ch) { floatText(m, 'Refused!', 'miss'); log(`The ${MOBS[type].name} eats the ${t.name} and wants nothing to do with you (${ch}% chance).`, 'warn'); aggro(m); Sfx.miss(); return false; }
  const i = mobs.indexOf(m); if (i >= 0) mobs.splice(i, 1); if (P.target === m) P.target = null;
  const mid = map.id, rg = m.rgn; after(rand(10, 18), () => { if (map.id === mid) spawnMobRandom(type, rg); });   // cycle 9: back in its own region
  const egg = makeItem('egg_' + type); egg.pet = { type, name: MOBS[type].name, hunger: PET_START.hunger, intim: PET_START.intim };
  giveItem(egg, 'Ylva');
  P.flags.tamed = P.flags.tamed || {}; P.flags.tamed[type] = (P.flags.tamed[type] || 0) + 1;
  pillar(m, '#ffb0c8'); burst(m.x, m.y, 20, '#ffb0c8', 24, 2.4); floatText(m, '♥ Tamed!', 'lvl');
  banner('Tamed', `${MOBS[type].name} · an egg is in your bag`, 'band gold'); log(`The ${MOBS[type].name} curls up into an egg. Hatch it from your bag or the Pet window (P).`, 'loot'); Sfx.rare();
  UI.dirty = true; return true;
}
function hatchEgg(it) {
  const type = ITEMS[it.id].pet; if (!PETS[type]) return false;
  if (P.pet && !petToEgg(true)) return false;   // one pet at a time: the one that is out goes back to its egg
  const i = P.inv.indexOf(it); if (i < 0) return false; P.inv.splice(i, 1);
  const d = it.pet || { name: MOBS[type].name, hunger: PET_START.hunger, intim: PET_START.intim };
  P.pet = { type, name: d.name || MOBS[type].name, hunger: clamp(+d.hunger || 0, 0, 100), intim: clamp(+d.intim || 1, 1, 1000), t: 0 };
  compSync(true); calcStats(); if (typeof prefetchSheets === 'function') prefetchSheets();
  burst(P.x + P.fx, P.y + P.fy, 10, '#fff0d8', 16, 1.8); log(`${P.pet.name} hatches and looks up at you.`, 'loot'); Sfx.pickup(); UI.dirty = true;
  return true;
}
function petToEgg(quiet) {
  const p = P.pet; if (!p) return false;
  if (P.inv.length >= BAG_SLOTS) { log('Your bag is full: there is no room for the egg.', 'warn'); return false; }
  const egg = makeItem('egg_' + p.type); egg.pet = { type: p.type, name: p.name, hunger: p.hunger, intim: p.intim };
  P.inv.push(egg); P.pet = null; compSync(); calcStats();
  if (!quiet) log(`${p.name} curls back up in its egg.`, 'sys'); UI.dirty = true; return true;
}
function petRename(name) {
  if (!P.pet) return false; const n = String(name || '').replace(/[<>&"]/g, '').trim().slice(0, 16);
  if (!n) return false; P.pet.name = n; log(`Your pet is called ${n} now.`, 'sys'); UI.dirty = true; return true;
}
function petRunAway() { const p = P.pet; log(`${p.name} was starving and ran away. It is gone.`, 'bad'); floatText(PETC.c || P, '…', 'miss'); P.pet = null; compSync(); calcStats(); UI.dirty = true; }
// Feeding: a hungry pet grows fonder, an overfed one sulks. Returns the intimacy change (false: nothing to feed).
function petFeed() {
  const p = P.pet; if (!p) { log('You have no pet out. Hatch an egg first.', 'warn'); return false; }
  if (!countItem('pet_food')) { log('You have no Pet Food. Ylva in Skaldhaven sells it.', 'warn'); return false; }
  takeItem('pet_food', 1);
  const h = p.hunger, d = h <= 10 ? 50 : h <= 25 ? 40 : h <= 75 ? 20 : h <= 90 ? -20 : -50, was = p.intim >= PET_BONUS_AT;
  p.intim = clamp(p.intim + d, 0, 1000); p.hunger = Math.min(100, h + 30);
  const c = PETC.c; floatText(c || P, d > 0 ? '♥' : '…', d > 0 ? 'heal' : 'miss'); if (c && d > 0) c.hopT = 0.5;
  log(d > 0 ? `${p.name} eats happily (intimacy +${d}).` : `${p.name} was already full and sulks (intimacy ${d}).`, d > 0 ? 'loot' : 'warn');
  if (p.intim >= 910) P.flags.petLoyal = true;
  if (p.intim <= 0) { petRunAway(); return d; }
  if ((p.intim >= PET_BONUS_AT) !== was) calcStats();
  Sfx.pickup(); UI.dirty = true; return d;
}
// Hunger falls 1 point a minute; a fed pet slowly grows fonder (+1 a minute while not hungry), a starving one
// loses 20 a minute and runs away at 0. Handles big steps (tests) in whole minutes.
function petTick(dt) {
  const p = P.pet; if (!p) return;
  p.t = (p.t || 0) + dt;
  while (P.pet === p && p.t >= PET_HUNGER_SECS) {
    p.t -= PET_HUNGER_SECS; const was = p.intim >= PET_BONUS_AT;
    p.hunger = Math.max(0, p.hunger - 1);
    if (p.hunger <= 0) p.intim -= 20; else if (p.hunger > 25) p.intim = Math.min(1000, p.intim + 1);
    if (p.intim >= 910) P.flags.petLoyal = true;
    if (p.hunger === 10) { log(`${p.name} is very hungry. Feed it (Pet window, P).`, 'warn'); floatText(PETC.c || P, 'Hungry!', 'miss'); }
    if (p.intim <= 0) { petRunAway(); return; }
    if ((p.intim >= PET_BONUS_AT) !== was) calcStats();
    UI.dirty = true;
  }
}

/* ---------- Companions (window.COMPANIONS, drawn by js/gfx-sheets.js) ---------- */
if (typeof window !== 'undefined' && !Array.isArray(window.COMPANIONS)) window.COMPANIONS = [];
// Cycle 8: the pet and the ravens belong to their hero (h._petc, h._hugc, h._muc). PETC.c / HUG.c / HUG.mu read and
// write the ones of the hero in context (P), so a companion's Huginn stays with that companion when you swap.
const PETC = { get c() { return P && P._petc || null; }, set c(v) { if (P) P._petc = v; } };                 // the pet's entry
const HUG = { get c() { return P && P._hugc || null; }, set c(v) { if (P) P._hugc = v; },                    // Huginn (Wolfhunter / Fenris Stalker)
  get mu() { return P && P._muc || null; }, set mu(v) { if (P) P._muc = v; } };                                // and Muninn (Huginn & Muninn only)
const HUG_SPEED = 15;                      // cells/s on a dive (the old Blitz Beat projectile speed)
const hugClass = () => !!P && (P.cls === 'wolfhunter' || P.cls === 'fenris_stalker');
const hugHome = () => !!HUG.c && !!P && !P.dead;
function compDrop(c) { const L = window.COMPANIONS, i = L.indexOf(c); if (i >= 0) L.splice(i, 1); }
function hugMake(temp) { return { kind: 'raven', sheet: 'pet_huginn', manual: true, owner: P, x: P.x, y: P.y, z: 0, fx: P.fx, fy: P.fy, state: 'perch', mode: 'perch', atkAnim: -1, still: 1, dives: [], strikeT: -1, temp: !!temp }; }
// Make COMPANIONS match the hero: the pet that is out, Huginn for the raven classes. reset: place them beside you.
function compSync(reset) {
  const L = window.COMPANIONS; if (!P) return;
  const H = heroes(); for (let i = L.length - 1; i >= 0; i--) if (L[i].owner && !L[i].critter && H.indexOf(L[i].owner) < 0) L.splice(i, 1);   // cycle 9: critters belong to the map   // cycle 8: a hero that left
  for (const h of H) withHero(h, compSyncOne, reset);
}
function compSyncOne(reset) {
  const L = window.COMPANIONS;
  const want = P.pet && PETS[P.pet.type] ? P.pet.type : null;
  if (PETC.c && PETC.c.type !== want) { compDrop(PETC.c); PETC.c = null; }
  if (want && !PETC.c) { PETC.c = { kind: 'pet', sheet: 'mob_' + want, type: want, manual: true, owner: P, scale: 0.6, state: 'idle', walk: 0, z: 0, fx: P.fx, fy: P.fy }; reset = true; }
  if (PETC.c && !L.includes(PETC.c)) L.push(PETC.c);
  if (hugClass() && !HUG.c) { HUG.c = hugMake(false); reset = true; }
  if (!hugClass() && HUG.c) { compDrop(HUG.c); HUG.c = null; }
  if (HUG.c && !L.includes(HUG.c)) L.push(HUG.c);
  if (!hugClass() && HUG.mu) { compDrop(HUG.mu); HUG.mu = null; }
  if (reset) {
    if (PETC.c) { const o = nearestOpen(P.x - (P.fx || 0) * 1.1, P.y - (P.fy || 1) * 1.1, 2); PETC.c.x = o ? o.x + 0.5 : P.x; PETC.c.y = o ? o.y + 0.5 : P.y; PETC.c.state = 'idle'; PETC.c.owner = P; }
    if (HUG.c) Object.assign(HUG.c, { x: P.x, y: P.y, z: 0, mode: 'perch', state: 'perch', dives: [], strikeT: -1, atkAnim: -1, owner: P, hidden: false });
    if (HUG.mu) { compDrop(HUG.mu); HUG.mu = null; }
  }
}
function compUpdate(dt) {
  if (!P || !map) return;
  if (PARTY && PARTY.members.length > 1) { for (const h of PARTY.members) if (h._petc || h._hugc || h._muc) withHero(h, compUpdateOne, dt); return; }   // cycle 8: each hero's own
  compUpdateOne(dt);
}
function compUpdateOne(dt) {
  if (PETC.c) { PETC.c.owner = P; petFollow(PETC.c, dt); }
  if (HUG.c) { HUG.c.owner = P; hugUpdate(HUG.c, dt); }
  if (HUG.mu) hugUpdate(HUG.mu, dt);
}
// The pet trots to a spot behind you (keeps up with a warg), goes around what it can, catches up through the rest.
function petFollow(c, dt) {
  const o = P, ofx = o.fx === undefined ? 1 : o.fx, ofy = o.fy || 0, ol = hyp(ofx, ofy) || 1, ux = ofx / ol, uy = ofy / ol;
  if (c.x === undefined || c.map !== map) { c.map = map; c.x = o.x - ux; c.y = o.y - uy; }
  const tx = o.x - ux * 1.1 + uy * 0.5, ty = o.y - uy * 1.1 - ux * 0.5;   // behind you, on the other side from Huginn
  const dx = tx - c.x, dy = ty - c.y, d = hyp(dx, dy);
  c.hopT = Math.max(0, (c.hopT || 0) - dt); c.z = c.hopT > 0 ? Math.sin(c.hopT / 0.5 * Math.PI) * 14 : 0;
  if (d > 12) { const s = nearestOpen(tx, ty, 3); if (s) { c.x = s.x + 0.5; c.y = s.y + 0.5; } return; }
  if (d > 0.35) {
    const sp = Math.min(d, dt * clamp(d * 4, 2.5, 10)), nx = c.x + dx / d * sp, ny = c.y + dy / d * sp;
    if (!blocked(nx, ny) || d > 2.5) { c.x = nx; c.y = ny; } else if (!blocked(nx, c.y)) c.x = nx; else if (!blocked(c.x, ny)) c.y = ny;
    c.fx = dx / d; c.fy = dy / d; c.walk = (c.walk || 0) + sp * 3.4; c.state = 'walk'; c.moving = true; c.idleT = 0;
  } else {
    c.state = 'idle'; c.moving = false; c.idleT = (c.idleT || 0) + dt;
    if (blocked(c.x, c.y)) { const s = nearestOpen(c.x, c.y, 2); if (s) { c.x = s.x + 0.5; c.y = s.y + 0.5; } }
    if (o.moving) { c.fx = ux; c.fy = uy; } else { const ex = o.x - c.x, ey = o.y - c.y, el = hyp(ex, ey) || 1; c.fx = ex / el; c.fy = ey / el; }
    if (P.pet && P.pet.intim >= 910 && c.idleT > 8) { c.idleT = 0; c.hopT = 0.5; floatText(c, '♥', 'heal'); if (Math.random() < 0.3) log(`${P.pet.name} ${PETS[P.pet.type].trick}.`, 'sys'); }
  }
}
// Blitz Beat through the companion: Huginn flies to the target (state 'fly'), strikes ('attack', atkAnim 0..1, the
// hits land at the sheet's hit frame), then flies back ('fly') and perches on your shoulder ('perch') when you stand still.
function huginnDive(t, n, dmg, o = {}) {
  const c = HUG.c; if (!c || !t) return;
  if (c.dives.length < 4) c.dives.push({ t, n, dmg });
  if (c.mode !== 'dive') { c.mode = 'dive'; c.strikeT = -1; c.hidden = false; }
  if (o.muninn) {
    const mu = HUG.mu || (HUG.mu = hugMake(true)); if (!window.COMPANIONS.includes(mu)) window.COMPANIONS.push(mu);
    Object.assign(mu, { x: P.x + (P.fy || 0) * 0.8, y: P.y - (P.fx || 0) * 0.8, z: 10, tint: [0.72, 0.78, 1], opacity: 1, hidden: false, dives: [{ t, n, dmg }], mode: 'dive', strikeT: -1, atkAnim: -1, owner: P });
  }
}
function hugUpdate(c, dt) {
  const o = P, ofx = o.fx === undefined ? 1 : o.fx, ofy = o.fy || 0, ol = hyp(ofx, ofy) || 1, ux = ofx / ol, uy = ofy / ol;
  c.still = o.moving || o.dash ? 0 : (c.still || 0) + dt;
  if (c.mode === 'dive') {
    const D = c.dives[0];
    if (!D || (D.t.dead && !D.hit) || !mobs.includes(D.t)) { c.dives.shift(); c.strikeT = -1; if (!c.dives.length) { c.mode = c.temp ? 'leave' : 'return'; c.atkAnim = -1; } return; }
    const t = D.t;
    if (c.strikeT < 0) {   // flying in: flap far out, the dive's wind-up frames over the last 2.5 cells
      const dx = t.x - c.x, dy = t.y - c.y, d = hyp(dx, dy), sp = HUG_SPEED * dt;
      if (d > 0.01) { c.fx = dx / d; c.fy = dy / d; }
      c.state = d < 2.5 ? 'attack' : 'fly'; c.atkAnim = d < 2.5 ? clamp(0.45 * (1 - d / 2.5), 0, 0.45) : -1; c.z = Math.min(40, d * 8);
      if (d <= sp + 0.3) { c.x = t.x; c.y = t.y; c.strikeT = 0; } else { c.x += dx / d * sp; c.y += dy / d * sp; }
    } else {               // the strike: hits at the hit frame (atkAnim 0.5 = frame 3 of 6)
      c.strikeT += dt; c.x = t.x; c.y = t.y; c.z = 0; c.state = 'attack'; c.atkAnim = Math.min(0.99, 0.45 + c.strikeT / 0.4 * 0.55);
      if (!D.hit && c.atkAnim >= 0.5) { D.hit = true; for (let i = 0; i < D.n; i++) after(i * 0.1, () => { if (!t.dead) { trueHit(t, D.dmg, 'neutral'); burst(t.x, t.y, 34, '#c8d8ff', 6, 2.5); } }); }
      if (c.strikeT >= 0.4 + 0.1 * D.n) { c.dives.shift(); c.strikeT = -1; c.atkAnim = -1; if (!c.dives.length) c.mode = c.temp ? 'leave' : 'return'; }
    }
    return;
  }
  if (c.mode === 'leave') {   // Muninn flies off into the sky and fades
    c.state = 'fly'; c.z = (c.z || 0) + dt * 60; c.x += (c.fx || 0) * dt * 8; c.y += (c.fy || 0) * dt * 8; c.opacity = Math.max(0, (c.opacity === undefined ? 1 : c.opacity) - dt * 1.5);
    if (c.opacity <= 0) { compDrop(c); if (HUG.mu === c) HUG.mu = null; }
    return;
  }
  const hx = o.x - uy * 0.8 + ux * 0.15, hy = o.y + ux * 0.8 + uy * 0.15;   // beside your shoulder (the pet trots behind on the other side)
  if (c.mode === 'return' || c.mode === 'follow') {
    const dx = hx - c.x, dy = hy - c.y, d = hyp(dx, dy);
    if (d > 14) { c.x = hx; c.y = hy; }
    else if (d > 0.08) { const sp = Math.min(d, dt * Math.max(4, Math.min(12, d * 2.5))); c.x += dx / d * sp; c.y += dy / d * sp; c.fx = dx / d; c.fy = dy / d; }
    else { c.fx = ofx; c.fy = ofy; }
    c.state = 'fly'; c.atkAnim = -1; const zt = 14 + Math.sin(time * 3.1) * 4; c.z += clamp(zt - (c.z || 0), -dt * 40, dt * 40);   // a little above shoulder height, bobbing
    if (c.mode === 'return' && d < 0.8) c.mode = 'follow';
    if (c.mode === 'follow' && !o.moving && c.still > 0.6 && d < 1) { c.mode = 'perch'; c.x = o.x; c.y = o.y; }
    return;
  }
  c.state = 'perch'; c.mode = 'perch'; c.x = o.x; c.y = o.y; c.z = 0; c.fx = ofx; c.fy = ofy; c.atkAnim = -1;   // perched
  if (o.moving || o.dash) c.mode = 'follow';
}

/* =========================================================
   Content round 7: Helheim (engine). Data: js/data/maps.js (helheim, helheim_hvergelmir, helheim_arena, deepDef),
   mobs.js (the Helheim monsters, Garmr, Níðhöggr), items.js, npcs.js (camp services, scenes), quests.js (Act III).
   Saved state (all inside P.flags, so SAVE_KEYS is unchanged): bossAt (MVP respawn clock), deep = { best, runs,
   floors, run: { seed, floor, cp, cleared, start } }, rush = { best, runs, clears, board: [...] }. Older saves have
   none of these; every reader below creates them on first use.
   ========================================================= */
// Hel's law: the Helgrind road opens for a hero who finished Act II and has been born again (and is Base Lv 70+).
const helRoadOpen = () => !!(P && P.quests && P.quests.done.act2_12 && P.flags.reborn && P.lvl >= 70);

/* ---------- Monster mechanics ---------- */
// What a landed blow of a Helheim monster does besides damage (MOBS[k].hitFx).
// Perf round 5: a Helheim horde lands chill / rot / stagger many times a second, and every blow used to rebuild the
// buff (addBuff: calcStats + renderBuffs) and then render the buff bar again. When the same debuff is already on the
// hero with the same bonus, hitRefresh now just restarts its clock (what a fresh addBuff would have left behind:
// t = max = secs, no tick progress); the stats and the buff bar cannot have changed, so neither is rebuilt. A new or
// different debuff still goes through addBuff (which renders the bar once).
const ROT_TICK = () => { if (!P.dead) hurtP(Math.max(1, Math.round(S.maxhp * 0.01))); };
function sameBonus(a, b) { let n = 0; for (const k in a) { if (a[k] !== b[k]) return false; n++; } for (const k in b) n--; return n === 0; }
function hitRefresh(id, name, icon, secs, bonus, extra) {
  const bf = P.buffs[id];
  if (bf && bf.name === name && bf.icon === icon && bf.bonus && sameBonus(bf.bonus, bonus) && (!extra || (bf.every === extra.every && bf.onTick === extra.onTick))) {
    if (MG.check) { const s0 = S; calcStats(); if (JSON.stringify(s0) !== JSON.stringify(S)) MG.statMismatch = (MG.statMismatch || 0) + 1; }   // perf.py --mg-check
    bf.t = secs; bf.max = secs; if (bf.tk !== undefined) delete bf.tk; return;
  }
  addBuff(id, name, icon, secs, bonus, extra);
}
function hitFx(kind, m) {
  if (kind === 'chill') hitRefresh('chill', 'Chilled', 'hex', 2.5, { move: -20, aspd: -10 });
  else if (kind === 'hex') { if (Math.random() < 0.35) hexed(25); }
  else if (kind === 'rot') { if (Math.random() < 0.4) { if (!P.buffs.rot) hlog('Rot seeps into the wound.', 'warn'); hitRefresh('rot', 'Rot', 'hex', 5, {}, { every: 1, onTick: ROT_TICK }); } }
  else if (kind === 'stagger') { if (Math.random() < 0.5) { hitRefresh('stagger', 'Staggered', 'hex', 1, { move: -40 }); P.stamina = Math.max(0, P.stamina - 15); if (typeof SHAKE !== 'undefined' && !HCTX.quiet) SHAKE = Math.max(SHAKE, 0.15); } }
}
// A parried lunge: the beast is knocked off balance (stunned for `secs`) and exposed (+30 % damage taken).
function parryStagger(m, secs) {
  m.leap = null; m.z = 0; m.atkAnim = -1; markMob(m, secs + 1, 30); floatText(m, 'Staggered!', 'crit');
  ring(m.x, m.y, 1.8, '#fff0b0'); burst(m.x, m.y, 30, '#fff0b0', 20, 3); if (typeof SHAKE !== 'undefined') SHAKE = Math.max(SHAKE, 0.25); if (typeof HITSTOP !== 'undefined') HITSTOP = Math.max(HITSTOP, 0.12);
  m.parried = (m.parried || 0) + 1;
}
// Blood-fire left along Garmr's lunges once his four eyes are open.
function trailZone(m, x, y, col) {
  if (zones.filter(z => z.hostile).length > 24) return;
  hexZone(m, { r: 0.9, dur: 4, tick: 0.25, slow: 20, rune: 'ᛉ' }, x, y, col);
}
// Boss phases (MOBS[k].phases): one-time changes as HP falls.
function mobPhases(m) {
  const d = m.d, i = m.phase || 0, ph = d.phases[i]; if (!ph || m.hp > m.maxhp * ph.at) return;
  m.phase = i + 1;
  banner(d.name, ph.sub || ph.name, 'band'); if (ph.log) log(ph.log, 'boss'); Sfx.boss(); floatText(m, ph.name, 'shout');
  if (typeof SHAKE !== 'undefined') SHAKE = Math.max(SHAKE, 0.35);
  if (ph.unchain) { m.unchained = true; burst(m.x, m.y, 20, '#c8c0b0', 30, 4); }
  if (ph.speed) m.spdMul = ph.speed; if (ph.cdMul) m.cdMul = ph.cdMul; if (ph.trail) m.trail = true;
  if (ph.summon) for (let k = 0; k < ph.summon[1]; k++) { const s = nearestOpen(m.x + rand(-3, 3), m.y + rand(-3, 3), 3); if (!s) continue; const c = makeMob(ph.summon[0], s.x + 0.5, s.y + 0.5, { summoned: true }); if (m.scaleL) { scaleMobTo(c, m.scaleL - 6); c.rush = m.rush; } c.state = 'chase'; mobs.push(c); burst(c.x, c.y, 10, '#6a5a5a', 12, 2); }
  if (ph.gnaw) gnawStart(m, ph.gnaw);
}
// Níðhöggr's Gnawing: it returns to the root and feeds, immune and healing, while its sap-swollen brood attack. Kill
// the brood to split the bark (the dragon is stunned and exposed); if the time runs out it has fed (and healed).
function gnawStart(m, g) {
  m.leap = null; m.z = 0; m.path = null; teles = teles.filter(t => t.m !== m);
  const hx = m.hx, hy = m.hy; burst(m.x, m.y, 20, '#8aff3a', 24, 3); m.x = hx; m.y = hy; m.fx = 0; m.fy = -1;
  const adds = [];
  for (let k = 0; k < (g.adds || 3); k++) { const a = k / (g.adds || 3) * 6.283, s = nearestOpen(hx + Math.cos(a) * 5, hy + 3 + Math.sin(a) * 3, 3); if (!s) continue; const c = makeMob('nidhogg_spawn', s.x + 0.5, s.y + 0.5, { summoned: true }); if (m.scaleL) scaleMobTo(c, m.scaleL - 6); else scaleMobTo(c, 92, { hpMul: 1.4 }); c.sap = true; c.state = 'chase'; mobs.push(c); adds.push(c); burst(c.x, c.y, 10, '#8aff3a', 16, 2.5); }
  m.gnaw = { t: g.secs || 30, heal: g.heal || 0.004, adds, rain: 5 };
  floatText(m, 'Gnawing…', 'shout'); questToast('Níðhöggr feeds · kill its brood', 'new');
}
function gnawTick(m, dt) {
  const G = m.gnaw; m.moving = false; m.atkCD = Math.max(m.atkCD, 0.5);
  if (partyWiped()) { m.gnaw = null; return; }
  m.hp = Math.min(m.maxhp, m.hp + m.maxhp * G.heal * dt); G.t -= dt; G.rain -= dt;
  if (G.rain <= 0) { G.rain = 7; doAbility(m, { id: 'rain', n: 5, r: 1.5, mul: 1.3, delay: 1.6 }); }
  let alive = 0; for (const a of G.adds) if (!a.dead) alive++;
  if (!alive || G.t <= 0) {
    m.gnaw = null;
    if (!alive) { m.stun = 3; markMob(m, 6, 25); banner(m.d.name, 'The bark splits', 'band'); log('The last of the brood falls, and the bark over Níðhöggr’s hide splits open. It shrieks off the root.', 'boss'); floatText(m, 'Exposed!', 'crit'); }
    else { log('Níðhöggr has fed. It lets go of the root, fatter and angrier.', 'boss'); floatText(m, 'Fed', 'shout'); }
    Sfx.boss(); if (typeof SHAKE !== 'undefined') SHAKE = Math.max(SHAKE, 0.4);
  }
}
// A copy of a monster's data at another level (the Deep, the Gauntlet, their summons). HP grows with the square of
// the level ratio and ATK with its 1.5th power (the curve of the monster table), DEF/MDEF a little; the copy never
// carries story payloads (shards, lore, respawn, chains).
function scaledData(type, L, o = {}) {
  const b = MOBS[type], r = L / b.lvl, am = (o.atkMul || 1) * Math.pow(r, 1.5);
  const d = Object.assign({}, b, { lvl: L, hp: Math.round(o.hp || b.hp * r * r * (o.hpMul || 1)), atk: o.atk || [Math.round(b.atk[0] * am), Math.round(b.atk[1] * am)],
    def: Math.min(85, Math.round(b.def + (L - b.lvl) * 0.25)), mdef: Math.min(80, Math.round(b.mdef + (L - b.lvl) * 0.2)),
    shard: undefined, lore: undefined, respawn: undefined, chain: undefined, _nl: undefined }, o.extra || {});
  return d;
}
function scaleMobTo(m, L, o) { m.d = scaledData(m.type, Math.max(1, Math.round(L)), o); m.hp = m.maxhp = m.d.hp; m.scaleL = m.d.lvl; return m; }

/* ---------- The Deep Roots (procedural floors helheim_deep_<n>) ----------
   A run has a seed (P.flags.deep.run.seed); floor n of a run is always the same map (deepDef in js/data/maps.js).
   Each visit fills the floor with monsters scaled to its depth (deepLevel). The descend portal (lock 'deep') opens
   when 60 % of the floor's monsters are down or its warden is dead; on every 5th floor, when the boss is dead.
   Opening it pays the floor's reward (Obols, zeny, supplies, gear; more with depth). Boss floors are checkpoints:
   Ganglati lets you start the run again from the floor after the last boss you beat. */
const DEEP_CLEAR = 0.6;
var DEEP = { id: null, floor: 0, total: 0, killed: 0, cleared: false, warden: null, boss: null, shown: 0 };
function deepState() {
  const f = P.flags; if (!f.deep || typeof f.deep !== 'object') f.deep = {};
  const D = f.deep; D.best = D.best | 0; D.runs = D.runs | 0; D.floors = D.floors | 0; D.bosses = D.bosses | 0;
  if (D.run && (typeof D.run !== 'object' || !D.run.seed)) D.run = null; return D;
}
function deepNewRun(seed) {
  const D = deepState();
  for (const k of Object.keys(MAPDEFS)) if (/^helheim_deep_\d+$/.test(k)) { delete MAPDEFS[k]; delete mapCache[k]; }
  D.run = { seed: seed || (((Math.random() * 2147483646) | 0) + 1), floor: 0, cp: 1, cleared: 0, start: Math.round(P.playTime) }; D.runs++;
  return D.run;
}
function deepEnsure(id) {
  const mm = /^helheim_deep_(\d+)$/.exec(id); if (!mm) return;
  let seed = 1; if (typeof P !== 'undefined' && P && P.flags) { const D = deepState(); if (!D.run) deepNewRun(); seed = D.run.seed; }
  MAPDEFS[id] = deepDef(Math.max(1, +mm[1]), seed);
}
const deepHas = k => !!(map && map.d.deep && map.d.plan && map.d.plan.aff.includes(k));
function deepGo(n, fresh) {
  if (fresh) deepNewRun(); else if (!deepState().run) deepNewRun();
  const id = 'helheim_deep_' + n, m = genMap(id); Sfx.warp(); gotoMap(id, m.entry.x + 0.5, m.entry.y + 0.5); return m;
}
// Monsters of floor n: Helheim's own, then the older dead of Midgard, scaled; the heavier kinds join deeper down.
function deepPool(n) {
  const p = [['soul_wisp', 3], ['hel_hound', 3], ['hel_draugr', 3], ['skeleton_soldier', 1], ['wraith', 1], ['grave_archer', 1], ['draugr_fisher', 1]];
  if (n >= 3) p.push(['corpse_bride', 3], ['dwarf_revenant', 1], ['ice_wraith', 1]);
  if (n >= 6) p.push(['nidhogg_spawn', 3], ['valkyrie_shade', 1]);
  if (n >= 8) p.push(['bone_colossus', 2]);
  return p;
}
function deepPopulate() {
  const d = map.d, plan = d.plan, n = d.deep, L = plan.lvl, run = deepState().run;
  Object.assign(DEEP, { id: map.id, floor: n, total: 0, killed: 0, cleared: !!(run && run.cleared >= n), warden: null, boss: null, shown: 0 });
  const pool = deepPool(n), tw = pool.reduce((a, e) => a + e[1], 0), pickT = () => { let x = Math.random() * tw; for (const [t, w] of pool) { x -= w; if (x <= 0) return t; } return pool[0][0]; };
  const rooms = map.rooms.filter(r => r.kind !== 'start' && (!plan.boss || r.kind !== 'boss')), area = r => (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1), ta = rooms.reduce((a, r) => a + area(r), 0);
  const portal = map.deepPortal, spotIn = r => { for (let k = 0; k < 30; k++) { const x = randi(r.x0, r.x1), y = randi(r.y0, r.y1); if (!blocked(x, y) && map.reach[y * map.w + x] && hyp(x + 0.5 - portal.x, y + 0.5 - portal.y) > 2.5) return { x: x + 0.5, y: y + 0.5 }; } return null; };
  let count = plan.boss ? 6 + Math.floor(n / 5) * 2 : Math.min(58, 16 + 3 * n); if (plan.aff.includes('restless')) count = Math.round(count * 1.3);
  for (let i = 0; i < count && rooms.length; i++) {
    let x = Math.random() * ta, r = rooms[0]; for (const q of rooms) { x -= area(q); if (x <= 0) { r = q; break; } }
    const s = spotIn(r); if (!s) continue;
    const m = scaleMobTo(makeMob(pickT(), s.x, s.y), L + randi(-1, 1), { atkMul: plan.aff.includes('restless') ? 1.15 : 1 }); m.deep = true;
    if (plan.aff.includes('restless')) m.d.drops = (m.d.drops || []).map(([id, ch]) => [id, Math.min(1, ch * 1.5)]);
    mobs.push(m); DEEP.total++;
  }
  const end = map.deepEnd;
  if (plan.boss) {   // the floor's boss: one of Midgard's MVPs, raised again down here
    const k = plan.bossType, B = MOBS[k], BL = L + 4, s = nearestOpen(end.cx, end.cy + 2, 4);
    const m = makeMob(k, s.x + 0.5, s.y + 0.5), bhp = Math.round(1600 * BL * (1 + 0.05 * n)), ba = 9 * BL;
    m.d = scaledData(k, BL, { hp: bhp, atk: [Math.round(ba * 0.88), Math.round(ba * 1.12)], extra: { name: B.name, title: `Risen in the Deep · Floor ${n}`, variant: true, base: k, tint: '#9affd0', scaleMul: 1, intro: B.intro, outro: `${B.name} sinks back into the roots. Below, the way down opens.` } });
    m.hp = m.maxhp = m.d.hp; m.scaleL = BL; m.deep = true; m.deepBoss = true; mobs.push(m); DEEP.boss = m;
  } else {   // the warden guards the way down
    const k = ['bone_colossus', 'corpse_bride', 'hel_draugr', 'nidhogg_spawn'][n % 4], B = MOBS[k], s = nearestOpen(end.cx - 2, end.cy + 1, 3) || { x: end.cx, y: end.cy };
    const m = scaleMobTo(makeMob(k, s.x + 0.5, s.y + 0.5), L + 4, { hpMul: 6, extra: { name: `${B.name}, Warden of Floor ${n}`, title: 'Warden of the Deep', elite: true, useAbil: true, variant: true, base: k, tint: '#ffd27a', scaleMul: 1.35, expMul: 4,
      abil: [{ id: 'slam', cd: 7, r: 2.6, mul: 1.5, delay: 1.1 }, { id: 'lunge', cd: 9, len: 6, w: 1.1, mul: 1.7, delay: 1.0, parry: 2, col: '#ffd27a' }] } });
    m.deep = true; m.deepWarden = true; mobs.push(m); DEEP.warden = m;
  }
}
function deepKilled(m) {
  if (!map || !map.d.deep || m.summoned) return;
  if (m.deepWarden) { deepClear('warden'); return; }
  if (m.deepBoss) { deepState().bosses++; deepClear('boss'); return; }
  DEEP.killed++;
  const pct = DEEP.total ? DEEP.killed / DEEP.total : 1, step = Math.floor(pct * 10);
  if (!DEEP.cleared && step > DEEP.shown && step < 6) { DEEP.shown = step; questToast(`Floor ${DEEP.floor}: ${Math.round(pct * 100)} % of the dead laid down (${Math.round(DEEP_CLEAR * 100)} % opens the way)`, ''); }
  if (!map.d.plan.boss && pct >= DEEP_CLEAR) deepClear('cleared');
}
function deepCleared() { return !!(map && map.d.deep && DEEP.id === map.id && DEEP.cleared); }
function deepLockMsg() {
  if (!map || !map.d.deep) return 'The way down is sealed.';
  if (map.d.plan.boss) return `The way down is sealed until ${map.d.plan.bossType ? MOBS[map.d.plan.bossType].name : 'the floor’s master'} falls.`;
  return `The way down is sealed. Lay ${Math.round(DEEP_CLEAR * 100)} % of this floor’s dead to rest (${DEEP.total ? Math.round(DEEP.killed / DEEP.total * 100) : 0} % so far), or kill its warden.`;
}
function deepClear(why) {
  if (DEEP.cleared || !map || !map.d.deep) return;
  DEEP.cleared = true; const n = map.d.deep, plan = map.d.plan, D = deepState(), run = D.run;
  if (run) { run.cleared = Math.max(run.cleared || 0, n); if (plan.boss) run.cp = Math.max(run.cp || 1, n + 1); }
  D.floors++;
  banner('The Way Down Opens', why === 'boss' ? `Floor ${n} · its master has fallen` : why === 'warden' ? `Floor ${n} · the warden is dead` : `Floor ${n} · the dead lie still`, 'band gold');
  log(`The portal to floor ${n + 1} flares green in the ${plan.boss ? 'arena' : 'far hall'}.${plan.boss ? ' This floor is a checkpoint now: Ganglati can send you back down to floor ' + (n + 1) + '.' : ''}`, 'quest'); Sfx.level();
  deepReward(n, plan);
  saveGame();
}
// Rewards grow with depth: Obols (Gauti trades them), zeny, supplies, gear of the floor's level; boss floors more.
function deepReward(n, plan) {
  const g = plan.aff.includes('gilded') ? 2 : 1, ob = (plan.boss ? 5 + n : n) * g, z = 1500 * n * g, at = map.deepPortal, L = plan.lvl;
  giveItem(makeItem('hel_obol', { qty: ob }), 'the Deep'); P.zeny += z;
  const sup = makeItem('gjoll_draught', { qty: 1 + Math.floor(n / 4) }); giveItem(sup, 'the Deep');
  const got = [`${ob} Hel’s Obols`, `${fmt(z)} zeny`, `${sup.qty} Draught${sup.qty > 1 ? 's' : ''} of Gjöll`];
  if (plan.boss || Math.random() < 0.4 + n * 0.02) dropItem(rollEquip(Math.min(99, L)), at);
  if (plan.boss) { dropItem(makeItem('black_sun_shard'), at); if (n >= 10) dropItem(makeItem('golden_apple'), at); got.push('treasure at the portal'); }
  else if (plan.aff.includes('restless') && Math.random() < 0.5) dropItem(rollEquip(Math.min(99, L)), at);
  log(`The Deep pays its due: ${got.join(', ')}.`, 'quest'); Sfx.coin();
}
function deepArrive(first) {
  const n = map.d.deep, D = deepState(), plan = map.d.plan;
  if (!D.run || D.run.seed !== map.d.run) D.run = { seed: map.d.run, floor: 0, cp: 1, cleared: 0, start: Math.round(P.playTime) };
  D.run.floor = n;
  if (n > D.best) { D.best = n; if (n > 1) questToast(`New deepest floor: ${n}`, 'ready'); if (n >= 10) grantTitle('deep_walker'); if (n >= 20) grantTitle('root_diver'); }
  for (const k of plan.aff) if (first) log(`${DEEP_AFFIXES[k].name}: ${DEEP_AFFIXES[k].desc}`, 'warn');
  if (plan.aff.includes('frozen')) for (const h of heroes()) withHero(h, () => { addBuff('deep_frozen', 'Frozen Floor', 'hex', 1e9, { move: -15 }, { perm: true }); renderBuffs(); });   // cycle 8: every hero
  if (first) log(plan.boss ? `Floor ${n}. Something enormous is waiting in the arena to the north.` : `Floor ${n}. Somewhere in the far hall a warden keeps the way down.`, 'sys');
}
function deepLeave() {
  for (const h of heroes()) withHero(h, () => { if (P && P.buffs && P.buffs.deep_frozen) { delete P.buffs.deep_frozen; calcStats(); if (typeof renderBuffs === 'function') renderBuffs(); } });
  DEEP.id = null;
}

/* ---------- The Gauntlet (boss rush in Eljudnir, helheim_arena) ----------
   Nine of the great beasts, one after another, raised by Hel for her hall's amusement: the eight MVPs of Midgard and
   Garmr, all at Lv 90. The clock runs from the first to the last. A fall, or leaving the hall, ends the run. Personal
   bests are kept in P.flags.rush.board (the five fastest clears); Ganglöt reads them out. */
const RUSH_LIST = ['blight_mother', 'hati', 'sir_gaunt', 'drowned_jarl', 'bog_crone', 'fafnir', 'ashen_king', 'fenrir', 'garmr'];
const RUSH_LV = 90;
var RUSH = { on: false, t: 0, i: 0, wait: 0, cur: null, splits: [], shown: -1 };
function rushState() { const f = P.flags; if (!f.rush || typeof f.rush !== 'object') f.rush = {}; const R = f.rush; R.runs = R.runs | 0; R.clears = R.clears | 0; if (!Array.isArray(R.board)) R.board = []; return R; }
const rushHP = i => 60000 + 15000 * i;
function rushStart() {
  if (!map || map.id !== 'helheim_arena' || RUSH.on) return false;
  for (const m of mobs) if (m.rush) m.dead = true;
  Object.assign(RUSH, { on: true, t: 0, i: 0, wait: 3, cur: null, splits: [], shown: -1 });
  rushState().runs++;
  banner('The Gauntlet', 'Nine great beasts. The dead are counting.', 'band gold'); log('The benches of Eljudnir roar. Ganglöt strikes a bone gong: the Gauntlet has begun. The clock runs until the last beast falls.', 'boss'); Sfx.boss();
  return true;
}
function rushTick(dt) {
  if (!map || map.id !== 'helheim_arena') { rushAbort('The Gauntlet is over.'); return; }
  if (partyWiped()) { rushAbort('You fell in the Gauntlet. The dead of Eljudnir howl with laughter.'); return; }
  RUSH.t += dt;
  if (RUSH.wait > 0) { RUSH.wait -= dt; if (RUSH.wait <= 0) rushSpawn(); }
  const sec = Math.floor(RUSH.t * 4); if (sec !== RUSH.shown) { RUSH.shown = sec; const el = typeof $ === 'function' && $('bosst'); if (el && RUSH.cur && !RUSH.cur.dead && bossShown === RUSH.cur) el.textContent = `Gauntlet ${RUSH.i + 1}/${RUSH_LIST.length} · ${rushClock(RUSH.t)}`; }
}
const rushClock = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}.${Math.floor((t * 10) % 10)}`;
function rushSpawn() {
  const k = RUSH_LIST[RUSH.i], at = map.rushAt || map.entry, s = nearestOpen(at.x, at.y, 4) || at, B = MOBS[k];
  const m = makeMob(k, s.x + 0.5, s.y + 0.5), a = 9 * RUSH_LV;
  m.d = scaledData(k, RUSH_LV, { hp: rushHP(RUSH.i), atk: [Math.round(a * 0.88), Math.round(a * 1.12)], extra: { title: `The Gauntlet · ${RUSH.i + 1} of ${RUSH_LIST.length}`, variant: true, base: k, tint: '#9affd0', scaleMul: 1, expMul: 2, intro: B.intro, outro: undefined, drops: [] } });
  m.hp = m.maxhp = m.d.hp; m.scaleL = RUSH_LV; m.rush = true; m.hx = s.x + 0.5; m.hy = s.y + 0.5; m.state = 'chase';
  mobs.push(m); RUSH.cur = m; aggro(m); pillar({ x: m.x, y: m.y, kind: 'fx' }, '#9affd0', true); burst(m.x, m.y, 20, '#9affd0', 30, 3);
}
function rushDown(m) {
  if (!RUSH.on || m !== RUSH.cur) return;
  RUSH.splits.push(+RUSH.t.toFixed(1)); RUSH.i++; RUSH.cur = null;
  for (const s of mobs) if (s.summoned && !s.dead) { s.dead = true; s.deathT = 0; }
  if (RUSH.i >= RUSH_LIST.length) { rushWin(); return; }
  if (partyN() > 1) { for (const h of PARTY.members) if (!h.dead) withHero(h, () => { healP(S.maxhp * 0.25); P.sp = Math.min(S.maxsp, P.sp + S.maxsp * 0.25); }); }   // cycle 8: the whole party
  else { healP(S.maxhp * 0.25); P.sp = Math.min(S.maxsp, P.sp + S.maxsp * 0.25); }
  questToast(`Gauntlet ${RUSH.i}/${RUSH_LIST.length} · ${rushClock(RUSH.t)} · next: ${MOBS[RUSH_LIST[RUSH.i]].name}`, 'obj'); RUSH.wait = 4;
}
function rushWin() {
  const t = +RUSH.t.toFixed(1), R = rushState(), first = !R.clears; RUSH.on = false; RUSH.cur = null;
  R.clears++; const pb = !R.best || t < R.best; if (pb) R.best = t;
  R.board.push({ t, cls: P.cls, lvl: P.lvl, day: typeof questDay === 'function' ? questDay() : '' }); R.board.sort((a, b) => a.t - b.t); R.board.length = Math.min(R.board.length, 5);
  const ob = 20 + Math.max(0, Math.round((900 - t) / 30));
  giveItem(makeItem('hel_obol', { qty: ob }), 'the Gauntlet'); if (first) { giveItem(makeItem('eljudnir_mead', { qty: 3 }), 'the Gauntlet'); grantTitle('hel_champion'); }
  banner('The Gauntlet Is Won', `${rushClock(t)}${pb ? ' · a new personal best' : ''}`, 'mvp'); Sfx.victory();
  log(`Eljudnir falls silent, then roars. Time: ${rushClock(t)}${pb ? ' (a new personal best)' : ` (best ${rushClock(R.best)})`}. Ganglöt pays out ${ob} Obols.`, 'quest');
  saveGame();
}
function rushAbort(why) {
  if (!RUSH.on) return; RUSH.on = false;
  for (const m of mobs) if (m.rush && !m.dead) { m.dead = true; m.deathT = 0; burst(m.x, m.y, 20, '#9affd0', 20, 2); }
  RUSH.cur = null; if (bossShown && bossShown.rush) { $('bossbar').hidden = true; bossShown = null; }
  log(why + ` (${RUSH.i}/${RUSH_LIST.length} in ${rushClock(RUSH.t)})`, 'warn');
}
