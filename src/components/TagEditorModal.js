import htm from 'htm';
import React, { useState } from 'react';
import { TAG_COLORS, nextUnusedColor, tagColorVars } from '../lib/tagColors.js';
import * as db from '../lib/db.js';
import { uuid } from '../lib/format.js';

const html = htm.bind(React.createElement);

// mode: 'create' | 'edit'. tag: 編集対象(editのみ)。existingTags: 重複チェック・デフォルト色決定用。
export function TagEditorModal({ mode, tag, existingTags, onClose, onSaved }) {
  const [name, setName] = useState(tag ? tag.name : '');
  const [colorKey, setColorKey] = useState(tag ? tag.colorKey : nextUnusedColor(existingTags));
  const [error, setError] = useState('');

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('名前を入力してください');
      return;
    }
    if (trimmed.length > 12) {
      setError('12文字以内で入力してください');
      return;
    }
    const dup = existingTags.some((t) => t.name === trimmed && t.id !== (tag && tag.id));
    if (dup) {
      setError('同じ名前のタグがあります');
      return;
    }
    if (mode === 'create') {
      const newTag = {
        id: uuid(),
        name: trimmed,
        colorKey,
        order: existingTags.length,
        createdAt: new Date().toISOString(),
      };
      await db.addTag(newTag);
      onSaved(newTag);
    } else {
      const updated = { ...tag, name: trimmed, colorKey };
      await db.updateTag(updated);
      onSaved(updated);
    }
  }

  return html`
    <div class="overlay" onClick=${onClose}>
      <div class="modal-card" onClick=${(e) => e.stopPropagation()}>
        <div class="modal-card__title">${mode === 'create' ? '新しいタグ' : 'タグを編集'}</div>
        <input
          class="modal-card__input"
          value=${name}
          maxlength="12"
          placeholder="タグ名"
          onInput=${(e) => {
            setName(e.target.value);
            setError('');
          }}
        />
        <div class="color-picker">
          ${TAG_COLORS.map(
            (c) => html`
              <button
                key=${c.key}
                class=${`color-swatch${colorKey === c.key ? ' is-selected' : ''}`}
                style=${tagColorVars(c.key)}
                aria-label=${c.name}
                onClick=${() => setColorKey(c.key)}
              ></button>
            `
          )}
        </div>
        ${error && html`<div class="modal-card__error">${error}</div>`}
        <div class="modal-card__actions">
          <button class="modal-card__btn" onClick=${onClose}>キャンセル</button>
          <button class="modal-card__btn modal-card__btn--primary" onClick=${handleSave}>保存</button>
        </div>
      </div>
    </div>
  `;
}
