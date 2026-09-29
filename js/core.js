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

/* =========================================================
   Data: elements, classes, skills
   ========================================================= */
const ELEM_TABLE = {
  neutral: { ghost: 0.5 },
  fire: { earth: 1.5, undead: 1.5, fire: 0.25, water: 0.5 },
  water: { fire: 1.5, water: 0.25, wind: 0.5 },
  earth: { wind: 1.5, earth: 0.25, fire: 0.5 },
  wind: { water: 1.5, wind: 0.25, earth: 0.5 },
  holy: { shadow: 1.5, undead: 2, holy: 0 },
  shadow: { holy: 1.5, shadow: 0, undead: 0.5 },
  ghost: { ghost: 1.5, neutral: 0.75 },
};
const elemMod = (a, d) => (ELEM_TABLE[a] && ELEM_TABLE[a][d] !== undefined) ? ELEM_TABLE[a][d] : 1;
const ELCOL = { neutral: '#a89a88', fire: '#e0582a', water: '#4aa0e0', wind: '#d8cf5a', earth: '#9a7442', holy: '#efe0a0', ghost: '#9a7ad8', shadow: '#7a55a0', undead: '#8a9a7a' };

const ALLJ = ['novice', 'swordsman', 'mage', 'archer', 'acolyte'];
const CLASSES = {
  novice: { name: 'Novice', hp: [5, 0.10], sp: 1, maxJob: 10, skills: ['basic', 'first_aid'], look: { body: '#c09a64', trim: '#7a5230', legs: '#5a4430' } },
  swordsman: { name: 'Swordsman', hp: [7, 0.35], sp: 2, maxJob: 40, skills: ['sword_mastery', 'bash', 'magnum', 'endure', 'hp_recovery'], look: { body: '#7a98c8', trim: '#d0a840', legs: '#3a4460', cape: '#2a4a9a' }, starter: 'sword',
    blurb: 'Steel and stubbornness. The highest health of the four paths, with Bash for single foes and Magnum Break for crowds. Favors STR, VIT and a little DEX.' },
  mage: { name: 'Mage', hp: [5, 0.12], sp: 6, maxJob: 40, skills: ['fire_bolt', 'cold_bolt', 'lightning_bolt', 'soul_strike', 'frost_diver', 'thunderstorm', 'sp_recovery'], look: { body: '#7440b0', trim: '#e8c860', legs: '#3a2458', robe: true, hat: 'witch' }, starter: 'rod',
    blurb: 'Bolts of fire, frost and lightning chosen to match the foe’s element. Fragile, slow to cast, devastating. Favors INT and DEX.' },
  archer: { name: 'Archer', hp: [5.5, 0.18], sp: 2.5, maxJob: 40, skills: ['owls_eye', 'vultures_eye', 'double_strafe', 'arrow_shower', 'concentration'], look: { body: '#5e9a3e', trim: '#c89a50', legs: '#5a4028', hat: 'feather' }, starter: 'bow',
    blurb: 'Kills from range before the Ash can close in. Bows scale with DEX instead of STR. Favors DEX and AGI.' },
  acolyte: { name: 'Acolyte', hp: [6, 0.22], sp: 5, maxJob: 40, skills: ['heal', 'blessing', 'inc_agi', 'holy_light', 'divine_protection', 'demon_bane'], look: { body: '#2e3050', trim: '#f0eef8', legs: '#1e2034', robe: true, hat: 'biretta' }, starter: 'club',
    blurb: 'Keeps a failing god’s light. Heals itself, blesses its own arm, and burns the undead with Heal. Favors INT, VIT and STR.' },
};

function healAmt(lv) { return Math.max(1, Math.floor((P.lvl + S.int) / 8)) * (4 + 8 * lv); }
const SKILLS = {
  basic: { name: 'Basic Skill', max: 9, passive: true, rune: 'ᛗ', el: 'neutral', desc: () => 'What every Unkindled must learn again. Lv 3 lets you sit (X) to recover twice as fast. Lv 9 is required to take a job.' },
  first_aid: { name: 'First Aid', max: 1, rune: 'ᛒ', el: 'holy', tgt: 'self', sp: () => 3, cd: 1, desc: () => 'Bind your wounds. Restores 5 HP plus 3% of Max HP.', use() { healP(5 + S.maxhp * 0.03); } },
  sword_mastery: { name: 'Sword Mastery', max: 10, passive: true, rune: 'ᛏ', el: 'neutral', desc: lv => `+${lv * 4} ATK while wielding a dagger or sword.` },
  bash: { name: 'Bash', max: 10, rune: 'ᚦ', el: 'neutral', tgt: 'enemy', range: 'weapon', sp: lv => lv < 6 ? 8 : 15, cd: 0.35, desc: lv => `A crushing blow for ${100 + 30 * lv}% ATK with +${lv * 5} HIT.`,
    use(lv, t) { P.atkAnim = 0; after(0.12, () => { if (!t.dead) { physHit(t, 1 + 0.3 * lv, { hit: lv * 5 }); burst(t.x, t.y, 24, '#ffd27a', 10, 2.5); } }); } },
  magnum: { name: 'Magnum Break', max: 10, rune: 'ᚲ', el: 'fire', tgt: 'self', sp: () => 30, cd: 2, desc: lv => `Erupt in flame: ${100 + 20 * lv}% fire ATK to every enemy within 2.5 cells, knocking them back.`,
    use(lv) { ring(P.x, P.y, 2.5, '#ff7a2a'); burst(P.x, P.y, 6, '#ff8a3a', 30, 4); for (const m of mobsNear(P.x, P.y, 2.5)) physHit(m, 1 + 0.2 * lv, { elem: 'fire', sure: true, knock: 2, from: { x: P.x, y: P.y } }); Sfx.fire(); } },
  endure: { name: 'Endure', max: 10, rune: 'ᛉ', el: 'earth', tgt: 'self', sp: () => 10, cd: 10, desc: lv => `Brace for ${7 + lv * 3}s: +${lv * 2} DEF and +${lv} MDEF.`,
    use(lv) { addBuff('endure', 'Endure', 'endure', 7 + lv * 3, { def: lv * 2, mdef: lv }); burst(P.x, P.y, 20, '#e8c07a', 14, 1.6); } },
  hp_recovery: { name: 'Increase HP Recovery', max: 10, passive: true, rune: 'ᚢ', el: 'earth', desc: lv => `+${lv * 5} HP and +${(lv * 0.2).toFixed(1)}% Max HP on each regeneration tick.` },
  fire_bolt: { name: 'Fire Bolt', max: 10, rune: 'ᚲ', el: 'fire', tgt: 'enemy', range: 9, sp: lv => 10 + 2 * lv, cast: lv => 0.35 + 0.28 * lv, cd: 0.5, desc: lv => `Hurl ${lv} bolt${lv > 1 ? 's' : ''} of fire, each 100% fire MATK.`, use(lv, t) { bolts(t, lv, 'fire', 1); } },
  cold_bolt: { name: 'Cold Bolt', max: 10, rune: 'ᛁ', el: 'water', tgt: 'enemy', range: 9, sp: lv => 10 + 2 * lv, cast: lv => 0.35 + 0.28 * lv, cd: 0.5, desc: lv => `Hurl ${lv} shard${lv > 1 ? 's' : ''} of ice, each 100% water MATK.`, use(lv, t) { bolts(t, lv, 'water', 1); } },
  lightning_bolt: { name: 'Lightning Bolt', max: 10, rune: 'ᛊ', el: 'wind', tgt: 'enemy', range: 9, sp: lv => 10 + 2 * lv, cast: lv => 0.35 + 0.28 * lv, cd: 0.5, desc: lv => `Call ${lv} lightning strike${lv > 1 ? 's' : ''} on the target, each 100% wind MATK.`, use(lv, t) { bolts(t, lv, 'wind', 1); } },
  soul_strike: { name: 'Soul Strike', max: 10, rune: 'ᛟ', el: 'ghost', tgt: 'enemy', range: 9, sp: lv => 14 + 2 * lv, cast: () => 0.5, cd: 0.7, desc: lv => `Loose ${Math.ceil(lv / 2)} spirit sphere${lv > 2 ? 's' : ''}, each 100% ghost MATK, +${lv * 5}% against the undead.`, use(lv, t) { bolts(t, Math.ceil(lv / 2), 'ghost', 1, { undeadBonus: lv * 0.05 }); } },
  frost_diver: { name: 'Frost Diver', max: 10, rune: 'ᚾ', el: 'water', tgt: 'enemy', range: 9, sp: lv => 25 - lv, cast: () => 0.8, cd: 1, desc: lv => `${100 + 10 * lv}% water MATK with a ${35 + 3 * lv}% chance to freeze the target for ${(3 + lv * 0.3).toFixed(1)}s. Bosses and undead resist.`,
    use(lv, t) { shot(P, t, 'ice', () => { magicHit(t, 1 + 0.1 * lv, 'water'); if (!t.dead && !t.d.boss && t.d.elem !== 'undead' && Math.random() * 100 < 35 + 3 * lv) { t.frozen = 3 + lv * 0.3; t.path = null; floatText(t, 'Frozen', 'info'); } }); } },
  thunderstorm: { name: 'Thunderstorm', max: 10, rune: 'ᚺ', el: 'wind', tgt: 'ground', range: 9, sp: lv => 22 + 4 * lv, cast: lv => 0.9 + lv * 0.2, cd: 1.2, desc: lv => `Call ${lv} lightning strike${lv > 1 ? 's' : ''} down on an area (2.5 cells). Each hits every enemy inside for 80% wind MATK.`,
    use(lv, t, pos) { for (let i = 0; i < lv; i++) after(i * 0.2, () => { strike(pos.x + rand(-1.2, 1.2), pos.y + rand(-1.2, 1.2)); for (const m of mobsNear(pos.x, pos.y, 2.5)) magicHit(m, 0.8, 'wind'); }); } },
  sp_recovery: { name: 'Increase SP Recovery', max: 10, passive: true, rune: 'ᛃ', el: 'water', desc: lv => `+${lv * 3} SP on each regeneration tick.` },
  owls_eye: { name: 'Owl’s Eye', max: 10, passive: true, rune: 'ᛞ', el: 'wind', desc: lv => `+${lv} DEX.` },
  vultures_eye: { name: 'Vulture’s Eye', max: 10, passive: true, rune: 'ᛇ', el: 'wind', desc: lv => `+${(lv * 0.5).toFixed(1)} cells of bow range and +${lv} HIT.` },
  double_strafe: { name: 'Double Strafe', max: 10, rune: 'ᚱ', el: 'neutral', tgt: 'enemy', range: 'weapon', sp: () => 12, cd: 0.35, desc: lv => `Loose two arrows at once, each ${100 + 10 * lv}% ATK.`,
    use(lv, t) { P.atkAnim = 0; shot(P, t, 'arrow', () => physHit(t, 1 + 0.1 * lv)); after(0.1, () => { if (!t.dead) shot(P, t, 'arrow', () => physHit(t, 1 + 0.1 * lv)); }); Sfx.bow(); } },
  arrow_shower: { name: 'Arrow Shower', max: 10, rune: 'ᛜ', el: 'neutral', tgt: 'ground', range: 'weapon', sp: () => 15, cd: 0.7, desc: lv => `Rain arrows on an area (2 cells) for ${80 + 5 * lv}% ATK, pushing enemies back.`,
    use(lv, t, pos) { P.atkAnim = 0; fxs.push({ k: 'rain', x: pos.x, y: pos.y, t: 0, dur: 0.4 }); Sfx.bow(); after(0.3, () => { for (const m of mobsNear(pos.x, pos.y, 2)) physHit(m, 0.8 + 0.05 * lv, { knock: 2, from: { x: pos.x, y: pos.y } }); }); } },
  concentration: { name: 'Improve Concentration', max: 10, rune: 'ᚨ', el: 'wind', tgt: 'self', sp: lv => 20 + 5 * lv, cd: 3, desc: lv => `For ${40 + 20 * lv}s: +${2 + lv} AGI and +${2 + lv} DEX.`,
    use(lv) { addBuff('conc', 'Concentration', 'concentration', 40 + 20 * lv, { agi: 2 + lv, dex: 2 + lv }); burst(P.x, P.y, 20, '#cfe07a', 16, 1.8); } },
  heal: { name: 'Heal', max: 10, rune: 'ᛒ', el: 'holy', tgt: 'heal', range: 9, sp: lv => 10 + 3 * lv, cd: 0.4, desc: lv => `Restore ${P && S ? healAmt(lv) : '?'} HP. Cast on an undead enemy to burn it for half that as holy damage.`,
    use(lv, t) { const a = healAmt(lv); if (t && t.kind === 'mob') { const dmg = Math.round(a * 0.5 * elemMod('holy', mobElem(t))); pillar(t, '#fff2b8'); aggro(t); finishHit(t, dmg, false, {}); } else { healP(a); pillar(P, '#bff0b0'); } Sfx.heal(); } },
  blessing: { name: 'Blessing', max: 10, rune: 'ᚷ', el: 'holy', tgt: 'self', sp: lv => 24 + 4 * lv, cd: 2, desc: lv => `For ${40 + 20 * lv}s: +${lv} STR, DEX and INT.`,
    use(lv) { addBuff('bless', 'Blessing', 'blessing', 40 + 20 * lv, { str: lv, dex: lv, int: lv }); pillar(P, '#f5e6a0'); Sfx.heal(); } },
  inc_agi: { name: 'Increase AGI', max: 10, rune: 'ᛖ', el: 'holy', tgt: 'self', sp: lv => 18 + 3 * lv, cd: 2, desc: lv => `For ${40 + 20 * lv}s: +${2 + lv} AGI and 25% movement speed.`,
    use(lv) { addBuff('agi', 'Increase AGI', 'inc_agi', 40 + 20 * lv, { agi: 2 + lv, move: 25 }); pillar(P, '#bfe8ff'); Sfx.heal(); } },
  holy_light: { name: 'Holy Light', max: 5, rune: 'ᛊ', el: 'holy', tgt: 'enemy', range: 9, sp: () => 15, cast: () => 0.9, cd: 0.5, desc: lv => `A lance of light for ${125 + 25 * lv}% holy MATK.`, use(lv, t) { shot(P, t, 'holy', () => magicHit(t, 1.25 + 0.25 * lv, 'holy')); } },
  divine_protection: { name: 'Divine Protection', max: 10, passive: true, rune: 'ᛉ', el: 'holy', desc: lv => `Take ${lv * 3} less damage from each undead or demon attack.` },
  demon_bane: { name: 'Demon Bane', max: 10, passive: true, rune: 'ᛏ', el: 'holy', desc: lv => `+${lv * 3} ATK against undead and demons.` },
};

