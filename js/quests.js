'use strict';
/* =========================================================
   Quest engine. Data lives in js/data/quests.js (QUESTS, BOARDS).
   State (saved): P.quests = { active: { id: { p: [progress per objective], d: [announced done], r, day } },
                               done: { id: { n: times completed, day: 'YYYY-MM-DD' } }, track: id | null }
   Engine hooks called from other files:
     questEvent('kill', mob) · questEvent('pickup', itemId) · questEvent('talk', npcId)   (core.js / ui.js)
     questTick(dt)                  from update() while a game runs
     questDropsFor(mob)             extra quest-item drops when a monster dies
     questTalk(npc, def)            NPC quest menu (ui.js talkTo)
     questBoard(obj)                bounty board dialog (core.js useObj)
   Extension points for other teams:
     questMarkerFor(npcOrBoard)  -> '!' (quest available) | '?' (ready to turn in) | null
     questMarkerInfo(npcOrBoard) -> { mark, kind: 'main' | 'side' | 'daily' } | null
     questOn('accept' | 'progress' | 'ready' | 'complete' | 'abandon', fn(quest, ...))
     QUEST_UI.markers = false    when the renderer draws the markers itself (see drawQuestOverlay in ui.js)
     questSpots()                -> [{ x, y, kind, label }] quest places on the current map (minimap, overlay)
   Round 4 adds objective types scene / inspect / escort / waves / hunt, turn-in `choices`, reputation,
   titles and achievements (bottom of this file), weekly repeats and weekly boards (BOARDS[id].period).
   Runtime-only state (never saved): WAVE_RT (defence waves in progress); escort NPCs live in map.npcs.
   ========================================================= */
const QUEST_HOOKS = {};
function questOn(evt, fn) { (QUEST_HOOKS[evt] = QUEST_HOOKS[evt] || []).push(fn); }
function questEmit(evt, ...a) { for (const f of QUEST_HOOKS[evt] || []) { try { f(...a); } catch (e) { console.error(e); } } }

