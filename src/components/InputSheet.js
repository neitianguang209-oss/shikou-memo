import htm from 'htm';
import React, { useEffect, useRef, useState } from 'react';
import * as db from '../lib/db.js';
import { formatDateTime, uuid } from '../lib/format.js';
import { tagColorVars } from '../lib/tagColors.js';
import { TagEditorModal } from './TagEditorModal.js';

const html = htm.bind(React.createElement);

// mode: 'create' | 'edit'
export function InputSheet({ mode, dateKey, note, allTags, initialTagsOpen, onClose, onSaved, onTagsChanged }) {
  const [body, setBody] = useState(mode === 'edit' ? note.body : '');
  const [selectedTagIds, setSelectedTagIds] = useState(mode === 'edit' ? [...note.tagIds] : []);
  const [tagsOpen, setTagsOpen] = useState(!!initialTagsOpen);
  const [showTagCreator, setShowTagCreator] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const textareaRef = useRef(null);
  const dragStartY = useRef(null);

  useEffect(() => {
    textareaRef.current && textareaRef.current.focus();
  }, []);

  function toggleTag(id) {
    setSelectedTagIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleSend() {
    const trimmed = body.trim();
    if (!trimmed) return;
    if (mode === 'create') {
      const nowIso = new Date().toISOString();
      const newNote = {
        id: uuid(),
        body: trimmed,
        dateKey,
        createdAt: nowIso,
        updatedAt: nowIso,
        tagIds: [...selectedTagIds],
      };
      await db.addNote(newNote);
      setBody('');
      setNow(new Date());
      onSaved();
      textareaRef.current && textareaRef.current.focus();
    } else {
      const updated = {
        ...note,
        body: trimmed,
        tagIds: [...selectedTagIds],
        updatedAt: new Date().toISOString(),
      };
      await db.updateNote(updated);
      onSaved();
      onClose();
    }
  }

  function handleHandlePointerDown(e) {
    dragStartY.current = e.clientY;
  }
  function handleHandlePointerUp(e) {
    if (dragStartY.current == null) return;
    const dy = e.clientY - dragStartY.current;
    dragStartY.current = null;
    if (dy > 60) onClose();
  }

  const dateLabel =
    mode === 'create' ? formatDateTime(dateKey, now.toISOString()) : formatDateTime(note.dateKey, note.createdAt);

  return html`
    <div class="overlay" onClick=${onClose}>
      <div class="input-sheet" onClick=${(e) => e.stopPropagation()}>
        <div
          class="input-sheet__handle"
          onPointerDown=${handleHandlePointerDown}
          onPointerUp=${handleHandlePointerUp}
        ></div>
        <textarea
          ref=${textareaRef}
          class="input-sheet__textarea"
          value=${body}
          onInput=${(e) => setBody(e.target.value)}
          placeholder=""
        ></textarea>
        ${tagsOpen && html`
          <div class="input-sheet__tagrow">
            ${allTags.length === 0
              ? html`
                  <button class="tag-chip tag-chip--outline" onClick=${() => setShowTagCreator(true)}>
                    ＋ タグを作る
                  </button>
                `
              : allTags.map(
                  (t) => html`
                    <button
                      key=${t.id}
                      class=${`tag-chip${selectedTagIds.includes(t.id) ? '' : ' tag-chip--outline'}`}
                      style=${tagColorVars(t.colorKey)}
                      onClick=${() => toggleTag(t.id)}
                    >
                      #${t.name}
                    </button>
                  `
                )}
          </div>
        `}
        <div class="input-sheet__footer">
          <span class="input-sheet__datetime">${dateLabel}</span>
          <div class="input-sheet__actions">
            <button class="input-sheet__hash" onClick=${() => setTagsOpen((v) => !v)} aria-label="タグ">#</button>
            <button
              class="input-sheet__send"
              disabled=${!body.trim()}
              onClick=${handleSend}
              aria-label="送信"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </div>
        </div>
      </div>
      ${showTagCreator && html`
        <${TagEditorModal}
          mode="create"
          existingTags=${allTags}
          onClose=${() => setShowTagCreator(false)}
          onSaved=${async () => {
            setShowTagCreator(false);
            await onTagsChanged();
          }}
        />
      `}
    </div>
  `;
}
