// OFFSTEP NOTES · point d'entrée : état, routage, actions, synchronisation
import * as L from './notes-lib.js';
import * as db from './notes-db.js';
import { openBestStore, createQueue, cacheSet, cacheGet } from './notes-queue.js';
import { viewEditor, viewBadge, viewLines, viewTotal, viewSuggestions, viewComposer, viewSheet, viewPickRows, buildItem, textFor, mergeLines } from './notes-editor.js';
import { viewList, viewDays, viewLogin, viewDenied, viewChoose, viewSettings } from './notes-list.js';
import { viewStock, viewStockTable } from './notes-stock.js';
import { viewSummary } from './notes-summary.js';

export const S = {
  session: null, profile: null, boutiques: [], boutiqueId: null, boutiqueName: '', variants: [], vmap: {}, stockAt: null, live: false, online: true,
  queue: [], days: [], entries: [], sales: [], reversed: [], route: 'boot', day: null, kind: 'sale', text: '', pick: null, client: '', showClient: false,
  exch: null, pickQ: '', sheet: null, q: '', stockQ: '', month: '', summary: null, loginError: '', volatile: false, sync: { lastError: '', lastOk: '' }, toastMsg: '',
};
export const handlers = {};
let queue = null, store = null, unsub = null, timer = null, adding = false, pendingFix = null;
const $ = (id) => document.getElementById(id);
const set = (id, html) => { const e = $(id); if (e) e.innerHTML = html; };
export const onNotification = () => {}; // lot H : notifications push (point d'entrée volontairement vide)

// ---------- Aides ----------
export function toast(msg) { S.toastMsg = msg; set('toast', msg ? `<div class="toast" role="status">${L.esc(msg)}</div>` : ''); if (msg) setTimeout(() => { if (S.toastMsg === msg) toast(''); }, 3500); }
const fail = (e) => toast(L.friendlyError(e));
const remember = (k, v) => (store ? cacheSet(store, k, v).catch(() => {}) : null);
const indexVm = () => { S.vmap = Object.fromEntries(S.variants.map((v) => [v.id, v])); };
const setBoutique = (id) => { S.boutiqueId = id; S.boutiqueName = S.boutiques.find((b) => b.id === id)?.name || L.BOUTIQUES[id] || ''; try { localStorage.setItem('notes.boutique', String(id)); } catch { /* ignoré */ } };
const guard = async (fn) => { try { return await fn(); } catch (e) { fail(e); } };
const ok = () => { S.online = true; };
const ko = () => { S.online = false; };

// ---------- Chargement des données (réseau d'abord, repli sur la dernière copie) ----------
async function load(key, fetcher, apply) {
  try { const d = await fetcher(); apply(d); ok(); remember(key, d); return true; }
  catch { ko(); const c = store ? await cacheGet(store, key) : null; if (c) apply(c.v); return false; }
}
export async function refreshCatalog() {
  await load('catalog', db.loadCatalog, (d) => { S.variants = d; indexVm(); }); const c = store ? await cacheGet(store, 'catalog') : null; S.stockAt = c?.at || Date.now();
}
export async function refreshStock() {
  try {
    const rows = await db.loadStockRows(); const m = new Map();
    for (const r of rows) { if (!m.has(r.variant_id)) m.set(r.variant_id, {}); m.get(r.variant_id)[r.boutique_id] = r.qty; }
    for (const v of S.variants) v.stock = m.get(v.id) || {};
    S.stockAt = Date.now(); ok(); remember('catalog', S.variants);
  } catch { ko(); }
}
export const refreshDays = () => load('days:' + S.boutiqueId, () => db.loadDays(S.boutiqueId, L.addDays(L.beninToday(), -120)), (d) => { S.days = d; });
export const refreshDay = () => load(`entries:${S.boutiqueId}:${S.day}`, () => db.loadEntries(S.boutiqueId, S.day), (d) => { S.entries = d; });
export const refreshSales = () => load('sales:' + S.boutiqueId, () => db.loadSales(S.boutiqueId, L.addDays(L.beninToday(), -30)), (d) => { S.sales = d.sales; S.reversed = d.reversed; });
export async function refreshSummary() {
  const key = `summary:${S.boutiqueId}:${S.month}`; S.summary = null;
  try {
    let s = L.normalizeSummary(await db.monthSummary(S.boutiqueId, S.month));
    if (!s) { const to = L.addMonths(S.month, 1) + '-01'; s = L.summarizeEntries(await db.loadMonthEntries(S.boutiqueId, S.month + '-01', to), S.vmap); }
    S.summary = s; ok(); remember(key, s);
  } catch { ko(); S.summary = (await cacheGet(store, key))?.v || null; }
}

