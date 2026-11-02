import htm from 'htm';
import React, { useEffect, useRef, useState } from 'react';
import {
  THEMES, themeColorKey, readKey, writeKey, readCache, writeCache,
  loadAll, addQuestion, updateQuestion, claudePrompt, shortDate,
} from '../lib/jibun.js';
import { tagColorVars } from '../lib/tagColors.js';

const html = htm.bind(React.createElement);

const SECTIONS = [
  { key: 'questions', label: '問い' },
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

function QuestionItem({ q, onOpen }) {
  const meta = [
    q.theme,
    q.times_talked ? `${q.times_talked}回話した` : 'まだ話していない',
    q.last_talked ? `最後 ${shortDate(q.last_talked)}` : '',
    q.source === '前のトークの宿題' ? '前のトークの宿題' : '',
  ].filter(Boolean).join(' ・ ');
  return html`
    <button class="jibun-q" onClick=${() => onOpen(q)}>
      <span class="jibun-q__bar" style=${tagColorVars(themeColorKey(q.theme))}></span>
      <span class="jibun-q__main">
        <span class="jibun-q__text">${q.pinned && html`<span class="jibun-q__pin">★ </span>`}${q.question}</span>
        <span class="jibun-meta">${meta}</span>
      </span>
    </button>
  `;
}

function Questions({ data, inFilter, onOpen, onTalk, onCopy, onUnpick }) {
  const today = data.questions.find((q) => q.status === '今日');
  const open = data.questions.filter((q) => q.status !== '今日' && q.status !== '決着' && inFilter(q.theme));
  // まだ話していない問いが上(★→新しい順)。話した問いは下に沈め、最近話したものほど下へ
  const fresh = open.filter((q) => !q.times_talked);
  const talked = open.filter((q) => q.times_talked)
    .sort((a, b) => (a.last_talked || '').localeCompare(b.last_talked || ''));
  const done = data.questions.filter((q) => q.status === '決着' && inFilter(q.theme));
  return html`
    ${today ? html`
      <div class="jibun-card jibun-today">
        <div class="jibun-today__label"><${ThemeDot} theme=${today.theme} />今日の問い ・ ${today.theme}</div>
        <div class="jibun-today__q">${today.question}</div>
        <div class="jibun-row">
          <button class="jibun-btn" onClick=${() => onTalk(today)}>Claudeと話す</button>
          <button class="jibun-btn jibun-btn--ghost" onClick=${() => onCopy(today)}>文をコピー</button>
          <button class="jibun-btn jibun-btn--plain" onClick=${() => onUnpick(today)}>やめる</button>
        </div>
        <p class="jibun-hint">Claudeのアプリで「今日の問いで話そう」と言うだけでも、この問いから始まります。</p>
      </div>
    ` : html`<p class="jibun-hint jibun-hint--lead">話したい問いをタップして「今日はこれ」にすると、Claudeがその問いから始めます。</p>`}
    <div class="jibun-card jibun-card--list">
      ${fresh.length
        ? fresh.map((q) => html`<${QuestionItem} key=${q.id} q=${q} onOpen=${onOpen} />`)
        : html`<div class="jibun-empty">${talked.length ? 'まだ話していない問いはありません。右下の＋で足せます。' : 'この分類の問いはまだありません。右下の＋で足せます。'}</div>`}
    </div>
    ${talked.length > 0 && html`
      <div class="jibun-section">話した問い</div>
      <div class="jibun-card jibun-card--list jibun-card--sunk">
        ${talked.map((q) => html`<${QuestionItem} key=${q.id} q=${q} onOpen=${onOpen} />`)}
      </div>
    `}
    ${done.length > 0 && html`
      <div class="jibun-section">答えが出た問い</div>
      <div class="jibun-card jibun-card--list jibun-card--sunk">
        ${done.map((q) => html`<${QuestionItem} key=${q.id} q=${q} onOpen=${onOpen} />`)}
      </div>
    `}
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

function Talks({ data, inFilter, filter }) {
  const talks = data.talks.filter((t) => inFilter(t.theme));
  const report = filter === 'すべて' && data.reports.length ? data.reports[0] : null;
  return html`
    ${report && html`
      <div class="jibun-section">今週の変化レポート(${shortDate(report.period_start)}〜${shortDate(report.period_end)})</div>
      <div class="jibun-card jibun-report">${report.body}</div>
    `}
    <div class="jibun-section">話した記録</div>
    ${talks.length === 0
      ? html`<div class="jibun-empty">まだ記録がありません。</div>`
      : talks.map((t) => html`
        <div key=${t.id} class="jibun-card jibun-talk">
          <div class="jibun-meta"><${ThemeDot} theme=${t.theme} />${shortDate(t.talked_on)} ・ ${t.theme}</div>
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
function QuestionSheet({ q, initialText, initialTheme, onClose, onSave, onAdd }) {
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
      if (document.visibilityState === 'visible' && readKey()) load();
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
    try { await navigator.clipboard.writeText(text); } catch (e) { /* コピーできなくても開く */ }
    window.open('https://claude.ai/new?q=' + encodeURIComponent(text), '_blank');
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
                onCopy=${copy}
                onUnpick=${(q) => saveQuestion(q, { status: q.times_talked ? '話した' : 'ストック' }, '戻しました')}
              />`
            : section === 'insights' ? html`<${Insights} data=${data} inFilter=${inFilter} />`
            : html`<${Talks} data=${data} inFilter=${inFilter} filter=${filter} />`}
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
        />
      `}
    </div>
  `;
}
