'use strict';
/* =========================================================
   Pre-rendered sprite sheets (contract v2, art/CONTRACT.md).
   Sheets live in assets/sprites/<id>.png + <id>.json and are
   listed in the index files below (any of them may be missing).
   Sheets are resolved by (body, layer, variant) from the index
   and loaded lazily on first need; until a sheet is ready the
   procedural sprite is drawn, then the sheet swaps in.

   Users:
   - player: <cls>_<g> body -> hair -> shield -> weapon layers
   - mobs:   mob_<type> (layer "mob", body = MOBS key)
   - NPCs:   npc_<id>   (layer "npc", body = npc id; `walk` while n.moving)
   - headgear (contract v3): hg_<key> (layer "headgear", body = ITEMS[id].headgear), drawn at the body frame's
     head anchor (anchors.head[action][dir][frame] = [x, y, rot, visible]) above the hair; `hideHair`
     'all' hides the hair layer, 'top' clips it along the hat's `hairClip` line (same maths as art's hglib.py).
   - mounted player (contract v4): while P.mounted is truthy and <cls>_<g>.mount_body exists, the body / hair /
     weapon (/ shield) layers swap to the <cls>_<g>.mount_* sheets (192x160 frames; sit / pickup / stance are alias
     rows of idle). Mount entries are registered under their own keys ("<body>|mount:<layer>|<variant>"), so an
     index that lists them next to the on-foot sheets never replaces an on-foot layer.
   - companions (contract v4 pets): COMPANIONS[] entries drawn through the sprite batches (see "Companions" below).

   JSON layouts:
   - "blocks": block = r*dirs.length + d; bx = block % blocksPerRow;
     by = floor(block / blocksPerRow); x = (bx*maxFrames + f)*frameW;
     y = by*frameH.
   - "dir-blocks": same with blocksPerRow = dirs.length.
   - legacy (no layout): direction d of action row r at row (r + d),
     x = f*frameW.
   Sheets hold 5 facings (S, SE, E, NE, N); SW, W, NW are the
   horizontal mirrors of SE, E, NE.
   ========================================================= */
const SHEET_BASE = (typeof window !== 'undefined' && window.AOM_SPRITE_BASE) || 'assets/sprites/';
// Missing index files are harmless. The same sheet id may appear in several files (index.json also lists the
// index_classes2b.json sheets): the first file in this list that names an id wins, whatever order the XHRs finish in.
const SHEET_INDEX_FILES = ['index.json', 'index_creatures.json', 'index_humanoids.json', 'index_npcs.json', 'index_classes2b.json', 'index_world2a.json', 'index_world2b.json', 'index_npcs2.json', 'index_npcs3.json', 'index_headgear.json', 'index_pets.json', 'index_tier3a.json', 'index_tier3b.json', 'index_npcs4.json', 'index_helheim.json',
  'index_critters.json', 'index_npcs5.json'];   // round 10: critter_* (explicit layers: pet for the birds, mob for the rest) and the 13+ new npc_* sheets; a missing index file is skipped (fin on failure)
const SHEETS = {
  byId: {},          // id -> load record (created on first request)
  entries: {},       // id -> { id, layer, body, variant } from the index files
  byKey: {},         // "body|layer|variant" -> id
  indexLeft: SHEET_INDEX_FILES.length, indexReady: false, indexFiles: [],
  loaded: [], failed: [], requests: 0,
  gen: 0,            // bumped when the index is registered (cached hero layer wants depend on which sheets exist)
};
const HAIR_GREY = 0.72;            // neutral grey the hair sheets are painted in (tinted by the palette ramp: hairRamp() in gfx-render.js)
const LAYER_ORDER = ['body', 'mob', 'npc', 'pet', 'hair', 'headgear', 'shield', 'weapon'];
const WTYPE_VARIANT = { dagger: 'dagger', sword: 'sword', rod: 'rod', bow: 'bow', mace: 'mace',
  spear: 'spear', twohand: 'twohand', staff: 'staff', book: 'book', lute: 'lute', whip: 'whip', knuckle: 'knuckle' };  // fist -> none

/* ---------- Loading ---------- */
function sheetXHR(url, ok, bad) {
  try {
    const x = new XMLHttpRequest();
    x.open('GET', url, true);
    x.onload = () => {
      // file:// (with --allow-file-access-from-files) reports status 0
      if ((x.status === 200 || x.status === 0) && x.responseText) { try { ok(JSON.parse(x.responseText)); } catch (e) { bad(e); } }
      else bad(new Error(url + ' -> HTTP ' + x.status));
    };
    x.onerror = () => bad(new Error(url + ' -> network error'));
    x.send();
  } catch (e) { bad(e); }
}
// Fill in body/variant for index entries that predate contract v2 (the Novice sheets).
function sheetEntry(s) {
  if (!s || typeof s.id !== 'string') return null;
  const id = s.id; let layer = s.layer, body = s.body, variant = s.variant;
  // contract v4: mounted variants (<cls>_<g>.mount_*, "mounted": true, body variant "mounted") get their own keys
  const mounted = s.mounted === true || /\.mount_/.test(id) || variant === 'mounted';
  if (!layer) {
    if (/^mob_/.test(id)) layer = 'mob'; else if (/^npc_/.test(id)) layer = 'npc'; else if (/^hg_/.test(id)) layer = 'headgear'; else if (/^pet_/.test(id)) layer = 'pet';
    else { const m = /\.mount_(body|hair|weapon|shield)(?:_|$)/.exec(id) || /(?:^|\.)(body|hair|weapon|shield)(?:_|$)/.exec(id); layer = m ? m[1] : 'body'; }
  }
  if (!body) {
    if (layer === 'mob') body = id.replace(/^mob_/, ''); else if (layer === 'npc') body = id.replace(/^npc_/, ''); else if (layer === 'headgear') body = id.replace(/^hg_/, '');
    else if (layer === 'pet') body = id.replace(/^pet_/, '');
    else if (id.indexOf('.') > 0) body = id.slice(0, id.indexOf('.'));
  }
  if (mounted && variant === 'mounted') variant = null;
  if (variant === undefined || variant === '') {
    variant = null;
    if (layer === 'hair') { const m = /hair_([a-z]+)/.exec(id); if (m) variant = m[1]; }
    else if (layer === 'weapon') { const m = /weapon_([a-z]+)/.exec(id); if (m) variant = m[1] === 'knife' ? 'dagger' : m[1]; }
    else if (layer === 'shield') { const m = /shield_([a-z]+)/.exec(id); variant = m ? m[1] : 'guard'; }
  }
  return { id, layer, body, variant: variant || null, mounted };
}
const sheetKey = (body, layer, variant) => body + '|' + layer + '|' + (variant || '');
// Index key of an entry: mounted sheets live under 'mount:<layer>' (never chosen for an on-foot layer).
const entryKey = e => sheetKey(e.body, e.mounted ? 'mount:' + e.layer : e.layer, e.variant);
// First registration of an id (and of a body|layer|variant key) wins: duplicates are ignored, never loaded twice.
function registerIndex(file, j) {
  SHEETS.indexFiles.push(file);
  for (const s of (j && Array.isArray(j.sheets) ? j.sheets : [])) {
    const e = sheetEntry(s); if (!e || !e.body || SHEETS.entries[e.id]) continue;
    SHEETS.entries[e.id] = e; const k = entryKey(e); if (!SHEETS.byKey[k]) SHEETS.byKey[k] = e.id;
  }
}
function loadIndexes() {
  const got = new Array(SHEET_INDEX_FILES.length).fill(null);
  // register in list order once every file has answered (or failed), so the winner of a duplicate id is deterministic
  const fin = () => { if (--SHEETS.indexLeft > 0) return; SHEET_INDEX_FILES.forEach((f, i) => { if (got[i]) registerIndex(f, got[i]); }); SHEETS.indexReady = true; SHEETS.gen++; prefetchSheets(); };
  SHEET_INDEX_FILES.forEach((f, i) => sheetXHR(SHEET_BASE + f, j => { got[i] = j; fin(); }, fin));
}
// Top of the opaque pixels in the idle S frame -> visible height above the feet (px).
let MEASURE_CV = null;
function measureSheet(rec) {
  const j = rec.json, fallback = j.visibleH || Math.round(j.anchor[1] * 0.8);
  rec.visH = fallback;
  if (j.visibleH) return;
  try {
    const r = sheetRect(j, sheetHas(j, 'idle') ? 'idle' : Object.keys(j.actions)[0], 0, 0); if (!r) return;
    if (rec.pal) {   // indexed sheet: scan the index rows (stored bottom-up) against the palette alpha
      const X = rec.pal, W = X.W, H = X.H, idx = X.idx, al = X.alpha;
      for (let y = 0; y < r.h; y++) { const o = (H - 1 - (r.y + y)) * W + r.x; for (let x = 0; x < r.w; x++) if (al[idx[o + x]] > 127) { rec.visH = Math.max(8, j.anchor[1] - y); return; } }
      return;
    }
    // willReadFrequently keeps this canvas in CPU memory: only the frame is copied and read back (no GPU upload of
    // the whole sheet + GPU readback, which made this 29% of boot CPU). The art pipeline should ship visibleH.
    const c = MEASURE_CV || (MEASURE_CV = document.createElement('canvas')); c.width = r.w; c.height = r.h;
    const g = c.getContext('2d', { willReadFrequently: true }); g.clearRect(0, 0, r.w, r.h); g.drawImage(rec.tex.image, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    const px = g.getImageData(0, 0, r.w, r.h).data;
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) if (px[(y * r.w + x) * 4 + 3] > 127) { rec.visH = Math.max(8, j.anchor[1] - y); return; }
  } catch (e) { /* tainted canvas etc.: keep the fallback */ }
}
// Drop actions whose frames fall outside the PNG (bad sheet): they fall back to idle.
function validateSheet(rec) {
  const j = rec.json; j._bad = {};
  if (!j.actions || !j.dirs || !j.dirs.length || !j.frameW || !j.frameH || !j.anchor) { rec.err = rec.id + ': JSON missing frameW/frameH/anchor/dirs/actions'; return false; }
  for (const a in j.actions) {
    const A = j.actions[a], r = sheetRect(j, a, j.dirs.length - 1, (A.frames | 0) - 1);
    if (!r || r.x + r.w > rec.texW || r.y + r.h > rec.texH) j._bad[a] = true;
  }
  const bad = Object.keys(j._bad); if (bad.length && typeof console !== 'undefined') console.warn('[sheets] ' + rec.id + ': actions outside the PNG, ignored: ' + bad.join(', '));
  return true;
}
function loadSheet(id) {
  const rec = { id, entry: SHEETS.entries[id] || null, json: null, tex: null, pal: null, pages: null, batches: null, texW: 0, texH: 0, ok: false, done: false, err: null, visH: 0 };
  SHEETS.byId[id] = rec; SHEETS.requests++;
  let left = 2;
  const fin = err => {
    if (err && !rec.err) rec.err = String(err && err.message || err);
    if (--left) return;
    rec.ok = !rec.err && !!rec.json && !!(rec.tex || rec.pal) && validateSheet(rec);
    if (rec.ok) { rec.pages = sheetPageDefs(rec); measureSheet(rec); SHEETS.loaded.push(id); }
    else { SHEETS.failed.push(id); if (rec.tex) { rec.tex.dispose(); rec.tex = null; } if (rec.pal) { rec.pal.tex.dispose(); rec.pal = null; } }
    rec.done = true;
  };
  sheetXHR(SHEET_BASE + id + '.json', j => { rec.json = j; fin(); }, fin);
  if (palOn()) sheetLoadPal(rec, fin); else sheetLoadRGBA(rec, fin);
  return rec;
}
// RGBA path (WebGL1, no workers, a sheet the palette path rejects): the PNG as an image texture.
function sheetLoadRGBA(rec, fin) {
  try {
    new THREE.TextureLoader().load(SHEET_BASE + rec.id + '.png', t => {
      t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; if (typeof sprTexEnc === 'function') sprTexEnc(t);
      t.onUpdate = () => { rec.upd = true; };
      if (SHEETS.byId[rec.id] !== rec) { t.dispose(); return fin(new Error('released')); }
      rec.tex = t; rec.texW = t.image.width; rec.texH = t.image.height; fin();
    }, undefined, () => fin(new Error(rec.id + '.png failed to load')));
  } catch (e) { fin(e); }
}

/* ---------- Indexed sheets + pages (perf round 4) ----------
   Sprite sheets were ~70% of GPU memory (RGBA8: MVP sheets 64 MB, class layers 21-60 MB each). Every sheet is pixel
   art with <= 49 colours and binary alpha, so a Worker decodes the PNG (createImageBitmap + OffscreenCanvas) into an
   8-bit index image + a palette (rows stored bottom-up = the flipY layout of the old texture, so all UV maths is
   unchanged); the GPU gets R8 index textures + a 256x1 palette (gfx-render.js SPR_PAL: exact NEAREST / LINEAR
   emulation), 1 byte per texel instead of 4.
   Pages: mob sheets larger than PAGE_MIN texels (8 M: MVPs / bosses) are split into bands of whole block rows: page 0 holds every row an
   idle / walk / talk frame lives in (always resident while the sheet is shown), the other rows go into pages of at
   most PAGE_ROWS px. A page is a zero-copy view into the index image; it is uploaded in idle time when its sheet
   enters combat (sheetWantAll: mobs that chase / get hit / die) or,
   at the latest, by three on the first frame that draws it (R8: ~1 ms for a 4 MB page). Pages other than page 0
   that no frame has used for PAGE_IDLE s give their GPU memory back (sheetPagesSweep; the CPU copy stays, three
   re-uploads on the next use). Layered sprites (player, bosses) switch their materials' map per page; batched
   sheets get one instance batch per page (gfx-render.js sprBatch). Single-page sheets behave exactly as before.
   Fallback: any failure (no WebGL2 / Worker / OffscreenCanvas, > 256 colours, semi-transparent pixels, worker error)
   loads that sheet as an RGBA image texture (one page). window.AOM_SPR_PAL = false / AOM_SPR_PAGE = false: A/B. */
