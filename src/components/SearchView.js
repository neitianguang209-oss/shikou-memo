import htm from 'htm';
import React, { useState } from 'react';
import * as db from '../lib/db.js';
import { formatDateHeading, formatTime } from '../lib/format.js';

const html = htm.bind(React.createElement);

function normalize(s) {
  return s.normalize('NFKC').toLowerCase();
}

function highlightBody(body, query) {
  const normBody = normalize(body);
  const normQuery = normalize(query);
  const idx = normBody.indexOf(normQuery);
  if (idx === -1 || !normQuery) return html`${body}`;
  const before = body.slice(0, idx);
  const match = body.slice(idx, idx + normQuery.length);
  const after = body.slice(idx + normQuery.length);
  return html`${before}<span class="search-highlight">${match}</span>${after}`;
}

export function SearchView({ onJumpToHome }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);

  async function handleInput(value) {
    setQuery(value);
    const trimmed = value.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }
    const all = await db.getAllNotes();
    const normQuery = normalize(trimmed);
    const matched = all
      .filter((n) => normalize(n.body).includes(normQuery))
      .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
    setResults(matched);
  }

  return html`
    <div class="search-view">
      <div class="view-header">
        <input
          class="search-input"
          value=${query}
          placeholder="検索"
          onInput=${(e) => handleInput(e.target.value)}
        />
      </div>
      <div class="search-results">
        ${query.trim() && results.length === 0 && html`<div class="view-placeholder">一致するメモはありません</div>`}
        ${results.map(
          (n) => html`
            <button key=${n.id} class="search-result" onClick=${() => onJumpToHome(n.dateKey, n.id)}>
              <div class="search-result__meta">${formatDateHeading(n.dateKey)} ${formatTime(n.createdAt)}</div>
              <div class="search-result__body">${highlightBody(n.body, query.trim())}</div>
            </button>
          `
        )}
      </div>
    </div>
  `;
}
