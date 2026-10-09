const CACHE_NAME = 'shikou-memo-v13';
// self.registration.scope 基準の相対パス（サブパス配信のGitHub Pages等でも動くように）
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './src/main.js',
  './src/App.js',
  './src/styles.css',
  './src/lib/db.js',
  './src/lib/format.js',
  './src/lib/inbox.js',
  './src/lib/tagColors.js',
  './src/lib/sync.js',
  './src/lib/live.js',
  './src/lib/unsent.js',
  './src/lib/viewport.js',
  './src/lib/prefs.js',
  './src/lib/memoryDb.js',
  './src/components/BottomNav.js',
  './src/components/Calendar.js',
  './src/components/HomeView.js',
  './src/components/InputSheet.js',
  './src/components/NoteItem.js',
  './src/components/TagsView.js',
  './src/components/SearchView.js',
  './src/components/SettingsView.js',
  './src/components/TagEditorModal.js',
  './src/components/ActionSheet.js',
  './src/components/ConfirmDialog.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-180.png',
].map((p) => new URL(p, self.registration.scope).toString());

const INDEX_URL = new URL('./index.html', self.registration.scope).toString();

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      // 公開直後に古いファイルが混ざらないよう、HTTPキャッシュを通さずに取り込む
      .then((cache) => cache.addAll(APP_SHELL.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => {
          if (req.mode === 'navigate') return caches.match(INDEX_URL);
          return cached;
        });
      return cached || fetchPromise;
    })
  );
});