let QUEST_DAY = null; // set a 'YYYY-MM-DD' string to fake the date (tests)
function questDay() { if (QUEST_DAY) return QUEST_DAY; const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
// Week key for weekly repeats: weeks start on Monday (local date). 'W2923' etc.
function questWeek() { const [y, m, d] = questDay().split('-').map(Number); const days = Math.floor(Date.UTC(y, m - 1, d) / 86400000); return 'W' + Math.floor((days + 3) / 7); }
function questPeriodDone(q, d) { return !q.repeat ? true : q.repeat === 'weekly' ? d.week === questWeek() : d.day === questDay(); }
/* Reputation (P.flags.rep): standing with the peoples of Midgard, raised by quest choices. */
const REP_NAMES = { emberhold: 'Emberhold', rimeshore: 'Rimeshore', mirewell: 'Mirewell', dvergar: 'the Dvergar', dead: 'the Restless Dead' };
const repOf = f => (P && P.flags.rep && P.flags.rep[f]) || 0;
function repAdd(f, n, quiet) { P.flags.rep = P.flags.rep || {}; P.flags.rep[f] = repOf(f) + n; if (!quiet) { questToast(`Standing with ${REP_NAMES[f] || f} ${n > 0 ? '+' : ''}${n}`, 'obj'); log(`Your standing with ${REP_NAMES[f] || f} ${n > 0 ? 'rises' : 'falls'} (${repOf(f)}).`, 'quest'); } UI.dirty = true; }

function questNewState() { return { active: {}, done: {}, track: null }; }
function questNorm(q) {
  const s = Object.assign(questNewState(), q && typeof q === 'object' ? q : {});
  if (!s.active || typeof s.active !== 'object') s.active = {};
  if (!s.done || typeof s.done !== 'object') s.done = {};
  for (const id in s.active) { const q_ = QUESTS[id], a = s.active[id]; if (!q_ || !a) { delete s.active[id]; continue; } a.p = Array.isArray(a.p) ? a.p : []; a.d = Array.isArray(a.d) ? a.d : []; }
  if (s.track && !s.active[s.track]) s.track = null;
  return s;
}

/* ---------- Objectives ---------- */
const listOf = x => [].concat(x || []);
const mobName = k => (MOBS[k] && MOBS[k].name) || k;
function objMax(o) { return o.type === 'kill' || o.type === 'collect' || o.type === 'deliver' || o.type === 'visit' ? (o.n || 1) : o.type === 'survive' ? o.secs : o.type === 'level' ? (o.lvl || o.jlvl) : o.type === 'cond' && o.prog ? o.prog()[1] : o.type === 'inspect' ? o.spots.length : o.type === 'waves' ? o.waves.length : 1; }
function objCur(q, a, i) {
  const o = q.obj[i], max = objMax(o);
  if (o.check && o.check()) return max;
  switch (o.type) {
    case 'kill': case 'visit': case 'waves': return Math.min(max, a.p[i] || 0);
    case 'inspect': return Math.min(max, ((a.ins && a.ins[i]) || []).length);
    case 'collect': return Math.min(max, countItem(o.item));
    case 'deliver': return a.p[i] ? max : Math.min(max, countItem(o.item));
    case 'boss': return P.flags.bosses[o.mob] ? 1 : 0;
    case 'survive': return Math.min(max, Math.floor(a.p[i] || 0));
    case 'level': return Math.min(max, o.lvl ? P.lvl : P.jlvl);
    case 'cond': return o.prog ? Math.min(max, o.prog()[0]) : 0;
    default: return a.p[i] ? 1 : 0; // talk, reach, scene, escort, hunt
  }
}
function objDone(q, a, i) {
  const o = q.obj[i];
  if (o.check && o.check()) return true;
  if (o.type === 'deliver') return !!a.p[i];
  if (o.type === 'cond') return !o.check && o.prog ? o.prog()[0] >= o.prog()[1] : false;
  return objCur(q, a, i) >= objMax(o);
}
// Objective i is open when it can progress (sequential quests unlock objectives in order).
function objOpen(q, a, i) { if (!q.seq) return true; for (let j = 0; j < i; j++) if (!objDone(q, a, j)) return false; return true; }
function objLabel(o) {
  if (o.label) return o.label;
  if (o.type === 'kill') return listOf(o.mob).map(mobName).join(' / ');
  if (o.type === 'collect' || o.type === 'deliver') return ITEMS[o.item] ? ITEMS[o.item].name : o.item;
  return '';
}
function objText(o) {
  if (o.text) return o.text;
  const nm = k => (NPCS[k] && NPCS[k].name) || k, mp = k => (MAPDEFS[k] && MAPDEFS[k].name) || k;
  switch (o.type) {
    case 'kill': return `Defeat ${objLabel(o)} ×${o.n}`;
    case 'collect': return `Collect ${objLabel(o)} ×${o.n}`;
    case 'deliver': return `Bring ${o.n > 1 ? o.n + ' ' : ''}${objLabel(o)} to ${nm(o.npc)}`;
    case 'talk': return `Speak with ${nm(o.npc)}`;
    case 'reach': return o.place ? `Reach ${o.place} (${mp(o.map)})` : `Travel to ${mp(o.map)}`;
    case 'boss': return `Defeat ${mobName(o.mob)}`;
    case 'survive': return `Hold ${o.place || 'your ground'} for ${o.secs}s (${mp(o.map)})`;
    case 'level': return o.lvl ? `Reach Base Lv ${o.lvl}` : `Reach Job Lv ${o.jlvl}`;
    case 'visit': return `${o.verb || 'Visit'} ${o.n} ${o.place || 'places'} (${mp(o.map)})`;
    case 'scene': return o.npc ? `Speak with ${nm(o.npc)}` : `Go to ${o.place || 'the place'} (${mp(o.map)})`;
    case 'inspect': return `Investigate ${o.place || 'the area'} (${mp(o.map)})`;
    case 'escort': return `Escort ${nm(o.npc)} to ${o.place || 'safety'} (${mp(o.map)})`;
    case 'waves': return `Hold ${o.place || 'the line'} against ${o.waves.length} waves (${mp(o.map)})`;
    case 'hunt': return `Hunt ${mobName(o.mob)}${o.place ? ' at ' + o.place : ''} (${mp(o.map)})`;
    default: return '…';
  }
}
// [text, cur, max, done, open] for each objective (used by the log, tracker and dialogs).
function questObjectives(id) {
  const q = QUESTS[id], a = P.quests.active[id] || { p: [], d: [] };
  return q.obj.map((o, i) => { const max = objMax(o), done = objDone(q, a, i); return { text: objText(o), cur: done ? max : objCur(q, a, i), max, done, open: objOpen(q, a, i), counted: max > 1, type: o.type, live: done ? '' : objLive(q, a, i) }; });
}
// A short live status for running objectives (defence timer, escort health).
function objLive(q, a, i) {
  const o = q.obj[i];
  if (o.type === 'waves') { const W = WAVE_RT[q.id + ':' + i]; return W ? (W.gap > 0 ? `wave ${W.k + 1} incoming` : `wave ${W.k + 1}/${o.waves.length} · ${Math.max(0, Math.ceil(W.t))}s`) : ''; }
  if (o.type === 'escort') { const s = a.esc && a.esc[i]; return s && s.hp < (o.hp || 100) ? `${Math.max(0, Math.round(s.hp / (o.hp || 100) * 100))}% health` : ''; }
  return '';
}

/* ---------- Status ---------- */
const BOARD_CACHE = {};
function boardToday(bid) {
  const b = BOARDS[bid]; if (!b) return [];
  const day = b.period === 'week' ? questWeek() : questDay(), key = bid + '|' + day; if (BOARD_CACHE[key]) return BOARD_CACHE[key];
  let h = 2166136261; for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rng = mulberry32(h >>> 0), pool = b.pool.slice();
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
  return (BOARD_CACHE[key] = pool.slice(0, b.perDay || 1));
}
function questReqMet(q) {
  const r = q.req || {};
  if (r.lvl && P.lvl < r.lvl) return false;
  if (r.jlvl && P.jlvl < r.jlvl) return false;
  if (r.cls && !r.cls.some(c => jobOk({ jobs: [c] }, P.cls))) return false;
  if (r.quests && !r.quests.every(id => P.quests.done[id])) return false;
  if (r.test && !r.test()) return false;
  if (r.rep && Object.keys(r.rep).some(f => repOf(f) < r.rep[f])) return false;
  if ((q.kind === 'daily' || q.kind === 'weekly') && BOARDS[q.giver] && !boardToday(q.giver).includes(q.id)) return false;
  return true;
}
function questDoneToday(id) { const d = P.quests.done[id]; return !!d && d.day === questDay(); }
function questDonePeriod(id) { const d = P.quests.done[id]; return !!d && questPeriodDone(QUESTS[id], d); }
function questReady(id) { const q = QUESTS[id], a = P.quests.active[id]; if (!q || !a) return false; for (let i = 0; i < q.obj.length; i++) if (!objDone(q, a, i)) return false; return true; }
// 'locked' | 'available' | 'active' | 'ready' | 'done'
function questStatus(id) {
  const q = QUESTS[id]; if (!q || !P || !P.quests) return 'locked';
  if (P.quests.active[id]) return questReady(id) ? 'ready' : 'active';
  if (P.quests.done[id] && (!q.repeat || questDonePeriod(id))) return 'done';
  return questReqMet(q) ? 'available' : 'locked';
}
const questTurnIn = q => q.turnIn === undefined ? q.giver : q.turnIn;

/* ---------- Accept / complete / abandon ---------- */
function questAccept(id, o = {}) {
  const q = QUESTS[id]; if (!q || questStatus(id) !== 'available') return false;
  P.quests.active[id] = { p: q.obj.map(() => 0), d: q.obj.map(() => 0), day: questDay() };
  for (const [iid, n] of q.give || []) { const it = makeItem(iid, { qty: n }); giveItem(it, questGiverName(q.giver)); }
  const tr = P.quests.track && P.quests.active[P.quests.track] ? QUESTS[P.quests.track] : null;
  if (!tr || (!o.silent && q.kind !== 'main') || (q.kind === 'main' && tr.kind === 'main')) P.quests.track = id;
  if (!o.silent) { questToast(`New quest · ${q.name}`, 'new'); log(`New quest: ${q.name}. ${q.summary || ''}`, 'quest'); Sfx.rare(); }
  if (q.onAccept) q.onAccept(q);
  questEmit('accept', q);
  UI.dirty = true;
  if (!o.noRefresh) questRefresh(o);
  return true;
}
function questAbandon(id) {
  const q = QUESTS[id]; if (!q || !P.quests.active[id] || q.kind === 'main') return false;
  delete P.quests.active[id];
  questCleanup(id);
  for (const [iid, n] of q.give || []) if (countItem(iid)) takeItem(iid, Math.min(n, countItem(iid)));
  for (const d of q.drops || []) if (countItem(d.item) && !Object.keys(P.quests.active).some(k => (QUESTS[k].drops || []).some(x => x.item === d.item))) takeItem(d.item, countItem(d.item));
  if (P.quests.track === id) P.quests.track = questPickTrack();
  log(`Quest abandoned: ${q.name}.`, 'quest'); questEmit('abandon', q); UI.dirty = true;
  return true;
}
// Escort NPCs, defence waves and hunted monsters of a quest that ended or was abandoned.
function questCleanup(id) {
  for (const k in mapCache) { const m = mapCache[k]; m.npcs = m.npcs.filter(n => n.escort !== id); }
  for (const t in WAVE_RT) if (t.startsWith(id + ':')) { for (const m of WAVE_RT[t].mobs) if (!m.dead) { const i = mobs.indexOf(m); if (i >= 0) mobs.splice(i, 1); } delete WAVE_RT[t]; }
  if (typeof npcSync === 'function') npcSync();
}
const questRewardOf = (q, c) => (c !== undefined && q.choices && q.choices[c] && q.choices[c].reward) || q.reward || {};
function questRewardItems(q, c) { const r = questRewardOf(q, c); return typeof r.items === 'function' ? r.items(P) : (r.items || []); }
function questRewardText(q, c) {
  const r = questRewardOf(q, c), out = [];
  if (r.exp) out.push(`${fmt(r.exp)} Base EXP`); if (r.jexp) out.push(`${fmt(r.jexp)} Job EXP`); if (r.zeny) out.push(`${fmt(r.zeny)} zeny`);
  for (const [iid, n, oo] of questRewardItems(q, c)) if (ITEMS[iid]) out.push(`${oo && oo.refine ? '+' + oo.refine + ' ' : ''}${ITEMS[iid].name}${n > 1 ? ' ×' + n : ''}`);
  if (r.title && TITLES[r.title]) out.push(`Title: ${TITLES[r.title]}`);
  for (const f in r.rep || {}) out.push(`Standing: ${REP_NAMES[f] || f} ${r.rep[f] > 0 ? '+' : ''}${r.rep[f]}`);
  if (r.lore && LORE[r.lore]) out.push(`Chronicle: ${LORE[r.lore][0]}`);
  return out.join(' · ');
}
function questComplete(id, o = {}) {
  const q = QUESTS[id], a = P.quests.active[id]; if (!q || !a) return false;
  const ch = q.choices && o.choice !== undefined ? q.choices[o.choice] : null;
  q.obj.forEach(ob => { if (ob.type === 'collect' && !ob.keep && !o.noReward) takeItem(ob.item, Math.min(ob.n || 1, countItem(ob.item))); });
  for (const [iid] of q.give || []) if (countItem(iid)) takeItem(iid, countItem(iid));
  if (!o.noReward) for (const [iid, n] of [...(q.take || []), ...((ch && ch.take) || [])]) removeItems(iid, n);
  delete P.quests.active[id]; questCleanup(id);
  const prev = P.quests.done[id]; P.quests.done[id] = { n: ((prev && prev.n) || 0) + 1, day: questDay(), week: questWeek() };
  if (ch) P.quests.done[id].c = o.choice;
  if (!o.noReward) {
    const r = questRewardOf(q, o.choice);
    if (r.zeny) P.zeny += r.zeny;
    for (const f in r.rep || {}) repAdd(f, r.rep[f], o.silent);
    if (r.flag) Object.assign(P.flags, r.flag);
    if (r.title) grantTitle(r.title, o.silent);
    for (const [iid, n, oo] of questRewardItems(q, o.choice)) {
      if (!ITEMS[iid]) continue; const it = makeItem(iid, { qty: n || 1 }); if (oo && oo.refine && it.refine !== undefined) it.refine = oo.refine;
      giveItem(it, q.name);   // round 5: a full bag sends the reward to the mailbox instead of the ground
    }
    if (r.lore) P.flags.lore[r.lore] = true;
    if (!o.silent) { banner('Quest Complete', q.name, 'band gold'); log(`Quest complete: ${q.name}.${questRewardText(q, o.choice) ? ' Reward: ' + questRewardText(q, o.choice) + '.' : ''}`, 'quest'); Sfx.level(); }
    if (r.exp || r.jexp) gainExp(r.exp || 0, r.jexp || 0);
  }
  if (P.quests.track === id || !P.quests.active[P.quests.track]) P.quests.track = questPickTrack();
  if (q.onComplete && !o.noReward) q.onComplete(q, o.choice);
  questEmit('complete', q, o);
  UI.dirty = true;
  if (!o.silent && started) saveGame();
  return true;
}
function questPickTrack() {
  const ids = Object.keys(P.quests.active); if (!ids.length) return null;
  return ids.find(k => QUESTS[k].kind !== 'main') || ids[0];
}
// Accept auto quests, announce finished objectives, complete self-finishing quests. Repeats until stable.
function questRefresh(o = {}) {
  if (!P || !P.quests) return;
  for (let guard = 0; guard < 30; guard++) {
    let changed = false;
    for (const id in QUESTS) if (QUESTS[id].auto && questStatus(id) === 'available') { questAccept(id, Object.assign({}, o, { noRefresh: true })); changed = true; }
    for (const id of Object.keys(P.quests.active)) {
      const q = QUESTS[id], a = P.quests.active[id];
      q.obj.forEach((ob, i) => { if (!a.d[i] && objDone(q, a, i)) { a.d[i] = 1; if (!o.silent && ob.type !== 'kill' && ob.type !== 'collect') questToast(`✓ ${objText(ob)}`, 'obj'); UI.dirty = true; } });
      if (!questReady(id)) { a.r = 0; continue; }
      if (questTurnIn(q) == null) { questComplete(id, o); changed = true; continue; }
      if (!a.r) { a.r = 1; questEmit('ready', q); if (!o.silent) { questToast(`${q.name} · return to ${questGiverName(questTurnIn(q))}`, 'ready'); log(`${q.name}: all done. Return to ${questGiverName(questTurnIn(q))}.`, 'quest'); } UI.dirty = true; }
    }
    if (!changed) break;
  }
}
function questGiverName(id) { return NPCS[id] ? NPCS[id].name : BOARDS[id] ? `the ${BOARDS[id].title} ${BOARDS[id].name}` : id; }

/* ---------- Events ---------- */
function questEvent(type, arg) {
  if (!P || !P.quests) return;
  let touched = false;
  for (const id of Object.keys(P.quests.active)) {
    const q = QUESTS[id], a = P.quests.active[id];
    q.obj.forEach((o, i) => {
      if (!objOpen(q, a, i) || objDone(q, a, i)) return;
      if (type === 'kill' && o.type === 'hunt' && arg.variant === o.mob) {
        a.p[i] = 1; touched = true; questToast(`✓ ${mobName(o.mob)} is dead`, 'obj'); questEmit('progress', q, i);
      } else if (type === 'kill' && o.type === 'kill' && (listOf(o.mob).includes(arg.type) || (arg.variant && listOf(o.mob).includes(arg.variant))) && (!o.magic || arg.lastMagic)) {
        a.p[i] = (a.p[i] || 0) + 1; touched = true;
        questToast(`${objLabel(o)} ${Math.min(a.p[i], o.n)}/${o.n}`, a.p[i] >= o.n ? 'obj' : ''); questEmit('progress', q, i);
      } else if (type === 'pickup' && o.type === 'collect' && o.item === arg) {
        const c = countItem(arg); touched = true;
        if (c <= o.n) { questToast(`${objLabel(o)} ${c}/${o.n}`, c >= o.n ? 'obj' : ''); questEmit('progress', q, i); }
      } else if (type === 'talk' && o.type === 'talk' && o.npc === arg) {
        a.p[i] = 1; touched = true; questEmit('progress', q, i);
        for (const [iid, n] of o.gives || []) { const it = makeItem(iid, { qty: n || 1 }); giveItem(it, questGiverName(o.npc)); log(`You receive ${ITEMS[iid].name}${n > 1 ? ' ×' + n : ''}.`, 'quest'); }
      } else if (type === 'talk' && o.type === 'deliver' && o.npc === arg && countItem(o.item) >= (o.n || 1)) {
        takeItem(o.item, o.n || 1); a.p[i] = 1; touched = true; log(`You hand over ${objLabel(o)}.`, 'quest'); questEmit('progress', q, i);
      }
    });
  }
  if (touched) { UI.dirty = true; questRefresh(); }
}
function questDropsFor(m) {
  const out = []; if (!P || !P.quests) return out;
  for (const id of Object.keys(P.quests.active)) {
    const q = QUESTS[id], a = P.quests.active[id];
    for (const d of q.drops || []) {
      if (!listOf(d.mob).includes(m.type)) continue;
      const i = q.obj.findIndex(o => o.type === 'collect' && o.item === d.item);
      const need = i >= 0 ? q.obj[i].n : 1;
      if (i >= 0 && !objOpen(q, a, i)) continue;
      if (countItem(d.item) + drops.filter(x => x.item && x.item.id === d.item).length >= need) continue;
      if (Math.random() < d.chance) out.push(d.item);
    }
  }
  return out;
}
let questTickT = 0;
function questTick(dt) {
  if (!P || !P.quests || !map) return;
  for (const id of Object.keys(P.quests.active)) {
    const q = QUESTS[id], a = P.quests.active[id];
    q.obj.forEach((o, i) => {
      if (o.type !== 'survive' || objDone(q, a, i) || !objOpen(q, a, i)) return;
      if (P.dead) { if (a.p[i] > 0) { a.p[i] = 0; a.w = 0; log(`${q.name}: you fell. The count starts again.`, 'warn'); UI.dirty = true; } return; }
      const inside = P.map === o.map && (o.x === undefined || Math.hypot(P.x - o.x, P.y - o.y) <= (o.r || 5));
      if (!inside) return;
      const before = Math.floor(a.p[i] || 0); a.p[i] = (a.p[i] || 0) + dt;
      if (before === 0 && a.p[i] < 1 && !a.w) questToast(`Hold ${o.place || 'your ground'} · ${o.secs}s`, 'new');
      if (Math.floor(a.p[i] / 10) > Math.floor(before / 10) && a.p[i] < o.secs) questToast(`${q.name} ${Math.floor(a.p[i])}/${o.secs}s`);
      if (o.wave) { a.w = (a.w || 0) - dt; if (a.w <= 0) { a.w = o.wave.every || 10; questWave(o); } }
      if (a.p[i] >= o.secs) { questToast(`${q.name} ${o.secs}/${o.secs}s`, 'obj'); UI.dirty = true; }
    });
  }
  questTickVisit(dt);
  questTickEscort(dt); questTickWaves(dt);
  questTickT -= dt; if (questTickT > 0) return; questTickT = 0.25;
  for (const id of Object.keys(P.quests.active)) {
    const q = QUESTS[id], a = P.quests.active[id];
    q.obj.forEach((o, i) => {
      if (!objOpen(q, a, i) || P.map !== o.map || P.dead) return;
      if (o.type === 'reach' && !a.p[i]) { if (o.x === undefined || Math.hypot(P.x - o.x, P.y - o.y) <= (o.r || 3)) { a.p[i] = 1; questEmit('progress', q, i); UI.dirty = true; } }
      else if (o.type === 'scene' && !o.npc && !a.p[i] && !objDone(q, a, i) && Math.hypot(P.x - o.x, P.y - o.y) <= (o.r || 3)) questPlayObj(q, i);
      else if (o.type === 'inspect' && !objDone(q, a, i)) questTickInspect(q, a, i);
      else if (o.type === 'hunt' && !a.p[i]) questTickHunt(q, a, i);
    });
  }
  if (typeof npcSync === 'function') npcSync();
  achTick(0.25);
  questRefresh();
}
/* ---------- Round 4 objective types ----------
   scene   { scene, npc } plays SCENES[scene] (js/data/npcs.js) when you talk to npc, or { scene, map, x, y, r } when
           you walk into the spot. Done when the scene ends.
   inspect { map, spots: [{ x, y, name, text: [pages] }], r, place } walk up to each spot: its pages play (camera on it).
   escort  { npc, map, from: [x, y], to: [x, y], r, place, hp, dmg, speed } the NPC follows you (within 14 cells);
           monsters chasing you near it hurt it (dmg HP/s each); at 0 it runs back to `from`. Done when it is within r of `to`.
   waves   { map, x, y, r, place, waves: [[[mob, n], ...], ...], limit, gap } stand within r to start; each wave must be
           cleared within `limit` seconds. Leaving (r + 8), dying, resting or the timer running out starts it over.
   hunt    { mob: variantKey, map, x, y, place } the named monster (MOBS[key].variant) appears there while needed. */
function questPlayObj(q, i) {
  if (typeof playScene !== 'function' || (typeof CINE !== 'undefined' && CINE.busy)) return false;
  const o = q.obj[i];
  playScene(o.scene, { quest: q.id }).then(played => { const a = P.quests.active[q.id]; if (played && a && !a.p[i]) { a.p[i] = 1; questEmit('progress', q, i); UI.dirty = true; questRefresh(); } });
  return true;
}
// A scene the NPC must play before its quest menu: an open scene objective, or a STORY_TALK beat (js/data/quests.js).
function storyBeatFor(npc) {
  if (!P || !P.quests) return null;
  for (const id in P.quests.active) {
    const q = QUESTS[id], a = P.quests.active[id];
    for (let i = 0; i < q.obj.length; i++) { const o = q.obj[i]; if (o.type === 'scene' && o.npc === npc && !a.p[i] && objOpen(q, a, i) && !objDone(q, a, i)) return { qid: id, i, scene: o.scene }; }
  }
  for (const b of STORY_TALK) if (b.npc === npc && b.when()) return { scene: b.scene };
  return null;
}
async function playBeat(b, n) {
  const played = await playScene(b.scene, { npc: n, quest: b.qid });
  if (played && b.qid) { const a = P.quests.active[b.qid]; if (a && !a.p[b.i]) { a.p[b.i] = 1; questEmit('progress', QUESTS[b.qid], b.i); } }
  UI.dirty = true; questRefresh();
}
function questTickInspect(q, a, i) {
  const o = q.obj[i]; a.ins = a.ins || {}; const got = a.ins[i] = a.ins[i] || [];
  if (typeof CINE !== 'undefined' && CINE.busy) return;
  o.spots.some((sp, k) => {
    if (got.includes(k) || Math.hypot(P.x - sp.x, P.y - sp.y) > (o.r || 1.8)) return false;
    playScene(async () => { cineFocus(sp); await say(sp.name || o.place || 'Something here', sp.text); }).then(played => {
      const aa = P.quests.active[q.id]; if (!played || !aa) return; aa.ins = aa.ins || {}; const g = aa.ins[i] = aa.ins[i] || [];
      if (!g.includes(k)) g.push(k); questToast(`${o.place || 'Investigated'} ${g.length}/${o.spots.length}`, g.length >= o.spots.length ? 'obj' : ''); questEmit('progress', q, i); UI.dirty = true; questRefresh();
    });
    return true;
  });
}
function questTickHunt(q, a, i) {
  const o = q.obj[i];
  if (mobs.some(m => m.variant === o.mob && !m.dead)) return;
  const s = nearestOpen(o.x, o.y, 4); if (!s) return;
  const m = makeVariant(o.mob, s.x + 0.5, s.y + 0.5); m.questHunt = q.id; mobs.push(m);
  burst(m.x, m.y, 20, (m.d.glow || '#e8d8c0'), 20, 2.5);
  questToast(`${m.d.name} stalks ${o.place || MAPDEFS[o.map].name}`, 'new'); log(`${m.d.name} is here${o.place ? ', at ' + o.place : ''}.`, 'quest');
}
function questTickEscort(dt) {
  if (!map || !P.quests) return;
  for (const id of Object.keys(P.quests.active)) {
    const q = QUESTS[id], a = P.quests.active[id];
    q.obj.forEach((o, i) => {
      if (o.type !== 'escort' || a.p[i] || !objOpen(q, a, i)) return;
      a.esc = a.esc || {}; const full = o.hp || 100; let s = a.esc[i]; if (!s) s = a.esc[i] = { x: o.from[0], y: o.from[1], hp: full };
      if (P.map !== o.map) return;
      let n = map.npcs.find(e => e.escort === id && e.id === o.npc);
      if (!n) { const D = NPCS[o.npc] || {}; n = { id: o.npc, name: D.name || o.npc, title: D.title, x: s.x, y: s.y, dir: 1, look: D.look, escort: id }; map.npcs.push(n); }
      if (typeof CINE !== 'undefined' && CINE.active) return;
      const d = dist(n, P);
      if (d > 1.8 && d < 14 && !P.dead) { n.escT = (n.escT || 0) - dt; if (!n.path || n.escT <= 0) { n.escT = 0.4; goNear(n, P.x, P.y); } followPath(n, dt, o.speed || 3.8); }
      else { n.path = null; n.moving = false; }
      if (d >= 14 && !(n.waitT > time - 8)) { n.waitT = time; questToast(`${n.name} is waiting for you`, ''); }
      let hurt = 0; for (const m of mobs) if (!m.dead && !m.d.inert && m.state === 'chase' && Math.hypot(m.x - n.x, m.y - n.y) < 1.6) hurt += o.dmg || 6;
      if (hurt) { s.hp -= hurt * dt; n.hurtT = 0.2; if (!(n.helpT > time - 2.5)) { n.helpT = time; floatText(n, 'Help!', 'miss'); } }
      s.x = n.x; s.y = n.y;
      if (s.hp <= 0) {
        s.hp = full; s.x = o.from[0]; s.y = o.from[1]; n.x = s.x; n.y = s.y; n.path = null;
        questToast(`${n.name} fled back to the start`, ''); log(`${n.name} is hurt and runs back the way you came. Go and fetch them again.`, 'warn'); UI.dirty = true;
      } else if (Math.hypot(n.x - o.to[0], n.y - o.to[1]) <= (o.r || 2.5)) {
        a.p[i] = 1; map.npcs.splice(map.npcs.indexOf(n), 1); pillar({ x: n.x, y: n.y, kind: 'fx' }, '#fff2b8'); Sfx.heal();
        questToast(`✓ ${n.name} is safe`, 'obj'); questEmit('progress', q, i); UI.dirty = true; if (typeof npcSync === 'function') npcSync(); questRefresh();
      }
    });
  }
}
const WAVE_RT = {}; // runtime state of defence waves: tag -> { k, t, gap, mobs }
function questTickWaves(dt) {
  if (!map || !P.quests) return;
  for (const id of Object.keys(P.quests.active)) {
    const q = QUESTS[id], a = P.quests.active[id];
    q.obj.forEach((o, i) => {
      if (o.type !== 'waves' || objDone(q, a, i) || !objOpen(q, a, i)) return;
      const tag = id + ':' + i, R = o.r || 6; let W = WAVE_RT[tag];
      const inside = P.map === o.map && !P.dead && Math.hypot(P.x - o.x, P.y - o.y) <= R;
      if (!W) {
        if (!inside || (a.wcool && a.wcool > time) || (typeof CINE !== 'undefined' && CINE.active)) return;
        W = WAVE_RT[tag] = { k: 0, t: o.limit || 45, gap: 1.5, mobs: [] }; a.p[i] = 0; delete a.wcool;
        questToast(`${o.place || 'Hold the line'} · ${o.waves.length} waves`, 'new'); log(`${q.name}: they are coming. Clear each wave within ${o.limit || 45} seconds.`, 'quest'); return;
      }
      const vanished = W.mobs.some(m => !m.dead && !mobs.includes(m));
      const fail = why => { for (const m of W.mobs) if (!m.dead) { const j = mobs.indexOf(m); if (j >= 0) mobs.splice(j, 1); } delete WAVE_RT[tag]; a.p[i] = 0; a.wcool = time + 5; questToast(`${q.name}: ${why}`, ''); log(`${q.name}: ${why} Step back in to start again.`, 'warn'); UI.dirty = true; };
      if (P.dead || P.map !== o.map || Math.hypot(P.x - o.x, P.y - o.y) > R + 8) { fail(P.dead ? 'you fell. The line breaks.' : 'you left your post.'); return; }
      if (vanished) { fail('the line was broken.'); return; }
      if (W.gap > 0) {
        W.gap -= dt; if (W.gap > 0) return;
        W.t = o.limit || 45; W.mobs = [];
        for (const [mob, n] of o.waves[W.k]) for (let k = 0; k < n; k++) {
          const ang = Math.random() * 6.283, s = nearestOpen(o.x + Math.cos(ang) * rand(4.5, 6.5), o.y + Math.sin(ang) * rand(4.5, 6.5), 3); if (!s) continue;
          const m = makeMob(mob, s.x + 0.5, s.y + 0.5, { summoned: true }); m.state = 'chase'; m.questWave = true; m.qwTag = tag; mobs.push(m); W.mobs.push(m);
          burst(m.x, m.y, 10, '#7a6a5a', 12, 2);
        }
        banner(`Wave ${W.k + 1} of ${o.waves.length}`, o.place || '', 'band'); Sfx.boss(); UI.dirty = true; return;
      }
      W.t -= dt;
      if (!W.mobs.some(m => !m.dead)) {
        W.k++; a.p[i] = W.k; UI.dirty = true; questEmit('progress', q, i);
        if (W.k >= o.waves.length) { delete WAVE_RT[tag]; questToast(`✓ ${o.place || 'The line'} holds`, 'obj'); questRefresh(); }
        else { W.gap = o.gap || 4; questToast(`Wave ${W.k}/${o.waves.length} cleared`, 'obj'); }
      } else if (W.t <= 0) fail('time ran out. The line breaks.');
      else if (Math.floor(W.t) % 10 === 0 && Math.floor(W.t + dt) !== Math.floor(W.t)) questToast(`${Math.floor(W.t)}s left`);
    });
  }
}
// Quest places on the current map, for the minimap and the overlay: { x, y, kind, label }.
function questSpots() {
  const out = []; if (!P || !P.quests || !map) return out;
  for (const id in P.quests.active) {
    const q = QUESTS[id], a = P.quests.active[id];
    q.obj.forEach((o, i) => {
      if (o.map !== map.id || !objOpen(q, a, i) || objDone(q, a, i)) return;
      if (o.type === 'inspect') o.spots.forEach((sp, k) => { if (!((a.ins && a.ins[i]) || []).includes(k)) out.push({ x: sp.x, y: sp.y, kind: 'inspect', label: sp.name }); });
      else if ((o.type === 'reach' || o.type === 'survive' || o.type === 'waves' || o.type === 'hunt' || (o.type === 'scene' && !o.npc)) && o.x !== undefined) out.push({ x: o.x, y: o.y, kind: o.type, label: o.place });
      else if (o.type === 'escort') out.push({ x: o.to[0], y: o.to[1], kind: 'escort', label: o.place });
    });
  }
  return out;
}
// 'visit' objectives: stand beside N different tiles of kind o.tile on o.map for o.secs each (e.g. cleanse graves).
function questTickVisit(dt) {
  for (const id of Object.keys(P.quests.active)) {
    const q = QUESTS[id], a = P.quests.active[id];
    q.obj.forEach((o, i) => {
      if (o.type !== 'visit' || P.map !== o.map || P.dead || objDone(q, a, i) || !objOpen(q, a, i)) return;
      a.vis = a.vis || {}; const seen = a.vis[i] = a.vis[i] || [];
      let near = -1;
      for (let dy = -2; dy <= 2 && near < 0; dy++) for (let dx = -2; dx <= 2; dx++) {
        const x = Math.floor(P.x) + dx, y = Math.floor(P.y) + dy; if (x < 0 || y < 0 || x >= map.w || y >= map.h) continue;
        const k = y * map.w + x; if (map.t[k] === o.tile && !seen.includes(k) && Math.hypot(x + 0.5 - P.x, y + 0.5 - P.y) <= (o.r || 1.7)) { near = k; break; }
      }
      if (near < 0) { a.vt = 0; return; }
      if (!a.vt) questToast(`${o.verb || 'Visiting'}… stay close`, 'new');
      a.vt = (a.vt || 0) + dt;
      if (Math.random() < 0.3) burst(near % map.w + 0.5, Math.floor(near / map.w) + 0.5, rand(4, 30), o.col || '#fff2b8', 1, 0.6);
      if (a.vt >= (o.secs || 2)) {
        a.vt = 0; seen.push(near); a.p[i] = (a.p[i] || 0) + 1; UI.dirty = true;
        pillar({ x: near % map.w + 0.5, y: Math.floor(near / map.w) + 0.5, kind: 'fx' }, o.col || '#fff2b8', true); Sfx.heal();
        questToast(`${o.place || 'Places'} ${Math.min(a.p[i], o.n)}/${o.n}`, a.p[i] >= o.n ? 'obj' : ''); questEmit('progress', q, i);
      }
    });
  }
}
function questWave(o) {
  const n = Math.min(o.wave.n || 2, (o.wave.max || 6) - mobs.filter(m => m.questWave && !m.dead).length);
  for (let k = 0; k < n; k++) {
    const ang = Math.random() * 6.283, s = nearestOpen(P.x + Math.cos(ang) * 5.5, P.y + Math.sin(ang) * 5.5, 3); if (!s) continue;
    const m = makeMob(pick(o.wave.mobs), s.x + 0.5, s.y + 0.5, { summoned: true }); m.state = 'chase'; m.questWave = true; mobs.push(m);
    burst(m.x, m.y, 10, '#7a6a5a', 12, 2);
  }
}

/* ---------- NPC markers ---------- */
function questGiverId(e) { return e ? (e.board || e.id) : null; }
function questMarkerInfo(e) {
  const gid = questGiverId(e); if (!gid || !P || !P.quests || !started) return null;
  let avail = null;
  for (const id in P.quests.active) {
    const q = QUESTS[id], a = P.quests.active[id];
    if (questTurnIn(q) === gid && questReady(id)) return { mark: '?', kind: q.kind };
    for (let i = 0; i < q.obj.length; i++) {
      const o = q.obj[i]; if (o.npc !== gid || a.p[i] || !objOpen(q, a, i) || objDone(q, a, i)) continue;
      if (o.type === 'talk' || o.type === 'scene' || (o.type === 'deliver' && countItem(o.item) >= (o.n || 1))) return { mark: '?', kind: q.kind };
    }
  }
  for (const b of STORY_TALK) if (b.npc === gid && b.when()) return { mark: '?', kind: 'main' };
  for (const id in QUESTS) { const q = QUESTS[id]; if (q.giver === gid && !q.auto && questStatus(id) === 'available') { if (!avail || q.kind === 'main' || ((avail.kind === 'daily' || avail.kind === 'weekly') && q.kind === 'side')) avail = { mark: '!', kind: q.kind }; } }
  return avail;
}
function questMarkerFor(e) { const i = questMarkerInfo(e); return i ? i.mark : null; }

/* ---------- Dialogs ---------- */
// Menu entries for a giver: ready turn-ins, new offers, and quests in progress there.
function questMenuFor(gid) {
  const out = [];
  for (const id in P.quests.active) { const q = QUESTS[id]; if (questTurnIn(q) === gid && questReady(id)) out.push({ id, st: 'ready' }); }
  for (const id in QUESTS) { const q = QUESTS[id]; if (q.giver === gid && !q.auto && questStatus(id) === 'available') out.push({ id, st: 'offer' }); }
  for (const id in P.quests.active) { const q = QUESTS[id]; if ((q.giver === gid || questTurnIn(q) === gid) && !questReady(id)) out.push({ id, st: 'active' }); }
  return out;
}
function questMenuLabel(e) { const q = QUESTS[e.id]; return e.st === 'ready' ? `? ${q.name} (complete)` : e.st === 'offer' ? `! ${q.name}${q.kind === 'daily' ? ' (daily)' : q.kind === 'weekly' ? ' (weekly)' : ''}` : `… ${q.name} (in progress)`; }
function questObjHTML(id) { return questObjectives(id).map(o => `<br>${o.done ? '✓' : o.open ? '▸' : '·'} ${esc(o.text)}${o.counted && !o.done ? ` <b>${o.cur}/${o.max}</b>` : ''}`).join(''); }
// Turn-in choices: [{ label, need(), reward, take, done: [pages] }]. Returns the chosen index, or -1.
async function questChoose(N, q) {
  const ok = q.choices.map((c, i) => (!c.need || c.need()) ? i : -1).filter(i => i >= 0);
  const body = (q.choicePrompt || 'What will you do?') + ok.map(i => `<br><br><b>${esc(q.choices[i].label)}</b>${questRewardText(q, i) ? `<br><i>${esc(questRewardText(q, i))}</i>` : ''}`).join('');
  const r = await dialog(N, body, ok.map(i => q.choices[i].label));
  if (r < 0) return -1;
  const c = ok[r], pages = q.choices[c].done || [];
  for (let i = 0; i < pages.length; i++) { const rr = await dialog(N, pages[i], [i < pages.length - 1 ? 'Next' : 'Close']); if (rr < 0) break; }
  return c;
}
async function questRunEntry(N, e) {
  const q = QUESTS[e.id];
  if (e.st === 'ready') {
    const pages = (q.done && q.done.length ? q.done : ['Well done. Here is what was promised.']).slice();
    for (let i = 0; i < pages.length; i++) { const r = await dialog(N, pages[i] + (i === pages.length - 1 && !q.choices && questRewardText(q) ? `<br><br><i>Reward: ${esc(questRewardText(q))}</i>` : ''), [i < pages.length - 1 || q.choices ? 'Next' : 'Accept reward']); if (r < 0) { $('dialog').hidden = true; return; } }
    if (q.choices) { const c = await questChoose(N, q); $('dialog').hidden = true; if (c >= 0) questComplete(e.id, { choice: c }); return; }
    $('dialog').hidden = true; questComplete(e.id); return;
  }
  if (e.st === 'offer') {
    const pages = (q.offer && q.offer.length ? q.offer : [q.summary || q.name]).slice();
    for (let i = 0; i < pages.length - 1; i++) { const r = await dialog(N, pages[i], ['Next']); if (r < 0) { $('dialog').hidden = true; return; } }
    const tail = `<br><br><b>${esc(q.name)}</b>${questObjHTML(e.id).replace(/<b>0\/\d+<\/b>/g, '')}${questRewardText(q) ? `<br><i>Reward: ${esc(questRewardText(q))}</i>` : ''}`;
    const r = await dialog(N, pages[pages.length - 1] + tail, ['Accept', 'Decline']);
    $('dialog').hidden = true; if (r === 0) questAccept(e.id); return;
  }
  await dialog(N, (q.progress || q.summary || '') + questObjHTML(e.id), ['Close']); $('dialog').hidden = true;
}
// NPC talk: returns true when the quest menu handled the conversation.
async function questTalk(n, def) {
  const menu = questMenuFor(n.id); if (!menu.length) return false;
  const N = def.dname || n.name, talkL = def.talkLabel || 'Talk';
  const r = await dialog(N, def.greet || '…', [...menu.map(questMenuLabel), talkL, 'Farewell']);
  if (r < 0 || r === menu.length + 1) { $('dialog').hidden = true; return true; }
  if (r === menu.length) return false;
  await questRunEntry(N, menu[r]); return true;
}
async function questBoard(o) {
  const b = BOARDS[o.board], N = `${b.name} · ${b.title}`;
  const menu = questMenuFor(o.board);
  if (!menu.length) { await say(N, ['<i>Notices pinned with rusted nails. Every one of today’s bounties is already claimed or paid. New ones go up at dawn.</i>']); return; }
  const r = await dialog(N, '<i>Notices pinned with rusted nails, most of them scorched. A few are fresh.</i>', [...menu.map(questMenuLabel), 'Leave']);
  if (r < 0 || r >= menu.length) { $('dialog').hidden = true; return; }
  await questRunEntry(N, menu[r]);
}

/* ---------- Titles and achievements (data: TITLES, ACHIEVEMENTS in js/data/quests.js) ----------
   P.titles: earned title ids; P.title: the one shown under your name (Journal → Achievements).
   P.ach: { achievementId: 'YYYY-MM-DD' }. achTick() checks every achievement once a second (from questTick);
   achTick(0, true) grants the ones an older save already earned without fanfare. */
function grantTitle(id, silent) {
  if (!TITLES[id] || !P) return false; P.titles = P.titles || [];
  if (P.titles.includes(id)) return false;
  P.titles.push(id); if (!P.title) P.title = id;
  if (!silent) { questToast(`New title · ${TITLES[id]}`, 'new'); log(`You have earned the title “${TITLES[id]}”. Choose which one to wear in the Journal (Achievements).`, 'quest'); }
  UI.dirty = true; return true;
}
function achUnlock(a, silent) {
  P.ach[a.id] = questDay(); if (a.title) grantTitle(a.title, silent);
  if (!silent) { banner('Achievement', a.name, 'band gold'); questToast(`★ ${a.name}`, 'new'); log(`Achievement: ${a.name}. ${a.desc}`, 'quest'); Sfx.rare(); }
  questEmit('achievement', a); UI.dirty = true;
}
function achProgress(a) { try { return a.prog ? a.prog() : null; } catch (e) { return null; } }
let achT = 0;
function achTick(dt, silent) {
  if (!P || !P.ach) return; achT -= dt; if (achT > 0 && !silent) return; achT = 1;
  for (const a of ACHIEVEMENTS) { if (P.ach[a.id]) continue; let ok = false; try { ok = !!a.check(); } catch (e) { ok = false; } if (ok) achUnlock(a, silent); }
}
