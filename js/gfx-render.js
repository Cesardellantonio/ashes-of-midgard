'use strict';
/* =========================================================
   Per-frame rendering: sprite sync, ground decals, 2D overlay
   (names, bars, RO-style bouncing damage numbers, particles).
   ========================================================= */
const UNITPLANE = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
const FLATPLANE = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
const SHADOWMAT = new THREE.MeshBasicMaterial({ map: TEX.shadow, transparent: true, depthWrite: false, opacity: 0.75 });
const VIS = new Map(), DV = new Map();
let frameNo = 0;
function clearVis() { for (const v of VIS.values()) disposeVis(v); VIS.clear(); for (const v of DV.values()) for (const m of v.meshes) scene.remove(m); DV.clear(); }
function disposeVis(v) { if (v.dispose) return v.dispose(); for (const m of v.meshes) { scene.remove(m); if (m.material !== SHADOWMAT) m.material.dispose(); } }
function spriteMat(tex, o = {}) { return new THREE.MeshBasicMaterial(Object.assign({ map: tex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }, o)); }
function makeSpriteVis(e, F) {
  const mat = spriteMat(F.idle[0].f); const mesh = new THREE.Mesh(UNITPLANE, mat); scene.add(mesh);
  const shadow = new THREE.Mesh(FLATPLANE, SHADOWMAT); shadow.renderOrder = -1; scene.add(shadow);
  const v = { F, mat, mesh, shadow, meshes: [mesh, shadow], flip: e.fx < 0 ? -1 : 1 };
  if (e === P) { const xm = spriteMat(F.idle[0].f, { color: 0x4a70d0, opacity: 0.5, depthWrite: false, depthFunc: THREE.GreaterDepth }); v.xray = new THREE.Mesh(UNITPLANE, xm); v.xray.renderOrder = 5; scene.add(v.xray); v.meshes.push(v.xray); }
  const glow = e.d && e.d.glow; if (glow) { v.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, color: new THREE.Color(glow), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 })); scene.add(v.glow); v.meshes.push(v.glow); }
  return v;
}
function syncSprite(e, F, pose) {
  let v = VIS.get(e); if (!v || v.F !== F) { if (v) disposeVis(v); v = makeSpriteVis(e, F); VIS.set(e, v); }
  v.seen = frameNo;
  const rx = Math.cos(cam.yaw), ry = -Math.sin(cam.yaw), fwx = -Math.sin(cam.yaw), fwy = -Math.cos(cam.yaw);
  const fx = e.fx === undefined ? (e.dir || 1) : e.fx, fy = e.fy || 0;
  const dr = fx * rx + fy * ry; if (Math.abs(dr) > 0.15) v.flip = dr < 0 ? -1 : 1;
  const set = F[pose.anim] || F.idle, fr = set[Math.min(set.length - 1, pose.i | 0)];
  const back = fr.b && (fx * fwx + fy * fwy) > 0.4, tex = back ? fr.b : fr.f;
  if (v.mat.map !== tex) v.mat.map = tex;
  const gh = groundH(e.x, e.y), z = (e.z || 0) / PXU;
  v.mesh.scale.set(F.wu * v.flip, F.hu / COSP, 1); v.mesh.position.set(e.x, gh + z - F.feetU / COSP, e.y); v.mesh.rotation.y = cam.yaw;
  v.mat.opacity = pose.opacity === undefined ? 1 : pose.opacity;
  const tn = pose.tint || map.d.look.tint; v.mat.color.setRGB(tn[0], tn[1], tn[2]);
  v.shadow.position.set(e.x, gh + 0.03, e.y); v.shadow.scale.setScalar(F.shadowR * (1 - Math.min(0.5, z * 0.3))); v.shadow.visible = pose.opacity === undefined || pose.opacity > 0.3;
  if (v.xray) { v.xray.material.map = tex; v.xray.scale.copy(v.mesh.scale); v.xray.position.copy(v.mesh.position); v.xray.rotation.y = cam.yaw; v.xray.visible = !P.dead; }
  if (v.glow) { v.glow.position.set(e.x, gh + z + F.headU / COSP * 0.5, e.y); const s = F.headU * 2.2; v.glow.scale.set(s, s, 1); v.glow.visible = !e.dead; }
}
function mobPose(m) {
  if (m.dead) return { anim: 'dead', i: 0, opacity: clamp(1 - (m.deathT - 0.35) / 0.45, 0, 1) };
  if (m.frozen > 0) return { anim: 'hurt', i: 0, tint: [0.55, 0.8, 1] };
  if (m.hitFlash > 0) return { anim: 'hurt', i: 0, tint: [1, 0.72, 0.72] };
  if (m.atkAnim >= 0) return { anim: 'attack', i: Math.min(3, Math.floor(m.atkAnim * 4)) };
  if (m.moving || m.leap) return { anim: 'walk', i: Math.floor(m.walk * 1.26) % 6 };
  return { anim: 'idle', i: Math.floor(time * 3 + (m.id % 7)) % 4 };
}
function playerPose() {
  if (P.dead) return { anim: 'dead', i: 0 };
  if (P.dodgeT > 0) return { anim: 'dodge', i: Math.min(3, Math.floor((1 - P.dodgeT / 0.34) * 4)), tint: [0.85, 0.9, 1] };
  if (P.charge >= 0) { const full = P.charge >= 0.8 && Math.floor(time * 12) % 2; return { anim: 'attack', i: 0, tint: full ? [1.0, 0.85, 0.5] : undefined }; }
  if (P.blocking) return { anim: 'block', i: 0 };
  if (P.sitting) return { anim: 'sit', i: 0 };
  if (P.casting) return { anim: 'cast', i: Math.floor(time * 4) % 2 };
  if (P.atkAnim >= 0) return { anim: 'attack', i: Math.min(3, Math.floor(P.atkAnim * 4)) };
  if (P.hurtT > 0.12) return { anim: 'hurt', i: 0 };
  if (P.moving) return { anim: 'walk', i: Math.floor(P.walk * 1.26) % 6 };
  return { anim: 'idle', i: Math.floor(time * 2.5) % 4 };
}
const DROPTEX = {};
function dropTex(d) {
  if (d.zeny) { const k = d.lost ? 'lost' : 'zeny'; if (DROPTEX[k]) return DROPTEX[k]; const c = mkCanvas(32, 32), g = c.getContext('2d'); if (d.lost) { g.fillStyle = '#8a1018'; g.beginPath(); g.ellipse(16, 24, 13, 6, 0, 0, 7); g.fill(); g.fillStyle = '#e8c050'; g.beginPath(); g.ellipse(16, 20, 5, 3, 0, 0, 7); g.fill(); } else { for (let i = 0; i < 4; i++) { g.fillStyle = '#b08420'; g.beginPath(); g.ellipse(9 + i * 5, 25 - i * 3, 6, 3.5, 0, 0, 7); g.fill(); g.fillStyle = '#f4d060'; g.beginPath(); g.ellipse(9 + i * 5, 24 - i * 3, 6, 3.2, 0, 0, 7); g.fill(); } } pixelize(c, [40, 26, 10]); return (DROPTEX[k] = canvasTex(c, { pixel: true })); }
  const t = ITEMS[d.item.id], k = t.icon + '|' + (t.color || ''); if (DROPTEX[k]) return DROPTEX[k];
  const src = iconCanvas(t), c = mkCanvas(32, 32), g = c.getContext('2d'); g.drawImage(src, 2, 2, 28, 28); pixelize(c, [30, 20, 16]);
  return (DROPTEX[k] = canvasTex(c, { pixel: true }));
}
const RCOL = { common: 0xffffff, magic: 0x7fa0ff, rare: 0xffd84a, unique: 0xff9a30, card: 0xd0a8ff, key: 0xffa870 };
function syncDrop(d) {
  let v = VIS.get(d);
  if (!v) {
    const mat = spriteMat(dropTex(d)); const mesh = new THREE.Mesh(UNITPLANE, mat); scene.add(mesh); v = { mat, mesh, meshes: [mesh], F: null };
    const r = d.lost ? 'lostz' : d.zeny ? null : rarityOf(d.item);
    if (r && r !== 'common') { const gm = new THREE.MeshBasicMaterial({ map: TEX.soft, color: r === 'lostz' ? 0xff2020 : RCOL[r], transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }); const gl = new THREE.Mesh(FLATPLANE, gm); gl.renderOrder = -1; scene.add(gl); v.glowM = gl; v.meshes.push(gl); }
    VIS.set(d, v);
  }
  v.seen = frameNo;
  const gh = groundH(d.x, d.y), bounce = Math.max(0, 1 - d.t * 2.5) * Math.abs(Math.sin(d.t * 9)) * 0.6, s = d.lost ? 0.9 : 0.62;
  v.mesh.scale.set(s, s / COSP, 1); v.mesh.position.set(d.x, gh + bounce, d.y); v.mesh.rotation.y = cam.yaw;
  if (v.glowM) { v.glowM.position.set(d.x, gh + 0.04, d.y); v.glowM.scale.setScalar(0.6 + Math.sin(time * 4) * 0.08); }
}
function syncEntities() {
  frameNo++;
  for (const m of mobs) syncSprite(m, framesForMob(m), mobPose(m));
  for (const n of map.npcs) { if (n.fx === undefined) { n.fx = n.dir; n.fy = 0.4; } syncSprite(n, framesForNPC(n), { anim: 'idle', i: Math.floor(time * 2 + n.x) % 4 }); }
  for (const d of drops) syncDrop(d);
  if (started && !(typeof syncSheetPlayer === 'function' && syncSheetPlayer())) syncSprite(P, framesForPlayer(), playerPose());
  for (const [e, v] of VIS) if (v.seen !== frameNo) { disposeVis(v); VIS.delete(e); }
  const king = mobs.find(m => m.type === 'ashen_king' && !m.dead); if (king && Math.random() < 0.6) parts.push({ x: king.x + rand(-0.6, 0.6), y: king.y + rand(-0.6, 0.6), z: rand(10, 120), vx: 0, vy: 0, vz: rand(40, 90), life: rand(0.4, 0.9), max: 0.9, col: pick(['#ff7a2a', '#ffb04a', '#ff4a1a']), size: 2.5, float: true });
}
/* ---------- Ground decals ---------- */
function decalMesh(tex, col, op, add) { const m = new THREE.Mesh(FLATPLANE, new THREE.MeshBasicMaterial({ map: tex, color: col, transparent: true, opacity: op, depthWrite: false, depthTest: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending })); m.renderOrder = -1; scene.add(m); return m; }
function syncDecal(key, build, place) { let v = DV.get(key); if (!v) { v = { meshes: build() }; DV.set(key, v); } v.seen = frameNo; place(v.meshes); }
function syncDecals() {
  for (const t of teles) syncDecal(t, () => [decalMesh(TEX.disc, 0xff2a10, 0.28, false), decalMesh(TEX.soft, 0xff6a20, 0.5, true), decalMesh(TEX.ring, 0xff5020, 0.95, true)], ([a, b, c]) => {
    const gh = groundH(t.x, t.y) + 0.05, k = t.t / t.dur; for (const m of [a, b, c]) m.position.set(t.x, gh, t.y); a.scale.setScalar(t.r); c.scale.setScalar(t.r); b.scale.setScalar(Math.max(0.01, t.r * k)); c.material.opacity = 0.5 + 0.5 * Math.abs(Math.sin(time * 10));
  });
  for (const f of fxs) {
    if (f.k === 'ring') syncDecal(f, () => [decalMesh(TEX.ring, new THREE.Color(f.col), 1, true)], ([a]) => { const k = f.t / f.dur; a.position.set(f.x, groundH(f.x, f.y) + 0.06, f.y); a.scale.setScalar(Math.max(0.01, f.r * (0.3 + 0.7 * k))); a.material.opacity = 1 - k; });
    else if (f.k === 'mark') syncDecal(f, () => [decalMesh(TEX.target, 0xffe070, 1, true)], ([a]) => { const k = f.t / f.dur; a.position.set(f.x, groundH(f.x, f.y) + 0.06, f.y); a.scale.setScalar(0.5 - k * 0.2); a.material.opacity = 1 - k; a.rotation.y = k * 2; });
  }
  if (P && P.casting) { const col = new THREE.Color(ELCOL[SKILLS[P.casting.id].el] || '#ffffff'); syncDecal('cast', () => [decalMesh(TEX.magic, col, 0.95, true)], ([a]) => { a.material.color.copy(col); a.position.set(P.x, groundH(P.x, P.y) + 0.07, P.y); a.rotation.y = time * 1.4; a.scale.setScalar(1.3 + Math.sin(time * 6) * 0.05); }); }
  const lk = typeof CTRL !== 'undefined' && CTRL.lock && !CTRL.lock.dead ? CTRL.lock : null;
  const tg = lk || (P && P.target && !P.target.dead ? P.target : (hover && hover.kind === 'mob' ? hover : null));
  if (tg && started) syncDecal('target', () => [decalMesh(TEX.target, 0xff5a3a, 0.9, true)], ([a]) => { a.material.color.setHex(tg === lk ? 0xff3a9a : tg === P.target ? 0xff5a3a : 0xffd070); a.position.set(tg.x, groundH(tg.x, tg.y) + 0.06, tg.y); a.rotation.y = time * 0.8; a.scale.setScalar(0.55 * Math.max(1, (tg.d.size || (tg.d.look && tg.d.look.scale) || 1) * 0.8)); });
  for (const [k, v] of DV) if (v.seen !== frameNo) { for (const m of v.meshes) { scene.remove(m); m.material.dispose(); } DV.delete(k); }
}
/* ---------- Picking ---------- */
function pickAt(sx, sy) {
  let best = null, bd = 1e9;
  const test = (e, hw, rw) => { const gh = groundH(e.x, e.y) + (e.z || 0) / PXU; const p = proj(e.x, e.y, gh + hw * 0.5); if (p[2] > 1) return; const d = Math.hypot(sx - p[0], sy - p[1]), r = Math.max(16, rw * PPU); if (d < r && d < bd) { bd = d; best = e; } };
  for (const m of mobs) if (!m.dead) { const hw = headH(m); test(m, hw, Math.max(0.45, hw * 0.4)); }
  for (const n of map.npcs) test(n, headH(n), 0.55);
  for (const o of map.objs) if (o.kind !== 'anvil') test(o, o.kind === 'heart' ? 2.5 : 2.6, 0.8);
  for (const d of drops) test(d, 0.4, 0.35);
  return best;
}
/* ---------- Overlay ---------- */
function label(txt, x, y, col, size, box) {
  ctx.font = `700 ${size}px 'Nanum Gothic', Tahoma, sans-serif`; ctx.textAlign = 'center';
  if (box) { const w = ctx.measureText(txt).width + 10; ctx.fillStyle = 'rgba(10,12,20,.72)'; ctx.fillRect(x - w / 2, y - size, w, size + 5); }
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.9)'; ctx.lineJoin = 'round'; ctx.strokeText(txt, x, y); ctx.fillStyle = col; ctx.fillText(txt, x, y);
}
function star(x, y, r1, r2, n, col) { ctx.fillStyle = col; ctx.beginPath(); for (let i = 0; i < n * 2; i++) { const a = i * Math.PI / n - Math.PI / 2, r = i % 2 ? r2 : r1; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.closePath(); ctx.fill(); }
function drawOverlay() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, W, H);
  const sc = clamp(PPU / 34, 0.75, 1.5);
  // Particles and spell effects (additive)
  ctx.globalCompositeOperation = 'lighter';
  for (const p of parts) { const q = proj(p.x, p.y, groundH(p.x, p.y) + p.z / PXU); if (q[2] > 1) continue; ctx.globalAlpha = Math.min(1, p.life / p.max * 1.4); ctx.fillStyle = p.col; const s = p.size * sc * 1.1; ctx.fillRect(q[0] - s / 2, q[1] - s / 2, s, s); }
  ctx.globalAlpha = 1;
  for (const p of projs) {
    const a = proj(p.x, p.y, p.zu), b = proj(p.x - p.vx * 0.6, p.y - p.vy * 0.6, p.zu - p.vz * 0.6); if (a[2] > 1) continue;
    if (p.kind === 'arrow') { ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 2.5 * sc; ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(a[0], a[1]); ctx.stroke(); ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 1.2 * sc; ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(b[0] + (a[0] - b[0]) * 0.25, b[1] + (a[1] - b[1]) * 0.25); ctx.stroke(); ctx.globalCompositeOperation = 'lighter'; continue; }
    const col = PCOL[p.kind] || '#fff', r = 13 * sc;
    const tg = ctx.createLinearGradient(b[0], b[1], a[0], a[1]); tg.addColorStop(0, rgba(col, 0)); tg.addColorStop(1, rgba(col, 0.8)); ctx.strokeStyle = tg; ctx.lineWidth = r * 0.9; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(a[0], a[1]); ctx.stroke();
    const g = ctx.createRadialGradient(a[0], a[1], 0, a[0], a[1], r); g.addColorStop(0, '#fff'); g.addColorStop(0.35, col); g.addColorStop(1, rgba(col, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(a[0], a[1], r, 0, 7); ctx.fill();
    if (Math.random() < 0.6) parts.push({ x: p.x, y: p.y, z: (p.zu - groundH(p.x, p.y)) * PXU, vx: rand(-0.3, 0.3), vy: rand(-0.3, 0.3), vz: rand(-10, 30), life: 0.35, max: 0.35, col, size: 2.5 });
  }
  for (const f of fxs) {
    const k = f.t / f.dur;
    if (f.k === 'pillar') { const e = f.e, gh = groundH(e.x, e.y), b = proj(e.x, e.y, gh), t = proj(e.x, e.y, gh + 6); const a = Math.sin(k * Math.PI), wd = (f.big ? 1.2 : 0.8) * PPU; const g = ctx.createLinearGradient(0, t[1], 0, b[1]); g.addColorStop(0, rgba(f.col, 0)); g.addColorStop(1, rgba(f.col, 0.6 * a)); ctx.fillStyle = g; ctx.fillRect(b[0] - wd / 2, t[1], wd, b[1] - t[1]); for (let i = 0; i < 8; i++) { ctx.fillStyle = rgba(f.col, a); const yy = b[1] - ((k * 1.4 + i / 8) % 1) * (b[1] - t[1]); ctx.fillRect(b[0] + Math.sin(i * 2.3 + time * 4) * wd * 0.55, yy, 2.5 * sc, 7 * sc); } }
    else if (f.k === 'strike') { const gh = groundH(f.x, f.y), b = proj(f.x, f.y, gh), t = proj(f.x, f.y, gh + 9); const r = mulberry32(f.seed | 0); ctx.strokeStyle = `rgba(255,252,210,${1 - k})`; ctx.lineWidth = 3.5 * sc; ctx.shadowColor = '#bfe0ff'; ctx.shadowBlur = 14; ctx.beginPath(); ctx.moveTo(t[0], t[1]); const n = 7; for (let i = 1; i <= n; i++) ctx.lineTo(t[0] + (b[0] - t[0]) * i / n + (i < n ? (r() - 0.5) * 26 * sc : 0), t[1] + (b[1] - t[1]) * i / n); ctx.stroke(); ctx.shadowBlur = 0; }
    else if (f.k === 'rain') { const gh = groundH(f.x, f.y); ctx.strokeStyle = `rgba(240,230,200,${1 - k})`; ctx.lineWidth = 1.6 * sc; for (let i = 0; i < 18; i++) { const ox = Math.sin(i * 12.9) * 1.8, oy = Math.cos(i * 7.3) * 1.8, z = (1 - k) * 5 + (i % 5) * 0.3; const a = proj(f.x + ox, f.y + oy, gh + z), b = proj(f.x + ox, f.y + oy, gh + z + 0.8); ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(a[0], a[1]); ctx.stroke(); } }
    else if (f.k === 'meteor') { const a = proj(f.x, f.y, groundH(f.x, f.y)), r = 2 * PPU; const g = ctx.createRadialGradient(a[0], a[1], 0, a[0], a[1], r); g.addColorStop(0, rgba('#fff0c0', 1 - k)); g.addColorStop(0.4, rgba(f.col, 0.7 * (1 - k))); g.addColorStop(1, rgba(f.col, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(a[0], a[1], r, r * 0.6, 0, 0, 7); ctx.fill(); }
    else if (f.k === 'spark') { const a = proj(f.x, f.y, f.h); const r = (f.crit ? 26 : 18) * sc * (0.5 + k); ctx.strokeStyle = f.hurt ? `rgba(255,120,100,${1 - k})` : `rgba(255,250,210,${1 - k})`; ctx.lineWidth = 2.2 * sc; ctx.beginPath(); for (let i = 0; i < 8; i++) { const an = i * Math.PI / 4 + 0.3; ctx.moveTo(a[0] + Math.cos(an) * r * 0.3, a[1] + Math.sin(an) * r * 0.3); ctx.lineTo(a[0] + Math.cos(an) * r, a[1] + Math.sin(an) * r); } ctx.stroke(); }
  }
  ctx.globalCompositeOperation = 'source-over'; ctx.lineCap = 'butt';
  // Names
  for (const n of map.npcs) { const a = proj(n.x, n.y, groundH(n.x, n.y)); if (a[2] < 1) label(n.name, a[0], a[1] + 16 * sc, '#bfe0ff', 11.5); }
  for (const o of map.objs) if ((o.kind === 'way' || o.kind === 'heart') && hover === o) { const a = proj(o.x, o.y, groundH(o.x, o.y)); label(o.name, a[0], a[1] + 18 * sc, '#ffd8a8', 11.5); }
  for (const d of drops) {
    if (!(mouse.alt || hover === d || d.lost || (d.item && ['unique', 'card', 'key', 'rare'].includes(rarityOf(d.item))))) continue;
    const a = proj(d.x, d.y, groundH(d.x, d.y) + 0.9); if (a[2] > 1) continue;
    const txt = d.lost ? `Your lost zeny (${fmt(d.zeny)})` : d.zeny ? `${fmt(d.zeny)} zeny` : itemName(d.item) + (d.item.qty > 1 ? ` ×${d.item.qty}` : '');
    const col = d.lost ? '#ff9a9a' : d.zeny ? '#ffe070' : { common: '#ffffff', magic: '#9ab8ff', rare: '#ffe070', unique: '#ffb050', card: '#e0c4ff', key: '#ffc090' }[rarityOf(d.item)];
    label(txt, a[0], a[1], col, 11, true);
  }
  for (const m of mobs) {
    if (m.dead) continue; const gh = groundH(m.x, m.y); const a = proj(m.x, m.y, gh); if (a[2] > 1) continue;
    if (m.hp < m.maxhp && !m.d.boss) { const wd = 40 * sc, y = a[1] + 8 * sc; ctx.fillStyle = 'rgba(10,10,20,.8)'; ctx.fillRect(a[0] - wd / 2 - 1, y, wd + 2, 5); ctx.fillStyle = '#e03a3a'; ctx.fillRect(a[0] - wd / 2, y + 1, wd * m.hp / m.maxhp, 3); }
    if (hover === m || P.target === m) label(`${m.d.name} (Lv ${m.d.lvl})`, a[0], a[1] + 24 * sc, m.d.aggro ? '#ffc0b0' : '#ffffff', 12);
  }
  if (P && started && !P.dead) {
    const gh = groundH(P.x, P.y), a = proj(P.x, P.y, gh), wd = 44 * sc, y = a[1] + 8 * sc;
    ctx.fillStyle = 'rgba(10,10,20,.85)'; ctx.fillRect(a[0] - wd / 2 - 1, y, wd + 2, P.stamina < 100 ? 12 : 9);
    if (P.stamina < 100) { ctx.fillStyle = P.stamina < 22 ? '#ff8a3a' : '#f0d040'; ctx.fillRect(a[0] - wd / 2, y + 9, wd * P.stamina / 100, 2); }
    ctx.fillStyle = P.hp / S.maxhp < 0.25 ? '#ff3a3a' : '#3ee83a'; ctx.fillRect(a[0] - wd / 2, y + 1, wd * P.hp / S.maxhp, 3.5);
    ctx.fillStyle = '#3a8aff'; ctx.fillRect(a[0] - wd / 2, y + 5, wd * P.sp / S.maxsp, 3);
    if (P.casting) { const t = proj(P.x, P.y, gh + headH(P) + 0.35), k = 1 - P.castT / P.castMax; ctx.fillStyle = 'rgba(10,10,20,.85)'; ctx.fillRect(t[0] - 30, t[1] - 4, 60, 8); ctx.fillStyle = '#5ae05a'; ctx.fillRect(t[0] - 29, t[1] - 3, 58 * k, 6); }
  }
  // RO-style damage numbers
  for (const f of floats) {
    const a = proj(f.x, f.y, f.hw); if (a[2] > 1) continue; const k = f.t; let x = a[0], y = a[1], size = 20, col = '#ffffff', life = 0.95;
    if (f.kind === 'dmg' || f.kind === 'crit' || f.kind === 'hurt') { x += f.side * 44 * k * sc; y += (-230 * k + 260 * k * k) * sc; size = (f.kind === 'crit' ? 30 : 24) * (1.25 - 0.45 * k); col = f.kind === 'crit' ? '#ffe040' : f.kind === 'hurt' ? '#ff4a3a' : '#ffffff'; }
    else if (f.kind === 'heal' || f.kind === 'sp') { y -= 44 * k * sc; col = f.kind === 'heal' ? '#6aff6a' : '#8ac0ff'; size = f.small ? 14 : 20; }
    else if (f.kind === 'miss') { y -= 34 * k * sc; col = '#e8e0d0'; size = 16; }
    else if (f.kind === 'skill') { y -= 10 * k; col = '#fff2b0'; size = 15; life = 1.3; }
    else if (f.kind === 'lvl' || f.kind === 'job') { y -= 40 * k; size = f.kind === 'lvl' ? 30 : 24; life = 1.3; col = f.kind === 'lvl' ? '#ffd84a' : '#7af0e0'; }
    else if (f.kind === 'shout') { y -= 12 * k; col = '#ff9a6a'; size = 22; }
    else if (f.kind === 'info') { y -= 26 * k; col = '#bfe4ff'; size = 15; }
    size *= sc; ctx.globalAlpha = Math.min(1, (life - k) * 4);
    if (f.kind === 'crit') star(x, y - size * 0.35, size * 1.15, size * 0.55, 10, 'rgba(230,40,30,.85)');
    ctx.font = `800 ${size}px 'Nanum Gothic', Tahoma, sans-serif`; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, size * 0.2); ctx.strokeStyle = f.kind === 'lvl' ? '#6a3a00' : '#000';
    ctx.strokeText(f.txt, x, y);
    if (f.kind === 'lvl') { const g = ctx.createLinearGradient(0, y - size, 0, y); g.addColorStop(0, '#fff8c0'); g.addColorStop(1, '#f0a020'); ctx.fillStyle = g; } else ctx.fillStyle = col;
    ctx.fillText(f.txt, x, y);
  }
  ctx.globalAlpha = 1;
  drawScreenParts();
}
function setScreenParts() {
  screenParts = []; const n = map.d.part === 'dust' ? 40 : 60;
  for (let i = 0; i < n; i++) screenParts.push({ x: Math.random() * W, y: Math.random() * H, v: rand(0.3, 1), s: rand(1, 2.6), ph: Math.random() * 6 });
}
function drawScreenParts() {
  const kind = map.d.part;
  for (const p of screenParts) {
    if (kind === 'ember') { p.y -= p.v * 0.9; p.x += Math.sin(time + p.ph) * 0.4; if (p.y < -5) { p.y = H + 5; p.x = Math.random() * W; } ctx.fillStyle = `rgba(255,${120 + p.v * 80 | 0},40,${0.55 * p.v})`; }
    else if (kind === 'dust') { p.y += Math.sin(time * 0.5 + p.ph) * 0.15; p.x += 0.1 * p.v; if (p.x > W) p.x = 0; ctx.fillStyle = `rgba(180,190,230,${0.2 * p.v})`; }
    else if (kind === 'leaf') { p.y += p.v * 0.6; p.x += Math.sin(time * 1.3 + p.ph) * 0.7; if (p.y > H + 5) { p.y = -5; p.x = Math.random() * W; } ctx.fillStyle = `rgba(120,150,60,${0.45 * p.v})`; }
    else if (kind === 'petal') { p.y += p.v * 0.45; p.x += 0.3 + Math.sin(time + p.ph) * 0.4; if (p.y > H + 5) { p.y = -5; p.x = Math.random() * W; } if (p.x > W + 5) p.x = -5; ctx.fillStyle = `rgba(255,200,220,${0.5 * p.v})`; }
    else { p.y += p.v * 0.5; p.x += 0.25 + Math.sin(time + p.ph) * 0.3; if (p.y > H + 5) { p.y = -5; p.x = Math.random() * W; } if (p.x > W + 5) p.x = -5; ctx.fillStyle = `rgba(215,212,205,${0.35 * p.v})`; }
    ctx.fillRect(p.x, p.y, p.s, p.s);
  }
}
function drawMinimap() {
  const mc = $('mini'), g = mc.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#10131c'; g.fillRect(0, 0, mc.width, mc.height);
  const s = Math.min(mc.width / map.w, mc.height / map.h), ox = (mc.width - map.w * s) / 2, oy = (mc.height - map.h * s) / 2;
  g.imageSmoothingEnabled = false; g.drawImage(map.mini, ox, oy, map.w * s, map.h * s);
  const dot = (x, y, c, r) => { g.fillStyle = c; g.beginPath(); g.arc(ox + x * s, oy + y * s, r, 0, 7); g.fill(); g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 1; g.stroke(); };
  for (const m of mobs) if (!m.dead) dot(m.x, m.y, m.d.boss ? '#ff7a2a' : '#e04848', m.d.boss ? 5 : 2.4);
  for (const n of map.npcs) dot(n.x, n.y, '#6aa8ff', 3.5);
  for (const wp of map.warps) dot(wp.x + 0.5, wp.y + 0.5, wp.lock === 'gate' && !P.flags.gate ? '#b03020' : '#4ad0ff', 4);
  for (const d of drops) if (d.lost) dot(d.x, d.y, '#ff2a2a', 4);
  const px = ox + P.x * s, py = oy + P.y * s, a = Math.atan2(P.fy || 0, P.fx || 1);
  g.save(); g.translate(px, py); g.rotate(a); g.fillStyle = '#ffffff'; g.strokeStyle = '#000'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(8, 0); g.lineTo(-5, -5); g.lineTo(-2, 0); g.lineTo(-5, 5); g.closePath(); g.fill(); g.stroke(); g.restore();
}
function render(dt) {
  updateCamera(dt || 0.016);
  animateWorld(dt || 0.016);
  syncEntities();
  syncDecals();
  renderer.render(scene, camera);
  drawOverlay();
}
