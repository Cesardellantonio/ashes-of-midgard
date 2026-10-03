'use strict';
/* =========================================================
   Tutorial: the first 30 minutes (owned by O1, design/onboarding.md). Loaded after js/data/interiors.js, before
   js/core.js: everything here that touches the game runs later, from the update loop (tutorialTick, called by
   core.js update) and from the 'aom-tut' window events core.js / action.js send (tutEvent).

   The flow is a quest chain, tut_1 .. tut_8 (kind 'tutorial', auto, completes by itself), one quest per step:
     1 Waking at the Waystone   move, turn and zoom the camera, jump the fallen log, speak with Sigrun
     2 The Training Yard        lock on, a three-hit combo, a heavy blow, dodge / block / parry a dummy's swing, a skill
                                on U, a potion on 1 (the yard: Emberhold's east orchard, js/data/maps.js; the dummies:
                                MOBS.training_dummy below, their behaviour: dummyTick in js/core.js)
     3 The First Real Fight     three Blight Porings and a Young Ash Wolf jump you on the Ashen Fields road
     4 A Path of Your Own       Job Lv 10, Basic Skill 9, then Vidar's job change (the existing flow)
     5 Someone to Follow        one free companion from Hróðný's bench (a short list matched to your class), swap,
                                Tactics, squad chat
     6 The Last Hearth          go in, meet Ragnhild, sleep in the loft (it saves), read the Tally-Board
     7 The Wolf Den             the Den's Hoard and the Den-Mother (the den is scaled to you while this step runs);
                                reward: a +4 class weapon and the title "First Steps"
     8 What Comes Next          tutWhatsNext(); the main story (main_2 / main_3) is tracked again
   Each step drives the onboarding UI (js/ui.js, O2; every call guarded): tutGoal (one goal line, arrow and minimap
   waypoint), tutPrompt (key glyphs: KEYMAP action ids, or literal labels for keys outside it), tutTip (once per id),
   tutSkipOffer ("I know how to play": steps 1-3 are granted with their rewards, the tutorial goes on at step 4) and
   tutWhatsNext. A beat with no success for TUTORIAL.HINT_AFTER seconds shows one retry hint.

   State (saved): P.flags.tut = { step, done, skipped, auto?, got: { beat: 1 } }. It is created the first time a person
   plays (UI.human, or window.AOM_ONBOARD / AOM_TUT for tests): an existing character (Base Lv > 1, a class, or main_2
   started) is marked { done, skipped, auto } and nothing else changes; test runs that call startGame directly never
   create it, so the tutorial stays out of their way.
   ========================================================= */

/* ---------- Monsters ---------- */
// A straw man on a stake (the Scarecrow Husk's sheet, bleached). Never moves; a slow, telegraphed swing (js/core.js).
variant('training_dummy', 'scarecrow_husk', { name: 'Training Dummy', title: 'Straw and Stubbornness', lvl: 1, hp: 900, atk: [2, 4], def: 0, mdef: 0,
  aggro: false, sight: 3.4, speed: 0, aspd: 3.4, range: 1.8, flee: 0, dummy: true, windup: 1.15, reach: 2.0, drops: [],
  tint: '#efe2b8', scaleMul: 1.05, lore: undefined });
// The ambush on the Ashen Fields road (step 3): a yearling of the Wood's pack, fit for a Novice.
variant('tut_wolf', 'ash_wolf', { name: 'Young Ash Wolf', lvl: 4, hp: 170, atk: [9, 13], def: 2, mdef: 0, aggro: true, sight: 9, speed: 2.9, aspd: 1.6,
  expMul: 2, drops: [['wolf_claw', 0.4], ['red_potion', 0.3]], tint: '#cfc6bc', scaleMul: 0.8 });

if (typeof TITLES !== 'undefined') TITLES.first_steps = 'First Steps';

