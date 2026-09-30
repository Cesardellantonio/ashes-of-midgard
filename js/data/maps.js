'use strict';
/* =========================================================
   Data: maps
   Loaded before js/core.js. genMap() in core.js builds a map in four steps:
     1. base terrain for the generator type `gen`
        town    - border walls
        field   - noise-scattered trees/rocks (+ `ruins` chance), deco tufts
        dungeon - solid wall (layout carves rooms)
        arena   - solid lava (layout clears the floor)
        sky     - open sky (T.VOID); the layout raises islands and bridges
     2. `layout(m, K)` - the map's own layout: entry, waystone, boss spot, warps,
        houses, braziers, objects, m.decor. K = { set, clearC, clearR, carve, rng, T, w, h, d }.
        Always use K.rng() (seeded) for anything that shapes the terrain. LK(m, K) below
        adds discs, strokes, footprints and decor helpers.
     3. NPCs whose NPCS[id].map is this map (js/data/npcs.js) and bounty boards
        (BOARDS in js/data/quests.js) are placed.
     4. generic post-processing: unreachable pockets sealed, heights, minimap.
   Required per map: name, sub, lv, w, h, seed, gen, ground, void, dark, part, look,
   spawns ([[mobKey, count]...]), and a layout that sets m.entry (and m.way for
   a Waystone). Render look per map can be refined in js/gfx-world.js; maps
   added in content round 3 describe it as data (`render`, `props`, m.decor:
   see "Decor and render contract" below and docs/CONTENT.md).
   ========================================================= */
// Tile ids. Every id except FLOOR blocks movement (blocked() in core.js is `tile !== 0`).
//   WATER   deep water (sea, black bog water, underground lakes). The ground dips below it (render.water).
//   ICE     ice blocks, seracs, floes: rock-like.       CRYSTAL  crystal clusters: rock-like.
//   VOID    open sky under the Bifrost platforms: nothing to draw but clouds far below (render.void).
//   PROP    the blocked footprint of a decor set piece (a wreck, a hut, a statue): the decor entry draws it.
const T = { FLOOR: 0, WALL: 1, TREE: 2, ROCK: 3, LAVA: 4, PILLAR: 5, RUIN: 6, GRAVE: 7, WAY: 8, HEART: 9,
  WATER: 10, ICE: 11, VOID: 12, CRYSTAL: 13, PROP: 14 };
// Walkable ground variants (round 3) are kept in m.surf, one byte per tile (the tile stays T.FLOOR). SURF_SPEED
// multiplies the player's movement speed on them (surfMul in core.js). m.deco keeps its old meaning for the
// renderer: 1-4 painted scatter, 5 cobble, 6 path. The round-3 layouts also set deco 6 on water and lava tiles
// (and on Bifrost's platforms) so today's ground painter colours them with look.path, a fallback until water,
// lava channels and clouds are drawn.
const SURF = { ICE: 7, MUD: 8, BRIDGE: 9, SNOW: 10, RAIL: 11, SAND: 12, GOLD: 13 };
const SURF_SPEED = { [SURF.ICE]: 1.12, [SURF.MUD]: 0.72, [SURF.SNOW]: 0.9 };
// What each blocked tile type looks like when a map has no model of its own for it (see MAPDEFS[id].props):
// 'tree' | 'rock' | 'ruin' | 'wall' | 'pillar' | 'grave' | 'lava' | 'water' | 'void' | 'none' (drawn by decor).
const TILE_LIKE = { [T.WALL]: 'wall', [T.TREE]: 'tree', [T.ROCK]: 'rock', [T.LAVA]: 'lava', [T.PILLAR]: 'pillar', [T.RUIN]: 'ruin', [T.GRAVE]: 'grave',
  [T.WATER]: 'water', [T.ICE]: 'rock', [T.VOID]: 'void', [T.CRYSTAL]: 'rock', [T.PROP]: 'none' };

/* ---------- Decor and render contract (content round 3) ----------
   m.decor = [{ model, kit, x, y, rot, scale, dy?, fp?, light?, on? }]
     model   a model id that exists in assets/models/index.json right now (null = nothing to draw yet)
     kit     the map kit's own model for this piece (art is building rimeshore_*, mirewell_*, nidavellir_*,
             bifrost_*). Draw `kit` when it is in the manifest, else `model`, else skip the entry.
     x, y    tile coordinates of the model origin (x -> world x, y -> world z); rot = radians about +Y;
     dy      height offset from the ground there (floating rocks, things on the water surface)
     fp      [x0, y0, x1, y1]: the T.PROP tiles this piece covers (it blocks movement there)
     light   [hexColour, intensity, distance]: a light the piece gives off (crystals, lanterns)
     on      'open': scatter that must stand on walkable ground (dropped if the tile got sealed)
   MAPDEFS[id].props = { tree, rock, ice, crystal, ruin, pillar, grave, wall }: weighted model lists for tile
     types, [[model, weight, kit], ...] with the same kit/model rule.
   MAPDEFS[id].render: sky, fog, exposure, sun, hemi, bloom, grade, particles and, per map, water / void / lava
     settings. Colours are sRGB hex, the same units as RLOOK in js/gfx-world.js. */
// Models in assets/models/index.json when this file was last updated (content round 3, with the four world-2 kits).
// mdl() picks the kit model when it exists.
const MODEL_IDS = new Set([
  'bifrost_bridge', 'bifrost_bridge_curve', 'bifrost_cloud', 'bifrost_column', 'bifrost_column_broken', 'bifrost_gold_rubble', 'bifrost_island_edge',
  'bifrost_rune_brazier', 'bifrost_valkyrie_statue', 'dng_banner', 'dng_bones', 'dng_brazier', 'dng_chain', 'dng_grave_a', 'dng_grave_b',
  'dng_pillar', 'dng_rubble_a', 'dng_rubble_b', 'dng_wall', 'mirewell_boardwalk', 'mirewell_boardwalk_corner', 'mirewell_bog_tree_a',
  'mirewell_bog_tree_a_lod1', 'mirewell_bog_tree_b', 'mirewell_bog_tree_b_lod1', 'mirewell_bog_tree_c', 'mirewell_bog_tree_c_lod1',
  'mirewell_hag_hut', 'mirewell_lantern_post', 'mirewell_lily_pads', 'mirewell_mossy_log', 'mirewell_mushrooms', 'mirewell_reeds_a',
  'mirewell_reeds_b', 'nidavellir_crystal_a', 'nidavellir_crystal_b', 'nidavellir_forge', 'nidavellir_lava_edge', 'nidavellir_mine_cart',
  'nidavellir_ore_pile', 'nidavellir_rail', 'nidavellir_rail_curve', 'nidavellir_statue_broken', 'nidavellir_support_beams', 'nidavellir_wall',
  'rimeshore_drying_rack', 'rimeshore_fishing_hut', 'rimeshore_ice_crystal', 'rimeshore_ice_floe', 'rimeshore_ice_rock_a', 'rimeshore_ice_rock_b',
  'rimeshore_ice_rock_c', 'rimeshore_longship', 'rimeshore_longship_prow', 'skaldhaven_longship_moored', 'skaldhaven_tavern_sign', 'rimeshore_pine_a', 'rimeshore_pine_a_lod1', 'rimeshore_pine_b',
  'rimeshore_pine_b_lod1', 'rimeshore_snowdrift_a', 'rimeshore_snowdrift_b', 'rock_field_a', 'rock_field_b', 'rock_field_c', 'rock_field_d',
  'ruin_column_fallen', 'ruin_wall_a', 'ruin_wall_b', 'ruin_wall_c', 'signpost', 'throne_basalt_rock', 'throne_obsidian_pillar', 'town_barrel',
  'town_bounty_board', 'town_crates', 'town_fence', 'town_house_big', 'town_house_small', 'town_lamp_post', 'town_market_stall', 'town_well',
  'tree_autumn_a', 'tree_autumn_a_lod1', 'tree_autumn_b', 'tree_autumn_b_lod1', 'tree_dead_a', 'tree_dead_a_lod1', 'tree_dead_b', 'tree_dead_b_lod1',
  'tree_green_a', 'tree_green_a_lod1', 'tree_green_b', 'tree_green_b_lod1', 'tree_green_c', 'tree_green_c_lod1', 'tree_oak_dark',
  'tree_oak_dark_lod1', 'tree_pine_a', 'tree_pine_a_lod1', 'tree_pine_b', 'tree_pine_b_lod1', 'waystone']);
const mdl = (kit, fb) => (kit && MODEL_IDS.has(kit)) ? kit : (fb && MODEL_IDS.has(fb) ? fb : null);
// [[kit, weight, fallback], ...] -> [[model, weight, kit], ...] (entries with no model at all are dropped)
const propList = list => list.map(([kit, wt, fb]) => [mdl(kit, fb), wt, kit]).filter(e => e[0]);

/* Layout kit: shared helpers for the round-3 layouts. Uses core.js noise at play time (layouts run in genMap). */
function LK(m, K) {
  const { w, h } = K, d = K.d;
  const inb = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
  const at = (x, y) => inb(x, y) ? m.t[y * w + x] : -1;
  const put = (x, y, v) => { if (inb(x, y)) m.t[y * w + x] = v; };
  const surf = (x, y, s) => { if (inb(x, y)) m.surf[y * w + x] = s; };
  const paint = (x, y) => { if (inb(x, y)) m.deco[y * w + x] = 6; };
  const noise = (x, y, k) => vnoise(x, y, d.seed + k);
  // Noisy disc: f(x, y, dn) for every tile whose jittered normalised distance dn < 1.
  const disc = (cx, cy, r, jag, f) => {
    for (let y = Math.floor(cy - r - 2); y <= cy + r + 2; y++) for (let x = Math.floor(cx - r - 2); x <= cx + r + 2; x++) {
      if (!inb(x, y)) continue; const dn = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r + (noise(x / 3, y / 3, 7) - 0.5) * jag; if (dn < 1) f(x, y, dn);
    }
  };
  // Straight brush stroke of radius r (bridges, channels): f(x, y) once per tile.
  const stroke = (x0, y0, x1, y1, r, f) => {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2) + 1, seen = new Set();
    for (let i = 0; i <= n; i++) {
      const t = i / n, cx = x0 + (x1 - x0) * t, cy = y0 + (y1 - y0) * t;
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const k = y * w + x; if (!inb(x, y) || seen.has(k) || (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > r * r + 0.25) continue; seen.add(k); f(x, y);
      }
    }
  };
  const decor = (kit, fb, x, y, rot, scale, o) => { const e = Object.assign({ model: mdl(kit, fb), kit, x: +x.toFixed(2), y: +y.toFixed(2), rot: +(rot || 0).toFixed(3), scale: +(scale || 1).toFixed(2) }, o || {}); m.decor.push(e); return e; };
  const footprint = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, T.PROP); return [x0, y0, x1, y1]; };
  const near = (x, y, t) => { for (let k = 0; k < 8; k++) if (at(x + DX[k], y + DY[k]) === t) return true; return false; };
  // Blocked tiles with no model of their own yet (ice, crystal) get a stand-in decor entry flagged `tile: true`:
  // a renderer that draws these tile types itself (TILE_LIKE / props) should skip those entries.
  const standIns = (t, list, rng, dens) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (at(x, y) !== t) continue; const edge = near(x, y, T.FLOOR); if (!edge && rng() > dens) continue; const [kit, fb, s0, s1] = list[(rng() * list.length) | 0]; decor(kit, fb, x + 0.35 + rng() * 0.3, y + 0.35 + rng() * 0.3, rng() * 6.283, s0 + rng() * (s1 - s0), { tile: true }); } };
  return { inb, at, put, surf, paint, noise, disc, stroke, decor, footprint, near, standIns };
}

