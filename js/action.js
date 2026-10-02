'use strict';
/* =========================================================
   Action controls: play with the keyboard (or a gamepad)
   instead of clicking. WASD moves relative to the camera,
   J light-attack combo, K charged heavy, L block (tap early
   to parry), Space dodge roll with invulnerability frames,
   Shift jump (classic mode: Space; gamepad: RT).
   Click-to-move keeps working alongside it.
   ========================================================= */
const CTRL = { mode: store('aom-ctrl') || 'action', keys: new Set(), pad: null, padPrev: [], lock: null };
let HITSTOP = 0, SHAKE = 0;
/* Anime timing hooks (design/anime-anim-contract.md):
   - animHitHint (gfx-sheets.js) is told when each swing's damage lands, so sheets with per-frame `durs` show their
     impact frame on that moment (damage numbers, hit flash and the hit-stop all start there).
   - hitstopScale(): the game-time scale during a hit-stop (ui.js frame(), when it has the hook). With anime effects on
     (GFX.animeFx) it is a near-freeze for the first ~60% of the stop, then eases back out; otherwise the old flat 0.12.
   - animeStop(old, anime): the stop length of a landed melee arc, a touch longer with anime effects on. */
const HSTOP = { peak: 0, last: 0 };
const animeOn = () => typeof GFX !== 'undefined' && GFX.animeFx !== false;
function hitstopScale() {
  if (!animeOn()) return 0.12;
  if (HITSTOP > HSTOP.last + 1e-4 || HSTOP.peak < HITSTOP) HSTOP.peak = HITSTOP;
  HSTOP.last = HITSTOP;
  const p = HSTOP.peak > 0 ? 1 - Math.max(0, HITSTOP) / HSTOP.peak : 1;
  return p < 0.6 ? 0.025 : 0.025 + 0.55 * ((p - 0.6) / 0.4) * ((p - 0.6) / 0.4);
}
const animeStop = (old, anime) => animeOn() ? anime : old;
const hitHint = (delay, kind) => { if (typeof animHitHint === 'function') animHitHint(P, delay, kind); };
const isAction = () => CTRL.mode === 'action';
const WINKEYS = {
  action: { KeyC: 'status', KeyI: 'inv', KeyG: 'equip', KeyV: 'skills', KeyN: 'journal', KeyH: 'help', Comma: 'worldmap', KeyP: 'pet' },
  classic: { KeyA: 'status', KeyI: 'inv', KeyE: 'equip', KeyS: 'skills', KeyJ: 'journal', KeyH: 'help', KeyW: 'worldmap', KeyP: 'pet' },
};
// Comma is not an action key: ui.js opens the World Map on ',' in both modes (and on W in classic mode).
const ALTWIN = { KeyA: 'status', KeyE: 'inv', KeyQ: 'equip', KeyS: 'skills', KeyU: 'journal', KeyJ: 'journal', KeyH: 'help', KeyI: 'inv', KeyW: 'worldmap', KeyP: 'pet' };
const ACTION_KEYS = new Set(['ShiftLeft', 'ShiftRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyJ', 'KeyK', 'KeyL', 'Space', 'KeyQ', 'KeyE', 'KeyF', 'Tab', 'KeyC', 'KeyG', 'KeyV', 'KeyN', 'KeyR', 'KeyP']);   // round 6: R rides / dismounts, P opens the Pet window

function setCtrlMode(m) {
  CTRL.mode = m; store('aom-ctrl', m); CTRL.keys.clear(); if (P) P.blocking = false;
  refreshKeyHints();
  log(m === 'action' ? 'Action controls: WASD move · J attack · K heavy (hold) · L block · Space dodge · F talk · R ride.' : 'Classic controls: click to move and attack.', 'sys');
  UI.dirty = true;
}
function refreshKeyHints() {
  const map = WINKEYS[CTRL.mode]; const inv = {}; for (const k in map) inv[map[k]] = keyLabel(k);
  document.querySelectorAll('.menu [data-win]').forEach(b => { const kb = b.querySelector('kbd'); if (kb) kb.textContent = inv[b.dataset.win] || ''; });
}
const keyLabel = code => code === 'Comma' ? ',' : code.replace('Key', '');
const winKey = id => { const map = WINKEYS[CTRL.mode]; for (const k in map) if (map[k] === id) return keyLabel(k); return ''; };

