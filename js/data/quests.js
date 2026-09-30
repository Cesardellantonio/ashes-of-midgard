'use strict';
/* =========================================================
   Data: quests and bounty boards
   Loaded after the other data files and before js/core.js. The engine is js/quests.js.
   Full field reference: docs/CONTENT.md ("Quests"). Short version:

   quest(id, {
     name, kind: 'main' | 'side' | 'daily',
     giver: npcId | boardId | null,    who offers it ('!' marker). null + auto: true = starts by itself
     turnIn: npcId | boardId | null,   who takes it back ('?' marker). Defaults to giver. null = completes by itself
     auto: true,                       accept as soon as `req` is met (story quests)
     req: { lvl, jlvl, cls: [..], quests: [..], test: () => bool },
     area: 'Ashen Fields',             where the work happens (shown in the log)
     summary: 'one line for the log',
     offer: [dialog pages], progress: 'line while active', done: [pages on turn-in],
     seq: true,                        objectives unlock one after another
     obj: [ objective... ],
     drops: [{ mob: key | [keys], item, chance }],  quest-only drops while the quest needs the item
     give: [[itemId, qty]],            handed over on accept (taken back on abandon)
     reward: { exp, jexp, zeny, items: [[id, qty, {refine}]] | (P) => [...], lore: loreKey },
     repeat: 'daily',                  can be done again the next day (local date)
     onAccept(q), onComplete(q)        optional code hooks (e.g. a job change); onComplete is skipped for
                                       story quests caught up from an old save
   })
   Objective types (all accept `text` to override the generated line and `check: () => bool`
   to count as done retroactively, e.g. for story flags in old saves):
     { type: 'kill', mob: key | [keys], n, label }        kill N (label names a mob group)
     { type: 'collect', item, n, keep: true }             have N in the bag; taken on turn-in unless keep
     { type: 'talk', npc }                                speak with an NPC
     { type: 'deliver', item, n, npc }                    bring items to an NPC (taken when you talk to them)
     { type: 'reach', map, x, y, r, place }               walk into a spot (or just onto the map if no x/y)
     { type: 'boss', mob }                                a Shardbearer/MVP is dead (P.flags.bosses)
     { type: 'survive', map, x, y, r, secs, wave: { mobs: [..], every, n, max } }  hold a spot; waves attack; dying resets
     { type: 'level', lvl } / { type: 'level', jlvl }     reach a base / job level
     { type: 'cond', text, check: () => bool, prog: () => [cur, max] }        anything else
   Round 4 (see js/quests.js for details):
     { type: 'scene', scene, npc } | { type: 'scene', scene, map, x, y, r }   a cinematic scene (SCENES in npcs.js)
     { type: 'inspect', map, spots: [{ x, y, name, text }], r, place }       investigate spots, each with its pages
     { type: 'escort', npc, map, from: [x, y], to: [x, y], r, place, hp, dmg } bring an NPC somewhere alive
     { type: 'waves', map, x, y, r, place, waves: [[[mob, n]..]..], limit }  timed defence waves
     { type: 'hunt', mob: variantKey, map, x, y, place }                     a named monster appears; kill it
   More quest fields: act (2 = Act II, Chronicle heading), branch ('embers' | 'ash': only that ending sees it),
   choices: [{ label, need(), reward, take, done }] (picked at turn-in; done[id].c keeps the index),
   take: [[id, n]] (removed on turn-in, equipment too), req.rep: { faction: n }, reward.rep / reward.title /
   reward.flag, repeat: 'weekly' (with BOARDS[id].period = 'week'), kind: 'weekly'.
   ========================================================= */
const QUESTS = {};
function quest(id, o) { QUESTS[id] = Object.assign({ id, kind: 'side', obj: [] }, o); }

/* ---------- Main story ---------- */
quest('main_1', { kind: 'main', auto: true, giver: null, turnIn: null, name: 'Refused by the Tree', area: 'Emberhold',
  summary: 'You woke in the Ash. Someone is tending a fire by the Waystone.',
  obj: [{ type: 'talk', npc: 'sigrun', text: 'Speak with Sigrun at the Waystone in Emberhold', check: () => P.flags.talked.sigrun }],
  reward: { exp: 30, jexp: 20 } });
quest('main_2', { kind: 'main', auto: true, giver: null, turnIn: null, name: 'The Four Paths', area: 'Ashen Fields · Emberhold', req: { quests: ['main_1'] },
  summary: 'Learn the basics in the Ashen Fields, then let Vidar set you on a path.',
  obj: [
    { type: 'cond', text: 'Reach Job Lv 10 as a Novice', check: () => P.cls !== 'novice' || P.jlvl >= 10, prog: () => [P.cls !== 'novice' ? 10 : Math.min(10, P.jlvl), 10] },
    { type: 'cond', text: 'Learn Basic Skill to Lv 9', check: () => (P.skills.basic || 0) >= 9, prog: () => [Math.min(9, P.skills.basic || 0), 9] },
    { type: 'cond', text: 'Choose a path from Vidar in Emberhold', check: () => P.cls !== 'novice' },
  ],
  reward: { zeny: 500, items: [['orange_potion', 5]] } });
quest('main_3', { kind: 'main', auto: true, giver: null, turnIn: null, name: 'The Shard of Blood', area: 'Ashen Fields', req: { quests: ['main_2'] },
  summary: 'The Blight Mother swallowed the first Rune-Shard. She nests where the fields turn to bog.',
  obj: [{ type: 'boss', mob: 'blight_mother', text: 'Take the Rune-Shard of Blood from the Blight Mother, deep in the Ashen Fields' }],
  reward: { zeny: 1000 } });
quest('main_4', { kind: 'main', auto: true, giver: null, turnIn: null, name: 'The Shard of the Moon', area: 'Withered Wood', req: { quests: ['main_3'] },
  summary: 'Hati the Moon-Eater hunts the Withered Wood with the second shard in his throat.',
  obj: [{ type: 'boss', mob: 'hati', text: 'Take the Rune-Shard of the Moon from Hati in the Withered Wood' }],
  reward: { zeny: 3000 } });
quest('main_5', { kind: 'main', auto: true, giver: null, turnIn: null, name: 'The Shard of the Oath', area: 'Gloamheim Keep', req: { quests: ['main_4'] },
  summary: 'Sir Gaunt still holds Gloamheim, and the last shard holds his armor together.',
  obj: [{ type: 'boss', mob: 'sir_gaunt', text: 'Take the Rune-Shard of the Oath from Sir Gaunt in Gloamheim Keep' }],
  reward: { zeny: 6000 } });
quest('main_6', { kind: 'main', auto: true, giver: null, turnIn: null, name: 'The Cinder Gate', area: 'Emberhold', req: { quests: ['main_5'] },
  summary: 'Three shards. Sigrun can open the gate now.',
  obj: [{ type: 'talk', npc: 'sigrun', text: 'Bring the three Rune-Shards to Sigrun so she can open the Cinder Gate', check: () => !!P.flags.gate }],
  reward: { items: [['white_potion', 3]] } });
quest('main_7', { kind: 'main', auto: true, giver: null, turnIn: null, name: 'The Ashen King', area: 'Throne of Cinders', req: { quests: ['main_6'] },
  summary: 'The King waits past the gate, on a throne of burned roots.',
  obj: [{ type: 'boss', mob: 'ashen_king', text: 'Pass through the Cinder Gate and slay the Ashen King' }] });
quest('main_8', { kind: 'main', auto: true, giver: null, turnIn: null, name: 'The Heart of Yggdrasil', area: 'Throne of Cinders', req: { quests: ['main_7'] },
  summary: 'Behind the throne, something that was dead is glowing.',
  obj: [{ type: 'cond', text: 'Decide the fate of the Tree at its Heart', check: () => !!P.flags.ending }] });
quest('main_9', { kind: 'main', auto: true, giver: null, turnIn: null, name: 'The Broken Bridge', area: 'Throne of Cinders · Bifrost Ruins', req: { quests: ['main_7'] },
  summary: 'With the King dead, the shattered Bifrost behind the Heart has woken. Something at the far end is howling.',
  seq: true,
  obj: [{ type: 'reach', map: 'bifrost', text: 'Cross the broken Bifrost, past the Heart of Yggdrasil' }, { type: 'talk', npc: 'heimdall', text: 'Find the watchman who still guards the bridge' }],
  reward: { exp: 120000, jexp: 80000, items: [['honey_mead', 3]] } });

/* ---------- Sigrun: bounties ---------- */
quest('sigrun_porings', { giver: 'sigrun', name: 'Culling the Blight', area: 'Ashen Fields', req: { quests: ['main_1'] },
  summary: 'Thin out the Blight Porings on the road east of Emberhold.',
  offer: ['The Porings were harmless once. Now the Blight Mother’s children crawl up to the gate at night and sing at it.', 'Go east into the fields and put ten of them down. It is a small mercy, for them and for us.'],
  progress: 'Ten Blight Porings. They bounce toward you; let them.',
  done: ['Ten. The singing is quieter tonight. Here, take these. Waystone fire makes a poor potion, but it is warm.'],
  obj: [{ type: 'kill', mob: 'blight_poring', n: 10 }],
  reward: { exp: 300, jexp: 200, zeny: 200, items: [['red_potion', 5]] } });
quest('sigrun_husks', { giver: 'sigrun', name: 'Scarecrows in the Rows', area: 'Ashen Fields', req: { lvl: 5, quests: ['sigrun_porings'] },
  summary: 'The scarecrow husks in the fields have started walking. Stop them.',
  offer: ['The farmers stuffed their scarecrows with straw and prayers. The Ash took the prayers out and put something else in.', 'Six Scarecrow Husks. They see farther than you think and they do not tire.'],
  progress: 'Six husks. Keep your distance until you can hit them first.',
  done: ['Burlap and pitchforks. That is all that was left of them? Good. Take this for your trouble.'],
  obj: [{ type: 'kill', mob: 'scarecrow_husk', n: 6 }],
  reward: { exp: 1200, jexp: 900, zeny: 600, items: [['orange_potion', 3]] } });
quest('sigrun_hold', { giver: 'sigrun', name: 'Hold the Waystone', area: 'Ashen Fields', req: { lvl: 8, quests: ['sigrun_husks'] },
  summary: 'Stand by the Ashen Fields Waystone while the dead test it.',
  offer: ['The Waystone in the fields is weak. Every night the Ash leans on it, and every night it bends a little more.', 'Stand beside it for forty-five heartbeats while they come. If you fall, the stone forgets you were there, and you begin again.'],
  progress: 'Stand by the fields Waystone until the Ash gives up. Do not wander off.',
  done: ['I felt it from here. The stone is brighter. So are you, a little.'],
  obj: [{ type: 'survive', map: 'ashen_fields', x: 7.5, y: 30.5, r: 6, secs: 45, place: 'the Ashen Fields Waystone', wave: { mobs: ['scarecrow_husk', 'cinder_drop', 'ash_grub'], every: 9, n: 2 } }],
  reward: { exp: 2000, jexp: 1500, zeny: 800, items: [['fly_wing', 5]] } });
quest('sigrun_wolves', { giver: 'sigrun', name: 'Grey Riders', area: 'Withered Wood', req: { lvl: 12, quests: ['sigrun_husks'] },
  summary: 'The ash wolves of the Withered Wood run in packs now. Break them.',
  offer: ['Hati’s wolves have learned to hunt in packs. They took two travellers on the wood road this week.', 'Kill eight of them. Fight with a tree at your back so they cannot circle you.'],
  progress: 'Eight Ash Wolves in the Withered Wood.',
  done: ['The road is quieter. Hati will notice. Let him.'],
  obj: [{ type: 'kill', mob: 'ash_wolf', n: 8 }],
  reward: { exp: 5000, jexp: 3500, zeny: 1500, items: [['orange_potion', 5]] } });
quest('sigrun_dead', { giver: 'sigrun', name: 'The Faithless Dead', area: 'Gloamheim Keep', req: { lvl: 22, quests: ['sigrun_wolves'] },
  summary: 'Gaunt’s soldiers still march the halls of Gloamheim. Lay ten of them down.',
  offer: ['I carried some of Gaunt’s soldiers to Valhalla myself, long ago. Now they stand guard in Gloamheim with nothing inside their helmets.', 'Ten Skeleton Soldiers. Holy light and heavy blows. Be quick; they do not bleed and they do not stop.'],
  progress: 'Ten Skeleton Soldiers in Gloamheim Keep.',
  done: ['<i>Sigrun closes her eyes and says ten names under her breath.</i> Thank you. They were owed a rest.'],
  obj: [{ type: 'kill', mob: 'skeleton_soldier', n: 10 }],
  reward: { exp: 15000, jexp: 11000, zeny: 4000, items: [['yellow_potion', 5]] } });

/* ---------- Brokkr: materials for better steel ---------- */
const BROKKR_T1 = { novice: 'cutter', swordsman: 'falchion', mage: 'wand', archer: 'composite_bow', acolyte: 'mace' };
const BROKKR_T2 = { novice: 'main_gauche', swordsman: 'blade', mage: 'arc_wand', archer: 'great_bow', acolyte: 'morning_star' };
// Class weapon reward: falls back to the base class's pick (second classes), then to a dagger.
function classWeapon(table, refine) { return P => { let c = P.cls, g = 0; while (c && !table[c] && g++ < 6) c = CLASSES[c] && CLASSES[c].base; return [[table[c] || table.novice, 1, { refine }]]; }; }
quest('brokkr_fuel', { giver: 'brokkr', name: 'Fuel for the Forge', area: 'Ashen Fields', req: { quests: ['main_1'] },
  summary: 'Brokkr needs jelly and fluff to keep the forge fire fed.',
  offer: ['Waystone fire won’t melt steel. Jellopy burns hot and slow, and Fluff keeps the coals breathing. Don’t ask me how I know.', 'Ten Jellopy and five Fluff. Porings and Ash Grubs carry them. Bring them and I’ll make it worth the walk.'],
  progress: 'Ten Jellopy, five Fluff. The fields are full of both.',
  done: ['<i>Brokkr tosses a handful into the forge. It roars.</i> Hah! Listen to that. Here, a clip I had lying about. Has a slot in it, if you find a card worth keeping.'],
  obj: [{ type: 'collect', item: 'jellopy', n: 10 }, { type: 'collect', item: 'fluff', n: 5 }],
  reward: { exp: 250, jexp: 150, zeny: 300, items: [['clip', 1]] } });
quest('brokkr_steel', { giver: 'brokkr', name: 'Steel Worth Swinging', area: 'Withered Wood', req: { lvl: 10, quests: ['brokkr_fuel'] },
  summary: 'Bring Brokkr wolf claws, kobold hair and tree roots and he will forge you a proper weapon.',
  offer: ['That thing you are carrying is an insult to the metal. I can do better. I <i>want</i> to do better.', 'Wolf claws for the edge, kobold hair for the grip wrap, tree root for the temper. Six, four and two. The Withered Wood has all of it.'],
  progress: 'Six Wolf Claws, four Matted Kobold Hair, two Tree Roots.',
  done: ['<i>Hours of hammering. The steel sings when it cools.</i> There. Refined three times already. Don’t let the Ash have it.'],
  obj: [{ type: 'collect', item: 'wolf_claw', n: 6 }, { type: 'collect', item: 'kobold_hair', n: 4 }, { type: 'collect', item: 'tree_root', n: 2 }],
  reward: { exp: 3000, jexp: 2200, items: classWeapon(BROKKR_T1, 3) } });
quest('brokkr_chains', { giver: 'brokkr', name: 'Chains of Gloamheim', area: 'Gloamheim Keep', req: { lvl: 20, quests: ['brokkr_steel'] },
  summary: 'Old keep iron and bone for Brokkr’s finest work.',
  offer: ['The chains in Gloamheim were forged by dwarves before the Tree burned. Rusted, sure. Rust comes off. Craft doesn’t.', 'Five Rusted Chains from the knights and six Bone Shards to fold into the steel. Then I will make you something I’m proud of.'],
  progress: 'Five Rusted Chains, six Bone Shards. Gloamheim.',
  done: ['<i>He works through the night. Sigrun brings him water twice.</i> Four times refined and not a crack in it. My best since the fire. Go on, take it.'],
  obj: [{ type: 'collect', item: 'rusted_chain', n: 5 }, { type: 'collect', item: 'bone_shard', n: 6 }],
  reward: { exp: 18000, jexp: 13000, items: classWeapon(BROKKR_T2, 4) } });

/* ---------- Astrid ---------- */
quest('astrid_clovers', { giver: 'astrid', name: 'Grey Clovers', area: 'Ashen Fields', req: { lvl: 2, quests: ['main_1'] },
  summary: 'Astrid wants clovers for Sigrun. The hares in the fields carry them.',
  offer: ['Sigrun used to wear clovers in her hair. Real green ones. They’re all grey now but I think grey ones count.', 'The hollow hares carry them around in their fur. Can you get five? Please? I’d go but I’m not allowed past the gate.'],
  progress: 'Five Grey Clovers. The hares have them!',
  done: ['Five! I’m going to make a crown. Don’t tell her. <i>She presses warm apples into your hands.</i>'],
  obj: [{ type: 'collect', item: 'clover', n: 5 }],
  reward: { exp: 200, jexp: 150, zeny: 100, items: [['apple', 6]] } });
quest('astrid_plush', { giver: 'astrid', name: 'Pip the Poring', area: 'Withered Wood', req: { lvl: 10, quests: ['astrid_clovers'] },
  summary: 'Kobolds stole Astrid’s stitched Poring. Search the Withered Wood.',
  offer: ['<i>She has been crying and is trying very hard to hide it.</i> Pip is gone. My Poring. I stitched his eye back on myself.', 'I followed a kobold to the trees because it had him in its mouth. Sigrun caught me and carried me back. It went into the Withered Wood.', 'Kobolds keep things. Maybe one still has him?'],
  progress: 'Pip the Poring. A kobold in the Withered Wood has him.',
  done: ['PIP! <i>She squeezes the Poring so hard the button eye nearly comes off again.</i>', 'This was my mum’s. The brooch, I mean. She said it makes you quick. I want you to have it, because you came back.'],
  obj: [{ type: 'reach', map: 'withered_wood', text: 'Search the Withered Wood' }, { type: 'collect', item: 'astrid_plush', n: 1, text: 'Take Pip back from the kobolds' }],
  seq: true,
  drops: [{ mob: ['rotwood_kobold', 'kobold_archer'], item: 'astrid_plush', chance: 0.3 }],
  reward: { exp: 4000, jexp: 3000, items: [['brooch', 1]], lore: 'astrid' } });