/* ---------- The chain ---------- */
window.TUTORIAL = (() => {
  const T = { HINT_AFTER: 20, YARD: { map: 'emberhold', x: 45.5, y: 39.5, r: 6.5 }, LOG: { map: 'emberhold', x: 18.5, y: 20.6, r: 2.8 },
    AMBUSH: { map: 'ashen_fields', x: 15.5, y: 32.5, r: 9 }, DEN: 'ashen_fields_cave_wolfden', HEARTH: 'emberhold_tavern',
    rt: { t: 0, beat: null, beatAt: 0, hinted: {}, goalSig: '', skipShown: false, fight: null, lowShown: false, tipT: 0, offered: false, lastMap: null } };
  const ok = () => typeof UI !== 'undefined' && !!(UI.human || (typeof window !== 'undefined' && (window.AOM_ONBOARD || window.AOM_TUT)));
  const call = (fn, ...a) => { const f = typeof window !== 'undefined' ? window[fn] : undefined; if (typeof f !== 'function') return undefined; try { return f(...a); } catch (e) { console.error(e); return undefined; } };
  const key = id => (typeof keyFor === 'function' && keyFor(id)) || id;
  const win = id => (typeof winKey === 'function' && winKey(id)) || '';
  const now = () => (typeof time === 'number' ? time : 0);
  const near = (p, r) => !!P && !!map && map.id === p.map && Math.hypot(P.x - p.x, P.y - p.y) <= (r || p.r || 3);
  const party = () => (typeof PARTY !== 'undefined' && PARTY ? PARTY.members.length : 1);

  // P.flags.tut, created on first use in a person's session (see the header).
  function state() {
    if (typeof P === 'undefined' || !P || !P.flags) return null;
    let s = P.flags.tut;
    if (!s || typeof s !== 'object') {
      if (!ok()) return null;
      const q = P.quests || {}, old = P.lvl > 1 || (P.cls !== 'novice') || !!((q.active && q.active.main_2) || (q.done && q.done.main_2));
      s = P.flags.tut = old ? { step: 0, done: true, skipped: true, auto: true, got: {} } : { step: 1, done: false, skipped: false, got: {} };
    }
    if (!s.got || typeof s.got !== 'object') s.got = {};
    return s;
  }
  const on = () => { const s = state(); return !!s && !s.done && ok(); };
  const at = n => { const s = state(); return !!s && !s.done && s.step === n && ok(); };
  const got = k => !!(P && P.flags && P.flags.tut && P.flags.tut.got && P.flags.tut.got[k]);
  function mark(k) { const s = state(); if (!s || s.got[k]) return false; s.got[k] = 1; T.rt.beat = null; if (typeof UI !== 'undefined') UI.dirty = true; if (typeof questRefresh === 'function') questRefresh(); return true; }

  /* ---------- Quests ---------- */
  const ob = (k, text, extra) => Object.assign({ type: 'cond', text, check: () => got(k) }, extra || {});
  const tq = (n, o) => quest('tut_' + n, Object.assign({ kind: 'tutorial', auto: true, giver: null, turnIn: null, area: 'Emberhold', tut: n, req: { test: () => at(n) } }, o));
  tq(1, { name: 'Waking at the Waystone', summary: 'You woke in the Ash beside Emberhold’s Waystone. Find your feet, then find Sigrun.', seq: true,
    obj: [ob('look', 'Walk, turn the camera and zoom'), ob('log', 'Jump the fallen log by the Waystone'),
      { type: 'talk', npc: 'sigrun', text: 'Speak with Sigrun at the Waystone', check: () => !!P.flags.talked.sigrun }],
    reward: { exp: 60, jexp: 300 } });
  tq(2, { name: 'The Training Yard', summary: 'Straw men in the east orchard. They swing slow and they swing true. Learn to fight on them first.', seq: true,
    obj: [ob('yard', 'Go to the Training Yard (east of the Waystone)'), ob('lock', 'Lock on to a dummy'), ob('combo', 'Land a three-hit combo'), ob('heavy', 'Charge and release a heavy blow'),
      ob('dodge', 'Roll through a dummy’s swing'), ob('block', 'Block a swing'), ob('parry', 'Parry a swing'), ob('skill', 'Use a skill'), ob('potion', 'Drink a potion')],
    reward: { exp: 450, jexp: 1900, items: [['red_potion', 5]] } });
  tq(3, { name: 'The First Real Fight', area: 'Ashen Fields', summary: 'The road east of the gate is not empty. It never is.', seq: true,
    obj: [ob('fields', 'Go out through the East Gate to the Ashen Fields'), ob('fight', 'Survive the ambush on the road')],
    reward: { exp: 550, jexp: 2100, zeny: 300, items: [['red_potion', 5]] } });
  tq(4, { name: 'A Path of Your Own', summary: 'Novices die in the Ash. Learn the basics, then let old Vidar set you on a path.',
    obj: [{ type: 'cond', text: 'Reach Job Lv 10', check: () => P.cls !== 'novice' || P.jlvl >= 10, prog: () => [P.cls !== 'novice' ? 10 : Math.min(10, P.jlvl), 10] },
      { type: 'cond', text: 'Learn Basic Skill to Lv 9', check: () => P.cls !== 'novice' || (P.skills.basic || 0) >= 9, prog: () => [P.cls !== 'novice' ? 9 : Math.min(9, P.skills.basic || 0), 9] },
      { type: 'cond', text: 'Choose a path from Vidar', check: () => P.cls !== 'novice' }],
    reward: { exp: 300 } });
  tq(5, { name: 'Someone to Follow', summary: 'Hróðný keeps the bench by the Waystone. The first one who follows you comes free.',
    obj: [{ type: 'cond', text: 'Take a companion from Hróðný’s bench', check: () => got('recruit') || party() > 1 }, ob('swap', 'Take control of your companion'), ob('tactics', 'Open Tactics'), ob('chat', 'Talk to your squad')],
    reward: { exp: 400, jexp: 300 } });
  tq(6, { name: 'The Last Hearth', summary: 'Emberhold has a tavern, and its fire has never gone out. Go in out of the Ash.',
    obj: [ob('hearth', 'Go into the Last Hearth'), { type: 'cond', text: 'Meet Ragnhild, the Hearth-Keeper', check: () => !!P.flags.talked.hearth_oddny }, ob('rest', 'Sleep in the loft (it saves your game)'), ob('book', 'Read the Tally-Board')],
    reward: { exp: 500, jexp: 400, zeny: 200 } });
  tq(7, { name: 'The Wolf Den', area: 'Ashen Fields · the Wolf Den', summary: 'The wolves under the fields have a mother, and the mother has a hoard.',
    obj: [ob('den', 'Find the Wolf Den (south-east in the Ashen Fields)'), { type: 'cond', text: 'Open the Den’s Hoard', check: () => got('chest') || !!(P.flags.chests && P.flags.chests.wolfden_hoard) },
      { type: 'cond', text: 'Defeat the Den-Mother', check: () => got('mother') || !!(P.flags.kills && P.flags.kills.den_mother) }],
    reward: { exp: 1500, jexp: 1000, title: 'first_steps', items: typeof classWeapon === 'function' && typeof BROKKR_T1 !== 'undefined' ? classWeapon(BROKKR_T1, 4) : [] } });
  tq(8, { name: 'What Comes Next', summary: 'You can stand, fight and choose. The Ash is wide. Here is where to go from here.',
    obj: [ob('next', 'See what comes next')], reward: {} });

  /* ---------- Steps: what to show now ----------
     beat(s) -> { id, goal, prompt, hint, done? } for the current step; goal / prompt go to tutGoal / tutPrompt. */
  const G = (text, m, x, y) => ({ text, map: m, x, y });
  const Pr = (id, text, keys, until) => ({ id, text, keys, until: until || null });
  function exitGoal(text, toMap) {   // a goal on another map: point at the way out of this one
    if (!map) return null;
    if (map.id === 'emberhold') return G(text, 'emberhold', 54.5, 18.5);   // the East Gate
    if (map.id === T.HEARTH) return G(text, T.HEARTH, map.entry.x + 0.5, map.entry.y + 0.5);
    if (map.id === T.DEN && toMap !== T.DEN) return G(text, T.DEN, 24.5, 41.5);
    return null;
  }
  function beat(s) {
    const g = s.got;
    switch (s.step) {
      case 1:
        if (!g.look) return { id: 'look', goal: G('Walk to Sigrun at the Waystone', 'emberhold', 20.5, 17.3), prompt: Pr('tut_move', 'Walk, turn the camera and zoom', ['up', 'left', 'down', 'right', 'camLeft', 'camRight', 'zoom'], 'moved'),
          hint: `Hold ${key('up')} ${key('left')} ${key('down')} ${key('right')} to walk. Tap ${key('camLeft')} or ${key('camRight')} to swing the camera round, ${key('zoom')} to zoom.` };
        if (!g.log) return { id: 'log', goal: G('Jump the fallen log by the Waystone', 'emberhold', T.LOG.x, T.LOG.y), prompt: Pr('tut_jump', 'Jump the log', ['jump'], 'jumped'),
          hint: `Run at the log and press ${key('jump')} as you reach it.` };
        return { id: 'sigrun', goal: G('Speak with Sigrun at the Waystone', 'emberhold', 20.5, 17.3), prompt: Pr('tut_talk', 'Talk to Sigrun', ['interact']), hint: `Walk up to Sigrun and press ${key('interact')}.` };
      case 2: {
        const Y = T.YARD;
        if (!g.yard) return { id: 'yard', goal: G('Go to the Training Yard, east of the Waystone', Y.map, Y.x, Y.y), prompt: null, hint: 'Down the Gate Road to the east, then south past the Smiths’ Row lane. The fenced yard in the orchard.' };
        const yg = G('Train on the dummies in the yard', Y.map, Y.x, Y.y - 1);
        if (!g.lock) return { id: 'lock', goal: yg, prompt: Pr('tut_lock', 'Lock on to a dummy', ['lock'], 'lockOn'), hint: `Stand near a dummy and press ${key('lock')}. Press it again to switch targets, or to let go.` };
        if (!g.combo) return { id: 'combo', goal: yg, prompt: Pr('tut_combo', 'Strike three times for a combo', ['light'], 'comboHit3'), hint: `Get close and press ${key('light')} three times, in a rhythm. The third blow is the heavy one.` };
        if (!g.heavy) return { id: 'heavy', goal: yg, prompt: Pr('tut_heavy', 'Hold to charge a heavy blow, release to strike', ['heavy'], 'heavy'), hint: `Hold ${key('heavy')} until you glow, then let go.` };
        if (!g.dodge) return { id: 'dodge', goal: yg, prompt: Pr('tut_dodge', 'When the ring spreads under you, roll through the swing', ['dodge'], 'dodged'), hint: `Stand by a dummy and stop hitting it. When it shouts and the ring is nearly full, press ${key('dodge')}. While you roll, nothing can touch you.` };
        if (!g.block) return { id: 'block', goal: yg, prompt: Pr('tut_block', 'Hold your guard up as the swing lands', ['block'], 'blocked'), hint: `Face the dummy, hold ${key('block')} and keep holding it until the blow lands. It costs stamina.` };
        if (!g.parry) return { id: 'parry', goal: yg, prompt: Pr('tut_parry', 'Raise your guard just before the blow lands to parry', ['block'], 'parried'), hint: `Let go of ${key('block')}. Wait until the ring is almost full, then press it. Too early and it is only a block.` };
        if (!g.skill) return { id: 'skill', goal: yg, prompt: Pr('tut_skill', 'Use the skill on your first slot', ['skill1'], 'skillUsed'), hint: `Press ${key('skill1')}. Skills cost SP, the blue bar.` };
        return { id: 'potion', goal: yg, prompt: Pr('tut_potion', 'Drink a potion', ['item1'], 'itemUsed'), hint: `Press ${key('item1')}. Potions sit on ${key('item1')} to ${key('item4')}.` };
      }
      case 3: {
        const A = T.AMBUSH;
        if (!g.fields) return { id: 'fields', goal: exitGoal('Out through the East Gate to the Ashen Fields', A.map) || G('Out through the East Gate to the Ashen Fields', 'emberhold', 54.5, 18.5), prompt: null, hint: 'The Gate Road runs east from the Waystone to the East Gate.' };
        if (map && map.id !== A.map) return { id: 'fields_back', goal: exitGoal('Back to the Ashen Fields road', A.map), prompt: null };
        return { id: 'fight', goal: G(T.rt.fight ? 'Survive the ambush' : 'Follow the road east', A.map, A.x, A.y), prompt: null };
      }
      case 4:
        if (P.cls !== 'novice') return { id: 'chosen', goal: null, prompt: null };
        if (P.jlvl < 10) return { id: 'jobexp', goal: G('Hunt in the Ashen Fields until Job Lv 10', 'ashen_fields', T.AMBUSH.x, T.AMBUSH.y), prompt: null };
        if ((P.skills.basic || 0) < 9) return { id: 'basic', goal: null, prompt: Pr('tut_basic', `Spend your skill points on Basic Skill (Skills ${win('skills')})`, [win('skills') || 'Skills']), hint: `Open Skills (${win('skills') || 'Esc, then Skills'}) and put all nine points into Basic Skill.` };
        return { id: 'vidar', goal: map && map.id !== 'emberhold' ? null : G('Speak with Vidar by the broken houses', 'emberhold', 24.5, 12.5), prompt: Pr('tut_vidar', 'Talk to Vidar and choose a path', ['interact']) };
      case 5: {
        if (!(got('recruit') || party() > 1)) return { id: 'bench', goal: map && map.id === 'emberhold' ? G('Ask Hróðný at the bench for a companion', 'emberhold', 14.5, 20.5) : null, prompt: Pr('tut_bench', 'Talk to Hróðný: the first companion is free', ['interact']) };
        if (!g.swap) return { id: 'swap', goal: null, prompt: Pr('tut_swap', 'Take control of your companion', ['F2', '`'], 'swapped'), hint: 'F1 to F4 take control of hero 1 to 4. The ` key (under Esc) cycles through them.' };
        const own = typeof PARTY !== 'undefined' && PARTY ? PARTY.owner : P;
        if (P !== own && !g.back) return { id: 'back', goal: null, prompt: Pr('tut_back', 'Back to yourself', ['F1'], 'swapped') };
        if (!g.tactics) return { id: 'tactics', goal: null, prompt: Pr('tut_tactics', 'Open Tactics to give your squad orders', ['T'], 'tactics'), hint: 'Press T. Tactics sets how each companion fights: who they guard, how far they chase.' };
        return { id: 'chat', goal: null, prompt: Pr('tut_chat', 'Talk to your squad', ['Enter'], 'chatOpened'), hint: 'Press Enter, type, and press Enter again. They answer, mostly politely.' };
      }
      case 6:
        if (!g.hearth && (!map || map.id !== T.HEARTH)) return { id: 'hearth', goal: map && map.id === 'emberhold' ? G('Go into the Last Hearth, north-east of the Waystone', 'emberhold', 29.5, 9.3) : null, prompt: Pr('tut_door', 'Walk to the door and go in', ['interact'], 'doorEntered') };
        if (map && map.id !== T.HEARTH) return { id: 'hearth_back', goal: map.id === 'emberhold' ? G('Back into the Last Hearth', 'emberhold', 29.5, 9.3) : null, prompt: null };
        if (!P.flags.talked.hearth_oddny) return { id: 'barkeep', goal: G('Meet Ragnhild behind the bar', T.HEARTH, 18.5, 8.7), prompt: Pr('tut_barkeep', 'Talk to Ragnhild', ['interact']) };
        if (!g.rest) return { id: 'rest', goal: G('Ask Ragnhild for a bed in the loft', T.HEARTH, 18.5, 8.7), prompt: Pr('tut_rest', 'Ask for a bed: it heals you and saves your game', ['interact'], 'rested') };
        return { id: 'book', goal: G('Read the Tally-Board on the wall', T.HEARTH, 12.5, 7.5), prompt: Pr('tut_book', 'Read it', ['interact'], 'bookRead') };
      case 7: {
        if (!map) return null;
        if (map.id !== T.DEN) {
          if (map.id === 'ashen_fields') return { id: 'den_find', goal: G(g.den ? 'Back into the Wolf Den' : 'Find the Wolf Den, south-east in the Ashen Fields', 'ashen_fields', 88.5, 86.5), prompt: null };
          return { id: 'den_out', goal: exitGoal('Out through the East Gate, then south-east to the Wolf Den', T.DEN), prompt: null };
        }
        const ch = map.objs.find(o => o.kind === 'chest' && o.id === 'wolfden_hoard');
        if (!(got('chest') || (P.flags.chests && P.flags.chests.wolfden_hoard)) && ch) return { id: 'chest', goal: G('Find the Den’s Hoard', T.DEN, ch.x, ch.y + 1), prompt: Pr('tut_chest', 'Open the chest', ['interact'], 'chestOpened') };
        return { id: 'mother', goal: G('Defeat the Den-Mother', T.DEN, 22.5, 9.5), prompt: null, hint: `Watch the ground. When she crouches, a ring marks where she lands: ${key('dodge')} out of it.` };
      }
      case 8: return { id: 'next', goal: null, prompt: null };
    }
    return null;
  }

  /* ---------- Runtime ---------- */
  function show(b) {
    const R = T.rt;
    const gsig = b && b.goal ? `${b.goal.text}|${b.goal.map}|${b.goal.x}|${b.goal.y}` : '';
    if (gsig !== R.goalSig) { R.goalSig = gsig; call('tutGoal', b && b.goal ? b.goal : null); }
    const id = b ? b.id : null;
    if (id !== R.beat) { R.beat = id; R.beatAt = now(); prompt(b && b.prompt ? b.prompt : null); }
    else if (b && b.hint && !R.hinted[b.id] && now() - R.beatAt > T.HINT_AFTER) {   // one retry hint when stuck
      R.hinted[b.id] = true;
      prompt(Object.assign({}, b.prompt || { keys: [] }, { id: (b.prompt ? b.prompt.id : 'tut_' + b.id) + '_hint', text: b.hint, hint: true }));
    }
  }
  // One tutorial prompt at a time: the one it replaces is removed by id (tutPrompt({ id }) removes that prompt).
  function prompt(p) { const R = T.rt; if (R.pid && (!p || p.id !== R.pid)) call('tutPrompt', { id: R.pid }); R.pid = p ? p.id : null; if (p) call('tutPrompt', p); }
  function clear() { const R = T.rt; if (R.goalSig || R.beat || R.pid) { call('tutGoal', null); call('tutPrompt', null); } R.goalSig = ''; R.beat = null; R.pid = null; }
  // Step 2 needs a skill on the first slot and a potion on the first item slot (and something to heal).
  function readySkillAndPotion(s) {
    if (!s.got.skill && Array.isArray(P.skillSlots) && !P.skillSlots[0] && P.skills.first_aid) { if (typeof setSkillSlot === 'function') setSkillSlot(0, 'first_aid'); else P.skillSlots[0] = 'first_aid'; }
    if (s.got.skill && !s.got.potion) {
      if (!countItem('red_potion')) giveItem(makeItem('red_potion', { qty: 3 }), 'Sigrun', true);
      if (Array.isArray(P.itemSlots) && !P.itemSlots[0]) { if (typeof setItemSlot === 'function') setItemSlot(0, 'red_potion'); else P.itemSlots[0] = 'red_potion'; }
      if (P.hp >= S.maxhp && !T.rt.scratched) { T.rt.scratched = true; P.hp = Math.max(1, Math.round(S.maxhp * 0.6)); floatText(P, 'Scratched', 'hurt'); log('A dummy’s pitchfork caught you on the backswing. Nothing a potion won’t fix.', 'sys'); }
    }
  }
  // Step 3: the ambush. Spawned when you come near the road spot; reset when you leave or fall.
  function fightTick(s) {
    const R = T.rt, A = T.AMBUSH;
    if (R.fight && (map.id !== A.map || P.dead)) { for (const m of R.fight) if (!m.dead) { const i = mobs.indexOf(m); if (i >= 0) mobs.splice(i, 1); } R.fight = null; return; }
    if (!R.fight) {
      if (!near(A, A.r)) return;
      R.fight = [];
      const spawn = (key, k, n) => { const a = k / n * 6.283 + 0.4, o = nearestOpen(A.x + 3 + Math.cos(a) * 3.5, A.y + Math.sin(a) * 3.5, 3); if (!o) return; const m = MOBS[key].variant ? makeVariant(key, o.x + 0.5, o.y + 0.5) : makeMob(key, o.x + 0.5, o.y + 0.5, { summoned: true }); m.summoned = true; m.tutFight = true; m.state = 'chase'; mobs.push(m); R.fight.push(m); burst(m.x, m.y, 10, '#7a6a5a', 12, 2); };
      for (let k = 0; k < 3; k++) spawn('blight_poring', k, 4); spawn('tut_wolf', 3, 4);
      if (typeof banner === 'function') banner('Ambush', 'Three Blight Porings and a Young Ash Wolf', 'band');
      R.lowShown = false; return;
    }
    if (!R.lowShown && P.hp < S.maxhp * 0.45) { R.lowShown = true; prompt({ id: 'tut_lowhp', text: 'Low on health: drink a potion', keys: ['item1'], until: 'itemUsed' }); R.beat = 'lowhp'; }
    if (R.fight.length && R.fight.every(m => m.dead)) { R.fight = null; mark('fight'); if (typeof banner === 'function') banner('The Road Is Clear', 'For now', 'band gold'); }
  }
  // Step 7: while the tutorial runs, the Wolf Den is scaled down to the hero (the Den-Mother a few levels above).
  function denTick() {
    if (!map || map.id !== T.DEN || P.lvl >= 13 || typeof scaledData !== 'function') return;
    const L = Math.max(5, P.lvl);
    for (const m of mobs) {
      if (m.dead || m.tutScaled) continue;
      m.tutScaled = true;
      if (m.variant === 'den_mother') { m.d = scaledData('den_mother', L + 3, { hpMul: 0.6 }); m.hp = m.maxhp = m.d.hp; m.scaleL = L + 3; }
      else if (m.type === 'ash_wolf' && !m.variant && !m.scaleL) scaleMobTo(m, L);
    }
  }
  function enterStep(s) {
    T.rt.hinted = {}; T.rt.scratched = false;
    if (s.step === 8 && !s.got.next) { s.got.next = 1; call('tutWhatsNext'); if (typeof questRefresh === 'function') questRefresh(); }
  }
  function tick(dt) {
    const R = T.rt; R.t -= dt; if (R.t > 0) return; R.t = 0.25;
    if (typeof P === 'undefined' || !P || !started || P.dead) return;
    const s = state(); if (!s) return;
    tips(s);
    if (s.done || !ok()) { clear(); if (R.skipShown) { R.skipShown = false; call('tutSkipOffer', null); } return; }
    if (s.step <= 3 && !R.skipShown) { R.skipShown = true; call('tutSkipOffer', skip); }
    else if (s.step > 3 && R.skipShown) { R.skipShown = false; call('tutSkipOffer', null); }
    if (R.step !== s.step) { R.step = s.step; enterStep(s); }
    // beats completed by where you are
    if (s.step === 2 && !s.got.yard && near(T.YARD)) mark('yard');
    if (s.step === 2) readySkillAndPotion(s);
    if (s.step === 3 && !s.got.fields && map.id === T.AMBUSH.map) mark('fields');
    if (s.step === 3 && s.got.fields) fightTick(s);
    if (s.step === 5) {
      if (!s.got.recruit && party() > 1) mark('recruit');
      if (!s.got.tactics && typeof UI !== 'undefined' && UI.open && UI.open.tactics) tutEvent('tactics', {});
      if (!s.got.chat && typeof document !== 'undefined' && document.activeElement && document.activeElement.id === 'sqin') tutEvent('chatOpened', {});
      if (s.got.swap && !s.got.chat && !chatAvail()) mark('chat');   // no squad chat in this build: nothing to teach
    }
    if (s.step === 6 && !s.got.hearth && map.id === T.HEARTH) mark('hearth');
    if (s.step === 7) { if (!s.got.den && map.id === T.DEN) mark('den'); denTick(); }
    if (R.beat === 'lowhp' && P.hp >= S.maxhp * 0.6) R.beat = null;
    if (R.beat !== 'lowhp') show(beat(s));
  }
  const chatAvail = () => typeof sqFocusChat === 'function' && typeof SQ !== 'undefined' && !!SQ.avail && typeof sqChat === 'function' && !!sqChat();

  /* ---------- Events ---------- */
  function onEvent(name, data) {
    const s = P && P.flags && P.flags.tut; if (!s || s.done || !ok()) { tipEvent(name, data); return; }
    const g = s.got; data = data || {};
    tipEvent(name, data);
    switch (s.step) {
      case 1:
        if (name === 'moved') mark('mv'); else if (name === 'cameraTurned') mark('cam'); else if (name === 'zoomed') mark('zoom');
        if (!g.look && g.mv && g.cam && g.zoom) mark('look');
        if (name === 'jumped' && near(T.LOG)) mark('log');
        break;
      case 2:
        if (!g.yard) break;
        if (name === 'lockOn') mark('lock');
        else if (name === 'comboHit3') mark('combo');
        else if (name === 'heavy') mark('heavy');
        else if (name === 'dodged' && data.avoided) mark('dodge');
        else if (name === 'blocked') mark('block');
        else if (name === 'parried') { mark('block'); mark('parry'); }
        else if (name === 'skillUsed') mark('skill');
        else if (name === 'itemUsed' && g.skill) mark('potion');
        break;
      case 3: if (name === 'itemUsed' && T.rt.beat === 'lowhp') { T.rt.beat = null; prompt(null); } break;
      case 5:
        if (name === 'recruited') mark('recruit');
        else if (name === 'swapped') { if (!g.swap) mark('swap'); else mark('back'); }
        else if (name === 'tactics') mark('tactics');
        else if (name === 'chatOpened') mark('chat');
        break;
      case 6:
        if (name === 'doorEntered' && data.to === T.HEARTH) mark('hearth');
        else if (name === 'rested' && map && map.id === T.HEARTH) mark('rest');
        else if (name === 'bookRead' && map && map.id === T.HEARTH) mark('book');
        break;
      case 7:
        if (name === 'chestOpened' && data.id === 'wolfden_hoard') mark('chest');
        else if (name === 'bossKilled' && data.variant === 'den_mother') mark('mother');
        break;
    }
  }

  /* ---------- Tips: once per mechanic, the first time it shows up (tutTip stores them in P.flags.tips) ---------- */
  const tipsOn = s => !!s && !s.auto && ok();
  function tip(id, text) { const s = P.flags.tut; if (!tipsOn(s)) return; const seen = s.tips || (s.tips = {}); if (seen[id]) return; seen[id] = 1; call('tutTip', 'tut_' + id, text); }
  function tips(s) {
    const R = T.rt; if (!tipsOn(s) || !map) return;
    R.tipT -= 0.25; if (R.tipT > 0) return; R.tipT = 0.5;
    if (R.lastMap !== map.id) { R.lastMap = map.id; if (map.d.gen === 'cave') tip('cave', 'Caves are dark. Your torch lights a few steps; what lives down here sees much further.'); }
    for (const wp of map.warps) if (wp.door && Math.hypot(P.x - wp.x - 0.5, P.y - wp.y - 0.5) < 3.5) { tip('door', `A door. Walk into it, or press ${key('interact')}, to go in.`); break; }
    for (const o of map.objs) {
      const d = Math.hypot(P.x - o.x, P.y - o.y); if (d > 4) continue;
      if (o.kind === 'chest' || o.kind === 'ichest') tip('chest', `A chest. ${key('interact')} opens it. Most open only once.`);
      else if (o.kind === 'sign') tip('sign', `A signpost. ${key('interact')} reads it. Most of them are honest.`);
      else if (o.kind === 'lore' || o.kind === 'ibook') tip('lore', `Something written. ${key('interact')} reads it, and the Chronicle remembers it.`);
    }
    if (P.hp < S.maxhp * 0.35) tip('lowhp', `You are bleeding. ${key('item1')} drinks a potion. Or step back, before the Ash decides for you.`);
  }
  function tipEvent(name, data) {
    if (name === 'levelUp' && data && !data.job && P.statPts > 0) tip('statpts', `Status points to spend. Open Status (${win('status') || 'Esc, then Status'}) and put them where you need them.`);
    else if (name === 'levelUp' && data && data.job && P.skillPts > 0) tip('skillpts', `A skill point. Spend it in Skills (${win('skills') || 'Esc, then Skills'}).`);
    else if (name === 'jobChange') tip('loadout', `New skills. Put them on ${key('skill1')} ${key('skill2')} ${key('skill3')} ${key('skill4')} in the Loadout (${win('loadout') || 'Esc, then Loadout'}).`);
    else if (name === 'recruited') tip('squad', 'A squad. F1 to F4 take control of each hero, T gives orders, Enter talks to them.');
  }

  /* ---------- Skip ("I know how to play") ---------- */
  // Steps 1-3 are granted with their rewards (as if played), and the tutorial goes on from step 4.
  function skip() {
    const s = state(); if (!s || s.done || s.step > 3) return false;
    const R = T.rt;
    if (R.fight) { for (const m of R.fight) { const i = mobs.indexOf(m); if (i >= 0) mobs.splice(i, 1); } R.fight = null; }
    for (let n = s.step; n <= 3; n++) {
      const id = 'tut_' + n; if (P.quests.done[id]) continue;
      if (!P.quests.active[id]) P.quests.active[id] = { p: QUESTS[id].obj.map(() => 0), d: QUESTS[id].obj.map(() => 0), day: questDay() };
      questComplete(id, { silent: true });
    }
    s.skipped = true; s.step = Math.max(s.step, 4);
    R.skipShown = false; call('tutSkipOffer', null); clear();
    log('You know how to hold a knife. Sigrun’s lessons are yours anyway: the EXP and the potions are in your pack.', 'quest');
    if (typeof questRefresh === 'function') questRefresh();
    if (typeof saveGame === 'function') saveGame();
    return true;
  }

  // Quest hooks: a finished step moves the tutorial on; the last one ends it and puts the main story back on the tracker.
  let hooked = false;
  function hook() {
    if (hooked || typeof questOn !== 'function') return; hooked = true;
    questOn('complete', q => {
      if (!q || !q.tut) return; const s = P.flags.tut; if (!s) return;
      s.step = Math.max(s.step, q.tut + 1); T.rt.beat = null;
      if (q.tut >= 8) {
        s.done = true; clear();
        const main = Object.keys(P.quests.active).find(k => QUESTS[k] && QUESTS[k].kind === 'main'); if (main) P.quests.track = main;
        log('The tutorial is over. The Ash is not. Your Journal holds the main story; the boards and the townsfolk hold the rest.', 'quest');
      }
    });
  }
  if (typeof addEventListener === 'function') {
    addEventListener('aom-tut', e => { try { if (e && e.detail && typeof P !== 'undefined' && P) onEvent(e.detail.name, e.detail.data); } catch (err) { console.error(err); } });
    addEventListener('DOMContentLoaded', hook);
  }

  // Hróðný (js/data/squad.js): while step 5 runs and you travel alone, the first companion is free, from a short list
  // matched to your class (the one you most need first). Afterwards, her usual bench.
  const PICKS = { swordsman: ['eydis', 'orvar', 'hrafnkel'], mage: ['hrafnkel', 'eydis', 'orvar'], archer: ['hrafnkel', 'eydis', 'orvar'], acolyte: ['hrafnkel', 'orvar', 'eydis'] };
  function picksFor(cls) { let c = cls, g = 0; while (c && !PICKS[c] && g++ < 6) c = CLASSES[c] && CLASSES[c].base; return (PICKS[c] || ['hrafnkel', 'eydis', 'orvar']).filter(id => typeof COMPANION_BY_ID !== 'undefined' && COMPANION_BY_ID[id]); }
  async function freeRecruit() {
    const N = (NPCS.hrodny && NPCS.hrodny.dname) || 'Hróðný';
    const ids = picksFor(P.cls); if (!ids.length || typeof squadRecruit !== 'function') return false;
    const role = id => { const c = COMPANION_BY_ID[id]; return typeof SQUAD_ROLES !== 'undefined' && SQUAD_ROLES[c.role] ? SQUAD_ROLES[c.role].name : c.role; };
    const rows = ids.map((id, i) => { const c = COMPANION_BY_ID[id]; return `<b>${esc(c.name)}</b> · ${esc(CLASSES[c.cls].name)} · ${esc(role(id))}${i === 0 ? ' <i>(the one you need most)</i>' : ''}: ${esc(c.blurb || '')}`; }).join('<br>');
    const r = await dialog(N, `<i>Hróðný looks you up and down.</i> New, and alone. Nobody should walk the Ash alone. The first one off my bench goes with you for nothing; after that, I charge.<br><br>${rows}`, [...ids.map(id => `Take ${COMPANION_BY_ID[id].name} (free)`), 'Not yet']);
    $('dialog').hidden = true;
    if (r < 0 || r >= ids.length) return false;
    const h = squadRecruit(ids[r], { free: true });
    if (h) { mark('recruit'); await say(N, [`${COMPANION_BY_ID[ids[r]].name} gets up from the bench and picks up their pack. “About time somebody asked.”`, 'Look after each other. I am too old to learn new names.']); }
    return !!h;
  }
  if (typeof NPCS !== 'undefined' && NPCS.hrodny) {
    const D = NPCS.hrodny, talk0 = D.talk, urgent0 = D.urgent;
    D.talk = n => (at(5) && party() < 2 ? freeRecruit() : talk0(n));
    D.urgent = () => (at(5) && party() < 2) || (urgent0 ? urgent0() : false);
  }

  // TUTORIAL.tick(dt): js/core.js update calls it while a game runs; it does its work 4 times a second.
  Object.assign(T, { state, on, at, got, mark, skip, beat, tick: dt => { hook(); tick(dt); }, onEvent, hook, picksFor, freeRecruit, ok });
  return T;
})();
