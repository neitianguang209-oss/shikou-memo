import htm from 'htm';
import React, { useEffect, useState } from 'react';
import * as db from '../lib/db.js';
import { formatDateHeading, formatTime } from '../lib/format.js';
import { tagColorVars } from '../lib/tagColors.js';
import { TagEditorModal } from './TagEditorModal.js';
import { ConfirmDialog } from './ConfirmDialog.js';

const html = htm.bind(React.createElement);
const UNCLASSIFIED_ID = '__unclassified__';

export function TagsView({ onJumpToHome, startEditToken }) {
  const [tags, setTags] = useState([]);
  const [notes, setNotes] = useState([]);
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    if (startEditToken) setEditMode(true);
  }, [startEditToken]);
  const [showCreate, setShowCreate] = useState(false);
  const [editingTag, setEditingTag] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [detailTagId, setDetailTagId] = useState(null);

  async function reload() {
    const [t, n] = await Promise.all([db.getAllTags(), db.getAllNotes()]);
    setTags(t);
    setNotes(n);
  }

  useEffect(() => {
    reload();
  }, []);

  function countFor(tagId) {
    if (tagId === UNCLASSIFIED_ID) {
      return notes.filter((n) => !n.tagIds || n.tagIds.length === 0).length;
    }
    return notes.filter((n) => (n.tagIds || []).includes(tagId)).length;
  }

  async function moveOrder(tag, delta) {
    const idx = tags.findIndex((t) => t.id === tag.id);
    const swapWith = tags[idx + delta];
    if (!swapWith) return;
    const a = { ...tag, order: swapWith.order };
    const b = { ...swapWith, order: tag.order };
    await db.updateTag(a);
    await db.updateTag(b);
    await reload();
  }

  async function handleDeleteConfirmed() {
    const id = deleteTarget.id;
    await db.deleteTag(id);
    const remaining = await db.getAllNotes();
    for (const n of remaining) {
      if ((n.tagIds || []).includes(id)) {
        await db.updateNote({ ...n, tagIds: n.tagIds.filter((t) => t !== id), updatedAt: new Date().toISOString() });
      }
    }
    setDeleteTarget(null);
    await reload();
  }

  if (detailTagId) {
    const tag = detailTagId === UNCLASSIFIED_ID ? { id: UNCLASSIFIED_ID, name: '未分類' } : tags.find((t) => t.id === detailTagId);
    const list =
      detailTagId === UNCLASSIFIED_ID
        ? notes.filter((n) => !n.tagIds || n.tagIds.length === 0)
        : notes.filter((n) => (n.tagIds || []).includes(detailTagId));
    list.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
    const groups = [];
    for (const n of list) {
      const last = groups[groups.length - 1];
      if (last && last.dateKey === n.dateKey) {
        last.notes.push(n);
      } else {
        groups.push({ dateKey: n.dateKey, notes: [n] });
      }
    }
    return html`
      <div class="tag-detail">
        <div class="view-header">
          <button class="view-header__back" onClick=${() => setDetailTagId(null)}>‹ タグ</button>
          <div class="view-header__title">${tag ? tag.name : ''}</div>
        </div>
        <div class="tag-detail__list">
          ${groups.length === 0 && html`<div class="view-placeholder">メモがありません</div>`}
          ${groups.map(
            (g) => html`
              <div key=${g.dateKey} class="tag-detail__group">
                <div class="tag-detail__date">${formatDateHeading(g.dateKey)}</div>
                ${g.notes.map(
                  (n) => html`
                    <button
                      key=${n.id}
                      class="tag-detail__note"
                      onClick=${() => onJumpToHome(n.dateKey, n.id)}
                    >
                      <span class="note-time">${formatTime(n.createdAt)}</span>
                      <span class="tag-detail__note-body">${n.body}</span>
                    </button>
                  `
                )}
              </div>
            `
          )}
        </div>
      </div>
    `;
  }

  return html`
    <div class="tags-view">
      <div class="view-header">
        <div class="view-header__title">タグ</div>
        <button class="view-header__action" onClick=${() => setEditMode((v) => !v)}>${editMode ? '完了' : '編集'}</button>
        <button class="view-header__action" onClick=${() => setShowCreate(true)}>＋</button>
      </div>
      <div class="tag-list">
        ${tags.map(
          (t, i) => html`
            <div key=${t.id} class="tag-row">
              ${editMode
                ? html`
                    <div class="tag-row__reorder">
                      <button disabled=${i === 0} onClick=${() => moveOrder(t, -1)}>▲</button>
                      <button disabled=${i === tags.length - 1} onClick=${() => moveOrder(t, 1)}>▼</button>
                    </div>
                  `
                : html`<span class="tag-dot" style=${tagColorVars(t.colorKey)}></span>`}
              <button
                class="tag-row__main"
                onClick=${() => (editMode ? setEditingTag(t) : setDetailTagId(t.id))}
              >
                <span class="tag-row__name">${t.name}</span>
                <span class="tag-row__count">${countFor(t.id)}</span>
              </button>
              ${editMode && html`
                <button class="tag-row__delete" onClick=${() => setDeleteTarget(t)} aria-label="削除">🗑</button>
              `}
            </div>
          `
        )}
      </div>
      <div class="tag-list__divider"></div>
      <div class="tag-row tag-row--fixed">
        <span class="tag-dot tag-dot--muted"></span>
        <button class="tag-row__main" onClick=${() => setDetailTagId(UNCLASSIFIED_ID)}>
          <span class="tag-row__name">未分類</span>
          <span class="tag-row__count">${countFor(UNCLASSIFIED_ID)}</span>
        </button>
      </div>
      ${showCreate && html`
        <${TagEditorModal}
          mode="create"
          existingTags=${tags}
          onClose=${() => setShowCreate(false)}
          onSaved=${async () => {
            setShowCreate(false);
            await reload();
          }}
        />
      `}
      ${editingTag && html`
        <${TagEditorModal}
          mode="edit"
          tag=${editingTag}
          existingTags=${tags}
          onClose=${() => setEditingTag(null)}
          onSaved=${async () => {
            setEditingTag(null);
            await reload();
          }}
        />
      `}
      ${deleteTarget && html`
        <${ConfirmDialog}
          message=${`タグ『${deleteTarget.name}』を削除します。${countFor(deleteTarget.id)}件のメモは削除されません。`}
          confirmLabel="削除"
          danger=${true}
          onCancel=${() => setDeleteTarget(null)}
          onConfirm=${handleDeleteConfirmed}
        />
      `}
    </div>
  `;
}