const PAGE_MIN = 8 * 1048576, PAGE_ROWS = 1024, PAGE_IDLE = 20;   // texels (8 MB as R8: MVP / boss sheets, the larger class and mount layers; mid-size mob sheets stay one page = one batch)
const SHEET_PAL = { ok: null, workers: [], next: 0, jobs: new Map(), seq: 0, fails: 0 };
function palOn() {
  if (typeof window !== 'undefined' && window.AOM_SPR_PAL === false) return false;
  if (SHEET_PAL.ok !== null) return SHEET_PAL.ok;
  let ok = false;
  try { ok = typeof renderer !== 'undefined' && !!renderer.capabilities && renderer.capabilities.isWebGL2 === true && typeof Worker === 'function' && typeof Blob === 'function' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'; } catch (e) { ok = false; }
  return (SHEET_PAL.ok = ok);
}
const pageOn = () => typeof window === 'undefined' || window.AOM_SPR_PAGE !== false;
// RGBA pixels (canvas readback, rows top-down) -> { w, h, idx (rows bottom-up = flipY), pal (Uint32 RGBA, entry 0 =
// transparent), n } or throws. Runs in the worker (source injected below) and, for harnesses, on the main thread.
// semi (VFX flipbooks, vfx round 7): semi-transparent colours are allowed (the canvas round trip maps each source
// colour to one fixed value, so a <= 128-colour flipbook stays <= 128 entries); fully transparent pixels -> entry 0.
function palIndex(px, w, h, semi) {
  const idx = new Uint8Array(w * h), pal = new Uint32Array(256), seen = new Map();
  let n = 1, lc = 0, li = 0;
  for (let y = 0; y < h; y++) {
    const s = y * w, d = (h - 1 - y) * w;
    for (let x = 0; x < w; x++) {
      const c = px[s + x]; if (c === 0 || (semi && c >>> 24 === 0)) continue;
      if (c !== lc) {
        let i = seen.get(c);
        if (i === undefined) {
          const a = c >>> 24;
          if (a !== 255 && !semi) throw new Error('semi-transparent pixel');   // canvas premultiplication would not round-trip
          if (n >= 256) throw new Error('more than 255 colours');
          i = n++; pal[i] = c; seen.set(c, i);
        }
        lc = c; li = i;
      }
      idx[d + x] = li;
    }
  }
  return { w, h, idx, pal, n };
}
// Worker: PNG bytes -> palIndex result or { err }.
const SHEET_WORKER_SRC = `'use strict';
${palIndex.toString()}
onmessage = async e => {
  const job = e.data.job;
  try {
    if (typeof OffscreenCanvas !== 'function' || typeof createImageBitmap !== 'function') throw new Error('no OffscreenCanvas');
    const bmp = await createImageBitmap(new Blob([e.data.buf], { type: 'image/png' }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    const w = bmp.width, h = bmp.height, cv = new OffscreenCanvas(w, h), g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(bmp, 0, 0); if (bmp.close) bmp.close();
    const r = palIndex(new Uint32Array(g.getImageData(0, 0, w, h).data.buffer), w, h, !!e.data.semi); r.job = job;
    postMessage(r, [r.idx.buffer, r.pal.buffer]);
  } catch (err) { postMessage({ job, err: String(err && err.message || err) }); }
};`;
/* Headless screenshot harnesses (tools/shoot.py: --virtual-time-budget) fast-forward time while no network fetch is
   pending, and Worker decode time is not a fetch: their settle() waits would end before the sheets land. There (headless,
   not the perf harness, or window.AOM_SHEET_SYNC = true) sheets are decoded on the main thread right after the image
   load (same pixels, same indexing); real browsers and tools/perf.py use the worker. */
const SHEET_SYNC = typeof window !== 'undefined' && (window.AOM_SHEET_SYNC === true || (window.AOM_SHEET_SYNC !== false && !window.PERF_CFG && typeof navigator !== 'undefined' && /HeadlessChrome/.test(navigator.userAgent)));
function sheetLoadPalSync(rec, fin) {
  const img = new Image();
  img.onload = () => {
    if (SHEETS.byId[rec.id] !== rec) return fin(new Error('released'));
    try {
      const w = img.naturalWidth, h = img.naturalHeight, c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
      palBuild(rec, palIndex(new Uint32Array(g.getImageData(0, 0, w, h).data.buffer), w, h)); fin();
    } catch (e) { SHEET_PAL.fails++; sheetLoadRGBA(rec, fin); }
  };
  img.onerror = () => fin(new Error(rec.id + '.png failed to load'));
  img.src = SHEET_BASE + rec.id + '.png';
}
function palWorker() {
  if (!SHEET_PAL.workers.length) {
    const url = URL.createObjectURL(new Blob([SHEET_WORKER_SRC], { type: 'text/javascript' }));
    const n = Math.max(1, Math.min(2, ((typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 2) - 1));
    for (let i = 0; i < n; i++) {
      const w = new Worker(url);
      w.onmessage = e => { const J = SHEET_PAL.jobs.get(e.data.job); if (!J) return; SHEET_PAL.jobs.delete(e.data.job); J.done(e.data); };
      // the worker script itself failed (CSP, no worker support): give up on the palette path, reload its jobs as RGBA
      w.onerror = ev => { if (ev && ev.preventDefault) ev.preventDefault(); palDisable(); };
      SHEET_PAL.workers.push(w);
    }
  }
  return SHEET_PAL.workers[SHEET_PAL.next++ % SHEET_PAL.workers.length];
}
function palDisable() {
  SHEET_PAL.ok = false;
  for (const w of SHEET_PAL.workers) try { w.terminate(); } catch (e) { /* gone */ }
  SHEET_PAL.workers.length = 0;
  const jobs = [...SHEET_PAL.jobs.values()]; SHEET_PAL.jobs.clear(); for (const J of jobs) J.done({ err: 'worker failed' });
}
function sheetLoadPal(rec, fin) {
  if (SHEET_SYNC) return sheetLoadPalSync(rec, fin);
  const fallback = why => { SHEET_PAL.fails++; if (typeof console !== 'undefined') console.warn('[sheets] ' + rec.id + ': indexed decode failed (' + why + '), loading RGBA'); sheetLoadRGBA(rec, fin); };
  try {
    const x = new XMLHttpRequest(); x.open('GET', SHEET_BASE + rec.id + '.png', true); x.responseType = 'arraybuffer';
    x.onload = () => {
      if (!((x.status === 200 || x.status === 0) && x.response && x.response.byteLength)) return fin(new Error(rec.id + '.png -> HTTP ' + x.status));
      if (!palOn()) return sheetLoadRGBA(rec, fin);
      let w; try { w = palWorker(); } catch (e) { palDisable(); return sheetLoadRGBA(rec, fin); }
      const job = ++SHEET_PAL.seq;
      SHEET_PAL.jobs.set(job, { done: d => {
        if (d.err) return d.err === 'worker failed' ? sheetLoadRGBA(rec, fin) : fallback(d.err);
        if (SHEETS.byId[rec.id] !== rec) return fin(new Error('released'));
        palBuild(rec, d); fin();
      } });
      w.postMessage({ job, buf: x.response }, [x.response]);
    };
    x.onerror = () => sheetLoadRGBA(rec, fin);   // e.g. file:// without XHR access: the image loader may still work
    x.send();
  } catch (e) { sheetLoadRGBA(rec, fin); }
}
/* Generic indexed decode for other sheet-like textures (vfx round 7: the VFX flipbooks, gfx-render.js "Flipbooks"):
   url -> done({ w, h, idx (rows bottom-up), pal (Uint32Array 256), n }) or done(null, why) when the palette path is off
   or fails (the caller then loads RGBA). Same worker pool / headless main-thread rule as the sprite sheets. */
function palDecodeURL(url, semi, done) {
  if (!palOn()) return done(null, 'off');
  const viaImage = () => {
    const img = new Image();
    img.onload = () => { try { const w = img.naturalWidth, h = img.naturalHeight, c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0); done(palIndex(new Uint32Array(g.getImageData(0, 0, w, h).data.buffer), w, h, semi)); } catch (e) { done(null, String(e && e.message || e)); } };
    img.onerror = () => done(null, 'load'); img.src = url;
  };
  if (SHEET_SYNC) return viaImage();
  try {
    const x = new XMLHttpRequest(); x.open('GET', url, true); x.responseType = 'arraybuffer';
    x.onload = () => {
      if (!((x.status === 200 || x.status === 0) && x.response && x.response.byteLength)) return done(null, 'HTTP ' + x.status);
      if (!palOn()) return done(null, 'off');
      let w; try { w = palWorker(); } catch (e) { palDisable(); return done(null, 'worker'); }
      const job = ++SHEET_PAL.seq;
      SHEET_PAL.jobs.set(job, { done: d => d.err ? done(null, d.err) : done(d) });
      w.postMessage({ job, buf: x.response, semi: !!semi }, [x.response]);
    };
    x.onerror = () => viaImage();
    x.send();
  } catch (e) { done(null, 'xhr'); }
}
function palBuild(rec, d) {
  const pb = new Uint8Array(d.pal.buffer, 0, 1024), alpha = new Uint8Array(256);
  for (let i = 0; i < 256; i++) alpha[i] = pb[i * 4 + 3];
  const t = new THREE.DataTexture(pb, 256, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;   // raw bytes (LinearEncoding): the index map's encoding decodes
  rec.pal = { W: d.w, H: d.h, idx: d.idx, tex: t, alpha, colours: d.n }; rec.texW = d.w; rec.texH = d.h;
}
// Page layout of a ready sheet: [{ y0, h, tex, gpu, used, q }] (see above). One page unless indexed + large.
function sheetPageDefs(rec) {
  const j = rec.json, H = rec.texH, fh = j.frameH, one = [{ y0: 0, h: H, tex: rec.tex || null, gpu: false, used: 0, q: false }];
  // mob sheets only: the player's layers keep every page resident anyway (sheetWantAll keep), so paging them saves nothing
  if (!rec.pal || rec.texW * H < PAGE_MIN || !pageOn() || ((rec.entry && rec.entry.layer) || j.layer) !== 'mob') return one;
  const nd = j.dirs.length; let base = 0;
  for (const a of ['idle', 'walk', 'talk']) {
    if (!sheetHas(j, a)) continue;
    for (let d = 0; d < nd; d++) { const r = sheetRect(j, a, d, 0); if (r) base = Math.max(base, r.y + fh); }
  }
  if (!base || base >= H) return one;
  const P = [{ y0: 0, h: base, tex: null, gpu: false, used: 0, q: false }], per = Math.max(1, Math.floor(PAGE_ROWS / fh)) * fh;
  for (let y = base; y < H; y += per) P.push({ y0: y, h: Math.min(per, H - y), tex: null, gpu: false, used: 0, q: false });
  return P;
}
function sheetPages(rec) { return rec.pages || (rec.pages = [{ y0: 0, h: rec.texH, tex: rec.tex, gpu: false, used: 0, q: false }]); }   // (records made elsewhere, e.g. tools/shoot.js, have one page)
// Page index of a frame whose rect starts at sheet row y.
function sheetPageAt(rec, y) { const P = sheetPages(rec); for (let i = P.length - 1; i > 0; i--) if (y >= P[i].y0) return i; return 0; }
// Texture of page i (created on first use; marks the page used now).
function sheetPageTex(rec, i) {
  const p = sheetPages(rec)[i]; p.used = typeof time !== 'undefined' ? time : 0;
  if (p.tex) return p.tex;
  if (!rec.pal) return (p.tex = rec.tex);
  const X = rec.pal, a = (X.H - p.y0 - p.h) * X.W;
  const t = new THREE.DataTexture(X.idx.subarray(a, a + p.h * X.W), X.W, p.h, THREE.RedFormat, THREE.UnsignedByteType);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.unpackAlignment = 1; t.flipY = false;
  t.onUpdate = () => { p.gpu = true; }; if (typeof sprTexEnc === 'function') sprTexEnc(t); t.needsUpdate = true;
  return (p.tex = t);
}
// Queue every page of a sheet for an idle-time upload (combat prefetch). keep: never page out (the player's layers).
function sheetWantAll(rec, keep) {
  if (keep) rec.keep = true;
  if (rec.allQ || !rec.ok) return; rec.allQ = true;
  const P = sheetPages(rec), t = typeof time !== 'undefined' ? time : 0;
  for (let i = 0; i < P.length; i++) { const p = P[i]; if (!p.gpu) { p.used = t; sheetUpQueue(rec, i); } }
}
// Give back the GPU memory of pages (other than page 0) nothing drew for PAGE_IDLE seconds. Called every ~2 s.
function sheetPagesSweep() {
  if (typeof time === 'undefined') return;
  for (const id in SHEETS.byId) {
    const rec = SHEETS.byId[id], P = rec.pages; if (!P || P.length < 2 || rec.keep) continue;
    for (let i = 1; i < P.length; i++) { const p = P[i]; if (p.gpu && !p.q && time - p.used > PAGE_IDLE) { p.tex.dispose(); p.gpu = false; rec.allQ = false; SHEETS.pagedOut = (SHEETS.pagedOut || 0) + 1; } }
  }
}
// GPU bytes of the sheets (textures three has uploaded): { MB, sheets, pages, rgbaMB, indexMB }.
function sheetsMem() {
  let idx = 0, rgba = 0, n = 0, pg = 0;
  for (const id in SHEETS.byId) {
    const rec = SHEETS.byId[id]; if (!rec.ok) continue; let any = false;
    if (rec.pal) { for (const p of rec.pages || []) if (p.gpu) { idx += rec.texW * p.h; pg++; any = true; } if (any) idx += 1024; }
    else if (rec.tex && (rec.up || rec.upd)) { rgba += rec.texW * rec.texH * 4; pg++; any = true; }
    if (any) n++;
  }
  const MB = b => +(b / 1048576).toFixed(2);
  return { MB: MB(idx + rgba), indexMB: MB(idx), rgbaMB: MB(rgba), sheets: n, pages: pg, loaded: SHEETS.loaded.length, palFails: SHEET_PAL.fails, pagedOut: SHEETS.pagedOut || 0 };
}
SHEETS.mem = sheetsMem;
function sheetId(body, layer, variant) { return SHEETS.byKey[sheetKey(body, layer, variant)] || null; }
// Mob / NPC sheet record by type (hot path: no key string per entity per frame). The id per (layer, body) is cached
// once the index is ready; the record itself is looked up (and reloaded after a release) every call.
const SHEET_IDC = { mob: new Map(), npc: new Map() };
function sheetRecT(body, layer) {
  const C = SHEET_IDC[layer]; let id = C.get(body);
  if (id === undefined) { id = sheetId(body, layer, null); C.set(body, id); }
  return id ? sheetTag(SHEETS.byId[id] || loadSheet(id)) : null;
}
// Load record for (body, layer, variant): starts the load on first call.
// Returns null when the index has no such sheet.
// tag: map id the sheet is wanted for (default: the current map); release (sheetsRelease) keeps the sheets of the
// maps still resident in the world LRU. One compare per call on the hot path.
function sheetRec(body, layer, variant, tag) {
  const id = sheetId(body, layer, variant); if (!id) return null;
  return sheetTag(SHEETS.byId[id] || loadSheet(id), tag);
}
function sheetTag(rec, tag) {
  const t = tag || (typeof map !== 'undefined' && map ? map.id : null);
  if (t && rec.lt !== t) { rec.lt = t; (rec.maps || (rec.maps = new Set())).add(t); }
  return rec;
}
// While a sheet is still loading, an entity shows only its contact blob: the procedural fallback frames (buildFrames:
// every animation frame painted + pixelized) are built only for entities whose sheet is missing or failed. Building
// them for every mob type on a map's first frame was 0.7-2.9 s per warp (perf round 3).
function pendingBlob(e, r) { placeBlob(null, e.x, groundH(e.x, e.y), e.y, r, (e.z || 0) / PXU, true); e.sheetH = 0; return true; }
const recReady = r => !!(r && r.ok);
/* GPU upload in idle time: a mob / NPC sheet is shown (else its contact blob) once its texture has been uploaded by
   renderer.initTexture in an idle callback, one sheet per callback, instead of three uploading every sheet that became
   ready inside the same render. Only sheets an entity actually asks for are uploaded (a map's prefetched boss sheet,
   60 MB, stays CPU-side until its boss appears). The player / companions / Huginn are not gated. */
// Queue entries: rec, page pairs. Page 0 of a sheet sets rec.up (the sheet may be shown); page-0 uploads (entities
// waiting to appear) go before prefetched pages (q1).
const SHEET_UP = { q: [], q1: [], busy: false };
function sheetUpQueue(rec, pg) {
  pg = pg | 0; const p = rec.pages && rec.pages[pg];
  if (pg === 0 ? (rec.up || rec.upQ) : (!p || p.q || p.gpu)) return;
  if (pg === 0) rec.upQ = true; if (p) p.q = true;
  (pg ? SHEET_UP.q1 : SHEET_UP.q).push(rec, pg); sheetUpPump();
}
// Upload the next queued (rec, page): page-0 uploads first. Returns false when the queue is empty.
function sheetUpOne() {
  const Q = SHEET_UP.q.length ? SHEET_UP.q : SHEET_UP.q1, rec = Q.shift(), pg = Q.shift();
  if (!rec) return false;
  const p = rec.pages && rec.pages[pg]; if (p) p.q = false; if (!pg) rec.upQ = false;
  if (rec.ok && SHEETS.byId[rec.id] === rec) {
    try { renderer.initTexture(sheetPageTex(rec, pg)); if (rec.pal) renderer.initTexture(rec.pal.tex); } catch (e) { /* uploads on first draw instead */ }
    if (rec.tex && !rec.pal) rec.upd = true;
  }
  if (!pg) rec.up = true;
  return true;
}
function sheetUpPump() {
  if (SHEET_UP.busy || !(SHEET_UP.q.length || SHEET_UP.q1.length)) return; SHEET_UP.busy = true;
  const idle = typeof requestIdleCallback === 'function' ? f => requestIdleCallback(f, { timeout: 120 }) : f => setTimeout(f, 30);
  idle(() => { SHEET_UP.busy = false; sheetUpOne(); sheetUpPump(); });
}
/* Harnesses only (tools/shoot.js snap): upload everything queued now, synchronously. A harness that steps update() /
   render() in a synchronous loop never yields to requestIdleCallback, so a sheet that finished decoding late in its
   settle() wait was queued by the stepped frames and never uploaded before the capture (the Ashen King in 08_boss: only
   his bar was drawn). Players never need this: the game loop yields every frame and the idle callback (timeout 120 ms)
   runs. Returns the number of uploads. A still-pending idle callback later finds the queue empty and just re-pumps. */
function sheetUpFlush() { let n = 0; while (sheetUpOne()) n++; return n; }
SHEETS.flushUploads = sheetUpFlush;
// GFX.prewarm (gfx-world.js): queue the page-0 uploads of the sheets a neighbour map's prefetch loaded (tag = its id), so
// its monsters and NPCs are on the GPU before the warp. Idle-time, one per callback, like any other upload.
SHEETS.prewarm = id => { let n = 0; for (const k in SHEETS.byId) { const r = SHEETS.byId[k]; if (r.ok && !r.up && r.maps && r.maps.has && r.maps.has(id)) { sheetUpQueue(r, 0); n++; } } return n; };
// True while the index or any requested sheet is still loading (harnesses wait on this before a capture).
SHEETS.busy = () => { if (!SHEETS.indexReady) return true; for (const id in SHEETS.byId) if (!SHEETS.byId[id].done) return true; return false; };
const recShow = r => !!(r && r.ok) && (r.up || (sheetUpQueue(r, 0), false));
const recPending = r => !!(r && !r.done);

/* ---------- Prefetch (current map + player gear) ---------- */
// Mounted look (contract v4): P.mounted truthy and the class has a mount_body sheet. Every layer then comes from the
// mount_* sheets (their frames differ from the on-foot ones); a layer without a mount sheet (e.g. a weapon family the
// mount set does not cover, the shield) is left off while riding rather than drawn in the wrong frame.
// Mount sets borrowed while a class has none of its own (vfx round 7): a riding Rune Jarl uses the Ash Knight's warg sheets
// (knight_<g>.mount_*: same weapons, same warg) until rune_jarl_<g>.mount_* are in an index; its own set wins as soon as
// it is listed (checked on every call, no caching). Keys are class ids, values the class whose mount set is borrowed.
const MOUNT_BORROW = { rune_jarl: 'knight' };
// Body key whose mount_* sheets a player body key rides with: its own, else the borrowed class's, else null.
function mountBody(body) {
  if (sheetId(body, 'mount:body', null)) return body;
  const i = body.lastIndexOf('_'), fb = i > 0 ? MOUNT_BORROW[body.slice(0, i)] : null, alt = fb ? fb + body.slice(i) : null;
  return alt && sheetId(alt, 'mount:body', null) ? alt : null;
}
function playerMountLook(body) { return !!(P && P.mounted) && !!mountBody(body); }
/* ---------- Heroes (squad mode, cycle 8) ----------
   Every hero in the party (design/squad-contract.md: PARTY.members, P = the controlled one) is drawn with the full
   player composite. gfxHeroes() is the party without allocating (PARTY.members, else a reused [P]); PARTY / heroes()
   belong to core (js/squad.js) and are only read here, guarded. Per-hero render state (cached layer wants, mount swap,
   swing trail, dodge puff) lives in HGFX, keyed by hero.id (the hero object itself until core gives ids). */
const _H1 = [null], _H0 = [];
function gfxHeroes() {
  if (typeof PARTY !== 'undefined' && PARTY && PARTY.members && PARTY.members.length) return PARTY.members;
  if (typeof P === 'undefined' || !P) return _H0;
  _H1[0] = P; return _H1;
}
const HGFX = new Map();
function heroState(h) {
  const k = h.id !== undefined && h.id !== null ? h.id : h; let s = HGFX.get(k);
  if (!s || s.h !== h) {
    if (HGFX.size > 24) HGFX.clear();   // dismissed / reloaded heroes: states are cheap to rebuild
    s = { h, w: null, mnt: undefined, mntMap: null, swN: 0, swLast: -1, dodge: false, occ: false, occT: -1 }; HGFX.set(k, s);
  }
  return s;
}
// A hero's stat block: core's heroStats(h) (a lookup of the block core keeps current; S for P), else hero._S.
// The function check is made once (core.js loads before the gfx files).
const heroStatsOf = typeof heroStats === 'function' ? heroStats : (h => h === P ? (typeof S !== 'undefined' ? S : null) : (h._S || h.S || h.stats || null));
// Weapon type of a hero: from its stat block (P: S), else its equipped weapon.
function heroWtype(h) {
  if (h === P) return typeof S !== 'undefined' && S ? S.wtype : undefined;
  const st = heroStatsOf(h); if (st && st.wtype) return st.wtype;
  const w = h.equip && h.equip.weapon, t = w && typeof ITEMS !== 'undefined' ? ITEMS[w.id] : null;
  return (t && t.wtype) || 'fist';
}
// action.js shieldVariant() for any hero: the shield item's `sv`, falling back to whichever sheet the body has.
function heroShieldVariant(h, body) {
  if (h === P && typeof shieldVariant === 'function') return shieldVariant(body);
  const it = h.equip && h.equip.shield; if (!it) return null;
  const want = (typeof ITEMS !== 'undefined' && ITEMS[it.id] && ITEMS[it.id].sv) || 'guard', other = want === 'tower' ? 'guard' : 'tower';
  if (sheetId(body, 'shield', want)) return want;
  return sheetId(body, 'shield', other) ? other : want;
}
// Layer sheets a hero wants: [[body, layer, variant], ...] (body first). Allocates: called only when the hero's look
// changes (heroWants caches it).
function heroLayerWants(h) {
  if (!h) return null;
  const pb = `${h.cls}_${h.gender === 'f' ? 'f' : 'm'}`, mb = h.mounted ? mountBody(pb) : null, wv = WTYPE_VARIANT[heroWtype(h)];
  if (mb) {
    const body = mb, hv = h.hairStyle === 'long' ? 'long' : 'spiky', w = [[body, 'mount:body', null]];
    if (sheetId(body, 'mount:hair', hv)) w.push([body, 'mount:hair', hv]);
    if (h.equip && h.equip.shield) { const sv = heroShieldVariant(h, body) || 'guard'; if (sheetId(body, 'mount:shield', sv)) w.push([body, 'mount:shield', sv]); }
    if (wv && sheetId(body, 'mount:weapon', wv)) w.push([body, 'mount:weapon', wv]);
    const hk = heroHeadgearKey(h); if (hk && sheetId(hk, 'headgear', null)) w.push([hk, 'headgear', null]);
    return w;
  }
  const body = pb, w = [[body, 'body', null], [body, 'hair', h.hairStyle === 'long' ? 'long' : 'spiky']];
  if (h.equip && h.equip.shield) w.push([body, 'shield', heroShieldVariant(h, body) || 'guard']);   // shieldVariant: action.js (Oathkeeper -> 'tower')
  if (wv) w.push([body, 'weapon', wv]);
  const hk = heroHeadgearKey(h); if (hk && sheetId(hk, 'headgear', null)) w.push([hk, 'headgear', null]);
  return w;
}
// The controlled hero's wants (action.js wraps this global to apply its shieldVariant; kept for that hook).
function playerLayerWants() { return P ? heroLayerWants(P) : null; }
// Visual key of the equipped head item (ITEMS[id].headgear, content round 4), or null.
function heroHeadgearKey(h) {
  const it = h && h.equip && h.equip.head, t = it && typeof ITEMS !== 'undefined' ? ITEMS[it.id] : null;
  return (t && t.headgear) || null;
}
function playerHeadgearKey() { return heroHeadgearKey(P); }
/* Cached wants + load records of a hero (hs = heroState(h)). Rebuilt only when what the layers depend on changes
   (class, gender, hair style, mount, weapon type, shield / head item, index generation) or a record was released;
   otherwise no allocation per frame. P's list goes through the global playerLayerWants (action.js hook). */
function heroWants(h, hs) {
  const W = hs.w || (hs.w = { cls: null, g: null, hs: null, mnt: null, wt: null, sh: null, hd: null, gen: -1, want: null, recs: [], ready: [] });
  const eq = h.equip, sh = eq && eq.shield ? eq.shield.id : null, hd = eq && eq.head ? eq.head.id : null, wt = heroWtype(h), mnt = !!h.mounted;
  let stale = W.cls !== h.cls || W.g !== h.gender || W.hs !== h.hairStyle || W.mnt !== mnt || W.wt !== wt || W.sh !== sh || W.hd !== hd || W.gen !== SHEETS.gen;
  if (!stale) for (let i = 0; i < W.recs.length; i++) { const r = W.recs[i]; if (r && SHEETS.byId[r.id] !== r) { stale = true; break; } }
  if (stale) {
    W.cls = h.cls; W.g = h.gender; W.hs = h.hairStyle; W.mnt = mnt; W.wt = wt; W.sh = sh; W.hd = hd; W.gen = SHEETS.gen;
    W.want = SHEETS.indexReady ? (h === P ? playerLayerWants() : heroLayerWants(h)) : null; W.recs.length = 0;
    if (W.want) for (const w of W.want) W.recs.push(sheetRec(w[0], w[1], w[2]));
  }
  return W;
}
const hasHeadAnchors = j => !!(j && j.anchors && j.anchors.head);
function prefetchSheets() {
  if (!SHEETS.indexReady) return;
  try {
    const H = gfxHeroes();
    for (let i = 0; i < H.length; i++) {
      const pw = H[i] === P ? playerLayerWants() : heroLayerWants(H[i]); if (pw && sheetId(pw[0][0], 'body', null)) for (const w of pw) sheetRec(w[0], w[1], w[2]);
      if (H[i].cls === 'wolfhunter' || H[i].cls === 'fenris_stalker') huginnRec();   // Blitz Beat's raven (small sheet)
    }
    for (const c of compList()) compRec(c);
    if (typeof map === 'undefined' || !map) return;
    prefetchMapSheets(map, mobs, null);
  } catch (e) { /* prefetch is best-effort */ }
}
// Sheets of a map (current, or a neighbour from GFX.prefetchHooks with its generated map object): its mob types
// (with summons) and NPCs. tag = map id for the release bookkeeping.
function prefetchMapSheets(M, live, tag) {
  {
    // Generic over map data (no map list): every MOBS key the map definition names — spawns ([type, n] rows in any
    // array field), boss / bosses, plain type strings — plus live mobs, closed over summons (abil.mob, transitively).
    const types = new Set(), isMob = t => typeof t === 'string' && typeof MOBS !== 'undefined' && !!MOBS[t];
    for (const k in M.d) {
      const v = M.d[k];
      if (isMob(v)) types.add(v);
      else if (Array.isArray(v)) for (const r of v) { if (isMob(r)) types.add(r); else if (Array.isArray(r) && isMob(r[0])) types.add(r[0]); else if (r && isMob(r.type)) types.add(r.type); }
    }
    for (const m of live || []) types.add(m.type);
    for (const t of types) for (const a of (MOBS[t] && MOBS[t].abil) || []) if (a.mob) types.add(a.mob);   // Set iteration visits added summons too
    for (const t of types) sheetRec(t, 'mob', null, tag);
    for (const n of M.npcs || []) sheetRec(n.id, 'npc', null, tag);
  }
}
/* ---------- Neighbour prefetch + release (perf round 3 hooks in gfx-world.js) ----------
   GFX.prefetchHooks: in idle time after a map is entered, gfx-world generates each neighbour map; its sheets start
   loading then (JSON + PNG decode; the GPU upload still happens on first draw). GFX.worldHooks: when the world LRU
   frees a map, every loaded sheet that no resident map, no prefetched neighbour and not the player / companions need is
   released (texture disposed, its sprite batch removed); sheetRec reloads it on demand. */
const SHEET_NEAR = { map: null, ids: new Set() };
function sheetsPrefetchNeighbour(id, m) {
  if (!SHEETS.indexReady || !m || !m.d) return;
  if (SHEET_NEAR.map !== map) { SHEET_NEAR.map = map; SHEET_NEAR.ids.clear(); }
  SHEET_NEAR.ids.add(id); prefetchMapSheets(m, null, id);
}
function sheetsRelease(freedId, resident) {
  const keepMaps = new Set(resident || []); if (typeof map !== 'undefined' && map) keepMaps.add(map.id);
  if (SHEET_NEAR.map === map) for (const id of SHEET_NEAR.ids) keepMaps.add(id);
  const keep = new Set();
  const H = gfxHeroes();
  for (let i = 0; i < H.length; i++) {   // every hero of the party: its layers + the on-foot and mount sets of its class (or the one it borrows)
    const h = H[i], want = h === P ? playerLayerWants() : heroLayerWants(h); if (want) for (const w of want) { const id = sheetId(w[0], w[1], w[2]); if (id) keep.add(id); }
    const b = `${h.cls}_${h.gender === 'f' ? 'f' : 'm'}`, mb = mountBody(b); for (const k in SHEETS.byId) if (k.indexOf(b + '.') === 0 || (mb && mb !== b && k.indexOf(mb + '.mount_') === 0)) keep.add(k);
  }
  for (const c of compList()) if (c && c._gid) keep.add(c._gid);
  keep.add('pet_huginn');
  let n = 0;
  for (const id in SHEETS.byId) {
    const rec = SHEETS.byId[id]; if (!rec.done || keep.has(id)) continue;
    let used = false; if (rec.maps) for (const t of rec.maps) if (keepMaps.has(t)) { used = true; break; }
    if (used) continue;
    let live = false; VIS.forEach(v => { if (!live && v.recs && v.recs.indexOf(rec) >= 0) live = true; }); if (live) continue;
    if (rec.batches && typeof ibDrop === 'function') for (const B of rec.batches.slice()) if (B) ibDrop(B);
    if (rec.tex) rec.tex.dispose();
    if (rec.pages) for (const p of rec.pages) if (p.tex && p.tex !== rec.tex) p.tex.dispose();
    if (rec.pal) rec.pal.tex.dispose();
    delete SHEETS.byId[id]; const i = SHEETS.loaded.indexOf(id); if (i >= 0) SHEETS.loaded.splice(i, 1); n++;
  }
  SHEETS.released = (SHEETS.released || 0) + n;
}
if (typeof GFX !== 'undefined' && GFX) {
  if (Array.isArray(GFX.prefetchHooks)) GFX.prefetchHooks.push(sheetsPrefetchNeighbour);
  if (Array.isArray(GFX.worldHooks)) GFX.worldHooks.push(sheetsRelease);
}

/* ---------- Frame math ---------- */
function sheetHas(json, a) { return !!(json.actions && json.actions[a] && json.actions[a].frames > 0 && !(json._bad && json._bad[a])); }
// Pixel rect of frame f of `action` in sheet direction index d (index into json.dirs). out: optional rect to fill.
function sheetRect(json, action, d, f, out) {
  const a = json.actions[action]; if (!a) return null;
  const fw = json.frameW, fh = json.frameH, n = Math.max(1, a.frames | 0), nd = json.dirs.length;
  f = Math.max(0, Math.min(n - 1, f | 0)); d = Math.max(0, Math.min(nd - 1, d | 0));
  const r = out || { x: 0, y: 0, w: 0, h: 0 }; r.w = fw; r.h = fh;
  if (json.layout === 'blocks' || json.layout === 'dir-blocks') {
    const bpr = json.layout === 'blocks' ? Math.max(1, json.blocksPerRow | 0 || nd) : nd, mf = json.maxFrames || n;
    const block = a.row * nd + d, bx = block % bpr, by = Math.floor(block / bpr);
    r.x = (bx * mf + f) * fw; r.y = by * fh; return r;
  }
  r.x = f * fw; r.y = (a.row + d) * fh; return r;
}
// Same rect as texture UVs (flipY: v=1 is the top of the image).
function sheetUV(rect, texW, texH) { return { u0: rect.x / texW, u1: (rect.x + rect.w) / texW, v0: 1 - (rect.y + rect.h) / texH, v1: 1 - rect.y / texH }; }

// 8-way facing relative to the camera. Returns sector -4..4 (0 = S toward camera,
// +2 = E / screen right, +-4 = N). prev gives hysteresis so the facing does not flicker.
const SHEET_DIR8 = ['S', 'SE', 'E', 'NE', 'N'];
function facingSector(fx, fy, yaw, prev) {
  const same = typeof SPRF !== 'undefined' && SPRF.yaw === yaw, cy = same ? SPRF.cy : Math.cos(yaw), sy = same ? SPRF.sy : Math.sin(yaw);   // (syncEntities caches the camera yaw's cos / sin)
  const rx = cy, ry = -sy, fwx = -sy, fwy = -cy;
  const sr = fx * rx + fy * ry, sf = fx * fwx + fy * fwy;
  if (Math.abs(sr) + Math.abs(sf) < 1e-6) return prev === undefined ? 0 : prev;
  const a = Math.atan2(sr, -sf), step = Math.PI / 4;
  if (prev !== undefined) { let da = a - prev * step; da = Math.atan2(Math.sin(da), Math.cos(da)); if (Math.abs(da) < step * 0.5 + 0.12) return prev; }
  let s = Math.round(a / step); if (s === -4) s = 4; return s;
}
// Returns a shared scratch object (read it before the next call).
const SHEET_MIRROR = ['', 'SW', 'W', 'NW'], _DIR = { d: 0, flip: false, name: 'S' };
function sectorToDir(json, s) {
  const name = SHEET_DIR8[Math.abs(s)], d = json.dirs.indexOf(name);
  _DIR.d = d < 0 ? 0 : d; _DIR.flip = s < 0 && s > -4; _DIR.name = s < 0 && s > -4 ? SHEET_MIRROR[-s] : name; return _DIR;
}
// Clamp/loop a frame index for an action; missing action -> idle. Returns a shared scratch object (read it at once).
const _SF = { act: 'idle', f: 0 };
function sheetFrame(json, act, f, phase) {
  if (!sheetHas(json, act)) { act = 'idle'; if (!sheetHas(json, 'idle')) return null; f = Math.floor(time * (json.actions.idle.fps || 6) + (phase || 0)); }
  const a = json.actions[act], n = a.frames | 0;
  _SF.f = a.loop ? ((f % n) + n) % n : Math.max(0, Math.min(n - 1, f | 0)); _SF.act = act;
  return _SF;
}
// Pose helpers (no per-call closures): frame count / fps of an action, frames since an action started.
const actN = (A, a) => (A[a] ? A[a].frames : 1), actFps = (A, a) => (A[a] && A[a].fps) || 8;
function actHeld(v, A, a) { if (v.act !== a) { v.act = a; v.actT = time; } return Math.floor((time - v.actT) * actFps(A, a)); }
const TINT_ONE = [1, 1, 1], TINT_DODGE = [0.85, 0.9, 1], TINT_CHARGE = [1.0, 0.85, 0.5], TINT_FROZEN = [0.55, 0.8, 1];

/* ---------- Player pose -> action/frame ---------- */
function sheetPlayerPose(v, body, h) {
  if (!h) h = P;
  const A = body.actions;   // (no helper closures: this runs per hero per frame)
  let act = 'idle', f = 0, tint;
  // heavy swing: remember the charge so the release plays the heavy strike, not a light one
  if (h.charge >= 0) v.heavyArm = true;
  else if (!(h.atkAnim >= 0) && v.heavyArm && !v.heavySwing) v.heavyArm = false;
  if (h.atkAnim >= 0 && v.heavyArm) { v.heavySwing = true; v.heavyArm = false; }
  if (!(h.atkAnim >= 0)) v.heavySwing = false;
  if (h.atkAnim >= 0 && v.lastAtk < 0 && !v.heavySwing) v.swings++;
  v.lastAtk = h.atkAnim >= 0 ? h.atkAnim : -1;
  if (h.atkAnim >= 0 || h.charge >= 0 || h.blocking) v.combatT = time;
  const pk = time - (h.pickupAt === undefined ? -99 : h.pickupAt);

  if (h.dead) { act = 'dead'; f = actHeld(v, A, 'dead'); }
  else if (h.dodgeT > 0) { act = 'dodge'; f = Math.floor((1 - h.dodgeT / 0.34) * actN(A, 'dodge')); tint = TINT_DODGE; }
  else if (h.charge >= 0) { act = 'heavy'; f = Math.min(1, Math.floor(h.charge / 0.8 * 2)); if (h.charge >= 0.8 && Math.floor(time * 12) % 2) tint = TINT_CHARGE; }
  else if (v.heavySwing) { act = 'heavy'; const k = actN(A, 'heavy'), s0 = Math.min(2, k - 1); f = s0 + Math.floor(h.atkAnim * (k - s0)); }
  else if (h.blocking) { act = 'block'; f = actHeld(v, A, 'block'); }
  else if (h.casting) { act = 'cast'; f = Math.floor(time * actFps(A, 'cast')) % actN(A, 'cast'); }
  else if (h.atkAnim >= 0) { const c = h.combo > 0 ? h.combo : v.swings; act = c % 2 === 0 ? 'attack2' : 'attack1'; f = Math.floor(h.atkAnim * actN(A, act)); }
  else if (h.hurtT > 0.12) { act = 'hurt'; f = actHeld(v, A, 'hurt'); }
  else if (pk >= 0 && pk < 0.3 && sheetHas(body, 'pickup')) { act = 'pickup'; f = Math.floor(pk / 0.3 * actN(A, 'pickup')); }
  else if (h.sitting) { act = 'sit'; f = 0; }
  else if (h.moving) { act = 'walk'; f = Math.floor(h.walk * 1.26 * actN(A, 'walk') / 6 * (v.stride || 1)) % actN(A, 'walk'); }
  else if (sheetHas(body, 'stance') && time - (v.combatT || -99) < 2) { act = 'stance'; f = Math.floor(time * actFps(A, 'stance')) % actN(A, 'stance'); }
  else { act = 'idle'; f = Math.floor(time * actFps(A, 'idle')) % actN(A, 'idle'); }
  const r = sheetFrame(body, act, f), ra = r ? r.act : 'idle', rf = r ? r.f : 0;
  if (v.act !== ra) { v.act = ra; v.actT = time; }
  const o = v.pose || (v.pose = { act: 'idle', f: 0, tint: undefined, opacity: undefined }); o.act = ra; o.f = rf; o.tint = tint; return o;
}

/* ---------- Mob pose ---------- */
function activeTele(m) { if (typeof teles === 'undefined') return null; for (const t of teles) if (t.m === m) return t; return null; }
// Returns v.pose (reused per entity).
function sheetMobPose(m, v, J) {
  const A = J.actions, ph = (m.id % 7) * 0.37;
  let act, f, tint, opacity, t;
  if (m.dead) { act = 'dead'; f = Math.floor((m.deathT || 0) * actFps(A, 'dead')); }   // death: pixel dissolve (sprFrame), not a fade
  else if (m.frozen > 0) { act = 'hurt'; f = 0; tint = TINT_FROZEN; }
  else if (m.hitFlash > 0 || m.stun > 0) { act = 'hurt'; f = actHeld(v, A, 'hurt'); }   // hit: white flash + squash (sprFrame)
  else if (m.atkAnim >= 0) { act = 'attack'; f = Math.floor(m.atkAnim * actN(A, 'attack')); }
  else if (m.leap) { act = 'walk'; f = Math.floor(time * actFps(A, 'walk') * 1.5); }
  else if (m.d.boss && (t = activeTele(m))) { act = sheetHas(J, 'skill') ? 'skill' : 'attack'; f = Math.floor(clamp(t.t / t.dur, 0, 0.999) * actN(A, act)); }
  else if (m.moving) { act = 'walk'; f = Math.floor(m.walk * 1.26 * actN(A, 'walk') / 6); }
  else { act = 'idle'; f = Math.floor(time * actFps(A, 'idle') + ph); }
  const r = sheetFrame(J, act, f, ph); if (!r) return null;
  if (v.act !== r.act) { v.act = r.act; v.actT = time; }
  const o = v.pose || (v.pose = { act: 'idle', f: 0, tint: undefined, opacity: undefined }); o.act = r.act; o.f = r.f; o.tint = tint; o.opacity = opacity; return o;
}

/* ---------- Visual ---------- */
function sheetPlane(json) {
  const fw = json.frameW / PXU, fh = json.frameH / PXU, ax = json.anchor[0] / PXU, ay = json.anchor[1] / PXU;
  // anchor (feet) at the origin: mirroring with scale.x = -1 flips around the feet
  return new THREE.PlaneGeometry(fw, fh).translate(fw / 2 - ax, ay - fh / 2, 0);
}
const layerOf = r => (r.entry && r.entry.layer) || r.json.layer || 'body';
// recs: ready load records (draw order sorted by layer). o.xray: player x-ray silhouette. o.glow: glow colour.
// o.noCast: no sun shadow (ghosts).
// o.batch (single-layer mob/NPC sheets): the layer is one instance of the sheet's shared InstancedMesh
//   (sprBatch in gfx-render.js: one draw + one shadow draw per sheet, whatever the number of entities);
//   frame UVs, tint, flash, rim, dissolve and the sun-facing caster are per-instance data. No meshes of its own.
// Otherwise each layer gets its own mesh + a sun-facing shadow caster sharing its geometry (and so its frame UVs).
// Contact blobs are instances of one shared mesh for every entity (placeBlob).
function makeSheetVis(recs, o = {}) {
  const v = { sheet: true, recs: recs.slice(), batched: !!o.batch, layers: [], meshes: [], swings: 0, lastAtk: -1, act: null, actT: 0, sector: undefined };
  const sorted = recs.slice().sort((a, b) => LAYER_ORDER.indexOf(a.json.layer || (a.entry && a.entry.layer) || 'body') - LAYER_ORDER.indexOf(b.json.layer || (b.entry && b.entry.layer) || 'body'));
  // layers share one transform; creation order = draw order (same depth, LessEqual)
  for (const rec of sorted) {
    const layer = layerOf(rec), base = { id: rec.id, rec, layer, rk: -1, ry: -1, pg: 0, r: { x: 0, y: 0, w: 0, h: 0 }, uv: [0, 0, 1, 1], on: false, geo: null, mat: null, mesh: null, xray: null, caster: null, fa: 'idle', ff: 0 };
    if (o.batch) { v.layers.push(base); continue; }
    const tex = sheetPageTex(rec, 0);
    const hair = layer === 'hair', hat = layer === 'headgear';
    // Headgear: the plane's 4 vertices are rewritten every frame (anchor offset + head roll), so its mesh keeps the
    // body's transform (same sort depth as the other layers: creation order = draw order) and the sun caster and
    // the x-ray, which share the geometry, follow the hat exactly.
    const geo = hat ? new THREE.PlaneGeometry(1, 1) : sheetPlane(rec.json);
    if (hat) geo.attributes.position.setUsage(THREE.DynamicDrawUsage);
    const mat = fxSpriteMat(tex, hair, rec); const mesh = new THREE.Mesh(geo, mat); scene.add(mesh);
    const L = Object.assign(base, { geo, uv0: geo.attributes.uv.array.slice(), mat, mesh });
    // hair: clip line uniform shared by the colour, x-ray and caster materials (hideHair 'top')
    if (hair) L.clipU = mat.userData.u.uClip;
    if (!o.noCast) { L.caster = makeCaster(geo, tex, rec); if (hair) hairClipPatch(L.caster.customDepthMaterial, L.clipU); v.meshes.push(L.caster); }
    if (o.xray) {
      const xm = sprPalMat(spriteMat(tex, { color: 0x4a70d0, opacity: 0.5, depthWrite: false, depthFunc: THREE.GreaterDepth,
        // stencil: each covered pixel is tinted once even where layers overlap
        stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc, stencilZPass: THREE.ReplaceStencilOp }), rec);
      if (hair) hairClipPatch(xm, L.clipU);
      L.xray = new THREE.Mesh(geo, xm); L.xray.renderOrder = 5; scene.add(L.xray); v.meshes.push(L.xray);
    }
    layerPage(L, 0);
    v.layers.push(L); v.meshes.push(mesh);
  }
  if (o.glow) { v.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, color: new THREE.Color(o.glow), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 })); scene.add(v.glow); v.meshes.push(v.glow); }
  v.dispose = () => { for (const m of v.meshes) disposeMesh(m); for (const L of v.layers) if (L.geo) L.geo.dispose(); };
  return v;
}
// Point a layer's own materials (colour, sun caster, x-ray) at page pi of its sheet.
function layerPage(L, pi) {
  const rec = L.rec, p = sheetPages(rec)[pi], t = sheetPageTex(rec, pi); L.pg = pi;
  sprMapSet(L.mat, t); const u = L.mat.userData.u; if (u && u.uTexOff) u.uTexOff.value.set(0, rec.texH - p.y0 - p.h);
  if (L.caster) L.caster.customDepthMaterial.map = t;
  if (L.xray) L.xray.material.map = t;
}
// Select frame f of `act` (direction d) on a layer. The UV rect is recomputed only when the frame changes; UVs are
// relative to the frame's page (the whole sheet when it has one page).
function setLayerFrame(L, act, d, f) {
  const rec = L.rec, j = rec.json, r0 = sheetFrame(j, act, f);
  if (!r0) { L.on = false; if (L.mesh) L.mesh.visible = false; return null; }
  const r = sheetRect(j, r0.act, d, r0.f, L.r);
  L.fa = r0.act; L.ff = r0.f; L.on = true; if (L.mesh) L.mesh.visible = true;
  if (L.rk !== r.x || L.ry !== r.y) {
    L.rk = r.x; L.ry = r.y;
    const P = sheetPages(rec), pi = P.length > 1 ? sheetPageAt(rec, r.y) : 0, pg = P[pi];
    if (pi !== L.pg && L.mat) layerPage(L, pi); else L.pg = pi;
    const y = r.y - pg.y0, tw = rec.texW, th = pg.h, u0 = r.x / tw, u1 = (r.x + r.w) / tw, v0 = 1 - (y + r.h) / th, v1 = 1 - y / th;
    L.uv[0] = u0; L.uv[1] = v0; L.uv[2] = u1; L.uv[3] = v1;
    if (L.geo) {
      const a = L.geo.attributes.uv, s = a.array, o = L.uv0;
      for (let i = 0; i < s.length; i += 2) { s[i] = u0 + o[i] * (u1 - u0); s[i + 1] = v0 + o[i + 1] * (v1 - v0); }
      a.needsUpdate = true;
      const u = L.mat.userData.u; if (u) u.uFrameV.value.set(v0, v1);
    }
  }
  return r;
}
// Place all layers of a sheet vis at entity e with look st (see sprFrame).
// Returns a shared scratch { rect (first layer's rect), gh, z }: read it before the next call.
const _PL = { rect: null, gh: 0, z: 0 };
function placeSheetVis(v, e, act, d, f, flip, st, hairHex) {
  const gh = groundH(e.x, e.y), z = (e.z || 0) / PXU + st.zoff, sx = flip ? -1 : 1, k = st.scl || 1;
  let rect = null, body = null, hat = null, hair = null;
  for (const L of v.layers) {
    let r;
    if (L.layer === 'headgear') { hat = L; r = body ? placeHat(L, body, v.sector) : null; if (!r) { L.on = false; L.mesh.visible = false; } }
    else { r = setLayerFrame(L, act, d, f); if (!body) body = L; if (L.layer === 'hair') hair = L; }
    if (!rect) rect = r;
    if (v.batched) { if (r) sprInstance(L, e.x, gh + z, e.y, sx, st, flip); continue; }
    if (L.pg) L.rec.pages[L.pg].used = time;
    L.mesh.scale.set(sx * st.sx * k, st.sy * k / COSP, 1); L.mesh.position.set(e.x, gh + z, e.y); L.mesh.rotation.y = cam.yaw;
    if (L.layer === 'hair') applyHairRamp(L.mat, hairHex);
    sprApply(L.mat, st, flip);
  }
  if (hair && !v.batched) hatHair(hair, hat);
  if (!v.batched) for (const L of v.layers) {
    if (L.caster) { L.caster.visible = L.mesh.visible && st.cast && st.a > 0.3; if (L.caster.visible) { L.caster.scale.set(sx * k, CAST_H * k, 1); L.caster.position.set(e.x, gh + z, e.y); L.caster.rotation.y = SPRF.cyaw; } }
    if (L.xray) { L.xray.scale.copy(L.mesh.scale); L.xray.position.copy(L.mesh.position); L.xray.rotation.y = cam.yaw; L.xray.visible = L.mesh.visible && !e.dead && v.xrayOn !== false; }   // (xrayOn: allies only when something may hide them)
  }
  _PL.rect = rect; _PL.gh = gh; _PL.z = z; return _PL;
}

