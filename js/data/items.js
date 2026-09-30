'use strict';
/* =========================================================
   Data: items, weapon types, cards, affixes
   Loaded after js/data/mobs.js (cards are generated from MOBS) and before js/core.js.
   ========================================================= */
const SLOTS = ['weapon', 'shield', 'head', 'body', 'boots', 'acc'];
const SLOTNAME = { weapon: 'Weapon', shield: 'Shield', head: 'Headgear', body: 'Armor', boots: 'Footgear', acc: 'Accessory' };
// Weapon types. WJOBS (who may wield each type) is derived from CLASSES[..].weapons.
// A new weapon type needs WNAME + WSPEED here, an icon case in iconURL (js/ui.js)
// and a sprite weapon variant (WTYPE_VARIANT in js/gfx-sheets.js, art/CONTRACT.md).
const WJOBS = {};
for (const c in CLASSES) for (const wt of CLASSES[c].weapons || []) (WJOBS[wt] = WJOBS[wt] || []).push(c);
// Weapon type ids are also the sprite weapon variant names (art/CONTRACT.md), so a type needs no mapping.
const WNAME = { dagger: 'Dagger', sword: 'Sword', rod: 'Rod', bow: 'Bow', mace: 'Mace',
  spear: 'Spear', twohand: 'Two-Hand Sword', staff: 'Staff', book: 'Book', lute: 'Lute', whip: 'Whip', knuckle: 'Knuckle' };
// Base attacks per second before AGI/DEX (1 / seconds per swing).
const WSPEED = { fist: 1.0, dagger: 1.15, sword: 0.95, rod: 0.8, bow: 0.9, mace: 0.9,
  spear: 0.85, twohand: 0.78, staff: 0.75, book: 0.95, lute: 0.9, whip: 0.95, knuckle: 1.2 };
// Attack reach in cells (bows: 5 + Vulture's Eye). Anything missing uses 1.6.
const WRANGE = { spear: 2.3, twohand: 1.9, whip: 2.8, lute: 2.6, knuckle: 1.4 };
const TWOHANDED = ['bow', 'twohand', 'staff'];            // no shield with these
const DEXWEAPON = ['bow', 'lute', 'whip'];                // ATK scales with DEX instead of STR
const MAGICWEAPON = ['rod', 'staff', 'book'];             // refining adds MATK
/* Item templates. Types: use (consumable), etc (material), equip, card, key (Rune-Shards and
   quest items; cannot be sold or dropped, never despawn). Helpers below keep entries short. */
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
// Round 3 materials (Rimeshore, Mirewell, Nidavellir, Bifrost)
etc('frost_jelly', 'Frostjelly', 140, '#bfe4ff'); etc('frost_mane', 'Frosted Mane', 160, '#e8eef4'); etc('draugr_net', 'Draugr’s Net', 175, '#6a8a6a'); etc('rime_essence', 'Rime Essence', 190, '#9fd8ff'); etc('hermit_shell', 'Hermit Shell', 210, '#c8763a');
etc('toad_skin', 'Slick Toadskin', 180, '#6a9a3a'); etc('leech_teeth', 'Leech Teeth', 195, '#8a5a9a'); etc('wisp_flame', 'Wisp Flame', 215, '#aaff8a'); etc('bone_charm', 'Bone Charm', 230, '#d8d0b8'); etc('troll_moss', 'Troll Moss', 245, '#4a6a3a');
etc('bat_wing', 'Bat Wing', 220, '#4a3a4a'); etc('amethyst', 'Amethyst Shard', 250, '#a870e0'); etc('magma_core', 'Magma Core', 270, '#ff7a2a'); etc('rune_stone', 'Rune Stone', 300, '#8a8680'); etc('dvergr_ore', 'Dvergr Ore', 320, '#c8a860');
etc('prism_shard', 'Prism Shard', 300, '#f0d0ff'); etc('harpy_feather', 'Harpy Feather', 320, '#c8a0d8'); etc('aesir_core', 'Aesir Rune Core', 380, '#e8c060'); etc('valkyrie_plume', 'Valkyrie Plume', 360, '#dce8ff'); etc('gleipnir_link', 'Link of Gleipnir', 420, '#6a5a7a');
use_('honey_mead', 'Honey Mead', { heal: [650, 850], price: 2600, icon: 'potion', color: '#e8b040', desc: 'Restores 650–850 HP. Mead from the halls of Asgard, still sweet after the end of the world.' });

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

/* Second-class weapons (tier 2). Sold by Brokkr only to second classes; the racks open by Rune-Shards
   and by level (see RENDER.shop in js/ui.js). */
weap('spear_t1', 'Spear', 'spear', 98, 0, 28, 6500, 1); weap('pike', 'Pike', 'spear', 124, 0, 33, 9800, 1); weap('partisan', 'Partisan', 'spear', 150, 0, 38, 14000, 0); weap('hel_lance', 'Hel Lance', 'spear', 172, 0, 44, 21000, 0);
weap('bastard_sword', 'Bastard Sword', 'twohand', 116, 0, 28, 7000, 1); weap('flamberge', 'Flamberge', 'twohand', 146, 0, 33, 10500, 1); weap('zweihander', 'Zweihänder', 'twohand', 178, 0, 38, 15000, 0); weap('jotun_blade', 'Jötunn Blade', 'twohand', 204, 0, 44, 22000, 0);
weap('oak_staff', 'Oak Staff', 'staff', 40, 105, 28, 6500, 1); weap('seer_staff', 'Seer’s Staff', 'staff', 45, 128, 33, 9800, 1); weap('mimir_staff', 'Staff of Mímir', 'staff', 50, 152, 38, 14000, 0); weap('ash_staff', 'Ashwood Staff', 'staff', 55, 176, 44, 21000, 0);
weap('rune_book', 'Book of Runes', 'book', 72, 72, 28, 6200, 1); weap('frost_codex', 'Codex of Frost', 'book', 92, 92, 33, 9500, 1); weap('eddic_tome', 'Eddic Tome', 'book', 112, 112, 38, 14000, 0);
weap('lyre', 'Lyre', 'lute', 92, 0, 28, 6200, 1); weap('tagelharpa', 'Tagelharpa', 'lute', 118, 0, 33, 9600, 1); weap('skaldic_harp', 'Skaldic Harp', 'lute', 142, 0, 38, 14000, 0);
weap('rope_whip', 'Rope Whip', 'whip', 88, 0, 28, 6000, 1); weap('chain_whip', 'Chain Whip', 'whip', 114, 0, 33, 9400, 1); weap('serpent_lash', 'Serpent Lash', 'whip', 138, 0, 38, 13500, 0);
weap('waghnak', 'Waghnak', 'knuckle', 90, 0, 28, 6000, 1); weap('iron_knuckles', 'Iron Knuckles', 'knuckle', 116, 0, 33, 9500, 1); weap('garm_claw', 'Claw of Garm', 'knuckle', 142, 0, 38, 14000, 0);
weap('yew_longbow', 'Yew Longbow', 'bow', 108, 0, 30, 8000, 1, { jobs: ['wolfhunter', 'skald'] }); weap('raven_bow', 'Raven Bow', 'bow', 136, 0, 38, 14000, 0, { jobs: ['wolfhunter', 'skald'] });
weap('holy_avenger', 'Holy Avenger', 'sword', 132, 0, 34, 11000, 1, { jobs: ['oathkeeper', 'knight'], bonus: { mdef: 3 } });
weap('war_hammer', 'War Hammer', 'mace', 128, 20, 34, 11000, 1, { jobs: ['oathkeeper', 'priest', 'monk'] });
// Tower shields: Oathkeeper only. `sv` = shield sprite variant (art/CONTRACT.md: guard | tower).
arm('tower_shield', 'Tower Shield', 'shield', 11, 2, 30, 8000, 1, ['oathkeeper'], { sv: 'tower', bonus: { maxhpPct: 4 } });
arm('aegis_of_tyr', 'Aegis of Tyr', 'shield', 15, 6, 38, 15000, 0, ['oathkeeper'], { sv: 'tower', bonus: { maxhpPct: 6, dmgRed: 4 } });
// Second-class armour
arm('knight_plate', 'Ash-Knight Plate', 'body', 15, 2, 36, 12500, 1, ['knight', 'oathkeeper']);
arm('seidr_robe', 'Seiðr Robe', 'body', 7, 20, 36, 12000, 1, ['runecaster', 'sage', 'priest'], { bonus: { int: 2 } });
arm('hunter_leathers', 'Hunter’s Leathers', 'body', 10, 5, 36, 11500, 1, ['wolfhunter', 'skald', 'monk'], { bonus: { agi: 2 } });

