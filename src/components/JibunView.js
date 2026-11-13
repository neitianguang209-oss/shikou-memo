import htm from 'htm';
import React, { useEffect, useRef, useState } from 'react';
import {
  THEMES, themeColorKey, readKey, writeKey, readCache, writeCache,
  loadAll, addQuestion, updateQuestion, claudePrompt, claudeResumePrompt, chatgptPrompt, shortDate,
  parseRecord, hasRecord, importTalk, readPending, writePending,
  profileOf, gapsOf, profileText, GAP_QUESTIONS, SHUKATSU_MODES, shukatsuPrompt,
} from '../lib/jibun.js';
import { tagColorVars } from '../lib/tagColors.js';

const html = htm.bind(React.createElement);

const SECTIONS = [
  { key: 'questions', label: '問い' },
  { key: 'profile', label: 'じぶん像' },
  { key: 'insights', label: '気づき' },
  { key: 'talks', label: '記録' },
];

const KIND_ORDER = ['一言の自分', '価値観', '幸福観', '強み', '弱み', '動き方のクセ', '感情のクセ', 'やりたいこと', '避けたいこと', '企業選びの軸', '働き方の条件', 'キャリア仮説', '恋愛観', '人との関わり方', '問い'];

function ThemeDot({ theme }) {
  return html`<span class="jibun-dot" style=${tagColorVars(themeColorKey(theme))}></span>`;
}

function ThemeChips({ value, onChange, withAll }) {
  const names = [...(withAll ? ['すべて'] : []), ...THEMES.map((t) => t.name)];
  return html`
    <div class=${`jibun-chips${withAll ? '' : ' jibun-chips--wrap'}`}>
      ${names.map((n) => html`
        <button
          key=${n}
          type="button"
          class=${`jibun-chip${value === n ? ' is-active' : ''}`}
          onClick=${() => onChange(n)}
        >
          ${n !== 'すべて' && html`<${ThemeDot} theme=${n} />`}${n}
        </button>
      `)}
    </div>
  `;
}

function KeyScreen({ message, onSubmit }) {
  const [value, setValue] = useState('');
  return html`
    <div class="jibun-card">
      <p class="jibun-key__msg">${message || '自分を知るトークの問いと気づきは、合言葉で守っています。この端末で初めて開くときだけ、合言葉を入れてください。'}</p>
      <input
        class="modal-card__input jibun-key__input"
        type="password"
        placeholder="合言葉"
        autocomplete="off"
        value=${value}
        onInput=${(e) => setValue(e.target.value)}
        onKeyDown=${(e) => { if (e.key === 'Enter' && value.trim()) onSubmit(value.trim()); }}
      />
      <div class="jibun-row jibun-row--end">
        <button class="jibun-btn" disabled=${!value.trim()} onClick=${() => onSubmit(value.trim())}>開く</button>
      </div>
      <p class="jibun-hint">合言葉は、パソコンのClaudeに「じぶんノートのリンクちょうだい」と言えばもらえます。</p>
    </div>
  `;
}

function QuestionItem({ q, onOpen, last }) {
  const meta = [
    q.theme,
    q.times_talked ? `${q.times_talked}回話した` : 'まだ話していない',
    q.last_talked ? `最後 ${shortDate(q.last_talked)}` : '',
    q.source === '前のトークの宿題' ? '前のトークの宿題' : q.source === 'トーク' || q.source === 'ChatGPT' ? '話から生まれた問い' : '',
  ].filter(Boolean).join(' ・ ');
  return html`
    <button class="jibun-q" onClick=${() => onOpen(q)}>
      <span class="jibun-q__bar" style=${tagColorVars(themeColorKey(q.theme))}></span>
      <span class="jibun-q__main">
        <span class="jibun-q__text">${q.status === '決着' && html`<span class="jibun-q__done">✓ </span>`}${q.pinned && html`<span class="jibun-q__pin">★ </span>`}${q.question}</span>
        ${last && last.headline && html`<span class="jibun-q__answer">→ ${last.headline}</span>`}
        <span class="jibun-meta">${meta}</span>
      </span>
    </button>
  `;
}

