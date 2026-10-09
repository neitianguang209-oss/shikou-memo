import htm from 'htm';
import React, { useEffect, useRef, useState } from 'react';
import * as db from '../lib/db.js';
import { formatDateHeading } from '../lib/format.js';
import { ConfirmDialog } from './ConfirmDialog.js';
import { NoteItem, NOTE_STYLES } from './NoteItem.js';
import { syncNow } from '../lib/sync.js';

const html = htm.bind(React.createElement);
const APP_VERSION = '1.4.1';
const LAST_EXPORT_KEY = 'shikou-memo:lastExportAt';
const STALE_MS = 7 * 24 * 60 * 60 * 1000;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// '10月7日 14:03'
function formatStamp(ms) {
  const d = new Date(ms);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// 見せ方の見本(実際のメモには触れない)
const SAMPLE_TAGS = [
  { id: 'sample-tag-1', name: '発見', colorKey: 'coral' },
  { id: 'sample-tag-2', name: '心がけ', colorKey: 'apricot' },
];
function sampleNotes() {
  const d = new Date();
  const at = (h, m) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).toISOString();
  return [
    { id: 'sample-1', body: '朝の散歩で、考えごとは歩きながらの方がまとまると気づいた。', createdAt: at(8, 3), tagIds: ['sample-tag-1'] },
    {
      id: 'sample-2',
      body: '自分が何のために生きるのかを知っていれば、たいていのことは耐えられる。\n\n― 『夜と霧』 p.42',
      createdAt: at(11, 10),
      tagIds: ['sample-tag-2'],
      source: { app: 'reading-log' },
    },
  ];
}

function StylePreview({ style }) {
  const items = sampleNotes().map(
    (n) => html`<${NoteItem} key=${n.id} note=${n} tags=${SAMPLE_TAGS} variant=${style} />`
  );
  return html`
    <div class=${`style-preview home__notes--${style}`} aria-hidden="true">
      ${style === 'timeline'
        ? html`<div class="tl-list">${items}</div>`
        : style === 'diary'
        ? html`<div class="diary-paper">${items}</div>`
        : items}
    </div>
  `;
}

function readLastExport() {
  try { return localStorage.getItem(LAST_EXPORT_KEY); } catch (e) { return null; }
}

function syncStatusText(sync) {
  const waiting = sync.pending > 0 ? `送信待ち ${sync.pending}件` : '';
  switch (sync.phase) {
    case 'syncing':
      return '保存しています…';
    case 'ok':
      return waiting || `保存済み（${formatStamp(sync.lastSyncedAt)}）`;
    case 'offline':
      return `オフラインです${waiting ? `（${waiting}）` : ''}。電波が戻ると自動で送ります`;
    case 'error':
      return `クラウドに届いていません${waiting ? `（${waiting}）` : ''}。自動でやり直します`;
    default:
      return sync.lastSyncedAt ? `最終保存 ${formatStamp(sync.lastSyncedAt)}` : '準備しています…';
  }
}

