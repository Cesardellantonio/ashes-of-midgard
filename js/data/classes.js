'use strict';
/* =========================================================
   Data: classes
   Loaded before js/core.js (and before js/data/items.js, which reads
   CLASSES[..].weapons to decide who can wield each weapon type).
   Fields (see docs/CONTENT.md):
     name, blurb       display text (blurb is shown when choosing the path)
     tier / from       0 = Novice; 1 = first class taken from 'novice';
                       second classes use tier 2 and from: '<first class>'
     base              optional: the class this one upgrades. Gear allowed for
                       the base class is allowed for this class too (jobOk()).
     hp: [a, b]        Max HP = (35 + lv*a + lv*lv*b) * (1 + VIT/100) ...
     sp                Max SP = (10 + lv*sp) * (1 + INT/100) ...
     maxJob            job level cap
     skills            skill ids learnable in this class (js/data/skills.js)
     weapons           weapon types (WNAME keys in js/data/items.js) it can wield
     starter           item id given on job change
     look              colours for the procedural fallback sprite
   Sprite sheets: <cls>_m.body / <cls>_f.body (+ hair, weapon layers), art/CONTRACT.md.
   ========================================================= */
const CLASSES = {
  novice: { name: 'Novice', tier: 0, hp: [5, 0.10], sp: 1, maxJob: 10, skills: ['basic', 'first_aid'], weapons: ['dagger'], look: { body: '#c09a64', trim: '#7a5230', legs: '#5a4430' } },
  swordsman: { name: 'Swordsman', tier: 1, from: 'novice', hp: [7, 0.35], sp: 2, maxJob: 40, skills: ['sword_mastery', 'bash', 'magnum', 'endure', 'hp_recovery'], weapons: ['dagger', 'sword', 'mace'], look: { body: '#7a98c8', trim: '#d0a840', legs: '#3a4460', cape: '#2a4a9a' }, starter: 'sword',
    blurb: 'Steel and stubbornness. The highest health of the four paths, with Bash for single foes and Magnum Break for crowds. Favors STR, VIT and a little DEX.' },
  mage: { name: 'Mage', tier: 1, from: 'novice', hp: [5, 0.12], sp: 6, maxJob: 40, skills: ['fire_bolt', 'cold_bolt', 'lightning_bolt', 'soul_strike', 'frost_diver', 'thunderstorm', 'sp_recovery'], weapons: ['dagger', 'rod'], look: { body: '#7440b0', trim: '#e8c860', legs: '#3a2458', robe: true, hat: 'witch' }, starter: 'rod',
    blurb: 'Bolts of fire, frost and lightning chosen to match the foe’s element. Fragile, slow to cast, devastating. Favors INT and DEX.' },
  archer: { name: 'Archer', tier: 1, from: 'novice', hp: [5.5, 0.18], sp: 2.5, maxJob: 40, skills: ['owls_eye', 'vultures_eye', 'double_strafe', 'arrow_shower', 'concentration'], weapons: ['dagger', 'bow'], look: { body: '#5e9a3e', trim: '#c89a50', legs: '#5a4028', hat: 'feather' }, starter: 'bow',
    blurb: 'Kills from range before the Ash can close in. Bows scale with DEX instead of STR. Favors DEX and AGI.' },
  acolyte: { name: 'Acolyte', tier: 1, from: 'novice', hp: [6, 0.22], sp: 5, maxJob: 40, skills: ['heal', 'blessing', 'inc_agi', 'holy_light', 'divine_protection', 'demon_bane'], weapons: ['rod', 'mace'], look: { body: '#2e3050', trim: '#f0eef8', legs: '#1e2034', robe: true, hat: 'biretta' }, starter: 'club',
    blurb: 'Keeps a failing god’s light. Heals itself, blesses its own arm, and burns the undead with Heal. Favors INT, VIT and STR.' },

  /* ---------- Second classes (tier 2). Job change: a trial quest from Vidar at Job Lv 40 + Base Lv 30 (js/data/quests.js). ---------- */
  knight: { name: 'Ash Knight', tier: 2, from: 'swordsman', base: 'swordsman', hp: [8, 0.5], sp: 2.6, maxJob: 50,
    skills: ['spear_mastery', 'pierce', 'spear_boomerang', 'brandish_spear', 'two_hand_quicken', 'bowling_bash'], weapons: ['spear', 'twohand', 'sword'], starter: 'spear_t1',
    look: { body: '#5a6478', trim: '#c8a040', legs: '#2e3444', cape: '#6a2a1e' },
    blurb: 'A lance against the Ash. Spears that pierce whole lines of the dead and two-hand swords that never stop swinging. The most Max HP of any path.' },
  oathkeeper: { name: 'Oathkeeper', tier: 2, from: 'swordsman', base: 'swordsman', hp: [7.8, 0.48], sp: 3.4, maxJob: 50,
    skills: ['faith', 'holy_cross', 'grand_cross', 'auto_guard', 'oath_of_tyr', 'shield_charge'], weapons: ['sword', 'spear', 'mace'], starter: 'tower_shield',
    look: { body: '#d8d4c8', trim: '#c89a30', legs: '#4a4a58', cape: '#8a1e1e' },
    blurb: 'Keeps the oath Sir Gaunt broke. Tower shield, holy steel and Tyr’s own promise: blocks what it can, returns what it cannot.' },
  runecaster: { name: 'Runecaster', tier: 2, from: 'mage', base: 'mage', hp: [5.5, 0.16], sp: 7.5, maxJob: 50,
    skills: ['storm_gust', 'meteor_storm', 'lord_of_vermilion', 'jupitel_thunder', 'quagmire', 'rune_attunement'], weapons: ['staff', 'rod'], starter: 'oak_staff',
    look: { body: '#3a2a6a', trim: '#e8c860', legs: '#221840', robe: true, hat: 'witch' },
    blurb: 'Carves the elder runes into the sky. Storms, falling stars and the lightning of Thor over whole crowds. Still fragile.' },
  sage: { name: 'Seiðr Sage', tier: 2, from: 'mage', base: 'mage', hp: [6, 0.2], sp: 7, maxJob: 50,
    skills: ['endow_blaze', 'endow_frost', 'endow_lightning', 'endow_quake', 'dispel', 'magic_rod', 'norn_ward'], weapons: ['book', 'rod'], starter: 'rune_book',
    look: { body: '#2a5a5a', trim: '#d8c070', legs: '#1a3434', robe: true },
    blurb: 'Weaves seiðr into steel: sets its own weapon ablaze or frozen, unravels enemy wards and drinks hostile spells. Sturdier than a Runecaster.' },
  wolfhunter: { name: 'Wolfhunter', tier: 2, from: 'archer', base: 'archer', hp: [6.2, 0.24], sp: 3, maxJob: 50,
    skills: ['blitz_beat', 'ankle_snare', 'blast_mine', 'freezing_trap', 'detect', 'beast_bane'], weapons: ['bow', 'dagger'], starter: 'yew_longbow',
    look: { body: '#5a5048', trim: '#b88a4a', legs: '#3a3028', hat: 'feather' },
    blurb: 'Hunts with Huginn the raven and a satchel of traps. Snares the pack, then shoots it apart. Favors DEX, AGI and a little LUK.' },
  skald: { name: 'Skald', tier: 2, from: 'archer', base: 'archer', hp: [6.4, 0.26], sp: 3.6, maxJob: 50,
    skills: ['music_lessons', 'poem_of_bragi', 'apple_of_idun', 'sunset_dirge', 'arrow_vulcan', 'frost_joker'], weapons: ['lute', 'whip', 'bow'], starter: 'lyre',
    look: { body: '#7a3a4a', trim: '#e8c060', legs: '#3a2a30', cape: '#2a4a6a', hat: 'feather' },
    blurb: 'Sings the sagas back into the world. One song at a time: faster spells, mending, or a frenzy of blows. Lutes and whips strike with DEX.' },
  priest: { name: 'Valkyrie Priest', tier: 2, from: 'acolyte', base: 'acolyte', hp: [6.6, 0.28], sp: 6.5, maxJob: 50,
    skills: ['resurrection', 'magnificat', 'sanctuary', 'kyrie_eleison', 'magnus_exorcismus', 'lex_aeterna'], weapons: ['mace', 'staff', 'book'], starter: 'oak_staff',
    look: { body: '#eceae4', trim: '#3a5aa0', legs: '#c8c4bc', robe: true },
    blurb: 'Chooses who stays dead, starting with yourself. Sanctuary, a shield of prayer and Magnus Exorcismus for the Ash’s undead.' },
  monk: { name: 'Einherjar Monk', tier: 2, from: 'acolyte', base: 'acolyte', hp: [7.5, 0.4], sp: 5, maxJob: 50,
    skills: ['iron_fists', 'summon_sphere', 'triple_attack', 'investigate', 'finger_offensive', 'asura_strike', 'body_relocation'], weapons: ['knuckle', 'mace'], starter: 'waghnak',
    look: { body: '#d07a2a', trim: '#e8d8b0', legs: '#3a2a20' },
    blurb: 'A warrior of Valhalla who kept fighting after Valhalla burned. Gathers spirit spheres, then spends them all on one blow.' },
};
// Every class, in definition order. Gear with no `jobs` list is usable by all of them.
const ALLJ = Object.keys(CLASSES);
// Classes offered when leaving class `cls` (Vidar's job change uses 'novice').
const nextClasses = cls => Object.keys(CLASSES).filter(k => CLASSES[k].from === cls && !CLASSES[k].reborn);   // reborn classes come from REBORN_OF only
// The class and every class it grew from, oldest first: ['novice', 'swordsman', 'knight'].
function classChain(cls) { const out = []; for (let c = cls, g = 0; c && CLASSES[c] && g < 6; c = CLASSES[c].from, g++) out.unshift(c); return out; }
// Can class `cls` use item template t? Honours CLASSES[cls].base inheritance.
// Weapons are stricter: the class must list the weapon type in `weapons` (second classes drop some
// of their first class's weapon families, and have no sprite for them).
function jobOk(t, cls) { if (t.slot === 'weapon' && t.wtype && CLASSES[cls] && CLASSES[cls].weapons && !CLASSES[cls].weapons.includes(t.wtype)) return false; if (!t.jobs) return true; for (let c = cls, g = 0; c && g < 6; c = CLASSES[c] && CLASSES[c].base, g++) if (t.jobs.includes(c)) return true; return false; }