/* ---------- Vidar: the well of wisdom ---------- */
quest('vidar_well', { giver: 'vidar', name: 'What the Ash Remembers', area: 'Ashen Fields', req: { lvl: 5, quests: ['main_1'] },
  summary: 'Vidar asks you to read the embers at the burned crossroads shrine.',
  offer: ['<i>He stirs the fire with the end of his staff.</i> There was a shrine on the east road once. Burned now. The embers there still remember what they saw.', 'Walk to the crossroads, east along the road through the fields. Then put out six of the Cinder Drops that gather there. Listen while they die.'],
  progress: 'The crossroads shrine on the east road, then six Cinder Drops.',
  done: ['And what did they say? <i>You tell him.</i> Yes. That is what the well said, too. A long time ago, for an eye.'],
  obj: [{ type: 'reach', map: 'ashen_fields', x: 40.5, y: 32.5, r: 3.5, place: 'the burned crossroads shrine' }, { type: 'kill', mob: 'cinder_drop', n: 6 }],
  seq: true,
  reward: { exp: 900, jexp: 700, zeny: 200, lore: 'mimir' } });
quest('vidar_wolf', { giver: 'vidar', name: 'The Wolf and the Moon', area: 'Withered Wood', req: { lvl: 12, quests: ['vidar_well'] },
  summary: 'Vidar wants to see the clearing where Hati howls, and the pelts of his pack.',
  offer: ['Hati and I are kin, of a sort. His father and I had business, at the end of the world.', 'There is a clearing in the north-east of the Withered Wood where he howls at the moon he swallowed. Stand in it. Then bring me two ashen pelts from his pack.'],
  progress: 'The moon-clearing in the north-east of the Wood, and two Ashen Pelts.',
  done: ['<i>He runs his fingers through the grey fur for a long time.</i> Soft. I always forget they are soft.'],
  obj: [{ type: 'reach', map: 'withered_wood', x: 54.5, y: 12.5, r: 3.5, place: 'the moon-clearing' }, { type: 'collect', item: 'wolf_pelt', n: 2 }],
  reward: { exp: 6000, jexp: 4500, items: [['blue_potion', 3]], lore: 'fenrir' } });
quest('vidar_letter', { giver: 'vidar', turnIn: 'vidar', name: 'An Old Man’s Letter', area: 'Emberhold', req: { lvl: 18, quests: ['vidar_wolf'] },
  summary: 'Carry Vidar’s sealed letter to Sigrun, then return to him.',
  offer: ['I have written something I cannot say. Take it to Sigrun. Do not read it; you will anyway, but try.', '<i>He hands you a letter sealed with wax. The seal is an eye, closed.</i>'],
  progress: 'Give the letter to Sigrun. Then come back and tell me her face.',
  done: ['She laughed? <i>Something in the old man’s shoulders loosens.</i> Then she forgave me. Here. It helps an old eye see, and perhaps a young one.'],
  give: [['vidar_letter', 1]],
  obj: [{ type: 'deliver', item: 'vidar_letter', n: 1, npc: 'sigrun', text: 'Give Vidar’s letter to Sigrun' }, { type: 'talk', npc: 'vidar', text: 'Tell Vidar how she took it' }],
  seq: true,
  reward: { exp: 9000, jexp: 6000, items: [['earring', 1]], lore: 'tyr' } });

/* ---------- Content round 3: the outer realms. One chain per map: arrival, local requests, the MVP hunt. ---------- */
// Rimeshore (Base Lv 28-38): Ragna and Old Hrafn at the beach camp
quest('rime_arrival', { giver: 'vidar', turnIn: 'ragna', name: 'The Frozen Shore', area: 'Rimeshore', req: { lvl: 28 },
  summary: 'Follow the Withered Wood’s east road down to the frozen coast and find the living there.',
  offer: ['<i>Vidar pokes the fire.</i> East of the Wood, the road runs down to the sea. The sea froze the night the Tree burned, with the longships still on it.', 'There are people there. Stubborn ones. Go and see whether they are still alive, and whether they need a sword more than we do.'],
  progress: 'The Wood’s east road, down to the coast. Look for a fire on the ice.',
  done: ['Vidar sent you? The one-eyed man who never stays for dinner? <i>Ragna almost smiles.</i> Then you are welcome at our fire. Here, you will need these on the ice.'],
  obj: [{ type: 'reach', map: 'rimeshore', x: 8.5, y: 34.5, r: 6, place: 'the Rimeshore Waystone' }],
  reward: { exp: 30000, jexp: 22000, zeny: 3000, items: [['white_potion', 3]] } });
quest('ragna_wolves', { giver: 'ragna', name: 'Wolves on the Ice', area: 'Rimeshore', req: { lvl: 29, test: () => !!P.flags.talked.ragna },
  summary: 'The snow wolves and rime porings are picking off Ragna’s fishers. Thin them out.',
  offer: ['The snow wolves learned to wait by the fishing holes. When someone kneels to pull up a line, they come. The rime porings follow them and eat what is left.', 'Ten wolves and eight porings. Fight on the dunes, not the ice. The ice is theirs.'],
  progress: 'Ten Snow Wolves, eight Rime Porings. The dunes west of the beach.',
  done: ['The fishers went out today and came back. All of them. <i>She hands you a sealed flask.</i> My mother’s mead. Do not waste it.'],
  obj: [{ type: 'kill', mob: 'snow_wolf', n: 10 }, { type: 'kill', mob: 'rime_poring', n: 8 }],
  reward: { exp: 60000, jexp: 45000, zeny: 6000, items: [['white_potion', 4], ['honey_mead', 1]] } });
quest('hrafn_nets', { giver: 'hrafn', name: 'Nets of the Drowned', area: 'Rimeshore', req: { lvl: 31, test: () => !!P.flags.talked.ragna },
  summary: 'Old Hrafn needs draugr nets and hermit shells to mend the camp’s gear.',
  offer: ['Our nets are rotten. The draugr’s nets are rotten too, but they are rotten <i>strong</i>, if you follow me.', 'Six of their nets, and three shells off the shell knights on the lagoon. Shell makes a good float. Don’t ask how I know.'],
  progress: 'Six Draugr’s Nets, three Hermit Shells.',
  done: ['<i>He is knotting before you finish putting them down.</i> Good. Good. Here, I kept these for someone who deserved them.'],
  obj: [{ type: 'collect', item: 'draugr_net', n: 6 }, { type: 'collect', item: 'hermit_shell', n: 3 }],
  reward: { exp: 70000, jexp: 50000, zeny: 7000, items: [['yellow_potion', 10], ['fly_wing', 5]] } });
quest('ragna_jarl', { giver: 'ragna', name: 'The Drowned Jarl', area: 'Rimeshore', req: { lvl: 34, quests: ['ragna_wolves'] },
  summary: 'Ragna’s father still stands at the prow of his frozen longship in the sea-cave to the north. Give him his rest.',
  offer: ['My father took his whole crew into the ice rather than let the storm have them. He is still out there, in the sea-cave north along the beach, at the prow of his ship.', 'I cannot do it. I have tried. Every time, I see his face. You never knew his face. Go.'],
  progress: 'The sea-cave is north along the beach, past the barrier of ice.',
  done: ['<i>Ragna listens to the ice for a long time.</i> It is quiet out there now. Thank you. Take what he would have given you, if he had been himself.'],
  obj: [{ type: 'boss', mob: 'drowned_jarl' }],
  reward: { exp: 150000, jexp: 110000, zeny: 15000, items: [['white_potion', 5], ['honey_mead', 3]] } });

// Mirewell (Base Lv 34-44): Eira at the waystone camp, Bolli at the crossing
quest('mire_arrival', { giver: 'ragna', turnIn: 'eira', name: 'Lights in the Mire', area: 'Mirewell', req: { lvl: 33, quests: ['rime_arrival'] },
  summary: 'Take the trail south past the barrows to Mirewell and find Ragna’s sister Eira.',
  offer: ['My sister Eira lives in the mire, south past the barrows. She went there to learn herbs from a witch, and stayed when the witch went bad.', 'Tell her I am alive. Tell her I am still stubborn. She will know what that means.'],
  progress: 'South past the barrows, then through the marsh to Eira’s camp.',
  done: ['Still stubborn? <i>Eira laughs, and it sounds exactly like Ragna.</i> Good. Stubborn is how we are still alive. Sit. Eat something that is not moving.'],
  obj: [{ type: 'reach', map: 'mirewell', x: 36.5, y: 7.5, r: 6, place: 'the Mirewell Waystone' }],
  reward: { exp: 40000, jexp: 30000, zeny: 4000, items: [['white_potion', 3]] } });
quest('eira_medicine', { giver: 'eira', name: 'Bitter Medicine', area: 'Mirewell', req: { lvl: 35, test: () => !!P.flags.talked.eira },
  summary: 'Eira needs toadskin and wisp flame to brew medicine that still works in the Ash.',
  offer: ['Toadskin draws poison. Wisp flame burns clean, if you can catch it without it catching you.', 'Six skins and four flames. The toads are lazy; the wisps are not.'],
  progress: 'Six Slick Toadskins, four Wisp Flames.',
  done: ['<i>The brew turns gold, then clear.</i> There. The first honest medicine this marsh has made in a hundred years. Take some.'],
  obj: [{ type: 'collect', item: 'toad_skin', n: 6 }, { type: 'collect', item: 'wisp_flame', n: 4 }],
  reward: { exp: 80000, jexp: 60000, zeny: 8000, items: [['white_potion', 5], ['honey_mead', 2]] } });
quest('bolli_trolls', { giver: 'bolli', name: 'Toll for the Trolls', area: 'Mirewell', req: { lvl: 38, test: () => !!P.flags.talked.eira },
  summary: 'The mire trolls and the Crone’s hags hold the boardwalks. Bolli wants his crossings back.',
  offer: ['The trolls under the boardwalks used to take a toll. A fish, a song. Now they take the traveller.', 'And the hags walk the planks at night, looking for the ones the trolls missed. Six of each. Then maybe I can build a boat again.'],
  progress: 'Six Mire Trolls, six Marsh Hags.',
  done: ['You hear that? Nothing. Nobody screaming on the planks. I could get used to that. Here, for your trouble.'],
  obj: [{ type: 'kill', mob: 'mire_troll', n: 6 }, { type: 'kill', mob: 'marsh_hag', n: 6 }],
  reward: { exp: 120000, jexp: 90000, zeny: 10000, items: [['honey_mead', 3]] } });
quest('eira_crone', { giver: 'eira', name: 'The Crone’s Cauldron', area: 'Mirewell', req: { lvl: 40, quests: ['eira_medicine'] },
  summary: 'The Bog Crone stirs her cauldron on the island in the south of the mire. End her.',
  offer: ['She taught me everything I know about herbs. Then the Tree burned, and she taught herself what the hungry would pay for.', 'Her island is at the south end of the boardwalks. The hexes she throws stay on the ground and burn. Do not stand in them.'],
  progress: 'The Crone’s island, south along the boardwalks. Stay out of her hexes.',
  done: ['<i>Eira is quiet for a long while.</i> She used to sing while she stirred. I hope she remembers the song, wherever she went. This was hers. Take it.'],
  obj: [{ type: 'boss', mob: 'bog_crone' }],
  reward: { exp: 250000, jexp: 180000, zeny: 25000, items: [['honey_mead', 5]] } });

// Nidavellir Deep (Base Lv 40-50): Sindri at the great forge, Nýr in the hall of statues
const SINDRI_W = { novice: 'dvergr_seax', swordsman: 'dvergr_longsword', mage: 'dvergr_rod', archer: 'dvergr_bow', acolyte: 'dvergr_hammer',
  knight: 'dvergr_spear', oathkeeper: 'dvergr_longsword', runecaster: 'dvergr_staff', sage: 'dvergr_codex', wolfhunter: 'dvergr_bow', skald: 'dvergr_lur', priest: 'dvergr_hammer', monk: 'dvergr_knuckles' };
quest('nida_arrival', { giver: 'brokkr', turnIn: 'sindri', name: 'Brokkr’s Brother', area: 'Nidavellir Deep', req: { lvl: 40 },
  summary: 'Carry Brokkr’s letter down to his brother Sindri, in the dwarf-halls under Gloamheim.',
  offer: ['<i>Brokkr does not look up from the anvil.</i> There is a stair in Gloamheim, past where Gaunt keeps his hall. It goes down to Nidavellir. My brother is down there. Sindri.', 'We argued. About a hammer. It was a very good hammer. Take him this, and don’t read it.'],
  progress: 'Gloamheim, past Gaunt’s hall, down the stair. Or through the old mine east of Mirewell.',
  give: [['brokkr_letter', 1]],
  obj: [{ type: 'deliver', item: 'brokkr_letter', n: 1, npc: 'sindri', text: 'Give Brokkr’s letter to Sindri in Nidavellir Deep' }],
  done: ['<i>Sindri reads it twice, then folds it very small.</i> “Sorry about the hammer.” Four hundred years, and that is what he writes. <i>He blows his nose loudly.</i> Here. For carrying it.'],
  reward: { exp: 60000, jexp: 45000, zeny: 6000, items: [['white_potion', 5]], lore: 'nidavellir' } });
quest('sindri_forge', { giver: 'sindri', name: 'Fire for the Deep Forge', area: 'Nidavellir Deep', req: { lvl: 42, test: () => !!P.flags.talked.sindri },
  summary: 'Sindri needs magma cores, amethyst and dvergr ore to forge you a dwarf-made weapon.',
  offer: ['My brother makes good steel. I make better. Do not tell him I said so; do tell him I said so.', 'Five magma cores from the slimes for heat, six amethyst shards from the spiders for the edge, four lumps of dvergr ore from the golems and the dead miners. Then we talk.'],
  progress: 'Five Magma Cores, six Amethyst Shards, four Dvergr Ore.',
  done: ['<i>The forge roars for a whole day. When the steel cools, there are runes on it you did not see him carve.</i> Four times refined. Brokkr would have stopped at three.'],
  obj: [{ type: 'collect', item: 'magma_core', n: 5 }, { type: 'collect', item: 'amethyst', n: 6 }, { type: 'collect', item: 'dvergr_ore', n: 4 }],
  reward: { exp: 100000, jexp: 75000, items: classWeapon(SINDRI_W, 4) } });
quest('nyr_shift', { giver: 'nyr', name: 'The Last Shift', area: 'Nidavellir Deep', req: { lvl: 44 },
  summary: 'Nýr’s dead miners and their golems are still working. Let the shift end.',
  offer: ['My lads never heard the horn for the end of the shift. The golems neither. They dig and they dig, and anything that walks past, they dig into.', 'Ten of my lads and five of the golems. Gently, if you can. Quickly, if you can’t.'],
  progress: 'Ten Dwarf Revenants, five Stone Golems.',
  done: ['<i>Far away, very faintly, a horn sounds, though nobody blew it.</i> That’s the horn. Shift’s over. <i>Nýr takes off his helmet.</i> Thank you, friend.'],
  obj: [{ type: 'kill', mob: 'dwarf_revenant', n: 10 }, { type: 'kill', mob: 'stone_golem', n: 5 }],
  reward: { exp: 180000, jexp: 130000, zeny: 15000, items: [['white_potion', 8]] } });
quest('sindri_fafnir', { giver: 'sindri', name: 'The Hoard-Wyrm', area: 'Nidavellir Deep', req: { lvl: 46, quests: ['sindri_forge'] },
  summary: 'Fafnir sleeps on the old hoard at the bottom of the Deep. Kill him, and the forges can burn clean again.',
  offer: ['Fafnir was a dwarf once. Our kin. He killed his father for a ring and turned into a wyrm to sit on the gold. The Ash woke him.', 'His hoard is past the hall of statues, down where the lava still runs. Mind his breath: step out of the fire, not back from it.'],
  progress: 'Past the hall of statues, down to the hoard. Step sideways out of his breath.',
  done: ['<i>Sindri holds up a single gold coin to the forge light.</i> Just gold now. Good. Here, the rest is yours; I only wanted the one.'],
  obj: [{ type: 'boss', mob: 'fafnir' }],
  reward: { exp: 400000, jexp: 280000, zeny: 40000, items: [['honey_mead', 8]] } });

// Bifrost Ruins (Base Lv 48-60): Heimdall at the landing; Vidar sends you after the wolf
quest('heimdall_wardens', { giver: 'heimdall', name: 'Wardens of a Fallen Hall', area: 'Bifrost Ruins', req: { lvl: 48, test: () => !!P.flags.talked.heimdall },
  summary: 'The rune sentinels and the Valkyrie shades attack anything alive on the bridge. Clear the way to the wolf.',
  offer: ['The sentinels guard halls that are not there anymore. The Valkyries carry souls to a Valhalla that is gone. Neither will let you pass.', 'Eight of each. I would do it myself, but I cannot leave my post. I have not left it in ten thousand years.'],
  progress: 'Eight Rune Sentinels, eight Valkyrie Shades.',
  done: ['The Valkyries sang as they went. I had forgotten that song. Take this, from the old armoury.'],
  obj: [{ type: 'kill', mob: 'rune_sentinel', n: 8 }, { type: 'kill', mob: 'valkyrie_shade', n: 8 }],
  reward: { exp: 220000, jexp: 160000, zeny: 20000, items: [['honey_mead', 5]] } });
