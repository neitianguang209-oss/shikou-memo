// 20分セッション(進め方の指示文・関連する自分の情報・タイマー)と、振り返りのまとめ方。
import { CERTAINTY, RECORD_START, RECORD_END, shortId, similarity } from './jibun.js';

// ---- 日付 ----
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function thisMonth() { return today().slice(0, 7); }
export function addMonth(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export function monthLabel(ym) { return `${Number(ym.slice(5, 7))}月`; }

// ---- 問いの状態 ----
// 未着手 / 掘り中 / 仮説あり / 結論 は中身から決まる(自分で切り替える手間はない)。卒業(結論)と保留だけ本人が押す
export function stageOf(q, talks) {
  if (q.status === '決着') return '結論';
  if (q.status === '保留') return '保留';
  if (q.hypothesis) return '仮説あり';
  if (q.times_talked || (talks || []).some((t) => t.question_id === q.id)) return '掘り中';
  return '未着手';
}
export function isActive(q) {
  return q.status !== '決着' && q.status !== '保留' && q.status !== '違和感' && q.status !== 'しまう';
}
export function talksOf(q, talks) {
  return (talks || []).filter((t) => t.question_id === q.id || (!t.question_id && t.title === q.question));
}
// 大事(★か2回以上話した)なのに、仮説がまだあやふやな問い
export function shaky(questions) {
  return (questions || [])
    .filter((q) => isActive(q) && (q.pinned || q.times_talked >= 2) && (q.certainty || 0) <= 1 && (q.hypothesis || q.times_talked))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.times_talked - a.times_talked)
    .slice(0, 3);
}

// ---- 関連する自分の情報 ----
const STOP = new Set(['自分', '場面', '瞬間', '理由', '何', '今', '最近', '本当', '出来事', '一番', '具体', '具体的', '感じ', '思考', '時間', '部分', '以上', 'とき', 'こと']);
export function autoKeywords(text) {
  const m = String(text || '').match(/[一-龠々]{2,}|[ァ-ヶー]{3,}|[A-Za-z]{2,}/g) || [];
  return [...new Set(m.filter((w) => !STOP.has(w)))].slice(0, 8);
}
export function keywordsOf(q) {
  return (q.keywords && q.keywords.length) ? q.keywords : autoKeywords(q.question);
}

export function relatedFor(q, data) {
  const words = [...new Set([...keywordsOf(q), ...autoKeywords(q.question + ' ' + (q.hypothesis || ''))])];
  const base = q.question + (q.hypothesis || '');
  // 就活(キャリア)の問いには、恋愛の話は混ぜない
  const allowed = (theme) => !(q.theme === 'キャリア' && theme === '恋愛・人間関係');
  const rate = (text, theme) => {
    const hit = words.filter((w) => text.includes(w)).length;
    const sim = similarity(base, text);
    return { ok: hit > 0 || sim >= 0.12, score: hit + sim * 3 + (theme === q.theme ? 0.35 : 0) };
  };
  const rank = (list, textOf) => list
    .map((x) => ({ x, ...rate(textOf(x), x.theme) }))
    .sort((a, b) => b.score - a.score);

  const cur = (data.insights || []).filter((i) => (i.status === '今の考え' || i.status === '未解決') && allowed(i.theme));
  const ranked = rank(cur, (i) => i.statement);
  let insights = ranked.filter((r) => r.ok).slice(0, 8).map((r) => r.x);
  if (insights.length < 4) {
    const more = cur.filter((i) => i.theme === q.theme && !insights.includes(i))
      .sort((a, b) => (b.confidence || 1) - (a.confidence || 1));
    insights = [...insights, ...more.slice(0, 5 - insights.length)];
  }

  const eps = (data.talks || [])
    .filter((t) => allowed(t.theme))
    .map((t) => ({ theme: t.theme, on: t.talked_on, mine: t.question_id === q.id, text: t.evidence || t.new_material || '' }))
    .filter((e) => e.text);
  const episodes = rank(eps, (e) => e.text).filter((r) => r.ok || r.x.mine)
    .sort((a, b) => Number(b.x.mine) - Number(a.x.mine) || b.score - a.score)
    .slice(0, 4).map((r) => r.x);

  const others = (data.questions || []).filter((o) => o.id !== q.id && o.status !== '違和感' && allowed(o.theme));
  const questions = rank(others, (o) => o.question + (o.hypothesis || '')).filter((r) => r.ok)
    .sort((a, b) => b.score - a.score || Number(!!b.x.hypothesis) - Number(!!a.x.hypothesis))
    .slice(0, 3).map((r) => r.x);

  return { insights, episodes, questions };
}

