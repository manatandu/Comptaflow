import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import {
  ModeAmortissement,
  Prisma,
  Referentiel,
  SensDepreciation,
  StatutImmobilisation,
  SystemeComptableSyscohada,
  TypeComposant,
} from '@prisma/client';
import { AMORTISSEMENT_SMT } from '../etats-financiers-syscohada/correspondance-smt-syscohada';
import { FAMILLES_IMMOBILISATION_DEFAUT, FAMILLES_IMMOBILISATION_DEFAUT_SYSCOHADA } from './famille-immobilisation-seed';
import {
  CreerFamilleDto,
  CreerImmobilisationDto,
  DepreciationDto,
  RenouvelerComposantDto,
  ModifierFamilleDto,
  PasserDotationDto,
  ReclasserImmobilisationDto,
  SortirImmobilisationDto,
  TypeSortie,
} from './dto/immobilisation.dto';

const EPSILON = 0.005;

/** Une ligne du tableau des immobilisations · six colonnes, comme le modèle. */
export interface LigneTableauImmo {
  id: string;
  designation: string;
  numeroInventaire: string;
  dateAcquisition: string;
  dureeAns: number;
  valeurBrute: number;
  amortissements: number;
  valeurNette: number;
  statut: StatutImmobilisation;
  dateSortie: string | null;
}

/** Une ligne du tableau des amortissements · douze colonnes mensuelles. */
export interface LigneTableauAmortissement {
  id: string;
  designation: string;
  dateAcquisition: string;
  valeurBrute: number;
  taux: number;
  base: number;
  parMois: number[];
  dotation: number;
  cumulN1: number;
  cumulN: number;
  valeurNette: number;
  /** Vraie quand la dotation est COMPTABILISÉE, fausse quand elle est calculée. */
  dotationPassee: boolean;
}

/**
 * Les champs Decimal de Prisma (valeurOrigine, valeurResiduelle,
 * prixCession, montant) sérialisent en CHAÎNES sur le JSON de réponse ·
 * jamais renvoyés bruts ici, jamais laissés au frontend à deviner. Même
 * discipline que LettrageService.lister() (`Number(l.debit)`) : trouvé en
 * testant l'écran (pas en curl, où tout s'affiche comme du texte de toute
 * façon) · le cumul amorti "0120240" au lieu de 360 venait d'une
 * concaténation de chaînes ("120" + "240"), la V.N.C. affichée -119040 au
 * lieu de 840.
 */
function versDotation<T extends { montant: unknown }>(d: T) {
  return { ...d, montant: Number(d.montant) };
}
function versImmobilisation<
  T extends {
    valeurOrigine: unknown;
    valeurResiduelle: unknown;
    prixCession: unknown;
    dotations?: unknown[];
    depreciations?: unknown[];
  },
>(immo: T) {
  return {
    ...immo,
    valeurOrigine: Number(immo.valeurOrigine),
    valeurResiduelle: Number(immo.valeurResiduelle),
    prixCession: immo.prixCession === null || immo.prixCession === undefined ? null : Number(immo.prixCession),
    dotations: (immo.dotations ?? []).map((d) => versDotation(d as { montant: unknown })),
    // Servies à l'écran pour que la valeur nette affichée soit celle du bilan.
    // Une VCN calculée sans elles se lirait comme un désaccord entre la fiche
    // du bien et la balance, sans qu'on sache lequel des deux a tort.
    depreciations: (immo.depreciations ?? []).map((d) => {
      const dep = d as { id: string; sens: SensDepreciation; montant: unknown; exerciceId: string; indice: string };
      return { id: dep.id, sens: dep.sens, montant: Number(dep.montant), exerciceId: dep.exerciceId, indice: dep.indice };
    }),
  };
}

const CODE_CONTRAINTE_UNIQUE = 'P2002';

function estConflitUnicite(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === CODE_CONTRAINTE_UNIQUE;
}

/**
 * Immobilisations (§3.3, docs/plan-de-construction.md) · CE MODULE SERT LES
 * DEUX RÉFÉRENTIELS, et sa documentation ne connaissait que l'un des deux.
 *
 * Mécanique d'acquisition, d'amortissement et de cession :
 *  · dossier SYCEBNL · skill `sycebnl`, COMPTE 21 à 29, Partie 2 ch. 3 § 2 ;
 *  · dossier SYSCOHADA · AUDCIF, Titre VII classes 2 et 8 (COMPTE 28 pour
 *    l'amortissement, COMPTE 81 et COMPTE 82 pour la sortie), et art. 45 pour
 *    la date de début d'amortissement. Les deux rédactions sont identiques sur
 *    ce point, ce qui est la raison pour laquelle le code est commun.
 *
 * Durées d'amortissement par défaut des familles semées : skill
 * `fiscalite-rdc/socle`, arrêté n° 013/2025 · voir famille-immobilisation-seed.ts
 * pour le détail des citations.
 */
/**
 * Nature d'une immobilisation, lue sur la RACINE de son compte d'actif · elle
 * décide du compte de classe 8 servi à la sortie.
 *
 * Le PCGO (AUDCIF Titre VII ch. 3, section 8) subdivise les deux comptes de
 * sortie de la même façon, et les deux semis les portent :
 *
 *   81 Valeurs comptables des cessions · 811 incorporelles
 *                                        812 corporelles
 *                                        816 financières
 *   82 Produits des cessions           · 821 incorporelles
 *                                        822 corporelles
 *                                        826 financières
 *
 * Le code servait 812 et 822 à TOUTE sortie, en assumant le cas le plus
 * fréquent. La cession d'un logiciel (compte 2131, incorporel) sortait donc
 * sur « immobilisations corporelles ». L'écriture reste équilibrée et le
 * résultat exact · seule la ventilation des cessions dans les notes annexes
 * est fausse, ce que rien ne signale.
 */
/*
  LA RACINE DU COMPTE NE SUFFIT PAS · IL FAUT LE RÉFÉRENTIEL AVEC ELLE.

  La règle « 20 et 21 incorporelles » a été écrite pour le seul plan
  SYSCOHADA, où la classe 2 commence à 21 · aucun compte 20x n'y est semé, la
  branche y est donc inatteignable et inoffensive.

  AU SYCEBNL, LA DIVISION 20 N'EST PAS INCORPORELLE. Elle porte en entier les
  « Immobilisations destinées à la vente (dons et legs non encore reçus) et
  usufruit temporaire » · skill `sycebnl`, Partie 2 ch. 3, COMPTE 20, dont les
  subdivisions semées sont 202 Terrains, 203 Bâtiments, 204 Matériels et 205
  Titres de participations, toutes « destinés à la vente ». Un bâtiment légué
  sortait donc en 811 « immobilisations incorporelles ».

  Et le texte leur donne LEURS PROPRES comptes de sortie, que le semis porte
  déjà sans que rien ne les atteigne :
    COMPTE 81, Subdivisions · « 811 Immobilisations incorporelles ; 812
    Immobilisations corporelles ; 816 Immobilisations financières ; 818
    Immobilisations reçues en dons et legs destinées à la vente » ;
    COMPTE 82, Subdivisions · « … 828 Immobilisations reçues en dons et legs
    destinées à la vente ».
  La fiche AUDCIF du COMPTE 81 n'énumère, elle, que 811, 812 et 816 : le 818
  n'existe PAS au SYSCOHADA, et cette nature n'y est jamais rendue.
*/
export type NatureImmobilisation = 'INCORPORELLE' | 'CORPORELLE' | 'FINANCIERE' | 'DONS_LEGS_VENTE';

export const COMPTES_SORTIE: Record<NatureImmobilisation, { valeurComptable: string; produitCession: string }> = {
  INCORPORELLE: { valeurComptable: '81100000', produitCession: '82100000' },
  CORPORELLE: { valeurComptable: '81200000', produitCession: '82200000' },
  FINANCIERE: { valeurComptable: '81600000', produitCession: '82600000' },
  // SYCEBNL SEULEMENT · 818 et 828 sont absents du plan SYSCOHADA (fiche
  // AUDCIF du COMPTE 81 : 811, 812, 816 et rien d'autre). `natureImmobilisation`
  // ne rend cette nature que pour un dossier SYCEBNL.
  DONS_LEGS_VENTE: { valeurComptable: '81800000', produitCession: '82800000' },
};

/*
  CE QUE LE COMPTE 81 PORTE, ET CE QU'IL NE PORTE PAS.

  Les DEUX fiches disent la même chose, mot pour mot, et le module faisait
  l'inverse :

   · Contenu · « Pour les biens NON AMORTISSABLES, cette valeur est la valeur
     d'entrée, SANS DÉDUCTION DES ÉVENTUELLES DÉPRÉCIATIONS. Pour les biens
     amortissables, elle est la différence entre la valeur d'entrée brute des
     immobilisations cédées et LE CUMUL DES AMORTISSEMENTS pratiqués » ·
     skill `sycebnl`, COMPTE 81 · skill `audcif-acte-uniforme`, Titre VII
     COMPTE 81. Dans les deux cas la dépréciation n'entre pas dans le calcul ;
   · Exclusions · « Le compte 81 ne doit pas servir à enregistrer : LES
     DÉPRÉCIATIONS AFFÉRENTES AUX ÉLÉMENTS D'ACTIF IMMOBILISÉ CÉDÉS. Il
     convient dans les cas d'espèce d'utiliser les comptes ci-après : 29 » ·
     même fiche, dans les deux référentiels.

  LA DÉPRÉCIATION SORT DONC PAR SA REPRISE, PAS EN MOINS DU 81. L'AUDCIF le
  montre sur un cas complet, Titre VIII ch. 13 section 4.1 (décomptabilisation
  de titres, une cession H.A.O.) : « La valeur comptable est égale au coût
  d'acquisition, NON DIMINUÉ PAR UNE ÉVENTUELLE DÉPRÉCIATION » au débit du
  816, et « Dans les cas où une dépréciation avait été constituée, cette
  dernière est REPRISE par le crédit du compte 7972 Reprises pour dépréciation
  des immobilisations financières ». Le dépôt encode déjà cette application
  telle quelle (`schemas-guide-syscohada.ts`, Application 50 : débits 2974,
  4856, 816 · crédits 274, 7972, 826).

  LE COMPTE DE REPRISE SUIT LA NATURE DU BIEN, comme le 81 lui-même · fiche du
  COMPTE 79, Subdivisions :
   · SYSCOHADA · « 791 … 7913 des immobilisations incorporelles · 7914 des
     immobilisations corporelles » et « 797 … 7972 des immobilisations
     financières » (Titre VII, COMPTE 79) · le plan semé porte les trois en
     compte de détail ;
   · SYCEBNL · mêmes 791 et 797, mais le plan semé s'arrête au compte de
     détail 79100000 et 79700000 ; et il ouvre en plus 795 « Reprises des
     dépréciations d'immobilisations reçues provenant des dons et legs et
     d'usufruit temporaire », qui est le pendant exact du 290 déprécié et du
     818 cédé (skill `sycebnl`, COMPTE 79 et COMPTE 29).

  UNE SEULE EXCEPTION, ÉCRITE ELLE AUSSI · la fiche du COMPTE 29 donne deux
  contreparties à la reprise, « par le crédit du compte 79 – Reprises de
  dépréciations ; ou du compte 863 – Reprises de dépréciations H.A.O. », et la
  fiche du COMPTE 79 tranche laquelle : « Exclusions · les reprises HAO → 86 ».
  Une dépréciation dotée en H.A.O. (compte 853) se reprend donc en 863, et
  c'est le compte de contrepartie de la DOTATION qui le dit · voir
  `compteRepriseDepreciation`.
*/
export const REPRISE_DEPRECIATION_SORTIE: Record<
  Referentiel,
  Partial<Record<NatureImmobilisation, string>>
> = {
  [Referentiel.SYCEBNL]: {
    INCORPORELLE: '79100000',
    CORPORELLE: '79100000',
    FINANCIERE: '79700000',
    DONS_LEGS_VENTE: '79500000',
  },
  [Referentiel.SYSCOHADA]: {
    INCORPORELLE: '79130000',
    CORPORELLE: '79140000',
    FINANCIERE: '79720000',
  },
};

/** Reprise d'une dépréciation qui avait été DOTÉE en H.A.O. (853) · semé des deux côtés. */
export const REPRISE_DEPRECIATION_HAO = '86300000';