quest('heimdall_horn', { giver: 'heimdall', name: 'Gjallarhorn', area: 'Bifrost Ruins', req: { lvl: 50, quests: ['heimdall_wardens'] },
  summary: 'Hold Gjallarhorn’s stand in the north while Fenrir’s pups and the harpies try to throw it off the bridge.',
  offer: ['Gjallarhorn stands on the northern island. If they throw it off the bridge, nothing will ever call the gods home again, even if there were gods to call.', 'Stand by the horn for a minute. They will come. Do not let them move you.'],
  progress: 'Stand beside Gjallarhorn on the northern island until the pack gives up.',
  done: ['<i>Heimdall touches the horn with one finger, very gently.</i> Still there. Still whole. So are you. Take this; it was a friend’s.'],
  obj: [{ type: 'survive', map: 'bifrost', x: 31.5, y: 14.5, r: 5, secs: 60, place: 'Gjallarhorn’s stand', wave: { mobs: ['sky_harpy', 'fenrir_whelp'], every: 9, n: 2, max: 5 } }],
  reward: { exp: 300000, jexp: 220000, zeny: 25000, items: P => [[P.st.int >= P.st.str ? 'aesir_brooch' : 'aesir_ring', 1]] } });
// Round 4: once Act II begins (act2_1), the wolf is part of the main story instead; saves that already hold this quest keep it.
quest('vidar_fenrir', { giver: 'vidar', turnIn: 'vidar', name: 'The Silent God’s Duty', area: 'Bifrost Ruins', req: { lvl: 50, quests: ['main_9'], test: () => !P.quests.active.act2_1 && !P.quests.done.act2_1 },
  summary: 'Vidar was fated to kill Fenrir at the end of the world. He asks you to do it instead.',
  offer: ['<i>Vidar is quiet for a long time.</i> You have been to the bridge. You heard him.', 'I was born to kill that wolf. The Norns wrote it. My father died in his jaws, and I tore them apart. That was the story. Then the story burned, and the wolf did not.', 'I am old, and I am tired, and if I go up there the story will finish itself the way it always meant to. You are not in the story. Go and break it for me.'],
  progress: 'Fenrir, on the chained island at the far end of the Bifrost Ruins.',
  done: ['<i>Vidar closes his one eye.</i> So the wolf is dead, and not by my hand. The Norns will be furious. <i>He smiles.</i> Good.', 'Take these. They are the last embers of the Tree I kept for myself. I do not need them anymore.'],
  obj: [{ type: 'boss', mob: 'fenrir', text: 'Slay Fenrir in the Bifrost Ruins' }],
  reward: { exp: 800000, jexp: 500000, zeny: 100000, items: [['ygg_ember', 3]], lore: 'fenrir_slain' } });

/* ---------- Vidar: trials of the second paths ----------
   One trial per second class. Offered at Base Lv 30 + Job Lv 40 to its first class; only one trial at a time
   (abandon it to switch paths). onComplete performs the job change (jobChange in js/core.js): skills stay
   learned, the job level resets to 1 and the new class earns its own skill points. */
const trialActive = () => Object.keys(P.quests.active).some(id => QUESTS[id] && QUESTS[id].trial);
function trial(cls, o) {
  const C = CLASSES[cls], from = C.from;
  quest('trial_' + cls, Object.assign({ giver: 'vidar', trial: cls, name: `Trial of the ${C.name}`,
    req: { lvl: 30, jlvl: 40, test: () => P.cls === from && !trialActive() },
    reward: { exp: 20000, zeny: 3000 },
    onComplete() { jobChange(cls); } }, o));
}
trial('knight', { area: 'Gloamheim Keep',
  summary: 'Break the Rust Knights of Gloamheim and bring back their chains, as the Ash Knights did before the fire.',
  offer: ['<i>Vidar looks at your sword arm for a long moment.</i> You hit hard. You also stop to think between blows. An Ash Knight does not stop.', 'The Rust Knights in Gloamheim were the old order, before Gaunt broke his oath and they rusted with him. Break six of them. Bring me three of their chains, so I know you did not simply walk past.'],
  progress: 'Six Rust Knights, three Rusted Chains. Gloamheim, the inner halls.',
  done: ['<i>He weighs the chains in one hand.</i> Heavy. They carried these for a thousand years and never once put them down.', 'Kneel. <i>He touches the flat of an old spear to each of your shoulders.</i> Rise, Ash Knight. The spear is yours. It was a friend’s.'],
  obj: [{ type: 'kill', mob: 'rust_knight', n: 6 }, { type: 'collect', item: 'rusted_chain', n: 3 }] });
trial('oathkeeper', { area: 'Gloamheim Keep · Emberhold',
  summary: 'Lay Gaunt’s oathless soldiers to rest, then swear your own oath before Sigrun.',
  offer: ['Sir Gaunt swore by Tyr’s hand and broke the oath. Someone has to keep it now, or Tyr’s name means nothing in Midgard.', 'Put ten of his faithless soldiers to rest in Gloamheim. Then bring six of their bones to Sigrun. She carried them once. She will hear your oath.'],
  progress: 'Ten Skeleton Soldiers, then six Bone Shards for Sigrun, then come back to me.',
  done: ['Sigrun heard it? Then Tyr did. <i>He hands you a shield as tall as your shoulder.</i>', 'An Oathkeeper does not carry a shield to hide behind. It carries one so others can. Rise.'],
  seq: true,
  obj: [{ type: 'kill', mob: 'skeleton_soldier', n: 10 }, { type: 'deliver', item: 'bone_shard', n: 6, npc: 'sigrun', text: 'Swear your oath to Sigrun over six Bone Shards' }] });
trial('runecaster', { area: 'Gloamheim Keep',
  summary: 'Unmake thirty of Gloamheim’s undead with magic alone.',
  offer: ['A mage casts spells. A Runecaster <i>writes</i> them, in the old runes, into the air itself. The air remembers.', 'Go to Gloamheim. Unmake thirty of the dead there with magic. Steel does not count. I will know.'],
  progress: 'Thirty undead in Gloamheim, and the killing blow must be a spell.',
  done: ['<i>He sniffs the air around you.</i> Ozone and old bone. Good.', 'Take this staff. It was cut from a branch that fell before the fire. Write big.'],
  obj: [{ type: 'kill', mob: ['skeleton_soldier', 'grave_archer', 'wraith'], n: 30, magic: true, label: 'Undead', text: 'Destroy undead in Gloamheim with magic (the killing blow must be a spell)' }] });
trial('sage', { area: 'Gloamheim Keep · Withered Wood',
  summary: 'Gather ectoplasm from the wraiths, then hold a seiðr trance in Hati’s moon-clearing.',
  offer: ['Seiðr is not spellcraft. It is listening, very hard, until the world tells you what it is made of. Then you ask it to be something else.', 'Six Ectoplasm from Gloamheim’s wraiths, to burn for the trance. Then sit in the moon-clearing in the Withered Wood and hold the trance for forty heartbeats. The wolves will come to see what you are doing. Do not let them interrupt.'],
  progress: 'Six Ectoplasm, then forty heartbeats of trance in the Withered Wood moon-clearing.',
  done: ['What did it tell you? <i>You tell him.</i> Hm. It never tells me that. It likes you better.', 'Here. A book of runes. Most of the pages are blank. You will fill them.'],
  seq: true,
  obj: [{ type: 'collect', item: 'ectoplasm', n: 6 }, { type: 'survive', map: 'withered_wood', x: 54.5, y: 12.5, r: 4.5, secs: 40, place: 'the moon-clearing', wave: { mobs: ['ash_wolf', 'mourning_spore'], every: 8, n: 2, max: 5 } }] });
trial('wolfhunter', { area: 'Withered Wood',
  summary: 'Hunt Hati’s ash wolves and bring back their pelts. Huginn is watching.',
  offer: ['<i>A raven lands on Vidar’s shoulder and looks at you with great disapproval.</i> This is Huginn. He belonged to someone important. Now he is bored.', 'Hunt fifteen ash wolves in the Withered Wood and bring me four good pelts. If Huginn likes how you hunt, he will go with you.'],
  progress: 'Fifteen Ash Wolves and four Ashen Pelts, in the Withered Wood.',
  done: ['<i>Huginn hops from Vidar’s shoulder to yours and pulls your hair, once.</i> That means yes.', 'A yew longbow, and a raven. Try to deserve both.'],
  drops: [{ mob: 'ash_wolf', item: 'wolf_pelt', chance: 0.2 }],
  obj: [{ type: 'kill', mob: 'ash_wolf', n: 15 }, { type: 'collect', item: 'wolf_pelt', n: 4 }] });
trial('skald', { area: 'Ashen Fields · Withered Wood · Gloamheim · Emberhold',
  summary: 'Walk the road of the saga, then sing it for Astrid.',
  offer: ['A Skald does not make songs up. A Skald goes where the thing happened, and listens until the song is there.', 'Stand at the burned shrine in the fields, in Hati’s moon-clearing, and at the gate of Gloamheim. Then come home and sing it to the smallest person in Emberhold. If she likes it, it is a true song.'],
  progress: 'The fields shrine, the moon-clearing, Gloamheim’s gate, then Astrid.',
  done: ['Astrid is humming it. She will hum it for a year. <i>Vidar almost smiles.</i>', 'A lyre. Old, but it stays in tune. So will you, if you keep singing.'],
  seq: true,
  obj: [{ type: 'reach', map: 'ashen_fields', x: 40.5, y: 32.5, r: 3.5, place: 'the burned crossroads shrine' },
    { type: 'reach', map: 'withered_wood', x: 54.5, y: 12.5, r: 3.5, place: 'Hati’s moon-clearing' },
    { type: 'reach', map: 'gloamheim', x: 30.5, y: 54.5, r: 4, place: 'the gate of Gloamheim' },
    { type: 'talk', npc: 'astrid', text: 'Sing the saga for Astrid in Emberhold' }] });
trial('priest', { area: 'Gloamheim Keep',
  summary: 'Cleanse the graves of Gloamheim and lay its wraiths to rest.',
  offer: ['The Valkyries chose who went to Valhalla. There is no Valhalla now, but someone still has to choose.', 'Gloamheim’s graves are open and nobody sings over them. Kneel at five of them and pray until the ground is quiet. Then lay eight of the wraiths to rest; they are the ones who were not chosen.'],
  progress: 'Pray beside five graves in Gloamheim (stand close for a few breaths), and put eight Wraiths to rest.',
  done: ['<i>He is quiet for a long time.</i> I felt the ground settle from here.', 'Sigrun asked me to give you this. She says a Valkyrie’s staff should be carried by someone who can still choose.'],
  obj: [{ type: 'visit', map: 'gloamheim', tile: T.GRAVE, n: 5, secs: 2.5, verb: 'Cleanse', place: 'graves', col: '#fff2b8' }, { type: 'kill', mob: 'wraith', n: 8 }] });
trial('monk', { area: 'Withered Wood · Gloamheim Keep',
  summary: 'Prove your fists against the kobolds, then hold Gloamheim’s gate like an Einherjar.',
  offer: ['The Einherjar fought all day in Valhalla, died, and got up at supper to do it again. When the hall burned they simply kept going.', 'Beat ten Rotwood Kobolds in the Wood. Then stand in the gate hall of Gloamheim for forty-five heartbeats while the dead come for you. Do not step back.'],
  progress: 'Ten Rotwood Kobolds, then hold Gloamheim’s gate hall for forty-five heartbeats.',
  done: ['You did not step back. <i>He sounds pleased, which is rare.</i>', 'Put these on. Your fists are weapons already; these only make it official.'],
  seq: true,
  obj: [{ type: 'kill', mob: 'rotwood_kobold', n: 10 }, { type: 'survive', map: 'gloamheim', x: 30.5, y: 52.5, r: 5, secs: 45, place: 'the gate hall of Gloamheim', wave: { mobs: ['skeleton_soldier', 'wraith'], every: 9, n: 2, max: 5 } }] });

/* ---------- Content round 5: crafting and Skaldhaven ---------- */
// Craftsmanship (a passive any path can learn): Brokkr teaches it, Sindri raises it.
quest('brokkr_apprentice', { giver: 'brokkr', name: 'The Smith’s Apprentice', area: 'Emberhold', req: { lvl: 10, test: () => !!P.flags.talked.brokkr },
  summary: 'Brokkr will teach you to work a forge if you bring him something to practise on.',
  offer: ['You keep bringing me the Ash’s leftovers to sell. Ever wondered what I do with them? Half of it goes in the still, half in the forge.', 'Bring me six Jellopy and three Grey Clovers and I’ll show you how a Red Potion is made. After that you can use my anvil whenever you like, and Sindri’s too if he lets you. I’ll charge you for the coal.'],
  progress: 'Six Jellopy, three Clovers. Porings and hares. It is not hard. That is the point.',
  done: ['Now watch. Heat, not fire. Stir, do not whip. There. That is a potion, and you made it.', 'That is <b>Craftsmanship</b>. Use the <i>Craft</i> tab at my forge. You get better by doing it, or by thinking hard about it (skill points). DEX steadies the hand, LUK does the rest.'],
  obj: [{ type: 'collect', item: 'jellopy', n: 6 }, { type: 'collect', item: 'clover', n: 3 }],
  reward: { exp: 900, jexp: 700, items: [['red_potion', 10]] },
  onComplete() { P.skills.craftsmanship = Math.max(1, P.skills.craftsmanship || 0); P.flags.craftXp = P.flags.craftXp || 0; log('You learned Craftsmanship (Lv 1). The Crafting window opens from the Craft tab at Brokkr’s or Sindri’s forge.', 'lvl'); } });
quest('sindri_masterclass', { giver: 'sindri', name: 'A Dwarf’s Standard', area: 'Nidavellir Deep', req: { lvl: 40, quests: ['brokkr_apprentice'], test: () => !!P.flags.talked.sindri },
  summary: 'Sindri will judge your work by a dwarf’s standard. Craft five things and bring him ore.',
  offer: ['My brother taught you? <i>He sniffs.</i> Then you know how to make soup with a hammer. Let me see what else your hands can do.', 'Make five things, anything, at any forge. Then bring me five Dvergr Ore and two Magma Cores and I will show you what a forge is for.'],
  progress: 'Five pieces of work, five ore, two cores. I can wait. I have waited since the fire went out.',
  done: ['<i>He turns your work over in his hands for a long time.</i> Hm. Not bad for a surface-dweller.', 'Here: a Dvergr Whetstone. Rub it into the metal before a refine. And you will find your hands know a little more than they did this morning.'],
  obj: [{ type: 'cond', text: 'Craft five things at a forge', check: () => (P.flags.craftedOk || 0) >= 5, prog: () => [Math.min(5, P.flags.craftedOk || 0), 5] }, { type: 'collect', item: 'dvergr_ore', n: 5 }, { type: 'collect', item: 'magma_core', n: 2 }],
  reward: { exp: 90000, jexp: 70000, items: [['dvergr_whetstone', 1]], rep: { dvergar: 1 }, title: 'forge_friend' },
  onComplete() { P.skills.craftsmanship = Math.min(CRAFT_MAX, (P.skills.craftsmanship || 1) + 1); log(`Craftsmanship Lv ${P.skills.craftsmanship}.`, 'lvl'); } });