/* =========================================================
   Data: monsters
   ========================================================= */
const MOBS = {
  blight_poring: { name: 'Blight Poring', lvl: 1, hp: 55, atk: [6, 9], def: 0, mdef: 0, elem: 'water', race: 'plant', speed: 1.9, aspd: 1.7, range: 1.3, spr: 'blob', col: '#f29db2', size: 1, spots: true, drops: [['jellopy', .6], ['apple', .12], ['red_potion', .06]] },
  ash_grub: { name: 'Ash Grub', lvl: 2, hp: 72, atk: [7, 11], def: 2, mdef: 0, elem: 'earth', race: 'insect', speed: 1.3, aspd: 1.8, range: 1.3, spr: 'grub', col: '#9cc24a', size: 1, drops: [['fluff', .55], ['red_potion', .06]] },
  hollow_hare: { name: 'Hollow Hare', lvl: 3, hp: 86, atk: [9, 13], def: 0, mdef: 0, elem: 'neutral', race: 'brute', speed: 2.6, aspd: 1.5, range: 1.3, spr: 'hare', col: '#f2eee6', size: 1, drops: [['clover', .45], ['apple', .12], ['red_potion', .08]] },
  cinder_drop: { name: 'Cinder Drop', lvl: 5, hp: 135, atk: [12, 17], def: 3, mdef: 5, elem: 'fire', race: 'plant', speed: 1.9, aspd: 1.6, range: 1.3, spr: 'blob', col: '#ff9440', size: .95, glow: '#ff9a4a', eye: '#fff0b0', drops: [['jellopy', .5], ['orange_potion', .04]] },
  scarecrow_husk: { name: 'Scarecrow Husk', lvl: 7, hp: 235, atk: [16, 22], def: 5, mdef: 0, elem: 'earth', race: 'demihuman', aggro: true, sight: 6, speed: 2.3, aspd: 1.5, range: 1.5, spr: 'human', look: { body: '#7a5a33', trim: '#4a3a24', legs: '#4a3a24', skin: '#b89a6a', head: 'sack', weapon: 'fork', wcol: '#6b4a2a', eye: '#ff8a3a' }, drops: [['burlap', .5], ['red_potion', .12], ['fly_wing', .05]] },
  blight_mother: { name: 'Blight Mother', title: 'Shardbearer of the Fields', lvl: 12, hp: 3400, atk: [34, 48], def: 8, mdef: 10, elem: 'water', race: 'plant', boss: true, aggro: true, sight: 7, speed: 1.8, aspd: 1.7, range: 2.6, spr: 'blob', col: '#f07aa0', size: 3, crown: true, eye: '#ffd24a', expMul: 14, shard: 'shard_blood',
    abil: [{ id: 'summon', cd: 12, mob: 'blight_poring', n: 3, max: 6 }, { id: 'slam', cd: 6.5, r: 3.2, mul: 1.6, delay: 1.3 }],
    intro: 'The jelly-thing heaves. A hundred small mouths open in its skin, and every one of them is singing a lullaby.' },

  thorn_willow: { name: 'Thorn Willow', lvl: 9, hp: 340, atk: [18, 25], def: 10, mdef: 5, elem: 'earth', race: 'plant', speed: 1.1, aspd: 1.8, range: 1.6, spr: 'tree', col: '#8a6a44', size: 1, drops: [['tree_root', .5], ['orange_potion', .06]] },
  mourning_spore: { name: 'Mourning Spore', lvl: 11, hp: 400, atk: [22, 28], def: 6, mdef: 8, elem: 'earth', race: 'plant', speed: 1.6, aspd: 1.6, range: 1.3, spr: 'shroom', col: '#c0604e', size: 1, drops: [['spore', .5], ['blue_potion', .03]] },
  ash_wolf: { name: 'Ash Wolf', lvl: 13, hp: 540, atk: [27, 35], def: 8, mdef: 0, elem: 'earth', race: 'brute', aggro: true, sight: 7, speed: 3.6, aspd: 1.3, range: 1.4, spr: 'wolf', col: '#8e8984', size: 1, eye: '#ffb84a', drops: [['wolf_claw', .45], ['wolf_pelt', .15], ['orange_potion', .08]] },
  kobold_archer: { name: 'Kobold Archer', lvl: 14, hp: 500, atk: [29, 37], def: 6, mdef: 5, elem: 'earth', race: 'demihuman', aggro: true, sight: 8, speed: 2.4, aspd: 1.8, range: 6, ranged: true, spr: 'human', look: { body: '#4f4630', trim: '#7a5a2a', legs: '#3a3322', skin: '#7c7a4a', head: 'kobold', weapon: 'bow', wcol: '#6b4a2a', eye: '#e6d04a' }, drops: [['kobold_hair', .4], ['blue_potion', .03]] },
  rotwood_kobold: { name: 'Rotwood Kobold', lvl: 15, hp: 720, atk: [34, 44], def: 12, mdef: 3, elem: 'wind', race: 'demihuman', aggro: true, sight: 7, speed: 2.6, aspd: 1.4, range: 1.5, spr: 'human', look: { body: '#5a4a33', trim: '#3a2a1a', legs: '#2e281e', skin: '#6f7c4a', head: 'kobold', weapon: 'mace', wcol: '#777', eye: '#e6d04a' }, drops: [['kobold_hair', .45], ['orange_potion', .1], ['fly_wing', .05]] },
  hati: { name: 'Hati', title: 'The Moon-Eater', lvl: 22, hp: 13500, atk: [78, 102], def: 18, mdef: 15, elem: 'shadow', race: 'brute', boss: true, aggro: true, sight: 8, speed: 4, aspd: 1.2, range: 2.4, spr: 'wolf', col: '#eef2fa', size: 2.5, eye: '#9fd4ff', glow: '#9fc8ff', expMul: 14, shard: 'shard_moon',
    abil: [{ id: 'leap', cd: 7.5, r: 2.2, mul: 1.7, delay: 1.1 }, { id: 'summon', cd: 16, mob: 'ash_wolf', n: 2, max: 4 }, { id: 'nova', cd: 13, r: 4.6, mul: 1.5, delay: 1.7 }],
    intro: 'For ten thousand years it chased the moon across the sky. When the sky burned, it finally caught it. There is moonlight in its throat.' },

  skeleton_soldier: { name: 'Skeleton Soldier', lvl: 20, hp: 1300, atk: [52, 66], def: 20, mdef: 5, elem: 'undead', race: 'undead', aggro: true, sight: 7, speed: 2.4, aspd: 1.4, range: 1.5, spr: 'human', look: { body: '#d9d0bb', trim: '#6a5a4a', legs: '#d9d0bb', skin: '#d9d0bb', head: 'skull', ribs: true, weapon: 'sword', wcol: '#8a8a8a', eye: '#ff4a3a' }, drops: [['bone_shard', .5], ['orange_potion', .1], ['yellow_potion', .04]] },
  grave_archer: { name: 'Grave Archer', lvl: 22, hp: 1000, atk: [56, 70], def: 14, mdef: 8, elem: 'undead', race: 'undead', aggro: true, sight: 9, speed: 2.2, aspd: 1.8, range: 7, ranged: true, spr: 'human', look: { body: '#cfc6b0', trim: '#3a2e26', legs: '#cfc6b0', skin: '#cfc6b0', head: 'skull', ribs: true, weapon: 'bow', wcol: '#5a4a3a', eye: '#7fe0ff' }, drops: [['bone_shard', .45], ['blue_potion', .05]] },
  wraith: { name: 'Wraith', lvl: 24, hp: 1150, atk: [60, 78], def: 0, mdef: 30, elem: 'ghost', race: 'undead', aggro: true, sight: 7, speed: 2.8, aspd: 1.5, range: 1.5, flee: 20, spr: 'ghost', col: '#d4e2f2', size: 1, glow: '#8fb4ff', drops: [['ectoplasm', .5], ['blue_potion', .06]] },
  rust_knight: { name: 'Rust Knight', lvl: 28, hp: 2600, atk: [86, 108], def: 32, mdef: 12, elem: 'shadow', race: 'demon', aggro: true, sight: 7, speed: 2.2, aspd: 1.5, range: 1.6, spr: 'human', look: { body: '#6a5d55', trim: '#8a4a2a', legs: '#4a4038', skin: '#6a5d55', head: 'helm', weapon: 'sword', wcol: '#9a8a7a', eye: '#6ab0ff', cape: '#3a1e1e', scale: 1.2 }, drops: [['rusted_chain', .5], ['yellow_potion', .1], ['white_potion', .02]] },
  sir_gaunt: { name: 'Sir Gaunt', title: 'The Oathless', lvl: 32, hp: 32000, atk: [140, 180], def: 35, mdef: 20, elem: 'undead', race: 'undead', boss: true, aggro: true, sight: 8, speed: 2.4, aspd: 1.3, range: 2.6, spr: 'human', look: { body: '#34343e', trim: '#8a8aa0', legs: '#26262e', skin: '#34343e', head: 'helm', weapon: 'greatsword', wcol: '#b0b8c8', eye: '#7fd0ff', cape: '#1a1a26', scale: 2 }, glow: '#7fd0ff', expMul: 14, shard: 'shard_oath',
    abil: [{ id: 'slam', cd: 6, r: 3, mul: 1.7, delay: 1.1 }, { id: 'rain', cd: 10, n: 5, r: 1.6, mul: 1.4, delay: 1.4 }, { id: 'summon', cd: 18, mob: 'skeleton_soldier', n: 2, max: 4 }],
    intro: '“I swore to Tyr I would hold Gloamheim until the end of the world.” The armor turns toward you. “The world ended. I am still holding it.”' },

  cinder_thrall: { name: 'Cinder Thrall', lvl: 30, hp: 2600, atk: [100, 126], def: 26, mdef: 20, elem: 'fire', race: 'demon', aggro: true, sight: 10, speed: 2.6, aspd: 1.5, range: 1.5, spr: 'human', look: { body: '#6a2a1a', trim: '#e07a2a', legs: '#3a1a12', skin: '#2a1a14', head: 'skull', weapon: 'mace', wcol: '#5a3a2a', eye: '#ffb04a' }, glow: '#ff7a2a', drops: [['cinder_ash', .5], ['yellow_potion', .1]] },
  ashen_king: { name: 'The Ashen King', title: 'Herald of Surtr', lvl: 40, hp: 60000, atk: [185, 240], def: 40, mdef: 30, elem: 'fire', race: 'demon', boss: true, aggro: true, sight: 11, speed: 2.4, aspd: 1.3, range: 2.8, spr: 'human', look: { body: '#2a1f1c', trim: '#d06a2a', legs: '#1e1614', skin: '#2a1f1c', head: 'horned', weapon: 'greatsword', wcol: '#ff8a3a', eye: '#ffcf5a', cape: '#5a160e', scale: 2.4 }, glow: '#ff6a2a', expMul: 16,
    abil: [{ id: 'slam', cd: 5.5, r: 2.8, mul: 1.6, delay: 1.0 }, { id: 'rain', cd: 7, n: 6, r: 1.8, mul: 1.5, delay: 1.4 }, { id: 'nova', cd: 13, r: 5, mul: 2, delay: 1.9 }, { id: 'summon', cd: 22, mob: 'cinder_thrall', n: 2, max: 3 }],
    phase2: 'The King tears the burning crown from his brow and drives it into the floor. The fire answers him directly now.',
    intro: '“Another one the Tree refused.” The voice is kind, which is worse. “Kneel, little ember, and I will let you burn quickly.”' },
};
for (const k in MOBS) { const d = MOBS[k]; d.id = k; const base = { blob: 30, grub: 18, hare: 32, wolf: 30, human: 58, ghost: 46, tree: 62, shroom: 32 }[d.spr]; d.h = base * (d.look && d.look.scale ? d.look.scale : (d.size || 1)); }
const mobExp = d => Math.round((4 * Math.pow(d.lvl, 2.1) + 6) * (d.expMul || 1));
const expNeed = l => Math.floor(20 * Math.pow(l, 2.2)) + 10;
const jexpNeed = l => Math.floor(12 * Math.pow(l, 2.1)) + 10;
const MAXLV = 50;

