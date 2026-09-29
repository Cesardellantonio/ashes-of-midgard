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
  'rimeshore_ice_rock_c', 'rimeshore_longship', 'rimeshore_longship_prow', 'rimeshore_pine_a', 'rimeshore_pine_a_lod1', 'rimeshore_pine_b',
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
    L.decor('rimeshore_longship', 'ruin_column_fallen', 38.0, 16.6, 1.571, 1, { dy: 0.75 });
    L.decor('rimeshore_longship', 'ruin_column_fallen', 36.5, 26.6, -1.571, 0.9, { dy: 0.75 });
    L.decor('rimeshore_longship', 'ruin_column_fallen', 36.0, 12.4, 1.52, 0.85, { dy: 0.75 });
    L.decor('rimeshore_longship_prow', 'rock_field_c', 43.4, 34.0, 0.4, 1, { dy: 0.5 });
    for (let i = 0; i < 12; i++) { const x = SHORE + 3 + rng() * (w - SHORE - 4), y = 1 + rng() * (h - 2); if (L.at(x | 0, y | 0) === T.WATER && !piers.some(([py]) => Math.abs(y - py - 0.5) < 3)) L.decor('rimeshore_ice_floe', 'rock_field_b', x, y, rng() * 6.28, 0.7 + rng() * 0.6, { dy: 0.7 }); }
    for (let y = 2; y < h - 2; y++) for (let x = 2; x < SHORE - 1; x++) if (L.at(x, y) === T.FLOOR && m.deco[y * w + x] !== 5 && m.surf[y * w + x] === 0 && rng() < 0.03) L.decor(rng() < 0.5 ? 'rimeshore_snowdrift_a' : 'rimeshore_snowdrift_b', null, x + 0.5, y + 0.5, rng() * 6.28, 0.6 + rng() * 0.3, { on: 'open' });
  } };
// Map order in the travel lists and the world map: story order.
const MAP_ORDER = ['emberhold', 'ashen_fields', 'withered_wood', 'gloamheim', 'rimeshore', 'skaldhaven', 'mirewell', 'nidavellir', 'throne', 'bifrost'];
// js/gfx-world.js reads render.trees for T.TREE tiles: point it at the map's tree list.
for (const k in MAPDEFS) { const d = MAPDEFS[k]; if (d.render && d.props && d.props.tree && !d.render.trees) d.render.trees = d.props.tree; }
