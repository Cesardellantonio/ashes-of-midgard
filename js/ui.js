'use strict';
/* =========================================================
   Icons
   ========================================================= */
const iconCache = {};
function iconKey(it) { const t = ITEMS[it.id || it]; return t.icon + '|' + (t.color || '') + '|' + (t.wtype || ''); }
function iconImg(it) { const url = iconURL(ITEMS[it.id]); let img = iconCache['img|' + url]; if (!img) { img = new Image(); img.src = url; iconCache['img|' + url] = img; } return img; }
function iconURL(t) {
  const key = t.icon + '|' + (t.color || '');
  if (iconCache[key]) return iconCache[key];
  const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d'); g.lineCap = 'round'; g.lineJoin = 'round';
  const col = t.color || '#aab';
  switch (t.icon) {
    case 'potion': { g.fillStyle = '#d8d0c0'; g.fillRect(27, 10, 10, 8); g.fillStyle = '#6a4a2a'; g.fillRect(26, 6, 12, 6); const gr = g.createRadialGradient(28, 34, 2, 32, 40, 20); gr.addColorStop(0, shade(col, 0.5)); gr.addColorStop(1, shade(col, -0.35)); g.fillStyle = gr; g.beginPath(); g.moveTo(26, 18); g.lineTo(38, 18); g.lineTo(38, 24); g.quadraticCurveTo(52, 30, 50, 44); g.quadraticCurveTo(48, 58, 32, 58); g.quadraticCurveTo(16, 58, 14, 44); g.quadraticCurveTo(12, 30, 26, 24); g.closePath(); g.fill(); g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.ellipse(24, 38, 3, 7, 0.4, 0, 7); g.fill(); break; }
    case 'apple': { g.fillStyle = col; g.beginPath(); g.arc(25, 38, 15, 0, 7); g.arc(39, 38, 15, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,.3)'; g.beginPath(); g.arc(24, 32, 4, 0, 7); g.fill(); g.strokeStyle = '#5a3a1a'; g.lineWidth = 3; g.beginPath(); g.moveTo(32, 26); g.lineTo(34, 14); g.stroke(); g.fillStyle = '#5a7a3a'; g.beginPath(); g.ellipse(40, 16, 7, 3.5, -0.4, 0, 7); g.fill(); break; }
    case 'wing': { g.fillStyle = col; g.beginPath(); g.moveTo(14, 50); g.quadraticCurveTo(10, 20, 44, 8); g.quadraticCurveTo(40, 22, 52, 22); g.quadraticCurveTo(42, 32, 50, 38); g.quadraticCurveTo(34, 42, 14, 50); g.fill(); g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1.5; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(16, 48); g.lineTo(30 + i * 5, 16 + i * 7); g.stroke(); } break; }
    case 'ember': { const gr = g.createRadialGradient(32, 34, 2, 32, 34, 24); gr.addColorStop(0, '#fff4c0'); gr.addColorStop(0.4, '#ffa040'); gr.addColorStop(1, 'rgba(200,60,10,0)'); g.fillStyle = gr; g.beginPath(); g.arc(32, 34, 24, 0, 7); g.fill(); g.fillStyle = '#5a2a10'; g.beginPath(); g.ellipse(32, 44, 12, 7, 0, 0, 7); g.fill(); break; }
    case 'etc': { const gr = g.createRadialGradient(26, 26, 2, 32, 34, 22); gr.addColorStop(0, shade(col, 0.4)); gr.addColorStop(1, shade(col, -0.45)); g.fillStyle = gr; g.beginPath(); g.moveTo(14, 40); g.quadraticCurveTo(14, 16, 34, 14); g.quadraticCurveTo(54, 18, 50, 40); g.quadraticCurveTo(44, 54, 30, 52); g.quadraticCurveTo(16, 50, 14, 40); g.fill(); break; }
    case 'shard': { g.fillStyle = col; g.beginPath(); g.moveTo(32, 4); g.lineTo(46, 26); g.lineTo(36, 60); g.lineTo(20, 34); g.closePath(); g.fill(); g.fillStyle = 'rgba(255,255,255,.4)'; g.beginPath(); g.moveTo(32, 4); g.lineTo(36, 60); g.lineTo(20, 34); g.closePath(); g.fill(); g.font = "22px 'Noto Sans Runic', sans-serif"; g.fillStyle = 'rgba(40,20,10,.7)'; g.textAlign = 'center'; g.fillText('ᛟ', 33, 38); break; }
    case 'plush': { g.fillStyle = col; g.beginPath(); g.moveTo(10, 50); g.quadraticCurveTo(8, 16, 32, 14); g.quadraticCurveTo(56, 16, 54, 50); g.closePath(); g.fill(); g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.ellipse(24, 26, 6, 4, -0.5, 0, 7); g.fill(); g.fillStyle = '#2a1a1a'; g.beginPath(); g.arc(24, 36, 3.5, 0, 7); g.fill(); g.fillStyle = '#e8d8b0'; g.beginPath(); g.arc(40, 36, 4.5, 0, 7); g.fill(); g.strokeStyle = '#6a3a3a'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(37, 33); g.lineTo(43, 39); g.moveTo(43, 33); g.lineTo(37, 39); g.stroke(); g.strokeStyle = '#7a2a3a'; g.lineWidth = 2; g.beginPath(); g.arc(32, 42, 5, 0.3, 2.8); g.stroke(); break; }
    case 'letter': { g.fillStyle = col; g.fillRect(10, 18, 44, 30); g.strokeStyle = '#8a7a5a'; g.lineWidth = 1.5; g.strokeRect(10.5, 18.5, 43, 29); g.beginPath(); g.moveTo(10, 18); g.lineTo(32, 36); g.lineTo(54, 18); g.stroke(); g.fillStyle = '#8a1a1a'; g.beginPath(); g.arc(32, 36, 6, 0, 7); g.fill(); g.strokeStyle = '#f0c0a0'; g.lineWidth = 1.2; g.beginPath(); g.ellipse(32, 36, 3, 1.6, 0, 0, 7); g.stroke(); break; }
    case 'card': { g.fillStyle = '#e8dcc0'; g.fillRect(14, 6, 36, 52); g.strokeStyle = '#8a6a3a'; g.lineWidth = 2; g.strokeRect(15, 7, 34, 50); g.fillStyle = col; g.beginPath(); g.arc(32, 28, 11, 0, 7); g.fill(); g.fillStyle = '#1a1010'; g.fillRect(28, 26, 2, 3); g.fillRect(34, 26, 2, 3); g.fillStyle = '#8a6a3a'; g.fillRect(19, 44, 26, 2); g.fillRect(19, 49, 18, 2); break; }
    case 'dagger': case 'sword': { const L = t.icon === 'sword' ? 1 : 0.65; g.save(); g.translate(32, 32); g.rotate(-Math.PI / 4); g.fillStyle = '#5a3a24'; g.fillRect(-3, 12 * L + 6, 6, 12); g.fillStyle = '#b89a50'; g.fillRect(-10, 10 * L + 4, 20, 4); const gr = g.createLinearGradient(-4, 0, 4, 0); gr.addColorStop(0, '#f0f0f4'); gr.addColorStop(1, '#8a8e98'); g.fillStyle = gr; g.beginPath(); g.moveTo(-4, 10 * L + 4); g.lineTo(4, 10 * L + 4); g.lineTo(3, -26 * L); g.lineTo(0, -30 * L); g.lineTo(-3, -26 * L); g.closePath(); g.fill(); g.restore(); break; }
    case 'rod': { g.strokeStyle = '#6b4a2a'; g.lineWidth = 5; g.beginPath(); g.moveTo(14, 54); g.lineTo(44, 18); g.stroke(); const gr = g.createRadialGradient(46, 16, 1, 46, 16, 10); gr.addColorStop(0, '#fff'); gr.addColorStop(0.4, '#b88aff'); gr.addColorStop(1, 'rgba(120,60,200,0)'); g.fillStyle = gr; g.beginPath(); g.arc(46, 16, 11, 0, 7); g.fill(); break; }
    case 'bow': { g.strokeStyle = '#7a5230'; g.lineWidth = 5; g.beginPath(); g.arc(18, 32, 26, -1.1, 1.1); g.stroke(); g.strokeStyle = '#ddd'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(18 + Math.cos(-1.1) * 26, 32 + Math.sin(-1.1) * 26); g.lineTo(18 + Math.cos(1.1) * 26, 32 + Math.sin(1.1) * 26); g.stroke(); break; }
    case 'mace': { g.strokeStyle = '#5a3a24'; g.lineWidth = 5; g.beginPath(); g.moveTo(16, 52); g.lineTo(38, 24); g.stroke(); g.fillStyle = '#8a8a90'; g.beginPath(); g.arc(42, 20, 10, 0, 7); g.fill(); g.fillStyle = '#c0c0c8'; for (let i = 0; i < 6; i++) { const a = i * 1.05; g.beginPath(); g.moveTo(42 + Math.cos(a) * 9, 20 + Math.sin(a) * 9); g.lineTo(42 + Math.cos(a) * 15, 20 + Math.sin(a) * 15); g.lineTo(42 + Math.cos(a + 0.4) * 9, 20 + Math.sin(a + 0.4) * 9); g.fill(); } break; }
    case 'twohand': { g.save(); g.translate(32, 34); g.rotate(-Math.PI / 4); g.fillStyle = '#4a3020'; g.fillRect(-3, 18, 6, 14); g.fillStyle = '#c8a050'; g.fillRect(-13, 14, 26, 5); const gr = g.createLinearGradient(-6, 0, 6, 0); gr.addColorStop(0, '#f4f4f8'); gr.addColorStop(1, '#7a7e8a'); g.fillStyle = gr; g.beginPath(); g.moveTo(-6, 14); g.lineTo(6, 14); g.lineTo(5, -34); g.lineTo(0, -40); g.lineTo(-5, -34); g.closePath(); g.fill(); g.restore(); break; }
    case 'spear': { g.strokeStyle = '#7a5230'; g.lineWidth = 4; g.beginPath(); g.moveTo(8, 58); g.lineTo(46, 18); g.stroke(); g.fillStyle = '#d8dce6'; g.beginPath(); g.moveTo(44, 16); g.lineTo(58, 4); g.lineTo(50, 22); g.closePath(); g.fill(); g.fillStyle = '#c8a050'; g.fillRect(40, 18, 7, 5); break; }
    case 'staff': { g.strokeStyle = '#5a3a1e'; g.lineWidth = 5; g.beginPath(); g.moveTo(10, 60); g.quadraticCurveTo(30, 36, 42, 14); g.stroke(); g.strokeStyle = '#7a5a2e'; g.lineWidth = 3; g.beginPath(); g.arc(44, 12, 7, 0.5, 5.5); g.stroke(); const gr = g.createRadialGradient(44, 12, 1, 44, 12, 9); gr.addColorStop(0, '#fff'); gr.addColorStop(0.45, '#8ae0a0'); gr.addColorStop(1, 'rgba(60,160,90,0)'); g.fillStyle = gr; g.beginPath(); g.arc(44, 12, 9, 0, 7); g.fill(); break; }
    case 'book': { g.fillStyle = '#5a2a1a'; g.fillRect(14, 12, 36, 44); g.fillStyle = '#efe6cc'; g.fillRect(18, 14, 30, 40); g.fillStyle = '#7a3a24'; g.fillRect(14, 12, 8, 44); g.strokeStyle = '#c8a050'; g.lineWidth = 2; g.strokeRect(15, 13, 34, 42); g.font = "20px 'Noto Sans Runic', sans-serif"; g.fillStyle = '#8a3a1a'; g.textAlign = 'center'; g.fillText('ᛟ', 35, 42); break; }
    case 'lute': { g.save(); g.translate(32, 32); g.rotate(-0.6); g.fillStyle = '#6a4a2a'; g.fillRect(-3, -30, 6, 26); g.fillStyle = '#b8743a'; g.beginPath(); g.ellipse(0, 12, 14, 18, 0, 0, 7); g.fill(); g.fillStyle = '#3a2412'; g.beginPath(); g.arc(0, 8, 4.5, 0, 7); g.fill(); g.strokeStyle = '#eee'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-2, -30); g.lineTo(-2, 24); g.moveTo(2, -30); g.lineTo(2, 24); g.stroke(); g.restore(); break; }
    case 'whip': { g.strokeStyle = '#4a2a18'; g.lineWidth = 5; g.beginPath(); g.moveTo(10, 56); g.lineTo(20, 44); g.stroke(); g.strokeStyle = '#8a5a3a'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(20, 44); g.bezierCurveTo(56, 40, 10, 16, 40, 12); g.quadraticCurveTo(54, 10, 56, 22); g.stroke(); break; }
    case 'knuckle': { g.fillStyle = '#6a6a74'; g.beginPath(); g.moveTo(12, 30); g.quadraticCurveTo(12, 18, 24, 18); g.lineTo(44, 18); g.quadraticCurveTo(54, 18, 54, 30); g.lineTo(54, 48); g.lineTo(12, 48); g.closePath(); g.fill(); g.fillStyle = '#c8ccd6'; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(16 + i * 10, 18); g.lineTo(21 + i * 10, 6); g.lineTo(26 + i * 10, 18); g.fill(); } g.fillStyle = '#3a3a44'; g.fillRect(18, 28, 30, 4); break; }
    case 'body': { g.fillStyle = '#7a6a58'; g.beginPath(); g.moveTo(18, 12); g.lineTo(26, 8); g.lineTo(32, 14); g.lineTo(38, 8); g.lineTo(46, 12); g.lineTo(54, 26); g.lineTo(46, 30); g.lineTo(46, 56); g.lineTo(18, 56); g.lineTo(18, 30); g.lineTo(10, 26); g.closePath(); g.fill(); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(31, 16, 2, 40); break; }
    case 'head': { g.fillStyle = '#8a7a64'; g.beginPath(); g.arc(32, 36, 20, Math.PI, 0); g.fill(); g.fillRect(10, 36, 44, 6); g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(12, 40, 40, 2); break; }
    case 'shield': { const gr = g.createLinearGradient(12, 0, 52, 0); gr.addColorStop(0, '#8a7a60'); gr.addColorStop(1, '#4a3e30'); g.fillStyle = gr; g.beginPath(); g.moveTo(12, 12); g.lineTo(52, 12); g.lineTo(50, 36); g.quadraticCurveTo(44, 52, 32, 58); g.quadraticCurveTo(20, 52, 14, 36); g.closePath(); g.fill(); g.strokeStyle = '#c0a060'; g.lineWidth = 2; g.stroke(); break; }
    case 'boots': { g.fillStyle = '#6a5040'; g.beginPath(); g.moveTo(18, 10); g.lineTo(34, 10); g.lineTo(34, 40); g.lineTo(52, 46); g.lineTo(52, 56); g.lineTo(16, 56); g.closePath(); g.fill(); g.fillStyle = '#3a2a20'; g.fillRect(16, 52, 36, 4); break; }
    case 'acc': { g.strokeStyle = '#d8b050'; g.lineWidth = 5; g.beginPath(); g.arc(32, 36, 14, 0, 7); g.stroke(); g.fillStyle = '#9fd0ff'; g.beginPath(); g.arc(32, 20, 6, 0, 7); g.fill(); break; }
  }
  ICONCV[key] = c;
  return (iconCache[key] = c.toDataURL());
}
const ICONCV = {};
function iconCanvas(t) { iconURL(t); return ICONCV[t.icon + '|' + (t.color || '')]; }
function skillIcon(id) {
  const key = 'sk|' + id; if (iconCache[key]) return iconCache[key];
  const sk = SKILLS[id]; const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d');
  const col = ELCOL[sk.el] || '#aaa';
  const gr = g.createRadialGradient(24, 22, 2, 32, 32, 34); gr.addColorStop(0, shade(col, 0.2)); gr.addColorStop(0.7, shade(col, -0.55)); gr.addColorStop(1, '#0a0806');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = sk.passive ? '#6a5a48' : '#c8a060'; g.lineWidth = 3; g.strokeRect(2, 2, 60, 60);
  g.font = "36px 'Noto Sans Runic', 'Segoe UI Historic', sans-serif"; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(0,0,0,.5)'; g.fillText(sk.rune, 33, 35); g.fillStyle = '#fff4e0'; g.fillText(sk.rune, 32, 33);
  return (iconCache[key] = c.toDataURL());
}
function iconFor(ref) { return ref.k === 'skill' ? skillIcon(ref.id) : iconURL(ITEMS[ref.id]); }

