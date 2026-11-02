// 「じぶん」タブ(旧じぶんノート)のデータの出入り口。
//
// 中身は Supabase の jibun_questions(問い)・shukatsu_insights(気づき)・
// shukatsu_talks(話した記録)・shukatsu_reports(週の変化レポート)。恋愛観なども入るので
// 表は anon から閉じてあり、関数 jibun_api(合言葉, 動作, 引数) だけを通して読み書きする。
// 合言葉はこの端末の localStorage に置く。名前は旧じぶんノート・就活アプリと同じ
// 'jibun-note:key' のまま(同じブラウザなら入れ直さなくてよい)。

const RPC_URL = 'https://gzayrjlhruhvklsidraw.supabase.co/rest/v1/rpc/jibun_api';
const ANON = 'sb_publishable_-sNQxpwsU7JxhPF9S2vn5A_-CCTqQZL';
const KEY_STORE = 'jibun-note:key';
const CACHE_STORE = 'jibun-note:cache';

// 色はタグと同じパレットから選ぶ(画面にタグ色以外の色を増やさない)
export const THEMES = [
  { name: 'キャリア', colorKey: 'blue' },
  { name: '恋愛・人間関係', colorKey: 'pink' },
  { name: '人生観', colorKey: 'olive' },
  { name: '日々の気持ち', colorKey: 'apricot' },
];

export function themeColorKey(theme) {
  return (THEMES.find((t) => t.name === theme) || THEMES[2]).colorKey;
}

export function readKey() {
  try { return localStorage.getItem(KEY_STORE) || ''; } catch (e) { return ''; }
}

export function writeKey(key) {
  try { localStorage.setItem(KEY_STORE, key); } catch (e) { /* 保存できなくても、この回は使える */ }
}

// 合言葉入りのリンク(#k=... や #jibun&k=...)で開かれたら端末に保存して、アドレス欄から消す。
// 合言葉が入っていたら true
export function takeKeyFromHash() {
  const m = (window.location.hash || '').match(/[#&]k=([^&]+)/);
  if (!m) return false;
  writeKey(decodeURIComponent(m[1]));
  return true;
}

export function readCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_STORE) || 'null');
    return c && c.data ? c.data : null;
  } catch (e) {
    return null;
  }
}

export function writeCache(data) {
  try { localStorage.setItem(CACHE_STORE, JSON.stringify({ at: Date.now(), data })); } catch (e) { /* 控えが無くても動く */ }
}

async function api(action, args = {}) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_key: readKey(), p_action: action, p_args: args }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body.includes('bad key') ? 'bad key' : 'http ' + res.status);
  }
  return res.json();
}

export function loadAll() {
  return api('load');
}

export function addQuestion(question, theme) {
  return api('add_question', { question, theme });
}

export function updateQuestion(id, patch) {
  return api('update_question', { id, ...patch });
}

export function claudePrompt(q) {
  return `今日の問い「${q.question}」(テーマ:${q.theme})について話そう。自分を知るトークで、聞き役として1つずつ深掘りして。私が「バイバイ」と言ったら、確認なしで保存してまとめて終わりにして。`;
}

// '2026-10-31' → '10/31'
export function shortDate(s) {
  return (s || '').slice(5, 10).replace('-', '/');
}
