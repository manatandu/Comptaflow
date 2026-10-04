/*
  AUCUN IMPORT DANS CE MODULE · il est lu par le serveur
  (`comptes-proposes.ts`, `comptes-proposes.spec.ts`) ET par le spec de
  l'écran (`client/src/lib/comptes-retenus-ecrans.spec.ts`), qui y trouve la
  liste des routes de comptes sans la recopier · une route nouvelle rangée
  ici est vue des deux côtés le jour même.
*/

/** Le paramètre de requête qui demande la règle · le même nom sur toutes les routes. */
export const PARAMETRE_RETENUS = 'retenus';

/**
 * LES ROUTES QUI SERVENT UNE LISTE DE CHOIX DE COMPTES · source UNIQUE, relue
 * par `comptes-proposes.spec.ts` contre les contrôleurs du serveur et par
 * `client/src/lib/comptes-retenus-ecrans.spec.ts` contre les écrans. Une route
 * nouvelle dont le chemin nomme un compte ou une contrepartie fait tomber le
 * spec du serveur tant qu'elle n'est pas rangée ici, ou parmi les routes qui
 * ne servent pas de liste de choix (`ROUTES_QUI_NE_SONT_PAS_DES_LISTES`).
 *
 * DEUX RÉGIMES, et deux seulement.
 *  · `retenus` · la route applique la règle quand l'écran passe
 *    `?retenus=true`. Sans le paramètre, tout le plan admis est rendu · la
 *    fenêtre Plan comptable, les tests et les imports en ont besoin.
 *  · `texte` · la liste est FERMÉE par un texte, qui PRESCRIT le compte ;
 *    la règle n'y est pas appliquée, parce qu'elle retirerait un compte que le
 *    texte impose et laisserait l'écran sans le seul choix admis. Le motif
 *    cite le texte.
 *
 * LE CRITÈRE QUI TRANCHE ENTRE LES DEUX (relecture du 2026-10-02) · une
 * liste se lit dans TOUT le plan quand le texte, et le serveur après lui par
 * un refus nommé, n'admet qu'UNE RACINE que l'opération est souvent la
 * PREMIÈRE à mouvementer · le filtre n'y choisirait rien, il viderait la
 * liste au premier usage. Ainsi le 167 ET le 4861 du legs (SYCEBNL Partie 3
 * ch. 2 § 1.2.2, `legs-immobilisations.ts`), le 12 de l'imputation aux
 * capitaux propres d'ouverture (`imputerAuxCapitauxPropresDOuverture`), le 29
 * de la division du bien (`motifRefusCompteDepreciation`), la contrepartie de
 * l'octroi et les destinations de l'affectation ci-dessous. Elle se FILTRE
 * quand le texte laisse un choix ENTRE des racines de natures distinctes
 * (691, 697 ou 853 ; 162, 163 ou 164 ; les contreparties d'une acquisition),
 * ou quand le compte porte déjà, par construction, le solde que l'opération
 * reprend (les fonds d'un projet qui sort ses biens, le compte du bien).
 * Les lectures de l'écran qui suivent la première branche hors de ces routes
 * sont les exceptions motivées de `comptes-retenus-ecrans.spec.ts`.
 */
export type RegimeListeDeComptes =
  | { regime: 'retenus' }
  | { regime: 'texte'; motif: string };

export const LISTES_DE_COMPTES: Readonly<Record<string, RegimeListeDeComptes>> = {
  '/comptes': { regime: 'retenus' },
  '/immobilisations/comptes-du-bien': { regime: 'retenus' },
  '/immobilisations/contreparties-acquisition': { regime: 'retenus' },
  '/immobilisations/comptes-fonds-projet': { regime: 'retenus' },
  '/immobilisations/subventions-rattachees/octrois': {
    regime: 'texte',
    motif:
      "La contrepartie de l'octroi est celle que la fiche du compte 14 écrit (4731 au SYCEBNL ; 4494 ou 4582 au " +
      'SYSCOHADA) · la retirer faute de rétention laisserait l\'octroi sans le compte que le texte prescrit.',
  },
  '/immobilisations/materiel-recupere/comptes': {
    regime: 'texte',
    motif:
      'Le matériel récupéré se reprend au 388 au SYSCOHADA (AUDCIF Titre VIII ch. 14 § 2.8, fiche du compte 38) ou au ' +
      '378 au SYCEBNL (fiche du compte 37), seule racine admise par le serveur · la reprise en est presque toujours le ' +
      'premier mouvement, la règle viderait la liste.',
  },
  '/creances-douteuses/comptes': {
    regime: 'texte',
    motif:
      'Le reclassement se fait au 416 que la fiche du compte 41 prescrit (« crédité des créances litigieuses ou douteuses, par le ' +
      "débit du compte 416 »), seule racine admise par le serveur, et le reclassement en est souvent le premier mouvement · les " +
      'créances proposées sont celles que la balance montre débitrices, chacune déjà utilisée.',
  },
  '/affectation-resultat/exercice/:exerciceId': {
    regime: 'texte',
    motif:
      "Les destinations de l'affectation du résultat sont celles que le référentiel admet (réserves, report à " +
      'nouveau, dotation) · une destination légale ne disparaît pas parce que le compte n\'a jamais servi.',
  },
};

