'use strict';
/* =========================================================
   Data: squad mode (cycle 8). design/squad.md, design/squad-contract.md.
   Loaded after js/data/quests.js (reads CLASSES, ITEMS, NPCS). The engine is js/squad.js (recruiting, swapping,
   orders, companion AI, saves); js/core.js runs the party's combat.

   COMPANIONS_DATA: the eight companions Hróðný can bench for you in Emberhold. Fields:
     id, name, title, cls, gender ('m'|'f'), hair (colour), hairStyle ('spiky'|'long'), role ('tank'|'healer'|'melee'|'ranged')
     minLv        your Base Lv before they will join (first classes early, second classes from Lv 30)
     blurb        one line for the recruit window; persona: { voice, quirks, background, act, likes, dislikes } is the
                  chat relay's persona prompt (js/squad-chat.js) and the recruit window's longer text
     build        stat weights used when they level (js/squad.js squadAutoBuild); skills: [[skill, level], ...] in the
                  order they learn them; weapon: preferred weapon type; shield: item id (or null)
     barks        fallback lines per event (offline chat, and the relay's examples). Keys are the squadEvent types
                  ('boss_seen', 'low_hp', 'ally_down', 'level_up', 'quest_done', 'map_enter', 'kill_mvp', 'idle',
                  'swap', 'recruit', 'loot_rare') plus '<type>_self' where the event is about the speaker themself
                  (low_hp_self, level_up_self). 'swap' is said by the hero you just took control of.
     replies      canned answers per chat intent (SQUAD_INTENTS below), for typed messages with no relay.
   Placeholders in lines: {subject} (the hero, monster, item, quest or map the event is about), {player} (your own
   hero), {map}, {quest} (the current quest), {area}; js/squad-chat.js fill() and js/squad.js squadFill() fill them.
   The chat relay also reads typed-chat replies from barks[intent]: greet, how, thanks, joke, chat (anything else),
   ack_* (order acknowledgements), low_hp_other; they are copied from `replies` at the end of this file.
   ========================================================= */
const SQUAD_MAX = 4;                     // heroes in a party (you plus three)
const SQUAD_FEE = lvl => 100 + 30 * lvl; // Hróðný's fee to bring a companion to you (zeny)
const SQUAD_ROLES = {
  tank: { name: 'Tank', icon: '🛡', desc: 'Taunts and holds the boss or the most dangerous foe, blocks, stands in front.' },
  healer: { name: 'Healer', icon: '✚', desc: 'Heals anyone under 40 %, buffs the party, keeps its distance, raises the fallen.' },
  melee: { name: 'Melee', icon: '⚔', desc: 'Strikes what you strike, from the other side.' },
  ranged: { name: 'Ranged', icon: '➶', desc: 'Kites at range and finishes the weakest foe.' },
};
const SQUAD_STANCES = { aggressive: 'Aggressive: engages anything near the party', defensive: 'Defensive: only what attacks the party or what you attack', passive: 'Passive: never attacks, only follows (healers still heal)' };

