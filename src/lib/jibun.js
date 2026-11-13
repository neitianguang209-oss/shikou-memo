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

// ---- ChatGPT とつなぐ ----
// 無料版ChatGPTはデータベースを読めないので、頼み文に「今の考え(短いid つき)」と途中の中身を入れて渡し、
// 最後に決まった形の「記録のかたまり」を出してもらう。それをこのアプリに貼ると、jibun_api の import_talk が
// Claudeで話したときと同じ表(話した記録・気づき・問い)に入れる。Claudeに貼っても同じように保存される。

export const RECORD_START = '【じぶんトークの記録】';
export const RECORD_END = '【ここまで】';

// 気づきの短いid(uuid の頭6文字)。ChatGPTはこれで「同じ/変わった」を指す
export function shortId(id) {
  return (id || '').slice(0, 6);
}

function currentInsights(insights, theme) {
  return (insights || [])
    .filter((i) => i.theme === theme && (i.status === '今の考え' || i.status === '未解決'))
    .sort((a, b) => (b.confidence || 1) - (a.confidence || 1) || (b.last_confirmed || '').localeCompare(a.last_confirmed || ''))
    .slice(0, 45);
}

const FENCE = '```';

export function chatgptPrompt({ q, talk, insights, talks }) {
  const theme = (q && q.theme) || (talk && talk.theme) || '人生観';
  const question = (q && q.question) || (talk && (talk.question || talk.title)) || '';
  const qid = (q && q.id) || (talk && talk.question_id) || 'なし';
  const now = currentInsights(insights, theme)
    .map((i) => `- #${shortId(i.id)} ${i.kind}: ${i.statement}`)
    .join('\n');
  const recent = (talks || [])
    .filter((t) => t.theme === theme && t.status === '完了' && t.headline)
    .slice(0, 3)
    .map((t) => `- ${shortDate(t.talked_on)} ${t.headline}`)
    .join('\n');
  const resume = talk ? `

■ 前回の途中まで(${talk.source === 'ChatGPT' ? 'ChatGPT' : 'Claude'}で話した分)
${talk.summary || ''}
${(talk.quotes || []).length ? '私の言葉: ' + talk.quotes.map((x) => `「${x}」`).join('') + '\n' : ''}次に聞くこと: ${talk.resume_note || '(なし)'}
前回の続きから始めて、前回の中身は「前回は〜ってところまで話したね」と一言だけ触れてください。記録の「具体的には」は前回の分も合わせて書いてください。` : '';
  return `あなたは私の「自分を知るトーク」の聞き役です。日本語で話してください。

■ 今日の問い
「${question}」(テーマ: ${theme})${resume}

■ 話し方
- 質問は1回に1つ。短く話す。講義や長い箇条書きはしない
- 答えに「なぜ?」「具体的には?」「そのとき何を感じた?」で1〜2段だけ深掘りする。5〜10往復が目安
- 私の言葉を言い換えて決めつけない。まとめるときは「〜ってこと?」と確かめる
- 下の「今の考え」と食い違ったら、責めずにそのまま見せる(「前は『〜』だったけど、今は少し違う?」)。結論を急がせない
- 新しい経験談が出たら、数字・時期・自分の行動を1つだけ追加で聞く(就活のエピソードになるので)
- 恋愛・家族の話は私が話したい深さまで
- 答えがはっきり出たと感じたら「これで答えが出た感じ?」と1回だけ聞いてよい

■ 私の今の考え(${theme}。# のあとは記録に使うid)
${now || '(まだなし)'}
${recent ? `\n■ 最近わかったこと\n${recent}\n` : ''}
■ 終わり方
私が「バイバイ」「おわり」と言ったら、質問も確認もせずに、下の形の「記録のかたまり」を1つだけ、コードブロック(${FENCE})の中に入れて出して終わってください。
「いったんここまで」「続きはまた今度」と言ったら、状態を「途中」にして同じ形で出してください。
記録には私が言っていないことを書かないでください。項目名と区切りの | は変えないでください。

${FENCE}
${RECORD_START}
日付: (今日の日付 YYYY-MM-DD)
問い: ${question}
問いのid: ${qid}
テーマ: ${theme}
状態: 完了 か 途中
答え: 出た か まだ(この問いはもう話さなくていいくらい答えが出たら 出た)
今日の一言: 今日の話で分かった自分を1文(40字まで。例: 人に認められるより、自分で納得できることに幸せを感じる人)
具体的には: 流れと結論を3〜5文
私の言葉: 「そのままの言い回し」を2〜4個
新しく出た話: 新しい経験・事実(数字や時期も)。無ければ なし
キーワード: 話に出た話題を2〜4個、読点で区切る
気づき:
- 新しい | 種類 | 文
- 同じ | #id
- 強く同じ | #id
- 変わった | #id | 種類 | 新しい文 | 何がどう変わったか・きっかけ
- 取り下げ | #id | 理由
新しく生まれた問い:
- 問い(無ければ なし)
次に聞くこと: 途中なら次に聞くことを1つ。完了なら次に深掘りしたい問い
${RECORD_END}
${FENCE}
(気づきは今日の話ではっきり言えたものだけ1件1行。種類は 一言の自分/価値観/幸福観/強み/弱み/動き方のクセ/感情のクセ/やりたいこと/避けたいこと/企業選びの軸/働き方の条件/キャリア仮説/恋愛観/人との関わり方/問い のどれか。上の「今の考え」と同じことを言ったら「同じ」、言い切ったら「強く同じ」、前と変わったら「変わった」。使わない行は消してください)`;
}

// 見出し(全角コロン・** の太字・行頭の - などのゆれを許す)
const FIELDS = {
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
  return (text || '').includes(RECORD_START) || /今日の一言\s*[:：]/.test(text || '');
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
  const headline = val('headline');
  const summary = (raw.summary || []).map(clean).join('\n').trim();
  if (!headline && !summary) return null;

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
    import_key: hash([one('question'), date, status, headline, summary].join('|')),
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

// ChatGPTで話しに行った問い(この端末で覚えておき、戻ってきたら「取りこむ」を出す)
const PENDING_STORE = 'jibun-note:gpt-pending';
export function readPending() {
  try {
    const p = JSON.parse(localStorage.getItem(PENDING_STORE) || 'null');
    // 2日たったものは忘れる
    return p && Date.now() - p.at < 2 * 86400000 ? p : null;
  } catch (e) { return null; }
}
export function writePending(p) {
  try { p ? localStorage.setItem(PENDING_STORE, JSON.stringify(p)) : localStorage.removeItem(PENDING_STORE); } catch (e) { /* なくても動く */ }
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
