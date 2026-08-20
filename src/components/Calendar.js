import htm from 'htm';
import React, { useRef, useState } from 'react';
import { toDateKey, dateKeyToDate } from '../lib/format.js';

const html = htm.bind(React.createElement);
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const WEEK_SNAP_TRANSITION = 'transform 240ms cubic-bezier(0.22, 1, 0.36, 1)';

function buildMonthGrid(year, month) {
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

// 選択中の日を含む週(日曜始まり)から weekOffset 週分ずれた7セルを返す
function buildWeekGrid(selectedDateKey, weekOffset = 0) {
  const selected = dateKeyToDate(selectedDateKey);
  const weekStart = new Date(selected);
  weekStart.setDate(selected.getDate() - selected.getDay() + weekOffset * 7);
  const cells = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    cells.push(d);
  }
  return cells;
}

function renderCells(cells, { selectedDateKey, todayKey, datesWithNotes, onSelectDate }) {
  return cells.map((date, i) => {
    if (!date) return html`<div class="calendar__cell" key=${`empty-${i}`}></div>`;
    const dateKey = toDateKey(date);
    const isToday = dateKey === todayKey;
    const isSelected = dateKey === selectedDateKey;
    const hasNote = datesWithNotes.has(dateKey);
    const circleClass = [
      'calendar__day-circle',
      isSelected ? 'is-selected' : '',
      !isSelected && isToday ? 'is-today' : '',
    ]
      .filter(Boolean)
      .join(' ');
    return html`
      <button
        class="calendar__cell"
        key=${dateKey}
        onClick=${() => onSelectDate(dateKey)}
      >
        <span class=${circleClass}>${date.getDate()}</span>
        <span class=${`calendar__dot${hasNote ? ' is-visible' : ''}`}></span>
      </button>
    `;
  });
}

// year/month: 表示中の月。selectedDateKey: 選択中の日。todayKey: 今日。
// datesWithNotes: Set<dateKey>。expanded: falseなら選択中の週だけ表示。
// onSelectDate(dateKey). onChangeMonth(deltaMonths)は月表示のスワイプ用。
// onShiftWeek(deltaWeeks)は週表示のスワイプ用。
export function Calendar({ year, month, selectedDateKey, todayKey, datesWithNotes, expanded, onSelectDate, onChangeMonth, onShiftWeek }) {
  const monthDragRef = useRef(null);

  const weekViewportRef = useRef(null);
  const weekDragRef = useRef(null);
  const weekDragXRef = useRef(0);
  const [weekDragX, setWeekDragX] = useState(0);
  const [weekAnimating, setWeekAnimating] = useState(false);
  const pendingShiftRef = useRef(0);

  function setWeekDragXBoth(v) {
    weekDragXRef.current = v;
    setWeekDragX(v);
  }

  function handleMonthPointerDown(e) {
    monthDragRef.current = { x: e.clientX, y: e.clientY };
  }
  function handleMonthPointerUp(e) {
    if (!monthDragRef.current) return;
    const dx = e.clientX - monthDragRef.current.x;
    const dy = e.clientY - monthDragRef.current.y;
    monthDragRef.current = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      onChangeMonth(dx < 0 ? 1 : -1);
    }
  }

  function handleWeekPointerDown(e) {
    if (weekAnimating) return;
    const rect = weekViewportRef.current.getBoundingClientRect();
    weekDragRef.current = { x: e.clientX, y: e.clientY, width: rect.width, dragging: false, horizontal: null };
  }
  function handleWeekPointerMove(e) {
    const drag = weekDragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (drag.horizontal === null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      drag.horizontal = Math.abs(dx) > Math.abs(dy);
      if (!drag.horizontal) {
        weekDragRef.current = null;
        return;
      }
      drag.dragging = true;
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
    }
    if (!drag.dragging) return;
    setWeekDragXBoth(dx);
  }
  function handleWeekPointerUp() {
    const drag = weekDragRef.current;
    weekDragRef.current = null;
    if (!drag || !drag.dragging) return;
    const width = drag.width || 1;
    const threshold = width * 0.22;
    const current = weekDragXRef.current;
    setWeekAnimating(true);
    if (current <= -threshold) {
      pendingShiftRef.current = 1;
      setWeekDragXBoth(-width);
    } else if (current >= threshold) {
      pendingShiftRef.current = -1;
      setWeekDragXBoth(width);
    } else {
      pendingShiftRef.current = 0;
      setWeekDragXBoth(0);
    }
  }
  function handleWeekTransitionEnd(e) {
    if (e.target !== e.currentTarget) return;
    if (!weekAnimating) return;
    const shift = pendingShiftRef.current;
    pendingShiftRef.current = 0;
    setWeekAnimating(false);
    setWeekDragXBoth(0);
    if (shift !== 0) onShiftWeek(shift);
  }

  const weekdaysRow = html`
    <div class="calendar__weekdays">
      ${WEEKDAYS.map((w) => html`<div class="calendar__weekday" key=${w}>${w}</div>`)}
    </div>
  `;

  if (expanded === false) {
    const cellCtx = { selectedDateKey, todayKey, datesWithNotes, onSelectDate };
    const pages = [-1, 0, 1].map((offset) => buildWeekGrid(selectedDateKey, offset));
    const trackStyle = {
      transform: `translateX(calc(-33.3333% + ${weekDragX}px))`,
      transition: weekAnimating ? WEEK_SNAP_TRANSITION : 'none',
    };
    return html`
      <div class="calendar">
        ${weekdaysRow}
        <div
          class="calendar__week-viewport"
          ref=${weekViewportRef}
          onPointerDown=${handleWeekPointerDown}
          onPointerMove=${handleWeekPointerMove}
          onPointerUp=${handleWeekPointerUp}
          onPointerCancel=${handleWeekPointerUp}
        >
          <div
            class="calendar__week-track"
            style=${trackStyle}
            onTransitionEnd=${handleWeekTransitionEnd}
          >
            ${pages.map((cells, i) => html`
              <div class="calendar__week-page" key=${i}>
                <div class="calendar__grid">
                  ${renderCells(cells, cellCtx)}
                </div>
              </div>
            `)}
          </div>
        </div>
      </div>
    `;
  }

  const cells = buildMonthGrid(year, month);
  return html`
    <div
      class="calendar"
      onPointerDown=${handleMonthPointerDown}
      onPointerUp=${handleMonthPointerUp}
    >
      ${weekdaysRow}
      <div class="calendar__grid">
        ${renderCells(cells, { selectedDateKey, todayKey, datesWithNotes, onSelectDate })}
      </div>
    </div>
  `;
}