// ChatGPTで話しに行ったあと、戻ってきたら出る帯
function PendingBanner({ pending, onImport, onDismiss }) {
  return html`
    <div class="jibun-card jibun-pending">
      <div class="jibun-pending__title">ChatGPTで話し中</div>
      <div class="jibun-pending__q">${pending.question || '(問い)'}</div>
      <p class="jibun-hint">① ChatGPTに頼み文を貼って送る(コピー済み) ② 話し終わったら「バイバイ」 ③ 出てきた記録をコピーして、下のボタン。Claudeで話したのと同じように気づき・記録に入り、続きはどちらでも話せます。</p>
      <div class="jibun-row">
        <button class="jibun-btn" onClick=${onImport}>記録を取りこむ</button>
        <button class="jibun-btn jibun-btn--plain" onClick=${onDismiss}>話さなかった</button>
      </div>
    </div>
  `;
}

function Questions({ data, inFilter, onOpen, onTalk, onChatgpt, onCopy, onUnpick, onResume, onResumeChatgpt, pending, onImport, onDismissPending }) {
  const today = data.questions.find((q) => q.status === '今日');
  // 途中で切り上げた話(新しい順)。その問いは下の一覧には出さない
  const qById = Object.fromEntries(data.questions.map((q) => [q.id, q]));
  const paused = data.talks
    .filter((t) => t.status === '途中' && inFilter(t.theme))
    .map((t) => ({ ...t, question: qById[t.question_id]?.question || '' }));
  const pausedIds = new Set(paused.map((t) => t.question_id).filter(Boolean));
  const open = data.questions.filter((q) => q.status !== '今日' && q.status !== '決着' && !pausedIds.has(q.id) && inFilter(q.theme));
  // まだ話していない問いが上(★→新しい順)。話した問いは下に沈め、最近話したものほど下へ
  const fresh = open.filter((q) => !q.times_talked);
  const talked = open.filter((q) => q.times_talked)
    .sort((a, b) => (a.last_talked || '').localeCompare(b.last_talked || ''));
  const done = data.questions.filter((q) => q.status === '決着' && inFilter(q.theme));
  // 問いごとの、いちばん新しい「今日の一言」(話した問いの答えとして見せる)
  const lastByQ = {};
  data.talks.forEach((t) => { if (t.question_id && t.status === '完了' && !lastByQ[t.question_id]) lastByQ[t.question_id] = t; });
  return html`
    ${pending && html`<${PendingBanner} pending=${pending} onImport=${onImport} onDismiss=${onDismissPending} />`}
    ${today ? html`
      <div class="jibun-card jibun-today">
        <div class="jibun-today__label"><${ThemeDot} theme=${today.theme} />今日の問い ・ ${today.theme}</div>
        <div class="jibun-today__q">${today.question}</div>
        <div class="jibun-row">
          <button class="jibun-btn" onClick=${() => onTalk(today)}>Claudeと話す</button>
          <button class="jibun-btn jibun-btn--ghost" onClick=${() => onChatgpt({ q: today })}>ChatGPTで話す</button>
          <button class="jibun-btn jibun-btn--plain" onClick=${() => onCopy(today)}>文をコピー</button>
          <button class="jibun-btn jibun-btn--plain" onClick=${() => onUnpick(today)}>やめる</button>
        </div>
        <p class="jibun-hint">Claudeのアプリで「今日の問いで話そう」と言うだけでも、この問いから始まります。</p>
      </div>
    ` : html`<p class="jibun-hint jibun-hint--lead">話したい問いをタップして「今日はこれ」にすると、Claudeがその問いから始めます。</p>`}
    ${paused.length > 0 && html`
      <div class="jibun-section">途中の問い</div>
      ${paused.map((t) => html`
        <div key=${t.id} class="jibun-card jibun-paused">
          <div class="jibun-meta"><${ThemeDot} theme=${t.theme} />${shortDate(t.talked_on)} に途中まで ・ ${t.theme}</div>
          <div class="jibun-paused__q">${t.question || t.title}</div>
          ${t.resume_note && html`<p class="jibun-hint">続きは: ${t.resume_note}</p>`}
          <div class="jibun-row">
            <button class="jibun-btn" onClick=${() => onResume(t)}>Claudeで続きを話す</button>
            <button class="jibun-btn jibun-btn--ghost" onClick=${() => onResumeChatgpt(t)}>ChatGPTで続き</button>
          </div>
        </div>
      `)}
    `}
    <div class="jibun-card jibun-card--list">
      ${fresh.length
        ? fresh.map((q) => html`<${QuestionItem} key=${q.id} q=${q} onOpen=${onOpen} />`)
        : html`<div class="jibun-empty">${talked.length ? 'まだ話していない問いはありません。右下の＋で足せます。' : 'この分類の問いはまだありません。右下の＋で足せます。'}</div>`}
    </div>
    ${talked.length > 0 && html`
      <div class="jibun-section">話した問い</div>
      <div class="jibun-card jibun-card--list jibun-card--sunk">
        ${talked.map((q) => html`<${QuestionItem} key=${q.id} q=${q} onOpen=${onOpen} last=${lastByQ[q.id]} />`)}
      </div>
    `}
    ${done.length > 0 && html`
      <div class="jibun-section">答えが出た問い</div>
      <div class="jibun-card jibun-card--list jibun-card--sunk">
        ${done.map((q) => html`<${QuestionItem} key=${q.id} q=${q} onOpen=${onOpen} last=${lastByQ[q.id]} />`)}
      </div>
    `}
    <button class="jibun-import-link" onClick=${onImport}>ChatGPTで話した記録を取りこむ</button>
  `;
}