const MAPDEFS = {
  emberhold: { name: 'Emberhold', sub: 'The Last Waystone', lv: null, world: [80, 250], w: 36, h: 36, seed: 11, gen: 'town', ground: ['#3b342e', '#403831', '#36302a', '#443c34'], void: '#0d0b0a', dark: 0.40, part: 'petal', spawns: [], safe: true,
    look: { floor: 'grass', g1: [86, 130, 52], g2: [126, 168, 70], path: [176, 164, 140], ash: [150, 146, 136], ashAmt: 0, grain: 22, flowers: 0.22, cobble: true, trees: ['green', 'green', 'autumn'], rock: 0x9a958a, tint: [1, 1, 1], fog: 0xcfdbe6, fogN: 60, fogF: 130, hemi: [0xfff8ec, 0x6a6450, 0.62], sun: [0xfff2dc, 0.5], torch: 0 },
    layout(m, K) {
      const { set, clearC, clearR, rng, w, h } = K;
      m.houses = []; const house = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, T.RUIN); m.houses.push({ x0, y0, x1, y1 }); };
      house(4, 4, 9, 8); house(26, 4, 31, 8); house(4, 27, 9, 31); house(26, 27, 31, 31); house(27, 12, 30, 14);
      for (let i = 0; i < 14; i++) { const x = randi(3, w - 4), y = randi(3, h - 4); if (Math.hypot(x - 18, y - 18) > 7 && m.t[y * w + x] === 0) set(x, y, rng() < 0.7 ? T.TREE : T.ROCK); }
      clearC(12, 13, 2); clearC(24, 12, 2); clearC(12, 23, 2); clearC(20, 17, 1);
      for (let y = 16; y <= 20; y++) for (let x = w - 2; x < w; x++) set(x, y, 0);
      for (let x = 16; x <= 20; x++) for (let y = 0; y < 2; y++) set(x, y, 0);
      clearR(16, 1, 20, 34); clearR(1, 16, 34, 20);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if ((Math.abs(x - 18) <= 2 || Math.abs(y - 18) <= 2) || Math.hypot(x - 18, y - 18) < 6) m.deco[y * w + x] = 5; }
      set(18, 18, T.WAY); m.way = { x: 18.5, y: 18.5 };
      m.warps.push({ x: 34, y: 18, to: 'ashen_fields', tx: 3.5, ty: 32.5, label: 'Ashen Fields' });
      m.warps.push({ x: 18, y: 1, to: 'throne', tx: 15.5, ty: 26.5, label: 'Cinder Gate', lock: 'gate' });
      m.objs.push({ kind: 'anvil', x: 11.5, y: 12.5 });
      m.braziers.push({ x: 15.5, y: 15.5 }, { x: 21.5, y: 21.5 }, { x: 15.5, y: 21.5 }, { x: 33.5, y: 16 }, { x: 33.5, y: 21 }, { x: 16, y: 2.5 }, { x: 21, y: 2.5 });
      m.entry = { x: 18, y: 22 };
    } },
  ashen_fields: { name: 'Ashen Fields', sub: 'Base Lv 1 – 12', lv: [1, 12], world: [228, 250], w: 64, h: 64, seed: 23, gen: 'field', trees: 0.045, rocks: 0.035, ruins: 0.004, ground: ['#4a4436', '#4f4838', '#443f32', '#554c3a'], void: '#0d0c09', dark: 0.48, part: 'ash', treeKind: 'dead',
    look: { floor: 'grass', g1: [90, 142, 52], g2: [140, 184, 74], path: [170, 140, 96], ash: [134, 130, 122], ashAmt: 0.35, grain: 24, flowers: 0.3, trees: ['green', 'autumn', 'dead'], rock: 0x9c968c, tint: [1, 1, 1], fog: 0xd2dccf, fogN: 55, fogF: 125, hemi: [0xf4fbff, 0x5a6a40, 0.64], sun: [0xfff6e0, 0.5], torch: 0 },
    spawns: [['blight_poring', 16], ['ash_grub', 10], ['hollow_hare', 10], ['cinder_drop', 8], ['scarecrow_husk', 7]], boss: 'blight_mother',
    layout(m, K) {
      const { carve, clearC } = K;
      m.entry = { x: 3, y: 32 }; m.way = { x: 7.5, y: 29.5 }; m.bossPos = { x: 50.5, y: 11.5 };
      carve(2, 32, 61, 32, 2); carve(8, 30, 50, 12, 1); clearC(50, 11, 7); clearC(7, 29, 3);
      carve(30, 32, 20, 52, 1); carve(40, 32, 52, 50, 1);
      m.warps.push({ x: 1, y: 32, to: 'emberhold', tx: 32.5, ty: 18.5, label: 'Emberhold' });
      m.warps.push({ x: 62, y: 32, to: 'withered_wood', tx: 3.5, ty: 32.5, label: 'Withered Wood' });
      // Round 3: the bog trail south to Mirewell
      carve(20, 52, 32, 61, 1);
      m.warps.push({ x: 32, y: 62, to: 'mirewell', tx: 32.5, ty: 3.5, label: 'Mirewell' });
    } },
  withered_wood: { name: 'Withered Wood', sub: 'Base Lv 10 – 22', lv: [10, 22], world: [376, 250], w: 64, h: 64, seed: 37, gen: 'field', trees: 0.16, rocks: 0.02, ground: ['#2f3528', '#343a2b', '#2a3024', '#383d2c'], void: '#080a07', dark: 0.66, part: 'leaf', treeKind: 'wood',
    look: { floor: 'grass', g1: [50, 88, 36], g2: [86, 126, 50], path: [120, 94, 62], ash: [90, 90, 80], ashAmt: 0.12, grain: 22, flowers: 0.06, trees: ['forest', 'forest', 'forest2'], rock: 0x7e7a70, tint: [0.9, 0.95, 0.9], fog: 0x5e7654, fogN: 45, fogF: 110, hemi: [0xd4e8cc, 0x2a3a20, 0.58], sun: [0xfff4d0, 0.42], torch: 0 },
    spawns: [['thorn_willow', 10], ['mourning_spore', 10], ['ash_wolf', 10], ['rotwood_kobold', 8], ['kobold_archer', 6]], boss: 'hati',
    layout(m, K) {
      const { carve, clearC } = K;
      m.entry = { x: 3, y: 32 }; m.way = { x: 7.5, y: 34.5 }; m.bossPos = { x: 48.5, y: 48.5 };
      carve(2, 32, 32, 3, 2); carve(8, 34, 48, 48, 1); clearC(48, 48, 7); clearC(7, 34, 3); carve(20, 20, 55, 12, 1); carve(15, 50, 32, 40, 1);
      m.warps.push({ x: 1, y: 32, to: 'ashen_fields', tx: 60.5, ty: 32.5, label: 'Ashen Fields' });
      m.warps.push({ x: 32, y: 1, to: 'gloamheim', tx: 30.5, ty: 55.5, label: 'Gloamheim Keep' });
      // Round 3: the east road down to the frozen coast
      carve(55, 12, 61, 20, 1);
      m.warps.push({ x: 62, y: 20, to: 'rimeshore', tx: 3.5, ty: 32.5, label: 'Rimeshore' });
    } },
  gloamheim: { name: 'Gloamheim Keep', sub: 'Base Lv 20 – 34', lv: [20, 34], world: [376, 120], w: 60, h: 60, seed: 51, gen: 'dungeon', ground: ['#34323a', '#393640', '#2f2d34', '#3c3842'], wall: ['#57525e', '#403b47', '#2e2a34'], void: '#060507', dark: 0.84, part: 'dust',
    look: { floor: 'flag', g1: [80, 78, 94], g2: [114, 110, 128], grain: 18, rock: 0x6a6674, tint: [0.84, 0.84, 0.97], fog: 0x15151e, fogN: 35, fogF: 85, hemi: [0x98a0c8, 0x181820, 0.5], sun: [0xb8c0ff, 0.22], torch: 1.6 },
    spawns: [['skeleton_soldier', 14], ['grave_archer', 9], ['wraith', 9], ['rust_knight', 7]], boss: 'sir_gaunt',
    layout(m, K) {
      const { set, clearR, rng, w } = K;
      const rooms = [];
      const room = (x0, y0, x1, y1) => { clearR(x0, y0, x1, y1); const r = { x0, y0, x1, y1, cx: (x0 + x1) >> 1, cy: (y0 + y1) >> 1 }; rooms.push(r); return r; };
      const start = room(25, 49, 35, 57);
      const boss = room(21, 3, 39, 15);
      for (let i = 0, tries = 0; i < 10 && tries < 200; tries++) {
        const rw = randi(6, 11), rh = randi(6, 9), x0 = randi(3, w - rw - 4), y0 = randi(18, 44 - rh);
        if (rooms.some(r => x0 < r.x1 + 3 && x0 + rw > r.x0 - 3 && y0 < r.y1 + 3 && y0 + rh > r.y0 - 3)) continue;
        room(x0, y0, x0 + rw, y0 + rh); i++;
      }
      const mids = rooms.slice(2).sort((a, b) => b.cy - a.cy);
      const chain = [start, ...mids, boss];
      const corr = (a, b) => { const wdt = 1; if (rng() < 0.5) { clearR(a.cx, a.cy - wdt, b.cx, a.cy + wdt); clearR(b.cx - wdt, a.cy, b.cx + wdt, b.cy); } else { clearR(a.cx - wdt, a.cy, a.cx + wdt, b.cy); clearR(a.cx, b.cy - wdt, b.cx, b.cy + wdt); } };
      for (let i = 0; i < chain.length - 1; i++) corr(chain[i], chain[i + 1]);
      for (let i = 0; i < 3; i++) corr(pick(mids), pick(mids));
      clearR(29, 57, 31, 58);
      for (let y = 5; y <= 13; y += 4) { set(24, y, T.PILLAR); set(36, y, T.PILLAR); }
      for (const r of rooms) {
        if (r === boss || r === start) continue;
        for (let i = 0; i < 2; i++) { const gx = randi(r.x0 + 1, r.x1 - 1), gy = randi(r.y0 + 1, r.y1 - 1); if (rng() < 0.6) set(gx, gy, T.GRAVE); }
        m.braziers.push({ x: r.x0 + 0.8, y: r.y0 + 0.8 }, { x: r.x1 + 0.2, y: r.y1 + 0.2 });
      }
      m.braziers.push({ x: 22, y: 4 }, { x: 38.9, y: 4 }, { x: 22, y: 14.9 }, { x: 38.9, y: 14.9 }, { x: 26, y: 50 }, { x: 34.9, y: 50 });
      for (let i = 0; i < m.w * m.h; i++) if (m.t[i] === 0 && rng() < 0.08) m.deco[i] = rng() < 0.5 ? 2 : 3;
      m.entry = { x: 30, y: 55 }; m.way = { x: 27.5, y: 52.5 }; m.bossPos = { x: 30.5, y: 8.5 };
      set(27, 52, T.WAY);
      m.warps.push({ x: 30, y: 58, to: 'withered_wood', tx: 32.5, ty: 4.5, label: 'Withered Wood' });
      // Round 3: a stair down to the dwarf-halls, in an alcove east of Gaunt's hall
      clearR(40, 8, 42, 10);
      m.braziers.push({ x: 40.3, y: 8.2 });
      m.warps.push({ x: 42, y: 9, to: 'nidavellir', tx: 32.5, ty: 4.5, label: 'Nidavellir Deep' });
      // Round 4: Helgrind, Hel's gate, in the north wall behind Gaunt's throne (OBJ_TALK.helgate; no mesh yet, drawn by the quest overlay)
      m.objs.push({ kind: 'helgate', x: 30.5, y: 3.6, name: 'Helgrind' });
    } },
  throne: { name: 'Throne of Cinders', sub: 'Where the Roots Burned', lv: [40, 48], world: [80, 120], w: 30, h: 30, seed: 67, gen: 'arena', ground: ['#3a2622', '#402a24', '#35221e', '#46302a'], void: '#120604', dark: 0.5, part: 'ember', spawns: [], boss: 'ashen_king',
    look: { floor: 'rock', g1: [72, 40, 32], g2: [112, 64, 46], grain: 20, rock: 0x5a3a30, tint: [1, 0.9, 0.82], fog: 0x3a150c, fogN: 40, fogF: 100, hemi: [0xffb890, 0x401810, 0.58], sun: [0xff9a60, 0.45], torch: 0.9, lava: true },
    layout(m, K) {
      const { set, clearC, clearR, rng } = K;
      clearC(15, 14, 12); clearR(14, 24, 16, 28);
      for (let a = 0; a < 8; a++) { const px = Math.round(15 + Math.cos(a * Math.PI / 4) * 9), py = Math.round(14 + Math.sin(a * Math.PI / 4) * 9); if (py < 21) set(px, py, T.PILLAR); }
      for (let i = 0; i < m.w * m.h; i++) if (m.t[i] === 0 && rng() < 0.1) m.deco[i] = 4;
      set(15, 3, T.HEART); m.heart = { x: 15.5, y: 3.5 };
      m.objs.push({ kind: 'heart', x: 15.5, y: 3.5, name: 'Heart of Yggdrasil' });
      set(15, 24, T.WAY); m.way = { x: 15.5, y: 24.5 };
      m.entry = { x: 15, y: 27 }; m.bossPos = { x: 15.5, y: 10.5 };
      m.warps.push({ x: 15, y: 28, to: 'emberhold', tx: 18.5, ty: 3.5, label: 'Emberhold' });
      // Round 3: the broken Bifrost, behind the Heart; it opens when the King is dead
      m.warps.push({ x: 23, y: 6, to: 'bifrost', tx: 8.5, ty: 55.5, label: 'Bifrost Ruins', lock: 'king' });
      m.braziers.push({ x: 11, y: 22 }, { x: 20, y: 22 });
    } },
};

/* =========================================================
   Content round 3: the four outer realms. Level flow:
   fields -> wood -> keep -> rimeshore -> mirewell -> nidavellir -> throne -> bifrost.
   ========================================================= */
