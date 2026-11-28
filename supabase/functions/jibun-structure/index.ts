// 「じぶん」タブの「そのまま貼って整理」用。
// どこで話した内容でも(ChatGPT・Claude・ボイスメモの文字起こし・自分で書いた振り返り)、貼った文章を
// 「話した記録」の形(問い・今日の一言・具体的には・気づき・新しい問い)に Gemini で整理して返す。
// 保存はしない(アプリが確認画面を見せてから jibun_api の import_talk で保存する)。
// mode='suggest' のときは、過去の記録からまだ言葉になっていない問いの候補を返す。
// 合言葉は jibun_api('load') を通して確かめる。Gemini のキーはあさよみ用(asayomi_secret)を借りる。
import { createClient } from 'jsr:@supabase/supabase-js@2';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/';
const TEXT_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest'];
const THEMES = ['キャリア', '恋愛・人間関係', '人生観', '日々の気持ち'];
const KINDS = ['一言の自分', '価値観', '幸福観', '強み', '弱み', '動き方のクセ', '感情のクセ', 'やりたいこと', '避けたいこと', '企業選びの軸', '働き方の条件', 'キャリア仮説', '恋愛観', '人との関わり方', '問い'];

async function geminiSetup() {
  const { data } = await db.from('asayomi_secret').select('k,v').in('k', ['gemini_key', 'gemini_models']);
  const get = (k: string) => (data || []).find((r: { k: string }) => r.k === k)?.v || '';
  let models = TEXT_MODELS;
  try {
    const m = JSON.parse(get('gemini_models') || '{}');
    if (Array.isArray(m.text) && m.text.length) models = [...new Set([...m.text.slice(0, 3), ...TEXT_MODELS])];
  } catch {
    // 決まった順で
  }
  return { key: Deno.env.get('GEMINI_API_KEY') || get('gemini_key'), models };
}

const SYSTEM = `あなたは、本人が「自分を知るため」に話した内容を、決まった形の記録に整理する係です。
渡されるのは、ChatGPT・Claude・ボイスメモの文字起こし・自分で書いた振り返りなど、形のばらばらな文章です。1つの話のこともあれば、別々の話が複数まとめて貼られていることもあります。

【守ること】
- 本人が言っていないこと・言い切っていないことは書かない。AIの側の提案や解釈ではなく、本人の気持ち・経験・考えを書く。
- 別の話題・別の日の話が混ざっていたら、records を分けて複数返す(1つなら1件)。
- 文章は本人の言い回しを生かし、「〜する」「〜と感じる」の形で書く。「私は」は付けない。
- 気づき(insights)は、本人がはっきり言えたことだけ。1件は1文で、あとで就活や自己理解に使えるように具体的に。
- 下の「いまの気づき一覧」と同じことなら op=same(それが何度も確かめられた・強く言い切っていれば strong=true)、前と食い違うなら op=changed(ref=前の気づきのid、statement=新しい文、note=何がどう変わったか)、新しいことなら op=new。same / changed / withdrawn は必ず一覧にある ref(6文字のid)を付ける。迷ったら new。
- 問いは、下の「問い一覧」に近いものがあれば question_id にそのid(6文字)を入れ、question はその一覧の文をそのまま書く。無ければ question_id は空にして、この話の中心を表す問いを「〜?」の形で新しく作って question に書く。
- 話の中で出てきた「今後さらに掘りたいこと」は new_questions に入れる(最大4つ。すでに一覧にあるものは入れない)。
- theme は キャリア / 恋愛・人間関係 / 人生観 / 日々の気持ち のどれか1つ。仕事・就活・将来の働き方が中心ならキャリア。
- kind は 一言の自分 / 価値観 / 幸福観 / 強み / 弱み / 動き方のクセ / 感情のクセ / やりたいこと / 避けたいこと / 企業選びの軸 / 働き方の条件 / キャリア仮説 / 恋愛観 / 人との関わり方 のどれか。
- status は、話が最後まで行っていれば「完了」、途中で終わっていれば「途中」。answered は、本人が「この問いはもう答えが出た」と言えそうなら true、そうでなければ false。
- hypothesis は、本人が認めた・言い切った「今の時点の仮説」を1行(60字以内)。無ければ空文字。evidence はその根拠になった具体的な出来事(いつ・何があった・本人が何をした)。出来事が無ければ空文字(抽象的な理由は入れない)。certainty は なんとなく=1 / かなり確か=2 / 確信=3(evidence が無ければ 1)。counter は話に出た反証・違和感・まだ引っかかる点(無ければ空文字)。
- headline は「今日分かった自分」を1文(40字以内)。summary は流れと結論を3〜6文。quotes は本人のそのままの言い回しを2〜4個(「」なしで)。topics は2〜5個。new_material は新しく出た経験・事実(数字・時期も)、無ければ空文字。
- date は文章に日付があれば YYYY-MM-DD、無ければ空文字。next は、途中なら次に聞くこと、完了なら次に深掘りしたい問いを1つ(無ければ空文字)。

【答えの形】JSONだけ:
{"records":[{"hypothesis":"","certainty":1,"evidence":"","counter":"","date":"","question_id":"","question":"","theme":"","status":"完了","answered":false,"headline":"","summary":"","quotes":[],"topics":[],"new_material":"","next":"","insights":[{"op":"new","ref":"","kind":"","statement":"","note":"","strong":false}],"new_questions":[]}]}`;

