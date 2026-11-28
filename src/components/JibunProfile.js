// 「じぶん像」: 今の考えを、就活で聞かれる形に並べたもの(旧「気づき」もここ)
import React, { useState } from 'react';
import { profileOf, gapsOf, GAP_QUESTIONS, SHUKATSU_MODES } from '../lib/jibun.js';
import { html, ThemeLabel, Certainty } from './jibunParts.js';

function Group({ g }) {
  const [all, setAll] = useState(false);
  return html`
    <div class="jibun-section">${g.title}</div>
    <div class=${`jibun-card${g.kinds[0] === '一言の自分' ? ' jibun-profile-lead' : ''}`}>
      ${g.items.slice(0, all ? undefined : 4).map((i) => html`
        <div key=${i.id} class="jibun-ins">
          <div class="jibun-ins__s"><${ThemeLabel} theme=${i.theme} />${i.statement}</div>
          <div class="jibun-meta"><${Certainty} value=${i.confidence || 1} label=${false} /></div>
        </div>
      `)}
      ${g.items.length > 4 && html`<button class="jibun-more" onClick=${() => setAll(!all)}>${all ? 'たたむ' : `ほか${g.items.length - 4}件`}</button>`}
    </div>
  `;
}

export function Profile({ data, filter, onAddGap, onShukatsu, onCopy }) {
  const theme = filter === 'すべて' ? null : filter;
  const groups = profileOf(data.insights, { theme }).filter((g) => g.items.length);
  const gaps = !theme || theme === 'キャリア' ? gapsOf(data.insights) : [];
  const stock = new Set(data.questions.map((q) => q.question));
  return html`
    ${groups.length === 0 ? html`<div class="jibun-empty">まだ気づきがありません。<br />問いについて話すと、ここに「じぶん像」ができていきます。</div>`
      : groups.map((g) => html`<${Group} key=${g.title} g=${g} />`)}
    ${(!theme || theme === 'キャリア') && html`
      <details class="jibun-fold">
        <summary>就活に使う</summary>
        <p class="jibun-hint">キャリアの考えだけを渡します(恋愛・人生観は入れません)。</p>
        <div class="jibun-row">
          ${SHUKATSU_MODES.map((m) => html`<button key=${m.key} class="jibun-btn jibun-btn--ghost" onClick=${() => onShukatsu(m.key)}>${m.label}</button>`)}
          <button class="jibun-btn jibun-btn--plain" onClick=${onCopy}>じぶん像をコピー</button>
        </div>
      </details>
    `}
    ${gaps.length > 0 && html`
      <details class="jibun-fold">
        <summary>まだ薄いところ(${gaps.length})</summary>
        ${gaps.map((k) => {
          const qText = GAP_QUESTIONS[k];
          const has = stock.has(qText);
          return html`
            <div key=${k} class="jibun-gap">
              <div><span class="jibun-gap__kind">${k}</span>${qText}</div>
              <button class="jibun-btn jibun-btn--ghost jibun-btn--small" disabled=${has} onClick=${() => onAddGap(qText)}>${has ? '問いにある' : '問いに足す'}</button>
            </div>
          `;
        })}
      </details>
    `}
  `;
}