Object.assign(MAPDEFS, {
  /* ---------- Rimeshore: frozen coast east of the Withered Wood ---------- */
  rimeshore: { name: 'Rimeshore', sub: 'Base Lv 28 – 38', lv: [28, 38], world: [560, 250], w: 64, h: 64, seed: 101, gen: 'field', trees: 0.05, rocks: 0.045, ruins: 0,
    ground: ['#c8d0da', '#d4dce4', '#bcc6d2', '#dde4ea'], void: '#0a0e14', dark: 0.42, part: 'snow',
    look: { floor: 'snow', g1: [190, 200, 214], g2: [232, 238, 246], path: [52, 60, 74], ash: [64, 62, 70], ashAmt: 0.22, grain: 12, flowers: 0, trees: ['forest', 'forest2', 'dead'],
      rock: 0x6e7888, tint: [0.92, 0.96, 1.05], fog: 0xc6d4e2, fogN: 50, fogF: 130, hemi: [0xe4eeff, 0x56647a, 0.62], sun: [0xeef4ff, 0.26], torch: 0 },
    render: { mist: { col: 0xdce8f4, k: 1, amb: 0.2, lit: 1.0, amt: 0.35, h: 0.5, max: 0.2, scale: 0.05, wind: [0.06, 0.02], scatter: 0.2 }, vol: { col: 0xe8f2ff, k: 0.35, dens: 0.05, ext: 1, top: 5, scale: 0.05, wind: [0.03, 0.01], noise: 0.8 }, /* round 5: post-FX data (gfx-post.js) */ sky: [0x6d93c6, 0xdce8f2], fog: [0xc6d4e2, 36, 150], exposure: 0.86, sun: [0xeef2ff, 0.78, [-0.6, 0.85, 0.35]], hemi: [0xdfeaff, 0x5a6a80, 0.46],
      bloom: [1.2, 0.55], grade: { lift: [0.01, 0.014, 0.032], gamma: [1, 1, 0.98], gain: [0.98, 1.0, 1.05], sat: 0.94, contrast: 1.06, shadowTint: [-0.01, 0.0, 0.03], highTint: [0.0, 0.006, 0.014] },
      vignette: 0.3, particles: 'snow', lt: { amb: [0.62, 0.68, 0.8], sun: [0.4, 0.42, 0.46] },
      water: { color: 0x1d3c56, deep: 0x0b1a2a, foam: 0xeaf4ff, level: -0.45, ice: 0xcfe6f6 },
      lights: { brazier: [0xff9a48, 0.9, 6], way: [0xffa048, 1.2, 8], warp: [0x6aa8ff, 1.0, 5.5], crystal: [0x6ab8ff, 1.1, 5] } },
    props: {
      tree: propList([['rimeshore_pine_a', 4, 'tree_pine_a'], ['rimeshore_pine_b', 3, 'tree_pine_b'], ['tree_dead_b', 1, 'tree_dead_b']]),
      rock: propList([['rimeshore_ice_rock_a', 3, 'rock_field_a'], ['rimeshore_ice_rock_b', 2, 'rock_field_d'], ['rock_field_c', 1, 'rock_field_c']]),
      ice: propList([['rimeshore_ice_rock_c', 3, 'rock_field_c'], ['rimeshore_ice_rock_a', 1, 'rock_field_a']]),
      grave: propList([['rimeshore_barrow_stone', 1, 'dng_grave_a']]),
    },
    spawns: [['rime_poring', 12], ['snow_wolf', 10], ['draugr_fisher', 9], ['ice_wraith', 8], ['shell_knight', 7]], boss: 'drowned_jarl',
    layout(m, K) {
      const { clearC, carve, rng, w, h } = K, L = LK(m, K);
      m.entry = { x: 3, y: 32 }; m.way = { x: 8.5, y: 34.5 }; m.bossPos = { x: 51.5, y: 11.5 };
      const coast = y => Math.round(46 + (L.noise(y / 7, 3.3, 1) - 0.5) * 10);
      // 1. the sea to the east, a black-sand beach along it
      for (let y = 0; y < h; y++) { const c = coast(y); for (let x = c - 5; x < w; x++) { if (x >= c) L.put(x, y, T.WATER); else if (y > 1 && y < h - 2) { L.put(x, y, rng() < 0.035 ? T.ROCK : T.FLOOR); L.surf(x, y, SURF.SAND); } } }
      // 2. ice floes drifting offshore
      for (let i = 0; i < 16; i++) { const y = 3 + rng() * (h - 6), x = coast(y | 0) + 3 + rng() * 10; L.disc(x, y, 0.8 + rng() * 1.6, 0.5, (tx, ty) => { if (L.at(tx, ty) === T.WATER) L.put(tx, ty, T.ICE); }); }
      // 3. the frozen lagoon in the south-east: walkable sea ice (shell knights nest there)
      L.disc(43, 50, 7, 0.45, (x, y) => { if (y < h - 2 && x < w - 2) { L.put(x, y, T.FLOOR); L.surf(x, y, SURF.ICE); } });
      // 4. the Jarl's sea cave: a frozen bay walled with seracs, one way in from the beach
      L.disc(51.5, 11.5, 10, 0.35, (x, y) => L.put(x, y, T.ICE));
      L.disc(51.5, 11.5, 7.2, 0.1, (x, y) => { L.put(x, y, T.FLOOR); L.surf(x, y, SURF.ICE); });
      // 5. roads: the wood road to the beach, north to the cave, south-east to the lagoon, south to the barrows and Mirewell
      carve(2, 32, 27, 31, 2); carve(27, 31, 38, 21, 1); carve(38, 21, 45, 15, 1); carve(27, 31, 38, 45, 1); carve(22, 33, 16, 47, 1); carve(16, 47, 14, 61, 1);
      for (let y = 13; y <= 17; y++) for (let x = 43; x <= 47; x++) if (L.at(x, y) === T.FLOOR) L.surf(x, y, SURF.ICE);
      // fallback paint: the sea bed takes the dark path colour (the beach stays light so the shore reads)
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const t = L.at(x, y); if (t === T.WATER || t === T.ICE) L.paint(x, y); }
      // 6. the waystone camp, the barrow field
      clearC(8, 34, 4.5); clearC(18, 51, 4);
      for (const [gx, gy] of [[16, 49], [19, 48], [21, 51], [15, 52], [19, 54]]) L.put(gx, gy, T.GRAVE);
      // 7. wrecked longships beached along the shore (3x8, bow to the south); the Jarl's own ship frozen into the cave
      const wrecks = [];
      for (const wy of [22, 38]) { const wx = coast(wy + 4) - 4; wrecks.push([wx, wy, L.footprint(wx, wy, wx + 2, wy + 7)]); }
      const jarlShip = L.footprint(47, 4, 54, 6), prow = L.footprint(25, 28, 25, 29), hut = L.footprint(3, 36, 5, 38);
      m.warps.push({ x: 1, y: 32, to: 'withered_wood', tx: 60.5, ty: 20.5, label: 'Withered Wood' });
      m.warps.push({ x: 14, y: 62, to: 'mirewell', tx: 57.5, ty: 3.5, label: 'Mirewell' });
      m.braziers.push({ x: 11.2, y: 31.6 }, { x: 5.2, y: 37.4 }, { x: 44.6, y: 18.6 });
      // ---- decor ----
      for (const [wx, wy, fp] of wrecks) L.decor('rimeshore_longship', 'ruin_column_fallen', wx + 1.5, wy + 4, 0.06 - rng() * 0.12, 1, { fp });
      L.decor('rimeshore_longship', 'ruin_column_fallen', 51, 5.5, 1.57, 1, { fp: jarlShip });
      L.decor('rimeshore_longship_prow', 'rock_field_c', 25.5, 29, 0.35, 1, { fp: prow });
      L.decor('rimeshore_fishing_hut', 'town_house_small', 4.5, 37.5, 0, 1, { fp: hut, light: [0xffb060, 0.9, 5] });
      L.decor('rimeshore_sea_cave', 'ruin_wall_c', 44.2, 14.6, -0.78, 1.25);
      L.standIns(T.ICE, [['rimeshore_ice_rock_c', 'rock_field_c', 0.6, 0.85], ['rimeshore_ice_rock_a', 'rock_field_a', 0.9, 1.3]], rng, 0.35);
      for (let i = 0; i < 9; i++) { const a = i / 9 * 6.283 + 0.3, x = 51.5 + Math.cos(a) * 6.6, y = 11.5 + Math.sin(a) * 6.6; if (L.at(x | 0, y | 0) === T.FLOOR) L.decor('rimeshore_ice_crystal', null, x, y, a, 0.8 + rng() * 0.5, { light: [0x6ab8ff, 1.1, 5], on: 'open' }); }
      L.decor('rimeshore_drying_rack', 'town_fence', 11.6, 32.4, 0.2, 1, { on: 'open' }); L.decor('rimeshore_drying_rack', 'town_fence', 5.8, 39.3, -0.1, 1, { on: 'open' });
      L.decor('rimeshore_barrel', 'town_barrel', 6.8, 37.6, 0, 0.95, { on: 'open' }); L.decor('rimeshore_crate', 'town_crates', 2.8, 34.8, 1.57, 0.8, { on: 'open' });
      for (const [gx, gy] of [[17.5, 47.2], [21.8, 49.2], [14.4, 50.6], [20.6, 54.2]]) L.decor('rimeshore_runestone', 'rock_field_c', gx, gy, rng() * 6.28, 0.9, { on: 'open' });
      for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
        const t = L.at(x, y), s = m.surf[y * w + x];
        if (t === T.FLOOR && s === SURF.SAND && rng() < 0.05) { const k = rng(); L.decor(k < 0.55 ? 'rimeshore_ice_rock_b' : 'rimeshore_ice_rock_a', k < 0.55 ? 'rock_field_d' : 'rock_field_a', x + 0.3 + rng() * 0.4, y + 0.3 + rng() * 0.4, rng() * 6.28, 0.5 + rng() * 0.3, { on: 'open' }); }
        else if (t === T.WATER && rng() < 0.02) L.decor('rimeshore_ice_floe', 'rock_field_b', x + 0.5, y + 0.5, rng() * 6.28, 0.8 + rng() * 0.6, { dy: 0.7 });
        else if (t === T.FLOOR && s === 0 && m.deco[y * w + x] !== 6 && rng() < 0.014) L.decor(rng() < 0.5 ? 'rimeshore_snowdrift_a' : 'rimeshore_snowdrift_b', null, x + 0.5, y + 0.5, rng() * 6.28, 0.8 + rng() * 0.4, { on: 'open' });
      }
      // Round 5: the north road to Skaldhaven (carved last, so nothing above changes)
      carve(20, 30, 20, 2, 1); m.warps.push({ x: 20, y: 1, to: 'skaldhaven', tx: 14.5, ty: 36.5, label: 'Skaldhaven' });
    } },

  /* ---------- Mirewell: black bog south of the Ashen Fields ---------- */
  mirewell: { name: 'Mirewell', sub: 'Base Lv 34 – 44', lv: [34, 44], world: [228, 360], w: 64, h: 64, seed: 131, gen: 'field', trees: 0.09, rocks: 0.015, ruins: 0.003,
    ground: ['#3a4028', '#40462c', '#343a24', '#464c30'], void: '#070906', dark: 0.62, part: 'spores',
    look: { floor: 'mud', g1: [54, 62, 36], g2: [90, 98, 56], path: [16, 20, 14], ash: [38, 42, 30], ashAmt: 0.3, grain: 20, flowers: 0.03, trees: ['dead', 'forest2', 'dead'],
      rock: 0x5e6252, tint: [0.9, 0.96, 0.86], fog: 0x66755a, fogN: 38, fogF: 105, hemi: [0xc8d8b0, 0x283020, 0.58], sun: [0xe8e4b8, 0.22], torch: 0 },
    render: { mist: { col: 0x9aae88, k: 1, amb: 0.1, lit: 1.2, amt: 0.75, h: 0.8, max: 0.4, scale: 0.05, wind: [0.02, 0.01], scatter: 0.35 }, hfog: { col: 0x6a7a58, k: 0.4, amt: 0.2, h: 0.6, max: 0.25 }, /* round 5: post-FX data (gfx-post.js) */ sky: [0x3a4a3a, 0x7a8a66], fog: [0x66755a, 28, 110], exposure: 0.9, sun: [0xe6e0b0, 0.6, [-0.5, 1.0, 0.4]], hemi: [0xb8cca0, 0x28301e, 0.4],
      bloom: [1.15, 0.65], grade: { lift: [0.006, 0.016, 0.006], gamma: [1, 1.02, 1], gain: [1.0, 1.03, 0.92], sat: 0.95, contrast: 1.08, shadowTint: [-0.006, 0.01, 0.0], highTint: [0.012, 0.016, -0.01] },
      vignette: 0.42, particles: 'spores', lt: { amb: [0.5, 0.58, 0.46], sun: [0.42, 0.4, 0.28] },
      water: { color: 0x141a12, deep: 0x050805, foam: 0x5a6a44, level: -0.4, murky: true },
      shafts: { n: 10, clearing: true, gap: 8, len: 9, width: 2.2, color: 0xd8f0a0, op: 0.1 },
      lights: { brazier: [0xff9a48, 1.1, 6.5], way: [0xffa048, 1.6, 9], warp: [0x7ab8ff, 1.3, 6], wisp: [0x8aff9a, 1.2, 5] } },
    props: {
      tree: propList([['mirewell_bog_tree_a', 3, 'tree_oak_dark'], ['mirewell_bog_tree_b', 3, 'tree_dead_a'], ['mirewell_bog_tree_c', 2, 'tree_dead_b']]),
      rock: propList([['mirewell_mossy_stone', 1, 'rock_field_a']]),
      ruin: propList([['mirewell_sunken_ruin', 1, 'ruin_wall_b']]),
    },
    spawns: [['bog_toad', 11], ['mire_leech', 10], ['wisp', 9], ['marsh_hag', 8], ['mire_troll', 7]], boss: 'bog_crone',
    layout(m, K) {
      const { carve, rng, w, h } = K, L = LK(m, K);
      m.entry = { x: 32, y: 3 }; m.way = { x: 36.5, y: 7.5 }; m.bossPos = { x: 32.5, y: 53.5 };
      const wet = new Uint8Array(w * h);
      const drown = (x, y) => { if (x > 1 && y > 1 && x < w - 2 && y < h - 2) { L.put(x, y, T.WATER); wet[y * w + x] = 1; } };
      const dry = (cx, cy, r) => L.disc(cx, cy, r, 0.2, (x, y) => { if (x > 1 && y > 1 && x < w - 2 && y < h - 2) { L.put(x, y, T.FLOOR); wet[y * w + x] = 0; if (m.surf[y * w + x] === SURF.MUD) m.surf[y * w + x] = 0; } });
      // 1. black water pools with a rim of sucking mud (the entry stays dry)
      for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
        if (Math.hypot(x - 34, y - 6) < 8) continue;
        const n = L.noise(x / 6.5, y / 6.5, 5) * 0.75 + L.noise(x / 2.5, y / 2.5, 6) * 0.25;
        if (n > 0.57) drown(x, y); else if (n > 0.49 && L.at(x, y) === T.FLOOR) L.surf(x, y, SURF.MUD);
      }
      // 2. the Crone's island: a mud island inside a black moat
      L.disc(32.5, 53.5, 10.5, 0.25, drown);
      L.disc(32.5, 53.5, 6.8, 0.15, (x, y, dn) => { L.put(x, y, T.FLOOR); wet[y * w + x] = 0; L.surf(x, y, dn > 0.72 ? SURF.MUD : 0); });
      // 3. trails: where they cross black water they are rotting boardwalks
      carve(32, 3, 31, 22, 2); carve(31, 24, 14, 38, 1); carve(31, 24, 50, 34, 1); carve(50, 34, 61, 44, 1);
      carve(57, 3, 46, 16, 1); carve(46, 16, 31, 24, 1); carve(31, 26, 32, 46, 1);
      // 4. dry ground: the waystone camp, the crossroads, the hag's clearing
      dry(36, 7, 4.5); dry(31, 24, 4.2); dry(13, 38, 5);
      for (let i = 0; i < w * h; i++) { if (wet[i] && m.t[i] === T.FLOOR) m.surf[i] = SURF.BRIDGE; if (m.deco[i] === 6) m.deco[i] = 0; }
      // fallback paint: black water takes the (dark) path colour; trails stay mud
      for (let i = 0; i < w * h; i++) if (m.t[i] === T.WATER) m.deco[i] = 6;
      const hut = L.footprint(11, 33, 14, 36), cauldron = L.footprint(32, 47, 33, 48);
      m.warps.push({ x: 32, y: 1, to: 'ashen_fields', tx: 32.5, ty: 60.5, label: 'Ashen Fields' });
      m.warps.push({ x: 58, y: 1, to: 'rimeshore', tx: 14.5, ty: 60.5, label: 'Rimeshore' });
      m.warps.push({ x: 62, y: 44, to: 'nidavellir', tx: 3.5, ty: 32.5, label: 'Nidavellir Deep' });
      m.braziers.push({ x: 38.8, y: 5.2 }, { x: 28.6, y: 22.2 });
      // ---- decor ----
      L.decor('mirewell_hag_hut', 'town_house_small', 13, 35, 0, 1, { fp: hut, light: [0x9aff7a, 0.9, 5] });
      L.decor('mirewell_cauldron', 'town_well', 33, 48, 0, 0.9, { fp: cauldron, light: [0x8aff6a, 1.2, 5] });
      L.decor('mirewell_mine_entrance', 'ruin_wall_c', 61.2, 44.5, -1.57, 1.1);
      for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283 + 0.5, x = 32.5 + Math.cos(a) * 5.6, y = 53.5 + Math.sin(a) * 5.6; if (L.at(x | 0, y | 0) === T.FLOOR) L.decor('mirewell_totem', 'dng_grave_b', x, y, -a + 1.57, 1, { on: 'open' }); }
      for (const [lx, ly] of [[34.2, 9.8], [33.6, 21.2], [27.8, 27.0], [48.6, 33.2], [16.4, 40.8]]) if (L.at(lx | 0, ly | 0) === T.FLOOR) L.decor('mirewell_lantern_post', 'town_lamp_post', lx, ly, rng() * 6.28, 1, { light: [0x8aff9a, 1.2, 5], on: 'open' });
      for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
        const t = L.at(x, y), s = m.surf[y * w + x];
        if (t === T.FLOOR && s !== SURF.BRIDGE && L.near(x, y, T.WATER) && rng() < 0.25) L.decor(rng() < 0.6 ? 'mirewell_reeds_a' : 'mirewell_reeds_b', null, x + 0.2 + rng() * 0.6, y + 0.2 + rng() * 0.6, rng() * 6.28, 0.8 + rng() * 0.4, { on: 'open' });
        else if (t === T.WATER && rng() < 0.05) L.decor('mirewell_lily_pads', null, x + 0.5, y + 0.5, rng() * 6.28, 0.7 + rng() * 0.4, { dy: 0.42 });
        else if (t === T.FLOOR && s === SURF.BRIDGE) {   // rotting boardwalk planks along the trail (deck top 0.34: sink it to the walking height)
          const ns = (m.surf[(y - 1) * w + x] === SURF.BRIDGE) + (m.surf[(y + 1) * w + x] === SURF.BRIDGE), ew = (m.surf[y * w + x - 1] === SURF.BRIDGE) + (m.surf[y * w + x + 1] === SURF.BRIDGE);
          L.decor('mirewell_boardwalk', null, x + 0.5, y + 0.5, ns >= ew ? 0 : 1.571, 1, { dy: -0.32, on: 'open' });
        }
        else if (t === T.FLOOR && s === SURF.MUD && rng() < 0.03) L.decor('mirewell_mossy_log', null, x + 0.5, y + 0.5, rng() * 6.28, 0.8 + rng() * 0.3, { on: 'open' });
        else if (t === T.FLOOR && s === 0 && L.near(x, y, T.TREE) && rng() < 0.03) L.decor('mirewell_mushrooms', null, x + 0.5, y + 0.5, rng() * 6.28, 0.8 + rng() * 0.4, { on: 'open', light: [0x6affe0, 0.8, 3.5] });
      }
    } },

  /* ---------- Nidavellir Deep: the dwarf-halls under Gloamheim ---------- */
  nidavellir: { name: 'Nidavellir Deep', sub: 'Base Lv 40 – 50', lv: [40, 50], world: [560, 370], w: 64, h: 64, seed: 151, gen: 'dungeon',
    ground: ['#3a3430', '#403834', '#35302c', '#463e38'], wall: ['#5e544c', '#463e38', '#2e2824'], void: '#060504', dark: 0.82, part: 'ember',
    look: { floor: 'carved', g1: [86, 74, 66], g2: [122, 108, 94], path: [52, 30, 22], grain: 16, rock: 0x6a5e56, tint: [0.96, 0.9, 0.84], fog: 0x140e0a, fogN: 35, fogF: 88, hemi: [0xa89888, 0x1a1410, 0.5], sun: [0xffc890, 0.12], torch: 1.7 },
    render: { mist: { col: 0x8a6a5a, k: 1, amb: 0.04, lit: 1.5, amt: 0.45, h: 0.5, max: 0.3, scale: 0.06, wind: [0.015, 0.01], scatter: 0.5 }, hfog: { col: 0xff6a2a, k: 0.3, amt: 0.15, h: 0.3, max: 0.25 }, /* round 5: post-FX data (gfx-post.js) */ sky: [0x080605, 0x1e140e], fog: [0x140e0a, 30, 86], exposure: 1.08, sun: [0xffc890, 0.3, [-0.45, 1.2, 0.35]], hemi: [0x9a8a7a, 0x201812, 0.44],
      bloom: [1.1, 0.8], grade: { lift: [0.02, 0.012, 0.006], gamma: [0.98, 1, 1.02], gain: [1.05, 0.99, 0.92], sat: 1.04, contrast: 1.1, shadowTint: [0.004, 0.0, 0.012], highTint: [0.026, 0.012, -0.012] },
      vignette: 0.5, particles: 'embers', lt: { amb: [0.5, 0.44, 0.4], sun: [0.08, 0.06, 0.05] }, torch: [0xffa860, 1.4, 9],
      lava: true, lights: { brazier: [0xff8a38, 2.6, 7.5], way: [0xffa048, 3.0, 10], warp: [0x7ab8ff, 2.2, 7], crystal: [0xb07aff, 1.6, 5.5], lava: [0xff6a1a, 1.8, 6] } },
    props: {
      wall: propList([['nidavellir_wall', 1, 'dng_wall']]),
      pillar: propList([['nidavellir_pillar', 1, 'dng_pillar']]),
      crystal: propList([['nidavellir_crystal_a', 1, 'throne_obsidian_pillar']]),
      grave: propList([['nidavellir_tomb', 1, 'dng_grave_a']]),
      rock: propList([['nidavellir_ore_pile', 1, 'dng_rubble_b']]),
    },
    spawns: [['cave_bat', 12], ['crystal_spider', 9], ['magma_slime', 9], ['stone_golem', 7], ['dwarf_revenant', 9]], boss: 'fafnir',
    layout(m, K) {
      const { set, clearR, rng, w, h } = K, L = LK(m, K);
      const cave = (cx, cy, r) => L.disc(cx, cy, r, 0.35, (x, y) => { if (x > 1 && y > 1 && x < w - 2 && y < h - 2) L.put(x, y, T.FLOOR); });
      const corr = (x0, y0, x1, y1, vFirst) => { if (vFirst) { clearR(x0 - 1, y0, x0 + 1, y1); clearR(x0, y1 - 1, x1, y1 + 1); } else { clearR(x0, y0 - 1, x1, y0 + 1); clearR(x1 - 1, y0, x1 + 1, y1); } };
      // halls
      clearR(2, 27, 12, 37);          // entry hall (from the Mirewell mine)
      clearR(25, 2, 39, 10);          // gate hall (the stair up to Gloamheim)
      clearR(20, 21, 42, 39);         // the great forge
      cave(53.5, 13.5, 7.5);          // crystal galleries
      cave(11.5, 52.5, 7.5);          // old mine shafts
      clearR(46, 28, 58, 38);         // hall of statues
      cave(51.5, 53.5, 8.5);          // Fafnir's hoard
      corr(12, 32, 20, 32); corr(32, 10, 32, 21, true); corr(42, 24, 53, 20); corr(24, 39, 11, 52, true); corr(42, 33, 46, 33); corr(52, 38, 52, 46, true); corr(57, 19, 57, 28, true);
      // the great forge: a lava channel with one stone bridge, pillars, forges
      for (let x = 21; x <= 41; x++) if (x < 30 || x > 33) { set(x, 30, T.LAVA); set(x, 31, T.LAVA); } else { L.surf(x, 30, SURF.BRIDGE); L.surf(x, 31, SURF.BRIDGE); }
      for (const px of [24, 28, 36, 40]) for (const py of [23, 37]) set(px, py, T.PILLAR);
      // crystal veins in the galleries, lava seeps in the hoard
      for (let i = 0; i < 11; i++) { const a = rng() * 6.283, d = 2.5 + rng() * 4, cx = 53.5 + Math.cos(a) * d, cy = 13.5 + Math.sin(a) * d; L.disc(cx, cy, 0.7 + rng() * 0.7, 0.3, (x, y) => { if (L.at(x, y) === T.FLOOR) L.put(x, y, T.CRYSTAL); }); }
      for (const [lx, ly] of [[44.5, 56.5], [58.5, 50.5], [57.5, 59.5]]) L.disc(lx, ly, 1.4, 0.3, (x, y) => { if (L.at(x, y) === T.FLOOR) L.put(x, y, T.LAVA); });
      // statues and tombs of the old dwarf-kings
      const statues = [L.footprint(47, 29, 48, 30), L.footprint(54, 29, 55, 30), L.footprint(47, 36, 48, 37)];
      for (const gx of [49, 51, 55, 57]) set(gx, 35, T.GRAVE);
      const hoard = L.footprint(50, 58, 52, 59), forges = [L.footprint(26, 21, 27, 22), L.footprint(36, 21, 37, 22)];
      // mine rails down the south shaft
      for (let y = 40; y <= 52; y++) L.surf(24, y, SURF.RAIL); for (let x = 12; x <= 24; x++) L.surf(x, 52, SURF.RAIL);
      for (let y = 55; y < h - 2; y++) for (let x = 44; x < 60; x++) if (L.at(x, y) === T.FLOOR && Math.hypot(x + 0.5 - 51.5, y + 0.5 - 58.5) < 4.2) L.surf(x, y, SURF.GOLD);
      m.entry = { x: 3, y: 32 }; m.way = { x: 6.5, y: 29.5 }; m.bossPos = { x: 51.5, y: 52.5 };
      m.warps.push({ x: 1, y: 32, to: 'mirewell', tx: 60.5, ty: 44.5, label: 'Mirewell' });
      m.warps.push({ x: 32, y: 1, to: 'gloamheim', tx: 41.5, ty: 9.5, label: 'Gloamheim Keep' });
      m.objs.push({ kind: 'anvil', x: 28.5, y: 25.5, text: 'Sindri’s anvil rings faintly when you touch it, as if it remembers every blow.' });
      m.braziers.push({ x: 2.8, y: 27.8 }, { x: 11.2, y: 36.2 }, { x: 25.8, y: 2.8 }, { x: 38.2, y: 2.8 }, { x: 21.2, y: 21.8 }, { x: 41.2, y: 21.8 }, { x: 21.2, y: 38.6 }, { x: 41.2, y: 38.6 },
        { x: 46.8, y: 32.4 }, { x: 57.2, y: 32.4 }, { x: 47.2, y: 47.8 }, { x: 55.8, y: 47.8 });
      // ---- decor ----
      const sfp = [[47.5, 29.5], [54.5, 29.5], [47.5, 36.5]];
      statues.forEach((fp, i) => L.decor('nidavellir_statue_broken', 'ruin_column_fallen', sfp[i][0] + 0.5, sfp[i][1] + 0.5, [0.2, -0.5, 2.8][i], 1, { fp }));
      L.decor('nidavellir_ore_pile', 'dng_rubble_a', 51.5, 59, 0, 1.6, { fp: hoard, light: [0xffc860, 1.2, 6] });
      for (let i = 0; i < 9; i++) { const a = rng() * 6.283, d = 2 + rng() * 3.5, x = 51.5 + Math.cos(a) * d, y = 58.5 + Math.sin(a) * d * 0.6; if (L.at(x | 0, y | 0) === T.FLOOR) L.decor('nidavellir_ore_pile', null, x, y, rng() * 6.28, 0.5 + rng() * 0.4, { on: 'open' }); }
      forges.forEach((fp, i) => L.decor('nidavellir_forge', 'dng_brazier', fp[0] + 1, fp[1] + 1, 0, 1, { fp, light: [0xff8a38, 1.8, 6] }));
      // rails: straight along the shaft, a curve at the corner, carts on them; timber frames over the passages
      for (let y = 40; y <= 51; y++) L.decor('nidavellir_rail', null, 24.5, y + 0.5, 0, 1, { on: 'open' });
      for (let x = 12; x <= 23; x++) L.decor('nidavellir_rail', null, x + 0.5, 52.5, 1.571, 1, { on: 'open' });
      L.decor('nidavellir_rail_curve', null, 24.5, 52.5, 3.1416, 1, { on: 'open' });
      L.decor('nidavellir_mine_cart', 'town_crates', 16.5, 52.5, 1.571, 1, { on: 'open' }); L.decor('nidavellir_mine_cart', 'town_crates', 24.5, 45.5, 0, 1, { on: 'open' });
      for (let y = 41; y <= 50; y += 3) L.decor('nidavellir_support_beams', null, 24.5, y + 0.5, 0, 1, { on: 'open' });
      for (let x = 14; x <= 22; x += 4) L.decor('nidavellir_support_beams', null, x + 0.5, 52.5, 1.571, 1, { on: 'open' });
      L.decor('nidavellir_stair_up', 'ruin_wall_c', 32.5, 2.6, 0, 1.1);
      L.standIns(T.CRYSTAL, [['nidavellir_crystal_a', 'throne_obsidian_pillar', 0.7, 1.0]], rng, 1);
      // lava: the channel and the hoard seeps are nidavellir_lava_edge tiles, kerb toward the floor they border
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        if (L.at(x, y) !== T.LAVA) continue; m.deco[y * w + x] = 6;   // fallback paint: dark trenches
        const rot = L.at(x, y + 1) === T.FLOOR ? 0 : L.at(x, y - 1) === T.FLOOR ? 3.1416 : L.at(x + 1, y) === T.FLOOR ? 1.571 : L.at(x - 1, y) === T.FLOOR ? -1.571 : 0;
        L.decor('nidavellir_lava_edge', null, x + 0.5, y + 0.5, rot, 1, { light: (x + y) % 3 === 0 ? [0xff6a1a, 1.4, 4] : undefined });
      }
      for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
        const t = L.at(x, y);
        if (t === T.FLOOR && L.near(x, y, T.WALL) && m.surf[y * w + x] !== SURF.RAIL && rng() < 0.03) { const k = rng() < 0.5; L.decor(k ? 'nidavellir_ore_pile' : 'nidavellir_crystal_b', k ? 'dng_rubble_b' : null, x + 0.5, y + 0.5, rng() * 6.28, 0.55 + rng() * 0.3, { on: 'open', light: k ? undefined : [0xb07aff, 0.8, 3] }); }
      }
    } },

  /* ---------- Bifrost Ruins: the shattered sky bridge beyond the Throne ---------- */
  bifrost: { name: 'Bifrost Ruins', sub: 'Base Lv 48 – 60', lv: [48, 60], world: [80, 36], w: 64, h: 64, seed: 181, gen: 'sky',
    ground: ['#d8cfe0', '#e0d8e8', '#cfc6da', '#e6dfee'], void: '#b8b0d8', dark: 0.3, part: 'motes',
    look: { floor: 'cloud', g1: [214, 208, 234], g2: [246, 243, 252], path: [206, 180, 120], ash: [196, 190, 226], ashAmt: 0.1, grain: 10, flowers: 0, trees: ['dead', 'dead', 'dead'],
      rock: 0xd8c8a0, tint: [1.04, 1.0, 1.06], fog: 0xd4cced, fogN: 55, fogF: 150, hemi: [0xfff4e8, 0x8a80b0, 0.72], sun: [0xfff0d0, 0.3], torch: 0 },
    render: { mist: { col: 0xf0e8ff, k: 1, amb: 0.25, lit: 1.0, amt: 0.25, h: 0.4, max: 0.15, scale: 0.04, wind: [0.05, 0.02], scatter: 0.2 }, vol: { col: 0xfff0c8, k: 0.4, dens: 0.06, ext: 1, top: 6, scale: 0.05, wind: [0.02, 0.008], noise: 0.8 }, /* round 5: post-FX data (gfx-post.js) */ sky: [0x6a7ad8, 0xf2d8ee], fog: [0xd4cced, 40, 170], exposure: 0.86, sun: [0xfff0d0, 0.9, [-0.5, 1.1, 0.25]], hemi: [0xfff4ff, 0x9a90c8, 0.5],
      bloom: [1.05, 0.75], grade: { lift: [0.02, 0.014, 0.03], gamma: [1, 1, 1], gain: [1.03, 1.0, 1.02], sat: 1.1, contrast: 1.04, shadowTint: [0.0, -0.004, 0.03], highTint: [0.02, 0.012, 0.0] },
      vignette: 0.24, particles: 'motes', lt: { amb: [0.72, 0.68, 0.8], sun: [0.44, 0.4, 0.34] },
      void: { color: 0xe8e0f4, clouds: 0xfaf4ff, depth: -4.5, rainbow: true },
      lights: { brazier: [0xffd070, 1.0, 6], way: [0xffa048, 1.2, 8], warp: [0xb89aff, 1.2, 6], crystal: [0xff9ae0, 1.3, 5] } },
    props: {
      pillar: propList([['bifrost_column', 2, 'dng_pillar'], ['bifrost_column_broken', 1, 'dng_pillar']]),
      ruin: propList([['bifrost_wall', 2, 'ruin_wall_a'], ['bifrost_wall_corner', 1, 'ruin_wall_b']]),
      rock: propList([['bifrost_crystal', 1, 'rimeshore_ice_crystal']]),
    },
    spawns: [['prism_poring', 12], ['sky_harpy', 10], ['rune_sentinel', 7], ['valkyrie_shade', 8], ['fenrir_whelp', 8]], boss: 'fenrir',
    layout(m, K) {
      const { rng, w, h } = K, L = LK(m, K);
      const isle = (cx, cy, r, jag) => L.disc(cx, cy, r, jag === undefined ? 0.3 : jag, (x, y) => { if (x > 0 && y > 0 && x < w - 1 && y < h - 1) L.put(x, y, T.FLOOR); });
      const spans = [], bridge = (x0, y0, x1, y1, r) => { spans.push([x0, y0, x1, y1]); L.stroke(x0, y0, x1, y1, r || 1.1, (x, y) => { if (L.at(x, y) === T.VOID) { L.put(x, y, T.FLOOR); L.surf(x, y, SURF.BRIDGE); } }); };
      isle(10, 53, 6.5);        // the landing (from the Throne)
      isle(13, 29, 7.5);        // Hall of the Aesir
      isle(33, 40, 8);          // Rune Plaza
      isle(31, 13, 6);          // Gjallarhorn's stand
      isle(53, 34, 6);          // Valkyrie Rest
      isle(50.5, 11.5, 8.5, 0.2); // Fenrir's island
      isle(22, 49, 2.6);        // stepping stone
      bridge(12, 47, 13, 36); bridge(14, 50, 22, 49); bridge(23, 48, 28, 43); bridge(18, 24, 26, 15); bridge(32, 32, 31, 19);
      bridge(40, 38, 48, 35); bridge(20, 32, 26, 37); bridge(52, 28, 51, 20, 0.9);
      // Hall of the Aesir: a ruined golden hall; Rune Plaza: a ring of columns
      for (let x = 9; x <= 17; x++) for (const y of [25, 33]) if ((x < 12 || x > 14) && L.at(x, y) === T.FLOOR) L.put(x, y, T.RUIN);
      for (let y = 25; y <= 33; y++) for (const x of [9, 17]) if ((y < 28 || y > 30) && L.at(x, y) === T.FLOOR) L.put(x, y, T.RUIN);
      // golden columns: blocked footprints drawn as bifrost_column decor (a PILLAR tile would get the keep pillar)
      const cols = [[10, 26], [16, 26], [10, 32], [16, 32]];
      for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283 + 0.39; cols.push([Math.round(33 + Math.cos(a) * 5.6), Math.round(40 + Math.sin(a) * 5.6)]); }
      for (const [px, py] of cols) L.put(px, py, T.PROP);
      const horn = L.footprint(31, 11, 31, 11), statueA = L.footprint(55, 31, 56, 32), statueB = L.footprint(55, 37, 56, 38);
      m.entry = { x: 8, y: 55 }; m.way = { x: 9.5, y: 51.5 }; m.bossPos = { x: 50.5, y: 10.5 };
      // fallback paint: the ground colour is the cloud sea (it also colours the skirt around the map); the platforms
      // and bridges take the golden path colour
      for (let i = 0; i < w * h; i++) if (m.t[i] !== T.VOID) m.deco[i] = 6;
      m.warps.push({ x: 6, y: 57, to: 'throne', tx: 23.5, ty: 7.5, label: 'Throne of Cinders' });

      // ---- decor ----
      cols.forEach(([px, py], i) => L.decor(i % 5 === 3 ? 'bifrost_column_broken' : 'bifrost_column', 'dng_pillar', px + 0.5, py + 0.5, i % 5 === 3 ? i : 0, i % 5 === 3 ? 0.6 : 1, { fp: [px, py, px, py] }));
      L.decor('bifrost_gjallarhorn', 'bifrost_column', 31.5, 11.5, 0.4, 1.15, { fp: horn, light: [0xffd070, 1.4, 6] });
      for (const [bx, by] of [[12.6, 55.4], [29.4, 12.6], [33.6, 12.6], [30.2, 40.2], [35.8, 40.2]]) if (L.at(bx | 0, by | 0) === T.FLOOR) L.decor('bifrost_rune_brazier', 'dng_brazier', bx, by, 0, 1, { on: 'open', light: [0xffd070, 1.4, 6] });
      L.decor('bifrost_valkyrie_statue', 'dng_pillar', 56, 32, -1.2, 1, { fp: statueA }); L.decor('bifrost_valkyrie_statue', 'dng_pillar', 56, 38, -1.9, 1, { fp: statueB });
      // rainbow bridge segments (2x2, run along +Z) laid along every bridge
      for (const [x0, y0, x1, y1] of spans) { const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.round(len / 1.9)), rot = Math.atan2(x1 - x0, y1 - y0); for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n; if (L.at(x | 0, y | 0) === T.FLOOR && m.surf[(y | 0) * w + (x | 0)] === SURF.BRIDGE) L.decor('bifrost_bridge', null, x, y, rot, 1, { on: 'open', light: i % 3 === 0 ? [0xb89aff, 0.8, 4] : undefined }); } }
      // island rims: turf flush with the platform, cliff hanging into the sky
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        if (L.at(x, y) === T.VOID || m.surf[y * w + x] === SURF.BRIDGE || (x + y) % 2) continue;
        for (const [dx, dy, rot] of [[0, 1, 0], [0, -1, 3.1416], [1, 0, 1.571], [-1, 0, -1.571]]) if (L.at(x + dx, y + dy) === T.VOID) { L.decor('bifrost_island_edge', null, x + 0.5 + dx * 0.5, y + 0.5 + dy * 0.5, rot, 1, {}); break; }
      }
      L.decor('bifrost_rune_circle', null, 33, 40, 0, 1.6, { on: 'open', light: [0xff9ae0, 1.2, 6] });
      for (const [ax, ay, ar] of [[12.5, 46.8, 0], [26.2, 15.6, 0.8], [31.5, 19.8, 0], [47.6, 35.4, 1.3], [51.3, 20.6, 0.1]]) if (L.at(ax | 0, ay | 0) === T.FLOOR) L.decor('bifrost_arch', 'ruin_wall_c', ax, ay, ar, 0.95, { on: 'open' });
      for (let i = 0; i < 7; i++) { const a = i / 7 * 6.283 + 0.2, x = 50.5 + Math.cos(a) * 7.3, y = 11.5 + Math.sin(a) * 7.3; L.decor('bifrost_chain_anchor', 'throne_basalt_rock', x, y, -a, 0.8, {}); m.decor.push({ model: null, kit: 'bifrost_chain', x: +((x + 50.5) / 2).toFixed(2), y: +((y + 11.5) / 2).toFixed(2), rot: +(-a).toFixed(3), scale: 1 }); }
      for (let i = 0; i < 34; i++) { const x = 2 + rng() * (w - 4), y = 2 + rng() * (h - 4); if (L.at(x | 0, y | 0) !== T.VOID) continue; const big = rng() < 0.3; L.decor(big ? 'bifrost_float_isle' : 'bifrost_float_rock', 'rock_field_a', x, y, rng() * 6.28, big ? 1.6 + rng() : 0.7 + rng() * 0.8, { dy: -1.5 - rng() * 3 }); }
      for (let i = 0; i < 40; i++) { const x = rng() * w, y = rng() * h; if (L.at(x | 0, y | 0) !== T.VOID) continue; L.decor('bifrost_cloud', null, x, y, rng() * 6.28, 1.2 + rng() * 1.5, { dy: -3 - rng() * 1.5 }); }
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const t = L.at(x, y), s = m.surf[y * w + x];
        if (t === T.FLOOR && s !== SURF.BRIDGE && L.near(x, y, T.VOID) && rng() < 0.04) L.decor('bifrost_crystal', 'rimeshore_ice_crystal', x + 0.5, y + 0.5, rng() * 6.28, 0.5 + rng() * 0.35, { on: 'open', light: rng() < 0.3 ? [0xff9ae0, 1.0, 4] : undefined });
        else if (t === T.FLOOR && s === 0 && rng() < 0.025) L.decor('bifrost_gold_rubble', 'dng_rubble_b', x + 0.5, y + 0.5, rng() * 6.28, 0.7 + rng() * 0.3, { on: 'open' });
      }
    } },
});
/* ---------- Content round 5: Skaldhaven, the harbour town on the Rimeshore coast ----------
   A safe town (no spawns) north of Rimeshore: the Salt Hall tavern with its bounty board, the storage keeper, the
   card-picker and the seiðkona, a chandler's market and three piers where Captain Ormr's longship docks. Decor uses the
   town_* and rimeshore_* models (drawn from m.decor, so no renderer code is needed); houses are town plots (m.houses). */