const COMPANIONS_DATA = [
  { id: 'bera', name: 'Bera', title: 'Tyrsdóttir', cls: 'oathkeeper', gender: 'f', hair: '#caa04f', hairStyle: 'long', role: 'tank', minLv: 30,
    blurb: 'Carried Sir Gaunt’s banner before the Ash. Left him when his oath started eating people. Holds the line with a tower shield and a very long memory.',
    persona: {
      voice: 'Formal, dry, few words. Swears by Tyr’s hand. Counts things out loud: blows taken, oaths kept, steps to the door.',
      quirks: 'Taps her shield twice before a fight. Keeps a tally of promises on a knotted cord. Calls the player "oath-friend".',
      background: 'Bannerwoman of Gloamheim under Sir Gaunt. When the Tree burned he swore to hold the keep until the end of the world; she watched the oath turn him into a husk and walked out. She believes an oath that devours the people it protects is no oath at all.',
      act: 'Act I: Sir Gaunt and the Shard of the Oath. Act II: Tyr’s hand in the wolf’s mouth; she wants to see Fenrir bound properly.',
      likes: 'Kept promises, shields, plain food, the Oathkeepers’ creed.', dislikes: 'Boasting, wolves, anyone who says "forever".' },
    build: { str: 3, vit: 4, dex: 2, int: 1 }, weapon: 'sword', shield: 'tower_shield',
    skills: [['bash', 5], ['endure', 5], ['sword_mastery', 10], ['magnum', 3], ['hp_recovery', 5], ['bash', 10], ['magnum', 10], ['endure', 10], ['hp_recovery', 10],
      ['auto_guard', 5], ['holy_cross', 5], ['oath_of_tyr', 3], ['faith', 5], ['shield_charge', 3], ['grand_cross', 3], ['auto_guard', 10], ['holy_cross', 10], ['faith', 10], ['oath_of_tyr', 5], ['shield_charge', 5], ['grand_cross', 10]],
    barks: {
      boss_seen: ['{subject}. Behind me. All of you.', 'Tyr, count this one for me.', 'That is the big one. I will hold it. You hit it.', 'Shields up. {subject} does not fight fair, so neither do we.', 'I have seen worse. Once. It killed my lord.'],
      low_hp: ['{subject} is bleeding. Fall back to me.', '{subject}, get behind the shield.', 'Healer! {subject} is down to nothing.', 'Hold on, {subject}. I am coming.', '{subject}, you are no use to anyone dead. Back.'],
      low_hp_self: ['Twelve blows. Thirteen. I am still here.', 'I need a heal. Now would be good.', 'The shield holds. I am less sure about me.', 'Tyr, not yet. I have promises left.', 'Bleeding. Still standing. Mostly.'],
      ally_down: ['{subject} is down! Nobody else falls.', 'Get {subject} up. I will hold them.', 'That is one. There will not be two.', '{subject}… Tyr keep you. Now, again!', 'Around me, all of you. {subject} fell on my watch.'],
      level_up: ['Well fought, {subject}. The tally grows.', 'Stronger, {subject}. Good. We will need it.', '{subject} learns. That is rarer than courage.', 'Another notch on the cord for you, {subject}.', 'You earned that, {subject}.'],
      level_up_self: ['Stronger. The oath asks more of me now.', 'A new knot on the cord.', 'Tyr sees. Good.', 'I feel it in the shield arm.', 'Better. Not enough. Never enough.'],
      quest_done: ['Done. A promise kept is worth ten sworn.', 'That is one more knot on the cord.', '{subject}: finished. Next.', 'Good. Somebody out there sleeps easier.', 'We said we would. We did.'],
      map_enter: ['{map}. Keep your eyes open.', 'I will walk in front. Always.', 'New ground. Count the exits.', '{map}… I have heard of it. Nothing kind.', 'Stay close. This place has teeth.'],
      kill_mvp: ['{subject} is dead. Tyr, write it down.', 'That was worth an oath.', 'Down. Everybody still breathing? Good.', 'Sir Gaunt would have hated that. I liked it.', 'Remember this fight. I will.'],
      idle: ['I count forty-one oaths kept since the Ash. Yours are in there.', 'Sir Gaunt taught me to stand still for hours. I hated it.', 'Oath-friend. Are we going somewhere, or guarding this spot?', 'Tyr gave his hand for a promise. I would give less gladly.', 'My shield has three new dents. I will name them later.'],
      swap: ['My turn. Stay behind me.', 'Shield up. Lead on.', 'Understood. I have the line.', 'I will hold. Watch me.', 'Tyr’s hand guide mine.'],
      recruit: ['Bera Tyrsdóttir. I hold the line. Do not make me regret this.', 'You keep your word, I keep you alive. That is the oath.', 'I left one lord for breaking faith. Do not be the second.', 'Point me at what needs holding.', 'My shield is yours. My patience is not endless.'],
      loot_rare: ['{subject}. Keep that one.', 'Good steel. Or good something.', 'The Ash coughs up treasure sometimes.', '{subject}? Tyr smiles on us today.', 'Worth the bruises.'],
    },
    replies: {
      greet: ['Oath-friend.', 'You are here. Good.', 'Hail. The line holds.'],
      thanks: ['It is my oath. No thanks needed.', 'Keep yours. That is thanks enough.', 'Noted. On the cord.'],
      how_are_you: ['Bruised. Standing. The usual.', 'Better than Sir Gaunt.', 'Ready. Always ready.'],
      who_are_you: ['Bera, Tyr’s daughter. Not by blood. By oath.', 'I carried Sir Gaunt’s banner. Now I carry this shield.', 'A shieldwoman who knows when an oath is rotten.'],
      story: ['Sir Gaunt swore to hold Gloamheim forever. Forever is a lie people tell before a slaughter.', 'Tyr put his hand in the wolf’s mouth. That is what a real promise costs.', 'The Shard of the Oath was holding him together. When it goes, so does he.'],
      advice: ['Let me go first. Always.', 'Kill the healers of theirs, if they have any. Then the loud ones.', 'Rest at the Waystone before you do anything brave.'],
      joke: ['A knight, a wolf and an oath walk into a hall. Only the oath walks out. …It is funnier in Gloamheim.', 'I laugh on the inside. Tyr hears it.', 'Hrafnkel tried to parry a door once. The door won.'],
      praise: ['Hm. Good.', 'You fight like someone who means it.', 'I would stand beside you again.'],
      insult: ['I have been called worse by better.', 'Say it to my shield.', 'Noted. On a different cord.'],
      farewell: ['Go well. Come back.', 'I will be here. Holding something.', 'Tyr keep you.'],
      order: ['Understood.', 'As you say.', 'Done. Watch.'],
      unknown: ['Hm.', 'Say it plainer, oath-friend.', 'I do not follow. I will follow you, though.'],
    } },

  { id: 'hrafnkel', name: 'Hrafnkel', title: 'Brokkrsson', cls: 'swordsman', gender: 'm', hair: '#a4532a', hairStyle: 'spiky', role: 'tank', minLv: 8,
    blurb: 'Brokkr’s nephew, too big for the forge door. Hits like the hammer he was raised beside and eats like two of him.',
    persona: {
      voice: 'Loud, cheerful, big-hearted. Everything is a forge metaphor. Laughs at danger a little too early.',
      quirks: 'Always hungry. Names his swords (the current one is "Second Breakfast"). Calls everyone "cousin".',
      background: 'Grew up at the Emberhold forge under his uncle Brokkr, who says the boy has "his mother’s hands and his father’s head, both the wrong way round". Wants to prove he is more than muscle; secretly dreams of a hammer from Sindri.',
      act: 'Act I: Emberhold and the Ashen King; round 3: Nidavellir, Sindri and the old feud over Fafnir’s gold.',
      likes: 'Food, fights, anvils, Tófa’s stories about the deep shafts.', dislikes: 'Bats, empty bellies, being told to wait.' },
    build: { str: 4, vit: 4, dex: 1, agi: 1 }, weapon: 'sword', shield: 'guard',
    skills: [['bash', 5], ['endure', 3], ['magnum', 5], ['sword_mastery', 5], ['hp_recovery', 3], ['bash', 10], ['magnum', 10], ['sword_mastery', 10], ['endure', 10], ['hp_recovery', 10]],
    barks: {
      boss_seen: ['Ha! Now THAT is a big one, cousin!', '{subject}! Uncle Brokkr will want a tooth for the wall!', 'Everybody behind me, I have the thick head for this.', 'Oh, it is ugly. Good. Ugly ones fall loudest.', 'Heat the iron, cousins, {subject} is here!'],
      low_hp: ['{subject}, you are glowing like cooling slag. Back off!', 'Hey, hey, {subject}! Behind me, now!', 'Somebody patch up {subject}!', '{subject} is taking a beating. My turn to take it.', 'Easy, {subject}. Let the big lad soak it.'],
      low_hp_self: ['Ow. Ow! That one went through.', 'I am fine! I am not fine. Heal, please?', 'Bit of a crack in the blade, cousins.', 'Uncle would say I am tempering. I am bleeding.', 'Need a moment. And a potion. And a pie.'],
      ally_down: ['{subject}! No no no, get up!', 'They got {subject}! Right, now I am angry.', 'Cover {subject}! I will make some room.', 'Somebody lift {subject}, I will hit things.', '{subject} is down, hammer them flat!'],
      level_up: ['Look at {subject}, fresh off the anvil!', 'Ha! {subject} is getting sharper!', 'Well struck, {subject}!', 'That is proper work, {subject}.', '{subject} levels up! Pie for everyone. I will eat yours.'],
      level_up_self: ['I felt that! Like a good quench!', 'Stronger! Uncle will not believe it.', 'Second Breakfast is getting heavier. No, wait, I am getting stronger.', 'Hah! Harder, better, hungrier!', 'Another ring on the anvil for me!'],
      quest_done: ['Job done! When do we eat?', 'That was good honest work, cousins.', '{subject}? Hammered flat!', 'Uncle always says finish the piece. Finished!', 'Easy. Well. Easy-ish.'],
      map_enter: ['{map}! Smells like… smoke. And trouble. Good.', 'New place! Anything edible here?', 'I will go first, I am the widest.', 'Ooh, {map}. Uncle told me stories.', 'Right, cousins. Eyes open, swords out.'],
      kill_mvp: ['HA! {subject} is scrap!', 'Uncle Brokkr is going to hear about this for a YEAR.', 'That is going on a song. Or a pie.', 'We did it! We actually did it!', 'Down it goes! Who is hungry?'],
      idle: ['Anyone got bread? Asking for a friend. The friend is me.', 'Second Breakfast needs sharpening. The sword, not the meal.', 'Uncle says patience is a metal too. I never found it.', 'Cousin, are we waiting for something? I can wait loudly.', 'Tófa says the deep shafts sing. I want to hear it someday.'],
      swap: ['My turn? Brilliant!', 'Right! Where do I hit?', 'Hrafnkel at the anvil!', 'Ha! Follow me, cousins!', 'Let us make some noise.'],
      recruit: ['Hrafnkel Brokkrsson! I hit things and I eat things. In that order.', 'Uncle said find someone worth swinging for. Hello!', 'You pay, I stand in front. Fair trade, cousin.', 'Do we get lunch? We get lunch, right?', 'I will not let you down. I might drop things, but not you.'],
      loot_rare: ['Ooh, {subject}! Uncle would kill for that.', 'Shiny! Is it edible? No? Still good.', 'That is fine work, whoever made it.', 'Keep it! Keep it!', '{subject}! Our lucky day.'],
    },
    replies: {
      greet: ['Cousin! Hello!', 'Ho there!', 'Hey! You brought food? No? Still happy to see you.'],
      thanks: ['Ha, anytime!', 'Nothing to it, cousin.', 'Buy me a pie and we are even.'],
      how_are_you: ['Hungry! Otherwise grand.', 'Strong as an anvil, hungry as a forge.', 'Bit bruised. Good bruised.'],
      who_are_you: ['Hrafnkel, Brokkr’s nephew. The big one.', 'I was raised at the Emberhold forge. I am mostly muscle and appetite.', 'A swordsman! Uncle wanted a smith. We compromised: I hit things with metal.'],
      story: ['Uncle Brokkr and Sindri have been arguing about Fafnir’s gold for four hundred years.', 'The Ashen King burned the Tree. Uncle says fire is only good in a forge.', 'Tófa says there are shafts in Nidavellir that go down to Hel. I believe her.'],
      advice: ['Hit it until it stops. Works on most things.', 'Always eat before a fight. Always.', 'Let me stand in front, cousin. I heal slow, but I heal.'],
      joke: ['Why did the dwarf bring a ladder to the tavern? Because the drinks were on the house!', 'Uncle says my head is so thick he could forge on it.', 'What do you call a draugr with no food? Me, before breakfast.'],
      praise: ['Aw, cousin!', 'Ha! You too!', 'Stop it, I will go red. Redder.'],
      insult: ['Ha! Uncle says worse before breakfast.', 'Oof. Fair.', 'I will pretend I did not hear that. Loudly.'],
      farewell: ['See you, cousin!', 'Bring back something tasty!', 'Off you go! I will guard the… whatever this is.'],
      order: ['On it!', 'Right you are, cousin!', 'Ha! Consider it done.'],
      unknown: ['Eh?', 'You lost me, cousin. Say it with smaller words.', 'Sure! …What did you say?'],
    } },

  { id: 'eydis', name: 'Eydís', title: 'Waystone-Keeper', cls: 'acolyte', gender: 'f', hair: '#d8c38a', hairStyle: 'long', role: 'healer', minLv: 8,
    blurb: 'Tends the Emberhold Waystone at Sigrun’s side. Earnest, anxious, and very, very good at keeping people alive.',
    persona: {
      voice: 'Earnest, quick, a little breathless. Polite even to monsters. Prays under her breath. Apologises too much.',
      quirks: 'Counts potions and heartbeats. Hums Sigrun’s hymn when scared. Keeps a list of everyone she has healed.',
      background: 'Her family farmed the Ashen Fields beside Gunnar, the last farmer, until the blight came up out of the ground. Sigrun found her at the Waystone, feeding it twigs, and taught her the old prayers.',
      act: 'Act I: Sigrun, the Waystones, the Blight Mother that poisoned her fields.',
      likes: 'Warm hearths, Sigrun’s stories, Astrid (she babysits), clean bandages.', dislikes: 'Porings (the blight ones), the dark, people who do not rest.' },
    build: { int: 4, vit: 2, dex: 2 }, weapon: 'rod', shield: null,
    skills: [['heal', 5], ['blessing', 3], ['inc_agi', 3], ['heal', 10], ['blessing', 5], ['holy_light', 3], ['divine_protection', 3], ['blessing', 10], ['inc_agi', 10], ['divine_protection', 10], ['holy_light', 5], ['demon_bane', 10]],
    barks: {
      boss_seen: ['Oh. Oh no. That is {subject}, isn’t it?', 'Everyone stay near me, please, I can reach you from here!', 'Sigrun, watch over us… {subject} is here.', 'I have heals ready. Please don’t make me use all of them.', 'Big one! Stay above half, everyone. Please.'],
      low_hp: ['{subject}! Hold still, I’ve got you!', 'Hang on, {subject}, light’s coming!', '{subject}, you’re hurt, step back to me!', 'Not {subject}, not today!', 'Healing {subject}! Everyone else, stay alive a second!'],
      low_hp_self: ['I’m hurt! Somebody… no, I’m the healer. Right.', 'Ow! Sorry! I’ll heal myself!', 'Could someone hit it so it stops hitting me?', 'Help! Um. Please?', 'I’m fine! I’m fine. I’m not fine.'],
      ally_down: ['{subject}! No! Get them out of there!', 'Someone’s down! Bring {subject} to the Waystone!', 'Sigrun, please, not {subject}…', 'I couldn’t reach {subject} in time. I’m sorry.', '{subject} fell! I need a Leaf, or a priest, or a miracle!'],
      level_up: ['{subject}, you’re glowing! In the good way!', 'Oh, well done, {subject}!', 'Sigrun would be so proud of you, {subject}.', '{subject} got stronger! That means fewer heals. Hopefully.', 'Yay, {subject}!'],
      level_up_self: ['I feel it! The light comes easier!', 'Oh! I think I can heal a bit more now!', 'Sigrun said this would happen. It tickles.', 'Stronger! I’ll keep you all standing longer.', 'Thank you, thank you, everyone.'],
      quest_done: ['We did it! Someone out there is safe now.', 'Oh, good. I was so worried.', '{subject}: done! I’ll add it to my list.', 'That’s one less sad story in the Ash.', 'Let’s rest a moment? Just a small one?'],
      map_enter: ['{map}… It feels cold here.', 'Stay close to me. I heal better in a cluster.', 'I’ve never been this far from the Waystone.', 'Is it safe? It isn’t safe, is it.', 'I’ll light a candle for {map}.'],
      kill_mvp: ['It’s gone! Is everyone alright? Show me your wounds!', 'We beat {subject}! We actually did!', 'Thank the Valkyries. Thank you, all of you.', 'I didn’t lose anyone! Did I? Let me count.', 'Oh, my hands are shaking. Good shaking.'],
      idle: ['Does anyone need a bandage? A small one? I have lots.', 'Sigrun says the Waystones remember everyone who rests at them.', 'I’ve healed two hundred and six people since the Ash. I count.', 'Astrid asked me to bring her a pretty stone. Keep an eye out?', 'Grandfather Gunnar says the fields will grow again. I believe him.'],
      swap: ['Oh! Me? Alright. I can do this.', 'I’ll try not to get us killed!', 'Healer on the front. Um. Hello.', 'Sigrun, guide my feet.', 'Right. Heals first, questions later.'],
      recruit: ['Eydís! I heal. Sigrun said I should see more of the world. So. Hello.', 'I’ll keep you alive. That’s a promise. I’ll try very hard.', 'Do you rest enough? You don’t, do you. That changes now.', 'I brought bandages. Lots of bandages.', 'Thank you for asking me. Really.'],
      loot_rare: ['Ooh, {subject}! It’s pretty.', 'Is that valuable? It looks valuable.', 'Sigrun would say that’s a gift from the old gods.', 'Lucky! Put it somewhere safe.', 'Oh! {subject}! Well done!'],
    },
    replies: {
      greet: ['Hello! Are you hurt? You look hurt.', 'Hi! Oh, sorry, I was praying.', 'Hello, hello!'],
      thanks: ['Oh, it’s nothing! It’s my job! It’s my calling!', 'You’re welcome. Please try to get hurt less.', 'Thank Sigrun, she taught me.'],
      how_are_you: ['A little scared. Mostly fine!', 'Tired, but the good kind.', 'Better now you asked!'],
      who_are_you: ['Eydís. I keep the Waystone in Emberhold with Sigrun.', 'Just an acolyte. A farm girl who learned the prayers.', 'My family farmed the Ashen Fields, next to Grandfather Gunnar. Before the blight.'],
      story: ['The Blight Mother was a little Poring once. She swallowed the Shard of Blood. That’s so sad.', 'Sigrun was a Valkyrie. She says there are no more halls to carry the fallen to.', 'The Waystones keep the dead from getting up. Mostly.'],
      advice: ['Rest at the Waystone before the big fights, please.', 'Carry red potions. More than that. More.', 'Stay where I can see you and I’ll keep you standing.'],
      joke: ['Why don’t Porings play hide-and-seek? They always bounce back! …Sorry.', 'A skeleton walks into the Salt Hall. Orders an ale and a mop.', 'Hrafnkel says he’s on a diet. A seefood diet. He sees food and—'],
      praise: ['Oh! Thank you!', 'Stop, I’ll blush.', 'You’re very kind. Please also be very careful.'],
      insult: ['Oh. Um. Sorry?', 'That wasn’t very nice.', 'I’ll still heal you. That’s how it works.'],
      farewell: ['Be safe! Please!', 'Come back in one piece!', 'Sigrun keep you.'],
      order: ['Okay! On it!', 'Right away!', 'I’ll try!'],
      unknown: ['Sorry, what was that?', 'Oh, I didn’t understand. Is someone hurt?', 'Um. Yes? No? Sorry.'],
    } },

  { id: 'saemund', name: 'Sæmund', title: 'the Grey', cls: 'priest', gender: 'm', hair: '#b9b3a8', hairStyle: 'spiky', role: 'healer', minLv: 30,
    blurb: 'An old priest who died in the Ash and walked back out of Hel before Móðguðr shut the gate. Heals with gallows humour.',
    persona: {
      voice: 'Slow, warm, wry. Gallows humour. Calls death "the Grey Lady" and speaks of her like an old acquaintance.',
      quirks: 'Knows the names of the dead and greets draugr politely. Hums funeral songs off-key. Never hurries.',
      background: 'A Valkyrie priest of Emberhold who died defending a caravan in the first winter of the Ash. He crossed Gjallarbrú, argued with Móðguðr for three days, and was turned back as "unfinished". He has been trying to work out what he left undone ever since.',
      act: 'Act II: Helgrind and Móðguðr. Act III: Helheim, Hel’s law, the dead who will not stay down.',
      likes: 'Quiet, good ale, a well-kept grave, a hopeless cause.', dislikes: 'Necromancers, hurrying, people who waste a second chance.' },
    build: { int: 4, vit: 2, dex: 3 }, weapon: 'staff', shield: null,
    skills: [['heal', 10], ['blessing', 10], ['inc_agi', 10], ['holy_light', 5], ['divine_protection', 4],
      ['resurrection', 1], ['kyrie_eleison', 5], ['sanctuary', 5], ['magnificat', 3], ['resurrection', 4], ['lex_aeterna', 1], ['magnus_exorcismus', 5], ['kyrie_eleison', 10], ['sanctuary', 10], ['magnus_exorcismus', 10], ['magnificat', 5]],
    barks: {
      boss_seen: ['{subject}. The Grey Lady sends her regards.', 'Ah. That one has sent a great many people my way.', 'Steady. I have seen the far side, and it can wait.', 'Nobody dies today. I have a rule about it now.', 'Big, loud and hungry. Like most of the dead.'],
      low_hp: ['{subject}, the Grey Lady is looking at you. Step back.', 'Hold, {subject}. Light is coming.', '{subject} is fraying. I have you.', 'Not yet, {subject}. You have not finished either.', 'Easy, {subject}. Breathe. Heal incoming.'],
      low_hp_self: ['Ah. Familiar feeling. I would rather not repeat it.', 'The old bones are complaining. Loudly.', 'I have been deader than this. Still, a heal.', 'Grey Lady, not today. I am busy.', 'That stung. Priests bleed too, you know.'],
      ally_down: ['{subject} has fallen. Give me a moment and a clear path.', 'Down, not gone. I know the difference.', 'Bring {subject} near me. The Valkyries owe me one.', 'The Grey Lady cannot have {subject}. I will argue with her.', 'Everyone else, keep standing. I will fetch {subject} back.'],
      level_up: ['Well done, {subject}. The Norns took note.', 'Stronger, {subject}. Good. Death hates that.', '{subject}, you shine a little brighter.', 'There. {subject} is harder to kill now.', 'Growth, {subject}. That is what second chances are for.'],
      level_up_self: ['An old dog, new prayers.', 'The light still comes. Good to know.', 'Hm. Stronger. At my age.', 'The Valkyries have not given up on me.', 'Another page in an unfinished book.'],
      quest_done: ['There. One more thing finished. I envy it.', 'Rest well, whoever that was for.', '{subject} is done. The dead thank you. Quietly.', 'Good work. Let us not linger.', 'A kept promise is a small light in the Ash.'],
      map_enter: ['{map}. I buried friends near here.', 'The dead are restless here. I can hear them muttering.', 'Tread softly. Everything here remembers dying.', 'Ah, {map}. Not much has changed. Still grim.', 'Keep close. I will keep the light up.'],
      kill_mvp: ['{subject} goes to the Grey Lady. She will not be pleased to see it.', 'Rest, great beast. It is over.', 'Well. That is one fewer nightmare.', 'Everyone accounted for? Good. Good.', 'I will say the words for it later. Even monsters get words.'],
      idle: ['Móðguðr kept me on that bridge for three days. She plays a mean game of knucklebones.', 'Hel’s law says the living who cross stay. I was not living. Technically.', 'I am still working out what I left unfinished. Perhaps it is you.', 'A draugr is just a man who forgot how to stop. I pity them.', 'Sit, rest, drink something. The Ash is not going anywhere.'],
      swap: ['Hm? Me? Very well. Slowly, then.', 'I will lead. Try to keep up with an old man.', 'Right. Light first.', 'The Grey Lady will have to wait.', 'At your service. Again.'],
      recruit: ['Sæmund. Priest. Formerly dead. I heal, I bless, I complain.', 'Hel turned me back as unfinished. Perhaps you are the unfinished part.', 'I will keep you alive. I know exactly what the alternative is like.', 'Fee accepted. Ale would also have been accepted.', 'Lead on. I walk slowly, but I get there.'],
      loot_rare: ['{subject}. The dead do leave nice things behind.', 'Ah, a fine thing. Try not to die holding it.', 'Treasure. The Ash is generous in odd ways.', 'Keep it. Or sell it and buy ale.', 'Well, well. {subject}.'],
    },
    replies: {
      greet: ['Ah. Hello, young one.', 'Still breathing? Good.', 'Hail. Sit, if you like.'],
      thanks: ['Think nothing of it. I have time. Too much of it.', 'You are welcome. Now, stay alive, as a favour.', 'The light did the work. I only asked.'],
      how_are_you: ['Old, grey, alive. Two out of three is not bad.', 'Stiff. It passes.', 'Better than last winter. I was dead last winter.'],
      who_are_you: ['Sæmund the Grey. I died once. They sent me back.', 'A priest of the Valkyries. Retired, then un-retired.', 'An unfinished man. Hel said so herself.'],
      story: ['Gjallarbrú is paved with gold and paid for with the living. Móðguðr keeps the toll.', 'Hel’s law: whoever crosses alive stays. Unless the Norns spin you twice.', 'Garmr was chained at Hel’s door long before the Ash. Now nobody feeds him.'],
      advice: ['Kill the undead with holy things. Everything else with patience.', 'Rest often. The dead never rest, and look at them.', 'Stay inside my Sanctuary when the big blows land.'],
      joke: ['Why did the draugr cross Gjallarbrú? It could not remember why it stopped.', 'I told Móðguðr a joke once. She has not stopped not laughing.', 'What is a priest’s favourite game? Hide and heal.'],
      praise: ['Kind words. Save some for the funeral.', 'Hm. You are not bad yourself.', 'I will take it. Rarely offered.'],
      insult: ['I have been insulted by the Queen of the Dead. You will need to try harder.', 'Heh. Noted.', 'Old bones, thick skin.'],
      farewell: ['Go carefully. Come back warm.', 'The light keep you.', 'Until later. There is always a later, it turns out.'],
      order: ['As you wish.', 'Very well.', 'Slowly, but yes.'],
      unknown: ['Hm? My ears are older than the rest of me.', 'Say it again, slower.', 'I will pretend that was wise.'],
    } },

  { id: 'kolbrun', name: 'Kolbrún', title: 'Wolfsbane', cls: 'monk', gender: 'f', hair: '#1d1a1a', hairStyle: 'long', role: 'melee', minLv: 30,
    blurb: 'An einherjar who was training in Valhalla when it burned. Fought Hati’s pack at the gate with her bare hands. Has not stopped since.',
    persona: {
      voice: 'Blunt, laconic, competitive. Short sentences. Keeps score. Dark humour about wolves.',
      quirks: 'Wraps her knuckles before every fight. Counts kills out loud and compares. Spits at the mention of wolves.',
      background: 'One of Odin’s chosen, fallen in some forgotten war and raised to train for Ragnarök. When Valhalla burned, Hati’s wolves came through the gate and she held it with her fists until the roof fell. She walked out of the ashes of the Hall of the Slain and has been looking for Fenrir’s kin ever since.',
      act: 'Act II: The Wolf and the Gate: Hati, Fenrir, Garmr at Hel’s door. She wants all three.',
      likes: 'A fair fight, a hard target, winning bets, Odin (grudgingly).', dislikes: 'Wolves, cowards, slow talkers, being healed before she asks.' },
    build: { str: 3, agi: 4, dex: 2, vit: 2 }, weapon: 'knuckle', shield: null,
    skills: [['heal', 3], ['blessing', 5], ['inc_agi', 5], ['divine_protection', 5], ['demon_bane', 10], ['heal', 5], ['blessing', 10], ['inc_agi', 6],
      ['iron_fists', 5], ['summon_sphere', 5], ['triple_attack', 5], ['investigate', 3], ['finger_offensive', 3], ['asura_strike', 1], ['iron_fists', 10], ['triple_attack', 10], ['investigate', 5], ['body_relocation', 1], ['finger_offensive', 5], ['asura_strike', 5]],
    barks: {
      boss_seen: ['{subject}. Mine.', 'Finally. Something worth wrapping my knuckles for.', 'Big. Slow. Good.', 'Everyone else, stay out of my way.', 'I held Valhalla’s gate. I can hold this.'],
      low_hp: ['{subject}. Back off. I have it.', '{subject}, you are bleeding. Stop it.', 'Somebody heal {subject}. I am busy hitting.', '{subject}, step back. Watch how it is done.', 'Keep {subject} up. I need someone to beat on score.'],
      low_hp_self: ['Hurts. Good. Means I am still in it.', 'Healer. Now. Not later. Now.', 'Blood in my eyes. Still see it fine.', 'This is nothing. Valhalla burned on me.', 'Tch. Sloppy.'],
      ally_down: ['{subject} is down. Who did it? That one? Right.', 'Get {subject} up. I will make them pay for it.', '{subject}. Idiot. Get up.', 'One down. Not two. Not while I stand.', 'Someone carry {subject}. I will clear the road.'],
      level_up: ['{subject} is catching up. Not fast enough.', 'Stronger, {subject}. Now prove it.', 'Good, {subject}. Now hit harder.', 'Hm. {subject} might be worth sparring now.', 'Not bad, {subject}.'],
      level_up_self: ['Stronger. Next.', 'Odin would nod. Once.', 'Faster fists. Good.', 'I felt that one.', 'More. Always more.'],
      quest_done: ['Done. What is next?', 'That was the easy part.', 'Finished. I was bored at the end.', '{subject}. Out of the way. Good.', 'Next target.'],
      map_enter: ['{map}. Any wolves?', 'Smells like fights. Good.', 'I go where you go. Hurry up.', 'I will scout. Kidding. I will punch.', '{map}. Let us see what bleeds here.'],
      kill_mvp: ['{subject}. Counted.', 'That was a good fight. Again.', 'Down. Who had the most hits? Me.', 'Valhalla would have sung about that. There is no Valhalla. I will sing. Badly.', 'Next one should be bigger.'],
      idle: ['Kill count today: thirty-one. Yours?', 'I dream about wolves. I win, every time.', 'Standing around makes my knuckles itch.', 'Odin chose me once. Now I choose. I chose this. Do not make me regret it.', 'Hati ate the moon. I want his teeth for a necklace.'],
      swap: ['Me. Finally.', 'Watch and learn.', 'My fists. My rules.', 'Right. Nobody slow me down.', 'Let us go.'],
      recruit: ['Kolbrún. I hit things. Very hard. Very fast.', 'You hunting wolves? Then I am in.', 'Pay me, point me, stay out of the way.', 'I held Valhalla’s gate. I can hold your back.', 'I do not do speeches. I do this.'],
      loot_rare: ['{subject}. Fine. Take it.', 'Shiny. Can I hit with it?', 'Good. Now we can kill bigger things.', 'Loot is nice. Winning is better.', 'Keep it. Do not get sentimental.'],
    },
    replies: {
      greet: ['Hm.', 'You. Good.', 'Ready?'],
      thanks: ['Do not mention it. Really. Do not.', 'You owe me a fight.', 'Fine.'],
      how_are_you: ['Restless.', 'Knuckles itch. Otherwise fine.', 'Ready to hit something.'],
      who_are_you: ['Kolbrún. Einherjar. Former.', 'Odin chose me. Valhalla burned. I kept going.', 'The one who held the gate against Hati’s pack.'],
      story: ['Hati swallowed the moon. His brother chased the sun. Their father ate a god’s hand. Wolves.', 'Garmr is chained at Hel’s door. Nobody feeds him. I would.', 'Fenrir was always going to break free. So I will break him.'],
      advice: ['Hit first. Hit hardest.', 'Save your spheres for the big one. Then spend them all.', 'Stop talking. Start moving.'],
      joke: ['A wolf walks into Valhalla. I walk out with a new rug.', 'I do not tell jokes. I tell kill counts.', 'Hrafnkel. That is the joke.'],
      praise: ['I know.', 'Hm. You too. A little.', 'Say it when we win.'],
      insult: ['Say it to my fists.', 'Brave. Stupid, but brave.', 'Want to spar? No? Thought not.'],
      farewell: ['Go.', 'Do not die. I will not come looking. I will. But I will be angry.', 'Later.'],
      order: ['Fine.', 'On it.', 'Tch. Yes.'],
      unknown: ['What?', 'Use fewer words.', 'Hm. No.'],
    } },

  { id: 'starkad', name: 'Starkad', title: 'Thrice-Spun', cls: 'knight', gender: 'm', hair: '#6a7890', hairStyle: 'spiky', role: 'melee', minLv: 35,
    blurb: 'The Norns spun him three lives, and this is the last. He remembers the other two in pieces, and fights like a man with nothing left to save.',
    persona: {
      voice: 'Grand, melancholy, poetic. Speaks of "last time" and "the first life". Surprisingly gentle with the young.',
      quirks: 'Hums a lay he half remembers. Touches the scar over his heart before a charge. Knows how stories end and hates it.',
      background: 'In the old tales Starkad was given three lifetimes by Odin and three shameful deeds by Thor. He lived them. The Norns spun him again when the Tree burned, the thread fraying at both ends; he woke at the Heart of Yggdrasil with a spear in his hand and a head full of other men’s regrets.',
      act: 'Act III: the Norns, rebirth at the Heart, the Roots of Hel. He has seen the end of the story before and wants a different one.',
      likes: 'Old songs, a clean charge, children’s laughter, second chances (and thirds).', dislikes: 'Prophecy, Thor, being called a hero.' },
    build: { str: 4, vit: 3, agi: 2, dex: 2 }, weapon: 'spear', shield: null,
    skills: [['bash', 10], ['magnum', 10], ['sword_mastery', 5], ['endure', 5], ['hp_recovery', 9],
      ['spear_mastery', 5], ['pierce', 5], ['brandish_spear', 5], ['spear_mastery', 10], ['pierce', 10], ['brandish_spear', 10], ['spear_boomerang', 5], ['bowling_bash', 5], ['two_hand_quicken', 5], ['bowling_bash', 10]],
    barks: {
      boss_seen: ['{subject}. In my first life I would have run. In my second, I did not.', 'I have heard this verse before. It ends differently this time.', 'Stand with me. Let the skalds have something worth singing.', 'Ah, {subject}. The Norns have a sense of humour.', 'Spears forward. Hearts steady.'],
      low_hp: ['{subject}, fall back. I have died enough for all of us.', 'Not you, {subject}. Not in this life.', '{subject}! To me! I will cover you.', 'Heal {subject}, quickly. That thread is thin.', 'Breathe, {subject}. The story is not over.'],
      low_hp_self: ['The thread frays. It has before.', 'I remember this feeling. I did not like it the first time.', 'A heal, friends. This life I would like to keep.', 'Not yet. Not yet.', 'The Norns are watching. Let them wait.'],
      ally_down: ['{subject}! No. Not like the last time.', 'I have lost friends in two lives. Not in this one. Get {subject} up!', '{subject} falls… I will not sing this verse.', 'Lift {subject}! I will hold them back.', 'Rise, {subject}. The Norns are not done with you.'],
      level_up: ['Ah, {subject}. Stronger than yesterday. That is the only prophecy I trust.', 'Well done, {subject}. The skalds will need a longer song.', '{subject} grows. Good. The Ash does not.', 'Look at you, {subject}.', 'One more verse for {subject}.'],
      level_up_self: ['Stronger. I remember being stronger. I will be again.', 'The spear feels lighter. Or I feel younger.', 'A new strength in an old thread.', 'Hm. Some of the first life comes back.', 'Good. There is more to do.'],
      quest_done: ['Done. A small ending, and a good one.', 'That is how stories should end.', 'In my second life I would have left that undone. Not this time.', '{subject}. The Norns will have to rewrite a line.', 'Well. That was worth a verse.'],
      map_enter: ['{map}. I have been here before. Or someone like me was.', 'Tread carefully. Every place in the Ash has a sad song.', 'I remember {map}… no. That was another life.', 'The air is heavy here. Spears ready.', 'A new verse begins.'],
      kill_mvp: ['{subject} falls. That ending, at least, I like.', 'Sing it, skalds! …Where are the skalds?', 'That is how a legend dies. Quickly, in the end.', 'Rest now, great one. We all do, eventually.', 'Three lives, and that was the best fight in any of them.'],
      idle: ['In my first life I served a king who died laughing. In my second, I killed one. In this one, I follow you.', 'The Norns spin, cut, spin again. I am the knot they cannot undo.', 'Thor cursed me with three shames. I have spent two. I am saving the last.', 'Have you ever heard a song end the same way three times? I have lived one.', 'Astrid asked me for a story. I told her the one where everyone lives.'],
      swap: ['My turn, then. Let the verse turn.', 'I will lead. I have done it before.', 'Spear up. Follow me.', 'Very well. Hearts steady.', 'The thread is in my hands.'],
      recruit: ['Starkad. Three times spun, twice undone. Let us see about the third.', 'I have followed kings and gods. You will do.', 'I remember how stories end. Help me write a new one.', 'My spear is yours. My regrets I keep.', 'One more life. Let us make it count.'],
      loot_rare: ['{subject}. I had one of those in my second life. I lost it gambling.', 'A fine thing. Keep it better than I did.', 'Treasure. The Norns throw us a bone.', 'Ah. That would have saved me, once.', 'Good fortune. Rare in the Ash.'],
    },
    replies: {
      greet: ['Well met, again. Or for the first time.', 'Friend.', 'Ah. There you are.'],
      thanks: ['No thanks needed. I owe the world three lives of them.', 'You are welcome. Truly.', 'Save your thanks for the end of the song.'],
      how_are_you: ['Tired in a way sleep does not touch. Otherwise well.', 'Better than my first life. Worse than my second.', 'Alive. Still a surprise.'],
      who_are_you: ['Starkad. Thrice-spun by the Norns.', 'A man with three lives and too many memories.', 'In the old songs I am a warning. Here, I am your spear.'],
      story: ['The Norns sit at the root of the Tree. When it burned, their loom burned too. Now the threads tangle.', 'Rebirth at the Heart is a gift and a price. Ask me which.', 'Hel’s hall is called Eljudnir. Its plate is Hunger, its knife is Famine. I have eaten there.'],
      advice: ['Pierce the big ones. Brandish the crowds.', 'Do not trust prophecy. Trust your shield-mate.', 'Rest between fights. Old men and wise men both do.'],
      joke: ['What is worse than living three times? Paying taxes three times.', 'Thor cursed me, Odin blessed me. Neither of them tipped.', 'I once lost a duel to a goat. First life. Long story.'],
      praise: ['You are kind. The Ash needs more of that.', 'Hm. I will remember that. Somewhere.', 'Thank you, friend.'],
      insult: ['I have been cursed by a god. You are adorable.', 'Hah. Fair.', 'I have heard it said better, in my second life.'],
      farewell: ['Go well. May your thread run long.', 'Until the next verse.', 'I will be here. I am always somewhere.'],
      order: ['As you say.', 'It will be done.', 'Very well.'],
      unknown: ['Hm. That was not in any song I know.', 'Say it again, friend.', 'The meaning escapes me. Like most things, eventually.'],
    } },

  { id: 'signy', name: 'Signý', title: 'Rime-Eye', cls: 'wolfhunter', gender: 'f', hair: '#e8e2d6', hairStyle: 'long', role: 'ranged', minLv: 30,
    blurb: 'Ragna’s niece from Rimeshore, one eye clouded white by frost. Huginn chose her on the ice. She never misses twice.',
    persona: {
      voice: 'Dry, sardonic, patient. Speaks softly and bets on everything. Hunter’s calm.',
      quirks: 'Talks to Huginn like a rude old uncle. Bets on shots (always wins). Cannot stand noise.',
      background: 'Grew up on the frozen sea at Rimeshore, fishing through the ice beside her aunt Ragna. The night the Drowned Jarl’s crew rose, frost took her left eye; a raven landed on her bow the next morning and refused to leave. Ragna says it is Huginn. Signý says it is a nuisance.',
      act: 'Round 3: Rimeshore and the Drowned Jarl. Act II: Odin’s ravens and what the Wanderer is not telling anyone.',
      likes: 'Silence, clean shots, cold mornings, winning.', dislikes: 'Loud people (Hrafnkel), missing, being fussed over.' },
    build: { dex: 4, agi: 3, luk: 1, int: 1 }, weapon: 'bow', shield: null,
    skills: [['owls_eye', 5], ['vultures_eye', 5], ['double_strafe', 10], ['concentration', 5], ['arrow_shower', 5], ['owls_eye', 10], ['vultures_eye', 9],
      ['blitz_beat', 3], ['beast_bane', 5], ['detect', 2], ['ankle_snare', 3], ['blitz_beat', 5], ['beast_bane', 10], ['freezing_trap', 3], ['blast_mine', 3], ['detect', 4]],
    barks: {
      boss_seen: ['{subject}. Big target. Hard to miss. You would still manage.', 'Huginn, wake up. Work to do.', 'Spread out. I want clear lines.', 'Ten zeny says I land the last arrow.', 'Oh good. Something that holds still long enough.'],
      low_hp: ['{subject}, you are soaking up too much. Step out.', 'Someone keep {subject} alive. I am busy aiming.', '{subject}. Back. Now.', 'Cover {subject}! I have eyes on it.', '{subject} is flagging. Huginn, go.'],
      low_hp_self: ['They found me. Annoying.', 'Heal, please. Quietly.', 'Hm. That was not supposed to reach me.', 'Falling back. Somebody block.', 'I bleed like anyone. Do not tell Ragna.'],
      ally_down: ['{subject} is down. Get them clear, I will cover.', 'Tch. {subject}. Huginn, keep them off.', 'Nobody touches {subject}. I have arrows for everyone.', '{subject} fell. Somebody who can lift, lift.', 'Down. Moving. Covering. Go.'],
      level_up: ['Nice, {subject}. Still slower than me.', '{subject} improves. I will adjust my bets.', 'Hm. Good one, {subject}.', 'Look at that, {subject}. Almost impressive.', '{subject} levels up. Huginn is unimpressed. I am a little.'],
      level_up_self: ['Steadier hands. Good.', 'Clearer shot. Even with one eye.', 'Huginn thinks I am getting better. He is wrong. I was already good.', 'Hm. More reach.', 'Better. Keep it quiet.'],
      quest_done: ['Done. Can we go somewhere quiet?', 'Tidy. I like tidy.', '{subject} is finished. I win the bet.', 'Good. Next.', 'Hm. That went well. Suspicious.'],
      map_enter: ['{map}. I will find the high ground.', 'Quiet, everyone. Listen first.', 'Huginn, scout. Please. Fine, do not.', 'Lots of cover here. For them too.', 'Eyes up. {map} likes ambushes.'],
      kill_mvp: ['{subject} is down. That was my arrow, for the record.', 'Pay up. I said I would get the last shot.', 'Clean. Mostly.', 'Huginn, you can stop screaming now.', 'Not bad, team. Not bad.'],
      idle: ['Ragna would say we are wasting daylight. There is no daylight. Still.', 'Huginn keeps stealing my bread. Odin should feed his own birds.', 'I can see a draugr three hills away. Want me to bet on it?', 'Too much talking. Not enough hunting.', 'The Drowned Jarl rowed for a year under the ice. I heard him every night.'],
      swap: ['Fine. I will lead. Stay out of my lines.', 'My turn. Quiet, please.', 'Huginn, up. We are working.', 'Eyes on me. Then on them.', 'Right. Let us be efficient.'],
      recruit: ['Signý. I shoot. The raven is not mine, he just follows me.', 'You pay, I aim. Keep the noise down.', 'Ragna said you were worth following. We will see.', 'I never miss twice. Once, sometimes. Not twice.', 'Fine. I am in.'],
      loot_rare: ['{subject}. Nice find. I saw it first.', 'Huginn wants it. He cannot have it.', 'Worth something. Keep it.', 'Hm. Good eyes, whoever spotted that. Me.', 'Lucky. Do not get used to it.'],
    },
    replies: {
      greet: ['Hm. Hello.', 'You are loud. Hello.', 'Hi.'],
      thanks: ['Sure.', 'You owe me a drink. A quiet one.', 'Do not make it a habit to need saving.'],
      how_are_you: ['Cold. I like cold.', 'Fine. Huginn is annoying.', 'Focused.'],
      who_are_you: ['Signý. Ragna’s niece. Rimeshore.', 'A hunter with one good eye and one bad raven.', 'The one who does not miss.'],
      story: ['The sea froze with every longship on it. The Drowned Jarl still rows under the ice.', 'The Wanderer has one eye too. And ravens. Nobody says it out loud.', 'Huginn means Thought. Muninn is Memory. One of them is rude. Guess.'],
      advice: ['Mark the big ones. Then everyone hits harder.', 'Traps in the chokepoints. Then wait.', 'Let them come to you. Always.'],
      joke: ['How many archers does it take to light a brazier? One. I never miss.', 'Huginn told me a joke once. It was about my aim. He is lucky I like him.', 'Hrafnkel.'],
      praise: ['I know.', 'Hm. Thanks.', 'You are not bad either. For a loud one.'],
      insult: ['Missed.', 'Bold, from someone in my range.', 'Hm. Noted. Bet you cannot say it again.'],
      farewell: ['Later.', 'Stay quiet out there.', 'Go. Huginn will find you if you get lost.'],
      order: ['Fine.', 'Understood.', 'On it. Quietly.'],
      unknown: ['What?', 'Speak clearly, or not at all.', 'Huginn did not get that either.'],
    } },

  { id: 'orvar', name: 'Örvar', title: 'Ember-Tongue', cls: 'mage', gender: 'm', hair: '#1d1a1a', hairStyle: 'spiky', role: 'ranged', minLv: 8,
    blurb: 'A bookish young mage from Skaldhaven who lost his master to the Bog Crone. Means to write the saga of the Ash. Talks through every fight.',
    persona: {
      voice: 'Fast, eager, over-educated. Footnotes his own sentences. Brave about fire, terrified of the dark.',
      quirks: 'Scribbles notes mid-fight. Names spells after himself. Corrects people’s rune spellings.',
      background: 'Apprentice to a wandering rune-scholar who went into Mirewell to study the Crone’s wells and did not come out. Örvar found his master’s notebook floating in the black water. He has been finishing it ever since, one chapter per monster.',
      act: 'Round 3: Mirewell and the Bog Crone; Skaldhaven, the skalds and their sagas. He wants to write the ending of the Ash.',
      likes: 'Books, fire, being right, Ketill’s rumours (research), the Salt Hall’s fish stew.', dislikes: 'Darkness, mud, the Bog Crone, people who say "just a mage".' },
    build: { int: 4, dex: 3, vit: 1 }, weapon: 'rod', shield: null,
    skills: [['fire_bolt', 5], ['cold_bolt', 5], ['lightning_bolt', 5], ['soul_strike', 3], ['frost_diver', 3], ['fire_bolt', 10], ['cold_bolt', 10], ['lightning_bolt', 10], ['thunderstorm', 5], ['sp_recovery', 5], ['soul_strike', 10], ['thunderstorm', 10], ['frost_diver', 10], ['sp_recovery', 10]],
    barks: {
      boss_seen: ['{subject}! Chapter nine! No, ten! I need a new notebook!', 'Oh, oh, fascinating, and also terrifying.', 'Everyone, its weakness is… probably fire. Most things, probably fire.', 'I will cover you from back here. Far back here.', 'This is going to make an excellent footnote. If we live.'],
      low_hp: ['{subject}! You are losing a worrying amount of red!', 'Retreat, {subject}! Tactically! It is in all the sagas!', 'Someone, heal {subject}, my spells only set things on fire!', '{subject}, I would prefer you alive, for the book.', 'Hang on, {subject}! I am, er, providing moral support!'],
      low_hp_self: ['Ow! That was not in the notes!', 'I am hit! I am writing that down! I am bleeding on the page!', 'Help! A mage should not be in melee range! Why am I in melee range?', 'Heal, please, heal, heal!', 'This is how the tragic mage dies in chapter three. Not me! Not me.'],
      ally_down: ['{subject} fell! No, no, that is the wrong chapter!', 'Get {subject} up! I will… burn something! Everything!', 'Oh no. Oh no. {subject}!', 'Nobody else is allowed to die, that is a rule now!', 'I will not write that down. Get up, {subject}!'],
      level_up: ['{subject} levelled! I will note it in the margins!', 'Excellent, {subject}! Character development!', 'Look at {subject}, practically a saga hero now.', 'Oh well done, {subject}. Truly.', '{subject} grows stronger. The narrative approves.'],
      level_up_self: ['Stronger! My master would be… well. He would be here, ideally.', 'I can feel the runes clearer! Brilliant!', 'New spells soon! I have names picked out!', 'Örvar’s Improvement. Chapter eleven.', 'Ha! More power! Responsibly used! Mostly!'],
      quest_done: ['That is a chapter done! A good one, too.', '{subject}: complete. Footnote: we were magnificent.', 'Oh, I love a tidy ending.', 'Ketill will want to hear this. I will tell it better.', 'Done! Onward! Carefully!'],
      map_enter: ['{map}! I have read about this! Mostly the scary parts.', 'Is it dark in there? It looks dark in there.', 'Oh, the rune-work on these stones, look!', 'Right. {map}. Chapter something. I lost count.', 'I will light the way. With fire. Obviously.'],
      kill_mvp: ['{subject} is dead! That is the climax! Of this chapter!', 'We did it! I will make us sound taller in the book.', 'Magnificent. Truly. I got most of it down.', 'The saga writes itself! Well, I write it. It helps.', 'My master would have loved this. I will read it to him. At the well.'],
      idle: ['Did you know the word "Ash" has four runes and three meanings? Well. Now you do.', 'I am on chapter twelve. You are in all of them.', 'The Bog Crone fed the hungry. Then fed on them. The saga needs both halves.', 'If anyone needs a fire lit, I am, as it happens, extremely qualified.', 'Ketill says he tells the truth, with seasoning. I do too.'],
      swap: ['Me? Leading? Oh. Oh! Right! Forward! Carefully!', 'The narrator takes the stage!', 'Let us see how the mage handles the front. Badly, probably.', 'Right, right. Fire first, questions later.', 'Chapter: in which Örvar leads.'],
      recruit: ['Örvar! Mage, scholar, future author of the definitive saga of the Ash!', 'I will set things on fire for you. And write about it.', 'Please avoid dying, it makes for a sad ending.', 'My master went into Mirewell and never came out. I intend to come out of everywhere.', 'Oh, a real adventure! Let me find a pen.'],
      loot_rare: ['{subject}! Oh, I must describe it properly.', 'Look at the rune-work on that!', 'Treasure! Chapter bonus!', 'That is going in the appendix.', 'Oh, keep it, keep it, it is historically significant!'],
    },
    replies: {
      greet: ['Hello! Oh, you are in chapter four, did you know?', 'Hi! I was just writing about you.', 'Greetings! Formally!'],
      thanks: ['Oh, you are welcome! I will note your gratitude.', 'Anytime! Well, most times.', 'It was nothing. It was magnificent, but nothing.'],
      how_are_you: ['Nervous, excited, slightly on fire. Normal.', 'Very well! My ink is holding up.', 'Tired. Inspired. Mostly inspired.'],
      who_are_you: ['Örvar Ember-Tongue! Mage and saga-writer.', 'A scholar’s apprentice. The scholar is… missing. In Mirewell.', 'The person who will make you famous. In writing.'],
      story: ['The Bog Crone was a healer before the Ash. The saga has to say that. It matters.', 'The skalds of Skaldhaven sing the old sagas. I want to write the new one.', 'The Ashen King wanted the fire to mean something. So do I. Differently.'],
      advice: ['Fire for the undead and the wooden, water for the burning, wind for the wet. Mostly.', 'Stand where I cannot accidentally set you on fire.', 'Read before you fight. Or at least let me read.'],
      joke: ['Why did the rune-scholar cross the bridge? To get to the other citation.', 'A mage, a monk and a priest walk into the Salt Hall. The mage sets it on fire. It is a very short joke.', 'I told a draugr a joke. It was dead silent.'],
      praise: ['Oh! Oh, thank you! I will quote you.', 'Really? Can I write that down?', 'You are too kind. Continue.'],
      insult: ['That is going in the villain’s dialogue.', 'Rude! Noted! Footnoted!', 'I have been called worse by footnotes.'],
      farewell: ['Farewell! Come back for the next chapter!', 'Safe travels! Take notes!', 'Goodbye! Try to be dramatic about it.'],
      order: ['Yes! Right! Doing it!', 'Excellent plan! Doing it!', 'Of course! Er, how exactly? Never mind, doing it!'],
      unknown: ['Hmm, could you rephrase? For the record?', 'I… am not sure what that means. Fascinating.', 'Is that a rune? It sounded like a rune.'],
    } },
];
// The same companions by id (the UI may read either).
const COMPANION_BY_ID = {}; for (const c of COMPANIONS_DATA) COMPANION_BY_ID[c.id] = c;

