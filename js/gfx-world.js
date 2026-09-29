'use strict';
/* =========================================================
   3D world: camera, lights, painted ground, world meshes
   Ragnarok-style: textured 3D terrain, rotatable camera,
   2D pixel sprites standing on it (see gfx-sprites.js).
   ========================================================= */
const PXU = 36;                       // sprite pixels per world unit
const PCOL = { fire: '#ff7a2a', ice: '#9fd8ff', soul: '#c8a8ff', holy: '#fff0b0', arrow: '#d8c8a0', bolt: '#fff6a0' };
const glc = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas: glc, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(20, 1, 1, 600);
const cam = { yaw: 0, yawT: 0, pitch: 0.88, dist: 40, tx: 18, ty: 20, th: 0 };
let COSP = Math.cos(cam.pitch), PPU = 30;
const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 0.5); sun.position.set(-22, 40, 28); scene.add(sun);
const torch = new THREE.PointLight(0xffa860, 0, 13, 1.6); scene.add(torch);
let curWorld = null;
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), _v3 = new THREE.Vector3();

function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function canvasTex(c, o = {}) {
  const t = new THREE.CanvasTexture(c);
  if (o.pixel) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; }
  if (o.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  if (o.aniso) t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
function smoothstep(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
function tnoise(x, y, Pp, s) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); const h = (i, j) => hash2(((i % Pp) + Pp) % Pp, ((j % Pp) + Pp) % Pp, s); const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
const NZ = (() => { const N = 256, a = new Float32Array(N * N), b = new Float32Array(N * N); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { a[y * N + x] = tnoise(x / 16, y / 16, 16, 5) * 0.65 + tnoise(x / 8, y / 8, 32, 6) * 0.35; b[y * N + x] = Math.random(); } return { a, b }; })();

/* ---------- Shared textures ---------- */
function radialTex(size, stops) { const c = mkCanvas(size, size), g = c.getContext('2d'); const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2); for (const [o, col] of stops) gr.addColorStop(o, col); g.fillStyle = gr; g.fillRect(0, 0, size, size); return canvasTex(c); }
const TEX = {};
TEX.shadow = radialTex(64, [[0, 'rgba(0,0,0,.6)'], [0.6, 'rgba(0,0,0,.35)'], [1, 'rgba(0,0,0,0)']]);
TEX.glow = radialTex(64, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,.45)'], [1, 'rgba(255,255,255,0)']]);
TEX.disc = radialTex(128, [[0, 'rgba(255,255,255,.75)'], [0.82, 'rgba(255,255,255,.6)'], [0.94, 'rgba(255,255,255,.9)'], [1, 'rgba(255,255,255,0)']]);
TEX.soft = radialTex(128, [[0, 'rgba(255,255,255,.9)'], [1, 'rgba(255,255,255,0)']]);
TEX.flame = (() => { const c = mkCanvas(64, 96), g = c.getContext('2d'); const gr = g.createRadialGradient(32, 64, 2, 32, 58, 34); gr.addColorStop(0, 'rgba(255,250,210,1)'); gr.addColorStop(0.35, 'rgba(255,190,80,.9)'); gr.addColorStop(0.7, 'rgba(255,90,20,.45)'); gr.addColorStop(1, 'rgba(255,40,0,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(32, 4); g.quadraticCurveTo(58, 50, 50, 74); g.quadraticCurveTo(32, 96, 14, 74); g.quadraticCurveTo(6, 50, 32, 4); g.fill(); return canvasTex(c); })();
function circleTex(kind) {
  const S = 256, c = mkCanvas(S, S), g = c.getContext('2d'); g.translate(S / 2, S / 2); g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineCap = 'round';
  const circ = (r, w) => { g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke(); };
  if (kind === 'ring') { g.shadowColor = '#fff'; g.shadowBlur = 10; circ(112, 10); }
  else if (kind === 'target') { circ(96, 6); for (let i = 0; i < 4; i++) { g.save(); g.rotate(i * Math.PI / 2); g.beginPath(); g.moveTo(0, -104); g.lineTo(-12, -124); g.lineTo(12, -124); g.closePath(); g.fill(); g.restore(); } }
  else {
    g.shadowColor = '#fff'; g.shadowBlur = 8; circ(120, 5); circ(98, 3); circ(62, 3);
    g.lineWidth = 3; for (let k = 0; k < 2; k++) { g.beginPath(); for (let i = 0; i <= 3; i++) { const a = k * Math.PI / 3 + i * 2 * Math.PI / 3 - Math.PI / 2; const x = Math.cos(a) * 96, y = Math.sin(a) * 96; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
    for (let i = 0; i < 16; i++) { g.save(); g.rotate(i * Math.PI / 8); g.lineWidth = 3; g.beginPath(); g.moveTo(-5, -104); g.lineTo(0, -114); g.lineTo(5, -104); if (i % 2) { g.moveTo(0, -104); g.lineTo(0, -116); } g.stroke(); g.restore(); }
  }
  return canvasTex(c);
}
TEX.ring = circleTex('ring'); TEX.target = circleTex('target'); TEX.magic = circleTex('magic');
TEX.beam = (() => { const c = mkCanvas(64, 128), g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,.75)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 128); for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(255,255,255,${0.15 + Math.random() * 0.4})`; g.fillRect(Math.random() * 64, Math.random() * 90, 2, 30 + Math.random() * 40); } const t = canvasTex(c, { repeat: true }); return t; })();
TEX.lava = (() => { const S = 128, c = mkCanvas(S, S), g = c.getContext('2d'), img = g.createImageData(S, S); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const n = tnoise(x / 16, y / 16, 8, 21) * 0.6 + tnoise(x / 6, y / 6, 21.33, 22) * 0.4; const k = Math.pow(smoothstep(0.35, 0.75, n), 1.4); const o = (y * S + x) * 4; img.data[o] = 120 + 135 * k; img.data[o + 1] = 24 + 150 * k * k; img.data[o + 2] = 8 + 40 * k * k * k; img.data[o + 3] = 255; } g.putImageData(img, 0, 0); return canvasTex(c, { repeat: true }); })();
function patternTex(kind) {
  const c = mkCanvas(128, 256), g = c.getContext('2d'), r = mulberry32(kind.length * 97);
  if (kind === 'ghwall' || kind === 'townwall' || kind === 'stone') {
    const base = kind === 'ghwall' ? [88, 86, 104] : kind === 'townwall' ? [196, 180, 146] : [140, 136, 130];
    g.fillStyle = `rgb(${base.map(v => v * 0.55 | 0)})`; g.fillRect(0, 0, 128, 256);
    const bh = kind === 'stone' ? 32 : 24;
    for (let row = 0; row * bh < 256; row++) { const off = row % 2 ? 0 : 20; for (let x = -40 + off; x < 128; x += 40) { const j = (r() - 0.5) * 30; g.fillStyle = `rgb(${base.map(v => clamp(v + j, 0, 255) | 0)})`; g.fillRect(x + 2, row * bh + 2, 36, bh - 3); g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(x + 2, row * bh + 2, 36, 2); g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x + 2, row * bh + bh - 4, 36, 2); } }
    if (kind === 'ghwall') for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(70,110,60,${r() * 0.4})`; g.fillRect(r() * 128, 200 + r() * 56, 3 + r() * 6, 2 + r() * 4); }
  } else if (kind === 'plaster') {
    g.fillStyle = '#efe2c2'; g.fillRect(0, 0, 128, 256); for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(120,100,70,${r() * 0.08})`; g.fillRect(r() * 128, r() * 256, 3, 3); }
    g.fillStyle = '#6a4626'; g.fillRect(0, 0, 128, 10); g.fillRect(0, 246, 128, 10); g.fillRect(0, 0, 10, 256); g.fillRect(118, 0, 10, 256); g.fillRect(0, 120, 128, 8);
    g.save(); g.translate(64, 64); g.fillStyle = '#3a4a6a'; g.fillRect(-18, -22, 36, 40); g.fillStyle = '#ffe9a0'; g.fillRect(-15, -19, 13, 16); g.fillRect(2, -19, 13, 16); g.fillRect(-15, 0, 13, 15); g.fillRect(2, 0, 13, 15); g.restore();
  } else if (kind === 'roof') {
    g.fillStyle = '#9e3a22'; g.fillRect(0, 0, 128, 256); for (let row = 0; row < 16; row++) for (let x = 0; x < 128; x += 16) { const j = r() * 30 - 15; g.fillStyle = `rgb(${clamp(190 + j, 0, 255) | 0},${clamp(78 + j * 0.5, 0, 255) | 0},${clamp(48 + j * 0.3, 0, 255) | 0})`; g.beginPath(); g.arc(x + 8 + (row % 2) * 8, row * 16 + 10, 8, 0, Math.PI); g.fill(); }
  }
  return canvasTex(c);
}

/* ---------- Ground painting ---------- */
function paintGround(m) {
  const L = m.d.look, TP = 32, Wp = m.w * TP, Hp = m.h * TP, w = m.w, h = m.h;
  const c = mkCanvas(Wp, Hp), g = c.getContext('2d'), img = g.createImageData(Wp, Hp), D = img.data;
  const pf = new Float32Array(w * h); for (let i = 0; i < w * h; i++) pf[i] = (m.deco[i] === 6 || m.deco[i] === 5) ? 1 : 0;
  const pb = new Float32Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h) { s += pf[yy * w + xx] * (dx || dy ? 0.6 : 1.4); n += dx || dy ? 0.6 : 1.4; } } pb[y * w + x] = s / n; }
  const bil = (f, x, y) => { x -= 0.5; y -= 0.5; const xi = clamp(Math.floor(x), 0, w - 2), yi = clamp(Math.floor(y), 0, h - 2); const fx = clamp(x - xi, 0, 1), fy = clamp(y - yi, 0, 1); const i = yi * w + xi; return f[i] * (1 - fx) * (1 - fy) + f[i + 1] * fx * (1 - fy) + f[i + w] * (1 - fx) * fy + f[i + w + 1] * fx * fy; };
  const g1 = L.g1, g2 = L.g2, grain = L.grain || 20, P_ = L.path || [150, 130, 100], A_ = L.ash || [130, 128, 120];
  for (let py = 0; py < Hp; py++) {
    const ty = py / TP, tyi = Math.min(h - 1, py >> 5);
    for (let px = 0; px < Wp; px++) {
      const n1 = NZ.a[((py >> 3) & 255) * 256 + ((px >> 3) & 255)], n3 = NZ.a[((py >> 1) & 255) * 256 + ((px >> 1) & 255)], n2 = NZ.b[(py & 255) * 256 + (px & 255)];
      const t = n1 * 0.7 + n3 * 0.3, gr = (n2 - 0.5) * grain;
      let r = g1[0] + (g2[0] - g1[0]) * t + gr, gg = g1[1] + (g2[1] - g1[1]) * t + gr, b = g1[2] + (g2[2] - g1[2]) * t + gr * 0.6;
      if (L.ashAmt) { const an = NZ.a[((py >> 4) & 255) * 256 + ((px >> 4) & 255)]; const aw = smoothstep(0.66, 0.74, an + (n3 - 0.5) * 0.08) * Math.min(1, L.ashAmt * 2.4); if (aw > 0) { r += (A_[0] + gr - r) * aw; gg += (A_[1] + gr - gg) * aw; b += (A_[2] + gr - b) * aw; } }
      const txi = Math.min(w - 1, px >> 5), ti = tyi * w + txi;
      if (pb[ti] > 0.01) { const pw = bil(pb, px / TP, ty); const k = smoothstep(0.25, 0.55, pw + (n3 - 0.5) * 0.35); if (k > 0) { r += (P_[0] + gr * 1.2 - r) * k; gg += (P_[1] + gr * 1.2 - gg) * k; b += (P_[2] + gr - b) * k; } }
      const o = (py * Wp + px) * 4; D[o] = r; D[o + 1] = gg; D[o + 2] = b; D[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const rng = mulberry32(m.d.seed * 3 + 1), T_ = m.t;
  const tileOpen = (x, y) => x >= 0 && y >= 0 && x < w && y < h && T_[y * w + x] === 0;
  // Town cobblestones
  if (L.cobble) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (m.deco[y * w + x] !== 5) continue; const X = x * TP, Y = y * TP;
    g.fillStyle = 'rgba(96,86,70,.9)'; g.fillRect(X, Y, TP, TP);
    for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) { const j = rng() * 36 - 18; g.fillStyle = `rgb(${196 + j | 0},${184 + j | 0},${160 + j | 0})`; g.beginPath(); g.roundRect(X + sx * 16 + 1.5 + (sy ? 4 : 0) % 8, Y + sy * 16 + 1.5, 13, 13, 4); g.fill(); g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(X + sx * 16 + 4, Y + sy * 16 + 3, 7, 2); }
  }
  // Dungeon flagstones
  if (L.floor === 'flag') for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!tileOpen(x, y)) continue; const X = x * TP, Y = y * TP;
    g.fillStyle = `rgba(${rng() < 0.5 ? '255,255,255' : '0,0,0'},${rng() * 0.07})`; g.fillRect(X, Y, TP, TP);
    g.strokeStyle = 'rgba(20,18,28,.55)'; g.lineWidth = 2; g.strokeRect(X + 1, Y + 1, TP - 2, TP - 2);
    if (rng() < 0.25) { g.strokeStyle = 'rgba(20,18,28,.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(X + rng() * TP, Y + rng() * TP); g.lineTo(X + rng() * TP, Y + rng() * TP); g.lineTo(X + rng() * TP, Y + rng() * TP); g.stroke(); }
    if (!tileOpen(x, y - 1) || !tileOpen(x - 1, y)) for (let i = 0; i < 5; i++) { g.fillStyle = `rgba(80,120,64,${0.2 + rng() * 0.3})`; g.fillRect(X + rng() * TP, Y + rng() * 8, 2 + rng() * 3, 2); }
  }
  // Volcanic cracks
  if (L.floor === 'rock') for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!tileOpen(x, y) || rng() > 0.5) continue; const X = x * TP, Y = y * TP;
    g.strokeStyle = `rgba(255,${120 + rng() * 60 | 0},40,${0.3 + rng() * 0.4})`; g.lineWidth = 1.3; g.beginPath(); g.moveTo(X + rng() * TP, Y + rng() * TP); for (let k = 0; k < 3; k++) g.lineTo(X + rng() * TP, Y + rng() * TP); g.stroke();
  }
  // Grass blades & flowers
  if (L.floor === 'grass') {
    for (let i = 0; i < w * h * 6; i++) { const x = rng() * w, y = rng() * h; if (!tileOpen(x | 0, y | 0) || m.deco[(y | 0) * w + (x | 0)] >= 5) continue; const X = x * TP, Y = y * TP; g.strokeStyle = rng() < 0.5 ? `rgba(40,70,20,.35)` : `rgba(200,230,140,.25)`; g.lineWidth = 1; g.beginPath(); g.moveTo(X, Y); g.lineTo(X + (rng() - 0.5) * 3, Y - 3 - rng() * 3); g.stroke(); }
    const FL = ['#ffffff', '#ffe46a', '#ff9ac8', '#c8a0ff', '#ff7a5a'];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!tileOpen(x, y) || m.deco[y * w + x] >= 5 || rng() > L.flowers) continue; const col = FL[(rng() * FL.length) | 0], cx = x * TP + rng() * TP, cy = y * TP + rng() * TP;
      for (let k = 0; k < 3 + rng() * 5; k++) { const fx = cx + (rng() - 0.5) * 14, fy = cy + (rng() - 0.5) * 10; g.fillStyle = 'rgba(30,60,20,.5)'; g.fillRect(fx - 1, fy + 1, 3, 2); g.fillStyle = col; g.fillRect(fx - 1, fy - 1, 3, 3); g.fillStyle = '#ffe46a'; g.fillRect(fx, fy, 1, 1); }
    }
  }
  // Scattered decorations
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dc = m.deco[y * w + x]; if (!dc || !tileOpen(x, y)) continue; const X = x * TP + 8 + rng() * 16, Y = y * TP + 8 + rng() * 16;
    if (dc === 2) { g.fillStyle = 'rgba(236,228,206,.8)'; g.fillRect(X - 6, Y, 10, 2); g.beginPath(); g.arc(X + 6, Y - 1, 3, 0, 7); g.fill(); }
    else if (dc === 3) { g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(X - 10, Y - 3); g.lineTo(X, Y + 2); g.lineTo(X + 9, Y - 4); g.stroke(); }
    else if (dc === 4) { g.fillStyle = L.floor === 'rock' ? 'rgba(255,120,40,.3)' : 'rgba(110,106,100,.45)'; g.beginPath(); g.ellipse(X, Y, 9, 5, 0, 0, 7); g.fill(); }
    else if (dc === 1 && L.floor === 'grass') { g.fillStyle = 'rgba(40,80,24,.45)'; g.beginPath(); g.ellipse(X, Y, 7, 4, 0, 0, 7); g.fill(); }
  }
  // Baked ambient occlusion under solid things
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = T_[y * w + x]; if (!t || t === T.LAVA) continue;
    const [rad, a] = t === T.TREE ? [1.5, 0.34] : t === T.WALL ? [1.0, 0.42] : t === T.RUIN ? [1.1, 0.38] : [0.9, 0.34];
    if (t === T.WALL && m.vis && !m.vis[y * w + x]) continue;
    const cx = (x + 0.6) * TP, cy = (y + 0.65) * TP, R = rad * TP; const gr = g.createRadialGradient(cx, cy, 0, cx, cy, R); gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(cx - R, cy - R, R * 2, R * 2);
  }
  // Baked lights
  g.globalCompositeOperation = 'lighter';
  const glow = (x, y, R, col) => { const gr = g.createRadialGradient(x * TP, y * TP, 0, x * TP, y * TP, R * TP); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect((x - R) * TP, (y - R) * TP, R * 2 * TP, R * 2 * TP); };
  for (const b of m.braziers) glow(b.x, b.y, 3.2, 'rgba(255,140,50,.32)');
  if (m.way) glow(m.way.x, m.way.y, 4, 'rgba(255,150,60,.3)');
  for (const wp of m.warps) glow(wp.x + 0.5, wp.y + 0.5, 2.4, 'rgba(90,150,255,.35)');
  if (L.lava) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (T_[y * w + x] === T.LAVA && (tileOpen(x + 1, y) || tileOpen(x - 1, y) || tileOpen(x, y + 1) || tileOpen(x, y - 1))) glow(x + 0.5, y + 0.5, 1.6, 'rgba(255,90,20,.35)');
  g.globalCompositeOperation = 'source-over';
  return c;
}

/* ---------- Geometry helpers ---------- */
function ni(g) { return g.index ? g.toNonIndexed() : g; }
function merge(geos) {
  let n = 0; for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2); let o = 0;
  for (const g of geos) { const c = g.attributes.position.count; pos.set(g.attributes.position.array, o * 3); if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3); if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2); o += c; g.dispose(); }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return out;
}
function boxAt(x, y, z, sx, sy, sz) { const g = ni(new THREE.BoxGeometry(sx, sy, sz)); g.translate(x, y + sy / 2, z); return g; }
function groundH(x, y) {
  const m = map; if (!m || !m.hgt) return 0; const W1 = m.w + 1;
  x = clamp(x, 0, m.w - 0.001); y = clamp(y, 0, m.h - 0.001);
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, i = yi * W1 + xi;
  const a = m.hgt[i], b = m.hgt[i + 1], c = m.hgt[i + W1], d = m.hgt[i + W1 + 1];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
function hgtAt(m, x, y) { const W1 = m.w + 1; return m.hgt[clamp(Math.round(y), 0, m.h) * W1 + clamp(Math.round(x), 0, m.w)]; }
function headH(e) { const hp = e === P || e.kind === 'player' ? 58 : e.d ? e.d.h : e.look ? 58 * (e.look.scale || 1) : 30; return hp / PXU / COSP; }
function chestH(e) { if (!e || e.x === undefined) return 1; if (e.kind === 'drop') return groundH(e.x, e.y) + 0.3; return groundH(e.x, e.y) + (e.z || 0) / PXU + headH(e) * 0.5; }

/* ---------- Tree textures (painted, Ragnarok-field style) ---------- */
const TREETEX = {};
function treeTex(kind, seed) {
  const key = kind + seed; if (TREETEX[key]) return TREETEX[key];
  const c = mkCanvas(128, 160), g = c.getContext('2d'), r = mulberry32(seed);
  const trunk = kind === 'dead' ? '#6e6258' : '#6a4526';
  g.fillStyle = trunk; g.beginPath(); g.moveTo(54, 160); g.quadraticCurveTo(58, 110, 60, 70); g.lineTo(68, 70); g.quadraticCurveTo(70, 110, 76, 160); g.closePath(); g.fill();
  g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(66, 80, 6, 80); g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 1; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(60 + r() * 10, 90 + i * 11); g.lineTo(62 + r() * 10, 98 + i * 11); g.stroke(); }
  if (kind === 'dead') {
    g.strokeStyle = trunk; g.lineCap = 'round';
    const br = (x, y, len, a, wd, d) => { const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len; g.lineWidth = wd; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke(); if (d > 0) { br(x2, y2, len * 0.7, a - 0.5 + r() * 0.3, wd * 0.65, d - 1); br(x2, y2, len * 0.7, a + 0.5 - r() * 0.3, wd * 0.65, d - 1); } };
    br(64, 80, 24, -Math.PI / 2, 7, 3);
    for (let i = 0; i < 10; i++) { g.fillStyle = `rgba(${150 + r() * 40 | 0},${110 + r() * 30 | 0},60,.8)`; g.fillRect(30 + r() * 68, 20 + r() * 60, 3, 2); }
  } else {
    const P_ = kind === 'forest' ? ['#173d1c', '#245a26', '#3a7a30', '#5e9e40'] : kind === 'forest2' ? ['#1d3a26', '#2a5a38', '#3f7a48', '#62a060'] : kind === 'autumn' ? ['#6a2e10', '#a8501c', '#d88a2a', '#f4c050'] : ['#21571c', '#3a8a2a', '#5cb03a', '#96d45a'];
    const cl = []; const cx = 64, cy = kind.startsWith('forest') ? 58 : 62, rx = kind.startsWith('forest') ? 48 : 44, ry = kind.startsWith('forest') ? 52 : 42;
    for (let i = 0; i < 16; i++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()); cl.push([cx + Math.cos(a) * rx * d * 0.75, cy + Math.sin(a) * ry * d * 0.75, 12 + r() * 12]); }
    cl.sort((a, b) => a[1] - b[1]);
    for (const [x, y, rr] of cl) { g.fillStyle = P_[0]; g.beginPath(); g.arc(x + 2, y + 3, rr + 2, 0, 7); g.fill(); }
    for (const [x, y, rr] of cl) { g.fillStyle = P_[1]; g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill(); g.fillStyle = P_[2]; g.beginPath(); g.arc(x - rr * 0.25, y - rr * 0.3, rr * 0.62, 0, 7); g.fill(); }
    for (let i = 0; i < 40; i++) { g.fillStyle = r() < 0.6 ? P_[3] : P_[0]; const x = cx + (r() - 0.5) * rx * 1.6, y = cy + (r() - 0.6) * ry * 1.5; g.fillRect(x, y, 2 + r() * 2, 2 + r() * 2); }
  }
  return (TREETEX[key] = canvasTex(c));
}

/* ---------- World building ---------- */
function buildWorld(m) {
  if (m.world) return m.world;
  const L = m.d.look, grp = new THREE.Group(), w = m.w, h = m.h, W1 = w + 1;
  const A = { flames: [], warps: [], lava: null, heart: null, way: null };
  const lam = (o) => new THREE.MeshLambertMaterial(o);
  // Ground
  const gg = new THREE.PlaneGeometry(w, h, w, h); gg.rotateX(-Math.PI / 2); gg.translate(w / 2, 0, h / 2);
  const pos = gg.attributes.position; for (let i = 0; i < pos.count; i++) pos.setY(i, m.hgt[Math.round(pos.getZ(i)) * W1 + Math.round(pos.getX(i))]);
  gg.computeVertexNormals();
  const ground = new THREE.Mesh(gg, lam({ map: canvasTex(paintGround(m), { aniso: true }) })); grp.add(ground); grp.userData.ground = ground;
  const tint = new THREE.Color(L.tint[0], L.tint[1], L.tint[2]);
  const walls = [], ruins = [], rocks = [], pillars = [], graves = [], trees = [[], [], []];
  const inHouse = (x, y) => (m.houses || []).some(q => x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, t = m.t[i], v = m.var[i], cx = x + 0.5, cz = y + 0.5, gh = groundH(cx, cz);
    if (t === T.WALL) { if (!m.vis[i]) continue; const wh = m.d.gen === 'town' ? 1.9 : 2.5; walls.push(boxAt(cx, gh - 0.3, cz, 1, wh + 0.3, 1)); if (m.d.gen === 'town' && (x + y) % 2 === 0) walls.push(boxAt(cx, gh + wh, cz, 0.5, 0.35, 0.5)); }
    else if (t === T.RUIN && !inHouse(x, y)) ruins.push(boxAt(cx, gh - 0.1, cz, 0.9, 0.35 + (v & 7) * 0.09, 0.9));
    else if (t === T.ROCK) { const g = ni(new THREE.DodecahedronGeometry(0.5, 0)); g.scale(0.85 + (v & 3) * 0.12, 0.55 + ((v >> 2) & 3) * 0.12, 0.85 + ((v >> 4) & 3) * 0.1); g.rotateY(v * 0.1); g.translate(cx, gh + 0.12, cz); rocks.push(g); }
    else if (t === T.PILLAR) { const g = ni(new THREE.CylinderGeometry(0.4, 0.48, 3.2, 10)); g.translate(cx, gh + 1.6, cz); pillars.push(g, boxAt(cx, gh, cz, 1, 0.35, 1), boxAt(cx, gh + 3.1, cz, 1.05, 0.3, 1.05)); }
    else if (t === T.GRAVE) { const g = boxAt(0, 0, 0, 0.55, 0.8, 0.16); g.rotateY((v & 15) * 0.05 - 0.4); g.translate(cx, gh, cz); graves.push(g); if (v & 1) { const c2 = boxAt(0, 0.45, 0, 0.5, 0.12, 0.17); c2.rotateY((v & 15) * 0.05 - 0.4); c2.translate(cx, gh, cz); graves.push(c2); } }
    else if (t === T.TREE) {
      const k = v % 3, s = (L.trees[k].startsWith('forest') ? 3.2 : 2.7) + ((v >> 2) & 7) * 0.12, ht = s * 1.25, ang = (v >> 5) * 0.4;
      for (let p = 0; p < 3; p++) { const g = ni(new THREE.PlaneGeometry(s, ht)); g.translate(0, ht / 2, 0); g.rotateY(ang + p * Math.PI / 3); g.translate(cx + ((v & 3) - 1.5) * 0.08, gh - 0.15, cz); trees[k].push(g); }
    }
  }
  if (walls.length) grp.add(new THREE.Mesh(merge(walls), lam({ map: patternTex(m.d.gen === 'town' ? 'townwall' : 'ghwall') })));
  if (ruins.length) grp.add(new THREE.Mesh(merge(ruins), lam({ map: patternTex('stone') })));
  if (rocks.length) grp.add(new THREE.Mesh(merge(rocks), lam({ color: L.rock, flatShading: true })));
  if (pillars.length) grp.add(new THREE.Mesh(merge(pillars), lam({ map: patternTex('stone'), color: m.id === 'throne' ? 0xb07060 : 0xffffff })));
  if (graves.length) grp.add(new THREE.Mesh(merge(graves), lam({ color: 0x9a98a4 })));
  for (let k = 0; k < 3; k++) if (trees[k].length) grp.add(new THREE.Mesh(merge(trees[k]), new THREE.MeshBasicMaterial({ map: treeTex(L.trees[k], m.d.seed * 7 + k), alphaTest: 0.5, side: THREE.DoubleSide, color: tint })));
  // Houses
  if (m.houses) {
    const bodyM = lam({ map: patternTex('plaster') }), roofM = lam({ map: patternTex('roof'), flatShading: true }), doorM = lam({ color: 0x4a2c16 });
    for (const q of m.houses) {
      const sx = q.x1 - q.x0 + 1, sz = q.y1 - q.y0 + 1, cx = q.x0 + sx / 2, cz = q.y0 + sz / 2, base = groundH(cx, cz) - 0.3;
      const body = new THREE.Mesh(new THREE.BoxGeometry(sx - 0.1, 2.6, sz - 0.1), bodyM); body.position.set(cx, base + 1.3, cz); grp.add(body);
      const rg = new THREE.ConeGeometry(1, 2, 4, 1); rg.rotateY(Math.PI / 4); rg.scale((sx + 0.7) * Math.SQRT1_2, 1, (sz + 0.7) * Math.SQRT1_2);
      const roof = new THREE.Mesh(rg, roofM); roof.position.set(cx, base + 2.6 + 1, cz); grp.add(roof);
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.4, 0.1), doorM); door.position.set(cx, base + 1.0, q.y1 + 1 + 0.01); grp.add(door);
    }
  }
  // Waystone
  if (m.way) {
    const g = new THREE.Group(), st = lam({ map: patternTex('stone') }), gh = groundH(m.way.x, m.way.y);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.25, 12), st); base.position.y = 0.12; g.add(base);
    const ob = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.34, 2.3, 4), st); ob.rotation.y = Math.PI / 4; ob.position.y = 1.4; g.add(ob);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.4, 4), st); tip.rotation.y = Math.PI / 4; tip.position.y = 2.75; g.add(tip);
    const rune = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, 0.06), new THREE.MeshBasicMaterial({ color: 0xffa040 })); rune.position.set(0, 1.3, 0.3); g.add(rune);
    const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.flame, color: 0xffb060, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); fl.position.y = 3.35; fl.scale.set(0.9, 1.35, 1); g.add(fl);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, color: 0xff8a30, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 })); halo.position.y = 3.1; halo.scale.set(3, 3, 1); g.add(halo);
    g.position.set(m.way.x, gh, m.way.y); grp.add(g);
    A.way = { fl, halo, rune }; A.flames.push({ s: fl, sx: 0.9, sy: 1.35 });
  }
  // Warp portals
  for (const wp of m.warps) {
    const gh = groundH(wp.x + 0.5, wp.y + 0.5);
    const ringM = new THREE.MeshBasicMaterial({ map: TEX.magic, color: 0x7ab8ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), ringM); ring.rotation.x = -Math.PI / 2; ring.position.set(wp.x + 0.5, gh + 0.05, wp.y + 0.5); grp.add(ring);
    const bt = TEX.beam.clone(); bt.needsUpdate = true;
    const beamM = new THREE.MeshBasicMaterial({ map: bt, color: 0x9fd0ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.8, 3.4, 20, 1, true), beamM); beam.position.set(wp.x + 0.5, gh + 1.7, wp.y + 0.5); grp.add(beam);
    A.warps.push({ ring, ringM, beam, beamM, bt, wp });
  }
  // Braziers
  const metal = lam({ color: 0x3a3430 });
  for (const b of m.braziers) {
    const gh = groundH(b.x, b.y), g = new THREE.Group();
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.1, 0.75, 6), metal); leg.position.y = 0.37; g.add(leg);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.15, 0.22, 8), metal); bowl.position.y = 0.82; g.add(bowl);
    const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.flame, color: 0xffa050, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); fl.position.y = 1.2; fl.scale.set(0.5, 0.75, 1); g.add(fl);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, color: 0xff7a20, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.45 })); halo.position.y = 1.1; halo.scale.set(1.8, 1.8, 1); g.add(halo);
    g.position.set(b.x, gh, b.y); grp.add(g); A.flames.push({ s: fl, sx: 0.5, sy: 0.75 });
  }
  // Anvil
  for (const o of m.objs) if (o.kind === 'anvil') { const g = new THREE.Group(); const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.3), metal); b1.position.y = 0.2; const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.22, 0.36), lam({ color: 0x5a5654 })); b2.position.y = 0.5; g.add(b1, b2); g.position.set(o.x, groundH(o.x, o.y), o.y); grp.add(g); }
  // Lava
  if (L.lava) { const lt = TEX.lava.clone(); lt.needsUpdate = true; lt.repeat.set((w + 30) / 4, (h + 30) / 4); const lava = new THREE.Mesh(new THREE.PlaneGeometry(w + 30, h + 30), new THREE.MeshBasicMaterial({ map: lt })); lava.rotation.x = -Math.PI / 2; lava.position.set(w / 2, -0.5, h / 2); grp.add(lava); A.lava = lt; }
  // Heart of Yggdrasil
  if (m.heart) {
    const hx = m.heart.x, hz = m.heart.y, gh = groundH(hx, hz), rootM = lam({ color: 0x3a2618 });
    for (let i = 0; i < 7; i++) { const a = -Math.PI * 0.9 + i * Math.PI * 0.3; const pts = [new THREE.Vector3(hx, gh + 1.2, hz), new THREE.Vector3(hx + Math.cos(a) * 1.2, gh + 1.8, hz + Math.sin(a) * 0.8 - 0.4), new THREE.Vector3(hx + Math.cos(a) * 2.6, gh + 0.6, hz + Math.sin(a) * 1.6 - 0.6), new THREE.Vector3(hx + Math.cos(a) * 3.4, gh - 0.2, hz + Math.sin(a) * 2.2 - 0.8)]; grp.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, 0.22 - i * 0.01, 6), rootM)); }
    const coreM = new THREE.MeshBasicMaterial({ color: 0x3a2014 }); const core = new THREE.Mesh(new THREE.SphereGeometry(0.75, 14, 10), coreM); core.position.set(hx, gh + 1.3, hz); grp.add(core);
    const glowS = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, color: 0xffc060, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 })); glowS.position.set(hx, gh + 1.3, hz); glowS.scale.set(5, 5, 1); grp.add(glowS);
    A.heart = { coreM, glowS };
  }
  m.world = grp; m.anim = A;
  return grp;
}
function enterWorld() {
  const L = map.d.look;
  if (curWorld) scene.remove(curWorld);
  curWorld = buildWorld(map); scene.add(curWorld);
  scene.fog = new THREE.Fog(L.fog, L.fogN, L.fogF); scene.background = new THREE.Color(L.fog);
  hemi.color.setHex(L.hemi[0]); hemi.groundColor.setHex(L.hemi[1]); hemi.intensity = L.hemi[2];
  sun.color.setHex(L.sun[0]); sun.intensity = L.sun[1];
  torch.intensity = L.torch;
  clearVis();
  if (P) { cam.tx = P.x; cam.ty = P.y; cam.th = groundH(P.x, P.y); }
}
function snapCam() { cam.tx = P.x; cam.ty = P.y; cam.th = groundH(P.x, P.y); }
function animateWorld(dt) {
  const A = map.anim; if (!A) return;
  for (const f of A.flames) { const k = 1 + Math.sin(time * 13 + f.sx * 40) * 0.08 + Math.sin(time * 7.3) * 0.05; f.s.scale.set(f.sx * (2 - k), f.sy * k, 1); }
  if (A.way) { const lit = !!P.kindled[map.id]; A.way.fl.visible = lit; A.way.halo.visible = lit; A.way.rune.material.color.setHex(lit ? 0xffa040 : 0x5a544e); if (lit && Math.random() < 0.3) parts.push({ x: map.way.x + rand(-0.2, 0.2), y: map.way.y + rand(-0.2, 0.2), z: 115, vx: rand(-0.2, 0.2), vy: rand(-0.2, 0.2), vz: rand(30, 70), life: rand(0.8, 1.6), max: 1.6, col: '#ffa050', size: 2 }); }
  for (const w of A.warps) {
    const locked = w.wp.lock === 'gate' && !P.flags.gate, col = locked ? 0xff5a3a : 0x8ac4ff;
    w.ring.rotation.z += dt * 0.8; w.ringM.color.setHex(col); w.beamM.color.setHex(col); w.bt.offset.y -= dt * 0.6; w.beam.rotation.y += dt * 0.5;
    w.beamM.opacity = 0.75 + Math.sin(time * 3) * 0.2;
    if (Math.random() < 0.5) parts.push({ x: w.wp.x + 0.5 + rand(-0.5, 0.5), y: w.wp.y + 0.5 + rand(-0.5, 0.5), z: 0, vx: 0, vy: 0, vz: rand(50, 110), life: rand(0.8, 1.4), max: 1.4, col: locked ? '#ff8a6a' : '#bfe4ff', size: 2.5, float: true });
  }
  if (A.lava) { A.lava.offset.x += dt * 0.02; A.lava.offset.y += dt * 0.012; }
  if (A.heart) { const alive = P.flags.kingSlain; const k = alive ? 0.6 + Math.sin(time * 2) * 0.3 : 0.05; A.heart.coreM.color.setRGB(0.25 + k * 0.75, 0.13 + k * 0.6, 0.08 + k * 0.25); A.heart.glowS.material.opacity = alive ? k : 0; }
  torch.position.set(P.x, groundH(P.x, P.y) + 2.2, P.y);
}
function updateCamera(dt) {
  if (P) {
    const k = started ? 1 - Math.pow(0.0005, dt) : 0.02;
    cam.tx += (P.x - cam.tx) * k; cam.ty += (P.y - cam.ty) * k; cam.th += (groundH(P.x, P.y) - cam.th) * k;
  }
  if (!started) cam.yawT += dt * 0.04;
  cam.yaw += (cam.yawT - cam.yaw) * (1 - Math.pow(0.002, dt));
  COSP = Math.cos(cam.pitch);
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch), ty = cam.th + 0.9;
  camera.position.set(cam.tx + Math.sin(cam.yaw) * cp * cam.dist, ty + sp * cam.dist, cam.ty + Math.cos(cam.yaw) * cp * cam.dist);
  if (typeof SHAKE !== 'undefined' && SHAKE > 0) { SHAKE = Math.max(0, SHAKE - dt); const k = SHAKE * 2.2; camera.position.x += rand(-k, k); camera.position.y += rand(-k, k); }
  camera.lookAt(cam.tx, ty, cam.ty);
  PPU = H / (2 * cam.dist * Math.tan(camera.fov * Math.PI / 360));
}
function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1); W = window.innerWidth; H = window.innerHeight;
  renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix();
  cv.width = Math.floor(W * DPR); cv.height = Math.floor(H * DPR);
  if (W < 700) cam.dist = 34;
}
function proj(x, y, z) { _v3.set(x, z, y).project(camera); return [(_v3.x * 0.5 + 0.5) * W, (-_v3.y * 0.5 + 0.5) * H, _v3.z]; }
function w2s(x, y) { const p = proj(x, y, groundH(x, y)); return [p[0], p[1]]; }
function s2w(sx, sy) {
  ndc.set(sx / W * 2 - 1, -(sy / H) * 2 + 1); ray.setFromCamera(ndc, camera);
  if (curWorld && curWorld.userData.ground) { const hit = ray.intersectObject(curWorld.userData.ground, false)[0]; if (hit) return [hit.point.x, hit.point.z]; }
  const o = ray.ray.origin, d = ray.ray.direction, t = (cam.th - o.y) / d.y; return [o.x + d.x * t, o.z + d.z * t];
}
const CURSORS = (() => {
  const svg = (s, hx, hy, fb) => `url("data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'>${s}</svg>`)}") ${hx} ${hy}, ${fb}`;
  return {
    def: svg("<path d='M3 2 L3 21 L8 16.5 L12 25 L15.5 23.4 L11.6 15 L18.5 15 Z' fill='#f7df8e' stroke='#422a0c' stroke-width='1.6' stroke-linejoin='round'/><path d='M5 5 L5 16' stroke='#fff6cc' stroke-width='1.4'/>", 3, 2, 'default'),
    atk: svg("<path d='M4 24 L9 19 M7 17 L11 21 M9 19 L23 5 L24.5 3.5 L25 7 L11 21' fill='#e8eef8' stroke='#303848' stroke-width='1.8' stroke-linejoin='round'/><path d='M3 25 L6 22' stroke='#8a5a2a' stroke-width='3'/>", 24, 4, 'crosshair'),
    talk: svg("<path d='M3 4 H24 V17 H12 L6 23 V17 H3 Z' fill='#fdfdf6' stroke='#384a70' stroke-width='1.6' stroke-linejoin='round'/><circle cx='9' cy='10.5' r='1.5' fill='#384a70'/><circle cx='13.5' cy='10.5' r='1.5' fill='#384a70'/><circle cx='18' cy='10.5' r='1.5' fill='#384a70'/>", 4, 4, 'pointer'),
    pick: svg("<path d='M8 13 V5 a2 2 0 0 1 4 0 V12 V3.5 a2 2 0 0 1 4 0 V12 V5 a2 2 0 0 1 4 0 V14 a8 8 0 0 1 -8 9 h-2 a7 7 0 0 1 -6 -4 L2 14 a2 2 0 0 1 3 -2.4 Z' fill='#f7df8e' stroke='#422a0c' stroke-width='1.5' stroke-linejoin='round'/>", 12, 3, 'pointer'),
  };
})();
let curCursor = '';
function setCursor(k) { if (k !== curCursor) { curCursor = k; cv.style.cursor = CURSORS[k]; } }
