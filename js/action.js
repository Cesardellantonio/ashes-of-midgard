'use strict';
/* =========================================================
   Action controls: play with the keyboard (or a gamepad) like a console game instead of clicking. The keys come
   from KEYMAP / keyBinds() (js/controls.js, rebindable): WASD moves relative to the camera, Space jumps, Shift held
   blocks (tap early to parry), J light-attack combo, K charged heavy, L dodge roll with invulnerability frames,
   U I O P cast skill slots 1-4 (hold ';' for 5-8), 1 2 3 4 use the item slots, F interacts, Tab locks a target,
   R rides; Q / E turn the camera (hold) or step it 45° (tap), Z zooms, C puts it behind you (see "Camera" below). Presses that come while the hero is still busy (a swing's recovery, a roll, a jump, a cast, a
   cooldown about to end) are buffered and fire the moment it can act (CTRL.buf, BUF).
   Classic (mouse) mode: Space jumps, the rest is click-to-move. Click-to-move keeps working alongside action mode.
   ========================================================= */
const CTRL = { mode: store('aom-ctrl') || 'action', keys: new Set(), pad: null, padPrev: [], lock: null, page2: false, padLB: false, buf: null, rbUsed: false, moveAt: -1, movePrev: false, castAt: -1, castPd: null };
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
// Window hotkeys. Action mode: only letters the keymap does not use (I, O, P, U are skills, Q E Z C the camera; open
// those windows with Alt+letter, e.g. Alt+C Status, or the menu). A key rebound onto one of these letters wins over the window.
const WINKEYS = {
  action: { KeyB: 'inv', KeyG: 'equip', KeyV: 'skills', KeyN: 'journal', KeyH: 'help', Comma: 'worldmap' },
  classic: { KeyA: 'status', KeyI: 'inv', KeyE: 'equip', KeyS: 'skills', KeyJ: 'journal', KeyH: 'help', KeyW: 'worldmap', KeyP: 'pet' },
};
// Comma is not an action key: ui.js opens the World Map on ',' in both modes (and on W in classic mode).
const ALTWIN = { KeyA: 'status', KeyC: 'status', KeyE: 'inv', KeyQ: 'equip', KeyS: 'skills', KeyU: 'journal', KeyJ: 'journal', KeyH: 'help', KeyI: 'inv', KeyW: 'worldmap', KeyP: 'pet', KeyL: 'loadout', KeyK: 'keys' };
const ARROWS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
// Every key action mode takes for itself (kept up to date by ctlKeysRebuilt when keys are rebound).
const ACTION_KEYS = new Set();
function ctlKeysRebuilt() {
  ACTION_KEYS.clear();
  for (const id in KEYMAP) { const c = keyCode(id); if (c && id !== 'menu') ACTION_KEYS.add(c); }
  if (ACTION_KEYS.has('ShiftLeft')) ACTION_KEYS.add('ShiftRight');
  for (const c in ARROWS) ACTION_KEYS.add(c);
  for (const c in WINKEYS.action) if (c !== 'KeyH' && c !== 'Comma') ACTION_KEYS.add(c);
}
ctlKeysRebuilt();

function setCtrlMode(m) {
  CTRL.mode = m; store('aom-ctrl', m); CTRL.keys.clear(); CTRL.buf = null; CTRL.page2 = false; if (P) P.blocking = false;
  refreshKeyHints();
  const k = keyFor;
  log(m === 'action' ? `Action controls: ${k('up')}${k('left')}${k('down')}${k('right')} move · ${k('light')} attack · ${k('heavy')} heavy (hold) · ${k('dodge')} dodge · ${k('block')} block · ${k('jump')} jump · ${k('skill1')} ${k('skill2')} ${k('skill3')} ${k('skill4')} skills · ${k('item1')}-${k('item4')} items · ${k('camLeft')} ${k('camRight')} turn the camera · ${k('zoom')} zoom · ${k('interact')} talk.` : 'Classic controls: click to move and attack. Space jumps.', 'sys');
  UI.dirty = true;
}
function refreshKeyHints() {
  const map = WINKEYS[CTRL.mode]; const inv = {}; for (const k in map) inv[map[k]] = keyLabel(k);
  document.querySelectorAll('.menu [data-win]').forEach(b => { const kb = b.querySelector('kbd'); if (kb) kb.textContent = inv[b.dataset.win] || ''; });
}
const keyLabel = code => code === 'Comma' ? ',' : code.replace('Key', '');
const winKey = id => { const map = WINKEYS[CTRL.mode]; for (const k in map) if (map[k] === id) return keyLabel(k); return ''; };