/* =========================================================
   UI: HUD
   ========================================================= */
const UI = { open: {}, dirty: true, z: 10, shopTab: 'supplies', shopMode: 'buy', refineArm: null, socketCard: null, hoverBind: null, jobPick: null };
const cache = {};
function setText(id, v) { if (cache[id] !== v) { cache[id] = v; $(id).textContent = v; } }
// Widths are compared as integers (tenths of a percent), so an unchanged bar costs no string work.
function setW(id, pct) { const v = Math.round(clamp(pct, 0, 100) * 10); if (cache['w' + id] !== v) { cache['w' + id] = v; $(id).style.width = (v / 10) + '%'; } }
// HUD numbers: rebuild a string only when the numbers behind it change (fmt/toLocaleString per frame was 4-9% of CPU).
const HUDA = {}, HUDB = {};
function chg(k, a, b) { if (HUDA[k] === a && HUDB[k] === b) return false; HUDA[k] = a; HUDB[k] = b; return true; }
let HOTEL = [], BUFFEL = [], tipT = -1, tipHTML = null;
function renderHUD() {
  if (chg('name', P.name, P.cls)) { setText('pname', P.name); setText('pclass', CLASSES[P.cls].name); }
  const hp = Math.ceil(P.hp), sp = Math.floor(P.sp), mh = S.maxhp, ms = S.maxsp;
  setW('hpb', P.hp / mh * 100); const low = P.hp / mh < 0.25; if (chg('low', low, 0)) $('hpbar').classList.toggle('low', low);
  if (chg('hp', hp, mh)) setText('hpt', hp + ' / ' + mh);
  const st = Math.floor(P.stamina); setW('stb', P.stamina); if (chg('st', st, 0)) setText('stt', String(st));
  setW('spb', P.sp / ms * 100); if (chg('sp', sp, ms)) setText('spt', sp + ' / ' + ms);
  if (chg('lv', P.lvl, P.jlvl)) { setText('blv', String(P.lvl)); setText('jlv', String(P.jlvl)); }
  setW('bxp', P.lvl >= MAXLV ? 100 : P.exp / expNeed(P.lvl) * 100); setW('jxp', P.jlvl >= CLASSES[P.cls].maxJob ? 100 : P.jexp / jexpNeed(P.jlvl) * 100);
  if (chg('zeny', P.zeny, 0)) setText('zeny', fmt(P.zeny));
  const sc = shardCount(); if (chg('shards', sc, 0)) setText('shardct', sc ? `Shards ${sc}/3` : '');
  if (chg('pips', P.statPts > 0, P.skillPts > 0)) { $('pipS').className = P.statPts > 0 ? 'pip' : ''; $('pipK').className = P.skillPts > 0 ? 'pip' : ''; }
  if (chg('map', map.id, 0)) setText('mapn', map.d.name);
  const cx = Math.floor(P.x), cy = Math.floor(P.y); if (chg('mapc', cx, cy)) setText('mapc', cx + ', ' + cy);
  // Hotbar cooldowns (element refs are cached by renderHotbar)
  for (let i = 0; i < HOTEL.length; i++) {
    const h = HOTEL[i], ref = P.hot[i]; if (!h) continue;
    let pct = 0, nosp = false;
    if (ref && ref.k === 'skill') { const sk = SKILLS[ref.id], lv = P.skills[ref.id]; const c = P.cd[ref.id] || 0; if (c > 0) pct = Math.round(c / (sk.cd || 0.3) * 100); if (lv && (P.sp < sk.sp(lv) || (sk.need && sk.need(lv)))) nosp = true; }
    if (ref && ref.k === 'item') { const n = countItem(ref.id); if (h.n && h.cnt !== n) { h.cnt = n; h.n.textContent = n; } nosp = n === 0; }
    if (h.cd && h.pct !== pct) { h.pct = pct; h.cd.style.height = pct + '%'; }
    if (h.nosp !== nosp) { h.nosp = nosp; h.el.classList.toggle('nosp', nosp); }
  }
  // Boss bar
  if (bossShown) { const k = Math.max(0, bossShown.hp / bossShown.maxhp); bossLag += (k - bossLag) * 0.03; if (bossLag < k) bossLag = k; setW('bossfill', k * 100); setW('bosslag', bossLag * 100); }
  // Tips (rebuilt 4 times a second)
  if (time - tipT > 0.25 || time < tipT) { tipT = time; tipHTML = currentTip(); const te = $('tip'); if (tipHTML) { if (cache.tip !== tipHTML) { cache.tip = tipHTML; te.innerHTML = tipHTML; } te.hidden = false; } else if (!te.hidden) te.hidden = true; }
  renderTracker();
  // Buff timers (or counters, e.g. spirit spheres)
  for (let i = 0; i < BUFFEL.length; i++) { const e = BUFFEL[i], b = P.buffs[e.k]; if (!b) continue; const v = b.count !== undefined ? b.count : Math.ceil(b.t); if (e.v !== v) { e.v = v; e.sp.textContent = v; } }
}
function renderBuffs() {
  const ks = Object.keys(P.buffs);
  $('buffs').innerHTML = ks.map(k => `<div class="buff${P.buffs[k].song ? ' song' : ''}" data-tip="buff:${k}"><img src="${skillIcon(P.buffs[k].icon)}" alt=""><span></span></div>`).join('');
  const els = $('buffs').children; BUFFEL = ks.map((k, i) => ({ k, sp: els[i].querySelector('span'), v: null }));
}
function renderHotbar() {
  $('hotbar').innerHTML = P.hot.map((ref, i) => {
    if (!ref || (ref.k === 'skill' && !P.skills[ref.id])) return `<button class="hs" data-hot="${i}" aria-label="Empty slot ${i + 1}"><span class="k">${i + 1}</span></button>`;
    const n = ref.k === 'item' ? `<span class="n">${countItem(ref.id)}</span>` : '';
    return `<button class="hs" data-hot="${i}" data-tip="${ref.k}:${ref.id}" aria-label="Slot ${i + 1}"><img src="${iconFor(ref)}" alt=""><span class="k">${i + 1}</span>${n}<span class="cd" style="height:0"></span></button>`;
  }).join('');
  const hs = $('hotbar').children; HOTEL = [];
  for (let i = 0; i < 9; i++) { const el = hs[i]; HOTEL.push(el ? { el, cd: el.querySelector('.cd'), n: el.querySelector('.n'), pct: 0, nosp: false, cnt: -1 } : null); }
}
function useHot(i) {
  const ref = P.hot[i]; if (!ref || !started) return;
  if (ref.k === 'skill') useSkill(ref.id);
  else { const it = P.inv.find(x => x.id === ref.id); if (it) useItem(it); else log(`You have no ${ITEMS[ref.id].name} left.`, 'warn'); }
}
function bindHot(i, ref) { for (let j = 0; j < 9; j++) if (P.hot[j] && P.hot[j].k === ref.k && P.hot[j].id === ref.id) P.hot[j] = null; P.hot[i] = ref; log(`Bound ${ref.k === 'skill' ? SKILLS[ref.id].name : ITEMS[ref.id].name} to key ${i + 1}.`, 'sys'); UI.dirty = true; }
const TIPS = [
  { t: () => isAction() ? 'Move with <b>W A S D</b>. <b>J</b> attacks, <b>K</b> heavy, <b>L</b> blocks, <b>Space</b> dodges, <b>F</b> talks. Press <b>H</b> for all controls.' : 'Click the ground to walk. Hold the button to keep walking.', done: () => P.flags.tips.moved },
  { t: () => 'Speak with <b>Sigrun</b>, the Ember Maiden, beside the Waystone. ' + (isAction() ? 'Walk up and press <b>F</b>.' : 'Click her to talk.'), done: () => P.flags.talked.sigrun },
  { t: () => `You have <b>${P.statPts}</b> status points. Press <b>${winKey('status')}</b> to spend them.`, show: () => P.statPts > 0 && P.lvl <= 3, done: () => P.statPts === 0 || UI.open.status },
  { t: () => 'Leave by the <b>east gate</b> for the Ashen Fields. Click a monster to attack it.', show: () => P.map === 'emberhold' && P.lvl < 3, done: () => P.map !== 'emberhold' },
  { t: () => `You have a skill point. Press <b>${winKey('skills')}</b> and click <b>+</b>. Hover a skill and press <b>1–9</b> to bind it.`, show: () => P.skillPts > 0 && P.jlvl <= 4, done: () => P.skillPts === 0 || UI.open.skills },
  { t: () => 'Job Lv 10 and Basic Skill 9: return to Emberhold and speak with <b>Vidar</b> to choose your path.', show: () => P.cls === 'novice' && P.jlvl >= 10 && P.skills.basic >= 9, done: () => P.cls !== 'novice' },
  { t: () => 'Job Lv 10 reached. Spend all 9 points on <b>Basic Skill</b> (press S), then see Vidar.', show: () => P.cls === 'novice' && P.jlvl >= 10 && P.skills.basic < 9, done: () => P.skills.basic >= 9 },
];
function currentTip() { if (!started || P.dead) return null; for (const t of TIPS) { if (t.done()) continue; if (t.show && !t.show()) continue; return t.t(); } return null; }

