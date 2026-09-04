import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { CreerTauxTvaDto, ModifierTauxTvaDto } from './dto/taux-tva.dto';
import { tauxTvaDefaut } from './taux-tva-seed';
import { Prisma, ClasseCompte, Referentiel, TypeJournal } from '@prisma/client';
import { EcritureService } from '../comptabilite/ecriture.service';

const EPSILON = 0.005;

/**
 * LA DÉCLARATION SE LIT SUR LA FAMILLE DU COMPTE, PAS SUR CELUI DU TAUX.
 *
 * Chaque `TauxTva` porte un compte de collecte et un compte de déduction ·
 * commodité de saisie, qui pré-remplit la contrepartie. La DÉCLARATION, elle,
 * agrégeait sur ces deux identifiants exactement, et c'était une hypothèse
 * fausse dès que le plan subdivise :
 *
 *   443 État, TVA facturée   · 4431 sur ventes · 4432 sur prestations de
 *     services · 4433 sur travaux · 4434 sur production livrée à soi-même ·
 *     4435 sur factures à établir ;
 *   445 État, TVA récupérable · 4451 sur immobilisations · 4452 sur achats ·
 *     4453 sur transport · 4454 sur services extérieurs et autres charges ·
 *     4455 sur factures non parvenues.
 *
 * (AUDCIF, Titre VII, COMPTE 44. Le SYCEBNL ne subdivise ni l'un ni l'autre,
 * et ses deux comptes portent les mêmes racines · une seule règle suffit.)
 *
 * Une TVA sur prestation de services correctement imputée en 4432 n'était donc
 * PAS déclarée, le taux à 16 % pointant sur 4431. Le compte de la TVA dépend
 * de la nature de l'opération, jamais de son taux : les deux ne peuvent pas
 * être rattachés l'un à l'autre. Ce qui identifie la ligne, c'est le TAUX
 * (`tauxTvaId`, posé à la saisie) et la FAMILLE du compte · d'où ces deux
 * racines, qui restent justes quel que soit le degré de subdivision du plan.
 *
 * Une TVA omise d'une déclaration est un redressement · c'est la raison pour
 * laquelle ce chemin ne s'appuie plus sur un compte unique.
 */
const RACINE_COLLECTEE = '443';
const RACINE_RECUPERABLE = '445';

/**
 * LA NATURE DE L'OPÉRATION SE LIT AU COMPTE · et c'est elle, non le dossier,
 * qui commande la date d'exigibilité.
 *
 * O.-L. n° 10/001, art. 25 (compilation DGI du 19/07/2026, fichier
 * `code-general-2026/references/10-tva-ol10-001-loi-base-ch1-10.md`,
 * l. 615-621) : « L'exigibilité de la taxe sur la valeur ajoutée est le droit
 * dont disposent les services de l'Administration des Impôts de réclamer du
 * redevable le paiement de la taxe à partir d'une date donnée. Elle
 * intervient : / 1. lors de la réalisation du fait générateur, pour les
 * livraisons de biens, y compris les livraisons à soi-même ; / 2. au moment
 * de l'encaissement du prix, des acomptes ou avances, pour les prestations de
 * services et les travaux immobiliers ». Datation faite : la L.F. n° 25/060
 * du 29/12/2025 ne modifie, en TVA, que les art. 10, 35, 42 point 4, 60, 62
 * et 74 (`lois-de-finances-annuelles/references/lf-2026-mesures-fiscales.md`,
 * l. 84-91) · l'art. 25 est bien la règle en vigueur en 2026.
 *
 * L'exigibilité suit donc L'OPÉRATION, opération par opération. Elle ne peut
 * pas être un réglage de dossier : une PME qui vend des marchandises ET
 * facture des prestations doit dater les premières au fait générateur et les
 * secondes à l'encaissement, dans la MÊME déclaration.
 *
 * Et le plan de comptes porte déjà cette information, posée à la saisie par
 * `client/src/lib/tva-syscohada.ts` d'après la contrepartie :
 *
 *   443 · 4431 sur ventes (biens) · 4432 sur prestations de services ·
 *         4433 sur travaux · 4434 sur production livrée à soi-même ;
 *   445 · 4451 sur immobilisations · 4452 sur achats · 4453 sur transport ·
 *         4454 sur services extérieurs et autres charges.
 *
 * CE QUI N'EST PAS CLASSÉ RESTE INDÉTERMINÉ, ET LE DIT. Le plan SYCEBNL ne
 * subdivise ni 443 ni 445 (`compte-seed.ts` l. 639-641 : un seul 44310000
 * « État, T.V.A. facturée » et un seul 44510000 « État, T.V.A. récupérable ») :
 * aucune nature n'y est lisible. Le 4451 non plus n'est pas classé, et c'est
 * délibéré : une immobilisation peut être acquise par livraison de biens
 * (art. 25, 1°) comme par travaux immobiliers ou cession d'un incorporel
 * (art. 25, 2°) · le compte ne tranche pas, donc le logiciel ne tranche pas.
 * Pour ces lignes, le paramètre du dossier sert de REPLI DÉCLARÉ, et la
 * déclaration l'annonce en toutes lettres au lieu de le faire passer pour la
 * règle.
 */
type NatureOperationTva = 'BIENS' | 'SERVICES' | 'INDETERMINEE';

/** Racines SYSCOHADA de TVA collectée dont la nature est certaine. */
const NATURE_COLLECTEE_SYSCOHADA: ReadonlyArray<readonly [string, NatureOperationTva]> = [
  // « TVA facturée sur ventes » · contreparties 701 à 704 et 707 (biens).
  ['4431', 'BIENS'],
  ['4432', 'SERVICES'],
  ['4433', 'SERVICES'],
  // « TVA facturée sur production livrée à soi-même ». L'art. 25, 1° range
  // expressément les livraisons à soi-même au fait générateur (« y compris les
  // livraisons à soi-même »), et le décret n° 011/42, art. 52, y ajoute les
  // PRESTATIONS à soi-même « à la date d'exécution du service » · dans les
  // deux cas, jamais l'encaissement, qui n'a pas de sens sans tiers.
  ['4434', 'BIENS'],
];

/** Racines SYSCOHADA de TVA récupérable dont la nature d'amont est certaine. */
const NATURE_RECUPERABLE_SYSCOHADA: ReadonlyArray<readonly [string, NatureOperationTva]> = [
  // « TVA récupérable sur achats » · contreparties de classe 60, des biens.
  ['4452', 'BIENS'],
  // Transport et services extérieurs · contreparties 61, 62 et 63, des
  // prestations de services.
  ['4453', 'SERVICES'],
  ['4454', 'SERVICES'],
];

/**
 * RECETTES EXCLUES DU DÉNOMINATEUR DU PRORATA (art. 43).
 *
 * Fichier `code-general-2026/references/10-tva-ol10-001-loi-base-ch1-10.md`,
 * art. 43 (modifié par la L.F. n° 14/002 du 31/01/2014, non retouché par la
 * L.F. n° 25/060), l. 1118-1122 : le dénominateur est « le montant annuel des
 * recettes de toute nature réalisées par l'assujetti À L'EXCLUSION des
 * cessions d'éléments de l'actif immobilisé, des subventions d'équipements,
 * des indemnités d'assurance ne constituant pas la contrepartie d'une
 * opération soumise à la taxe sur la valeur ajoutée et des débours » ; et
 * l. 1129-1130 : « Le montant des livraisons et des prestations à soi-même est
 * exclu des DEUX TERMES du rapport. »
 *
 * Le commentaire qui précédait affirmait que ces postes « ne sont de toute
 * façon jamais portés en classe 7 dans notre plan de comptes ». Le semis dit
 * le contraire, et chaque poste inclus à tort abaisse le prorata, donc la
 * déduction, AU DÉTRIMENT DU CONTRIBUABLE.
 *
 * LES RACINES DIFFÈRENT D'UN RÉFÉRENTIEL À L'AUTRE, et une liste commune
 * serait fausse : le 754 du SYSCOHADA est « Produits des cessions courantes
 * d'immobilisations » (compte-seed-syscohada.ts l. 1354-1356, alimenté par
 * `immobilisation.service.ts` sur cession courante), tandis que le 754 du
 * SYCEBNL est « Dons en nature courants » (compte-seed.ts l. 1218), qui est
 * une recette ordinaire et n'a rien à faire dans une liste d'exclusions.
 *
 * CE QUI N'EST PAS EXCLU, ET POURQUOI. Les subventions d'EXPLOITATION (71)
 * restent au dénominateur : l'art. 43 n'exclut que les subventions
 * d'ÉQUIPEMENT. Les débours n'ont pas de compte dédié dans les deux plans ·
 * ils ne sont donc pas retranchés, et la déclaration le dit plutôt que de le
 * taire.
 */
