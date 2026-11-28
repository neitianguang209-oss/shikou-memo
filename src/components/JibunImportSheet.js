// 話した内容を貼って取りこむ。
// ① 決まった形の記録はその場で読んで、すぐ確認画面になる(待ち時間なし)
// ② ふつうの文章は「整理する」でAIが記録の形に直す。どちらも確認してから保存する
import React, { useState } from 'react';
import { parseRecord, similarity, structureText, markSimilar, shortDate, linkedRecord } from '../lib/jibun.js';
import { html, ThemeLabel, Certainty, Sheet } from './jibunParts.js';

// 1件ぶんの確認表示。前の考えと食い違うものは、置きかえるか両方残すかを選べる
function RecordPreview({ rec, insights, merges, onToggle, keeps, onKeep }) {
  const byShort = Object.fromEntries((insights || []).map((i) => [i.id.slice(0, 6), i]));
  const opLabel = { new: '新しい', same: '同じ', changed: '変わった', withdrawn: '取り下げ' };
  const conflicts = rec.insights.some((x, n) => x.op === 'changed' && byShort[x.ref] && !keeps[n]);
  return html`
    <div class="jibun-preview">
      <div class="jibun-meta"><${ThemeLabel} theme=${rec.theme || 'テーマなし'} />${rec.talked_on ? shortDate(rec.talked_on) : '今日'}${rec.status === '途中' ? ' ・ 途中まで' : rec.answered ? ' ・ 答えが出た' : ''}${rec.question_id ? '' : ' ・ 新しい問い'}</div>
      <div class="jibun-paused__q">${rec.question || '(問いなし)'}</div>
      ${rec.hypothesis ? html`
        <div class="jibun-hypo jibun-hypo--static">
          <span class="jibun-hypo__label">仮説 <${Certainty} value=${rec.evidence ? rec.certainty || 1 : 1} /></span>
          <span class="jibun-hypo__text">${rec.hypothesis}</span>
          ${rec.evidence && html`<span class="jibun-hypo__evi">根拠: ${rec.evidence}</span>`}
        </div>
        ${!rec.evidence && html`<p class="jibun-hint jibun-hint--warn">具体的な出来事がないので「なんとなく」で保存します。次は出来事を1つ挙げてみてね。</p>`}
      ` : rec.headline && html`<div class="jibun-talk__headline">${rec.headline}</div>`}
      ${rec.counter && html`<p class="jibun-hint">反証・違和感: ${rec.counter}</p>`}
      ${rec.next_question && html`<p class="jibun-hint">次に掘る問い: ${rec.next_question}</p>`}
      ${rec.status === '途中' && rec.resume_note && html`<p class="jibun-hint">続きは: ${rec.resume_note}</p>`}
      ${rec.summary && html`<div class="jibun-talk__summary jibun-preview__summary">${rec.summary}</div>`}
      ${conflicts && html`<p class="jibun-alert">前の考えと食い違うところがあります</p>`}
      ${rec.insights.length > 0 && html`
        <div class="jibun-section">気づき ${rec.insights.length}件</div>
        ${rec.insights.map((x, n) => {
          const old = x.ref && byShort[x.ref];
          const merged = x.similar && merges[n];
          const keep = x.op === 'changed' && keeps[n];
          return html`
            <div key=${n} class="jibun-preview__ins">
              <span class=${`jibun-op jibun-op--${merged ? 'same' : keep ? 'new' : x.op}`}>${opLabel[merged ? 'same' : keep ? 'new' : x.op]}</span>
              ${merged
                ? x.similar.statement
                : x.op === 'new' || x.op === 'changed'
                  ? html`${x.op === 'changed' && old && !keep && html`<span class="jibun-ins__old">${old.statement}</span><span class="jibun-ins__arrow">→</span>`}${x.statement}`
                  : old ? old.statement : '(前の気づき)'}
              ${x.op === 'changed' && old && html`
                <div class="jibun-preview__sim">
                  ${keep ? `前の考えも残す: ${old.statement}` : '前の考えを置きかえます'}
                  <button class="jibun-btn jibun-btn--plain jibun-btn--small" onClick=${() => onKeep(n)}>${keep ? '置きかえる' : '両方残す'}</button>
                </div>
              `}
              ${x.similar && html`
                <div class="jibun-preview__sim">
                  ${merged ? html`貼った文: ${x.statement}` : html`似ている気づき: ${x.similar.statement}`}
                  <button class="jibun-btn jibun-btn--plain jibun-btn--small" onClick=${() => onToggle(n)}>${merged ? '別の気づきにする' : '同じにする'}</button>
                </div>
              `}
            </div>
          `;
        })}
      `}
      ${rec.new_questions.length > 0 && html`<p class="jibun-hint">新しい問い: ${rec.new_questions.join(' / ')}</p>`}
    </div>
  `;
}

