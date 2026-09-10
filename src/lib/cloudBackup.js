// このアプリのメモはIndexedDB(端末内)にしか無く、端末が壊れる・
// ブラウザのデータを消す・別端末に乗り換える、のいずれでも失われる。
// 手動の「データを書き出す」だけに頼らず、変更のたびに控えを
// Supabaseへ送っておく(週次のbackup-supabase.ps1の対象に入る)。
//
// 本体の保存先はIndexedDBのまま。ここから読み戻すことはせず、
// あくまで書き出し専用の控えとして扱う(同期ではない)。
// ライブラリは使わずfetchだけで完結させる。

const BACKUP_URL = 'https://gzayrjlhruhvklsidraw.supabase.co/rest/v1/app_backups';
const BACKUP_KEY = 'sb_publishable_-sNQxpwsU7JxhPF9S2vn5A_-CCTqQZL';
const APP_NAME = 'shikou-memo';
const LAST_KEY = 'shikou-memo:lastCloudBackupAt';

let timer = null;
let lastJson = '';
let exporter = null;   // 循環importを避けるため、db.js側から渡してもらう

export function setExporter(fn) {
  exporter = fn;
}

export function scheduleCloudBackup() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(sendCloudBackup, 4000);
}

export async function sendCloudBackup() {
  if (!exporter) return;
  try {
    const snapshot = await exporter();
    const count = (snapshot.notes || []).length;
    if (count === 0) return;                 // 空は送らない(控えを空で潰さない)
    const json = JSON.stringify(snapshot.notes) + JSON.stringify(snapshot.tags);
    if (json === lastJson) return;           // 変化が無ければ送らない

    const res = await fetch(BACKUP_URL, {
      method: 'POST',
      headers: {
        apikey: BACKUP_KEY,
        Authorization: 'Bearer ' + BACKUP_KEY,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        app: APP_NAME,
        data: snapshot,
        item_count: count,
        device: navigator.userAgent.slice(0, 120),
        updated_at: new Date().toISOString(),
      }),
    });
    if (res.ok) {
      lastJson = json;
      try { localStorage.setItem(LAST_KEY, new Date().toISOString()); } catch (e) { /* 参考情報なので失敗は無視 */ }
    } else {
      console.warn('クラウド控えの送信に失敗しました', res.status);
    }
  } catch (e) {
    // 控えの失敗でアプリの操作を止めない
    console.warn('クラウド控えの送信に失敗しました', e);
  }
}

export function lastCloudBackupAt() {
  try { return localStorage.getItem(LAST_KEY); } catch (e) { return null; }
}