/* ---------- Input buffer ----------
   ctlPress(kind, arg): kind 'light' | 'heavy' | 'dodge' | 'jump' | 'skill' (arg: the slot index). When the hero is busy
   for at most BUF.max more seconds, the press waits in CTRL.buf and fires as soon as it is free (BUF.grace after that
   it expires); a later press replaces it. ctlBusy says for how long a kind of press would still be refused. */
const BUF = { max: 0.6, grace: 0.12 };
function jumpLeft() {
  const J = P.jump; if (!J) return 0;
  if (J.ph === 'crouch') return JUMP.crouch - J.t + JUMP.air + JUMP.land;
  return J.ph === 'air' ? JUMP.air - J.t + JUMP.land : Math.max(0.001, JUMP.land - J.t);
}
function ctlBusy(kind, arg) {
  if (!P || P.dead) return 0;
  let l = 0; const m = v => { if (v > l) l = v; };
  if (P.dodgeT > 0) m(P.dodgeT);
  if (P.dash) m(0.15);
  if (kind === 'jump') { if (P.casting) m(P.castT); return l; }
  if (P.jump) m(kind === 'skill' && P.jump.ph === 'land' ? 0 : jumpLeft());
  if (kind === 'dodge') return l;
  if (P.casting) m(P.castT);
  if (P.swingT > 0) m(kind === 'light' ? P.swingT - 0.29 : P.swingT);   // a light press under 0.3 s queues the next hit itself
  if (kind === 'skill') { const id = P.skillSlots && P.skillSlots[arg]; if (id && P.cd) m(P.cd[id] || 0); }
  return l;
}
function ctlPress(kind, arg) {
  if (!P || !started) return false;
  const left = ctlBusy(kind, arg);
  if (left > 0) { CTRL.buf = left <= BUF.max ? { kind, arg, until: time + left + BUF.grace, release: false } : null; return false; }
  CTRL.buf = null; return ctlFire(kind, arg);
}
function ctlFire(kind, arg, b) {
  switch (kind) {
    case 'light': actLight(); return true;
    case 'heavy': actHeavyStart(); if (b && b.release) actHeavyRelease(); return true;
    case 'dodge': actDodge(); return true;
    case 'jump': return heroJump(P);
    case 'skill': return ctlCastSlot(arg);
  }
  return false;
}
function ctlBufTick() {
  const b = CTRL.buf; if (!b) return;
  if (P.dead || time > b.until) { CTRL.buf = null; return; }
  if (ctlBusy(b.kind, b.arg) <= 0) { CTRL.buf = null; ctlFire(b.kind, b.arg, b); }
}
// Casts the skill on slot i (0-7) the way the hotbar does (useSkill: the lock or soft target, ground skills on the
// lock or ahead). A keyboard cast in reach starts at once, even mid-stride; one a few steps away closes in first.
function ctlCastSlot(i) {
  const id = P.skillSlots && P.skillSlots[i];
  if (!id) { floatText(P, 'Empty slot', 'miss'); return false; }
  const pd0 = P.pending; useSkill(id);
  const pd = P.pending; if (!pd || pd === pd0) return false;
  pd.kbAt = time;
  const sk = SKILLS[pd.id], tp = pd.target || pd.pos;
  if (!tp || sk.tgt === 'dir' || dist(P, tp) <= skillRange(sk, pd.lv) + 0.3) {
    P.pending = null; P.path = null; beginCast(pd);
    if (P.casting === pd) { CTRL.castAt = time; CTRL.castPd = pd; }
  }
  return true;
}
// Start: what Esc does (ui.js closes the top window or dialog); with nothing open, the Status window.
function ctlMenu() {
  const anyOpen = () => typeof UI !== 'undefined' && UI.open && Object.keys(UI.open).some(k => UI.open[k]);
  const was = anyOpen() || !$('dialog').hidden;
  dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
  if (!was && !anyOpen()) toggleWin('status');
}
function ctlSetPage2(on) { if (CTRL.page2 === on) return; CTRL.page2 = on; controlsChanged('page'); }

