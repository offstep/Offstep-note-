# OFFSTEP NOTES : mise en ligne

NOTES est un site à part : son propre dossier, sa propre adresse. Il ne partage avec OFFSTEP que la base Supabase.

## 1. Réglages
Ouvre `config.js` et remplace les deux valeurs par celles du `config.js` d'OFFSTEP (même projet Supabase) : `SUPABASE_URL` et `SUPABASE_ANON_KEY`. Seule la clé « anon » va ici, jamais la clé `service_role`.

## 2. Base de données
Dans Supabase → SQL Editor, colle les fichiers de `sql/` **dans l'ordre** `etape18_01` à `etape18_11`, un par un (chacun est relançable). Puis lance : `select * from selftest_notes2();` (tout doit être « OK »), puis `selftest_notes()` et `selftest_equipe()` (toujours « OK »).

## 3. Second site Netlify
1. Netlify → Add new site → Deploy manually.
2. Glisse le dossier `offstep-notes/` (le dossier lui-même, à plat).
3. Note l'adresse obtenue, par exemple `https://offstep-notes.netlify.app`.

## 4. Connexion Google et e-mail
Supabase → Authentication → URL Configuration → **Redirect URLs** : ajoute l'adresse du site NOTES (avec `/**` à la fin). Sans cela, « Continuer avec Google » renvoie vers OFFSTEP.

## 5. Installer sur le téléphone
Ouvrir l'adresse dans Safari ou Chrome → Partager → « Sur l'écran d'accueil ». Ouvrir une première fois **en ligne** : l'application et le stock sont alors gardés pour le hors ligne.

## Tests (Node 20 ou plus)
```
node tests/test_lib.mjs
node --import ./tests/register.mjs tests/test_queue.mjs
node --import ./tests/register.mjs tests/test_screens.mjs
```
Ou tout d'un coup : `sh tests/run.sh`.
