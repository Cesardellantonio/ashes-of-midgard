'use strict';
/* UI round 8 (content round 7's endgame), in this file:
   - skill / buff icons: painted assets/ui/skills/* when its index lists them, else a CSS tile (skillTile, SKART);
   - Ganglati's and Ganglöt's menus render as window panels inside the dialog (DLG_PANELS next to dialog());
   - windows 'deep' (a floor's affixes, progress and rewards; records) and 'gauntlet' (live clock, the nine, bests),
     a Deep card under the minimap, the pet's portrait from its monster sheet (PETSPR), the Reborn ceremony;
   - hooks by wrapping globals (rushStart, talkGanglot, rebirth): see "UI round 8" at the end of the file.
   Harness: shots/ui8/cdp.py + scenes.js. */
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
    case 'egg': { const gr = g.createRadialGradient(26, 26, 2, 32, 36, 24); gr.addColorStop(0, '#fffaf0'); gr.addColorStop(0.7, '#e8dcc8'); gr.addColorStop(1, '#a89a84'); g.fillStyle = gr; g.beginPath(); g.ellipse(32, 36, 17, 22, 0, 0, 7); g.fill(); g.fillStyle = col; for (const [sx, sy, sr] of [[26, 30, 5], [38, 40, 6], [30, 48, 4], [40, 26, 3.5]]) { g.beginPath(); g.arc(sx, sy, sr, 0, 7); g.fill(); } g.strokeStyle = 'rgba(60,40,20,.5)'; g.lineWidth = 1.5; g.beginPath(); g.ellipse(32, 36, 17, 22, 0, 0, 7); g.stroke(); break; }   // round 6: pet eggs
    case 'candy': { g.fillStyle = shade(col, -0.2); g.beginPath(); g.moveTo(10, 22); g.lineTo(22, 32); g.lineTo(10, 42); g.closePath(); g.fill(); g.beginPath(); g.moveTo(54, 22); g.lineTo(42, 32); g.lineTo(54, 42); g.closePath(); g.fill(); const gr = g.createRadialGradient(28, 28, 2, 32, 32, 13); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35, col); gr.addColorStop(1, shade(col, -0.4)); g.fillStyle = gr; g.beginPath(); g.arc(32, 32, 12, 0, 7); g.fill(); g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 2; g.beginPath(); g.arc(32, 32, 7, 3.6, 5.2); g.stroke(); break; }   // round 6: taming sweets
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
const BUFF_ICONS = { hex: { el: 'shadow', rune: 'ᚺ' }, food: { el: 'fire', rune: 'ᚠ' }, rested: { el: 'holy', rune: 'ᛃ' }, reborn: { el: 'holy', rune: 'ᛃ' } };
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
function iconFor(ref) { return ref.k === 'skill' ? skillIcon(ref.id) : itemIconURL(ref.id); }
/* UI round 8: skill and buff icons as HTML. Painted icons (assets/ui/skills/<skill id>.png, 64x64; that folder's
   index.json: { size, view, icons: { id: file }, skills: [{ id, name, el, passive, tier, cls, file }] }) are used once
   the index says they exist, so a missing file is never
   requested; an image that still fails falls back for good. Otherwise a CSS tile: a gold (active) or iron (passive)
   bevel frame, the element's colour, and the rune as text, so it stays crisp at every size and zoom (index.html,
   ".skt"). skillIcon() above (a canvas data URL) is kept for anything that still wants a bitmap. */
const SKART = { dir: 'assets/ui/skills/', idx: null, bad: new Set() };
artJSON(SKART.dir + 'index.json', d => {
  const isMap = o => !!o && typeof o === 'object' && !Array.isArray(o);
  const m = !d ? null : isMap(d.icons) ? d.icons : Array.isArray(d.skills) ? Object.fromEntries(d.skills.filter(k => k && k.id && k.file).map(k => [k.id, k.file])) : isMap(d.skills) ? d.skills : null;
  if (!m || !Object.keys(m).length) return;
  SKART.idx = m; if (typeof UI !== 'undefined') { UI.dirty = true; UI.hotSig = null; }
  if (typeof P !== 'undefined' && P && typeof started !== 'undefined' && started) renderBuffs();
});
function skillArtURL(id) { if (!SKART.idx || SKART.bad.has(id)) return null; const f = SKART.idx[id]; return typeof f === 'string' && f ? artKeep(SKART.dir + f) : null; }
const SKEL = new Set(['neutral', 'fire', 'water', 'wind', 'earth', 'holy', 'ghost', 'shadow', 'undead', 'poison']);
function skillTile(id, cls) {
  const sk = SKILLS[id] || BUFF_ICONS[id] || { el: 'neutral', rune: '?' }, u = skillArtURL(id), c = 'skt' + (cls ? ' ' + cls : '');
  if (u) return `<img class="${c} art" src="${u}" data-skico="${esc(id)}" data-skcls="${cls || ''}" alt="" draggable="false">`;
  return `<span class="${c} el-${SKEL.has(sk.el) ? sk.el : 'neutral'}${sk.passive ? ' pas' : ''}"><b>${esc(sk.rune || '?')}</b></span>`;
}

/* =========================================================
   UI round 7: painted UI art. Item icons (assets/ui/icons/<item id>.png, 64x64) and portraits
   (assets/ui/portraits: NPC busts x 5 moods, class bodies + grey hair layers). Both indexes load once, in the
   background; until they arrive the files are tried by name, and any image that fails falls back for good
   (items: the canvas icon above; portraits: a monogram medallion). Images load only when a window shows them
   and are kept decoded (ART.keep), so re-rendering a window never flickers or refetches.
   ========================================================= */
const ART = { ico: 'assets/ui/icons/', por: 'assets/ui/portraits/', icoIdx: null, porIdx: null, bad: new Set(), keep: new Map(), porHTML: {} };
// Fallback lists for when the index files cannot be read (file:// without file access): what the art team shipped.
const PORT_NPCS = new Set('sigrun brokkr vidar astrid ragna hrafn eira bolli sindri nyr heimdall gunnar einar modgud kari tofa hel fulla gna grimr thordis ulfar hallgerd ketill orm ylva hlin eir gauti ganglati ganglot lost_child modgud_hel'.split(' '));
const PORT_CLASSES = new Set('novice swordsman mage archer acolyte knight oathkeeper runecaster sage wolfhunter skald priest monk'.split(' '));
const MOODS = ['neutral', 'happy', 'sad', 'angry', 'surprised'];
function artJSON(url, ok) {
  try {
    const x = new XMLHttpRequest(); x.open('GET', url, true);
    x.onload = () => { if ((x.status === 200 || x.status === 0) && x.responseText) { try { ok(JSON.parse(x.responseText)); } catch (e) { /* keep the name-based fallback */ } } };
    x.onerror = () => {}; x.send();
  } catch (e) { /* no XHR (sandboxed file://): names only */ }
}
artJSON(ART.ico + 'index.json', d => { if (d && d.items) { ART.icoIdx = d.items; ART.icoGroups = d.groups && typeof d.groups === 'object' ? d.groups : null; if (typeof UI !== 'undefined') { UI.dirty = true; UI.hotSig = null; } } });
artJSON(ART.por + 'index.json', d => { if (d && d.npcs && d.classes) { ART.porIdx = d; ART.porHTML = {}; if (typeof HUDA !== 'undefined') delete HUDA.por; if (typeof UI !== 'undefined') UI.dirty = true; } });
function artKeep(url) { if (!ART.keep.has(url)) { const im = new Image(); im.decoding = 'async'; im.src = url; ART.keep.set(url, im); } return url; }
function itemIconURL(id) {
  const t = ITEMS[id]; if (!t) return '';
  if (!ART.bad.has(id)) {
    if (ART.icoIdx) { const f = ART.icoIdx[id]; if (f) return artKeep(ART.ico + f); }
    else return artKeep(ART.ico + id + '.png');
  }
  return iconURL(t);
}
// <img> for an item: data-ico lets the capture listener below swap in the canvas icon if the file is missing.
function icoTag(id, cls) { return `<img class="ic${cls ? ' ' + cls : ''}" src="${itemIconURL(id)}" data-ico="${id}" alt="" decoding="async" draggable="false">`; }
const icoBox = id => `<span class="ico">${icoTag(id)}</span>`;
// A painted icon for an icon kind (index.json "groups": sword, potion, card...), else the canvas one (round 8).
const groupIconURL = k => ART.icoGroups && ART.icoGroups[k] && !ART.bad.has('grp:' + k) ? artKeep(ART.ico + ART.icoGroups[k]) : iconURL({ icon: k });
document.addEventListener('error', e => {
  const t = e.target; if (!t || t.tagName !== 'IMG' || !t.dataset) return;
  const id = t.dataset.ico;
  if (t.dataset.skico) { SKART.bad.add(t.dataset.skico); t.insertAdjacentHTML('afterend', skillTile(t.dataset.skico, t.dataset.skcls)); t.remove(); if (typeof UI !== 'undefined') UI.hotSig = null; return; }
  if (id && ITEMS[id] && !ART.bad.has(id)) { ART.bad.add(id); t.src = iconURL(ITEMS[id]); if (typeof UI !== 'undefined') UI.hotSig = null; return; }
  if (t.dataset.por) {
    ART.bad.add('por:' + t.getAttribute('src')); ART.porHTML = {}; t.style.visibility = 'hidden';
    if (t.closest('#dport')) { DLGP.key = null; setDialogPortrait(DLGP.name, DLGP.text); }
    if (typeof HUDA !== 'undefined') delete HUDA.por;
  }
}, true);
const porOK = f => !ART.bad.has('por:' + ART.por + f);
const monogram = name => { const s = String(name || '?').replace(/^(the|old)\s+/i, '').trim(); return `<div class="pt none"><b>${esc((s[0] || '?').toUpperCase())}</b></div>`; };
// Class portrait for a class + body; tier-3 and High Novice use the body they grew from (CLASSES[..].base).
function portraitClassKey(cls, g) {
  const has = k => ART.porIdx ? !!ART.porIdx.classes[k] : PORT_CLASSES.has(k.slice(0, -2));
  let c = cls; for (let n = 0; c && n < 6; n++) { if (has(c + '_' + g)) return c + '_' + g; const C = CLASSES[c]; c = C && (C.base || C.from); }
  return has('novice_' + g) ? 'novice_' + g : null;
}
// Body, then the grey hair layer multiplied by the hair colour / 0.72 (art/LOG.md): brightness(1/0.72) on the layer, then
// a multiply-blended colour masked by the same layer. Pure CSS, so no canvas reads (file:// images would taint one).
function classPortraitHTML(cls, g, style, hair) {
  g = g === 'f' ? 'f' : 'm'; style = style === 'long' ? 'long' : 'spiky'; hair = /^#[0-9a-f]{3,8}$/i.test(hair || '') ? hair : null;
  const ck = cls + '|' + g + '|' + style + '|' + hair; if (ART.porHTML[ck]) return ART.porHTML[ck];
  const key = portraitClassKey(cls, g), e = key && ART.porIdx && ART.porIdx.classes[key];
  let h;
  if (!key) h = monogram(CLASSES[cls] ? CLASSES[cls].name : '?');
  else {
    const defStyle = e ? e.hairDefault : (g === 'f' ? 'long' : 'spiky'), defTint = e ? e.hairTint : (g === 'f' ? '#caa04f' : '#a4532a');
    const comp = e ? e.neutral : key + '_neutral.png', lay = e && e.layers && e.layers.neutral;
    const body = lay ? lay.body : key + '_neutral.body.png', hf = lay ? lay['hair_' + style] : `${key}_neutral.hair_${style}.png`;
    if (style === defStyle && (!hair || hair.toLowerCase() === defTint.toLowerCase()) && porOK(comp)) h = `<div class="pt"><img src="${artKeep(ART.por + comp)}" alt="" data-por="1" draggable="false"></div>`;
    else if (porOK(body) && hf && porOK(hf)) {
      const u = artKeep(ART.por + hf);
      h = `<div class="pt"><img src="${artKeep(ART.por + body)}" alt="" data-por="1" draggable="false"><img class="hl" src="${u}" alt="" data-por="1" draggable="false"><i class="ht" style="background:${hair || defTint};-webkit-mask-image:url('${u}');mask-image:url('${u}')"></i></div>`;
    } else h = porOK(comp) ? `<div class="pt"><img src="${artKeep(ART.por + comp)}" alt="" data-por="1" draggable="false"></div>` : monogram(CLASSES[cls] ? CLASSES[cls].name : '?');
  }
  return (ART.porHTML[ck] = h);
}
const playerPortrait = () => classPortraitHTML(P.cls, P.gender, P.hairStyle, P.hair);
// Which NPC portrait a speaker uses: the entity talking (talkNPC / scene speaker), else a match on the name.
const PORT_ALIAS = { odin: 'vidar', 'the wanderer': 'vidar' };
const normName = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[ðđ]/g, 'd').replace(/þ/g, 'th').replace(/^(the|old)\s+/, '').trim();
function npcPortraitId(name, ent) {
  const ok = id => !!id && (ART.porIdx ? !!ART.porIdx.npcs[id] : PORT_NPCS.has(id));
  if (ent && ok(ent.id)) return ent.id;
  const n = normName(name); if (!n) return null;
  if (PORT_ALIAS[n] && ok(PORT_ALIAS[n])) return PORT_ALIAS[n];
  const first = n.split(/[\s,]+/)[0];
  if (PORT_ALIAS[first] && ok(PORT_ALIAS[first])) return PORT_ALIAS[first];
  for (const id in NPCS) {
    if (!ok(id)) continue; const D = NPCS[id]; let dn = ''; try { dn = D.dname || ''; } catch (e) { /* getter */ }
    const nn = normName(D.name);
    if (n === nn || n === normName(dn) || first === nn || first === nn.split(' ')[0] || n === id) return id;
  }
  return ok(first) ? first : null;
}
function npcPortraitHTML(id, mood) {
  const set = ART.porIdx && ART.porIdx.npcs[id], m = MOODS.includes(mood) ? mood : 'neutral';
  let f = set ? (set[m] || set.neutral) : `${id}_${m}.png`; if (!porOK(f)) f = set ? set.neutral : `${id}_neutral.png`;
  return porOK(f) ? `<div class="pt"><img src="${artKeep(ART.por + f)}" alt="" data-por="1" draggable="false"></div>` : null;
}

/* =========================================================
   UI: HUD
   ========================================================= */