MAPDEFS.skaldhaven = { name: 'Skaldhaven', sub: 'Harbour of the Frozen Coast', lv: null, world: [560, 140], w: 48, h: 40, seed: 211, gen: 'town', safe: true,
  ground: ['#c8d0da', '#d4dce4', '#bcc6d2', '#dde4ea'], void: '#0a0e14', dark: 0.36, part: 'snow', spawns: [],
  intro: 'Skaldhaven: the one harbour on the frozen coast that still keeps a fire in every window. Traders, skalds and deserters drink in the Salt Hall.',
  look: { floor: 'snow', g1: [196, 204, 216], g2: [234, 238, 246], path: [150, 142, 130], ash: [64, 62, 70], ashAmt: 0.1, grain: 12, flowers: 0, cobble: true, trees: ['forest', 'forest2'],
    rock: 0x6e7888, tint: [0.95, 0.97, 1.04], fog: 0xc6d4e2, fogN: 55, fogF: 140, hemi: [0xe8eeff, 0x5a647a, 0.64], sun: [0xf4f0ff, 0.3], torch: 0.4 },
  render: { mist: { col: 0xe0eaf4, k: 1, amb: 0.2, lit: 1.2, amt: 0.28, h: 0.45, max: 0.16, scale: 0.05, wind: [0.05, 0.018], scatter: 0.25 }, vol: { col: 0xfff0d8, k: 0.3, dens: 0.04, ext: 1, top: 5, scale: 0.05, wind: [0.02, 0.008], noise: 0.8 }, /* round 5: post-FX data (gfx-post.js) */ sky: [0x7196c8, 0xe2ecf4], fog: [0xc8d6e4, 40, 150], exposure: 0.9, sun: [0xfff2e0, 0.82, [-0.55, 0.9, 0.4]], hemi: [0xe4ecff, 0x5e6a7e, 0.48],
    bloom: [1.15, 0.6], grade: { lift: [0.012, 0.012, 0.028], gamma: [1, 1, 0.98], gain: [1.0, 0.99, 1.03], sat: 0.96, contrast: 1.06, shadowTint: [-0.008, 0.0, 0.026], highTint: [0.012, 0.006, 0.0] },
    vignette: 0.26, particles: 'snow', lt: { amb: [0.64, 0.68, 0.78], sun: [0.44, 0.42, 0.42] },
    water: { color: 0x1d3c56, deep: 0x0b1a2a, foam: 0xeaf4ff, level: -0.45, ice: 0xcfe6f6 },
    lights: { brazier: [0xff9a48, 1.1, 6.5], way: [0xffa048, 1.4, 9], warp: [0x6aa8ff, 1.0, 5.5] } },
  props: {
    tree: propList([['rimeshore_pine_a', 3, 'tree_pine_a'], ['rimeshore_pine_b', 3, 'tree_pine_b']]),
    rock: propList([['rimeshore_ice_rock_a', 2, 'rock_field_a'], ['rimeshore_ice_rock_b', 1, 'rock_field_d']]),
    ice: propList([['rimeshore_ice_rock_c', 2, 'rock_field_c']]),
  },
  layout(m, K) {
    const { set, clearR, rng, w, h } = K, L = LK(m, K), SHORE = 31;
    m.entry = { x: 14, y: 36 }; m.way = { x: 15.5, y: 19.5 };
    // 1. the harbour: sea east of the shore (the town wall stops at the water), piers, a sand strip
    for (let y = 0; y < h; y++) for (let x = SHORE; x < w; x++) set(x, y, T.WATER);
    for (let y = 1; y < h - 1; y++) for (let x = SHORE - 3; x < SHORE; x++) L.surf(x, y, SURF.SAND);
    const piers = [[9, 41], [19, 44], [29, 39]];
    for (const [py, px1] of piers) for (let x = SHORE - 1; x <= px1; x++) for (const y of [py, py + 1]) { set(x, y, T.FLOOR); L.surf(x, y, SURF.BRIDGE); }
    // 2. houses (plots) and the plaza; the Salt Hall is the big house in the north-west
    m.houses = []; const house = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, T.RUIN); m.houses.push({ x0, y0, x1, y1 }); };
    house(4, 3, 9, 7); house(19, 3, 24, 7); house(3, 26, 6, 28); house(21, 27, 24, 29); house(2, 13, 5, 15); house(25, 12, 28, 14); house(9, 30, 12, 32);
    // cobbles: the plaza, the south gate street, the harbour street, the north lane
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < SHORE; x++) { const inPlaza = Math.hypot(x + 0.5 - 15.5, y + 0.5 - 19.5) < 6.2; if (inPlaza || (Math.abs(x - 14.5) <= 1.2 && y > 19) || (Math.abs(y - 19.5) <= 1.2 && x > 15) || (Math.abs(x - 14.5) <= 1.2 && y > 8 && y < 19) || (Math.abs(y - 9.5) <= 1 && x > 4 && x < 27)) m.deco[y * w + x] = 5; }
    // 3. the south gate to Rimeshore
    clearR(13, h - 3, 15, h - 1); m.warps.push({ x: 14, y: h - 2, to: 'rimeshore', tx: 20.5, ty: 3.5, label: 'Rimeshore' });
    // 4. pines and rocks along the town wall (kept off the streets)
    for (let i = 0; i < 26; i++) { const x = 1 + ((rng() * (SHORE - 5)) | 0), y = 1 + ((rng() * (h - 3)) | 0); if ((x < 3 || y < 3 || y > h - 4 || x > SHORE - 6) && L.at(x, y) === T.FLOOR && m.deco[y * w + x] !== 5 && m.surf[y * w + x] === 0 && !(x >= 12 && x <= 16 && y >= h - 5)) set(x, y, rng() < 0.75 ? T.TREE : T.ROCK); }
    m.braziers.push({ x: 12.0, y: 16.2 }, { x: 19.0, y: 16.2 }, { x: 12.0, y: 22.8 }, { x: 29.6, y: 17.8 }, { x: 29.6, y: 21.4 }, { x: 12.4, y: 35.6 }, { x: 16.6, y: 35.6 });
    // ---- decor ----
    L.decor('town_well', 'town_well', 10.5, 21.0, 0, 1, { fp: L.footprint(10, 20, 11, 21) });
    for (const [sx, sy] of [[18.5, 24.0], [21.5, 24.0]]) L.decor('town_market_stall', 'town_market_stall', sx, sy, Math.PI, 1, { fp: L.footprint(Math.floor(sx) - 1, Math.floor(sy), Math.floor(sx), Math.floor(sy)) });
    L.decor('rimeshore_fishing_hut', 'town_house_small', 27.5, 32.5, -1.571, 1, { fp: L.footprint(26, 31, 28, 33), light: [0xffb060, 0.9, 5] });
    L.decor('rimeshore_drying_rack', 'town_fence', 25.2, 35.4, 0.1, 1, { on: 'open' }); L.decor('rimeshore_drying_rack', 'town_fence', 28.2, 28.6, 1.4, 1, { on: 'open' });
    L.decor('signpost', 'signpost', 16.6, 34.4, 0.3, 1, { on: 'open' });
    for (const [lx, ly] of [[13.1, 12.6], [16.1, 12.6], [22.6, 18.1], [26.6, 21.1], [13.1, 27.6], [16.1, 31.6], [8.2, 9.9], [20.4, 10.9], [30.3, 11.2], [30.3, 31.2]]) L.decor('town_lamp_post', 'town_lamp_post', lx, ly, rng() * 6.28, 1, { light: [0xffb060, 1.1, 5.5], on: 'open' });
    for (const [bx, by, k] of [[10.6, 7.9, 'town_barrel'], [11.3, 8.2, 'town_barrel'], [3.4, 9.0, 'town_crates'], [29.2, 8.2, 'town_barrel'], [28.6, 11.6, 'town_crates'], [29.3, 23.2, 'town_crates'], [28.4, 26.6, 'town_barrel'], [25.4, 8.4, 'town_crates'], [7.2, 29.8, 'town_barrel'], [26.2, 25.6, 'town_barrel']])
      L.decor(k === 'town_barrel' ? 'rimeshore_barrel' : 'rimeshore_crate', k, bx, by, rng() * 6.28, k === 'town_barrel' ? 0.95 : 0.85, { on: 'open' });
    for (let x = 2; x <= 5; x++) L.decor('town_fence', 'town_fence', x + 0.5, 11.9, 0, 1, { on: 'open' });
    for (let y = 24; y <= 36; y += 1) if (!(y >= 28 && y <= 31)) L.decor('town_fence', 'town_fence', SHORE - 3.1, y + 0.5, 1.571, 1, { on: 'open' });
    // boardwalk planks on every pier, longships moored beside them, floes further out
    for (let y = 0; y < h; y++) for (let x = SHORE - 1; x < w; x++) if (m.surf[y * w + x] === SURF.BRIDGE) L.decor('mirewell_boardwalk', null, x + 0.5, y + 0.5, 1.571, 1, { dy: -0.32 });
    // Round 6 (graphics round 5 hook): the moored longships at the three piers and the Salt Hall's sign are placed here, so
    // the renderer's DECOR_UPGRADE swap for Skaldhaven switches itself off. y0 = absolute deck height (the hull sits in the water).
    L.decor('skaldhaven_longship_moored', 'rimeshore_longship', 36.5, 11.475, Math.PI / 2, 1, { y0: -0.12 });
    L.decor('skaldhaven_longship_moored', 'rimeshore_longship', 38.5, 21.475, Math.PI / 2, 1, { y0: -0.12 });
    L.decor('skaldhaven_longship_moored', 'rimeshore_longship', 36.0, 28.525, -Math.PI / 2, 0.94, { y0: -0.12 });
    L.decor('skaldhaven_tavern_sign', 'signpost', 9.75, 8.45, 0, 0.9, { on: 'open' });
    L.decor('rimeshore_longship_prow', 'rock_field_c', 43.4, 34.0, 0.4, 1, { dy: 0.5 });
    for (let i = 0; i < 12; i++) { const x = SHORE + 3 + rng() * (w - SHORE - 4), y = 1 + rng() * (h - 2); if (L.at(x | 0, y | 0) === T.WATER && !piers.some(([py]) => Math.abs(y - py - 0.5) < 3)) L.decor('rimeshore_ice_floe', 'rock_field_b', x, y, rng() * 6.28, 0.7 + rng() * 0.6, { dy: 0.7 }); }
    for (let y = 2; y < h - 2; y++) for (let x = 2; x < SHORE - 1; x++) if ((x < 5 || x > SHORE - 7 || y < 4 || y > h - 6) && L.at(x, y) === T.FLOOR && m.deco[y * w + x] !== 5 && m.surf[y * w + x] === 0 && rng() < 0.05) L.decor(rng() < 0.5 ? 'rimeshore_snowdrift_a' : 'rimeshore_snowdrift_b', null, x + 0.5, y + 0.5, rng() * 6.28, 0.6 + rng() * 0.3, { on: 'open' });
  } };
