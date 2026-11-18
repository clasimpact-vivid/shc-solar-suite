/* SHC Solar Suite – conectare invizibilă la Firebase (login anonim).
 * Faza 1 a securizării bazei de date (18.11.2026).
 *
 * Ce face:
 *  - fiecare aplicație se conectează la Firebase cu un cont anonim, fără ca utilizatorul să vadă ceva;
 *  - toate cererile REST către baza de date (fetch la ...firebaseio.com) primesc automat token-ul (?auth=...);
 *  - dacă ceva nu merge (SDK lipsă, rețea), aplicația continuă exact ca înainte – nu blochează nimic.
 *
 * Folosire:
 *  - SDK compat:   SHCAuth.startCompat(firebase)            (după firebase.initializeApp)
 *  - SDK modular:  SHCAuth.startModular(auth, signInAnonymously, onAuthStateChanged)
 *  - doar REST:    SHCAuth.startRest()                     (pagini fără SDK Firebase)
 */
(function () {
  'use strict';
  if (window.SHCAuth) return;

  var DB_HOST = 'solarcrm-ba919-default-rtdb.firebaseio.com';
  var API_KEY = 'AIzaSyBVElgXbEabUcwjNMa27IEw0YkxaEaXYl0';
  var READY_TIMEOUT_MS = 5000;

  var getToken = null;          // function () -> Promise<string|null>
  var resolveReady;
  var ready = new Promise(function (r) { resolveReady = r; });
  // Nu ținem niciodată aplicația blocată: după 5 s mergem mai departe oricum.
  setTimeout(function () { resolveReady(); }, READY_TIMEOUT_MS);

  function log() { try { console.info.apply(console, ['[SHCAuth]'].concat([].slice.call(arguments))); } catch (e) {} }
  function warn() { try { console.warn.apply(console, ['[SHCAuth]'].concat([].slice.call(arguments))); } catch (e) {} }

  /* Prima conectare într-un browser: listenerii SDK porniți înainte de login pot fi refuzați
   * de reguli. Reîncărcăm pagina o singură dată, imediat după primul login anonim. */
  function reloadOnceAfterFirstSignIn(key) {
    try {
      if (localStorage.getItem('shc_auth_first_done:' + key)) return;
      localStorage.setItem('shc_auth_first_done:' + key, '1');
      if (sessionStorage.getItem('shc_auth_reloaded:' + key)) return;
      sessionStorage.setItem('shc_auth_reloaded:' + key, '1');
      log('prima conectare – reîncarc pagina o dată');
      location.reload();
    } catch (e) {}
  }

  /* ---------- SDK compat (firebase-app-compat + firebase-auth-compat) ---------- */
  function startCompat(fb) {
    try {
      if (!fb || typeof fb.auth !== 'function') { warn('firebase-auth-compat lipsește'); resolveReady(); return; }
      var a = fb.auth();
      var key = 'compat:' + (a.app && a.app.name || 'default');
      getToken = function () { var u = a.currentUser; return u ? u.getIdToken() : Promise.resolve(null); };
      var first = true;
      a.onAuthStateChanged(function (u) {
        if (u) { resolveReady(); if (first) { first = false; try { localStorage.setItem('shc_auth_first_done:' + key, '1'); } catch (e) {} } return; }
        first = false;
        a.signInAnonymously().then(function () { log('conectat anonim'); resolveReady(); reloadOnceAfterFirstSignIn(key); })
          .catch(function (e) { warn('login anonim eșuat', e && e.code); resolveReady(); });
      });
    } catch (e) { warn(e); resolveReady(); }
  }

  /* ---------- SDK modular (firebase-auth.js, v9+) ---------- */
  function startModular(auth, signInAnonymously, onAuthStateChanged) {
    try {
      getToken = function () { var u = auth.currentUser; return u ? u.getIdToken() : Promise.resolve(null); };
      var key = 'mod:' + (auth.app && auth.app.name || 'default');
      var first = true;
      onAuthStateChanged(auth, function (u) {
        if (u) { resolveReady(); if (first) { first = false; try { localStorage.setItem('shc_auth_first_done:' + key, '1'); } catch (e) {} } return; }
        first = false;
        signInAnonymously(auth).then(function () { log('conectat anonim'); resolveReady(); reloadOnceAfterFirstSignIn(key); })
          .catch(function (e) { warn('login anonim eșuat', e && e.code); resolveReady(); });
      });
    } catch (e) { warn(e); resolveReady(); }
  }

  /* ---------- doar REST (fără SDK) ---------- */
  var REST_KEY = 'shc_auth_rest_v1';
  function startRest() {
    var st = null;
    try { st = JSON.parse(localStorage.getItem(REST_KEY) || 'null'); } catch (e) {}
    var inflight = null;
    function save() { try { localStorage.setItem(REST_KEY, JSON.stringify(st)); } catch (e) {} }
    function signUp() {
      return fetchOrig('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + API_KEY, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true })
      }).then(function (r) { return r.json(); }).then(function (j) {
        if (!j.idToken) throw new Error('signUp: ' + JSON.stringify(j.error || j));
        st = { id: j.idToken, rt: j.refreshToken, exp: Date.now() + (+j.expiresIn - 120) * 1000 }; save(); return st.id;
      });
    }
    function refresh() {
      return fetchOrig('https://securetoken.googleapis.com/v1/token?key=' + API_KEY, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(st.rt)
      }).then(function (r) { return r.json(); }).then(function (j) {
        if (!j.id_token) throw new Error('refresh');
        st = { id: j.id_token, rt: j.refresh_token, exp: Date.now() + (+j.expires_in - 120) * 1000 }; save(); return st.id;
      }).catch(function () { st = null; return signUp(); });
    }
    getToken = function () {
      if (st && st.id && st.exp > Date.now()) return Promise.resolve(st.id);
      if (!inflight) inflight = (st && st.rt ? refresh() : signUp())
        .catch(function (e) { warn('token REST indisponibil', e && e.message); return null; })
        .then(function (t) { inflight = null; return t; });
      return inflight;
    };
    getToken().then(function () { resolveReady(); });
  }

  /* ---------- token automat pe toate cererile REST către baza de date ---------- */
  var fetchOrig = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || String(input);
    if (url.indexOf(DB_HOST) === -1 || /[?&]auth=/.test(url)) return fetchOrig(input, init);
    return ready
      .then(function () { return getToken ? getToken() : null; })
      .catch(function () { return null; })
      .then(function (t) {
        if (!t) return fetchOrig(input, init);
        var u2 = url + (url.indexOf('?') === -1 ? '?' : '&') + 'auth=' + encodeURIComponent(t);
        return fetchOrig(typeof input === 'string' ? u2 : new Request(u2, input), init);
      });
  };

  window.SHCAuth = {
    startCompat: startCompat,
    startModular: startModular,
    startRest: startRest,
    ready: ready,
    token: function () { return ready.then(function () { return getToken ? getToken() : null; }); }
  };
})();