const UI = { open: {}, dirty: true, z: 10, shopTab: 'supplies', shopMode: 'buy', refineArm: null, socketCard: null, hoverBind: null, jobPick: null, hotSig: null };
const cache = {};
function setText(id, v) { if (cache[id] !== v) { cache[id] = v; $(id).textContent = v; } }
// Widths are compared as integers (tenths of a percent), so an unchanged bar costs no string work.
function setW(id, pct) { const v = Math.round(clamp(pct, 0, 100) * 10); if (cache['w' + id] !== v) { cache['w' + id] = v; $(id).style.width = (v / 10) + '%'; } }
// HUD numbers: rebuild a string only when the numbers behind it change (fmt/toLocaleString per frame was 4-9% of CPU).
const HUDA = {}, HUDB = {};
function chg(k, a, b) { if (HUDA[k] === a && HUDB[k] === b) return false; HUDA[k] = a; HUDB[k] = b; return true; }
let HOTEL = [], BUFFEL = [], tipT = -1, tipHTML = null;
// UI scale on big screens: the HUD, windows, dialog and tooltips zoom together (CSS --uiz); window positions and
// drags are kept in unzoomed "UI px" (screen px / UIZ).
let UIZ = 1;
function applyUIZ() {
  const w = W || innerWidth, h = H || innerHeight, k = Math.min(w / 1600, h / 900);
  const z = k < 1.12 ? 1 : Math.min(1.5, Math.round(k * 20) / 20);
  if (z !== UIZ || !applyUIZ.done) { UIZ = z; applyUIZ.done = true; document.documentElement.style.setProperty('--uiz', String(z)); }
}
const vw = () => (W || innerWidth) / UIZ, vh = () => (H || innerHeight) / UIZ;
applyUIZ();
// Keyboard (action) mode moves HP/SP/ST down to the hotbar and folds the menu buttons away; classic keeps RO's Basic Info.
function setHudMode(act) {
  const hud = $('hud'), v = $('vitals'); if (!hud || !v) return;
  hud.classList.toggle('act', act);
  if (act) { if (v.parentNode !== $('dockvit')) $('dockvit').appendChild(v); }
  else { const who = $('info').querySelector('.who'); if (who && v.previousElementSibling !== who) who.after(v); }
}
function syncMenus() { const h = $('hud'); if (h) h.classList.toggle('menus', Object.keys(UI.open).some(k => UI.open[k])); }
function renderHUD() {
  if (typeof sqTick === 'function' && SQ.lastP !== P) sqOnSwap();   // round 9: the controlled hero changed (squadSwap)
  if (chg('act', typeof isAction === 'function' && isAction(), 0)) setHudMode(HUDA.act);
  if (chg('name', P.name, P.cls)) { setText('pname', P.name); setText('pclass', CLASSES[P.cls].name); }
  if (chg('por', P.cls + '|' + P.gender + '|' + P.hairStyle, P.hair)) $('pport').innerHTML = playerPortrait();
  if (chg('title', P.title, 0)) { const t = P.title && TITLES[P.title]; setText('ptitle', t ? `« ${t} »` : ''); $('ptitle').hidden = !t; }
  const hp = Math.ceil(P.hp), sp = Math.floor(P.sp), mh = S.maxhp, ms = S.maxsp;
  setW('hpb', P.hp / mh * 100); const low = P.hp / mh < 0.25; if (chg('low', low, 0)) $('hpbar').classList.toggle('low', low);
  if (chg('hp', hp, mh)) setText('hpt', hp + ' / ' + mh);
  const st = Math.floor(P.stamina); setW('stb', P.stamina); if (chg('st', st, 0)) setText('stt', String(st));
  setW('spb', P.sp / ms * 100); if (chg('sp', sp, ms)) setText('spt', sp + ' / ' + ms);
  if (chg('lv', P.lvl, P.jlvl)) { setText('blv', String(P.lvl)); setText('jlv', String(P.jlvl)); setText('blv2', String(P.lvl)); setText('jlv2', String(P.jlvl)); }
  const bp = P.lvl >= (typeof maxLv === 'function' ? maxLv() : MAXLV) ? 100 : P.exp / expNeed(P.lvl) * 100, jp = P.jlvl >= CLASSES[P.cls].maxJob ? 100 : P.jexp / jexpNeed(P.jlvl) * 100;
  setW('bxp', bp); setW('jxp', jp);
  const bt = Math.floor(clamp(bp, 0, 100) * 10), jt = Math.floor(clamp(jp, 0, 100) * 10);
  if (chg('xpp', bt, jt)) { setText('bxpp', (bt / 10).toFixed(1) + '%'); setText('jxpp', (jt / 10).toFixed(1) + '%'); }
  if (chg('zeny', P.zeny, 0)) setText('zeny', fmt(P.zeny));
  const sc = shardCount(); if (chg('shards', sc, 0)) setText('shardct', sc ? `Shards ${sc}/3` : '');
  if (chg('pips', P.statPts > 0, P.skillPts > 0)) { $('pipS').className = P.statPts > 0 ? 'pip' : ''; $('pipK').className = P.skillPts > 0 ? 'pip' : ''; }
  const rgn = RG.cur ? RG.cur.name : ''; if (chg('map', map.id, rgn)) { setText('mapn', rgn ? map.d.name + ' · ' + rgn : map.d.name); $('mapn').title = $('mapn').textContent; }   // UI round 10: the region you are in
  const cx = Math.floor(P.x), cy = Math.floor(P.y); if (chg('mapc', cx, cy)) setText('mapc', cx + ', ' + cy);
  // Hotbar cooldowns and counts (element refs are cached by renderHotbar)
  for (let i = 0; i < HOTEL.length; i++) {
    const h = HOTEL[i], ref = P.hot[i]; if (!h) continue;
    let pct = 0, nosp = false;
    if (ref && ref.k === 'skill') { const sk = SKILLS[ref.id], lv = P.skills[ref.id]; if (!sk) continue; const c = P.cd[ref.id] || 0; if (c > 0) pct = Math.min(100, Math.round(c / (sk.cd || 0.3) * 100)); if (lv && (P.sp < sk.sp(lv) || (sk.need && sk.need(lv)))) nosp = true; }
    if (ref && ref.k === 'item') { const n = countItem(ref.id); if (h.n && h.cnt !== n) { h.cnt = n; h.n.textContent = n; } nosp = n === 0; }
    if (h.cd && h.pct !== pct) { h.pct = pct; h.cd.style.setProperty('--p', pct); }
    if (h.nosp !== nosp) { h.nosp = nosp; h.el.classList.toggle('nosp', nosp); }
  }
  // Boss bar
  if (bossShown) { const k = Math.max(0, bossShown.hp / bossShown.maxhp); bossLag += (k - bossLag) * 0.03; if (bossLag < k) bossLag = k; setW('bossfill', k * 100); setW('bosslag', bossLag * 100); }
  // Target frame: the locked (Tab) or attacked monster, unless the boss bar already shows it
  const lk = typeof CTRL !== 'undefined' && CTRL.lock && !CTRL.lock.dead ? CTRL.lock : null;
  let tg = lk || (P.target && P.target.kind === 'mob' && !P.target.dead ? P.target : null); if (tg && tg === bossShown) tg = null;
  if (chg('tg', tg, !!lk)) {
    const tf = $('tframe'); tf.hidden = !tg;
    if (tg) { const d = tg.d || {}; $('tname').innerHTML = (lk ? '<b class="lk">⌖</b>' : '') + esc(d.name || tg.type || ''); setText('tlv', d.lvl ? 'Lv ' + d.lvl : ''); tf.classList.toggle('named', !!(tg.variant || d.boss)); delete cache.wtbar; }
  }
  if (tg) setW('tbar', tg.hp / (tg.maxhp || 1) * 100);
  // Tips (rebuilt 4 times a second)
  if (time - tipT > 0.25 || time < tipT) { tipT = time; tipHTML = currentTip(); const te = $('tip'); if (tipHTML) { if (cache.tip !== tipHTML) { cache.tip = tipHTML; te.innerHTML = tipHTML; } te.hidden = false; } else if (!te.hidden) te.hidden = true; }
  renderTracker(); renderDeepCard(); if (UI.open.gauntlet) rushTickUI();   // round 8
  if (typeof sqTick === 'function') sqTick();   // round 9: party frames, squad chat, speech bubbles
  if (UI.open.help && (time - (UI.gfxT || 0) > 1 || time < UI.gfxT)) { UI.gfxT = time; const gi = $('gfxinfo'); if (gi) gi.textContent = gfxInfoText(); }   // round 6
  // Buff timers (or counters, e.g. spirit spheres)
  for (let i = 0; i < BUFFEL.length; i++) { const e = BUFFEL[i], b = P.buffs[e.k]; if (!b) continue; const v = b.count !== undefined ? b.count : buffT(b.t); if (e.v !== v) { e.v = v; e.sp.textContent = v; } }
}
// Buff time as RO shows it: seconds under a minute, then minutes.
const buffT = t => t >= 3600 * 24 ? '' : t >= 60 ? Math.ceil(t / 60) + 'm' : String(Math.ceil(t));
function renderBuffs() {
  const ks = Object.keys(P.buffs);
  $('buffs').innerHTML = ks.map(k => `<div class="buff${P.buffs[k].song ? ' song' : ''}${P.buffs[k].perm ? ' perm' : ''}" data-tip="buff:${k}">${skillTile(P.buffs[k].icon)}<span class="bt"></span></div>`).join('');
  const els = $('buffs').children; BUFFEL = ks.map((k, i) => ({ k, sp: els[i].querySelector('.bt'), v: null }));
}
// The hotbar is rebuilt only when its bindings (or a learned/unlearned skill) change; counts and cooldowns are patched per frame.
function renderHotbar() {
  const sig = P.hot.map(r => r ? r.k + ':' + r.id + (r.k === 'skill' && !P.skills[r.id] ? '!' : '') : '').join('|') + '|' + (ART.icoIdx ? 1 : 0) + (SKART.idx ? 1 : 0);
  if (sig === UI.hotSig && HOTEL.length) return; UI.hotSig = sig;
  $('hotbar').innerHTML = P.hot.map((ref, i) => {
    if (!ref || (ref.k === 'skill' && (!P.skills[ref.id] || !SKILLS[ref.id])) || (ref.k === 'item' && !ITEMS[ref.id])) return `<button class="hs empty" data-hot="${i}" aria-label="Empty slot ${i + 1}"><span class="k">${i + 1}</span></button>`;
    const it = ref.k === 'item', n = it ? `<span class="n">${countItem(ref.id)}</span>` : '';
    const img = it ? `<img src="${itemIconURL(ref.id)}" data-ico="${ref.id}" alt="" draggable="false">` : skillTile(ref.id);
    return `<button class="hs" data-hot="${i}" data-tip="${it ? 'hotitem' : 'skill'}:${ref.id}" aria-label="Slot ${i + 1}: ${esc(it ? ITEMS[ref.id].name : SKILLS[ref.id].name)}">${img}<span class="k">${i + 1}</span>${n}<span class="cd"></span></button>`;
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
  status: { title: 'Status', w: 400, pos: () => [16, 250] },
  inv: { title: 'Items', w: 372, pos: () => [vw() - 392, 150] },
  // Equipment sits just left of Items (372 wide at vw - 392) with a 12px gap, and never over Basic Info (x < 270).
  equip: { title: 'Equipment', w: 500, pos: () => [Math.max(270, vw() - 392 - 12 - 500), 150] },
  skills: { title: 'Skills', w: 400, pos: () => [16, 250] },
  journal: { title: 'Journal', w: 460, pos: () => [vw() / 2 - 230, 70] },
  help: { title: 'How to Play', w: 440, pos: () => [vw() / 2 - 220, 70] },
  shop: { title: 'Brokkr’s Forge', w: 440, pos: () => [vw() / 2 - 460, 90] },
  way: { title: 'Waystone', w: 330, pos: () => [vw() / 2 - 165, vh() / 2 - 190] },
  worldmap: { title: 'World Map', w: 660, pos: () => [vw() / 2 - 330, 60] },
  // Content round 5: services
  storage: { title: 'Storage', w: 560, pos: () => [vw() / 2 - 280, 60] },
  craft: { title: 'Crafting', w: 580, pos: () => [vw() / 2 - 290, 60] },
  enchant: { title: 'Seiðr Enchanting', w: 480, pos: () => [vw() / 2 - 240, 70] },
  cardsage: { title: 'Card Removal', w: 440, pos: () => [vw() / 2 - 220, 70] },
  // Content round 6
  pet: { title: 'Pet', w: 400, pos: () => [vw() - 420, 150] },
  // UI round 8: the Deep Roots (status on a floor, records at the camp) and the Gauntlet (live run, bests)
  deep: { title: 'The Deep Roots', w: 440, pos: () => [vw() - 660, 64] },
  gauntlet: { title: 'The Gauntlet', w: 340, pos: () => [vw() - 560, 64] },
};
// Window positions are remembered per window (localStorage 'aom-winpos', UI px). Phones ignore them: windows open centred.
let WINPOS = {};
try { const s = store('aom-winpos'); const o = s ? JSON.parse(s) : null; if (o && typeof o === 'object') WINPOS = o; } catch (e) { WINPOS = {}; }
function saveWinPos() { try { store('aom-winpos', JSON.stringify(WINPOS)); } catch (e) { /* storage full or blocked */ } }
const phoneUI = () => vw() <= 760;
function placeWin(id, el, fresh) {
  const w = Math.min(WIN[id].w, vw() - 20), sv = WINPOS[id];
  let x, y;
  if (phoneUI()) { x = (vw() - w) / 2; y = 8; }
  else if (sv && isFinite(sv[0]) && isFinite(sv[1]) && !fresh) { x = sv[0]; y = sv[1]; }
  else [x, y] = WIN[id].pos();
  x = clamp(x, 6, Math.max(6, vw() - w - 6)); y = clamp(y, 6, Math.max(6, vh() - 120));
  el.style.left = Math.round(x) + 'px'; el.style.top = Math.round(y) + 'px';
}
function openWin(id) {
  if (!WIN[id]) return;
  let el = $('w-' + id);
  if (!el) {
    el = document.createElement('div'); el.className = 'win'; el.id = 'w-' + id; el.style.width = `min(${WIN[id].w}px, calc(100vw / var(--uiz) - 20px))`;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', WIN[id].title);
    el.innerHTML = `<div class="tb" title="Drag to move · double-click to reset"><span>${WIN[id].title}</span><button class="x" data-close="${id}" aria-label="Close">×</button></div><div class="bd"></div>`;
    $('wins').appendChild(el);
    dragify(el, id);
  }
  if (!UI.open[id]) placeWin(id, el);
  el.hidden = false; UI.open[id] = true; el.style.zIndex = ++UI.z; renderWin(id); syncMenus();
}
function closeWin(id) { const el = $('w-' + id); if (el) el.hidden = true; UI.open[id] = false; if (id === 'inv') UI.socketCard = null; if (id === 'shop') { UI.refineArm = null; UI.junkArm = false; } if (id === 'cardsage') UI.cardArm = null; hideTip(); syncMenus(); }
function toggleWin(id) { UI.open[id] ? closeWin(id) : openWin(id); }
function dragify(el, id) {
  const tb = el.querySelector('.tb');
  tb.addEventListener('pointerdown', e => {
    if (e.target.closest('.x') || e.button > 0) return; el.style.zIndex = ++UI.z;
    const sx = e.clientX, sy = e.clientY, ox = el.offsetLeft, oy = el.offsetTop; tb.setPointerCapture(e.pointerId);
    let moved = false;
    const mv = ev => { moved = true; el.style.left = Math.round(clamp(ox + (ev.clientX - sx) / UIZ, -el.offsetWidth + 60, vw() - 60)) + 'px'; el.style.top = Math.round(clamp(oy + (ev.clientY - sy) / UIZ, 0, vh() - 30)) + 'px'; };
    const up = () => { tb.removeEventListener('pointermove', mv); tb.removeEventListener('pointerup', up); tb.removeEventListener('pointercancel', up); if (moved && !phoneUI()) { WINPOS[id] = [el.offsetLeft, el.offsetTop]; saveWinPos(); } };
    tb.addEventListener('pointermove', mv); tb.addEventListener('pointerup', up); tb.addEventListener('pointercancel', up);
  });
  tb.addEventListener('dblclick', e => { if (e.target.closest('.x')) return; delete WINPOS[id]; saveWinPos(); placeWin(id, el, true); });
  el.addEventListener('pointerdown', () => { el.style.zIndex = ++UI.z; });
}
// After a resize (or a UI zoom change) keep every open window on screen.
function fitWins() { for (const id in UI.open) { if (!UI.open[id]) continue; const el = $('w-' + id); if (!el) continue; if (phoneUI()) { placeWin(id, el); continue; } const x = clamp(el.offsetLeft, 6 - el.offsetWidth + 60, Math.max(6, vw() - 60)), y = clamp(el.offsetTop, 0, Math.max(0, vh() - 60)); el.style.left = x + 'px'; el.style.top = y + 'px'; } }
function renderWin(id) { const el = $('w-' + id); if (!el || el.hidden) return; const bd = el.querySelector('.bd'); const st = bd.scrollTop, fo = document.activeElement && bd.contains(document.activeElement) && document.activeElement.id; bd.innerHTML = typeof viewRender === 'function' && VIEW_WINS[id] ? viewRender(id) : RENDER[id](); bd.scrollTop = st; if (fo && $(fo)) $(fo).focus(); if (AFTER[id]) AFTER[id](bd); }   // round 6: an input keeps focus across re-renders; round 8: AFTER[id] mounts canvases
const AFTER = {};
function renderAll() { for (const id in UI.open) if (UI.open[id]) renderWin(id); renderHotbar(); renderTracker(true); UI.dirty = false; }

const RENDER = {
  status() {
    const rows = ['str', 'agi', 'vit', 'int', 'dex', 'luk'].map(k => {
      const v = P.st[k], bn = S[k] - v, c = statCost(v), can = P.statPts >= c && v < 99;
      return `<div class="srow"><span class="l">${k.toUpperCase()}</span><span>${v}</span><span class="b">${bn ? '+' + bn : ''}</span><button class="btn plus" data-act="stat:${k}" ${can ? '' : 'disabled'} aria-label="Raise ${k}">+</button><span class="c">${c} pt</span></div>`;
    }).join('');
    const d = (a, b) => `<div class="drow"><span>${a}</span><span>${b}</span></div>`;
    const t = P.title && TITLES[P.title];
    const card = `<div class="pcard"><div class="well">${playerPortrait()}</div><div class="pinfo"><div class="pn">${esc(P.name)}</div>${t ? `<div class="muted" style="color:#a07000;font-weight:700;font-size:11px">« ${esc(t)} »</div>` : ''}<div class="pc">${esc(CLASSES[P.cls].name)}</div><div class="pl">Base Lv <b>${P.lvl}</b> · Job Lv <b>${P.jlvl}</b>/${CLASSES[P.cls].maxJob}</div><div class="pl">HP <b>${fmt(S.maxhp)}</b> · SP <b>${fmt(S.maxsp)}</b></div></div></div>`;
    return `${card}<div class="stats"><div>${rows}<div class="drow" style="margin-top:6px"><span>Status points</span><b style="color:${P.statPts ? 'var(--ember)' : 'inherit'}">${P.statPts}</b></div></div>
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
        head = `<div class="banner-x">Insert <span class="r-card">${esc(ITEMS[card.id].name)}</span> into which item? This cannot be undone.</div><div class="list" style="margin-bottom:10px">${targets.length ? targets.map(i => `<div class="li" data-tip="item:${i.uid}">${icoBox(i.id)}<span class="r-${i.rarity}">${esc(itemName(i))}</span><button class="btn" data-act="socket:${i.uid}">Insert</button></div>`).join('') : '<div class="muted">No equipment with a free slot. Items with a [1] or [2] after the name have slots.</div>'}</div><button class="btn" data-act="socket-cancel">Cancel</button><div class="sec">Bag</div>`;
      }
    }
    // Round 5: filter tabs (view only), sort (reorders the bag and merges stacks), bag count, lock marks, mail notice.
    const tab = UI.invTab || 'all', shown = P.inv.filter(it => tab === 'all' || storageTabOf(it) === tab || (tab === 'etc' && ITEMS[it.id].type === 'key'));
    const tabs = `<div class="tabs inv-tabs">${STORAGE_TABS.map(([k, l]) => `<button class="btn ${tab === k ? 'on' : ''}" data-act="invtab:${k}">${l}</button>`).join('')}<button class="btn" data-act="sortbag" title="Sort by kind, slot and level; merge stacks" style="margin-left:auto">Sort</button></div>`;
    const cells = []; for (const it of shown) cells.push(invCell(it, 'inv:' + it.uid, 'item:' + it.uid, true));
    for (let i = tab === 'all' ? shown.length : 0; i < BAG_SLOTS && (tab === 'all' || i < BAG_SLOTS - P.inv.length); i++) cells.push('<div class="cell empty"></div>');
    const mail = P.mail && P.mail.length ? `<div class="banner-x" style="margin:0 0 6px">You have ${P.mail.length} item${P.mail.length > 1 ? 's' : ''} in your mailbox. Claim ${P.mail.length > 1 ? 'them' : 'it'} at a storage keeper or any Waystone.</div>` : '';
    return head + mail + tabs + `<div class="grid">${cells.join('')}</div><div class="row" style="justify-content:space-between;margin-top:7px"><span class="muted" style="font-size:11.5px">Bag <b style="color:var(--ink)">${P.inv.length}</b>/${BAG_SLOTS} · stacks up to ${STACK_MAX}</span><span class="muted" style="font-size:11.5px">Zeny <b style="color:var(--gold)">${fmt(P.zeny)}</b></span></div><p class="muted" style="margin:6px 0 0;font-size:11px;line-height:1.4">Click to use or equip. Right-click to drop. Hover a potion and press 1–9 to put it on the hotbar. Hover gear to compare it with what you wear.</p>`;
  },
  // RO's equipment window: slots down both sides of the character.
  equip() {
    const SG = { weapon: 'ᛏ', shield: 'ᛉ', head: 'ᛟ', body: 'ᛒ', boots: 'ᛖ', acc: 'ᛜ' };
    const slot = s => { const it = P.equip[s]; return `<button class="eqs ${it ? 'full' : ''}" data-act="uneq:${s}" ${it ? `data-tip="item:${it.uid}"` : ''} aria-label="${SLOTNAME[s]}: ${it ? esc(itemName(it)) : 'empty'}"><span class="slotbox">${it ? icoTag(it.id) : `<span class="sg">${SG[s] || '·'}</span>`}</span><span><span class="sl">${SLOTNAME[s]}</span><span class="nm ${it ? 'r-' + it.rarity : 'muted'}">${it ? esc(itemName(it)) : 'Empty'}</span></span></button>`; };
    const L = ['head', 'body', 'weapon'].filter(s => SLOTS.includes(s)), R = ['acc', 'shield', 'boots'].filter(s => SLOTS.includes(s)), rest = SLOTS.filter(s => !L.includes(s) && !R.includes(s));
    // Round 6: the warg (Ash Knight / Rune Jarl) and the pet that is out
    const ride = MOUNT_CLASSES.includes(P.cls) ? `<div class="row" style="margin-top:8px;justify-content:space-between;gap:8px"><span class="muted" style="font-size:11.5px">${P.flags.warg ? `Warg: Grár${P.mounted ? ' · riding (+35% speed, spear skills +25%)' : ''}` : 'No warg yet: Ylva in Skaldhaven rents them.'}</span><button class="btn ${P.mounted ? 'on' : ''}" data-act="mount" ${P.flags.warg && !P.dead ? '' : 'disabled'}>${P.mounted ? 'Dismount' : 'Ride'} <kbd>R</kbd></button></div>` : '';
    const pet = P.pet ? `<div class="row" style="margin-top:6px;justify-content:space-between"><span class="muted" style="font-size:11.5px">Pet: ${esc(P.pet.name)} · ${petWord(PET_INTIM_WORDS, P.pet.intim)}</span><button class="btn" data-win="pet">Pet <kbd>P</kbd></button></div>` : '';
    return `<div class="eqw"><div class="eqcol">${L.map(slot).join('')}</div><div class="well" data-win="status" title="${esc(CLASSES[P.cls].name)}">${playerPortrait()}</div><div class="eqcol r">${R.map(slot).join('')}</div></div>${rest.length ? `<div class="eq" style="margin-top:5px">${rest.map(slot).join('')}</div>` : ''}${ride}${pet}<p class="muted eqfoot" style="font-size:11.5px;margin:8px 0 0">Click an equipped item to take it off. Weapon type: ${S.wtype === 'fist' ? 'bare hands' : WNAME[S.wtype]}. Range ${S.range.toFixed(1)} cells.</p>`;
  },
  skills() {
    // Current class first, then the classes it grew from (their skills stay learned and can still be raised).
    const chain = classChain(P.cls).reverse(), seen = new Set();
    const row = id => {
      const sk = SKILLS[id], lv = P.skills[id] || 0, can = P.skillPts > 0 && lv < sk.max && id !== 'first_aid';
      const why = !sk.passive && lv && sk.need ? sk.need(lv) : null;
      return `<div class="sk" data-bind="${sk.passive ? '' : 'skill:' + id}" data-tip="skill:${id}"><span class="skw${lv ? '' : ' off'}${sk.passive || !lv ? '' : ' use'}" data-act="${sk.passive || !lv ? '' : 'cast:' + id}">${skillTile(id)}</span><div><div class="nm">${sk.name} <span class="lv">Lv ${lv}/${sk.max}${sk.passive ? ' · passive' : lv ? ` · ${sk.sp(lv)} SP` : ''}</span></div><div class="ds">${sk.desc(Math.max(1, lv))}${why ? ` <span style="color:#b02a1a">(${esc(why)})</span>` : ''}</div></div><button class="btn plus" data-act="learn:${id}" ${can ? '' : 'disabled'} aria-label="Learn ${sk.name}">+</button></div>`;
    };
    let rows = '';
    for (const c of chain) {
      const ids = CLASSES[c].skills.filter(id => !seen.has(id) && SKILLS[id] && (c === P.cls || P.skills[id] !== undefined)); ids.forEach(id => seen.add(id));
      if (c === 'novice' && P.cls !== 'novice') { if (!seen.has('first_aid')) ids.push('first_aid'); ids.splice(ids.indexOf('basic'), ids.includes('basic') ? 1 : 0); }
      if ((c === 'novice' || c === 'high_novice') && P.skills.craftsmanship !== undefined && !seen.has('craftsmanship')) { ids.push('craftsmanship'); seen.add('craftsmanship'); }
      if (!ids.length) continue;
      if (chain.length > 1) rows += `<div class="sec" style="margin-top:${c === chain[0] ? 0 : 10}px">${c === 'novice' ? 'Common' : CLASSES[c].name}${c === P.cls ? '' : ' <span class="muted" style="font-weight:400">· still learnable</span>'}</div>`;
      rows += ids.map(row).join('');
    }
    const nxt = nextClasses(P.cls), cap = CLASSES[P.cls].maxJob;
    let hint = nxt.length && P.cls !== 'novice' ? `<p class="muted" style="margin:8px 0 0;font-size:11.5px">Next path: ${nxt.map(c => CLASSES[c].name).join(' or ')} · Job Lv 40 and Base Lv 30, then speak with Vidar.</p>` : '';
    // Round 6: rebirth hints
    if (CLASSES[P.cls].tier === 2 && !P.flags.reborn && REBORN_OF[P.cls]) hint = `<p class="muted" style="margin:8px 0 0;font-size:11.5px">Beyond this path: at Base Lv 60 and Job Lv 50, Vidar knows how the Tree can spin you again, as a ${CLASSES[REBORN_OF[P.cls]].name}.</p>`;
    if (P.cls === 'high_novice') { const mem = (P.flags.reborn && P.flags.reborn.skills) || {}, to = P.flags.reborn && REBORN_OF[P.flags.reborn.from]; hint = `<p class="muted" style="margin:8px 0 0;font-size:11.5px">${Object.keys(mem).length} remembered skills sleep until your path wakes them. At Job Lv 10 and Basic Skill 9, Vidar sets you on the path of the ${to ? CLASSES[to].name : 'reborn'}.</p>`; }
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
    const mode = `<div class="sec">Control style</div><div class="tabs"><button class="btn ${act ? 'on' : ''}" data-act="ctrl:action">Action (keyboard)</button><button class="btn ${act ? '' : 'on'}" data-act="ctrl:classic">Classic (mouse)</button></div>` + gfxOptionsHTML();
    const keys = act
      ? `${k('Move', 'W A S D or arrow keys')}${k('Attack (3-hit combo)', 'J, tap repeatedly')}${k('Heavy attack', 'Hold K, release (charge for more)')}${k('Block / parry', 'Hold L; block right before a hit to parry')}${k('Dodge roll', 'Space (invulnerable while rolling)')}${k('Talk, read, open, pick up, enter a door', 'F')}${k('Lock onto an enemy', 'Tab')}${k('Ride / dismount a warg', 'R (Ash Knight, Rune Jarl)')}${k('Rotate camera', 'Q / E, or right-drag')}${k('Skills and potions', '1–9')}${k('Windows', 'C Status · I Items · G Equip · V Skills · N Journal · P Pet · H Help · , World Map')}${k('Gamepad', 'Stick move · X attack · Y heavy · B dodge · LB/RB block · A talk')}`
      : `${k('Walk', 'Click the ground, or hold to keep walking')}${k('Attack', 'Click a monster; you keep attacking')}${k('Talk, read, open, pick up', 'Click an NPC, a sign, a chest or an item on the ground')}${k('Enter a door or cave', 'Click it, or walk onto it')}${k('Hotbar', 'Keys 1–9')}${k('Ride / dismount a warg', 'R')}${k('Windows', 'A Status · I Items · E Equip · S Skills · J Journal · P Pet · W World Map')}${k('Rotate camera', 'Right-drag, Shift-drag, or Q / [ / ]')}`;
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
        return `<div class="li ${ok && left > 0 ? '' : 'off'}" data-tip="shop:${id}">${icoBox(id)}<span>${esc(t.name)}${t.type === 'equip' ? ` <span class="muted">Lv ${t.lvl}</span>` : ''}${sp ? ` <span class="muted">· ${left > 0 ? left + ' left' : 'sold out'}</span>` : ''}</span><span class="row"><span class="p">${fmt(pr)}z</span><button class="btn" data-act="buy:${id}:1" ${P.zeny >= pr && left > 0 ? '' : 'disabled'}>Buy</button>${stack && n10 > 1 ? `<button class="btn" data-act="buy:${id}:${n10}" ${P.zeny >= pr * n10 ? '' : 'disabled'}>×${n10}</button>` : ''}</span></div>`; };
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
        <p class="muted" style="margin:4px 0 0;font-size:11px">Never sold as junk: locked (🔒), quest-needed, cards, consumables, upgrade stones, rare and refined materials, unique, rare, crafted, refined or carded gear, and gear that would be an upgrade for you.</p></div>`;
      const items = P.inv.filter(i => ITEMS[i.id].type !== 'key');
      const rows = items.map(i => { const t = ITEMS[i.id]; const val = sellPrice(i); return `<div class="li" data-tip="item:${i.uid}">${icoBox(i.id)}<span class="r-${rarityOf(i)}">${esc(itemName(i))}${i.qty > 1 ? ' ×' + i.qty : ''}</span><span class="row"><span class="p">${fmt(val)}z${i.qty > 1 ? ' ea' : ''}</span><button class="btn lock ${i.lock ? 'on' : ''}" data-act="lock:${i.uid}" title="${i.lock ? 'Unlock' : 'Lock: never sold as junk or by accident'}">${i.lock ? '🔒' : '🔓'}</button><button class="btn" data-act="sell:${i.uid}" ${i.lock ? 'disabled' : ''}>Sell</button>${i.qty > 1 ? `<button class="btn" data-act="sellall:${i.uid}" ${i.lock ? 'disabled' : ''}>All</button>` : ''}</span></div>`; }).join('');
      return tabs + junk + `<div class="list">${rows || '<div class="muted">Nothing to sell.</div>'}</div>`;
    }
    const eqs = [...SLOTS.map(s => P.equip[s]).filter(Boolean), ...P.inv.filter(i => ITEMS[i.id].type === 'equip')].filter(i => ITEMS[i.id].slot !== 'acc');
    // Upgrade stones: pick one to use on the next refine (whetstones add success, a warding stone prevents shattering).
    const stones = [...new Set(P.inv.filter(i => ITEMS[i.id].stone).map(i => i.id))]; if (UI.refineStone && !countItem(UI.refineStone)) UI.refineStone = null;
    const stoneBar = stones.length ? `<div class="row" style="gap:4px;margin:0 0 8px"><span class="muted">Stone:</span><button class="btn ${!UI.refineStone ? 'on' : ''}" data-act="rstone:">None</button>${stones.map(id => `<button class="btn ${UI.refineStone === id ? 'on' : ''}" data-act="rstone:${id}" data-tip="shop:${id}">${esc(ITEMS[id].name)} ×${countItem(id)}</button>`).join('')}</div>` : '<p class="muted" style="margin:0 0 6px;font-size:11.5px">Upgrade stones (crafted, or from the limited stock) raise the odds or stop a failed refine from shattering the item.</p>';
    const rows = eqs.map(i => {
      const r = i.refine || 0, cost = refineCost(i), ch = refineChanceWith(i, UI.refineStone), safe = ch >= 100, ward = UI.refineStone && ITEMS[UI.refineStone].stone.ward, armed = UI.refineArm === i.uid;
      const btn = r >= 10 ? '<span class="muted">Max</span>' : `<button class="btn ${safe || ward ? '' : 'warn'}" data-act="refine:${i.uid}" ${P.zeny >= cost ? '' : 'disabled'}>${armed ? `Confirm, ${ch}%` : safe ? 'Refine' : `Refine (${ch}%)`}</button>`;
      return `<div class="li" data-tip="item:${i.uid}">${icoBox(i.id)}<span class="r-${i.rarity}">${esc(itemName(i))}<br><span class="muted" style="font-size:11px">${r >= 10 ? '' : `+${r} → +${r + 1} · ${fmt(cost)}z${safe ? ' · safe' : ward ? ' · a failure drops one level' : ' · fails shatter it'}`}</span></span>${btn}</div>`;
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
      const d = MAPDEFS[k], [x, y] = d.world, here = map.id === k || wmRoot(map.id) === k, seen = !!P.flags.seen[k], lit = !!P.kindled[k], hasWay = !!genMap(k).way, can = at && lit && !here;
      const lv = d.lv ? `Lv ${d.lv[0]}–${d.lv[1]}` : 'Safe haven', warn = d.lv && P.lvl < d.lv[0] - 4;
      const way = hasWay ? `<text x="${x + 64}" y="${y + 16}" text-anchor="end" font-size="12" fill="${lit ? '#ffb050' : '#7a7068'}">${lit ? '✦' : '◇'}</text>` : '';
      return `<g ${can ? `data-act="travel:${k}" style="cursor:pointer"` : ''} data-tip="wm:${k}"><rect x="${x - 70}" y="${y - 22}" width="140" height="44" rx="6" fill="${here ? '#4a3a1c' : seen ? '#221c18' : '#15120f'}" stroke="${here ? '#ffd070' : can ? '#ffb050' : seen ? '#8a7a5a' : '#4a4038'}" stroke-width="${here || can ? 2 : 1}"/>`
        + `<text x="${x}" y="${y - 3}" text-anchor="middle" font-size="13" font-weight="700" fill="${seen ? '#f4e8d0' : '#9a9088'}">${esc(d.name)}</text>`
        + `<text x="${x}" y="${y + 13}" text-anchor="middle" font-size="11" fill="${warn ? '#ff8a6a' : seen ? '#c8b898' : '#7a7068'}">${seen ? lv : lv + ' · unexplored'}</text>${way}${seen ? wmBadge(k, x, y) : ''}${here ? `<circle cx="${x - 58}" cy="${y - 8}" r="4" fill="#ffd070"/>` : ''}</g>`;
    }).join('');
    const svg = `<svg viewBox="0 0 640 400" style="width:100%;height:auto;display:block;background:radial-gradient(ellipse at 40% 55%,#2a241c,#0e0c0a);border:1px solid #4a4038;border-radius:6px;font-family:inherit">${lines}${nodes}</svg>`;
    const kindled = travelList().filter(k => k !== map.id);
    const list = kindled.map(k => travelButton(k, !at)).join('');
    return `${svg}<p class="muted" style="margin:6px 0 0;font-size:11.5px;line-height:1.4">✦ kindled Waystone · ◇ Waystone not yet kindled · <span class="wmleg">${placeIcon('interior')}</span> rooms and <span class="wmleg">${placeIcon('cave')}</span> caves found · dashed red: sealed road. ${at ? 'You stand by a Waystone: pick a kindled one to travel there.' : 'Travel between kindled Waystones from any Waystone.'}</p><div class="sec">Kindled Waystones</div>${list || '<div class="muted">No other Waystones kindled yet.</div>'}${wmPlacesHTML()}`;
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
    for (const k of Object.keys(MAPDEFS)) for (const wp of genMap(k).warps) {
      // UI round 10: an interior / cave counts as its parent map; maps without a place on the world map draw no road
      const a = wmRoot(k), b = wmRoot(wp.to); if (!MAPDEFS[a] || !MAPDEFS[b] || a === b || !MAPDEFS[a].world || !MAPDEFS[b].world) continue;
      const key = [a, b].sort().join('|'); if (seen[key]) { if (wp.lock) seen[key].lock = wp.lock; continue; } seen[key] = { a, b, lock: wp.lock }; WM_EDGES.push(seen[key]);
    }
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
const matRow = (id, need) => { const h = countItem(id), ok = h >= need; return `<div class="mat ${ok ? 'ok' : 'no'}" data-tip="shop:${id}">${icoBox(id)}<span>${esc(ITEMS[id].name)}</span><b>${fmt(h)}/${need}</b></div>`; };
// One bag/storage cell: icon, stack count, refine level, lock mark, rarity frame.
function invCell(it, act, tip, bind) { return `<button class="cell r-${rarityOf(it)}" data-act="${act}" data-tip="${tip}"${bind ? ` data-bind="item:${it.id}"` : ''} aria-label="${esc(itemName(it))}">${icoTag(it.id)}${it.refine ? `<span class="rf">+${it.refine}</span>` : ''}${it.qty > 1 ? `<span class="q">${it.qty}</span>` : ''}${it.lock ? '<span class="lk">🔒</span>' : ''}</button>`; }
const miniCell = (it, act, tip) => invCell(it, act, tip, false);
function mailHTML() {
  if (!P.mail || !P.mail.length) return '';
  return `<div class="sec">Mailbox (${P.mail.length}) <button class="btn" style="float:right;margin-top:-3px" data-act="mailall">Claim all</button></div><div class="list">${P.mail.map((m, i) => `<div class="li" data-tip="mail:${i}">${icoBox(m.item.id)}<span class="r-${rarityOf(m.item)}">${esc(itemName(m.item))}${m.item.qty > 1 ? ' ×' + m.item.qty : ''} <span class="muted">· from ${esc(m.from)}</span></span><button class="btn" data-act="mail:${i}">Claim</button></div>`).join('')}</div>`;
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
    if (!L) return `<p class="lore">You do not know how to hold the tongs yet. <b>Craftsmanship</b> is a passive any path can learn: ask Brokkr in Emberhold for <i>The Smith’s Apprentice</i> (Base Lv 10).</p><div class="sec">What the smiths can make</div><div class="list">${recipesAt(by).slice(0, 8).map(r => `<div class="li off">${icoBox(r.out[0])}<span>${esc(r.name || ITEMS[r.out[0]].name)}</span><span class="muted">Lv ${r.lvl}</span></div>`).join('')}</div>`;
    const cat = UI.craftCat || 'all', list = recipesAt(by).filter(r => cat === 'all' || r.cat === cat);
    if (!UI.craftSel || !RECIPES[UI.craftSel] || !RECIPES[UI.craftSel].at.includes(by)) UI.craftSel = (list[0] || {}).id;
    const xp = L >= CRAFT_MAX ? 'max' : `${P.flags.craftXp || 0}/${CRAFT_XP(L)} practice`;
    const tabs = `<div class="tabs"><button class="btn ${cat === 'all' ? 'on' : ''}" data-act="ccat:all">All</button>${RECIPE_CATS.map(([k, l]) => `<button class="btn ${cat === k ? 'on' : ''}" data-act="ccat:${k}">${l}</button>`).join('')}</div>`;
    const rows = list.map(r => { const why = craftWhy(r, by), t = ITEMS[r.out[0]]; return `<button class="li crow ${UI.craftSel === r.id ? 'sel' : ''} ${r.lvl > L ? 'off' : ''}" data-act="csel:${r.id}">${icoBox(r.out[0])}<span>${esc(r.name || t.name)}${r.out[1] > 1 ? ' ×' + r.out[1] : ''}<br><span class="muted" style="font-size:10.5px">Lv ${r.lvl} · ${why ? (r.lvl > L ? 'locked' : 'missing materials') : craftChance(r) + '%'}</span></span><span class="${why ? 'muted' : 'ok'}">${why ? '·' : '✓'}</span></button>`; }).join('');
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
        <div class="drow"><span>Fee</span><b style="color:${P.zeny >= r.fee ? 'var(--gold)' : 'var(--bad)'}">${fmt(r.fee)}z</b></div><div class="drow"><span>Craftsmanship</span><b style="color:${L >= r.lvl ? 'inherit' : 'var(--bad)'}">Lv ${r.lvl} (yours ${L})</b></div><div class="drow"><span>Success</span><b>${ch}%</b></div>
        ${why ? `<p class="tt-bad" style="margin:6px 0 0">${esc(why)}</p>` : ''}<div class="row" style="margin-top:8px"><button class="btn big" data-act="craft:${r.id}:1" ${why ? 'disabled' : ''}>Craft</button><button class="btn" data-act="craft:${r.id}:5" ${why ? 'disabled' : ''}>×5</button></div>${qual}`;
    }
    return `<div class="row" style="justify-content:space-between;margin-bottom:6px"><span>Craftsmanship <b>Lv ${L}/${CRAFT_MAX}</b> <span class="muted">· ${xp}</span></span><span class="muted">Zeny <b style="color:var(--gold)">${fmt(P.zeny)}</b></span></div>${tabs}<div class="craft"><div class="list clist">${rows || '<div class="muted">Nothing here.</div>'}</div><div class="cdet">${det}</div></div><p class="muted" style="margin:6px 0 0;font-size:11px">Success grows with Craftsmanship (practice or skill points), DEX and LUK. Gear comes out Standard, Fine (+10 %) or Masterwork (+20 % and an extra slot).</p>`;
  },
  enchant() {
    const gear = [...SLOTS.map(s => P.equip[s]).filter(Boolean), ...P.inv.filter(i => ITEMS[i.id].type === 'equip')].filter(i => !ITEMS[i.id].unique);
    if (!gear.some(i => i.uid === UI.enchSel)) UI.enchSel = gear[0] ? gear[0].uid : null;
    const list = gear.map(i => `<button class="li crow ${UI.enchSel === i.uid ? 'sel' : ''}" data-act="esel:${i.uid}" data-tip="item:${i.uid}">${icoBox(i.id)}<span class="r-${i.rarity}">${esc(itemName(i))}${SLOTS.some(s => P.equip[s] === i) ? ' <span class="muted">(worn)</span>' : ''}</span><span class="muted">Lv ${ITEMS[i.id].lvl}</span></button>`).join('');
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
      return `<div class="li" data-tip="item:${i.uid}">${icoBox(c)}<span><span class="r-card">${esc(ITEMS[c].name)}</span><br><span class="muted" style="font-size:11px">in ${esc(itemName(i))} · ${fmt(fee)}z</span></span><button class="btn ${arm ? 'warn' : ''}" data-act="cardrm:${i.uid}:${k}" ${why ? `disabled title="${esc(why)}"` : ''}>${arm ? 'Confirm' : 'Remove'}</button></div>`; }).join('')).join('');
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
const ACT_NAMES = { 2: 'The Wolf and the Gate', 3: 'The Roots of Hel' };
function journalChronicle() {
  // Story quests in order; a branch quest (q.branch) only shows for the ending you chose. Acts II and III are named.
  const main = Object.keys(QUESTS).filter(id => QUESTS[id].kind === 'main' && (!QUESTS[id].branch || QUESTS[id].branch === P.flags.ending || P.quests.done[id]));
  let nowSet = false, act = 1;
  const rows = main.map(id => { const q = QUESTS[id], st = questStatus(id), d = st === 'done'; let cls = d ? 'done' : ''; if (!d && !nowSet) { cls = 'now'; nowSet = true; } const t = q.obj.map(o => objText(o)).join('; '); const head = (q.act || 1) !== act ? `<div class="sec">Act ${act = q.act || 1}${ACT_NAMES[q.act] ? ' · ' + ACT_NAMES[q.act] : ''}</div>` : ''; return `${head}<div class="obj ${cls}"><span class="m">${d ? '✓' : cls === 'now' ? '▸' : '·'}</span><span>${esc(q.name)} <span class="muted">· ${esc(t)}</span></span></div>`; }).join('');
  const lore = Object.keys(LORE).filter(k => P.flags.lore[k]).map(k => `<p class="lore"><b>${LORE[k][0]}</b>${LORE[k][1]}</p>`).join('');
  const pt = Math.floor(P.playTime / 60);
  const path = (P.flags.reborn ? 'Reborn · ' : '') + classChain(P.cls).map(c => CLASSES[c].name).join(' → ');
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

// RO's item description window: the icon and name up top, the description, then "Type / ATK / Required Level / Jobs"
// rows, bonuses, cards, the comparison with what you wear, and the sell price.
function itemTooltip(it, fromShop) {
  const t = ITEMS[it.id], r = fromShop ? (t.unique ? 'unique' : t.type === 'card' ? 'card' : 'common') : rarityOf(it);
  const kv = rows => `<div class="tt-kv">${rows.filter(Boolean).map(([k, v, c]) => `<span>${k}</span><b${c ? ` class="${c}"` : ''}>${v}</b>`).join('')}</div>`;
  let sub, b = '';
  if (t.type === 'equip') {
    const ib = itemBase(it), kind = t.slot === 'weapon' ? WNAME[t.wtype] : SLOTNAME[t.slot];
    sub = `${it.name && !fromShop ? esc(t.name) + ' · ' : ''}${kind}${r !== 'common' ? ' · ' + r : ''}${t.crafted ? ' · crafted' : ''}`;
    const sN = fromShop ? t.slots : it.slotsN, used = fromShop ? 0 : (it.cards || []).length;
    b += kv([
      t.slot === 'weapon' ? ['ATK', ib.atk] : null, t.slot === 'weapon' && ib.matk ? ['MATK', ib.matk] : null,
      t.slot !== 'weapon' && t.def ? ['DEF', ib.def] : null, t.slot !== 'weapon' && t.mdef ? ['MDEF', ib.mdef] : null,
      !fromShop && it.refine ? ['Refine', '+' + it.refine] : null,
      sN ? ['Slots', `<span class="tt-c">${'◆'.repeat(used)}</span>${'◇'.repeat(Math.max(0, sN - used))}`] : null,
      ['Required Lv', t.lvl, P.lvl < t.lvl ? 'tt-bad' : ''],
      ['Jobs', t.jobs === ALLJ || t.jobs.length === ALLJ.length ? 'All paths' : t.jobs.map(j => CLASSES[j].name).join(', '), jobOk(t, P.cls) ? '' : 'tt-bad'],
    ]);
    if (it.q && QUALITY[it.q] && !fromShop) b += `<div class="tt-u">${QUALITY[it.q].name}${it.q > 1 ? ` (+${Math.round((QUALITY[it.q].mul - 1) * 100)} % base)` : ''}${it.maker ? ` · made by ${esc(it.maker)}` : ''}</div>`;
    for (const k in (t.bonus || {})) b += `<div class="${t.unique ? 'tt-u' : 'tt-l'}">${bonusLine(k, t.bonus[k])}</div>`;
    if (!fromShop) { for (const a of it.affixes || []) b += `<div class="tt-b">${bonusLine(a.s, a.v)}</div>`; for (const c of it.cards || []) b += `<div class="tt-c">✦ ${ITEMS[c].name}: ${Object.entries(ITEMS[c].bonus).map(([k, v]) => bonusLine(k, v)).join(', ')}</div>`; }
    if (t.lore) b += `<div class="tt-lore">${esc(t.lore)}</div>`;
    b += compareHTML(it, fromShop);
  } else {
    sub = t.quest ? 'Quest item' : t.stone ? 'Upgrade stone' : t.rareMat ? 'Rare material' : { use: 'Consumable', etc: 'Material', card: 'Card', key: 'Rune-Shard' }[t.type] || '';
    if (t.desc) b += `<div class="tt-l">${esc(t.desc)}</div>`;
    if (t.type === 'card') b += `<div class="tt-c" style="margin-top:3px">${Object.entries(t.bonus).map(([k, v]) => bonusLine(k, v)).join('<br>')}</div>`;
    if (t.type === 'etc' && !t.stone) { const n = Object.values(RECIPES).filter(rr => rr.mats.some(m => m[0] === it.id)).length; if (n) b += `<div class="muted" style="margin-top:3px">Used in ${n} recipe${n > 1 ? 's' : ''}.</div>`; }
    if (!fromShop && countItem(it.id) > (it.qty || 1)) b += `<div class="muted">${fmt(countItem(it.id))} in your bag</div>`;
    else if (fromShop && countItem(it.id)) b += `<div class="muted">${fmt(countItem(it.id))} in your bag</div>`;
  }
  if (!fromShop && it.lock) b += '<div class="muted">🔒 Locked: never sold as junk</div>';
  if (!fromShop && t.type !== 'key') b += `<div class="tt-p">Sells for ${fmt(sellPrice(it))}z${it.qty > 1 ? ` each · ${fmt(sellPrice(it) * it.qty)}z all` : ''}</div>`;
  const name = esc(fromShop ? t.name : itemName(it)) + (!fromShop && it.qty > 1 ? ` <span class="muted" style="font-weight:700">×${fmt(it.qty)}</span>` : '');
  return `<div class="tt-head"><div class="tt-ico r-${r}">${icoTag(it.id)}</div><div><div class="tt-name r-${r}">${name}</div><div class="tt-sub">${sub}</div></div></div><div class="tt-body">${b}</div>`;
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
  let h = `<div class="tt-head"><div class="tt-ico skic">${skillTile(id)}</div><div><div class="tt-name">${sk.name}</div><div class="tt-sub">${sk.passive ? 'Passive' : TGTTEXT[sk.tgt]} · Lv ${lv}/${sk.max}</div></div></div><div class="tt-body">`;
  h += `<div class="tt-l">${sk.desc(Math.max(1, lv))}</div>`;
  if (!sk.passive && lv) { const r = sk.tgt === 'self' ? 0 : skillRange(sk, lv); h += `<div class="muted" style="margin-top:3px">${sk.sp(lv)} SP${sk.cast ? ` · ${castTime(sk, lv).toFixed(1)}s cast` : ''}${r ? ` · range ${+r.toFixed(1)}` : ''}</div>`; }
  if (!sk.passive && lv && sk.need && sk.need(lv)) h += `<div class="tt-bad" style="margin-top:3px">${esc(sk.need(lv))}</div>`;
  if (lv < sk.max && lv > 0) h += `<div class="muted" style="margin-top:3px">Next level: ${sk.desc(lv + 1)}</div>`;
  return h + '</div>';
}
function showTip(html, x, y) { const el = $('tooltip'); if (!html.startsWith('<div class="tt-head')) html = '<div class="tt-plain">' + html + '</div>'; if (el.dataset.src !== html) { el.dataset.src = html; el.innerHTML = html; } el.hidden = false; moveTip(x, y); }
function moveTip(x, y) { const el = $('tooltip'), r = el.getBoundingClientRect(); let tx = x + 16, ty = y + 14; if (tx + r.width > W - 8) tx = x - r.width - 12; tx = Math.min(tx, W - r.width - 8); if (ty + r.height > H - 8) ty = H - r.height - 8; el.style.left = Math.round(Math.max(8, tx) / UIZ) + 'px'; el.style.top = Math.round(Math.max(8, ty) / UIZ) + 'px'; }
function hideTip() { const el = $('tooltip'); el.hidden = true; }
function tipFor(key) {
  const [k, v] = key.split(/:(.+)/);
  if (k === 'item') { const it = findItem(+v); return it ? itemTooltip(it) : null; }
  if (k === 'sitem') { const it = storageFind(+v); return it ? itemTooltip(it) : null; }
  if (k === 'mail') { const m = P.mail && P.mail[+v]; return m ? itemTooltip(m.item) : null; }
  if (k === 'shop') return ITEMS[v] ? itemTooltip({ id: v }, true) : null;
  if (k === 'hotitem') { if (!ITEMS[v]) return null; const it = P.inv.find(i => i.id === v); return it ? itemTooltip(it) : itemTooltip({ id: v }, true); }
  if (k === 'skill') return skillTooltip(v);
  if (k === 'wm') { const d = MAPDEFS[v]; if (!d) return null; const ms = [...new Set(d.spawns.map(s => s[0]))].map(id => MOBS[id].name); return `<div class="tt-name">${esc(d.name)}</div><div class="tt-l">${esc(d.lv ? `Base Lv ${d.lv[0]} – ${d.lv[1]}` : d.sub)}${P.flags.seen[v] && ms.length ? '<br>' + esc(ms.join(', ')) : ''}${P.flags.seen[v] && d.boss && MOBS[d.boss] ? `<br>MVP: ${esc(MOBS[d.boss].name)}${P.flags.bosses[d.boss] ? ' (slain)' : ''}` : ''}</div><div class="muted">${P.kindled[v] ? 'Waystone kindled' : genMap(v).way ? 'Waystone not kindled' : ''}</div>${P.flags.seen[v] ? wmTipSubs(v) : ''}`; }
  if (k === 'wms') { const d = MAPDEFS[v]; if (!d) return null; const kd = wmSubs().kind[v], par = MAPDEFS[wmRoot(v)]; return `<div class="tt-name">${esc(d.name)}</div><div class="tt-l">${kd === 'cave' ? 'Cave' : 'Interior'}${par ? ' · ' + esc(par.name) : ''}${d.lv ? `<br>Base Lv ${d.lv[0]} – ${d.lv[1]}` : ''}</div><div class="muted">${map.id === v ? 'You are here' : P.flags.seen[v] ? 'Explored' : 'Entrance found, not yet entered'}</div>`; }
  if (k === 'buff') { const b = P.buffs[v]; return b ? `<div class="tt-name">${b.name}</div><div class="tt-l">${[...Object.entries(b.bonus || {}).map(([a, n]) => bonusLine(a, n)), ...buffLines(b)].join('<br>')}</div><div class="muted">${b.perm ? 'Permanent' : b.count !== undefined ? `×${b.count}` : Math.ceil(b.t) + 's left'}</div>` : null; }
  return null;
}

const ACTS = {};
function handleAct(act, e) {
  const [a, b, c] = act.split(':');
  // Round 9: Status / Equipment / Skills (and equipping from Items) act on the member the member switcher shows.
  if (typeof sqViewAct === 'function' && !SQ.inAs && sqViewAct(a, b)) { SQ.inAs = true; try { asHero(viewHero(), () => handleAct(act, e)); } finally { SQ.inAs = false; UI.dirty = true; } return; }
  Sfx.click();
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
    // Round 6: mount, pets, graphics options
    case 'mount': toggleMount(); break;
    case 'pethatch': { const it = findItem(+b); if (it) hatchEgg(it); break; }
    case 'petfeed': petFeed(); break;
    case 'petegg': petToEgg(); break;
    case 'petrename': { const el = $('petname'); if (el) petRename(el.value); UI.petDraft = null; break; }
    case 'gfxq': if (typeof GFX !== 'undefined' && GFX.setQuality) { GFX.setQuality(b); log(`Graphics: ${b}.`, 'sys'); } break;
    case 'gfxanime': if (typeof GFX !== 'undefined') { GFX.animeFx = GFX.animeFx === false; store('aom-animefx', GFX.animeFx ? '1' : '0'); log(`Anime combat effects ${GFX.animeFx ? 'on' : 'off'}.`, 'sys'); } break;
    case 'gfxauto': if (typeof GFX !== 'undefined') { GFX.auto = !GFX.auto; store('aom-gfx-auto', GFX.auto ? 'on' : 'off'); if (!GFX.auto && GFX.setLevel) GFX.setLevel(0); log(`Auto quality ${GFX.auto ? 'on' : 'off'}.`, 'sys'); } break;
    default: if (ACTS[a]) ACTS[a](b, c, e);   // round 8: actions registered by later sections
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
// The speaker's portrait: the NPC talking (talkNPC, or a scene speaker) or a name match; the hero's own lines use
// the class portrait; anyone else gets a monogram. A mood can be set per page with an HTML comment the text already
// carries invisibly, e.g. '<!--happy-->' (neutral | happy | sad | angry | surprised), or by a dialogMood(id, text) hook.
const DLGP = { key: null, name: '', text: '' };
function setDialogPortrait(name, text) {
  DLGP.name = name; DLGP.text = text;
  const ent = typeof talkNPC !== 'undefined' ? talkNPC : null, self = P && name === P.name;
  const id = self ? null : npcPortraitId(name, ent);
  let mood = (/<!--\s*(neutral|happy|sad|angry|surprised)\s*-->/.exec(text || '') || [])[1];
  if (!mood && id && typeof dialogMood === 'function') { try { mood = dialogMood(id, text); } catch (e) { mood = null; } }
  const key = self ? 'self|' + P.cls + P.gender + P.hairStyle + P.hair : id ? id + '|' + (mood || 'neutral') : 'm|' + name;
  const D = id && NPCS[id], title = D && D.title && !normName(name).includes(normName(D.title)) ? D.title : '';
  setText('dsub', self ? CLASSES[P.cls].name : title);
  if (key === DLGP.key) return; DLGP.key = key;
  $('dport').innerHTML = self ? playerPortrait() : (id && npcPortraitHTML(id, mood)) || monogram(name);
}
function dialog(name, text, opts) {
  let pn = null; for (const p of DLG_PANELS) { try { if (p.test(name, opts)) { pn = p; break; } } catch (e) { /* data not loaded: plain menu */ } }
  return new Promise(res => {
    dlgResolve = res; const dg = $('dialog'); dg.hidden = false; $('dname').textContent = name;
    try { setDialogPortrait(name, text); } catch (e) { console.error(e); }
    DLG.cur = pn ? { pn, name, text, opts } : null; UI.deepSel = null;
    dg.classList.toggle('panel', !!pn); $('dtb').hidden = !pn; $('dtbt').textContent = pn ? pn.title : '';
    if (pn) { try { dlgPanelDraw(true); } catch (e) { console.error(e); DLG.cur = null; dg.classList.remove('panel'); $('dtb').hidden = true; pn = null; } }
    if (!pn) {
      const dt = $('dtext'); dt.innerHTML = `<span class="nm">[${esc(name)}]</span>` + text; dt.scrollTop = 0;
      $('dopts').className = opts.length > 2 ? 'menu-list' : '';
      $('dopts').innerHTML = opts.map((o, i) => `<button class="btn" data-dlg="${i}">${esc(o)}</button>`).join('');
    }
    const b = $('dopts').querySelector('button:not(.dup)'); if (b) b.focus({ preventScroll: true });
  });
}
/* UI round 8: dialog panels. Ganglati's and Ganglöt's menus become windows in place: when a dialog's speaker and
   options match a DLG_PANELS entry, the dialog grows a title bar and shows the panel (floor select, records, affixes,
   rewards; the nine beasts and the bests) instead of a bare list. The options core passed are still the buttons and
   still resolve to the same indices, so talkGanglati / talkGanglot (js/data/npcs.js) run unchanged; the ones the panel
   makes redundant stay in the DOM, hidden (.dup), and a panel may add its own actions (data-dx) that resolve with the
   "Farewell" index and then act (e.g. a mid-run checkpoint). If the data a panel needs is missing, the plain menu shows. */
const DLG = { cur: null };
const DLG_PANELS = [
  { id: 'deep', title: 'The Deep Roots', render: (t, o) => deepPanel(t, o),
    test: (name, opts) => typeof deepState === 'function' && typeof NPCS !== 'undefined' && !!NPCS.ganglati && name === NPCS.ganglati.dname && opts.some(o => /^Begin a new descent/.test(o)) },
  { id: 'gauntlet', title: 'The Gauntlet of Eljudnir', render: (t, o) => rushPanel(t, o),
    test: (name, opts) => typeof rushState === 'function' && typeof RUSH_LIST !== 'undefined' && typeof NPCS !== 'undefined' && !!NPCS.ganglot && name === NPCS.ganglot.dname && opts.some(o => /^Begin the Gauntlet/.test(o)) },
];
const dlgBye = opts => { const i = opts.findIndex(o => /^(Farewell|Nothing|Not yet|Stay)\b/i.test(o)); return i >= 0 ? i : opts.length - 1; };
function dlgPanelDraw(fresh) {
  const c = DLG.cur; if (!c) return;
  const r = c.pn.render(c.text, c.opts), dt = $('dtext'), st = fresh ? 0 : dt.scrollTop;
  dt.innerHTML = `<span class="nm">[${esc(c.name)}]</span><p class="dq">${c.pn.text ? c.pn.text(c.text) : c.text}</p>${r.html}`; dt.scrollTop = st;
  const shown = new Set(r.show), btn = (i, cls) => `<button class="btn${cls}" data-dlg="${i}">${esc(c.opts[i])}</button>`;
  $('dopts').className = 'panel-opts';
  $('dopts').innerHTML = (r.extra || []).map(x => `<button class="btn prim" data-dx="${esc(x.act)}">${esc(x.label)}</button>`).join('')
    + r.show.map(i => btn(i, i === r.primary ? ' prim' : i === dlgBye(c.opts) ? ' bye' : '')).join('')
    + c.opts.map((o, i) => shown.has(i) ? '' : btn(i, ' dup')).join('');
}
// Clicks inside a panel: data-dsel picks a floor (redraw in place), data-dx runs a panel action after closing.
function dlgExtraClick(e) {
  if (e.target.closest('[data-dclose]')) { closeDialog(); return true; }
  const s = e.target.closest('[data-dsel]'); if (s && DLG.cur) { Sfx.click(); UI.deepSel = +s.dataset.dsel; dlgPanelDraw(); return true; }
  const x = e.target.closest('[data-dx]'); if (!x || !DLG.cur) return false;
  const act = x.dataset.dx, c = DLG.cur, r = dlgResolve; dlgResolve = null; DLG.cur = null; Sfx.click();
  if (r) r(dlgBye(c.opts));
  const [k, v] = act.split(':');
  if (k === 'deep' && typeof deepGo === 'function') setTimeout(() => { if (!P.dead) deepGo(+v); }, 0);
  return true;
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
const QUEST_UI = { markers: true, boards: true, boardLabels: true, helgate: true, skills: true, spots: true }; // skills / spots: the VFX team's 3D versions set these false // the renderer may set these false once it draws them itself
(function questUI() {   // styles live in index.html (round 7); this adds the tracker and the toast column
  const tr = document.createElement('div'); tr.id = 'qtrack'; tr.className = 'rwin'; tr.hidden = true; tr.dataset.win = 'journal'; tr.title = 'Open the quest log';
  ($('tr') || $('hud')).appendChild(tr);
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
  // Round 8: on phones the tracker is clamped (one line per objective, the finished ones folded away, at most two
  // shown) until it is tapped; tapped, it shows everything and a link to the quest log.
  const phone = phoneUI(), open = !phone || !!UI.trackOpen;
  let obs = questObjectives(id), more = 0;
  if (!open) { const left = obs.filter(o => !o.done); more = obs.length - Math.min(2, left.length); obs = left.slice(0, 2); }
  const rows = obs.map(o => `<div class="o ${o.done ? 'done' : o.open ? '' : 'lock'}"><span class="m">${o.done ? '✓' : '▸'}</span><span>${esc(o.text)}${o.live ? ` <i style="color:#b0402a">${esc(o.live)}</i>` : ''}</span><b>${o.counted ? `${o.cur}/${o.max}` : ''}</b></div>`).join('');
  const foot = !phone ? '' : open ? '<button class="btn qlog" data-win="journal">Quest log</button>' : more > 0 ? `<div class="qmore">+${more} more · tap</div>` : '';
  const html = `<div class="rtb"><span>Quest</span></div><div class="rbd"><div class="qt">${esc(q.name)}</div>${rows}${ready && ti ? `<div class="rd">Return to ${esc(questGiverName(ti))}</div>` : ''}${foot}</div>`;
  if (cache.qtrack !== html) { cache.qtrack = html; el.innerHTML = html; }
  el.classList.toggle('open', phone && open); el.classList.toggle('clamp', !open);
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
  if (!QUEST_UI.markers || (typeof CINE !== 'undefined' && CINE.active)) return;   // no '!' / '?' marks during a scene
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
  for (const s of (QUEST_UI.spots === false ? [] : questSpots())) {
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
  if (QUEST_UI.skills === false) return;   // the renderer draws skill zones, auras, spheres, marks and telegraph shapes in 3D
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
  const dw = doorAtScreen(e.clientX, e.clientY); if (dw) { goDoor(dw); return; }   // UI round 11: a click on a door walks in
  const w = s2w(e.clientX, e.clientY);
  if (moveTo(w[0], w[1])) fxs.push({ k: 'mark', x: w[0], y: w[1], t: 0, dur: 0.5 });
  mouse.hold = true; mouse.holdT = 0.25;
});
let aggroHover = null;
addEventListener('pointermove', e => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.seen = e.pointerType !== 'touch' && e.target === cv; if (mouse.rot) { cam.yawT = mouse.rot.yaw - (e.clientX - mouse.rot.x) * 0.008; cam.yaw = cam.yawT; if (e.ctrlKey || e.altKey) cam.pitch = clamp(mouse.rot.pitch + (e.clientY - mouse.rot.y) * 0.004, 0.6, 1.25); } });
addEventListener('pointerup', () => { mouse.down = false; mouse.hold = false; mouse.rot = null; });
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('wheel', e => { e.preventDefault(); cam.dist = clamp(cam.dist * (e.deltaY > 0 ? 1.1 : 0.9), 22, 72); }, { passive: false });

const game = $('game');
$('bRespawn').onclick = () => { Sfx.click(); respawn(); };
function showDeath() { $('deathz').textContent = P.lostZeny && P.lostZeny.map === map.id ? `Your ${fmt(P.lostZeny.zeny)} zeny lies where you fell.` : ''; $('death').hidden = false; }
game.addEventListener('click', e => {
  // Round 8: a tap on the clamped phone tracker unfolds it (and folds it again); its "Quest log" button opens the log.
  const qt = e.target.closest('#qtrack'); if (qt && phoneUI() && !e.target.closest('.qlog')) { Sfx.unlock(); UI.trackOpen = !UI.trackOpen; renderTracker(true); return; }
  if (e.target.closest('.qlog')) UI.trackOpen = false;
  if (dlgExtraClick(e)) return;
  if (typeof sqClick === 'function' && sqClick(e)) return;   // round 9: party frames, chat tabs
  const w = e.target.closest('[data-win]'); if (w) { Sfx.unlock(); toggleWin(w.dataset.win); return; }
  const x = e.target.closest('[data-close]'); if (x) { closeWin(x.dataset.close); return; }
  const d = e.target.closest('[data-dlg]'); if (d) { const r = dlgResolve; dlgResolve = null; if (r) r(+d.dataset.dlg); return; }
  const h = e.target.closest('[data-hot]'); if (h) { useHot(+h.dataset.hot); return; }
  const a = e.target.closest('[data-act]'); if (a && a.dataset.act) { handleAct(a.dataset.act, e); return; }
});
game.addEventListener('contextmenu', e => {
  if (typeof sqContext === 'function' && sqContext(e)) return;   // round 9: right-click a party frame opens Tactics
  const h = e.target.closest('[data-hot]'); if (h) { e.preventDefault(); P.hot[+h.dataset.hot] = null; UI.dirty = true; return; }
  const c = e.target.closest('.cell[data-act]'); if (c) { e.preventDefault(); const it = findItem(+c.dataset.act.split(':')[1]); if (it && P.inv.includes(it) && ITEMS[it.id].type !== 'key') { P.inv.splice(P.inv.indexOf(it), 1); drops.push({ kind: 'drop', item: it, x: P.x + rand(-0.4, 0.4), y: P.y + rand(-0.4, 0.4), t: 0, id: uidc++ }); log(`You drop ${itemName(it)}.`, 'sys'); UI.dirty = true; } return; }
  if (e.target.closest('.win')) e.preventDefault();
});
game.addEventListener('pointerover', e => {
  const t = e.target.closest('[data-tip]'); if (t) { const html = typeof sqTipFor === 'function' ? sqTipFor(t) : tipFor(t.dataset.tip); if (html) showTip(html, e.clientX, e.clientY); }
  const b = e.target.closest('[data-bind]'); UI.hoverBind = b && b.dataset.bind ? b.dataset.bind : null;
});
game.addEventListener('pointerout', e => { const t = e.target.closest('[data-tip]'); if (t && !t.contains(e.relatedTarget)) hideTip(); const b = e.target.closest('[data-bind]'); if (b && !b.contains(e.relatedTarget)) UI.hoverBind = null; });
game.addEventListener('pointermove', e => { const el = $('tooltip'); if (!el.hidden && e.target.closest('[data-tip]')) moveTip(e.clientX, e.clientY); });

addEventListener('keydown', e => {
  if (e.target.id === 'sqin' && typeof sqInputKey === 'function') { sqInputKey(e); return; }   // round 9: squad chat input (action.js ignores INPUT targets)
  if (e.target.tagName === 'INPUT') { if (e.key === 'Enter' && !$('title').hidden) $('bNew').click(); if (e.key === 'Enter' && e.target.id === 'petname') { handleAct('petrename'); e.target.blur(); } return; }
  if (e.key === 'Alt') { mouse.alt = true; e.preventDefault(); return; }
  if (!started) return;
  if (e.key === 'Enter' && $('dialog').hidden && !e.repeat && typeof sqFocusChat === 'function' && sqFocusChat()) { e.preventDefault(); return; }   // round 9
  if (!$('dialog').hidden && (e.key === 'Enter' || e.key === ' ')) { const b = $('dopts').querySelector('button:not(.dup)'); if (b && document.activeElement !== b) { b.click(); e.preventDefault(); } return; }
  const k = e.key.toLowerCase();
  if (/^[1-9]$/.test(e.key)) {
    e.preventDefault(); const i = +e.key - 1;
    if (UI.hoverBind) { const [kk, id] = UI.hoverBind.split(':'); if (kk === 'skill' && !P.skills[id]) { log('Learn the skill first.', 'warn'); return; } if (kk === 'item' && ITEMS[id].type !== 'use') { log('Only consumables fit on the hotbar.', 'warn'); return; } bindHot(i, { k: kk, id }); }
    else useHot(i);
    return;
  }
  if (k === 'escape') { if (!$('dialog').hidden) { closeDialog(); return; } let top = null, tz = -1; for (const id in UI.open) if (UI.open[id]) { const z = +$('w-' + id).style.zIndex; if (z > tz) { tz = z; top = id; } } if (top) closeWin(top); return; }
  if (e.ctrlKey || e.metaKey) return;
  const map_ = { a: 'status', i: 'inv', e: 'equip', s: 'skills', j: 'journal', h: 'help', p: 'pet' };
  if (map_[k]) { toggleWin(map_[k]); return; }
  if (k === 't' && typeof sqMulti === 'function' && sqMulti()) { toggleWin('tactics'); return; }   // round 9: squad tactics
  if (k === 'r') { toggleMount(); return; }   // round 6: ride / dismount (action mode: js/action.js)
  if (k === ',' || (k === 'w' && !isAction())) { toggleWin('worldmap'); return; }
  if (k === 'x') { if ((P.skills.basic || 0) < 3) { log('You need Basic Skill 3 to sit.', 'warn'); return; } if (P.target || P.casting) return; P.sitting = !P.sitting; P.path = null; log(P.sitting ? 'You sit and catch your breath.' : 'You stand.', 'sys'); return; }
  if (k === 'z') { let best = null, bd = 3.5; for (const d of drops) { const dd = dist(d, P); if (dd < bd) { bd = dd; best = d; } } if (best) { P.target = null; P.goal = { kind: 'drop', ref: best }; P.path = null; } return; }
  if (k === '[' || k === 'q') { cam.yawT += Math.PI / 8; return; }
  if (k === ']') { cam.yawT -= Math.PI / 8; return; }
  if (k === 'm') { Sfx.on = !Sfx.on; store('aom-sound', Sfx.on ? 'on' : 'off'); log(`Sound ${Sfx.on ? 'on' : 'off'}.`, 'sys'); return; }
});
addEventListener('keyup', e => { if (e.key === 'Alt') mouse.alt = false; });
addEventListener('blur', () => { mouse.alt = false; mouse.down = false; });
addEventListener('resize', () => { resize(); if (map) setScreenParts(); applyUIZ(); fitWins(); if (!$('tooltip').hidden) hideTip(); });

/* =========================================================
   Save / load / boot
   ========================================================= */
const SAVE_KEYS = ['name', 'hair', 'gender', 'hairStyle', 'cls', 'lvl', 'exp', 'jlvl', 'jexp', 'statPts', 'skillPts', 'st', 'skills', 'hp', 'sp', 'zeny', 'inv', 'equip', 'hot', 'map', 'x', 'y', 'lastWay', 'kindled', 'flags', 'lostZeny', 'playTime', 'quests', 'titles', 'title', 'ach', 'storage', 'mail', 'pet', 'mounted'];
function serialize() { if (!P) return null; const o = {}; for (const k of SAVE_KEYS) o[k] = P[k]; o.uidc = uidc; o.v = 1; if (typeof squadSerialize === 'function') { try { squadSerialize(o); } catch (e) { console.error(e); } } return JSON.stringify(o); }   // round 9: core adds o.party / o.lead
function saveGame() { if (!started || !P) return; const s = serialize(); if (s) store('aom-save', s); }
function loadSave() { const raw = store('aom-save'); if (!raw) return null; try { return JSON.parse(raw); } catch (e) { return null; } }
let questMigrate = false;
function applySave(o) {
  P = Object.assign(newPlayer(o.name, o.hair), o); uidc = Math.max(uidc, o.uidc || 1);
  P.flags = Object.assign({ shards: {}, bosses: {}, lore: { ash: true }, tips: {}, talked: {} }, P.flags);
  for (const k of ['shards', 'bosses', 'lore', 'tips', 'talked', 'seen', 'found']) P.flags[k] = P.flags[k] || {};   // found: doors / cave mouths you have seen (UI round 10)
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
  // Round 6: the pet that was out, riding, taming and rebirth records (older saves: none).
  const op = o.pet; P.pet = op && PETS[op.type] ? { type: op.type, name: String(op.name || MOBS[op.type].name).slice(0, 16), hunger: clamp(+op.hunger || 0, 0, 100), intim: clamp(+op.intim || PET_START.intim, 1, 1000), t: +op.t || 0 } : null;
  P.flags.tamed = P.flags.tamed && typeof P.flags.tamed === 'object' ? P.flags.tamed : {};
  if (P.flags.reborn && typeof P.flags.reborn !== 'object') P.flags.reborn = { from: null, skills: {} };
  if (!CLASSES[P.cls]) P.cls = 'novice';
  P.mounted = !!o.mounted && !!P.flags.warg && MOUNT_CLASSES.includes(P.cls);
  for (const list of [P.inv, P.storage]) for (let i = 0; i < list.length; i++) { const it = list[i]; if (stackable(it.id) && it.qty > STACK_MAX && list.length < (list === P.inv ? BAG_SLOTS : STORAGE_SLOTS)) { list.push({ uid: uidc++, id: it.id, qty: it.qty - STACK_MAX }); it.qty = STACK_MAX; } }
  resetRuntime();
  if (typeof squadRestore === 'function') { try { squadRestore(o); } catch (e) { console.error(e); } }   // round 9: core rebuilds PARTY (old saves: a party of one)
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
    <div class="t-card rwin"><div class="rtb"><span>Character</span></div><div class="rbd">
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
  if (HITSTOP > 0) { HITSTOP -= dt; dt *= typeof hitstopScale === 'function' ? hitstopScale() : 0.12; }
  try {
    if (started) hover = pickAt(mouse.x, mouse.y);
    update(dt);
    render(dt);
    if (started) { renderHUD(); if (UI.dirty) renderAll(); worldUIFrame(dt); }   // UI round 10: minimap layers, door prompt, regions
    setCursor(hover ? (hover.kind === 'mob' ? 'atk' : hover.kind === 'drop' ? 'pick' : 'talk') : DP.hov ? 'talk' : 'def');   // UI round 11: a hovered door
  } catch (err) { console.error(err); showErr(err); }
}
// UI round 10: the minimap lives in ui.js now (see "UI round 10" below). drawMinimapExtras / drawMinimap stay callable
// (tests, tools/perf.js) and redraw the marker layer.
function drawMinimapExtras() { if (typeof miniMarkers === 'function' && map) { if (MM.map !== map) miniRebuild(); miniMarkers(); } }
/* Mapfix F3: the travel fade (core.js TRAVEL drives it: travelFadeUI(alpha, loading label)). A black veil over the world,
   under the HUD, that swallows clicks on the world while it is up; past a short wait it names the place being loaded. */
const TFADE = { el: null, lab: null, a: -1, txt: '' };
function travelFadeUI(a, label) {
  if (!TFADE.el) {
    if (a <= 0) return;
    const el = TFADE.el = document.createElement('div'); el.id = 'travelfade';
    el.style.cssText = 'position:absolute;inset:0;background:#07080c;opacity:0;pointer-events:none;display:flex;align-items:flex-end;justify-content:center';
    const lab = TFADE.lab = document.createElement('div');
    lab.style.cssText = 'margin-bottom:14vh;font:700 13px var(--ui,sans-serif);letter-spacing:.18em;color:#a9b4c8;text-shadow:0 1px 2px #000;opacity:0;transition:opacity .25s';
    el.appendChild(lab);
    const cv = $('cv'); if (cv && cv.parentNode) cv.parentNode.insertBefore(el, cv.nextSibling); else document.body.appendChild(el);
  }
  a = Math.max(0, Math.min(1, a));
  if (a !== TFADE.a) { TFADE.a = a; TFADE.el.style.opacity = a.toFixed(3); TFADE.el.style.pointerEvents = a > 0 ? 'auto' : 'none'; TFADE.el.style.visibility = a > 0 ? 'visible' : 'hidden'; }
  const t = label ? `Travelling to ${label}…` : '';
  if (t !== TFADE.txt) { TFADE.txt = t; if (t) TFADE.lab.textContent = t; TFADE.lab.style.opacity = t ? '1' : '0'; }
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
/* =========================================================
   UI round 10: the bigger world (design/world-expansion.md, "UI")
   - Minimap in two canvas layers inside one wrapper (#mmw): #minibase is painted once per map and zoom, #mini
     (markers) is redrawn 8 times a second, and the wrapper and the player arrow (#mmp) move with CSS transforms
     every frame. Maps larger than 64 tiles follow the player at a fixed scale; #mmz toggles whole map / local
     (remembered in localStorage 'aom-mmzoom'). Interiors (render.kind or gen 'interior') get a parchment floor
     plan, caves ('cave') dark stone, and their entry banner becomes a small plaque.
   - Door prompt (#doorp) near `door` warps. Warps fire when you walk onto them (core postMove), so the prompt is a
     label in both control modes; it adds no key of its own.
   - World Map: caves and interiors under their parent map. Parent: MAPDEFS[id].parent if set, else the first map
     whose warp leads there. Found = its door seen within 6 tiles (P.flags.found, saved with flags) or entered
     (P.flags.seen); only found places are listed, greyed until entered.
   - Landmarks (m.landmarks = [{ id, name, x, y, r }], world team) count as regions by radius; visited ones are kept in
     P.flags.found['<map>#<id>'] and listed in the World Map tooltip.
   - Signs: m.objs of kind 'sign' / 'signpost' ({ name, text: string | [pages], dirs: [[dir, label], ...] }) read as a
     carved board (content's OBJ_TALK.sign runs inside that style; signs with `dirs` get the arms drawn here). Regions: m.regions or MAPDEFS[id].regions = [{ name, x0, y0, x1, y1 }] (tiles, inclusive): a
     toast when you walk into one, and its name next to the map's under the minimap.
   ========================================================= */
const SUBKIND = { interior: 1, cave: 1 };
function uiDefKind(d) { if (!d) return null; const r = d.render && d.render.kind; return SUBKIND[r] ? r : SUBKIND[d.gen] ? d.gen : null; }
// A generated map's style: core's m.kind ('cave' | 'interior' | null, from render.kind), else the def's render.kind / gen.
const uiMapKind = m => (m && SUBKIND[m.kind] ? m.kind : m ? uiDefKind(m.d) : null);
const MM_BIG = 64, MM_LOCAL = 44, MM_TILE = 8;   // local view: 44 tiles across, painted at 8 px a tile
const MM = { map: null, mode: '', kind: null, V: 64, S: 4, x0: 0, y0: 0, t: 0, dirty: true, tf: '', pf: '', rf: '', px: NaN, py: NaN, pa: NaN, el: null, zoom: store('aom-mmzoom') === 'whole' ? 'whole' : 'local' };
// Marker colours per minimap style (field / town / dungeon: the old ones).
const MM_COL = {
  field: { mob: '#e04848', boss: '#ff7a2a', npc: '#6aa8ff', warp: '#4ad0ff', lock: '#b03020', ally: '#7ae07a', down: '#8a8078', door: '#ffcf70', doorIn: '#2a1a0c', edge: 'rgba(0,0,0,.6)', sign: '#d0a060' },
  interior: { mob: '#a8281e', boss: '#c85a10', npc: '#2a5aa8', warp: '#1a7a9a', lock: '#9a2010', ally: '#2a8a3a', down: '#8a7a68', door: '#8a4a1a', doorIn: '#f4e4c0', edge: 'rgba(58,36,16,.7)', sign: '#7a5028' },
  cave: { mob: '#ff5a48', boss: '#ff8a3a', npc: '#7ab4ff', warp: '#5ad8ff', lock: '#c03a28', ally: '#8ae88a', down: '#8a8078', door: '#e8d49a', doorIn: '#1a1614', edge: 'rgba(0,0,0,.7)', sign: '#b89060' },
};
function mmEls() {
  if (MM.el) return MM.el;
  const box = $('mapw'); if (!box) return null;
  MM.el = { box, wr: $('mmw'), base: $('minibase'), mk: $('mini'), p: $('mmp'), arrow: $('mmp').firstElementChild, z: $('mmz') };
  MM.el.z.addEventListener('click', e => { e.stopPropagation(); Sfx.click(); MM.zoom = MM.mode === 'local' ? 'whole' : 'local'; store('aom-mmzoom', MM.zoom); MM.dirty = true; });
  return MM.el;
}
function miniRebuild() {
  const E = mmEls(); if (!E || !map) return;
  const m = map, big = Math.max(m.w, m.h) > MM_BIG, local = big && MM.zoom === 'local';
  MM.map = m; MM.dirty = false; MM.kind = uiMapKind(m); MM.mode = local ? 'local' : 'whole';
  MM.V = local ? MM_LOCAL : Math.max(m.w, m.h); MM.S = local ? MM_TILE : Math.max(3, Math.ceil(320 / MM.V));
  const cw = m.w * MM.S, ch = m.h * MM.S;
  for (const c of [E.base, E.mk]) if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
  E.wr.style.width = (m.w / MM.V * 100) + '%'; E.wr.style.height = (m.h / MM.V * 100) + '%';
  E.box.className = 'mapw' + (MM.kind ? ' mm-' + MM.kind : '') + (local ? ' mm-local' : '');
  E.z.hidden = !big; E.z.classList.toggle('whole', !local);
  E.z.title = local ? 'Show the whole map' : 'Follow me (local map)'; E.z.setAttribute('aria-label', E.z.title);
  miniPaintBase(E.base, m, MM.S, MM.kind);
  MM.tf = MM.pf = MM.rf = ''; MM.px = NaN; MM.t = 1;
  LM.key = ''; lmBuild();   // UI round 11: landmark pips (HTML, inside the scrolled wrapper)
  // The entry banner of an interior / cave becomes a plaque in that style (core's banner() drew it this frame).
  const b = MM.kind && $('banner').firstElementChild; if (b && b.classList.contains('bnr')) b.classList.add('loc', MM.kind);
}
// The base layer: the map's own minimap bitmap (fields, towns, dungeons), or a floor plan / cave painted per tile.
function miniPaintBase(c, m, S, kind) {
  const g = c.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height);
  if (!kind) { g.imageSmoothingEnabled = false; g.drawImage(m.mini, 0, 0, m.w * S, m.h * S); return; }
  const inn = kind === 'interior', w = m.w, h = m.h;
  const C = inn ? { bg: [201, 177, 132], floor: [238, 222, 184], wall: [92, 66, 42], prop: [176, 140, 96], water: [125, 156, 176], lava: [200, 90, 40], cry: [150, 110, 200], rim: '#3a2614' }
    : { bg: [11, 10, 10], floor: [70, 66, 61], wall: [36, 33, 31], prop: [104, 98, 90], water: [28, 52, 68], lava: [200, 80, 30], cry: [154, 106, 216], rim: 'rgba(150,140,124,.85)' };
  const col = (c3, v) => `rgb(${clamp(c3[0] + v, 0, 255)},${clamp(c3[1] + v, 0, 255)},${clamp(c3[2] + v, 0, 255)})`;
  const open = t => t === 0 || t === T.WAY;
  g.fillStyle = col(C.bg, 0); g.fillRect(0, 0, w * S, h * S);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, t = m.t[i], v = ((m.var[i] || 0) % 13) - 6;
    let c3 = null;
    if (open(t)) c3 = C.floor; else if (t === T.WALL) c3 = m.vis && m.vis[i] ? C.wall : null;
    else if (t === T.WATER) c3 = C.water; else if (t === T.LAVA) c3 = C.lava; else if (t === T.CRYSTAL) c3 = C.cry;
    else if (t === T.VOID) c3 = null; else c3 = C.prop;
    if (!c3) continue;
    g.fillStyle = col(c3, inn ? (open(t) ? (x + y) % 2 * 4 - 2 + (v >> 2) : v >> 1) : v); g.fillRect(x * S, y * S, S, S);
  }
  // Ink / rim lines where the floor meets a wall: the floor plan's outline.
  g.fillStyle = C.rim; const lw = Math.max(1, Math.round(S * (inn ? 0.22 : 0.18)));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = m.t[y * w + x]; if (t === T.WALL || t === T.VOID) continue;
    const wl = (xx, yy) => xx < 0 || yy < 0 || xx >= w || yy >= h || m.t[yy * w + xx] === T.WALL;
    if (wl(x, y - 1)) g.fillRect(x * S, y * S, S, lw); if (wl(x, y + 1)) g.fillRect(x * S, (y + 1) * S - lw, S, lw);
    if (wl(x - 1, y)) g.fillRect(x * S, y * S, lw, S); if (wl(x + 1, y)) g.fillRect((x + 1) * S - lw, y * S, lw, S);
  }
  // Light: hearths and candles warm a parchment plan; crystals, mushrooms and torches glow in the dark.
  const lights = [].concat(m.lights || [], (m.braziers || []).map(b => ({ x: b.x, y: b.y, r: 3 })));
  if (lights.length) {
    g.globalCompositeOperation = inn ? 'multiply' : 'lighter';
    for (const L of lights) {
      const r = (L.r || 4) * S * (inn ? 0.9 : 0.8), cx = L.x * S, cy = L.y * S, gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      const lc = typeof L.col === 'number' ? '#' + L.col.toString(16).padStart(6, '0') : L.col || (inn ? '#ffc070' : '#ffb060');
      gr.addColorStop(0, inn ? '#f0b060' : lc); gr.addColorStop(1, inn ? '#ffffff' : 'rgba(0,0,0,0)');
      g.globalAlpha = inn ? 0.55 : 0.32; g.fillStyle = gr; g.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  }
  if (inn) {   // paper grain
    const rnd = mulberry32((m.d.seed || 1) * 7 + 3); g.fillStyle = 'rgba(90,60,30,.10)';
    for (let k = 0, n = (w * h * S * S) / 90; k < n; k++) g.fillRect(rnd() * w * S, rnd() * h * S, 1 + rnd() * 1.5, 1);
  }
}
// Per frame: two transforms at most (only when the view or the player moved), the markers 8 times a second.
function miniFrame(dt) {
  const E = mmEls(); if (!E || !map || !P) return;
  if (MM.map !== map || MM.dirty) miniRebuild();
  const m = map, V = MM.V, a = Math.atan2(P.fy || 0, P.fx || 1);
  if (P.x !== MM.px || P.y !== MM.py || a !== MM.pa || !MM.tf) {
    MM.px = P.x; MM.py = P.y; MM.pa = a;
    const x0 = MM.mode === 'local' && m.w > V ? clamp(P.x - V / 2, 0, m.w - V) : (m.w - V) / 2;
    const y0 = MM.mode === 'local' && m.h > V ? clamp(P.y - V / 2, 0, m.h - V) : (m.h - V) / 2;
    MM.x0 = x0; MM.y0 = y0;
    const tf = `translate(${(-x0 / m.w * 100).toFixed(2)}%,${(-y0 / m.h * 100).toFixed(2)}%)`;
    if (tf !== MM.tf) { MM.tf = tf; E.wr.style.transform = tf; }
    const pf = `translate(${((P.x - x0) / V * 100).toFixed(2)}%,${((P.y - y0) / V * 100).toFixed(2)}%)`;
    if (pf !== MM.pf) { MM.pf = pf; E.p.style.transform = pf; }
    const rf = `rotate(${a.toFixed(2)}rad)`; if (rf !== MM.rf) { MM.rf = rf; E.arrow.style.transform = rf; }
  }
  MM.t += dt; if (MM.t >= 0.125) { MM.t = 0; miniMarkers(); }
}
drawMinimap = function () { if (!map) return; if (MM.map !== map || MM.dirty) miniRebuild(); miniMarkers(); };   // tools/perf.js calls this
// The marker layer, in map coordinates (the wrapper's transform scrolls it with the base). Sizes are in "old
// minimap pixels" (the 300 px canvas of before), so markers keep their look at every zoom and HUD size.
function miniMarkers() {
  const E = MM.el; if (!E || MM.map !== map) return;
  const m = map, S = MM.S, u = MM.V * S / 300, g = E.mk.getContext('2d'), C = MM_COL[MM.kind || 'field'];
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, E.mk.width, E.mk.height); g.lineWidth = 1.2 * u;
  const pad = 3, vx0 = MM.x0 - pad, vy0 = MM.y0 - pad, vx1 = MM.x0 + MM.V + pad, vy1 = MM.y0 + MM.V + pad;
  const inV = (x, y) => x >= vx0 && x <= vx1 && y >= vy0 && y <= vy1;
  const dot = (x, y, c, r) => { if (!inV(x, y)) return; g.fillStyle = c; g.beginPath(); g.arc(x * S, y * S, r * u, 0, 7); g.fill(); g.strokeStyle = C.edge; g.stroke(); };
  // lair ring, warps and doors, signs, the Waystone
  if (m.d.boss && m.bossPos && !P.flags.bosses[m.d.boss] && P.flags.seen[m.id]) { g.strokeStyle = 'rgba(255,122,42,.8)'; g.setLineDash([3 * u, 3 * u]); g.beginPath(); g.arc(m.bossPos.x * S, m.bossPos.y * S, 7 * u + 3.5 * S, 0, 7); g.stroke(); g.setLineDash([]); }
  for (const wp of m.warps) {
    const x = wp.x + 0.5, y = wp.y + 0.5; if (!inV(x, y)) continue;
    const locked = wp.lock === 'gate' ? !P.flags.gate : wp.lock ? !!warpLocked(wp) : false;
    if (wp.door) mmDoor(g, x * S, y * S, u, wp.door === 'cave' || uiDefKind(MAPDEFS[wp.to]) === 'cave' ? 'cave' : 'door', locked ? C.lock : C.door, C);
    else dot(x, y, locked ? C.lock : C.warp, 4);
  }
  for (const o of m.objs) if (SIGN_KINDS[o.kind] && inV(o.x, o.y)) { const x = o.x * S, y = o.y * S; g.fillStyle = C.sign; g.strokeStyle = C.edge; g.fillRect(x - 0.7 * u, y - 2 * u, 1.4 * u, 6 * u); g.fillRect(x - 3.6 * u, y - 4 * u, 7.2 * u, 3 * u); g.strokeRect(x - 3.6 * u, y - 4 * u, 7.2 * u, 3 * u); }
  if (m.way && inV(m.way.x, m.way.y)) { const x = m.way.x * S, y = m.way.y * S, r = 5 * u; g.fillStyle = P.kindled[m.id] ? '#ffb050' : '#8a8078'; g.strokeStyle = '#1a1008'; g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath(); g.fill(); g.stroke(); }
  // monsters (named variants larger), lost zeny
  for (const e of mobs) if (!e.dead) dot(e.x, e.y, e.variant ? '#ff4a2a' : e.d.boss ? C.boss : C.mob, e.d.boss ? 5 : e.variant ? 4 : 2.4);
  for (const d of drops) if (d.lost) dot(d.x, d.y, '#ff2a2a', 4);
  // NPCs with their quest mark ('!' new, '?' ready), quest spots (clamped to the view's edge in the local view)
  for (const n of m.npcs) {
    if (!inV(n.x, n.y)) continue;
    if (!(n._qmT > time - 0.3) || n._qmT > time) { n._qm = typeof questMarkerInfo === 'function' ? questMarkerInfo(n) : null; n._qmT = time; }
    const q = n._qm; dot(n.x, n.y, q ? (q.mark === '?' ? '#6ad0ff' : '#ffd040') : C.npc, q ? 4.4 : 3.5);
    if (q) { g.fillStyle = '#1a1008'; g.font = `800 ${7 * u}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(q.mark, n.x * S, n.y * S + 0.4 * u); }
  }
  const spots = typeof questSpots === 'function' ? questSpots() : [];
  for (const q of spots) {
    const c = q.kind === 'inspect' ? '#ffe070' : q.kind === 'waves' || q.kind === 'hunt' ? '#ff8a4a' : '#8ad8ff';
    if (inV(q.x, q.y) || MM.mode !== 'local') { dot(q.x, q.y, c, 3.5); continue; }
    const e = 1.4, x = clamp(q.x, MM.x0 + e, MM.x0 + MM.V - e), y = clamp(q.y, MM.y0 + e, MM.y0 + MM.V - e), an = Math.atan2(q.y - y, q.x - x);
    g.save(); g.translate(x * S, y * S); g.rotate(an); g.fillStyle = c; g.strokeStyle = C.edge; g.beginPath(); g.moveTo(5 * u, 0); g.lineTo(-3 * u, -4 * u); g.lineTo(-3 * u, 4 * u); g.closePath(); g.fill(); g.stroke(); g.restore();
  }
  // squad mode: the other heroes
  if (typeof gfxHeroes === 'function') { const Hs = gfxHeroes(); if (Hs.length > 1) for (const h of Hs) if (h && h !== P && (!h.map || h.map === m.id)) dot(h.x, h.y, h.dead ? C.down : C.ally, 3.2); }
}
// A door (arched leaf) or a cave mouth (dark arch in a rock rim), centred on (x, y) in canvas pixels.
function mmDoor(g, x, y, u, kind, col, C) {
  const w = 4.6 * u, h = 7 * u;
  g.beginPath(); g.moveTo(x - w, y + h * 0.55); g.lineTo(x - w, y - h * 0.1); g.arc(x, y - h * 0.1, w, Math.PI, 0); g.lineTo(x + w, y + h * 0.55); g.closePath();
  g.fillStyle = col; g.fill(); g.strokeStyle = C.edge; g.lineWidth = 1.2 * u; g.stroke();
  g.fillStyle = kind === 'cave' ? '#0e0c0b' : C.doorIn;
  g.beginPath(); const w2 = w * 0.55; g.moveTo(x - w2, y + h * 0.55); g.lineTo(x - w2, y + h * 0.05); g.arc(x, y + h * 0.05, w2, Math.PI, 0); g.lineTo(x + w2, y + h * 0.55); g.closePath(); g.fill();
}
/* ---------- Door prompt, found doors, regions (10 times a second; the prompt follows its door every frame) ---------- */
const DP = { wp: null, key: '', tf: '', t: 0, below: false, hov: null };
// UI round 11 state (declared here, before boot, so the first frame can use it): object prompt, minimap landmarks
const OP = { o: null, key: '', tf: '', below: false };
const LM = { map: null, key: '', t0: 0 };
const RG = { cur: null, pend: null, since: 0, map: null, shown: {}, t: 0 };
const SIGN_KINDS = { sign: 1, signpost: 1 };
// Place icons (door prompt, World Map): a house for rooms, a rock arch for caves (currentColor fill).
const PLACE_PATH = { interior: '<path d="M1.5 7.2L7 2.2L12.5 7.2V12.5H1.5Z" fill="currentColor"/><path d="M5.5 12.5V8.6H8.5V12.5Z" fill="rgba(0,0,0,.5)"/>',
  cave: '<path d="M.8 12.8C.8 6.2 3.6 2.2 7 2.2S13.2 6.2 13.2 12.8Z" fill="currentColor"/><path d="M4 12.8C4 8.9 5.3 6.6 7 6.6S10 8.9 10 12.8Z" fill="rgba(0,0,0,.72)"/>' };
const placeIcon = k => `<svg viewBox="0 0 14 14" aria-hidden="true">${PLACE_PATH[k === 'cave' ? 'cave' : 'interior']}</svg>`;
function worldUIFrame(dt) {
  miniFrame(dt);
  DP.t += dt; if (DP.t >= 0.1) { DP.t = 0; doorTick(); regionTick(); lmTick(); objTick(); }   // UI round 11: landmarks, object prompt
  const el = $('doorp'); if (el && DP.wp) promptAt(el, DP, DP.wp.x + 0.5, DP.wp.y + 0.5, 2.1);
  const oe = $('objp'); if (oe && OP.o) promptAt(oe, OP, OP.o.x, OP.o.y, OBJ_H[OP.o.kind] || 1.8, true);
}
// A world-anchored prompt (door / object): above its anchor, or on the ground below it when the label would sit on the
// hero (an anchor behind you, toward the camera) or under the HUD at the top edge. st keeps the last transform.
// Objects (obj): a label that would cover the hero goes just above the hero's head instead, at the object's x.
function promptAt(el, st, x, y, h, obj) {
  const gh = groundH(x, y), fg = groundH(P.x, P.y), a = pj(x, y, gh + h), b = pj(x, y, gh), f = pj(P.x, P.y, fg);
  let below = a[1] > f[1] - 150 * clamp(PPU / 34, 0.6, 1.6) && a[1] < f[1] + 10 && Math.abs(a[0] - f[0]) < 110, q = below ? b : a[1] < H * 0.26 ? b : a;
  if (!st.hw) st.hw = ((el.firstElementChild && el.firstElementChild.offsetWidth) || 160) / 2;
  if (obj) {
    const hd = pj(P.x, P.y, fg + (typeof headH === 'function' ? headH(P) : 1.8) + 0.25), on = Math.abs(a[0] - f[0]) < st.hw + 26 * clamp(PPU / 34, 0.6, 1.6) && a[1] > hd[1] - 14 && a[1] < f[1] + 10;
    below = false; q = on ? [a[0], hd[1] - 4, hd[2]] : a[1] < H * 0.26 ? b : a;
  }
  const qx = clamp(q[0], st.hw + 6, Math.max(st.hw + 6, W - st.hw - 6));   // kept on screen (phones: a door at the edge)
  const tf = q[2] > 1 ? '' : `translate(${Math.round(qx)}px,${Math.round(q[1] + (below ? 6 : 0))}px)`;
  if (tf !== st.tf) { st.tf = tf; el.style.transform = tf; el.style.visibility = tf ? '' : 'hidden'; }
  if (below !== st.below) { st.below = below; el.classList.toggle('below', below); }
}
function doorTick() {
  const el = $('doorp'); if (!el || !map || !P) return;
  const F = P.flags.found || (P.flags.found = {}); let best = null, bd = 1.6;
  const busy = P.dead || !$('dialog').hidden || (typeof CINE !== 'undefined' && CINE.active);
  for (const wp of map.warps) {
    if (!wp.door) continue; const d = hyp(P.x - wp.x - 0.5, P.y - wp.y - 0.5);
    if (d < 6 && !F[wp.to] && MAPDEFS[wp.to]) { F[wp.to] = 1; if (UI.open.worldmap) UI.dirty = true; }
    if (d < bd) { bd = d; best = wp; }
  }
  // UI round 11: the door under the mouse (a click walks in: doorAtScreen / goDoor) and the key that enters it
  DP.hov = busy || hover || !mouse.seen ? null : doorAtScreen(mouse.x, mouse.y);
  if (!best) best = DP.hov;
  if (busy) best = null;
  const pk = best && isAction() && typeof actPick === 'function' ? actPick() : null;
  const hint = !best ? '' : pk && pk.k === 'door' && pk.r === best ? keyHint() : DP.hov === best || !isAction() ? clickHint() : '';
  const key = best ? best.to + '|' + best.x + '|' + best.y + '|' + (warpLocked(best) ? 1 : 0) + '|' + hint : '';
  if (key === DP.key) return; DP.key = key; DP.wp = best; DP.tf = ''; DP.below = false; DP.hw = 0;
  if (!best) { el.hidden = true; return; }
  const to = MAPDEFS[best.to], kin = uiDefKind(to) || (typeof mapCache !== 'undefined' && mapCache[best.to] ? uiMapKind(mapCache[best.to]) : null), cave = best.door === 'cave' || kin === 'cave', out = !kin && !!uiMapKind(map);
  const name = best.label || (to && to.name) || '';
  const verb = warpLocked(best) ? 'Sealed' : out ? 'Exit to' : 'Enter';
  el.className = 'doorp' + (cave ? ' cave' : '') + (warpLocked(best) ? ' locked' : '');
  el.innerHTML = `<div><span class="di">${placeIcon(cave ? 'cave' : 'interior')}</span><span class="dv">${verb}</span> <b>${esc(name)}</b>${hintTag(hint)}</div>`; DP.cls = el.className;
  el.hidden = false; el.style.visibility = 'hidden';
}
function mapRegions(m) { return (m && (m.regions || (m.d && m.d.regions))) || null; }
// Rectangles (m.regions) first, else the nearest landmark whose radius you stand in (m.landmarks = [{ id, name, x, y, r }]).
function regionAt(m, x, y) {
  const L = mapRegions(m); if (L) for (const r of L) if (x >= r.x0 && x < r.x1 + 1 && y >= r.y0 && y < r.y1 + 1) return r;
  let best = null, bd = 1e9; if (m && m.landmarks) for (const l of m.landmarks) { const d = hyp(x - l.x, y - l.y); if (l.name && d <= (l.r || 6) && d < bd) { bd = d; best = l; } }
  return best;
}
function regionTick() {
  if (!map || !P) return;
  const r = regionAt(map, P.x, P.y);
  if (RG.map !== map) { RG.map = map; RG.cur = r; RG.pend = r; RG.since = time; return; }   // the map banner names the place
  if (r !== RG.pend) { RG.pend = r; RG.since = time; return; }
  if (r === RG.cur || time - RG.since < 0.5) return;
  RG.cur = r;
  if (r) { const F = P.flags.found || (P.flags.found = {}), k = map.id + '#' + (r.id || r.name); if (!F[k]) { F[k] = 1; if (UI.open.worldmap) UI.dirty = true; } }   // places you have been (World Map tooltip)
  if (r && !(time - (RG.shown[map.id + '|' + r.name] || -1e9) < 45)) { RG.shown[map.id + '|' + r.name] = time; regionToast(r.name, map.d.name); }
}
function regionToast(name, sub) {
  const el = $('rgnt'); if (!el) return;
  el.innerHTML = `<div class="rg"><div class="a">${esc(name)}</div><div class="b">${esc(sub || '')}</div></div>`;
}
/* ---------- Signs ---------- */
if (typeof useObj === 'function') { const baseUseObj = useObj; useObj = function (o) { return o && SIGN_KINDS[o.kind] ? readSign(o) : baseUseObj(o); }; }
const SIGN_ARROW = { N: '↑', S: '↓', E: '→', W: '←', NE: '↗', NW: '↖', SE: '↘', SW: '↙' };
function signHTML(o, page) {
  const dirs = Array.isArray(o.dirs) && o.dirs.length && page === 0 ? `<div class="sgn-dirs">${o.dirs.map(([d, l]) => { const dd = String(d).toUpperCase(); return `<div class="sgn-arm ${/W/.test(dd) && !/E/.test(dd) ? 'l' : 'r'}"><b>${SIGN_ARROW[dd] || esc(d)}</b>${esc(l)}</div>`; }).join('')}</div>` : '';
  const pages = Array.isArray(o.text) ? o.text : o.text ? [o.text] : [];
  return dirs + (pages[page] ? `<div class="sgn-t">${pages[page]}</div>` : '');
}
async function readSign(o) {
  const dg = $('dialog'); dg.classList.add('sign');
  try {
    // content's own reader (OBJ_TALK.sign: say(name, text)) runs inside the board style; direction arms (o.dirs) are drawn here
    if (!(Array.isArray(o.dirs) && o.dirs.length) && typeof OBJ_TALK !== 'undefined' && OBJ_TALK[o.kind]) { await OBJ_TALK[o.kind](o); return; }
    const n = Math.max(1, Array.isArray(o.text) ? o.text.length : 1), pages = [];
    for (let i = 0; i < n; i++) pages.push(signHTML(o, i) || '<i>The letters have weathered away.</i>');
    await say(o.name || 'Signpost', pages);
  } finally { dg.classList.remove('sign'); }
}
/* ---------- World Map: caves and interiors under their parent map ---------- */
let WM_SUBS = null;
function wmSubs() {
  if (WM_SUBS) return WM_SUBS;
  const par = {}, kind = {}, list = {}, ids = Object.keys(MAPDEFS).filter(k => !MAPDEFS[k].deep);
  for (const k of ids) { const d = MAPDEFS[k], mk = uiDefKind(d); if (mk) kind[k] = mk; if (d.parent && MAPDEFS[d.parent] && d.parent !== k) par[k] = d.parent; }
  const order = MAP_ORDER.filter(k => MAPDEFS[k]).concat(ids.filter(k => !MAP_ORDER.includes(k)));
  for (const k of order) {
    let gm; try { gm = genMap(k); } catch (e) { continue; }
    const ws = gm.warps; if (!kind[k] && uiMapKind(gm)) kind[k] = uiMapKind(gm);
    for (const wp of ws) {
      const t = wp.to; if (!MAPDEFS[t] || MAPDEFS[t].deep || t === k || MAP_ORDER.includes(t)) continue;
      if (!kind[t] && wp.door) kind[t] = wp.door === 'cave' ? 'cave' : 'interior';
      if (!par[t]) par[t] = k;
    }
  }
  WM_SUBS = { par, kind, list };
  for (const k of order) if (kind[k] && !MAP_ORDER.includes(k)) { const r = wmRoot(k); if (r !== k) (list[r] = list[r] || []).push(k); }
  return WM_SUBS;
}
function wmRoot(k) { if (!WM_SUBS && !MAP_ORDER.includes(k)) wmSubs(); let n = 0; while (WM_SUBS && !MAP_ORDER.includes(k) && WM_SUBS.par[k] && n++ < 8) k = WM_SUBS.par[k]; return k; }
const wmFound = k => !!(P.flags.seen[k] || (P.flags.found && P.flags.found[k]));
function wmBadge(k, x, y) {
  const L = (wmSubs().list[k] || []).filter(wmFound); if (!L.length) return '';
  const nI = L.filter(s => WM_SUBS.kind[s] !== 'cave').length, nC = L.length - nI;
  let bx = x - 66, out = '';
  for (const [k, n] of [['interior', nI], ['cave', nC]]) if (n) { out += `<svg x="${bx}" y="${y + 7}" width="11" height="11" viewBox="0 0 14 14" color="#c8a860">${PLACE_PATH[k]}</svg><text x="${bx + 11.5}" y="${y + 16.5}" font-size="10" fill="#c8a860">${n}</text>`; bx += 12 + 6.5 * String(n).length + 2; }
  return out;
}
function wmTipSubs(k) {
  const all = wmSubs().list[k] || [], L = all.filter(wmFound), F = P.flags.found || {};
  const m = mapCache[k], places = m ? (mapRegions(m) || []).filter(r => r.name && F[k + '#' + (r.id || r.name)]).map(r => r.name) : [];
  const lms = m && m.landmarks ? m.landmarks.filter(l => l.name) : [], lv = lms.filter(l => F[k + '#' + (l.id || l.name)]);   // UI round 11
  return (all.length ? `<div class="tt-l" style="margin-top:3px">${L.length ? esc(L.map(s => MAPDEFS[s].name).join(', ')) : 'No caves or rooms found yet'}${all.length > L.length ? ` <span class="muted">(+${all.length - L.length} undiscovered)</span>` : ''}</div>` : '')
    + (places.length ? `<div class="tt-l" style="margin-top:3px">Visited: ${esc(places.join(', '))}</div>` : '')
    + (lms.length ? `<div class="tt-l" style="margin-top:3px"><span style="color:#ffe6a8">◆</span> Landmarks ${lv.length}/${lms.length}${lv.length ? ': ' + esc(lv.map(l => l.name).join(', ')) : ' <span class="muted">(none found yet)</span>'}</div>` : '');
}
function wmPlacesHTML() {
  const S = wmSubs(), rows = [];
  for (const k of MAP_ORDER) {
    const all = S.list[k] || [], L = all.filter(wmFound); if (!L.length) continue;
    const chips = L.map(s => { const cave = S.kind[s] === 'cave', here = map.id === s; return `<span class="wms${cave ? ' cave' : ''}${P.flags.seen[s] ? '' : ' unv'}${here ? ' here' : ''}" data-tip="wms:${s}"><i>${placeIcon(cave ? 'cave' : 'interior')}</i>${esc(MAPDEFS[s].name)}</span>`; }).join('');
    rows.push(`<div class="wmg"><b>${esc(MAPDEFS[k].name)}</b><div>${chips}${all.length > L.length ? `<span class="wmu">+${all.length - L.length} undiscovered</span>` : ''}</div></div>`);
  }
  return rows.length ? `<div class="sec">Caves and interiors</div><div class="wmplaces">${rows.join('')}</div>` : '';
}
addEventListener('resize', () => { MM.tf = ''; });
function boot(data) {
  resize();
  P = newPlayer('Unkindled', '#b9b3a8'); resetRuntime(); calcStats();
  map = genMap('emberhold'); P.x = 18.5; P.y = 20.5; spawnAll(); enterWorld(); setScreenParts();
  if (data && data.save) { try { applySave(JSON.parse(data.save)); startGame(false); } catch (e) { showTitle(); } }
  else showTitle();
  requestAnimationFrame(frame);
}
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { for (const k in iconCache) if (k.startsWith('sk|') || k.startsWith('shard')) delete iconCache[k]; for (const k in iconCache) if (k.startsWith('shard|')) delete iconCache[k]; UI.dirty = true; UI.hotSig = null; if (P && started) renderBuffs(); });
const hot = window.claude && window.claude.hot;
if (hot && typeof hot.snapshot === 'function') hot.snapshot(() => ({ save: started ? serialize() : null }));
if (hot && typeof hot.ready === 'function') hot.ready(boot); else boot((hot && hot.data) || {});