/**
 * CESSION COURANTE · LE NIVEAU H.A.O. N'EST PAS TOUJOURS LE BON, ET LE
 * LOGICIEL N'OFFRAIT AUCUN CHOIX.
 *
 * L'AUDCIF exclut expressément du niveau H.A.O. les cessions « considérées
 * comme courantes (fréquentes et récurrentes) » et les impute en exploitation :
 * « exemples : transporteurs, loueurs de matériels » (Titre VII, COMPTE 81,
 * Exclusions ; COMPTE 82, Commentaires). Un transporteur qui renouvelle sa
 * flotte voyait donc chaque cession en hors activités ordinaires, ce qui
 * déplace du résultat d'exploitation vers le résultat H.A.O. un flux qui est
 * précisément son activité.
 *
 * DEUX REFUS, POUR DEUX RAISONS DIFFÉRENTES, ET AUCUN N'EST COSMÉTIQUE :
 *
 *  · en SYCEBNL, le compte 654 est « Dons en nature courants reçus à
 *    distribuer » et le 7542 son pendant (Partie 2 ch. 3, COMPTE 65). Y porter
 *    une valeur comptable de cession écrirait une cession dans le compte des
 *    dons reçus · l'option est refusée pour ce référentiel ;
 *  · les comptes 654 et 754 n'ont que deux subdivisions, 6541/7541
 *    incorporelles et 6542/7542 corporelles. Il n'existe AUCUNE subdivision
 *    financière : une immobilisation financière reste en 816/826, quelle que
 *    soit la fréquence des cessions.
 */
export const COMPTES_CESSION_COURANTE: Partial<
  Record<NatureImmobilisation, { valeurComptable: string; produitCession: string }>
> = {
  INCORPORELLE: { valeurComptable: '65410000', produitCession: '75410000' },
  CORPORELLE: { valeurComptable: '65420000', produitCession: '75420000' },
};

export function natureImmobilisation(numeroCompte: string, referentiel: Referentiel): NatureImmobilisation {
  // Le référentiel est EXIGÉ, sans valeur par défaut : c'est la division 20
  // qui se lit différemment de part et d'autre, et un défaut aurait rendu
  // l'oubli silencieux · exactement le genre d'erreur que ce module produit
  // sans déséquilibrer une seule écriture.
  if (referentiel === Referentiel.SYCEBNL && numeroCompte.startsWith('20')) return 'DONS_LEGS_VENTE';
  // Classe 2 : 21 incorporelles, 22 à 24 corporelles, 26 et 27 financières.
  // Le 20 reste rangé ici avec le 21 pour le SYSCOHADA, où aucun compte 20x
  // n'est semé (la classe 2 y commence à 21) · la branche n'y est jamais
  // atteinte, et la retirer changerait le comportement d'un plan importé à la
  // main sans qu'aucun texte ne le demande.
  // 25 (avances sur immobilisations) ne se cède pas · il se solde à la
  // réception du bien, il n'atteint donc jamais cette sortie.
  if (/^2[01]/.test(numeroCompte)) return 'INCORPORELLE';
  if (/^2[67]/.test(numeroCompte)) return 'FINANCIERE';
  return 'CORPORELLE';
}

