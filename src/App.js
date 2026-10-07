import htm from 'htm';
import React, { useEffect, useState } from 'react';
import { BottomNav } from './components/BottomNav.js';
import { HomeView } from './components/HomeView.js';
import { TagsView } from './components/TagsView.js';
import { SearchView } from './components/SearchView.js';
import { SettingsView } from './components/SettingsView.js';
import { getSyncState, onRemoteData, onSyncState } from './lib/sync.js';

const html = htm.bind(React.createElement);

export function App() {
  const [view, setView] = useState('home');
  // タグ一覧・検索からホームへジャンプする際に使う: { dateKey, noteId }
  const [homeJump, setHomeJump] = useState(null);
  // 設定画面の「タグを管理」からタグ編集モードで開く際に使う
  const [tagsOpenToken, setTagsOpenToken] = useState(null);
  // クラウドから取り込んで中身が変わるたびに増える。各画面はこれを見て読み直す
  const [dataVersion, setDataVersion] = useState(0);
  const [sync, setSync] = useState(getSyncState());
  const [toast, setToast] = useState('');

  useEffect(() => onSyncState(setSync), []);

  useEffect(() => onRemoteData((result) => {
    setDataVersion((v) => v + 1);
    if (result.wasEmpty && result.notesAdded > 0) {
      setToast(`クラウドから${result.notesAdded}件のメモを戻しました`);
    }
  }), []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

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
        ${view === 'home' && html`<${HomeView} jump=${homeJump} onJumpConsumed=${() => setHomeJump(null)} dataVersion=${dataVersion} sync=${sync} />`}
        ${view === 'tags' && html`<${TagsView} onJumpToHome=${jumpToHome} startEditToken=${tagsOpenToken} onStartEditConsumed=${() => setTagsOpenToken(null)} dataVersion=${dataVersion} />`}
        ${view === 'search' && html`<${SearchView} onJumpToHome=${jumpToHome} dataVersion=${dataVersion} />`}
        ${view === 'settings' && html`<${SettingsView} onManageTags=${manageTags} dataVersion=${dataVersion} sync=${sync} />`}
      </div>
      <${BottomNav} active=${view} onChange=${setView} />
      ${toast && html`<div class="toast" role="status" onClick=${() => setToast('')}>${toast}</div>`}
    </div>
  `;
}
