import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { JeuNotesAnnexes, Referentiel } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { ExerciceService } from '../exercice/exercice.service';
import { EtatsFinanciersProjetBudgetService } from '../etats-financiers/etats-financiers-projet-budget.service';
import { EtatsFinanciersService } from '../etats-financiers/etats-financiers.service';
import {
  INDICATEURS_LAISSES_EN_SAISIE,
  cessionsDeLExercice,
  indicateursNote33,
} from './indicateurs-note-33';
import { LigneBalancePourEtat, chargerLignes, correspond, trouverExerciceN1 } from '../etats-financiers/etats-financiers.communs';
import {
  CompteDeRubrique,
  LigneNoteCalculee,
  NoteCalculee,
  RubriqueEnAttente,
  RubriqueNote,
  SpecificationNote,
  TypeColonneNote,
} from './note-annexe.types';
import { NOTES_ASSOCIATIONS } from './correspondance-notes-associations';
import { NOTES_PROJETS } from './correspondance-notes-projets';
import {
  NOMBRE_NOTES_SYSCOHADA,
  NOTES_SYSCOHADA,
  numeroDeTeteNoteSyscohada,
} from '../etats-financiers-syscohada/correspondance-notes-syscohada';

/**
 * Spécifications du jeu, indexées par `JeuNotesAnnexes` · un seul point
 * d'entrée pour les trois jeux transcrits.
 *
 * `Record` COMPLET et non `Partial` : ajouter une valeur à l'enum sans lui
 * donner ses notes casse alors la compilation, au lieu de produire un jeu
 * silencieusement vide. Les trois autres tables de ce fichier suivent la même
 * règle pour la même raison.
 *
 * Le SYSCOHADA n'emprunte RIEN au SYCEBNL ici · seul le moteur déclaratif
 * (`note-annexe.types.ts`) est commun, comme le pose CLAUDE.md §6. Ses notes
 * viennent de l'AUDCIF Titre IX ch. 6, celles du SYCEBNL de la Partie 4 de
 * son propre texte.
 */
const NOTES_PAR_JEU: Record<JeuNotesAnnexes, SpecificationNote[]> = {
  [JeuNotesAnnexes.ASSOCIATIONS_ORDRES_PROFESSIONNELS]: NOTES_ASSOCIATIONS,
  [JeuNotesAnnexes.PROJETS_DEVELOPPEMENT]: NOTES_PROJETS,
  [JeuNotesAnnexes.SYSCOHADA_SYSTEME_NORMAL]: NOTES_SYSCOHADA,
};

/** Nombre de notes que le texte officiel attend pour ce jeu · sert à `couverture`. */
const NOTES_ATTENDUES_PAR_JEU: Record<JeuNotesAnnexes, number> = {
  [JeuNotesAnnexes.ASSOCIATIONS_ORDRES_PROFESSIONNELS]: 45,
  [JeuNotesAnnexes.PROJETS_DEVELOPPEMENT]: 26,
  // AUDCIF Titre IX ch. 6 section 2 « Liste officielle des Notes annexes » :
  // NOTE 1 à NOTE 36. Voir NOMBRE_NOTES_SYSCOHADA, qui porte la valeur et sa
  // source · on ne la réécrit pas ici de mémoire.
  [JeuNotesAnnexes.SYSCOHADA_SYSTEME_NORMAL]: NOMBRE_NOTES_SYSCOHADA,
};

/**
 * Ce qui compte pour UNE note officielle dans `couverture.transcrites`.
 *
 * Les deux jeux SYCEBNL donnent un code unique par note et rangent leurs
 * tableaux multiples sous ce même code (`sousTableau`) : compter les codes
 * distincts suffit. Le SYSCOHADA, lui, SUBDIVISE le numéro officiel en codes
 * distincts · la NOTE 3 se décline en 3A à 3F, la 15 en 15A et 15B, la 16 en
 * 16A, 16B, 16B bis et 16C, la 27 en 27A et 27B (AUDCIF Titre IX ch. 6,
 * section 2). Ses 46 codes ne valent donc que 36 notes : sans cette
 * réduction, `transcrites` afficherait 46 contre 36 attendues et ferait
 * passer un jeu complet pour un jeu en excédent.
 */
/**
 * Code de la note qui porte le TABLEAU D'EXÉCUTION BUDGÉTAIRE, par jeu.
 *
 * C'est le MÊME tableau sous deux numéros · la 35 chez les associations
 * (Partie 4 ch. 2), la 24 chez les projets de développement (ch. 3), chaque
 * chapitre numérotant ses propres notes. Le SYSCOHADA n'en a pas : l'AUDCIF
 * ne demande aucun état budgétaire, et lui en servir un serait exactement la
 * transposition que CLAUDE.md §6 interdit.
 */
const CODE_NOTE_EXECUTION_BUDGETAIRE: Record<JeuNotesAnnexes, string | null> = {
  [JeuNotesAnnexes.ASSOCIATIONS_ORDRES_PROFESSIONNELS]: '35',
  [JeuNotesAnnexes.PROJETS_DEVELOPPEMENT]: '24',
  [JeuNotesAnnexes.SYSCOHADA_SYSTEME_NORMAL]: null,
};

const NUMERO_OFFICIEL_PAR_JEU: Record<JeuNotesAnnexes, (code: string) => string> = {
  [JeuNotesAnnexes.ASSOCIATIONS_ORDRES_PROFESSIONNELS]: (code) => code,
  [JeuNotesAnnexes.PROJETS_DEVELOPPEMENT]: (code) => code,
  [JeuNotesAnnexes.SYSCOHADA_SYSTEME_NORMAL]: (code) => String(numeroDeTeteNoteSyscohada(code)),
};

/**
 * Référentiel du dossier auquel chaque jeu de notes appartient.
 *
 * CLAUDE.md §6 : « les deux référentiels ne partagent ni plan de comptes, ni
 * états financiers, ni vocabulaire ». Un rattachement croisé (un dossier
 * SYSCOHADA qui viserait une rubrique de note SYCEBNL, ou l'inverse) est donc
 * un défaut de cloisonnement, pas une commodité · il est refusé
 * explicitement. Ce contrôle vit ici, et non dans une garde de route, parce
 * que les routes de rattachement servent LES DEUX référentiels : les fermer à
 * l'un ou à l'autre par `@ReferentielsAutorises` fermerait la fonction à
 * moitié des dossiers.
 */
const REFERENTIEL_DU_JEU: Record<JeuNotesAnnexes, Referentiel> = {
  [JeuNotesAnnexes.ASSOCIATIONS_ORDRES_PROFESSIONNELS]: Referentiel.SYCEBNL,
  [JeuNotesAnnexes.PROJETS_DEVELOPPEMENT]: Referentiel.SYCEBNL,
  [JeuNotesAnnexes.SYSCOHADA_SYSTEME_NORMAL]: Referentiel.SYSCOHADA,
};

/**
 * Ventilation d'un solde de tiers par échéance, telle que les notes 6, 9, 10,
 * 18A et 19 à 21 la demandent. `nonVentile` n'est pas une quatrième échéance :
 * c'est ce que le dossier n'a pas renseigné. Le ranger d'office en « à un an
 * au plus » afficherait une ventilation complète et fausse.
 */
interface Echeances {
  unAn: number;
  deuxAns: number;
  plusDeDeuxAns: number;
  nonVentile: number;
}

const ECHEANCES_NULLES: Echeances = { unAn: 0, deuxAns: 0, plusDeDeuxAns: 0, nonVentile: 0 };

