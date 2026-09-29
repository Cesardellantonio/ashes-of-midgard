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
    case 'card': { g.fillStyle = '#e8dcc0'; g.fillRect(14, 6, 36, 52); g.strokeStyle = '#8a6a3a'; g.lineWidth = 2; g.strokeRect(15, 7, 34, 50); g.fillStyle = col; g.beginPath(); g.arc(32, 28, 11, 0, 7); g.fill(); g.fillStyle = '#1a1010'; g.fillRect(28, 26, 2, 3); g.fillRect(34, 26, 2, 3); g.fillStyle = '#8a6a3a'; g.fillRect(19, 44, 26, 2); g.fillRect(19, 49, 18, 2); break; }
    case 'dagger': case 'sword': { const L = t.icon === 'sword' ? 1 : 0.65; g.save(); g.translate(32, 32); g.rotate(-Math.PI / 4); g.fillStyle = '#5a3a24'; g.fillRect(-3, 12 * L + 6, 6, 12); g.fillStyle = '#b89a50'; g.fillRect(-10, 10 * L + 4, 20, 4); const gr = g.createLinearGradient(-4, 0, 4, 0); gr.addColorStop(0, '#f0f0f4'); gr.addColorStop(1, '#8a8e98'); g.fillStyle = gr; g.beginPath(); g.moveTo(-4, 10 * L + 4); g.lineTo(4, 10 * L + 4); g.lineTo(3, -26 * L); g.lineTo(0, -30 * L); g.lineTo(-3, -26 * L); g.closePath(); g.fill(); g.restore(); break; }
    case 'rod': { g.strokeStyle = '#6b4a2a'; g.lineWidth = 5; g.beginPath(); g.moveTo(14, 54); g.lineTo(44, 18); g.stroke(); const gr = g.createRadialGradient(46, 16, 1, 46, 16, 10); gr.addColorStop(0, '#fff'); gr.addColorStop(0.4, '#b88aff'); gr.addColorStop(1, 'rgba(120,60,200,0)'); g.fillStyle = gr; g.beginPath(); g.arc(46, 16, 11, 0, 7); g.fill(); break; }
    case 'bow': { g.strokeStyle = '#7a5230'; g.lineWidth = 5; g.beginPath(); g.arc(18, 32, 26, -1.1, 1.1); g.stroke(); g.strokeStyle = '#ddd'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(18 + Math.cos(-1.1) * 26, 32 + Math.sin(-1.1) * 26); g.lineTo(18 + Math.cos(1.1) * 26, 32 + Math.sin(1.1) * 26); g.stroke(); break; }
    case 'mace': { g.strokeStyle = '#5a3a24'; g.lineWidth = 5; g.beginPath(); g.moveTo(16, 52); g.lineTo(38, 24); g.stroke(); g.fillStyle = '#8a8a90'; g.beginPath(); g.arc(42, 20, 10, 0, 7); g.fill(); g.fillStyle = '#c0c0c8'; for (let i = 0; i < 6; i++) { const a = i * 1.05; g.beginPath(); g.moveTo(42 + Math.cos(a) * 9, 20 + Math.sin(a) * 9); g.lineTo(42 + Math.cos(a) * 15, 20 + Math.sin(a) * 15); g.lineTo(42 + Math.cos(a + 0.4) * 9, 20 + Math.sin(a + 0.4) * 9); g.fill(); } break; }
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
function setW(id, pct) { const v = clamp(pct, 0, 100).toFixed(1); if (cache['w' + id] !== v) { cache['w' + id] = v; $(id).style.width = v + '%'; } }
function renderHUD() {
  setText('pname', P.name); setText('pclass', CLASSES[P.cls].name);
  setW('hpb', P.hp / S.maxhp * 100); $('hpbar').classList.toggle('low', P.hp / S.maxhp < 0.25); setText('hpt', `${Math.ceil(P.hp)} / ${S.maxhp}`);
  setW('stb', P.stamina); setText('stt', `${Math.floor(P.stamina)}`);
  setW('spb', P.sp / S.maxsp * 100); setText('spt', `${Math.floor(P.sp)} / ${S.maxsp}`);
  setText('blv', String(P.lvl)); setText('jlv', String(P.jlvl));
  setW('bxp', P.lvl >= MAXLV ? 100 : P.exp / expNeed(P.lvl) * 100); setW('jxp', P.jlvl >= CLASSES[P.cls].maxJob ? 100 : P.jexp / jexpNeed(P.jlvl) * 100);
  setText('zeny', fmt(P.zeny)); const sc = Object.keys(P.flags.shards).length; setText('shardct', sc ? `Shards ${sc}/3` : '');
  $('pipS').className = P.statPts > 0 ? 'pip' : ''; $('pipK').className = P.skillPts > 0 ? 'pip' : '';
  setText('mapn', map.d.name); setText('mapc', `${Math.floor(P.x)}, ${Math.floor(P.y)}`);
  // Hotbar cooldowns
  const hs = $('hotbar').children;
  for (let i = 0; i < 9; i++) {
    const ref = P.hot[i], el = hs[i]; if (!el) continue; const cd = el.querySelector('.cd');
    let pct = 0, nosp = false;
    if (ref && ref.k === 'skill') { const sk = SKILLS[ref.id]; const c = P.cd[ref.id] || 0; if (c > 0) pct = c / (sk.cd || 0.3) * 100; if (P.skills[ref.id] && P.sp < sk.sp(P.skills[ref.id])) nosp = true; }
    if (ref && ref.k === 'item') { const n = countItem(ref.id); const ne = el.querySelector('.n'); if (ne && ne.textContent !== String(n)) ne.textContent = n; nosp = n === 0; }
    if (cd) cd.style.height = pct + '%';
    el.classList.toggle('nosp', nosp);
  }
  // Boss bar
  if (bossShown) { const k = Math.max(0, bossShown.hp / bossShown.maxhp); bossLag += (k - bossLag) * 0.03; if (bossLag < k) bossLag = k; setW('bossfill', k * 100); setW('bosslag', bossLag * 100); }
  // Tips
  const tip = currentTip(); const te = $('tip');
  if (tip) { if (cache.tip !== tip) { cache.tip = tip; te.innerHTML = tip; } te.hidden = false; } else te.hidden = true;
  // Buff timers
  const bs = $('buffs').children; let i = 0; for (const k in P.buffs) { const el = bs[i++]; if (el) { const sp = el.querySelector('span'); const v = String(Math.ceil(P.buffs[k].t)); if (sp.textContent !== v) sp.textContent = v; } }
}
function renderBuffs() { $('buffs').innerHTML = Object.keys(P.buffs).map(k => `<div class="buff" data-tip="buff:${k}"><img src="${skillIcon(P.buffs[k].icon)}" alt=""><span></span></div>`).join(''); }
function renderHotbar() {
  $('hotbar').innerHTML = P.hot.map((ref, i) => {
    if (!ref || (ref.k === 'skill' && !P.skills[ref.id])) return `<button class="hs" data-hot="${i}" aria-label="Empty slot ${i + 1}"><span class="k">${i + 1}</span></button>`;
    const n = ref.k === 'item' ? `<span class="n">${countItem(ref.id)}</span>` : '';
    return `<button class="hs" data-hot="${i}" data-tip="${ref.k}:${ref.id}" aria-label="Slot ${i + 1}"><img src="${iconFor(ref)}" alt=""><span class="k">${i + 1}</span>${n}<span class="cd" style="height:0"></span></button>`;
  }).join('');
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
  journal: { title: 'Journal', w: 440, pos: () => [W / 2 - 220, 80] },
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
function renderAll() { for (const id in UI.open) if (UI.open[id]) renderWin(id); renderHotbar(); UI.dirty = false; }

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
    const list = CLASSES[P.cls].skills.slice(); if (P.cls !== 'novice') list.push('first_aid');
    const rows = list.map(id => {
      const sk = SKILLS[id], lv = P.skills[id] || 0, can = P.skillPts > 0 && lv < sk.max && id !== 'first_aid';
      return `<div class="sk" data-bind="${sk.passive ? '' : 'skill:' + id}" data-tip="skill:${id}"><img src="${skillIcon(id)}" alt="" data-act="${sk.passive || !lv ? '' : 'cast:' + id}"><div><div class="nm">${sk.name} <span class="lv">Lv ${lv}/${sk.max}${sk.passive ? ' · passive' : lv ? ` · ${sk.sp(lv)} SP` : ''}</span></div><div class="ds">${sk.desc(Math.max(1, lv))}</div></div><button class="btn plus" data-act="learn:${id}" ${can ? '' : 'disabled'} aria-label="Learn ${sk.name}">+</button></div>`;
    }).join('');
    return `<div class="row" style="justify-content:space-between;margin-bottom:4px"><span class="muted">${CLASSES[P.cls].name} · Job Lv ${P.jlvl}</span><span>Skill points <b style="color:${P.skillPts ? 'var(--ember)' : 'inherit'}">${P.skillPts}</b></span></div>${rows}<p class="muted" style="margin:8px 0 0;font-size:11.5px">Hover a learned skill and press 1–9 to bind it. Click its icon to use it. Enemy skills target what is under the cursor, then your current target.</p>`;
  },
  journal() {
    const f = P.flags, sh = f.shards;
    const obj = [
      ['Speak with Sigrun at the Waystone in Emberhold.', f.talked.sigrun],
      ['Reach Job Lv 10, master Basic Skill, and take a path from Vidar.', P.cls !== 'novice'],
      ['Take the Rune-Shard of Blood from the Blight Mother, deep in the Ashen Fields.', sh.shard_blood],
      ['Take the Rune-Shard of the Moon from Hati in the Withered Wood.', sh.shard_moon],
      ['Take the Rune-Shard of the Oath from Sir Gaunt in Gloamheim Keep.', sh.shard_oath],
      ['Bring the three shards to Sigrun so she can open the Cinder Gate.', f.gate],
      ['Pass through the Cinder Gate and slay the Ashen King.', f.kingSlain],
      ['Decide the fate of the Tree.', f.ending],
    ];
    let nowSet = false;
    const rows = obj.map(([t, d]) => { let cls = d ? 'done' : ''; if (!d && !nowSet) { cls = 'now'; nowSet = true; } return `<div class="obj ${cls}"><span class="m">${d ? '✓' : cls === 'now' ? '▸' : '·'}</span><span>${t}</span></div>`; }).join('');
    const lore = Object.keys(LORE).filter(k => f.lore[k]).map(k => `<p class="lore"><b>${LORE[k][0]}</b>${LORE[k][1]}</p>`).join('');
    const pt = Math.floor(P.playTime / 60);
    return `<div class="sec">Path</div>${rows}<div class="sec">Chronicle</div>${lore}<p class="muted" style="font-size:11.5px;margin:6px 0 0">Time in the Ash: ${Math.floor(pt / 60)}h ${pt % 60}m</p>`;
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
      if (UI.shopTab === 'supplies') ids = pots;
      else ids = Object.values(ITEMS).filter(t => t.type === 'equip' && !t.unique && t.lvl <= cap && (UI.shopTab === 'weapons' ? t.slot === 'weapon' : t.slot !== 'weapon')).sort((a, b) => (b.jobs.includes(P.cls) - a.jobs.includes(P.cls)) || a.lvl - b.lvl).map(t => t.id);
      const rows = ids.map(id => { const t = ITEMS[id]; const ok = t.type !== 'equip' || t.jobs.includes(P.cls); const stack = t.type === 'use'; return `<div class="li ${ok ? '' : 'off'}" data-tip="shop:${id}"><img src="${iconURL(t)}" alt=""><span>${esc(t.name)}${t.type === 'equip' ? ` <span class="muted">Lv ${t.lvl}</span>` : ''}</span><span class="row"><span class="p">${fmt(t.price)}z</span><button class="btn" data-act="buy:${id}:1" ${P.zeny >= t.price ? '' : 'disabled'}>Buy</button>${stack ? `<button class="btn" data-act="buy:${id}:10" ${P.zeny >= t.price * 10 ? '' : 'disabled'}>×10</button>` : ''}</span></div>`; }).join('');
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
    h += `<div class="${t.jobs.includes(P.cls) ? 'muted' : 'tt-bad'}">${t.jobs.length === 5 ? 'All paths' : t.jobs.map(j => CLASSES[j].name).join(', ')}</div>`;
    if (t.lore) h += `<div class="tt-lore">${esc(t.lore)}</div>`;
  } else {
    h += `<div class="tt-sub">${{ use: 'Consumable', etc: 'Material', card: 'Card', key: 'Rune-Shard' }[t.type]}</div>`;
    if (t.type === 'card') h += `<div class="tt-c">${Object.entries(t.bonus).map(([k, v]) => bonusLine(k, v)).join('<br>')}</div>`;
    if (t.desc) h += `<div class="tt-l" style="margin-top:3px">${esc(t.desc)}</div>`;
  }
  if (!fromShop && t.type !== 'key') h += `<div class="tt-p">Sells for ${fmt(sellPrice(it))}z</div>`;
  return h;
}
function skillTooltip(id) {
  const sk = SKILLS[id], lv = P.skills[id] || 0;
  let h = `<div class="tt-name">${sk.name}</div><div class="tt-sub">${sk.passive ? 'Passive' : { enemy: 'Targets an enemy', self: 'Self', ground: 'Targets the ground at your cursor', heal: 'Self, or an undead enemy' }[sk.tgt]} · Lv ${lv}/${sk.max}</div>`;
  h += `<div class="tt-l">${sk.desc(Math.max(1, lv))}</div>`;
  if (!sk.passive && lv) h += `<div class="muted" style="margin-top:3px">${sk.sp(lv)} SP${sk.cast ? ` · ${(sk.cast(lv) * Math.max(0.2, 1 - S.dex / 150)).toFixed(1)}s cast` : ''}</div>`;
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
  if (k === 'buff') { const b = P.buffs[v]; return b ? `<div class="tt-name">${b.name}</div><div class="tt-l">${Object.entries(b.bonus).map(([a, n]) => bonusLine(a, n)).join('<br>')}</div><div class="muted">${Math.ceil(b.t)}s left</div>` : null; }
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
const LORE = {
  ash: ['The Ash', 'Before the end there were nine realms on the branches of Yggdrasil. Then Surtr’s herald climbed up out of Muspelheim, crowned himself the Ashen King, and set the roots on fire. The gods did not answer. The dead stopped staying dead, because Hel’s gate burned too.'],
  sigrun: ['Sigrun', 'She was a Valkyrie. When the Tree burned there were no more halls to carry the fallen to, so she stayed in Midgard and lit the Waystones instead. She says the Tree refuses some of the dead. You are one of them.'],
  blight_mother: ['The Blight Mother', 'She was a Poring once, the pink and harmless kind children chased through the fields of Prontera. She swallowed the Shard of Blood thinking it was a sweet. It made her a mother of thousands, and none of her children have souls.'],
  hati: ['Hati', 'The wolf who chased the moon for ten thousand years. When the sky burned he finally caught it and swallowed it, and the Shard of the Moon with it. He was only ever trying to finish the one thing he was made for.'],
  sir_gaunt: ['Sir Gaunt', 'He swore to Tyr that he would hold Gloamheim until the end of the world. The world ended. He is still holding it, against everyone, forever. The Shard of the Oath was the only thing keeping his armor together.'],
  vidar: ['Vidar', 'The old wanderer has one eye and a great deal of advice. He asks you not to tell Sigrun who he really is. She knows. She has always known.'],
  ashen_king: ['The Ashen King', 'He was a fire giant’s herald, sent ahead to prepare the world for burning. With his master gone quiet he crowned himself instead. In the end he only wanted what everyone in Midgard wants: for the fire to mean something.'],
};
function shardCount() { return Object.keys(P.flags.shards).length; }
async function talkTo(n) {
  if (n.id === 'sigrun') return talkSigrun();
  if (n.id === 'brokkr') return talkBrokkr();
  if (n.id === 'vidar') return talkVidar();
  if (n.id === 'astrid') return talkAstrid();
}
async function talkSigrun() {
  const f = P.flags; const N = 'Sigrun, the Ember Maiden';
  if (!f.talked.sigrun) {
    await say(N, [
      'You are breathing. Good. The Tree spat you back out, same as the rest of us.',
      'I am Sigrun. I carried the fallen to Valhalla once. Now there is no Valhalla, so I tend the last Waystone in Midgard and count the ones who come back wrong.',
      'When the Ashen King burned the roots of Yggdrasil, the Rune of Binding that held the realms together shattered. Three shards fell. Three creatures swallowed them, and the Ash made them into something worse.',
      '<i>She points east, then further east, then north.</i> The Blight Mother, deep in the Ashen Fields. Hati the Moon-Eater, in the Withered Wood beyond. And Sir Gaunt, who swore an oath to Tyr and broke it, in Gloamheim Keep.',
      'Bring me all three shards and I can open the Cinder Gate behind me. The King waits past it, on a throne of burned roots.',
      'You are a Novice. The Ash will eat you. Hunt the small things in the fields first. When you have learned enough, speak to old Vidar by the broken houses. He knows the four paths.',
    ]);
    f.talked.sigrun = true; f.lore.sigrun = true; UI.dirty = true; return;
  }
  if (shardCount() === 3 && !f.gate) {
    await say(N, ['<i>The three shards rise out of your pack on their own and hang in the air between you, turning.</i>', 'Blood, Moon and Oath. I did not think anyone would do it. I stopped hoping a long time ago, and it turns out hope does not care whether you stop.', '<i>She presses the shards together. The Rune of Binding does not heal, but it remembers what it was. Behind her, the Cinder Gate groans open.</i>', 'The King is waiting. Rest first. Whatever you decide up there, decide it as yourself.']);
    f.gate = true; banner('The Cinder Gate Opens', 'North of the Waystone', 'band gold long'); Sfx.victory(); UI.dirty = true; saveGame(); return;
  }
  if (f.ending) { await say(N, [f.ending === 'embers' ? 'There is a new Waystone at the top of the world now. It has your name on it. I tend it every morning.' : 'You wear the crown well. I let the fire here go out. I hope you understand.']); return; }
  const lines = { 0: 'The Blight Mother lies east, where the fields turn to bog. Her children are weak. She is not.', 1: 'One shard. It beats like a heart, doesn’t it? Hati hunts the Withered Wood, east of the fields. Take potions. He is fast.', 2: 'Two. Sir Gaunt holds Gloamheim, north through the Wood. He was the best of us. Heal magic burns him, if you have any.', 3: 'The gate is open. Go.' };
  const r = await dialog(N, lines[shardCount()] + (f.kingSlain ? '<br><br>The King is dead? Then go to the Heart. The choice is yours, not mine.' : ''), ['Tend my wounds', 'Farewell']);
  $('dialog').hidden = true;
  if (r === 0) { P.hp = S.maxhp; P.sp = S.maxsp; pillar(P, '#ffb060'); Sfx.heal(); log('Sigrun’s hands are warm. Your wounds close.', 'npc'); }
}
async function talkBrokkr() {
  const N = 'Brokkr the Smith';
  if (!P.flags.talked.brokkr) { P.flags.talked.brokkr = true; await say(N, ['Another one back from the dead? Hah. You’ll need steel, then. The dead always need steel.', 'I buy anything the Ash leaves lying around. I sell what I can forge. And for a price I’ll <i>refine</i> your gear. Up to +4 the metal takes it. Past that it starts to think for itself.']); }
  UI.shopMode = 'buy'; openWin('shop');
}
async function talkVidar() {
  const N = 'Vidar the Wanderer';
  if (P.cls === 'novice') {
    if (P.jlvl < 10 || P.skills.basic < 9) { await say(N, ['<i>An old man in a grey hood. One eye catches the firelight. The other is not there.</i>', 'A Novice. You do not know which end of the sword to hold. Come back when you do.', `Reach Job Level 10 and learn Basic Skill to level 9. <i>(Job Lv ${P.jlvl}/10, Basic Skill ${P.skills.basic}/9.)</i>`]); return; }
    const r = await dialog(N, 'So. You have learned the basics. There are four paths left in Midgard. Choose one and walk it until it kills you or you finish it.', ['Swordsman', 'Mage', 'Archer', 'Acolyte', 'Not yet']);
    if (r < 0 || r > 3) { $('dialog').hidden = true; return; }
    const cls = ['swordsman', 'mage', 'archer', 'acolyte'][r];
    const r2 = await dialog(N, `<b>${CLASSES[cls].name}.</b> ${CLASSES[cls].blurb}<br><br>This cannot be undone.`, [`Become a ${CLASSES[cls].name}`, 'Let me think']);
    $('dialog').hidden = true;
    if (r2 !== 0) return;
    P.cls = cls; P.jlvl = 1; P.jexp = 0; for (const s of CLASSES[cls].skills) P.skills[s] = P.skills[s] || 0;
    const w = makeItem(CLASSES[cls].starter); if (addItem(w)) { const cur = P.equip.weapon; if (!cur || canEquip(w) === null) equip(w); }
    calcStats(); P.hp = S.maxhp; P.sp = S.maxsp;
    pillar(P, '#f0d070', true); banner(CLASSES[cls].name, 'A path chosen', 'band gold'); Sfx.victory();
    log(`You are now a ${CLASSES[cls].name}. Vidar gave you a ${ITEMS[CLASSES[cls].starter].name}. New skills are in the Skills window (S).`, 'lvl');
    UI.dirty = true; saveGame(); return;
  }
  if (shardCount() >= 2 && !P.flags.lore.vidar) {
    P.flags.lore.vidar = true;
    await say(N, ['<i>He watches the fire a long time before he speaks.</i>', 'I gave an eye once, at a well, for wisdom. I learned how the world would end. I did not learn how to stop it. That is the trouble with wisdom.', 'Don’t tell Sigrun who I am. She would be kind about it, and I could not bear that.']);
    return;
  }
  await say(N, [pick(['The Ash remembers every name it burned. Try not to give it yours.', 'Every Shardbearer was something good once. Remember that, and then kill them anyway.', 'STR for the arm, VIT for the heart, DEX for the eye. The rest is luck, and LUK.', 'When the ground glows red under a great beast, move. That is all the wisdom I have left.'])]);
}
async function talkAstrid() {
  const N = 'Astrid';
  if (!P.flags.talked.astrid) { P.flags.talked.astrid = true; addItem(makeItem('butterfly_wing', { qty: 2 })); await say(N, ['Are you a ghost? Sigrun says the people who come back aren’t ghosts. They’re just… late.', 'Here. I found these. If you flap them they take you home to the fire. I don’t need them. I don’t go anywhere.', '<i>She gives you 2 Butterfly Wings.</i>']); return; }
  const lines = shardCount() >= 1 ? ['You smell like jelly. Did you fight the big pink one? She used to be nice, I think.', 'Is the wolf really eating the moon? Can you make him give it back?', 'If you kill the King, will the Tree grow back? Will my mum come back?'] : ['There used to be Porings in the fields. Pink ones. They bounced. Now they bite.', 'Sigrun cries when she thinks nobody is looking. I look anyway.'];
  await say(N, [pick(lines)]);
}
async function talkHeart() {
  const N = 'The Heart of Yggdrasil';
  if (!P.flags.kingSlain) { await say(N, ['<i>A knot of burned root as big as a house. Something inside it is not quite dead. The King stands between you and it.</i>']); return; }
  if (P.flags.ending) { await say(N, [P.flags.ending === 'embers' ? '<i>The Heart glows softly. Somewhere far below, a root has turned green.</i>' : '<i>The Heart is cold. It answers to you now.</i>']); return; }
  const r = await dialog(N, '<i>The Heart pulses once, very faintly, like something asking permission. The King’s crown lies in the ash at your feet, still warm.</i><br><br>You could give the Tree the ember that would not go out, the one inside you. Or you could pick up the crown.', ['Relight the Tree', 'Take the Crown of Cinders', 'Not yet']);
  $('dialog').hidden = true;
  if (r === 0) ending('embers'); else if (r === 1) ending('ash');
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
const SAVE_KEYS = ['name', 'hair', 'cls', 'lvl', 'exp', 'jlvl', 'jexp', 'statPts', 'skillPts', 'st', 'skills', 'hp', 'sp', 'zeny', 'inv', 'equip', 'hot', 'map', 'x', 'y', 'lastWay', 'kindled', 'flags', 'lostZeny', 'playTime'];
function serialize() { if (!P) return null; const o = {}; for (const k of SAVE_KEYS) o[k] = P[k]; o.uidc = uidc; o.v = 1; return JSON.stringify(o); }
function saveGame() { if (!started || !P) return; const s = serialize(); if (s) store('aom-save', s); }
function loadSave() { const raw = store('aom-save'); if (!raw) return null; try { return JSON.parse(raw); } catch (e) { return null; } }
function applySave(o) {
  P = Object.assign(newPlayer(o.name, o.hair), o); uidc = Math.max(uidc, o.uidc || 1);
  P.flags = Object.assign({ shards: {}, bosses: {}, lore: { ash: true }, tips: {}, talked: {} }, P.flags);
  for (const k of ['shards', 'bosses', 'lore', 'tips', 'talked']) P.flags[k] = P.flags[k] || {};
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
  log(fresh ? 'You wake in the Ash with nothing but a knife and a shirt.' : `Welcome back, ${P.name}.`, 'sys');
  log(`Press H for controls. Press ${winKey('status')} to spend status points.`, 'sys'); refreshKeyHints();
}
function showTitle() {
  const save = loadSave(); const hairs = ['#b9b3a8', '#1d1a1a', '#a4532a', '#caa04f', '#6a7890'];
  let hair = hairs[0], armed = false;
  $('title').innerHTML = `<div class="t-wrap">
    <div class="t-rune">ᚨᛊᚺᛖᛊ · ᛟᚠ · ᛗᛁᛞᚷᚨᚱᛞ</div>
    <h1>Ashes of Midgard</h1>
    <p class="t-sub">The Tree burned. You did not.</p>
    <div class="t-card rwin"><div class="rtb">Character</div><div class="rbd">
      ${save ? `<button class="btn big" id="bCont">Continue · ${esc(save.name)}, Lv ${save.lvl} ${CLASSES[save.cls] ? CLASSES[save.cls].name : ''}</button><div class="sec" style="margin:6px 0 0">Or begin again</div>` : ''}
      <label for="nm">Name</label><input id="nm" maxlength="16" value="Unkindled" autocomplete="off" spellcheck="false">
      <label>Hair</label><div class="hairs">${hairs.map((h, i) => `<button class="hair ${i ? '' : 'on'}" data-h="${h}" style="background:${h}" aria-label="Hair color ${i + 1}"></button>`).join('')}</div>
      <button class="btn big" id="bNew">Rise</button>
    </div></div>
    <p class="t-foot">Single-player · Saves in this browser at every Waystone</p></div>`;
  $('title').querySelectorAll('.hair').forEach(b => b.onclick = () => { hair = b.dataset.h; $('title').querySelectorAll('.hair').forEach(x => x.classList.toggle('on', x === b)); });
  if (save) $('bCont').onclick = () => { Sfx.unlock(); applySave(save); startGame(false); };
  $('bNew').onclick = () => {
    Sfx.unlock();
    if (save && !armed) { armed = true; $('bNew').textContent = 'Rise, and erase the saved character'; $('bNew').classList.add('warn'); return; }
    const name = ($('nm').value || 'Unkindled').trim().slice(0, 16) || 'Unkindled';
    P = newPlayer(name, hair); uidc = 1;
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
