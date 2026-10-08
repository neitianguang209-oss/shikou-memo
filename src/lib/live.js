// クラウドに変更が入った瞬間に知らせを受け取る口(Supabase Realtime のブロードキャスト)。
//
// クラウド側の shikou_memo_sync は、メモやタグが変わるたびに、チャンネル 'shikou-memo' へ
// { rev: 番号 } だけを流す(本文は載せない)。ここで受け取ったら、いつもの同期で取りに行く。
// 知らせが届かない状況(電波・接続切れ)でも、開いたとき・画面に戻ったとき・2分おきの同期で
// 追いつくので、ここは「速くする」ための仕組みで、無くても中身は揃う。
//
// 依存を増やさないよう supabase-js は使わず、Phoenix のやりとりを最小限だけ手で書いている。

const SOCKET_URL = 'wss://gzayrjlhruhvklsidraw.supabase.co/realtime/v1/websocket';
const TOPIC = 'realtime:shikou-memo';
const HEARTBEAT_MS = 25000;
const DEAD_AFTER_MS = 65000;   // この間なにも届かなければ切れたとみなしてつなぎ直す
const RETRY_STEPS_MS = [1000, 3000, 8000, 20000, 60000];

let ws = null;
let options = null;
let ref = 0;
let heartbeatTimer = null;
let retryTimer = null;
let retryIndex = 0;
let lastMessageAt = 0;
let joined = false;
let everJoined = false;

function nextRef() {
  ref += 1;
  return String(ref);
}

function send(msg) {
  try {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  } catch (e) { /* 送れなければ次のつなぎ直しで回復する */ }
}

function setJoined(value) {
  if (joined === value) return;
  joined = value;
  options && options.onStatus && options.onStatus(value);
}

function stopHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

function scheduleReconnect() {
  if (retryTimer || !options) return;
  const wait = RETRY_STEPS_MS[Math.min(retryIndex, RETRY_STEPS_MS.length - 1)];
  retryIndex += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    connect();
  }, wait);
}

function handleMessage(raw) {
  lastMessageAt = Date.now();
  let msg;
  try { msg = JSON.parse(raw); } catch (e) { return; }
  if (!msg || msg.topic !== TOPIC) return;

  if (msg.event === 'phx_reply' && msg.ref === '1') {
    if (msg.payload && msg.payload.status === 'ok') {
      retryIndex = 0;
      const wasJoinedBefore = everJoined;
      everJoined = true;
      setJoined(true);
      // つながっていなかった間の変更を取りこぼさないよう、つなぎ直したときは一度同期する
      if (wasJoinedBefore && options.onReconnect) options.onReconnect();
    } else {
      disconnect();
      scheduleReconnect();
    }
    return;
  }
  if (msg.event === 'phx_error' || msg.event === 'phx_close') {
    disconnect();
    scheduleReconnect();
    return;
  }
  if (msg.event === 'broadcast' && msg.payload && msg.payload.event === 'changed') {
    const body = msg.payload.payload || {};
    options.onChanged && options.onChanged(typeof body.rev === 'number' ? body.rev : null);
  }
}

function connect() {
  if (!options || typeof WebSocket !== 'function') return;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  if (navigator.onLine === false) return;   // online イベントで改めてつなぐ

  ref = 0;
  let socket;
  try {
    socket = new WebSocket(`${SOCKET_URL}?apikey=${encodeURIComponent(options.apiKey)}&vsn=1.0.0`);
  } catch (e) {
    scheduleReconnect();
    return;
  }
  ws = socket;

  socket.onopen = () => {
    if (ws !== socket) return;
    lastMessageAt = Date.now();
    send({
      topic: TOPIC,
      event: 'phx_join',
      payload: { config: { broadcast: { ack: false, self: false }, presence: { key: '' }, postgres_changes: [], private: false } },
      ref: nextRef(),
      join_ref: '1',
    });
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      if (Date.now() - lastMessageAt > DEAD_AFTER_MS) {
        // 返事が途絶えた(スリープ明け等)。切ってつなぎ直す
        disconnect();
        connect();
        return;
      }
      send({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: nextRef() });
    }, HEARTBEAT_MS);
  };
  socket.onmessage = (e) => {
    if (ws === socket) handleMessage(e.data);
  };
  socket.onclose = () => {
    if (ws !== socket) return;
    ws = null;
    stopHeartbeat();
    setJoined(false);
    scheduleReconnect();
  };
  socket.onerror = () => { /* onclose が続けて来るので、そちらで扱う */ };
}

function disconnect() {
  stopHeartbeat();
  setJoined(false);
  const socket = ws;
  ws = null;
  if (socket) {
    try { socket.close(); } catch (e) { /* もう閉じている */ }
  }
}

// onChanged(rev): クラウドで何か変わった / onReconnect(): つなぎ直した / onStatus(bool): 受け取れる状態か
export function startLive(opts) {
  if (options) return;
  options = opts;
  connect();
  window.addEventListener('online', () => {
    retryIndex = 0;
    connect();
  });
  window.addEventListener('offline', () => disconnect());
  // スリープ明けや画面に戻ったとき、切れていればすぐつなぎ直す
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (!ws || Date.now() - lastMessageAt > DEAD_AFTER_MS) {
      disconnect();
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      retryIndex = 0;
      connect();
    }
  });
}
