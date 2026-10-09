import htm from 'htm';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar } from './Calendar.js';
import { InputSheet, readTagsOpenPref } from './InputSheet.js';
import { NoteItem } from './NoteItem.js';
import { ActionSheet } from './ActionSheet.js';
import { ConfirmDialog } from './ConfirmDialog.js';
import * as db from '../lib/db.js';
import { readInbox, addToInbox, removeFromInbox, sourceLabel, draftBody } from '../lib/inbox.js';
import { readUnsent, writeUnsent, clearUnsent } from '../lib/unsent.js';
import { getSyncState, syncNow } from '../lib/sync.js';
import { formatDateHeading, todayDateKey, toDateKey, dateKeyToDate } from '../lib/format.js';

const html = htm.bind(React.createElement);
// 上に残る「週の帯」の高さ(測れないときの目安。この分だけ月のカレンダーが隠れたら帯を出す)
const MINI_BAR_HEIGHT = 104;

const CHEVRON_UP = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 15 12 9 18 15" /></svg>`;
const CHEVRON_DOWN = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>`;

function syncWaitingText(sync) {
  if (!sync || sync.pending === 0) return '';
  if (sync.phase === 'offline') return `未送信 ${sync.pending}件 · 電波が戻ったら自動で送ります`;
  if (sync.phase === 'error') return `未送信 ${sync.pending}件 · 自動でやり直しています`;
  return '';
}

export function HomeView({ jump, onJumpConsumed, incomingDraft, onIncomingConsumed, onToast, dataVersion, sync, noteStyle }) {
  const [selectedDateKey, setSelectedDateKey] = useState(todayDateKey());
  const [today, setToday] = useState(todayDateKey());
  const initialDate = new Date();
  const [calMonth, setCalMonth] = useState({ year: initialDate.getFullYear(), month: initialDate.getMonth() });
  const [calendarExpanded, setCalendarExpanded] = useState(true);
  const [notes, setNotes] = useState([]);
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [tags, setTags] = useState([]);
  // 日付 → その日のメモの先頭タグ(書いた順。タグなしは null)。カレンダーの色の点に使う
  const [dayTagIds, setDayTagIds] = useState(new Map());
  const [dotsLoaded, setDotsLoaded] = useState(false);
  const [highlightedId, setHighlightedId] = useState(null);
  const [composer, setComposer] = useState(null); // { mode, dateKey?, note?, initialTagsOpen?, draftId?, draftVia? ... }
  const [actionSheetNote, setActionSheetNote] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  // 読書メモから届いて、まだ確認していない下書き
  const [drafts, setDrafts] = useState([]);
  // 月のカレンダーが上に流れて見えなくなったら、週の帯を上に出す
  const [compact, setCompact] = useState(false);
  // メモが少ない日でも、週の帯の位置までスクロールできるだけの高さをメモ欄に持たせる
  const [notesMinHeight, setNotesMinHeight] = useState(0);
  const notesDragRef = useRef(null);
  const composerRef = useRef(null);
  composerRef.current = composer;
  const selectedRef = useRef(selectedDateKey);
  selectedRef.current = selectedDateKey;
  const headerRef = useRef(null);
  const compactRef = useRef(false);
  const miniBarRef = useRef(null);
  compactRef.current = compact;

  function miniHeight() {
    return (miniBarRef.current && miniBarRef.current.offsetHeight) || MINI_BAR_HEIGHT;
  }

  async function reloadNotes() {
    const list = await db.getNotesByDateKey(selectedDateKey);
    setNotes(list);
    setNotesLoaded(true);
  }

  async function reloadTags() {
    setTags(await db.getAllTags());
  }

  async function reloadDots() {
    const all = await db.getAllNotes();
    all.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    const map = new Map();
    for (const n of all) {
      const list = map.get(n.dateKey) || [];
      list.push((n.tagIds && n.tagIds[0]) || null);
      map.set(n.dateKey, list);
    }
    setDayTagIds(map);
    setDotsLoaded(true);
  }

  // 日付 → 点の色(重ならないように最大3つ)
  const dayDots = useMemo(() => {
    const colorOf = new Map(tags.map((t) => [t.id, t.colorKey]));
    const out = new Map();
    for (const [key, ids] of dayTagIds) {
      const colors = [];
      for (const id of ids) {
        const c = (id && colorOf.get(id)) || null;
        if (!colors.includes(c)) colors.push(c);
        if (colors.length >= 3) break;
      }
      out.set(key, colors);
    }
    return out;
  }, [dayTagIds, tags]);

  // dataVersion はクラウドから別の端末の変更や復元が届いたときに増える
  useEffect(() => {
    reloadNotes();
  }, [selectedDateKey, dataVersion]);

  useEffect(() => {
    reloadTags();
    reloadDots();
  }, [dataVersion]);

  // 読書メモで「日記へ」を押してからこちらに戻ってくる使い方なので、
  // 起動時だけでなく画面が表に戻るたびに受け取り箱を見に行く。
  // あわせて、開きっぱなしで日付が変わっていたら「今日」を進める
  useEffect(() => {
    function refreshOnReturn() {
      if (document.visibilityState === 'hidden') return;
      setDrafts(readInbox());
      const nowKey = todayDateKey();
      setToday((prev) => {
        if (prev !== nowKey && selectedRef.current === prev) setSelectedDateKey(nowKey);
        return nowKey;
      });
    }
    refreshOnReturn();
    document.addEventListener('visibilitychange', refreshOnReturn);
    window.addEventListener('focus', refreshOnReturn);
    return () => {
      document.removeEventListener('visibilitychange', refreshOnReturn);
      window.removeEventListener('focus', refreshOnReturn);
    };
  }, []);

  // スクロールに合わせて、週の帯を出し入れする
  useEffect(() => {
    const scroller = document.querySelector('.app-body');
    if (!scroller) return;
    let frame = 0;
    function check() {
      frame = 0;
      const header = headerRef.current;
      if (!header) return;
      const bottom = header.getBoundingClientRect().bottom - scroller.getBoundingClientRect().top;
      setCompact(bottom < miniHeight());
      setNotesMinHeight(Math.max(0, scroller.clientHeight - miniHeight() + 12));
    }
    function onScroll() {
      if (!frame) frame = requestAnimationFrame(check);
    }
    scroller.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    check();
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // 週の帯が出ているときに日付を変えたら、その日のメモの頭から見せる
  useEffect(() => {
    if (!compactRef.current) return;
    const scroller = document.querySelector('.app-body');
    const header = headerRef.current;
    if (!scroller || !header) return;
    scroller.scrollTop = Math.max(0, header.offsetHeight - miniHeight() + 8);
  }, [selectedDateKey]);

  useEffect(() => {
    if (!jump) return;
    setSelectedDateKey(jump.dateKey);
    setHighlightedId(jump.noteId || null);
    // 消費したら親側のjumpをクリアする。しないと、タグ/検索から一度ジャンプした後は
    // ホームタブを行き来するたびに同じ日付へ再ジャンプし続けてしまう
    onJumpConsumed && onJumpConsumed();
  }, [jump && jump.token]);

  // 読書メモの「日記へ」から開かれたら、すぐ今日の入力画面を出す。
  // 書いている途中なら書きかけを潰さないよう、上のお知らせに置いておく
  useEffect(() => {
    if (!incomingDraft) return;
    onIncomingConsumed && onIncomingConsumed();
    if (composerRef.current) {
      addToInbox(incomingDraft);
      setDrafts(readInbox());
      onToast && onToast('読書メモから届きました。書き終えたら上のお知らせから開けます');
      return;
    }
    openDraft(incomingDraft, 'link');
  }, [incomingDraft]);

  // 選択中の日付が変わったら、カレンダーに表示する月もそれに追従させる
  useEffect(() => {
    const d = dateKeyToDate(selectedDateKey);
    setCalMonth({ year: d.getFullYear(), month: d.getMonth() });
  }, [selectedDateKey]);

  useEffect(() => {
    if (!highlightedId) return;
    const el = document.getElementById(`note-${highlightedId}`);
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const timer = setTimeout(() => setHighlightedId(null), 1800);
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

  // メモ一覧(地色の部分)を左右スワイプ: 1日だけ前後にずらす
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
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      shiftDay(dx < 0 ? 1 : -1);
    }
  }

  function jumpToToday() {
    selectDate(todayDateKey());
  }

  function scrollToTop() {
    const scroller = document.querySelector('.app-body');
    if (scroller) scroller.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openComposer() {
    const unsent = readUnsent();
    setComposer({
      mode: 'create',
      dateKey: selectedDateKey,
      initialBody: unsent ? unsent.body : '',
      initialTagIds: unsent ? unsent.tagIds.filter((id) => tags.some((t) => t.id === id)) : [],
      initialTagsOpen: readTagsOpenPref(),
      notice: unsent ? '書きかけを戻しました' : '',
    });
  }

  function openEdit(note, initialTagsOpen) {
    setComposer({ mode: 'edit', note, initialTagsOpen: !!initialTagsOpen });
  }

  // 読書メモから届いた文章を、いつもの入力画面で今日のメモとして開く。
  // タグ(心がけ・知識など)はここで選んでもらうので、最初から並べておく。
  // via: 'link'(いま「日記へ」で開かれた) | 'inbox'(上のお知らせから開いた)
  function openDraft(draft, via) {
    const todayKey = todayDateKey();
    const s = draft.source || {};
    setSelectedDateKey(todayKey);
    setComposer({
      mode: 'create',
      dateKey: todayKey,
      draft,
      draftId: draft.id,
      draftVia: via,
      initialBody: draftBody(draft),
      initialTagIds: [],
      initialTagsOpen: true,
      sourceLabel: sourceLabel(draft),
      submitLabel: '日記に入れる',
      // 保存したメモに「読書メモから」の印として残す
      noteExtra: {
        source: {
          app: 'reading-log',
          bookId: s.bookId || null,
          title: s.title || '',
          author: s.author || '',
          page: s.page || '',
          field: s.field || '',
        },
      },
    });
  }

  // 送らずに閉じたとき。ふつうの新規メモは「書きかけ」として覚え、次に＋で戻す。
  // 読書メモから届いた文章は、直した中身ごと上のお知らせに置いておく(書きかけとは混ぜない)
  function handleUnsent(body, tagIds) {
    const c = composerRef.current;
    if (!c || c.mode !== 'create') return;
    if (c.draft) {
      if (body.trim()) {
        addToInbox({ ...c.draft, editedBody: body });
        setDrafts(readInbox());
      }
      return;
    }
    writeUnsent(body, tagIds);
  }

  // 読書メモから開かれたときは、この画面をすぐ閉じられても残るよう、その場でクラウドへ送る
  async function sendDraftNow(noteId) {
    onToast && onToast('日記に入れました。クラウドへ送っています…');
    // このメモがまだ「送る箱」に残っているか(ほかの未送信分とは分けて見る)
    async function stillWaiting() {
      try {
        const box = await db.getOutbox();
        return box.some((c) => c.id === noteId);
      } catch (e) {
        return getSyncState().pending > 0;
      }
    }
    await syncNow();
    let waiting = await stillWaiting();
    // 別の同期の終わりぎわに書いた場合は、まだ送れていないのでもう一度
    if (waiting && getSyncState().phase === 'ok') {
      await syncNow();
      waiting = await stillWaiting();
    }
    if (!onToast) return;
    onToast(waiting ? '日記に入れました。電波が戻ったら自動で送ります' : '✓ 日記に入れました');
  }

  function discardDraft(draftId) {
    removeFromInbox(draftId);
    setDrafts(readInbox());
    setComposer(null);
  }

  async function handleSaved(savedNote) {
    const c = composerRef.current;
    // 下書きから作ったメモなら、受け取り箱から消して、その日付へ移動して見せる
    if (c && c.draftId) {
      removeFromInbox(c.draftId);
      setDrafts(readInbox());
      if (savedNote) {
        setSelectedDateKey(savedNote.dateKey);
        setHighlightedId(savedNote.id);
        sendDraftNow(savedNote.id);
      }
    } else if (c && c.mode === 'create') {
      clearUnsent();
    }
    await reloadNotes();
    await reloadDots();
  }

  async function copyNote(note) {
    try {
      await navigator.clipboard.writeText(note.body);
      onToast && onToast('コピーしました');
    } catch (e) {
      onToast && onToast('コピーできませんでした');
    }
  }

  async function handleDeleteConfirmed() {
    await db.deleteNote(deleteTarget.id);
    setDeleteTarget(null);
    await reloadNotes();
    await reloadDots();
  }

  const isToday = selectedDateKey === today;
  const waiting = syncWaitingText(sync);
  const showFirstSync = dotsLoaded && dayTagIds.size === 0 && sync && !sync.everSynced;
  const showEmpty = notesLoaded && notes.length === 0 && !showFirstSync;
  const variant = noteStyle || 'bubble';

  const items = notes.map(
    (note) => html`
      <${NoteItem}
        key=${note.id}
        note=${note}
        tags=${tags}
        variant=${variant}
        highlighted=${highlightedId === note.id}
        onTap=${(n) => openEdit(n, false)}
        onLongPress=${(n) => setActionSheetNote(n)}
      />
    `
  );

  return html`
    <div class="home">
      <div class="home__mini" aria-hidden=${!compact}>
        <div class=${`home__mini-bar${compact ? ' is-visible' : ''}`} ref=${miniBarRef}>
          <div class="home__mini-row">
            <button class="home__mini-date" onClick=${scrollToTop} tabIndex=${compact ? 0 : -1}>
              ${formatDateHeading(selectedDateKey)}
            </button>
            ${!isToday && html`<button class="home__today-btn" onClick=${jumpToToday} tabIndex=${compact ? 0 : -1}>今日</button>`}
            <button class="home__calendar-toggle" onClick=${scrollToTop} aria-label="月のカレンダーを出す" tabIndex=${compact ? 0 : -1}>
              ${CHEVRON_DOWN}
            </button>
          </div>
          <${Calendar}
            year=${calMonth.year}
            month=${calMonth.month}
            selectedDateKey=${selectedDateKey}
            todayKey=${today}
            dayDots=${dayDots}
            expanded=${false}
            onSelectDate=${selectDate}
            onChangeMonth=${changeMonth}
            onShiftWeek=${shiftWeek}
          />
        </div>
      </div>
      <div class="home__header" ref=${headerRef}>
        <div class="home__header-row">
          <button class="home__date-heading" onClick=${jumpToToday} aria-label="今日へ移動">
            ${formatDateHeading(selectedDateKey)}
          </button>
          ${!isToday && html`<button class="home__today-btn" onClick=${jumpToToday}>今日</button>`}
          <button
            class="home__calendar-toggle"
            onClick=${() => setCalendarExpanded((v) => !v)}
            aria-label=${calendarExpanded ? 'カレンダーを週だけにする' : 'カレンダーを月で表示'}
          >
            ${calendarExpanded ? CHEVRON_UP : CHEVRON_DOWN}
          </button>
        </div>
        <${Calendar}
          year=${calMonth.year}
          month=${calMonth.month}
          selectedDateKey=${selectedDateKey}
          todayKey=${today}
          dayDots=${dayDots}
          expanded=${calendarExpanded}
          onSelectDate=${selectDate}
          onChangeMonth=${changeMonth}
          onShiftWeek=${shiftWeek}
        />
      </div>
      <div
        class=${`home__notes home__notes--${variant}`}
        style=${notesMinHeight ? { minHeight: `${notesMinHeight}px` } : null}
        onPointerDown=${handleNotesPointerDown}
        onPointerUp=${handleNotesPointerUp}
      >
        ${showFirstSync && html`
          <div class="sync-banner" role="status">
            ${sync.phase === 'offline' || sync.phase === 'error'
              ? html`
                  <span>まだクラウドのメモを読み込めていません。電波のある所で開くと自動で戻ります。</span>
                  <button class="sync-banner__retry" onClick=${() => syncNow()}>もう一度</button>
                `
              : html`<span>クラウドからメモを読み込んでいます…</span>`}
          </div>
        `}
        ${waiting && html`<div class="sync-pill" role="status">${waiting}</div>`}
        ${drafts.length > 0 && html`
          <button class="inbox-banner" onClick=${() => openDraft(drafts[0], 'inbox')}>
            <span class="inbox-banner__count">${drafts.length}</span>
            <span class="inbox-banner__text">読書メモから届いています</span>
            <span class="inbox-banner__chevron" aria-hidden="true">›</span>
          </button>
        `}
        ${showEmpty && html`
          <div class="home__empty">
            <div>${isToday ? 'まだ今日のメモはありません' : 'この日のメモはありません'}</div>
            <div class="home__empty-sub">＋ から書けます</div>
          </div>
        `}
        ${notes.length > 0 && (variant === 'timeline'
          ? html`<div class="tl-list">${items}</div>`
          : variant === 'diary'
          ? html`<div class="diary-paper">${items}</div>`
          : items)}
        <button class="fab" onClick=${openComposer} aria-label="メモを追加">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
      ${composer && html`
        <${InputSheet}
          key=${composer.draftId || composer.mode + (composer.note ? composer.note.id : '')}
          mode=${composer.mode}
          dateKey=${composer.dateKey}
          note=${composer.note}
          initialTagsOpen=${composer.initialTagsOpen}
          initialBody=${composer.initialBody}
          initialTagIds=${composer.initialTagIds}
          sourceLabel=${composer.sourceLabel}
          notice=${composer.notice}
          submitLabel=${composer.submitLabel}
          noteExtra=${composer.noteExtra}
          closeAfterSend=${!!composer.draftId}
          onDiscard=${composer.draftId ? () => discardDraft(composer.draftId) : null}
          onUnsent=${handleUnsent}
          allTags=${tags}
          tagsLoading=${tags.length === 0 && !!sync && (sync.phase === 'syncing' || (sync.phase === 'idle' && !sync.everSynced))}
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
            { label: 'コピー', onSelect: () => copyNote(actionSheetNote) },
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