// じぶん像: 気づきを「就活で聞かれる形」に並べ直したもの
function Profile({ data, filter, onAddGap, onShukatsu, onCopy }) {
  const theme = filter === 'すべて' ? null : filter;
  const groups = profileOf(data.insights, { theme }).filter((g) => g.items.length);
  const gaps = !theme || theme === 'キャリア' ? gapsOf(data.insights) : [];
  const stock = new Set(data.questions.map((q) => q.question));
  const talks = data.talks.filter((t) => !theme || t.theme === theme);
  const doneCount = data.questions.filter((q) => q.status === '決着' && (!theme || q.theme === theme)).length;
  const changed = data.insights.filter((i) => i.status === '変化した' && (!theme || i.theme === theme)).length;
  return html`
    <div class="jibun-stats">
      <div><b>${talks.length}</b><span>話した回数</span></div>
      <div><b>${groups.reduce((n, g) => n + g.items.length, 0)}</b><span>今の考え</span></div>
      <div><b>${doneCount}</b><span>答えが出た問い</span></div>
      <div><b>${changed}</b><span>変わったこと</span></div>
    </div>
    ${(!theme || theme === 'キャリア') && html`
      <div class="jibun-card jibun-shukatsu">
        <div class="jibun-shukatsu__title">就活に使う</div>
        <p class="jibun-hint">キャリアの気づきだけを渡します(恋愛・人生観は入れません)。</p>
        <div class="jibun-row">
          ${SHUKATSU_MODES.map((m) => html`<button key=${m.key} class="jibun-btn jibun-btn--ghost" onClick=${() => onShukatsu(m.key)}>${m.label}</button>`)}
        </div>
        <div class="jibun-row jibun-row--end">
          <button class="jibun-btn jibun-btn--plain" onClick=${onCopy}>じぶん像をコピー</button>
        </div>
      </div>
    `}
    ${gaps.length > 0 && html`
      <div class="jibun-section">まだ薄いところ</div>
      <div class="jibun-card">
        ${gaps.map((k) => {
          const qText = GAP_QUESTIONS[k];
          const has = stock.has(qText);
          return html`
            <div key=${k} class="jibun-gap">
              <div><span class="jibun-gap__kind">${k}</span>${qText}</div>
              <button class="jibun-btn jibun-btn--ghost jibun-btn--small" disabled=${has} onClick=${() => onAddGap(qText)}>${has ? '問いにある' : '問いに足す'}</button>
            </div>
          `;
        })}
      </div>
    `}
    ${groups.length === 0 ? html`<div class="jibun-empty">まだ気づきがありません。<br />問いについて話すと、ここに「じぶん像」ができていきます。</div>`
      : groups.map((g) => html`
        <div key=${g.title} class="jibun-section">${g.title}</div>
        <div key=${g.title + '-c'} class=${`jibun-card${g.kinds[0] === '一言の自分' ? ' jibun-profile-lead' : ''}`}>
          ${g.items.slice(0, 6).map((i) => html`
            <div key=${i.id} class="jibun-ins">
              <div class="jibun-ins__s"><${ThemeDot} theme=${i.theme} />${i.statement}</div>
              <div class="jibun-meta"><span class="jibun-conf">${'●'.repeat(i.confidence || 1)}${'○'.repeat(Math.max(0, 3 - (i.confidence || 1)))}</span>${i.source === 'ChatGPT' ? ' ・ ChatGPTで' : ''}</div>
            </div>
          `)}
          ${g.items.length > 6 && html`<div class="jibun-meta">ほか${g.items.length - 6}件は「気づき」に</div>`}
        </div>
      `)}
  `;
}