/* =========================================================
   Data: items
   ========================================================= */
const SLOTS = ['weapon', 'shield', 'head', 'body', 'boots', 'acc'];
const SLOTNAME = { weapon: 'Weapon', shield: 'Shield', head: 'Headgear', body: 'Armor', boots: 'Footgear', acc: 'Accessory' };
const WJOBS = { dagger: ['novice', 'swordsman', 'mage', 'archer'], sword: ['swordsman'], rod: ['mage', 'acolyte'], bow: ['archer'], mace: ['swordsman', 'acolyte'] };
const WNAME = { dagger: 'Dagger', sword: 'Sword', rod: 'Rod', bow: 'Bow', mace: 'Mace' };
const WSPEED = { fist: 1.0, dagger: 1.15, sword: 0.95, rod: 0.8, bow: 0.9, mace: 0.9 };
const ITEMS = {};
function use_(id, name, o) { ITEMS[id] = Object.assign({ id, name, type: 'use' }, o); }
function etc(id, name, price, color) { ITEMS[id] = { id, name, type: 'etc', price, color, icon: 'etc', desc: 'A material. Brokkr pays for these.' }; }
function weap(id, name, wtype, atk, matk, lvl, price, slots, o = {}) { ITEMS[id] = Object.assign({ id, name, type: 'equip', slot: 'weapon', wtype, atk, matk, lvl, price, slots, jobs: WJOBS[wtype], icon: wtype }, o); }
function arm(id, name, slot, def, mdef, lvl, price, slots, jobs, o = {}) { ITEMS[id] = Object.assign({ id, name, type: 'equip', slot, def, mdef, lvl, price, slots, jobs: jobs || ALLJ, icon: slot }, o); }