/**
 * Nature d'un mouvement de provision ou de dépréciation, telle que la note 30
 * la ventile. Elle ne se lit PAS sur le compte de provision · 191 est le même
 * compte quelle que soit l'origine de la dotation · mais sur la CONTREPARTIE
 * de l'écriture.
 */
type NatureMouvement = 'EXPLOITATION' | 'FINANCIER' | 'HAO';

interface VentilationNature {
  augmentation: Record<NatureMouvement, number>;
  diminution: Record<NatureMouvement, number>;
  /**
   * Mouvements dont la contrepartie ne relève d'aucune des trois natures
   * (virement de provision à provision, écriture manuelle atypique). Comme
   * pour les échéances : c'est une lacune, elle est dite, pas rangée d'office
   * en exploitation.
   */
  nonVentile: { augmentation: number; diminution: number };
}

const VENTILATION_NULLE = (): VentilationNature => ({
  augmentation: { EXPLOITATION: 0, FINANCIER: 0, HAO: 0 },
  diminution: { EXPLOITATION: 0, FINANCIER: 0, HAO: 0 },
  nonVentile: { augmentation: 0, diminution: 0 },
});

/**
 * Nature d'un compte de contrepartie, d'après le plan normalisé (Partie 2,
 * ch. 2 et 3). L'ordre des tests compte : le financier et le hors activités
 * ordinaires sont testés AVANT le repli sur l'exploitation, sans quoi 697 et
 * 85 seraient rangés en exploitation par leur seule classe.
 */
function natureDeLaContrepartie(numero: string): NatureMouvement | null {
  // Classe 8 : 839/85 dotations H.A.O., 849/86 reprises H.A.O.
  if (numero.startsWith('8')) return 'HAO';
  // 679 et 697 dotations financières ; 779 et 797 reprises financières.
  // Les comptes 67 et 77 entiers sont financiers par nature.
  if (['67', '77', '697', '797'].some((prefixe) => numero.startsWith(prefixe))) return 'FINANCIER';
  // 659, 691, 695 dotations d'exploitation ; 759, 791, 792, 795, 796, 799
  // reprises d'exploitation. Le repli sur les classes 6 et 7 couvre le reste.
  if (numero.startsWith('6') || numero.startsWith('7')) return 'EXPLOITATION';
  return null;
}

/**
 * Une rubrique résolue sur un exercice : le montant au sens de lecture de la
 * rubrique, plus les agrégats bruts dont les tableaux de situations et
 * mouvements ont besoin. Ces agrégats restent NON orientés · c'est
 * `colonnesDeMouvement` qui les oriente selon `sensAccroissement`.
 */
interface RubriqueResolue {
  montant: number;
  comptes: CompteDeRubrique[];
  /** Report à-nouveau, en solde (débit − crédit). */
  report: number;
  mouvementDebit: number;
  mouvementCredit: number;
  echeances: Echeances;
  ventilation: VentilationNature;
}

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
 *   colonne N-1 systématique, `undefined` jamais 0 s'il n'y a pas
 *   d'exercice antérieur.
 */
/**
 * Taille d'un lot de lecture. Cinq mille éléments pèsent quelques mégaoctets
 * et tiennent dans n'importe quel conteneur · l'intérêt n'est pas la vitesse,
 * c'est que la mémoire ne dépende PLUS de la taille du dossier.
 */
export const LOT_LECTURE = 5000;

/**
 * Parcourt une collection par tranches, curseur sur l'identifiant · sortie au
 * niveau du module pour être éprouvée telle quelle, comme l'interception du
 * journal d'audit. Un parcours qu'on ne peut pas tester est un parcours qu'on
 * croit juste.
 *
 * DEUX PIÈGES, et chacun donne une note annexe FAUSSE sans lever d'erreur :
 *
 *  · sans `skip: 1` chez l'appelant, Prisma rend de nouveau la ligne du
 *    curseur à chaque tranche · son montant est compté deux fois ;
 *  · s'arrêter sur un lot VIDE plutôt que sur un lot INCOMPLET fait une
 *    requête de plus à chaque appel, pour rien.
 *
 * L'arrêt se fait donc sur un lot plus court que la taille demandée, et le
 * curseur avance sur le DERNIER élément rendu.
 */
export async function lireParLots<T extends { id: string }>(
  charger: (curseur: string | undefined) => Promise<T[]>,
  traiter: (element: T) => void,
  taille = LOT_LECTURE,
): Promise<void> {
  let curseur: string | undefined;
  for (;;) {
    const lot = await charger(curseur);
    for (const element of lot) traiter(element);
    if (lot.length < taille) return;
    curseur = lot[lot.length - 1].id;
  }
}

@Injectable()
export class NoteAnnexeService {
  constructor(
    private readonly ecritureService: EcritureService,
    private readonly exerciceService: ExerciceService,
    private readonly prisma: PrismaService,
    // Le tableau d'exécution budgétaire des notes 35 (associations) et 24
    // (projets) est CELUI de la fenêtre États financiers · le recalculer ici
    // donnerait deux chiffres pour un seul état.
    private readonly budgetService: EtatsFinanciersProjetBudgetService,
    // Bilan, compte de résultat et tableau de flux · la note 33 les résume,
    // elle ne les recalcule pas (voir `indicateurs-note-33.ts`).
    private readonly etatsFinanciersService: EtatsFinanciersService,
  ) {}

  /**
   * Retrouve une rubrique et vérifie qu'elle accepte bien un rattachement.
   *
   * GARDE-FOU CENTRAL : seule une rubrique déclarée `subdivisionAttendue` est
   * rattachable. Les rubriques dont le rattachement découle du plan de comptes
   * normalisé sont intouchables · les laisser modifier permettrait de défaire
   * en silence la fidélité au texte officiel, ce que toute la discipline du
   * projet vise à empêcher. Un rattachement sur une rubrique officielle est
   * refusé explicitement, jamais ignoré.
   */
  private rubriqueRattachable(jeu: JeuNotesAnnexes, codeNote: string, cleRubrique: string) {
    // `NOTES_PAR_JEU` est un Record COMPLET : tout jeu de l'enum a ses notes,
    // et le compilateur l'exige. Le repli « jeu non transcrit » qui vivait ici
    // ne pouvait donc plus se produire.
    const specs = NOTES_PAR_JEU[jeu];
    // Un code de note peut désigner plusieurs TABLEAUX (note 1, note 7,
    // note 29B…) · ils ne partagent jamais de clé de rubrique entre eux
    // (test structurel dédié), donc chercher la clé dans TOUS les tableaux
    // du code reste sans ambiguïté.
    const tableaux = specs.filter((n) => n.code === codeNote);
    if (tableaux.length === 0) throw new NotFoundException(`Aucune note « ${codeNote} » dans ce jeu d'états financiers.`);
    const spec = tableaux.find((n) => n.rubriques.some((r) => r.cle === cleRubrique)) ?? tableaux[0];
    // Une rubrique que le plan officiel détermine ne porte PAS de clé : rien
    // n'a besoin de la désigner, et lui en donner une laisserait croire qu'elle
    // est adressable. Conséquence : une clé introuvable recouvre deux cas · la
    // clé est fausse, ou elle vise une rubrique officielle. Le message doit dire
    // les deux, sans quoi l'utilisateur croit à une faute de frappe alors que
    // c'est le garde-fou qui a joué.
    const rubrique = spec.rubriques.find((r) => r.cle === cleRubrique);
    if (!rubrique) {
      throw new NotFoundException(
        `La note ${codeNote} n'a pas de rubrique rattachable « ${cleRubrique} » : soit la clé est erronée, ` +
          `soit elle désigne une rubrique que le plan de comptes officiel détermine déjà · celles-là ne sont ` +
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

  /**
   * Vérifie que le jeu de notes visé est bien celui du référentiel du dossier.
   *
   * Les routes de rattachement sont OUVERTES aux deux référentiels · elles
   * servent aussi bien les notes SYCEBNL que les 36 notes SYSCOHADA, et une
   * garde `@ReferentielsAutorises` ne saurait laisser passer que l'un des
   * deux. Le cloisonnement de CLAUDE.md §6 se joue donc ici, sur le couple
   * (référentiel du dossier, jeu demandé) : un dossier SYSCOHADA ne rattache
   * qu'au jeu SYSCOHADA, un dossier SYCEBNL qu'à ses deux jeux. Un croisement
   * est refusé explicitement, jamais ignoré · le laisser passer stockerait un
   * rattachement que le moteur du dossier ne relira jamais, donc une rubrique
   * qui reste vide sans que rien ne le dise.
   */
  private async verifierJeuDuDossier(tenantId: string, jeu: JeuNotesAnnexes) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { referentiel: true },
    });
    if (!tenant) throw new NotFoundException('Dossier introuvable.');
    const attendu = REFERENTIEL_DU_JEU[jeu];
    if (tenant.referentiel !== attendu) {
      throw new BadRequestException(
        `Le jeu de notes « ${jeu} » relève du référentiel ${attendu}, alors que ce dossier est en ` +
          `${tenant.referentiel}. Les deux référentiels ne partagent ni plan de comptes, ni états ` +
          `financiers, ni notes annexes : un rattachement croisé n'aurait aucun sens comptable.`,
      );
    }
  }

