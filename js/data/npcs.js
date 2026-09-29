'use strict';
/* =========================================================
   Data: NPCs, dialog scripts, lore
   Loaded before js/core.js. genMap() places every NPC whose `map` matches.
   NPC fields (see docs/CONTENT.md):
     map, x, y, dir        where it stands (dir 1 faces right, -1 left)
     name, title, dname    dname = name shown in the dialog box
     look                  colours for the procedural fallback sprite;
                           the real sprite is sheet npc_<id> (art/CONTRACT.md)
     talk(n)               async dialog script (uses say()/dialog() from js/ui.js)
     greet                 line shown above the quest menu when it has quests
     talkLabel             label of the "just talk" option in that menu
     urgent()              true when a story beat must play instead of the quest menu
     show()                (round 4) the NPC is only on its map while this is true (npcSync in core.js)
     at()                  (round 4) [x, y] | null: where it stands right now (escort givers move after the escort)
     nameFn / dnameFn      (round 4) a name that changes with the story (Vidar -> Odin)
     escortLine            what an escorted NPC says when you talk to it on the way
   Quests are attached from js/data/quests.js (giver / turnIn = NPC id), so an NPC
   needs no code to offer quests.
   ========================================================= */
const NPCS = {
  sigrun: { map: 'emberhold', name: 'Sigrun', title: 'Ember Maiden', x: 20.5, y: 17.3, dir: -1,
    look: { body: '#3a3440', trim: '#c9a860', legs: '#2a2630', skin: '#e6d5c3', hair: '#e8e2d6', robe: true, wings: true, weapon: 'none' },
    dname: 'Sigrun, the Ember Maiden', talk: () => talkSigrun(), greet: 'The Waystone is warm tonight. What do you need, Unkindled?', talkLabel: 'Talk',
    urgent: () => !P.flags.talked.sigrun || (shardCount() === 3 && !P.flags.gate) },
  brokkr: { map: 'emberhold', name: 'Brokkr', title: 'Smith', x: 12.5, y: 13.5, dir: 1,
    look: { body: '#5a3a24', trim: '#2a1a12', legs: '#2a1e16', skin: '#d9a57c', hair: '#a8452a', beard: true, weapon: 'mace', wcol: '#777', scale: 0.92, wide: true },
    dname: 'Brokkr the Smith', talk: () => talkBrokkr(), greet: 'Hah. Buying, selling, or bringing me something?', talkLabel: 'Trade',
    urgent: () => !P.flags.talked.brokkr },
  vidar: { map: 'emberhold', name: 'Vidar', title: 'Wanderer', x: 24.5, y: 12.5, dir: -1,
    look: { body: '#2b2c33', trim: '#5a4a3a', legs: '#1e1f24', skin: '#cdb9a0', head: 'hood', robe: true, weapon: 'staffv', wcol: '#6b5033' },
    get dname() { return typeof P !== 'undefined' && P && P.flags.odin ? 'Odin, the Wanderer' : 'Vidar the Wanderer'; },
    nameFn: () => P && P.flags.odin ? 'Odin' : 'Vidar', titleFn: () => P && P.flags.odin ? 'All-Father' : 'Wanderer',
    talk: () => talkVidar(), get greet() { return typeof P !== 'undefined' && P && P.flags.odin ? '<i>Odin pulls his hood back up out of habit, then lets it fall.</i> Well?' : '<i>The old man’s one eye finds you before you speak.</i> Well?'; }, talkLabel: 'Talk',
    urgent: () => P.cls === 'novice' && P.jlvl >= 10 && P.skills.basic >= 9 },
  astrid: { map: 'emberhold', name: 'Astrid', title: 'Orphan', x: 12.5, y: 23.5, dir: 1,
    look: { body: '#6d5a4a', trim: '#4a3a2a', legs: '#3a2e26', skin: '#efd9c4', hair: '#d8c38a', weapon: 'none', scale: 0.7 },
    dname: 'Astrid', talk: () => talkAstrid(), greet: 'Oh! It’s you. Did you come to play?', talkLabel: 'Chat',
    urgent: () => !P.flags.talked.astrid },
  // ---- Content round 3: the outer realms. No sprite sheets yet (npc_<id>): the procedural look below is used. ----
  ragna: { map: 'rimeshore', name: 'Ragna', title: 'Shieldmaiden', x: 10.5, y: 36.5, dir: -1,
    look: { body: '#6a7a8a', trim: '#c8b890', legs: '#3a4250', skin: '#f0dcc8', hair: '#e8d8a0', head: 'helm', shield: true, weapon: 'sword', wcol: '#c8ccd6', cape: '#8a2a2a' },
    dname: 'Ragna the Shieldmaiden', talk: () => talkRagna(), greet: 'Keep your back to the fire and your eyes on the ice.', talkLabel: 'Talk',
    urgent: () => !P.flags.talked.ragna },
  hrafn: { map: 'rimeshore', name: 'Hrafn', title: 'Net-Mender', x: 5.5, y: 31.5, dir: 1,
    look: { body: '#5a5048', trim: '#8a7a5a', legs: '#3a342e', skin: '#d8b89a', hair: '#9a9a9a', beard: true, head: 'hood', weapon: 'none', scale: 0.95 },
    dname: 'Old Hrafn', talk: () => talkHrafn(), greet: 'Mind the nets. Mind the dead in them, too.', talkLabel: 'Talk' },
  eira: { map: 'mirewell', name: 'Eira', title: 'Herb-Witch', x: 34.5, y: 9.5, dir: 1,
    look: { body: '#4a6a4a', trim: '#c8a860', legs: '#2e3a2a', skin: '#e8d0b8', hair: '#6a3a2a', robe: true, weapon: 'staffv', wcol: '#8a6a3a' },
    dname: 'Eira the Herb-Witch', talk: () => talkEira(), greet: 'Mind the mud, and mind the lights. Neither of them loves you.', talkLabel: 'Talk',
    urgent: () => !P.flags.talked.eira },
  bolli: { map: 'mirewell', name: 'Bolli', title: 'Boatman', x: 33.5, y: 25.5, dir: -1,
    look: { body: '#6a5a3a', trim: '#3a2e1e', legs: '#3a3024', skin: '#c89a78', hair: '#3a2a1a', beard: true, weapon: 'fork', wcol: '#6b4a2a', wide: true },
    dname: 'Bolli the Boatman', talk: () => talkBolli(), greet: 'No boat, no river, still a boatman. What d’you need?', talkLabel: 'Talk' },
  sindri: { map: 'nidavellir', name: 'Sindri', title: 'Master Smith', x: 26.5, y: 26.5, dir: 1,
    look: { body: '#6a3a24', trim: '#c8a040', legs: '#2a1e16', skin: '#d9a57c', hair: '#d8d0c0', beard: true, weapon: 'mace', wcol: '#8a8a8a', scale: 0.9, wide: true },
    dname: 'Sindri the Master Smith', talk: () => talkSindri(), greet: 'Hmph. Brokkr sent you. He always sends the loud ones.', talkLabel: 'Trade',
    urgent: () => !P.flags.talked.sindri },
  nyr: { map: 'nidavellir', name: 'Nýr', title: 'Ghost Foreman', x: 50.5, y: 33.5, dir: -1,
    look: { body: '#6a9a92', trim: '#c8b060', legs: '#4a6a64', skin: '#b8e0d8', hair: '#e8f0f0', beard: true, head: 'helm', weapon: 'fork', wcol: '#8aa0a0', scale: 0.88, wide: true },
    dname: 'Nýr, the Ghost Foreman', talk: () => talkNyr(), greet: '<i>The old dwarf flickers like a candle.</i> Shift’s not over. Shift’s never over.', talkLabel: 'Talk' },
  heimdall: { map: 'bifrost', name: 'Heimdall', title: 'the Watchman', x: 13.5, y: 50.5, dir: -1,
    look: { body: '#d8c070', trim: '#fff0c0', legs: '#8a6a3a', skin: '#f0e0c8', hair: '#f8f0d8', head: 'helm', weapon: 'sword', wcol: '#fff0b0', cape: '#3a5aa0', wings: true },
    dname: 'Heimdall the Watchman', talk: () => talkHeimdall(), greet: 'I can hear the grass grow in nine realms. I heard you coming for a long time.', talkLabel: 'Talk',
    urgent: () => !P.flags.talked.heimdall },
  // ---- Content round 4: Act II and side quests. No sprite sheets yet (npc_<id>); the procedural look is used. ----
  gunnar: { map: 'ashen_fields', name: 'Gunnar', title: 'Last Farmer', x: 39.5, y: 34.5, dir: -1,
    look: { body: '#7a6a4a', trim: '#5a4a2a', legs: '#4a3a2a', skin: '#d8b090', hair: '#c8c0b0', beard: true, weapon: 'fork', wcol: '#6b4a2a', scale: 0.95 },
    at: () => { const st = questStatus('gunnar_escort'); return st === 'active' ? null : st === 'ready' || st === 'done' ? [9.5, 31.5] : [39.5, 34.5]; },
    dname: 'Gunnar, the Last Farmer', talk: () => talkGunnar(), greet: 'You’re not dead. Or you are, and polite about it.', talkLabel: 'Talk',
    escortLine: 'I’m right behind you. Well. Behind-ish. My knees are sixty.' },
  einar: { map: 'gloamheim', name: 'Einar', title: 'Squire', x: 34.5, y: 50.5, dir: -1,
    look: { body: '#8ab0c8', trim: '#d8d0a0', legs: '#5a7a8a', skin: '#c8e0e8', hair: '#e0e8f0', weapon: 'none', scale: 0.85 },
    show: () => !(P.quests.done.squire_sword && P.quests.done.squire_sword.c === 0),
    dname: 'Einar, Squire of Sir Gaunt', talk: () => talkEinar(), greet: '<i>A translucent boy in a squire’s tabard polishes a helm that is not there.</i> Sir? Have you seen my lord?', talkLabel: 'Talk' },
  modgud: { map: 'gloamheim', name: 'Móðguðr', title: 'Gate-Maiden', x: 27.5, y: 4.5, dir: 1,
    look: { body: '#6a6e7a', trim: '#b8c8d8', legs: '#3a3e4a', skin: '#dce4ec', hair: '#e8ecf0', head: 'helm', robe: true, weapon: 'staffv', wcol: '#8aff9a' },
    show: () => !!P.flags.act2,
    dname: 'Móðguðr, the Gate-Maiden', talk: () => talkModgud(), greet: 'Name and business.', talkLabel: 'Talk' },
  kari: { map: 'rimeshore', name: 'Kari', title: 'Fisher-Boy', x: 6.5, y: 33.5, dir: 1,
    look: { body: '#5a6a7a', trim: '#c8a060', legs: '#3a4250', skin: '#f0d8c0', hair: '#c8a870', weapon: 'none', scale: 0.72 },
    show: () => { const st = questStatus('hrafn_kari'); return st === 'ready' || st === 'done'; },
    dname: 'Kari', talk: () => say('Kari', [pick(['Grandad says I’m not allowed past the wrecks now. Ever. Even when I’m forty.', 'I found a whole anchor out there! It was too heavy. I’ll get it next time. Don’t tell Grandad.', 'Ragna says you fought the Jarl. Was he big? Was he as big as a boat? He was, wasn’t he.'])]),
    escortLine: 'I can walk faster than this! I’m just not going to, because of the wolves.' },
  tofa: { map: 'nidavellir', name: 'Tófa', title: 'Lost Miner', x: 24.5, y: 28.5, dir: 1,
    look: { body: '#6a4a3a', trim: '#c8a040', legs: '#3a2a20', skin: '#e8c0a0', hair: '#c05a2a', weapon: 'fork', wcol: '#8a8a8a', scale: 0.7, wide: true },
    show: () => { const st = questStatus('tofa_escort'); return st === 'ready' || st === 'done'; },
    dname: 'Tófa', talk: () => say('Tófa', [pick(['Sindri says I have my grandmother’s nose for ore. He also says I have her talent for getting lost.', 'The shafts sing, you know. Down deep. Nýr says it’s the rock settling. It isn’t.', 'When I’m grown I’m going to forge a hammer so good that Brokkr and Sindri fight about it for four hundred years.'])]),
    escortLine: 'Stay close! The bats go for whoever is smallest, and that is me.' },
  // ---- Content round 5: Skaldhaven and the town services. No sprite sheets yet (npc_<id>); the procedural look is used. ----
  fulla: { map: 'skaldhaven', name: 'Fulla', title: 'Keeper of the Chest', x: 21.5, y: 9.0, dir: -1,
    look: { body: '#5a6a9a', trim: '#e0c070', legs: '#3a4260', skin: '#f0dcc8', hair: '#e8c070', robe: true, weapon: 'none', scale: 0.95 },
    dname: 'Fulla, Keeper of the Chest', talk: () => talkStorage('fulla'), greet: 'Frigg’s chest is deep, and I never lose a thing. Storing, or taking?', talkLabel: 'Storage' },
  gna: { map: 'emberhold', name: 'Gná', title: 'Storage Keeper', x: 23.5, y: 16.5, dir: -1,
    look: { body: '#6a5a8a', trim: '#e0c070', legs: '#3a3450', skin: '#f0dcc8', hair: '#3a2a20', robe: true, weapon: 'none', scale: 0.92 },
    dname: 'Gná, Fulla’s sister', talk: () => talkStorage('gna'), greet: 'My sister keeps the other end of the chest in Skaldhaven. Same chest. Do not ask how.', talkLabel: 'Storage' },
  grimr: { map: 'skaldhaven', name: 'Old Grímr', title: 'Card-Picker', x: 4.8, y: 24.6, dir: 1,
    look: { body: '#4a4a5a', trim: '#a88a5a', legs: '#2a2a34', skin: '#d8b89a', hair: '#c8c8c8', beard: true, head: 'hood', robe: true, weapon: 'staffv', wcol: '#6b5033', scale: 0.9 },
    dname: 'Old Grímr, the Card-Picker', talk: () => talkGrimr(), greet: 'Cards go in easy. Getting them out is a craft. Mine.', talkLabel: 'Remove a card' },
  thordis: { map: 'skaldhaven', name: 'Thordis', title: 'Seiðkona', x: 22.8, y: 25.8, dir: -1,
    look: { body: '#3a2a4a', trim: '#b88aff', legs: '#241a30', skin: '#e8d8d0', hair: '#1a1418', robe: true, head: 'hood', weapon: 'staffv', wcol: '#8a6aff' },
    dname: 'Thordis the Seiðkona', talk: () => talkThordis(), greet: 'Sit. Hold out the thing you want changed. Not your hand. The thing.', talkLabel: 'Enchant' },
  ulfar: { map: 'skaldhaven', name: 'Úlfar', title: 'Chandler', x: 20.0, y: 22.6, dir: 1,
    look: { body: '#7a5a3a', trim: '#c8a060', legs: '#3a2e22', skin: '#e0b898', hair: '#8a4a2a', beard: true, weapon: 'none', wide: true },
    dname: 'Úlfar the Chandler', talk: () => talkUlfar(), greet: 'Rope, pitch, potions, stew. Everything a sailor needs and a few things he shouldn’t.', talkLabel: 'Trade' },
  hallgerd: { map: 'skaldhaven', name: 'Hallgerð', title: 'Alewife', x: 7.0, y: 8.9, dir: 1,
    look: { body: '#8a3a2a', trim: '#e8d0a0', legs: '#4a2a20', skin: '#f0d0b8', hair: '#c05a2a', weapon: 'none' },
    dname: 'Hallgerð of the Salt Hall', talk: () => talkHallgerd(), greet: 'Welcome to the Salt Hall. Boots off the benches.', talkLabel: 'Talk' },
  ketill: { map: 'skaldhaven', name: 'Ketill', title: 'Loose-Tongue', x: 11.8, y: 10.2, dir: -1,
    look: { body: '#5a6a4a', trim: '#8a7a4a', legs: '#3a3a2a', skin: '#e0c0a0', hair: '#d8b060', weapon: 'lute', wcol: '#8a5a2a', scale: 0.95 },
    dname: 'Ketill Loose-Tongue', talk: () => talkKetill(), greet: 'A skald hears everything. A thirsty skald tells it.', talkLabel: 'Rumours' },
  orm: { map: 'skaldhaven', name: 'Ormr', title: 'Ship Captain', x: 31.5, y: 20.0, dir: -1,
    look: { body: '#3a4a5a', trim: '#c8a040', legs: '#2a3040', skin: '#d8a880', hair: '#2a2a2a', beard: true, head: 'helm', cape: '#2a4a6a', weapon: 'sword', wcol: '#aab0ba', wide: true },
    dname: 'Captain Ormr of the Sea-Snake', talk: () => talkOrm(), greet: 'The Sea-Snake sails when I say, where you pay. Ice permitting.', talkLabel: 'Sail' },
  hel: { map: null, name: 'Hel', title: 'Queen of the Dead', x: 0, y: 0,
    look: { body: '#2a2a34', trim: '#8aff9a', legs: '#1a1a22', skin: '#e8e0e8', hair: '#101014', robe: true, weapon: 'none', scale: 1.15 },
    dname: 'Hel, Queen of the Dead' },
};
// Objects with a dialog of their own (map.objs kinds); useObj() in core.js calls these.
const OBJ_TALK = { heart: () => talkHeart() };

