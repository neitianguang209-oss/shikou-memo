const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

// 端末ローカル時刻基準の 'YYYY-MM-DD'
export function toDateKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function todayDateKey() {
  return toDateKey(new Date());
}

export function dateKeyToDate(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// '8月20日 (木)'
export function formatDateHeading(dateKey) {
  const date = dateKeyToDate(dateKey);
  return `${date.getMonth() + 1}月${date.getDate()}日 (${WEEKDAYS[date.getDay()]})`;
}

// '8月28日 07:36'
export function formatDateTime(dateKey, isoTime) {
  const date = dateKeyToDate(dateKey);
  const t = new Date(isoTime);
  return `${date.getMonth() + 1}月${date.getDate()}日 ${pad2(t.getHours())}:${pad2(t.getMinutes())}`;
}

// '07:36'
export function formatTime(iso) {
  const t = new Date(iso);
  return `${pad2(t.getHours())}:${pad2(t.getMinutes())}`;
}

export function uuid() {
  return crypto.randomUUID();
}
