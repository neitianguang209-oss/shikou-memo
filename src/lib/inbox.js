// 読書記録アプリ(neitianguang209-oss.github.io/reading-log-app/)から届く文章の受け取り口。
//
// 届き方は2つある。
// 1. リンク(いまの方式): 読書記録の「日記へ」が、文章をリンクの # 以降に入れて
//    このアプリを開く。開いたらすぐ今日の日付の入力画面を出す。
//    iPhoneのホーム画面に置いたアプリはそれぞれ保存場所が別で、下の 2 では
//    届かなかったため、こちらに切り替えた。# 以降はサーバーに送られない。
// 2. 受け取り箱(以前の方式): localStorage['shikou-memo:inbox']。同じブラウザの中で
//    送られて、まだ確認していない下書きが残っていれば、ホームのバナーから開ける。
//    確認してメモにした時点(または捨てた時点)で箱から消す(消す責任はこちら側)。

const INBOX_KEY = 'shikou-memo:inbox';
const LINK_PREFIX = '#from-reading=';

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

function fromBase64Url(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// リンクで届いた文章を取り出す。無ければ null。
// 一度読んだらアドレス欄と履歴から消す(再読み込みで同じ文章がもう一度開かないように)
export function takeLinkedDraft() {
  const hash = window.location.hash || '';
  if (!hash.startsWith(LINK_PREFIX)) return null;
  try {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  } catch (e) {
    window.location.hash = '';
  }
  try {
    const draft = JSON.parse(fromBase64Url(hash.slice(LINK_PREFIX.length)));
    return isDraft(draft) ? draft : null;
  } catch (e) {
    return null;
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

// メモの本文に入れる形。あとで振り返ったときにどの本か分かるよう、末尾に書名を添える
// (入力画面で消せる)
export function draftBody(draft) {
  const s = (draft && draft.source) || {};
  const where = [];
  if (s.title) where.push(`『${s.title}』`);
  if (s.page) where.push(`p.${s.page}`);
  const text = draft.text.trim();
  return where.length ? `${text}\n\n― ${where.join(' ')}` : text;
}