// Map order in the travel lists and the world map: story order.
const MAP_ORDER = ['emberhold', 'ashen_fields', 'withered_wood', 'gloamheim', 'rimeshore', 'skaldhaven', 'mirewell', 'nidavellir', 'throne', 'bifrost'];
// js/gfx-world.js reads render.trees for T.TREE tiles: point it at the map's tree list.
for (const k in MAPDEFS) { const d = MAPDEFS[k]; if (d.render && d.props && d.props.tree && !d.render.trees) d.render.trees = d.props.tree; }

/* =========================================================
   Content round 7: Helheim (design/helheim.md). Reached through Helgrind in Gloamheim once Act II is over and the
   hero has been born again (WARP_LOCKS.hel in js/core.js). Maps:
     helheim              the grey plains: the safe camp by the Helgrind road (Waystone, storage, healer, merchant,
                          the Deep's stair), the frozen river Gjöll crossed by Gjallarbrú, Hel's hall Eljudnir with
                          Garmr chained before its gate, the Root Road west to Hvergelmir
     helheim_hvergelmir   Níðhöggr's arena under the World-Tree root (superboss)
     helheim_arena        inside Eljudnir: the Gauntlet (boss rush)
     helheim_deep_<n>     procedural floors of the Deep Roots, generated on demand from a run seed (deepDef below;
                          genMap in core.js asks for them)
   Every helheim* id gets the graphics team's Helheim look (RLOOK_BASE.helheim in js/gfx-world.js); render data here
   only refines it (weather, time of day, fog per floor affix). Braziers are `helheim_brazier` decor with soul-green
   lights, not m.braziers (those still draw the orange dng_brazier).
   Height data (round 7 hook, genMap in core.js): a map may define `heights(m, K)`, run after the standard terrain
   heights. It may rewrite m.hgt (gameplay: where sprites stand and walk) and set m.rhgt, the rendered terrain
   (js/gfx-world.js renderHgt() uses m.rhgt when a map provides it). Helheim flattens the ground under the river and
   the set pieces (the Gjöll tiles are laid at one common height, decor y0 = 0, per the kit's placement notes), and
   gives Gjallarbrú its walking deck: m.hgt along the bridge = 0.12 + 0.38 · (1 − (z/5)²), z = −5..5 along its
   10 tiles (the model's deck curve), while m.rhgt keeps the river bed under it.
   ========================================================= */
