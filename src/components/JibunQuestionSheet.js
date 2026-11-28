// 問いを開いたカード。今の仮説 → 20分で掘る が主役で、くわしい中身は折りたたむ
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CERTAINTY, shortDate } from '../lib/jibun.js';
import { LENSES, stageOf, talksOf, relatedFor, keywordsOf, thisMonth, addMonth, monthLabel } from '../lib/jibunSession.js';
import { html, ThemeLabel, ThemeChips, Certainty, Sheet } from './jibunParts.js';

const AI_STORE = 'jibun-note:ai';
const readAi = () => { try { return localStorage.getItem(AI_STORE) === 'claude' ? 'claude' : 'chatgpt'; } catch (e) { return 'chatgpt'; } };

// 新しい問いを足すカード(文字を打つので上に出す)
export function AddSheet({ initialText, initialTheme, onClose, onAdd }) {
  const [text, setText] = useState(initialText || '');
  const [theme, setTheme] = useState(initialTheme || '人生観');
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) setTimeout(() => ref.current && ref.current.focus(), 50);
    function onKey(e) { if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); } }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);
  return createPortal(html`
    <div class="overlay overlay--top" onClick=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="modal-card jibun-sheet" role="dialog" aria-label="問いを足す">
        <div class="modal-card__title">問いを足す</div>
        <textarea ref=${ref} class="jibun-sheet__text" placeholder="例: 最近いちばん悔しかったことは?" value=${text} onInput=${(e) => setText(e.target.value)}></textarea>
        <${ThemeChips} value=${theme} onChange=${setTheme} />
        <div class="jibun-row jibun-row--between">
          <button class="jibun-btn jibun-btn--plain" onClick=${onClose}>閉じる</button>
          <button class="jibun-btn" disabled=${!text.trim()} onClick=${() => onAdd(text.trim(), theme)}>足す</button>
        </div>
      </div>
    </div>
  `, document.body);
}

function HypothesisBox({ q, onSave }) {
  const [editing, setEditing] = useState(false);
  const [hypo, setHypo] = useState('');
  const [evi, setEvi] = useState('');
  const [cert, setCert] = useState(1);
  function open() {
    setHypo(q.hypothesis || '');
    setEvi(q.evidence || '');
    setCert(q.certainty || 1);
    setEditing(true);
  }
  if (!editing) {
    return html`
      <button type="button" class="jibun-hypo" onClick=${open}>
        <span class="jibun-hypo__label">今の仮説 <${Certainty} value=${q.certainty} /></span>
        <span class=${`jibun-hypo__text${q.hypothesis ? '' : ' is-empty'}`}>${q.hypothesis || 'まだない(話すと入ります。タップで自分でも書けます)'}</span>
        ${q.evidence && html`<span class="jibun-hypo__evi">根拠: ${q.evidence}</span>`}
      </button>
    `;
  }
  return html`
    <div class="jibun-hypo jibun-hypo--edit">
      <span class="jibun-hypo__label">今の仮説(1行)</span>
      <input class="modal-card__input" value=${hypo} placeholder="たぶん、〜だから〜" onInput=${(e) => setHypo(e.target.value)} />
      <span class="jibun-hypo__label">根拠になった具体的な出来事</span>
      <textarea class="jibun-sheet__text" placeholder="いつ・何があった・自分は何をした" value=${evi} onInput=${(e) => setEvi(e.target.value)}></textarea>
      <div class="segmented">
        ${[1, 2, 3].map((n) => html`
          <button key=${n} type="button" disabled=${n > 1 && !evi.trim()}
            class=${`segmented__item${(evi.trim() ? cert : 1) === n ? ' is-active' : ''}`}
            onClick=${() => setCert(n)}>${CERTAINTY[n]}</button>
        `)}
      </div>
      ${!evi.trim() && html`<p class="jibun-hint">出来事が1つもない間は「なんとなく」になります。</p>`}
      <div class="jibun-row jibun-row--end">
        <button class="jibun-btn jibun-btn--plain" onClick=${() => setEditing(false)}>やめる</button>
        <button class="jibun-btn jibun-btn--ghost" onClick=${async () => {
          await onSave(q, { hypothesis: hypo.trim(), evidence: evi.trim(), certainty: evi.trim() ? cert : 1 }, '仮説を保存しました', true);
          setEditing(false);
        }}>仮説を保存</button>
      </div>
    </div>
  `;
}

