import htm from 'htm';
import React, { useEffect } from 'react';

const html = htm.bind(React.createElement);

// actions: [{ label, danger, onSelect }]。message は上に出す一言(任意)
export function ActionSheet({ actions, onClose, message, cancelLabel }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        onClose();
      }
    }
    // 下に重なっている入力シートより先に Esc を受け取る
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return html`
    <div class="overlay" onClick=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="action-sheet" role="menu">
        <div class="action-sheet__group">
          ${message && html`<div class="action-sheet__message">${message}</div>`}
          ${actions.map(
            (a, i) => html`
              <button
                key=${i}
                role="menuitem"
                class=${`action-sheet__item${a.danger ? ' is-danger' : ''}`}
                onClick=${() => {
                  onClose();
                  a.onSelect();
                }}
              >
                ${a.label}
              </button>
            `
          )}
        </div>
        <button class="action-sheet__item action-sheet__cancel" onClick=${onClose}>${cancelLabel || 'キャンセル'}</button>
      </div>
    </div>
  `;
}
