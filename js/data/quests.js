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
quest('vidar_fenrir', { giver: 'vidar', turnIn: 'vidar', name: 'The Silent God’s Duty', area: 'Bifrost Ruins', req: { lvl: 50, quests: ['main_9'] },
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

/* ---------- Daily bounty boards ---------- */
// A board offers `perDay` quests from its pool, picked by the local date. Each can be done once a day.
const BOARDS = {
  emberhold_board: { name: 'Bounty Board', title: 'Ashen Fields', map: 'emberhold', x: 13.5, y: 18.5, perDay: 2, pool: [] },
  wood_board: { name: 'Bounty Board', title: 'Withered Wood', map: 'withered_wood', x: 9.5, y: 33.5, perDay: 2, pool: [] },
  keep_board: { name: 'Bounty Board', title: 'Gloamheim', map: 'gloamheim', x: 32.5, y: 52.5, perDay: 2, pool: [] },
  deep_board: { name: 'Bounty Board', title: 'Nidavellir Deep', map: 'nidavellir', x: 9.5, y: 30.5, perDay: 2, pool: [] },
  bifrost_board: { name: 'Bounty Board', title: 'Bifrost Ruins', map: 'bifrost', x: 7.5, y: 49.5, perDay: 2, pool: [] },
};
function bounty(id, board, name, o) {
  // Collect bounties are priced from the ordinary monsters that drop the item (an MVP's guaranteed drop would inflate them).
  const ob = o.obj[0], mobsOf = ob.type === 'kill' ? [].concat(ob.mob) : Object.keys(MOBS).filter(k => !MOBS[k].boss && (MOBS[k].drops || []).some(d => d[0] === ob.item));
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
