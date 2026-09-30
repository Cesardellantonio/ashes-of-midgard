'use strict';
/* =========================================================
   Pixel sprites: chibi characters and monsters painted into
   small canvases, hard-edged and outlined like RO sprites.
   Each look gets frames for idle, walk, attack, cast, hurt,
   dead and sit, in front and back views.
   ========================================================= */
if (!CanvasRenderingContext2D.prototype.roundRect) CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h) { this.rect(x, y, w, h); };
let G = null;
const ANIMS = { idle: 4, walk: 6, attack: 4, cast: 2, hurt: 1, dead: 1, sit: 1, block: 1, dodge: 4 };

function eye(x, y, s, col) { G.fillStyle = col || '#2a1810'; G.beginPath(); G.ellipse(x, y, 1.5 * s + 0.5, 2.7 * s, 0, 0, 7); G.fill(); G.fillStyle = '#fff'; G.fillRect(x - 1, y - 2.2, 1.4, 1.4); }
function xEye(x, y) { G.strokeStyle = '#2a1810'; G.lineWidth = 1.4; G.beginPath(); G.moveTo(x - 2, y - 2); G.lineTo(x + 2, y + 2); G.moveTo(x + 2, y - 2); G.lineTo(x - 2, y + 2); G.stroke(); }
function gEye(x, y, r, col) { G.fillStyle = col; G.beginPath(); G.arc(x, y, r, 0, 7); G.fill(); G.fillStyle = '#fff'; G.fillRect(x - 0.5, y - 0.5, 1, 1); }
function rr(x, y, w, h, r, col) { G.fillStyle = col; G.beginPath(); G.roundRect(x, y, w, h, r); G.fill(); }

