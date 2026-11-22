import htm from 'htm';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  THEMES, themeColorKey, readKey, writeKey, readCache, writeCache,
  loadAll, addQuestion, updateQuestion, claudePrompt, claudeResumePrompt, chatgptPrompt, chatgptLongPrompt, shortDate,
  parseRecord, hasRecord, importTalk, readPending, writePending, structureText, markSimilar, CHATGPT_INSTRUCTIONS,
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
function PendingBanner({ pending, onImport, onDismiss, onLong }) {
  return html`
    <div class="jibun-card jibun-pending">
      <div class="jibun-pending__title">ChatGPTで話し中</div>
      <div class="jibun-pending__q">${pending.question || '(問い)'}</div>
      <p class="jibun-hint">① ChatGPTに問いが入っていなければ、コピー済みの文を貼って送る ② 話し終わったら「バイバイ」 ③ 出てきた記録(または話した内容のメモ)をコピーして、下のボタン。Claudeで話したのと同じように気づき・記録に入り、続きはどちらでも話せます。</p>
      <div class="jibun-row">
        <button class="jibun-btn" onClick=${onImport}>記録を取りこむ</button>
        <button class="jibun-btn jibun-btn--plain" onClick=${onDismiss}>話さなかった</button>
      </div>
      <button class="jibun-import-link" onClick=${onLong}>ChatGPTに指示を入れていないとき: 長い頼み文をコピー</button>
    </div>
  `;
}

// ChatGPTの「カスタム指示」に入れる文を渡す。1回入れれば、あとは問いだけの短い文で話せる
function ChatgptSetup({ onCopy }) {
  return html`
    <details class="jibun-card jibun-setup">
      <summary>ChatGPTを使う前の準備(1回だけ)</summary>
      <p class="jibun-hint">ChatGPTに「じぶんトークのやり方」を覚えさせておくと、毎回長い文を貼らなくても、問いを開くだけで話せます。「じぶんトーク」で始まるメッセージのときだけ働くので、ふだんのChatGPTには影響しません。</p>
      <ol class="jibun-setup__steps">
        <li>下のボタンで指示文をコピー</li>
        <li>ChatGPT → 設定 → パーソナライズ → カスタム指示 を開く</li>
        <li>「どのように応答してほしいですか?」の欄に貼って保存</li>
      </ol>
      <div class="jibun-row">
        <button class="jibun-btn" onClick=${onCopy}>指示文をコピー(${CHATGPT_INSTRUCTIONS.length}字)</button>
      </div>
    </details>
  `;
}