for (const id of ['helheim_ash_drift_a', 'helheim_ash_drift_b', 'helheim_banner', 'helheim_blacksun_obelisk', 'helheim_bone_tree_a', 'helheim_bone_tree_a_lod1', 'helheim_bone_tree_b',
  'helheim_bone_tree_b_lod1', 'helheim_bone_tree_c', 'helheim_bone_tree_c_lod1', 'helheim_brazier', 'helheim_cairn_a', 'helheim_cairn_b', 'helheim_corpse_relief', 'helheim_gate_pillar',
  'helheim_gjallarbru', 'helheim_gjoll_corner_ice', 'helheim_gjoll_corner_land', 'helheim_gjoll_edge', 'helheim_gjoll_edge_b', 'helheim_gjoll_ice', 'helheim_hall_facade', 'helheim_root',
  'helheim_soul_lantern', 'helheim_timber_wall', 'rimeshore_barrel', 'rimeshore_crate']) MODEL_IDS.add(id);
// Gjallarbrú: tiles and deck. The bridge runs north-south (glTF Z = world y); GJALL.x0 is its west tile column.
const GJALL = { x0: 31, y0: 26, w: 3, len: 10 };
const gjallDeck = z => 0.12 + 0.38 * (1 - (z / 5) * (z / 5));          // z: bridge-local, -5 (north end) .. 5 (south end)
const HEL_RIVER = { y0: 28, y1: 33 };                                    // Gjöll: north bank row, 4 ice rows, south bank row
// Shared Helheim ground look (the renderer's Helheim look is the base; this is the gameplay/fallback data).
const HEL_LOOK = { floor: 'ash', g1: [92, 94, 92], g2: [128, 130, 126], path: [150, 144, 128], ash: [70, 70, 72], ashAmt: 0.25, grain: 16, flowers: 0, cobble: false, trees: ['dead', 'dead'],
  rock: 0x6a6c70, tint: [0.9, 0.95, 0.92], fog: 0x4e5351, fogN: 50, fogF: 120, hemi: [0x8a9894, 0x16181a, 0.5], sun: [0xc4d4cc, 0.2], torch: 0.4 };
const HEL_GROUND = ['#5a5c5a', '#606260', '#555755', '#646664'];
const HEL_WEATHER = { amb: [['ash', 0.55], ['souls', 0.6]], wind: [0.3, 0.12] };
// Time-locked twilight: the Helheim look is the twilight (RLOOK_BASE.helheim); no day, dusk or night cycle down here.
const HEL_RENDER = () => ({ weather: HEL_WEATHER, tod: false, particles: 'ash' });
const helProps = () => ({
  tree: propList([['helheim_bone_tree_a', 3, 'tree_dead_a'], ['helheim_bone_tree_b', 2, 'tree_dead_b'], ['helheim_bone_tree_c', 2, 'tree_dead_a']]),
  rock: propList([['helheim_cairn_a', 1, 'rock_field_c'], ['rock_field_a', 2, 'rock_field_a'], ['rock_field_c', 1, 'rock_field_c']]),
  wall: propList([['dng_wall', 1, 'dng_wall']]),
  grave: propList([['helheim_cairn_a', 1, 'dng_grave_a']]),
  pillar: propList([['dng_pillar', 1, 'dng_pillar']]),
});
// Helpers shared by the Helheim layouts
function helKit(m, K, L) {
  const { rng } = K;
  const lantern = (x, y, rot) => L.decor('helheim_soul_lantern', null, x, y, rot === undefined ? rng() * 6.283 : rot, 1, { light: [0x7affb4, 1.1, 5], on: 'open' });
  const brazier = (x, y) => L.decor('helheim_brazier', 'dng_brazier', x, y, 0, 1, { light: [0x7affb4, 1.4, 6.5], on: 'open' });
  const banner = (x, y, rot) => L.decor('helheim_banner', 'dng_banner', x, y, rot || 0, 1, { on: 'open' });
  const cairn = (x, y, big, rot) => { const fx = Math.floor(x), fy = Math.floor(y); return big ? L.decor('helheim_cairn_b', 'dng_grave_b', fx + 1, fy + 0.5, rot || 0, 1, { fp: L.footprint(fx, fy, fx + 1, fy) }) : L.decor('helheim_cairn_a', 'dng_grave_a', fx + 0.5, fy + 0.5, rot === undefined ? rng() * 6.283 : rot, 1, { fp: L.footprint(fx, fy, fx, fy), light: [0x7affb4, 0.6, 3] }); };
  const obelisk = (x, y, rot) => L.decor('helheim_blacksun_obelisk', 'throne_obsidian_pillar', x, y, rot || 0, 1, { fp: L.footprint(Math.round(x) - 1, Math.round(y) - 1, Math.round(x), Math.round(y)), light: [0xc8ffe0, 1.2, 6] });
  return { lantern, brazier, banner, cairn, obelisk };
}
// Flatten the field noise toward the given zones: f(vx, vz) -> distance (tiles) to the nearest flat zone.
function helFlatten(m, dist, ramp, amp) {
  const W1 = m.w + 1;
  for (let vz = 0; vz <= m.h; vz++) for (let vx = 0; vx <= m.w; vx++) { const i = vz * W1 + vx, k = Math.max(0, Math.min(1, dist(vx, vz) / ramp)); m.hgt[i] *= amp * k * k * (3 - 2 * k); }
}
const rectDist = (x, y, x0, y0, x1, y1) => Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(y0 - y, 0, y - y1));

MAPDEFS.helheim = { name: 'Helheim', sub: 'Base Lv 70 – 88 · The Grey Plains', lv: [70, 88], world: [228, 120], w: 64, h: 64, seed: 666, gen: 'field', trees: 0.03, rocks: 0.012, ruins: 0,
  ground: HEL_GROUND, void: '#0a0b0c', dark: 0.6, part: 'ash', look: HEL_LOOK, boss: 'garmr',
  intro: 'Helheim. The ash here is finer than in Midgard and falls upward, slowly, toward a sun that gives no light. Across the frozen river a hall of rotten timber waits, and something in front of it is chained.',
  render: HEL_RENDER(), props: helProps(),
  // spawn regions (js/core.js spawnMobRandom): the south plains are the gentler half, the north past Gjöll the worse
  spawns: [['hel_hound', 7], ['soul_wisp', 8], ['hel_draugr', 9], ['corpse_bride', 7], ['nidhogg_spawn', 6], ['bone_colossus', 4]],
  spawnRgn: { hel_hound: [2, 37, 61, 61], soul_wisp: [2, 36, 61, 61], hel_draugr: [2, 2, 61, 61], corpse_bride: [2, 2, 61, 26], nidhogg_spawn: [2, 2, 61, 26], bone_colossus: [2, 14, 61, 26] },
  safeZone: { x: 32, y: 50, r: 10 },   // the camp: monsters never follow you in (updateMob), none spawn there
  layout(m, K) {
    const { set, clearC, clearR, carve, rng, w, h } = K, L = LK(m, K), H = helKit(m, K, L), TT = K.T;
    m.entry = { x: 32, y: 60 }; m.way = { x: 32.5, y: 49.5 }; m.bossPos = { x: 32.5, y: 14.5 };
    // 1. clearings: the camp, the hall court, Garmr's gate, the bridge heads, the Deep's stair, the Root Road
    clearC(32, 50, 8.5); clearR(18, 2, 46, 17); clearR(26, 18, 38, 25); clearR(26, 36, 38, 41); clearC(46, 50, 3.5);
    carve(32, 61, 32, 57, 1); carve(32, 42, 32, 36, 1); carve(40, 50, 45, 50, 1); carve(31, 24, 18, 18, 1); carve(18, 18, 10, 12, 1); carve(10, 12, 2, 12, 1);
    carve(33, 24, 52, 18, 1); carve(26, 40, 12, 46, 1); carve(38, 40, 54, 44, 1);
    clearC(52.5, 18.5, 4); clearC(13, 46, 4); clearC(54, 44, 3.5);
    // 2. the frozen river Gjöll across the whole map: bank rows walkable, the ice between them blocked (the living
    //    fall through; T.PROP: drawn only by the river decor)
    for (let x = 0; x < w; x++) {
      for (let y = HEL_RIVER.y0 + 1; y < HEL_RIVER.y1; y++) set(x, y, TT.PROP);
      for (const y of [HEL_RIVER.y0, HEL_RIVER.y1]) if (x >= 2 && x < w - 2) set(x, y, TT.FLOOR);
    }
    // 3. Gjallarbrú: 3 x 10 tiles of walkable deck; railings block the sides, so you get on and off at the ends
    for (let y = GJALL.y0; y < GJALL.y0 + GJALL.len; y++) {
      for (let x = GJALL.x0; x < GJALL.x0 + GJALL.w; x++) { set(x, y, TT.FLOOR); L.surf(x, y, SURF.BRIDGE); }
      set(GJALL.x0 - 1, y, TT.PROP); set(GJALL.x0 + GJALL.w, y, TT.PROP);
    }
    // 4. Eljudnir (8 x 6, door south) and its walled court; Garmr's gate pillars; the hall door leads to the Gauntlet
    const hall = L.footprint(28, 4, 35, 8); for (let x = 28; x <= 35; x++) if (x !== 32) set(x, 9, TT.PROP);
    // the court's walls: blocked T.PROP tiles, each drawn by a keep-wall piece (dng_wall). helheim_timber_wall renders
    // almost black in Helheim's twilight (see the round-7 hooks in docs/CONTENT.md), so it is not used for now.
    const timber = [];
    for (let x = 18; x <= 46; x++) if (x < 26 || x > 38) timber.push([x, 12], [x, 13]);
    for (let y = 2; y <= 11; y++) timber.push([18, y], [46, y]);
    const pillA = L.footprint(26, 12, 27, 13), pillB = L.footprint(37, 12, 38, 13);
    m.warps.push({ x: 32, y: 9, to: 'helheim_arena', tx: 22.5, ty: 33.5, label: 'Eljudnir, the Hall of Hel', lock: 'hall' });
    // 5. the Root Road west: under a root of the World Tree to Hvergelmir
    const rootA = L.footprint(5, 6, 8, 8), rootB = L.footprint(5, 16, 8, 17);
    m.warps.push({ x: 1, y: 12, to: 'helheim_hvergelmir', tx: 20.5, ty: 31.5, label: 'Hvergelmir (the Root Road)', lock: 'root' });
    // 6. the camp: a Waystone, a timber palisade with gaps north, south and east
    // (the camp is open: no palisade; the timber pieces read as black blocks in Helheim's twilight, so lanterns and
    // braziers mark its edge instead)
    for (const [x, y] of timber) set(x, y, TT.PROP);
    m.warps.push({ x: 32, y: 62, to: 'gloamheim', tx: 30.5, ty: 6.5, label: 'Gloamheim Keep (Helgrind)' });
    // 7. the Deep's stair (Ganglati), east of the camp
    m.objs.push({ kind: 'deepstair', x: 47.5, y: 50.5, name: 'The Deep Roots' });
    const stair = L.footprint(48, 49, 48, 51);
    // paths paint (cobble-free ash roads), cairn fields, the Nameless Jarl's mound
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m.deco[y * w + x] === 6) m.deco[y * w + x] = 0;
    // ---- decor ----
    // Gjöll: bank pieces on both banks (edge / edge_b alternating), ice between, all at one height (y0 0: the
    // heights hook flattens the ground there)
    for (let x = 0; x < w; x++) {
      L.decor(x % 3 ? 'helheim_gjoll_edge' : 'helheim_gjoll_edge_b', 'rock_field_b', x + 0.5, HEL_RIVER.y0 + 0.5, Math.PI, 1, { y0: 0 });
      L.decor(x % 4 === 1 ? 'helheim_gjoll_edge_b' : 'helheim_gjoll_edge', 'rock_field_b', x + 0.5, HEL_RIVER.y1 + 0.5, 0, 1, { y0: 0 });
      for (let y = HEL_RIVER.y0 + 1; y < HEL_RIVER.y1; y++) L.decor('helheim_gjoll_ice', null, x + 0.5, y + 0.5, ((rng() * 4) | 0) * Math.PI / 2, 1, { y0: 0 });
    }
    L.decor('helheim_gjallarbru', 'bifrost_bridge', GJALL.x0 + GJALL.w / 2, GJALL.y0 + GJALL.len / 2, 0, 1, { y0: 0, fp: [GJALL.x0 - 1, GJALL.y0, GJALL.x0 + GJALL.w, GJALL.y0 + GJALL.len - 1] });
    L.decor('helheim_hall_facade', 'ruin_wall_c', 32.0, 7.0, 0, 1, { fp: hall, y0: 0 });
    L.decor('helheim_gate_pillar', 'dng_pillar', 27.0, 13.0, 0, 1, { fp: pillA, y0: 0 }); L.decor('helheim_gate_pillar', 'dng_pillar', 38.0, 13.0, Math.PI, 1, { fp: pillB, y0: 0 });
    L.decor('helheim_root', 'ruin_column_fallen', 7.0, 12.0, Math.PI / 2, 1, { fp: rootA, y0: 0 }); m.decor.push({ model: null, kit: null, x: 7, y: 16.5, rot: 0, scale: 1, fp: rootB, note: 'root footprint (drawn by the root above)' });
    H.obelisk(24, 7, 0.2); H.obelisk(41, 7, -0.2); H.obelisk(41, 44, 0.5);
    for (const [x, y] of [[29.6, 10.6], [34.4, 10.6], [24.5, 15.5], [40.5, 15.5], [29.4, 25.4], [35.6, 25.4], [29.4, 36.6], [35.6, 36.6], [31.0, 43.6], [34.0, 43.6], [31.0, 57.5], [34.0, 57.5], [20.5, 19.5], [13.5, 13.5], [44.5, 21.5]]) H.lantern(x, y, x < 32 ? 0 : Math.PI);
    for (const [x, y] of [[29.2, 47.6], [35.8, 47.6], [29.2, 52.8], [35.8, 52.8], [44.6, 48.6], [44.6, 52.4]]) H.brazier(x, y);
    for (const a of [20, 70, 110, 160, 200, 250, 290, 340]) { const t = a / 57.3; H.lantern(32 + Math.cos(t) * 9.2, 50 + Math.sin(t) * 9.2, t + Math.PI); }
    for (const [x, y] of [[20.5, 3.5], [44.5, 3.5], [22.5, 10.5], [42.5, 10.5], [30.5, 45.5], [34.5, 45.5], [45.5, 47.8], [45.5, 53.2]]) H.banner(x, y, 0);
    for (const [x, y] of timber) L.decor('dng_wall', 'dng_wall', x + 0.5, y + 0.5, ((x * 7 + y * 3) % 4) * Math.PI / 2, 1, { fp: [x, y, x, y] });
    for (const [x, y] of [[21.0, 14.4], [44.0, 14.4]]) L.decor('helheim_corpse_relief', 'dng_chain', x, y, 0, 1, { on: 'open' });
    L.decor('ruin_wall_c', 'ruin_wall_c', 48.9, 50.5, -Math.PI / 2, 1, { fp: stair });
    L.decor('dng_rubble_a', null, 49.5, 47.8, 0.4, 0.8, { on: 'open' }); L.decor('dng_bones', null, 47.2, 52.6, 1.2, 1, { on: 'open' });
    // cairn fields: Hlín's four cairns (hlin_names) and the barrows of the plains
    for (const [x, y, big] of [[12, 44, 1], [15, 48, 0], [10, 49, 0], [54, 41, 1], [57, 46, 0], [52, 47, 0], [49, 15, 1], [56, 21, 0], [22, 22, 0], [8, 36, 1], [58, 36, 0], [40, 22, 0]]) H.cairn(x, y, big, rng() * 6.28);
    for (let i = 0; i < 26; i++) { const x = 3 + rng() * (w - 6), y = 3 + rng() * (h - 6); if (L.at(x | 0, y | 0) !== TT.FLOOR || Math.hypot(x - 32, y - 50) < 11 || (y > 26 && y < 36)) continue; const big = rng() < 0.3; L.decor(big ? 'helheim_ash_drift_b' : 'helheim_ash_drift_a', null, x, y, rng() * 6.28, 0.9 + rng() * 0.3, big ? { fp: L.footprint(x | 0, y | 0, (x | 0) + 1, (y | 0) + 1) } : { on: 'open' }); }
    for (let i = 0; i < 30; i++) { const x = 3 + rng() * (w - 6), y = 3 + rng() * (h - 6); if (L.at(x | 0, y | 0) === TT.FLOOR && Math.hypot(x - 32, y - 50) > 9 && !(y > 26 && y < 36)) L.decor('dng_bones', null, x, y, rng() * 6.28, 0.8 + rng() * 0.4, { on: 'open' }); }
  },
  heights(m) {
    const W1 = m.w + 1, gx = GJALL.x0, gy = GJALL.y0;
    helFlatten(m, (vx, vz) => Math.min(
      Math.abs(vz - (HEL_RIVER.y0 + HEL_RIVER.y1 + 1) / 2) - 5.5,                 // the river and the bridge heads
      Math.hypot(vx - 32, vz - 50) - 10,                                          // the camp
      rectDist(vx, vz, 17, 1, 47, 18),                                           // the hall, its court and Garmr's gate
      rectDist(vx, vz, 1, 5, 11, 19), Math.hypot(vx - 47, vz - 50) - 3.5), 5, 0.75);
    m.rhgt = m.hgt.slice();
    for (let vz = HEL_RIVER.y0; vz <= HEL_RIVER.y1 + 1; vz++) for (let vx = 0; vx <= m.w; vx++) { const i = vz * W1 + vx; m.hgt[i] = 0; m.rhgt[i] = vz > HEL_RIVER.y0 && vz <= HEL_RIVER.y1 ? -0.3 : 0; }
    // the bridge deck (gameplay only; the rendered ground stays at the river bed / the bank under the model)
    for (let vz = gy; vz <= gy + GJALL.len; vz++) for (let vx = gx; vx <= gx + GJALL.w; vx++) m.hgt[vz * W1 + vx] = gjallDeck(vz - (gy + GJALL.len / 2));
  } };

