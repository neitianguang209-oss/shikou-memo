import htm from 'htm';
import React, { useRef } from 'react';
import { toDateKey } from '../lib/format.js';

const html = htm.bind(React.createElement);
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

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

// year/month: 表示中の月。selectedDateKey: 選択中の日。todayKey: 今日。
// datesWithNotes: Set<dateKey>. onSelectDate(dateKey). onChangeMonth(deltaMonths).
export function Calendar({ year, month, selectedDateKey, todayKey, datesWithNotes, onSelectDate, onChangeMonth }) {
  const dragRef = useRef(null);
  const cells = buildMonthGrid(year, month);

  function handlePointerDown(e) {
    dragRef.current = { x: e.clientX, y: e.clientY };
  }
  function handlePointerUp(e) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    dragRef.current = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      onChangeMonth(dx < 0 ? 1 : -1);
    }
  }

  return html`
    <div
      class="calendar"
      onPointerDown=${handlePointerDown}
      onPointerUp=${handlePointerUp}
    >
      <div class="calendar__weekdays">
        ${WEEKDAYS.map((w) => html`<div class="calendar__weekday" key=${w}>${w}</div>`)}
      </div>
      <div class="calendar__grid">
        ${cells.map((date, i) => {
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
        })}
      </div>
    </div>
  `;
}
