'use strict';
/* =========================================================
   Data: monsters and experience tables
   Loaded before js/core.js. Sprite sheet id per monster: mob_<key>
   (art/CONTRACT.md); without a sheet the procedural sprite `spr` is used.
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
  rust_knight: { name: 'Rust Knight', lvl: 28, hp: 3000, atk: [90, 114], def: 32, mdef: 12, elem: 'shadow', race: 'demon', aggro: true, sight: 7, speed: 2.2, aspd: 1.5, range: 1.6, spr: 'human', look: { body: '#6a5d55', trim: '#8a4a2a', legs: '#4a4038', skin: '#6a5d55', head: 'helm', weapon: 'sword', wcol: '#9a8a7a', eye: '#6ab0ff', cape: '#3a1e1e', scale: 1.2 }, drops: [['rusted_chain', .5], ['yellow_potion', .1], ['white_potion', .02]] },
  sir_gaunt: { name: 'Sir Gaunt', title: 'The Oathless', lvl: 32, hp: 36000, atk: [140, 180], def: 35, mdef: 20, elem: 'undead', race: 'undead', boss: true, aggro: true, sight: 8, speed: 2.4, aspd: 1.3, range: 2.6, spr: 'human', look: { body: '#34343e', trim: '#8a8aa0', legs: '#26262e', skin: '#34343e', head: 'helm', weapon: 'greatsword', wcol: '#b0b8c8', eye: '#7fd0ff', cape: '#1a1a26', scale: 2 }, glow: '#7fd0ff', expMul: 14, shard: 'shard_oath',
    abil: [{ id: 'slam', cd: 6, r: 3, mul: 1.7, delay: 1.1 }, { id: 'rain', cd: 10, n: 5, r: 1.6, mul: 1.4, delay: 1.4 }, { id: 'summon', cd: 18, mob: 'skeleton_soldier', n: 2, max: 4 }],
    intro: '“I swore to Tyr I would hold Gloamheim until the end of the world.” The armor turns toward you. “The world ended. I am still holding it.”' },

  cinder_thrall: { name: 'Cinder Thrall', lvl: 30, hp: 3100, atk: [106, 134], def: 26, mdef: 20, elem: 'fire', race: 'demon', aggro: true, sight: 10, speed: 2.6, aspd: 1.5, range: 1.5, spr: 'human', look: { body: '#6a2a1a', trim: '#e07a2a', legs: '#3a1a12', skin: '#2a1a14', head: 'skull', weapon: 'mace', wcol: '#5a3a2a', eye: '#ffb04a' }, glow: '#ff7a2a', drops: [['cinder_ash', .5], ['yellow_potion', .1]] },
  ashen_king: { name: 'The Ashen King', title: 'Herald of Surtr', lvl: 40, hp: 72000, atk: [185, 240], def: 40, mdef: 30, elem: 'fire', race: 'demon', boss: true, aggro: true, sight: 11, speed: 2.4, aspd: 1.3, range: 2.8, spr: 'human', look: { body: '#2a1f1c', trim: '#d06a2a', legs: '#1e1614', skin: '#2a1f1c', head: 'horned', weapon: 'greatsword', wcol: '#ff8a3a', eye: '#ffcf5a', cape: '#5a160e', scale: 2.4 }, glow: '#ff6a2a', expMul: 16,
    abil: [{ id: 'slam', cd: 5.5, r: 2.8, mul: 1.6, delay: 1.0 }, { id: 'rain', cd: 7, n: 6, r: 1.8, mul: 1.5, delay: 1.4 }, { id: 'nova', cd: 13, r: 5, mul: 2, delay: 1.9 }, { id: 'summon', cd: 22, mob: 'cinder_thrall', n: 2, max: 3 }],
    phase2: 'The King tears the burning crown from his brow and drives it into the floor. The fire answers him directly now.',
    intro: '“Another one the Tree refused.” The voice is kind, which is worse. “Kneel, little ember, and I will let you burn quickly.”' },

  /* ---------- Content round 3 (design/world2.md). Sheets mob_<id> are in index_world2a/b.json. ----------
     New fields: shot (projectile kind for ranged: arrow, spear, fire, ice, soul, holy, bolt), magic (hits use MDEF),
     phase2Sub (banner under the name at 50 % HP), outro (log line when an MVP falls). New ability kinds:
     { id: 'breath', cd, len, arc, rays, mul, delay, col }  cone toward the player
     { id: 'wave', cd, n, spread, len, r, speed, mul, delay, col }  n lines rolling outward
     { id: 'curse', cd, r, n, mul, delay, dur, tick, slow, col }  hex circles that leave slowing, burning zones */
  // Rimeshore (Base Lv 28-38)
  rime_poring: { name: 'Rime Poring', lvl: 28, hp: 2300, atk: [80, 98], def: 12, mdef: 22, elem: 'water', race: 'plant', speed: 1.9, aspd: 1.6, range: 1.3, spr: 'blob', col: '#bfe4ff', size: 1, eye: '#2a4a6a', drops: [['frost_jelly', .5], ['blue_potion', .05], ['yellow_potion', .06]] },
  snow_wolf: { name: 'Snow Wolf', lvl: 31, hp: 2900, atk: [100, 124], def: 16, mdef: 8, elem: 'water', race: 'brute', aggro: true, sight: 8, speed: 3.8, aspd: 1.25, range: 1.4, spr: 'wolf', col: '#e8eef4', size: 1.1, eye: '#7ff0ff', drops: [['frost_mane', .45], ['wolf_pelt', .2], ['yellow_potion', .08]] },
  draugr_fisher: { name: 'Draugr Fisher', lvl: 33, hp: 3700, atk: [110, 138], def: 26, mdef: 14, elem: 'undead', race: 'undead', aggro: true, sight: 8, speed: 2.1, aspd: 1.9, range: 4.5, ranged: true, shot: 'spear', spr: 'human',
    look: { body: '#4e6a5e', trim: '#d8b84a', legs: '#34463e', skin: '#8aa89a', head: 'human', hair: '#3a4a40', weapon: 'fork', wcol: '#8a8a7a', eye: '#ffe07a' }, drops: [['draugr_net', .45], ['bone_shard', .3], ['yellow_potion', .08]] },
  ice_wraith: { name: 'Ice Wraith', lvl: 35, hp: 3300, atk: [118, 150], def: 0, mdef: 40, elem: 'water', race: 'undead', aggro: true, sight: 7, speed: 3.0, aspd: 1.5, range: 1.5, flee: 25, magic: true, spr: 'ghost', col: '#d8f0ff', size: 1, glow: '#7fd0ff', drops: [['rime_essence', .45], ['blue_potion', .06], ['yellow_potion', .06]] },
  shell_knight: { name: 'Shell Knight', lvl: 37, hp: 5600, atk: [128, 160], def: 46, mdef: 10, elem: 'water', race: 'insect', aggro: true, sight: 6, speed: 1.8, aspd: 1.7, range: 1.6, spr: 'grub', col: '#c8763a', size: 2.2, eye: '#1a1a1a', drops: [['hermit_shell', .45], ['yellow_potion', .1], ['white_potion', .02]] },
  drowned_jarl: { name: 'The Drowned Jarl', title: 'King Under the Ice', lvl: 38, hp: 52000, atk: [165, 210], def: 40, mdef: 25, elem: 'undead', race: 'undead', boss: true, aggro: true, sight: 8, speed: 2.3, aspd: 1.4, range: 2.8, spr: 'human',
    look: { body: '#3a5a52', trim: '#b8a04a', legs: '#26382f', skin: '#6a8a7a', head: 'helm', weapon: 'greatsword', wcol: '#5a6a6a', eye: '#ffe07a', cape: '#1e3a34', scale: 2.4 }, glow: '#7fc8ff', expMul: 14,
    abil: [{ id: 'slam', cd: 6, r: 3, mul: 1.7, delay: 1.1 }, { id: 'wave', cd: 9, n: 3, spread: 0.42, len: 9, r: 1.0, speed: 7, mul: 1.6, delay: 0.9, col: '#9fd8ff', shout: 'The tide!' }, { id: 'rain', cd: 12, n: 5, r: 1.5, mul: 1.3, delay: 1.4 }, { id: 'summon', cd: 18, mob: 'draugr_fisher', n: 2, max: 4, shout: 'Crew, to me!' }],
    phase2: 'The Jarl drives his anchor into the ice. Black water wells up through the cracks around your feet.', phase2Sub: 'The sea answers its king',
    drops: [['rime_essence', 1], ['draugr_net', 1]],
    intro: 'A longship frozen into the ice, and a king still at its prow. “I drowned with my crew for a god who never came. Row with us, or rot with us.”',
    outro: 'The Jarl sinks through the ice without a sound. The frozen longship creaks, as if it is finally allowed to go home.' },

  // Mirewell (Base Lv 34-44)
  bog_toad: { name: 'Bog Toad', lvl: 34, hp: 3600, atk: [110, 136], def: 16, mdef: 12, elem: 'water', race: 'brute', speed: 2.0, aspd: 1.7, range: 2.4, spr: 'blob', col: '#6a9a3a', size: 1.5, eye: '#f0d04a', drops: [['toad_skin', .5], ['yellow_potion', .08]] },
  mire_leech: { name: 'Mire Leech', lvl: 36, hp: 3400, atk: [116, 144], def: 10, mdef: 26, elem: 'water', race: 'insect', aggro: true, sight: 5, speed: 1.7, aspd: 1.3, range: 1.3, spr: 'grub', col: '#7a4a8a', size: 2, drops: [['leech_teeth', .45], ['blue_potion', .06]] },
  wisp: { name: 'Will-o’-Wisp', lvl: 38, hp: 2800, atk: [122, 152], def: 4, mdef: 45, elem: 'ghost', race: 'demon', aggro: true, sight: 8, speed: 3.0, aspd: 1.9, range: 5, ranged: true, shot: 'soul', magic: true, flee: 30, spr: 'ghost', col: '#b8ff9a', size: 0.9, glow: '#8aff7a', drops: [['wisp_flame', .45], ['blue_potion', .08]] },
  marsh_hag: { name: 'Marsh Hag', lvl: 40, hp: 4600, atk: [130, 166], def: 18, mdef: 36, elem: 'shadow', race: 'demihuman', aggro: true, sight: 8, speed: 2.1, aspd: 2.0, range: 5, ranged: true, shot: 'soul', magic: true, spr: 'human',
    look: { body: '#4a5a32', trim: '#7a8a4a', legs: '#2e3420', skin: '#8a9a6a', head: 'hood', robe: true, weapon: 'staffv', wcol: '#d8d0b8', eye: '#c8ff6a' }, drops: [['bone_charm', .45], ['white_potion', .03]] },
  mire_troll: { name: 'Mire Troll', lvl: 42, hp: 7800, atk: [150, 190], def: 38, mdef: 10, elem: 'earth', race: 'brute', aggro: true, sight: 7, speed: 2.0, aspd: 1.8, range: 1.8, spr: 'human',
    look: { body: '#4a6a3a', trim: '#6a4a2a', legs: '#3a4a2a', skin: '#5a7a4a', head: 'kobold', weapon: 'mace', wcol: '#6a4a2a', eye: '#ffd04a', scale: 1.4, wide: true }, drops: [['troll_moss', .5], ['white_potion', .04]] },
  bog_crone: { name: 'The Bog Crone', title: 'Mother of the Mire', lvl: 44, hp: 84000, atk: [175, 225], def: 38, mdef: 42, elem: 'shadow', race: 'demihuman', boss: true, aggro: true, sight: 9, speed: 1.9, aspd: 1.6, range: 3, magic: true, spr: 'human',
    look: { body: '#4a2a5a', trim: '#8a6a3a', legs: '#2a1a30', skin: '#7a9a6a', head: 'hood', robe: true, weapon: 'staffv', wcol: '#6a4a2a', eye: '#b8ff5a', scale: 2.3 }, glow: '#9aff6a', expMul: 15,
    abil: [{ id: 'curse', cd: 8, r: 2.2, n: 2, mul: 1.1, delay: 1.3, dur: 6, tick: 0.3, slow: 35, col: '#a066e0' }, { id: 'rain', cd: 10, n: 6, r: 1.6, mul: 1.3, delay: 1.5 }, { id: 'nova', cd: 14, r: 4.8, mul: 1.7, delay: 1.8 }, { id: 'summon', cd: 20, mob: 'wisp', n: 2, max: 4, shout: 'Little lights, come!' }],
    phase2: 'The cauldron boils over. Every hex the Crone ever cast comes up in the steam at once.', phase2Sub: 'The cauldron boils over',
    drops: [['bone_charm', 1], ['wisp_flame', 1]],
    intro: 'The cauldron walks on chicken legs. The woman in it stirs with a ladle as long as a spear. “Another pretty corpse for the soup. Sit, dear. It won’t take long.”',
    outro: 'The cauldron tips, spills, and the bog drinks it. For the first time in a hundred years, frogs start to sing in Mirewell.' },

  // Nidavellir Deep (Base Lv 40-50)
  cave_bat: { name: 'Cave Bat', lvl: 40, hp: 3400, atk: [126, 158], def: 12, mdef: 10, elem: 'shadow', race: 'brute', aggro: true, sight: 8, speed: 4.0, aspd: 1.2, range: 1.3, flee: 35, spr: 'blob', col: '#4a3a4a', size: 1.2, eye: '#ff4a3a', drops: [['bat_wing', .5], ['white_potion', .03]] },
  crystal_spider: { name: 'Crystal Spider', lvl: 43, hp: 5200, atk: [140, 176], def: 34, mdef: 20, elem: 'earth', race: 'insect', aggro: true, sight: 7, speed: 3.1, aspd: 1.4, range: 1.5, spr: 'grub', col: '#6a4a8a', size: 2.2, eye: '#ff6ab0', drops: [['amethyst', .45], ['white_potion', .04]] },
  magma_slime: { name: 'Magma Slime', lvl: 45, hp: 5000, atk: [148, 186], def: 20, mdef: 30, elem: 'fire', race: 'plant', speed: 1.8, aspd: 1.6, range: 1.3, spr: 'blob', col: '#ff7a2a', size: 1.1, glow: '#ff8a3a', eye: '#fff0b0', drops: [['magma_core', .45], ['white_potion', .05]] },
  stone_golem: { name: 'Stone Golem', lvl: 47, hp: 9800, atk: [165, 208], def: 55, mdef: 15, elem: 'earth', race: 'brute', aggro: true, sight: 6, speed: 1.7, aspd: 2.0, range: 1.9, spr: 'human',
    look: { body: '#7a7670', trim: '#5a5650', legs: '#5a5650', skin: '#8a8680', head: 'helm', weapon: 'none', eye: '#6ad0ff', scale: 1.5, wide: true }, drops: [['rune_stone', .45], ['white_potion', .05], ['dvergr_ore', .15]] },
  dwarf_revenant: { name: 'Dwarf Revenant', lvl: 49, hp: 6400, atk: [172, 216], def: 30, mdef: 30, elem: 'undead', race: 'undead', aggro: true, sight: 8, speed: 2.5, aspd: 1.5, range: 1.6, spr: 'ghost', col: '#9ae0d0', size: 1.2, glow: '#7ff0e0', drops: [['dvergr_ore', .45], ['bone_shard', .2], ['white_potion', .05]] },
  fafnir: { name: 'Fafnir', title: 'The Hoard-Wyrm', lvl: 50, hp: 135000, atk: [215, 275], def: 50, mdef: 40, elem: 'fire', race: 'brute', boss: true, aggro: true, sight: 9, speed: 2.2, aspd: 1.5, range: 3.2, spr: 'wolf', col: '#4a8a5a', size: 2.5, eye: '#ffb04a', glow: '#ff8a3a', expMul: 15,
    abil: [{ id: 'breath', cd: 7, len: 7, arc: 0.5, rays: 3, mul: 2.0, delay: 1.2, col: '#ff7a2a', shout: 'MINE!' }, { id: 'slam', cd: 6, r: 3.2, mul: 1.7, delay: 1.0 }, { id: 'rain', cd: 11, n: 7, r: 1.7, mul: 1.5, delay: 1.5 }, { id: 'summon', cd: 22, mob: 'magma_slime', n: 2, max: 3, shout: 'Burn them!' }],
    phase2: 'Fafnir rises off the hoard. Gold coins rain from his belly scales, red-hot, and the whole hall is his throat now.', phase2Sub: 'The hoard burns',
    drops: [['magma_core', 1], ['dvergr_ore', 1]],
    intro: 'Coins slide like water as something enormous uncoils beneath them. “A thief. They are all thieves. Even the one who made me was a thief.”',
    outro: 'Fafnir’s last breath is only smoke. The gold goes dark, and it is just metal again. Somewhere above, Sindri’s forge flares.' },

  // Bifrost Ruins (Base Lv 48-60)
  prism_poring: { name: 'Prism Poring', lvl: 48, hp: 5200, atk: [160, 200], def: 25, mdef: 45, elem: 'holy', race: 'plant', speed: 2.0, aspd: 1.5, range: 1.3, spr: 'blob', col: '#f0d0ff', size: 1, glow: '#ffc8f0', eye: '#4a3a6a', drops: [['prism_shard', .5], ['white_potion', .05], ['honey_mead', .03]] },
  sky_harpy: { name: 'Sky Harpy', lvl: 51, hp: 6000, atk: [178, 222], def: 20, mdef: 20, elem: 'wind', race: 'demihuman', aggro: true, sight: 9, speed: 4.0, aspd: 1.25, range: 1.6, flee: 40, spr: 'human',
    look: { body: '#c8a0d8', trim: '#f0e0a0', legs: '#8a6a9a', skin: '#f2dcc8', head: 'human', hair: '#f0c8e0', wings: true, weapon: 'none', eye: '#6a3a8a' }, drops: [['harpy_feather', .45], ['white_potion', .05]] },
  rune_sentinel: { name: 'Rune Sentinel', lvl: 54, hp: 11500, atk: [196, 246], def: 60, mdef: 40, elem: 'holy', race: 'demihuman', aggro: true, sight: 8, speed: 1.9, aspd: 1.8, range: 5, ranged: true, shot: 'holy', magic: true, spr: 'human',
    look: { body: '#c8a040', trim: '#fff0b0', legs: '#8a6a2a', skin: '#e8c060', head: 'helm', weapon: 'none', shield: true, eye: '#8ae0ff', scale: 1.2 }, drops: [['aesir_core', .45], ['white_potion', .06]] },
  valkyrie_shade: { name: 'Valkyrie Shade', lvl: 56, hp: 8800, atk: [210, 262], def: 26, mdef: 50, elem: 'ghost', race: 'undead', aggro: true, sight: 9, speed: 3.2, aspd: 1.3, range: 2.2, flee: 20, spr: 'ghost', col: '#dce8ff', size: 1.25, glow: '#b8d0ff', drops: [['valkyrie_plume', .45], ['white_potion', .06], ['honey_mead', .04]] },
  fenrir_whelp: { name: 'Fenrir Whelp', lvl: 58, hp: 10500, atk: [224, 280], def: 36, mdef: 24, elem: 'shadow', race: 'brute', aggro: true, sight: 9, speed: 4.2, aspd: 1.15, range: 1.4, spr: 'wolf', col: '#2a2430', size: 0.95, eye: '#ff5a2a', glow: '#b06aff', drops: [['gleipnir_link', .45], ['honey_mead', .05]] },
  fenrir: { name: 'Fenrir', title: 'The Wolf at the End of the World', lore: 'fenrir_slain', lvl: 60, hp: 260000, atk: [290, 370], def: 55, mdef: 45, elem: 'shadow', race: 'brute', boss: true, aggro: true, sight: 11, speed: 3.6, aspd: 1.2, range: 3.2, spr: 'wolf', col: '#1e1a24', size: 2.6, eye: '#ff6a2a', glow: '#b06aff', expMul: 16,
    abil: [{ id: 'leap', cd: 7, r: 2.4, mul: 1.9, delay: 1.0 }, { id: 'breath', cd: 9, len: 7.5, arc: 0.55, rays: 3, mul: 2.2, delay: 1.2, col: '#b06aff', shout: 'HROOO!' }, { id: 'wave', cd: 11, n: 5, spread: 0.5, len: 10, r: 0.95, speed: 8, mul: 1.8, delay: 1.0, col: '#c8b8ff', shout: '!' },
      { id: 'nova', cd: 15, r: 5.2, mul: 2.2, delay: 1.9 }, { id: 'summon', cd: 20, mob: 'fenrir_whelp', n: 2, max: 4, shout: 'Pups!' }],
    phase2: 'The last links of Gleipnir snap. Fenrir stands to his full height, and the sun behind the clouds goes dark.', phase2Sub: 'Gleipnir breaks',
    drops: [['gleipnir_link', 1], ['aesir_core', 1]],
    intro: '“Odin’s son sends a corpse to finish his work?” The wolf laughs, and the chains laugh with him. “Come, little ember. I have swallowed bigger fires than you.”',
    outro: 'Fenrir falls across the broken bridge, and for a moment the Bifrost glows every colour at once. Far away, an old man with one eye closes it.' },
};
for (const k in MOBS) { const d = MOBS[k]; d.id = k; const base = { blob: 30, grub: 18, hare: 32, wolf: 30, human: 58, ghost: 46, tree: 62, shroom: 32 }[d.spr]; d.h = base * (d.look && d.look.scale ? d.look.scale : (d.size || 1)); }
const mobExp = d => Math.round((4 * Math.pow(d.lvl, 2.1) + 6) * (d.expMul || 1));
const expNeed = l => Math.floor(20 * Math.pow(l, 2.2)) + 10;
const jexpNeed = l => Math.floor(12 * Math.pow(l, 2.1)) + 10;
const MAXLV = 60;