function Questions({ data, inFilter, onOpen, onTalk, onChatgpt, onCopy, onUnpick, onResume, onResumeChatgpt, pending, onImport, onDismissPending, onLong, onCopyInstructions }) {
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
    ${pending && html`<${PendingBanner} pending=${pending} onImport=${onImport} onDismiss=${onDismissPending} onLong=${onLong} />`}
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
    <button class="jibun-import-link" onClick=${onImport}>話した内容を貼って取りこむ(どこで話したものでも)</button>
    <${ChatgptSetup} onCopy=${onCopyInstructions} />
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

// 1件ぶんの確認表示。似た気づきには「同じにする/別にする」の切りかえを付ける
function RecordPreview({ rec, insights, merges, onToggle }) {
  const byShort = Object.fromEntries((insights || []).map((i) => [i.id.slice(0, 6), i]));
  const opLabel = { new: '新しい', same: '同じ', changed: '変わった', withdrawn: '取り下げ' };
  return html`
    <div class="jibun-preview">
      <div class="jibun-meta"><${ThemeDot} theme=${rec.theme || '人生観'} />${rec.theme || 'テーマなし'} ・ ${rec.talked_on ? shortDate(rec.talked_on) : '今日'}${rec.status === '途中' ? ' ・ 途中まで' : rec.answered ? ' ・ 答えが出た' : ''}${rec.question_id ? '' : ' ・ 新しい問い'}</div>
      <div class="jibun-paused__q">${rec.question || '(問いなし)'}</div>
      ${rec.headline && html`<div class="jibun-talk__headline">${rec.headline}</div>`}
      ${rec.summary && html`<div class="jibun-talk__summary jibun-preview__summary">${rec.summary}</div>`}
      ${rec.insights.length > 0 && html`
        <div class="jibun-section">気づき ${rec.insights.length}件</div>
        ${rec.insights.map((x, n) => {
          const old = x.ref && byShort[x.ref];
          const merged = x.similar && merges[n];
          return html`
            <div key=${n} class="jibun-preview__ins">
              <span class=${`jibun-op jibun-op--${merged ? 'same' : x.op}`}>${opLabel[merged ? 'same' : x.op]}</span>
              ${merged
                ? x.similar.statement
                : x.op === 'new' || x.op === 'changed'
                  ? html`${x.op === 'changed' && old && html`<span class="jibun-ins__old">${old.statement}</span><span class="jibun-ins__arrow">→</span>`}${x.statement}`
                  : old ? old.statement : '(前の気づき)'}
              ${x.similar && html`
                <div class="jibun-preview__sim">
                  ${merged ? html`貼った文: ${x.statement}` : html`似ている気づき: ${x.similar.statement}`}
                  <button class="jibun-btn jibun-btn--plain jibun-btn--small" onClick=${() => onToggle(n)}>${merged ? '別の気づきにする' : '同じにする'}</button>
                </div>
              `}
            </div>
          `;
        })}
      `}
      ${rec.new_questions.length > 0 && html`<p class="jibun-hint">新しい問い: ${rec.new_questions.join(' / ')}</p>`}
      ${rec.status === '途中' && rec.resume_note && html`<p class="jibun-hint">続きは: ${rec.resume_note}</p>`}
    </div>
  `;
}

// 話した内容を貼って取りこむ。
// ① 決まった形の記録(ChatGPT・Claudeが出したもの)はそのまま読む ② ふつうの文章(どこで話した内容でも)は
// 「整理する」でAIが記録の形に直す。どちらも確認画面を見てから保存する
function ImportSheet({ initialText, insights, onClose, onImport }) {
  const [text, setText] = useState(initialText || '');
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiRecs, setAiRecs] = useState(null);
  // 似た気づきを「同じ」として扱うか(記録の番号:気づきの番号 → true/false)。0.6以上は初めから同じにする
  const [merges, setMerges] = useState({});

  const parsed = parseRecord(text);
  const recs = (aiRecs || (parsed ? [parsed] : null) || null);
  const shown = recs ? recs.map((r) => markSimilar(r, insights)) : null;
  const mergeOf = (ri, n) => {
    const k = ri + ':' + n;
    if (k in merges) return merges[k];
    const x = shown[ri].insights[n];
    return !!(x.similar && x.similar.score >= 0.6);
  };

  async function paste() {
    try {
      const t = await navigator.clipboard.readText();
      if (t) { setText(t); setAiRecs(null); setAiError(''); }
    } catch (e) { /* 長押しで貼ってもらう */ }
  }

  async function organize() {
    setAiBusy(true);
    setAiError('');
    try {
      const rs = await structureText(text.trim());
      setAiRecs(rs);
      setMerges({});
    } catch (e) {
      setAiError(e.message === 'bad key' ? '合言葉が違うようです'
        : e.message === 'too long' ? '長すぎます(4万字まで)。半分に分けて貼ってください'
        : '整理できませんでした。もう一度押すか、少し短くして試してください');
    }
    setAiBusy(false);
  }

  // 保存するときは、「同じ」にした気づきを same に置きかえて渡す
  async function save() {
    setBusy(true);
    const out = shown.map((r, ri) => ({
      ...r,
      insights: r.insights.map((x, n) => {
        const { similar, ...rest } = x;
        return similar && mergeOf(ri, n) ? { op: 'same', ref: similar.id.slice(0, 6), strong: false, note: '' } : rest;
      }),
    }));
    await onImport(out);
    setBusy(false);
  }

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); } }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);

  const canOrganize = text.trim().length >= 30;
  // 画面のいちばん外側(body)に出す。「じぶん」画面の中に置くと、iPhoneでは下のタブの後ろに隠れることがある
  return createPortal(html`
    <div class="overlay overlay--full" onClick=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="modal-card jibun-sheet jibun-sheet--fixed-foot" role="dialog" aria-label="話した内容を取りこむ">
        <div class="modal-card__title">話した内容を取りこむ</div>
        ${!shown ? html`
          <div class="jibun-sheet__body">
            <textarea
              class="jibun-sheet__text jibun-sheet__text--tall"
              placeholder="話した内容をそのまま貼り付け(ChatGPTやClaudeの会話・まとめ、ボイスメモの文字起こし、自分で書いた振り返りなど、形は何でもOK)。複数の話が混ざっていても、分けて整理します。"
              value=${text}
              onInput=${(e) => { setText(e.target.value); setAiError(''); }}
            ></textarea>
            ${aiError && html`<p class="jibun-hint jibun-hint--warn">${aiError}</p>`}
            ${aiBusy && html`<p class="jibun-hint">整理しています…(10〜40秒かかります。閉じずに待ってね)</p>`}
            <p class="jibun-hint">「整理する」は、問い・今日の一言・具体的には・気づきの形にAIが直します。保存の前に、中身を確認できます。</p>
          </div>
          <div class="jibun-sheet__foot jibun-row jibun-row--between">
            <button class="jibun-btn jibun-btn--plain" onClick=${onClose}>閉じる</button>
            <span>
              <button class="jibun-btn jibun-btn--ghost" disabled=${aiBusy} onClick=${paste}>貼り付け</button>
              <button class="jibun-btn" disabled=${!canOrganize || aiBusy} onClick=${organize}>${aiBusy ? '整理中…' : '整理する'}</button>
            </span>
          </div>
        ` : html`
          <div class="jibun-sheet__body">
            ${shown.length > 1 && html`<p class="jibun-hint">${shown.length}件の話に分けました。下の「保存する」はいつも画面の下に出ています。</p>`}
            ${shown.map((r, ri) => html`
              <${RecordPreview}
                key=${ri}
                rec=${r}
                insights=${insights}
                merges=${Object.fromEntries(r.insights.map((x, n) => [n, mergeOf(ri, n)]))}
                onToggle=${(n) => setMerges((m) => ({ ...m, [ri + ':' + n]: !mergeOf(ri, n) }))}
              />
            `)}
            <button class="jibun-btn jibun-btn--wide" disabled=${busy} onClick=${save}>
              ${busy ? '保存中…' : shown.length > 1 ? `ここまで確認したら ${shown.length}件を保存する` : 'ここまで確認したら保存する'}
            </button>
          </div>
          <div class="jibun-sheet__foot jibun-row jibun-row--between">
            <button class="jibun-btn jibun-btn--plain" onClick=${() => { setText(''); setAiRecs(null); setMerges({}); }}>貼り直す</button>
            <button class="jibun-btn" disabled=${busy} onClick=${save}>
              ${busy ? '保存中…' : shown.length > 1 ? `${shown.length}件を保存する` : '保存する'}
            </button>
          </div>
        `}
      </div>
    </div>
  `, document.body);
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
    <button class="jibun-import-link jibun-import-link--top" onClick=${onImport}>話した内容を貼って取りこむ(どこで話したものでも)</button>
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

  return createPortal(html`
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
  `, document.body);
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
      // 決まった形の記録か、長めの文章(話した内容のメモ)ならそのまま入れておく
      if (hasRecord(t) || (t || '').trim().length >= 150) text = t;
    } catch (e) { /* 読めなければ貼ってもらう */ }
    setImporting({ text, token: Date.now() });
  }

  // 取りこむ記録(1件でも複数でも)を順に保存する
  async function doImport(recs) {
    if (offline) { toast('つながっていないので保存できません'); return; }
    const list = Array.isArray(recs) ? recs : [recs];
    const sum = { saved: 0, dup: 0, new: 0, changed: 0, same: 0, questions: 0, paused: 0, settled: 0 };
    try {
      for (const rec of list) {
        const r = await importTalk(rec);
        if (r.duplicate) { sum.dup++; continue; }
        sum.saved++;
        sum.new += r.new || 0; sum.changed += r.changed || 0; sum.same += r.same || 0; sum.questions += r.questions || 0;
        if (r.status === '途中') sum.paused++;
        if (r.question_status === '決着') sum.settled++;
      }
      setImporting(null);
      writePending(null);
      setPending(null);
      if (!sum.saved) {
        toast('この記録はもう入っています');
      } else {
        const parts = [];
        if (sum.new) parts.push(`新しい気づき${sum.new}`);
        if (sum.changed) parts.push(`変化${sum.changed}`);
        if (sum.same) parts.push(`確かめた${sum.same}`);
        if (sum.questions) parts.push(`問い+${sum.questions}`);
        const head = sum.saved > 1 ? `${sum.saved}件保存しました`
          : sum.paused ? '途中まで保存しました'
          : sum.settled ? '保存して、問いを「答えが出た」にしました' : '保存しました';
        toast(head + (parts.length ? `(${parts.join('・')})` : ''));
        setSection(sum.paused === sum.saved ? 'questions' : 'talks');
      }
      await load();
    } catch (e) {
      toast(e.message === 'bad key' ? '合言葉が違うようです' : '保存できませんでした。もう一度押してね');
      await load();
    }
  }

  // ChatGPTに指示を入れていないときのため、全部入りの長い頼み文をコピー
  async function copyLong() {
    const q = data.questions.find((x) => x.id === (pending && pending.question_id))
      || { question: pending ? pending.question : '', theme: '人生観' };
    try {
      await navigator.clipboard.writeText(chatgptLongPrompt({ q, insights: data.insights, talks: data.talks }));
      toast('長い頼み文をコピーしました。ChatGPTに貼って送ってね');
    } catch (e) {
      toast('コピーできませんでした');
    }
  }

  async function copyInstructions() {
    try {
      await navigator.clipboard.writeText(CHATGPT_INSTRUCTIONS);
      toast('指示文をコピーしました。ChatGPTのカスタム指示に貼ってね');
    } catch (e) {
      toast('コピーできませんでした');
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
                onLong=${copyLong}
                onCopyInstructions=${copyInstructions}
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