/* Round 3 gear: dwarf-forged (Lv 46, Nidavellir) and Aesir (Lv 54, Bifrost). Brokkr stocks them once the gate is
   open; second-class types stay second-class only (tier2Item). */
weap('dvergr_seax', 'Dvergr Seax', 'dagger', 104, 0, 46, 26000, 1); weap('dvergr_longsword', 'Dvergr Longsword', 'sword', 150, 0, 46, 27000, 1);
weap('dvergr_rod', 'Dvergr Rune-Rod', 'rod', 56, 150, 46, 27000, 1); weap('dvergr_bow', 'Dvergr Longbow', 'bow', 138, 0, 46, 27000, 1); weap('dvergr_hammer', 'Dvergr Warhammer', 'mace', 142, 30, 46, 27000, 1);
weap('dvergr_spear', 'Dvergr Hewing Spear', 'spear', 196, 0, 46, 29000, 1); weap('dvergr_greatsword', 'Dvergr Greatsword', 'twohand', 232, 0, 46, 30000, 1); weap('dvergr_staff', 'Dvergr Runestaff', 'staff', 62, 200, 46, 29000, 1);
weap('dvergr_codex', 'Codex of the Dvergar', 'book', 132, 132, 46, 29000, 1); weap('dvergr_lur', 'Dvergr Lur', 'lute', 166, 0, 46, 29000, 1); weap('dvergr_chain', 'Dvergr Chain-Lash', 'whip', 160, 0, 46, 29000, 1); weap('dvergr_knuckles', 'Dvergr Knuckles', 'knuckle', 166, 0, 46, 29000, 1);
weap('aesir_dirk', 'Aesir Dirk', 'dagger', 128, 0, 54, 42000, 1); weap('aesir_blade', 'Aesir Blade', 'sword', 176, 0, 54, 43000, 1); weap('aesir_wand', 'Aesir Wand', 'rod', 66, 182, 54, 43000, 1);
weap('aesir_bow', 'Aesir Bow', 'bow', 166, 0, 54, 43000, 1); weap('aesir_mace', 'Aesir Mace', 'mace', 168, 40, 54, 43000, 1); weap('aesir_spear', 'Aesir Spear', 'spear', 226, 0, 54, 46000, 1);
weap('aesir_greatsword', 'Aesir Greatsword', 'twohand', 262, 0, 54, 47000, 1); weap('aesir_staff', 'Aesir Staff', 'staff', 70, 232, 54, 46000, 1); weap('aesir_tome', 'Aesir Tome', 'book', 154, 154, 54, 46000, 1);
weap('aesir_harp', 'Aesir Harp', 'lute', 192, 0, 54, 46000, 1); weap('aesir_lash', 'Aesir Lash', 'whip', 186, 0, 54, 46000, 1); weap('aesir_fists', 'Aesir Fists', 'knuckle', 192, 0, 54, 46000, 1);
arm('dvergr_mail', 'Dvergr Mail', 'body', 17, 3, 46, 24000, 1, ['swordsman', 'acolyte']); arm('frostweave_robe', 'Frostweave Robe', 'body', 8, 24, 46, 24000, 1, ['mage', 'acolyte'], { bonus: { int: 2 } });
arm('wyrmhide_coat', 'Wyrmhide Coat', 'body', 13, 8, 46, 23000, 1); arm('dvergr_helm', 'Dvergr Helm', 'head', 9, 1, 46, 18000, 1, ['swordsman', 'acolyte']);
arm('rime_circlet', 'Rime Circlet', 'head', 3, 8, 46, 17000, 1, null, { bonus: { int: 2 } }); arm('dvergr_boots', 'Dvergr Boots', 'boots', 7, 1, 46, 16000, 1); arm('dvergr_shield', 'Dvergr Shield', 'shield', 10, 2, 46, 19000, 1, ['swordsman', 'acolyte']);
arm('aesir_plate', 'Aesir Plate', 'body', 20, 6, 54, 38000, 1, ['swordsman', 'acolyte']); arm('aesir_robe', 'Aesir Robe', 'body', 10, 30, 54, 38000, 1, ['mage', 'acolyte'], { bonus: { int: 3 } });
arm('aesir_leathers', 'Aesir Leathers', 'body', 15, 10, 54, 36000, 1, null, { bonus: { agi: 2 } }); arm('aesir_helm', 'Aesir Helm', 'head', 11, 3, 54, 30000, 1);
arm('aesir_greaves', 'Aesir Greaves', 'boots', 9, 2, 54, 28000, 1); arm('aesir_ring', 'Ring of the Aesir', 'acc', 0, 2, 50, 30000, 0, null, { bonus: { str: 3, dex: 3 } }); arm('aesir_brooch', 'Brooch of the Aesir', 'acc', 0, 4, 50, 30000, 0, null, { bonus: { int: 3, agi: 3 } });