/* =========================================================
   UI: windows
   ========================================================= */
const WIN = {
  status: { title: 'Status', w: 380, pos: () => [16, 250] },
  inv: { title: 'Items', w: 360, pos: () => [W - 380, 150] },
  equip: { title: 'Equipment', w: 380, pos: () => [W - 400, 150] },
  skills: { title: 'Skills', w: 380, pos: () => [16, 250] },
  journal: { title: 'Journal', w: 460, pos: () => [W / 2 - 230, 70] },
  help: { title: 'How to Play', w: 440, pos: () => [W / 2 - 220, 70] },
  shop: { title: 'Brokkr’s Forge', w: 420, pos: () => [W / 2 - 440, 90] },
  way: { title: 'Waystone', w: 300, pos: () => [W / 2 - 150, H / 2 - 170] },
};
function openWin(id) {
  let el = $('w-' + id);
  if (!el) {
    el = document.createElement('div'); el.className = 'win'; el.id = 'w-' + id; el.style.width = `min(${WIN[id].w}px, calc(100vw - 20px))`;
    el.innerHTML = `<div class="tb"><span>${WIN[id].title}</span><button class="x" data-close="${id}" aria-label="Close">×</button></div><div class="bd"></div>`;
    $('wins').appendChild(el);
    let [x, y] = WIN[id].pos(); x = clamp(x, 10, Math.max(10, W - Math.min(WIN[id].w, W - 20) - 10)); y = clamp(y, 10, Math.max(10, H - 200));
    el.style.left = x + 'px'; el.style.top = y + 'px';
    dragify(el);
  }
  el.hidden = false; UI.open[id] = true; el.style.zIndex = ++UI.z; renderWin(id);
}
function closeWin(id) { const el = $('w-' + id); if (el) el.hidden = true; UI.open[id] = false; if (id === 'inv') UI.socketCard = null; if (id === 'shop') UI.refineArm = null; hideTip(); }
function toggleWin(id) { UI.open[id] ? closeWin(id) : openWin(id); }
function dragify(el) {
  const tb = el.querySelector('.tb');
  tb.addEventListener('pointerdown', e => {
    if (e.target.closest('.x')) return; el.style.zIndex = ++UI.z;
    const sx = e.clientX, sy = e.clientY, ox = el.offsetLeft, oy = el.offsetTop; tb.setPointerCapture(e.pointerId);
    const mv = ev => { el.style.left = clamp(ox + ev.clientX - sx, -el.offsetWidth + 60, W - 60) + 'px'; el.style.top = clamp(oy + ev.clientY - sy, 0, H - 30) + 'px'; };
    const up = () => { tb.removeEventListener('pointermove', mv); tb.removeEventListener('pointerup', up); };
    tb.addEventListener('pointermove', mv); tb.addEventListener('pointerup', up);
  });
  el.addEventListener('pointerdown', () => { el.style.zIndex = ++UI.z; });
}
function renderWin(id) { const el = $('w-' + id); if (!el || el.hidden) return; const bd = el.querySelector('.bd'); const st = bd.scrollTop; bd.innerHTML = RENDER[id](); bd.scrollTop = st; }
function renderAll() { for (const id in UI.open) if (UI.open[id]) renderWin(id); renderHotbar(); renderTracker(true); UI.dirty = false; }

