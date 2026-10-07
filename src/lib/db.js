// メモとタグの保存先。
//
// 本体は端末の中(IndexedDB)。メモやタグを書き換えるときは、同じ書き込みの中で
// 「送る箱(outbox)」にも積む。sync.js がそれをクラウドへ送り、クラウド側の変更を
// 取り込む。だから端末のデータが消えても、開けばクラウドから自動で戻る。
//
// - 削除もクラウドには「消した印」として送る(クラウド側では中身を残す)
// - IndexedDB の接続が切れていたら開き直してもう一度だけ試す(iPhone で裏に回したあとに起きる)
// - それでも開けなければメモリ上で動かす(画面は空にならず、クラウドへの保存も続く)

import { createMemoryDB } from './memoryDb.js';

const DB_NAME = 'shikou-memo';
const DB_VERSION = 2;
const OPEN_TIMEOUT_MS = 8000;

const SCHEMA = {
  notes: { keyPath: 'id', indexes: { dateKey: 'dateKey', createdAt: 'createdAt' } },
  tags: { keyPath: 'id', indexes: { order: 'order' } },
  outbox: { keyPath: 'id' },   // クラウドへまだ届いていない変更(id ごとに最新の1件)
  meta: { keyPath: 'key' },    // 同期の進み具合など
};

let dbPromise = null;
let memoryDb = null;
const changeListeners = new Set();

// ---- 接続 ----

function upgrade(db) {
  for (const [name, def] of Object.entries(SCHEMA)) {
    if (db.objectStoreNames.contains(name)) continue;
    const store = db.createObjectStore(name, { keyPath: def.keyPath });
    for (const [indexName, field] of Object.entries(def.indexes || {})) {
      store.createIndex(indexName, field);
    }
  }
}

function openIndexedDB() {
  return new Promise((resolve, reject) => {
    let settled = false;
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      reject(e);
      return;
    }
    // 古いタブが前の版で開いたままだと、更新がいつまでも始まらないことがある
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      const err = new Error('IndexedDB を開けませんでした(時間切れ)');
      err.name = 'TimeoutError';
      reject(err);
    }, OPEN_TIMEOUT_MS);
    req.onupgradeneeded = () => upgrade(req.result);
    req.onsuccess = () => {
      const db = req.result;
      if (settled) {
        db.close();
        return;
      }
      settled = true;
      clearTimeout(timer);
      // 新しい版のアプリが開こうとしたら譲る。iOS が裏で接続を切ったら次に開き直す
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      db.onclose = () => {
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(req.error);
    };
  });
}

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    try {
      return await openIndexedDB();
    } catch (e) {
      if (e && e.name !== 'TimeoutError') {
        try {
          return await openIndexedDB();
        } catch (e2) {
          e = e2;
        }
      }
      console.warn('IndexedDB が使えないため、メモリ上で動かします', e);
      if (!memoryDb) memoryDb = createMemoryDB(SCHEMA);
      return memoryDb;
    }
  })();
  return dbPromise;
}

function resetConnection(db) {
  try { db.close(); } catch (e) { /* もう閉じている */ }
  dbPromise = null;
}

// 端末に保存できず、メモリ上で動いているか(設定画面の表示用)
export function isUsingMemory() {
  return !!memoryDb;
}

// body(stores) は同じトランザクションの中でリクエストを出す。
// 戻り値が関数なら、完了後にそれを呼んだ値を返す(読み込んだ結果を返すため)
async function run(storeNames, mode, body) {
  const names = [].concat(storeNames);
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const db = await openDB();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(names, mode);
        const stores = {};
        for (const n of names) stores[n] = tx.objectStore(n);
        let finish;
        tx.oncomplete = () => {
          try {
            resolve(typeof finish === 'function' ? finish() : finish);
          } catch (e) {
            reject(e);
          }
        };
        tx.onerror = () => reject(tx.error || new Error('保存に失敗しました'));
        tx.onabort = () => reject(tx.error || new Error('保存が中断されました'));
        finish = body(stores);
      });
    } catch (e) {
      lastError = e;
      if (db.isMemory) break;
      resetConnection(db);
    }
  }
  throw lastError;
}

