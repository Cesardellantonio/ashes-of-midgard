'use strict';
/* =========================================================
   Squad mode (cycle 8): the party of four. design/squad.md, design/squad-contract.md; data in js/data/squad.js.
   Loaded after js/core.js. core.js holds the party primitives (PARTY, heroes(), allies(), withHero, heroStats,
   monster targeting, the party-aware combat); this file holds everything else:
     - recruiting and dismissing (squadRecruit, squadDismiss, Hróðný's dialog talkRecruiter), levelling companions
       (squadAutoBuild), shared EXP (squadExp), falling and rising (squadDown, squadRevive, the Leaf of Yggdrasil)
     - swapping control (squadSwap: F1-F4, ` to cycle, the gamepad's right bumper), orders (squadOrder, squadTactics)
     - the companion AI (squadUpdate -> squadAllyTick -> squadThink): role gambits, formation, leash, dodging, kiting
     - saves (squadSerialize / squadRestore, called by js/ui.js serialize / applySave)
     - events (squadDispatch: rate limits, then squadEvent listeners and SQUAD_CHAT.event; offline barks)
   Other teams' globals (SQUAD_CHAT, renderHotbar, CTRL, ...) are guarded with typeof.
   ========================================================= */
const SQUAD_KEYS = ['F1', 'F2', 'F3', 'F4'];   // swap to party member 1-4 (the UI shows these labels); ` cycles
// Party-wide fields: a companion's are accessors onto the owner's (the player's own hero), so the bag, the purse, the
// quest log, the flags, storage and mail are one for the whole party whoever you control.
const SQUAD_SHARED = ['zeny', 'inv', 'storage', 'mail', 'quests', 'flags', 'kindled', 'lastWay', 'lostZeny', 'playTime', 'titles', 'ach', 'map'];
// A hero's own saved fields (save.party entries).
const SQUAD_HERO_KEYS = ['id', 'persona', 'name', 'hair', 'gender', 'hairStyle', 'cls', 'lvl', 'exp', 'jlvl', 'jexp', 'statPts', 'skillPts', 'st', 'skills', 'hp', 'sp', 'equip', 'hot', 'x', 'y', 'mounted', 'pet', 'title'];
const SQUAD_AI = { leash: 11, tele: 24, engage: 9, think: 0.25, catchUp: 5 };
// Formation behind the hero you control: [cells back, cells to the side] for the 1st, 2nd and 3rd companion.
const SQUAD_FORM = [[1.5, 1.2], [1.5, -1.2], [2.8, 0]];
// The AI's role for any class (your own hero when you control someone else; companions have their own).
const SQUAD_ROLE_OF = { novice: 'melee', high_novice: 'melee', swordsman: 'tank', oathkeeper: 'tank', tyr_paladin: 'tank', knight: 'melee', rune_jarl: 'melee',
  acolyte: 'healer', priest: 'healer', valkyrie: 'healer', monk: 'melee', berserkr: 'melee', mage: 'ranged', runecaster: 'ranged', galdr_master: 'ranged',
  sage: 'ranged', volva: 'ranged', archer: 'ranged', wolfhunter: 'ranged', fenris_stalker: 'ranged', skald: 'ranged', bragi_voice: 'ranged' };
const SQUAD_FOCUS = ['target', 'nearest', 'boss'];

/* ---------- Party model ---------- */
// The party exists once someone joins (or a save had one); solo play keeps PARTY null, exactly as before cycle 8.
function squadEnsure() {
  if (!P) return null;
  if (PARTY && PARTY.members.indexOf(P) >= 0) return PARTY;
  PARTY = { members: [P], lead: 0, owner: P, fightT: time, idleT: time, ev: {}, wantLead: null };
  P.id = P.id || 'hero'; P.persona = null; squadAiInit(P, SQUAD_ROLE_OF[P.cls]);
  squadHookUI(); squadHookQuests();
  return PARTY;
}
function squadAiInit(h, role) {
  const A = h.ai && typeof h.ai === 'object' ? h.ai : {};
  h.ai = Object.assign(A, { role: role || A.role || SQUAD_ROLE_OF[h.cls] || 'melee', stance: A.stance || 'aggressive', focus: null, focusMode: A.focusMode || null, hold: !!A.hold, follow: A.follow !== false,
    t: 0, skT: 0, moveUntil: 0, pathT: 0, tauntT: 0, blockUntil: 0, flankT: 0, regroupT: 0, holdAt: null });
  if (!SQUAD_ROLES[h.ai.role]) h.ai.role = 'melee';
  if (!SQUAD_STANCES[h.ai.stance]) h.ai.stance = 'aggressive';
  return h.ai;
}
function squadShare(h, owner) {
  for (const k of SQUAD_SHARED) { delete h[k]; Object.defineProperty(h, k, { get() { return owner[k]; }, set(v) { owner[k] = v; }, enumerable: false, configurable: true }); }
  h._owner = owner;
}
const squadHero = id => PARTY ? PARTY.members.find(h => h.id === id || h.persona === id) || null : (P && (id === 'hero' || id === P.id) ? P : null);
const squadIndex = h => PARTY ? PARTY.members.indexOf(h) : 0;
const squadLive = () => PARTY ? PARTY.members.filter(h => !h.dead) : (P && !P.dead ? [P] : []);
function slog(msg, cls) { const q = HCTX.quiet; HCTX.quiet = 0; try { log(msg, cls); } finally { HCTX.quiet = q; } }
const squadBench = () => { const f = PARTY ? PARTY.owner.flags : P.flags; if (!f.squadBench || typeof f.squadBench !== 'object') f.squadBench = {}; return f.squadBench; };

/* ---------- Building a companion ---------- */
// The level a companion joins at: near yours (one below), never under their own minimum.
function squadRecruitLevel(cd) { const own = PARTY ? PARTY.owner : P; return clamp((own ? own.lvl : 1) - 1, cd.minLv || 1, typeof maxLv === 'function' ? maxLv() : MAXLV); }
function squadMakeHero(cd, lvl) {
  const owner = PARTY.owner, h = newPlayer(cd.name, cd.hair, cd.gender, cd.hairStyle);
  squadShare(h, owner);
  Object.assign(h, { id: cd.id, persona: cd.id, cls: cd.cls, x: owner.x, y: owner.y, pet: null, mounted: false, title: null });
  squadAiInit(h, cd.role);
  withHero(h, () => { resetRuntime(); squadLevelTo(cd, lvl); calcStats(); P.hp = S.maxhp; P.sp = S.maxsp; });
  return h;
}
// (In the hero's context.) Level, job level, stats, skills, gear and hotbar of a fresh companion at level L.
function squadLevelTo(cd, L) {
  const C = CLASSES[P.cls];
  P.lvl = L; P.exp = 0; P.jexp = 0;
  P.jlvl = C.tier >= 2 ? clamp(L - 20, 1, C.maxJob) : clamp(Math.round(L * 0.8), 1, C.maxJob);
  let pts = 25; for (let l = 2; l <= L; l++) pts += Math.floor(l / 5) + 3;
  P.st = { str: 1, agi: 1, vit: 1, int: 1, dex: 1, luk: 1 }; P.statPts = pts;
  P.skills = { basic: 9, first_aid: 1 };
  for (const c of classChain(P.cls)) for (const s of CLASSES[c].skills) if (SKILLS[s] && P.skills[s] === undefined) P.skills[s] = 0;
  P.skillPts = (C.tier >= 2 ? 39 : 0) + P.jlvl - 1;
  squadAutoBuild(cd);
  squadGear(cd, L);
  squadHotbar();
}
// (In context.) Spend unspent status and skill points by the companion's build and skill list.
function squadAutoBuild(cd) {
  cd = cd || COMPANION_BY_ID[P.persona]; if (!cd) return;
  const B = cd.build || {}, keys = Object.keys(B).filter(k => B[k] > 0);
  for (let g = 0; g < 2000; g++) {
    let best = null, bv = 1e9;
    for (const k of keys) { const v = P.st[k]; if (v >= 99 || statCost(v) > P.statPts) continue; const sc = v / B[k]; if (sc < bv) { bv = sc; best = k; } }
    if (!best) break; P.statPts -= statCost(P.st[best]); P.st[best]++;
  }
  const avail = {}; for (const c of classChain(P.cls)) for (const s of CLASSES[c].skills) avail[s] = true;
  for (const [id, lv] of cd.skills || []) {
    if (P.skillPts <= 0) break; if (!avail[id] || !SKILLS[id]) continue;
    const cap = Math.min(lv, SKILLS[id].max); while (P.skillPts > 0 && (P.skills[id] || 0) < cap) { P.skills[id] = (P.skills[id] || 0) + 1; P.skillPts--; }
  }
  for (const id in avail) { if (P.skillPts <= 0) break; const sk = SKILLS[id]; if (!sk || id === 'basic' || id === 'craftsmanship') continue; while (P.skillPts > 0 && (P.skills[id] || 0) < sk.max) { P.skills[id] = (P.skills[id] || 0) + 1; P.skillPts--; } }
  if (P.persona) squadHotbar(true);
}
// (In context.) The best shop gear of the companion's class at level L: its weapon type, a shield if it uses one.
function squadGear(cd, L) {
  const cls = P.cls, role = cd.role, magic = role === 'healer' || ['rod', 'staff', 'book'].includes(cd.weapon);
  const ok = t => t.type === 'equip' && !t.unique && !t.crafted && (t.price || 0) > 0 && (t.lvl || 0) <= L && jobOk(t, cls);
  const best = (pred, score) => { let b = null, bs = -1e9; for (const id in ITEMS) { const t = ITEMS[id]; if (!ok(t) || !pred(t)) continue; const s = score(t); if (s > bs) { bs = s; b = t; } } return b; };
  for (const s of SLOTS) P.equip[s] = null;
  const w = best(t => t.slot === 'weapon' && t.wtype === cd.weapon, t => (t.lvl || 0) * 10 + (t.atk || 0) + (t.matk || 0) * (magic ? 2 : 0)) || (CLASSES[cls].starter && ITEMS[CLASSES[cls].starter] && ITEMS[CLASSES[cls].starter].slot === 'weapon' ? ITEMS[CLASSES[cls].starter] : null);
  if (w) P.equip.weapon = makeItem(w.id);
  if (cd.shield) { const sh = ITEMS[cd.shield] && ok(ITEMS[cd.shield]) ? ITEMS[cd.shield] : best(t => t.slot === 'shield', t => (t.lvl || 0) * 10 + (t.def || 0)); if (sh) P.equip.shield = makeItem(sh.id); }
  for (const sl of ['body', 'head', 'boots', 'acc']) { const a = best(t => t.slot === sl, t => (t.lvl || 0) * 10 + (t.def || 0) + (t.mdef || 0) * (magic ? 1.5 : 0.5)); if (a) P.equip[sl] = makeItem(a.id); }
}
// (In context.) A hotbar of the hero's active skills (for when you take control), then the usual wings and potion.
function squadHotbar(keep) {
  const act = Object.keys(P.skills).filter(id => P.skills[id] > 0 && SKILLS[id] && !SKILLS[id].passive && id !== 'basic').sort((a, b) => (SKILLS[b].sp ? 1 : 0) - (SKILLS[a].sp ? 1 : 0));
  const hot = keep && Array.isArray(P.hot) ? P.hot.slice(0, 9) : [];
  while (hot.length < 9) hot.push(null);
  if (!keep) { for (let i = 0; i < 6; i++) hot[i] = act[i] ? { k: 'skill', id: act[i] } : null; hot[6] = { k: 'item', id: 'fly_wing' }; hot[7] = { k: 'item', id: 'butterfly_wing' }; hot[8] = { k: 'item', id: 'red_potion' }; }
  else for (const id of act) { if (hot.some(x => x && x.k === 'skill' && x.id === id)) continue; const i = hot.findIndex((x, j) => j < 6 && !x); if (i < 0) break; hot[i] = { k: 'skill', id }; }
  P.hot = hot;
}
// (In context.) Levels a companion who fell behind up to `target` (a benched one coming back, the catch-up).
function squadCatchUp(target) {
  const cap = typeof maxLv === 'function' ? maxLv() : MAXLV, C = CLASSES[P.cls]; let n = 0;
  while (P.lvl < target && P.lvl < cap) { P.lvl++; P.statPts += Math.floor(P.lvl / 5) + 3; n++; }
  const j = Math.min(C.maxJob, P.jlvl + n); P.skillPts += j - P.jlvl; P.jlvl = j;
  if (n) { squadAutoBuild(); calcStats(); P.hp = S.maxhp; P.sp = S.maxsp; }
  return n;
}