// ---- 20分の進め方 ----
export const LENSES = ['感情', '行動パターン', '対人関係', '時間軸', '他者の目'];
const LENS_HINT = {
  '感情': '出来事ごとに、体の反応と感情の名前を特定する。表の感情の下にある感情(悔しさ・怖さ・寂しさ など)まで掘る',
  '行動パターン': '同じ状況で繰り返している行動と、その引き金・得ているものを特定する',
  '対人関係': '誰の前で・どんな関係で出るかを比べる。出ない相手との違いを掘る',
  '時間軸': '昔・今・これからで比べる。いつ始まり、何をきっかけに変わったかを掘る',
  '他者の目': '親・友だち・バイト先の人から見たらどう説明されるかを比べ、自分の説明とのずれを掘る',
};

function clip(s, n) {
  const t = (s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
}

export function sessionPrompt(q, data, { lens, ai } = {}) {
  const rel = relatedFor(q, data);
  const talks = talksOf(q, data.talks);
  const last = talks[0];
  const paused = talks.find((t) => t.status === '途中');
  const lines = [];
  lines.push('これから20分の自己分析をします。あなたは鋭い分析の相手です。日本語で。');
  lines.push('');
  lines.push(`■ 今日の問い「${q.question}」(テーマ: ${q.theme})`);
  lines.push(q.hypothesis
    ? `■ 今の仮説(確信度: ${CERTAINTY[q.certainty || 1]}): ${q.hypothesis}${q.evidence ? `\n  根拠の出来事: ${clip(q.evidence, 160)}` : ''}`
    : '■ 今の仮説: まだない(下の私の情報から、最初の仮説をあなたが立てる)');
  if (last && last.counter) lines.push(`■ 前回の反証・違和感: ${clip(last.counter, 160)}`);
  if (last && last.next_question) lines.push(`■ 前回「次に掘る」と決めたこと: ${clip(last.next_question, 100)}`);
  if (paused) lines.push(`■ 前回は途中: ${clip(paused.summary || paused.headline, 200)} / 次に聞くこと: ${clip(paused.resume_note, 80) || 'なし'}`);
  if (lens) lines.push(`■ 今回のレンズ「${lens}」: ${LENS_HINT[lens]}`);
  if (rel.insights.length) {
    lines.push('', '■ この問いに関係する、私の今の考え(#は記録に使うid)');
    rel.insights.forEach((i) => lines.push(`- #${shortId(i.id)} [${i.kind}] ${clip(i.statement, 80)}`));
  }
  if (rel.episodes.length) {
    lines.push('', '■ 関係しそうな出来事');
    rel.episodes.forEach((e) => lines.push(`- ${clip(e.text, 110)}`));
  }
  const linked = rel.questions.filter((o) => o.hypothesis);
  if (linked.length) {
    lines.push('', '■ つながる問いの仮説');
    linked.forEach((o) => lines.push(`- ${clip(o.question, 50)} → ${clip(o.hypothesis, 60)}`));
  }
  lines.push(`
■ 毎回の返事の形(全部で5行まで)
先頭に「3/10」のように回数
受け取り: 私の答えで新しく分かったことを1行(私の言葉のオウム返しはしない)
仮説: 「たぶん、〜だから〜」を1つ。言い切る。外れてよい
質問: 1つだけ。○△×・二択・具体的な場面のどれかで、すぐ答えられる形
禁止: 質問だけを返す / ほめ言葉 / 一般論や助言 / 長い箇条書き / 「あなたはどう思う?」の丸投げ

■ 進め方(私の返事は全部で10回まで。20分で必ず終える)
1回目: ${q.hypothesis ? '今の仮説' : 'あなたが立てた最初の仮説'}をぶつけて、どこが違うか聞く
2〜4回目: 具体的な出来事を1つに絞る(いつ・誰と・何をした・何を感じた)。出来事が出るまで抽象論に進まない
5〜7回目: 次の切り口を3つとも必ず使う ①いつからそう思うか ②誰の前で強く出るか ③逆が真実なら何が起きるか
5回目のあと: 3行の中間まとめ(今の仮説 / 根拠 / まだ引っかかる点)
8回目: いちばん強い反対の解釈を必ず1つ出して、私に反論させる
9回目: 上の「私の今の考え」と食い違うところがあれば指摘して、どちらが本当か聞く
10回目、または私が「まとめて」「時間です」「バイバイ」と言ったら: すぐ締める

■ 締め(質問も感想も足さず、下の形をコードブロック1つで出す。私が言っていないことは書かない。項目名と | は変えない)
${RECORD_START}
日付: YYYY-MM-DD
問い: ${q.question}
問いのid: ${q.id}
テーマ: ${q.theme}
状態: 完了 か 途中
答え: 出た か まだ
レンズ: ${lens || 'なし'}
仮説: 今の時点の仮説を1行(60字まで)
確信度: なんとなく か かなり確か か 確信(具体的な出来事がなければ なんとなく)
根拠: 根拠になった出来事(いつ・何があった・私が何をした)。なければ なし
反証: いちばん強い反対の解釈と、それへの私の返事
次に掘る問い: 1つ
キーワード: 話に出た言葉を2〜4個、読点で区切る
気づき:
- 新しい | 種類 | 文
- 同じ | #id
- 変わった | #id | 種類 | 新しい文 | きっかけ
【ここまで】
(気づきは今日はっきり言えたものだけ、最大3件。上の考えと同じなら「同じ」、食い違って新しい方が本当なら「変わった」。種類は 一言の自分/価値観/幸福観/強み/弱み/動き方のクセ/感情のクセ/やりたいこと/避けたいこと/企業選びの軸/働き方の条件/キャリア仮説/恋愛観/人との関わり方)`.replace('【ここまで】', RECORD_END));
  if (ai === 'claude') {
    lines.push('', '(Claudeへ: 自分を知るトークのスキルを使い、締めの記録は画面に出したうえで自分データベースにも保存して。途中保存は5回目のあとに1回だけでよい)');
  }
  return lines.join('\n');
}

// ---- セッションのタイマー(この端末で覚える) ----
const SESSION_STORE = 'jibun-note:session';
export const SESSION_MIN = 20;
export function readSession() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_STORE) || 'null');
    // 1日たったものは忘れる
    return s && Date.now() - s.at < 86400000 ? s : null;
  } catch (e) { return null; }
}
export function writeSession(s) {
  try { s ? localStorage.setItem(SESSION_STORE, JSON.stringify(s)) : localStorage.removeItem(SESSION_STORE); } catch (e) { /* なくても動く */ }
}
export function phaseOf(min) {
  if (min < 3) return '仮説をぶつける';
  if (min < 9) return '出来事を1つに絞る';
  if (min < 14) return '3つの切り口で掘る';
  if (min < 18) return '反証と食い違い';
  if (min < SESSION_MIN) return 'そろそろ「まとめて」';
  return '時間です。まとめをもらう';
}