/* ---------- Headgear (contract v3) ----------
   The hat frame (hat json dirs, unmirrored facing: mirroring the whole plane mirrors the composite, as art's
   hglib.composite does) is placed so its `anchor` lands on the body frame's head anchor, rotated clockwise by
   `rot` degrees about it. Vertices are in the body plane's local units (feet at the origin, y up); the mesh then
   gets the body's scale (mirror, squash, 1/COSP stretch), so the hat shears exactly like the composited image. */
function headAnchor(bodyL) {
  const j = bodyL.rec.json, H = j.anchors && j.anchors.head; if (!H) return null;
  const A = H[bodyL.fa] || (j.actions[bodyL.fa] && H[j.actions[bodyL.fa].alias]), D = A && A[_hatD];   // alias rows (mount sit/pickup/stance)
  return D ? D[Math.max(0, Math.min(D.length - 1, bodyL.ff | 0))] : null;
}
let _hatD = 0;
function placeHat(L, bodyL, sector) {
  const bj = bodyL.rec.json, hj = L.rec.json;
  _hatD = sectorToDir(bj, sector === undefined ? 0 : sector).d;                  // body facing (unmirrored)
  const ha = headAnchor(bodyL); L.head = ha; if (!ha || !ha[3]) return null;
  const hd = sectorToDir(hj, sector === undefined ? 0 : sector).d; L.hd = hd;
  const r = setLayerFrame(L, 'idle', hd, 0); if (!r) return null;
  const rot = ha[2] * Math.PI / 180, c = Math.cos(rot), s = Math.sin(rot);
  const ax = hj.anchor[0], ay = hj.anchor[1], fw = hj.frameW, fh = hj.frameH;
  const hx = ha[0] - bj.anchor[0], hy = bj.anchor[1] - ha[1];                    // head point, body px, y up
  const pos = L.geo.attributes.position, a = pos.array;
  // PlaneGeometry vertex order: TL, TR, BL, BR (uv0 keeps the matching 0/1 UVs)
  for (let i = 0; i < 4; i++) {
    const px = (i & 1 ? fw : 0) - ax, py = ay - (i & 2 ? fh : 0);                // hat px relative to its anchor, y up
    a[i * 3] = (hx + px * c + py * s) / PXU; a[i * 3 + 1] = (hy - px * s + py * c) / PXU; a[i * 3 + 2] = 0;   // clockwise roll
  }
  pos.needsUpdate = true; L.geo.boundingSphere = null;
  return r;
}
// Hero batch variant (gfx-render.js HB): the same hat frame selection, but the placement is returned as a 2D affine of
// a unit plane (u, v in -0.5..0.5) into the body plane, world units: X = a u + b v + tx, Y = c u + d v + ty (in _HAT).
const _HAT = { a: 0, b: 0, c: 0, d: 0, tx: 0, ty: 0 };
function hatAffine(L, bodyL, sector) {
  const bj = bodyL.rec.json, hj = L.rec.json;
  _hatD = sectorToDir(bj, sector === undefined ? 0 : sector).d;
  const ha = headAnchor(bodyL); L.head = ha; if (!ha || !ha[3]) return null;
  const hd = sectorToDir(hj, sector === undefined ? 0 : sector).d; L.hd = hd;
  const r = setLayerFrame(L, 'idle', hd, 0); if (!r) return null;
  const rot = ha[2] * Math.PI / 180, c = Math.cos(rot), s = Math.sin(rot);
  const ax = hj.anchor[0], ay = hj.anchor[1], fw = hj.frameW, fh = hj.frameH;
  const hx = ha[0] - bj.anchor[0], hy = bj.anchor[1] - ha[1], px0 = fw * 0.5 - ax, py0 = ay - fh * 0.5;   // (placeHat: px = fw (u + .5) - ax, py = fh (v + .5) + ay - fh)
  _HAT.a = c * fw / PXU; _HAT.b = s * fh / PXU; _HAT.c = -s * fw / PXU; _HAT.d = c * fh / PXU;
  _HAT.tx = (hx + px0 * c + py0 * s) / PXU; _HAT.ty = (hy - px0 * s + py0 * c) / PXU;
  return r;
}
// hideHair: 'all' hides the hair layer; 'top' drops hair pixels beyond the hat's hairClip line (hglib.hair_clip_line),
// expressed as a plane in the hair layer's atlas UVs: keep where dot(vec3(uv, 1), uClip) >= 0.
// hatClip: 0 = no clip, 1 = clip plane in _CLIP, 2 = hide the hair (shared by the mesh path and the hero batch).
const _CLIP = [0, 0, 1];
function hatClip(hair, hat) {
  const on = hat && hat.on && hat.head, hj = on ? hat.rec.json : null, mode = hj ? hj.hideHair || 'none' : 'none';
  if (mode === 'all') return 2;
  const clip = mode === 'top' && hj.hairClip ? hj.hairClip[hat.hd === undefined ? 0 : hat.hd] : undefined;
  if (clip === undefined) return 0;
  const ha = hat.head, rot = ha[2] * Math.PI / 180, dy = clip - hj.anchor[1];
  const px = ha[0] - Math.sin(rot) * dy, py = ha[1] + Math.cos(rot) * dy, nx = -Math.sin(rot), ny = Math.cos(rot);   // frame px, y down
  const pg = sheetPages(hair.rec)[hair.pg], tw = hair.rec.texW, th = pg.h, rx = hair.r.x, ry = hair.r.y - pg.y0;   // page-relative
  // pixel x = u*tw - rx, pixel y = (1 - v)*th - ry
  _CLIP[0] = tw * nx; _CLIP[1] = -th * ny; _CLIP[2] = (-rx - px) * nx + (th - ry - py) * ny;
  return 1;
}
function hatHair(hair, hat) {
  const U = hair.clipU, m = hatClip(hair, hat);
  if (m === 2) { hair.on = false; hair.mesh.visible = false; if (U) U.value.set(0, 0, 1); return; }
  if (!U) return;
  if (m === 0) U.value.set(0, 0, 1); else U.value.set(_CLIP[0], _CLIP[1], _CLIP[2]);
}
function sameRecs(a, b) { if (!a || a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }
function setVis(e, recs, o) {
  let v = VIS.get(e); if (!v || !v.sheet || !sameRecs(v.recs, recs)) { if (v) disposeVis(v); v = makeSheetVis(recs, o); VIS.set(e, v); }
  v.seen = frameNo; return v;
}
// Single-sheet variant for mobs/NPCs: no per-frame array or options allocation.
const _REC1 = [null];
// Bosses keep their own meshes: one entity gains nothing from batching, and they stay in the per-object
// transparent sort (big hazes / heat volumes around boss arenas composite exactly as before).
function setVis1(e, rec, glow, noCast) {
  let v = VIS.get(e);
  if (!v || !v.sheet || v.recs.length !== 1 || v.recs[0] !== rec) {
    if (v) disposeVis(v); _REC1[0] = rec;
    v = makeSheetVis(_REC1, { glow, noCast, batch: !noCast && !(e.d && e.d.boss) && sprBatchOn() }); VIS.set(e, v);
  }
  v.seen = frameNo; return v;
}

/* ---------- Player / heroes ---------- */
// Ready layer records for a hero, or null (procedural). While a wanted layer is still loading, keep the current sheet
// vis (or the procedural sprite) so nothing pops in half-dressed. W = heroWants(h, hs); the returned array is W.ready
// (reused: no allocation per frame).
function heroSheetRecs(W, v) {
  if (!W.want || !SHEETS.indexReady) return null;
  const recs = W.recs, keep = v && v.sheet && v.pRecs ? v.pRecs : null;
  if (!recReady(recs[0])) return recPending(recs[0]) ? keep : null;
  for (let i = 0; i < recs.length; i++) if (recPending(recs[i])) return keep;
  const bj = recs[0].json, R = W.ready; R.length = 0;   // a hat needs the body's head anchors (contract v3); without them it is left off
  for (let i = 0; i < recs.length; i++) { const r = recs[i]; if (recReady(r) && (layerOf(r) !== 'headgear' || hasHeadAnchors(bj))) R.push(r); }
  return R;
}
function playerSheetRecs() { if (!P) return null; const hs = heroState(P); return heroSheetRecs(heroWants(P, hs), VIS.get(P)); }
// Mount / dismount: a dust puff at the swap (the new layer set appears once all its sheets have loaded) and the
// squash-and-stretch wobble of sprFrame, so the rider does not just pop. Map changes and the first frame stay quiet.
// Per hero (hs = heroState(h)): each rider of the party puffs on its own.
function mountSwap(v, mnt, h, hs) {
  if (!h) { h = P; hs = heroState(P); }
  const same = hs.mntMap === map; if (same && hs.mnt !== undefined && hs.mnt !== mnt && typeof PFX !== 'undefined') {
    const gh = groundH(h.x, h.y); v.sqT = time;
    PFX.dust(h.x, gh, h.y, 16, 1.9); PFX.dust(h.x + (h.fx || 0) * 0.5, gh, h.y + (h.fy || 0) * 0.5, 8, 1.2); PFX.dust(h.x - (h.fx || 0) * 0.5, gh, h.y - (h.fy || 0) * 0.5, 8, 1.2);
    if (typeof VFX !== 'undefined' && VFX.flip) VFX.flip('impact_dust', h.x, h.y, gh, { sc: 1.25, a: 0.9 });   // the flipbook puff (vfx round 7)
  }
  hs.mnt = mnt; hs.mntMap = map;
}
function usingSheetPlayer() { return !!(P && playerSheetRecs()); }
const PLAYER_VIS_OPT = { xray: true }, HERO_HB_OPT = { batch: true };
// Tall tiles between a hero and the camera (houses, walls, trees, pillars, props) within ~3.5 tiles: only then does an
// ally draw its x-ray silhouette (the controlled hero always has it). A few tile reads per ally per frame.
function heroOccluded(h) {
  if (typeof map === 'undefined' || !map || !map.t || typeof T === 'undefined' || !T) return true;
  const t = map.t, w = map.w, hh = map.h, fx = Math.sin(cam.yaw), fy = Math.cos(cam.yaw), rx = SPRF.rx, ry = SPRF.ry;
  for (let k = 1; k <= 7; k++) {
    const d = k * 0.5;
    for (let s = -1; s <= 1; s++) {
      const xi = Math.floor(h.x + fx * d + rx * s * 0.4), yi = Math.floor(h.y + fy * d + ry * s * 0.4); if (xi < 0 || yi < 0 || xi >= w || yi >= hh) continue;
      const q = t[yi * w + xi];
      if (q === T.WALL || q === T.TREE || q === T.RUIN || q === T.PILLAR || q === T.WAY || q === T.HEART || (T.PROP !== undefined && q === T.PROP) || (T.CRYSTAL !== undefined && q === T.CRYSTAL)) return true;
    }
  }
  return false;
}
// Vis state carried over when a swap moves a hero between the layered path and the hero batch, so facing, light,
// squash and the attack alternation do not pop.
function heroVisCarry(v, v0) {
  if (!v0 || !v0.sheet) return;
  v.sector = v0.sector; v.lt = v0.lt; v.sqT = v0.sqT; v.lastHF = v0.lastHF; v.swings = v0.swings; v.lastAtk = v0.lastAtk; v.combatT = v0.combatT; v.heavyArm = v0.heavyArm; v.heavySwing = v0.heavySwing; v.step = v0.step;
}
// Hero batch eligibility (gfx-render.js HB): every layer indexed (palette) and on one page.
function hbRecsOK(recs) {
  if (typeof hbOn !== 'function' || !hbOn()) return false;
  for (let i = 0; i < recs.length; i++) { const r = recs[i]; if (!r.pal || sheetPages(r).length !== 1) return false; }
  return true;
}
// Called from syncEntities for every hero (P through syncSheetPlayer). Returns false when the procedural sprite should
// be used. The controlled hero keeps its own layered meshes (exactly as before squad mode); allies are instances of the
// shared hero batches (HB: a few draws for the whole party), or layered meshes when their sheets cannot be batched.
function syncSheetHero(h) {
  const hs = heroState(h), W = heroWants(h, hs), v0 = VIS.get(h), recs = heroSheetRecs(W, v0);
  if (!recs) { h.sheetH = 0; if (!SHEETS.indexReady) return pendingBlob(h, 0.45); return recPending(W.recs[0]) ? pendingBlob(h, 0.45) : false; }
  const lead = typeof ctrlHero === 'function' ? ctrlHero() : P, hb = h !== lead && hbRecsOK(recs);
  let v = v0;
  if (!v || !v.sheet || !!v.hb !== hb || !sameRecs(v.recs, recs)) { if (v) disposeVis(v); v = makeSheetVis(recs, hb ? HERO_HB_OPT : PLAYER_VIS_OPT); v.hb = hb; VIS.set(h, v); if (v0 && v0.sheet && !!v0.hb !== hb) heroVisCarry(v, v0); }
  v.seen = frameNo; v.pRecs = recs;
  for (let i = 0; i < recs.length; i++) if (!recs[i].keep) sheetWantAll(recs[i], true);   // heroes fight any time: every page resident (idle-time uploads)
  const body = v.layers[0].rec.json, mnt = !!(recs[0].entry && recs[0].entry.mounted);
  if (v !== v0) { v.mounted = mnt; v.stride = mnt ? 0.72 : 1; if (v0 && v0.sheet) v.sector = v0.sector; mountSwap(v, mnt, h, hs); }
  v.xrayOn = h === lead ? undefined : !h.dead && heroOccluded(h);
  v.sector = facingSector(h.fx === undefined ? 1 : h.fx, h.fy || 0, cam.yaw, v.sector);
  const dir = sectorToDir(body, v.sector), dd = dir.d, dflip = dir.flip, dname = dir.name, pose = sheetPlayerPose(v, body, h);
  const so = v.so || (v.so = { tint: undefined }); so.tint = pose.tint;
  const st = sprFrame(v, h, so);
  const pl = hb ? heroHBFrame(v, h, pose.act, dd, pose.f, dflip, st) : placeSheetVis(v, h, pose.act, dd, pose.f, dflip, st, h.hair);
  placeBlob(v, h.x, pl.gh, h.y, v.mounted ? 0.85 : 0.45, pl.z, true);
  h.sheetH = v.layers[0].rec.visH;
  const dg = v.diag || (v.diag = { ids: v.layers.map(L => L.id), layers: v.layers.map(L => L.layer), hb });
  dg.act = pose.act; dg.f = pose.f; dg.dir = dname; dg.d = dd; dg.flip = dflip; dg.sector = v.sector; dg.rect = pl.rect;
  sprMotion(v, h, st, h.sheetH / PXU, pl.gh);
  return true;
}
function syncSheetPlayer() { return syncSheetHero(P); }   // (the name tools/perf.js times as sync.player)
// Hero batch frame: select every layer's frame (hat: its affine on the head anchor; hair: the hat's clip), then queue
// the vis for gfx-render.js hbFlushHeroes, which gives the layers texture slots and writes the instances once every hero
// of the frame is known. Returns a shared scratch { rect, gh, z } like placeSheetVis.
const _HBL = { rect: null, gh: 0, z: 0 };
function heroHBFrame(v, e, act, d, f, flip, st) {
  const gh = groundH(e.x, e.y), z = (e.z || 0) / PXU + st.zoff;
  let rect = null, body = null, hat = null, hair = null;
  for (let i = 0; i < v.layers.length; i++) {
    const L = v.layers[i]; let r;
    if (L.layer === 'headgear') {
      hat = L; r = body ? hatAffine(L, body, v.sector) : null;
      if (r) { const A = L.aff || (L.aff = new Float32Array(6)); A[0] = _HAT.a; A[1] = _HAT.b; A[2] = _HAT.c; A[3] = _HAT.d; A[4] = _HAT.tx; A[5] = _HAT.ty; } else L.on = false;
    } else { r = setLayerFrame(L, act, d, f); if (!body) body = L; if (L.layer === 'hair') hair = L; }
    if (!rect) rect = r;
  }
  v.clipM = hair ? hatClip(hair, hat) : 0;
  if (v.clipM === 2) hair.on = false; else if (v.clipM === 1) { const C = v.clip || (v.clip = new Float32Array(3)); C[0] = _CLIP[0]; C[1] = _CLIP[1]; C[2] = _CLIP[2]; }
  v.hbX = e.x; v.hbY = gh + z; v.hbZ = e.y; v.hbFlip = flip; v.hbHair = e.hair; v.hbDead = !!e.dead;
  hbQueue(v);
  _HBL.rect = rect; _HBL.gh = gh; _HBL.z = z; return _HBL;
}

/* ---------- Mobs ---------- */
const _MOBO = { tint: undefined, opacity: undefined, ghost: false, scl: 1 }, _MTINT = [1, 1, 1];
/* Named variants (MOBS[key].variant) share the base's sheet: tint (d.tint, normalised so its brightest channel is 1,
   in the working colour space) and size (d.scaleMul, else the variant/base size ratio). Both are per-instance data
   in the sprite batch (iCol, instance matrix + caster size), so a named rare costs nothing extra. Cached on d. */
function namedLook(d) {
  if (d._nl !== undefined) return d._nl;
  if (!d.variant || !d.base || typeof MOBS === 'undefined') return (d._nl = null);
  const b = MOBS[d.base] || {}, sz = o => (o.look && o.look.scale) || o.size || 1;
  let tint = null;
  if (d.tint) { const c = new THREE.Color(d.tint), mx = Math.max(c.r, c.g, c.b, 1e-3); tint = [c.r / mx, c.g / mx, c.b / mx]; if (sprLinear()) tint = tint.map(v => Math.pow(v, 2.2)); }
  const scl = d.scaleMul || Math.max(0.5, Math.min(2.5, sz(d) / sz(b)));
  return (d._nl = { tint, scl, col: d.tint || d.glow || '#ffd070' });
}
function syncSheetMob(m) {
  if (!SHEETS.indexReady) return pendingBlob(m, 0.45);
  const rec = sheetRecT(m.type, 'mob'); if (!recShow(rec)) { m.sheetH = 0; return recPending(rec) || recReady(rec) ? pendingBlob(m, 0.45 * Math.max(1, (m.d && m.d.size) || 1)) : false; }
  const d = m.d, ghost = isGhost(m), v = setVis1(m, rec, d.glow, ghost), J = rec.json;
  if (!rec.allQ && rec.pages.length > 1 && (m.state === 'chase' || m.hitFlash > 0 || m.atkAnim >= 0 || m.dead)) sheetWantAll(rec);   // combat prefetch of the attack / hurt / dead pages
  const pose = sheetMobPose(m, v, J); if (!pose) { m.sheetH = 0; disposeVis(v); VIS.delete(m); return false; }
  v.sector = facingSector(m.fx === undefined ? (m.dir || 1) : m.fx, m.fy || 0, cam.yaw, v.sector);
  const dir = sectorToDir(J, v.sector), dd = dir.d, dflip = dir.flip, dname = dir.name;
  const nl = namedLook(d);
  _MOBO.tint = pose.tint; _MOBO.opacity = pose.opacity; _MOBO.ghost = ghost; _MOBO.scl = nl ? nl.scl : 1;
  if (nl && nl.tint) { const t = pose.tint || TINT_ONE; _MTINT[0] = nl.tint[0] * t[0]; _MTINT[1] = nl.tint[1] * t[1]; _MTINT[2] = nl.tint[2] * t[2]; _MOBO.tint = _MTINT; }
  const st = sprFrame(v, m, _MOBO), k = st.scl;
  const pl = placeSheetVis(v, m, pose.act, dd, pose.f, dflip, st), gh = pl.gh, pz = pl.z, rect = pl.rect;
  const human = d.spr === 'human', s = human ? ((d.look && d.look.scale) || 1) : (d.size || 1);
  const shR = (human ? 0.45 : 0.5) * Math.max(1, s * (human ? 0.8 : 0.85)) * (ghost ? 0.8 : 1) * (nl ? Math.sqrt(k) : 1);
  placeBlob(v, m.x, gh, m.y, shR, pz, st.a > 0.3 && st.dis < 0.6);
  m.sheetH = rec.visH * k;
  const hu = rec.visH * k / PXU;
  if (v.glow) { v.glow.position.set(m.x, gh + pz + hu / COSP * 0.5, m.y); const gs = hu * (ghost ? 1.6 : 2.2); v.glow.scale.set(gs, gs, 1); v.glow.material.opacity = ghost ? 0.14 : 0.55; v.glow.visible = !m.dead; }
  sprMotion(v, m, st, hu, gh);
  const dg = v.diag || (v.diag = { id: rec.id }); dg.act = pose.act; dg.f = pose.f; dg.dir = dname; dg.flip = dflip; dg.rect = rect;
  return true;
}

/* ---------- NPCs ---------- */
const _NPCO = {};
function npcTalking(n) { return typeof talkNPC !== 'undefined' && talkNPC === n && typeof $ === 'function' && $('dialog') && !$('dialog').hidden; }
function syncSheetNPC(n) {
  if (!SHEETS.indexReady) return pendingBlob(n, 0.45);
  const rec = sheetRecT(n.id, 'npc'); if (!recShow(rec)) { n.sheetH = 0; return recPending(rec) || recReady(rec) ? pendingBlob(n, 0.45) : false; }
  const v = setVis1(n, rec, undefined, false), J = rec.json, talk = npcTalking(n);
  let fx = n.fx === undefined ? n.dir : n.fx, fy = n.fy === undefined ? 0.4 : n.fy;
  if (talk && P) { const dx = P.x - n.x, dy = P.y - n.y, dd = Math.hypot(dx, dy); if (dd > 0.05) { fx = dx / dd; fy = dy / dd; } }
  v.sector = facingSector(fx, fy, cam.yaw, v.sector);
  // escorted NPCs (n.moving, n.walk, n.fx/fy) play `walk` when the sheet has it (contract v3), else idle
  const walk = !talk && n.moving && sheetHas(J, 'walk');
  const want = talk && sheetHas(J, 'talk') ? 'talk' : walk ? 'walk' : 'idle', A = J.actions[want] || {};
  const fr = walk ? Math.floor((n.walk || time * 6) * 1.26 * (A.frames || 6) / 6) : Math.floor(time * (A.fps || 6) + n.x);
  const r = sheetFrame(J, want, fr); if (!r) { n.sheetH = 0; disposeVis(v); VIS.delete(n); return false; }
  const ract = r.act, rf = r.f;
  const dir = sectorToDir(J, v.sector), dd = dir.d, dflip = dir.flip, dname = dir.name;
  const st = sprFrame(v, n, _NPCO);
  const pl = placeSheetVis(v, n, ract, dd, rf, dflip, st);
  placeBlob(v, n.x, pl.gh, n.y, 0.45 * Math.max(1, ((n.look && n.look.scale) || 1) * 0.8), pl.z, true);
  n.sheetH = rec.visH;
  if (walk) sprMotion(v, n, st, rec.visH / PXU, pl.gh);
  const dg = v.diag || (v.diag = { id: rec.id }); dg.act = ract; dg.f = rf; dg.dir = dname;
  return true;
}

/* ---------- Companions (contract v4 pets) ----------
   COMPANIONS: array owned by content (defined here as an empty window property if content has not declared it):
     { kind: 'pet' | 'raven', sheet: 'pet_huginn' | 'mob_<type>' | a MOBS key, x, y, z (px above the ground, like
       entities), fx, fy (facing), state: 'idle' | 'walk' | 'fly' | 'attack' | 'perch', scale, owner (entity, default P),
       optional: atkAnim (0..1 drives the attack frames, like mobs), walk (distance counter for the walk cycle),
       tint [r, g, b], opacity, hidden (skip drawing), manual (true = content drives it: the default follow below
       never touches the entry), update(c, dt) (per-entry logic, called instead of the default follow) }
   Every entry is one instance of its sheet's sprite batch (same InstancedMesh as the mobs of that sheet: no extra
   draw call for a pet poring next to wild porings). Mob sheets used as pets are scaled to 0.6 unless `scale` is set.
   Actions: pet_huginn has idle / fly / attack / perch; mob sheets map fly -> walk, perch -> idle; Huginn's walk ->
   fly. `perch` puts the pet's anchor at the owner's anchor + perchOffset[dir] (owner frame px, mirrored with the
   owner); its `front` flag draws it in front of (1) or behind (0) the owner's layers. In fly / attack the sheet
   already draws the bird flyZ px above its anchor: x, y stay the ground point under it (its blob is drawn there). */
if (typeof COMPANIONS === 'undefined') window.COMPANIONS = [];
const NO_COMP = [];
function compList() { return typeof COMPANIONS !== 'undefined' && Array.isArray(COMPANIONS) ? COMPANIONS : NO_COMP; }
function sheetRecById(id) { return SHEETS.entries[id] ? sheetTag(SHEETS.byId[id] || loadSheet(id)) : null; }
function huginnRec() { return SHEETS.indexReady ? (sheetRecById('pet_huginn') || sheetRec('huginn', 'pet', null)) : null; }
// Load record of a companion's sheet: a sheet id, else a pet or MOBS key. Cached on the entry per sheet value.
// Round 10: a critter (core.js CRITTERS) draws with the first of CRITTERS[kind].sheets the index has (critter_<kind>
// before its pet / mob fallback); with none it stays hidden (no record: nothing drawn, never a box).
function critterSheet(c) {
  const C = typeof CRITTERS !== 'undefined' && CRITTERS[c.critter], L = C && Array.isArray(C.sheets) ? C.sheets : null; if (!L) return c.sheet;
  for (let i = 0; i < L.length; i++) if (SHEETS.entries[L[i]]) return L[i];
  return null;
}
function compRec(c) {
  if (!SHEETS.indexReady || !c) return null;
  if (c.critter) { if (c._cg !== SHEETS.gen || c._cs !== c.sheet) { c._cg = SHEETS.gen; c._cs = c.sheet; c._cw = critterSheet(c); } if (!c._cw) return null; if (c._gs !== c._cw) { c._gs = c._cw; c._gid = c._cw; } return sheetRecById(c._gid); }
  if (!c.sheet) return null;
  if (c._gs !== c.sheet) { c._gs = c.sheet; c._gid = SHEETS.entries[c.sheet] ? c.sheet : sheetId(c.sheet, 'pet', null) || sheetId(c.sheet, 'mob', null) || sheetId(String(c.sheet).replace(/^mob_/, ''), 'mob', null); }
  return c._gid ? sheetRecById(c._gid) : null;
}
const COMP_FB = { walk: ['walk', 'fly', 'idle'], fly: ['fly', 'walk', 'idle'], attack: ['attack', 'idle'], perch: ['perch', 'idle'], idle: ['idle'] };
function compAction(J, state) {
  const L = COMP_FB[state] || COMP_FB.idle;
  for (let i = 0; i < L.length; i++) if (sheetHas(J, L[i])) return L[i];
  return 'idle';
}
// Blitz Beat: the raven projectiles in flight this frame (drawn with Huginn's sheet), last position for the return.
const RAVENS = { n: 0, x: 0, y: 0, zu: 0, t: -9, map: null };
const _CE = { x: 0, y: 0, z: 0 }, _CO = { tint: undefined, opacity: undefined, ghost: false, scl: 1 };
const HUG_BODY = 48, HUG_SCALE = 0.85;   // Huginn is drawn a bit under its sheet size by default: at 1.0 the raven reads as half the rider's size   // px above the anchor to the middle of the bird in fly / attack frames (pet_huginn)
function syncRavenShots() {
  RAVENS.n = 0;
  if (typeof projs === 'undefined' || !projs.length) return;
  let rec = null;
  for (const p of projs) {
    if (p.kind !== 'raven') continue;
    RAVENS.n++; RAVENS.x = p.x; RAVENS.y = p.y; RAVENS.zu = p.zu; RAVENS.t = time; RAVENS.map = map;
    rec = rec || huginnRec(); if (!recReady(rec)) continue;
    const J = rec.json, v = setVis1(p, rec, undefined, false), to = p.to;
    const dx = to ? to.x - p.x : p.vx, dy = to ? to.y - p.y : p.vy, d = Math.hypot(dx, dy, to ? chestH(to) - p.zu : 0);
    v.sector = facingSector(dx || p.vx || 1, dy || p.vy || 0, cam.yaw, v.sector);
    const dir = sectorToDir(J, v.sector), dd = dir.d, dflip = dir.flip;
    // far: flap; the last 3 units: the dive strike, reaching its hit frame at the target
    let act = 'fly', f = Math.floor(time * actFps(J.actions, 'fly') + p.x);
    if (d < 3 && sheetHas(J, 'attack')) { act = 'attack'; const hf = (J.hit && J.hit.attack) || 3; f = Math.min(hf, Math.floor((1 - d / 3) * (hf + 1))); }
    _CO.tint = undefined; _CO.opacity = undefined; _CO.scl = HUG_SCALE;
    const st = sprFrame(v, p, _CO), k = st.scl;
    _CE.x = p.x; _CE.y = p.y; _CE.z = (p.zu - HUG_BODY * k / PXU / COSP - groundH(p.x, p.y)) * PXU;
    const pl = placeSheetVis(v, _CE, act, dd, f, dflip, st);
    const dg = v.diag || (v.diag = { id: rec.id }); dg.act = act; dg.f = f; dg.dir = dir.name; dg.rect = pl.rect;
  }
}
/* ---- DEFAULT COMPANION BEHAVIOUR (gfx placeholder; content overrides it) ----
   Runs only for entries that have no logic of their own: c.manual !== true and no c.update function. Content takes
   over per entry (c.manual = true, or c.update = fn(c, dt)) or globally by defining its own companionFollow(c, dt).
   Pets trot to a spot behind the owner; a raven flies beside a moving owner and perches on the shoulder once the
   owner stands still; while a Blitz Beat raven is in flight the owner's raven is hidden (it is the one diving) and
   then flies back from where the dive ended. */
if (typeof companionFollow !== 'function') window.companionFollow = function (c, dt) {
  const o = c.owner || P; if (!o) return;
  const g = c._gf || (c._gf = { still: 0, map: null, away: false });
  if (g.map !== map || c.x === undefined) { g.map = map; c.x = o.x - (o.fx || 0) * 0.8; c.y = o.y - (o.fy || 1) * 0.8; c.z = 0; c.fx = o.fx; c.fy = o.fy; }
  g.still = o.moving ? 0 : g.still + dt;
  const raven = c.kind === 'raven';
  if (raven && o === P && RAVENS.n > 0) { c.hidden = true; g.away = true; return; }
  if (g.away) { g.away = false; c.hidden = false; if (RAVENS.map === map) { c.x = RAVENS.x; c.y = RAVENS.y; c.z = Math.max(0, (RAVENS.zu - groundH(c.x, c.y)) * PXU - 40); } c.state = 'fly'; }
  const ofx = o.fx === undefined ? 1 : o.fx, ofy = o.fy || 0, ol = Math.hypot(ofx, ofy) || 1, ux = ofx / ol, uy = ofy / ol;
  let tx, ty;
  if (raven) { tx = o.x - uy * 0.7 - ux * 0.3; ty = o.y + ux * 0.7 - uy * 0.3; }
  else { tx = o.x - ux * 1.1 - uy * 0.45; ty = o.y - uy * 1.1 + ux * 0.45; }
  let dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy);
  if (d > 12) { c.x = tx; c.y = ty; d = 0; }
  c.z = Math.max(0, (c.z || 0) * Math.exp(-dt * 3) - dt * 10);
  c.moving = false;
  if (raven && c.state === 'perch' && !o.moving) { c.x = o.x; c.y = o.y; return; }
  if (raven && !o.moving && g.still > 0.6 && Math.hypot(o.x - c.x, o.y - c.y) < 1.3 && c.z < 4) { c.state = 'perch'; c.x = o.x; c.y = o.y; return; }
  const moveEps = raven ? 0.12 : 0.3;
  if (d > moveEps) {
    const sp = Math.min(d, dt * (raven ? Math.min(8, Math.max(3.5, d * 1.8)) : Math.min(7, Math.max(3, d * 4))));
    c.x += dx / d * sp; c.y += dy / d * sp; c.fx = dx / d; c.fy = dy / d; c.walk = (c.walk || 0) + sp * 3.4;
    c.state = raven ? 'fly' : 'walk'; c.moving = !raven;
  } else if (raven) { c.state = 'fly'; if (!o.moving) { c.x += (o.x - c.x) * Math.min(1, dt * 4); c.y += (o.y - c.y) * Math.min(1, dt * 4); } c.fx = ofx; c.fy = ofy; }
  else { c.state = 'idle'; c.moving = false; if (o.moving) { c.fx = ofx; c.fy = ofy; } }
};
/* Screen-space separation (vfx round 7). Content places the pet behind the hero on one side and Huginn at the other
   shoulder in the hero's own frame, so when the hero walks across the screen both land in the same screen column and the
   raven covers the pet. At draw time only (c.x / c.y are never changed): along the camera's right axis the pet keeps at
   least SEP.pet on its side of the owner and a flying Huginn at least SEP.raven on the other side, lifted SEP.lift
   higher. The side follows the pet (hysteresis), offsets ease in and out, and fade to 0 as Huginn leaves on a dive. */
