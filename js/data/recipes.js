'use strict';
/* =========================================================
   Data: crafting recipes, vendors, services and economy constants (content round 5)
   Loaded after js/data/quests.js and before js/core.js (index.html, or the loader at the end of
   js/data/quests.js while index.html does not list this file yet). Reads ITEMS at load time (checks).
   Engine: craft*, storage*, mail*, enchant*, cardRemove*, vendor* in js/core.js; windows in js/ui.js.
   See docs/CONTENT.md, "Content round 5".
   ========================================================= */

/* ---------- Crafting ----------
   recipe(id, {
     name,                     shown in the Crafting window (defaults to the output item's name)
     at: ['brokkr', 'sindri'], which smiths can make it (Brokkr in Emberhold, Sindri in Nidavellir)
     cat: 'use' | 'stone' | 'mat' | 'gear',
     out: [itemId, qty],       what a success gives (gear is made one at a time and rolls a quality tier)
     mats: [[itemId, qty]],    consumed on every attempt, success or not (RO rules)
     fee,                      zeny, paid on every attempt (a zeny sink)
     lvl,                      Craftsmanship level needed
     base,                     base success % (before Craftsmanship, DEX and LUK; see craftChance in core.js)
   })
   Quality tiers for crafted gear (fixed, not random affixes): Standard, Fine (+10 % base ATK/MATK/DEF/MDEF),
   Masterwork (+20 % and one extra card slot, max 2). Chances: craftQualityOdds() in core.js. */
const RECIPES = {};
function recipe(id, o) { RECIPES[id] = Object.assign({ id, at: ['brokkr', 'sindri'], cat: 'use', fee: 0, lvl: 1, base: 90 }, o); }
const QUALITY = [null, { name: 'Standard', mul: 1 }, { name: 'Fine', mul: 1.1 }, { name: 'Masterwork', mul: 1.2, slot: 1 }];

