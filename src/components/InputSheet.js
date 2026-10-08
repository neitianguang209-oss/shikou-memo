import htm from 'htm';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as db from '../lib/db.js';
import { formatDateTime, uuid } from '../lib/format.js';
import { tagColorVars } from '../lib/tagColors.js';
import { TagEditorModal } from './TagEditorModal.js';
import { ActionSheet } from './ActionSheet.js';

const html = htm.bind(React.createElement);
const TAGS_OPEN_KEY = 'shikou-memo:tagsOpen';

// 新しく書くとき、タグ欄を開いた状態で出すか(前回の開け閉めを覚えておく)
export function readTagsOpenPref() {
  try { return localStorage.getItem(TAGS_OPEN_KEY) === '1'; } catch (e) { return false; }
}
function writeTagsOpenPref(open) {
  try { localStorage.setItem(TAGS_OPEN_KEY, open ? '1' : '0'); } catch (e) { /* 覚えられなくても困らない */ }
}

function sameIds(a, b) {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

const BOOK_ICON = html`<svg class="input-sheet__source-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15H5.5A1.5 1.5 0 0 0 4 20.5z" />
  <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v15h5.5a1.5 1.5 0 0 1 1.5 1.5z" />
</svg>`;

// mode: 'create' | 'edit'
// initialBody / initialTagIds / sourceLabel / onDiscard / closeAfterSend は、読書記録から届いた文章や
// 書きかけを戻すときに使う。notice は「書きかけを戻しました」などの一言。
// onUnsent(body, tagIds): 新規のシートを送らずに閉じたとき(書きかけを残すため)
export function InputSheet({
  mode, dateKey, note, allTags, tagsLoading, initialTagsOpen, onClose, onSaved, onTagsChanged,
  initialBody, initialTagIds, sourceLabel, notice, onDiscard, closeAfterSend, onUnsent,
}) {
  const startBody = mode === 'edit' ? note.body : (initialBody || '');
  const startTagIds = mode === 'edit' ? [...(note.tagIds || [])] : [...(initialTagIds || [])];
  const [body, setBody] = useState(startBody);
  const [selectedTagIds, setSelectedTagIds] = useState(startTagIds);
  const [tagsOpen, setTagsOpen] = useState(!!initialTagsOpen);
  const [showTagCreator, setShowTagCreator] = useState(false);
  const [showNotice, setShowNotice] = useState(!!notice);
  const [confirmClose, setConfirmClose] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const textareaRef = useRef(null);
  const dragStartY = useRef(null);
  const sendingRef = useRef(false);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    // 届いた文章や書きかけは、続きを書けるよう末尾にカーソルを置く
    const end = el.value.length;
    try { el.setSelectionRange(end, end); } catch (e) { /* 対応していなければそのまま */ }
  }, []);

  // 中身に合わせて入力欄の高さを伸ばす(上限を超えたら中でスクロール)
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const max = Math.round(window.innerHeight * 0.45);
    el.style.height = `${Math.min(el.scrollHeight + 2, max)}px`;
  }, [body]);

  const isDirty = mode === 'edit'
    ? body.trim() !== note.body || !sameIds(selectedTagIds, note.tagIds || [])
    : false;

  function requestClose() {
    if (mode === 'edit') {
      if (isDirty && body.trim()) {
        setConfirmClose(true);
        return;
      }
      onClose();
      return;
    }
    onUnsent && onUnsent(body, selectedTagIds);
    onClose();
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape' || showTagCreator || confirmClose) return;
      requestClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  function toggleTag(id) {
    setSelectedTagIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleTagsOpen() {
    setTagsOpen((v) => {
      writeTagsOpenPref(!v);
      return !v;
    });
  }

  async function handleSend() {
    const trimmed = body.trim();
    if (!trimmed || sendingRef.current) return;
    sendingRef.current = true;
    try {
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
        onSaved(newNote);
        // 届いた文章の確認はこれで終わりなのでシートを閉じる。
        // 通常の新規作成は連投できるよう、テキストだけ消してシートを残す
        if (closeAfterSend) {
          onClose();
          return;
        }
        setBody('');
        setShowNotice(false);
        setNow(new Date());
        textareaRef.current && textareaRef.current.focus();
      } else {
        const updated = {
          ...note,
          body: trimmed,
          tagIds: [...selectedTagIds],
          updatedAt: new Date().toISOString(),
        };
        await db.updateNote(updated);
        onSaved(updated);
        onClose();
      }
    } finally {
      sendingRef.current = false;
    }
  }

  function handleKeyDown(e) {
    // パソコンでは Ctrl(⌘)+Enter で送れる
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  }

  function clearRestored() {
    setBody('');
    setSelectedTagIds([]);
    setShowNotice(false);
    onUnsent && onUnsent('', []);
    textareaRef.current && textareaRef.current.focus();
  }

  function handleHandlePointerDown(e) {
    dragStartY.current = e.clientY;
  }
  function handleHandlePointerUp(e) {
    if (dragStartY.current == null) return;
    const dy = e.clientY - dragStartY.current;
    dragStartY.current = null;
    if (dy > 60) requestClose();
  }

  const dateLabel =
    mode === 'create' ? formatDateTime(dateKey, now.toISOString()) : formatDateTime(note.dateKey, note.createdAt);
  const selectedTags = selectedTagIds.map((id) => allTags.find((t) => t.id === id)).filter(Boolean);

  return html`
    <div class="overlay" onClick=${(e) => { if (e.target === e.currentTarget) requestClose(); }}>
      <div class="input-sheet" role="dialog" aria-label=${mode === 'create' ? '新しいメモ' : 'メモを編集'} onClick=${(e) => e.stopPropagation()}>
        <div
          class="input-sheet__handle"
          onPointerDown=${handleHandlePointerDown}
          onPointerUp=${handleHandlePointerUp}
        ></div>
        ${sourceLabel && html`<div class="input-sheet__source">${BOOK_ICON}<span>${sourceLabel}</span></div>`}
        ${notice && showNotice && html`
          <div class="input-sheet__notice">
            <span>${notice}</span>
            <button class="input-sheet__notice-btn" onClick=${clearRestored}>消す</button>
          </div>
        `}
        <textarea
          ref=${textareaRef}
          class="input-sheet__textarea"
          value=${body}
          onInput=${(e) => setBody(e.target.value)}
          onKeyDown=${handleKeyDown}
          placeholder=${mode === 'create' ? 'いま考えていること' : ''}
        ></textarea>
        ${tagsOpen
          ? html`
              <div class="input-sheet__tagrow">
                ${allTags.length === 0 && tagsLoading
                  ? html`<span class="input-sheet__tags-loading">タグを読み込んでいます…</span>`
                  : html`
                      ${allTags.map(
                        (t) => html`
                          <button
                            key=${t.id}
                            class=${`tag-chip${selectedTagIds.includes(t.id) ? '' : ' tag-chip--outline'}`}
                            style=${tagColorVars(t.colorKey)}
                            aria-pressed=${selectedTagIds.includes(t.id)}
                            onClick=${() => toggleTag(t.id)}
                          >
                            #${t.name}
                          </button>
                        `
                      )}
                      <button class="tag-chip tag-chip--new" onClick=${() => setShowTagCreator(true)}>
                        ＋ ${allTags.length === 0 ? 'タグを作る' : '新しいタグ'}
                      </button>
                    `}
              </div>
            `
          : selectedTags.length > 0 && html`
              <button class="input-sheet__selected" onClick=${toggleTagsOpen} aria-label="タグを選び直す">
                ${selectedTags.map(
                  (t) => html`<span key=${t.id} class="tag-chip" style=${tagColorVars(t.colorKey)}>#${t.name}</span>`
                )}
              </button>
            `}
        <div class="input-sheet__footer">
          <span class="input-sheet__datetime">${dateLabel}</span>
          ${onDiscard && html`<button class="input-sheet__discard" onClick=${onDiscard}>捨てる</button>`}
          <div class="input-sheet__actions">
            <button
              class=${`input-sheet__hash${tagsOpen ? ' is-open' : ''}`}
              onClick=${toggleTagsOpen}
              aria-label=${tagsOpen ? 'タグを閉じる' : 'タグを選ぶ'}
              aria-expanded=${tagsOpen}
            >#</button>
            <button
              class="input-sheet__send"
              disabled=${!body.trim()}
              onClick=${handleSend}
              aria-label=${mode === 'create' ? '送信' : '保存'}
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
          onSaved=${async (newTag) => {
            setShowTagCreator(false);
            // 作ったタグはそのまま選んだ状態にする
            if (newTag) setSelectedTagIds((prev) => (prev.includes(newTag.id) ? prev : [...prev, newTag.id]));
            await onTagsChanged();
          }}
        />
      `}
      ${confirmClose && html`
        <${ActionSheet}
          message="変更がまだ保存されていません"
          cancelLabel="編集を続ける"
          onClose=${() => setConfirmClose(false)}
          actions=${[
            { label: '変更を保存する', onSelect: () => handleSend() },
            { label: '変更を捨てる', danger: true, onSelect: () => onClose() },
          ]}
        />
      `}
    </div>
  `;
}