const RENDER = {
  status() {
    const rows = ['str', 'agi', 'vit', 'int', 'dex', 'luk'].map(k => {
      const v = P.st[k], bn = S[k] - v, c = statCost(v), can = P.statPts >= c && v < 99;
      return `<div class="srow"><span class="l">${k.toUpperCase()}</span><span>${v}</span><span class="b">${bn ? '+' + bn : ''}</span><button class="btn plus" data-act="stat:${k}" ${can ? '' : 'disabled'} aria-label="Raise ${k}">+</button><span class="c">${c} pt</span></div>`;
    }).join('');
    const d = (a, b) => `<div class="drow"><span>${a}</span><span>${b}</span></div>`;
    return `<div class="stats"><div>${rows}<div class="drow" style="margin-top:6px"><span>Status points</span><b style="color:${P.statPts ? 'var(--ember)' : 'inherit'}">${P.statPts}</b></div></div>
      <div>${d('ATK', `${S.atkStatus + S.atkBonus} + ${S.watk}`)}${d('MATK', `${S.matkMin} ~ ${S.matkMax}`)}${d('HIT', S.hit)}${d('FLEE', S.flee)}${d('CRIT', S.crit.toFixed(1))}${d('ASPD', S.aspd.toFixed(2) + '/s')}${d('DEF', `${S.def} + ${S.softDef}`)}${d('MDEF', S.mdef)}</div></div>
      <div class="sec">Guidance</div><p class="muted" style="margin:0;line-height:1.45">STR raises melee damage. AGI raises FLEE and attack speed. VIT raises HP and defense. INT raises MATK and SP. DEX raises HIT, bow damage and cuts cast time. LUK raises critical chance. Higher stats cost more points to raise.</p>`;
  },
  inv() {
    let head = '';
    if (UI.socketCard) {
      const card = findItem(UI.socketCard);
      if (!card) UI.socketCard = null;
      else {
        const targets = [...SLOTS.map(s => P.equip[s]).filter(Boolean), ...P.inv.filter(i => ITEMS[i.id].type === 'equip')].filter(i => i.slotsN > (i.cards || []).length);
        head = `<div class="banner-x">Insert <span class="r-card">${esc(ITEMS[card.id].name)}</span> into which item? This cannot be undone.</div><div class="list" style="margin-bottom:10px">${targets.length ? targets.map(i => `<div class="li"><img src="${iconURL(ITEMS[i.id])}" alt=""><span class="r-${i.rarity}">${esc(itemName(i))}</span><button class="btn" data-act="socket:${i.uid}">Insert</button></div>`).join('') : '<div class="muted">No equipment with a free slot. Items with a [1] or [2] after the name have slots.</div>'}</div><button class="btn" data-act="socket-cancel">Cancel</button><div class="sec">Bag</div>`;
      }
    }
    const cells = []; for (let i = 0; i < 48; i++) { const it = P.inv[i]; if (!it) { cells.push('<div class="cell empty"></div>'); continue; } const r = rarityOf(it); cells.push(`<button class="cell r-${r}" data-act="inv:${it.uid}" data-tip="item:${it.uid}" data-bind="item:${it.id}" aria-label="${esc(itemName(it))}"><img src="${iconURL(ITEMS[it.id])}" alt="">${it.qty > 1 ? `<span class="q">${it.qty}</span>` : ''}</button>`); }
    return head + `<div class="grid">${cells.join('')}</div><p class="muted" style="margin:8px 0 0;font-size:11.5px;line-height:1.4">Click to use or equip. Right-click to drop. Hover a potion and press 1–9 to put it on the hotbar.</p>`;
  },
  equip() {
    const slots = SLOTS.map(s => { const it = P.equip[s]; return `<button class="eqs" data-act="uneq:${s}" ${it ? `data-tip="item:${it.uid}"` : ''}>${it ? `<img src="${iconURL(ITEMS[it.id])}" alt="">` : '<img alt="" style="opacity:0">'}<span><span class="sl">${SLOTNAME[s]}</span><span class="nm ${it ? 'r-' + it.rarity : 'muted'}">${it ? esc(itemName(it)) : 'Empty'}</span></span></button>`; }).join('');
    return `<div class="eq">${slots}</div><p class="muted" style="margin:8px 0 0;font-size:11.5px">Click an equipped item to take it off. Weapon type: ${S.wtype === 'fist' ? 'bare hands' : WNAME[S.wtype]}. Range ${S.range.toFixed(1)} cells.</p>`;
  },
  skills() {
    // Current class first, then the classes it grew from (their skills stay learned and can still be raised).
    const chain = classChain(P.cls).reverse(), seen = new Set();
    const row = id => {
      const sk = SKILLS[id], lv = P.skills[id] || 0, can = P.skillPts > 0 && lv < sk.max && id !== 'first_aid';
      const why = !sk.passive && lv && sk.need ? sk.need(lv) : null;
      return `<div class="sk" data-bind="${sk.passive ? '' : 'skill:' + id}" data-tip="skill:${id}"><img src="${skillIcon(id)}" alt="" data-act="${sk.passive || !lv ? '' : 'cast:' + id}" style="${lv ? '' : 'opacity:.55;filter:grayscale(.6)'}"><div><div class="nm">${sk.name} <span class="lv">Lv ${lv}/${sk.max}${sk.passive ? ' · passive' : lv ? ` · ${sk.sp(lv)} SP` : ''}</span></div><div class="ds">${sk.desc(Math.max(1, lv))}${why ? ` <span style="color:#b02a1a">(${esc(why)})</span>` : ''}</div></div><button class="btn plus" data-act="learn:${id}" ${can ? '' : 'disabled'} aria-label="Learn ${sk.name}">+</button></div>`;
    };
    let rows = '';
    for (const c of chain) {
      const ids = CLASSES[c].skills.filter(id => !seen.has(id) && SKILLS[id] && (c === P.cls || P.skills[id] !== undefined)); ids.forEach(id => seen.add(id));
      if (c === 'novice' && P.cls !== 'novice') { if (!seen.has('first_aid')) ids.push('first_aid'); ids.splice(ids.indexOf('basic'), ids.includes('basic') ? 1 : 0); }
      if (!ids.length) continue;
      if (chain.length > 1) rows += `<div class="sec" style="margin-top:${c === chain[0] ? 0 : 10}px">${c === 'novice' ? 'Common' : CLASSES[c].name}${c === P.cls ? '' : ' <span class="muted" style="font-weight:400">· still learnable</span>'}</div>`;
      rows += ids.map(row).join('');
    }
    const nxt = nextClasses(P.cls), cap = CLASSES[P.cls].maxJob;
    const hint = nxt.length && P.cls !== 'novice' ? `<p class="muted" style="margin:8px 0 0;font-size:11.5px">Next path: ${nxt.map(c => CLASSES[c].name).join(' or ')} · Job Lv 40 and Base Lv 30, then speak with Vidar.</p>` : '';
    return `<div class="row" style="justify-content:space-between;margin-bottom:4px"><span class="muted">${CLASSES[P.cls].name} · Job Lv ${P.jlvl}/${cap}</span><span>Skill points <b style="color:${P.skillPts ? 'var(--ember)' : 'inherit'}">${P.skillPts}</b></span></div>${rows}${hint}<p class="muted" style="margin:8px 0 0;font-size:11.5px">Hover a learned skill and press 1–9 to bind it. Click its icon to use it. ${isAction() ? 'With the keyboard, enemy skills take the enemy in front of you (Tab locks one); ground skills land in front of you.' : 'Enemy skills target what is under the cursor, then your current target. Ground skills land at the cursor.'}</p>`;
  },
  journal() {
    const tab = UI.jTab === 'chronicle' ? 'chronicle' : 'quests';
    const tabs = `<div class="tabs"><button class="btn ${tab === 'quests' ? 'on' : ''}" data-act="jtab:quests">Quests</button><button class="btn ${tab === 'chronicle' ? 'on' : ''}" data-act="jtab:chronicle">Chronicle</button></div>`;
    return tabs + (tab === 'quests' ? journalQuests() : journalChronicle());
  },
  help() {
    const k = (a, b) => `<div class="drow" style="height:auto;padding:3px 0"><span>${a}</span><span style="text-align:right">${b}</span></div>`;
    const act = isAction();
    const mode = `<div class="sec">Control style</div><div class="tabs"><button class="btn ${act ? 'on' : ''}" data-act="ctrl:action">Action (keyboard)</button><button class="btn ${act ? '' : 'on'}" data-act="ctrl:classic">Classic (mouse)</button></div>`;
    const keys = act
      ? `${k('Move', 'W A S D or arrow keys')}${k('Attack (3-hit combo)', 'J, tap repeatedly')}${k('Heavy attack', 'Hold K, release (charge for more)')}${k('Block / parry', 'Hold L; block right before a hit to parry')}${k('Dodge roll', 'Space (invulnerable while rolling)')}${k('Talk, use, pick up', 'F')}${k('Lock onto an enemy', 'Tab')}${k('Rotate camera', 'Q / E, or right-drag')}${k('Skills and potions', '1–9')}${k('Windows', 'C Status · I Items · G Equip · V Skills · N Journal · H Help')}${k('Gamepad', 'Stick move · X attack · Y heavy · B dodge · LB/RB block · A talk')}`
      : `${k('Walk', 'Click the ground, or hold to keep walking')}${k('Attack', 'Click a monster; you keep attacking')}${k('Talk, pick up', 'Click an NPC or an item on the ground')}${k('Hotbar', 'Keys 1–9')}${k('Windows', 'A Status · I Items · E Equip · S Skills · J Journal')}${k('Rotate camera', 'Right-drag, Shift-drag, or Q / [ / ]')}`;
    return `${mode}<div class="sec">Controls</div>${keys}${k('Bind a skill or potion', 'Hover it in Skills or Items, press 1–9')}${k('Pick up nearest item', 'Z')}${k('Show all item names', 'Hold Alt')}${k('Sit and recover faster', 'X (needs Basic Skill 3)')}${k('Windows (always)', 'Alt+A Status · Alt+E Items · Alt+Q Equip · Alt+S Skills · Alt+U Journal')}${k('Zoom', 'Mouse wheel')}${k('Tilt camera', 'Ctrl + right-drag')}${k('Sound on or off', 'M')}${k('Close windows', 'Esc')}
      <div class="sec">The Ash</div><p class="lore">Rest at a Waystone to heal, set your return point and save. Resting also brings every slain monster back, except the Shardbearers.</p><p class="lore">When you die you drop all your zeny where you fell. Walk back and touch the red stain to take it back. Die again first and it is gone.</p><p class="lore">Monsters drop gear in four grades: <span class="r-common">common</span>, <span class="r-magic">magic</span>, <span class="r-rare">rare</span> and <span class="r-unique">unique</span>. Rare cards drop too; slot them into gear with free slots. Brokkr can refine gear up to +10. Past +4, a failed refine destroys the item.</p><p class="lore">Watch the ground during boss fights. A red circle means something is about to land there.</p>
      <div class="sec">Save</div><p class="muted" style="margin:0 0 8px">Progress is kept in this browser and saved at every Waystone and map change.</p><button class="btn warn" data-act="${UI.wipeArm ? 'wipe2' : 'wipe'}">${UI.wipeArm ? 'Confirm: erase this character' : 'Erase character and start over'}</button>`;
  },
  shop() {
    const sc = Object.keys(P.flags.shards).length, cap = [10, 20, 30, 99][sc];
    const tabs = `<div class="tabs"><button class="btn ${UI.shopMode === 'buy' ? 'on' : ''}" data-act="mode:buy">Buy</button><button class="btn ${UI.shopMode === 'sell' ? 'on' : ''}" data-act="mode:sell">Sell</button><button class="btn ${UI.shopMode === 'refine' ? 'on' : ''}" data-act="mode:refine">Refine</button><span style="margin-left:auto;align-self:center" class="muted">Zeny <b style="color:var(--gold)">${fmt(P.zeny)}</b></span></div>`;
    if (UI.shopMode === 'buy') {
      const sub = `<div class="tabs"><button class="btn ${UI.shopTab === 'supplies' ? 'on' : ''}" data-act="tab:supplies">Supplies</button><button class="btn ${UI.shopTab === 'weapons' ? 'on' : ''}" data-act="tab:weapons">Weapons</button><button class="btn ${UI.shopTab === 'armor' ? 'on' : ''}" data-act="tab:armor">Armor</button></div>`;
      const pots = ['red_potion', 'orange_potion', 'blue_potion', 'fly_wing', 'butterfly_wing', 'apple'].concat(sc >= 1 ? ['yellow_potion'] : [], sc >= 2 ? ['white_potion'] : []);
      let ids;
      // Second-class gear only shows for second classes, and only up to 5 levels above your own.
      const t2 = CLASSES[P.cls].tier >= 2;
      if (UI.shopTab === 'supplies') ids = pots;
      else ids = Object.values(ITEMS).filter(t => t.type === 'equip' && !t.unique && t.lvl <= cap && (UI.shopTab === 'weapons' ? t.slot === 'weapon' : t.slot !== 'weapon') && (!tier2Item(t) || (t2 && jobOk(t, P.cls) && t.lvl <= P.lvl + 5))).sort((a, b) => (jobOk(b, P.cls) - jobOk(a, P.cls)) || a.lvl - b.lvl).map(t => t.id);
      const rows = ids.map(id => { const t = ITEMS[id]; const ok = t.type !== 'equip' || jobOk(t, P.cls); const stack = t.type === 'use'; return `<div class="li ${ok ? '' : 'off'}" data-tip="shop:${id}"><img src="${iconURL(t)}" alt=""><span>${esc(t.name)}${t.type === 'equip' ? ` <span class="muted">Lv ${t.lvl}</span>` : ''}</span><span class="row"><span class="p">${fmt(t.price)}z</span><button class="btn" data-act="buy:${id}:1" ${P.zeny >= t.price ? '' : 'disabled'}>Buy</button>${stack ? `<button class="btn" data-act="buy:${id}:10" ${P.zeny >= t.price * 10 ? '' : 'disabled'}>×10</button>` : ''}</span></div>`; }).join('');
      const note = sc < 3 ? `<p class="muted" style="font-size:11.5px;margin:8px 0 0">“Bring me proof the Shardbearers can die and I’ll open the good racks.” Stock rises with each Rune-Shard.</p>` : '';
      return tabs + sub + `<div class="list">${rows}</div>` + note;
    }
    if (UI.shopMode === 'sell') {
      const items = P.inv.filter(i => ITEMS[i.id].type !== 'key');
      const matVal = P.inv.filter(i => ITEMS[i.id].type === 'etc').reduce((a, i) => a + Math.floor(ITEMS[i.id].price / 2) * i.qty, 0);
      const rows = items.map(i => { const t = ITEMS[i.id]; const v = sellPrice(i); return `<div class="li" data-tip="item:${i.uid}"><img src="${iconURL(t)}" alt=""><span class="r-${rarityOf(i)}">${esc(itemName(i))}${i.qty > 1 ? ' ×' + i.qty : ''}</span><span class="row"><span class="p">${fmt(v)}z</span><button class="btn" data-act="sell:${i.uid}">Sell</button>${i.qty > 1 ? `<button class="btn" data-act="sellall:${i.uid}">All</button>` : ''}</span></div>`; }).join('');
      return tabs + `<div class="row" style="margin-bottom:8px"><button class="btn" data-act="sellmats" ${matVal ? '' : 'disabled'}>Sell all materials (${fmt(matVal)}z)</button></div><div class="list">${rows || '<div class="muted">Nothing to sell.</div>'}</div>`;
    }
    const eqs = [...SLOTS.map(s => P.equip[s]).filter(Boolean), ...P.inv.filter(i => ITEMS[i.id].type === 'equip')].filter(i => ITEMS[i.id].slot !== 'acc');
    const rows = eqs.map(i => {
      const r = i.refine || 0, cost = refineCost(i), ch = refineChance(i), safe = ch >= 100, armed = UI.refineArm === i.uid;
      const btn = r >= 10 ? '<span class="muted">Max</span>' : `<button class="btn ${safe ? '' : 'warn'}" data-act="refine:${i.uid}" ${P.zeny >= cost ? '' : 'disabled'}>${armed ? `Confirm, ${ch}%` : safe ? 'Refine' : `Refine (${ch}%)`}</button>`;
      return `<div class="li" data-tip="item:${i.uid}"><img src="${iconURL(ITEMS[i.id])}" alt=""><span class="r-${i.rarity}">${esc(itemName(i))}<br><span class="muted" style="font-size:11px">${r >= 10 ? '' : `+${r} → +${r + 1} · ${fmt(cost)}z${safe ? ' · safe' : ' · fails shatter it'}`}</span></span>${btn}</div>`;
    }).join('');
    return tabs + `<p class="muted" style="margin:0 0 8px;line-height:1.4">“Up to +4, nothing breaks. Past that the metal gets proud, and proud metal shatters.”</p><div class="list">${rows || '<div class="muted">No equipment to refine. Accessories cannot be refined.</div>'}</div>`;
  },
  way() {
    const list = Object.keys(MAPDEFS).filter(k => P.kindled[k] && k !== map.id).map(k => `<button class="btn" style="width:100%;text-align:left;margin-top:4px" data-act="travel:${k}">${MAPDEFS[k].name} <span class="muted">· ${MAPDEFS[k].sub}</span></button>`).join('');
    return `<p class="muted" style="margin:0 0 8px;line-height:1.45">The ember inside is warm. Resting heals you and saves your progress, but everything you killed on this map will rise again.</p><button class="btn big" style="width:100%" data-act="rest">Rest</button><div class="sec">Travel to a kindled Waystone</div>${list || '<div class="muted">No other Waystones kindled yet.</div>'}`;
  },
};
function journalQuests() {
  const QA = P.quests.active, kinds = [['main', 'Story'], ['side', 'Side quests'], ['daily', 'Daily bounties']];
  const objRows = id => questObjectives(id).map(o => `<div class="obj ${o.done ? 'done' : o.open ? 'now' : ''}"><span class="m">${o.done ? '✓' : o.open ? '▸' : '·'}</span><span>${esc(o.text)}${o.counted ? ` <b class="qn">${o.cur}/${o.max}</b>` : ''}</span></div>`).join('');
  let h = '';
  for (const [k, label] of kinds) {
    const ids = Object.keys(QA).filter(id => QUESTS[id].kind === k); if (!ids.length) continue;
    h += `<div class="sec">${label}</div>`;
    for (const id of ids) {
      const q = QUESTS[id], ready = questReady(id), tr = P.quests.track === id, ti = questTurnIn(q);
      const arm = UI.abandonArm === id;
      h += `<div class="qcard ${tr ? 'tr' : ''}"><div class="qh"><b>${esc(q.name)}</b><span class="muted">${esc(q.area || '')}</span></div>`;
      if (q.summary) h += `<div class="muted qs">${esc(q.summary)}</div>`;
      h += objRows(id);
      if (ready && ti) h += `<div class="qready">Ready · return to ${esc(questGiverName(ti))}</div>`;
      const rw = questRewardText(q); if (rw) h += `<div class="qr">Reward: ${esc(rw)}</div>`;
      h += `<div class="row" style="margin-top:4px"><button class="btn" data-act="qtrack:${id}">${tr ? 'Tracking' : 'Track'}</button>${q.kind !== 'main' ? `<button class="btn ${arm ? 'warn' : ''}" data-act="qabandon:${id}">${arm ? 'Confirm abandon' : 'Abandon'}</button>` : ''}</div></div>`;
    }
  }
  if (!h) h = '<p class="muted">No quests in progress.</p>';
  // The next path (second classes come from Vidar's trials)
  const nx = nextClasses(P.cls);
  if (CLASSES[P.cls].tier === 1 && nx.length && !Object.keys(QA).some(id => QUESTS[id].trial)) {
    const ok = P.lvl >= 30 && P.jlvl >= 40;
    h = `<div class="qcard"><div class="qh"><b>The next path</b><span class="muted">Emberhold</span></div><div class="muted qs">${nx.map(c => CLASSES[c].name).join(' or ')}. ${ok ? 'You are ready: ask Vidar for a trial.' : `Reach Job Lv 40 (${P.jlvl}/40) and Base Lv 30 (${P.lvl}/30), then ask Vidar for a trial.`}</div></div>` + h;
  }
  // Where to find more work: quests whose requirements are met but not yet taken
  const avail = Object.keys(QUESTS).filter(id => !QUESTS[id].auto && questStatus(id) === 'available');
  if (avail.length) {
    const by = {}; for (const id of avail) { const g = QUESTS[id].giver; (by[g] = by[g] || []).push(id); }
    h += `<div class="sec">Available</div>` + Object.keys(by).map(g => `<div class="obj"><span class="m" style="color:#d08a10">!</span><span><b>${esc(questGiverName(g).replace(/^the /, 'The '))}</b>: ${by[g].map(id => esc(QUESTS[id].name)).join(', ')}</span></div>`).join('');
  }
  const done = Object.keys(P.quests.done).filter(id => QUESTS[id] && QUESTS[id].kind !== 'daily');
  const side = done.filter(id => QUESTS[id].kind === 'side').length, total = Object.keys(QUESTS).filter(id => QUESTS[id].kind === 'side').length;
  h += `<div class="sec">Completed</div><p class="muted" style="margin:0;line-height:1.5">${done.length ? done.map(id => esc(QUESTS[id].name)).join(' · ') : 'Nothing yet.'}</p><p class="muted" style="font-size:11.5px;margin:6px 0 0">Side quests ${side}/${total} · Bounties claimed ${Object.keys(P.quests.done).filter(id => QUESTS[id] && QUESTS[id].kind === 'daily').reduce((a, id) => a + P.quests.done[id].n, 0)}</p>`;
  return h;
}
function journalChronicle() {
  const main = Object.keys(QUESTS).filter(id => QUESTS[id].kind === 'main');
  let nowSet = false;
  const rows = main.map(id => { const st = questStatus(id), d = st === 'done'; let cls = d ? 'done' : ''; if (!d && !nowSet) { cls = 'now'; nowSet = true; } const t = QUESTS[id].obj.map(o => objText(o)).join('; '); return `<div class="obj ${cls}"><span class="m">${d ? '✓' : cls === 'now' ? '▸' : '·'}</span><span>${esc(QUESTS[id].name)} <span class="muted">· ${esc(t)}</span></span></div>`; }).join('');
  const lore = Object.keys(LORE).filter(k => P.flags.lore[k]).map(k => `<p class="lore"><b>${LORE[k][0]}</b>${LORE[k][1]}</p>`).join('');
  const pt = Math.floor(P.playTime / 60);
  const path = classChain(P.cls).map(c => CLASSES[c].name).join(' → ');
  return `<div class="sec">Path</div><p class="muted" style="margin:0 0 4px">${esc(path)}</p>${rows}<div class="sec">Chronicle</div>${lore}<p class="muted" style="font-size:11.5px;margin:6px 0 0">Time in the Ash: ${Math.floor(pt / 60)}h ${pt % 60}m</p>`;
}
const sellPrice = i => { const t = ITEMS[i.id]; if (t.type === 'equip') return Math.floor((t.price || 1500) / 2 * (i.rarity === 'rare' ? 2.5 : i.rarity === 'magic' ? 1.5 : 1) + (i.refine || 0) * 150); return Math.floor(t.price / 2); };
const refineCost = i => Math.round((200 + ITEMS[i.id].lvl * 40) * ((i.refine || 0) + 1));
const refineChance = i => [100, 100, 100, 100, 60, 50, 40, 30, 20, 10][i.refine || 0];

