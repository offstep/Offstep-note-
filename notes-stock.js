// OFFSTEP NOTES · stock des 3 boutiques (lecture seule)
import { esc, norm, BOUTIQUES, hhmm } from './notes-lib.js';
import { viewNav } from './notes-list.js';

export function stockGroups(S) {
  const toks = norm(S.stockQ).split(/\s+/).filter(Boolean); const g = new Map();
  for (const v of S.variants) {
    const hay = norm(`${v.name} ${v.ref} ${v.color} ${v.size}`).split(/[^a-z0-9.]+/);
    if (!toks.every((t) => hay.some((w) => w.startsWith(t)))) continue;
    if (!g.has(v.model_id)) g.set(v.model_id, { name: v.name, rows: [] }); g.get(v.model_id).rows.push(v);
  }
  return [...g.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr')).map((m) => ({ ...m, rows: m.rows.sort((x, y) => x.color.localeCompare(y.color, 'fr') || x.size - y.size) }));
}
export function viewStockTable(S) {
  const ids = S.boutiques.length ? S.boutiques.map((b) => b.id) : [1, 2, 3];
  const name = (id) => (S.boutiques.find((b) => b.id === id)?.name || BOUTIQUES[id] || '#' + id);
  const short = (id) => name(id).replace('Ancien ', '').replace('PK3 — ', '');
  const head = ids.map((id) => `<th class="${id === S.boutiqueId ? 'mine' : ''}" scope="col">${esc(short(id))}${id === S.boutiqueId ? '<small> (ici)</small>' : ''}</th>`).join('');
  const groups = stockGroups(S);
  const body = groups.map((m) => `<tbody><tr><th colspan="${ids.length + 1}" class="mod" scope="colgroup">${esc(m.name)}</th></tr>${m.rows.map((v) => `<tr><th scope="row">${esc(v.color)} · ${esc(v.size)}</th>${ids.map((id) => { const n = Number(v.stock?.[id] ?? 0); return `<td class="${id === S.boutiqueId ? 'mine' : ''} ${n <= 0 ? 'zero' : ''}">${n}</td>`; }).join('')}</tr>`).join('')}</tbody>`).join('');
  return `<table class="stock"><thead><tr><th scope="col">Article</th>${head}</tr></thead>${body || `<tbody><tr><td colspan="${ids.length + 1}" class="empty">Aucun article.</td></tr></tbody>`}</table>`;
}
export function viewStock(S) {
  const state = S.online && S.live ? '<span class="pill live">En direct</span>' : `<span class="pill off">Dernier état connu${S.stockAt ? ' · ' + esc(hhmm(S.stockAt)) : ''}</span>`;
  return `<header class="bar"><h1>Stock</h1>${state}</header><div class="pad"><input class="field" data-input="stockQ" value="${esc(S.stockQ)}" placeholder="Rechercher un modèle, une couleur, une pointure" aria-label="Rechercher dans le stock">
<div class="scroll-x" id="stockTable">${viewStockTable(S)}</div><p class="hint">Lecture seule. Un zéro ou moins veut dire « à vérifier ».</p></div>${viewNav('stock')}`;
}