/* ---------- Recruiting, dismissing ---------- */
function squadFail(msg, quiet) { if (!quiet) log(msg, 'warn'); return false; }
// squadRecruit(companionId, { free, quiet }): joins the party near you. Returns the hero, or false (the reason is logged).
function squadRecruit(id, o = {}) {
  const cd = typeof COMPANION_BY_ID !== 'undefined' ? COMPANION_BY_ID[id] : null;
  if (!cd || !P) return squadFail('Nobody by that name sits on the bench.', o.quiet);
  squadEnsure();
  if (PARTY.members.length >= SQUAD_MAX) return squadFail(`Your party is full (${SQUAD_MAX} heroes). Dismiss someone first.`, o.quiet);
  if (PARTY.members.some(h => h.persona === id)) return squadFail(`${cd.name} is already with you.`, o.quiet);
  const owner = PARTY.owner, bench = squadBench(), old = bench[id];
  if (!o.free && owner.lvl < (cd.minLv || 1)) return squadFail(`${cd.name} will not follow anyone below Base Lv ${cd.minLv}.`, o.quiet);
  const lvl = old ? Math.max(old.lvl | 0, 1) : squadRecruitLevel(cd), fee = SQUAD_FEE(lvl);
  if (!o.free) { if (P.zeny < fee) return squadFail(`Hróðný wants ${fmt(fee)} zeny to send for ${cd.name}.`, o.quiet); P.zeny -= fee; }
  let h;
  if (old) { h = squadHeroFrom(old); delete bench[id]; withHero(h, () => { P.dead = false; calcStats(); squadCatchUp(squadRecruitLevel(cd) - 1); P.hp = S.maxhp; P.sp = S.maxsp; }); }
  else h = squadMakeHero(cd, lvl);
  const s = squadSlot(PARTY.members.length - 1, P); h.x = s.x; h.y = s.y; h.fx = P.fx; h.fy = P.fy;
  PARTY.members.push(h);
  withHero(h, compSyncOne, true);
  pillar(h, '#ffe8a0', true); burst(h.x, h.y, 30, '#ffe8a0', 20, 2.5); floatText(h, cd.name + '!', 'lvl'); Sfx.level();
  slog(`${cd.name} ${cd.title ? cd.title + ' ' : ''}joins your party (${CLASSES[h.cls].name}, Base Lv ${h.lvl}, ${SQUAD_ROLES[cd.role].name}). F${PARTY.members.length} takes control of them.`, 'lvl');
  squadEmit('recruit', { hero: h });
  UI.dirty = true; if (typeof saveGame === 'function') saveGame();
  return h;
}
// squadDismiss(heroId): the companion goes back to Hróðný's bench as they are (level, gear) and can be recruited again.
function squadDismiss(id, o = {}) {
  if (!PARTY) return squadFail('You travel alone.', o.quiet);
  const h = squadHero(id); if (!h || h === PARTY.owner) return squadFail('You cannot dismiss yourself.', o.quiet);
  if (h === P) { const to = PARTY.members.findIndex(x => x !== h && !x.dead); if (to < 0) return squadFail('Nobody else is standing to take over.', o.quiet); squadSwap(to, { quiet: true }); }
  const save = squadHeroSave(h); delete save.down; save.hp = null; squadBench()[h.persona] = save;
  const i = PARTY.members.indexOf(h); PARTY.members.splice(i, 1); PARTY.lead = PARTY.members.indexOf(P);
  for (const m of mobs) { if (m.target === h) m.target = null; if (m.taunt && m.taunt.h === h) m.taunt = null; }
  compSync(); burst(h.x, h.y, 20, '#c8b8a0', 16, 2);
  if (!o.quiet) slog(`${h.name} heads back to Hróðný’s bench in Emberhold.`, 'sys');
  UI.dirty = true; if (typeof saveGame === 'function') saveGame();
  return true;
}

/* ---------- Swapping control ---------- */
// squadSwap(i): take control of party member i (0-3, or a hero id). The hero you leave goes back to its AI with its
// target; the one you take keeps its cooldowns, buffs, cast and target (the lock follows it in action mode).
function squadSwap(i, o = {}) {
  if (!PARTY || !P) return false;
  if (typeof i === 'string') i = PARTY.members.findIndex(h => h.id === i || h.persona === i);
  const to = PARTY.members[i]; if (!to || to === P) return false;
  if (to.dead) { if (!o.quiet) log(`${to.name} has fallen and cannot fight.`, 'warn'); return false; }
  if (HCTX.depth) { PARTY.wantLead = i; return true; }   // (inside another hero's context: at the start of the next update)
  const from = P;
  from._S = S;
  from.blocking = false; from.charge = -1; from.queued = null; from.swingT = 0; from.dodgeT = 0; from.sitting = false; from.goal = null; from.combo = 0;
  if (!from.target && !from.pending && !from.casting) from.path = null;
  if (from.ai) { from.ai.t = 0; from.ai.moveUntil = 0; from.ai.blockUntil = 0; if (from.ai.hold) from.ai.holdAt = { x: from.x, y: from.y }; }
  const tgt = to.target && !to.target.dead ? to.target : to.pending && to.pending.target && to.pending.target.kind === 'mob' && !to.pending.target.dead ? to.pending.target : (to.ai && to.ai.focus && !to.ai.focus.dead ? to.ai.focus : null);
  P = to; S = to._S || null; if (!S) calcStats();
  PARTY.lead = i;
  P.goal = null; P.blocking = false; if (!P.target && !P.pending && !P.casting) P.path = null;
  if (P.stamina === undefined) P.stamina = 100;
  if (typeof CTRL !== 'undefined') CTRL.lock = tgt || (CTRL.lock && !CTRL.lock.dead ? CTRL.lock : null);
  if (typeof renderHotbar === 'function') renderHotbar(); if (typeof renderBuffs === 'function') renderBuffs();
  UI.dirty = true;
  if (!o.quiet) floatText(P, P.name, 'info');
  squadEmit('swap', { from, to });
  return true;
}
function squadCycle(dir = 1) {
  if (!PARTY || PARTY.members.length < 2) return false; const n = PARTY.members.length;
  for (let k = 1; k < n; k++) { const i = (PARTY.lead + dir * k + n * 4) % n; if (!PARTY.members[i].dead) return squadSwap(i); }
  return false;
}
// The hero you control fell but others stand: take the first one standing (called from updatePlayer).
function squadAutoSwap() {
  const from = P, i = PARTY.members.findIndex(h => !h.dead);
  if (i < 0) return false;
  squadSwap(i, { quiet: true });
  slog(`${from.name} has fallen. You fight on as ${P.name}. (Raise them with a heal and Resurrection, a Leaf of Yggdrasil, or by resting at a Waystone.)`, 'bad');
  return true;
}