use_('apple', 'Apple', { heal: [14, 18], price: 15, icon: 'apple', color: '#b8322a', desc: 'Restores 14–18 HP. Somehow still sweet.' });
use_('red_potion', 'Red Potion', { heal: [45, 65], price: 50, icon: 'potion', color: '#c8323a', desc: 'Restores 45–65 HP.' });
use_('orange_potion', 'Orange Potion', { heal: [105, 145], price: 200, icon: 'potion', color: '#e0782a', desc: 'Restores 105–145 HP.' });
use_('yellow_potion', 'Yellow Potion', { heal: [175, 235], price: 550, icon: 'potion', color: '#e2c23a', desc: 'Restores 175–235 HP.' });
use_('white_potion', 'White Potion', { heal: [325, 405], price: 1200, icon: 'potion', color: '#ecebe4', desc: 'Restores 325–405 HP.' });
use_('blue_potion', 'Blue Potion', { sp: [40, 60], price: 450, icon: 'potion', color: '#3a6fd0', desc: 'Restores 40–60 SP.' });
use_('fly_wing', 'Fly Wing', { effect: 'fly', price: 60, icon: 'wing', color: '#d8d2c0', desc: 'Teleports you to a random place on this map.' });
use_('butterfly_wing', 'Butterfly Wing', { effect: 'return', price: 300, icon: 'wing', color: '#e8a0c0', desc: 'Returns you to the last Waystone you rested at.' });
use_('ygg_ember', 'Ember of Yggdrasil', { effect: 'full', price: 5000, icon: 'ember', color: '#f0a040', desc: 'Fully restores HP and SP. A living coal from the World Tree.', noshop: true });
etc('jellopy', 'Jellopy', 6, '#d8a0b0'); etc('fluff', 'Fluff', 8, '#e8e0d0'); etc('clover', 'Grey Clover', 10, '#8a9a70');
etc('burlap', 'Scorched Burlap', 20, '#9a7a4a'); etc('tree_root', 'Tree Root', 26, '#6a4a2a'); etc('spore', 'Grey Spore', 30, '#8a7a9a');
etc('wolf_claw', 'Wolf Claw', 38, '#cfc6b0'); etc('wolf_pelt', 'Ashen Pelt', 70, '#6a6460'); etc('kobold_hair', 'Matted Kobold Hair', 42, '#8a6a3a');
etc('bone_shard', 'Bone Shard', 60, '#e0d8c0'); etc('ectoplasm', 'Ectoplasm', 76, '#a0c0e0'); etc('rusted_chain', 'Rusted Chain', 96, '#8a5a3a'); etc('cinder_ash', 'Cinder Ash', 130, '#e07a3a');
ITEMS.shard_blood = { id: 'shard_blood', name: 'Rune-Shard of Blood', type: 'key', icon: 'shard', color: '#e04a5a', desc: 'One third of the Rune of Binding. It is warm and it beats.' };
ITEMS.shard_moon = { id: 'shard_moon', name: 'Rune-Shard of the Moon', type: 'key', icon: 'shard', color: '#a8d0ff', desc: 'One third of the Rune of Binding. It casts a shadow even in the dark.' };
ITEMS.shard_oath = { id: 'shard_oath', name: 'Rune-Shard of the Oath', type: 'key', icon: 'shard', color: '#e8d890', desc: 'One third of the Rune of Binding. It is heavier than it should be.' };

weap('knife', 'Knife', 'dagger', 17, 0, 1, 50, 1); weap('cutter', 'Cutter', 'dagger', 30, 0, 8, 1250, 1); weap('main_gauche', 'Main Gauche', 'dagger', 43, 0, 15, 2400, 1); weap('stiletto', 'Stiletto', 'dagger', 58, 0, 24, 4800, 1);
weap('sword', 'Sword', 'sword', 25, 0, 1, 100, 1); weap('falchion', 'Falchion', 'sword', 49, 0, 10, 1500, 1); weap('blade', 'Blade', 'sword', 62, 0, 18, 2900, 1); weap('katana', 'Katana', 'sword', 84, 0, 26, 5500, 1); weap('claymore', 'Claymore', 'sword', 125, 0, 34, 9000, 0);
weap('rod', 'Rod', 'rod', 15, 20, 1, 50, 1); weap('wand', 'Wand', 'rod', 25, 40, 12, 2000, 1); weap('arc_wand', 'Arc Wand', 'rod', 30, 65, 22, 4500, 1); weap('staff', 'Runic Staff', 'rod', 40, 95, 32, 8500, 0);
weap('bow', 'Bow', 'bow', 15, 0, 1, 100, 1); weap('composite_bow', 'Composite Bow', 'bow', 29, 0, 10, 1500, 1); weap('great_bow', 'Great Bow', 'bow', 50, 0, 18, 3000, 1); weap('crossbow', 'Crossbow', 'bow', 70, 0, 26, 5500, 1); weap('arbalest', 'Arbalest', 'bow', 100, 0, 34, 9500, 0);
weap('club', 'Club', 'mace', 23, 0, 1, 60, 1); weap('mace', 'Mace', 'mace', 37, 0, 10, 1400, 1); weap('morning_star', 'Morning Star', 'mace', 60, 0, 20, 3500, 1); weap('flail', 'Flail', 'mace', 90, 0, 30, 7500, 0);
arm('cotton_shirt', 'Cotton Shirt', 'body', 1, 0, 1, 10, 1); arm('adventurer_suit', 'Adventurer’s Suit', 'body', 3, 0, 5, 400, 1); arm('padded_armor', 'Padded Armor', 'body', 5, 0, 12, 1500, 1);
arm('silk_robe', 'Silk Robe', 'body', 3, 10, 12, 1600, 1); arm('chain_mail', 'Chain Mail', 'body', 8, 0, 20, 3500, 1, ['swordsman', 'acolyte']); arm('ashen_coat', 'Ashen Coat', 'body', 7, 3, 24, 4200, 1);
arm('mage_coat', 'Runecloth Coat', 'body', 5, 15, 30, 8000, 1, ['mage', 'acolyte']); arm('full_plate', 'Full Plate', 'body', 12, 0, 32, 9000, 0, ['swordsman']);
arm('bandana', 'Bandana', 'head', 1, 0, 1, 50, 0); arm('cap', 'Cap', 'head', 3, 0, 10, 1000, 1); arm('circlet', 'Circlet', 'head', 1, 5, 14, 1400, 1, null, { bonus: { int: 1 } }); arm('helm', 'Helm', 'head', 6, 0, 24, 4000, 1, ['swordsman', 'acolyte']);
arm('guard', 'Guard', 'shield', 3, 0, 1, 500, 1); arm('buckler', 'Buckler', 'shield', 4, 0, 14, 1600, 1); arm('shield', 'Shield', 'shield', 7, 0, 26, 5000, 1, ['swordsman', 'acolyte']);
arm('sandals', 'Sandals', 'boots', 1, 0, 1, 60, 1); arm('shoes', 'Shoes', 'boots', 2, 0, 12, 1000, 1); arm('boots', 'Boots', 'boots', 4, 0, 24, 3000, 1); arm('greaves', 'Greaves', 'boots', 6, 0, 32, 6000, 0, ['swordsman']);
arm('clip', 'Clip', 'acc', 0, 0, 1, 300, 1); arm('ring', 'Ring', 'acc', 0, 0, 18, 3000, 0, null, { bonus: { str: 2 } }); arm('earring', 'Earring', 'acc', 0, 0, 18, 3000, 0, null, { bonus: { int: 2 } });
arm('glove', 'Glove', 'acc', 0, 0, 18, 3000, 0, null, { bonus: { dex: 2 } }); arm('brooch', 'Brooch', 'acc', 0, 0, 18, 3000, 0, null, { bonus: { agi: 2 } }); arm('rosary', 'Rosary', 'acc', 0, 3, 18, 3000, 0, null, { bonus: { luk: 2 } });

const U = (o) => Object.assign({ unique: true, price: 4000 }, o);
// Blight Mother
arm('u_brood_hat', 'Broodmother’s Cap', 'head', 2, 2, 1, 0, 1, null, U({ boss: 'blight_mother', bonus: { luk: 3, maxhpPct: 5 }, lore: 'A small Poring sleeps on it. It is not dead. It is not quite alive.' }));
weap('u_pinkfang', 'Pinkfang', 'dagger', 46, 0, 10, 0, 1, U({ boss: 'blight_mother', bonus: { luk: 4, crit: 10 }, lore: 'Cut from the Mother’s only tooth.' }));
weap('u_blightcutter', 'Blightcutter', 'sword', 64, 0, 10, 0, 1, U({ boss: 'blight_mother', bonus: { str: 3, leech: 1 }, lore: 'It drinks, a little.' }));
weap('u_jelly_rod', 'Jellyheart Rod', 'rod', 20, 58, 10, 0, 1, U({ boss: 'blight_mother', bonus: { int: 3, maxsp: 50 }, lore: 'The heart still quivers at the tip.' }));
weap('u_sapling_bow', 'Sapling Bow', 'bow', 42, 0, 10, 0, 1, U({ boss: 'blight_mother', bonus: { dex: 3, aspd: 8 }, lore: 'Strung with something pink and elastic.' }));
weap('u_mothers_knell', 'Mother’s Knell', 'mace', 52, 20, 10, 0, 1, U({ boss: 'blight_mother', bonus: { vit: 2, int: 2 }, lore: 'It rings like a lullaby when it strikes.' }));
// Hati
weap('u_moonfang', 'Moonfang', 'dagger', 76, 0, 20, 0, 1, U({ boss: 'hati', bonus: { agi: 4, crit: 15 }, lore: 'A tooth that once closed on the moon.' }));
weap('u_moonrend', 'Moonrend', 'sword', 98, 0, 20, 0, 1, U({ boss: 'hati', bonus: { str: 3, agi: 3 }, lore: 'The edge is always cold.' }));
weap('u_eclipse', 'Eclipse Wand', 'rod', 30, 95, 20, 0, 1, U({ boss: 'hati', bonus: { int: 5, matk: 10 }, lore: 'A dark disc turns slowly inside the crystal.' }));
weap('u_howlstring', 'Howlstring', 'bow', 76, 0, 20, 0, 1, U({ boss: 'hati', bonus: { dex: 4, aspd: 10 }, lore: 'Every shot sounds like a wolf far away.' }));
weap('u_night_bell', 'Night Bell', 'mace', 82, 30, 20, 0, 1, U({ boss: 'hati', bonus: { int: 3, vit: 3 }, lore: 'Its toll makes shadows flinch.' }));
arm('u_moon_pelt', 'Pelt of the Moon-Eater', 'body', 7, 4, 20, 0, 1, null, U({ boss: 'hati', bonus: { agi: 4, flee: 12 }, lore: 'Silver fur that never quite stops glowing.' }));
// Sir Gaunt
weap('u_oathbreaker', 'Oathbreaker', 'sword', 142, 0, 30, 0, 1, U({ boss: 'sir_gaunt', bonus: { str: 5, leech: 3 }, lore: 'Tyr’s name was etched on the blade. Someone scratched it out.' }));
weap('u_vowcutter', 'Vowcutter', 'dagger', 106, 0, 30, 0, 1, U({ boss: 'sir_gaunt', bonus: { agi: 5, crit: 12 }, lore: 'For the promises you did not mean.' }));
weap('u_broken_vows', 'Staff of Broken Vows', 'rod', 42, 140, 30, 0, 1, U({ boss: 'sir_gaunt', bonus: { int: 6, maxsp: 100 }, lore: 'Every vow Gaunt broke is carved on it. There is not much room left.' }));
weap('u_unkept_word', 'Tyr’s Unkept Word', 'bow', 116, 0, 30, 0, 1, U({ boss: 'sir_gaunt', bonus: { dex: 6, crit: 8 }, lore: 'It never misses what it swears to hit.' }));
weap('u_penitent', 'Penitent’s Maul', 'mace', 122, 40, 30, 0, 1, U({ boss: 'sir_gaunt', bonus: { int: 4, vit: 4 }, lore: 'Heavy with apology.' }));
arm('u_gaunt_visage', 'Visage of the Oathless', 'head', 6, 6, 30, 0, 1, null, U({ boss: 'sir_gaunt', bonus: { vit: 4 }, lore: 'The helm is empty. It always was.' }));
// Ashen King
arm('u_crown', 'Crown of Cinders', 'head', 5, 5, 1, 0, 1, null, U({ boss: 'ashen_king', bonus: { str: 3, agi: 3, vit: 3, int: 3, dex: 3, luk: 3 }, lore: 'It is warm. It fits.' }));

