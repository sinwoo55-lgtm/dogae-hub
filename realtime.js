(function () {
  var unsubscribe = null;
  var refreshTimer = null;
  var started = false;
  var syncingVersion = -1;
  var initialLoad = null;
  var queuedVersion = null;
  var CACHE_KEY = 'dogae-hub-schedule-cache-v1';

  function announce(type, detail) {
    window.dispatchEvent(new CustomEvent(type, { detail: detail }));
  }

  function readCache() {
    try {
      var cache = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      return cache && Number.isInteger(cache.version) && Array.isArray(cache.posts) ? cache : null;
    } catch (error) {
      return null;
    }
  }

  function writeCache(cache) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (error) { console.warn('일정 로컬 캐시를 저장하지 못했습니다.', error); }
  }

  function order(posts) {
    return posts.slice().sort(function (a, b) { return String(b.ts || '').localeCompare(String(a.ts || '')); });
  }

  function applyChanges(cache, changes, version) {
    var byId = new Map((cache ? cache.posts : []).map(function (post) { return [post.id, post]; }));
    changes.forEach(function (change) {
      if (change.type === 'delete') byId.delete(change.id);
      else if (change.type === 'upsert' && change.post && change.post.id) byId.set(change.post.id, change.post);
    });
    return { version: version, posts: order(Array.from(byId.values())), savedAt: Date.now() };
  }

  function warmScheduleCache() {
    var cache = readCache();
    if (cache) announce('dogae-realtime-posts', cache.posts);
    return cache;
  }

  function queueInitialVersion(version) {
    if (!initialLoad) return sync(version);
    queuedVersion = version;
  }

  async function sync(version) {
    if (syncingVersion === version) return;
    syncingVersion = version;
    try {
      var cache = readCache();
      if (cache && cache.version === version) {
        announce('dogae-realtime-posts', cache.posts);
        return;
      }
      var since = cache ? cache.version : '';
      var response = await fetch('/api/schedule-sync?version=' + encodeURIComponent(since), { credentials: 'same-origin' });
      var payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '일정 동기화에 실패했습니다.');
      var next;
      if (payload.mode === 'unchanged') next = cache || { version: payload.version, posts: [], savedAt: Date.now() };
      else if (payload.mode === 'delta') next = applyChanges(cache, payload.changes || [], payload.version);
      else next = { version: payload.version, posts: order(payload.posts || []), savedAt: Date.now() };
      writeCache(next);
      announce('dogae-realtime-posts', next.posts);
      announce('dogae-realtime-status', { connected: true });
    } catch (error) {
      console.warn('일정 동기화 오류', error);
      announce('dogae-realtime-status', { connected: false, error: error.message });
    } finally {
      syncingVersion = -1;
    }
  }

  async function start() {
    if (started) return;
    started = true;
    try {
      var response = await fetch('/api/realtime-token', { credentials: 'same-origin' });
      var setup = await response.json();
      if (!response.ok) throw new Error(setup.error || '실시간 일정 인증에 실패했습니다.');
      var modules = await Promise.all([
        import('https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js'),
        import('https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js'),
      ]);
      var appModule = modules[0], authModule = modules[1], firestoreModule = modules[2];
      var firebaseApp = appModule.getApps().length ? appModule.getApp() : appModule.initializeApp(setup.firebase);
      var auth = authModule.getAuth(firebaseApp);
      await authModule.setPersistence(auth, authModule.browserSessionPersistence);
      await authModule.signInWithCustomToken(auth, setup.token);
      var store = firestoreModule.getFirestore(firebaseApp);
      unsubscribe = firestoreModule.onSnapshot(firestoreModule.doc(store, 'dashboard_meta', 'schedule_version'), function (snapshot) {
        queueInitialVersion(Number(snapshot.exists() ? snapshot.data().version : 0));
      }, function (error) {
        console.warn('실시간 버전 연결 오류', error);
        announce('dogae-realtime-status', { connected: false, error: error.message });
      });
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(function () {
        if (unsubscribe) unsubscribe();
        unsubscribe = null;
        started = false;
        start();
      }, Math.max(60000, Number(setup.refreshAfter) || 600000));
    } catch (error) {
      started = false;
      console.warn('실시간 일정 기능을 시작하지 못했습니다.', error);
      announce('dogae-realtime-status', { connected: false, error: error.message });
    }
  }

  document.addEventListener('change', function (event) {
    if (event.target && event.target.id === 'classSelect' && event.target.value) start();
  });
  window.DogaeRealtime = { start: start };
  if (document.documentElement.dataset.realtime === 'on') {
    if (!warmScheduleCache()) {
      initialLoad = sync(-1).finally(function () {
        initialLoad = null;
        if (queuedVersion !== null) {
          var version = queuedVersion;
          queuedVersion = null;
          sync(version);
        }
      });
    }
    start();
  }
})();