/* =========================================================
   Content round 6: the Pet window, graphics options, HUD menu button
   ========================================================= */
const petBar = (v, max, col) => `<div class="pbar"><i style="width:${clamp(v / max * 100, 0, 100).toFixed(1)}%;background:linear-gradient(${col},${col}cc)"></i></div>`;
RENDER.pet = function () {
  const p = P.pet, eggs = P.inv.filter(i => ITEMS[i.id].effect === 'egg'), food = countItem('pet_food');
  let h = '';
  if (p) {
    const T = PETS[p.type], on = p.intim >= PET_BONUS_AT, bonus = Object.entries(T.bonus).map(([a, v]) => bonusLine(a, v)).join(', ');
    h += `<div class="petcard"><div class="well pspr" data-pspr="${p.type}" title="${esc(MOBS[p.type].name)}">${ITEMS['egg_' + p.type] ? icoTag('egg_' + p.type) : ''}</div><div><b style="font-size:15px">${esc(p.name)}</b><div class="muted" style="font-size:11.5px">${esc(MOBS[p.type].name)} · Lv ${MOBS[p.type].lvl} · out with you</div><div class="petmood ${p.intim >= PET_BONUS_AT ? 'on' : ''}">${petWord(PET_INTIM_WORDS, p.intim)}${p.hunger <= 25 ? ' · hungry' : ''}</div></div></div>`;
    h += `<div class="drow" style="margin-top:8px"><span>Hunger</span><b>${petWord(PET_HUNGER_WORDS, p.hunger)} · ${Math.round(p.hunger)}/100</b></div>${petBar(p.hunger, 100, p.hunger <= 25 ? '#d0582a' : p.hunger > 90 ? '#c8a040' : '#6ab04a')}`;
    h += `<div class="drow"><span>Intimacy</span><b>${petWord(PET_INTIM_WORDS, p.intim)} · ${Math.round(p.intim)}/1000</b></div>${petBar(p.intim, 1000, on ? '#e8709a' : '#b88aa0')}`;
    h += `<p class="muted" style="margin:0 0 6px;font-size:11.5px">Bonus while Cordial or Loyal (${PET_BONUS_AT}+): <b style="color:${on ? 'var(--ember)' : 'inherit'}">${esc(bonus)}</b> · ${on ? 'active' : 'not yet'}</p>`;
    const nm = UI.petDraft != null ? UI.petDraft : p.name;
    h += `<div class="row" style="gap:6px"><input id="petname" maxlength="16" value="${esc(nm)}" autocomplete="off" spellcheck="false" style="flex:1;min-width:0" aria-label="Pet name"><button class="btn" data-act="petrename">Rename</button></div>`;
    h += `<div class="row" style="gap:6px;margin-top:6px"><button class="btn" data-act="petfeed" ${food ? '' : 'disabled'}>Feed · Pet Food ×${food}</button><button class="btn" data-act="petegg">Back to its egg</button></div>`;
    h += `<p class="muted" style="margin:6px 0 0;font-size:11px">Feed it when it is Hungry: it grows fond of you. Overfed (Satisfied or Stuffed) it sulks. Left starving, it loses heart and one day runs away. Hunger falls a point a minute.</p>`;
  } else h += '<p class="muted" style="margin:0">No pet is out. Buy a taming sweet at Ylva’s stable in Skaldhaven, use it near that monster once it is worn down, and hatch the egg here.</p>';
  if (eggs.length) h += `<div class="sec">Eggs</div><div class="list">${eggs.map(e => `<div class="li" data-tip="item:${e.uid}">${icoBox(e.id)}<span>${esc((e.pet && e.pet.name) || MOBS[ITEMS[e.id].pet].name)} <span class="muted">· ${esc(MOBS[ITEMS[e.id].pet].name)}${e.pet ? ' · ' + petWord(PET_INTIM_WORDS, e.pet.intim) : ''}</span></span><button class="btn" data-act="pethatch:${e.uid}">Hatch</button></div>`).join('')}</div>`;
  if (hugClass()) { const c = HUG.c, st = !c ? '' : c.mode === 'perch' ? 'perched on your shoulder' : c.mode === 'dive' ? 'diving' : 'flying beside you'; h += `<div class="sec">Huginn</div><p class="muted" style="margin:0;font-size:11.5px">Odin’s raven hunts with you${st ? `, ${st}` : ''}. Blitz Beat sends him diving (and he dives by himself on some of your attacks)${P.skills.huginn_muninn ? '; Huginn & Muninn sends both ravens' : ''}. He needs no food: he steals yours.</p>`; }
  const T = P.flags.tamed || {};
  h += `<div class="sec">Tameable in Midgard</div><div class="list">${Object.keys(PETS).map(k => `<div class="li" data-tip="shop:${PETS[k].tame}"><span class="ico pthumb" data-pspr="${k}" data-sz="thumb">${icoTag(PETS[k].tame)}</span><span>${esc(MOBS[k].name)} <span class="muted">· ${esc(ITEMS[PETS[k].tame].name)} · Lv ${MOBS[k].lvl}</span></span><span class="muted">${T[k] ? '✓ tamed' : ''}</span></div>`).join('')}</div>`;
  return h;
};
addEventListener('input', e => { if (e.target && e.target.id === 'petname') UI.petDraft = e.target.value; });
// Graphics options (Help window): presets, adaptive quality and a live readout (GFX in js/gfx-world.js).
function gfxInfoText() {
  try { const i = GFX.autoInfo(); return `${Math.round(i.fps || 0)} fps · ${(i.frameMs || 0).toFixed(1)} ms · ${i.auto ? `auto level ${i.level}/${Math.max(0, i.levels - 1)}` : 'fixed'} · scale ${Math.round((i.scale || 1) * 100)}%`; } catch (e) { return ''; }
}
function gfxOptionsHTML() {
  if (typeof GFX === 'undefined' || !GFX.setQuality) return '';
  const qs = ['low', 'medium', 'high', 'ultra'];
  return `<div class="sec">Graphics</div><div class="tabs">${qs.map(q => `<button class="btn ${GFX.quality === q ? 'on' : ''}" data-act="gfxq:${q}">${q[0].toUpperCase() + q.slice(1)}</button>`).join('')}</div>
    <div class="row" style="justify-content:space-between;gap:8px;margin-top:4px"><button class="btn ${GFX.auto ? 'on' : ''}" data-act="gfxauto">${GFX.auto ? '☑' : '☐'} Auto quality</button><span class="muted" id="gfxinfo" style="font-size:11.5px">${gfxInfoText()}</span></div>
    <div class="row" style="margin-top:4px"><button class="btn ${typeof GFX !== 'undefined' && GFX.animeFx !== false ? 'on' : ''}" data-act="gfxanime">${typeof GFX !== 'undefined' && GFX.animeFx !== false ? '☑' : '☐'} Anime combat effects</button></div>
    <p class="muted" style="font-size:11px;margin:4px 0 0">Low is for phones and old laptops; Ultra wants a strong graphics card. Auto lowers the render scale and effects when frames run slow and raises them again when there is headroom. Both are remembered in this browser.</p>`;
}
(function () {
  const ga = store('aom-gfx-auto'); if (ga && typeof GFX !== 'undefined') GFX.auto = ga === 'on';
  const m = document.querySelector('.menu');
  if (m && !m.querySelector('[data-win="pet"]')) { const b = document.createElement('button'); b.className = 'btn'; b.dataset.win = 'pet'; b.innerHTML = 'Pet<kbd>P</kbd>'; m.insertBefore(b, m.querySelector('[data-win="help"]')); }
})();


