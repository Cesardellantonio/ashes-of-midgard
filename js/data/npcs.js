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
    dname: 'Vidar the Wanderer', talk: () => talkVidar(), greet: '<i>The old man’s one eye finds you before you speak.</i> Well?', talkLabel: 'Talk',
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
  const N = 'Vidar the Wanderer';
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