/* ---------- Input ---------- */
// Keys 1-4: use that item slot; with the pointer over a skill or an item (Skills, Items, the Loadout) they put it there.
function ctlItemKey(i) {
  const hb = typeof UI !== 'undefined' && UI && UI.hoverBind;
  if (hb && hb.startsWith('item:') && typeof hbPut === 'function') { hbPut('r:' + i, hb); return; }
  useItemSlot(i);
}
function ctlDo(act, code) {
  switch (act) {
    case 'jump': if (!(typeof mouse !== 'undefined' && mouse.down)) ctlPress('jump'); break;   // (not in the middle of a camera drag)
    case 'block': actBlock(true); break;
    case 'light': ctlPress('light'); break;
    case 'heavy': ctlPress('heavy'); break;
    case 'dodge': ctlPress('dodge'); break;
    case 'skill1': case 'skill2': case 'skill3': case 'skill4': ctlPress('skill', (+act[5] - 1) + (CTRL.page2 ? 4 : 0)); break;
    case 'page2': ctlSetPage2(true); break;
    case 'item1': case 'item2': case 'item3': case 'item4': ctlItemKey(+act[4] - 1); break;
    case 'quick': useQuickItem(); break;
    case 'cycle': cycleQuickItem(1); break;
    case 'camLeft': camTurnKey(1, true); break;
    case 'camRight': camTurnKey(-1, true); break;
    case 'zoom': camZoomCycle(); break;
    case 'camReset': camReset(); break;
    case 'autocam': camToggleFollow(); break;
    case 'interact': actInteract(); break;
    case 'lock': actLockCycle(); break;
    case 'ride': toggleMount(); break;
    case 'menu': ctlMenu(); break;
  }
}
addEventListener('keydown', e => {
  if (typeof uiKeyCapture === 'function' && uiKeyCapture(e)) return;   // the UI is reading keys (rebinding, Loadout, overlay)
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  if (e.altKey && ALTWIN[e.code]) { e.preventDefault(); e.stopImmediatePropagation(); if (started) toggleWin(ALTWIN[e.code]); return; }
  if (!started || !isAction() || e.ctrlKey || e.metaKey || e.altKey) return;
  if (!$('dialog').hidden || !$('death').hidden) return;
  const act = keyAction(e.code), win = act ? null : WINKEYS.action[e.code];
  if (!act && !win && !ARROWS[e.code]) return;
  if (act === 'menu' && e.code === 'Escape') return;   // ui.js handles Esc itself
  e.preventDefault(); e.stopImmediatePropagation();
  if (e.repeat) return;
  CTRL.keys.add(ctlNorm(e.code)); Sfx.unlock();
  if (act === 'page2') { ctlSetPage2(true); return; }
  if (typeof TRAVEL !== 'undefined' && TRAVEL.lock) return;   // mapfix F3: behind the travel fade, held moves count, actions wait
  if (win) { toggleWin(win); return; }
  if (act) ctlDo(act, e.code);
}, true);
// Classic mode: Space jumps (ui.js leaves Space alone outside dialogs; action mode handles its own keys above).
addEventListener('keydown', e => {
  if (e.code !== 'Space' || isAction() || !started || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON')) return;
  if (!$('dialog').hidden || !$('death').hidden) return;
  e.preventDefault(); heroJump(P);
});
addEventListener('keyup', e => {
  if (typeof uiKeyCapture === 'function' && uiKeyCapture(e)) return;
  CTRL.keys.delete(ctlNorm(e.code));
  const act = keyAction(e.code);
  if (act === 'page2') ctlSetPage2(CTRL.padLB);
  if (act === 'camLeft' || act === 'camRight') camTurnKey(act === 'camLeft' ? 1 : -1, false);
  if (!started || !P) return;
  if (act === 'heavy') { if (CTRL.buf && CTRL.buf.kind === 'heavy') CTRL.buf.release = true; else actHeavyRelease(); }
  if (act === 'block') actBlock(false);
}, true);
addEventListener('blur', () => { CAMX.keys.length = 0; CTRL.keys.clear(); CTRL.buf = null; CTRL.page2 = false; if (P) { P.blocking = false; if (P.charge >= 0) actHeavyRelease(); } });

const MOVEV = [0, 0];
function moveInput() {
  const k = CTRL.keys; let ix = 0, iy = 0;
  if (isAction()) {
    const B = CTL.binds;
    ix = (k.has(B.right) || k.has('ArrowRight') ? 1 : 0) - (k.has(B.left) || k.has('ArrowLeft') ? 1 : 0);
    iy = (k.has(B.up) || k.has('ArrowUp') ? 1 : 0) - (k.has(B.down) || k.has('ArrowDown') ? 1 : 0);
  }
  if (CTRL.pad) { ix += CTRL.pad.x; iy -= CTRL.pad.y; }
  if (hyp(ix, iy) < 0.25) { CAMX.inA = null; CAMX.autoAcc = 0; return null; }
  // Input latch (camera round): what auto-follow turned since the input last changed is taken back out, so a held
  // direction keeps its heading in the world while the camera swings behind it; turning the input lets it go smoothly.
  const ia = Math.atan2(iy, ix);
  if (CAMX.inA === null) CAMX.autoAcc = 0;
  else if (ia !== CAMX.inA) CAMX.autoAcc *= Math.max(0, 1 - Math.abs(camWrap(ia - CAMX.inA)) / 0.35);
  CAMX.inA = ia;
  const yaw = cam.yaw - CAMX.autoAcc, rx = Math.cos(yaw), ry = -Math.sin(yaw), fx = -Math.sin(yaw), fy = -Math.cos(yaw);
  const x = rx * ix + fx * iy, y = ry * ix + fy * iy, n = hyp(x, y) || 1;
  MOVEV[0] = x / n; MOVEV[1] = y / n; return MOVEV;   // perf round 5: one reused array (callers read it at once)
}
function freeAt(x, y) { const r = 0.26; return !blocked(x - r, y - r) && !blocked(x + r, y - r) && !blocked(x - r, y + r) && !blocked(x + r, y + r); }
function stepMove(dx, dy) { if (freeAt(P.x + dx, P.y)) P.x += dx; if (freeAt(P.x, P.y + dy)) P.y += dy; }

/* ---------- Gamepad (the browser's "standard" mapping: Xbox / PlayStation / Switch Pro pads in Chrome, Firefox, Edge) ----------
   Buttons: 0 A (cross) jump · 1 B (circle) dodge · 2 X (square) light · 3 Y (triangle) heavy (hold) · 4 LB / 5 RB
   held + X / Y / B / A cast skill slots 5-8 / 1-4 · 6 LT block (hold) · 7 RT lock / cycle target · 8 Back: Items ·
   9 Start: menu · 10 L3 (left-stick click): auto camera on / off · 11 R3: camera behind you · d-pad 12 up interact,
   13 down the selected item, 14 / 15 left / right select another. Right stick: X turns the camera, Y zooms. With
   companions, RB tapped on its own takes control of the next hero. Pads without the standard mapping are read with
   the same indices (most report it). Polling starts at the first 'gamepadconnected'. */
let PAD_SEEN = false;
addEventListener('gamepadconnected', () => { PAD_SEEN = true; });
const PAD_FACE = [2, 3, 1, 0];   // X Y B A -> skill slots 1-4 (the U I O P order)
function pollPad(dt) {
  let gp = null;
  if (PAD_SEEN && navigator.getGamepads) { const l = navigator.getGamepads() || []; for (let i = 0; i < l.length; i++) if (l[i] && l[i].connected) { gp = l[i]; break; } }
  if (!gp) { CTRL.pad = null; CAMX.stickX = CAMX.stickY = 0; if (CTRL.padLB) { CTRL.padLB = false; ctlSetPage2(CTRL.keys.has(keyCode('page2'))); } return; }
  const dz = v => Math.abs(v) < 0.2 ? 0 : v;
  CTRL.pad = { x: dz(gp.axes[0] || 0), y: dz(gp.axes[1] || 0) };
  const prev = CTRL.padPrev, b = i => { const B = gp.buttons[i]; return !!B && (B.pressed || B.value > 0.5); }, down = i => b(i) && !prev[i], up = i => !b(i) && prev[i];
  const lb = b(4), rb = b(5);
  if (CTRL.padLB !== (lb && !rb)) { CTRL.padLB = lb && !rb; ctlSetPage2(CTRL.padLB || CTRL.keys.has(keyCode('page2'))); }
  const capture = typeof uiPadCapture === 'function' && uiPadCapture();   // the UI is reading the pad (Loadout)
  // right stick: the camera (past the dead zone, rescaled and squared for fine control near the centre)
  const rs = v => { v = dz(v || 0); if (!v) return 0; const a = (Math.abs(v) - 0.2) / 0.8; return Math.sign(v) * a * a; };
  const live = !capture && started && $('dialog').hidden;
  CAMX.stickX = live ? rs(gp.axes[2]) : 0; CAMX.stickY = live ? rs(gp.axes[3]) : 0;
  if (capture) { if (down(9)) ctlMenu(); }   // game actions wait; Start still works as Esc (closes the Loadout and so on)
  else if (started && $('dialog').hidden) {
    if (down(5)) CTRL.rbUsed = false;
    if (rb || lb) { for (let k = 0; k < 4; k++) if (down(PAD_FACE[k])) { ctlPress('skill', k + (rb ? 0 : 4)); CTRL.rbUsed = true; } }
    else { if (down(0)) ctlPress('jump'); if (down(2)) ctlPress('light'); if (down(3)) ctlPress('heavy'); if (down(1)) ctlPress('dodge'); }
    if (down(7)) actLockCycle();
    if (up(3)) { if (CTRL.buf && CTRL.buf.kind === 'heavy') CTRL.buf.release = true; else actHeavyRelease(); }
    if (down(6)) actBlock(true); if (up(6)) actBlock(false);
    if (up(5) && !CTRL.rbUsed && typeof PARTY !== 'undefined' && PARTY && PARTY.members.length > 1 && typeof squadCycle === 'function') squadCycle(1);
    if (down(12)) actInteract(); if (down(13)) useQuickItem(); if (down(14)) cycleQuickItem(-1); if (down(15)) cycleQuickItem(1);
    if (down(11)) camReset(); if (down(10)) camToggleFollow();
    if (down(9)) ctlMenu(); if (down(8)) toggleWin('inv');
  } else if (!$('dialog').hidden && down(0)) { const btn = $('dopts').querySelector('button'); if (btn) btn.click(); }
  const pp = CTRL.padPrev; pp.length = gp.buttons.length; for (let i = 0; i < gp.buttons.length; i++) pp[i] = b(i);
}


/* ---------- Camera (camera round): Q / E turn, Z zoom, C reset, the right stick, auto-follow ----------
   camDrive(dt) runs once per rendered frame from updateCamera (js/gfx-world.js), on the real frame time (CAMX.rdt, set by
   ui.js frame() before a hit-stop slows the clock). The driver keeps its own yaw (CAMX.pos, speed CAMX.v) and adds each
   change to both cam.yaw and cam.yawT, so writes from elsewhere (tests, the mouse drag, scenes) stay as they are; every
   step is the exact solution for the frame's dt (no frame-rate dependence, no jitter on uneven frames).
   - Turning: a held key or the stick eases the turn speed toward CAMSET.speed (v' = k (w - v)); letting go glides to
     a stop (a critically damped spring to where the speed carries it). A tap under CAM.tap s steps 45° instead: the
     same spring, to 45° past the yaw the press started from (quick taps queue up).
   - Auto-follow (action mode, CAMSET.follow): while the hero walks under the player's input, the turn speed eases
     toward a rate that swings the camera behind the movement: CAM.rate (degrees / s by the angle between the walk and
     the camera's forward, scaled by CAMSET.strength): quickest a little off straight ahead, gentle on diagonals and
     strafes, nothing inside the dead zone (CAM.rate[0]) or past CAM.rate[last] (walking toward the camera: never a
     180° flip). Paused CAM.pause s after any manual camera input and off while a target is locked.
   - Input latch (moveInput): keys and stick map through the camera yaw minus what auto-follow turned since the input
     last changed (CAMX.autoAcc), so a held direction keeps its heading in the world while the camera swings behind it.
   - Zoom: Z cycles near / mid / far, the stick's Y and the wheel zoom freely; distance and pitch spring together (the
     pitch eases a little with zoom: lower near, steeper far). C: behind the hero's facing, at the default zoom.
   - Lock-on: CAMX.ox / oy shift the follow point a little toward the locked target (updateCamera adds them), so the
     view frames both. */
const CAM = { tap: 0.18, acc: 5, spring: 9, pause: 2.5, follow: 2.6, zoomW: 8, stick: 1.4,
  rate: [[10, 0], [26, 30], [45, 24], [90, 10], [112, 0]] };
const CAMX = { t: 0, rdt: 0, pos: 0, v: 0, mode: 'idle', target: 0, tapping: false, keys: [], keyAt: {}, tapBase: {}, stickX: 0, stickY: 0,
  manualAt: -1e9, autoAcc: 0, inA: null, auto: 0, ox: 0, oy: 0, otx: 0, oty: 0, zd: null, zv: 0, pd: 0, pv: 0, init: false };
const camWrap = a => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };
const camBase = () => (typeof W !== 'undefined' && W < 700 ? 34 : 40);
const camZoomDist = z => camBase() * (z === 'near' ? 0.65 : z === 'far' ? 1.45 : 1);
const camPitchFor = d => clamp(0.88 + (d / camBase() - 1) * 0.18, 0.78, 1.0);
const camZoomName = d => { let n = 'mid', bd = 1e9; for (const z of CAM_ZOOMS) { const x = Math.abs(Math.log(d / camZoomDist(z))); if (x < bd) { bd = x; n = z; } } return n; };
const camSign = () => CAMSET.invert ? -1 : 1;
// Any hand on the camera: auto-follow waits CAM.pause s.
function camManual(direct) {
  CAMX.manualAt = CAMX.t;
  if (direct) { CAMX.mode = 'idle'; CAMX.v = 0; CAMX.tapping = false; }   // the mouse drag sets the yaw itself
}
// Q (dir 1, look left) / E (dir -1). Pressed: turns while held. Released: a tap steps 45°, a hold glides to a stop.
function camTurnKey(dir, on) {
  const K = CAMX.keys, i = K.indexOf(dir);
  if (on) {
    if (i >= 0) return;
    K.push(dir); CAMX.keyAt[dir] = CAMX.t;
    CAMX.tapBase[dir] = CAMX.tapping && CAMX.mode === 'spring' ? CAMX.target : CAMX.pos;
    camManual(); return;
  }
  if (i < 0) return;
  K.splice(i, 1); camManual();
  if (K.length) return;   // the other key is still held: it keeps turning
  CAMX.mode = 'spring';
  if (CAMX.t - CAMX.keyAt[dir] < CAM.tap) { CAMX.target = CAMX.tapBase[dir] + dir * camSign() * Math.PI / 4; CAMX.tapping = true; }
  else { CAMX.target = CAMX.pos + CAMX.v / CAM.spring; CAMX.tapping = false; }
}
// A step of `step` rad (default 45°) with the tap's glide ([ / ] and classic Q).
function camStep(dir, step) {
  const base = CAMX.tapping && CAMX.mode === 'spring' ? CAMX.target : CAMX.pos;
  CAMX.mode = 'spring'; CAMX.target = base + dir * (step || Math.PI / 4); CAMX.tapping = true; camManual();
}
// C / R3: behind the hero's facing, the default zoom.
function camReset() {
  if (!P || typeof cam === 'undefined') return false;
  const fx = P.fx === undefined ? 0 : P.fx, fy = P.fx === undefined ? -1 : P.fy || 0;
  const d = camWrap(Math.atan2(-fx, -fy) - cam.yawT);
  CAMX.keys.length = 0; CAMX.mode = 'spring'; CAMX.target = CAMX.pos + d; CAMX.tapping = false; camManual();
  camZoomTo(camZoomDist(CAMSET.zoom));
  return true;
}
function camZoomTo(d) {
  if (CAMX.zd === null) { CAMX.zv = 0; CAMX.pv = 0; }
  CAMX.zd = clamp(d, 22, 72); CAMX.pd = camPitchFor(CAMX.zd);
}
const camZoomBy = f => camZoomTo((CAMX.zd !== null ? CAMX.zd : cam.dist) * f);
// Z: near -> mid -> far -> near, from the preset nearest the current distance. Returns the new preset's name.
function camZoomCycle() {
  const n = CAM_ZOOMS[(CAM_ZOOMS.indexOf(camZoomName(CAMX.zd !== null ? CAMX.zd : cam.dist)) + 1) % CAM_ZOOMS.length];
  camZoomTo(camZoomDist(n)); return n;
}
function camToggleFollow() {
  setCamSetting('follow', !CAMSET.follow);
  if (P && typeof floatText === 'function') floatText(P, CAMSET.follow ? 'Auto camera on' : 'Auto camera off', 'info');
  return CAMSET.follow;
}
// The auto-follow turn rate (rad / s, + = toward a larger yaw) for this frame, or 0.
function camAutoRate() {
  if (!CAMSET.follow || !isAction() || !P || P.dead || CTRL.lock) return 0;
  if (CAMX.t - CAMX.manualAt < CAM.pause) return 0;
  if ((typeof CINE !== 'undefined' && (CINE.active || CINE.base !== null)) || (typeof TRAVEL !== 'undefined' && TRAVEL.lock) || !$('dialog').hidden) return 0;
  if (typeof ctrlHero === 'function' && ctrlHero() !== P) return 0;
  if (!(P.moving || (P.jump && P.jump.ph === 'air'))) return 0;
  const v = moveInput(); if (!v) return 0;
  const off = camWrap(Math.atan2(-v[0], -v[1]) - cam.yawT), ad = Math.abs(off) * 180 / Math.PI, R = CAM.rate;
  if (ad <= R[0][0] || ad >= R[R.length - 1][0]) return 0;
  let r = 0;
  for (let i = 1; i < R.length; i++) if (ad <= R[i][0]) { const a = R[i - 1], b = R[i]; r = a[1] + (b[1] - a[1]) * (ad - a[0]) / (b[0] - a[0]); break; }
  return Math.sign(off) * r * (0.3 + 1.4 * CAMSET.strength) * (P.blocking ? 0.4 : 1) * Math.PI / 180;
}
function camDrive(dt) {
  if (CAMX.rdt > 0) { dt = CAMX.rdt; CAMX.rdt = 0; }
  if (!(dt > 0) || typeof cam === 'undefined') return;
  dt = Math.min(dt, 0.1); CAMX.t += dt;
  if (typeof started === 'undefined' || !started || !P) { CAMX.v = 0; CAMX.mode = 'idle'; CAMX.keys.length = 0; return; }
  if (!CAMX.init) { CAMX.init = true; if (CAMSET.zoom !== 'mid') { cam.dist = camZoomDist(CAMSET.zoom); cam.pitch = camPitchFor(cam.dist); } }
  const spd = CAMSET.speed * Math.PI / 180, hold = CAMX.keys.length ? CAMX.keys[CAMX.keys.length - 1] : 0;
  let w = null, k = CAM.acc, auto = false;
  if (hold) w = hold * camSign() * spd;
  if (CAMX.stickX) w = (w || 0) - CAMX.stickX * camSign() * spd * CAM.stick;
  if (w !== null) { CAMX.mode = 'vel'; CAMX.tapping = false; camManual(); }
  else if (CAMX.mode === 'vel') { CAMX.mode = 'spring'; CAMX.target = CAMX.pos + CAMX.v / CAM.spring; }
  const p0 = CAMX.pos;
  if (CAMX.mode === 'spring') {   // critically damped: e(t) = (e0 + (v0 + w e0) t) exp(-w t)
    const Wn = CAM.spring, e0 = CAMX.pos - CAMX.target, v0 = CAMX.v, a = Math.exp(-Wn * dt), c = v0 + Wn * e0;
    const e = (e0 + c * dt) * a; CAMX.v = (v0 - Wn * c * dt) * a; CAMX.pos = CAMX.target + e;
    if (Math.abs(e) < 2e-4 && Math.abs(CAMX.v) < 2e-3) { CAMX.pos = CAMX.target; CAMX.v = 0; CAMX.mode = 'idle'; CAMX.tapping = false; }
  } else {   // v eases toward w: v(t) = w + (v0 - w) exp(-k t)
    if (w === null) { w = camAutoRate(); k = CAM.follow; auto = true; }
    const a = Math.exp(-k * dt), v0 = CAMX.v;
    CAMX.pos += w * dt + (v0 - w) * (1 - a) / k; CAMX.v = w + (v0 - w) * a;
    if (auto && !w && Math.abs(CAMX.v) < 1e-4) CAMX.v = 0;
  }
  CAMX.auto = auto ? CAMX.v : 0;
  const d = CAMX.pos - p0;
  if (d) { cam.yaw += d; cam.yawT += d; if (auto && CAMX.inA !== null) CAMX.autoAcc += d; }
  camZoomTick(dt); camLockTick(dt);
}
function camZoomTick(dt) {
  if (CAMX.stickY) camZoomBy(Math.exp(CAMX.stickY * dt * 1.3));
  if (CAMX.zd === null) return;
  if (typeof CINE !== 'undefined' && (CINE.active || CINE.base !== null)) { CAMX.zd = null; return; }   // a scene owns the distance
  const Wn = CAM.zoomW, a = Math.exp(-Wn * dt);
  let e0 = cam.dist - CAMX.zd, c = CAMX.zv + Wn * e0;
  cam.dist = CAMX.zd + (e0 + c * dt) * a; CAMX.zv = (CAMX.zv - Wn * c * dt) * a;
  e0 = cam.pitch - CAMX.pd; c = CAMX.pv + Wn * e0;
  cam.pitch = CAMX.pd + (e0 + c * dt) * a; CAMX.pv = (CAMX.pv - Wn * c * dt) * a;
  if (Math.abs(cam.dist - CAMX.zd) < 0.01 && Math.abs(CAMX.zv) < 0.02 && Math.abs(cam.pitch - CAMX.pd) < 2e-4 && !CAMX.stickY) { cam.dist = CAMX.zd; cam.pitch = CAMX.pd; CAMX.zd = null; }
}
// Lock-on framing: the follow point leans toward the target (30% of the way, at most 2.2 tiles), the camFollow way.
function camLockTick(dt) {
  let tx = 0, ty = 0; const L = CTRL.lock;
  if (L && !L.dead && isAction() && P && !P.dead && (!L.map || L.map === P.map)) { const dx = L.x - P.x, dy = L.y - P.y, d = hyp(dx, dy); if (d > 0.01 && d < 14) { const s = Math.min(d * 0.3, 2.2) / d; tx = dx * s; ty = dy * s; } }
  if (!tx && !ty && !CAMX.ox && !CAMX.oy) { CAMX.otx = CAMX.oty = 0; return; }
  const Lr = 3, a = Math.exp(-Lr * dt);
  CAMX.ox = typeof camFollow === 'function' ? camFollow(CAMX.ox, CAMX.otx, tx, a, Lr, dt) : CAMX.ox + (tx - CAMX.ox) * (1 - a);
  CAMX.oy = typeof camFollow === 'function' ? camFollow(CAMX.oy, CAMX.oty, ty, a, Lr, dt) : CAMX.oy + (ty - CAMX.oy) * (1 - a);
  CAMX.otx = tx; CAMX.oty = ty;
  if (!tx && !ty && Math.abs(CAMX.ox) + Math.abs(CAMX.oy) < 1e-3) CAMX.ox = CAMX.oy = 0;
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
  const mv = !!moveInput(); if (mv && !CTRL.movePrev) CTRL.moveAt = time; CTRL.movePrev = mv;   // when the stick / keys were last pushed
  if (CTRL.buf) ctlBufTick();
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
  // A skill cast from the keyboard while a direction was already held roots you (pushing a direction afresh, or a
  // dodge, cancels it); one closing in on its target walks there first. Then heroAct (core.js) runs this tick.
  if (v && ((P.casting && P.casting === CTRL.castPd && CTRL.moveAt <= CTRL.castAt) || (P.pending && P.pending.kbAt !== undefined && time - P.pending.kbAt < 1.2))) {
    P.moving = false; return busy || P.blocking;
  }
  if (v && P.casting) cancelCast();
  if (v && !(P.swingT > 0) && P.charge < 0) {
    P.path = null; P.target = null; P.goal = null; P.pending = null; P.sitting = false; P.flags.tips.moved = true;
    const spd = S.move * (P.blocking ? 0.4 : 1) * surfMul(P);
    if (!P.blocking) { P.fx = v[0]; P.fy = v[1]; }
    const x0 = P.x, y0 = P.y; stepMove(v[0] * spd * dt, v[1] * spd * dt); const md = Math.hypot(P.x - x0, P.y - y0);   // stride from real movement (no running on the spot against walls)
    P.moving = md > 1e-4; P.walk += md * 3.4; busy = true;
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