const CARDS = {
  blight_poring: { luk: 2, flee: 2 }, ash_grub: { vit: 1, maxhp: 100 }, hollow_hare: { agi: 1, luk: 1 }, cinder_drop: { dex: 1, hit: 5 }, scarecrow_husk: { str: 1, atk: 5 },
  thorn_willow: { maxsp: 60 }, mourning_spore: { int: 1, maxsp: 25 }, ash_wolf: { str: 1, crit: 4 }, kobold_archer: { dex: 2, hit: 5 }, rotwood_kobold: { atk: 15 },
  skeleton_soldier: { atk: 10, def: 2 }, grave_archer: { dex: 1, crit: 5 }, wraith: { flee: 15 }, rust_knight: { dmgRed: 12 }, cinder_thrall: { matk: 25, int: 1 },
  blight_mother: { maxhpPct: 20 }, hati: { agi: 4, aspd: 10 }, sir_gaunt: { str: 3, leech: 4 }, ashen_king: { str: 3, agi: 3, vit: 3, int: 3, dex: 3, luk: 3 },
};
for (const k in CARDS) ITEMS['c_' + k] = { id: 'c_' + k, name: MOBS[k].name + ' Card', type: 'card', bonus: CARDS[k], price: MOBS[k].boss ? 4000 : 40, icon: 'card', color: MOBS[k].col || (MOBS[k].look && MOBS[k].look.body) || '#888', mob: k, desc: 'Insert into equipment with a free slot. Cannot be removed.' };

const STATLABEL = { str: 'STR', agi: 'AGI', vit: 'VIT', int: 'INT', dex: 'DEX', luk: 'LUK', atk: 'ATK', matk: 'MATK', def: 'DEF', mdef: 'MDEF', hit: 'HIT', flee: 'FLEE', crit: 'CRIT' };
function bonusLine(k, v) {
  if (STATLABEL[k]) return `+${v} ${STATLABEL[k]}`;
  if (k === 'aspd') return `+${v}% attack speed`;
  if (k === 'leech') return `Steals ${v}% of damage dealt as HP`;
  if (k === 'maxhp') return `+${v} Max HP`;
  if (k === 'maxsp') return `+${v} Max SP`;
  if (k === 'maxhpPct') return `+${v}% Max HP`;
  if (k === 'dmgRed') return `Takes ${v}% less damage`;
  if (k === 'move') return `+${v}% movement speed`;
  return `+${v} ${k}`;
}
const AFFIXES = [
  { s: 'str', pre: 'Brutal', suf: 'of Strength', slots: ['weapon', 'body', 'head', 'boots', 'acc', 'shield'], r: l => [1, 1 + Math.floor(l / 8)] },
  { s: 'agi', pre: 'Nimble', suf: 'of Swiftness', slots: ['weapon', 'body', 'boots', 'acc', 'head'], r: l => [1, 1 + Math.floor(l / 8)] },
  { s: 'vit', pre: 'Hale', suf: 'of the Bear', slots: ['body', 'head', 'shield', 'boots', 'acc'], r: l => [1, 1 + Math.floor(l / 8)] },
  { s: 'int', pre: 'Runed', suf: 'of the Sage', slots: ['weapon', 'head', 'body', 'acc'], r: l => [1, 1 + Math.floor(l / 8)] },
  { s: 'dex', pre: 'Steady', suf: 'of the Hawk', slots: ['weapon', 'head', 'acc', 'boots'], r: l => [1, 1 + Math.floor(l / 8)] },
  { s: 'luk', pre: 'Lucky', suf: 'of Fortune', slots: ['weapon', 'head', 'acc', 'shield', 'body'], r: l => [1, 1 + Math.floor(l / 8)] },
  { s: 'atk', pre: 'Cruel', suf: 'of Slaughter', slots: ['weapon', 'acc'], r: l => [2 + Math.floor(l / 4), 5 + Math.floor(l * 0.8)] },
  { s: 'matk', pre: 'Arcane', suf: 'of Sorcery', slots: ['weapon', 'acc', 'head'], r: l => [2 + Math.floor(l / 4), 5 + Math.floor(l * 0.8)] },
  { s: 'crit', pre: 'Keen', suf: 'of Precision', slots: ['weapon', 'acc', 'head'], r: l => [1, 2 + Math.floor(l / 6)] },
  { s: 'aspd', pre: 'Frenzied', suf: 'of Haste', slots: ['weapon', 'boots', 'acc'], r: l => [2, 3 + Math.floor(l / 5)] },
  { s: 'leech', pre: 'Vampiric', suf: 'of the Leech', slots: ['weapon'], r: l => [1, 1 + Math.floor(l / 14)] },
  { s: 'def', pre: 'Sturdy', suf: 'of Warding', slots: ['body', 'shield', 'head', 'boots'], r: l => [1, 1 + Math.floor(l / 6)] },
  { s: 'mdef', pre: 'Hallowed', suf: 'of the Ward', slots: ['body', 'shield', 'head', 'acc'], r: l => [1, 2 + Math.floor(l / 5)] },
  { s: 'maxhp', pre: 'Vital', suf: 'of Life', slots: ['body', 'shield', 'head', 'boots', 'acc'], r: l => [10 + l * 2, 20 + l * 8] },
  { s: 'maxsp', pre: 'Lucid', suf: 'of Wisdom', slots: ['body', 'head', 'acc', 'weapon'], r: l => [5 + l, 10 + l * 3] },
  { s: 'flee', pre: 'Elusive', suf: 'of Evasion', slots: ['body', 'boots', 'acc'], r: l => [1, 2 + Math.floor(l / 3)] },
  { s: 'hit', pre: 'True', suf: 'of Accuracy', slots: ['weapon', 'acc', 'head'], r: l => [2, 3 + Math.floor(l / 2)] },
];
const RARE_A = ['Grim', 'Ash', 'Blood', 'Doom', 'Hel', 'Rune', 'Ember', 'Wyrm', 'Frost', 'Gloom', 'Rot', 'Storm', 'Raven', 'Bale', 'Cinder', 'Grave'];
const RARE_B = { weapon: ['Bite', 'Fang', 'Edge', 'Song', 'Thirst', 'Sting'], body: ['Shell', 'Hide', 'Mantle', 'Coat'], head: ['Visage', 'Crown', 'Hood', 'Brow'], shield: ['Ward', 'Guard', 'Wall', 'Aegis'], boots: ['Stride', 'Track', 'Tread', 'March'], acc: ['Loop', 'Eye', 'Knot', 'Charm'] };

/* =========================================================
   Data: maps
   ========================================================= */