// Gear only second classes can use (Brokkr keeps it off the racks for everyone else).
const tier2Item = t => !!(t.jobs && t.jobs.length && t.jobs.every(j => CLASSES[j] && CLASSES[j].tier >= 2));
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
// Second-class uniques: Sir Gaunt drops them (the King too, if Gaunt fell before you changed paths). `bosses` lists every boss that can drop it.
const U2 = (o) => U(Object.assign({ boss: 'sir_gaunt', bosses: ['sir_gaunt', 'ashen_king'] }, o));
weap('u_gungnir', 'Splinter of Gungnir', 'spear', 168, 0, 30, 0, 1, U2({ bonus: { str: 4, hit: 15 }, lore: 'A sliver of Odin’s spear. It never misses what it is thrown at. It was thrown at the King once.' }));
weap('u_surtbane', 'Surtbane', 'twohand', 196, 0, 30, 0, 1, U2({ bonus: { str: 5, crit: 8 }, lore: 'Forged to kill a fire giant. It has been waiting a very long time.' }));
weap('u_last_branch', 'The Last Branch', 'staff', 50, 176, 30, 0, 1, U2({ bonus: { int: 6, maxsp: 120 }, lore: 'Cut from Yggdrasil the night it burned. The wood is still warm.' }));
weap('u_galdrabok', 'Galdrabók', 'book', 120, 130, 30, 0, 1, U2({ bonus: { int: 5, dex: 3 }, lore: 'A book of spells written in a hand you almost recognise.' }));
weap('u_bragi_harp', 'Bragi’s Harp', 'lute', 150, 0, 30, 0, 1, U2({ bonus: { dex: 5, aspd: 10 }, lore: 'The god of poetry left it tuned. Nobody has dared to retune it.' }));
weap('u_gleipnir', 'Gleipnir Cord', 'whip', 144, 0, 30, 0, 1, U2({ bonus: { agi: 4, luk: 4, crit: 10 }, lore: 'Made of a cat’s footfall and a mountain’s roots. It held a wolf once.' }));
weap('u_jarngreipr', 'Járngreipr', 'knuckle', 150, 0, 30, 0, 1, U2({ bonus: { str: 4, aspd: 12 }, lore: 'Thor’s iron gloves. One is missing. The other is enough.' }));
// Ashen King
arm('u_crown', 'Crown of Cinders', 'head', 5, 5, 1, 0, 1, null, U({ boss: 'ashen_king', bonus: { str: 3, agi: 3, vit: 3, int: 3, dex: 3, luk: 3 }, lore: 'It is warm. It fits.' }));
// Round 3 MVPs. Each drops one unique usable by your class when there is one (bossDefeated in core.js).
// The Drowned Jarl
arm('u_jarl_crown', 'Crown of the Drowned', 'head', 7, 4, 36, 0, 1, null, U({ boss: 'drowned_jarl', bonus: { vit: 4, maxhpPct: 8 }, lore: 'Broken, barnacled, and still cold enough to burn.' }));
weap('u_aegir_anchor', 'Anchor of Ægir', 'mace', 160, 40, 36, 0, 1, U({ boss: 'drowned_jarl', bonus: { str: 4, vit: 3 }, lore: 'It held a longship against the storm that sank it.' }));
weap('u_ran_harpoon', 'Rán’s Harpoon', 'spear', 196, 0, 36, 0, 1, U({ boss: 'drowned_jarl', bonus: { str: 4, hit: 12 }, lore: 'The sea goddess fished for drowned men with it.' }));
weap('u_tidecaller', 'Tidecaller', 'staff', 58, 190, 36, 0, 1, U({ boss: 'drowned_jarl', bonus: { int: 5, maxsp: 120 }, lore: 'Hold it to your ear and you hear surf that stopped a thousand years ago.' }));
weap('u_rimeglass_bow', 'Rimeglass Bow', 'bow', 150, 0, 36, 0, 1, U({ boss: 'drowned_jarl', bonus: { dex: 5, aspd: 8 }, lore: 'Strung with frozen kelp that never thaws.' }));
// The Bog Crone
arm('u_crone_shawl', 'Crone’s Moss Shawl', 'body', 9, 14, 42, 0, 1, null, U({ boss: 'bog_crone', bonus: { int: 4, mdef: 5 }, lore: 'It still smells of the soup.' }));
weap('u_hexwood_rod', 'Hexwood Rod', 'rod', 50, 170, 42, 0, 1, U({ boss: 'bog_crone', bonus: { int: 5, matk: 20 }, lore: 'Every knot in the wood is a curse that did not finish.' }));
weap('u_bogthorn_whip', 'Bogthorn Lash', 'whip', 176, 0, 42, 0, 1, U({ boss: 'bog_crone', bonus: { agi: 4, luk: 4 }, lore: 'Braided from the reeds that grow where the cauldron spilled.' }));
weap('u_ladle', 'The Crone’s Ladle', 'mace', 170, 60, 42, 0, 1, U({ boss: 'bog_crone', bonus: { int: 4, vit: 4 }, lore: 'It stirred a hundred years of soup. It can stir a skull.' }));
weap('u_toadstool_bow', 'Toadstool Bow', 'bow', 170, 0, 42, 0, 1, U({ boss: 'bog_crone', bonus: { dex: 5, crit: 8 }, lore: 'The spores in the grip make your aim very calm.' }));
// Fafnir
arm('u_fafnir_scale', 'Scale of Fafnir', 'shield', 12, 4, 48, 0, 1, null, U({ boss: 'fafnir', bonus: { maxhpPct: 8, dmgRed: 5 }, lore: 'One scale from his belly. It was the only one not covered in gold.' }));
weap('u_gram', 'Gram', 'twohand', 270, 0, 48, 0, 1, U({ boss: 'fafnir', bonus: { str: 6, crit: 10 }, lore: 'Sigurd’s sword, reforged by Regin. It killed Fafnir once. It remembers how.' }));
weap('u_ridill', 'Ridill', 'dagger', 140, 0, 48, 0, 1, U({ boss: 'fafnir', bonus: { agi: 5, crit: 16 }, lore: 'Regin’s own blade. He used it to cut out the wyrm’s heart.' }));
weap('u_hoard_staff', 'Hoard-Wyrm’s Staff', 'staff', 66, 226, 48, 0, 1, U({ boss: 'fafnir', bonus: { int: 6, maxsp: 150 }, lore: 'A gold-banded staff from the bottom of the hoard. It is warm to the touch.' }));
arm('u_andvaranaut', 'Andvaranaut', 'acc', 0, 3, 48, 0, 0, null, U({ boss: 'fafnir', bonus: { luk: 6, str: 3, int: 3 }, lore: 'The ring that made more gold. It also made Fafnir.' }));
// Fenrir
weap('u_fenrir_fang', 'Fang of Fenrir', 'dagger', 172, 0, 55, 0, 1, U({ boss: 'fenrir', bonus: { agi: 6, crit: 18 }, lore: 'It bit off Tyr’s hand. It will not stop at yours.' }));
weap('u_tyrs_oath', 'Tyr’s Oath', 'sword', 240, 0, 55, 0, 1, U({ boss: 'fenrir', bonus: { str: 6, hit: 20 }, lore: 'A sword with no hilt guard, for a god who had no right hand.' }));
weap('u_moonsbane', 'Moonsbane', 'bow', 220, 0, 55, 0, 1, U({ boss: 'fenrir', bonus: { dex: 7, aspd: 12 }, lore: 'Strung with a hair from Fenrir’s tail. His sons would know it anywhere.' }));
weap('u_varg_staff', 'Staff of the Varg', 'staff', 74, 262, 55, 0, 1, U({ boss: 'fenrir', bonus: { int: 8, matk: 30 }, lore: 'A wolf’s thighbone, carved with the runes that bound him.' }));
weap('u_ragnarok_spear', 'Ragnarök', 'spear', 262, 0, 55, 0, 1, U({ boss: 'fenrir', bonus: { str: 6, agi: 4 }, lore: 'Named for the end it failed to prevent.' }));
arm('u_fenrir_mantle', 'Mantle of the Wolf', 'body', 16, 12, 55, 0, 1, null, U({ boss: 'fenrir', bonus: { str: 4, agi: 4, vit: 4 }, lore: 'Black fur that drinks the light. It is warm in a way that is not comforting.' }));