function readAll(storeName) {
  return run(storeName, 'readonly', (s) => {
    const r = s[storeName].getAll();
    return () => r.result || [];
  });
}

// ---- 変更の知らせ(sync.js が聞いて、少し待ってからクラウドへ送る) ----

export function onLocalChange(fn) {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}

function emitLocalChange() {
  for (const fn of changeListeners) {
    try { fn(); } catch (e) { /* 知らせる側は止めない */ }
  }
}

// ---- 時刻とクラウドへ送る形 ----

function toMs(iso) {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

function itemTime(item) {
  return toMs(item.updatedAt || item.createdAt);
}

// 前の版より必ず新しい時刻(端末の時計が戻っていても、編集が古い扱いにならないように)
function laterThan(prevIso) {
  return new Date(Math.max(Date.now(), toMs(prevIso) + 1)).toISOString();
}

function changeFor(kind, item, deleted = false, at = null) {
  return {
    id: item.id,
    kind,
    deleted,
    updatedAt: at || item.updatedAt || item.createdAt || new Date(0).toISOString(),
    data: item,
  };
}

// ---- notes ----

export async function addNote(note) {
  const saved = { ...note, updatedAt: note.updatedAt || note.createdAt || new Date().toISOString() };
  await run(['notes', 'outbox'], 'readwrite', (s) => {
    s.notes.put(saved);
    s.outbox.put(changeFor('note', saved));
  });
  emitLocalChange();
  return saved;
}

export async function updateNote(note) {
  const saved = await run(['notes', 'outbox'], 'readwrite', (s) => {
    let result;
    s.notes.get(note.id).onsuccess = (e) => {
      const prev = e.target.result;
      result = { ...note, updatedAt: laterThan(prev ? prev.updatedAt : null) };
      s.notes.put(result);
      s.outbox.put(changeFor('note', result));
    };
    return () => result;
  });
  emitLocalChange();
  return saved;
}

export async function deleteNote(id) {
  await run(['notes', 'outbox'], 'readwrite', (s) => {
    s.notes.get(id).onsuccess = (e) => {
      const prev = e.target.result;
      if (!prev) return;
      s.notes.delete(id);
      // クラウドには「消した印」と最後の中身を送る(クラウド側では中身を残す)
      s.outbox.put(changeFor('note', prev, true, laterThan(prev.updatedAt)));
    };
  });
  emitLocalChange();
}

export async function getNotesByDateKey(dateKey) {
  const notes = await run('notes', 'readonly', (s) => {
    const r = s.notes.index('dateKey').getAll(dateKey);
    return () => r.result || [];
  });
  return notes.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

export function getAllNotes() {
  return readAll('notes');
}

export function getNoteById(id) {
  return run('notes', 'readonly', (s) => {
    const r = s.notes.get(id);
    return () => r.result;
  });
}

export async function getDateKeysWithNotes() {
  const all = await getAllNotes();
  return new Set(all.map((n) => n.dateKey));
}

// ---- tags ----

export async function addTag(tag) {
  const now = new Date().toISOString();
  const saved = { ...tag, createdAt: tag.createdAt || now, updatedAt: tag.updatedAt || tag.createdAt || now };
  await run(['tags', 'outbox'], 'readwrite', (s) => {
    s.tags.put(saved);
    s.outbox.put(changeFor('tag', saved));
  });
  emitLocalChange();
  return saved;
}

export async function updateTag(tag) {
  const saved = await run(['tags', 'outbox'], 'readwrite', (s) => {
    let result;
    s.tags.get(tag.id).onsuccess = (e) => {
      const prev = e.target.result;
      result = { ...tag, updatedAt: laterThan(prev ? prev.updatedAt || prev.createdAt : null) };
      s.tags.put(result);
      s.outbox.put(changeFor('tag', result));
    };
    return () => result;
  });
  emitLocalChange();
  return saved;
}

export async function deleteTag(id) {
  await run(['tags', 'outbox'], 'readwrite', (s) => {
    s.tags.get(id).onsuccess = (e) => {
      const prev = e.target.result;
      if (!prev) return;
      s.tags.delete(id);
      s.outbox.put(changeFor('tag', prev, true, laterThan(prev.updatedAt || prev.createdAt)));
    };
  });
  emitLocalChange();
}

export async function getAllTags() {
  const tags = await readAll('tags');
  return tags.sort((a, b) => a.order - b.order);
}

// ---- 書き出し / 読み込み ----

export async function exportAll() {
  const [notes, tags] = await Promise.all([getAllNotes(), getAllTags()]);
  return { version: 1, exportedAt: new Date().toISOString(), notes, tags };
}

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function cleanNote(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.id !== 'string' || !raw.id) return null;
  if (typeof raw.body !== 'string' || !raw.body.trim()) return null;
  if (typeof raw.dateKey !== 'string' || !DATE_KEY_RE.test(raw.dateKey)) return null;
  if (!toMs(raw.createdAt)) return null;
  return {
    ...raw,
    tagIds: Array.isArray(raw.tagIds) ? raw.tagIds.filter((t) => typeof t === 'string') : [],
    updatedAt: raw.updatedAt || raw.createdAt,
  };
}

function cleanTag(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.id !== 'string' || !raw.id) return null;
  if (typeof raw.name !== 'string' || !raw.name.trim()) return null;
  return {
    ...raw,
    colorKey: typeof raw.colorKey === 'string' ? raw.colorKey : 'gray',
    order: typeof raw.order === 'number' ? raw.order : 999,
  };
}