/* Chat intents for the offline reply picker (js/squad-chat.js, relay team): the first intent whose pattern matches
   the player's message picks a companion's replies[intent]. 'order' matches the order keywords the chat also turns
   into squadOrder calls (focus boss / hold / follow / defensive ...). Anything else is 'unknown'. */
const SQUAD_INTENTS = [
  ['order', /\b(focus|target|attack|kill|hold|stay|wait|follow|come|regroup|defen[cs]ive|aggressive|passive|stance|guard|retreat|fall back|nearest|boss)\b/i],
  ['greet', /\b(hi|hello|hey|hail|greetings|good (morning|evening|day)|yo)\b/i],
  ['thanks', /\b(thanks?|thank you|cheers|ty|grateful)\b/i],
  ['how_are_you', /\b(how are you|how('| a)re you|you ok|you alright|how do you feel|feeling)\b/i],
  ['who_are_you', /\b(who are you|your name|about you|tell me about yourself|where are you from)\b/i],
  ['story', /\b(story|lore|history|tell me about|what happened|legend|saga|ashen king|hel|fenrir|odin|norns|tree|yggdrasil)\b/i],
  ['advice', /\b(advice|tip|what should|how do (i|we)|help me|strategy|plan)\b/i],
  ['joke', /\b(joke|funny|laugh|make me laugh)\b/i],
  ['praise', /\b(good job|well done|great|awesome|nice|amazing|brave|love you|you rock|impressive)\b/i],
  ['insult', /\b(stupid|idiot|useless|shut up|bad|terrible|hate you|worst)\b/i],
  ['farewell', /\b(bye|goodbye|farewell|see you|later|good night)\b/i],
];
// Order keywords the offline chat maps to squadOrder (js/squad.js squadParseOrder does the mapping).
const SQUAD_ORDER_WORDS = {
  stance: { aggressive: /\b(aggressive|attack everything|go wild|all out)\b/i, defensive: /\b(defen[cs]ive|careful|guard)\b/i, passive: /\b(passive|no fighting|stand down|don'?t attack)\b/i },
  focus: { boss: /\b(focus (the )?boss|kill the boss|boss first)\b/i, target: /\b(focus (my )?target|attack my target|assist|help me)\b/i, nearest: /\b(nearest|closest)\b/i },
  hold: /\b(hold|stay|wait here|stop)\b/i, follow: /\b(follow|come|regroup|with me|fall back|retreat)\b/i,
};

/* ---------- Hróðný, Keeper of the Bench (Emberhold): the recruiter ----------
   The Unkindled who are not you gather on the old mead-bench beside the Waystone; Hróðný keeps the roll and takes a
   fee to send for them. Her dialog lists "Recruit <Name> (<fee>z)", "Dismiss <Name>" and "Farewell" (the UI's recruit
   panel, js/ui.js DLG_PANELS, matches those option texts). talkRecruiter() is in js/squad.js. */
Object.assign(NPCS, {
  hrodny: { map: 'emberhold', name: 'Hróðný', title: 'Keeper of the Bench', x: 14.5, y: 20.5, dir: 1,
    look: { body: '#6a4a3a', trim: '#e0b060', legs: '#3a2a20', skin: '#e8c8a8', hair: '#c8b8a0', robe: true, weapon: 'none', scale: 0.96 },
    dname: 'Hróðný, Keeper of the Bench', talk: () => (typeof talkRecruiter === 'function' ? talkRecruiter() : say('Hróðný', ['The bench is empty today.'])),
    greet: 'Sit, if you like. Everyone on this bench is waiting for someone worth following.', talkLabel: 'The Bench' },
});
if (typeof LORE !== 'undefined') LORE.bench = ['The Bench', 'An old mead-bench by Emberhold’s Waystone, scarred by a hundred knives. The Unkindled who wake without a road sit there until someone gives them one. Hróðný keeps the roll: who they were, what they can do, what they are running from.'];

// Leaf of Yggdrasil: raises a fallen companion (Hróðný sells them; the Deep and the bosses may drop them later).
use_('ygg_leaf', 'Leaf of Yggdrasil', { effect: 'revive', price: 1500, icon: 'wing', color: '#7ac070', desc: 'Raises a fallen companion with half of their HP. A green leaf from the one branch of the Tree that did not burn. Hróðný in Emberhold sells them.' });

/* Chat relay keys (js/squad-chat.js reads barks[key] for typed replies and order acknowledgements too): copy each
   companion's replies into those keys. low_hp_other is the relay's name for 'low_hp' (said about someone else). */
for (const c of COMPANIONS_DATA) {
  const r = c.replies, b = c.barks;
  Object.assign(b, { greet: r.greet, how: r.how_are_you, thanks: r.thanks.concat(r.praise), joke: r.joke, chat: r.unknown.concat(r.who_are_you, r.story, r.advice), farewell: r.farewell, low_hp_other: b.low_hp });
  for (const k of ['ack_hold', 'ack_follow', 'ack_passive', 'ack_aggressive', 'ack_defensive', 'ack_focus_boss', 'ack_focus', 'ack_free']) b[k] = r.order;
}

/* =========================================================
   Leftovers round (round 10): companion potions and the eight personal quests.
   ========================================================= */
/* Potions (js/squad.js squadPotion): an AI-controlled hero drinks from the shared bag when its HP falls under the
   stance's threshold in a fight, picks the smallest tier that covers what it is missing (else the biggest it may use),
   waits `cd` seconds between two, and never takes the bag below its `reserve` of any potion (tactics: potions
   'auto'|'off', reserve N, default 3; saved per hero). Tiers: plain healing potions only, weakest first. */
const SQUAD_POTIONS = {
  tiers: ['red_potion', 'orange_potion', 'yellow_potion', 'white_potion', 'honey_mead', 'gjoll_draught'],
  thr: { aggressive: 0.30, defensive: 0.35, passive: 0.45 },   // drink under this share of Max HP (passive: earlier)
  fill: 0.7,     // aim for this share of Max HP; a tier counts as enough when it heals 3/4 of the gap
  cd: 3,         // seconds between two potions of the same hero
  reserve: 3,    // default: leave at least this many of each potion in the bag
};

/* Personal quests: one per companion (quest ids sq_<companion>, kind 'squad', no NPC giver; js/squad.js offers and
   closes them). Each entry:
     unlock  { lvl, mins, now }: offered once your own hero is Base Lv `lvl` or more AND the companion has been in the
             party for `mins` minutes (saved: P.flags.squadQ[id].bond), or after 90 s together from Base Lv `now`. Declining
             ("Not now") asks again after 5 more minutes together.
     bark    { offer, done }: the companion's line in the chat log when they bring it up and when it is done.
     offer / progress / done: dialog pages (the companion speaks). Dismissing the companion pauses the quest (its
             progress is kept in P.flags.squadQ[id].stash) until they rejoin.
     reward  { title } (TITLES below) + perk { name, icon, bonus }: a permanent buff on that companion (stat bonus). */
const SQUAD_QUESTS = {
  hrafnkel: { id: 'sq_hrafnkel', name: 'A Wedge for the Hammer', area: 'Ashen Fields · the Wolf Den · Emberhold', unlock: { lvl: 12, mins: 6, now: 18 },
    summary: 'Hrafnkel wants the Den-Mother’s fang for the wedge of the hammer he means to forge, and his uncle Brokkr to see it.',
    bark: { offer: 'Cousin! I have had an idea. It involves wolves, and a hammer, and very probably bats.', done: 'Uncle Brokkr looked at the wedge for a whole minute. He did not say it was wrong. That is a hug, from him.' },
    offer: ['Cousin, every smith in my family makes one hammer that is only theirs. Uncle Brokkr made his from a star. I have nothing. Yet.',
      'The old wolf in the den past Grimsfield, the Den-Mother. A fang like hers would make a wedge that never works loose. There are bats in there. I do not want to talk about the bats.'],
    progress: 'The Den-Mother, deep in the Wolf Den (south-east of the Ashen Fields), then Brokkr’s forge-house in Emberhold.',
    done: ['<i>Brokkr turns the fang over in his burnt fingers, grunts, and sets it on the anvil beside his own hammer.</i>', 'He says it is “not bad”. Cousin, he has never said that to anyone. I am going to eat something enormous to celebrate.'],
    obj: [{ type: 'reach', map: 'ashen_fields_cave_wolfden', text: 'Go into the Wolf Den with Hrafnkel (mind the bats)' },
      { type: 'kill', mob: 'den_mother', n: 1, text: 'Kill the Den-Mother' },
      { type: 'reach', map: 'emberhold_smithy', text: 'Bring the fang to Brokkr’s forge-house in Emberhold' }],
    reward: { title: 'hammer_friend' }, perk: { name: 'Den-Fang Wedge', icon: 'endure', bonus: { vit: 3, def: 5 } } },
  eydis: { id: 'sq_eydis', name: 'Ashes and Barley', area: 'Ashen Fields · Freyr’s shrine · the Ember Chapel', unlock: { lvl: 10, mins: 6, now: 16 },
    summary: 'Eydís wants to clean the blight from her family’s old fields, pray at Freyr’s shrine and light a candle for them in the Ember Chapel.',
    bark: { offer: 'Um. Could I ask you something? It is only small. Sorry. It is not small, actually.', done: 'I wrote their names in the chapel book. Sigrun says a name that is written down is a name that is kept.' },
    offer: ['My family farmed the fields east of Gunnar’s. The blight came up through the barley and took the rest. I never went back. I am sorry, I am not good at this part.',
      'If we cleared some of the blight porings, and I could say the harvest prayer at Freyr’s shrine, and light a candle in the new chapel… I think I could stop dreaming about it.'],
    progress: 'Blight porings on the Ashen Fields, Freyr’s wayside shrine in the south, then a candle in the Ember Chapel in Emberhold.',
    done: ['<i>Eydís sets a small candle among the others and whispers four names. Her hands have stopped shaking.</i>', 'Thank you. Truly. I feel… lighter. I think I will heal better for it, too. Is that silly? It is not silly.'],
    obj: [{ type: 'kill', mob: 'blight_poring', n: 8, text: 'Clear 8 Blight Porings from the Ashen Fields' },
      { type: 'inspect', map: 'ashen_fields', place: 'Freyr’s shrine', r: 2.4, spots: [{ x: 46.5, y: 71.5, name: 'Freyr’s Shrine', text: ['<i>Eydís kneels and says the harvest prayer, badly, then again, properly. A few green shoots stand in the ash at the foot of the stone.</i>'] }] },
      { type: 'reach', map: 'emberhold_temple', text: 'Light a candle for her family in the Ember Chapel (Emberhold)' }],
    reward: { title: 'small_flame' }, perk: { name: 'Freyr’s Blessing', icon: 'blessing', bonus: { int: 3, maxsp: 40 } } },
  orvar: { id: 'sq_orvar', name: 'The Barrow Chapter', area: 'Withered Wood · the Old Barrow · Skaldhaven', unlock: { lvl: 20, mins: 8, now: 26 },
    summary: 'Örvar’s master left a blank chapter headed “The Barrow-King”. He wants to see Hrothgar Bear-Arm fall and read the chapter in the Salt Hall.',
    bark: { offer: 'I have found a blank page in my master’s notebook. Footnote: blank pages are the most dangerous kind.', done: 'They applauded. In the Salt Hall. The skalds. Someone wrote it down! Footnote: I am not crying, it is the smoke.' },
    offer: ['My master’s notebook has a chapter heading and nothing under it: “The Barrow-King, who will not lie down.” The Old Barrow, in the south of the Withered Wood.',
      'I need to see him. Hrothgar Bear-Arm, the wight they buried with his axe. Then I read the chapter aloud in the Salt Hall, where sagas are judged. It is very dark in a barrow, is it not? Never mind. Fire. I have fire.'],
    progress: 'The Old Barrow in the Withered Wood, Hrothgar Bear-Arm, then the Salt Hall in Skaldhaven.',
    done: ['<i>Örvar reads for a quarter of an hour. The skalds bang their cups at the part where the axe breaks.</i>', 'Chapter finished. My master would have corrected my spelling of “Hrothgar”. I left it wrong on purpose, so there is something of his in it.'],
    obj: [{ type: 'reach', map: 'withered_wood_cave_barrow', text: 'Go into the Old Barrow (Withered Wood)' },
      { type: 'kill', mob: 'barrow_wight', n: 1, text: 'Defeat Hrothgar Bear-Arm while Örvar takes notes' },
      { type: 'reach', map: 'skaldhaven_salthall', text: 'Hear Örvar read the chapter in the Salt Hall (Skaldhaven)' }],
    reward: { title: 'chapter_worthy' }, perk: { name: 'The Master’s Notebook', icon: 'fire_bolt', bonus: { matk: 12, dex: 2 } } },
  bera: { id: 'sq_bera', name: 'The Knotted Cord', area: 'Gloamheim Keep · the library · Tyr’s Chapel', unlock: { lvl: 30, mins: 10, now: 36 },
    summary: 'Bera’s cord carries one knot she never untied: her oath to Sir Gaunt. She wants his roll of oaths, the rest of his sworn dead, and Tyr’s chapel.',
    bark: { offer: 'Oath-friend. One knot on this cord is older than the others. It is time I dealt with it.', done: 'Thirty-one knots. Thirty-one kept. The cord is lighter by one, and so am I.' },
    offer: ['Thirty-two knots. One for every promise. This one is the oath I swore to Sir Gaunt, and I never untied it when I left him.',
      'His roll of oaths is in the library behind the throne hall. His men are still on their posts in the new wings, dead, keeping his word for him. We free ten of them. Then Tyr’s chapel in the barracks, where a knot can be undone properly.'],
    progress: 'Sir Gaunt’s library, ten of the keep’s sworn dead, then Tyr’s Chapel in the Barracks wing of Gloamheim Keep.',
    done: ['<i>Bera kneels at Tyr’s altar, unpicks the oldest knot with her teeth and lays the loose cord on the stone.</i>', 'An oath that eats the people it guards is no oath. I say it here so Tyr hears it. You heard it too, oath-friend. That makes two witnesses. Enough.'],
    obj: [{ type: 'reach', map: 'gloamheim_library', text: 'Find Sir Gaunt’s roll of oaths in his library (Gloamheim Keep)' },
      { type: 'kill', mob: ['skeleton_soldier', 'rust_knight'], n: 10, text: 'Free 10 of the keep’s sworn dead (Skeleton Soldiers, Rust Knights)' },
      { type: 'inspect', map: 'gloamheim', place: 'Tyr’s chapel', r: 2.6, spots: [{ x: 72.5, y: 40.5, name: 'Tyr’s Chapel', text: ['<i>A one-handed god carved in black oak. Bera sets the roll of oaths at its feet and counts under her breath, all the way to thirty-two.</i>'] }] }],
    reward: { title: 'oath_friend' }, perk: { name: 'The Untied Knot', icon: 'auto_guard', bonus: { def: 6, maxhpPct: 4 } } },
  saemund: { id: 'sq_saemund', name: 'What Was Left Undone', area: 'Gloamheim Keep · the crypt · the Lower Cells', unlock: { lvl: 30, mins: 10, now: 36 },
    summary: 'Sæmund thinks the thing he left undone is in Gloamheim: the caravan guards he died beside were buried in the keep’s crypt, and one was never buried at all.',
    bark: { offer: 'I think I have remembered what the Grey Lady sent me back for. Unhurried, mind. It has waited this long.', done: 'Done, I think. Ah. No knock at the door. Móðguðr will have to find another reason to argue with me.' },
    offer: ['The caravan I died for was going to Gloamheim. The guards who fell beside me were carried there and laid in the crypt. All but one. Ketil the Younger. He was nineteen.',
      'Walk the crypt with me, give a few restless ones their rest, and then we look for Ketil where the keep kept its prisoners. The Lower Cells. Slowly. The dead are not going anywhere.'],
    progress: 'The Crypt of Gloamheim, six wraiths laid to rest, then the Lower Cells in the keep’s new wing.',
    done: ['<i>In the last cell, a name scratched into the wall at the height of a young man’s shoulder. Sæmund traces it, and says the rite for the unburied, in tune for once.</i>', 'Ketil. There you are. Sorry I was late, lad. I had to die first.'],
    obj: [{ type: 'reach', map: 'gloamheim_crypt', text: 'Walk the Crypt of Gloamheim with Sæmund' },
      { type: 'kill', mob: 'wraith', n: 6, text: 'Lay 6 Wraiths to rest' },
      { type: 'inspect', map: 'gloamheim', place: 'the Lower Cells', r: 2.6, spots: [{ x: 34.5, y: 64.5, name: 'The Lower Cells', text: ['<i>Rows of cells, doors rusted open. Sæmund reads every name scratched into the stone, and greets each one.</i>'] }] }],
    reward: { title: 'grave_tender' }, perk: { name: 'Unfinished Business', icon: 'magnificat', bonus: { mdef: 6, int: 2 } } },
  kolbrun: { id: 'sq_kolbrun', name: 'Hati’s Get', area: 'Rimeshore · Gloamheim Keep, the drill hall', unlock: { lvl: 32, mins: 10, now: 38 },
    summary: 'Kolbrún bet an old soldier’s ghost in the keep’s drill hall that she could kill a dozen of Hati’s white get before he finished his drill. She means to collect.',
    bark: { offer: 'I made a bet. Twelve wolves. You are in it now. You are welcome.', done: 'Twelve. He owes me a drink. He is dead, so I will drink it for him.' },
    offer: ['Snow wolves on the Rimeshore ice. Hati’s get. The same white fur that came through Valhalla’s gate. Twelve of them.',
      'Then the drill hall in Gloamheim’s barracks. There is a dead drill-master there who says no einherjar ever outran his count. I say he counts slow.'],
    progress: 'Twelve Snow Wolves in Rimeshore, then the drill hall in the Barracks wing of Gloamheim Keep.',
    done: ['<i>Kolbrún drops twelve white tails on the drill-hall floor and cracks her knuckles at the empty air. Somewhere a cold voice stops counting.</i>', 'Score: me twelve, wolves nothing. That is how it should always read.'],
    obj: [{ type: 'kill', mob: 'snow_wolf', n: 12, text: 'Kill 12 Snow Wolves in Rimeshore' },
      { type: 'inspect', map: 'gloamheim', place: 'the drill hall', r: 2.6, spots: [{ x: 69.5, y: 13.5, name: 'The Drill Hall', text: ['<i>Straw targets, a rack of practice spears, a chalk tally on the wall that stops at forty. Kolbrún adds twelve strokes under it.</i>'] }] }],
    reward: { title: 'wolf_breaker' }, perk: { name: 'Gate-Holder’s Fists', icon: 'summon_sphere', bonus: { aspd: 4, crit: 3 } } },
  signy: { id: 'sq_signy', name: 'The Helmsman’s Debt', area: 'Rimeshore · Njörðr’s altar · the Ice Cave · the Ormsvín', unlock: { lvl: 34, mins: 10, now: 40 },
    summary: 'The Frozen Helmsman steered the Drowned Jarl’s ship the night frost took Signý’s eye. She wants to settle it, properly, the Rimeshore way.',
    bark: { offer: 'Huginn has been staring at the Singing Berg for three days. So have I. Want to bet on why?', done: 'Paid. Huginn says I should feel better. Huginn is a bird.' },
    offer: ['The Jarl’s helmsman did not drown with the rest. He froze at his oar and walked into the berg. Ragna saw him. I did not. I had other things on my face.',
      'First an offering at Njörðr’s altar in the south, so the sea knows it is not personal. Then the Ice Cave. Then the Ormsvín, to give his torc back to the ship he left.'],
    progress: 'Njörðr’s altar on the south shore, the Frozen Helmsman in the Ice Cave, then the frozen ship Ormsvín.',
    done: ['<i>Signý lays the helmsman’s torc on the Ormsvín’s steering oar, looks at it with her good eye for a long moment, and walks away without looking back.</i>', 'Ship, helmsman, debt. All in one place now. Huginn, stop that.'],
    obj: [{ type: 'inspect', map: 'rimeshore', place: 'Njörðr’s altar', r: 2.6, spots: [{ x: 12.5, y: 83.5, name: 'Njörðr’s Altar', text: ['<i>Signý pours a measure of ale on the salt-white stone and says nothing at all. The raven on her bow bows its head.</i>'] }] },
      { type: 'kill', mob: 'frozen_helmsman', n: 1, text: 'Kill the Frozen Helmsman in the Ice Cave' },
      { type: 'inspect', map: 'rimeshore', place: 'the Ormsvín', r: 2.5, spots: [{ x: 77.5, y: 46.5, name: 'The Ormsvín', text: ['<i>The frozen longship creaks as the torc touches the oar, as if something on board had been waiting for it.</i>'] }] }],
    reward: { title: 'rime_sighted' }, perk: { name: 'Raven’s Eye', icon: 'double_strafe', bonus: { dex: 3, hit: 8 } } },
  starkad: { id: 'sq_starkad', name: 'The Third Thread', area: 'Ashen Fields, Grimsfield · Nidavellir Deep, the Hall of Ancestors', unlock: { lvl: 44, mins: 10, now: 50 },
    summary: 'Starkad remembers two deaths: one on a field of ash, one in a dwarf-king’s hall. He wants to stand in both places while he still has a third life to do it with.',
    bark: { offer: 'Last time, I never went back to the places I died. This time I would like to. Will you walk with an old ghost?', done: 'Two graves visited. The third is not dug yet. Good. Let it wait a long while.' },
    offer: ['In my first life I fell at a place like Grimsfield, in the south of the Ashen Fields. I remember the crows. I think it was Grimsfield.',
      'In my second, I served a king of the Dvergar, and died in his hall with his dead around me. The Hall of Ancestors, in Nidavellir, under the Deep Mines. His guard still walks there. We will let them rest first.'],
    progress: 'Grimsfield in the Ashen Fields, ten dwarf revenants in Nidavellir Deep, then the Hall of Ancestors.',
    done: ['<i>Among the carved kings Starkad stops before one with a broken nose and a spear across his knees, and bows the way the old sagas say men bowed.</i>', 'He looks like the man I died for. Perhaps he is. This time I will choose who I die for. Perhaps no one. That would be new.'],
    obj: [{ type: 'inspect', map: 'ashen_fields', place: 'Grimsfield', r: 2.6, spots: [{ x: 66.5, y: 84.5, name: 'Grimsfield', text: ['<i>Rusted blades in the ash, and crows. Starkad touches the scar over his heart and hums three bars of a lay no one else remembers.</i>'] }] },
      { type: 'kill', mob: 'dwarf_revenant', n: 10, text: 'Lay 10 Dwarf Revenants to rest (Nidavellir Deep)' },
      { type: 'inspect', map: 'nidavellir', place: 'the Hall of Ancestors', r: 2.6, spots: [{ x: 48.5, y: 73.5, name: 'The Hall of Ancestors', text: ['<i>Pillars of dwarf-kings in carved stone, each with his hands on his weapon. Dust lies thick on all of them but one.</i>'] }] }],
    reward: { title: 'thrice_remembered' }, perk: { name: 'The Third Thread', icon: 'brandish_spear', bonus: { atk: 10, hit: 5 } } },
};
Object.assign(TITLES, { hammer_friend: 'Hammer-Friend', small_flame: 'Keeper of the Small Flame', chapter_worthy: 'Worthy of a Chapter', oath_friend: 'Oath-Friend',
  grave_tender: 'Grave-Tender', wolf_breaker: 'Wolf-Breaker', rime_sighted: 'Rime-Sighted', thrice_remembered: 'Thrice-Remembered' });
// Registered like any quest (docs/CONTENT.md, "Add a quest"): no NPC giver and no turn-in (they complete when the last
// objective is done); `req.test` is true only while the companion is offering it (squadQuestOffering in js/squad.js).
for (const cid in SQUAD_QUESTS) {
  const Q = SQUAD_QUESTS[cid];
  quest(Q.id, { giver: null, turnIn: null, kind: 'squad', squad: cid, seq: true, name: Q.name, area: Q.area, summary: Q.summary, offer: Q.offer, progress: Q.progress, done: Q.done, obj: Q.obj, reward: Q.reward,
    req: { test: () => typeof squadQuestOffering === 'function' && squadQuestOffering(Q.id) } });
}
