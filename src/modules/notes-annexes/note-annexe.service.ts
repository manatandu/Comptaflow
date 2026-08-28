import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { JeuEtatsFinanciersSycebnl } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { ExerciceService } from '../exercice/exercice.service';
import { LigneBalancePourEtat, chargerLignes, correspond, trouverExerciceN1 } from '../etats-financiers/etats-financiers.communs';
import {
  CompteDeRubrique,
  LigneNoteCalculee,
  NoteCalculee,
  RubriqueEnAttente,
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
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Retrouve une rubrique et vérifie qu'elle accepte bien un rattachement.
   *
   * GARDE-FOU CENTRAL : seule une rubrique déclarée `subdivisionAttendue` est
   * rattachable. Les rubriques dont le rattachement découle du plan de comptes
   * normalisé sont intouchables — les laisser modifier permettrait de défaire
   * en silence la fidélité au texte officiel, ce que toute la discipline du
   * projet vise à empêcher. Un rattachement sur une rubrique officielle est
   * refusé explicitement, jamais ignoré.
   */
  private rubriqueRattachable(jeu: JeuEtatsFinanciersSycebnl, codeNote: string, cleRubrique: string) {
    if (jeu !== JeuEtatsFinanciersSycebnl.ASSOCIATIONS_ORDRES_PROFESSIONNELS) {
      throw new BadRequestException("Seules les notes du jeu « associations et ordres professionnels » sont transcrites à ce jour.");
    }
    const spec = NOTES_ASSOCIATIONS.find((n) => n.code === codeNote);
    if (!spec) throw new NotFoundException(`Aucune note « ${codeNote} » dans ce jeu d'états financiers.`);
    // Une rubrique que le plan officiel détermine ne porte PAS de clé : rien
    // n'a besoin de la désigner, et lui en donner une laisserait croire qu'elle
    // est adressable. Conséquence : une clé introuvable recouvre deux cas — la
    // clé est fausse, ou elle vise une rubrique officielle. Le message doit dire
    // les deux, sans quoi l'utilisateur croit à une faute de frappe alors que
    // c'est le garde-fou qui a joué.
    const rubrique = spec.rubriques.find((r) => r.cle === cleRubrique);
    if (!rubrique) {
      throw new NotFoundException(
        `La note ${codeNote} n'a pas de rubrique rattachable « ${cleRubrique} » : soit la clé est erronée, ` +
          `soit elle désigne une rubrique que le plan de comptes officiel détermine déjà — celles-là ne sont ` +
          `pas modifiables et ne portent volontairement pas de clé.`,
      );
    }
    if (!rubrique.subdivisionAttendue) {
      throw new BadRequestException(
        `La rubrique « ${rubrique.libelle} » de la note ${codeNote} est rattachée par le plan de comptes ` +
          `officiel : elle n'est pas modifiable. Seules les rubriques que le plan normalisé ne permet pas ` +
          `de déterminer acceptent un rattachement propre au dossier.`,
      );
    }
    return rubrique;
  }

  /** Rattache un compte du dossier à une rubrique en attente. */
  async rattacher(
    tenantId: string,
    userId: string,
    jeu: JeuEtatsFinanciersSycebnl,
    codeNote: string,
    cleRubrique: string,
    compteId: string,
  ) {
    this.rubriqueRattachable(jeu, codeNote, cleRubrique);
    const compte = await this.prisma.compte.findFirst({ where: { id: compteId, tenantId } });
    if (!compte) throw new NotFoundException('Compte introuvable pour ce dossier.');
    // Un compte Total n'a pas de mouvement propre : le rattacher donnerait une
    // rubrique toujours vide (voir EcritureService.balance).
    if (compte.typeCompte === 'TOTAL') {
      throw new BadRequestException(
        `Le compte ${compte.numero} est un compte Total : il n'a jamais de mouvement propre et laisserait ` +
          `la rubrique vide. Rattacher les comptes Détail qu'il regroupe.`,
      );
    }
    return this.prisma.rattachementNote.upsert({
      where: { tenantId_jeu_codeNote_cleRubrique_compteId: { tenantId, jeu, codeNote, cleRubrique, compteId } },
      create: { tenantId, jeu, codeNote, cleRubrique, compteId, createdBy: userId },
      update: {},
    });
  }

  async detacher(tenantId: string, jeu: JeuEtatsFinanciersSycebnl, codeNote: string, cleRubrique: string, compteId: string) {
    const supprimes = await this.prisma.rattachementNote.deleteMany({
      where: { tenantId, jeu, codeNote, cleRubrique, compteId },
    });
    if (supprimes.count === 0) throw new NotFoundException('Ce compte n’est pas rattaché à cette rubrique.');
    return { detache: true };
  }

  /** Montant d'une rubrique sur un jeu de lignes de balance, dans son sens de lecture. */
  private calculerRubrique(
    rubrique: RubriqueNote,
    lignes: LigneBalancePourEtat[],
    numerosRattaches: string[] = [],
  ): { montant: number; comptes: CompteDeRubrique[] } {
    // Les comptes rattachés par le dossier S'AJOUTENT aux préfixes officiels,
    // ils ne les remplacent jamais (voir RattachementNote, prisma/schema.prisma).
    const prefixes = [...(rubrique.comptes ?? []), ...numerosRattaches];
    if (prefixes.length === 0) {
      return { montant: 0, comptes: [] };
    }
    let matches = lignes.filter((l) => correspond(l.numero, prefixes, rubrique.exclusions));
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
  private resoudreRubriques(
    spec: SpecificationNote,
    lignes: LigneBalancePourEtat[],
    rattachements: Map<string, string[]> = new Map(),
  ): Array<{ montant: number; comptes: CompteDeRubrique[] }> {
    const resolues: Array<{ montant: number; comptes: CompteDeRubrique[] }> = [];
    for (const rubrique of spec.rubriques) {
      if (rubrique.totalDeRubriques) {
        // Un total ne référence que des rubriques déjà résolues — vérifié par
        // un test structurel sur chaque spécification.
        const montant = rubrique.totalDeRubriques.reduce((s, i) => s + (resolues[i]?.montant ?? 0), 0);
        resolues.push({ montant, comptes: [] });
      } else {
        const cle = rubrique.cle ? `${spec.code}::${rubrique.cle}` : '';
        resolues.push(this.calculerRubrique(rubrique, lignes, rattachements.get(cle) ?? []));
      }
    }
    return resolues;
  }

  private calculerNote(
    spec: SpecificationNote,
    lignesN: LigneBalancePourEtat[],
    lignesN1: LigneBalancePourEtat[],
    exerciceN1Disponible: boolean,
    rattachements: Map<string, string[]>,
  ): NoteCalculee {
    const resN = this.resoudreRubriques(spec, lignesN, rattachements);
    const resN1 = this.resoudreRubriques(spec, lignesN1, rattachements);

    const toutes: LigneNoteCalculee[] = spec.rubriques.map((rubrique, i) => {
      const montantN = resN[i].montant;
      const montantN1 = exerciceN1Disponible ? resN1[i].montant : undefined;
      const variationValeur = montantN1 !== undefined ? montantN - montantN1 : undefined;
      // Une variation en pourcentage n'a pas de sens sur une base nulle : on
      // laisse la cellule vide plutôt que d'afficher un infini ou un 100 %.
      const variationPourcent =
        montantN1 !== undefined && Math.abs(montantN1) > 0.005 ? ((montantN - montantN1) / Math.abs(montantN1)) * 100 : undefined;

      // Une rubrique en attente cesse de l'être dès qu'un compte du dossier
      // lui est rattaché : elle est alors chiffrée comme les autres.
      const rattachee = (rattachements.get(`${spec.code}::${rubrique.cle}`) ?? []).length > 0;
      return {
        cle: rubrique.cle,
        libelle: rubrique.libelle,
        montantN,
        montantN1,
        variationValeur,
        variationPourcent,
        estTotal: rubrique.totalDeRubriques !== undefined,
        enAttenteDeRattachement: rattachee ? undefined : rubrique.subdivisionAttendue,
        rattachementDuDossier: rattachee || undefined,
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
      rubriquesEnAttente: spec.rubriques.flatMap<RubriqueEnAttente>((r, i) =>
        r.subdivisionAttendue && !toutes[i].rattachementDuDossier
          ? [{ cle: r.cle!, libelle: r.libelle, attendu: r.subdivisionAttendue }]
          : [],
      ),
    };
  }

  /**
   * Rattachements du dossier, indexés par `code::cleRubrique`, chaque entrée
   * portant les NUMÉROS de comptes (pas les identifiants) — le résolveur
   * travaille sur les numéros de la balance.
   */
  private async chargerRattachements(tenantId: string, jeu: JeuEtatsFinanciersSycebnl): Promise<Map<string, string[]>> {
    const lignes = await this.prisma.rattachementNote.findMany({
      where: { tenantId, jeu },
      select: { codeNote: true, cleRubrique: true, compte: { select: { numero: true } } },
    });
    const parRubrique = new Map<string, string[]>();
    for (const l of lignes) {
      const cle = `${l.codeNote}::${l.cleRubrique}`;
      parRubrique.set(cle, [...(parRubrique.get(cle) ?? []), l.compte.numero]);
    }
    return parRubrique;
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

    const rattachements = await this.chargerRattachements(tenantId, JeuEtatsFinanciersSycebnl.ASSOCIATIONS_ORDRES_PROFESSIONNELS);
    const notes = NOTES_ASSOCIATIONS.map((spec) => this.calculerNote(spec, lignesN, lignesN1, exerciceN1Id !== null, rattachements));

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
