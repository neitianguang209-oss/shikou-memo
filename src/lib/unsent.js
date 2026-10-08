// 送らずに閉じた「書きかけ」を1つだけ覚えておく。次に＋を押したときに戻す。
// アプリが閉じられても残るよう localStorage に置く(本文が空なら消す)。

const KEY = 'shikou-memo:unsent';

export function readUnsent() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || typeof v.body !== 'string' || !v.body.trim()) return null;
    return { body: v.body, tagIds: Array.isArray(v.tagIds) ? v.tagIds.filter((x) => typeof x === 'string') : [] };
  } catch (e) {
    return null;
  }
}

export function writeUnsent(body, tagIds) {
  try {
    if (!body || !body.trim()) {
      localStorage.removeItem(KEY);
      return;
    }
    localStorage.setItem(KEY, JSON.stringify({ body, tagIds: tagIds || [], savedAt: new Date().toISOString() }));
  } catch (e) { /* 覚えられなくても書いた画面は閉じるだけ */ }
}

export function clearUnsent() {
  writeUnsent('', []);
}