export function SettingsView({ onManageTags, dataVersion, sync, noteStyle, onChangeNoteStyle }) {
  const [noteCount, setNoteCount] = useState(0);
  const [firstNoteDate, setFirstNoteDate] = useState(null);
  const [lastExportAt, setLastExportAt] = useState(readLastExport());
  const [pendingImportFile, setPendingImportFile] = useState(null);
  const [importMessage, setImportMessage] = useState('');
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
  }, [dataVersion]);

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
    try { localStorage.setItem(LAST_EXPORT_KEY, now); } catch (e) { /* 表示用なので失敗は無視 */ }
    setLastExportAt(now);
  }

  function handleFileChosen(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setImportError('');
    setImportMessage('');
    setPendingImportFile(file);
  }

  async function handleImportConfirmed() {
    const file = pendingImportFile;
    setPendingImportFile(null);
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || !Array.isArray(parsed.notes)) {
        throw new Error('invalid format');
      }
      const r = await db.importMerge({ notes: parsed.notes, tags: Array.isArray(parsed.tags) ? parsed.tags : [] });
      const parts = [];
      if (r.added > 0) parts.push(`${r.added}件を足しました`);
      if (r.updated > 0) parts.push(`${r.updated}件を新しい内容にしました`);
      setImportMessage(parts.length > 0 ? parts.join('・') : 'このファイルのメモはすべて入っています');
      await reloadInfo();
    } catch (err) {
      setImportError('読み込めませんでした。思考メモで書き出したファイルか確かめてください。');
    }
  }

  const stale = sync.phase !== 'ok' && sync.phase !== 'syncing' &&
    (!sync.lastSyncedAt || Date.now() - sync.lastSyncedAt > STALE_MS) && noteCount > 0;

  return html`
    <div class="settings-view">
      <div class="view-header">
        <div class="view-header__title">設定</div>
      </div>
      <div class="settings-list">
        <div class="settings-card">
          <div class="settings-card__title">メモの見せ方</div>
          <div class="segmented" role="radiogroup" aria-label="メモの見せ方">
            ${NOTE_STYLES.map(
              (s) => html`
                <button
                  key=${s.key}
                  role="radio"
                  aria-checked=${noteStyle === s.key}
                  class=${`segmented__item${noteStyle === s.key ? ' is-active' : ''}`}
                  onClick=${() => onChangeNoteStyle && onChangeNoteStyle(s.key)}
                >
                  ${s.label}
                </button>
              `
            )}
          </div>
          <${StylePreview} style=${noteStyle || 'bubble'} />
        </div>
        <div class="settings-hint">ホームのメモ一覧の見た目です。この端末だけで切り替わります。</div>

        <button class="settings-row" onClick=${onManageTags}>
          <span>タグを管理</span>
          <span class="settings-row__chevron">›</span>
        </button>

        <div class="settings-row settings-row--static settings-row--sync">
          <span>クラウドに自動保存</span>
          <button class="settings-row__link" onClick=${() => syncNow()} disabled=${sync.phase === 'syncing'}>
            今すぐ同期
          </button>
        </div>
        <div class="settings-hint">
          <div class="settings-status">
            <span class=${`settings-status__dot${sync.phase === 'ok' && sync.pending === 0 ? ' is-ok' : ''}`}></span>
            <span>${syncStatusText(sync)}</span>
          </div>
          <div>書いたメモはクラウドにも自動で保存され、この端末のデータが消えても開けば自動で戻ります。</div>
          ${sync.live && html`<div>ほかの端末で書いたメモも、開いているあいだはすぐこちらに届きます。</div>`}
          ${sync.memoryOnly && html`
            <div class="settings-hint--warn">この端末の保存場所が開けないため、いまはクラウドだけに保存しています。アプリを開き直すと直ることがあります。</div>
          `}
          ${stale && html`
            <div class="settings-hint--warn">しばらくクラウドに届いていません。電波のある所で開いてください。</div>
          `}
        </div>

        <button class="settings-row" onClick=${handleExport}>
          <span>データを書き出す</span>
        </button>
        <div class="settings-hint">
          ${lastExportAt
            ? `最終書き出し: ${formatDate(new Date(lastExportAt))}（手元にファイルで控えたいとき用）`
            : '手元にファイルで控えたいとき用（クラウドへの保存は自動です）'}
        </div>

        <button class="settings-row" onClick=${() => fileInputRef.current.click()}>
          <span>データを読み込む</span>
        </button>
        <input
          ref=${fileInputRef}
          type="file"
          accept="application/json,.json"
          style=${{ display: 'none' }}
          onChange=${handleFileChosen}
        />
        <div class="settings-hint">
          書き出したファイルのメモを今のメモに足します（今のメモは消えません）
          ${importMessage && html`<div class="settings-hint--warn">${importMessage}</div>`}
          ${importError && html`<div class="settings-hint--warn">${importError}</div>`}
        </div>

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
          message="選んだファイルのメモを、今のメモに足します。今のメモは消えません。同じメモがあれば新しい方を残します。"
          confirmLabel="読み込む"
          onCancel=${() => setPendingImportFile(null)}
          onConfirm=${handleImportConfirmed}
        />
      `}
    </div>
  `;
}
