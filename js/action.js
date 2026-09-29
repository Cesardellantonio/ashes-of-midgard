'use strict';
/* =========================================================
   Action controls: play with the keyboard (or a gamepad)
   instead of clicking. WASD moves relative to the camera,
   J light-attack combo, K charged heavy, L block (tap early
   to parry), Space dodge roll with invulnerability frames.
   Click-to-move keeps working alongside it.
   ========================================================= */
const CTRL = { mode: store('aom-ctrl') || 'action', keys: new Set(), pad: null, padPrev: [], lock: null };
let HITSTOP = 0, SHAKE = 0;
const isAction = () => CTRL.mode === 'action';
const WINKEYS = {
  action: { KeyC: 'status', KeyI: 'inv', KeyG: 'equip', KeyV: 'skills', KeyN: 'journal', KeyH: 'help', Comma: 'worldmap' },
  classic: { KeyA: 'status', KeyI: 'inv', KeyE: 'equip', KeyS: 'skills', KeyJ: 'journal', KeyH: 'help', KeyW: 'worldmap' },
};
// Comma is not an action key: ui.js opens the World Map on ',' in both modes (and on W in classic mode).
const ALTWIN = { KeyA: 'status', KeyE: 'inv', KeyQ: 'equip', KeyS: 'skills', KeyU: 'journal', KeyJ: 'journal', KeyH: 'help', KeyI: 'inv', KeyW: 'worldmap' };
const ACTION_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyJ', 'KeyK', 'KeyL', 'Space', 'KeyQ', 'KeyE', 'KeyF', 'Tab', 'KeyC', 'KeyG', 'KeyV', 'KeyN']);

function setCtrlMode(m) {
  CTRL.mode = m; store('aom-ctrl', m); CTRL.keys.clear(); if (P) P.blocking = false;
  refreshKeyHints();
  log(m === 'action' ? 'Action controls: WASD move · J attack · K heavy (hold) · L block · Space dodge · F talk.' : 'Classic controls: click to move and attack.', 'sys');
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
  }
}, true);
addEventListener('keyup', e => {
  CTRL.keys.delete(e.code);
  if (!started || !P) return;
  if (e.code === 'KeyK') actHeavyRelease();
  if (e.code === 'KeyL') actBlock(false);
}, true);
addEventListener('blur', () => { CTRL.keys.clear(); if (P) { P.blocking = false; if (P.charge >= 0) actHeavyRelease(); } });

function moveInput() {
  const k = CTRL.keys; let ix = 0, iy = 0;
  if (isAction()) { ix = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0); iy = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0); }
  if (CTRL.pad) { ix += CTRL.pad.x; iy -= CTRL.pad.y; }
  if (Math.hypot(ix, iy) < 0.25) return null;
  const rx = Math.cos(cam.yaw), ry = -Math.sin(cam.yaw), fx = -Math.sin(cam.yaw), fy = -Math.cos(cam.yaw);
  const x = rx * ix + fx * iy, y = ry * ix + fy * iy, n = Math.hypot(x, y) || 1;
  return [x / n, y / n];
}
function freeAt(x, y) { const r = 0.26; return !blocked(x - r, y - r) && !blocked(x + r, y - r) && !blocked(x - r, y + r) && !blocked(x + r, y + r); }
function stepMove(dx, dy) { if (freeAt(P.x + dx, P.y)) P.x += dx; if (freeAt(P.x, P.y + dy)) P.y += dy; }

