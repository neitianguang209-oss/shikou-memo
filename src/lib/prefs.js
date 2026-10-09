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