// ChatGPTの「記録のかたまり」を貼って取りこむ
function ImportSheet({ initialText, insights, onClose, onImport }) {
  const [text, setText] = useState(initialText || '');
  const [busy, setBusy] = useState(false);
  const rec = parseRecord(text);
  const byShort = Object.fromEntries((insights || []).map((i) => [i.id.slice(0, 6), i]));

  async function paste() {
    try {
      const t = await navigator.clipboard.readText();
      if (t) setText(t);
    } catch (e) { /* 長押しで貼ってもらう */ }
  }

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); } }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);

  const opLabel = { new: '新しい', same: '同じ', changed: '変わった', withdrawn: '取り下げ' };
  return html`
    <div class="overlay overlay--top" onClick=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="modal-card jibun-sheet" role="dialog" aria-label="ChatGPTの記録を取りこむ">
        <div class="modal-card__title">ChatGPTの記録を取りこむ</div>
        ${!rec ? html`
          <textarea
            class="jibun-sheet__text jibun-sheet__text--tall"
            placeholder="【じぶんトークの記録】から【ここまで】までを貼り付け"
            value=${text}
            onInput=${(e) => setText(e.target.value)}
          ></textarea>
          ${text.trim() && html`<p class="jibun-hint jibun-hint--warn">記録のかたまりが見つかりません。ChatGPTに「バイバイ」と送ると出てきます。</p>`}
          <div class="jibun-row jibun-row--between">
            <button class="jibun-btn jibun-btn--plain" onClick=${onClose}>閉じる</button>
            <button class="jibun-btn" onClick=${paste}>貼り付け</button>
          </div>
        ` : html`
          <div class="jibun-preview">
            <div class="jibun-meta"><${ThemeDot} theme=${rec.theme || '人生観'} />${rec.theme || 'テーマなし'} ・ ${rec.talked_on ? shortDate(rec.talked_on) : '今日'}${rec.status === '途中' ? ' ・ 途中まで' : rec.answered ? ' ・ 答えが出た' : ''}</div>
            <div class="jibun-paused__q">${rec.question || '(問いなし)'}</div>
            ${rec.headline && html`<div class="jibun-talk__headline">${rec.headline}</div>`}
            ${rec.summary && html`<div class="jibun-talk__summary jibun-preview__summary">${rec.summary}</div>`}
            ${rec.insights.length > 0 && html`
              <div class="jibun-section">気づき ${rec.insights.length}件</div>
              ${rec.insights.map((x, n) => {
                const old = x.ref && byShort[x.ref];
                return html`
                  <div key=${n} class="jibun-preview__ins">
                    <span class=${`jibun-op jibun-op--${x.op}`}>${opLabel[x.op]}</span>
                    ${x.op === 'new' || x.op === 'changed'
                      ? html`${x.op === 'changed' && old && html`<span class="jibun-ins__old">${old.statement}</span><span class="jibun-ins__arrow">→</span>`}${x.statement}`
                      : old ? old.statement : '(前の気づき)'}
                  </div>
                `;
              })}
            `}
            ${rec.new_questions.length > 0 && html`<p class="jibun-hint">新しい問い: ${rec.new_questions.join(' / ')}</p>`}
            ${rec.status === '途中' && rec.resume_note && html`<p class="jibun-hint">続きは: ${rec.resume_note}</p>`}
          </div>
          <div class="jibun-row jibun-row--between">
            <button class="jibun-btn jibun-btn--plain" onClick=${() => setText('')}>貼り直す</button>
            <button class="jibun-btn" disabled=${busy} onClick=${async () => { setBusy(true); await onImport(rec); setBusy(false); }}>
              ${busy ? '保存中…' : '保存する'}
            </button>
          </div>
        `}
      </div>
    </div>
  `;
}