/* ---------- Input ---------- */
addEventListener('keydown', e => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  if (e.altKey && ALTWIN[e.code]) { e.preventDefault(); e.stopImmediatePropagation(); if (started) toggleWin(ALTWIN[e.code]); return; }
  if (!started || !isAction() || e.ctrlKey || e.metaKey || e.altKey) return;
  if (!$('dialog').hidden || !$('death').hidden) return;
  if (!ACTION_KEYS.has(e.code)) return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (e.repeat) return;
  CTRL.keys.add(e.code); Sfx.unlock();
  if (typeof TRAVEL !== 'undefined' && TRAVEL.lock) return;   // mapfix F3: behind the travel fade, held moves count, actions wait
  const win = WINKEYS.action[e.code]; if (win) { toggleWin(win); return; }
  switch (e.code) {
    case 'KeyJ': actLight(); break;
    case 'KeyK': actHeavyStart(); break;
    case 'KeyL': actBlock(true); break;
    case 'Space': actDodge(); break;
    case 'KeyQ': cam.yawT += Math.PI / 8; break;
    case 'KeyE': cam.yawT -= Math.PI / 8; break;
    case 'KeyF': actInteract(); break;
    case 'Tab': actLockCycle(); break;
    case 'KeyR': toggleMount(); break;
    case 'ShiftLeft': case 'ShiftRight': if (!(typeof mouse !== 'undefined' && mouse.down)) heroJump(P); break;   // (Shift held for a camera drag does not jump)
  }
}, true);
// Classic mode: Space jumps (ui.js leaves Space alone outside dialogs; action mode handles its own keys above).
addEventListener('keydown', e => {
  if (e.code !== 'Space' || isAction() || !started || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON')) return;
  if (!$('dialog').hidden || !$('death').hidden) return;
  e.preventDefault(); heroJump(P);
});
addEventListener('keyup', e => {
  CTRL.keys.delete(e.code);
  if (!started || !P) return;
  if (e.code === 'KeyK') actHeavyRelease();
  if (e.code === 'KeyL') actBlock(false);
}, true);
addEventListener('blur', () => { CTRL.keys.clear(); if (P) { P.blocking = false; if (P.charge >= 0) actHeavyRelease(); } });

const MOVEV = [0, 0];
function moveInput() {
  const k = CTRL.keys; let ix = 0, iy = 0;
  if (isAction()) { ix = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0); iy = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0); }
  if (CTRL.pad) { ix += CTRL.pad.x; iy -= CTRL.pad.y; }
  if (hyp(ix, iy) < 0.25) return null;
  const rx = Math.cos(cam.yaw), ry = -Math.sin(cam.yaw), fx = -Math.sin(cam.yaw), fy = -Math.cos(cam.yaw);
  const x = rx * ix + fx * iy, y = ry * ix + fy * iy, n = hyp(x, y) || 1;
  MOVEV[0] = x / n; MOVEV[1] = y / n; return MOVEV;   // perf round 5: one reused array (callers read it at once)
}
function freeAt(x, y) { const r = 0.26; return !blocked(x - r, y - r) && !blocked(x + r, y - r) && !blocked(x - r, y + r) && !blocked(x + r, y + r); }
function stepMove(dx, dy) { if (freeAt(P.x + dx, P.y)) P.x += dx; if (freeAt(P.x, P.y + dy)) P.y += dy; }