/* ---------- Daily bounty boards ---------- */
// A board offers `perDay` quests from its pool, picked by the local date. Each can be done once a day.
const BOARDS = {
  emberhold_board: { name: 'Bounty Board', title: 'Ashen Fields', map: 'emberhold', x: 13.5, y: 18.5, perDay: 2, pool: [] },
  wood_board: { name: 'Bounty Board', title: 'Withered Wood', map: 'withered_wood', x: 9.5, y: 33.5, perDay: 2, pool: [] },
  keep_board: { name: 'Bounty Board', title: 'Gloamheim', map: 'gloamheim', x: 32.5, y: 52.5, perDay: 2, pool: [] },
  deep_board: { name: 'Bounty Board', title: 'Nidavellir Deep', map: 'nidavellir', x: 9.5, y: 30.5, perDay: 2, pool: [] },
  bifrost_board: { name: 'Bounty Board', title: 'Bifrost Ruins', map: 'bifrost', x: 7.5, y: 49.5, perDay: 2, pool: [] },
  skald_board: { name: 'Bounty Board', title: 'Skaldhaven', map: 'skaldhaven', x: 13.0, y: 8.6, perDay: 2, pool: [] },   // round 5: the Salt Hall's board
};
function bounty(id, board, name, o) {
  // Collect bounties are priced from the ordinary monsters that drop the item (an MVP's guaranteed drop would inflate them).
  const ob = o.obj[0], mobsOf = ob.type === 'kill' ? [].concat(ob.mob) : Object.keys(MOBS).filter(k => !MOBS[k].boss && !MOBS[k].variant && (MOBS[k].drops || []).some(d => d[0] === ob.item));
  const avg = mobsOf.reduce((a, k) => a + mobExp(MOBS[k]), 0) / Math.max(1, mobsOf.length), lvl = Math.max(...mobsOf.map(k => MOBS[k].lvl));
  const exp = Math.round(avg * ob.n * (ob.type === 'kill' ? 0.6 : 1.1) / 10) * 10;
  quest(id, Object.assign({ kind: 'daily', repeat: 'daily', giver: board, name, area: BOARDS[board].title, req: { lvl: Math.max(1, lvl - 4) },
    reward: { exp, jexp: Math.round(exp * 0.75), zeny: Math.round(lvl * ob.n * 9 / 10) * 10 } }, o));
  BOARDS[board].pool.push(id);
}
bounty('bb_porings', 'emberhold_board', 'Bounty: Blight Porings', { summary: 'The gate watch pays for every Poring that stops singing.', obj: [{ type: 'kill', mob: 'blight_poring', n: 15 }] });
bounty('bb_grubs', 'emberhold_board', 'Bounty: Ash Grubs', { summary: 'Grubs are eating the last seed stores. Squash them.', obj: [{ type: 'kill', mob: 'ash_grub', n: 12 }] });
bounty('bb_hares', 'emberhold_board', 'Bounty: Hollow Hares', { summary: 'Something hollowed out the hares. Put them to rest.', obj: [{ type: 'kill', mob: 'hollow_hare', n: 12 }] });
bounty('bb_cinders', 'emberhold_board', 'Bounty: Cinder Drops', { summary: 'Cinder Drops are setting the dry grass alight.', obj: [{ type: 'kill', mob: 'cinder_drop', n: 10 }] });
bounty('bb_husks', 'emberhold_board', 'Bounty: Scarecrow Husks', { summary: 'Husks wandered close to the east gate again.', obj: [{ type: 'kill', mob: 'scarecrow_husk', n: 8 }] });
bounty('bb_willows', 'wood_board', 'Bounty: Thorn Willows', { summary: 'Willows are creeping over the wood road. Cut them back.', obj: [{ type: 'kill', mob: 'thorn_willow', n: 10 }] });
bounty('bb_spores', 'wood_board', 'Bounty: Grey Spores', { summary: 'The alchemist in the ruins wants spores, sealed and dry.', obj: [{ type: 'collect', item: 'spore', n: 8 }] });
bounty('bb_wolves', 'wood_board', 'Bounty: Ash Wolves', { summary: 'Pack sighted near the Waystone. Thin it.', obj: [{ type: 'kill', mob: 'ash_wolf', n: 10 }] });
bounty('bb_kobolds', 'wood_board', 'Bounty: Kobold Raiders', { summary: 'Kobolds keep raiding travellers. Any kind will do.', obj: [{ type: 'kill', mob: ['rotwood_kobold', 'kobold_archer'], n: 12, label: 'Kobolds' }] });
bounty('bb_skeletons', 'keep_board', 'Bounty: Skeleton Soldiers', { summary: 'The keep’s dead garrison marches again. Break the ranks.', obj: [{ type: 'kill', mob: 'skeleton_soldier', n: 12 }] });
bounty('bb_archers', 'keep_board', 'Bounty: Grave Archers', { summary: 'Archers on the walls shoot at anything warm.', obj: [{ type: 'kill', mob: 'grave_archer', n: 10 }] });
bounty('bb_ecto', 'keep_board', 'Bounty: Ectoplasm', { summary: 'Sigrun wants ectoplasm to feed the Waystone’s fire.', obj: [{ type: 'collect', item: 'ectoplasm', n: 6 }] });
bounty('bb_knights', 'keep_board', 'Bounty: Rust Knights', { summary: 'Rust Knights guard the inner halls. Six fewer would help.', obj: [{ type: 'kill', mob: 'rust_knight', n: 6 }] });
bounty('bb_bats', 'deep_board', 'Bounty: Cave Bats', { summary: 'The bats have found Sindri’s forge warm. Sindri has not found them charming.', obj: [{ type: 'kill', mob: 'cave_bat', n: 15 }] });
bounty('bb_spiders', 'deep_board', 'Bounty: Crystal Spiders', { summary: 'The crystal galleries are webbed shut again.', obj: [{ type: 'kill', mob: 'crystal_spider', n: 10 }] });
bounty('bb_cores', 'deep_board', 'Bounty: Magma Cores', { summary: 'The deep forge eats magma cores. Feed it.', obj: [{ type: 'collect', item: 'magma_core', n: 6 }] });
bounty('bb_golems', 'deep_board', 'Bounty: Stone Golems', { summary: 'Golems are digging through the hall of statues. Stop them before they dig through a king.', obj: [{ type: 'kill', mob: 'stone_golem', n: 6 }] });
bounty('bb_revenants', 'deep_board', 'Bounty: Dwarf Revenants', { summary: 'Nýr asks for his lads to be laid down. Kindly.', obj: [{ type: 'kill', mob: 'dwarf_revenant', n: 10 }] });
bounty('bb_prisms', 'bifrost_board', 'Bounty: Prism Porings', { summary: 'The prism porings are nibbling the bridge. It does not have much left to nibble.', obj: [{ type: 'kill', mob: 'prism_poring', n: 15 }] });
bounty('bb_harpies', 'bifrost_board', 'Bounty: Sky Harpies', { summary: 'Harpies keep diving at Heimdall. He will not move, so you must.', obj: [{ type: 'kill', mob: 'sky_harpy', n: 12 }] });
bounty('bb_cores_aesir', 'bifrost_board', 'Bounty: Aesir Rune Cores', { summary: 'Heimdall wants the sentinels’ cores back, to relight the bridge one rune at a time.', obj: [{ type: 'collect', item: 'aesir_core', n: 5 }] });
bounty('bb_shades', 'bifrost_board', 'Bounty: Valkyrie Shades', { summary: 'Let the fallen Valkyries finish their last ride.', obj: [{ type: 'kill', mob: 'valkyrie_shade', n: 10 }] });
bounty('bb_whelps', 'bifrost_board', 'Bounty: Fenrir Whelps', { summary: 'The pack grows every night. Cull it.', obj: [{ type: 'kill', mob: 'fenrir_whelp', n: 10 }] });

/* =========================================================
   Content round 4 · Act II: The Wolf and the Gate
   Starts once the Age is chosen at the Heart (main_8) and Heimdall has been found (main_9). Twelve story quests;
   act2_7e / act2_7a is the branch (Age of Embers / Age of Ash). Scenes live in SCENES (js/data/npcs.js).
   ========================================================= */
const A2 = (id, o) => quest(id, Object.assign({ kind: 'main', act: 2, auto: true, giver: null, turnIn: null }, o));
A2('act2_1', { name: 'Embers and Ashes', area: 'Emberhold', req: { quests: ['main_8', 'main_9'] },
  summary: 'The King is dead and the Age is chosen, but the dead still rise. Sigrun wants to talk.',
  onAccept() { P.flags.act2 = P.flags.act2 || 1; },
  obj: [{ type: 'scene', npc: 'sigrun', scene: 'a2_sigrun', text: 'Speak with Sigrun at the Waystone in Emberhold' }],
  reward: { exp: 150000, jexp: 100000 } });
A2('act2_2', { name: 'What the Watchman Hears', area: 'Bifrost Ruins · Gloamheim Keep', req: { quests: ['act2_1'] }, seq: true,
  summary: 'Heimdall hears a chain thinning and a door creaking open under Gloamheim.',
  obj: [{ type: 'scene', npc: 'heimdall', scene: 'a2_heimdall', text: 'Ask Heimdall what he hears (Bifrost Ruins)' },
    { type: 'inspect', map: 'gloamheim', place: 'Sir Gaunt’s hall', r: 2, spots: [
      { x: 30.5, y: 9.5, name: 'The Empty Throne', text: ['<i>Gaunt’s throne is only a slab of stone now. It faces north: not toward the door you came in by, but toward the blank wall behind it.</i>', '<i>He was not guarding the keep from the world. He was guarding the world from the keep.</i>'] },
      { x: 29.5, y: 25.5, name: 'The Open Graves', text: ['<i>The graves in the lower hall are open, and every one of them was dug from the inside. The earth is heaped toward the north, as if everything that climbed out went the same way.</i>'] },
      { x: 30.5, y: 4.5, name: 'The North Wall', text: ['<i>Behind where the throne stood, the stones are cold enough to burn. Something breathes behind them. Very slowly. Very far down.</i>', '<i>Someone has carved a single rune into the wall at knee height, over and over, until the stone is worn smooth: ᛏ, Tyr’s rune. An oath, repeated.</i>'] }] }],
  reward: { exp: 200000, jexp: 140000, items: [['honey_mead', 3]] } });
A2('act2_3', { name: 'The Gate-Maiden', area: 'Gloamheim Keep', req: { quests: ['act2_2'] }, seq: true,
  summary: 'A maiden guards the crack behind Gaunt’s throne. Hel’s gate is opening, and the dead are pushing.',
  obj: [{ type: 'scene', npc: 'modgud', scene: 'a2_modgud', text: 'Speak with the woman at the north wall of Gaunt’s hall' },
    { type: 'waves', map: 'gloamheim', x: 30.5, y: 7.5, r: 7, place: 'Helgrind', limit: 55, gap: 4,
      waves: [[['draugr_fisher', 3], ['ice_wraith', 2]], [['dwarf_revenant', 3], ['draugr_fisher', 2]], [['valkyrie_shade', 2], ['dwarf_revenant', 2], ['ice_wraith', 1]]] },
    { type: 'scene', npc: 'modgud', scene: 'a2_modgud2', text: 'Speak with Móðguðr' }],
  reward: { exp: 250000, jexp: 170000, items: [['white_potion', 10]], lore: 'modgud' } });
A2('act2_4', { name: 'The Bridge Under the Forge', area: 'Nidavellir Deep', req: { quests: ['act2_3'] }, seq: true,
  summary: 'Hel’s road runs under the Deep Forge. Sindri knows what he built his fire on.',
  obj: [{ type: 'scene', npc: 'sindri', scene: 'a2_sindri', text: 'Ask Sindri what the Deep Forge stands on' },
    { type: 'kill', mob: 'dwarf_revenant', n: 10, label: 'Revenants walking to Hel', text: 'Stop the revenants walking to Hel’s call' },
    { type: 'scene', map: 'nidavellir', x: 32.5, y: 30.5, r: 2.2, scene: 'a2_hel_voice', place: 'Gjallarbrú, the stone bridge over the lava', text: 'Stand on Gjallarbrú, the stone bridge over the lava' }],
  reward: { exp: 250000, jexp: 170000, lore: 'hel' } });
A2('act2_5', { name: 'Six Impossible Things', area: 'All of Midgard', req: { quests: ['act2_4'] }, turnIn: 'sindri',
  summary: 'Gleipnir can be forged again from six things that do not exist. Find them and bring them to Sindri.',
  progress: 'Six things. I told you they were a nightmare.',
  done: ['Six. All six. <i>Sindri lays them on the anvil, and they do not quite touch it.</i>', 'Now I need a second pair of hands, and there is only one pair in nine realms that has done this before. My brother’s.'],
  obj: [{ type: 'collect', item: 'imp_footfall', n: 1, text: 'The footfall of a cat (Astrid in Emberhold may know)' },
    { type: 'collect', item: 'imp_beard', n: 1, text: 'The beard of a woman (the Marsh Hags of Mirewell)' },
    { type: 'collect', item: 'imp_roots', n: 1, text: 'The roots of a mountain (the Stone Golems of the Deep)' },
    { type: 'collect', item: 'imp_sinew', n: 1, text: 'The sinews of a bear (ask Ragna in Rimeshore)' },
    { type: 'collect', item: 'imp_breath', n: 1, text: 'The breath of a fish (the Draugr Fishers of Rimeshore)' },
    { type: 'collect', item: 'imp_spittle', n: 1, text: 'The spittle of a bird (the Sky Harpies of the Bifrost)' }],
  drops: [{ mob: 'marsh_hag', item: 'imp_beard', chance: 0.3 }, { mob: 'stone_golem', item: 'imp_roots', chance: 0.3 }, { mob: 'draugr_fisher', item: 'imp_breath', chance: 0.3 }, { mob: 'sky_harpy', item: 'imp_spittle', chance: 0.3 }],
  reward: { exp: 300000, jexp: 200000, zeny: 30000 } });
A2('act2_6', { name: 'Two Hammers', area: 'Emberhold · Nidavellir Deep', req: { quests: ['act2_5'] }, seq: true,
  summary: 'Gleipnir was made by two brothers. It will take both of them to make it again.',
  obj: [{ type: 'scene', npc: 'brokkr', scene: 'a2_brokkr', text: 'Ask Brokkr to come down to the Deep Forge' },
    { type: 'scene', npc: 'sindri', scene: 'a2_forge', text: 'Watch the brothers forge Gleipnir (Nidavellir Deep)' }],
  reward: { exp: 300000, jexp: 200000, lore: 'gleipnir' } });
A2('act2_7e', { name: 'The First Green Root', branch: 'embers', area: 'Mirewell', req: { quests: ['act2_6'], test: () => P.flags.ending === 'embers' }, seq: true,
  summary: 'The relit Tree has sent a root up through the old healer’s well in Mirewell. The mire’s dead want it gone.',
  obj: [{ type: 'scene', npc: 'eira', scene: 'a2_root', text: 'Speak with Eira in Mirewell' },
    { type: 'waves', map: 'mirewell', x: 30.5, y: 19.5, r: 7, place: 'the green root', limit: 55, gap: 4,
      waves: [[['marsh_hag', 2], ['wisp', 2]], [['mire_troll', 2], ['mire_leech', 2]], [['marsh_hag', 2], ['mire_troll', 1], ['wisp', 2]]] },
    { type: 'scene', npc: 'eira', scene: 'a2_root2', text: 'Return to Eira' }],
  reward: { exp: 300000, jexp: 200000, items: [['sprig_crown', 1]] } });
A2('act2_7a', { name: 'The Cinder Court', branch: 'ash', area: 'Throne of Cinders', req: { quests: ['act2_6'], test: () => P.flags.ending === 'ash' }, seq: true,
  summary: 'The Ash obeys its new ruler. The King’s old court kneels at the Throne of Cinders, all but one.',
  obj: [{ type: 'scene', map: 'throne', x: 15.5, y: 16.5, r: 5, scene: 'a2_crown', place: 'the Throne of Cinders', text: 'Hold court at the Throne of Cinders' },
    { type: 'hunt', mob: 'cinder_pretender', map: 'throne', x: 15.5, y: 10.5, place: 'the foot of the throne' },
    { type: 'scene', map: 'throne', x: 15.5, y: 8.5, r: 6, scene: 'a2_court', place: 'the broken throne', text: 'Command the Cinder Court' }],
  reward: { exp: 300000, jexp: 200000, items: [['cinder_circlet', 1]] } });
A2('act2_8', { name: 'The Wolf at the End of the World', area: 'Bifrost Ruins', req: { test: () => !!(P.quests.done.act2_7e || P.quests.done.act2_7a) }, seq: true,
  summary: 'Gleipnir is down to its last strands. Heimdall says the wolf must fall before it breaks.',
  obj: [{ type: 'scene', npc: 'heimdall', scene: 'a2_wolf', text: 'Bring the reforged Gleipnir to Heimdall' },
    { type: 'boss', mob: 'fenrir', text: 'Slay Fenrir on his island in the Bifrost Ruins' }],
  reward: { exp: 400000, jexp: 260000, items: [['ygg_ember', 1]] } });
A2('act2_9', { name: 'The One-Eyed Wanderer', area: 'Bifrost · Emberhold · Ashen Fields', req: { quests: ['act2_8'] }, seq: true,
  summary: 'Fenrir’s soul fell to Hel, and Hel is sewing him back together. The old man in Emberhold knows more than he says.',
  obj: [{ type: 'scene', npc: 'heimdall', scene: 'a2_hel_took', text: 'Ask Heimdall where the wolf went' },
    { type: 'scene', npc: 'vidar', scene: 'a2_odin', text: 'Confront Vidar in Emberhold' },
    { type: 'scene', map: 'ashen_fields', x: 40.5, y: 32.5, r: 3, scene: 'a2_well', place: 'the burned crossroads shrine', text: 'Walk with him to the burned shrine in the Ashen Fields' }],
  reward: { exp: 300000, jexp: 200000, items: [['wanderer_hat', 1]], title: 'odins_confidant', lore: 'odin' } });
A2('act2_10', { name: 'Hel’s Due', area: 'Gloamheim Keep', req: { quests: ['act2_9'] }, seq: true,
  summary: 'Hel is sewing her brother a new body at Helgrind. Go and see her.',
  obj: [{ type: 'scene', map: 'gloamheim', x: 30.5, y: 7.5, r: 3.5, scene: 'a2_hel', place: 'Helgrind, behind Gaunt’s throne', text: 'Go to Helgrind, behind Gaunt’s throne' },
    { type: 'hunt', mob: 'garmr_gate', map: 'gloamheim', x: 30.5, y: 9.5, place: 'Helgrind' },   // round 7: the variant of the Helheim MVP (mob_garmr)
    { type: 'scene', npc: 'modgud', scene: 'a2_modgud3', text: 'Speak with Móðguðr' }],
  reward: { exp: 400000, jexp: 260000, lore: 'garmr' } });
A2('act2_11', { name: 'Gjallarhorn', area: 'Bifrost Ruins', req: { quests: ['act2_10'] }, seq: true,
  summary: 'Fenrir climbs the roots toward the Bifrost in a body of nails and drowned men. Heimdall has a horn.',
  obj: [{ type: 'scene', npc: 'heimdall', scene: 'a2_horn', text: 'Return to Heimdall' },
    { type: 'hunt', mob: 'fenrir_risen', map: 'bifrost', x: 50.5, y: 10.5, place: 'Fenrir’s island' }],
  reward: { exp: 500000, jexp: 320000 } });
A2('act2_12', { name: 'Bind or Free', area: 'Bifrost Ruins', req: { quests: ['act2_11'] },
  summary: 'The wolf is down, and he cannot die. Bind him with Gleipnir, or set him free.',
  obj: [{ type: 'scene', map: 'bifrost', x: 50.5, y: 11.5, r: 6, scene: 'a2_choice', place: 'Fenrir’s island', text: 'Decide the wolf’s fate on his island' }],
  onComplete() { grantTitle(P.flags.fenrirFate === 'freed' ? 'wolf_friend' : 'wolfbinder'); },
  reward: { exp: 800000, jexp: 500000, zeny: 100000, items: P => [[P.flags.fenrirFate === 'freed' ? 'wolf_ears' : 'gleipnir_band', 1], ['ygg_ember', 3]] } });
// Story beats that are not quest objectives: an NPC plays a scene while `when()` is true (checked in talkTo).
// Skaldhaven's board (round 5): the harbour's troubles on the Rimeshore coast.
bounty('bb_draugr', 'skald_board', 'Bounty: Draugr on the Piers', { summary: 'Draugr fishers keep climbing the piers at night. Send them back down.', obj: [{ type: 'kill', mob: 'draugr_fisher', n: 10 }] });
bounty('bb_snowwolves', 'skald_board', 'Bounty: Snow Wolves', { summary: 'The wolves took two of Úlfar’s goats. He wants an apology in pelts.', obj: [{ type: 'kill', mob: 'snow_wolf', n: 12 }] });
bounty('bb_shells', 'skald_board', 'Bounty: Hermit Shells', { summary: 'Hallgerð roofs the Salt Hall with hermit shells. The roof leaks.', obj: [{ type: 'collect', item: 'hermit_shell', n: 5 }] });
bounty('bb_wraiths', 'skald_board', 'Bounty: Ice Wraiths', { summary: 'Ice wraiths drift in with the fog and freeze the rigging. Break them.', obj: [{ type: 'kill', mob: 'ice_wraith', n: 8 }] });
bounty('bb_manes', 'skald_board', 'Bounty: Frosted Manes', { summary: 'Thordis needs frosted manes for her loom. Do not ask what she weaves.', obj: [{ type: 'collect', item: 'frost_mane', n: 6 }] });

