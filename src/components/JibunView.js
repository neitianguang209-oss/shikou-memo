// 「じぶん」タブ: 問いを選んで20分で掘り、変わったところを振り返る
import React, { useEffect, useRef, useState } from 'react';
import {
  readKey, writeKey, readCache, writeCache, loadAll, addQuestion, updateQuestion, reviewInsight, importTalk,
  hasRecord, profileText, shukatsuPrompt, SHUKATSU_MODES,
} from '../lib/jibun.js';
import { sessionPrompt, readSession, writeSession } from '../lib/jibunSession.js';
import { html, ThemeChips } from './jibunParts.js';
import { Questions, SessionBar } from './JibunQuestions.js';
import { QuestionSheet, AddSheet } from './JibunQuestionSheet.js';
import { ImportSheet } from './JibunImportSheet.js';
import { Review } from './JibunReview.js';
import { Profile } from './JibunProfile.js';

const SECTIONS = [
  { key: 'questions', label: '問い' },
  { key: 'review', label: 'ふりかえり' },
  { key: 'profile', label: 'じぶん像' },
];

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

// AIを開いて指示文をコピーする。iPhoneは待ってから開くと止められるので、先にコピーを始めてすぐ開く
function openAi(ai, text, toast, okMsg) {
  const base = ai === 'claude' ? 'https://claude.ai/new' : 'https://chatgpt.com/';
  const url = base + '?q=' + encodeURIComponent(text);
  // 長すぎる指示文はリンクに入らないので、開くだけにして貼ってもらう
  const prefilled = url.length < 8000;
  const copy = navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject(new Error('no clipboard'));
  window.open(prefilled ? url : base, '_blank');
  copy.then(() => toast(prefilled ? okMsg : 'コピーしました。入力欄に貼って送ってね'))
    .catch(() => toast('コピーできませんでした。「指示文をもう一度コピー」を押してね'));
}

