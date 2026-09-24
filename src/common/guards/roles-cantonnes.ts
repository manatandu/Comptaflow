import { RoleUtilisateur } from '@prisma/client';
import type { AccesRolesCantonnes } from '../decorators/acces-roles-cantonnes.decorator';

/**
 * LES DEUX RÔLES CANTONNÉS · décision de Manasse du 2026-09-24 (plan, item 13).
 * On garde les trois rôles d'origine et on en ajoute deux.
 *
 * AIDE_COMPTABLE · « saisit au brouillard mais ne valide pas, ne clôture pas et
 * ne passe pas la paie ». Il hérite donc des droits du comptable, et de ceux de
 * la lecture seule, PARTOUT où une route ne le refuse pas. La validation est le
 * geste qui fait entrer la pièce au livre-journal et l'AUDCIF art. 22, 2° la
 * rend irréversible · c'est le geste qu'on retire. Les clôtures sont déjà
 * réservées à l'administrateur. Le personnel lui est fermé en entier, lecture
 * comprise : ses données sont nominatives (rémunérations, enfants, CNSS), et
 * « ne passe pas la paie » n'a de sens que si la paie ne lui est pas ouverte.
 *
 * GESTIONNAIRE_PAIE · « n'accède qu'au personnel et à la paie, sans le reste de
 * la comptabilité ». Son défaut est l'INVERSE de celui de l'aide · RIEN n'est
 * ouvert tant qu'une route ne l'ouvre pas. C'est la seule forme qui tienne,
 * parce que la plupart des lectures du logiciel ne portent aucun `@Roles`
 * (RolesGuard les laisse passer à tout utilisateur authentifié) · un défaut
 * ouvert lui aurait donné tout le grand livre. Il émet les bulletins mais ne
 * les PASSE pas au journal : la comptabilisation écrit au livre-journal, qui
 * reste au comptable.
 *
 * Aucun texte ne fixe ces rôles · ce sont des choix d'organisation que l'AUDCIF
 * art. 69 laisse à l'entité (« l'entité détermine, sous sa responsabilité, les
 * procédures nécessaires »), et c'est l'entité qui les attribue.
 */
export const ROLES_CANTONNES: readonly RoleUtilisateur[] = [
  RoleUtilisateur.AIDE_COMPTABLE,
  RoleUtilisateur.GESTIONNAIRE_PAIE,
];

/** Défaut de chaque rôle cantonné quand la route ne dit rien. */
function accesParDefaut(role: RoleUtilisateur): boolean {
  return role === RoleUtilisateur.AIDE_COMPTABLE;
}

/** La route est-elle ouverte à ce rôle cantonné ? Sans objet pour les trois autres. */
export function routeOuverteAuRoleCantonne(
  role: RoleUtilisateur,
  acces: AccesRolesCantonnes | undefined,
): boolean {
  if (role === RoleUtilisateur.AIDE_COMPTABLE) return acces?.aideComptable ?? accesParDefaut(role);
  if (role === RoleUtilisateur.GESTIONNAIRE_PAIE) return acces?.gestionnairePaie ?? accesParDefaut(role);
  return true;
}

/**
 * `@Roles` satisfait ? Un rôle cantonné n'est jamais nommé dans les `@Roles`
 * existants (plus de deux cents routes) · il se lit comme le COMPTABLE qu'il
 * remplace, ou comme la LECTURE SEULE, à condition que la route lui soit
 * ouverte. Le nommer explicitement reste possible et suffit.
 */
export function rolesSatisfaits(
  role: RoleUtilisateur,
  rolesRequis: readonly RoleUtilisateur[],
  acces: AccesRolesCantonnes | undefined,
): boolean {
  if (rolesRequis.includes(role)) return true;
  if (!ROLES_CANTONNES.includes(role)) return false;
  if (!routeOuverteAuRoleCantonne(role, acces)) return false;
  return rolesRequis.includes(RoleUtilisateur.COMPTABLE) || rolesRequis.includes(RoleUtilisateur.LECTURE_SEULE);
}