const STORY_TALK = [
  { npc: 'astrid', scene: 'a2_footfall', when: () => !!P.quests.active.act2_5 && !countItem('imp_footfall') },
  { npc: 'ragna', scene: 'a2_sinew', when: () => !!P.quests.active.act2_5 && !countItem('imp_sinew') },
];

/* =========================================================
   Content round 4 · Side quests across every realm
   Kinds of work: escort (gunnar_escort, hrafn_kari, tofa_escort), fetch chains (bolli_boat, sindri_commission),
   investigation (sigrun_cairns, eira_garden, sigrun_sisters), timed defence (wood_watch, ragna_icefish),
   named hunts with a unique drop (astrid_poring_king, wood_greyback, rime_shellback, deep_matriarch, vidar_skoll),
   collection for crafting materials (keep_grave_goods, nyr_tally, heimdall_gold), choices with consequences
   (astrid_poring_king, squire_sword, hrafn_nails, bolli_wisp, sindri_commission) and the weekly MVP hunt.
   ========================================================= */
// ---- Ashen Fields / Emberhold ----
quest('gunnar_escort', { giver: 'gunnar', name: 'The Last Farmer', area: 'Ashen Fields', req: { lvl: 6, quests: ['main_1'] },
  summary: 'Old Gunnar has been hiding at the burned shrine for a year. Walk him to the fields Waystone alive.',
  offer: ['<i>An old man with a pitchfork is sitting behind the shrine’s broken wall, very still, the way you sit when things are looking for you.</i>', 'I farmed these fields forty years. Now my own scarecrows hunt me through the rows. I made them well. That was my mistake.', 'The Waystone by the west road is warm, they say. I can’t get there on my own. My knees are sixty and the husks are not. Walk with me? Keep them off me?'],
  progress: 'Walk slow. Keep the husks off him. The Waystone is by the west road.',
  done: ['<i>Gunnar puts both hands flat on the Waystone and leaves them there.</i> Warm. It’s warm. I had forgotten warm.', 'Here. I had it on my head the whole way, and I think it’s the only reason they missed me. Straw hides a man from straw men.'],
  obj: [{ type: 'escort', npc: 'gunnar', map: 'ashen_fields', from: [39.5, 34.5], to: [9.5, 31.5], r: 3, place: 'the fields Waystone', hp: 100, dmg: 4, speed: 3.4 }],
  reward: { exp: 2500, jexp: 1800, zeny: 600, items: [['straw_hat', 1]], rep: { emberhold: 1 } } });
quest('astrid_poring_king', { giver: 'astrid', name: 'The Poring King', area: 'Ashen Fields', req: { lvl: 8, quests: ['astrid_clovers'] },
  summary: 'Astrid swears there is a Poring as big as a cart in the south-east of the fields, wearing a smaller Poring as a hat.',
  offer: ['There’s a KING. A Poring king! In the south-east of the fields, by the dead orchard. He’s as big as a cart and he wears another Poring on his head like a hat and they both look at you.', 'Nobody believes me. Sigrun said “that’s nice, dear”. Can you go and see? And if he’s real… can I have the hat? Pip needs a friend.'],
  progress: 'The south-east of the fields. A Poring as big as a cart. Wearing a Poring.',
  done: ['He was REAL? <i>Astrid bounces on her toes.</i> I KNEW it. Did he have the hat? Did you get the hat?'],
  obj: [{ type: 'hunt', mob: 'poring_king', map: 'ashen_fields', x: 50.5, y: 50.5, place: 'the dead orchard' }],
  choicePrompt: 'Astrid is looking at the Poring Hat with enormous eyes.',
  choices: [
    { label: 'Give Astrid the Poring Hat', need: () => hasItem('poring_hat'), take: [['poring_hat', 1]], reward: { exp: 3000, jexp: 2200, items: [['pip_charm', 1]], rep: { emberhold: 2 }, title: 'pips_hero' },
      done: ['<i>Astrid puts the Poring Hat on Pip. Pip is now mostly hat.</i> He LOVES it. Wait here. Don’t move.', '<i>She comes back an hour later with a lumpy stitched charm.</i> I made you this out of the lining. It’s lucky. I tested it. I found a button.'] },
    { label: 'Keep the hat (it is very comfortable)', reward: { exp: 3000, jexp: 2200, zeny: 800 },
      done: ['<i>Astrid looks at the hat, then at you, then at the hat.</i> …It does suit you. Pip says you can keep it. Pip is being very brave about it.'] }] });
// ---- Withered Wood ----
quest('sigrun_cairns', { giver: 'sigrun', name: 'The Hunters’ Cairns', area: 'Withered Wood', req: { lvl: 14, quests: ['sigrun_wolves'] },
  summary: 'Sigrun asks you to visit the three hunters’ cairns in the Withered Wood and tell her what is on them.',
  offer: ['Before the fire, the hunters of the Wood buried their dead under cairns and left a raven feather on each stone. I used to carry those hunters home.', 'There are three cairns still standing, I think. In the north of the Wood, in the east, and in the south. Go and look at them for me. Tell me if the feathers are still there.'],
  progress: 'Three cairns in the Withered Wood: north, east and south.',
  done: ['The feathers are still there. <i>Sigrun closes her eyes.</i> Odin’s ravens brought them, every one. He never missed a hunter. He never missed anyone, back then.', 'Keep this one. It came off the last cairn in the wind while I was carrying the man under it. I never knew what to do with it.'],
  obj: [{ type: 'inspect', map: 'withered_wood', place: 'the hunters’ cairns', r: 2, spots: [
    { x: 20.5, y: 12.5, name: 'The North Cairn', text: ['<i>A heap of grey stones, knee-high. A black feather is wedged between the top two, glossy as if it fell yesterday.</i>', '<i>Scratched into the base: “Arn. He tracked the moon-wolf three days and came home.”</i>'] },
    { x: 44.5, y: 40.5, name: 'The East Cairn', text: ['<i>Half the stones have been scattered by something heavy. The feather is still there, pinned under the one stone nobody could move.</i>', '<i>“Hild. She hunted with her daughter. Only one of them came home, and it was not Hild.”</i>'] },
    { x: 26.5, y: 52.5, name: 'The South Cairn', text: ['<i>The smallest cairn. The feather on this one is white.</i>', '<i>“Unnamed. A traveller. We did not know her, so we gave her the white feather, the one for the ones the ravens find first.”</i>'] }] }],
  reward: { exp: 5000, jexp: 3600, items: [['raven_feather', 1]], rep: { emberhold: 1 }, lore: 'wood_cairns' } });
quest('wood_greyback', { giver: 'wood_board', name: 'Wanted: Old Greyback', area: 'Withered Wood', req: { lvl: 18 },
  summary: 'WANTED: the old grey wolf that has been killed twice and came back both times. Last seen in the heart of the Wood.',
  offer: ['<i>A poster, nailed through the middle of a wolf’s ear.</i> WANTED: OLD GREYBACK. Killed twice (by Arn, by Hild). Came back twice. Seen in the heart of the Wood, among the stumps. Bring proof. Keep the pelt, we don’t want it.'],
  progress: 'Old Greyback, in the heart of the Withered Wood among the stumps.',
  done: ['<i>Someone has scrawled underneath the poster: “Third time lucky.” You tear it down.</i>'],
  obj: [{ type: 'hunt', mob: 'old_greyback', map: 'withered_wood', x: 30.5, y: 44.5, place: 'the heart of the Wood' }],
  reward: { exp: 7000, jexp: 5000, zeny: 2500, items: [['orange_potion', 10]] } });
quest('wood_watch', { giver: 'wood_board', name: 'Night Watch at the Waystone', area: 'Withered Wood', req: { lvl: 16 },
  summary: 'The Wood Waystone is attacked every night. Hold it through three waves, each in less than a minute.',
  offer: ['<i>A notice in Sigrun’s neat hand.</i> The Waystone in the Withered Wood is attacked every night now: wolves first, then kobolds, then the willows walk. Whoever holds it through a whole night will be paid from the Emberhold chest. Do not let a wave linger. The stone weakens while they are on it.'],
  progress: 'Stand by the Withered Wood Waystone. Clear each wave within 50 seconds.',
  done: ['<i>A second notice has been pinned beside the first, in the same hand:</i> Thank you. Payment is under the stone. The stone says thank you too.'],
  obj: [{ type: 'waves', map: 'withered_wood', x: 7.5, y: 36.5, r: 6, place: 'the Wood Waystone', limit: 50, gap: 4,
    waves: [[['ash_wolf', 3]], [['rotwood_kobold', 2], ['kobold_archer', 2]], [['thorn_willow', 2], ['ash_wolf', 2], ['mourning_spore', 2]]] }],
  reward: { exp: 6500, jexp: 4800, zeny: 2000, items: [['orange_potion', 8], ['fly_wing', 5]] } });
// ---- Gloamheim Keep ----
quest('squire_sword', { giver: 'einar', name: 'The Squire’s Last Errand', area: 'Gloamheim Keep', req: { lvl: 26 },
  summary: 'Sir Gaunt’s ghost squire wants the pieces of his lord’s broken blade. The Rust Knights carry them.',
  offer: ['My lord broke his sword on the day he broke his oath. The Rust Knights took the pieces. They were his men. They think if they carry them long enough he will come back and need them.', 'Please. Four pieces. I would like to lay it out properly, the way a squire should. Then I think I can stop polishing.'],
  progress: 'Four fragments of Gaunt’s blade, from the Rust Knights of the inner halls.',
  done: ['<i>Einar fits the four fragments together on the floor. They do not quite meet. Tyr’s rune runs across the break.</i>', 'He meant well. Didn’t he? At the start? <i>He looks up at you.</i> I would like to know what you think. Then I will know what to do with it.'],
  drops: [{ mob: 'rust_knight', item: 'gaunt_fragment', chance: 0.3 }],
  obj: [{ type: 'collect', item: 'gaunt_fragment', n: 4 }],
  choicePrompt: 'The broken sword lies between you. Einar is waiting.',
  choices: [
    { label: '“He meant well. Lay it to rest with him.”', reward: { exp: 26000, jexp: 19000, items: [['squire_plume', 1]], rep: { dead: 2 }, lore: 'einar' },
      done: ['<i>Einar lays the blade out, points to the north wall, and kneels beside it.</i> Thank you. That is what I hoped. <i>He is getting fainter.</i> You should have my helm. I polished it every day. It was always a little too big for me.', '<i>When you look up, the squire is gone, and the helm is in your hands.</i>'] },
    { label: '“Good steel should not lie in the dark. Let Brokkr reforge it.”', reward: { exp: 26000, jexp: 19000, items: classWeapon(BROKKR_T2, 5), rep: { dvergar: 1 } },
      done: ['<i>Einar is quiet for a long moment.</i> My lord hated waste. <i>He almost smiles.</i> Take it to the smith. Tell him it was Gaunt’s. He will know what that means.', '<i>Brokkr works through the night and sends the blade back up the road with a note: “Five times. The rune was still in it.”</i>'] }] });
quest('keep_grave_goods', { giver: 'keep_board', name: 'Grave Goods', area: 'Gloamheim Keep', req: { lvl: 24 },
  summary: 'Sindri’s old contact in the keep pays in star-iron for bone and ectoplasm, for reasons he does not explain.',
  offer: ['<i>A neat dwarven hand:</i> WANTED. Bone shards (12) and ectoplasm (6), for a forge far below. Payment in star-iron, which is worth more than you think. Leave them at this board. Do not ask.'],
  progress: 'Twelve Bone Shards and six Ectoplasm.',
  done: ['<i>You leave the bundle at the board. When you look back, it is gone, and two dull ingots sit in its place, warm as bread.</i>'],
  obj: [{ type: 'collect', item: 'bone_shard', n: 12 }, { type: 'collect', item: 'ectoplasm', n: 6 }],
  reward: { exp: 20000, jexp: 15000, items: [['star_iron', 2]] } });
// ---- Rimeshore ----
quest('ragna_icefish', { giver: 'ragna', name: 'The Fishing Hole', area: 'Rimeshore', req: { lvl: 33, quests: ['ragna_wolves'] },
  summary: 'Ragna’s fishers need the lagoon hole held while they haul the nets. Three waves, no time to waste.',
  offer: ['We cut a new hole on the lagoon ice, where the fish still run. Every time we haul, the shore wakes up and comes for us.', 'Hold the hole while the fishers work. Three pushes, and they come fast. If you let one sit on the ice too long, the ice breaks under all of us.'],
  progress: 'The fishing hole on the south lagoon. Three waves, each cleared within fifty seconds.',
  done: ['A full net. <i>Ragna grins and throws you a fish, which is frozen solid.</i> Eat it later. And take this. Eira spins it from wisp-light and sends it to me for mending; I never mend anything.'],
  obj: [{ type: 'waves', map: 'rimeshore', x: 40.5, y: 50.5, r: 6, place: 'the fishing hole', limit: 50, gap: 4,
    waves: [[['snow_wolf', 3]], [['shell_knight', 1], ['rime_poring', 3]], [['draugr_fisher', 2], ['ice_wraith', 2]]] }],
  reward: { exp: 90000, jexp: 65000, items: [['rune_thread', 2], ['honey_mead', 2]], rep: { rimeshore: 1 } } });
quest('hrafn_kari', { giver: 'hrafn', name: 'Kari on the Ice', area: 'Rimeshore', req: { lvl: 30, test: () => !!P.flags.talked.ragna },
  summary: 'Hrafn’s grandson went salvaging at the beached longships. Bring him home before the wolves find him.',
  offer: ['My grandson Kari went out to the wrecks on the beach this morning. Salvage, he said. There is nothing to salvage. He wanted to see the Jarl’s ships.', 'Bring him back. He will say he can walk on his own. He cannot. Not past the wolves.'],
  progress: 'Kari is at the beached longships north-east of the camp. Walk him home.',
  done: ['<i>Hrafn cuffs Kari round the ear and then holds on to him for a long time.</i>', 'Here. The boy made it for you on the way back, he says. A luck-knot. I taught him that knot. It has never come undone.'],
  obj: [{ type: 'escort', npc: 'kari', map: 'rimeshore', from: [45.5, 26.5], to: [8.5, 33.5], r: 3.5, place: 'the camp', hp: 100, dmg: 5, speed: 3.8 }],
  reward: { exp: 70000, jexp: 50000, items: [['kari_knot', 1]], rep: { rimeshore: 1 } } });
quest('rime_shellback', { giver: 'ragna', name: 'Old Shellback', area: 'Rimeshore', req: { lvl: 36, rep: { rimeshore: 1 } },
  summary: 'The oldest shell knight on the lagoon wears Ragna’s great-grandfather’s helm. She wants it back.',
  offer: ['You have been a friend to this shore, so I will tell you something I tell nobody. The biggest shell knight on the south lagoon wears my great-grandfather’s helm. Old Shellback, the fishers call it.', 'I have wanted that helm back since I was eight. I could never get near it. You could.'],
  progress: 'Old Shellback, on the south lagoon ice.',
  done: ['<i>Ragna turns the shell-crusted helm over in her hands.</i> It is mostly crab now. <i>She laughs.</i> Keep it. Great-grandfather would have liked the crab.'],
  obj: [{ type: 'hunt', mob: 'shellback', map: 'rimeshore', x: 38.5, y: 55.5, place: 'the south lagoon' }],
  reward: { exp: 110000, jexp: 80000, zeny: 12000, rep: { rimeshore: 1 } } });
quest('hrafn_nails', { giver: 'hrafn', name: 'Nails for Naglfar', area: 'Rimeshore', req: { lvl: 34, test: () => !!P.flags.talked.ragna },
  summary: 'The draugr are collecting dead men’s nails for a ship. Hrafn wants to know what to do about it.',
  offer: ['You know why the draugr fish the cracks? Not for fish. For nails. Dead men’s nails. They pull them off the drowned and carry them north in their nets.', 'Naglfar, the ship of the dead, is built of them. The more nails, the bigger the ship. Bring me ten. Then we will decide what to do with them.'],
  progress: 'Ten Dead Man’s Nails from the Draugr Fishers.',
  done: ['<i>Hrafn tips the nails into a bowl. They clink like teeth.</i> Ten planks Naglfar will not have. Now. We could burn them, the old way, and sing over them. Or a dwarf I know would pay well for them. Dead men’s nails make very hard iron.'],
  drops: [{ mob: 'draugr_fisher', item: 'dead_nail', chance: 0.35 }],
  obj: [{ type: 'collect', item: 'dead_nail', n: 10 }],
  choicePrompt: 'Hrafn holds the bowl of nails over the fire.',
  choices: [
    { label: 'Burn them and sing over them', reward: { exp: 80000, jexp: 60000, zeny: 5000, rep: { rimeshore: 2 }, lore: 'naglfar' },
      done: ['<i>Hrafn tips them into the fire and sings. The camp comes out to listen. By the end, everyone is singing, badly, and the nails are ash.</i>'] },
    { label: 'Send them to Sindri for iron', reward: { exp: 80000, jexp: 60000, items: [['star_iron', 3]], rep: { dvergar: 1 } },
      done: ['<i>Hrafn shrugs.</i> Iron is iron. <i>A week later a crate arrives from the Deep with three dull ingots in it and a note: “Hardest iron I ever worked. Do not ask me to do it twice.”</i>'] }] });
