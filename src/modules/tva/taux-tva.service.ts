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
 * TVA (cf. docs/plan-de-construction.md §3.1/§5) : entité "Taux" paramétrable,
 * fondée sur l'O.-L. n° 10/001 du 20/08/2010 modifiée par la LF 2026 (skill
 * `fiscalite-rdc/tva`). Couvre désormais, en plus du référentiel (taux +
 * comptes 443/445 rattachés) : le prorata de déduction (art. 43-49) et la
 * comptabilisation de la liquidation périodique (solde 443/445 sur le
 * compte 444). Reste hors scope : l'option pour secteurs distincts
 * d'activité (art. 49) et la régularisation pluriannuelle du prorata sur les
 * immobilisations (art. 46, variation > 10 % sur 4/19 ans).
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

  /**
   * Prorata de déduction (art. 43 O.-L.) : rapport entre les recettes
   * ouvrant droit à déduction (opérations taxables · toute écriture portant
   * au moins une ligne de TVA, y compris au taux zéro export, qui ouvre
   * droit comme les autres) et les recettes totales (comptes de produits,
   * classe 7) sur la période, arrondi à l'**unité supérieure** (règle
   * explicite du texte, pas un arrondi mathématique standard).
   *
   * Fidélité assumée à notre modèle de données : le numérateur légal inclut
   * aussi les recettes aux missions diplomatiques/organisations
   * internationales (pas de compte dédié ici, donc non comptées à part ·
   * l'écart ne joue que pour ce cas de figure précis) ; le dénominateur
   * légal exclut cessions d'actif immobilisé, subventions d'équipement et
   * indemnités d'assurance hors champ, qui ne sont de toute façon jamais
   * portées en classe 7 dans notre plan de comptes, donc déjà exclues
   * naturellement. S'applique globalement à toute la déduction (biens,
   * services, immobilisations) en l'absence d'option secteurs distincts
   * (art. 49, non implémentée · la seule option ici est le prorata général).
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
    const lignesTaxe = await this.prisma.ligneEcriture.findMany({
      where: { tauxTvaId: { not: null }, ecriture: { tenantId, date: { gte: dateDebut, lte: dateFin } } },
      select: { credit: true, ecritureId: true, tauxTva: { select: { taux: true } } },
    });

    let numerateur = 0;
    const ecrituresTauxZero = new Set<string>();
    for (const l of lignesTaxe) {
      const taux = Number(l.tauxTva?.taux ?? 0);
      if (taux <= EPSILON) {
        ecrituresTauxZero.add(l.ecritureId);
        continue;
      }
      numerateur += Number(l.credit) / (taux / 100);
    }
    if (ecrituresTauxZero.size > 0) {
      const agg = await this.prisma.ligneEcriture.aggregate({
        where: { compte: { tenantId, classe: ClasseCompte.CLASSE_7 }, ecritureId: { in: [...ecrituresTauxZero] } },
        _sum: { credit: true },
      });
      numerateur += Number(agg._sum.credit ?? 0);
    }

    const denominateurAgg = await this.prisma.ligneEcriture.aggregate({
      where: { compte: { tenantId, classe: ClasseCompte.CLASSE_7 }, ecriture: { tenantId, date: { gte: dateDebut, lte: dateFin } } },
      _sum: { credit: true },
    });

    numerateur = Math.round(numerateur * 100) / 100;
    const denominateur = Number(denominateurAgg._sum.credit ?? 0);
    // Aucune recette sur la période : rien ne vient limiter la déduction ·
    // 100 % plutôt qu'une division par zéro.
    const pourcentage = denominateur <= EPSILON ? 100 : Math.min(100, Math.ceil((numerateur / denominateur) * 100));

    return { numerateur, denominateur, pourcentage };
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
   * À arrêter au plus tard le 31 mars de l'année suivante (art. 45). L'écart
   * avec le provisoire effectivement appliqué se régularise à l'échéance qui
   * suit · le sens est donné explicitement, une régularisation dont on ignore
   * si elle est à payer ou à récupérer ne sert à rien.
   */
  async prorataDefinitif(tenantId: string, annee: number) {
    const definitif = await this.calculerProrata(
      tenantId,
      new Date(Date.UTC(annee, 0, 1)),
      new Date(Date.UTC(annee, 11, 31, 23, 59, 59, 999)),
    );
    const provisoireApplique = await this.calculerProrata(
      tenantId,
      new Date(Date.UTC(annee - 1, 0, 1)),
      new Date(Date.UTC(annee - 1, 11, 31, 23, 59, 59, 999)),
    );
    const pourcentageApplique =
      provisoireApplique.denominateur > EPSILON ? provisoireApplique.pourcentage : definitif.pourcentage;

    // TVA déductible brute de l'année · l'assiette de la régularisation.
    // Assiette lue par FAMILLE (445x) et non sur le compte porté par chaque
    // taux · même raison que pour la déclaration, voir RACINE_RECUPERABLE.
    const comptesDeductibles = (
      await this.prisma.compte.findMany({
        where: { tenantId, numero: { startsWith: RACINE_RECUPERABLE } },
        select: { id: true },
      })
    ).map((c) => c.id);
    const brut =
      comptesDeductibles.length === 0
        ? 0
        : Number(
            (
              await this.prisma.ligneEcriture.aggregate({
                where: {
                  compteId: { in: comptesDeductibles },
                  ecriture: {
                    tenantId,
                    date: {
                      gte: new Date(Date.UTC(annee, 0, 1)),
                      lte: new Date(Date.UTC(annee, 11, 31, 23, 59, 59, 999)),
                    },
                  },
                },
                _sum: { debit: true },
              })
            )._sum.debit ?? 0,
          );

    const admiseDefinitive = Math.round(brut * (definitif.pourcentage / 100) * 100) / 100;
    const admiseAppliquee = Math.round(brut * (pourcentageApplique / 100) * 100) / 100;
    const regularisation = Math.round((admiseDefinitive - admiseAppliquee) * 100) / 100;

    return {
      annee,
      definitif,
      pourcentageApplique,
      tvaDeductibleBrute: brut,
      admiseDefinitive,
      admiseAppliquee,
      regularisation,
      sens:
        Math.abs(regularisation) <= EPSILON
          ? ('AUCUNE' as const)
          : regularisation > 0
            ? ('DEDUCTION_COMPLEMENTAIRE' as const)
            : ('REVERSEMENT' as const),
      echeance: `À arrêter au plus tard le 31 mars ${annee + 1} (article 45).`,
    };
  }

  /**
   * Registre/déclaration TVA sur une période : pour chaque taux, somme les
   * lignes créditées sur son compte de collecte (443) et les lignes débitées
   * sur son compte de déduction (445), taguées à ce taux (LigneEcriture.
   * tauxTvaId · posé par la saisie guidée "Achat/Vente avec TVA"). Applique
   * le prorata de déduction (art. 43) à la TVA déductible brute pour obtenir
   * la TVA déductible admise. Reste lecture seule ici · voir
   * `comptabiliserLiquidation` pour poser l'écriture sur le compte 444.
   */
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

  async declaration(tenantId: string, dateDebut: Date, dateFin: Date) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    // DEBITS (art. 26) se comporte comme LIVRAISONS : l'exigibilité est
    // l'inscription au débit du compte du client, c'est-à-dire la date de la
    // facture, donc de l'écriture. La nuance de l'art. 26 in fine (un
    // encaissement antérieur au débit reste exigible à l'encaissement) ne
    // change rien ici : sur une facture, le débit précède l'encaissement.
    const alEncaissement = tenant?.regimeExigibiliteTva === 'ENCAISSEMENTS';
    const taux = await this.prisma.tauxTva.findMany({ where: { tenantId }, orderBy: { taux: 'desc' } });
    const dejaLiquidee = await this.liquidationChevauchante(tenantId, dateDebut, dateFin);

    const lignes = [];
    let enAttente = 0;
    for (const t of taux) {
      let totalCollecte = 0;
      let totalDeductible = 0;
      let attenteDuTaux = 0;

      if (alEncaissement) {
        // Régime de l'encaissement · on ne peut plus agréger en base : chaque
        // ligne a sa propre date d'exigibilité, qui dépend de son lettrage.
        // La fenêtre de lecture remonte donc AVANT la période déclarée (une
        // facture de l'an dernier encaissée ce mois-ci est exigible ce
        // mois-ci) et s'arrête à la fin de la période.
        const candidates = await this.prisma.ligneEcriture.findMany({
          where: {
            tauxTvaId: t.id,
            compte: { OR: [{ numero: { startsWith: RACINE_COLLECTEE } }, { numero: { startsWith: RACINE_RECUPERABLE } }] },
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
        for (const l of candidates) {
          const { date, fraction } = this.exigibilite(l, l.ecriture.lignes, l.ecriture.date);
          const estCollecte = l.compte.numero.startsWith(RACINE_COLLECTEE);
          const montant = estCollecte ? Number(l.credit) : Number(l.debit);
          if (montant <= EPSILON) continue;
          // Part non encore exigible d'une facture de la période · c'est le
          // chiffre qui explique l'écart entre le chiffre d'affaires et la
          // déclaration, et sans lequel le régime paraît perdre de la TVA.
          if (estCollecte && l.ecriture.date >= dateDebut && l.ecriture.date <= dateFin) {
            attenteDuTaux += Math.round(montant * (1 - fraction) * 100) / 100;
          }
          if (!date || date < dateDebut || date > dateFin) continue;
          const exigible = Math.round(montant * fraction * 100) / 100;
          if (estCollecte) totalCollecte += exigible;
          else totalDeductible += exigible;
        }
      } else {
        const [aggCollecte, aggDeductible] = await Promise.all([
          this.prisma.ligneEcriture.aggregate({
            where: {
              tauxTvaId: t.id,
              compte: { numero: { startsWith: RACINE_COLLECTEE } },
              ecriture: { tenantId, date: { gte: dateDebut, lte: dateFin } },
            },
            _sum: { credit: true },
          }),
          this.prisma.ligneEcriture.aggregate({
            where: {
              tauxTvaId: t.id,
              compte: { numero: { startsWith: RACINE_RECUPERABLE } },
              ecriture: { tenantId, date: { gte: dateDebut, lte: dateFin } },
            },
            _sum: { debit: true },
          }),
        ]);
        totalCollecte = Number(aggCollecte._sum.credit ?? 0);
        totalDeductible = Number(aggDeductible._sum.debit ?? 0);
      }

      enAttente += attenteDuTaux;
      if (totalCollecte === 0 && totalDeductible === 0 && attenteDuTaux === 0) continue; // taux sans mouvement sur la période
      lignes.push({
        tauxId: t.id,
        code: t.code,
        intitule: t.intitule,
        taux: Number(t.taux),
        compteCollecteId: t.compteCollecteId,
        compteDeductibleId: t.compteDeductibleId,
        totalCollecte,
        totalDeductible,
        enAttente: attenteDuTaux,
        net: totalCollecte - totalDeductible,
      });
    }

    const totalCollecte = lignes.reduce((s, l) => s + l.totalCollecte, 0);
    const totalDeductible = lignes.reduce((s, l) => s + l.totalDeductible, 0);
    const prorata = await this.prorataApplicable(tenantId, dateDebut, dateFin);
    const totalDeductibleAdmise = Math.round(totalDeductible * (prorata.pourcentage / 100) * 100) / 100;
    const net = totalCollecte - totalDeductibleAdmise;

    return {
      dateDebut,
      dateFin,
      regimeExigibilite: tenant?.regimeExigibiliteTva ?? 'LIVRAISONS',
      mentionExigibilite: alEncaissement
        ? "Régime de l'encaissement (art. 25, 2° de l'ordonnance-loi n° 10/001) : la TVA d'une prestation de " +
          "services devient exigible au règlement, et non à la facture. Les factures de la période encore " +
          'impayées ne figurent donc pas ici · elles sont reprises sous « TVA en attente d’encaissement ».'
        : tenant?.regimeExigibiliteTva === 'DEBITS'
          ? "Régime des débits (art. 26, sur autorisation du Directeur Général des Impôts) : la TVA est exigible à " +
            "l'inscription au débit du compte du client, donc à la date de la facture."
          : "Régime des livraisons (art. 25, 1°) : la TVA est exigible à la réalisation du fait générateur. Si ce " +
            'dossier facture des PRESTATIONS DE SERVICES, le régime de droit commun est celui de l’encaissement ' +
            '(art. 25, 2°) · à changer dans Structure > Paramètres du dossier.',
      // TVA facturée sur la période mais pas encore encaissée, donc pas encore
      // due. Zéro hors régime de l'encaissement, où la notion n'existe pas.
      tvaEnAttenteEncaissement: Math.round(enAttente * 100) / 100,
      lignes,
      prorata,
      totalCollecte,
      totalDeductible,
      totalDeductibleAdmise,
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
   * Comptabilise la liquidation périodique : solde, par compte réellement
   * utilisé (en général 44310000/44510000 partagés voir le seed mais un
   * tenant peut avoir personnalisé des comptes différents par taux), la TVA
   * collectée et la TVA déductible ADMISE (après prorata), et porte la
   * différence sur le compte 44410000 (crédit = TVA due, débit = crédit de TVA
   * à reporter). Pose une écriture NORMALE via EcritureService.creer · mêmes
   * contrôles que n'importe quelle saisie (équilibre, exercice ouvert,
   * clôtures Partielle/Totale/Période).
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
    if (Math.abs(decl.net) > EPSILON) {
      if (decl.net > 0) {
        lignesEcriture.push({ compteId: compteTvaDue.id, debit: 0, credit: decl.net, libelle: 'TVA due' });
      } else {
        lignesEcriture.push({ compteId: compteCreditTva.id, debit: -decl.net, credit: 0, libelle: 'Crédit de TVA à reporter' });
      }
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
