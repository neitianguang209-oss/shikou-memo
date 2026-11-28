// 「ふりかえり」: 変わったところだけを、問いごとのカードで。時系列の一覧はいちばん下にたたむ
import React, { useState } from 'react';
import { themeStyle, shortDate } from '../lib/jibun.js';
import { monthReview, inventoryList, shaky, thisMonth, addMonth, monthLabel, isActive } from '../lib/jibunSession.js';
import { html, ThemeLabel, Certainty } from './jibunParts.js';

function ChangeCard({ c, onOpen }) {
  return html`
    <button type="button" class="jibun-card jibun-change" style=${themeStyle(c.q.theme)} onClick=${() => onOpen(c.q)}>
      <span class="jibun-meta"><${ThemeLabel} theme=${c.q.theme} />${c.q.status === '決着' ? '✓ 卒業' : ''}</span>
      <span class="jibun-change__q">${c.q.question}</span>
      ${c.now && html`
        ${c.before && c.before.text !== c.now.text && html`<span class="jibun-change__before">前: ${c.before.text}</span>`}
        <span class="jibun-change__now">${c.before ? (c.before.text === c.now.text ? '確信が変化: ' : '今: ') : '仮説: '}${c.now.text}</span>
        <${Certainty} value=${c.now.certainty} />
      `}
      ${c.found && html`<span class="jibun-change__now">分かった: ${c.found}</span>`}
      ${c.olds.map((o) => o.next && html`<span key=${o.old.id} class="jibun-change__line"><span class="jibun-op jibun-op--changed">変わった</span><span class="jibun-ins__old">${o.old.statement}</span> → ${o.next.statement}</span>`)}
      ${c.fresh.slice(0, 3).map((i) => html`<span key=${i.id} class="jibun-change__line"><span class="jibun-op jibun-op--new">気づき</span>${i.statement}</span>`)}
      ${c.fresh.length > 3 && html`<span class="jibun-meta">ほか気づき${c.fresh.length - 3}件</span>`}
      ${c.counter && html`<span class="jibun-change__line jibun-change__sub">引っかかり: ${c.counter}</span>`}
      ${c.open && html`<span class="jibun-change__line jibun-change__sub">次に掘る: ${c.open}</span>`}
    </button>
  `;
}

// 月1の棚卸し: 古い考えを1件ずつ「今もそう思う / 言い直す / 卒業」。1回は8件まで
function Inventory({ insights, onReview }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(0);
  const [text, setText] = useState(null);
  const [busy, setBusy] = useState(false);
  const list = inventoryList(insights);
  if (!list.length && !done) return null;
  const item = list[0];
  async function answer(verdict, statement) {
    setBusy(true);
    if (await onReview(item.id, verdict, statement)) { setDone((n) => n + 1); setText(null); }
    setBusy(false);
  }
  if (!open) {
    return html`<button class="jibun-card jibun-inv-start" onClick=${() => { setOpen(true); setDone(0); }}><b>今の考えの棚卸し</b><span>1か月以上確かめていない考えが${list.length}件</span></button>`;
  }
  if (!item || done >= 8) {
    return html`<div class="jibun-card"><b>今回の棚卸しはここまで(${done}件)</b><p class="jibun-hint">下で「来月の問い」を1つ決めて締めましょう。</p></div>`;
  }
  return html`
    <div class="jibun-card">
      <div class="jibun-meta"><${ThemeLabel} theme=${item.theme} />${item.kind} ・ ${done + 1}件目</div>
      ${text === null ? html`
        <div class="jibun-inv__q">${item.statement}</div>
        <p class="jibun-hint">今も本当にそう思う?</p>
        <div class="jibun-row">
          <button class="jibun-btn" disabled=${busy} onClick=${() => answer('keep')}>今もそう</button>
          <button class="jibun-btn jibun-btn--ghost" disabled=${busy} onClick=${() => setText(item.statement)}>言い直す</button>
          <button class="jibun-btn jibun-btn--ghost" disabled=${busy} onClick=${() => answer('retire')}>卒業</button>
          <button class="jibun-btn jibun-btn--plain" onClick=${() => setOpen(false)}>中断</button>
        </div>
      ` : html`
        <textarea class="jibun-sheet__text" value=${text} onInput=${(e) => setText(e.target.value)}></textarea>
        <div class="jibun-row jibun-row--end">
          <button class="jibun-btn jibun-btn--plain" onClick=${() => setText(null)}>やめる</button>
          <button class="jibun-btn" disabled=${busy || !text.trim() || text.trim() === item.statement} onClick=${() => answer('revise', text.trim())}>今の言葉で保存</button>
        </div>
      `}
    </div>
  `;
}