/* ---------- Gamepad (Xbox layout) ---------- */
// Gamepads are only polled once one has connected (no getGamepads() call or array copy per tick before that).
let PAD_SEEN = false;
addEventListener('gamepadconnected', () => { PAD_SEEN = true; });
function pollPad(dt) {
  let gp = null;
  if (PAD_SEEN && navigator.getGamepads) { const l = navigator.getGamepads(); for (let i = 0; i < l.length; i++) if (l[i] && l[i].connected) { gp = l[i]; break; } }
  if (!gp) { CTRL.pad = null; return; }
  const dz = v => Math.abs(v) < 0.2 ? 0 : v;
  CTRL.pad = { x: dz(gp.axes[0] || 0), y: dz(gp.axes[1] || 0) };
  const rsx = dz(gp.axes[2] || 0); if (rsx) { cam.yawT -= rsx * dt * 2.2; cam.yaw = cam.yawT; }
  const b = i => !!(gp.buttons[i] && gp.buttons[i].pressed), prev = CTRL.padPrev, down = i => b(i) && !prev[i], up = i => !b(i) && prev[i];
  if (started && $('dialog').hidden) {
    if (down(2)) actLight(); if (down(3)) actHeavyStart(); if (up(3)) actHeavyRelease(); if (down(7)) heroJump(P);   // RT jumps
    // cycle 8: with companions the right bumper takes control of the next hero (squadCycle); the left one still blocks
    const rbSwap = typeof PARTY !== 'undefined' && PARTY && PARTY.members.length > 1 && typeof squadCycle === 'function';
    if (down(1)) actDodge(); if (down(4) || (down(5) && !rbSwap)) actBlock(true); if ((up(4) || up(5)) && !b(4) && !(b(5) && !rbSwap)) actBlock(false);
    if (rbSwap && down(5)) squadCycle(1);
    if (down(0)) actInteract(); if (down(12)) useHot(0); if (down(15)) useHot(1); if (down(13)) useHot(2); if (down(14)) useHot(3);
    if (down(9)) toggleWin('status'); if (down(8)) toggleWin('inv');
  } else if (!$('dialog').hidden && down(0)) { const btn = $('dopts').querySelector('button'); if (btn) btn.click(); }
  const pp = CTRL.padPrev; pp.length = gp.buttons.length; for (let i = 0; i < gp.buttons.length; i++) pp[i] = gp.buttons[i].pressed;
}

/* ---------- Targeting ---------- */
function softTarget(range, cone) {
  if (CTRL.lock && !CTRL.lock.dead && dist(CTRL.lock, P) <= range + 1) return CTRL.lock;
  // perf round 5: with many mobs only the grid cells around the hero are visited, in mobs[] order (ties: first wins)
  const grid = typeof mobsNearIdx === 'function' && mobs.length >= MG_MIN && range < 1e6, L = mobs, idx = grid ? mobsNearIdx(P.x, P.y, range) : null, n = grid ? idx.length : L.length;
  let best = null, bs = -1e9;
  for (let k = 0; k < n; k++) {
    const m = grid ? L[idx[k]] : L[k];
    if (m.dead) continue; const dx = m.x - P.x, dy = m.y - P.y, d = hyp(dx, dy); if (d > range) continue;
    const dot = d < 0.01 ? 1 : (dx * P.fx + dy * P.fy) / d; if (dot < cone && d > 1.3) continue;
    const s = -d + dot * 2.5; if (s > bs) { bs = s; best = m; }
  }
  return best;
}
// Skill target in keyboard mode: the locked / soft target in front of you, else the nearest enemy in range.
// A foe a few steps beyond reach but in front of you also counts: the skill closes in (see useSkill).
function actionTarget(sk, lv) { const r = skillRange(sk, lv); return softTarget(r + 0.5, 0.2) || nearestMob(r + 0.3) || softTarget(r + 3, 0.55); }
function actLockCycle() {
  const list = mobs.filter(m => !m.dead && dist(m, P) < 12).sort((a, b) => dist(a, P) - dist(b, P));
  if (!list.length) { CTRL.lock = null; return; }
  const i = list.indexOf(CTRL.lock); CTRL.lock = i === list.length - 1 ? null : list[i + 1] || list[0];
  if (CTRL.lock) { face(P, CTRL.lock); floatText(CTRL.lock, 'Locked', 'info'); }
}