// Consumables (both smiths; Brokkr's forge keeps a still in the back, Sindri's keeps a bigger one)
recipe('r_red_potion', { out: ['red_potion', 5], mats: [['jellopy', 4], ['clover', 2]], fee: 40, lvl: 1, base: 96 });
recipe('r_fly_wing', { out: ['fly_wing', 5], mats: [['fluff', 5], ['jellopy', 2]], fee: 50, lvl: 1, base: 95 });
recipe('r_orange_potion', { out: ['orange_potion', 5], mats: [['spore', 3], ['tree_root', 3]], fee: 250, lvl: 1, base: 92 });
recipe('r_blue_potion', { out: ['blue_potion', 3], mats: [['spore', 4], ['fluff', 6], ['kobold_hair', 2]], fee: 450, lvl: 2, base: 88 });
recipe('r_butterfly_wing', { out: ['butterfly_wing', 2], mats: [['wolf_pelt', 1], ['fluff', 4], ['burlap', 2]], fee: 120, lvl: 1, base: 92 });
recipe('r_bear_stew', { out: ['bear_stew', 3], mats: [['wolf_pelt', 2], ['bone_shard', 2], ['tree_root', 2]], fee: 400, lvl: 2, base: 88 });
recipe('r_yellow_potion', { out: ['yellow_potion', 4], mats: [['cinder_ash', 2], ['ectoplasm', 2]], fee: 700, lvl: 2, base: 86 });
recipe('r_white_potion', { out: ['white_potion', 3], mats: [['troll_moss', 2], ['frost_jelly', 2]], fee: 1100, lvl: 3, base: 84 });
recipe('r_berserk_draught', { out: ['berserk_draught', 3], mats: [['leech_teeth', 2], ['cinder_ash', 2]], fee: 1500, lvl: 3, base: 82 });
recipe('r_runic_tonic', { out: ['runic_tonic', 3], mats: [['wisp_flame', 2], ['rime_essence', 1]], fee: 1500, lvl: 3, base: 82 });
recipe('r_hawk_elixir', { out: ['hawk_elixir', 3], mats: [['bat_wing', 2], ['frost_mane', 1]], fee: 1500, lvl: 3, base: 82 });
recipe('r_stoneskin_salve', { out: ['stoneskin_salve', 3], mats: [['hermit_shell', 2], ['rune_stone', 1]], fee: 1800, lvl: 4, base: 80 });
recipe('r_honey_mead', { out: ['honey_mead', 2], mats: [['prism_shard', 2], ['harpy_feather', 1]], fee: 2200, lvl: 5, base: 78 });
recipe('r_valkyrie_mead', { out: ['valkyrie_mead', 2], mats: [['valkyrie_plume', 2], ['honey_mead', 1], ['gold_leaf', 1]], fee: 5000, lvl: 6, base: 72 });
// Upgrade stones (refining helpers; see doRefine in js/ui.js)
recipe('r_ember_whetstone', { cat: 'stone', out: ['ember_whetstone', 1], mats: [['cinder_ash', 3], ['rusted_chain', 3], ['wolf_claw', 4]], fee: 800, lvl: 2, base: 80 });
recipe('r_dvergr_whetstone', { cat: 'stone', at: ['sindri'], out: ['dvergr_whetstone', 1], mats: [['dvergr_ore', 2], ['magma_core', 2], ['amethyst', 1]], fee: 3000, lvl: 5, base: 70 });
recipe('r_warding_stone', { cat: 'stone', at: ['sindri'], out: ['warding_stone', 1], mats: [['rune_stone', 2], ['hermit_shell', 2], ['bone_charm', 2], ['frost_heart', 1]], fee: 6000, lvl: 6, base: 65 });
// Refined materials (the quest materials of round 4 can now be made)
recipe('r_star_iron', { cat: 'mat', at: ['sindri'], out: ['star_iron', 1], mats: [['dvergr_ore', 3], ['magma_core', 1]], fee: 400, lvl: 3, base: 85 });
recipe('r_rune_thread', { cat: 'mat', out: ['rune_thread', 1], mats: [['draugr_net', 2], ['frost_mane', 2], ['wisp_flame', 1]], fee: 400, lvl: 3, base: 85 });
recipe('r_gold_leaf', { cat: 'mat', at: ['sindri'], out: ['gold_leaf', 1], mats: [['aesir_core', 2], ['prism_shard', 2]], fee: 500, lvl: 5, base: 80 });
// Gear (Brokkr: up to Lv 30; Sindri: the deep-forged work)
recipe('r_pelt_hood', { cat: 'gear', at: ['brokkr'], out: ['cr_pelt_hood', 1], mats: [['wolf_pelt', 4], ['kobold_hair', 4], ['fluff', 6]], fee: 1200, lvl: 1, base: 80 });
recipe('r_hunter_boots', { cat: 'gear', at: ['brokkr'], out: ['cr_hunter_boots', 1], mats: [['wolf_pelt', 3], ['tree_root', 6], ['burlap', 6]], fee: 2000, lvl: 1, base: 78 });
recipe('r_bone_mail', { cat: 'gear', at: ['brokkr'], out: ['cr_bone_mail', 1], mats: [['bone_shard', 8], ['rusted_chain', 4], ['wolf_pelt', 2]], fee: 3500, lvl: 2, base: 74 });
recipe('r_spirit_charm', { cat: 'gear', at: ['brokkr'], out: ['cr_spirit_charm', 1], mats: [['ectoplasm', 6], ['bone_shard', 3], ['spore', 4]], fee: 3000, lvl: 2, base: 74 });
recipe('r_ember_blade', { cat: 'gear', at: ['brokkr'], out: ['cr_ember_blade', 1], mats: [['cinder_ash', 6], ['rusted_chain', 4], ['wolf_claw', 6]], fee: 5000, lvl: 3, base: 70 });
recipe('r_frost_spear', { cat: 'gear', at: ['brokkr', 'sindri'], out: ['cr_frost_spear', 1], mats: [['frost_mane', 5], ['rime_essence', 3], ['draugr_net', 3], ['frost_heart', 1]], fee: 9000, lvl: 3, base: 68 });
recipe('r_rime_cloak', { cat: 'gear', at: ['sindri'], out: ['cr_rime_cloak', 1], mats: [['frost_mane', 5], ['rime_essence', 3], ['draugr_net', 4]], fee: 9000, lvl: 3, base: 70 });
recipe('r_shellguard', { cat: 'gear', at: ['sindri'], out: ['cr_shellguard', 1], mats: [['hermit_shell', 6], ['frost_jelly', 4], ['draugr_net', 2]], fee: 9000, lvl: 3, base: 70 });
recipe('r_moss_treads', { cat: 'gear', at: ['sindri'], out: ['cr_moss_treads', 1], mats: [['troll_moss', 5], ['toad_skin', 5], ['leech_teeth', 3]], fee: 10000, lvl: 4, base: 68 });
recipe('r_wisp_lantern', { cat: 'gear', at: ['sindri'], out: ['cr_wisp_lantern', 1], mats: [['wisp_flame', 5], ['bone_charm', 3], ['bog_pearl', 1]], fee: 12000, lvl: 4, base: 66 });
recipe('r_amethyst_circlet', { cat: 'gear', at: ['sindri'], out: ['cr_amethyst_circlet', 1], mats: [['amethyst', 6], ['bat_wing', 4], ['star_iron', 1]], fee: 15000, lvl: 5, base: 64 });
recipe('r_magma_hammer', { cat: 'gear', at: ['sindri'], out: ['cr_magma_hammer', 1], mats: [['magma_core', 6], ['dvergr_ore', 4], ['star_iron', 2], ['deep_ember', 1]], fee: 18000, lvl: 5, base: 62 });
recipe('r_crystal_bow', { cat: 'gear', at: ['sindri'], out: ['cr_crystal_bow', 1], mats: [['amethyst', 6], ['bat_wing', 4], ['rune_thread', 2], ['deep_ember', 1]], fee: 18000, lvl: 5, base: 62 });
recipe('r_rune_rod', { cat: 'gear', at: ['sindri'], out: ['cr_rune_rod', 1], mats: [['rune_stone', 6], ['amethyst', 3], ['rune_thread', 2], ['deep_ember', 1]], fee: 18000, lvl: 5, base: 62 });
recipe('r_harpy_mantle', { cat: 'gear', at: ['sindri'], out: ['cr_harpy_mantle', 1], mats: [['harpy_feather', 6], ['valkyrie_plume', 3], ['rune_thread', 2], ['star_glass', 1]], fee: 25000, lvl: 6, base: 58 });
recipe('r_skybreaker', { cat: 'gear', at: ['sindri'], out: ['cr_skybreaker', 1], mats: [['aesir_core', 5], ['prism_shard', 4], ['star_iron', 3], ['star_glass', 1]], fee: 40000, lvl: 7, base: 55 });
recipe('r_aesir_band', { cat: 'gear', at: ['sindri'], out: ['cr_aesir_band', 1], mats: [['aesir_core', 4], ['gold_leaf', 2], ['gleipnir_link', 2], ['star_glass', 1]], fee: 40000, lvl: 7, base: 55 });
// Round 7: Helheim materials (Sindri forges the Gjöll-forged gear; both smiths brew the draughts)
recipe('r_gjoll_draught', { out: ['gjoll_draught', 3], mats: [['gjoll_ice', 2], ['soul_ember', 1]], fee: 3000, lvl: 6, base: 76 });
recipe('r_soul_tonic', { out: ['soul_tonic', 2], mats: [['soul_ember', 2], ['grave_rose', 1]], fee: 3500, lvl: 6, base: 74 });
recipe('r_grave_bread', { out: ['grave_bread', 2], mats: [['colossus_marrow', 1], ['rot_scale', 1], ['bone_shard', 2]], fee: 4000, lvl: 6, base: 72 });
recipe('r_warding_ash', { out: ['warding_ash', 2], mats: [['hel_chain', 2], ['gjoll_ice', 1], ['black_sun_shard', 1]], fee: 6000, lvl: 7, base: 68 });
recipe('r_gjoll_plate', { cat: 'gear', at: ['sindri'], out: ['cr_gjoll_plate', 1], mats: [['gjoll_ice', 8], ['hel_chain', 4], ['colossus_marrow', 2], ['black_sun_shard', 1]], fee: 60000, lvl: 8, base: 52 });
recipe('r_soul_robe', { cat: 'gear', at: ['sindri'], out: ['cr_soul_robe', 1], mats: [['soul_ember', 8], ['grave_rose', 4], ['rune_thread', 2], ['black_sun_shard', 1]], fee: 60000, lvl: 8, base: 52 });
recipe('r_hound_hide', { cat: 'gear', at: ['sindri'], out: ['cr_hound_hide', 1], mats: [['hel_chain', 6], ['rot_scale', 4], ['rune_thread', 2], ['black_sun_shard', 1]], fee: 58000, lvl: 8, base: 52 });
recipe('r_hound_boots', { cat: 'gear', at: ['sindri'], out: ['cr_hound_boots', 1], mats: [['hel_chain', 6], ['rot_scale', 3], ['star_iron', 1]], fee: 42000, lvl: 7, base: 56 });
recipe('r_bone_shield', { cat: 'gear', at: ['sindri'], out: ['cr_bone_shield', 1], mats: [['colossus_marrow', 6], ['gjoll_ice', 4], ['star_iron', 2]], fee: 48000, lvl: 7, base: 56 });
recipe('r_grave_circlet', { cat: 'gear', at: ['sindri'], out: ['cr_grave_circlet', 1], mats: [['grave_rose', 6], ['soul_ember', 4], ['gold_leaf', 1]], fee: 42000, lvl: 7, base: 56 });
const RECIPE_CATS = [['use', 'Consumables'], ['stone', 'Upgrade stones'], ['mat', 'Materials'], ['gear', 'Gear']];
// Craftsmanship practice: each success gives 1 + 2 × recipe level; the next level needs CRAFT_XP(level).
const CRAFT_XP = lv => 8 * lv * lv;
const CRAFT_MAX = 10;

