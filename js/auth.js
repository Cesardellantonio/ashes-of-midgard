/* =========================================================================================================
   Ashes of Midgard: optional cloud login and cloud saves (Firebase Authentication + Cloud Firestore).
   Setup: docs/AUTH-SETUP.md. Config: js/auth-config.js (window.AOM_AUTH). Rules: firestore.rules.

   - Guests are untouched: nothing loads from the network until the player opens the account panel, or unless this
     browser signed in before (or is coming back from a sign-in redirect / email link).
   - Load order: after js/ui.js (it wraps globals that ui.js and core.js define). Every hook is guarded with typeof and
     retried on window 'load', so a different order never throws.
   - Hooks (no other file is edited):
       store(k, v)   core.js   wrapped: a write or removal of 'aom-save' (or 'aom-save-<slot>') marks that slot dirty
                                and stamps its local time in 'aom-save-at'.
       saveGame()    ui.js     wrapped: skipped while the page reloads into a cloud save ("Keep cloud" mid-game), so
                                the old in-memory game cannot overwrite the copy just pulled.
       showTitle()   ui.js     wrapped: re-adds the account card to the title screen after every render.
   - Cloud layout: users/{uid}/saves/{slot} = { data: <the exact localStorage JSON string>, updatedAt: ms, v, checksum,
     size, summary: { name, lvl, jlvl, cls, playTime }, savedAt: server time }. Slot 'main' is localStorage 'aom-save'.
   - Sync is three-way: per slot this device remembers the checksum it last agreed on with the cloud ("base"). Only
     one side changed since then: that side wins, when it is the same character with at least as much play time.
     Anything else that differs meaningfully asks the player (Keep cloud / Keep this device). Nothing is overwritten
     silently.
   - Mock mode for tests: window.AOM_AUTH_MOCK = true swaps the Firebase SDK for an in-memory fake with the same
     (compat) interface. Its "server" is mirrored to sessionStorage so a reload or a wiped localStorage (a second
     device) still sees it. See shots/auth/.
   ========================================================================================================= */