/* ---------- Moves ---------- */
function canAct() { return P && !P.dead && !P.casting && !(P.dodgeT > 0) && !P.jump; }
function actLight() {
  if (!canAct() || P.charge >= 0) return;
  if (P.swingT > 0) { if (P.swingT < 0.3) P.queued = 'light'; return; }
  const swing = Math.max(0.26, 0.9 / S.aspd), step = P.combo % 3, fin = step === 2;
  P.combo = step + 1; P.comboT = swing + 0.6;
  const t = softTarget(S.wtype === 'bow' ? S.range + 1 : S.range + 1.4, 0.3); if (t) face(P, t);
  P.swingT = swing; P.atkAnim = 0; P.sitting = false; P.path = null; P.target = null; P.goal = null;
  const mul = [1, 1.12, 1.6][step];
  if (S.wtype === 'bow') { if (t) shot(P, t, 'arrow', () => { physHit(t, mul, fin ? { knock: 1.5, from: { x: P.x, y: P.y } } : {}); attackProcs(t); }); Sfx.bow(); return; }
  stepMove(P.fx * 0.18, P.fy * 0.18);
  hitHint(swing * 0.45, fin ? 'fin' : 'light');
  after(swing * 0.45, () => { if (!P.dead && meleeArc(S.range + (fin ? 0.5 : 0.25), fin ? 0.15 : 0.35, mul, { knock: fin ? 1.6 : 0.3, stun: fin ? 0.55 : 0.22, from: { x: P.x, y: P.y } }) && t && !t.dead) attackProcs(t); });
  Sfx.swing();
  if (fin) after(swing * 0.45, () => ring(P.x + P.fx * 0.9, P.y + P.fy * 0.9, 1.1, '#fff0b0'));
}
function actHeavyStart() {
  if (!canAct() || P.swingT > 0 || P.charge >= 0) return;
  if (P.stamina < 15) { floatText(P, 'Tired', 'miss'); return; }
  P.charge = 0; P.atkAnim = -1; P.sitting = false; P.path = null; P.target = null;
}
function actHeavyRelease() {
  if (!P || P.charge < 0) return;
  const c = Math.min(1, P.charge / 0.8); P.charge = -1; if (P.dead) return;
  P.stamina -= 15 + c * 10; P.stamT = 0.8;
  const t = softTarget(S.wtype === 'bow' ? S.range + 1 : S.range + 2, 0.25); if (t) face(P, t);
  P.atkAnim = 0; P.swingT = 0.5; const mul = 1.6 + c * 1.4;
  if (S.wtype === 'bow') { if (t) shot(P, t, 'arrow', () => { physHit(t, mul, { knock: 2, from: { x: P.x, y: P.y } }); burst(t.x, t.y, 30, '#fff0b0', 14, 3); }, { spd: 26 }); Sfx.bow(); return; }
  stepMove(P.fx * 0.4, P.fy * 0.4);
  hitHint(0.2, 'heavy');
  after(0.2, () => {
    if (P.dead) return;
    const n = meleeArc(S.range + 0.6 + c * 0.7, -0.1, mul, { knock: 2 + c, stun: 0.8, heavy: true, from: { x: P.x, y: P.y } });
    ring(P.x + P.fx, P.y + P.fy, 1.3 + c, c >= 1 ? '#ffb040' : '#ffe0a0'); burst(P.x + P.fx, P.y + P.fy, 4, '#d8c8a0', 18, 3);
    if (!n) Sfx.swing(); SHAKE = Math.max(SHAKE, 0.12 + c * 0.15);
  });
}
function meleeArc(range, cone, mul, o) {
  let hit = 0;
  const one = m => {
    if (m.dead) return; const dx = m.x - P.x, dy = m.y - P.y, d = hyp(dx, dy); const r = range + (m.d.size || (m.d.look && m.d.look.scale) || 1) * 0.35;
    if (d > r) return; const dot = d < 0.3 ? 1 : (dx * P.fx + dy * P.fy) / d; if (dot < cone) return;
    const hp = m.hp; physHit(m, mul, o);
    if (m.hp < hp && !m.dead) m.stun = Math.max(m.stun || 0, m.d.boss ? (o.heavy ? 0.3 : 0) : o.stun);
    hit++;
  };
  // perf round 5: with many mobs only the grid cells in reach are visited, in mobs[] order (the candidate list is copied:
  // a hit can query again); mobs appended while swinging are visited afterwards, as the old for-of did
  const L = mobs;
  if (typeof mobsNearIdx !== 'function' || L.length < MG_MIN) { for (const m of L) one(m); }
  else {
    const n0 = L.length, idx = mobsNearIdx(P.x, P.y, range, true).slice();
    for (let k = 0; k < idx.length; k++) one(L[idx[k]]);
    for (let i = n0; i < L.length; i++) one(L[i]);
  }
  if (hit) { HITSTOP = Math.max(HITSTOP, o.heavy ? animeStop(0.09, 0.11) : o.knock > 1 ? animeStop(0.045, 0.07) : animeStop(0.045, 0.05)); if (o.heavy) SHAKE = Math.max(SHAKE, 0.2); }
  return hit;
}
function actDodge() {
  if (!P || P.dead || P.dodgeT > 0 || P.jump) return;
  if (P.stamina < 22) { floatText(P, 'Tired', 'miss'); return; }
  if (P.casting) cancelCast();
  P.stamina -= 22; P.stamT = 0.7;
  const v = moveInput(); if (v) { P.fx = v[0]; P.fy = v[1]; }
  P.dodgeT = 0.34; P.iframes = 0.3; P.swingT = 0; P.queued = null; P.charge = -1; P.blocking = false; P.sitting = false;
  P.path = null; P.target = null; P.goal = null; P.pending = null;
  Sfx.swing();
}
function actBlock(on) {
  if (!P) return;
  if (on) { if (P.dead || P.dodgeT > 0 || P.stamina <= 0) return; P.blocking = true; P.blockStart = time; P.charge = -1; P.sitting = false; const t = softTarget(5, -0.2); if (t) face(P, t); }
  else P.blocking = false;
}
// What the interact key (F / pad A) would use right now: { k: 'npc' | 'obj' | 'drop' | 'door', r, d } or null.
// UI round 11: a door or cave-mouth warp (wp.door) within DOOR_REACH tiles counts too, unless something is closer;
// ui.js reads the same pick for its "Read" / "Open" / door key hints, so the prompt always shows what F does.
const DOOR_REACH = 1.2;
function nearDoor(r) {
  let best = null, bd = r;
  for (const wp of map.warps) { if (!wp.door) continue; const d = hyp(P.x - wp.x - 0.5, P.y - wp.y - 0.5); if (d < bd) { bd = d; best = wp; } }
  return best ? { wp: best, d: bd } : null;
}
function actPick() {
  if (!P || !map) return null;
  let best = null, bd = 2.4;
  for (const n of map.npcs) { const d = dist(n, P); if (d < bd) { bd = d; best = { k: 'npc', r: n }; } }
  for (const o of map.objs) { if (o.kind === 'anvil') continue; const d = dist(o, P); if (d < bd + 0.6) { bd = d; best = { k: 'obj', r: o }; } }
  for (const d_ of drops) { const d = dist(d_, P); if (d < Math.min(bd, 1.8)) { bd = d; best = { k: 'drop', r: d_ }; } }
  const dr = nearDoor(DOOR_REACH);
  if (dr && (!best || dr.d <= bd)) return { k: 'door', r: dr.wp, d: dr.d };
  if (best) best.d = bd;
  return best;
}
// Walk the last step onto the door's tile: core postMove fires the warp (or, when it is sealed, says why and steps back).
function enterDoor(wp) {
  if (!wp || !P || P.dead) return false;
  const x = wp.x + 0.5, y = wp.y + 0.5;
  face(P, { x, y }); P.target = null; P.goal = null; P.pending = null; P.sitting = false;
  P.path = [{ x, y }];
  return true;
}
function actInteract() {
  const best = actPick();
  if (!best) { floatText(P, '...', 'miss'); return; }
  if (best.k === 'door') { enterDoor(best.r); return; }
  face(P, best.r); if (best.k === 'npc') talkTo(best.r); else if (best.k === 'obj') useObj(best.r); else pickup(best.r);
}