// ---- Mirewell ----
quest('bolli_boat', { giver: 'bolli', name: 'A Boat for the Boatman', area: 'Mirewell · Emberhold · Rimeshore', req: { lvl: 38, test: () => !!P.flags.talked.eira }, seq: true,
  summary: 'Bolli wants to build a boat. He needs caulking moss, nails from Brokkr and Hrafn’s old sail.',
  offer: ['A boatman with no boat is just a man standing next to water. I’m going to build one.', 'I need troll moss to caulk the seams: six handfuls. Then nails; the only smith who still makes boat nails is Brokkr, up in Emberhold. And a sail. Old Hrafn in Rimeshore had one, before the sea froze. He never throws anything away.'],
  progress: 'Troll moss, Brokkr’s nails, Hrafn’s sail. In that order, or Bolli frets.',
  done: ['<i>Bolli lays everything out on the boardwalk and walks around it three times.</i> A boat. There’s a boat in there. I can see it.', 'Here: my hat. I won’t need it till the boat’s done, and that’ll be a year. It floats. Mostly.'],
  obj: [{ type: 'collect', item: 'troll_moss', n: 6 },
    { type: 'talk', npc: 'brokkr', gives: [['boat_nails', 1]], text: 'Ask Brokkr in Emberhold for boat nails' },
    { type: 'talk', npc: 'hrafn', gives: [['old_sail', 1]], text: 'Ask old Hrafn in Rimeshore for his sail' }],
  take: [['boat_nails', 1], ['old_sail', 1]],
  reward: { exp: 120000, jexp: 85000, items: [['boatman_hat', 1]], rep: { mirewell: 1 } } });
quest('eira_garden', { giver: 'eira', name: 'The Crone’s Garden', area: 'Mirewell', req: { lvl: 40, quests: ['eira_crone'] },
  summary: 'Now that the Crone is gone, Eira wants to know what she was, before. Search her old places.',
  offer: ['I have hated her for so long I have forgotten what she was like before. That frightens me more than she did.', 'Her hut is on stilts in the west. Her garden was on the dry ground east of the crossing. And she drew water at the old healer’s well south of the camp. Go and look. Tell me what you find.'],
  progress: 'The Crone’s hut in the west, her old garden in the east, and the healer’s well.',
  done: ['<i>Eira reads the list of children’s names for a long time.</i> My name is on it. And Ragna’s. She delivered us both.', 'I think I will plant her garden again. Thank you. That was not easy to hear, and I needed to hear it.'],
  obj: [{ type: 'inspect', map: 'mirewell', place: 'the Crone’s old places', r: 2, spots: [
    { x: 15.5, y: 34.5, name: 'The Hut on Stilts', text: ['<i>Inside the hut, under the reek of the cauldron, there is a shelf of small clay jars, each labelled in a careful hand: “for coughs”, “for teeth”, “for grief (weak)”, “for grief (strong)”.</i>'] },
    { x: 46.5, y: 22.5, name: 'The Old Garden', text: ['<i>Gone to weeds and black water, but you can still see the rows: feverfew, yarrow, woundwort. Someone laid them out to be walked between, with a bench at the end to rest on.</i>'] },
    { x: 33.5, y: 18.5, name: 'The Healer’s Well', text: ['<i>Tucked into a niche in the well-stones is an oilcloth packet. Inside is a list of names, hundreds of them, each with a date. At the top of the page: “Children I brought into the world. God keep every one.”</i>'] }] }],
  reward: { exp: 130000, jexp: 95000, items: [['white_potion', 10]], rep: { mirewell: 1 }, lore: 'crone_garden' } });
quest('bolli_wisp', { giver: 'bolli', name: 'The Wisp That Hums', area: 'Mirewell', req: { lvl: 39, test: () => !!P.flags.talked.eira },
  summary: 'A small wisp follows Bolli everywhere, humming his daughter’s lullaby. It is fading. Feed it wisp-flame.',
  offer: ['See that light by my shoulder? It’s been following me since the Crone boiled my boat. It hums. <i>He clears his throat.</i> It hums the song I used to sing my daughter.', 'It’s fading. The other wisps have flame to spare. Three of their flames might keep it going. After that… I don’t know what’s kind.'],
  progress: 'Three Wisp Flames for the little wisp.',
  done: ['<i>The little wisp drinks the flames and glows so bright you can see the boardwalk end to end. The humming gets louder.</i>', 'It’s strong now. Strong enough to go wherever wisps go. Or strong enough to stay. <i>Bolli won’t look at you.</i> You decide. I can’t.'],
  obj: [{ type: 'collect', item: 'wisp_flame', n: 3 }],
  choicePrompt: 'The wisp hovers between you and Bolli, humming.',
  choices: [
    { label: 'Let it go', reward: { exp: 90000, jexp: 65000, zeny: 8000, rep: { mirewell: 2 } },
      done: ['<i>You open your hands. The wisp circles Bolli’s head once, twice, and then drifts out over the black water, humming, and goes out like a candle at bedtime.</i>', '<i>Bolli sits down on the planks and does not say anything for a long time. Then:</i> Thank you. That was the right thing. I hate that it was the right thing.'] },
    { label: 'Keep it safe in a jar', reward: { exp: 90000, jexp: 65000, items: [['wisp_lantern', 1]] },
      done: ['<i>You coax the wisp into an old mead jar. It settles on the bottom and hums, contentedly, like a cat.</i>', '<i>Bolli taps the glass.</i> Look after her. She likes it when you’re sad. She glows more. Don’t be sad on purpose.'] }] });
// ---- Nidavellir Deep ----
quest('tofa_escort', { giver: 'sindri', name: 'Lost in the Shafts', area: 'Nidavellir Deep', req: { lvl: 44, test: () => !!P.flags.talked.sindri },
  summary: 'Tófa, the last dwarf child in the Deep, went into the old mine shafts. Bring her back to the forge.',
  offer: ['Tófa went down the old shafts again. South-west, where the rails run. She says the rock sings to her. It does. It sings “come closer”.', 'She is the last child of the Deep. Bring her back to my forge. Carry her if you must. She will bite.'],
  progress: 'Tófa is in the old mine shafts to the south-west. Walk her back to Sindri’s forge.',
  done: ['<i>Sindri picks Tófa up by the back of her tunic, looks at her, and puts her down again.</i> Rock sings, does it. <i>He sighs.</i> Her grandmother said the same. She was right, too.', 'Thank you. The Deep owes you. Take this, and my word: my forge is yours.'],
  obj: [{ type: 'escort', npc: 'tofa', map: 'nidavellir', from: [11.5, 52.5], to: [26.5, 28.5], r: 3, place: 'Sindri’s forge', hp: 120, dmg: 7, speed: 3.6 }],
  reward: { exp: 160000, jexp: 115000, zeny: 12000, items: [['white_potion', 10]], rep: { dvergar: 2 } } });
quest('deep_matriarch', { giver: 'deep_board', name: 'Wanted: The Amethyst Matriarch', area: 'Nidavellir Deep', req: { lvl: 46 },
  summary: 'WANTED: the mother of all crystal spiders, in the galleries north-east of the forge.',
  offer: ['<i>A poster held on by a crystal shard.</i> WANTED: THE AMETHYST MATRIARCH. Mother of the galleries. Size of a cart. Crystals worth a king’s ransom on her back. She has eaten three prospectors this year. Signed, the prospectors’ widows.'],
  progress: 'The Amethyst Matriarch, in the crystal galleries north-east of the forge.',
  done: ['<i>You tear down the poster. Behind it, someone has pinned a pressed flower and the words: “thank you”.</i>'],
  obj: [{ type: 'hunt', mob: 'amethyst_matriarch', map: 'nidavellir', x: 53.5, y: 11.5, place: 'the crystal galleries' }],
  reward: { exp: 170000, jexp: 120000, zeny: 20000, items: [['white_potion', 8]] } });
quest('nyr_tally', { giver: 'nyr', name: 'Nýr’s Tally', area: 'Nidavellir Deep', req: { lvl: 42 },
  summary: 'Nýr still keeps the mine’s tally. The shift is short on bat wings and rune stones.',
  offer: ['Tally’s short. Tally’s always short. Eight bat wings for the lamp-oil, six rune stones for the golems’ heads. We don’t make golems any more, but the tally doesn’t know that.', 'Bring them and I’ll pay you in thread. The rune-thread the ghost-weavers spin down the south shaft. And a bit of star-iron. Don’t tell Sindri I had it.'],
  progress: 'Eight Bat Wings and six Rune Stones.',
  done: ['<i>Nýr marks the tally with a finger that leaves a faint glowing line.</i> Square. First time in four hundred years the tally’s square. Here.'],
  obj: [{ type: 'collect', item: 'bat_wing', n: 8 }, { type: 'collect', item: 'rune_stone', n: 6 }],
  reward: { exp: 140000, jexp: 100000, items: [['rune_thread', 2], ['star_iron', 1]] } });
quest('sindri_commission', { giver: 'sindri', name: 'A Helm Worth the Name', area: 'Nidavellir Deep', req: { lvl: 45, quests: ['sindri_forge'] },
  summary: 'Sindri will forge you a rune-helm from star-iron, rune-thread and Asgard gold, if you can bring them.',
  offer: ['That thing on your head. Is it a helm, or is it a pot you lost a fight with? <i>He sniffs.</i> I can do better.', 'Three star-iron ingots for the shell, three lengths of rune-thread for the lining, and two sheets of Asgard gold leaf for the runes. The iron comes from the keep and the shore, the thread from the Deep and the ice, the gold from the watchman’s bridge.'],
  progress: 'Three Star-Iron Ingots, three Rune-Woven Thread, two Asgard Gold Leaf.',
  done: ['<i>Sindri turns the metal over in the forge-light.</i> Good. Now: what is the helm for? A helm is for something. The arm, the mind, or the eye. Choose, and I will cut the rune.'],
  obj: [{ type: 'collect', item: 'star_iron', n: 3 }, { type: 'collect', item: 'rune_thread', n: 3 }, { type: 'collect', item: 'gold_leaf', n: 2 }],
  choicePrompt: 'Which rune shall Sindri cut over the brow?',
  choices: [
    { label: 'ᚦ The arm (STR)', reward: { exp: 150000, jexp: 110000, items: [['runehelm_str', 1]], rep: { dvergar: 1 } }, done: ['ᚦ, for the hammer. <i>Clang.</i> There. Hit things with it. Not with the helm. With your arm.'] },
    { label: 'ᚨ The mind (INT)', reward: { exp: 150000, jexp: 110000, items: [['runehelm_int', 1]], rep: { dvergar: 1 } }, done: ['ᚨ, for the god who asks questions. <i>Clang.</i> He will want it back, when he sees it. Tell him no.'] },
    { label: 'ᛊ The eye (DEX)', reward: { exp: 150000, jexp: 110000, items: [['runehelm_dex', 1]], rep: { dvergar: 1 } }, done: ['ᛊ, for the sun that is gone. <i>Clang.</i> Aim true. Somebody should.'] }] });
// ---- Bifrost Ruins ----
quest('sigrun_sisters', { giver: 'sigrun', name: 'Names of the Fallen', area: 'Bifrost Ruins', req: { lvl: 50, quests: ['main_9'] },
  summary: 'Sigrun’s sisters fell on the Bifrost. Their statues stand at the Valkyries’ rest. Read their names aloud.',
  offer: ['My sisters rode out on the last day. Hrist, Mist, Skögul, Göndul. They chose the slain, and then they were chosen.', 'Their statues stand on the Bifrost, on the island the Valkyries used to rest on. I cannot go. I would not come back. Will you stand at each one and say her name? Out loud. Someone should.'],
  progress: 'The four statues at the Valkyries’ rest, east of the Rune Plaza.',
  done: ['<i>Sigrun listens to you say the four names, and says them back, one by one, and on the last one her voice breaks and she lets it.</i>', 'Thank you. This was Göndul’s. She would want it worn by someone who still goes places.'],
  obj: [{ type: 'inspect', map: 'bifrost', place: 'the Valkyries’ rest', r: 2.2, spots: [
    { x: 50.5, y: 30.5, name: 'Hrist', text: ['<i>A tall statue with a broken spear. At its foot, carved small: “Hrist, the Shaker. She laughed in battle. It annoyed everyone.”</i>', '<i>You say her name aloud. The wind over the bridge drops for a moment.</i>'] },
    { x: 55.5, y: 30.5, name: 'Mist', text: ['<i>A slender figure, face veiled. “Mist, the Cloud. Nobody ever saw her coming, and she liked it that way.”</i>', '<i>You say her name. A little cloud passes over the statue, and away.</i>'] },
    { x: 50.5, y: 35.5, name: 'Skögul', text: ['<i>A Valkyrie leaning on a shield, her head bowed. “Skögul, the Battle. She chose the slain for longer than any of us, and she never once chose wrong.”</i>', '<i>You say her name. Somewhere below the clouds, something rings like a struck shield.</i>'] },
    { x: 55.5, y: 35.5, name: 'Göndul', text: ['<i>The smallest statue, with two silver wings still bright on her helm. “Göndul, the Wand-Wielder. The youngest. Sigrun’s favourite, though she would never say.”</i>', '<i>You say her name. One of the silver wings comes loose in your hand, as if it had been waiting.</i>'] }] }],
  reward: { exp: 250000, jexp: 180000, items: [['valkyrie_circlet', 1]], rep: { emberhold: 1 }, lore: 'valkyries' } });
quest('vidar_skoll', { giver: 'vidar', name: 'Sköll, the Sun-Chaser', area: 'Bifrost Ruins', req: { lvl: 55, quests: ['main_9'] },
  summary: 'Hati had a brother who chased the sun. He runs in circles on the Rune Plaza, looking for it.',
  offer: ['You killed Hati. Good. He had a brother, Sköll, who chased the sun as Hati chased the moon. When the sky burned he caught it, and it went out in his mouth.', 'He runs in circles on the Rune Plaza now, looking for it. Put him out of his misery. I owe the wolves that much. More than that, but that much.'],
  progress: 'Sköll, on the Rune Plaza in the middle of the Bifrost Ruins.',
  done: ['<i>The old man turns Sköll’s milk-tooth over in his fingers.</i> He was the gentler of the two. Did you know that? He would bring the sun back to the horizon every evening like a dog with a stick.', 'Keep the tooth. Wear it. Someone should remember him kindly.'],
  obj: [{ type: 'hunt', mob: 'skoll', map: 'bifrost', x: 33.5, y: 40.5, place: 'the Rune Plaza' }],
  reward: { exp: 380000, jexp: 260000, zeny: 30000, lore: 'sun_wolves' } });
quest('heimdall_gold', { giver: 'heimdall', name: 'Gold of Asgard', area: 'Bifrost Ruins', req: { lvl: 50, test: () => !!P.flags.talked.heimdall },
  summary: 'Heimdall can beat Asgard gold into leaf again, if you bring prism shards and rune cores to heat the old forge.',
  offer: ['The halls here were roofed in gold leaf once. I can still beat it, if the old forge on the landing is fed: prism shards for the light and rune cores for the heat.', 'Eight shards, four cores. I will keep what I need for the bridge and give you the rest. Gold leaf is useful to smiths, I am told. I have never had a smith.'],
  progress: 'Eight Prism Shards and four Aesir Rune Cores.',
  done: ['<i>Heimdall beats the gold on his shield with the pommel of his sword, very gently, for a very long time.</i> There. Thin enough to read through. Go and find a smith who deserves it.'],
  obj: [{ type: 'collect', item: 'prism_shard', n: 8 }, { type: 'collect', item: 'aesir_core', n: 4 }],
  reward: { exp: 220000, jexp: 160000, items: [['gold_leaf', 3], ['honey_mead', 3]] } });

/* ---------- The weekly MVP hunt ----------
   The Hunter’s Board in Emberhold posts one echo a week (weeks start Monday) once Act II has begun. Echoes are Lv 60
   variants of the fallen MVPs, raised again by Hel’s open gate; each appears in its old lair and drops its original’s
   uniques (bossDefeated picks by the base type). */
BOARDS.hunt_board = { name: 'Hunter’s Board', title: 'Weekly MVP', map: 'emberhold', x: 24.5, y: 21.5, perDay: 1, period: 'week', pool: [] };
function weekly(id, mob, map, x, y, place, base) {
  quest(id, { kind: 'weekly', repeat: 'weekly', giver: 'hunt_board', name: `Weekly Hunt: ${MOBS[mob].name}`, area: MAPDEFS[map].name,
    req: { lvl: 55, quests: ['main_7'], test: () => !!(P.flags.act2 || P.quests.done.act2_1) },   // Hel's gate is open: Act II has begun
    summary: `Hel’s open gate has raised an echo of ${MOBS[base].name}. It waits in the old lair: ${place}.`,
    offer: [`<i>A black-bordered notice, fresh this week.</i> ECHO SIGHTED: ${MOBS[mob].name.toUpperCase()}, ${place}. It is stronger than the one you remember. It remembers you. Bounty paid once a week.`],
    progress: `${MOBS[mob].name}, ${place} (${MAPDEFS[map].name}).`,
    done: ['<i>You pin the echo’s mark to the board. Someone has already chalked a tally beside your name.</i>'],
    obj: [{ type: 'hunt', mob, map, x, y, place }],
    reward: { exp: 600000, jexp: 400000, zeny: 60000, items: [['honey_mead', 5], ['star_iron', 1], ['gold_leaf', 1]] } });
  BOARDS.hunt_board.pool.push(id);
}
weekly('weekly_hati', 'echo_hati', 'withered_wood', 48.5, 48.5, 'the moon-wolf’s den', 'hati');
weekly('weekly_gaunt', 'echo_gaunt', 'gloamheim', 30.5, 9.5, 'Gaunt’s hall', 'sir_gaunt');
weekly('weekly_jarl', 'echo_jarl', 'rimeshore', 51.5, 11.5, 'the frozen sea-cave', 'drowned_jarl');
weekly('weekly_crone', 'echo_crone', 'mirewell', 32.5, 53.5, 'the Crone’s island', 'bog_crone');
weekly('weekly_fafnir', 'echo_fafnir', 'nidavellir', 51.5, 52.5, 'the hoard cave', 'fafnir');

/* =========================================================
   Titles and achievements (round 4). Engine: grantTitle / achTick in js/quests.js; UI: Journal → Achievements.
   A title is shown under your name in the HUD and under your feet in the world. Achievement fields:
   { id, cat, name, desc, check: () => bool, prog: () => [cur, max], title }. Ids are save data (P.ach).
   ========================================================= */
