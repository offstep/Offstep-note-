// OFFSTEP NOTES · liste des notes + écrans d'accès (connexion, accès refusé, choix de boutique, réglages)
import { esc, fcfa, longDate, groupDays, beninToday, norm } from './notes-lib.js';

export const viewNav = (route) => `<nav class="tabs" aria-label="Navigation">${[['list', 'Notes', '#/'], ['stock', 'Stock', '#/stock'], ['summary', 'Résumé', '#/resume']].map(([r, t, h]) => `<a href="${h}" ${route === r ? 'aria-current="page"' : ''}>${t}</a>`).join('')}</nav>`;

// Jours à afficher : jours du serveur + aujourd'hui + jours qui n'ont que des lignes locales
export function listRows(S) {
  const today = beninToday(); const map = new Map(S.days.map((d) => [d.day, { ...d, pending: 0 }]));
  if (!map.has(today)) map.set(today, { day: today, ventes: 0, montant: 0, lignes: 0, pending: 0 });
  for (const it of S.queue) { if (it.boutique !== S.boutiqueId || it.status === 'error') continue; if (!map.has(it.day)) map.set(it.day, { day: it.day, ventes: 0, montant: 0, lignes: 0, pending: 0 }); map.get(it.day).pending++; }
  const q = norm(S.q).trim();
  return [...map.values()].filter((r) => !q || norm(longDate(r.day)).includes(q) || String(r.montant).includes(q.replace(/\s/g, '')));
}
export function viewDays(S) {
  const today = beninToday(); const groups = groupDays(listRows(S), today);
  return groups.length ? groups.map((g) => `<h2 class="grp">${esc(g.label)}</h2><div class="glass">${g.rows.map((r) => `<a class="row" href="#/note/${r.day}"><span class="txt">${esc(longDate(r.day))}<small class="mono">${r.ventes} vente${r.ventes > 1 ? 's' : ''} · ${fcfa(r.montant)}</small></span>${r.pending ? `<span class="pill">${r.pending} en attente</span>` : ''}</a>`).join('')}</div>`).join('') : '<p class="empty">Aucune note trouvée.</p>';
}
export function viewList(S) {
  const today = beninToday(); const body = viewDays(S);
  const nb = S.queue.filter((i) => i.status === 'error').length;
  return `<header class="bar"><h1>Notes</h1><a class="gear" href="#/reglages" aria-label="Réglages">⚙︎</a></header>
<div class="pad"><p class="mono sub">${esc(S.boutiqueName)}${!S.online ? ' · hors ligne' : ''}</p><input class="field" data-input="search" value="${esc(S.q)}" placeholder="Rechercher un jour" aria-label="Rechercher">
${nb ? `<p class="hint warn">⚠ ${nb} ligne${nb > 1 ? 's' : ''} à corriger : ouvre la note du jour.</p>` : ''}<div id="days">${body}</div></div>
<a class="fab" href="#/note/${today}" aria-label="Nouvelle ligne">＋ Nouvelle ligne</a>${viewNav('list')}`;
}
export const viewLogin = (S) => `<main class="login"><h1>OFFSTEP NOTES</h1><p class="sub">Le carnet de la boutique</p>
<button class="btn" data-act="google">Continuer avec Google</button><p class="or">ou</p>
<input class="field" id="email" type="email" autocomplete="username" placeholder="E-mail" aria-label="E-mail">
<input class="field" id="pass" type="password" autocomplete="current-password" placeholder="Mot de passe" aria-label="Mot de passe">
<button class="btn2" data-act="login">Se connecter</button>${S.loginError ? `<p class="hint warn" role="alert">⚠ ${esc(S.loginError)}</p>` : ''}</main>`;
export const viewDenied = (S) => `<main class="login"><h1>Accès refusé</h1><p class="sub">Ce compte n'a pas accès à OFFSTEP NOTES${S.profile?.role === 'admin_limite' ? ' (droit « notes » manquant)' : ''}.</p><button class="btn2" data-act="logout">Se déconnecter</button></main>`;
export const viewChoose = (S) => `<main class="login"><h1>Quelle boutique ?</h1><p class="sub">Tu écris sur une seule boutique à la fois. Tu pourras changer dans les réglages.</p>${S.boutiques.map((b) => `<button class="btn2" data-act="setBoutique" data-id="${b.id}">${esc(b.name)}</button>`).join('')}</main>`;
export function viewSettings(S) {
  const c = { pending: S.queue.filter((i) => i.status === 'pending' || i.status === 'sending').length, error: S.queue.filter((i) => i.status === 'error').length };
  const adm = S.profile?.role !== 'boutique';
  return `<header class="bar"><button class="back" data-act="goList">‹ Notes</button><h1>Réglages</h1></header><div class="pad">
${S.volatile ? '<p class="hint warn" role="alert">⚠ Le stockage de cet appareil est indisponible : les lignes non envoyées seront perdues si tu fermes l\'application. Reste en ligne.</p>' : ''}
<div class="glass pad2"><small class="mono">Compte</small><div>${esc(S.profile?.name || '')} · ${esc(S.profile?.role || '')}</div></div>
<div class="glass pad2"><small class="mono">Boutique</small>${adm ? `<select class="field" data-change="setBoutiqueSel" aria-label="Boutique">${S.boutiques.map((b) => `<option value="${b.id}" ${b.id === S.boutiqueId ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>` : `<div>${esc(S.boutiqueName)}</div>`}</div>
<div class="glass pad2"><small class="mono">Synchronisation</small><div>${S.online ? 'En ligne' : 'Hors ligne'} · ${c.pending} en attente · ${c.error} à corriger</div>${S.sync.lastError ? `<p class="hint warn">⚠ ${esc(S.sync.lastError)}</p>` : ''}${S.sync.lastOk ? `<small class="mono">Dernier envoi réussi : ${esc(S.sync.lastOk)}</small>` : ''}</div>
<button class="btn" data-act="syncNow">Envoyer maintenant</button><button class="btn2" data-act="clearCache">Vider le cache</button><p class="hint">Vider le cache ne supprime jamais les lignes en attente.</p><button class="btn2" data-act="logout">Se déconnecter</button></div>`;
}