const LORE = {
  ash: ['The Ash', 'Before the end there were nine realms on the branches of Yggdrasil. Then Surtr’s herald climbed up out of Muspelheim, crowned himself the Ashen King, and set the roots on fire. The gods did not answer. The dead stopped staying dead, because Hel’s gate burned too.'],
  sigrun: ['Sigrun', 'She was a Valkyrie. When the Tree burned there were no more halls to carry the fallen to, so she stayed in Midgard and lit the Waystones instead. She says the Tree refuses some of the dead. You are one of them.'],
  blight_mother: ['The Blight Mother', 'She was a Poring once, the pink and harmless kind children chased through the fields of Prontera. She swallowed the Shard of Blood thinking it was a sweet. It made her a mother of thousands, and none of her children have souls.'],
  hati: ['Hati', 'The wolf who chased the moon for ten thousand years. When the sky burned he finally caught it and swallowed it, and the Shard of the Moon with it. He was only ever trying to finish the one thing he was made for.'],
  sir_gaunt: ['Sir Gaunt', 'He swore to Tyr that he would hold Gloamheim until the end of the world. The world ended. He is still holding it, against everyone, forever. The Shard of the Oath was the only thing keeping his armor together.'],
  vidar: ['Vidar', 'The old wanderer has one eye and a great deal of advice. He asks you not to tell Sigrun who he really is. She knows. She has always known.'],
  ashen_king: ['The Ashen King', 'He was a fire giant’s herald, sent ahead to prepare the world for burning. With his master gone quiet he crowned himself instead. In the end he only wanted what everyone in Midgard wants: for the fire to mean something.'],
  // Unlocked by side quests (js/data/quests.js: reward.lore)
  mimir: ['Mímir’s Well', 'Under the roots of the Tree there was a well, and whoever drank from it knew how things would end. An old man drank from it once and paid with an eye. The well boiled dry when the roots burned. Vidar says the Ash still remembers what the water knew.'],
  fenrir: ['The Wolf’s Kin', 'Hati and his brother Sköll were Fenrir’s sons, and Fenrir was always going to eat the sun. Vidar was always going to kill him for it. Nobody ever asked the wolves whether they wanted the ending they were given.'],
  tyr: ['The Oath of Tyr', 'Tyr put his hand in the wolf’s mouth as a promise, and when the promise was broken he let the wolf keep it. Sir Gaunt swore by that hand. Vidar’s letter to Sigrun said only: “Some oaths are kept by breaking them. Forgive him, and me.”'],
  // Round 3: the outer realms (MVPs unlock their entry when they fall; the rest come from quests)
  drowned_jarl: ['The Drowned Jarl', 'A sea-king who took his whole crew into the ice rather than let the storm have them. He prayed to Ægir for a calm sea. Ægir had already drowned in the Ash. The Jarl kept rowing anyway.'],
  bog_crone: ['The Bog Crone', 'Before the fire she was the kind of witch you visited for a fever or a broken heart. When the Tree burned, the sick stopped coming and the hungry came instead. She fed them. Eventually she fed on them.'],
  fafnir: ['Fafnir', 'A dwarf who killed his own father for a cursed ring and became a dragon to guard what he had stolen. Sigurd killed him once. The Ash does not care who was killed once.'],
  fenrir_slain: ['Fenrir', 'The wolf the gods raised, feared, and bound with a ribbon made of impossible things. He was always going to break free at the end of the world. Vidar was always going to kill him. You did it instead, and the ending the Norns wrote is finally, properly, wrong.'],
  rimeshore: ['Rimeshore', 'The sea froze the night the Tree burned, with every longship still on it. Ragna’s people walk the ice now and fish for anything that is not already dead.'],
  mirewell: ['Mirewell', 'A healer’s marsh once, where Eira’s grandmother grew the herbs that sealed Valhalla’s wounds. The Crone’s cauldron turned the wells black.'],
  nidavellir: ['Nidavellir', 'The dark fields of the dwarves, where Gungnir, Mjölnir and Gleipnir were forged. Sindri stayed when the forges went cold. Brokkr went up to the surface. They have not spoken since.'],
  bifrost: ['The Bifrost', 'The burning bridge between Midgard and Asgard. It was meant to break at Ragnarök under the sons of Muspel. It broke under the Ashen King instead, and Heimdall stayed at his post on the pieces.'],
  skaldhaven: ['Skaldhaven', 'A whaling port before the sea froze, and the last harbour on the coast. The Salt Hall still keeps a fire in every window, and the Sea-Snake still sails the channels the draugr have not frozen shut.'],
  astrid: ['Astrid', 'Her mother was a weaver in Prontera-under-the-Tree. Astrid walked to Emberhold alone, carrying a stitched Poring she named Pip, and waited by the Waystone for someone to come back. Someone did. It was you.'],
};
function shardCount() { return Object.keys(P.flags.shards).length; }
async function talkSigrun() {
  const f = P.flags; const N = 'Sigrun, the Ember Maiden';
  if (!f.talked.sigrun) {
    await say(N, [
      'You are breathing. Good. The Tree spat you back out, same as the rest of us.',
      'I am Sigrun. I carried the fallen to Valhalla once. Now there is no Valhalla, so I tend the last Waystone in Midgard and count the ones who come back wrong.',
      'When the Ashen King burned the roots of Yggdrasil, the Rune of Binding that held the realms together shattered. Three shards fell. Three creatures swallowed them, and the Ash made them into something worse.',
      '<i>She points east, then further east, then north.</i> The Blight Mother, deep in the Ashen Fields. Hati the Moon-Eater, in the Withered Wood beyond. And Sir Gaunt, who swore an oath to Tyr and broke it, in Gloamheim Keep.',
      'Bring me all three shards and I can open the Cinder Gate behind me. The King waits past it, on a throne of burned roots.',
      'You are a Novice. The Ash will eat you. Hunt the small things in the fields first. When you have learned enough, speak to old Vidar by the broken houses. He knows the four paths.',
    ]);
    f.talked.sigrun = true; f.lore.sigrun = true; UI.dirty = true; return;
  }
  if (shardCount() === 3 && !f.gate) {
    await say(N, ['<i>The three shards rise out of your pack on their own and hang in the air between you, turning.</i>', 'Blood, Moon and Oath. I did not think anyone would do it. I stopped hoping a long time ago, and it turns out hope does not care whether you stop.', '<i>She presses the shards together. The Rune of Binding does not heal, but it remembers what it was. Behind her, the Cinder Gate groans open.</i>', 'The King is waiting. Rest first. Whatever you decide up there, decide it as yourself.']);
    f.gate = true; banner('The Cinder Gate Opens', 'North of the Waystone', 'band gold long'); Sfx.victory(); UI.dirty = true; saveGame(); return;
  }
  if (f.ending) { await say(N, [f.ending === 'embers' ? 'There is a new Waystone at the top of the world now. It has your name on it. I tend it every morning.' : 'You wear the crown well. I let the fire here go out. I hope you understand.']); return; }
  const lines = { 0: 'The Blight Mother lies east, where the fields turn to bog. Her children are weak. She is not.', 1: 'One shard. It beats like a heart, doesn’t it? Hati hunts the Withered Wood, east of the fields. Take potions. He is fast.', 2: 'Two. Sir Gaunt holds Gloamheim, north through the Wood. He was the best of us. Heal magic burns him, if you have any.', 3: 'The gate is open. If the King is too much for you yet, there is more Ash to grow strong in: the east road through the Wood runs down to Rimeshore, and the bog trail south of the fields to Mirewell. Under Gloamheim the dwarf-halls go deeper still.' };
  const r = await dialog(N, lines[shardCount()] + (f.kingSlain ? '<br><br>The King is dead? Then go to the Heart. The choice is yours, not mine.' + (f.bosses.fenrir ? '' : ' And past it, the Bifrost is waking. Something at the other end is howling.') : ''), ['Tend my wounds', 'Farewell']);
  $('dialog').hidden = true;
  if (r === 0) { P.hp = S.maxhp; P.sp = S.maxsp; pillar(P, '#ffb060'); Sfx.heal(); log('Sigrun’s hands are warm. Your wounds close.', 'npc'); }
}
async function talkBrokkr() {
  const N = 'Brokkr the Smith';
  if (!P.flags.talked.brokkr) { P.flags.talked.brokkr = true; await say(N, ['Another one back from the dead? Hah. You’ll need steel, then. The dead always need steel.', 'I buy anything the Ash leaves lying around. I sell what I can forge. And for a price I’ll <i>refine</i> your gear. Up to +4 the metal takes it. Past that it starts to think for itself.']); }
  UI.shopMode = 'buy'; UI.shopBy = 'brokkr'; openWin('shop'); renderWin('shop');
}
async function talkVidar() {
  const N = NPCS.vidar.dname;
  if (P.flags.odin) { await say(N, [pick(['I told Sigrun everything. She made me tea. I do not know what I expected.', 'Mímir used to say the price of wisdom is always an eye. He never mentioned the son. I think he was being kind.', P.flags.fenrirFate === 'bound' ? 'The wolf sleeps on his island. I went to look at him. He opened one eye at me. I think we are even now.' : P.flags.fenrirFate === 'freed' ? 'There is a new sun. She is very young. She does not know who I am, and I have decided not to tell her.' : 'Hel is sewing. Heimdall is listening. And I am sitting by a fire, being honest. It is harder than it looks.'])]); return; }
  if (P.cls === 'novice') {
    if (P.jlvl < 10 || P.skills.basic < 9) { await say(N, ['<i>An old man in a grey hood. One eye catches the firelight. The other is not there.</i>', 'A Novice. You do not know which end of the sword to hold. Come back when you do.', `Reach Job Level 10 and learn Basic Skill to level 9. <i>(Job Lv ${P.jlvl}/10, Basic Skill ${P.skills.basic}/9.)</i>`]); return; }
    const paths = nextClasses('novice');
    const r = await dialog(N, 'So. You have learned the basics. There are four paths left in Midgard. Choose one and walk it until it kills you or you finish it.', [...paths.map(c => CLASSES[c].name), 'Not yet']);
    if (r < 0 || r >= paths.length) { $('dialog').hidden = true; return; }
    const cls = paths[r];
    const r2 = await dialog(N, `<b>${CLASSES[cls].name}.</b> ${CLASSES[cls].blurb}<br><br>This cannot be undone.`, [`Become a ${CLASSES[cls].name}`, 'Let me think']);
    $('dialog').hidden = true;
    if (r2 !== 0) return;
    jobChange(cls); return;
  }
  // First classes: the second paths are trials (js/data/quests.js, trial_<cls>); the quest menu offers them.
  const C = CLASSES[P.cls], second = nextClasses(P.cls);
  if (C.tier === 1 && second.length) {
    const ready = P.jlvl >= 40 && P.lvl >= 30, active = Object.keys(P.quests.active).find(id => QUESTS[id].trial);
    const paths = second.map(c => `<b>${CLASSES[c].name}</b>: ${CLASSES[c].blurb}`).join('<br><br>');
    if (!ready) { await say(N, [`${/^[AEIOU]/.test(C.name) ? 'An' : 'A'} ${C.name}. Good. There are two roads further on from here, and both are harder.<br><br>${paths}`, `Come back when your ${C.name.toLowerCase()}’s craft is complete (Job Lv 40) and you have lived long enough in the Ash (Base Lv 30). <i>(Job Lv ${P.jlvl}/40, Base Lv ${P.lvl}/30.)</i> Then I will set you a trial.`]); return; }
    if (active) { await say(N, [`You are walking the trial of the ${CLASSES[QUESTS[active].trial].name}. Finish it, or abandon it in your Journal if you chose wrong. There is no shame in choosing twice. There is some in choosing never.`]); return; }
    await say(N, [`<i>He looks you over.</i> You are ready. Two roads.<br><br>${paths}`, 'Choose one and ask me for its trial. <i>(Pick a “Trial of …” from Vidar’s menu.)</i>']); return;
  }
  if (shardCount() >= 2 && !P.flags.lore.vidar) {
    P.flags.lore.vidar = true;
    await say(N, ['<i>He watches the fire a long time before he speaks.</i>', 'I gave an eye once, at a well, for wisdom. I learned how the world would end. I did not learn how to stop it. That is the trouble with wisdom.', 'Don’t tell Sigrun who I am. She would be kind about it, and I could not bear that.']);
    return;
  }
  await say(N, [pick(['The Ash remembers every name it burned. Try not to give it yours.', 'Every Shardbearer was something good once. Remember that, and then kill them anyway.', 'STR for the arm, VIT for the heart, DEX for the eye. The rest is luck, and LUK.', 'When the ground glows red under a great beast, move. That is all the wisdom I have left.'])]);
}
async function talkRagna() {
  const N = 'Ragna the Shieldmaiden';
  if (!P.flags.talked.ragna) { P.flags.talked.ragna = true; P.flags.lore.rimeshore = true; await say(N, ['A living one? Up the wood road? <i>She lowers her shield an inch.</i> Then you came the long way round the dead. Welcome to Rimeshore.', 'The sea froze with our ships still on it. My father’s ship is out there in the sea-cave to the north, with my father at the prow. He does not answer to his name anymore.', 'We call him the Drowned Jarl. If you are here to hunt, I have work. If you are here to die, do it away from the fire.']); return; }
  const r = await dialog(N, P.flags.bosses.drowned_jarl ? 'The ice sounds different now. Softer. Thank you for that.' : 'The Jarl’s cave is north along the beach, past the sea-ice. Do not go in with an empty belt.', ['Tell me about Rimeshore', 'Farewell']); $('dialog').hidden = true;
  if (r === 0) await say(N, ['Snow wolves on the dunes, shell knights on the lagoon ice, and the draugr who fish the cracks with harpoons. Ice wraiths come out of the fog at dusk.', 'The trail south past the barrows goes to Mirewell. My sister Eira lives there, among the bog lights. Tell her I am still stubborn.']);
}
async function talkHrafn() {
  const N = 'Old Hrafn';
  await say(N, [pick(['Draugr fish with nets of their own hair. Bring me a few, and I’ll mend ours with them. Dead hair is strong hair.', 'I sailed with the Jarl, once. Got off the ship a day before it froze. Some days I think I was the lucky one.', 'Shell knights wear helmets they took off drowned men. Hit the soft bits underneath.'])]);
}
async function talkEira() {
  const N = 'Eira the Herb-Witch';
  if (!P.flags.talked.eira) { P.flags.talked.eira = true; P.flags.lore.mirewell = true; await say(N, ['A visitor who is not trying to eat me. How novel. <i>She wipes black mud from her hands.</i>', 'This was a healer’s marsh. My grandmother grew the herbs that sealed wounds in Valhalla. Now the wells are black, and the thing in the cauldron to the south calls herself the Bog Crone.', 'She was a healer too, once. That is the worst part.']); return; }
  const r = await dialog(N, P.flags.bosses.bog_crone ? 'The frogs are singing. I had forgotten they could.' : 'Stay on the boardwalks. The mud holds on to your feet, and the lights lead you into the water.', ['Tell me about the mire', 'Farewell']); $('dialog').hidden = true;
  if (r === 0) await say(N, ['Toads the size of calves, leeches that drink from the dark, will-o’-wisps that burn cold, and hags who learned their craft from the Crone. The trolls under the boardwalks just want to be left alone. They will not be.', 'East past the crossing there is an old dwarf mine. It goes deep. Something down there hammers all night.']);
}
async function talkBolli() {
  const N = 'Bolli the Boatman';
  // Round 5: once his boat is rebuilt (A Boat for the Boatman), Bolli ferries you up the coast to Skaldhaven.
  if (P.quests.done.bolli_boat) {
    const f = SHIP_ROUTES.skaldhaven.fare, r = await dialog(N, 'She floats! Mostly. I run her up the coast to Skaldhaven when the ice lets me. Want a ride?', [`Ferry to Skaldhaven (${fmt(f)}z)`, 'Talk', 'Farewell']); $('dialog').hidden = true;
    if (r === 0) { sail('skaldhaven', 'Bolli'); return; } if (r !== 1) return;
  }
  await say(N, [pick(['I had a boat. The Crone boiled it. Don’t ask how you boil a boat.', 'Mud slows you down, planks don’t. Stay on the planks. You’d be amazed how many people don’t.', 'The trolls under the bridges were ferrymen before the fire. I knew a couple of them. They still like a fair toll.'])]);
}
async function talkSindri() {
  const N = 'Sindri the Master Smith';
  if (!P.flags.talked.sindri) { P.flags.talked.sindri = true; P.flags.lore.nidavellir = true; await say(N, ['<i>A dwarf with a beard like old snow sets down a hammer that is bigger than he is.</i> My brother still alive, is he? Still loud?', 'I am Sindri. I forged Draupnir and the golden boar, and I helped my brother with the hammer everyone remembers him for. I stayed down here when the fires went out. Someone has to keep the forge warm.', 'The halls are full of the dead and the hungry. And Fafnir sleeps on the old hoard at the bottom, where the lava still runs. Bring me what the Deep gives up and I will make you steel worth dying in.']); }
  UI.shopMode = 'buy'; UI.shopBy = 'sindri'; openWin('shop'); renderWin('shop');
}
async function talkNyr() {
  const N = 'Nýr, the Ghost Foreman';
  await say(N, [pick(['My lads are still working. Dead, mind. Still working. It’s the hours that kill you.', 'Golems were built to carry ore. Nobody told them the mine closed. Nobody told them to stop.', 'The crystal spiders came when the lava rose. Pretty things. Bite like a debt collector.'])]);
}
async function talkHeimdall() {
  const N = 'Heimdall the Watchman';
  if (!P.flags.talked.heimdall) { P.flags.talked.heimdall = true; P.flags.lore.bifrost = true; await say(N, ['<i>A golden figure stands at the edge of the broken bridge, looking at nothing, listening to everything.</i>', 'I was set to watch this bridge until Ragnarök. The end came and went, and nobody told the bridge. So I stayed.', 'Listen. Under the wind. That is Fenrir, gnawing the last of Gleipnir at the far end of the ruins. When it breaks, he will run down the bridge into Midgard and finish what the King started.', 'I cannot leave my post. You can.']); return; }
  const r = await dialog(N, P.flags.bosses.fenrir ? 'The ruins are quiet. I can hear Midgard breathing. Go home, Unkindled.' : 'The chains are thinner every hour. His island is in the north-east, past the Valkyries’ rest.', ['Tell me about the ruins', 'Farewell']); $('dialog').hidden = true;
  if (r === 0) await say(N, ['Rune sentinels still guard the halls, and they do not know the halls are gone. The Valkyries who fell here have forgotten they are dead. The harpies were always like that.', 'Fenrir’s pups run loose on the bridges. Mind the edges. There is a very long way down, and nothing at the bottom to stop you.']);
}
async function talkAstrid() {
  const N = 'Astrid';
  if (!P.flags.talked.astrid) { P.flags.talked.astrid = true; addItem(makeItem('butterfly_wing', { qty: 2 })); await say(N, ['Are you a ghost? Sigrun says the people who come back aren’t ghosts. They’re just… late.', 'Here. I found these. If you flap them they take you home to the fire. I don’t need them. I don’t go anywhere.', '<i>She gives you 2 Butterfly Wings.</i>']); return; }
  const lines = shardCount() >= 1 ? ['You smell like jelly. Did you fight the big pink one? She used to be nice, I think.', 'Is the wolf really eating the moon? Can you make him give it back?', 'If you kill the King, will the Tree grow back? Will my mum come back?'] : ['There used to be Porings in the fields. Pink ones. They bounced. Now they bite.', 'Sigrun cries when she thinks nobody is looking. I look anyway.'];
  await say(N, [pick(lines)]);
}
async function talkHeart() {
  const N = 'The Heart of Yggdrasil';
  if (!P.flags.kingSlain) { await say(N, ['<i>A knot of burned root as big as a house. Something inside it is not quite dead. The King stands between you and it.</i>']); return; }
  if (P.flags.ending) { await say(N, [P.flags.ending === 'embers' ? '<i>The Heart glows softly. Somewhere far below, a root has turned green.</i>' : '<i>The Heart is cold. It answers to you now.</i>']); return; }
  const r = await dialog(N, '<i>The Heart pulses once, very faintly, like something asking permission. The King’s crown lies in the ash at your feet, still warm.</i><br><br>You could give the Tree the ember that would not go out, the one inside you. Or you could pick up the crown.', ['Relight the Tree', 'Take the Crown of Cinders', 'Not yet']);
  $('dialog').hidden = true;
  if (r === 0) ending('embers'); else if (r === 1) ending('ash');
}