  /** Rattache un compte du dossier à une rubrique en attente. */
  async rattacher(
    tenantId: string,
    userId: string,
    jeu: JeuNotesAnnexes,
    codeNote: string,
    cleRubrique: string,
    compteId: string,
  ) {
    await this.verifierJeuDuDossier(tenantId, jeu);
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

  async detacher(tenantId: string, jeu: JeuNotesAnnexes, codeNote: string, cleRubrique: string, compteId: string) {
    // Même contrôle qu'au rattachement : sans lui, un dossier pourrait
    // supprimer des rattachements d'un jeu qui n'est pas le sien · sans effet
    // visible chez lui, mais bien réel en base.
    await this.verifierJeuDuDossier(tenantId, jeu);
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
    echeancesParCompte: Map<string, Echeances> = new Map(),
    ventilationParCompte: Map<string, VentilationNature> = new Map(),
  ): RubriqueResolue {
    // Les comptes rattachés par le dossier S'AJOUTENT aux préfixes officiels,
    // ils ne les remplacent jamais (voir RattachementNote, prisma/schema.prisma).
    const prefixes = [...(rubrique.comptes ?? []), ...numerosRattaches];
    if (prefixes.length === 0) {
      return {
        montant: 0, comptes: [], report: 0, mouvementDebit: 0, mouvementCredit: 0,
        echeances: { ...ECHEANCES_NULLES }, ventilation: VENTILATION_NULLE(),
      };
    }
    let matches = lignes.filter((l) => correspond(l.numero, prefixes, rubrique.exclusions));
    if (rubrique.sens === 'DEBITEUR') matches = matches.filter((l) => l.solde > 0);
    if (rubrique.sens === 'CREDITEUR') matches = matches.filter((l) => l.solde < 0);
    const litAuCredit = rubrique.sens === 'CREDITEUR' || rubrique.natureCreditrice === true;

    const source = rubrique.source ?? 'SOLDE';
    const comptes: CompteDeRubrique[] = matches.map((l) => {
      let montant: number;
      if (source === 'MOUVEMENT_DEBIT') montant = l.totalDebit;
      else if (source === 'MOUVEMENT_CREDIT') montant = l.totalCredit;
      // `SOLDE` : le signe est ramené au sens de lecture de la rubrique. Une
      // rubrique créditrice (dettes, dépréciations) s'affiche en positif.
      else montant = litAuCredit || rubrique.presenterEnNegatif ? -l.solde : l.solde;
      return { numero: l.numero, intitule: l.intitule, montant };
    });

    const brut = comptes.reduce((s, c) => s + c.montant, 0);
    // `|| 0` normalise -0 en 0 (même souci de propreté qu'au bilan).
    return {
      montant: (rubrique.presenterEnNegatif ? -brut : brut) || 0,
      comptes,
      // Agrégats bruts (jamais retournés au sens de lecture) : les colonnes
      // A/B/C/D les orientent elles-mêmes selon `sensAccroissement`.
      report: matches.reduce((s, l) => s + l.reportDebit - l.reportCredit, 0),
      mouvementDebit: matches.reduce((s, l) => s + l.mouvementDebit, 0),
      mouvementCredit: matches.reduce((s, l) => s + l.mouvementCredit, 0),
      // Les échéances suivent le sens de lecture de la rubrique, comme le
      // montant : sur une rubrique créditrice (dettes), une dette de 700
      // s'affiche 700 et non -700.
      echeances: matches.reduce((acc, l) => {
        const e = echeancesParCompte.get(l.numero);
        if (!e) return acc;
        const signe = litAuCredit || rubrique.presenterEnNegatif ? -1 : 1;
        return {
          unAn: acc.unAn + signe * e.unAn,
          deuxAns: acc.deuxAns + signe * e.deuxAns,
          plusDeDeuxAns: acc.plusDeDeuxAns + signe * e.plusDeDeuxAns,
          nonVentile: acc.nonVentile + signe * e.nonVentile,
        };
      }, { ...ECHEANCES_NULLES }),
      ventilation: matches.reduce((acc, l) => {
        const v = ventilationParCompte.get(l.numero);
        if (!v) return acc;
        for (const n of ['EXPLOITATION', 'FINANCIER', 'HAO'] as const) {
          acc.augmentation[n] += v.augmentation[n];
          acc.diminution[n] += v.diminution[n];
        }
        acc.nonVentile.augmentation += v.nonVentile.augmentation;
        acc.nonVentile.diminution += v.nonVentile.diminution;
        return acc;
      }, VENTILATION_NULLE()),
    };
  }

  /**
   * Colonnes A/B/C/D d'un tableau de situations et mouvements (notes 5A-5F, 30).
   *
   * A = report à-nouveau, orienté dans le sens du poste ; B et C = mouvements
   * PROPRES de l'exercice (report exclu · voir `EcritureService.balance`) ;
   * D = A + B - C, la formule que le texte officiel écrit lui-même en tête de
   * colonne. D est donc RECALCULÉ, jamais lu : l'écart avec le solde réel de la
   * balance devient un contrôle offert à l'utilisateur (`ecartCloture`).
   */
  private colonnesDeMouvement(
    spec: SpecificationNote,
    r: RubriqueResolue,
  ): { valeurs: Partial<Record<TypeColonneNote, number>>; ecartCloture?: number } {
    const auCredit = spec.sensAccroissement === 'CREDIT';
    const ouverture = (auCredit ? -r.report : r.report) || 0;
    const augmentations = (auCredit ? r.mouvementCredit : r.mouvementDebit) || 0;
    const diminutions = (auCredit ? r.mouvementDebit : r.mouvementCredit) || 0;
    const cloture = ouverture + augmentations - diminutions;
    // `montant` est le solde réel de la balance. `calculerRubrique` ne
    // l'oriente que si la rubrique porte `sens`/`presenterEnNegatif` · ce que
    // les tableaux de mouvements ne font pas ·, donc l'orientation au sens de
    // lecture se fait ici, UNE fois. (Une double négation à cet endroit ne se
    // voyait pas dans le sens débit, où elle est neutre ; le premier cas
    // crédit l'a fait ressortir avec un écart de 4400 sur un tableau juste.)
    const reel = auCredit ? -r.montant : r.montant;
    const ecart = cloture - reel;
    return {
      valeurs: { OUVERTURE: ouverture, AUGMENTATIONS: augmentations, DIMINUTIONS: diminutions, CLOTURE: cloture },
      ecartCloture: Math.abs(ecart) > 0.005 ? ecart : undefined,
    };
  }

  /** Résout toutes les rubriques d'une note pour un exercice donné, totaux compris. */
  private resoudreRubriques(
    spec: SpecificationNote,
    lignes: LigneBalancePourEtat[],
    rattachements: Map<string, string[]> = new Map(),
    echeancesParCompte: Map<string, Echeances> = new Map(),
    ventilationParCompte: Map<string, VentilationNature> = new Map(),
  ): RubriqueResolue[] {
    const resolues: RubriqueResolue[] = [];
    for (const rubrique of spec.rubriques) {
      if (rubrique.totalDeRubriques) {
        // Un total ne référence que des rubriques déjà résolues · vérifié par
        // un test structurel sur chaque spécification. Les agrégats de
        // mouvement se totalisent de la même façon, sinon la ligne TOTAL
        // GENERAL des notes 5A-5F resterait vide en colonnes A/B/C/D.
        const cumul = (f: 'montant' | 'report' | 'mouvementDebit' | 'mouvementCredit') =>
          rubrique.totalDeRubriques!.reduce((s, i) => s + (resolues[i]?.[f] ?? 0), 0) -
          (rubrique.moinsRubriques ?? []).reduce((s, i) => s + (resolues[i]?.[f] ?? 0), 0);
        const cumulEcheance = (f: keyof Echeances) =>
          rubrique.totalDeRubriques!.reduce((s, i) => s + (resolues[i]?.echeances[f] ?? 0), 0) -
          (rubrique.moinsRubriques ?? []).reduce((s, i) => s + (resolues[i]?.echeances[f] ?? 0), 0);
        resolues.push({
          montant: cumul('montant'),
          comptes: [],
          report: cumul('report'),
          mouvementDebit: cumul('mouvementDebit'),
          mouvementCredit: cumul('mouvementCredit'),
          echeances: {
            unAn: cumulEcheance('unAn'),
            deuxAns: cumulEcheance('deuxAns'),
            plusDeDeuxAns: cumulEcheance('plusDeDeuxAns'),
            nonVentile: cumulEcheance('nonVentile'),
          },
          ventilation: (rubrique.totalDeRubriques ?? []).reduce((acc, i) => {
            const v = resolues[i]?.ventilation;
            if (!v) return acc;
            for (const n of ['EXPLOITATION', 'FINANCIER', 'HAO'] as const) {
              acc.augmentation[n] += v.augmentation[n];
              acc.diminution[n] += v.diminution[n];
            }
            acc.nonVentile.augmentation += v.nonVentile.augmentation;
            acc.nonVentile.diminution += v.nonVentile.diminution;
            return acc;
          }, VENTILATION_NULLE()),
        });
      } else {
        const cle = rubrique.cle ? `${spec.code}::${rubrique.cle}` : '';
        resolues.push(
          this.calculerRubrique(rubrique, lignes, rattachements.get(cle) ?? [], echeancesParCompte, ventilationParCompte),
        );
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
    echeancesParCompte: Map<string, Echeances>,
    ventilationParCompte: Map<string, VentilationNature>,
    saisies: Map<string, (string | number | null)[]> = new Map(),
  ): NoteCalculee {
    const resN = this.resoudreRubriques(spec, lignesN, rattachements, echeancesParCompte, ventilationParCompte);
    // N-1 n'est pas ventilé par échéance : le texte ne demande les colonnes
    // d'échéance que sur l'exercice présenté.
    const resN1 = this.resoudreRubriques(spec, lignesN1, rattachements);
    const aColonnesDeMouvement = spec.colonnes.some((c) =>
      (['OUVERTURE', 'AUGMENTATIONS', 'DIMINUTIONS', 'CLOTURE'] as TypeColonneNote[]).includes(c.type),
    );
    const aColonneVariationAbsolue = spec.colonnes.some((c) => c.type === 'VARIATION_VALEUR_ABSOLUE');
    const aColonnesVentilees = spec.colonnes.some((c) => c.type.startsWith('AUGMENTATION_') || c.type.startsWith('DIMINUTION_'));
    const aColonnesDEcheance = spec.colonnes.some((c) =>
      (['ECHEANCE_1AN', 'ECHEANCE_2ANS', 'ECHEANCE_PLUS_2ANS'] as TypeColonneNote[]).includes(c.type),
    );

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
      // Les colonnes A/B/C/D ne sont calculées que si la note les déclare :
      // les 38 notes qui n'en ont pas ne portent pas de champ vide.
      const mouvements = aColonnesDeMouvement ? this.colonnesDeMouvement(spec, resN[i]) : undefined;
      const variationAbsolue =
        aColonneVariationAbsolue && variationValeur !== undefined
          ? { VARIATION_VALEUR_ABSOLUE: Math.abs(variationValeur) }
          : undefined;
      const v = resN[i].ventilation;
      const ventilees = aColonnesVentilees
        ? {
            AUGMENTATION_EXPLOITATION: v.augmentation.EXPLOITATION || 0,
            AUGMENTATION_FINANCIERE: v.augmentation.FINANCIER || 0,
            AUGMENTATION_HAO: v.augmentation.HAO || 0,
            DIMINUTION_EXPLOITATION: v.diminution.EXPLOITATION || 0,
            DIMINUTION_FINANCIERE: v.diminution.FINANCIER || 0,
            DIMINUTION_HAO: v.diminution.HAO || 0,
          }
        : undefined;
      const e = resN[i].echeances;
      const echeances = aColonnesDEcheance
        ? {
            ECHEANCE_1AN: e.unAn || 0,
            ECHEANCE_2ANS: e.deuxAns || 0,
            ECHEANCE_PLUS_2ANS: e.plusDeDeuxAns || 0,
          }
        : undefined;
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
        valeurs:
          mouvements || echeances || variationAbsolue || ventilees
            ? { ...mouvements?.valeurs, ...echeances, ...variationAbsolue, ...ventilees }
            : undefined,
        ecartCloture: mouvements?.ecartCloture,
        // Ce que le dossier n'a pas renseigné : présenté à part, jamais fondu
        // dans « à un an au plus ».
        echeanceNonVentilee: aColonnesDEcheance && Math.abs(e.nonVentile) > 0.005 ? e.nonVentile : undefined,
        // Mouvements dont la contrepartie ne relève d'aucune des trois natures.
        // Dit, jamais rangé d'office en exploitation.
        natureNonVentilee:
          aColonnesVentilees && Math.abs(v.nonVentile.augmentation) + Math.abs(v.nonVentile.diminution) > 0.005
            ? { augmentation: v.nonVentile.augmentation, diminution: v.nonVentile.diminution }
            : undefined,
        comptes: resN[i].comptes,
        renvoi: rubrique.renvoi,
        // Rubrique renseignée hors comptabilité : une cellule par colonne,
        // `null` là où le dossier n'a rien écrit.
        saisie: rubrique.saisie
          ? spec.colonnes.map((_, ci) => saisies.get(`${spec.code}::${rubrique.cle}`)?.[ci] ?? null)
          : undefined,
      };
    });

    // § 1.4 : les lignes non chiffrées ne sont pas présentées. Une ligne en
    // attente de rattachement est CONSERVÉE même à zéro : son absence de
    // montant est une information à porter, pas un vide à masquer.
    // Une rubrique est « chiffrée » dès qu'UNE de ses colonnes l'est. Sans
    // cela, un poste entré et sorti dans l'exercice (ouverture 0, acquisition
    // 500, cession 500, clôture 0) disparaîtrait des notes 5A-5F alors que
    // c'est exactement le mouvement que ces tableaux ont pour objet de montrer.
    const chiffree = (l: LigneNoteCalculee) =>
      Math.abs(l.montantN) > 0.005 ||
      Math.abs(l.montantN1 ?? 0) > 0.005 ||
      Object.values(l.valeurs ?? {}).some((v) => Math.abs(v) > 0.005);
    const applicableChiffree = toutes.some((l) => !l.estTotal && chiffree(l));
    // Une note qui n'est chiffrée par aucune balance devient applicable dès
    // que le dossier a RENSEIGNÉ une de ses cellules · c'est le seul signal
    // qu'elle porte (note 18B « Actifs et passifs éventuels », par exemple,
    // n'est pas `horsBalance` mais n'est alimentée que par la saisie).
    const saisieRenseignee = toutes.some((l) => (l.saisie ?? []).some((v) => v !== null && v !== ''));
    const applicable = applicableChiffree || saisieRenseignee || (spec.horsBalance ?? false);
    // DÉFAUT CORRIGÉ : une note `horsBalance` (informations obligatoires,
    // effectifs, note 9 « fonds du bailleur »…) ne porte QUE des rubriques en
    // saisie, jamais chiffrées par construction · `chiffree()` vaut donc
    // toujours faux pour elles, et le filtre ci-dessous les retirait TOUTES,
    // malgré `applicable: true` retourné. La note se déclarait applicable et
    // ne présentait rien : relevé en vérifiant de bout en bout, sur base
    // réelle, une note qui n'avait jamais eu ses lignes lues jusque-là. Le
    // filtre du § 1.4 (retirer les lignes non chiffrées) n'a de sens que pour
    // une note qui PEUT être chiffrée ; une note hors balance est entièrement
    // en saisie par nature, donc entièrement montrée.
    // Les rubriques EN SAISIE échappent au filtre, applicable ou non : ce sont
    // des lignes à REMPLIR, et les masquer tant qu'elles sont vides rendrait
    // la note impossible à alimenter depuis le logiciel · c'est précisément
    // ce que la liasse reprochait à l'écran avant le 2026-09-03.
    const enSaisie = toutes.filter((l) => l.saisie !== undefined);
    const lignes = !applicable
      ? enSaisie
      : spec.horsBalance
        ? toutes
        : toutes.filter((l) => l.saisie !== undefined || chiffree(l) || l.estTotal || l.enAttenteDeRattachement);

    return {
      code: spec.code,
      sousTableau: spec.sousTableau,
      titre: spec.titre,
      colonnes: spec.colonnes,
      lignes,
      commentaire: spec.commentaire,
      renvoiOfficiel: spec.renvoiOfficiel,
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
   * Ventilation des mouvements de provisions et de dépréciations par NATURE de
   * la contrepartie, par numéro de compte · ce que la note 30 demande.
   *
   * Le principe : pour chaque ligne portée sur un compte cible, les lignes de
   * SENS OPPOSÉ de la même écriture donnent la nature. Une écriture à deux
   * lignes (le cas courant : dotation 6911 / provision 191) tombe entièrement
   * dans une seule nature ; une écriture multi-lignes est répartie au prorata
   * des contreparties, ce qui redonne exactement le cas simple quand il n'y en
   * a qu'une.
   *
   * Les écritures générées par la clôture sont exclues, comme partout :
   * le report à-nouveau est l'ouverture, pas un mouvement de l'exercice.
   */
  private async chargerVentilationParNature(tenantId: string, exerciceId: string): Promise<Map<string, VentilationNature>> {
    const parCompte = new Map<string, VentilationNature>();

    // PAR LOTS, ET NON D'UN SEUL COUP · ce chargement ramenait TOUTES les
    // écritures de l'exercice avec toutes leurs lignes. Mesuré le
    // 2026-09-03 sur un dossier d'un million de lignes : la liasse complète
    // mourait ici, `JavaScript heap out of memory`, processus arrêté et tous
    // les autres dossiers de l'instance avec lui.
    //
    // L'algorithme n'est PAS touché · l'accumulateur est une carte par
    // compte, minuscule, et la ventilation au prorata se joue à l'intérieur
    // d'une écriture. Lire par tranches donne donc exactement le même
    // résultat, à mémoire constante.
    await this.parLots(
      (curseur) =>
        this.prisma.ecriture.findMany({
          where: { tenantId, exerciceId, estGenereeParCloture: false },
          select: { id: true, lignes: { select: { debit: true, credit: true, compte: { select: { numero: true } } } } },
          orderBy: { id: 'asc' },
          take: NoteAnnexeService.LOT_LECTURE,
          ...(curseur ? { cursor: { id: curseur }, skip: 1 } : {}),
        }),
      (e) => {
      const lignes = e.lignes.map((l) => ({
        numero: l.compte.numero,
        debit: Number(l.debit),
        credit: Number(l.credit),
      }));
      for (const ligne of lignes) {
        // Un mouvement CRÉDITEUR accroît une provision, un mouvement DÉBITEUR
        // la réduit · les rubriques de la note 30 sont toutes créditrices.
        //
        // Le côté se lit sur la PRÉSENCE d'un montant, pas sur son signe :
        // une correction par inscription en négatif (art. 20 de l'AUDCIF)
        // porte un crédit NÉGATIF, qui reste un crédit · et vaut une
        // augmentation négative, c'est-à-dire l'annulation de l'augmentation
        // erronée. Testé par `> 0`, ce crédit de −500 était lu comme une
        // diminution de `ligne.debit` (soit 0), donc SILENCIEUSEMENT IGNORÉ :
        // la note continuait d'afficher une augmentation annulée.
        const estCredit = Math.abs(ligne.credit) > 0.005;
        const sens: 'augmentation' | 'diminution' = estCredit ? 'augmentation' : 'diminution';
        const montant = estCredit ? ligne.credit : ligne.debit;
        if (montant === 0) continue;

        const contreparties = lignes.filter((c) =>
          estCredit ? Math.abs(c.debit) > 0.005 : Math.abs(c.credit) > 0.005,
        );
        const total = contreparties.reduce((s2, c) => s2 + (estCredit ? c.debit : c.credit), 0);
        const v = parCompte.get(ligne.numero) ?? VENTILATION_NULLE();
        if (total === 0) {
          v.nonVentile[sens] += montant;
        } else {
          for (const c of contreparties) {
            const part = (montant * (estCredit ? c.debit : c.credit)) / total;
            const nature = natureDeLaContrepartie(c.numero);
            if (nature) v[sens][nature] += part;
            else v.nonVentile[sens] += part;
          }
        }
        parCompte.set(ligne.numero, v);
      }
      },
    );
    return parCompte;
  }

  /**
   * Ventilation par échéance des soldes de tiers, par NUMÉRO de compte.
   *
   * Les bornes sont comptées depuis la date de CLÔTURE de l'exercice, comme
   * l'exige la lecture d'un état arrêté à cette date : « à un an au plus »
   * signifie exigible dans l'année qui suit la clôture, pas dans l'année qui
   * suit la saisie. Une ligne lettrée est soldée : elle n'a plus d'échéance à
   * porter et sort de la ventilation, exactement comme dans le report
   * à-nouveau en mode Détail.
   */
  private async chargerEcheances(tenantId: string, exerciceId: string): Promise<Map<string, Echeances>> {
    const exercice = await this.prisma.exercice.findFirst({ where: { id: exerciceId, tenantId } });
    if (!exercice) return new Map();

    const unAn = new Date(exercice.dateFin);
    unAn.setUTCFullYear(unAn.getUTCFullYear() + 1);
    const deuxAns = new Date(exercice.dateFin);
    deuxAns.setUTCFullYear(deuxAns.getUTCFullYear() + 2);

    const parCompte = new Map<string, Echeances>();
    // PAR LOTS · seconde source de l'étouffement mesuré le 2026-09-03. Sur un
    // dossier dont rien n'est encore lettré, ce filtre ne retire RIEN : il
    // ramenait la totalité des lignes de l'exercice.
    await this.parLots(
      (curseur) =>
        this.prisma.ligneEcriture.findMany({
          // Comme la balance qui alimente les autres notes : les notes annexes
          // font partie intégrante des états financiers (art. 15) et ne lisent que
          // le livre-journal, pas le brouillard.
          where: { ecriture: { tenantId, exerciceId, statut: 'VALIDEE' }, lettre: null },
          select: { id: true, debit: true, credit: true, dateEcheance: true, compte: { select: { numero: true } } },
          orderBy: { id: 'asc' },
          take: NoteAnnexeService.LOT_LECTURE,
          ...(curseur ? { cursor: { id: curseur }, skip: 1 } : {}),
        }),
      (l) => {
        const montant = Number(l.debit) - Number(l.credit);
        if (montant === 0) return;
        const e = parCompte.get(l.compte.numero) ?? { ...ECHEANCES_NULLES };
        if (!l.dateEcheance) e.nonVentile += montant;
        else if (l.dateEcheance <= unAn) e.unAn += montant;
        else if (l.dateEcheance <= deuxAns) e.deuxAns += montant;
        else e.plusDeDeuxAns += montant;
        parCompte.set(l.compte.numero, e);
      },
    );
    return parCompte;
  }

  private static readonly LOT_LECTURE = LOT_LECTURE;

  private parLots<T extends { id: string }>(
    charger: (curseur: string | undefined) => Promise<T[]>,
    traiter: (element: T) => void,
  ): Promise<void> {
    return lireParLots(charger, traiter);
  }

  /**
   * Rattachements du dossier, indexés par `code::cleRubrique`, chaque entrée
   * portant les NUMÉROS de comptes (pas les identifiants) · le résolveur
   * travaille sur les numéros de la balance.
   */
  private async chargerRattachements(tenantId: string, jeu: JeuNotesAnnexes): Promise<Map<string, string[]>> {
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
   * Ce que le dossier a saisi dans les rubriques renseignées hors
   * comptabilité, indexé par `code::cleRubrique`, chaque entrée portant un
   * tableau indexé par RANG DE COLONNE.
   *
   * Les trous sont conservés en `null` : une cellule jamais renseignée n'est
   * pas une cellule à zéro, et l'écran comme l'export doivent pouvoir faire
   * la différence.
   */
  private async chargerSaisies(
    tenantId: string,
    exerciceId: string,
    jeu: JeuNotesAnnexes,
  ): Promise<Map<string, (string | number | null)[]>> {
    const lignes = await this.prisma.saisieNote.findMany({
      where: { tenantId, exerciceId, jeu },
      select: { codeNote: true, cleRubrique: true, colonne: true, valeurTexte: true, valeurNombre: true },
    });
    const parRubrique = new Map<string, (string | number | null)[]>();
    for (const l of lignes) {
      const cle = `${l.codeNote}::${l.cleRubrique}`;
      const cellules = parRubrique.get(cle) ?? [];
      cellules[l.colonne] = l.valeurNombre !== null ? Number(l.valeurNombre) : l.valeurTexte;
      parRubrique.set(cle, cellules);
    }
    return parRubrique;
  }

  /**
   * Retrouve une rubrique EN SAISIE et la colonne visée, ou refuse.
   *
   * Même garde-fou que `rubriqueRattachable`, pour la même raison et en sens
   * inverse : on n'écrit à la main que dans une cellule qu'aucune balance ne
   * chiffre. Écrire dans une rubrique calculée donnerait deux sources pour un
   * même montant, dont l'une invisible dans le grand livre · exactement le
   * genre d'écart qui ne se découvre qu'au contrôle.
   */
  private celluleSaisissable(jeu: JeuNotesAnnexes, codeNote: string, cleRubrique: string, colonne: number) {
    const tableaux = NOTES_PAR_JEU[jeu].filter((n) => n.code === codeNote);
    if (tableaux.length === 0) throw new NotFoundException(`Aucune note « ${codeNote} » dans ce jeu d'états financiers.`);
    // Les clés sont uniques DANS UN CODE, sous-tableaux compris
    // (`rubriques-en-saisie.spec.ts`) : chercher dans tous les tableaux du
    // code reste sans ambiguïté.
    const spec = tableaux.find((n) => n.rubriques.some((r) => r.cle === cleRubrique));
    const rubrique = spec?.rubriques.find((r) => r.cle === cleRubrique);
    if (!spec || !rubrique) {
      throw new NotFoundException(`La note ${codeNote} n'a pas de rubrique « ${cleRubrique} ».`);
    }
    if (!rubrique.saisie) {
      throw new BadRequestException(
        `La rubrique « ${rubrique.libelle} » de la note ${codeNote} est chiffrée par la comptabilité : ` +
          `elle ne se saisit pas à la main. Corriger l'écriture, ou rattacher les comptes du dossier.`,
      );
    }
    const colonneSpec = spec.colonnes[colonne];
    if (!colonneSpec) {
      throw new BadRequestException(
        `La note ${codeNote} n'a pas de colonne n° ${colonne} · elle en compte ${spec.colonnes.length}.`,
      );
    }
    return { spec, rubrique, colonneSpec };
  }

  /**
   * Enregistre une cellule saisie. Une valeur vide EFFACE la cellule plutôt
   * que d'enregistrer une chaîne vide : sans cela, une cellule qu'on vide
   * resterait « renseignée à rien », indistinguable d'une cellule remplie
   * pour l'écran comme pour la note.
   */
  async enregistrerSaisie(
    tenantId: string,
    userId: string,
    exerciceId: string,
    jeu: JeuNotesAnnexes,
    codeNote: string,
    cleRubrique: string,
    colonne: number,
    valeur: string | number | null,
  ) {
    await this.verifierJeuDuDossier(tenantId, jeu);
    const exercice = await this.prisma.exercice.findFirst({ where: { id: exerciceId, tenantId } });
    if (!exercice) throw new NotFoundException('Exercice introuvable pour ce dossier.');
    const { colonneSpec } = this.celluleSaisissable(jeu, codeNote, cleRubrique, colonne);

    const ou = { tenantId_exerciceId_jeu_codeNote_cleRubrique_colonne: { tenantId, exerciceId, jeu, codeNote, cleRubrique, colonne } };
    const vide = valeur === null || valeur === undefined || (typeof valeur === 'string' && valeur.trim() === '');
    if (vide) {
      await this.prisma.saisieNote.deleteMany({ where: { tenantId, exerciceId, jeu, codeNote, cleRubrique, colonne } });
      return { efface: true };
    }

    // Le TYPE DE LA COLONNE commande, pas le type reçu : une colonne de
    // montant qui accepterait « environ 3 000 » sortirait telle quelle dans
    // la liasse, dans une cellule que le lecteur additionne.
    const chiffree = colonneSpec.type !== 'LIBRE';
    if (chiffree) {
      const nombre = typeof valeur === 'number' ? valeur : Number(String(valeur).replace(/\s/g, '').replace(',', '.'));
      if (!Number.isFinite(nombre)) {
        throw new BadRequestException(
          `La colonne « ${colonneSpec.libelle} » de la note ${codeNote} attend un montant · « ${valeur} » n'en est pas un.`,
        );
      }
      return this.prisma.saisieNote.upsert({
        where: ou,
        create: { tenantId, exerciceId, jeu, codeNote, cleRubrique, colonne, valeurNombre: nombre, updatedBy: userId },
        update: { valeurNombre: nombre, valeurTexte: null, updatedBy: userId },
      });
    }
    const texte = String(valeur);
    return this.prisma.saisieNote.upsert({
      where: ou,
      create: { tenantId, exerciceId, jeu, codeNote, cleRubrique, colonne, valeurTexte: texte, updatedBy: userId },
      update: { valeurTexte: texte, valeurNombre: null, updatedBy: userId },
    });
  }

  /**
   * Toutes les notes du jeu associations pour un exercice, plus la fiche
   * récapitulative · qui fait partie de la liasse : elle déclare, note par
   * note, si elle est applicable ou non.
   */
  /**
   * Toutes les notes d'un jeu pour un exercice, plus la fiche récapitulative
   * · qui fait partie de la liasse : elle déclare, note par note, si elle
   * est applicable ou non. Commune aux trois jeux transcrits : la seule
   * différence entre eux est la spécification (`NOTES_PAR_JEU`) et le
   * nombre de notes attendu par le texte officiel (`NOTES_ATTENDUES_PAR_JEU`).
   */
  private async notesDuJeu(tenantId: string, exerciceId: string, jeu: JeuNotesAnnexes) {
    const specs = NOTES_PAR_JEU[jeu];

    const exerciceN1Id = await trouverExerciceN1(this.exerciceService, tenantId, exerciceId);
    const [lignesN, lignesN1] = await Promise.all([
      chargerLignes(this.ecritureService, tenantId, exerciceId),
      chargerLignes(this.ecritureService, tenantId, exerciceN1Id),
    ]);

    const [rattachements, echeances, ventilation, saisies] = await Promise.all([
      this.chargerRattachements(tenantId, jeu),
      this.chargerEcheances(tenantId, exerciceId),
      this.chargerVentilationParNature(tenantId, exerciceId),
      this.chargerSaisies(tenantId, exerciceId, jeu),
    ]);
    const notes = specs.map((spec) =>
      this.calculerNote(spec, lignesN, lignesN1, exerciceN1Id !== null, rattachements, echeances, ventilation, saisies),
    );

    await this.injecterExecutionBudgetaire(notes, tenantId, exerciceId, jeu);
    await this.injecterIndicateursFinanciers(notes, tenantId, exerciceId, jeu, lignesN, lignesN1, exerciceN1Id !== null);

    return {
      notes,
      exerciceN1Disponible: exerciceN1Id !== null,
      // La fiche récapitulative recense les NOTES officielles ; une note à
      // plusieurs tableaux (note 1, note 7…) y tient une seule ligne,
      // applicable dès qu'un de ses tableaux l'est.
      ficheRecapitulative: [...new Set(notes.map((n) => n.code))].map((code) => {
        const tableaux = notes.filter((n) => n.code === code);
        return {
          code,
          titre: tableaux[0].titre,
          applicable: tableaux.some((n) => n.applicable),
          rubriquesEnAttente: tableaux.flatMap((n) => n.rubriquesEnAttente),
        };
      }),
      couverture: {
        // On compte les NOTES officielles, pas les tableaux ni les codes ·
        // voir NUMERO_OFFICIEL_PAR_JEU : le SYSCOHADA subdivise ses numéros
        // (3A à 3F, 16A à 16C…) et compter ses codes donnerait 46 pour 36
        // notes attendues.
        transcrites: new Set(specs.map((n) => NUMERO_OFFICIEL_PAR_JEU[jeu](n.code))).size,
        attendues: NOTES_ATTENDUES_PAR_JEU[jeu],
      },
    };
  }

  /**
   * Remplit le TABLEAU D'EXÉCUTION BUDGÉTAIRE de la note qui le porte · la 35
   * pour les associations, la 24 pour les projets de développement. C'est le
   * même tableau sous deux numéros, chaque chapitre numérotant les siennes.
   *
   * POURQUOI IL N'EST PAS SAISI · le budget n'est pas une donnée comptable,
   * c'est vrai, mais il est DANS le logiciel depuis la brique budgétaire
   * (`BudgetSection`, plan analytique à budgets), et la fenêtre États
   * financiers sert déjà ce tableau. Le laisser en saisie donnait deux
   * chiffres pour un seul état, dont un ressaisi à la main.
   *
   * Une ligne par section de la nomenclature budgétaire, plus le TOTAL, dans
   * les huit colonnes de la maquette. Les cellules sont VERROUILLÉES : elles
   * viennent d'un calcul, pas du clavier.
   *
   * REPLI SILENCIEUX · un dossier sans plan analytique à budgets n'a pas de
   * nomenclature budgétaire ; le service lève alors, et la note reste telle
   * que le texte la donne, en saisie. Ce n'est pas une erreur à remonter :
   * une association qui ne suit aucun budget n'a rien à exécuter.
   */
  private async injecterExecutionBudgetaire(
    notes: NoteCalculee[],
    tenantId: string,
    exerciceId: string,
    jeu: JeuNotesAnnexes,
  ) {
    const code = CODE_NOTE_EXECUTION_BUDGETAIRE[jeu];
    if (!code) return;
    const note = notes.find((n) => n.code === code);
    if (!note) return;

    let tableau: Awaited<ReturnType<EtatsFinanciersProjetBudgetService['executionBudgetaire']>>;
    try {
      tableau = await this.budgetService.executionBudgetaire(tenantId, exerciceId);
    } catch {
      return;
    }

    const cellules = (l: {
      code: string;
      libelle: string;
      budget: number;
      decaissement: number;
      engagement: number;
      realisation: number;
      creditDisponible: number;
      executionPourcent: number | null;
    }): (string | number | null)[] => [
      l.code,
      l.libelle,
      l.budget,
      l.decaissement,
      l.engagement,
      l.realisation,
      l.creditDisponible,
      l.executionPourcent,
    ];

    const lignes: LigneNoteCalculee[] = tableau.lignes.map((l) => ({
      libelle: `${l.code} · ${l.libelle}`,
      montantN: 0,
      estTotal: false,
      comptes: [],
      saisie: cellules(l),
      saisieVerrouillee: true,
    }));
    lignes.push({
      libelle: 'TOTAL',
      montantN: 0,
      estTotal: true,
      comptes: [],
      saisie: cellules({
        code: '',
        libelle: 'TOTAL',
        ...tableau.total,
        // Le pourcentage d'exécution du total se recalcule sur les totaux ·
        // la moyenne des pourcentages de ligne serait un autre nombre, et un
        // nombre faux.
        executionPourcent:
          Math.abs(tableau.total.budget) < 0.005 ? null : (tableau.total.realisation / tableau.total.budget) * 100,
      }),
      saisieVerrouillee: true,
    });

    note.lignes = lignes;
    // Un tableau chiffré rend la note applicable · sans quoi elle sortirait
    // avec la mention NEANT tout en portant des lignes.
    note.applicable = lignes.some((l) => (l.saisie ?? []).some((v) => typeof v === 'number' && Math.abs(v) > 0.005));
  }

  /**
   * Remplit la NOTE 33 « FICHE DE SYNTHESE DES PRINCIPAUX INDICATEURS
   * FINANCIERS » · jeu associations et ordres professionnels seulement, c'est
   * le seul des trois jeux à la porter.
   *
   * La note était transcrite en saisie au motif que le tableau de flux de
   * trésorerie n'existait pas. Il existe depuis, et la fiche n'a jamais eu
   * d'autre matière que les trois états : la laisser saisie faisait ressaisir
   * à la main vingt-quatre nombres déjà calculés, avec le risque qu'ils
   * cessent de correspondre aux états qu'ils résument.
   *
   * Vingt-quatre lignes sont donc calculées et VERROUILLÉES. La
   * vingt-cinquième, le ratio d'utilisation des dons, reste saisie : le texte
   * ne la rattache à aucun compte (voir `indicateurs-note-33.ts`).
   */
  private async injecterIndicateursFinanciers(
    notes: NoteCalculee[],
    tenantId: string,
    exerciceId: string,
    jeu: JeuNotesAnnexes,
    lignesN: LigneBalancePourEtat[],
    lignesN1: LigneBalancePourEtat[],
    exerciceN1Disponible: boolean,
  ) {
    if (jeu !== JeuNotesAnnexes.ASSOCIATIONS_ORDRES_PROFESSIONNELS) return;
    const note = notes.find((n) => n.code === '33');
    if (!note) return;

    const [bilan, compteDeResultat, fluxTresorerie] = await Promise.all([
      this.etatsFinanciersService.bilan(tenantId, exerciceId),
      this.etatsFinanciersService.compteDeResultat(tenantId, exerciceId),
      this.etatsFinanciersService.tableauFluxTresorerie(tenantId, exerciceId),
    ]);

    const indicateurs = new Map(
      indicateursNote33(
        { bilan, compteDeResultat, fluxTresorerie },
        cessionsDeLExercice(lignesN),
        cessionsDeLExercice(lignesN1),
        exerciceN1Disponible,
      ).map((i) => [i.cle, i]),
    );

    note.lignes = note.lignes.map((ligne) => {
      const i = ligne.cle ? indicateurs.get(ligne.cle) : undefined;
      if (!i) return ligne;
      const { valeurN, valeurN1 } = i;
      // Colonnes de la maquette : Année N, Année N-1, variation en valeur,
      // variation en %.
      const variationValeur = valeurN !== null && valeurN1 !== null ? valeurN - valeurN1 : null;
      // RENVOI (b) · « Les variations des ratios doivent être exprimées en
      // NOMBRE DE POINTS ». La variation d'un ratio est donc déjà donnée par
      // la colonne « variation en valeur », en points ; remplir en plus une
      // variation en pourcentage donnerait le pourcentage d'un pourcentage,
      // c'est-à-dire l'erreur exacte que ce renvoi existe pour empêcher.
      const variationPourcent =
        i.unite === 'POURCENT' || valeurN === null || valeurN1 === null || Math.abs(valeurN1) < 0.005
          ? null
          : ((valeurN - valeurN1) / Math.abs(valeurN1)) * 100;
      return {
        ...ligne,
        saisie: [valeurN, exerciceN1Disponible ? valeurN1 : null, variationValeur, variationPourcent],
        saisieVerrouillee: true,
      };
    });

    // La note devient applicable dès qu'un indicateur est chiffré · les
    // lignes laissées en saisie ne comptent pas, sans quoi une fiche vide
    // paraîtrait applicable parce qu'elle attend une saisie.
    note.applicable = note.lignes.some(
      (l) => l.saisieVerrouillee && (l.saisie ?? []).some((v) => typeof v === 'number' && Math.abs(v) > 0.005),
    );
    // Garde-fou de transcription : la seule rubrique attendue en saisie est
    // celle que le texte ne rattache à rien. Si une autre le devenait, c'est
    // qu'une clé aurait changé et qu'un indicateur ne serait plus calculé ·
    // en silence, et dans une fiche de synthèse publiée.
    const enSaisie = note.lignes.filter((l) => !l.saisieVerrouillee).map((l) => l.cle);
    if (enSaisie.length !== INDICATEURS_LAISSES_EN_SAISIE.length) {
      throw new Error(
        `Note 33 : ${enSaisie.length} rubriques non calculées (${enSaisie.join(', ')}) au lieu des ` +
          `${INDICATEURS_LAISSES_EN_SAISIE.length} attendues. Une clé de rubrique a changé.`,
      );
    }
  }

  /** Notes annexes du jeu « associations et ordres professionnels ». */
  async notesAssociations(tenantId: string, exerciceId: string) {
    return this.notesDuJeu(tenantId, exerciceId, JeuNotesAnnexes.ASSOCIATIONS_ORDRES_PROFESSIONNELS);
  }

  /**
   * Notes annexes du jeu « projets de développement et assimilés ».
   *
   * La NOTE 9 « FONDS DU BAILLEUR » n'y figure PAS : ses colonnes sont
   * dynamiques (une colonne par bailleur/sous-projet, cumulée depuis
   * l'origine du projet, pas seulement l'exercice) · une forme que ce moteur
   * à colonnes fixes ne représente pas. Elle est servie séparément par
   * `EtatsFinanciersProjetService.noteBailleur()`
   * (`GET /etats-financiers/projet/note-bailleur`), déjà construite et
   * testée. `NOTES_PROJETS` transcrit la note 9 comme un renvoi vers cet
   * endpoint, pour que la fiche récapitulative et la couverture (26 notes)
   * restent exactes sans dupliquer un calcul qui existe déjà.
   */
  async notesProjet(tenantId: string, exerciceId: string) {
    return this.notesDuJeu(tenantId, exerciceId, JeuNotesAnnexes.PROJETS_DEVELOPPEMENT);
  }

  /**
   * Notes annexes du SYSTÈME NORMAL SYSCOHADA · les 36 notes de l'AUDCIF
   * Titre IX ch. 6, section 2 « Liste officielle des Notes annexes »,
   * transcrites dans `NOTES_SYSCOHADA`.
   *
   * Rien n'y est repris du SYCEBNL : autres postes, autres comptes, autres
   * renvois. Seul le moteur déclaratif est commun (CLAUDE.md §6).
   *
   * Le Système minimal de trésorerie SYSCOHADA n'a PAS de méthode ici : ses
   * notes 1 à 4 (AUDCIF Titre X) sont servies avec ses états, comme le SMT
   * SYCEBNL l'est déjà.
   */
  async notesSyscohada(tenantId: string, exerciceId: string) {
    return this.notesDuJeu(tenantId, exerciceId, JeuNotesAnnexes.SYSCOHADA_SYSTEME_NORMAL);
  }
}
