import htm from 'htm';
import React, { useLayoutEffect, useRef, useState } from 'react';
import { formatTime } from '../lib/format.js';
import { tagColorVars } from '../lib/tagColors.js';
import { LinkedText } from './LinkedText.js';

const html = htm.bind(React.createElement);
const LONG_PRESS_MS = 500;
const PRESS_MOVE_TOLERANCE = 10;

// メモの見せ方。設定で切り替える
export const NOTE_STYLES = [
  { key: 'bubble', label: '吹き出し' },
  { key: 'timeline', label: 'タイムライン' },
  { key: 'diary', label: '日記帳' },
];

// 読書メモ(読書記録アプリ)から入れたメモか。
// v1.3 からは note.source に印が残る。それより前(v1.2)に入れた分は、本文の最後の「― 『書名』」で見分ける
const SOURCE_LINE = /\n\n― 『[^』\n]+』( p\.[^\n]+)?\s*$/;
export function isFromReading(note) {
  if (note && note.source && note.source.app === 'reading-log') return true;
  return !!(note && typeof note.body === 'string' && SOURCE_LINE.test(note.body));
}

const BOOK_ICON = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15H5.5A1.5 1.5 0 0 0 4 20.5z" />
  <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v15h5.5a1.5 1.5 0 0 1 1.5 1.5z" />
</svg>`;

export function SourceMark({ compact }) {
  return html`<span class=${`src-mark${compact ? ' src-mark--compact' : ''}`} title="読書メモから">${BOOK_ICON}<span>読書メモから</span></span>`;
}

function TagChips({ tags }) {
  return tags.map((t) => html`<span class="tag-chip" key=${t.id} style=${tagColorVars(t.colorKey)}>#${t.name}</span>`);
}

// タップ(開く)・長押し(メニュー)・右クリック(メニュー)をまとめて扱う
function usePress(note, onTap, onLongPress) {
  const press = useRef(null);
  const suppressClick = useRef(false);

  function clear() {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  }
  return {
    // 長押しでメニューを出した直後の指離れは、タップとして扱わない
    consumeSuppressed() {
      if (!suppressClick.current) return false;
      suppressClick.current = false;
      return true;
    },
    handlers: {
      onPointerDown(e) {
        if (!onLongPress || (e.button !== undefined && e.button !== 0)) return;
        clear();
        const timer = setTimeout(() => {
          press.current = null;
          suppressClick.current = true;
          onLongPress(note);
        }, LONG_PRESS_MS);
        press.current = { timer, x: e.clientX, y: e.clientY };
      },
      onPointerMove(e) {
        // スクロールしようとしている指は長押しにしない
        const p = press.current;
        if (p && (Math.abs(e.clientX - p.x) > PRESS_MOVE_TOLERANCE || Math.abs(e.clientY - p.y) > PRESS_MOVE_TOLERANCE)) clear();
      },
      onPointerUp: clear,
      onPointerLeave: clear,
      onPointerCancel: clear,
      onContextMenu(e) {
        if (!onLongPress) return;
        e.preventDefault();
        clear();
        onLongPress(note);
      },
      onKeyDown(e) {
        if (e.key === 'Enter' && onTap) onTap(note);
      },
    },
  };
}

// variant: 'bubble' | 'timeline' | 'diary'
export function NoteItem({ note, tags, variant, highlighted, onTap, onLongPress }) {
  const bodyRef = useRef(null);
  const [isClamped, setIsClamped] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const { handlers, consumeSuppressed } = usePress(note, onTap, onLongPress);

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    if (!isExpanded) setIsClamped(el.scrollHeight > el.clientHeight + 1);
  }, [note.body, isExpanded, variant]);

  const noteTags = (note.tagIds || []).map((id) => tags.find((t) => t.id === id)).filter(Boolean);
  // 先頭のタグの色を、そのメモの色として線や点に使う(タグなしは灰色)
  const colorStyle = noteTags.length > 0 ? tagColorVars(noteTags[0].colorKey) : null;
  const fromReading = isFromReading(note);
  const clamped = !isExpanded && isClamped;

  function handleClick() {
    if (consumeSuppressed()) return;
    if (clamped) {
      setIsExpanded(true);
      return;
    }
    onTap && onTap(note);
  }

  const body = html`
    <div
      ref=${bodyRef}
      class=${`note-text${isExpanded ? '' : ' is-clamped'}`}
    ><${LinkedText} text=${note.body} /></div>
  `;
  const more = clamped && html`<button class="note-more" onClick=${() => setIsExpanded(true)}>続きを読む</button>`;
  const meta = (fromReading || noteTags.length > 0) && html`
    <div class="note-tags">
      ${fromReading && html`<${SourceMark} />`}
      <${TagChips} tags=${noteTags} />
    </div>
  `;
  const surface = {
    role: onTap ? 'button' : undefined,
    tabIndex: onTap ? 0 : -1,
    onClick: handleClick,
    ...handlers,
  };

  if (variant === 'timeline') {
    return html`
      <div class=${`tl-row${noteTags.length ? ' has-tag' : ''}`} id=${`note-${note.id}`} style=${colorStyle}>
        <div class="tl-time">${formatTime(note.createdAt)}</div>
        <div class="tl-rail"><span class="tl-dot"></span></div>
        <div class="tl-main">
          <div class=${`tl-card${highlighted ? ' is-highlighted' : ''}`} ...${surface}>
            ${body}
            ${more}
            ${meta}
          </div>
        </div>
      </div>
    `;
  }

  if (variant === 'diary') {
    return html`
      <div class=${`diary-row${highlighted ? ' is-highlighted' : ''}`} id=${`note-${note.id}`} style=${colorStyle} ...${surface}>
        <div class="diary-meta">
          <span class=${`diary-dot${noteTags.length ? ' has-tag' : ''}`}></span>
          <span class="diary-time">${formatTime(note.createdAt)}</span>
          ${fromReading && html`<${SourceMark} compact=${true} />`}
        </div>
        ${body}
        ${more}
        ${noteTags.length > 0 && html`<div class="note-tags"><${TagChips} tags=${noteTags} /></div>`}
      </div>
    `;
  }

  return html`
    <div class="note-row" id=${`note-${note.id}`}>
      <span class="note-time">${formatTime(note.createdAt)}</span>
      <div class="note-bubble-col">
        <div
          class=${`note-bubble${noteTags.length ? ' has-tag' : ''}${highlighted ? ' is-highlighted' : ''}`}
          style=${colorStyle}
          ...${surface}
        >
          ${body}
        </div>
        ${more}
        ${meta}
      </div>
    </div>
  `;
}
