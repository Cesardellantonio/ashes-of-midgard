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
    case 'stone': { g.fillStyle = shade(col, -0.45); g.beginPath(); g.moveTo(12, 40); g.lineTo(22, 16); g.lineTo(46, 12); g.lineTo(54, 34); g.lineTo(40, 54); g.lineTo(18, 52); g.closePath(); g.fill(); g.fillStyle = col; g.beginPath(); g.moveTo(22, 16); g.lineTo(46, 12); g.lineTo(54, 34); g.lineTo(34, 36); g.closePath(); g.fill(); g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.moveTo(24, 18); g.lineTo(40, 15); g.lineTo(32, 26); g.closePath(); g.fill(); g.font = "18px 'Noto Sans Runic', sans-serif"; g.fillStyle = 'rgba(20,10,0,.6)'; g.textAlign = 'center'; g.fillText('ᛟ', 34, 48); break; }
    case 'bowl': { g.fillStyle = '#6a4a2a'; g.beginPath(); g.moveTo(8, 30); g.lineTo(56, 30); g.quadraticCurveTo(54, 54, 32, 56); g.quadraticCurveTo(10, 54, 8, 30); g.fill(); g.fillStyle = col; g.beginPath(); g.ellipse(32, 30, 23, 6, 0, 0, 7); g.fill(); g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 2; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(22 + i * 10, 22); g.quadraticCurveTo(26 + i * 10, 16, 22 + i * 10, 10); g.stroke(); } break; }
    case 'mug': { g.fillStyle = '#7a5232'; g.fillRect(14, 18, 30, 38); g.strokeStyle = '#7a5232'; g.lineWidth = 5; g.beginPath(); g.arc(46, 36, 9, -1.3, 1.3); g.stroke(); g.fillStyle = '#4a3020'; g.fillRect(14, 28, 30, 3); g.fillRect(14, 44, 30, 3); g.fillStyle = col; g.fillRect(16, 14, 26, 6); g.fillStyle = '#f4ecd8'; g.beginPath(); g.arc(20, 14, 6, 0, 7); g.arc(30, 12, 7, 0, 7); g.arc(39, 14, 5, 0, 7); g.fill(); break; }
    case 'acc': { g.strokeStyle = '#d8b050'; g.lineWidth = 5; g.beginPath(); g.arc(32, 36, 14, 0, 7); g.stroke(); g.fillStyle = '#9fd0ff'; g.beginPath(); g.arc(32, 20, 6, 0, 7); g.fill(); break; }
  }
  ICONCV[key] = c;
  return (iconCache[key] = c.toDataURL());
}
const ICONCV = {};
function iconCanvas(t) { iconURL(t); return ICONCV[t.icon + '|' + (t.color || '')]; }
// Icons for buffs and debuffs that are not skills (the Bog Crone's hex).
const BUFF_ICONS = { hex: { el: 'shadow', rune: 'ᚺ' }, food: { el: 'fire', rune: 'ᚠ' }, rested: { el: 'holy', rune: 'ᛃ' } };
function skillIcon(id) {
  const key = 'sk|' + id; if (iconCache[key]) return iconCache[key];
  const sk = SKILLS[id] || BUFF_ICONS[id] || { el: 'neutral', rune: '?' }; const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d');
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
  if (chg('title', P.title, 0)) { const t = P.title && TITLES[P.title]; setText('ptitle', t ? `« ${t} »` : ''); $('ptitle').hidden = !t; }
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
  { t: () => `Two Waystones kindled. Any Waystone can send you to the other; press <b>${winKey('worldmap')}</b> for the World Map.`, show: () => Object.keys(P.kindled).length >= 2, done: () => !!P.flags.tips.worldmap || P.lvl >= 20 },
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
  way: { title: 'Waystone', w: 320, pos: () => [W / 2 - 160, H / 2 - 190] },
  worldmap: { title: 'World Map', w: 640, pos: () => [W / 2 - 320, 60] },
  // Content round 5: services
  storage: { title: 'Storage', w: 560, pos: () => [W / 2 - 280, 60] },
  craft: { title: 'Crafting', w: 560, pos: () => [W / 2 - 280, 60] },
  enchant: { title: 'Seiðr Enchanting', w: 460, pos: () => [W / 2 - 230, 70] },
  cardsage: { title: 'Card Removal', w: 440, pos: () => [W / 2 - 220, 70] },
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
function closeWin(id) { const el = $('w-' + id); if (el) el.hidden = true; UI.open[id] = false; if (id === 'inv') UI.socketCard = null; if (id === 'shop') { UI.refineArm = null; UI.junkArm = false; } if (id === 'cardsage') UI.cardArm = null; hideTip(); }
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
    // Round 5: filter tabs (view only), sort (reorders the bag and merges stacks), bag count, lock marks, mail notice.
    const tab = UI.invTab || 'all', shown = P.inv.filter(it => tab === 'all' || storageTabOf(it) === tab || (tab === 'etc' && ITEMS[it.id].type === 'key'));
    const tabs = `<div class="tabs inv-tabs">${STORAGE_TABS.map(([k, l]) => `<button class="btn ${tab === k ? 'on' : ''}" data-act="invtab:${k}">${l}</button>`).join('')}<button class="btn" data-act="sortbag" title="Sort by kind, slot and level; merge stacks" style="margin-left:auto">Sort</button></div>`;
    const cells = []; for (const it of shown) { const r = rarityOf(it); cells.push(`<button class="cell r-${r}" data-act="inv:${it.uid}" data-tip="item:${it.uid}" data-bind="item:${it.id}" aria-label="${esc(itemName(it))}"><img src="${iconURL(ITEMS[it.id])}" alt="">${it.qty > 1 ? `<span class="q">${it.qty}</span>` : ''}${it.lock ? '<span class="lk">🔒</span>' : ''}</button>`); }
    for (let i = tab === 'all' ? shown.length : 0; i < BAG_SLOTS && (tab === 'all' || i < BAG_SLOTS - P.inv.length); i++) cells.push('<div class="cell empty"></div>');
    const mail = P.mail && P.mail.length ? `<div class="banner-x" style="margin:0 0 6px">You have ${P.mail.length} item${P.mail.length > 1 ? 's' : ''} in your mailbox. Claim ${P.mail.length > 1 ? 'them' : 'it'} at a storage keeper or any Waystone.</div>` : '';
    return head + mail + tabs + `<div class="grid">${cells.join('')}</div><div class="row" style="justify-content:space-between;margin-top:6px"><span class="muted" style="font-size:11.5px">Bag ${P.inv.length}/${BAG_SLOTS} · stacks up to ${STACK_MAX}</span><span class="muted" style="font-size:11.5px">Zeny <b style="color:var(--gold)">${fmt(P.zeny)}</b></span></div><p class="muted" style="margin:6px 0 0;font-size:11.5px;line-height:1.4">Click to use or equip. Right-click to drop. Hover a potion and press 1–9 to put it on the hotbar. Hover gear to compare it with what you wear.</p>`;
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
      if (c === 'novice' && P.skills.craftsmanship !== undefined && !seen.has('craftsmanship')) { ids.push('craftsmanship'); seen.add('craftsmanship'); }
      if (!ids.length) continue;
      if (chain.length > 1) rows += `<div class="sec" style="margin-top:${c === chain[0] ? 0 : 10}px">${c === 'novice' ? 'Common' : CLASSES[c].name}${c === P.cls ? '' : ' <span class="muted" style="font-weight:400">· still learnable</span>'}</div>`;
      rows += ids.map(row).join('');
    }
    const nxt = nextClasses(P.cls), cap = CLASSES[P.cls].maxJob;
    const hint = nxt.length && P.cls !== 'novice' ? `<p class="muted" style="margin:8px 0 0;font-size:11.5px">Next path: ${nxt.map(c => CLASSES[c].name).join(' or ')} · Job Lv 40 and Base Lv 30, then speak with Vidar.</p>` : '';
    return `<div class="row" style="justify-content:space-between;margin-bottom:4px"><span class="muted">${CLASSES[P.cls].name} · Job Lv ${P.jlvl}/${cap}</span><span>Skill points <b style="color:${P.skillPts ? 'var(--ember)' : 'inherit'}">${P.skillPts}</b></span></div>${rows}${hint}<p class="muted" style="margin:8px 0 0;font-size:11.5px">Hover a learned skill and press 1–9 to bind it. Click its icon to use it. ${isAction() ? 'With the keyboard, enemy skills take the enemy in front of you (Tab locks one); ground skills land in front of you.' : 'Enemy skills target what is under the cursor, then your current target. Ground skills land at the cursor.'}</p>`;
  },
  journal() {
    const tab = UI.jTab === 'chronicle' || UI.jTab === 'ach' ? UI.jTab : 'quests';
    const nA = ACHIEVEMENTS.filter(a => P.ach[a.id]).length;
    const tabs = `<div class="tabs"><button class="btn ${tab === 'quests' ? 'on' : ''}" data-act="jtab:quests">Quests</button><button class="btn ${tab === 'chronicle' ? 'on' : ''}" data-act="jtab:chronicle">Chronicle</button><button class="btn ${tab === 'ach' ? 'on' : ''}" data-act="jtab:ach">Achievements ${nA}/${ACHIEVEMENTS.length}</button></div>`;
    return tabs + (tab === 'quests' ? journalQuests() : tab === 'ach' ? journalAch() : journalChronicle());
  },
  help() {
    const k = (a, b) => `<div class="drow" style="height:auto;padding:3px 0"><span>${a}</span><span style="text-align:right">${b}</span></div>`;
    const act = isAction();
    const mode = `<div class="sec">Control style</div><div class="tabs"><button class="btn ${act ? 'on' : ''}" data-act="ctrl:action">Action (keyboard)</button><button class="btn ${act ? '' : 'on'}" data-act="ctrl:classic">Classic (mouse)</button></div>`;
    const keys = act
      ? `${k('Move', 'W A S D or arrow keys')}${k('Attack (3-hit combo)', 'J, tap repeatedly')}${k('Heavy attack', 'Hold K, release (charge for more)')}${k('Block / parry', 'Hold L; block right before a hit to parry')}${k('Dodge roll', 'Space (invulnerable while rolling)')}${k('Talk, use, pick up', 'F')}${k('Lock onto an enemy', 'Tab')}${k('Rotate camera', 'Q / E, or right-drag')}${k('Skills and potions', '1–9')}${k('Windows', 'C Status · I Items · G Equip · V Skills · N Journal · H Help · , World Map')}${k('Gamepad', 'Stick move · X attack · Y heavy · B dodge · LB/RB block · A talk')}`
      : `${k('Walk', 'Click the ground, or hold to keep walking')}${k('Attack', 'Click a monster; you keep attacking')}${k('Talk, pick up', 'Click an NPC or an item on the ground')}${k('Hotbar', 'Keys 1–9')}${k('Windows', 'A Status · I Items · E Equip · S Skills · J Journal · W World Map')}${k('Rotate camera', 'Right-drag, Shift-drag, or Q / [ / ]')}`;
    return `${mode}<div class="sec">Controls</div>${keys}${k('Bind a skill or potion', 'Hover it in Skills or Items, press 1–9')}${k('Pick up nearest item', 'Z')}${k('Show all item names', 'Hold Alt')}${k('Sit and recover faster', 'X (needs Basic Skill 3)')}${k('Windows (always)', 'Alt+A Status · Alt+E Items · Alt+Q Equip · Alt+S Skills · Alt+U Journal · Alt+W World Map')}${k('Zoom', 'Mouse wheel')}${k('Tilt camera', 'Ctrl + right-drag')}${k('Sound on or off', 'M')}${k('Close windows', 'Esc')}
      <div class="sec">The Ash</div><p class="lore">Rest at a Waystone to heal, set your return point and save. Resting also brings every slain monster back, except the Shardbearers.</p><p class="lore">When you die you drop all your zeny where you fell. Walk back and touch the red stain to take it back. Die again first and it is gone.</p><p class="lore">Monsters drop gear in four grades: <span class="r-common">common</span>, <span class="r-magic">magic</span>, <span class="r-rare">rare</span> and <span class="r-unique">unique</span>. Rare cards drop too; slot them into gear with free slots. Brokkr can refine gear up to +10. Past +4, a failed refine destroys the item.</p><p class="lore">Watch the ground during boss fights. A red circle means something is about to land there. Cones and rolling lines of circles are breath and waves: step sideways out of them. Purple hexes stay on the ground; do not stand in them.</p><p class="lore">Kindled Waystones are linked: from any Waystone you can travel to another, or open the World Map to see every realm and its level range. Mud slows you down; boardwalks and ice do not.</p>
      <div class="sec">Save</div><p class="muted" style="margin:0 0 8px">Progress is kept in this browser and saved at every Waystone and map change.</p><button class="btn warn" data-act="${UI.wipeArm ? 'wipe2' : 'wipe'}">${UI.wipeArm ? 'Confirm: erase this character' : 'Erase character and start over'}</button>`;
  },
  // Every shop is a vendor (VENDORS in js/data/recipes.js): Brokkr, Sindri, Úlfar. Tabs depend on what it offers.
  shop() {
    const v = VENDORS[UI.shopBy] ? UI.shopBy : 'brokkr', V = VENDORS[v];
    const tb = $('w-shop') && $('w-shop').querySelector('.tb span'); if (tb) tb.textContent = V.title;
    const sc = Object.keys(P.flags.shards).length, cap = [10, 20, 30, 99][sc];
    if (UI.shopMode === 'refine' && !V.refine) UI.shopMode = 'buy';
    const tabs = `<div class="tabs"><button class="btn ${UI.shopMode === 'buy' ? 'on' : ''}" data-act="mode:buy">Buy</button><button class="btn ${UI.shopMode === 'sell' ? 'on' : ''}" data-act="mode:sell">Sell</button>${V.refine ? `<button class="btn ${UI.shopMode === 'refine' ? 'on' : ''}" data-act="mode:refine">Refine</button>` : ''}${V.craft ? `<button class="btn" data-act="craftopen:${v}">Craft ⚒</button>` : ''}<span style="margin-left:auto;align-self:center" class="muted">Zeny <b style="color:var(--gold)">${fmt(P.zeny)}</b></span></div>`;
    if (UI.shopMode === 'buy') {
      if (!V.gear) UI.shopTab = 'supplies';
      const sub = V.gear ? `<div class="tabs"><button class="btn ${UI.shopTab === 'supplies' ? 'on' : ''}" data-act="tab:supplies">Supplies</button><button class="btn ${UI.shopTab === 'weapons' ? 'on' : ''}" data-act="tab:weapons">Weapons</button><button class="btn ${UI.shopTab === 'armor' ? 'on' : ''}" data-act="tab:armor">Armor</button></div>` : '';
      let ids;
      // Second-class gear only shows for second classes, and only up to 5 levels above your own.
      const t2 = CLASSES[P.cls].tier >= 2;
      if (UI.shopTab === 'supplies') ids = vendorSupplies(v);
      // Round-3 gear (Lv 45+) only shows within 5 levels of your own, like second-class gear. Crafted gear is never sold.
      else ids = Object.values(ITEMS).filter(t => t.type === 'equip' && !t.unique && !t.crafted && t.lvl <= cap && (t.lvl < 45 || t.lvl <= P.lvl + 5) && (UI.shopTab === 'weapons' ? t.slot === 'weapon' : t.slot !== 'weapon') && (!tier2Item(t) || (t2 && jobOk(t, P.cls) && t.lvl <= P.lvl + 5))).sort((a, b) => (jobOk(b, P.cls) - jobOk(a, P.cls)) || a.lvl - b.lvl).map(t => t.id);
      const row = (id, sp) => { const t = ITEMS[id], ok = t.type !== 'equip' || jobOk(t, P.cls), stack = t.type !== 'equip', pr = vendorPrice(v, id), left = sp ? vendorLeft(v, id) : Infinity, n10 = Math.min(10, left);
        return `<div class="li ${ok && left > 0 ? '' : 'off'}" data-tip="shop:${id}"><img src="${iconURL(t)}" alt=""><span>${esc(t.name)}${t.type === 'equip' ? ` <span class="muted">Lv ${t.lvl}</span>` : ''}${sp ? ` <span class="muted">· ${left > 0 ? left + ' left' : 'sold out'}</span>` : ''}</span><span class="row"><span class="p">${fmt(pr)}z</span><button class="btn" data-act="buy:${id}:1" ${P.zeny >= pr && left > 0 ? '' : 'disabled'}>Buy</button>${stack && n10 > 1 ? `<button class="btn" data-act="buy:${id}:${n10}" ${P.zeny >= pr * n10 ? '' : 'disabled'}>×${n10}</button>` : ''}</span></div>`; };
      let rows = ids.map(id => row(id, false)).join('');
      if (UI.shopTab === 'supplies' && V.specials && V.specials.length) rows += `<div class="sec">Limited stock <span class="muted" style="font-weight:400">· restocks in ${Math.ceil(vendorRestockIn() / 60)} min</span></div>` + V.specials.filter(sp => ITEMS[sp[0]]).map(sp => row(sp[0], true)).join('');
      const note = v === 'brokkr' && sc < 3 && UI.shopTab !== 'supplies' ? `<p class="muted" style="font-size:11.5px;margin:8px 0 0">“Bring me proof the Shardbearers can die and I’ll open the good racks.” Stock rises with each Rune-Shard.</p>` : '';
      return tabs + sub + `<div class="list">${rows}</div>` + note;
    }
    if (UI.shopMode === 'sell') {
      const J = UI.junk = UI.junk || Object.assign({}, JUNK_DEFAULT), js = junkList(J), jz = js.reduce((a, i) => a + sellPrice(i) * (i.qty || 1), 0);
      const opt = (k, l) => `<button class="btn ${J[k] ? 'on' : ''}" data-act="junkopt:${k}">${J[k] ? '☑' : '☐'} ${l}</button>`;
      const junk = `<div class="junk"><div class="row" style="gap:4px;flex-wrap:wrap">${opt('mats', 'Materials')}${opt('gear', 'Common gear')}${opt('magic', 'Magic gear')}${opt('keepCraft', 'Keep crafting materials')}</div>
        <div class="row" style="margin-top:6px;justify-content:space-between"><span class="muted" style="font-size:11.5px">${js.length ? `${js.length} item${js.length > 1 ? 's' : ''}: ${esc(js.slice(0, 5).map(i => itemName(i)).join(', '))}${js.length > 5 ? '…' : ''}` : 'No junk in your bag.'}</span><button class="btn ${UI.junkArm ? 'warn' : ''}" data-act="selljunk" ${js.length ? '' : 'disabled'}>${UI.junkArm ? `Confirm: sell for ${fmt(jz)}z` : `Sell junk (${fmt(jz)}z)`}</button></div>
        <p class="muted" style="margin:4px 0 0;font-size:11px">Never sold as junk: locked (🔒), quest-needed, cards, consumables, upgrade stones, rare materials, unique, rare, crafted, refined or carded gear, and gear that would be an upgrade for you.</p></div>`;
      const items = P.inv.filter(i => ITEMS[i.id].type !== 'key');
      const rows = items.map(i => { const t = ITEMS[i.id]; const val = sellPrice(i); return `<div class="li" data-tip="item:${i.uid}"><img src="${iconURL(t)}" alt=""><span class="r-${rarityOf(i)}">${esc(itemName(i))}${i.qty > 1 ? ' ×' + i.qty : ''}</span><span class="row"><span class="p">${fmt(val)}z</span><button class="btn lock ${i.lock ? 'on' : ''}" data-act="lock:${i.uid}" title="${i.lock ? 'Unlock' : 'Lock: never sold as junk or by accident'}">${i.lock ? '🔒' : '🔓'}</button><button class="btn" data-act="sell:${i.uid}" ${i.lock ? 'disabled' : ''}>Sell</button>${i.qty > 1 ? `<button class="btn" data-act="sellall:${i.uid}" ${i.lock ? 'disabled' : ''}>All</button>` : ''}</span></div>`; }).join('');
      return tabs + junk + `<div class="list">${rows || '<div class="muted">Nothing to sell.</div>'}</div>`;
    }
    const eqs = [...SLOTS.map(s => P.equip[s]).filter(Boolean), ...P.inv.filter(i => ITEMS[i.id].type === 'equip')].filter(i => ITEMS[i.id].slot !== 'acc');
    // Upgrade stones: pick one to use on the next refine (whetstones add success, a warding stone prevents shattering).
    const stones = [...new Set(P.inv.filter(i => ITEMS[i.id].stone).map(i => i.id))]; if (UI.refineStone && !countItem(UI.refineStone)) UI.refineStone = null;
    const stoneBar = stones.length ? `<div class="row" style="gap:4px;margin:0 0 8px"><span class="muted">Stone:</span><button class="btn ${!UI.refineStone ? 'on' : ''}" data-act="rstone:">None</button>${stones.map(id => `<button class="btn ${UI.refineStone === id ? 'on' : ''}" data-act="rstone:${id}" data-tip="shop:${id}">${esc(ITEMS[id].name)} ×${countItem(id)}</button>`).join('')}</div>` : '<p class="muted" style="margin:0 0 6px;font-size:11.5px">Upgrade stones (crafted, or from the limited stock) raise the odds or stop a failed refine from shattering the item.</p>';
    const rows = eqs.map(i => {
      const r = i.refine || 0, cost = refineCost(i), ch = refineChanceWith(i, UI.refineStone), safe = ch >= 100, ward = UI.refineStone && ITEMS[UI.refineStone].stone.ward, armed = UI.refineArm === i.uid;
      const btn = r >= 10 ? '<span class="muted">Max</span>' : `<button class="btn ${safe || ward ? '' : 'warn'}" data-act="refine:${i.uid}" ${P.zeny >= cost ? '' : 'disabled'}>${armed ? `Confirm, ${ch}%` : safe ? 'Refine' : `Refine (${ch}%)`}</button>`;
      return `<div class="li" data-tip="item:${i.uid}"><img src="${iconURL(ITEMS[i.id])}" alt=""><span class="r-${i.rarity}">${esc(itemName(i))}<br><span class="muted" style="font-size:11px">${r >= 10 ? '' : `+${r} → +${r + 1} · ${fmt(cost)}z${safe ? ' · safe' : ward ? ' · a failure drops one level' : ' · fails shatter it'}`}</span></span>${btn}</div>`;
    }).join('');
    return tabs + `<p class="muted" style="margin:0 0 8px;line-height:1.4">“Up to +4, nothing breaks. Past that the metal gets proud, and proud metal shatters.”</p>${stoneBar}<div class="list">${rows || '<div class="muted">No equipment to refine. Accessories cannot be refined.</div>'}</div>`;
  },
  way() {
    const list = travelList().filter(k => k !== map.id).map(k => travelButton(k)).join('');
    return `<p class="muted" style="margin:0 0 8px;line-height:1.45">The ember inside is warm. Resting heals you and saves your progress, but everything you killed on this map will rise again.</p><button class="btn big" style="width:100%" data-act="rest">Rest</button><div class="sec">Travel to a kindled Waystone</div>${list || '<div class="muted">No other Waystones kindled yet.</div>'}<button class="btn" style="width:100%;margin-top:8px" data-act="worldmap">World Map <kbd>${winKey('worldmap')}</kbd></button>${mailHTML()}`;
  },
  // World Map: every realm, its level range and waystone, the roads between them; travel from a kindled Waystone.
  worldmap() {
    P.flags.tips.worldmap = true;
    const at = atWaystone(), E = worldEdges(), ids = MAP_ORDER.filter(k => MAPDEFS[k]);
    const lines = E.map(e => { const a = MAPDEFS[e.a].world, b = MAPDEFS[e.b].world; const seen = P.flags.seen[e.a] || P.flags.seen[e.b]; return `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${e.locked ? '#b0402a' : seen ? '#c8a860' : '#6a6258'}" stroke-width="${e.locked ? 2 : 2.5}" ${e.locked || !seen ? 'stroke-dasharray="6 5"' : ''} opacity="${seen ? 0.9 : 0.55}"/>`; }).join('');
    const nodes = ids.map(k => {
      const d = MAPDEFS[k], [x, y] = d.world, here = map.id === k, seen = !!P.flags.seen[k], lit = !!P.kindled[k], hasWay = !!genMap(k).way, can = at && lit && !here;
      const lv = d.lv ? `Lv ${d.lv[0]}–${d.lv[1]}` : 'Safe haven', warn = d.lv && P.lvl < d.lv[0] - 4;
      const way = hasWay ? `<text x="${x + 64}" y="${y + 16}" text-anchor="end" font-size="12" fill="${lit ? '#ffb050' : '#7a7068'}">${lit ? '✦' : '◇'}</text>` : '';
      return `<g ${can ? `data-act="travel:${k}" style="cursor:pointer"` : ''} data-tip="wm:${k}"><rect x="${x - 70}" y="${y - 22}" width="140" height="44" rx="6" fill="${here ? '#4a3a1c' : seen ? '#221c18' : '#15120f'}" stroke="${here ? '#ffd070' : can ? '#ffb050' : seen ? '#8a7a5a' : '#4a4038'}" stroke-width="${here || can ? 2 : 1}"/>`
        + `<text x="${x}" y="${y - 3}" text-anchor="middle" font-size="13" font-weight="700" fill="${seen ? '#f4e8d0' : '#9a9088'}">${esc(d.name)}</text>`
        + `<text x="${x}" y="${y + 13}" text-anchor="middle" font-size="11" fill="${warn ? '#ff8a6a' : seen ? '#c8b898' : '#7a7068'}">${seen ? lv : lv + ' · unexplored'}</text>${way}${here ? `<circle cx="${x - 58}" cy="${y - 8}" r="4" fill="#ffd070"/>` : ''}</g>`;
    }).join('');
    const svg = `<svg viewBox="0 0 640 400" style="width:100%;height:auto;display:block;background:radial-gradient(ellipse at 40% 55%,#2a241c,#0e0c0a);border:1px solid #4a4038;border-radius:6px;font-family:inherit">${lines}${nodes}</svg>`;
    const kindled = travelList().filter(k => k !== map.id);
    const list = kindled.map(k => travelButton(k, !at)).join('');
    return `${svg}<p class="muted" style="margin:6px 0 0;font-size:11.5px;line-height:1.4">✦ kindled Waystone · ◇ Waystone not yet kindled · dashed red: sealed road. ${at ? 'You stand by a Waystone: pick a kindled one to travel there.' : 'Travel between kindled Waystones from any Waystone.'}</p><div class="sec">Kindled Waystones</div>${list || '<div class="muted">No other Waystones kindled yet.</div>'}`;
  },
};
// Kindled waystones in story order; the travel buttons show the level range.
function travelList() { return MAP_ORDER.filter(k => MAPDEFS[k] && P.kindled[k]).concat(Object.keys(P.kindled).filter(k => MAPDEFS[k] && !MAP_ORDER.includes(k))); }
function travelButton(k, off) { const d = MAPDEFS[k]; return `<button class="btn" style="width:100%;text-align:left;margin-top:4px" data-act="travel:${k}" ${off ? 'disabled' : ''}>${esc(d.name)} <span class="muted">· ${d.lv ? `Base Lv ${d.lv[0]} – ${d.lv[1]}` : esc(d.sub)}</span></button>`; }
const atWaystone = () => !!(map && map.way && P.kindled[map.id] && !P.dead && dist(P, map.way) < 3.2);
// Roads between maps, from the warps of every map (maps are generated once and cached).
let WM_EDGES = null;
function worldEdges() {
  if (!WM_EDGES) {
    const seen = {}; WM_EDGES = [];
    for (const k of Object.keys(MAPDEFS)) for (const wp of genMap(k).warps) { if (!MAPDEFS[wp.to]) continue; const key = [k, wp.to].sort().join('|'); if (seen[key]) { if (wp.lock) seen[key].lock = wp.lock; continue; } seen[key] = { a: k, b: wp.to, lock: wp.lock }; WM_EDGES.push(seen[key]); }
  }
  for (const e of WM_EDGES) e.locked = !!(e.lock && WARP_LOCKS[e.lock] && !WARP_LOCKS[e.lock].open());
  return WM_EDGES;
}
function travelTo(k) {
  if (!P.kindled[k] || !MAPDEFS[k]) return;
  if (!atWaystone()) { log('You can only travel from a kindled Waystone.', 'warn'); return; }
  closeWin('way'); closeWin('worldmap'); Sfx.warp(); const m = genMap(k); gotoMap(k, m.way.x, m.way.y + 1.5);
}
/* ---------- Content round 5: service windows (storage, crafting, enchanting, card removal) ---------- */
const matRow = (id, need) => { const h = countItem(id), ok = h >= need; return `<div class="mat ${ok ? 'ok' : 'no'}" data-tip="shop:${id}"><img src="${iconURL(ITEMS[id])}" alt=""><span>${esc(ITEMS[id].name)}</span><b>${fmt(h)}/${need}</b></div>`; };
const miniCell = (it, act, tip) => `<button class="cell r-${rarityOf(it)}" data-act="${act}" data-tip="${tip}" aria-label="${esc(itemName(it))}"><img src="${iconURL(ITEMS[it.id])}" alt="">${it.qty > 1 ? `<span class="q">${it.qty}</span>` : ''}${it.lock ? '<span class="lk">🔒</span>' : ''}</button>`;
function mailHTML() {
  if (!P.mail || !P.mail.length) return '';
  return `<div class="sec">Mailbox (${P.mail.length}) <button class="btn" style="float:right;margin-top:-3px" data-act="mailall">Claim all</button></div><div class="list">${P.mail.map((m, i) => `<div class="li" data-tip="mail:${i}"><img src="${iconURL(ITEMS[m.item.id])}" alt=""><span class="r-${rarityOf(m.item)}">${esc(itemName(m.item))}${m.item.qty > 1 ? ' ×' + m.item.qty : ''} <span class="muted">· from ${esc(m.from)}</span></span><button class="btn" data-act="mail:${i}">Claim</button></div>`).join('')}</div>`;
}
Object.assign(RENDER, {
  storage() {
    const tab = UI.stTab || 'all', f = it => tab === 'all' || storageTabOf(it) === tab, fee = storageFee();
    const tabs = `<div class="tabs">${STORAGE_TABS.map(([k, l]) => `<button class="btn ${tab === k ? 'on' : ''}" data-act="sttab:${k}">${l} <span class="muted">${k === 'all' ? P.storage.length : P.storage.filter(i => storageTabOf(i) === k).length}</span></button>`).join('')}</div>`;
    const st = P.storage.filter(f), bag = P.inv.filter(i => f(i) && ITEMS[i.id].type !== 'key');
    const sCells = st.map(it => miniCell(it, 'wd:' + it.uid, 'sitem:' + it.uid)).join('') + (tab === 'all' ? '<div class="cell empty"></div>'.repeat(Math.max(0, Math.min(16, STORAGE_SLOTS - P.storage.length))) : '');
    const bCells = bag.map(it => miniCell(it, 'dp:' + it.uid, 'item:' + it.uid)).join('');
    return `<p class="muted" style="margin:0 0 6px;line-height:1.4">“One chest, every town. What you leave with me, my sister keeps too.” Each deposit or withdrawal costs <b style="color:var(--gold)">${fmt(fee)}z</b>. Click an item to move its whole stack; Shift-click moves one.</p>${tabs}
      <div class="sec">Storage <span class="muted" style="font-weight:400">${P.storage.length}/${STORAGE_SLOTS}</span></div><div class="grid st-grid">${sCells || '<span class="muted">Empty.</span>'}</div>
      <div class="sec">Bag <span class="muted" style="font-weight:400">${P.inv.length}/${BAG_SLOTS}</span> <button class="btn" style="float:right;margin-top:-3px" data-act="dpmats">Deposit all materials</button></div><div class="grid">${bCells || '<span class="muted">Nothing here.</span>'}</div>${mailHTML()}
      <div class="row" style="justify-content:flex-end;margin-top:6px"><span class="muted">Zeny <b style="color:var(--gold)">${fmt(P.zeny)}</b></span></div>`;
  },
  craft() {
    const by = craftStation(), L = craftLv(), tbs = $('w-craft') && $('w-craft').querySelector('.tb span'); if (tbs) tbs.textContent = `Crafting · ${NPCS[by] ? NPCS[by].name : ''}’s ${by === 'sindri' ? 'Deep Forge' : 'Forge'}`;
    if (!L) return `<p class="lore">You do not know how to hold the tongs yet. <b>Craftsmanship</b> is a passive any path can learn: ask Brokkr in Emberhold for <i>The Smith’s Apprentice</i> (Base Lv 10).</p><div class="sec">What the smiths can make</div><div class="list">${recipesAt(by).slice(0, 8).map(r => `<div class="li off"><img src="${iconURL(ITEMS[r.out[0]])}" alt=""><span>${esc(r.name || ITEMS[r.out[0]].name)}</span><span class="muted">Lv ${r.lvl}</span></div>`).join('')}</div>`;
    const cat = UI.craftCat || 'all', list = recipesAt(by).filter(r => cat === 'all' || r.cat === cat);
    if (!UI.craftSel || !RECIPES[UI.craftSel] || !RECIPES[UI.craftSel].at.includes(by)) UI.craftSel = (list[0] || {}).id;
    const xp = L >= CRAFT_MAX ? 'max' : `${P.flags.craftXp || 0}/${CRAFT_XP(L)} practice`;
    const tabs = `<div class="tabs"><button class="btn ${cat === 'all' ? 'on' : ''}" data-act="ccat:all">All</button>${RECIPE_CATS.map(([k, l]) => `<button class="btn ${cat === k ? 'on' : ''}" data-act="ccat:${k}">${l}</button>`).join('')}</div>`;
    const rows = list.map(r => { const why = craftWhy(r, by), t = ITEMS[r.out[0]]; return `<button class="li crow ${UI.craftSel === r.id ? 'sel' : ''} ${r.lvl > L ? 'off' : ''}" data-act="csel:${r.id}"><img src="${iconURL(t)}" alt=""><span>${esc(r.name || t.name)}${r.out[1] > 1 ? ' ×' + r.out[1] : ''}<br><span class="muted" style="font-size:10.5px">Lv ${r.lvl} · ${why ? (r.lvl > L ? 'locked' : 'missing materials') : craftChance(r) + '%'}</span></span><span class="${why ? 'muted' : 'ok'}">${why ? '·' : '✓'}</span></button>`; }).join('');
    const r = RECIPES[UI.craftSel]; let det = '<p class="muted">Choose a recipe.</p>';
    if (r) {
      const t = ITEMS[r.out[0]], why = craftWhy(r, by), ch = craftChance(r);
      const prev = { id: t.id, rarity: 'common', affixes: [], refine: 0, slotsN: t.slots || 0, cards: [], qty: r.out[1] };
      let qual = '';
      if (t.type === 'equip') {
        const o = craftQualityOdds(), stat = q => { const b = itemBase(Object.assign({}, prev, { q })); return t.slot === 'weapon' ? `ATK ${b.atk}${b.matk ? ' · MATK ' + b.matk : ''}` : `DEF ${b.def} · MDEF ${b.mdef}`; };
        qual = `<div class="sec">Quality</div>${[1, 2, 3].map(q => `<div class="drow"><span>${QUALITY[q].name} <span class="muted">${o[q - 1]}%</span></span><span>${stat(q)}${QUALITY[q].slot ? ' · +1 slot' : ''}</span></div>`).join('')}`;
      }
      det = `<div class="cprev">${itemTooltip(prev, true)}</div><div class="sec">Materials <span class="muted" style="font-weight:400">(used up even if the work fails)</span></div>${r.mats.map(([id, n]) => matRow(id, n)).join('')}
        <div class="drow"><span>Fee</span><b style="color:${P.zeny >= r.fee ? 'var(--gold)' : 'var(--bad)'}">${fmt(r.fee)}z</b></div><div class="drow"><span>Craftsmanship</span><b style="color:${L >= r.lvl ? 'inherit' : 'var(--bad)'}">Lv ${r.lvl} (yours ${L})</b></div><div class="drow"><span>Success</span><b>${ch}%</b></div>${qual}
        ${why ? `<p class="tt-bad" style="margin:6px 0 0">${esc(why)}</p>` : ''}<div class="row" style="margin-top:8px"><button class="btn big" data-act="craft:${r.id}:1" ${why ? 'disabled' : ''}>Craft</button><button class="btn" data-act="craft:${r.id}:5" ${why ? 'disabled' : ''}>×5</button></div>`;
    }
    return `<div class="row" style="justify-content:space-between;margin-bottom:6px"><span>Craftsmanship <b>Lv ${L}/${CRAFT_MAX}</b> <span class="muted">· ${xp}</span></span><span class="muted">Zeny <b style="color:var(--gold)">${fmt(P.zeny)}</b></span></div>${tabs}<div class="craft"><div class="list clist">${rows || '<div class="muted">Nothing here.</div>'}</div><div class="cdet">${det}</div></div><p class="muted" style="margin:6px 0 0;font-size:11px">Success grows with Craftsmanship (practice or skill points), DEX and LUK. Gear comes out Standard, Fine (+10 %) or Masterwork (+20 % and an extra slot).</p>`;
  },
  enchant() {
    const gear = [...SLOTS.map(s => P.equip[s]).filter(Boolean), ...P.inv.filter(i => ITEMS[i.id].type === 'equip')].filter(i => !ITEMS[i.id].unique);
    if (!gear.some(i => i.uid === UI.enchSel)) UI.enchSel = gear[0] ? gear[0].uid : null;
    const list = gear.map(i => `<button class="li crow ${UI.enchSel === i.uid ? 'sel' : ''}" data-act="esel:${i.uid}" data-tip="item:${i.uid}"><img src="${iconURL(ITEMS[i.id])}" alt=""><span class="r-${i.rarity}">${esc(itemName(i))}${SLOTS.some(s => P.equip[s] === i) ? ' <span class="muted">(worn)</span>' : ''}</span><span class="muted">Lv ${ITEMS[i.id].lvl}</span></button>`).join('');
    const it = findItem(UI.enchSel); let det = '';
    if (it) {
      const t = ITEMS[it.id], T = enchantTier(it), rare = !!UI.enchRare && !!T.rare, why = enchantWhy(it, rare);
      const pool = AFFIXES.filter(a => a.slots.includes(t.slot)).map(a => { let [lo, hi] = a.r(t.lvl); hi = Math.max(lo, hi); if (rare) lo = Math.ceil((lo + hi) / 2); return `${STATLABEL[a.s] || a.s} ${lo}–${hi}`; }).join(' · ');
      const n = it.rarity === 'rare' ? '2–3' : it.rarity === 'magic' ? '1–2' : '1 (it becomes magic)';
      det = `<div class="sec">Now</div><div>${it.affixes.length ? it.affixes.map(a => `<div class="tt-b">${bonusLine(a.s, a.v)}</div>`).join('') : '<span class="muted">No enchantments.</span>'}</div>
        <div class="sec">Reroll</div><p class="muted" style="margin:0 0 4px;font-size:11.5px">${n} new affix${it.rarity === 'rare' ? 'es' : ''} from: ${esc(pool)}</p>${T.mats.map(([id, k]) => matRow(id, k)).join('')}
        ${T.rare ? `<button class="btn ${rare ? 'on' : ''}" data-act="erare" style="margin:4px 0">${rare ? '☑' : '☐'} Offer ${esc(ITEMS[T.rare[0]].name)} (${countItem(T.rare[0])}): upper half of every range</button>` : ''}
        <div class="drow"><span>Fee</span><b style="color:${P.zeny >= T.zeny ? 'var(--gold)' : 'var(--bad)'}">${fmt(T.zeny)}z</b></div>${why ? `<p class="tt-bad" style="margin:4px 0 0">${esc(why)}</p>` : ''}
        <button class="btn big" style="margin-top:6px" data-act="enchant:${it.uid}" ${why ? 'disabled' : ''}>Reroll enchantments</button>`;
    }
    return `<p class="muted" style="margin:0 0 6px;line-height:1.4">“Seiðr does not add. It asks the metal what else it could have been.” Rerolls every random affix on non-unique gear. The old ones are lost.</p><div class="craft"><div class="list clist">${list || '<div class="muted">No gear that can be enchanted.</div>'}</div><div class="cdet">${det}</div></div><div class="row" style="justify-content:flex-end;margin-top:6px"><span class="muted">Zeny <b style="color:var(--gold)">${fmt(P.zeny)}</b></span></div>`;
  },
  cardsage() {
    const C = CARD_REMOVAL, gear = [...SLOTS.map(s => P.equip[s]).filter(Boolean), ...P.inv.filter(i => ITEMS[i.id].type === 'equip')].filter(i => (i.cards || []).length);
    const rows = gear.map(i => i.cards.map((c, k) => { const fee = cardRemovalFee(i, c), arm = UI.cardArm === i.uid + ':' + k, why = cardRemoveWhy(i, k);
      return `<div class="li" data-tip="item:${i.uid}"><img src="${iconURL(ITEMS[c])}" alt=""><span><span class="r-card">${esc(ITEMS[c].name)}</span><br><span class="muted" style="font-size:11px">in ${esc(itemName(i))} · ${fmt(fee)}z</span></span><button class="btn ${arm ? 'warn' : ''}" data-act="cardrm:${i.uid}:${k}" ${why ? `disabled title="${esc(why)}"` : ''}>${arm ? 'Confirm' : 'Remove'}</button></div>`; }).join('')).join('');
    return `<p class="muted" style="margin:0 0 6px;line-height:1.45">“Cards go in easy. Coming out, they remember they were a monster.” The fee is paid whatever happens.</p>
      <div class="odds"><span class="good">Both whole ${C.success}%</span><span>Card breaks ${C.cardBreaks}%</span><span>Item breaks ${C.itemBreaks}% <span class="muted">(its cards come back)</span></span><span class="bad">Both lost ${C.bothBreak}%</span></div>
      <div class="list" style="margin-top:6px">${rows || '<div class="muted">None of your gear holds a card.</div>'}</div><div class="row" style="justify-content:flex-end;margin-top:6px"><span class="muted">Zeny <b style="color:var(--gold)">${fmt(P.zeny)}</b></span></div>`;
  },
});
function journalQuests() {
  const QA = P.quests.active, kinds = [['main', 'Story'], ['side', 'Side quests'], ['daily', 'Daily bounties'], ['weekly', 'Weekly hunt']];
  const objRows = id => questObjectives(id).map(o => `<div class="obj ${o.done ? 'done' : o.open ? 'now' : ''}"><span class="m">${o.done ? '✓' : o.open ? '▸' : '·'}</span><span>${esc(o.text)}${o.counted ? ` <b class="qn">${o.cur}/${o.max}</b>` : ''}${o.live ? ` <i class="muted">${esc(o.live)}</i>` : ''}</span></div>`).join('');
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
  const done = Object.keys(P.quests.done).filter(id => QUESTS[id] && QUESTS[id].kind !== 'daily' && QUESTS[id].kind !== 'weekly');
  const side = done.filter(id => QUESTS[id].kind === 'side').length, total = Object.keys(QUESTS).filter(id => QUESTS[id].kind === 'side').length;
  h += `<div class="sec">Completed</div><p class="muted" style="margin:0;line-height:1.5">${done.length ? done.map(id => esc(QUESTS[id].name)).join(' · ') : 'Nothing yet.'}</p><p class="muted" style="font-size:11.5px;margin:6px 0 0">Side quests ${side}/${total} · Bounties claimed ${Object.keys(P.quests.done).filter(id => QUESTS[id] && QUESTS[id].kind === 'daily').reduce((a, id) => a + P.quests.done[id].n, 0)}</p>`;
  return h;
}
function journalChronicle() {
  // Story quests in order; a branch quest (q.branch) only shows for the ending you chose. Act II gets its own heading.
  const main = Object.keys(QUESTS).filter(id => QUESTS[id].kind === 'main' && (!QUESTS[id].branch || QUESTS[id].branch === P.flags.ending || P.quests.done[id]));
  let nowSet = false, act = 1;
  const rows = main.map(id => { const q = QUESTS[id], st = questStatus(id), d = st === 'done'; let cls = d ? 'done' : ''; if (!d && !nowSet) { cls = 'now'; nowSet = true; } const t = q.obj.map(o => objText(o)).join('; '); const head = (q.act || 1) !== act ? `<div class="sec">Act ${act = q.act || 1}${q.act === 2 ? ' · The Wolf and the Gate' : ''}</div>` : ''; return `${head}<div class="obj ${cls}"><span class="m">${d ? '✓' : cls === 'now' ? '▸' : '·'}</span><span>${esc(q.name)} <span class="muted">· ${esc(t)}</span></span></div>`; }).join('');
  const lore = Object.keys(LORE).filter(k => P.flags.lore[k]).map(k => `<p class="lore"><b>${LORE[k][0]}</b>${LORE[k][1]}</p>`).join('');
  const pt = Math.floor(P.playTime / 60);
  const path = classChain(P.cls).map(c => CLASSES[c].name).join(' → ');
  return `<div class="sec">Path</div><p class="muted" style="margin:0 0 4px">${esc(path)}</p>${rows}<div class="sec">Chronicle</div>${lore}<p class="muted" style="font-size:11.5px;margin:6px 0 0">Time in the Ash: ${Math.floor(pt / 60)}h ${pt % 60}m</p>`;
}
// Journal: achievements, titles and standing (round 4).
function journalAch() {
  const t = P.titles || [];
  let h = `<div class="sec">Title</div><div class="row" style="flex-wrap:wrap;gap:4px"><button class="btn ${!P.title ? 'on' : ''}" data-act="title:">None</button>${t.map(id => `<button class="btn ${P.title === id ? 'on' : ''}" data-act="title:${id}">${esc(TITLES[id])}</button>`).join('')}</div>`;
  if (!t.length) h += '<p class="muted" style="margin:4px 0 0;font-size:11.5px">Titles come from achievements and from the story. The one you choose is shown under your name.</p>';
  const reps = Object.keys(REP_NAMES).filter(f => repOf(f));
  if (reps.length) h += `<div class="sec">Standing</div>` + reps.map(f => `<div class="drow"><span>${esc(REP_NAMES[f].replace(/^the /, 'The '))}</span><b>${repOf(f) > 0 ? '+' : ''}${repOf(f)} · ${repOf(f) >= 5 ? 'Kin' : repOf(f) >= 3 ? 'Trusted' : repOf(f) >= 1 ? 'Friendly' : 'Wary'}</b></div>`).join('');
  const cats = [...new Set(ACHIEVEMENTS.map(a => a.cat))];
  for (const c of cats) {
    h += `<div class="sec">${esc(c)}</div>`;
    for (const a of ACHIEVEMENTS.filter(x => x.cat === c)) {
      const got = !!P.ach[a.id], pr = got ? null : achProgress(a);
      h += `<div class="obj ${got ? 'done' : ''}" style="${got ? '' : 'opacity:.85'}"><span class="m">${got ? '★' : '☆'}</span><span><b>${esc(a.name)}</b> <span class="muted">· ${esc(a.desc)}${a.title && TITLES[a.title] ? ` · title “${esc(TITLES[a.title])}”` : ''}</span>${pr ? ` <b class="qn">${fmt(Math.min(pr[0], pr[1]))}/${fmt(pr[1])}</b>` : ''}</span></div>`;
    }
  }
  return h;
}
// sellPrice(item) lives in js/core.js (round 5 economy pass).
const refineCost = i => Math.round((200 + ITEMS[i.id].lvl * 40) * ((i.refine || 0) + 1));
const refineChance = i => [100, 100, 100, 100, 60, 50, 40, 30, 20, 10][i.refine || 0];