function Insights({ data, inFilter }) {
  const all = data.insights.filter((i) => inFilter(i.theme));
  if (!all.length) {
    return html`<div class="jibun-empty">まだ気づきがありません。<br />Claudeと話して「保存して」と言うと、ここに貯まります。</div>`;
  }
  const now = all.filter((i) => i.status === '今の考え' || i.status === '未解決');
  const changed = all.filter((i) => i.status === '変化した').slice(0, 12);
  const byId = Object.fromEntries(data.insights.map((i) => [i.id, i]));
  const groups = {};
  now.forEach((i) => (groups[i.kind] = groups[i.kind] || []).push(i));
  const rank = (k) => { const n = KIND_ORDER.indexOf(k); return n < 0 ? 99 : n; };
  const kinds = Object.keys(groups).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  return html`
    ${changed.length > 0 && html`
      <div class="jibun-section">変わったこと</div>
      <div class="jibun-card">
        ${changed.map((o) => {
          const n = byId[o.replaced_by];
          return html`
            <div key=${o.id} class="jibun-ins jibun-ins--change">
              <span class="jibun-ins__old">${o.statement}</span><span class="jibun-ins__arrow">→</span>${n ? n.statement : '(新しい考え)'}
              ${o.change_note && html`<div class="jibun-meta">きっかけ: ${o.change_note}</div>`}
              <div class="jibun-meta">${o.theme} ・ ${(o.updated_at || '').slice(0, 10)}</div>
            </div>
          `;
        })}
      </div>
    `}
    ${kinds.map((k) => html`
      <div key=${k} class="jibun-section">${k}</div>
      <div key=${k + '-c'} class="jibun-card">
        ${groups[k].map((i) => {
          const conf = i.confidence || 1;
          return html`
            <div key=${i.id} class="jibun-ins">
              <div class="jibun-ins__s"><${ThemeDot} theme=${i.theme} />${i.statement}</div>
              <div class="jibun-meta">
                <span class="jibun-conf">${'●'.repeat(conf)}${'○'.repeat(Math.max(0, 3 - conf))}</span>
                ${i.first_seen ? ` ・ ${i.first_seen.slice(0, 7).replace('-', '年')}月から` : ''}
                ${i.last_confirmed && i.last_confirmed !== i.first_seen ? ` ・ 最後に確認 ${shortDate(i.last_confirmed)}` : ''}
              </div>
            </div>
          `;
        })}
      </div>
    `)}
  `;
}

function Talks({ data, inFilter, filter, onImport }) {
  const talks = data.talks.filter((t) => inFilter(t.theme));
  const report = filter === 'すべて' && data.reports.length ? data.reports[0] : null;
  return html`
    <button class="jibun-import-link jibun-import-link--top" onClick=${onImport}>ChatGPTで話した記録を取りこむ</button>
    ${report && html`
      <div class="jibun-section">今週の変化レポート(${shortDate(report.period_start)}〜${shortDate(report.period_end)})</div>
      <div class="jibun-card jibun-report">${report.body}</div>
    `}
    <div class="jibun-section">話した記録</div>
    ${talks.length === 0
      ? html`<div class="jibun-empty">まだ記録がありません。</div>`
      : talks.map((t) => html`
        <div key=${t.id} class="jibun-card jibun-talk">
          <div class="jibun-meta">
            <${ThemeDot} theme=${t.theme} />${shortDate(t.talked_on)} ・ ${t.theme}
            ${t.source === 'ChatGPT' && ' ・ ChatGPTで話した'}
            ${t.status === '途中' && html`<span class="jibun-badge">途中</span>`}
          </div>
          <div class="jibun-talk__title">${t.title}</div>
          ${t.headline && html`<div class="jibun-talk__headline">${t.headline}</div>`}
          <details class="jibun-talk__more">
            <summary>具体的には</summary>
            <div class="jibun-talk__summary">${t.summary}</div>
            ${(t.quotes || []).map((q, i) => html`<blockquote key=${i} class="jibun-talk__quote">「${q}」</blockquote>`)}
            ${t.new_material && html`<p class="jibun-hint">新しく出た話: ${t.new_material}</p>`}
            ${t.next_question && html`<p class="jibun-hint">次に話したい: ${t.next_question}</p>`}
          </details>
        </div>
      `)}
  `;
}