/* ---------- Orders and tactics ---------- */
// squadOrder(heroId | 'all', { stance?, focus?: 'target'|'nearest'|'boss'|null, hold?, follow? }). Returns how many heard it.
function squadOrder(id, o = {}) {
  if (!PARTY) return 0;
  const list = id === 'all' ? PARTY.members.filter(h => h !== P) : [squadHero(id)].filter(Boolean);
  let n = 0;
  for (const h of list) {
    const A = h.ai || squadAiInit(h); n++;
    if (o.stance && SQUAD_STANCES[o.stance]) A.stance = o.stance;
    if ('focus' in o) { A.focusMode = SQUAD_FOCUS.includes(o.focus) ? o.focus : null; A.focus = null; A.t = 0; }
    if (o.hold === true) { A.hold = true; A.follow = false; A.holdAt = { x: h.x, y: h.y }; if (h !== P) { h.path = null; h.pending = null; } }
    if (o.hold === false) { A.hold = false; A.holdAt = null; }
    if (o.follow === true) { A.follow = true; A.hold = false; A.holdAt = null; A.regroupT = time + 2.5; A.t = 0; if (h !== P) { h.target = null; if (h.pending && h.pending.target && h.pending.target.kind === 'mob') h.pending = null; } }
    if (o.follow === false) A.follow = false;
  }
  UI.dirty = true;
  return n;
}
function squadTactics(id) {
  const h = squadHero(id); if (!h) return null; const A = h.ai || squadAiInit(h);
  return { id: h.id, name: h.name, role: A.role, stance: A.stance, focus: A.focusMode || null, hold: !!A.hold, follow: A.follow !== false, controlled: h === P, dead: !!h.dead };
}
// Order words in a chat line -> a squadOrder object (or null). The offline chat uses it (SQUAD_ORDER_WORDS).
function squadParseOrder(text) {
  const W = SQUAD_ORDER_WORDS, o = {}; let any = false; text = String(text || '');
  for (const k in W.stance) if (W.stance[k].test(text)) { o.stance = k; any = true; break; }
  for (const k in W.focus) if (W.focus[k].test(text)) { o.focus = k; any = true; break; }
  if (W.follow.test(text)) { o.follow = true; o.hold = false; any = true; } else if (W.hold.test(text)) { o.hold = true; any = true; }
  return any ? o : null;
}

/* ---------- Shared experience, falling, rising ---------- */
// killMob hands the kill here in a party: every living hero within 30 cells shares it evenly, +25 % per extra hero;
// each hero's own level decides the big-gap penalty; a companion 4+ levels behind the lead gets +50 % (catch-up).
function squadExp(m, b, j) {
  const near = [], lead = leadHero();
  for (const h of PARTY.members) if (!h.dead && hyp(h.x - m.x, h.y - m.y) <= 30) near.push(h);
  if (!near.length) return;
  const mul = (1 + 0.25 * (near.length - 1)) / near.length, lvl = m.d.lvl;
  for (const h of near) withHero(h, () => {
    let hb = Math.ceil(b * mul), hj = Math.ceil(j * mul);
    if (P.lvl - lvl > 10) { hb = Math.ceil(hb * 0.25); hj = Math.ceil(hj * 0.25); }
    if (P.persona && P.lvl < lead.lvl - 3) { hb = Math.ceil(hb * 1.5); hj = Math.ceil(hj * 1.5); }
    const lv0 = P.lvl, j0 = P.jlvl; gainExp(hb, hj);
    if (P.persona && (P.lvl !== lv0 || P.jlvl !== j0)) { squadAutoBuild(); calcStats(); if (P.lvl !== lv0) { P.hp = S.maxhp; P.sp = S.maxsp; } }
  });
}
// die() in a party: the hero falls where they stand and the others fight on. False = the last one standing (the old
// death flow runs: the party is down, the Waystone takes everyone back).
function squadDown(h) {
  if (PARTY.members.every(x => x === h || x.dead)) return false;
  if (h.mounted) { h.mounted = false; calcStats(); }
  Object.assign(h, { dead: true, deadT: 0, hp: 0, casting: null, pending: null, target: null, path: null, goal: null, dash: null, blocking: false, charge: -1, deathShown: true, moving: false });
  if (h.spheres) setSpheres(0);
  for (const m of mobs) { if (m.target === h) { m.target = null; m.tgtT = 0; } if (m.taunt && m.taunt.h === h) m.taunt = null; }
  floatText(h, 'Down!', 'miss'); burst(h.x, h.y, 10, '#8a8a8a', 16, 2); Sfx.hurt();
  slog(`${h.name} falls!`, 'bad');
  squadEmit('ally_down', { hero: h });
  UI.dirty = true;
  return true;
}
// Raise a fallen hero with pct of their Max HP (by: who raised them, for the message).
function squadRevive(h, pct, by) {
  if (!h || !h.dead) return false;
  withHero(h, () => { P.dead = false; P.deadT = 0; P.deathShown = false; calcStats(); P.hp = Math.max(1, Math.round(S.maxhp * clamp(pct || 0.5, 0.01, 1))); P.iframes = 1.5; P.stamina = 100; pillar(P, '#fff2b8', true); burst(P.x, P.y, 40, '#ffffff', 24, 3); floatText(P, 'Revived!', 'lvl'); });
  Sfx.level(); slog(`${h.name} rises again${by && by !== h ? ' (' + by.name + ')' : ''}.`, 'lvl'); UI.dirty = true;
  return true;
}
// Everyone up (the Waystone, a rest, the inn): full also refills HP and SP.
function squadReviveAll(pct, full) {
  if (!PARTY) return;
  for (const h of PARTY.members) {
    if (h.dead && h !== P) squadRevive(h, pct || 1);
    if (full && !h.dead) withHero(h, () => { P.hp = S.maxhp; P.sp = S.maxsp; });
  }
}
// Leaf of Yggdrasil (useItem 'revive'): the nearest fallen companion within 9 cells rises with half their HP.
function squadLeaf(it) {
  let best = null, bd = 9;
  if (PARTY) for (const h of PARTY.members) if (h.dead && h !== P) { const d = hyp(h.x - P.x, h.y - P.y); if (d <= bd) { bd = d; best = h; } }
  if (!best) { log(PARTY && PARTY.members.some(h => h.dead) ? 'Get closer to your fallen companion first (within 9 cells).' : 'Nobody here has fallen. Keep the leaf.', 'sys'); return false; }
  takeItem(it.id, 1); squadRevive(best, 0.5, P); return true;
}
// The chat's "heal me": healer heroId heals (or raises) target now if it can. True when the heal was queued.
function squadHeal(id, target) {
  const h = squadHero(id); if (!h || h.dead || h === P || !target) return false;
  return withHero(h, () => { const lv = P.skills.heal | 0; if (!lv || (P.cd.heal || 0) > 0 || P.sp < SKILLS.heal.sp(lv) || (target.dead && !P.skills.resurrection)) return false; P.pending = null; P.casting = null; return squadCast('heal', target === P ? null : target); });
}
// For a fallen hero's party frame: how to raise them.
function squadReviveHint(h) {
  if (!h || !h.dead) return '';
  const priest = PARTY && PARTY.members.find(x => !x.dead && x.skills && x.skills.resurrection && x.skills.heal);
  return 'Fallen. Rest at a Waystone, use a Leaf of Yggdrasil' + (priest ? `, or have ${priest === P ? 'yourself' : priest.name} Heal them (Resurrection)` : '') + '.';
}

/* ---------- Map changes ---------- */
// gotoMap: the companions arrive with you, in formation behind you.
function squadArrive() {
  const lead = P; let k = 0;
  for (const h of PARTY.members) {
    if (h === lead) continue;
    const s = squadSlot(k, lead); k++;
    Object.assign(h, { x: s.x, y: s.y, fx: lead.fx, fy: lead.fy, path: null, target: null, pending: null, goal: null, casting: null, dash: null, blocking: false, moving: false });
    if (h.ai) { h.ai.moveUntil = 0; h.ai.t = 0.05 * k; h.ai.holdAt = h.ai.hold ? { x: h.x, y: h.y } : null; h.ai.focus = null; }
  }
}
// Formation slot k behind `lead` (on open, reachable ground).
function squadSlot(k, lead) {
  const f = SQUAD_FORM[k % SQUAD_FORM.length], fx = lead.fx === undefined ? 0 : lead.fx, fy = lead.fy === undefined ? 1 : lead.fy, l = hyp(fx, fy) || 1, ux = fx / l, uy = fy / l;
  const open = (x, y) => map && !blocked(x, y) && map.reach[Math.floor(y) * map.w + Math.floor(x)];
  // the slot, then closer in, then the other side, then straight behind; last, any open tile next to the lead
  for (const [b, s] of [[f[0], f[1]], [f[0] * 0.6, f[1] * 0.6], [f[0], -f[1]], [1.1, 0], [0.6, f[1] * 0.8]]) {
    const x = lead.x - ux * b - uy * s, y = lead.y - uy * b + ux * s; if (open(x, y)) return { x, y };
  }
  const o = map ? nearestOpen(lead.x, lead.y, 2) : null; return o ? { x: o.x + 0.5, y: o.y + 0.5 } : { x: lead.x, y: lead.y };
}