/* =========================================================
   UI round 8: the Deep Roots and the Gauntlet (content round 7), the pet's portrait, the rebirth ceremony.
   Hooks (nothing in js/core.js or js/data/* is edited; every call into them is guarded with typeof):
   - Ganglati's and Ganglöt's menus are dialog panels (DLG_PANELS, next to dialog() above).
   - rushStart is wrapped: a run that starts opens the Gauntlet window. talkGanglot is wrapped: during a run Ganglöt's
     "Busy" line gives way to that window (it holds the clock and the Abandon button).
   - rebirth is wrapped: when it returns true, the Reborn ceremony plays (rebornCeremony, skippable).
   All three are global function declarations called by name at call time (npcs.js, NPCS[..].talk, OBJ_TALK), so
   reassigning the global binding from here reaches every caller.
   ========================================================= */
const fmtClock = t => typeof rushClock === 'function' ? rushClock(t) : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}.${Math.floor((t * 10) % 10)}`;
const chip = (k, v, cls) => `<div class="chip${cls ? ' ' + cls : ''}"><b>${v}</b><span>${k}</span></div>`;
const ico16 = id => ITEMS[id] ? `<span class="rw-i">${icoTag(id)}</span>` : '';

/* ---------- The Deep Roots ---------- */
function deepInfo() {
  const D = deepState(), run = D.run || null, cp = run && run.cp > 1 ? run.cp : 1, cps = [1];
  for (let n = 6; n <= cp; n += 5) cps.push(n);
  if (cp > 1 && !cps.includes(cp)) cps.push(cp);
  return { D, run, cp, cps };
}
const deepLv = n => typeof deepLevel === 'function' ? deepLevel(n) : Math.min(130, 71 + 2 * n);
function deepPlanOf(n, run) { try { return typeof deepPlan === 'function' ? deepPlan(n, run ? run.seed : 1) : null; } catch (e) { return null; } }
// What opening floor n's portal pays (deepReward in js/core.js; `plan` gives the affixes, null = not rolled yet).
function deepRewardRows(n, plan) {
  const boss = n % 5 === 0, aff = plan ? plan.aff : [], g = aff.includes('gilded') ? 2 : 1, rows = [];
  rows.push([ico16('hel_obol'), `${(boss ? 5 + n : n) * g} Hel’s Obols`]);
  rows.push(['<span class="rw-z">z</span>', `${fmt(1500 * n * g)} zeny`]);
  rows.push([ico16('gjoll_draught'), `Draught of Gjöll ×${1 + Math.floor(n / 4)}`]);
  rows.push([`<span class="rw-i"><img class="ic" src="${groupIconURL('sword')}" alt=""></span>`, boss ? `Lv ${Math.min(99, deepLv(n))} gear at the portal` : `Gear: ${Math.min(100, 40 + 2 * n)} % chance${aff.includes('restless') ? ', +50 % a second piece' : ''}`]);
  if (boss) { rows.push([ico16('black_sun_shard'), 'Shard of the Black Sun']); if (n >= 10) rows.push([ico16('golden_apple'), 'Golden Apple']); }
  return `<div class="rw">${rows.map(([i, t]) => `<div>${i}<span>${t}</span></div>`).join('')}</div>`;
}
function deepAffHTML(plan, n, fresh) {
  if (fresh && n === 1) return '<p class="muted dnote">Floor 1 never has an affix. A new descent rolls new floors, and each stays the same until you start again.</p>';
  if (!plan) return '<p class="muted dnote">Not rolled yet.</p>';
  if (!plan.aff.length) return '<p class="muted dnote">No affix: an ordinary floor of the dead.</p>';
  return plan.aff.map(k => { const A = typeof DEEP_AFFIXES !== 'undefined' && DEEP_AFFIXES[k]; return A ? `<div class="aff a-${k}"><b>${esc(A.name)}</b><span>${esc(A.desc)}</span></div>` : ''; }).join('');
}
// The depth ladder: floors in runs of five (every fifth a boss floor), the deepest you ever reached in gold, this
// descent's cleared floors filled, checkpoints as buttons when `pick` (the floor select), the chosen one ringed.
function deepLadder(I, sel, pick) {
  const { D, run, cps } = I, far = Math.max(D.best, run ? run.floor || 0 : 0, I.cp), top = Math.min(60, Math.max(10, Math.ceil((far + 1) / 5) * 5 + (far >= 5 ? 5 : 0)));
  let h = '<div class="ladder">';
  for (let s = 1; s <= top; s += 5) {
    h += '<div class="lseg">';
    for (let n = s; n < s + 5; n++) {
      const cp = cps.includes(n), c = ['fc', n % 5 === 0 ? 'boss' : '', n <= D.best ? 'best' : '', run && n <= (run.cleared || 0) ? 'clr' : '', cp ? 'cp' : '', n === sel ? 'sel' : '', run && n === run.floor ? 'here' : ''].filter(Boolean).join(' ');
      const tip = `Floor ${n} · Lv ${deepLv(n)}${n % 5 === 0 ? ' · boss' : ''}${cp ? (n === 1 ? ' · new descent' : ' · checkpoint') : ''}`;
      h += cp && pick ? `<button class="${c}" data-dsel="${n}" title="${tip}" aria-label="${tip}">${n}</button>` : `<span class="${c}" title="${tip}">${n}</span>`;
    }
    h += '</div>';
  }
  return h + '</div><div class="lleg"><span><i class="fc cp"></i>checkpoint</span><span><i class="fc boss"></i>boss floor</span><span><i class="fc best"></i>reached</span><span><i class="fc clr"></i>cleared this descent</span></div>';
}
function deepRecords(I) {
  const { D, run } = I;
  return `<div class="chips">${chip('deepest floor', D.best || '—', 'big')}${chip('floors cleared', fmt(D.floors))}${chip('descents', fmt(D.runs))}${chip('old beasts', fmt(D.bosses))}</div>`
    + (run ? `<p class="muted dnote">This descent: floor ${run.floor || 0} reached, ${run.cleared || 0} cleared, checkpoint ${run.cp || 1}. <span class="seed">Descent ${String(run.seed).slice(-5)}</span></p>` : '<p class="muted dnote">No descent yet.</p>');
}
// Ganglati's panel (the dialog): records, the floor select, the chosen floor's affixes and rewards.
function deepPanel(text, opts) {
  const I = deepInfo(), { run, cp, cps } = I;
  if (!cps.includes(UI.deepSel)) UI.deepSel = cp;
  const sel = UI.deepSel, fresh = sel === 1, plan = fresh ? null : deepPlanOf(sel, run);
  const nb = Math.ceil(sel / 5) * 5, nbPlan = deepPlanOf(nb, fresh ? null : run);
  const nbName = !fresh && nbPlan && nbPlan.bossType && MOBS[nbPlan.bossType] ? MOBS[nbPlan.bossType].name : 'one of Midgard’s great beasts';
  let h = deepRecords(I);
  h += `<div class="sec">Choose where to start</div>${deepLadder(I, sel, true)}`;
  h += `<div class="dsel"><div class="dsh"><b>${fresh ? 'Floor 1 · a new descent' : `Floor ${sel} · checkpoint`}</b><span>Lv ${deepLv(sel)}</span></div>`;
  if (fresh && run && cp > 1) h += '<p class="warnl">Starting again forgets this descent’s floors and its checkpoint.</p>';
  h += `<div class="dcol"><div><div class="sub">Affix</div>${deepAffHTML(plan, sel, fresh)}<div class="sub">Next boss</div><p class="muted dnote">Floor ${nb}: ${esc(nbName)}. Beat it and floor ${nb + 1} becomes a checkpoint.</p></div>`;
  h += `<div><div class="sub">When its way down opens</div>${deepRewardRows(sel, plan)}</div></div></div>`;
  const iNew = opts.findIndex(o => /^Begin a new descent/.test(o)), iRet = opts.findIndex(o => /^Return to floor/.test(o)), iTell = opts.findIndex(o => /^Tell me/.test(o)), bye = dlgBye(opts);
  const show = [], extra = [];
  if (fresh && iNew >= 0) show.push(iNew);
  else if (!fresh && sel === cp && iRet >= 0) show.push(iRet);
  else extra.push({ label: `Return to floor ${sel} (checkpoint)`, act: 'deep:' + sel });
  if (iTell >= 0) show.push(iTell); if (!show.includes(bye)) show.push(bye);
  return { html: h, show, primary: show[0] === iTell ? -1 : show[0], extra };
}
// The Deep window: on a floor, that floor (affixes, how far to the way down, what it pays); elsewhere, the records.
RENDER.deep = function () {
  if (typeof deepState !== 'function') return '<p class="muted">The Deep Roots are not open.</p>';
  const I = deepInfo(), on = !!(map && map.d && map.d.deep), n = on ? map.d.deep : 0;
  let h = '';
  if (on) {
    const plan = map.d.plan || deepPlanOf(n, I.run), Dp = typeof DEEP !== 'undefined' ? DEEP : null, cleared = !!(Dp && Dp.id === map.id && Dp.cleared);
    const pct = Dp && Dp.total ? Dp.killed / Dp.total : 0, need = typeof DEEP_CLEAR === 'number' ? DEEP_CLEAR : 0.6;
    const guard = plan && plan.boss ? (Dp && Dp.boss ? `${esc(Dp.boss.d.name)}${Dp.boss.dead ? ' has fallen' : ' waits in the arena'}` : 'the floor’s master') : (Dp && Dp.warden ? (Dp.warden.dead ? 'the warden is dead' : 'the warden keeps the far hall') : '');
    h += `<div class="dsel here"><div class="dsh"><b>Floor ${n}${plan && plan.boss ? ' · boss floor' : ''}</b><span>Lv ${plan ? plan.lvl : deepLv(n)}</span></div>`;
    h += `<div class="sub">Affix</div>${deepAffHTML(plan, n, false)}`;
    h += `<div class="sub">The way down</div>`;
    if (cleared) h += '<p class="okl">Open. The portal burns green, and this floor has paid.</p>';
    else if (plan && plan.boss) h += `<p class="muted dnote">Sealed until the master falls: ${guard}.</p>`;
    else h += `<div class="dprog"><i style="width:${Math.min(100, pct / need * 100).toFixed(1)}%"></i><em>${Math.round(pct * 100)} % of ${Math.round(need * 100)} % laid to rest</em></div><p class="muted dnote">Or kill its warden: ${guard}.</p>`;
    h += `<div class="sub">${cleared ? 'It paid' : 'It will pay'}</div>${deepRewardRows(n, plan)}`;
    h += '<p class="muted dnote">The stair back to Helheim is always open in the start room. A fall sends you to your Waystone or Hlín’s camp.</p></div>';
    h += `<div class="sec">Records</div>${deepRecords(I)}${deepLadder(I, n, false)}`;
  } else {
    h += deepRecords(I) + `<div class="sec">Depth</div>${deepLadder(I, 0, false)}<p class="muted dnote">Ganglati keeps the stair east of the Helheim camp. Speak with him to choose a floor.</p>`;
  }
  return h;
};

/* ---------- The Gauntlet ---------- */
function rushBoard(R) {
  if (!R.board.length) return '<p class="muted dnote">No clears yet. The benches are patient. They are dead.</p>';
  return `<ol class="board">${R.board.slice(0, 5).map((e, i) => `<li class="${i === 0 ? 'top' : ''}"><b>${fmtClock(e.t)}</b><span>${esc(CLASSES[e.cls] ? CLASSES[e.cls].name : e.cls)} · Lv ${e.lvl}</span><em>${esc(e.day || '')}</em></li>`).join('')}</ol>`;
}
const rushHPOf = i => typeof rushHP === 'function' ? rushHP(i) : 60000 + 15000 * i;
function rushList(live) {
  const on = live && RUSH.on;
  return `<ol class="mvps">${RUSH_LIST.map((k, i) => {
    const done = on && i < RUSH.i, now = on && i === RUSH.i, split = done ? RUSH.splits[i] : null;
    const st = done ? `<b class="ok">✓ ${fmtClock(split)}</b>` : now ? (RUSH.cur && !RUSH.cur.dead ? '<b class="now">fighting</b>' : '<b class="now">next</b>') : `<span>${Math.round(rushHPOf(i) / 1000)}k HP</span>`;
    return `<li class="${done ? 'done' : now ? 'now' : ''}"><i>${i + 1}</i><span class="mn">${esc(MOBS[k] ? MOBS[k].name : k)}</span>${st}${now && live ? '<div class="gcur"><i id="gcurb"></i></div>' : ''}</li>`;
  }).join('')}</ol>`;
}
// Ganglöt's panel (the dialog): the rules, the nine, the bests.
function rushPanel(text, opts) {
  const R = rushState();
  const h = `<div class="chips">${chip('personal best', R.best ? fmtClock(R.best) : '—', 'big')}${chip('runs', fmt(R.runs))}${chip('clears', fmt(R.clears))}</div>`
    + `<p class="muted dnote">Nine great beasts, all Lv ${typeof RUSH_LV !== 'undefined' ? RUSH_LV : 90}, one after another; 4 s between them, with a quarter of your HP and SP back. The clock runs from the first to the last. Fall, or leave the hall, and it is over. Faster pays more Obols.</p>`
    + `<div class="dcol"><div><div class="sub">Tonight’s beasts</div>${rushList(false)}</div><div><div class="sub">Personal bests</div>${rushBoard(R)}</div></div>`;
  const iGo = opts.findIndex(o => /^Begin the Gauntlet/.test(o)), bye = dlgBye(opts);
  return { html: h, show: [iGo, bye].filter(i => i >= 0), primary: iGo };
}
// The Gauntlet window: the live clock, the nine with splits, the current beast's health, start / abandon, the bests.
RENDER.gauntlet = function () {
  if (typeof rushState !== 'function' || typeof RUSH === 'undefined') return '<p class="muted">The Gauntlet is not open.</p>';
  const R = rushState(), on = RUSH.on, inHall = !!(map && map.id === 'helheim_arena');
  const nm = on && RUSH_LIST[RUSH.i] && MOBS[RUSH_LIST[RUSH.i]] ? MOBS[RUSH_LIST[RUSH.i]].name : '';
  let h = `<div class="gclock ${on ? 'on' : ''}"><b id="gclk">${fmtClock(on ? RUSH.t : 0)}</b><span>${on ? `Beast ${Math.min(RUSH.i + 1, RUSH_LIST.length)} of ${RUSH_LIST.length} · ${esc(nm)}` : R.best ? `Best ${fmtClock(R.best)}` : 'Not running'}</span></div>`;
  h += rushList(true);
  if (on) h += `<button class="btn warn wide" data-act="rushquit">${UI.rushArm ? 'Confirm: abandon the run' : 'Abandon the run'}</button>`;
  else h += `<button class="btn big wide" data-act="rushgo" ${inHall ? '' : 'disabled'}>Begin the Gauntlet</button>${inHall ? '' : '<p class="muted dnote">Only in Eljudnir, before Hel’s high seat.</p>'}`;
  h += `<div class="sec">Personal bests <span class="muted" style="font-weight:400">· runs ${R.runs} · clears ${R.clears}</span></div>${rushBoard(R)}`;
  return h;
};
// Per frame while it is open (renderHUD): the clock text and the beast's health bar; a re-render when the run moves on.
let RUSHUI = { sig: '', t: -1 };
function rushTickUI() {
  if (typeof RUSH === 'undefined') return;
  const sig = RUSH.on + '|' + RUSH.i + '|' + !!(RUSH.cur && !RUSH.cur.dead) + '|' + (typeof P.flags.rush === 'object' ? P.flags.rush.clears : 0);
  if (sig !== RUSHUI.sig) { RUSHUI.sig = sig; if (!RUSH.on) UI.rushArm = false; renderWin('gauntlet'); }
  if (!RUSH.on) return;
  const tt = Math.floor(RUSH.t * 10); if (tt !== RUSHUI.t) { RUSHUI.t = tt; const c = $('gclk'); if (c) c.textContent = fmtClock(RUSH.t); }
  const b = $('gcurb'); if (b && RUSH.cur) { const w = Math.round(clamp(RUSH.cur.hp / (RUSH.cur.maxhp || 1), 0, 1) * 1000) / 10 + '%'; if (b.style.width !== w) b.style.width = w; }
}
if (typeof rushStart === 'function') {
  const baseRushStart = rushStart;
  // eslint-disable-next-line no-global-assign
  rushStart = function () { const r = baseRushStart.apply(this, arguments); if (r) { UI.rushArm = false; openWin('gauntlet'); } return r; };
}
if (typeof talkGanglot === 'function') {
  const baseTalkGanglot = talkGanglot;
  // eslint-disable-next-line no-global-assign
  talkGanglot = async function () { if (typeof RUSH !== 'undefined' && RUSH.on && P.flags.talked && P.flags.talked.ganglot) { openWin('gauntlet'); return; } return baseTalkGanglot.apply(this, arguments); };
}
Object.assign(ACTS, {
  rushgo() { if (typeof rushStart === 'function' && !RUSH.on) rushStart(); },
  rushquit() {
    if (!RUSH.on) return; if (!UI.rushArm) { UI.rushArm = true; return; }
    UI.rushArm = false; if (typeof rushAbort === 'function') rushAbort('You yield the floor. The benches of Eljudnir jeer, and the beasts sink back into the dark.');
  },
});

/* ---------- The Deep card in the HUD (under the map, on a Deep floor): floor, affixes, how far to the way down ---------- */
let deepCardT = 0;
function renderDeepCard() {
  const el = $('deepcard'); if (!el) return;
  if (time - deepCardT < 0.25 && time >= deepCardT) return; deepCardT = time;
  const on = !!(map && map.d && map.d.deep && typeof DEEP !== 'undefined');
  if (!on) { if (!el.hidden) el.hidden = true; return; }
  const plan = map.d.plan || {}, n = map.d.deep, cleared = DEEP.id === map.id && DEEP.cleared, need = typeof DEEP_CLEAR === 'number' ? DEEP_CLEAR : 0.6;
  const pct = DEEP.total ? DEEP.killed / DEEP.total : 0, aff = (plan.aff || []).map(k => typeof DEEP_AFFIXES !== 'undefined' && DEEP_AFFIXES[k] ? DEEP_AFFIXES[k].name : k);
  const prog = cleared ? '<div class="dc-ok">Way down open</div>' : plan.boss ? '<div class="dc-b">Boss floor · the way opens when it falls</div>' : `<div class="dprog sm"><i style="width:${Math.min(100, pct / need * 100).toFixed(1)}%"></i><em>${Math.round(pct * 100)}/${Math.round(need * 100)} %</em></div>`;
  const html = `<div class="rtb"><span>The Deep</span></div><div class="rbd"><div class="dc-h"><b>Floor ${n}</b><span>Lv ${plan.lvl || deepLv(n)}</span></div>${aff.length ? `<div class="dc-a">${aff.map(a => `<span>${esc(a)}</span>`).join('')}</div>` : ''}${prog}</div>`;
  if (cache.deepcard !== html) { cache.deepcard = html; el.innerHTML = html; }
  if (el.hidden) el.hidden = false;
}

/* ---------- The pet's portrait: its monster sheet, idle frame 0 facing S ----------
   Loaded on first need (the sheet's JSON, then its PNG), cropped to the creature and drawn once into a small canvas
   kept in PETSPR. After each render of the Pet window (AFTER.pet) the card gets that canvas and the list rows get
   small copies (a canvas-to-canvas draw), so a re-render never touches the sheet again. The crop reads pixels only
   where the browser allows it (file:// taints the canvas): otherwise the whole frame is used. Until the sheet arrives,
   or if it is missing, the egg icon stays. */
const PETSPR = {};
function artJSON2(url, ok, bad) {
  try { const x = new XMLHttpRequest(); x.open('GET', url, true); x.onload = () => { let j = null; if ((x.status === 200 || x.status === 0) && x.responseText) { try { j = JSON.parse(x.responseText); } catch (e) { j = null; } } if (j) ok(j); else bad(); }; x.onerror = bad; x.send(); }
  catch (e) { bad(); }
}
function petSprite(type) {
  let r = PETSPR[type]; if (r) return r;
  r = PETSPR[type] = { st: 'load', cv: null };
  const id = 'mob_' + type, base = typeof SHEET_BASE === 'string' ? SHEET_BASE : 'assets/sprites/';
  if (typeof SHEETS !== 'undefined' && SHEETS.indexReady && !SHEETS.entries[id]) { r.st = 'bad'; return r; }
  const fail = () => { r.st = 'bad'; };
  artJSON2(base + id + '.json', j => {
    if (!j.actions || !j.actions.idle || !j.frameW || !Array.isArray(j.dirs)) { fail(); return; }
    const im = new Image(); im.decoding = 'async';
    im.onload = () => { try { r.cv = petCrop(im, j); r.st = 'ok'; } catch (e) { r.st = 'bad'; } if (UI.open.pet) UI.dirty = true; };
    im.onerror = fail; im.src = base + id + '.png';
  }, fail);
  return r;
}
function petCrop(im, j) {
  const d = Math.max(0, j.dirs.indexOf('S')), R = typeof sheetRect === 'function' ? sheetRect(j, 'idle', d, 0) : { x: 0, y: 0, w: j.frameW, h: j.frameH };
  const f = document.createElement('canvas'); f.width = R.w; f.height = R.h; const g = f.getContext('2d'); g.drawImage(im, R.x, R.y, R.w, R.h, 0, 0, R.w, R.h);
  let bx = 0, by = 0, bw = R.w, bh = R.h;
  try {
    const px = g.getImageData(0, 0, R.w, R.h).data; let x0 = R.w, y0 = R.h, x1 = -1, y1 = -1;
    for (let y = 0; y < R.h; y++) for (let x = 0; x < R.w; x++) if (px[(y * R.w + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 >= x0) { bx = x0; by = y0; bw = x1 - x0 + 1; bh = y1 - y0 + 1; }
  } catch (e) { /* tainted canvas: keep the whole frame */ }
  const c = document.createElement('canvas'); c.width = 192; c.height = 176; const k = Math.min((c.width - 20) / bw, (c.height - 18) / bh, 3);
  const w = bw * k, h = bh * k, cg = c.getContext('2d'); cg.imageSmoothingQuality = 'high';
  cg.drawImage(f, bx, by, bw, bh, (c.width - w) / 2, c.height - 10 - h, w, h); c.className = 'pspr-cv';
  return c;
}
function petThumb(src) { const c = document.createElement('canvas'); c.width = 64; c.height = 64; const k = Math.min(64 / src.width, 64 / src.height); c.getContext('2d').drawImage(src, (64 - src.width * k) / 2, 64 - src.height * k, src.width * k, src.height * k); c.className = 'pthumb-cv'; return c; }
AFTER.pet = bd => {
  for (const el of bd.querySelectorAll('[data-pspr]')) {
    const r = petSprite(el.dataset.pspr); if (r.st !== 'ok') continue;
    el.textContent = ''; el.classList.add('has'); el.appendChild(el.dataset.sz === 'thumb' ? petThumb(r.cv) : r.cv);
  }
};

/* ---------- Rebirth: the ceremony ---------- */
let rebornT = null;
function rebornCeremony(from) {
  const el = $('reborn'); if (!el || !P) return;
  const C = CLASSES[P.cls], to = from && typeof REBORN_OF !== 'undefined' && REBORN_OF[from] && CLASSES[REBORN_OF[from]];
  const motes = Array.from({ length: 18 }, (_, i) => `<i style="left:${(i * 53 + 7) % 100}%;animation-delay:${((i * 0.37) % 3).toFixed(2)}s;animation-duration:${(5 + (i % 5) * 0.8).toFixed(1)}s"></i>`).join('');
  el.innerHTML = `<div class="rb-motes">${motes}</div><div class="rb-in"><div class="rb-rune">ᚢᚱᚦᚱ · ᚢᛖᚱᚦᚨᚾᛞᛁ · ᛊᚲᚢᛚᛞ</div><div class="rb-thread"></div><h2>Reborn</h2>
    <p class="rb-norns">“What was, what is, what shall be. We spin your thread again from the beginning, thicker, with everything you are woven in.”</p><p class="rb-who">Urðr · Verðandi · Skuld</p>
    <div class="rb-cls">${esc(P.name)}, ${esc(C ? C.name : 'High Novice')}</div><div class="rb-sub">Base Lv ${P.lvl} · Job Lv ${P.jlvl}${to ? ` · at Job Lv 10 the path of the ${esc(to.name)} wakes` : ''}</div></div><div class="rb-skip">Click or press any key</div>`;
  el.classList.remove('out'); el.hidden = false;
  clearTimeout(rebornT); rebornT = setTimeout(rebornEnd, 9500);
}
function rebornEnd() {
  const el = $('reborn'); if (!el || el.hidden || el.classList.contains('out')) return;
  clearTimeout(rebornT); el.classList.add('out'); rebornT = setTimeout(() => { el.hidden = true; el.classList.remove('out'); el.innerHTML = ''; }, 650);
}
if ($('reborn')) $('reborn').addEventListener('click', rebornEnd);
// Any key ends it; the usual skip keys (Esc, Enter, Space) are used up by the skip, every other key also does its job.
addEventListener('keydown', e => { const el = $('reborn'); if (!el || el.hidden) return; rebornEnd(); if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
if (typeof rebirth === 'function') {
  const baseRebirth = rebirth;
  // eslint-disable-next-line no-global-assign
  rebirth = function () { const from = P && P.cls, r = baseRebirth.apply(this, arguments); if (r) { try { rebornCeremony(from); } catch (e) { console.error(e); } } return r; };
}

/* =========================================================
   UI round 9 (cycle 8): Squad mode. design/squad-contract.md; every global of another team is guarded with typeof.
   - Party frames under Basic Info (#party): class portrait with the hair tint, name, level, role, HP/SP, buff pips,
     the swap key, the controlled hero highlighted, down state, a count of monsters on that hero. Click: squadSwap(i);
     right-click (or a long press): Tactics. Built once per party signature; bars are patched per frame.
   - Tactics window (T): stance, focus and hold/follow per companion and for all, through squadOrder / squadTactics.
   - Recruiting: a dialog panel (DLG_PANELS) over the recruit NPC's menu; its Recruit / Dismiss buttons resolve the
     same option indices as the plain menu.
   - Squad chat: a Squad tab beside the log, an input (Enter focuses it, Esc leaves), lines from SQUAD_CHAT.onLine
     with the speaker's colour and portrait (mirrored into the log), a status pill, speech bubbles over the speaker
     for 4 s positioned each frame with heroScreenPos (gfx) or proj.
   - Member switcher in Status, Equipment, Skills and Items: those windows render, and their actions run, with P (and
     S) pointing at the chosen member for the call (asHero), so companions can be geared without swapping. The bag is
     shared, so equipping a companion from Items works the same way.
   Hooks other teams provide: see the report / docs (squadSerialize, squadRestore, heroStats, SQUAD_KEYS,
   squadReviveHint, heroScreenPos).
   ========================================================= */
const SQ = { lastP: null, sig: '', els: [], t4: -1, hooked: false, tab: 'log', unread: 0, bub: new Map(), pv: [0, 0, 0], stats: new WeakMap(), inAs: false, avail: null, pill: '', tacSig: '' };
const sqHas = () => typeof PARTY !== 'undefined' && !!PARTY && Array.isArray(PARTY.members) && PARTY.members.length > 0;
const sqMembers = () => sqHas() ? PARTY.members : (P ? [P] : []);
const sqMulti = () => sqHas() && PARTY.members.length > 1;
const sqChat = () => typeof SQUAD_CHAT !== 'undefined' && SQUAD_CHAT ? SQUAD_CHAT : null;
const sqById = id => sqMembers().find(h => h && h.id === id) || null;
function sqKey(i) { const K = typeof SQUAD_KEYS !== 'undefined' && Array.isArray(SQUAD_KEYS) ? SQUAD_KEYS : null; const k = K ? K[i] : i < 4 ? 'F' + (i + 1) : ''; return k ? String(k).replace(/^(Key|Digit)/, '') : ''; }
const heroPortrait = h => classPortraitHTML(h.cls, h.gender, h.hairStyle, h.hair);
// Companions from js/data/squad.js: an array or a map keyed by id.
function sqComps() { if (typeof COMPANIONS_DATA === 'undefined' || !COMPANIONS_DATA) return []; const D = COMPANIONS_DATA; return Array.isArray(D) ? D.filter(Boolean) : Object.keys(D).map(k => Object.assign({ id: k }, D[k])); }
const sqComp = h => h && h.persona ? sqComps().find(c => c.id === h.persona) || null : null;
const ROLE_OF_BASE = { acolyte: 'healer', mage: 'ranged', archer: 'ranged', swordsman: 'melee', novice: 'melee' };
function heroRole(h) {
  if (h && h.ai && h.ai.role) return h.ai.role; const c = sqComp(h); if (c && c.role) return c.role;
  let k = h && h.cls; for (let n = 0; k && n < 8; n++) { if (ROLE_OF_BASE[k]) return ROLE_OF_BASE[k]; const C = CLASSES[k]; k = C && (C.from || C.base); }
  return 'melee';
}
const ROLE_NAME = { tank: 'Tank', healer: 'Healer', melee: 'Melee', ranged: 'Ranged' };
const ROLE_SVG = {
  tank: '<path d="M5 .6 9.2 2v3.1C9.2 7.6 7.4 9 5 9.8 2.6 9 .8 7.6.8 5.1V2z" fill="#fff"/>',
  healer: '<path d="M3.7.8h2.6v2.9h2.9v2.6H6.3v2.9H3.7V6.3H.8V3.7h2.9z" fill="#fff"/>',
  melee: '<path d="M8.8 1.2 4.4 5.6M2.4 4.6l3 3M3.6 6.4 1.4 8.6" stroke="#fff" stroke-width="1.6" stroke-linecap="round" fill="none"/><path d="M9.2.8 7 1.4 8.6 3z" fill="#fff"/>',
  ranged: '<path d="M2.2 1C5.6 2.4 5.6 7.6 2.2 9M2.2 1v8M1.4 5H9M7.2 3.4 9 5 7.2 6.6" stroke="#fff" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
};
const roleIcon = r => `<span class="rl rl-${ROLE_SVG[r] ? r : 'melee'}" title="${ROLE_NAME[r] || 'Melee'}"><svg viewBox="0 0 10 10">${ROLE_SVG[r] || ROLE_SVG.melee}</svg></span>`;
// Speaker colours, stable per hero id: [on the dark log, on the light bubble]. The player is white / ink.
const SQCOL = [['#ffd27a', '#9a6200'], ['#8fd4ff', '#1d6aa8'], ['#b8f08a', '#347e1a'], ['#ffa8d0', '#a8346e'], ['#c8b0ff', '#6444c0'], ['#ffb08a', '#b04a18']];
function sqColor(h) { if (!h || (h === P && !h.persona)) return ['#ffffff', '#2a3450']; const s = String(h.id || h.name || ''); let x = 7; for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) >>> 0; return SQCOL[x % SQCOL.length]; }

/* ---------- Stats of a member who is not P: core's heroStats(h) or h.S, else calcStats() with P swapped (1 s cache) ---------- */
function asHero(h, fn) {
  if (!h || h === P) return fn();
  if (typeof withHero === 'function') return withHero(h, fn);   // core: P = h and S = h's stat block, restored after
  const p0 = P, s0 = S; P = h;
  try { calcStats(); return fn(); } finally { P = p0; S = s0; }
}
function heroS(h) {
  if (h === P) return S;
  if (typeof heroStats === 'function') { try { const s = heroStats(h); if (s && s.maxhp) return s; } catch (e) { /* fall through */ } }
  if (h.S && h.S.maxhp) return h.S;
  const c = SQ.stats.get(h), now = performance.now(); if (c && now - c.t < 1000) return c.s;
  let s = null; const d0 = UI.dirty; try { s = asHero(h, () => S); } catch (e) { s = null; } UI.dirty = d0;
  s = s || { maxhp: Math.max(1, h.maxhp || h.hp || 1), maxsp: Math.max(1, h.maxsp || h.sp || 1) }; SQ.stats.set(h, { t: now, s }); return s;
}

/* ---------- Swap: Basic Info, buffs, hotbar and open windows follow the new P ---------- */
function sqOnSwap() {
  const first = SQ.lastP === null; SQ.lastP = P; if (first || !P) return;
  try { calcStats(); } catch (e) { console.error(e); }
  renderBuffs(); UI.hotSig = null; UI.dirty = true; SQ.t4 = -1;
  if (UI.viewId && P && UI.viewId === P.id) UI.viewId = null;
}

/* ---------- Party frames ---------- */
function sqFrameSig(L) { return L.map(h => [h.id, h.name, h.cls, h.gender, h.hairStyle, h.hair, heroRole(h)].join('|')).join(';') + '#' + (ART.porIdx ? 1 : 0) + [0, 1, 2, 3].map(sqKey).join(''); }
function renderParty() {
  const el = $('party'); if (!el) return;
  const show = sqMulti();
  if (el.hidden === show) el.hidden = !show;
  if (!show) { if (SQ.sig) { SQ.sig = ''; SQ.els = []; $('pfr').innerHTML = ''; } return; }
  const L = PARTY.members, sig = sqFrameSig(L);
  if (sig !== SQ.sig) {
    SQ.sig = sig;
    $('pfr').innerHTML = L.map((h, i) => `<div class="pf" data-pf="${i}" role="button" tabindex="0" aria-label="${esc(h.name)}: take control" title="${esc(h.name)} · click to take control (${esc(sqKey(i))}) · right-click for tactics"><div class="pfp well">${heroPortrait(h)}<span class="pfk">${esc(sqKey(i))}</span><span class="pfa" hidden></span><span class="pfq" hidden title="Has something to ask you: open Tactics (right-click)">!</span><span class="pfd" hidden>Down</span></div><div class="pfm"><div class="pfn">${roleIcon(heroRole(h))}<b>${esc(h.name)}</b><span class="pfb"></span><small></small></div><div class="bar hp"><i></i><em></em></div><div class="bar sp"><i></i></div><div class="pfx" hidden></div></div></div>`).join('');
    SQ.els = [...$('pfr').children].map(e => ({ e, hp: e.querySelector('.bar.hp i'), hpt: e.querySelector('.bar.hp em'), hpbar: e.querySelector('.bar.hp'), sp: e.querySelector('.bar.sp i'), spbar: e.querySelector('.bar.sp'), lv: e.querySelector('.pfn small'), pips: e.querySelector('.pfb'), ag: e.querySelector('.pfa'), dn: e.querySelector('.pfd'), hint: e.querySelector('.pfx'), c: {} }));
    setText('pcount', L.length + '/4'); SQ.t4 = -1;
  }
  const slow = time - SQ.t4 > 0.25 || time < SQ.t4; if (slow) SQ.t4 = time;
  for (let i = 0; i < L.length; i++) {
    const h = L[i], r = SQ.els[i]; if (!r) continue; const c = r.c;
    const me = h === P, dead = !!h.dead || h.hp <= 0, s = heroS(h), mh = Math.max(1, s.maxhp || 1), ms = Math.max(1, s.maxsp || 1);
    if (c.me !== me) { c.me = me; r.e.classList.toggle('me', me); r.e.setAttribute('aria-current', me ? 'true' : 'false'); }
    if (c.dead !== dead) { c.dead = dead; r.e.classList.toggle('dead', dead); r.dn.hidden = !dead; r.hpbar.hidden = dead; r.spbar.hidden = dead; r.hint.hidden = !dead; if (!dead) { c.hint = null; r.e.title = `${h.name} · click to take control (${sqKey(i)}) · right-click for tactics`; } }
    if (dead) { if (slow) { let t = 'Down · needs reviving'; if (typeof squadReviveHint === 'function') { try { t = squadReviveHint(h) || t; } catch (e) { /* keep */ } } if (c.hint !== t) { c.hint = t; r.hint.textContent = t; r.e.title = h.name + ': ' + t; } } }
    else {
      const hw = Math.round(clamp(h.hp / mh, 0, 1) * 1000); if (c.hw !== hw) { c.hw = hw; r.hp.style.width = hw / 10 + '%'; const low = hw < 250; if (c.low !== low) { c.low = low; r.hpbar.classList.toggle('low', low); } }
      const sw = Math.round(clamp(h.sp / ms, 0, 1) * 1000); if (c.sw !== sw) { c.sw = sw; r.sp.style.width = sw / 10 + '%'; }
      const hv = Math.ceil(h.hp); if (c.hv !== hv || c.mh !== mh) { c.hv = hv; c.mh = mh; r.hpt.textContent = hv + ' / ' + mh; }
    }
    if (c.lv !== h.lvl) { c.lv = h.lvl; r.lv.textContent = 'Lv ' + h.lvl; }
    if (slow) {
      const ks = h.buffs ? Object.keys(h.buffs) : [], bs = ks.slice(0, 5).join(',');
      if (c.bs !== bs) { c.bs = bs; r.pips.innerHTML = ks.slice(0, 5).map(k => { const b = h.buffs[k], sk = SKILLS[b && b.icon] || BUFF_ICONS[b && b.icon] || {}; return `<i style="background:${ELCOL[sk.el] || '#c8bca6'}" title="${esc(b && b.name || k)}"></i>`; }).join(''); }
      let ag = 0; if (!dead && typeof mobs !== 'undefined') for (let j = 0; j < mobs.length; j++) { const m = mobs[j]; if (m.target === h && !m.dead && m.state === 'chase') ag++; }
      if (c.ag !== ag) { c.ag = ag; r.ag.hidden = !ag; r.ag.textContent = ag > 9 ? '9+' : String(ag); r.e.classList.toggle('aggro', ag > 0); }
      const qr = !me && !dead && (sqQuest(h) || {}).status === 'ready'; if (c.qr !== qr) { c.qr = qr; const q = r.e.querySelector('.pfq'); if (q) q.hidden = !qr; }   // UI round 11: a companion quest is ready
    }
  }
}
// Clicks: a frame takes control of that hero; chat tabs; Send; the Chat button.
function sqClick(e) {
  const f = e.target.closest('[data-pf]');
  if (f) { Sfx.unlock(); Sfx.click(); const i = +f.dataset.pf; if (typeof squadSwap === 'function' && sqMembers()[i] && sqMembers()[i] !== P) { try { squadSwap(i); } catch (err) { console.error(err); } } return true; }
  const t = e.target.closest('[data-ctab]'); if (t) { Sfx.click(); sqTab(t.dataset.ctab); return true; }
  if (e.target.closest('#sqsend')) { sqSend(); return true; }
  if (e.target.closest('[data-sqchat]')) { Sfx.click(); sqFocusChat(true); return true; }
  return false;
}
function sqContext(e) {
  const f = e.target.closest('[data-pf]'); if (!f) return false; e.preventDefault();
  const h = sqMembers()[+f.dataset.pf]; UI.tacSel = h && h !== P ? h.id : null; openWin('tactics'); return true;
}
addEventListener('keydown', e => { const f = e.target && e.target.closest && e.target.closest('[data-pf]'); if (f && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopImmediatePropagation(); f.click(); } }, true);

/* ---------- Tactics window ---------- */
WIN.tactics = { title: 'Squad Tactics', w: 470, pos: () => [272, 64] };
function sqTac(h) {
  let t = null; if (typeof squadTactics === 'function') { try { t = squadTactics(h.id); } catch (e) { t = null; } }
  t = t || h.ai || {}; const f = t.focus;
  const o = { stance: t.stance || 'aggressive', focus: f == null || f === 'free' ? 'free' : typeof f === 'string' ? f : 'target', hold: t.hold !== undefined ? !!t.hold : t.follow === false };
  const p = tacPotions(h); if (p) { if (p.potions != null) o.potions = p.potions; if (p.reserve != null) o.reserve = p.reserve; }   // UI round 11
  const qi = sqQuest(h); if (qi) o.quest = qi.status;
  return o;
}
const TAC_ST = [['aggressive', 'Aggressive', 'Engages anything that threatens the party'], ['defensive', 'Defensive', 'Fights back and guards allies, does not start fights'], ['passive', 'Passive', 'Never attacks; follows and heals only']];
const TAC_FO = [['target', 'My target', 'Attacks what you attack'], ['nearest', 'Nearest', 'Takes the closest enemy'], ['boss', 'Boss', 'Goes for the boss or strongest enemy'], ['free', 'Free', 'Chooses by role']];
const TAC_MV = [['follow', 'Follow', 'Stays in formation behind you'], ['hold', 'Hold', 'Holds this spot']];
function tacSeg(who, key, opts, cur) { return `<div class="seg">${opts.map(([v, l, tip]) => { const on = Array.isArray(cur) ? cur.every(x => x === v) : cur === v, mix = Array.isArray(cur) && !on && cur.includes(v); return `<button class="btn${on ? ' on' : ''}${mix ? ' mix' : ''}" data-act="sqo:${who}:${key}=${v}" title="${esc(tip)}" aria-pressed="${on}">${l}</button>`; }).join('')}</div>`; }
function tacGrid(who, st, fo, mv, pot, res) { return `<div class="tacg"><span>Stance</span>${tacSeg(who, 'stance', TAC_ST, st)}<span>Focus</span>${tacSeg(who, 'focus', TAC_FO, fo)}<span>Move</span>${tacSeg(who, 'move', TAC_MV, mv)}${tacPotRow(who, pot, res)}</div>`; }
RENDER.tactics = function () {
  const L = sqMembers(), A = L.map((h, i) => ({ h, i })).filter(x => x.h !== P);
  if (!A.length) return `<p class="lore">You travel alone. Companions can be hired in Emberhold; their stance, focus and whether they follow you are set here.</p>`;
  const T = A.map(x => sqTac(x.h));
  const all = `<div class="tac all"><div class="tall">ᛗ</div><div><div class="tach"><b>All companions</b><span>${A.length} in the party</span></div>${tacGrid('all', T.map(t => t.stance), T.map(t => t.focus), T.map(t => t.hold ? 'hold' : 'follow'), T.some(t => t.potions != null) ? T.map(t => t.potions) : null, T.some(t => t.reserve != null) ? T.map(t => t.reserve || 0) : null)}</div></div>`;
  const rows = A.map(({ h, i }, k) => { const t = T[k], c = CLASSES[h.cls], dead = !!h.dead || h.hp <= 0;
    return `<div class="tac${UI.tacSel === h.id ? ' sel' : ''}" data-tac="${esc(h.id)}"><div class="well">${heroPortrait(h)}</div><div><div class="tach">${roleIcon(heroRole(h))}<b>${esc(h.name)}</b><span>${esc(c ? c.name : '')} · Lv ${h.lvl} · ${ROLE_NAME[heroRole(h)] || ''}</span>${dead ? '<em>Down</em>' : ''}${tacQuest(h, i)}</div>${tacGrid(i, t.stance, t.focus, t.hold ? 'hold' : 'follow', t.potions, t.reserve)}</div></div>`; }).join('');
  return all + rows + `<p class="muted" style="margin:4px 0 0;font-size:11px;line-height:1.4">Right-click a party frame to open this window. You can also give orders in the squad chat, for example “focus boss”, “hold” or “defensive”.</p>`;
};
AFTER.tactics = bd => { if (!UI.tacSel) return; const el = bd.querySelector(`[data-tac="${CSS.escape(UI.tacSel)}"]`); if (el && !SQ.tacScrolled) { SQ.tacScrolled = true; bd.scrollTop = Math.max(0, el.offsetTop - 40); } };
Object.assign(ACTS, {
  sqo(b, c) {
    if (typeof squadOrder !== 'function' || !c) return; const [k, v] = c.split('=');
    const o = k === 'stance' ? { stance: v } : k === 'focus' ? { focus: v === 'free' ? null : v } : k === 'move' ? (v === 'hold' ? { hold: true, follow: false } : { hold: false, follow: true }) : null;
    const h = b === 'all' ? null : sqMembers()[+b]; if (!o || (b !== 'all' && !h)) return;
    try { squadOrder(b === 'all' ? 'all' : h.id, o); } catch (e) { console.error(e); }
  },
  view(b) { const h = sqMembers()[+b]; UI.viewId = h && h !== P ? h.id : null; },
  nocast() { log('Swap to that hero to use their skills.', 'warn'); },
});

/* ---------- Member switcher: Status, Equipment, Skills, Items ---------- */
const VIEW_WINS = { status: 1, equip: 1, skills: 1, inv: 1 };
function viewHero() { if (!UI.viewId || !sqMulti()) return P; const h = sqById(UI.viewId); if (!h) { UI.viewId = null; return P; } return h; }
function sqViewAct(a, b) {
  const v = viewHero(); if (v === P) return false;
  if (a === 'stat' || a === 'learn' || a === 'uneq' || a === 'mount') return true;
  if (a === 'inv') { const it = findItem(+b); return !!(it && ITEMS[it.id] && ITEMS[it.id].type === 'equip'); }
  return false;
}
function memberTabs(id, v) {
  return `<div class="mtabs" role="group" aria-label="${id === 'inv' ? 'Equip onto' : 'Party member'}">${sqMembers().map((h, i) => `<button class="btn mtab${h === v ? ' on' : ''}${h === P ? ' me' : ''}" data-act="view:${i}" title="${esc(h.name)}${h === P ? ' (you are playing this hero)' : ''}${id === 'inv' ? ': gear you click goes to them' : ''}" aria-pressed="${h === v}"><span class="well mtp">${heroPortrait(h)}</span><span class="mtn">${esc(String(h.name).split(/\s+/)[0])}</span></button>`).join('')}</div>`;
}
function viewRender(id) {
  const v = viewHero(), other = v !== P, tb0 = $('w-' + id) && $('w-' + id).querySelector('.tb span');
  if (!sqMulti()) { if (tb0 && tb0.textContent !== WIN[id].title) tb0.textContent = WIN[id].title; return RENDER[id](); }
  let html = id === 'inv' ? RENDER[id]() : asHero(v, RENDER[id]);
  if (other && id === 'skills') html = html.replace(/data-act="cast:/g, 'data-act="nocast:').replace(/data-bind="skill:[^"]*"/g, 'data-bind=""');
  const tb = tb0; if (tb) { const t = WIN[id].title + (other ? ' · ' + v.name : ''); if (tb.textContent !== t) tb.textContent = t; }
  const note = other ? `<div class="mnote">${id === 'inv' ? `Gear you click goes to <b>${esc(v.name)}</b>. Potions are still yours.` : id === 'skills' ? `${esc(v.name)}’s skills: points can be spent here; swap to use them.` : `Showing <b>${esc(v.name)}</b>. Changes apply to them.`}</div>` : '';
  return memberTabs(id, v) + note + html;
}
// Tooltips inside a switched window describe (and compare against) the member it shows.
function sqTipFor(t) {
  const w = t.closest('.win'), id = w && w.id.slice(2);
  if (id && VIEW_WINS[id] && viewHero() !== P) { const v = viewHero(); try { return asHero(v, () => tipFor(t.dataset.tip)); } catch (e) { return null; } }
  return tipFor(t.dataset.tip);
}

/* ---------- Recruiting: a panel over the recruit NPC's dialog ---------- */
const RX_REC = /^\s*(recruit|hire)\b/i, RX_DIS = /^\s*(dismiss|release|part ways)\b/i;
const optNames = (o, c) => { const t = normName(o); return (c.name && t.includes(normName(c.name))) || (c.id && t.includes(String(c.id).toLowerCase())); };
function recruitPanel(text, opts) {
  const C = sqComps(), L = sqMembers(), used = new Set(), full = L.length >= 4;
  const find = (rx, c) => { const i = opts.findIndex((o, k) => !used.has(k) && rx.test(o) && optNames(o, c)); if (i >= 0) used.add(i); return i; };
  const cards = C.map(c => {
    const ri = find(RX_REC, c), di = find(RX_DIS, c), mem = L.find(h => h.persona === c.id || h.id === c.id);
    let info = {}; if (typeof squadRecruitInfo === 'function') { try { info = squadRecruitInfo(c.id) || {}; } catch (e) { info = {}; } }
    const feeTxt = ri >= 0 ? (/([\d][\d,.]*)\s*z\s*\)/i.exec(opts[ri]) || [])[1] : null;
    const fee = info.fee != null ? info.fee : c.fee != null ? c.fee : c.cost != null ? c.cost : feeTxt ? +feeTxt.replace(/[,.]/g, '') : null;
    const lock = ri >= 0 ? +((/\(\s*Base Lv\s*(\d+)\s*\)/i.exec(opts[ri]) || [])[1] || 0) : 0;
    let lvl = mem ? mem.lvl : info.lvl != null ? info.lvl : c.lvl != null ? c.lvl : c.level;
    if (lvl == null && typeof squadBench === 'function' && typeof squadRecruitLevel === 'function') { try { const b = squadBench()[c.id]; lvl = b && b.lvl ? b.lvl : squadRecruitLevel(c); } catch (e) { lvl = null; } }
    const per = c.persona, blurb = c.blurb || c.tagline || (typeof per === 'string' ? per : per && (per.blurb || per.background || per.voice)) || '';
    const short = String(blurb).split(/(?<=[.!?])\s/).slice(0, 2).join(' ').slice(0, 170);
    const role = c.role || heroRole({ cls: c.cls }), cls = CLASSES[c.cls];
    const act = mem ? (di >= 0 ? `<button class="btn warn" data-dlg="${di}">Dismiss</button>` : '<span class="okl">In your party</span>')
      : ri >= 0 ? `<button class="btn${lock ? '' : ' prim'}" data-dlg="${ri}"${lock ? ` title="${esc(c.name)} wants a leader of Base Lv ${lock}"` : ''}>Recruit</button>` : `<span class="muted" style="font-size:11px">${full ? 'Party full' : info.why ? esc(info.why) : 'Not here now'}</span>`;
    const feeH = mem ? '<span class="muted" style="font-size:11px">Travelling with you</span>' : lock ? `<span class="p short">Needs Base Lv ${lock}</span>` : fee != null ? `<span class="p${P.zeny < fee ? ' short' : ''}">${fmt(fee)}z</span>` : '<span></span>';
    return `<div class="rc${mem ? ' in' : ''}${lock ? ' lock' : ''}"><div class="well">${classPortraitHTML(c.cls, c.gender, c.hairStyle || (c.gender === 'f' ? 'long' : 'spiky'), c.hair)}</div><div class="rch"><b>${esc(c.name || c.id)}${c.title ? ` <small>${esc(c.title)}</small>` : ''}</b><span>${lvl != null ? 'Lv ' + lvl : ''}</span></div><div class="rcc">${roleIcon(role)}${esc(ROLE_NAME[role] || role)} · ${esc(cls ? cls.name : c.cls || '')}</div><p class="rcp">${esc(short)}</p><div class="rcf">${feeH}${act}</div></div>`;
  }).join('');
  const strip = `<div class="rparty"><span class="mtl">Your party ${L.length}/4</span>${L.map(h => `<span class="mtab${h === P ? ' me' : ''}"><span class="well mtp">${heroPortrait(h)}</span><span class="mtn">${esc(h.name)}</span></span>`).join('')}<span class="muted" style="margin-left:auto;font-size:11px">Zeny <b style="color:var(--gold)">${fmt(P.zeny)}</b></span></div>`;
  const show = opts.map((o, i) => i).filter(i => !used.has(i));
  return { html: strip + (cards ? `<div class="rcg">${cards}</div>` : '<p class="muted">No one is looking for work.</p>'), show, primary: -1 };
}
DLG_PANELS.push({ id: 'recruit', title: 'Companions for Hire', render: (t, o) => recruitPanel(t, o), text: t => String(t).split(/<br>\s*<br>/i)[0],   // the cards replace the roster in the text
  test: (name, opts) => typeof COMPANIONS_DATA !== 'undefined' && sqComps().length > 0 && opts.some(o => RX_REC.test(o) || RX_DIS.test(o)) && opts.some(o => sqComps().some(c => optNames(o, c))) });

/* ---------- Squad chat ---------- */
function sqLine(l) {
  if (!l || l.text == null) return;
  const text = String(l.text).slice(0, 240), sys = l.who === 'system', h = l.who === 'you' ? P : sys ? null : sqById(l.who);
  if (!sys && !h) return;
  const name = h ? h.name : '', col = sqColor(l.who === 'you' ? null : h);
  const box = $('sqlog');
  if (box) {
    const d = document.createElement('div');
    if (sys) { d.className = 'sqs'; d.textContent = text; }
    else d.innerHTML = `<span class="well sqp">${heroPortrait(h)}</span><span><b style="color:${col[0]}">${esc(name)}</b> ${esc(text)}</span>`;
    box.appendChild(d); while (box.children.length > 40) box.removeChild(box.firstChild);
  }
  const c = $('chat');
  if (c) { const d = document.createElement('div'); d.className = sys ? 'sys' : 'party'; if (sys) d.textContent = text; else d.innerHTML = `<b style="color:${col[0]}">${esc(name)}:</b> ${esc(text)}`; c.appendChild(d); while (c.children.length > 40) c.removeChild(c.firstChild); }
  if (SQ.tab !== 'squad') { SQ.unread++; const n = $('sqnew'); if (n) n.hidden = false; }
  if (h) sqBubble(h, name, text, col[1]);
}
function sqTab(t) {
  SQ.tab = t === 'squad' ? 'squad' : 'log';
  for (const b of document.querySelectorAll('[data-ctab]')) b.classList.toggle('on', b.dataset.ctab === SQ.tab);
  $('chat').hidden = SQ.tab !== 'log'; $('sqlog').hidden = SQ.tab !== 'squad'; $('sqrow').hidden = SQ.tab !== 'squad' || !sqChat();
  if (SQ.tab === 'squad') { SQ.unread = 0; $('sqnew').hidden = true; }
}
function sqFocusChat(force) {
  if (!SQ.avail || !sqChat()) return false;
  sqTab('squad'); const i = $('sqin'); if (!i) return false;
  if (typeof CTRL !== 'undefined') { CTRL.keys.clear(); if (P) P.blocking = false; }
  i.focus({ preventScroll: true }); return true;
}
function sqBlur() { const i = $('sqin'); if (i) i.blur(); }
function sqSend() {
  const i = $('sqin'), t = i ? i.value.trim().slice(0, 160) : ''; if (i) i.value = '';
  const C = sqChat(); if (t && C && typeof C.send === 'function') { try { C.send(t); } catch (e) { console.error(e); } }
  sqBlur();
}
function sqInputKey(e) {
  if (e.key === 'Enter') { e.preventDefault(); sqSend(); }
  else if (e.key === 'Escape') { e.preventDefault(); e.target.value = ''; sqBlur(); }
}
// SQUAD_CHAT.status(): off = no relay configured, fallback = guest (not signed in), error = relay failing (backing off).
const SQST = { off: ['Not set up', 'fb', 'Cloud chat is not set up. Companions use their own lines.'], fallback: ['Offline', 'off', 'Sign in for cloud chat. Companions speak from memory.'], online: ['Online', 'on', 'Cloud chat online.'], busy: ['Thinking…', 'busy', 'Companions are thinking…'], error: ['Offline', 'err', 'Cloud chat is offline. Companions speak from memory.'] };
function sqChatTick() {
  const C = sqChat(), avail = sqMulti();   // the Squad tab is for a party; solo play keeps the plain log
  if (C && !SQ.hooked && typeof C.onLine === 'function') { SQ.hooked = true; try { C.onLine(sqLine); } catch (e) { console.error(e); } }
  if (avail !== SQ.avail) { SQ.avail = avail; $('ctabs').hidden = !avail; if (!avail) sqTab('log'); else sqTab(SQ.tab); }
  const pill = $('sqpill'); if (!pill) return;
  let st = null; if (C && typeof C.status === 'function') { try { st = C.status(); } catch (e) { st = 'error'; } }
  const k = C ? (SQST[st] ? st : 'off') : ''; if (k === SQ.pill) return; SQ.pill = k;
  pill.hidden = !k; if (!k) return; const [lbl, cls, tip] = SQST[k];
  let info = null; if (typeof C.statusInfo === 'function') { try { info = C.statusInfo(); } catch (e) { info = null; } }
  pill.className = cls; pill.title = info && info.label ? info.label + (info.detail ? '. ' + info.detail : '') : tip; pill.lastChild.textContent = lbl;
}

/* ---------- Speech bubbles ---------- */
function sqBubble(h, name, text, col) {
  const layer = $('bubbles'); if (!layer) return;
  let b = SQ.bub.get(h);
  if (!b) { const el = document.createElement('div'); el.className = 'bub'; el.style.visibility = 'hidden'; layer.appendChild(el); b = { el, x: NaN, y: NaN, vis: false }; SQ.bub.set(h, b); }
  b.el.innerHTML = `<b style="color:${col}">${esc(name)}</b>${esc(text)}`; b.el.classList.remove('out'); b.out = false; b.until = performance.now() + 4000;
  sqBubblesTick();
}
function sqScreen(h, out) {
  if (typeof heroScreenPos === 'function') { try { const r = heroScreenPos(h, out); if (r === null || r === false) return null; return Array.isArray(r) ? r : out; } catch (e) { /* fall back */ } }
  if (typeof proj !== 'function' || !map) return null;
  const z = (typeof groundH === 'function' ? groundH(h.x, h.y) : 0) + (typeof headH === 'function' ? headH(h) : 1.6) + 0.35;
  return proj(h.x, h.y, z, out);
}
function sqBubblesTick() {
  if (!SQ.bub.size) return;
  const now = performance.now(), L = sqMembers();
  for (const [h, b] of SQ.bub) {
    if (now > b.until + 400 || !L.includes(h)) { b.el.remove(); SQ.bub.delete(h); continue; }
    if (now > b.until && !b.out) { b.out = true; b.el.classList.add('out'); }
    const p = h.map && P && h.map !== P.map ? null : sqScreen(h, SQ.pv), on = !!p && p[2] < 1 && p[0] > -40 && p[0] < W + 40 && p[1] > 10 && p[1] < H + 40;
    if (on !== b.vis) { b.vis = on; b.el.style.visibility = on ? '' : 'hidden'; }
    if (!on) continue;
    const x = Math.round(p[0] / UIZ), y = Math.round(p[1] / UIZ) - 6;
    if (x !== b.x || y !== b.y) { b.x = x; b.y = y; b.el.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-100%)`; }
  }
}