function itemTooltip(it, fromShop) {
  const t = ITEMS[it.id], r = fromShop ? (t.unique ? 'unique' : t.type === 'card' ? 'card' : 'common') : rarityOf(it);
  let h = `<div class="tt-name r-${r}">${esc(fromShop ? t.name : itemName(it))}</div>`;
  if (t.type === 'equip') {
    h += `<div class="tt-sub">${it.name && !fromShop ? t.name + ' · ' : ''}${t.slot === 'weapon' ? WNAME[t.wtype] : SLOTNAME[t.slot]}${r !== 'common' ? ' · ' + r : ''}</div>`;
    if (t.slot === 'weapon') h += `<div class="tt-l">ATK ${t.atk + ((it.refine || 0) * refineAtk(t))}${t.matk ? ` · MATK ${t.matk}` : ''}</div>`;
    else if (t.def || t.mdef) h += `<div class="tt-l">${t.def ? `DEF ${t.def + (it.refine || 0)}` : ''}${t.def && t.mdef ? ' · ' : ''}${t.mdef ? `MDEF ${t.mdef}` : ''}</div>`;
    for (const k in (t.bonus || {})) h += `<div class="${t.unique ? 'tt-u' : 'tt-l'}">${bonusLine(k, t.bonus[k])}</div>`;
    if (!fromShop) { for (const a of it.affixes || []) h += `<div class="tt-b">${bonusLine(a.s, a.v)}</div>`; for (const c of it.cards || []) h += `<div class="tt-c">✦ ${ITEMS[c].name}: ${Object.entries(ITEMS[c].bonus).map(([k, v]) => bonusLine(k, v)).join(', ')}</div>`; }
    const sN = fromShop ? t.slots : it.slotsN; if (sN) h += `<div class="tt-l">Slots ${'◆'.repeat((it.cards || []).length)}${'◇'.repeat(sN - (it.cards || []).length)}</div>`;
    h += `<div class="${P.lvl < t.lvl ? 'tt-bad' : 'muted'}">Requires Lv ${t.lvl}</div>`;
    h += `<div class="${jobOk(t, P.cls) ? 'muted' : 'tt-bad'}">${t.jobs === ALLJ || t.jobs.length === ALLJ.length ? 'All paths' : t.jobs.map(j => CLASSES[j].name).join(', ')}</div>`;
    if (t.lore) h += `<div class="tt-lore">${esc(t.lore)}</div>`;
  } else {
    h += `<div class="tt-sub">${t.quest ? 'Quest item' : { use: 'Consumable', etc: 'Material', card: 'Card', key: 'Rune-Shard' }[t.type]}</div>`;
    if (t.type === 'card') h += `<div class="tt-c">${Object.entries(t.bonus).map(([k, v]) => bonusLine(k, v)).join('<br>')}</div>`;
    if (t.desc) h += `<div class="tt-l" style="margin-top:3px">${esc(t.desc)}</div>`;
  }
  if (!fromShop && t.type !== 'key') h += `<div class="tt-p">Sells for ${fmt(sellPrice(it))}z</div>`;
  return h;
}
// Extra lines for special buffs (the engine fields documented at addBuff in js/core.js).
function buffLines(b) {
  const o = [];
  if (b.endow) o.push(`Attacks are ${b.endow}; ${b.endow} spells +${b.amp}%`);
  if (b.guard) o.push(`${b.guard}% chance to block a blow`);
  if (b.share) o.push(`${b.share}% of damage taken is shared with Tyr`);
  if (b.shield !== undefined && b.hits !== undefined) o.push(`Absorbs ${Math.max(0, Math.round(b.shield))} more damage or ${b.hits} blows`);
  if (b.absorb) o.push(`Drinks spells: ${b.absorb}% returns as SP`);
  if (b.regen) o.push('HP and SP recover twice as often');
  if (b.castCut) o.push(`Cast time −${b.castCut}%`); if (b.cdCut) o.push(`Cooldowns −${b.cdCut}%`);
  if (b.wtype) o.push(`Only with a ${WNAME[b.wtype].toLowerCase()}`);
  return o;
}
const TGTTEXT = { enemy: 'Targets an enemy', self: 'Self', ground: 'Targets the ground (cursor, or in front of you)', heal: 'Self, or an undead enemy', dir: 'Aimed where you face, or at the cursor' };
function skillTooltip(id) {
  const sk = SKILLS[id], lv = P.skills[id] || 0;
  let h = `<div class="tt-name">${sk.name}</div><div class="tt-sub">${sk.passive ? 'Passive' : TGTTEXT[sk.tgt]} · Lv ${lv}/${sk.max}</div>`;
  h += `<div class="tt-l">${sk.desc(Math.max(1, lv))}</div>`;
  if (!sk.passive && lv) { const r = sk.tgt === 'self' ? 0 : skillRange(sk, lv); h += `<div class="muted" style="margin-top:3px">${sk.sp(lv)} SP${sk.cast ? ` · ${castTime(sk, lv).toFixed(1)}s cast` : ''}${r ? ` · range ${+r.toFixed(1)}` : ''}</div>`; }
  if (!sk.passive && lv && sk.need && sk.need(lv)) h += `<div class="tt-bad" style="margin-top:3px">${esc(sk.need(lv))}</div>`;
  if (lv < sk.max && lv > 0) h += `<div class="muted" style="margin-top:3px">Next level: ${sk.desc(lv + 1)}</div>`;
  return h;
}
function showTip(html, x, y) { const el = $('tooltip'); el.innerHTML = html; el.hidden = false; const r = el.getBoundingClientRect(); let tx = x + 16, ty = y + 12; if (tx + r.width > W - 8) tx = x - r.width - 12; if (ty + r.height > H - 8) ty = H - r.height - 8; el.style.left = Math.max(8, tx) + 'px'; el.style.top = Math.max(8, ty) + 'px'; }
function hideTip() { $('tooltip').hidden = true; }
function tipFor(key) {
  const [k, v] = key.split(/:(.+)/);
  if (k === 'item') { const it = findItem(+v); return it ? itemTooltip(it) : null; }
  if (k === 'shop') return itemTooltip({ id: v }, true);
  if (k === 'skill') return skillTooltip(v);
  if (k === 'buff') { const b = P.buffs[v]; return b ? `<div class="tt-name">${b.name}</div><div class="tt-l">${[...Object.entries(b.bonus || {}).map(([a, n]) => bonusLine(a, n)), ...buffLines(b)].join('<br>')}</div><div class="muted">${b.count !== undefined ? `×${b.count}` : Math.ceil(b.t) + 's left'}</div>` : null; }
  return null;
}

function handleAct(act, e) {
  const [a, b, c] = act.split(':'); Sfx.click();
  switch (a) {
    case 'stat': { const v = P.st[b], cost = statCost(v); if (P.statPts >= cost && v < 99) { P.statPts -= cost; P.st[b]++; calcStats(); } break; }
    case 'learn': { const sk = SKILLS[b]; const lv = P.skills[b] || 0; if (P.skillPts > 0 && lv < sk.max) { P.skillPts--; P.skills[b] = lv + 1; if (!lv && !sk.passive && !P.hot.some(h => h && h.k === 'skill' && h.id === b)) { const i = P.hot.findIndex((h, j) => !h && j < 6); if (i >= 0) { P.hot[i] = { k: 'skill', id: b }; log(`${sk.name} placed on key ${i + 1}.`, 'sys'); } } calcStats(); } break; }
    case 'cast': useSkill(b); break;
    case 'inv': { const it = findItem(+b); if (it) useItem(it); break; }
    case 'uneq': unequip(b); break;
    case 'socket': { const card = findItem(UI.socketCard), tgt = findItem(+b); if (card && tgt && tgt.slotsN > tgt.cards.length) { tgt.cards.push(card.id); takeItem(card.id); log(`${ITEMS[card.id].name} fused into ${itemName(tgt)}.`, 'card'); Sfx.rare(); calcStats(); } UI.socketCard = null; break; }
    case 'socket-cancel': UI.socketCard = null; break;
    case 'mode': UI.shopMode = b; UI.refineArm = null; break;
    case 'tab': UI.shopTab = b; break;
    case 'buy': { const t = ITEMS[b], n = +c || 1; if (P.zeny < t.price * n) break; if (t.type === 'equip') { if (!addItem(makeItem(b))) break; } else if (!addItem(makeItem(b, { qty: n }))) break; P.zeny -= t.price * n; log(`Bought ${t.name}${n > 1 ? ' ×' + n : ''}.`, 'loot'); Sfx.coin(); break; }
    case 'sell': case 'sellall': { const it = findItem(+b); if (!it || P.inv.indexOf(it) < 0) break; const n = a === 'sellall' ? it.qty : 1; const v = sellPrice(it) * (it.qty ? n : 1); P.zeny += v; if (it.qty) takeItem(it.id, n); else P.inv.splice(P.inv.indexOf(it), 1); for (let i = 0; i < 9; i++) { const h = P.hot[i]; if (h && h.k === 'item' && h.id === it.id && countItem(it.id) === 0 && ITEMS[it.id].type === 'etc') P.hot[i] = null; } Sfx.coin(); break; }
    case 'sellmats': { let v = 0; P.inv = P.inv.filter(i => { if (ITEMS[i.id].type === 'etc') { v += Math.floor(ITEMS[i.id].price / 2) * i.qty; return false; } return true; }); P.zeny += v; log(`Sold materials for ${fmt(v)} zeny.`, 'loot'); Sfx.coin(); break; }
    case 'refine': { const it = findItem(+b); if (!it) break; const ch = refineChance(it); if (ch < 100 && UI.refineArm !== it.uid) { UI.refineArm = it.uid; break; } UI.refineArm = null; doRefine(it); break; }
    case 'rest': rest(); break;
    case 'jtab': UI.jTab = b; UI.abandonArm = null; break;
    case 'qtrack': P.quests.track = P.quests.track === b ? null : b; break;
    case 'qabandon': if (UI.abandonArm === b) { UI.abandonArm = null; questAbandon(b); } else UI.abandonArm = b; break;
    case 'travel': closeWin('way'); Sfx.warp(); { const m = genMap(b); gotoMap(b, m.way.x, m.way.y + 1.5); } break;
    case 'wipe': UI.wipeArm = true; break;
    case 'ctrl': setCtrlMode(b); break;
    case 'wipe2': store('aom-save', null); location.reload(); break;
  }
  UI.dirty = true;
}
function doRefine(it) {
  const cost = refineCost(it); if (P.zeny < cost || (it.refine || 0) >= 10) return;
  P.zeny -= cost; const ch = refineChance(it);
  if (Math.random() * 100 < ch) { it.refine = (it.refine || 0) + 1; log(`Brokkr’s hammer rings true. ${itemName(it)}.`, 'lvl'); Sfx.level(); burst(12.5, 13.5, 20, '#ffd27a', 20, 2.5); }
  else {
    const name = itemName(it);
    for (const s of SLOTS) if (P.equip[s] === it) P.equip[s] = null;
    const i = P.inv.indexOf(it); if (i >= 0) P.inv.splice(i, 1);
    log(`The metal screams and shatters. ${name} is gone.`, 'bad'); Sfx.slam(); burst(12.5, 13.5, 20, '#888', 26, 3);
  }
  calcStats();
}

