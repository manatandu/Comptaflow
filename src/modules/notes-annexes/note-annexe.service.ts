import { Injectable } from '@nestjs/common';
import { EcritureService } from '../comptabilite/ecriture.service';
import { ExerciceService } from '../exercice/exercice.service';
import { LigneBalancePourEtat, chargerLignes, correspond, trouverExerciceN1 } from '../etats-financiers/etats-financiers.communs';
import {
  CompteDeRubrique,
  LigneNoteCalculee,
  NoteCalculee,
  RubriqueNote,
  SpecificationNote,
} from './note-annexe.types';
import { NOTES_ASSOCIATIONS } from './correspondance-notes-associations';

/**
 * Calcule une note annexe à partir de sa spécification déclarative et de la
 * balance des exercices N et N-1.
 *
 * Deux règles de présentation du texte officiel sont appliquées ici plutôt que
 * dans l'affichage, pour qu'elles valent aussi à l'export :
 *
 * - **Partie 4, ch. 1, § 1.4** : « les rubriques et les postes des états
 *   financiers non chiffrés ne doivent pas être présentés ». Une note sans
 *   aucune ligne chiffrée est déclarée non applicable ; dans une note
 *   applicable, les lignes à zéro sont retirées (les totaux restent, ils
 *   portent l'information). Le commentaire de la fiche récapitulative du jeu
 *   projets le redit : « dans une note, les lignes non chiffrées doivent être
 *   supprimées ».
 * - **§ 1.4 encore** : « pour chaque poste et rubrique, les chiffres
 *   correspondants de l'exercice précédent doivent être mentionnés ». D'où la
 *   colonne N-1 systématique, `undefined` — jamais 0 — s'il n'y a pas
 *   d'exercice antérieur.
 */
@Injectable()
export class NoteAnnexeService {
  constructor(
    private readonly ecritureService: EcritureService,
    private readonly exerciceService: ExerciceService,
  ) {}

  /** Montant d'une rubrique sur un jeu de lignes de balance, dans son sens de lecture. */
  private calculerRubrique(rubrique: RubriqueNote, lignes: LigneBalancePourEtat[]): { montant: number; comptes: CompteDeRubrique[] } {
    if (!rubrique.comptes || rubrique.comptes.length === 0) {
      return { montant: 0, comptes: [] };
    }
    let matches = lignes.filter((l) => correspond(l.numero, rubrique.comptes!, rubrique.exclusions));
    if (rubrique.sens === 'DEBITEUR') matches = matches.filter((l) => l.solde > 0);
    if (rubrique.sens === 'CREDITEUR') matches = matches.filter((l) => l.solde < 0);

    const source = rubrique.source ?? 'SOLDE';
    const comptes: CompteDeRubrique[] = matches.map((l) => {
      let montant: number;
      if (source === 'MOUVEMENT_DEBIT') montant = l.totalDebit;
      else if (source === 'MOUVEMENT_CREDIT') montant = l.totalCredit;
      // `SOLDE` : le signe est ramené au sens de lecture de la rubrique. Une
      // rubrique créditrice (dettes, dépréciations) s'affiche en positif.
      else montant = rubrique.sens === 'CREDITEUR' || rubrique.presenterEnNegatif ? -l.solde : l.solde;
      return { numero: l.numero, intitule: l.intitule, montant };
    });

    const brut = comptes.reduce((s, c) => s + c.montant, 0);
    // `|| 0` normalise -0 en 0 (même souci de propreté qu'au bilan).
    return { montant: (rubrique.presenterEnNegatif ? -brut : brut) || 0, comptes };
  }

  /** Résout toutes les rubriques d'une note pour un exercice donné, totaux compris. */
  private resoudreRubriques(spec: SpecificationNote, lignes: LigneBalancePourEtat[]): Array<{ montant: number; comptes: CompteDeRubrique[] }> {
    const resolues: Array<{ montant: number; comptes: CompteDeRubrique[] }> = [];
    for (const rubrique of spec.rubriques) {
      if (rubrique.totalDeRubriques) {
        // Un total ne référence que des rubriques déjà résolues — vérifié par
        // un test structurel sur chaque spécification.
        const montant = rubrique.totalDeRubriques.reduce((s, i) => s + (resolues[i]?.montant ?? 0), 0);
        resolues.push({ montant, comptes: [] });
      } else {
        resolues.push(this.calculerRubrique(rubrique, lignes));
      }
    }
    return resolues;
  }