/* ---------- Humanoid (players, NPCs, humanoid monsters) ---------- */
function paintHuman(o, anim, i, n, back) {
  const T = n > 1 ? i / n : 0;
  const skin = o.skin || '#f7d8bf', body = o.body || '#886644', trim = o.trim || shade(body, -0.3), legs = o.legs || '#3a2e28', boot = shade(legs, -0.35);
  let leg = 0, bob = 0, armA = 0.3, armB = 0.18, lean = 0;
  if (anim === 'idle') bob = [0, 0.5, 1, 0.5][i];
  else if (anim === 'walk') { const ph = T * Math.PI * 2; leg = Math.sin(ph); bob = Math.abs(Math.cos(ph)) * 1.6; armA = 0.3 - leg * 0.55; armB = 0.2 + leg * 0.55; }
  else if (anim === 'attack') { const k = [0, 0.3, 0.75, 1][i]; if (o.weapon === 'bow') { armA = -1.57; armB = -1.35; lean = -0.04 * k; } else { armA = -3.0 + k * 2.9; lean = (k - 0.45) * 0.18; } }
  else if (anim === 'cast') { armA = -2.6 + i * 0.2; armB = -2.4 - i * 0.2; bob = i; }
  else if (anim === 'hurt') { lean = -0.22; armA = 1.1; armB = 0.9; }
  else if (anim === 'block') { armA = -1.35; armB = -1.0; lean = -0.08; leg = 0.35; }
  const sit = anim === 'sit', dead = anim === 'dead';
  G.save();
  if (dead) { G.translate(6, -5); G.rotate(-Math.PI / 2); armA = 2.8; armB = 2.5; }
  if (anim === 'dodge') { G.translate(0, -16); G.rotate(i / n * Math.PI * 2); G.scale(0.85, 0.85); G.translate(0, 18); armA = 1.8; armB = 1.6; leg = 0.8; }
  G.rotate(lean);
  const wid = o.wide ? 1.22 : 1;
  const hip = sit ? -5 : -13, ty0 = hip - 16 - bob, hy = ty0 - 9;
  if (o.wings && !back) { G.fillStyle = '#e8e4dc'; for (const sg of [-1, 1]) { G.beginPath(); G.moveTo(sg * 3, ty0 + 4); G.quadraticCurveTo(sg * 24, ty0 - 16, sg * 28, ty0 + 8); G.quadraticCurveTo(sg * 18, ty0 + 10, sg * 20, ty0 + 20); G.quadraticCurveTo(sg * 10, ty0 + 12, sg * 3, ty0 + 12); G.fill(); } G.fillStyle = '#c8c2b8'; G.fillRect(-20, ty0 + 6, 4, 2); G.fillRect(16, ty0 + 6, 4, 2); }
  if (o.cape && !back) { G.fillStyle = shade(o.cape, -0.15); G.beginPath(); G.moveTo(-7, ty0 + 1); G.lineTo(5, ty0 + 1); G.lineTo(5 - leg * 2, hip + 12); G.lineTo(-12 - leg * 3, hip + 13); G.closePath(); G.fill(); }
  // back arm
  G.save(); G.translate(-5 * wid, ty0 + 3); G.rotate(armB); rr(-2, 0, 4.5, 9, 2, shade(o.robe ? body : body, -0.2)); G.fillStyle = shade(skin, -0.1); G.beginPath(); G.arc(0.2, 10, 2.4, 0, 7); G.fill(); G.restore();
  if (o.shield && !back) { G.fillStyle = '#7a6a50'; G.beginPath(); G.ellipse(-9 * wid, ty0 + 10, 5, 8, 0, 0, 7); G.fill(); G.fillStyle = '#c8a860'; G.beginPath(); G.arc(-9 * wid, ty0 + 10, 1.6, 0, 7); G.fill(); }
  // legs
  if (sit) { rr(-5, hip - 3, 16, 5.5, 2.5, shade(legs, -0.15)); rr(-3, hip, 16, 5.5, 2.5, legs); rr(11, hip - 4, 4, 7, 1.5, boot); rr(13, hip - 1, 4, 7, 1.5, boot); }
  else {
    G.save(); G.translate(-3, hip); G.rotate(-leg * 0.55); rr(-2.6, 0, 5.2, 12, 2, shade(legs, -0.15)); rr(-3, 9, 6.5, 4, 1.5, boot); G.restore();
    G.save(); G.translate(3, hip); G.rotate(leg * 0.55); rr(-2.6, 0, 5.2, 12, 2, legs); rr(-3, 9, 6.5, 4, 1.5, boot); G.restore();
  }
  // torso
  if (o.robe) { G.fillStyle = body; G.beginPath(); G.moveTo(-8 * wid, ty0); G.lineTo(8 * wid, ty0); G.lineTo(11, hip + (sit ? 3 : 11)); G.lineTo(-11, hip + (sit ? 3 : 11)); G.closePath(); G.fill(); G.fillStyle = shade(body, -0.18); G.beginPath(); G.moveTo(3, ty0); G.lineTo(8 * wid, ty0); G.lineTo(11, hip + (sit ? 3 : 11)); G.lineTo(5, hip + (sit ? 3 : 11)); G.fill(); G.fillStyle = trim; G.fillRect(-11, hip + (sit ? 1 : 9), 22, 2.5); if (!back) G.fillRect(-1, ty0, 2.5, hip - ty0 + 10); }
  else { rr(-8 * wid, ty0, 16 * wid, 17, 4, body); G.fillStyle = shade(body, -0.18); G.fillRect(3 * wid, ty0 + 2, 5 * wid, 14); G.fillStyle = trim; G.fillRect(-8 * wid, hip - 3, 16 * wid, 3); if (!back) { G.fillStyle = shade(body, 0.25); G.fillRect(-6 * wid, ty0 + 2, 3, 6); } }
  if (o.ribs) { G.strokeStyle = 'rgba(60,44,30,.8)'; G.lineWidth = 1.2; for (let k = 0; k < 4; k++) { G.beginPath(); G.moveTo(-5, ty0 + 3 + k * 3.4); G.lineTo(5, ty0 + 3 + k * 3.4); G.stroke(); } }
  if (o.cape && back) { G.fillStyle = o.cape; G.beginPath(); G.moveTo(-9, ty0 + 1); G.lineTo(9, ty0 + 1); G.lineTo(11 + leg, hip + 12); G.lineTo(-11 + leg, hip + 12); G.closePath(); G.fill(); G.fillStyle = shade(o.cape, -0.2); G.fillRect(-1, ty0 + 3, 2, hip - ty0 + 8); }
  // head
  paintHead(o, hy, back, anim);
  // weapon arm (drawn after head so raised weapons read clearly)
  G.save(); G.translate(5 * wid, ty0 + 3); G.rotate(armA); rr(-2.2, 0, 4.5, 9, 2, body); G.fillStyle = skin; G.beginPath(); G.arc(0.2, 10, 2.5, 0, 7); G.fill(); G.translate(0.2, 10); paintWeapon(o.weapon, o.wcol, anim === 'attack'); G.restore();
  G.restore();
}
function paintHead(o, hy, back, anim) {
  const R = 12, skin = o.skin || '#f7d8bf', hair = o.hair || '#6a4428', head = o.head || 'human', closed = anim === 'dead' || anim === 'hurt';
  if (head === 'human') {
    G.fillStyle = hair; G.beginPath(); G.arc(-1, hy - 1, R + 1.5, 0, 7); G.fill();
    if (!back) {
      G.fillStyle = skin; G.beginPath(); G.ellipse(2.2, hy + 1.8, R - 1.2, R - 1.8, 0, 0, 7); G.fill();
      G.fillStyle = hair; G.beginPath(); G.moveTo(-R - 0.5, hy + 2); G.quadraticCurveTo(-R, hy - R - 4, 2, hy - R - 2.5); G.quadraticCurveTo(R + 3, hy - R, R + 1.2, hy - 1);
      G.lineTo(R - 1.5, hy - 5); G.lineTo(R - 3.5, hy - 0.5); G.lineTo(R - 6, hy - 5.5); G.lineTo(R - 8.5, hy - 1); G.lineTo(R - 11, hy - 5); G.lineTo(-3, hy + 1); G.lineTo(-R + 3, hy + 8); G.closePath(); G.fill();
      G.fillStyle = shade(hair, 0.25); G.fillRect(-4, hy - R + 1, 6, 2);
      if (closed) { xEye(3.5, hy + 3); xEye(9.5, hy + 3); } else { eye(3.5, hy + 3, 1, o.eyeCol); eye(9.5, hy + 3, 0.85, o.eyeCol); }
      G.fillStyle = '#b86a5a'; G.fillRect(6, hy + 8, 3, 1.2);
      if (o.beard) { G.fillStyle = hair; G.beginPath(); G.moveTo(-2, hy + 5); G.lineTo(R, hy + 4); G.lineTo(7, hy + 17); G.lineTo(0, hy + 12); G.closePath(); G.fill(); }
    } else { G.fillStyle = shade(hair, -0.12); G.beginPath(); G.ellipse(-1, hy + 3, R - 1, R - 2.5, 0, 0, 7); G.fill(); G.fillStyle = shade(hair, 0.2); G.fillRect(-5, hy - R + 1, 7, 2); }
  } else if (head === 'skull') {
    G.fillStyle = skin; G.beginPath(); G.arc(1, hy, R - 1, 0, 7); G.fill(); rr(-2, hy + 5, 11, 6, 2, skin);
    if (!back) { G.fillStyle = '#1a0c0a'; G.beginPath(); G.arc(3, hy + 1, 3, 0, 7); G.arc(9, hy + 1, 2.6, 0, 7); G.fill(); gEye(3, hy + 1, 1.2, o.eye); gEye(9, hy + 1, 1, o.eye); G.fillStyle = 'rgba(0,0,0,.6)'; for (let k = 0; k < 4; k++) G.fillRect(-1 + k * 2.6, hy + 8, 1, 3); }
  } else if (head === 'helm' || head === 'horned') {
    const hc = head === 'horned' ? '#2e2420' : shade(o.body, 0.12);
    G.fillStyle = hc; G.beginPath(); G.arc(1, hy, R, 0, 7); G.fill(); G.fillStyle = shade(hc, 0.3); G.fillRect(-6, hy - R + 2, 8, 2);
    if (!back) { G.fillStyle = '#0a0808'; G.fillRect(0, hy - 1.5, 12, 4); gEye(5, hy + 0.5, 1.3, o.eye); gEye(10, hy + 0.5, 1.1, o.eye); }
    if (head === 'horned') { G.fillStyle = '#e8dcc0'; G.beginPath(); G.moveTo(-7, hy - 6); G.quadraticCurveTo(-20, hy - 12, -17, hy - 28); G.quadraticCurveTo(-12, hy - 15, -2, hy - 9); G.fill(); G.beginPath(); G.moveTo(6, hy - 7); G.quadraticCurveTo(18, hy - 14, 18, hy - 29); G.quadraticCurveTo(12, hy - 16, 1, hy - 10); G.fill(); for (let k = 0; k < 5; k++) { G.fillStyle = k % 2 ? '#ffb040' : '#ff6a20'; G.beginPath(); G.moveTo(-6 + k * 3.4, hy - 9); G.lineTo(-4.3 + k * 3.4, hy - 18); G.lineTo(-2.6 + k * 3.4, hy - 9); G.fill(); } }
  } else if (head === 'sack') {
    G.fillStyle = '#c8aa74'; G.beginPath(); G.arc(1, hy, R - 1, 0, 7); G.fill();
    if (!back) { G.strokeStyle = '#3a2a1a'; G.lineWidth = 1.4; G.beginPath(); G.moveTo(2, hy - 1); G.lineTo(6, hy + 3); G.moveTo(6, hy - 1); G.lineTo(2, hy + 3); G.stroke(); gEye(10, hy + 1, 1.3, o.eye); G.beginPath(); G.moveTo(1, hy + 7); for (let k = 0; k < 5; k++) G.lineTo(2 + k * 2, hy + (k % 2 ? 9 : 7)); G.stroke(); }
    G.fillStyle = '#7a5a2a'; G.beginPath(); G.ellipse(0, hy - 7, 17, 4, 0, 0, 7); G.fill(); G.beginPath(); G.moveTo(-7, hy - 8); G.lineTo(0, hy - 20); G.lineTo(7, hy - 8); G.fill();
  } else if (head === 'kobold') {
    G.fillStyle = o.skin; G.beginPath(); G.ellipse(1, hy, R - 1, R - 2, 0, 0, 7); G.fill();
    G.beginPath(); G.moveTo(-6, hy - 5); G.lineTo(-9, hy - 19); G.lineTo(0, hy - 8); G.fill(); G.beginPath(); G.moveTo(3, hy - 7); G.lineTo(4, hy - 20); G.lineTo(9, hy - 6); G.fill();
    if (!back) { G.beginPath(); G.moveTo(5, hy); G.lineTo(17, hy + 3); G.lineTo(5, hy + 7); G.fill(); G.fillStyle = '#1a1010'; G.fillRect(15, hy + 2, 2, 2); gEye(6, hy - 1.5, 1.4, o.eye); G.fillStyle = '#fff'; G.fillRect(9, hy + 5, 1.4, 2); G.fillRect(12, hy + 5, 1.4, 2); }
  } else if (head === 'hood') {
    G.fillStyle = o.body; G.beginPath(); G.arc(0, hy, R + 1.5, 0, 7); G.fill(); G.beginPath(); G.moveTo(-R, hy); G.lineTo(-R - 2, hy + 12); G.lineTo(0, hy + 8); G.fill();
    if (!back) { G.fillStyle = '#100c0c'; G.beginPath(); G.ellipse(4, hy + 2, 7, 8, 0, 0, 7); G.fill(); G.fillStyle = skin; G.fillRect(4, hy + 5, 5, 4); gEye(7, hy + 0.5, 1.1, '#9fd0ff'); G.fillStyle = '#8a8480'; G.beginPath(); G.moveTo(0, hy + 8); G.lineTo(11, hy + 8); G.lineTo(6, hy + 20); G.closePath(); G.fill(); }
  }
  // hats & headgear
  if (o.hat === 'witch') { G.fillStyle = shade(o.body, -0.2); G.beginPath(); G.ellipse(0, hy - 7, 16, 4, 0, 0, 7); G.fill(); G.beginPath(); G.moveTo(-9, hy - 8); G.quadraticCurveTo(-3, hy - 24, -12, hy - 31); G.lineTo(9, hy - 8); G.fill(); G.fillStyle = o.trim; G.fillRect(-9, hy - 11, 18, 3); }
  else if (o.hat === 'biretta') { rr(-8, hy - 17, 16, 8, 2, o.trim); G.fillStyle = shade(o.trim, 0.3); G.fillRect(-1, hy - 21, 3, 4); }
  else if (o.hat === 'feather') { G.fillStyle = '#3e5a2a'; G.beginPath(); G.ellipse(0, hy - 8, 14, 5, -0.1, 0, 7); G.fill(); G.strokeStyle = '#e04a2a'; G.lineWidth = 2.5; G.beginPath(); G.moveTo(-6, hy - 9); G.quadraticCurveTo(-16, hy - 18, -19, hy - 27); G.stroke(); }
  if (o.headgear === 'poring') { G.fillStyle = '#f59ab0'; G.beginPath(); G.ellipse(0, hy - 13, 8, 6.5, 0, 0, 7); G.fill(); G.fillStyle = '#fff'; G.fillRect(-4, hy - 17, 3, 2); G.fillStyle = '#2a1a1a'; G.fillRect(1, hy - 14, 1.5, 2); G.fillRect(4.5, hy - 14, 1.5, 2); }
  else if (o.headgear === 'crown') { G.fillStyle = '#f0b040'; G.beginPath(); G.moveTo(-8, hy - 8); G.lineTo(-8, hy - 17); G.lineTo(-4, hy - 12); G.lineTo(0, hy - 19); G.lineTo(4, hy - 12); G.lineTo(8, hy - 17); G.lineTo(8, hy - 8); G.fill(); G.fillStyle = '#e04040'; G.fillRect(-1, hy - 12, 2.5, 2.5); }
  else if (o.headgear === 'helm') { G.fillStyle = '#9a9aa8'; G.beginPath(); G.arc(0, hy - 2, R + 1.5, Math.PI, 0); G.fill(); G.fillStyle = '#c8c8d4'; G.fillRect(-1, hy - 17, 3, 6); }
  else if (o.headgear === 'cap') { G.fillStyle = o.hgCol || '#7a6a54'; G.beginPath(); G.arc(0, hy - 2, R + 1, Math.PI, 0); G.fill(); if (!back) G.fillRect(4, hy - 3, 11, 2.5); }
  else if (o.headgear === 'band') { G.fillStyle = o.hgCol || '#b03a2a'; G.fillRect(-R - 1, hy - 7, 2 * R + 3, 3.5); if (back) { G.fillRect(-R - 5, hy - 6, 5, 2); G.fillRect(-R - 4, hy - 3, 4, 2); } }
  else if (o.headgear === 'circlet') { G.fillStyle = o.hgCol || '#e8c050'; G.fillRect(-R, hy - 8, 2 * R + 2, 2.2); if (!back) { G.fillStyle = o.hgGem || '#7ad0ff'; G.fillRect(3, hy - 10, 3, 3); } if (o.hgWings) { G.fillStyle = '#e8ecf4'; for (const sg of [-1, 1]) { G.beginPath(); G.moveTo(sg * (R - 1), hy - 7); G.lineTo(sg * (R + 7), hy - 16); G.lineTo(sg * (R + 3), hy - 6); G.fill(); } } }
  else if (o.headgear === 'brim') { G.fillStyle = shade(o.hgCol || '#c8a860', -0.15); G.beginPath(); G.ellipse(0, hy - 6, R + 8, 4, 0, 0, 7); G.fill(); G.fillStyle = o.hgCol || '#c8a860'; G.beginPath(); G.ellipse(0, hy - 10, R - 2, 7, 0, Math.PI, 0); G.fill(); G.fillRect(-R + 2, hy - 10, 2 * R - 4, 4); }
  else if (o.headgear === 'ears') { G.fillStyle = o.hgCol || '#2a2a30'; for (const sg of [-1, 1]) { G.beginPath(); G.moveTo(sg * 3, hy - R + 1); G.lineTo(sg * 9, hy - R - 11); G.lineTo(sg * 11, hy - R + 3); G.fill(); } if (o.hgHood) { G.beginPath(); G.arc(0, hy - 2, R + 1.5, Math.PI, 0); G.fill(); } }
  else if (o.headgear === 'feather') { G.strokeStyle = o.hgCol || '#1a1a22'; G.lineWidth = 3; G.beginPath(); G.moveTo(-R + 2, hy - 2); G.quadraticCurveTo(-R - 6, hy - 12, -R - 4, hy - 22); G.stroke(); }
}
/* Procedural fallback look of ITEMS[id].headgear keys (the sheet renderer draws hg_<key> sheets instead). */
const HG_LOOK = {
  poring_hat: { hg: 'poring' }, brood_hat: { hg: 'poring' }, cinder_crown: { hg: 'crown' }, jarl_crown: { hg: 'crown' },
  helm: { hg: 'helm' }, dvergr_helm: { hg: 'helm' }, aesir_helm: { hg: 'helm' }, gaunt_visage: { hg: 'helm' }, squire_plume: { hg: 'helm' },
  shell_helm: { hg: 'helm' }, dvergr_runehelm: { hg: 'helm' }, cap: { hg: 'cap' },
  bandana: { hg: 'band', col: '#b03a2a' }, gleipnir_band: { hg: 'band', col: '#e8e4f4' },
  circlet: { hg: 'circlet' }, rime_circlet: { hg: 'circlet', col: '#cfe6ff', gem: '#9fd8ff' }, cinder_circlet: { hg: 'circlet', col: '#5a4a44', gem: '#ff7a2a' },
  amethyst_diadem: { hg: 'circlet', col: '#d8d0e8', gem: '#b070f0' }, valkyrie_circlet: { hg: 'circlet', col: '#d8dce8', gem: '#ffffff', wings: true },
  sprig_crown: { hg: 'circlet', col: '#6a8a3a', gem: '#8ae05a' },
  straw_hat: { hg: 'brim', col: '#d8b860' }, boatman_hat: { hg: 'brim', col: '#3a3430' }, wanderer_hat: { hg: 'brim', col: '#6a6a70' },
  wolf_hood: { hg: 'ears', col: '#8a867e', hood: true }, wolf_ears: { hg: 'ears', col: '#22222a' }, raven_feather: { hg: 'feather' },
};
function headgearLook(itemId) {
  const t = itemId && typeof ITEMS !== 'undefined' ? ITEMS[itemId] : null; if (!t) return null;
  const L = HG_LOOK[t.headgear]; return L || { hg: 'cap' };
}
function paintWeapon(w, col, atk) {
  col = col || '#c8ccd6';
  if (w === 'sword' || w === 'greatsword') { const L = w === 'greatsword' ? 32 : 22; rr(-1.5, -3, 3, 6, 1, '#6a4428'); G.fillStyle = '#c8a040'; G.fillRect(-5, 3, 10, 2.5); G.fillStyle = col; G.beginPath(); G.moveTo(-2.2, 5.5); G.lineTo(2.2, 5.5); G.lineTo(1.6, 5 + L); G.lineTo(0, 8 + L); G.lineTo(-1.6, 5 + L); G.fill(); G.fillStyle = 'rgba(255,255,255,.55)'; G.fillRect(-0.6, 7, 1.2, L - 3); }
  else if (w === 'dagger') { rr(-1.3, -1, 2.6, 4, 1, '#6a4428'); G.fillStyle = '#c8a040'; G.fillRect(-3.5, 3, 7, 1.8); G.fillStyle = col; G.beginPath(); G.moveTo(-1.8, 4.8); G.lineTo(1.8, 4.8); G.lineTo(0, 16); G.fill(); }
  else if (w === 'rod' || w === 'staffv') { G.strokeStyle = w === 'staffv' ? col : '#7a5230'; G.lineWidth = 2.6; G.beginPath(); G.moveTo(0, -10); G.lineTo(0, 24); G.stroke(); if (w === 'rod') { G.fillStyle = '#c8a0ff'; G.beginPath(); G.arc(0, 25, 3.8, 0, 7); G.fill(); G.fillStyle = '#fff'; G.fillRect(-1, 23.5, 1.5, 1.5); } }
  else if (w === 'bow') { G.strokeStyle = col === '#c8ccd6' ? '#7a4e28' : col; G.lineWidth = 2.6; G.beginPath(); G.arc(-2, 2, 14, -1.3, 1.3); G.stroke(); G.strokeStyle = '#f0e8d8'; G.lineWidth = 1; G.beginPath(); G.moveTo(-2 + Math.cos(-1.3) * 14, 2 + Math.sin(-1.3) * 14); G.lineTo(atk ? -7 : -2, 2); G.lineTo(-2 + Math.cos(1.3) * 14, 2 + Math.sin(1.3) * 14); G.stroke(); }
  else if (w === 'mace') { G.strokeStyle = '#6a4428'; G.lineWidth = 2.8; G.beginPath(); G.moveTo(0, -2); G.lineTo(0, 15); G.stroke(); G.fillStyle = col === '#c8ccd6' ? '#9a9aa4' : col; G.beginPath(); G.arc(0, 18, 4.8, 0, 7); G.fill(); G.fillStyle = '#e0e0e8'; G.fillRect(-1.5, 15, 2, 2); }
  else if (w === 'fork') { G.strokeStyle = col; G.lineWidth = 2.2; G.beginPath(); G.moveTo(0, -12); G.lineTo(0, 22); G.moveTo(-4.5, 22); G.lineTo(-4.5, 29); G.moveTo(0, 22); G.lineTo(0, 30); G.moveTo(4.5, 22); G.lineTo(4.5, 29); G.moveTo(-4.5, 22); G.lineTo(4.5, 22); G.stroke(); }
}

