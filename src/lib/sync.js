// クラウドとの自動同期。
//
// 端末で書いた・直した・消したものは db.js が「送る箱」に積んでおき、ここで
// Supabase の関数 shikou_memo_sync に送る。同じやりとりで、前回より後にクラウドで
// 変わったもの(別の端末で書いたもの等)を受け取って端末に入れる。
//
// - 端末のデータが消えていても、開いた時点でクラウドから全部戻る
// - 電波が無いときは箱に残しておき、戻ったら自動で送る(箱は端末の中に保存されている)
// - クラウド側は「新しい方を残す」「消しても中身は残す」「上書き前の版は履歴へ」なので、
//   どの端末から何が届いても、メモが本当に消えることはない
//
// 送るきっかけ: 起動時 / 書いたあと少しして / 画面に戻ったとき / 電波が戻ったとき /
// 開いている間は2分おき / 画面を離れるとき(送り残しがあれば) /
// 別の端末で書かれた瞬間(クラウドからの知らせ。live.js)

import * as db from './db.js';
import { startLive } from './live.js';

const RPC_URL = 'https://gzayrjlhruhvklsidraw.supabase.co/rest/v1/rpc/shikou_memo_sync';
const API_KEY = 'sb_publishable_-sNQxpwsU7JxhPF9S2vn5A_-CCTqQZL';
const CHUNK = 200;                         // 1回に送る変更の数
const FULL_EVERY_MS = 24 * 60 * 60 * 1000; // 1日1回はクラウドの全部と突き合わせる
const POLL_MS = 2 * 60 * 1000;
const AFTER_WRITE_MS = 1200;
const REQUEST_TIMEOUT_MS = 20000;
const RETRY_STEPS_MS = [5000, 15000, 60000, 180000, 300000];

const state = {
  phase: 'idle',        // 'idle' | 'syncing' | 'ok' | 'offline' | 'error'
  lastSyncedAt: null,   // 最後にクラウドとやりとりできた時刻(ms)
  everSynced: false,    // この端末で一度でもクラウドとやりとりできたか
  pending: 0,           // まだクラウドに届いていない変更の数
  error: '',
  live: false,          // 別の端末の変更を、その場で受け取れる状態か
};

const stateListeners = new Set();
const dataListeners = new Set();
let running = null;
let again = false;
let debounceTimer = null;
let retryTimer = null;
let retryIndex = 0;
let started = false;

function setState(patch) {
  Object.assign(state, patch);
  const snapshot = getSyncState();
  for (const fn of stateListeners) {
    try { fn(snapshot); } catch (e) { /* 表示側の失敗で同期は止めない */ }
  }
}

export function getSyncState() {
  return { ...state, memoryOnly: db.isUsingMemory() };
}

export function onSyncState(fn) {
  stateListeners.add(fn);
  return () => stateListeners.delete(fn);
}

// クラウドから取り込んで、端末の中身が変わったとき
export function onRemoteData(fn) {
  dataListeners.add(fn);
  return () => dataListeners.delete(fn);
}

function deviceLabel() {
  try { return navigator.userAgent.slice(0, 110); } catch (e) { return 'unknown'; }
}

function toWire(c) {
  return { id: c.id, kind: c.kind, deleted: !!c.deleted, updatedAt: c.updatedAt, data: c.data || null };
}

