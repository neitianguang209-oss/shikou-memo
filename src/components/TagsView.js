import htm from 'htm';
import React, { useEffect, useState } from 'react';
import * as db from '../lib/db.js';
import { formatDateHeadingWithYear, formatTime } from '../lib/format.js';
import { tagColorVars } from '../lib/tagColors.js';
import { TagEditorModal } from './TagEditorModal.js';
import { ConfirmDialog } from './ConfirmDialog.js';
import { SourceMark, isFromReading } from './NoteItem.js';
import { LinkedText, pressable } from './LinkedText.js';

const html = htm.bind(React.createElement);
const UNCLASSIFIED_ID = '__unclassified__';

const CHEVRON = html`<svg class="list-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18" /></svg>`;
const TRASH = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M4 7h16" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /><path d="M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12" />
</svg>`;
const UP = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 14 12 8 18 14" /></svg>`;
const DOWN = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 10 12 16 18 10" /></svg>`;
const PLUS = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>`;

export function TagsView({ onJumpToHome, startEditToken, onStartEditConsumed, dataVersion }) {
  const [tags, setTags] = useState([]);
  const [notes, setNotes] = useState([]);
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    if (startEditToken) {
      setEditMode(true);
      // 消費したら親側のトークンをクリアする。しないと、設定画面から一度でも
      // 「タグを管理」で開いた後は、以降ずっとこのタブが編集モードで開いてしまう
      onStartEditConsumed && onStartEditConsumed();
    }
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
  }, [dataVersion]);

  // 一覧から戻ったときに上から見えるように
  useEffect(() => {
    const body = document.querySelector('.app-body');
    if (body) body.scrollTop = 0;
  }, [detailTagId]);

  function countFor(tagId) {
    if (tagId === UNCLASSIFIED_ID) {
      return notes.filter((n) => !n.tagIds || n.tagIds.length === 0).length;
    }
    return notes.filter((n) => (n.tagIds || []).includes(tagId)).length;
  }

  async function moveOrder(tag, delta) {
    const idx = tags.findIndex((t) => t.id === tag.id);
    if (!tags[idx + delta]) return;
    const next = [...tags];
    [next[idx], next[idx + delta]] = [next[idx + delta], next[idx]];
    // 番号が重なっていたり飛んでいたりしても確実に並ぶよう、並びの位置で振り直す(変わるものだけ保存)
    for (let i = 0; i < next.length; i++) {
      if (next[i].order !== i) await db.updateTag({ ...next[i], order: i });
    }
    await reload();
  }

  async function handleDeleteConfirmed() {
    const id = deleteTarget.id;
    await db.deleteTag(id);
    const remaining = await db.getAllNotes();
    for (const n of remaining) {
      if ((n.tagIds || []).includes(id)) {
        await db.updateNote({ ...n, tagIds: n.tagIds.filter((t) => t !== id) });
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
          <button class="view-header__back" onClick=${() => setDetailTagId(null)} aria-label="タグの一覧に戻る">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 6 9 12 15 18" /></svg>
            タグ
          </button>
          <div class="view-header__title view-header__title--tag">
            ${tag && tag.colorKey
              ? html`<span class="tag-dot tag-dot--lg" style=${tagColorVars(tag.colorKey)}></span>`
              : html`<span class="tag-dot tag-dot--lg tag-dot--muted"></span>`}
            <span>${tag ? tag.name : ''}</span>
          </div>
          <span class="view-header__count">${list.length}件</span>
        </div>
        <div class="tag-detail__list">
          ${groups.length === 0 && html`<div class="view-placeholder">このタグのメモはまだありません</div>`}
          ${groups.map(
            (g) => html`
              <div key=${g.dateKey} class="tag-detail__group">
                <div class="tag-detail__date">${formatDateHeadingWithYear(g.dateKey)}</div>
                ${g.notes.map(
                  (n) => html`
                    <div
                      key=${n.id}
                      class="tag-detail__note"
                      ...${pressable(() => onJumpToHome(n.dateKey, n.id))}
                    >
                      <span class="note-time">${formatTime(n.createdAt)}</span>
                      <span class="tag-detail__note-main">
                        <span class="tag-detail__note-body"><${LinkedText} text=${n.body} /></span>
                        ${isFromReading(n) && html`<${SourceMark} compact=${true} />`}
                      </span>
                    </div>
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
        ${tags.length > 0 && html`
          <button class="view-header__action" onClick=${() => setEditMode((v) => !v)}>${editMode ? '完了' : '編集'}</button>
        `}
        <button class="view-header__icon" onClick=${() => setShowCreate(true)} aria-label="タグを作る">${PLUS}</button>
      </div>
      <div class="list-section">
        ${tags.length === 0
          ? html`<div class="view-placeholder">タグはまだありません。右上の＋から作れます。</div>`
          : html`
              <div class="list-card">
                ${tags.map(
                  (t, i) => html`
                    <div key=${t.id} class="tag-row">
                      ${editMode
                        ? html`
                            <div class="tag-row__reorder">
                              <button disabled=${i === 0} onClick=${() => moveOrder(t, -1)} aria-label=${`${t.name}を上へ`}>${UP}</button>
                              <button disabled=${i === tags.length - 1} onClick=${() => moveOrder(t, 1)} aria-label=${`${t.name}を下へ`}>${DOWN}</button>
                            </div>
                          `
                        : html`<span class="tag-dot tag-dot--lg" style=${tagColorVars(t.colorKey)}></span>`}
                      <button
                        class="tag-row__main"
                        onClick=${() => (editMode ? setEditingTag(t) : setDetailTagId(t.id))}
                      >
                        <span class="tag-row__name">${t.name}</span>
                        ${editMode
                          ? html`<span class="tag-row__edit-hint">名前・色</span>`
                          : html`<span class="tag-row__count">${countFor(t.id)}</span>`}
                        ${!editMode && CHEVRON}
                      </button>
                      ${editMode && html`
                        <button class="tag-row__delete" onClick=${() => setDeleteTarget(t)} aria-label=${`${t.name}を削除`}>${TRASH}</button>
                      `}
                    </div>
                  `
                )}
              </div>
            `}
        ${editMode && tags.length > 1 && html`<div class="list-hint">上下の矢印で並べ替え、名前を押すと名前と色を変えられます</div>`}
        <div class="list-card">
          <div class="tag-row">
            <span class="tag-dot tag-dot--lg tag-dot--muted"></span>
            <button class="tag-row__main" onClick=${() => setDetailTagId(UNCLASSIFIED_ID)}>
              <span class="tag-row__name">未分類</span>
              <span class="tag-row__count">${countFor(UNCLASSIFIED_ID)}</span>
              ${CHEVRON}
            </button>
          </div>
        </div>
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