(function () {
  'use strict';
  if (window.AOM_CLOUD) return;   // loaded twice

  const CLIENT = 'aom-web/1';
  const FB_VER = '11.10.0';
  const FB_CDN = `https://cdn.jsdelivr.net/npm/firebase@${FB_VER}/`;
  // Subresource integrity for the pinned compat builds (sha384 of the files jsDelivr serves for this exact version).
  const FB_FILES = [
    ['firebase-app-compat.js', 'sha384-b1CWci0SaI05xAJao7+U+7e+gNKOl4vZnNQHy/DYL4qnfACkhq8nV/8rasGUskSc'],
    ['firebase-auth-compat.js', 'sha384-0Gg4gw2/vCGckM+XGxUmijbO/g+KBWwhLeWlPzehXm7IyXIW1dXJT3FKBdJ8wK+B'],
    ['firebase-firestore-compat.js', 'sha384-Ge64KfBOULClHbopA+CuNwcDKcmElYkeU/wCXmAiWN0pqlbET6cPN8IiwMz9w33f']
  ];
  const K = { was: 'aom-auth-was', meta: 'aom-cloud-meta', at: 'aom-save-at', email: 'aom-auth-email', redirect: 'aom-auth-redirect' };
  const MAIN_KEY = 'aom-save', SLOT_RE = /^aom-save-([A-Za-z0-9_]{1,24})$/;
  const MAX_DATA = 800000;   // characters; firestore.rules enforces the same limit (a Firestore document tops out at 1 MiB)

  const PROV = {
    google: { pid: 'google.com', label: 'Google', mark: 'G', bg: '#ffffff', fg: '#4285f4', bd: '#c4cde0' },
    facebook: { pid: 'facebook.com', label: 'Facebook', mark: 'f', bg: '#1877f2', fg: '#fff' },
    twitter: { pid: 'twitter.com', label: 'X', mark: 'X', bg: '#000', fg: '#fff' },
    github: { pid: 'github.com', label: 'GitHub', mark: 'GH', bg: '#24292f', fg: '#fff' },
    microsoft: { pid: 'microsoft.com', label: 'Microsoft', mark: 'ms', bg: '#fff', fg: '#000', bd: '#c4cde0' },
    apple: { pid: 'apple.com', label: 'Apple', mark: 'A', bg: '#000', fg: '#fff' },
    email: { pid: 'password', label: 'Email link', mark: '@', bg: '#56627e', fg: '#fff' }
  };
  const PID_LABEL = { 'google.com': 'Google', 'facebook.com': 'Facebook', 'twitter.com': 'X', 'github.com': 'GitHub', 'microsoft.com': 'Microsoft', 'apple.com': 'Apple', password: 'Email link', emailLink: 'Email link' };

  /* ---------- small helpers ---------- */
  const cfg = () => (window.AOM_AUTH && typeof window.AOM_AUTH === 'object') ? window.AOM_AUTH : {};
  const isMock = () => window.AOM_AUTH_MOCK === true;
  const tune = k => { const d = { debounceMs: 8000, minGapMs: 90000, timeoutMs: 15000, backoffMs: 2000, backoffMaxMs: 300000, titleWaitMs: 8000 }; const s = cfg().sync; return s && typeof s[k] === 'number' ? s[k] : d[k]; };
  function configured() {
    if (isMock()) return true;
    const f = cfg().firebase;
    return !!(f && typeof f === 'object' && f.apiKey && f.authDomain && f.projectId && f.appId);
  }
  function providers() {
    const p = Array.isArray(cfg().providers) ? cfg().providers : Object.keys(PROV);
    return p.filter((id, i) => PROV[id] && p.indexOf(id) === i);
  }
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); return true; } catch (e) { return false; } };
  const jparse = (s, d) => { try { const v = JSON.parse(s); return v == null ? d : v; } catch (e) { return d; } };
  const escH = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const byId = id => document.getElementById(id);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const here = () => location.origin + location.pathname;
  function withTimeout(p, ms, what) {
    let t; return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(Object.assign(new Error((what || 'request') + ' timed out'), { code: 'aom/timeout' })), ms || tune('timeoutMs')); })]).finally(() => clearTimeout(t));
  }
  function csum(s) {
    let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return 'fnv1a32:' + (h >>> 0).toString(16).padStart(8, '0') + ':' + s.length;
  }
  const keyOf = slot => slot === 'main' ? MAIN_KEY : 'aom-save-' + slot;
  function slotOf(k) { if (k === MAIN_KEY) return 'main'; const m = SLOT_RE.exec(k); return m && m[1] !== 'at' ? m[1] : null; }
  function localSlots() {
    const out = ['main'];
    try { for (let i = 0; i < localStorage.length; i++) { const s = slotOf(localStorage.key(i)); if (s && !out.includes(s)) out.push(s); } } catch (e) { /* storage blocked */ }
    return out;
  }
  const readLocal = slot => lsGet(keyOf(slot));
  let selfWrite = false;
  function writeLocal(slot, str) { selfWrite = true; try { lsSet(keyOf(slot), str); } finally { selfWrite = false; } }
  const localAtAll = () => jparse(lsGet(K.at), {}) || {};
  const localAt = slot => +localAtAll()[slot] || 0;
  function setLocalAt(slot, t) { const a = localAtAll(); if (t) a[slot] = t; else delete a[slot]; lsSet(K.at, JSON.stringify(a)); }
  const sumCache = {};
  function summary(str) {
    if (!str) return null; const c = csum(str); if (sumCache[c]) return sumCache[c];
    const o = jparse(str, null); if (!o || typeof o !== 'object') return null;
    return (sumCache[c] = { name: String(o.name || 'Unnamed').slice(0, 24), lvl: +o.lvl || 1, jlvl: +o.jlvl || 1, cls: String(o.cls || 'novice').slice(0, 24), playTime: Math.max(0, +o.playTime || 0), map: String(o.map || '').slice(0, 32), reborn: !!(o.flags && o.flags.reborn) });
  }
  function meaningful(a, b) {
    if (!a || !b) return !!(a || b);
    return a.name !== b.name || a.cls !== b.cls || a.lvl !== b.lvl || a.jlvl !== b.jlvl || a.reborn !== b.reborn || Math.abs(a.playTime - b.playTime) > 120;
  }
  function isMobile() {
    try { if (navigator.userAgentData && navigator.userAgentData.mobile) return true; } catch (e) { /* */ }
    const ua = navigator.userAgent || '';
    return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  }
  function fmtPlay(s) { s = Math.floor(s || 0); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h} h ${m} min` : m ? `${m} min` : `${s % 60} s`; }
  function fmtWhen(t) {
    if (!t) return 'unknown time';
    const d = new Date(t), now = new Date(), hm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toDateString() === now.toDateString() ? `today, ${hm}` : `${d.toLocaleDateString([], { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' })}, ${hm}`;
  }
  const clsName = c => { try { return typeof CLASSES !== 'undefined' && CLASSES[c] ? CLASSES[c].name : c; } catch (e) { return c; } };
  const mapName = m => { try { return typeof MAPS !== 'undefined' && MAPS[m] && MAPS[m].name ? MAPS[m].name : ''; } catch (e) { return ''; } };
  const gameStarted = () => { try { return typeof started !== 'undefined' && !!started; } catch (e) { return false; } };
  const gameLog = (m, c) => { try { if (gameStarted() && typeof log === 'function') log(m, c || 'sys'); } catch (e) { /* */ } };

  /* ---------- state ---------- */
  const S = {
    view: null, msg: null, busy: false, status: 'guest', err: null,
    user: null, fb: null, auth: null, db: null,
    dirty: {}, paused: {}, conflicts: [], tmr: null, retryTmr: null, retryKind: null, attempt: 0, retryAt: 0,
    lastUp: 0, lastSync: 0, initialDone: false, reloading: false, link: null, needEmail: false, emailSent: null,
    chain: Promise.resolve(), stats: { uploads: 0, pulls: 0, pushes: 0, fails: 0, retries: 0, conflicts: 0 }
  };
  const run = fn => (S.chain = S.chain.then(() => fn()).catch(e => { console.warn('[auth]', e); }));
  // Like run(), but the caller gets the result or the error.
  const queued = fn => new Promise((res, rej) => { run(() => Promise.resolve().then(fn).then(res, rej)); });
  function metaAll() { const m = jparse(lsGet(K.meta), {}); return m && typeof m === 'object' ? m : {}; }
  function metaOf(uid) { const m = metaAll(); const u = m[uid] && typeof m[uid] === 'object' ? m[uid] : {}; u.slots = u.slots && typeof u.slots === 'object' ? u.slots : {}; return u; }
  function saveMeta(uid, u) { const m = metaAll(); if (u) m[uid] = u; else delete m[uid]; lsSet(K.meta, JSON.stringify(m)); }
  const baseOf = slot => S.user ? (metaOf(S.user.uid).slots[slot] || {}).base || null : null;
  function setBase(slot, c, doc) {
    if (!S.user) return; const u = metaOf(S.user.uid);
    if (c) u.slots[slot] = { base: c, at: doc && doc.updatedAt || Date.now(), sum: doc && doc.summary || null }; else delete u.slots[slot];
    saveMeta(S.user.uid, u);
  }

  /* ---------- the Firebase SDK (lazy) ---------- */
  function loadScript(src, integrity) {
    return new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = src; s.async = false; s.crossOrigin = 'anonymous';
      if (integrity) s.integrity = integrity;
      const t = setTimeout(() => rej(new Error('timed out loading ' + src)), 30000);
      s.onload = () => { clearTimeout(t); res(); }; s.onerror = () => { clearTimeout(t); rej(new Error('could not load ' + src)); };
      document.head.appendChild(s);
    });
  }
  let sdkP = null;
  function sdk() {
    if (sdkP) return sdkP;
    sdkP = (async () => {
      let fb;
      if (isMock()) fb = S.mock || (S.mock = makeMock());
      else {
        if (!configured()) throw Object.assign(new Error('not configured'), { code: 'aom/not-configured' });
        if (!(window.firebase && window.firebase.auth && window.firebase.firestore)) for (const [f, sri] of FB_FILES) await loadScript(FB_CDN + f, sri);
        fb = window.firebase;
      }
      const app = fb.apps && fb.apps.length ? fb.app() : fb.initializeApp(isMock() ? { projectId: 'mock' } : cfg().firebase);
      S.fb = fb; S.auth = fb.auth(app); S.db = fb.firestore(app);
      try { S.auth.useDeviceLanguage(); } catch (e) { /* */ }
      await new Promise(res => { let first = true; S.auth.onAuthStateChanged(u => { onUser(u); if (first) { first = false; res(); } }); });
      await finishRedirect(); await finishEmailLink();
      return fb;
    })();
    sdkP.catch(() => { sdkP = null; });
    return sdkP;
  }

  /* ---------- auth ---------- */
  function onUser(u) {
    try {
      const was = S.user && S.user.uid;
      if (!u) {
        S.user = null; S.status = 'guest'; S.initialDone = true; S.dirty = {}; S.paused = {}; S.conflicts = []; clearTimers();
        if (S.view === 'conflict') S.view = null;
        lsSet(K.was, null); unlockTitle(); render(); return;
      }
      const email = u.email || ((u.providerData || []).find(p => p && p.email) || {}).email || '';
      S.user = { uid: u.uid, name: String(u.displayName || (email ? email.split('@')[0] : 'Adventurer')).slice(0, 40), photo: safePhoto(u.photoURL), email, providers: (u.providerData || []).map(p => p && p.providerId).filter(Boolean) };
      lsSet(K.was, '1');
      if (was !== u.uid) { S.initialDone = false; S.status = 'checking'; lockTitle(); if (S.view === 'panel' && !S.link) S.msg = null; linkPending(u).then(() => syncAll('signin')); }
      render();
    } catch (e) { console.warn('[auth] onUser', e); }
  }
  function refreshUser() { try { const u = S.auth && S.auth.currentUser; if (u && S.user) { S.user.providers = (u.providerData || []).map(p => p && p.providerId).filter(Boolean); } } catch (e) { /* */ } }
  const safePhoto = p => typeof p === 'string' && (/^https:\/\//.test(p) || (isMock() && /^data:image\//.test(p))) ? p : null;
  function makeProvider(id) {
    const A = S.fb.auth; let p = null;
    if (id === 'google') { p = new A.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' }); }
    else if (id === 'facebook') p = new A.FacebookAuthProvider();
    else if (id === 'twitter') p = new A.TwitterAuthProvider();
    else if (id === 'github') p = new A.GithubAuthProvider();
    else if (id === 'microsoft') { p = new A.OAuthProvider('microsoft.com'); p.setCustomParameters({ prompt: 'select_account' }); }
    else if (id === 'apple') { p = new A.OAuthProvider('apple.com'); p.addScope('email'); p.addScope('name'); }
    return p;
  }
  // Mobile: redirect first only where it works. Since browsers partition third-party storage (Safari, Firefox, some
  // Chrome setups) signInWithRedirect only returns reliably when authDomain is this site's own host; otherwise use the
  // popup (it works on phones too, as a new tab) and fall back to the redirect when the popup is blocked.
  function redirectFirst() {
    if (!isMobile()) return false;
    const f = cfg().mobileFlow || 'auto';
    if (f === 'redirect') return true; if (f === 'popup') return false;
    const ad = cfg().firebase && cfg().firebase.authDomain; return !!ad && ad === location.host;
  }
  async function signIn(id) {
    if (!configured()) { S.view = 'panel'; render(); return; }
    if (S.busy) return; S.busy = true; S.msg = { t: 'info', m: `Opening ${PROV[id].label}…` }; render();
    try {
      await sdk();
      if (id === 'email') { S.msg = null; return; }
      const p = makeProvider(id); if (!p) throw new Error('unknown provider ' + id);
      if (redirectFirst()) { await goRedirect(p, id); return; }
      const opening = S.msg;
      try { await S.auth.signInWithPopup(p); if (S.msg === opening) S.msg = null; }
      catch (e) {
        if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported'].includes(e && e.code)) { await goRedirect(p, id); return; }
        throw e;
      }
    } catch (e) { authError(e, id); }
    finally { S.busy = false; render(); }
  }
  async function goRedirect(p, id) {
    S.msg = { t: 'info', m: `Taking you to ${PROV[id].label} to sign in…` }; render();
    lsSet(K.redirect, JSON.stringify({ id, t: Date.now(), link: S.link && S.link.cred && S.link.cred.toJSON ? { json: S.link.cred.toJSON(), email: S.link.email, from: S.link.from } : null }));
    await S.auth.signInWithRedirect(p);   // navigates away
  }
  async function finishRedirect() {
    const r = jparse(lsGet(K.redirect), null); if (!r) return; lsSet(K.redirect, null);
    if (Date.now() - (+r.t || 0) > 15 * 60000) return;
    if (r.link && r.link.json) { try { S.link = { cred: S.fb.auth.AuthCredential.fromJSON(r.link.json), email: r.link.email, from: r.link.from }; } catch (e) { /* */ } }
    try { const res = await S.auth.getRedirectResult(); if (res && res.user) { S.msg = null; if (S.link) await linkPending(res.user); } }
    catch (e) { authError(e, r.id); openView('panel'); }
  }
  function authError(e, id) {
    const c = (e && e.code) || '';
    if (c === 'auth/account-exists-with-different-credential' && e.credential) {
      const from = PID_LABEL[e.credential.providerId] || (PROV[id] && PROV[id].label) || 'that account';
      S.link = { cred: e.credential, email: e.email || '', from };
      S.msg = { t: 'warn', m: `You already have an Ashes of Midgard account${e.email ? ` for ${e.email}` : ''} with a different sign-in. Sign in with the one you used before, below, and ${from} will be linked to it, so either works from now on.` };
      S.view = 'panel'; return;
    }
    const quiet = ['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled'];
    if (quiet.includes(c)) { S.msg = { t: 'info', m: 'Sign-in was cancelled.' }; return; }
    const M = {
      'aom/not-configured': 'Cloud login is not set up yet.',
      'auth/network-request-failed': 'Could not reach the sign-in service. Check your connection and try again.',
      'auth/unauthorized-domain': 'This web address is not on the Firebase authorized domains list yet (see docs/AUTH-SETUP.md).',
      'auth/operation-not-allowed': `${PROV[id] ? PROV[id].label : 'This'} sign-in is not enabled in Firebase yet.`,
      'auth/popup-blocked': 'The browser blocked the sign-in window. Allow pop-ups for this site and try again.',
      'auth/invalid-email': 'That email address does not look right.',
      'auth/invalid-action-code': 'That sign-in link has expired or was already used. Ask for a new one.',
      'auth/expired-action-code': 'That sign-in link has expired. Ask for a new one.',
      'auth/too-many-requests': 'Too many attempts. Wait a little and try again.',
      'auth/user-disabled': 'This account has been disabled.',
      'auth/credential-already-in-use': 'That account is already linked to a different Ashes of Midgard player.'
    };
    S.msg = { t: 'bad', m: M[c] || (/could not load|timed out loading/.test(e && e.message) ? 'Could not load the sign-in service. Check your connection (or an ad blocker) and try again.' : `Sign-in failed${c ? ` (${c.replace('auth/', '')})` : ''}.`) };
    if (!/^auth\/|^aom\//.test(c)) console.warn('[auth]', e);
  }
  async function linkPending(user) {
    if (!S.link || !user) return; const L = S.link; S.link = null;
    try { await user.linkWithCredential(L.cred); refreshUser(); S.msg = { t: 'ok', m: `${L.from} is now linked to this account.` }; }
    catch (e) { const c = e && e.code; S.msg = { t: c === 'auth/provider-already-linked' ? 'info' : 'bad', m: c === 'auth/provider-already-linked' ? `${L.from} was already linked.` : c === 'auth/credential-already-in-use' ? `That ${L.from} account belongs to another player, so it could not be linked.` : `Could not link ${L.from}${c ? ` (${String(c).replace('auth/', '')})` : ''}.` }; }
    render();
  }
  async function sendEmailLink(email) {
    email = String(email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { S.msg = { t: 'bad', m: 'Enter a valid email address.' }; render(); return; }
    if (S.busy) return; S.busy = true; render();
    try {
      await sdk();
      if (S.needEmail) { await S.auth.signInWithEmailLink(email, location.href); S.needEmail = false; cleanUrl(); S.msg = null; return; }
      await S.auth.sendSignInLinkToEmail(email, { url: here(), handleCodeInApp: true });
      lsSet(K.email, email); S.emailSent = email;
      S.msg = { t: 'ok', m: `A sign-in link is on its way to ${email}. Open it in this browser on this device to finish. Check spam if it does not arrive in a few minutes.` };
    } catch (e) { authError(e, 'email'); }
    finally { S.busy = false; render(); }
  }
  const emailLinkInUrl = () => /[?&]oobCode=/.test(location.search) && /[?&]mode=signIn/.test(location.search);
  async function finishEmailLink() {
    let ok = false; try { ok = S.auth.isSignInWithEmailLink(location.href); } catch (e) { /* */ }
    if (!ok) return;
    const email = lsGet(K.email);
    if (!email) { S.needEmail = true; S.msg = { t: 'info', m: 'Confirm your email address to finish signing in (the link was opened in a different browser).' }; openView('panel'); return; }
    try { await S.auth.signInWithEmailLink(email, location.href); lsSet(K.email, null); } catch (e) { authError(e, 'email'); openView('panel'); }
    cleanUrl();
  }
  function cleanUrl() { try { history.replaceState(null, '', here() + location.hash); } catch (e) { /* */ } }
  async function signOut() {
    if (!S.user || S.busy) return; S.busy = true; S.msg = { t: 'info', m: 'Saving to the cloud before signing out…' }; render();
    try { if (Object.keys(S.dirty).length) await withTimeout(run(() => uploadDirty('signout')), 6000).catch(() => {}); await S.auth.signOut(); S.msg = { t: 'ok', m: 'Signed out. Your saves on this device stay here.' }; gameLog('Signed out of cloud saves. Your save stays in this browser.'); }
    catch (e) { S.msg = { t: 'bad', m: 'Could not sign out: ' + ((e && e.code) || e) }; }
    finally { S.busy = false; render(); }
  }

  /* ---------- Firestore ---------- */
  // Reads go to the server: a cached copy (e.g. our own write still waiting to go out while offline) must not count as synced.
  const SERVER = { source: 'server' };
  const savesCol = () => S.db.collection('users').doc(S.user.uid).collection('saves');
  const offlineish = e => { const c = String((e && e.code) || ''); return !navigator.onLine || /unavailable|deadline-exceeded|aom\/timeout|network-request-failed|failed-precondition|resource-exhausted|aborted|internal|cancelled/.test(c); };
  function docOf(slot, str) {
    const s = summary(str) || {};
    return { data: str, updatedAt: localAt(slot) || Date.now(), v: CLIENT, checksum: csum(str), size: str.length, summary: { name: s.name || '', lvl: s.lvl || 0, jlvl: s.jlvl || 0, cls: s.cls || '', playTime: Math.round(s.playTime || 0) }, savedAt: S.fb.firestore.FieldValue.serverTimestamp() };
  }
  function cleanDoc(d) {
    if (!d || typeof d.data !== 'string') return null;
    if (d.checksum !== csum(d.data)) { if (!summary(d.data)) return null; d = Object.assign({}, d, { checksum: csum(d.data) }); }
    return d;
  }
  async function fetchAll() { const q = await withTimeout(savesCol().get(SERVER), 0, 'cloud read'); const out = {}; q.forEach(d => { out[d.id] = cleanDoc(d.data()); }); return out; }
  async function fetchOne(slot) { const s = await withTimeout(savesCol().doc(slot).get(SERVER), 0, 'cloud read'); return s.exists ? cleanDoc(s.data()) : null; }
  async function push(slot, str) {
    if (str.length > MAX_DATA) throw Object.assign(new Error('save too large for the cloud'), { code: 'aom/too-large' });
    const d = docOf(slot, str); await withTimeout(savesCol().doc(slot).set(d), 0, 'cloud write');
    setBase(slot, d.checksum, d); S.stats.pushes++; S.lastUp = Date.now();
  }
  function pull(slot, C) {
    writeLocal(slot, C.data); setLocalAt(slot, C.updatedAt || Date.now()); setBase(slot, C.checksum, C); S.stats.pulls++;
    if (slot === 'main' && !gameStarted()) retitle();
  }
  function flushGame() { try { if (gameStarted() && ORIG.saveGame && !S.reloading) ORIG.saveGame(); } catch (e) { /* */ } }

  // The one decision: local copy L (string|null) vs cloud copy C (doc|null), given this device's last agreed base.
  async function reconcile(slot, C) {
    const L = readLocal(slot), Lc = L ? csum(L) : null, Cc = C ? C.checksum : null, B = baseOf(slot);
    if (Lc === Cc) { if (Lc) setBase(slot, Lc, C); delete S.dirty[slot]; return 'same'; }
    const Ls = summary(L), Cs = C ? (summary(C.data) || C.summary) : null, inGame = slot === 'main' && gameStarted();
    const same = !!(Ls && Cs && Ls.name === Cs.name);   // the same character (the class changes as it advances)
    if (!C) { await push(slot, L); delete S.dirty[slot]; return 'push'; }
    if (!L) { if (!B && !inGame) { pull(slot, C); return 'pull'; } return conflict(slot, L, C); }
    const lc = Lc !== B, cc = Cc !== B;
    if (lc && !cc) { if (same && Ls.playTime >= Cs.playTime - 1) { await push(slot, L); delete S.dirty[slot]; return 'push'; } return conflict(slot, L, C); }
    if (cc && !lc) { if (same && Cs.playTime >= Ls.playTime - 1 && !inGame) { pull(slot, C); return 'pull'; } return conflict(slot, L, C); }
    if (!meaningful(Ls, Cs)) {   // both moved a little (same character, same levels, under two minutes apart): newest wins
      if (inGame || localAt(slot) >= (C.updatedAt || 0)) { await push(slot, L); delete S.dirty[slot]; return 'push'; }
      pull(slot, C); return 'pull';
    }
    return conflict(slot, L, C);
  }
  function conflict(slot, L, C) {
    S.paused[slot] = true; delete S.dirty[slot];
    S.conflicts = S.conflicts.filter(c => c.slot !== slot); S.conflicts.push({ slot, L, C, at: localAt(slot) }); S.stats.conflicts++;
    return 'conflict';
  }
  async function syncAll(why) {
    return run(async () => {
      if (!S.user || S.reloading) return;
      S.status = 'checking'; S.err = null; render();
      try {
        flushGame();
        const cloud = await fetchAll();
        const slots = new Set([...localSlots(), ...Object.keys(cloud), ...Object.keys(metaOf(S.user.uid).slots)]);
        for (const slot of slots) { if (S.paused[slot] && why !== 'manual') continue; if (why === 'manual') delete S.paused[slot]; await reconcile(slot, cloud[slot] || null); }
        S.lastSync = Date.now(); S.attempt = 0; S.status = S.conflicts.length ? 'conflict' : 'synced';
      } catch (e) { failed(e, 'sync'); }
      finally {
        S.initialDone = true; unlockTitle();
        if (S.conflicts.length && S.view !== 'confirm') S.view = 'conflict';
        render();
      }
    });
  }
  async function uploadDirty(why) {
    if (!S.user || S.reloading) return;
    if (!S.initialDone) return;   // the sign-in sync covers it
    const slots = Object.keys(S.dirty).filter(s => !S.paused[s]); if (!slots.length) return;
    S.status = 'uploading'; render();
    try {
      for (const slot of slots) {
        const L = readLocal(slot);
        if (L && csum(L) === baseOf(slot)) { delete S.dirty[slot]; continue; }
        await reconcile(slot, await fetchOne(slot));
      }
      S.stats.uploads++; S.attempt = 0; S.lastSync = Date.now(); S.status = S.conflicts.length ? 'conflict' : 'synced';
    } catch (e) { failed(e, 'upload'); }
    if (S.conflicts.length && S.view !== 'confirm') S.view = 'conflict';
    render();
  }
  function failed(e, kind) {
    S.stats.fails++;
    const code = String((e && e.code) || '');
    if (code === 'aom/too-large') { S.status = 'error'; S.err = 'This save is too large for the cloud.'; return; }
    if (!offlineish(e) && /permission-denied|unauthenticated|invalid-argument/.test(code)) { S.status = 'error'; S.err = `The cloud refused the save (${code}).`; console.warn('[auth]', e); }
    else S.status = 'offline';
    S.attempt++; const base = tune('backoffMs') * Math.pow(2, Math.min(S.attempt - 1, 12));
    const wait = Math.min(tune('backoffMaxMs'), base) * (0.85 + Math.random() * 0.3);
    if (S.retryKind !== 'sync') S.retryKind = kind;
    clearTimeout(S.retryTmr); S.retryAt = Date.now() + wait;
    S.retryTmr = setTimeout(retryNow, wait);
  }
  function retryNow() {
    clearTimeout(S.retryTmr); S.retryTmr = null; const k = S.retryKind; S.retryKind = null; S.retryAt = 0;
    if (!S.user || !k) return; S.stats.retries++;
    if (k === 'sync' || !S.initialDone) syncAll('retry'); else run(() => uploadDirty('retry'));
  }
  function schedule(now) {
    clearTimeout(S.tmr); if (!S.user || !Object.keys(S.dirty).length) return;
    if (S.retryTmr && !now) return;   // an offline retry is already queued
    const gap = Math.max(0, S.lastUp + tune('minGapMs') - Date.now());
    S.tmr = setTimeout(() => { S.tmr = null; run(() => uploadDirty('save')); }, now ? 0 : Math.max(tune('debounceMs'), gap));
  }
  function clearTimers() { clearTimeout(S.tmr); clearTimeout(S.retryTmr); S.tmr = S.retryTmr = null; S.retryKind = null; S.retryAt = 0; S.attempt = 0; }
  function onLocalWrite(slot, removed) {
    if (!removed) setLocalAt(slot, Date.now());
    if (!S.user || S.reloading) return;
    S.dirty[slot] = true; schedule(false);
  }
  function flushNow() { if (S.user && Object.keys(S.dirty).length && !S.reloading) { clearTimeout(S.retryTmr); S.retryTmr = null; S.retryKind = null; schedule(true); } }

  async function resolve(choice) {
    const c = S.conflicts[0]; if (!c || S.busy) return;
    S.busy = true; render();
    try {
      if (choice === 'cloud') {
        const reload = c.slot === 'main' && gameStarted();
        if (reload) S.reloading = true;
        if (c.C) pull(c.slot, c.C); else { writeLocal(c.slot, null); setLocalAt(c.slot, 0); setBase(c.slot, null); }
        if (reload) { S.msg = { t: 'info', m: 'Loading the cloud save…' }; render(); setTimeout(() => location.reload(), 350); return; }
      } else {
        const L = readLocal(c.slot);
        await queued(async () => { if (L) await push(c.slot, L); else { await withTimeout(savesCol().doc(c.slot).delete(), 0, 'cloud delete'); setBase(c.slot, null); } });
      }
      S.conflicts.shift(); delete S.paused[c.slot]; delete S.dirty[c.slot];
      S.status = S.conflicts.length ? 'conflict' : 'synced'; S.lastSync = Date.now();
      S.view = S.conflicts.length ? 'conflict' : null;
      gameLog(choice === 'cloud' ? 'Kept the cloud save.' : 'Kept this device’s save; the cloud copy now matches it.');
    } catch (e) {
      S.msg = { t: 'bad', m: offlineish(e) ? 'You seem to be offline. Try again when you are back online.' : 'That did not work: ' + ((e && e.code) || (e && e.message) || e) };
    } finally { S.busy = false; render(); }
  }
  function decideLater() { S.view = null; S.msg = null; render(); }

  async function deleteData() {
    if (!S.user || S.busy) return; S.busy = true; S.msg = { t: 'info', m: 'Deleting your cloud data…' }; render();
    const uid = S.user.uid;
    try {
      const q = await withTimeout(savesCol().get(SERVER), 0, 'cloud read');
      const b = S.db.batch(); q.forEach(d => b.delete(d.ref)); b.delete(S.db.collection('users').doc(uid));
      await withTimeout(b.commit(), 0, 'cloud delete');
      saveMeta(uid, null); S.conflicts = []; S.paused = {}; S.dirty = {};
      await delUser();
    } catch (e) {
      S.msg = { t: 'bad', m: offlineish(e) ? 'You seem to be offline, so nothing was deleted. Try again when you are back online.' : 'Could not delete: ' + ((e && e.code) || e) };
      S.view = 'panel';
    } finally { S.busy = false; render(); }
  }
  async function delUser() {
    const u = S.auth.currentUser; if (!u) return;
    try {
      await withTimeout(u.delete(), 0, 'account delete');
      lsSet(K.was, null); S.view = 'panel'; S.msg = { t: 'ok', m: 'Your cloud saves and your account are deleted. Saves on this device are untouched.' };
      gameLog('Cloud data deleted. Your save stays in this browser.');
    } catch (e) {
      if (e && e.code === 'auth/requires-recent-login') { S.view = 'reauth'; S.msg = { t: 'warn', m: 'Your cloud saves are deleted. To delete the account itself, confirm it is you by signing in once more.' }; }
      else throw e;
    }
  }
  async function reauthAndDelete() {
    const u = S.auth && S.auth.currentUser; if (!u || S.busy) return;
    const pid = (u.providerData || []).map(p => p.providerId).find(p => p !== 'password');
    const id = Object.keys(PROV).find(k => PROV[k].pid === pid);
    if (!id) { S.msg = { t: 'warn', m: 'Sign out, sign in again with a new email link, then press Delete cloud data again.' }; render(); return; }
    S.busy = true; render();
    try { await u.reauthenticateWithPopup(makeProvider(id)); await delUser(); }
    catch (e) { authError(e, id); }
    finally { S.busy = false; render(); }
  }

  /* ---------- UI ---------- */
  const CSS = `
#aom-ov{position:fixed;inset:0;z-index:90;display:grid;place-items:center;padding:12px;box-sizing:border-box;background:rgba(6,8,14,.55);font-family:var(--ui)}
.aom-pan{width:min(460px,100%);max-height:calc(100vh - 24px);display:flex;flex-direction:column;font-size:12px;zoom:var(--uiz)}
.aom-pan.wide{width:min(600px,100%)}
.aom-pan>.rbd{overflow:auto;padding:10px 12px 12px;display:grid;gap:9px}
.aom-pan p{margin:0;line-height:1.5}
.aom-lead{font-size:12.5px}
.aom-prov{display:grid;grid-template-columns:1fr 1fr;gap:5px}
.aom-prov .btn,.aom-pb{display:flex;align-items:center;gap:8px;padding:5px 8px;text-align:left;min-height:30px}
.aom-g{width:18px;height:18px;flex:none;border-radius:3px;display:grid;place-items:center;font:800 11px/1 var(--ui);box-sizing:border-box}
.aom-g.ms{display:grid;grid-template-columns:1fr 1fr;gap:1.5px;padding:2px}.aom-g.ms i{display:block}
.aom-av{width:40px;height:40px;flex:none;border-radius:50%;object-fit:cover;box-sizing:border-box;border:1px solid var(--edge2);background:radial-gradient(120% 95% at 50% 28%,var(--well1),var(--well2));display:grid;place-items:center;font:400 19px/1 var(--disp);color:#e8d6a8}
.aom-av.sm{width:30px;height:30px;font-size:14px}.aom-av.xs{width:15px;height:15px;font-size:9px;border-width:1px}
.aom-me{display:grid;grid-template-columns:40px 1fr;gap:10px;align-items:center}
.aom-me b{font-size:14px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.aom-dot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:5px;vertical-align:1px;background:var(--faint)}
.aom-dot.ok{background:var(--good)}.aom-dot.warn{background:#e09a20}.aom-dot.bad{background:var(--bad)}.aom-dot.busy{background:#3a6ae0}
.aom-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.aom-row.end{justify-content:flex-end}
.aom-in{font:700 13px var(--ui);color:var(--ink);background:#fff;border:1px solid #8a98b6;padding:5px 8px;border-radius:3px;flex:1;min-width:0;box-sizing:border-box}
.aom-in:focus{outline:none;border-color:#3a6ae0}
.aom-msg{padding:6px 8px;border-radius:4px;line-height:1.45;border:1px solid #c4cde0;background:#f4f7fc}
.aom-msg.ok{background:#eef7ec;border-color:#b8dcb0}.aom-msg.warn{background:#fff8e0;border-color:#d8c070}.aom-msg.bad{background:#fdeeee;border-color:#e0a8a8;color:#8a1a10}
.aom-cmp{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.aom-side{background:#fff;border:1px solid #c4cde0;border-radius:4px;padding:7px 9px 8px;display:grid;gap:2px;align-content:start}
.aom-side .sec{margin:0 0 4px}
.aom-side b.n{font-size:14px}
.aom-side .tag{justify-self:start;font:800 9.5px var(--ui);padding:1px 6px;border-radius:8px;background:#e8edf6;border:1px solid #b8c3da;color:#34426a;margin-top:3px}
.aom-side .tag.hi{background:#fff4dc;border-color:#e0a040;color:#8a5a00}
.aom-side .btn{margin-top:7px}
.aom-links{font-size:11px;color:var(--dim)}.aom-links a{color:#2446d0}
.aom-slot{display:grid;gap:1px;padding:5px 7px;background:#fff;border:1px solid #d6dce8;border-radius:3px;font-size:11.5px}
.aom-tc{margin-top:8px;text-align:left}
.aom-tc .rbd{display:flex;align-items:center;gap:9px;padding:7px 9px}
.aom-tc .aom-tx{flex:1;min-width:0;display:grid;gap:1px;font-size:11.5px;line-height:1.35}
.aom-tc .aom-tx b{font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.aom-tc .aom-tx small{font-size:11px;color:var(--dim)}
.menu .aom-chip{grid-column:1 / -1;gap:5px;min-width:0;overflow:hidden}
.menu .aom-chip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media (max-width:520px){.aom-cmp{grid-template-columns:1fr}.aom-prov{grid-template-columns:1fr}}
@media (max-width:760px){.menu .aom-chip{font-size:9.5px}}`;
  function ensureCss() { if (byId('aom-auth-css')) return; const s = document.createElement('style'); s.id = 'aom-auth-css'; s.textContent = CSS; document.head.appendChild(s); }
  function mark(id) {
    const p = PROV[id]; if (!p) return '';
    if (p.mark === 'ms') return `<span class="aom-g ms" style="background:#fff;border:1px solid #c4cde0" aria-hidden="true"><i style="background:#f25022"></i><i style="background:#7fba00"></i><i style="background:#00a4ef"></i><i style="background:#ffb900"></i></span>`;
    return `<span class="aom-g" aria-hidden="true" style="background:${p.bg};color:${p.fg};${p.bd ? `border:1px solid ${p.bd}` : ''}">${escH(p.mark)}</span>`;
  }
  function avatar(cls) {
    const u = S.user; const ini = u ? escH((u.name || '?').trim().charAt(0).toUpperCase() || '?') : '☁';
    if (u && u.photo) return `<img class="aom-av ${cls || ''}" src="${escH(u.photo)}" alt="" referrerpolicy="no-referrer" data-ini="${ini}">`;
    return `<span class="aom-av ${cls || ''}" aria-hidden="true">${ini}</span>`;
  }
  function fixAvatars(root) { root.querySelectorAll('img.aom-av').forEach(img => { img.onerror = () => { const s = document.createElement('span'); s.className = img.className; s.textContent = img.dataset.ini || '?'; img.replaceWith(s); }; }); }
  function statusInfo() {
    const st = S.status;
    if (st === 'checking') return ['busy', 'Checking your cloud save…'];
    if (st === 'uploading') return ['busy', 'Saving to the cloud…'];
    if (st === 'synced') return ['ok', 'Cloud save up to date' + (S.lastSync ? ` · ${new Date(S.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '')];
    if (st === 'offline') return ['warn', 'Offline: saves stay on this device and upload when you are back' + (S.retryAt ? ` (next try ${Math.max(1, Math.round((S.retryAt - Date.now()) / 1000))} s)` : '')];
    if (st === 'conflict') return ['warn', 'Your cloud save needs a choice'];
    if (st === 'error') return ['bad', S.err || 'Cloud save error'];
    return ['', 'Signed in'];
  }
  function titleCard() {
    if (!S.user) return `<div class="rbd">${avatar('sm')}<span class="aom-tx"><b>Playing as a guest</b><small>Saves stay in this browser. Sign in to keep them in the cloud as well.</small></span><button class="btn" data-aom="open" type="button">Sign in</button></div>`;
    const [d, t] = statusInfo();
    return `<div class="rbd">${avatar('sm')}<span class="aom-tx"><b>${escH(S.user.name)}</b><small><i class="aom-dot ${d}"></i>${escH(t)}</small></span><button class="btn" data-aom="open" type="button">Account</button></div>`;
  }
  function injectTitle() {
    try {
      const t = byId('title'); const w = t && t.querySelector('.t-wrap'); if (!w) return;
      let c = byId('aom-tc');
      if (!c || c.parentNode !== w) { c = document.createElement('div'); c.id = 'aom-tc'; c.className = 'rwin aom-tc'; w.insertBefore(c, w.querySelector('.t-foot')); }
      c.innerHTML = titleCard(); fixAvatars(c);
    } catch (e) { /* the title screen changed shape: skip */ }
  }
  function injectChip() {
    try {
      const m = document.querySelector('#info .menu'); if (!m) return;
      let b = byId('aom-chip');
      const show = !!S.user || configured();
      if (!show) { if (b) b.remove(); return; }
      if (!b) { b = document.createElement('button'); b.id = 'aom-chip'; b.type = 'button'; b.className = 'btn aom-chip'; b.dataset.aom = 'open'; m.appendChild(b); }
      if (S.user) { const [d, t] = statusInfo(); b.title = t; b.innerHTML = `${avatar('xs')}<span>${escH(S.user.name)}</span><i class="aom-dot ${d}" style="margin:0 0 0 auto;flex:none"></i>`; fixAvatars(b); }
      else { b.title = 'Sign in to keep your save in the cloud'; b.innerHTML = '<span>☁ Sign in · cloud save</span>'; }
    } catch (e) { /* */ }
  }
  let locked = null;
  function lockTitle() {
    if (gameStarted()) return;
    ['bCont', 'bNew'].forEach(id => { const b = byId(id); if (b && !b.disabled) { b.disabled = true; b.dataset.aomLock = '1'; } });
    clearTimeout(locked); locked = setTimeout(unlockTitle, tune('titleWaitMs'));
  }
  function unlockTitle() { clearTimeout(locked); locked = null; document.querySelectorAll('[data-aom-lock]').forEach(b => { b.disabled = false; delete b.dataset.aomLock; }); }
  function retitle() {
    try { const t = byId('title'); if (t && !t.hidden && !gameStarted() && typeof showTitle === 'function') showTitle(); } catch (e) { console.warn('[auth] showTitle', e); }
    if (S.status === 'checking' && !S.initialDone) lockTitle();
  }

  function sideHTML(label, str, doc, at, other, otherAt) {
    const s = str ? summary(str) : null;
    if (!s) return `<div class="aom-side"><div class="sec">${label}</div><span class="muted">No saved character</span></div>`;
    const o = other ? summary(other) : null;
    const tags = [];
    if (!o || s.playTime > o.playTime + 1) tags.push('<span class="tag hi">More play time</span>');
    if (at && (!otherAt || at > otherAt + 1000)) tags.push('<span class="tag">Saved more recently</span>');
    const mp = mapName(s.map);
    return `<div class="aom-side"><div class="sec">${label}</div><b class="n">${escH(s.name)}</b>
      <span>Lv ${s.lvl} ${escH(clsName(s.cls))} · Job ${s.jlvl}${s.reborn ? ' · Reborn' : ''}</span>
      <span class="muted">Played ${fmtPlay(s.playTime)}${mp ? ` · ${escH(mp)}` : ''}</span>
      <span class="muted">Saved ${fmtWhen(at)}</span>${tags.join('')}</div>`;
  }
  function msgHTML() { return S.msg ? `<div class="aom-msg ${S.msg.t}" role="status">${escH(S.msg.m)}</div>` : ''; }
  const links = () => `<p class="aom-links"><a href="privacy.html" target="_blank" rel="noopener">Privacy</a> · <a href="data-deletion.html" target="_blank" rel="noopener">Deleting your data</a></p>`;
  function panelHTML() {
    const dis = S.busy ? 'disabled' : '';
    if (!configured()) {
      return `<div class="rtb"><span>Account</span><button class="x" data-aom="close" aria-label="Close" type="button">×</button></div><div class="rbd">
        <div class="aom-msg warn" role="status"><b>Cloud login is not set up yet.</b></div>
        <p>You can keep playing as a guest: your saves stay in this browser, exactly as before.</p>
        <p class="muted">(For the game’s owner: paste the Firebase web config into js/auth-config.js. The steps are in docs/AUTH-SETUP.md.)</p>
        <div class="aom-row end"><button class="btn" data-aom="close" type="button">OK</button></div></div>`;
    }
    if (!S.user) {
      const ps = providers(), oauth = ps.filter(p => p !== 'email');
      return `<div class="rtb"><span>Sign In</span><button class="x" data-aom="close" aria-label="Close" type="button">×</button></div><div class="rbd">
        <p class="aom-lead">Sign in to keep your saves in the cloud and carry on from any device. It is optional: guest play works exactly as before.</p>
        ${msgHTML()}
        ${oauth.length ? `<div class="aom-prov">${oauth.map(id => `<button class="btn" data-aom="signin:${id}" type="button" ${dis}>${mark(id)}<span>Continue with ${PROV[id].label}</span></button>`).join('')}</div>` : ''}
        ${ps.includes('email') || S.needEmail ? `<div class="sec">${S.needEmail ? 'Confirm your email' : 'Or get a sign-in link by email'}</div>
          <form class="aom-row" data-aom-form="email"><input class="aom-in" id="aom-email" type="email" autocomplete="email" placeholder="you@example.com" aria-label="Email address" value="${escH(S.emailSent || '')}"><button class="btn" type="submit" ${dis}>${S.needEmail ? 'Finish signing in' : 'Email me a link'}</button></form>` : ''}
        <p class="muted" style="font-size:11px">We keep only your sign-in id, display name, avatar link and your saves. No ads, no tracking.</p>
        ${links()}</div>`;
    }
    const u = S.user, [d, t] = statusInfo();
    const slots = [...new Set([...localSlots(), ...Object.keys(metaOf(u.uid).slots)])];
    const slotRows = slots.map(sl => {
      const L = readLocal(sl), s = summary(L), m = metaOf(u.uid).slots[sl], inSync = L && m && m.base === csum(L);
      return `<div class="aom-slot"><b>${sl === 'main' ? 'Your character' : 'Slot ' + escH(sl)}</b>${s ? `<span>${escH(s.name)} · Lv ${s.lvl} ${escH(clsName(s.cls))} · Job ${s.jlvl} · played ${fmtPlay(s.playTime)}</span>` : '<span class="muted">No save on this device</span>'}
        <span class="muted">${S.paused[sl] ? 'Waiting for your choice between the cloud and this device' : inSync ? `In the cloud, same as this device (cloud copy from ${fmtWhen(m.at)})` : m ? 'Changed since the last upload; uploads shortly' : 'Not in the cloud yet'}</span></div>`;
    }).join('');
    const via = u.providers.map(p => PID_LABEL[p] || p).filter((x, i, a) => a.indexOf(x) === i).join(' + ') || 'your account';
    return `<div class="rtb"><span>Account</span><button class="x" data-aom="close" aria-label="Close" type="button">×</button></div><div class="rbd">
      <div class="aom-me">${avatar()}<div style="min-width:0"><b>${escH(u.name)}</b><span class="muted">Signed in with ${escH(via)}</span></div></div>
      <div><i class="aom-dot ${d}"></i>${escH(t)}</div>
      ${msgHTML()}
      ${S.conflicts.length ? `<button class="btn big" data-aom="conflict" type="button">Choose which save to keep</button>` : ''}
      <div class="sec">Cloud save</div>${slotRows}
      <div class="aom-row"><button class="btn" data-aom="sync" type="button" ${dis}>Sync now</button><button class="btn" data-aom="signout" type="button" ${dis}>Sign out</button><button class="btn warn" data-aom="delete" type="button" ${dis} style="margin-left:auto">Delete cloud data</button></div>
      <p class="muted" style="font-size:11px">Signing out keeps the copy on this device. Your save uploads a few seconds after the game saves, and when you leave the page.</p>
      ${links()}</div>`;
  }
  function conflictHTML() {
    const c = S.conflicts[0], dis = S.busy ? 'disabled' : '';
    const cloudAt = c.C ? c.C.updatedAt : 0, localT = c.at;
    const inGame = c.slot === 'main' && gameStarted();
    return `<div class="rtb"><span>Cloud Save · Choose One</span><button class="x" data-aom="later" aria-label="Decide later" title="Decide later" type="button">×</button></div><div class="rbd">
      <p class="aom-lead"><b>This device and your cloud save have different progress${c.slot !== 'main' ? ` (slot ${escH(c.slot)})` : ''}.</b> Choose the one to keep: the other copy is replaced by it.</p>
      <div class="aom-cmp">
        <div>${sideHTML('In the cloud', c.C && c.C.data, c.C, cloudAt, c.L, localT)}</div>
        <div>${sideHTML('On this device', c.L, null, localT, c.C && c.C.data, cloudAt)}</div>
      </div>
      ${msgHTML()}
      <div class="aom-cmp"><button class="btn big" data-aom="keep:cloud" type="button" ${dis}>Keep cloud</button><button class="btn big" data-aom="keep:local" type="button" ${dis}>${c.L ? 'Keep this device' : 'Keep this device (erase the cloud copy)'}</button></div>
      <p class="muted" style="font-size:11px">${inGame ? 'Keep cloud reloads the game into the cloud save. ' : ''}Not sure? Close this window: nothing is replaced, and cloud saving for this character pauses until you choose (Account, then “Choose which save to keep”).</p></div>`;
  }
  function confirmHTML() {
    const dis = S.busy ? 'disabled' : '';
    return `<div class="rtb"><span>Delete Cloud Data</span><button class="x" data-aom="panel" aria-label="Back" type="button">×</button></div><div class="rbd">
      <p class="aom-lead"><b>Delete your cloud saves and your Ashes of Midgard account?</b></p>
      <p>Every save stored in the cloud for <b>${escH(S.user ? S.user.name : '')}</b> is removed, then the sign-in account itself. This cannot be undone.</p>
      <p class="muted">Saves in this browser are not touched: you can keep playing here as a guest.</p>
      ${msgHTML()}
      <div class="aom-row end"><button class="btn" data-aom="panel" type="button" ${dis}>Cancel</button><button class="btn warn big" data-aom="delete-yes" type="button" ${dis}>Delete forever</button></div></div>`;
  }
  function reauthHTML() {
    return `<div class="rtb"><span>Delete Cloud Data</span><button class="x" data-aom="close" aria-label="Close" type="button">×</button></div><div class="rbd">
      ${msgHTML()}
      <div class="aom-row end"><button class="btn" data-aom="close" type="button">Later</button><button class="btn warn" data-aom="reauth" type="button" ${S.busy ? 'disabled' : ''}>Confirm and delete the account</button></div></div>`;
  }
  function render() {
    try {
      injectTitle(); injectChip();
      let ov = byId('aom-ov');
      if (!S.view) { if (ov) ov.remove(); return; }
      ensureCss();
      if (S.view === 'conflict' && !S.conflicts.length) S.view = S.user ? 'panel' : null;
      if (!S.view) { if (ov) ov.remove(); return; }
      const fresh = !ov;
      if (!ov) {
        ov = document.createElement('div'); ov.id = 'aom-ov'; document.body.appendChild(ov);
        ov.addEventListener('click', onClick); ov.addEventListener('submit', onSubmit);
        ov.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') { if (S.view === 'conflict') decideLater(); else if (S.view === 'confirm') openView('panel'); else close(); } });
        ov.addEventListener('pointerdown', e => { if (e.target === ov && S.view !== 'conflict' && S.view !== 'confirm' && !S.busy) close(); });
      }
      const typed = byId('aom-email'); const draft = typed ? typed.value : null; const hadFocus = typed && document.activeElement === typed;
      const html = S.view === 'conflict' ? conflictHTML() : S.view === 'confirm' ? confirmHTML() : S.view === 'reauth' ? reauthHTML() : panelHTML();
      ov.innerHTML = `<div class="rwin aom-pan ${S.view === 'conflict' ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${S.view === 'conflict' ? 'Choose a save' : 'Account'}">${html}</div>`;
      fixAvatars(ov);
      const em = byId('aom-email'); if (em && draft !== null) { em.value = draft; if (hadFocus) em.focus(); }
      if (fresh) { const f = ov.querySelector('.rbd button:not([disabled]), .rbd input'); if (f && !isMobile()) try { f.focus({ preventScroll: true }); } catch (e) { /* */ } }
    } catch (e) { console.warn('[auth] render', e); }
  }
  function openView(v) { ensureCss(); S.view = v; render(); }
  function open() {
    try { if (typeof Sfx !== 'undefined' && Sfx.unlock) Sfx.unlock(); } catch (e) { /* */ }
    S.view = S.conflicts.length ? 'conflict' : 'panel'; if (!S.user && !S.link && !S.needEmail && S.msg && S.msg.t !== 'bad') S.msg = null;
    render();
    if (configured() && !S.auth) sdk().then(render).catch(e => { authError(e); render(); });   // warm the SDK while the player picks
  }
  function close() { if (S.busy && S.view !== 'panel') return; S.view = null; if (S.msg && S.msg.t !== 'bad') S.msg = null; render(); }
  function onClick(e) {
    const b = e.target.closest('[data-aom]'); if (!b || b.disabled) return;
    const a = b.dataset.aom; e.preventDefault();
    if (a === 'close') close();
    else if (a === 'later') decideLater();
    else if (a === 'panel') openView('panel');
    else if (a === 'conflict') openView('conflict');
    else if (a.startsWith('signin:')) signIn(a.slice(7));
    else if (a === 'signout') signOut();
    else if (a === 'sync') { S.msg = null; syncAll('manual'); }
    else if (a === 'delete') { S.msg = null; openView('confirm'); }
    else if (a === 'delete-yes') deleteData();
    else if (a === 'reauth') reauthAndDelete();
    else if (a.startsWith('keep:')) resolve(a.slice(5));
  }
  function onSubmit(e) { if (e.target && e.target.dataset.aomForm === 'email') { e.preventDefault(); const i = byId('aom-email'); sendEmailLink(i && i.value); } }
  // The title card and the menu chip live inside #game; their clicks are handled here.
  document.addEventListener('click', e => { const b = e.target && e.target.closest && e.target.closest('#aom-tc [data-aom="open"], #aom-chip'); if (b) { e.preventDefault(); open(); } });

  /* ---------- hooks into the game ---------- */
  const ORIG = {};
  function install() {
    let n = 0;
    try {
      if (typeof store === 'function' && !store.__aom) {
        const o = store; ORIG.store = o;
        const w = function (k, v) { const r = o.apply(this, arguments); try { if (v !== undefined && !selfWrite && typeof k === 'string') { const sl = slotOf(k); if (sl) onLocalWrite(sl, v === null); } } catch (e) { /* */ } return r; };
        w.__aom = true; store = w; n++;
      }
    } catch (e) { /* */ }
    try {
      if (typeof saveGame === 'function' && !saveGame.__aom) {
        const o = saveGame; ORIG.saveGame = o;
        const w = function () { if (S.reloading) return; return o.apply(this, arguments); };
        w.__aom = true; saveGame = w; n++;
      }
    } catch (e) { /* */ }
    try {
      if (typeof showTitle === 'function' && !showTitle.__aom) {
        const o = showTitle; ORIG.showTitle = o;
        const w = function () { const r = o.apply(this, arguments); try { injectTitle(); if (S.user && !S.initialDone) lockTitle(); } catch (e) { /* */ } return r; };
        w.__aom = true; showTitle = w; n++;
      }
    } catch (e) { /* */ }
    ensureCss(); render();
    return n;
  }
  function start() {
    install();
    addEventListener('load', () => { install(); render(); });
    addEventListener('pagehide', flushNow);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushNow(); });
    addEventListener('online', () => { if (S.user && (S.retryTmr || S.status === 'offline')) retryNow(); });
    const returning = lsGet(K.was) === '1' || !!lsGet(K.redirect) || emailLinkInUrl();
    if (returning && configured()) {
      S.status = 'checking'; lockTitle();
      const go = () => sdk().then(() => { if (!S.user) unlockTitle(); render(); }).catch(e => { unlockTitle(); S.status = 'guest'; if (!(e && e.code === 'aom/not-configured')) console.warn('[auth] could not load the sign-in service', e); render(); });
      if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true });
    }
  }

  /* ---------- mock Firebase (window.AOM_AUTH_MOCK = true): the compat calls used above, in memory ---------- */
  function makeMock() {
    const SS = 'aom-auth-mock-cloud', US = 'aom-auth-mock-user', RD = 'aom-auth-mock-redirect';
    const ssGet = k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
    const ssSet = (k, v) => { try { if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { /* */ } };
    const M = { docs: {}, offline: false, blockPopups: false, collide: null, requireRecent: false, latency: 20, calls: [], emails: [], writes: 0, reads: 0, deletedUsers: [] };
    const seed = window.AOM_AUTH_MOCK_SEED;
    M.docs = seed && seed.docs ? JSON.parse(JSON.stringify(seed.docs)) : jparse(ssGet(SS), {}) || {};
    const persist = () => ssSet(SS, JSON.stringify(M.docs));
    const who = () => Object.assign({ uid: 'mock-uid-1', displayName: 'Mock Skald', email: 'skald@example.test', photoURL: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#4a3b60"/><circle cx="20" cy="16" r="7" fill="#e8d6a8"/><path d="M7 38c2-9 8-13 13-13s11 4 13 13z" fill="#e8d6a8"/></svg>') }, window.AOM_AUTH_MOCK_USER || {});
    const err = (code, extra) => Object.assign(new Error('mock: ' + code), { code }, extra || {});
    const wait = () => sleep(M.latency);
    const listeners = [];
    const auth = { currentUser: null, useDeviceLanguage() {} };
    function mkUser(rec) {
      const u = { uid: rec.uid, displayName: rec.displayName, photoURL: rec.photoURL, email: rec.email, providerData: rec.providers.map(p => ({ providerId: p, email: rec.email })) };
      u.linkWithCredential = async cred => { await wait(); if (M.offline) throw err('auth/network-request-failed'); if (rec.providers.includes(cred.providerId)) throw err('auth/provider-already-linked'); rec.providers.push(cred.providerId); u.providerData.push({ providerId: cred.providerId }); save(rec); M.calls.push('link:' + cred.providerId); return { user: u }; };
      u.delete = async () => { await wait(); if (M.offline) throw err('auth/network-request-failed'); if (M.requireRecent) throw err('auth/requires-recent-login'); M.deletedUsers.push(rec.uid); M.calls.push('deleteUser'); setUser(null); };
      u.reauthenticateWithPopup = async p => { await wait(); M.requireRecent = false; M.calls.push('reauth:' + p.providerId); return { user: u }; };
      return u;
    }
    function save(rec) { try { if (rec) localStorage.setItem(US, JSON.stringify(rec)); else localStorage.removeItem(US); } catch (e) { /* */ } }
    function setUser(rec) { save(rec); auth.currentUser = rec ? mkUser(rec) : null; listeners.slice().forEach(cb => { try { cb(auth.currentUser); } catch (e) { console.error(e); } }); }
    function signInAs(pid, extra) {
      const w = Object.assign(who(), extra || {}); const cur = jparse((() => { try { return localStorage.getItem(US); } catch (e) { return null; } })(), null);
      const rec = cur && cur.uid === w.uid ? cur : { uid: w.uid, displayName: w.displayName, photoURL: w.photoURL, email: w.email, providers: [] };
      if (!rec.providers.includes(pid)) rec.providers.push(pid);
      setUser(rec); return { user: auth.currentUser };
    }
    const rec0 = jparse((() => { try { return localStorage.getItem(US); } catch (e) { return null; } })(), null);
    if (rec0 && rec0.uid) auth.currentUser = mkUser(rec0);
    auth.onAuthStateChanged = cb => { listeners.push(cb); setTimeout(() => cb(auth.currentUser), 0); return () => { const i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1); }; };
    auth.signInWithPopup = async p => {
      M.calls.push('popup:' + p.providerId); await wait();
      if (M.offline) throw err('auth/network-request-failed');
      if (M.blockPopups) throw err('auth/popup-blocked');
      if (M.collide && M.collide.providerId === p.providerId) { const c = M.collide; M.collide = null; const cred = { providerId: p.providerId, mock: true, toJSON() { return { providerId: p.providerId, mock: true }; } }; throw err('auth/account-exists-with-different-credential', { email: c.email, credential: cred }); }
      return signInAs(p.providerId);
    };
    auth.signInWithRedirect = async p => { M.calls.push('redirect:' + p.providerId); ssSet(RD, p.providerId); if (M.redirectReload !== false) setTimeout(() => location.reload(), 30); return new Promise(() => {}); };
    auth.getRedirectResult = async () => { await wait(); const pid = ssGet(RD); ssSet(RD, null); M.calls.push('getRedirectResult:' + (pid || '-')); return pid ? signInAs(pid) : { user: null, credential: null }; };
    auth.signOut = async () => { await wait(); M.calls.push('signOut'); setUser(null); };
    auth.sendSignInLinkToEmail = async (email, st) => { await wait(); if (M.offline) throw err('auth/network-request-failed'); M.emails.push({ email, url: st && st.url }); M.calls.push('emailLink'); };
    auth.isSignInWithEmailLink = url => /[?&]oobCode=MOCK/.test(url) && /[?&]mode=signIn/.test(url);
    auth.signInWithEmailLink = async email => { await wait(); return signInAs('password', { uid: 'mock-email-' + email.replace(/\W/g, '_'), displayName: null, photoURL: null, email }); };
    // Firestore: flat path map; the security rules in firestore.rules are emulated (own users/{uid}/** only, size cap).
    const ts = { __ts: true };
    function guard(path, data) {   // firestore.rules: own tree only; writes only to users/{uid}/saves/{slot}, validated
      const u = auth.currentUser; if (!u || !(path === 'users/' + u.uid || path.startsWith('users/' + u.uid + '/'))) throw err('permission-denied');
      if (data === undefined) return;
      const okKeys = ['data', 'updatedAt', 'v', 'checksum', 'size', 'summary', 'savedAt'];
      if (!new RegExp('^users/' + u.uid + '/saves/[A-Za-z0-9_]{1,24}$').test(path) || Object.keys(data).some(k => !okKeys.includes(k))
        || typeof data.data !== 'string' || !data.data.length || data.data.length > MAX_DATA || !Number.isInteger(data.updatedAt) || typeof data.checksum !== 'string') throw err('permission-denied');
    }
    async function net() { await wait(); if (M.offline) throw err('unavailable'); }
    const materialize = d => { const o = {}; for (const k in d) o[k] = d[k] === ts ? Date.now() : d[k]; return JSON.parse(JSON.stringify(o)); };
    function docRef(path) {
      const id = path.split('/').pop();
      return {
        id, path, collection: n => colRef(path + '/' + n),
        async get() { await net(); guard(path); M.reads++; const d = M.docs[path]; return { id, exists: !!d, ref: docRef(path), data: () => d ? JSON.parse(JSON.stringify(d)) : undefined }; },
        async set(d) { await net(); guard(path, d); M.writes++; M.docs[path] = materialize(d); persist(); },
        async delete() { await net(); guard(path); M.writes++; delete M.docs[path]; persist(); }
      };
    }
    function colRef(path) {
      return {
        path, doc: id => docRef(path + '/' + id),
        async get() {
          await net(); guard(path); const pre = path + '/', docs = [];
          for (const p of Object.keys(M.docs)) if (p.startsWith(pre) && !p.slice(pre.length).includes('/')) { const d = M.docs[p]; M.reads++; docs.push({ id: p.slice(pre.length), ref: docRef(p), exists: true, data: () => JSON.parse(JSON.stringify(d)) }); }
          return { docs, size: docs.length, empty: !docs.length, forEach: f => docs.forEach(f) };
        }
      };
    }
    const db = {
      collection: n => colRef(n),
      batch() { const ops = []; return { set(r, d) { ops.push(['set', r, d]); }, delete(r) { ops.push(['del', r]); }, async commit() { await net(); for (const [k, r, d] of ops) { guard(r.path, d); } for (const [k, r, d] of ops) { M.writes++; if (k === 'set') M.docs[r.path] = materialize(d); else delete M.docs[r.path]; } persist(); } }; }
    };
    class P0 { constructor(id) { this.providerId = id; this.params = {}; this.scopes = []; } setCustomParameters(o) { this.params = o; return this; } addScope(s) { this.scopes.push(s); return this; } }
    const authNs = Object.assign(() => auth, {
      GoogleAuthProvider: class extends P0 { constructor() { super('google.com'); } }, FacebookAuthProvider: class extends P0 { constructor() { super('facebook.com'); } },
      TwitterAuthProvider: class extends P0 { constructor() { super('twitter.com'); } }, GithubAuthProvider: class extends P0 { constructor() { super('github.com'); } },
      OAuthProvider: P0, AuthCredential: { fromJSON: j => Object.assign({ toJSON() { return j; } }, j) }
    });
    const fb = { apps: [], initializeApp(c) { const a = { name: '[DEFAULT]', options: c }; this.apps.push(a); return a; }, app() { return this.apps[0]; }, auth: authNs, firestore: Object.assign(() => db, { FieldValue: { serverTimestamp: () => ts } }) };
    fb.M = M; M.dump = () => JSON.parse(JSON.stringify(M.docs)); M.reset = () => { M.docs = {}; persist(); };
    M.setOffline = v => { M.offline = !!v; };
    return fb;
  }

  /* ---------- public ---------- */
  window.AOM_CLOUD = {
    version: CLIENT,
    open, close, signIn: id => signIn(id), signOut: () => signOut(), syncNow: () => syncAll('manual'), flush: flushNow,
    resolve: c => resolve(c), deleteData: () => deleteData(), sendEmailLink: e => sendEmailLink(e),
    configured, providers,
    state: () => ({ status: S.status, view: S.view, user: S.user && Object.assign({}, S.user), dirty: Object.keys(S.dirty), paused: Object.keys(S.paused), conflicts: S.conflicts.map(c => ({ slot: c.slot, local: summary(c.L), cloud: c.C ? summary(c.C.data) : null })), msg: S.msg, busy: S.busy, initialDone: S.initialDone, attempt: S.attempt, retryAt: S.retryAt, sdk: !!S.auth, stats: Object.assign({}, S.stats), hooks: { store: !!ORIG.store, saveGame: !!ORIG.saveGame, showTitle: !!ORIG.showTitle } }),
    idle: () => S.chain,
    get mock() { return S.mock ? S.mock.M : null; },
    _csum: csum
  };
  try { start(); } catch (e) { console.warn('[auth] start', e); }
})();