/* =========================================================
   Companion AI (local, deterministic, no network)
   Every tick each companion runs its hero upkeep (cooldowns, buffs, regen, stamina, casting, walking) in its own
   context; every SQUAD_AI.think seconds it thinks: leash and regroup, dodge telegraphs and hostile ground, then its role's
   gambits (heal < 40 % / revive / buffs; taunt and hold the boss; assist and flank; kite and pick off the weakest),
   its class skills (SP reserve, cooldowns) and the formation. Queries use the round-5 mob grid (mobsNear) and paths
   the shared findPath scratch (goNear); straight lines are walked without A*.
   ========================================================= */
function squadUpdate(dt) {
  if (PARTY.wantLead != null) { const i = PARTY.wantLead; PARTY.wantLead = null; squadSwap(i, { quiet: true }); }
  const L = PARTY.members;
  PARTY.songT = (PARTY.songT || 0) - dt; if (PARTY.songT <= 0) { PARTY.songT = 0.5; squadSongs(); }
  let k = 0;
  for (let i = 0; i < L.length; i++) { const h = L[i]; if (h === P) continue; withHero(h, squadAllyTick, dt, k); k++; }
  // events: low HP once per dip (under 30 %, re-armed above 60 %), idle banter at most every 2 minutes out of combat
  for (const h of L) {
    if (h.dead) { h._low = false; continue; }
    const p = h.hp / heroStats(h).maxhp;
    if (p < 0.3 && !h._low) { h._low = true; squadEmit('low_hp', { hero: h }); } else if (p > 0.6) h._low = false;
  }
  for (const m of mobs) if (m.state === 'chase' && !m.dead && m.target) { PARTY.fightT = time; break; }
  if (time - PARTY.fightT > 45 && time - (PARTY.idleT || 0) > 120) { PARTY.idleT = time; squadEmit('idle', {}); }
}
// Songs are auras: allies within the singer's aura (+1 cell) share the song while they stay in it.
function squadSongs() {
  for (const s of PARTY.members) {
    if (s.dead) continue;
    for (const k in s.buffs) {
      const bf = s.buffs[k]; if (!bf.song || bf.mirror) continue;
      const r = ((bf.aura && bf.aura.r) || 2.2) + 1;
      for (const a of PARTY.members) {
        if (a === s || a.dead || hyp(a.x - s.x, a.y - s.y) > r) continue;
        const cur = a.buffs[k];
        if (cur && cur.mirror === s) { cur.t = cur.max = 1.2; continue; }
        if (cur) continue;
        withHero(a, () => addBuff(k, bf.name, bf.icon, 1.2, bf.bonus, { song: true, mirror: s, every: bf.every, onTick: bf.onTick, castCut: bf.castCut, cdCut: bf.cdCut }));
      }
    }
  }
}
// (In the companion's context.)
function squadAllyTick(dt, slot) {
  const A = P.ai || squadAiInit(P);
  if (P.dead) { P.deadT += dt; P.moving = false; return; }
  heroTimers(dt); petTick(dt);
  P.stamT = (P.stamT || 0) - dt;
  if (P.blocking) { P.stamina = Math.max(0, P.stamina - 3 * dt); if (P.stamina <= 0 || A.blockUntil <= time) P.blocking = false; }
  else if (P.stamT <= 0) P.stamina = Math.min(100, (P.stamina || 0) + 34 * dt);
  if (P.dash) { updateDash(dt); return; }
  heroRegen(dt);
  A.t -= dt; if (A.t <= 0) { A.t = SQUAD_AI.think; squadThink(A, slot); }
  if (P.blocking) { P.moving = false; return; }
  const spd = S.move * surfMul(P);
  if (A.moveUntil > time && P.path && P.path.length && !P.casting) { followPath(P, dt, spd * 1.1); return; }
  if (heroAct(dt)) return;
  const was = P.moving; followPath(P, dt, spd * (A.catchUp ? 1.3 : 1)); if (was && !P.moving) P.walk = 0;
}
function squadThink(A, slot) {
  const lead = leadHero(), dl = hyp(P.x - lead.x, P.y - lead.y);
  A.catchUp = dl > SQUAD_AI.catchUp && !P.target;
  // beyond the leash and not closing in (no path through the trees, a lead on a warg): count it; 2 s of that = rejoin
  if (dl > SQUAD_AI.leash && !A.hold && dl > (A.lastD || 0) - 0.3) A.stuckT = (A.stuckT || 0) + SQUAD_AI.think; else A.stuckT = 0;
  A.lastD = dl;
  if ((dl > SQUAD_AI.tele || A.stuckT > 2) && !(A.hold && A.holdAt)) { A.stuckT = 0; const s = squadSlot(slot, lead); P.x = s.x; P.y = s.y; P.path = null; P.target = null; P.pending = null; P.casting = null; burst(P.x, P.y, 20, '#c8d8ff', 10, 2); return; }
  if (squadDodge(A)) return;
  if (P.casting) return;
  if (P.pending && (A.pendT || 0) < time) P.pending = null;   // a skill it could not reach in time
  const regroup = !A.hold && (dl > SQUAD_AI.leash || A.regroupT > time);
  // (a monster can leave mobs[] alive: tamed, a failed defence wave, a despawn)
  if (P.target && (P.target.dead || mobs.indexOf(P.target) < 0 || hyp(P.target.x - lead.x, P.target.y - lead.y) > SQUAD_AI.leash + 3)) P.target = null;
  if (P.pending && P.pending.target && P.pending.target.kind === 'mob' && mobs.indexOf(P.pending.target) < 0) P.pending = null;
  if (A.focus && (A.focus.dead || mobs.indexOf(A.focus) < 0)) A.focus = null;
  if (regroup) { P.target = null; if (P.pending && P.pending.target && P.pending.target.kind === 'mob') P.pending = null; squadFollow(A, slot, lead, true); return; }
  if (P.pending) return;
  const foes = squadFoes(A, lead);
  if (squadHealGambit(A)) return;
  if ((dl < 4.5 || foes.length) && squadSupport(A, foes)) return;   // (out of a fight, catch up before buffing)
  if (A.stance !== 'passive' && foes.length && squadFight(A, foes, lead)) return;
  if (P.target && !foes.includes(P.target)) P.target = null;
  if (!P.target) squadFollow(A, slot, lead, false);
}
// Monsters this companion may fight: near the hero you control (or its hold spot), by stance.
function squadFoes(A, lead) {
  const out = []; if (A.stance === 'passive') return out;
  const hold = A.hold && A.holdAt, cx = hold ? A.holdAt.x : lead.x, cy = hold ? A.holdAt.y : lead.y, R = hold ? Math.max(S.range, 6) + 2 : SQUAD_AI.engage;
  const lt = squadLeadTarget(lead);
  for (const m of mobsNear(cx, cy, R)) {
    if (m.d.inert || m.gnaw) continue;   // (Níðhöggr feeding is immune: its brood first)
    const engaged = m.state === 'chase' && !!m.target && m.target.kind === 'player';
    if (A.stance === 'defensive' && !engaged && m !== lt) continue;
    if (A.stance === 'aggressive' && !engaged && m !== lt && !m.d.aggro && hyp(m.x - lead.x, m.y - lead.y) > 5) continue;
    out.push(m);
  }
  if (lt && out.indexOf(lt) < 0 && hyp(lt.x - lead.x, lt.y - lead.y) <= SQUAD_AI.leash) out.push(lt);
  return out;
}
// What the hero you control is fighting: the action-mode lock, the click target, its pending skill, its last blow.
function squadLeadTarget(lead) {
  const ok = m => m && m.kind === 'mob' && !m.dead && mobs.indexOf(m) >= 0;
  if (lead === leadHero() && typeof CTRL !== 'undefined' && typeof isAction === 'function' && isAction() && ok(CTRL.lock)) return CTRL.lock;
  if (ok(lead.target)) return lead.target;
  if (lead.pending && ok(lead.pending.target)) return lead.pending.target;
  if (ok(lead.lastHitM) && time - lead.lastHitT < 4) return lead.lastHitM;
  return null;
}
function squadPickTarget(A, foes, lead) {
  const near = list => { let b = null, bd = 1e9; for (const m of list) { const d = hyp(m.x - P.x, m.y - P.y); if (d < bd) { bd = d; b = m; } } return b; };
  const big = foes.filter(m => m.d.boss || m.d.elite), lt = squadLeadTarget(lead);
  if (A.focusMode === 'boss' && big.length) return near(big);
  if (A.focusMode === 'target' && lt) return lt;
  if (A.focusMode === 'nearest') return near(foes);
  if (A.role === 'tank') {
    if (big.length) return near(big);
    let b = null, bs = -1; for (const m of foes) { if (!m.target || m.target === P || m.state !== 'chase') continue; const s = (m.d.atk[0] + m.d.atk[1]) * (m.d.elite ? 2 : 1); if (s > bs) { bs = s; b = m; } }
    return b || lt || near(foes);
  }
  if (A.role === 'melee') { if (lt) return lt; const tank = PARTY.members.find(h => h !== P && !h.dead && h.ai && h.ai.role === 'tank' && h.target && !h.target.dead); return tank ? tank.target : near(foes); }
  if (A.role === 'ranged') {
    let b = null, bs = 1e9; for (const m of foes) { if (hyp(m.x - P.x, m.y - P.y) > 11) continue; const s = m.hp / m.maxhp + (m.state === 'chase' ? 0 : 0.5); if (s < bs) { bs = s; b = m; } }
    return b || lt || near(foes);
  }
  return lt || near(foes);
}
function squadFight(A, foes, lead) {
  const t = squadPickTarget(A, foes, lead); if (!t) return false;
  A.focus = t;
  if (A.role === 'tank') { squadTaunt(A, t, foes); if (squadBlock(A, foes)) return true; }
  if (time >= A.skT && squadUseSkill(A, t, foes)) { A.skT = time + 0.6; return true; }
  if (A.role === 'ranged' && squadKite(A, foes, lead)) return true;
  if (A.role === 'healer') { if (squadKeepAway(A, foes, lead)) return true; if (!squadMeleeOk(A, foes)) { P.target = null; return false; } }
  const caster = S.range < 3 && A.role === 'ranged';
  if (caster && !squadMeleeOk(A, foes)) { P.target = null; if (squadKite(A, foes, lead, 4)) return true; return false; }
  if (A.role === 'melee' && squadFlank(A, t)) return true;
  if (A.hold && hyp(t.x - P.x, t.y - P.y) > S.range + 0.4) { P.target = null; return false; }
  if (P.target !== t) { P.target = t; P.repath = 0; }
  return true;
}
// Casters and healers only melee when out of SP with a foe on them.
function squadMeleeOk(A, foes) { if (P.sp > S.maxsp * 0.1) return false; for (const m of foes) if (m.target === P && hyp(m.x - P.x, m.y - P.y) < 2) return true; return false; }