// 書き出したファイルを今のメモに「足す」。今あるメモは消さない。
// 同じメモが両方にあれば新しい方を残す。名前が同じタグは今あるタグにまとめる。
export async function importMerge({ notes, tags }) {
  const result = { added: 0, updated: 0, tagsAdded: 0, skipped: 0 };
  await run(['notes', 'tags', 'outbox'], 'readwrite', (s) => {
    const got = {};
    let waiting = 2;
    s.notes.getAll().onsuccess = (e) => { got.notes = e.target.result || []; if (--waiting === 0) merge(); };
    s.tags.getAll().onsuccess = (e) => { got.tags = e.target.result || []; if (--waiting === 0) merge(); };

    function merge() {
      const tagById = new Map(got.tags.map((t) => [t.id, t]));
      const tagByName = new Map(got.tags.map((t) => [t.name, t]));
      const tagIdMap = new Map();   // ファイル側のタグid → 実際に使うタグid
      let nextOrder = got.tags.reduce((m, t) => Math.max(m, typeof t.order === 'number' ? t.order : 0), -1) + 1;

      for (const raw of Array.isArray(tags) ? tags : []) {
        const tag = cleanTag(raw);
        if (!tag) { result.skipped++; continue; }
        const same = tagById.get(tag.id);
        if (same) {
          tagIdMap.set(tag.id, tag.id);
          if (itemTime(tag) > itemTime(same)) {
            s.tags.put(tag);
            s.outbox.put(changeFor('tag', tag));
          }
          continue;
        }
        const sameName = tagByName.get(tag.name);
        if (sameName) {
          tagIdMap.set(tag.id, sameName.id);
          continue;
        }
        const added = {
          ...tag,
          order: nextOrder++,
          createdAt: tag.createdAt || new Date().toISOString(),
          updatedAt: tag.updatedAt || tag.createdAt || new Date().toISOString(),
        };
        s.tags.put(added);
        s.outbox.put(changeFor('tag', added));
        tagById.set(added.id, added);
        tagByName.set(added.name, added);
        tagIdMap.set(added.id, added.id);
        result.tagsAdded++;
      }

      const noteById = new Map(got.notes.map((n) => [n.id, n]));
      for (const raw of Array.isArray(notes) ? notes : []) {
        const cleaned = cleanNote(raw);
        if (!cleaned) { result.skipped++; continue; }
        const note = {
          ...cleaned,
          tagIds: [...new Set(cleaned.tagIds.map((t) => tagIdMap.get(t) || t).filter((t) => tagById.has(t)))],
        };
        const cur = noteById.get(note.id);
        if (cur && itemTime(cur) >= itemTime(note)) continue;
        s.notes.put(note);
        s.outbox.put(changeFor('note', note));
        if (cur) result.updated++;
        else result.added++;
      }
    }
  });
  emitLocalChange();
  return result;
}

