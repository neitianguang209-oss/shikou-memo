import htm from 'htm';
import React, { useEffect } from 'react';

const html = htm.bind(React.createElement);

export function ConfirmDialog({ message, confirmLabel, danger, onConfirm, onCancel }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        onCancel();
      }
    }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onCancel]);

  return html`
    <div class="overlay" onClick=${(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div class="modal-card" role="alertdialog" aria-label=${message}>
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