const RACINES_HORS_DENOMINATEUR_COMMUNES: ReadonlyArray<string> = [
  // 72 « Production immobilisée » et 724 « Production auto-consommée » · c'est
  // la livraison à soi-même, exclue des DEUX termes (art. 43, l. 1129-1130).
  '72',
  // 7582 « Indemnités d'assurances reçues » (SYSCOHADA) / « Produits divers ·
  // indemnités d'assurances » (SYCEBNL) · exclues quand elles ne sont pas la
  // contrepartie d'une opération taxée, ce qu'une indemnité d'assurance n'est
  // par nature jamais.
  '7582',
  // 799 « Reprises de subventions d'investissement » · seule forme sous
  // laquelle une subvention d'ÉQUIPEMENT (compte 14 « Subventions
  // d'investissement ») entre en classe 7. L'exclure, c'est appliquer
  // l'exclusion que le texte nomme ; la laisser, ce serait compter au
  // dénominateur une recette que l'art. 43 en retire.
  '799',
];

/** 754 « Produits des cessions courantes d'immobilisations » · SYSCOHADA seul. */
const RACINES_HORS_DENOMINATEUR_SYSCOHADA: ReadonlyArray<string> = ['754'];

/**
 * TVA (cf. docs/plan-de-construction.md §3.1/§5) : entité "Taux" paramétrable,
 * fondée sur l'O.-L. n° 10/001 du 20/08/2010 modifiée par la LF 2026 (skill
 * `fiscalite-rdc/tva`). Couvre désormais, en plus du référentiel (taux +
 * comptes 443/445 rattachés) : l'exigibilité par NATURE d'opération (art. 25
 * et 26), la naissance du droit à déduction chez le fournisseur (art. 37 al. 1
 * et décret n° 011/42 art. 96), le prorata de déduction (art. 43-45),
 * l'imputation du crédit de TVA sur les périodes suivantes (art. 63) et la
 * comptabilisation de la liquidation périodique (solde 443/445 sur le
 * compte 444).
 *
 * RESTE HORS SCOPE, ET IL FAUT LE NOMMER EXACTEMENT :
 *  · l'option pour secteurs distincts d'activité (art. 49) ;
 *  · la régularisation pluriannuelle du prorata sur les immobilisations
 *    (art. 46, variation > 10 % sur 4 ans) ;
 *  · LES RÉGULARISATIONS DES ART. 50 ET 51 · reversement d'une fraction de la
 *    taxe antérieurement déduite en cas de sortie d'actif, de changement
 *    d'utilisation, de disparition ou de vente à perte, et attestation à
 *    délivrer au cessionnaire. Elles ne sont ni calculées ni signalées, et le
 *    module `immobilisations` qui pose l'écriture de cession ne contient pas
 *    une occurrence de « TVA ». Ce hors-scope était tu : il ne citait que les
 *    art. 46 et 49, ce qui laissait croire que 50 et 51 étaient couverts ;
 *  · la récupération de la taxe sur ventes annulées, résiliées ou impayées
 *    (art. 52).
 */
@Injectable()
export class TauxTvaService {
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
  async seedTauxDefaut(tenantId: string, referentiel: Referentiel, client: Prisma.TransactionClient = this.prisma) {
    for (const t of tauxTvaDefaut(referentiel)) {
      const compteCollecte = t.numeroCompteCollecte
        ? await client.compte.findUnique({ where: { tenantId_numero: { tenantId, numero: t.numeroCompteCollecte } } })
        : null;
      const compteDeductible = t.numeroCompteDeductible
        ? await client.compte.findUnique({ where: { tenantId_numero: { tenantId, numero: t.numeroCompteDeductible } } })
        : null;
      await client.tauxTva.upsert({
        where: { tenantId_code: { tenantId, code: t.code } },
        update: {},
        create: {
          tenantId,
          code: t.code,
          intitule: t.intitule,
          taux: t.taux,
          compteCollecteId: compteCollecte?.id,
          compteDeductibleId: compteDeductible?.id,
        },
      });
    }
  }

  async lister(tenantId: string, actifsSeuls?: boolean) {
    return this.prisma.tauxTva.findMany({
      where: { tenantId, ...(actifsSeuls ? { estActif: true } : {}) },
      include: { compteCollecte: true, compteDeductible: true },
      orderBy: { taux: 'desc' },
    });
  }

  private async trouver(tenantId: string, id: string) {
    const taux = await this.prisma.tauxTva.findFirst({ where: { id, tenantId } });
    if (!taux) {
      throw new NotFoundException('Taux de TVA introuvable pour ce tenant');
    }
    return taux;
  }

  private async verifierComptes(tenantId: string, dto: { compteCollecteId?: string | null; compteDeductibleId?: string | null }) {
    for (const compteId of [dto.compteCollecteId, dto.compteDeductibleId]) {
      if (!compteId) continue;
      const compte = await this.prisma.compte.findFirst({ where: { id: compteId, tenantId } });
      if (!compte) {
        throw new NotFoundException('Compte introuvable pour ce tenant');
      }
    }
  }

  async creer(tenantId: string, dto: CreerTauxTvaDto) {
    const existant = await this.prisma.tauxTva.findUnique({ where: { tenantId_code: { tenantId, code: dto.code } } });
    if (existant) {
      throw new ConflictException(`Le taux de TVA ${dto.code} existe déjà pour ce tenant`);
    }
    await this.verifierComptes(tenantId, dto);
    return this.prisma.tauxTva.create({ data: { ...dto, tenantId } });
  }

  async modifier(tenantId: string, id: string, dto: ModifierTauxTvaDto) {
    await this.trouver(tenantId, id);
    await this.verifierComptes(tenantId, dto);
    return this.prisma.tauxTva.update({ where: { id }, data: dto });
  }

  /** Arrondi au centime · une seule forme, pour que les totaux se recoupent. */
  private static c(n: number) {
    return Math.round(n * 100) / 100;
  }

  /**
   * Les racines de classe 7 que l'art. 43 retire du dénominateur, pour le
   * référentiel de ce dossier · voir le commentaire des deux constantes.
   */
  private racinesHorsDenominateur(referentiel: Referentiel | undefined) {
    return referentiel === Referentiel.SYSCOHADA
      ? [...RACINES_HORS_DENOMINATEUR_COMMUNES, ...RACINES_HORS_DENOMINATEUR_SYSCOHADA]
      : [...RACINES_HORS_DENOMINATEUR_COMMUNES];
  }

