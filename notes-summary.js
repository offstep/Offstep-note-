// OFFSTEP NOTES · résumé du mois
import { esc, fcfa, CHANNELS, monthLabel } from './notes-lib.js';
import { viewNav } from './notes-list.js';

export function viewSummary(S) {
  const s = S.summary;
  const body = !s ? `<p class="empty">${S.online ? 'Chargement…' : 'Résumé indisponible hors ligne.'}</p>` : `
<div class="kpis"><div class="glass pad2"><small class="mono">Ventes</small><b>${s.ventes}</b></div><div class="glass pad2"><small class="mono">Montant</small><b>${fcfa(s.montant)}</b></div></div>
<h2 class="grp">Par origine</h2><div class="glass">${Object.entries(s.par_origine || {}).map(([k, v]) => `<div class="row"><span class="txt">${esc(CHANNELS[k] || k)}</span><span class="amt">${fcfa(v)}</span></div>`).join('') || '<p class="empty">Aucune vente.</p>'}</div>
<h2 class="grp">Modèles les plus vendus</h2><div class="glass">${(s.top || []).map((t) => `<div class="row"><span class="txt">${esc(t.name)}</span><span class="amt">×${t.qty}</span></div>`).join('') || '<p class="empty">Rien pour l\'instant.</p>'}</div>
<h2 class="grp">Mouvements</h2><div class="glass"><div class="row"><span class="txt">Échanges</span><span class="amt">${s.echanges}</span></div><div class="row"><span class="txt">Retours</span><span class="amt">${s.retours}</span></div><div class="row"><span class="txt">Pièces reçues</span><span class="amt">${s.receptions}</span></div></div>
<button class="btn" data-act="shareSummary">Partager</button>`;
  return `<header class="bar"><h1>Résumé</h1></header><div class="pad"><div class="month"><button class="chip" data-act="monthPrev" aria-label="Mois précédent">‹</button><b>${esc(monthLabel(S.month))}</b><button class="chip" data-act="monthNext" aria-label="Mois suivant">›</button></div>${body}</div>${viewNav('summary')}`;
}