// 同じ話をほかの問いにも結ぶ(1つの話が複数の問いの答えになっているとき)。近い順に8件
function QuestionLinks({ rec, questions, primaryId, picked, onToggle }) {
  const text = [rec.headline, rec.evidence, rec.summary, rec.question].join(' ');
  const list = questions
    .filter((q) => q.id !== primaryId && q.status !== '決着' && q.status !== '違和感')
    .map((q) => ({ q, score: similarity(q.question, text) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((x) => x.q);
  if (!list.length) return null;
  return html`
    <details class="jibun-fold">
      <summary>ほかの問いにも結ぶ${picked.size ? `(${picked.size}件選択中)` : ''}</summary>
      <div class="jibun-links__list">
        ${list.map((q) => html`
          <button key=${q.id} type="button" class=${`jibun-link${picked.has(q.id) ? ' is-active' : ''}`} onClick=${() => onToggle(q.id)}><${ThemeLabel} theme=${q.theme} />${q.question}</button>
        `)}
      </div>
    </details>
  `;
}

export function ImportSheet({ initialText, insights, questions, fixedQuestion, onClose, onImport }) {
  const [text, setText] = useState(initialText || '');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiRecs, setAiRecs] = useState(null);
  // 似た気づきを「同じ」にするか / 食い違う気づきを両方残すか(記録の番号:気づきの番号)
  const [merges, setMerges] = useState({});
  const [keeps, setKeeps] = useState({});
  const [links, setLinks] = useState({});

  const parsed = parseRecord(text);
  const rawRecs = aiRecs || (parsed ? [parsed] : null);
  // 問いを開いて貼ったときは、どの記録も最初からその問いに結ぶ
  const recs = rawRecs && fixedQuestion
    ? rawRecs.map((r) => ({ ...r, question_id: fixedQuestion.id, question: fixedQuestion.question, theme: fixedQuestion.theme || r.theme }))
    : rawRecs;
  const shown = recs ? recs.map((r) => markSimilar(r, insights)) : null;
  const mergeOf = (ri, n) => {
    const k = ri + ':' + n;
    if (k in merges) return merges[k];
    const x = shown[ri].insights[n];
    return !!(x.similar && x.similar.score >= 0.6);
  };
  const toggleLink = (ri, id) => setLinks((m) => {
    const set = new Set(m[ri] || []);
    set.has(id) ? set.delete(id) : set.add(id);
    return { ...m, [ri]: set };
  });

  async function paste() {
    try {
      const t = await navigator.clipboard.readText();
      if (t) { setText(t); setAiRecs(null); setAiError(''); }
    } catch (e) { setAiError('読み取れませんでした。入力欄を長押しして貼ってください'); }
  }

  async function organize() {
    setAiBusy(true);
    setAiError('');
    try {
      setAiRecs(await structureText(text.trim()));
      setMerges({});
      setKeeps({});
    } catch (e) {
      setAiError(e.message === 'bad key' ? '合言葉が違うようです'
        : e.message === 'too long' ? '長すぎます(4万字まで)。半分に分けて貼ってください'
        : '整理できませんでした。もう一度押すか、少し短くして試してください');
    }
    setAiBusy(false);
  }

  function save() {
    const out = shown.map((r, ri) => ({
      ...r,
      insights: r.insights.map((x, n) => {
        const { similar, ...rest } = x;
        if (similar && mergeOf(ri, n)) return { op: 'same', ref: similar.id.slice(0, 6), strong: false, note: '' };
        if (x.op === 'changed' && keeps[ri + ':' + n]) return { ...rest, op: 'new', ref: '' };
        return rest;
      }),
    }));
    // ほかの問いにも結んだ分は、同じ話のコピー(気づきなし)として足す
    const qById = Object.fromEntries((questions || []).map((q) => [q.id, q]));
    const extra = [];
    out.forEach((r, ri) => (links[ri] ? [...links[ri]] : []).forEach((id) => { if (qById[id]) extra.push(linkedRecord(r, qById[id])); }));
    onImport([...out, ...extra], text);
  }

  const foot = !shown ? html`
    <button class="jibun-btn jibun-btn--plain" onClick=${onClose}>閉じる</button>
    <span>
      <button class="jibun-btn jibun-btn--ghost" disabled=${aiBusy} onClick=${paste}>貼り付け</button>
      <button class="jibun-btn" disabled=${text.trim().length < 30 || aiBusy} onClick=${organize}>${aiBusy ? '整理中…' : '整理する'}</button>
    </span>
  ` : html`
    <button class="jibun-btn jibun-btn--plain" onClick=${() => { setText(''); setAiRecs(null); setMerges({}); setKeeps({}); setLinks({}); }}>貼り直す</button>
    <button class="jibun-btn" onClick=${save}>${shown.length > 1 ? `${shown.length}件を保存する` : '保存する'}</button>
  `;

  return html`
    <${Sheet} title=${fixedQuestion ? 'この問いの記録を貼る' : '話した記録を貼る'} onClose=${onClose} foot=${foot}>
      ${fixedQuestion && html`<div class="jibun-fixedq"><${ThemeLabel} theme=${fixedQuestion.theme} />${fixedQuestion.question}</div>`}
      ${!shown ? html`
        <textarea
          class="jibun-sheet__text jibun-sheet__text--tall"
          placeholder="AIが出した記録は、貼るとすぐ確認画面になります。ふつうの会話やメモは、貼って「整理する」を押してね。"
          value=${text}
          onInput=${(e) => { setText(e.target.value); setAiError(''); }}
        ></textarea>
        ${aiError && html`<p class="jibun-hint jibun-hint--warn">${aiError}</p>`}
        ${aiBusy && html`<p class="jibun-hint">整理しています…(10〜30秒。閉じずに待ってね)</p>`}
      ` : shown.map((r, ri) => html`
        <div key=${ri}>
          <${RecordPreview}
            rec=${r}
            insights=${insights}
            merges=${Object.fromEntries(r.insights.map((x, n) => [n, mergeOf(ri, n)]))}
            onToggle=${(n) => setMerges((m) => ({ ...m, [ri + ':' + n]: !mergeOf(ri, n) }))}
            keeps=${Object.fromEntries(r.insights.map((x, n) => [n, !!keeps[ri + ':' + n]]))}
            onKeep=${(n) => setKeeps((m) => ({ ...m, [ri + ':' + n]: !m[ri + ':' + n] }))}
          />
          <${QuestionLinks} rec=${r} questions=${questions || []} primaryId=${r.question_id} picked=${links[ri] || new Set()} onToggle=${(id) => toggleLink(ri, id)} />
        </div>
      `)}
    <//>
  `;
}
