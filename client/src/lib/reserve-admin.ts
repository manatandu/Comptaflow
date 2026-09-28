/**
 * LES FENÊTRES DONT LE SERVEUR REFUSE TOUT AU NON-ADMINISTRATEUR · audit de
 * l'interface I1, repris par l'audit final F200.
 *
 * Le menu Fichier ne montre « Journal d'audit » qu'à l'administrateur, comme
 * sa route (`@Roles(ADMIN_CABINET)` sur tout `journal-audit.controller.ts`).
 * Mais l'aiguillage d'AppShell ne lisait que le référentiel et les rôles
 * cantonnés · un comptable qui tapait l'adresse ouvrait une fenêtre vide
 * portant le refus du serveur (« Rôle insuffisant »), là où les fenêtres
 * propres à un référentiel le renvoient à l'accueil. Le référentiel est tenu
 * aux deux portes de l'écran, menu et ouverture (CLAUDE.md § 6) ; la réserve
 * à l'administrateur ne l'était qu'au menu.
 *
 * Isolé dans un fichier `.ts` pur, comme `referentiel-fenetre.ts` · un test
 * qui n'a besoin que de la règle ne doit pas entraîner toutes les pages du
 * registre avec lui.
 *
 * `reserveAdmin` absent : la fenêtre s'ouvre à tout rôle que le référentiel
 * et les rôles cantonnés laissent passer. Présent : à l'administrateur seul.
 */
export function fenetreOuverteSelonAdmin(def: { reserveAdmin?: boolean }, estAdmin: boolean): boolean {
  return !def.reserveAdmin || estAdmin;
}
