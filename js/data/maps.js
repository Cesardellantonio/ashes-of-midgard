'use strict';
/* =========================================================
   Data: maps
   Loaded before js/core.js. genMap() in core.js builds a map in four steps:
     1. base terrain for the generator type `gen`
        town    - border walls
        field   - noise-scattered trees/rocks (+ `ruins` chance), deco tufts
        dungeon - solid wall (layout carves rooms)
        arena   - solid lava (layout clears the floor)
     2. `layout(m, K)` - the map's own layout: entry, waystone, boss spot, warps,
        houses, braziers, objects. K = { set, clearC, clearR, carve, rng, T, w, h, d }.
        Always use K.rng() (seeded) for anything that shapes the terrain.
     3. NPCs whose NPCS[id].map is this map (js/data/npcs.js) and bounty boards
        (BOARDS in js/data/quests.js) are placed.
     4. generic post-processing: unreachable pockets sealed, heights, minimap.
   Required per map: name, sub, w, h, seed, gen, ground, void, dark, part, look,
   spawns ([[mobKey, count]...]), and a layout that sets m.entry (and m.way for
   a Waystone). Render look per map can be refined in js/gfx-world.js.
   ========================================================= */
const T = { FLOOR: 0, WALL: 1, TREE: 2, ROCK: 3, LAVA: 4, PILLAR: 5, RUIN: 6, GRAVE: 7, WAY: 8, HEART: 9 };

const MAPDEFS = {
  emberhold: { name: 'Emberhold', sub: 'The Last Waystone', w: 36, h: 36, seed: 11, gen: 'town', ground: ['#3b342e', '#403831', '#36302a', '#443c34'], void: '#0d0b0a', dark: 0.40, part: 'petal', spawns: [], safe: true,
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
  ashen_fields: { name: 'Ashen Fields', sub: 'Base Lv 1 – 12', w: 64, h: 64, seed: 23, gen: 'field', trees: 0.045, rocks: 0.035, ruins: 0.004, ground: ['#4a4436', '#4f4838', '#443f32', '#554c3a'], void: '#0d0c09', dark: 0.48, part: 'ash', treeKind: 'dead',
    look: { floor: 'grass', g1: [90, 142, 52], g2: [140, 184, 74], path: [170, 140, 96], ash: [134, 130, 122], ashAmt: 0.35, grain: 24, flowers: 0.3, trees: ['green', 'autumn', 'dead'], rock: 0x9c968c, tint: [1, 1, 1], fog: 0xd2dccf, fogN: 55, fogF: 125, hemi: [0xf4fbff, 0x5a6a40, 0.64], sun: [0xfff6e0, 0.5], torch: 0 },
    spawns: [['blight_poring', 16], ['ash_grub', 10], ['hollow_hare', 10], ['cinder_drop', 8], ['scarecrow_husk', 7]], boss: 'blight_mother',
    layout(m, K) {
      const { carve, clearC } = K;
      m.entry = { x: 3, y: 32 }; m.way = { x: 7.5, y: 29.5 }; m.bossPos = { x: 50.5, y: 11.5 };
      carve(2, 32, 61, 32, 2); carve(8, 30, 50, 12, 1); clearC(50, 11, 7); clearC(7, 29, 3);
      carve(30, 32, 20, 52, 1); carve(40, 32, 52, 50, 1);
      m.warps.push({ x: 1, y: 32, to: 'emberhold', tx: 32.5, ty: 18.5, label: 'Emberhold' });
      m.warps.push({ x: 62, y: 32, to: 'withered_wood', tx: 3.5, ty: 32.5, label: 'Withered Wood' });
    } },
  withered_wood: { name: 'Withered Wood', sub: 'Base Lv 10 – 22', w: 64, h: 64, seed: 37, gen: 'field', trees: 0.16, rocks: 0.02, ground: ['#2f3528', '#343a2b', '#2a3024', '#383d2c'], void: '#080a07', dark: 0.66, part: 'leaf', treeKind: 'wood',
    look: { floor: 'grass', g1: [50, 88, 36], g2: [86, 126, 50], path: [120, 94, 62], ash: [90, 90, 80], ashAmt: 0.12, grain: 22, flowers: 0.06, trees: ['forest', 'forest', 'forest2'], rock: 0x7e7a70, tint: [0.9, 0.95, 0.9], fog: 0x5e7654, fogN: 45, fogF: 110, hemi: [0xd4e8cc, 0x2a3a20, 0.58], sun: [0xfff4d0, 0.42], torch: 0 },
    spawns: [['thorn_willow', 10], ['mourning_spore', 10], ['ash_wolf', 10], ['rotwood_kobold', 8], ['kobold_archer', 6]], boss: 'hati',
    layout(m, K) {
      const { carve, clearC } = K;
      m.entry = { x: 3, y: 32 }; m.way = { x: 7.5, y: 34.5 }; m.bossPos = { x: 48.5, y: 48.5 };
      carve(2, 32, 32, 3, 2); carve(8, 34, 48, 48, 1); clearC(48, 48, 7); clearC(7, 34, 3); carve(20, 20, 55, 12, 1); carve(15, 50, 32, 40, 1);
      m.warps.push({ x: 1, y: 32, to: 'ashen_fields', tx: 60.5, ty: 32.5, label: 'Ashen Fields' });
      m.warps.push({ x: 32, y: 1, to: 'gloamheim', tx: 30.5, ty: 55.5, label: 'Gloamheim Keep' });
    } },
  gloamheim: { name: 'Gloamheim Keep', sub: 'Base Lv 20 – 34', w: 60, h: 60, seed: 51, gen: 'dungeon', ground: ['#34323a', '#393640', '#2f2d34', '#3c3842'], wall: ['#57525e', '#403b47', '#2e2a34'], void: '#060507', dark: 0.84, part: 'dust',
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
    } },
  throne: { name: 'Throne of Cinders', sub: 'Where the Roots Burned', w: 30, h: 30, seed: 67, gen: 'arena', ground: ['#3a2622', '#402a24', '#35221e', '#46302a'], void: '#120604', dark: 0.5, part: 'ember', spawns: [], boss: 'ashen_king',
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
      m.braziers.push({ x: 11, y: 22 }, { x: 20, y: 22 });
    } },
};