/* ---------- Per frame (from renderHUD) ---------- */
function sqTick() {
  renderParty();
  if (SQ.t4c === undefined || time - SQ.t4c > 0.25 || time < SQ.t4c) {
    SQ.t4c = time; sqChatTick();
    if (UI.open.tactics) { const sig = sqMembers().map(h => h === P ? 'P' : JSON.stringify(sqTac(h)) + (h.dead ? 'd' : '')).join('|'); if (sig !== SQ.tacSig) { SQ.tacSig = sig; renderWin('tactics'); } }
    else SQ.tacScrolled = false;
  }
  sqBubblesTick();
}

/* =========================================================
   UI round 11 (leftovers round, design/leftovers10-contract.md "Interaction (E4)")
   - Doors: F (pad A) in action mode enters a door / cave-mouth warp within 1.2 tiles (js/action.js actPick /
     enterDoor: the hero steps onto the warp tile and core postMove fires it). A click on a door (the tile, or the
     door drawn above it: doorAtScreen) walks there and in, in both modes. Walking onto a door works as before.
     The door prompt (#doorp) now shows how: a key cap (F / A) when F would enter it, "Click" / "Tap" otherwise.
   - Objects: #objp, a prompt like the door's: "Read" (sign, signpost, lore, ibook), "Open" (chest, ichest; faded
     "Opened" once o.open / P.flags.chests says so), else the object's name. Classic mode: the object under the mouse;
     action mode: what F would use (actPick). Using it is the existing path (a click -> P.goal 'obj', F -> useObj).
   - Landmarks: m.landmarks [{ id, name, x, y, r }]. Walking inside r marks one visited in P.flags.found
     ['<map>#<id>'] (the UI-owned set from round 10, saved with flags; old saves get {} in applySave) with a toast.
     The minimap shows visited ones as named pips (HTML in #mml, inside the scrolled wrapper), and unvisited ones
     within LM_NEAR tiles as a faint "?". The World Map tooltip lists them with a count.
   - Tactics: when squadTactics(id) reports `potions` ('auto' | 'off') and `reserve` (squad team, round 10), a
     Potions row: an Auto / Off toggle and a "Keep N" stepper, sent as squadOrder(id, { potions, reserve }).
   ========================================================= */
