import type { ModuleOptionnel } from './profil-dossier';

/**
 * DÉMARRAGE GUIDÉ D'UN DOSSIER NEUF (décision de Manasse du 2026-09-28).
 * Le premier jour, le menu complet ne dit pas par où commencer. L'assistant
 * donne l'ordre du travail, et L'ÉTAT DE CHAQUE ÉTAPE SE LIT DANS LE DOSSIER
 * (`GET /dossier/demarrage`), jamais dans une case cochée à part · une étape
 * faite ailleurs compte, et aucune ne se dit faite sans l'être.
 *
 * Il ne décide rien : chaque étape ouvre la fenêtre ordinaire qui la fait.
 */
export interface EtatDemarrage {
  exercices: number;
  journaux: number;
  tiers: number;
  ecritures: number;
  modulesActives: ModuleOptionnel[];
}

export interface EtapeDemarrage {
  cle: 'referentiel' | 'exercice' | 'journaux' | 'modules' | 'tiers' | 'ecriture';
  titre: string;
  /** null = étape de choix, jamais « faite » ni « à faire » d'elle-même. */
  faite: boolean | null;
  chemin: string | null;
  action: string;
}

export function etapesDemarrage(etat: EtatDemarrage): EtapeDemarrage[] {
  return [
    // Le référentiel est fixé à la création du dossier · l'étape le montre.
    { cle: 'referentiel', titre: 'Référentiel et identité', faite: true, chemin: '/parametres-dossier', action: 'Vérifier les paramètres' },
    { cle: 'exercice', titre: 'Exercice comptable', faite: etat.exercices > 0, chemin: '/exercice', action: 'Ouvrir un exercice' },
    { cle: 'journaux', titre: 'Codes journaux', faite: etat.journaux > 0, chemin: '/journaux', action: 'Voir les journaux' },
    { cle: 'modules', titre: 'Modules du dossier', faite: null, chemin: null, action: 'Choisir ci-dessous' },
    { cle: 'tiers', titre: 'Tiers', faite: etat.tiers > 0, chemin: '/tiers', action: 'Créer les tiers' },
    { cle: 'ecriture', titre: 'Première écriture', faite: etat.ecritures > 0, chemin: '/saisie', action: 'Saisir une pièce' },
  ];
}

/** Le dossier a-t-il encore des étapes à faire ? */
export function demarrageInacheve(etat: EtatDemarrage): boolean {
  return etapesDemarrage(etat).some((e) => e.faite === false);
}

/**
 * S'OUVRE SEUL à l'administrateur d'un dossier SANS AUCUNE ÉCRITURE, tant qu'il
 * ne l'a pas passé sur ce poste. Un dossier qui a déjà des écritures n'est pas
 * neuf · l'assistant ne s'impose plus, il reste accessible depuis l'accueil.
 */
export function ouvrirAuChargement(etat: EtatDemarrage | null, estAdmin: boolean, passe: boolean): boolean {
  return !!etat && estAdmin && !passe && etat.ecritures === 0;
}

/** Préférence du poste · un confort, jamais une donnée du dossier. */
export const cleDemarragePasse = (tenantId: string) => `omegax.demarrage.passe.${tenantId}`;