const CARDS = {
  blight_poring: { luk: 2, flee: 2 }, ash_grub: { vit: 1, maxhp: 100 }, hollow_hare: { agi: 1, luk: 1 }, cinder_drop: { dex: 1, hit: 5 }, scarecrow_husk: { str: 1, atk: 5 },
  thorn_willow: { maxsp: 60 }, mourning_spore: { int: 1, maxsp: 25 }, ash_wolf: { str: 1, crit: 4 }, kobold_archer: { dex: 2, hit: 5 }, rotwood_kobold: { atk: 15 },
  skeleton_soldier: { atk: 10, def: 2 }, grave_archer: { dex: 1, crit: 5 }, wraith: { flee: 15 }, rust_knight: { dmgRed: 12 }, cinder_thrall: { matk: 25, int: 1 },
  blight_mother: { maxhpPct: 20 }, hati: { agi: 4, aspd: 10 }, sir_gaunt: { str: 3, leech: 4 }, ashen_king: { str: 3, agi: 3, vit: 3, int: 3, dex: 3, luk: 3 },
  // Round 3
  rime_poring: { mdef: 3, maxsp: 80 }, snow_wolf: { agi: 2, crit: 5 }, draugr_fisher: { dex: 1, hit: 15 }, ice_wraith: { flee: 12, mdef: 4 }, shell_knight: { def: 4, maxhpPct: 5 },
  bog_toad: { vit: 1, maxhp: 400 }, mire_leech: { leech: 2 }, wisp: { matk: 30 }, marsh_hag: { int: 2, maxsp: 60 }, mire_troll: { str: 1, atk: 25 },
  cave_bat: { agi: 1, aspd: 5 }, crystal_spider: { luk: 2, crit: 8 }, magma_slime: { atk: 12, matk: 12 }, stone_golem: { def: 5, dmgRed: 6 }, dwarf_revenant: { str: 2, atk: 10 },
  prism_poring: { luk: 4, flee: 5 }, sky_harpy: { agi: 3, move: 5 }, rune_sentinel: { def: 3, mdef: 6 }, valkyrie_shade: { dex: 3, hit: 10, crit: 5 }, fenrir_whelp: { str: 2, crit: 6 },
  drowned_jarl: { vit: 5, maxhpPct: 15, dmgRed: 5 }, bog_crone: { int: 5, matk: 60 }, fafnir: { str: 5, atk: 40, maxhpPct: 10 }, fenrir: { str: 6, agi: 6, atk: 60, crit: 15 },
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

/* Quest items (type 'key', quest: true): cannot be sold or dropped; quests take them on turn-in. */
function questItem(id, name, o) { ITEMS[id] = Object.assign({ id, name, type: 'key', quest: true, icon: 'etc', color: '#c8a070' }, o); }
questItem('astrid_plush', 'Pip the Poring', { icon: 'plush', color: '#f29db2', desc: 'A stitched pink Poring with one button eye. It smells of smoke and of Astrid.' });
questItem('brokkr_letter', 'Brokkr’s Letter', { icon: 'letter', color: '#d8c0a0', desc: 'Soot-stained, folded small. It says “SINDRI” on the outside in letters an inch tall.' });
questItem('vidar_letter', 'Sealed Letter', { icon: 'letter', color: '#e8dcc0', desc: 'Vidar’s letter to Sigrun. The seal is an eye, closed.' });

/* ---------- Content round 4: Act II, side quests, headgear ----------
   `headgear` is the visual key for a head item (art/engine: render it on the player; see docs/CONTENT.md,
   "Headgear"). Every head item carries one, so a renderer can draw any of them the same way. */
const HEAD = (key, o) => Object.assign({ headgear: key }, o || {});
// Existing head items get their visual keys too.
Object.assign(ITEMS.bandana, { headgear: 'bandana' }); Object.assign(ITEMS.cap, { headgear: 'cap' }); Object.assign(ITEMS.circlet, { headgear: 'circlet' });
Object.assign(ITEMS.helm, { headgear: 'helm' }); Object.assign(ITEMS.dvergr_helm, { headgear: 'dvergr_helm' }); Object.assign(ITEMS.rime_circlet, { headgear: 'rime_circlet' });
Object.assign(ITEMS.aesir_helm, { headgear: 'aesir_helm' }); Object.assign(ITEMS.u_brood_hat, { headgear: 'brood_hat' }); Object.assign(ITEMS.u_gaunt_visage, { headgear: 'gaunt_visage' });
Object.assign(ITEMS.u_crown, { headgear: 'cinder_crown' }); Object.assign(ITEMS.u_jarl_crown, { headgear: 'jarl_crown' });
// Side-quest and story headgear (quest rewards and named-monster drops; unique, never sold by smiths)
const UQ = (o) => U(Object.assign({ price: 2000 }, o));
arm('straw_hat', 'Gunnar’s Straw Hat', 'head', 2, 0, 5, 0, 0, null, UQ(HEAD('straw_hat', { bonus: { luk: 1, maxhp: 40 }, lore: 'It kept the sun off a farmer for forty summers. The sun is ash now. It still keeps it off.' })));
arm('poring_hat', 'Poring Hat', 'head', 2, 2, 8, 0, 1, null, UQ(HEAD('poring_hat', { bonus: { luk: 2, maxhp: 80 }, lore: 'The Poring King’s own crown-wearer. It is asleep. Please do not wake it.' })));
arm('raven_feather', 'Raven Feather', 'head', 1, 3, 14, 0, 0, null, UQ(HEAD('raven_feather', { bonus: { dex: 2, hit: 6 }, lore: 'A black feather from one of Odin’s ravens, tucked behind the ear. It still thinks. Occasionally it remembers.' })));
arm('greyback_hood', 'Greyback Hood', 'head', 4, 0, 18, 0, 1, null, UQ(HEAD('wolf_hood', { bonus: { agi: 2, crit: 3 }, lore: 'Old Greyback’s own pelt, ears and all. The ears still twitch when wolves are near.' })));
arm('squire_plume', 'Squire’s Plumed Helm', 'head', 6, 2, 26, 0, 1, null, UQ(HEAD('squire_plume', { bonus: { vit: 3, maxhpPct: 3 }, lore: 'Einar polished it every morning for a knight who never once looked at it.' })));
arm('shellback_helm', 'Shellback Helm', 'head', 9, 2, 36, 0, 1, null, UQ(HEAD('shell_helm', { bonus: { def: 2, dmgRed: 3 }, lore: 'A hermit shell that was once a Viking helm that was once a hermit shell. Mind the barnacles.' })));
arm('boatman_hat', 'Boatman’s Hat', 'head', 5, 2, 38, 0, 1, null, UQ(HEAD('boatman_hat', { bonus: { str: 2, vit: 2 }, lore: 'Wide-brimmed, tarred, and stubborn. Bolli swears it floats.' })));
arm('amethyst_diadem', 'Amethyst Diadem', 'head', 3, 9, 46, 0, 1, null, UQ(HEAD('amethyst_diadem', { bonus: { int: 4, matk: 15 }, lore: 'The Matriarch grew it on her own back, one facet a century.' })));
arm('runehelm_str', 'Rune-Helm of the Arm', 'head', 11, 2, 48, 0, 1, null, UQ(HEAD('dvergr_runehelm', { bonus: { str: 4, atk: 12 }, lore: 'Sindri’s commission. The rune over the brow is ᚦ, for the hammer.' })));
arm('runehelm_int', 'Rune-Helm of the Mind', 'head', 7, 8, 48, 0, 1, null, UQ(HEAD('dvergr_runehelm', { bonus: { int: 4, matk: 15 }, lore: 'Sindri’s commission. The rune over the brow is ᚨ, for the god who asks questions.' })));
arm('runehelm_dex', 'Rune-Helm of the Eye', 'head', 9, 4, 48, 0, 1, null, UQ(HEAD('dvergr_runehelm', { bonus: { dex: 4, hit: 12 }, lore: 'Sindri’s commission. The rune over the brow is ᛊ, for the sun that is gone.' })));
arm('valkyrie_circlet', 'Valkyrie Circlet', 'head', 4, 8, 50, 0, 1, null, UQ(HEAD('valkyrie_circlet', { bonus: { int: 2, maxsp: 90, mdef: 3 }, lore: 'Two small silver wings. Sigrun wore one like it, once, when there was somewhere to fly to.' })));
arm('sprig_crown', 'Sprig of Yggdrasil', 'head', 5, 6, 50, 0, 1, null, UQ(HEAD('sprig_crown', { bonus: { vit: 3, maxhpPct: 6 }, lore: 'A living twig of the relit Tree, woven into a crown. It has two leaves. Eira says it will have three by spring.' })));
arm('cinder_circlet', 'Circlet of Cold Cinders', 'head', 6, 5, 50, 0, 1, null, UQ(HEAD('cinder_circlet', { bonus: { str: 3, int: 3, atk: 10 }, lore: 'The Pretender’s circlet. The embers in it went out the moment it touched a brow the Ash obeys.' })));
arm('wanderer_hat', 'Wanderer’s Hat', 'head', 4, 6, 52, 0, 1, null, UQ(HEAD('wanderer_hat', { bonus: { int: 3, dex: 3, hit: 10 }, lore: 'Broad-brimmed and grey, pulled low over one eye. He said he would not need it anymore. He was lying, a little.' })));
arm('gleipnir_band', 'Band of Gleipnir', 'head', 8, 6, 55, 0, 1, null, UQ(HEAD('gleipnir_band', { bonus: { vit: 4, dmgRed: 5 }, lore: 'The last span of the ribbon, left over when the wolf was bound. It is lighter than silk and it will never break.' })));
arm('wolf_ears', 'Ears of the Wolf', 'head', 5, 3, 55, 0, 1, null, UQ(HEAD('wolf_ears', { bonus: { agi: 4, crit: 8, move: 4 }, lore: 'Black, tufted, warm. Fenrir left them in your hands as he ran. You are fairly sure they were a joke.' })));
// Accessories and named-monster uniques
arm('pip_charm', 'Stitched Poring Charm', 'acc', 0, 2, 8, 0, 0, null, UQ({ bonus: { luk: 3, maxhp: 120 }, lore: 'Astrid sewed it from the Poring Hat’s lining and one of Pip’s spare buttons. It is lumpy. It is lucky.' }));
arm('kari_knot', 'Kari’s Luck-Knot', 'acc', 0, 1, 28, 0, 0, null, UQ({ bonus: { luk: 2, flee: 6 }, lore: 'A fisherman’s knot, tied by a boy who swears it has never once come undone.' }));
arm('wisp_lantern', 'Wisp in a Jar', 'acc', 0, 4, 38, 0, 0, null, UQ({ bonus: { int: 2, matk: 25 }, lore: 'It glows when you are sad. It glows quite a lot.' }));
arm('u_garm_collar', 'Collar of Garmr', 'acc', 0, 3, 55, 0, 0, null, UQ({ bonus: { str: 4, vit: 4 }, lore: 'The hound of Helgrind wore it at the gate for ten thousand years. It still smells of the far side.' }));
arm('u_sunfang', 'Sunfang Pendant', 'acc', 0, 2, 55, 0, 0, null, UQ({ bonus: { atk: 20, crit: 6 }, lore: 'Sköll’s milk-tooth. He chased the sun for ten thousand years, caught it once, and did not know what to do next.' }));
arm('u_cinder_signet', 'Pretender’s Signet', 'acc', 0, 2, 48, 0, 0, null, UQ({ bonus: { str: 2, int: 2, dex: 2 }, lore: 'He wanted the crown so badly he had the ring made first.' }));
// Crafting materials (rewards of the collection quests; Sindri’s commission consumes them)
etc('star_iron', 'Star-Iron Ingot', 900, '#b8c4d8'); etc('rune_thread', 'Rune-Woven Thread', 800, '#c8a0e0'); etc('gold_leaf', 'Asgard Gold Leaf', 1100, '#f0c860');
Object.assign(ITEMS.star_iron, { desc: 'A crafting material. Iron that fell from the sky before the sky burned. Sindri works it.' });
Object.assign(ITEMS.rune_thread, { desc: 'A crafting material. Thread spun with a rune in every twist. Sindri uses it to bind leather to steel.' });
Object.assign(ITEMS.gold_leaf, { desc: 'A crafting material. Beaten gold from the halls of Asgard, thin enough to read through.' });
// Act II and side-quest key items
questItem('imp_footfall', 'Footfall of a Cat', { icon: 'etc', color: '#e8e0f0', desc: 'Pip’s bell. It has never made a sound. That is the point.' });
questItem('imp_beard', 'Beard of a Woman', { icon: 'etc', color: '#8a9a6a', desc: 'A braid of grey-green hair from a Marsh Hag’s chin. Eira insists it counts.' });
questItem('imp_roots', 'Roots of a Mountain', { icon: 'etc', color: '#8a7a5a', desc: 'A knot of stone root from a golem’s chest. It is still growing, slowly, downward.' });
questItem('imp_sinew', 'Sinews of a Bear', { icon: 'etc', color: '#c89a78', desc: 'Ragna’s father’s bowstring: bear-sinew, older than Rimeshore.' });
questItem('imp_breath', 'Breath of a Fish', { icon: 'etc', color: '#9fd8ff', desc: 'A bubble of drowned air in a draugr’s lantern-glass. It does not rise.' });
questItem('imp_spittle', 'Spittle of a Bird', { icon: 'etc', color: '#f0f0ff', desc: 'A harpy’s spit, crystallised. It is exactly as pleasant as it sounds.' });
questItem('gleipnir_reforged', 'Gleipnir Reforged', { icon: 'shard', color: '#c8b8ff', desc: 'A ribbon as soft as silk, made of six things that do not exist. Two brothers forged it together. It cannot be broken by anything that is.' });
questItem('gaunt_fragment', 'Fragment of Gaunt’s Blade', { icon: 'etc', color: '#8a8aa0', desc: 'A shard of Sir Gaunt’s greatsword. Tyr’s rune is still legible on one side.' });
questItem('dead_nail', 'Dead Man’s Nail', { icon: 'etc', color: '#d8d0b8', desc: 'A fingernail from a drowned man. The draugr gather them for a ship.' });
questItem('boat_nails', 'Brokkr’s Boat Nails', { icon: 'etc', color: '#8a8a90', desc: 'Two hundred clench-nails, still warm. “Tell him they are a loan.”' });
questItem('old_sail', 'Hrafn’s Old Sail', { icon: 'etc', color: '#e0d8c0', desc: 'A patched woollen sail from before the sea froze. It smells of salt, which nothing does anymore.' });

/* ---------- Content round 5: crafting, upgrade stones, rare materials, buff food ----------
   Crafted gear (`crafted: true`) is never sold by smiths and never drops; it is made from RECIPES
   (js/data/recipes.js) and rolls a fixed quality tier (it.q: 1 Standard, 2 Fine, 3 Masterwork; it.maker).
   Buff consumables carry `buff: { id, name, secs, bonus }` (useItem in core.js); drinking another of the
   same buff id refreshes it. Upgrade stones carry `stone: { chance }` (+% refine success) or
   `stone: { ward: true }` (a failed refine loses one level instead of shattering the item). */
// Rarer high-level materials: 1.5-2.5 % from every monster of their realm (and from its MVP).
etc('frost_heart', 'Heart of Rime', 1500, '#7ac8ff'); etc('bog_pearl', 'Bog Pearl', 1700, '#c8e0a0');
etc('deep_ember', 'Deep Ember', 2000, '#ff9a3a'); etc('star_glass', 'Starglass', 2600, '#e8f0ff');
Object.assign(ITEMS.frost_heart, { rareMat: true, desc: 'A rare crafting material. A fist of sea ice that never melts; something in it still beats. From the creatures of Rimeshore.' });
Object.assign(ITEMS.bog_pearl, { rareMat: true, desc: 'A rare crafting material. Grown in a toad’s throat over a century of black water. From the creatures of Mirewell.' });
Object.assign(ITEMS.deep_ember, { rareMat: true, desc: 'A rare crafting material. A coal from the first forge of Nidavellir, still burning. From the creatures of the Deep.' });
Object.assign(ITEMS.star_glass, { rareMat: true, desc: 'A rare crafting material. A splinter of the Bifrost, holding every colour at once. From the creatures of the ruins.' });
// Upgrade stones
function stone(id, name, price, color, st, desc) { ITEMS[id] = { id, name, type: 'etc', price, color, icon: 'stone', stone: st, desc }; }
stone('ember_whetstone', 'Ember Whetstone', 2000, '#e8783a', { chance: 10 }, 'An upgrade stone. Rub it on the metal before refining: +10 % success for one refine. Consumed.');
stone('dvergr_whetstone', 'Dvergr Whetstone', 6000, '#c8a860', { chance: 20 }, 'An upgrade stone of the Deep: +20 % success for one refine. Consumed.');
stone('warding_stone', 'Warding Stone', 12000, '#9ad0ff', { ward: true }, 'An upgrade stone carved with a ward-rune. If the refine fails, the item loses one level instead of shattering. Consumed.');
// Buff food and draughts (crafted, or bought in Skaldhaven)
const buffUse = (id, name, price, color, icon, buff, desc, o) => use_(id, name, Object.assign({ price, icon, color, buff: Object.assign({ id: 'food_' + id, name }, buff), desc }, o || {}));
buffUse('skald_ale', 'Skaldhaven Ale', 120, '#d8a040', 'mug', { secs: 180, bonus: { luk: 3, crit: 3 } }, 'Restores 60–80 HP. +3 LUK and +3 CRIT for 3 minutes. Hallgerð brews it with sea-salt and spite.', { heal: [60, 80] });
buffUse('bear_stew', 'Bear Stew', 900, '#a8683a', 'bowl', { secs: 300, bonus: { vit: 5, maxhp: 300 } }, '+5 VIT and +300 Max HP for 5 minutes. There is no bear in it.');
buffUse('berserk_draught', 'Berserker’s Draught', 2800, '#c83a2a', 'potion', { secs: 180, bonus: { aspd: 12, atk: 15 } }, '+12 % attack speed and +15 ATK for 3 minutes.');
buffUse('runic_tonic', 'Runic Tonic', 2800, '#6a8aff', 'potion', { secs: 180, bonus: { matk: 30, int: 3 } }, '+30 MATK and +3 INT for 3 minutes.');
buffUse('hawk_elixir', 'Hawk-Eye Elixir', 2800, '#e8d060', 'potion', { secs: 180, bonus: { hit: 20, crit: 8 } }, '+20 HIT and +8 CRIT for 3 minutes.');
buffUse('stoneskin_salve', 'Stoneskin Salve', 3200, '#8a8680', 'bowl', { secs: 180, bonus: { def: 8, dmgRed: 5 } }, '+8 DEF and 5 % less damage taken for 3 minutes.');
buffUse('valkyrie_mead', 'Valkyrie’s Mead', 9000, '#f0e0a0', 'mug', { secs: 300, bonus: { maxhpPct: 10, str: 4, agi: 4, dex: 4 } }, 'Restores 400–500 HP. +10 % Max HP and +4 STR, AGI and DEX for 5 minutes.', { heal: [400, 500] });
// Crafted gear. Price is what it is worth to a merchant (sellPrice halves it); smiths never sell it.
const CR = o => Object.assign({ crafted: true }, o);
arm('cr_pelt_hood', 'Ashen Pelt Hood', 'head', 3, 1, 14, 2400, 1, null, CR(HEAD('pelt_hood', { bonus: { agi: 1, flee: 3 } })));
arm('cr_hunter_boots', 'Hunter’s Boots', 'boots', 3, 0, 18, 3200, 1, null, CR({ bonus: { agi: 1, move: 4 } }));
arm('cr_bone_mail', 'Bone-Lamellar', 'body', 9, 1, 22, 5600, 1, null, CR({ bonus: { vit: 2 } }));
arm('cr_spirit_charm', 'Wraith-Glass Charm', 'acc', 0, 3, 24, 4800, 0, null, CR({ bonus: { int: 2, maxsp: 60 } }));
weap('cr_ember_blade', 'Ember-Forged Blade', 'sword', 92, 0, 26, 8000, 1, CR({ bonus: { atk: 6, str: 1 } }));
weap('cr_frost_spear', 'Rimefang Spear', 'spear', 150, 0, 36, 14000, 1, CR({ bonus: { agi: 2, crit: 4 } }));
arm('cr_rime_cloak', 'Rimeweave Cloak', 'body', 9, 8, 36, 14000, 1, null, CR({ bonus: { int: 2, mdef: 2 } }));
arm('cr_shellguard', 'Shellguard', 'shield', 9, 2, 38, 14000, 1, null, CR({ bonus: { vit: 2, maxhp: 300 } }));
arm('cr_moss_treads', 'Troll-Moss Treads', 'boots', 6, 1, 42, 16000, 1, null, CR({ bonus: { vit: 2, move: 5 } }));
arm('cr_wisp_lantern', 'Wisp-Lantern Charm', 'acc', 0, 4, 40, 18000, 0, null, CR({ bonus: { matk: 25, int: 2 } }));
arm('cr_amethyst_circlet', 'Amethyst Circlet', 'head', 4, 6, 45, 22000, 1, null, CR(HEAD('amethyst_circlet', { bonus: { int: 3, luk: 2 } })));
weap('cr_magma_hammer', 'Magma-Core Hammer', 'mace', 160, 30, 46, 28000, 1, CR({ bonus: { str: 3 } }));
weap('cr_crystal_bow', 'Crystal-String Bow', 'bow', 150, 0, 46, 28000, 1, CR({ bonus: { dex: 3 } }));
weap('cr_rune_rod', 'Rune-Graven Rod', 'rod', 58, 165, 46, 28000, 1, CR({ bonus: { int: 3 } }));
arm('cr_harpy_mantle', 'Harpy-Feather Mantle', 'body', 12, 10, 52, 36000, 1, null, CR({ bonus: { agi: 3, flee: 10 } }));
weap('cr_skybreaker', 'Skybreaker', 'twohand', 272, 0, 54, 52000, 1, CR({ bonus: { str: 4, crit: 5 } }));
arm('cr_aesir_band', 'Band of the Aesir', 'acc', 0, 4, 55, 52000, 0, null, CR({ bonus: { str: 2, agi: 2, vit: 2, int: 2, dex: 2, luk: 2 } }));
// The material quests' outputs are crafting materials now too.
for (const id of ['star_iron', 'rune_thread', 'gold_leaf']) { ITEMS[id].desc += ' It can be crafted.'; ITEMS[id].refinedMat = true; }   // never sold as junk
// Every material says what it is for.
for (const id in ITEMS) { const t = ITEMS[id]; if (t.type === 'etc' && !t.stone && t.desc === 'A material. Brokkr pays for these.') t.desc = 'A crafting material. Smiths buy it, and crafters use it (see the Crafting window at Brokkr or Sindri).'; }

/* =========================================================
   Content round 6: pets (RO-style taming), the rebirth chain's key item
   PETS[mobKey]: tame = the taming item, rate = base capture % (see tameChance in js/core.js), bonus = what the pet
   gives while intimacy is Cordial or better (PET_BONUS_AT), trick = its happy emote. The pet itself is drawn from
   the monster's own sheet (mob_<key>) at 0.6 scale through COMPANIONS (js/gfx-sheets.js).
   Eggs are one item per pet (`nostack`): the pet's name, hunger and intimacy ride on the egg item (it.pet) while it
   sleeps, and on P.pet while it is out. Taming items and Pet Food are sold by Ylva's stable in Skaldhaven.
   ========================================================= */
const PETS = {
  blight_poring: { tame: 'poring_candy', rate: 30, bonus: { luk: 2, crit: 1 }, trick: 'bounces in a happy circle' },
  hollow_hare: { tame: 'moon_carrot', rate: 28, bonus: { agi: 2, flee: 3 }, trick: 'thumps a hind foot' },
  cinder_drop: { tame: 'ember_sugar', rate: 25, bonus: { maxhp: 150, maxsp: 20 }, trick: 'glows a little warmer' },
  ash_wolf: { tame: 'marrow_bone', rate: 18, bonus: { atk: 8, crit: 1 }, trick: 'howls at nothing in particular' },
  rotwood_kobold: { tame: 'shiny_trinket', rate: 16, bonus: { str: 2, hit: 4 }, trick: 'shows you something shiny it found' },
  rime_poring: { tame: 'frost_candy', rate: 14, bonus: { int: 2, mdef: 2 }, trick: 'leaves a little trail of frost' },
  bog_toad: { tame: 'jar_of_midges', rate: 12, bonus: { vit: 2, maxhpPct: 3 }, trick: 'catches a fly out of the air' },
  prism_poring: { tame: 'prism_candy', rate: 8, bonus: { dex: 2, matk: 10 }, trick: 'splits the light into a rainbow' },
};
const PET_HUNGER_SECS = 60;     // hunger falls 1 point (of 100) per minute while the pet is out
const PET_BONUS_AT = 750;       // intimacy (of 1000) at which the pet's bonus applies (Cordial)
const PET_START = { hunger: 60, intim: 250 };
function tameItem(id, name, mob, price, color, desc) { use_(id, name, { effect: 'tame', tames: mob, price, icon: 'candy', color, desc: `${desc} Use it near a ${MOBS[mob].name} to try to tame it (a weaker one is easier). Consumed either way.` }); }
tameItem('poring_candy', 'Poring Candy', 'blight_poring', 400, '#f08aa8', 'A pink boiled sweet. Blight Porings cannot resist sugar, even now.');
tameItem('moon_carrot', 'Moon Carrot', 'hollow_hare', 600, '#e8d8a0', 'A pale carrot grown by moonlight.');
tameItem('ember_sugar', 'Ember Sugar', 'cinder_drop', 800, '#ff9a4a', 'Sugar burned just enough to smoke.');
tameItem('marrow_bone', 'Bitter Marrowbone', 'ash_wolf', 1500, '#e8e0d0', 'A bone with the marrow still in it. Bitter to men, sweet to wolves.');
tameItem('shiny_trinket', 'Shiny Trinket', 'rotwood_kobold', 1800, '#e8c050', 'A brass button polished until it could blind a kobold.');
tameItem('frost_candy', 'Frost Candy', 'rime_poring', 3500, '#bfe6ff', 'Candy that never melts. Rime Porings think it is their mother.');
tameItem('jar_of_midges', 'Jar of Midges', 'bog_toad', 4500, '#8aa05a', 'A jar full of whining midges. Delicious, apparently.');
tameItem('prism_candy', 'Prism Candy', 'prism_poring', 9000, '#f0d0ff', 'A sweet that holds every colour at once, cut from Bifrost glass.');
use_('pet_food', 'Pet Food', { effect: 'petfood', price: 60, icon: 'bowl', color: '#c8a070', desc: 'Feeds the pet you have out (the Pet window, P, feeds it too). A hungry pet grows fond of you; an overfed one sulks.' });
for (const k in PETS) use_('egg_' + k, `${MOBS[k].name} Egg`, { effect: 'egg', pet: k, nostack: true, price: 200, icon: 'egg', color: (MOBS[k].look && MOBS[k].look.body) || MOBS[k].col || '#e8d8c0',
  desc: `A tamed ${MOBS[k].name}, asleep in its egg. Use it to hatch it (one pet at a time). While out it gives ${Object.entries(PETS[k].bonus).map(([a, v]) => bonusLine(a, v)).join(', ')} once it is Cordial.` });
// Rebirth chain (js/data/quests.js reborn_1..3): the water of the Norns' well, poured on the Heart of Yggdrasil.
questItem('urd_water', 'Water of Urðr', { icon: 'potion', color: '#d8f0ff', desc: 'Water from the Norns’ well at the root of the sky. It is heavier than water should be, and it remembers everything that ever happened. Pour it on the Heart of Yggdrasil.' });

/* =========================================================
   Content round 7: Helheim (materials, endgame consumables, the Obol currency, Garmr's and Níðhöggr's uniques,
   the Helheim cards, quest rewards). Tuned for reborn heroes at Base Lv 70-99.
   ========================================================= */
etc('gjoll_ice', 'Gjöll Ice', 420, '#bcd8e0'); etc('soul_ember', 'Lost Soul’s Ember', 400, '#9affc8'); etc('hel_chain', 'Hound-Chain Link', 440, '#8a8278');
etc('grave_rose', 'Grave Rose', 460, '#c8a0c8'); etc('rot_scale', 'Rot-Wyrm Scale', 500, '#4a5a2a'); etc('colossus_marrow', 'Giant’s Marrow', 520, '#e8dcc0');
Object.assign(ITEMS.gjoll_ice, { desc: 'A crafting material. River-ice from Gjöll that never melts; faces move under it. From Hel’s draugr.' });
Object.assign(ITEMS.soul_ember, { desc: 'A crafting material. The last warm thing a lost soul carried. It is not sad about being used. It is relieved.' });
Object.assign(ITEMS.hel_chain, { desc: 'A crafting material. A link of the chains the hounds of Hel wear, and snap, and wear again.' });
Object.assign(ITEMS.grave_rose, { desc: 'A crafting material. A rose from a corpse bride’s bouquet. It will not wilt. It is already dead.' });
Object.assign(ITEMS.rot_scale, { desc: 'A crafting material. A scale from Níðhöggr’s brood, green on the underside, and warm.' });
Object.assign(ITEMS.colossus_marrow, { desc: 'A crafting material. Marrow from the fused bones of a colossus of the dead. Sindri says it takes an edge like dragon-horn.' });
etc('black_sun_shard', 'Shard of the Black Sun', 3200, '#1a1a1e');
Object.assign(ITEMS.black_sun_shard, { rareMat: true, desc: 'A rare crafting material. A splinter of the lightless sun over Helheim. Its corona burns cold. From the creatures of Helheim (and every one of Hel’s great beasts).' });
// Hel's Obol: the coin the dead carry. Earned in the Deep, the Gauntlet and from Helheim's bounties; Gauti trades them.
etc('hel_obol', 'Hel’s Obol', 1, '#c8b890');
Object.assign(ITEMS.hel_obol, { obol: true, desc: 'A coin of the dead, stamped with Hel’s half-face. The living cannot spend it. Gauti the Grave-Trader, in Helheim’s camp, can.' });
// Endgame consumables (Gauti's stall in Helheim, crafting, drops)
use_('gjoll_draught', 'Draught of Gjöll', { heal: [1500, 1900], price: 4200, icon: 'potion', color: '#bfe8f0', desc: 'Restores 1,500–1,900 HP. River water from Gjöll, cold enough to stop your heart for a moment. It starts again, stronger.' });
use_('soul_tonic', 'Soul Tonic', { sp: [250, 320], price: 5200, icon: 'potion', color: '#8affc0', desc: 'Restores 250–320 SP. Distilled from what the lost souls leave behind.' });
buffUse('grave_bread', 'Grave-Bread', 6000, '#b8a88a', 'bowl', { secs: 600, bonus: { maxhpPct: 8, vit: 4 } }, '+8 % Max HP and +4 VIT for 10 minutes. Hel’s cooks bake it for the dead, who cannot taste it. You can. It is terrible.');
buffUse('warding_ash', 'Warding Ash', 9000, '#9a9890', 'potion', { secs: 300, bonus: { dmgRed: 8, mdef: 6 } }, '8 % less damage taken and +6 MDEF for 5 minutes. Ash from Móðguðr’s lantern, rubbed into the skin.');
buffUse('eljudnir_mead', 'Mead of Eljudnir', 12000, '#7affb4', 'mug', { secs: 300, bonus: { atk: 40, matk: 40, aspd: 8 } }, 'Restores 800–1,000 HP. +40 ATK and MATK and +8 % attack speed for 5 minutes. Poured at Hel’s own table.', { heal: [800, 1000] });
use_('golden_apple', 'Golden Apple', { effect: 'full', price: 15000, icon: 'apple', color: '#f0c850', desc: 'Fully restores HP and SP. One of Iðunn’s apples, found in the roots. The gods grew old without them.', noshop: true });
// Quest items (Act III)
questItem('root_splinter', 'Splinter of the World-Root', { icon: 'etc', color: '#c8a870', desc: 'A splinter of Yggdrasil’s root, gnawed off by Níðhöggr’s brood. It is still alive. It is trying to grow back.' });
// Garmr (Helheim MVP, Lv 88): uniques for every family his usable pool reaches
const UG = o => U(Object.assign({ boss: 'garmr' }, o)), UN = o => U(Object.assign({ boss: 'nidhogg' }, o));
weap('u_garm_fang', 'Fang of Garmr', 'dagger', 205, 0, 82, 0, 1, UG({ bonus: { agi: 7, crit: 18, leech: 2 }, lore: 'He bit the chain for ten thousand years. The chain lost.' }));
weap('u_garm_tooth', 'Hound-Tooth Blade', 'sword', 272, 0, 82, 0, 1, UG({ bonus: { str: 7, hit: 20 }, lore: 'A sword ground from one of Garmr’s eye-teeth. It still bays in the scabbard.' }));
weap('u_garm_chain', 'Chain of Eljudnir', 'whip', 246, 0, 82, 0, 1, UG({ bonus: { dex: 7, aspd: 10 }, lore: 'The chain that held him to Hel’s door. You snapped it. It holds a grudge.' }));
weap('u_garm_maw', 'Maw of the Gate', 'knuckle', 256, 0, 82, 0, 1, UG({ bonus: { str: 7, crit: 10 }, lore: 'Two jawbones, worn like gauntlets. They bite on their own.' }));
weap('u_bloodhowl_bow', 'Bloodhowl', 'bow', 252, 0, 82, 0, 1, UG({ bonus: { dex: 8, crit: 8 }, lore: 'Strung with a gut from the open chest. Every arrow howls.' }));
weap('u_bloodhowl_staff', 'Staff of the Four Eyes', 'staff', 84, 302, 82, 0, 1, UG({ bonus: { int: 8, matk: 40 }, lore: 'Four red stones at the head. They blink, one pair at a time.' }));
arm('u_garm_mantle', 'Mantle of the Hound', 'body', 22, 12, 82, 0, 1, null, UG({ bonus: { vit: 6, maxhpPct: 8 }, lore: 'The blood-red mane, tanned. It is never quite dry.' }));
Object.assign(ITEMS.u_garm_collar, { bosses: [] });   // the Act II collar stays the quest hunt's own drop
// Níðhöggr (superboss, Lv 99)
weap('u_rootgnawer', 'Rootgnawer', 'twohand', 348, 0, 92, 0, 1, UN({ bonus: { str: 9, crit: 12 }, lore: 'A blade of the dragon’s own tooth. It ate through the root of the world. It will get through you.' }));
weap('u_malice_striker', 'Malice-Striker', 'spear', 332, 0, 92, 0, 1, UN({ bonus: { str: 8, agi: 5 }, lore: 'Níðhöggr’s name means Malice-Striker. So does this spear’s. They argue about it.' }));
weap('u_nidhogg_fang', 'Fang of the Corpse-Wyrm', 'dagger', 228, 0, 92, 0, 1, UN({ bonus: { agi: 8, crit: 22 }, lore: 'It weeps green. The wound it leaves does not close until you say sorry to it.' }));
weap('u_hvergelmir', 'Hvergelmir', 'staff', 92, 342, 92, 0, 1, UN({ bonus: { int: 10, matk: 60 }, lore: 'A root-staff dipped in the roaring kettle, where every river of the dead begins.' }));
weap('u_corpse_lyre', 'Corpse-Wyrm’s Lyre', 'lute', 272, 0, 92, 0, 1, UN({ bonus: { dex: 8, int: 4 }, lore: 'Strung with the wyrm’s sinews. The songs are not happy.' }));
weap('u_wyrmbone_bow', 'Wyrmbone Bow', 'bow', 282, 0, 92, 0, 1, UN({ bonus: { dex: 9, aspd: 12 }, lore: 'A rib, bent until it agreed.' }));
weap('u_skullmace', 'Skull of Náströnd', 'mace', 286, 60, 92, 0, 1, UN({ bonus: { str: 6, int: 6 }, lore: 'One of the skulls from the dragon’s hide. It still screams, very quietly, when it hits.' }));
arm('u_nidhogg_hide', 'Hide of Níðhöggr', 'body', 26, 16, 92, 0, 1, null, UN({ bonus: { vit: 8, dmgRed: 8 }, lore: 'Rot-green on the underside. Skulls in it. Nothing gets through.' }));
arm('u_black_sun', 'Heart of the Black Sun', 'acc', 0, 6, 90, 0, 0, null, UN({ bonus: { str: 4, agi: 4, vit: 4, int: 4, dex: 4, luk: 4 }, lore: 'The dragon swallowed a sliver of Hel’s sun. It is cold and it is heavy and it is yours.' }));
// Side-quest rewards in Helheim
arm('u_hlin_brooch', 'Hlín’s Brooch', 'acc', 0, 4, 72, 0, 0, null, UQ({ bonus: { maxhpPct: 5, mdef: 4, luk: 3 }, lore: 'Frigg gave it to her handmaiden so the goddess could always find her. Hlín gave it to you for the same reason.' }));
arm('u_modgud_lantern', 'Móðguðr’s Lantern', 'acc', 0, 5, 76, 0, 0, null, UQ({ bonus: { int: 3, mdef: 5, maxsp: 200 }, lore: 'The flameless lantern of the bridge. It lights now, when you hold it, and only then.' }));
arm('u_nameless_helm', 'Crown of the Nameless', 'head', 12, 6, 84, 0, 1, null, UQ(HEAD('jarl_crown', { bonus: { vit: 5, str: 3, dmgRed: 4 }, lore: 'A crown of river-ice. The king who wore it forgot his name. You will remember yours better for it.' })));
// Cards (every monster has a card; the bonus comes from CARDS)
Object.assign(CARDS, {
  hel_draugr: { vit: 3, def: 4 }, soul_wisp: { int: 3, matk: 40 }, hel_hound: { agi: 3, aspd: 6 }, corpse_bride: { mdef: 6, maxsp: 150 },
  nidhogg_spawn: { str: 3, crit: 8 }, bone_colossus: { maxhpPct: 12, vit: 2 },
  garmr: { str: 5, agi: 5, atk: 50, leech: 3 }, nidhogg: { str: 6, int: 6, atk: 70, matk: 70, maxhpPct: 10 },
});
for (const k of ['hel_draugr', 'soul_wisp', 'hel_hound', 'corpse_bride', 'nidhogg_spawn', 'bone_colossus', 'garmr', 'nidhogg'])
  ITEMS['c_' + k] = { id: 'c_' + k, name: MOBS[k].name + ' Card', type: 'card', bonus: CARDS[k], price: MOBS[k].boss ? 4000 : 40, icon: 'card', color: MOBS[k].col || (MOBS[k].look && MOBS[k].look.body) || '#888', mob: k, desc: 'Insert into equipment with a free slot. Cannot be removed.' };
// Crafted Gjöll-forged gear (Sindri; js/data/recipes.js)
arm('cr_gjoll_plate', 'Gjöll-Forged Plate', 'body', 24, 6, 80, 62000, 1, ['swordsman', 'acolyte'], CR({ bonus: { vit: 4, maxhpPct: 5 } }));
arm('cr_soul_robe', 'Soulweave Robe', 'body', 12, 32, 80, 62000, 1, ['mage', 'acolyte'], CR({ bonus: { int: 5, maxsp: 200 } }));
arm('cr_hound_hide', 'Houndhide Jerkin', 'body', 18, 14, 80, 60000, 1, null, CR({ bonus: { agi: 4, flee: 12 } }));
arm('cr_hound_boots', 'Hound-Chain Boots', 'boots', 11, 3, 78, 48000, 1, null, CR({ bonus: { agi: 3, move: 6 } }));
arm('cr_bone_shield', 'Colossus-Bone Shield', 'shield', 16, 3, 80, 52000, 1, null, CR({ bonus: { vit: 3, maxhp: 600 } }));
arm('cr_grave_circlet', 'Grave-Rose Circlet', 'head', 6, 10, 78, 46000, 1, null, CR(HEAD('rime_circlet', { bonus: { int: 3, mdef: 3 } })));
// Act III: what Hel pays (act3_6, the choice in her hall)
arm('u_hel_mercy', 'Hel’s Mercy', 'acc', 0, 6, 90, 0, 0, null, UQ({ bonus: { vit: 6, maxhpPct: 10, mdef: 4 }, lore: 'A plain iron ring from Hel’s own hand. The dead of Midgard lie still because of it. Sometimes you can hear them sleeping.' }));
arm('u_vidar_shoe', 'Víðarr’s Shoe', 'boots', 14, 4, 90, 0, 1, null, UQ({ bonus: { str: 5, agi: 5, move: 6 }, lore: 'The thick shoe Vidar was to wear at the end of the world, pieced from every scrap of leather ever trimmed from a shoe. Hel kept it for him. He does not need it now.' }));
arm('u_hel_seal', 'Heart of Níðhöggr', 'acc', 0, 4, 90, 0, 0, null, UQ({ bonus: { str: 5, int: 5, dex: 5, atk: 30, matk: 30 }, lore: 'Still beating, slowly, cold. Nothing that crawls under the Tree will mistake you for food again.' }));
// Cycle 9 (world expansion): trinkets of the caves' mini-bosses (always dropped; no headgear sheets needed).
arm('u_den_fang', 'Den-Mother’s Fang', 'acc', 0, 0, 12, 0, 0, null, UQ({ from: 'den_mother', bonus: { atk: 8, agi: 2 }, lore: 'A fang as long as a finger, on a thong of wolf-gut. It still smells of the den.' }));
arm('u_barrow_ring', 'Bear-Arm’s Ring', 'acc', 1, 0, 22, 0, 0, null, UQ({ from: 'barrow_wight', bonus: { str: 3, vit: 3 }, lore: 'Hrothgar’s arm-ring, bronze gone green. It fits any arm that has held something against the cold.' }));
arm('u_helmsman_torc', 'Helmsman’s Torc', 'acc', 0, 4, 36, 0, 0, null, UQ({ from: 'frozen_helmsman', bonus: { int: 3, dex: 2, maxsp: 60 }, lore: 'A silver torc rimed with salt that never melts. Wearing it, you can hear the sea from anywhere.' }));
arm('u_lurker_eye', 'Lurker’s Eye', 'acc', 0, 2, 42, 0, 0, null, UQ({ from: 'grotto_lurker', bonus: { dex: 4, crit: 3 }, lore: 'A bog-folk brooch with a green stone for an eye. The troll wore it for three hundred years. It saw everything he did.' }));
arm('u_foreman_signet', 'Foreman’s Signet', 'acc', 1, 1, 47, 0, 0, null, UQ({ from: 'iron_foreman', bonus: { str: 3, vit: 3, maxhpPct: 4 }, lore: 'The foreman’s seal, a hammer over twelve marks. Press it into wax and it counts the shift for you.' }));
arm('u_gnawer_tooth', 'Root-Gnawer’s Tooth', 'acc', 0, 3, 82, 0, 0, null, UQ({ from: 'root_gnawer', bonus: { atk: 30, matk: 30, luk: 4 }, lore: 'The tooth that nearly bit through a root of the World Tree. It is warm. It is still hungry.' }));