/* ---------- Storage, mail ---------- */
const STORAGE_SLOTS = 120;          // stacks count as one slot
const STACK_MAX = 999;              // consumables, materials and cards stack up to this in the bag and in storage
const BAG_SLOTS = 48;
const storageFee = () => 20 + 2 * ((typeof P !== 'undefined' && P && P.lvl) || 1);   // per deposit / withdrawal
const STORAGE_TABS = [['all', 'All'], ['equip', 'Equipment'], ['use', 'Consumables'], ['etc', 'Materials'], ['card', 'Cards']];

/* ---------- Card removal (Old Grímr, Skaldhaven) ----------
   RO-style odds when a card is picked out of a socket. The fee is paid either way. */
const CARD_REMOVAL = { success: 82, cardBreaks: 10, itemBreaks: 6, bothBreak: 2 };   // % (sums to 100)
const cardRemovalFee = (it, cardId) => 2000 + ITEMS[it.id].lvl * 150 + (ITEMS[cardId] && MOBS[ITEMS[cardId].mob] && MOBS[ITEMS[cardId].mob].boss ? 20000 : 0);

/* ---------- Enchanting (Thordis the Seiðkona, Skaldhaven) ----------
   Rerolls the random affixes of a non-unique piece of gear. Common gear gains one affix and becomes magic;
   magic keeps 1-2, rare keeps 2-3 (the count is rerolled inside that range). Costs zeny and materials by the
   item's level; the tier's `rare` material is optional and, when offered, makes the reroll pick from the upper
   half of every affix range. */
