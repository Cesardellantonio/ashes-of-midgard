'use strict';
/* =========================================================
   Console-style controls (design/controls-contract.md, C1; and the camera round): the action-mode
   keymap and rebinding, the skill slots (U I O P, page 2 with ';' held), the four item slots (1 2 3 4 use them; the pad
   uses the selected one and cycles), the camera keys (Q / E turn, Z zoom, C reset) and the camera settings, plus the
   save hooks for the slots.
   - KEYMAP: the defaults, { id: { code, label, pad[, alt] } }; code null = unbound by default (quick, cycle and autocam
     stay rebindable). keyBinds() is the effective { id: code } (defaults + the per-device overrides in localStorage
     'aom-keys'). keyFor(id) / padFor(id) are the labels the UI shows.
   - Migration: an override always wins. A default key that one of the player's own bindings already uses goes to the
     action's `alt` key when that is free (Q / E camera -> [ / ]), else stays unbound; nothing the player chose is moved.
   - setKey(id, code) rebinds (a key already used by another action swaps over), resetKeys() restores the defaults.
   - P.skillSlots[8] (skill ids | null), P.itemSlots[4] (item ids | null), P.itemSel (the selected slot, for the pad),
     saved with the hero. ctlEnsure(h) creates them (old saves and new heroes: migrated from P.hot). 5-9 still use P.hot.
   - useSkillSlot(i), useItemSlot(i), useQuickItem(), cycleQuickItem(dir), setSkillSlot(i, id), setItemSlot(i, id),
     autoFillSlots(), quickItem(). Every change fires the window event 'controlsChanged'.
   - CAMSET: the camera settings (localStorage 'aom-cam'): follow (auto-follow in action mode), strength 0-1, speed
     (turn, degrees / s), invert (Q / E and the stick), zoom ('near' | 'mid' | 'far', the default). setCamSetting(k, v).
   Input itself (keyboard, gamepad, the input buffer, the camera driver) is in js/action.js, which loads right after.
   ========================================================= */
const KEYMAP = Object.freeze({
  up: { code: 'KeyW', label: 'Move up', pad: 'LS' }, down: { code: 'KeyS', label: 'Move down', pad: 'LS' },
  left: { code: 'KeyA', label: 'Move left', pad: 'LS' }, right: { code: 'KeyD', label: 'Move right', pad: 'LS' },
  jump: { code: 'Space', label: 'Jump', pad: 'A' }, block: { code: 'ShiftLeft', label: 'Block (hold)', pad: 'LT' },
  item1: { code: 'Digit1', label: 'Item slot 1', pad: '' }, item2: { code: 'Digit2', label: 'Item slot 2', pad: '' },
  item3: { code: 'Digit3', label: 'Item slot 3', pad: '' }, item4: { code: 'Digit4', label: 'Item slot 4', pad: '' },
  camLeft: { code: 'KeyQ', label: 'Turn camera left', pad: 'RS ←', alt: 'BracketLeft' }, camRight: { code: 'KeyE', label: 'Turn camera right', pad: 'RS →', alt: 'BracketRight' },
  zoom: { code: 'KeyZ', label: 'Zoom (near / mid / far)', pad: 'RS ↑↓', alt: 'Minus' }, camReset: { code: 'KeyC', label: 'Camera behind you', pad: 'R3', alt: 'Backslash' },
  interact: { code: 'KeyF', label: 'Interact', pad: 'D-pad up' },
  light: { code: 'KeyJ', label: 'Light attack', pad: 'X' }, heavy: { code: 'KeyK', label: 'Heavy attack (hold)', pad: 'Y' },
  dodge: { code: 'KeyL', label: 'Dodge roll', pad: 'B' },
  skill1: { code: 'KeyU', label: 'Skill 1', pad: 'RB+X' }, skill2: { code: 'KeyI', label: 'Skill 2', pad: 'RB+Y' },
  skill3: { code: 'KeyO', label: 'Skill 3', pad: 'RB+B' }, skill4: { code: 'KeyP', label: 'Skill 4', pad: 'RB+A' },
  page2: { code: 'Semicolon', label: 'Skills 5-8 (hold)', pad: 'LB' },
  lock: { code: 'Tab', label: 'Lock / cycle target', pad: 'RT' }, ride: { code: 'KeyR', label: 'Ride', pad: '' },
  menu: { code: 'Escape', label: 'Menu', pad: 'Start' },
  quick: { code: null, label: 'Quick potion', pad: 'D-pad down' }, cycle: { code: null, label: 'Select the next item slot', pad: 'D-pad left/right' },
  autocam: { code: null, label: 'Auto camera on / off', pad: 'L3' },
});
for (const id in KEYMAP) Object.freeze(KEYMAP[id]);
const SKILL_SLOTS = 8, ITEM_SLOTS = 4;
// Keys an action cannot take: modifiers (they never reach the game as plain presses), the squad keys, the 5-9 hotbar.
const KEY_RESERVED = /^(Alt|Meta|Control|OS)(Left|Right)?$|^(F1|F2|F3|F4|Backquote|Enter|NumpadEnter|Digit[5-9]|CapsLock|ContextMenu)$/;
const CTL = { ovr: {}, binds: {}, byCode: {} };

