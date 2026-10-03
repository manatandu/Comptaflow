import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { OrigineLettrage, Prisma, StatutExercice, StatutLettrage } from '@prisma/client';
import { avecRetrySerialisable } from '../../common/prisma-retry.util';
import { lignesFigees, refuserSiLignesFigees } from '../exercice/gel-cloture';
import { comptesPrescrits, ecartDuGroupe, natureDuCompte } from '../reglements/ecart-change-realise';
import { referentielDuDossier } from '../reglements/compte-ecart-change';
import { motifLettrageADeuxExercices } from './lettrages-a-cheval';

const EPSILON = 0.005;

/** Convertit un rang (1, 2, 3, ...) en lettre façon Sage/Excel : A, B, ..., Z, AA, AB, ... */
function indexVersLettre(n: number): string {
  let s = '';
  while (n > 0) {
    const reste = (n - 1) % 26;
    s = String.fromCharCode(65 + reste) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function lettreVersIndex(lettre: string): number {
  let n = 0;
  for (const ch of lettre.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n;
}

/**
 * LETTRAGE · modèle repris des Notes de cours d'organisation comptable du
 * CPCC (Conseil Permanent de la Comptabilité au Congo), SHEKOMBO SHUNGU John,
 * novembre 2020, chapitre 6, croisé avec l'ergonomie de Sage 100 i7.
 *
 * Définition retenue, citée : « Le lettrage est une opération comptable qui
 * consiste à affecter un seul repère à deux ou plusieurs entrées enregistrées
 * d'un compte, la somme des montants lettrés au débit pouvant être ÉGALE,
 * SUPÉRIEURE OU INFÉRIEURE à celle des montants lettrés au crédit. Le but
 * ainsi poursuivi est d'associer les opérations de manière à identifier
 * celles restées TOTALEMENT OU PARTIELLEMENT ouvertes. »
 *
 * Ce que cela change par rapport à la version précédente, qui refusait tout
 * groupe dont le solde n'était pas nul : une facture réglée à moitié est
 * lettrable, et le groupe reste PARTIEL jusqu'à son dénouement. Les lignes
 * d'un groupe partiel ne portent pas de `lettre` et restent donc visibles de
 * tous les états qui recensent l'ouvert (report à-nouveau Détail, relances,
 * note annexe des créances, contrôle d'ancienneté) · voir le commentaire de
 * `LigneEcriture.lettre` dans le schéma.
 *
 * Les autres apports du chapitre, tous implémentés ici :
 *
 *  - « Liberté de définir la liste des comptes auxquels s'applique le
 *    lettrage » → `Compte.lettrable`. Le texte dit que l'intérêt porte
 *    « principalement » sur les comptes de tiers, mais son exemple chiffré
 *    est sur le compte 585 Virements internes : le drapeau n'est donc pas
 *    déduit de la classe, il est posé compte par compte.
 *  - Lettrage automatique « a priori » : « chaque facture saisie est
 *    identifiée par un code unique, généralement le numéro de la pièce
 *    comptable. Et, chaque fois qu'on enregistre un règlement, le système
 *    impose d'enregistrer en même temps le code de la facture objet du
 *    règlement. » → première passe par référence de pièce, avant toute
 *    présomption sur les montants.
 *  - Lettrage automatique « a posteriori » : « l'ordinateur s'efforce
 *    d'associer chaque règlement à une facture en s'appuyant sur des éléments
 *    identiques des deux écritures, généralement le montant ou le libellé. »
 *    → les passes par montant, conservées et enrichies.
 *  - « Verrouillage définitif ou non du lettrage » → `Lettrage.verrouille`.
 *  - « Il facilite également, pour les opérations en monnaies étrangères
 *    dénouées, le calcul des différences de change réalisées » →
 *    `Lettrage.ecartChange`, calculé au passage à SOLDE.
 *
 * L'origine de chaque groupe est tracée (MANUEL, AUTOMATIQUE_PIECE,
 * AUTOMATIQUE_MONTANT) parce que les trois n'ont pas la même valeur probante :
 * un rapprochement par numéro de pièce s'appuie sur une donnée saisie par un
 * humain, un rapprochement par montant est une présomption du logiciel.
 *
 * LA CLÔTURE FIGE LE LETTRAGE, SAUF LA PARTIELLE (audit final F63 · cet
 * en-tête disait le contraire du code). Lettrer, compléter, délettrer et
 * confirmer un pré-lettrage passent tous par `refuserSiLignesFigees`, et le
 * lettrage automatique n'apparie pas une ligne figée. La règle vit UNE fois,
 * dans `exercice/gel-cloture.ts` · une ligne est figée quand son exercice est
 * clôturé, quand une clôture TOTALE de son journal la couvre, ou quand une
 * clôture de PÉRIODE couvre sa date ; la PARTIELLE ne fige rien. C'est la
 * lecture du manuel Sage i7 (« Partielle : [...] le lettrage et la
 * ventilation analytique par exemple pourront tout de même être
 * effectués »), qui n'ouvre cette exception qu'à la partielle.
 *
 * Le cours CPCC (§ 2.3, clôture informatique) écrit que « la clôture
 * AUTORISE : le lettrage et le pointage » · OmegaX trace une autre ligne, et
 * ce n'est pas une doctrine du cours mais une CONVENTION D'OMEGAX (A6 bis,
 * second tour, m7 ; l'écart et son motif au § 3 de
 * docs/organisation-comptable-cpcc.md). Le souci du cours, un compte de
 * tiers qui ne se justifierait plus, est tenu ainsi · un règlement de mars
 * qui solde une facture de décembre se lettre contre la ligne de REPORT
 * À-NOUVEAU de l'exercice ouvert (mode Détail des comptes de tiers), jamais
 * contre la ligne de l'exercice clos. Sur un compte reporté au Détail, un
 * NOUVEAU groupe ne mêle pas deux exercices, au lettrage manuel, au
 * complément, au pré-lettrage confirmé comme au lettrage automatique ; un
 * compte au SOLDE lettre librement d'un exercice à l'autre (le salaire de
 * décembre payé en janvier). Les groupes à cheval déjà en base ne bloquent
 * rien et ne se délettrent pas · chaque exercice se lit pour lui-même
 * (`lettrages-a-cheval.ts`), et l'écart de change réalisé d'un tel groupe,
 * figé compris, le complète par sa seule ligne (`completer`, `groupeTolere`).
 */
/** Une ligne du groupe a été lettrée par un autre geste entre le calcul et l'écriture. */
function lignesPrisesEntreTemps() {
  return new ConflictException(
    "Une des lignes a été lettrée entre-temps par un autre utilisateur · rien n'a été lettré. Rechargez et recommencez.",
  );
}

/**
 * Plafond des lignes qu'une fenêtre de lettrage montre (audit final F185) ·
 * au-delà, la tranche se dit et les totaux restent ceux du compte entier.
 */
export const PLAFOND_LIGNES_LETTRAGE = 5000;

@Injectable()
export class LettrageService {
  constructor(private readonly prisma: PrismaService) {}

  private async trouverCompte(tenantId: string, compteId: string) {
    const compte = await this.prisma.compte.findFirst({ where: { id: compteId, tenantId } });
    if (!compte) {
      throw new NotFoundException('Compte introuvable pour ce tenant');
    }
    return compte;
  }

  /** Le compte, en vérifiant qu'il accepte le lettrage. */
  private async trouverCompteLettrable(tenantId: string, compteId: string) {
    const compte = await this.trouverCompte(tenantId, compteId);
    if (!compte.lettrable) {
      throw new BadRequestException(
        `Le compte ${compte.numero} n'est pas déclaré lettrable. Ouvrez-le au lettrage depuis le plan comptable ` +
          "(« liberté de définir la liste des comptes auxquels s'applique le lettrage », CPCC, ch. 6).",
      );
    }
    return compte;
  }

  /**
   * Lignes du compte, avec leur groupe de lettrage.
   *
   * `nonLettreesSeulement` retient ce qui est OUVERT au sens du CPCC : les
   * lignes sans lettre, donc aussi celles d'un groupe PARTIEL, qui restent
   * dues pour le solde. C'est le sens du mot « ouvertes » dans la définition
   * citée en tête de fichier.
   */
  async lister(tenantId: string, compteId: string, nonLettreesSeulement?: boolean) {
    const compte = await this.trouverCompte(tenantId, compteId);
    const where: Prisma.LigneEcritureWhereInput = {
      compteId,
      ecriture: { tenantId },
      ...(nonLettreesSeulement ? { lettre: null } : {}),
    };
    // UNE FENÊTRE DE TRAVAIL MONTRE UNE TRANCHE, ET LE DIT (audit final F185)
    // · une caisse tenue depuis des années passait tout entière en mémoire.
    // Les totaux se prennent sur le périmètre entier, jamais sur la tranche.
    const [lignes, total, agregat] = await Promise.all([
      this.prisma.ligneEcriture.findMany({
        where,
        include: { ecriture: { include: { journal: true } }, lettrage: true, devise: true },
        orderBy: [{ ecriture: { date: 'asc' } }, { id: 'asc' }],
        take: PLAFOND_LIGNES_LETTRAGE,
      }),
      this.prisma.ligneEcriture.count({ where }),
      this.prisma.ligneEcriture.aggregate({ where, _sum: { debit: true, credit: true } }),
    ]);
    const tronque = total > lignes.length;
    // Tranche montrée · les groupes se restreignent à ceux de ses lignes, plus
    // les PARTIELS, qui restent à compléter où qu'ils soient.
    const lettrages = await this.prisma.lettrage.findMany({
      where: {
        compteId,
        tenantId,
        ...(tronque
          ? {
              OR: [
                { statut: StatutLettrage.PARTIEL },
                { id: { in: [...new Set(lignes.map((l) => l.lettrageId).filter((id): id is string => id !== null))] } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      tronque,
      total,
      plafond: PLAFOND_LIGNES_LETTRAGE,
      totaux: { debit: Number(agregat._sum.debit ?? 0), credit: Number(agregat._sum.credit ?? 0) },
      compte: { id: compte.id, numero: compte.numero, intitule: compte.intitule, lettrable: compte.lettrable },
      lignes: lignes.map((l) => ({
        id: l.id,
        date: l.ecriture.date,
        journalCode: l.ecriture.journal.code,
        libelle: l.libelle ?? l.ecriture.libelle,
        reference: l.ecriture.reference,
        debit: Number(l.debit),
        credit: Number(l.credit),
        lettre: l.lettre,
        lettrageId: l.lettrageId,
        // Le code tel qu'il doit s'AFFICHER : minuscule tant que le groupe
        // est partiel, majuscule une fois soldé · convention de l'exemple
        // chiffré du CPCC (compte 585) et des logiciels de la place.
        codeLettrage: l.lettrage ? (l.lettrage.statut === StatutLettrage.SOLDE ? l.lettrage.code : l.lettrage.code.toLowerCase()) : null,
        devise: l.devise?.code ?? null,
        montantDevise: l.montantDevise === null ? null : Number(l.montantDevise),
      })),
      lettrages: lettrages.map((g) => ({
        id: g.id,
        code: g.statut === StatutLettrage.SOLDE ? g.code : g.code.toLowerCase(),
        statut: g.statut,
        solde: Number(g.solde),
        origine: g.origine,
        verrouille: g.verrouille,
        ecartChange: g.ecartChange === null ? null : Number(g.ecartChange),
        createdAt: g.createdAt,
        createdBy: g.createdBy,
        soldeAt: g.soldeAt,
      })),
    };
  }

  /**
   * TOUS les groupes de lettrage du dossier, comptes confondus.
   *
   * La fenêtre Lettrage s'ouvrait VIDE : elle ne montrait rien tant qu'un
   * compte n'avait pas été désigné, alors que la question du comptable qui
   * l'ouvre est d'abord « où en est le lettrage du dossier ». Le choix d'un
   * compte devient donc un filtre, plus une condition d'affichage.
   *
   * Le solde d'un groupe PARTIEL est ce qui reste dû · c'est la seule colonne
   * qui compte ici, et c'est elle qui dit quelles factures sont encore
   * ouvertes (CPCC : le lettrage sert à identifier les opérations restées
   * « totalement ou partiellement ouvertes »).
   */
  async listerGroupesDuDossier(tenantId: string, statut?: StatutLettrage) {
    const groupes = await this.prisma.lettrage.findMany({
      where: { tenantId, ...(statut ? { statut } : {}) },
      include: {
        compte: { select: { id: true, numero: true, intitule: true } },
        _count: { select: { lignes: true } },
      },
      // Par compte, puis dans l'ordre où les groupes ont été posés · c'est
      // l'ordre du grand livre, celui que le comptable a en tête.
      orderBy: [{ compte: { numero: 'asc' } }, { createdAt: 'asc' }],
    });

    return groupes.map((g) => ({
      id: g.id,
      compteId: g.compteId,
      compteNumero: g.compte.numero,
      compteIntitule: g.compte.intitule,
      code: g.statut === StatutLettrage.SOLDE ? g.code : g.code.toLowerCase(),
      statut: g.statut,
      solde: Number(g.solde),
      origine: g.origine,
      verrouille: g.verrouille,
      ecartChange: g.ecartChange === null ? null : Number(g.ecartChange),
      nombreLignes: g._count.lignes,
      createdAt: g.createdAt,
      createdBy: g.createdBy,
      soldeAt: g.soldeAt,
    }));
  }

  /**
   * Prochain code disponible pour ce compte · même risque de condition de
   * course que le numéro de pièce des journaux (deux lettrages simultanés sur
   * le même compte pourraient lire le même « dernier code »), donc toujours
   * appelé DANS la transaction sérialisable de l'appelant.
   *
   * Lit la table des lettrages ET les lettres posées sur les lignes : la
   * seconde source couvre les dossiers repris avant l'introduction du modèle
   * Lettrage, dont la migration a recréé les groupes mais dont un code
   * pourrait, en théorie, ne pas avoir été repris.
   */
  private async prochaineLettre(tx: Prisma.TransactionClient, tenantId: string, compteId: string): Promise<string> {
    const [groupes, lignes] = await Promise.all([
      tx.lettrage.findMany({ where: { compteId, tenantId }, select: { code: true } }),
      tx.ligneEcriture.findMany({
        where: { compteId, lettre: { not: null } },
        select: { lettre: true },
        distinct: ['lettre'],
      }),
    ]);
    const codes = [...groupes.map((g) => g.code), ...lignes.map((l) => l.lettre!)];
    const maxIndex = codes.reduce((max, c) => Math.max(max, lettreVersIndex(c)), 0);
    return indexVersLettre(maxIndex + 1);
  }

  /**
   * LES LETTRES D'UN LOT DE GROUPES (audit final F2). Relire tous les codes du
   * compte à chaque groupe coûtait un aller-retour et une liste qui grandit
   * par groupe · un lettrage automatique de milliers de groupes dépassait le
   * délai de sa transaction. Le code suivant est lu UNE fois, puis
   * incrémenté · juste dans la transaction sérialisable qui pose le lot.
   */
  private async lettresDuLot(tx: Prisma.TransactionClient, tenantId: string, compteId: string): Promise<() => string> {
    let index = lettreVersIndex(await this.prochaineLettre(tx, tenantId, compteId));
    return () => indexVersLettre(index++);
  }

  /**
   * LE RÉALISÉ DU GROUPE, CUMULÉ (ligne A6). Un règlement en devise solde le
   * tiers au coût historique et porte SON écart sur sa propre ligne, hors du
   * compte du tiers · les lignes du groupe ne le montrent pas, il est donc
   * GARDÉ par le groupe dès le règlement, partiel compris (« réalisé à ce
   * jour »). Au passage à SOLDE, l'écart que portent encore les lignes en
   * devise (un solde passé à un autre cours, ou l'écart proposé puis passé)
   * s'y AJOUTE · le groupe soldé dit le réalisé TOTAL, 42 000 + 123 200 au
   * jeu du séminaire, jamais le seul dernier. Sans réalisé gardé, la règle
   * d'origine · `null` tant que le groupe n'est pas soldé.
   */
  static ecartCumule(dejaRealise: number | null, auDenouement: number | null, soldeNul: boolean): number | null {
    if (!soldeNul) return dejaRealise;
    if (dejaRealise === null) return auDenouement;
    return Math.round((dejaRealise + (auDenouement ?? 0)) * 100) / 100;
  }

  /**
   * ÉCART DE CHANGE RÉALISÉ · « le lettrage facilite, pour les opérations en
   * monnaies étrangères dénouées, le calcul des différences de change
   * réalisées » (CPCC, ch. 6).
   *
   * Le calcul porte sur les seules lignes PORTANT UNE DEVISE, et non sur tout
   * le groupe. C'est essentiel : dans un dénouement en devise, la facture et
   * son règlement ne s'équilibrent justement PAS en monnaie de tenue, et
   * c'est une troisième ligne, l'écriture d'écart de change, qui ramène le
   * groupe à zéro. Son compte dépend de la NATURE de l'opération et du
   * référentiel (AUDCIF Titre VIII ch. 22 § 2.3 · 656 ou 756 pour une créance
   * ou une dette commerciale, 676 ou 776 pour une opération financière ; le
   * SYCEBNL n'ouvre ni 656 ni 756) · voir reglements/ecart-change-realise.ts.
   * Écrire « 676 ou 776 » pour tout, comme jusqu'au 2026-10-02, mettait la
   * perte sur un fournisseur en résultat financier. Exiger que toutes les lignes portent une devise
   * écarterait précisément le cas que le CPCC vise.
   *
   * Conditions : au moins une ligne en devise, une seule devise dans le
   * groupe, et un solde EN DEVISE nul (la créance ou la dette est réellement
   * dénouée). L'écart rendu est alors le solde de ces lignes en monnaie de
   * tenue, SIGNÉ : le sens économique (gain ou perte) dépend de la nature du
   * compte, actif ou passif, et le nommer ici serait une interprétation.
   *
   * `null` dans tous les autres cas, et ce n'est PAS zéro : rendre zéro
   * laisserait croire à un dénouement sans écart.
   */
  private ecartChangeRealise(
    lignes: Array<{ debit: Prisma.Decimal; credit: Prisma.Decimal; deviseId: string | null; montantDevise: Prisma.Decimal | null }>,
  ): number | null {
    const enDevise = lignes.filter((l) => l.deviseId !== null && l.montantDevise !== null);
    if (enDevise.length === 0) return null;
    if (new Set(enDevise.map((l) => l.deviseId)).size !== 1) return null;

    // Le montant en devise est stocké en valeur absolue ; son sens est celui
    // de la ligne, comme pour les montants en monnaie de tenue.
    const soldeDevise = enDevise.reduce((s, l) => {
      const sens = Number(l.debit) - Number(l.credit) >= 0 ? 1 : -1;
      return s + sens * Number(l.montantDevise);
    }, 0);
    if (Math.abs(soldeDevise) > EPSILON) return null;

    const soldeLocal = enDevise.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);
    // Un solde local nul sur des lignes dénouées veut dire que le cours n'a
    // pas bougé : zéro est alors la bonne réponse, pas null.
    return soldeLocal;
  }

  /**
   * Crée un groupe de lettrage sur des lignes vérifiées, dans une transaction
   * déjà ouverte. Sert au lettrage manuel comme aux passes automatiques ·
   * c'est le seul endroit qui décide du statut, pose ou non la `lettre`, et
   * calcule l'écart de change.
   */
  private async creerGroupe(
    tx: Prisma.TransactionClient,
    params: {
      tenantId: string;
      compteId: string;
      ligneIds: string[];
      origine: OrigineLettrage;
      userId: string;
      /**
       * L'écart déjà passé sur sa propre ligne par la pièce qui solde le
       * groupe (règlement en devise, ligne A6) · le tiers y est soldé au coût
       * historique, si bien que ses lignes ne le portent pas, et le calcul
       * rendrait zéro, un « dénouement sans écart » qui n'a pas eu lieu.
       */
      ecartChangeRealise?: number;
    },
    prochaineLettre?: () => string,
  ) {
    // RELUES LIBRES, DANS LA TRANSACTION (audit final F57) · les passes
    // automatiques calculent leurs groupes hors transaction, et un lettrage
    // concurrent pouvait prendre une ligne entre-temps · elle changeait de
    // groupe en silence, et le solde stocké du premier devenait faux.
    const lignes = await tx.ligneEcriture.findMany({
      where: { id: { in: params.ligneIds }, compteId: params.compteId, lettrageId: null },
      select: { id: true, debit: true, credit: true, deviseId: true, montantDevise: true },
    });
    if (lignes.length !== new Set(params.ligneIds).size) throw lignesPrisesEntreTemps();
    const solde = lignes.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);
    const soldeNul = Math.abs(solde) <= EPSILON;
    const statut = soldeNul ? StatutLettrage.SOLDE : StatutLettrage.PARTIEL;
    const code = prochaineLettre ? prochaineLettre() : await this.prochaineLettre(tx, params.tenantId, params.compteId);

    const groupe = await tx.lettrage.create({
      data: {
        tenantId: params.tenantId,
        compteId: params.compteId,
        code,
        statut,
        solde: soldeNul ? 0 : solde,
        origine: params.origine,
        createdBy: params.userId,
        soldeAt: soldeNul ? new Date() : null,
        ecartChange: LettrageService.ecartCumule(params.ecartChangeRealise ?? null, soldeNul ? this.ecartChangeRealise(lignes) : null, soldeNul),
      },
    });
    const { count } = await tx.ligneEcriture.updateMany({
      // Encore libres AU MOMENT D'ÉCRIRE · un lettrage qui a pris la ligne
      // entre la lecture et l'écriture la sort du filtre, et tout est défait.
      where: { id: { in: params.ligneIds }, lettrageId: null },
      // `lettre` n'est servie QUE si le groupe est soldé · voir le
      // commentaire de LigneEcriture.lettre dans le schéma.
      data: { lettrageId: groupe.id, lettre: soldeNul ? code : null },
    });
    if (count !== lignes.length) throw lignesPrisesEntreTemps();
    return groupe;
  }

  /** Contrôles communs à toute pose de lettrage sur une sélection de lignes. */
  private verifierLignes(
    lignes: Array<{ compteId: string; lettre: string | null; lettrageId: string | null; ecriture: { tenantId: string; date: Date } }>,
    attendu: { compteId: string; tenantId: string; nombre: number },
  ) {
    if (lignes.length !== attendu.nombre) {
      throw new NotFoundException('Une ou plusieurs lignes sont introuvables');
    }
    for (const l of lignes) {
      if (l.compteId !== attendu.compteId || l.ecriture.tenantId !== attendu.tenantId) {
        throw new BadRequestException('Toutes les lignes doivent appartenir au compte et au tenant indiqués');
      }
      if (l.lettrageId) {
        const jour = l.ecriture.date.toISOString().slice(0, 10);
        throw new BadRequestException(
          `La ligne du ${jour} appartient déjà à un lettrage · délettrez-le d'abord, ou complétez-le.`,
        );
      }
    }
  }

  /**
   * Lettrage manuel. `autoriserPartiel` commande ce qui se passe quand le
   * solde de la sélection n'est pas nul :
   *
   *  - faux (défaut) : refus, avec le montant de l'écart. C'est le
   *    comportement attendu quand on croit solder une facture ;
   *  - vrai : le groupe est créé au statut PARTIEL. C'est le cas d'un acompte
   *    ou d'un règlement partiel, que le CPCC prévoit expressément.
   *
   * Le drapeau est demandé explicitement plutôt que déduit : créer un partiel
   * sans que l'utilisateur l'ait voulu masquerait une erreur de sélection.
   */
  async lettrerManuel(
    tenantId: string,
    compteId: string,
    ligneIds: string[],
    userId: string,
    options: { autoriserPartiel?: boolean; ecartChangeRealise?: number } = {},
  ) {
    const compte = await this.trouverCompteLettrable(tenantId, compteId);

    return avecRetrySerialisable(
      this.prisma,
      async (tx) => {
        const lignes = await tx.ligneEcriture.findMany({
          where: { id: { in: ligneIds } },
          include: { ecriture: true },
        });
        this.verifierLignes(lignes, { compteId, tenantId, nombre: ligneIds.length });
        // AU DÉTAIL, UN GROUPE NE MÊLE PAS DEUX EXERCICES (A6 bis) · la
        // facture de N se lettre, en N+1, avec la ligne d'à-nouveau.
        const aCheval = motifLettrageADeuxExercices(lignes, compte);
        if (aCheval) throw new BadRequestException(aCheval);
        // Le lettrage reste possible après une clôture PARTIELLE (Sage i7 :
        // « le lettrage et la ventilation analytique […] pourront tout de même
        // être effectués »), et SEULEMENT après elle · une clôture totale, de
        // période ou d'exercice le fige (exercice/gel-cloture.ts).
        await refuserSiLignesFigees(tx, tenantId, ligneIds, 'lettrer');

        const solde = lignes.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);
        if (Math.abs(solde) > EPSILON && !options.autoriserPartiel) {
          // SOLDÉ EN DEVISE, PAS EN FRANCS (ligne A6) · ce n'est pas une
          // erreur de sélection, c'est l'écart de change réalisé. Le refus le
          // nomme et dit comment l'écriture d'écart est proposée.
          const change = ecartDuGroupe(
            lignes.map((l) => ({
              debit: Number(l.debit),
              credit: Number(l.credit),
              deviseId: l.deviseId,
              montantDevise: l.montantDevise === null ? null : Number(l.montantDevise),
            })),
          );
          if (change !== null) {
            throw new BadRequestException(
              `Les lignes sélectionnées sont soldées dans leur devise mais pas en francs · l'écart de ${Math.abs(change.ecart).toFixed(2)} ` +
                `est ${change.ecart > 0 ? 'une perte de change réalisée' : 'un gain de change réalisé'} (AUDCIF art. 55). Lettrez en partiel, puis passez ` +
                "l'écart proposé sur le groupe (« Écart de change »).",
            );
          }
          throw new BadRequestException(
            `Le solde des lignes sélectionnées n'est pas nul (${solde.toFixed(2)}). ` +
              "Cochez « lettrage partiel » si l'opération est effectivement réglée en partie seulement.",
          );
        }

        const groupe = await this.creerGroupe(tx, {
          tenantId,
          compteId,
          ligneIds,
          origine: OrigineLettrage.MANUEL,
          userId,
          ecartChangeRealise: options.ecartChangeRealise,
        });
        return {
          lettre: groupe.statut === StatutLettrage.SOLDE ? groupe.code : groupe.code.toLowerCase(),
          statut: groupe.statut,
          solde: Number(groupe.solde),
          ecartChange: groupe.ecartChange === null ? null : Number(groupe.ecartChange),
          nombreLignes: ligneIds.length,
        };
      },
      `Trop de lettrages effectués au même instant sur ce compte · veuillez réessayer.`,
    );
  }

  /**
   * Complète un groupe PARTIEL avec de nouvelles lignes · le règlement du
   * solde restant. Si le groupe tombe à zéro, il passe SOLDE, sa `lettre` est
   * posée sur TOUTES ses lignes (les anciennes comme les nouvelles) et
   * l'écart de change est calculé sur l'ensemble.
   *
   * `groupeTolere` · le SEUL groupe que l'appelant complète de SA propre
   * ligne alors qu'une clôture l'a figé (même nom et même portée qu'à la
   * ligne A7 ter, `motifLignesTenues`). C'est l'écart de change réalisé de
   * `ReglementsService.passerEcartChange` (A6 bis, second tour, B2) · le
   * groupe soldé dans sa devise reste PARTIEL en francs tant que l'écart
   * n'y est pas, et l'AUDCIF art. 55 veut cet écart « constaté » à la date
   * du règlement ; le gel (une convention de Sage i7, `gel-cloture.ts`)
   * l'interdisait, et la réévaluation de l'exercice suivant comptait le
   * groupe comme une position ouverte, réalisé provisionné deux fois.
   * Toléré, le groupe reçoit la ligne nouvelle, qui seule doit être libre ;
   * aucune ligne figée n'est déplacée, délettrée ni modifiée dans ses
   * montants. La lettre du groupe soldé se pose sur ses lignes, sauf celles
   * d'un exercice CLÔTURÉ, qu'aucun geste ne touche plus (« on ne peut pas
   * modifier les enregistrements d'exercice clôturé ») · une ligne figée par
   * une clôture de période ou de journal d'un exercice OUVERT la reçoit, sans
   * quoi le report Détail de cet exercice la lirait ouverte et reprendrait
   * une facture réglée (F50 · `lettre` est le signe du groupe soldé). Le
   * groupe peut déjà mêler deux exercices (règle 2 de `lettrages-a-cheval.ts`)
   * · toléré, il ne refuse que la ligne d'un exercice qu'il ne touchait pas.
   */
  async completer(tenantId: string, lettrageId: string, ligneIds: string[], options: { groupeTolere?: string | null } = {}) {
    const tolere = (options.groupeTolere ?? null) !== null && options.groupeTolere === lettrageId;
    return avecRetrySerialisable(
      this.prisma,
      async (tx) => {
        const groupe = await tx.lettrage.findFirst({ where: { id: lettrageId, tenantId } });
        if (!groupe) throw new NotFoundException('Lettrage introuvable pour ce dossier');
        if (groupe.verrouille) {
          throw new BadRequestException(
            `Le lettrage ${groupe.code} est verrouillé · déverrouillez-le avant de le compléter.`,
          );
        }
        if (groupe.statut === StatutLettrage.SOLDE) {
          throw new BadRequestException(`Le lettrage ${groupe.code} est déjà soldé · il n'y a rien à compléter.`);
        }

        const nouvelles = await tx.ligneEcriture.findMany({
          where: { id: { in: ligneIds } },
          include: { ecriture: true },
        });
        this.verifierLignes(nouvelles, { compteId: groupe.compteId, tenantId, nombre: ligneIds.length });
        // Les lignes DÉJÀ du groupe comptent aussi · le compléter pose la
        // lettre sur toutes, et en change le statut.
        const dejaDuGroupe = await tx.ligneEcriture.findMany({
          where: { lettrageId },
          select: { id: true, ecriture: { select: { exerciceId: true, date: true, exercice: { select: { statut: true } } } } },
        });
        // AU DÉTAIL, UN GROUPE NE MÊLE PAS DEUX EXERCICES (A6 bis) · les
        // lignes déjà du groupe comptent, l'écart de change passé par
        // `passerEcartChange` aussi.
        const compte = await this.trouverCompte(tenantId, groupe.compteId);
        const exercicesDuGroupe = new Set(dejaDuGroupe.map((l) => l.ecriture.exerciceId));
        const ajouteUnExercice = nouvelles.some((l) => !exercicesDuGroupe.has(l.ecriture.exerciceId));
        if (!tolere || ajouteUnExercice) {
          const aCheval = motifLettrageADeuxExercices([...nouvelles, ...dejaDuGroupe], compte);
          if (aCheval) throw new BadRequestException(aCheval);
        }
        // Toléré, seules les lignes NOUVELLES doivent être libres · les lignes
        // figées du groupe restent où la clôture les a laissées.
        await refuserSiLignesFigees(tx, tenantId, tolere ? ligneIds : [...ligneIds, ...dejaDuGroupe.map((l) => l.id)], 'compléter ce lettrage');
        const dExerciceClos = dejaDuGroupe.filter((l) => l.ecriture.exercice?.statut === StatutExercice.CLOTURE).map((l) => l.id);

        await tx.ligneEcriture.updateMany({ where: { id: { in: ligneIds } }, data: { lettrageId } });

        const toutes = await tx.ligneEcriture.findMany({
          where: { lettrageId },
          select: { id: true, debit: true, credit: true, deviseId: true, montantDevise: true },
        });
        const solde = toutes.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);
        const soldeNul = Math.abs(solde) <= EPSILON;

        await tx.lettrage.update({
          where: { id: lettrageId },
          data: {
            statut: soldeNul ? StatutLettrage.SOLDE : StatutLettrage.PARTIEL,
            solde: soldeNul ? 0 : solde,
            soldeAt: soldeNul ? new Date() : null,
            ecartChange: LettrageService.ecartCumule(
              groupe.ecartChange === null ? null : Number(groupe.ecartChange),
              soldeNul ? this.ecartChangeRealise(toutes) : null,
              soldeNul,
            ),
          },
        });
        if (soldeNul) {
          await tx.ligneEcriture.updateMany({
            where: { lettrageId, ...(dExerciceClos.length > 0 ? { id: { notIn: dExerciceClos } } : {}) },
            data: { lettre: groupe.code },
          });
        }

        return {
          lettre: soldeNul ? groupe.code : groupe.code.toLowerCase(),
          statut: soldeNul ? StatutLettrage.SOLDE : StatutLettrage.PARTIEL,
          solde: soldeNul ? 0 : solde,
          nombreLignes: toutes.length,
        };
      },
      'Trop de lettrages effectués au même instant sur ce compte · veuillez réessayer.',
    );
  }

  /**
   * L'ÉCART DE CHANGE PROPOSÉ d'un groupe PARTIEL soldé dans sa devise et non
   * en francs (ligne A6) · AUDCIF art. 55, « à la date de règlement [...] les
   * pertes et gains de change [...] sont constatés par rapport à leur coût
   * historique ». C'est une PROPOSITION · rien n'est écrit ici, et le groupe
   * reste partiel tant que le comptable n'a pas passé l'écriture
   * (`ReglementsService.passerEcartChange`, qui rejoue ce calcul).
   *
   * `ecart` est signé (positif = perte, négatif = gain) ; `null` avec son
   * motif quand le groupe n'est pas soldé dans sa devise. Le compte que le
   * texte donne est rendu s'il est ouvert ; au SYCEBNL, pour une créance ou
   * une dette commerciale, aucun · le motif le dit et le cabinet choisit.
   */
  async propositionEcartChange(tenantId: string, lettrageId: string, compteId?: string) {
    const groupe = await this.prisma.lettrage.findFirst({
      where: { id: lettrageId, tenantId, ...(compteId ? { compteId } : {}) },
      include: { compte: { select: { id: true, numero: true, intitule: true, modeReportANouveau: true } } },
    });
    if (!groupe) throw new NotFoundException('Lettrage introuvable pour ce dossier');
    const base = { lettrageId, code: groupe.code, compteId: groupe.compteId, compteNumero: groupe.compte.numero };
    if (groupe.statut === StatutLettrage.SOLDE) {
      return { ...base, ecart: null, motif: `Le lettrage ${groupe.code} est déjà soldé · il n'y a plus d'écart à passer.` };
    }
    const lignes = await this.prisma.ligneEcriture.findMany({
      where: { lettrageId, ecriture: { tenantId } },
      select: {
        id: true,
        debit: true,
        credit: true,
        deviseId: true,
        montantDevise: true,
        devise: { select: { code: true } },
        ecriture: { select: { date: true, exerciceId: true } },
      },
    });
    // UN GROUPE FIGÉ OU À CHEVAL DE DEUX EXERCICES (A6 bis, second tour, B2)
    // reçoit son écart comme tout groupe · `passerEcartChange` le complète
    // sous la tolérance de `completer` (`groupeTolere`), sa propre ligne
    // seule devant être libre, et l'exercice du dénouement est celui de la
    // dernière ligne. La proposition le DIT (`fige`, `aCheval`) · si la date
    // du dénouement tombe dans une période close, l'écart s'enregistre au
    // premier jour non clôturé sur demande, sa date de valeur gardée (AUDCIF
    // art. 22, 4°). Il ne se délettre pas · délettré, un groupe soldé dans sa
    // devise rouvrirait ses lignes, et la réévaluation porterait le réalisé
    // au 478 ou au 479 (D3 d'A6).
    const aCheval = new Set(lignes.map((l) => l.ecriture.exerciceId)).size > 1;
    const figees = await lignesFigees(this.prisma, tenantId, lignes.map((l) => l.id));
    const fige = figees.size > 0;
    const change = ecartDuGroupe(
      lignes.map((l) => ({
        debit: Number(l.debit),
        credit: Number(l.credit),
        deviseId: l.deviseId,
        montantDevise: l.montantDevise === null ? null : Number(l.montantDevise),
      })),
    );
    if (change === null) {
      return {
        ...base,
        ecart: null,
        motif:
          "Ce lettrage n'est pas soldé dans sa devise · il reste à régler, et l'écart de change ne se mesure qu'au " +
          'dénouement (AUDCIF art. 55).',
      };
    }
    // La date proposée est celle de la dernière pièce du groupe · le
    // règlement qui dénoue la position (ch. 22 § 2.3, « à la date
    // d'encaissement ou de règlement »).
    const derniere = lignes.reduce((d, l) => (l.ecriture.date > d.ecriture.date ? l : d), lignes[0]!);
    const referentiel = await referentielDuDossier(this.prisma, tenantId);
    const nature = natureDuCompte(groupe.compte.numero, referentiel);
    const prescrits = comptesPrescrits(referentiel, nature);
    const numeroPrescrit =
      prescrits.perte === null || change.ecart === 0 ? null : change.ecart > 0 ? prescrits.perte : prescrits.gain;
    // Le compte prescrit n'est rendu que s'il peut recevoir l'écart · de
    // DÉTAIL et ACTIF (relecture adverse, mineur 2) ; sinon l'écran offre ses
    // sous-comptes, et le serveur refusera le compte en sommeil.
    const lu = numeroPrescrit
      ? await this.prisma.compte.findFirst({
          where: { tenantId, numero: numeroPrescrit },
          select: { id: true, numero: true, intitule: true, typeCompte: true, estActif: true },
        })
      : null;
    const comptePrescrit =
      lu && lu.typeCompte === 'DETAIL' && lu.estActif !== false ? { id: lu.id, numero: lu.numero, intitule: lu.intitule } : null;
    return {
      ...base,
      aCheval,
      fige,
      ecart: change.ecart,
      sens: change.ecart > 0 ? ('PERTE' as const) : ('GAIN' as const),
      devise: lignes.find((l) => l.deviseId === change.deviseId)?.devise?.code ?? null,
      deviseId: change.deviseId,
      date: derniere.ecriture.date,
      exerciceId: derniere.ecriture.exerciceId,
      nature,
      comptePrescrit,
      numeroPrescrit,
      motif:
        prescrits.perte === null
          ? prescrits.motif
          : comptePrescrit === null && numeroPrescrit !== null
            ? lu
              ? `Le compte ${numeroPrescrit} que le texte donne ${lu.typeCompte === 'DETAIL' ? 'est en sommeil' : 'est un compte de regroupement'} · choisissez l'un de ses sous-comptes de détail.`
              : `Le compte ${numeroPrescrit} que le texte donne n'est pas ouvert dans le plan du dossier · ouvrez-le, ou un sous-compte, dans Plan comptable.`
            : null,
    };
  }

  /** « Verrouillage définitif ou non du lettrage » (CPCC, ch. 6). */
  async verrouiller(tenantId: string, lettrageId: string, verrouille: boolean) {
    const groupe = await this.prisma.lettrage.findFirst({ where: { id: lettrageId, tenantId } });
    if (!groupe) throw new NotFoundException('Lettrage introuvable pour ce dossier');
    await this.prisma.lettrage.update({ where: { id: lettrageId }, data: { verrouille } });
    return { code: groupe.code, verrouille };
  }

  /**
   * Délettrage · par code de lettrage. Refusé sur un groupe verrouillé, ce
   * qui est tout l'intérêt du verrou.
   */
  async delettrer(tenantId: string, compteId: string, lettre: string) {
    await this.trouverCompte(tenantId, compteId);
    // Le code est stocké en majuscules ; l'écran peut renvoyer la minuscule
    // d'un groupe partiel.
    const code = lettre.toUpperCase();
    const groupe = await this.prisma.lettrage.findFirst({ where: { tenantId, compteId, code } });

    if (groupe) {
      if (groupe.verrouille) {
        throw new BadRequestException(
          `Le lettrage ${groupe.code} est verrouillé · déverrouillez-le avant de le défaire.`,
        );
      }
      const duGroupe = await this.prisma.ligneEcriture.findMany({ where: { lettrageId: groupe.id }, select: { id: true } });
      await refuserSiLignesFigees(this.prisma, tenantId, duGroupe.map((l) => l.id), 'délettrer');
      const { count } = await this.prisma.ligneEcriture.updateMany({
        where: { lettrageId: groupe.id },
        data: { lettre: null, lettrageId: null },
      });
      await this.prisma.lettrage.delete({ where: { id: groupe.id } });
      return { lettre: groupe.code, nombreLignes: count };
    }

    // Aucun groupe : dossier dont un lettrage n'aurait pas été repris par la
    // migration. On retombe sur l'ancien chemin plutôt que de refuser.
    const anciennes = await this.prisma.ligneEcriture.findMany({
      where: { compteId, lettre: code, ecriture: { tenantId } },
      select: { id: true },
    });
    await refuserSiLignesFigees(this.prisma, tenantId, anciennes.map((l) => l.id), 'délettrer');
    const resultat = await this.prisma.ligneEcriture.updateMany({
      where: { compteId, lettre: code, ecriture: { tenantId } },
      data: { lettre: null, lettrageId: null },
    });
    if (resultat.count === 0) {
      throw new NotFoundException(`Aucune ligne lettrée "${code}" trouvée sur ce compte`);
    }
    return { lettre: code, nombreLignes: resultat.count };
  }

  /**
   * Recherche un sous-ensemble de `lignes` dont la somme des montants vaut
   * exactement `cible` (à EPSILON près) · cas N-pour-1 du lettrage
   * automatique (plusieurs petites factures qui soldent un seul règlement,
   * ou l'inverse). Backtracking sur les montants en centimes (entiers, pour
   * éviter les écarts flottants), lignes triées par montant décroissant pour
   * couper les branches tôt (somme des lignes restantes < reste à trouver).
   * Coût exponentiel dans le pire cas · c'est pourquoi l'appelant plafonne le
   * nombre de lignes soumises (voir LIMITE_LIGNES_SUBSET_SUM ci-dessous) :
   * au-delà, la recherche N-pour-1 est simplement sautée pour ce groupe,
   * sans erreur (le 1-pour-1 reste, lui, toujours effectué).
   */
  private trouverSousEnsemble(lignes: Array<{ id: string; montant: number }>, cible: number): string[] | null {
    const trie = [...lignes].sort((a, b) => b.montant - a.montant);
    const centimes = trie.map((l) => Math.round(l.montant * 100));
    const cibleCentimes = Math.round(cible * 100);
    const n = centimes.length;

    const sommeSuffixe = new Array(n + 1).fill(0);
    for (let i = n - 1; i >= 0; i--) sommeSuffixe[i] = sommeSuffixe[i + 1] + centimes[i];

    const choisis: number[] = [];
    const backtrack = (i: number, reste: number): boolean => {
      if (reste === 0) return true;
      if (i >= n || reste < 0 || sommeSuffixe[i] < reste) return false;
      choisis.push(i);
      if (backtrack(i + 1, reste - centimes[i])) return true;
      choisis.pop();
      return backtrack(i + 1, reste);
    };

    if (!backtrack(0, cibleCentimes)) return null;
    return choisis.map((i) => trie[i].id);
  }

  /**
   * Toutes les sommes atteignables par un sous-ensemble NON VIDE de `lignes`,
   * en centimes → un sous-ensemble (n'importe lequel) qui l'atteint. Énumère
   * les 2^n - 1 combinaisons non vides · c'est pourquoi l'appelant plafonne
   * strictement `lignes.length` (voir LIMITE_LIGNES_PARTITION) avant d'appeler
   * cette méthode : à 16 lignes, 65 535 combinaisons, largement praticable
   * pour une action manuelle ; au-delà, ça grossit trop vite.
   */
  private sommesAtteignables(lignes: Array<{ id: string; montant: number }>): Map<number, string[]> {
    const centimes = lignes.map((l) => Math.round(l.montant * 100));
    const resultat = new Map<number, string[]>();
    const n = lignes.length;
    for (let masque = 1; masque < 1 << n; masque++) {
      let somme = 0;
      const ids: string[] = [];
      for (let i = 0; i < n; i++) {
        if (masque & (1 << i)) {
          somme += centimes[i];
          ids.push(lignes[i].id);
        }
      }
      // Ne garde que le premier sous-ensemble trouvé pour une somme donnée ·
      // peu importe lequel, seule l'existence d'un match compte ici.
      if (!resultat.has(somme)) resultat.set(somme, ids);
    }
    return resultat;
  }

  /**
   * Cas général N-pour-M : un sous-ensemble de débits et un sous-ensemble de
   * crédits, tous deux non triviaux (au moins une ligne d'un côté, une ligne
   * de l'autre · les cas 1-pour-N et N-pour-1 sont déjà couverts par les
   * passes précédentes), dont les sommes sont exactement égales. Recherche
   * le match de plus petite taille totale (nombre de lignes) pour limiter la
   * casse d'un lettrage trop gourmand qui engloutirait tout le pool restant.
   */
  private trouverPartitionGenerale(
    debits: Array<{ id: string; montant: number }>,
    credits: Array<{ id: string; montant: number }>,
  ): { debits: string[]; credits: string[] } | null {
    const sommesDebits = this.sommesAtteignables(debits);
    const sommesCredits = this.sommesAtteignables(credits);

    let meilleur: { debits: string[]; credits: string[] } | null = null;
    for (const [somme, debitIds] of sommesDebits) {
      const creditIds = sommesCredits.get(somme);
      if (!creditIds) continue;
      if (!meilleur || debitIds.length + creditIds.length < meilleur.debits.length + meilleur.credits.length) {
        meilleur = { debits: debitIds, credits: creditIds };
      }
    }
    return meilleur;
  }

  /**
   * Appariement « A PRIORI » · CPCC, ch. 6 : « chaque facture saisie est
   * identifiée par un code unique, généralement le numéro de la pièce
   * comptable. Et, chaque fois qu'on enregistre un règlement, le système
   * impose d'enregistrer en même temps le code de la facture objet du
   * règlement. »
   *
   * OmegaX n'impose pas ce code à la saisie (ce serait un frein pour une
   * petite association qui règle au comptant), mais il le RECONNAÎT : quand
   * une écriture de règlement porte la même référence de pièce que la
   * facture, l'appariement ne relève plus de la présomption. Cette passe
   * s'exécute donc AVANT toutes les passes par montant, et les groupes
   * qu'elle produit sont tracés AUTOMATIQUE_PIECE.
   *
   * Deux garde-fous : une référence vide n'apparie rien, et une référence
   * partagée par plus de deux lignes n'est pas retenue non plus · un même
   * numéro sur trois lignes ne dit pas laquelle solde laquelle, et deviner
   * serait exactement ce que cette passe est censée éviter.
   */
  private apparierParReference(
    lignes: Array<{ id: string; reference: string | null; net: number }>,
  ): { groupes: string[][]; restantes: Set<string> } {
    const parReference = new Map<string, typeof lignes>();
    for (const l of lignes) {
      const ref = l.reference?.trim();
      if (!ref) continue;
      const existantes = parReference.get(ref) ?? [];
      existantes.push(l);
      parReference.set(ref, existantes);
    }

    const groupes: string[][] = [];
    const consommees = new Set<string>();
    for (const [, groupe] of parReference) {
      if (groupe.length !== 2) continue;
      const [a, b] = groupe;
      // Un débit et un crédit, et leur somme doit être nulle : deux factures
      // portant par erreur la même référence ne se soldent pas l'une l'autre.
      if (Math.sign(a.net) === Math.sign(b.net)) continue;
      if (Math.abs(a.net + b.net) > EPSILON) continue;
      groupes.push([a.id, b.id]);
      consommees.add(a.id);
      consommees.add(b.id);
    }
    return { groupes, restantes: new Set(lignes.filter((l) => !consommees.has(l.id)).map((l) => l.id)) };
  }

  /**
   * Lettrage automatique · quatre passes, dans un ordre qui va du plus au
   * moins probant (CPCC, ch. 6) :
   * 0. Appariement A PRIORI par référence de pièce · voir
   *    `apparierParReference`. Seule passe qui ne repose pas sur une
   *    présomption de montant.
   * 1. Paires exactes 1-pour-1 (une ligne au débit, une au crédit de
   *    exactement le même montant) · le cas le plus fréquent, traité en
   *    premier pour réduire vite le nombre de lignes restantes.
   * 2. N-pour-1 : plusieurs lignes d'un côté dont la somme égale exactement
   *    une ligne de l'autre côté (ex. trois factures soldées par un seul
   *    virement, ou un acompte réparti sur plusieurs factures) · recherche
   *    par sous-ensemble, plafonnée à `LIMITE_LIGNES_SUBSET_SUM` lignes du
   *    côté fouillé pour rester borné en temps de calcul.
   * 3. N-pour-M : un sous-ensemble de débits ET un sous-ensemble de crédits
   *    (au moins deux lignes de chaque côté, sinon c'est déjà couvert par la
   *    passe précédente) de somme égale · ex. deux factures réglées par deux
   *    virements dont aucune paire ni aucun total 1-pour-N ne coïncide
   *    individuellement. Énumère toutes les combinaisons possibles des deux
   *    côtés (2^n), donc plafonnée bien plus bas (`LIMITE_LIGNES_PARTITION`)
   *    que le N-pour-1 · au-delà, cette dernière passe est sautée (les
   *    précédentes restent, elles, toujours effectuées).
   */
  /**
   * LE CALCUL DES PROPOSITIONS, SORTI DE LA POSE.
   *
   * Les quatre passes ci-dessus ne décident de rien : elles PROPOSENT des
   * groupes. Deux chemins les consomment · `lettrageAutomatique`, qui pose
   * immédiatement, et `preLettrage`, qui rend la proposition à un humain. Un
   * second calcul écrit à part pour le pré-lettrage aurait divergé du premier
   * au premier correctif, et l'écart n'aurait sauté aux yeux de personne : les
   * deux listes sont plausibles séparément.
   *
   * TOUT GROUPE PROPOSÉ EST SOLDÉ · les quatre passes n'apparient que des
   * sommes exactement égales. C'est ce qui permet à la confirmation de refuser
   * un groupe qui ne l'est pas, sans avoir à faire confiance à ce que le client
   * lui renvoie.
   */
  private async calculerPropositions(tenantId: string, compte: { id: string; modeReportANouveau: string }) {
    const LIMITE_LIGNES_SUBSET_SUM = 25;
    const LIMITE_LIGNES_PARTITION = 16;
    const compteId = compte.id;

    // `lettrageId: null` et non `lettre: null` : une ligne déjà rattachée à un
    // groupe PARTIEL ne porte pas de lettre mais ne doit pas être réappariée
    // ailleurs. Elle se solde en complétant son groupe (voir `completer`).
    // L'À-NOUVEAU PROVISOIRE n'est pas proposé (A6 bis, m1) · lettré, il
    // ne se remplacerait plus, et la clôture de l'exercice précédent serait
    // refusée (`retirerANouveauProvisoire`).
    const candidates = await this.prisma.ligneEcriture.findMany({
      where: { compteId, lettrageId: null, ecriture: { tenantId, estANouveauProvisoire: false } },
      // La DATE et le LIBELLÉ sont chargés pour le pré-lettrage, qui doit
      // montrer à l'humain ce qu'il confirme · une liste d'identifiants ne se
      // confirme pas, et proposer sans donner à lire reviendrait à demander un
      // acquiescement plutôt qu'un examen.
      include: { ecriture: { select: { reference: true, date: true, exerciceId: true } } },
      orderBy: { ecriture: { date: 'asc' } },
    });
    // Une ligne figée par une clôture (exercice/gel-cloture.ts) n'est pas
    // proposée · le lettrage automatique la poserait, et le pré-lettrage
    // proposerait un groupe que sa confirmation refuserait.
    const figees = await lignesFigees(this.prisma, tenantId, candidates.map((l) => l.id));
    const nonLettrees = candidates.filter((l) => !figees.has(l.id));

    // AU DÉTAIL, UN GROUPE NE MÊLE PAS DEUX EXERCICES (A6 bis) · les passes
    // jouent exercice par exercice. Une facture de N et un règlement de N+1
    // de même montant ne sont jamais proposés ensemble · la facture se
    // lettre, en N+1, contre la ligne d'à-nouveau qui la reporte. Au SOLDE,
    // une seule passe sur tout le compte. Les exercices suivent l'ordre des
    // dates, et les lettres posées avec.
    const auDetail = compte.modeReportANouveau === 'DETAIL';
    const parExercice = new Map<string, typeof nonLettrees>();
    for (const l of nonLettrees) {
      const cle = auDetail ? l.ecriture.exerciceId : 'compte';
      const lot = parExercice.get(cle);
      if (lot) lot.push(l);
      else parExercice.set(cle, [l]);
    }
    const parPiece: string[][] = [];
    const parMontant: string[][] = [];
    for (const lot of parExercice.values()) {
      const r = this.proposerDansUnExercice(lot, LIMITE_LIGNES_SUBSET_SUM, LIMITE_LIGNES_PARTITION);
      parPiece.push(...r.parPiece);
      parMontant.push(...r.parMontant);
    }
    return { parPiece, parMontant, lignes: nonLettrees };
  }

  /** Les quatre passes, sur les lignes non lettrées d'UN exercice. */
  private proposerDansUnExercice(
    nonLettrees: Array<{ id: string; debit: Prisma.Decimal; credit: Prisma.Decimal; ecriture: { reference: string | null } }>,
    LIMITE_LIGNES_SUBSET_SUM: number,
    LIMITE_LIGNES_PARTITION: number,
  ): { parPiece: string[][]; parMontant: string[][] } {
    // Ce qui compte pour le lettrage est l'EFFET NET d'une ligne sur le
    // compte, pas la colonne dans laquelle elle est écrite. Sur toutes les
    // lignes ordinaires (un seul côté servi) le résultat est identique ; la
    // différence apparaît sur une correction par inscription en négatif
    // (art. 20 de l'AUDCIF), qui porte un débit négatif : économiquement
    // c'est un crédit, et l'ancienne lecture `> 0` l'écartait des DEUX côtés,
    // si bien qu'une facture annulée et son annulation ne pouvaient jamais se
    // solder l'une l'autre.
    const net = (l: { debit: Prisma.Decimal; credit: Prisma.Decimal }) => Number(l.debit) - Number(l.credit);
    let debitsRestants = nonLettrees
      .filter((l) => net(l) > EPSILON)
      .map((l) => ({ id: l.id, montant: net(l) }));
    let creditsRestants = nonLettrees
      .filter((l) => net(l) < -EPSILON)
      .map((l) => ({ id: l.id, montant: -net(l) }));

    // Passe 0 · appariement a priori par référence de pièce, sur toutes les
    // lignes non nulles. Elle consomme des lignes avant que les passes par
    // montant ne s'en emparent : un rapprochement fondé sur une référence
    // saisie prime sur une coïncidence de montants.
    const toutesNonNulles = nonLettrees
      .filter((l) => Math.abs(net(l)) > EPSILON)
      .map((l) => ({ id: l.id, reference: l.ecriture.reference, net: net(l) }));
    const parPiece = this.apparierParReference(toutesNonNulles);
    debitsRestants = debitsRestants.filter((d) => parPiece.restantes.has(d.id));
    creditsRestants = creditsRestants.filter((c) => parPiece.restantes.has(c.id));

    const groupes: string[][] = [];

    // 1) Paires exactes 1-pour-1
    for (const debit of [...debitsRestants]) {
      const idx = creditsRestants.findIndex((c) => Math.abs(c.montant - debit.montant) <= EPSILON);
      if (idx !== -1) {
        const [credit] = creditsRestants.splice(idx, 1);
        debitsRestants = debitsRestants.filter((d) => d.id !== debit.id);
        groupes.push([debit.id, credit.id]);
      }
    }

    // 2) N débits pour 1 crédit
    if (debitsRestants.length <= LIMITE_LIGNES_SUBSET_SUM) {
      for (const credit of [...creditsRestants]) {
        const sousEnsemble = this.trouverSousEnsemble(debitsRestants, credit.montant);
        if (sousEnsemble) {
          groupes.push([credit.id, ...sousEnsemble]);
          debitsRestants = debitsRestants.filter((d) => !sousEnsemble.includes(d.id));
          creditsRestants = creditsRestants.filter((c) => c.id !== credit.id);
        }
      }
    }

    // 3) N crédits pour 1 débit
    if (creditsRestants.length <= LIMITE_LIGNES_SUBSET_SUM) {
      for (const debit of [...debitsRestants]) {
        const sousEnsemble = this.trouverSousEnsemble(creditsRestants, debit.montant);
        if (sousEnsemble) {
          groupes.push([debit.id, ...sousEnsemble]);
          creditsRestants = creditsRestants.filter((c) => !sousEnsemble.includes(c.id));
          debitsRestants = debitsRestants.filter((d) => d.id !== debit.id);
        }
      }
    }

    // 4) N pour M · partition générale sur ce qui reste, en boucle tant
    // qu'un match existe (chaque match retire des lignes des deux pools).
    while (
      debitsRestants.length >= 2 &&
      creditsRestants.length >= 2 &&
      debitsRestants.length <= LIMITE_LIGNES_PARTITION &&
      creditsRestants.length <= LIMITE_LIGNES_PARTITION
    ) {
      const partition = this.trouverPartitionGenerale(debitsRestants, creditsRestants);
      if (!partition) break;
      groupes.push([...partition.debits, ...partition.credits]);
      debitsRestants = debitsRestants.filter((d) => !partition.debits.includes(d.id));
      creditsRestants = creditsRestants.filter((c) => !partition.credits.includes(c.id));
    }

    return { parPiece: parPiece.groupes, parMontant: groupes };
  }

  /**
   * PRÉ-LETTRAGE · la même recherche, mais elle PROPOSE au lieu de poser.
   *
   * Le lettrage automatique écrit directement, et le schéma dit pourtant de
   * lui-même ce qu'il vaut : « un rapprochement par montant est une PRÉSOMPTION
   * DU LOGICIEL » (voir `OrigineLettrage`). Deux montants égaux ne prouvent pas
   * qu'une facture a été réglée par ce virement-là · ils prouvent qu'ils sont
   * égaux. Sur un compte fournisseur où trois factures portent le même montant
   * mensuel, la présomption se trompe une fois sur trois et le lettrage part
   * quand même.
   *
   * Le pré-lettrage rend la présomption à qui peut la trancher : « l'une
   * propose, l'autre confirme ». C'est la même division du travail que le
   * double regard à la validation (§ 10 ter), et pour la même raison · le
   * logiciel voit une coïncidence, le comptable connaît l'opération.
   *
   * IL N'EST PAS STOCKÉ, ET C'EST UN CHOIX. Une proposition rangée en base
   * réserverait ses lignes (`lettrageId` servi les sort du réappariement) sans
   * être un lettrage, et surtout elle PÉRIMERAIT : la première écriture passée
   * sur le compte change la scène, et confirmer une proposition d'hier
   * lettrerait des lignes contre une image qui n'existe plus. Recalculée à
   * chaque appel, elle ne peut pas être périmée · le second utilisateur relance
   * la recherche et voit exactement ce que le premier a vu, ou voit qu'elle a
   * changé.
   *
   * L'ORIGINE PROPOSÉE EST CONSERVÉE À LA CONFIRMATION, et ce n'est pas un
   * détail. Elle dit COMMENT le rapprochement a été trouvé, pas qui l'a béni :
   * un groupe issu d'une coïncidence de montants reste `AUTOMATIQUE_MONTANT`
   * même confirmé à la main, sinon la piste d'audit affirmerait qu'un humain a
   * apparié ces lignes une par une.
   */
  async preLettrage(tenantId: string, compteId: string) {
    const compte = await this.trouverCompteLettrable(tenantId, compteId);
    const { parPiece, parMontant, lignes } = await this.calculerPropositions(tenantId, compte);

    const parId = new Map(lignes.map((l) => [l.id, l]));
    const decrire = (ligneIds: string[], origine: OrigineLettrage) => {
      const detail = ligneIds
        .map((id) => parId.get(id))
        .filter((l): l is (typeof lignes)[number] => Boolean(l))
        .map((l) => ({
          ligneId: l.id,
          date: l.ecriture.date.toISOString().slice(0, 10),
          libelle: l.libelle ?? '',
          reference: l.ecriture.reference ?? '',
          debit: Number(l.debit),
          credit: Number(l.credit),
        }));
      return {
        origine,
        ligneIds,
        lignes: detail,
        montant: detail.reduce((t, l) => t + l.debit, 0),
        // Le solde est RENDU alors qu'il vaut zéro par construction · c'est
        // lui que la confirmation revérifie, et l'afficher permet au lecteur
        // de faire le même contrôle que le serveur.
        solde: detail.reduce((t, l) => t + l.debit - l.credit, 0),
      };
    };

    return {
      propositions: [
        ...parPiece.map((g) => decrire(g, OrigineLettrage.AUTOMATIQUE_PIECE)),
        ...parMontant.map((g) => decrire(g, OrigineLettrage.AUTOMATIQUE_MONTANT)),
      ],
      // Ce que le logiciel N'A PAS su rapprocher · c'est la moitié utile de
      // l'état. Un pré-lettrage qui ne montrerait que ses trouvailles
      // laisserait croire que le reste est rapproché.
      nonProposees: lignes.filter(
        (l) => ![...parPiece, ...parMontant].flat().includes(l.id),
      ).length,
      avertissement:
        "Un rapprochement par MONTANT est une présomption du logiciel : deux sommes égales ne prouvent pas qu'elles se soldent l'une l'autre. Un rapprochement par RÉFÉRENCE DE PIÈCE s'appuie sur une donnée saisie par un humain. Rien n'est écrit tant que vous n'avez pas confirmé.",
    };
  }

  /**
   * CONFIRMATION D'UN PRÉ-LETTRAGE · elle ne fait JAMAIS confiance à ce que le
   * client renvoie.
   *
   * Le client rejoue les groupes qu'il a acceptés. Rien n'empêcherait d'y
   * glisser une autre composition · le serveur revérifie donc tout, exactement
   * comme si la sélection venait d'un clic manuel :
   *
   *  · les lignes appartiennent au compte et au dossier, et ne sont pas déjà
   *    rattachées à un groupe (contrôle commun `verifierLignes`) ;
   *  · le groupe SOLDE À ZÉRO. Les quatre passes ne proposent que des sommes
   *    exactement égales : un groupe confirmé qui ne solde pas ne vient pas
   *    d'une proposition, et l'accepter poserait un lettrage PARTIEL sous une
   *    origine automatique, c'est-à-dire une présomption du logiciel sur une
   *    opération que le logiciel n'a jamais proposée ;
   *  · l'origine est l'une des DEUX automatiques. Un groupe composé à la main
   *    passe par `lettrerManuel`, qui porte son origine propre.
   */
  async confirmerPreLettrage(
    tenantId: string,
    compteId: string,
    userId: string,
    groupes: Array<{ ligneIds: string[]; origine: OrigineLettrage }>,
  ) {
    const compte = await this.trouverCompteLettrable(tenantId, compteId);
    if (groupes.length === 0) {
      throw new BadRequestException('Aucun groupe à confirmer.');
    }
    for (const g of groupes) {
      if (g.origine === OrigineLettrage.MANUEL) {
        throw new BadRequestException(
          "Un groupe composé à la main se pose par le lettrage manuel, qui porte son origine propre. La confirmation d'un pré-lettrage conserve l'origine de la passe qui l'a trouvé.",
        );
      }
      if (g.ligneIds.length < 2) {
        throw new BadRequestException('Un groupe de lettrage porte au moins deux lignes.');
      }
    }

    return avecRetrySerialisable(
      this.prisma,
      async (tx) => {
        const lettres: string[] = [];
        const prochaine = await this.lettresDuLot(tx, tenantId, compteId);
        for (const g of groupes) {
          const lignes = await tx.ligneEcriture.findMany({
            where: { id: { in: g.ligneIds } },
            include: { ecriture: { select: { tenantId: true, date: true, exerciceId: true } } },
          });
          this.verifierLignes(lignes, { compteId, tenantId, nombre: g.ligneIds.length });
          // Au Détail, le pré-lettrage ne propose qu'à l'intérieur d'un
          // exercice ; un groupe renvoyé qui en mêle deux ne vient pas de lui.
          const aCheval = motifLettrageADeuxExercices(lignes, compte);
          if (aCheval) throw new BadRequestException(aCheval);
          // Une clôture peut être intervenue entre la proposition et la
          // confirmation · la proposition ne se croit pas, elle se rejoue.
          await refuserSiLignesFigees(tx, tenantId, g.ligneIds, 'lettrer');
          const solde = lignes.reduce((t, l) => t + Number(l.debit) - Number(l.credit), 0);
          if (Math.abs(solde) > EPSILON) {
            throw new BadRequestException(
              `Ce groupe ne solde pas (écart de ${solde.toFixed(2)}). Les propositions du pré-lettrage sont toujours soldées : un groupe qui ne l'est pas n'en vient pas, et se pose par le lettrage manuel.`,
            );
          }
          const groupe = await this.creerGroupe(tx, {
            tenantId,
            compteId,
            ligneIds: g.ligneIds,
            origine: g.origine,
            userId,
          }, prochaine);
          lettres.push(groupe.code);
        }
        return { groupes: groupes.length, lettres };
      },
      'Trop de lettrages effectués au même instant sur ce compte · veuillez réessayer.',
      { operations: groupes.length },
    );
  }

  async lettrageAutomatique(tenantId: string, compteId: string, userId: string) {
    const compte = await this.trouverCompteLettrable(tenantId, compteId);
    const { parPiece, parMontant } = await this.calculerPropositions(tenantId, compte);
    const parPieceGroupes = parPiece;
    const groupes = parMontant;

    if (groupes.length === 0 && parPieceGroupes.length === 0) {
      return { groupes: 0, parPiece: 0, parMontant: 0, lettres: [] };
    }

    return avecRetrySerialisable(
      this.prisma,
      async (tx) => {
        const lettres: string[] = [];
        const prochaine = await this.lettresDuLot(tx, tenantId, compteId);
        // L'origine est tracée par passe : un groupe issu de la référence de
        // pièce n'a pas la même valeur probante qu'un groupe issu d'une
        // coïncidence de montants, et un auditeur doit pouvoir les
        // distinguer.
        for (const [origine, lots] of [
          [OrigineLettrage.AUTOMATIQUE_PIECE, parPieceGroupes],
          [OrigineLettrage.AUTOMATIQUE_MONTANT, groupes],
        ] as const) {
          for (const ligneIds of lots) {
            const groupe = await this.creerGroupe(tx, { tenantId, compteId, ligneIds, origine, userId }, prochaine);
            lettres.push(groupe.code);
          }
        }
        return {
          groupes: parPieceGroupes.length + groupes.length,
          parPiece: parPieceGroupes.length,
          parMontant: groupes.length,
          lettres,
        };
      },
      'Trop de lettrages effectués au même instant sur ce compte · veuillez réessayer.',
      { operations: parPieceGroupes.length + groupes.length },
    );
  }
}
