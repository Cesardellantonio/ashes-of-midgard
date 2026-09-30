'use strict';
/* =========================================================
   Data: interiors (cycle 9, world expansion; design/world-expansion.md)
   Loaded after js/data/squad.js and before js/core.js. Adds to the globals only (MAPDEFS, NPCS, ITEMS, LORE, OBJ_TALK,
   QUESTS, RUMORS, MOBS) and wraps the layouts of the maps that get doors (emberhold, skaldhaven, nidavellir, helheim,
   gloamheim): every original tile, NPC, warp and building stays where it was.

   Twelve hand-authored rooms (gen 'interior': solid walls, the blueprint carves the rooms):
     emberhold_tavern     The Last Hearth: bar, hearth, tables, a raised back room up a stair (the loft)
     emberhold_smithy     Brokkr's forge-house behind the anvil yard
     emberhold_temple     the Waystone chapel (Sister Ingunn: the Waystone's Grace)
     emberhold_house_a    the weaver's house (Gunnhild, Egil, old Thorvald)
     emberhold_house_b    the fletcher's cottage (Hallvard and Sæunn)
     skaldhaven_salthall  the Salt Hall: long tables, fire pits, the high seat between its pillars
     skaldhaven_longhouse the Netmaker clan's longhouse
     skaldhaven_hold      below deck in the Sea-Snake, Ormr's longship at the middle pier
     nidavellir_forgehall the Anvil-Hall of Durinn: great anvils, a lava channel with one bridge
     helheim_tent         Hlín's tent in the camp (a new tent set piece west of the Waystone)
     gloamheim_crypt      the keep's crypt (undead, the Hollow Castellan)
     gloamheim_library    Sir Gaunt's library behind the throne hall
   Round 10 adds fourteen small rooms behind the world team's new town plots (see "Round 10" further down):
     emberhold_row_a / row_b      the Smiths' Row workshops (Hrefna's nail-forge, Grani's lamp-shop)
     emberhold_house_c / house_d  the cooper's house, the charcoal-burner's house
     emberhold_house_e            the gravedigger's house by the chapel yard
     emberhold_farm_a / b / c     farmhouses in the Farm Ward: a byre through the wall, a byre behind a rail, a hay loft
     emberhold_house_f / house_g  the midwife's house, the thatcher's house (Tóki's family)
     skaldhaven_net_a / net_b     Netmakers' Row: the net-shed, the rope-walk
     skaldhaven_smokehouse        fish racks over two fires, and a packing room
     skaldhaven_net_c             the sealer's house

   Blueprints (INT_ROOMS[id].rows, one string per tile row):
     '#' wall   '.' floor   ',' loft floor (raised, `loft`)   '/' stair (floor; the loft edge ramps down over it)
     '~' lava   'w' water   'I' pillar   '+' grave niche   'r' railing (blocked, fence decor)   '=' bridge (floor, SURF.BRIDGE)
     'D' the exit door (the warp back out; m.entry is the floor tile beside it)
   Furniture `F` = [kit, fallback, x0, y0, x1, y1, rot, scale, extra]: the tiles x0..x1 / y0..y1 become T.PROP (blocked)
   and one decor piece is centred on them. Small things `S` = [kit, fallback, x, y, rot, scale, extra] stand on open
   floor (on: 'open', not blocking). Kit ids are the art team's interior_* kit (contract in design/world-expansion.md);
   the fallback is a model that exists today. The layout never depends on which models exist: a missing model changes
   only what is drawn. Lights go to m.lights ({ x, y, col, r, i }); decor pieces carry `light: false` so a model with
   light anchors is not lit twice.

   Doors: a door is an ordinary warp { x, y, to, tx, ty, label, door: true } on the building's edge (INT_DOORS). The
   parent layout is wrapped once per map; the door tile is opened, and trees or rocks on the step in front of it are
   cleared (Emberhold scatters a few trees at random). Town plots carrying a door get `doors: [{ x, y, to }]` in
   m.houses. Every interior carries `parent` (the map it belongs to) and its parent's `world` position.

   Objects (m.objs; OBJ_TALK): 'ibook' (a readable: pages, may unlock a Chronicle entry; counts as a lore find,
   P.flags.loreFound, once per book: P.flags.iread), 'ichest' (a hidden chest with fixed loot and its own text, emptied
   once per save: P.flags.chests['int_' + key], the world team's chest store, so it counts for Treasure-Seeker; o.open
   is set for the renderer). Both are drawn by their decor piece (interior_chest, a shelf, a board). Services live in NPC dialogs: a bed by the Last Hearth (heal + save),
   the Waystone's Grace (a blessing), Kol's knucklebones.
   Saved state: P.flags.chests['int_*'], P.flags.iread, P.flags.ichat (chatter position per NPC), P.flags.igrace,
   P.flags.kol; all created on first use, so older saves load untouched.
   ========================================================= */

/* ---------- The interior kit (art team) ---------- */
// Every interior_* id the rooms ask for; graphics draws the fallback (or its placeholder) until a model lands.
const INT_KIT_IDS = ['interior_hearth', 'interior_forge', 'interior_dwarf_anvil', 'interior_lava_trough', 'interior_table', 'interior_long_table', 'interior_bench', 'interior_stool',
  'interior_bed', 'interior_chest', 'interior_shelf', 'interior_bookshelf', 'interior_bar', 'interior_candle_stand', 'interior_chandelier', 'interior_rug', 'interior_weapon_rack',
  'interior_loom', 'interior_altar', 'interior_high_seat', 'interior_herbs', 'interior_pelts', 'interior_post', 'interior_railing', 'interior_wall_timber_window',
  'interior_wall_stone_window', 'interior_wall_hall', 'interior_gear_wall', 'helheim_tent'];

/* ---------- Registry: doors and rooms ---------- */
// door: the warp tile on the parent map; step: where you land outside (the tile in front of the door). The inside
// landing is the room's m.entry (next to its 'D').
const INT_DOORS = {
  emberhold_tavern: { parent: 'emberhold', door: [29, 8], step: [29, 9] },
  emberhold_smithy: { parent: 'emberhold', door: [7, 8], step: [7, 9] },
  emberhold_temple: { parent: 'emberhold', door: [49, 29], step: [49, 30], plot: 'emberhold_chapel' },   // the Ember Chapel (world team's grown ward)
  emberhold_house_a: { parent: 'emberhold', door: [7, 27], step: [7, 26] },
  emberhold_house_b: { parent: 'emberhold', door: [29, 14], step: [29, 15] },
  skaldhaven_salthall: { parent: 'skaldhaven', door: [6, 7], step: [6, 9] },
  skaldhaven_longhouse: { parent: 'skaldhaven', door: [22, 7], step: [22, 8] },
  skaldhaven_hold: { parent: 'skaldhaven', door: [38, 20], step: [38, 19] },
  nidavellir_forgehall: { parent: 'nidavellir', door: [23, 20], step: [23, 21] },
  helheim_tent: { parent: 'helheim', door: [26, 50], step: [27, 50] },
  gloamheim_crypt: { parent: 'gloamheim', door: [24, 56], step: [25, 56] },
  gloamheim_library: { parent: 'gloamheim', door: [20, 5], step: [21, 5] },
  // round 10: the world team's new town plots. door / step are placeholders (the street tile from the contract): the
  // grow.layout wrapper below replaces them with the plot's own door read from m.houses (step = the plot's `door`,
  // door = that tile clamped onto the building's edge), as for emberhold_temple.
  emberhold_row_a: { parent: 'emberhold', door: [40, 8], step: [40, 8], plot: 'emberhold_row_a' },
  emberhold_row_b: { parent: 'emberhold', door: [49, 8], step: [49, 8], plot: 'emberhold_row_b' },
  emberhold_house_c: { parent: 'emberhold', door: [42, 11], step: [42, 11], plot: 'emberhold_house_c' },
  emberhold_house_d: { parent: 'emberhold', door: [49, 11], step: [49, 11], plot: 'emberhold_house_d' },
  emberhold_house_e: { parent: 'emberhold', door: [40, 26], step: [40, 26], plot: 'emberhold_house_e' },
  emberhold_farm_a: { parent: 'emberhold', door: [6, 43], step: [6, 43], plot: 'emberhold_farm_a' },
  emberhold_farm_b: { parent: 'emberhold', door: [26, 43], step: [26, 43], plot: 'emberhold_farm_b' },
  emberhold_farm_c: { parent: 'emberhold', door: [6, 47], step: [6, 47], plot: 'emberhold_farm_c' },
  emberhold_house_f: { parent: 'emberhold', door: [26, 47], step: [26, 47], plot: 'emberhold_house_f' },
  emberhold_house_g: { parent: 'emberhold', door: [12, 47], step: [12, 47], plot: 'emberhold_house_g' },
  skaldhaven_net_a: { parent: 'skaldhaven', door: [9, 44], step: [9, 44], plot: 'skaldhaven_net_a' },
  skaldhaven_net_b: { parent: 'skaldhaven', door: [17, 44], step: [17, 44], plot: 'skaldhaven_net_b' },
  skaldhaven_smokehouse: { parent: 'skaldhaven', door: [9, 50], step: [9, 50], plot: 'skaldhaven_smokehouse' },
  skaldhaven_net_c: { parent: 'skaldhaven', door: [17, 50], step: [17, 50], plot: 'skaldhaven_net_c' },
};

/* ---------- Room builder ---------- */
function intBuild(m, K, B) {
  const L = LK(m, K), { w, h } = K;
  const rails = [];
  let door = null;
  for (let y = 0; y < h; y++) {
    const row = B.rows[y] || '';
    for (let x = 0; x < w; x++) {
      const c = row[x] || '#';
      if (c === '.' || c === ',' || c === '/') L.put(x, y, T.FLOOR);
      else if (c === 'D') { L.put(x, y, T.FLOOR); door = [x, y]; }
      else if (c === '=') { L.put(x, y, T.FLOOR); L.surf(x, y, SURF.BRIDGE); }
      else if (c === '~') { L.put(x, y, T.LAVA); m.deco[y * w + x] = 6; }
      else if (c === 'w') { L.put(x, y, T.WATER); L.paint(x, y); }
      else if (c === 'I') L.put(x, y, T.PILLAR);
      else if (c === '+') L.put(x, y, T.GRAVE);
      else if (c === 'r') { L.put(x, y, T.PROP); rails.push([x, y]); }
      else L.put(x, y, T.WALL);
    }
  }
  // the way out: the door tile, and the floor beside it is where you arrive
  const [dx, dy] = door, inner = [[0, 1], [0, -1], [1, 0], [-1, 0]].map(([ax, ay]) => [dx + ax, dy + ay]).find(([ax, ay]) => L.at(ax, ay) === T.FLOOR && B.rows[ay][ax] !== 'D');
  m.entry = { x: inner[0], y: inner[1] };
  const D = INT_DOORS[B.id], P0 = MAPDEFS[D.parent];
  if (D.plot && !D.resolved && typeof genMap === 'function') genMap(D.parent);
  m.warps.push({ x: dx, y: dy, to: D.parent, tx: D.step[0] + 0.5, ty: D.step[1] + 0.5, label: B.outLabel || P0.name, door: true });
  // railings along the loft edge (fence pieces, at the loft's height)
  for (const [x, y] of rails) {
    // interior_railing: one tile along x with its post at -x; the last piece of a run turns round to close it
    const horiz = L.at(x - 1, y) === T.PROP || L.at(x + 1, y) === T.PROP || B.rows[y][x - 1] === '/' || B.rows[y][x + 1] === '/', last = horiz && B.rows[y][x + 1] !== 'r';
    // (a railing on the loft's edge row stands at the loft's height; any other railing, e.g. stall fronts, on the floor)
    const edge = B.loft && y === B.loft.y1 + 1;
    L.decor('interior_railing', null, x + 0.5, y + (edge ? 0.12 : 0.5), horiz ? (last ? Math.PI : 0) : Math.PI / 2, 1, Object.assign({ fp: [x, y, x, y] }, edge ? { y0: B.loft.h - 0.04 } : {}));
  }
  // kit wall blocks on wall tiles (they replace the procedural wall there; gfx-world.js buildInteriorWalls): the window
  // tiles of render.interior.windows get the style's window wall, B.kitWalls adds feature walls ([kit, x, y])
  const wallRot = (x, y) => L.at(x, y + 1) === T.FLOOR ? 0 : L.at(x + 1, y) === T.FLOOR ? Math.PI / 2 : L.at(x - 1, y) === T.FLOOR ? -Math.PI / 2 : Math.PI;
  const winKit = { timber: 'interior_wall_timber_window', hall: 'interior_wall_timber_window', stone: 'interior_wall_stone_window', dwarf: 'interior_wall_stone_window' }[(B.interior && B.interior.wall) || 'timber'];
  for (const [x, y] of (B.interior && B.interior.windows) || []) if (L.at(x, y) === T.WALL) L.decor(winKit, null, x + 0.5, y + 0.5, wallRot(x, y), 1, { light: false, wall: true });
  for (const [kit, x, y] of B.kitWalls || []) if (L.at(x, y) === T.WALL) L.decor(kit, null, x + 0.5, y + 0.5, wallRot(x, y), 1, { light: false, wall: true });
  const lit = (x, y, l) => { if (l) m.lights.push({ x: +x.toFixed(2), y: +y.toFixed(2), col: l[0], r: l[2] || 6, i: l[1] || 1, kind: l[3] || 'lamp', h: l[4] !== undefined ? l[4] : 1.3, flame: false }); };
  const loftY0 = (x, y) => B.loft && x >= B.loft.x0 && x <= B.loft.x1 + 1 && y >= B.loft.y0 && y <= B.loft.y1 + 1 ? { y0: B.loft.h } : {};
  // furniture: blocked footprints with one piece centred on them
  for (const f of B.F || []) {
    const [kit, fb, x0, y0, x1, y1, rot, sc, ex] = f, cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2, o = Object.assign({}, ex || {});
    const l = o.light; delete o.light; const at = o.at; delete o.at;
    const px = at ? at[0] : cx, py = at ? at[1] : cy;
    L.decor(kit, fb, px, py, rot || 0, sc || 1, Object.assign({ fp: L.footprint(x0, y0, x1, y1), light: false }, loftY0(px, py), o));
    if (l) lit(px, py, l);
  }
  // small things on open floor
  for (const s of B.S || []) {
    const [kit, fb, x, y, rot, sc, ex] = s, o = Object.assign({}, ex || {}); const l = o.light; delete o.light;
    L.decor(kit, fb, x, y, rot || 0, sc || 1, Object.assign({ on: 'open', light: false }, loftY0(x, y), o));
    if (l) lit(x, y, l);
  }
  for (const l of B.lights || []) lit(l[0], l[1], l.slice(2));
  for (const b of B.braziers || []) m.braziers.push({ x: b[0], y: b[1] });
  for (const o of B.objs || []) m.objs.push(Object.assign({}, o));
  if (B.extra) B.extra(m, K, L);
  return L;
}
// Loft floors (',' in a blueprint) and flush lava: runs as MAPDEFS[id].heights after the standard terrain heights.
function intHeights(m, B) {
  const W1 = m.w + 1;
  if (B.loft) { const F = B.loft; for (let vz = F.y0 - 1; vz <= F.y1 + 1; vz++) for (let vx = F.x0 - 1; vx <= F.x1 + 2; vx++) if (vx >= 0 && vz >= 0 && vx <= m.w && vz <= m.h) m.hgt[vz * W1 + vx] = F.h; }
  // lava channels are flush kerbs like Nidavellir's (nidavellir_lava_edge), not a sunken sea
  for (let vz = 0; vz <= m.h; vz++) for (let vx = 0; vx <= m.w; vx++) {
    let lava = 0; for (const [tx, ty] of [[vx - 1, vz - 1], [vx, vz - 1], [vx - 1, vz], [vx, vz]]) if (tx >= 0 && ty >= 0 && tx < m.w && ty < m.h && m.t[ty * m.w + tx] === T.LAVA) lava++;
    if (lava === 4) m.hgt[vz * W1 + vx] = -0.05; else if (lava) m.hgt[vz * W1 + vx] = Math.min(m.hgt[vz * W1 + vx], 0);
  }
}

/* ---------- Looks ---------- */
const INT_LOOKS = {
  // look = gameplay / fallback ground data; the renderer's interior look comes from render.interior (gfx-world.js)
  plank: { floor: 'dirt', g1: [96, 68, 44], g2: [138, 100, 64], path: [150, 116, 76], grain: 16, rock: 0x6a5a4a, tint: [1.04, 0.96, 0.88], fog: 0x120c08, fogN: 30, fogF: 80, hemi: [0xffd6a4, 0x3c2818, 0.5], sun: [0xffe8c8, 0.2], torch: 0.8 },
  stone: { floor: 'flag', g1: [92, 88, 84], g2: [132, 126, 118], path: [120, 112, 100], grain: 16, rock: 0x7a746c, tint: [1.0, 0.97, 0.92], fog: 0x100e0c, fogN: 30, fogF: 80, hemi: [0xf0d8b8, 0x30281e, 0.48], sun: [0xffe8c8, 0.2], torch: 0.9 },
  dwarf: { floor: 'carved', g1: [86, 74, 66], g2: [122, 108, 94], path: [52, 30, 22], grain: 16, rock: 0x6a5e56, tint: [0.98, 0.9, 0.84], fog: 0x140e0a, fogN: 30, fogF: 86, hemi: [0xffc890, 0x2a1c14, 0.44], sun: [0xffc890, 0.12], torch: 1.2 },
  straw: { floor: 'dirt', g1: [120, 100, 64], g2: [164, 138, 90], path: [150, 130, 90], grain: 14, rock: 0x6a5a4a, tint: [0.96, 0.98, 0.94], fog: 0x0c0e0e, fogN: 30, fogF: 80, hemi: [0xc8e0d8, 0x202420, 0.46], sun: [0xc4d4cc, 0.14], torch: 0.8 },
  crypt: { floor: 'flag', g1: [74, 72, 80], g2: [106, 102, 114], path: [90, 86, 96], grain: 18, rock: 0x6a6674, tint: [0.86, 0.88, 0.97], fog: 0x0c0c14, fogN: 26, fogF: 70, hemi: [0x98a0c8, 0x181820, 0.45], sun: [0xb8c0ff, 0.14], torch: 1.6 },
};
const INT_GROUND = { plank: ['#5a4430', '#604834', '#54402c', '#664c36'], stone: ['#4a4642', '#504c46', '#44403c', '#56524a'], dwarf: ['#3a3430', '#403834', '#35302c', '#463e38'],
  straw: ['#6a5a3a', '#72603e', '#645436', '#786444'], crypt: ['#34323a', '#393640', '#2f2d34', '#3c3842'] };
const INT_WALLS = { plank: ['#6a4a30', '#4a3222', '#2e2016'], stone: ['#6a645c', '#4a4640', '#2e2a26'], dwarf: ['#5e544c', '#463e38', '#2e2824'], straw: ['#5a4a3a', '#3e3228', '#241c16'], crypt: ['#57525e', '#403b47', '#2e2a34'] };

/* ---------- The rooms ---------- */
const INT_ROOMS = {};
function intRoom(id, o) {
  const D = INT_DOORS[id], par = MAPDEFS[D.parent], B = Object.assign({ id }, o), w = o.rows[0].length, h = o.rows.length, st = o.style || 'plank';
  for (const r of o.rows) if (r.length !== w) throw new Error(`interiors: ${id} blueprint row width ${r.length} != ${w}`);
  INT_ROOMS[id] = B;
  const render = Object.assign({ kind: 'interior', interior: Object.assign({ floor: 'plank', wall: 'timber', ceilingFade: true }, o.interior || {}), tod: false,
    weather: { amb: o.amb || [['pollen', 0.12]], wind: [0.02, 0.01] } }, o.render || {});
  MAPDEFS[id] = { name: o.name, sub: o.sub, lv: o.lv || null, world: par.world ? par.world.slice() : [0, 0], parent: D.parent, interior: true, w, h, seed: o.seed,
    gen: 'interior', safe: !o.spawns, ground: INT_GROUND[st], wall: INT_WALLS[st], void: '#080604', dark: o.dark || 0.5, part: o.part || 'dust', intro: o.intro,
    look: Object.assign({}, INT_LOOKS[st], o.look || {}), render, props: o.props || { pillar: propList([['dng_pillar', 1, 'dng_pillar']]), grave: propList([['dng_grave_a', 1, 'dng_grave_a'], ['dng_grave_b', 1, 'dng_grave_b']]) },
    spawns: o.spawns || [], elites: o.elites,
    layout(m, K) { intBuild(m, K, B); },
    heights(m) { intHeights(m, B); } };
}

// Placement helpers for the art kit (assets/models/index.json, kits.interior). Wall-mounted pieces (shelf, bookshelf,
// weapon_rack, loom, herbs, pelts, forge, high_seat) stand on the floor tile in front of a wall, rotated by that wall:
// north 0, west +pi/2, east -pi/2, south pi. Beds: head at -Z (rot 0 = head against the north wall).
const WN = 0, WW = Math.PI / 2, WE = -Math.PI / 2, WS = Math.PI;
// light kinds for m.lights (gfx-world.js mapLights): the models carry their own flames, so flame: false
const LH = (i, r) => [0xff9040, i || 2.4, r || 9, 'hearth', 0.55], LC = (i, r) => [0xffc070, i || 1.0, r || 5, 'candle', 1.35], LCH = (i, r) => [0xffc070, i || 1.3, r || 7.5, 'chandelier', 2.4];
const LF = (i, r) => [0xff8a30, i || 2.3, r || 8, 'forge', 0.9];
// a trestle table (2 x 1 along x) with a bench on each long side
const TAB = (x, y, kit) => [[kit || 'interior_table', 'town_crates', x, y, x + 1, y, 0, 1]];
const BENCHES = (x, y) => [['interior_bench', null, x + 1, y - 0.3, 0, 1], ['interior_bench', null, x + 1, y + 1.3, Math.PI, 1]];
const POSTS = { pillar: propList([['interior_post', 1, 'dng_pillar']]), grave: propList([['dng_grave_a', 1, 'dng_grave_a'], ['dng_grave_b', 1, 'dng_grave_b']]) };