/* ---------- Keymap and rebinding ---------- */
function ctlLoadKeys() {
  let o = null; try { o = JSON.parse(localStorage.getItem('aom-keys') || 'null'); } catch (e) { o = null; }
  CTL.ovr = {};
  if (o && typeof o === 'object') for (const id in o) if (KEYMAP[id] && (o[id] === null || (typeof o[id] === 'string' && !KEY_RESERVED.test(o[id])))) CTL.ovr[id] = o[id];
  ctlRebuild();
}
function ctlSaveKeys() { try { if (Object.keys(CTL.ovr).length) localStorage.setItem('aom-keys', JSON.stringify(CTL.ovr)); else localStorage.removeItem('aom-keys'); } catch (e) { /* private window: this session only */ } }
// The right-hand Shift / Ctrl count as the left one (Shift binds both).
const ctlNorm = code => code === 'ShiftRight' ? 'ShiftLeft' : code === 'ControlRight' ? 'ControlLeft' : code;
function ctlRebuild() {
  CTL.binds = {}; CTL.byCode = {}; CTL.moved = {};
  // The player's own keys first; a default that collides with one of them moves to its alt key (if free) or unbinds.
  const mine = new Set(), used = new Set();
  for (const id in CTL.ovr) if (CTL.ovr[id]) mine.add(CTL.ovr[id]);
  for (const id in KEYMAP) { const c = id in CTL.ovr ? CTL.ovr[id] : KEYMAP[id].code; if (c && (id in CTL.ovr || !mine.has(c))) used.add(c); }
  for (const id in KEYMAP) {
    let c = id in CTL.ovr ? CTL.ovr[id] : KEYMAP[id].code;
    if (c && !(id in CTL.ovr) && mine.has(c)) { const a = KEYMAP[id].alt; c = a && !used.has(a) ? a : null; if (c) used.add(c); CTL.moved[id] = c; }
    CTL.binds[id] = c || null; if (c && !CTL.byCode[c]) CTL.byCode[c] = id;
  }
  if (typeof ctlKeysRebuilt === 'function') ctlKeysRebuilt();   // js/action.js refreshes ACTION_KEYS
}
const keyBinds = () => Object.assign({}, CTL.binds);
const keyCode = id => CTL.binds[id] || null;
// The action a key code triggers in action mode, or null.
const keyAction = code => CTL.byCode[ctlNorm(code)] || null;
function setKey(id, code) {
  if (!KEYMAP[id]) return { ok: false, swapped: null, why: 'unknown action' };
  if (code !== null && (typeof code !== 'string' || !code)) return { ok: false, swapped: null, why: 'no key' };
  if (code) code = ctlNorm(code);
  if (code && (KEY_RESERVED.test(code) || (code === 'Escape' && id !== 'menu'))) return { ok: false, swapped: null, why: codeLabel(code) + ' is reserved' };
  const old = CTL.binds[id];
  if (old === code) return { ok: true, swapped: null };
  let swapped = null;
  if (code) for (const o in CTL.binds) if (o !== id && CTL.binds[o] === code) { swapped = o; break; }
  const put = (a, c) => { if (c === KEYMAP[a].code && !(a in CTL.moved)) delete CTL.ovr[a]; else CTL.ovr[a] = c; };
  put(id, code); if (swapped) put(swapped, old || null);
  ctlRebuild(); ctlSaveKeys(); controlsChanged('keys');
  return { ok: true, swapped };
}
function resetKeys() { CTL.ovr = {}; ctlRebuild(); ctlSaveKeys(); controlsChanged('keys'); }
const CODE_LABEL = { Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', Tab: 'Tab', Escape: 'Esc', Semicolon: ';', Comma: ',', Period: '.', Slash: '/',
  Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Backspace: 'Bksp', Delete: 'Del', Insert: 'Ins', Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn' };
function codeLabel(code) {
  if (!code) return '';
  if (CODE_LABEL[code]) return CODE_LABEL[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad/.test(code)) return 'Num' + code.slice(6);
  return code;
}
// The label of the key bound to an action ('' when unbound). skill5..skill8 read "page 2 + skill key" (;+U).
function keyFor(id) {
  const m = /^skill([5-8])$/.exec(id || '');
  if (m) { const a = keyFor('page2'), b = keyFor('skill' + (m[1] - 4)); return a && b ? a + '+' + b : ''; }
  return codeLabel(CTL.binds[id]);
}
const PAD_EXTRA = { skill5: 'LB+X', skill6: 'LB+Y', skill7: 'LB+B', skill8: 'LB+A', cycle: 'D-pad ←/→', quick: 'D-pad ↓', interact: 'D-pad ↑' };
const padFor = id => PAD_EXTRA[id] || (KEYMAP[id] ? KEYMAP[id].pad : '');
function controlsChanged(kind) {
  if (typeof UI !== 'undefined' && UI) UI.dirty = true;
  try { const e = new Event('controlsChanged'); e.kind = kind || 'slots'; dispatchEvent(e); } catch (err) { console.error(err); }
}

/* ---------- Slots: data, migration ---------- */
const ctlActive = id => { const s = typeof SKILLS !== 'undefined' && SKILLS[id]; return !!s && !s.passive && id !== 'basic'; };
const ctlUse = id => { const t = typeof ITEMS !== 'undefined' && ITEMS[id]; return !!t && t.type === 'use'; };
const ctlPotion = id => { const t = ITEMS[id]; return !!t && t.type === 'use' && !!(t.heal || t.sp || t.effect === 'full'); };
const ctlCount = (h, id) => { let n = 0; for (const it of h.inv || []) if (it && it.id === id) n += it.qty || 1; return n; };
const ctlAvg = r => r ? (r[0] + r[1]) / 2 : 0;
// The best restorative of a kind ('hp' | 'sp') in the bag: HP potions without a buff (the meads are kept for
// fights you choose); with `need`, the smallest that covers it, else the biggest.
function ctlBestPotion(h, kind, need) {
  let best = null, bv = -1, fit = null, fv = 1e9;
  for (const it of h.inv || []) {
    const t = it && ITEMS[it.id]; if (!t || t.type !== 'use') continue;
    const v = kind === 'sp' ? ctlAvg(t.sp) : (t.buff ? 0 : ctlAvg(t.heal)); if (!v) continue;
    if (v > bv) { bv = v; best = it.id; }
    if (need !== undefined && v >= need * 0.8 && v < fv) { fv = v; fit = it.id; }
  }
  return fit || best;
}
const ctlKnown = h => { if (!h._ctlKnown) Object.defineProperty(h, '_ctlKnown', { value: new Set(), writable: true, configurable: true, enumerable: false }); return h._ctlKnown; };
// Makes sure a hero has skill / item slots. Old saves and new heroes get theirs from P.hot: skills in hot slots 1-4
// keep their place (U I O P), the other hot skills fill the next empty slots, potions go to the item ring.
function ctlEnsure(h) {
  h = h || (typeof P !== 'undefined' ? P : null); if (!h) return h;
  const fresh = !Array.isArray(h.skillSlots);
  if (fresh) {
    const ss = new Array(SKILL_SLOTS).fill(null), is = new Array(ITEM_SLOTS).fill(null), hot = Array.isArray(h.hot) ? h.hot : [];
    hot.forEach((r, i) => { if (r && r.k === 'skill' && i < 4 && ctlActive(r.id)) ss[i] = r.id; });
    hot.forEach(r => { if (r && r.k === 'skill' && ctlActive(r.id) && !ss.includes(r.id)) { const j = ss.indexOf(null); if (j >= 0) ss[j] = r.id; } });
    hot.forEach(r => { if (r && r.k === 'item' && ctlPotion(r.id) && !is.includes(r.id)) { const j = is.indexOf(null); if (j >= 0) is[j] = r.id; } });
    h.skillSlots = ss; h.itemSlots = is; h.itemSel = 0;
  } else {
    const ss = h.skillSlots.slice(0, SKILL_SLOTS).map(id => id && SKILLS[id] ? id : null); while (ss.length < SKILL_SLOTS) ss.push(null); h.skillSlots = ss;
    const is = (Array.isArray(h.itemSlots) ? h.itemSlots : []).slice(0, ITEM_SLOTS).map(id => id && ITEMS[id] ? id : null); while (is.length < ITEM_SLOTS) is.push(null); h.itemSlots = is;
  }
  h.itemSel = Math.max(0, Math.min(ITEM_SLOTS - 1, h.itemSel | 0));
  if (!h._ctlKnown) { const k = ctlKnown(h); for (const id in h.skills || {}) if (h.skills[id] > 0) k.add(id); }
  if (fresh) ctlAutoFill(h);
  return h;
}
// A skill learned after the slots were made goes to the first empty skill slot (once; removing it later sticks).
function ctlLearnCheck(h) {
  if (!h || !Array.isArray(h.skillSlots) || !h.skills) return;
  const k = ctlKnown(h); let ch = false;
  for (const id in h.skills) {
    if (!(h.skills[id] > 0) || k.has(id)) continue;
    k.add(id);
    if (ctlActive(id) && !h.skillSlots.includes(id)) { const j = h.skillSlots.indexOf(null); if (j >= 0) { h.skillSlots[j] = id; ch = true; } }
  }
  if (ch) controlsChanged('slots');
}
function ctlAutoFill(h) {
  const is = h.itemSlots, ss = h.skillSlots;
  const hasHp = is.some(id => id && ITEMS[id] && ITEMS[id].heal && !ITEMS[id].buff), hasSp = is.some(id => id && ITEMS[id] && ITEMS[id].sp);
  const put = id => { if (id && !is.includes(id)) { const j = is.indexOf(null); if (j >= 0) is[j] = id; } };
  if (!hasHp) put(ctlBestPotion(h, 'hp') || 'red_potion');
  if (!hasSp) put(ctlBestPotion(h, 'sp'));
  const learned = Object.keys(h.skills || {}).filter(id => h.skills[id] > 0 && ctlActive(id) && !ss.includes(id));
  learned.sort((a, b) => (SKILLS[b].sp ? 1 : 0) - (SKILLS[a].sp ? 1 : 0));   // attacks / spells before free utilities
  for (const id of learned) { const j = ss.indexOf(null); if (j < 0) break; ss[j] = id; }
}
function autoFillSlots() { const h = ctlEnsure(P); if (!h) return false; ctlAutoFill(h); controlsChanged('slots'); return true; }
function setSkillSlot(i, id) {
  const h = ctlEnsure(P); if (!h || !(i >= 0 && i < SKILL_SLOTS)) return false; i |= 0;
  if (id !== null && (!ctlActive(id) || !(h.skills[id] > 0))) return false;
  const j = id ? h.skillSlots.indexOf(id) : -1;
  if (j >= 0 && j !== i) h.skillSlots[j] = h.skillSlots[i];   // already on another slot: the two swap
  h.skillSlots[i] = id; controlsChanged('slots'); return true;
}
function setItemSlot(i, id) {
  const h = ctlEnsure(P); if (!h || !(i >= 0 && i < ITEM_SLOTS)) return false; i |= 0;
  if (id !== null && !ctlUse(id)) return false;
  const j = id ? h.itemSlots.indexOf(id) : -1;
  if (j >= 0 && j !== i) h.itemSlots[j] = h.itemSlots[i];
  h.itemSlots[i] = id; controlsChanged('slots'); return true;
}
// Slot i (0-7; 4-7 are page 2). Action mode goes through the input buffer (js/action.js ctlPress); classic mode
// (a click on the slot) casts the way the hotbar does.
function useSkillSlot(i) {
  const h = ctlEnsure(P); if (!h || !(i >= 0 && i < SKILL_SLOTS)) return false;
  if (typeof isAction === 'function' && isAction() && typeof ctlPress === 'function') return ctlPress('skill', i | 0);
  const id = h.skillSlots[i | 0]; if (!id) return false;
  useSkill(id); return true;
}
const skillPage = () => typeof CTRL !== 'undefined' && CTRL.page2 ? 1 : 0;
// What Q would use now: the selected ring item while you have one, else the best healing potion for the HP you miss.
function quickItem() {
  const h = ctlEnsure(P); if (!h) return null;
  const sel = h.itemSlots[h.itemSel];
  if (sel && ctlCount(h, sel) > 0) return sel;
  const miss = typeof S !== 'undefined' && S && S.maxhp ? S.maxhp - h.hp : undefined;
  return ctlBestPotion(h, 'hp', miss);
}
function useQuickItem() {
  if (!P || P.dead || (typeof started !== 'undefined' && !started)) return false;
  const id = quickItem();
  if (!id) { const sel = P.itemSlots[P.itemSel]; floatText(P, 'No potion', 'miss'); log(sel && ITEMS[sel] ? `You have no ${ITEMS[sel].name} left.` : 'You have no healing potion.', 'warn'); return false; }
  const it = P.inv.find(x => x.id === id); if (!it) return false;
  const n = ctlCount(P, id); useItem(it);
  if (ctlCount(P, id) !== n) controlsChanged('items');
  return true;
}
// Item slot i (0-3), used directly (keys 1-4 in action mode, a click on the slot). An empty slot or an empty stack says so.
function useItemSlot(i) {
  const h = ctlEnsure(P); if (!h || h.dead || !(i >= 0 && i < ITEM_SLOTS) || (typeof started !== 'undefined' && !started)) return false;
  const id = h.itemSlots[i | 0];
  if (!id || !ITEMS[id]) { floatText(h, 'Empty slot', 'miss'); return false; }
  const it = h.inv.find(x => x && x.id === id);
  if (!it) { floatText(h, 'None left', 'miss'); log(`You have no ${ITEMS[id].name} left.`, 'warn'); return false; }
  const n = ctlCount(h, id); useItem(it);
  if (ctlCount(h, id) !== n) controlsChanged('items');
  return true;
}
function cycleQuickItem(dir) {
  const h = ctlEnsure(P); if (!h) return false;
  dir = dir < 0 ? -1 : 1; let i = h.itemSel;
  for (let k = 0; k < ITEM_SLOTS; k++) { i = (i + dir + ITEM_SLOTS) % ITEM_SLOTS; if (h.itemSlots[i] || k === ITEM_SLOTS - 1) break; }
  if (!h.itemSlots.some(Boolean)) i = (h.itemSel + dir + ITEM_SLOTS) % ITEM_SLOTS;
  h.itemSel = i;
  const id = h.itemSlots[i];
  if (typeof floatText === 'function') floatText(h, id && ITEMS[id] ? `${ITEMS[id].name} ×${ctlCount(h, id)}` : 'Empty slot', 'info');
  controlsChanged('sel'); return true;
}

/* ---------- Camera settings (localStorage 'aom-cam', per device) ---------- */
const CAM_DEF = Object.freeze({ follow: true, strength: 0.5, speed: 90, invert: false, zoom: 'mid' });
const CAM_ZOOMS = ['near', 'mid', 'far'];
const CAMSET = Object.assign({}, CAM_DEF);
function camCheck(k, v) {
  switch (k) {
    case 'follow': case 'invert': return typeof v === 'boolean' ? v : undefined;
    case 'strength': return typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(1, v)) : undefined;
    case 'speed': return typeof v === 'number' && isFinite(v) ? Math.max(30, Math.min(240, v)) : undefined;
    case 'zoom': return CAM_ZOOMS.includes(v) ? v : undefined;
  }
  return undefined;
}
function camLoadSettings() {
  let o = null; try { o = JSON.parse(localStorage.getItem('aom-cam') || 'null'); } catch (e) { o = null; }
  Object.assign(CAMSET, CAM_DEF);
  if (o && typeof o === 'object') for (const k in CAM_DEF) { const v = camCheck(k, o[k]); if (v !== undefined) CAMSET[k] = v; }
}
function camSaveSettings() {
  const o = {}; for (const k in CAM_DEF) if (CAMSET[k] !== CAM_DEF[k]) o[k] = CAMSET[k];
  try { if (Object.keys(o).length) localStorage.setItem('aom-cam', JSON.stringify(o)); else localStorage.removeItem('aom-cam'); } catch (e) { /* private window: this session only */ }
}
// quiet: no 'controlsChanged' (a slider being dragged: the window must not re-render under the pointer).
function setCamSetting(k, v, quiet) {
  const c = camCheck(k, v); if (c === undefined) return false;
  CAMSET[k] = c; camSaveSettings(); if (!quiet) controlsChanged('cam'); return true;
}
function resetCamSettings() { Object.assign(CAMSET, CAM_DEF); camSaveSettings(); controlsChanged('cam'); }

