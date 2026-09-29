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
   ========================================================= */
const QUEST_HOOKS = {};
function questOn(evt, fn) { (QUEST_HOOKS[evt] = QUEST_HOOKS[evt] || []).push(fn); }
function questEmit(evt, ...a) { for (const f of QUEST_HOOKS[evt] || []) { try { f(...a); } catch (e) { console.error(e); } } }

let QUEST_DAY = null; // set a 'YYYY-MM-DD' string to fake the date (tests)
function questDay() { if (QUEST_DAY) return QUEST_DAY; const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

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
function objMax(o) { return o.type === 'kill' || o.type === 'collect' || o.type === 'deliver' || o.type === 'visit' ? (o.n || 1) : o.type === 'survive' ? o.secs : o.type === 'level' ? (o.lvl || o.jlvl) : o.type === 'cond' && o.prog ? o.prog()[1] : 1; }
function objCur(q, a, i) {
  const o = q.obj[i], max = objMax(o);
  if (o.check && o.check()) return max;
  switch (o.type) {
    case 'kill': case 'visit': return Math.min(max, a.p[i] || 0);
    case 'collect': return Math.min(max, countItem(o.item));
    case 'deliver': return a.p[i] ? max : Math.min(max, countItem(o.item));
    case 'boss': return P.flags.bosses[o.mob] ? 1 : 0;
    case 'survive': return Math.min(max, Math.floor(a.p[i] || 0));
    case 'level': return Math.min(max, o.lvl ? P.lvl : P.jlvl);
    case 'cond': return o.prog ? Math.min(max, o.prog()[0]) : 0;
    default: return a.p[i] ? 1 : 0; // talk, reach
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
    default: return '…';
  }
}
// [text, cur, max, done, open] for each objective (used by the log, tracker and dialogs).
function questObjectives(id) {
  const q = QUESTS[id], a = P.quests.active[id] || { p: [], d: [] };
  return q.obj.map((o, i) => { const max = objMax(o), done = objDone(q, a, i); return { text: objText(o), cur: done ? max : objCur(q, a, i), max, done, open: objOpen(q, a, i), counted: max > 1, type: o.type }; });
}

/* ---------- Status ---------- */
const BOARD_CACHE = {};
function boardToday(bid) {
  const b = BOARDS[bid]; if (!b) return [];
  const day = questDay(), key = bid + '|' + day; if (BOARD_CACHE[key]) return BOARD_CACHE[key];
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
  if (q.kind === 'daily' && BOARDS[q.giver] && !boardToday(q.giver).includes(q.id)) return false;
  return true;
}
function questDoneToday(id) { const d = P.quests.done[id]; return !!d && d.day === questDay(); }
function questReady(id) { const q = QUESTS[id], a = P.quests.active[id]; if (!q || !a) return false; for (let i = 0; i < q.obj.length; i++) if (!objDone(q, a, i)) return false; return true; }
// 'locked' | 'available' | 'active' | 'ready' | 'done'
function questStatus(id) {
  const q = QUESTS[id]; if (!q || !P || !P.quests) return 'locked';
  if (P.quests.active[id]) return questReady(id) ? 'ready' : 'active';
  if (P.quests.done[id] && (q.repeat !== 'daily' || questDoneToday(id))) return 'done';
  return questReqMet(q) ? 'available' : 'locked';
}
const questTurnIn = q => q.turnIn === undefined ? q.giver : q.turnIn;

/* ---------- Accept / complete / abandon ---------- */
function questAccept(id, o = {}) {
  const q = QUESTS[id]; if (!q || questStatus(id) !== 'available') return false;
  P.quests.active[id] = { p: q.obj.map(() => 0), d: q.obj.map(() => 0), day: questDay() };
  for (const [iid, n] of q.give || []) { const it = makeItem(iid, { qty: n }); if (!addItem(it, true)) dropItem(it, P); }
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
  for (const [iid, n] of q.give || []) if (countItem(iid)) takeItem(iid, Math.min(n, countItem(iid)));
  for (const d of q.drops || []) if (countItem(d.item) && !Object.keys(P.quests.active).some(k => (QUESTS[k].drops || []).some(x => x.item === d.item))) takeItem(d.item, countItem(d.item));
  if (P.quests.track === id) P.quests.track = questPickTrack();
  log(`Quest abandoned: ${q.name}.`, 'quest'); questEmit('abandon', q); UI.dirty = true;
  return true;
}
function questRewardItems(q) { const r = q.reward || {}; return typeof r.items === 'function' ? r.items(P) : (r.items || []); }
function questRewardText(q) {
  const r = q.reward || {}, out = [];
  if (r.exp) out.push(`${fmt(r.exp)} Base EXP`); if (r.jexp) out.push(`${fmt(r.jexp)} Job EXP`); if (r.zeny) out.push(`${fmt(r.zeny)} zeny`);
  for (const [iid, n, oo] of questRewardItems(q)) if (ITEMS[iid]) out.push(`${oo && oo.refine ? '+' + oo.refine + ' ' : ''}${ITEMS[iid].name}${n > 1 ? ' ×' + n : ''}`);
  if (r.lore && LORE[r.lore]) out.push(`Chronicle: ${LORE[r.lore][0]}`);
  return out.join(' · ');
}
function questComplete(id, o = {}) {
  const q = QUESTS[id], a = P.quests.active[id]; if (!q || !a) return false;
  q.obj.forEach(ob => { if (ob.type === 'collect' && !ob.keep && !o.noReward) takeItem(ob.item, Math.min(ob.n || 1, countItem(ob.item))); });
  for (const [iid] of q.give || []) if (countItem(iid)) takeItem(iid, countItem(iid));
  delete P.quests.active[id];
  const prev = P.quests.done[id]; P.quests.done[id] = { n: ((prev && prev.n) || 0) + 1, day: questDay() };
  if (!o.noReward) {
    const r = q.reward || {};
    if (r.zeny) P.zeny += r.zeny;
    for (const [iid, n, oo] of questRewardItems(q)) {
      if (!ITEMS[iid]) continue; const it = makeItem(iid, { qty: n || 1 }); if (oo && oo.refine && it.refine !== undefined) it.refine = oo.refine;
      if (!addItem(it, true)) { dropItem(it, P); log(`Your bag is full. ${itemName(it)} falls at your feet.`, 'warn'); }
    }
    if (r.lore) P.flags.lore[r.lore] = true;
    if (!o.silent) { banner('Quest Complete', q.name, 'band gold'); log(`Quest complete: ${q.name}.${questRewardText(q) ? ' Reward: ' + questRewardText(q) + '.' : ''}`, 'quest'); Sfx.level(); }
    if (r.exp || r.jexp) gainExp(r.exp || 0, r.jexp || 0);
  }
  if (P.quests.track === id || !P.quests.active[P.quests.track]) P.quests.track = questPickTrack();
  if (q.onComplete && !o.noReward) q.onComplete(q);
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
      if (type === 'kill' && o.type === 'kill' && listOf(o.mob).includes(arg.type) && (!o.magic || arg.lastMagic)) {
        a.p[i] = (a.p[i] || 0) + 1; touched = true;
        questToast(`${objLabel(o)} ${Math.min(a.p[i], o.n)}/${o.n}`, a.p[i] >= o.n ? 'obj' : ''); questEmit('progress', q, i);
      } else if (type === 'pickup' && o.type === 'collect' && o.item === arg) {
        const c = countItem(arg); touched = true;
        if (c <= o.n) { questToast(`${objLabel(o)} ${c}/${o.n}`, c >= o.n ? 'obj' : ''); questEmit('progress', q, i); }
      } else if (type === 'talk' && o.type === 'talk' && o.npc === arg) {
        a.p[i] = 1; touched = true; questEmit('progress', q, i);
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
  questTickT -= dt; if (questTickT > 0) return; questTickT = 0.25;
  for (const id of Object.keys(P.quests.active)) {
    const q = QUESTS[id], a = P.quests.active[id];
    q.obj.forEach((o, i) => {
      if (o.type !== 'reach' || a.p[i] || !objOpen(q, a, i) || P.map !== o.map) return;
      if (o.x === undefined || Math.hypot(P.x - o.x, P.y - o.y) <= (o.r || 3)) { a.p[i] = 1; questEmit('progress', q, i); UI.dirty = true; }
    });
  }
  questRefresh();
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
      if (o.type === 'talk' || (o.type === 'deliver' && countItem(o.item) >= (o.n || 1))) return { mark: '?', kind: q.kind };
    }
  }
  for (const id in QUESTS) { const q = QUESTS[id]; if (q.giver === gid && !q.auto && questStatus(id) === 'available') { if (!avail || q.kind === 'main' || (avail.kind === 'daily' && q.kind === 'side')) avail = { mark: '!', kind: q.kind }; } }
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
function questMenuLabel(e) { const q = QUESTS[e.id]; return e.st === 'ready' ? `? ${q.name} (complete)` : e.st === 'offer' ? `! ${q.name}${q.kind === 'daily' ? ' (daily)' : ''}` : `… ${q.name} (in progress)`; }
function questObjHTML(id) { return questObjectives(id).map(o => `<br>${o.done ? '✓' : o.open ? '▸' : '·'} ${esc(o.text)}${o.counted && !o.done ? ` <b>${o.cur}/${o.max}</b>` : ''}`).join(''); }
async function questRunEntry(N, e) {
  const q = QUESTS[e.id];
  if (e.st === 'ready') {
    const pages = (q.done && q.done.length ? q.done : ['Well done. Here is what was promised.']).slice();
    for (let i = 0; i < pages.length; i++) { const r = await dialog(N, pages[i] + (i === pages.length - 1 && questRewardText(q) ? `<br><br><i>Reward: ${esc(questRewardText(q))}</i>` : ''), [i < pages.length - 1 ? 'Next' : 'Accept reward']); if (r < 0) { $('dialog').hidden = true; return; } }
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