const OBJ_VERB = { sign: 'Read', signpost: 'Read', lore: 'Read', ibook: 'Read', chest: 'Open', ichest: 'Open', board: 'Browse' };
const OBJ_NAME = { sign: 'Signpost', signpost: 'Signpost', lore: 'Old Writing', ibook: 'Writing', chest: 'Chest', ichest: 'Chest' };
const OBJ_H = { chest: 1.25, ichest: 1.25, sign: 2.1, signpost: 2.1, lore: 1.9, ibook: 1.6, board: 2.6 };   // prompt height above the ground (tiles)
const OBJ_ICON = { read: '<path d="M1.5 3C3.5 2.2 5.5 2.4 7 3.6C8.5 2.4 10.5 2.2 12.5 3V11.6C10.5 10.9 8.5 11.1 7 12.2C5.5 11.1 3.5 10.9 1.5 11.6Z" fill="currentColor"/><path d="M7 3.6V12.2" stroke="rgba(0,0,0,.55)" stroke-width="1"/>',
  open: '<path d="M1.5 6.5H12.5V12.5H1.5Z" fill="currentColor"/><path d="M1.5 6.5C1.5 3.5 3.5 2.2 7 2.2S12.5 3.5 12.5 6.5Z" fill="currentColor" opacity=".8"/><path d="M1.5 6.5H12.5M6 6.5V9H8V6.5" stroke="rgba(0,0,0,.6)" stroke-width="1.1" fill="none"/>' };