/* ---------- Save hooks ----------
   applySave copies every saved key onto the new hero, so a save with slots restores them as they are. SAVE_KEYS
   (js/ui.js) and SQUAD_HERO_KEYS (js/squad.js) learn the three keys so serialize writes them. calcStats (core.js) is
   wrapped so every hero, new or loaded, gets its slots (ctlEnsure) and newly learned skills are placed. */
const CTL_SAVE = ['skillSlots', 'itemSlots', 'itemSel'];
function ctlHookSave() {
  if (typeof SQUAD_HERO_KEYS !== 'undefined' && Array.isArray(SQUAD_HERO_KEYS)) for (const k of CTL_SAVE) if (!SQUAD_HERO_KEYS.includes(k)) SQUAD_HERO_KEYS.push(k);
  if (typeof SAVE_KEYS !== 'undefined' && Array.isArray(SAVE_KEYS)) for (const k of CTL_SAVE) if (!SAVE_KEYS.includes(k)) SAVE_KEYS.push(k);
  if (typeof applySave === 'function' && !applySave._ctl) {
    const a0 = applySave;
    try { applySave = function () { const r = a0.apply(this, arguments); try { ctlEnsure(P); if (typeof PARTY !== 'undefined' && PARTY && PARTY.members) for (const h of PARTY.members) ctlEnsure(h); } catch (e) { console.error(e); } controlsChanged('load'); return r; }; applySave._ctl = true; } catch (e) { /* not writable */ }
  }
}
if (typeof calcStats === 'function' && !calcStats._ctl) {
  const calcStats0 = calcStats;
  try { calcStats = function () { const r = calcStats0.apply(this, arguments); if (typeof P !== 'undefined' && P) { if (!Array.isArray(P.skillSlots)) ctlEnsure(P); else ctlLearnCheck(P); } return r; }; calcStats._ctl = true; } catch (e) { /* not writable */ }
}
ctlHookSave();
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', ctlHookSave);
ctlLoadKeys();
camLoadSettings();
