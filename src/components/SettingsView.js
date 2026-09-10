import htm from 'htm';
import React, { useEffect, useRef, useState } from 'react';
import * as db from '../lib/db.js';
import { formatDateHeading } from '../lib/format.js';
import { ConfirmDialog } from './ConfirmDialog.js';
import { lastCloudBackupAt } from '../lib/cloudBackup.js';

const html = htm.bind(React.createElement);
const APP_VERSION = '1.0.0';
const LAST_EXPORT_KEY = 'shikou-memo:lastExportAt';

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function SettingsView({ onManageTags }) {
  const [noteCount, setNoteCount] = useState(0);
  const [firstNoteDate, setFirstNoteDate] = useState(null);
  const [lastExportAt, setLastExportAt] = useState(localStorage.getItem(LAST_EXPORT_KEY));
  const [lastCloudAt] = useState(lastCloudBackupAt());
  const [pendingImportFile, setPendingImportFile] = useState(null);
  const [importError, setImportError] = useState('');
  const fileInputRef = useRef(null);

  async function reloadInfo() {
    const notes = await db.getAllNotes();
    setNoteCount(notes.length);
    if (notes.length > 0) {
      const min = notes.reduce((a, b) => (a.createdAt < b.createdAt ? a : b));
      setFirstNoteDate(min.dateKey);
    } else {
      setFirstNoteDate(null);
    }
  }

  useEffect(() => {
    reloadInfo();
  }, []);

  async function handleExport() {
    const data = await db.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const today = formatDate(new Date());
    a.href = url;
    a.download = `memo-backup-${today}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    const now = new Date().toISOString();
    localStorage.setItem(LAST_EXPORT_KEY, now);
    setLastExportAt(now);
  }

  function handleFileChosen(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setImportError('');
    setPendingImportFile(file);
  }

  async function handleImportConfirmed() {
    try {
      const text = await pendingImportFile.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed.notes) || !Array.isArray(parsed.tags)) {
        throw new Error('invalid format');
      }
      await db.replaceAll({ notes: parsed.notes, tags: parsed.tags });
      setPendingImportFile(null);
      await reloadInfo();
    } catch (err) {
      setImportError('読み込みに失敗しました。ファイルの形式を確認してください。');
      setPendingImportFile(null);
    }
  }

  const daysSinceExport = lastExportAt
    ? Math.floor((Date.now() - new Date(lastExportAt).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return html`
    <div class="settings-view">
      <div class="view-header">
        <div class="view-header__title">設定</div>
      </div>
      <div class="settings-list">
        <button class="settings-row" onClick=${onManageTags}>
          <span>タグを管理</span>
          <span class="settings-row__chevron">›</span>
        </button>

        <button class="settings-row" onClick=${handleExport}>
          <span>データを書き出す</span>
        </button>
        <div class="settings-hint">
          ${lastExportAt
            ? `最終書き出し: ${formatDate(new Date(lastExportAt))}`
            : '一度もバックアップを書き出していません'}
          ${(daysSinceExport === null || daysSinceExport >= 30) &&
          html`<div class="settings-hint--warn">しばらくバックアップを取っていません</div>`}
        </div>

        <div class="settings-hint">
          ${lastCloudAt
            ? `クラウドへの控え: ${formatDate(new Date(lastCloudAt))} (メモを書くたび自動)`
            : 'クラウドへの控えはまだ送られていません'}
        </div>

        <button class="settings-row" onClick=${() => fileInputRef.current.click()}>
          <span>データを読み込む</span>
        </button>
        <input
          ref=${fileInputRef}
          type="file"
          accept="application/json"
          style=${{ display: 'none' }}
          onChange=${handleFileChosen}
        />
        ${importError && html`<div class="settings-hint--warn">${importError}</div>`}

        <div class="settings-row settings-row--static">
          <div class="settings-about">
            <div>思考メモ v${APP_VERSION}</div>
            <div>メモ総数: ${noteCount}件</div>
            <div>最初のメモ: ${firstNoteDate ? formatDateHeading(firstNoteDate) : '-'}</div>
          </div>
        </div>
      </div>
      ${pendingImportFile && html`
        <${ConfirmDialog}
          message="既存のメモとタグをすべて置き換えて、選んだファイルの内容に復元します。よろしいですか？"
          confirmLabel="読み込む"
          danger=${true}
          onCancel=${() => setPendingImportFile(null)}
          onConfirm=${handleImportConfirmed}
        />
      `}
    </div>
  `;
}