/* ---------- Monsters ---------- */
function paintBlob(o, anim, i, n) {
  const T = n > 1 ? i / n : 0; let sx = 1, sy = 1, hop = 0, lean = 0, x_ = false;
  if (anim === 'idle' || anim === 'cast' || anim === 'sit') { sy = [1, 1.05, 1.09, 1.04][i] || 1; sx = 2 - sy; }
  else if (anim === 'walk') { hop = Math.sin(T * Math.PI) * 12; sy = i === 0 ? 0.8 : i === 5 ? 0.92 : 1.1; sx = 2 - sy; }
  else if (anim === 'attack') { const k = [0, 0.45, 1, 0.5][i]; sx = 1 + k * 0.28; sy = 1 - k * 0.14; lean = k * 7; hop = k * 3; }
  else if (anim === 'hurt') { sy = 0.78; sx = 1.2; x_ = true; }
  else if (anim === 'dead') { sy = 0.34; sx = 1.45; x_ = true; }
  const w = 15 * sx, h = 13 * sy; G.save(); G.translate(lean, -hop);
  const gr = G.createRadialGradient(-w * 0.35, -h * 1.5, 1, 0, -h, w * 1.3); gr.addColorStop(0, shade(o.col, 0.45)); gr.addColorStop(0.6, o.col); gr.addColorStop(1, shade(o.col, -0.3));
  G.fillStyle = gr; G.beginPath(); G.moveTo(-w, -1); G.bezierCurveTo(-w * 1.05, -h * 2.3, w * 1.05, -h * 2.3, w, -1); G.quadraticCurveTo(0, 2.5, -w, -1); G.fill();
  if (o.spots) { G.fillStyle = 'rgba(90,80,86,.45)'; G.beginPath(); G.arc(-w * 0.55, -h * 0.6, 2.2, 0, 7); G.arc(w * 0.5, -h * 0.45, 1.8, 0, 7); G.arc(-w * 0.1, -h * 1.55, 1.6, 0, 7); G.fill(); }
  G.fillStyle = 'rgba(255,255,255,.9)'; G.beginPath(); G.ellipse(-w * 0.42, -h * 1.45, 4.5, 2.6, -0.5, 0, 7); G.fill(); G.fillRect(-w * 0.2, -h * 1.7, 2, 2);
  if (x_) { xEye(w * 0.08, -h * 0.95); xEye(w * 0.5, -h * 0.95); }
  else { G.fillStyle = '#231414'; G.beginPath(); G.ellipse(w * 0.08, -h * 0.98, 1.8, 2.6, 0, 0, 7); G.ellipse(w * 0.5, -h * 0.98, 1.6, 2.4, 0, 0, 7); G.fill(); if (o.eye) { G.fillStyle = o.eye; G.fillRect(w * 0.08 - 0.5, -h * 0.98 - 1, 1.2, 1.2); G.fillRect(w * 0.5 - 0.5, -h * 0.98 - 1, 1.2, 1.2); } }
  G.strokeStyle = '#4a1a1a'; G.lineWidth = 1.3; G.beginPath(); G.arc(w * 0.3, -h * 0.66, 3, 0.15, Math.PI - 0.15); G.stroke(); G.fillStyle = '#e8606a'; G.fillRect(w * 0.3 - 1, -h * 0.66 + 2, 2, 1.5);
  if (o.crown) { G.fillStyle = '#f0c040'; const cy = -h * 2.02; G.beginPath(); G.moveTo(-8, cy + 4); for (let k = 0; k <= 4; k++) G.lineTo(-8 + k * 4, cy - (k % 2 ? 0 : 7)); G.lineTo(8, cy + 4); G.closePath(); G.fill(); G.fillStyle = '#e03050'; G.fillRect(-1, cy - 1, 2.5, 2.5); }
  G.restore();
}
function paintGrub(o, anim, i, n) {
  const T = n > 1 ? i / n : 0, dead = anim === 'dead', k = anim === 'attack' ? [0, 0.5, 1, 0.4][i] : 0;
  for (let s = 4; s >= 0; s--) { const x = -12 + s * 6 + k * 3 * (s / 4), y = dead ? -4 : -6 - Math.abs(Math.sin((anim === 'walk' ? T * 6.28 : i * 0.8) + s * 0.9)) * 3; const r = s === 4 ? 6.5 : 5.2; const gr = G.createRadialGradient(x - 2, y - 2, 0, x, y, r); gr.addColorStop(0, shade(o.col, 0.35)); gr.addColorStop(1, shade(o.col, -0.3)); G.fillStyle = gr; G.beginPath(); G.arc(x, y, r, 0, 7); G.fill(); if (s < 4) { G.fillStyle = shade(o.col, -0.4); G.fillRect(x - 1, y + r - 2, 2, 3); } }
  const hx = 12 + k * 3; if (dead || anim === 'hurt') xEye(hx + 2, -8); else { G.fillStyle = '#1a140c'; G.beginPath(); G.arc(hx + 2, -8, 1.8, 0, 7); G.fill(); G.fillStyle = '#fff'; G.fillRect(hx + 1.5, -9, 1, 1); }
  G.strokeStyle = shade(o.col, -0.4); G.lineWidth = 1.2; G.beginPath(); G.moveTo(hx, -13); G.lineTo(hx + 2, -19); G.moveTo(hx + 3, -13); G.lineTo(hx + 6, -18); G.stroke();
}
function paintHare(o, anim, i, n) {
  const T = n > 1 ? i / n : 0, hop = anim === 'walk' ? Math.sin(T * Math.PI) * 9 : anim === 'attack' ? [0, 4, 8, 3][i] : 0, dead = anim === 'dead';
  G.save(); if (dead) { G.translate(0, -4); G.rotate(-1.4); } G.translate(anim === 'attack' ? [0, 2, 6, 2][i] : 0, -hop);
  G.fillStyle = shade(o.col, -0.1); G.beginPath(); G.ellipse(-2, -9, 11, 8.5, 0, 0, 7); G.fill();
  G.fillStyle = o.col; G.beginPath(); G.ellipse(7, -16, 7.5, 6.5, 0, 0, 7); G.fill();
  G.beginPath(); G.ellipse(4, -28, 2.6, 8.5, -0.25, 0, 7); G.ellipse(10, -27, 2.6, 8.5, 0.2, 0, 7); G.fill();
  G.fillStyle = '#f0a8b0'; G.beginPath(); G.ellipse(4, -28, 1.1, 6, -0.25, 0, 7); G.ellipse(10, -27, 1.1, 6, 0.2, 0, 7); G.fill();
  G.fillStyle = '#fff'; G.beginPath(); G.arc(-13, -10, 3.5, 0, 7); G.fill();
  if (dead || anim === 'hurt') xEye(10, -16); else { G.fillStyle = '#e02030'; G.beginPath(); G.ellipse(10, -16.5, 1.8, 2.4, 0, 0, 7); G.fill(); G.fillStyle = '#fff'; G.fillRect(9.5, -18, 1, 1); }
  G.fillStyle = '#f08090'; G.fillRect(13.5, -14, 1.5, 1.5);
  G.restore();
}
function paintWolf(o, anim, i, n) {
  const T = n > 1 ? i / n : 0, lg = anim === 'walk' ? Math.sin(T * 6.28) : 0, atk = anim === 'attack' ? [0, 0.4, 1, 0.5][i] : 0, dead = anim === 'dead';
  const body = o.col, dark = shade(o.col, -0.3), light = shade(o.col, 0.3);
  G.save(); if (dead) { G.translate(0, -2); G.scale(1, 0.75); } if (anim === 'hurt') G.rotate(-0.1);
  G.lineCap = 'round'; G.strokeStyle = dark; G.lineWidth = 4;
  if (!dead) { G.beginPath(); G.moveTo(-10, -11); G.lineTo(-10 - lg * 5, 0); G.moveTo(-5, -11); G.lineTo(-5 + lg * 5, 0); G.moveTo(8, -11); G.lineTo(8 + lg * 5 + atk * 4, 0); G.moveTo(12, -11); G.lineTo(12 - lg * 5 + atk * 5, 0); G.stroke(); }
  G.strokeStyle = body; G.lineWidth = 5; G.beginPath(); G.moveTo(-15, -16); G.quadraticCurveTo(-25, -18, -27, -27 + i * 1.5); G.stroke();
  const gr = G.createLinearGradient(0, -26, 0, -6); gr.addColorStop(0, light); gr.addColorStop(1, dark); G.fillStyle = gr; G.beginPath(); G.ellipse(atk * 3, -16, 17, 8.5, 0, 0, 7); G.fill();
  G.fillStyle = light; G.beginPath(); G.moveTo(-6, -22); G.lineTo(-2, -29); G.lineTo(2, -23); G.lineTo(6, -30); G.lineTo(10, -22); G.fill();
  const hx = 16 + atk * 8, hy = -22 + atk * 2;
  G.fillStyle = body; G.beginPath(); G.ellipse(hx, hy, 7.5, 6.5, 0, 0, 7); G.fill();
  G.beginPath(); G.moveTo(hx + 3, hy - 2); G.lineTo(hx + 15, hy + 1 + atk * 2); G.lineTo(hx + 3, hy + 5); G.fill();
  G.fillStyle = dark; G.beginPath(); G.moveTo(hx - 5, hy - 3); G.lineTo(hx - 3, hy - 13); G.lineTo(hx + 1, hy - 5); G.fill();
  G.fillStyle = '#1a1010'; G.fillRect(hx + 13, hy, 2.5, 2);
  if (atk > 0.5) { G.fillStyle = '#fff'; G.fillRect(hx + 7, hy + 3, 1.5, 3); G.fillRect(hx + 10, hy + 3, 1.5, 3); }
  if (dead || anim === 'hurt') xEye(hx + 3, hy - 1.5); else gEye(hx + 3, hy - 1.5, 1.5, o.eye || '#ffb84a');
  G.restore();
}
function paintGhost(o, anim, i, n) {
  const f = anim === 'idle' || anim === 'walk' ? Math.sin((n > 1 ? i / n : 0) * 6.28) * 3 : 0, dead = anim === 'dead', atk = anim === 'attack' ? [0, 0.5, 1, 0.4][i] : 0;
  G.save(); G.translate(atk * 4, -10 + f + (dead ? 8 : 0)); if (dead) G.scale(1.2, 0.6);
  const gr = G.createLinearGradient(0, -42, 0, 4); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, o.col); G.fillStyle = gr;
  G.beginPath(); G.moveTo(-13, -22); G.bezierCurveTo(-13, -46, 13, -46, 13, -22); for (let k = 0; k <= 6; k++) G.lineTo(13 - k * 4.3, 3 + (k % 2 ? -3 : 3)); G.closePath(); G.fill();
  G.fillStyle = '#1a1a2e'; G.beginPath(); G.ellipse(0, -30, 3, 4.5, 0, 0, 7); G.ellipse(7, -30, 3, 4.5, 0, 0, 7); G.fill(); G.beginPath(); G.ellipse(3.5, -20, 3, 3 + atk * 3, 0, 0, 7); G.fill();
  G.fillStyle = shade(o.col, -0.1); G.beginPath(); G.ellipse(14 + atk * 6, -20, 4, 2.5, 0.3, 0, 7); G.ellipse(-14, -18, 4, 2.5, -0.3, 0, 7); G.fill();
  G.restore();
}
function paintTreeMob(o, anim, i, n) {
  const sway = anim === 'attack' ? [0, 0.3, 0.7, 0.2][i] : Math.sin((n > 1 ? i / n : 0) * 6.28) * 0.08, dead = anim === 'dead';
  G.save(); if (dead) { G.translate(0, -3); G.rotate(-1.35); }
  G.fillStyle = o.col; G.beginPath(); G.moveTo(-10, 0); G.lineTo(-7, -38); G.lineTo(7, -40); G.lineTo(10, 0); G.quadraticCurveTo(0, 4, -10, 0); G.fill();
  G.fillStyle = shade(o.col, -0.25); G.fillRect(2, -36, 6, 36);
  G.strokeStyle = o.col; G.lineWidth = 4.5; G.lineCap = 'round';
  for (const sg of [-1, 1]) { G.save(); G.translate(sg * 5, -34); G.rotate(sg * (0.6 + sway)); G.beginPath(); G.moveTo(0, 0); G.lineTo(0, -17); G.lineTo(sg * -5, -25); G.moveTo(0, -12); G.lineTo(sg * 5, -20); G.stroke(); G.restore(); }
  for (const [x, y, r] of [[-12, -56, 9], [11, -58, 10], [0, -50, 8], [-2, -62, 8]]) { G.fillStyle = '#3f7a2e'; G.beginPath(); G.arc(x, y, r, 0, 7); G.fill(); G.fillStyle = '#6aac44'; G.beginPath(); G.arc(x - 2, y - 2, r * 0.55, 0, 7); G.fill(); }
  G.fillStyle = '#1a0e08'; G.beginPath(); G.ellipse(-2, -26, 2.5, 3.5, 0, 0, 7); G.ellipse(5, -26, 2.5, 3.5, 0, 0, 7); G.ellipse(1.5, -16, 3.5, 4 + sway * 4, 0, 0, 7); G.fill();
  if (!dead) { gEye(-2, -26, 1, '#e0ff70'); gEye(5, -26, 1, '#e0ff70'); }
  G.restore();
}
function paintShroom(o, anim, i, n) {
  const T = n > 1 ? i / n : 0, b = anim === 'walk' ? Math.sin(T * Math.PI) * 5 : anim === 'attack' ? [0, 3, 6, 2][i] : 0, dead = anim === 'dead';
  G.save(); G.translate(0, -b); if (dead) G.scale(1.3, 0.55);
  rr(-6, -14, 12, 14, 3, '#f0e6d4'); G.fillStyle = '#d8cab4'; G.fillRect(2, -13, 4, 12);
  const gr = G.createRadialGradient(-4, -24, 1, 0, -16, 18); gr.addColorStop(0, shade(o.col, 0.35)); gr.addColorStop(1, shade(o.col, -0.3)); G.fillStyle = gr; G.beginPath(); G.ellipse(0, -15, 16, 13, 0, Math.PI, 0); G.closePath(); G.fill();
  G.fillStyle = '#fff4e8'; G.beginPath(); G.arc(-7, -21, 2.6, 0, 7); G.arc(3, -24, 2.2, 0, 7); G.arc(9, -18, 1.8, 0, 7); G.fill();
  if (dead || anim === 'hurt') { xEye(-1, -8); xEye(4, -8); } else { G.fillStyle = '#2a1414'; G.fillRect(-2, -10, 2, 3); G.fillRect(3, -10, 2, 3); }
  G.restore();
}
const PAINTERS = { human: paintHuman, blob: paintBlob, grub: paintGrub, hare: paintHare, wolf: paintWolf, ghost: paintGhost, tree: paintTreeMob, shroom: paintShroom };