const COMP_SEP = { pet: 0.62, raven: 0.8, lift: 0.42, near: 3.2, side: 1 };
function compEase(c, lat, lift, k) { c._sepL = (c._sepL || 0) + (lat - (c._sepL || 0)) * k; c._sepH = (c._sepH || 0) + (lift - (c._sepH || 0)) * k; }
// Squad mode: one pet + raven pair per owner hero (each ally's pet and Huginn separate around their own owner).
function compSeparate(L, dt) {
  if (typeof window !== 'undefined' && window.AOM_COMP_SEP === false) { for (const c of L) if (c) c._sepL = c._sepH = 0; return; }   // A/B switch
  const k = 1 - Math.exp(-dt * 7), rx = SPRF.rx, ry = SPRF.ry;
  for (let i = 0; i < L.length; i++) if (L[i]) L[i]._sepP = false;
  for (let i = 0; i < L.length; i++) {
    const pet = L[i]; if (!pet || pet.hidden || pet.x === undefined || pet.kind === 'raven') continue;
    const o = pet.owner || P; if (!o) continue;
    let rav = null, other = false;
    for (let j = 0; j < L.length; j++) { const c = L[j]; if (!c || c === pet || c.hidden || c.x === undefined || (c.owner || P) !== o) continue; if (c.kind === 'raven') { if (!rav && !c.tint) rav = c; } else if (c._sepP) other = true; }
    if (!rav || other || rav._sepP) continue;   // (the first pet of an owner pairs with its raven)
    pet._sepP = rav._sepP = true;
    const lp = (pet.x - o.x) * rx + (pet.y - o.y) * ry;
    if (lp > 0.25) pet._sepS = 1; else if (lp < -0.25) pet._sepS = -1;
    const sd = pet._sepS || COMP_SEP.side, dp = Math.hypot(pet.x - o.x, pet.y - o.y), wp = clamp((COMP_SEP.near + 1 - dp) / 1, 0, 1);
    compEase(pet, Math.max(0, COMP_SEP.pet - sd * lp) * sd * wp, 0, k);
    const lr = (rav.x - o.x) * rx + (rav.y - o.y) * ry, dr = Math.hypot(rav.x - o.x, rav.y - o.y);
    const flying = rav.state !== 'perch' && rav.state !== 'attack', wr = flying ? clamp((COMP_SEP.near - dr) / 1.2, 0, 1) : 0;
    compEase(rav, -Math.max(0, COMP_SEP.raven + sd * lr) * sd * wr, COMP_SEP.lift * wr, k);
  }
  for (let i = 0; i < L.length; i++) { const c = L[i]; if (c && !c._sepP && (c._sepL || c._sepH)) compEase(c, 0, 0, k); }
}
function syncCompanions() {
  const L = compList(); if (!L.length || !SHEETS.indexReady) return;
  const dt = typeof SPRF !== 'undefined' ? SPRF.dt : 0.016;
  for (let i = 0; i < L.length; i++) {
    const c = L[i]; if (!c) continue;
    if (typeof c.update === 'function') c.update(c, dt);
    else if (!c.manual && typeof companionFollow === 'function') companionFollow(c, dt);
  }
  compSeparate(L, dt);
  for (let i = 0; i < L.length; i++) {
    const c = L[i]; if (!c) continue;
    if (c.hidden || c.x === undefined) continue;
    const rec = compRec(c); if (!recReady(rec)) continue;
    syncCompanion(c, rec);
  }
}
function syncCompanion(c, rec) {
  const J = rec.json, A = J.actions, v = setVis1(c, rec, undefined, false), o = c.owner || P;
  const state = c.state || 'idle', perch = state === 'perch' && o, act = compAction(J, state);
  // facing: the owner's when perched (same direction, mirrored together), else the entry's
  const ov = perch ? VIS.get(o) : null;
  if (perch) v.sector = ov && ov.sector !== undefined ? ov.sector : facingSector(o.fx === undefined ? 1 : o.fx, o.fy || 0, cam.yaw, v.sector);
  else v.sector = facingSector(c.fx === undefined ? 1 : c.fx, c.fy || 0, cam.yaw, v.sector);
  const dir = sectorToDir(J, v.sector), dd = dir.d, dflip = dir.flip, dname = dir.name;
  let f;
  if (act === 'attack') f = c.atkAnim >= 0 ? Math.floor(c.atkAnim * actN(A, act)) : actHeld(v, A, act);
  else if (act === 'walk' && c.walk !== undefined) f = Math.floor(c.walk * 1.26 * actN(A, act) / 6);
  else { if (v.act !== act) { v.act = act; v.actT = time; } f = Math.floor(time * actFps(A, act) + (c.x || 0) * 0.37); }
  if (act !== 'attack') v.act = act;
  const mobSheet = rec.entry && rec.entry.layer === 'mob';
  _CO.tint = /^critter_/.test(rec.id) ? undefined : c.tint; _CO.opacity = c.opacity; _CO.scl = c.scale || (mobSheet && c.kind !== 'raven' ? 0.6 : c.kind === 'raven' ? HUG_SCALE : 1);
  const st = sprFrame(v, c, _CO), k = st.scl;
  const sl = perch ? 0 : c._sepL || 0, sh = perch ? 0 : c._sepH || 0;   // screen-space separation (compSeparate)
  let x = c.x + SPRF.rx * sl, y = c.y + SPRF.ry * sl, h;
  if (perch) {
    // anchor = owner anchor + perchOffset[dir] (owner frame px): dx along the camera's right (mirrored with the
    // owner), dy up (stretched by 1/COSP like every sprite); front: nudge toward / away from the camera so the depth
    // test puts the pet in front of or behind the owner's layers whatever the draw order
    const po = J.perchOffset && (J.perchOffset[SHEET_DIR8[Math.abs(v.sector)]] || J.perchOffset.S) || [0, -36, 1];
    const dxu = po[0] * (dflip ? -1 : 1) / PXU, front = po[2] ? 1 : -1, nud = 0.05 * front;
    x = o.x + SPRF.rx * dxu + Math.sin(cam.yaw) * nud; y = o.y + SPRF.ry * dxu + Math.cos(cam.yaw) * nud;
    const ost = ov && ov.st;
    h = groundH(o.x, o.y) + (o.z || 0) / PXU + (ost ? ost.zoff : 0) - po[1] / PXU / COSP * (ost ? ost.sy : 1);
  } else h = groundH(x, y) + (c.z || 0) / PXU + sh;
  _CE.x = x; _CE.y = y; _CE.z = (h - groundH(x, y)) * PXU;
  const pl = placeSheetVis(v, _CE, act, dd, f, dflip, st);
  if (!perch) {
    const air = act === 'fly' || act === 'attack' ? (J.flyZ || 0) / PXU : 0;
    placeBlob(v, x, groundH(x, y), y, (mobSheet ? 0.5 : 0.28) * Math.max(0.5, k), air + (c.z || 0) / PXU + sh, st.a > 0.3);
  }
  c.sheetH = rec.visH * k;
  if (act === 'walk') sprMotion(v, c, st, rec.visH * k / PXU);
  const dg = v.diag || (v.diag = { id: rec.id }); dg.act = act; dg.f = f; dg.dir = dname; dg.flip = dflip; dg.rect = pl.rect;
}

/* ---------- headH: use the sheet's visible height while a sheet is shown ---------- */
if (typeof headH === 'function') {
  const baseHeadH = headH;
  // eslint-disable-next-line no-global-assign
  headH = function (e) { return e && e.sheetH > 0 ? e.sheetH / PXU / COSP : baseHeadH(e); };
}
loadIndexes();
