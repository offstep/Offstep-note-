// OFFSTEP NOTES · fonctions pures (sans réseau, sans écran). Testées dans tests/test_lib.mjs.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fcfa = (n) => (Math.round(Number(n) || 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ').replace(/^-/, '−') + ' FCFA';
export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export const uuid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); }));

export const KINDS = { sale: 'Vente', reception: 'Reçu', transfer: 'Transfert', exchange: 'Échange', return: 'Retour' };
export const CHANNELS = { boutique: 'Boutique', telephone: 'Téléphone', whatsapp: 'WhatsApp', offstep: 'OFFSTEP' };
export const PAYS = { especes: 'Espèces', momo: 'Mobile Money', a_recevoir: 'À recevoir' };
export const BOUTIQUES = { 1: 'Ancien Missèbo', 2: 'PK3 — BT 105', 3: 'PK3' };
const DEST = { missebo: 1, ancien: 1, ancienmissebo: 1, bt105: 2, bt: 2, pk3bt105: 2, pk3bt: 2, pk3: 3 };
const PAYW = { esp: 'especes', espece: 'especes', especes: 'especes', momo: 'momo', mm: 'momo', recu: 'a_recevoir', recus: 'a_recevoir', recevoir: 'a_recevoir' };
const CHANW = { tel: 'telephone', telephone: 'telephone', wa: 'whatsapp', whatsapp: 'whatsapp', boutique: 'boutique' };