/* ---------- Per-frame ---------- */
function actionUpdate(dt) {
  pollPad(dt);
  P.stamT -= dt; if (P.stamT <= 0 && !P.blocking) P.stamina = Math.min(100, P.stamina + 34 * dt);
  if (P.blocking) { P.stamina = Math.max(0, P.stamina - 3 * dt); if (P.stamina <= 0) P.blocking = false; }
  if (P.comboT > 0) { P.comboT -= dt; if (P.comboT <= 0) P.combo = 0; }
  if (CTRL.lock && (CTRL.lock.dead || dist(CTRL.lock, P) > 14)) CTRL.lock = null;
  let busy = false;
  if (P.jump) { jumpMove(dt); P.moving = false; return true; }   // airborne / landing: momentum + air control, no attacks or paths
  if (P.dodgeT > 0) {
    P.dodgeT -= dt; const k = Math.max(0, P.dodgeT / 0.34); stepMove(P.fx * (4 + 7 * k) * dt, P.fy * (4 + 7 * k) * dt);
    if (Math.random() < 0.5) parts.push({ x: P.x + rand(-0.2, 0.2), y: P.y + rand(-0.2, 0.2), z: 2, vx: -P.fx * 0.5, vy: -P.fy * 0.5, vz: rand(10, 30), life: 0.35, max: 0.35, col: '#d8d0c0', size: 2.5 });
    if (P.dodgeT <= 0) P.dodgeT = 0; P.moving = false; return true;
  }
  if (P.swingT > 0) { P.swingT -= dt; busy = true; if (P.swingT <= 0) { P.swingT = 0; if (P.queued) { P.queued = null; actLight(); } } }
  if (P.charge >= 0) { P.charge += dt; busy = true; if (P.charge > 0.8 && Math.random() < 0.5) parts.push({ x: P.x + rand(-0.4, 0.4), y: P.y + rand(-0.4, 0.4), z: rand(10, 50), vx: 0, vy: 0, vz: 40, life: 0.4, max: 0.4, col: '#ffd060', size: 2.5, float: true }); }
  const v = moveInput();
  if (v && P.casting) cancelCast();
  if (v && !(P.swingT > 0) && P.charge < 0) {
    P.path = null; P.target = null; P.goal = null; P.pending = null; P.sitting = false; P.flags.tips.moved = true;
    const spd = S.move * (P.blocking ? 0.4 : 1) * surfMul(P);
    if (!P.blocking) { P.fx = v[0]; P.fy = v[1]; }
    stepMove(v[0] * spd * dt, v[1] * spd * dt);
    P.moving = true; P.walk += dt * spd * 3.4; busy = true;
  } else if (busy || P.blocking) P.moving = false;
  if (P.blocking) busy = true;
  return busy;
}