  /**
   * Prorata de déduction (art. 43 O.-L.) : rapport entre les recettes
   * ouvrant droit à déduction (opérations taxables · toute écriture portant
   * au moins une ligne de TVA, y compris au taux zéro export, qui ouvre
   * droit comme les autres) et les recettes totales (comptes de produits,
   * classe 7) sur la période, arrondi à l'**unité supérieure** (règle
   * explicite du texte, pas un arrondi mathématique standard).
   *
   * LE DÉNOMINATEUR N'EST PLUS « TOUTE LA CLASSE 7 ». L'art. 43 en retire
   * nommément quatre postes, et le commentaire qui tenait ici affirmait
   * qu'aucun d'eux n'atteignait la classe 7 « dans notre plan de comptes » ·
   * le semis le démentait sur trois d'entre eux, et le module immobilisations
   * alimente réellement le quatrième. Chaque poste laissé au dénominateur
   * abaisse le prorata et fait perdre de la déduction au contribuable. Les
   * racines retranchées, et la raison de chacune, sont documentées sur
   * `RACINES_HORS_DENOMINATEUR_COMMUNES` / `_SYSCOHADA`.
   *
   * Fidélité assumée à notre modèle de données : le numérateur légal inclut
   * aussi les recettes aux missions diplomatiques/organisations
   * internationales (pas de compte dédié ici, donc non comptées à part ·
   * l'écart ne joue que pour ce cas de figure précis) ; les DÉBOURS, que
   * l'art. 43 exclut lui aussi, n'ont de compte dédié dans aucun des deux
   * plans et restent donc au dénominateur · `mention` le dit, plutôt que de
   * le taire. S'applique globalement à toute la déduction (biens, services,
   * immobilisations) en l'absence d'option secteurs distincts (art. 49, non
   * implémentée · la seule option ici est le prorata général).
   */
  async calculerProrata(tenantId: string, dateDebut: Date, dateFin: Date) {
    /*
      NUMÉRATEUR · la base hors taxes des opérations ouvrant droit à déduction.

      Elle se DÉDUIT du montant de taxe et du taux (base = TVA / taux), ce qui
      est exact ligne à ligne. La version antérieure sommait tout le crédit de
      classe 7 de chaque écriture portant une ligne de TVA : une écriture
      mixte, qui loge sur la même pièce une vente taxable et une recette
      exonérée, gonflait alors le numérateur de la part exonérée, et donc le
      pourcentage de déduction.

      Le taux ZÉRO (exportations) fait exception : la division est impossible,
      alors que ces opérations ouvrent bien droit à déduction. Leur base est
      reprise du crédit de classe 7 de leur écriture · c'est l'approximation
      d'origine, mais confinée au seul cas où elle est inévitable.
    */
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { referentiel: true },
    });
    const racinesExclues = this.racinesHorsDenominateur(tenant?.referentiel);
    const filtreExclusions = racinesExclues.map((r) => ({ numero: { startsWith: r } }));

    /*
      Le numérateur ne se lit que sur la TVA COLLECTÉE (443). Une ligne de 445
      n'est jamais une recette, et un avoir fournisseur, qui crédite le 445,
      s'y ajoutait auparavant comme s'il en était une.

      Et les livraisons/prestations à SOI-MÊME en sortent : l'art. 43,
      l. 1129-1130, les exclut « des deux termes du rapport ». Le SYSCOHADA les
      isole au 4434 · c'est le seul plan où elles sont repérables, et le seul
      où on les retranche.
    */
    const lignesTaxe = await this.prisma.ligneEcriture.findMany({
      where: {
        tauxTvaId: { not: null },
        compte: { numero: { startsWith: RACINE_COLLECTEE } },
        ecriture: { tenantId, date: { gte: dateDebut, lte: dateFin } },
      },
      select: {
        credit: true,
        ecritureId: true,
        compte: { select: { numero: true } },
        tauxTva: { select: { taux: true } },
      },
    });

    let numerateur = 0;
    const ecrituresTauxZero = new Set<string>();
    for (const l of lignesTaxe) {
      if (this.estLivraisonASoiMeme(tenant?.referentiel, l.compte.numero)) continue;
      const taux = Number(l.tauxTva?.taux ?? 0);
      if (taux <= EPSILON) {
        ecrituresTauxZero.add(l.ecritureId);
        continue;
      }
      numerateur += Number(l.credit) / (taux / 100);
    }
    if (ecrituresTauxZero.size > 0) {
      const agg = await this.prisma.ligneEcriture.aggregate({
        where: {
          compte: {
            tenantId,
            classe: ClasseCompte.CLASSE_7,
            ...(filtreExclusions.length > 0 ? { NOT: filtreExclusions } : {}),
          },
          ecritureId: { in: [...ecrituresTauxZero] },
        },
        _sum: { credit: true },
      });
      numerateur += Number(agg._sum.credit ?? 0);
    }

    // Deux agrégats plutôt qu'un filtre négatif unique : le montant retranché
    // est RENDU (`recettesExclues`), et un prorata dont on ne voit pas ce qui
    // a été retiré du dénominateur ne se vérifie pas.
    const [recettesAgg, exclusAgg] = await Promise.all([
      this.prisma.ligneEcriture.aggregate({
        where: {
          compte: { tenantId, classe: ClasseCompte.CLASSE_7 },
          ecriture: { tenantId, date: { gte: dateDebut, lte: dateFin } },
        },
        _sum: { credit: true },
      }),
      filtreExclusions.length === 0
        ? Promise.resolve({ _sum: { credit: 0 } })
        : this.prisma.ligneEcriture.aggregate({
            where: {
              compte: { tenantId, classe: ClasseCompte.CLASSE_7, OR: filtreExclusions },
              ecriture: { tenantId, date: { gte: dateDebut, lte: dateFin } },
            },
            _sum: { credit: true },
          }),
    ]);

    numerateur = TauxTvaService.c(numerateur);
    const recettesClasse7 = Number(recettesAgg._sum.credit ?? 0);
    const recettesExclues = Number(exclusAgg._sum.credit ?? 0);
    const denominateur = TauxTvaService.c(recettesClasse7 - recettesExclues);
    /*
      Aucune recette sur la période : rien ne vient limiter la déduction ·
      100 % plutôt qu'une division par zéro.

      L'arrondi est « à l'unité supérieure » (art. 43, l. 1131-1132), pas un
      arrondi mathématique. Deux précautions, et la seconde n'est pas
      cosmétique : le rapport est multiplié AVANT la division, et ramené au
      millionième avant d'être plafonné. Sans cela, un prorata exact de 55 %
      ressort en virgule flottante à 55,00000000000001 et l'unité supérieure
      le porte à 56 % · un point de prorata qui n'existe pas, et une déduction
      supérieure à ce que la loi admet.
    */
    const pourcentage =
      denominateur <= EPSILON
        ? 100
        : Math.min(100, Math.ceil(Math.round(((numerateur * 100) / denominateur) * 1e6) / 1e6));

    return {
      numerateur,
      denominateur,
      pourcentage,
      recettesClasse7,
      recettesExclues,
      racinesExclues,
      mentionDenominateur:
        `Dénominateur : recettes de classe 7 (${recettesClasse7.toLocaleString('fr-FR')}) moins ` +
        `${recettesExclues.toLocaleString('fr-FR')} de recettes que l'article 43 en exclut (comptes ` +
        `${racinesExclues.join(', ')} · cessions d'actif immobilisé, subventions d'équipement, indemnités ` +
        "d'assurance, livraisons à soi-même). Les DÉBOURS, exclus eux aussi par l'article 43, n'ont de compte " +
        'dédié dans aucun des deux plans · s\'il y en a, les retrancher à la main.',
    };
  }

  /**
   * Livraison ou prestation à soi-même · exclue des DEUX termes du prorata
   * (art. 43, l. 1129-1130). Seul le SYSCOHADA l'isole, au 4434 « TVA
   * facturée sur production livrée à soi-même » ; le SYCEBNL ne subdivise pas
   * son 443 et ne permet pas de la repérer.
   */
  private estLivraisonASoiMeme(referentiel: Referentiel | undefined, numeroCompte: string) {
    return referentiel === Referentiel.SYSCOHADA && numeroCompte.startsWith('4434');
  }

  /**
   * PRORATA APPLICABLE À UNE DÉCLARATION · l'article 45 en commande le rythme,
   * et c'est là que le logiciel se trompait.
   *
   * Le texte impose un prorata PROVISOIRE, calculé sur les recettes de
   * l'ANNÉE PRÉCÉDENTE, appliqué à toutes les déclarations de l'année en
   * cours ; puis un prorata DÉFINITIF, arrêté au plus tard le 31 mars de
   * l'année suivante, qui donne lieu à régularisation des déductions déjà
   * opérées.
   *
   * La déclaration appliquait jusqu'ici un prorata recalculé SUR SA PROPRE
   * PÉRIODE : chaque mois portait donc un pourcentage différent, alors que la
   * loi en veut un seul pour toute l'année. Un dossier saisonnier (une
   * association qui vend à Noël et rien en février) voyait sa déduction varier
   * du simple au double d'un mois à l'autre.
   *
   * PREMIÈRE ANNÉE D'ACTIVITÉ · il n'existe aucune recette de référence. Le
   * prorata est alors estimé sur la période en cours, et l'estimation est
   * ANNONCÉE (`base`), pas dissimulée derrière un chiffre d'allure définitive.
   */
  async prorataApplicable(tenantId: string, dateDebut: Date, dateFin: Date) {
    const anneePrecedente = dateDebut.getUTCFullYear() - 1;
    const provisoire = await this.calculerProrata(
      tenantId,
      new Date(Date.UTC(anneePrecedente, 0, 1)),
      new Date(Date.UTC(anneePrecedente, 11, 31, 23, 59, 59, 999)),
    );
    if (provisoire.denominateur > EPSILON) {
      return {
        ...provisoire,
        base: 'ANNEE_PRECEDENTE' as const,
        anneeReference: anneePrecedente,
        mention:
          `Prorata provisoire de ${provisoire.pourcentage} %, calculé sur les recettes de ${anneePrecedente} ` +
          "(article 45). Il s'applique à toutes les déclarations de l'année, et sera arrêté définitivement au plus " +
          'tard le 31 mars suivant, avec régularisation des déductions déjà opérées.',
      };
    }
    const estime = await this.calculerProrata(tenantId, dateDebut, dateFin);
    return {
      ...estime,
      base: 'ESTIMATION_PERIODE' as const,
      anneeReference: null,
      mention:
        `Aucune recette n'a été enregistrée en ${anneePrecedente} : le prorata provisoire ne peut pas être calculé ` +
        `sur l'année précédente comme le veut l'article 45. Celui appliqué ici (${estime.pourcentage} %) est une ` +
        'ESTIMATION sur la période déclarée, à régulariser lors de l’arrêté définitif du 31 mars.',
    };
  }

  /**
   * PRORATA DÉFINITIF d'une année civile, et régularisation qui en découle.
   *
   * À arrêter au plus tard le 31 mars de l'année suivante (art. 45, l. 1150-1151
   * du fichier `10-tva-ol10-001-loi-base-ch1-10.md`) : « Le prorata définitif
   * est arrêté au plus tard le 31 mars de l'année suivante. LES DÉDUCTIONS
   * OPÉRÉES sont régularisées en conséquence à l'échéance qui suit. » Le décret
   * n° 011/42, art. 128, en donne le sens : « Prorata définitif > prorata
   * provisoire : déduction complémentaire égale à la différence. Prorata
   * définitif < prorata provisoire : reversement de la différence. »
   *
   * CE SONT LES DÉDUCTIONS OPÉRÉES, PAS UN PROVISOIRE RECONSTRUIT. Le calcul
   * recalculait un prorata sur l'année N−1 et s'en servait comme du taux
   * « appliqué », alors que le taux réellement appliqué est STOCKÉ, liquidation
   * par liquidation (`LiquidationTva.prorataApplique`, posé par
   * `comptabiliserLiquidation`). Deux conséquences, toutes deux au détriment de
   * la vérité du chiffre :
   *
   *  · quand N−1 était vide, le provisoire « appliqué » devenait le définitif
   *    lui-même et la régularisation sortait NULLE PAR CONSTRUCTION · or c'est
   *    exactement la situation du nouvel assujetti, celui-là même qui a déclaré
   *    toute l'année sur des estimations mensuelles variables
   *    (`prorataApplicable`, base ESTIMATION_PERIODE) ;
   *  · un dossier dont le provisoire a changé en cours d'année voyait tout son
   *    exercice régularisé au dernier taux venu.
   *
   * L'ASSIETTE, ELLE AUSSI, ÉTAIT FAUSSE : la TVA déductible brute sommait les
   * seuls DÉBITS des comptes 445x, si bien qu'un avoir fournisseur, qui les
   * crédite, restait compté comme de la taxe déduite. Elle se lit désormais en
   * solde (débits − crédits).
   *
   * CE QUI N'EST PAS RÉGULARISÉ EST DIT. La régularisation ne porte que sur les
   * périodes effectivement liquidées : une période déclarée mais jamais
   * comptabilisée ne laisse aucune trace de ce qui a été déduit, et le logiciel
   * ne l'invente pas · il en rend le montant à part (`tvaDeductibleNonLiquidee`)
   * et le nomme dans `echeance`, qui est le seul texte libre que l'écran rende.
   */
  async prorataDefinitif(tenantId: string, annee: number) {
    const debutAnnee = new Date(Date.UTC(annee, 0, 1));
    const finAnnee = new Date(Date.UTC(annee, 11, 31, 23, 59, 59, 999));

    const definitif = await this.calculerProrata(tenantId, debutAnnee, finAnnee);
    const brutAnnee = await this.tvaDeductibleBrute(tenantId, debutAnnee, finAnnee);

    // Les liquidations de l'année, dans l'ordre · chacune porte le pourcentage
    // qui a RÉELLEMENT servi à limiter la déduction de sa période.
    const liquidations = await this.prisma.liquidationTva.findMany({
      where: { tenantId, dateDebut: { gte: debutAnnee }, dateFin: { lte: finAnnee } },
      orderBy: { dateDebut: 'asc' },
    });

    const periodes: Array<{
      dateDebut: string;
      dateFin: string;
      pourcentageApplique: number;
      tvaDeductibleBrute: number;
      deduite: number;
    }> = [];
    let brutCouvert = 0;
    let admiseAppliquee = 0;
    for (const l of liquidations) {
      const brut = await this.tvaDeductibleBrute(tenantId, l.dateDebut, l.dateFin);
      const pourcentage = Number(l.prorataApplique);
      const deduite = TauxTvaService.c(brut * (pourcentage / 100));
      brutCouvert = TauxTvaService.c(brutCouvert + brut);
      admiseAppliquee = TauxTvaService.c(admiseAppliquee + deduite);
      periodes.push({
        dateDebut: l.dateDebut.toISOString().slice(0, 10),
        dateFin: l.dateFin.toISOString().slice(0, 10),
        pourcentageApplique: pourcentage,
        tvaDeductibleBrute: brut,
        deduite,
      });
    }

    const admiseDefinitive = TauxTvaService.c(brutCouvert * (definitif.pourcentage / 100));
    const regularisation = TauxTvaService.c(admiseDefinitive - admiseAppliquee);
    // Le taux « appliqué » d'une année à plusieurs liquidations n'est pas un
    // scalaire : on rend la moyenne PONDÉRÉE par l'assiette de chaque période,
    // et le détail période par période à côté. Sans liquidation, il n'y a pas
    // de taux appliqué du tout · 0 plutôt qu'un chiffre d'allure normale.
    const pourcentageApplique =
      brutCouvert > EPSILON ? TauxTvaService.c((admiseAppliquee / brutCouvert) * 100) : 0;
    const tvaDeductibleNonLiquidee = TauxTvaService.c(brutAnnee - brutCouvert);

    const echeance =
      liquidations.length === 0
        ? `Aucune liquidation de TVA n'est comptabilisée pour ${annee} : aucune déduction opérée n'est tracée, ` +
          `et la régularisation de l'article 45 ne peut donc pas être chiffrée. Le prorata définitif ` +
          `${annee} ressort à ${definitif.pourcentage} % ; la TVA déductible brute de l'année est de ` +
          `${brutAnnee.toLocaleString('fr-FR')} CDF. À arrêter au plus tard le 31 mars ${annee + 1} (article 45).`
        : `À arrêter au plus tard le 31 mars ${annee + 1} (article 45). Régularisation calculée sur les ` +
          `${liquidations.length} période(s) réellement liquidée(s) et sur le prorata effectivement appliqué à ` +
          `chacune` +
          (tvaDeductibleNonLiquidee > EPSILON
            ? `. ${tvaDeductibleNonLiquidee.toLocaleString('fr-FR')} CDF de TVA déductible de ${annee} ne sont ` +
              "couverts par aucune liquidation : aucune déduction n'y a été opérée, ils ne sont donc pas " +
              'régularisés ici.'
            : '.');

    return {
      annee,
      definitif,
      pourcentageApplique,
      /** Assiette de la régularisation · la seule sur laquelle on a déduit. */
      tvaDeductibleBrute: brutCouvert,
      /** Toute la TVA d'amont de l'année, liquidée ou non, en solde. */
      tvaDeductibleBruteAnnee: brutAnnee,
      tvaDeductibleNonLiquidee,
      periodes,
      admiseDefinitive,
      admiseAppliquee,
      regularisation,
      sens:
        Math.abs(regularisation) <= EPSILON
          ? ('AUCUNE' as const)
          : regularisation > 0
            ? ('DEDUCTION_COMPLEMENTAIRE' as const)
            : ('REVERSEMENT' as const),
      echeance,
    };
  }

  /**
   * TVA d'amont d'une période, lue par FAMILLE (445x) et non sur le compte
   * porté par chaque taux · même raison que pour la déclaration, voir
   * RACINE_RECUPERABLE.
   *
   * EN SOLDE, débits moins crédits. La somme des seuls débits comptait un
   * avoir fournisseur, qui crédite le 445 et ANNULE une déduction, comme de
   * la taxe déduite de plus.
   */
  private async tvaDeductibleBrute(tenantId: string, dateDebut: Date, dateFin: Date) {
    const comptes = (
      await this.prisma.compte.findMany({
        where: { tenantId, numero: { startsWith: RACINE_RECUPERABLE } },
        select: { id: true },
      })
    ).map((c) => c.id);
    if (comptes.length === 0) return 0;
    const agg = await this.prisma.ligneEcriture.aggregate({
      where: {
        compteId: { in: comptes },
        ecriture: { tenantId, date: { gte: dateDebut, lte: dateFin } },
      },
      _sum: { debit: true, credit: true },
    });
    return TauxTvaService.c(Number(agg._sum.debit ?? 0) - Number(agg._sum.credit ?? 0));
  }

  /**
   * EXIGIBILITÉ · à quelle date une ligne de TVA entre dans une déclaration.
   *
   * Ce n'est pas toujours la date de l'écriture. L'ordonnance-loi n° 10/001
   * distingue le FAIT GÉNÉRATEUR (art. 24, l'événement qui fait naître la
   * créance fiscale) de l'EXIGIBILITÉ (art. 25, le moment où l'administration
   * peut en réclamer le paiement) ; c'est la seconde qui commande la période
   * de déclaration. Pour les prestations de services et les travaux
   * immobiliers, l'art. 25, 2° la place « au moment de l'encaissement du prix,
   * des acomptes ou avances » : une facture de mars réglée en juin se déclare
   * en JUIN.
   *
   * Comment le logiciel date l'encaissement · par le LETTRAGE. Une facture de
   * vente porte, dans la même écriture, la créance sur le client (classe 4) et
   * la TVA collectée. Quand la créance est lettrée avec son règlement, le
   * groupe de lettrage passe SOLDE et porte la date du dénouement
   * (`soldeAt`) : c'est cette date que la TVA suit. Un règlement partiel
   * rend la taxe exigible À PROPORTION du montant encaissé, et le groupe
   * partiel donne cette proportion.
   *
   * Ce que le logiciel ne fait PAS, et le dit : il ne devine pas quelle ligne
   * du groupe a réglé quelle facture quand plusieurs factures y sont réunies.
   * Il applique alors au groupe entier la proportion réglée du groupe. C'est
   * l'imputation la plus neutre ; l'imputation « plus ancienne d'abord » du
   * fisc donnerait, sur un groupe multi-factures, un fractionnement différent.
   */
  private exigibilite(
    ligne: { debit: unknown; credit: unknown },
    lignesTiers: Array<{
      debit: unknown;
      credit: unknown;
      lettrage: { statut: string; solde: unknown; soldeAt: Date | null } | null;
    }>,
    dateEcriture: Date,
  ): { date: Date | null; fraction: number } {
    // Aucune contrepartie de tiers lettrable : rien ne dit quand l'argent est
    // entré. On s'en tient à la date de l'écriture · c'est le cas d'une vente
    // au comptant, où encaissement et écriture coïncident de toute façon.
    const avecLettrage = lignesTiers.filter((l) => l.lettrage);
    if (avecLettrage.length === 0) return { date: dateEcriture, fraction: 1 };

    const groupe = avecLettrage[0].lettrage!;
    if (groupe.statut === 'SOLDE') {
      // Dénoué : exigible en totalité, à la date du dénouement. `soldeAt` peut
      // manquer sur un lettrage ancien · la date d'écriture sert alors de
      // repli, faute de mieux, plutôt que d'exclure la ligne de toute
      // déclaration (une TVA jamais déclarée est pire qu'une TVA mal datée).
      return { date: groupe.soldeAt ?? dateEcriture, fraction: 1 };
    }
    // Groupe PARTIEL · une part est encaissée. `solde` est le reste à solder,
    // signé ; la part réglée est donc (engagé - |reste|) / engagé.
    const engage = avecLettrage.reduce((t, l) => t + Math.abs(Number(l.debit) - Number(l.credit)), 0);
    const reste = Math.abs(Number(groupe.solde));
    if (engage <= EPSILON) return { date: null, fraction: 0 };
    const fraction = Math.min(1, Math.max(0, (engage - reste) / engage));
    if (fraction <= EPSILON) return { date: null, fraction: 0 };
    // Un groupe partiel n'a pas de date de dénouement : la part encaissée l'a
    // été à une date qu'on ne sait pas isoler ligne à ligne. On la rattache à
    // la date d'écriture du règlement le plus récent du groupe · à défaut,
    // à celle de la facture.
    return { date: groupe.soldeAt ?? dateEcriture, fraction };
  }

  /**
   * NATURE de l'opération portée par une ligne de TVA · voir le commentaire
   * de `NATURE_COLLECTEE_SYSCOHADA`. INDETERMINEE n'est pas un échec : c'est
   * le seul aveu honnête quand le plan ne subdivise pas.
   */
  private natureOperation(
    referentiel: Referentiel | undefined,
    numeroCompte: string,
    estCollecte: boolean,
  ): NatureOperationTva {
    // Le plan SYCEBNL ne subdivise ni 443 ni 445 · ses 44310000 et 44510000
    // sont GÉNÉRIQUES, et portent le même numéro que des subdivisions
    // SYSCOHADA qui, elles, ont un sens. Les classer sur le numéro seul
    // ferait passer toute la TVA d'un dossier SYCEBNL pour de la vente de
    // biens. Même garde que `client/src/lib/tva-syscohada.ts`.
    if (referentiel !== Referentiel.SYSCOHADA) return 'INDETERMINEE';
    const table = estCollecte ? NATURE_COLLECTEE_SYSCOHADA : NATURE_RECUPERABLE_SYSCOHADA;
    for (const [racine, nature] of table) {
      if (numeroCompte.startsWith(racine)) return nature;
    }
    return 'INDETERMINEE';
  }

  /**
   * SUR QUOI SE DATE UNE LIGNE · fait générateur (date de l'écriture) ou
   * encaissement (date du lettrage de la contrepartie de tiers).
   *
   * COLLECTE · art. 25. Les biens au fait générateur (1°), les services et
   * travaux à l'encaissement (2°). Le paramètre du dossier ne peut plus
   * différer la TVA d'une vente de marchandises : l'art. 25, 1° ne connaît
   * aucune option, et le régime des DÉBITS lui-même n'est ouvert qu'« aux
   * entrepreneurs de travaux publics et de travaux immobiliers ainsi qu'aux
   * prestataires de services » (art. 26, l. 648-650). C'est donc SEULEMENT sur
   * les services et travaux que l'autorisation de l'art. 26 déplace la date,
   * de l'encaissement vers l'inscription au débit du compte du client · c'est
   *-à-dire la date de la facture, donc de l'écriture.
   *
   * DÉDUCTION · art. 37 al. 1 : « Le droit à déduction prend naissance lorsque
   * la taxe devient exigible chez l'assujetti » (l. 987-988), et le décret
   * n° 011/42, art. 96, lève l'ambiguïté du mot : « L'assujetti visé s'entend
   * du FOURNISSEUR/PRESTATAIRE. » C'est donc la situation du fournisseur qui
   * commande, jamais le régime de vente de l'acheteur · le code appliquait
   * exactement l'inverse, et différait au lettrage la déduction d'un achat de
   * marchandises dès que le dossier était paramétré aux encaissements.
   *
   * CE QUE LE LOGICIEL NE SAIT PAS, ET NE DEVINE PAS. Un fournisseur de
   * services peut être autorisé à acquitter d'après les débits (art. 26 ·
   * décret art. 58 à 61), auquel cas la taxe lui est exigible dès la facture
   * et la déduction naît plus tôt. Cette autorisation se lit sur la facture
   * du fournisseur, qui doit porter la mention « Autorisation d'acquitter la
   * TVA d'après les débits » (décret art. 60) · OmegaX n'enregistre pas cette
   * mention et ne connaît pas le régime de ses fournisseurs. Le droit commun
   * est donc appliqué et l'exception est ANNONCÉE avec son article, plutôt
   * que devinée. Différer une déduction ne fait courir aucun redressement, et
   * l'art. 37 al. 2 laisse jusqu'au 31 décembre de l'année suivante pour
   * l'exercer ; l'anticiper, si.
   */
  private baseExigibilite(
    referentiel: Referentiel | undefined,
    regime: string,
    numeroCompte: string,
    estCollecte: boolean,
  ): { base: 'FAIT_GENERATEUR' | 'ENCAISSEMENT'; nature: NatureOperationTva } {
    const nature = this.natureOperation(referentiel, numeroCompte, estCollecte);
    if (nature === 'BIENS') return { base: 'FAIT_GENERATEUR', nature };
    if (nature === 'SERVICES') {
      // L'art. 26 ne vise que la taxe que le redevable ACQUITTE · il ne dit
      // rien de celle qu'il déduit, dont la date se juge chez le fournisseur.
      if (estCollecte && regime === 'DEBITS') return { base: 'FAIT_GENERATEUR', nature };
      return { base: 'ENCAISSEMENT', nature };
    }
    // Nature indéterminée · le paramètre du dossier sert de repli DÉCLARÉ.
    return { base: regime === 'ENCAISSEMENTS' ? 'ENCAISSEMENT' : 'FAIT_GENERATEUR', nature };
  }

  /**
   * CRÉDIT DE TVA REPORTÉ SUR LA PÉRIODE · article 63.
   *
   * Fichier `code-general-2026/references/10-tva-ol10-001-loi-base-ch1-10.md`,
   * art. 63, l. 1499-1504 : « Lorsque le montant de la taxe sur la valeur
   * ajoutée déductible au titre d'un mois est supérieur à celui de la taxe
   * exigible, l'excédent constitue un crédit d'impôt IMPUTABLE SUR LA TAXE
   * EXIGIBLE DU OU DES MOIS SUIVANTS JUSQU'À L'ÉPUISEMENT. Le crédit d'impôt
   * ne peut pas faire l'objet d'un remboursement au profit de l'assujetti et
   * ne peut être cédé. » Article non modifié par la L.F. n° 25/060, qui ne
   * touche en TVA que les art. 10, 35, 42 point 4, 60, 62 et 74.
   *
   * Le report est donc LE RÉGIME DE DROIT COMMUN du crédit, et le second
   * alinéa ferme le remboursement · l'imputation n'est pas une facilité, c'est
   * la seule issue ordinaire. Le crédit était correctement CONSTATÉ (compte
   * 44490000 en SYSCOHADA, 44410000 en SYCEBNL qui ne subdivise pas) et jamais
   * IMPUTÉ : la déclaration suivante annonçait « À PAYER » le net de sa seule
   * période, et le dossier versait le crédit en trop.
   *
   * SOURCE DU CHIFFRE · la dernière liquidation comptabilisée avant la
   * période, dont le champ `net` porte, depuis cette correction, le net APRÈS
   * imputation. Le crédit se chaîne donc de liquidation en liquidation, et le
   * solde du compte 4449 suit, puisque l'écriture de liquidation le crédite à
   * hauteur de ce qu'elle impute.
   *
   * CE QUI N'EST PAS COUVERT, ET DIT : une période déclarée mais jamais
   * comptabilisée ne laisse aucune trace · son crédit n'est pas reporté, faute
   * d'une déclaration déposée que le logiciel puisse constater.
   */
  private async creditReportable(tenantId: string, dateDebut: Date) {
    const precedente = await this.prisma.liquidationTva.findFirst({
      where: { tenantId, dateFin: { lt: dateDebut } },
      orderBy: { dateFin: 'desc' },
      include: { ecriture: { select: { id: true, libelle: true } } },
    });
    if (!precedente) return { montant: 0, origine: null };
    const net = Number(precedente.net);
    if (net >= -EPSILON) return { montant: 0, origine: null };
    return {
      montant: TauxTvaService.c(-net),
      origine: {
        id: precedente.id,
        dateDebut: precedente.dateDebut.toISOString().slice(0, 10),
        dateFin: precedente.dateFin.toISOString().slice(0, 10),
        ecritureId: precedente.ecritureId,
      },
    };
  }

  /**
   * Registre/déclaration TVA sur une période : pour chaque taux, somme les
   * lignes créditées sur la famille 443 et les lignes débitées sur la famille
   * 445, taguées à ce taux (LigneEcriture.tauxTvaId · posé par la saisie
   * guidée "Achat/Vente avec TVA"). Chaque ligne est datée SELON LA NATURE DE
   * SON OPÉRATION (voir `baseExigibilite`), applique le prorata de déduction
   * (art. 43) à la TVA déductible brute, puis impute le crédit de TVA reporté
   * (art. 63). Reste lecture seule ici · voir `comptabiliserLiquidation` pour
   * poser l'écriture sur le compte 444.
   *
   * UN SEUL CHEMIN DE LECTURE, ligne à ligne. Il y en avait deux : une
   * agrégation en base pour les régimes datés à l'écriture, un parcours pour
   * le régime de l'encaissement. Deux chemins ne peuvent plus servir dès lors
   * que la MÊME déclaration porte des lignes datées différemment · c'est
   * précisément ce que l'art. 25 impose à un dossier mixte. La fenêtre de
   * lecture remonte donc toujours avant la période (une facture de l'an
   * dernier encaissée ce mois-ci est exigible ce mois-ci) : c'est le coût,
   * assumé, de dater juste, et c'est déjà celui que payaient les dossiers aux
   * encaissements.
   */
  async declaration(tenantId: string, dateDebut: Date, dateFin: Date) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const regime = tenant?.regimeExigibiliteTva ?? 'LIVRAISONS';
    const referentiel = tenant?.referentiel;
    const taux = await this.prisma.tauxTva.findMany({ where: { tenantId }, orderBy: { taux: 'desc' } });
    const dejaLiquidee = await this.liquidationChevauchante(tenantId, dateDebut, dateFin);

    const candidates =
      taux.length === 0
        ? []
        : await this.prisma.ligneEcriture.findMany({
            where: {
              tauxTvaId: { in: taux.map((t) => t.id) },
              compte: {
                OR: [{ numero: { startsWith: RACINE_COLLECTEE } }, { numero: { startsWith: RACINE_RECUPERABLE } }],
              },
              ecriture: { tenantId, date: { lte: dateFin } },
            },
            include: {
              compte: { select: { numero: true } },
              ecriture: {
                include: {
                  lignes: {
                    where: { compte: { classe: ClasseCompte.CLASSE_4 }, lettrageId: { not: null } },
                    include: { lettrage: true },
                  },
                },
              },
            },
          });

    type Cumul = { collecte: number; deductible: number; attente: number };
    const parTaux = new Map<string, Cumul>();
    for (const t of taux) parTaux.set(t.id, { collecte: 0, deductible: 0, attente: 0 });
    // Ce qui a été daté sur quelle base · sert à composer une mention qui dit
    // au lecteur d'où sort son chiffre, et à annoncer le repli quand il joue.
    let montantIndetermine = 0;
    let deductionServicesDiffere = 0;

    for (const l of candidates) {
      const cumul = l.tauxTvaId ? parTaux.get(l.tauxTvaId) : undefined;
      if (!cumul) continue;
      const estCollecte = l.compte.numero.startsWith(RACINE_COLLECTEE);
      const montant = estCollecte ? Number(l.credit) : Number(l.debit);
      if (montant <= EPSILON) continue;

      const { base, nature } = this.baseExigibilite(referentiel, regime, l.compte.numero, estCollecte);
      const dansLaPeriode = l.ecriture.date >= dateDebut && l.ecriture.date <= dateFin;
      if (nature === 'INDETERMINEE' && dansLaPeriode) montantIndetermine += montant;
      if (!estCollecte && nature === 'SERVICES' && dansLaPeriode) deductionServicesDiffere += montant;

      const { date, fraction } =
        base === 'FAIT_GENERATEUR'
          ? { date: l.ecriture.date as Date | null, fraction: 1 }
          : this.exigibilite(l, l.ecriture.lignes, l.ecriture.date);

      // Part facturée sur la période et pas encore exigible · c'est le chiffre
      // qui explique l'écart entre le chiffre d'affaires et la déclaration, et
      // sans lequel le régime paraît perdre de la TVA.
      if (estCollecte && base === 'ENCAISSEMENT' && dansLaPeriode) {
        cumul.attente = TauxTvaService.c(cumul.attente + montant * (1 - fraction));
      }
      if (!date || date < dateDebut || date > dateFin) continue;
      const exigible = TauxTvaService.c(montant * fraction);
      if (estCollecte) cumul.collecte = TauxTvaService.c(cumul.collecte + exigible);
      else cumul.deductible = TauxTvaService.c(cumul.deductible + exigible);
    }

    const lignes = [];
    let enAttente = 0;
    for (const t of taux) {
      const cumul = parTaux.get(t.id)!;
      enAttente = TauxTvaService.c(enAttente + cumul.attente);
      if (cumul.collecte === 0 && cumul.deductible === 0 && cumul.attente === 0) continue; // taux sans mouvement
      lignes.push({
        tauxId: t.id,
        code: t.code,
        intitule: t.intitule,
        taux: Number(t.taux),
        compteCollecteId: t.compteCollecteId,
        compteDeductibleId: t.compteDeductibleId,
        totalCollecte: cumul.collecte,
        totalDeductible: cumul.deductible,
        enAttente: cumul.attente,
        net: TauxTvaService.c(cumul.collecte - cumul.deductible),
      });
    }

    const totalCollecte = TauxTvaService.c(lignes.reduce((s, l) => s + l.totalCollecte, 0));
    const totalDeductible = TauxTvaService.c(lignes.reduce((s, l) => s + l.totalDeductible, 0));
    const prorata = await this.prorataApplicable(tenantId, dateDebut, dateFin);
    const totalDeductibleAdmise = TauxTvaService.c(totalDeductible * (prorata.pourcentage / 100));
    const netAvantImputation = TauxTvaService.c(totalCollecte - totalDeductibleAdmise);

    // ARTICLE 63 · le crédit du ou des mois précédents s'impute sur la taxe
    // exigible de celui-ci, jusqu'à épuisement. Un crédit non imputé reste
    // immobilisé au 4449 et le dossier verse deux fois.
    const credit = await this.creditReportable(tenantId, dateDebut);
    const creditImpute = TauxTvaService.c(Math.min(credit.montant, Math.max(0, netAvantImputation)));
    const net = TauxTvaService.c(netAvantImputation - credit.montant);

    return {
      dateDebut,
      dateFin,
      regimeExigibilite: regime,
      mentionExigibilite: this.mentionExigibilite(
        regime,
        referentiel,
        TauxTvaService.c(montantIndetermine),
        TauxTvaService.c(deductionServicesDiffere),
        credit.montant,
        creditImpute,
      ),
      // TVA facturée sur la période mais pas encore encaissée, donc pas encore
      // due. Zéro quand aucune ligne n'est datée à l'encaissement.
      tvaEnAttenteEncaissement: enAttente,
      lignes,
      prorata,
      totalCollecte,
      totalDeductible,
      totalDeductibleAdmise,
      /** Net de la seule période, avant report du crédit antérieur. */
      netAvantImputation,
      /** Crédit de TVA venu de la dernière liquidation (art. 63). */
      creditAnterieur: credit.montant,
      creditAnterieurOrigine: credit.origine,
      /** Part de ce crédit qui éteint la taxe de la période. */
      creditImpute,
      net,
      sens: net >= 0 ? ('A_PAYER' as const) : ('CREDIT' as const),
      // ÉTAT DE LIQUIDATION · rendu avec la déclaration pour que l'écran sache
      // avant de proposer le bouton. Un verrou qui ne se manifeste qu'au clic
      // fait travailler l'utilisateur pour rien, puis le contredit.
      liquidation: dejaLiquidee
        ? {
            faite: true as const,
            id: dejaLiquidee.id,
            dateDebut: dejaLiquidee.dateDebut.toISOString().slice(0, 10),
            dateFin: dejaLiquidee.dateFin.toISOString().slice(0, 10),
            ecritureId: dejaLiquidee.ecriture.id,
            libelleEcriture: dejaLiquidee.ecriture.libelle,
            // Une liquidation dont les bornes ne sont pas celles demandées
            // recouvre la période sans lui correspondre · le dire évite de
            // chercher une écriture au libellé attendu qui n'existe pas.
            memePeriode:
              dejaLiquidee.dateDebut.getTime() === dateDebut.getTime() &&
              dejaLiquidee.dateFin.getTime() === dateFin.getTime(),
          }
        : { faite: false as const },
    };
  }

  /**
   * La phrase qui accompagne la déclaration · elle porte la règle appliquée,
   * son article, et surtout CE QUI N'A PAS PU ÊTRE ÉTABLI.
   *
   * C'est le seul texte libre que la fenêtre rende (DeclarationTvaPage,
   * bloc EXIGIBILITÉ) : l'imputation du crédit de TVA y est donc annoncée
   * aussi, faute d'un autre endroit où l'écran la lirait.
   */
  private mentionExigibilite(
    regime: string,
    referentiel: Referentiel | undefined,
    montantIndetermine: number,
    deductionServicesDiffere: number,
    creditAnterieur: number,
    creditImpute: number,
  ) {
    const phrases: string[] = [
      "Exigibilité datée OPÉRATION PAR OPÉRATION (article 25 de l'ordonnance-loi n° 10/001) : les LIVRAISONS DE " +
        'BIENS au fait générateur (art. 25, 1°), les PRESTATIONS DE SERVICES et TRAVAUX IMMOBILIERS à ' +
        "l'encaissement du prix, des acomptes ou avances (art. 25, 2°). La nature est lue au compte de TVA " +
        '(4431/4434 ventes et livraisons à soi-même, 4432/4433 services et travaux ; 4452 achats, 4453/4454 ' +
        'transport et services extérieurs), tel que la saisie guidée l’impute.',
    ];
    if (regime === 'DEBITS') {
      phrases.push(
        "Ce dossier est autorisé à acquitter la taxe d'après les DÉBITS (art. 26, sur décision du Directeur " +
          "Général des Impôts) : sa TVA sur services et travaux est exigible à l'inscription au débit du compte " +
          'du client, donc à la date de la facture. Cette autorisation ne change rien aux ventes de biens, déjà ' +
          'exigibles au fait générateur, ni à la TVA déductible, qui se juge chez le fournisseur.',
      );
    }
    if (montantIndetermine > EPSILON) {
      phrases.push(
        `REPLI DÉCLARÉ sur ${montantIndetermine.toLocaleString('fr-FR')} CDF de la période : ` +
          (referentiel === Referentiel.SYSCOHADA
            ? 'ces lignes sont portées sur des comptes de TVA dont le numéro ne dit pas la nature de ' +
              "l'opération (4435 factures à établir, 4451 immobilisations, 4455 factures non parvenues…). "
            : 'le plan SYCEBNL ne subdivise ni le 443 ni le 445, aucune nature n’y est lisible. ') +
          `Elles sont datées selon le paramètre du dossier (${regime}), qui est un REPLI et non la règle · ` +
          'à vérifier opération par opération avant dépôt.',
      );
    }
    if (deductionServicesDiffere > EPSILON) {
      phrases.push(
        `DÉDUCTION SUR SERVICES · ${deductionServicesDiffere.toLocaleString('fr-FR')} CDF de TVA d'amont facturée ` +
          "sur la période sont déduits au PAIEMENT du fournisseur : l'article 37 al. 1 fait naître le droit à " +
          "déduction « lorsque la taxe devient exigible chez l'assujetti », et le décret n° 011/42, art. 96, " +
          'précise qu’il s’agit du FOURNISSEUR. Si l’un d’eux est autorisé à acquitter d’après les débits ' +
          '(art. 26 · sa facture porte alors la mention obligatoire du décret art. 60), sa taxe est exigible dès ' +
          'la facture et la déduction naît plus tôt : OmegaX n’enregistre pas cette mention et ne l’applique donc ' +
          'pas d’office.',
      );
    }
    if (creditAnterieur > EPSILON) {
      phrases.push(
        `CRÉDIT DE TVA REPORTÉ · ${creditAnterieur.toLocaleString('fr-FR')} CDF issus de la dernière liquidation ` +
          `sont imputés sur la taxe de cette période à hauteur de ${creditImpute.toLocaleString('fr-FR')} CDF ` +
          "(article 63 : l'excédent « constitue un crédit d'impôt imputable sur la taxe exigible du ou des mois " +
          'suivants jusqu’à l’épuisement »). Le solde éventuel reste reportable · l’article 63 ferme le ' +
          'remboursement, hors les cas de l’article 64.',
      );
    }
    return phrases.join(' ');
  }

  /**
   * Comptabilise la liquidation périodique : solde, par compte réellement
   * utilisé (en général 44310000/44510000 partagés voir le seed mais un
   * tenant peut avoir personnalisé des comptes différents par taux), la TVA
   * collectée et la TVA déductible ADMISE (après prorata), et porte la
   * différence sur le compte 44410000 (crédit = TVA due, débit = crédit de TVA
   * à reporter), APRÈS avoir éteint la part du crédit antérieur imputée sur la
   * période (art. 63). Pose une écriture NORMALE via EcritureService.creer ·
   * mêmes contrôles que n'importe quelle saisie (équilibre, exercice ouvert,
   * clôtures Partielle/Totale/Période).
   *
   * LE MARQUEUR STOCKE LE NET APRÈS IMPUTATION (`LiquidationTva.net`), et c'est
   * lui que la déclaration suivante relit pour connaître le crédit reportable.
   * Le chaînage est donc porté par la donnée elle-même : chaque liquidation
   * dit ce qui reste dû ou reste à reporter, sans que personne n'ait à
   * rejouer l'historique.
   *
   * VERROU ANTI-DOUBLE-LIQUIDATION. Il n'y en avait pas, et le code le disait
   * sans que personne n'agisse : reposter la même période créait une seconde
   * écriture identique. La première solde les comptes de taxe, la seconde les
   * rend débiteurs ou créditeurs du même montant en sens inverse, et le compte
   * 444 porte le double de la dette réelle. Rien ne le signalait · ni à
   * l'écran, ni au contrôle, ni dans la déclaration suivante, dont les comptes
   * de taxe repartent alors d'un solde faux.
   *
   * Ce qui est interdit est le CHEVAUCHEMENT, pas la répétition à l'identique.
   * Liquider janvier puis liquider le premier trimestre est le même double
   * comptage qu'une double liquidation de janvier, et un verrou qui ne
   * regarderait que l'égalité des bornes le laisserait passer.
   */
  async comptabiliserLiquidation(
    tenantId: string,
    userId: string,
    dto: { exerciceId: string; dateDebut: string; dateFin: string; date?: string },
  ) {
    const dateDebut = new Date(dto.dateDebut);
    const dateFin = new Date(dto.dateFin);

    const chevauchante = await this.liquidationChevauchante(tenantId, dateDebut, dateFin);
    if (chevauchante) {
      const jour = (d: Date) => d.toLocaleDateString('fr-FR');
      throw new BadRequestException(
        `Une liquidation couvre déjà tout ou partie de cette période (du ${jour(chevauchante.dateDebut)} au ` +
          `${jour(chevauchante.dateFin)}, écriture « ${chevauchante.ecriture.libelle} »). La comptabiliser une ` +
          'seconde fois porterait le double de la dette sur le compte 444. Supprimez la liquidation existante ' +
          'si elle est erronée, ou choisissez une période non encore liquidée.',
      );
    }

    const decl = await this.declaration(tenantId, dateDebut, dateFin);

    if (decl.totalCollecte <= EPSILON && decl.totalDeductibleAdmise <= EPSILON) {
      throw new BadRequestException('Aucun mouvement de TVA sur cette période · rien à comptabiliser.');
    }

    const ratio = decl.prorata.pourcentage / 100;
    const parCompteCollecte = new Map<string, number>();
    const parCompteDeductible = new Map<string, number>();
    for (const l of decl.lignes) {
      if (l.compteCollecteId && l.totalCollecte > 0) {
        parCompteCollecte.set(l.compteCollecteId, (parCompteCollecte.get(l.compteCollecteId) ?? 0) + l.totalCollecte);
      }
      if (l.compteDeductibleId && l.totalDeductible > 0) {
        const admise = Math.round(l.totalDeductible * ratio * 100) / 100;
        parCompteDeductible.set(l.compteDeductibleId, (parCompteDeductible.get(l.compteDeductibleId) ?? 0) + admise);
      }
    }

    // Le compte d'arrivée de la liquidation DÉPEND DU SENS du solde, et le
    // SYSCOHADA lui donne deux comptes là où le SYCEBNL n'en a qu'un.
    //
    // Plan SYSCOHADA, compte 44 : « 444 État, TVA due ou crédit de TVA » se
    // subdivise en « 4441 État, TVA due » et « 4449 État, crédit de TVA à
    // reporter ». Le semis SYSCOHADA pose les deux (44410000 et 44490000). Le
    // SYCEBNL, lui, ne subdivise pas son 444 et ne sème que 44410000, qui
    // porte alors les deux sens.
    //
    // Écrire un crédit de TVA au débit du 4441 « TVA due » est un contresens :
    // le compte finit débiteur alors que son intitulé annonce une dette, et le
    // poste de bilan qui le lit range une créance sur l'État parmi les dettes
    // fiscales. Rien ne le signale · l'écriture reste équilibrée.
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { referentiel: true },
    });
    const estSyscohada = tenant?.referentiel === Referentiel.SYSCOHADA;

    const chercherCompte = async (numero: string, intitule: string) => {
      const c = await this.prisma.compte.findFirst({ where: { tenantId, numero } });
      if (!c) {
        throw new BadRequestException(
          `Compte ${numero} (${intitule}) introuvable pour ce dossier · nécessaire pour comptabiliser la liquidation.`,
        );
      }
      return c;
    };

    const compteTvaDue = await chercherCompte(
      '44410000',
      estSyscohada ? 'État, TVA due' : 'État, TVA due ou crédit de TVA',
    );
    // En SYCEBNL le crédit de TVA retombe sur le même compte, faute d'un 4449
    // à son plan · ce n'est pas un pis-aller, c'est ce que son texte prévoit.
    const compteCreditTva = estSyscohada
      ? await chercherCompte('44490000', 'État, crédit de TVA à reporter')
      : compteTvaDue;

    const lignesEcriture: Array<{ compteId: string; debit?: number; credit?: number; libelle?: string }> = [];
    for (const [compteId, montant] of parCompteCollecte) {
      lignesEcriture.push({ compteId, debit: montant, credit: 0, libelle: 'Liquidation TVA · solde TVA collectée' });
    }
    for (const [compteId, montant] of parCompteDeductible) {
      lignesEcriture.push({ compteId, debit: 0, credit: montant, libelle: 'Liquidation TVA · solde TVA déductible admise' });
    }
    /*
      LE 444 REÇOIT LE NET DE LA PÉRIODE, ET L'IMPUTATION LE CRÉDITE À PART.

      Article 63 : le crédit du ou des mois précédents s'impute sur la taxe
      exigible de celui-ci. Comptablement, ce n'est pas le net APRÈS imputation
      qu'il faut porter au 444 · le crédit antérieur y est déjà inscrit au
      débit depuis la liquidation qui l'a constaté, et le réinscrire une
      seconde fois le compterait deux fois (l'écriture ne s'équilibrerait
      d'ailleurs plus). L'imputation est donc une ligne à part, au CRÉDIT du
      compte de crédit de TVA, qui éteint ce qui a servi ; ce qui reste y
      demeure et se reportera au mois suivant.

      Le solde du 4449 suit ainsi l'article : il vaut, à tout instant, le
      crédit encore imputable.
    */
    const netPeriode = decl.netAvantImputation;
    if (netPeriode > EPSILON) {
      if (decl.creditImpute > EPSILON) {
        lignesEcriture.push({
          compteId: compteCreditTva.id,
          debit: 0,
          credit: decl.creditImpute,
          libelle: 'Imputation du crédit de TVA reporté (art. 63)',
        });
      }
      const restantDu = TauxTvaService.c(netPeriode - decl.creditImpute);
      if (restantDu > EPSILON) {
        lignesEcriture.push({ compteId: compteTvaDue.id, debit: 0, credit: restantDu, libelle: 'TVA due' });
      }
    } else if (netPeriode < -EPSILON) {
      lignesEcriture.push({
        compteId: compteCreditTva.id,
        debit: -netPeriode,
        credit: 0,
        libelle: 'Crédit de TVA à reporter',
      });
    }

    if (lignesEcriture.length < 2) {
      throw new BadRequestException('Rien à comptabiliser sur cette période.');
    }

    const journal =
      (await this.prisma.journal.findFirst({ where: { tenantId, code: 'OD' } })) ??
      (await this.prisma.journal.findFirst({ where: { tenantId, type: TypeJournal.GENERAL } }));
    if (!journal) {
      throw new BadRequestException(
        "Aucun journal de type Général disponible pour enregistrer la liquidation TVA (journal 'OD' attendu).",
      );
    }

    const date = dto.date ? new Date(dto.date) : dateFin;
    const ecriture = await this.ecritureService.creer(tenantId, userId, {
      exerciceId: dto.exerciceId,
      journalId: journal.id,
      date: date.toISOString(),
      libelle: `Liquidation TVA · période du ${dto.dateDebut} au ${dto.dateFin}`,
      lignes: lignesEcriture,
    });

    // La trace est posée APRÈS l'écriture, et son échec la reprend · une
    // écriture de liquidation sans marqueur rouvrirait le trou qu'on vient de
    // fermer, en silence. `EcritureService.creer` ne participe pas à une
    // transaction (voir sa signature), d'où la compensation explicite.
    try {
      await this.prisma.liquidationTva.create({
        data: {
          tenantId,
          dateDebut,
          dateFin,
          ecritureId: ecriture.id,
          net: decl.net,
          prorataApplique: decl.prorata.pourcentage,
          createdBy: userId,
        },
      });
    } catch (e) {
      await this.prisma.ecriture.delete({ where: { id: ecriture.id } }).catch(() => undefined);
      throw e;
    }

    return { ecriture, declaration: decl };
  }

  /**
   * La liquidation qui recouvre tout ou partie d'une période, s'il y en a une.
   *
   * Deux intervalles se chevauchent quand chacun commence avant que l'autre ne
   * finisse · c'est le test complet, et il attrape les quatre cas (identique,
   * inclus, incluant, à cheval) là où une comparaison d'égalité n'en attrape
   * qu'un.
   */
  private async liquidationChevauchante(tenantId: string, dateDebut: Date, dateFin: Date) {
    return this.prisma.liquidationTva.findFirst({
      where: { tenantId, dateDebut: { lte: dateFin }, dateFin: { gte: dateDebut } },
      include: { ecriture: { select: { id: true, libelle: true, date: true } } },
      orderBy: { dateDebut: 'asc' },
    });
  }

  /** Les liquidations d'un dossier, la plus récente en tête. */
  async listerLiquidations(tenantId: string) {
    const liquidations = await this.prisma.liquidationTva.findMany({
      where: { tenantId },
      include: { ecriture: { select: { id: true, libelle: true, date: true, numeroPiece: true } } },
      orderBy: { dateDebut: 'desc' },
    });
    return liquidations.map((l) => ({
      id: l.id,
      dateDebut: l.dateDebut.toISOString().slice(0, 10),
      dateFin: l.dateFin.toISOString().slice(0, 10),
      net: Number(l.net),
      prorataApplique: Number(l.prorataApplique),
      ecriture: l.ecriture,
      createdAt: l.createdAt,
    }));
  }

  /**
   * ANNULE une liquidation : supprime le marqueur ET son écriture.
   *
   * Un verrou sans marche arrière transforme une erreur de date en impasse ·
   * l'utilisateur qui a liquidé « janvier » au lieu de « janvier à mars » ne
   * pourrait plus jamais liquider février ni mars. La suppression de
   * l'écriture passe par `EcritureService`, donc par ses contrôles : un
   * exercice clos ou une période verrouillée la refuse, comme pour n'importe
   * quelle écriture.
   */
  async annulerLiquidation(tenantId: string, id: string) {
    const liquidation = await this.prisma.liquidationTva.findFirst({ where: { id, tenantId } });
    if (!liquidation) {
      throw new BadRequestException('Liquidation introuvable pour ce dossier.');
    }
    // L'écriture d'abord · la contrainte ON DELETE CASCADE emporte le marqueur,
    // si bien qu'aucun état intermédiaire ne laisse un marqueur orphelin
    // interdisant une période dont l'écriture n'existe plus.
    await this.ecritureService.supprimer(tenantId, liquidation.ecritureId);
    return { supprime: true, ecritureId: liquidation.ecritureId };
  }
}