// 問いを開いたとき・足すときのカード。文字を打つので上に出す
function QuestionSheet({ q, initialText, initialTheme, onClose, onSave, onAdd, onChatgpt }) {
  const [text, setText] = useState(q ? q.question : initialText || '');
  const [theme, setTheme] = useState(q ? q.theme : initialTheme || '人生観');
  const ref = useRef(null);

  useEffect(() => {
    if (!q && ref.current) setTimeout(() => ref.current && ref.current.focus(), 50);
    function onKey(e) {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); }
    }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);

  // 開いた問いの、直したところだけ
  function edited() {
    const p = {};
    const t = text.trim();
    if (t && t !== q.question) p.question = t;
    if (theme !== q.theme) p.theme = theme;
    return p;
  }

  return html`
    <div class="overlay overlay--top" onClick=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="modal-card jibun-sheet" role="dialog" aria-label=${q ? '問い' : '問いを足す'}>
        <div class="modal-card__title">${q ? '問い' : '問いを足す'}</div>
        <textarea
          ref=${ref}
          class="jibun-sheet__text"
          placeholder="例: 最近いちばん悔しかったことは?"
          value=${text}
          onInput=${(e) => setText(e.target.value)}
        ></textarea>
        <${ThemeChips} value=${theme} onChange=${setTheme} />
        ${q ? html`
          <div class="jibun-row">
            <button class="jibun-btn" onClick=${() => onSave(q, { ...edited(), status: '今日' }, '今日の問いにしました')}>今日はこれ</button>
            <button class="jibun-btn jibun-btn--ghost" onClick=${() => onChatgpt({ q })}>ChatGPTで話す</button>
            <button class="jibun-btn jibun-btn--ghost" onClick=${() => onSave(q, { ...edited(), pinned: !q.pinned })}>${q.pinned ? '★をはずす' : '★ 気になる'}</button>
          </div>
          <div class="jibun-row jibun-row--between">
            <button class="jibun-btn jibun-btn--plain" onClick=${() => (q.status === '決着'
              ? onSave(q, { status: 'ストック' }, 'ストックに戻しました')
              : onSave(q, { status: 'しまう' }, 'しまいました'))}>
              ${q.status === '決着' ? 'ストックに戻す' : 'しまう'}
            </button>
            <span>
              <button class="jibun-btn jibun-btn--plain" onClick=${onClose}>閉じる</button>
              <button class="jibun-btn jibun-btn--ghost" onClick=${() => {
                const p = edited();
                Object.keys(p).length ? onSave(q, p, '保存しました') : onClose();
              }}>保存</button>
            </span>
          </div>
        ` : html`
          <div class="jibun-row jibun-row--between">
            <button class="jibun-btn jibun-btn--plain" onClick=${onClose}>閉じる</button>
            <button class="jibun-btn" disabled=${!text.trim()} onClick=${() => onAdd(text.trim(), theme)}>足す</button>
          </div>
          <p class="jibun-hint">Claudeと話しているときに「この問い足しといて」と言っても入ります。</p>
        `}
      </div>
    </div>
  `;
}