/* ---------- Jumping (cosmetic this round; climbing / height layers plug in later) ----------
   heroJump(h) starts a jump: a short crouch (JUMP.crouch s), an airborne arc of JUMP.air s peaking JUMP.peak sprite px
   high (h.z, h.vz; the renderer draws the sprite at h.z and shrinks its contact shadow), then a landing recovery
   (JUMP.land s). h.jump = { ph: 'crouch' | 'air' | 'land', t, vx, vy, x0, y0, map, onLand }. Horizontal motion keeps
   the take-off momentum plus a little air control and goes through stepMove, so collision is exactly the walking one.
   Hooks for later traversal: JUMP.canLand(x, y, z, h) (default: walkable ground; a refusal puts the hero back where
   it left the ground), JUMP.onLand(h) and h.jump.onLand(h) callbacks, JUMP.peak / JUMP.air per jump. Monsters hit an
   airborne hero as usual; warps wait for the landing (postMove is held while airborne); saves never store z (SAVE_KEYS).
   The renderer reads h.jumpAt (lift-off) and h.jumpLandAt (touch-down) for take-off after-images and landing dust. */
const JUMP = { crouch: 0.07, air: 0.45, peak: 0.9 * (typeof PXU !== 'undefined' ? PXU : 36), land: 0.1, airCtl: 0.3,
  canLand: (x, y, z, h) => !blocked(x, y), onLand: null };