/* =========================================================
   Content round 4: Act II lore, dialog and scenes
   ========================================================= */
Object.assign(LORE, {
  helgrind: ['Helgrind', 'Hel’s gate. It stands wherever the dead lie deep enough, and under Gloamheim they lie very deep. Sir Gaunt swore to Tyr to hold it shut until the end of the world. He took the oath literally. It was the only way he knew how to take anything.'],
  modgud: ['Móðguðr', 'The maiden who keeps Gjallarbrú, the bridge to Hel, and asks every traveller their name and business. She has asked the dead for ten thousand years. You are the first who asked hers back.'],
  gjallarbru: ['Gjallarbrú', 'The bridge over the river Gjöll on the road down to Hel. The dwarves built their Deep Forge over it for the heat, and forged Gleipnir on it. Some things can only be made on the road to the dead.'],
  gleipnir: ['Gleipnir', 'The footfall of a cat, the beard of a woman, the roots of a mountain, the sinews of a bear, the breath of a fish and the spittle of a bird. None of them exist, which is why the ribbon cannot break. Two brothers made it the first time. Two brothers made it again, and did not argue once. Well. Twice.'],
  odin: ['Odin', 'The All-Father rode to the last battle knowing how it would end, because he had paid an eye to know. His son Vidar pushed him out of the wolf’s path and died in his place. Odin has worn his son’s name ever since, and done his son’s work, badly, because it was the only way he could stand to go on living.'],
  hel: ['Hel', 'Loki’s daughter, half living and half dead, queen of everyone who did not die gloriously. When the Tree burned, her gate burned open. She did not send the dead back to hurt Midgard. She sent them back because she could, and because nobody had ever let her have anything.'],
  garmr: ['Garmr', 'The hound chained before Helgrind, chest bloody from ten thousand years of baying. At the end of the world he was meant to break loose. He did, and then he stayed at the gate anyway. It was the only home he had.'],
  fenrir_bound: ['The Wolf Bound', 'You bound Fenrir with the reforged Gleipnir on the island where the gods bound him first. This time nobody lied to him and nobody lost a hand. He lay down on his own. The ribbon will never break. Neither, you suspect, will the wolf.'],
  fenrir_freed: ['The Wolf Freed', 'You cut Hel’s stitches and let Fenrir go. He ran up the sky and ate the dead sun, the one thing he was made for, and a new sun rose behind him. The Norns never wrote that ending. You did.'],
  naglfar: ['Naglfar', 'The ship of the dead, built from the untrimmed nails of drowned men. The draugr of Rimeshore have gathered for it since the sea froze. Every nail you burn is a plank it will never have.'],
  einar: ['Einar the Squire', 'Sir Gaunt’s squire died in the first siege of Gloamheim and never noticed. He polished a helm for a knight who had stopped being a man. He only wanted someone to tell him his lord had meant well. You did. It was even true.'],
  valkyries: ['The Fallen Valkyries', 'Hrist, Mist, Skögul and Göndul rode out on the last day to choose the slain and were chosen themselves. Their statues stand on the Bifrost. Sigrun asked you to read their names aloud there, because she cannot bear to.'],
  crone_garden: ['The Crone’s Garden', 'Before the Ash, the Bog Crone kept a physic garden, a jar of honey for sore throats, and a list of every child in Mirewell she had brought into the world. Eira found the list. It is very long.'],
  wood_cairns: ['The Hunters’ Cairns', 'The hunters of the Withered Wood buried their dead under stones and left a raven feather on each. The ravens were Odin’s. So, it turns out, were the hunters.'],
  sun_wolves: ['Sköll', 'Hati chased the moon and Sköll chased the sun, and their father was Fenrir. When the sky burned, both brothers caught what they were chasing. Neither of them knew what to do next.'],
  brothers: ['Two Hammers', 'Brokkr and Sindri did not speak for four hundred years over a hammer. They made up over a ribbon. Nobody in Nidavellir is allowed to mention either.'],
});
OBJ_TALK.helgate = () => say('Helgrind', [P.flags.gateShut ? '<i>The crack in the wall is a thin green thread. Móðguðr’s lantern burns in front of it. Nothing comes through.</i>' : P.flags.act2 ? '<i>A crack of green light runs from floor to ceiling behind where Gaunt’s throne stood. It breathes.</i>' : '<i>The stones behind the throne are cold enough to burn. Something breathes behind them, very slowly, very far down.</i>']);