function History({ q, talks, stock, onAddQuestion }) {
  const log = [...(q.hypo_log || [])].reverse();
  return html`
    ${log.length > 1 && html`
      <div class="jibun-section">仮説の移り変わり</div>
      ${log.map((h, n) => html`
        <div key=${n} class="jibun-log"><span class="jibun-meta">${shortDate(h.on)} <${Certainty} value=${h.certainty} label=${false} /></span><span>${h.text}</span></div>
      `)}
    `}
    ${talks.map((t) => html`
      <details key=${t.id} class="jibun-pasttalk">
        <summary>
          <span class="jibun-meta">${shortDate(t.talked_on)}${t.status === '途中' ? ' ・ 途中まで' : ''}${t.lens ? ` ・ ${t.lens}` : ''}</span>
          <span class="jibun-pasttalk__head">${t.headline || t.title || '(まとめなし)'}</span>
        </summary>
        ${t.evidence && html`<p class="jibun-hint">根拠: ${t.evidence}</p>`}
        ${t.counter && html`<p class="jibun-hint">反証・違和感: ${t.counter}</p>`}
        ${t.summary && html`<div class="jibun-talk__summary">${t.summary}</div>`}
        ${(t.quotes || []).map((x, i) => html`<blockquote key=${i} class="jibun-talk__quote">「${x}」</blockquote>`)}
        ${t.new_material && html`<p class="jibun-hint">新しく出た話: ${t.new_material}</p>`}
        ${t.next_question && html`
          <p class="jibun-hint">次に掘る問い: ${t.next_question}
            ${!stock.has(t.next_question) && html` <button class="jibun-btn jibun-btn--ghost jibun-btn--small" onClick=${() => onAddQuestion(t.next_question, q.theme)}>問いに足す</button>`}
          </p>
        `}
      </details>
    `)}
  `;
}