MAPDEFS.helheim_hvergelmir = { name: 'Hvergelmir', sub: 'Where the Root Drinks · Níðhöggr', lv: [90, 99], world: [228, 120], w: 40, h: 36, seed: 669, gen: 'field', trees: 0, rocks: 0, ruins: 0,
  ground: HEL_GROUND, void: '#07080a', dark: 0.7, part: 'ash', look: Object.assign({}, HEL_LOOK, { fogN: 40, fogF: 95 }), boss: 'nidhogg', spawns: [],
  intro: 'Hvergelmir, the roaring kettle, where every river of the dead begins. It does not roar now. Something is chewing.',
  render: { weather: { amb: [['ash', 0.4], ['souls', 1]], wind: [0.1, 0.05] }, tod: false, particles: 'ash', water: { color: 0x14201e, deep: 0x040808, foam: 0x9affc8, level: -0.45, frozen: 0.25, blackSun: true } },
  props: helProps(),
  layout(m, K) {
    const { set, rng, w, h } = K, L = LK(m, K), H = helKit(m, K, L), TT = K.T;
    m.entry = { x: 20, y: 32 }; m.bossPos = { x: 20.5, y: 12.5 };
    // an oval hollow ringed with bone trees and rock, open to the root in the north
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dn = Math.hypot((x + 0.5 - 20) / 17.5, (y + 0.5 - 18) / 15.5) + (L.noise(x / 3, y / 3, 3) - 0.5) * 0.12;
      set(x, y, dn < 1 ? TT.FLOOR : (rng() < 0.6 ? TT.TREE : TT.ROCK));
    }
    for (let y = 32; y < h; y++) for (let x = 19; x <= 21; x++) set(x, y, TT.FLOOR);
    // the root (12 x 4) arches over the north end: blocked where it meets the ground, open under the arch
    const rA = L.footprint(14, 4, 16, 7), rB = L.footprint(23, 4, 25, 7);
    L.decor('helheim_root', 'ruin_column_fallen', 20.0, 6.0, 0, 1, { fp: rA, y0: 0 }); m.decor.push({ model: null, kit: null, x: 24, y: 6, rot: 0, scale: 1, fp: rB, note: 'root footprint' });
    // the spring itself: black water with a skin of ice, two pools
    L.disc(31, 13, 3.2, 0.3, (x, y) => set(x, y, TT.WATER)); L.disc(8, 22, 2.6, 0.3, (x, y) => set(x, y, TT.WATER));
    m.warps.push({ x: 20, y: 34, to: 'helheim', tx: 3.5, ty: 12.5, label: 'Helheim (the Root Road)' });
    // ---- decor ----
    H.obelisk(10, 9, 0.4); H.obelisk(31, 25, -0.4);
    for (let i = 0; i < 10; i++) { const a = Math.PI * 0.15 + i / 9 * Math.PI * 0.7, x = 20 + Math.cos(a) * 13.5, y = 18 + Math.sin(a) * 11.5; if (L.at(x | 0, y | 0) === TT.FLOOR) H.lantern(x, y); }
    for (const [x, y] of [[13.5, 10.5], [26.5, 10.5], [16.5, 29.5], [23.5, 29.5]]) H.brazier(x, y);
    for (const [x, y, big] of [[6, 14, 0], [33, 19, 1], [11, 28, 0], [28, 29, 0]]) H.cairn(x, y, big, rng() * 6.28);
    for (let i = 0; i < 22; i++) { const x = 4 + rng() * 32, y = 4 + rng() * 28; if (L.at(x | 0, y | 0) === TT.FLOOR) L.decor(rng() < 0.6 ? 'dng_bones' : 'helheim_ash_drift_a', null, x, y, rng() * 6.28, 0.8 + rng() * 0.4, { on: 'open' }); }
    for (const [x, y] of [[11.5, 5.5], [28.5, 5.5]]) H.banner(x, y, 0);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (L.at(x, y) === TT.WATER) L.paint(x, y);
  },
  heights(m) { helFlatten(m, (vx, vz) => Math.hypot((vx - 20) / 1.1, vz - 18) - 13, 4, 0.4); } };

MAPDEFS.helheim_arena = { name: 'Eljudnir', sub: 'The Hall of Hel · The Gauntlet', lv: [85, 99], world: [228, 120], w: 44, h: 40, seed: 671, gen: 'dungeon',
  ground: ['#3a3834', '#403c38', '#35332f', '#46423c'], wall: ['#5a5650', '#44403a', '#2e2c28'], void: '#060606', dark: 0.8, part: 'dust', safe: false, spawns: [],
  look: Object.assign({}, HEL_LOOK, { floor: 'flag', g1: [74, 72, 70], g2: [104, 100, 96], fog: 0x1a1c1c, fogN: 36, fogF: 90, torch: 1.2 }),
  intro: 'Eljudnir, Hel’s hall. The benches are full of the dead, and every one of them turns to watch you come in. They are hungry for a show.',
  render: { weather: { amb: [['souls', 0.8]], wind: [0.02, 0.01] }, tod: false },
  props: { wall: propList([['dng_wall', 1, 'dng_wall']]), pillar: propList([['dng_pillar', 1, 'dng_pillar']]), grave: propList([['helheim_cairn_a', 1, 'dng_grave_a']]) },
  layout(m, K) {
    const { set, clearR, rng, w, h } = K, L = LK(m, K), H = helKit(m, K, L), TT = K.T;
    clearR(7, 5, 36, 33); clearR(20, 33, 24, 37);
    for (const [x0, y0] of [[7, 5], [36, 5], [7, 33], [36, 33]]) for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3 - dy; dx++) set(x0 + (x0 < 20 ? dx : -dx), y0 + (y0 < 20 ? dy : -dy), TT.WALL);
    for (let y = 9; y <= 29; y += 5) { set(11, y, TT.PILLAR); set(32, y, TT.PILLAR); }
    m.entry = { x: 22, y: 34 }; m.rushAt = { x: 22.0, y: 17.0 };
    m.warps.push({ x: 22, y: 37, to: 'helheim', tx: 32.5, ty: 11.5, label: 'Helheim' });
    // ---- decor ---- Hel's high seat at the north end (the black-sun obelisk behind it), benches of the dead as cairns
    H.obelisk(22, 7, 0);
    for (const [x, y] of [[9.5, 7.5], [34.5, 7.5], [9.5, 31.5], [34.5, 31.5], [18.5, 7.5], [25.5, 7.5]]) H.brazier(x, y);
    for (let y = 8; y <= 30; y += 4) { H.banner(7.6, y + 0.5, Math.PI / 2); H.banner(36.4, y + 0.5, -Math.PI / 2); }
    for (const x of [13, 19, 25, 31]) L.decor('helheim_corpse_relief', 'dng_chain', x, 5.55, 0, 1, { on: 'open' });
    for (const [x, y] of [[13.5, 12.5], [30.5, 12.5], [13.5, 22.5], [30.5, 22.5]]) H.lantern(x, y);
    for (let i = 0; i < 14; i++) { const x = 8 + rng() * 28, y = 6 + rng() * 26; if (L.at(x | 0, y | 0) === TT.FLOOR && Math.hypot(x - 22, y - 17) > 7) L.decor('dng_bones', null, x, y, rng() * 6.28, 0.8 + rng() * 0.3, { on: 'open' }); }
  } };

/* ---------- The Deep Roots: procedural floors helheim_deep_<n> ----------
   deepDef(n, runSeed) builds a MAPDEFS entry for floor n of a run. Everything that shapes the floor comes from K.rng()
   (seeded with deepSeed(runSeed, n)), so a floor is identical every time for the same run seed and floor number.
   Rooms and corridors are carved out of solid wall (gen 'dungeon'); every room is joined to the start room by a
   spanning tree of corridors plus a few loops, so every room is reachable. The runtime (js/core.js, DEEP) fills the
   rooms with monsters scaled to the depth, spawns the warden (or the boss on every 5th floor), unlocks the descend
   portal and pays the rewards. m.rooms / m.deepStart / m.deepEnd describe the plan. */