async function talkGunnar() {
  const N = NPCS.gunnar.dname, st = questStatus('gunnar_escort');
  await say(N, [st === 'done' ? pick(['The Waystone’s warm. I sit here and pretend it’s a hearth. It works about half the time.', 'I planted a turnip by the stone. It came up grey. It came up, though.']) : 'I farmed these fields for forty years. Now they farm me. The husks in the rows used to be my scarecrows, did you know? I made them good. Too good.']);
}
async function talkEinar() {
  const N = NPCS.einar.dname;
  await say(N, [P.quests.done.squire_sword ? 'Brokkr has the blade now. It is good steel. My lord would have wanted it used, I think. He always hated waste.' : pick(['My lord went up to the hall a long time ago. He said to keep his helm polished. I have been polishing it. It is very shiny now.', 'Sir Gaunt was the best of them, before. Everyone says so. Everyone used to say so.', 'I am not dead. I would know. Wouldn’t I?'])]);
}
async function talkModgud() {
  const N = NPCS.modgud.dname;
  await say(N, [P.flags.gateShut ? 'The lantern is lit. I did not know it could be. I have been standing here ten thousand years holding a lantern I never lit.' : pick(['Name and business. No, I remember you. I ask anyway. It is the job.', 'The dead cross my bridge and I ask their names, and they tell me, and I forget. Every one. It is a mercy. For me, I mean.', 'Gaunt sat with his back to this gate for a thousand years. I brought him tea sometimes. He never drank it. He could not.'])]);
}

