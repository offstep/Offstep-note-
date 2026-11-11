// OFFSTEP NOTES · file d'attente locale (IndexedDB) + synchronisation.
// Règle d'or : une ligne est ÉCRITE dans la file AVANT tout appel réseau ; elle n'en sort que si le serveur dit « ok ».
import { uuid, friendlyError } from './notes-lib.js';

const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const finish = (t) => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });

// Stockage réel (IndexedDB). Deux tables : queue (clé offline_id) et cache (clé k).
export async function idbStore(idb = globalThis.indexedDB, name = 'offstep-notes') {
  if (!idb) throw new Error('Stockage local indisponible');
  const db = await new Promise((res, rej) => {
    const o = idb.open(name, 1);
    o.onupgradeneeded = () => { const d = o.result; d.createObjectStore('queue', { keyPath: 'offline_id' }); d.createObjectStore('cache', { keyPath: 'k' }); };
    o.onsuccess = () => res(o.result); o.onerror = () => rej(o.error);
  });
  const write = (tbl, fn) => { const t = db.transaction(tbl, 'readwrite'); fn(t.objectStore(tbl)); return finish(t); };
  return {
    volatile: false,
    all: (tbl) => req(db.transaction(tbl, 'readonly').objectStore(tbl).getAll()),
    get: (tbl, k) => req(db.transaction(tbl, 'readonly').objectStore(tbl).get(k)),
    put: (tbl, v) => write(tbl, (s) => s.put(v)),
    del: (tbl, k) => write(tbl, (s) => s.delete(k)),
  };
}
// Repli si le stockage local est refusé : tout est perdu à la fermeture → l'écran doit avertir
export function memStore() {
  const T = { queue: new Map(), cache: new Map() }; const key = (tbl) => (tbl === 'queue' ? 'offline_id' : 'k');
  return { volatile: true, all: async (t) => [...T[t].values()], get: async (t, k) => T[t].get(k), put: async (t, v) => { T[t].set(v[key(t)], structuredClone(v)); }, del: async (t, k) => { T[t].delete(k); } };
}
export async function openBestStore(idb) { try { return await idbStore(idb); } catch { return memStore(); } }

export const cacheSet = (store, k, v) => store.put('cache', { k, v, at: Date.now() });
export const cacheGet = async (store, k) => (await store.get('cache', k)) || null;

// File d'attente. rpcSync(lines) doit renvoyer [{offline_id, ok, error}] ou lever une erreur réseau.
export function createQueue(store, { rpcSync, onChange = () => {}, batch = 20 } = {}) {
  let seq = 0, busy = false; const sorted = (a) => a.sort((x, y) => x.created_at - y.created_at || x.seq - y.seq);
  const q = {
    store, get volatile() { return !!store.volatile; },
    async list() { return sorted(await store.all('queue')); },
    async counts() { const l = await q.list(); return { total: l.length, pending: l.filter((i) => i.status === 'pending' || i.status === 'sending').length, error: l.filter((i) => i.status === 'error').length }; },
    // Écrit d'abord, renvoie la ligne tout de suite (affichage optimiste)
    async add({ type, params, boutique, day, meta = null }) {
      const item = { offline_id: uuid(), type, params, boutique, day, meta, created_at: Date.now(), seq: ++seq, status: 'pending', error: null };
      await store.put('queue', item); onChange(); return item;
    },
    // Une ligne déjà envoyée n'existe plus dans la file : seules les lignes locales se modifient ou se suppriment
    async remove(id) { const it = await store.get('queue', id); if (!it || it.status === 'sending') return false; await store.del('queue', id); onChange(); return true; },
    async retry(id) { const it = await store.get('queue', id); if (!it) return; it.status = 'pending'; it.error = null; await store.put('queue', it); onChange(); },
    // À l'ouverture : une ligne restée « en envoi » (application fermée en route) repart ; le serveur ignore les doublons
    async recover() { for (const it of await q.list()) { if (it.status === 'sending') { it.status = 'pending'; await store.put('queue', it); } seq = Math.max(seq, it.seq || 0); } },
    async flush() {
      if (busy) return { busy: true };
      busy = true; const out = { sent: 0, errors: 0, offline: false, failure: null };
      try {
        for (;;) {
          const todo = (await q.list()).filter((i) => i.status === 'pending').slice(0, batch);
          if (!todo.length) break;
          for (const it of todo) { it.status = 'sending'; await store.put('queue', it); }
          let res;
          try { res = await rpcSync(todo.map((i) => ({ type: i.type, offline_id: i.offline_id, boutique: i.boutique, day: i.day, ...i.params }))); }
          catch (e) { for (const it of todo) { it.status = 'pending'; await store.put('queue', it); } out.offline = true; out.failure = friendlyError(e); break; }
          const by = new Map((res || []).map((r) => [r.offline_id, r]));
          for (const it of todo) {
            const r = by.get(it.offline_id);
            if (r?.ok) { await store.del('queue', it.offline_id); out.sent++; }
            else if (r) { it.status = 'error'; it.error = friendlyError(r.error); await store.put('queue', it); out.errors++; }
            else { it.status = 'pending'; await store.put('queue', it); }
          }
          if (by.size === 0) { out.offline = true; break; }
        }
      } finally { busy = false; onChange(); }
      return out;
    },
  };
  return q;
}
