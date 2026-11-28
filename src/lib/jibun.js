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

// テーマごとの色(家計簿のカテゴリ色と同じ調子)
export const THEMES = [
  { name: 'キャリア', color: '#1586cc' },
  { name: '恋愛・人間関係', color: '#ff54a8' },
  { name: '人生観', color: '#00a651' },
  { name: '日々の気持ち', color: '#ff8700' },
];

// 画面部品に渡す、テーマの色の指定(知らないテーマは指定なし=灰色)
export function themeStyle(theme) {
  const t = THEMES.find((x) => x.name === theme);
  return t ? { '--theme': t.color } : null;
}

export function readKey() {
  try { return localStorage.getItem(KEY_STORE) || ''; } catch (e) { return ''; }
}

export function writeKey(input) {
  // 合言葉入りのリンク(…#jibun&k=…)を丸ごと貼っても通るように
  const m = String(input || '').trim().match(/[#&]k=([^&\s]+)/);
  let key = String(input || '').trim();
  if (m) { try { key = decodeURIComponent(m[1]); } catch (e) { key = m[1]; } }
  try { localStorage.setItem(KEY_STORE, key); } catch (e) { /* 保存できなくても、この回は使える */ }
  // 日記の同期も同じ合言葉を使うので、入ったらすぐ同期し直せるように知らせる
  if (key) { try { window.dispatchEvent(new Event('shikou-key')); } catch (e) { /* 知らせは無くても2分おきに同期する */ } }
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

export function reviewInsight(id, verdict, statement) {
  return api('review_insight', { id, verdict, statement });
}

export function loadAll() {
  return api('load');
}

export function addQuestion(question, theme, status) {
  return api('add_question', { question, theme, status });
}

export function updateQuestion(id, patch) {
  return api('update_question', { id, ...patch });
}

export const RECORD_START = '【じぶんトークの記録】';
export const RECORD_END = '【ここまで】';

// 気づきの短いid(uuid の頭6文字)。AIはこれで「同じ/変わった」を指す
export function shortId(id) {
  return (id || '').slice(0, 6);
}

export const CERTAINTY = ['', 'なんとなく', 'かなり確か', '確信'];

// 見出し(全角コロン・** の太字・行頭の - などのゆれを許す)
const FIELDS = {
  '仮説': 'hypo', '今の仮説': 'hypo', '確信度': 'certainty', 'レンズ': 'lens',
  '根拠': 'evidence', '根拠になった出来事': 'evidence', '反証': 'counter', '反証・違和感': 'counter', '次に掘る問い': 'next',
  '日付': 'date', '問い': 'question', '問いのid': 'qid', 'テーマ': 'theme', '状態': 'status', '答え': 'answer',
  '今日の一言': 'headline', '具体的には': 'summary', '私の言葉': 'quotes',
  '新しく出た話': 'material', 'キーワード': 'topics', '気づき': 'insights', '気づきの候補': 'insights',
  '新しく生まれた問い': 'newq', '次に聞くこと': 'next',
};
const FIELD_RE = new RegExp('^[-・*#\\s]*(?:\\*\\*)?(' + Object.keys(FIELDS).sort((a, b) => b.length - a.length).join('|') + ')(?:\\*\\*)?\\s*[:：]\\s*(?:\\*\\*)?\\s*(.*)$');
const NONE = /^(なし|無し|ない|特になし|-|ー|―)?$/;
const OPS = { '新しい': 'new', '新規': 'new', '同じ': 'same', '強く同じ': 'same', '変わった': 'changed', '取り下げ': 'withdrawn' };
const KINDS = ['一言の自分', '価値観', '幸福観', '強み', '弱み', '動き方のクセ', '感情のクセ', 'やりたいこと', '避けたいこと', '企業選びの軸', '働き方の条件', 'キャリア仮説', '恋愛観', '人との関わり方', '問い'];

export function hasRecord(text) {
  const t = text || '';
  return t.includes(RECORD_START) || /今日の一言\s*[:：]/.test(t) || (/仮説(\*\*)?\s*[:：]/.test(t) && /根拠/.test(t));
}

function hash(str) {
  let h1 = 0x811c9dc5; let h2 = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = (Math.imul(h2, 31) + c) | 0;
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}

function clean(s) {
  return (s || '').replace(/\*\*/g, '').replace(/^\s*[-・*]\s*/, '').trim();
}

// 「記録のかたまり」を読み取る。読めなければ null
export function parseRecord(text) {
  if (!text) return null;
  let body = text.replace(/\r/g, '');
  const s = body.indexOf(RECORD_START);
  if (s >= 0) body = body.slice(s + RECORD_START.length);
  const e = body.indexOf(RECORD_END);
  if (e >= 0) body = body.slice(0, e);
  const raw = {};
  let cur = null;
  for (const line0 of body.split('\n')) {
    const line = line0.replace(/^\s*```.*$/, '').trimEnd();
    const m = line.match(FIELD_RE);
    if (m) {
      cur = FIELDS[m[1]];
      raw[cur] = raw[cur] || [];
      if (m[2].trim()) raw[cur].push(m[2].trim());
    } else if (cur && line.trim()) {
      raw[cur].push(line.trim());
    }
  }
  const one = (k) => clean((raw[k] || []).join(' '));
  const val = (k) => { const v = one(k); return NONE.test(v) ? '' : v; };
  const hypothesis = val('hypo');
  const headline = val('headline') || hypothesis;
  const summary = (raw.summary || []).map(clean).join('\n').trim();
  if (!headline && !summary) return null;
  const ct = one('certainty');
  // 書き方の見本(3つ並び)がそのまま返ってきたら「なんとなく」
  const certainty = !hypothesis ? null : /[/／]/.test(ct) ? 1 : /確信/.test(ct) ? 3 : /かなり/.test(ct) ? 2 : 1;

  const th = one('theme');
  const theme = THEMES.map((t) => t.name).find((t) => th.includes(t))
    || (/恋愛|人間関係/.test(th) ? '恋愛・人間関係' : '')
    || (/気持ち/.test(th) ? '日々の気持ち' : '')
    || '';
  const st = one('status');
  const status = /途中/.test(st) && !/^完了/.test(st) ? '途中' : '完了';
  const quotes = [...one('quotes').matchAll(/「([^」]+)」/g)].map((m) => m[1].trim()).filter(Boolean);
  if (!quotes.length && val('quotes')) quotes.push(...val('quotes').split(/[、,／/]/).map((x) => x.trim()).filter(Boolean));
  const topics = val('topics').split(/[、,，・\s]+/).map((x) => x.trim()).filter(Boolean).slice(0, 6);

  const insights = [];
  for (const l of raw.insights || []) {
    const parts = clean(l).split(/\s*[|｜]\s*/).map((x) => x.trim());
    if (parts.length < 2) continue;
    const opWord = parts[0].replace(/[\s()()]/g, '');
    const op = OPS[opWord];
    if (!op) continue;
    const strong = opWord === '強く同じ';
    const idPart = parts.find((x) => /^#?[0-9a-f]{6}$/i.test(x));
    const ref = idPart ? idPart.replace('#', '').toLowerCase() : '';
    const rest = parts.slice(1).filter((x) => x !== idPart);
    if (op === 'new' || op === 'changed') {
      let kind = '';
      if (rest.length && KINDS.includes(rest[0].replace(/\s/g, ''))) kind = rest.shift().replace(/\s/g, '');
      const statement = rest.shift() || '';
      if (!statement || statement === '文') continue;
      insights.push({ op, ref, kind, statement, note: rest.join(' / ') });
    } else if (ref) {
      insights.push({ op, ref, strong, note: rest.join(' / ') });
    }
  }
  const newQuestions = (raw.newq || []).map(clean).filter((x) => x && !NONE.test(x) && !/^問い\(/.test(x));
  const qid = (one('qid').match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i) || [''])[0];
  const date = (one('date').match(/\d{4}-\d{2}-\d{2}/) || [''])[0];
  const next = val('next');
  return {
    import_key: hash([one('question'), date, status, headline, summary, val('evidence')].join('|')),
    hypothesis,
    certainty,
    evidence: val('evidence'),
    counter: val('counter'),
    lens: val('lens'),
    talked_on: date,
    question: val('question'),
    question_id: qid,
    theme,
    status,
    answered: status === '完了' && /^出た/.test(one('answer')),
    headline,
    summary,
    quotes,
    topics,
    new_material: val('material'),
    next_question: status === '完了' ? next : '',
    resume_note: status === '途中' ? next : '',
    insights,
    new_questions: newQuestions,
  };
}

export function importTalk(record) {
  return api('import_talk', record);
}

// ---- どこで話した内容でも、そのまま貼って整理する ----
// 形のばらばらな文章(ChatGPT・Claudeの会話、ボイスメモの文字起こし、自分の振り返り)を、
// サーバー側の関数 jibun-structure(Gemini)が「話した記録」の形に直して返す。保存は確認のあと
const STRUCTURE_URL = 'https://gzayrjlhruhvklsidraw.supabase.co/functions/v1/jibun-structure';

async function callStructure(body) {
  const res = await fetch(STRUCTURE_URL, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: readKey(), ...body }),
  });
  if (!res.ok) {
    let err = '';
    try { err = (await res.json()).error || ''; } catch (e) { /* 本文なし */ }
    throw new Error(err === 'bad key' ? 'bad key' : err === 'too long' ? 'too long' : 'ai failed');
  }
  return res.json();
}

export async function structureText(text) {
  const j = await callStructure({ text });
  return (j.records || []).map((r) => ({
    ...r,
    import_key: hash([r.question, r.talked_on, r.status, r.headline, r.summary].join('|')),
  }));
}

// 過去の記録から、まだ言葉になっていない問いの候補を出してもらう
export async function suggestQuestions() {
  const j = await callStructure({ mode: 'suggest' });
  return j.suggestions || [];
}

// 文字を2文字ずつに割って重なりを見る(言い回しが少し違うだけの同じ気づきを見つける)
function bigrams(s) {
  const t = (s || '').replace(/[\s、。,.「」『』()()・!?!?〜~ー]/g, '');
  const set = new Set();
  for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
  return set;
}

export function similarity(a, b) {
  const A = bigrams(a); const B = bigrams(b);
  if (!A.size || !B.size) return 0;
  let n = 0;
  A.forEach((x) => { if (B.has(x)) n++; });
  return (2 * n) / (A.size + B.size);
}

// 「新しい」気づきのうち、いまの気づきとよく似たものに、似た相手(similar)を付ける。
// 0.6以上は初めから「同じ」として扱う提案、0.42以上は「似ているかも」と知らせるだけ
export function markSimilar(rec, insights) {
  const pool = (insights || []).filter((i) => i.status === '今の考え' || i.status === '未解決');
  return {
    ...rec,
    insights: rec.insights.map((x) => {
      if (x.op !== 'new') return x;
      let best = null;
      for (const i of pool) {
        const sc = similarity(x.statement, i.statement);
        if (sc >= 0.42 && (!best || sc > best.score)) best = { id: i.id, statement: i.statement, score: sc };
      }
      return best ? { ...x, similar: best } : x;
    }),
  };
}

// ---- じぶん像(気づきのまとめ) ----
export const PROFILE_GROUPS = [
  { title: '一言でいうと', kinds: ['一言の自分'] },
  { title: '大事にしていること', kinds: ['価値観', '幸福観'] },
  { title: '強み', kinds: ['強み'] },
  { title: '弱み・気をつけたいところ', kinds: ['弱み'] },
  { title: '動き方・気持ちのクセ', kinds: ['動き方のクセ', '感情のクセ'] },
  { title: 'やりたいこと', kinds: ['やりたいこと', 'キャリア仮説'] },
  { title: '避けたいこと', kinds: ['避けたいこと'] },
  { title: '企業選びの軸', kinds: ['企業選びの軸', '働き方の条件'] },
  { title: '人との関わり方', kinds: ['人との関わり方', '恋愛観'] },
];

// 就活で薄いと困るところと、それを埋める問い
export const GAP_QUESTIONS = {
  '一言の自分': '友だちに自分を一言で紹介されるなら、なんて言われたい?実際はなんて言われる?',
  '強み': '人から「それ得意だよね」と言われたことと、そのときの具体的な場面は?',
  '弱み': '自分のせいでうまくいかなかったこと。そのとき何が足りなかった?',
  '価値観': 'これだけは譲れない、と思った瞬間はいつ?何を守りたかった?',
  'やりたいこと': '10年後、どんな場面で「この仕事しててよかった」と思っていたい?',
  '避けたいこと': 'バイトやサークルで「これはもう嫌だ」と思った働き方は?',
  '企業選びの軸': '2社から内定が出たら、何を比べて決める?',
};

const score = (i) => (i.confidence || 1) * 1e9 + Number((i.last_confirmed || '0').replace(/-/g, ''));

export function profileOf(insights, { careerOnly, theme } = {}) {
  const cur = (insights || []).filter((i) => i.status === '今の考え'
    && (!careerOnly || i.theme === 'キャリア') && (!theme || i.theme === theme));
  return PROFILE_GROUPS.map((g) => ({
    ...g,
    items: cur.filter((i) => g.kinds.includes(i.kind)).sort((a, b) => score(b) - score(a)),
  }));
}

export function gapsOf(insights) {
  const cur = (insights || []).filter((i) => i.status === '今の考え' && i.theme === 'キャリア');
  return Object.keys(GAP_QUESTIONS).filter((k) => {
    const xs = cur.filter((i) => i.kind === k);
    return xs.length === 0 || xs.every((i) => (i.confidence || 1) <= 1);
  });
}

export function profileText(insights, opts = {}) {
  return profileOf(insights, opts)
    .filter((g) => g.items.length)
    .map((g) => `■ ${g.title}\n` + g.items.slice(0, 8).map((i) => `- ${i.statement}${i.confidence >= 3 ? '(確信)' : (i.confidence || 1) <= 1 ? '(仮)' : ''}`).join('\n'))
    .join('\n\n');
}

export const SHUKATSU_MODES = [
  { key: 'pr', label: '自己PRの下書き', ask: '上のじぶん像から、いちばん根拠のある強みを1つ選んで、自己PR(400字)の下書きを書いて。エピソードが足りないところは作らずに「ここに具体例」と空けて、そのあと足りない具体例を私に1つずつ質問して。' },
  { key: 'gakuchika', label: 'ガクチカの骨組み', ask: '上のじぶん像とエピソードから、ガクチカに使えそうな話を2つ挙げて、それぞれ「状況→課題→自分の行動→結果→学び」の骨組みを作って。足りないところは作らずに質問して。' },
  { key: 'interview', label: '面接の練習', ask: '面接官として、上のじぶん像に沿った質問を1つずつしてください。私が答えたら、良かった点1つ・もっと良くなる点1つを短く返して、次の質問へ。深掘り質問もしてください。10問で終わり。' },
  { key: 'axis', label: '軸を言葉にする', ask: '上のじぶん像から、企業選びの軸を3つの短い言葉にまとめて、それぞれ「なぜそう思うか(私の経験から)」を1文添えて。矛盾しているところがあれば指摘して、どっちが本当か私に質問して。' },
];

export function shukatsuPrompt(insights, talks, mode) {
  const m = SHUKATSU_MODES.find((x) => x.key === mode) || SHUKATSU_MODES[0];
  const eps = (talks || []).filter((t) => t.theme === 'キャリア' && t.new_material).slice(0, 6)
    .map((t) => `- ${t.new_material}`).join('\n');
  const words = (talks || []).filter((t) => t.theme === 'キャリア').flatMap((t) => t.quotes || []).slice(0, 8)
    .map((q) => `「${q}」`).join('');
  return `私は就活中の大学生です。下は、これまで自分と対話して分かった「じぶん像」です((仮)は仮説、(確信)は何度も確かめたもの)。日本語で、短めに返してください。

${profileText(insights, { careerOnly: true }) || '(まだ少ない)'}
${eps ? `\n■ これまでに出たエピソード\n${eps}\n` : ''}${words ? `\n■ 私がよく使う言葉\n${words}\n` : ''}
■ お願い
${m.ask}
私が言っていない事実や数字は作らないでください。`;
}

// '2026-10-31' → '10/31'
export function shortDate(s) {
  return (s || '').slice(5, 10).replace('-', '/');
}

// 同じ話を、ほかの問いにも結んで保存するためのコピー。
// 気づきは元の1件だけに入れる(同じ話から気づきが重複して増えないように)。話した回数は問いごとに数える
export function linkedRecord(rec, q) {
  return {
    ...rec,
    question_id: q.id,
    question: q.question,
    theme: q.theme || rec.theme,
    insights: [],
    new_questions: [],
    import_key: (rec.import_key || '') + ':' + q.id,
  };
}