export function JibunView({ onToast, questionDraft, onQuestionDraftConsumed, keyVersion }) {
  const [hasKey, setHasKey] = useState(() => !!readKey());
  const [keyMessage, setKeyMessage] = useState('');
  const [data, setData] = useState(readCache);
  const [offline, setOffline] = useState(false);
  const [status, setStatus] = useState('');
  const [section, setSection] = useState('questions');
  const [filter, setFilter] = useState('すべて');
  const [openId, setOpenId] = useState(null); // 開いている問い
  const [adding, setAdding] = useState(null); // { text } で足すカード
  const [importing, setImporting] = useState(null);
  const [session, setSession] = useState(readSession);
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
      setSession(readSession());
      if (readKey()) load();
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // ホームのメモから「問いにする」で来たら、足すカードを開く
  useEffect(() => {
    if (!questionDraft || !hasKey) return;
    setSection('questions');
    setAdding({ text: questionDraft.text, token: questionDraft.token });
    onQuestionDraftConsumed && onQuestionDraftConsumed();
  }, [questionDraft, hasKey]);

  function submitKey(v) {
    writeKey(v);
    setKeyMessage('');
    setHasKey(true);
    load();
  }

  function patchData(fn) {
    setData((d) => {
      const next = fn(d);
      writeCache(next);
      return next;
    });
  }

  // 問いの変更。stay=true ならカードを閉じない
  async function saveQuestion(q, patch, msg, stay) {
    if (offline) { toast('つながっていないので変更できません'); return false; }
    try {
      const r = await updateQuestion(q.id, patch);
      patchData((d) => {
        let questions = d.questions.map((x) => {
          if (x.id === q.id) return { ...x, ...r };
          // 今日の問い・月の問いは1つだけ
          let y = x;
          if (r && r.status === '今日' && y.status === '今日') y = { ...y, status: y.times_talked ? '話した' : 'ストック' };
          if (r && r.month_of && y.month_of === r.month_of) y = { ...y, month_of: null };
          return y;
        });
        if (patch.status === 'しまう') questions = questions.filter((x) => x.id !== q.id);
        return { ...d, questions };
      });
      if (!stay) setOpenId(null);
      if (msg) toast(msg);
      return true;
    } catch (e) {
      toast('保存できませんでした');
      return false;
    }
  }

  async function add(text, theme, st) {
    if (offline) { toast('つながっていないので足せません'); return false; }
    try {
      const r = await addQuestion(text, theme, st);
      patchData((d) => ({ ...d, questions: [r, ...d.questions] }));
      setAdding(null);
      toast(st === '違和感' ? '違和感メモに入れました' : '問いを足しました');
      return true;
    } catch (e) {
      toast('保存できませんでした');
      return false;
    }
  }

  async function review(id, verdict, statement) {
    if (offline) { toast('つながっていないので変更できません'); return false; }
    try {
      const r = await reviewInsight(id, verdict, statement);
      await load();
      return !!r.ok;
    } catch (e) {
      toast('保存できませんでした');
      return false;
    }
  }

  function start(q, { ai, lens }) {
    const s = { question_id: q.id, question: q.question, ai, lens, at: Date.now() };
    openAi(ai, sessionPrompt(q, dataRef.current, { ai, lens }), toast, '指示文をコピーしました。20分スタート');
    writeSession(s);
    setSession(s);
    setOpenId(null);
    setSection('questions');
    setFilter('すべて');
    document.querySelector('.app-body')?.scrollTo({ top: 0 });
  }

  function reopen() {
    const q = data.questions.find((x) => x.id === session.question_id);
    if (!q) { toast('問いが見つかりません'); return; }
    navigator.clipboard?.writeText(sessionPrompt(q, data, session))
      .then(() => toast('指示文をコピーしました'))
      .catch(() => toast('コピーできませんでした'));
  }

  function wrapWord() {
    navigator.clipboard?.writeText('時間です。まとめて。')
      .then(() => toast('コピーしました。AIに貼って送ってね'))
      .catch(() => toast('AIに「まとめて」と送ってね'));
  }

  function endSession() {
    writeSession(null);
    setSession(null);
  }

  // 「貼る」を押したら、まずクリップボードを見る(記録が入っていればそのまま確認画面)
  async function openImport(q) {
    let text = '';
    try {
      const t = await navigator.clipboard.readText();
      if (hasRecord(t) || (t || '').trim().length >= 150) text = t;
    } catch (e) { /* 読めなければ貼ってもらう */ }
    setOpenId(null);
    setImporting({ text, token: Date.now(), q: q && q.id ? q : null });
  }

  // 保存を押したらすぐ閉じて、裏で反映する。失敗したら貼った文章ごと開き直す
  async function doImport(recs, rawText) {
    if (offline) { toast('つながっていないので保存できません'); return; }
    const fixed = importing && importing.q;
    setImporting(null);
    toast('反映しています…');
    const sum = { saved: 0, new: 0, changed: 0, same: 0, hypo: 0 };
    try {
      for (const rec of recs) {
        const r = await importTalk({ ...rec, source: rec.from_ai ? '貼り付け' : 'ChatGPT' });
        if (r.duplicate) continue;
        sum.saved++;
        sum.new += r.new || 0; sum.changed += r.changed || 0; sum.same += r.same || 0; sum.hypo += r.hypothesis ? 1 : 0;
      }
      if (session && recs.some((r) => r.question_id === session.question_id)) endSession();
      await load();
      if (!sum.saved) { toast('この記録はもう入っています'); return; }
      const parts = [];
      if (sum.hypo) parts.push('仮説を更新');
      if (sum.new) parts.push(`新しい気づき${sum.new}`);
      if (sum.changed) parts.push(`前から変化${sum.changed}`);
      if (sum.same) parts.push(`確かめた${sum.same}`);
      toast('反映しました' + (parts.length ? `(${parts.join('・')})` : ''));
      setSection('review');
      document.querySelector('.app-body')?.scrollTo({ top: 0 });
    } catch (e) {
      toast(e.message === 'bad key' ? '合言葉が違うようです' : '保存できませんでした。もう一度押してね');
      setImporting({ text: rawText, token: Date.now(), q: fixed });
      load();
    }
  }

  function shukatsu(mode) {
    const label = (SHUKATSU_MODES.find((m) => m.key === mode) || {}).label || '';
    openAi('chatgpt', shukatsuPrompt(data.insights, data.talks, mode), toast, `「${label}」の頼み文をコピーしました`);
  }

  async function copyProfile() {
    const theme = filter === 'すべて' ? null : filter;
    try {
      await navigator.clipboard.writeText(profileText(data.insights, theme ? { theme } : { careerOnly: true }));
      toast(theme ? 'じぶん像をコピーしました' : 'じぶん像(キャリア)をコピーしました');
    } catch (e) {
      toast('コピーできませんでした');
    }
  }

  const inFilter = (theme) => filter === 'すべて' || filter === theme;
  const openQ = openId && data ? data.questions.find((q) => q.id === openId) : null;
  const show = (q) => setOpenId(q.id);

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
          ${session && html`<${SessionBar} session=${session} onWrap=${wrapWord} onReopen=${reopen} onEnd=${endSession}
            onPaste=${() => openImport(data && data.questions.find((q) => q.id === session.question_id))} />`}
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
                onOpen=${show}
                onCatch=${(text) => add(text, filter !== 'すべて' ? filter : '日々の気持ち', '違和感')}
                onAdd=${add}
                onPaste=${openImport}
              />`
            : section === 'review' ? html`<${Review}
                data=${data}
                inFilter=${inFilter}
                filter=${filter}
                onOpen=${show}
                onSave=${saveQuestion}
                onReview=${review}
                onPaste=${openImport}
              />`
            : html`<${Profile}
                data=${data}
                filter=${filter}
                onAddGap=${(text) => add(text, 'キャリア')}
                onShukatsu=${shukatsu}
                onCopy=${copyProfile}
              />`}
        </div>
        ${section === 'questions' && data && html`
          <button class="fab" aria-label="問いを足す" onClick=${() => setAdding({ text: '' })}>＋</button>
        `}
      `}
      ${openQ && html`
        <${QuestionSheet}
          key=${openQ.id}
          q=${openQ}
          data=${data}
          onClose=${() => setOpenId(null)}
          onSave=${saveQuestion}
          onStart=${start}
          onPaste=${openImport}
          onOpen=${show}
          onAddQuestion=${(text, theme) => add(text, theme)}
        />
      `}
      ${adding && html`
        <${AddSheet}
          key=${'add-' + (adding.token || '')}
          initialText=${adding.text}
          initialTheme=${filter !== 'すべて' ? filter : '人生観'}
          onClose=${() => setAdding(null)}
          onAdd=${add}
        />
      `}
      ${importing && html`
        <${ImportSheet}
          key=${importing.token}
          initialText=${importing.text}
          insights=${data ? data.insights : []}
          questions=${data ? data.questions : []}
          fixedQuestion=${importing.q}
          onClose=${() => setImporting(null)}
          onImport=${doImport}
        />
      `}
    </div>
  `;
}