/* ---------- Gamepad (Xbox layout) ---------- */
function pollPad(dt) {
  const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(g => g && g.connected) : null;
  if (!gp) { CTRL.pad = null; return; }
  const dz = v => Math.abs(v) < 0.2 ? 0 : v;
  CTRL.pad = { x: dz(gp.axes[0] || 0), y: dz(gp.axes[1] || 0) };
  const rsx = dz(gp.axes[2] || 0); if (rsx) { cam.yawT -= rsx * dt * 2.2; cam.yaw = cam.yawT; }
  const b = i => !!(gp.buttons[i] && gp.buttons[i].pressed), prev = CTRL.padPrev, down = i => b(i) && !prev[i], up = i => !b(i) && prev[i];
  if (started && $('dialog').hidden) {
    if (down(2)) actLight(); if (down(3)) actHeavyStart(); if (up(3)) actHeavyRelease();
    if (down(1)) actDodge(); if (down(4) || down(5)) actBlock(true); if ((up(4) || up(5)) && !b(4) && !b(5)) actBlock(false);
    if (down(0)) actInteract(); if (down(12)) useHot(0); if (down(15)) useHot(1); if (down(13)) useHot(2); if (down(14)) useHot(3);
    if (down(9)) toggleWin('status'); if (down(8)) toggleWin('inv');
  } else if (!$('dialog').hidden && down(0)) { const btn = $('dopts').querySelector('button'); if (btn) btn.click(); }
  CTRL.padPrev = gp.buttons.map(x => x.pressed);
}

/* ---------- Targeting ---------- */
function softTarget(range, cone) {
  if (CTRL.lock && !CTRL.lock.dead && dist(CTRL.lock, P) <= range + 1) return CTRL.lock;
  let best = null, bs = -1e9;
  for (const m of mobs) {
    if (m.dead) continue; const dx = m.x - P.x, dy = m.y - P.y, d = Math.hypot(dx, dy); if (d > range) continue;
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
function canAct() { return P && !P.dead && !P.casting && !(P.dodgeT > 0); }
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
  after(0.2, () => {
    if (P.dead) return;
    const n = meleeArc(S.range + 0.6 + c * 0.7, -0.1, mul, { knock: 2 + c, stun: 0.8, heavy: true, from: { x: P.x, y: P.y } });
    ring(P.x + P.fx, P.y + P.fy, 1.3 + c, c >= 1 ? '#ffb040' : '#ffe0a0'); burst(P.x + P.fx, P.y + P.fy, 4, '#d8c8a0', 18, 3);
    if (!n) Sfx.swing(); SHAKE = Math.max(SHAKE, 0.12 + c * 0.15);
  });
}
function meleeArc(range, cone, mul, o) {
  let hit = 0;
  for (const m of mobs) {
    if (m.dead) continue; const dx = m.x - P.x, dy = m.y - P.y, d = Math.hypot(dx, dy); const r = range + (m.d.size || (m.d.look && m.d.look.scale) || 1) * 0.35;
    if (d > r) continue; const dot = d < 0.3 ? 1 : (dx * P.fx + dy * P.fy) / d; if (dot < cone) continue;
    const hp = m.hp; physHit(m, mul, o);
    if (m.hp < hp && !m.dead) m.stun = Math.max(m.stun || 0, m.d.boss ? (o.heavy ? 0.3 : 0) : o.stun);
    hit++;
  }
  if (hit) { HITSTOP = Math.max(HITSTOP, o.heavy ? 0.09 : 0.045); if (o.heavy) SHAKE = Math.max(SHAKE, 0.2); }
  return hit;
}
function actDodge() {
  if (!P || P.dead || P.dodgeT > 0) return;
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
function actInteract() {
  let best = null, bd = 2.4;
  for (const n of map.npcs) { const d = dist(n, P); if (d < bd) { bd = d; best = { k: 'npc', r: n }; } }
  for (const o of map.objs) { if (o.kind === 'anvil') continue; const d = dist(o, P); if (d < bd + 0.6) { bd = d; best = { k: 'obj', r: o }; } }
  for (const d_ of drops) { const d = dist(d_, P); if (d < Math.min(bd, 1.8)) { bd = d; best = { k: 'drop', r: d_ }; } }
  if (!best) { floatText(P, '...', 'miss'); return; }
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