const LM_NEAR = 10;
const keyHint = () => (CTRL.pad ? 'A' : 'F');
const clickHint = () => (matchMedia && matchMedia('(pointer: coarse)').matches ? 'Tap' : 'Click');
const hintTag = h => (h ? `<kbd class="${h.length > 1 ? 'mk' : ''}">${h}</kbd>` : '');

/* ---------- Doors: click to enter ---------- */
// The door warp under a screen point: its tile (the ground under the cursor within 0.7 tiles) or the door drawn above
// it (a short vertical segment from the threshold up, within ~0.6 tiles on screen). Nearest wins.
function doorAtScreen(sx, sy) {
  if (!map || !P) return null;
  let best = null, bd = 1e9; const g = s2w(sx, sy), r = Math.max(14, 0.6 * PPU);
  for (const wp of map.warps) {
    if (!wp.door) continue; const x = wp.x + 0.5, y = wp.y + 0.5, gh = groundH(x, y);
    const dg = g ? hyp(g[0] - x, g[1] - y) : 1e9; if (dg < 0.7 && dg * PPU < bd) { bd = dg * PPU; best = wp; }
    for (const z of [0.3, 1.0, 1.7]) { const q = pj(x, y, gh + z); if (q[2] > 1) continue; const d = Math.hypot(sx - q[0], sy - q[1]); if (d < r && d < bd) { bd = d; best = wp; } }
  }
  return best;
}
function goDoor(wp) {
  const x = wp.x + 0.5, y = wp.y + 0.5;
  P.goal = null; P.target = null; mouse.hold = false;
  if (!moveTo(x, y)) { goNear(P, x, y); if (!P.path) return false; }
  // end exactly on the warp tile (moveTo keeps the click point only when that tile is open)
  if (P.path && P.path.length) { const e = P.path[P.path.length - 1]; if (Math.floor(e.x) !== wp.x || Math.floor(e.y) !== wp.y) P.path.push({ x, y }); }
  fxs.push({ k: 'mark', x, y, t: 0, dur: 0.5 });
  return true;
}

