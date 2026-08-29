import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { OrigineLettrage, Prisma, StatutLettrage } from '@prisma/client';
import { avecRetrySerialisable } from '../../common/prisma-retry.util';

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
 * AUCUN CONTRÔLE DE CLÔTURE ICI, ET C'EST VOULU. Ce service ne consulte
 * jamais le statut de l'exercice, là où EcritureService refuse toute création,
 * modification ou suppression sur un exercice CLOTURE. Le même cours l'écrit
 * noir sur blanc (§ 2.3, clôture informatique) :
 *
 *   « La clôture interdit : l'ajout d'écriture, la modification de tous les
 *   composants des écritures comptables, la suppression d'une écriture
 *   comptable. La clôture AUTORISE : le lettrage et le pointage, la
 *   consultation et l'édition. »
 *
 * Lettrer ne modifie aucun montant, aucune date, aucune imputation : cela
 * rattache des lignes entre elles. Un règlement de mars qui solde une facture
 * de décembre doit pouvoir être lettré même si l'exercice précédent est clos,
 * sans quoi le compte de tiers ne se justifie plus jamais. Voir
 * docs/organisation-comptable-cpcc.md § 3.
 */
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
    const [lignes, lettrages] = await Promise.all([
      this.prisma.ligneEcriture.findMany({
        where: {
          compteId,
          ecriture: { tenantId },
          ...(nonLettreesSeulement ? { lettre: null } : {}),
        },
        include: { ecriture: { include: { journal: true } }, lettrage: true, devise: true },
        orderBy: { ecriture: { date: 'asc' } },
      }),
      this.prisma.lettrage.findMany({ where: { compteId, tenantId }, orderBy: { createdAt: 'asc' } }),
    ]);

    return {
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
  private async prochaineLettre(tx: Prisma.TransactionClient, compteId: string): Promise<string> {
    const [groupes, lignes] = await Promise.all([
      tx.lettrage.findMany({ where: { compteId }, select: { code: true } }),
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
   * ÉCART DE CHANGE RÉALISÉ · « le lettrage facilite, pour les opérations en
   * monnaies étrangères dénouées, le calcul des différences de change
   * réalisées » (CPCC, ch. 6).
   *
   * Le calcul porte sur les seules lignes PORTANT UNE DEVISE, et non sur tout
   * le groupe. C'est essentiel : dans un dénouement en devise, la facture et
   * son règlement ne s'équilibrent justement PAS en monnaie de tenue, et
   * c'est une troisième ligne, l'écriture d'écart de change (676 ou 776), qui
   * ramène le groupe à zéro. Exiger que toutes les lignes portent une devise
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
    params: { tenantId: string; compteId: string; ligneIds: string[]; origine: OrigineLettrage; userId: string },
  ) {
    const lignes = await tx.ligneEcriture.findMany({
      where: { id: { in: params.ligneIds } },
      select: { id: true, debit: true, credit: true, deviseId: true, montantDevise: true },
    });
    const solde = lignes.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);
    const soldeNul = Math.abs(solde) <= EPSILON;
    const statut = soldeNul ? StatutLettrage.SOLDE : StatutLettrage.PARTIEL;
    const code = await this.prochaineLettre(tx, params.compteId);

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
        ecartChange: soldeNul ? this.ecartChangeRealise(lignes) : null,
      },
    });
    await tx.ligneEcriture.updateMany({
      where: { id: { in: params.ligneIds } },
      // `lettre` n'est servie QUE si le groupe est soldé · voir le
      // commentaire de LigneEcriture.lettre dans le schéma.
      data: { lettrageId: groupe.id, lettre: soldeNul ? code : null },
    });
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
    options: { autoriserPartiel?: boolean } = {},
  ) {
    await this.trouverCompteLettrable(tenantId, compteId);

    return avecRetrySerialisable(
      this.prisma,
      async (tx) => {
        const lignes = await tx.ligneEcriture.findMany({
          where: { id: { in: ligneIds } },
          include: { ecriture: true },
        });
        this.verifierLignes(lignes, { compteId, tenantId, nombre: ligneIds.length });
        // Pas de contrôle de clôture d'exercice ici, volontairement : le
        // lettrage porte sur des lignes déjà enregistrées (il ne modifie ni
        // montant ni compte), et reste possible après une clôture partielle
        // · même règle que chez Sage ("le lettrage... pourront tout de même
        // être effectués" après une clôture partielle).

        const solde = lignes.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);
        if (Math.abs(solde) > EPSILON && !options.autoriserPartiel) {
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
   */
  async completer(tenantId: string, lettrageId: string, ligneIds: string[]) {
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
            ecartChange: soldeNul ? this.ecartChangeRealise(toutes) : null,
          },
        });
        if (soldeNul) {
          await tx.ligneEcriture.updateMany({ where: { lettrageId }, data: { lettre: groupe.code } });
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
      const { count } = await this.prisma.ligneEcriture.updateMany({
        where: { lettrageId: groupe.id },
        data: { lettre: null, lettrageId: null },
      });
      await this.prisma.lettrage.delete({ where: { id: groupe.id } });
      return { lettre: groupe.code, nombreLignes: count };
    }

    // Aucun groupe : dossier dont un lettrage n'aurait pas été repris par la
    // migration. On retombe sur l'ancien chemin plutôt que de refuser.
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
  async lettrageAutomatique(tenantId: string, compteId: string, userId: string) {
    await this.trouverCompteLettrable(tenantId, compteId);

    const LIMITE_LIGNES_SUBSET_SUM = 25;
    const LIMITE_LIGNES_PARTITION = 16;

    // `lettrageId: null` et non `lettre: null` : une ligne déjà rattachée à un
    // groupe PARTIEL ne porte pas de lettre mais ne doit pas être réappariée
    // ailleurs. Elle se solde en complétant son groupe (voir `completer`).
    const nonLettrees = await this.prisma.ligneEcriture.findMany({
      where: { compteId, lettrageId: null, ecriture: { tenantId } },
      include: { ecriture: { select: { reference: true } } },
      orderBy: { ecriture: { date: 'asc' } },
    });

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

    if (groupes.length === 0 && parPiece.groupes.length === 0) {
      return { groupes: 0, parPiece: 0, parMontant: 0, lettres: [] };
    }

    return avecRetrySerialisable(
      this.prisma,
      async (tx) => {
        const lettres: string[] = [];
        // L'origine est tracée par passe : un groupe issu de la référence de
        // pièce n'a pas la même valeur probante qu'un groupe issu d'une
        // coïncidence de montants, et un auditeur doit pouvoir les
        // distinguer.
        for (const [origine, lots] of [
          [OrigineLettrage.AUTOMATIQUE_PIECE, parPiece.groupes],
          [OrigineLettrage.AUTOMATIQUE_MONTANT, groupes],
        ] as const) {
          for (const ligneIds of lots) {
            const groupe = await this.creerGroupe(tx, { tenantId, compteId, ligneIds, origine, userId });
            lettres.push(groupe.code);
          }
        }
        return {
          groupes: parPiece.groupes.length + groupes.length,
          parPiece: parPiece.groupes.length,
          parMontant: groupes.length,
          lettres,
        };
      },
      'Trop de lettrages effectués au même instant sur ce compte · veuillez réessayer.',
    );
  }
}