  private calculerNote(spec: SpecificationNote, lignesN: LigneBalancePourEtat[], lignesN1: LigneBalancePourEtat[], exerciceN1Disponible: boolean): NoteCalculee {
    const resN = this.resoudreRubriques(spec, lignesN);
    const resN1 = this.resoudreRubriques(spec, lignesN1);

    const toutes: LigneNoteCalculee[] = spec.rubriques.map((rubrique, i) => {
      const montantN = resN[i].montant;
      const montantN1 = exerciceN1Disponible ? resN1[i].montant : undefined;
      const variationValeur = montantN1 !== undefined ? montantN - montantN1 : undefined;
      // Une variation en pourcentage n'a pas de sens sur une base nulle : on
      // laisse la cellule vide plutôt que d'afficher un infini ou un 100 %.
      const variationPourcent =
        montantN1 !== undefined && Math.abs(montantN1) > 0.005 ? ((montantN - montantN1) / Math.abs(montantN1)) * 100 : undefined;

      return {
        libelle: rubrique.libelle,
        montantN,
        montantN1,
        variationValeur,
        variationPourcent,
        estTotal: rubrique.totalDeRubriques !== undefined,
        enAttenteDeRattachement: rubrique.subdivisionAttendue,
        comptes: resN[i].comptes,
        renvoi: rubrique.renvoi,
      };
    });

    // § 1.4 : les lignes non chiffrées ne sont pas présentées. Une ligne en
    // attente de rattachement est CONSERVÉE même à zéro : son absence de
    // montant est une information à porter, pas un vide à masquer.
    const chiffree = (l: LigneNoteCalculee) => Math.abs(l.montantN) > 0.005 || Math.abs(l.montantN1 ?? 0) > 0.005;
    const applicable = toutes.some((l) => !l.estTotal && chiffree(l));
    const lignes = applicable ? toutes.filter((l) => chiffree(l) || l.estTotal || l.enAttenteDeRattachement) : [];

    return {
      code: spec.code,
      titre: spec.titre,
      colonnes: spec.colonnes,
      lignes,
      commentaire: spec.commentaire,
      renvoyeeDepuis: spec.renvoyeeDepuis,
      horsBalance: spec.horsBalance ?? false,
      exerciceN1Disponible,
      applicable: applicable || (spec.horsBalance ?? false),
      rubriquesEnAttente: toutes.filter((l) => l.enAttenteDeRattachement).map((l) => l.libelle),
    };
  }

  /**
   * Toutes les notes du jeu associations pour un exercice, plus la fiche
   * récapitulative — qui fait partie de la liasse : elle déclare, note par
   * note, si elle est applicable ou non.
   */
  async notesAssociations(tenantId: string, exerciceId: string) {
    const exerciceN1Id = await trouverExerciceN1(this.exerciceService, tenantId, exerciceId);
    const [lignesN, lignesN1] = await Promise.all([
      chargerLignes(this.ecritureService, tenantId, exerciceId),
      chargerLignes(this.ecritureService, tenantId, exerciceN1Id),
    ]);

    const notes = NOTES_ASSOCIATIONS.map((spec) => this.calculerNote(spec, lignesN, lignesN1, exerciceN1Id !== null));

    return {
      notes,
      exerciceN1Disponible: exerciceN1Id !== null,
      ficheRecapitulative: notes.map((n) => ({
        code: n.code,
        titre: n.titre,
        applicable: n.applicable,
        rubriquesEnAttente: n.rubriquesEnAttente,
      })),
      couverture: {
        transcrites: NOTES_ASSOCIATIONS.length,
        attendues: 45,
      },
    };
  }
}
