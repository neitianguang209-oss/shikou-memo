import htm from 'htm';
import React, { useState } from 'react';
import { BottomNav } from './components/BottomNav.js';
import { HomeView } from './components/HomeView.js';
import { TagsView } from './components/TagsView.js';
import { SearchView } from './components/SearchView.js';
import { SettingsView } from './components/SettingsView.js';

const html = htm.bind(React.createElement);

export function App() {
  const [view, setView] = useState('home');
  // タグ一覧・検索からホームへジャンプする際に使う: { dateKey, noteId }
  const [homeJump, setHomeJump] = useState(null);
  // 設定画面の「タグを管理」からタグ編集モードで開く際に使う
  const [tagsOpenToken, setTagsOpenToken] = useState(null);

  function jumpToHome(dateKey, noteId) {
    setHomeJump({ dateKey, noteId, token: Date.now() });
    setView('home');
  }

  function manageTags() {
    setTagsOpenToken(Date.now());
    setView('tags');
  }

  return html`
    <div class="app">
      <div class="app-body">
        ${view === 'home' && html`<${HomeView} jump=${homeJump} />`}
        ${view === 'tags' && html`<${TagsView} onJumpToHome=${jumpToHome} startEditToken=${tagsOpenToken} />`}
        ${view === 'search' && html`<${SearchView} onJumpToHome=${jumpToHome} />`}
        ${view === 'settings' && html`<${SettingsView} onManageTags=${manageTags} />`}
      </div>
      <${BottomNav} active=${view} onChange=${setView} />
    </div>
  `;
}
