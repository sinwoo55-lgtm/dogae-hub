(function () {
  var unsubscribe = null;
  var refreshTimer = null;
  var started = false;

  function announce(type, detail) {
    window.dispatchEvent(new CustomEvent(type, { detail: detail }));
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
      var today = new Date();
      var todayKey = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
      unsubscribe = firestoreModule.onSnapshot(
        firestoreModule.query(firestoreModule.collection(store, 'dashboard_posts'), firestoreModule.where('realtimeUntil', '>=', todayKey)),
        function (snapshot) {
          announce('dogae-realtime-posts', snapshot.docs.map(function (doc) { return Object.assign({ id: doc.id }, doc.data()); }).sort(function (a, b) {
            var aTime = a.ts && typeof a.ts.toMillis === 'function' ? a.ts.toMillis() : 0;
            var bTime = b.ts && typeof b.ts.toMillis === 'function' ? b.ts.toMillis() : 0;
            return bTime - aTime;
          }));
          announce('dogae-realtime-status', { connected: true });
        },
        function (error) {
          console.warn('실시간 일정 연결 오류', error);
          announce('dogae-realtime-status', { connected: false, error: error.message });
        }
      );

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

  // 학생 관리에서는 실제 학급을 선택한 뒤에만 일정 리스너를 연다.
  document.addEventListener('change', function (event) {
    if (event.target && event.target.id === 'classSelect' && event.target.value) start();
  });
  window.DogaeRealtime = { start: start };
  if (document.documentElement.dataset.realtime === 'on') start();
})();