/* =========================================================
   Dialog & story
   ========================================================= */
let dlgResolve = null;
function dialog(name, text, opts) {
  return new Promise(res => {
    dlgResolve = res; $('dialog').hidden = false; $('dname').textContent = name; $('dtext').innerHTML = `<span class="nm">[${esc(name)}]</span>` + text;
    $('dopts').className = opts.length > 2 ? 'menu-list' : '';
    $('dopts').innerHTML = opts.map((o, i) => `<button class="btn" data-dlg="${i}">${esc(o)}</button>`).join('');
    const b = $('dopts').querySelector('button'); if (b) b.focus({ preventScroll: true });
  });
}
function closeDialog() { $('dialog').hidden = true; if (dlgResolve) { const r = dlgResolve; dlgResolve = null; r(-1); } }
async function say(name, pages) { for (let i = 0; i < pages.length; i++) { const r = await dialog(name, pages[i], [i < pages.length - 1 ? 'Next' : 'Close']); if (r < 0) break; } $('dialog').hidden = true; }
// NPC definitions, dialog scripts (talkSigrun, talkVidar...) and LORE live in js/data/npcs.js.
let talkNPC = null; // NPC whose dialog is open (sprite sheets play "talk")
async function talkTo(n) {
  talkNPC = n;
  try {
    const def = NPCS[n.id] || {};
    if (!(def.urgent && def.urgent())) {
      questEvent('talk', n.id);
      if (await questTalk(n, def)) return;
    }
    if (def.talk) await def.talk(n);
    questEvent('talk', n.id); questRefresh();
  } finally { if (talkNPC === n) talkNPC = null; }
}
function ending(kind) {
  P.flags.ending = kind; saveGame();
  const el = $('ending'); el.hidden = false;
  const A = { embers: ['The Age of Embers', 'You lay your hand on the dead Heart of Yggdrasil and give it the only thing you have left: the ember that would not go out, the reason the Tree refused you. The Tree drinks it.', 'Nothing grows at first. Then, far below, one root turns green. Then another. The Ash will take a thousand years to settle. The Tree has a thousand years now.', 'In Emberhold, Sigrun lights a new Waystone at the foot of the gate. She carves your name on it, and she tends it every morning.'],
    ash: ['The Age of Ash', 'You lift the Crown of Cinders out of the ash. It is warm, and it fits.', 'The Heart goes quiet under your hand. The fire does not end, but it no longer spreads without asking. Midgard will not grow again. It will obey.', 'In Emberhold, Sigrun lets the Waystone go out. She does not say anything. She does not have to.'] }[kind];
  el.innerHTML = `<div class="e-in"><h2>${A[0]}</h2>${A.slice(1).map(p => `<p>${p}</p>`).join('')}<p class="muted" style="font-size:13px;margin-top:22px">${esc(P.name)} · ${CLASSES[P.cls].name} · Base Lv ${P.lvl} · ${Math.floor(P.playTime / 60)} minutes in the Ash</p><button class="btn big" id="bEnd" style="margin-top:12px">Continue wandering</button></div>`;
  if (kind === 'ash' && !P.inv.some(i => i.id === 'u_crown') && !(P.equip.head && P.equip.head.id === 'u_crown')) addItem(makeItem('u_crown'), true);
  $('bEnd').onclick = () => { el.hidden = true; log(kind === 'embers' ? 'The Tree breathes. The Ash is still out there, and so are you.' : 'The crown sits warm on your brow. The Ash is yours now.', 'lvl'); };
  Sfx.victory();
}

/* =========================================================
   UI: quests (tracker, toasts, NPC markers)
   ========================================================= */