/* ---------- Gambits ---------- */
// Heal whoever is under 40 % (healers; anyone with Heal at 25 %), raise the fallen (Heal + Resurrection), Sanctuary
// a hurt huddle, top up (healers with SP to spare), First Aid on yourself as a last resort.
function squadHealGambit(A) {
  const healer = A.role === 'healer', hl = P.skills.heal || 0, L = PARTY.members;
  const can = id => (P.skills[id] || 0) > 0 && (P.cd[id] || 0) <= 0 && P.sp >= SKILLS[id].sp(P.skills[id]);
  if (hl && can('heal') && P.skills.resurrection) for (const h of L) if (h.dead && h !== P && hyp(h.x - P.x, h.y - P.y) <= 12) return squadCast('heal', h);
  let worst = null, wp = healer ? 0.4 : 0.25, hurt = 0;
  for (const h of L) { if (h.dead || hyp(h.x - P.x, h.y - P.y) > 11) continue; const p = h.hp / heroStats(h).maxhp; if (p < 0.65) hurt++; if (p < wp) { wp = p; worst = h; } }
  if (healer && hurt >= 2 && can('sanctuary')) {
    let cx = 0, cy = 0, n = 0; for (const h of L) if (!h.dead && h.hp / heroStats(h).maxhp < 0.65) { cx += h.x; cy += h.y; n++; }
    cx /= n; cy /= n; let close = 0; for (const h of L) if (!h.dead && hyp(h.x - cx, h.y - cy) <= 2.3) close++;
    if (close >= 2 && !zones.some(z => z.kind === 'sanctuary' && hyp(z.x - cx, z.y - cy) < 2)) return squadCast('sanctuary', null, { x: cx, y: cy });
  }
  if (!worst && healer && P.sp > S.maxsp * 0.6) { let tp = 0.75; for (const h of L) { if (h.dead || hyp(h.x - P.x, h.y - P.y) > 9) continue; const p = h.hp / heroStats(h).maxhp; if (p < tp) { tp = p; worst = h; } } }
  if (worst && hl && can('heal')) return squadCast('heal', worst === P ? null : worst);
  if (P.hp < heroStats(P).maxhp * 0.3 && can('first_aid')) return squadCast('first_aid', null);
  return false;
}
// Party buffs (Blessing, Increase AGI, Kyrie on whoever is in front, Assumptio), self buffs, songs, spheres.
function squadSupport(A, foes) {
  if (time < A.skT) return false;
  const fight = foes.some(m => m.state === 'chase' && hyp(m.x - P.x, m.y - P.y) < 9), boss = foes.some(m => (m.d.boss || m.d.elite) && m.state === 'chase');
  const spOk = f => P.sp > S.maxsp * f;
  for (const id in P.skills) {
    const lv = P.skills[id], spec = AI_SKILL[id]; if (!lv || !spec) continue;
    const sk = SKILLS[id]; if (!sk || (P.cd[id] || 0) > 0 || P.sp < sk.sp(lv) || (sk.need && sk.need(lv))) continue;
    if (spec.kind === 'ally') {
      if (!spOk(A.role === 'healer' ? 0.45 : 0.3)) continue;
      let pick = null;
      for (const h of PARTY.members) {
        if (h.dead || hyp(h.x - P.x, h.y - P.y) > 8 || (h.buffs[spec.buff] && h.buffs[spec.buff].t > 5)) continue;
        if (spec.front && !(fight && (h.ai && h.ai.role === 'tank' || h === leadHero()))) continue;
        pick = h; if (spec.front || h === leadHero()) break;
      }
      if (pick) { A.skT = time + 0.8; return squadCast(id, pick === P ? null : pick); }
    } else if (spec.kind === 'buff') {
      if (P.buffs[spec.buff]) continue;
      if (spec.when === 'fight' && !fight) continue; if (spec.when === 'boss' && !boss) continue;
      if (spec.when === 'sp' && P.sp > S.maxsp * 0.5) continue;
      if (spec.when !== 'sp' && !spOk(0.3)) continue;
      A.skT = time + 0.8; return squadCast(id, null);
    } else if (spec.kind === 'song') {
      if (Object.keys(P.buffs).some(k => P.buffs[k].song && !P.buffs[k].mirror) || !spOk(0.3)) continue;
      A.skT = time + 0.8; return squadCast(id, null);
    } else if (spec.kind === 'sphere') {
      if ((P.spheres || 0) >= lv || (fight && (P.spheres || 0) >= 1 && foes.some(m => m.target === P && hyp(m.x - P.x, m.y - P.y) < 2))) continue;
      A.skT = time + 0.5; return squadCast(id, null);
    }
  }
  return false;
}
/* How the AI uses each skill. kind: 'single' (a foe; the default for enemy skills), 'bolt' (element-picked single),
   'ground' {r, n} (an area with n foes, or a boss), 'aoeSelf' {r, n}, 'cone' {n}, 'line', 'charge' (a gap closer),
   'boss' (bosses and elites only), 'breaker' (a foe winding up a telegraph), 'asura' (all-in on a boss), 'trap',
   'debuff' (not twice), 'ally' {buff, front}, 'buff' {buff, when: fight|boss|sp}, 'song', 'sphere', 'heal', 'selfheal',
   'skip'. Ground / self skills with no entry are never used by the AI. */
