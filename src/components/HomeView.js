import htm from 'htm';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Calendar } from './Calendar.js';
import { InputSheet } from './InputSheet.js';
import { ActionSheet } from './ActionSheet.js';
import { ConfirmDialog } from './ConfirmDialog.js';
import * as db from '../lib/db.js';
import { formatDateHeading, formatTime, todayDateKey, toDateKey } from '../lib/format.js';
import { tagColorVars } from '../lib/tagColors.js';

const html = htm.bind(React.createElement);

function NoteBubble({ note, tags, highlighted, onTap, onLongPress }) {
  const bodyRef = useRef(null);
  const [isClamped, setIsClamped] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const pressTimer = useRef(null);

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    if (!isExpanded) {
      setIsClamped(el.scrollHeight > el.clientHeight + 1);
    }
  }, [note.body, isExpanded]);

  const noteTags = (note.tagIds || [])
    .map((id) => tags.find((t) => t.id === id))
    .filter(Boolean);

  function handleClick() {
    if (!isExpanded && isClamped) {
      setIsExpanded(true);
      return;
    }
    onTap(note);
  }

  function handlePointerDown() {
    pressTimer.current = setTimeout(() => onLongPress(note), 500);
  }
  function clearPress() {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  }

  return html`
    <div class="note-row" id=${`note-${note.id}`}>
      <span class="note-time">${formatTime(note.createdAt)}</span>
      <div class="note-bubble-col">
        <div
          ref=${bodyRef}
          class=${`note-bubble${!isExpanded && isClamped ? ' is-clamped' : ''}${highlighted ? ' is-highlighted' : ''}`}
          onClick=${handleClick}
          onPointerDown=${handlePointerDown}
          onPointerUp=${clearPress}
          onPointerLeave=${clearPress}
        >
          ${note.body}
        </div>
        ${noteTags.length > 0 && html`
          <div class="note-tags">
            ${noteTags.map(
              (t) => html`<span class="tag-chip" key=${t.id} style=${tagColorVars(t.colorKey)}>#${t.name}</span>`
            )}
          </div>
        `}
      </div>
    </div>
  `;
}

export function HomeView({ jump }) {
  const [selectedDateKey, setSelectedDateKey] = useState(todayDateKey());
  const today = useMemo(() => todayDateKey(), []);
  const initialDate = new Date();
  const [calMonth, setCalMonth] = useState({ year: initialDate.getFullYear(), month: initialDate.getMonth() });
  const [notes, setNotes] = useState([]);
  const [tags, setTags] = useState([]);
  const [datesWithNotes, setDatesWithNotes] = useState(new Set());
  const [highlightedId, setHighlightedId] = useState(null);
  const [composer, setComposer] = useState(null); // { mode, dateKey?, note?, initialTagsOpen? }
  const [actionSheetNote, setActionSheetNote] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  async function reloadNotes() {
    const list = await db.getNotesByDateKey(selectedDateKey);
    setNotes(list);
  }

  async function reloadTags() {
    setTags(await db.getAllTags());
  }

  async function reloadDots() {
    setDatesWithNotes(await db.getDateKeysWithNotes());
  }

  useEffect(() => {
    reloadNotes();
  }, [selectedDateKey]);

  useEffect(() => {
    reloadTags();
    reloadDots();
  }, []);

  useEffect(() => {
    if (!jump) return;
    setSelectedDateKey(jump.dateKey);
    setHighlightedId(jump.noteId || null);
  }, [jump && jump.token]);

  useEffect(() => {
    if (!highlightedId) return;
    const el = document.getElementById(`note-${highlightedId}`);
    if (el) el.scrollIntoView({ block: 'center' });
    const timer = setTimeout(() => setHighlightedId(null), 1500);
    return () => clearTimeout(timer);
  }, [highlightedId, notes]);

  function selectDate(dateKey) {
    setSelectedDateKey(dateKey);
    const d = new Date(dateKey);
    setCalMonth({ year: d.getFullYear(), month: d.getMonth() });
  }

  function changeMonth(delta) {
    setCalMonth((prev) => {
      const d = new Date(prev.year, prev.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  function jumpToToday() {
    selectDate(today);
  }

  function openComposer() {
    setComposer({ mode: 'create', dateKey: selectedDateKey });
  }

  function openEdit(note, initialTagsOpen) {
    setComposer({ mode: 'edit', note, initialTagsOpen: !!initialTagsOpen });
  }

  async function handleSaved() {
    await reloadNotes();
    await reloadDots();
  }

  async function handleDeleteConfirmed() {
    await db.deleteNote(deleteTarget.id);
    setDeleteTarget(null);
    await reloadNotes();
    await reloadDots();
  }

  return html`
    <div class="home">
      <div class="home__header">
        <button class="home__date-heading" onClick=${jumpToToday}>
          ${formatDateHeading(selectedDateKey)}
        </button>
        <${Calendar}
          year=${calMonth.year}
          month=${calMonth.month}
          selectedDateKey=${selectedDateKey}
          todayKey=${today}
          datesWithNotes=${datesWithNotes}
          onSelectDate=${selectDate}
          onChangeMonth=${changeMonth}
        />
      </div>
      <div class="home__notes">
        ${notes.map(
          (note) => html`
            <${NoteBubble}
              key=${note.id}
              note=${note}
              tags=${tags}
              highlighted=${highlightedId === note.id}
              onTap=${(n) => openEdit(n, false)}
              onLongPress=${(n) => setActionSheetNote(n)}
            />
          `
        )}
        <button class="fab" onClick=${openComposer} aria-label="メモを追加">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
      ${composer && html`
        <${InputSheet}
          mode=${composer.mode}
          dateKey=${composer.dateKey}
          note=${composer.note}
          initialTagsOpen=${composer.initialTagsOpen}
          allTags=${tags}
          onClose=${() => setComposer(null)}
          onSaved=${handleSaved}
          onTagsChanged=${reloadTags}
        />
      `}
      ${actionSheetNote && html`
        <${ActionSheet}
          onClose=${() => setActionSheetNote(null)}
          actions=${[
            { label: 'タグを編集', onSelect: () => openEdit(actionSheetNote, true) },
            { label: 'メモを編集', onSelect: () => openEdit(actionSheetNote, false) },
            { label: '削除', danger: true, onSelect: () => setDeleteTarget(actionSheetNote) },
          ]}
        />
      `}
      ${deleteTarget && html`
        <${ConfirmDialog}
          message="このメモを削除しますか？"
          confirmLabel="削除"
          danger=${true}
          onCancel=${() => setDeleteTarget(null)}
          onConfirm=${handleDeleteConfirmed}
        />
      `}
    </div>
  `;
}