// ---------- Dates (Bénin = UTC+1, sans heure d'été) ----------
export const beninToday = (now = new Date()) => new Date(now.getTime() + 3600e3).toISOString().slice(0, 10);
export function addDays(iso, n) { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
export const diffDays = (a, b) => Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 864e5);
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export function longDate(iso) { const d = new Date(iso + 'T00:00:00Z'); return `${JOURS[d.getUTCDay()]} ${d.getUTCDate() === 1 ? '1er' : d.getUTCDate()} ${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; }
export function shortDate(iso) { const d = new Date(iso + 'T00:00:00Z'); return `${JOURS[d.getUTCDay()].slice(0, 3)}. ${d.getUTCDate()} ${MOIS[d.getUTCMonth()].slice(0, 4)}.`; }
export const monthKey = (iso) => iso.slice(0, 7);
export const monthLabel = (key) => { const [y, m] = key.split('-'); return `${MOIS[+m - 1]} ${y}`; };
export const addMonths = (key, n) => { const [y, m] = key.split('-').map(Number); const t = y * 12 + (m - 1) + n; return `${Math.floor(t / 12)}-${String(t % 12 + 1).padStart(2, '0')}`; };
export const hhmm = (ts) => { const d = new Date(new Date(ts).getTime() + 3600e3); return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(11, 16); };

// Regroupe les jours : « Aujourd'hui », « 7 derniers jours », puis un groupe par mois
export function groupDays(days, today) {
  const g = []; const put = (label, row) => { let x = g.find((k) => k.label === label); if (!x) g.push(x = { label, rows: [] }); x.rows.push(row); };
  for (const r of [...days].sort((a, b) => (a.day < b.day ? 1 : -1))) {
    const n = diffDays(today, r.day);
    if (n === 0) put("Aujourd'hui", r); else if (n > 0 && n <= 7) put('7 derniers jours', r); else put(monthLabel(monthKey(r.day)), r);
  }
  return g;
}

// ---------- Saisie d'une ligne ----------
// parseLine('air force noir 41 x2 15000 momo', { kind:'sale', canonical?:'Air Force 1 Noir 41' })
export function parseLine(text, opts = {}) {
  const kind = opts.kind || 'sale';
  const out = { kind, words: [], qty: null, price: null, pay: null, channel: null, dest: null, errors: [], picked: false };
  let src = String(text ?? '').trim();
  if (opts.canonical && norm(src).startsWith(norm(opts.canonical))) { src = src.slice(opts.canonical.length).trim(); out.picked = true; out.words = norm(opts.canonical).split(/\s+/); }
  const err = (m) => { if (!out.errors.includes(m)) out.errors.push(m); };
  const t = src.replace(/>/g, ' > ').split(/\s+/).filter(Boolean);
  for (let i = 0; i < t.length; i++) {
    const raw = t[i]; const w = norm(raw).replace(',', '.'); let m;
    if (raw === '>') {
      if (kind !== 'transfer') { err('Le signe > sert aux transferts'); continue; }
      let a = norm(t[i + 1] || '').replace(/[^a-z0-9]/g, '');
      if (!a) { err('Boutique de destination manquante'); continue; }
      i++;
      if (a === 'bt' && /^-?105$/.test(norm(t[i + 1] || ''))) { a = 'bt105'; i++; }
      if (DEST[a]) out.dest = DEST[a]; else err('Boutique inconnue : ' + t[i]);
    } else if ((m = w.match(/^[x×*](\d+)$/)) || (m = w.match(/^(\d+)[x×]$/))) {
      if (out.qty !== null) err('Quantité en double'); else if (+m[1] < 1) err('Quantité invalide'); else out.qty = +m[1];
    } else if ((w === 'x' || w === '×') && /^\d+$/.test(t[i + 1] || '')) {
      i++; if (out.qty !== null) err('Quantité en double'); else if (+t[i] < 1) err('Quantité invalide'); else out.qty = +t[i];
    } else if ((m = w.match(/^(\d{4,})(f|fcfa|cfa)?$/)) || (m = w.match(/^(\d{1,3})\.(\d{3})$/)) && (m = [0, m[1] + m[2]])) {
      if (kind !== 'sale') err('Le prix ne sert que pour une vente'); else if (out.price !== null) err('Prix en double'); else out.price = +m[1];
    } else if (PAYW[w]) {
      if (kind !== 'sale') err('Le paiement ne sert que pour une vente'); else if (out.pay && out.pay !== PAYW[w]) err('Deux modes de paiement'); else out.pay = PAYW[w];
    } else if (CHANW[w]) {
      if (kind !== 'sale') err("L'origine ne sert que pour une vente"); else if (out.channel && out.channel !== CHANW[w]) err('Deux origines'); else out.channel = CHANW[w];
    } else out.words.push(w);
  }
  if (kind === 'sale') { out.qty ??= 1; out.pay ??= 'especes'; out.channel ??= 'boutique'; }
  if (kind === 'transfer') { out.qty ??= 1; if (!out.dest && !out.errors.length) err('Boutique de destination manquante (ex. > pk3)'); }
  if (kind === 'reception' && out.qty === null) err('Quantité obligatoire (ex. x3)');
  if (!out.words.length) err('Modèle manquant');
  out.ok = out.errors.length === 0;
  return out;
}

// ---------- Suggestions ----------
export const canonical = (v) => `${v.name} ${v.color} ${v.size}`;
const wordsOf = (s) => norm(s).split(/[^a-z0-9.]+/).filter(Boolean);
function indexOf(v) {
  if (v._ix) return v._ix;
  const ref = norm(v.ref);
  return (v._ix = { name: norm(v.name), words: [...wordsOf(v.name), ...wordsOf(v.ref), ref, ...wordsOf(v.color), String(v.size)] });
}
export function matchVariants(words, variants, { boutique, limit = 8 } = {}) {
  const toks = (words || []).map((w) => norm(w)).filter(Boolean);
  if (!toks.length) return [];
  const here = (v) => Number(v.stock?.[boutique] ?? 0);
  return variants
    .filter((v) => { const ix = indexOf(v); return toks.every((t) => ix.words.some((w) => w.startsWith(t))); })
    .map((v) => ({ v, rel: toks.some((t) => indexOf(v).name.startsWith(t)) ? 0 : 1, ok: here(v) > 0 ? 0 : 1 }))
    .sort((a, b) => a.rel - b.rel || a.ok - b.ok || a.v.name.localeCompare(b.v.name, 'fr') || a.v.color.localeCompare(b.v.color, 'fr') || a.v.size - b.v.size)
    .slice(0, limit).map((x) => x.v);
}
// Remplace la partie « modèle » de la saisie par le texte canonique, garde le reste (x2, prix, …)
export function applySuggestion(text, v) {
  const keep = String(text || '').replace(/>/g, ' > ').split(/\s+/).filter(Boolean).filter((raw) => {
    const w = norm(raw);
    return /^[x×*]\d+$/.test(w) || /^\d+[x×]$/.test(w) || /^\d{4,}(f|fcfa|cfa)?$/.test(w) || PAYW[w] || CHANW[w] || raw === '>';
  });
  return canonical(v) + ' ' + (keep.length ? keep.join(' ') + ' ' : '');
}
export const hereLabel = (v, b) => { const n = Number(v.stock?.[b] ?? 0); return n > 0 ? `ici ${n}` : 'à vérifier'; };

// ---------- Affichage d'une ligne ----------
export const isPaid = (e) => e.payment_method !== 'a_recevoir';
export const lineAmount = (e) => (['sale', 'exchange', 'return'].includes(e.kind) && e.unit_price != null ? e.qty * e.unit_price : null);
export function dayTotals(entries) { let ventes = 0, montant = 0; for (const e of entries) { if (e.kind === 'sale') ventes++; if (['sale', 'exchange', 'return'].includes(e.kind)) montant += e.qty * (e.unit_price || 0); } return { ventes, montant }; }
export function variantLabel(v) { return v ? `${v.name} · ${v.color} · ${v.size}` : 'Article inconnu'; }
export function lineView(e, vmap) {
  const v = vmap?.[e.variant_id]; const q = Math.abs(e.qty);
  const text = variantLabel(v) + (q > 1 ? ` ×${q}` : '');
  const parts = [KINDS[e.kind] || e.kind];
  if (e.kind === 'transfer') parts.push(e.qty < 0 ? 'sortant' : 'entrant');
  else if (e.kind === 'sale' || e.kind === 'exchange' || e.kind === 'return') parts.push(CHANNELS[e.channel] || e.channel || '', PAYS[e.payment_method] || e.payment_method || '');
  else if (e.kind === 'reception') parts.push('+' + q);
  const amount = lineAmount(e);
  return { text, mono: parts.filter(Boolean).join(' · '), amount, paid: ['sale', 'exchange', 'return'].includes(e.kind) ? isPaid(e) : null, auto: e.source === 'offstep_auto' || e.channel === 'offstep' };
}

// ---------- Résumé du mois ----------
export function summarizeEntries(entries, vmap) {
  const s = { ventes: 0, montant: 0, par_origine: {}, top: [], echanges: 0, retours: 0, receptions: 0 }; const top = {};
  for (const e of entries) {
    if (e.kind === 'sale') { s.ventes++; const o = e.source === 'offstep_auto' ? 'offstep' : e.channel || 'boutique'; s.par_origine[o] = (s.par_origine[o] || 0) + e.qty * (e.unit_price || 0); const k = variantLabel(vmap?.[e.variant_id]).split(' · ')[0]; top[k] = (top[k] || 0) + e.qty; }
    if (['sale', 'exchange', 'return'].includes(e.kind)) s.montant += e.qty * (e.unit_price || 0);
    if (e.kind === 'exchange' && e.qty > 0) s.echanges++;
    if (e.kind === 'return' && e.qty < 0) s.retours++;
    if (e.kind === 'reception') s.receptions += e.qty;
  }
  s.top = Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, qty]) => ({ name, qty }));
  return s;
}
// Accepte plusieurs formes possibles de réponse de notes_month_summary ; renvoie null si méconnaissable
export function normalizeSummary(raw) {
  let r = Array.isArray(raw) ? raw[0] : raw; if (typeof r === 'string') { try { r = JSON.parse(r); } catch { return null; } }
  if (!r || typeof r !== 'object') return null;
  const pick = (...k) => { for (const x of k) if (r[x] != null) return r[x]; return undefined; };
  const ventes = pick('ventes', 'nb_ventes', 'sales', 'sales_count'); const montant = pick('montant', 'total', 'amount', 'revenue');
  if (ventes == null && montant == null) return null;
  const po = pick('par_origine', 'origines', 'by_channel') || {}; const tp = pick('top', 'top_modeles', 'modeles', 'top_models') || [];
  return { ventes: +ventes || 0, montant: +montant || 0,
    par_origine: Array.isArray(po) ? Object.fromEntries(po.map((x) => [x.channel || x.origine || x.name, +x.montant || +x.total || 0])) : po,
    top: tp.map((x) => ({ name: x.name || x.modele || x.model || '?', qty: +(x.qty ?? x.n ?? x.ventes ?? 0) })),
    echanges: +pick('echanges', 'exchanges') || 0, retours: +pick('retours', 'returns') || 0, receptions: +pick('receptions', 'receptions_qty') || 0 };
}
export function summaryText(s, boutiqueName, month) {
  const l = [`OFFSTEP NOTES · ${boutiqueName} · ${monthLabel(month)}`, `Ventes : ${s.ventes} (${fcfa(s.montant)})`];
  for (const [k, v] of Object.entries(s.par_origine || {})) l.push(`  ${CHANNELS[k] || k} : ${fcfa(v)}`);
  if (s.top?.length) l.push('Plus vendus : ' + s.top.map((t) => `${t.name} ×${t.qty}`).join(', '));
  l.push(`Échanges : ${s.echanges} · Retours : ${s.retours} · Reçus : ${s.receptions}`);
  return l.join('\n');
}

// ---------- Erreurs en français ----------
export function friendlyError(e) {
  const m = String(e?.message ?? e ?? '');
  if (/Failed to fetch|NetworkError|network|Load failed/i.test(m)) return 'Pas de connexion. La ligne reste en attente.';
  if (/JWT|expired|Non connecté/i.test(m)) return 'Session expirée : reconnecte-toi.';
  if (/Date invalide/.test(m)) return 'Date invalide (7 jours en arrière au maximum).';
  if (/Non autorisé|Transfert non autorisé|Réservé/.test(m)) return m;
  return m || 'Erreur inconnue';
}
export const canWrite = (profile) => !!profile && profile.active !== false && (profile.role === 'boutique' || profile.role === 'admin' || (profile.role === 'admin_limite' && profile.rights?.notes === true));
export const canReceive = (profile) => profile?.role === 'boutique';
