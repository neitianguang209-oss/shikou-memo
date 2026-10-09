import htm from 'htm';
import React from 'react';

const html = htm.bind(React.createElement);

// 本文の中の http(s) のURLだけをリンクにする。保存されている本文には手を付けない。
// URLに使える半角の記号だけを拾うので、すぐ後ろの「。」「」」などの日本語の文字は自然に外れる
const URL_RE = /https?:\/\/[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]+/g;
const TRAILING_PUNCT = /[.,;:!?'"]$/;

function trimUrl(url) {
  let u = url;
  for (;;) {
    if (TRAILING_PUNCT.test(u)) { u = u.slice(0, -1); continue; }
    // 「(https://… )」のように、URLの外の閉じ括弧まで拾ったときは外す
    const last = u[u.length - 1];
    if (last === ')' || last === ']') {
      const open = last === ')' ? '(' : '[';
      const opens = u.split(open).length - 1;
      const closes = u.split(last).length - 1;
      if (closes > opens) { u = u.slice(0, -1); continue; }
    }
    return u;
  }
}

// [{ start, end, url }](文字列の位置)
export function findUrls(text) {
  const out = [];
  if (typeof text !== 'string' || !text) return out;
  URL_RE.lastIndex = 0;
  let m;
  while ((m = URL_RE.exec(text))) {
    const url = trimUrl(m[0]);
    if (/^https?:\/\/[A-Za-z0-9]/.test(url)) out.push({ start: m.index, end: m.index + url.length, url });
  }
  return out;
}

// リンクを押したとき、外側のカード(タップで編集・長押しでメニュー・一覧からジャンプ)を動かさない
const stop = (e) => e.stopPropagation();

export function NoteLink({ href, children }) {
  return html`<a
    class="note-link"
    href=${href}
    target="_blank"
    rel="noopener noreferrer"
    onClick=${stop}
    onPointerDown=${stop}
    onContextMenu=${stop}
    onKeyDown=${stop}
  >${children}</a>`;
}

// 本文をそのまま出す代わりに使う。URLが無ければ文字列をそのまま返すので見た目は変わらない
export function LinkedText({ text }) {
  const urls = findUrls(text);
  if (urls.length === 0) return text;
  const parts = [];
  let pos = 0;
  urls.forEach(({ start, end, url }, i) => {
    if (start > pos) parts.push(text.slice(pos, start));
    parts.push(html`<${NoteLink} key=${i} href=${url}>${url}<//>`);
    pos = end;
  });
  if (pos < text.length) parts.push(text.slice(pos));
  return parts;
}

// リンクを中に入れる一覧の行は <button> にできない(button の中の a は押せないブラウザがある)ので、
// div をボタンとして振る舞わせる
export function pressable(onPress) {
  return {
    role: 'button',
    tabIndex: 0,
    onClick: onPress,
    onKeyDown: (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onPress();
      }
    },
  };
}
