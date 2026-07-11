// IndexedDB 存储层：翻译记忆库 / 语料库 / 引擎配置 / 设置
const DB_NAME = 'linguadesk';
const DB_VERSION = 1;

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('memory')) {
        const s = db.createObjectStore('memory', { keyPath: 'id' });
        s.createIndex('source', 'source', { unique: false });
      }
      if (!db.objectStoreNames.contains('corpus')) {
        db.createObjectStore('corpus', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('engines')) {
        db.createObjectStore('engines', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('asr')) {
        db.createObjectStore('asr', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function store(db, name, mode) {
  return db.transaction(name, mode).objectStore(name);
}

async function _getAll(name) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const r = store(db, name, 'readonly').getAll();
    r.onsuccess = () => res(r.result || []);
    r.onerror = () => rej(r.error);
  });
}
async function _put(name, val) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const r = store(db, name, 'readwrite').put(val);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}
async function _del(name, id) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const r = store(db, name, 'readwrite').delete(id);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}
async function _clear(name) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const r = store(db, name, 'readwrite').clear();
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---------- 翻译记忆库 ----------
export const addMemory = (rec) => _put('memory', { id: uid(), createdAt: Date.now(), ...rec });
export const getAllMemory = () => _getAll('memory');
export const delMemory = (id) => _del('memory', id);
export const clearMemory = () => _clear('memory');

// ---------- 语料库 ----------
export const addCorpus = (rec) => _put('corpus', { id: uid(), createdAt: Date.now(), ...rec });
export const getAllCorpus = () => _getAll('corpus');
export const delCorpus = (id) => _del('corpus', id);

// ---------- 翻译引擎 ----------
export const getEngines = () => _getAll('engines');
export const saveEngine = (e) => _put('engines', e);
export const delEngine = (id) => _del('engines', id);

// ---------- ASR 引擎 ----------
export const getAsr = () => _getAll('asr');
export const saveAsr = (a) => _put('asr', a);
export const delAsr = (id) => _del('asr', id);

// ---------- 设置 ----------
export async function getSetting(key, fallback = null) {
  const db = await openDB();
  return new Promise((res) => {
    const r = store(db, 'settings', 'readonly').get(key);
    r.onsuccess = () => res(r.result ? r.result.value : fallback);
    r.onerror = () => res(fallback);
  });
}
export async function setSetting(key, value) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const r = store(db, 'settings', 'readwrite').put({ key, value });
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}
