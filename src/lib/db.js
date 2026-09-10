import { scheduleCloudBackup, setExporter } from './cloudBackup.js';

const DB_NAME = 'shikou-memo';
const DB_VERSION = 1;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('notes')) {
        const notes = db.createObjectStore('notes', { keyPath: 'id' });
        notes.createIndex('dateKey', 'dateKey');
        notes.createIndex('createdAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains('tags')) {
        const tags = db.createObjectStore('tags', { keyPath: 'id' });
        tags.createIndex('order', 'order');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode) {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ---- notes ----

export async function addNote(note) {
  const store = await tx('notes', 'readwrite');
  await wrap(store.add(note));
  scheduleCloudBackup();
  return note;
}

export async function updateNote(note) {
  const store = await tx('notes', 'readwrite');
  await wrap(store.put(note));
  scheduleCloudBackup();
  return note;
}

export async function deleteNote(id) {
  const store = await tx('notes', 'readwrite');
  await wrap(store.delete(id));
  scheduleCloudBackup();
}

export async function getNotesByDateKey(dateKey) {
  const store = await tx('notes', 'readonly');
  const index = store.index('dateKey');
  const notes = await wrap(index.getAll(dateKey));
  return notes.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

export async function getAllNotes() {
  const store = await tx('notes', 'readonly');
  return wrap(store.getAll());
}

export async function getNoteById(id) {
  const store = await tx('notes', 'readonly');
  return wrap(store.get(id));
}

export async function getDateKeysWithNotes() {
  const all = await getAllNotes();
  return new Set(all.map((n) => n.dateKey));
}

// ---- tags ----

export async function addTag(tag) {
  const store = await tx('tags', 'readwrite');
  await wrap(store.add(tag));
  scheduleCloudBackup();
  return tag;
}

export async function updateTag(tag) {
  const store = await tx('tags', 'readwrite');
  await wrap(store.put(tag));
  scheduleCloudBackup();
  return tag;
}

export async function deleteTag(id) {
  const store = await tx('tags', 'readwrite');
  await wrap(store.delete(id));
  scheduleCloudBackup();
}

export async function getAllTags() {
  const store = await tx('tags', 'readonly');
  const tags = await wrap(store.getAll());
  return tags.sort((a, b) => a.order - b.order);
}

// ---- バックアップ書き出し/読み込み ----

export async function exportAll() {
  const [notes, tags] = await Promise.all([getAllNotes(), getAllTags()]);
  return { version: DB_VERSION, exportedAt: new Date().toISOString(), notes, tags };
}

export async function replaceAll({ notes, tags }) {
  const db = await openDB();
  const transaction = db.transaction(['notes', 'tags'], 'readwrite');
  const notesStore = transaction.objectStore('notes');
  const tagsStore = transaction.objectStore('tags');
  await wrap(notesStore.clear());
  await wrap(tagsStore.clear());
  for (const note of notes || []) {
    notesStore.add(note);
  }
  for (const tag of tags || []) {
    tagsStore.add(tag);
  }
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => { scheduleCloudBackup(); resolve(); };
    transaction.onerror = () => reject(transaction.error);
  });
}

// クラウド控えの書き出し元としてexportAllを登録する。
// (cloudBackup.js から db.js を import すると循環参照になるため、
//  ここで関数そのものを渡している)
setExporter(exportAll);
