import React from 'react';
import { createRoot } from 'react-dom/client';
import htm from 'htm';
import { App } from './App.js';
import { startSync } from './lib/sync.js';

const html = htm.bind(React.createElement);

if ('storage' in navigator && 'persist' in navigator.storage) {
  navigator.storage.persist().catch(() => {});
}

const root = createRoot(document.getElementById('root'));
root.render(html`<${App} />`);

// クラウドとの自動同期(端末のデータが消えていたら、ここで全部戻る)
startSync();
