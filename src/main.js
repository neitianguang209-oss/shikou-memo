import React from 'react';
import { createRoot } from 'react-dom/client';
import htm from 'htm';
import { App } from './App.js';

const html = htm.bind(React.createElement);

if ('storage' in navigator && 'persist' in navigator.storage) {
  navigator.storage.persist().catch(() => {});
}

const root = createRoot(document.getElementById('root'));
root.render(html`<${App} />`);
