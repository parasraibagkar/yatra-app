// Small IndexedDB wrapper. Every synced record carries id, updatedAt, by and deleted.
const DB_NAME = 'yatra-app';
const DB_VERSION = 2;
// receipts = synced details of each receipt picture; receiptFiles = the pictures themselves, kept on this phone.
export const STORES = ['stops', 'expenses', 'photos', 'receipts', 'receiptFiles'];

let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of STORES) {
          if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function result(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAll(store) {
  const db = await open();
  return result(db.transaction(store).objectStore(store).getAll());
}

export async function get(store, id) {
  const db = await open();
  return result(db.transaction(store).objectStore(store).get(id));
}

// Writes records exactly as given (used by sync merge).
export async function putMany(store, records) {
  if (!records.length) return;
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  for (const r of records) os.put(r);
  return done(tx);
}

export async function hardDelete(store, id) {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(id);
  return done(tx);
}

export async function getMeta(key, fallback = null) {
  const db = await open();
  const v = await result(db.transaction('meta').objectStore('meta').get(key));
  return v === undefined ? fallback : v;
}

export async function setMeta(key, value) {
  const db = await open();
  const tx = db.transaction('meta', 'readwrite');
  tx.objectStore('meta').put(value, key);
  return done(tx);
}

let deviceName = '';
let changeListener = null;
// Called after every local edit to stops or expenses (not after sync merges).
export function onLocalChange(fn) { changeListener = fn; }
const notify = (store) => { if (!['photos', 'receiptFiles'].includes(store) && changeListener) changeListener(); };
export function setDeviceName(name) { deviceName = name; }

// Local edit: stamps the record so it wins over older copies on other phones.
export async function save(store, record) {
  record.updatedAt = Date.now();
  record.by = deviceName;
  if (!record.createdAt) record.createdAt = record.updatedAt;
  await putMany(store, [record]);
  notify(store);
  return record;
}

export async function saveMany(store, records) {
  const now = Date.now();
  for (const r of records) { r.updatedAt = now; r.by = deviceName; }
  await putMany(store, records);
  if (records.length) notify(store);
}

// Deletes are kept as tombstones so they sync to other phones.
export async function softDelete(store, record) {
  record.deleted = true;
  return save(store, record);
}

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}
