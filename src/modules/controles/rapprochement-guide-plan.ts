/**
 * RAPPROCHER LES NUMÉROS DES GUIDES AVEC LE PLAN SEMÉ DU DOSSIER.
 *
 * Constat du 2026-09-03, vérifié aux deux sources : **les guides
 * d'application citent des numéros que le plan officiel ne porte pas**. Ce
 * n'est ni une faute d'extraction ni une faute des guides, c'est la nature de
 * l'exercice · un guide illustre avec le compte que l'entité aurait ouvert.
 *
 * Trois cas, et ils ne se traitent pas pareil.
 *
 *  1. PLUS FIN QUE LE PLAN. Le guide SYCEBNL écrit `6011` là où le plan
 *     s'arrête à `601` ; il écrit `7961` (plan : `796`), `28442` (plan :
 *     `2844`). Le SYSCOHADA écrit `5212` (plan : `5211`), `6811` (plan :
 *     `681`). Ce sont des subdivisions que l'entité ouvre à sa convenance.
 *     On les rattache à leur RACINE connue du plan · c'est le même compte.
 *
 *  2. HORS PLAN. L'Application 107 du SYSCOHADA ouvre `06` et `07`
 *     « Exploitation en SP, charges / produits » pour tenir une société en
 *     participation dans la comptabilité du gérant. Le plan SYSCOHADA n'a
 *     pas de classe 0 · ces comptes sont créés par l'entité, le guide le dit
 *     (« ex. 06 … 07 … »). Ils sont donc gelés dans une liste nommée, pas
 *     rattachés de force à un compte qui n'a rien à voir.
 *
 *  3. CONNU TEL QUEL · le cas ordinaire.
 *
 * NE JAMAIS « corriger » le semis pour faire taire ce fichier. Ajouter au
 * plan un compte que le texte officiel ne porte pas, c'est exactement la
 * faute que CLAUDE.md §1 interdit.
 */

/**
 * Comptes cités par un guide et absents de tout plan, racine comprise.
 * Liste GELÉE · un ajout signale soit un guide relu, soit une extraction qui
 * a dérapé, et les deux méritent qu'on regarde.
 */
export const COMPTES_HORS_PLAN: Record<string, string> = {
  '06': 'SYSCOHADA App. 107 · Exploitation en société en participation, charges · compte ouvert par le gérant, hors plan',
  '07': 'SYSCOHADA App. 107 · Exploitation en société en participation, produits · compte ouvert par le gérant, hors plan',
};

/**
 * Comptes du plan D'AVANT la révision de 2017, cités par le chapitre 41
 * (« Première application du SYSCOHADA révisé ») sous « rappel des écritures
 * antérieures ». La révision a supprimé les charges immobilisées : ces
 * numéros ne désignent plus rien.
 *
 * `6811` est le piège : le plan actuel porte bien un `681` (Dotations aux
 * amortissements d'exploitation), si bien qu'un rapprochement par préfixe
 * rattacherait sans broncher un compte aboli à un compte vivant. Il est donc
 * nommé ici, et le rapprochement s'arrête avant.
 */
export const COMPTES_ABOLIS_PAR_LA_REVISION: Record<string, string> = {
  '2011': 'Frais de constitution · charges immobilisées, supprimées par la révision (SYSCOHADA App. 123)',
  '206': 'Primes de remboursement des obligations · supprimées par la révision (SYSCOHADA App. 123)',
  '6811': 'Dotations aux amortissements des charges immobilisées · sans objet depuis la révision (SYSCOHADA App. 123)',
};

/**
 * La racine du numéro connue du plan · le plus long préfixe qui y existe.
 *
 * Le plan sème ses comptes d'imputation complétés à huit chiffres et ses
 * en-têtes non complétés (CLAUDE.md §7) · `601` du guide se retrouve donc
 * aussi bien dans `601` (TOTAL) que dans `60110000` (Détail). On teste donc
 * dans les deux sens : un numéro du plan qui commence par celui du guide, ou
 * l'inverse.
 */
export function racinePlan(numeroGuide: string, numerosDuPlan: readonly string[]): string | null {
  // Un compte aboli ne se rattache à rien · le rattacher à son préfixe
  // vivant ferait passer une écriture d'avant 2017 pour une écriture valide.
  if (numeroGuide in COMPTES_ABOLIS_PAR_LA_REVISION) return null;
  for (let longueur = numeroGuide.length; longueur >= 2; longueur--) {
    const essai = numeroGuide.slice(0, longueur);
    if (numerosDuPlan.some((n) => n.startsWith(essai))) return essai;
  }
  return null;
}