function heroJump(h, o) {
  if (!h || h.dead || h.jump || !started || h.dodgeT > 0 || h.casting || h.dash || h.charge >= 0 || h.blocking) return false;
  if (typeof TRAVEL !== 'undefined' && TRAVEL.lock) return false;
  let vx = 0, vy = 0;
  if (h === P) {
    const v = moveInput(), spd = (typeof S !== 'undefined' ? S.move : 4) * (typeof surfMul === 'function' ? surfMul(h) : 1);
    if (v) { vx = v[0] * spd; vy = v[1] * spd; h.fx = v[0]; h.fy = v[1]; }
    else if (h.moving) { const n = hyp(h.fx || 0, h.fy || 0) || 1; vx = (h.fx || 0) / n * spd; vy = (h.fy || 0) / n * spd; }
  }
  h.sitting = false; h.z = 0; h.vz = 0;
  h.jump = { ph: 'crouch', t: 0, vx, vy, x0: h.x, y0: h.y, map: typeof map !== 'undefined' ? map : null, onLand: o && o.onLand || null };
  return true;
}
// Controlled hero, airborne: momentum + air control (through the walking collision); still while crouching / landing.
function jumpMove(dt) {
  const J = P.jump; if (J.ph !== 'air') return;
  const v = moveInput(), spd = S.move * JUMP.airCtl;
  let dx = J.vx * dt, dy = J.vy * dt;
  if (v) { dx += v[0] * spd * dt; dy += v[1] * spd * dt; P.fx = v[0]; P.fy = v[1]; }
  stepMove(dx, dy);
}
function jumpLand(h, J) {
  h.z = 0; h.vz = 0;
  if (!JUMP.canLand(h.x, h.y, 0, h)) { h.x = J.x0; h.y = J.y0; }
  J.ph = 'land'; J.t = 0; h.jumpLandAt = time;
  try { if (J.onLand) J.onLand(h); if (JUMP.onLand) JUMP.onLand(h); } catch (e) { console.error(e); }
}
function jumpTick(h, dt) {
  const J = h.jump; if (!J) return;
  if (typeof map !== 'undefined' && J.map !== map) { h.jump = null; h.z = 0; h.vz = 0; return; }   // the map changed under the jump
  J.t += dt;
  if (J.ph === 'crouch') { if (J.t >= JUMP.crouch) { J.ph = 'air'; J.t -= JUMP.crouch; h.jumpAt = time; } else return; }
  if (J.ph === 'air') {
    const T = JUMP.air, v0 = 4 * JUMP.peak / T, g = 2 * v0 / T, t = Math.min(J.t, T);
    h.z = Math.max(0, v0 * t - g * t * t / 2); h.vz = v0 - g * t;
    if (J.t >= T) jumpLand(h, J);
    return;
  }
  if (J.ph === 'land' && J.t >= JUMP.land) h.jump = null;
}
// Every hero's jump advances each tick, whatever it is doing (dead, swapped out of control, behind a dash).
const _JH = [null];
function jumpTickAll(dt) {
  if (typeof P === 'undefined' || !P) return;
  const L = typeof PARTY !== 'undefined' && PARTY && PARTY.members && PARTY.members.length > 1 ? PARTY.members : (_JH[0] = P, _JH);
  for (let i = 0; i < L.length; i++) if (L[i] && L[i].jump) jumpTick(L[i], dt);
  if (P.jump && L.indexOf(P) < 0) jumpTick(P, dt);
}
if (typeof update === 'function' && !update._jump) {
  const update0 = update;
  try { update = function (dt) { const r = update0.apply(this, arguments); jumpTickAll(dt); return r; }; update._jump = true; } catch (e) { /* not writable */ }
}
// No skills in the air (attacks are refused by canAct; a click-mode target waits for the landing).
if (typeof useSkill === 'function' && !useSkill._jump) {
  const useSkill0 = useSkill;
  try { useSkill = function () { if (P && P.jump && P.jump.ph !== 'land') return; return useSkill0.apply(this, arguments); }; useSkill._jump = true; } catch (e) { /* not writable */ }
}
// Warps (and zeny pick-up) wait for the landing: postMove (core.js) is held while the controlled hero is off the ground.
if (typeof postMove === 'function' && !postMove._jump) {
  const postMove0 = postMove;
  try { postMove = function () { if (P && P.jump && P.jump.ph !== 'land') return; return postMove0.apply(this, arguments); }; postMove._jump = true; } catch (e) { /* not writable */ }
}