const TITLES = {
  wanderer: 'Wanderer of Nine Roads', keeper: 'Keeper of Embers', shardbearer: 'Shardbearer', kingslayer: 'Kingslayer', mvp_hunter: 'MVP Hunter',
  reaper: 'Reaper of Midgard', collector: 'Card Collector', bounty_hunter: 'Bounty Hunter', echo_hunter: 'Echo-Hunter', saga: 'Saga-Worthy',
  ember_bearer: 'Ember-Bearer', ash_crowned: 'Ash-Crowned', odins_confidant: 'Odin’s Confidant', gate_warden: 'Warden of Helgrind',
  wolfbinder: 'Wolfbinder', wolf_friend: 'Wolf-Friend', pips_hero: 'Pip’s Hero', shield_kin: 'Shield-Kin of Rimeshore', mire_friend: 'Friend of the Mire',
  dvergar_friend: 'Dvergar-Friend', ghost_speaker: 'Who Speaks for the Dead', refused: 'Refused Again', hatter: 'Hatter of Midgard',
  forge_friend: 'Forge-Friend', master_smith: 'Master Smith', hoarder: 'Keeper of Hoards',   // round 5
  reborn: 'Reborn', warg_rider: 'Warg-Rider', beast_friend: 'Beast-Friend', beast_tamer: 'Tamer of the Ash',   // round 6
};
const killsOf = f => { let n = 0; const K = P.flags.kills || {}; for (const k in K) if (MOBS[k] && !MOBS[k].variant && f(MOBS[k], k)) n += K[k]; return n; };
const allKills = () => killsOf(() => true);
const MVP_KEYS = ['blight_mother', 'hati', 'sir_gaunt', 'ashen_king', 'drowned_jarl', 'bog_crone', 'fafnir', 'fenrir'];
const NAMED_KEYS = ['poring_king', 'old_greyback', 'shellback', 'amethyst_matriarch', 'skoll'];
const QUEST_HATS = ['straw_hat', 'poring_hat', 'raven_feather', 'greyback_hood', 'squire_plume', 'shellback_helm', 'boatman_hat', 'amethyst_diadem', 'runehelm_str', 'runehelm_int', 'runehelm_dex', 'valkyrie_circlet', 'sprig_crown', 'cinder_circlet', 'wanderer_hat', 'gleipnir_band', 'wolf_ears'];
const wayMaps = () => MAP_ORDER.filter(k => MAPDEFS[k] && genMap(k).way);
// Side quests anyone can finish: not the second-class trials (one path each) and not the pre-Act II Fenrir quest.
const sideIds = () => Object.keys(QUESTS).filter(id => QUESTS[id].kind === 'side' && !QUESTS[id].trial && !QUESTS[id].reborn && (id !== 'vidar_fenrir' || P.quests.done[id]));   // round 6: the rebirth chain is not a side quest for 'every side quest'
const cardsOfMap = k => { const d = MAPDEFS[k], s = new Set(d.spawns.map(x => x[0])); if (d.boss) s.add(d.boss); return [...s].filter(m => ITEMS['c_' + m]); };
const nCards = () => Object.keys(P.flags.cards || {}).length;
const ach = (cat, id, name, desc, check, prog, title) => ({ cat, id, name, desc, check, prog, title });
const cnt = (n, f) => [() => f() >= n, () => [f(), n]];
const ACHIEVEMENTS = [
  ach('Combat', 'first_blood', 'First Blood', 'Defeat a monster.', ...cnt(1, allKills)),
  ach('Combat', 'kills_100', 'Ash-Walker', 'Defeat 100 monsters.', ...cnt(100, allKills)),
  ach('Combat', 'kills_1000', 'Reaper of Midgard', 'Defeat 1,000 monsters.', ...cnt(1000, allKills), 'reaper'),
  ach('Combat', 'porings', 'Poring Popper', 'Defeat 50 Porings of any kind.', ...cnt(50, () => killsOf((d, k) => /poring/.test(k)))),
  ach('Combat', 'wolves', 'Wolf-Bane', 'Defeat 100 wolves: ash, snow or Fenrir’s whelps.', ...cnt(100, () => killsOf((d, k) => ['ash_wolf', 'snow_wolf', 'fenrir_whelp'].includes(k)))),
  ach('Combat', 'undead', 'Undertaker', 'Lay 200 undead to rest.', ...cnt(200, () => killsOf(d => d.race === 'undead'))),
  ach('Combat', 'named', 'Named and Numbered', 'Defeat all five named monsters of the side quests.', ...cnt(5, () => NAMED_KEYS.filter(k => (P.flags.kills || {})[k]).length)),
  ach('Bosses', 'shards', 'Shardbearer', 'Take all three Rune-Shards.', ...cnt(3, () => Object.keys(P.flags.shards).length), 'shardbearer'),
  ach('Bosses', 'king', 'Kingslayer', 'Slay the Ashen King.', () => !!P.flags.bosses.ashen_king, null, 'kingslayer'),
  ach('Bosses', 'mvps', 'MVP Hunter', 'Defeat all eight MVPs of Midgard.', ...cnt(8, () => MVP_KEYS.filter(k => P.flags.bosses[k]).length), 'mvp_hunter'),
  ach('Bosses', 'echoes', 'Echo-Hunter', 'Complete the weekly MVP hunt three times.', ...cnt(3, () => Object.keys(QUESTS).filter(id => QUESTS[id].kind === 'weekly').reduce((a, id) => a + ((P.quests.done[id] && P.quests.done[id].n) || 0), 0)), 'echo_hunter'),
  ach('Exploration', 'all_maps', 'Wanderer of Nine Roads', 'Set foot in every realm on the World Map.', ...cnt(MAP_ORDER.length, () => MAP_ORDER.filter(k => P.flags.seen[k]).length), 'wanderer'),
  ach('Exploration', 'all_ways', 'Keeper of Embers', 'Kindle every Waystone in Midgard.', () => wayMaps().every(k => P.kindled[k]), () => [wayMaps().filter(k => P.kindled[k]).length, wayMaps().length], 'keeper'),
  ach('Cards', 'cards_10', 'Card Sharp', 'Find 10 different monster cards.', ...cnt(10, nCards)),
  ach('Cards', 'cards_30', 'Card Collector', 'Find 30 different monster cards.', ...cnt(30, nCards), 'collector'),
  ...MAP_ORDER.filter(k => MAPDEFS[k] && MAPDEFS[k].spawns.length).map(k => ach('Cards', 'cards_' + k, `Cards of ${MAPDEFS[k].name}`, `Find every card of ${MAPDEFS[k].name}, its MVP’s included.`, () => cardsOfMap(k).every(m => P.flags.cards && P.flags.cards[m]), () => [cardsOfMap(k).filter(m => P.flags.cards && P.flags.cards[m]).length, cardsOfMap(k).length])),
  ach('Story', 'age_embers', 'The Age of Embers', 'Relight the Tree at its Heart.', () => P.flags.ending === 'embers', null, 'ember_bearer'),
  ach('Story', 'age_ash', 'The Age of Ash', 'Take the Crown of Cinders.', () => P.flags.ending === 'ash', null, 'ash_crowned'),
  ach('Story', 'odin', 'The Wanderer Unmasked', 'Learn who Vidar really is.', () => !!P.flags.odin),
  ach('Story', 'gate', 'Helgrind Shut', 'Silence Garmr and see the gate-maiden’s lantern lit.', () => !!P.flags.gateShut, null, 'gate_warden'),
  ach('Story', 'bound', 'The Wolf Bound', 'Bind Fenrir with the reforged Gleipnir.', () => P.flags.fenrirFate === 'bound'),
  ach('Story', 'freed', 'The Wolf Freed', 'Cut Hel’s stitches and set Fenrir free.', () => P.flags.fenrirFate === 'freed'),
  ach('Quests', 'side_10', 'Helping Hand', 'Complete 10 side quests.', ...cnt(10, () => sideIds().filter(id => P.quests.done[id]).length)),
  ach('Quests', 'side_all', 'Saga-Worthy', 'Complete every side quest in Midgard.', () => sideIds().every(id => P.quests.done[id]), () => [sideIds().filter(id => P.quests.done[id]).length, sideIds().length], 'saga'),
  ach('Quests', 'bounties', 'Bounty Hunter', 'Claim 25 daily bounties.', ...cnt(25, () => Object.keys(QUESTS).filter(id => QUESTS[id].kind === 'daily').reduce((a, id) => a + ((P.quests.done[id] && P.quests.done[id].n) || 0), 0)), 'bounty_hunter'),
  ach('Quests', 'hats', 'Hatter of Midgard', 'Own five of the quest headgear at once.', ...cnt(5, () => QUEST_HATS.filter(hasItem).length), 'hatter'),
  ach('Standing', 'rep_rime', 'Shield-Kin', 'Reach +3 standing with Rimeshore.', ...cnt(3, () => repOf('rimeshore')), 'shield_kin'),
  ach('Standing', 'rep_mire', 'Friend of the Mire', 'Reach +3 standing with Mirewell.', ...cnt(3, () => repOf('mirewell')), 'mire_friend'),
  ach('Standing', 'rep_dvergar', 'Dvergar-Friend', 'Reach +3 standing with the Dvergar.', ...cnt(3, () => repOf('dvergar')), 'dvergar_friend'),
  ach('Standing', 'rep_dead', 'Who Speaks for the Dead', 'Earn the trust of the restless dead.', ...cnt(2, () => repOf('dead')), 'ghost_speaker'),
  // Round 5: crafting and services
  ach('Crafting', 'craft_1', 'First Work', 'Craft something at a forge.', ...cnt(1, () => P.flags.craftedOk || 0)),
  ach('Crafting', 'craft_50', 'Busy Hands', 'Craft 50 things.', ...cnt(50, () => P.flags.craftedOk || 0)),
  ach('Crafting', 'masterwork', 'Masterwork', 'Craft a piece of Masterwork gear.', ...cnt(1, () => P.flags.masterworks || 0), 'master_smith'),
  ach('Crafting', 'enchant_5', 'Seiðr-Touched', 'Have Thordis reroll five enchantments.', ...cnt(5, () => P.flags.enchants || 0)),
  ach('Crafting', 'hoard', 'Keeper of Hoards', 'Keep 60 stacks in storage.', ...cnt(60, () => (P.storage || []).length), 'hoarder'),
  ach('Other', 'lv60', 'Tree-Tall', 'Reach Base Level 60.', ...cnt(60, () => P.lvl)),
  ach('Other', 'refine7', 'Proud Metal', 'Own a piece of gear refined to +7 or more.', () => [...P.inv, ...SLOTS.map(s => P.equip[s])].some(i => i && (i.refine || 0) >= 7)),
  ach('Other', 'zeny', 'Andvari’s Envy', 'Carry 1,000,000 zeny.', ...cnt(1000000, () => P.zeny)),
  ach('Other', 'deaths', 'Refused Again', 'Die ten times. The Tree keeps sending you back.', ...cnt(10, () => P.flags.deaths || 0), 'refused'),
];

/* ---------- Content round 6: rebirth (design/tier3.md) ----------
   Vidar offers it to a second class at Base Lv 60 + Job Lv 50 once the Age is chosen (main_8). The three roots of
   Yggdrasil (Act II: Mímir's burned well at the crossroads shrine, Hvergelmir under Helgrind, Urðr's well on the
   Bifrost), then the Norns' price for Heimdall, then the Heart of Yggdrasil (talkHeart -> heartRebirth, npcs.js),
   which calls rebirth() (core.js). `reborn: true` keeps these out of the "every side quest" achievement. */
const rebornOpen = () => CLASSES[P.cls].tier === 2 && !P.flags.reborn;
quest('reborn_1', { giver: 'vidar', reborn: true, name: 'The Roots Remember', area: 'Ashen Fields · Gloamheim · Bifrost Ruins',
  req: { lvl: 60, jlvl: 50, quests: ['main_8'], test: rebornOpen },
  summary: 'Vidar says the Tree can spin a life again. First, listen at its three roots.',
  offer: ['<i>He does not look up from the fire.</i> You have gone as far as a path goes. I can see it on you. The next step is not forward.', 'The Tree stands on three roots, and all three still drink. Go and listen at each one: Mímir’s well, the burned shrine at the crossroads in the fields; Hvergelmir, under Hel’s gate in Gloamheim; and Urðr’s well, where the broken bridge runs into the sky. Then come back and tell me what they said.'],
  progress: 'Mímir’s well at the crossroads shrine, Hvergelmir at Helgrind, Urðr’s well in the Bifrost’s Rune Plaza. Then Vidar.',
  done: ['<i>You tell him. He is quiet for a long time.</i> They all said the same thing to me, once. “Not yet.” To you they said “again”.', 'The Norns can spin you again. Young, and remembering everything. But they do not work for nothing.'],
  obj: [
    { type: 'inspect', map: 'ashen_fields', place: 'Mímir’s well', r: 2.2, spots: [{ x: 40.5, y: 32.5, name: 'Mímir’s Well', text: ['<i>The shrine is still black with the fire. Under it, very deep, water moves.</i>', 'A voice like a stone rolling over: <i>An eye for wisdom. A son for time. What will you pay, little ember? … Nothing? Good. Then listen: the Tree is not finished with you.</i>'] }] },
    { type: 'inspect', map: 'gloamheim', place: 'Hvergelmir', r: 2.5, spots: [{ x: 30.5, y: 7.5, name: 'Hvergelmir', text: ['<i>Behind Helgrind the root goes down into a roar of cold water, the spring every river of the dead begins from.</i>', '<i>The dead drink here and forget. You drink and remember everything: every time you fell in the Ash, and every time you got up.</i>'] }] },
    { type: 'inspect', map: 'bifrost', place: 'Urðr’s well', r: 2.5, spots: [{ x: 33.5, y: 40.5, name: 'Urðr’s Well', text: ['<i>In the Rune Plaza a dry basin of white stone, carved with every name that was ever spun. Yours is there, and the thread beside it is nearly used up.</i>', '<i>Three shadows stand around the basin and one of them, the young one, winks at you.</i>'] }] },
  ],
  reward: { zeny: 20000, lore: 'roots' } });
quest('reborn_2', { giver: 'vidar', turnIn: 'heimdall', reborn: true, name: 'The Norns’ Price', area: 'Midgard · Bifrost Ruins',
  req: { quests: ['reborn_1'], test: rebornOpen },
  summary: 'The Norns want three Embers of Yggdrasil and five Valkyrie Plumes. Heimdall keeps the way to their well.',
  offer: ['The Norns’ price is always the same: something of the Tree, and something of the ones who chose the slain. Three Embers of Yggdrasil. Five plumes from the Valkyrie shades on the broken bridge.', 'Bring them to Heimdall. He has kept the way to Urðr’s well since before there was a bridge. He will draw the water for you.'],
  progress: 'Three Embers of Yggdrasil (the great beasts drop them; the smiths sometimes sell one) and five Valkyrie Plumes, for Heimdall.',
  done: ['<i>Heimdall takes the embers and the plumes and walks off the edge of the bridge. He comes back a minute later, not wet at all, with a flask of water that is heavier than water should be.</i>', 'Pour it on the Heart. All of it. And say goodbye to this body; you have used it well.'],
  obj: [{ type: 'collect', item: 'ygg_ember', n: 3 }, { type: 'collect', item: 'valkyrie_plume', n: 5 }],
  reward: { items: [['urd_water', 1]], lore: 'norns' } });
quest('reborn_3', { giver: null, turnIn: null, auto: true, reborn: true, name: 'Born Again', area: 'Throne of Cinders',
  req: { quests: ['reborn_2'] },
  summary: 'Pour the Water of Urðr on the Heart of Yggdrasil, behind the Throne of Cinders.',
  obj: [{ type: 'cond', text: 'Pour the Water of Urðr on the Heart of Yggdrasil and be born again', check: () => !!P.flags.reborn }],
  reward: { title: 'reborn', lore: 'reborn' } });
ACHIEVEMENTS.push(
  ach('Rebirth', 'reborn', 'Born Again', 'Be reborn at the Heart of Yggdrasil.', () => !!P.flags.reborn),
  ach('Rebirth', 'tier3', 'The Higher Path', 'Take up a reborn path: Rune Jarl, Paladin of Tyr, Galdr Master, Völva, Fenris Stalker, Voice of Bragi, Valkyrie or Berserkr.', () => CLASSES[P.cls].tier === 3),
  ach('Rebirth', 'tier3_70', 'Spun Anew', 'Reach Job Lv 70 in a reborn path.', ...cnt(70, () => CLASSES[P.cls].tier === 3 ? P.jlvl : 0)),
  ach('Companions', 'warg', 'Warg-Rider', 'Ride one of Ylva’s wargs.', () => !!P.flags.rode, null, 'warg_rider'),
  ach('Companions', 'tame_1', 'A Friend in the Ash', 'Tame a monster.', ...cnt(1, () => Object.keys(P.flags.tamed || {}).length)),
  ach('Companions', 'pet_loyal', 'Beast-Friend', 'Raise a pet to Loyal.', () => !!(P.pet && P.pet.intim >= 910) || !!P.flags.petLoyal, null, 'beast_friend'),
  ach('Companions', 'tame_all', 'Tamer of the Ash', 'Tame every kind of pet in Midgard.', ...cnt(Object.keys(PETS).length, () => Object.keys(P.flags.tamed || {}).length), 'beast_tamer'),
);

/* =========================================================
   Content round 7 · Act III: The Roots of Hel (after Act II; Helheim needs a reborn hero at Base Lv 70)
   Six story quests (`act: 3`). Scenes live in SCENES (js/data/npcs.js: a3_*). Rebirth is the key: Hel's law keeps
   the living out of her realm, but not one the Norns have spun twice (WARP_LOCKS.hel in js/core.js).
   ========================================================= */
const A3 = (id, o) => quest(id, Object.assign({ kind: 'main', act: 3, auto: true, giver: null, turnIn: null }, o));
A3('act3_1', { name: 'The Gnawing Below', area: 'Gloamheim Keep', req: { quests: ['act2_12'] }, seq: true,
  summary: 'The dead are pressing back against Helgrind from the living side, as if something below frightens them. Móðguðr wants a word.',
  onAccept() { P.flags.act3 = P.flags.act3 || 1; },
  obj: [{ type: 'scene', npc: 'modgud', scene: 'a3_modgud', text: 'Speak with Móðguðr at Helgrind (Gloamheim Keep)' },
    { type: 'cond', text: 'Be born again at the Heart of Yggdrasil (Vidar knows the way)', check: () => !!P.flags.reborn },
    { type: 'cond', text: 'Grow strong in your second life (Base Lv 70)', check: () => !!P.flags.reborn && P.lvl >= 70, prog: () => [P.flags.reborn ? Math.min(70, P.lvl) : 0, 70] }],
  reward: { exp: 600000, jexp: 300000, lore: 'helheim' } });
