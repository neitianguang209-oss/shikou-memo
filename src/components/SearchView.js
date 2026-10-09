import htm from 'htm';
import React, { useEffect, useRef, useState } from 'react';
import * as db from '../lib/db.js';
import { formatDateHeadingWithYear, formatTime } from '../lib/format.js';
import { tagColorVars } from '../lib/tagColors.js';
import { SourceMark, isFromReading } from './NoteItem.js';

const html = htm.bind(React.createElement);
const SNIPPET_LEAD = 18;   // 一致した所がこれより後ろにあるときは、手前を「…」で省いて見せる

// 別のタブへ行って戻っても、さっきの検索語のまま開く
let savedQuery = '';

function normalize(s) {
  return s.normalize('NFKC').toLowerCase();
}

// 1文字ずつそろえた文字列と、そろえた後の位置 → 元の文字の位置の対応
function indexBody(body) {
  const chars = Array.from(body);
  let norm = '';
  const map = [];
  chars.forEach((ch, i) => {
    const n = normalize(ch);
    norm += n;
    for (let k = 0; k < n.length; k++) map.push(i);
  });
  return { chars, norm, map };
}

// 一致した所(元の文字の位置で [start, end))をすべて返す
function findRanges(index, normQuery) {
  const ranges = [];
  if (!normQuery) return ranges;
  let from = 0;
  while (from <= index.norm.length - normQuery.length) {
    const at = index.norm.indexOf(normQuery, from);
    if (at === -1) break;
    const start = index.map[at];
    const end = index.map[at + normQuery.length - 1] + 1;
    ranges.push([start, end]);
    from = at + normQuery.length;
  }
  return ranges;
}

function Snippet({ body, query }) {
  const index = indexBody(body);
  const ranges = findRanges(index, normalize(query));
  if (ranges.length === 0) return html`${body}`;
  const cut = ranges[0][0] > SNIPPET_LEAD + 6 ? ranges[0][0] - SNIPPET_LEAD : 0;
  const parts = [];
  let pos = cut;
  ranges.forEach(([s, e], i) => {
    if (s < pos) return;
    if (s > pos) parts.push(index.chars.slice(pos, s).join(''));
    parts.push(html`<mark key=${i} class="search-highlight">${index.chars.slice(s, e).join('')}</mark>`);
    pos = e;
  });
  parts.push(index.chars.slice(pos).join(''));
  return html`${cut > 0 ? '…' : ''}${parts}`;
}

export function SearchView({ onJumpToHome, dataVersion }) {
  const [query, setQuery] = useState(savedQuery);
  const [results, setResults] = useState([]);
  const [tags, setTags] = useState([]);
  const inputRef = useRef(null);
  const runId = useRef(0);

  async function search(value) {
    const id = ++runId.current;
    const trimmed = value.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }
    const all = await db.getAllNotes();
    if (id !== runId.current) return;   // 打ち続けているときは、最後の入力の結果だけ出す
    const normQuery = normalize(trimmed);
    const matched = all
      .filter((n) => normalize(n.body).includes(normQuery))
      .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
    setResults(matched);
  }

  // 開いたとき・クラウドから変更が届いたときは、今の検索語で探し直す
  useEffect(() => {
    db.getAllTags().then(setTags);
    if (query.trim()) search(query);
  }, [dataVersion]);

  function handleInput(value) {
    setQuery(value);
    savedQuery = value;
    search(value);
  }

  function clear() {
    handleInput('');
    inputRef.current && inputRef.current.focus();
  }

  const trimmed = query.trim();

  return html`
    <div class="search-view">
      <div class="view-header">
        <div class="search-box">
          <svg class="search-box__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.2" y2="16.2" />
          </svg>
          <input
            ref=${inputRef}
            class="search-input"
            type="search"
            enterkeyhint="search"
            autocomplete="off"
            value=${query}
            placeholder="メモの中の言葉で探す"
            aria-label="検索"
            onInput=${(e) => handleInput(e.target.value)}
            onKeyDown=${(e) => { if (e.key === 'Enter') e.target.blur(); }}
          />
          ${query && html`
            <button class="search-box__clear" onClick=${clear} aria-label="検索語を消す">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><line x1="8" y1="8" x2="16" y2="16" /><line x1="16" y1="8" x2="8" y2="16" /></svg>
            </button>
          `}
        </div>
      </div>
      <div class="search-results">
        ${!trimmed && html`<div class="view-placeholder">全角・半角や大文字・小文字の違いは気にせず探せます</div>`}
        ${trimmed && results.length === 0 && html`<div class="view-placeholder">「${trimmed}」を含むメモはありません</div>`}
        ${trimmed && results.length > 0 && html`<div class="search-count">${results.length}件</div>`}
        ${results.map((n) => {
          const noteTags = (n.tagIds || []).map((id) => tags.find((t) => t.id === id)).filter(Boolean);
          return html`
            <button key=${n.id} class="search-result" onClick=${() => onJumpToHome(n.dateKey, n.id)}>
              <div class="search-result__meta">
                <span>${formatDateHeadingWithYear(n.dateKey)} ${formatTime(n.createdAt)}</span>
                ${isFromReading(n) && html`<${SourceMark} compact=${true} />`}
                ${noteTags.map((t) => html`<span key=${t.id} class="tag-chip tag-chip--mini" style=${tagColorVars(t.colorKey)}>#${t.name}</span>`)}
              </div>
              <div class="search-result__body"><${Snippet} body=${n.body} query=${trimmed} /></div>
            </button>
          `;
        })}
      </div>
    </div>
  `;
}