/* Scenes: async scripts started by quest `scene` objectives and STORY_TALK beats (js/data/quests.js), played by
   playScene (js/ui.js) with the camera on each speaker. Helpers: line(who, pages), ask(who, html, options),
   actor(id, x, y, o), cineFocus({x, y}). Branch on P.flags.ending ('embers' | 'ash'). */
const embersAge = () => P.flags.ending !== 'ash';
/* ---------- Content round 5: Skaldhaven services ---------- */
async function talkStorage(id) {
  const D = NPCS[id], k = 'storage_' + id;
  if (!P.flags.talked[k]) { P.flags.talked[k] = true; await say(D.dname, [id === 'fulla' ? 'I kept Frigg’s chest of treasures when there was still a Frigg. Now I keep yours. My sister Gná keeps the same chest in Emberhold: put a thing in here, take it out there.' : 'My sister Fulla keeps Frigg’s chest in Skaldhaven, on the coast. I keep the lid here. Anything you give me, she has too, and the other way round.', `${STORAGE_SLOTS} places in the chest. A few zeny each time you put in or take out, for the lamp oil. And if a quest reward ever finds your bag full, it comes to me instead: ask for your mail.`]); }
  UI.stTab = UI.stTab || 'all'; openWin('storage'); renderWin('storage');
}
async function talkGrimr() {
  const N = NPCS.grimr.dname;
  if (!P.flags.talked.grimr) { P.flags.talked.grimr = true; await say(N, ['<i>An old man with a bone needle behind each ear squints at your gear.</i> Cards. Everyone wants them in. Then they find a better card and want the old one out.', `I can do it. Most of the time both come out whole. Sometimes the card tears. Sometimes the metal does. Once in a while, both. I charge either way. (${CARD_REMOVAL.success}% / ${CARD_REMOVAL.cardBreaks}% / ${CARD_REMOVAL.itemBreaks}% / ${CARD_REMOVAL.bothBreak}%)`]); }
  UI.cardArm = null; openWin('cardsage'); renderWin('cardsage');
}
async function talkThordis() {
  const N = NPCS.thordis.dname;
  if (!P.flags.talked.thordis) { P.flags.talked.thordis = true; await say(N, ['Seiðr is asking, not telling. I ask your sword what else it could have been, and sometimes it answers something better.', 'Bring the price in zeny and in what the Ash leaves behind: ectoplasm and spores for small things, cinder and bone for middling ones, wisp-flame and amethyst, Aesir cores for the great ones. A rare stone from the right realm makes the metal answer more generously.']); }
  openWin('enchant'); renderWin('enchant');
}
async function talkUlfar() {
  if (!P.flags.talked.ulfar) { P.flags.talked.ulfar = true; await say(NPCS.ulfar.dname, ['Potions, stew, wings, rope. The good stuff comes in with the ships and goes out with the first buyer: when it is gone, it is gone until the next boat.']); }
  UI.shopBy = 'ulfar'; UI.shopMode = 'buy'; UI.shopTab = 'supplies'; openWin('shop'); renderWin('shop');
}
async function talkHallgerd() {
  const N = NPCS.hallgerd.dname, fee = INN_FEE(P.lvl), ale = ITEMS.skald_ale.price;
  if (!P.flags.talked.hallgerd) { P.flags.talked.hallgerd = true; P.flags.lore.skaldhaven = true; await say(N, ['The Salt Hall. Oldest roof on the coast, and it still keeps the snow out. Mostly.', 'The board by the door has the harbour’s bounties: the draugr keep climbing the piers. Ketill, the one with the lute, will sell you gossip for a cup of ale. Half of it is even true.']); }
  const r = await dialog(N, 'What’ll it be?', [`A Skaldhaven Ale (${fmt(ale)}z)`, `A room for the night (${fmt(fee)}z)`, 'Tell me about Skaldhaven', 'Farewell']); $('dialog').hidden = true;
  if (r === 0) { if (P.zeny < ale) { log(`You need ${fmt(ale)} zeny.`, 'warn'); return; } if (!bagRoom('skald_ale', 1)) { log('Your bag is full.', 'warn'); return; } P.zeny -= ale; addItem(makeItem('skald_ale')); Sfx.coin(); log('Hallgerð slides a foaming mug down the bar.', 'npc'); }
  else if (r === 1) innRest();
  else if (r === 2) await say(N, ['Skaldhaven was a whaling port before the sea froze. Now the ice is the road: the Sea-Snake still sails the channels the draugr have not frozen shut.', 'Fulla keeps the chest. Old Grímr pulls cards out of things. Thordis does seiðr, and do not stare at her. Úlfar sells what the boats bring. And Ormr will take you anywhere the ice allows, for a price.']);
}
// Ketill's rumours: the first one that fits your story and that you have not heard, else a random one that fits.
const RUMORS = [
  { id: 'craft', when: () => !P.skills.craftsmanship, text: 'Brokkr in Emberhold is looking for an apprentice. Any fool can learn to work a forge, he says, and he means it as an insult and an offer.' },
  { id: 'storage', when: () => !P.storage.length, text: 'Fulla’s chest is the same chest as her sister’s in Emberhold. Put your spare gear in one and it is in the other. Saves carrying.' },
  { id: 'jarl', when: () => P.lvl >= 32 && !P.flags.bosses.drowned_jarl, text: 'The Drowned Jarl’s cave is north along the Rimeshore beach, past the sea-ice. His tide rolls in straight lines: step sideways, not back.' },
  { id: 'bolli', when: () => !P.quests.done.bolli_boat && P.lvl >= 34, text: 'Bolli down in Mirewell lost his boat to the Crone. Help him build another and he’ll ferry you up here without the long walk.' },
  { id: 'rare', when: () => P.lvl >= 28, text: 'One beast in fifty on the frozen beach carries a Heart of Rime. The bog has pearls, the Deep has embers, the broken bridge has starglass. Smiths and seiðkonur pay dearly for them.' },
  { id: 'cards', when: () => nCardsOwned() > 0, text: 'Old Grímr can pull a card out of your gear so you can use it in something better. He will tell you it is safe. It mostly is.' },
  { id: 'enchant', when: () => P.lvl >= 15, text: 'Thordis can reroll the charms on any gear that is not one of a kind. Bring a rare stone from the right realm and the metal answers better.' },
  { id: 'crone', when: () => P.lvl >= 40 && !P.flags.bosses.bog_crone, text: 'The Bog Crone’s hexes stay on the ground after they land. Whatever you do, do not fight her standing in purple.' },
  { id: 'fafnir', when: () => P.lvl >= 46 && !P.flags.bosses.fafnir, text: 'Fafnir breathes in a cone. The dwarves say the safest place is beside his head, not in front of it.' },
  { id: 'stones', when: () => P.skills.craftsmanship >= 2, text: 'A whetstone rubbed into the metal before refining makes the hammer land truer. Sindri makes a ward-stone that stops the metal from shattering at all.' },
  { id: 'fenrir', when: () => !!P.flags.kingSlain && !P.flags.bosses.fenrir, text: 'Heimdall hears the wolf on the Bifrost gnawing at his chain. Everyone says it will break soon. Everyone has always said that.' },
  { id: 'weekly', when: () => !!P.flags.act2, text: 'Echoes of the old great beasts walk again, one a week. The Hunter’s Board in Emberhold posts where.' },
];
const nCardsOwned = () => P.inv.filter(i => ITEMS[i.id].type === 'card').length + SLOTS.reduce((a, s) => a + ((P.equip[s] && P.equip[s].cards) || []).length, 0);
function rumorFor() {
  const heard = P.flags.rumors = P.flags.rumors || {}, fit = RUMORS.filter(r => { try { return r.when(); } catch (e) { return false; } });
  // a quest you have not found yet counts as a rumour too
  const q = Object.keys(QUESTS).find(id => !QUESTS[id].auto && QUESTS[id].kind === 'side' && !QUESTS[id].trial && questStatus(id) === 'available' && NPCS[QUESTS[id].giver] && !heard['q_' + id]);
  const fresh = fit.filter(r => !heard[r.id]);
  if (fresh.length) { heard[fresh[0].id] = true; return fresh[0].text; }
  if (q) { heard['q_' + q] = true; const Q = QUESTS[q]; return `Heard ${NPCS[Q.giver].name} in ${Q.area || MAPDEFS[NPCS[Q.giver].map].name} could use a hand. Something about “${Q.name}”.`; }
  return fit.length ? pick(fit).text : 'Nothing new. The ice creaks, the draugr climb, the ale is warm. Come back when something has happened to someone.';
}
async function talkKetill() {
  const N = NPCS.ketill.dname;
  const r = await dialog(N, '<i>He strums one sour chord.</i> Buy a skald a drink and he’ll sing you something true.', [`Buy Ketill an ale (${RUMOR_FEE}z)`, 'Farewell']); $('dialog').hidden = true;
  if (r !== 0) return;
  if (P.zeny < RUMOR_FEE) { log(`You need ${RUMOR_FEE} zeny.`, 'warn'); return; }
  P.zeny -= RUMOR_FEE; Sfx.coin(); await say(N, [rumorFor()]);
}
async function talkOrm() {
  const N = NPCS.orm.dname, routes = ['rimeshore', 'mirewell'];
  if (!P.flags.talked.orm) { P.flags.talked.orm = true; await say(N, ['The Sea-Snake is the last longship on this coast that still floats. The rest froze with their crews aboard. I was ashore that night, drunk. Best night of my life.', 'I sail south to the Rimeshore beach, and down the coast and up the black river to Bolli’s landing in Mirewell. Pay up front; the ice does not give refunds.']); }
  const r = await dialog(N, 'Where to?', [...routes.map(k => `${SHIP_ROUTES[k].label} (${fmt(SHIP_ROUTES[k].fare)}z)`), 'Farewell']); $('dialog').hidden = true;
  if (r >= 0 && r < routes.length) sail(routes[r], 'Captain Ormr');
}
const SCENES = {
  // ---- Act II ----
  async a2_sigrun() {
    P.flags.act2 = 1;
    if (embersAge()) await line('sigrun', ['<i>Sigrun is kneeling at the new Waystone by the gate, the one with your name on it. She does not get up at once.</i>', 'The Tree is breathing. I can feel it through the stone, like a heartbeat under a blanket. You did that. You gave it the ember it refused.', 'And still the dead get up. Last night one of Gaunt’s soldiers walked to our gate and stood there until dawn, waiting to be let in. The King is dead. The Tree lives. The dead should rest. They do not.']);
    else await line('sigrun', ['<i>The Waystone behind Sigrun is cold. She has not relit it. She looks at the crown on your brow, then at your face, as if checking which of them is talking.</i>', 'Your Majesty. <i>It is not a compliment.</i> The Ash obeys you now. The fires stay where you put them. Every village from here to the sea has noticed.', 'But the dead have not. They still get up. They do not come to kneel. They walk north to Gloamheim, and they go in, and they do not come out.']);
    await line('sigrun', ['When the Tree burned, Hel’s gate burned with it. I always thought that was why the dead came back. But the King is gone, and they are coming back faster.', 'There is one who would know. Heimdall, on the broken Bifrost past the Heart. He can hear the grass grow in nine realms. Go and ask him what he hears now.']);
    await line('vidar', ['<i>By the broken houses, the old man with one eye has stopped pretending to sleep. He is watching you both.</i>'], 0.9);
  },
  async a2_heimdall() {
    await line('heimdall', ['<i>Heimdall does not turn around. He has heard you coming since you left Emberhold.</i> You want to know what I hear. Two things. Listen with me.', 'The first is a chain. Gleipnir, at the far end of the ruins, parting one strand at a time. When it goes, the wolf goes with it.', 'The second is a door. Very far down, under the keep you call Gloamheim. It has been shut since before the gods were old. Now it creaks. I know that sound. Helgrind. Hel’s gate.',
      embersAge() ? 'Your ember relit the Tree, and the Tree sends its roots down, the way trees do. Down is where Hel lives. She has noticed.' : 'You wear the King’s crown. Every dead thing in Midgard felt it when you put it on. Hel felt it too. She is wondering whether you will come down and ask for her subjects.',
      'Go to Gloamheim. Look behind the throne Sir Gaunt kept so well. I think you will find he was never guarding the keep at all.', '<i>He pauses.</i> And ask your one-eyed friend in Emberhold where his son is. I have been listening to him lie for a very long time.']);
  },
  async a2_modgud() {
    await line('modgud', ['<i>A pale woman in grey armour stands before the north wall, where a crack of green light runs from the floor to the ceiling. She holds a lantern with no flame in it.</i>', 'Name and business. <i>You give her your name.</i> Living. How rude. I am Móðguðr. I keep the bridge Gjallarbrú, and I ask the dead who they are before they cross. For ten thousand years the answer has been the same: nobody important.', 'This is Helgrind. Sir Gaunt swore to Tyr to hold it shut until the end of the world. He sat with his back to it for a thousand years, and when you killed him, he stopped holding.',
      embersAge() ? 'You smell of green things. The Tree’s root is growing down toward my bridge, and the dead do not like it. They are coming up to look.' : 'You wear the King’s crown. The dead behind the gate can smell it. They are coming up to see what kind of ruler you are.',
      'Here they come. Hold the gate with me. Three times they will push. Do not let them through.']);
  },
  async a2_modgud2() {
    await line('modgud', ['<i>The crack in the wall narrows to a thread of green. Móðguðr lowers her lantern.</i> Shut. Not locked. Nothing locks from this side.', 'Hear me: Hel does not want Midgard. She has plenty of Midgard; it comes to her eventually. She wants her brother. Fenrir. When Gleipnir breaks she means to bring him home, and the road home runs over my bridge.', 'And my bridge does not start here. It runs under the whole of the earth, and the hottest stretch of it lies beneath the dwarves’ Deep Forge. Ask the smith what he built his fire on.']);
    P.flags.lore.helgrind = true;
  },
  async a2_sindri() {
    await line('sindri', ['<i>Sindri does not look up from the anvil.</i> She told you about the bridge. Móðguðr. She always did talk too much, for a dead woman.', 'Aye. The Deep Forge sits on Gjallarbrú. That lava channel you walk past is the river Gjöll, and the stone span over it is the bridge. The heat comes straight up from Hel. Best fire in nine realms.', 'We forged Gleipnir on that bridge. How else do you think we caught a cat’s footfall? Things that do not exist live on the road to the dead, if you know where to put your tongs.', 'And now my lads are walking down it. Nýr’s dead miners hear her calling. Stop them before they reach the span, then go and stand on it yourself. If she is listening, she will talk.']);
  },
  async a2_hel_voice() {
    actor('hel', 32.5, 28.5, { col: '#8aff9a' });
    await line('hel', ['<i>The lava under the bridge goes still, then green. A woman is standing at the end of the span who was not there a moment ago. The left half of her is beautiful. The right half has been dead a long time.</i>', 'So you are the one the Tree refused. <i>Her voice comes from both halves at once, a little out of step.</i> I refused you too, you know. Everyone refuses you. You should take it as a compliment.',
      embersAge() ? 'You gave the Tree your ember, and now its roots grow toward my hall. How sweet. Roots go where the dead are. Everything does, in the end.' : 'And you took the King’s crown. The Ash obeys you. How nice for you. The dead obey me, and there are more of them.',
      'I want my brother. That is all. The gods chained him with a lie and sealed it with a hand. When the chain breaks I will bring him home, and on the way he may eat a few things. Wolves do.', 'Gleipnir is thinning, smith. <i>She looks past you.</i> You could make another, if you could find six things that do not exist. <i>She smiles with the living half.</i> I will enjoy watching you look.']);
    await line('sindri', ['<i>The green goes out of the lava, and Hel with it. Sindri spits into the river.</i>', 'Six things. The footfall of a cat, the beard of a woman, the roots of a mountain, the sinews of a bear, the breath of a fish and the spittle of a bird. I remember the list. I remember every one of them was a nightmare to find.', 'Bring them to me. All six. Ask the little one in Emberhold about cats; children know about things that are not there. And Ragna of Rimeshore has a bowstring older than her people. The rest you will have to take off something that bites.']);
    P.flags.lore.gjallarbru = true;
  },
  async a2_footfall() {
    await line('astrid', ['A cat’s footfall? <i>Astrid thinks very hard.</i> Cats don’t make any noise when they walk. Everyone knows that. So the footfall is the quiet bit.', '<i>She unpins a tiny brass bell from Pip’s collar.</i> This is Pip’s bell. It never rang, not once, not even when I shook it. Sigrun says it’s broken. I think it’s just being a cat.', 'You can have it. Pip says it’s for a good cause. <i>(You receive the Footfall of a Cat.)</i>']);
    if (!countItem('imp_footfall')) { addItem(makeItem('imp_footfall'), true); questEvent('pickup', 'imp_footfall'); }
  },
  async a2_sinew() {
    await line('ragna', ['Bear sinew? <i>Ragna laughs, then stops.</i> There have been no bears in Midgard since my grandmother’s time. But my father’s bow was strung with one, and his father’s before him.', '<i>She unwinds the string from an old bow hanging over the fire.</i> It never snapped. Not in a hundred winters. Father said that was because the bear was not really there any more, so there was nothing left to snap.', 'Take it. If it binds the wolf that ate the world, he would have liked that. <i>(You receive the Sinews of a Bear.)</i>']);
    if (!countItem('imp_sinew')) { addItem(makeItem('imp_sinew'), true); questEvent('pickup', 'imp_sinew'); }
  },
  async a2_brokkr() {
    await line('brokkr', ['<i>Brokkr puts down his hammer.</i> He needs me. Four hundred years of not writing, and now he needs me.', '<i>He is trying very hard to look annoyed and failing.</i> Gleipnir. Hah. We made it in a night. He held the tongs, I did the singing. He always says it was the other way round.', 'Go on down. I’ll take the stair through Gloamheim. Tell him I’m coming, and tell him to clean the good anvil. Hah!']);
  },
  async a2_forge() {
    actor('brokkr', 28.5, 27.5, { col: '#ffb060' });
    await line('brokkr', ['<i>Brokkr is already there when you arrive, soot to the elbows, standing on the far side of the anvil from his brother. Neither of them is looking at the other.</i>', 'You’ve let the bellows go slack.']);
    await line('sindri', ['You’ve let your beard go grey.']);
    await line('brokkr', ['<i>A long silence. Then they both laugh at once, the same laugh, and it is like a forge catching.</i>']);
    await line('sindri', ['<i>They work through the night. Brokkr sings. Sindri holds the tongs. Six things that do not exist go into the fire, and what comes out is softer than silk and heavier than a promise.</i>', 'Gleipnir. Reforged. <i>He lays it across your hands.</i> It cannot be broken by anything that is. Take it to the watchman.', '<i>He does not look at his brother.</i> And thank you for the letter.']);
    await line('brokkr', ['Sorry about the hammer.', '<i>Sindri blows his nose very loudly.</i>']);
    if (!countItem('gleipnir_reforged')) addItem(makeItem('gleipnir_reforged'), true);
    P.flags.gleipnir = 1; P.flags.lore.brothers = true;
  },
  async a2_root() {
    await line('eira', ['<i>Eira is kneeling in the mud with both hands cupped around something small and green.</i> Look. Don’t breathe on it. Look.', 'A root. Yggdrasil’s root. It came up through the old healer’s well south of the camp last night, a thousand miles from the Tree, because that is how far roots go when they are looking for water that remembers them.', 'Your ember did this. <i>She wipes her eyes with a muddy wrist.</i> And every dead thing in the mire felt it. The hags, the wisps, the trolls under the boards. They hate it. They are coming to pull it up.', 'Stand by the well with me. Three waves, maybe more, and not much time between. Do not let them near it.']);
  },
  async a2_root2() {
    await line('eira', ['<i>The shoot has two leaves now. Eira laughs out loud, and it sounds exactly like Ragna.</i>', 'It will live. There will be a tree here in a hundred years, and the wells will run clear under it. Grandmother would have cried. I am going to cry. Give me a moment.', 'Here. It dropped a twig while you fought. A living twig of the World Tree. Wear it. Let the dead see what they are up against.']);
  },
  async a2_crown() {
    cineFocus({ x: 15.5, y: 10.5 });
    await say('The Throne of Cinders', ['<i>The throne room is not empty. The Cinder Thralls who served the King stand in two lines along the lava, and as you walk between them they kneel. Every one.</i>', '<i>All but one. At the foot of the broken throne a thrall stands wearing a circlet hammered out of the King’s own crown-iron, and he does not kneel.</i>']);
    await say('The Cinder Pretender', ['“The crown belongs to the fire, corpse. The fire chose HIM. It never chose you. You just picked it up.”', '“Take it off and kneel, and you may keep your head. Hel has offered the Court a seat at her table. She does not care who wears the crown, only that the crown says yes.”']);
  },
  async a2_court() {
    cineFocus({ x: 15.5, y: 6.5 });
    await say('The Cinder Court', ['<i>The Pretender’s circlet rolls across the floor and stops at your feet. The embers in it go out.</i>', '<i>The kneeling thralls do not rise. One of them speaks, in a voice like a banked fire.</i> “The Court is yours, crowned one. Hel sent word. We did not answer. Command us.”']);
    let r = -1; while (r < 0) r = await ask({ name: 'The Cinder Court', x: 15.5, y: 6.5 }, 'What do you command?', ['Hold the road to the Bifrost against Hel’s dead', 'Go home, all of you. Rest.']);
    P.flags.court = r === 0 ? 'hold' : 'rest';
    await say('The Cinder Court', [r === 0 ? '“It will be held.” The thralls rise as one and file out toward the broken bridge. Whatever else they are, they are very good at standing in a line.' : '<i>They look at each other, as if the word were in a language they used to speak.</i> “Rest,” one repeats. Then, one by one, the embers in their eyes go out, and they are only ash, and the ash is only ash.']);
  },
  async a2_wolf() {
    const dead = !!P.flags.bosses.fenrir;
    await line('heimdall', dead ? ['<i>Heimdall turns around for the first time since you have known him. His eyes are gold all the way through.</i> You killed the wolf once already. I heard him fall.', 'I also heard where he fell to. Not to nothing. Down. Go and look at his island if you like. Then come back to me, and bring your patience.']
      : ['<i>Heimdall turns around for the first time since you have known him. His eyes are gold all the way through.</i> The chain has three strands left. Now two.', 'Gleipnir is in your pack; I can hear it not making a sound. But you cannot bind a wolf that is standing up. The gods learned that. They had to trick him into lying down.', 'So: kill him. Now, while the last strands still slow him. If Hel sends him back, and she will try, we will have the ribbon ready. His island is to the north-east, past the Valkyries’ rest.']);
  },
  async a2_hel_took() {
    await line('heimdall', ['<i>Heimdall is listening to something far below the clouds.</i> Do you hear it? No. You would not. The wolf’s soul did not fall to nothing when he died. It fell down, into Helgrind.', 'Hel caught it. She is sewing him a new body out of drowned men and nails. It will take her a little while. She is a careful seamstress.', 'Before she finishes, talk to the one person in Midgard who has seen this wolf kill a god. He lives in Emberhold. He tells people his name is Vidar.']);
  },
  async a2_odin() {
    await line('vidar', ['<i>The old man is waiting by the broken houses, leaning on his staff. He does not pretend to be surprised.</i> Heimdall told you. Of course he did. He hears everything, and he never did learn when to keep his mouth shut.', 'At the end of the world I rode out to meet the wolf. I knew how it would go; I had paid an eye at Mímir’s well to know. Fenrir would swallow me whole, and my son Vidar would tear his jaws apart to avenge me.', 'That is not what happened. My son pushed me out of the way. He was always faster than me. The wolf took him instead, and I was the one who got up afterwards, with no son and no story.', '<i>He pulls the grey hood back. Under it the empty socket is old and clean, and the face is very tired.</i> I am Odin. I have worn my son’s name ever since, because it was easier than being the one who lived.']);
    await line('sigrun', ['<i>Sigrun has come up behind you without a sound. Valkyries can do that.</i>', 'I knew. <i>She says it gently, which is worse.</i> I carried your son to the gate of Valhalla that day, All-Father, and the gate was already burning. I have known since the first morning you sat down by my fire and lied to me about your name.']);
    P.flags.odin = 1; P.flags.lore.odin = true; if (typeof npcSync === 'function') npcSync();
    await line('vidar', ['<i>Odin does not answer for a long time.</i>', 'Hel is sewing the wolf back together. When she is done he will come down the Bifrost, and this time there is no son to push anyone out of the way. So. Walk with me to the well. What is left of it. There is something you need to see. The burned shrine, east in the fields.']);
  },
  async a2_well() {
    actor('vidar', 41.5, 31.5, { col: '#9ac8ff' });
    await line('vidar', ['<i>The burned shrine at the crossroads. Odin kneels and lays his hand flat on the ash.</i> Mímir’s well was here, under all of this. The water boiled away. The ash remembers.', '<i>The ash under his palm turns silver, and for one breath you see it: a wolf as big as the sky with its jaws open, and a young man in a grey hood stepping between the jaws and an old man on a horse.</i>', 'That is the last thing I saw with both eyes open. <i>He stands.</i> Here is what the well told me the first time, for the eye: the wolf cannot be killed. Not truly. He is not a beast. He is an ending, and endings come back.', 'So you will face him again, and when he falls you will choose. Bind him with the ribbon, as we did, and keep him forever on his island. Or let him go, and let him do the one thing he was made for. I chose once. I chose wrong. I would like somebody else to choose this time.', '<i>He takes off his broad grey hat and sets it on your head.</i> There. I will not need it. I am not wandering any more.']);
  },
  async a2_hel() {
    actor('hel', 30.5, 4.5, { col: '#8aff9a' });
    await line('hel', ['<i>Helgrind stands open behind the empty throne, a door-shaped hole in the world full of green light. Hel sits in it, sewing. The thread runs down into the dark, and something enormous at the other end of it breathes.</i>', 'Nearly done. <i>She bites off a thread with the dead half of her mouth.</i> He will be a little stiff at first. Nails do not bend well.',
      embersAge() ? 'Your Tree grew a root all the way down to my bridge. Móðguðr let it through. She has always been soft about green things.' : P.flags.court === 'rest' ? 'You sent your Court home to rest instead of to war. I could not get one of them to answer me after that. It was very annoying. You make a better king than the last one.' : 'Your Court holds the road to the Bifrost against my dead, in very straight lines. You make a better king than the last one.',
      'You want to stop me. You cannot. He is already on the far side, climbing the roots toward the Bifrost. But you can keep my hound from following him, and that would annoy me very much.', '<i>She whistles once. Something behind the gate answers with a bay that shakes dust out of the ceiling.</i> Garmr. Say hello.']);
  },
  async a2_modgud3() {
    await line('modgud', ['<i>Móðguðr sets her lantern down in front of the gate. This time there is a flame in it.</i> Garmr is quiet. Hel has gone back down to wait. And Fenrir is on the roots, climbing.', 'I have asked the dead their names for ten thousand years. I never asked mine. You did, when you came in. <i>She almost smiles.</i> Go. The watchman will blow his horn soon. I would like to hear it once before the end.']);
    P.flags.gateShut = 1;
  },
  async a2_horn() {
    await line('heimdall', ['He is coming up the roots. I can hear his new claws on the bark. <i>Heimdall lifts a horn from his belt: old, cracked, bound with gold wire.</i>', 'Gjallarhorn. When it sounds, every god in the nine realms comes home for the last battle. I blew it once. Nobody came back from that.', '<i>He blows it anyway.</i>']);
    banner('Gjallarhorn', 'The gods are called home', 'band gold'); Sfx.boss(); if (typeof SHAKE !== 'undefined') SHAKE = Math.max(SHAKE, 0.6);
    actor('vidar', 11.5, 53.5, { col: '#9ac8ff' }); actor('sigrun', 15.5, 52.5, { col: '#ffb060' });
    await line('heimdall', ['<i>The sound goes on for a long time. When it stops, the Bifrost is very quiet. Then two figures step off the burning bridge from Midgard: an old man with one eye, and a Valkyrie with a lantern.</i>']);
    await line('vidar', ['You called, watchman. Only two of us heard. The rest are dead, or busy.']);
    await line('sigrun', ['I told him he was too old for this. He said so was I.', 'Go. We will hold the landing. The wolf is on his island, and he is waiting for you. He would not want anyone else.']);
  },
  async a2_choice() {
    const w = makeVariant('fenrir_spent', 50.5, 10.5); w.fx = 0; w.fy = 1; mobs.push(w);
    actor('vidar', 47.5, 13.5, { col: '#9ac8ff' }); actor('sigrun', 53.5, 13.5, { col: '#ffb060' });
    const F = { name: 'Fenrir', x: w.x, y: w.y };
    cineFocus(w, 0.9);
    await say('Fenrir', ['<i>The wolf is down. The body Hel sewed for him is coming apart at the seams, and through the gaps you can see him as he was: black, enormous, and very young.</i>', '“So,” Fenrir says. His voice is a boy’s voice. “Which lie is it going to be this time?”']);
    await line('vidar', ['<i>Odin leans on his staff and says nothing. He promised he would not.</i>']);
    await line('sigrun', [embersAge() ? '<i>Sigrun looks at the ribbon in your pack, then at the wolf, then at you.</i> Whatever you choose, I will light a Waystone for it.' : '<i>Sigrun looks at the crown on your brow.</i> You chose once already, at the Heart. Choose as yourself this time, not as the crown.']);
    let r = -1;
    while (r < 0) r = await ask(F, '<i>Gleipnir lies across your hands, soft as breath. Hel’s stitches glow green along the wolf’s flanks. You could bind him, forever, where the gods bound him first. Or you could cut the stitches and let him go.</i>', ['Bind him with Gleipnir', 'Cut Hel’s stitches and set him free']);
    removeItems('gleipnir_reforged', 1);
    if (r === 0) {
      P.flags.fenrirFate = 'bound'; P.flags.lore.fenrir_bound = true;
      await say('Fenrir', ['<i>You kneel and loop the ribbon once around the wolf’s great neck. He watches you do it. He does not fight. Nobody lies to him, and nobody puts a hand in his mouth.</i>', '“Hm,” says Fenrir, and lies down on the island where the gods bound him first, and closes his eyes.']);
      await line('vidar', ['<i>Odin lets out a breath he has been holding for ten thousand years.</i> Thank you. I could never have done it honestly. It seems it only works if you do.']);
    } else {
      P.flags.fenrirFate = 'freed'; P.flags.lore.fenrir_freed = true;
      await say('Fenrir', ['<i>You draw your blade along the green stitches, one by one, and they part like old thread. The borrowed body falls away. What stands up out of it is barely a wolf at all: a shadow with eyes, very big, very young.</i>', '“No chain?” He sounds honestly surprised. “Nobody has ever…” <i>He stops. He licks your whole face once, like a dog, and it is terrifying.</i>', '<i>Then he runs. Up the broken bridge and off the end of it and into the sky, toward the dead grey coal where the sun used to be.</i>']);
      await line('vidar', ['<i>Odin watches him go with his one eye, and you realise he is smiling.</i> The well never showed me that. Not once. Well done.']);
    }
    const i = mobs.indexOf(w); if (i >= 0) mobs.splice(i, 1);
    burst(50.5, 10.5, 30, P.flags.fenrirFate === 'bound' ? '#c8b8ff' : '#ffd070', 40, 3);
    after(0.4, () => epilogueAct2(P.flags.fenrirFate));
  },
};