type Rec = Record<string, unknown>;

const SUGGEST = `あなたは、本人の自己分析の記録を読んで「まだ言葉になっていない問い」を見つける係です。
【守ること】
- 問い一覧にあるものと同じ意味の問いは出さない。
- 記録の中で、何度も出てくるのに掘られていないこと・考え同士が食い違っているところ・出来事はあるのに理由が分かっていないことから作る。
- 一般的な自己分析の質問は禁止。本人の出来事や言葉が入った、具体的で鋭い問いを「〜?」の形で。60字以内。
- why は、どの記録からそう思ったかを30字以内で。
- theme は キャリア / 恋愛・人間関係 / 人生観 / 日々の気持ち のどれか。
- 3〜4件。
【答えの形】JSONだけ: {"suggestions":[{"question":"","theme":"","why":""}]}`;

async function callGemini(prompt: string, system = SYSTEM, field = 'records'): Promise<Rec[] | null> {
  const { key, models } = await geminiSetup();
  if (!key) return null;
  for (const model of models.slice(0, 3)) {
    const r = await fetch(`${GEMINI}models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: field === 'records' ? 0.2 : 0.7,
          maxOutputTokens: 16000,
          responseMimeType: 'application/json',
          // 待ち時間を短くするため、2.5-flash は考える時間を切る
          ...(model.includes('2.5-flash') ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        },
      }),
      signal: AbortSignal.timeout(55000),
    }).catch(() => null);
    if (!r) continue;
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) return null; // キーがだめ
      continue; // 混んでいる・そのモデルが無い → 次のモデル
    }
    // deno-lint-ignore no-explicit-any
    const j: any = await r.json().catch(() => ({}));
    // deno-lint-ignore no-explicit-any
    const raw = (j?.candidates?.[0]?.content?.parts || []).filter((p: any) => p.text && !p.thought).map((p: any) => p.text).join('');
    try {
      const o = JSON.parse(raw.replace(/^```(?:json)?|```$/g, '').trim());
      const recs = Array.isArray(o) ? o : o[field];
      if (Array.isArray(recs) && recs.length) return recs;
    } catch {
      // 次のモデルで
    }
  }
  return null;
}

const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'post only' }, 405);
  let body: { key?: string; text?: string; mode?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad json' }, 400);
  }
  const suggest = body.mode === 'suggest';
  const text = s(body.text);
  if (!suggest && text.length < 30) return json({ error: 'too short' }, 400);
  if (text.length > 40000) return json({ error: 'too long' }, 400);

  // 合言葉の確認と、いまの気づき・問いの取り出し(どちらも jibun_api の load を通す)
  const { data, error } = await db.rpc('jibun_api', { p_key: body.key || '', p_action: 'load', p_args: {} });
  if (error || !data) return json({ error: 'bad key' }, 401);

  // deno-lint-ignore no-explicit-any
  const insights: any[] = (data.insights || []).filter((i: any) => i.status === '今の考え' || i.status === '未解決').slice(0, 140);
  // deno-lint-ignore no-explicit-any
  const questions: any[] = (data.questions || []).filter((q: any) => q.status !== '違和感');
  const insList = insights.map((i) => `#${String(i.id).slice(0, 6)} [${i.theme}/${i.kind}] ${i.statement}`).join('\n');
  const qList = questions.map((q) => `#${String(q.id).slice(0, 6)} [${q.theme}] ${q.question}`).join('\n');
  const prompt = `■ いまの気づき一覧(# のあとが ref に使うid)\n${insList || '(まだなし)'}\n\n■ 問い一覧(# のあとが question_id に使うid)\n${qList || '(まだなし)'}\n\n■ 整理してほしい文章\n${text}`;

  if (suggest) {
    // deno-lint-ignore no-explicit-any
    const talks = (data.talks || []).slice(0, 25).map((t: any) =>
      `- [${t.theme}] ${[t.title, t.hypothesis || t.headline, t.evidence || t.new_material, t.counter, t.next_question].filter(Boolean).join(' / ')}`).join('\n');
    // deno-lint-ignore no-explicit-any
    const catches = (data.questions || []).filter((q: any) => q.status === '違和感').map((q: any) => `- ${q.question}`).join('\n');
    const got = await callGemini(
      `■ 今の考え\n${insList || '(まだなし)'}\n\n■ 話した記録\n${talks || '(まだなし)'}\n\n■ 違和感メモ\n${catches || '(なし)'}\n\n■ すでにある問い\n${qList}`,
      SUGGEST, 'suggestions');
    if (!got) return json({ error: 'ai failed' }, 502);
    const have = new Set(questions.map((q) => s(q.question)));
    return json({
      suggestions: got.map((x) => ({ question: s(x.question), theme: THEMES.includes(s(x.theme)) ? s(x.theme) : '人生観', why: s(x.why) }))
        .filter((x) => x.question && !have.has(x.question)).slice(0, 4),
    });
  }

  const recs = await callGemini(prompt);
  if (!recs) return json({ error: 'ai failed' }, 502);

  const qByShort = new Map(questions.map((q) => [String(q.id).slice(0, 6), q]));
  const iByShort = new Map(insights.map((i) => [String(i.id).slice(0, 6), i]));
  const out = recs.slice(0, 6).map((r) => {
    const q = qByShort.get(s(r.question_id).replace('#', '').toLowerCase());
    const status = s(r.status) === '途中' ? '途中' : '完了';
    const theme = THEMES.includes(s(r.theme)) ? s(r.theme) : '';
    const ins = (Array.isArray(r.insights) ? r.insights : []).map((x: Rec) => {
      const opw = s(x.op);
      const op = opw === 'same' || opw === 'changed' || opw === 'withdrawn' ? opw : 'new';
      const ref = s(x.ref).replace('#', '').toLowerCase();
      const kind = KINDS.includes(s(x.kind)) ? s(x.kind) : '';
      if (op !== 'new' && !iByShort.has(ref)) {
        // 一覧に無い id を指していたら、新しい気づきとして扱う(文があれば)
        return s(x.statement) ? { op: 'new', ref: '', kind, statement: s(x.statement), note: '' } : null;
      }
      if (op === 'same' || op === 'withdrawn') return { op, ref, strong: x.strong === true, note: s(x.note) };
      if (!s(x.statement)) return null;
      return { op, ref: op === 'changed' ? ref : '', kind, statement: s(x.statement), note: s(x.note) };
    }).filter(Boolean);
    const strArr = (v: unknown, n: number) => (Array.isArray(v) ? v.map(s).filter(Boolean).slice(0, n) : []);
    const next = s(r.next);
    return {
      talked_on: (s(r.date).match(/\d{4}-\d{2}-\d{2}/) || [''])[0],
      question: q ? q.question : s(r.question),
      question_id: q ? q.id : '',
      theme: q ? q.theme : theme,
      status,
      answered: status === '完了' && r.answered === true,
      headline: s(r.headline).slice(0, 80),
      hypothesis: s(r.hypothesis).slice(0, 120),
      certainty: s(r.hypothesis) ? (s(r.evidence) ? Math.min(3, Math.max(1, Number(r.certainty) || 1)) : 1) : null,
      evidence: s(r.evidence),
      counter: s(r.counter),
      summary: s(r.summary),
      quotes: strArr(r.quotes, 5).map((x) => x.replace(/^[「]|[」]$/g, '')),
      topics: strArr(r.topics, 6),
      new_material: s(r.new_material),
      next_question: status === '完了' ? next : '',
      resume_note: status === '途中' ? next : '',
      insights: ins,
      new_questions: strArr(r.new_questions, 4),
      from_ai: true,
    };
  }).filter((r) => r.headline || r.summary);
  if (!out.length) return json({ error: 'ai failed' }, 502);
  return json({ records: out });
});
