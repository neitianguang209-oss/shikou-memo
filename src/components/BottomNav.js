import htm from 'htm';
import React from 'react';

const html = htm.bind(React.createElement);

const ICONS = {
  home: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 11.5 12 4l8 7.5" />
    <path d="M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9" />
  </svg>`,
  tag: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <line x1="4" y1="9" x2="20" y2="9" />
    <line x1="4" y1="15" x2="20" y2="15" />
    <line x1="10" y1="4" x2="7" y2="20" />
    <line x1="17" y1="4" x2="14" y2="20" />
  </svg>`,
  search: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="11" cy="11" r="7" />
    <line x1="21" y1="21" x2="16.2" y2="16.2" />
  </svg>`,
  settings: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 13a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V19a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.96 17a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 13a1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 6.96a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 2.6a1.7 1.7 0 0 0 1.04-1.56V1a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 2.6a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 6.96 1.7 1.7 0 0 0 20.96 8H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1z" />
  </svg>`,
};

const TABS = [
  { key: 'home', icon: 'home', label: 'ホーム' },
  { key: 'tags', icon: 'tag', label: 'タグ' },
  { key: 'search', icon: 'search', label: '検索' },
  { key: 'settings', icon: 'settings', label: '設定' },
];

export function BottomNav({ active, onChange }) {
  return html`
    <nav class="bottom-nav">
      ${TABS.map(
        (tab) => html`
          <button
            key=${tab.key}
            class=${`bottom-nav__item${active === tab.key ? ' is-active' : ''}`}
            aria-label=${tab.label}
            onClick=${() => onChange(tab.key)}
          >
            ${ICONS[tab.icon]}
          </button>
        `
      )}
    </nav>
  `;
}