const AI_SKILL = {
  first_aid: { kind: 'selfheal' }, heal: { kind: 'heal' }, sanctuary: { kind: 'heal' },
  endure: { kind: 'buff', buff: 'endure', when: 'fight' }, concentration: { kind: 'buff', buff: 'conc', when: 'fight' }, two_hand_quicken: { kind: 'buff', buff: 'thq', when: 'fight' },
  auto_guard: { kind: 'buff', buff: 'autoguard', when: 'fight' }, oath_of_tyr: { kind: 'buff', buff: 'oath', when: 'boss' }, magnificat: { kind: 'buff', buff: 'magnificat', when: 'sp' },
  gloria: { kind: 'buff', buff: 'gloria', when: 'boss' }, bear_rage: { kind: 'buff', buff: 'bearrage', when: 'boss' }, galdr_amplify: { kind: 'buff', buff: 'amplify', when: 'boss' },
  volva_sight: { kind: 'buff', buff: 'sight', when: 'fight' }, einherjar_call: { kind: 'buff', buff: 'einherjar', when: 'boss' },
  blessing: { kind: 'ally', buff: 'bless' }, inc_agi: { kind: 'ally', buff: 'agi' }, kyrie_eleison: { kind: 'ally', buff: 'kyrie', front: true }, assumptio: { kind: 'ally', buff: 'assumptio', front: true },
  poem_of_bragi: { kind: 'song' }, apple_of_idun: { kind: 'song' }, sunset_dirge: { kind: 'song' }, song_of_valhalla: { kind: 'song' },
  summon_sphere: { kind: 'sphere' },
  magnum: { kind: 'aoeSelf', r: 2.5, n: 2 }, grand_cross: { kind: 'aoeSelf', r: 3, n: 3, hp: 0.5 }, frost_joker: { kind: 'aoeSelf', r: 6, n: 3 }, fenris_howl: { kind: 'aoeSelf', r: 5, n: 3 },
  bragis_verse: { kind: 'aoeSelf', r: 3, n: 2 }, detect: { kind: 'aoeSelf', r: 8, n: 3 },
  thunderstorm: { kind: 'ground', r: 2.5, n: 2 }, arrow_shower: { kind: 'ground', r: 2, n: 2 }, storm_gust: { kind: 'ground', r: 3, n: 3 }, meteor_storm: { kind: 'ground', r: 2.5, n: 2 },
  lord_of_vermilion: { kind: 'ground', r: 3.5, n: 3 }, quagmire: { kind: 'ground', r: 2.5, n: 3 }, magnus_exorcismus: { kind: 'ground', r: 3, n: 2, undead: true },
  thurisaz_rune: { kind: 'ground', r: 2.5, n: 2 }, ginnungagap: { kind: 'ground', r: 3, n: 3 }, unmake: { kind: 'ground', r: 3.5, n: 3 },
  brandish_spear: { kind: 'cone', n: 2 }, sharp_shooting: { kind: 'line' },
  shield_charge: { kind: 'charge' }, gungnir_charge: { kind: 'charge' },
  lex_aeterna: { kind: 'boss' }, dispel: { kind: 'boss' }, huginn_muninn: { kind: 'boss' }, norns_draw: { kind: 'boss' }, spell_breaker: { kind: 'breaker' },
  asura_strike: { kind: 'asura' }, asura_plus: { kind: 'asura' }, seidr_hex: { kind: 'debuff', key: 'hexT' }, frost_diver: { kind: 'single', noBoss: true },
  fire_bolt: { kind: 'bolt', el: 'fire' }, cold_bolt: { kind: 'bolt', el: 'water' }, lightning_bolt: { kind: 'bolt', el: 'wind' },
  ankle_snare: { kind: 'trap' }, blast_mine: { kind: 'trap' }, freezing_trap: { kind: 'trap' }, gleipnir_snare: { kind: 'trap' },
  body_relocation: { kind: 'skip' }, wings_of_valhalla: { kind: 'skip' }, blade_stop: { kind: 'skip' }, einherjar_fury: { kind: 'skip' }, tyrs_sacrifice: { kind: 'skip' },
  magic_rod: { kind: 'skip' }, foresight: { kind: 'skip' }, harmonize: { kind: 'skip' }, norn_ward: { kind: 'skip' }, tyrs_aegis: { kind: 'skip' }, vardlokkur: { kind: 'skip' }, basilica: { kind: 'skip' },
};
// Offensive skills: the best-scoring one that fits the SP reserve (healers keep 45 %, others 12 %; not on a boss).
function squadUseSkill(A, t, foes) {
  if (P.pending || P.casting) return false;
  const reserve = A.role === 'healer' ? 0.45 : 0.12, boss = !!(t.d.boss || t.d.elite), dT = hyp(t.x - P.x, t.y - P.y);
  let best = null, bs = 0, bpos = null, btgt = null;
  const count = (x, y, r) => { let n = 0; for (const m of foes) if (hyp(m.x - x, m.y - y) <= r) n++; return n; };
  for (const id in P.skills) {
    const lv = P.skills[id]; if (!lv) continue; const sk = SKILLS[id]; if (!sk || sk.passive || !sk.use || !sk.sp) continue;
    let spec = AI_SKILL[id]; if (!spec) spec = sk.tgt === 'enemy' ? { kind: 'single' } : sk.tgt === 'ground' ? { kind: 'ground', r: 2.5, n: 2 } : sk.tgt === 'dir' ? { kind: 'cone', n: 2 } : null;
    if (!spec || ['skip', 'heal', 'selfheal', 'ally', 'buff', 'song', 'sphere'].includes(spec.kind)) continue;
    if ((P.cd[id] || 0) > 0) continue; const cost = sk.sp(lv); if (P.sp < cost) continue;
    if ((P.sp - cost) < S.maxsp * reserve && !boss) continue;
    if (sk.need && sk.need(lv)) continue;
    const rng = skillRange(sk, lv); let s = 0, pos = null, tg = t;
    switch (spec.kind) {
      case 'single': if (dT > rng + 2.5 || (spec.noBoss && t.d.boss)) break; s = 3 + (boss ? 1 : 0) - (t.hp < t.maxhp * 0.12 && !boss ? 3 : 0); break;
      case 'bolt': if (dT > rng + 2) break; s = 3 + (elemMod(spec.el, mobElem(t)) - 1) * 4 - (t.hp < t.maxhp * 0.12 && !boss ? 3 : 0); break;
      case 'boss': if (!boss || dT > rng + 1) break; if (id === 'lex_aeterna' && t.lex) break; if (id === 'dispel' && t.dispel > 0) break; s = 5; break;
      case 'breaker': if (dT > rng || !teles.some(x => x.m === t)) break; s = 7; break;
      case 'asura': if (!boss || (P.spheres || 0) < 1 || P.sp < S.maxsp * 0.6 || dT > S.range + 2) break; s = 8; break;
      case 'debuff': if (t[spec.key] > 0 || dT > rng + 1) break; s = boss ? 5 : 2.5; break;
      case 'charge': if (dT < 2.5 || dT > rng) break; s = 4.5; break;
      case 'ground': { if (hyp(t.x - P.x, t.y - P.y) > rng + 1) break; const n = count(t.x, t.y, spec.r); if (n < spec.n && !boss) break; if (spec.undead && !(isUndeadish(t) || t.d.elem === 'shadow')) break; s = 4 + n; pos = { x: t.x, y: t.y }; tg = null; break; }
      case 'aoeSelf': { const n = count(P.x, P.y, spec.r); if (n < spec.n) break; if (spec.hp && P.hp < heroStats(P).maxhp * spec.hp) break; s = 5 + n; tg = null; break; }
      case 'cone': { if (dT > rng + 0.5) break; let n = 0; for (const m of foes) { const dx = m.x - P.x, dy = m.y - P.y, d = hyp(dx, dy); if (d <= rng + 0.5 && (d < 0.5 || (dx * (t.x - P.x) + dy * (t.y - P.y)) / (d * (dT || 1)) > 0.4)) n++; } if (n < spec.n && !boss) break; s = 4 + n; pos = { x: t.x, y: t.y }; tg = null; break; }
      case 'line': { if (dT > 9) break; const n = typeof lineMobs === 'function' ? lineMobs(P.x, P.y, (t.x - P.x) / (dT || 1), (t.y - P.y) / (dT || 1), 9, 0.9).length : 1; if (n < 2 && !boss) break; s = 4 + n; pos = { x: t.x, y: t.y }; tg = null; break; }
      case 'trap': { if (zones.filter(z => z.trap).length >= 2 || t.state !== 'chase' || dT > 6 || dT < 1.5) break; s = 2.5; pos = { x: P.x + (t.x - P.x) * 0.4, y: P.y + (t.y - P.y) * 0.4 }; tg = null; break; }
    }
    if (s > bs) { bs = s; best = id; bpos = pos; btgt = tg; }
  }
  if (!best) return false;
  return squadCast(best, btgt, bpos);
}
// Queue a skill for the hero in context (the same pending path the player's skills use: close in, cast, execute).
function squadCast(id, target, pos) {
  const lv = P.skills[id] | 0, sk = SKILLS[id]; if (!lv || !sk) return false;
  P.pending = { id, lv, target: target || null, pos: pos || null }; P.ai.pendT = time + 3; P.sitting = false;
  return true;
}
// Tanks: pull the boss (or whatever is hitting someone else) with a shout; 8 s cooldown.
function squadTaunt(A, t, foes) {
  if (A.tauntT > time || hyp(t.x - P.x, t.y - P.y) > 7) return false;
  const loose = foes.filter(m => m.state === 'chase' && m.target && m.target !== P && hyp(m.x - P.x, m.y - P.y) < 6);
  if (!(t.target && t.target !== P && t.state === 'chase') && loose.length < 2) return false;
  A.tauntT = time + 8;
  if (loose.indexOf(t) < 0) loose.push(t);
  for (const m of loose) { m.taunt = { h: P, t: time + (m.d.boss ? 5 : 7) }; m.target = P; m.tgtT = time + 0.5; aggro(m); threatAdd(m, P, m.maxhp * 0.05); }
  floatText(P, 'Taunt!', 'shout'); ring(P.x, P.y, 3, '#e8c07a'); Sfx.equip();
  return true;
}
// Tanks: raise the guard when low and pressed (the parry window is the player's art; the AI just blocks).
function squadBlock(A, foes) {
  if (A.blockUntil > time) return true;
  if (P.hp > heroStats(P).maxhp * 0.3 || P.stamina < 30) return false;
  let near = null; for (const m of foes) if (m.target === P && hyp(m.x - P.x, m.y - P.y) < 2.5) { near = m; break; }
  if (!near) return false;
  A.blockUntil = time + 1.2; P.blocking = true; P.blockStart = time; P.path = null; face(P, near);
  return true;
}
// Ranged: step away from a melee foe that is on you (toward the party).
function squadKite(A, foes, lead, reach = 2.6) {
  let near = null, nd = reach;
  for (const m of foes) { if (m.target !== P || m.state !== 'chase' || m.d.ranged) continue; const d = hyp(m.x - P.x, m.y - P.y); if (d < nd) { nd = d; near = m; } }
  if (!near) return false;
  const p = squadAway(near.x, near.y, 3.5, lead); if (!p) return false;
  P.path = [p]; A.moveUntil = time + 0.9; return true;
}
// Healers: stay out of the melee, behind the front line.
function squadKeepAway(A, foes, lead) {
  let near = null, nd = 3; for (const m of foes) { if (m.state !== 'chase' || m.d.ranged) continue; const d = hyp(m.x - P.x, m.y - P.y); if (d < nd && (m.target === P || d < 1.6)) { nd = d; near = m; } }
  if (!near) return false;
  const p = squadAway(near.x, near.y, 4, lead); if (!p) return false;
  P.path = [p]; A.moveUntil = time + 1; P.target = null; return true;
}
// Melee: move to the far side of the target from whoever it is fighting.
function squadFlank(A, t) {
  if (A.flankT > time) return false;
  const front = t.target; if (!front || front === P || front.dead || hyp(P.x - t.x, P.y - t.y) > S.range + 1.2) return false;
  A.flankT = time + 3;
  if ((P.x - t.x) * (front.x - t.x) + (P.y - t.y) * (front.y - t.y) <= 0) return false;   // already on the other side
  const ux = t.x - front.x, uy = t.y - front.y, ul = hyp(ux, uy) || 1, r = Math.max(0.9, S.range * 0.8), gx = t.x + ux / ul * r, gy = t.y + uy / ul * r;
  if (blocked(gx, gy) || !clearLine(P.x, P.y, gx, gy)) return false;
  P.path = [{ x: gx, y: gy }]; A.moveUntil = time + 0.8; if (P.target !== t) { P.target = t; P.repath = 0; }
  return true;
}
// A point d cells away from (fx, fy), leaning toward the lead hero, on a clear straight line.
function squadAway(fx, fy, d, lead) {
  let ux = P.x - fx, uy = P.y - fy; const ul = hyp(ux, uy) || 1; ux /= ul; uy /= ul;
  const lx = lead.x - P.x, ly = lead.y - P.y, ll = hyp(lx, ly);
  if (ll > 0.5 && lead !== P) { ux += lx / ll * 0.5; uy += ly / ll * 0.5; const n = hyp(ux, uy) || 1; ux /= n; uy /= n; }
  for (const a of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
    const c = Math.cos(a), s = Math.sin(a), vx = ux * c - uy * s, vy = ux * s + uy * c, x = P.x + vx * d, y = P.y + vy * d;
    if (!blocked(x, y) && map.reach[Math.floor(y) * map.w + Math.floor(x)] && clearLine(P.x, P.y, x, y)) return { x, y };
  }
  return null;
}
// Step out of a telegraph about to land (or a hostile zone). Cancels a cast that would not finish first.
function squadDodge(A) {
  let hit = null;
  for (const t of teles) { if (!t.m || t.m.dead) continue; const left = t.dur - t.t; if (left < 0.1) continue; if (hyp(P.x - t.x, P.y - t.y) <= t.r + 0.4) { hit = t; break; } }
  let zx = 0, zy = 0, zr = 0;
  if (!hit) for (const z of zones) if (z.hostile && hyp(P.x - z.x, P.y - z.y) <= z.r + 0.2) { zx = z.x; zy = z.y; zr = z.r; break; }
  if (!hit && !zr) return false;
  const cx = hit ? hit.x : zx, cy = hit ? hit.y : zy, r = hit ? hit.r : zr, d = hyp(P.x - cx, P.y - cy);
  if (P.casting) { if (hit && P.castT < hit.dur - hit.t - 0.05) return false; P.casting = null; P.castT = 0; }
  let fx = cx, fy = cy; if (d < 0.2) { fx = cx - (P.fy || 0.3); fy = cy + (P.fx || 0.7); }
  const p = squadAway(fx, fy, Math.max(1, r + 0.9 - d), leadHero()); if (!p) return false;
  P.path = [p]; P.pending = null; A.moveUntil = time + 0.8; return true;
}
// Walk to the formation slot (or the hold spot): a straight line when clear, else a path (the shared A* scratch).
function squadFollow(A, slot, lead, force) {
  let gx, gy;
  if (A.hold && A.holdAt && !force) { gx = A.holdAt.x; gy = A.holdAt.y; } else { const s = squadSlot(slot, lead); gx = s.x; gy = s.y; }
  const d = hyp(P.x - gx, P.y - gy);
  if (d < 1.1) { if (!P.pending && !P.target && (!P.path || !P.path.length)) { P.path = null; if (!lead.moving) face(P, lead); } return; }
  if (d < 2.2 && !force && !lead.moving && !A.hold) return;
  if (A.pathT > time && P.path && P.path.length) return;
  A.pathT = time + 0.5;
  if (clearLine(P.x, P.y, gx, gy)) P.path = [{ x: gx, y: gy }];
  else { goNear(P, gx, gy); if (!P.path) goNear(P, lead.x, lead.y); }
}

