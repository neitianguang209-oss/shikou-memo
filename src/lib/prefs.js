// この端末だけの見た目の好み(クラウドには送らない)

const NOTE_STYLE_KEY = 'shikou-memo:noteStyle';
const STYLES = ['bubble', 'timeline', 'diary'];

export function readNoteStyle() {
  try {
    const v = localStorage.getItem(NOTE_STYLE_KEY);
    return STYLES.includes(v) ? v : 'bubble';
  } catch (e) {
    return 'bubble';
  }
}

export function writeNoteStyle(style) {
  try { localStorage.setItem(NOTE_STYLE_KEY, style); } catch (e) { /* 覚えられなくても今回は切り替わる */ }
}

const ACCENT_KEY = 'shikou-memo:accent';
export const ACCENTS = [
  { key: 'forest', label: '緑', color: '#2C7A53' },
  { key: 'orange', label: 'オレンジ', color: '#B85C0A' },
  { key: 'navy', label: '紺', color: '#3456B8' },
  { key: 'pink', label: 'ピンク', color: '#B84A76' },
  { key: 'mono', label: '黒', color: '#2B2C2A' },
];

export function readAccent() {
  try {
    const v = localStorage.getItem(ACCENT_KEY);
    return ACCENTS.some((a) => a.key === v) ? v : 'forest';
  } catch (e) {
    return 'forest';
  }
}

export function applyAccent(key) {
  document.documentElement.dataset.accent = key;
}

export function writeAccent(key) {
  applyAccent(key);
  try { localStorage.setItem(ACCENT_KEY, key); } catch (e) { /* 覚えられなくても今回は切り替わる */ }
}