A3('act3_2', { name: 'Across Gjallarbrú', area: 'Helheim', req: { quests: ['act3_1'] }, seq: true,
  summary: 'Walk through Helgrind into Helheim, find the camp by the road, and cross the golden bridge over Gjöll.',
  obj: [{ type: 'reach', map: 'helheim', text: 'Walk through Helgrind into Helheim (Gloamheim Keep, behind Gaunt’s throne)' },
    { type: 'cond', text: 'Kindle the Waystone in the camp by the Helgrind road', check: () => !!P.kindled.helheim },
    { type: 'scene', map: 'helheim', x: GJALL.x0 + 1.5, y: GJALL.y0 + 5, r: 1.6, scene: 'a3_bridge', place: 'Gjallarbrú', text: 'Cross Gjallarbrú, the golden bridge over Gjöll' }],
  reward: { exp: 800000, jexp: 400000, items: [['gjoll_draught', 10]], lore: 'gjoll' } });
A3('act3_3', { name: 'The Hound Before the Hall', area: 'Helheim', req: { quests: ['act3_2'] }, seq: true,
  summary: 'Hel sewed Garmr back together and chained him before Eljudnir’s door. Nobody enters Hel’s hall while he stands.',
  obj: [{ type: 'boss', mob: 'garmr', text: 'Defeat Garmr, chained before Eljudnir' },
    { type: 'scene', map: 'helheim', x: 32.5, y: 11.5, r: 3, scene: 'a3_hel', place: 'Eljudnir’s door', text: 'Go to the door of Eljudnir' }],
  reward: { exp: 1200000, jexp: 600000, items: [['warding_ash', 3]], lore: 'eljudnir' } });
A3('act3_4', { name: 'Ganglati’s Stair', area: 'Helheim · the Deep Roots', req: { quests: ['act3_3'] }, turnIn: 'ganglati',
  summary: 'The way to Níðhöggr must be found from below. Go down Ganglati’s stair, beat what waits on the fifth floor, and bring back pieces of the root the dragon’s brood have chewed.',
  progress: 'Down… is… this way. The fifth floor. And splinters… of the root.',
  done: ['<i>Ganglati turns the splinters over in his hands. It takes a very long time.</i> These… are fresh. He bit them… yesterday.', 'The Root Road, west of the plain, goes under the great root to Hvergelmir. It was choked… with the dead. They have run away… from him. <i>He nods, slowly.</i> It is open. Go. I will… still be here.'],
  obj: [{ type: 'cond', text: 'Beat the master of floor 5 of the Deep Roots', check: () => !!(P.flags.deep && (P.flags.deep.bosses || 0) >= 1), prog: () => [Math.min(1, (P.flags.deep && P.flags.deep.bosses) || 0), 1] },
    { type: 'collect', item: 'root_splinter', n: 3, text: 'Splinters of the World-Root (Níðhöggr’s brood carry them)' }],
  drops: [{ mob: 'nidhogg_spawn', item: 'root_splinter', chance: 0.35 }],
  onComplete() { P.flags.lore.hvergelmir = true; },
  reward: { exp: 1500000, jexp: 700000, zeny: 150000, items: [['golden_apple', 1]] } });
A3('act3_5', { name: 'Malice-Striker', area: 'Hvergelmir', req: { quests: ['act3_4'] }, seq: true,
  summary: 'Níðhöggr gnaws the root at Hvergelmir. Take the Root Road west under the great root, and stop him.',
  obj: [{ type: 'scene', map: 'helheim_hvergelmir', x: 20.5, y: 26.5, r: 6, scene: 'a3_hvergelmir', place: 'Hvergelmir', text: 'Take the Root Road to Hvergelmir' },
    { type: 'boss', mob: 'nidhogg', text: 'Slay Níðhöggr at the root' }],
  reward: { exp: 3000000, jexp: 1200000, items: [['golden_apple', 2]], lore: 'nidhogg' } });
A3('act3_6', { name: 'What Hel Owes', area: 'Eljudnir', req: { quests: ['act3_5'] },
  summary: 'The gnawing has stopped. Hel pays her debts. Go to her table in Eljudnir and name your price.',
  obj: [{ type: 'scene', map: 'helheim_arena', x: 22.5, y: 16.5, r: 7, scene: 'a3_payment', place: 'Hel’s table', text: 'Go to Hel’s table in Eljudnir' }],
  reward: { exp: 2500000, jexp: 1000000, zeny: 300000, title: 'hels_guest', items: P => [[({ rest: 'u_hel_mercy', vidar: 'u_vidar_shoe', seal: 'u_hel_seal' })[P.flags.helPact] || 'u_hel_mercy', 1], ['golden_apple', 3]] } });

/* ---------- Helheim side quests (round 7) and Hel's bounty board ---------- */
const helReq = (lvl, o) => Object.assign({ lvl, quests: ['act3_2'] }, o || {});
quest('eir_roses', { giver: 'eir', name: 'Roses for the Unwed', area: 'Helheim', req: helReq(72),
  summary: 'Eir wants the dead roses the corpse brides carry. She says they still remember being alive, and that is medicine.',
  offer: ['The brides on the north plain carry bouquets of roses that died the day they did. They will not let go of them. They will not let go of anything.', 'A dead rose remembers the garden. Steep it and it remembers for you. Bring me eight, and I will brew you something that helps you remember too.'],
  progress: 'Eight grave roses, from the corpse brides north of the river.',
  done: ['<i>Eir lays the roses out in a row.</i> Eight gardens. <i>She crushes them, one by one, into a kettle.</i> Here. Drink it slowly. Cry if you want. Everybody does.'],
  obj: [{ type: 'collect', item: 'grave_rose', n: 8 }],
  reward: { exp: 600000, jexp: 380000, items: [['gjoll_draught', 10], ['soul_tonic', 5]], rep: { dead: 1 } } });
quest('eir_child', { giver: 'eir', name: 'The Lantern Child', area: 'Helheim', req: helReq(72),
  summary: 'A lost soul, a child with a lantern, cries in the cairn field west of the camp. Walk it to Eir’s fire before the hounds find it.',
  offer: ['There is a child in the cairn field to the west. A lost soul. It has been crying for a hundred years, and the hounds follow the sound.', 'The dead cannot carry it: it will not let them. It might let you. Walk it here, to the fire. Slowly. Children are slow even when they are dead.'],
  progress: 'The lost child waits in the cairn field west of the camp. Bring it to Eir’s fire.',
  done: ['<i>The child sits down by the fire and, for the first time in a hundred years, stops crying.</i>', '<i>Eir looks at you over its head.</i> Thank you. I will keep it until it remembers its name. Here: the souls left me these. They want you to have them.'],
  obj: [{ type: 'escort', npc: 'lost_child', map: 'helheim', from: [13.5, 45.5], to: [31.0, 51.0], r: 3, place: 'Eir’s fire', hp: 120, dmg: 5, speed: 3.2 }],
  reward: { exp: 700000, jexp: 420000, items: [['soul_tonic', 5], ['warding_ash', 2]], rep: { dead: 1 } } });
quest('hlin_names', { giver: 'hlin', name: 'Names on the Stones', area: 'Helheim', req: helReq(70),
  summary: 'Hlín keeps a list of names Frigg asked her to look for. Read the four cairns in the west plain and tell her who lies there.',
  offer: ['Frigg gave me a list before she went. Names she wanted kept safe: mothers, mostly. I have looked for them for a long time.', 'There are four cairns on the west plain, by the river and among the stones. Read them for me. I cannot leave the chest.'],
  progress: 'Four cairns on the west plain of Helheim: two by the camp’s cairn field, one by the river, one further out.',
  done: ['<i>Hlín reads your list against hers. Her finger stops on one name, and stays there.</i> She is here. After all this time.', 'Take this. Frigg gave it to me so she could always find me. I do not need to be found any more. You might.'],
  obj: [{ type: 'inspect', map: 'helheim', place: 'the west cairns', r: 2.3, spots: [
    { x: 13.0, y: 45.9, name: 'The Long Barrow', text: ['<i>A barrow heaped with frosted stones, a rusted sword in its head.</i>', '<i>Scratched on the shield at its foot: “Hervor. She went into the mound for her father’s sword and came out with it.”</i>'] },
    { x: 15.5, y: 49.7, name: 'The Small Cairn', text: ['<i>A little cairn with a soul candle guttering on top.</i>', '<i>“Unnr, who carried water.” Someone has left a cup beside it. It is full.</i>'] },
    { x: 10.5, y: 50.7, name: 'The Leaning Cairn', text: ['<i>A cairn leaning toward the camp, as if listening to the fire.</i>', '<i>“Gerd the weaver. She wove the sails of the ships that took her sons.”</i> The name is on Hlín’s list.'] },
    { x: 9.9, y: 37.9, name: 'The River Barrow', text: ['<i>A barrow by Gjöll’s bank. Faces move under the ice beside it.</i>', '<i>“Signy, who waited.” Nothing else. Nothing else was needed.</i>'] }] }],
  reward: { exp: 500000, jexp: 320000, items: [['u_hlin_brooch', 1]], lore: 'hlin', rep: { dead: 2 } } });
quest('gauti_draugr', { giver: 'gauti', name: 'Grave-Goods', area: 'Helheim', req: helReq(74),
  summary: 'Hel’s draugr hoard the Obols of the dead they rob. Gauti wants them “returned to circulation”.',
  offer: ['The draugr out on the plain rob the newly dead of their Obols. Then they sit on them. Nobody spends them. It is a terrible waste.', 'Put fifteen of them back in the ground and bring me what they drop. I will pay you in Obols. Some of them may even be theirs.'],
  progress: 'Fifteen of Hel’s draugr, anywhere on the plain.',
  done: ['<i>Gauti counts the coins twice, then a third time out of habit.</i> Circulation restored. Here is your cut. It is a generous cut. Do not tell anybody.'],
  obj: [{ type: 'kill', mob: 'hel_draugr', n: 15 }],
  reward: { exp: 650000, jexp: 400000, zeny: 40000, items: [['hel_obol', 25]] } });
quest('gauti_marrow', { giver: 'gauti', name: 'Bones for the Forge', area: 'Helheim', req: helReq(82, { quests: ['act3_2', 'gauti_draugr'] }),
  summary: 'Sindri, up in Nidavellir, wants colossus marrow and hound-chain for Gjöll-forged steel. Gauti is brokering the deal.',
  offer: ['I had a letter from a dwarf. A dwarf! Writing to Hel! He wants giant’s marrow from the bone colossi and links of the hounds’ chains. Six of each.', 'Bring them. The dwarf pays well, and I pay you some of what the dwarf pays me, and everybody is happy except the colossi.'],
  progress: 'Six Giant’s Marrow (bone colossi) and six Hound-Chain Links (hounds of Hel).',
  done: ['<i>Gauti wraps the bones and chain in old shrouds and addresses them to Nidavellir.</i> There. The dwarf sent these in advance. He said you would know what to do with them.'],
  obj: [{ type: 'collect', item: 'colossus_marrow', n: 6 }, { type: 'collect', item: 'hel_chain', n: 6 }],
  reward: { exp: 800000, jexp: 480000, items: [['black_sun_shard', 2], ['dvergr_whetstone', 1], ['hel_obol', 15]] } });
quest('modgud_bridge', { giver: 'modgud_hel', name: 'Hold Gjallarbrú', area: 'Helheim', req: helReq(76),
  summary: 'The hungry dead are trying to cross the bridge back toward the living. Hold its south head with Móðguðr through three waves.',
  offer: ['They are coming again. The ones who have been down too long, who have forgotten they are dead. They want to go home, and home does not want them.', 'Stand with me at the south end of the bridge. I will ask their names. You will stop them while I ask.'],
  progress: 'Hold the south head of Gjallarbrú. Clear each wave in under a minute.',
  done: ['<i>Móðguðr sets her lantern down on the bridge. There is a flame in it, and it is steady.</i> I asked every one of their names. I will forget them by morning. You will not, I think.', 'Take the lantern. It lit for you, not for me. I have another. I have always had another.'],
  obj: [{ type: 'waves', map: 'helheim', x: 32.5, y: 38.5, r: 6, place: 'the south head of Gjallarbrú', limit: 60, gap: 4,
    waves: [[['hel_hound', 3], ['soul_wisp', 2]], [['hel_draugr', 3], ['hel_hound', 2]], [['corpse_bride', 2], ['hel_draugr', 2], ['hel_hound', 2]]] }],
  reward: { exp: 900000, jexp: 520000, items: [['u_modgud_lantern', 1]], rep: { dead: 1 } } });
quest('ganglati_nameless', { giver: 'ganglati', name: 'The Nameless Jarl', area: 'Helheim', req: helReq(80),
  summary: 'A draugr king who forgot his name on the bridge rages on the north-east plain. Ganglati would like him to stop.',
  offer: ['There is… a jarl. North-east… past the river. He told Móðguðr his name… ten thousand years ago. She forgot it. So did he.', 'He is… very angry about it. He frightens… the others. <i>A long pause.</i> Make him… stop.'],
  progress: 'The Nameless Jarl, on the north-east plain past Gjöll.',
  done: ['<i>Ganglati nods for a long time.</i> Quiet… now. Good. <i>He hands you something without looking at it.</i> Obols. From the others. They… are grateful.'],
  obj: [{ type: 'hunt', mob: 'nameless_jarl', map: 'helheim', x: 52.5, y: 18.5, place: 'the north-east plain' }],
  reward: { exp: 900000, jexp: 520000, zeny: 60000, items: [['hel_obol', 15]] } });
// Hel's bounty board in the camp: two a day from five
BOARDS.hel_board = { name: 'Bounty Board', title: 'Helheim', map: 'helheim', x: 27.5, y: 54.0, perDay: 2, pool: [] };
bounty('bb_hel_hounds', 'hel_board', 'Bounty: Hounds of Hel', { summary: 'The hounds circle the camp at night. Eir wants a quieter night.', obj: [{ type: 'kill', mob: 'hel_hound', n: 12 }] });
bounty('bb_lost_souls', 'hel_board', 'Bounty: Lost Souls', { summary: 'Lay the lost souls to rest. They do not fight back much. That is the sad part.', obj: [{ type: 'kill', mob: 'soul_wisp', n: 12 }] });
bounty('bb_brides', 'hel_board', 'Bounty: Corpse Brides', { summary: 'The brides have started proposing to the living. Decline, firmly.', obj: [{ type: 'kill', mob: 'corpse_bride', n: 10 }] });
bounty('bb_colossi', 'hel_board', 'Bounty: Bone Colossi', { summary: 'A colossus walked through the camp palisade twice this week. Once was an accident.', obj: [{ type: 'kill', mob: 'bone_colossus', n: 6 }] });
bounty('bb_rot_scales', 'hel_board', 'Bounty: Rot-Wyrm Scales', { summary: 'Gauti is buying Níðhöggr’s brood by the scale. Do not ask what for.', obj: [{ type: 'collect', item: 'rot_scale', n: 6 }] });
// Every Helheim bounty also pays in the dead's own coin.
for (const id of BOARDS.hel_board.pool) { const r = QUESTS[id].reward; r.items = (r.items || []).concat([['hel_obol', 4]]); }

/* ---------- Titles and achievements (round 7) ---------- */
Object.assign(TITLES, { hels_guest: 'Guest of Eljudnir', hound_breaker: 'Hound-Breaker', dragonsbane: 'Níðhöggr’s Bane', deep_walker: 'Deep-Walker', root_diver: 'Root-Diver', hel_champion: 'Champion of Eljudnir' });
ACHIEVEMENTS.push(
  ach('Helheim', 'helheim', 'Hel’s Law', 'Walk into Helheim alive.', () => !!P.flags.seen.helheim),
  ach('Helheim', 'garmr', 'Hound-Breaker', 'Defeat Garmr before Eljudnir.', () => !!P.flags.bosses.garmr, null, 'hound_breaker'),
  ach('Helheim', 'nidhogg', 'Malice Struck', 'Slay Níðhöggr at the root.', () => !!P.flags.bosses.nidhogg, null, 'dragonsbane'),
  ach('Helheim', 'deep_5', 'Down the Stair', 'Reach floor 5 of the Deep Roots.', ...cnt(5, () => (P.flags.deep && P.flags.deep.best) || 0)),
  ach('Helheim', 'deep_10', 'Deep-Walker', 'Reach floor 10 of the Deep Roots.', ...cnt(10, () => (P.flags.deep && P.flags.deep.best) || 0), 'deep_walker'),
  ach('Helheim', 'deep_20', 'Root-Diver', 'Reach floor 20 of the Deep Roots.', ...cnt(20, () => (P.flags.deep && P.flags.deep.best) || 0), 'root_diver'),
  ach('Helheim', 'gauntlet', 'Champion of Eljudnir', 'Win the Gauntlet in Hel’s hall.', () => !!(P.flags.rush && P.flags.rush.clears), null, 'hel_champion'),
  ach('Helheim', 'gauntlet_fast', 'The Benches Fall Silent', 'Win the Gauntlet in under 8 minutes.', () => !!(P.flags.rush && P.flags.rush.best && P.flags.rush.best < 480)),
  ach('Story', 'act3', 'What Hel Owes', 'Finish Act III: The Roots of Hel.', () => !!P.quests.done.act3_6),
  ach('Other', 'lv99', 'Deep-Rooted', 'Reach Base Level 99 in your second life.', ...cnt(99, () => P.lvl)),
);

/* Round 5: js/data/recipes.js (crafting, vendors, services) loads right after this file. index.html does not list it
   yet (not ours to edit); while it does not, this parser-time document.write inserts it before js/core.js runs. */
if (typeof RECIPES === 'undefined' && typeof document !== 'undefined' && document.readyState === 'loading' && !document.querySelector('script[src$="js/data/recipes.js"]')) document.write('<script src="js/data/recipes.js"><\/script>');