/**
 * Les routes dont le chemin nomme un compte sans servir une liste de choix ·
 * liste FERMÉE, chacune avec son motif. Un état, un livre ou un lettrage lit
 * TOUT le plan (« états, imports et écritures automatiques lisent tout le
 * plan »).
 */
export const ROUTES_QUI_NE_SONT_PAS_DES_LISTES: Readonly<Record<string, string>> = {
  '/comptes/renvois': 'renvois annexés au plan SYSCOHADA, du texte, aucun compte à choisir',
  '/comptes/:compteId/lettrage/:lettrageId/ecart-change':
    "écart de change proposé d'un lettrage (ligne A6), le compte que le texte donne ou aucun, jamais une liste",
  '/natures-compte': 'les sept natures de compte, paramètres du dossier',
  '/controles/regles-comptes': 'fiches par compte citées à la saisie, tout le plan',
  '/controles/comptes-dormants': 'contrôle de révision, tout le plan',
  '/courrier/compteurs': "compteurs de la file de courrier, aucun compte comptable",
  '/ecritures/justificatif-solde/:compteId': 'livre d’un compte déjà choisi',
  '/ecritures/grand-livre/:compteId': 'livre obligatoire, tout le plan',
  '/exports/grand-livre/:compteId': 'livre obligatoire, tout le plan',
  '/exports/justificatif-solde/:compteId': 'livre d’un compte déjà choisi',
  '/etats-financiers/compte-de-resultat': 'état financier, tout le plan',
  '/etats-financiers/projet/compte-exploitation': 'état financier, tout le plan',
  '/etats-financiers/smt/compte-de-resultat': 'état financier, tout le plan',
  '/etats-financiers-syscohada/compte-de-resultat': 'état financier, tout le plan',
  '/etats-financiers-syscohada/smt/compte-de-resultat': 'état financier, tout le plan',
  '/comptabilite-gestion/comportements': 'déclaration du comportement des comptes de gestion mouvementés (A20), tout compte des classes 6 et 7, aucun choix',
  '/comptabilite-gestion/seuil-rentabilite': 'calcul de gestion sur les comptes mouvementés (A20), aucun compte à choisir',
  '/comptabilite-gestion/couts-production': 'calcul de gestion sur les comptes ventilés de la section (A20), aucun compte à choisir',
  '/exports/etats-financiers/compte-de-resultat': 'état financier exporté, tout le plan',
  '/exports/etats-financiers/projet/compte-exploitation': 'état financier exporté, tout le plan',
  '/exports/etats-financiers/smt/compte-de-resultat': 'état financier exporté, tout le plan',
  '/exports/etats-financiers-syscohada/compte-de-resultat': 'état financier exporté, tout le plan',
  '/exports/etats-financiers-syscohada/smt/compte-de-resultat': 'état financier exporté, tout le plan',
  '/inventaire/:id/caisses-non-comptees': 'caisses à solde non nul sans procès-verbal, lues sur la balance',
  '/journaux/palmares-comptes': 'palmarès lu sur les mouvements, tout le plan',
  '/comptes/:compteId/lettrage': "lettrage d'un compte déjà choisi",
  '/comptes/:compteId/lettrage/pre-lettrage': "pré-lettrage d'un compte déjà choisi",
  '/relances/releve/:compteId': "relevé d'un compte déjà choisi",
  // Routes dont le service lit `compte.findMany` sans servir une liste de
  // choix · vues par la détection STRUCTURELLE de `comptes-proposes.spec.ts`,
  // qui ne dépend pas du nom de la route.
  '/ecritures/balance': 'balance, tout le plan ; un compte qu’elle rend est mouvementé, donc utilisé',
  '/ecritures/evolution-soldes': 'évolution des soldes sur plusieurs exercices, tout le plan',
  '/controles': 'contrôles du dossier, tout le plan',
  '/controles/dossier-revision': 'dossier de révision, tout le plan',
  '/controles/caisse': 'caisses 57 à solde lu sur la balance, contrôle de révision',
  '/etats-financiers/projet/emplois-ressources': 'état financier, tout le plan',
  '/etats-financiers/projet/note-bailleur': 'état financier, tout le plan',
  '/fiscalite/exercices/:exerciceId/propositions-retraitements': 'retraitements fiscaux proposés sur les comptes mouvementés',
  '/simulations-budgetaires/:id/calcul': 'simulation lue sur le réalisé des classes 6 et 7, tout le plan',
  '/stocks/variation/:exerciceId': 'variation de stocks, comptes lus dans le plan (« les comptes viennent du plan, pas de la balance »)',
};
