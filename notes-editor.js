// OFFSTEP NOTES · éditeur du jour (cœur de l'application)
import { esc, fcfa, KINDS, BOUTIQUES, PAYS, CHANNELS, parseLine, matchVariants, canonical, applySuggestion, hereLabel, lineView, dayTotals, variantLabel, longDate, hhmm, beninToday, canReceive } from './notes-lib.js';

// ---------- Lignes du jour : serveur + locales ----------
export function localEntries(it) {
  const p = it.params, m = it.meta || {}, base = { source: 'notes', local: it };
  if (it.type === 'sale') return [{ ...base, kind: 'sale', variant_id: p.variant, qty: p.qty, unit_price: p.price, channel: p.channel, payment_method: p.pay }];
  if (it.type === 'reception') return [{ ...base, kind: 'reception', variant_id: p.variant, qty: p.qty }];
  if (it.type === 'transfer') return [{ ...base, kind: 'transfer', variant_id: p.variant, qty: -p.qty }];
  const o = m.orig || {};
  const old = { ...base, kind: it.type, variant_id: o.variant, qty: -o.qty, unit_price: o.price, channel: o.channel, payment_method: o.pay };
  if (it.type === 'return') return [old];
  return [old, { ...base, kind: 'exchange', variant_id: p.variant, qty: o.qty, unit_price: p.price, channel: o.channel, payment_method: o.pay }];
}
export function mergeLines(S) {
  const rows = S.entries.map((e) => ({ key: 's' + e.id, e, local: null }));
  S.queue.filter((it) => it.boutique === S.boutiqueId && it.day === S.day).forEach((it) => localEntries(it).forEach((e, i) => rows.push({ key: 'l' + it.offline_id + i, e, local: it })));
  return rows;
}
export function isReversed(S, id) {
  return S.reversed.includes(id) || S.entries.some((e) => e.reverses_entry_id === id) || S.queue.some((it) => (it.type === 'exchange' || it.type === 'return') && it.params.original === id);
}
export const allowedKinds = (S) => {
  const k = ['sale']; if (canReceive(S.profile)) k.push('reception'); k.push('transfer', 'exchange', 'return');
  return S.day === beninToday() ? k : ['exchange', 'return'];
};
const KIND_PLACE = { sale: 'air force noir 41 x2 15000 momo', reception: 'air force noir 41 x3', transfer: 'air force noir 41 > pk3 x1', exchange: 'nouvelle paire, ex. air force blanc 42', return: '' };