const ENCHANT_TIERS = [
  { max: 19, zeny: 600, mats: [['ectoplasm', 3], ['spore', 3]], rare: null },
  { max: 34, zeny: 2500, mats: [['cinder_ash', 3], ['bone_shard', 4]], rare: ['frost_heart', 1] },
  { max: 47, zeny: 7000, mats: [['wisp_flame', 3], ['amethyst', 2]], rare: ['bog_pearl', 1] },
  { max: 99, zeny: 15000, mats: [['aesir_core', 2], ['valkyrie_plume', 2]], rare: ['star_glass', 1] },
];
const enchantTier = it => ENCHANT_TIERS.find(t => ITEMS[it.id].lvl <= t.max) || ENCHANT_TIERS[ENCHANT_TIERS.length - 1];

/* ---------- Vendors ----------
   Every shop window is a vendor: `supplies` (unlimited), `gear` (the smith's weapon/armour racks), `sell`, `refine`,
   `craft`, and `specials`: [itemId, qty per restock, price?] sold in limited numbers that refill every
   RESTOCK_SECS of play time (P.flags.stock). */
const RESTOCK_SECS = 1200;
const VENDORS = {
  brokkr: { title: 'Brokkr’s Forge', gear: true, refine: true, craft: true, sell: true,
    specials: [['ember_whetstone', 2, 2400], ['star_iron', 1, 2600], ['ygg_ember', 1, 9000]] },
  sindri: { title: 'Sindri’s Deep Forge', gear: true, refine: true, craft: true, sell: true,
    specials: [['dvergr_whetstone', 1, 9000], ['rune_thread', 2, 2400], ['gold_leaf', 1, 3200], ['deep_ember', 1, 7000]] },
  ulfar: { title: 'Úlfar’s Chandlery', gear: false, refine: false, craft: false, sell: true,
    supplies: ['red_potion', 'orange_potion', 'yellow_potion', 'white_potion', 'blue_potion', 'fly_wing', 'butterfly_wing', 'apple', 'bear_stew', 'skald_ale'],
    specials: [['honey_mead', 6], ['frost_heart', 1, 4500], ['bog_pearl', 1, 5000], ['warding_stone', 1, 22000], ['ygg_ember', 1, 9000]] },
  // Round 6: Ylva's stable in Skaldhaven (warg rental in her dialog; taming items and pet food here).
  ylva: { title: 'Ylva’s Stable', gear: false, refine: false, craft: false, sell: true,
    supplies: ['pet_food', 'poring_candy', 'moon_carrot', 'ember_sugar', 'marrow_bone', 'shiny_trinket', 'frost_candy', 'jar_of_midges', 'prism_candy'],
    specials: [['ygg_ember', 1, 9000]] },
  // Round 7: Gauti the Grave-Trader, in Helheim's camp (his Obol exchange is in his dialog, js/data/npcs.js)
  gauti: { title: 'Gauti’s Grave-Goods', gear: false, refine: false, craft: false, sell: true,
    supplies: ['gjoll_draught', 'soul_tonic', 'grave_bread', 'warding_ash', 'white_potion', 'honey_mead', 'blue_potion', 'fly_wing', 'butterfly_wing'],
    specials: [['eljudnir_mead', 3], ['golden_apple', 1, 18000], ['black_sun_shard', 1, 9000], ['warding_stone', 1, 22000], ['ygg_ember', 1, 9000]] },
};

