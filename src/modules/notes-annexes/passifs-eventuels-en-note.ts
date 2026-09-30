import {
  JeuEtatsFinanciersSycebnl,
  JeuNotesAnnexes,
  Referentiel,
  StatutProvision,
  SystemeComptableSyscohada,
} from '@prisma/client';
import { LigneNoteCalculee } from './note-annexe.types';

/**
 * LE PASSIF ÉVENTUEL DU REGISTRE DES PROVISIONS, PORTÉ À SA NOTE (passe R2,
 * B2).
 *
 * Le registre refusait une provision dont une condition manque en disant
 * « portez la ligne en PASSIF_EVENTUEL, qui la fait figurer aux Notes
 * annexes ». Aucun code ne reliait le registre aux notes · la NOTE 16C du
 * SYSCOHADA et la NOTE 18B des associations restaient en pure saisie. Un
 * cabinet qui suivait le message croyait l'annexe renseignée, et la liasse
 * sortait une note vide · exactement le défaut que le registre dit combattre
 * (« le bilan est juste, l'annexe est muette »).
 *
 * Chaque passif éventuel de l'exercice est donc AJOUTÉ au tableau qui les
 * reçoit, cellules verrouillées, sa provenance dans son libellé. Rien n'est
 * évalué · le registre ne porte pas de montant pour une ligne qu'aucun
 * compte ne reçoit, et la cellule rend ce que le commentaire officiel de la
 * note demande de décrire : « les principales caractéristiques des actifs /
 * passifs éventuels, l'horizon de temps auquel les encaissements /
 * décaissements sont attendus et les éventuels remboursements à percevoir »
 * (AUDCIF Titre IX ch. 6, NOTE 16C ; SYCEBNL Partie 4 ch. 2, NOTE 18B, même
 * phrase). Les rubriques en saisie du modèle restent en place et gardent
 * leurs ancres · l'injection n'en remplace aucune.
 */

/**
 * Le tableau qui reçoit les passifs éventuels, par jeu de notes. Le jeu des
 * projets de développement n'a pas de note d'actifs et passifs éventuels
 * (Partie 4 ch. 3, liste des 24 notes) · rien n'y est porté d'office, et le
 * refus du registre le dit.
 */
export const TABLEAU_PASSIFS_EVENTUELS: Record<JeuNotesAnnexes, { code: string; sousTableau?: string } | null> = {
  [JeuNotesAnnexes.SYSCOHADA_SYSTEME_NORMAL]: { code: '16C', sousTableau: 'PASSIF ÉVENTUEL' },
  [JeuNotesAnnexes.ASSOCIATIONS_ORDRES_PROFESSIONNELS]: { code: '18B' },
  [JeuNotesAnnexes.PROJETS_DEVELOPPEMENT]: null,
};

/**
 * La note que le jeu d'états DU DOSSIER consacre aux passifs éventuels, telle
 * que le refus du registre la nomme · jamais le numéro d'un autre jeu (la
 * 16C est celle du SYSCOHADA, la 18B celle des associations). `null` quand
 * le jeu du dossier n'en a pas · les deux Systèmes minimaux de trésorerie et
 * les projets de développement.
 */
export function notePassifsEventuelsDuDossier(dossier: {
  referentiel: Referentiel;
  jeuEtatsFinanciersSycebnl?: JeuEtatsFinanciersSycebnl | null;
  systemeComptableSyscohada?: SystemeComptableSyscohada | null;
}): string | null {
  if (dossier.referentiel === Referentiel.SYSCOHADA) {
    return dossier.systemeComptableSyscohada === SystemeComptableSyscohada.MINIMAL_TRESORERIE
      ? null
      : 'NOTE 16C « Actifs et passifs éventuels »';
  }
  return dossier.jeuEtatsFinanciersSycebnl === JeuEtatsFinanciersSycebnl.ASSOCIATIONS_ORDRES_PROFESSIONNELS
    ? 'NOTE 18B « Actifs et passifs éventuels »'
    : null;
}

/** Une ligne du registre, telle que l'injection la lit. */
export interface PassifEventuelDuRegistre {
  objet: string;
  statut: StatutProvision;
  incertitudes: string | null;
  echeanceAttendue: Date | null;
  motifNonComptabilisation: string | null;
  remboursementAttendu: { toString(): string } | number | null;
  remboursementCertain: boolean;
  remboursementTiers: string | null;
}

/**
 * Les lignes à ajouter au tableau · une par passif éventuel, dans l'ordre
 * du registre. Une ligne d'un autre statut est écartée ici même : une
 * provision COMPTABILISÉE est au bilan, pas en passif éventuel, et une ligne
 * ÉCARTÉE (probabilité très faible) n'appelle aucune information (ch. 18
 * § 2.1.2).
 */
export function lignesPassifsEventuels(
  registre: PassifEventuelDuRegistre[],
  nombreDeColonnes: number,
): LigneNoteCalculee[] {
  return registre
    .filter((p) => p.statut === StatutProvision.PASSIF_EVENTUEL)
    .map((p) => {
      const elements = [
        p.incertitudes ? `Incertitudes : ${p.incertitudes}` : null,
        p.echeanceAttendue
          ? `Échéance attendue : ${p.echeanceAttendue.toLocaleDateString('fr-FR', { timeZone: 'UTC' })}`
          : 'Échéance attendue : non renseignée',
        p.remboursementAttendu !== null && p.remboursementAttendu !== undefined
          ? `Remboursement attendu : ${Number(p.remboursementAttendu).toFixed(2)}` +
            `${p.remboursementTiers ? ` (${p.remboursementTiers})` : ''}` +
            `${p.remboursementCertain ? ', certain' : ', non certain'}`
          : null,
        p.motifNonComptabilisation ? `Non comptabilisé : ${p.motifNonComptabilisation}` : null,
      ].filter((e): e is string => e !== null);
      const saisie: (string | number | null)[] = Array.from({ length: nombreDeColonnes }, () => null);
      // Année N · la description de l'exercice présenté. Année N-1 reste
      // vide : le registre de l'exercice précédent est une autre ligne.
      saisie[0] = elements.join(' · ');
      return {
        libelle: `Passif éventuel · ${p.objet} (registre des provisions)`,
        montantN: 0,
        estTotal: false,
        comptes: [],
        saisie,
        saisieVerrouillee: true,
      };
    });
}
