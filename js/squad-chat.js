/* =========================================================================================================
   Ashes of Midgard: squad chat (companions talk). Contract: design/squad-contract.md. Relay: worker/, setup in
   docs/SQUAD-RELAY-SETUP.md. Config: js/squad-config.js (window.AOM_SQUAD).

   window.SQUAD_CHAT
     send(text)          the player says something. Echoed at once as {who:'you', text}; companions answer.
     onLine(cb)          cb({who: heroId|'you'|'system', text, t, src}) for every line; returns an unsubscribe function.
                         Lines emitted before anyone subscribed are replayed to the first subscriber.
     onStatus(cb)        cb(status) whenever status() changes; returns an unsubscribe function.
     status()            'off' (no relay set up) | 'fallback' (guest: offline lines) | 'online' | 'busy' (a request is
                         in flight: "thinking") | 'error' (relay failed; offline lines while backing off). Cheap.
     statusInfo()        { status, label, detail, relay, signedIn, retryInSec, lastError, stats } for the UI.
     event(type, data)   a game event (squadEvent calls it). Types: boss_seen, low_hp, ally_down, level_up, quest_done,
                         map_enter, kill_mvp, idle, swap, recruit, loot_rare.
     history()           the last 60 lines.   config   the resolved window.AOM_SQUAD.
     parseOrders(text), intentOf(text)   the offline order parser and intent picker (also used online).
   Also defines window.squadEvent(type, data) if nothing else did (and wraps it if core defined one).

   Online (relay set, player signed in): one request per turn writes lines for all companions. Automatic event
   requests: at most 1 per 45 s, never while one is in flight. Typed messages always go, queued behind the one in
   flight (several queued messages merge into one request). Errors and 429s fall back to offline lines and back off.
   Guests make no network requests at all. Mock relay for tests: window.AOM_SQUAD_MOCK = true (see SQUAD_CHAT.mock).
   ========================================================================================================= */
