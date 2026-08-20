import htm from 'htm';
import React from 'react';

const html = htm.bind(React.createElement);

export function ConfirmDialog({ message, confirmLabel, danger, onConfirm, onCancel }) {
  return html`
    <div class="overlay" onClick=${onCancel}>
      <div class="modal-card" onClick=${(e) => e.stopPropagation()}>
        <div class="modal-card__message">${message}</div>
        <div class="modal-card__actions">
          <button class="modal-card__btn" onClick=${onCancel}>キャンセル</button>
          <button
            class=${`modal-card__btn modal-card__btn--primary${danger ? ' is-danger' : ''}`}
            onClick=${onConfirm}
          >
            ${confirmLabel || 'OK'}
          </button>
        </div>
      </div>
    </div>
  `;
}