async function callRpc(changes, since) {
  const body = JSON.stringify({ p_changes: changes.map(toWire), p_since: since, p_device: deviceLabel() });
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS) : null;
  try {
    const res = await fetch(RPC_URL, {
      method: 'POST',
      headers: {
        apikey: API_KEY,
        Authorization: 'Bearer ' + API_KEY,
        'Content-Type': 'application/json',
      },
      body,
      cache: 'no-store',
      // 画面を離れる瞬間でも届くように(大きすぎると keepalive は使えない)
      keepalive: document.visibilityState === 'hidden' && body.length < 60000,
      signal: ctrl ? ctrl.signal : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`クラウドの応答 ${res.status} ${text.slice(0, 120)}`);
    }
    return await res.json();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function syncOnce() {
  const [lastRev, lastFullAt] = await Promise.all([db.getMeta('lastRev'), db.getMeta('lastFullAt')]);
  const needFull = typeof lastRev !== 'number' || !lastFullAt || Date.now() - lastFullAt > FULL_EVERY_MS;
  const since = needFull ? 0 : lastRev;

  const outbox = await db.getOutbox();
  const chunks = [];
  for (let i = 0; i < outbox.length; i += CHUNK) chunks.push(outbox.slice(i, i + CHUNK));
  if (chunks.length === 0) chunks.push([]);

  // 多いときは分けて送り、最後のひと塊と一緒にクラウドの変更を受け取る
  for (let i = 0; i < chunks.length - 1; i++) {
    await callRpc(chunks[i], null);
    await db.applyRemote({ sent: chunks[i] });
  }
  const lastChunk = chunks[chunks.length - 1];
  const res = await callRpc(lastChunk, since);
  const result = await db.applyRemote({
    sent: lastChunk,
    records: Array.isArray(res.records) ? res.records : [],
    rev: typeof res.rev === 'number' ? res.rev : null,
    full: !!res.full,
  });
  // 端末にしか無かったものを見つけたら、続けてもう一度送る
  if (result.enqueued > 0) again = true;
  return result;
}

export function syncNow() {
  if (running) {
    again = true;
    return running;
  }
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  running = (async () => {
    setState({ phase: 'syncing' });
    try {
      let rounds = 0;
      do {
        again = false;
        const result = await syncOnce();
        if (result.changed > 0) {
          for (const fn of dataListeners) {
            try { fn(result); } catch (e) { /* 表示側の失敗で同期は止めない */ }
          }
        }
        rounds++;
      } while (again && rounds < 5);
      retryIndex = 0;
      const now = Date.now();
      db.setMeta('lastSyncedAt', now).catch(() => {});
      setState({ phase: 'ok', lastSyncedAt: now, everSynced: true, error: '', pending: await safeCount() });
    } catch (e) {
      const offline = navigator.onLine === false || (e && (e.name === 'TypeError' || e.name === 'AbortError'));
      setState({ phase: offline ? 'offline' : 'error', error: String((e && e.message) || e), pending: await safeCount() });
      scheduleRetry();
    } finally {
      running = null;
    }
  })();
  return running;
}

async function safeCount() {
  try { return await db.countOutbox(); } catch (e) { return state.pending; }
}

function scheduleRetry() {
  if (retryTimer) clearTimeout(retryTimer);
  const wait = RETRY_STEPS_MS[Math.min(retryIndex, RETRY_STEPS_MS.length - 1)];
  retryIndex++;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (document.visibilityState !== 'hidden') syncNow();
  }, wait);
}

function syncSoon(delay) {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    syncNow();
  }, delay);
}

// 画面に戻ったとき等: 直前にやりとりしたばかりで送り残しも無ければ省く
function syncIfStale() {
  if (state.pending === 0 && state.lastSyncedAt && Date.now() - state.lastSyncedAt < 5000) return;
  syncNow();
}

// クラウドから「変わった」と知らせが来たとき。自分が送った分の知らせ(もう持っている番号)なら取りに行かない
async function syncIfBehind(rev) {
  try {
    const lastRev = await db.getMeta('lastRev');
    if (typeof rev === 'number' && typeof lastRev === 'number' && rev <= lastRev) return;
  } catch (e) { /* 分からなければ取りに行く */ }
  syncNow();
}

export function startSync() {
  if (started) return;
  started = true;

  db.getMeta('lastSyncedAt')
    .then((t) => { if (typeof t === 'number') setState({ lastSyncedAt: t, everSynced: true }); })
    .catch(() => {});

  db.onLocalChange(async () => {
    setState({ pending: await safeCount() });
    // メモリ上で動いているときは端末に残らないので、すぐ送る
    syncSoon(db.isUsingMemory() ? 0 : AFTER_WRITE_MS);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      syncIfStale();
    } else if (state.pending > 0 || debounceTimer) {
      // 画面を離れる前に送り残しを送っておく
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      syncNow();
    }
  });
  window.addEventListener('online', () => syncNow());
  window.addEventListener('focus', syncIfStale);
  // iPhone で前の画面から戻ったとき(ページが保存から復元された場合)
  window.addEventListener('pageshow', (e) => { if (e.persisted) syncIfStale(); });
  setInterval(() => {
    if (document.visibilityState === 'visible') syncNow();
  }, POLL_MS);

  syncNow();

  startLive({
    apiKey: API_KEY,
    onChanged: (rev) => syncIfBehind(rev),
    onReconnect: () => syncIfStale(),
    onStatus: (live) => setState({ live }),
  });
}