// Supplies that only appear from a Base Lv (any vendor's `supplies` list).
const SUPPLY_MIN_LV = { yellow_potion: 20, white_potion: 30, honey_mead: 40, bear_stew: 12,
  marrow_bone: 10, shiny_trinket: 12, frost_candy: 24, jar_of_midges: 30, prism_candy: 44 };   // round 6: taming items from the tamed monster's level
// The smiths' unlimited supplies (Brokkr's list grows with the Rune-Shards; see vendorSupplies in core.js).
const SMITH_SUPPLIES = ['red_potion', 'orange_potion', 'blue_potion', 'fly_wing', 'butterfly_wing', 'apple'];

/* ---------- Skaldhaven services ---------- */
const SHIP_ROUTES = {       // Captain Ormr's longship (and Bolli's boat from Mirewell)
  rimeshore: { fare: 150, x: 44.5, y: 34.5, label: 'Rimeshore, the frozen beach' },
  mirewell: { fare: 600, x: 33.5, y: 27.5, label: 'Mirewell, Bolli’s landing' },
  skaldhaven: { fare: 600, x: 30.5, y: 20.5, label: 'Skaldhaven harbour' },
};
const INN_FEE = lvl => 50 + lvl * 10;       // Hallgerð's rooms: full heal, sets your return point here
const RUMOR_FEE = 30;                       // a cup of ale for Ketill

/* ---------- Economy pass (round 5): drops ----------
   - Rarer high-level materials: every ordinary monster of a realm has a small chance of its realm's rare material
     (RARE_MAT_OF), and the realm's MVP always drops one. They feed the top recipes and the enchanter's rare offer.
   - Common materials of monsters Lv 40+ drop 20 % less often (they sell and craft for more).
   Applied to MOBS here, after every data file has loaded, so the monster table stays readable. */
const RARE_MAT_OF = {
  frost_heart: { chance: 0.022, mobs: ['rime_poring', 'snow_wolf', 'draugr_fisher', 'ice_wraith', 'shell_knight'], mvp: 'drowned_jarl' },
  bog_pearl: { chance: 0.02, mobs: ['bog_toad', 'mire_leech', 'wisp', 'marsh_hag', 'mire_troll'], mvp: 'bog_crone' },
  deep_ember: { chance: 0.018, mobs: ['cave_bat', 'crystal_spider', 'magma_slime', 'stone_golem', 'dwarf_revenant'], mvp: 'fafnir' },
  star_glass: { chance: 0.015, mobs: ['prism_poring', 'sky_harpy', 'rune_sentinel', 'valkyrie_shade', 'fenrir_whelp'], mvp: 'fenrir' },
  black_sun_shard: { chance: 0.012, mobs: ['hel_draugr', 'soul_wisp', 'hel_hound', 'corpse_bride', 'nidhogg_spawn', 'bone_colossus'], mvp: 'garmr' },   // round 7 (Níðhöggr drops two)
};
for (const id in RARE_MAT_OF) {
  const R = RARE_MAT_OF[id];
  for (const k of R.mobs) if (MOBS[k]) MOBS[k].drops = (MOBS[k].drops || []).concat([[id, R.chance]]);
  if (MOBS[R.mvp]) MOBS[R.mvp].drops = (MOBS[R.mvp].drops || []).concat([[id, 1]]);
}
for (const k in MOBS) { const d = MOBS[k]; if (d.boss || d.variant || d.lvl < 40) continue; d.drops = (d.drops || []).map(([id, ch]) => ITEMS[id] && ITEMS[id].type === 'etc' && !ITEMS[id].rareMat && ch < 1 ? [id, +(ch * 0.8).toFixed(3)] : [id, ch]); }

/* Sanity checks at load: every recipe names real items (console only). */
for (const k in RECIPES) { const r = RECIPES[k]; for (const [id] of [r.out, ...r.mats]) if (!ITEMS[id]) console.warn('[recipes] unknown item', id, 'in', k); }
