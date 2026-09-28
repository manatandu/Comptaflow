import type { RoleUtilisateur } from './types';

/**
 * ACCUEIL PAR MÉTIER (décision de Manasse du 2026-09-28). L'accueil montrait
 * les mêmes groupes à tous · un gestionnaire de paie ou un lecteur voyait
 * d'abord la saisie des journaux. Chaque rôle reçoit ses tâches courantes en
 * tête, dans l'ordre du travail.
 *
 * L'ACCUEIL NE DONNE AUCUN DROIT · les rôles restent tenus au serveur, et
 * chaque raccourci passe encore par le filtre des menus (référentiel, profil,
 * modules). Les libellés sont les titres des fenêtres du registre
 * (`libelles-et-titres.spec.ts`) · l'utilisateur doit arriver où il a cliqué.
 */
export interface TacheCourante {
  label: string;
  chemin: string;
  /** Réservé à l'administrateur, comme la fenêtre. */
  admin?: boolean;
}

const COMPTABLE: TacheCourante[] = [
  { label: 'Saisie des journaux', chemin: '/saisie' },
  { label: 'Interrogation et lettrage', chemin: '/lettrage' },
  { label: 'Rapprochement bancaire', chemin: '/rapprochement' },
  { label: 'Règlement des tiers', chemin: '/reglements' },
  { label: 'Brouillard', chemin: '/brouillard' },
  { label: "Fin d'exercice", chemin: '/exercice' },
];

const LECTURE: TacheCourante[] = [
  { label: 'Tableau de bord', chemin: '/tableau-de-bord' },
  { label: 'Balance des comptes', chemin: '/journal?onglet=balance' },
  { label: 'Grand livre des comptes', chemin: '/journal?onglet=grand-livre' },
  { label: 'États financiers', chemin: '/etats-financiers' },
  { label: 'Notes annexes', chemin: '/notes-annexes' },
];

const PAIE: TacheCourante[] = [
  { label: 'Registre du personnel', chemin: '/personnel' },
  { label: 'Paie du mois', chemin: '/personnel?onglet=bulletins' },
  { label: 'Devises et réévaluation', chemin: '/devises' },
];

const ADMINISTRATION: TacheCourante[] = [
  { label: 'Paramètres du dossier', chemin: '/parametres-dossier', admin: true },
  { label: "Autorisations d'accès", chemin: '/utilisateurs', admin: true },
  { label: 'Analyse et contrôles', chemin: '/controles' },
];

export function tachesDuRole(role: RoleUtilisateur | undefined): { titre: string; taches: TacheCourante[] } {
  switch (role) {
    case 'ADMIN_CABINET':
      return { titre: 'Tâches du cabinet', taches: [...COMPTABLE, ...ADMINISTRATION] };
    case 'COMPTABLE':
    case 'AIDE_COMPTABLE':
      return { titre: 'Tâches courantes', taches: COMPTABLE };
    case 'GESTIONNAIRE_PAIE':
      return { titre: 'Paie et personnel', taches: PAIE };
    case 'LECTURE_SEULE':
    default:
      return { titre: 'Consultation', taches: LECTURE };
  }
}
