// 「じぶん」タブの画面で共通に使う部品
import htm from 'htm';
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { THEMES, themeStyle, CERTAINTY } from '../lib/jibun.js';

export const html = htm.bind(React.createElement);

// テーマは、色の付いた名前のラベルで見分ける
export function ThemeLabel({ theme }) {
  return html`<span class="jibun-theme" style=${themeStyle(theme)}>${theme}</span>`;
}

export function ThemeChips({ value, onChange, withAll }) {
  const names = [...(withAll ? ['すべて'] : []), ...THEMES.map((t) => t.name)];
  return html`
    <div class=${`jibun-chips${withAll ? '' : ' jibun-chips--wrap'}`}>
      ${names.map((n) => html`
        <button
          key=${n}
          type="button"
          class=${`jibun-chip${value === n ? ' is-active' : ''}`}
          style=${themeStyle(n)}
          onClick=${() => onChange(n)}
        >
          ${n !== 'すべて' && html`<span class="jibun-dot"></span>`}${n}
        </button>
      `)}
    </div>
  `;
}

// 確信度の ●●○
export function Certainty({ value, label }) {
  if (!value) return null;
  return html`<span class="jibun-cert"><span class="jibun-conf">${'●'.repeat(value)}${'○'.repeat(3 - value)}</span>${label !== false && CERTAINTY[value]}</span>`;
}

// 画面のいちばん外側(body)に出すカード。「じぶん」画面の中に置くと、iPhoneでは下のタブの後ろに隠れることがある。
// 本体だけがスクロールし、下の足は動かない
export function Sheet({ label, title, onClose, foot, children }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); } }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);
  return createPortal(html`
    <div class="overlay overlay--full" onClick=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="modal-card jibun-sheet jibun-sheet--fixed-foot" role="dialog" aria-label=${label || title}>
        ${title && html`<div class="modal-card__title">${title}</div>`}
        <div class="jibun-sheet__body">${children}</div>
        <div class="jibun-sheet__foot jibun-row jibun-row--between">${foot}</div>
      </div>
    </div>
  `, document.body);
}