// ---------- Rendu ----------
export function render() {
  const r = S.route; let html = '';
  if (r === 'login') html = viewLogin(S); else if (r === 'denied') html = viewDenied(S); else if (r === 'choose') html = viewChoose(S);
  else if (r === 'list') html = viewList(S); else if (r === 'editor') html = viewEditor(S); else if (r === 'stock') html = viewStock(S);
  else if (r === 'summary') html = viewSummary(S); else if (r === 'settings') html = viewSettings(S); else html = '<p class="empty">Chargement…</p>';
  set('app', html + '<div id="toast"></div>');
}
const soft = () => { if (S.route !== 'editor') return render(); set('badge', viewBadge(S)); set('lines', viewLines(S)); set('total', viewTotal(S)); set('sheet', viewSheet(S)); };
const focusCmp = () => { const c = $('cmp'); if (c?.focus) { c.focus(); try { c.setSelectionRange(c.value.length, c.value.length); } catch { /* ignoré */ } } };
const composer = () => { set('composer', viewComposer(S)); focusCmp(); };
const resetCompose = () => { S.text = ''; S.pick = null; S.exch = null; S.client = ''; S.showClient = false; S.pickQ = ''; };

// ---------- Routage ----------
export async function route() {
  if (!S.session) { S.route = 'login'; return render(); }
  if (!L.canWrite(S.profile)) { S.route = 'denied'; return render(); }
  const adm = S.profile.role !== 'boutique';
  if (adm && !S.boutiqueId) { S.route = 'choose'; return render(); }
  const h = (globalThis.location?.hash || '#/').replace(/^#/, ''); let m;
  S.sheet = null;
  if ((m = h.match(/^\/note\/(\d{4}-\d{2}-\d{2})$/))) {
    const first = S.route !== 'editor' || S.day !== m[1]; S.route = 'editor'; S.day = m[1];
    if (first) { S.kind = L.beninToday() === S.day ? 'sale' : 'exchange'; resetCompose(); S.entries = []; }
    if (pendingFix && L.beninToday() === S.day) { S.kind = pendingFix.k; S.exch = pendingFix.entry; pendingFix = null; }
    render(); await Promise.all([refreshDay(), refreshSales()]); return soft();
  }
  if (h === '/stock') { S.route = 'stock'; render(); await refreshStock(); return render(); }
  if (h === '/resume') { S.route = 'summary'; S.month ||= L.monthKey(L.beninToday()); render(); await refreshSummary(); return render(); }
  if (h === '/reglages') { S.route = 'settings'; return render(); }
  S.route = 'list'; render(); await refreshDays(); render();
}

// ---------- Synchronisation ----------
export async function syncNow() {
  if (!queue) return;
  const res = await queue.flush(); S.queue = await queue.list();
  S.sync.lastError = res.failure || '';
  if (res.offline) ko(); else if (!res.busy) ok();
  if (res.sent) { S.sync.lastOk = L.hhmm(Date.now()); await Promise.all([refreshDays(), refreshDay(), refreshSales(), refreshStock()]); }
  soft();
  return res;
}

// ---------- Connexion et démarrage ----------
async function loadAccount() {
  const uid = S.session.user.id; S.profile = null; S.boutiqueId = null; S.boutiqueName = ''; S.days = []; S.entries = []; S.sales = []; S.reversed = []; S.summary = null;
  try { S.profile = await db.loadProfile(uid); ok(); remember('profile', { uid, p: S.profile }); }
  catch (e) { const c = store ? await cacheGet(store, 'profile') : null; if (c?.v?.uid === uid) { S.profile = c.v.p; ko(); } else throw e; }
  if (!L.canWrite(S.profile)) return;
  await load('boutiques', db.loadBoutiques, (d) => { S.boutiques = d; });
  if (S.profile.role === 'boutique') setBoutique(S.profile.boutique_id);
  else { let id = null; try { id = Number(localStorage.getItem('notes.boutique')) || null; } catch { /* ignoré */ } if (id && S.boutiques.some((b) => b.id === id)) setBoutique(id); }
  await refreshCatalog();
  if (!unsub && S.online && db.subscribeLive) { let t; const later = (f) => { clearTimeout(t); t = setTimeout(f, 400); }; try { unsub = db.subscribeLive({ onStock: () => later(async () => { await refreshStock(); if (S.route === 'stock') render(); else if (S.route === 'editor') composer(); }), onEntries: () => later(async () => { await Promise.all([refreshDay(), refreshDays()]); if (S.route === 'list') render(); else soft(); }) }); S.live = true; } catch { S.live = false; } }
}
export async function start() {
  return guard(async () => { await loadAccount(); await route(); await syncNow(); });
}
export async function init() {
  store = await openBestStore(globalThis.indexedDB); S.volatile = !!store.volatile;
  try { navigator.storage?.persist?.(); } catch { /* ignoré */ }
  queue = createQueue(store, { rpcSync: db.syncLines }); await queue.recover(); S.queue = await queue.list();
  S.online = navigator.onLine !== false; S.session = await db.getSession();
  db.sb.auth.onAuthStateChange?.((ev, s) => { if (ev === 'SIGNED_OUT') { S.session = null; S.profile = null; route(); } else if (ev === 'SIGNED_IN' && !S.session) { S.session = s; start(); } });
  document.addEventListener('click', (e) => { const t = e.target?.closest?.('[data-act]'); if (!t) return; const f = handlers[t.dataset.act]; if (f) { if (t.tagName === 'A') e.preventDefault?.(); guard(() => f(t, e)); } });
  document.addEventListener('input', (e) => { const n = e.target?.dataset?.input; if (n && handlers[n]) guard(() => handlers[n](e.target)); });
  document.addEventListener('change', (e) => { const n = e.target?.dataset?.change; if (n && handlers[n]) guard(() => handlers[n](e.target)); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target?.id === 'cmp') { e.preventDefault(); guard(() => handlers.addLine()); } });
  window.addEventListener('hashchange', () => guard(route));
  window.addEventListener('online', () => { ok(); guard(syncNow); }); window.addEventListener('offline', () => { ko(); soft(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') guard(syncNow); });
  timer = setInterval(() => guard(syncNow), 30000);
  if (S.session) await start(); else { S.route = 'login'; render(); }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// ---------- Actions ----------
Object.assign(handlers, {
  google: () => db.signInGoogle(),
  async login() { S.loginError = ''; try { const d = await db.signInPassword($('email').value.trim(), $('pass').value); S.session = d.session; await start(); } catch (e) { S.loginError = /Invalid login/i.test(e.message) ? 'E-mail ou mot de passe incorrect.' : L.friendlyError(e); render(); } },
  async logout() { try { unsub?.(); unsub = null; S.live = false; await db.signOut(); } catch { /* ignoré */ } S.session = null; S.profile = null; S.boutiqueId = null; S.boutiqueName = ''; S.days = []; S.entries = []; S.route = 'login'; render(); },
  setBoutique: async (el) => { setBoutique(Number(el.dataset.id)); S.days = []; location.hash = '#/'; await route(); },
  setBoutiqueSel: async (el) => { setBoutique(Number(el.value)); S.days = []; render(); },
  goList: () => { location.hash = '#/'; },
  search: (el) => { S.q = el.value; set('days', viewDays(S)); },
  stockQ: (el) => { S.stockQ = el.value; set('stockTable', viewStockTable(S)); },
  pickQ: (el) => { S.pickQ = el.value; set('pickList', viewPickRows(S)); },
  client: (el) => { S.client = el.value; },
  toggleClient: () => { S.showClient = !S.showClient; composer(); },
  openLine: (el) => { S.sheet = el.dataset.key; set('sheet', viewSheet(S)); },
  closeSheet: () => { S.sheet = null; set('sheet', ''); },
  setKind: (el) => { S.kind = el.dataset.k; resetCompose(); composer(); },
  compose: (el) => { S.text = el.value; if (S.pick && !L.norm(S.text).startsWith(L.norm(L.canonical(S.pick)))) S.pick = null; set('sg', viewSuggestions(S)); },
  pick: (el) => { const v = S.vmap[el.dataset.id]; if (!v) return; S.text = L.applySuggestion(S.text, v); S.pick = v; composer(); const c = $('cmp'); if (c) c.value = S.text; focusCmp(); },
  chooseSale: (el) => { const s = S.sales.find((x) => String(x.id) === String(el.dataset.id)); if (!s) return; S.exch = s; S.pick = null; S.text = ''; composer(); },
  async startFix(el) {
    const id = Number(el.dataset.id); const entry = S.sales.find((s) => s.id === id) || S.entries.find((e) => e.id === id); if (!entry) throw new Error('Vente introuvable');
    S.sheet = null; pendingFix = { k: el.dataset.k, entry };
    if (location.hash === '#/note/' + L.beninToday()) { S.kind = pendingFix.k; S.exch = entry; pendingFix = null; S.text = ''; S.pick = null; render(); soft(); } else location.hash = '#/note/' + L.beninToday();
  },
  async addLine() {
    if (adding) return; adding = true;
    try {
      const item = buildItem(S, L.beninToday()); await queue.add(item); S.queue = await queue.list();
      const k = S.kind; resetCompose(); if (k === 'exchange' || k === 'return') { S.kind = k; }
      if (S.day !== L.beninToday()) { location.hash = '#/note/' + L.beninToday(); } else { soft(); composer(); }
    } finally { adding = false; }
    await syncNow();
  },
  async editLocal(el) {
    const it = S.queue.find((x) => x.offline_id === el.dataset.id); if (!it || it.status === 'sending') return;
    if (!(await queue.remove(it.offline_id))) return; S.queue = await queue.list(); S.sheet = null; resetCompose(); S.kind = it.type;
    if (it.type === 'return' || it.type === 'exchange') S.exch = S.sales.find((s) => s.id === it.params.original) || null;
    if (it.type !== 'return') { S.text = textFor(it, S.vmap); S.pick = S.vmap[it.params.variant] || null; S.client = it.params.client || ''; S.showClient = !!S.client; }
    soft(); composer();
  },
  async deleteLocal(el) { await queue.remove(el.dataset.id); S.queue = await queue.list(); S.sheet = null; soft(); },
  async retryLocal(el) { await queue.retry(el.dataset.id); S.queue = await queue.list(); S.sheet = null; await syncNow(); },
  async syncNow() { const r = await syncNow(); toast(r?.offline ? 'Pas de connexion : tes lignes restent en attente.' : r?.errors ? `${r.errors} ligne(s) à corriger` : 'Tout est envoyé'); if (S.route === 'settings') render(); },
  async clearCache() { for (const k of ['catalog', 'boutiques', 'profile']) await store.del('cache', k).catch(() => {}); for (const r of await store.all('cache')) await store.del('cache', r.k); toast('Cache vidé. Tes lignes en attente sont conservées.'); },
  monthPrev: async () => { S.month = L.addMonths(S.month, -1); render(); await refreshSummary(); render(); },
  monthNext: async () => { S.month = L.addMonths(S.month, 1); render(); await refreshSummary(); render(); },
  async shareSummary() {
    if (!S.summary) return; const t = L.summaryText(S.summary, S.boutiqueName, S.month);
    if (navigator.share) { try { await navigator.share({ text: t }); } catch { /* annulé */ } } else { try { await navigator.clipboard.writeText(t); toast('Résumé copié'); } catch { toast('Partage indisponible sur cet appareil'); } }
  },
});
if (typeof document !== 'undefined' && document.documentElement && !globalThis.__NOTES_TEST__) init().catch((e) => { const a = document.getElementById('app'); if (a) a.textContent = 'Erreur de démarrage : ' + L.friendlyError(e); });