(function () {
  'use strict';
  if (window.SQUAD_CHAT) return;

  const EVENTS = ['boss_seen', 'low_hp', 'ally_down', 'level_up', 'quest_done', 'map_enter', 'kill_mvp', 'idle', 'swap', 'recruit', 'loot_rare'];
  const IMPORTANT = { boss_seen: 1, ally_down: 1, level_up: 1, quest_done: 1, kill_mvp: 1, recruit: 1, loot_rare: 1, low_hp: 1 };
  const ROLES = ['tank', 'healer', 'melee', 'ranged'], STANCES = ['aggressive', 'defensive', 'passive'], FOCUS = ['target', 'nearest', 'boss'];
  const LINE_MAX = 160, IN_MAX = 200, HIST = 12, KEEP = 60, BODY_MAX = 12288;
  const DEF = { relay: null, model: 'claude-haiku-4-5-20251001', autoGapMs: 45000, timeoutMs: 15000, lineGapMs: 900, thinkMs: 600, barkGapMs: 7000, typeGapMs: 25000 };

  /* ---------------- config ---------------- */
  function cfg() {
    const c = window.AOM_SQUAD && typeof window.AOM_SQUAD === 'object' ? window.AOM_SQUAD : {};
    const o = {};
    for (const k in DEF) o[k] = c[k] !== undefined && typeof c[k] === typeof DEF[k] ? c[k] : DEF[k];
    let r = typeof c.relay === 'string' ? c.relay.trim().replace(/\/+$/, '').replace(/\/chat$/, '') : '';
    o.relay = /^https:\/\/[^\s/?#]+(\/[^\s?#]*)?$/.test(r) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/[^\s?#]*)?$/.test(r) ? r : null;
    o.model = typeof c.model === 'string' && /^[a-z0-9.-]{3,60}$/.test(c.model) ? c.model : DEF.model;
    return o;
  }
  const mockOn = () => window.AOM_SQUAD_MOCK === true;
  const now = () => Date.now();

  /* ---------------- state ---------------- */
  const ST = {
    subs: [], statusSubs: [], log: [], unseen: [], lastStatus: null,
    inflight: null, queue: null, lastAuto: -1e15, backoffUntil: 0, fails: 0, lastError: null, noticeStreak: false,
    lastBark: -1e15, typeAt: {}, signedCache: { t: 0, v: false }, forceRefresh: false, timers: new Set(),
    stats: { requests: 0, ok: 0, errors: 0, onlineLines: 0, offlineLines: 0, ordersApplied: 0, throttled: 0, merged: 0 }
  };
  const M = { signedIn: true, latency: 300, fail: null, failOnce: null, calls: [], active: 0, maxActive: 0 };

  /* ---------------- text hygiene ---------------- */
  const BAD = [/\bf+u+c+k+\w*/gi, /\bs+h+i+t+\w*/gi, /\bc+u+n+t+s?\b/gi, /\bbitch\w*/gi, /\bass+hole\w*/gi, /\bmotherf\w*/gi, /\bn+i+g+g+\w*/gi, /\bfag+(ot)?s?\b/gi, /\bretard\w*/gi, /\bwh+o+r+e+s?\b/gi, /\bdick(head)?s?\b/gi, /\bcock(sucker)?s?\b/gi];
  function clean(s, max) {
    let t = String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, ' ').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
    if (max && t.length > max) { const cut = t.slice(0, max - 1); const sp = cut.lastIndexOf(' '); t = (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:.-]+$/, '') + '…'; }
    return t;
  }
  function filter(s) { let t = s; for (const re of BAD) t = t.replace(re, m => m[0] + '*'.repeat(Math.max(1, m.length - 1))); return t; }
  const line = s => filter(clean(s, LINE_MAX));
  const safeId = id => String(id == null ? '' : id).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 32) || 'x';
  const safeName = (s, d) => (String(s == null ? '' : s).replace(/[^\p{L}\p{M}\p{N} '’._-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 24).trim()) || d;
  const pick = a => a[Math.floor(Math.random() * a.length)];

  /* ---------------- game access (all guarded: other teams' globals may not exist yet) ---------------- */
  // The hero the player controls. core's withHero() swaps P while a companion acts, so prefer leadHero() when it exists.
  function lead() {
    try { if (typeof leadHero === 'function') { const h = leadHero(); if (h) return h; } } catch (e) { /* */ }
    try { return typeof P !== 'undefined' && P ? P : null; } catch (e) { return null; }
  }
  function members() {
    try { if (typeof heroes === 'function') { const h = heroes(); if (Array.isArray(h)) return h.filter(Boolean); } } catch (e) { /* */ }
    try { if (typeof PARTY !== 'undefined' && PARTY && Array.isArray(PARTY.members)) return PARTY.members.filter(Boolean); } catch (e) { /* */ }
    const p = lead(); return p ? [p] : [];
  }
  function heroId(h, i) { return h && h.id != null ? String(h.id) : 'h' + (i === undefined ? members().indexOf(h) : i); }
  function compData(id) {
    if (!id) return null;
    try {
      if (typeof COMPANIONS_DATA === 'undefined' || !COMPANIONS_DATA) return null;
      if (Array.isArray(COMPANIONS_DATA)) return COMPANIONS_DATA.find(c => c && c.id === id) || null;
      const c = COMPANIONS_DATA[id]; return c ? Object.assign({ id }, c) : null;
    } catch (e) { return null; }
  }
  function className(cls) { try { return (typeof CLASSES !== 'undefined' && CLASSES[cls] && CLASSES[cls].name) || cls || 'Hero'; } catch (e) { return cls || 'Hero'; } }
  function nameOf(h) { if (!h) return 'someone'; const c = compData(h.persona); return safeName(h.name || (c && c.name) || className(h.cls), 'Hero'); }
  function roleOf(h) { const r = h && h.ai && h.ai.role; if (ROLES.includes(r)) return r; const c = compData(h && h.persona); return c && ROLES.includes(c.role) ? c.role : null; }
  // Companions who can talk: in the party, not the hero the player controls, with a persona, alive.
  function talkers() { const L = lead(); return members().filter(h => h !== L && h.persona && !h.dead); }
  // HP/SP percent. Max values: core's heroStats(hero), else hero.maxhp (or maxHp/hpMax), hero.S, or core's global S for P.
  function pctOf(h, cur, maxKeys) {
    if (!h || typeof h[cur] !== 'number') return null;
    let mx = null;
    try { if (typeof heroStats === 'function') { const s = heroStats(h); if (s && s[maxKeys[0]] > 0) mx = s[maxKeys[0]]; } } catch (e) { /* */ }
    if (mx == null) for (const k of maxKeys) if (typeof h[k] === 'number' && h[k] > 0) { mx = h[k]; break; }
    try { if (mx == null && h.S && h.S[maxKeys[0]] > 0) mx = h.S[maxKeys[0]]; } catch (e) { /* */ }
    try { if (mx == null && h === lead() && typeof S !== 'undefined' && S && S[maxKeys[0]] > 0) mx = S[maxKeys[0]]; } catch (e) { /* */ }
    return mx ? Math.max(0, Math.min(100, Math.round(h[cur] / mx * 100))) : null;
  }
  function mapName() { try { return typeof map !== 'undefined' && map && map.d && map.d.name ? clean(map.d.name, 40) : null; } catch (e) { return null; } }
  function currentQuest() {
    try {
      if (typeof QUESTS === 'undefined') return null;
      const hs = [lead()].concat(members()).filter(Boolean);
      for (const h of hs) {
        const act = h.quests && h.quests.active; if (!act) continue;
        const ids = Object.keys(act).filter(q => QUESTS[q]);
        if (!ids.length) continue;
        const q = QUESTS[ids.find(x => QUESTS[x].kind === 'main') || ids[0]];
        return { name: clean(q.name, 60), area: q.area ? clean(q.area, 60) : null, summary: q.summary ? clean(q.summary, 200) : '' };
      }
    } catch (e) { /* */ }
    return null;
  }
  function threats() {
    try {
      const L = lead(); if (!L || typeof mobs === 'undefined' || !Array.isArray(mobs)) return [];
      const g = new Map();
      for (const m of mobs) {
        if (!m || m.dead || !m.d || (m.kind && m.kind !== 'mob') || typeof m.x !== 'number') continue;
        if (Math.hypot(m.x - L.x, m.y - L.y) > 14) continue;
        const k = m.d.name || m.type; const e = g.get(k) || { name: clean(k, 40), lvl: Math.max(1, Math.min(999, m.d.lvl | 0 || 1)), n: 0, boss: !!(m.d.boss || m.d.mvp) };
        e.n = Math.min(99, e.n + 1); g.set(k, e);
      }
      return [...g.values()].filter(t => t.name).sort((a, b) => (b.boss - a.boss) || (b.n - a.n)).slice(0, 5);
    } catch (e) { return []; }
  }
  function subjectOf(type, d) {
    try {
      if (d == null) return null;
      if (typeof d === 'string') return clean(d, 60);
      const h = d.hero || d.to; if (h) return nameOf(typeof h === 'object' ? h : members().find(x => heroId(x) === String(h)));
      if (d.mob) return clean(typeof d.mob === 'string' ? ((typeof MOBS !== 'undefined' && MOBS[d.mob] && MOBS[d.mob].name) || d.mob) : (d.mob.d && d.mob.d.name) || d.mob.name || '', 60);
      if (d.item) { const it = d.item; if (typeof itemName === 'function' && typeof it === 'object') return clean(itemName(it), 60); const id = typeof it === 'string' ? it : it.id; return clean((typeof ITEMS !== 'undefined' && ITEMS[id] && ITEMS[id].name) || id || '', 60); }
      if (d.quest) { const q = d.quest; const id = typeof q === 'string' ? q : q.id; return clean((typeof q === 'object' && q.name) || (typeof QUESTS !== 'undefined' && QUESTS[id] && QUESTS[id].name) || id || '', 60); }
      if (d.map) { const m = d.map; const defs = typeof MAPDEFS !== 'undefined' ? MAPDEFS : typeof MAPS !== 'undefined' ? MAPS : null; return clean(typeof m === 'string' ? ((defs && defs[m] && defs[m].name) || m) : (m.d && m.d.name) || m.name || '', 60); }
    } catch (e) { /* */ }
    return null;
  }
  function eventHero(d) { try { const h = d && (d.hero || d.to); if (!h) return null; return typeof h === 'object' ? h : members().find(x => heroId(x) === String(h)) || null; } catch (e) { return null; } }

  /* ---------------- signed in? token ---------------- */
  function signedIn() {
    if (mockOn()) return !!M.signedIn;
    const t = now(); if (t - ST.signedCache.t < 1000) return ST.signedCache.v;
    let v = false;
    try { const C = window.AOM_CLOUD; v = !!(C && typeof C.state === 'function' && C.state().user); } catch (e) { v = false; }
    if (v && !(window.AOM_CLOUD && typeof window.AOM_CLOUD.idToken === 'function')) {
      try { v = !!(window.firebase && window.firebase.apps && window.firebase.apps.length && window.firebase.auth().currentUser); } catch (e) { v = false; }
    }
    ST.signedCache = { t, v }; return v;
  }
  async function idToken() {
    const force = ST.forceRefresh; ST.forceRefresh = false;
    const C = window.AOM_CLOUD;
    if (C && typeof C.idToken === 'function') return await C.idToken(force);
    const fb = window.firebase; const u = fb && fb.apps && fb.apps.length && fb.auth && fb.auth().currentUser;
    return u && typeof u.getIdToken === 'function' ? await u.getIdToken(force) : null;
  }

  /* ---------------- lines ---------------- */
  function notifyStatus() {
    const s = status(); if (s === ST.lastStatus) return; ST.lastStatus = s;
    for (const cb of ST.statusSubs.slice()) { try { cb(s); } catch (e) { console.warn('[squad-chat] status listener', e); } }
  }
  function emit(who, text, src, notice) {
    const l = { who, text: who === 'you' ? clean(text, IN_MAX) : line(text), t: now(), src: src || 'local' };
    if (!l.text) return null;
    if (notice) l.notice = true;
    ST.log.push(l); if (ST.log.length > KEEP) ST.log.splice(0, ST.log.length - KEEP);
    if (src === 'online') ST.stats.onlineLines++; else if (who !== 'you' && who !== 'system') ST.stats.offlineLines++;
    const out = { who: l.who, text: l.text, t: l.t, src: l.src };
    if (!ST.subs.length) { ST.unseen.push(out); if (ST.unseen.length > KEEP) ST.unseen.shift(); }
    for (const cb of ST.subs.slice()) { try { cb(out); } catch (e) { console.warn('[squad-chat] line listener', e); } }
    return l;
  }
  function later(ms, fn) { const id = setTimeout(() => { ST.timers.delete(id); fn(); }, Math.max(0, ms)); ST.timers.add(id); }
  function emitStaggered(list, src, firstDelay) {
    const gap = cfg().lineGapMs; let t = firstDelay || 0;
    for (const l of list) { later(t, () => emit(l.who, l.text, src)); t += gap; }
  }
  const notice = text => emit('system', text, 'local', true);

  /* ---------------- orders: parser and application ---------------- */
  function targetsIn(t) {
    const out = new Set(); let all = /\b(everyone|everybody|all of you|you all|y ?all|all|team|squad|party|guys|lads|friends)\b/.test(t);
    const comp = members().filter(h => h !== lead() && h.persona);
    for (const h of comp) {
      const n = nameOf(h).toLowerCase(); const first = n.split(' ')[0];
      const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp('(^|[^\\p{L}])(' + esc(n) + '|' + esc(first) + ')([^\\p{L}]|$)', 'u').test(t)) out.add(h);
    }
    const byRole = { tank: /\b(tanks?|shields?)\b/, healer: /\b(healers?|priests?|medics?)\b/, ranged: /\b(ranged|archers?|casters?|mages?|hunters?)\b/, melee: /\b(melee|fighters?|brawlers?)\b/ };
    for (const r in byRole) if (byRole[r].test(t)) for (const h of comp) if (roleOf(h) === r) out.add(h);
    return { heroes: [...out], all: all || !out.size };
  }
  /* Returns { order, heal, keys:[ack keys], targets:{heroes, all} } or null. Positions decide hold vs follow. */
  function parseOrders(text) {
    const t = ' ' + String(text || '').toLowerCase().replace(/[’']/g, '').replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ') + ' ';
    const o = {}; const keys = []; let heal = false;
    const at = re => { const m = re.exec(t); return m ? m.index : -1; };
    if (/\b(passive|dont (attack|fight|engage)|do not (attack|fight|engage)|hold (your )?fire|stand down|stop (fighting|attacking)|no fighting|peaceful(ly)?|sneak)\b/.test(t)) { o.stance = 'passive'; keys.push('ack_passive'); }
    else if (/\b(go wild|aggressive(ly)?|all out|go all in|no mercy|charge|go ham|berserk|attack everything|kill (them )?all|full attack|unleash|go crazy)\b/.test(t)) { o.stance = 'aggressive'; keys.push('ack_aggressive'); }
    else if (/\b(be careful|careful|defensive(ly)?|defend|play (it )?safe|cautious(ly)?|take it slow|easy now|guard (me|the healer|us)|protect (me|the healer|us))\b/.test(t)) { o.stance = 'defensive'; keys.push('ack_defensive'); }
    if (/\b(focus|attack|hit|kill|target|go for|take down|burn|nuke)( on)? (the )?(boss|mvp|big (one|guy|thing))\b/.test(t) || /\bboss first\b/.test(t)) { o.focus = 'boss'; keys.push('ack_focus_boss'); }
    else if (/\b(nearest|closest)\b/.test(t) && /\b(focus|attack|kill|hit|target|go for)\b/.test(t)) { o.focus = 'nearest'; keys.push('ack_focus'); }
    else if (/\b(focus|attack|assist|kill|hit)( on)? (my|our|the same) target\b|\bassist me\b|\bfocus (that|this|my) (one|guy|target)\b|\bfocus fire\b|\bhit what i hit\b/.test(t)) { o.focus = 'target'; keys.push('ack_focus'); }
    else if (/\b(stop focus(ing)?|clear (the )?(focus|target)|free fire|pick your own|any target)\b/.test(t)) { o.focus = null; keys.push('ack_free'); }
    const hi = at(/\b(hold (here|position|the line|there|this spot)|hold$|hold |stay (here|put|there|back)|wait (here|there)|stand (your )?ground|dont move|do not move|stop moving|halt)\b/);
    const fi = at(/\b(follow( me)?|come (here|with me|to me|on|along)|on me|regroup|fall back|to me|stay (close|with me)|with me|lets go|move out|keep up)\b/);
    if (hi >= 0 && !/\bhold (on|up)\b/.test(t) && hi > fi) { o.hold = true; keys.push('ack_hold'); }
    else if (fi >= 0) { o.follow = true; keys.push('ack_follow'); }
    if (/\b(heal (me|us|him|her|them|please)|heal$|heals please|need (a )?heals?|patch me|im (dying|hurt|bleeding)|help me)\b/.test(t) || / heal /.test(t)) heal = true;
    if (!keys.length && !heal) return null;
    return { order: o, heal, keys, targets: targetsIn(t) };
  }
  function callOrder(who, o) {
    try { if (typeof squadOrder === 'function') { squadOrder(who, Object.assign({}, o)); ST.stats.ordersApplied++; return true; } } catch (e) { console.warn('[squad-chat] squadOrder', e); }
    return false;
  }
  // Applies a parsed order now. Returns [{who: heroId|'all', ...fields}] for the relay's "applied" list.
  function applyParsed(p) {
    const applied = [];
    if (!p) return applied;
    if (Object.keys(p.order).length) {
      if (p.targets.all) { callOrder('all', p.order); applied.push(Object.assign({ who: 'all' }, p.order)); }
      else for (const h of p.targets.heroes) { callOrder(heroId(h), p.order); applied.push(Object.assign({ who: heroId(h) }, p.order)); }
    }
    if (p.heal) {
      let hs = (p.targets.all ? talkers() : p.targets.heroes).filter(h => roleOf(h) === 'healer');
      if (!hs.length) hs = talkers().filter(h => roleOf(h) === 'healer');
      for (const h of hs.slice(0, 2)) {
        let done = false;
        try { if (typeof squadHeal === 'function') { done = squadHeal(heroId(h), lead()) !== false; if (done) applied.push({ who: heroId(h), heal: true }); /* false: cooldown / no SP -> fall back to follow */ } } catch (e) { /* */ }
        if (!done && callOrder(heroId(h), { follow: true })) applied.push({ who: heroId(h), follow: true });
      }
    }
    return applied;
  }

  /* ---------------- intents and offline lines ---------------- */
  function intentOf(text) {
    const t = ' ' + String(text || '').toLowerCase().replace(/[’']/g, '') + ' ';
    if (/\b(joke|funny|make me laugh|tell me something|jest|riddle)\b/.test(t)) return 'joke';
    if (/\b(thank|thanks|thx|ty|cheers|well done|good job|nice (work|job|one)|great (work|job)|good work|well fought|bravo)\b/.test(t)) return 'thanks';
    if (/\b(how are (you|ya|we|things)|how (is|s) (it going|everyone)|hows everyone|you (ok|okay|alright|all right)|everyone (ok|okay|alright)|how do you feel|are you hurt)\b/.test(t)) return 'how';
    if (/\b(where (to|now|next|are we|should we|do we)|which way|what now|whats next|what next|lead the way)\b/.test(t)) return 'where';
    if (/\b(quest|mission|objective|task|what are we doing|our goal|why are we here)\b/.test(t)) return 'quest';
    if (/(^ | )(hi|hello|hey|hail|greetings|good (morning|evening|day)|yo|howdy|well met|heya)( |!|,|\.|$)/.test(t)) return 'greet';
    return 'other';
  }
  const G = {
    greet: ['Hail, {player}.', 'Well met again, {player}.', 'Here, {player}. Always here.', 'Hail. The fire is still lit.'],
    how: ['Still standing. That counts for something in the Ash.', 'Tired, but the road is shorter than it was.', 'Wounds are small today. Mostly.', 'Better now that we are moving.'],
    how_hurt: ['I have been better. Keep the healer close.', 'Bleeding, but upright.', 'Ask me again after a rest.'],
    quest: ['{quest}. {summary}', 'We are on it: {quest}. {area_hint}', 'The saga says {quest}. I say we finish it.'],
    quest_none: ['No task on us right now. Vidar by the Waystone always has one.', 'Nothing pressing. Sigrun in Emberhold may need hands.'],
    where: ['{area_hint}', 'Toward {area}, if the quest is to be trusted.', 'Follow the road to {area}. I will watch the flanks.'],
    where_none: ['Back to Emberhold, I would say. The Waystone knows where we are needed.', 'Wherever you lead. The Ash is everywhere anyway.'],
    thanks: ['Thank me with mead later.', 'It was nothing. Well. It was something. You are welcome.', 'The saga will remember. I will make sure of it.', 'We stand together, {player}.'],
    joke: [
      'Why did the draugr skip the feast? No body to go with.', 'A Poring walked into Brokkr\'s forge. Now it is a very bouncy horseshoe.',
      'Loki asked Odin for an eye patch. Odin said he would keep an eye out.', 'What do you call a troll in the mire? Stuck. Very, very stuck.',
      'The skald said my singing could wake the dead. We checked. It cannot. They just groan along.', 'Why do dwarves never lose at dice? They always bring their own stones.'
    ],
    other: ['Hm. Say that again by the fire and I will think on it.', 'Aye, {player}.', 'If you say so.', 'Strange words. I am with you all the same.', 'Let us keep moving and talk after.'],
    ack_passive: ['Weapons down. We slip by.', 'Quiet feet, then.'], ack_aggressive: ['Gladly. Everything falls.', 'No mercy, then!'],
    ack_defensive: ['Careful it is.', 'Shields up. Slow and steady.'], ack_focus_boss: ['On the big one.', 'The great foe first. Understood.'],
    ack_focus: ['Your target is my target.', 'Following your lead.'], ack_free: ['I will choose my own foes.', 'Free to strike.'],
    ack_hold: ['Holding here.', 'We stand our ground.'], ack_follow: ['Right behind you.', 'On you, {player}.'],
    ack_heal: ['Coming to you. Hold still!', 'Light is on its way.'], no_healer: ['We have no healer, {player}. Drink a potion!', 'None of us can mend you. Potions!'],
    boss_seen: ['There, {subject}! Ready yourselves.', 'That is {subject}. Stay sharp.', 'Big one ahead: {subject}.'],
    low_hp_self: ['I am hurt. Cover me!', 'Bleeding here. Just a scratch. A big scratch.', 'Need a moment, and a healer.'],
    low_hp_other: ['{subject}, fall back! You are bleeding.', 'Careful, {subject}! Get behind me.', 'Someone help {subject}!'],
    ally_down: ['{subject} is down! Get them up!', 'No! {subject}! Cover the body.', '{subject} fell. Avenge them, then mend them.'],
    level_up: ['{subject} grows stronger. The saga gets a new verse.', 'Well done, {subject}.', 'Look at {subject}, sharper by the day.'],
    quest_done: ['That is done: {subject}. Emberhold will sleep easier.', '{subject}, finished. What next?', 'One more deed for the saga.'],
    map_enter: ['{subject}. Keep your eyes open.', 'So this is {subject}.', '{subject}. I do not like the smell of it.'],
    kill_mvp: ['{subject} is dead! Drink tonight!', 'We felled {subject}. Remember this day.', 'It is over. {subject} is no more.'],
    idle: ['Quiet. Too quiet.', 'Anyone have dried fish?', 'The Ash never sleeps. Neither should we.', 'I could use a fire and a song.'],
    swap: ['You lead, then.', 'My arm is yours, {player}.', 'Your call.'],
    recruit: ['I am with you. Point me at the dead.', 'Glad to be on the road. Where do we start?'],
    loot_rare: ['Now that is a find: {subject}.', 'Look at that. {subject}!', 'Mind if I look at {subject} later?']
  };
  function barkFor(h, key, alt) {
    const c = compData(h && h.persona); const b = c && c.barks;
    const from = k => { const v = b && b[k]; return Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim()) : typeof v === 'string' && v.trim() ? [v] : []; };
    let list = from(key); if (!list.length && alt) list = from(alt);
    if (!list.length) list = G[key] || (alt && G[alt]) || G.other;
    return pick(list);
  }
  function fill(tpl, vars) {
    return String(tpl).replace(/\{(\w+)\}/g, (m, k) => vars[k] != null && vars[k] !== '' ? vars[k] : k === 'subject' ? 'that' : k === 'player' ? 'friend' : '');
  }
  function vars(extra) {
    const q = currentQuest(); const L = lead();
    return Object.assign({ player: L ? nameOf(L) : 'friend', map: mapName() || 'this place', quest: q ? q.name : '', summary: q ? q.summary : '', area: q && q.area ? q.area : '', area_hint: q && q.area ? 'Our road leads to ' + q.area + '.' : q ? 'The quest does not say where. Ask Vidar.' : '' }, extra || {});
  }
  function speakerFor(pref) {
    const t = talkers(); if (!t.length) return null;
    for (const r of pref || []) { const c = t.filter(h => roleOf(h) === r); if (c.length) return pick(c); }
    return pick(t);
  }
  // Offline reply to typed text: order acknowledgements first, else one (or two, for greetings) canned lines by intent.
  function localReply(text, parsed) {
    const t = talkers(); if (!t.length) return;
    const out = []; const v = vars();
    if (parsed) {
      const pool = parsed.targets.all ? t : parsed.targets.heroes.filter(h => t.includes(h));
      const who = pool.length ? pool : t;
      if (parsed.keys.length) {
        const pref = { ack_hold: ['tank'], ack_defensive: ['tank', 'healer'], ack_aggressive: ['melee', 'ranged'], ack_focus_boss: ['ranged', 'melee'], ack_focus: ['ranged'], ack_follow: [], ack_passive: [], ack_free: [] };
        const first = parsed.targets.all ? (speakerFor(pref[parsed.keys[0]] || []) || who[0]) : who[0];
        out.push({ who: heroId(first), text: fill(barkFor(first, parsed.keys[0]), v) });
        if (!parsed.targets.all && who[1]) out.push({ who: heroId(who[1]), text: fill(barkFor(who[1], parsed.keys[0]), v) });
      }
      if (parsed.heal) {
        const hs = t.filter(h => roleOf(h) === 'healer');
        const h = hs[0] || speakerFor([]);
        if (h && !out.some(o => o.who === heroId(h))) out.push({ who: heroId(h), text: fill(barkFor(h, hs.length ? 'ack_heal' : 'no_healer'), v) });
      }
    }
    if (!out.length) {
      let intent = intentOf(text); let key = intent;
      const named = targetsIn(' ' + String(text).toLowerCase() + ' ');
      const sp = !named.all && named.heroes.length ? named.heroes.filter(h => t.includes(h)) : [];
      const h1 = sp[0] || pick(t);
      if (intent === 'quest' && !v.quest) key = 'quest_none';
      if (intent === 'where' && !v.area) key = v.quest ? 'where' : 'where_none';
      if (intent === 'how') { const hp = pctOf(h1, 'hp', ['maxhp', 'maxHp', 'hpMax']); if (hp != null && hp < 50) key = 'how_hurt'; }
      out.push({ who: heroId(h1), text: fill(barkFor(h1, key, intent === 'other' ? 'chat' : null), v) });
      if (intent === 'greet' && t.length > 1 && Math.random() < 0.6) { const h2 = pick(t.filter(h => h !== h1)); out.push({ who: heroId(h2), text: fill(barkFor(h2, 'greet'), v) }); }
    }
    emitStaggered(out, 'local', cfg().thinkMs * (0.6 + Math.random() * 0.8));
  }
  // Offline bark for an event, rate-limited so events never flood the chat.
  function localBark(type, data) {
    const c = cfg(); const t = now();
    const gap = type === 'idle' ? Math.max(c.typeGapMs, 90000) : c.typeGapMs;
    const urgent = type === 'ally_down' || type === 'kill_mvp' || type === 'quest_done' || type === 'level_up' || type === 'recruit';
    if ((!urgent && t - ST.lastBark < c.barkGapMs) || t - (ST.typeAt[type] || -1e15) < gap) { ST.stats.throttled++; return false; }
    const tk = talkers(); if (!tk.length) return false;
    const eh = eventHero(data); const subject = subjectOf(type, data) || '';
    let sp = null, key = type;
    if (type === 'low_hp') { if (eh && tk.includes(eh)) { sp = eh; key = 'low_hp_self'; } else { sp = speakerFor(['healer']); key = 'low_hp_other'; } }
    else if (type === 'recruit' && eh && tk.includes(eh)) sp = eh;
    else if (type === 'ally_down' || type === 'level_up') sp = pick(tk.filter(h => h !== eh).concat(tk.length === 1 ? tk : []));
    else if (type === 'boss_seen') sp = speakerFor(['tank']);
    if (!sp) sp = pick(tk);
    ST.lastBark = t; ST.typeAt[type] = t;
    const text = fill(barkFor(sp, key, key !== type ? type : null), vars({ subject }));
    emitStaggered([{ who: heroId(sp), text }], 'local', 250);
    return true;
  }

  /* ---------------- online: request body ---------------- */
  function buildBody(job) {
    const L = lead(); const ms = members().slice(0, 4);
    const idMap = {}; const used = new Set();
    const party = ms.map((h, i) => {
      let id = safeId(heroId(h, i)); while (used.has(id)) id = (id + '_').slice(-32); used.add(id); idMap[id] = heroId(h, i);
      const lvl = Math.max(1, Math.min(999, (h.lvl | 0) || 1));
      const role = roleOf(h); const st = h.ai && STANCES.includes(h.ai.stance) ? h.ai.stance : null;
      let buffs = [];
      try { buffs = Object.keys(h.buffs || {}).map(k => String(k).replace(/[^\p{L}\p{N} _'-]/gu, '').slice(0, 24)).filter(Boolean).slice(0, 6); } catch (e) { /* */ }
      return { id, name: nameOf(h), persona: h.persona ? safeId(h.persona) : null, cls: (String(h.cls || 'novice').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 24)) || 'novice', lvl, hp: pctOf(h, 'hp', ['maxhp', 'maxHp', 'hpMax']), sp: pctOf(h, 'sp', ['maxsp', 'maxSp', 'spMax']), role, stance: st, lead: h === L, dead: !!h.dead, buffs };
    });
    const back = {}; for (const k in idMap) back[idMap[k]] = k;
    const hist = ST.log.slice(0, job.logIndex != null ? job.logIndex : ST.log.length).filter(l => !l.notice && (l.who === 'you' || back[l.who])).slice(-HIST)
      .map(l => ({ who: l.who === 'you' ? 'you' : back[l.who], text: clean(l.text, IN_MAX) })).filter(l => l.text);
    const q = currentQuest();
    const body = { v: 1, model: cfg().model, kind: job.kind, you: { name: L ? nameOf(L) : 'Hero' }, party, map: mapName(), quest: q ? { name: q.name, area: q.area } : null, threats: threats(), history: hist, applied: [] };
    if (job.kind === 'chat') { body.text = clean(job.text, IN_MAX); body.applied = (job.applied || []).map(o => Object.assign({}, o, { who: o.who === 'all' ? 'all' : back[o.who] || safeId(o.who) })).filter(o => o.who === 'all' || idMap[o.who]).slice(0, 4); }
    else body.event = job.subject ? { type: job.type, subject: job.subject } : { type: job.type };
    while (JSON.stringify(body).length > BODY_MAX - 200 && body.history.length) body.history.shift();
    return { body, idMap };
  }

  /* ---------------- online: transport (real relay or the in-page mock) ---------------- */
  function sleep(ms, signal) {
    return new Promise((res, rej) => {
      const id = setTimeout(res, ms);
      if (signal) signal.addEventListener('abort', () => { clearTimeout(id); rej(Object.assign(new Error('aborted'), { name: 'AbortError' })); }, { once: true });
    });
  }
  async function transport(body, signal) {
    if (mockOn()) return mockRelay(body, signal);
    const tok = await idToken();
    if (!tok) return { status: 401, json: { ok: false, error: 'unauthorized' } };
    const r = await fetch(cfg().relay + '/chat', { method: 'POST', mode: 'cors', credentials: 'omit', cache: 'no-store', signal, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok }, body: JSON.stringify(body) });
    let j = null; try { j = await r.json(); } catch (e) { /* */ }
    return { status: r.status, json: j, retryAfter: +(r.headers.get('retry-after') || 0) };
  }
  async function mockRelay(body, signal) {
    M.calls.push({ at: now(), body: JSON.parse(JSON.stringify(body)) }); M.active++; M.maxActive = Math.max(M.maxActive, M.active);
    try {
      const f = M.failOnce || M.fail; M.failOnce = null;
      if (f === 'timeout') await new Promise((res, rej) => signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true }));
      await sleep(M.latency, signal);
      if (f === 'network') throw new TypeError('Failed to fetch');
      if (JSON.stringify(body).length > BODY_MAX) return { status: 413, json: { ok: false, error: 'too_large' } };
      if (f === 'http500') return { status: 502, json: { ok: false, error: 'upstream_busy', retryAfter: 30 } };
      if (f === 'http429') return { status: 429, json: { ok: false, error: 'rate_limited', message: 'Companions need a breather.', retryAfter: 20 }, retryAfter: 20 };
      if (f === 'cap') return { status: 429, json: { ok: false, error: 'cap_reached', message: 'The companions have spoken their fill this month.', retryAfter: 259200 }, retryAfter: 259200 };
      if (f === 'unauthorized') return { status: 401, json: { ok: false, error: 'unauthorized' } };
      if (f === 'badjson') return { status: 200, json: null };
      const sp = body.party.filter(h => !h.lead && h.persona && !h.dead);
      if (f === 'garbled') return { status: 200, json: { ok: true, lines: [{ who: 'nobody', text: 'hi' }, { who: body.party.find(h => h.lead).id, text: 'I am the player' }, { who: sp[0].id, text: 'Well, shit. <b>' + 'x'.repeat(300) }], orders: [{ who: 'zzz', stance: 'bogus' }, { who: sp[0].id, stance: 'berserk' }] } };
      const place = body.map || 'this place'; const lines = []; const orders = [];
      if (body.kind === 'event') {
        const s = body.event.subject || 'that';
        const T = { boss_seen: `${s}. Mine. Stay behind me.`, low_hp: `${s} is bleeding. Fall back!`, ally_down: `${s} is down! Cover them!`, level_up: `${s} grows stronger. A new verse!`, quest_done: `${s} is done. Emberhold owes us mead.`, map_enter: `${place}. I do not like the smell of it.`, kill_mvp: `${s} is dead! Tonight we drink.`, idle: 'Quiet. Anyone have dried fish?', swap: 'You lead, then.', recruit: 'Glad to be on the road.', loot_rare: `Now that is a find: ${s}.` };
        lines.push({ who: sp[0].id, text: '[mock] ' + (T[body.event.type] || 'Hm.') });
        if (sp[1] && body.event.type !== 'idle') lines.push({ who: sp[1].id, text: `[mock] Steady. We are in ${place}.` });
      } else {
        const tx = body.text.toLowerCase();
        lines.push({ who: sp[0].id, text: `[mock] Heard you, ${body.you.name}: "${body.text.slice(0, 60)}"` });
        if (sp[1]) lines.push({ who: sp[1].id, text: body.quest ? `[mock] ${body.quest.name} waits${body.quest.area ? ' in ' + body.quest.area : ''}.` : `[mock] ${place} is no place to linger.` });
        if (/\b(slow|steady|easy)\b/.test(tx)) orders.push({ who: 'all', stance: 'defensive' });
        if (/mock_order/.test(tx)) orders.push({ who: sp[0].id, hold: true });
        if (/mock_dup/.test(tx)) orders.push({ who: 'all', focus: 'boss' }, { who: sp[0].id, stance: 'aggressive' });
      }
      return { status: 200, json: { ok: true, lines, orders, meta: { model: body.model, usage: { input: 310, cacheWrite: 0, cacheRead: 5000, output: 90 }, costUsd: 0.00126 } } };
    } finally { M.active--; }
  }

  /* ---------------- online: the request loop ---------------- */
  const inBackoff = () => now() < ST.backoffUntil;
  const canNet = () => (mockOn() || !!cfg().relay) && signedIn() && !inBackoff();
  function pump() {
    if (ST.inflight || !ST.queue) return;
    if (!canNet()) { const j = ST.queue; ST.queue = null; localReply(j.text, j.parsed); notifyStatus(); return; }
    const j = ST.queue; ST.queue = null; run(j);
  }
  async function run(job) {
    let built;
    try { built = buildBody(job); } catch (e) { console.warn('[squad-chat] state', e); if (job.kind === 'chat') localReply(job.text, job.parsed); return; }
    if (!built.body.party.some(h => !h.lead && h.persona && !h.dead)) { if (job.kind === 'chat') localReply(job.text, job.parsed); return; }
    ST.inflight = job; ST.stats.requests++; notifyStatus();
    const ac = new AbortController(); const to = setTimeout(() => ac.abort(), cfg().timeoutMs);
    let res = null, err = null;
    try { res = await transport(built.body, ac.signal); } catch (e) { err = e; } finally { clearTimeout(to); }
    ST.inflight = null;
    const j = res && res.json;
    if (!err && res.status === 200 && j && j.ok === true && Array.isArray(j.lines)) {
      const L = lead(); const lines = [];
      for (const l of j.lines) {
        if (!l || typeof l.who !== 'string' || typeof l.text !== 'string' || lines.length >= 4) continue;
        const real = built.idMap[l.who]; const h = real != null && members().find((x, i) => heroId(x, i) === real);
        if (!h || h === L || !h.persona) continue;
        const text = line(l.text); if (text) lines.push({ who: real, text });
      }
      if (lines.length) {
        ST.fails = 0; ST.backoffUntil = 0; ST.lastError = null; ST.noticeStreak = false; ST.stats.ok++;
        emitStaggered(lines, 'online', 0);
        if (job.kind === 'chat') applyModelOrders(j.orders, job, built.idMap);
        notifyStatus(); pump(); return;
      }
      failed(job, 'bad_output', 0);
    } else {
      const code = err ? (err.name === 'AbortError' ? 'timeout' : 'network') : (j && typeof j.error === 'string' ? j.error : 'http_' + (res ? res.status : 0));
      const ra = res ? (+(j && j.retryAfter) || res.retryAfter || 0) : 0;
      if (res && res.status === 401) ST.forceRefresh = true;
      failed(job, code, ra);
    }
    notifyStatus(); pump();
  }
  function applyModelOrders(orders, job, idMap) {
    if (!Array.isArray(orders)) return;
    const done = new Set((job.applied || []).map(o => o.who)); let n = 0;
    for (const o of orders) {
      if (!o || typeof o !== 'object' || n >= 4) continue;
      const who = o.who === 'all' ? 'all' : idMap[o.who]; if (who == null) continue;
      if (done.has('all') || done.has(who) || (who === 'all' && done.size)) continue;   // the player's own words were already applied
      if (who !== 'all') { const h = members().find((x, i) => heroId(x, i) === who); if (!h || h === lead()) continue; }
      const r = {};
      if (STANCES.includes(o.stance)) r.stance = o.stance;
      if (o.focus === null || FOCUS.includes(o.focus)) r.focus = o.focus;
      if (typeof o.hold === 'boolean') r.hold = o.hold;
      if (typeof o.follow === 'boolean') r.follow = o.follow;
      if (!Object.keys(r).length) continue;
      callOrder(who, r); done.add(who); n++;
    }
  }
  function failed(job, code, retryAfter) {
    ST.fails++; ST.stats.errors++; ST.lastError = code;
    let ms = Math.min(15000 * Math.pow(2, ST.fails - 1), 10 * 60000);
    if (retryAfter > 0) ms = Math.max(ms, Math.min(retryAfter * 1000, code === 'cap_reached' ? 6 * 3600000 : 3600000));
    if (code === 'unauthorized' || code === 'forbidden' || code === 'anonymous') ms = Math.max(ms, 5 * 60000);
    ST.backoffUntil = now() + ms;
    if (!ST.noticeStreak) {
      ST.noticeStreak = true;
      notice(code === 'cap_reached' ? 'Cloud chat has used up this month\'s budget. Your companions speak from memory until next month.'
        : code === 'rate_limited' ? 'Your companions need a breather from cloud chat. They speak from memory for a while.'
          : code === 'unauthorized' ? 'Cloud chat could not confirm your sign-in. Companions speak from memory; try signing in again.'
            : 'Cloud chat is offline. Your companions speak from memory for now.');
    }
    if (job.kind === 'chat') localReply(job.text, job.parsed);
    else if (IMPORTANT[job.type]) localBark(job.type, job.data);
  }

  /* ---------------- public ---------------- */
  function status() {
    if (ST.inflight) return 'busy';
    if (!mockOn() && !cfg().relay) return 'off';
    if (!signedIn()) return 'fallback';
    if (inBackoff()) return 'error';
    return 'online';
  }
  function statusInfo() {
    const s = status(); const retry = Math.max(0, Math.ceil((ST.backoffUntil - now()) / 1000));
    const label = { off: 'Cloud chat is not set up', fallback: 'Sign in for cloud chat', online: 'Cloud chat online', busy: 'Companions are thinking…', error: 'Cloud chat is offline' }[s];
    const detail = s === 'off' ? 'Companions use their own lines.' : s === 'fallback' ? 'Companions speak from memory. Sign in to let them answer freely.'
      : s === 'error' ? (ST.lastError === 'cap_reached' ? 'This month\'s chat budget is used up.' : ST.lastError === 'rate_limited' ? 'Resting after a lot of talk.' : 'Companions speak from memory.') + (retry ? ` Retrying in ${retry > 90 ? Math.ceil(retry / 60) + ' min' : retry + ' s'}.` : '') : '';
    return { status: s, label, detail, relay: !!cfg().relay || mockOn(), signedIn: signedIn(), retryInSec: retry, lastError: ST.lastError, stats: Object.assign({}, ST.stats) };
  }
  function send(text) {
    const t = clean(text, IN_MAX); if (!t) return false;
    const l = emit('you', t, 'local');
    const idx = ST.log.lastIndexOf(l);
    const parsed = parseOrders(t);
    const applied = applyParsed(parsed);
    if (!talkers().length) { if (now() - (ST.typeAt._alone || -1e15) > 60000) { ST.typeAt._alone = now(); later(300, () => notice('Nobody is with you to answer.')); } return true; }
    if ((mockOn() || cfg().relay) && signedIn() && !inBackoff()) {
      if (ST.queue) {   // merge with a message still waiting behind the one in flight
        ST.stats.merged++; ST.queue.text = clean(t, IN_MAX); ST.queue.logIndex = idx; ST.queue.applied = ST.queue.applied.concat(applied).slice(-4);
        ST.queue.parsed = parsed || ST.queue.parsed;
      } else ST.queue = { kind: 'chat', text: t, applied, parsed, logIndex: idx };
      pump(); notifyStatus();
    } else localReply(t, parsed);
    return true;
  }
  function event(type, data) {
    if (!EVENTS.includes(type)) return false;
    const t = now();
    // The same event delivered twice (squadDispatch calling both squadEvent and SQUAD_CHAT.event): count it once.
    const d = ST.lastEv; if (d && d.type === type && d.data === data && t - d.t < 50) return d.r;
    const r = event_(type, data, t); ST.lastEv = { type, data, t, r }; return r;
  }
  function event_(type, data, t) {
    if (canNet() && !ST.inflight && !ST.queue && t - ST.lastAuto >= cfg().autoGapMs && talkers().length) {
      ST.lastAuto = t; ST.typeAt[type] = t;
      run({ kind: 'event', type, data, subject: subjectOf(type, data) });
      return 'online';
    }
    if (IMPORTANT[type] || type === 'idle' || type === 'map_enter' || type === 'swap') return localBark(type, data) ? 'local' : false;
    return false;
  }
  function onLine(cb) {
    if (typeof cb !== 'function') return () => {};
    ST.subs.push(cb);
    if (ST.subs.length === 1 && ST.unseen.length) { const u = ST.unseen.splice(0); for (const l of u) { try { cb(l); } catch (e) { console.warn('[squad-chat] line listener', e); } } }
    return () => { const i = ST.subs.indexOf(cb); if (i >= 0) ST.subs.splice(i, 1); };
  }
  function onStatus(cb) {
    if (typeof cb !== 'function') return () => {};
    ST.statusSubs.push(cb); return () => { const i = ST.statusSubs.indexOf(cb); if (i >= 0) ST.statusSubs.splice(i, 1); };
  }
  function reset() {
    for (const id of ST.timers) clearTimeout(id); ST.timers.clear();
    Object.assign(ST, { log: [], unseen: [], queue: null, lastAuto: -1e15, backoffUntil: 0, fails: 0, lastError: null, noticeStreak: false, lastBark: -1e15, typeAt: {}, signedCache: { t: 0, v: false }, forceRefresh: false, lastEv: null });
    for (const k in ST.stats) ST.stats[k] = 0;
    Object.assign(M, { signedIn: true, latency: 300, fail: null, failOnce: null, calls: [], active: 0, maxActive: 0 });
  }

  window.SQUAD_CHAT = {
    version: 1, send, onLine, onStatus, status, statusInfo, event,
    // a companion line from game code (e.g. squad quest barks): shown like any offline line, no request
    say: (who, text) => { if (typeof who === 'string' && who && who !== 'you' && who !== 'system' && typeof text === 'string') emit(who, text, 'local'); },
    history: () => ST.log.map(l => ({ who: l.who, text: l.text, t: l.t, src: l.src })),
    get config() { return cfg(); },
    parseOrders, intentOf,
    get mock() { return mockOn() ? M : null; },
    _test: { state: () => ST, buildBody: j => buildBody(j || { kind: 'event', type: 'idle' }), reset, talkers, threats, currentQuest }
  };

  // squadEvent: core calls it (guarded) for chat events. Define it, or wrap one defined earlier.
  try {
    const prev = typeof window.squadEvent === 'function' && !window.squadEvent.__aomChat ? window.squadEvent : null;
    const fn = function (type, data) { if (prev) { try { prev(type, data); } catch (e) { console.warn('[squad-chat] squadEvent', e); } } try { return window.SQUAD_CHAT.event(type, data); } catch (e) { console.warn('[squad-chat] event', e); } };
    fn.__aomChat = true; window.squadEvent = fn;
  } catch (e) { /* */ }
  // Keep the status fresh for listeners (backoff expiring, sign-in changing) without the UI having to poll.
  setInterval(() => { try { notifyStatus(); } catch (e) { /* */ } }, 1000);
})();