/* ---------- Hooks into the renderer's tables (files owned by the graphics / performance teams) ----------
   Weapon type ids equal the sprite weapon variants (art/CONTRACT.md), so every WNAME key maps to itself.
   Projectile kinds added by second-class skills get a colour. Tower shields use the 'tower' shield sheet. */
if (typeof WTYPE_VARIANT !== 'undefined') for (const k in WNAME) if (!WTYPE_VARIANT[k]) WTYPE_VARIANT[k] = k;
if (typeof PCOL !== 'undefined') Object.assign(PCOL, { spear: '#e8e0ff', raven: '#b8c8ff', sphere: '#9fd0ff' }, Object.assign({}, PCOL));
if (typeof SWINGCOL !== 'undefined') Object.assign(SWINGCOL, { spear: ['#d8d0ff', '#ffffff'], twohand: ['#a8c0ff', '#ffffff'], staff: ['#c49aff', '#fff0ff'], book: ['#ffe0a0', '#ffffff'], lute: ['#ffd070', '#fff6d0'], whip: ['#e0a0ff', '#fff0ff'], knuckle: ['#9fd0ff', '#ffffff'] }, Object.assign({}, SWINGCOL));
// Shield sprite variant for the equipped shield: the item's `sv` ('guard' | 'tower'), falling back to whichever sheet the body has.
function shieldVariant(body) {
  const it = P && P.equip && P.equip.shield; if (!it) return null;
  const want = (ITEMS[it.id] && ITEMS[it.id].sv) || 'guard', other = want === 'tower' ? 'guard' : 'tower';
  if (typeof sheetId !== 'function' || sheetId(body, 'shield', want)) return want;
  return sheetId(body, 'shield', other) ? other : want;
}
if (typeof playerLayerWants === 'function') {
  const baseWants = playerLayerWants;
  // eslint-disable-next-line no-global-assign
  try { playerLayerWants = function () { const w = baseWants(); if (w) for (const e of w) if (e[1] === 'shield') e[2] = shieldVariant(e[0]) || e[2]; return w; }; } catch (e) { /* renderer made it const: needs the one-line hook */ }
}