function NextMonth({ data, onOpen, onSave }) {
  const next = addMonth(thisMonth(), 1);
  const chosen = data.questions.find((q) => q.month_of === next);
  const candidates = data.questions.filter(isActive).filter((q) => q.hypothesis || q.times_talked || q.pinned)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (a.certainty || 0) - (b.certainty || 0) || b.times_talked - a.times_talked)
    .slice(0, 3);
  return html`
    <div class="jibun-section">締め: ${monthLabel(next)}の問いを1つ</div>
    <div class="jibun-card">
      ${chosen ? html`
        <button type="button" class="jibun-log jibun-log--btn" onClick=${() => onOpen(chosen)}><span class="jibun-meta">決まりました</span><span>${chosen.question}</span></button>
        <button class="jibun-btn jibun-btn--plain jibun-btn--small" onClick=${() => onSave(chosen, { month_of: '' }, '選び直せます', true)}>選び直す</button>
      ` : candidates.length ? html`
        ${candidates.map((q) => html`
          <div key=${q.id} class="jibun-gap">
            <div><${ThemeLabel} theme=${q.theme} />${q.question}</div>
            <button class="jibun-btn jibun-btn--ghost jibun-btn--small" onClick=${() => onSave(q, { month_of: next }, `${monthLabel(next)}の問いにしました`, true)}>これ</button>
          </div>
        `)}
        <p class="jibun-hint">ほかの問いは、開いて下の「${monthLabel(next)}の問いにする」で選べます。</p>
      ` : html`<p class="jibun-hint">問いを開いて「${monthLabel(next)}の問いにする」で選べます。</p>`}
    </div>
  `;
}

export function Review({ data, inFilter, filter, onOpen, onSave, onReview, onPaste }) {
  const now = thisMonth();
  const [ym, setYm] = useState(now);
  const r = monthReview(data, ym);
  const cards = r.cards.filter((c) => inFilter(c.q.theme));
  const changed = r.restChanged.filter((c) => inFilter(c.old.theme));
  const fresh = r.restNew.filter((i) => inFilter(i.theme));
  const weak = ym === now ? shaky(data.questions).filter((q) => inFilter(q.theme)) : [];
  const report = filter === 'すべて' && data.reports.length ? data.reports[0] : null;
  const talks = data.talks.filter((t) => inFilter(t.theme));
  return html`
    <div class="jibun-month">
      <button aria-label="前の月" onClick=${() => setYm(addMonth(ym, -1))}>‹</button>
      <b>${ym.slice(0, 4)}年${monthLabel(ym)}の変化</b>
      <button aria-label="次の月" disabled=${ym >= now} onClick=${() => setYm(addMonth(ym, 1))}>›</button>
    </div>
    ${weak.length > 0 && html`
      <div class="jibun-section">大事なのに、まだあやふや</div>
      <div class="jibun-card jibun-card--list">
        ${weak.map((q) => html`
          <button key=${q.id} type="button" class="jibun-q" onClick=${() => onOpen(q)}>
            <span class="jibun-q__bar" style=${themeStyle(q.theme)}></span>
            <span class="jibun-q__main"><span class="jibun-q__text">${q.question}</span><span class="jibun-q__answer">${q.hypothesis ? html`→ ${q.hypothesis} <${Certainty} value=${q.certainty} label=${false} />` : 'まだ仮説がない'}</span></span>
          </button>
        `)}
      </div>
    `}
    ${cards.length > 0 && html`<div class="jibun-section">問いごとの変化</div>`}
    ${cards.map((c) => html`<${ChangeCard} key=${c.q.id} c=${c} onOpen=${onOpen} />`)}
    ${(changed.length > 0 || fresh.length > 0) && html`
      <details class="jibun-fold jibun-fold--card" open=${cards.length === 0}>
        <summary>問いの外で増えた・変わった考え(${changed.length + fresh.length})</summary>
        ${changed.map((c) => html`<div key=${c.old.id} class="jibun-ins"><span class="jibun-ins__old">${c.old.statement}</span><span class="jibun-ins__arrow">→</span>${c.next ? c.next.statement : '(新しい考え)'}</div>`)}
        ${fresh.map((i) => html`<div key=${i.id} class="jibun-ins"><${ThemeLabel} theme=${i.theme} />${i.statement}</div>`)}
      </details>
    `}
    ${!cards.length && !changed.length && !fresh.length && html`<div class="jibun-empty">この月は、まだ変化がありません。</div>`}
    ${ym === now && html`
      <${Inventory} insights=${data.insights} onReview=${onReview} />
      <${NextMonth} data=${data} onOpen=${onOpen} onSave=${onSave} />
    `}
    ${report && html`
      <details class="jibun-fold">
        <summary>週の変化レポート(${shortDate(report.period_start)}〜${shortDate(report.period_end)})</summary>
        <div class="jibun-card jibun-report">${report.body}</div>
      </details>
    `}
    <details class="jibun-fold">
      <summary>話した記録を日付順で見る(${talks.length})</summary>
      ${talks.map((t) => html`
        <details key=${t.id} class="jibun-pasttalk">
          <summary><span class="jibun-meta">${shortDate(t.talked_on)}${t.status === '途中' ? ' ・ 途中まで' : ''}</span><span class="jibun-pasttalk__head">${t.title}</span></summary>
          ${t.headline && html`<div class="jibun-talk__headline">${t.headline}</div>`}
          ${t.summary && html`<div class="jibun-talk__summary">${t.summary}</div>`}
          ${t.evidence && html`<p class="jibun-hint">根拠: ${t.evidence}</p>`}
          ${t.counter && html`<p class="jibun-hint">反証・違和感: ${t.counter}</p>`}
        </details>
      `)}
    </details>
    <button class="jibun-import-link" onClick=${() => onPaste()}>話した内容を貼る</button>
  `;
}