const MAPDEFS = {
  emberhold: { name: 'Emberhold', sub: 'The Last Waystone', w: 36, h: 36, seed: 11, gen: 'town', ground: ['#3b342e', '#403831', '#36302a', '#443c34'], void: '#0d0b0a', dark: 0.40, part: 'petal', spawns: [], safe: true,
    look: { floor: 'grass', g1: [86, 130, 52], g2: [126, 168, 70], path: [176, 164, 140], ash: [150, 146, 136], ashAmt: 0, grain: 22, flowers: 0.22, cobble: true, trees: ['green', 'green', 'autumn'], rock: 0x9a958a, tint: [1, 1, 1], fog: 0xcfdbe6, fogN: 60, fogF: 130, hemi: [0xfff8ec, 0x6a6450, 0.62], sun: [0xfff2dc, 0.5], torch: 0 } },
  ashen_fields: { name: 'Ashen Fields', sub: 'Base Lv 1 – 12', w: 64, h: 64, seed: 23, gen: 'field', trees: 0.045, rocks: 0.035, ground: ['#4a4436', '#4f4838', '#443f32', '#554c3a'], void: '#0d0c09', dark: 0.48, part: 'ash', treeKind: 'dead',
    look: { floor: 'grass', g1: [90, 142, 52], g2: [140, 184, 74], path: [170, 140, 96], ash: [134, 130, 122], ashAmt: 0.35, grain: 24, flowers: 0.3, trees: ['green', 'autumn', 'dead'], rock: 0x9c968c, tint: [1, 1, 1], fog: 0xd2dccf, fogN: 55, fogF: 125, hemi: [0xf4fbff, 0x5a6a40, 0.64], sun: [0xfff6e0, 0.5], torch: 0 },
    spawns: [['blight_poring', 16], ['ash_grub', 10], ['hollow_hare', 10], ['cinder_drop', 8], ['scarecrow_husk', 7]], boss: 'blight_mother' },
  withered_wood: { name: 'Withered Wood', sub: 'Base Lv 10 – 22', w: 64, h: 64, seed: 37, gen: 'field', trees: 0.16, rocks: 0.02, ground: ['#2f3528', '#343a2b', '#2a3024', '#383d2c'], void: '#080a07', dark: 0.66, part: 'leaf', treeKind: 'wood',
    look: { floor: 'grass', g1: [50, 88, 36], g2: [86, 126, 50], path: [120, 94, 62], ash: [90, 90, 80], ashAmt: 0.12, grain: 22, flowers: 0.06, trees: ['forest', 'forest', 'forest2'], rock: 0x7e7a70, tint: [0.9, 0.95, 0.9], fog: 0x5e7654, fogN: 45, fogF: 110, hemi: [0xd4e8cc, 0x2a3a20, 0.58], sun: [0xfff4d0, 0.42], torch: 0 },
    spawns: [['thorn_willow', 10], ['mourning_spore', 10], ['ash_wolf', 10], ['rotwood_kobold', 8], ['kobold_archer', 6]], boss: 'hati' },
  gloamheim: { name: 'Gloamheim Keep', sub: 'Base Lv 20 – 34', w: 60, h: 60, seed: 51, gen: 'dungeon', ground: ['#34323a', '#393640', '#2f2d34', '#3c3842'], wall: ['#57525e', '#403b47', '#2e2a34'], void: '#060507', dark: 0.84, part: 'dust',
    look: { floor: 'flag', g1: [80, 78, 94], g2: [114, 110, 128], grain: 18, rock: 0x6a6674, tint: [0.84, 0.84, 0.97], fog: 0x15151e, fogN: 35, fogF: 85, hemi: [0x98a0c8, 0x181820, 0.5], sun: [0xb8c0ff, 0.22], torch: 1.6 },
    spawns: [['skeleton_soldier', 14], ['grave_archer', 9], ['wraith', 9], ['rust_knight', 7]], boss: 'sir_gaunt' },
  throne: { name: 'Throne of Cinders', sub: 'Where the Roots Burned', w: 30, h: 30, seed: 67, gen: 'arena', ground: ['#3a2622', '#402a24', '#35221e', '#46302a'], void: '#120604', dark: 0.5, part: 'ember', spawns: [], boss: 'ashen_king',
    look: { floor: 'rock', g1: [72, 40, 32], g2: [112, 64, 46], grain: 20, rock: 0x5a3a30, tint: [1, 0.9, 0.82], fog: 0x3a150c, fogN: 40, fogF: 100, hemi: [0xffb890, 0x401810, 0.58], sun: [0xff9a60, 0.45], torch: 0.9, lava: true } },
};

/* =========================================================
   State
   ========================================================= */
const cv = $('cv'), ctx = cv.getContext('2d');
const lc = document.createElement('canvas'), lctx = lc.getContext('2d');
let W = 0, H = 0, DPR = 1;
let map = null, mobs = [], drops = [], projs = [], teles = [], parts = [], fxs = [], floats = [], timers = [], screenParts = [];
let P = null, S = null, started = false, paused = false;
let zoom = 1, camX = 0, camY = 0, time = 0;
const mouse = { x: 0, y: 0, down: false, hold: false, holdT: 0, alt: false };
let hover = null, lastSave = 0, bossShown = null, bossLag = 1;
const mapCache = {};
let uidc = 1;

/* =========================================================
   Map generation
   ========================================================= */