// ---- Emberhold: The Last Hearth ----
intRoom('emberhold_tavern', { name: 'The Last Hearth', sub: 'Emberhold · Tavern', seed: 9101, style: 'plank',
  intro: 'The Last Hearth. It is warm in here, and loud, and it smells of smoke and wet wool and ale. Nobody looks up when the door opens. Then everybody does.',
  interior: { floor: 'plank', wall: 'timber', trim: 0x4a2c16, windows: [[5, 0], [20, 0], [0, 9], [0, 17], [29, 9], [29, 17]] },
  props: POSTS, loft: { x0: 1, y0: 1, x1: 28, y1: 5, h: 0.8 },
  rows: [
    '##############################',
    '#,,,,,,,,,,#,,,,,,,,,,,,,,,,,#',
    '#,,,,,,,,,,#,,,,,,,,,,,,,,,,,#',
    '#,,,,,,,,,,,,,,,,,,,,,,,,,,,,#',
    '#,,,,,,,,,,#,,,,,,,,,,,,,,,,,#',
    '#,,,,,,,,,,#,,,,,,,,,,,,,,,,,#',
    '#rrrrrrrrrrrrrrrrrrrrrrrr//rr#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '##############D###############'],
  F: [
    // the bar (its own keg rack behind), barrels and shelves against the gallery rail
    ['interior_bar', 'town_crates', 14, 10, 16, 10, 0, 1], ['interior_bar', 'town_crates', 17, 10, 19, 10, 0, 1], ['interior_bar', 'town_crates', 20, 10, 22, 10, 0, 1],
    ['town_barrel', 'town_barrel', 14, 7, 14, 7, 0.4, 1], ['town_barrel', 'town_barrel', 15, 7, 15, 7, 1.1, 1], ['town_barrel', 'town_barrel', 21, 7, 21, 7, 0.7, 1], ['town_barrel', 'town_barrel', 22, 7, 22, 7, 2, 1],
    ['interior_shelf', 'town_crates', 17, 7, 17, 7, WN, 1], ['interior_shelf', 'town_crates', 18, 7, 18, 7, WN, 1],
    // the long-fire by the west wall, the tally-board by the stair
    ['interior_hearth', 'dng_brazier', 2, 12, 2, 13, WW, 1, { light: LH() }],
    ['town_bounty_board', 'town_bounty_board', 12, 7, 12, 7, 0, 0.8],
    // tables
    ...TAB(5, 16), ...TAB(9, 12), ...TAB(13, 15), ...TAB(18, 13), ...TAB(23, 11), ...TAB(22, 17),
    ['interior_pelts', 'town_crates', 1, 17, 1, 17, WW, 1], ['interior_weapon_rack', 'town_fence', 28, 14, 28, 14, WE, 1], ['interior_shelf', 'town_crates', 28, 15, 28, 15, WE, 1],
    // the loft: three beds and a chest in the guest room; the dicing table, shelves and kegs in the back room
    ['interior_bed', 'town_crates', 2, 1, 2, 2, WN, 1], ['interior_bed', 'town_crates', 5, 1, 5, 2, WN, 1], ['interior_bed', 'town_crates', 8, 1, 8, 2, WN, 1],
    ['interior_chest', 'rimeshore_crate', 10, 1, 10, 1, 0, 1],
    ...TAB(16, 2), ['interior_shelf', 'town_crates', 22, 1, 22, 1, WN, 1], ['interior_shelf', 'town_crates', 23, 1, 23, 1, WN, 1],
    ['town_barrel', 'town_barrel', 27, 1, 27, 1, 0, 1], ['town_barrel', 'town_barrel', 28, 1, 28, 1, 1, 1],
  ],
  S: [
    ['interior_rug', null, 4.6, 12.9, 0, 1], ['interior_herbs', null, 13.5, 1.5, WN, 1], ['interior_herbs', null, 25.5, 1.5, WN, 1],
    ...BENCHES(5, 16), ...BENCHES(9, 12), ...BENCHES(13, 15), ...BENCHES(18, 13), ...BENCHES(23, 11), ...BENCHES(22, 17),
    ['interior_stool', null, 15.5, 3.4, 0, 1], ['interior_stool', null, 18.6, 2.5, 1, 1], ['interior_stool', null, 16.2, 1.6, 2, 1],
    ['interior_candle_stand', 'town_lamp_post', 1.6, 7.6, 0.8, 1, { light: LC() }], ['interior_candle_stand', 'town_lamp_post', 28.3, 7.7, 2.4, 1, { light: LC() }],
    ['interior_candle_stand', 'town_lamp_post', 28.3, 19.3, 3.9, 1, { light: LC() }], ['interior_candle_stand', 'town_lamp_post', 1.7, 19.3, 5.5, 1, { light: LC() }],
    ['interior_candle_stand', 'town_lamp_post', 4.5, 3.4, 0.2, 1, { light: LC(0.9, 4.5) }], ['interior_candle_stand', 'town_lamp_post', 20.5, 4.4, 1.2, 1, { light: LC(0.9, 4.5) }],
    ['interior_candle_stand', 'town_lamp_post', 11.4, 9.4, 0.3, 1, { light: LC() }], ['interior_candle_stand', 'town_lamp_post', 11.4, 18.6, 0.6, 1, { light: LC() }], ['interior_candle_stand', 'town_lamp_post', 20.6, 11.6, 0.6, 1, { light: LC() }],
    ['dng_banner', 'dng_banner', 6.5, 1.08, 0, 0.9],
  ],
  objs: [
    { kind: 'ibook', key: 'last_hearth_tally', x: 12.5, y: 7.5, name: 'The Tally-Board' },
    { kind: 'ichest', key: 'hearth_loft_chest', x: 10.5, y: 1.5, name: 'A Forgotten Pack' },
  ] });

// ---- Emberhold: Brokkr's forge-house ----
intRoom('emberhold_smithy', { name: 'Brokkr’s Forge-House', sub: 'Emberhold · Smithy', seed: 9102, style: 'stone',
  intro: 'Brokkr’s forge-house. Every hammer on the wall has a name burned into the handle, and none of the names are polite.',
  interior: { floor: 'stone', wall: 'timber', trim: 0x3a2418, windows: [[4, 0], [16, 0], [23, 12]] },
  rows: [
    '########################',
    '#................#.....#',
    '#................#.....#',
    '#................#.....#',
    '#................#.....#',
    '#......................#',
    '#................#.....#',
    '#................#.....#',
    '#................###.###',
    '#......................#',
    '#......................#',
    '#......................#',
    '#......................#',
    '#......................#',
    '#......................#',
    '#......................#',
    '#......................#',
    '############D###########'],
  F: [
    ['interior_forge', 'nidavellir_forge', 7, 1, 8, 2, WN, 1, { light: LF() }],
    ['interior_dwarf_anvil', null, 8, 4, 8, 4, 0, 1],
    ['town_barrel', 'town_barrel', 11, 1, 11, 1, 0, 1], ['town_barrel', 'town_barrel', 12, 1, 12, 1, 1.2, 1], ['town_barrel', 'town_barrel', 11, 2, 11, 2, 2.1, 1],
    ...TAB(13, 9), ['interior_dwarf_anvil', null, 16, 12, 16, 12, 0, 1], ['town_crates', 'town_crates', 3, 16, 4, 16, 0, 1],
    ['interior_shelf', 'town_crates', 14, 1, 14, 1, WN, 1], ['interior_shelf', 'town_crates', 15, 1, 15, 1, WN, 1],
    ['interior_weapon_rack', 'town_fence', 1, 6, 1, 6, WW, 1], ['interior_weapon_rack', 'town_fence', 1, 7, 1, 7, WW, 1], ['interior_weapon_rack', 'town_fence', 1, 10, 1, 10, WW, 1], ['interior_weapon_rack', 'town_fence', 1, 11, 1, 11, WW, 1],
    ...TAB(5, 12), ['interior_pelts', 'town_crates', 1, 14, 1, 14, WW, 1],
    ['town_crates', 'town_crates', 18, 1, 19, 1, 0, 1], ['town_crates', 'town_crates', 21, 1, 22, 1, 0, 1],
    ['town_barrel', 'town_barrel', 22, 3, 22, 3, 0, 1], ['town_barrel', 'town_barrel', 22, 4, 22, 4, 1, 1],
    ['interior_bed', 'town_crates', 18, 6, 19, 6, WW, 1], ['interior_chest', 'rimeshore_crate', 22, 7, 22, 7, 0, 1],
    ['town_crates', 'town_crates', 20, 15, 21, 15, 0, 1], ['town_barrel', 'town_barrel', 22, 14, 22, 14, 0.5, 1],
  ],
  S: [
    ['nidavellir_ore_pile', 'dng_rubble_b', 3.4, 1.8, 0.6, 0.8], ['nidavellir_ore_pile', 'dng_rubble_b', 19.6, 3.4, 0.2, 0.7], ['interior_herbs', null, 20.5, 1.5, WN, 1],
    ...BENCHES(5, 12), ['interior_stool', null, 13.5, 6.5, 0.3, 1], ['interior_bench', null, 14, 10.3, Math.PI, 1], ['interior_stool', null, 17.4, 12.6, 1, 1],
    ['nidavellir_ore_pile', 'dng_rubble_b', 9.6, 8.4, 1.4, 0.5], ['town_barrel', 'town_barrel', 2.4, 3.6, 0.3, 0.9],
    ['interior_candle_stand', 'town_lamp_post', 16.2, 11.5, 0.5, 1, { light: LC() }], ['interior_candle_stand', 'town_lamp_post', 1.7, 15.4, 1.7, 1, { light: LC() }],
    ['interior_candle_stand', 'town_lamp_post', 20.5, 4.5, 3.1, 1, { light: LC(0.9, 4.5) }],
    ['town_barrel', 'town_barrel', 10.4, 15.6, 0.3, 0.9], ['town_barrel', 'town_barrel', 13.7, 15.8, 1.3, 0.9], ['interior_rug', null, 11.5, 12.0, 0.1, 1],
    ['dng_banner', 'dng_banner', 3.5, 1.08, 0, 0.85],
  ],
  objs: [
    { kind: 'ibook', key: 'smithy_anvil', x: 8.5, y: 4.5, name: 'Brokkr’s Second Anvil' },
    { kind: 'ibook', key: 'brokkr_ledger', x: 5.5, y: 12.5, name: 'Brokkr’s Ledger' },
    { kind: 'ichest', key: 'smithy_rainy_day', x: 22.5, y: 7.5, name: 'Brokkr’s Rainy-Day Box' },
  ] });

// ---- Emberhold: the Ember Chapel (the world team's chapel plot in the south-east ward) ----
intRoom('emberhold_temple', { name: 'The Ember Chapel', sub: 'Emberhold · Chapel of the Waystone', seed: 9103, style: 'stone',
  intro: 'The Ember Chapel. At the far end a splinter of the Waystone stands behind the altar, and it is warmer than every candle around it.',
  interior: { floor: 'flag', wall: 'stone', trim: 0x5a544c, windows: [[6, 0], [15, 0], [0, 6], [0, 11], [21, 7], [21, 12]] },
  props: POSTS, amb: [['pollen', 0.18]],
  rows: [
    '######################',
    '#...............#....#',
    '#...............#....#',
    '#...............#....#',
    '#...I...........##.###',
    '#....................#',
    '#....................#',
    '#....................#',
    '#....................#',
    '#...I............I...#',
    '#....................#',
    '#....................#',
    '#....................#',
    '#....................#',
    '#...I............I...#',
    '#....................#',
    '#....................#',
    '##########D###########'],
  F: [
    ['waystone', 'waystone', 10, 1, 11, 1, 0, 0.5, { light: [0xffa048, 1.6, 7, 'lamp', 1.6] }],
    ['interior_altar', 'dng_grave_b', 10, 2, 11, 2, 0, 1, { light: LC(1.2, 6) }],
    ...[6, 8, 11, 13].flatMap(y => [['interior_bench', 'town_fence', 5, y, 6, y, 0, 1], ['interior_bench', 'town_fence', 7, y, 8, y, 0, 1], ['interior_bench', 'town_fence', 13, y, 14, y, 0, 1], ['interior_bench', 'town_fence', 15, y, 16, y, 0, 1]]),
    ['dng_grave_a', 'dng_grave_a', 1, 6, 1, 6, WW, 0.8], ['dng_grave_a', 'dng_grave_a', 1, 10, 1, 10, WW, 0.8], ['dng_grave_a', 'dng_grave_a', 1, 13, 1, 13, WW, 0.8],
    ['interior_shelf', 'rimeshore_crate', 14, 1, 14, 1, WN, 1],
    ['interior_chest', 'rimeshore_crate', 20, 1, 20, 1, 0, 1], ['interior_shelf', 'town_crates', 17, 1, 17, 1, WN, 1], ['interior_shelf', 'town_crates', 18, 1, 18, 1, WN, 1],
  ],
  S: [
    ['interior_candle_stand', 'town_lamp_post', 8.6, 2.4, 0, 1, { light: LC() }], ['interior_candle_stand', 'town_lamp_post', 13.4, 2.6, 1, 1, { light: LC() }],
    ['interior_candle_stand', 'town_lamp_post', 2.3, 7.4, 0.5, 1, { light: LC(0.8, 4) }], ['interior_candle_stand', 'town_lamp_post', 2.3, 11.4, 1.5, 1, { light: LC(0.8, 4) }],
    ['interior_candle_stand', 'town_lamp_post', 2.3, 14.6, 2.5, 1, { light: LC(0.8, 4) }], ['interior_candle_stand', 'town_lamp_post', 19.6, 2.6, 0, 1, { light: LC(0.8, 4) }],
    ['interior_candle_stand', 'town_lamp_post', 9.3, 9.6, 0, 1, { light: LC() }], ['interior_candle_stand', 'town_lamp_post', 12.7, 9.6, 1, 1, { light: LC() }], ['interior_herbs', null, 19.5, 1.5, WN, 1],
    ['dng_banner', 'dng_banner', 6.5, 1.08, 0, 0.9], ['dng_banner', 'dng_banner', 15.5, 1.08, 0, 0.9],
    ['interior_rug', null, 11.0, 7.0, 0, 1], ['interior_rug', null, 11.0, 12.0, 0, 1],
  ],
  objs: [
    { kind: 'ibook', key: 'way_hymn', x: 14.5, y: 1.5, name: 'The Hymn of the Last Waystone' },
    { kind: 'ichest', key: 'chapel_vestry', x: 20.5, y: 1.5, name: 'The Vestry Chest' },
  ] });

// ---- Emberhold: the weaver's house ----
intRoom('emberhold_house_a', { name: 'The Weaver’s House', sub: 'Emberhold · Gunnhild’s home', seed: 9104, style: 'plank',
  intro: 'A house that still smells of bread, somehow. There is a loom by the wall and a boy under the table.',
  interior: { floor: 'plank', wall: 'timber', windows: [[3, 0], [11, 0], [15, 7]] },
  rows: [
    '#######D########',
    '#..............#',
    '#..............#',
    '#..............#',
    '#..............#',
    '#..............#',
    '#..............#',
    '#..............#',
    '#..............#',
    '#..............#',
    '#..............#',
    '#..............#',
    '################'],
  F: [
    ['interior_hearth', 'dng_brazier', 11, 5, 12, 5, 0, 1, { light: LH(2.0, 8) }],
    ...TAB(5, 5),
    ['interior_loom', 'rimeshore_drying_rack', 2, 1, 2, 1, WN, 1], ['interior_loom', 'rimeshore_drying_rack', 3, 1, 3, 1, WN, 1],
    ['interior_shelf', 'town_crates', 10, 1, 10, 1, WN, 1], ['interior_shelf', 'town_crates', 11, 1, 11, 1, WN, 1], ['interior_shelf', 'town_crates', 1, 5, 1, 5, WW, 1],
    ['interior_bed', 'town_crates', 1, 10, 1, 11, WS, 1], ['interior_bed', 'town_crates', 3, 10, 3, 11, WS, 1], ['interior_bed', 'town_crates', 13, 10, 13, 11, WS, 1],
    ['interior_chest', 'rimeshore_crate', 14, 11, 14, 11, 0, 1], ['interior_pelts', 'town_crates', 14, 8, 14, 8, WE, 1],
  ],
  S: [
    ...BENCHES(5, 5), ['interior_stool', null, 9.6, 5.5, 1, 1], ['interior_rug', null, 7.5, 8.8, WW, 1],
    ['interior_herbs', null, 8.5, 1.5, WN, 1], ['interior_herbs', null, 14.5, 3.5, WE, 1],
    ['town_barrel', 'town_barrel', 14.3, 1.6, 0.3, 0.85], ['interior_candle_stand', 'town_lamp_post', 1.6, 7.6, 0, 1, { light: LC(0.9, 4.5) }],
    ['interior_candle_stand', 'town_lamp_post', 9.5, 11.4, 1, 1, { light: LC(0.8, 4) }],
  ],
  objs: [
    { kind: 'ibook', key: 'thorvald_winters', x: 1.5, y: 5.5, name: 'Thorvald’s Tally of Winters' },
    { kind: 'ichest', key: 'weaver_grandfather', x: 14.5, y: 11.5, name: 'Grandfather’s Chest' },
  ] });

// ---- Emberhold: the fletcher's cottage ----
intRoom('emberhold_house_b', { name: 'The Fletcher’s Cottage', sub: 'Emberhold · Hallvard’s home', seed: 9105, style: 'plank',
  intro: 'Feathers everywhere: in jars, in bundles, in the bread. Bows hang from the rafters like smoked fish.',
  interior: { floor: 'plank', wall: 'timber', windows: [[5, 0], [8, 0], [13, 5]] },
  rows: [
    '##############',
    '#............#',
    '#............#',
    '#............#',
    '#............#',
    '#............#',
    '#............#',
    '#............#',
    '#............#',
    '#............#',
    '#######D######'],
  F: [
    ['interior_weapon_rack', 'town_fence', 1, 2, 1, 2, WW, 1], ['interior_weapon_rack', 'town_fence', 1, 3, 1, 3, WW, 1], ['interior_weapon_rack', 'town_fence', 1, 4, 1, 4, WW, 1],
    ...TAB(3, 1),
    ['interior_bed', 'town_crates', 10, 1, 10, 2, WN, 1], ['interior_bed', 'town_crates', 11, 1, 11, 2, WN, 1], ['interior_chest', 'rimeshore_crate', 12, 1, 12, 1, 0, 1],
    ['interior_hearth', 'dng_brazier', 10, 5, 11, 5, 0, 1, { light: LH(1.8, 7) }],
    ...TAB(6, 5), ['interior_shelf', 'town_crates', 12, 7, 12, 7, WE, 1],
  ],
  S: [
    ['interior_bench', null, 4, 2.3, Math.PI, 1], ...BENCHES(6, 5),
    ['town_barrel', 'town_barrel', 1.6, 8.4, 0, 0.8], ['town_barrel', 'town_barrel', 2.5, 9.2, 1, 0.8], ['interior_herbs', null, 6.5, 1.5, WN, 1],
    ['interior_rug', null, 7.0, 8.2, WW, 0.8], ['interior_candle_stand', 'town_lamp_post', 1.6, 6.0, 0, 1, { light: LC(0.9, 4.5) }],
  ],
  objs: [
    { kind: 'ibook', key: 'fletcher_notes', x: 3.5, y: 1.5, name: 'Hallvard’s Notes' },
    { kind: 'ichest', key: 'fletcher_eaves', x: 12.5, y: 1.5, name: 'A Box in the Eaves' },
  ] });

// ---- Skaldhaven: the Salt Hall ----
intRoom('skaldhaven_salthall', { name: 'The Salt Hall', sub: 'Skaldhaven · Mead-Hall', seed: 9201, style: 'plank',
  intro: 'The Salt Hall. Two long tables, three fires down the middle, and at the far end the high seat, empty, between its carved pillars.',
  interior: { floor: 'plank', wall: 'hall', trim: 0x3a2412, windows: [[7, 0], [24, 0], [0, 6], [0, 14], [31, 6], [31, 14]] },
  props: POSTS, kitWalls: [[4, 0], [10, 0], [21, 0], [27, 0], [0, 3], [0, 10], [0, 17], [31, 3], [31, 10], [31, 17]].map(([x, y]) => ['interior_wall_hall', x, y]),
  rows: [
    '################################',
    '#..............................#',
    '#.............I..I.............#',
    '#....I.....I........I.....I....#',
    '#..............................#',
    '#..............................#',
    '#..............................#',
    '#..............................#',
    '#..............................#',
    '#..............................#',
    '#..............................#',
    '#..............................#',
    '#..............................#',
    '#..............................#',
    '#..............................#',
    '#..............................#',
    '#....I.....I........I.....I....#',
    '#..............................#',
    '#..............................#',
    '################D###############'],
  F: [
    ['interior_high_seat', null, 15, 1, 16, 1, WN, 1],
    ['interior_hearth', 'dng_brazier', 10, 9, 11, 9, 0, 1, { light: LH(2.2, 8) }], ['interior_hearth', 'dng_brazier', 15, 9, 16, 9, 0, 1, { light: LH(2.2, 8) }],
    ['interior_hearth', 'dng_brazier', 20, 9, 21, 9, 0, 1, { light: LH(2.2, 8) }],
    ...[7, 11, 17, 21].flatMap(x => [['interior_long_table', 'town_crates', x, 6, x + 3, 6, 0, 1], ['interior_long_table', 'town_crates', x, 12, x + 3, 12, 0, 1]]),
    ['town_barrel', 'town_barrel', 29, 4, 29, 4, 0, 1], ['town_barrel', 'town_barrel', 30, 4, 30, 4, 1, 1], ['town_barrel', 'town_barrel', 30, 5, 30, 5, 2, 1],
    ['town_barrel', 'town_barrel', 30, 7, 30, 7, 0.5, 1], ['rimeshore_crate', 'town_crates', 29, 13, 30, 13, 0, 0.9],
    ['town_bounty_board', 'town_bounty_board', 1, 9, 1, 10, WW, 0.85],
    ['interior_pelts', 'town_crates', 1, 5, 1, 5, WW, 1], ['interior_pelts', 'town_crates', 1, 6, 1, 6, WW, 1],
    ['interior_weapon_rack', 'town_fence', 1, 13, 1, 13, WW, 1], ['interior_weapon_rack', 'town_fence', 1, 14, 1, 14, WW, 1],
    ['interior_chest', 'rimeshore_crate', 30, 1, 30, 1, 0, 1], ['interior_shelf', 'town_crates', 30, 10, 30, 10, WE, 1],
  ],
  S: [
    ...[7, 11, 17, 21].flatMap(x => [6, 12].flatMap(y => [['interior_bench', null, x + 1, y - 0.3, 0, 1], ['interior_bench', null, x + 3, y - 0.3, 0, 1], ['interior_bench', null, x + 1, y + 1.3, Math.PI, 1], ['interior_bench', null, x + 3, y + 1.3, Math.PI, 1]])),
    ['dng_banner', 'dng_banner', 12.5, 1.08, 0, 1], ['dng_banner', 'dng_banner', 19.5, 1.08, 0, 1], ['dng_banner', 'dng_banner', 4.5, 1.08, 0, 0.9], ['dng_banner', 'dng_banner', 27.5, 1.08, 0, 0.9],
    ['interior_candle_stand', 'town_lamp_post', 13.2, 1.6, 0, 1, { light: LC() }], ['interior_candle_stand', 'town_lamp_post', 18.8, 1.6, 1, 1, { light: LC() }],
    ['interior_candle_stand', 'town_lamp_post', 1.7, 17.4, 2, 1, { light: LC() }], ['interior_candle_stand', 'town_lamp_post', 30.3, 17.4, 3, 1, { light: LC() }],
    ['interior_chandelier', null, 13.0, 6.5, 0, 1, { light: LCH(1.1, 7) }], ['interior_chandelier', null, 19.0, 12.5, 0, 1, { light: LCH(1.1, 7) }],
    ['interior_herbs', null, 25.5, 1.5, WN, 1], ['rimeshore_barrel', 'town_barrel', 28.4, 17.4, 0.3, 0.9], ['rimeshore_crate', 'town_crates', 3.2, 17.6, 1.2, 0.8],
    ['interior_rug', null, 15.9, 4.6, WW, 1],
  ],
  objs: [
    { kind: 'ibook', key: 'salt_saga', x: 1.5, y: 10, name: 'The Saga-Board' },
    { kind: 'ichest', key: 'salt_high_seat', x: 30.5, y: 1.5, name: 'The Jarl’s Chest' },
  ] });

// ---- Skaldhaven: the Netmakers' longhouse ----
intRoom('skaldhaven_longhouse', { name: 'The Netmakers’ Longhouse', sub: 'Skaldhaven · Longhouse', seed: 9202, style: 'straw',
  intro: 'The Netmakers’ longhouse: one long room, one long fire, and three generations of one family pretending not to listen to each other.',
  interior: { floor: 'straw', wall: 'timber', trim: 0x3a2a1c, windows: [[5, 0], [20, 0]] },
  props: POSTS,
  rows: [
    '##########################',
    '#........................#',
    '#........................#',
    '#........................#',
    '#.....I............I.....#',
    '#........................#',
    '#........................#',
    '#........................#',
    '#........................#',
    '#.....I............I.....#',
    '#........................#',
    '#........................#',
    '#........................#',
    '#############D############'],
  F: [
    ['interior_hearth', 'dng_brazier', 11, 6, 12, 6, 0, 1, { light: LH(2.2, 8) }], ['interior_hearth', 'dng_brazier', 13, 6, 14, 6, 0, 1, { light: LH(2.0, 8) }],
    ['interior_bed', 'town_crates', 2, 1, 2, 2, WN, 1], ['interior_bed', 'town_crates', 3, 1, 3, 2, WN, 1], ['interior_bed', 'town_crates', 8, 1, 8, 2, WN, 1],
    ['interior_bed', 'town_crates', 9, 1, 9, 2, WN, 1], ['interior_bed', 'town_crates', 15, 1, 15, 2, WN, 1], ['interior_bed', 'town_crates', 16, 1, 16, 2, WN, 1],
    ['interior_loom', 'rimeshore_drying_rack', 1, 6, 1, 6, WW, 1], ['interior_loom', 'rimeshore_drying_rack', 1, 7, 1, 7, WW, 1],
    ['rimeshore_drying_rack', 'town_fence', 22, 4, 23, 4, 0, 1], ['rimeshore_drying_rack', 'town_fence', 22, 8, 23, 8, 0, 1],
    ['interior_altar', 'dng_grave_b', 23, 1, 24, 1, 0, 0.8, { light: [0x9ac8ff, 0.8, 4, 'candle', 1.2] }],
    ['interior_chest', 'rimeshore_crate', 1, 11, 1, 11, 0, 1], ...TAB(5, 11),
    ['rimeshore_barrel', 'town_barrel', 24, 11, 24, 11, 0, 1], ['rimeshore_crate', 'town_crates', 23, 12, 24, 12, 0, 0.9], ['interior_pelts', 'town_crates', 24, 6, 24, 6, WE, 1],
    ['interior_shelf', 'town_crates', 12, 1, 12, 1, WN, 1],
  ],
  S: [
    ['interior_herbs', null, 5.5, 1.5, WN, 1], ['interior_herbs', null, 19.5, 1.5, WN, 1], ['interior_rug', null, 12.9, 9.8, WW, 1],
    ['interior_bench', null, 6, 10.7, 0, 1], ['interior_stool', null, 8.0, 11.5, 0, 1], ['interior_stool', null, 11.5, 7.8, 1, 1], ['interior_stool', null, 14.6, 7.8, 2, 1],
    ['interior_candle_stand', 'town_lamp_post', 21.3, 1.6, 0, 1, { light: LC(0.9, 4.5) }], ['interior_candle_stand', 'town_lamp_post', 1.7, 9.2, 1, 1, { light: LC(0.9, 4.5) }],
  ],
  objs: [
    { kind: 'ibook', key: 'njord_tablet', x: 24.5, y: 1.5, name: 'Njörðr’s Tablet' },
    { kind: 'ichest', key: 'netmaker_platform', x: 1.5, y: 11.5, name: 'Under the Sleeping-Bench' },
  ] });

// ---- Skaldhaven: the Sea-Snake's hold ----
intRoom('skaldhaven_hold', { name: 'The Sea-Snake’s Hold', sub: 'Skaldhaven · Below deck', seed: 9203, style: 'plank',
  intro: 'Below deck. The Sea-Snake creaks around you like an old man getting up, and the ice outside answers.',
  interior: { floor: 'plank', wall: 'timber', trim: 0x2e2016, beams: true },
  props: POSTS, amb: [['pollen', 0.06]], outLabel: 'Skaldhaven (the pier)',
  rows: [
    '############################',
    '#############D##############',
    '########............########',
    '#####..................#####',
    '###......................###',
    '##........................##',
    '##........................##',
    '###......................###',
    '#####..................#####',
    '########............########',
    '############################',
    '############################'],
  F: [
    ['interior_post', 'dng_pillar', 13, 5, 14, 6, 0, 1.5],
    ['town_crates', 'town_crates', 4, 5, 5, 5, 0, 0.9], ['town_barrel', 'town_barrel', 4, 6, 4, 6, 0, 0.95], ['town_barrel', 'town_barrel', 6, 7, 6, 7, 1, 0.95],
    ['town_crates', 'town_crates', 8, 8, 9, 8, 0, 0.9], ['town_crates', 'town_crates', 17, 8, 18, 8, 0, 0.9], ['town_barrel', 'town_barrel', 16, 8, 16, 8, 2, 0.95],
    ['town_crates', 'town_crates', 21, 4, 22, 4, 0, 0.9], ['town_barrel', 'town_barrel', 23, 5, 23, 5, 0.4, 0.95], ['town_crates', 'town_crates', 22, 7, 23, 7, 0, 0.85],
    ['interior_hearth', 'dng_brazier', 17, 3, 18, 3, 0, 0.8, { light: LH(1.6, 6) }],
    ['interior_chest', 'rimeshore_crate', 2, 5, 2, 5, 0, 1],
  ],
  S: [
    ['interior_pelts', null, 9.5, 3.5, WN, 1], ['interior_pelts', null, 19.5, 7.6, WS, 1], ['interior_stool', null, 16.4, 4.4, 0, 1], ['interior_stool', null, 19.3, 4.5, 1, 1],
    ['interior_candle_stand', 'mirewell_lantern_post', 11.5, 2.4, 0, 1, { light: LC(1.0, 5) }], ['interior_candle_stand', 'mirewell_lantern_post', 15.5, 8.6, 1, 1, { light: LC(1.0, 5) }],
    ['interior_candle_stand', 'mirewell_lantern_post', 3.5, 6.5, 2, 1, { light: LC(0.8, 4) }],
    ['town_crates', 'town_crates', 12.3, 8.6, 0.5, 0.6],
  ],
  objs: [
    { kind: 'ibook', key: 'sea_snake_log', x: 12.3, y: 8.6, name: 'The Sea-Snake’s Log' },
    { kind: 'ichest', key: 'hold_bilge', x: 2.5, y: 5.5, name: 'A Box in the Bilge' },
  ] });

// ---- Nidavellir: the Anvil-Hall of Durinn ----
intRoom('nidavellir_forgehall', { name: 'The Anvil-Hall of Durinn', sub: 'Nidavellir Deep · Forge Hall', seed: 9301, style: 'dwarf',
  intro: 'The Anvil-Hall of Durinn. The dwarves built it for work that the great forge outside was too small for. Lava runs through it in a stone trough like a road.',
  interior: { floor: 'stone', wall: 'dwarf', trim: 0xc89a3a },
  amb: [['embers', 0.5]], kitWalls: [[14, 0], [15, 0], [18, 0], [19, 0], [0, 11], [0, 16], [33, 11], [33, 16], [6, 0], [27, 0]].map(([x, y]) => ['interior_gear_wall', x, y]),
  props: { pillar: propList([['nidavellir_pillar', 1, 'dng_pillar']]), crystal: propList([['nidavellir_crystal_a', 1, 'throne_obsidian_pillar']]) },
  rows: [
    '##################################',
    '#................................#',
    '#................................#',
    '#....I......I........I......I....#',
    '#................................#',
    '#................................#',
    '#~~~~~~~~~~~~~~====~~~~~~~~~~~~~~#',
    '#................................#',
    '#................................#',
    '#................................#',
    '#................................#',
    '#................................#',
    '#................................#',
    '#................................#',
    '#................................#',
    '#................................#',
    '#................................#',
    '#................................#',
    '#................................#',
    '#................................#',
    '#....I......I........I......I....#',
    '#................................#',
    '#................................#',
    '#################D################'],
  F: [
    // north of the channel: the Great Anvil of Durinn between the high forges and the broken kings
    ['interior_dwarf_anvil', 'nidavellir_statue_broken', 16, 1, 17, 2, 0, 1.8, { light: [0xffc860, 1.2, 6, 'forge', 1.1] }],
    ['interior_forge', 'nidavellir_forge', 3, 1, 4, 2, WN, 1, { light: LF() }], ['interior_forge', 'nidavellir_forge', 29, 1, 30, 2, WN, 1, { light: LF() }],
    ['nidavellir_statue_broken', 'ruin_column_fallen', 8, 1, 9, 1, 0.2, 0.8], ['nidavellir_statue_broken', 'ruin_column_fallen', 24, 1, 25, 1, -0.3, 0.8],
    ['interior_chest', 'rimeshore_crate', 32, 1, 32, 1, 0, 1],
    // the working floor
    ['nidavellir_forge', 'dng_brazier', 4, 10, 5, 11, 0, 1, { light: LF() }], ['nidavellir_forge', 'dng_brazier', 28, 10, 29, 11, 0, 1, { light: LF() }],
    ['interior_dwarf_anvil', null, 8, 12, 8, 12, 0, 1], ['interior_dwarf_anvil', null, 25, 12, 25, 12, 0, 1],
    ['interior_lava_trough', 'nidavellir_lava_edge', 11, 9, 11, 9, 0, 1, { light: [0xff6a1a, 1.2, 4, 'fire', 0.4] }], ['interior_lava_trough', 'nidavellir_lava_edge', 12, 9, 12, 9, 0, 1],
    ['interior_lava_trough', 'nidavellir_lava_edge', 21, 9, 21, 9, 0, 1, { light: [0xff6a1a, 1.2, 4, 'fire', 0.4] }], ['interior_lava_trough', 'nidavellir_lava_edge', 22, 9, 22, 9, 0, 1],
    ['dng_grave_b', 'dng_grave_b', 16, 14, 17, 15, 0, 1.6, { light: [0x9ac8ff, 0.9, 4.5, 'lamp', 1.4] }],
    ['nidavellir_mine_cart', 'town_crates', 6, 18, 6, 18, 1.57, 1], ['town_crates', 'town_crates', 26, 16, 27, 16, 0, 1], ['town_barrel', 'town_barrel', 9, 7, 9, 7, 0, 1], ['town_barrel', 'town_barrel', 24, 7, 24, 7, 1, 1],
    ['nidavellir_ore_pile', 'dng_rubble_a', 2, 17, 3, 18, 0, 1.1], ['nidavellir_ore_pile', 'dng_rubble_a', 30, 17, 31, 18, 1, 1.1],
    ['interior_weapon_rack', 'town_fence', 1, 13, 1, 13, WW, 1], ['interior_weapon_rack', 'town_fence', 1, 14, 1, 14, WW, 1],
    ['interior_weapon_rack', 'town_fence', 32, 13, 32, 13, WE, 1], ['interior_weapon_rack', 'town_fence', 32, 14, 32, 14, WE, 1],
    ...TAB(12, 17), ['interior_shelf', 'town_crates', 1, 9, 1, 9, WW, 1], ['interior_shelf', 'town_crates', 32, 9, 32, 9, WE, 1],
  ],
  S: [
    ['nidavellir_mine_cart', 'town_crates', 17.5, 19.6, 0, 1], ['nidavellir_crystal_b', null, 2.6, 21.4, 0.4, 0.7, { light: [0xb07aff, 0.9, 4, 'lamp', 0.8] }],
    ['nidavellir_crystal_b', null, 31.4, 21.4, 1.4, 0.7, { light: [0xb07aff, 0.9, 4, 'lamp', 0.8] }], ['nidavellir_crystal_b', null, 1.6, 4.5, 2.4, 0.6, { light: [0xb07aff, 0.8, 3.5, 'lamp', 0.8] }],
    ['nidavellir_crystal_b', null, 32.4, 4.5, 0.4, 0.6, { light: [0xb07aff, 0.8, 3.5, 'lamp', 0.8] }],
    ['nidavellir_ore_pile', 'dng_rubble_b', 10.4, 15.6, 2, 0.6], ['nidavellir_ore_pile', 'dng_rubble_b', 23.4, 16.6, 0.5, 0.6], ...BENCHES(12, 17),
    ['nidavellir_ore_pile', 'dng_rubble_b', 7.4, 9.4, 1, 0.5], ['nidavellir_ore_pile', 'dng_rubble_b', 26.6, 9.4, 2, 0.5], ['interior_stool', null, 9.6, 12.8, 0, 1], ['interior_stool', null, 24.4, 12.8, 1, 1],
    ['dng_banner', 'dng_banner', 12.5, 1.08, 0, 1], ['dng_banner', 'dng_banner', 21.5, 1.08, 0, 1],
  ],
  braziers: [[1.8, 7.8], [32.2, 7.8], [1.8, 21.6], [32.2, 21.6]],
  objs: [
    { kind: 'ibook', key: 'forge_anvil_tally', x: 8.5, y: 12.5, name: 'A Dwarf-Anvil' },
    { kind: 'ibook', key: 'forge_anvil_sindri', x: 25.5, y: 12.5, name: 'A Cold Anvil' },
    { kind: 'ibook', key: 'anvil_song', x: 16.5, y: 2.5, name: 'The Great Anvil of Durinn' },
    { kind: 'ichest', key: 'forge_beyond_lava', x: 32.5, y: 1.5, name: 'A Chest Beyond the Lava' },
  ],
  extra(m, K, L) {
    // the lava channel: a raised dwarf trough on every lava tile (tileable along x), a glow every third tile
    for (let y = 1; y < m.h - 1; y++) for (let x = 1; x < m.w - 1; x++) {
      if (L.at(x, y) !== T.LAVA) continue;
      L.decor('interior_lava_trough', 'nidavellir_lava_edge', x + 0.5, y + 0.5, 0, 1, { light: false });
      if (x % 3 === 0) m.lights.push({ x: x + 0.5, y: y + 0.5, col: 0xff6a1a, r: 4.5, i: 1.3, kind: 'fire', h: 0.4, flame: false });
    }
    // rails from the door to the working floor
    for (let y = 16; y <= 22; y++) { L.surf(17, y, SURF.RAIL); L.decor('nidavellir_rail', null, 17.5, y + 0.5, 0, 1, { on: 'open', light: false }); }
  } });

// ---- Helheim: Hlín's tent ----
intRoom('helheim_tent', { name: 'Hlín’s Tent', sub: 'Helheim · The camp', seed: 9401, style: 'straw',
  intro: 'Hlín’s tent. Inside it is warmer than it has any right to be, and it smells of wool and cold iron.',
  interior: { floor: 'straw', wall: 'timber', trim: 0x2a2420, beams: true },
  amb: [['souls', 0.15]], outLabel: 'Helheim (the camp)',
  rows: [
    '##############',
    '####......####',
    '##..........##',
    '#............#',
    '#............#',
    '#............D',
    '#............#',
    '#............#',
    '##..........##',
    '####......####',
    '##############'],
  F: [
    ['interior_bed', 'town_crates', 5, 1, 5, 2, WN, 1], ['interior_loom', 'rimeshore_drying_rack', 8, 1, 8, 1, WN, 1], ['interior_shelf', 'rimeshore_crate', 9, 1, 9, 1, WN, 1],
    ...TAB(6, 5), ['interior_chest', 'rimeshore_crate', 1, 7, 1, 7, 0, 1],
    ['interior_shelf', 'rimeshore_crate', 10, 8, 10, 8, WS, 1], ['interior_pelts', 'town_crates', 1, 4, 1, 4, WW, 1],
  ],
  S: [
    ['helheim_brazier', 'dng_brazier', 3.5, 3.6, 0, 0.8, { light: [0x7affb4, 1.3, 6, 'brazier', 0.9] }], ['helheim_soul_lantern', null, 11.0, 3.2, 0, 0.8, { light: [0x7affb4, 0.9, 4.5, 'lantern', 1.3] }],
    ['interior_stool', null, 6.4, 6.8, 0, 1], ['interior_stool', null, 8.6, 5.4, 1, 1], ['interior_rug', null, 6.6, 7.8, WW, 1], ['interior_herbs', null, 6.5, 1.5, WN, 1],
    ['helheim_banner', 'dng_banner', 7.0, 1.08, 0, 0.8],
  ],
  objs: [
    { kind: 'ibook', key: 'frigg_spindle', x: 10.5, y: 8.5, name: 'Frigg’s Spindle' },
    { kind: 'ichest', key: 'hlin_chest', x: 1.5, y: 7.5, name: 'Hlín’s Travelling Chest' },
  ] });

// ---- Gloamheim: the crypt ----
variant('crypt_castellan', 'rust_knight', { name: 'The Hollow Castellan', title: 'Keeper of the Keep’s Dead', lvl: 33, hp: 16000, atk: [150, 190], def: 30, mdef: 20, elite: true, aggro: true, sight: 8,
  tint: '#9fb4ff', scaleMul: 1.35, expMul: 5, useAbil: true, abil: [{ id: 'slam', cd: 7, r: 2.6, mul: 1.6, delay: 1.1 }, { id: 'summon', cd: 16, mob: 'skeleton_soldier', n: 2, max: 3 }],
  drops: [['bone_charm', 0.6], ['rusted_chain', 0.8], ['white_potion', 0.4], ['yellow_potion', 0.6]] });
intRoom('gloamheim_crypt', { name: 'The Crypt of Gloamheim', sub: 'Gloamheim Keep · Crypt', lv: [24, 34], seed: 9501, style: 'crypt', dark: 0.86,
  intro: 'The crypt under the keep. Somebody has kept the lamps lit down here for a very long time. Somebody is still keeping them lit.',
  interior: { floor: 'stone', wall: 'stone', trim: 0x4a4650 },
  amb: [['souls', 0.25]], outLabel: 'Gloamheim Keep',
  spawns: [['skeleton_soldier', 4], ['wraith', 2], ['grave_archer', 1]],
  elites: [{ key: 'crypt_castellan', x: 4.5, y: 9.5, respawn: 1800 }],
  rows: [
    '##########################',
    '#+.+.+.+.+#####+.+.+.+.+##',
    '#.........#####.........##',
    '#.........#####.........##',
    '#........................#',
    '#........................#',
    '#......I....I....I.......#',
    '#........................#',
    '#........................#',
    '#........................D',
    '#........................#',
    '#........................#',
    '#......I....I....I.......#',
    '#........................#',
    '#........................#',
    '#.........#####.........##',
    '#.........#####.........##',
    '#+.+.+.+.+#####+.+.+.+.+##',
    '##########################',
    '##########################'],
  F: [
    ['dng_grave_b', 'dng_grave_b', 9, 9, 10, 10, 0, 1.1], ['dng_grave_b', 'dng_grave_b', 14, 9, 15, 10, 0, 1.1],
    ['dng_grave_b', 'dng_grave_b', 1, 8, 2, 11, WW, 1.3],
    ['interior_chest', 'rimeshore_crate', 1, 16, 1, 16, 0, 1], ['interior_bookshelf', 'rimeshore_crate', 23, 15, 23, 15, WE, 1],
  ],
  S: [
    ...[[4, 2.4], [7, 5.4], [11, 3.6], [19, 6.4], [5, 13.4], [9, 14.6], [16, 12.6], [21, 15.6], [3, 7.2]].map(([x, y], i) => ['dng_bones', null, x + 0.5, y, i * 0.9, 0.9]),
    ['dng_chain', 'dng_chain', 6.5, 4.5, 0, 1], ['dng_chain', 'dng_chain', 18.5, 4.5, 0, 1], ['dng_rubble_b', null, 22.5, 12.6, 0.3, 0.7], ['dng_rubble_a', null, 3.6, 15.4, 1.2, 0.7],
    ['interior_candle_stand', 'town_lamp_post', 23.3, 6.4, 0, 1, { light: LC(0.9, 4.5) }],
  ],
  braziers: [[3.5, 4.5], [22.8, 4.5], [3.5, 14.5], [22.8, 14.5], [8.5, 9.8], [16.5, 9.8]],
  // Hallr's lamps over the niches: cold soul-oil light (the braziers are lit by the renderer's brazier lights)
  lights: [[5.5, 2.2, 0x9ab8ff, 4.5, 0.9, 'lamp', 1.6], [19.5, 2.2, 0x9ab8ff, 4.5, 0.9, 'lamp', 1.6], [5.5, 15.8, 0x9ab8ff, 4.5, 0.9, 'lamp', 1.6], [19.5, 15.8, 0x9ab8ff, 4.5, 0.9, 'lamp', 1.6], [3.4, 9.5, 0x9ab8ff, 5, 1.1, 'lamp', 1.6]],
  objs: [
    { kind: 'ibook', key: 'gravewarden_roll', x: 23.5, y: 15.5, name: 'The Gravewarden’s Roll' },
    { kind: 'ichest', key: 'crypt_niche', x: 1.5, y: 16.5, name: 'A Niche Without a Name' },
  ] });

// ---- Gloamheim: the library ----
intRoom('gloamheim_library', { name: 'Sir Gaunt’s Library', sub: 'Gloamheim Keep · Library', seed: 9502, style: 'stone', dark: 0.8,
  intro: 'Sir Gaunt’s library. The books are all still here. The dust on them has footprints in it, small ones, like a bird’s.',
  interior: { floor: 'flag', wall: 'stone', trim: 0x4a4650, windows: [[6, 0], [17, 0]] },
  amb: [['pollen', 0.1]], outLabel: 'Gloamheim Keep',
  rows: [
    '########################',
    '#......................#',
    '#......................#',
    '#......................#',
    '#......................#',
    '#......................#',
    '#......................#',
    '#......................#',
    '#......................D',
    '#......................#',
    '#......................#',
    '#......................#',
    '#......................#',
    '#......................#',
    '#......................#',
    '#......................#',
    '#......................#',
    '########################'],
  F: [
    ...[3, 6, 11, 14].flatMap(y => [2, 3, 4, 5, 6, 7].map(x => ['interior_bookshelf', 'dng_wall', x, y, x, y, WN, 1, { sy: 0.7 }])),
    ...[12, 13, 14, 15].map(x => ['interior_bookshelf', 'dng_wall', x, 1, x, 1, WN, 1, { sy: 0.7 }]), ...[5, 6, 12, 13].map(y => ['interior_bookshelf', 'dng_wall', 22, y, 22, y, WE, 1, { sy: 0.7 }]),
    ...TAB(11, 7), ...TAB(15, 11), ...TAB(17, 4), ...TAB(19, 14),
    ['interior_chest', 'rimeshore_crate', 1, 16, 1, 16, 0, 1],
  ],
  S: [
    ['interior_candle_stand', 'town_lamp_post', 10.4, 6.6, 0, 1, { light: LC() }], ['interior_candle_stand', 'town_lamp_post', 14.6, 10.6, 1, 1, { light: LC() }],
    ['interior_candle_stand', 'town_lamp_post', 19.6, 3.4, 2, 1, { light: LC() }], ['interior_candle_stand', 'town_lamp_post', 21.4, 15.4, 3, 1, { light: LC(0.9, 4.5) }],
    ['interior_candle_stand', 'town_lamp_post', 8.5, 16.3, 4, 1, { light: LC(0.9, 4.5) }], ['interior_candle_stand', 'town_lamp_post', 9.4, 9.6, 5, 1, { light: LC(0.9, 5) }],
    ['interior_stool', null, 12.0, 8.4, 0, 1], ['interior_stool', null, 16.0, 12.4, 1, 1], ['interior_stool', null, 20.0, 15.4, 2, 1], ['interior_rug', null, 15.5, 8.2, WW, 1],
    ['dng_banner', 'dng_banner', 10.5, 1.08, 0, 0.9], ['dng_banner', 'dng_banner', 20.5, 1.08, 0, 0.9], ['dng_rubble_b', null, 9.2, 13.5, 1, 0.5],
  ],
  objs: [
    { kind: 'ibook', key: 'gaunt_oath_book', x: 20.5, y: 14.5, name: 'Sir Gaunt’s Oath-Book' },
    { kind: 'ichest', key: 'library_sliding_shelf', x: 1.5, y: 16.5, name: 'The Shelf That Slides' },
  ] });

/* ---------- Round 10: the rooms behind the new town plots ----------
   Fourteen small rooms (one or two rooms each) behind the world team's plots in Emberhold's Smiths' Row, chapel yard
   and Farm Ward, and Skaldhaven's Netmakers' Row. Their doors are read from m.houses at layout time (INT_DOORS[id].plot),
   and each blueprint's 'D' sits on the wall that faces the street, so you leave the way you came in. */
const IR_BAR = (x, y, r, kit) => [kit || 'town_barrel', 'town_barrel', x, y, x, y, r || 0, 1];
const IR_RACK = (x0, y0, x1, y1, r) => ['rimeshore_drying_rack', 'town_fence', x0, y0, x1, y1, r || 0, 1];
const IR_HAY = (x0, y0, x1, y1, sc) => ['field_haystack', 'town_crates', x0, y0, x1, y1, 0, sc || 1];
const IR_CAND = (x, y, l) => ['interior_candle_stand', 'town_lamp_post', x, y, (x * 1.7) % 6.28, 1, { light: l || LC() }];
const IR_TUFT = (x, y, sc) => ['field_haystack', null, x, y, (x + y) % 6.28, sc || 0.5];   // loose hay: drawn once the field kit lands

// ---- Emberhold, the Smiths' Row: Hrefna's nail-forge ----
intRoom('emberhold_row_a', { name: 'Hrefna’s Nail-Forge', sub: 'Emberhold · The Smiths’ Row', seed: 9301, style: 'stone',
  intro: 'Hrefna’s nail-forge. A thousand nails in a thousand barrels, and every one of them struck by hand. The air tastes of iron.',
  interior: { floor: 'stone', wall: 'timber', trim: 0x3a2418, windows: [[6, 0], [14, 0], [0, 3], [17, 9]] }, amb: [['embers', 0.18]],
  rows: [
    '##################',
    '#..........#.....#',
    '#..........#.....#',
    '#..........#.....#',
    '#..........#.....#',
    '#................#',
    '#..........#.....#',
    '#..........###.###',
    '#................#',
    '#................#',
    '#................#',
    '#####D############'],
  F: [
    ['interior_forge', 'nidavellir_forge', 2, 1, 3, 2, WN, 1, { light: LF() }], ['interior_dwarf_anvil', null, 3, 4, 3, 4, 0, 1], ['interior_dwarf_anvil', null, 7, 5, 7, 5, 0.3, 0.85],
    IR_BAR(5, 1), IR_BAR(9, 1, 0.6), IR_BAR(10, 1, 1.4), IR_BAR(10, 2, 2.2),
    ['interior_shelf', 'town_crates', 7, 1, 7, 1, WN, 1], ['interior_shelf', 'town_crates', 8, 1, 8, 1, WN, 1], ...TAB(8, 3),
    ['interior_weapon_rack', 'town_fence', 1, 5, 1, 5, WW, 1], ['interior_weapon_rack', 'town_fence', 1, 6, 1, 6, WW, 1],
    ...TAB(9, 9), ['town_crates', 'town_crates', 15, 10, 16, 10, 0, 1], ['town_crates', 'town_crates', 12, 8, 13, 8, 0, 0.9], IR_BAR(1, 10), IR_BAR(1, 9, 1),
    // Hrefna's own room at the back
    ['interior_bed', 'town_crates', 16, 1, 16, 2, WN, 1], ['interior_chest', 'rimeshore_crate', 12, 1, 12, 1, 0, 1], ['interior_shelf', 'town_crates', 14, 1, 14, 1, WN, 1],
    ['interior_pelts', 'town_crates', 16, 5, 16, 5, WE, 1], ...TAB(13, 3),
  ],
  S: [
    ['nidavellir_ore_pile', 'dng_rubble_b', 5.6, 2.6, 0.4, 0.55], ['interior_stool', null, 4.4, 3.3, 0.3, 1], ['interior_stool', null, 13.6, 2.3, 1, 1],
    ...BENCHES(9, 9), ['interior_rug', null, 14.2, 5.3, WW, 0.8], ['interior_herbs', null, 15.5, 1.5, WN, 1],
    IR_CAND(1.6, 8.4), IR_CAND(16.4, 8.4), IR_CAND(12.6, 6.4, LC(0.8, 4)), IR_CAND(6.4, 6.6), ['town_barrel', 'town_barrel', 8.6, 7.6, 0.8, 0.7],
    ['dng_banner', 'dng_banner', 4.5, 1.08, 0, 0.8],
  ],
  objs: [
    { kind: 'ibook', key: 'hrefna_tally', x: 14.5, y: 1.5, name: 'The Nail-Tally' },
    { kind: 'ichest', key: 'hrefna_keg', x: 12.5, y: 1.5, name: 'A Keg of Bent Nails' },
  ] });

// ---- Emberhold, the Smiths' Row: Grani's lamp-shop ----
intRoom('emberhold_row_b', { name: 'Grani’s Lamp-Shop', sub: 'Emberhold · The Smiths’ Row', seed: 9302, style: 'plank',
  intro: 'Grani’s lamp-shop. Horn lanterns, iron lanterns, lamps with no oil in them yet, hanging from every beam like a harvest of small suns.',
  interior: { floor: 'plank', wall: 'timber', trim: 0x4a2c16, windows: [[3, 0], [10, 0], [17, 8], [17, 2]] },
  rows: [
    '##################',
    '#.....#..........#',
    '#.....#..........#',
    '#.....#..........#',
    '#.....#..........#',
    '#.....#..........#',
    '#................#',
    '#######..........#',
    '#................#',
    '#................#',
    '#................#',
    '############D#####'],
  F: [
    ['interior_hearth', 'dng_brazier', 16, 4, 16, 5, WE, 1, { light: LH(2.0, 7) }], ['interior_long_table', 'town_crates', 9, 3, 12, 3, 0, 1], ...TAB(9, 7),
    ['interior_shelf', 'town_crates', 8, 1, 8, 1, WN, 1], ['interior_shelf', 'town_crates', 9, 1, 9, 1, WN, 1], ['interior_bookshelf', 'rimeshore_crate', 11, 1, 11, 1, WN, 1, { sy: 0.7 }],
    ['interior_shelf', 'town_crates', 13, 1, 13, 1, WN, 1], ['interior_shelf', 'town_crates', 14, 1, 14, 1, WN, 1],
    IR_BAR(16, 8, 0, 'rimeshore_barrel'), IR_BAR(16, 9, 1.3, 'rimeshore_barrel'), IR_BAR(16, 10, 2.1, 'rimeshore_barrel'),
    ['town_crates', 'town_crates', 1, 10, 2, 10, 0, 1], IR_BAR(1, 8), IR_BAR(4, 10, 1),
    // Dalla's room: a bed, her wick-loom, a table
    ['interior_bed', 'town_crates', 1, 1, 1, 2, WN, 1], ['interior_chest', 'rimeshore_crate', 5, 1, 5, 1, 0, 1], ['interior_loom', 'rimeshore_drying_rack', 3, 1, 3, 1, WN, 1],
    ['interior_shelf', 'town_crates', 1, 4, 1, 4, WW, 1], ...TAB(3, 4),
  ],
  S: [
    ['interior_chandelier', null, 11.0, 5.5, 0, 1, { light: LCH(1.1, 7) }], IR_CAND(7.6, 1.6), IR_CAND(15.4, 1.6), IR_CAND(8.5, 9.5), IR_CAND(15.5, 7.5, LC(0.9, 4.5)), IR_CAND(1.6, 5.6, LC(0.8, 4)),
    ['interior_stool', null, 9.5, 4.4, 0.2, 1], ['interior_stool', null, 11.5, 4.4, 1.1, 1], ['interior_stool', null, 10.5, 2.4, 2, 1], ...BENCHES(9, 7),
    ['interior_rug', null, 2.8, 5.6, 0, 0.7], ['interior_herbs', null, 5.5, 3.5, WE, 1], ['town_crates', 'town_crates', 14.5, 9.6, 0.3, 0.6],
  ],
  objs: [
    { kind: 'ibook', key: 'grani_patterns', x: 13.5, y: 1.5, name: 'Grani’s Pattern-Board' },
    { kind: 'ichest', key: 'grani_wickbox', x: 5.5, y: 1.5, name: 'Dalla’s Wick-Box' },
  ] });

// ---- Emberhold, the Smiths' Row: the cooper's house (door east) ----
intRoom('emberhold_house_c', { name: 'The Cooper’s House', sub: 'Emberhold · Bolli’s home', seed: 9303, style: 'plank',
  intro: 'The cooper’s house. Barrels finished, barrels half-finished, and barrel-staves stacked like the ribs of something large.',
  interior: { floor: 'plank', wall: 'timber', windows: [[4, 0], [11, 0], [0, 3]] },
  rows: [
    '##############',
    '#.......#....#',
    '#.......#....#',
    '#.......#....#',
    '#............#',
    '#............D',
    '#............#',
    '#............#',
    '#............#',
    '##############'],
  F: [
    IR_BAR(1, 1, 0.2), IR_BAR(2, 1, 1.1), IR_BAR(1, 2, 2.3), IR_BAR(6, 1, 0.7), ...TAB(3, 3), ['interior_shelf', 'town_crates', 5, 1, 5, 1, WN, 1],
    ['interior_hearth', 'dng_brazier', 1, 6, 1, 7, WW, 1, { light: LH(1.8, 7) }], ['town_fence', 'town_fence', 4, 8, 6, 8, 0, 0.9], ...TAB(8, 6),
    IR_BAR(12, 8, 0.5), IR_BAR(11, 8, 1.7),
    ['interior_bed', 'town_crates', 12, 1, 12, 2, WN, 1], ['interior_chest', 'rimeshore_crate', 9, 1, 9, 1, 0, 1], ['interior_pelts', 'town_crates', 12, 3, 12, 3, WE, 1],
  ],
  S: [
    ['town_barrel', 'town_barrel', 6.5, 3.4, 0.4, 0.75], ['interior_stool', null, 2.4, 3.6, 0.5, 1], ...BENCHES(8, 6), ['interior_rug', null, 10.6, 2.3, 0, 0.7],
    ['interior_herbs', null, 7.5, 1.5, WN, 1], IR_CAND(1.6, 4.4, LC(0.9, 4.5)), IR_CAND(11.4, 7.6, LC(0.9, 4.5)), IR_CAND(10.5, 3.4, LC(0.7, 3.5)),
  ],
  objs: [
    { kind: 'ibook', key: 'cooper_marks', x: 5.5, y: 1.5, name: 'Bolli’s Cooper-Marks' },
    { kind: 'ichest', key: 'cooper_nook', x: 9.5, y: 1.5, name: 'Under the Box-Bed' },
  ] });

// ---- Emberhold, the Smiths' Row: the charcoal-burner's house (door west) ----
intRoom('emberhold_house_d', { name: 'The Charcoal-Burner’s House', sub: 'Emberhold · Svart’s home', seed: 9304, style: 'plank',
  intro: 'The charcoal-burner’s house. Everything is black: the floor, the benches, the cat. You are fairly sure there was never a cat.',
  interior: { floor: 'plank', wall: 'timber', trim: 0x2a1c14, windows: [[3, 0], [10, 0], [13, 6]] }, amb: [['ash', 0.14]], look: { tint: [0.96, 0.92, 0.88] },
  rows: [
    '##############',
    '#....#.......#',
    '#....#.......#',
    '#....#.......#',
    '#............#',
    'D............#',
    '#............#',
    '#............#',
    '#............#',
    '##############'],
  F: [
    ['interior_bed', 'town_crates', 1, 1, 1, 2, WN, 1], ['interior_bed', 'town_crates', 2, 1, 2, 2, WN, 0.85], ['interior_chest', 'rimeshore_crate', 4, 1, 4, 1, 0, 1],
    ['interior_hearth', 'dng_brazier', 8, 1, 9, 1, 0, 1, { light: LH(2.0, 7) }], ['interior_shelf', 'town_crates', 6, 1, 6, 1, WN, 1],
    ['interior_weapon_rack', 'town_fence', 12, 2, 12, 2, WE, 1], ['interior_weapon_rack', 'town_fence', 12, 3, 12, 3, WE, 1],
    ...TAB(7, 6), ['town_crates', 'town_crates', 11, 8, 12, 8, 0, 1], IR_BAR(12, 6, 0.3), ['field_log', 'mirewell_mossy_log', 1, 8, 3, 8, 0, 1],
  ],
  S: [
    ['nidavellir_ore_pile', 'dng_rubble_b', 11.4, 4.6, 0.2, 0.7], ['nidavellir_ore_pile', 'dng_rubble_b', 10.4, 7.2, 1.3, 0.55], ...BENCHES(7, 6),
    ['interior_stool', null, 10.5, 2.6, 0.4, 1], ['interior_rug', null, 3.2, 3.0, 0, 0.7], ['interior_pelts', null, 4.5, 3.5, WE, 1],
    IR_CAND(6.5, 3.5, LC(0.8, 4.5)), IR_CAND(11.5, 6.5, LC(0.8, 4)), ['interior_herbs', null, 11.5, 1.5, WN, 1],
  ],
  objs: [
    { kind: 'ibook', key: 'burner_stick', x: 12.5, y: 2.5, name: 'Svart’s Notched Stick' },
    { kind: 'ichest', key: 'burner_ashbox', x: 4.5, y: 1.5, name: 'The Ash-Box' },
  ] });

// ---- Emberhold, by the chapel yard: the gravedigger's house ----
intRoom('emberhold_house_e', { name: 'The Gravedigger’s House', sub: 'Emberhold · Hrói’s home', seed: 9305, style: 'stone',
  intro: 'The gravedigger’s house. Spades by the door, clay on the spades, and in the back room a girl carving names into stones that are not yet needed.',
  interior: { floor: 'flag', wall: 'timber', trim: 0x3a3028, windows: [[4, 0], [11, 0], [15, 4], [0, 7]] }, props: POSTS,
  rows: [
    '################',
    '#......#.......#',
    '#......#.......#',
    '#......#.......#',
    '#......#.......#',
    '#..............#',
    '#......#.......#',
    '#......#.......#',
    '#......#.......#',
    '#......#.......#',
    '###########D####'],
  F: [
    ['interior_hearth', 'dng_brazier', 14, 2, 14, 3, WE, 1, { light: LH(1.8, 7) }], ['interior_shelf', 'town_crates', 9, 1, 9, 1, WN, 1], ['interior_shelf', 'town_crates', 10, 1, 10, 1, WN, 1],
    ...TAB(9, 6), ['interior_weapon_rack', 'town_fence', 14, 6, 14, 6, WE, 1], ['interior_weapon_rack', 'town_fence', 14, 7, 14, 7, WE, 1],
    IR_BAR(8, 9, 0.6), ['town_fence', 'town_fence', 13, 9, 14, 9, 0, 0.85], ['interior_bed', 'town_crates', 12, 1, 12, 2, WN, 1],
    // Álöf's carving room
    ['dng_grave_a', 'dng_grave_a', 1, 6, 1, 6, WW, 0.8], ['dng_grave_b', 'dng_grave_b', 1, 8, 1, 8, WW, 0.8], ['dng_grave_a', 'dng_grave_a', 3, 9, 3, 9, 0, 0.75],
    ...TAB(3, 3), ['interior_bed', 'town_crates', 1, 1, 1, 2, WN, 1], ['interior_chest', 'rimeshore_crate', 6, 1, 6, 1, 0, 1],
  ],
  S: [
    ['dng_rubble_a', 'dng_rubble_a', 4.6, 7.4, 0.4, 0.5], ['interior_stool', null, 5.5, 3.6, 0.2, 1], ...BENCHES(9, 6), ['interior_rug', null, 11.5, 4.5, 0, 0.8],
    ['interior_herbs', null, 13.5, 1.5, WN, 1], IR_CAND(2.5, 5.4, LC(0.9, 4.5)), IR_CAND(8.6, 4.4), IR_CAND(13.5, 8.4, LC(0.8, 4)),
  ],
  objs: [
    { kind: 'ibook', key: 'hroi_roll', x: 9.5, y: 1.5, name: 'The Yard-Roll' },
    { kind: 'ichest', key: 'hroi_box', x: 6.5, y: 1.5, name: 'A Box of Coffin-Nails' },
  ] });

// ---- Emberhold, the Farm Ward: Þórdís's farmhouse, the byre through the wall ----
intRoom('emberhold_farm_a', { name: 'Þórdís’s Farmhouse', sub: 'Emberhold · The Farm Ward', seed: 9306, style: 'straw',
  intro: 'A farmhouse, and through the wall a byre that has been swept for animals that are not here. The stalls still have names chalked over them.',
  interior: { floor: 'straw', wall: 'timber', trim: 0x3a2a1c, windows: [[5, 0], [14, 0], [0, 8], [19, 5]] },
  rows: [
    '####################',
    '#........#.........#',
    '#........#.........#',
    '#........#r.rr.rr.r#',
    '#........#.........#',
    '#..................#',
    '#........#.........#',
    '#........#.........#',
    '#........#r.rr.rr.r#',
    '#........#.........#',
    '#........#.........#',
    '####D###############'],
  F: [
    ['interior_hearth', 'dng_brazier', 1, 4, 1, 5, WW, 1, { light: LH(2.0, 8) }], ...TAB(4, 6), ['interior_bed', 'town_crates', 7, 1, 7, 2, WN, 1], ['interior_bed', 'town_crates', 8, 1, 8, 2, WN, 1],
    ['interior_shelf', 'town_crates', 3, 1, 3, 1, WN, 1], ['interior_shelf', 'town_crates', 4, 1, 4, 1, WN, 1], ['interior_loom', 'rimeshore_drying_rack', 1, 8, 1, 8, WW, 1], IR_BAR(8, 10, 0.4),
    // the byre: four stalls, mangers, the hay
    ['town_fence', 'town_fence', 12, 1, 12, 2, WW, 1], ['town_fence', 'town_fence', 15, 1, 15, 2, WW, 1], ['town_fence', 'town_fence', 12, 9, 12, 10, WW, 1], ['town_fence', 'town_fence', 15, 9, 15, 10, WW, 1],
    ['town_crates', 'town_crates', 13, 1, 14, 1, 0, 0.8], ['town_crates', 'town_crates', 16, 1, 17, 1, 0, 0.8], ['town_crates', 'town_crates', 13, 10, 14, 10, 0, 0.8],
    IR_HAY(17, 5, 18, 6, 1.1), IR_BAR(18, 1), IR_BAR(18, 10, 1), ['interior_pelts', 'town_crates', 18, 7, 18, 7, WE, 1], ['town_crates', 'town_crates', 16, 10, 17, 10, 0, 0.8], ['interior_weapon_rack', 'town_fence', 10, 6, 10, 6, WW, 1], ['interior_chest', 'rimeshore_crate', 10, 10, 10, 10, 0, 1],
  ],
  S: [
    ['interior_rug', null, 4.8, 3.6, 0, 0.8], ['interior_herbs', null, 2.5, 1.5, WN, 1], ['interior_herbs', null, 5.5, 1.5, WN, 1], ['interior_stool', null, 2.6, 4.4, 0.3, 1], ...BENCHES(4, 6),
    IR_TUFT(13.5, 2.2), IR_TUFT(16.5, 9.4), IR_TUFT(17.2, 2.0, 0.4), IR_TUFT(11.2, 6.5, 0.4), ['interior_stool', null, 15.5, 6.6, 0.8, 1], ['town_barrel', 'town_barrel', 10.6, 4.4, 0.4, 0.7],
    IR_CAND(8.4, 4.4, LC(0.9, 4.5)), IR_CAND(6.5, 9.4, LC(0.9, 4.5)), IR_CAND(13.5, 5.6, LC(0.8, 4)), IR_CAND(16.4, 7.4, LC(0.7, 4)),
  ],
  objs: [
    { kind: 'ibook', key: 'thordis_almanac', x: 3.5, y: 1.5, name: 'The Farm-Almanac' },
    { kind: 'ichest', key: 'byre_manger', x: 10.5, y: 10.5, name: 'Under the Manger' },
  ] });

// ---- Emberhold, the Farm Ward: Oddný's farmhouse, the byre behind a rail ----
intRoom('emberhold_farm_b', { name: 'Oddný’s Farmhouse', sub: 'Emberhold · The Farm Ward', seed: 9307, style: 'straw',
  intro: 'Oddný’s farmhouse: one long room, bread at one end and beasts at the other, and a rail between them that nobody on either side respects.',
  interior: { floor: 'straw', wall: 'timber', trim: 0x3a2a1c, windows: [[3, 0], [9, 0], [16, 0], [19, 7]] },
  rows: [
    '####################',
    '#............r.....#',
    '#............r.....#',
    '#............r.....#',
    '#..................#',
    '#..................#',
    '#............r.....#',
    '#............r.....#',
    '#............r.....#',
    '#............r.....#',
    '######D#############'],
  F: [
    ['interior_hearth', 'dng_brazier', 1, 2, 1, 3, WW, 1, { light: LH(2.2, 8) }], ['interior_chest', 'rimeshore_crate', 1, 5, 1, 5, 0, 1], ...TAB(4, 5),
    ['interior_shelf', 'town_crates', 5, 1, 5, 1, WN, 1], ['interior_shelf', 'town_crates', 6, 1, 6, 1, WN, 1],
    ['interior_bed', 'town_crates', 10, 1, 10, 2, WN, 1], ['interior_bed', 'town_crates', 11, 1, 11, 2, WN, 1],
    IR_BAR(1, 8), IR_BAR(1, 9, 1.2), ['town_crates', 'town_crates', 2, 9, 3, 9, 0, 0.9],
    // the byre
    ['interior_weapon_rack', 'town_fence', 9, 9, 9, 9, WS, 1], ['interior_pelts', 'town_crates', 10, 9, 10, 9, WS, 1], IR_BAR(11, 9, 0.6), ['interior_loom', 'rimeshore_drying_rack', 1, 6, 1, 6, WW, 1],
    IR_HAY(17, 1, 18, 2, 1.1), IR_HAY(17, 4, 18, 5, 0.9), ['town_fence', 'town_fence', 16, 8, 16, 9, WW, 1], ['town_crates', 'town_crates', 14, 1, 15, 1, 0, 0.8], ['town_crates', 'town_crates', 17, 9, 18, 9, 0, 0.8], IR_BAR(18, 7, 0.7),
  ],
  S: [
    IR_TUFT(15.5, 2.5), IR_TUFT(15.2, 7.4), IR_TUFT(17.6, 6.6, 0.4), ...BENCHES(4, 5), ['interior_stool', null, 2.6, 4.6, 0.5, 1],
    ['interior_rug', null, 8.5, 6.8, WW, 0.9], ['interior_herbs', null, 3.5, 1.5, WN, 1], ['interior_herbs', null, 8.5, 1.5, WN, 1],
    IR_CAND(8.5, 4.4), IR_CAND(11.6, 8.6, LC(0.9, 4.5)), IR_CAND(15.5, 4.5, LC(0.8, 4)),
  ],
  objs: [
    { kind: 'ibook', key: 'oddny_pies', x: 5.5, y: 1.5, name: 'Oddný’s Pie-Book' },
    { kind: 'ichest', key: 'oddny_crock', x: 1.5, y: 5.5, name: 'A Crock Behind the Oven' },
  ] });

// ---- Emberhold, the Farm Ward: Hallkell's farm, a byre under a hay loft (door north) ----
intRoom('emberhold_farm_c', { name: 'Hallkell’s Farm', sub: 'Emberhold · The Farm Ward', seed: 9308, style: 'straw',
  intro: 'Hallkell’s farm. The byre is under the hay loft, so the beasts are warm in winter and the farmhand sleeps in the hay and complains about the beasts.',
  interior: { floor: 'straw', wall: 'timber', trim: 0x3a2a1c, windows: [[2, 0], [8, 0], [21, 8], [0, 8]] }, props: POSTS,
  loft: { x0: 12, y0: 1, x1: 20, y1: 4, h: 0.8 },
  rows: [
    '####D#################',
    '#.........##,,,,,,,,,#',
    '#.........##,,,,,,,,,#',
    '#.........##,,,,,,,,,#',
    '#.........##,,,,,,,,,#',
    '#.........##rrr//rrrr#',
    '#....................#',
    '#....................#',
    '#...........r.rr.r.rr#',
    '#....................#',
    '#....................#',
    '######################'],
  F: [
    ['interior_hearth', 'dng_brazier', 1, 2, 1, 3, WW, 1, { light: LH(2.0, 8) }], ...TAB(5, 3), ['interior_bed', 'town_crates', 8, 1, 8, 2, WN, 1], ['interior_bed', 'town_crates', 9, 1, 9, 2, WN, 1],
    ['interior_shelf', 'town_crates', 6, 1, 6, 1, WN, 1], ['interior_shelf', 'town_crates', 7, 1, 7, 1, WN, 1],
    // the byre under the loft
    ['town_fence', 'town_fence', 14, 9, 14, 10, WW, 1], ['town_fence', 'town_fence', 17, 9, 17, 10, WW, 1], IR_HAY(19, 9, 20, 10), ['town_crates', 'town_crates', 12, 10, 13, 10, 0, 0.8],
    IR_BAR(20, 6, 0.4), ['interior_weapon_rack', 'town_fence', 1, 7, 1, 7, WW, 1], ['town_crates', 'town_crates', 1, 10, 2, 10, 0, 0.9], IR_BAR(9, 10, 1.1),
    ...TAB(3, 8), IR_BAR(5, 10, 0.3), IR_HAY(7, 9, 8, 10, 0.9), ['interior_pelts', 'town_crates', 20, 7, 20, 7, WE, 1], ['town_crates', 'town_crates', 15, 10, 16, 10, 0, 0.8], IR_BAR(18, 10, 1.7),
    // the hay loft
    IR_HAY(18, 1, 20, 2, 1.2), IR_HAY(12, 1, 13, 2, 1.0), ['interior_bed', 'town_crates', 15, 1, 15, 2, WN, 1], ['interior_chest', 'rimeshore_crate', 20, 4, 20, 4, 0, 1],
  ],
  S: [
    ...BENCHES(5, 3), ...BENCHES(3, 8), ['interior_rug', null, 6.0, 7.2, 0, 0.8], ['interior_stool', null, 3.4, 4.4, 0.4, 1], ['interior_herbs', null, 16.5, 1.5, WN, 1], ['interior_herbs', null, 3.5, 1.5, WN, 1],
    IR_TUFT(15.5, 9.4), IR_TUFT(12.6, 7.6, 0.4), IR_TUFT(18.6, 9.3, 0.45), IR_TUFT(17.2, 3.4, 0.45), IR_TUFT(13.8, 3.6, 0.4),
    IR_CAND(7.5, 4.4, LC(0.9, 4.5)), IR_CAND(10.5, 8.4), IR_CAND(15.5, 7.4, LC(0.8, 4)), IR_CAND(17.6, 3.6, LC(0.7, 4)),
  ],
  objs: [
    { kind: 'ibook', key: 'hay_tally', x: 7.5, y: 1.5, name: 'The Hay-Tally' },
    { kind: 'ichest', key: 'loft_hay', x: 20.5, y: 4.5, name: 'In the Hay' },
  ] });

// ---- Emberhold, the Farm Ward: the midwife's house (door north) ----
intRoom('emberhold_house_f', { name: 'The Midwife’s House', sub: 'Emberhold · Yrsa’s home', seed: 9309, style: 'plank',
  intro: 'The midwife’s house. Herbs from every beam, jars on every shelf, and in the back room a cradle that is never empty for long.',
  interior: { floor: 'plank', wall: 'timber', windows: [[3, 0], [12, 0], [0, 8], [15, 8]] },
  rows: [
    '#######D########',
    '#..............#',
    '#..............#',
    '#..............#',
    '#..............#',
    '#..............#',
    '#######..#######',
    '#..............#',
    '#..............#',
    '#..............#',
    '################'],
  F: [
    ['interior_shelf', 'town_crates', 1, 2, 1, 2, WW, 1], ['interior_shelf', 'town_crates', 1, 3, 1, 3, WW, 1], ['interior_shelf', 'town_crates', 14, 2, 14, 2, WE, 1], ['interior_shelf', 'town_crates', 14, 3, 14, 3, WE, 1],
    ['interior_bookshelf', 'rimeshore_crate', 11, 1, 11, 1, WN, 1, { sy: 0.7 }], ['interior_bookshelf', 'rimeshore_crate', 12, 1, 12, 1, WN, 1, { sy: 0.7 }],
    ['interior_hearth', 'dng_brazier', 4, 4, 5, 4, 0, 1, { light: LH(1.9, 7) }], ...TAB(10, 4),
    // the back room
    ['interior_bed', 'town_crates', 2, 7, 2, 8, WN, 1], ['interior_bed', 'town_crates', 4, 7, 4, 8, WN, 1], ['interior_bed', 'town_crates', 11, 7, 11, 8, WN, 1],
    ['interior_altar', 'dng_grave_b', 13, 7, 14, 7, 0, 0.7, { light: LC(1.0, 5) }], ['interior_chest', 'rimeshore_crate', 14, 9, 14, 9, 0, 1],
  ],
  S: [
    ...[2.5, 3.5, 5.5, 9.5, 13.5].map(x => ['interior_herbs', null, x, 1.5, WN, 1]), ['interior_stool', null, 3.4, 4.6, 0.3, 1], ['interior_stool', null, 10.5, 5.3, 1.2, 1],
    ['interior_rug', null, 8.0, 8.4, WW, 0.9], ['interior_bed', null, 6.2, 7.6, 0.2, 0.45],
    IR_CAND(13.4, 5.4, LC(0.9, 4.5)), IR_CAND(1.6, 5.4, LC(0.9, 4.5)), IR_CAND(9.4, 8.6, LC(0.8, 4)),
  ],
  objs: [
    { kind: 'ibook', key: 'yrsa_roll', x: 14.5, y: 2.5, name: 'The Birth-Roll' },
    { kind: 'ichest', key: 'yrsa_frigg', x: 14.5, y: 9.5, name: 'Under Frigg’s Shelf' },
  ] });

// ---- Emberhold, the Farm Ward: the thatcher's house, where Tóki lives (door north) ----
intRoom('emberhold_house_g', { name: 'The Thatcher’s House', sub: 'Emberhold · Álfr’s home', seed: 9310, style: 'plank',
  intro: 'The thatcher’s house. Bundles of reed by the wall, a fire, three beds, and a small one pushed into the corner where a boy can see the door.',
  interior: { floor: 'plank', wall: 'timber', windows: [[2, 0], [8, 0], [11, 4]] },
  rows: [
    '#####D######',
    '#..........#',
    '#..........#',
    '#..........#',
    '#..........#',
    '#..........#',
    '#..........#',
    '#..........#',
    '############'],
  F: [
    ['interior_hearth', 'dng_brazier', 1, 3, 1, 4, WW, 1, { light: LH(1.8, 7) }], ...TAB(4, 4), IR_HAY(9, 1, 10, 1, 0.8), ['interior_shelf', 'town_crates', 3, 1, 3, 1, WN, 1],
    ['interior_bed', 'town_crates', 10, 6, 10, 7, WS, 1], ['interior_bed', 'town_crates', 9, 6, 9, 7, WS, 1], ['interior_bed', 'town_crates', 1, 6, 1, 7, WS, 0.8],
    ['interior_chest', 'rimeshore_crate', 3, 7, 3, 7, 0, 0.75],
  ],
  S: [
    ...BENCHES(4, 4), ['interior_rug', null, 6.5, 6.4, 0, 0.8], ['interior_stool', null, 2.6, 5.6, 0.2, 1], ['interior_stool', null, 7.4, 3.4, 1.4, 1],
    ['interior_herbs', null, 7.5, 1.5, WN, 1], IR_CAND(10.4, 3.6, LC(0.9, 4.5)), IR_CAND(6.4, 1.6, LC(0.8, 4)), IR_TUFT(8.4, 1.8, 0.4),
  ],
  objs: [
    { kind: 'ibook', key: 'toki_scratch', x: 3.5, y: 1.5, name: 'Scratches on the Shelf' },
    { kind: 'ichest', key: 'toki_box', x: 3.5, y: 7.5, name: 'Tóki’s Treasure-Box' },
  ] });

// ---- Skaldhaven, Netmakers' Row: the net-shed (door east) ----
intRoom('skaldhaven_net_a', { name: 'The Net-Shed', sub: 'Skaldhaven · Netmakers’ Row', seed: 9311, style: 'straw',
  intro: 'The net-shed. Nets hang between the posts in grey curtains, heavy with salt, and the whole shed smells of tar and the sea.',
  interior: { floor: 'plank', wall: 'timber', trim: 0x2e2016, windows: [[5, 0], [12, 0], [0, 7]] }, props: POSTS,
  rows: [
    '##################',
    '#................#',
    '#................#',
    '#.....I....I.....#',
    '#................D',
    '#................#',
    '#.....I....I.....#',
    '#................#',
    '#................#',
    '##################'],
  F: [
    IR_RACK(7, 3, 8, 3), IR_RACK(9, 3, 10, 3), IR_RACK(7, 6, 8, 6), IR_RACK(9, 6, 10, 6),
    ['interior_hearth', 'dng_brazier', 14, 1, 15, 1, 0, 0.8, { light: LH(1.6, 6) }], ['interior_chest', 'rimeshore_crate', 16, 1, 16, 1, 0, 1], ['interior_shelf', 'town_crates', 4, 1, 4, 1, WN, 1],
    IR_BAR(1, 1, 0, 'rimeshore_barrel'), IR_BAR(2, 1, 1, 'rimeshore_barrel'), IR_BAR(1, 8, 2, 'rimeshore_barrel'),
    ['interior_loom', 'rimeshore_drying_rack', 1, 4, 1, 4, WW, 1], ['interior_loom', 'rimeshore_drying_rack', 1, 5, 1, 5, WW, 1],
    ['rimeshore_crate', 'town_crates', 15, 8, 16, 8, 0, 0.9], ['interior_pelts', 'town_crates', 16, 6, 16, 6, WE, 1], ...TAB(7, 8), IR_BAR(10, 8, 0.8, 'rimeshore_barrel'), IR_BAR(11, 8, 2, 'rimeshore_barrel'),
    ['interior_pelts', 'town_crates', 1, 7, 1, 7, WW, 1],
  ],
  S: [
    ['interior_stool', null, 13.5, 5.6, 0.2, 1], ['interior_bench', null, 4.5, 4.6, WW, 1], ['interior_stool', null, 8.0, 7.3, 0.5, 1], ['rimeshore_crate', 'town_crates', 4.5, 8.3, 0.3, 0.6], ['town_barrel', 'town_barrel', 12.6, 8.4, 1, 0.6],
    IR_CAND(12.5, 1.6, LC(0.9, 4.5)), IR_CAND(3.5, 7.4, LC(0.9, 4.5)), IR_CAND(13.5, 7.4, LC(0.8, 4)),
  ],
  objs: [
    { kind: 'ibook', key: 'net_knots', x: 4.5, y: 1.5, name: 'The Knot-Board' },
    { kind: 'ichest', key: 'net_float', x: 16.5, y: 1.5, name: 'A Hollow Float' },
  ] });

// ---- Skaldhaven, Netmakers' Row: the rope-walk (door west) ----
intRoom('skaldhaven_net_b', { name: 'The Rope-Walk', sub: 'Skaldhaven · Netmakers’ Row', seed: 9312, style: 'straw',
  intro: 'The rope-walk: a shed as long as a rope, because that is how you make one. You walk backwards, twisting, until you meet the wall.',
  interior: { floor: 'plank', wall: 'timber', trim: 0x2e2016, windows: [[4, 0], [11, 0], [18, 0], [21, 4]] },
  rows: [
    '######################',
    '#....................#',
    '#....................#',
    '#....................#',
    'D....................#',
    '#....................#',
    '#....................#',
    '######################'],
  F: [
    IR_RACK(5, 2, 6, 2), IR_RACK(8, 2, 9, 2), IR_RACK(11, 2, 12, 2), IR_RACK(14, 2, 15, 2), IR_RACK(17, 2, 18, 2),
    ['interior_loom', 'rimeshore_drying_rack', 20, 2, 20, 3, WE, 1], ['interior_bed', 'town_crates', 1, 1, 1, 2, WN, 1], ['interior_chest', 'rimeshore_crate', 3, 1, 3, 1, 0, 1],
    ['interior_shelf', 'town_crates', 1, 6, 1, 6, WW, 1], IR_BAR(20, 5, 0, 'rimeshore_barrel'), IR_BAR(20, 6, 1, 'rimeshore_barrel'), IR_BAR(19, 6, 2, 'rimeshore_barrel'),
    ['interior_hearth', 'dng_brazier', 10, 6, 11, 6, WS, 0.8, { light: LH(1.6, 6) }], ['rimeshore_crate', 'town_crates', 14, 6, 15, 6, 0, 0.9], ...TAB(5, 6),
  ],
  S: [
    ['interior_stool', null, 7.5, 5.4, 0.3, 1], ['interior_stool', null, 12.4, 5.2, 1.2, 1], ['town_crates', 'town_crates', 17.5, 6.3, 0.4, 0.55],
    IR_CAND(3.5, 3.4, LC(0.9, 4.5)), IR_CAND(8.5, 5.4, LC(0.8, 4.5)), IR_CAND(16.5, 4.6, LC(0.9, 4.5)), ['interior_pelts', null, 2.5, 6.4, WS, 1],
  ],
  objs: [
    { kind: 'ibook', key: 'solvi_tally', x: 1.5, y: 6.5, name: 'The Rope-Tally' },
    { kind: 'ichest', key: 'solvi_coil', x: 3.5, y: 1.5, name: 'A Coil With a Hollow Heart' },
  ] });

// ---- Skaldhaven, Netmakers' Row: the smokehouse (door east) ----
intRoom('skaldhaven_smokehouse', { name: 'The Smokehouse', sub: 'Skaldhaven · Netmakers’ Row', seed: 9313, style: 'straw',
  intro: 'The smokehouse. Two slow fires, racks of split fish above them going gold and then brown, and smoke that gets into your clothes and stays for a week.',
  interior: { floor: 'plank', wall: 'timber', trim: 0x241810, windows: [[8, 0], [0, 7]] }, amb: [['ash', 0.3]], dark: 0.58, look: { tint: [1.02, 0.95, 0.86] },
  rows: [
    '##################',
    '#................#',
    '#................#',
    '#................#',
    '#................#',
    '#rrrrrr..rrrrrrrr#',
    '#................#',
    '#................D',
    '#................#',
    '##################'],
  F: [
    // the smoke room: fish racks on the walls and over the fires
    IR_RACK(1, 1, 2, 1), IR_RACK(5, 1, 6, 1), IR_RACK(10, 1, 11, 1), IR_RACK(13, 1, 14, 1), IR_RACK(1, 2, 1, 3, WW), IR_RACK(16, 2, 16, 3, WE),
    ['interior_hearth', 'dng_brazier', 4, 3, 5, 3, 0, 1, { light: LH(2.2, 7) }], ['interior_hearth', 'dng_brazier', 11, 3, 12, 3, 0, 1, { light: LH(2.2, 7) }],
    IR_BAR(1, 4, 0.4, 'rimeshore_barrel'), IR_BAR(16, 4, 1.2, 'rimeshore_barrel'),
    // the packing room
    ...[1, 2, 4, 5].map((x, i) => IR_BAR(x, 8, i * 0.9, 'rimeshore_barrel')), ['rimeshore_crate', 'town_crates', 9, 8, 10, 8, 0, 0.9], ...TAB(12, 6),
    ['interior_shelf', 'town_crates', 14, 6, 14, 6, WN, 1], ['interior_chest', 'rimeshore_crate', 1, 6, 1, 6, 0, 1],
  ],
  S: [
    ['interior_stool', null, 12.5, 7.4, 0.3, 1], ['interior_stool', null, 3.4, 2.4, 1, 1], ['rimeshore_crate', 'town_crates', 7.5, 8.3, 0.2, 0.6], ['town_barrel', 'town_barrel', 15.4, 8.4, 0.7, 0.6],
    IR_CAND(6.5, 7.6, LC(0.9, 4.5)), IR_CAND(15.4, 6.4, LC(0.9, 4.5)), ['interior_herbs', null, 8.5, 1.5, WN, 1],
  ],
  objs: [
    { kind: 'ibook', key: 'smoke_rule', x: 14.5, y: 6.5, name: 'The Smoker’s Rule' },
    { kind: 'ichest', key: 'smoke_barrel', x: 1.5, y: 6.5, name: 'A Barrel That Is Not Fish' },
  ] });

// ---- Skaldhaven, Netmakers' Row: the sealer's house (door west) ----
intRoom('skaldhaven_net_c', { name: 'The Sealer’s House', sub: 'Skaldhaven · Hildr’s home', seed: 9314, style: 'straw',
  intro: 'The sealer’s house. Harpoons on the wall, seal-oil in the lamps, and pelts on every surface a pelt will lie on.',
  interior: { floor: 'plank', wall: 'timber', trim: 0x2e2016, windows: [[4, 0], [11, 0], [15, 5]] },
  rows: [
    '################',
    '#......#.......#',
    '#......#.......#',
    '#......#.......#',
    '#..............#',
    'D..............#',
    '#..............#',
    '#......#.......#',
    '#......#.......#',
    '################'],
  F: [
    ['interior_weapon_rack', 'town_fence', 3, 1, 3, 1, WN, 1], ['interior_weapon_rack', 'town_fence', 4, 1, 4, 1, WN, 1], ['interior_pelts', 'town_crates', 1, 2, 1, 2, WW, 1], ['interior_pelts', 'town_crates', 1, 3, 1, 3, WW, 1],
    IR_BAR(1, 7, 0, 'rimeshore_barrel'), IR_BAR(1, 8, 1, 'rimeshore_barrel'), IR_BAR(2, 8, 2, 'rimeshore_barrel'), ['rimeshore_crate', 'town_crates', 5, 8, 6, 8, 0, 0.9],
    ['interior_hearth', 'dng_brazier', 14, 2, 14, 3, WE, 1, { light: LH(1.9, 7) }], ['interior_bed', 'town_crates', 8, 1, 8, 2, WN, 1], ['interior_bed', 'town_crates', 9, 1, 9, 2, WN, 1],
    ['interior_shelf', 'town_crates', 12, 1, 12, 1, WN, 1], ...TAB(10, 7), ['interior_chest', 'rimeshore_crate', 14, 8, 14, 8, 0, 1],
  ],
  S: [
    ['interior_rug', null, 11.5, 4.6, 0, 0.9], ['interior_pelts', null, 5.5, 1.5, WN, 1], ...BENCHES(10, 7), ['interior_stool', null, 12.6, 3.4, 0.6, 1],
    IR_CAND(7.5, 4.4, LC(0.9, 4.5)), IR_CAND(13.4, 5.6, LC(0.9, 4.5)), IR_CAND(3.5, 5.6, LC(0.8, 4)), ['rimeshore_drying_rack', null, 4.5, 3.2, 0, 0.6],
  ],
  objs: [
    { kind: 'ibook', key: 'sealer_rings', x: 12.5, y: 1.5, name: 'A String of Copper Rings' },
    { kind: 'ichest', key: 'sealer_oilskin', x: 14.5, y: 8.5, name: 'An Oilskin Bundle' },
  ] });

/* ---------- Doors on the parent maps ---------- */
function intPlaceDoor(m, K, id) {
  const D = INT_DOORS[id], [x, y] = D.door, [sx, sy] = D.step, w = K.w;
  K.set(x, y, T.FLOOR);
  // the step outside: open it, and clear scatter (trees, rocks) off it and its side neighbours
  for (const [ax, ay] of [[sx, sy], [sx - 1, sy], [sx + 1, sy], [sx, sy + (sy - y)]]) { const t = m.t[ay * w + ax]; if (ax > 0 && ay > 0 && ax < w - 1 && ay < K.h - 1 && (t === T.TREE || t === T.ROCK || (ax === sx && ay === sy))) K.set(ax, ay, T.FLOOR); }
  const e = intEntry(id);
  m.warps.push({ x, y, to: id, tx: e.x + 0.5, ty: e.y + 0.5, label: MAPDEFS[id].name, door: true });
  const q = (m.houses || []).find(q => x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1);
  if (q) (q.doors = q.doors || []).push({ x, y, to: id });
}
// Where you land inside a room: the floor tile beside its 'D' (from the blueprint, without generating the room).
function intEntry(id) {
  const rows = INT_ROOMS[id].rows; let dx = -1, dy = -1;
  rows.forEach((r, y) => { const x = r.indexOf('D'); if (x >= 0) { dx = x; dy = y; } });
  for (const [ax, ay] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const c = (rows[dy + ay] || '')[dx + ax]; if (c === '.' || c === ',') return { x: dx + ax, y: dy + ay }; }
  return { x: dx, y: dy };
}
// Hlín's tent: a set piece west of the camp's Waystone (3 x 3, door east toward the fire)
function intHelheimTent(m, K) {
  const L = LK(m, K);
  // helheim_tent (kit helheim): 3 x 3, door +Z at rot 0; turned to face east (+X) so its porch is the door tile (26, 50).
  // The soul lantern's light is built into the model.
  L.decor('helheim_tent', null, 25.5, 50.5, Math.PI / 2, 1, { fp: L.footprint(24, 49, 26, 51) });
}
{
  // Doors in a map's original region go into its layout; doors on the world team's new plots (INT_DOORS[id].plot, a
  // m.houses id in the grown area) go into its grow.layout, where the plot's own door tile is looked up.
  const byParent = {}, byGrow = {};
  for (const id in INT_DOORS) { const D = INT_DOORS[id], g = MAPDEFS[D.parent].grow, grown = !!(D.plot && g); ((grown ? byGrow : byParent)[D.parent] = (grown ? byGrow : byParent)[D.parent] || []).push(id); }
  for (const par in byParent) {
    const base = MAPDEFS[par].layout;
    MAPDEFS[par].layout = function (m, K) {
      base.call(this, m, K);
      if (par === 'helheim') intHelheimTent(m, K);
      for (const id of byParent[par]) intPlaceDoor(m, K, id);
    };
  }
  for (const par in byGrow) {
    const g = MAPDEFS[par].grow, base = g.layout;
    g.layout = function (m, K) {
      if (base) base.call(this, m, K);
      for (const id of byGrow[par]) {
        const D = INT_DOORS[id], q = (m.houses || []).find(h => h.id === D.plot);
        if (q && Array.isArray(q.door)) { const [sx, sy] = q.door; D.step = [sx, sy]; D.door = [Math.min(q.x1, Math.max(q.x0, sx)), Math.min(q.y1, Math.max(q.y0, sy))]; }
        else console.warn(`[interiors] plot ${D.plot} not found on ${par}: door stays at ${D.door}`);
        D.resolved = true; intPlaceDoor(m, K, id);
      }
    };
  }
}

/* ---------- Items ---------- */
questItem('hearth_letter', 'Ragnhild’s Order', { icon: 'letter', color: '#e0c8a0', desc: 'A strip of birch bark: “ONE CASK SALT-ALE, THE GOOD ONE, NOT THE ONE YOU GIVE SKALDS.” Signed with a thumbprint in soot.' });
questItem('salt_cask', 'Cask of Salt-Ale', { icon: 'etc', color: '#a07848', desc: 'A small cask sealed with the Salt Hall’s wax. It sloshes in a way that sounds expensive.' });
questItem('brokkr_tongs', 'Brokkr’s Good Tongs', { icon: 'etc', color: '#8a8a8a', desc: 'Iron tongs, worn smooth where a hand has held them for forty years. There are tooth marks on one handle. Kobold teeth.' });
questItem('egil_whistle', 'Egil’s Bone Whistle', { icon: 'etc', color: '#e8e0c8', desc: 'A whistle carved from a sheep’s bone. It plays one note, badly. Egil says it is the best note.' });
questItem('torn_page', 'Torn Page', { icon: 'letter', color: '#d8c8a0', desc: 'A page torn out of one of Sir Gaunt’s books. The ink is still bright. The dead do not let their ink fade.' });

/* ---------- Lore (Chronicle) ---------- */
Object.assign(LORE, {
  last_hearth: ['The Last Hearth', 'Emberhold’s tavern took its name the winter the Ash came. Every other fire on the road went out; Ragnhild’s did not. She says it is because she never let it. The regulars say it is because the fire is afraid of her.'],
  brokkr_ledger: ['Brokkr’s Ledger', 'Four hundred years of accounts in a dwarf’s square hand. One line recurs every decade or so: “Sindri owes me a hammer.” Nobody alive knows what hammer.'],
  way_hymn: ['The Hymn of the Last Waystone', 'The chapel sings it at dusk: the stones are the Tree’s last roots in Midgard, and while one of them is warm, the Tree is not dead, only sleeping badly.'],
  thorvald: ['Thorvald’s Winters', 'Old Thorvald has counted winters since he was six. The last one he counted as a winter was nine years ago. Since then he writes “Ash” in the tally, and does not count them.'],
  salt_saga: ['The Saga-Board', 'The Salt Hall keeps its sagas on a board by the door, carved a line at a time by whoever lived through something worth a line. The last line is fresh: someone came back from the dead and did not stay long enough to be carved.'],
  sea_snake: ['The Sea-Snake', 'Ormr’s longship is older than Ormr, older than his father, and was never once in a battle it won. Ormr says that is why it is still afloat.'],
  anvil_song: ['The Anvil of Durinn', 'The first dwarf woke in the rock and struck the first anvil to hear what the stone would say. Every great anvil since is a copy of that one. This one, the dwarves say, is the copy the others were copied from.'],
  frigg_spindle: ['Frigg’s Spindle', 'Frigg spins the clouds. Her handmaidens carry the thread down to the worlds below, a little in each pocket, so the queen of the gods is always a little bit everywhere.'],
  gravewarden: ['The Gravewarden’s Roll', 'Gloamheim’s crypt keeps a roll of its dead: two hundred and six names, the last forty in Sir Gaunt’s own hand. The castellan’s name is on it twice. The second time it is crossed out.'],
  gaunt_oath: ['Sir Gaunt’s Oath-Book', 'The oath Sir Gaunt swore to Tyr, written out the night before the Ash: “I will hold this keep until the last of my people is safe.” He held it. He did not say what he would do if none of them were.'],
  bard_verses: ['Three Verses', 'Hjalti the bard is stitching a new saga out of old stones: the chapel’s altar, the Salt Hall’s board, the dwarves’ rune-stone. He says every verse in Midgard was already written somewhere; a bard only finds them.'],
});

/* ---------- Readables and hidden chests ---------- */
const INT_BOOKS = {
  last_hearth_tally: { title: 'The Tally-Board', lore: 'last_hearth', pages: ['<i>Chalk marks, hundreds of them, and names beside the marks. Most names have a line through them. Some of the lines have been rubbed out again.</i>', '<i>At the bottom, in fresh chalk: “The Unkindled one owes nothing. Yet.”</i>'] },
  brokkr_ledger: { title: 'Brokkr’s Ledger', lore: 'brokkr_ledger', pages: ['“Three axes for the Jarl of Skaldhaven. Paid in whale-oil. Oil went off. Jarl went off too.”', '“One hammer, owed by Sindri. Year of the Long Frost. Still owed.”', '“One hammer, owed by Sindri. Year the Tree burned. STILL OWED.”'] },
  way_hymn: { title: 'The Hymn of the Last Waystone', lore: 'way_hymn', pages: ['<i>Keep the stone warm, keep the stone lit,<br>the roots remember what the branches forgot.</i>', '<i>When the last stone cools, the Tree is dead;<br>until it does, the Tree is only sleeping badly.</i>', '<i>In the margin, in a different hand: “Sigrun, you cannot rhyme ‘lit’ with ‘forgot’.”</i>'] },
  thorvald_winters: { title: 'Thorvald’s Tally of Winters', lore: 'thorvald', pages: ['<i>A strip of leather, notched. Seventy-one notches. After them, nine small burned marks, and the word “Ash” scratched beside each one.</i>'] },
  fletcher_notes: { title: 'Hallvard’s Notes', pages: ['“Goose for the fields. Raven for the wood: it flies straighter, and it knows why. Never harpy. Harpy feathers argue with the wind.”', '“Sæunn says I talk to the arrows. I do not. I listen.”'] },
  salt_saga: { title: 'The Saga-Board', lore: 'salt_saga', pages: ['<i>Hundreds of carved lines, each in a different hand. You read the most recent ones.</i>', '“The sea froze on Midwinter night, and Ormr was ashore, drunk. He has been sober since. He tells everyone this. It is the only lie on this board.”', '“One came back from the dead and asked the way to the Deep. We told them. They went.”'] },
  njord_tablet: { title: 'Njörðr’s Tablet', pages: ['<i>A slate on the family shrine, painted with a fish and a ship and a man with a very big beard.</i>', '“Njörðr, lord of the harbour, we ask only for the sea back. You can keep the fish. We will manage the fish ourselves.”'] },
  sea_snake_log: { title: 'The Sea-Snake’s Log', lore: 'sea_snake', pages: ['“Day 3,112 since the freeze. Sailed south. Ice. Sailed north. Ice. Sailed home. Ice, but friendlier.”', '“Passenger paid in zeny and did not die. A good trip.”'] },
  smithy_anvil: { title: 'Brokkr’s Second Anvil', pages: ['<i>A dwarf-anvil on a carved stone block. There is a dent in its face the exact shape of a dwarf’s forehead.</i>', '<i>Ulfhild, without looking up: “He says it’s Sindri’s. It isn’t.”</i>'] },
  forge_anvil_tally: { title: 'A Dwarf-Anvil', pages: ['<i>Someone has carved a tally of every blade struck on this anvil into its stone foot. The tally goes round the foot twice.</i>'] },
  forge_anvil_sindri: { title: 'A Cold Anvil', pages: ['<i>The anvil is cold. On its face, very small, someone has scratched: “Sindri was here. Brokkr was not.”</i>'] },
  anvil_song: { title: 'The Great Anvil of Durinn', lore: 'anvil_song', pages: ['<i>The anvil stands on a stone older than the hall around it. Runes run round its waist, worn almost smooth by hands.</i>', '<i>You read what you can: “STRIKE, AND THE STONE ANSWERS. STRIKE TRUE, AND IT SINGS.”</i>'] },
  frigg_spindle: { title: 'Frigg’s Spindle', lore: 'frigg_spindle', pages: ['<i>A little bone spindle wound with thread so fine you can see through it. It is warm, and very faintly, it smells of rain.</i>'] },
  gravewarden_roll: { title: 'The Gravewarden’s Roll', lore: 'gravewarden', pages: ['<i>A long roll of names. The early ones are in a steward’s tidy hand. The last forty are in a knight’s: large, careful, pressed so hard the quill tore the vellum.</i>', '<i>The last name: “Hallr, gravewarden. Stayed.”</i>'] },
  gaunt_oath_book: { title: 'Sir Gaunt’s Oath-Book', lore: 'gaunt_oath', pages: ['“I, Gaunt of Gloamheim, swear by Tyr’s hand to hold this keep until the last of my people is safe.”', '<i>Below, in the same hand, much later and much shakier: “None of them are safe. So I will hold it forever.”</i>'] },
};
const INT_CHESTS = {
  hearth_loft_chest: { items: [['orange_potion', 3], ['fly_wing', 2]], zeny: 300, text: 'A traveller’s pack, left under a bed and never collected. You tell yourself they are not coming back for it.' },
  smithy_rainy_day: { items: [['ember_whetstone', 1]], zeny: 500, text: 'An iron box stamped “NOT FOR SINDRI”. Inside: a whetstone and a few coins. Brokkr will never notice. Brokkr will absolutely notice.' },
  chapel_vestry: { items: [['blue_potion', 2], ['ygg_leaf', 1]], zeny: 0, text: 'Folded vestments, a candle-snuffer, and behind them a green leaf wrapped in linen that has not wilted in nine years.' },
  weaver_grandfather: { items: [['bandana', 1]], zeny: 800, text: 'Old coins, a red headscarf, and a wooden horse with one leg missing. You leave the horse.' },
  fletcher_eaves: { items: [['butterfly_wing', 2]], zeny: 300, text: 'A box of spare arrowheads and, under them, two butterfly wings pressed flat like flowers.' },
  salt_high_seat: { items: [['honey_mead', 1]], zeny: 1500, text: 'The last Jarl of Skaldhaven kept his good mead where no skald would look. Skalds always look. This one was missed.' },
  netmaker_platform: { items: [['rime_essence', 3]], zeny: 600, text: 'A child’s hoard: shells, a fishbone comb, three glittering flakes of rime and some coins “for later”.' },
  hold_bilge: { items: [['bog_pearl', 1]], zeny: 900, text: 'Smuggled goods, wrapped in oilskin and wedged under the bilge boards. A pearl from the bog. Ormr swears he has never seen it before.' },
  forge_beyond_lava: { items: [['deep_ember', 1]], zeny: 2500, text: 'A dwarf-chest, runed shut, that opens for you anyway. Inside, a Deep Ember sleeps in a nest of ash.' },
  hlin_chest: { items: [['hel_obol', 6], ['soul_tonic', 1]], zeny: 0, text: 'Hlín’s travelling chest. She told you to help yourself. You are fairly sure she meant it.' },
  crypt_niche: { items: [['gold_leaf', 1]], zeny: 2000, text: 'A niche with no name over it, and no bones in it: only a purse and a sheet of gold leaf. Whoever it was for never came.' },
  library_sliding_shelf: { items: [['rune_stone', 3]], zeny: 1500, text: 'One shelf slides aside when you pull the right book. Behind it: rune-stones and a knight’s savings, carefully counted.' },
};
OBJ_TALK.ibook = async o => {
  const B = INT_BOOKS[o.key]; if (!B) return;
  await say(B.title, B.pages);
  const r = P.flags.iread = P.flags.iread || {};
  if (!r[o.key]) { r[o.key] = true; P.flags.loreFound = (P.flags.loreFound || 0) + 1; }
  if (B.lore && P.flags.lore && !P.flags.lore[B.lore]) { P.flags.lore[B.lore] = true; log(`Chronicle: ${LORE[B.lore][0]}.`, 'quest'); if (typeof questToast === 'function') questToast(`Chronicle · ${LORE[B.lore][0]}`, 'new'); UI.dirty = true; }
};
OBJ_TALK.ichest = async o => {
  const C = INT_CHESTS[o.key]; if (!C) return;
  const f = P.flags.chests = P.flags.chests || {}, id = 'int_' + o.key;
  if (f[id]) { o.open = true; await say(o.name, ['<i>Empty. You already took what was worth taking.</i>']); return; }
  f[id] = questDay(); o.open = true;
  const got = C.items.map(([id, n]) => { giveItem(makeItem(id, { qty: n }), o.name); return ITEMS[id].name + (n > 1 ? ' ×' + n : ''); });
  if (C.zeny) P.zeny += C.zeny;
  Sfx.rare(); burst(o.x, o.y, 12, '#ffd070', 16, 2); UI.dirty = true; saveGame();
  await say(o.name, [`<i>${C.text}</i><br><br>You find ${got.join(', ')}${C.zeny ? `${got.length ? ' and ' : ''}${fmt(C.zeny)} zeny` : ''}.`]);
};

/* ---------- Chatter and rumours ---------- */
// Caves the world team adds (MAPDEFS ids `<field>_cave_<name>`): a line that points to one you have not seen yet.
const INT_CAVE_HINT = { ashen_fields: 'under the old fields east of town', withered_wood: 'under the roots of the Withered Wood', rimeshore: 'in the cliffs along the Rimeshore',
  mirewell: 'under the black water of Mirewell', nidavellir: 'past the old shafts of Nidavellir', gloamheim: 'under Gloamheim’s hill', bifrost: 'in the broken rock under the Bifrost', helheim: 'under the grey plains' };
function intCaves() { return Object.keys(MAPDEFS).filter(k => /_cave_/.test(k) && MAPDEFS[k].name); }
function intCaveRumor(voice) {
  const caves = intCaves(); if (!caves.length) return null;
  const fresh = caves.filter(k => !P.flags.seen[k]), k = (fresh.length ? fresh : caves)[Math.floor(Math.random() * (fresh.length ? fresh : caves).length)];
  const field = Object.keys(INT_CAVE_HINT).find(f => k.startsWith(f + '_')), where = field ? INT_CAVE_HINT[field] : 'out in the Ash', d = MAPDEFS[k];
  const lv = d.lv ? ` Take care: the things down there are no younger than Lv ${d.lv[0]}.` : '';
  return (voice || 'They say there is a way down') + ` ${where}: <b>${d.name}</b>.${lv}`;
}
// A talking NPC: a first meeting (intro), then its lines one after another (P.flags.ichat keeps the place), and now and
// then a cave rumour. `menu` adds service options before the chatter.
function intTalk(id) {
  return async () => {
    const D = NPCS[id], N = D.dname || D.name;
    P.flags.ichat = P.flags.ichat || {};
    if (!P.flags.talked[id] && D.intro) { P.flags.talked[id] = true; await say(N, D.intro); return; }
    P.flags.talked[id] = true;
    if (D.menu) { const opts = D.menu().filter(Boolean); if (opts.length) { const r = await dialog(N, D.menuText || D.greet || '…', [...opts.map(o => o[0]), 'Chat', 'Farewell']); $('dialog').hidden = true; if (r >= 0 && r < opts.length) { await opts[r][1](); return; } if (r !== opts.length) return; } }
    const lines = typeof D.lines === 'function' ? D.lines() : D.lines, i = P.flags.ichat[id] || 0;
    let line = lines[i % lines.length]; P.flags.ichat[id] = i + 1;
    if (D.rumor && (i % 3 === 2)) { const r = intCaveRumor(D.rumor); if (r) line = r; }
    await say(N, [line]);
  };
}
function intNpc(id, o) { NPCS[id] = Object.assign({ dir: 1, talkLabel: 'Talk', talk: intTalk(id) }, o); }

// Services
function intHearthRest() {
  const fee = INN_FEE(P.lvl); if (!zenyOk(fee)) return false;
  P.zeny -= fee; P.hp = S.maxhp; P.sp = S.maxsp; addBuff('rested', 'Well Rested', 'rested', 600, { maxhpPct: 5, maxsp: 40, luk: 2 }); P.hp = S.maxhp; P.sp = S.maxsp;
  if (PARTY && PARTY.members.length > 1 && typeof squadReviveAll === 'function') squadReviveAll(1, true);
  pillar(P, '#ffd8a0'); Sfx.heal(); log(`A bed in the loft of the Last Hearth (${fmt(fee)}z). You sleep like the dead, which you are not, quite. Progress saved.`, 'sys');
  saveGame(); return true;
}
const GRACE_SECS = 900;
function intWayGrace() {
  const t = P.flags.igrace || -1e9, now = P.playTime || 0;
  if (now - t < GRACE_SECS / 3 && P.buffs.waygrace) { log('The Waystone’s Grace is still on you.', 'warn'); return false; }
  P.flags.igrace = now; addBuff('waygrace', 'Waystone’s Grace', 'rested', GRACE_SECS, { maxhpPct: 4, vit: 3, int: 3, mdef: 4 });
  if (PARTY && PARTY.members.length > 1) for (const h of PARTY.members) if (h !== P && !h.dead) withHero(h, () => addBuff('waygrace', 'Waystone’s Grace', 'rested', GRACE_SECS, { maxhpPct: 4, vit: 3, int: 3, mdef: 4 }));
  pillar(P, '#ffc070', true); Sfx.heal(); log('Sister Ingunn touches the splinter of Waystone to your brow. It is warm. It stays warm. (Waystone’s Grace: +4 % Max HP, +3 VIT, +3 INT, +4 MDEF, 15 min)', 'sys');
  return true;
}
// Kol's knucklebones: throw two bones each; the higher pair wins the stake twice over.
async function intKnucklebones(stake) {
  const N = NPCS.hearth_kol.dname;
  if (P.zeny < stake) { log(`You need ${fmt(stake)} zeny.`, 'warn'); return; }
  const roll = () => 1 + Math.floor(Math.random() * 6), a = [roll(), roll()], b = [roll(), roll()], sa = a[0] + a[1], sb = b[0] + b[1];
  const K = P.flags.kol = P.flags.kol || { won: 0, lost: 0 };
  let res;
  if (sa > sb) { P.zeny += stake; K.won++; res = `You throw ${a[0]} and ${a[1]}. Kol throws ${b[0]} and ${b[1]}. <b>You win ${fmt(stake)}z.</b> Kol looks at the bones as if they owe him money.`; Sfx.coin(); }
  else if (sa < sb) { P.zeny -= stake; K.lost++; res = `You throw ${a[0]} and ${a[1]}. Kol throws ${b[0]} and ${b[1]}. <b>You lose ${fmt(stake)}z.</b> “The bones remember who fed them,” says Kol.`; }
  else res = `You throw ${a[0]} and ${a[1]}. Kol throws ${b[0]} and ${b[1]}. A tie. Kol pushes your coins back. “The bones are shy tonight.”`;
  UI.dirty = true; await say(N, [res]);
}

/* ---------- NPCs ---------- */
const INT_ALE = 'skald_ale';
// The Last Hearth
intNpc('hearth_oddny', { map: 'emberhold_tavern', name: 'Ragnhild', title: 'Hearth-Keeper', dname: 'Ragnhild of the Last Hearth', x: 18.5, y: 8.7, dir: 1, route: [[15.5, 8.5], [18.5, 8.7], [21.5, 8.5], [18.5, 8.7]], pace: 1.1,
  look: { body: '#7a3a2a', trim: '#e8d0a0', legs: '#3a2420', skin: '#f0d0b8', hair: '#d8a060', weapon: 'none', wide: true },
  greet: 'Boots off the benches, blood off the floor. What’ll it be?', talkLabel: 'Talk',
  intro: ['The Last Hearth. My grandmother lit that fire, and it has not gone out since, and it is not going out on my watch, Ash or no Ash.', 'Beds in the loft, if you have coin. Ale if you have more. Stories are free, but you will have to listen to Hjalti’s.'],
  menuText: 'Boots off the benches, blood off the floor. What’ll it be?',
  menu: () => [[`A bed in the loft (${fmt(INN_FEE(P.lvl))}z: heal, save)`, () => intHearthRest()], [`A mug of Skaldhaven ale (${fmt(ITEMS[INT_ALE].price)}z)`, () => {
    const p = ITEMS[INT_ALE].price; if (!zenyOk(p)) return; if (!bagRoom(INT_ALE, 1)) { log('Your bag is full.', 'warn'); return; } P.zeny -= p; addItem(makeItem(INT_ALE)); Sfx.coin(); log('Ragnhild slides a mug down the bar. It stops exactly in front of you. It always does.', 'npc'); }]],
  lines: ['The ale comes up from Skaldhaven by cart, when the carts come. When they don’t, it is snowmelt with ideas.', 'Grímkell has sat at that table every night for nine years. I have never once seen him pay. I have also never once seen anyone start a fight while he was here.', 'Pies? That is Oddný, down in the Farm Ward. Tell her Ragnhild sent you. She will charge you double, out of respect.', 'Kol, up in the back room, plays knucklebones for coin. He cheats. He is also the worst cheat in Midgard, so it evens out.', 'If Sigrun ever comes in here, the first mug is on me. She never comes in. She says the Waystone gets lonely.'],
  rumor: 'A carter told me there is a way down' });
intNpc('hearth_hjalti', { map: 'emberhold_tavern', name: 'Hjalti', title: 'Bard', dname: 'Hjalti the Bard', x: 4.5, y: 14.8, dir: 1,
  look: { body: '#3a5a6a', trim: '#d8b060', legs: '#2a3440', skin: '#e8c8a8', hair: '#8a5a2a', weapon: 'lute', wcol: '#8a5a2a', cape: '#6a2a2a' },
  greet: '<i>He finishes a chord first. He always finishes a chord first.</i> A listener! Or a verse?', talkLabel: 'Talk',
  intro: ['<i>The bard stops mid-verse, which the room seems grateful for.</i> You are the Unkindled. I have three verses about you already and they all end badly. Help me write a better one.', 'Every saga in Midgard is already carved somewhere, you know. The trick is finding the stones before somebody uses them to build a wall.'],
  lines: ['The Ashen King has more verses than anyone alive. None of them rhyme. That is how you know they are true.', 'A skald in Skaldhaven, Ketill, steals my verses and sells them back to me as gossip. Tell him I said so. He will charge you for it.', 'I sang for Sir Gaunt, once, before the Ash. He listened to the whole thing standing up. It was three hours long.', 'If you ever find a verse carved somewhere odd, bring it to me. A bard only finds things. It is the heroes who lose them.'],
  rumor: 'The last verse I wrote is about a way down' });
intNpc('hearth_bersi', { map: 'emberhold_tavern', name: 'Grímkell', title: 'Veteran', dname: 'One-Eyed Grímkell', x: 8.4, y: 12.6, dir: 1,
  look: { body: '#5a5a52', trim: '#8a7a5a', legs: '#3a3a34', skin: '#c8a080', hair: '#b8b0a0', beard: true, head: 'helm', weapon: 'none', wide: true },
  greet: 'Sit down. You’re blocking my fire.',
  intro: ['<i>An old soldier with one eye and a mug he has not touched.</i> I held the Cinder Gate the night the King came up the road. Eighty of us. Sigrun carried two of us home.', 'I was one of the two. Don’t ask me who the other one was. I didn’t ask either.'],
  lines: ['Keep your shield low against the grubs and high against the wolves. Against the King, keep it between you and him and pray it is thick enough.', 'The Ashen Fields go further east than they used to. Or the Ash is shrinking. Either way, there is more field than there was.', 'I don’t drink it. I just like to have it. A mug of ale is a small warm thing, and there are not many of those left.', 'The dead in Gloamheim still salute when Sir Gaunt goes past. Went past. I should say went.'],
  rumor: 'When I still had two eyes I saw a way down' });
intNpc('hearth_thurid', { map: 'emberhold_tavern', name: 'Thuríð', title: 'Carter', dname: 'Thuríð the Carter', x: 15.5, y: 15.5, dir: -1,
  look: { body: '#6a5a3a', trim: '#a88a5a', legs: '#3a3024', skin: '#e0c0a0', hair: '#5a3a1a', weapon: 'none' },
  greet: 'If you’re selling, I’m not buying. If you’re buying, I’ve already sold it.',
  lines: ['I drive the Skaldhaven road twice a year. Ale up, iron down. The draugr let the cart through if you leave them a fish. I don’t ask.', 'The wolves in the fields have dug themselves a den. You can hear them under the road at night, if the cart is quiet.', 'Brokkr pays in steel, Ragnhild pays in ale, the Skaldhaven folk pay in dried fish. Nobody pays in zeny any more except the dead.', 'My horse is called Surt. It was a joke before the Ash. It is less of a joke now.'],
  rumor: 'Heard it on the road: there is a way down' });
intNpc('hearth_kol', { map: 'emberhold_tavern', name: 'Kol', title: 'Dicer', dname: 'Kol One-Hand', x: 19.5, y: 3.6, dir: -1,
  look: { body: '#2a2a30', trim: '#8a2a2a', legs: '#1a1a20', skin: '#d8b090', hair: '#1a1410', head: 'hood', weapon: 'none' },
  greet: 'Knucklebones. Two each, highest pair takes the pot. Honest bones. Mostly.',
  menuText: '<i>He rattles two bones in his one hand.</i> Knucklebones. Two each, highest pair takes the pot. Honest bones. Mostly.',
  menu: () => [['Throw for 100z', () => intKnucklebones(100)], ['Throw for 1,000z', () => intKnucklebones(1000)]],
  lines: () => ['I lost the other hand to a bet. Not a game. A bet. There is a difference and I learned it the hard way.', 'Up here is where the real business of Emberhold happens. Down there is where the drinking happens. Sometimes they are the same business.', `You have won ${(P.flags.kol && P.flags.kol.won) || 0} and lost ${(P.flags.kol && P.flags.kol.lost) || 0}. The bones keep count. So do I.`],
  rumor: 'For a coin I will tell you where there is a way down' });

// Brokkr's forge-house
intNpc('smithy_ulfhild', { map: 'emberhold_smithy', name: 'Ulfhild', title: 'Apprentice', dname: 'Ulfhild the Apprentice', x: 10.5, y: 5.5, dir: -1,
  look: { body: '#6a4a30', trim: '#3a2418', legs: '#2a1e16', skin: '#e8c0a0', hair: '#c05a2a', weapon: 'mace', wcol: '#777' },
  greet: 'If you’re here for Brokkr, he’s outside shouting at the anvil. If you’re here for me, hold this.',
  intro: ['Brokkr’s apprentice. Seven years. He says I will be ready in another forty, which for a dwarf is a compliment.', 'Mind the forge. It bites. So does Brokkr, but he apologises.'],
  lines: ['I quench in the trough, Brokkr quenches in the snow, Sindri quenches in lava. That is the whole argument between dwarf families, in one sentence.', 'The hammers on the wall all have names. That one is “Stubborn”. That one is “Also Stubborn”. That one is “Sindri’s Nose”.', 'Brokkr refines past +4 when nobody is looking. The metal thinks for itself, he says. So does he.', 'When the forge is hot enough you can hear the Tree in it. Very faint. Like somebody humming in the next room.'],
  rumor: 'Brokkr says the dwarves left a way down' });
intNpc('smithy_geir', { map: 'emberhold_smithy', name: 'Geir', title: 'Bellows-Man', dname: 'Old Geir the Bellows-Man', x: 6.5, y: 3.5, dir: 1,
  look: { body: '#4a3a2a', trim: '#2a1a12', legs: '#2a1e16', skin: '#d0a080', hair: '#d8d0c8', beard: true, weapon: 'none', scale: 0.9 },
  greet: '<i>He keeps pumping.</i> Talk. I can listen and pump. I cannot pump and stop.',
  lines: ['Brokkr and Sindri are brothers. Four hundred years they have been arguing about one hammer. Neither will say which hammer.', 'I have worked these bellows since I was twelve. I have arms like a troll and a back like a question mark.', 'The coal comes from Nidavellir. The dwarves send it up with a note that says “For our brother, who needs it.” Brokkr burns the note first.', 'If the forge ever goes out, Brokkr says, the town goes cold. I think he means it both ways.'],
  rumor: 'The coal-men talk about a way down' });
intNpc('smithy_asgeir', { map: 'emberhold_smithy', name: 'Ásgeir', title: 'Wheelwright', dname: 'Ásgeir the Wheelwright', x: 14.5, y: 13.5, dir: -1,
  look: { body: '#5a6a4a', trim: '#8a7a4a', legs: '#3a3a2a', skin: '#e0b898', hair: '#6a4a2a', beard: true, weapon: 'none' },
  greet: 'Waiting on a wheel rim. Been waiting three days. Brokkr says good iron is patient.',
  lines: ['I build the wheels, Brokkr builds the rims, the road breaks them both. It is a living.', 'Thuríð’s cart has done the Skaldhaven road forty times on my wheels. Forty-one, if she comes back.', 'The east road out of the fields is open further than it used to be. More road means more wheels. I’m not complaining.'],
  rumor: 'Road-men say there is a way down' });

// The Waystone chapel
intNpc('temple_ingunn', { map: 'emberhold_temple', name: 'Ingunn', title: 'Waystone-Priestess', dname: 'Sister Ingunn of the Waystone', x: 10.5, y: 4.3, dir: 1,
  look: { body: '#e8e0d0', trim: '#c9a860', legs: '#8a8070', skin: '#f0dcc8', hair: '#e8d0a0', robe: true, weapon: 'staffv', wcol: '#c8a860' },
  greet: 'The stone is warm. Sit with it a while, if you like.', talkLabel: 'Talk',
  intro: ['Sigrun lit the Waystone in the square. I keep this one: a splinter of it, the size of a hand, that she broke off the night the Ash came so the town would have two. The coal in the Ember-Stone outside came from the same night.', 'If the big one ever goes out, this one will light it again. That is the whole of my faith, and most of my job.'],
  menuText: 'The stone is warm. Sit with it a while, if you like.',
  menu: () => [['Ask for the Waystone’s Grace', () => intWayGrace()]],
  lines: ['The Waystones are the Tree’s roots, what is left of them in Midgard. When you rest at one, the Tree is resting with you.', 'Sigrun cried when she broke the stone. She says she did not. I was there.', 'People light candles here for the ones who did not come back. And lately for the ones who did, which is new.', 'You feel it too, don’t you? The warmth, right here. That is the Tree remembering your name.'],
  rumor: 'The stone is warmer toward the east, where they say there is a way down' });
intNpc('temple_jorunn', { map: 'emberhold_temple', name: 'Jórunn', title: 'Widow', dname: 'Jórunn the Widow', x: 3.4, y: 11.6, dir: -1,
  look: { body: '#2a2a30', trim: '#4a4a52', legs: '#1a1a20', skin: '#e0ccb8', hair: '#8a8a8a', head: 'hood', robe: true, weapon: 'none', scale: 0.95 },
  greet: '<i>She does not look up from her candle.</i> Mm?',
  lines: ['My husband went into the Withered Wood to cut timber the week the Ash came. The timber came back. He did not.', 'I light the candle, and then I light another in case the first one is lonely. That is all the praying I know how to do.', 'They say the barrows under the wood are open now. The dead climb out of them. I keep hoping. I know I should not.', 'You came back. I don’t hold it against you. I just want to know why you, and not him.'],
  rumor: 'The woodcutters used to say there was a way down' });
intNpc('temple_kolbeinn', { map: 'emberhold_temple', name: 'Kolbeinn', title: 'Acolyte', dname: 'Kolbeinn the Acolyte', x: 17.5, y: 11.5, dir: -1, route: [[17.5, 11.5], [18.5, 15.5], [3.5, 15.5], [2.5, 8.5], [18.5, 7.5]], pace: 0.8,
  look: { body: '#c8c0b0', trim: '#8a7a5a', legs: '#6a6050', skin: '#f0d8c0', hair: '#c8a870', weapon: 'fork', wcol: '#8a6a3a', scale: 0.8 },
  greet: 'I’m sweeping. It’s holy sweeping. Sister Ingunn says all sweeping is holy if you do it properly.',
  lines: ['Is it true Sigrun has wings? Real ones? I have never seen them. Sister Ingunn says they are folded up in her heart. That is not an answer.', 'Ash gets in everywhere. I sweep it out and it comes back in. Sister says that is the lesson. I think the lesson is a door.', 'Eydís used to be an acolyte here, before she went off to fight. She was terrible at sweeping. She is very good at fighting, I hear.', 'When I’m older I want to keep a Waystone of my own, somewhere nobody has lit one yet.'],
  rumor: 'Eydís says out past the town there is a way down' });

// The weaver's house
intNpc('house_gunnhild', { map: 'emberhold_house_a', name: 'Gunnhild', title: 'Weaver', dname: 'Gunnhild the Weaver', x: 4.5, y: 2.6, dir: 1,
  look: { body: '#5a6a8a', trim: '#c8b890', legs: '#3a4260', skin: '#f0d8c0', hair: '#a06a3a', robe: true, weapon: 'none' },
  greet: 'Shut the door, you’re letting the Ash in.',
  intro: ['<i>The loom stops.</i> You’re the one who came back. Egil talks about you. Egil talks about everything, mind.', 'Sit if you like. Don’t touch the loom. Don’t let Egil touch the loom either, he is not as sneaky as he thinks.'],
  lines: ['I weave cloaks for the Waystone’s guard. Grey wool, a red thread at the hem. The red thread is for luck. It has not worked yet, but it looks nice.', 'My husband is out on the east road with the carters. He writes when he can. He cannot spell. I love him anyway.', 'Astrid, the little one by the plaza, eats here some nights. She pretends she isn’t hungry. I pretend I made too much.', 'Father counts the winters. Don’t ask him how many. It takes an hour and he cries at the end.'],
  rumor: 'The carters say east of the fields there is a way down' });
intNpc('house_egil', { map: 'emberhold_house_a', name: 'Egil', title: 'Boy', dname: 'Egil', x: 9.5, y: 8.5, dir: -1, route: [[9.5, 8.5], [4.5, 7.5], [9.5, 3.5], [11.5, 8.5]], pace: 2.0,
  look: { body: '#7a5a3a', trim: '#4a3a2a', legs: '#3a2e26', skin: '#f0d8c0', hair: '#d8b060', weapon: 'none', scale: 0.68 },
  greet: 'Are you a hero? Heroes have to help people. It’s the rule.',
  lines: ['Astrid says you’re a ghost. I said you’re not, because ghosts can’t eat, and I saw you eat an apple. She said maybe it was a ghost apple.', 'When I grow up I’m going to be a Knight. Or a Wolfhunter. Or Brokkr.', 'Grandad says there used to be sheep. Real sheep, with wool on, just walking about. I don’t believe him.', 'I’m not scared of the dark. I’m scared of what is IN the dark. That is different.'] });
intNpc('house_thorvald', { map: 'emberhold_house_a', name: 'Thorvald', title: 'Grandfather', dname: 'Old Thorvald', x: 11.5, y: 6.5, dir: 1,
  look: { body: '#5a4a3a', trim: '#8a7a5a', legs: '#3a3024', skin: '#d8b89a', hair: '#e8e8e8', beard: true, weapon: 'staffv', wcol: '#6b5033', scale: 0.92 },
  greet: '<i>The old man warms his hands.</i> Hm? Speak up. The fire is louder than it looks.',
  lines: ['Seventy-one winters I counted. Then the Ash. You don’t count the Ash. You just get through it.', 'Before the Ash, there was a well in the fields where you could hear the Tree drink. Vidar knows the one. Ask him. He won’t tell you, but ask.', 'The Waystone chapel was a barn when I was a boy. Sigrun made it holy by crying in it. That is how most holy places start.', 'My knees tell me when snow is coming. These days they tell me all the time. Liars, both of them.'],
  rumor: 'When I was a boy we knew of a way down' });

// The fletcher's cottage
intNpc('house_hallvard', { map: 'emberhold_house_b', name: 'Hallvard', title: 'Fletcher', dname: 'Hallvard the Fletcher', x: 5.5, y: 2.8, dir: 1,
  look: { body: '#4a5a3a', trim: '#8a6a3a', legs: '#2e3a24', skin: '#d8b090', hair: '#8a6a3a', beard: true, weapon: 'bow', wcol: '#6b4a2a' },
  greet: '<i>He does not look up from the arrow.</i> Straight, straighter, straightest. What?',
  lines: ['Every arrow in Emberhold passes through these hands. Most of them come back. That is the sad part of fletching: you meet your work again, and it is covered in wolf.', 'Raven feathers fly truest. Signý, the Wolfhunter, says her raven would disagree. Her raven can argue with itself.', 'Brokkr makes the heads, I make the rest. He says the heads are the arrow. I say the heads are the part that stops.', 'Sæunn says I should take an apprentice. I did, once. He shot me.'],
  rumor: 'The wolf-hunters talk about a way down' });
intNpc('house_saeunn', { map: 'emberhold_house_b', name: 'Sæunn', title: 'Fletcher’s wife', dname: 'Sæunn', x: 9.5, y: 7.5, dir: -1,
  look: { body: '#8a5a6a', trim: '#e0c8a0', legs: '#4a3040', skin: '#f0d8c8', hair: '#3a2a20', weapon: 'none' },
  greet: 'Mind the feathers. Everything in this house is feathers, including the bread.',
  lines: ['He talks to the arrows. He says he doesn’t. He does.', 'We have been married twenty years. I have found a feather in every meal of it.', 'The fields used to be full of Porings. Pink ones. Soft. Hallvard would never shoot one. Now they bite, and he still won’t.'] });

// The Salt Hall
intNpc('salt_steward', { map: 'skaldhaven_salthall', name: 'Steinunn', title: 'Mead-Steward', dname: 'Steinunn the Mead-Steward', x: 27.5, y: 8.6, dir: -1, route: [[27.5, 8.6], [26.5, 14.5], [27.5, 3.5]], pace: 1.2,
  look: { body: '#6a3a3a', trim: '#e0c070', legs: '#3a2424', skin: '#f0d0b8', hair: '#e8c070', weapon: 'none', wide: true },
  greet: 'The mead is for the hall. The hall is for everyone. Therefore the mead is for everyone who pays.',
  intro: ['I keep the Salt Hall’s mead and its accounts, and my mother keeps the door and the gossip. Between us, nothing in Skaldhaven goes in or out without a Hallgerð or a Steinunn knowing.', 'If you need a bed, Mother has rooms. If you need a drink, you need me.'],
  lines: ['Salt-ale is brewed with seawater. Only a little. Just enough to remind you where you are.', 'Ulf sits on the high seat because nobody else will. It is the Jarl’s seat, and there has been no Jarl since the sea froze with him on it.', 'Captain Ormr drinks here every night and pays every morning. It is the most dependable thing in Skaldhaven, and I include the tide.', 'Brynja killed a whale with that harpoon. Before the freeze. She will tell you. She will tell you twice.'],
  rumor: 'The fishers whisper about a way down' });
intNpc('salt_ulf', { map: 'skaldhaven_salthall', name: 'Ulf', title: 'Lawspeaker', dname: 'Ulf Salt-Beard, Lawspeaker', x: 15.5, y: 2.6, dir: 1,
  look: { body: '#3a4a5a', trim: '#c8a040', legs: '#2a3040', skin: '#d8b89a', hair: '#e8e8e8', beard: true, cape: '#6a2a2a', weapon: 'staffv', wcol: '#8a6a3a' },
  greet: '<i>The old man does not rise from beside the high seat.</i> Speak. The law listens.',
  intro: ['I speak the law of Skaldhaven. All of it, from memory, every spring, from the top of that seat. It takes three days. Nobody listens after the first.', 'The seat is the Jarl’s. The Jarl is under the ice north of here, and he is not dead enough to give it up. So I sit beside it.'],
  lines: ['The law says: a thing found on the ice belongs to whoever finds it, unless it is still moving. Then it belongs to whoever runs fastest.', 'The Drowned Jarl was a fair man in life. It is a hard thing to say about someone who now eats fishermen.', 'Every oath sworn in this hall is carved on the board by the door. The oldest are in runes nobody reads any more. I read them. I just don’t tell anyone what they say.', 'A lawspeaker’s job is to remember. Mine is harder: I have to remember a world that isn’t there.'],
  rumor: 'The old law mentions a way down' });
intNpc('salt_brynja', { map: 'skaldhaven_salthall', name: 'Brynja', title: 'Harpooner', dname: 'Brynja the Harpooner', x: 6.5, y: 11.5, dir: 1,
  look: { body: '#4a5a6a', trim: '#c8b890', legs: '#2a3440', skin: '#e0c0a0', hair: '#c8a060', weapon: 'fork', wcol: '#aab0ba', wide: true },
  greet: 'I killed a whale with this harpoon. Before the freeze. Ask me about it.',
  lines: ['A whale, from a rowing boat, in a storm, at night. I was sixteen. The whale was older. It was a fair fight and I won it.', 'The shell-knights on the lagoon ice are just crabs that think too much of themselves. Hit them where the shell meets.', 'Since the sea froze I hunt on foot. It’s slower. The whales are safer. I don’t think they’re grateful.', 'Signý Rime-Eye learned to throw from me. Then she learned to shoot, and now she won’t let me forget which one is better.'],
  rumor: 'Past the frozen beach I found a way down' });
intNpc('salt_gorm', { map: 'skaldhaven_salthall', name: 'Gorm', title: 'Fisher', dname: 'Gorm the Fisher', x: 22.5, y: 14.8, dir: -1,
  look: { body: '#5a5048', trim: '#8a7a5a', legs: '#3a342e', skin: '#d8b89a', hair: '#9a9a9a', beard: true, head: 'hood', weapon: 'none' },
  greet: 'Fish? No. No fish today. No fish yesterday. Ask me tomorrow.',
  lines: ['I cut a hole in the ice and wait. Sometimes a fish comes up. Sometimes a hand. You learn to wait with an axe.', 'Hrafn down on the beach mends nets for the dead. I mend them for the living. His pay better.', 'The Sea-Snake is the last boat that floats. When Ormr goes out, the whole harbour stands on the pier and does not breathe.'],
  rumor: 'Under the ice there is a way down' });
intNpc('salt_hild', { map: 'skaldhaven_salthall', name: 'Hild', title: 'Trader', dname: 'Hild of the Southern Road', x: 9.5, y: 17.3, dir: 1,
  look: { body: '#7a6a3a', trim: '#c8a060', legs: '#3a3024', skin: '#e0b898', hair: '#1a1410', weapon: 'none', cape: '#3a5a4a' },
  greet: 'Amber, salt, dried cod. Nothing for sale in here: the Steward takes a cut of everything, including your breath.',
  lines: ['I trade the coast road down to Mirewell. The bog folk pay in pearls and curses. I keep the pearls.', 'Skaldhaven grows every year. Not people. Buildings. The people build them to have something to do that isn’t freezing.', 'There is an old smugglers’ box on the Sea-Snake. Everyone knows. Nobody says. That is how you know it’s real.'],
  rumor: 'Down the coast road there is a way down' });

// The Netmakers' longhouse
intNpc('long_sigrid', { map: 'skaldhaven_longhouse', name: 'Sigríð', title: 'Net-Wife', dname: 'Sigríð the Net-Wife', x: 4.5, y: 8.5, dir: 1,
  look: { body: '#5a6a7a', trim: '#c8a060', legs: '#3a4250', skin: '#f0d8c0', hair: '#c8c0b0', robe: true, weapon: 'none' },
  greet: 'Sit by the fire. Everybody sits by the fire. That is what a longhouse is for.',
  intro: ['The Netmakers have mended Skaldhaven’s nets for eleven generations. Now there is nothing to catch, and we mend them anyway, because the day we stop is the day we admit it.', 'Mind the children. There are more of them than there look.'],
  lines: ['A longhouse is a boat turned upside down on the land. My grandmother said so. She also said the dead come back if you forget their names. She was right about one of those.', 'Old Hrólf remembers the night the sea froze. Don’t ask him. He will tell you anyway, but at least you won’t have asked.', 'We burn driftwood and whale-oil and, lately, furniture. The chairs went first. Nobody sat in them anyway.'],
  rumor: 'The fisher-children found a way down' });
intNpc('long_hrolf', { map: 'skaldhaven_longhouse', name: 'Hrólf', title: 'Elder', dname: 'Old Hrólf', x: 15.5, y: 8.5, dir: -1,
  look: { body: '#4a4a52', trim: '#8a7a5a', legs: '#2a2a34', skin: '#d8b89a', hair: '#e8e8e8', beard: true, weapon: 'staffv', wcol: '#6b5033', scale: 0.9 },
  greet: '<i>He does not take his eyes off the fire.</i> The sea froze in one breath. I was there.',
  lines: ['Midwinter night. The sea was loud, and then it was not. I went out and stood on the water. Stood on it. The ships were in it like flies in amber.', 'The Jarl’s ship was furthest out. The ice took it first. We heard them singing out there for three nights. Then we didn’t.', 'I am not afraid of the dead. I am afraid they will forget me before I get there.'] });
intNpc('long_asa', { map: 'skaldhaven_longhouse', name: 'Álfrún', title: 'Net-Girl', dname: 'Álfrún', x: 19.5, y: 6.5, dir: -1, route: [[19.5, 6.5], [19.5, 10.5], [8.5, 9.5], [8.5, 7.5]], pace: 2.2,
  look: { body: '#5a7a8a', trim: '#e0c070', legs: '#3a4250', skin: '#f0d8c0', hair: '#e8d8a0', weapon: 'none', scale: 0.7 },
  greet: 'I can tie nine knots. Can you tie nine knots? I bet you can’t.',
  lines: ['Grandmother says I can’t go on the ice past the piers. I went on the ice past the piers. It was the same ice.', 'Kari from the beach says he found an anchor. I found a whole door! In the ice! It didn’t open.', 'The draugr wear nets like cloaks. Netmaker nets. Grandmother checks the knots when they wash up. She says we tie them too well.'],
  rumor: 'Kari and me found a way down' });

// The Sea-Snake's hold
intNpc('hold_eyvind', { map: 'skaldhaven_hold', name: 'Haukr', title: 'Bosun', dname: 'Haukr the Bosun', x: 8.5, y: 5.5, dir: 1,
  look: { body: '#3a4a5a', trim: '#c8a040', legs: '#2a3040', skin: '#d8a880', hair: '#8a4a2a', beard: true, weapon: 'none', wide: true },
  greet: 'Mind your head. Mind your feet. Mind the cargo. That covers most of you.',
  intro: ['Bosun of the Sea-Snake. That makes me the second-most important man aboard, and the only one who knows where anything is.', 'The Captain is up on the pier, pretending the ice listens to him. It doesn’t. It listens to me, a bit.'],
  lines: ['Ormr says the Snake was never in a battle it won. He leaves out that it was never in a battle it lost, either. It ran.', 'We carry ale north, fish south, and anybody who pays both ways. We have carried dead men. They pay in advance. They insist on it.', 'Hafgrim’s stew is mostly hope. The rest is fish.', 'I’ve heard something knocking under the hull, some nights. Down in the black water. Not ice. Too regular for ice.'],
  rumor: 'On the Mirewell run we passed a way down' });
intNpc('hold_litla', { map: 'skaldhaven_hold', name: 'Litla', title: 'Stowaway', dname: 'Litla the Stowaway', x: 20.5, y: 5.5, dir: -1,
  look: { body: '#6a5a4a', trim: '#4a3a2a', legs: '#3a2e26', skin: '#e8d0b8', hair: '#8a4a2a', weapon: 'none', scale: 0.66 },
  greet: '<i>A small face behind the crates.</i> Don’t tell the bosun. Please don’t tell the bosun.',
  intro: ['<i>A girl, maybe ten, in a coat three sizes too big.</i> I’m not here. I’m cargo. Cargo doesn’t talk.', 'I want to go south. Anywhere south. My aunt lives in Mirewell, maybe, if the bog didn’t eat her.'],
  lines: ['The bosun knows I’m here. He pretends he doesn’t. Sometimes he leaves bread on the crate. Bread is very suspicious.', 'I can see the whole harbour through a knot in the planks. Yesterday I saw a draugr sit on the pier and watch the sunset. Just like a person.', 'When I grow up I’ll have my own ship and I won’t let anybody stow away on it. Except kids. Kids are fine.'] });
intNpc('hold_hafgrim', { map: 'skaldhaven_hold', name: 'Hafgrím', title: 'Ship’s Cook', dname: 'Hafgrím the Cook', x: 18.5, y: 4.5, dir: -1,
  look: { body: '#8a7a6a', trim: '#e0d0b0', legs: '#4a4038', skin: '#e0b898', hair: '#3a2a1a', weapon: 'none', wide: true },
  greet: 'Stew’s not ready. Stew’s never ready. Stew’s a state of mind.',
  lines: ['A good ship’s stew has three things in it: what you caught, what you bought, and what fell in.', 'Úlfar sells Bear Stew up in town for nine hundred zeny. Nine hundred! Mine is free and you only get sick sometimes.', 'Don’t look in the big barrel. It’s not stew. I don’t know what it is. It was here when I came aboard.'] });

// The Anvil-Hall of Durinn
intNpc('forge_hjordis', { map: 'nidavellir_forgehall', name: 'Hjördís', title: 'Anvil-Singer', dname: 'Hjördís Anvil-Singer', x: 19.5, y: 12.5, dir: -1,
  look: { body: '#6a3a24', trim: '#c8a040', legs: '#2a1e16', skin: '#d9a57c', hair: '#c05a2a', beard: false, weapon: 'mace', wcol: '#8a8a8a', scale: 0.88, wide: true },
  greet: 'You hear that? No? Then you’re standing too far from the anvil.',
  intro: ['This is the Anvil-Hall of Durinn. Sindri works the great forge outside because he likes an audience. Real work is done in here, where the stone listens.', 'I am the Anvil-Singer. I strike, and I listen to what the metal says back. Mostly it says “ow”.'],
  lines: ['The Great Anvil across the lava has not rung since the Tree burned. The fire under it went out. You can’t relight a dwarf-fire with a Midgard coal. It sulks.', 'Every dwarf is born knowing one song. Mine is the one the iron sings when it is ready to be a blade. I have heard it four hundred times. I cry every time.', 'Brokkr up in Emberhold was the finest singer of us all. Then he left for the surface to hit things in the rain. We do not say his name in here. We say it very loudly outside.', 'Mind the channel. The lava is old and it is hungry and it does not care that you came back from the dead once already.'],
  rumor: 'Tófi has been nosing around a way down' });
intNpc('forge_nar', { map: 'nidavellir_forgehall', name: 'Nár', title: 'Bellows-Keeper', dname: 'Nár the Bellows-Keeper', x: 6.5, y: 13.5, dir: 1,
  look: { body: '#6a9a92', trim: '#c8b060', legs: '#4a6a64', skin: '#b8e0d8', hair: '#e8f0f0', beard: true, weapon: 'none', scale: 0.86, wide: true },
  greet: '<i>The old dwarf is faintly see-through. He does not seem to have noticed.</i> Pump, pump, pump.',
  lines: ['I died at these bellows. Nobody told me to stop, so I didn’t.', 'Ívaldi’s sons forged Gungnir in here. Odin’s spear. I pumped. They took all the credit. I don’t mind. You can’t spend credit when you are dead.', 'Nýr, out in the statue hall, is my cousin. He is still on shift too. We are a family of very reliable ghosts.'],
  rumor: 'In my day there was a way down' });
intNpc('forge_dvalinn', { map: 'nidavellir_forgehall', name: 'Dvalinn', title: 'Rune-Carver', dname: 'Dvalinn the Rune-Carver', x: 14.5, y: 16.5, dir: 1,
  look: { body: '#4a4a5a', trim: '#9ac8ff', legs: '#2a2a34', skin: '#d9a57c', hair: '#8a8a8a', beard: true, weapon: 'staffv', wcol: '#9ac8ff', scale: 0.86, wide: true },
  greet: 'Do not lean on the rune-stone. It has feelings. They are mostly about leaning.',
  lines: ['The rune-stone remembers every blade struck in this hall, and the name of the dwarf who struck it. Read it and you will know more of our history than most of us do.', 'A rune is a promise carved in stone. That is why we do not carve many. Promises are heavy.', 'The Ashen King came down here once, before the end. He wanted a crown. We made him one. It was the worst thing we ever made, and the best work.'],
  rumor: 'An old rune on the stone marks a way down' });
intNpc('forge_tofi', { map: 'nidavellir_forgehall', name: 'Tófi', title: 'Ore-Runner', dname: 'Tófi the Ore-Runner', x: 22.5, y: 18.5, dir: -1, route: [[22.5, 18.5], [17.5, 18.5], [27.5, 12.5], [6.5, 12.5]], pace: 1.8,
  look: { body: '#6a4a3a', trim: '#c8a040', legs: '#3a2a20', skin: '#e8c0a0', hair: '#8a4a2a', weapon: 'fork', wcol: '#8a8a8a', scale: 0.72, wide: true },
  greet: 'I run the ore! Cart to forge, forge to cart. Tófa is my sister. She gets lost. I don’t. I get found.',
  lines: ['Tófa says the shafts sing. They don’t sing. They whistle. There’s a draught from somewhere deep, and deep means a hole, and a hole means somewhere to go.', 'Magma slimes are just lava that got bored. You can scoop them if you’re quick. I’m not allowed to be quick any more.', 'When I’m grown I’ll forge a hammer so good Brokkr and Sindri both want it, and then I’ll give it to Tófa and watch them argue.'],
  rumor: 'Down the old rails there is a way down' });

// Hlín's tent
intNpc('tent_snotra', { map: 'helheim_tent', name: 'Snotra', title: 'Frigg’s handmaiden', dname: 'Snotra, Frigg’s handmaiden', x: 4.5, y: 5.6, dir: 1,
  look: { body: '#4a5a7a', trim: '#e0c070', legs: '#2a3450', skin: '#f0dcc8', hair: '#d8d0e8', robe: true, weapon: 'none' },
  greet: 'Hlín keeps the fire outside. I keep the quiet in here. Both are harder than they look.',
  intro: ['I am Snotra. Frigg sent seven of us down with the thread; I was the one who asked why. She said: because somebody must be wise in Hel, and Eir is too busy.', 'Sit. You smell of the Deep. Nobody comes out of the Deep without needing to sit.'],
  lines: ['The dead do not lie, exactly. They remember badly, which comes to the same thing.', 'Frigg knows every fate and speaks none of them. I know a few and speak all of them. We balance.', 'The Deep Roots go down further than Hel. Further than Níðhöggr. At the bottom, Ganglati says, there is only the Tree, drinking. I think he has never been.', 'Hlín pretends she does not sleep. She sleeps sitting up by the fire, with one hand on the chest. I cover her with a fur. She pretends she does not notice.'],
  rumor: 'Under the grey plains there is a way down' });
intNpc('tent_vor', { map: 'helheim_tent', name: 'Vör', title: 'The Careful', dname: 'Vör the Careful', x: 9.5, y: 4.6, dir: -1,
  look: { body: '#3a3440', trim: '#8affb4', legs: '#241a30', skin: '#e8e0e8', hair: '#101014', robe: true, head: 'hood', weapon: 'none' },
  greet: '<i>She watches you before you speak, and seems to already know what you will say.</i>',
  lines: ['Nothing can be hidden from me. It is less useful than it sounds. Mostly people hide their snacks.', 'Hel keeps her word. That is what makes her frightening. A liar you can bargain with.', 'Garmr was a puppy once. Everything was, once. That is the saddest thing I know, and I know a great many things.'] });

// The crypt and the library
intNpc('crypt_hallr', { map: 'gloamheim_crypt', name: 'Hallr', title: 'Gravewarden', dname: 'Hallr the Gravewarden', x: 22.5, y: 7.5, dir: -1,
  look: { body: '#8ab0c8', trim: '#d8d0a0', legs: '#5a7a8a', skin: '#c8e0e8', hair: '#e0e8f0', beard: true, weapon: 'fork', wcol: '#9ab0c0', scale: 0.95 },
  greet: '<i>A translucent old man with a lamp that gives no heat.</i> Mind the niches. They are occupied.',
  intro: ['Hallr. Gravewarden of Gloamheim. I kept the lamps lit down here for thirty years alive, and I saw no reason to stop just because I died.', 'The dead here are restless since the Ash. Most of them are harmless. The castellan is not. He swore to keep the keep, and he has decided that means keeping everyone in it.'],
  lines: ['Every name in the Roll is somebody I buried. I sang for each one. I have a terrible voice. They never complained.', 'Sir Gaunt came down here the night before the end and read the whole Roll aloud. Then he added his own name at the bottom, and crossed it out, and went up to die.', 'The lamps burn soul-oil now. I don’t know where it comes from. I don’t ask. A good gravewarden doesn’t ask the dead for receipts.'],
  rumor: 'The old barrow-roads lead to a way down' });
intNpc('crypt_sigvaldi', { map: 'gloamheim_crypt', name: 'Sigvaldi', title: 'Grave-Robber', dname: 'Sigvaldi the Grave-Robber', x: 20.5, y: 2.6, dir: -1,
  look: { body: '#3a3a30', trim: '#6a5a3a', legs: '#2a2a20', skin: '#d8b090', hair: '#5a4a2a', head: 'hood', weapon: 'none', scale: 0.95 },
  greet: '<i>A living man, crouched in the gallery, very still.</i> Shh! Are they gone? Tell me they’re gone.',
  lines: ['I came for the gold. I found the gold. The gold found the skeletons. Now I live here.', 'The ghost with the lamp brings me bread. I don’t know where he gets bread. I don’t ask. You learn not to ask down here.', 'If you’re going west, to the big one with the helmet, go fast and don’t let him call his friends. I let him call his friends.'],
  rumor: 'Before this job I was robbing a way down' });
intNpc('lib_ingolf', { map: 'gloamheim_library', name: 'Ingólf', title: 'Scribe', dname: 'Ingólf the Scribe', x: 13.5, y: 9.5, dir: -1,
  look: { body: '#9ab0c0', trim: '#d8d0a0', legs: '#6a7a8a', skin: '#c8e0e8', hair: '#d8e0e8', robe: true, weapon: 'book', wcol: '#8a6a3a', scale: 0.92 },
  greet: '<i>A ghost in ink-stained robes, dusting a book that is not dusty.</i> Quietly. The books are sleeping.',
  intro: ['Ingólf. Sir Gaunt’s scribe. I wrote his letters, kept his books, and argued with him about commas for eleven years. He was wrong about commas.', 'When the keep fell the dead came up here and tore pages out. For kindling, I think. The dead are always cold.'],
  lines: ['Sir Gaunt read everything. Sagas, law, recipes. Especially recipes. He could not cook. He liked to know how it would have gone.', 'The raven on the map table is not mine. It came the week after the Ash and never left. It reads over my shoulder and corrects my spelling.', 'Every book is a door. Most of them open inward.', 'There is a shelf in the corner that does not hold books. Sir Gaunt kept his savings there. I was never supposed to know. I know everything in this room.'],
  rumor: 'One of these maps shows a way down' });
intNpc('lib_hrafnketill', { map: 'gloamheim_library', name: 'Hrafnketill', title: 'Raven', dname: 'Hrafnketill the Raven', x: 18.5, y: 6.5, dir: -1,
  look: { body: '#1a1a22', trim: '#3a3a4a', legs: '#101014', skin: '#2a2a30', hair: '#101014', weapon: 'none', scale: 0.5, wings: true },
  greet: '<i>The raven tilts its head.</i> Kraa. Wrong. Kraa.',
  lines: ['<i>The raven taps a book with its beak.</i> Kraa. Odin. Kraa. <i>It taps again, harder.</i> Read.', '<i>It hops onto the map and stands on the Bifrost.</i> Kraa. Wolf. Kraa.', '<i>It looks at you for a long time.</i> Kraa. Late. <i>You are not sure whether it means you are late, or dead.</i>'],
  rumor: '<i>The raven hops to a corner of the map and taps it.</i> Kraa. There, it seems to say, there is a way down' });

/* ---------- Quests ---------- */
quest('hearth_casks', { giver: 'hearth_oddny', name: 'A Cask for the Last Hearth', area: 'Emberhold · Skaldhaven', req: { lvl: 26, test: () => !!P.flags.talked.hearth_oddny },
  summary: 'Ragnhild wants a cask of the Salt Hall’s good salt-ale. Take her order to the mead-steward in Skaldhaven and bring the cask back.',
  offer: ['The carts stopped coming at midsummer. I have one barrel of real ale left and I am saving it for the end of the world, which might be Tuesday.', 'Skaldhaven brews salt-ale. The Salt Hall’s steward, Steinunn, sells it to people she likes. She does not like me. Take my order to her anyway: she likes money more than she dislikes me.'],
  progress: 'Steinunn, in the Salt Hall in Skaldhaven. The good cask. Not the one she gives skalds.',
  done: ['<i>Ragnhild breaks the wax, sniffs, and closes her eyes.</i> That is the good one. She must like you.', 'First mug is yours. Every mug after that is also yours, but you’ll pay for them.'],
  give: [['hearth_letter', 1]], seq: true,
  obj: [
    { type: 'deliver', item: 'hearth_letter', n: 1, npc: 'salt_steward', text: 'Bring Ragnhild’s order to Steinunn in the Salt Hall (Skaldhaven)' },
    { type: 'talk', npc: 'salt_steward', gives: [['salt_cask', 1]], text: 'Collect the cask from Steinunn' },
    { type: 'collect', item: 'salt_cask', n: 1, text: 'Carry the Cask of Salt-Ale back to Ragnhild in Emberhold' },
  ],
  reward: { exp: 40000, jexp: 30000, zeny: 4000, items: [['skald_ale', 3], ['white_potion', 3]], lore: 'last_hearth' } });
quest('bard_verses', { giver: 'hearth_hjalti', name: 'Three Verses', area: 'Emberhold · Skaldhaven · Nidavellir', req: { lvl: 40, test: () => !!P.flags.talked.hearth_hjalti },
  summary: 'Hjalti needs three old verses for a new saga: carved on the Ember Chapel’s altar in Emberhold, on the Salt Hall’s saga-board and on the dwarves’ rune-stone in the Anvil-Hall of Durinn.',
  offer: ['I am writing a saga about the Ash. Not the King: everyone has done the King. About the ones who stayed.', 'But every good saga is built out of older ones, and the old verses I need are carved where I cannot go. The altar-stone in the Ember Chapel, here in town. The saga-board in Skaldhaven’s Salt Hall. And the rune-stone the dwarves keep in their Anvil-Hall, down in Nidavellir.', 'Read them. Remember them. Come back and sing them to me, badly. I’ll fix the tune.'],
  progress: 'The chapel altar, the Salt Hall’s saga-board, the dwarves’ rune-stone. Remember every word. Or most of them.',
  done: ['<i>You recite the three verses. Hjalti winces twice and weeps once.</i>', 'Yes. Yes, that is the saga: the stone that kept warm, the hall that kept count, the anvil that kept singing. The ones who stayed. It is almost finished. It needs an ending, and that is your job.'],
  obj: [
    { type: 'inspect', map: 'emberhold_temple', r: 1.8, place: 'the Ember Chapel', spots: [{ x: 10.5, y: 3.5, name: 'the altar-stone', text: ['<i>Runes round the foot of the altar, half-hidden by candle-wax:</i>', '“Warm while the stone is warm; lit while one hand lights it. The Tree forgets nothing it has once been told.”'] }] },
    { type: 'inspect', map: 'skaldhaven_salthall', r: 1.8, place: 'the Salt Hall', spots: [{ x: 2.6, y: 10.0, name: 'the saga-board', text: ['<i>At the top of the board, in runes so worn you read them with your fingers:</i>', '“Count the living on the benches, count the dead beneath the ice; the hall keeps both, the hall keeps count.”'] }] },
    { type: 'inspect', map: 'nidavellir_forgehall', r: 1.8, place: 'the Anvil-Hall of Durinn', spots: [{ x: 16.5, y: 16.5, name: 'the rune-stone', text: ['<i>Dvalinn watches you read, unhappily.</i>', '“Strike and the stone answers; strike true and it sings. Every blade remembers the hand. Every hand remembers the song.”'] }] },
  ],
  reward: { exp: 90000, jexp: 70000, zeny: 8000, items: [['honey_mead', 2]], lore: 'bard_verses' } });
quest('smithy_tongs', { giver: 'smithy_ulfhild', name: 'Brokkr’s Good Tongs', area: 'Withered Wood', req: { lvl: 12, test: () => !!P.flags.talked.smithy_ulfhild },
  summary: 'A rotwood kobold stole Brokkr’s good tongs from the forge-house. Get them back before Brokkr notices.',
  offer: ['Don’t tell Brokkr. A kobold came in last week while I was at the trough and ran off with his good tongs. The ones his father made.', 'They went back to the Withered Wood, into the roots with the rest of the rotwood. If you find the thief, you find the tongs. Kobolds never let go of anything shiny. Or anything at all.'],
  progress: 'Rotwood kobolds, in the Withered Wood. One of them has the tongs. It will not give them up nicely.',
  done: ['<i>Ulfhild hugs the tongs. Then she hugs you, briefly, and pretends she did not.</i>', 'He will never know. Here: the whetstone he keeps for customers he likes. He’ll never know about that either.'],
  drops: [{ mob: ['rotwood_kobold', 'kobold_archer'], item: 'brokkr_tongs', chance: 0.35 }],
  obj: [{ type: 'collect', item: 'brokkr_tongs', n: 1 }],
  reward: { exp: 6000, jexp: 4500, zeny: 1200, items: [['ember_whetstone', 1]], lore: 'brokkr_ledger' } });
quest('temple_names', { giver: 'temple_ingunn', name: 'The Unlit Names', area: 'Emberhold', req: { lvl: 8, test: () => !!P.flags.talked.temple_ingunn },
  summary: 'Three memorial stones in the Ember Chapel have gone dark. Sister Ingunn asks you to read the names on them aloud, so the stone remembers them.',
  offer: ['On the west wall there are three memorial stones for the ones we lost the night the Ash came. The candles by them have gone out and will not relight.', 'A name spoken beside the stone warms it. I have said them all a thousand times; the stone knows my voice too well to listen. Say them for me. A stranger’s voice carries.'],
  progress: 'The three memorial stones on the west wall of the chapel. Read each name aloud.',
  done: ['<i>Behind you, three candles catch by themselves, one after another.</i>', 'There. Thank you. The stone heard you. It will remember you now, too. That is not always a comfort, but it is always a kindness.'],
  obj: [{ type: 'inspect', map: 'emberhold_temple', r: 1.6, place: 'the chapel’s west wall', spots: [
    { x: 2.5, y: 6.5, name: 'the first stone', text: ['<i>“Ragnvald, who held the Cinder Gate.”</i> You say the name. The stone is warm under your palm.'] },
    { x: 2.5, y: 10.5, name: 'the second stone', text: ['<i>“Ása and Ási, twins, who went to fetch water.”</i> You say both names. The candle beside the stone flickers.'] },
    { x: 2.5, y: 13.5, name: 'the third stone', text: ['<i>“The ones whose names we do not know.”</i> You say it. It seems to be enough.'] }] }],
  reward: { exp: 2500, jexp: 1800, zeny: 600, items: [['orange_potion', 5]], lore: 'way_hymn' } });
quest('egil_whistle', { giver: 'house_egil', name: 'Egil’s Whistle', area: 'Ashen Fields', req: { lvl: 4 },
  summary: 'Egil dropped his bone whistle in the Ashen Fields, and a scarecrow husk picked it up.',
  offer: ['I went out past the gate. Just a little way! And the scarecrows chased me and I dropped my whistle and one of them PICKED IT UP.', 'Can you get it back? Don’t tell Mum I went out past the gate. Don’t tell Grandad either. Tell Grandad, actually. He won’t remember.'],
  progress: 'The scarecrow husks in the Ashen Fields. One of them has my whistle. I think it’s the one that looked cross.',
  done: ['<i>Egil blows the whistle. It makes one note, very loudly. Gunnhild shouts from the loom.</i>', 'That’s the best note. Here, you can have my apples. I was saving them for being a hero, but you’re more of a hero than me. For now.'],
  drops: [{ mob: 'scarecrow_husk', item: 'egil_whistle', chance: 0.4 }],
  obj: [{ type: 'collect', item: 'egil_whistle', n: 1 }],
  reward: { exp: 700, jexp: 500, zeny: 300, items: [['apple', 5], ['red_potion', 5]], lore: 'thorvald' } });
quest('saeunn_fluff', { giver: 'house_saeunn', name: 'Softer Than Feathers', area: 'Ashen Fields', req: { lvl: 2 },
  summary: 'Sæunn wants something for her pillows that is not feathers. Poring fluff will do.',
  offer: ['Twenty years I have slept on feathers. Arrow feathers, the ones too crooked to fly. They poke. They all poke.', 'Bring me fluff from the blight porings in the fields. Ten will do. It is the only soft thing left in Midgard, and it’s attached to something that bites.'],
  progress: 'Ten tufts of fluff from the Ashen Fields. Soft ones.',
  done: ['<i>Sæunn buries her face in the fluff.</i> Oh, that’s nice. That’s very nice. Hallvard! Come and feel this. No, don’t. You’ll put a feather in it.'],
  obj: [{ type: 'collect', item: 'fluff', n: 10 }],
  reward: { exp: 400, jexp: 300, zeny: 250, items: [['red_potion', 8], ['fly_wing', 2]] } });
quest('brynja_shells', { giver: 'salt_brynja', name: 'Crabs That Think Too Much', area: 'Rimeshore', req: { lvl: 30, test: () => !!P.flags.talked.salt_brynja },
  summary: 'Brynja wants the shell-knights on the lagoon ice thinned out so the fishers can cut their holes again.',
  offer: ['The shell-knights have moved onto the lagoon ice where the fishers cut their holes. A fisher can outrun one. Not four.', 'I’d go myself, but my knees are sixteen years older than my harpoon arm. Break eight of them. Hit where the shell meets.'],
  progress: 'Eight shell-knights on the lagoon ice, south-east in Rimeshore.',
  done: ['Eight? Ha! Gorm will have fish by Midwinter. Or a hand. Either way, something will come up through the ice that is not a crab.', 'Take this. It’s what the fishers pooled. They can’t count well, so it might be generous.'],
  obj: [{ type: 'kill', mob: 'shell_knight', n: 8 }],
  reward: { exp: 55000, jexp: 40000, zeny: 5000, items: [['yellow_potion', 8]] } });
quest('longhouse_manes', { giver: 'long_sigrid', name: 'Winter Cloaks', area: 'Rimeshore', req: { lvl: 30, test: () => !!P.flags.talked.long_sigrid },
  summary: 'Sigríð is sewing winter cloaks for the Netmaker children and needs snow wolf manes for the collars.',
  offer: ['The children have grown out of their cloaks again. They do that. It is the one thing in Skaldhaven that still grows.', 'Snow wolf manes for the collars: the fur is thick and it sheds the wet. Five should do, if the wolves were well fed.'],
  progress: 'Five Frost Manes from the snow wolves of Rimeshore.',
  done: ['<i>Sigríð holds a mane up to the fire and nods.</i> These will do. Álfrún! Come and be measured. No, you cannot have the one with the ears.'],
  obj: [{ type: 'collect', item: 'frost_mane', n: 5 }],
  reward: { exp: 50000, jexp: 36000, zeny: 4500, items: [['white_potion', 3], ['fly_wing', 3]] } });
quest('stowaway_stew', { giver: 'hold_litla', name: 'Something Warm', area: 'Skaldhaven', req: { lvl: 28 },
  summary: 'Litla the stowaway has been living on the bosun’s bread. Bring her a Bear Stew from Úlfar’s stall.',
  offer: ['I’m not hungry. <i>Her stomach disagrees, loudly.</i> …I’m a bit hungry.', 'Úlfar in town sells Bear Stew. I smelled it from here. Through the planks. Can you get me some? I’ll pay you back when I have a ship.'],
  progress: 'A Bear Stew, from Úlfar the Chandler in Skaldhaven. Hot, if you can manage it.',
  done: ['<i>Litla eats the whole bowl without breathing.</i>', 'Here. It’s all I’ve got. I found it on the pier. It’s shiny, so it must be worth something. Don’t tell the bosun I gave you something. He’ll think I’m rich and make me pay for the bread.'],
  obj: [{ type: 'deliver', item: 'bear_stew', n: 1, npc: 'hold_litla' }],
  reward: { exp: 30000, jexp: 22000, items: [['shiny_trinket', 1]], lore: 'sea_snake' } });
quest('forge_cores', { giver: 'forge_hjordis', name: 'Fire for the Anvil of Durinn', area: 'Nidavellir Deep', req: { lvl: 42, test: () => !!P.flags.talked.forge_hjordis },
  summary: 'The fire under the Great Anvil of Durinn went out with the Tree. Hjördís can relight it with magma cores from the slimes of the Deep.',
  offer: ['A dwarf-fire sulks when it goes out. You cannot relight it with coal, or oil, or a Midgard spark. It wants to be asked properly, by something that was fire once.', 'The magma slimes in the Deep are lava that wandered off. Their cores still remember the heat. Bring me four and I will ask the anvil nicely.'],
  progress: 'Four Magma Cores, from the magma slimes of Nidavellir.',
  done: ['<i>Hjördís lays the cores under the Great Anvil and sings, very quietly. The anvil answers: one long note that you feel in your teeth.</i>', 'Ha! Hear that? Four hundred years and it has not forgotten the tune. Here. A dwarf-stone for your trouble. Use it well; the metal will know.'],
  obj: [{ type: 'collect', item: 'magma_core', n: 4 }],
  reward: { exp: 110000, jexp: 80000, zeny: 9000, items: [['dvergr_whetstone', 1]], rep: { dvergar: 1 }, lore: 'anvil_song' } });
quest('crypt_castellan', { giver: 'crypt_hallr', name: 'The Castellan’s Rest', area: 'Gloamheim Keep', req: { lvl: 26, test: () => !!P.flags.talked.crypt_hallr },
  summary: 'The Hollow Castellan keeps Gloamheim’s crypt and everyone in it. Hallr asks you to put him to rest.',
  offer: ['The castellan swore to keep the keep. Sir Gaunt freed him from the oath before the end. The castellan did not listen. Castellans rarely do.', 'He is at the west end, by his own tomb, calling the dead to stand guard. Lay him down. I will sing for him. Terribly, but I will sing.'],
  progress: 'The Hollow Castellan, at the west end of the crypt.',
  done: ['<i>Hallr sings. He is right: it is terrible. The lamps burn a little brighter all the same.</i>', 'He is on the Roll twice now. The second time I will not cross out. Take this; it was his, and he has no more use for it.'],
  obj: [{ type: 'kill', mob: 'crypt_castellan', n: 1, text: 'Put the Hollow Castellan to rest (the crypt’s west end)' }],
  reward: { exp: 60000, jexp: 45000, zeny: 6000, items: [['white_potion', 4], ['rune_stone', 2]], lore: 'gravewarden' } });
quest('library_pages', { giver: 'lib_ingolf', name: 'Kindling', area: 'Gloamheim Keep', req: { lvl: 22, test: () => !!P.flags.talked.lib_ingolf },
  summary: 'The dead of Gloamheim tore pages out of Sir Gaunt’s books. Ingólf wants them back before they are burned.',
  offer: ['Eleven years I kept these books. The dead tore out pages to burn, the week the keep fell. The dead are always cold. It is not an excuse.', 'The skeletons and archers in the halls still carry them. Bring me five. I will put them back where they belong, and pretend nobody ever touched them.'],
  progress: 'Five Torn Pages, from the skeletons and grave archers of Gloamheim.',
  done: ['<i>Ingólf smooths each page with a hand that is not quite there, and slides them back into their books.</i>', 'There. The Saga of Hrólf Kraki is whole again. Sir Gaunt read it every winter. He always cried at the same part. Take these: tonics he kept for late nights.'],
  drops: [{ mob: ['skeleton_soldier', 'grave_archer', 'rust_knight'], item: 'torn_page', chance: 0.3 }],
  obj: [{ type: 'collect', item: 'torn_page', n: 5 }],
  reward: { exp: 26000, jexp: 20000, zeny: 3000, items: [['runic_tonic', 2]], lore: 'gaunt_oath' } });
quest('snotra_embers', { giver: 'tent_snotra', name: 'Thread for Frigg', area: 'Helheim', req: helReq(72),
  summary: 'Snotra spins Frigg’s thread from the embers of lost souls. She needs eight.',
  offer: ['Frigg’s thread is spun from what is left: a little warmth, a little memory. Down here, the Lost Souls carry both, and they drop them when they are laid to rest.', 'Eight embers. I will spin you a thread and send it up to her. She will know you helped. She always knows.'],
  progress: 'Eight Lost Soul’s Embers, from the Lost Souls on the grey plains.',
  done: ['<i>Snotra spins the embers into a thread so fine it glows. She winds it round a bone spindle and tucks it into her sleeve.</i>', 'Frigg will have it by morning. There is no morning here, but she will have it anyway.'],
  obj: [{ type: 'collect', item: 'soul_ember', n: 8 }],
  reward: { exp: 650000, jexp: 400000, items: [['soul_tonic', 4], ['hel_obol', 8]], rep: { dead: 1 }, lore: 'frigg_spindle' } });

/* ---------- Rumours (Ketill in Skaldhaven) ---------- */
RUMORS.push(
  { id: 'i_hearth', when: () => !P.flags.talked.hearth_oddny, text: 'Emberhold has a tavern, if you can believe it. The Last Hearth. Ragnhild has never let the fire go out. Ask for a bed in the loft; she’ll even save your place.' },
  { id: 'i_bard', when: () => P.lvl >= 40 && !P.quests.done.bard_verses, text: 'Hjalti the bard in the Last Hearth pays for old verses. Mine are all new, so he won’t take them. Try the saga-board in the Salt Hall.' },
  { id: 'i_hold', when: () => P.lvl >= 28 && !P.flags.talked.hold_litla, text: 'Something small lives in the Sea-Snake’s hold. Haukr says it’s a rat. Rats don’t hum.' },
  { id: 'i_crypt', when: () => P.lvl >= 26 && !P.flags.talked.crypt_hallr, text: 'There’s a crypt under Gloamheim, behind a door in the entry hall. A gravewarden still keeps the lamps. He died thirty years ago. He keeps them anyway.' },
  { id: 'i_forge', when: () => P.lvl >= 42 && !P.flags.talked.forge_hjordis, text: 'The dwarves have a second forge in Nidavellir, behind a door off Sindri’s great hall. They say real work is done in there. Sindri says that isn’t true, very loudly.' },
  { id: 'i_caves', when: () => intCaves().some(k => !P.flags.seen[k]), get text() { return intCaveRumor('Word on the ice is there is a way down') || 'Nothing new.'; } },
);

/* ---------- Round 10: people, readables, errands for the new rooms ---------- */
questItem('smoked_fish', 'Bundle of Smoked Fish', { icon: 'etc', color: '#b07a3a', desc: 'Split cod, smoked gold, wrapped in birch bark and tied with net-twine. Þórunn’s knot. Nobody else in Skaldhaven ties it that way.' });

Object.assign(LORE, {
  nail_tally: ['The Nail-Tally', 'Hrefna keeps count of every nail she has struck since the Ash: a notch for each hundred on a long iron bar. A longship takes six thousand. A coffin takes forty. The bar has more coffins in it than longships.'],
  yard_roll: ['The Yard-Roll', 'Emberhold buries its dead in the chapel yard, under stones Álöf carves. The Roll keeps who lies where. The oldest names are not Emberhold names at all: they walked in from the Ash, died, and the town kept them anyway.'],
  birth_roll: ['The Birth-Roll', 'Yrsa has written down every child born in Emberhold since the Ash: forty-one names. Beside each she draws a small flame, for the Waystone. The newest flame is still wet.'],
  smoker_rule: ['The Smoker’s Rule', 'Skaldhaven’s smokers keep one rule above the others: the fire is never allowed to flame. A flame cooks; smoke keeps. The town has lived nine winters on that difference.'],
});

Object.assign(INT_BOOKS, {
  hrefna_tally: { title: 'The Nail-Tally', lore: 'nail_tally', pages: ['<i>A bar of iron as long as your arm, notched along both edges. A notch for every hundred nails, Hrefna says. You stop counting at two hundred notches.</i>', '<i>Near the end, one notch is filed smooth and struck again, deeper. Scratched beside it: “the week of the Den.”</i>'] },
  grani_patterns: { title: 'Grani’s Pattern-Board', pages: ['<i>Lantern patterns scratched into a board: horn panes, iron frames, a hook to hang it on. Each one has a name. “Bersi’s.” “The Salt Hall’s.” “Sigrun’s, which she will not take.”</i>', '<i>The last pattern is a lamp with no flame drawn in it at all, only a small green wisp. Under it: “will it burn in the Ash? — try.”</i>'] },
  cooper_marks: { title: 'Bolli’s Cooper-Marks', pages: ['<i>A plank burned with cooper’s marks, one for each house that has bought a barrel. Next to Ragnhild’s mark there are so many notches the wood has split.</i>', '“A barrel is a promise that what goes in will still be there in spring. I have never broken one. The spring broke a few.”'] },
  burner_stick: { title: 'Svart’s Notched Stick', pages: ['<i>A stick of black ash-wood, notched for every kiln Svart has burned. The last dozen notches have a small cross beside them.</i>', '<i>Kata, from the corner: “The crosses are the kilns where something came out of the trees to watch. He keeps burning anyway. The Wood likes the smell, he says.”</i>'] },
  hroi_roll: { title: 'The Yard-Roll', lore: 'yard_roll', pages: ['<i>A roll of names in two hands: a slow, square one (Hrói) and a quick, neat one (Álöf). Each name has a row and a stone.</i>', '<i>Row nine: “A keeper of the Waystone, name not known. Tally-stick and flint. He went toward the farms the first winter.” The stone beside it is blank.</i>'] },
  thordis_almanac: { title: 'The Farm-Almanac', pages: ['<i>A calendar stick, carved with the old farm year: sowing, lambing, the first cut, the slaughter-month. Most of the marks have been rubbed out and carved again, closer together.</i>', '<i>Þórdís has added a new mark between midsummer and harvest. It is a wolf’s head. It has no name, because it does not need one.</i>'] },
  oddny_pies: { title: 'Oddný’s Pie-Book', pages: ['“Turnip pie. Turnip and onion pie. Turnip and whatever-Gunnar-brought pie.”', '“Apple pie (when there are apples). Clover-honey cake (when there are bees). Grief-bread: the plain loaf we leave at the door when someone has not come home. There is always a grief-bread.”'] },
  hay_tally: { title: 'The Hay-Tally', pages: ['<i>A board of chalk marks: loads of hay in, loads of hay out. Hallkell’s marks are straight. Vébjörn’s lean to one side, like Vébjörn.</i>', '<i>At the bottom: “If the hay runs out before the thaw, eat the farmhand.” The chalk is fresh. Someone has written “NO” under it, then “maybe”.</i>'] },
  yrsa_roll: { title: 'The Birth-Roll', lore: 'birth_roll', pages: ['<i>A long strip of birch bark, written close. A name, a day, and a small flame drawn beside each one.</i>', '<i>You find Egil. You find Tóki. You find, near the start, a name crossed out and written again with a flame bigger than the rest: “Astrid, who walked in on her own.”</i>'] },
  toki_scratch: { title: 'Scratches on the Shelf', pages: ['<i>A boy has scratched a map into the shelf with a nail: the town, the gate, a big circle marked “WOLVES”, a smaller one marked “BATS”, and a long arrow off the edge of the shelf marked “WHERE I AM GOING”.</i>'] },
  net_knots: { title: 'The Knot-Board', pages: ['<i>A board hung with knots, each tied round a peg, each with a name burned under it: the sheet-bend, the net-knot, the drowner’s hitch.</i>', '<i>The last peg holds a knot nobody can name. Ragna says a draugr tied it, in a net that came up out of the Rimeshore ice, and nobody has been able to untie it since.</i>'] },
  solvi_tally: { title: 'The Rope-Tally', pages: ['<i>A slate, scratched with lengths of rope and who they went to. “Forty fathoms, anchor, the Sea-Snake.” “Twenty, well-rope, Emberhold.” “Two hundred, the new ship, Bárðr, not paid.”</i>', '<i>At the bottom, underlined twice: “Rime-glue: ask a hero. They like hitting porings.”</i>'] },
  smoke_rule: { title: 'The Smoker’s Rule', lore: 'smoker_rule', pages: ['<i>Burned into a board over the packing table:</i> “SMOKE, NOT FLAME. OAK, NOT PINE. SALT FIRST, PRAY AFTER.”', '<i>Under it, smaller, in a child’s letters: “and do not let Búi eat the good ones.”</i>'] },
  sealer_rings: { title: 'A String of Copper Rings', pages: ['<i>A cord hung with copper rings, green with age, one for every year. The family gives one to Njörðr every spring, and keeps one back to remember that they did.</i>', '<i>The last ring is not copper. It is a seal-hunter’s bone ring, cracked across. Hildr does not talk about that one.</i>'] },
});
Object.assign(INT_CHESTS, {
  hrefna_keg: { items: [['orange_potion', 2]], zeny: 400, text: 'A keg of bent nails, and under the bent nails, straight coins. Hrefna says bent nails keep thieves honest: nobody steals bent nails.' },
  grani_wickbox: { items: [['blue_potion', 2], ['fly_wing', 2]], zeny: 250, text: 'Wick-cord, beeswax ends, and a pair of wings tied up in a twist of cloth, as if someone meant to fly somewhere and changed their mind.' },
  cooper_nook: { items: [['skald_ale', 2]], zeny: 350, text: 'Two small casks of ale, hidden under the box-bed where Vigdís will not look. Vigdís has looked. She left them there on purpose.' },
  burner_ashbox: { items: [['red_potion', 4], ['wolf_claw', 3]], zeny: 200, text: 'A tin box full of ash, and in the ash three wolf claws and some coins. Kata says the claws are from the Wood. Svart says they are from the kiln. Neither of them says how.' },
  hroi_box: { items: [['yellow_potion', 2]], zeny: 600, text: 'Coffin-nails, a spare chisel, and a purse the dead did not need. Hrói says he never takes from the dead. Álöf says he never has to: they leave it for him.' },
  byre_manger: { items: [['apple', 4], ['orange_potion', 2]], zeny: 300, text: 'Under the manger straw: apples, still good, and a twist of coins. A cow cannot eat coins. Somebody hoped the cow would come back anyway.' },
  oddny_crock: { items: [['honey_mead', 1]], zeny: 200, text: 'A crock of honey-mead behind the oven, where it keeps warm. Geirný’s. You can tell because it is nearly empty.' },
  loft_hay: { items: [['butterfly_wing', 1], ['orange_potion', 3]], zeny: 450, text: 'A farmhand’s hoard, dug into the hay: potions he did not buy, a butterfly wing he did not earn, and coins he did not mention.' },
  yrsa_frigg: { items: [['white_potion', 1], ['red_potion', 5]], zeny: 0, text: 'Clean linen, a birthing-knife, and potions for the nights that go wrong. Yrsa keeps more than she needs. She has had nights that went wrong.' },
  toki_box: { items: [['shiny_trinket', 1], ['jellopy', 3]], zeny: 12, text: 'Tóki’s treasure: a shiny trinket, three jellopies, a bird’s skull, and twelve zeny counted out in a row. You take the trinket. You leave the skull. You put two of the zeny back.' },
  net_float: { items: [['rime_essence', 2]], zeny: 500, text: 'A glass float, hollow, stoppered with wax. Inside, two flakes of rime and a rolled-up coin-purse. The oldest hiding place on the Row.' },
  solvi_coil: { items: [['yellow_potion', 3]], zeny: 700, text: 'The middle of a coil of rope is hollow, if you coil it right. Sölvi coils it right.' },
  smoke_barrel: { items: [['hermit_shell', 2], ['white_potion', 1]], zeny: 900, text: 'A barrel marked “COD” that is not cod: shells for buttons, a potion, and Þórunn’s savings, which smell very strongly of cod.' },
  sealer_oilskin: { items: [['wolf_pelt', 2], ['blue_potion', 2]], zeny: 800, text: 'An oilskin bundle, tied with sinew: two good pelts, potions for the ice, and seal-money. A sealer never goes out without something wrapped up at home.' },
});

// Hrefna's nail-forge
intNpc('row_hrefna', { map: 'emberhold_row_a', name: 'Hrefna', title: 'Nail-Smith', dname: 'Hrefna the Nail-Smith', x: 4.5, y: 4.5, dir: 1,
  look: { body: '#5a4030', trim: '#b8402a', legs: '#2a1e16', skin: '#e0b894', hair: '#2a1a12', weapon: 'mace', wcol: '#777', wide: true },
  greet: '<i>Tink. Tink. Tink.</i> Speak between the strokes.',
  intro: ['Nails. Only nails. Brokkr does the swords, and Brokkr can keep them. Nobody ever held a town together with a sword.', 'Every roof in Emberhold, every coffin, every door the Ash has knocked on: my nails. Sit, if you can find a bench I have not nailed down.'],
  lines: ['A longship takes six thousand nails. I am striking them for Bárðr in Skaldhaven, one at a time, and he will pay me for them one at a time, when he has a ship.',
    'The week they found the Wolf Den, under the fields east of the old gate, I struck nothing but coffin-nails. Forty to a coffin. I do not want to strike another like that week.',
    'Starri is a good lad. He sorts. He sorts very slowly. The nails do not mind, and I am learning not to.',
    'Grani next door makes lamps. I make the nails he hangs them on. We are the two most useful people on the Row and the only two who admit it.'],
  rumor: 'The carters who buy my nails say there is a way down' });
intNpc('row_starri', { map: 'emberhold_row_a', name: 'Starri', title: 'Journeyman', dname: 'Starri the Journeyman', x: 6.5, y: 7.5, dir: -1,
  look: { body: '#6a5a44', trim: '#3a2a1c', legs: '#3a3024', skin: '#f0d0b0', hair: '#d8a060', weapon: 'none', scale: 0.86 },
  greet: 'Long ones in this barrel. Short ones in that one. Bent ones… I have not decided about the bent ones.',
  lines: ['Hrefna says a bent nail is a nail that has been somewhere. I think it is a nail that has been hit badly.',
    'My father went to the Barrow Downs to see the old stones. He came back with a sword off a dead man. Mother made him take it back. He took it to Hrefna instead.',
    'I asked Hrefna if I could make a sword one day. She gave me a nail and said, “Make that a sword.” I am still thinking about it.'],
  rumor: 'Father swears that past the Barrow Downs there is a way down' });

// Grani's lamp-shop
intNpc('row_grani', { map: 'emberhold_row_b', name: 'Grani', title: 'Lamp-Maker', dname: 'Grani the Lamp-Maker', x: 12.5, y: 5.2, dir: -1,
  look: { body: '#4a4a3a', trim: '#e0b050', legs: '#2e2e24', skin: '#d8b090', hair: '#c8c0b0', beard: true, weapon: 'none', scale: 0.96 },
  greet: 'Mind your head. And the lamps. Mostly the lamps: your head will mend.',
  intro: ['Every lamp Bersi lights, I made. Forty-one of them, and three for the Salt Hall, and one for Sigrun that she will not take. She says the Waystone is light enough.', 'Oil comes up from Skaldhaven, and some winters it does not. A lamp without oil is a very sad piece of iron. I am trying to fix that.'],
  lines: ['Horn panes for the wind, iron for the frame, a good hook. A lamp is simple. It is the light that is difficult.',
    'The bog-folk in Mirewell say the wisps burn cold and never go out. A flame that never goes out! In a lamp! Think of the oil it would save. Think of Bersi’s face.',
    'I tried a flame from the Ash once. It burned grey and it whispered. I put it out and did not sleep for a week.',
    'Dalla twists the wicks. Forty years of wicks. She says the trick is to twist them the same way the sun goes round. Nobody has seen the sun properly in nine years, so she guesses.'],
  rumor: 'The oil-carters talk about a way down' });
intNpc('row_dalla', { map: 'emberhold_row_b', name: 'Dalla', title: 'Wick-Twister', dname: 'Dalla the Wick-Twister', x: 3.5, y: 2.6, dir: 1,
  look: { body: '#7a5a6a', trim: '#e0c8a0', legs: '#4a3444', skin: '#f0d8c0', hair: '#d8d0c0', head: 'hood', robe: true, weapon: 'none', scale: 0.9 },
  greet: '<i>Her fingers keep twisting.</i> Sit down, dear. You make the flames nervous.',
  lines: ['Grani talks to his lamps. Hallvard the fletcher talks to his arrows. Nobody in this town talks to their wife, but they all talk to something.',
    'When we were young there was a lamp in every window from here to Prontera-under-the-Tree. You could walk all night and never be in the dark. Now we walk all day and never quite leave it.',
    'Grani wants a wisp in a lamp. I want a lamp in a wisp. That way the wisp can carry it and I can sit down.'],
  rumor: 'My sister’s boy walks the bog-roads. He says there is a way down' });

// the cooper's house
intNpc('cooper_bolli', { map: 'emberhold_house_c', name: 'Bolli', title: 'Cooper', dname: 'Bolli the Cooper', x: 5.5, y: 2.6, dir: -1,
  look: { body: '#6a4a2a', trim: '#8a6a3a', legs: '#3a2a1c', skin: '#d8b090', hair: '#8a5a2a', beard: true, weapon: 'mace', wcol: '#6b4a2a', wide: true },
  greet: 'If it holds water, I made it. If it holds ale, I made it better.',
  intro: ['Barrels. Staves, hoops, a head at each end. You would think the world could not end while there were still barrels to fill. It found a way.', 'Ragnhild at the Last Hearth buys more barrels than the rest of the town together. I do not ask what she does with them. I suspect they are full of ale, and then full of Emberhold.'],
  lines: ['Oak for ale, ash for water, pine for the things you want to forget. That last one is a cooper’s joke. It is also true.',
    'Svart next door burns the charcoal Hrefna forges with. Hrefna forges the hoops I bend. The Row is one long argument that makes things.',
    'The hunters at the Lodge in the Withered Wood sent for water barrels. They said the brook runs clear again, down in Brook Hollow. Clear water in the Wood. I nearly wept into a stave.'],
  rumor: 'The hunters who buy my barrels say there is a way down' });
intNpc('cooper_vigdis', { map: 'emberhold_house_c', name: 'Vigdís', title: 'Cooper’s wife', dname: 'Vigdís', x: 6.5, y: 6.2, dir: 1,
  look: { body: '#5a6a5a', trim: '#c8b890', legs: '#3a4034', skin: '#f0d8c0', hair: '#a06a3a', robe: true, weapon: 'none' },
  greet: 'He’ll talk barrels at you until the Ash lifts. Sit here. I’ll talk about something else.',
  lines: ['He thinks I do not know about the ale under the bed. I put it there. Let a man have one secret; it keeps him from looking for yours.',
    'My brother went east on the new gate road to see the farm out past the fields. Hallbera’s. He came back and said she has a whole barley field and a wolf that watches it. He has not stopped talking about the wolf.',
    'Everything smells of oak in this house. My hair smells of oak. The bread smells of oak. When I die, bury me in a barrel. I will feel at home.'],
  rumor: 'My brother came back from the east saying there is a way down' });

// the charcoal-burner's house
intNpc('burner_svart', { map: 'emberhold_house_d', name: 'Svart', title: 'Charcoal-Burner', dname: 'Svart the Charcoal-Burner', x: 10.5, y: 3.5, dir: -1,
  look: { body: '#2a2624', trim: '#4a3a2a', legs: '#1a1614', skin: '#a08070', hair: '#1a1410', beard: true, weapon: 'mace', wcol: '#555', wide: true },
  greet: '<i>He coughs. It sounds like a kiln settling.</i> Don’t touch anything white. It won’t be, after.',
  lines: ['I burn in the Withered Wood, past the woodcutters’ clearing. The trees there are already half charcoal. The Ash did most of my work for me. I resent it.',
    'At night something comes out of the old barrow in the Wood and sits by my kiln. It does not come close. It just warms its hands. I let it. It is cold down there, I expect.',
    'Hrefna says my charcoal is the best she has ever used. Then she says it is the only charcoal she has ever used. Both are true.'],
  rumor: 'Round my kiln the Wood whispers of a way down' });
intNpc('burner_kata', { map: 'emberhold_house_d', name: 'Kata', title: 'Burner’s daughter', dname: 'Kata', x: 3.5, y: 6.5, dir: 1,
  look: { body: '#4a3a3a', trim: '#8a3a2a', legs: '#2a2020', skin: '#e0c0a0', hair: '#3a2a20', weapon: 'none', scale: 0.8 },
  greet: 'Papa says I am not allowed to go to the kiln any more. So now I go when he is not looking.',
  lines: ['There is a stone in the Wood, east, with a strip of hide tied round it. Ásvör the huntress ties a new one every time she wants something to die cleanly. I tied one for Papa’s cough.',
    'I found wolf claws in the kiln ash. Papa says they were in the wood when he burned it. Wolves do not live in trees. I checked.',
    'When I grow up I will not burn charcoal. I will be a huntress, or a gravedigger like Álöf. Somebody has to carve the names nicely.'],
  rumor: 'Ásvör’s hunters say there is a way down' });

// the gravedigger's house
intNpc('grave_hroi', { map: 'emberhold_house_e', name: 'Hrói', title: 'Gravedigger', dname: 'Hrói the Gravedigger', x: 11.5, y: 4.2, dir: -1,
  look: { body: '#4a4640', trim: '#6a5a4a', legs: '#2e2a26', skin: '#d0b098', hair: '#8a8a82', beard: true, weapon: 'fork', wcol: '#6b5033', scale: 1.02 },
  greet: 'Not yet, I hope. You don’t look like you need me yet.',
  intro: ['Hrói. I dig. Álöf carves. Ása keeps the coal and Sister Ingunn keeps the stone, and between the four of us the dead of Emberhold are kept as well as the living. Better, some winters.', 'Mind the clay on the floor. It is from the yard. Everything in this house is from the yard, one way or another.'],
  lines: ['The first winter I buried a hundred and six. The ninth winter, eleven. The town is not getting safer. There are just fewer of us to lose.',
    'The Old Barrow in the Withered Wood is full of the old dead: kings and their men, buried with their swords before anyone thought to write names down. Nobody digs for them. Nobody mourns them. It bothers me more than it should.',
    'Álöf carves a stone for every name on the Roll, even the ones with no body. Especially those. A stone is a place to stand, she says, when there is nowhere else.',
    'People ask me if the dead stay down. In the yard, yes. Out there, where Sigrun could not reach them… you have seen out there.'],
  rumor: 'The dead are restless, and they say there is a way down' });
intNpc('grave_alof', { map: 'emberhold_house_e', name: 'Álöf', title: 'Stone-Carver', dname: 'Álöf the Stone-Carver', x: 4.5, y: 5.2, dir: 1,
  look: { body: '#5a5a62', trim: '#a8a098', legs: '#34343a', skin: '#e8d0b8', hair: '#c8a870', weapon: 'none', scale: 0.92 },
  greet: '<i>She blows stone-dust off a name.</i> Careful. That one is not dry yet. Names take a while.',
  lines: ['I carve the names before they are needed. It is not grim. It is tidy. When the day comes, the stone is ready, and nobody has to wait.',
    'There is a blank stone in row nine. A Waystone-keeper who went toward the farms the first winter and never came back. Sigrun still lights a candle for him. I do not know what to carve until we know where he is.',
    'Father says the Barrow Downs south of the fields were a burial ground before Emberhold was a town. Their stones are older than ours and nobody carved them properly. I would like to see them. I would like to fix them.'],
  rumor: 'Father’s old friend saw it before he died: a way down' });

// Þórdís's farmhouse
intNpc('farm_thordis', { map: 'emberhold_farm_a', name: 'Þórdís', title: 'Farmwife', dname: 'Þórdís the Farmwife', x: 5.5, y: 3.5, dir: 1,
  look: { body: '#6a5a3a', trim: '#c8a060', legs: '#3a3024', skin: '#e0b894', hair: '#b86a3a', robe: true, weapon: 'none', wide: true },
  greet: 'Wipe your feet. Then wipe them again. The byre follows everyone in.',
  intro: ['We walked in from the fields the second winter, with two cows, eleven sheep and a husband. We have the husband left.', 'The byre is swept every day, in case. Böðvarr says it is foolish. Böðvarr sweeps it himself when he thinks I am not looking.'],
  lines: ['The wolves took the cows in the first Ash-winter and the sheep in the second. They took them from a byre with a door on it. Wolves do not open doors. These ones did.',
    'Hallbera out at the old farmstead still grows barley. A whole field of it, east past the gate. The wolves sit at the edge and watch her. They do not touch the barley. It is not barley they want.',
    'Oddný next door bakes. I spin. Hallkell across the lane grows turnips. Between us the Farm Ward eats. Just.'],
  rumor: 'The field-folk say that under the old fields there is a way down' });
intNpc('farm_bodvar', { map: 'emberhold_farm_a', name: 'Böðvarr', title: 'Byre-Man', dname: 'Böðvarr the Byre-Man', x: 13.5, y: 5.5, dir: -1,
  look: { body: '#5a4a3a', trim: '#8a7a5a', legs: '#3a3024', skin: '#c8a080', hair: '#6a4a2a', beard: true, weapon: 'fork', wcol: '#6b4a2a', scale: 1.04 },
  greet: 'Empty stalls. I keep them clean. A man has to keep something.',
  lines: ['That one was Brenna’s stall. That one Kolla’s. I chalked the names over them so I would not forget which was which. Then I forgot why that mattered.',
    'The wolves came in from the east, from the rocks past Grimsfield where the ground goes hollow. There is a den down there. You can smell it on the wind if the wind is wrong.',
    'Haki at the new gate says we could have cows again, if the fields were safe. The fields will be safe when the wolves are fewer. Somebody should see to that.'],
  rumor: 'On a still night I hear it under the fields: a way down' });

// Oddný's farmhouse
intNpc('farm_geirny', { map: 'emberhold_farm_b', name: 'Geirný', title: 'Baker', dname: 'Old Geirný', x: 3.5, y: 3.5, dir: 1,
  look: { body: '#8a6a4a', trim: '#e8d8b0', legs: '#4a3a2a', skin: '#e8c8a8', hair: '#e0e0d8', robe: true, weapon: 'none', scale: 0.88 },
  greet: 'Oddný’s out walking the Ward. I’m in. Somebody has to mind the oven, and the oven does not trust Oddný.',
  intro: ['I am Oddný’s mother. She makes the pies; I make Oddný. Everything she knows about pastry she got from me, and everything she knows about people she got from her father, which is why she is better at pastry.', 'Sit. Eat. You look like the Ash had you for supper and spat you out.'],
  lines: ['The rail is to keep the sheep out of the kitchen. The sheep have not read the rail.',
    'We have two sheep. They are in the byre. You cannot see them because they are hiding. Sheep have learned to hide. Everything left in Midgard has learned to hide.',
    'Grief-bread is the plain loaf. No salt, no butter. You leave it on the step when someone has not come home. I bake one every day. Someone always has not come home.'],
  rumor: 'Gunnar in the fields told me there is a way down' });
intNpc('farm_amundi', { map: 'emberhold_farm_b', name: 'Ámundi', title: 'Farmer', dname: 'Ámundi, Oddný’s husband', x: 15.5, y: 5.0, dir: -1,
  look: { body: '#6a6a4a', trim: '#8a7a4a', legs: '#3a3a2a', skin: '#d8b090', hair: '#8a6a3a', beard: true, weapon: 'fork', wcol: '#6b4a2a' },
  greet: 'Shh. You’ll frighten the sheep. They’re already frightened. It’s their whole personality now.',
  lines: ['I married Oddný for her pies. I stayed for her temper. I would stay for Geirný too, if she ever let me win an argument.',
    'Freyr’s shrine is south of the fields, past the barrow. Someone still leaves bread there. It is Geirný. She thinks nobody knows.',
    'The hares in the fields eat the clover down to the root. The sheep eat what the hares leave. The wolves eat whoever is slowest. It is called a harvest.'],
  rumor: 'The hares know it, and so do I: there is a way down' });

// Hallkell's farm
intNpc('farm_hallkell', { map: 'emberhold_farm_c', name: 'Hallkell', title: 'Farmer', dname: 'Hallkell the Farmer', x: 7.5, y: 7.5, dir: 1,
  look: { body: '#5a6a3a', trim: '#a88a5a', legs: '#34402a', skin: '#d8b090', hair: '#b0a890', beard: true, weapon: 'fork', wcol: '#6b4a2a', scale: 1.0 },
  greet: 'Turnips, hay, and a farmhand who sleeps in both. What can I do for you?',
  lines: ['I built the loft over the byre so the beasts would keep the hay warm. We have no beasts now. The hay is cold, and so is Vébjörn, and he tells me so every morning.',
    'The Mirewell folk live on stilts over the bog, out at Stilt-Home. I thought that was mad. Then the thaw flooded my lower field. I have been looking at stilts.',
    'My father farmed where the East Reach is now, past the new gate. There is a watchtower out there, and a barrow, and a lot of nothing. The nothing is new.'],
  rumor: 'My father’s old fields hide it: a way down' });
intNpc('farm_vebjorn', { map: 'emberhold_farm_c', name: 'Vébjörn', title: 'Farmhand', dname: 'Vébjörn the Farmhand', x: 16.5, y: 3.2, dir: -1,
  look: { body: '#7a6a4a', trim: '#5a4a2a', legs: '#3a3024', skin: '#e0c0a0', hair: '#e0c070', weapon: 'none', scale: 0.94 },
  greet: '<i>He sits up in the hay.</i> I wasn’t sleeping. I was guarding the hay. From above.',
  lines: ['The hay loft is the warmest place in Emberhold after the Last Hearth. It is also the only place Hallkell cannot shout up to without a ladder.',
    'I found a way to see the Skerry beacon from up here, through the gap in the thatch. Skaldhaven is a long way. It is nice to know somebody else keeps a fire going.',
    'Someone keeps leaving the hay-tally with “eat the farmhand” on it. I rub it out. It comes back. I think it is Hallkell. I hope it is Hallkell.'],
  rumor: 'From up here I have seen the smoke from it: a way down' });

// the midwife's house
intNpc('midwife_yrsa', { map: 'emberhold_house_f', name: 'Yrsa', title: 'Midwife', dname: 'Yrsa the Midwife', x: 8.5, y: 3.2, dir: 1,
  look: { body: '#6a4a5a', trim: '#e0c8a0', legs: '#3a2a34', skin: '#f0d8c8', hair: '#8a5a3a', robe: true, head: 'hood', weapon: 'none' },
  greet: 'Quiet, please. There is someone asleep in the back who has only just learned how.',
  intro: ['Yrsa. I bring them in. Hrói sees them out. We try not to meet too often.', 'Forty-one children born in Emberhold since the Ash. I have written every one of them down. The Waystone keeps the dead; somebody has to keep the new.'],
  lines: ['Mirewell moss for the bleeding, willow for the fever, and for the fear, a hand to hold. The last one is hardest to find.',
    'Eira in Mirewell sells me herbs that grow in the Flooded Grotto, down in the dark where the water glows. She says she does not go in herself. I have seen the mud on her boots.',
    'Sister Ingunn blesses the children. I weigh them. Between us we know exactly what they are worth, and it is more than the Ash thinks.',
    'Astrid is on my Roll, though she was not born here. She walked in on her own, carrying a stitched Poring. I wrote her down twice. I think she counts double.'],
  rumor: 'Eira let slip that under the bog there is a way down' });
intNpc('midwife_ljot', { map: 'emberhold_house_f', name: 'Ljót', title: 'New mother', dname: 'Ljót', x: 9.5, y: 8.2, dir: -1,
  look: { body: '#8a7a6a', trim: '#e8e0d0', legs: '#5a4a40', skin: '#f0dcc8', hair: '#3a2a1a', robe: true, weapon: 'none', scale: 0.95 },
  greet: '<i>She rocks the cradle with one foot.</i> He sleeps. Finally. Say something quietly.',
  lines: ['His name is Eldr. Fire. Yrsa says every second child since the Ash has been called something to do with fire. We have not had many ideas lately.',
    'His father is a guard at the new gate. He stands there all night so this one can sleep. When he comes home he sleeps and this one stands, in a way.',
    'I wanted him born somewhere green. Yrsa says Frigg’s Garden on the Bifrost is still green. I told her to bring me a leaf. She laughed. She did not say no.'],
  rumor: 'Hush. The guards say there is a way down' });

// the thatcher's house
intNpc('thatch_alfr', { map: 'emberhold_house_g', name: 'Álfr', title: 'Thatcher', dname: 'Álfr the Thatcher', x: 6.5, y: 2.5, dir: 1,
  look: { body: '#7a6a3a', trim: '#c8a868', legs: '#3a3424', skin: '#d8b090', hair: '#e0c070', beard: true, weapon: 'none', scale: 1.0 },
  greet: 'If you have seen a small boy running very fast, he is mine. If you have not, he is still mine, he is just faster than you.',
  lines: ['Reed from the Mirewell edge, straw from the Ward. A roof that keeps out the Ash is a roof that keeps out the sun too. We gave up on the sun.',
    'Tóki wants to guard the new gate. Haki says he must learn to stand still first. I have been trying to teach him that for seven years. Haki is braver than he looks.',
    'I thatched the lodge the hunters built in the Withered Wood. Ásvör paid me in venison and a warning: do not go round the barrow the wrong way. I did not ask which way was wrong.'],
  rumor: 'Up on a roof you hear everything, even about a way down' });
intNpc('thatch_steinvor', { map: 'emberhold_house_g', name: 'Steinvör', title: 'Thatcher’s wife', dname: 'Steinvör', x: 7.5, y: 5.5, dir: -1,
  look: { body: '#6a5a6a', trim: '#c8b890', legs: '#3a3440', skin: '#f0d8c0', hair: '#c05a2a', robe: true, weapon: 'none', scale: 0.96 },
  greet: 'He’s not here. He’s never here. If you see him, tell him the soup is getting cold. Also that I love him. The soup first.',
  lines: ['Tóki keeps a treasure-box under his bed. I know what is in it. I pretend I do not. It is the only thing in the house I cannot tidy.',
    'He scratched a map on the shelf. A circle for the wolves, a circle for the bats, and an arrow going off the edge. I have not had the heart to sand it off.',
    'The bats are in the old dens under the fields, Tóki says. How he knows, I do not want to know. I want him to be seven for a little longer.'],
  rumor: 'Tóki swears, with his whole face, that there is a way down' });

// the net-shed
intNpc('net_ragna', { map: 'skaldhaven_net_a', name: 'Ragna', title: 'Net-Mender', dname: 'Ragna the Net-Mender', x: 8.5, y: 4.5, dir: 1,
  look: { body: '#4a5a5a', trim: '#a8b8b0', legs: '#2e3434', skin: '#e0c8b0', hair: '#8a7a6a', head: 'hood', weapon: 'none' },
  greet: 'Gyða makes them. I mend them. Between us there is always a net, and never quite a whole one.',
  intro: ['Ragna. Gyða’s sister, older, wiser, worse knees. She walks the Row and I stay in the shed. The nets come to me.', 'That knot on the last peg? A draugr tied it, in a net that came up out of the ice with no fish in it. Nobody can untie it. I have stopped trying. It is a very good knot.'],
  lines: ['Hrafn down in Rimeshore tears our nets fishing for draugr. He says he does not fish for them, they swim into the nets. That is fishing for them.',
    'The Ice Cave in the Singing Berg sings at night. The sealers hear it from their camp. My mother said the sea sang like that the night it froze.',
    'Tar, salt and patience. That is all a net-mender needs. I have plenty of the first two.'],
  rumor: 'The sealers bring back word of a way down' });
intNpc('net_hrafnkell', { map: 'skaldhaven_net_a', name: 'Hrafnkell', title: 'Old fisher', dname: 'Old Hrafnkell', x: 13.5, y: 6.6, dir: -1,
  look: { body: '#3a4a5a', trim: '#6a7a8a', legs: '#2a3440', skin: '#c8a888', hair: '#e8e8e0', beard: true, weapon: 'none', scale: 0.9 },
  greet: '<i>He is tarring a float very slowly.</i> Sit. The sea is not going anywhere. That is the problem.',
  lines: ['Sixty years on the water. The last nine I have spent on a stool, tarring floats for a sea that is ice. The floats do not complain. I complain for them.',
    'The Skerry beacon burns with no keeper. Eyvind rows the oil out. I rowed it before him, and there was a keeper then. He walked into the sea the night it froze. He did not sink.',
    'Bárðr is building a ship at the stocks, the first since the Ash. I will not live to sail in her. I would like to see her float, though. Just once, on real water.'],
  rumor: 'Down on the ice they whisper of a way down' });

// the rope-walk
intNpc('net_solvi', { map: 'skaldhaven_net_b', name: 'Sölvi', title: 'Rope-Maker', dname: 'Sölvi the Rope-Maker', x: 13.5, y: 4.5, dir: -1,
  look: { body: '#5a4a3a', trim: '#a88a5a', legs: '#3a3024', skin: '#d8b090', hair: '#6a4a2a', beard: true, weapon: 'none', wide: true },
  greet: 'Walk backwards. Everyone in here walks backwards. You’ll get the hang of it, or the rope will.',
  intro: ['Sölvi. I make the rope for the Sea-Snake, the Salt Hall’s well, and now Bárðr’s new ship, which will need two hundred fathoms and has paid for none of it.', 'The rope-walk is long because rope is long. There is no deeper wisdom. Kári thinks there is. Let him.'],
  lines: ['Hemp from the south, before the Ash. Now it is bark-fibre, seal-sinew and anything that will twist. Rope is like people. Anything will do if you twist it hard enough.',
    'Salt eats the rope. Ice eats the rope. Draugr, strangely, do not. They like the knots.',
    'Bárðr owes me for two hundred fathoms. Hrefna says he owes her for six thousand nails. We are going to own that ship between us, and neither of us can sail.'],
  rumor: 'The ice-cutters say out past the lagoon there is a way down' });
intNpc('net_kari', { map: 'skaldhaven_net_b', name: 'Kári', title: 'Apprentice', dname: 'Kári the Apprentice', x: 4.5, y: 3.5, dir: 1, route: [[4.5, 3.5], [18.5, 3.5]], pace: 0.7,
  look: { body: '#6a6a5a', trim: '#8a7a5a', legs: '#3a3a30', skin: '#f0d0b0', hair: '#c8a870', weapon: 'none', scale: 0.84 },
  greet: '<i>He is walking backwards, twisting.</i> Can’t stop. If I stop, it untwists. Talk while I walk.',
  lines: ['Sölvi says the rope-walk teaches you patience. I think it teaches you to walk backwards into walls.',
    'I want to sail on Bárðr’s ship when it is finished. I will be the one who knows every rope on it, because I made every rope on it. Well. Sölvi made them. I walked.',
    'Litla, the girl who hides in the Sea-Snake’s hold, comes here sometimes to watch. She says one day she will need a very long rope. She will not say what for.'],
  rumor: 'Litla told me she heard of a way down' });

// the smokehouse
intNpc('smoke_thorunn', { map: 'skaldhaven_smokehouse', name: 'Þórunn', title: 'Smoker', dname: 'Þórunn the Smoker', x: 8.5, y: 2.5, dir: 1,
  look: { body: '#5a4030', trim: '#b88a4a', legs: '#2e2418', skin: '#d8a888', hair: '#6a3a1a', weapon: 'none', wide: true, scale: 1.02 },
  greet: '<i>She waves smoke out of her face. It comes straight back.</i> Shut the door! The fish are shy.',
  intro: ['Þórunn. I keep the smokehouse, which is to say I keep Skaldhaven alive through the winter one split cod at a time.', 'Smoke, not flame. Oak, not pine. Salt first, pray after. If you remember that you can have a job. If you do not, you can have a fish.'],
  lines: ['The fish come in through holes cut in the lagoon ice. Brynja in the Salt Hall organises the cutting. She says the shell-knights are worse every year. I say the fish are smaller. Neither of us is happy.',
    'Bárðr’s crew eat my fish while they build. Six men and a keel. Gyða says I spoil them. I say a man who is going to trust his life to a ship should at least be well fed.',
    'Smoke gets into everything. My hair, my bed, my dreams. I dream in brown. I wake up hungry.'],
  rumor: 'The ice-fishers swear there is a way down' });
intNpc('smoke_bui', { map: 'skaldhaven_smokehouse', name: 'Búi', title: 'Smoker’s boy', dname: 'Búi', x: 6.5, y: 7.2, dir: -1,
  look: { body: '#6a5040', trim: '#a08050', legs: '#3a2e26', skin: '#e8c0a0', hair: '#8a3a1a', weapon: 'none', scale: 0.74 },
  greet: 'I am not eating the good ones. I am checking them. It is a job.',
  lines: ['Mother wrote the rule on the board. I wrote the bit at the bottom. She has not noticed. Do not tell her.',
    'The gulls sit on the roof all day waiting for a fish to fall out. I give them the burnt ones. They do not know the difference. Gulls are like Ormr.',
    'Eyvind says the Skerry beacon has no keeper. I think it does and he is just shy. I would be shy if I lived on a rock.'],
  rumor: 'The gulls told me (they did) there is a way down' });

// the sealer's house
intNpc('seal_hildr', { map: 'skaldhaven_net_c', name: 'Hildr', title: 'Sealer', dname: 'Hildr the Sealer', x: 11.5, y: 3.5, dir: -1,
  look: { body: '#4a5460', trim: '#a8b8c8', legs: '#2e3440', skin: '#e0c8b0', hair: '#e8e0d0', head: 'hood', weapon: 'spear', wcol: '#8a8a8a' },
  greet: 'Kolfinna is my sister. If she sent you, sit. If she did not, sit anyway. It is cold out.',
  intro: ['Hildr. I hunt with Kolfinna in the season and come home to Skaldhaven for the dark months, when the seals are too clever and the ice is too thin.', 'The oil in that lamp is seal. The pelt under you is seal. The rope Sölvi sells has seal in it. We are a town built out of seals, and we are grateful to every one.'],
  lines: ['Our brother went to see why the berg sings. Kolfinna waits for him at the camp. I wait for him here. Between us we have a whole shore of waiting.',
    'The Frozen Reach runs south of the lagoon, a shelf of sea ice you can walk on for a day. The white ice holds. The grey ice lies. Remember that, and you might see the frozen ship.',
    'Njörðr gets a copper ring every spring. The bone one on the end was our brother’s. I put it there when he did not come back. Njörðr can have it. He has everything else.'],
  rumor: 'Out on the white ice they say there is a way down' });
intNpc('seal_orri', { map: 'skaldhaven_net_c', name: 'Orri', title: 'Sealer’s boy', dname: 'Orri', x: 4.5, y: 5.5, dir: 1,
  look: { body: '#5a6470', trim: '#8a9aa8', legs: '#34404a', skin: '#e8d0b8', hair: '#d8d0c0', head: 'hood', weapon: 'none', scale: 0.78 },
  greet: 'Don’t touch the harpoons. They are sharp. I know because I touched them.',
  lines: ['Aunt Kolfinna has a camp on the south shore with a whale-bone arch. You walk under it and Njörðr sees you. I walked under it nine times. He has not said anything yet.',
    'I am going to be a sealer. Mother says I have to learn to be quiet on the ice first. I can be quiet. I am being quiet now. This is quiet.',
    'Uncle went into the singing ice and did not come out. Mother says he is sailing. I asked where. She said somewhere the sea is not frozen. I would like to go there too.'],
  rumor: 'Aunt Kolfinna says past the frozen ship there is a way down' });

/* Errands (round 10): six small quests from the new rooms, each pointing somewhere the world grew. */
quest('farm_clover', { giver: 'farm_geirny', name: 'Clover for Two Sheep', area: 'Ashen Fields', req: { lvl: 3 },
  summary: 'Old Geirný has two sheep, hiding in the byre, and nothing sweet to feed them. The hollow hares in the Ashen Fields hoard clover.',
  offer: ['Two sheep. The last two in the Ward. They will not come out of the straw, and I cannot blame them, but they will not eat either.', 'Clover would do it. Sheep will forgive anything for clover. The hares out in the Ashen Fields eat it all down to the root and carry the rest off. Take it back from them. Eight bunches.'],
  progress: 'Eight bunches of clover, from the hollow hares of the Ashen Fields.',
  done: ['<i>Geirný holds a bunch of clover over the rail. After a long moment, a grey nose comes out of the straw.</i>', 'There. There, you silly thing. <i>She does not look round.</i> Take the apples. And a loaf. Not the grief-bread. The good one.'],
  obj: [{ type: 'collect', item: 'clover', n: 8 }],
  reward: { exp: 450, jexp: 320, zeny: 250, items: [['apple', 5], ['red_potion', 6]] } });
quest('byre_wolves', { giver: 'farm_bodvar', name: 'Empty Stalls', area: 'Ashen Fields', req: { lvl: 10 },
  summary: 'The ash wolves emptied Böðvarr’s byre. He cannot have the beasts back, but he would like the wolves to be fewer before Haki brings new ones through the gate.',
  offer: ['Brenna, Kolla, eleven sheep. The wolves took them through a shut door. I have been sweeping out their stalls for seven years.', 'Haki says there could be cows again, from the east, if the fields were safer. Thin the pack for me. Eight of them. They come up from the den in the rocks, south-east past Grimsfield. Do not go into the den. That is not a byre-man’s errand.'],
  progress: 'Eight ash wolves in the Ashen Fields (their den is in the rocks south-east, past Grimsfield).',
  done: ['<i>Böðvarr takes the chalk and, over the first empty stall, writes a new name.</i>', 'For the next one. There will be a next one, now. Take this: the Ward put it together. And if you do go down into that den, the Den-Mother is Hallbera’s errand, not mine. Ask her.'],
  obj: [{ type: 'kill', mob: 'ash_wolf', n: 8 }],
  reward: { exp: 2600, jexp: 1900, zeny: 800, items: [['orange_potion', 4], ['fly_wing', 2]], rep: { emberhold: 1 } } });
quest('hroi_barrow', { giver: 'grave_hroi', name: 'The Nameless Kings', area: 'Withered Wood · the Old Barrow', req: { lvl: 18, test: () => !!P.flags.talked.grave_hroi },
  summary: 'Hrói wants to know who lies in the Old Barrow under the Withered Wood, so Álöf can carve their names in the chapel yard. The oldest chamber has carvings nobody has read in centuries.',
  offer: ['The Old Barrow under the Withered Wood. Kings, they say, and their men, buried with their swords before anyone wrote names down.', 'Nobody mourns them because nobody knows who they were. There is a side chamber past the first hall, north and to the east. Hunters say the walls are carved. Read the names for me. Álöf will cut them into a stone in the yard, and then they will be ours to keep.'],
  progress: 'The carved chamber in the Old Barrow (the Withered Wood), north-east of the first hall. Then back to Hrói.',
  done: ['<i>You tell him the names. Hrói writes each one down slowly in his square hand. Álöf, from the back room, is already carving.</i>', 'Kings and ferrymen and a cook. Good. A cook deserves a stone as much as a king. More. Take this for the walk, and my thanks for theirs.'],
  obj: [{ type: 'inspect', map: 'withered_wood_cave_barrow', place: 'the carved chamber', r: 2.2, spots: [{ x: 33.5, y: 19.5, name: 'The carved chamber', text: ['<i>Names cut into the rock, worn almost smooth. You trace them with your fingers: Hrothgar; Eyvindr the Ferryman; Sváfa, who cooked for the king and was buried beside him.</i>', '<i>At the end, freshly scratched under the old names in a hunter’s hand: “Leif. We will come back for you.”</i>'] }] }],
  reward: { exp: 11000, jexp: 8200, zeny: 2200, items: [['yellow_potion', 4]], lore: 'yard_roll' } });
quest('grani_wisps', { giver: 'row_grani', name: 'A Lamp That Never Goes Out', area: 'Mirewell · the Flooded Grotto', req: { lvl: 38, test: () => !!P.flags.talked.row_grani },
  summary: 'Grani the lamp-maker wants to put a wisp’s cold flame in a lamp, so Emberhold’s lamps burn when the oil carts do not come.',
  offer: ['The wisps of Mirewell burn cold and never go out. A lamp with a wisp-flame in it would never need oil. Think of the winters when the carts do not come. Think of Bersi.', 'Six flames, if you can carry them. The wisps float over the bog, and more of them in the Flooded Grotto, under the black water. Mind your fingers. Cold flames still bite.'],
  progress: 'Six Wisp Flames from the wisps of Mirewell or the Flooded Grotto.',
  done: ['<i>Grani drops a wisp-flame into a horn lantern and shuts the door on it. It burns: green, cold and perfectly steady. He stares at it for a long time.</i>', 'It does not whisper. It does not flicker. It does not need anything. <i>He sounds almost disappointed.</i> Bersi will have to find something else to worry about. Here. You have earned a light of your own.'],
  obj: [{ type: 'collect', item: 'wisp_flame', n: 6 }],
  reward: { exp: 64000, jexp: 48000, zeny: 5500, items: [['white_potion', 3], ['blue_potion', 3]] } });
quest('solvi_jelly', { giver: 'net_solvi', name: 'Rime-Glue', area: 'Rimeshore · the Ice Cave', req: { lvl: 28, test: () => !!P.flags.talked.net_solvi },
  summary: 'Sölvi boils the jelly of rime porings into a glue that keeps rope from rotting in the salt. Bárðr’s ship needs two hundred fathoms of it.',
  offer: ['Salt eats rope. Rime-glue stops it: the jelly of the frost porings, boiled down and painted on. It stinks worse than Þórunn’s smokehouse and it works better than anything.', 'Six jellies. The porings roll about on the Rimeshore ice, and there are more in the Ice Cave in the Singing Berg. It is for Bárðr’s ship. Bárðr will pay you. Bárðr will pay everyone, one day.'],
  progress: 'Six Frost Jellies, from the rime porings of Rimeshore or the Ice Cave.',
  done: ['<i>Sölvi drops the jellies into a pot. The smell is immediate and total. Kári walks backwards out of the door.</i>', 'That is the smell of a rope that will outlive us all. Here: from me, not from Bárðr. I have stopped waiting for Bárðr.'],
  obj: [{ type: 'collect', item: 'frost_jelly', n: 6 }],
  reward: { exp: 26000, jexp: 19000, zeny: 3200, items: [['yellow_potion', 5], ['fly_wing', 3]], rep: { rimeshore: 1 } } });
quest('smoke_fish', { giver: 'smoke_thorunn', name: 'Fish for the Keel', area: 'Skaldhaven · Bárðr’s shipyard', req: { lvl: 26, test: () => !!P.flags.talked.smoke_thorunn },
  summary: 'Þórunn’s smoked fish feed Bárðr’s shipwrights. Búi usually carries it, and Búi usually arrives with less than he left with.',
  offer: ['Bárðr’s crew get a bundle of fish every day. Búi carries it. Búi arrives at the shipyard with a very full stomach and a very small bundle.', 'Take today’s to Bárðr at the stocks, south past the Row. Straight there. Do not let Búi walk with you.'],
  progress: 'Take the smoked fish to Bárðr the Shipwright at the shipyard, then come back to Þórunn.',
  done: ['A whole bundle? He counted? <i>She glares at Búi, who is suddenly very interested in a barrel.</i>', 'Good. The keel eats wood and the men eat fish, and between the two of them there might be a ship by spring. Here. Your share, and do not tell Búi.'],
  give: [['smoked_fish', 1]],
  obj: [{ type: 'deliver', item: 'smoked_fish', n: 1, npc: 'bardr', text: 'Bring the smoked fish to Bárðr at the shipyard (Skaldhaven)' }],
  reward: { exp: 18000, jexp: 13000, zeny: 1800, items: [['yellow_potion', 3], ['skald_ale', 1]], lore: 'smoker_rule' } });

/* ---------- Rumours (Ketill): the new rooms ---------- */
RUMORS.push(
  { id: 'i_rowlamps', when: () => P.lvl >= 36 && !P.quests.done.grani_wisps, text: 'Grani the lamp-maker on Emberhold’s Smiths’ Row wants to put a wisp in a lantern. A green light that never goes out. I have seen men like that before. Usually they end up in the bog.' },
  { id: 'i_smoke', when: () => P.lvl >= 24 && !P.flags.talked.smoke_thorunn, text: 'Follow your nose down Netmakers’ Row to the smokehouse. Þórunn keeps the whole town fed and nobody thanks her, because nobody can get close enough for the smell.' },
  { id: 'i_farms', when: () => P.lvl >= 8 && !P.quests.done.byre_wolves, text: 'The farmers in Emberhold’s new ward have byres and no beasts. The wolves saw to that. Böðvarr keeps sweeping the stalls. Somebody should give the man a reason.' },
  { id: 'i_yard', when: () => P.lvl >= 18 && !P.quests.done.hroi_barrow, text: 'Emberhold’s gravedigger wants names for the kings in the Old Barrow. Imagine being dead a thousand years and still on somebody’s list.' },
);
