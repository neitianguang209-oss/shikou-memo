import htm from 'htm';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Calendar } from './Calendar.js';
import { InputSheet } from './InputSheet.js';
import { ActionSheet } from './ActionSheet.js';
import { ConfirmDialog } from './ConfirmDialog.js';
import * as db from '../lib/db.js';
import { formatDateHeading, formatTime, todayDateKey, toDateKey, dateKeyToDate } from '../lib/format.js';
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

export function HomeView({ jump, onJumpConsumed }) {
  const [selectedDateKey, setSelectedDateKey] = useState(todayDateKey());
  const today = useMemo(() => todayDateKey(), []);
  const initialDate = new Date();
  const [calMonth, setCalMonth] = useState({ year: initialDate.getFullYear(), month: initialDate.getMonth() });
  const [calendarExpanded, setCalendarExpanded] = useState(true);
  const [notes, setNotes] = useState([]);
  const [tags, setTags] = useState([]);
  const [datesWithNotes, setDatesWithNotes] = useState(new Set());
  const [highlightedId, setHighlightedId] = useState(null);
  const [composer, setComposer] = useState(null); // { mode, dateKey?, note?, initialTagsOpen? }
  const [actionSheetNote, setActionSheetNote] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const notesDragRef = useRef(null);

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
    // 消費したら親側のjumpをクリアする。しないと、タグ/検索から一度ジャンプした後は
    // ホームタブを行き来するたびに同じ日付へ再ジャンプし続けてしまう
    onJumpConsumed && onJumpConsumed();
  }, [jump && jump.token]);

  // 選択中の日付が変わったら、カレンダーに表示する月もそれに追従させる
  useEffect(() => {
    const d = dateKeyToDate(selectedDateKey);
    setCalMonth({ year: d.getFullYear(), month: d.getMonth() });
  }, [selectedDateKey]);

  useEffect(() => {
    if (!highlightedId) return;
    const el = document.getElementById(`note-${highlightedId}`);
    if (el) el.scrollIntoView({ block: 'center' });
    const timer = setTimeout(() => setHighlightedId(null), 1500);
    return () => clearTimeout(timer);
  }, [highlightedId, notes]);

  function selectDate(dateKey) {
    setSelectedDateKey(dateKey);
  }

  // カレンダー(白い部分)を左右スワイプ: 月を移動し、選択中の日付も同じ日番号のまま移動する
  function changeMonth(delta) {
    setSelectedDateKey((prevKey) => {
      const prevDate = dateKeyToDate(prevKey);
      const day = prevDate.getDate();
      const target = new Date(prevDate.getFullYear(), prevDate.getMonth() + delta, 1);
      const daysInTargetMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
      target.setDate(Math.min(day, daysInTargetMonth));
      return toDateKey(target);
    });
  }

  // カレンダー(週表示/折りたたみ時)を左右スワイプ: 1週間分だけ前後にずらす
  function shiftWeek(delta) {
    setSelectedDateKey((prevKey) => {
      const d = dateKeyToDate(prevKey);
      d.setDate(d.getDate() + delta * 7);
      return toDateKey(d);
    });
  }

  // メモ一覧(グレーの部分)を左右スワイプ: 1日だけ前後にずらす
  function shiftDay(delta) {
    setSelectedDateKey((prevKey) => {
      const d = dateKeyToDate(prevKey);
      d.setDate(d.getDate() + delta);
      return toDateKey(d);
    });
  }

  function handleNotesPointerDown(e) {
    notesDragRef.current = { x: e.clientX, y: e.clientY };
  }
  function handleNotesPointerUp(e) {
    if (!notesDragRef.current) return;
    const dx = e.clientX - notesDragRef.current.x;
    const dy = e.clientY - notesDragRef.current.y;
    notesDragRef.current = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
      shiftDay(dx < 0 ? 1 : -1);
    }
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
        <div class="home__header-row">
          <button class="home__date-heading" onClick=${jumpToToday}>
            ${formatDateHeading(selectedDateKey)}
          </button>
          <button
            class="home__calendar-toggle"
            onClick=${() => setCalendarExpanded((v) => !v)}
            aria-label=${calendarExpanded ? 'カレンダーを縮小' : 'カレンダーを拡大'}
          >
            ${calendarExpanded
              ? html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 15 12 9 18 15" /></svg>`
              : html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9" /></svg>`}
          </button>
        </div>
        <${Calendar}
          year=${calMonth.year}
          month=${calMonth.month}
          selectedDateKey=${selectedDateKey}
          todayKey=${today}
          datesWithNotes=${datesWithNotes}
          expanded=${calendarExpanded}
          onSelectDate=${selectDate}
          onChangeMonth=${changeMonth}
          onShiftWeek=${shiftWeek}
        />
      </div>
      <div
        class="home__notes"
        onPointerDown=${handleNotesPointerDown}
        onPointerUp=${handleNotesPointerUp}
      >
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
