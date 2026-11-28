// 「問い」の画面: 違和感の放り込み口 → 今日の問い → 掘っている問い → まだの問い。卒業・保留はたたむ
import React, { useEffect, useState } from 'react';
import { themeStyle, shortDate, suggestQuestions } from '../lib/jibun.js';
import { stageOf, isActive, thisMonth, monthLabel, phaseOf, SESSION_MIN } from '../lib/jibunSession.js';
import { html, ThemeLabel, Certainty } from './jibunParts.js';

// 20分セッション中の帯。経過時間は始めた時刻から数えるので、AIのアプリに行っていても正しい
export function SessionBar({ session, onWrap, onPaste, onReopen, onEnd }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const sec = Math.max(0, Math.floor((now - session.at) / 1000));
  const min = sec / 60;
  const left = SESSION_MIN * 60 - sec;
  const over = left <= 0;
  const clock = over ? '時間です' : `あと ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  return html`
    <div class=${`jibun-card jibun-session${min >= 18 ? ' is-wrap' : ''}`}>
      <div class="jibun-session__top"><b>${clock}</b><span>${phaseOf(min)}</span></div>
      <div class="jibun-session__bar"><i style=${{ width: Math.min(100, (min / SESSION_MIN) * 100) + '%' }}></i></div>
      <div class="jibun-session__q">${session.question}</div>
      <div class="jibun-row">
        <button class="jibun-btn" onClick=${onPaste}>記録を貼る</button>
        <button class="jibun-btn jibun-btn--ghost" onClick=${onWrap}>「まとめて」をコピー</button>
      </div>
      <div class="jibun-row jibun-row--between">
        <button class="jibun-btn jibun-btn--plain" onClick=${onReopen}>指示文をもう一度コピー</button>
        <button class="jibun-btn jibun-btn--plain" onClick=${onEnd}>終わる</button>
      </div>
    </div>
  `;
}

function QuestionItem({ q, talks, onOpen }) {
  const stage = stageOf(q, talks);
  return html`
    <button class="jibun-q" onClick=${() => onOpen(q)}>
      <span class="jibun-q__bar" style=${themeStyle(q.theme)}></span>
      <span class="jibun-q__main">
        <span class="jibun-q__text">${q.status === '決着' && html`<span class="jibun-q__done">✓ </span>`}${q.pinned && html`<span class="jibun-q__pin">★ </span>`}${q.question}</span>
        ${q.hypothesis && html`<span class="jibun-q__answer">→ ${q.hypothesis}</span>`}
        <span class="jibun-meta"><${ThemeLabel} theme=${q.theme} />${stage === '未着手' ? '' : stage}${q.hypothesis ? html` <${Certainty} value=${q.certainty} label=${false} />` : ''}${q.last_talked ? ` ・ ${shortDate(q.last_talked)}` : ''}</span>
      </span>
    </button>
  `;
}

function Suggest({ stock, onAdd }) {
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  async function run() {
    setBusy(true);
    setError('');
    try { setList(await suggestQuestions()); } catch (e) { setError('うまく出せませんでした。少しして、もう一度押してね'); }
    setBusy(false);
  }
  return html`
    <button class="jibun-import-link" disabled=${busy} onClick=${run}>${busy ? '記録を読んでいます…(10〜30秒)' : 'まだ言葉になっていない問いを提案してもらう'}</button>
    ${error && html`<p class="jibun-hint jibun-hint--warn">${error}</p>`}
    ${list && list.length === 0 && html`<p class="jibun-hint">今は新しい候補がありませんでした。</p>`}
    ${list && list.length > 0 && html`
      <div class="jibun-card">
        ${list.map((s) => html`
          <div key=${s.question} class="jibun-gap">
            <div><${ThemeLabel} theme=${s.theme} />${s.question}${s.why && html`<span class="jibun-meta jibun-meta--block">${s.why}</span>`}</div>
            <button class="jibun-btn jibun-btn--ghost jibun-btn--small" disabled=${stock.has(s.question)} onClick=${() => onAdd(s.question, s.theme)}>${stock.has(s.question) ? '足した' : '足す'}</button>
          </div>
        `)}
      </div>
    `}
  `;
}

export function Questions({ data, inFilter, onOpen, onCatch, onAdd, onPaste }) {
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [allFresh, setAllFresh] = useState(false);
  const ym = thisMonth();
  const todayQ = data.questions.find((q) => q.status === '今日');
  const monthQ = data.questions.find((q) => q.month_of === ym && isActive(q) && q.id !== (todayQ && todayQ.id));
  const heads = new Set([todayQ && todayQ.id, monthQ && monthQ.id]);
  const open = data.questions.filter((q) => isActive(q) && !heads.has(q.id) && inFilter(q.theme));
  const going = open.filter((q) => stageOf(q, data.talks) !== '未着手')
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.last_talked || '').localeCompare(a.last_talked || ''));
  const fresh = open.filter((q) => stageOf(q, data.talks) === '未着手');
  const closed = data.questions.filter((q) => (q.status === '決着' || q.status === '保留') && inFilter(q.theme));
  const catches = data.questions.filter((q) => q.status === '違和感');
  const stock = new Set(data.questions.map((q) => q.question));

  async function submit(e) {
    e.preventDefault();
    if (!word.trim() || busy) return;
    setBusy(true);
    if (await onCatch(word.trim())) setWord('');
    setBusy(false);
  }

  const head = (q, label) => html`
    <button type="button" class="jibun-card jibun-today" style=${themeStyle(q.theme)} onClick=${() => onOpen(q)}>
      <span class="jibun-today__label">${label} ・ <${ThemeLabel} theme=${q.theme} /></span>
      <span class="jibun-today__q">${q.question}</span>
      ${q.hypothesis && html`<span class="jibun-q__answer">→ ${q.hypothesis} <${Certainty} value=${q.certainty} label=${false} /></span>`}
    </button>
  `;
  const list = (items, sunk) => html`
    <div class=${`jibun-card jibun-card--list${sunk ? ' jibun-card--sunk' : ''}`}>
      ${items.map((q) => html`<${QuestionItem} key=${q.id} q=${q} talks=${data.talks} onOpen=${onOpen} />`)}
    </div>
  `;

  return html`
    <form class="jibun-catch" onSubmit=${submit}>
      <input value=${word} placeholder="モヤっとしたことを一言" enterkeyhint="send" onInput=${(e) => setWord(e.target.value)} />
      <button type="submit" disabled=${!word.trim() || busy}>入れる</button>
    </form>
    ${catches.length > 0 && html`
      <details class="jibun-fold jibun-fold--card">
        <summary>違和感メモ ${catches.length}件(タップで問いにする)</summary>
        ${catches.map((q) => html`
          <button key=${q.id} type="button" class="jibun-log jibun-log--btn" onClick=${() => onOpen(q)}>
            <span class="jibun-meta">${shortDate(q.created_at)}</span><span>${q.question}</span>
          </button>
        `)}
      </details>
    `}
    ${todayQ && head(todayQ, '今日の問い')}
    ${monthQ && head(monthQ, `${monthLabel(ym)}の問い`)}
    ${going.length > 0 && html`<div class="jibun-section">掘っている問い</div>${list(going)}`}
    <div class="jibun-section">まだの問い${fresh.length ? ` ${fresh.length}` : ''}</div>
    ${fresh.length ? list(allFresh ? fresh : fresh.slice(0, 5)) : html`<div class="jibun-empty">右下の＋で足せます。</div>`}
    ${fresh.length > 5 && html`<button class="jibun-more" onClick=${() => setAllFresh(!allFresh)}>${allFresh ? 'たたむ' : `ほか${fresh.length - 5}件を見る`}</button>`}
    ${closed.length > 0 && html`
      <details class="jibun-fold">
        <summary>卒業・保留した問い(${closed.length})</summary>
        ${list(closed, true)}
      </details>
    `}
    <button class="jibun-import-link" onClick=${() => onPaste()}>話した内容を貼る</button>
    <${Suggest} stock=${stock} onAdd=${onAdd} />
  `;
}