const QUEST_UI = { markers: true, boards: true }; // the renderer may set these false once it draws them itself
(function questStyles() {
  const st = document.createElement('style');
  st.textContent = `
#qtrack{position:absolute;right:calc(8px + env(safe-area-inset-right,0px));top:calc(220px + env(safe-area-inset-top,0px));width:210px;font-size:11.5px;cursor:pointer}
#qtrack .rbd{padding:4px 8px 6px}
#qtrack .qt{font-weight:800;color:#2c3858;margin-bottom:2px}
#qtrack .o{display:grid;grid-template-columns:12px 1fr auto;gap:4px;line-height:1.35;color:var(--ink)}
#qtrack .o.done{color:var(--faint)}#qtrack .o.done .m{color:var(--good)}#qtrack .o .m{color:#e06a1a;font-weight:800}#qtrack .o.lock{opacity:.55}
#qtrack .o b{font-variant-numeric:tabular-nums}
#qtrack .rd{color:#1e7a2a;font-weight:800;margin-top:2px}
#qtoast{position:absolute;left:50%;top:calc(60px + env(safe-area-inset-top,0px));transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:none;z-index:31}
#qtoast div{font:800 12.5px var(--ui);color:#fff;padding:4px 14px;border-radius:12px;background:rgba(16,20,34,.72);border:1px solid rgba(255,220,150,.35);text-shadow:0 1px 2px #000;animation:qtoast 2.6s ease forwards;white-space:nowrap}
#qtoast div.obj{color:#c8f0a8}#qtoast div.new{color:#ffe08a}#qtoast div.ready{color:#9ae0ff}
@keyframes qtoast{0%{opacity:0;transform:translateY(-6px)}10%{opacity:1;transform:none}80%{opacity:1}100%{opacity:0}}
#chat .quest{color:#ffd890}
.qcard{background:#fff;border:1px solid #c4cde0;border-radius:3px;padding:5px 7px;margin-bottom:5px}
.qcard.tr{border-color:#e0a040;box-shadow:0 0 0 1px #f0c070}
.qcard .qh{display:flex;justify-content:space-between;gap:8px;align-items:baseline}
.qcard .qs{font-size:11.5px;margin:1px 0 3px;line-height:1.35}
.qcard .qn{font-variant-numeric:tabular-nums}
.qcard .qr{font-size:11px;color:var(--gold);margin-top:3px}
.qcard .qready{color:#1e7a2a;font-weight:800;margin-top:2px}
@media (max-width:760px){#qtrack{top:calc(160px + env(safe-area-inset-top,0px));width:160px;font-size:10.5px}}`;
  document.head.appendChild(st);
  const tr = document.createElement('div'); tr.id = 'qtrack'; tr.className = 'rwin'; tr.hidden = true; tr.dataset.win = 'journal'; tr.title = 'Open the quest log';
  $('hud').appendChild(tr);
  const to = document.createElement('div'); to.id = 'qtoast'; $('game').appendChild(to);
})();
function questToast(msg, kind) {
  const c = $('qtoast'); if (!c) return; const d = document.createElement('div'); d.className = kind || ''; d.textContent = msg; c.appendChild(d);
  while (c.children.length > 4) c.removeChild(c.firstChild);
  setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d); }, 2700);
}
let trackT = 0;
function renderTracker(force) {
  if (!force && time - trackT < 0.2) return; trackT = time;
  const el = $('qtrack'), id = P.quests && P.quests.track;
  if (!id || !P.quests.active[id]) { el.hidden = true; return; }
  const q = QUESTS[id], ready = questReady(id), ti = questTurnIn(q);
  const rows = questObjectives(id).map(o => `<div class="o ${o.done ? 'done' : o.open ? '' : 'lock'}"><span class="m">${o.done ? '✓' : '▸'}</span><span>${esc(o.text)}</span><b>${o.counted ? `${o.cur}/${o.max}` : ''}</b></div>`).join('');
  const html = `<div class="rtb">Quest</div><div class="rbd"><div class="qt">${esc(q.name)}</div>${rows}${ready && ti ? `<div class="rd">Return to ${esc(questGiverName(ti))}</div>` : ''}</div>`;
  if (cache.qtrack !== html) { cache.qtrack = html; el.innerHTML = html; }
  el.hidden = false;
}
// Bounty boards have no mesh yet: draw a small notice board in the overlay (QUEST_UI.boards = false to disable).
function drawBoardProp(o, sc) {
  const gh = groundH(o.x, o.y), b = proj(o.x, o.y, gh), t = proj(o.x, o.y, gh + 1.7); if (b[2] > 1) return;
  const hgt = b[1] - t[1], wd = hgt * 0.75, x = b[0], top = t[1];
  if (!(hgt > 2) || t[2] > 1) return; // top behind the camera or projected upside down
  ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(x, b[1], Math.max(0, wd * 0.55), Math.max(0, wd * 0.16), 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#4a3220'; ctx.fillRect(x - wd * 0.42, top + hgt * 0.1, wd * 0.09, hgt * 0.9); ctx.fillRect(x + wd * 0.33, top + hgt * 0.1, wd * 0.09, hgt * 0.9);
  ctx.fillStyle = '#7a5434'; ctx.fillRect(x - wd * 0.5, top, wd, hgt * 0.56); ctx.strokeStyle = '#3a2414'; ctx.lineWidth = Math.max(1, 1.5 * sc); ctx.strokeRect(x - wd * 0.5, top, wd, hgt * 0.56);
  ctx.fillStyle = '#5a3a22'; ctx.fillRect(x - wd * 0.58, top - hgt * 0.06, wd * 1.16, hgt * 0.08);
  const notes = [[-0.36, 0.08, '#efe6cc'], [-0.02, 0.12, '#e8dcc0'], [0.18, 0.05, '#f4ecd8'], [-0.22, 0.3, '#e4d4b0']];
  for (const [nx, ny, c] of notes) { ctx.fillStyle = c; ctx.fillRect(x + wd * nx, top + hgt * ny, wd * 0.22, hgt * 0.2); ctx.fillStyle = '#8a1a1a'; ctx.fillRect(x + wd * (nx + 0.1), top + hgt * ny + 1, 2 * sc, 2 * sc); }
}
function drawQuestMarker(x, y, mark, kind, sc) {
  const s = Math.max(1, 17 * sc), bob = Math.sin(time * 3.2) * 3 * sc;
  const col = kind === 'daily' ? ['#bfe6ff', '#3a8ae0'] : kind === 'main' ? ['#fff4b0', '#f0a020'] : ['#fff0a0', '#e8b020'];
  y += bob;
  ctx.font = `900 ${Math.round(s * 1.5)}px ${typeof UIFONT !== 'undefined' ? UIFONT : 'sans-serif'}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const g = ctx.createRadialGradient(x, y, 0, x, y, s * 1.2); g.addColorStop(0, rgba(col[1], 0.45)); g.addColorStop(1, rgba(col[1], 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, s * 1.2, 0, 7); ctx.fill();
  ctx.lineJoin = 'round'; ctx.lineWidth = 5 * sc; ctx.strokeStyle = '#1a1008'; ctx.strokeText(mark, x, y);
  const gr = ctx.createLinearGradient(0, y - s * 0.6, 0, y + s * 0.6); gr.addColorStop(0, col[0]); gr.addColorStop(1, col[1]); ctx.fillStyle = gr; ctx.fillText(mark, x, y);
  ctx.textBaseline = 'alphabetic';
}
function drawQuestOverlay() {
  if (!started || !map || !P || typeof proj !== 'function' || typeof PPU === 'undefined') return;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const sc = clamp(PPU / 34, 0.75, 1.5), boards = map.objs.filter(o => o.kind === 'board');
  if (QUEST_UI.boards) for (const o of boards) {
    drawBoardProp(o, sc);
    if (typeof label === 'function') { const a = proj(o.x, o.y, groundH(o.x, o.y)); if (a[2] < 1) label(o.name, a[0], a[1] + 17 * sc, '#ffd8a8', 11.5); }
  }
  if (!QUEST_UI.markers) return;
  for (const e of [...map.npcs, ...boards]) {
    if (!(e._qmT > time - 0.25) || e._qmT > time) { e._qm = questMarkerInfo(e); e._qmT = time; } // re-evaluated 4x per second
    const info = e._qm; if (!info) continue;
    const hh = e.board ? 1.95 : headH(e) + 0.45, a = proj(e.x, e.y, groundH(e.x, e.y) + hh); if (a[2] > 1) continue;
    drawQuestMarker(a[0], a[1] - 10 * sc, info.mark, info.kind, sc);
  }
}
/* Second-class skill feedback drawn on the 2D overlay: ground zones and traps, song/oath auras, the Kyrie
   bubble, spirit spheres, and status marks on monsters. Deliberately simple shapes; the graphics team can
   replace any of it with meshes (data: zones[], P.buffs[*].aura, P.spheres, m.snare/slow/mark/dispel/lex). */
function groundLoop(x, y, r, n) { const pts = []; for (let i = 0; i < n; i++) { const a = i / n * 6.2832, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; pts.push(proj(px, py, groundH(px, py) + 0.06)); } return pts; }
function strokeLoop(pts, fill, stroke, lw, dash) {
  if (pts.some(p => p[2] > 1)) return false;
  ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.setLineDash(dash || []); ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); ctx.setLineDash([]); }
  return true;
}
function runeAt(x, y, h, txt, col, px) { const a = proj(x, y, groundH(x, y) + h); if (a[2] > 1) return; ctx.font = `${px}px 'Noto Sans Runic', 'Segoe UI Historic', sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,6,4,.7)'; ctx.strokeText(txt, a[0], a[1]); ctx.fillStyle = col; ctx.fillText(txt, a[0], a[1]); ctx.textBaseline = 'alphabetic'; }
function drawSkillOverlay() {
  if (!started || !map || !P || typeof proj !== 'function' || typeof PPU === 'undefined') return;
  const sc = clamp(PPU / 34, 0.75, 1.5);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  for (const z of zones) {
    const life = z.trap ? 1 : Math.min(1, z.t / 0.2, (z.dur - z.t) / 0.3), pulse = 0.5 + 0.5 * Math.sin(time * 5 + z.x);
    if (z.trap) {
      const pts = groundLoop(z.x, z.y, 0.45, 10); strokeLoop(pts, rgba(z.col, 0.28), rgba(z.col, 0.9), 1.6 * sc, [3, 3]);
      runeAt(z.x, z.y, 0.1, z.rune || '•', z.col, 13 * sc); continue;
    }
    const r = z.r * (z.kind === 'storm' ? 1 : 0.97 + 0.03 * pulse);
    strokeLoop(groundLoop(z.x, z.y, r, 28), rgba(z.col, (z.ward ? 0.1 : 0.16) * life), rgba(z.col, 0.75 * life), (z.ward ? 1.6 : 2.2) * sc, z.ward ? [8, 6] : null);
    if (z.kind === 'storm' || z.kind === 'quagmire') { const rot = time * (z.kind === 'storm' ? 2.4 : 0.4); for (let k = 1; k <= 2; k++) { const rr = r * k / 3; const pts = []; for (let i = 0; i < 14; i++) { const a = rot * (k % 2 ? 1 : -1) + i / 14 * 6.2832, px = z.x + Math.cos(a) * rr, py = z.y + Math.sin(a) * rr; pts.push(proj(px, py, groundH(px, py) + 0.08)); } strokeLoop(pts, null, rgba(z.col, 0.45 * life), 1.2 * sc, [6, 8]); } }
    if (z.rune) runeAt(z.x, z.y, 0.15, z.rune, z.col, 22 * sc);
  }
  // Auras (songs, Oath of Tyr, Magic Rod) and the Kyrie bubble
  for (const k in P.buffs) {
    const au = P.buffs[k].aura; if (!au) continue;
    if (au.bubble) { const a = proj(P.x, P.y, chestH(P)), rr = au.r * PPU; if (a[2] > 1) continue; const g = ctx.createRadialGradient(a[0], a[1], rr * 0.6, a[0], a[1], rr); g.addColorStop(0, rgba(au.col, 0)); g.addColorStop(0.85, rgba(au.col, 0.22)); g.addColorStop(1, rgba(au.col, 0.55)); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(a[0], a[1], rr, rr * 1.15, 0, 0, 7); ctx.fill(); continue; }
    const rr = au.r * (0.94 + 0.06 * Math.sin(time * 4)); strokeLoop(groundLoop(P.x, P.y, rr, 24), rgba(au.col, 0.1), rgba(au.col, 0.7), 1.8 * sc, P.buffs[k].song ? [4, 5] : null);
    if (P.buffs[k].song && Math.random() < 0.08) parts.push({ x: P.x + rand(-rr, rr), y: P.y + rand(-rr, rr), z: 4, vx: 0, vy: 0, vz: 35, life: 1.1, max: 1.1, col: au.col, size: 3, float: true });
  }
  // Spirit spheres orbit the monk
  if (P.spheres > 0 && !P.dead) {
    const gh = groundH(P.x, P.y), hh = typeof headH === 'function' ? headH(P) * 0.75 : 1.2;
    for (let i = 0; i < P.spheres; i++) {
      const a = time * 2.2 + i / P.spheres * 6.2832, q = proj(P.x + Math.cos(a) * 0.62, P.y + Math.sin(a) * 0.62, gh + hh + Math.sin(time * 3 + i) * 0.08); if (q[2] > 1) continue;
      const rr = 5.5 * sc, g = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], rr * 2); g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, '#9fd0ff'); g.addColorStop(1, 'rgba(90,150,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q[0], q[1], rr * 2, 0, 7); ctx.fill();
    }
  }
  // Monster status marks
  for (const m of mobs) {
    if (m.dead) continue;
    if (m.snare > 0) strokeLoop(groundLoop(m.x, m.y, 0.55, 12), null, 'rgba(210,170,100,.9)', 2 * sc, [4, 3]);
    if (m.slow > 0) strokeLoop(groundLoop(m.x, m.y, 0.6, 12), 'rgba(110,80,40,.35)', null, 0);
    const tags = (m.mark > 0 ? 'ᛞ' : '') + (m.dispel > 0 ? 'ᚾ' : '') + (m.lex ? 'ᛚ' : '');
    if (tags) runeAt(m.x, m.y, (typeof headH === 'function' ? headH(m) : 1.6) + 0.55, tags, m.lex ? '#fff2b8' : m.mark > 0 ? '#cfe07a' : '#c8a8ff', 15 * sc);
  }
}
// Draw the quest overlay right after the world overlay each frame (same pattern as gfx-sheets' headH wrap).
if (typeof render === 'function') {
  const baseRender = render;
  // eslint-disable-next-line no-global-assign
  render = function (dt) { baseRender(dt); try { drawSkillOverlay(); } catch (e) { console.error(e); } try { drawQuestOverlay(); } catch (e) { console.error(e); } };
}

/* =========================================================
   Input
   ========================================================= */
cv.addEventListener('pointerdown', e => {
  Sfx.unlock(); mouse.x = e.clientX; mouse.y = e.clientY;
  if (e.button === 2 || (e.button === 0 && e.shiftKey)) { mouse.rot = { x: e.clientX, y: e.clientY, yaw: cam.yawT, pitch: cam.pitch }; cv.setPointerCapture(e.pointerId); return; }
  if (!started || P.dead) return;
  if (e.button !== 0) return;
  mouse.down = true; mouse.hold = false; P.flags.tips.moved = true;
  const h = pickAt(e.clientX, e.clientY);
  if (P.casting) { if (h && h.kind === 'mob') return; cancelCast(); }
  P.sitting = false; P.pending = null;
  if (h && h.kind === 'mob') { P.target = h; P.goal = null; P.path = null; aggroHover = h; return; }
  P.target = null;
  if (h && (h.kind === 'drop')) { P.goal = { kind: 'drop', ref: h }; P.path = null; goNear(P, h.x, h.y); return; }
  if (h && map.npcs.includes(h)) { P.goal = { kind: 'npc', ref: h }; P.path = null; return; }
  if (h && map.objs.includes(h)) { P.goal = { kind: 'obj', ref: h }; P.path = null; return; }
  P.goal = null;
  const w = s2w(e.clientX, e.clientY);
  if (moveTo(w[0], w[1])) fxs.push({ k: 'mark', x: w[0], y: w[1], t: 0, dur: 0.5 });
  mouse.hold = true; mouse.holdT = 0.25;
});
let aggroHover = null;
addEventListener('pointermove', e => { mouse.x = e.clientX; mouse.y = e.clientY; if (mouse.rot) { cam.yawT = mouse.rot.yaw - (e.clientX - mouse.rot.x) * 0.008; cam.yaw = cam.yawT; if (e.ctrlKey || e.altKey) cam.pitch = clamp(mouse.rot.pitch + (e.clientY - mouse.rot.y) * 0.004, 0.6, 1.25); } });
addEventListener('pointerup', () => { mouse.down = false; mouse.hold = false; mouse.rot = null; });
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('wheel', e => { e.preventDefault(); cam.dist = clamp(cam.dist * (e.deltaY > 0 ? 1.1 : 0.9), 22, 72); }, { passive: false });

const game = $('game');
$('bRespawn').onclick = () => { Sfx.click(); respawn(); };
function showDeath() { $('deathz').textContent = P.lostZeny && P.lostZeny.map === map.id ? `Your ${fmt(P.lostZeny.zeny)} zeny lies where you fell.` : ''; $('death').hidden = false; }
game.addEventListener('click', e => {
  const w = e.target.closest('[data-win]'); if (w) { Sfx.unlock(); toggleWin(w.dataset.win); return; }
  const x = e.target.closest('[data-close]'); if (x) { closeWin(x.dataset.close); return; }
  const d = e.target.closest('[data-dlg]'); if (d) { const r = dlgResolve; dlgResolve = null; if (r) r(+d.dataset.dlg); return; }
  const h = e.target.closest('[data-hot]'); if (h) { useHot(+h.dataset.hot); return; }
  const a = e.target.closest('[data-act]'); if (a && a.dataset.act) { handleAct(a.dataset.act, e); return; }
});
game.addEventListener('contextmenu', e => {
  const h = e.target.closest('[data-hot]'); if (h) { e.preventDefault(); P.hot[+h.dataset.hot] = null; UI.dirty = true; return; }
  const c = e.target.closest('.cell[data-act]'); if (c) { e.preventDefault(); const it = findItem(+c.dataset.act.split(':')[1]); if (it && P.inv.includes(it) && ITEMS[it.id].type !== 'key') { P.inv.splice(P.inv.indexOf(it), 1); drops.push({ kind: 'drop', item: it, x: P.x + rand(-0.4, 0.4), y: P.y + rand(-0.4, 0.4), t: 0, id: uidc++ }); log(`You drop ${itemName(it)}.`, 'sys'); UI.dirty = true; } return; }
  if (e.target.closest('.win')) e.preventDefault();
});
game.addEventListener('pointerover', e => {
  const t = e.target.closest('[data-tip]'); if (t) { const html = tipFor(t.dataset.tip); if (html) showTip(html, e.clientX, e.clientY); }
  const b = e.target.closest('[data-bind]'); UI.hoverBind = b && b.dataset.bind ? b.dataset.bind : null;
});
game.addEventListener('pointerout', e => { const t = e.target.closest('[data-tip]'); if (t && !t.contains(e.relatedTarget)) hideTip(); const b = e.target.closest('[data-bind]'); if (b && !b.contains(e.relatedTarget)) UI.hoverBind = null; });
game.addEventListener('pointermove', e => { const el = $('tooltip'); if (!el.hidden && e.target.closest('[data-tip]')) showTip(el.innerHTML, e.clientX, e.clientY); });

addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') { if (e.key === 'Enter' && !$('title').hidden) $('bNew').click(); return; }
  if (e.key === 'Alt') { mouse.alt = true; e.preventDefault(); return; }
  if (!started) return;
  if (!$('dialog').hidden && (e.key === 'Enter' || e.key === ' ')) { const b = $('dopts').querySelector('button'); if (b && document.activeElement !== b) { b.click(); e.preventDefault(); } return; }
  const k = e.key.toLowerCase();
  if (/^[1-9]$/.test(e.key)) {
    e.preventDefault(); const i = +e.key - 1;
    if (UI.hoverBind) { const [kk, id] = UI.hoverBind.split(':'); if (kk === 'skill' && !P.skills[id]) { log('Learn the skill first.', 'warn'); return; } if (kk === 'item' && ITEMS[id].type !== 'use') { log('Only consumables fit on the hotbar.', 'warn'); return; } bindHot(i, { k: kk, id }); }
    else useHot(i);
    return;
  }
  if (k === 'escape') { if (!$('dialog').hidden) { closeDialog(); return; } let top = null, tz = -1; for (const id in UI.open) if (UI.open[id]) { const z = +$('w-' + id).style.zIndex; if (z > tz) { tz = z; top = id; } } if (top) closeWin(top); return; }
  if (e.ctrlKey || e.metaKey) return;
  const map_ = { a: 'status', i: 'inv', e: 'equip', s: 'skills', j: 'journal', h: 'help' };
  if (map_[k]) { toggleWin(map_[k]); return; }
  if (k === 'x') { if ((P.skills.basic || 0) < 3) { log('You need Basic Skill 3 to sit.', 'warn'); return; } if (P.target || P.casting) return; P.sitting = !P.sitting; P.path = null; log(P.sitting ? 'You sit and catch your breath.' : 'You stand.', 'sys'); return; }
  if (k === 'z') { let best = null, bd = 3.5; for (const d of drops) { const dd = dist(d, P); if (dd < bd) { bd = dd; best = d; } } if (best) { P.target = null; P.goal = { kind: 'drop', ref: best }; P.path = null; } return; }
  if (k === '[' || k === 'q') { cam.yawT += Math.PI / 8; return; }
  if (k === ']') { cam.yawT -= Math.PI / 8; return; }
  if (k === 'm') { Sfx.on = !Sfx.on; store('aom-sound', Sfx.on ? 'on' : 'off'); log(`Sound ${Sfx.on ? 'on' : 'off'}.`, 'sys'); return; }
});
addEventListener('keyup', e => { if (e.key === 'Alt') mouse.alt = false; });
addEventListener('blur', () => { mouse.alt = false; mouse.down = false; });
addEventListener('resize', () => { resize(); if (map) setScreenParts(); });

/* =========================================================
   Save / load / boot
   ========================================================= */
const SAVE_KEYS = ['name', 'hair', 'gender', 'hairStyle', 'cls', 'lvl', 'exp', 'jlvl', 'jexp', 'statPts', 'skillPts', 'st', 'skills', 'hp', 'sp', 'zeny', 'inv', 'equip', 'hot', 'map', 'x', 'y', 'lastWay', 'kindled', 'flags', 'lostZeny', 'playTime', 'quests'];
function serialize() { if (!P) return null; const o = {}; for (const k of SAVE_KEYS) o[k] = P[k]; o.uidc = uidc; o.v = 1; return JSON.stringify(o); }
function saveGame() { if (!started || !P) return; const s = serialize(); if (s) store('aom-save', s); }
function loadSave() { const raw = store('aom-save'); if (!raw) return null; try { return JSON.parse(raw); } catch (e) { return null; } }
let questMigrate = false;
function applySave(o) {
  P = Object.assign(newPlayer(o.name, o.hair), o); uidc = Math.max(uidc, o.uidc || 1);
  P.flags = Object.assign({ shards: {}, bosses: {}, lore: { ash: true }, tips: {}, talked: {} }, P.flags);
  for (const k of ['shards', 'bosses', 'lore', 'tips', 'talked']) P.flags[k] = P.flags[k] || {};
  P.quests = questNorm(o.quests); questMigrate = !o.quests; // saves from before the quest system: story quests are caught up without rewards
  resetRuntime();
}
function startGame(fresh) {
  started = true; $('title').hidden = true; $('hud').hidden = false;
  resetRuntime(); calcStats();
  if (fresh) { P.hp = S.maxhp; P.sp = S.maxsp; }
  let x = P.x, y = P.y; const m = genMap(P.map);
  if (m.t[Math.floor(y) * m.w + Math.floor(x)] !== 0) { x = P.lastWay.x; y = P.lastWay.y; }
  map = null; gotoMap(P.map, x, y);
  renderHotbar(); renderBuffs(); UI.dirty = true;
  questRefresh({ silent: !fresh, noReward: questMigrate }); questMigrate = false;
  log(fresh ? 'You wake in the Ash with nothing but a knife and a shirt.' : `Welcome back, ${P.name}.`, 'sys');
  log(`Press H for controls. Press ${winKey('status')} to spend status points.`, 'sys'); refreshKeyHints();
}
const OPT_ON = 'border-color:#3a6ae0;box-shadow:0 0 0 1px #3a6ae0;background:linear-gradient(#e8f0ff,#c4d4f4);color:#1a3a8a';
function showTitle() {
  const save = loadSave(); const hairs = ['#b9b3a8', '#1d1a1a', '#a4532a', '#caa04f', '#6a7890'];
  let hair = hairs[0], gender = 'm', hairStyle = 'spiky', armed = false;
  const opt = (grp, val, txt, on) => `<button class="btn t-opt" data-g="${grp}" data-v="${val}" aria-pressed="${on}" style="${on ? OPT_ON : ''}">${txt}</button>`;
  $('title').innerHTML = `<div class="t-wrap">
    <div class="t-rune">ᚨᛊᚺᛖᛊ · ᛟᚠ · ᛗᛁᛞᚷᚨᚱᛞ</div>
    <h1>Ashes of Midgard</h1>
    <p class="t-sub">The Tree burned. You did not.</p>
    <div class="t-card rwin"><div class="rtb">Character</div><div class="rbd">
      ${save ? `<button class="btn big" id="bCont">Continue · ${esc(save.name)}, Lv ${save.lvl} ${CLASSES[save.cls] ? CLASSES[save.cls].name : ''}</button><div class="sec" style="margin:6px 0 0">Or begin again</div>` : ''}
      <label for="nm">Name</label><input id="nm" maxlength="16" value="Unkindled" autocomplete="off" spellcheck="false">
      <label>Body</label><div class="hairs" role="group" aria-label="Body">${opt('gender', 'm', 'Male', true)}${opt('gender', 'f', 'Female', false)}</div>
      <label>Hair style</label><div class="hairs" role="group" aria-label="Hair style">${opt('style', 'spiky', 'Spiky', true)}${opt('style', 'long', 'Long', false)}</div>
      <label>Hair</label><div class="hairs">${hairs.map((h, i) => `<button class="hair ${i ? '' : 'on'}" data-h="${h}" style="background:${h}" aria-label="Hair color ${i + 1}"></button>`).join('')}</div>
      <button class="btn big" id="bNew">Rise</button>
    </div></div>
    <p class="t-foot">Single-player · Saves in this browser at every Waystone</p></div>`;
  $('title').querySelectorAll('.hair').forEach(b => b.onclick = () => { hair = b.dataset.h; $('title').querySelectorAll('.hair').forEach(x => x.classList.toggle('on', x === b)); });
  $('title').querySelectorAll('.t-opt').forEach(b => b.onclick = () => {
    if (b.dataset.g === 'gender') gender = b.dataset.v; else hairStyle = b.dataset.v;
    $('title').querySelectorAll(`.t-opt[data-g="${b.dataset.g}"]`).forEach(x => { const on = x === b; x.setAttribute('aria-pressed', on); x.style.cssText = on ? OPT_ON : ''; });
  });
  if (save) $('bCont').onclick = () => { Sfx.unlock(); applySave(save); startGame(false); };
  $('bNew').onclick = () => {
    Sfx.unlock();
    if (save && !armed) { armed = true; $('bNew').textContent = 'Rise, and erase the saved character'; $('bNew').classList.add('warn'); return; }
    const name = ($('nm').value || 'Unkindled').trim().slice(0, 16) || 'Unkindled';
    P = newPlayer(name, hair, gender, hairStyle); uidc = 1;
    const kn = makeItem('knife'), sh = makeItem('cotton_shirt'); P.equip.weapon = kn; P.equip.body = sh;
    P.inv.push(makeItem('red_potion', { qty: 10 }), makeItem('fly_wing', { qty: 3 }), makeItem('butterfly_wing', { qty: 1 }), makeItem('apple', { qty: 5 }));
    intro(() => startGame(true));
  };
}
function intro(done) {
  const el = $('story'); el.hidden = false; $('title').hidden = true;
  const lines = ['Before the end, there were nine realms on the branches of Yggdrasil.', 'Then Surtr’s herald climbed up out of Muspelheim, crowned himself the Ashen King, and set the roots of the World Tree on fire.', 'The gods did not answer. The Valkyries did not come. Hel’s gate burned, and the dead stopped staying dead.', 'You died in the Ash.', 'The Tree would not take you.'];
  el.innerHTML = `<div class="s-in">${lines.map((l, i) => `<p style="animation-delay:${i * 1.6}s">${l}</p>`).join('')}<div class="s-go" style="animation-delay:${lines.length * 1.6}s">Click to rise</div></div>`;
  const go = () => { el.hidden = true; el.removeEventListener('click', go); done(); };
  el.addEventListener('click', go);
}

let errShown = false;
function showErr(err) { if (errShown) return; errShown = true; const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99;max-width:70vw;background:#fff;color:#a01010;border:1px solid #a01010;padding:6px 8px;font:12px monospace;white-space:pre-wrap'; d.textContent = 'Error: ' + (err && err.stack ? err.stack.split('\n').slice(0, 3).join('\n') : String(err)); document.body.appendChild(d); }
window.addEventListener('error', e => showErr(e.error || e.message));
let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  if (HITSTOP > 0) { HITSTOP -= dt; dt *= 0.12; }
  try {
    if (started) hover = pickAt(mouse.x, mouse.y);
    update(dt);
    render(dt);
    if (started) { renderHUD(); if (UI.dirty) renderAll(); if (time % 0.25 < dt) drawMinimap(); }
    setCursor(hover ? (hover.kind === 'mob' ? 'atk' : hover.kind === 'drop' ? 'pick' : 'talk') : 'def');
  } catch (err) { console.error(err); showErr(err); }
}
function boot(data) {
  resize();
  P = newPlayer('Unkindled', '#b9b3a8'); resetRuntime(); calcStats();
  map = genMap('emberhold'); P.x = 18.5; P.y = 20.5; spawnAll(); enterWorld(); setScreenParts();
  if (data && data.save) { try { applySave(JSON.parse(data.save)); startGame(false); } catch (e) { showTitle(); } }
  else showTitle();
  requestAnimationFrame(frame);
}
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { for (const k in iconCache) if (k.startsWith('sk|') || k.startsWith('shard')) delete iconCache[k]; for (const k in iconCache) if (k.startsWith('shard|')) delete iconCache[k]; UI.dirty = true; if (P && started) renderBuffs(); });
const hot = window.claude && window.claude.hot;
if (hot && typeof hot.snapshot === 'function') hot.snapshot(() => ({ save: started ? serialize() : null }));
if (hot && typeof hot.ready === 'function') hot.ready(boot); else boot((hot && hot.data) || {});