/* ---------- Content round 6: rebirth (design/tier3.md) ----------
   At Base 60 + Job 50 as a second class, the quest chain `reborn_1..3` (js/data/quests.js) ends at the Heart of
   Yggdrasil: rebirth() (js/core.js) turns the hero into a High Novice (Base 1, bonus status points, items kept). At
   Job 10 the High Novice goes straight to the reborn version of the second class it had (REBORN_OF), tier 3,
   job cap 70: the class chain runs through the old classes, so every first- and second-class skill is kept and the
   five new signature skills are added. `from` = the second class (classChain / the Skills window sections), but a
   tier-3 class is never offered by nextClasses() as a job change: only Vidar's reborn path uses REBORN_OF. */
Object.assign(CLASSES, {
  high_novice: { name: 'High Novice', tier: 0, base: 'novice', reborn: true, hp: [5.5, 0.12], sp: 1.3, maxJob: 10, skills: ['basic', 'first_aid'], weapons: ['dagger'],
    look: { body: '#e8e2d4', trim: '#d0a840', legs: '#6a5a40' },
    blurb: 'Born again at the Heart of Yggdrasil. The Tree remembers what you were: at Job Lv 10 your old path takes you back, higher than before.' },
  rune_jarl: { name: 'Rune Jarl', tier: 3, from: 'knight', base: 'knight', reborn: true, hp: [8.8, 0.58], sp: 3, maxJob: 70,
    skills: ['spiral_pierce', 'einherjar_fury', 'gungnir_charge', 'thurisaz_rune', 'warg_mastery'], weapons: ['spear', 'twohand', 'sword'],
    look: { body: '#2a2622', trim: '#e0b040', legs: '#1e1a18', cape: '#9a1e1e' },
    blurb: 'The Ash Knight reborn. Black-and-gold plate carved with burning runes, a warg under the saddle and the fury of the einherjar behind the spear.' },
  tyr_paladin: { name: 'Paladin of Tyr', tier: 3, from: 'oathkeeper', base: 'oathkeeper', reborn: true, hp: [8.6, 0.55], sp: 3.8, maxJob: 70,
    skills: ['gloria', 'shield_chain', 'pressure', 'tyrs_sacrifice', 'tyrs_aegis'], weapons: ['sword', 'spear', 'mace'],
    look: { body: '#f0ece0', trim: '#e0b840', legs: '#5a5a68', cape: '#b02a1e' },
    blurb: 'The Oathkeeper reborn with one gauntlet missing, as Tyr lost his hand. Shield thrown, judgement pressed, the god’s own ward over the ground.' },
  galdr_master: { name: 'Galdr Master', tier: 3, from: 'runecaster', base: 'runecaster', reborn: true, hp: [6, 0.2], sp: 8.5, maxJob: 70,
    skills: ['muspel_vulcan', 'unmake', 'soul_drain', 'ginnungagap', 'galdr_amplify'], weapons: ['staff', 'rod'],
    look: { body: '#1a1840', trim: '#e8d070', legs: '#120f2a', robe: true, hat: 'witch' },
    blurb: 'The Runecaster reborn. Chants galdr, the spoken runes: ghost-fire from Muspel, the void before the worlds, and the power to unmake another’s spell.' },
  volva: { name: 'Völva', tier: 3, from: 'sage', base: 'sage', reborn: true, hp: [6.6, 0.24], sp: 8, maxJob: 70,
    skills: ['foresight', 'spell_breaker', 'seidr_hex', 'vardlokkur', 'volva_sight'], weapons: ['book', 'rod', 'staff'],
    look: { body: '#2a4a7a', trim: '#e0e0f0', legs: '#1a2a44', robe: true },
    blurb: 'The Seiðr Sage reborn as a seeress with a staff of bells. Sees the next spell before it is cast, breaks the enemy’s, and hexes the rest.' },
  fenris_stalker: { name: 'Fenris Stalker', tier: 3, from: 'wolfhunter', base: 'wolfhunter', reborn: true, hp: [6.8, 0.28], sp: 3.4, maxJob: 70,
    skills: ['sharp_shooting', 'huginn_muninn', 'gleipnir_snare', 'fenris_howl', 'wolf_instinct'], weapons: ['bow', 'dagger'],
    look: { body: '#1e1c1e', trim: '#d8d0b0', legs: '#2a2426', hat: 'feather' },
    blurb: 'The Wolfhunter reborn in the Wolf’s own pelt. Arrows that go through a whole pack, and both of Odin’s ravens at once.' },
  bragi_voice: { name: 'Voice of Bragi', tier: 3, from: 'skald', base: 'skald', reborn: true, hp: [7, 0.3], sp: 4.2, maxJob: 70,
    skills: ['norns_draw', 'harmonize', 'song_of_valhalla', 'bragis_verse', 'skald_volley'], weapons: ['lute', 'whip', 'bow'],
    look: { body: '#c89a30', trim: '#fff0c0', legs: '#5a3a20', cape: '#7a1e3a', hat: 'feather' },
    blurb: 'The Skald reborn with Bragi’s own voice: two songs at once, a verse that cuts, and the Norns’ cards drawn blind.' },
  valkyrie: { name: 'Valkyrie', tier: 3, from: 'priest', base: 'priest', reborn: true, hp: [7.4, 0.34], sp: 7, maxJob: 70,
    skills: ['assumptio', 'basilica', 'einherjar_call', 'chooser_spear', 'wings_of_valhalla'], weapons: ['mace', 'staff', 'book', 'spear'],
    look: { body: '#e8ecf4', trim: '#c8d0e0', legs: '#8a90a0', robe: true },
    blurb: 'The Valkyrie Priest reborn a true Valkyrie: winged helm, a spear to choose the slain and the right to call the einherjar back to their feet.' },
  berserkr: { name: 'Berserkr', tier: 3, from: 'monk', base: 'monk', reborn: true, hp: [8.2, 0.46], sp: 5.2, maxJob: 70,
    skills: ['blade_stop', 'chain_crush', 'asura_plus', 'bear_rage', 'thors_palm'], weapons: ['knuckle', 'mace'],
    look: { body: '#6a4a2a', trim: '#c83a2a', legs: '#2a2018' },
    blurb: 'The Einherjar Monk reborn in the bear’s skin. Catches the blade barehanded, then does not stop hitting.' },
});
// The reborn version of each second class (the High Novice's only job change, from Vidar).
const REBORN_OF = { knight: 'rune_jarl', oathkeeper: 'tyr_paladin', runecaster: 'galdr_master', sage: 'volva', wolfhunter: 'fenris_stalker', skald: 'bragi_voice', priest: 'valkyrie', monk: 'berserkr' };
// Classes that can ride a warg (Ylva's stable in Skaldhaven). Art: knight_<g>.mount_* exists; rune_jarl_<g>.mount_* does not yet.
const MOUNT_CLASSES = ['knight', 'rune_jarl'];
// ALLJ is recomputed so armour with no `jobs` list (every class) includes the new classes too.
ALLJ.length = 0; ALLJ.push(...Object.keys(CLASSES));