export function QuestionSheet({ q, data, onClose, onSave, onStart, onPaste, onOpen, onAddQuestion }) {
  const [editing, setEditing] = useState(q.status === '違和感');
  const [text, setText] = useState(q.question);
  const [theme, setTheme] = useState(q.theme);
  const [ai, setAi] = useState(readAi);
  const [lens, setLens] = useState('');
  const [words, setWords] = useState(null);
  const talks = talksOf(q, data.talks);
  const rel = relatedFor(q, data);
  const usedLens = new Set(talks.map((t) => t.lens).filter(Boolean));
  const stage = stageOf(q, data.talks);
  const nextMonth = addMonth(thisMonth(), 1);
  const stock = new Set(data.questions.map((x) => x.question));
  const closed = q.status === '決着' || q.status === '保留';
  const catching = q.status === '違和感';
  const edited = () => ({ ...(text.trim() && text.trim() !== q.question ? { question: text.trim() } : {}), ...(theme !== q.theme ? { theme } : {}) });
  const pickAi = (v) => { setAi(v); try { localStorage.setItem(AI_STORE, v); } catch (e) { /* 覚えなくても動く */ } };

  if (catching) {
    return html`
      <${Sheet} title="違和感を問いにする" onClose=${onClose} foot=${html`
        <button class="jibun-btn jibun-btn--plain" onClick=${() => onSave(q, { status: 'しまう' }, '消しました')}>消す</button>
        <button class="jibun-btn" disabled=${!text.trim()} onClick=${() => onSave(q, { question: text.trim(), theme, status: 'ストック' }, '問いにしました')}>問いにする</button>
      `}>
        <p class="jibun-hint">モヤっとしたこと: ${q.question}</p>
        <textarea class="jibun-sheet__text" value=${text} onInput=${(e) => setText(e.target.value)}></textarea>
        <p class="jibun-hint">「なぜ〜?」「どんなとき〜?」の形に直すと掘りやすくなります。そのままでも大丈夫。</p>
        <${ThemeChips} value=${theme} onChange=${setTheme} />
      <//>
    `;
  }

  return html`
    <${Sheet} label="問い" onClose=${onClose} foot=${html`
      <span>
        ${closed
          ? html`<button class="jibun-btn jibun-btn--plain" onClick=${() => onSave(q, { status: q.times_talked ? '話した' : 'ストック' }, '戻しました')}>問いに戻す</button>`
          : html`
            <button class="jibun-btn jibun-btn--plain" onClick=${() => onSave(q, { ...edited(), status: '決着' }, '卒業にしました')}>解けた(卒業)</button>
            <button class="jibun-btn jibun-btn--plain" onClick=${() => onSave(q, { ...edited(), status: '保留' }, '保留にしました')}>保留</button>
          `}
      </span>
      <button class="jibun-btn jibun-btn--ghost" onClick=${() => {
        const p = edited();
        Object.keys(p).length ? onSave(q, p, '保存しました') : onClose();
      }}>閉じる</button>
    `}>
      <div class="jibun-qhead">
        <span><${ThemeLabel} theme=${q.theme} /><span class="jibun-stage">${stage}</span></span>
        <button type="button" class=${`jibun-star${q.pinned ? ' is-on' : ''}`} onClick=${() => onSave(q, { pinned: !q.pinned }, '', true)}>${q.pinned ? '★ 大事' : '☆ 大事'}</button>
      </div>
      ${editing ? html`
        <textarea class="jibun-sheet__text" value=${text} onInput=${(e) => setText(e.target.value)}></textarea>
        <${ThemeChips} value=${theme} onChange=${setTheme} />
        <div class="jibun-row jibun-row--end">
          <button class="jibun-btn jibun-btn--plain" onClick=${() => onSave(q, { status: 'しまう' }, 'しまいました')}>この問いをしまう</button>
          <button class="jibun-btn jibun-btn--ghost" onClick=${async () => { await onSave(q, edited(), '保存しました', true); setEditing(false); }}>問いを保存</button>
        </div>
      ` : html`
        <button type="button" class="jibun-qtext" onClick=${() => setEditing(true)}>${q.question}</button>
      `}

      <${HypothesisBox} q=${q} onSave=${onSave} />

      <button class="jibun-btn jibun-btn--wide jibun-btn--start" onClick=${() => onStart(q, { ai, lens })}>20分で掘る</button>
      <div class="segmented">
        ${[['chatgpt', 'ChatGPT'], ['claude', 'Claude']].map(([k, label]) => html`
          <button key=${k} type="button" class=${`segmented__item${ai === k ? ' is-active' : ''}`} onClick=${() => pickAi(k)}>${label}</button>
        `)}
      </div>
      <div class="jibun-row jibun-row--between">
        <button class="jibun-btn jibun-btn--plain" onClick=${() => onPaste(q)}>話した記録を貼る</button>
        ${q.status !== '今日' && !closed && html`<button class="jibun-btn jibun-btn--plain" onClick=${() => onSave(q, { ...edited(), status: '今日' }, '今日の問いにしました')}>今日はこれ</button>`}
      </div>

      <details class="jibun-fold">
        <summary>見る角度(レンズ)${lens ? `: ${lens}` : ''}</summary>
        <div class="jibun-row">
          ${LENSES.map((l) => html`
            <button key=${l} type="button" class=${`jibun-link jibun-link--chip${lens === l ? ' is-active' : ''}`} onClick=${() => setLens(lens === l ? '' : l)}>${l}${usedLens.has(l) ? ' ✓' : ''}</button>
          `)}
        </div>
        <p class="jibun-hint">選ばなくても大丈夫。✓ はもう見た角度です。</p>
      </details>

      <details class="jibun-fold">
        <summary>一緒に渡す自分の情報(${rel.insights.length + rel.episodes.length}件)</summary>
        ${rel.insights.map((i) => html`<div key=${i.id} class="jibun-log"><span class="jibun-meta">${i.theme} ・ ${i.kind}</span><span>${i.statement}</span></div>`)}
        ${rel.episodes.map((e, n) => html`<div key=${'e' + n} class="jibun-log"><span class="jibun-meta">出来事 ・ ${shortDate(e.on)}</span><span>${e.text}</span></div>`)}
        <div class="jibun-meta jibun-meta--gap">関連ワード(読点で区切る。合う情報が変わります)</div>
        <div class="jibun-row jibun-row--nowrap">
          <input class="modal-card__input" value=${words ?? keywordsOf(q).join('、')} onInput=${(e) => setWords(e.target.value)} />
          <button class="jibun-btn jibun-btn--ghost jibun-btn--small" disabled=${words === null} onClick=${async () => {
            await onSave(q, { keywords: words.split(/[、,，\s]+/).filter(Boolean).slice(0, 12) }, '関連ワードを保存しました', true);
            setWords(null);
          }}>保存</button>
        </div>
      </details>

      ${rel.questions.length > 0 && html`
        <details class="jibun-fold">
          <summary>つながる問い(${rel.questions.length})</summary>
          ${rel.questions.map((o) => html`
            <button key=${o.id} type="button" class="jibun-log jibun-log--btn" onClick=${() => onOpen(o)}>
              <span>${o.question}</span>${o.hypothesis && html`<span class="jibun-q__answer">→ ${o.hypothesis}</span>`}
            </button>
          `)}
        </details>
      `}

      ${(talks.length > 0 || (q.hypo_log || []).length > 1) && html`
        <details class="jibun-fold">
          <summary>これまでの記録(${talks.length}回)</summary>
          <${History} q=${q} talks=${talks} stock=${stock} onAddQuestion=${onAddQuestion} />
        </details>
      `}

      ${!closed && html`
        <button class="jibun-btn jibun-btn--plain" onClick=${() => onSave(q, { month_of: q.month_of === nextMonth ? '' : nextMonth }, q.month_of === nextMonth ? '外しました' : `${monthLabel(nextMonth)}の問いにしました`, true)}>
          ${q.month_of === nextMonth ? `✓ ${monthLabel(nextMonth)}の問い(外す)` : `${monthLabel(nextMonth)}の問いにする`}
        </button>
      `}
    <//>
  `;
}