/* ---------- Frame building ---------- */
function pixelize(c, oc) {
  const g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height), a = d.data, Wc = c.width, Hc = c.height, solid = new Uint8Array(Wc * Hc);
  for (let i = 0; i < Wc * Hc; i++) { solid[i] = a[i * 4 + 3] > 100 ? 1 : 0; a[i * 4 + 3] = solid[i] ? 255 : 0; }
  for (let y = 0; y < Hc; y++) for (let x = 0; x < Wc; x++) {
    const i = y * Wc + x; if (solid[i]) continue;
    if ((x > 0 && solid[i - 1]) || (x < Wc - 1 && solid[i + 1]) || (y > 0 && solid[i - Wc]) || (y < Hc - 1 && solid[i + Wc])) { a[i * 4] = oc[0]; a[i * 4 + 1] = oc[1]; a[i * 4 + 2] = oc[2]; a[i * 4 + 3] = 255; }
  }
  g.putImageData(d, 0, 0);
}
const FRAMES = {};
function buildFrames(key, spr, look, s, hPx) {
  if (FRAMES[key]) return FRAMES[key];
  const human = spr === 'human', paint = PAINTERS[spr];
  const cw = Math.ceil((human ? 104 : 84) * s), ch = Math.ceil((human ? 96 : 80) * s), fx = cw / 2, fy = ch - 6 * s;
  const oc = hex2rgb(look.outline || '#24181a');
  const F = { wu: cw / PXU, hu: ch / PXU, feetU: 6 * s / PXU, headU: hPx / PXU, shadowR: (human ? 0.45 : 0.5) * Math.max(1, s * (human ? 0.8 : 0.85)) };
  // willReadFrequently: a CPU-backed canvas, so pixelize()'s getImageData is a memcpy (not a GPU readback) and the upload is cheap
  const make = (anim, i, n, back) => { const c = mkCanvas(cw, ch); G = c.getContext('2d', { willReadFrequently: true }); G.translate(fx, fy); G.scale(s, s); G.lineJoin = 'round'; paint(look, anim, i, n, back); pixelize(c, oc); return canvasTex(c, { pixel: true }); };
  for (const a in ANIMS) { F[a] = []; for (let i = 0; i < ANIMS[a]; i++) F[a].push({ f: make(a, i, ANIMS[a], false), b: human ? make(a, i, ANIMS[a], true) : null }); }
  return (FRAMES[key] = F);
}
// Named variants (m.variant) keep m.type = base but have their own look/size: cache their frames separately.
function framesForMob(m) { const d = m.d; const human = d.spr === 'human'; const s = human ? (d.look.scale || 1) : (d.size || 1); return buildFrames('mob:' + (m.variant || m.type), d.spr, human ? d.look : { col: d.col, eye: d.eye, crown: d.crown, spots: d.spots }, s, d.h); }
function framesForNPC(n) { return buildFrames('npc:' + n.id, 'human', n.look, n.look.scale || 1, 58 * (n.look.scale || 1)); }
function framesForPlayer() { const lk = playerLook(); const key = 'pl:' + JSON.stringify(lk); return buildFrames(key, 'human', lk, 1, 58); }
function playerLook() {
  const C = CLASSES[P.cls].look, head = P.equip.head ? P.equip.head.id : null, hg = headgearLook(head);
  return Object.assign({ skin: '#f7d8bf', hair: P.hair, head: 'human', weapon: S.wtype === 'fist' ? 'none' : S.wtype, wcol: S.wtype === 'bow' ? '#7a4e28' : '#c8ccd6', shield: !!P.equip.shield,
    headgear: hg ? hg.hg : null, hgCol: hg && hg.col, hgGem: hg && hg.gem, hgWings: !!(hg && hg.wings), hgHood: !!(hg && hg.hood) }, C, { hat: head ? null : C.hat });
}