@Injectable()
export class ImmobilisationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ecritureService: EcritureService,
  ) {}

  /** Appelé une fois à la création du tenant (voir AuthService.register). */
  /**
   * `client` reçoit la transaction de `AuthService.register` quand le semis
   * fait partie d'une création de dossier · hors de ce cas il vaut
   * `this.prisma` et rien ne change pour les autres appelants.
   */
  async seedFamillesDefaut(tenantId: string, referentiel: Referentiel, client: Prisma.TransactionClient = this.prisma) {
    const familles =
      referentiel === Referentiel.SYSCOHADA ? FAMILLES_IMMOBILISATION_DEFAUT_SYSCOHADA : FAMILLES_IMMOBILISATION_DEFAUT;
    for (const f of familles) {
      const [compteImmo, compteAmort, compteDotation] = await Promise.all([
        client.compte.findUnique({ where: { tenantId_numero: { tenantId, numero: f.numeroCompteImmobilisation } } }),
        client.compte.findUnique({ where: { tenantId_numero: { tenantId, numero: f.numeroCompteAmortissement } } }),
        client.compte.findUnique({ where: { tenantId_numero: { tenantId, numero: f.numeroCompteDotation } } }),
      ]);
      // Défensif plutôt que silencieux : si le plan de comptes du tenant ne
      // contient pas (encore) ces numéros · dossier créé avant l'import
      // complet du plan SYCEBNL, ou compte supprimé entre-temps · on saute
      // cette famille plutôt que de planter tout le seed de l'inscription.
      if (!compteImmo || !compteAmort || !compteDotation) continue;
      await client.familleImmobilisation.upsert({
        where: { tenantId_code: { tenantId, code: f.code } },
        update: {},
        create: {
          tenantId,
          code: f.code,
          intitule: f.intitule,
          compteImmobilisationId: compteImmo.id,
          compteAmortissementId: compteAmort.id,
          compteDotationId: compteDotation.id,
          dureeAmortissementAns: f.dureeAmortissementAns,
        },
      });
    }
  }

  async listerFamilles(tenantId: string) {
    return this.prisma.familleImmobilisation.findMany({
      where: { tenantId },
      include: { compteImmobilisation: true, compteAmortissement: true, compteDotation: true },
      orderBy: { intitule: 'asc' },
    });
  }

  /**
   * Vérifie que chaque compte de la famille est de la bonne nature · trouvé
   * en approfondissant (règle §2.6) : rien n'empêchait jusqu'ici de créer
   * une famille avec, par exemple, un compte de trésorerie comme "compte
   * d'amortissement". `ClasseCompte.CLASSE_2` seul ne suffit pas à
   * distinguer immobilisation (20-27) d'amortissement (28-29), qui
   * partagent la même classe · d'où la vérification sur le préfixe
   * numérique en plus de la classe.
   */
  /**
   * Compte de classe 8 de la sortie · absent du plan, on le NOMME plutôt que
   * de retomber en silence sur un compte voisin.
   */
  private async compteDeSortie(tenantId: string, numero: string) {
    const compte = await this.prisma.compte.findUnique({ where: { tenantId_numero: { tenantId, numero } } });
    if (!compte) {
      throw new BadRequestException(
        `Compte ${numero} introuvable pour ce dossier · nécessaire pour enregistrer la sortie de cette immobilisation.`,
      );
    }
    return compte;
  }

  /**
   * RÉGIME COMPTABLE DU DOSSIER · référentiel, et pour un dossier SYSCOHADA
   * son système (Système normal ou Système minimal de trésorerie, AUDCIF
   * art. 11 et 13). Les deux entrent dans la mécanique des immobilisations :
   * le référentiel décide du compte de sortie de la division 20, le système
   * décide du prorata de la première annuité.
   *
   * Le module ignorait entièrement le second · `grep systemeComptableSyscohada`
   * n'y rendait aucune ligne, alors que le Titre X le contraint.
   */
  private async regimeComptable(tenantId: string) {
    return this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { referentiel: true, systemeComptableSyscohada: true },
    });
  }

  /**
   * LE SYSTÈME MINIMAL DE TRÉSORERIE INTERDIT LE PRORATA TEMPORIS.
   *
   * AUDCIF Titre X ch. 1 § 1 · « Les entités possédant des immobilisations
   * doivent tenir un registre des immobilisations (NOTE 1). Chaque
   * immobilisation doit faire l'objet d'un TABLEAU D'AMORTISSEMENT BASÉ SUR
   * LE MODE LINÉAIRE SANS PRORATA TEMPORIS. » Le point de vigilance du même
   * paragraphe le chiffre : « une année entière la première année, quelle que
   * soit la date d'acquisition ». C'est une simplification PROPRE AU SMT,
   * distincte de la règle du Système normal (art. 45).
   *
   * La règle était déjà transcrite (`AMORTISSEMENT_SMT`) et son commentaire
   * annonçait que « le module immobilisations la lit ici » · ce n'était pas
   * vrai, elle n'était qu'imprimée en pied de la NOTE 1. Elle est lue ici
   * pour de bon, plutôt que réécrite.
   *
   * PORTÉE STRICTEMENT SYSCOHADA. Le SYCEBNL a lui aussi un Système minimal
   * de trésorerie (Partie 4 ch. 4), mais son chapitre n'est PAS encodé dans
   * le skill `sycebnl`, qui avertit en tête de la Partie 4 : « ne jamais
   * reconstituer un modèle … par analogie avec le SYSCOHADA, demander les
   * pages manquantes ». Rien n'autorise donc à lui étendre la règle : un
   * dossier SYCEBNL garde le prorata, et le dira le jour où la source
   * arrivera (CLAUDE.md §1 et §6).
   */
  private sansProrataTemporis(regime: {
    referentiel: Referentiel;
    systemeComptableSyscohada: SystemeComptableSyscohada | null;
  }): boolean {
    return (
      regime.referentiel === Referentiel.SYSCOHADA &&
      regime.systemeComptableSyscohada === SystemeComptableSyscohada.MINIMAL_TRESORERIE &&
      !AMORTISSEMENT_SMT.prorataTemporis
    );
  }

  /**
   * COMPTE DE REPRISE DE LA DÉPRÉCIATION SORTIE AVEC LE BIEN.
   *
   * Fiche du COMPTE 29, « utilisation au débit » : la reprise débite le 29
   * « par le crédit du compte 79 – Reprises de dépréciations ; ou du compte
   * 863 – Reprises de dépréciations H.A.O. ». La fiche du COMPTE 79 dit
   * laquelle des deux : « Exclusions · les reprises HAO → 86 ». Le critère
   * est donc le NIVEAU DE LA DOTATION d'origine, que le module a conservé
   * (`DepreciationImmobilisation.compteContrepartieId`) : dotée en 853, la
   * dépréciation se reprend en 863 ; dotée en 69, elle se reprend en 79,
   * sur la subdivision de la NATURE du bien.
   */
  private async compteRepriseDepreciation(
    tenantId: string,
    referentiel: Referentiel,
    nature: NatureImmobilisation,
    compteContrepartieDotationId: string | null,
  ) {
    let numero: string | undefined;
    if (compteContrepartieDotationId) {
      const contrepartie = await this.prisma.compte.findFirst({
        where: { id: compteContrepartieDotationId, tenantId },
        select: { numero: true },
      });
      if (contrepartie?.numero.startsWith('85')) numero = REPRISE_DEPRECIATION_HAO;
    }
    numero ??= REPRISE_DEPRECIATION_SORTIE[referentiel][nature];
    if (!numero) {
      // Inatteignable en l'état (seul le SYCEBNL rend DONS_LEGS_VENTE, et il
      // porte son 795) · nommé plutôt que laissé retomber sur un compte voisin.
      throw new BadRequestException(
        `Aucun compte de reprise de dépréciation n'est défini pour une immobilisation ${nature} au référentiel ${referentiel}.`,
      );
    }
    return this.compteDeSortie(tenantId, numero);
  }

  private async verifierComptesFamille(tenantId: string, dto: { compteImmobilisationId: string; compteAmortissementId: string; compteDotationId: string }) {
    const [compteImmo, compteAmort, compteDotation] = await Promise.all([
      this.prisma.compte.findFirst({ where: { id: dto.compteImmobilisationId, tenantId } }),
      this.prisma.compte.findFirst({ where: { id: dto.compteAmortissementId, tenantId } }),
      this.prisma.compte.findFirst({ where: { id: dto.compteDotationId, tenantId } }),
    ]);
    if (!compteImmo) throw new BadRequestException('Compte introuvable pour ce tenant (compteImmobilisationId)');
    if (!compteAmort) throw new BadRequestException('Compte introuvable pour ce tenant (compteAmortissementId)');
    if (!compteDotation) throw new BadRequestException('Compte introuvable pour ce tenant (compteDotationId)');

    if (compteImmo.classe !== 'CLASSE_2' || compteImmo.numero.startsWith('28') || compteImmo.numero.startsWith('29')) {
      throw new BadRequestException(
        `Le compte d'immobilisation ${compteImmo.numero} doit être un compte de classe 2, hors amortissements/dépréciations (20-27)`,
      );
    }
    if (compteAmort.classe !== 'CLASSE_2' || !compteAmort.numero.startsWith('28')) {
      throw new BadRequestException(`Le compte d'amortissement ${compteAmort.numero} doit être un compte de classe 28`);
    }
    if (compteDotation.classe !== 'CLASSE_6' || !compteDotation.numero.startsWith('68')) {
      throw new BadRequestException(`Le compte de dotation ${compteDotation.numero} doit être un compte de dotations aux amortissements (68)`);
    }
  }

  async creerFamille(tenantId: string, dto: CreerFamilleDto) {
    await this.verifierComptesFamille(tenantId, dto);
    const existant = await this.prisma.familleImmobilisation.findUnique({
      where: { tenantId_code: { tenantId, code: dto.code } },
    });
    if (existant) {
      throw new ConflictException(`Une famille de code "${dto.code}" existe déjà pour ce tenant`);
    }
    return this.prisma.familleImmobilisation.create({ data: { ...dto, tenantId } });
  }

  async modifierFamille(tenantId: string, id: string, dto: ModifierFamilleDto) {
    const famille = await this.prisma.familleImmobilisation.findFirst({ where: { id, tenantId } });
    if (!famille) throw new NotFoundException('Famille introuvable pour ce tenant');
    return this.prisma.familleImmobilisation.update({ where: { id }, data: dto });
  }

  async lister(tenantId: string, statut?: StatutImmobilisation) {
    const immobilisations = await this.prisma.immobilisation.findMany({
      where: { tenantId, ...(statut ? { statut } : {}) },
      include: {
        famille: true,
        compteImmobilisation: true,
        compteAmortissement: true,
        dotations: true,
        depreciations: true,
      },
      orderBy: { dateAcquisition: 'desc' },
    });
    return immobilisations.map(versImmobilisation);
  }

  /**
   * Compensation : `EcritureService.creer` gère sa propre transaction
   * (numéro de pièce inclus) et commet réellement l'écriture, indépendamment
   * de ce qui suit · l'envelopper dans la transaction sérialisable de
   * l'appelant ne protégerait donc PAS contre une course sur la contrainte
   * d'unicité DotationAmortissement (le retry ne rejoue pas l'écriture déjà
   * commise). Seule option sans réécrire EcritureService : poster, puis en
   * cas de conflit avéré sur DotationAmortissement, supprimer l'écriture que
   * CETTE requête vient de créer (jamais celle du concurrent gagnant).
   *
   * Trouvé et corrigé lors de l'approfondissement post-livraison de cette
   * brique (règle §2.6) : 12 requêtes de dotation simultanées sur la même
   * immobilisation/exercice produisaient 12 écritures réelles au grand
   * livre (toutes équilibrées, donc invisibles à un simple contrôle de
   * balance) pour une seule ligne DotationAmortissement effectivement
   * conservée · 11 postes fantômes gonflant silencieusement le compte
   * d'amortissement cumulé, plus une 500 brute renvoyée aux 11 requêtes
   * perdantes au lieu d'un 409 propre.
   */
  private async annulerEcritureOrpheline(ecritureId: string) {
    await this.prisma.ligneEcriture.deleteMany({ where: { ecritureId } });
    await this.prisma.ecriture.delete({ where: { id: ecritureId } });
  }

  private async trouver(tenantId: string, id: string) {
    const immo = await this.prisma.immobilisation.findFirst({
      where: { id, tenantId },
      // `compteImmobilisation` est chargé pour sa NATURE : c'est son numéro
      // qui décide du compte de classe 8 à servir à la sortie (811 / 812 / 816).
      include: {
        famille: true,
        compteImmobilisation: true,
        dotations: { orderBy: { exercice: { dateDebut: 'asc' } }, include: { exercice: true } },
        // Chargées systématiquement · la dépréciation change la base
        // amortissable ET la valeur comptable nette de sortie. Les charger à
        // la demande aurait laissé un chemin où le module continue de
        // raisonner au coût historique sans que rien ne le signale.
        depreciations: { orderBy: { exercice: { dateDebut: 'asc' } }, include: { exercice: true } },
      },
    });
    if (!immo) throw new NotFoundException('Immobilisation introuvable pour ce tenant');
    return immo;
  }

  /**
   * Base amortissable = valeur d'origine - valeur résiduelle (skill
   * sycebnl, COMPTE 28). Cumul déjà amorti = somme des dotations déjà
   * passées (jamais recalculé depuis le compte 28 lui-même, qui pourrait
   * porter d'autres écritures manuelles · la source de vérité du cumul
   * "généré par ce module" est la table DotationAmortissement).
   */
  private baseAmortissable(valeurOrigine: number, valeurResiduelle: number) {
    return Math.max(0, valeurOrigine - valeurResiduelle);
  }

  /**
   * Cumul net des dépréciations · dotations moins reprises. Positif ou nul :
   * une reprise ne peut jamais dépasser ce qui a été doté (voir
   * `enregistrerDepreciation`), sans quoi le compte 29 deviendrait débiteur,
   * ce qui n'a pas de sens pour une correction d'actif « de sens négatif »
   * (SYCEBNL, fiche du COMPTE 29).
   */
  private cumulDepreciation(depreciations: Array<{ sens: SensDepreciation; montant: number }>) {
    return depreciations.reduce(
      (total, d) => total + (d.sens === SensDepreciation.DOTATION ? d.montant : -d.montant),
      0,
    );
  }

  /**
   * ANNÉES DÉJÀ ÉCOULÉES du plan, comptées depuis le premier jour du mois de
   * mise en service · la même origine que le prorata de la première annuité
   * (loi n° 23/053, art. 34). Sert à connaître la durée RESTANT À COURIR, sur
   * laquelle le plan se ré-étale après une perte de valeur.
   *
   * Comptées sur les DATES et non sur le nombre de dotations enregistrées : un
   * bien repris porte un amortissement antérieur sans qu'aucune dotation ne
   * figure ici, et un exercice sauté ne rallonge pas la durée d'utilité.
   */
  private anneesEcoulees(dateMiseEnService: Date, debutExercice: Date) {
    const origine = new Date(
      Date.UTC(dateMiseEnService.getUTCFullYear(), dateMiseEnService.getUTCMonth(), 1),
    );
    if (debutExercice <= origine) return 0;
    const mois =
      (debutExercice.getUTCFullYear() - origine.getUTCFullYear()) * 12 +
      (debutExercice.getUTCMonth() - origine.getUTCMonth());
    return Math.max(0, Math.floor(mois / 12));
  }


  /*
    LA DÉCOMPOSITION N'EST PAS OUVERTE À TOUT · et les deux textes ne la
    ferment PAS DE LA MÊME FAÇON. C'est le point délicat de ce chapitre.

     · SYCEBNL, Partie 2 ch. 3, règles générales de la classe 2 · « la
       décomposition de ces immobilisations N'EST AUTORISÉE QUE POUR les
       bâtiments et autres ouvrages, les avions, les bateaux, les camions, les
       autocars, les bus, les véhicules blindés de transport de fonds, certains
       matériels et outillages des entités industrielles, minières, agricoles,
       hospitalières et pétrolières, dès lors que l'entité dispose de
       statistiques et autres informations lui permettant de bien appréhender
       la durée d'utilité de chaque élément. » Liste FERMÉE.
     · AUDCIF, Titre VIII ch. 4 § 2 · la même énumération, mais introduite par
       « par exemple », donc OUVERTE, suivie d'une liste NÉGATIVE : « ne peuvent
       faire l'objet d'une décomposition certaines immobilisations de faible
       valeur et/ou de durée d'utilisation courte telles que les matériels
       informatiques, les véhicules de tourisme, les matériels et mobiliers ».

    CE QUE LE LOGICIEL PEUT VÉRIFIER, ET RIEN DE PLUS. « Véhicule de tourisme »
    et « matériel industriel » ne se lisent pas dans un numéro de compte : les
    deux plans les logent au même 245 et au même 241. Le seul refus mécanique
    possible porte donc sur le matériel informatique, que les deux plans isolent
    au 2442, et que l'AUDCIF exclut nommément. Le reste des conditions est
    demandé PAR ÉCRIT (justificationDecomposition) plutôt que deviné · un refus
    fondé sur une devinette bloquerait des décompositions justes, et une
    autorisation silencieuse en laisserait passer de fausses.
  */
  private verifierDecomposition(
    principal: { compteImmobilisation: { numero: string; intitule: string } },
    referentiel: Referentiel,
  ) {
    if (principal.compteImmobilisation.numero.startsWith('2442')) {
      throw new BadRequestException(
        referentiel === Referentiel.SYCEBNL
          ? "Le matériel informatique ne figure pas dans la liste des immobilisations décomposables du SYCEBNL " +
            '(Partie 2 ch. 3, règles générales de la classe 2), qui n’autorise la décomposition que pour les ' +
            'bâtiments et autres ouvrages, les avions, les bateaux, les camions, les autocars, les bus, les ' +
            'véhicules blindés de transport de fonds et certains matériels et outillages industriels, miniers, ' +
            'agricoles, hospitaliers et pétroliers.'
          : "L'AUDCIF exclut nommément le matériel informatique de la décomposition (Titre VIII ch. 4 § 2), avec " +
            'les véhicules de tourisme et les matériels et mobiliers, en raison de leur faible valeur ou de leur ' +
            'durée d’utilisation courte. Le coût de leur remplacement est une charge de l’exercice.',
      );
    }
  }

  /**
   * Contrôles propres à un COMPOSANT, une fois son principal connu.
   *
   * Deux seulement sont mécaniques, et c'est voulu :
   *  · la valeur résiduelle · ch. 4 § 3.3, « s'agissant d'un composant
   *    identifié à l'origine, sa base amortissable NE PEUT ÊTRE DIMINUÉE d'une
   *    valeur résiduelle, puisque, par définition, il est prévu qu'il soit
   *    remplacé avant la fin de l'utilisation de la structure ». Le § 4.3
   *    ouvre l'exception du DERNIER remplacement, d'où le drapeau ;
   *  · la pièce de sécurité · SYCEBNL, classe 2, « pour les pièces de
   *    sécurité, l'amortissement doit démarrer DÈS L'ACQUISITION DE
   *    L'IMMOBILISATION PRINCIPALE ». C'est la seule des cinq natures dont la
   *    date de départ soit entièrement déterminée par le principal, donc la
   *    seule vérifiable.
   *
   * La pièce de RECHANGE obéit à la règle inverse (« l'amortissement ne débute
   * qu'à la date d'utilisation de la pièce, au moment où elle est intégrée
   * dans l'immobilisation principale »), mais cette date n'est connue de
   * personne d'autre que du comptable : elle est simplement la date de mise en
   * service saisie, et aucun contrôle ne peut la contredire. Dit ici plutôt
   * que laissé croire.
   */
  private verifierComposant(
    dto: {
      typeComposant?: TypeComposant;
      valeurResiduelle?: number;
      dernierRenouvellement?: boolean;
      dateMiseEnService: string;
    },
    principal: { dateAcquisition: Date },
  ) {
    if ((dto.valeurResiduelle ?? 0) > EPSILON && dto.dernierRenouvellement !== true) {
      throw new BadRequestException(
        "Un composant identifié à l'origine ne porte pas de valeur résiduelle : il est prévu qu'il soit remplacé " +
          "avant la fin de l'utilisation de la structure (AUDCIF, Titre VIII ch. 4 § 3.3). Si celui-ci est le " +
          'DERNIER renouvellement avant la fin d’utilisation du bien principal, indiquez-le explicitement.',
      );
    }
    if (dto.typeComposant === TypeComposant.PIECE_DE_SECURITE) {
      const debut = new Date(dto.dateMiseEnService);
      if (debut.getTime() !== principal.dateAcquisition.getTime()) {
        throw new BadRequestException(
          "Une pièce de sécurité s'amortit à compter de l'acquisition de l'immobilisation principale, qu'elle " +
            `serve ou non (SYCEBNL, Partie 2 ch. 3, classe 2) : sa date de début est le ` +
            `${principal.dateAcquisition.toISOString().slice(0, 10)}. Une pièce dont l'amortissement ne commence ` +
            "qu'à son intégration est une pièce de RECHANGE, pas une pièce de sécurité.",
        );
      }
    }
  }

  async creer(
    tenantId: string,
    userId: string,
    dto: CreerImmobilisationDto,
    /**
     * Réservé à `renouveler` · le composant que celui-ci remplace. Il n'est
     * PAS exposé au DTO : la chaîne des remplacements se constate, elle ne se
     * déclare pas, et un client qui la poserait à la main pourrait relier deux
     * biens qui n'ont rien à voir.
     */
    interne: { composantRemplaceId?: string } = {},
  ) {
    const famille = await this.prisma.familleImmobilisation.findFirst({ where: { id: dto.familleId, tenantId } });
    if (!famille) throw new BadRequestException('Famille introuvable pour ce tenant');

    const compteContrepartie = await this.prisma.compte.findFirst({ where: { id: dto.compteContrepartieId, tenantId } });
    if (!compteContrepartie) throw new BadRequestException('Compte de contrepartie introuvable pour ce tenant');

    const dateAcquisition = new Date(dto.dateAcquisition);
    const dateMiseEnService = new Date(dto.dateMiseEnService);
    if (dateMiseEnService < dateAcquisition) {
      throw new BadRequestException("La date de mise en service ne peut pas précéder la date d'acquisition");
    }

    // APPROCHE PAR COMPOSANTS · seulement si un principal est désigné. Sans
    // lui, rien ne change : le bien est une structure ordinaire.
    let principal: { id: string; dateAcquisition: Date; compteImmobilisation: { numero: string; intitule: string } } | null =
      null;
    if (dto.immobilisationPrincipaleId) {
      principal = await this.prisma.immobilisation.findFirst({
        where: { id: dto.immobilisationPrincipaleId, tenantId },
        select: { id: true, dateAcquisition: true, compteImmobilisation: { select: { numero: true, intitule: true } } },
      });
      if (!principal) throw new BadRequestException('Immobilisation principale introuvable pour ce tenant');
      const { referentiel } = await this.prisma.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { referentiel: true },
      });
      this.verifierDecomposition(principal, referentiel);
      this.verifierComposant(dto, principal);
      if (!dto.justificationDecomposition?.trim()) {
        throw new BadRequestException(
          'Indiquez pourquoi ce bien est décomposable : durées d’utilité distinctes, caractère significatif du ' +
            'coût, informations disponibles sur la durée de chaque élément. Les deux textes posent ces conditions ' +
            'et aucun logiciel ne peut les vérifier à votre place.',
        );
      }
    } else if (dto.typeComposant || dto.justificationDecomposition) {
      throw new BadRequestException(
        'Un composant se rattache à une immobilisation principale · indiquez-la, ou laissez ces champs vides pour ' +
          'créer une immobilisation ordinaire.',
      );
    }

    // Écriture d'acquisition : débit du compte d'immobilisation (skill
    // sycebnl, COMPTE 21-27, "utilisation au débit" · apport, acquisition ou
    // création) ; crédit du compte de contrepartie choisi par l'utilisateur
    // selon le mode de financement réel.
    //
    // Les contreparties ne sont pas les mêmes de part et d'autre, et le
    // commentaire n'en connaissait qu'une famille. Communes : trésorerie,
    // fournisseur d'investissement, emprunt, capital par dotation (le compte
    // 102 existe dans les deux plans). Propres au SYCEBNL : les fonds affectés
    // du compte 16, qui n'ont pas d'équivalent au plan SYSCOHADA, dont le 17
    // porte des dettes de location acquisition.
    //
    // Le compte n'est pas contraint ici : EcritureService valide déjà qu'il
    // est mouvementable et qu'il appartient au dossier.
    // L'AMORTISSEMENT ANTÉRIEUR NE PEUT PAS DÉPASSER CE QU'IL Y A À AMORTIR ·
    // au-delà, le bien serait plus qu'amorti, la valeur nette comptable
    // deviendrait négative et la sortie créditerait un 28 supérieur au 2.
    const baseAmortissable = this.baseAmortissable(dto.valeurOrigine, dto.valeurResiduelle ?? 0);
    if ((dto.amortissementAnterieur ?? 0) - baseAmortissable > EPSILON) {
      throw new BadRequestException(
        `L'amortissement antérieur (${(dto.amortissementAnterieur ?? 0).toFixed(2)}) dépasse la base ` +
          `amortissable du bien (${baseAmortissable.toFixed(2)}, soit la valeur d'origine diminuée de la valeur ` +
          'résiduelle) : un bien ne peut pas être amorti au-delà de ce qu’il y a à amortir.',
      );
    }

    const ecritureAcquisition = await this.ecritureService.creer(tenantId, userId, {
      exerciceId: dto.exerciceId,
      journalId: dto.journalId,
      date: dto.dateAcquisition,
      libelle: `Acquisition · ${dto.designation}`,
      lignes: [
        { compteId: famille.compteImmobilisationId, debit: dto.valeurOrigine, credit: 0 },
        { compteId: dto.compteContrepartieId, debit: 0, credit: dto.valeurOrigine },
      ],
    });

    const immobilisation = await this.prisma.immobilisation.create({
      data: {
        tenantId,
        familleId: famille.id,
        designation: dto.designation,
        numeroInventaire: dto.numeroInventaire,
        compteImmobilisationId: famille.compteImmobilisationId,
        compteAmortissementId: famille.compteAmortissementId,
        compteDotationId: famille.compteDotationId,
        dateAcquisition,
        dateMiseEnService,
        valeurOrigine: dto.valeurOrigine,
        valeurResiduelle: dto.valeurResiduelle ?? 0,
        dureeAmortissementAns: dto.dureeAmortissementAns ?? famille.dureeAmortissementAns,
        amortissementAnterieur: dto.amortissementAnterieur ?? 0,
        modeAmortissement: ModeAmortissement.LINEAIRE,
        ecritureAcquisitionId: ecritureAcquisition.id,
        createdBy: userId,
        // Rattachement au principal · null pour une structure. Le composant
        // garde son PROPRE plan d'amortissement, c'est tout l'objet du
        // chapitre 4 : « un plan d'amortissement propre à chacun de ces
        // éléments est retenu ».
        immobilisationPrincipaleId: principal?.id ?? null,
        typeComposant: principal ? (dto.typeComposant ?? TypeComposant.COMPOSANT) : null,
        justificationDecomposition: principal ? (dto.justificationDecomposition ?? null) : null,
        composantRemplaceId: interne.composantRemplaceId ?? null,
      },
      include: { dotations: true },
    });
    return versImmobilisation(immobilisation);
  }

  /**
   * Annuité de dotation pour `exercice`, compte tenu du cumul déjà passé.
   *
   * Première dotation (aucune dotation antérieure) : prorata temporis à
   * compter du premier jour du mois de mise en service.
   *
   * CITATION CORRIGÉE · la règle vient de la LOI n° 23/053, article 34 (« la
   * première annuité est calculée prorata temporis à compter du premier jour
   * du mois de mise en service »), l'article 30 posant seulement le linéaire
   * comme régime de droit commun. L'arrêté n° 013/2025 ne porte ni l'un ni
   * l'autre : il fixe les taux linéaires par famille (art. 2), les taux
   * dérogatoires (art. 4) et le plancher de location-acquisition (art. 5).
   *
   * La date COMPTABLE de début d'amortissement est celle où l'actif est en
   * état de fonctionner · AUDCIF art. 45 pour un dossier SYSCOHADA, skill
   * `sycebnl` COMPTE 28 pour un dossier SYCEBNL, en termes identiques. Le
   * calcul est donc le même des deux côtés.
   *
   * Borné à 12 mois pour CET exercice · limite du
   * MVP assumée : si la mise en service est antérieure au début de
   * l'exercice choisi pour la première dotation (dotation en retard, jamais
   * passée pour l'exercice réel de mise en service), le calcul ne rattrape
   * pas les mois antérieurs à cet exercice, il les ignore silencieusement.
   * Documenté ici plutôt que caché (règle §2.6).
   *
   * Dotations suivantes : annuité pleine (base / durée), plafonnée par le
   * reliquat (base - cumul déjà amorti) pour ne jamais dépasser la base
   * amortissable · un bien totalement amorti reste inscrit au bilan
   * (COMPTE 20-29, dernier paragraphe) mais ne génère plus de dotation.
   */
  /**
   * LE CUMUL AMORTI N'EST PAS SEULEMENT CE QUE LE LOGICIEL A DOTÉ.
   *
   * `amortissementAnterieur` porte ce qui a été amorti AVANT l'entrée du bien
   * dans OmegaX. Un bien mis en service en 2020 et repris dans un dossier
   * ouvert en 2026 porte déjà six annuités au compte 28 ; sans ce chiffre, le
   * calcul repartait de zéro et l'amortissait cinq ans de plus, pendant que la
   * valeur nette comptable des états s'écartait du solde du 28 repris par le
   * bilan d'ouverture.
   *
   * Il compte aussi pour savoir si l'annuité doit être PRORATISÉE : la
   * proratisation ne vaut que pour la PREMIÈRE annuité du bien, et un bien
   * repris a déjà passé la sienne, ailleurs. Se fier au seul nombre de
   * dotations enregistrées ici lui aurait fait subir un second prorata.
   */
  private calculerDotation(
    valeurOrigine: number,
    valeurResiduelle: number,
    dureeAns: number,
    dateMiseEnService: Date,
    dotationsAnterieures: Array<{ montant: number }>,
    exercice: { dateDebut: Date; dateFin: Date },
    amortissementAnterieur = 0,
    cumulDepreciation = 0,
    /**
     * SMT SYSCOHADA · « tableau d'amortissement basé sur le mode linéaire
     * SANS PRORATA TEMPORIS » (AUDCIF Titre X ch. 1 § 1). Voir
     * `sansProrataTemporis`, qui décide seul de sa valeur · jamais posé à la
     * main par un appelant.
     */
    sansProrata = false,
  ): number {
    const base = this.baseAmortissable(valeurOrigine, valeurResiduelle);
    const cumulAnterieur =
      dotationsAnterieures.reduce((s, d) => s + d.montant, 0) + Math.max(0, amortissementAnterieur);
    // Le reliquat tient compte de la dépréciation : ce qui a été déprécié n'a
    // plus à être amorti, sans quoi le bien s'amortirait au-delà de sa valeur.
    const reliquat = Math.max(0, base - cumulAnterieur - Math.max(0, cumulDepreciation));
    if (reliquat <= EPSILON) return 0;

    /*
      LE PLAN SE RÉ-ÉTALE APRÈS UNE PERTE DE VALEUR.

      AUDCIF, Titre VIII ch. 12 § 2.4.1 · « après la comptabilisation d'une
      perte de valeur, le plan d'amortissement de l'actif doit être ajusté pour
      les exercices suivants, afin que la valeur comptable révisée, diminuée de
      sa valeur résiduelle, puisse être répartie de façon systématique sur sa
      durée d'utilité restant à courir ». Le § 2.3.2 le chiffre : un matériel
      de 10 000 000 amorti linéairement sur 5 ans, déprécié de 1 600 000 à la
      fin de la 3e année, porte une VNC de 2 400 000 « qui constitue la
      nouvelle base amortissable, amortie sur la durée restant à courir (deux
      ans) » · 1 200 000 par an, et non plus 2 000 000.

      SANS DÉPRÉCIATION, RIEN NE CHANGE · l'annuité reste base / durée. C'est
      volontaire : la ré-étalement n'a de sens qu'après une perte de valeur, et
      l'appliquer partout modifierait le plan de tous les biens du parc.
    */
    let annuitePleine: number;
    if (cumulDepreciation > EPSILON) {
      const restantes = Math.max(1, dureeAns - this.anneesEcoulees(dateMiseEnService, exercice.dateDebut));
      annuitePleine = reliquat / restantes;
    } else {
      annuitePleine = base / dureeAns;
    }

    const premiereAnnuite = dotationsAnterieures.length === 0 && amortissementAnterieur <= EPSILON;
    let montant: number;
    if (premiereAnnuite) {
      const premierJourMoisMES = new Date(Date.UTC(dateMiseEnService.getUTCFullYear(), dateMiseEnService.getUTCMonth(), 1));
      const debutProrata = premierJourMoisMES < exercice.dateDebut ? exercice.dateDebut : premierJourMoisMES;
      const moisEcoules =
        (exercice.dateFin.getUTCFullYear() - debutProrata.getUTCFullYear()) * 12 +
        (exercice.dateFin.getUTCMonth() - debutProrata.getUTCMonth()) +
        1;
      const mois = Math.min(12, Math.max(0, moisEcoules));
      /*
        AU SMT, LA PREMIÈRE ANNÉE EST PLEINE.

        AUDCIF Titre X ch. 1 § 1 · « une année entière la première année,
        quelle que soit la date d'acquisition ». Le prorata reste appliqué
        partout ailleurs (Système normal, art. 45).

        `mois` GARDE SON RÔLE DE GARDE-FOU même au SMT : il vaut 0 quand le
        bien entre en service APRÈS la clôture de l'exercice demandé, et il
        n'y a alors rien à doter · une annuité pleine sur un bien pas encore
        entré serait une dotation d'avance, que le texte ne demande nulle
        part.
      */
      montant = mois <= 0 ? 0 : sansProrata ? annuitePleine : annuitePleine * (mois / 12);
    } else {
      montant = annuitePleine;
    }
    return Math.min(montant, reliquat);
  }

  /**
   * TABLEAU DES IMMOBILISATIONS · l'état que le cabinet classe en tête du
   * cycle immobilisations, et que le logiciel ne produisait pas.
   *
   * Présentation relevée sur le dossier de révision ouvert sur le Drive
   * (« Fichier immos et AMORTIS », feuille « TABLEAU DES IMMOBILISATIONS ») :
   * une ligne par bien, GROUPÉE PAR COMPTE D'IMPUTATION avec un sous-total par
   * groupe, et un total général. Le groupement n'est pas décoratif · c'est lui
   * qui permet de recouper le tableau avec la balance compte par compte, ce
   * qu'une liste à plat ne permet pas.
   *
   * Six colonnes : libellé, date d'acquisition, durée, valeur brute,
   * amortissements cumulés, valeur nette.
   *
   * L'AMORTISSEMENT ANTÉRIEUR ENTRE DANS LE CUMUL. Un bien repris d'un dossier
   * antérieur porte un cumul que nos dotations ne contiennent pas ; l'omettre
   * afficherait une valeur nette égale au brut sur un matériel de vingt ans.
   */
  async tableauImmobilisations(tenantId: string, params: { dateArret?: string } = {}) {
    const arret = params.dateArret ? new Date(params.dateArret) : null;
    const immos = await this.prisma.immobilisation.findMany({
      where: {
        tenantId,
        ...(arret ? { dateAcquisition: { lte: arret } } : {}),
      },
      include: {
        compteImmobilisation: { select: { id: true, numero: true, intitule: true } },
        dotations: {
          select: { montant: true, exercice: { select: { dateFin: true } } },
        },
      },
      orderBy: [{ compteImmobilisation: { numero: 'asc' } }, { dateAcquisition: 'asc' }],
    });

    const arrondir = (x: number) => Math.round(x * 100) / 100;
    const groupes = new Map<
      string,
      { numero: string; intitule: string; lignes: LigneTableauImmo[]; brut: number; amortissements: number; net: number }
    >();

    for (const immo of immos) {
      // Les dotations POSTÉRIEURES à la date d'arrêté sont écartées · un
      // tableau au 30/09 ne peut pas porter la dotation de décembre.
      const cumulDotations = immo.dotations
        .filter((d) => !arret || d.exercice.dateFin <= arret)
        .reduce((t, d) => t + Number(d.montant), 0);
      const amortissements = arrondir(cumulDotations + Math.max(0, Number(immo.amortissementAnterieur ?? 0)));
      const brut = Number(immo.valeurOrigine);
      const cle = immo.compteImmobilisation.id;
      const groupe =
        groupes.get(cle) ??
        {
          numero: immo.compteImmobilisation.numero,
          intitule: immo.compteImmobilisation.intitule,
          lignes: [] as LigneTableauImmo[],
          brut: 0,
          amortissements: 0,
          net: 0,
        };
      const net = arrondir(brut - amortissements);
      groupe.lignes.push({
        id: immo.id,
        designation: immo.designation,
        numeroInventaire: immo.numeroInventaire ?? '',
        dateAcquisition: immo.dateAcquisition.toISOString().slice(0, 10),
        dureeAns: immo.dureeAmortissementAns,
        valeurBrute: brut,
        amortissements,
        valeurNette: net,
        statut: immo.statut,
        dateSortie: immo.dateSortie ? immo.dateSortie.toISOString().slice(0, 10) : null,
      });
      groupe.brut = arrondir(groupe.brut + brut);
      groupe.amortissements = arrondir(groupe.amortissements + amortissements);
      groupe.net = arrondir(groupe.net + net);
      groupes.set(cle, groupe);
    }

    const listeGroupes = [...groupes.values()].sort((a, b) => a.numero.localeCompare(b.numero));
    return {
      dateArret: arret ? arret.toISOString().slice(0, 10) : null,
      groupes: listeGroupes,
      totaux: {
        brut: arrondir(listeGroupes.reduce((t, g) => t + g.brut, 0)),
        amortissements: arrondir(listeGroupes.reduce((t, g) => t + g.amortissements, 0)),
        net: arrondir(listeGroupes.reduce((t, g) => t + g.net, 0)),
      },
    };
  }

  /**
   * TABLEAU DES AMORTISSEMENTS DE L'EXERCICE · douze colonnes mensuelles.
   *
   * Modèle relevé sur la seconde feuille du même fichier (« TABLEAU DES
   * AMORTISSEMENTS 2025 ») : libellé, date d'acquisition, valeur brute, TAUX,
   * puis JANV à DÉCEMBRE, puis dotation de l'exercice, cumul N-1, cumul N et
   * valeur nette. Groupé par compte avec sous-totaux, comme le premier.
   *
   * POURQUOI DOUZE COLONNES ET PAS UN CHIFFRE ANNUEL. Le logiciel calcule une
   * dotation d'exercice, ce qui suffit à l'écriture mais pas au dossier. Le
   * découpage mensuel montre trois choses qu'un total annuel cache : le mois
   * d'ENTRÉE du bien (une acquisition de juin ne porte que sept douzièmes), le
   * mois de SORTIE (un bien cédé en septembre s'arrête là), et le mois où un
   * bien ACHÈVE de s'amortir (sa dernière colonne est un reliquat, pas une
   * mensualité pleine). C'est aussi ce qui permet de recouper la dotation avec
   * les écritures mensuelles quand le dossier dote au mois.
   *
   * LA RÉPARTITION EST CALCULÉE, PAS INVENTÉE : la dotation de l'exercice,
   * telle que `calculerDotation` la produit, est répartie sur les mois pendant
   * lesquels le bien est effectivement en service dans l'exercice · le
   * reliquat d'arrondi tombe sur le dernier mois servi, pour que la somme des
   * douze colonnes soit EXACTEMENT la dotation, au centime.
   */
  async tableauAmortissements(tenantId: string, exerciceId: string) {
    // Le tableau doit annoncer ce que `passerDotation` postera · au SMT c'est
    // l'annuité pleine, sans quoi l'état affiché et l'écriture se
    // contrediraient sur la première annuité.
    const sansProrata = this.sansProrataTemporis(await this.regimeComptable(tenantId));
    const exercice = await this.prisma.exercice.findFirstOrThrow({
      where: { id: exerciceId, tenantId },
      select: { id: true, dateDebut: true, dateFin: true },
    });
    const immos = await this.prisma.immobilisation.findMany({
      where: { tenantId, dateAcquisition: { lte: exercice.dateFin } },
      include: {
        compteImmobilisation: { select: { id: true, numero: true, intitule: true } },
        dotations: { select: { montant: true, exerciceId: true, exercice: { select: { dateFin: true } } } },
        // La dépréciation change l'annuité de tous les exercices SUIVANTS ·
        // un tableau qui l'ignorerait annoncerait une dotation que
        // passerDotation refuserait ensuite de poster.
        depreciations: {
          select: { sens: true, montant: true, exercice: { select: { dateFin: true } } },
        },
      },
      orderBy: [{ compteImmobilisation: { numero: 'asc' } }, { dateAcquisition: 'asc' }],
    });

    const arrondir = (x: number) => Math.round(x * 100) / 100;
    const moisDeLExercice: Array<{ annee: number; mois: number }> = [];
    for (
      let d = new Date(Date.UTC(exercice.dateDebut.getUTCFullYear(), exercice.dateDebut.getUTCMonth(), 1));
      d <= exercice.dateFin;
      d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
    ) {
      moisDeLExercice.push({ annee: d.getUTCFullYear(), mois: d.getUTCMonth() });
    }

    const groupes = new Map<
      string,
      { numero: string; intitule: string; lignes: LigneTableauAmortissement[]; parMois: number[]; dotation: number; cumulN1: number; cumulN: number; net: number }
    >();

    for (const immo of immos) {
      const dotationsAnterieures = immo.dotations.filter((d) => d.exercice.dateFin < exercice.dateFin);
      const cumulN1 = arrondir(
        dotationsAnterieures.reduce((t, d) => t + Number(d.montant), 0) +
          Math.max(0, Number(immo.amortissementAnterieur ?? 0)),
      );

      // La dotation retenue est celle DÉJÀ PASSÉE si elle l'a été · un tableau
      // qui recalculerait ce qui est comptabilisé afficherait autre chose que
      // les comptes, et c'est le tableau qu'on croirait.
      const dejaPassee = immo.dotations.find((d) => d.exerciceId === exercice.id);
      const dotation = dejaPassee
        ? Number(dejaPassee.montant)
        : this.calculerDotation(
            Number(immo.valeurOrigine),
            Number(immo.valeurResiduelle),
            immo.dureeAmortissementAns,
            immo.dateMiseEnService,
            dotationsAnterieures.map((d) => ({ montant: Number(d.montant) })),
            exercice,
            Number(immo.amortissementAnterieur ?? 0),
            this.cumulDepreciation(
              immo.depreciations
                .filter((d) => d.exercice.dateFin < exercice.dateFin)
                .map((d) => ({ sens: d.sens, montant: Number(d.montant) })),
            ),
            sansProrata,
          );

      // Mois effectivement servis : depuis le mois de mise en service (ou le
      // début de l'exercice si elle est antérieure) jusqu'au mois de sortie
      // (ou la fin de l'exercice).
      const finService = immo.dateSortie && immo.dateSortie < exercice.dateFin ? immo.dateSortie : exercice.dateFin;
      const servis = moisDeLExercice.map(({ annee, mois }) => {
        const premierJour = new Date(Date.UTC(annee, mois, 1));
        const dernierJour = new Date(Date.UTC(annee, mois + 1, 0));
        const debutService = new Date(
          Date.UTC(immo.dateMiseEnService.getUTCFullYear(), immo.dateMiseEnService.getUTCMonth(), 1),
        );
        return debutService <= dernierJour && premierJour <= finService;
      });
      const nbServis = servis.filter(Boolean).length;

      const parMois = moisDeLExercice.map(() => 0);
      if (nbServis > 0 && Math.abs(dotation) > EPSILON) {
        const mensualite = arrondir(dotation / nbServis);
        let cumul = 0;
        let dernierServi = -1;
        servis.forEach((sert, i) => {
          if (!sert) return;
          parMois[i] = mensualite;
          cumul = arrondir(cumul + mensualite);
          dernierServi = i;
        });
        // Le reliquat d'arrondi tombe sur le dernier mois servi · sans quoi la
        // somme des douze colonnes ne serait pas la dotation, et le tableau
        // afficherait un écart que personne ne saurait expliquer.
        if (dernierServi >= 0) parMois[dernierServi] = arrondir(parMois[dernierServi] + (dotation - cumul));
      }

      const cumulN = arrondir(cumulN1 + dotation);
      const net = arrondir(Number(immo.valeurOrigine) - cumulN);
      const base = this.baseAmortissable(Number(immo.valeurOrigine), Number(immo.valeurResiduelle));

      const cle = immo.compteImmobilisation.id;
      const groupe =
        groupes.get(cle) ??
        {
          numero: immo.compteImmobilisation.numero,
          intitule: immo.compteImmobilisation.intitule,
          lignes: [] as LigneTableauAmortissement[],
          parMois: moisDeLExercice.map(() => 0),
          dotation: 0,
          cumulN1: 0,
          cumulN: 0,
          net: 0,
        };
      groupe.lignes.push({
        id: immo.id,
        designation: immo.designation,
        dateAcquisition: immo.dateAcquisition.toISOString().slice(0, 10),
        valeurBrute: Number(immo.valeurOrigine),
        // Le taux, pas seulement la durée · c'est ce que leur tableau affiche,
        // et c'est ce qu'on relit pour vérifier une annuité de tête.
        taux: immo.dureeAmortissementAns > 0 ? arrondir(100 / immo.dureeAmortissementAns) : 0,
        base: arrondir(base),
        parMois,
        dotation: arrondir(dotation),
        cumulN1,
        cumulN,
        valeurNette: net,
        dotationPassee: Boolean(dejaPassee),
      });
      parMois.forEach((m, i) => {
        groupe.parMois[i] = arrondir(groupe.parMois[i] + m);
      });
      groupe.dotation = arrondir(groupe.dotation + dotation);
      groupe.cumulN1 = arrondir(groupe.cumulN1 + cumulN1);
      groupe.cumulN = arrondir(groupe.cumulN + cumulN);
      groupe.net = arrondir(groupe.net + net);
      groupes.set(cle, groupe);
    }

    const listeGroupes = [...groupes.values()].sort((a, b) => a.numero.localeCompare(b.numero));
    const NOMS_MOIS = ['Janv.', 'Févr.', 'Mars', 'Avril', 'Mai', 'Juin', 'Juill.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];
    return {
      exercice: {
        dateDebut: exercice.dateDebut.toISOString().slice(0, 10),
        dateFin: exercice.dateFin.toISOString().slice(0, 10),
      },
      mois: moisDeLExercice.map(({ annee, mois }) => ({ cle: `${annee}-${String(mois + 1).padStart(2, '0')}`, libelle: NOMS_MOIS[mois] })),
      groupes: listeGroupes,
      totaux: {
        parMois: moisDeLExercice.map((_, i) => arrondir(listeGroupes.reduce((t, g) => t + g.parMois[i], 0))),
        dotation: arrondir(listeGroupes.reduce((t, g) => t + g.dotation, 0)),
        cumulN1: arrondir(listeGroupes.reduce((t, g) => t + g.cumulN1, 0)),
        cumulN: arrondir(listeGroupes.reduce((t, g) => t + g.cumulN, 0)),
        net: arrondir(listeGroupes.reduce((t, g) => t + g.net, 0)),
      },
    };
  }

  async passerDotation(tenantId: string, userId: string, id: string, dto: PasserDotationDto) {
    const immo = await this.trouver(tenantId, id);
    if (immo.statut !== StatutImmobilisation.EN_SERVICE) {
      throw new BadRequestException("Cette immobilisation n'est plus en service · aucune dotation possible");
    }
    const exercice = await this.prisma.exercice.findFirst({ where: { id: dto.exerciceId, tenantId } });
    if (!exercice) throw new BadRequestException('Exercice introuvable pour ce tenant');
    const sansProrata = this.sansProrataTemporis(await this.regimeComptable(tenantId));

    const dejaPassee = await this.prisma.dotationAmortissement.findUnique({
      where: { immobilisationId_exerciceId: { immobilisationId: id, exerciceId: dto.exerciceId } },
    });
    if (dejaPassee) {
      throw new ConflictException('Une dotation a déjà été passée pour cette immobilisation sur cet exercice');
    }

    const montant = this.calculerDotation(
      Number(immo.valeurOrigine),
      Number(immo.valeurResiduelle),
      immo.dureeAmortissementAns,
      immo.dateMiseEnService,
      immo.dotations.map((d) => ({ montant: Number(d.montant) })),
      exercice,
      Number(immo.amortissementAnterieur ?? 0),
      // Les dépréciations ANTÉRIEURES à cet exercice · celle de l'exercice en
      // cours, si elle existe, se constate à la clôture après la dotation et
      // ne peut donc pas déjà ré-étaler le plan de la même annuité.
      this.cumulDepreciation(
        immo.depreciations
          .filter((d) => d.exercice.dateFin < exercice.dateFin)
          .map((d) => ({ sens: d.sens, montant: Number(d.montant) })),
      ),
      sansProrata,
    );
    if (montant <= EPSILON) {
      throw new BadRequestException('Aucun montant à doter · le bien est déjà entièrement amorti ou hors période');
    }

    // Utilisation au crédit du compte 28 (skill sycebnl, COMPTE 28) · par le
    // débit du compte 681 (dotations aux amortissements d'exploitation).
    const ecriture = await this.ecritureService.creer(tenantId, userId, {
      exerciceId: dto.exerciceId,
      journalId: dto.journalId,
      date: exercice.dateFin.toISOString().slice(0, 10),
      libelle: `Dotation aux amortissements · ${immo.designation}`,
      lignes: [
        { compteId: immo.compteDotationId, debit: montant, credit: 0 },
        { compteId: immo.compteAmortissementId, debit: 0, credit: montant },
      ],
    });

    try {
      const dotation = await this.prisma.dotationAmortissement.create({
        data: { immobilisationId: id, exerciceId: dto.exerciceId, montant, ecritureId: ecriture.id },
      });
      return versDotation(dotation);
    } catch (err) {
      if (estConflitUnicite(err)) {
        await this.annulerEcritureOrpheline(ecriture.id);
        throw new ConflictException('Une dotation a déjà été passée pour cette immobilisation sur cet exercice');
      }
      throw err;
    }
  }


  /**
   * DÉPRÉCIATION D'UNE IMMOBILISATION · dotation ou reprise.
   *
   * Le module tenait le bien au coût historique et ne savait rien des comptes
   * 29, pourtant semés et mouvementables à la main. Un dossier qui dépréciait
   * installait alors deux divergences muettes, et le contrôle
   * DEPRECIATION_IMMO_HORS_MODULE ne pouvait que les signaler :
   * la base amortissable ignorait la perte de valeur, et la sortie du bien ne
   * soldait pas le 29. Aucune écriture ne se déséquilibrait.
   *
   * CE QUE LE LOGICIEL NE DÉCIDE PAS. Ni la valeur actuelle, ni l'existence
   * d'un indice. Le ch. 12 § 2.1 est explicite : « s'il n'existe pas d'indice
   * de perte de valeur, aucun test de dépréciation n'est requis ». Le montant
   * et l'indice sont donc saisis ; le logiciel vérifie ce qui est vérifiable.
   */
  async enregistrerDepreciation(tenantId: string, userId: string, id: string, dto: DepreciationDto) {
    const immo = await this.trouver(tenantId, id);
    if (immo.statut !== StatutImmobilisation.EN_SERVICE) {
      throw new BadRequestException("Cette immobilisation n'est plus en service · aucune dépréciation possible");
    }
    const exercice = await this.prisma.exercice.findFirst({ where: { id: dto.exerciceId, tenantId } });
    if (!exercice) throw new BadRequestException('Exercice introuvable pour ce tenant');

    const [compte29, contrepartie] = await Promise.all([
      this.prisma.compte.findFirst({ where: { id: dto.compteDepreciationId, tenantId } }),
      this.prisma.compte.findFirst({ where: { id: dto.compteContrepartieId, tenantId } }),
    ]);
    if (!compte29) throw new BadRequestException('Compte de dépréciation introuvable pour ce tenant');
    if (!contrepartie) throw new BadRequestException('Compte de contrepartie introuvable pour ce tenant');
    // La seule règle de compte que les DEUX textes écrivent · le 29 et rien
    // d'autre. La fiche du COMPTE 29 énumère ses exclusions : 39 pour les
    // stocks, 49 pour les tiers, 59 pour la trésorerie. Le sous-compte exact
    // reste libre, il dépend du plan que le dossier a ouvert.
    if (!compte29.numero.startsWith('29')) {
      throw new BadRequestException(
        "La dépréciation d'une immobilisation s'inscrit au compte 29. Le compte 39 est celui des stocks, le 49 " +
          'celui des tiers et le 59 celui de la trésorerie.',
      );
    }

    const cumul = this.cumulDepreciation(
      immo.depreciations.map((d) => ({ sens: d.sens, montant: Number(d.montant) })),
    );
    if (dto.sens === SensDepreciation.REPRISE && dto.montant > cumul + EPSILON) {
      // Une reprise supérieure au cumul rendrait le compte 29 DÉBITEUR, ce qui
      // ferait de la correction d'actif « de sens négatif » (fiche du COMPTE
      // 29) une majoration de valeur déguisée. Le ch. 12 § 2.4.2 pose en outre
      // un plafond plus fin, que ce contrôle n'atteint pas : la valeur
      // comptable après reprise ne doit pas dépasser celle qui aurait existé
      // sans dépréciation. Le reconstituer supposerait de rejouer le plan
      // d'origine exercice par exercice · non fait, et dit ici plutôt que
      // laissé croire.
      throw new BadRequestException(
        `La reprise ne peut pas dépasser la dépréciation encore inscrite (${cumul.toFixed(2)})`,
      );
    }
    if (dto.sens === SensDepreciation.DOTATION) {
      // Une dépréciation ne peut pas descendre la valeur nette sous zéro.
      const cumulAmorti =
        immo.dotations.reduce((t, d) => t + Number(d.montant), 0) + Math.max(0, Number(immo.amortissementAnterieur ?? 0));
      const valeurNette = Number(immo.valeurOrigine) - cumulAmorti - cumul;
      if (dto.montant > valeurNette + EPSILON) {
        throw new BadRequestException(
          `La dépréciation ne peut pas dépasser la valeur comptable nette du bien (${Math.max(0, valeurNette).toFixed(2)})`,
        );
      }
    }

    // Fiche du COMPTE 29, « fonctionnement » · la dotation CRÉDITE le 29 par le
    // débit du 69 ; la reprise le DÉBITE par le crédit du 79.
    const dotation = dto.sens === SensDepreciation.DOTATION;
    const ecriture = await this.ecritureService.creer(tenantId, userId, {
      exerciceId: dto.exerciceId,
      journalId: dto.journalId,
      date: exercice.dateFin.toISOString().slice(0, 10),
      libelle: `${dotation ? 'Dotation' : 'Reprise'} de dépréciation · ${immo.designation}`,
      lignes: dotation
        ? [
            { compteId: contrepartie.id, debit: dto.montant, credit: 0 },
            { compteId: compte29.id, debit: 0, credit: dto.montant },
          ]
        : [
            { compteId: compte29.id, debit: dto.montant, credit: 0 },
            { compteId: contrepartie.id, debit: 0, credit: dto.montant },
          ],
    });

    try {
      return await this.prisma.depreciationImmobilisation.create({
        data: {
          immobilisationId: id,
          exerciceId: dto.exerciceId,
          sens: dto.sens,
          montant: dto.montant,
          compteDepreciationId: compte29.id,
          compteContrepartieId: contrepartie.id,
          indice: dto.indice,
          ecritureId: ecriture.id,
          createdBy: userId,
        },
      });
    } catch (err) {
      // Même compensation que passerDotation · l'écriture existe déjà quand la
      // contrainte d'unicité tombe, et une écriture orpheline au grand livre
      // gonflerait le compte 29 sans qu'aucune ligne ne la porte.
      if (estConflitUnicite(err)) {
        await this.annulerEcritureOrpheline(ecriture.id);
        throw new ConflictException(
          'Une dépréciation a déjà été enregistrée pour cette immobilisation sur cet exercice',
        );
      }
      throw err;
    }
  }


  /**
   * RENOUVELLEMENT D'UN COMPOSANT · AUDCIF Titre VIII ch. 4 § 4.1.
   *
   * Deux mouvements indissociables : la valeur nette comptable du composant
   * REMPLACÉ sort de l'actif (compte 812, ou 654 en cession courante), et le
   * coût du renouvellement entre à l'actif dans un sous-compte de
   * l'immobilisation principale, avec son propre plan.
   *
   * CE QUE RIEN NE VOYAIT AVANT. Les deux opérations étaient possibles
   * séparément · créer le nouveau bien, et oublier de sortir l'ancien. Le
   * bilan portait alors deux ascenseurs pour une seule cage, l'écriture
   * d'acquisition restait équilibrée, la balance bouclait, et le parc
   * continuait d'amortir un composant qui n'existe plus. Les lier en une seule
   * opération est le seul moyen de rendre l'oubli impossible.
   *
   * La durée du nouveau composant est SAISIE et non déduite · le § 4.4 la fait
   * dépendre de ce qui vient après (un nouveau remplacement, ou la fin
   * d'utilisation de la structure), que le logiciel ne connaît pas.
   */
  async renouveler(tenantId: string, userId: string, composantId: string, dto: RenouvelerComposantDto) {
    const ancien = await this.trouver(tenantId, composantId);
    if (!ancien.immobilisationPrincipaleId) {
      throw new BadRequestException(
        "Ce bien n'est pas un composant · le renouvellement d'un composant suppose une immobilisation principale " +
          'à laquelle rattacher le remplaçant (AUDCIF, Titre VIII ch. 4 § 4.1). Pour un bien autonome, utilisez ' +
          'la sortie puis une nouvelle acquisition.',
      );
    }

    // 1. La sortie de l'ancien · elle porte déjà la dotation complémentaire de
    //    l'exercice, le solde du 28, celui du 29 et le calcul de la VCN.
    await this.sortir(tenantId, userId, composantId, {
      dateSortie: dto.dateRenouvellement,
      type: TypeSortie.MISE_HORS_SERVICE,
      exerciceId: dto.exerciceId,
      journalId: dto.journalId,
      cessionCourante: dto.cessionCourante,
    } as SortirImmobilisationDto);

    // 2. Le remplaçant, rattaché au MÊME principal et à la même famille · le
    //    texte dit « dans un sous-compte de l'immobilisation principale », donc
    //    au même compte d'imputation que celui qu'il remplace.
    return this.creer(
      tenantId,
      userId,
      {
        familleId: ancien.familleId,
        designation: dto.designation,
        dateAcquisition: dto.dateRenouvellement,
        dateMiseEnService: dto.dateRenouvellement,
        valeurOrigine: dto.coutRenouvellement,
        valeurResiduelle: dto.valeurResiduelle ?? 0,
        dureeAmortissementAns: dto.dureeAmortissementAns,
        compteContrepartieId: dto.compteContrepartieId,
        exerciceId: dto.exerciceId,
        journalId: dto.journalId,
        immobilisationPrincipaleId: ancien.immobilisationPrincipaleId,
        typeComposant: ancien.typeComposant ?? undefined,
        // La justification du bien remplacé vaut pour son remplaçant · elle
        // porte sur la décomposition du principal, pas sur la pièce.
        justificationDecomposition:
          ancien.justificationDecomposition ??
          `Renouvellement du composant « ${ancien.designation} » (AUDCIF, Titre VIII ch. 4 § 4.1)`,
        dernierRenouvellement: dto.dernierRenouvellement,
      } as CreerImmobilisationDto,
      { composantRemplaceId: composantId },
    );
  }

  /**
   * RECLASSEMENT · le changement d'utilisation du ch. 10 § 2.4.
   *
   * « Les immeubles de placement peuvent faire l'objet de changements
   * d'utilisation, reflétés dans les états financiers par des transferts entre
   * catégories du bilan, par exemple vers les immobilisations corporelles ou
   * les stocks. » Et la règle qui commande toute la mécanique : « Étant donné
   * que les immeubles de placement sont évalués selon le modèle du coût
   * historique, les transferts […] N'ONT PAS D'INCIDENCE SUR LA VALEUR
   * COMPTABLE du bien immobilier transféré. »
   *
   * AUCUN MONTANT N'EST RECALCULÉ, ET C'EST LA SÛRETÉ DE L'OPÉRATION. On vire
   * ce que le bien porte déjà : sa valeur d'origine, son cumul
   * d'amortissement, sa dépréciation s'il en a une. Le plan d'amortissement ne
   * bouge pas, la valeur nette comptable non plus, et aucune ligne de résultat
   * n'est touchée · un reclassement n'est ni une cession ni une dépréciation.
   *
   * PAS DE DOTATION COMPLÉMENTAIRE, contrairement à `sortir`. Le bien ne quitte
   * pas le patrimoine : son amortissement continue sur le même plan, et une
   * annuité arrêtée à la date du transfert la ferait courir deux fois.
   *
   * CE QUE L'OPÉRATION NE FAIT PAS, ET POURQUOI. Le § 2.4 nomme aussi le
   * transfert vers les STOCKS. Il n'est pas offert ici : la famille de
   * destination porte forcément un compte de classe 2
   * (`verifierComptesFamille`), et un bien qui passe en stock quitte le module
   * · c'est une sortie, suivie d'une écriture de stock que le comptable
   * compose. Le lui laisser croire possible ici serait pire que l'absence.
   */
  async reclasser(tenantId: string, userId: string, id: string, dto: ReclasserImmobilisationDto) {
    const immo = await this.trouver(tenantId, id);
    if (immo.statut !== StatutImmobilisation.EN_SERVICE) {
      throw new BadRequestException(
        "Un bien sorti ne se reclasse pas · le reclassement est un changement d'UTILISATION (ch. 10 § 2.4), et " +
          "un bien cédé ou mis hors service n'a plus d'utilisation.",
      );
    }

    const exercice = await this.prisma.exercice.findFirst({ where: { id: dto.exerciceId, tenantId } });
    if (!exercice) throw new BadRequestException('Exercice introuvable pour ce tenant');
    const dateReclassement = new Date(dto.dateReclassement);
    if (dateReclassement < exercice.dateDebut || dateReclassement > exercice.dateFin) {
      throw new BadRequestException("La date de reclassement doit se situer dans l'exercice indiqué");
    }
    if (dateReclassement < immo.dateAcquisition) {
      throw new BadRequestException("La date de reclassement ne peut pas précéder l'acquisition du bien");
    }
    if (!dto.motif.trim()) {
      throw new BadRequestException(
        "Le motif du reclassement est obligatoire · le § 1.2 du ch. 10 qualifie un immeuble de placement par " +
          "l'USAGE, que nul solde ne porte, et le § 4.2 en fait une information de Notes annexes.",
      );
    }

    const nouvelleFamille = await this.prisma.familleImmobilisation.findFirst({
      where: { id: dto.nouvelleFamilleId, tenantId },
      include: { compteImmobilisation: true, compteAmortissement: true },
    });
    if (!nouvelleFamille) throw new BadRequestException('Famille de destination introuvable pour ce tenant');

    if (nouvelleFamille.compteImmobilisationId === immo.compteImmobilisationId) {
      throw new BadRequestException(
        `Le bien est déjà porté au compte ${immo.compteImmobilisation.numero} · un reclassement qui ne change ` +
          "pas de compte n'a rien à virer, et laisserait au grand livre une écriture nulle que personne ne " +
          'saurait relire.',
      );
    }

    // LA NATURE NE CHANGE PAS · un bien corporel ne devient pas incorporel par
    // un changement d'utilisation. Le refus tient à ce que les comptes 81, 28
    // et 68 sont éclatés PAR NATURE dans les deux plans : un virement qui la
    // franchirait laisserait le bien avec un compte de dotation qui ne
    // correspond plus à son compte d'actif, et la prochaine dotation
    // s'imputerait au mauvais poste sans que rien ne se déséquilibre.
    const regime = await this.regimeComptable(tenantId);
    const natureAvant = natureImmobilisation(immo.compteImmobilisation.numero, regime.referentiel);
    const natureApres = natureImmobilisation(nouvelleFamille.compteImmobilisation.numero, regime.referentiel);
    if (natureAvant !== natureApres) {
      throw new BadRequestException(
        `Le reclassement ne change pas la NATURE du bien (${natureAvant} vers ${natureApres}) · un changement ` +
          "d'utilisation déplace un bien entre catégories du bilan, il ne le transforme pas. Les comptes " +
          "d'amortissement et de dotation sont éclatés par nature, et le franchir imputerait les dotations " +
          'suivantes à un poste qui ne correspond plus à celui de l’actif.',
      );
    }

    const cumulAmorti =
      immo.dotations.reduce((s, d) => s + Number(d.montant), 0) + Number(immo.amortissementAnterieur ?? 0);
    const cumulDepreciation = this.cumulDepreciation(
      immo.depreciations.map((d) => ({ sens: d.sens, montant: Number(d.montant) })),
    );
    const derniereDepreciation = immo.depreciations.at(-1) ?? null;

    // LE 29 DE DESTINATION EST CHOISI, JAMAIS DEVINÉ · même raison qu'à la
    // dotation de dépréciation : le module ne connaît pas la subdivision que le
    // dossier a ouverte. Sans lui, le virement laisserait le cumul sur
    // l'ancien 29, et la SORTIE du bien solderait un compte qui ne correspond
    // plus à son actif.
    let nouveauCompteDepreciation: { id: string } | null = null;
    if (cumulDepreciation > EPSILON) {
      if (!dto.nouveauCompteDepreciationId) {
        throw new BadRequestException(
          'Ce bien porte une dépréciation : indiquez le compte 29 de destination. Il n’est pas déduit du nouveau ' +
            'compte d’immobilisation, le module ne connaissant pas la subdivision que le dossier a ouverte · un ' +
            '29 deviné serait un compte faux dans une balance juste.',
        );
      }
      const compte29 = await this.prisma.compte.findFirst({
        where: { id: dto.nouveauCompteDepreciationId, tenantId },
      });
      if (!compte29) throw new BadRequestException('Compte de dépréciation introuvable pour ce tenant');
      if (!compte29.numero.startsWith('29')) {
        throw new BadRequestException(
          `Le compte ${compte29.numero} n’est pas un compte de dépréciation d’immobilisation · les deux plans ` +
            'écrivent le préfixe 29 (39 pour les stocks, 49 pour les tiers, 59 pour la trésorerie).',
        );
      }
      nouveauCompteDepreciation = compte29;
    }

    // Une seule écriture, équilibrée par construction : chaque compte viré
    // apparaît au débit d'un côté et au crédit de l'autre.
    const lignes: Array<{ compteId: string; debit: number; credit: number }> = [
      { compteId: nouvelleFamille.compteImmobilisationId, debit: Number(immo.valeurOrigine), credit: 0 },
      { compteId: immo.compteImmobilisationId, debit: 0, credit: Number(immo.valeurOrigine) },
    ];
    if (cumulAmorti > EPSILON) {
      // L'amortissement suit son bien · le laisser sur l'ancien 28 rendrait la
      // valeur nette du nouveau poste égale à la valeur BRUTE, et celle de
      // l'ancien négative.
      lignes.push({ compteId: immo.compteAmortissementId, debit: cumulAmorti, credit: 0 });
      lignes.push({ compteId: nouvelleFamille.compteAmortissementId, debit: 0, credit: cumulAmorti });
    }
    if (cumulDepreciation > EPSILON && derniereDepreciation && nouveauCompteDepreciation) {
      lignes.push({ compteId: derniereDepreciation.compteDepreciationId, debit: cumulDepreciation, credit: 0 });
      lignes.push({ compteId: nouveauCompteDepreciation.id, debit: 0, credit: cumulDepreciation });
    }

    const ecriture = await this.ecritureService.creer(tenantId, userId, {
      exerciceId: dto.exerciceId,
      journalId: dto.journalId,
      date: dto.dateReclassement,
      libelle: `Reclassement · ${immo.designation}`,
      lignes,
    });

    // Les trois comptes du bien suivent, et les lignes de dépréciation aussi ·
    // sans cette dernière mise à jour, la sortie ultérieure solderait l'ancien
    // 29 et laisserait le nouveau créditeur pour un bien qui n'existe plus.
    const [immobilisation] = await this.prisma.$transaction([
      this.prisma.immobilisation.update({
        where: { id },
        data: {
          familleId: nouvelleFamille.id,
          compteImmobilisationId: nouvelleFamille.compteImmobilisationId,
          compteAmortissementId: nouvelleFamille.compteAmortissementId,
          compteDotationId: nouvelleFamille.compteDotationId,
        },
        include: { compteImmobilisation: true, compteAmortissement: true, compteDotation: true },
      }),
      ...(nouveauCompteDepreciation
        ? [
            this.prisma.depreciationImmobilisation.updateMany({
              where: { immobilisationId: id },
              data: { compteDepreciationId: nouveauCompteDepreciation.id },
            }),
          ]
        : []),
      this.prisma.reclassementImmobilisation.create({
        data: {
          immobilisationId: id,
          exerciceId: dto.exerciceId,
          dateReclassement,
          motif: dto.motif.trim(),
          ancienCompteImmobilisationId: immo.compteImmobilisationId,
          nouveauCompteImmobilisationId: nouvelleFamille.compteImmobilisationId,
          ecritureId: ecriture.id,
          createdBy: userId,
        },
      }),
    ]);

    return {
      immobilisation,
      ecriture,
      // Ce que l'opération a viré, dit à l'écran · aucun de ces trois montants
      // n'a été recalculé.
      vire: {
        valeurOrigine: Number(immo.valeurOrigine),
        cumulAmortissement: cumulAmorti,
        cumulDepreciation,
      },
    };
  }

  /**
   * Sortie (cession ou mise hors service) · skill sycebnl, COMPTE 21-27
   * "utilisation au crédit" : le compte d'immobilisation est crédité pour
   * solde, en contrepartie du débit du compte 81 (V.C.N., pour la valeur
   * nette restante) et du débit du compte 28 (pour solde des amortissements
   * cumulés). Si cession avec un prix, le produit est comptabilisé
   * SÉPARÉMENT au crédit du compte 82 (skill sycebnl ne mélange jamais VCN
   * et produit de cession dans la même ligne).
   */
  async sortir(tenantId: string, userId: string, id: string, dto: SortirImmobilisationDto) {
    const immo = await this.trouver(tenantId, id);
    if (immo.statut !== StatutImmobilisation.EN_SERVICE) {
      throw new BadRequestException('Cette immobilisation est déjà sortie');
    }
    const exercice = await this.prisma.exercice.findFirst({ where: { id: dto.exerciceId, tenantId } });
    if (!exercice) throw new BadRequestException('Exercice introuvable pour ce tenant');
    const dateSortie = new Date(dto.dateSortie);

    if (dateSortie < immo.dateMiseEnService) {
      throw new BadRequestException('La date de sortie ne peut pas précéder la date de mise en service');
    }
    if (dateSortie < exercice.dateDebut || dateSortie > exercice.dateFin) {
      throw new BadRequestException("La date de sortie doit se situer dans l'exercice indiqué");
    }

    if (dto.type === TypeSortie.CESSION && (dto.prixCession === undefined || !dto.compteContrepartieId)) {
      throw new BadRequestException('Une cession nécessite un prix et un compte de contrepartie (trésorerie ou tiers)');
    }

    // CESSION COURANTE · exploitation (654 / 754) au lieu de H.A.O. (81 / 82).
    // Les deux refus ci-dessous sont posés côté SERVEUR : l'écran peut cacher
    // la case, un appel direct la poserait quand même.
    // Le régime du dossier est lu UNE FOIS, en tête : le référentiel entre
    // dans la lecture de la nature (division 20 du SYCEBNL) et dans le compte
    // de reprise de dépréciation, le système dans le prorata de la dotation
    // complémentaire. Il était jusqu'ici lu seulement dans la branche
    // « cession courante ».
    const regime = await this.regimeComptable(tenantId);
    const { referentiel } = regime;
    const nature = natureImmobilisation(immo.compteImmobilisation.numero, referentiel);
    let comptes = COMPTES_SORTIE[nature];
    if (dto.cessionCourante) {
      if (referentiel !== Referentiel.SYSCOHADA) {
        throw new BadRequestException(
          "La cession courante impute la sortie aux comptes 654 et 754, qui portent au plan SYCEBNL les dons en " +
            "nature courants reçus à distribuer. Sur un dossier SYCEBNL, une cession se comptabilise en hors " +
            'activités ordinaires (comptes 81 et 82).',
        );
      }
      const courants = COMPTES_CESSION_COURANTE[nature];
      if (!courants) {
        throw new BadRequestException(
          "Les comptes 654 et 754 n'ont que deux subdivisions, incorporelles et corporelles : une immobilisation " +
            'financière se cède en hors activités ordinaires (comptes 816 et 826), quelle que soit la fréquence ' +
            'des cessions.',
        );
      }
      comptes = courants;
    }

    // Verrou par écriture conditionnelle AVANT tout effet de bord (même
    // risque de course que passerDotation, trouvé en l'approfondissant ·
    // deux sorties simultanées sur le même bien liraient toutes deux
    // EN_SERVICE et posteraient chacune leurs écritures). Un UPDATE Postgres
    // filtré sur le statut prend un verrou de ligne : seule une requête à la
    // fois peut faire passer `statut` de EN_SERVICE à sa valeur finale ; la
    // perdante voit `count: 0` et s'arrête avant d'avoir rien posté au grand
    // livre · pas de compensation nécessaire ici, contrairement à
    // passerDotation (où la première écriture existe déjà avant que la
    // contrainte d'unicité ne puisse être testée).
    const statutFinal = dto.type === TypeSortie.CESSION ? StatutImmobilisation.CEDEE : StatutImmobilisation.MISE_HORS_SERVICE;
    const verrou = await this.prisma.immobilisation.updateMany({
      where: { id, tenantId, statut: StatutImmobilisation.EN_SERVICE },
      data: { statut: statutFinal, dateSortie, prixCession: dto.prixCession },
    });
    if (verrou.count === 0) {
      throw new ConflictException('Cette immobilisation vient déjà d\'être sortie par une autre opération');
    }

    // Dotation complémentaire de l'exercice de sortie (skill sycebnl, COMPTE
    // 28 : "la dotation complémentaire en cas de cession"), seulement si
    // aucune dotation n'a déjà été passée sur cet exercice pour ce bien ·
    // sinon le cumul est déjà à jour, pas de complément à ajouter.
    // L'AMORTISSEMENT ANTÉRIEUR COMPTE DANS LA VALEUR COMPTABLE NETTE. Sans
    // lui, la sortie d'un bien repris sortirait une VCN gonflée de tout ce qui
    // avait été amorti avant l'entrée dans le logiciel · et le compte 28 soldé
    // à la sortie ne correspondrait pas à ce que le bilan portait.
    let cumulAmorti =
      immo.dotations.reduce((s, d) => s + Number(d.montant), 0) + Number(immo.amortissementAnterieur ?? 0);
    const dejaDoteCetExercice = immo.dotations.some((d) => d.exerciceId === dto.exerciceId);
    if (!dejaDoteCetExercice) {
      const montantComplement = this.calculerDotation(
        Number(immo.valeurOrigine),
        Number(immo.valeurResiduelle),
        immo.dureeAmortissementAns,
        immo.dateMiseEnService,
        immo.dotations.map((d) => ({ montant: Number(d.montant) })),
        { dateDebut: exercice.dateDebut, dateFin: dateSortie },
        Number(immo.amortissementAnterieur ?? 0),
        this.cumulDepreciation(
          immo.depreciations
            .filter((d) => d.exercice.dateFin < exercice.dateFin)
            .map((d) => ({ sens: d.sens, montant: Number(d.montant) })),
        ),
        this.sansProrataTemporis(regime),
      );
      if (montantComplement > EPSILON) {
        const ecritureComplement = await this.ecritureService.creer(tenantId, userId, {
          exerciceId: dto.exerciceId,
          journalId: dto.journalId,
          date: dto.dateSortie,
          libelle: `Dotation complémentaire (sortie) · ${immo.designation}`,
          lignes: [
            { compteId: immo.compteDotationId, debit: montantComplement, credit: 0 },
            { compteId: immo.compteAmortissementId, debit: 0, credit: montantComplement },
          ],
        });
        // Conflit théorique seulement ici : le verrou ci-dessus garantit déjà
        // qu'aucune autre sortie ne peut être en cours sur ce bien, mais
        // passerDotation() reste appelable en parallèle sur le même
        // exercice · même compensation par cohérence, au cas où.
        try {
          await this.prisma.dotationAmortissement.create({
            data: { immobilisationId: id, exerciceId: dto.exerciceId, montant: montantComplement, ecritureId: ecritureComplement.id },
          });
        } catch (err) {
          if (estConflitUnicite(err)) {
            await this.annulerEcritureOrpheline(ecritureComplement.id);
            throw new ConflictException('Une dotation a été passée entre-temps pour cette immobilisation sur cet exercice · réessayez la sortie');
          }
          throw err;
        }
        cumulAmorti += montantComplement;
      }
    }

    /*
      LA DÉPRÉCIATION SORT AVEC LE BIEN · MAIS PAS EN MOINS DU COMPTE 81.

      Les deux textes rangent le compte 29 « distinctement à l'actif, EN
      DIMINUTION DE LA VALEUR BRUTE des biens correspondants pour donner leur
      valeur comptable nette » (SYCEBNL, fiche du COMPTE 29 · AUDCIF art. 46 et
      Titre VIII ch. 12). Le sortir suppose donc de le SOLDER comme le 28.
      C'est acquis, et c'est la première divergence qui avait été corrigée : un
      29 laissé au bilan après la sortie du bien qu'il corrigeait est une
      correction d'actif sans actif.

      CE QUI ÉTAIT FAUX, C'ÉTAIT SA CONTREPARTIE. Le 29 était débité SANS
      reprise, et c'est la ligne 81 · réduite d'autant · qui équilibrait
      l'écriture. Or la fiche du COMPTE 81 l'exclut nommément, dans les deux
      référentiels : « ne doit pas servir à enregistrer les DÉPRÉCIATIONS
      AFFÉRENTES AUX ÉLÉMENTS D'ACTIF IMMOBILISÉ CÉDÉS · utiliser le compte
      29 », et son Contenu ne retranche de la valeur d'entrée que « le cumul
      des AMORTISSEMENTS pratiqués » (pour un bien non amortissable, la valeur
      d'entrée « SANS DÉDUCTION des éventuelles dépréciations »).

      L'ÉCRITURE ÉTAIT ÉQUILIBRÉE ET LE RÉSULTAT NET EXACT · c'est pourquoi
      rien ne le signalait. Ce qui était faux, c'est la VENTILATION : la charge
      H.A.O. du 81 minorée du cumul de dépréciation, et le produit de reprise
      absent du résultat d'exploitation. Les notes de cessions et de reprises
      s'en trouvaient fausses du même montant, des deux côtés.

      LE MODÈLE COMPLET EST DANS L'AUDCIF, Titre VIII ch. 13 § 4.1 (cession de
      titres, une sortie H.A.O. elle aussi) : la valeur comptable portée au 816
      est « égale au coût d'acquisition, NON DIMINUÉ PAR UNE ÉVENTUELLE
      DÉPRÉCIATION », et « dans les cas où une dépréciation avait été
      constituée, cette dernière est REPRISE par le crédit du compte 7972 ».
    */
    const cumulDepreciation = this.cumulDepreciation(
      immo.depreciations.map((d) => ({ sens: d.sens, montant: Number(d.montant) })),
    );
    const derniereDepreciation = immo.depreciations.at(-1) ?? null;
    const compteDepreciationSortie = derniereDepreciation?.compteDepreciationId ?? null;

    // Valeur d'entrée MOINS LES SEULS AMORTISSEMENTS · fiche du COMPTE 81,
    // « Contenu », dans les deux référentiels.
    const valeurComptableNette = Math.max(0, Number(immo.valeurOrigine) - cumulAmorti);

    const lignesSortie: Array<{ compteId: string; debit: number; credit: number }> = [
      { compteId: immo.compteImmobilisationId, debit: 0, credit: Number(immo.valeurOrigine) },
    ];
    if (cumulAmorti > EPSILON) {
      lignesSortie.push({ compteId: immo.compteAmortissementId, debit: cumulAmorti, credit: 0 });
    }
    if (cumulDepreciation > EPSILON && compteDepreciationSortie) {
      // Le 29 au débit pour solde, et sa REPRISE au crédit · les deux
      // ensemble, jamais le premier seul.
      const compteReprise = await this.compteRepriseDepreciation(
        tenantId,
        referentiel,
        nature,
        derniereDepreciation?.compteContrepartieId ?? null,
      );
      lignesSortie.push({ compteId: compteDepreciationSortie, debit: cumulDepreciation, credit: 0 });
      lignesSortie.push({ compteId: compteReprise.id, debit: 0, credit: cumulDepreciation });
    }
    if (valeurComptableNette > EPSILON) {
      const compteVNC = await this.compteDeSortie(tenantId, comptes.valeurComptable);
      lignesSortie.push({ compteId: compteVNC.id, debit: valeurComptableNette, credit: 0 });
    }

    const ecritureSortie = await this.ecritureService.creer(tenantId, userId, {
      exerciceId: dto.exerciceId,
      journalId: dto.journalId,
      date: dto.dateSortie,
      libelle: `${dto.type === TypeSortie.CESSION ? 'Cession' : 'Mise hors service'} · ${immo.designation}`,
      lignes: lignesSortie,
    });

    // Produit de cession · écriture séparée, jamais mélangée à la sortie de
    // l'actif (skill sycebnl distingue clairement 81 "valeur comptable" et
    // 82 "produit de cession").
    if (dto.type === TypeSortie.CESSION && dto.prixCession && dto.compteContrepartieId) {
      const compteProduit = await this.compteDeSortie(tenantId, comptes.produitCession);
      await this.ecritureService.creer(tenantId, userId, {
        exerciceId: dto.exerciceId,
        journalId: dto.journalId,
        date: dto.dateSortie,
        libelle: `Produit de cession · ${immo.designation}`,
        lignes: [
          { compteId: dto.compteContrepartieId, debit: dto.prixCession, credit: 0 },
          { compteId: compteProduit.id, debit: 0, credit: dto.prixCession },
        ],
      });
    }

    // statut/dateSortie/prixCession déjà posés par le verrou ci-dessus ;
    // il ne reste que l'écriture de sortie, connue seulement une fois postée.
    const immobilisation = await this.prisma.immobilisation.update({
      where: { id },
      data: { ecritureSortieId: ecritureSortie.id },
      include: { dotations: true },
    });
    return versImmobilisation(immobilisation);
  }
}