/* ---------- Objects: Read / Open prompt ---------- */
function objState(o) {
  const F = P.flags || {};
  if (o.kind === 'chest' || o.kind === 'ichest') return o.open || (F.chests && F.chests[o.kind === 'ichest' ? 'int_' + o.key : o.id]) ? 'opened' : '';
  if (o.kind === 'lore') return o.lore && F.lore && F.lore[o.lore] ? 'read' : '';
  if (o.kind === 'ibook') return o.key && F.iread && F.iread[o.key] ? 'read' : '';
  return '';
}
const objPromptable = o => !!o && o.kind !== 'way' && o.kind !== 'heart' && o.kind !== 'anvil' && !!(OBJ_VERB[o.kind] || o.name);   // the renderer labels Waystones and the Heart itself
function objTick() {
  const el = $('objp'); if (!el || !map || !P) return;
  const busy = P.dead || !$('dialog').hidden || (typeof CINE !== 'undefined' && CINE.active);
  let o = null, hint = '';
  if (!busy) {
    const pk = isAction() && typeof actPick === 'function' ? actPick() : null, po = pk && pk.k === 'obj' && objPromptable(pk.r) ? pk.r : null;
    const ho = hover && objPromptable(hover) && map.objs.includes(hover) ? hover : null;
    if (ho && ho !== po) { o = ho; hint = clickHint(); } else if (po) { o = po; hint = keyHint(); }
  }
  const st = o ? objState(o) : '', key = o ? (map.objs.indexOf(o) + '|' + st + '|' + hint + '|' + (o.name || '')) : '';
  if (key === OP.key && o === OP.o) return; OP.key = key; OP.o = o; OP.tf = ''; OP.below = false; OP.hw = 0;
  if (!o) { el.hidden = true; return; }
  const v = OBJ_VERB[o.kind], open = v === 'Open', done = st === 'opened';
  const verb = done ? 'Opened' : v || '';
  el.className = 'doorp objp' + (open ? ' chest' : v === 'Read' ? ' read' : '') + (done ? ' done' : '');
  el.innerHTML = `<div>${v === 'Read' || open ? `<span class="di"><svg viewBox="0 0 14 14" aria-hidden="true">${OBJ_ICON[open ? 'open' : 'read']}</svg></span>` : ''}${verb ? `<span class="dv">${verb}</span> ` : ''}<b>${esc(o.name || OBJ_NAME[o.kind] || '')}</b>${st === 'read' ? '<span class="ok" title="Read before">✓</span>' : ''}${hintTag(hint)}</div>`;
  el.hidden = false; el.style.visibility = 'hidden';
}

/* ---------- Landmarks: visited set, minimap pips ---------- */
const lmKey = (m, l) => m.id + '#' + (l.id || l.name);
function lmTick() {
  const m = map; if (!m || !P) return;
  const L = m.landmarks || [], F = P.flags.found || (P.flags.found = {}), fresh = LM.map !== m;
  if (fresh) { LM.map = m; LM.t0 = time; }
  let key = m.id + '|' + MM.mode;
  for (const l of L) {
    if (!l.name) continue;
    const k = lmKey(m, l), d = hyp(P.x - l.x, P.y - l.y);
    if (!F[k] && d <= (l.r || 6) && !P.dead) {
      F[k] = 1; if (UI.open.worldmap) UI.dirty = true;
      // a discovery toast (not on arrival: the map banner speaks then); regionTick shares the 45 s de-duplication
      const sk = m.id + '|' + l.name;
      if (!fresh && time - LM.t0 > 1.5 && !(time - (RG.shown[sk] || -1e9) < 45)) { RG.shown[sk] = time; regionToast(l.name, 'Landmark found · ' + m.d.name); }
    }
    key += F[k] ? '1' : d <= LM_NEAR ? '?' : '0';
  }
  if (MM.mode === 'local') key += '|' + Math.round(MM.x0) + ',' + Math.round(MM.y0);   // the local view scrolled: re-lay the names
  if (key !== LM.key) { LM.key = key; lmBuild(); }
}
// Visited landmarks in view get a pip and their name: right of the pip, else left, else above / below it slid inside
// the box. A name that would clip or overlap a nearer one is dropped (the pip stays). Unvisited ones within LM_NEAR
// tiles get a faint "?". Names are measured once per font size (canvas measureText, cached).
const LM_W = new Map();
function lmTextW(txt, fs) {
  const k = fs + '|' + txt; let w = LM_W.get(k);
  if (w === undefined) { const g = LM_W.g || (LM_W.g = document.createElement('canvas').getContext('2d')); g.font = `800 ${fs}px 'Nanum Gothic',Tahoma,Verdana,sans-serif`; w = g.measureText(txt).width + 2; if (LM_W.size > 300) LM_W.clear(); LM_W.set(k, w); }
  return w;
}
function lmBuild() {
  let el = $('mml');
  if (!el) { const wr = $('mmw'); if (!wr) return; el = document.createElement('div'); el.id = 'mml'; el.className = 'mml'; el.setAttribute('aria-hidden', 'true'); wr.appendChild(el); }
  const m = map; if (!m || !P || !m.landmarks || !m.landmarks.length) { if (el.firstChild) el.innerHTML = ''; return; }
  const F = P.flags.found || {}, out = [], loc = MM.mode === 'local', box = MM.el ? MM.el.box : $('mapw');
  const bw = (box && box.clientWidth) || 180, ppt = bw / MM.V, fs = loc ? 9.5 : 8.5, th = fs + 2, placed = [];
  const hit = (x0, y0, w) => x0 < 1 || x0 + w > bw - 1 || y0 < 1 || y0 + th > bw - 1 || placed.some(b => x0 < b[1] && x0 + w > b[0] && y0 < b[3] && y0 + th > b[2]);
  placed.push([bw / 2 - 8, bw / 2 + 8, 0, 14]);   // the "N"
  if (MM.el && !MM.el.z.hidden) placed.push([bw - 26, bw, bw - 26, bw]);   // the zoom button
  const L = m.landmarks.filter(l => l.name).map(l => ({ l, v: !!F[lmKey(m, l)], d: hyp(P.x - l.x, P.y - l.y) })).sort((p, q) => p.d - q.d);
  for (const { l, v, d } of L) {
    if (!v && d > LM_NEAR) continue;
    const px = (l.x - MM.x0) * ppt, py = (l.y - MM.y0) * ppt; if (px < -2 || py < -2 || px > bw + 2 || py > bw + 2) continue;   // outside the view
    const pos = `left:${(l.x / m.w * 100).toFixed(2)}%;top:${(l.y / m.h * 100).toFixed(2)}%`;
    if (!v) { out.push(`<span class="lmk q" style="${pos}">?</span>`); continue; }
    placed.push([px - 4, px + 4, py - 4, py + 4]);   // the pip itself
    const tw = lmTextW(l.name, fs), cx = clamp(px - tw / 2, 1, bw - 1 - tw);
    let at = null;
    for (const [x0, y0] of [[px + 5, py - th / 2], [px - 5 - tw, py - th / 2], [cx, py - 5 - th], [cx, py + 5]]) if (!hit(x0, y0, tw)) { at = [x0, y0]; placed.push([x0, x0 + tw, y0, y0 + th]); break; }
    out.push(`<span class="lmk" style="${pos}"><i></i>${at ? `<b style="left:${(at[0] - px).toFixed(1)}px;top:${(at[1] - py).toFixed(1)}px">${esc(l.name)}</b>` : ''}</span>`);
  }
  el.className = 'mml' + (loc ? ' loc' : '');
  el.innerHTML = out.join('');
}

/* ---------- Tactics: potions (squad team's potion use) ---------- */
// Companion quest status (squad team's squadQuestInfo), or null.
function sqQuest(h) { if (typeof squadQuestInfo !== 'function' || !h || h === P) return null; try { return squadQuestInfo(h.persona || h.id) || null; } catch (e) { return null; } }
function tacQuest(h, i) {
  const q = sqQuest(h); if (!q) return '';
  const tip = esc(`${q.name}${q.title ? ' · reward: the title ' + q.title : ''}${q.perk ? ' and ' + q.perk : ''}`);
  if (q.status === 'ready') return `<button class="btn tq ready" data-act="sqq:${i}" title="${tip}">! Their quest</button>`;
  if (q.status === 'paused') return `<button class="btn tq" data-act="sqq:${i}" title="${tip}">Resume quest</button>`;
  if (q.status === 'active') return `<span class="tq on" title="${tip}">On their quest</span>`;
  if (q.status === 'done') return `<span class="tq done" title="${tip}">✓ ${esc(q.title || 'Quest done')}</span>`;
  return `<span class="tq" title="${tip} · unlocks at Lv ${q.needLvl} after ${q.needMins} min together${q.nowLvl ? `, or at Lv ${q.nowLvl}` : ''}">Quest later</span>`;
}
const TAC_PO = [['auto', 'Auto', 'Drinks from the shared bag when low on HP'], ['off', 'Off', 'Never touches the shared potions']];
function tacPotions(h) {   // { potions, reserve } when the squad team reports them, else null
  if (typeof squadTactics !== 'function') return null; let t = null; try { t = squadTactics(h.id); } catch (e) { return null; }
  if (!t || (typeof t.potions !== 'string' && typeof t.reserve !== 'number')) return null;
  return { potions: typeof t.potions === 'string' ? t.potions : null, reserve: typeof t.reserve === 'number' ? t.reserve : null };
}
function tacPotRow(who, pot, res) {
  if (pot == null && res == null) return '';
  const val = Array.isArray(res) ? (res.every(x => x === res[0]) ? res[0] : '–') : res;
  const step = res == null ? '' : `<span class="tacres" title="Potions they always leave in the bag"><span>Keep</span><button class="btn" data-act="sqr:${who}:-1" aria-label="Keep one fewer potion"${val === 0 ? ' disabled' : ''}>−</button><b>${val}</b><button class="btn" data-act="sqr:${who}:1" aria-label="Keep one more potion"${val >= 99 ? ' disabled' : ''}>+</button></span>`;
  return `<span>Potions</span><div class="tacpot">${pot == null ? '' : tacSeg(who, 'potions', TAC_PO, pot)}${step}</div>`;
}
{
  const baseSqo = ACTS.sqo;
  ACTS.sqo = function (b, c) {
    if (c && c.startsWith('potions=')) {
      if (typeof squadOrder !== 'function') return; const v = c.slice(8) === 'off' ? 'off' : 'auto';
      const L = b === 'all' ? sqMembers().filter(h => h !== P) : [sqMembers()[+b]].filter(Boolean);
      for (const h of L) { const p = tacPotions(h) || {}; try { squadOrder(h.id, p.reserve != null ? { potions: v, reserve: p.reserve } : { potions: v }); } catch (e) { console.error(e); } }
      return;
    }
    return baseSqo(b, c);
  };
  // companion quests (squad team): the Tactics row's quest chip opens the offer, or resumes a paused one
  ACTS.sqq = function (b) {
    const h = sqMembers()[+b]; if (!h || h === P || typeof squadQuestOffer !== 'function') return;
    closeWin('tactics'); try { squadQuestOffer(h.persona || h.id, { force: true }); } catch (e) { console.error(e); }
  };
  ACTS.sqr = function (b, c) {
    if (typeof squadOrder !== 'function') return; const dlt = +c || 0;
    const L = b === 'all' ? sqMembers().filter(h => h !== P) : [sqMembers()[+b]].filter(Boolean);
    for (const h of L) { const p = tacPotions(h); if (!p || p.reserve == null) continue; const o = { reserve: clamp(p.reserve + dlt, 0, 99) }; if (p.potions != null) o.potions = p.potions; try { squadOrder(h.id, o); } catch (e) { console.error(e); } }
  };
}
