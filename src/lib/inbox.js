// 読書記録アプリ(neitianguang209-oss.github.io/reading-log-app/)から送られてきた
// 下書きの受け取り口。読書記録もこのアプリも同じ github.io のページなので、
// localStorage を共有できる。サーバーを挟まずに渡せるのはそのため。
//
// 本体の保存先はIndexedDBのまま。ここは「まだ確認していない下書きが置かれる箱」
// としてだけ使い、確認してメモにした時点(または捨てた時点)で箱から消す。
// 読書記録側は追記しかしないので、消す責任はこちら側にある。

const INBOX_KEY = 'shikou-memo:inbox';

function isDraft(x) {
  return (
    x && typeof x === 'object' &&
    typeof x.id === 'string' &&
    typeof x.text === 'string' && x.text.trim() !== ''
  );
}

export function readInbox() {
  try {
    const raw = localStorage.getItem(INBOX_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    const usable = list.filter(isDraft);
    // 形の壊れた下書きは表示もできず消せもしないので、読んだついでに片付ける
    if (usable.length !== list.length) {
      try { localStorage.setItem(INBOX_KEY, JSON.stringify(usable)); } catch (e) { /* 片付けは失敗しても構わない */ }
    }
    return usable;
  } catch (e) {
    // 壊れていても空として扱う(アプリを止めない)
    return [];
  }
}

export function removeFromInbox(id) {
  try {
    const rest = readInbox().filter((d) => d.id !== id);
    localStorage.setItem(INBOX_KEY, JSON.stringify(rest));
  } catch (e) {
    // 消せなくてもアプリは続ける(同じ下書きがもう一度出るだけ)
  }
}

// '『夜と霧』 p.42 の引用' のような、どこから来たかの一行
export function sourceLabel(draft) {
  const s = (draft && draft.source) || {};
  const where = [];
  if (s.title) where.push(`『${s.title}』`);
  if (s.page) where.push(`p.${s.page}`);
  const head = where.join(' ');
  if (head && s.field) return `${head} の${s.field}`;
  return head || s.field || '読書記録から';
}
