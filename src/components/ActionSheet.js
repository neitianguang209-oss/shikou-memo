import htm from 'htm';
import React from 'react';

const html = htm.bind(React.createElement);

// actions: [{ label, danger, onSelect }]
export function ActionSheet({ actions, onClose }) {
  return html`
    <div class="overlay" onClick=${onClose}>
      <div class="action-sheet" onClick=${(e) => e.stopPropagation()}>
        ${actions.map(
          (a, i) => html`
            <button
              key=${i}
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
        <button class="action-sheet__item action-sheet__cancel" onClick=${onClose}>キャンセル</button>
      </div>
    </div>
  `;
}