/* ---------- Saves (js/ui.js serialize / applySave call these) ---------- */
function squadHeroSave(h) {
  const o = {}; for (const k of SQUAD_HERO_KEYS) o[k] = h[k];
  const A = h.ai || {}; o.ai = { role: A.role, stance: A.stance, focus: A.focusMode || null, hold: !!A.hold, follow: A.follow !== false };
  if (h.dead) o.down = true;
  if (h === (PARTY && PARTY.owner)) o.owner = true;
  return o;
}
// serialize(): the top level stays your own hero (whoever you control), plus save.party and save.lead.
function squadSerialize(o) {
  if (!o || !PARTY || PARTY.members.indexOf(P) < 0 || PARTY.members.length < 2) return o;
  const own = PARTY.owner;
  if (typeof SAVE_KEYS !== 'undefined') for (const k of SAVE_KEYS) o[k] = own[k];
  o.party = PARTY.members.map(squadHeroSave); o.lead = PARTY.lead;
  return o;
}
// applySave(o): rebuild the party around the hero applySave just made (P). An old save (no party) is a party of one.
function squadRestore(o) {
  PARTY = null;
  if (!o || !Array.isArray(o.party) || o.party.length < 2 || !P) return;
  squadEnsure();
  const own = o.party.find(e => e && e.owner); if (own && own.ai) Object.assign(P.ai, { stance: own.ai.stance || 'aggressive', focusMode: own.ai.focus || null });
  for (const e of o.party) {
    if (!e || e.owner || PARTY.members.length >= SQUAD_MAX) continue;
    try { const h = squadHeroFrom(e); if (h) PARTY.members.push(h); } catch (err) { console.error(err); }
  }
  const lead = clamp(o.lead | 0, 0, PARTY.members.length - 1);
  if (lead && !PARTY.members[lead].dead) PARTY.wantLead = lead;
}
function squadHeroFrom(e) {
  const cd = typeof COMPANION_BY_ID !== 'undefined' ? COMPANION_BY_ID[e.persona || e.id] : null; if (!cd && !e.name) return null;
  const h = newPlayer(e.name || cd.name, e.hair || (cd && cd.hair), e.gender || (cd && cd.gender), e.hairStyle || (cd && cd.hairStyle));
  squadShare(h, PARTY.owner);
  for (const k of SQUAD_HERO_KEYS) if (e[k] !== undefined && e[k] !== null) h[k] = e[k];
  h.id = e.id || (cd && cd.id); h.persona = e.persona || (cd && cd.id) || h.id;
  if (!CLASSES[h.cls]) h.cls = cd ? cd.cls : 'novice';
  h.st = Object.assign({ str: 1, agi: 1, vit: 1, int: 1, dex: 1, luk: 1 }, h.st || {}); h.skills = Object.assign({ basic: 0, first_aid: 1 }, h.skills || {});
  const eq = h.equip || {}; h.equip = {}; for (const s of SLOTS) h.equip[s] = eq[s] && ITEMS[eq[s].id] ? eq[s] : null;
  h.hot = Array.isArray(h.hot) ? h.hot.slice(0, 9) : []; while (h.hot.length < 9) h.hot.push(null);
  const op = e.pet; h.pet = op && typeof PETS !== 'undefined' && PETS[op.type] ? { type: op.type, name: String(op.name || MOBS[op.type].name).slice(0, 16), hunger: clamp(+op.hunger || 0, 0, 100), intim: clamp(+op.intim || 1, 1, 1000), t: +op.t || 0 } : null;
  h.mounted = !!e.mounted && !!PARTY.owner.flags.warg && MOUNT_CLASSES.includes(h.cls);
  squadAiInit(h, (e.ai && e.ai.role) || (cd && cd.role)); if (e.ai) Object.assign(h.ai, { stance: SQUAD_STANCES[e.ai.stance] ? e.ai.stance : 'aggressive', focusMode: SQUAD_FOCUS.includes(e.ai.focus) ? e.ai.focus : null, hold: !!e.ai.hold, follow: e.ai.follow !== false });
  withHero(h, () => { resetRuntime(); calcStats(); P.hp = clamp(+e.hp || S.maxhp, 1, S.maxhp); P.sp = clamp(e.sp === undefined || e.sp === null ? S.maxsp : +e.sp, 0, S.maxsp); if (e.down) { P.dead = true; P.hp = 0; P.deathShown = true; } });
  return h;
}
// Until js/ui.js calls squadSerialize / squadRestore itself, wrap serialize / applySave (once, at load end).
function squadHookUI() {
  if (squadHookUI.done) return; if (typeof serialize !== 'function' || typeof applySave !== 'function') return;
  squadHookUI.done = true;
  if (!/squadSerialize/.test(String(serialize))) { const s0 = serialize; serialize = function () { const s = s0.apply(this, arguments); if (!s || !PARTY || PARTY.members.length < 2) return s; const o = JSON.parse(s); squadSerialize(o); return JSON.stringify(o); }; }
  if (!/squadRestore/.test(String(applySave))) { const a0 = applySave; applySave = function (o) { const r = a0.apply(this, arguments); squadRestore(o); return r; }; }
}
// Quest completions become 'quest_done' events.
function squadHookQuests() { if (squadHookQuests.done || typeof questOn !== 'function') return; squadHookQuests.done = true; questOn('complete', q => squadEmit('quest_done', { quest: q })); }
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => { squadHookUI(); squadHookQuests(); });