// ---------- Vues ----------
export function pill(it) {
  if (!it) return '';
  if (it.status === 'error') return `<span class="pill err">⚠ à corriger</span>`;
  return `<span class="pill">${it.status === 'sending' ? 'envoi…' : 'en attente'}</span>`;
}
export function viewLines(S) {
  const rows = mergeLines(S);
  if (!rows.length) return `<p class="empty">Aucune ligne pour ce jour.</p>`;
  return rows.map(({ key, e, local }) => {
    const v = lineView(e, S.vmap);
    const amt = v.amount != null ? `<span class="amt">${fcfa(v.amount)}</span>` : '';
    const dot = v.paid === null ? '<span class="dot n" aria-hidden="true"></span>' : v.paid ? '<span class="dot ok" aria-label="encaissé">✓</span>' : '<span class="dot" aria-label="à recevoir"></span>';
    return `<button class="row" data-act="openLine" data-key="${esc(key)}">${dot}<span class="txt">${esc(v.text)}<small class="mono">${esc(v.mono)}</small></span>${v.auto ? '<span class="pill off">OFFSTEP</span>' : ''}${pill(local)}${amt}</button>`;
  }).join('');
}
export function viewTotal(S) {
  const all = mergeLines(S).map((r) => r.e); const t = dayTotals(all);
  return `<div class="total"><span>${t.ventes} vente${t.ventes > 1 ? 's' : ''}</span><b>${fcfa(t.montant)}</b></div>`;
}
export function viewSuggestions(S) {
  const k = S.kind;
  if (k === 'return') return '';
  if (k === 'exchange' && !S.exch) return '';
  const p = parseLine(S.text, { kind: k === 'exchange' ? 'sale' : k, canonical: S.pick && canonical(S.pick) });
  if (S.pick) return viewHint(S, p);
  if (!p.words.length) return '';
  const list = matchVariants(p.words, S.variants, { boutique: S.boutiqueId });
  if (!list.length) return `<p class="hint">Aucun article ne correspond.</p>`;
  return list.map((v) => `<button class="sg" data-act="pick" data-id="${v.id}"><b>${esc(v.name)} · ${esc(v.color)} · ${esc(v.size)}</b><span class="mono ${Number(v.stock?.[S.boutiqueId] ?? 0) > 0 ? '' : 'warn'}">${Number(v.stock?.[S.boutiqueId] ?? 0) > 0 ? '' : '⚠ '}${esc(hereLabel(v, S.boutiqueId))}</span></button>`).join('');
}
function viewHint(S, p) {
  const v = S.pick; const bits = [esc(variantLabel(v))];
  if (S.kind === 'sale' || S.kind === 'exchange') { bits.push(`×${S.kind === 'exchange' ? S.exch?.qty ?? 1 : p.qty ?? 1}`, fcfa(p.price ?? v.price) + (p.price == null ? ' (prix du modèle)' : '')); if (S.kind === 'sale') bits.push(PAYS[p.pay], CHANNELS[p.channel]); }
  else bits.push(p.qty != null ? `×${p.qty}` : 'quantité ?');
  if (S.kind === 'transfer') bits.push(p.dest ? '→ ' + BOUTIQUES[p.dest] : '→ ?');
  const warn = Number(v.stock?.[S.boutiqueId] ?? 0) <= 0 ? '<p class="hint warn">⚠ à vérifier : stock à zéro ici (la vente reste possible).</p>' : '';
  const errs = p.errors.filter((e) => e !== 'Modèle manquant').map((e) => `<p class="hint warn">⚠ ${esc(e)}</p>`).join('');
  return `<p class="hint">${bits.join(' · ')}</p>${warn}${errs}`;
}
export function viewPickRows(S) {
  const q = (S.pickQ || '').toLowerCase().trim();
  const sales = S.sales.filter((s) => { if (!q) return true; const t = `${variantLabel(S.vmap[s.variant_id])} ${s.client || ''} ${s.day}`.toLowerCase(); return q.split(/\s+/).every((w) => t.includes(w)); }).slice().reverse().slice(0, 30);
  const rows = sales.map((s) => { const done = isReversed(S, s.id); return `<button class="row" data-act="chooseSale" data-id="${s.id}" ${done ? 'disabled' : ''}><span class="txt">${esc(variantLabel(S.vmap[s.variant_id]))}${s.qty > 1 ? ' ×' + s.qty : ''}<small class="mono">${esc(longDate(s.day))}${s.client ? ' · ' + esc(s.client) : ''}${done ? ' · déjà échangée ou retournée' : ''}</small></span><span class="amt">${fcfa(s.qty * s.unit_price)}</span></button>`; }).join('');
  return rows || '<p class="empty">Aucune vente trouvée (30 derniers jours).</p>';
}
export const viewPicker = (S) => `<div class="picker"><input class="field" data-input="pickQ" value="${esc(S.pickQ || '')}" placeholder="Vente concernée : modèle, client, date" aria-label="Rechercher une vente"><div id="pickList">${viewPickRows(S)}</div></div>`;
export function viewDiff(S) {
  const o = S.exch; if (!o) return '';
  const sel = `<div class="card"><small class="mono">Vente concernée</small><div>${esc(variantLabel(S.vmap[o.variant_id]))} ×${o.qty} · ${fcfa(o.qty * o.unit_price)}</div></div>`;
  if (S.kind === 'return') return sel + `<div class="card strong">À rendre au client : ${fcfa(o.qty * o.unit_price)}</div>`;
  if (!S.pick) return sel;
  const p = parseLine(S.text, { kind: 'sale', canonical: canonical(S.pick) });
  const diff = o.qty * ((p.price ?? S.pick.price) - o.unit_price);
  return sel + `<div class="card strong">${diff > 0 ? 'À payer : ' + fcfa(diff) : diff < 0 ? 'À rendre : ' + fcfa(-diff) : 'Pas de différence'}</div>`;
}
export function viewComposer(S) {
  const kinds = allowedKinds(S);
  const chips = kinds.map((k) => `<button class="chip" data-act="setKind" data-k="${k}" aria-pressed="${S.kind === k}">${KINDS[k]}</button>`).join('');
  const needPick = (S.kind === 'exchange' || S.kind === 'return') && !S.exch;
  const body = needPick ? viewPicker(S) : viewDiff(S);
  const input = S.kind === 'return' ? (S.exch ? `<button class="btn send" data-act="addLine">Valider le retour</button>` : '')
    : needPick ? '' : `<div class="cmp"><input id="cmp" class="field" data-input="compose" value="${esc(S.text)}" placeholder="${esc(KIND_PLACE[S.kind])}" autocomplete="off" autocapitalize="none" spellcheck="false" enterkeyhint="done" aria-label="Nouvelle ligne"><button class="btn send" data-act="addLine" aria-label="Ajouter la ligne">Ajouter</button></div>`;
  const client = (S.kind === 'sale' && !needPick) ? `<button class="chip ghost" data-act="toggleClient" aria-pressed="${S.showClient}">Client</button>${S.showClient ? `<input class="field small" data-input="client" value="${esc(S.client)}" placeholder="Nom ou téléphone du client" aria-label="Client">` : ''}` : '';
  return `<div class="composer"><div id="sg" class="sgs">${viewSuggestions(S)}</div>${body}<div class="chips">${chips}${client}</div>${input}</div>`;
}
export function viewSheet(S) {
  const key = S.sheet; if (!key) return '';
  const row = mergeLines(S).find((r) => r.key === key); if (!row) return '';
  const { e, local } = row; const v = lineView(e, S.vmap);
  const who = local ? 'Vous (cet appareil)' : e.source === 'offstep_auto' ? 'OFFSTEP (automatique)' : e.author_id && e.author_id === S.profile?.id ? 'Vous' : 'Équipe';
  const state = local ? (local.status === 'error' ? 'À corriger : ' + esc(local.error || '') : local.status === 'sending' ? 'Envoi en cours' : 'En attente d\'envoi') : 'Envoyée';
  const acts = [];
  if (local) { if (local.status !== 'sending') acts.push(`<button class="btn2" data-act="editLocal" data-id="${esc(local.offline_id)}">Modifier</button><button class="btn2" data-act="deleteLocal" data-id="${esc(local.offline_id)}">Supprimer</button>`); if (local.status === 'error') acts.push(`<button class="btn2" data-act="retryLocal" data-id="${esc(local.offline_id)}">Réessayer</button>`); }
  else if (e.kind === 'sale') {
    if (isReversed(S, e.id)) acts.push('<p class="hint warn">⚠ Déjà échangée ou retournée.</p>');
    else acts.push(`<button class="btn2" data-act="startFix" data-k="exchange" data-id="${e.id}">Échanger</button><button class="btn2" data-act="startFix" data-k="return" data-id="${e.id}">Retourner</button>`);
  } else acts.push('<p class="hint">Une ligne envoyée ne se modifie pas : corrige par une nouvelle ligne.</p>');
  return `<div class="sheet-bg" data-act="closeSheet"></div><div class="sheet" role="dialog" aria-label="Détail"><b>${esc(v.text)}</b><dl><dt>Type</dt><dd>${esc(v.mono)}</dd><dt>Auteur</dt><dd>${who}</dd><dt>Heure</dt><dd>${esc(e.created_at ? hhmm(e.created_at) : hhmm(local?.created_at))}</dd><dt>État</dt><dd>${state}</dd></dl>${acts.join('')}<button class="btn2" data-act="closeSheet">Fermer</button></div>`;
}
export function viewBadge(S) {
  const n = S.queue.filter((i) => i.status !== 'error' && i.boutique === S.boutiqueId).length;
  return !S.online ? `<span class="pill off">Hors ligne${n ? ' · ' + n + ' en attente' : ''}</span>` : n ? `<span class="pill">${n} en attente</span>` : '';
}
export function viewEditor(S) {
  const past = S.day !== beninToday() ? `<p class="hint">Journée passée : tu peux seulement échanger ou retourner une vente. La ligne sera notée aujourd'hui.</p>` : '';
  return `<header class="bar"><button class="back" data-act="goList" aria-label="Retour aux notes">‹ Notes</button><span id="badge">${viewBadge(S)}</span></header>
<div class="ed"><h1>${esc(longDate(S.day))}</h1><p class="mono sub">${esc(S.boutiqueName)}</p>${past}<div id="lines">${viewLines(S)}</div></div>
<div class="dock"><div id="total">${viewTotal(S)}</div><div id="composer">${viewComposer(S)}</div></div><div id="sheet">${viewSheet(S)}</div>`;
}