function itemTooltip(it, fromShop) {
  const t = ITEMS[it.id], r = fromShop ? (t.unique ? 'unique' : t.type === 'card' ? 'card' : 'common') : rarityOf(it);
  let h = `<div class="tt-name r-${r}">${esc(fromShop ? t.name : itemName(it))}</div>`;
  if (t.type === 'equip') {
    const ib = itemBase(it);
    h += `<div class="tt-sub">${it.name && !fromShop ? t.name + ' · ' : ''}${t.slot === 'weapon' ? WNAME[t.wtype] : SLOTNAME[t.slot]}${r !== 'common' ? ' · ' + r : ''}${t.crafted ? ' · crafted' : ''}</div>`;
    if (t.slot === 'weapon') h += `<div class="tt-l">ATK ${ib.atk}${ib.matk ? ` · MATK ${ib.matk}` : ''}</div>`;
    else if (t.def || t.mdef) h += `<div class="tt-l">${t.def ? `DEF ${ib.def}` : ''}${t.def && t.mdef ? ' · ' : ''}${t.mdef ? `MDEF ${ib.mdef}` : ''}</div>`;
    if (it.q && QUALITY[it.q] && !fromShop) h += `<div class="tt-u">${QUALITY[it.q].name}${it.q > 1 ? ` (+${Math.round((QUALITY[it.q].mul - 1) * 100)} % base)` : ''}${it.maker ? ` · made by ${esc(it.maker)}` : ''}</div>`;
    for (const k in (t.bonus || {})) h += `<div class="${t.unique ? 'tt-u' : 'tt-l'}">${bonusLine(k, t.bonus[k])}</div>`;
    if (!fromShop) { for (const a of it.affixes || []) h += `<div class="tt-b">${bonusLine(a.s, a.v)}</div>`; for (const c of it.cards || []) h += `<div class="tt-c">✦ ${ITEMS[c].name}: ${Object.entries(ITEMS[c].bonus).map(([k, v]) => bonusLine(k, v)).join(', ')}</div>`; }
    const sN = fromShop ? t.slots : it.slotsN; if (sN) h += `<div class="tt-l">Slots ${'◆'.repeat(fromShop ? 0 : (it.cards || []).length)}${'◇'.repeat(sN - (fromShop ? 0 : (it.cards || []).length))}</div>`;
    h += `<div class="${P.lvl < t.lvl ? 'tt-bad' : 'muted'}">Requires Lv ${t.lvl}</div>`;
    h += `<div class="${jobOk(t, P.cls) ? 'muted' : 'tt-bad'}">${t.jobs === ALLJ || t.jobs.length === ALLJ.length ? 'All paths' : t.jobs.map(j => CLASSES[j].name).join(', ')}</div>`;
    if (t.lore) h += `<div class="tt-lore">${esc(t.lore)}</div>`;
    h += compareHTML(it, fromShop);
  } else {
    h += `<div class="tt-sub">${t.quest ? 'Quest item' : t.stone ? 'Upgrade stone' : t.rareMat ? 'Rare material' : { use: 'Consumable', etc: 'Material', card: 'Card', key: 'Rune-Shard' }[t.type]}</div>`;
    if (t.type === 'card') h += `<div class="tt-c">${Object.entries(t.bonus).map(([k, v]) => bonusLine(k, v)).join('<br>')}</div>`;
    if (t.desc) h += `<div class="tt-l" style="margin-top:3px">${esc(t.desc)}</div>`;
    if (t.type === 'etc' && !t.stone) { const n = Object.values(RECIPES).filter(rr => rr.mats.some(m => m[0] === it.id)).length; if (n) h += `<div class="muted">Used in ${n} recipe${n > 1 ? 's' : ''}.</div>`; }
    if (!fromShop && countItem(it.id) > (it.qty || 1)) h += `<div class="muted">${fmt(countItem(it.id))} in your bag</div>`;
  }
  if (!fromShop && it.lock) h += '<div class="muted">🔒 Locked: never sold as junk</div>';
  if (!fromShop && t.type !== 'key') h += `<div class="tt-p">Sells for ${fmt(sellPrice(it))}z${it.qty > 1 ? ` each · ${fmt(sellPrice(it) * it.qty)}z all` : ''}</div>`;
  return h;
}
// Compared with what you wear in that slot (round 5): every number that would change if you swapped.
function itemStatsMap(it) {
  const o = {}; if (!it) return o; const t = ITEMS[it.id], b = itemBase(it), add = (k, v) => { if (v) o[k] = (o[k] || 0) + v; };
  add('atk', b.atk); add('matk', b.matk); add('def', b.def); add('mdef', b.mdef);
  for (const k in t.bonus || {}) add(k, t.bonus[k]); for (const a of it.affixes || []) add(a.s, a.v); for (const c of it.cards || []) for (const k in ITEMS[c].bonus) add(k, ITEMS[c].bonus[k]);
  return o;
}
function compareHTML(it, fromShop) {
  const t = ITEMS[it.id], cur = P.equip[t.slot]; if (cur === it || (!fromShop && SLOTS.some(sl => P.equip[sl] === it))) return '';
  const probe = fromShop ? { id: it.id, rarity: 'common', affixes: [], refine: 0, cards: [] } : it;
  const A = itemStatsMap(probe), B = itemStatsMap(cur), keys = [...new Set([...Object.keys(A), ...Object.keys(B)])], rows = [];
  for (const k of keys) { const d = (A[k] || 0) - (B[k] || 0); if (!d) continue; rows.push(`<span class="${d > 0 ? 'cmp-up' : 'cmp-dn'}">${d > 0 ? '▲' : '▼'} ${bonusLine(k, Math.abs(d)).replace(/^\+/, d > 0 ? '+' : '−')}</span>`); }
  const head = cur ? `vs. ${esc(itemName(cur))}` : `vs. empty ${SLOTNAME[t.slot].toLowerCase()} slot`;
  return `<div class="tt-cmp"><div class="muted">${head}</div>${rows.length ? rows.join('<br>') : '<span class="muted">No difference.</span>'}</div>`;
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
  if (k === 'sitem') { const it = storageFind(+v); return it ? itemTooltip(it) : null; }
  if (k === 'mail') { const m = P.mail && P.mail[+v]; return m ? itemTooltip(m.item) : null; }
  if (k === 'shop') return itemTooltip({ id: v }, true);
  if (k === 'skill') return skillTooltip(v);
  if (k === 'wm') { const d = MAPDEFS[v]; if (!d) return null; const ms = [...new Set(d.spawns.map(s => s[0]))].map(id => MOBS[id].name); return `<div class="tt-name">${esc(d.name)}</div><div class="tt-l">${esc(d.lv ? `Base Lv ${d.lv[0]} – ${d.lv[1]}` : d.sub)}${P.flags.seen[v] && ms.length ? '<br>' + esc(ms.join(', ')) : ''}${P.flags.seen[v] && d.boss && MOBS[d.boss] ? `<br>MVP: ${esc(MOBS[d.boss].name)}${P.flags.bosses[d.boss] ? ' (slain)' : ''}` : ''}</div><div class="muted">${P.kindled[v] ? 'Waystone kindled' : genMap(v).way ? 'Waystone not kindled' : ''}</div>`; }
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
    case 'buy': vendorBuy(VENDORS[UI.shopBy] ? UI.shopBy : 'brokkr', b, +c || 1); break;
    case 'sell': case 'sellall': { const it = findItem(+b); if (!it || P.inv.indexOf(it) < 0 || it.lock) break; const n = a === 'sellall' ? it.qty : 1; const v = sellPrice(it) * (it.qty ? n : 1); P.zeny += v; if (it.qty) takeItem(it.id, n); else P.inv.splice(P.inv.indexOf(it), 1); for (let i = 0; i < 9; i++) { const h = P.hot[i]; if (h && h.k === 'item' && h.id === it.id && countItem(it.id) === 0 && ITEMS[it.id].type === 'etc') P.hot[i] = null; } Sfx.coin(); break; }
    case 'sellmats': sellJunk({ mats: true }); break;
    case 'selljunk': if (UI.junkArm) { UI.junkArm = false; sellJunk(UI.junk || JUNK_DEFAULT); } else UI.junkArm = true; break;
    case 'junkopt': { UI.junk = UI.junk || Object.assign({}, JUNK_DEFAULT); UI.junk[b] = !UI.junk[b]; UI.junkArm = false; break; }
    case 'lock': { const it = findItem(+b) || storageFind(+b); if (it) { it.lock = !it.lock || undefined; if (!it.lock) delete it.lock; } UI.junkArm = false; break; }
    case 'invtab': UI.invTab = b; break;
    case 'sortbag': sortBag(); break;
    case 'rstone': UI.refineStone = b || null; UI.refineArm = null; break;
    case 'craftopen': UI.craftBy = b; openWin('craft'); break;
    case 'ccat': UI.craftCat = b; break;
    case 'csel': UI.craftSel = b; break;
    case 'craft': { const n = +c || 1; for (let i = 0; i < n; i++) { if (craftWhy(RECIPES[b], craftStation())) { if (!i) craft(b, craftStation()); break; } craft(b, craftStation()); } break; }
    case 'sttab': UI.stTab = b; break;
    case 'dp': storageDeposit(+b, e && e.shiftKey ? 1 : 0); break;
    case 'wd': storageWithdraw(+b, e && e.shiftKey ? 1 : 0); break;
    case 'dpmats': storageDepositMats(); break;
    case 'mail': mailClaim(+b); break;
    case 'mailall': mailClaimAll(); break;
    case 'esel': UI.enchSel = +b; break;
    case 'erare': UI.enchRare = !UI.enchRare; break;
    case 'enchant': enchant(+b, !!UI.enchRare && !!enchantTier(findItem(+b) || { id: 'knife' }).rare); break;
    case 'cardrm': { const k = b + ':' + c; if (UI.cardArm !== k) { UI.cardArm = k; break; } UI.cardArm = null; cardRemove(+b, +c); break; }
    case 'refine': { const it = findItem(+b); if (!it) break; const ch = refineChanceWith(it, UI.refineStone); if (ch < 100 && UI.refineArm !== it.uid) { UI.refineArm = it.uid; break; } UI.refineArm = null; doRefine(it, UI.refineStone); break; }
    case 'rest': rest(); break;
    case 'jtab': UI.jTab = b; UI.abandonArm = null; break;
    case 'title': P.title = b && (P.titles || []).includes(b) ? b : null; break;
    case 'qtrack': P.quests.track = P.quests.track === b ? null : b; break;
    case 'qabandon': if (UI.abandonArm === b) { UI.abandonArm = null; questAbandon(b); } else UI.abandonArm = b; break;
    case 'travel': travelTo(b); break;
    case 'worldmap': openWin('worldmap'); break;
    case 'wipe': UI.wipeArm = true; break;
    case 'ctrl': setCtrlMode(b); break;
    case 'wipe2': store('aom-save', null); location.reload(); break;
  }
  UI.dirty = true;
}
// Upgrade stones (round 5): stone.chance adds to the odds; stone.ward turns a shattering failure into -1 refine.
function refineChanceWith(it, stoneId) { const st = stoneId && countItem(stoneId) && ITEMS[stoneId].stone; return Math.min(100, refineChance(it) + (st && st.chance || 0)); }
function doRefine(it, stoneId) {
  const cost = refineCost(it); if (P.zeny < cost || (it.refine || 0) >= 10) return;
  const st = stoneId && countItem(stoneId) && refineChance(it) < 100 ? ITEMS[stoneId].stone : null;   // stones are only spent where a refine can fail
  P.zeny -= cost; const ch = refineChanceWith(it, st ? stoneId : null); if (st) { takeItem(stoneId, 1); log(`You work the ${ITEMS[stoneId].name} into the metal.`, 'sys'); }
  const an = map.objs.find(o => o.kind === 'anvil') || P, smith = UI.shopBy === 'sindri' ? 'Sindri' : 'Brokkr';
  if (Math.random() * 100 < ch) { it.refine = (it.refine || 0) + 1; log(`${smith}’s hammer rings true. ${itemName(it)}.`, 'lvl'); Sfx.level(); burst(an.x, an.y, 20, '#ffd27a', 20, 2.5); }
  else if (st && st.ward) { it.refine = Math.max(0, (it.refine || 0) - 1); log(`The ward-rune flares and takes the blow. ${itemName(it)} survives, one level weaker.`, 'warn'); Sfx.slam(); burst(an.x, an.y, 20, '#9ad0ff', 20, 2.5); }
  else {
    const name = itemName(it);
    for (const s of SLOTS) if (P.equip[s] === it) P.equip[s] = null;
    const i = P.inv.indexOf(it); if (i >= 0) P.inv.splice(i, 1);
    log(`The metal screams and shatters. ${name} is gone.`, 'bad'); Sfx.slam(); burst(an.x, an.y, 20, '#888', 26, 3);
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
  if (CINE.busy) return;
  talkNPC = n;
  try {
    if (n.escort) { const D = NPCS[n.id] || {}; await say(n.name, [D.escortLine || 'Lead on. I am right behind you.']); return; }
    const beat = storyBeatFor(n.id);
    if (beat) { await playBeat(beat, n); return; }
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
  $('bEnd').onclick = () => { el.hidden = true; log(kind === 'embers' ? 'The Tree breathes. The Ash is still out there, and so are you.' : 'The crown sits warm on your brow. The Ash is yours now.', 'lvl'); log('But the dead are still getting up. Past the Heart, on the broken Bifrost, something is still howling.', 'quest'); questRefresh(); };
  Sfx.victory();
}

// Act II epilogue: the fate of the wolf, told through the age you chose at the Heart.
function epilogueAct2(fate) {
  const el = $('ending'); el.hidden = false; const emb = P.flags.ending !== 'ash';
  const T = fate === 'bound' ? ['The Wolf Bound', 'Gleipnir closes around the wolf like a held breath. It is lighter than silk and it will never break, because nothing it is made of exists.', emb ? 'Heimdall stays at his post. Below him the relit Tree grows another root toward the broken bridge, and some mornings the wolf watches it, and does not howl.' : (P.flags.court === 'rest' ? 'The Ash keeps its distance from the island, because you told it to. The wolf does not seem to mind the quiet.' : 'The dead of the Cinder Court stand guard on the island in their ranks. They answer to you. So, now, does the chain.'), 'In Emberhold the old man with one eye sleeps through a whole night for the first time since the end of the world.']
    : ['The Wolf Freed', 'You cut the last of Hel’s stitches, and Fenrir stands up out of his borrowed body as something that was never quite a wolf. He looks at you for a long time. Then he runs.', 'He runs up the sky, past the broken bridge, to where the dead sun hangs, and he eats it, because that is what he was made for. The dark lasts one breath.', emb ? 'Then a new sun rises, small and young and fierce, and the relit Tree turns every leaf it has toward her.' : 'Then a new sun rises, pale and obedient. The Ash turns its face to her because you tell it to.'];
  el.innerHTML = `<div class="e-in"><h2>${T[0]}</h2>${T.slice(1).map(p => `<p>${p}</p>`).join('')}<p class="muted" style="font-size:13px;margin-top:22px">Act II complete · ${esc(P.name)} · ${CLASSES[P.cls].name} · Base Lv ${P.lvl}${P.title && TITLES[P.title] ? ' · ' + esc(TITLES[P.title]) : ''}</p><button class="btn big" id="bEnd2" style="margin-top:12px">Continue wandering</button></div>`;
  $('bEnd2').onclick = () => { el.hidden = true; log('The saga is sung. The Ash is still out there, and so are you. The echoes of old foes gather at the Hunter’s Board in Emberhold every week.', 'lvl'); };
  Sfx.victory();
}

/* =========================================================
   Cinematic scenes (round 4). Scenes are async scripts in SCENES (js/data/npcs.js); quests start them through
   `scene` objectives and STORY_TALK beats. While one plays: letterbox bars, the camera frames the speaker and
   the player (read-only use of `cam` through the updateCamera wrapper below), monsters freeze and you cannot be hit.
     line(who, pages, zoom)   who = NPC id (on this map), an actor, or { x, y, name } ; ask(who, html, options)
     actor(id, x, y, o)       a temporary NPC for the scene (NPCS[id].look); o.keep leaves it on the map
     cineFocus(target, zoom)  frame any { x, y }
   ========================================================= */
const CINE = { active: false, busy: false, focus: null, zoom: 0.82, base: null, actors: [] };
function cineStart() { CINE.active = true; if (CINE.base === null) CINE.base = cam.dist; $('game').classList.add('cine'); }
function cineEnd() {
  CINE.active = false; CINE.focus = null;
  for (const a of CINE.actors) if (!a.keep && map) { const i = map.npcs.indexOf(a); if (i >= 0) map.npcs.splice(i, 1); }
  CINE.actors = []; $('game').classList.remove('cine'); talkNPC = null;
}
function cineFocus(t, zoom) { CINE.focus = t || null; CINE.zoom = zoom || 0.82; }
function speakerOf(who) { if (!who) return null; if (typeof who === 'object') return who; return (map && (CINE.actors.find(n => n.id === who) || map.npcs.find(n => n.id === who && !n.escort))) || null; }
function speakerName(who) { if (typeof who === 'object') return who.dname || who.name || ''; const D = NPCS[who]; return D ? (D.dnameFn ? D.dnameFn() : D.dname || npcName(who)) : who; }
async function line(who, pages, zoom) { const e = speakerOf(who); if (e) { cineFocus(e, zoom); talkNPC = e; } await say(speakerName(who), [].concat(pages)); talkNPC = null; }
async function ask(who, html, opts) { const e = speakerOf(who); if (e) { cineFocus(e); talkNPC = e; } const r = await dialog(speakerName(who), html, opts); $('dialog').hidden = true; talkNPC = null; return r; }
function actor(id, x, y, o = {}) {
  const D = NPCS[id] || {}, s = map ? nearestOpen(x, y, 3) : null;
  const a = { id, name: o.name || npcName(id), title: D.title, x: s ? s.x + 0.5 : x, y: s ? s.y + 0.5 : y, dir: o.dir || 1, look: o.look || D.look, actor: true, keep: !!o.keep };
  if (map) map.npcs.push(a); CINE.actors.push(a); burst(a.x, a.y, 20, o.col || '#fff2b8', 16, 2); pillar({ x: a.x, y: a.y, kind: 'fx' }, o.col || '#fff2b8'); return a;
}
// Resolves true when the scene played (false when another scene is already running).
async function playScene(sc, ctx = {}) {
  if (CINE.busy) return false;
  const fn = typeof sc === 'function' ? sc : SCENES[sc]; if (!fn) { console.error('Unknown scene ' + sc); return false; }
  CINE.busy = true; cineStart(); P.path = null; P.target = null; P.pending = null;
  try { await fn(ctx); } catch (e) { console.error(e); } finally { $('dialog').hidden = true; cineEnd(); CINE.busy = false; UI.dirty = true; }
  return true;
}
// Letterbox bars, eased in and out, drawn on the 2D overlay (so screenshots show them too).
function drawCineBars(dt) {
  const want = CINE.active ? 1 : 0; CINE.bar = (CINE.bar || 0) + (want - (CINE.bar || 0)) * Math.min(1, (dt || 0.016) * 7);
  if (CINE.bar < 0.01) return;
  const h = Math.round(H * 0.085 * CINE.bar); ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.fillStyle = '#05060a'; ctx.fillRect(0, 0, W, h); ctx.fillRect(0, H - h, W, h);
}
// Camera: while a scene has a focus, updateCamera (js/gfx-world.js) follows a point between you and the speaker instead
// of you, and the distance eases in; afterwards it eases back. Nothing in the graphics files is changed.
if (typeof updateCamera === 'function') {
  const baseCam = updateCamera;
  // eslint-disable-next-line no-global-assign
  updateCamera = function (dt) {
    const f = CINE.active && CINE.focus, back = !CINE.active && CINE.base !== null;
    if (!f && !back && !CINE.active) return baseCam(dt);
    if (CINE.base !== null) { const want = CINE.active ? CINE.base * CINE.zoom : CINE.base, k = 1 - Math.pow(0.05, dt || 0.016); cam.dist += (want - cam.dist) * k; if (back && Math.abs(cam.dist - CINE.base) < 0.05) { cam.dist = CINE.base; CINE.base = null; } }
    if (!f || !P) return baseCam(dt);
    const px = P.x, py = P.y; P.x = px + (f.x - px) * 0.65; P.y = py + (f.y - py) * 0.65;
    try { baseCam(dt); } finally { P.x = px; P.y = py; }
  };
}

/* =========================================================
   UI: quests (tracker, toasts, NPC markers)
   ========================================================= */
const QUEST_UI = { markers: true, boards: true, boardLabels: true, helgate: true }; // the renderer may set these false once it draws them itself
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
@media (max-width:760px){#qtrack{top:calc(160px + env(safe-area-inset-top,0px));width:160px;font-size:10.5px}}
#game.cine #qtrack,#game.cine #tip,#game.cine #hotbar,#game.cine #buffs{opacity:0;transition:opacity .3s}
#w-inv .lk,#w-storage .lk{position:absolute;left:1px;top:0;font-size:9px}
.tabs .btn.on .muted{color:#dfe8ff}
.inv-tabs{flex-wrap:wrap}.inv-tabs .btn{padding:2px 6px;font-size:10.5px}
.st-grid{max-height:236px;overflow:auto}
.craft{display:grid;grid-template-columns:minmax(170px,44%) 1fr;gap:8px;align-items:start}
.clist{max-height:340px;overflow:auto;padding-right:2px}
.crow{width:100%;text-align:left;font:12px var(--ui);color:var(--ink);cursor:pointer}
.crow.sel{border-color:#e0a040;box-shadow:0 0 0 1px #f0c070;background:#fffaf0}
.crow .ok{color:var(--good);font-weight:800}
.cdet{background:#fff;border:1px solid #c4cde0;border-radius:3px;padding:6px 8px;min-height:120px}
.cprev{border-bottom:1px solid #d4dbe8;padding-bottom:4px;margin-bottom:2px;font-size:11.5px;line-height:1.4}
.mat{display:grid;grid-template-columns:22px 1fr auto;gap:6px;align-items:center;height:24px}
.mat img{width:20px;height:20px}.mat.ok b{color:var(--good)}.mat.no b{color:var(--bad)}
.odds{display:flex;flex-wrap:wrap;gap:4px 10px;font-size:11.5px;background:#fff;border:1px solid #c4cde0;border-radius:3px;padding:5px 7px}
.odds .good{color:var(--good);font-weight:800}.odds .bad{color:var(--bad)}
.junk{background:#fff;border:1px solid #c4cde0;border-radius:3px;padding:6px 7px;margin-bottom:8px}
.junk .btn{font-size:10.5px;padding:2px 6px}
.btn.lock{padding:2px 4px;font-size:10px}
.tt-cmp{margin-top:5px;padding-top:4px;border-top:1px dashed #c4cde0}
.cmp-up{color:var(--good);font-weight:700}.cmp-dn{color:var(--bad);font-weight:700}
@media (max-width:760px){.craft{grid-template-columns:1fr}.clist{max-height:180px}}
#ptitle{display:block;font-size:10.5px;font-weight:700;color:#b07d00;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pnc{display:flex;flex-direction:column;min-width:0}`;
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
  const rows = questObjectives(id).map(o => `<div class="o ${o.done ? 'done' : o.open ? '' : 'lock'}"><span class="m">${o.done ? '✓' : '▸'}</span><span>${esc(o.text)}${o.live ? ` <i style="color:#b0402a">${esc(o.live)}</i>` : ''}</span><b>${o.counted ? `${o.cur}/${o.max}` : ''}</b></div>`).join('');
  const html = `<div class="rtb">Quest</div><div class="rbd"><div class="qt">${esc(q.name)}</div>${rows}${ready && ti ? `<div class="rd">Return to ${esc(questGiverName(ti))}</div>` : ''}</div>`;
  if (cache.qtrack !== html) { cache.qtrack = html; el.innerHTML = html; }
  el.hidden = false;
}
/* Per-frame overlay helpers (perf round 2): projected points come from a ring of reused arrays (pj), ground loops
   reuse one point list, quest markers and sphere glows are pre-rendered canvases. proj(x, y, z, out) fills `out`
   when gfx-world.js supports it and returns a fresh array otherwise; both work. */
const PJ_RING = []; let PJ_I = 0;
function pj(x, y, z) { const o = PJ_RING[PJ_I] || (PJ_RING[PJ_I] = [0, 0, 0]); PJ_I = (PJ_I + 1) & 63; return proj(x, y, z, o); }
const GL_PTS = [], QMARK_CACHE = {}, SPHERE_GLOW = {};
function sphereGlow(r) { let c = SPHERE_GLOW[r]; if (c) return c; c = document.createElement('canvas'); c.width = c.height = r * 2; const g = c.getContext('2d'), gr = g.createRadialGradient(r, r, 0, r, r, r); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.3, '#9fd0ff'); gr.addColorStop(1, 'rgba(90,150,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(r, r, r, 0, 7); g.fill(); c.r = r; return (SPHERE_GLOW[r] = c); }
// Bounty boards have no mesh yet: draw a small notice board in the overlay (QUEST_UI.boards = false to disable).
function drawBoardProp(o, sc) {
  const gh = groundH(o.x, o.y), b = pj(o.x, o.y, gh), t = pj(o.x, o.y, gh + 1.7); if (b[2] > 1) return;
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
  const s = Math.max(1, Math.round(17 * sc)), bob = Math.sin(time * 3.2) * 3 * sc;
  const key = mark + '|' + kind + '|' + s; let c = QMARK_CACHE[key];
  if (!c) {   // pre-rendered once per (mark, kind, size): no gradients or text layout per frame
    const col = kind === 'daily' ? ['#bfe6ff', '#3a8ae0'] : kind === 'weekly' ? ['#f0d0ff', '#9a4ae0'] : kind === 'main' ? ['#fff4b0', '#f0a020'] : ['#fff0a0', '#e8b020'];
    const D = Math.ceil(s * 3), h = D / 2, sc2 = s / 17; c = document.createElement('canvas'); c.width = c.height = D * DPR; const g = c.getContext('2d'); g.scale(DPR, DPR);
    g.font = `900 ${Math.round(s * 1.5)}px ${typeof UIFONT !== 'undefined' ? UIFONT : 'sans-serif'}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const rg = g.createRadialGradient(h, h, 0, h, h, s * 1.2); rg.addColorStop(0, rgba(col[1], 0.45)); rg.addColorStop(1, rgba(col[1], 0)); g.fillStyle = rg; g.beginPath(); g.arc(h, h, s * 1.2, 0, 7); g.fill();
    g.lineJoin = 'round'; g.lineWidth = 5 * sc2; g.strokeStyle = '#1a1008'; g.strokeText(mark, h, h);
    const gr = g.createLinearGradient(0, h - s * 0.6, 0, h + s * 0.6); gr.addColorStop(0, col[0]); gr.addColorStop(1, col[1]); g.fillStyle = gr; g.fillText(mark, h, h);
    c.half = h; QMARK_CACHE[key] = c;
  }
  ctx.drawImage(c, x - c.half, y + bob - c.half, c.half * 2, c.half * 2);
}
function drawQuestOverlay() {
  if (!started || !map || !P || typeof proj !== 'function' || typeof PPU === 'undefined') return;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const sc = clamp(PPU / 34, 0.75, 1.5), boards = map.objs.filter(o => o.kind === 'board');
  // The placeholder board prop goes when the renderer draws its own (QUEST_UI.boards = false); the name label stays
  // unless QUEST_UI.boardLabels = false.
  for (const o of boards) {
    if (QUEST_UI.boards) drawBoardProp(o, sc);
    if (QUEST_UI.boardLabels !== false && typeof label === 'function') { const a = pj(o.x, o.y, groundH(o.x, o.y)); if (a[2] < 1) label(o.name, a[0], a[1] + 17 * sc, '#ffd8a8', 11.5); }
  }
  drawQuestSpots(sc);
  if (!QUEST_UI.markers) return;
  for (const e of [...map.npcs, ...boards]) {
    if (e.actor || e.escort) continue; // scene actors and escorted NPCs carry no quest marks
    if (!(e._qmT > time - 0.25) || e._qmT > time) { e._qm = questMarkerInfo(e); e._qmT = time; } // re-evaluated 4x per second
    const info = e._qm; if (!info) continue;
    const hh = e.board ? 1.95 : headH(e) + 0.45, a = pj(e.x, e.y, groundH(e.x, e.y) + hh); if (a[2] > 1) continue;
    drawQuestMarker(a[0], a[1] - 10 * sc, info.mark, info.kind, sc);
  }
}
// Round 4: investigation spots (a bobbing "?" and a glint), hunt / defence / destination rings, Hel's gate (no mesh yet:
// QUEST_UI.helgate = false once the renderer draws `helgate` objects), and your title under your feet.
function drawQuestSpots(sc) {
  for (const s of questSpots()) {
    const gh = groundH(s.x, s.y), pulse = 0.5 + 0.5 * Math.sin(time * 3 + s.x);
    if (s.kind === 'inspect') {
      const a = pj(s.x, s.y, gh + 1.1 + Math.sin(time * 2.6 + s.y) * 0.12); if (a[2] > 1) continue;
      strokeLoop(groundLoop(s.x, s.y, 0.55, 14), rgba('#ffe8a0', 0.12 + 0.1 * pulse), rgba('#ffe8a0', 0.7), 1.5 * sc, [3, 4]);
      drawQuestMarker(a[0], a[1], '?', 'side', sc * 0.75);
      if (Math.random() < 0.08) parts.push({ x: s.x + rand(-0.3, 0.3), y: s.y + rand(-0.3, 0.3), z: 4, vx: 0, vy: 0, vz: 30, life: 0.9, max: 0.9, col: '#fff2b8', size: 2.5, float: true });
    } else if (s.kind === 'escort' || s.kind === 'reach' || s.kind === 'scene') strokeLoop(groundLoop(s.x, s.y, 1.2 + 0.1 * pulse, 20), rgba('#9ae0ff', 0.08), rgba('#9ae0ff', 0.55), 1.6 * sc, [6, 6]);
    else if (s.kind === 'waves' || s.kind === 'survive') strokeLoop(groundLoop(s.x, s.y, 2.2, 28), rgba('#ff9a5a', 0.06), rgba('#ffb070', 0.5 + 0.2 * pulse), 1.8 * sc, [8, 6]);
  }
  if (QUEST_UI.helgate) for (const o of map.objs) if (o.kind === 'helgate') {
    const open = !!(P.flags.act2 && !P.flags.gateShut), r = open ? 1.5 : 1.1, rot = time * (open ? 0.8 : 0.2);
    strokeLoop(groundLoop(o.x, o.y, r, 30), rgba('#3a1a3a', 0.45), rgba(open ? '#7aff9a' : '#8a7a9a', 0.7), 2.2 * sc, [5, 4]);
    const pts = []; for (let i = 0; i < 16; i++) { const a = rot + i / 16 * 6.2832, rr = r * (0.35 + 0.3 * ((i % 2))); const px = o.x + Math.cos(a) * rr, py = o.y + Math.sin(a) * rr; pts.push(pj(px, py, groundH(px, py) + 0.05)); }
    strokeLoop(pts, null, rgba(open ? '#b0ffc0' : '#a898b8', 0.45), 1.2 * sc, [2, 5]);
    if (open && Math.random() < 0.25) parts.push({ x: o.x + rand(-r, r) * 0.6, y: o.y + rand(-r, r) * 0.6, z: 2, vx: 0, vy: 0, vz: rand(18, 40), life: 1.2, max: 1.2, col: '#8aff9a', size: 3, float: true });
    runeAt(o.x, o.y, 0.1, 'ᚺ', open ? '#b0ffc0' : '#a898b8', 20 * sc);
  }
  if (P.title && TITLES[P.title] && !P.dead && typeof label === 'function') { const a = pj(P.x, P.y, groundH(P.x, P.y)); if (a[2] < 1) label('« ' + TITLES[P.title] + ' »', a[0], a[1] + 16 * sc, '#ffd070', 10.5); }
}
/* Second-class skill feedback drawn on the 2D overlay: ground zones and traps, song/oath auras, the Kyrie
   bubble, spirit spheres, and status marks on monsters. Deliberately simple shapes; the graphics team can
   replace any of it with meshes (data: zones[], P.buffs[*].aura, P.spheres, m.snare/slow/mark/dispel/lex). */
function groundLoop(x, y, r, n) { const pts = GL_PTS; pts.length = 0; for (let i = 0; i < n; i++) { const a = i / n * 6.2832, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; pts.push(pj(px, py, groundH(px, py) + 0.06)); } return pts; }
function strokeLoop(pts, fill, stroke, lw, dash) {
  if (pts.some(p => p[2] > 1)) return false;
  ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.setLineDash(dash || []); ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); ctx.setLineDash([]); }
  return true;
}
function runeAt(x, y, h, txt, col, px) { const a = pj(x, y, groundH(x, y) + h); if (a[2] > 1) return; ctx.font = `${px}px 'Noto Sans Runic', 'Segoe UI Historic', sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,6,4,.7)'; ctx.strokeText(txt, a[0], a[1]); ctx.fillStyle = col; ctx.fillText(txt, a[0], a[1]); ctx.textBaseline = 'alphabetic'; }
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
    if (z.hostile) { // enemy hex: a boiling purple pool with a spiked rim
      const r = z.r * (0.95 + 0.05 * pulse);
      strokeLoop(groundLoop(z.x, z.y, r, 28), rgba(z.col, 0.24 * life), rgba(z.col, 0.9 * life), 2.6 * sc, [3, 4]);
      strokeLoop(groundLoop(z.x, z.y, r * 0.62, 20), null, rgba('#e0b0ff', 0.45 * life), 1.2 * sc, [2, 6]);
      if (Math.random() < 0.35) parts.push({ x: z.x + rand(-r, r) * 0.7, y: z.y + rand(-r, r) * 0.7, z: 2, vx: 0, vy: 0, vz: rand(20, 45), life: 0.7, max: 0.7, col: z.col, size: 3, float: true });
      if (z.rune) runeAt(z.x, z.y, 0.15, z.rune, '#e8c8ff', 22 * sc);
      continue;
    }
    const r = z.r * (z.kind === 'storm' ? 1 : 0.97 + 0.03 * pulse);
    strokeLoop(groundLoop(z.x, z.y, r, 28), rgba(z.col, (z.ward ? 0.1 : 0.16) * life), rgba(z.col, 0.75 * life), (z.ward ? 1.6 : 2.2) * sc, z.ward ? [8, 6] : null);
    if (z.kind === 'storm' || z.kind === 'quagmire') { const rot = time * (z.kind === 'storm' ? 2.4 : 0.4); for (let k = 1; k <= 2; k++) { const rr = r * k / 3; const pts = []; for (let i = 0; i < 14; i++) { const a = rot * (k % 2 ? 1 : -1) + i / 14 * 6.2832, px = z.x + Math.cos(a) * rr, py = z.y + Math.sin(a) * rr; pts.push(pj(px, py, groundH(px, py) + 0.08)); } strokeLoop(pts, null, rgba(z.col, 0.45 * life), 1.2 * sc, [6, 8]); } }
    if (z.rune) runeAt(z.x, z.y, 0.15, z.rune, z.col, 22 * sc);
  }
  // Boss cones and rolling lines: the circle telegraphs are drawn by the renderer; add the exact outline once per cast.
  const shapes = new Set();
  for (const t of teles) if (t.shape && (t.shape.kind === 'cone' || t.shape.kind === 'lines') && !t.m.dead) shapes.add(t.grp);
  for (const g of shapes) {
    const s = g.shape, gp = (x, y) => pj(x, y, groundH(x, y) + 0.07), k = 0.5 + 0.5 * Math.sin(time * 14);
    if (s.kind === 'cone') {
      const pts = [gp(s.x, s.y)]; for (let i = 0; i <= 12; i++) { const a = s.ang - s.half + 2 * s.half * i / 12; pts.push(gp(s.x + Math.cos(a) * s.len, s.y + Math.sin(a) * s.len)); }
      strokeLoop(pts, `rgba(255,90,30,${0.1 + 0.05 * k})`, `rgba(255,190,90,${0.6 + 0.3 * k})`, 2 * sc, [7, 5]);
    } else {
      for (let j = 0; j < s.n; j++) {
        const a = s.ang + (s.n > 1 ? (j - (s.n - 1) / 2) * s.spread : 0), ux = Math.cos(a), uy = Math.sin(a), px = -uy * s.w / 2, py = ux * s.w / 2, x0 = s.x + ux * 0.8, y0 = s.y + uy * 0.8, x1 = s.x + ux * s.len, y1 = s.y + uy * s.len;
        strokeLoop([gp(x0 + px, y0 + py), gp(x1 + px, y1 + py), gp(x1 - px, y1 - py), gp(x0 - px, y0 - py)], `rgba(140,200,255,${0.08 + 0.05 * k})`, `rgba(190,230,255,${0.55 + 0.3 * k})`, 1.8 * sc, [6, 5]);
      }
    }
  }
  // Auras (songs, Oath of Tyr, Magic Rod) and the Kyrie bubble
  for (const k in P.buffs) {
    const au = P.buffs[k].aura; if (!au) continue;
    if (au.bubble) { const a = pj(P.x, P.y, chestH(P)), rr = au.r * PPU; if (a[2] > 1) continue; const g = ctx.createRadialGradient(a[0], a[1], rr * 0.6, a[0], a[1], rr); g.addColorStop(0, rgba(au.col, 0)); g.addColorStop(0.85, rgba(au.col, 0.22)); g.addColorStop(1, rgba(au.col, 0.55)); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(a[0], a[1], rr, rr * 1.15, 0, 0, 7); ctx.fill(); continue; }
    const rr = au.r * (0.94 + 0.06 * Math.sin(time * 4)); strokeLoop(groundLoop(P.x, P.y, rr, 24), rgba(au.col, 0.1), rgba(au.col, 0.7), 1.8 * sc, P.buffs[k].song ? [4, 5] : null);
    if (P.buffs[k].song && Math.random() < 0.08) parts.push({ x: P.x + rand(-rr, rr), y: P.y + rand(-rr, rr), z: 4, vx: 0, vy: 0, vz: 35, life: 1.1, max: 1.1, col: au.col, size: 3, float: true });
  }
  // Spirit spheres orbit the monk
  if (P.spheres > 0 && !P.dead) {
    const gh = groundH(P.x, P.y), hh = typeof headH === 'function' ? headH(P) * 0.75 : 1.2;
    for (let i = 0; i < P.spheres; i++) {
      const a = time * 2.2 + i / P.spheres * 6.2832, q = pj(P.x + Math.cos(a) * 0.62, P.y + Math.sin(a) * 0.62, gh + hh + Math.sin(time * 3 + i) * 0.08); if (q[2] > 1) continue;
      const rr = 5.5 * sc, gc = sphereGlow(Math.round(rr * 2)); ctx.drawImage(gc, q[0] - gc.r, q[1] - gc.r, gc.r * 2, gc.r * 2);
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
  render = function (dt) { baseRender(dt); try { drawSkillOverlay(); } catch (e) { console.error(e); } try { drawQuestOverlay(); } catch (e) { console.error(e); } try { drawCineBars(dt); } catch (e) { console.error(e); } };
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
  if (k === ',' || (k === 'w' && !isAction())) { toggleWin('worldmap'); return; }
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
const SAVE_KEYS = ['name', 'hair', 'gender', 'hairStyle', 'cls', 'lvl', 'exp', 'jlvl', 'jexp', 'statPts', 'skillPts', 'st', 'skills', 'hp', 'sp', 'zeny', 'inv', 'equip', 'hot', 'map', 'x', 'y', 'lastWay', 'kindled', 'flags', 'lostZeny', 'playTime', 'quests', 'titles', 'title', 'ach', 'storage', 'mail'];
function serialize() { if (!P) return null; const o = {}; for (const k of SAVE_KEYS) o[k] = P[k]; o.uidc = uidc; o.v = 1; return JSON.stringify(o); }
function saveGame() { if (!started || !P) return; const s = serialize(); if (s) store('aom-save', s); }
function loadSave() { const raw = store('aom-save'); if (!raw) return null; try { return JSON.parse(raw); } catch (e) { return null; } }
let questMigrate = false;
function applySave(o) {
  P = Object.assign(newPlayer(o.name, o.hair), o); uidc = Math.max(uidc, o.uidc || 1);
  P.flags = Object.assign({ shards: {}, bosses: {}, lore: { ash: true }, tips: {}, talked: {} }, P.flags);
  for (const k of ['shards', 'bosses', 'lore', 'tips', 'talked', 'seen']) P.flags[k] = P.flags[k] || {};
  for (const k in P.kindled || {}) P.flags.seen[k] = true; if (P.map) P.flags.seen[P.map] = true; // saves from before the World Map
  P.quests = questNorm(o.quests); questMigrate = !o.quests; // saves from before the quest system: story quests are caught up without rewards
  // Round 4: titles, achievements, counters and standing. Older saves start empty; cards you already own count.
  for (const k of ['kills', 'cards', 'rep', 'variants']) P.flags[k] = P.flags[k] && typeof P.flags[k] === 'object' ? P.flags[k] : {};
  P.flags.deaths = +P.flags.deaths || 0;
  P.titles = Array.isArray(o.titles) ? o.titles.filter(t => TITLES[t]) : [];
  P.title = P.titles.includes(o.title) ? o.title : null;
  P.ach = o.ach && typeof o.ach === 'object' ? o.ach : {};
  for (const it of P.inv) if (ITEMS[it.id] && ITEMS[it.id].type === 'card' && ITEMS[it.id].mob) P.flags.cards[ITEMS[it.id].mob] = true;
  for (const it of [...P.inv, ...SLOTS.map(sl => P.equip[sl])]) for (const c of (it && it.cards) || []) if (ITEMS[c] && ITEMS[c].mob) P.flags.cards[ITEMS[c].mob] = true;
  // Round 5: storage and mailbox (older saves start empty); stacks bigger than STACK_MAX are split where there is room.
  P.storage = Array.isArray(o.storage) ? o.storage.filter(it => it && ITEMS[it.id]) : [];
  P.mail = Array.isArray(o.mail) ? o.mail.filter(m => m && m.item && ITEMS[m.item.id]) : [];
  P.inv = P.inv.filter(it => it && ITEMS[it.id]);
  for (const list of [P.inv, P.storage]) for (let i = 0; i < list.length; i++) { const it = list[i]; if (stackable(it.id) && it.qty > STACK_MAX && list.length < (list === P.inv ? BAG_SLOTS : STORAGE_SLOTS)) { list.push({ uid: uidc++, id: it.id, qty: it.qty - STACK_MAX }); it.qty = STACK_MAX; } }
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
  achTick(0, true); // achievements already earned in an older save are granted quietly
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
    if (started) { renderHUD(); if (UI.dirty) renderAll(); if (time % 0.25 < dt) { drawMinimap(); drawMinimapExtras(); } }
    setCursor(hover ? (hover.kind === 'mob' ? 'atk' : hover.kind === 'drop' ? 'pick' : 'talk') : 'def');
  } catch (err) { console.error(err); showErr(err); }
}
// Minimap additions drawn over drawMinimap() (js/gfx-render.js): the Waystone, sealed warps of any lock kind, the MVP lair.
function drawMinimapExtras() {
  const mc = $('mini'); if (!mc || !map) return; const g = mc.getContext('2d');
  const s = Math.min(mc.width / map.w, mc.height / map.h), ox = (mc.width - map.w * s) / 2, oy = (mc.height - map.h * s) / 2, X = x => ox + x * s, Y = y => oy + y * s;
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.lineWidth = 1.5;
  if (map.way) { const x = X(map.way.x), y = Y(map.way.y), r = 5; g.fillStyle = P.kindled[map.id] ? '#ffb050' : '#8a8078'; g.strokeStyle = '#1a1008'; g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath(); g.fill(); g.stroke(); }
  for (const wp of map.warps) if (wp.lock && wp.lock !== 'gate' && warpLocked(wp)) { g.fillStyle = '#b03020'; g.strokeStyle = 'rgba(0,0,0,.6)'; g.beginPath(); g.arc(X(wp.x + 0.5), Y(wp.y + 0.5), 4, 0, 7); g.fill(); g.stroke(); }
  for (const q of questSpots()) { const x = X(q.x), y = Y(q.y); g.fillStyle = q.kind === 'inspect' ? '#ffe070' : q.kind === 'waves' || q.kind === 'hunt' ? '#ff8a4a' : '#8ad8ff'; g.strokeStyle = '#1a1008'; g.beginPath(); g.arc(x, y, 3.5, 0, 7); g.fill(); g.stroke(); }
  for (const m of mobs) if (!m.dead && m.variant) { g.fillStyle = '#ff4a2a'; g.strokeStyle = '#1a0806'; g.beginPath(); g.arc(X(m.x), Y(m.y), 4, 0, 7); g.fill(); g.stroke(); }
  if (map.d.boss && map.bossPos && !P.flags.bosses[map.d.boss] && P.flags.seen[map.id]) { g.strokeStyle = 'rgba(255,122,42,.8)'; g.setLineDash([3, 3]); g.beginPath(); g.arc(X(map.bossPos.x), Y(map.bossPos.y), 7 * s / 2 + 4, 0, 7); g.stroke(); g.setLineDash([]); }
  g.restore();
}
// Title line under the name in the HUD (index.html is not ours; add it at load).
(function titleLine() {
  const nm = $('pname'); if (!nm || $('ptitle')) return;
  const col = document.createElement('span'); col.className = 'pnc'; nm.parentNode.insertBefore(col, nm); col.appendChild(nm);
  const t = document.createElement('span'); t.id = 'ptitle'; t.hidden = true; col.appendChild(t);
})();
// World Map button in the HUD menu (index.html is not ours; add it at load).
(function worldMapButton() {
  const menu = document.querySelector('#info .menu'); if (!menu || menu.querySelector('[data-win="worldmap"]')) return;
  const b = document.createElement('button'); b.className = 'btn'; b.dataset.win = 'worldmap'; b.style.gridColumn = '1 / -1'; b.innerHTML = 'World Map<kbd>W</kbd>'; menu.appendChild(b);
})();
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