// ---- 振り返り(差分だけ・問いごと) ----
export function monthReview(data, ym) {
  const inMonth = (d) => (d || '').slice(0, 7) === ym;
  const byId = Object.fromEntries((data.insights || []).map((i) => [i.id, i]));
  const used = new Set();
  const cards = [];
  for (const q of data.questions || []) {
    if (q.status === '違和感') continue;
    const talks = talksOf(q, data.talks).filter((t) => inMonth(t.talked_on));
    const log = q.hypo_log || [];
    const monthLog = log.filter((h) => inMonth(h.on));
    if (!talks.length && !monthLog.length) continue;
    const prior = log.filter((h) => (h.on || '').slice(0, 7) < ym).slice(-1)[0];
    const now = monthLog.slice(-1)[0];
    const before = prior || (monthLog.length > 1 ? monthLog[0] : null);
    const changed = now && (!before || before.text !== now.text || before.certainty !== now.certainty);
    const ids = new Set(talks.map((t) => t.id));
    const mine = (data.insights || []).filter((i) => (i.talk_ids || []).some((x) => ids.has(x)));
    const fresh = mine.filter((i) => inMonth(i.first_seen) && i.status === '今の考え');
    const olds = (data.insights || []).filter((o) => o.status === '変化した' && fresh.some((i) => i.id === o.replaced_by));
    fresh.forEach((i) => used.add(i.id));
    olds.forEach((i) => used.add(i.id));
    const last = talks[0];
    const open = q.status === '決着' ? '' : (last && (last.next_question || last.resume_note)) || '';
    // 仮説がまだ無い問いは、その月の「分かったこと」を見せる
    const found = !now && last ? last.headline || '' : '';
    if (!changed && !fresh.length && !olds.length && !open && !found) continue;
    cards.push({
      q, before: changed ? before : null, now: changed ? now : null, found,
      fresh: fresh.filter((i) => !olds.some((o) => o.replaced_by === i.id)),
      olds: olds.map((o) => ({ old: o, next: byId[o.replaced_by] })),
      counter: q.status === '決着' ? '' : (last && last.counter) || '',
      open,
      at: [last && last.talked_on, now && now.on].filter(Boolean).sort().slice(-1)[0] || '',
    });
  }
  cards.sort((a, b) => Number(!!b.now) - Number(!!a.now) || b.at.localeCompare(a.at));
  // どの問いのカードにも入らなかった、今月の変化と新しい気づき
  const restChanged = (data.insights || [])
    .filter((o) => o.status === '変化した' && !used.has(o.id) && inMonth((byId[o.replaced_by] || {}).first_seen || o.updated_at))
    .map((o) => ({ old: o, next: byId[o.replaced_by] }));
  restChanged.forEach((c) => { if (c.next) used.add(c.next.id); });
  const restNew = (data.insights || []).filter((i) => i.status === '今の考え' && inMonth(i.first_seen) && !used.has(i.id));
  return { cards, restChanged, restNew };
}

// 月1の棚卸し: 30日以上確かめていない今の考え(古い順)
export function inventoryList(insights) {
  const limit = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  return (insights || [])
    .filter((i) => i.status === '今の考え' && (i.last_confirmed || i.first_seen || '') < limit)
    .sort((a, b) => (a.last_confirmed || '').localeCompare(b.last_confirmed || ''));
}