// ---------- Actions ----------
export function resolveVariant(S, parsed) {
  if (S.pick && parsed.picked) return S.pick;
  const m = matchVariants(parsed.words, S.variants, { boutique: S.boutiqueId, limit: 2 });
  if (m.length === 1) return m[0];
  throw new Error(m.length ? 'Choisis un article dans les suggestions' : 'Aucun article ne correspond');
}
export function buildItem(S, today = beninToday()) {
  const k = S.kind, b = S.boutiqueId;
  if (!b) throw new Error('Choisis une boutique');
  if (!allowedKinds(S).includes(k)) throw new Error("Action non permise ici");
  if (k === 'return') { if (!S.exch) throw new Error('Choisis la vente concernée'); if (isReversed(S, S.exch.id)) throw new Error('Déjà échangée ou retournée'); return { type: 'return', params: { original: S.exch.id }, boutique: b, day: today, meta: { orig: origOf(S.exch) } }; }
  const p = parseLine(S.text, { kind: k === 'exchange' ? 'sale' : k, canonical: S.pick && canonical(S.pick) });
  if (!p.ok) throw new Error(p.errors[0]);
  const v = resolveVariant(S, p);
  if (k === 'sale') { const price = p.price ?? v.price; if (!(price >= 0) || (p.price == null && !v.price)) throw new Error('Prix à indiquer (ex. 15000)'); return { type: 'sale', params: { variant: v.id, qty: p.qty, price, channel: p.channel, pay: p.pay, client: S.client.trim() || null }, boutique: b, day: today }; }
  if (k === 'reception') return { type: 'reception', params: { variant: v.id, qty: p.qty }, boutique: b, day: today };
  if (k === 'transfer') { if (p.dest === b) throw new Error('Même boutique'); return { type: 'transfer', params: { variant: v.id, from: b, to: p.dest, qty: p.qty }, boutique: b, day: today }; }
  if (k === 'exchange') { if (!S.exch) throw new Error('Choisis la vente concernée'); if (isReversed(S, S.exch.id)) throw new Error('Déjà échangée ou retournée'); const price = p.price ?? v.price; return { type: 'exchange', params: { original: S.exch.id, variant: v.id, price }, boutique: b, day: today, meta: { orig: origOf(S.exch) } }; }
  throw new Error('Type inconnu');
}
const origOf = (o) => ({ variant: o.variant_id, qty: o.qty, price: o.unit_price, channel: o.channel, pay: o.payment_method });
// Texte de saisie à remettre quand on modifie une ligne locale
export function textFor(it, vmap) {
  const p = it.params, v = vmap[p.variant]; if (!v) return '';
  const bits = [canonical(v)]; if (p.qty > 1 || it.type === 'reception') bits.push('x' + p.qty);
  if (it.type === 'sale') { bits.push(String(p.price), p.pay === 'momo' ? 'momo' : p.pay === 'a_recevoir' ? 'reçu' : 'esp'); if (p.channel === 'telephone') bits.push('tel'); if (p.channel === 'whatsapp') bits.push('wa'); }
  if (it.type === 'exchange') bits.push(String(p.price));
  if (it.type === 'transfer') bits.push('>', { 1: 'missebo', 2: 'bt105', 3: 'pk3' }[p.to]);
  return bits.join(' ') + ' ';
}