// ---- 同期(sync.js から使う) ----

export async function getMeta(key) {
  return run('meta', 'readonly', (s) => {
    const r = s.meta.get(key);
    return () => (r.result ? r.result.value : undefined);
  });
}

export async function setMeta(key, value) {
  await run('meta', 'readwrite', (s) => {
    s.meta.put({ key, value });
  });
}

export function getOutbox() {
  return readAll('outbox');
}

export function countOutbox() {
  return run('outbox', 'readonly', (s) => {
    const r = s.outbox.count();
    return () => r.result || 0;
  });
}

export function countNotes() {
  return run('notes', 'readonly', (s) => {
    const r = s.notes.count();
    return () => r.result || 0;
  });
}

// クラウドとのやりとりの結果を端末に反映する(1つの書き込みの中で行う)。
// - sent: 送り終えた変更。送ったあとに書き換えられていなければ箱から出す
// - records: クラウドで変わったもの。端末より新しければ取り込む
// - full: クラウドの全部が来たとき。端末にしか無いものを送る箱に入れる(取りこぼしの保険)
export async function applyRemote({ sent = [], records = null, rev = null, full = false }) {
  const out = { changed: 0, notesAdded: 0, enqueued: 0, wasEmpty: false };
  await run(['notes', 'tags', 'outbox', 'meta'], 'readwrite', (s) => {
    const got = {};
    let waiting = 3;
    const ready = () => { if (--waiting === 0) merge(); };
    s.notes.getAll().onsuccess = (e) => { got.notes = e.target.result || []; ready(); };
    s.tags.getAll().onsuccess = (e) => { got.tags = e.target.result || []; ready(); };
    s.outbox.getAll().onsuccess = (e) => { got.outbox = e.target.result || []; ready(); };

    function merge() {
      out.wasEmpty = got.notes.length === 0;
      const local = new Map();
      for (const n of got.notes) local.set(n.id, { kind: 'note', item: n });
      for (const t of got.tags) local.set(t.id, { kind: 'tag', item: t });
      const pending = new Map(got.outbox.map((c) => [c.id, c]));

      for (const c of sent) {
        const p = pending.get(c.id);
        if (p && p.updatedAt === c.updatedAt && !!p.deleted === !!c.deleted) {
          s.outbox.delete(c.id);
          pending.delete(c.id);
        }
      }

      if (!records) return;
      const seen = new Set();
      for (const r of records) {
        if (!r || typeof r.id !== 'string' || (r.kind !== 'note' && r.kind !== 'tag')) continue;
        seen.add(r.id);
        const remoteTime = toMs(r.updatedAt);
        const l = local.get(r.id);
        if (l && l.kind !== r.kind) continue;
        const p = pending.get(r.id);
        const localTime = Math.max(l ? itemTime(l.item) : -Infinity, p ? toMs(p.updatedAt) : -Infinity);
        const store = r.kind === 'note' ? s.notes : s.tags;

        if (remoteTime > localTime) {
          if (r.deleted) {
            if (l) {
              store.delete(r.id);
              out.changed++;
            }
          } else if (r.data && typeof r.data === 'object') {
            store.put({ ...r.data, id: r.id, updatedAt: new Date(remoteTime).toISOString() });
            out.changed++;
            if (r.kind === 'note' && !l) out.notesAdded++;
          }
          if (p) s.outbox.delete(r.id);
        } else if (remoteTime < localTime && l && !p) {
          // 端末の方が新しいのに送る箱に入っていない → 送り直す
          s.outbox.put(changeFor(l.kind, l.item));
          out.enqueued++;
        }
      }

      if (full) {
        for (const [id, l] of local) {
          if (!seen.has(id) && !pending.has(id)) {
            s.outbox.put(changeFor(l.kind, l.item));
            out.enqueued++;
          }
        }
        s.meta.put({ key: 'lastFullAt', value: Date.now() });
      }
      if (rev != null) s.meta.put({ key: 'lastRev', value: rev });
    }
    return () => out;
  });
  return out;
}