// 「じぶん」タブ: 問いを選んでClaudeと話し、気づきとその変化を振り返る(旧じぶんノート)
export function JibunView({ onToast, questionDraft, onQuestionDraftConsumed, keyVersion }) {
  const [hasKey, setHasKey] = useState(() => !!readKey());
  const [keyMessage, setKeyMessage] = useState('');
  const [data, setData] = useState(readCache);
  const [offline, setOffline] = useState(false);
  const [status, setStatus] = useState('');
  const [section, setSection] = useState('questions');
  const [filter, setFilter] = useState('すべて');
  const [sheet, setSheet] = useState(null); // { q } で開く / { text } で足す
  const [importing, setImporting] = useState(null); // { text } で取りこむカードを開く
  const [pending, setPending] = useState(readPending);
  const dataRef = useRef(data);
  dataRef.current = data;

  const toast = (m) => onToast && onToast(m);

  async function load() {
    if (!readKey()) { setHasKey(false); return; }
    try {
      const d = await loadAll();
      // クラウドが空で返ってきても手元の控えは消さない
      if (d && (d.questions?.length || d.insights?.length || !dataRef.current)) {
        setData(d);
        writeCache(d);
      }
      setOffline(false);
      setStatus('');
    } catch (e) {
      if (e.message === 'bad key') {
        writeKey('');
        setHasKey(false);
        setKeyMessage('合言葉が違うようです');
        return;
      }
      setOffline(true);
      setStatus(dataRef.current ? 'つながらないので前回の内容を表示しています' : 'つながりません');
    }
  }

  // 合言葉入りのリンクで開き直されたら(keyVersion が変わる)入れ直す
  useEffect(() => {
    const ok = !!readKey();
    setHasKey(ok);
    if (ok) load();
  }, [keyVersion]);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== 'visible') return;
      setPending(readPending());
      if (readKey()) load();
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // ホームのメモから「問いにする」で来たら、足すカードを開く
  useEffect(() => {
    if (!questionDraft || !hasKey) return;
    setSection('questions');
    setSheet({ text: questionDraft.text, token: questionDraft.token });
    onQuestionDraftConsumed && onQuestionDraftConsumed();
  }, [questionDraft, hasKey]);

  function submitKey(v) {
    writeKey(v);
    setKeyMessage('');
    setHasKey(true);
    load();
  }

  async function saveQuestion(q, patch, msg) {
    if (offline) { toast('つながっていないので変更できません'); return; }
    try {
      const r = await updateQuestion(q.id, patch);
      setData((d) => {
        let questions = d.questions.map((x) => {
          if (x.id === q.id) return { ...x, ...r };
          // 今日の問いは1つだけ
          if (r && r.status === '今日' && x.status === '今日') return { ...x, status: x.times_talked ? '話した' : 'ストック' };
          return x;
        });
        if (patch.status === 'しまう') questions = questions.filter((x) => x.id !== q.id);
        const next = { ...d, questions };
        writeCache(next);
        return next;
      });
      setSheet(null);
      if (msg) toast(msg);
      if (r && r.status === '今日') document.querySelector('.app-body')?.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      toast('保存できませんでした');
    }
  }

  async function add(text, theme) {
    if (offline) { toast('つながっていないので足せません'); return; }
    try {
      const r = await addQuestion(text, theme);
      setData((d) => {
        const next = { ...d, questions: [r, ...d.questions] };
        writeCache(next);
        return next;
      });
      setSheet(null);
      toast('問いを足しました');
    } catch (e) {
      toast('保存できませんでした');
    }
  }

  async function talk(q) {
    const text = claudePrompt(q);
    window.open('https://claude.ai/new?q=' + encodeURIComponent(text), '_blank');
    try { await navigator.clipboard.writeText(text); } catch (e) { /* コピーできなくても開いている */ }
  }

  function resume(t) {
    const text = claudeResumePrompt(t);
    navigator.clipboard?.writeText(text).catch(() => {});
    window.open('https://claude.ai/new?q=' + encodeURIComponent(text), '_blank');
  }

  // ChatGPTは頼み文が長いので、入力欄に入れて開き(長すぎれば開くだけ)、念のためコピーもしておく。
  // iPhoneは待ってから開くと止められるので、先に開いてからコピーする
  async function openChatgpt(text, okMsg) {
    const url = 'https://chatgpt.com/?q=' + encodeURIComponent(text);
    const prefilled = url.length < 8000;
    window.open(prefilled ? url : 'https://chatgpt.com/', '_blank');
    let copied = false;
    try { await navigator.clipboard.writeText(text); copied = true; } catch (e) { /* 下で知らせる */ }
    toast(copied ? okMsg
      : prefilled ? 'ChatGPTを開きました' : 'コピーできませんでした。もう一度押してね');
  }

  // 話しに行った問いを覚えておき、戻ってきたら「記録を取りこむ」の帯を出す
  async function chatgpt({ q, talk }) {
    const text = chatgptPrompt({ q, talk, insights: data.insights, talks: data.talks });
    const p = {
      question: (q && q.question) || (talk && (talk.question || talk.title)) || '',
      question_id: (q && q.id) || (talk && talk.question_id) || '',
      at: Date.now(),
    };
    writePending(p);
    setPending(p);
    setSheet(null);
    await openChatgpt(text, '頼み文をコピーしました。入っていなければ貼り付けて送ってね');
  }

  // 「取りこむ」を押したら、まずクリップボードを見る(記録が入っていればそのまま確認画面)
  async function openImport() {
    let text = '';
    try {
      const t = await navigator.clipboard.readText();
      if (hasRecord(t)) text = t;
    } catch (e) { /* 読めなければ貼ってもらう */ }
    setImporting({ text, token: Date.now() });
  }

  async function doImport(rec) {
    if (offline) { toast('つながっていないので保存できません'); return; }
    try {
      const r = await importTalk(rec);
      setImporting(null);
      writePending(null);
      setPending(null);
      if (r.duplicate) {
        toast('この記録はもう入っています');
      } else {
        const parts = [];
        if (r.new) parts.push(`新しい気づき${r.new}`);
        if (r.changed) parts.push(`変化${r.changed}`);
        if (r.same) parts.push(`確かめた${r.same}`);
        if (r.questions) parts.push(`問い+${r.questions}`);
        const head = r.status === '途中' ? '途中まで保存しました' : r.question_status === '決着' ? '保存して、問いを「答えが出た」にしました' : '保存しました';
        toast(head + (parts.length ? `(${parts.join('・')})` : ''));
        setSection(r.status === '途中' ? 'questions' : 'talks');
      }
      await load();
    } catch (e) {
      toast(e.message === 'bad key' ? '合言葉が違うようです' : '保存できませんでした。もう一度押してね');
    }
  }

  function shukatsu(mode) {
    const mLabel = (SHUKATSU_MODES.find((m) => m.key === mode) || {}).label || '';
    openChatgpt(shukatsuPrompt(data.insights, data.talks, mode), `「${mLabel}」の頼み文をコピーしました`);
  }

  async function copyProfile() {
    const theme = filter === 'すべて' ? null : filter;
    const text = profileText(data.insights, theme ? { theme } : { careerOnly: true });
    try {
      await navigator.clipboard.writeText(text);
      toast(theme ? 'じぶん像をコピーしました' : 'じぶん像(キャリア)をコピーしました');
    } catch (e) {
      toast('コピーできませんでした');
    }
  }

  async function copy(q) {
    try {
      await navigator.clipboard.writeText(claudePrompt(q));
      toast('コピーしました');
    } catch (e) {
      toast('コピーできませんでした');
    }
  }

  const inFilter = (theme) => filter === 'すべて' || filter === theme;

  return html`
    <div class="jibun-view">
      <div class="view-header">
        <div class="view-header__title">じぶん</div>
        ${status && html`<div class="view-header__count">${status}</div>`}
      </div>
      ${!hasKey ? html`
        <div class="jibun-body"><${KeyScreen} message=${keyMessage} onSubmit=${submitKey} /></div>
      ` : html`
        <div class="jibun-body">
          <div class="segmented" role="tablist" aria-label="じぶんの中身">
            ${SECTIONS.map((s) => html`
              <button
                key=${s.key}
                role="tab"
                aria-selected=${section === s.key}
                class=${`segmented__item${section === s.key ? ' is-active' : ''}`}
                onClick=${() => setSection(s.key)}
              >${s.label}</button>
            `)}
          </div>
          <${ThemeChips} value=${filter} onChange=${setFilter} withAll=${true} />
          ${!data ? html`<div class="jibun-empty">読み込み中…</div>`
            : section === 'questions' ? html`<${Questions}
                data=${data}
                inFilter=${inFilter}
                onOpen=${(q) => setSheet({ q })}
                onTalk=${talk}
                onChatgpt=${chatgpt}
                onResume=${resume}
                onResumeChatgpt=${(t) => chatgpt({ talk: t })}
                onCopy=${copy}
                onUnpick=${(q) => saveQuestion(q, { status: q.times_talked ? '話した' : 'ストック' }, '戻しました')}
                pending=${pending}
                onImport=${openImport}
                onDismissPending=${() => { writePending(null); setPending(null); }}
              />`
            : section === 'profile' ? html`<${Profile}
                data=${data}
                filter=${filter}
                onAddGap=${(text) => add(text, 'キャリア')}
                onShukatsu=${shukatsu}
                onCopy=${copyProfile}
              />`
            : section === 'insights' ? html`<${Insights} data=${data} inFilter=${inFilter} />`
            : html`<${Talks} data=${data} inFilter=${inFilter} filter=${filter} onImport=${openImport} />`}
        </div>
        ${section === 'questions' && data && html`
          <button class="fab" aria-label="問いを足す" onClick=${() => setSheet({ text: '' })}>＋</button>
        `}
      `}
      ${sheet && html`
        <${QuestionSheet}
          key=${sheet.q ? sheet.q.id : 'add-' + (sheet.token || '')}
          q=${sheet.q}
          initialText=${sheet.text}
          initialTheme=${filter !== 'すべて' ? filter : '人生観'}
          onClose=${() => setSheet(null)}
          onSave=${saveQuestion}
          onAdd=${add}
          onChatgpt=${chatgpt}
        />
      `}
      ${importing && html`
        <${ImportSheet}
          key=${importing.token}
          initialText=${importing.text}
          insights=${data ? data.insights : []}
          onClose=${() => setImporting(null)}
          onImport=${doImport}
        />
      `}
    </div>
  `;
}