const T = { FLOOR: 0, WALL: 1, TREE: 2, ROCK: 3, LAVA: 4, PILLAR: 5, RUIN: 6, GRAVE: 7, WAY: 8, HEART: 9 };
function genMap(id) {
  if (mapCache[id]) return mapCache[id];
  const d = MAPDEFS[id], w = d.w, h = d.h, rng = mulberry32(d.seed);
  const m = { id, d, w, h, t: new Uint8Array(w * h), deco: new Uint8Array(w * h), var: new Uint8Array(w * h), warps: [], npcs: [], objs: [], lights: [], braziers: [], entry: null, bossPos: null, gcol: [] };
  const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < w && y < h) m.t[y * w + x] = v; };
  const clearC = (cx, cy, r) => { for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r + 0.5 && x > 0 && y > 0 && x < w - 1 && y < h - 1) m.t[y * w + x] = 0; };
  const clearR = (x0, y0, x1, y1) => { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) if (x > 0 && y > 0 && x < w - 1 && y < h - 1) m.t[y * w + x] = 0; };
  const carve = (x0, y0, x1, y1, r) => { let x = x0, y = y0, g = 0; while ((x !== x1 || y !== y1) && g++ < 6000) { clearC(x, y, r); if (r >= 2 && d.gen === 'field') m.deco[y * w + x] = 6; if (rng() < 0.72) { if (Math.abs(x1 - x) > Math.abs(y1 - y)) x += Math.sign(x1 - x); else y += Math.sign(y1 - y); } else { if (rng() < 0.5) x += rng() < 0.5 ? 1 : -1; else y += rng() < 0.5 ? 1 : -1; x = clamp(x, 2, w - 3); y = clamp(y, 2, h - 3); } } clearC(x1, y1, r); };
  for (let i = 0; i < w * h; i++) m.var[i] = (rng() * 256) | 0;

  if (d.gen === 'town') {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x === 0 || y === 0 || x === w - 1 || y === h - 1) set(x, y, T.WALL);
    const ruin = (x0, y0, x1, y1) => { for (let x = x0; x <= x1; x++) { if (rng() > 0.25) set(x, y0, T.RUIN); if (rng() > 0.25) set(x, y1, T.RUIN); } for (let y = y0; y <= y1; y++) { if (rng() > 0.25) set(x0, y, T.RUIN); if (rng() > 0.25) set(x1, y, T.RUIN); } };
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
    m.npcs.push({ id: 'sigrun', name: 'Sigrun', title: 'Ember Maiden', x: 20.5, y: 17.3, dir: -1, look: { body: '#3a3440', trim: '#c9a860', legs: '#2a2630', skin: '#e6d5c3', hair: '#e8e2d6', robe: true, wings: true, weapon: 'none' } });
    m.npcs.push({ id: 'brokkr', name: 'Brokkr', title: 'Smith', x: 12.5, y: 13.5, dir: 1, look: { body: '#5a3a24', trim: '#2a1a12', legs: '#2a1e16', skin: '#d9a57c', hair: '#a8452a', beard: true, weapon: 'mace', wcol: '#777', scale: 0.92, wide: true } });
    m.npcs.push({ id: 'vidar', name: 'Vidar', title: 'Wanderer', x: 24.5, y: 12.5, dir: -1, look: { body: '#2b2c33', trim: '#5a4a3a', legs: '#1e1f24', skin: '#cdb9a0', head: 'hood', robe: true, weapon: 'staffv', wcol: '#6b5033' } });
    m.npcs.push({ id: 'astrid', name: 'Astrid', title: 'Orphan', x: 12.5, y: 23.5, dir: 1, look: { body: '#6d5a4a', trim: '#4a3a2a', legs: '#3a2e26', skin: '#efd9c4', hair: '#d8c38a', weapon: 'none', scale: 0.7 } });
    m.objs.push({ kind: 'anvil', x: 11.5, y: 12.5 });
    m.braziers.push({ x: 15.5, y: 15.5 }, { x: 21.5, y: 21.5 }, { x: 15.5, y: 21.5 }, { x: 33.5, y: 16 }, { x: 33.5, y: 21 }, { x: 16, y: 2.5 }, { x: 21, y: 2.5 });
    m.entry = { x: 18, y: 22 };
  } else if (d.gen === 'field') {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (x < 2 || y < 2 || x >= w - 2 || y >= h - 2) { set(x, y, rng() < 0.7 ? T.TREE : T.ROCK); continue; }
      const n = vnoise(x / 7, y / 7, d.seed);
      const r = rng() * (0.6 + n * 0.8);
      if (r < d.trees) set(x, y, T.TREE); else if (r < d.trees + d.rocks) set(x, y, T.ROCK);
      else if (id === 'ashen_fields' && rng() < 0.004) set(x, y, T.RUIN);
      if (m.t[y * w + x] === 0 && rng() < 0.13) m.deco[y * w + x] = 1 + ((rng() * 4) | 0);
    }
    if (id === 'ashen_fields') {
      m.entry = { x: 3, y: 32 }; m.way = { x: 7.5, y: 29.5 }; m.bossPos = { x: 50.5, y: 11.5 };
      carve(2, 32, 61, 32, 2); carve(8, 30, 50, 12, 1); clearC(50, 11, 7); clearC(7, 29, 3);
      carve(30, 32, 20, 52, 1); carve(40, 32, 52, 50, 1);
      m.warps.push({ x: 1, y: 32, to: 'emberhold', tx: 32.5, ty: 18.5, label: 'Emberhold' });
      m.warps.push({ x: 62, y: 32, to: 'withered_wood', tx: 3.5, ty: 32.5, label: 'Withered Wood' });
    } else {
      m.entry = { x: 3, y: 32 }; m.way = { x: 7.5, y: 34.5 }; m.bossPos = { x: 48.5, y: 48.5 };
      carve(2, 32, 32, 3, 2); carve(8, 34, 48, 48, 1); clearC(48, 48, 7); clearC(7, 34, 3); carve(20, 20, 55, 12, 1); carve(15, 50, 32, 40, 1);
      m.warps.push({ x: 1, y: 32, to: 'ashen_fields', tx: 60.5, ty: 32.5, label: 'Ashen Fields' });
      m.warps.push({ x: 32, y: 1, to: 'gloamheim', tx: 30.5, ty: 55.5, label: 'Gloamheim Keep' });
    }
    set(Math.floor(m.way.x), Math.floor(m.way.y), T.WAY);
  } else if (d.gen === 'dungeon') {
    m.t.fill(T.WALL);
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
    for (let i = 0; i < w * h; i++) if (m.t[i] === 0 && rng() < 0.08) m.deco[i] = rng() < 0.5 ? 2 : 3;
    m.entry = { x: 30, y: 55 }; m.way = { x: 27.5, y: 52.5 }; m.bossPos = { x: 30.5, y: 8.5 };
    set(27, 52, T.WAY);
    m.warps.push({ x: 30, y: 58, to: 'withered_wood', tx: 32.5, ty: 4.5, label: 'Withered Wood' });
  } else if (d.gen === 'arena') {
    m.t.fill(T.LAVA);
    clearC(15, 14, 12); clearR(14, 24, 16, 28);
    for (let a = 0; a < 8; a++) { const px = Math.round(15 + Math.cos(a * Math.PI / 4) * 9), py = Math.round(14 + Math.sin(a * Math.PI / 4) * 9); if (py < 21) set(px, py, T.PILLAR); }
    for (let i = 0; i < w * h; i++) if (m.t[i] === 0 && rng() < 0.1) m.deco[i] = 4;
    set(15, 3, T.HEART); m.heart = { x: 15.5, y: 3.5 };
    m.objs.push({ kind: 'heart', x: 15.5, y: 3.5, name: 'Heart of Yggdrasil' });
    set(15, 24, T.WAY); m.way = { x: 15.5, y: 24.5 };
    m.entry = { x: 15, y: 27 }; m.bossPos = { x: 15.5, y: 10.5 };
    m.warps.push({ x: 15, y: 28, to: 'emberhold', tx: 18.5, ty: 3.5, label: 'Emberhold' });
    m.braziers.push({ x: 11, y: 22 }, { x: 20, y: 22 });
  }
  if (m.way) m.objs.push({ kind: 'way', x: m.way.x, y: m.way.y, name: 'Waystone' });
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
    flags: { shards: {}, bosses: {}, lore: { ash: true }, tips: {}, talked: {} }, lostZeny: null, uid: 1, playTime: 0,
  };
}
function resetRuntime() {
  Object.assign(P, { stamina: 100, stamT: 0, iframes: 0, dodgeT: 0, blocking: false, blockStart: 0, combo: 0, comboT: 0, swingT: 0, queued: null, charge: -1, fx: 1, fy: 0.35, path: null, target: null, goal: null, atkCD: 0, castT: 0, castMax: 0, casting: null, pending: null, cd: {}, buffs: {}, dir: 1, walk: 0, moving: false, atkAnim: -1, dead: false, sitting: false, hurtT: 0, hpT: 0, spT: 0, potCD: 0, deadT: 0, kind: 'player' });
}
function refineAtk(t) { return t.lvl < 10 ? 2 : t.lvl < 20 ? 3 : 5; }
function calcStats() {
  const b = { str: 0, agi: 0, vit: 0, int: 0, dex: 0, luk: 0, atk: 0, matk: 0, def: 0, mdef: 0, hit: 0, flee: 0, crit: 0, aspd: 0, leech: 0, maxhp: 0, maxsp: 0, maxhpPct: 0, dmgRed: 0, move: 0 };
  const add = o => { if (o) for (const k in o) b[k] = (b[k] || 0) + o[k]; };
  let watk = 0, wmatk = 0, wtype = 'fist', def = 0, mdef = 0;
  for (const s of SLOTS) {
    const it = P.equip[s]; if (!it) continue; const t = ITEMS[it.id];
    add(t.bonus); for (const a of it.affixes || []) b[a.s] = (b[a.s] || 0) + a.v; for (const c of it.cards || []) add(ITEMS[c].bonus);
    if (s === 'weapon') { wtype = t.wtype; watk = t.atk + (it.refine || 0) * refineAtk(t); wmatk = (t.matk || 0) + (t.wtype === 'rod' ? (it.refine || 0) * 3 : 0); }
    else { def += (t.def || 0) + (it.refine || 0); mdef += t.mdef || 0; }
  }
  for (const k in P.buffs) add(P.buffs[k].bonus);
  const sk = P.skills;
  b.dex += sk.owls_eye || 0; b.hit += sk.vultures_eye || 0;
  if (wtype === 'dagger' || wtype === 'sword') b.atk += (sk.sword_mastery || 0) * 4;
  const st = P.st;
  const str = st.str + b.str, agi = st.agi + b.agi, vit = st.vit + b.vit, int = st.int + b.int, dex = st.dex + b.dex, luk = st.luk + b.luk;
  const lv = P.lvl, C = CLASSES[P.cls];
  const atkStatus = wtype === 'bow' ? dex + sq(Math.floor(dex / 10)) + Math.floor(str / 5) + Math.floor(luk / 5) : str + sq(Math.floor(str / 10)) + Math.floor(dex / 5) + Math.floor(luk / 5);
  const maxhp = Math.floor((35 + lv * C.hp[0] + lv * lv * C.hp[1]) * (1 + vit / 100) * (1 + b.maxhpPct / 100)) + b.maxhp;
  const maxsp = Math.floor((10 + lv * C.sp) * (1 + int / 100)) + b.maxsp;
  S = {
    str, agi, vit, int, dex, luk, b, wtype, welem: 'neutral', atkStatus, watk, atkBonus: b.atk,
    matkMin: int + sq(Math.floor(int / 7)) + wmatk + b.matk, matkMax: int + sq(Math.floor(int / 5)) + wmatk + b.matk,
    def: def + b.def, softDef: Math.floor(vit / 2 + Math.max(vit * 0.3, vit * vit / 150 - 1)), mdef: mdef + b.mdef + Math.floor(int / 5),
    hit: lv + dex + b.hit, flee: lv + agi + b.flee, crit: 1 + luk * 0.3 + b.crit,
    aspd: Math.min(4, (WSPEED[wtype] || 1) * (1 + agi * 0.012 + dex * 0.003) * (1 + b.aspd / 100)),
    leech: b.leech, dmgRed: b.dmgRed, maxhp, maxsp,
    range: wtype === 'bow' ? 5 + (sk.vultures_eye || 0) * 0.5 : 1.6,
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
  if (!t.jobs.includes(P.cls)) return `A ${CLASSES[P.cls].name} cannot use this.`;
  if (P.lvl < t.lvl) return `Requires base level ${t.lvl}.`;
  if (t.slot === 'shield' && P.equip.weapon && ITEMS[P.equip.weapon.id].wtype === 'bow') return 'Bows need both hands.';
  return null;
}
function equip(it) {
  const why = canEquip(it); if (why) { log(why, 'warn'); return; }
  const t = ITEMS[it.id]; const idx = P.inv.indexOf(it); if (idx >= 0) P.inv.splice(idx, 1);
  const old = P.equip[t.slot]; P.equip[t.slot] = it; if (old) P.inv.push(old);
  if (t.wtype === 'bow' && P.equip.shield) { P.inv.push(P.equip.shield); P.equip.shield = null; log('You sling your shield to use the bow.', 'sys'); }
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
const mobFlee = m => Math.floor(m.d.lvl * 1.4 + 5 + (m.d.flee || 0));
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
  if (!crit && !o.sure && Math.random() * 100 >= hitChance(S.hit + (o.hit || 0), mobFlee(m), 100)) { floatText(m, 'Miss', 'miss'); Sfx.miss(); return; }
  let atk = S.atkStatus + S.watk * rand(0.8, 1) + S.atkBonus;
  if (isUndeadish(m)) atk += (P.skills.demon_bane || 0) * 3;
  let dmg = atk * mul * elemMod(o.elem || S.welem, mobElem(m));
  if (crit) dmg *= 1.4; else dmg = dmg * (100 - m.d.def) / 100 - Math.floor(m.d.lvl / 2);
  finishHit(m, dmg, crit, o);
}
function magicHit(m, mul, el, o = {}) {
  if (!m || m.dead) return;
  aggro(m);
  let dmg = rand(S.matkMin, S.matkMax) * mul * elemMod(el, mobElem(m));
  if (o.undeadBonus && isUndeadish(m)) dmg *= 1 + o.undeadBonus;
  dmg = dmg * (100 - m.d.mdef) / 100;
  finishHit(m, dmg, false, o);
}
function finishHit(m, dmg, crit, o) {
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
  if (!o.sure && Math.random() * 100 >= hitChance(mobHitStat(m), S.flee, 95)) { floatText(P, 'Miss', 'miss'); return; }
  let raw = rand(m.d.atk[0], m.d.atk[1]) * mul;
  if (o.magic) raw *= (100 - Math.min(S.mdef, 80)) / 100; else raw = raw * (100 - Math.min(S.def, 85)) / 100 - S.softDef;
  if (isUndeadish(m)) raw -= (P.skills.divine_protection || 0) * 3;
  raw *= (1 - Math.min(S.dmgRed, 60) / 100) * guard;
  hurtP(Math.max(1, Math.round(raw)));
}
function hurtP(d) {
  if (P.dead) return;
  P.hp -= d; P.hurtT = 0.3; P.sitting = false; fxs.push({ k: 'spark', x: P.x, y: P.y, h: chestH(P), t: 0, dur: 0.18, hurt: true });
  floatText(P, d, 'hurt'); Sfx.hurt();
  if (P.hp <= 0) { P.hp = 0; die(); }
}
function healP(a, quiet) {
  a = Math.round(a); if (a <= 0) return;
  const before = P.hp; P.hp = Math.min(S.maxhp, P.hp + a);
  if (!quiet || P.hp - before > 0) floatText(P, '+' + (quiet ? Math.round(P.hp - before) : a), 'heal', quiet);
}
function playerAttack(t) {
  P.atkAnim = 0;
  if (S.wtype === 'bow') { shot(P, t, 'arrow', () => physHit(t, 1)); Sfx.bow(); }
  else { after(0.13, () => { if (!t.dead) physHit(t, 1); }); Sfx.swing(); }
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
  burst(m.x, m.y, d.h * 0.5, d.col || (d.look && d.look.body) || '#888', 14, 2.2);
  if (d.boss) bossDefeated(m);
  else if (!m.summoned) { const type = m.type, mid = map.id; after(rand(10, 18), () => { if (map.id === mid) spawnMobRandom(type); }); }
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
  if (d.lost) { P.zeny += d.zeny; log(`You recover your lost ${fmt(d.zeny)} zeny.`, 'loot'); P.lostZeny = null; Sfx.coin(); drops.splice(drops.indexOf(d), 1); burst(d.x, d.y, 10, '#f0c060', 16, 2); UI.dirty = true; return; }
  if (d.zeny) { P.zeny += d.zeny; log(`+${fmt(d.zeny)} zeny`, 'loot'); Sfx.coin(); drops.splice(drops.indexOf(d), 1); UI.dirty = true; return; }
  if (!addItem(d.item)) return;
  const r = rarityOf(d.item);
  log(`You got ${itemName(d.item)}${d.item.qty > 1 ? ' ×' + d.item.qty : ''}.`, r === 'common' ? 'loot' : r);
  Sfx.pickup(); drops.splice(drops.indexOf(d), 1);
}
function addBuff(id, name, icon, t, bonus) { P.buffs[id] = { name, icon, t, max: t, bonus }; calcStats(); renderBuffs(); }

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
  const usable = Object.values(ITEMS).filter(t => t.unique && t.boss === m.type && t.jobs.includes(P.cls));
  const any = Object.values(ITEMS).filter(t => t.unique && t.boss === m.type);
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
function skillRange(sk) { return sk.range === 'weapon' ? S.range : (sk.range || 9); }
function useSkill(id) {
  const lv = P.skills[id] | 0, sk = SKILLS[id];
  if (!lv || !sk || sk.passive || P.dead || !started) return;
  if (P.casting) return;
  if ((P.cd[id] || 0) > 0) return;
  const spc = sk.sp(lv); if (P.sp < spc) { log('Not enough SP.', 'warn'); floatText(P, 'No SP', 'miss'); return; }
  let target = null, pos = null;
  const act = typeof isAction === 'function' && isAction();
  const hm = act ? actionTarget(sk) : (hover && hover.kind === 'mob' ? hover : null);
  if (sk.tgt === 'enemy') { target = hm || (P.target && !P.target.dead ? P.target : null) || nearestMob(9); if (!target) { log('No target in sight.', 'sys'); return; } }
  else if (sk.tgt === 'heal') { if (hm && isUndeadish(hm)) target = hm; }
  else if (sk.tgt === 'ground') { if (act) pos = { x: P.x + P.fx * 3, y: P.y + P.fy * 3 }; else { const w = s2w(mouse.x, mouse.y); pos = { x: w[0], y: w[1] }; } if (hm) pos = { x: hm.x, y: hm.y }; }
  if (act && target && dist(P, target) > skillRange(sk) + 0.4) { floatText(P, 'Too far', 'miss'); return; }
  P.sitting = false; P.goal = null;
  P.pending = { id, lv, target, pos };
}
function nearestMob(r) { let best = null, bd = r; for (const m of mobs) { if (m.dead) continue; const d = dist(m, P); if (d < bd) { bd = d; best = m; } } return best; }
function beginCast(pd) {
  const sk = SKILLS[pd.id]; const ct = sk.cast ? sk.cast(pd.lv) * Math.max(0.2, 1 - S.dex / 150) : 0;
  P.path = null;
  if (pd.target) face(P, pd.target); else if (pd.pos) face(P, pd.pos);
  if (ct > 0.05) { P.casting = pd; P.castT = ct; P.castMax = ct; Sfx.cast(); }
  else execSkill(pd);
}
function execSkill(pd) {
  const sk = SKILLS[pd.id];
  if (pd.target && pd.target.kind === 'mob' && pd.target.dead) return;
  const spc = sk.sp(pd.lv); if (P.sp < spc) { log('Not enough SP.', 'warn'); return; }
  P.sp -= spc; P.cd[pd.id] = sk.cd || 0.3;
  floatText(P, sk.name + '!!', 'skill');
  sk.use(pd.lv, pd.target, pd.pos);
  if (pd.target && pd.target.kind === 'mob' && sk.range === 'weapon') P.target = pd.target;
}
function updatePlayer(dt) {
  if (P.dead) { P.deadT += dt; if (P.deadT > 1.3 && !P.deathShown) { P.deathShown = true; showDeath(); } return; }
  P.playTime += dt;
  for (const k in P.cd) if (P.cd[k] > 0) P.cd[k] -= dt;
  if (P.potCD > 0) P.potCD -= dt;
  if (P.hurtT > 0) P.hurtT -= dt;
  if (P.atkAnim >= 0) { P.atkAnim += dt * 3.2; if (P.atkAnim > 1) P.atkAnim = -1; }
  let buffChanged = false;
  for (const k in P.buffs) { P.buffs[k].t -= dt; if (P.buffs[k].t <= 0) { log(`${P.buffs[k].name} wears off.`, 'sys'); delete P.buffs[k]; buffChanged = true; } }
  if (buffChanged) { calcStats(); renderBuffs(); }

  // Regeneration
  const sitMul = P.sitting ? 2 : 1;
  P.hpT += dt; if (P.hpT >= 4) { P.hpT = 0; if (P.hp < S.maxhp) { const hr = P.skills.hp_recovery || 0; P.hp = Math.min(S.maxhp, P.hp + (Math.max(1, Math.floor(S.maxhp / 200) + Math.floor(S.vit / 5)) + hr * 5 + Math.floor(S.maxhp * hr * 0.002)) * sitMul); } }
  P.spT += dt; if (P.spT >= 5) { P.spT = 0; if (P.sp < S.maxsp) P.sp = Math.min(S.maxsp, P.sp + (1 + Math.floor(S.maxsp / 100) + Math.floor(S.int / 6) + (P.skills.sp_recovery || 0) * 3) * sitMul); }

  // Keyboard action controls take over while they are in use
  if (typeof actionUpdate === 'function' && actionUpdate(dt)) { postMove(); return; }

  // Casting
  if (P.casting) { P.castT -= dt; if (P.castT <= 0) { const c = P.casting; P.casting = null; execSkill(c); } return; }

  // Pending skill: close in, then cast
  if (P.pending) {
    const pd = P.pending, sk = SKILLS[pd.id];
    if (pd.target && pd.target.kind === 'mob' && pd.target.dead) { P.pending = null; }
    else {
      const tp = pd.target || pd.pos; const r = skillRange(sk);
      if (!tp || dist(P, tp) <= r + 0.3) { P.pending = null; beginCast(pd); return; }
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
  if (m.frozen > 0) { m.frozen -= dt; m.moving = false; return; }
  if (m.stun > 0) { m.stun -= dt; m.moving = false; m.atkCD = Math.max(m.atkCD, 0.3); return; }
  if (m.leap) {
    const L = m.leap; L.t += dt; const k = Math.min(1, L.t / L.dur);
    m.x = L.sx + (L.tx - L.sx) * k; m.y = L.sy + (L.ty - L.sy) * k; m.z = Math.sin(k * Math.PI) * 60;
    if (k >= 1) { m.leap = null; m.z = 0; m.path = null; }
    return;
  }
  const d = m.d, dp = dist(m, P);
  if (!P.dead && m.state === 'idle' && d.aggro && dp < (d.sight || 7)) aggro(m);
  if (P.dead && m.state === 'chase') { m.state = 'return'; m.path = null; }
  m.atkCD -= dt;
  if (m.state === 'idle') {
    m.t -= dt;
    if (m.t <= 0) { m.t = rand(2.5, 6); if (Math.random() < 0.65) { const tx = m.hx + rand(-4, 4), ty = m.hy + rand(-4, 4); if (!blocked(tx, ty)) { const p = findPath(m.x, m.y, tx, ty, 400); m.path = p; } } }
    followPath(m, dt, d.speed * 0.45);
  } else if (m.state === 'chase') {
    const leash = d.boss ? 24 : 16;
    if (Math.hypot(m.x - m.hx, m.y - m.hy) > leash && !m.summoned) { m.state = 'return'; m.path = null; return; }
    if (dp <= d.range + 0.2) {
      m.path = null; m.moving = false; face(m, P);
      if (m.atkCD <= 0) {
        m.atkCD = d.aspd; m.atkAnim = 0;
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
      followPath(m, dt, d.speed);
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
  if (started) updatePlayer(dt);
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
    if (t.t >= t.dur) { teles.splice(i, 1); if (t.m.dead) continue; t.boom(); if (!P.dead && Math.hypot(P.x - t.x, P.y - t.y) <= t.r) mobStrike(t.m, t.a.mul, { sure: true, magic: true }); }
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
  P.dead = true; P.deadT = 0; P.casting = null; P.pending = null; P.target = null; P.path = null; P.goal = null;
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
  stopAll(); P.casting = null; timers = []; projs = []; teles = []; parts = []; fxs = []; floats = []; drops = [];
  spawnAll();
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
  } else if (o.kind === 'heart') talkHeart();
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

