// Sync between phones. Rule: for each record, the copy with the newest updatedAt wins.
// Deletes are tombstones, so they spread like any other edit.
// Two ways to move data: a sync file (shared over WhatsApp etc.) or Supabase on a button tap.
// Photos stay on each phone; only stops and expenses sync.
import * as db from './db.js';

export const SYNC_STORES = ['stops', 'expenses'];

function newer(a, b) {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt;
  return (a.by || '') > (b.by || '');
}

export async function merge(store, incoming) {
  const local = new Map((await db.getAll(store)).map((r) => [r.id, r]));
  const changed = incoming.filter((r) => r && r.id && (!local.has(r.id) || newer(r, local.get(r.id))));
  await db.putMany(store, changed);
  return changed.length;
}

export async function buildSyncFile(deviceName) {
  const data = { app: 'yatra-app', version: 1, from: deviceName, exportedAt: Date.now() };
  for (const s of SYNC_STORES) data[s] = await db.getAll(s);
  const name = `yatra-sync-${deviceName.replace(/\W+/g, '-') || 'phone'}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}.json`;
  return new File([JSON.stringify(data)], name, { type: 'application/json' });
}

export async function importSyncFile(file) {
  const data = JSON.parse(await file.text());
  if (data.app !== 'yatra-app') throw new Error('This is not a Yatra sync file.');
  const counts = {};
  for (const s of SYNC_STORES) counts[s] = await merge(s, Array.isArray(data[s]) ? data[s] : []);
  return { from: data.from, ...counts };
}

// Supabase: table "records" plus the upsert_records function from supabase/setup.sql.
export async function cloudSync({ url, key, trip }) {
  if (!url || !key || !trip) throw new Error('Add the Supabase URL, key and trip code first.');
  const base = url.replace(/\/+$/, '') + '/rest/v1';
  const headers = { apikey: key, 'Content-Type': 'application/json' };
  // Legacy anon keys are JWTs and also go in Authorization; new sb_publishable_ keys must not.
  if (key.startsWith('eyJ')) headers.Authorization = 'Bearer ' + key;

  // 1. Pull everything for this trip and merge it in.
  const res = await fetch(`${base}/records?trip=eq.${encodeURIComponent(trip)}&select=kind,data&limit=10000`, { headers });
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${await res.text()}`);
  const rows = await res.json();
  const pulled = {};
  for (const s of SYNC_STORES) {
    pulled[s] = await merge(s, rows.filter((r) => r.kind === s).map((r) => r.data));
  }

  // 2. Push every local record; the server keeps whichever copy is newer.
  const out = [];
  for (const s of SYNC_STORES) {
    for (const r of await db.getAll(s)) {
      out.push({ id: r.id, kind: s, data: r, updated_at: r.updatedAt });
    }
  }
  const push = await fetch(`${base}/rpc/upsert_records`, {
    method: 'POST', headers, body: JSON.stringify({ p_trip: trip, p_rows: out }),
  });
  if (!push.ok) throw new Error(`Upload failed (${push.status}): ${await push.text()}`);
  const pushed = await push.json();
  return { pulled, pushed: typeof pushed === 'number' ? pushed : 0 };
}