/* ---------- Events ---------- */
// Minimum seconds between two events of a type (low_hp is also once per dip per hero, idle once per 2 min).
const SQUAD_EV_GAP = { boss_seen: 15, low_hp: 6, ally_down: 2, level_up: 4, quest_done: 3, map_enter: 8, kill_mvp: 4, idle: 110, swap: 3, recruit: 0, loot_rare: 5 };
const SQUAD_LISTENERS = [];
function squadOn(fn) { if (typeof fn === 'function') SQUAD_LISTENERS.push(fn); }
function squadDispatch(type, data) {
  const now = time, E = PARTY.ev || (PARTY.ev = {});
  if (type === 'boss_seen' && data && data.mob) { if (data.mob._seen) return; data.mob._seen = true; }
  if (E[type] !== undefined && now - E[type] < (SQUAD_EV_GAP[type] || 0)) return;
  E[type] = now;
  const ev = Object.assign({ type, t: now }, data || {});
  for (const fn of SQUAD_LISTENERS) { try { fn(type, ev); } catch (e) { console.error(e); } }
  // Exactly one of: squadEvent (js/squad-chat.js defines it; it calls SQUAD_CHAT.event), SQUAD_CHAT.event, a local bark.
  if (typeof window.squadEvent === 'function') { try { window.squadEvent(type, ev); } catch (e) { console.error(e); } }
  else if (typeof SQUAD_CHAT !== 'undefined' && SQUAD_CHAT && typeof SQUAD_CHAT.event === 'function') { try { SQUAD_CHAT.event(type, ev); } catch (e) { console.error(e); } }
  else if (window.AOM_SQUAD_BARKS !== false) { const b = squadBark(type, ev); if (b) { const h = squadHero(b.who); slog(`${h ? h.name : b.who}: ${b.text}`, 'party'); if (h) floatText(h, '💬', 'info', true); } }
}
// Fill a line's placeholders: {subject} (the hero / monster / item / quest / map the event is about), {player} (your
// hero), {map}, {quest}, {area}; the chat relay (js/squad-chat.js) fills the same ones.
function squadFill(line, d = {}) {
  const nm = v => v && typeof v === 'object' ? (v.d && v.d.name) || (v.id && ITEMS[v.id] && typeof itemName === 'function' ? itemName(v) : '') || v.name || '' : v ? String(v) : '';
  const mp = d.map ? (MAPDEFS[d.map] ? MAPDEFS[d.map].name : nm(d.map)) : map ? map.d.name : '';
  const subj = nm(d.hero || d.to) || nm(d.mob) || nm(d.item) || (d.quest ? nm(d.quest) || (QUESTS[d.quest] ? QUESTS[d.quest].name : '') : '') || (d.map ? mp : '');
  return String(line).replace(/\{(subject|player|map|quest|area)\}/g, (m, k) => k === 'subject' ? subj || 'that' : k === 'player' ? (P ? (PARTY ? PARTY.owner.name : P.name) : 'friend') : k === 'map' ? mp : k === 'quest' ? (d.quest ? nm(d.quest) : '') : '');
}
// A fallback bark for an event: { who: heroId, text }. The speaker is a companion (never the hero you control), the
// event's subject for '<type>_self' lines, else someone who is standing. The relay's offline mode may use it.
function squadBark(type, d = {}) {
  if (!PARTY) return null;
  const subj = d.hero || d.to || null, pool = PARTY.members.filter(h => h.persona && !h.dead && h !== P && COMPANION_BY_ID[h.persona]);
  let who = null, key = type;
  if (type === 'low_hp' && subj && subj.persona && subj !== P && !subj.dead) { who = subj; key = 'low_hp_self'; }
  else if ((type === 'swap' || type === 'recruit') && subj && subj.persona) who = subj;
  else { const c = pool.filter(h => h !== subj); if (!c.length) return null; const heal = type === 'low_hp' ? c.find(h => h.ai && h.ai.role === 'healer') : null; who = heal || c[Math.floor(Math.random() * c.length)]; }
  const cd = COMPANION_BY_ID[who.persona]; if (!cd) return null;
  const lines = (cd.barks[key] || cd.barks[type] || []); if (!lines.length) return null;
  return { who: who.id, text: squadFill(lines[Math.floor(Math.random() * lines.length)], d).slice(0, 160) };
}

/* ---------- Hróðný's bench (Emberhold) ---------- */
async function talkRecruiter() {
  const N = NPCS.hrodny; squadEnsure(); let note = N.greet;
  for (let g = 0; g < 40; g++) {
    const own = PARTY.owner, have = new Set(PARTY.members.map(h => h.persona)), opts = [], act = [];
    for (const c of COMPANIONS_DATA) {
      if (have.has(c.id)) continue;
      const old = squadBench()[c.id], lvl = old ? old.lvl : squadRecruitLevel(c);
      opts.push(own.lvl < c.minLv ? `Recruit ${c.name} (Base Lv ${c.minLv})` : `Recruit ${c.name} (${fmt(SQUAD_FEE(lvl))}z)`); act.push(['r', c.id]);
    }
    for (const h of PARTY.members) if (h !== own) { opts.push(`Dismiss ${h.name}`); act.push(['d', h.id]); }
    opts.push(`Buy a Leaf of Yggdrasil (${fmt(ITEMS.ygg_leaf.price)}z)`); act.push(['leaf']);
    opts.push('Farewell'); act.push(['bye']);
    const roster = COMPANIONS_DATA.filter(c => !have.has(c.id)).map(c => `<b>${esc(c.name)}</b> · ${esc(CLASSES[c.cls].name)} · ${esc(SQUAD_ROLES[c.role].name)}: ${esc(c.blurb)}`).join('<br>');
    const r = await dialog(N.dname, `${note}<br><br><span class="muted">Your party: ${PARTY.members.map(h => esc(h.name) + (h === own ? ' (you)' : '')).join(', ')} (${PARTY.members.length}/${SQUAD_MAX}).</span><br>${roster}`, opts);
    const a = act[r]; if (!a || a[0] === 'bye') break;
    if (a[0] === 'r') { const c = COMPANION_BY_ID[a[1]], h = squadRecruit(a[1]); note = h ? `${c.name} gets up from the bench. “${squadFill(c.barks.recruit[0], { hero: h })}”` : `Hróðný shakes her head. ${own.lvl < c.minLv ? `${c.name} wants someone of Base Lv ${c.minLv} at least.` : PARTY.members.length >= SQUAD_MAX ? 'Your party is full.' : `The fee is ${fmt(SQUAD_FEE(squadRecruitLevel(c)))} zeny.`}`; }
    else if (a[0] === 'd') { const h = squadHero(a[1]), n = h && h.name; note = squadDismiss(a[1]) ? `${n} sits back down on the bench. “Send for me when you need me.”` : 'Hróðný raises an eyebrow. Not now.'; }
    else if (a[0] === 'leaf') { const t = ITEMS.ygg_leaf; if (P.zeny < t.price) note = `A leaf costs ${fmt(t.price)} zeny.`; else if (!bagRoom('ygg_leaf', 1)) note = 'Your bag is full.'; else { P.zeny -= t.price; addItem(makeItem('ygg_leaf', { qty: 1 })); Sfx.coin(); note = 'Hróðný wraps a green leaf in cloth. “For whoever falls first. Someone always does.”'; } }
  }
  $('dialog').hidden = true; UI.dirty = true;
}

/* ---------- Input: F1-F4 take control of party member 1-4, ` cycles (both control modes) ---------- */
if (typeof addEventListener === 'function') addEventListener('keydown', e => {
  if (!started || !PARTY || PARTY.members.length < 2 || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  const dlg = $('dialog'); if (dlg && !dlg.hidden) return;
  const k = SQUAD_KEYS.indexOf(e.code);
  if (k >= 0) { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat && k < PARTY.members.length) squadSwap(k); return; }
  if (e.code === 'Backquote') { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) squadCycle(e.shiftKey ? -1 : 1); }
}, true);
