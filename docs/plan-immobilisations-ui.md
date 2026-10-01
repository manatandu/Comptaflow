# Plan · fenêtre Immobilisations (interface seule)

Modèle conseillé : Sonnet, effort moyen, session neuve. Aucune règle comptable n'est
touchée ; si une règle de calcul, un compte ou un article apparaît, s'arrêter et le dire.

## Demande (Manasse)
1. Le bouton « Nouvelle immobilisation » ne disparaît pas quand on l'a pressé.
2. Deux entrées de menu, « Immobilisations » et « Immobilisations et amortissements »,
   sont redondantes.

## Constats (lus dans le code)
- `client/src/pages/ImmobilisationsPage.tsx` : le bouton (vers la ligne 649) bascule
  `afficherFormImmo` ; le formulaire s'affiche à la ligne 814 sous
  `peutEcrire && afficherFormImmo`. Le bouton reste donc visible formulaire ouvert.
  Même schéma pour « Nouvelle famille » (`afficherFormFamille`, `estAdmin`).
- `client/src/pages/TableauxImmobilisationsPage.tsx` : fenêtre à DEUX onglets internes
  (`'immobilisations' | 'amortissements'`, état `onglet`), avec sa date d'arrêté.
- Entrées de menu : `AppShell.tsx` lignes 258 (`/immobilisations`) et 476
  (`/tableaux-immobilisations`) ; accueil : `AccueilPage.tsx` lignes 133 et 134 ;
  registre : `lib/registre-fenetres.tsx` ligne 309 (titre « Immobilisations et
  amortissements », titre court « Tabl. immos »).
- `lib/profil-dossier.spec.ts` ligne 56 cite `/immobilisations` (masquage par profil).

## Étape 1 · bouton
- Masquer « Nouvelle immobilisation » (et « Nouvelle famille ») tant que son formulaire
  est ouvert : condition `!afficherFormImmo`. Le formulaire garde son propre bouton
  « Annuler » ; vérifier qu'il existe, sinon l'ajouter, pour qu'on puisse refermer.
- Test Vitest : le bouton est présent formulaire fermé, absent formulaire ouvert, et
  reste masqué en lecture seule (`peutEcrire` faux). S'inspirer de
  `ecriture-masquee.spec.ts` pour la lecture de `peutEcrire`.

## Étape 2 · une seule fenêtre à trois onglets
- Onglets de `ImmobilisationsPage` : Biens (contenu actuel), Tableau des
  immobilisations, Tableau des amortissements. Réutiliser le contenu de
  `TableauxImmobilisationsPage` comme composant d'onglet, sans le recopier
  (une seule règle d'affichage ; ne pas diverger au premier correctif).
- Garder la date d'arrêté dans les deux onglets de tableaux.
- Route : ne PAS casser `/tableaux-immobilisations` (signets, e2e). La faire pointer
  vers la même fenêtre, onglet des tableaux présélectionné.
- Retirer l'entrée de menu 476 et la tuile d'accueil 134 ; conserver l'entrée 258 et la
  tuile 133. Mettre à jour `registre-fenetres.tsx` en conséquence.
- Ne pas oublier : `profil-dossier.ts` (chemins masqués au SMT), les titres formels
  (`titres-formels*.spec.ts`), le plafond de `chrome-etroit.spec.ts` (le retrait d'une
  ligne de menu ne peut que l'aider), la liste des chemins lus par les tests e2e
  (`AppShell.tsx` les fournit).
- Respecter la charte : aucun paragraphe explicatif à l'écran (bulle `Aide`), titres
  formels, aucune référence juridique en titre.

## Vérifications
- `cd client && npx tsc --noEmit && npm test` puis `npm run build`.
- Côté serveur, rien ne change ; ne lancer `npx jest` complet qu'avant le push.
- Contrôle visuel : ouvrir la fenêtre, presser « Nouvelle immobilisation », voir le
  bouton disparaître, annuler, le revoir ; basculer entre les trois onglets.
- Aucun tiret cadratin (« · » à la place). Commit signé, sur `main`, avec le pied de
  commit habituel ; pousser avec `git push -u origin main`. Le déploiement Hosting suit
  tout push sur `main` : relire son résultat dans Actions.

## Hors périmètre
- Règles d'amortissement, composants, dépréciation, sortie : inchangées.
