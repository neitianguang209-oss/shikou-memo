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

export function claudeResumePrompt(t) {
  return `前回途中だった「${t.question || t.title}」(テーマ:${t.theme})の続きを話そう。自分を知るトークで、前回の続きから1つずつ深掘りして。私が「バイバイ」と言ったら、確認なしで保存してまとめて終わりにして。`;
}

// 無料版ChatGPTで同じ問いトークをするときの頼み文。ChatGPTはデータベースを読めないので、
// 今の考え(同じテーマの気づき)と途中の中身をここで渡し、最後に「記録のかたまり」を出してもらう。
// 本人がそれをClaudeに貼ると、Claudeがいつも通り保存・気づきの突き合わせをする
export function chatgptPrompt({ q, talk, insights }) {
  const theme = (q && q.theme) || (talk && talk.theme) || '人生観';
  const question = (q && q.question) || (talk && (talk.question || talk.title)) || '';
  const qid = (q && q.id) || (talk && talk.question_id) || 'なし';
  const now = (insights || [])
    .filter((i) => i.theme === theme && (i.status === '今の考え' || i.status === '未解決'))
    .slice(0, 10)
    .map((i) => `- ${i.kind}: ${i.statement}`)
    .join('\n');
  const resume = talk ? `\n\n■ 前回の途中まで\n${talk.summary || ''}\n次に聞くこと: ${talk.resume_note || '(なし)'}\n前回の続きから始めて、前回の中身は一言だけ触れてください。` : '';
  return `あなたは私の「自分を知るトーク」の聞き役です。日本語で話してください。

■ 今日の問い
「${question}」(テーマ: ${theme})${resume}

■ 話し方
- 質問は1回に1つ。短く話す。講義や長い箇条書きはしない
- 答えに「なぜ?」「具体的には?」「そのとき何を感じた?」で1〜2段だけ深掘りする。5〜10往復が目安
- 私の言葉を言い換えて決めつけない。まとめるときは「〜ってこと?」と確かめる
- 下の「今の考え」と食い違ったら、責めずにそのまま見せる(「前は『〜』だったけど、今は少し違う?」)。どっちが本当か結論を急がせない
- 新しい経験談が出たら、数字・時期・自分の行動を1つだけ追加で聞く
- 恋愛・家族の話は私が話したい深さまで

■ 私の今の考え(${theme})
${now || '(まだなし)'}

■ 終わり方
私が「バイバイ」「おわり」と言ったら、質問も確認もせずに、下の形の「記録のかたまり」を1つだけ出して終わってください。
「いったんここまで」「続きはまた今度」と言ったら、状態を「途中」にして同じ形で出してください。
記録に私が言っていないことは書かないでください。

【じぶんトークの記録】
日付: (今日の日付)
問い: ${question}
問いのid: ${qid}
テーマ: ${theme}
状態: 完了 / 途中${talk ? '(前回の続き)' : ''}
今日の一言: 今日の話で分かった自分を1文(40字まで)
具体的には: 流れと結論を3〜5文
私の言葉: そのままの言い回しを2〜4個(「」でくくる)
新しく出た話: 新しい経験・事実(無ければ なし)
気づきの候補: 1件1行。「種類: 文」の形(種類は 価値観/強み/弱み/動き方のクセ/やりたいこと/避けたいこと/企業選びの軸/働き方の条件/恋愛観/人との関わり方/幸福観/感情のクセ など)。今の考えと同じ・変わったなら(同じ)(変わった: 前は〜)と添える
新しく生まれた問い: (無ければ なし)
次に聞くこと: 途中なら次に聞くことを1つ。完了なら次に深掘りしたい問い
【ここまで】`;
}

// '2026-10-31' → '10/31'
export function shortDate(s) {
  return (s || '').slice(5, 10).replace('-', '/');
}
