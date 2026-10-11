import htm from 'htm';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as db from '../lib/db.js';
import { formatDateTime, formatTime, todayDateKey, uuid } from '../lib/format.js';
import { tagColorVars } from '../lib/tagColors.js';
import { TagEditorModal } from './TagEditorModal.js';
import { ActionSheet } from './ActionSheet.js';

const html = htm.bind(React.createElement);
const TAGS_OPEN_KEY = 'shikou-memo:tagsOpen';
// 入力欄の中身と「送信」の見た目がずれていないか、念のため見直す間隔
const RECHECK_MS = 400;
// 手が止まってから書きかけを覚えるまでの間
const REMEMBER_AFTER_MS = 600;

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
const CLOSE_ICON = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
  <line x1="6" y1="6" x2="18" y2="18" />
  <line x1="18" y1="6" x2="6" y2="18" />
</svg>`;
const SEND_ICON = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M5 12h14M13 6l6 6-6 6" />
</svg>`;

// mode: 'create' | 'edit'
// 画面の上から出るカード。キーボードは下から出るので、送るボタンをいちばん上に置いておけば
// キーボードやタグ欄の出入りで隠れることがない。
// initialBody / initialTagIds / sourceLabel / onDiscard は、読書記録から届いた文章や
// 書きかけを戻すときに使う。notice は「書きかけを戻しました」などの一言。
// onUnsent(body, tagIds): 新規のシートを送らずに閉じたとき(書きかけを残すため)
// 送ったら(保存したら)必ず閉じて、ホームの一覧に戻る。
export function InputSheet({
  mode, dateKey, note, allTags, tagsLoading, initialTagsOpen, onClose, onSaved, onTagsChanged,
  initialBody, initialTagIds, sourceLabel, notice, onDiscard, onUnsent,
  submitLabel, noteExtra,
}) {
  const startBody = mode === 'edit' ? note.body : (initialBody || '');
  const startTagIds = mode === 'edit' ? [...(note.tagIds || [])] : [...(initialTagIds || [])];
  // 本文は入力欄そのものが持つ(こちらからは書き換えない)。日本語の変換中や音声入力の文字を
  // じゃましないため。body は「送れるか」の表示に使う写しで、送るときは入力欄から直接読む
  const [body, setBody] = useState(startBody);
  const [selectedTagIds, setSelectedTagIds] = useState(startTagIds);
  const [tagsOpen, setTagsOpen] = useState(!!initialTagsOpen);
  const [showTagCreator, setShowTagCreator] = useState(false);
  const [showNotice, setShowNotice] = useState(!!notice);
  const [confirmClose, setConfirmClose] = useState(false);
  const [error, setError] = useState('');
  const [now] = useState(() => new Date());
  const overlayRef = useRef(null);
  const textareaRef = useRef(null);
  const sendingRef = useRef(false);
  const doneRef = useRef(false);
  const rememberRef = useRef(null);

  function currentBody() {
    const el = textareaRef.current;
    return el ? el.value : body;
  }

  function syncBody() {
    setBody(currentBody());
    setError('');
  }

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    // 届いた文章や書きかけは、続きを書けるよう末尾にカーソルを置く
    const end = el.value.length;
    try { el.setSelectionRange(end, end); } catch (e) { /* 対応していなければそのまま */ }
  }, []);

  // 打った文字が「送信」の見た目に必ず反映されるように、入力欄の中身を定期的に見直す
  // (音声入力や予測変換など、入力の知らせが来ない入れ方があっても取りこぼさない)
  useEffect(() => {
    const timer = setInterval(() => {
      const el = textareaRef.current;
      if (el) setBody((prev) => (prev === el.value ? prev : el.value));
    }, RECHECK_MS);
    return () => clearInterval(timer);
  }, []);

  // 書きかけは、打っているそばから覚えておく。閉じる操作をしないままアプリを切り替えたり
  // 落ちたりしても、次に開いたときに戻せる(送ったあとは覚え直さない)
  rememberRef.current = () => {
    if (mode !== 'create' || !onUnsent || doneRef.current) return;
    onUnsent(currentBody(), selectedTagIds);
  };
  useEffect(() => {
    const timer = setTimeout(() => rememberRef.current(), REMEMBER_AFTER_MS);
    return () => clearTimeout(timer);
  }, [body, selectedTagIds]);
  useEffect(() => {
    function onHide() {
      if (document.visibilityState === 'hidden') rememberRef.current();
    }
    function onLeave() {
      rememberRef.current();
    }
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onLeave);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onLeave);
    };
  }, []);

  // 中身に合わせて入力欄の高さを伸ばす(上限は CSS。超えたら中でスクロール)
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [body]);

  // キーボードが出ているあいだ、カードの外をなぞっても画面ごと動かないようにする
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    function block(e) {
      if (e.target === el) e.preventDefault();
    }
    el.addEventListener('touchmove', block, { passive: false });
    return () => el.removeEventListener('touchmove', block);
  }, []);

  function isDirty() {
    return mode === 'edit'
      && (currentBody().trim() !== note.body || !sameIds(selectedTagIds, note.tagIds || []));
  }

  function requestClose() {
    const text = currentBody();
    if (mode === 'edit') {
      if (isDirty() && text.trim()) {
        // 確認は画面の下に出るので、先にキーボードをしまう
        textareaRef.current && textareaRef.current.blur();
        setConfirmClose(true);
        return;
      }
      onClose();
      return;
    }
    onUnsent && onUnsent(text, selectedTagIds);
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
    const trimmed = currentBody().trim();
    if (!trimmed) {
      setBody(currentBody());
      textareaRef.current && textareaRef.current.focus();
      return;
    }
    if (sendingRef.current) return;
    sendingRef.current = true;
    try {
      let saved;
      if (mode === 'create') {
        const nowIso = new Date().toISOString();
        saved = {
          ...(noteExtra || {}),   // 読書メモから来た印(source)など
          id: uuid(),
          body: trimmed,
          dateKey,
          createdAt: nowIso,
          updatedAt: nowIso,
          tagIds: [...selectedTagIds],
        };
        await db.addNote(saved);
      } else {
        saved = {
          ...note,
          body: trimmed,
          tagIds: [...selectedTagIds],
          updatedAt: new Date().toISOString(),
        };
        await db.updateNote(saved);
      }
      doneRef.current = true;
      // キーボードをしまって、ホームの一覧に戻る
      textareaRef.current && textareaRef.current.blur();
      onSaved(saved);
      onClose();
    } catch (e) {
      setConfirmClose(false);
      setError('保存できませんでした。もう一度お試しください');
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
    const el = textareaRef.current;
    if (el) el.value = '';
    setBody('');
    setSelectedTagIds([]);
    setShowNotice(false);
    onUnsent && onUnsent('', []);
    el && el.focus();
  }

  const dateLabel =
    mode === 'create'
      ? (dateKey === todayDateKey() ? `今日 ${formatTime(now.toISOString())}` : formatDateTime(dateKey, now.toISOString()))
      : formatDateTime(note.dateKey, note.createdAt);
  const selectedTags = selectedTagIds.map((id) => allTags.find((t) => t.id === id)).filter(Boolean);
  const canSend = !!body.trim();
  const sendLabel = submitLabel || (mode === 'create' ? '送信' : '保存');

  return html`
    <div class="overlay overlay--top" ref=${overlayRef} onClick=${(e) => { if (e.target === e.currentTarget) requestClose(); }}>
      <div class="input-sheet" role="dialog" aria-label=${mode === 'create' ? '新しいメモ' : 'メモを編集'}>
        <div class="input-sheet__header">
          <button class="input-sheet__close" onClick=${requestClose} aria-label="閉じる">${CLOSE_ICON}</button>
          <span class="input-sheet__datetime">${dateLabel}</span>
          <button
            class=${`input-sheet__send${canSend ? '' : ' is-empty'}`}
            aria-disabled=${!canSend}
            onClick=${handleSend}
          >
            <span>${sendLabel}</span>
            ${mode === 'create' && SEND_ICON}
          </button>
        </div>
        <div class="input-sheet__body">
          ${(sourceLabel || onDiscard) && html`
            <div class="input-sheet__top">
              ${sourceLabel && html`<div class="input-sheet__source">${BOOK_ICON}<span>${sourceLabel}</span></div>`}
              ${onDiscard && html`<button class="input-sheet__discard" onClick=${onDiscard}>捨てる</button>`}
            </div>
          `}
          ${notice && showNotice && html`
            <div class="input-sheet__notice">
              <span>${notice}</span>
              <button class="input-sheet__notice-btn" onClick=${clearRestored}>消す</button>
            </div>
          `}
          <textarea
            ref=${textareaRef}
            class="input-sheet__textarea"
            defaultValue=${startBody}
            onInput=${syncBody}
            onCompositionEnd=${syncBody}
            onKeyUp=${syncBody}
            onBlur=${syncBody}
            onKeyDown=${handleKeyDown}
            placeholder=${mode === 'create' ? 'いま考えていること' : ''}
          ></textarea>
          ${error && html`<div class="input-sheet__error" role="alert">${error}</div>`}
          <div class="input-sheet__tagbar">
            <button
              class=${`input-sheet__hash${tagsOpen ? ' is-open' : ''}`}
              onClick=${toggleTagsOpen}
              aria-label=${tagsOpen ? 'タグを閉じる' : 'タグを選ぶ'}
              aria-expanded=${tagsOpen}
            >#</button>
            ${tagsOpen
              ? (allTags.length === 0 && tagsLoading
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
                  `)
              : selectedTags.length > 0
              ? html`
                  <button class="input-sheet__selected" onClick=${toggleTagsOpen} aria-label="タグを選び直す">
                    ${selectedTags.map(
                      (t) => html`<span key=${t.id} class="tag-chip" style=${tagColorVars(t.colorKey)}>#${t.name}</span>`
                    )}
                  </button>
                `
              : html`<button class="input-sheet__tags-hint" onClick=${toggleTagsOpen}>タグをつける</button>`}
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