const DEEP_AFFIXES = {
  frozen: { name: 'Frozen', desc: 'Rime on every stone: you move 15 % slower.' },
  ashen: { name: 'Ashen', desc: 'Ash-fog fills the halls: you see less far, and so do they.' },
  soul_rich: { name: 'Soul-Rich', desc: 'Lost souls crowd this floor: +50 % EXP.' },
  restless: { name: 'Restless', desc: 'More dead, and angrier: +30 % monsters, +15 % ATK, better loot.' },
  gilded: { name: 'Gilded', desc: 'The dead here were buried rich: double zeny and Obols.' },
};
const DEEP_THEMES = [
  { key: 'keep', floor: 'flag', wall: [['dng_wall', 1, 'dng_wall']], g1: [78, 76, 82], g2: [110, 106, 114], tint: [0.86, 0.9, 0.92] },
  { key: 'timber', floor: 'ash', wall: [['dng_wall', 1, 'dng_wall']], g1: [84, 84, 80], g2: [118, 116, 110], tint: [0.9, 0.94, 0.9] },
  { key: 'bone', floor: 'rock', wall: [['dng_wall', 1, 'dng_wall']], g1: [90, 88, 84], g2: [126, 122, 116], tint: [0.92, 0.95, 0.9] },
];
const DEEP_BOSSES = ['blight_mother', 'hati', 'sir_gaunt', 'drowned_jarl', 'bog_crone', 'fafnir', 'ashen_king', 'fenrir', 'garmr'];
const deepSeed = (run, n) => { let x = ((run | 0) ^ Math.imul(n + 1, 0x9e3779b1)) | 0; x = Math.imul(x ^ (x >>> 16), 0x85ebca6b); x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35); return ((x ^ (x >>> 16)) >>> 0) % 2147483647 || 1; };
const deepLevel = n => Math.min(130, 71 + 2 * n);
function deepPlan(n, run) {   // floor facts that do not need the layout: affixes, theme, boss (deterministic)
  const r = mulberry32(deepSeed(run, n) ^ 0x5eed), boss = n % 5 === 0, keys = Object.keys(DEEP_AFFIXES), aff = [];
  const nAff = n === 1 ? 0 : boss ? (r() < 0.5 ? 1 : 0) : n < 6 ? (r() < 0.6 ? 1 : 0) : (r() < 0.45 ? 2 : 1);
  while (aff.length < nAff) { const k = keys[(r() * keys.length) | 0]; if (!aff.includes(k)) aff.push(k); }
  const theme = DEEP_THEMES[Math.floor((n - 1) / 5) % DEEP_THEMES.length];
  const bossType = boss ? DEEP_BOSSES[(Math.floor(n / 5) - 1 + ((r() * 3) | 0)) % DEEP_BOSSES.length] : null;
  return { n, boss, aff, theme, bossType, lvl: deepLevel(n) };
}
function deepDef(n, run) {
  const plan = deepPlan(n, run), th = plan.theme, A = plan.aff, size = plan.boss ? 52 : Math.min(72, 52 + 2 * Math.floor(n / 3));
  const fog = A.includes('ashen') ? [0x4a4e4c, 12, 52] : A.includes('frozen') ? [0x8a9ca8, 26, 84] : null;
  const weather = A.includes('frozen') ? { amb: [['snow', 0.6], ['souls', 0.3]], wind: [0.15, 0.05] } : A.includes('ashen') ? { amb: [['ash', 1.3], ['souls', 0.3]], wind: [0.2, 0.08] }
    : A.includes('soul_rich') ? { amb: [['souls', 1.4]], wind: [0.05, 0.02] } : { amb: [['souls', 0.45], ['ash', 0.25]], wind: [0.05, 0.02] };
  const render = { weather, tod: false };
  if (fog) Object.assign(render, { fog, mist: { col: fog[0], k: 1, amb: 0.1, lit: 1.2, amt: A.includes('ashen') ? 0.6 : 0.45, h: 0.7, max: 0.32, scale: 0.06, wind: [0.02, 0.01], scatter: 0.4 } });
  const affTxt = A.map(k => DEEP_AFFIXES[k].name).join(' · ');
  return { name: `The Deep Roots · Floor ${n}`, sub: plan.boss ? `Floor ${n} · ${MOBS[plan.bossType].name} waits below` : `Floor ${n}${affTxt ? ' · ' + affTxt : ''}`, lv: [plan.lvl - 2, plan.lvl + 2], world: [228, 120],
    w: size, h: size, seed: deepSeed(run, n), gen: 'dungeon', deep: n, run, plan, ground: ['#3a3a38', '#403f3c', '#353432', '#464440'], wall: ['#5a5854', '#44423e', '#2e2c2a'], void: '#050505', dark: 0.88, part: 'dust',
    look: Object.assign({}, HEL_LOOK, { floor: th.floor, g1: th.g1, g2: th.g2, tint: th.tint, fog: 0x1a1c1c, fogN: 32, fogF: 86, torch: 1.4 }),
    render, props: { wall: propList(th.wall), pillar: propList([['dng_pillar', 1, 'dng_pillar']]), grave: propList([['dng_grave_a', 1, 'dng_grave_a'], ['dng_grave_b', 1, 'dng_grave_b'], ['helheim_cairn_a', 1, 'dng_grave_a']]) },
    spawns: [],
    layout(m, K) { deepLayout(m, K, plan); } };
}
function deepLayout(m, K, plan) {
  const { set, clearR, rng, w, h } = K, L = LK(m, K), H = helKit(m, K, L), TT = K.T, rooms = [];
  const ri = (a, b) => a + Math.floor(rng() * (b - a + 1));
  const overlaps = (x0, y0, x1, y1) => rooms.some(r => x0 < r.x1 + 4 && x1 > r.x0 - 4 && y0 < r.y1 + 4 && y1 > r.y0 - 4);
  const room = (x0, y0, x1, y1, kind) => { clearR(x0, y0, x1, y1); const r = { x0, y0, x1, y1, cx: (x0 + x1) >> 1, cy: (y0 + y1) >> 1, kind, i: rooms.length }; rooms.push(r); return r; };
  // 1. rooms: the start room on the south edge, then the rest where they fit
  const sw = 7, sx = ri(4, w - sw - 5);
  const start = room(sx, h - 11, sx + sw, h - 4, 'start');
  if (plan.boss) {
    const ax = Math.floor(w / 2) - 13, arena = room(ax, 4, ax + 26, 26, 'boss');
    for (const [px, py] of [[ax + 5, 9], [ax + 21, 9], [ax + 5, 21], [ax + 21, 21]]) set(px, py, TT.PILLAR);
    for (let i = 0; i < 2; i++) { const rw = ri(6, 9), rh = ri(5, 7), x0 = i ? ri(w - rw - 6, w - rw - 3) : ri(3, 6), y0 = ri(30, Math.max(30, h - rh - 13)); if (!overlaps(x0, y0, x0 + rw, y0 + rh)) room(x0, y0, x0 + rw, y0 + rh, 'side'); }
  } else {
    const want = 7 + Math.min(5, Math.floor(plan.n / 2));
    for (let t = 0; t < 400 && rooms.length < want; t++) {
      const rw = ri(6, 11), rh = ri(6, 10), x0 = ri(3, w - rw - 4), y0 = ri(3, h - rh - 14);
      if (!overlaps(x0, y0, x0 + rw, y0 + rh)) room(x0, y0, x0 + rw, y0 + rh, 'room');
    }
  }
  // 2. corridors: a minimum spanning tree over the room centres (Prim), plus loops; L-shaped, 3 wide
  const corr = (a, b) => { const hf = rng() < 0.5; if (hf) { clearR(a.cx, a.cy - 1, b.cx, a.cy + 1); clearR(b.cx - 1, a.cy, b.cx + 1, b.cy); } else { clearR(a.cx - 1, a.cy, a.cx + 1, b.cy); clearR(a.cx, b.cy - 1, b.cx, b.cy + 1); } };
  const inTree = [0], edges = [];
  while (inTree.length < rooms.length) {
    let best = null, bd = 1e9;
    for (const i of inTree) for (let j = 0; j < rooms.length; j++) { if (inTree.includes(j)) continue; const d = Math.hypot(rooms[i].cx - rooms[j].cx, rooms[i].cy - rooms[j].cy); if (d < bd) { bd = d; best = [i, j]; } }
    inTree.push(best[1]); edges.push(best);
  }
  for (let k = 0; k < Math.min(3, Math.floor(rooms.length / 3)); k++) { const a = ri(1, rooms.length - 1), b = ri(1, rooms.length - 1); if (a !== b && !edges.some(e => (e[0] === a && e[1] === b) || (e[0] === b && e[1] === a))) edges.push([a, b]); }
  for (const [a, b] of edges) corr(rooms[a], rooms[b]);
  // 3. the far room (most corridor hops from the start, ties by distance) holds the warden and the way down
  const adj = rooms.map(() => []); for (const [a, b] of edges) { adj[a].push(b); adj[b].push(a); }
  const hop = rooms.map(() => -1); hop[0] = 0; const q = [0]; while (q.length) { const c = q.shift(); for (const d of adj[c]) if (hop[d] < 0) { hop[d] = hop[c] + 1; q.push(d); } }
  const end = plan.boss ? rooms.find(r => r.kind === 'boss') : rooms.slice(1).sort((a, b) => hop[b.i] - hop[a.i] || Math.hypot(b.cx - start.cx, b.cy - start.cy) - Math.hypot(a.cx - start.cx, a.cy - start.cy))[0];
  end.kind = plan.boss ? 'boss' : 'warden';
  m.rooms = rooms; m.deepStart = start; m.deepEnd = end; m.deepEdges = edges;
  m.entry = { x: start.cx, y: start.cy };
  // 4. portals: the way back to Helheim (start room), the way down (far room; locked until the floor is cleared)
  m.warps.push({ x: start.x0 + 1, y: start.y1, to: 'helheim', tx: 46.5, ty: 52.5, label: 'Helheim (Ganglati’s Stair)' });
  const px = end.cx, py = plan.boss ? end.y0 + 2 : end.cy;
  m.warps.push({ x: px, y: py, to: 'helheim_deep_' + (plan.n + 1), tx: null, ty: null, label: `Floor ${plan.n + 1}`, lock: 'deep', deep: plan.n + 1 });
  m.deepPortal = { x: px + 0.5, y: py + 0.5 };
  // 5. dressing: pillars in the big rooms (never on the centre lines the corridors use), graves, braziers, banners
  const openAt = (x, y) => L.at(x, y) === TT.FLOOR;
  for (const r of rooms) {
    const big = (r.x1 - r.x0) >= 9 && (r.y1 - r.y0) >= 8;
    if (big && r.kind !== 'boss' && rng() < 0.7) for (let y = r.y0 + 2; y <= r.y1 - 2; y += 3) for (let x = r.x0 + 2; x <= r.x1 - 2; x += 3) if (Math.abs(x - r.cx) >= 2 && Math.abs(y - r.cy) >= 2 && rng() < 0.6) set(x, y, TT.PILLAR);
    if (r.kind === 'room' && rng() < 0.45) for (let i = 0; i < 2; i++) { const gx = ri(r.x0 + 1, r.x1 - 1), gy = ri(r.y0 + 1, r.y1 - 1); if (Math.abs(gx - r.cx) >= 2 && Math.abs(gy - r.cy) >= 2) set(gx, gy, TT.GRAVE); }
  }
  for (const r of rooms) {
    for (const [cx, cy] of [[r.x0 + 0.7, r.y0 + 0.7], [r.x1 + 0.3, r.y1 + 0.3]]) if (openAt(cx | 0, cy | 0)) H.brazier(cx, cy);
    if (r.kind !== 'start' && rng() < 0.6) { const x = r.cx + 0.5 + (rng() - 0.5) * (r.x1 - r.x0 - 2), y = r.y0 + 0.62; if (openAt(x | 0, r.y0) && L.at(x | 0, r.y0 - 1) === TT.WALL) L.decor(plan.theme.key === 'keep' ? 'dng_chain' : 'helheim_corpse_relief', 'dng_chain', x, y, 0, 1, { on: 'open' }); }
    if (rng() < 0.7) H.banner(r.x0 + 0.6, r.cy + 0.5, Math.PI / 2);
    const n = Math.round((r.x1 - r.x0) * (r.y1 - r.y0) / 18);
    for (let i = 0; i < n; i++) { const x = r.x0 + 0.5 + rng() * (r.x1 - r.x0), y = r.y0 + 0.5 + rng() * (r.y1 - r.y0); if (openAt(x | 0, y | 0)) { const k = rng(); L.decor(k < 0.5 ? 'dng_bones' : k < 0.75 ? 'helheim_ash_drift_a' : 'dng_rubble_b', null, x, y, rng() * 6.28, 0.7 + rng() * 0.4, { on: 'open' }); } }
    if (plan.theme.key === 'bone' && r.kind === 'room' && (r.x1 - r.x0) >= 8 && rng() < 0.5) { const tx = r.x0 + 2, ty = r.y0 + 2; if (openAt(tx, ty) && openAt(tx + 1, ty) && openAt(tx, ty + 1) && openAt(tx + 1, ty + 1) && Math.abs(tx - r.cx) >= 2 && Math.abs(ty - r.cy) >= 2) L.decor('helheim_bone_tree_' + 'abc'[ri(0, 2)], 'tree_dead_a', tx + 1, ty + 1, rng() * 6.28, 0.8, { fp: L.footprint(tx, ty, tx + 1, ty + 1) }); }
  }
  if (end.kind === 'boss' || end.kind === 'warden') { H.lantern(px - 1.5, py + 0.5, 0); H.lantern(px + 2.5, py + 0.5, Math.PI); }
  if (plan.boss) { H.obelisk(end.cx - 9, end.y0 + 3, 0.3); H.obelisk(end.cx + 10, end.y0 + 3, -0.3); }
  H.lantern(start.x0 + 2.5, start.y1 - 0.5, 0);
}

// Round 7: the Helgrind road into Helheim. Gloamheim's warp sits in the crack of Helgrind behind Gaunt's throne
// (the helgate object); it opens for a hero who finished Act II and has been born again (WARP_LOCKS.hel).
{ const base = MAPDEFS.gloamheim.layout; MAPDEFS.gloamheim.layout = function (m, K) { base.call(this, m, K); m.warps.push({ x: 30, y: 3, to: 'helheim', tx: 32.5, ty: 59.5, label: 'Helheim (through Helgrind)', lock: 'hel' }); }; }
MAP_ORDER.push('helheim');

/* ---------- Round 7: render data hooks for the older maps (graphics round 5: weather / tod / night) ----------
   The graphics team's defaults (WX_MAPS in js/gfx-world.js) become data here, with small per-map touches. Maps that
   the graphics team styles by hand (RLOOK) only read weather / tod / night / dusk from this block. */
{
  const R = (id, o) => { const d = MAPDEFS[id]; d.render = Object.assign(d.render || {}, o); };
  R('emberhold', { weather: { amb: [['leaves', 0.3], ['fireflies', 0.6, 0]], precip: [[null, 0, 7, 4], ['rain', 0.45, 1.5, 1]], wind: [0.5, 0.2] }, tod: true, night: { torch: 1.3 } });
  R('ashen_fields', { weather: { amb: [['leaves', 0.8], ['pollen', 0.25], ['ash', 0.2]], precip: [[null, 0, 6, 4], ['rain', 0.7, 1.5, 1], ['rain', 0.3, 1.5, 1]], wind: [0.7, 0.25] }, tod: true });
  R('withered_wood', { weather: { amb: [['pollen', 0.8], ['fireflies', 1, 0.08], ['leaves', 0.3]], precip: [[null, 0, 8, 5], ['rain', 0.4, 1.5, 1]], wind: [0.25, 0.1] }, tod: true, night: { mix: 0.84, dim: 0.12 } });
  R('gloamheim', { weather: { amb: [['souls', 0.18]], wind: [0.04, 0.02] }, tod: false });
  R('throne', { weather: { amb: [['ash', 1], ['embers', 0.4]], wind: [0.25, -0.35] }, tod: false });
  R('rimeshore', { weather: { precip: [['snow', 0.5, 3, 3], ['snow', 1, 1.5, 1.5], ['snow', 0.22, 2, 1.5]], wind: [0.9, 0.3] }, tod: true, night: { mix: 0.72, torch: 1.2 } });
  R('skaldhaven', { weather: { precip: [['snow', 0.35, 3, 3], ['snow', 0.8, 1.2, 1], [null, 0, 2, 1.5]], wind: [0.8, 0.25] }, tod: true, night: { torch: 1.4 } });
  R('mirewell', { weather: { amb: [['fireflies', 1, 0.35], ['spores', 0.6]], precip: [['rain', 0.35, 2, 2], ['rain', 1, 1.2, 1.5], [null, 0, 2.5, 2]], wind: [0.35, 0.15] }, tod: true, night: { mix: 0.8 } });
  R('nidavellir', { weather: { amb: [['embers', 0.7]], wind: [0.1, 0.05] }, tod: false });
  R('bifrost', { weather: { amb: [['motes', 1]], wind: [0.3, 0.1] }, tod: false });
}
